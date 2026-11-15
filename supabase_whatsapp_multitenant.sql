-- ============================================================================
-- GANADERO AD - MIGRACIÓN OFICIAL SUPABASE (PROYECTO "ganadero")
-- WhatsApp Cloud API v25.0 Multitenant: Acceso Multi-Empresa y Multi-Finca
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 0. Sincronizar empresas del directorio del sistema (si existen en operaciones_diarias)
--    para garantizar consistencia de catálogos en la base central.
DO $$
DECLARE
    v_emp jsonb;
BEGIN
    IF to_regclass('public.operaciones_diarias') IS NOT NULL AND to_regclass('public.empresas') IS NOT NULL THEN
        FOR v_emp IN
            SELECT jsonb_array_elements(detalles->'empresas')
            FROM public.operaciones_diarias
            WHERE id = 'SYS_DIRECTORIO_EMPRESAS'
              AND jsonb_typeof(detalles->'empresas') = 'array'
        LOOP
            IF (v_emp->>'id') IS NOT NULL AND (v_emp->>'nombre') IS NOT NULL THEN
                INSERT INTO public.empresas (id, nit, nombre, pais, moneda, activa)
                VALUES (
                    v_emp->>'id',
                    COALESCE(NULLIF(trim(v_emp->>'nit'), ''), 'NIT-' || (v_emp->>'id')),
                    v_emp->>'nombre',
                    COALESCE(v_emp->>'pais', 'Colombia'),
                    COALESCE(v_emp->>'moneda', 'COP'),
                    COALESCE((v_emp->>'activa')::boolean, true)
                )
                ON CONFLICT (id) DO NOTHING;
            END IF;
        END LOOP;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- ============================================================================
-- FUNCIÓN ÚNICA DE NORMALIZACIÓN DE TELÉFONO EN SQL
-- Quita '+', espacios, guiones y paréntesis; si tiene 10 dígitos y empieza por 3, antepone 57.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.normalizar_telefono_wa(p_telefono text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_limpio text;
BEGIN
    v_limpio := regexp_replace(COALESCE(p_telefono, ''), '[^0-9]', '', 'g');
    IF length(v_limpio) = 10 AND left(v_limpio, 1) = '3' THEN
        v_limpio := '57' || v_limpio;
    END IF;
    RETURN v_limpio;
END;
$$;

-- ============================================================================
-- 1. TABLAS EN SUPABASE (MISMO TIPO TEXT QUE empresas.id Y fincas.id)
-- ============================================================================

-- a) whatsapp_channels
CREATE TABLE IF NOT EXISTS public.whatsapp_channels (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    phone_number_id TEXT UNIQUE NOT NULL,
    waba_id TEXT,
    display_phone_number TEXT,
    nombre TEXT NOT NULL DEFAULT 'Canal Compartido Ganadero AD',
    tipo TEXT NOT NULL DEFAULT 'compartido' CHECK (tipo IN ('compartido', 'dedicado')),
    empresa_id TEXT NULL,
    access_token_override TEXT NULL,
    template_name TEXT DEFAULT 'notificacion_ganadero_ad',
    template_lang TEXT DEFAULT 'es',
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_whatsapp_channels_tipo_empresa CHECK (
        (tipo = 'compartido' AND empresa_id IS NULL) OR
        (tipo = 'dedicado' AND empresa_id IS NOT NULL)
    )
);

-- Insertar el canal compartido oficial
INSERT INTO public.whatsapp_channels (
    id, phone_number_id, waba_id, display_phone_number, nombre,
    tipo, empresa_id, template_name, template_lang, activo
)
VALUES (
    'CH-SHARED-DEFAULT',
    '111443548633291',
    '118927644541032',
    '+57 322 5694112',
    'Canal Compartido Ganadero AD',
    'compartido',
    NULL,
    'notificacion_ganadero_ad',
    'es',
    true
)
ON CONFLICT (phone_number_id) DO UPDATE SET
    waba_id = EXCLUDED.waba_id,
    display_phone_number = EXCLUDED.display_phone_number,
    tipo = 'compartido',
    empresa_id = NULL,
    template_name = COALESCE(public.whatsapp_channels.template_name, EXCLUDED.template_name),
    template_lang = COALESCE(public.whatsapp_channels.template_lang, EXCLUDED.template_lang),
    activo = true;

-- Eliminar índice antiguo "un número solo puede estar activo en una empresa" si existiera
DROP INDEX IF EXISTS public.uq_whatsapp_contacts_telefono_activo;
DROP INDEX IF EXISTS public.idx_whatsapp_contacts_empresa_id;

-- b) whatsapp_contacts (la PERSONA, una sola vez)
CREATE TABLE IF NOT EXISTS public.whatsapp_contacts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    telefono TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- c) whatsapp_contact_access (los PERMISOS multi-empresa y multi-finca)
CREATE TABLE IF NOT EXISTS public.whatsapp_contact_access (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    contact_id TEXT NOT NULL REFERENCES public.whatsapp_contacts(id) ON DELETE CASCADE,
    empresa_id TEXT NOT NULL,
    finca_id TEXT NULL,
    rol TEXT NOT NULL DEFAULT 'operador' CHECK (rol IN ('operador', 'administrador', 'veterinario')),
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_whatsapp_contact_access UNIQUE (contact_id, empresa_id, finca_id)
);

-- Garantizar unicidad también cuando finca_id IS NULL (todas las fincas de esa empresa)
CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_contact_access_empresa_todas
    ON public.whatsapp_contact_access (contact_id, empresa_id)
    WHERE finca_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_contact_access_contact_id
    ON public.whatsapp_contact_access (contact_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contact_access_empresa_id
    ON public.whatsapp_contact_access (empresa_id);

-- Si existía una versión previa de whatsapp_contacts con columna empresa_id, migrarla limpiamente
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'whatsapp_contacts' AND column_name = 'empresa_id'
    ) THEN
        ALTER TABLE public.whatsapp_contacts DROP COLUMN IF EXISTS empresa_id CASCADE;
        ALTER TABLE public.whatsapp_contacts DROP COLUMN IF EXISTS finca_id CASCADE;
        ALTER TABLE public.whatsapp_contacts DROP COLUMN IF EXISTS rol CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.whatsapp_contacts'::regclass AND contype = 'u'
    ) THEN
        ALTER TABLE public.whatsapp_contacts ADD CONSTRAINT whatsapp_contacts_telefono_key UNIQUE (telefono);
    END IF;
END $$;

-- d) whatsapp_sessions (SOLO ventana de 24h; sin empresa ni finca activa)
CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
    channel_id TEXT NOT NULL REFERENCES public.whatsapp_channels(id) ON DELETE CASCADE,
    telefono TEXT NOT NULL,
    last_inbound_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (channel_id, telefono)
);

ALTER TABLE public.whatsapp_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
DROP INDEX IF EXISTS public.idx_whatsapp_sessions_empresa;
ALTER TABLE public.whatsapp_sessions DROP COLUMN IF EXISTS empresa_id CASCADE;
ALTER TABLE public.whatsapp_sessions DROP COLUMN IF EXISTS finca_id CASCADE;

-- e) whatsapp_messages_log
CREATE TABLE IF NOT EXISTS public.whatsapp_messages_log (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    empresa_id TEXT NULL,
    channel_id TEXT REFERENCES public.whatsapp_channels(id) ON DELETE SET NULL,
    telefono TEXT NOT NULL,
    direccion TEXT NOT NULL CHECK (direccion IN ('in', 'out')),
    tipo TEXT NOT NULL DEFAULT 'text' CHECK (tipo IN ('text', 'template')),
    wamid TEXT,
    contenido_resumen TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_log_empresa_fecha
    ON public.whatsapp_messages_log (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_log_wamid
    ON public.whatsapp_messages_log (wamid);

-- f) whatsapp_message_status
CREATE TABLE IF NOT EXISTS public.whatsapp_message_status (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    empresa_id TEXT NULL,
    channel_id TEXT REFERENCES public.whatsapp_channels(id) ON DELETE SET NULL,
    wamid TEXT NOT NULL,
    recipient_id TEXT,
    status TEXT NOT NULL,
    error_code TEXT,
    error_title TEXT,
    error_details TEXT,
    timestamp TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_status_empresa_fecha
    ON public.whatsapp_message_status (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_status_wamid
    ON public.whatsapp_message_status (wamid);

-- ============================================================================
-- 2. MIGRACIÓN INICIAL DE CONTACTO: SANDY LARA (573017839578 -> INVERSIONES)
-- ============================================================================
DO $$
DECLARE
    v_contact_id TEXT;
    v_empresa_inv_id TEXT;
BEGIN
    SELECT id INTO v_empresa_inv_id
    FROM public.empresas
    WHERE upper(trim(nombre)) = 'INVERSIONES'
    LIMIT 1;

    IF v_empresa_inv_id IS NULL THEN
        v_empresa_inv_id := 'EMP-01';
    END IF;

    INSERT INTO public.whatsapp_contacts (id, telefono, nombre, activo)
    VALUES ('WAC-SANDY-LARA', '573017839578', 'Sandy Lara', true)
    ON CONFLICT (telefono) DO UPDATE SET
        nombre = EXCLUDED.nombre,
        activo = true
    RETURNING id INTO v_contact_id;

    IF NOT EXISTS (
        SELECT 1 FROM public.whatsapp_contact_access
        WHERE contact_id = v_contact_id
          AND empresa_id = v_empresa_inv_id
          AND finca_id IS NULL
    ) THEN
        INSERT INTO public.whatsapp_contact_access (
            id, contact_id, empresa_id, finca_id, rol, activo
        )
        VALUES (
            'WCA-SANDY-INVERSIONES',
            v_contact_id,
            v_empresa_inv_id,
            NULL,
            'operador',
            true
        );
    END IF;
END $$;

-- ============================================================================
-- 3. FUNCIONES AUXILIARES DE SEGURIDAD Y RLS MULTITENANT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.wa_es_superadmin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_headers jsonb;
    v_rol_header text;
    v_usuario_header text;
    v_token text;
    v_sesion_rol text;
BEGIN
    IF current_user = 'service_role' THEN
        RETURN true;
    END IF;

    BEGIN
        IF auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'superadmin' THEN
            RETURN true;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    BEGIN
        v_headers := current_setting('request.headers', true)::jsonb;
    EXCEPTION WHEN OTHERS THEN
        v_headers := NULL;
    END;

    IF v_headers IS NULL THEN
        RETURN false;
    END IF;

    v_rol_header := lower(trim(COALESCE(v_headers->>'x-ganadero-rol', '')));
    v_usuario_header := lower(trim(COALESCE(v_headers->>'x-ganadero-usuario', '')));

    IF to_regclass('public.sesiones') IS NOT NULL THEN
        v_token := trim(COALESCE(v_headers->>'x-session-token', ''));
        IF v_token <> '' THEN
            EXECUTE 'SELECT rol FROM public.sesiones WHERE token = $1 AND expira_en > now() LIMIT 1'
            INTO v_sesion_rol
            USING v_token;
            IF v_sesion_rol = 'superadmin' AND (v_rol_header = '' OR v_rol_header = 'superadmin') THEN
                RETURN true;
            END IF;
        END IF;
    END IF;

    IF v_rol_header = 'superadmin' AND v_usuario_header <> '' AND to_regclass('public.usuarios') IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.usuarios u
            WHERE lower(trim(u.usuario)) = v_usuario_header
              AND lower(trim(u.rol)) = 'superadmin'
              AND u.activo = true
        ) THEN
            RETURN true;
        END IF;
    END IF;

    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_empresa_sesion()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_headers jsonb;
    v_empresa_header text;
    v_usuario_header text;
    v_jwt_empresa text;
    v_token text;
    v_sesion_empresa text;
BEGIN
    BEGIN
        v_jwt_empresa := trim(COALESCE(auth.jwt() ->> 'empresa_id', ''));
        IF v_jwt_empresa <> '' THEN
            RETURN v_jwt_empresa;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    BEGIN
        v_headers := current_setting('request.headers', true)::jsonb;
    EXCEPTION WHEN OTHERS THEN
        v_headers := NULL;
    END;

    IF v_headers IS NULL THEN
        RETURN NULL;
    END IF;

    IF to_regclass('public.sesiones') IS NOT NULL THEN
        v_token := trim(COALESCE(v_headers->>'x-session-token', ''));
        IF v_token <> '' THEN
            EXECUTE 'SELECT empresa_id FROM public.sesiones WHERE token = $1 AND expira_en > now() LIMIT 1'
            INTO v_sesion_empresa
            USING v_token;
            IF v_sesion_empresa IS NOT NULL AND trim(v_sesion_empresa) <> '' THEN
                RETURN trim(v_sesion_empresa);
            END IF;
        END IF;
    END IF;

    v_empresa_header := trim(COALESCE(v_headers->>'x-empresa-id', ''));
    v_usuario_header := lower(trim(COALESCE(v_headers->>'x-ganadero-usuario', '')));

    IF v_empresa_header <> '' AND lower(v_empresa_header) NOT IN ('todas', 'superadmin') THEN
        IF v_usuario_header <> '' AND to_regclass('public.usuarios') IS NOT NULL THEN
            IF EXISTS (
                SELECT 1 FROM public.usuarios u
                WHERE lower(trim(u.usuario)) = v_usuario_header
                  AND u.activo = true
                  AND (
                      lower(trim(u.rol)) = 'superadmin'
                      OR u.empresa_id = v_empresa_header
                      OR (
                          u.empresa_id IS NULL
                          AND to_regclass('public.operaciones_diarias') IS NOT NULL
                          AND EXISTS (
                              SELECT 1 FROM public.operaciones_diarias od
                              WHERE od.id = 'SYS_DIRECTORIO_EMPRESAS'
                                AND (od.detalles->'usuariosEmpresaMap'->>u.usuario) = v_empresa_header
                          )
                      )
                  )
            ) THEN
                RETURN v_empresa_header;
            END IF;
        END IF;

        IF to_regclass('public.empresas') IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.empresas e WHERE e.id = v_empresa_header AND e.activa = true
        ) THEN
            RETURN v_empresa_header;
        END IF;

        IF to_regclass('public.operaciones_diarias') IS NOT NULL AND EXISTS (
            SELECT 1
            FROM public.operaciones_diarias od,
                 jsonb_array_elements(od.detalles->'empresas') emp
            WHERE od.id = 'SYS_DIRECTORIO_EMPRESAS'
              AND (emp->>'id') = v_empresa_header
        ) THEN
            RETURN v_empresa_header;
        END IF;
    END IF;

    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_contacto_tiene_acceso_empresa(p_contact_id text, p_empresa_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.whatsapp_contact_access a
        WHERE a.contact_id = p_contact_id
          AND a.empresa_id = p_empresa_id
    );
$$;

-- ============================================================================
-- 4. RPC SEGUROS PARA EL PANEL (PERMITEN AGREGAR UN TELÉFONO EXISTENTE EN OTRA
--    EMPRESA SIN EXPONER NI MODIFICAR PERMISOS DE OTRAS EMPRESAS)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_whatsapp_guardar_contacto(
    p_telefono text,
    p_nombre text,
    p_activo boolean DEFAULT true,
    p_accesos jsonb DEFAULT '[]'::jsonb,
    p_modo_superadmin boolean DEFAULT false,
    p_contact_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_es_super boolean := public.wa_es_superadmin();
    v_emp_sesion text := public.wa_empresa_sesion();
    v_tel text := public.normalizar_telefono_wa(p_telefono);
    v_nombre text := trim(COALESCE(p_nombre, ''));
    v_cid text;
    v_item jsonb;
    v_emp_item text;
    v_finca_item text;
    v_rol_item text;
    v_activo_item boolean;
BEGIN
    IF NOT v_es_super AND v_emp_sesion IS NULL THEN
        RAISE EXCEPTION 'No autorizado para gestionar contactos de WhatsApp.';
    END IF;

    IF length(v_tel) < 8 THEN
        RAISE EXCEPTION 'Teléfono inválido: debe contener al menos 8 dígitos en formato E.164 (ej: 573017839578).';
    END IF;

    -- Validar que nunca se registre el número propio de un canal
    IF EXISTS (
        SELECT 1 FROM public.whatsapp_channels ch
        WHERE public.normalizar_telefono_wa(ch.display_phone_number) = v_tel
           OR ch.phone_number_id = v_tel
    ) THEN
        RAISE EXCEPTION 'No puedes registrar el número del propio canal de WhatsApp como contacto.';
    END IF;

    IF v_nombre = '' THEN
        v_nombre := 'Operador Autorizado';
    END IF;

    -- Buscar si la persona ya existe por id o por teléfono
    IF p_contact_id IS NOT NULL AND trim(p_contact_id) <> '' THEN
        SELECT id INTO v_cid FROM public.whatsapp_contacts WHERE id = trim(p_contact_id) LIMIT 1;
    END IF;

    IF v_cid IS NULL THEN
        SELECT id INTO v_cid FROM public.whatsapp_contacts WHERE telefono = v_tel LIMIT 1;
    END IF;

    IF v_cid IS NULL THEN
        v_cid := 'WAC-' || extract(epoch from now())::bigint::text || '-' || substr(md5(random()::text), 1, 6);
        INSERT INTO public.whatsapp_contacts (id, telefono, nombre, activo)
        VALUES (v_cid, v_tel, v_nombre, COALESCE(p_activo, true));
    ELSE
        IF v_es_super AND p_modo_superadmin THEN
            UPDATE public.whatsapp_contacts
            SET telefono = v_tel,
                nombre = v_nombre,
                activo = COALESCE(p_activo, activo)
            WHERE id = v_cid;
        ELSE
            -- Admin de empresa: si el contacto estaba inactivo globalmente no lo desactiva para otros;
            -- asegura activo = true y actualiza nombre solo si pertenece únicamente a su empresa o estaba vacío
            UPDATE public.whatsapp_contacts
            SET nombre = CASE
                    WHEN NOT EXISTS (
                        SELECT 1 FROM public.whatsapp_contact_access a
                        WHERE a.contact_id = v_cid AND a.empresa_id <> v_emp_sesion
                    ) THEN v_nombre
                    ELSE COALESCE(NULLIF(trim(nombre), ''), v_nombre)
                END,
                activo = true
            WHERE id = v_cid;
        END IF;
    END IF;

    -- Reemplazar permisos según rol
    IF v_es_super AND p_modo_superadmin THEN
        DELETE FROM public.whatsapp_contact_access WHERE contact_id = v_cid;
    ELSE
        IF v_emp_sesion IS NULL THEN
            RAISE EXCEPTION 'Debes seleccionar una empresa activa para asignar permisos.';
        END IF;
        DELETE FROM public.whatsapp_contact_access
        WHERE contact_id = v_cid AND empresa_id = v_emp_sesion;
    END IF;

    IF jsonb_typeof(p_accesos) = 'array' THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_accesos)
        LOOP
            v_emp_item := CASE
                WHEN v_es_super AND p_modo_superadmin THEN trim(COALESCE(v_item->>'empresa_id', ''))
                ELSE v_emp_sesion
            END;

            IF v_emp_item = '' OR v_emp_item IS NULL THEN
                CONTINUE;
            END IF;

            v_finca_item := NULLIF(trim(COALESCE(v_item->>'finca_id', '')), '');
            IF lower(COALESCE(v_finca_item, '')) IN ('null', 'todas', '*') THEN
                v_finca_item := NULL;
            END IF;

            v_rol_item := lower(trim(COALESCE(v_item->>'rol', 'operador')));
            IF v_rol_item NOT IN ('operador', 'administrador', 'veterinario') THEN
                v_rol_item := 'operador';
            END IF;

            v_activo_item := COALESCE((v_item->>'activo')::boolean, true);

            IF v_finca_item IS NULL THEN
                -- "Todas las fincas" reemplaza cualquier fila específica previa de esa misma empresa
                DELETE FROM public.whatsapp_contact_access
                WHERE contact_id = v_cid AND empresa_id = v_emp_item;

                INSERT INTO public.whatsapp_contact_access (id, contact_id, empresa_id, finca_id, rol, activo)
                VALUES (
                    'WCA-' || substr(md5(v_cid || v_emp_item || random()::text), 1, 12),
                    v_cid, v_emp_item, NULL, v_rol_item, v_activo_item
                );
            ELSE
                -- Solo insertar finca específica si no existe ya "todas" (finca_id IS NULL) para esa empresa
                IF NOT EXISTS (
                    SELECT 1 FROM public.whatsapp_contact_access
                    WHERE contact_id = v_cid AND empresa_id = v_emp_item AND finca_id IS NULL
                ) THEN
                    INSERT INTO public.whatsapp_contact_access (id, contact_id, empresa_id, finca_id, rol, activo)
                    VALUES (
                        'WCA-' || substr(md5(v_cid || v_emp_item || v_finca_item || random()::text), 1, 12),
                        v_cid, v_emp_item, v_finca_item, v_rol_item, v_activo_item
                    )
                    ON CONFLICT (contact_id, empresa_id, finca_id) DO UPDATE SET
                        rol = EXCLUDED.rol,
                        activo = EXCLUDED.activo;
                END IF;
            END IF;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'contact_id', v_cid,
        'telefono', v_tel,
        'nombre', v_nombre
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_whatsapp_cambiar_estado_contacto(
    p_contact_id text,
    p_activo boolean,
    p_empresa_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_es_super boolean := public.wa_es_superadmin();
    v_emp_sesion text := public.wa_empresa_sesion();
    v_target_emp text;
BEGIN
    IF NOT v_es_super AND v_emp_sesion IS NULL THEN
        RAISE EXCEPTION 'No autorizado.';
    END IF;

    IF v_es_super AND (p_empresa_id IS NULL OR trim(p_empresa_id) = '') THEN
        UPDATE public.whatsapp_contacts
        SET activo = COALESCE(p_activo, true)
        WHERE id = p_contact_id;
    ELSE
        v_target_emp := CASE WHEN v_es_super THEN trim(p_empresa_id) ELSE v_emp_sesion END;
        UPDATE public.whatsapp_contact_access
        SET activo = COALESCE(p_activo, true)
        WHERE contact_id = p_contact_id
          AND empresa_id = v_target_emp;
    END IF;

    RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_whatsapp_eliminar_contacto(
    p_contact_id text,
    p_empresa_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_es_super boolean := public.wa_es_superadmin();
    v_emp_sesion text := public.wa_empresa_sesion();
    v_target_emp text;
BEGIN
    IF NOT v_es_super AND v_emp_sesion IS NULL THEN
        RAISE EXCEPTION 'No autorizado.';
    END IF;

    IF v_es_super AND (p_empresa_id IS NULL OR trim(p_empresa_id) = '') THEN
        DELETE FROM public.whatsapp_contacts WHERE id = p_contact_id;
    ELSE
        v_target_emp := CASE WHEN v_es_super THEN trim(p_empresa_id) ELSE v_emp_sesion END;
        DELETE FROM public.whatsapp_contact_access
        WHERE contact_id = p_contact_id
          AND empresa_id = v_target_emp;

        -- Si ya no tiene permisos en ninguna empresa, limpiar registro huérfano
        IF NOT EXISTS (
            SELECT 1 FROM public.whatsapp_contact_access WHERE contact_id = p_contact_id
        ) THEN
            DELETE FROM public.whatsapp_contacts WHERE id = p_contact_id;
        END IF;
    END IF;

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================================
-- 5. ACTIVAR ROW LEVEL SECURITY (RLS) EN TODAS LAS TABLAS whatsapp_*
-- ============================================================================

ALTER TABLE public.whatsapp_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_contact_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_message_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_channels_rls" ON public.whatsapp_channels;
DROP POLICY IF EXISTS "whatsapp_channels_select_rls" ON public.whatsapp_channels;
DROP POLICY IF EXISTS "whatsapp_channels_write_rls" ON public.whatsapp_channels;
DROP POLICY IF EXISTS "whatsapp_contacts_rls" ON public.whatsapp_contacts;
DROP POLICY IF EXISTS "whatsapp_contacts_select_rls" ON public.whatsapp_contacts;
DROP POLICY IF EXISTS "whatsapp_contacts_write_rls" ON public.whatsapp_contacts;
DROP POLICY IF EXISTS "whatsapp_contact_access_rls" ON public.whatsapp_contact_access;
DROP POLICY IF EXISTS "whatsapp_sessions_rls" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "whatsapp_messages_log_rls" ON public.whatsapp_messages_log;
DROP POLICY IF EXISTS "whatsapp_message_status_rls" ON public.whatsapp_message_status;

-- a) whatsapp_channels: Super Admin acceso total; Admin de empresa puede leer canal compartido o dedicado propio
CREATE POLICY "whatsapp_channels_select_rls" ON public.whatsapp_channels
    FOR SELECT TO anon, authenticated
    USING (
        public.wa_es_superadmin() OR
        (
            public.wa_empresa_sesion() IS NOT NULL AND (
                tipo = 'compartido' OR empresa_id = public.wa_empresa_sesion()
            )
        )
    );

CREATE POLICY "whatsapp_channels_write_rls" ON public.whatsapp_channels
    FOR ALL TO anon, authenticated
    USING (public.wa_es_superadmin())
    WITH CHECK (public.wa_es_superadmin());

-- b) whatsapp_contacts: Super Admin ve y edita todo; Admin de empresa ve solo contactos con algún permiso en su empresa
CREATE POLICY "whatsapp_contacts_select_rls" ON public.whatsapp_contacts
    FOR SELECT TO anon, authenticated
    USING (
        public.wa_es_superadmin() OR
        (
            public.wa_empresa_sesion() IS NOT NULL AND
            public.wa_contacto_tiene_acceso_empresa(id, public.wa_empresa_sesion())
        )
    );

CREATE POLICY "whatsapp_contacts_write_rls" ON public.whatsapp_contacts
    FOR ALL TO anon, authenticated
    USING (public.wa_es_superadmin())
    WITH CHECK (public.wa_es_superadmin());

-- c) whatsapp_contact_access: Super Admin todo; Admin de empresa SOLO filas con su empresa_id
CREATE POLICY "whatsapp_contact_access_rls" ON public.whatsapp_contact_access
    FOR ALL TO anon, authenticated
    USING (
        public.wa_es_superadmin() OR
        (public.wa_empresa_sesion() IS NOT NULL AND empresa_id = public.wa_empresa_sesion())
    )
    WITH CHECK (
        public.wa_es_superadmin() OR
        (public.wa_empresa_sesion() IS NOT NULL AND empresa_id = public.wa_empresa_sesion())
    );

-- d) whatsapp_sessions: Super Admin y webhook (service_role)
CREATE POLICY "whatsapp_sessions_rls" ON public.whatsapp_sessions
    FOR ALL TO anon, authenticated
    USING (public.wa_es_superadmin())
    WITH CHECK (public.wa_es_superadmin());

-- e) whatsapp_messages_log: Super Admin todo; Admin de empresa SOLO filas con su empresa_id
CREATE POLICY "whatsapp_messages_log_rls" ON public.whatsapp_messages_log
    FOR ALL TO anon, authenticated
    USING (
        public.wa_es_superadmin() OR
        (public.wa_empresa_sesion() IS NOT NULL AND empresa_id = public.wa_empresa_sesion())
    )
    WITH CHECK (
        public.wa_es_superadmin() OR
        (public.wa_empresa_sesion() IS NOT NULL AND empresa_id = public.wa_empresa_sesion())
    );

-- f) whatsapp_message_status: Super Admin todo; Admin de empresa SOLO filas con su empresa_id
CREATE POLICY "whatsapp_message_status_rls" ON public.whatsapp_message_status
    FOR ALL TO anon, authenticated
    USING (
        public.wa_es_superadmin() OR
        (public.wa_empresa_sesion() IS NOT NULL AND empresa_id = public.wa_empresa_sesion())
    )
    WITH CHECK (
        public.wa_es_superadmin() OR
        (public.wa_empresa_sesion() IS NOT NULL AND empresa_id = public.wa_empresa_sesion())
    );

-- Permisos PostgREST (ocultando siempre access_token_override a clientes anon/authenticated)
REVOKE ALL ON public.whatsapp_channels FROM anon, authenticated;
GRANT SELECT (id, phone_number_id, waba_id, display_phone_number, nombre, tipo, empresa_id, template_name, template_lang, activo, created_at),
      INSERT, UPDATE, DELETE ON public.whatsapp_channels TO anon, authenticated;
GRANT ALL ON public.whatsapp_channels TO service_role;

GRANT ALL ON public.whatsapp_contacts TO anon, authenticated, service_role;
GRANT ALL ON public.whatsapp_contact_access TO anon, authenticated, service_role;
GRANT ALL ON public.whatsapp_sessions TO anon, authenticated, service_role;
GRANT ALL ON public.whatsapp_messages_log TO anon, authenticated, service_role;
GRANT ALL ON public.whatsapp_message_status TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.normalizar_telefono_wa(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wa_es_superadmin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wa_empresa_sesion() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wa_contacto_tiene_acceso_empresa(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_whatsapp_guardar_contacto(text, text, boolean, jsonb, boolean, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_whatsapp_cambiar_estado_contacto(text, boolean, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_whatsapp_eliminar_contacto(text, text) TO anon, authenticated, service_role;
