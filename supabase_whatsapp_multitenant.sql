-- ============================================================================
-- GANADERO AD - WHATSAPP CLOUD API v25.0 MULTITENANT (ARQUITECTURA CENTRAL)
-- Base de datos compartida con aislamiento estricto por empresa_id + RLS
-- Operado por SOLUCIONES AC S.A.S. (Magangué, Bolívar, Colombia)
-- ============================================================================

-- 1. TABLA DE CANALES WHATSAPP (COMPARTIDO Y DEDICADOS POR EMPRESA)
CREATE TABLE IF NOT EXISTS public.whatsapp_channels (
    id text PRIMARY KEY,
    phone_number_id text UNIQUE NOT NULL,
    waba_id text,
    display_phone_number text,
    nombre text NOT NULL DEFAULT 'Canal WhatsApp Ganadero AD',
    tipo text NOT NULL DEFAULT 'compartido' CHECK (tipo IN ('compartido', 'dedicado')),
    empresa_id text REFERENCES public.empresas(id) ON DELETE SET NULL,
    access_token_override text, -- Cifrado, opcional; si es NULL se usa WHATSAPP_SYSTEM_TOKEN en servidor
    template_name text DEFAULT 'notificacion_ganadero_ad',
    template_lang text DEFAULT 'es',
    activo boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT chk_whatsapp_channels_tipo_empresa CHECK (
        (tipo = 'compartido' AND empresa_id IS NULL) OR
        (tipo = 'dedicado' AND empresa_id IS NOT NULL)
    )
);

-- Canal COMPARTIDO por defecto del sistema
INSERT INTO public.whatsapp_channels (
    id, phone_number_id, waba_id, display_phone_number, nombre,
    tipo, empresa_id, access_token_override, template_name, template_lang, activo
)
VALUES (
    'CH-SHARED-DEFAULT',
    '111443548633291',
    '118927644541032',
    '+57 322 5694112',
    'Canal Compartido Ganadero AD',
    'compartido',
    NULL,
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
    activo = true;

-- 2. TABLA DE CONTACTOS AUTORIZADOS (LISTA BLANCA MULTITENANT)
CREATE TABLE IF NOT EXISTS public.whatsapp_contacts (
    id text PRIMARY KEY,
    telefono text NOT NULL, -- Formato E.164 sin +, ej: 573017839578
    empresa_id text NOT NULL,
    finca_id text, -- Finca activa/por defecto opcional
    nombre text NOT NULL DEFAULT 'Operador de Campo',
    rol text DEFAULT 'operador',
    activo boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- REGLA CRÍTICA: Un teléfono solo puede estar activo en UNA empresa a la vez
CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_contacts_telefono_activo
    ON public.whatsapp_contacts (telefono)
    WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_empresa_id
    ON public.whatsapp_contacts (empresa_id);

-- 3. BITÁCORA DE MENSAJES (ENTRADA / SALIDA PARA FACTURACIÓN POR EMPRESA)
CREATE TABLE IF NOT EXISTS public.whatsapp_messages_log (
    id text PRIMARY KEY,
    empresa_id text,
    channel_id text REFERENCES public.whatsapp_channels(id) ON DELETE SET NULL,
    telefono text NOT NULL,
    direccion text NOT NULL CHECK (direccion IN ('in', 'out')),
    tipo text NOT NULL DEFAULT 'text' CHECK (tipo IN ('text', 'template')),
    wamid text,
    contenido_resumen text,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_log_empresa_fecha
    ON public.whatsapp_messages_log (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_log_wamid
    ON public.whatsapp_messages_log (wamid);

-- 4. ESTADOS DE ENTREGA Y ERRORES DE META (STATUS CALLBACKS)
CREATE TABLE IF NOT EXISTS public.whatsapp_message_status (
    id text PRIMARY KEY,
    empresa_id text,
    channel_id text REFERENCES public.whatsapp_channels(id) ON DELETE SET NULL,
    wamid text NOT NULL,
    recipient_id text,
    status text NOT NULL,
    error_code text,
    error_title text,
    error_details text,
    timestamp timestamptz,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_status_empresa_fecha
    ON public.whatsapp_message_status (empresa_id, created_at DESC);

-- 5. SESIONES DE VENTANA DE 24 HORAS (CONTROL DE COSTOS META)
CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
    channel_id text NOT NULL REFERENCES public.whatsapp_channels(id) ON DELETE CASCADE,
    telefono text NOT NULL,
    empresa_id text,
    last_inbound_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (channel_id, telefono)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_empresa
    ON public.whatsapp_sessions (empresa_id);

-- ============================================================================
-- SEGURIDAD RLS (ROW LEVEL SECURITY) Y OCULTAMIENTO DE TOKENS
-- ============================================================================

ALTER TABLE public.whatsapp_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_message_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas previas si existen
DROP POLICY IF EXISTS "whatsapp_channels_rls" ON public.whatsapp_channels;
DROP POLICY IF EXISTS "whatsapp_contacts_rls" ON public.whatsapp_contacts;
DROP POLICY IF EXISTS "whatsapp_messages_log_rls" ON public.whatsapp_messages_log;
DROP POLICY IF EXISTS "whatsapp_message_status_rls" ON public.whatsapp_message_status;
DROP POLICY IF EXISTS "whatsapp_sessions_rls" ON public.whatsapp_sessions;

-- 1) whatsapp_channels: Super Admin ve y gestiona todo; cada empresa puede leer el canal compartido o su canal dedicado
CREATE POLICY "whatsapp_channels_rls" ON public.whatsapp_channels
    FOR ALL TO anon, authenticated
    USING (
        public.obtener_tenant_sesion() = 'SUPERADMIN_BYPASS' OR
        (
            public.obtener_tenant_sesion() IS NOT NULL AND (
                tipo = 'compartido' OR empresa_id = public.obtener_tenant_sesion()
            )
        )
    )
    WITH CHECK (
        public.obtener_tenant_sesion() = 'SUPERADMIN_BYPASS'
    );

-- 2) whatsapp_contacts: Super Admin ve todo; cada empresa gestiona únicamente sus propios contactos
CREATE POLICY "whatsapp_contacts_rls" ON public.whatsapp_contacts
    FOR ALL TO anon, authenticated
    USING (
        public.obtener_tenant_sesion() = 'SUPERADMIN_BYPASS' OR
        (public.obtener_tenant_sesion() IS NOT NULL AND empresa_id = public.obtener_tenant_sesion())
    )
    WITH CHECK (
        public.obtener_tenant_sesion() = 'SUPERADMIN_BYPASS' OR
        (public.obtener_tenant_sesion() IS NOT NULL AND empresa_id = public.obtener_tenant_sesion())
    );

-- 3) whatsapp_messages_log: Super Admin ve todo; cada empresa ve únicamente sus mensajes
CREATE POLICY "whatsapp_messages_log_rls" ON public.whatsapp_messages_log
    FOR ALL TO anon, authenticated
    USING (
        public.obtener_tenant_sesion() = 'SUPERADMIN_BYPASS' OR
        (public.obtener_tenant_sesion() IS NOT NULL AND empresa_id = public.obtener_tenant_sesion())
    )
    WITH CHECK (
        public.obtener_tenant_sesion() = 'SUPERADMIN_BYPASS' OR
        (public.obtener_tenant_sesion() IS NOT NULL AND empresa_id = public.obtener_tenant_sesion())
    );

-- 4) whatsapp_message_status: Super Admin ve todo; cada empresa ve únicamente sus estados
CREATE POLICY "whatsapp_message_status_rls" ON public.whatsapp_message_status
    FOR ALL TO anon, authenticated
    USING (
        public.obtener_tenant_sesion() = 'SUPERADMIN_BYPASS' OR
        (public.obtener_tenant_sesion() IS NOT NULL AND empresa_id = public.obtener_tenant_sesion())
    )
    WITH CHECK (
        public.obtener_tenant_sesion() = 'SUPERADMIN_BYPASS' OR
        (public.obtener_tenant_sesion() IS NOT NULL AND empresa_id = public.obtener_tenant_sesion())
    );

-- 5) whatsapp_sessions: Super Admin ve todo; cada empresa ve únicamente sus sesiones 24h
CREATE POLICY "whatsapp_sessions_rls" ON public.whatsapp_sessions
    FOR ALL TO anon, authenticated
    USING (
        public.obtener_tenant_sesion() = 'SUPERADMIN_BYPASS' OR
        (public.obtener_tenant_sesion() IS NOT NULL AND empresa_id = public.obtener_tenant_sesion())
    )
    WITH CHECK (
        public.obtener_tenant_sesion() = 'SUPERADMIN_BYPASS' OR
        (public.obtener_tenant_sesion() IS NOT NULL AND empresa_id = public.obtener_tenant_sesion())
    );

-- Permisos de tabla: NUNCA devolver access_token_override a clientes anon/authenticated
GRANT SELECT (id, phone_number_id, waba_id, display_phone_number, nombre, tipo, empresa_id, template_name, template_lang, activo, created_at),
      INSERT, UPDATE, DELETE ON public.whatsapp_channels TO anon, authenticated;
GRANT ALL ON public.whatsapp_channels TO service_role;

GRANT ALL ON public.whatsapp_contacts TO anon, authenticated, service_role;
GRANT ALL ON public.whatsapp_messages_log TO anon, authenticated, service_role;
GRANT ALL ON public.whatsapp_message_status TO anon, authenticated, service_role;
GRANT ALL ON public.whatsapp_sessions TO anon, authenticated, service_role;
