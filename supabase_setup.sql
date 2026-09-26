-- ============================================================================
-- GANADERO AD PWA - ESQUEMA OFICIAL PARA SUPABASE CLOUD (POSTGREST + RLS)
-- ============================================================================

-- 1. Habilitar extensión de criptografía para UUIDs automáticos
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. TABLA: empresas (Multi-Tenant & Licenciamiento)
CREATE TABLE IF NOT EXISTS public.empresas (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    nit TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    pais TEXT DEFAULT 'Colombia',
    moneda TEXT DEFAULT 'COP',
    email TEXT,
    telefono TEXT,
    direccion TEXT,
    activa BOOLEAN DEFAULT TRUE,
    fecha_vencimiento TEXT DEFAULT '2027-09-15',
    tiempo_indefinido BOOLEAN DEFAULT FALSE,
    plan_vigencia TEXT DEFAULT '1 Año',
    creado_en TIMESTAMPTZ DEFAULT now()
);

-- 3. TABLA: fincas (Predios Zootécnicos)
CREATE TABLE IF NOT EXISTS public.fincas (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    empresa_id TEXT REFERENCES public.empresas(id) ON DELETE SET NULL,
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    ubicacion TEXT,
    area_ha NUMERIC(10,2) DEFAULT 0,
    precio_leche_litro NUMERIC(10,2) DEFAULT 2450.00,
    precio_carne_kg_pie NUMERIC(10,2) DEFAULT 8900.00,
    creado_en TIMESTAMPTZ DEFAULT now(),
    actualizado_en TIMESTAMPTZ DEFAULT now()
);

-- 4. TABLA: usuarios (Gobierno de Roles & Asignación de Predios)
CREATE TABLE IF NOT EXISTS public.usuarios (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    empresa_id TEXT REFERENCES public.empresas(id) ON DELETE SET NULL,
    usuario TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'encargado',
    password TEXT,
    fincas_asignadas JSONB DEFAULT '"todas"'::jsonb,
    email TEXT,
    telefono TEXT,
    activo BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMPTZ DEFAULT now()
);

-- 5. TABLA: costos_fijos_finca
CREATE TABLE IF NOT EXISTS public.costos_fijos_finca (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    finca_id TEXT NOT NULL REFERENCES public.fincas(id) ON DELETE CASCADE,
    nomina NUMERIC(14,2) DEFAULT 0,
    insumos NUMERIC(14,2) DEFAULT 0,
    herbicidas NUMERIC(14,2) DEFAULT 0,
    maquinaria NUMERIC(14,2) DEFAULT 0,
    servicios NUMERIC(14,2) DEFAULT 0,
    otros NUMERIC(14,2) DEFAULT 0,
    actualizado_en TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_costos_finca UNIQUE (finca_id)
);

-- 6. TABLA: inversiones_diferidas
CREATE TABLE IF NOT EXISTS public.inversiones_diferidas (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    finca_id TEXT NOT NULL REFERENCES public.fincas(id) ON DELETE CASCADE,
    descripcion_activo TEXT NOT NULL,
    monto_total_inversion NUMERIC(14,2) NOT NULL,
    plazo_meses_diferido INT NOT NULL,
    cuota_mensual NUMERIC(14,2) DEFAULT 0,
    estado TEXT DEFAULT 'Activa',
    creado_en TIMESTAMPTZ DEFAULT now()
);

-- 7. TABLA: animales (Inventario Zootécnico Integral)
CREATE TABLE IF NOT EXISTS public.animales (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    finca_id TEXT NOT NULL REFERENCES public.fincas(id) ON DELETE CASCADE,
    identificacion_tag TEXT NOT NULL,
    nombre_alias TEXT,
    especie TEXT NOT NULL DEFAULT 'bovino',
    raza TEXT NOT NULL,
    sexo TEXT NOT NULL,
    categoria TEXT NOT NULL,
    lote TEXT NOT NULL DEFAULT 'General',
    fecha_nacimiento DATE,
    padre_tag TEXT,
    madre_tag TEXT,
    estado_vida TEXT DEFAULT 'activo',
    estado_reproductivo TEXT DEFAULT 'Vacía',
    dias_gestacion_actual INT DEFAULT 0,
    fecha_ultimo_parto DATE,
    ultimo_peso_kg NUMERIC(6,2),
    fecha_ultimo_pesaje DATE,
    gdp_promedio_g_dia NUMERIC(7,2),
    promedio_leche_diaria_l NUMERIC(5,2) DEFAULT 0,
    partos_previos JSONB DEFAULT '[]'::jsonb,
    creado_en TIMESTAMPTZ DEFAULT now(),
    actualizado_en TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_animal_finca_tag UNIQUE (finca_id, identificacion_tag)
);

-- 8. TABLA: servicios_reproductivos (IA, TE y Monta)
CREATE TABLE IF NOT EXISTS public.servicios_reproductivos (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    finca_id TEXT NOT NULL REFERENCES public.fincas(id) ON DELETE CASCADE,
    animal_tag TEXT NOT NULL,
    tipo TEXT NOT NULL,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    reproductor TEXT NOT NULL,
    codigo_pajilla TEXT,
    donadora TEXT,
    tecnico TEXT,
    protocolo TEXT,
    resultado TEXT DEFAULT 'Pendiente Chequeo',
    fecha_ecografia_estimada DATE,
    fecha_palpacion_estimada DATE,
    fecha_parto_estimada DATE,
    observaciones TEXT,
    creado_en TIMESTAMPTZ DEFAULT now()
);

-- 9. TABLA: pesajes_animales
CREATE TABLE IF NOT EXISTS public.pesajes_animales (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    finca_id TEXT NOT NULL REFERENCES public.fincas(id) ON DELETE CASCADE,
    animal_tag TEXT NOT NULL,
    fecha_pesaje DATE NOT NULL DEFAULT CURRENT_DATE,
    peso_kg NUMERIC(6,2) NOT NULL,
    gdp_calculada_g_dia NUMERIC(7,2),
    notas TEXT,
    creado_en TIMESTAMPTZ DEFAULT now()
);

-- 10. TABLA: palpaciones_reproductivas
CREATE TABLE IF NOT EXISTS public.palpaciones_reproductivas (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    finca_id TEXT NOT NULL REFERENCES public.fincas(id) ON DELETE CASCADE,
    animal_tag TEXT NOT NULL,
    fecha_palpacion DATE NOT NULL DEFAULT CURRENT_DATE,
    diagnostico TEXT NOT NULL,
    dias_gestacion_estimados INT DEFAULT 0,
    fecha_estimada_parto DATE,
    observaciones TEXT,
    creado_en TIMESTAMPTZ DEFAULT now()
);

-- 11. TABLA: controles_lecheros
CREATE TABLE IF NOT EXISTS public.controles_lecheros (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    finca_id TEXT NOT NULL REFERENCES public.fincas(id) ON DELETE CASCADE,
    animal_tag TEXT NOT NULL,
    fecha_control DATE NOT NULL DEFAULT CURRENT_DATE,
    litros_manana NUMERIC(5,2) DEFAULT 0,
    litros_tarde NUMERIC(5,2) DEFAULT 0,
    total_litros NUMERIC(5,2) DEFAULT 0,
    creado_en TIMESTAMPTZ DEFAULT now()
);

-- 12. TABLA: traslados_animales
CREATE TABLE IF NOT EXISTS public.traslados_animales (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    empresa_id TEXT REFERENCES public.empresas(id) ON DELETE SET NULL,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    finca_origen_id TEXT,
    finca_origen_nombre TEXT,
    finca_destino_id TEXT,
    finca_destino_nombre TEXT,
    motivo TEXT,
    observaciones TEXT,
    total_animales INT DEFAULT 0,
    animales JSONB DEFAULT '[]'::jsonb,
    usuario_nombre TEXT,
    creado_en TIMESTAMPTZ DEFAULT now()
);

-- 13. TABLA: operaciones_diarias (Bitácora Integral)
CREATE TABLE IF NOT EXISTS public.operaciones_diarias (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    empresa_id TEXT REFERENCES public.empresas(id) ON DELETE SET NULL,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    finca_id TEXT,
    finca_nombre TEXT,
    accion TEXT,
    modulo TEXT,
    detalles JSONB DEFAULT '{}'::jsonb,
    usuario TEXT,
    creado_en TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- SEGURIDAD Y PERMISOS: ROW LEVEL SECURITY (RLS) PARA EL ROL 'ANON'
-- Permite que la PWA lea y escriba directamente usando la Anon Key pública.
-- ============================================================================

DO $$
DECLARE
    tbl text;
    tablas text[] := ARRAY[
        'empresas', 'fincas', 'usuarios', 'costos_fijos_finca', 'inversiones_diferidas',
        'animales', 'servicios_reproductivos', 'pesajes_animales',
        'palpaciones_reproductivas', 'controles_lecheros', 'traslados_animales',
        'operaciones_diarias'
    ];
BEGIN
    FOREACH tbl IN ARRAY tablas LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Permitir acceso publico anon" ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY "Permitir acceso publico anon" ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true);', tbl);
        EXECUTE format('GRANT ALL ON public.%I TO anon;', tbl);
        EXECUTE format('GRANT ALL ON public.%I TO authenticated;', tbl);
        EXECUTE format('GRANT ALL ON public.%I TO service_role;', tbl);
    END LOOP;
END $$;

-- Otorgar uso de esquemas al rol anónimo
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

-- ============================================================================
-- DATOS SEMILLA INICIALES
-- ============================================================================

INSERT INTO public.empresas (id, nit, nombre, pais, moneda, email, telefono, direccion, activa, fecha_vencimiento, tiempo_indefinido, plan_vigencia)
VALUES
    ('EMP-01', '900.123.456-1', 'Agropecuaria El Porvenir S.A.S.', 'Colombia', 'COP', 'contacto@elporvenir.com', '+57 310 456 7890', 'Valle del Cauca', true, '2027-09-15', false, '1 Año'),
    ('EMP-02', '901.987.654-2', 'Ganadería Búfalos Santa Elena', 'Colombia', 'COP', 'contacto@santaelena.com', '+57 312 678 9012', 'Santander', true, '2027-09-15', false, '1 Año')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fincas (id, empresa_id, codigo, nombre, ubicacion, area_ha, precio_leche_litro, precio_carne_kg_pie)
VALUES 
    ('FIN-PORVENIR', 'EMP-01', 'FPV-01', 'Hacienda El Porvenir', 'Valle del Cauca / Trópico Bajo', 220, 2450, 8900),
    ('FIN-SANTA-ELENA', 'EMP-02', 'FSE-02', 'Finca Búfalos Santa Elena', 'Cimitarra / Santander', 190, 3950, 8200)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, empresa_id, usuario, nombre, rol, password, fincas_asignadas, email, telefono, activo)
VALUES 
    ('USR-SUPER', NULL, 'anuardavid', 'Anuar David (Super Admin)', 'superadmin', 'anuar316791', '"todas"'::jsonb, 'anuardavid@hotmail.com', '+57 310 000 0000', true),
    ('USR-01', 'EMP-01', 'admin', 'Ing. Mateo Restrepo (Administrador)', 'administrador', 'Admin2026*', '"todas"'::jsonb, 'admin@elporvenir.com', '3104567890', true),
    ('USR-02', 'EMP-01', 'encargado', 'Javier Morales (Encargado)', 'encargado', 'Encargado2026*', '"todas"'::jsonb, 'jmorales@elporvenir.com', '3137890123', true),
    ('USR-03', 'EMP-01', 'consultor', 'Dra. Elena Gómez (Consultor)', 'consultor', 'Consultor2026*', '"todas"'::jsonb, 'egomez@elporvenir.com', '3148901234', true)
ON CONFLICT (id) DO UPDATE SET 
    usuario = EXCLUDED.usuario,
    nombre = EXCLUDED.nombre,
    password = EXCLUDED.password;
