-- ============================================================================
-- BOVITRACK PRO PWA: ESQUEMA DE BASE DE DATOS RELACIONAL DE PRODUCCIÓN
-- Arquitectura Cloud/Offline para Agrotecnología Ganadera Multi-Predio (PostgreSQL 15+)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. TIPOS ENUMERADOS ESTRICTOS (DOMINIO ZOOTÉCNICO)
-- ----------------------------------------------------------------------------
CREATE TYPE rol_sistema_enum AS ENUM (
    'administrador',
    'propietario',
    'operario',
    'veterinario',
    'consulta'
);

CREATE TYPE especie_enum AS ENUM (
    'bovino',
    'bufalino'
);

CREATE TYPE sexo_enum AS ENUM (
    'hembra',
    'macho'
);

CREATE TYPE estado_vida_enum AS ENUM (
    'activo',
    'descarte',
    'vendido',
    'muerto'
);

CREATE TYPE categoria_ganado_enum AS ENUM (
    'vaca_ordeno',
    'vaca_seca',
    'novilla_vientre',
    'novilla_levante',
    'ternera_cria',
    'toro_reproductor',
    'novillo_ceba',
    'ternero_cria'
);

CREATE TYPE estado_reproductivo_enum AS ENUM (
    'vacia',
    'prenada',
    'servida_inseminada',
    'dudosa',
    'no_aplica'
);

CREATE TYPE resultado_diagnostico_repro_enum AS ENUM (
    'prenada',
    'vacia',
    'sospechosa'
);

CREATE TYPE tipo_servicio_reproductivo_enum AS ENUM (
    'inseminacion_artificial',
    'transferencia_embriones',
    'monta_natural'
);

CREATE TYPE severidad_alerta_enum AS ENUM (
    'critica',
    'advertencia',
    'sanidad_preventiva'
);

-- ----------------------------------------------------------------------------
-- 2. ADMINISTRACIÓN MULTI-FINCA Y PARÁMETROS ECONÓMICOS
-- ----------------------------------------------------------------------------
CREATE TABLE fincas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(30) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    ubicacion VARCHAR(255) NOT NULL,
    municipio VARCHAR(100),
    departamento_estado VARCHAR(100),
    area_total_ha NUMERIC(10, 2) NOT NULL CHECK (area_total_ha > 0),
    area_pastoreo_ha NUMERIC(10, 2) CHECK (area_pastoreo_ha > 0),
    -- Parámetros Económicos de Mercado Actual
    precio_leche_litro NUMERIC(10, 2) NOT NULL DEFAULT 2400.00 CHECK (precio_leche_litro >= 0),
    precio_carne_kg_pie NUMERIC(10, 2) NOT NULL DEFAULT 8800.00 CHECK (precio_carne_kg_pie >= 0),
    moneda VARCHAR(5) DEFAULT 'COP',
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Usuarios del Sistema y Control de Acceso (RBAC)
CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(120) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(150) NOT NULL,
    telefono VARCHAR(30),
    rol rol_sistema_enum NOT NULL DEFAULT 'operario',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    ultimo_login TIMESTAMP WITH TIME ZONE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Relación N:M Fincas - Usuarios
CREATE TABLE fincas_usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    finca_id UUID NOT NULL REFERENCES fincas(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    rol_en_finca rol_sistema_enum NOT NULL,
    es_predeterminada BOOLEAN DEFAULT FALSE,
    asignado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_finca_usuario UNIQUE (finca_id, usuario_id)
);

-- ----------------------------------------------------------------------------
-- 3. MÓDULO FINANCIERO: COSTOS FIJOS E INVERSIONES DIFERIDAS AMORTIZABLES
-- ----------------------------------------------------------------------------
CREATE TABLE costos_fijos_finca (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    finca_id UUID NOT NULL REFERENCES fincas(id) ON DELETE CASCADE,
    periodo_anio INT NOT NULL CHECK (periodo_anio BETWEEN 2020 AND 2100),
    periodo_mes INT NOT NULL CHECK (periodo_mes BETWEEN 1 AND 12),
    nomina_fija NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (nomina_fija >= 0),
    insumos_veterinarios_sales NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (insumos_veterinarios_sales >= 0),
    fertilizantes_herbicidas NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (fertilizantes_herbicidas >= 0),
    combustibles_mantenimiento NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (combustibles_mantenimiento >= 0),
    servicios_publicos_canon NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (servicios_publicos_canon >= 0),
    otros_gastos_operativos NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (otros_gastos_operativos >= 0),
    total_costos_fijos NUMERIC(14, 2) GENERATED ALWAYS AS (
        nomina_fija + insumos_veterinarios_sales + fertilizantes_herbicidas +
        combustibles_mantenimiento + servicios_publicos_canon + otros_gastos_operativos
    ) STORED,
    fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_finca_periodo_costos UNIQUE (finca_id, periodo_anio, periodo_mes)
);

-- Inversiones de Capital Amortizables (Diferidas)
CREATE TABLE inversiones_diferidas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    finca_id UUID NOT NULL REFERENCES fincas(id) ON DELETE CASCADE,
    descripcion_activo VARCHAR(255) NOT NULL,
    categoria_activo VARCHAR(100) DEFAULT 'Infraestructura / Maquinaria',
    monto_total_inversion NUMERIC(14, 2) NOT NULL CHECK (monto_total_inversion > 0),
    fecha_inicio DATE NOT NULL,
    plazo_meses_diferido INT NOT NULL CHECK (plazo_meses_diferido > 0),
    cuota_mensual_amortizacion NUMERIC(14, 2) GENERATED ALWAYS AS (
        ROUND(monto_total_inversion / plazo_meses_diferido, 2)
    ) STORED,
    estado VARCHAR(20) DEFAULT 'Activa' CHECK (estado IN ('Activa', 'Completada', 'Cancelada')),
    registrado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 4. INVENTARIO ZOOTÉCNICO: ANIMALES
-- ----------------------------------------------------------------------------
CREATE TABLE animales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    finca_id UUID NOT NULL REFERENCES fincas(id) ON DELETE CASCADE,
    identificacion_tag VARCHAR(40) NOT NULL, -- Arete visual / Caravana
    chip_rfid VARCHAR(60),
    nombre_alias VARCHAR(100),
    especie especie_enum NOT NULL DEFAULT 'bovino',
    raza VARCHAR(100) NOT NULL,
    sexo sexo_enum NOT NULL,
    fecha_nacimiento DATE NOT NULL,
    padre_tag VARCHAR(40),
    madre_tag VARCHAR(40),
    categoria categoria_ganado_enum NOT NULL,
    lote VARCHAR(80) NOT NULL DEFAULT 'General',
    potrero_actual VARCHAR(100),
    estado_vida estado_vida_enum NOT NULL DEFAULT 'activo',
    estado_reproductivo estado_reproductivo_enum NOT NULL DEFAULT 'vacia',
    -- Campos calculados zootécnicos cacheados
    fecha_ultimo_parto DATE,
    dias_gestacion_actual INT DEFAULT 0 CHECK (dias_gestacion_actual >= 0),
    ultimo_peso_kg NUMERIC(6, 2) CHECK (ultimo_peso_kg > 0),
    fecha_ultimo_pesaje DATE,
    gdp_promedio_g_dia NUMERIC(6, 1),
    condicion_corporal NUMERIC(3, 2) CHECK (condicion_corporal BETWEEN 1.0 AND 5.0),
    promedio_leche_diaria_l NUMERIC(5, 2) DEFAULT 0,
    es_candidato_descarte BOOLEAN DEFAULT FALSE,
    motivo_descarte TEXT,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_finca_tag_animal UNIQUE (finca_id, identificacion_tag)
);

-- ----------------------------------------------------------------------------
-- 5. EVENTOS ZOOTÉCNICOS EN CAMPO (CUADRÍCULAS MASIVAS)
-- ----------------------------------------------------------------------------

-- A. Pesajes de Animales y Ganancia Diaria de Peso
CREATE TABLE pesajes_animales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    animal_id UUID NOT NULL REFERENCES animales(id) ON DELETE CASCADE,
    fecha_pesaje DATE NOT NULL DEFAULT CURRENT_DATE,
    peso_kg NUMERIC(6, 2) NOT NULL CHECK (peso_kg > 0 AND peso_kg <= 1500),
    peso_previo_kg NUMERIC(6, 2),
    dias_entre_pesajes INT CHECK (dias_entre_pesajes >= 0),
    gdp_calculada_g_dia NUMERIC(7, 2),
    condicion_corporal NUMERIC(3, 2) CHECK (condicion_corporal BETWEEN 1.0 AND 5.0),
    notas TEXT,
    operario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    registrado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_animal_fecha_pesaje UNIQUE (animal_id, fecha_pesaje)
);

-- B. Palpaciones y Diagnósticos Ginecológicos Reproductivos
CREATE TABLE palpaciones_reproductivas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    animal_id UUID NOT NULL REFERENCES animales(id) ON DELETE CASCADE,
    fecha_palpacion DATE NOT NULL DEFAULT CURRENT_DATE,
    diagnostico resultado_diagnostico_repro_enum NOT NULL,
    dias_gestacion_estimados INT DEFAULT 0 CHECK (dias_gestacion_estimados >= 0 AND dias_gestacion_estimados <= 340),
    fecha_estimada_parto DATE,
    estructura_ovarica VARCHAR(120),
    observaciones TEXT,
    veterinario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    registrado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- C. Servicios Reproductivos (IA, Transferencia de Embriones y Monta con Toro)
CREATE TABLE servicios_reproductivos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    finca_id UUID NOT NULL REFERENCES fincas(id) ON DELETE CASCADE,
    animal_id UUID NOT NULL REFERENCES animales(id) ON DELETE CASCADE,
    tipo_servicio tipo_servicio_reproductivo_enum NOT NULL,
    fecha_servicio DATE NOT NULL DEFAULT CURRENT_DATE,
    reproductor_toro_pajilla VARCHAR(120) NOT NULL,
    codigo_pajilla VARCHAR(80),
    donadora_embrion VARCHAR(100),
    raza_semen_embrion VARCHAR(80),
    tecnico_responsable VARCHAR(120),
    protocolo_sincronizacion VARCHAR(120),
    resultado_servicio VARCHAR(40) DEFAULT 'Pendiente Chequeo' CHECK (resultado_servicio IN ('Pendiente Chequeo', 'Preñada Confirmada', 'Vacía / Repitió', 'Fallido')),
    fecha_ecografia_estimada DATE,
    fecha_palpacion_estimada DATE,
    fecha_parto_estimada DATE,
    observaciones TEXT,
    registrado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    registrado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- D. Controles de Producción Lechera
CREATE TABLE controles_lecheros (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    animal_id UUID NOT NULL REFERENCES animales(id) ON DELETE CASCADE,
    fecha_control DATE NOT NULL DEFAULT CURRENT_DATE,
    litros_turno_manana NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (litros_turno_manana >= 0),
    litros_turno_tarde NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (litros_turno_tarde >= 0),
    total_litros_dia NUMERIC(5, 2) GENERATED ALWAYS AS (litros_turno_manana + litros_turno_tarde) STORED,
    dias_en_leche_del INT CHECK (dias_en_leche_del >= 0),
    calidad_grasa_pct NUMERIC(4, 2),
    calidad_proteina_pct NUMERIC(4, 2),
    notas_ubre TEXT,
    operario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    registrado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_animal_control_leche_fecha UNIQUE (animal_id, fecha_control)
);

-- D. Partos y Destetes
CREATE TABLE registros_partos_destetes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    madre_id UUID NOT NULL REFERENCES animales(id) ON DELETE CASCADE,
    cria_id UUID REFERENCES animales(id) ON DELETE SET NULL,
    fecha_parto DATE NOT NULL,
    tipo_parto VARCHAR(60) DEFAULT 'Normal (Eutócico)',
    sexo_cria sexo_enum,
    peso_al_nacer_kg NUMERIC(5, 2) CHECK (peso_al_nacer_kg > 0 AND peso_al_nacer_kg < 90),
    tag_cria_generado VARCHAR(40),
    fecha_destete DATE,
    peso_destete_kg NUMERIC(6, 2) CHECK (peso_destete_kg > 0),
    dias_lactancia_destete INT,
    observaciones TEXT,
    operario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    registrado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 6. AUDITORÍA CON IA Y ALERTAS ZOOTÉCNICAS
-- ----------------------------------------------------------------------------
CREATE TABLE alertas_zootecnicas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    finca_id UUID NOT NULL REFERENCES fincas(id) ON DELETE CASCADE,
    animal_id UUID NOT NULL REFERENCES animales(id) ON DELETE CASCADE,
    codigo_regla VARCHAR(80) NOT NULL,
    severidad severidad_alerta_enum NOT NULL,
    titulo VARCHAR(160) NOT NULL,
    mensaje_detallado TEXT NOT NULL,
    valor_medido VARCHAR(80),
    valor_limite_esperado VARCHAR(80),
    resuelta BOOLEAN DEFAULT FALSE,
    fecha_generacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    fecha_resolucion TIMESTAMP WITH TIME ZONE,
    resuelta_por UUID REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE TABLE logs_auditoria_ia (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    finca_id UUID NOT NULL REFERENCES fincas(id) ON DELETE CASCADE,
    usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    modulo_evento VARCHAR(50) NOT NULL,
    tag_animal VARCHAR(40) NOT NULL,
    tipo_inconsistencia VARCHAR(100) NOT NULL,
    mensaje_ia TEXT NOT NULL,
    datos_enviados JSONB NOT NULL,
    fue_bloqueado BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 7. ÍNDICES DE RENDIMIENTO (OPTIMIZADOS PARA RESPUESTA < 10ms EN CAMPO)
-- ----------------------------------------------------------------------------
CREATE INDEX idx_bovitrack_animales_finca ON animales(finca_id, estado_vida);
CREATE INDEX idx_bovitrack_animales_lote ON animales(finca_id, lote);
CREATE INDEX idx_bovitrack_animales_categoria ON animales(categoria);
CREATE INDEX idx_bovitrack_pesajes_animal ON pesajes_animales(animal_id, fecha_pesaje DESC);
CREATE INDEX idx_bovitrack_repro_animal ON palpaciones_reproductivas(animal_id, fecha_palpacion DESC);
CREATE INDEX idx_bovitrack_leche_animal ON controles_lecheros(animal_id, fecha_control DESC);
CREATE INDEX idx_bovitrack_alertas_activas ON alertas_zootecnicas(finca_id, resuelta, severidad);
