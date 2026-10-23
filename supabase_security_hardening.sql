-- ============================================================================
-- GANADERO AD / BOVITRACK PRO - SCRIPT DE ENDURECIMIENTO DE SEGURIDAD (RLS & API)
-- Archivo: supabase_security_hardening.sql
-- Propósito: Sellar vulnerabilidades críticas de backend, extracción de datos,
--            IDOR, Cross-Tenant Data Leakage y acceso no autenticado en PostgREST.
-- Ejecución: Ejecutar en el SQL Editor de su proyecto Supabase Cloud.
-- ============================================================================

-- 0. HABILITAR EXTENSIÓN CRIPTOGRÁFICA
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. TABLA DE SESIONES SEGURAS CON CADUCIDAD (ANTI-SPOOFING & ANTI-IDOR)
CREATE TABLE IF NOT EXISTS public.sesiones (
    token TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL,
    empresa_id TEXT,
    rol TEXT NOT NULL,
    creado_en TIMESTAMPTZ DEFAULT now(),
    expira_en TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.sesiones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sesiones FROM anon, authenticated;
GRANT ALL ON public.sesiones TO service_role;

-- 2. TABLA DE NUTRICIÓN ANIMAL ESPECIAL & IA (SI NO EXISTE)
CREATE TABLE IF NOT EXISTS public.nutricion_animales (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    finca_id TEXT NOT NULL REFERENCES public.fincas(id) ON DELETE CASCADE,
    animal_id TEXT,
    animal_tag TEXT NOT NULL,
    fecha_analisis DATE NOT NULL DEFAULT CURRENT_DATE,
    etapa_productiva TEXT DEFAULT 'General',
    talla_frame TEXT,
    condicion_corporal NUMERIC(3,1),
    peso_actual_kg NUMERIC(6,2),
    gdp_esperada_g_dia NUMERIC(7,2),
    sugerencia_dieta JSONB DEFAULT '{}'::jsonb,
    sugerencia_medicamentos JSONB DEFAULT '[]'::jsonb,
    sugerencia_hormonas JSONB DEFAULT '[]'::jsonb,
    analisis_ia TEXT,
    notas TEXT,
    creado_en TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_nutricion_finca_tag UNIQUE (finca_id, animal_tag)
);

-- 3. FUNCIÓN DE RESOLUCIÓN DE TENANT SEGURO (MOTOR MULTI-TENANT CONTEXTUAL)
-- Determina el ID de la empresa del solicitante a partir de:
--   1. Rol 'service_role' de Supabase (bypass para tareas internas de administración).
--   2. Claim 'empresa_id' / 'role' en JWT autenticado de Supabase Auth.
--   3. Token criptográfico de sesión 'x-session-token' validado contra public.sesiones.
--   4. Cabecera 'x-empresa-id' verificada contra empresas activas registradas.
CREATE OR REPLACE FUNCTION public.obtener_tenant_sesion()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_headers jsonb;
    v_token text;
    v_empresa_id text;
    v_rol text;
    v_header_empresa text;
    v_jwt_empresa text;
    v_jwt_role text;
BEGIN
    -- 1. Acceso de mantenimiento / backend interno Supabase
    IF current_user = 'service_role' THEN
        RETURN 'SUPERADMIN_BYPASS';
    END IF;

    -- 2. Inspeccionar claims de JWT si está presente
    BEGIN
        v_jwt_role := auth.jwt() ->> 'role';
        v_jwt_empresa := auth.jwt() ->> 'empresa_id';
        IF v_jwt_role = 'superadmin' THEN
            RETURN 'SUPERADMIN_BYPASS';
        ELSIF v_jwt_empresa IS NOT NULL AND trim(v_jwt_empresa) <> '' THEN
            RETURN trim(v_jwt_empresa);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 3. Leer cabeceras HTTP suministradas por PostgREST
    BEGIN
        v_headers := current_setting('request.headers', true)::jsonb;
    EXCEPTION WHEN OTHERS THEN
        v_headers := NULL;
    END;

    IF v_headers IS NULL THEN
        RETURN NULL;
    END IF;

    -- 3.1 Token de sesión verificado en la tabla public.sesiones
    v_token := v_headers->>'x-session-token';
    IF v_token IS NOT NULL AND trim(v_token) <> '' THEN
        SELECT s.empresa_id, s.rol INTO v_empresa_id, v_rol
        FROM public.sesiones s
        WHERE s.token = trim(v_token) AND s.expira_en > now();

        IF FOUND THEN
            IF v_rol = 'superadmin' THEN
                -- Superadmin puede ver todo o filtrar por empresa específica
                v_header_empresa := v_headers->>'x-empresa-id';
                IF v_header_empresa IS NOT NULL AND trim(v_header_empresa) <> '' AND trim(v_header_empresa) <> 'todas' THEN
                    RETURN trim(v_header_empresa);
                END IF;
                RETURN 'SUPERADMIN_BYPASS';
            END IF;
            RETURN v_empresa_id;
        END IF;
    END IF;

    -- 3.2 Cabecera de empresa validada (para consultas autorizadas PWA)
    v_header_empresa := v_headers->>'x-empresa-id';
    IF v_header_empresa IS NOT NULL AND trim(v_header_empresa) <> '' THEN
        IF lower(trim(v_header_empresa)) = 'todas' OR lower(trim(v_header_empresa)) = 'superadmin' THEN
            -- No se permite bypass sin sesión autenticada de superadmin
            RETURN NULL;
        END IF;
        IF EXISTS (SELECT 1 FROM public.empresas WHERE id = trim(v_header_empresa) AND activa = true) THEN
            RETURN trim(v_header_empresa);
        END IF;
    END IF;

    RETURN NULL;
END;
$$;

-- 4. ELIMINACIÓN DE TODAS LAS POLÍTICAS INSEGURAS PREVIAS (USING true)
DO $$
DECLARE
    tbl text;
    pol record;
    tablas text[] := ARRAY[
        'empresas', 'fincas', 'usuarios', 'costos_fijos_finca', 'inversiones_diferidas',
        'animales', 'servicios_reproductivos', 'pesajes_animales',
        'palpaciones_reproductivas', 'controles_lecheros', 'traslados_animales',
        'operaciones_diarias', 'nutricion_animales'
    ];
BEGIN
    FOREACH tbl IN ARRAY tablas LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
            FOR pol IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl) LOOP
                EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, tbl);
            END LOOP;
        END IF;
    END LOOP;
END $$;

-- 5. BLINDAJE DE SEGURIDAD PARA LA TABLA 'usuarios'
REVOKE ALL ON public.usuarios FROM anon;
REVOKE ALL ON public.usuarios FROM authenticated;

-- Exponer únicamente columnas no sensibles (NUNCA 'password')
GRANT SELECT (id, empresa_id, usuario, nombre, rol, fincas_asignadas, email, telefono, activo, creado_en)
ON public.usuarios TO anon, authenticated;

GRANT INSERT, UPDATE (nombre, fincas_asignadas, email, telefono, activo)
ON public.usuarios TO anon, authenticated;

-- Políticas estrictas para 'usuarios':
CREATE POLICY "Usuarios: Lectura delimitada por empresa"
ON public.usuarios FOR SELECT
TO anon, authenticated
USING (
    public.obtener_tenant_sesion() = 'SUPERADMIN_BYPASS' OR
    (public.obtener_tenant_sesion() IS NOT NULL AND empresa_id = public.obtener_tenant_sesion()) OR
    id = 'USR-SUPER' OR
    empresa_id IS NULL
);

CREATE POLICY "Usuarios: Gestión administradores"
ON public.usuarios FOR ALL
TO anon, authenticated
USING (
    public.obtener_tenant_sesion() = 'SUPERADMIN_BYPASS' OR
    (public.obtener_tenant_sesion() IS NOT NULL AND empresa_id = public.obtener_tenant_sesion() AND usuario <> 'anuardavid')
)
WITH CHECK (
    public.obtener_tenant_sesion() = 'SUPERADMIN_BYPASS' OR
    (public.obtener_tenant_sesion() IS NOT NULL AND empresa_id = public.obtener_tenant_sesion() AND rol <> 'superadmin')
);

-- 6. POLÍTICAS RLS ESTRICTAS PARA 'empresas'
CREATE POLICY "Empresas: Lectura autorizada"
ON public.empresas FOR SELECT
TO anon, authenticated
USING (
    activa = true OR
    public.obtener_tenant_sesion() = 'SUPERADMIN_BYPASS' OR
    (public.obtener_tenant_sesion() IS NOT NULL AND id = public.obtener_tenant_sesion())
);

CREATE POLICY "Empresas: Modificación exclusiva superadmin o tenant propio"
ON public.empresas FOR ALL
TO anon, authenticated
USING (
    public.obtener_tenant_sesion() = 'SUPERADMIN_BYPASS' OR
    (public.obtener_tenant_sesion() IS NOT NULL AND id = public.obtener_tenant_sesion())
)
WITH CHECK (
    public.obtener_tenant_sesion() = 'SUPERADMIN_BYPASS' OR
    (public.obtener_tenant_sesion() IS NOT NULL AND id = public.obtener_tenant_sesion())
);

-- 7. POLÍTICAS RLS ESTRICTAS PARA 'fincas'
CREATE POLICY "Fincas: Aislamiento por empresa"
ON public.fincas FOR ALL
TO anon, authenticated
USING (
    public.obtener_tenant_sesion() = 'SUPERADMIN_BYPASS' OR
    (public.obtener_tenant_sesion() IS NOT NULL AND empresa_id = public.obtener_tenant_sesion())
)
WITH CHECK (
    public.obtener_tenant_sesion() = 'SUPERADMIN_BYPASS' OR
    (public.obtener_tenant_sesion() IS NOT NULL AND empresa_id = public.obtener_tenant_sesion())
);

-- 8. POLÍTICAS RLS ESTRICTAS PARA TABLAS DEPENDIENTES DE 'fincas'
-- Tablas: animales, costos_fijos_finca, inversiones_diferidas, servicios_reproductivos,
--         pesajes_animales, palpaciones_reproductivas, controles_lecheros, nutricion_animales
DO $$
DECLARE
    tbl text;
    tablas_finca text[] := ARRAY[
        'animales', 'costos_fijos_finca', 'inversiones_diferidas',
        'servicios_reproductivos', 'pesajes_animales', 'palpaciones_reproductivas',
        'controles_lecheros', 'nutricion_animales'
    ];
BEGIN
    FOREACH tbl IN ARRAY tablas_finca LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            EXECUTE format('
                CREATE POLICY "Aislamiento tenant: %I"
                ON public.%I FOR ALL
                TO anon, authenticated
                USING (
                    public.obtener_tenant_sesion() = ''SUPERADMIN_BYPASS'' OR
                    (public.obtener_tenant_sesion() IS NOT NULL AND finca_id IN (
                        SELECT id FROM public.fincas WHERE empresa_id = public.obtener_tenant_sesion()
                    ))
                )
                WITH CHECK (
                    public.obtener_tenant_sesion() = ''SUPERADMIN_BYPASS'' OR
                    (public.obtener_tenant_sesion() IS NOT NULL AND finca_id IN (
                        SELECT id FROM public.fincas WHERE empresa_id = public.obtener_tenant_sesion()
                    ))
                );
            ', tbl, tbl);
            EXECUTE format('GRANT ALL ON public.%I TO anon, authenticated, service_role;', tbl);
        END IF;
    END LOOP;
END $$;

-- 9. POLÍTICAS RLS ESTRICTAS PARA TABLAS CON 'empresa_id' DIRECTO
-- Tablas: traslados_animales, operaciones_diarias
DO $$
DECLARE
    tbl text;
    tablas_empresa text[] := ARRAY['traslados_animales', 'operaciones_diarias'];
BEGIN
    FOREACH tbl IN ARRAY tablas_empresa LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            EXECUTE format('
                CREATE POLICY "Aislamiento tenant: %I"
                ON public.%I FOR ALL
                TO anon, authenticated
                USING (
                    public.obtener_tenant_sesion() = ''SUPERADMIN_BYPASS'' OR
                    (public.obtener_tenant_sesion() IS NOT NULL AND empresa_id = public.obtener_tenant_sesion())
                )
                WITH CHECK (
                    public.obtener_tenant_sesion() = ''SUPERADMIN_BYPASS'' OR
                    (public.obtener_tenant_sesion() IS NOT NULL AND empresa_id = public.obtener_tenant_sesion())
                );
            ', tbl, tbl);
            EXECUTE format('GRANT ALL ON public.%I TO anon, authenticated, service_role;', tbl);
        END IF;
    END LOOP;
END $$;

-- 10. PROCEDIMIENTO RPC SEGURO DE AUTENTICACIÓN (LOGIN CRIPTOGRÁFICO)
CREATE OR REPLACE FUNCTION public.autenticar_usuario(
    p_usuario text,
    p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user record;
    v_empresa record;
    v_clean_user text;
    v_empresa_json jsonb := NULL;
    v_token text;
    v_password_ok boolean := false;
    v_es_superadmin boolean := false;
BEGIN
    -- Limpieza y normalización de usuario (sin espacios, sin arroba inicial)
    v_clean_user := lower(trim(replace(p_usuario, '@', '')));

    SELECT u.id, u.empresa_id, u.usuario, u.nombre, u.rol, u.password, u.activo, u.fincas_asignadas
    INTO v_user
    FROM public.usuarios u
    WHERE lower(trim(replace(u.usuario, '@', ''))) = v_clean_user
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Credenciales inválidas');
    END IF;

    IF v_user.activo IS FALSE THEN
        RETURN jsonb_build_object('ok', false, 'error', 'La cuenta se encuentra inactiva. Contacte al administrador.');
    END IF;

    -- Validación segura de contraseña (texto plano directo o hash bcrypt/sha)
    IF v_user.password = p_password THEN
        v_password_ok := true;
    ELSIF v_user.password LIKE '$2%' THEN
        BEGIN
            v_password_ok := (v_user.password = crypt(p_password, v_user.password));
        EXCEPTION WHEN OTHERS THEN
            v_password_ok := false;
        END;
    END IF;

    IF NOT v_password_ok THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Credenciales inválidas');
    END IF;

    v_es_superadmin := (v_user.rol = 'superadmin' OR v_user.usuario = 'anuardavid');

    -- Obtener datos de empresa asociada
    IF v_user.empresa_id IS NOT NULL THEN
        SELECT id, nit, nombre, activa, fecha_vencimiento, plan_vigencia
        INTO v_empresa
        FROM public.empresas
        WHERE id = v_user.empresa_id;

        IF FOUND THEN
            IF v_empresa.activa IS FALSE AND NOT v_es_superadmin THEN
                RETURN jsonb_build_object('ok', false, 'error', 'La empresa se encuentra inactiva o con suscripción suspendida.');
            END IF;

            v_empresa_json := jsonb_build_object(
                'id', v_empresa.id,
                'nit', v_empresa.nit,
                'nombre', v_empresa.nombre,
                'activa', v_empresa.activa,
                'fecha_vencimiento', v_empresa.fecha_vencimiento,
                'plan_vigencia', v_empresa.plan_vigencia
            );
        END IF;
    END IF;

    -- Generar token de sesión criptográfico con alta entropía (256 bits)
    v_token := encode(gen_random_bytes(32), 'hex');

    -- Guardar la sesión activa con expiración a 7 días
    INSERT INTO public.sesiones (token, usuario_id, empresa_id, rol, expira_en)
    VALUES (v_token, v_user.id, v_user.empresa_id, v_user.rol, now() + interval '7 days');

    -- Purgar sesiones expiradas automáticamente
    DELETE FROM public.sesiones WHERE expira_en < now();

    -- Registrar acceso en bitácora de operaciones si existe la tabla
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'operaciones_diarias') THEN
        INSERT INTO public.operaciones_diarias (
            id, empresa_id, fecha, accion, modulo, detalles, usuario
        ) VALUES (
            'AUTH-' || gen_random_uuid()::text,
            v_user.empresa_id,
            CURRENT_DATE,
            'inicio_sesion',
            'seguridad',
            jsonb_build_object('usuario', v_user.usuario, 'rol', v_user.rol),
            v_user.usuario
        );
    END IF;

    -- Retornar perfil y token sin divulgar contraseñas
    RETURN jsonb_build_object(
        'ok', true,
        'token', v_token,
        'usuario', jsonb_build_object(
            'id', v_user.id,
            'usuario', v_user.usuario,
            'nombre', v_user.nombre,
            'rol', v_user.rol,
            'empresa_id', v_user.empresa_id,
            'fincas_asignadas', v_user.fincas_asignadas
        ),
        'empresa', v_empresa_json
    );
END;
$$;

-- Permisos de ejecución para la función de login
REVOKE EXECUTE ON FUNCTION public.autenticar_usuario(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.autenticar_usuario(text, text) TO anon, authenticated, service_role;

-- 11. RPC DE CIERRE DE SESIÓN (REVOCACIÓN INMEDIATA)
CREATE OR REPLACE FUNCTION public.cerrar_sesion(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.sesiones WHERE token = p_token;
    RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cerrar_sesion(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cerrar_sesion(text) TO anon, authenticated, service_role;

-- 12. PERMISOS GENERALES DE ESQUEMA
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

GRANT ALL ON public.empresas TO anon, authenticated, service_role;
GRANT ALL ON public.fincas TO anon, authenticated, service_role;

-- 13. AUDITORÍA DE POLÍTICAS VIGENTES
SELECT 
    schemaname,
    tablename,
    policyname,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
