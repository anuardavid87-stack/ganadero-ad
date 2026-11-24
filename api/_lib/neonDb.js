// ============================================================================
// GANADERO AD - CAPA DE BASE DE DATOS SERVERLESS EN NEON POSTGRES
// Inicialización perezosa (@neondatabase/serverless), esquema idempotente
// completo (14 tablas ganaderas + 6 tablas WhatsApp Cloud API) y repositorio WA.
// ============================================================================

import { neon } from '@neondatabase/serverless';
import {
    normalizarTelefonoWhatsApp,
    sanitizarCanalParaFrontend
} from '../../frontend/src/core/whatsappCloudService.js';

let _sqlClient = null;
let _schemaEnsured = false;

export function getDatabaseUrl() {
    const pEnv = typeof process !== 'undefined' && process.env ? process.env : {};
    return (
        pEnv.DATABASE_URL ||
        pEnv.POSTGRES_URL ||
        pEnv.DATABASE_URL_UNPOOLED ||
        pEnv.POSTGRES_URL_NON_POOLING ||
        ''
    ).trim();
}

export function getSql() {
    if (_sqlClient) return _sqlClient;
    const url = getDatabaseUrl();
    if (!url) {
        throw new Error('DATABASE_URL no está configurada en las variables de entorno del servidor.');
    }
    _sqlClient = neon(url);
    return _sqlClient;
}

export function setCorsHeaders(req, res) {
    const origin = req?.headers?.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin === 'null' ? '*' : origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Empresa-Id, X-Ganadero-Rol, X-Ganadero-Usuario, X-Session-Token, X-Migration-Token'
    );
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
}

export function normDateSQL(val) {
    if (val === null || val === undefined || val === '') return null;
    if (val instanceof Date) {
        if (isNaN(val.getTime())) return null;
        return val.toISOString().slice(0, 10);
    }
    const s = String(val).trim();
    if (!s || s === 'null' || s === 'undefined' || s === '-' || s.toLowerCase() === 'n/a') return null;
    const mIso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (mIso) {
        return `${mIso[1]}-${mIso[2].padStart(2, '0')}-${mIso[3].padStart(2, '0')}`;
    }
    const mDmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (mDmy) {
        return `${mDmy[3]}-${mDmy[2].padStart(2, '0')}-${mDmy[1].padStart(2, '0')}`;
    }
    return null;
}

export function normTimestampSQL(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString();
    const s = String(val).trim();
    if (!s) return null;
    if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000).toISOString();
    if (/^\d{13}$/.test(s)) return new Date(Number(s)).toISOString();
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString();
}

export function formatDateOut(val) {
    if (val === null || val === undefined) return null;
    if (val instanceof Date) {
        if (isNaN(val.getTime())) return null;
        return val.toISOString().slice(0, 10);
    }
    const s = String(val);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return s;
}

export function formatTsOut(val) {
    if (val === null || val === undefined) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString();
    return String(val);
}

export function numOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

export function numOrZero(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Crea de forma idempotente todas las tablas e índices de Ganadero AD y WhatsApp Cloud API en Neon.
 */
export async function ensureNeonSchema(sql = getSql(), force = false) {
    if (_schemaEnsured && !force) return true;

    const ddlStatements = [
        `CREATE EXTENSION IF NOT EXISTS pgcrypto`,

        `CREATE TABLE IF NOT EXISTS public.empresas (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            nit TEXT NOT NULL,
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
        )`,

        `CREATE TABLE IF NOT EXISTS public.fincas (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id TEXT,
            codigo TEXT NOT NULL,
            nombre TEXT NOT NULL,
            ubicacion TEXT,
            area_ha NUMERIC(10,2) DEFAULT 0,
            precio_leche_litro NUMERIC(10,2) DEFAULT 2450.00,
            precio_carne_kg_pie NUMERIC(10,2) DEFAULT 8900.00,
            creado_en TIMESTAMPTZ DEFAULT now(),
            actualizado_en TIMESTAMPTZ DEFAULT now()
        )`,
        `CREATE INDEX IF NOT EXISTS idx_fincas_empresa_id ON public.fincas (empresa_id)`,
        `CREATE INDEX IF NOT EXISTS idx_fincas_actualizado ON public.fincas (actualizado_en DESC)`,

        `CREATE TABLE IF NOT EXISTS public.usuarios (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id TEXT,
            empresas_asignadas JSONB DEFAULT '[]'::jsonb,
            usuario TEXT UNIQUE NOT NULL,
            nombre TEXT NOT NULL,
            rol TEXT NOT NULL DEFAULT 'encargado',
            password TEXT,
            fincas_asignadas JSONB DEFAULT '"todas"'::jsonb,
            email TEXT,
            telefono TEXT,
            activo BOOLEAN DEFAULT TRUE,
            creado_en TIMESTAMPTZ DEFAULT now()
        )`,
        `ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS empresas_asignadas JSONB DEFAULT '[]'::jsonb`,
        `CREATE INDEX IF NOT EXISTS idx_usuarios_empresa_id ON public.usuarios (empresa_id)`,

        `CREATE TABLE IF NOT EXISTS public.costos_fijos_finca (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            finca_id TEXT NOT NULL UNIQUE REFERENCES public.fincas(id) ON DELETE CASCADE,
            nomina NUMERIC(14,2) DEFAULT 0,
            insumos NUMERIC(14,2) DEFAULT 0,
            herbicidas NUMERIC(14,2) DEFAULT 0,
            maquinaria NUMERIC(14,2) DEFAULT 0,
            servicios NUMERIC(14,2) DEFAULT 0,
            otros NUMERIC(14,2) DEFAULT 0,
            actualizado_en TIMESTAMPTZ DEFAULT now()
        )`,

        `CREATE TABLE IF NOT EXISTS public.inversiones_diferidas (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            finca_id TEXT NOT NULL REFERENCES public.fincas(id) ON DELETE CASCADE,
            descripcion_activo TEXT NOT NULL,
            monto_total_inversion NUMERIC(14,2) NOT NULL DEFAULT 0,
            plazo_meses_diferido INT NOT NULL DEFAULT 12,
            cuota_mensual NUMERIC(14,2) DEFAULT 0,
            estado TEXT DEFAULT 'Activa',
            creado_en TIMESTAMPTZ DEFAULT now()
        )`,
        `CREATE INDEX IF NOT EXISTS idx_inversiones_finca_id ON public.inversiones_diferidas (finca_id)`,

        `CREATE TABLE IF NOT EXISTS public.animales (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            finca_id TEXT NOT NULL REFERENCES public.fincas(id) ON DELETE CASCADE,
            identificacion_tag TEXT NOT NULL,
            nombre_alias TEXT,
            especie TEXT NOT NULL DEFAULT 'bovino',
            raza TEXT NOT NULL DEFAULT 'Común',
            sexo TEXT NOT NULL DEFAULT 'hembra',
            categoria TEXT NOT NULL DEFAULT 'General',
            lote TEXT NOT NULL DEFAULT 'General',
            fecha_nacimiento DATE,
            padre_tag TEXT,
            madre_tag TEXT,
            estado_vida TEXT DEFAULT 'activo',
            estado_reproductivo TEXT DEFAULT 'Vacía',
            dias_gestacion_actual INT DEFAULT 0,
            fecha_ultimo_parto DATE,
            ultimo_peso_kg NUMERIC(8,2),
            fecha_ultimo_pesaje DATE,
            gdp_promedio_g_dia NUMERIC(9,2),
            promedio_leche_diaria_l NUMERIC(6,2) DEFAULT 0,
            partos_previos JSONB DEFAULT '[]'::jsonb,
            creado_en TIMESTAMPTZ DEFAULT now(),
            actualizado_en TIMESTAMPTZ DEFAULT now(),
            CONSTRAINT uq_animal_finca_tag UNIQUE (finca_id, identificacion_tag)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_animales_finca_id ON public.animales (finca_id)`,
        `CREATE INDEX IF NOT EXISTS idx_animales_actualizado ON public.animales (actualizado_en DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_animales_tag_lower ON public.animales (lower(identificacion_tag))`,

        `CREATE TABLE IF NOT EXISTS public.servicios_reproductivos (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            finca_id TEXT NOT NULL REFERENCES public.fincas(id) ON DELETE CASCADE,
            animal_tag TEXT NOT NULL,
            tipo TEXT NOT NULL,
            fecha DATE NOT NULL DEFAULT CURRENT_DATE,
            reproductor TEXT NOT NULL DEFAULT '',
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
        )`,
        `CREATE INDEX IF NOT EXISTS idx_servicios_finca_id ON public.servicios_reproductivos (finca_id)`,

        `CREATE TABLE IF NOT EXISTS public.pesajes_animales (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            finca_id TEXT NOT NULL REFERENCES public.fincas(id) ON DELETE CASCADE,
            animal_tag TEXT NOT NULL,
            fecha_pesaje DATE NOT NULL DEFAULT CURRENT_DATE,
            peso_kg NUMERIC(8,2) NOT NULL DEFAULT 0,
            gdp_calculada_g_dia NUMERIC(9,2),
            notas TEXT,
            creado_en TIMESTAMPTZ DEFAULT now()
        )`,
        `CREATE INDEX IF NOT EXISTS idx_pesajes_finca_fecha ON public.pesajes_animales (finca_id, fecha_pesaje DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_pesajes_creado ON public.pesajes_animales (creado_en DESC)`,

        `CREATE TABLE IF NOT EXISTS public.palpaciones_reproductivas (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            finca_id TEXT NOT NULL REFERENCES public.fincas(id) ON DELETE CASCADE,
            animal_tag TEXT NOT NULL,
            fecha_palpacion DATE NOT NULL DEFAULT CURRENT_DATE,
            diagnostico TEXT NOT NULL,
            dias_gestacion_estimados INT DEFAULT 0,
            fecha_estimada_parto DATE,
            observaciones TEXT,
            creado_en TIMESTAMPTZ DEFAULT now()
        )`,
        `CREATE INDEX IF NOT EXISTS idx_palpaciones_finca_id ON public.palpaciones_reproductivas (finca_id)`,

        `CREATE TABLE IF NOT EXISTS public.controles_lecheros (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            finca_id TEXT NOT NULL REFERENCES public.fincas(id) ON DELETE CASCADE,
            animal_tag TEXT NOT NULL,
            fecha_control DATE NOT NULL DEFAULT CURRENT_DATE,
            litros_manana NUMERIC(6,2) DEFAULT 0,
            litros_tarde NUMERIC(6,2) DEFAULT 0,
            total_litros NUMERIC(6,2) DEFAULT 0,
            creado_en TIMESTAMPTZ DEFAULT now()
        )`,
        `CREATE INDEX IF NOT EXISTS idx_controles_lecheros_finca_id ON public.controles_lecheros (finca_id)`,

        `CREATE TABLE IF NOT EXISTS public.traslados_animales (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id TEXT,
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
        )`,
        `CREATE INDEX IF NOT EXISTS idx_traslados_empresa_id ON public.traslados_animales (empresa_id)`,

        `CREATE TABLE IF NOT EXISTS public.operaciones_diarias (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id TEXT,
            fecha DATE NOT NULL DEFAULT CURRENT_DATE,
            finca_id TEXT,
            finca_nombre TEXT,
            accion TEXT,
            modulo TEXT,
            detalles JSONB DEFAULT '{}'::jsonb,
            usuario TEXT,
            creado_en TIMESTAMPTZ DEFAULT now()
        )`,
        `CREATE INDEX IF NOT EXISTS idx_ops_finca_creado ON public.operaciones_diarias (finca_id, creado_en DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_ops_creado ON public.operaciones_diarias (creado_en DESC)`,

        `CREATE TABLE IF NOT EXISTS public.nutricion_animales (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            finca_id TEXT NOT NULL REFERENCES public.fincas(id) ON DELETE CASCADE,
            animal_id TEXT,
            animal_tag TEXT NOT NULL,
            fecha_analisis DATE NOT NULL DEFAULT CURRENT_DATE,
            etapa_productiva TEXT DEFAULT 'General',
            talla_frame TEXT,
            condicion_corporal NUMERIC(3,1),
            peso_actual_kg NUMERIC(8,2),
            gdp_esperada_g_dia NUMERIC(9,2),
            sugerencia_dieta JSONB DEFAULT '{}'::jsonb,
            sugerencia_medicamentos JSONB DEFAULT '[]'::jsonb,
            sugerencia_hormonas JSONB DEFAULT '[]'::jsonb,
            analisis_ia TEXT,
            notas TEXT,
            creado_en TIMESTAMPTZ DEFAULT now(),
            CONSTRAINT uq_nutricion_finca_tag UNIQUE (finca_id, animal_tag)
        )`,

        `CREATE TABLE IF NOT EXISTS public.sesiones (
            token TEXT PRIMARY KEY,
            usuario_id TEXT NOT NULL,
            empresa_id TEXT,
            rol TEXT NOT NULL,
            creado_en TIMESTAMPTZ DEFAULT now(),
            expira_en TIMESTAMPTZ NOT NULL
        )`,

        // ====================================================================
        // TABLAS WHATSAPP CLOUD API v25.0 MULTITENANT (MULTI-EMPRESA / FINCA)
        // ====================================================================
        `CREATE TABLE IF NOT EXISTS public.whatsapp_channels (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            phone_number_id TEXT UNIQUE NOT NULL,
            waba_id TEXT,
            display_phone_number TEXT,
            nombre TEXT NOT NULL DEFAULT 'Canal WhatsApp Ganadero AD',
            tipo TEXT NOT NULL DEFAULT 'compartido' CHECK (tipo IN ('compartido', 'dedicado')),
            empresa_id TEXT NULL,
            access_token_override TEXT NULL,
            template_name TEXT DEFAULT 'notificacion_ganadero_ad',
            template_lang TEXT DEFAULT 'es',
            activo BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT now()
        )`,

        `CREATE TABLE IF NOT EXISTS public.whatsapp_contacts (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            telefono TEXT UNIQUE NOT NULL,
            nombre TEXT NOT NULL,
            activo BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT now()
        )`,

        `CREATE TABLE IF NOT EXISTS public.whatsapp_contact_access (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            contact_id TEXT NOT NULL REFERENCES public.whatsapp_contacts(id) ON DELETE CASCADE,
            empresa_id TEXT NOT NULL,
            finca_id TEXT NULL,
            rol TEXT NOT NULL DEFAULT 'operador' CHECK (rol IN ('operador', 'administrador', 'veterinario')),
            activo BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT now(),
            CONSTRAINT uq_whatsapp_contact_access UNIQUE (contact_id, empresa_id, finca_id)
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_contact_access_empresa_todas
            ON public.whatsapp_contact_access (contact_id, empresa_id) WHERE finca_id IS NULL`,
        `CREATE INDEX IF NOT EXISTS idx_whatsapp_contact_access_contact_id ON public.whatsapp_contact_access (contact_id)`,
        `CREATE INDEX IF NOT EXISTS idx_whatsapp_contact_access_empresa_id ON public.whatsapp_contact_access (empresa_id)`,

        `CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
            channel_id TEXT NOT NULL REFERENCES public.whatsapp_channels(id) ON DELETE CASCADE,
            telefono TEXT NOT NULL,
            last_inbound_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (channel_id, telefono)
        )`,

        `CREATE TABLE IF NOT EXISTS public.whatsapp_messages_log (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            empresa_id TEXT NULL,
            channel_id TEXT REFERENCES public.whatsapp_channels(id) ON DELETE SET NULL,
            telefono TEXT NOT NULL,
            direccion TEXT NOT NULL CHECK (direccion IN ('in', 'out')),
            tipo TEXT NOT NULL DEFAULT 'text' CHECK (tipo IN ('text', 'template')),
            wamid TEXT,
            contenido_resumen TEXT,
            created_at TIMESTAMPTZ DEFAULT now()
        )`,
        `CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_log_empresa_fecha ON public.whatsapp_messages_log (empresa_id, created_at DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_log_wamid ON public.whatsapp_messages_log (wamid)`,

        `CREATE TABLE IF NOT EXISTS public.whatsapp_message_status (
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
        )`,
        `CREATE INDEX IF NOT EXISTS idx_whatsapp_message_status_empresa_fecha ON public.whatsapp_message_status (empresa_id, created_at DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_whatsapp_message_status_wamid ON public.whatsapp_message_status (wamid)`
    ];

    for (const stmt of ddlStatements) {
        await sql.query(stmt);
    }

    _schemaEnsured = true;
    return true;
}

/**
 * Ejecuta inserciones/upserts por lotes multi-fila para máxima velocidad en Neon HTTP serverless.
 */
export async function bulkUpsert(sql, {
    table,
    columns,
    jsonColumns = [],
    dateColumns = [],
    tsColumns = [],
    conflictTarget,
    updateColumns,
    rows,
    batchSize = 120
}) {
    if (!Array.isArray(rows) || rows.length === 0) return 0;
    const jsonSet = new Set(jsonColumns);
    const dateSet = new Set(dateColumns);
    const tsSet = new Set(tsColumns);
    const colList = columns.join(', ');
    const updateClause = updateColumns && updateColumns.length > 0
        ? `DO UPDATE SET ${updateColumns.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}`
        : 'DO NOTHING';

    const conflictCols = String(conflictTarget || '')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

    let total = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
        const rawChunk = rows.slice(i, i + batchSize);
        let chunk = rawChunk;
        if (conflictCols.length > 0 && rawChunk.length > 1) {
            const dedupMap = new Map();
            for (const r of rawChunk) {
                const k = conflictCols.map((c) => String(r?.[c] ?? '')).join('\u0000');
                dedupMap.set(k, r);
            }
            chunk = Array.from(dedupMap.values());
        }
        const values = [];
        const placeholders = [];
        let pIdx = 1;

        for (const row of chunk) {
            const rowPh = [];
            for (const col of columns) {
                let v = row[col];
                if (jsonSet.has(col)) {
                    v = v === undefined || v === null ? null : JSON.stringify(v);
                    rowPh.push(`$${pIdx}::jsonb`);
                } else if (dateSet.has(col)) {
                    v = normDateSQL(v);
                    rowPh.push(`$${pIdx}::date`);
                } else if (tsSet.has(col)) {
                    v = normTimestampSQL(v);
                    rowPh.push(`$${pIdx}::timestamptz`);
                } else {
                    if (v === undefined) v = null;
                    rowPh.push(`$${pIdx}`);
                }
                values.push(v);
                pIdx++;
            }
            placeholders.push(`(${rowPh.join(', ')})`);
        }

        const queryText = `INSERT INTO public.${table} (${colList}) VALUES ${placeholders.join(', ')} ON CONFLICT (${conflictTarget}) ${updateClause}`;
        await sql.query(queryText, values);
        total += chunk.length;
    }
    return total;
}

/**
 * Normaliza un registro de empresa desde Neon al formato esperado por el frontend.
 */
export function serializeEmpresaRow(r) {
    return {
        id: r.id,
        nit: r.nit,
        nombre: r.nombre,
        pais: r.pais || 'Colombia',
        moneda: r.moneda || 'COP',
        email: r.email || '',
        telefono: r.telefono || '',
        direccion: r.direccion || '',
        activa: r.activa !== false,
        fecha_vencimiento: r.fecha_vencimiento || '2027-09-15',
        tiempo_indefinido: Boolean(r.tiempo_indefinido),
        plan_vigencia: r.plan_vigencia || '1 Año',
        creado_en: formatTsOut(r.creado_en)
    };
}

export function serializeFincaRow(r) {
    return {
        id: r.id,
        empresa_id: r.empresa_id || null,
        codigo: r.codigo,
        nombre: r.nombre,
        ubicacion: r.ubicacion || '',
        area_ha: numOrZero(r.area_ha),
        precio_leche_litro: numOrZero(r.precio_leche_litro || 2450),
        precio_carne_kg_pie: numOrZero(r.precio_carne_kg_pie || 8900),
        creado_en: formatTsOut(r.creado_en),
        actualizado_en: formatTsOut(r.actualizado_en)
    };
}

export function serializeAnimalRow(r) {
    return {
        id: r.id,
        finca_id: r.finca_id,
        identificacion_tag: r.identificacion_tag,
        nombre_alias: r.nombre_alias || '',
        especie: r.especie || 'bovino',
        raza: r.raza || 'Común',
        sexo: r.sexo || 'hembra',
        categoria: r.categoria || 'General',
        lote: r.lote || 'General',
        fecha_nacimiento: formatDateOut(r.fecha_nacimiento),
        padre_tag: r.padre_tag || null,
        madre_tag: r.madre_tag || null,
        estado_vida: r.estado_vida || 'activo',
        estado_reproductivo: r.estado_reproductivo || 'Vacía',
        dias_gestacion_actual: numOrZero(r.dias_gestacion_actual),
        fecha_ultimo_parto: formatDateOut(r.fecha_ultimo_parto),
        ultimo_peso_kg: numOrNull(r.ultimo_peso_kg),
        fecha_ultimo_pesaje: formatDateOut(r.fecha_ultimo_pesaje),
        gdp_promedio_g_dia: numOrNull(r.gdp_promedio_g_dia),
        promedio_leche_diaria_l: numOrZero(r.promedio_leche_diaria_l),
        partos_previos: Array.isArray(r.partos_previos) ? r.partos_previos : [],
        creado_en: formatTsOut(r.creado_en),
        actualizado_en: formatTsOut(r.actualizado_en)
    };
}

export function serializePesajeRow(r) {
    return {
        id: r.id,
        finca_id: r.finca_id,
        animal_tag: r.animal_tag,
        fecha_pesaje: formatDateOut(r.fecha_pesaje),
        peso_kg: numOrZero(r.peso_kg),
        gdp_calculada_g_dia: numOrNull(r.gdp_calculada_g_dia),
        notas: r.notas || '',
        creado_en: formatTsOut(r.creado_en)
    };
}

export function serializeOperacionRow(r) {
    return {
        id: r.id,
        empresa_id: r.empresa_id || null,
        fecha: formatDateOut(r.fecha),
        finca_id: r.finca_id || null,
        finca_nombre: r.finca_nombre || '',
        accion: r.accion || '',
        modulo: r.modulo || '',
        detalles: r.detalles && typeof r.detalles === 'object' ? r.detalles : {},
        usuario: r.usuario || 'Sistema',
        creado_en: formatTsOut(r.creado_en)
    };
}

/**
 * Repositorio completo de WhatsApp Cloud API v25.0 sobre Neon Postgres (para /api/whatsapp y /api/whatsapp/panel).
 */
export function crearRepositorioWhatsAppNeon(sql = getSql()) {
    return {
        async obtenerCanalPorPhoneNumberId(phoneNumberId) {
            await ensureNeonSchema(sql);
            const rows = await sql.query(
                `SELECT * FROM public.whatsapp_channels WHERE phone_number_id = $1 AND activo = true LIMIT 1`,
                [String(phoneNumberId || '').trim()]
            );
            return rows[0] || null;
        },

        async obtenerCanalActivoEmpresa(empresaId) {
            await ensureNeonSchema(sql);
            if (empresaId) {
                const ded = await sql.query(
                    `SELECT * FROM public.whatsapp_channels WHERE tipo = 'dedicado' AND empresa_id = $1 AND activo = true LIMIT 1`,
                    [String(empresaId)]
                );
                if (ded[0]) return ded[0];
            }
            const shared = await sql.query(
                `SELECT * FROM public.whatsapp_channels WHERE tipo = 'compartido' AND activo = true LIMIT 1`
            );
            return shared[0] || null;
        },

        async obtenerContactoConAccesosPorTelefono(telefono) {
            await ensureNeonSchema(sql);
            const norm = normalizarTelefonoWhatsApp(telefono);
            if (!norm) return null;
            const contacts = await sql.query(
                `SELECT * FROM public.whatsapp_contacts WHERE telefono = $1 AND activo = true LIMIT 1`,
                [norm]
            );
            const c = contacts[0];
            if (!c) return null;
            const accesos = await sql.query(
                `SELECT * FROM public.whatsapp_contact_access WHERE contact_id = $1 AND activo = true`,
                [c.id]
            );
            return { contacto: c, accesos: accesos || [] };
        },

        async obtenerCatalogoEmpresasYFincas() {
            await ensureNeonSchema(sql);
            const [empresasRows, fincasRows, dirRows] = await Promise.all([
                sql.query(`SELECT id, nombre, activa FROM public.empresas`),
                sql.query(`SELECT id, empresa_id, nombre, ubicacion FROM public.fincas`),
                sql.query(`SELECT detalles FROM public.operaciones_diarias WHERE id = 'SYS_DIRECTORIO_EMPRESAS' LIMIT 1`)
            ]);
            const empresasMap = new Map();
            (empresasRows || []).forEach((e) => empresasMap.set(String(e.id), { id: e.id, nombre: e.nombre, activa: e.activa !== false }));
            const det = dirRows?.[0]?.detalles || {};
            if (Array.isArray(det.empresas)) {
                det.empresas.forEach((e) => {
                    if (e && e.id && !empresasMap.has(String(e.id))) {
                        empresasMap.set(String(e.id), { id: e.id, nombre: e.nombre, activa: e.activa !== false });
                    }
                });
            }
            const fincasEmpresaMap = det.fincasEmpresaMap || {};
            const fincas = (fincasRows || []).map((f) => {
                let empId = fincasEmpresaMap[f.id] || f.empresa_id || null;
                if (!empId && typeof f.ubicacion === 'string') {
                    const m = f.ubicacion.match(/^\[TENANT:([^\]]+)\]/);
                    if (m) empId = m[1].trim();
                }
                return { id: f.id, empresa_id: empId || 'EMP-01', nombre: f.nombre };
            });
            return { empresas: Array.from(empresasMap.values()), fincas };
        },

        async buscarAnimalesPorTagEnFincas(idAnimal, fincasIds = []) {
            await ensureNeonSchema(sql);
            if (!Array.isArray(fincasIds) || fincasIds.length === 0) return [];
            const tagClean = String(idAnimal || '').trim();
            const rows = await sql.query(
                `SELECT * FROM public.animales
                 WHERE finca_id = ANY($1::text[])
                   AND lower(identificacion_tag) = lower($2)
                   AND COALESCE(estado_vida, 'activo') = 'activo'`,
                [fincasIds.map(String), tagClean]
            );
            return (rows || []).map(serializeAnimalRow);
        },

        async registrarPesoAnimalEnFinca({ animal, idAnimal, pesoKg, fecha, remitente }) {
            await ensureNeonSchema(sql);
            const tagReal = String(animal?.identificacion_tag || animal?.identificacionTag || idAnimal || '').trim();
            const fincaId = String(animal?.finca_id || animal?.fincaId || '').trim();
            const fechaIso = normDateSQL(fecha) || new Date().toISOString().slice(0, 10);
            const pesoNum = Number(pesoKg);
            if (!tagReal || !fincaId || !Number.isFinite(pesoNum) || pesoNum <= 0) {
                return { exito: false, mensajeError: 'Datos inválidos para registrar pesaje.' };
            }

            let gdpCalc = null;
            const prevPeso = numOrNull(animal?.ultimo_peso_kg ?? animal?.ultimoPesoKg);
            const prevFecha = normDateSQL(animal?.fecha_ultimo_pesaje ?? animal?.fechaUltimoPesaje);
            if (prevPeso && prevFecha && prevFecha !== fechaIso) {
                const dias = Math.round((new Date(fechaIso).getTime() - new Date(prevFecha).getTime()) / 86400000);
                if (dias > 0) gdpCalc = Math.round(((pesoNum - prevPeso) * 1000) / dias);
            }

            const safeTag = tagReal.replace(/[^A-Za-z0-9_-]/g, '_');
            const idPesaje = `PES-${fincaId}-${safeTag}-${fechaIso}`;

            await sql.query(
                `UPDATE public.animales
                 SET ultimo_peso_kg = $1,
                     fecha_ultimo_pesaje = $2::date,
                     gdp_promedio_g_dia = COALESCE($3, gdp_promedio_g_dia),
                     actualizado_en = now()
                 WHERE finca_id = $4 AND lower(identificacion_tag) = lower($5)`,
                [pesoNum, fechaIso, gdpCalc, fincaId, tagReal]
            );

            await sql.query(
                `INSERT INTO public.pesajes_animales (id, finca_id, animal_tag, fecha_pesaje, peso_kg, gdp_calculada_g_dia, notas, creado_en)
                 VALUES ($1, $2, $3, $4::date, $5, $6, $7, now())
                 ON CONFLICT (id) DO UPDATE SET
                   peso_kg = EXCLUDED.peso_kg,
                   gdp_calculada_g_dia = EXCLUDED.gdp_calculada_g_dia,
                   notas = EXCLUDED.notas`,
                [idPesaje, fincaId, tagReal, fechaIso, pesoNum, gdpCalc, `Registrado vía WhatsApp (${normalizarTelefonoWhatsApp(remitente) || 'autorizado'})`]
            );

            return {
                exito: true,
                idPesaje,
                animal: {
                    ...animal,
                    ultimo_peso_kg: pesoNum,
                    fecha_ultimo_pesaje: fechaIso,
                    gdp_promedio_g_dia: gdpCalc !== null ? gdpCalc : (animal?.gdp_promedio_g_dia ?? null)
                },
                pesoAnterior: prevPeso || 0,
                pesoNuevo: pesoNum,
                pesoKg: pesoNum,
                gdp: gdpCalc,
                fecha: fechaIso
            };
        },

        async actualizarSesion24h(channelId, telefono, fechaIso = new Date().toISOString()) {
            await ensureNeonSchema(sql);
            const tel = normalizarTelefonoWhatsApp(telefono);
            if (!channelId || !tel) return null;
            await sql.query(
                `INSERT INTO public.whatsapp_sessions (channel_id, telefono, last_inbound_at, updated_at)
                 VALUES ($1, $2, $3::timestamptz, now())
                 ON CONFLICT (channel_id, telefono) DO UPDATE SET
                   last_inbound_at = EXCLUDED.last_inbound_at,
                   updated_at = now()`,
                [String(channelId), tel, fechaIso]
            );
            return { channel_id: channelId, telefono: tel, last_inbound_at: fechaIso };
        },

        async obtenerSesion24h(channelId, telefono) {
            await ensureNeonSchema(sql);
            const tel = normalizarTelefonoWhatsApp(telefono);
            if (!channelId || !tel) return null;
            const rows = await sql.query(
                `SELECT * FROM public.whatsapp_sessions WHERE channel_id = $1 AND telefono = $2 LIMIT 1`,
                [String(channelId), tel]
            );
            return rows[0] || null;
        },

        async insertarLogsMensajes(filas = []) {
            await ensureNeonSchema(sql);
            if (!Array.isArray(filas) || filas.length === 0) return [];
            for (const f of filas) {
                await sql.query(
                    `INSERT INTO public.whatsapp_messages_log (empresa_id, channel_id, telefono, direccion, tipo, wamid, contenido_resumen)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        f.empresa_id || null,
                        f.channel_id || null,
                        normalizarTelefonoWhatsApp(f.telefono || ''),
                        f.direccion === 'in' ? 'in' : 'out',
                        f.tipo === 'template' ? 'template' : 'text',
                        f.wamid || null,
                        String(f.contenido_resumen || '').slice(0, 500)
                    ]
                );
            }
            return filas;
        },

        async registrarEstadoMensaje(statusObj = {}, channelId = null, empresaIdFallback = null) {
            await ensureNeonSchema(sql);
            const wamid = String(statusObj.id || statusObj.wamid || '').trim();
            if (!wamid) return null;
            let empId = empresaIdFallback || null;
            if (!empId) {
                const prev = await sql.query(
                    `SELECT empresa_id FROM public.whatsapp_messages_log WHERE wamid = $1 AND empresa_id IS NOT NULL LIMIT 1`,
                    [wamid]
                );
                if (prev[0]?.empresa_id) empId = prev[0].empresa_id;
            }
            const err0 = Array.isArray(statusObj.errors) && statusObj.errors[0] ? statusObj.errors[0] : {};
            const tsIso = normTimestampSQL(statusObj.timestamp) || new Date().toISOString();
            await sql.query(
                `INSERT INTO public.whatsapp_message_status
                 (empresa_id, channel_id, wamid, recipient_id, status, error_code, error_title, error_details, timestamp)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz)`,
                [
                    empId,
                    channelId || null,
                    wamid,
                    normalizarTelefonoWhatsApp(statusObj.recipient_id || ''),
                    String(statusObj.status || 'sent'),
                    err0.code ? String(err0.code) : (statusObj.error_code ? String(statusObj.error_code) : null),
                    err0.title || statusObj.error_title || null,
                    err0.error_data?.details || err0.message || statusObj.error_details || null,
                    tsIso
                ]
            );
            return { ok: true, wamid, empresa_id: empId };
        },

        async cargarDatosPanel({ esSuperAdmin = false, empresaId = null } = {}) {
            await ensureNeonSchema(sql);
            const [channels, contacts, access, logs, statuses] = await Promise.all([
                esSuperAdmin
                    ? sql.query(`SELECT * FROM public.whatsapp_channels ORDER BY tipo ASC, created_at ASC`)
                    : sql.query(`SELECT * FROM public.whatsapp_channels WHERE tipo = 'compartido' OR empresa_id = $1 ORDER BY tipo ASC, created_at ASC`, [String(empresaId || '')]),
                sql.query(`SELECT * FROM public.whatsapp_contacts ORDER BY created_at DESC`),
                esSuperAdmin
                    ? sql.query(`SELECT * FROM public.whatsapp_contact_access ORDER BY created_at ASC`)
                    : sql.query(`SELECT * FROM public.whatsapp_contact_access WHERE empresa_id = $1 ORDER BY created_at ASC`, [String(empresaId || '')]),
                esSuperAdmin
                    ? sql.query(`SELECT * FROM public.whatsapp_messages_log ORDER BY created_at DESC LIMIT 300`)
                    : sql.query(`SELECT * FROM public.whatsapp_messages_log WHERE empresa_id = $1 ORDER BY created_at DESC LIMIT 300`, [String(empresaId || '')]),
                esSuperAdmin
                    ? sql.query(`SELECT * FROM public.whatsapp_message_status ORDER BY created_at DESC LIMIT 200`)
                    : sql.query(`SELECT * FROM public.whatsapp_message_status WHERE empresa_id = $1 ORDER BY created_at DESC LIMIT 200`, [String(empresaId || '')])
            ]);

            const accesosByContact = new Map();
            for (const acc of (access || [])) {
                if (!accesosByContact.has(acc.contact_id)) accesosByContact.set(acc.contact_id, []);
                accesosByContact.get(acc.contact_id).push(acc);
            }

            const contactsEnriched = (contacts || [])
                .map((c) => ({ ...c, telefono: normalizarTelefonoWhatsApp(c.telefono), accesos: accesosByContact.get(c.id) || [] }))
                .filter((c) => esSuperAdmin || c.accesos.length > 0);

            const sanitizedChannels = (channels || []).map(sanitizarCanalParaFrontend);

            return {
                ok: true,
                faltaMigracionSql: false,
                migracionPendiente: false,
                error: null,
                channels: sanitizedChannels,
                contacts: contactsEnriched,
                contactAccess: access || [],
                messagesLog: logs || [],
                messageStatus: statuses || []
            };
        },

        async guardarCanalPanel(datos = {}) {
            await ensureNeonSchema(sql);
            const phoneId = String(datos.phone_number_id || '').trim();
            if (!phoneId) return { ok: false, error: 'El phone_number_id de Meta es obligatorio.' };
            const tipo = datos.tipo === 'dedicado' ? 'dedicado' : 'compartido';
            const empId = tipo === 'dedicado' ? String(datos.empresa_id || '').trim() : null;
            if (tipo === 'dedicado' && !empId) {
                return { ok: false, error: 'Un canal dedicado requiere empresa_id.' };
            }
            const overrideToken = datos.access_token_override && String(datos.access_token_override).trim()
                ? String(datos.access_token_override).trim()
                : null;
            const rows = await sql.query(
                `INSERT INTO public.whatsapp_channels
                 (id, phone_number_id, waba_id, display_phone_number, nombre, tipo, empresa_id, access_token_override, template_name, template_lang, activo)
                 VALUES (COALESCE($1, gen_random_uuid()::text), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                 ON CONFLICT (phone_number_id) DO UPDATE SET
                   waba_id = EXCLUDED.waba_id,
                   display_phone_number = EXCLUDED.display_phone_number,
                   nombre = EXCLUDED.nombre,
                   tipo = EXCLUDED.tipo,
                   empresa_id = EXCLUDED.empresa_id,
                   access_token_override = COALESCE(EXCLUDED.access_token_override, public.whatsapp_channels.access_token_override),
                   template_name = EXCLUDED.template_name,
                   template_lang = EXCLUDED.template_lang,
                   activo = EXCLUDED.activo
                 RETURNING *`,
                [
                    datos.id || null,
                    phoneId,
                    datos.waba_id || '118927644541032',
                    datos.display_phone_number || '',
                    datos.nombre || (tipo === 'dedicado' ? `Canal Dedicado ${empId}` : 'Canal Compartido Ganadero AD'),
                    tipo,
                    empId,
                    overrideToken,
                    datos.template_name || 'notificacion_ganadero_ad',
                    datos.template_lang || 'es',
                    datos.activo !== false
                ]
            );
            const clean = sanitizarCanalParaFrontend(rows[0] || {});
            return { ok: true, channel: clean, canal: clean };
        },

        async cambiarEstadoCanalPanel({ channelId = null, phoneNumberId = null, activo = false } = {}) {
            await ensureNeonSchema(sql);
            if (!channelId && !phoneNumberId) return { ok: false, error: 'channelId o phoneNumberId requerido.' };
            if (channelId) {
                await sql.query(`UPDATE public.whatsapp_channels SET activo = $1 WHERE id = $2`, [Boolean(activo), String(channelId)]);
            } else {
                await sql.query(`UPDATE public.whatsapp_channels SET activo = $1 WHERE phone_number_id = $2`, [Boolean(activo), String(phoneNumberId)]);
            }
            return { ok: true };
        },

        async eliminarCanalPanel({ channelId = null, phoneNumberId = null } = {}) {
            await ensureNeonSchema(sql);
            if (!channelId && !phoneNumberId) return { ok: false, error: 'channelId o phoneNumberId requerido.' };
            if (channelId) {
                await sql.query(`DELETE FROM public.whatsapp_channels WHERE id = $1`, [String(channelId)]);
            }
            if (phoneNumberId) {
                await sql.query(`DELETE FROM public.whatsapp_channels WHERE phone_number_id = $1`, [String(phoneNumberId)]);
            }
            return { ok: true };
        },

        async guardarContactoConAccesosPanel({ contactId = null, telefono, nombre, activo = true, accesos = [], modoSuperAdmin = false, empresaIdContexto = null } = {}) {
            await ensureNeonSchema(sql);
            const tel = normalizarTelefonoWhatsApp(telefono);
            if (!tel || tel.length < 8) return { ok: false, error: 'Ingresa un teléfono válido (ej: 573017839578 o 3017839578).' };
            const canales = await sql.query(`SELECT phone_number_id, display_phone_number FROM public.whatsapp_channels`);
            const esPropioCanal = (canales || []).some(
                (ch) => normalizarTelefonoWhatsApp(ch.display_phone_number) === tel || String(ch.phone_number_id) === tel
            );
            if (esPropioCanal) {
                return { ok: false, error: 'No puedes registrar el propio número del canal de WhatsApp como contacto.' };
            }
            const nom = String(nombre || 'Operador Autorizado').trim() || tel;

            let contacto;
            if (contactId) {
                const updated = await sql.query(
                    `UPDATE public.whatsapp_contacts SET telefono = $1, nombre = $2, activo = $3 WHERE id = $4 RETURNING *`,
                    [tel, nom, activo !== false, contactId]
                );
                contacto = updated[0];
            }
            if (!contacto) {
                const upserted = await sql.query(
                    `INSERT INTO public.whatsapp_contacts (telefono, nombre, activo)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (telefono) DO UPDATE SET nombre = EXCLUDED.nombre, activo = EXCLUDED.activo
                     RETURNING *`,
                    [tel, nom, activo !== false]
                );
                contacto = upserted[0];
            }

            if (modoSuperAdmin) {
                await sql.query(`DELETE FROM public.whatsapp_contact_access WHERE contact_id = $1`, [contacto.id]);
            } else if (empresaIdContexto) {
                await sql.query(
                    `DELETE FROM public.whatsapp_contact_access WHERE contact_id = $1 AND empresa_id = $2`,
                    [contacto.id, String(empresaIdContexto)]
                );
            }

            const empresasConTodas = new Set();
            for (const acc of (Array.isArray(accesos) ? accesos : [])) {
                const empTarget = modoSuperAdmin ? String(acc.empresa_id || '').trim() : String(empresaIdContexto || acc.empresa_id || '').trim();
                if (!empTarget) continue;
                const fid = acc.finca_id ? String(acc.finca_id).trim() : null;
                const rol = ['operador', 'administrador', 'veterinario'].includes(String(acc.rol || '').toLowerCase())
                    ? String(acc.rol).toLowerCase()
                    : 'operador';
                if (fid === null) {
                    empresasConTodas.add(empTarget);
                    await sql.query(
                        `DELETE FROM public.whatsapp_contact_access WHERE contact_id = $1 AND empresa_id = $2`,
                        [contacto.id, empTarget]
                    );
                    await sql.query(
                        `INSERT INTO public.whatsapp_contact_access (contact_id, empresa_id, finca_id, rol, activo)
                         VALUES ($1, $2, NULL, $3, $4)
                         ON CONFLICT DO NOTHING`,
                        [contacto.id, empTarget, rol, acc.activo !== false]
                    );
                } else if (!empresasConTodas.has(empTarget)) {
                    await sql.query(
                        `INSERT INTO public.whatsapp_contact_access (contact_id, empresa_id, finca_id, rol, activo)
                         VALUES ($1, $2, $3, $4, $5)
                         ON CONFLICT DO NOTHING`,
                        [contacto.id, empTarget, fid, rol, acc.activo !== false]
                    );
                }
            }

            const accesosFinal = await sql.query(`SELECT * FROM public.whatsapp_contact_access WHERE contact_id = $1`, [contacto.id]);
            return {
                ok: true,
                data: { ok: true, contact_id: contacto.id, telefono: contacto.telefono },
                contacto: { ...contacto, accesos: accesosFinal || [] }
            };
        },

        async cambiarEstadoContactoPanel({ contactId, activo, empresaId = null, esSuperAdmin = false }) {
            await ensureNeonSchema(sql);
            if (!contactId) return { ok: false, error: 'contactId requerido.' };
            if (esSuperAdmin) {
                await sql.query(`UPDATE public.whatsapp_contacts SET activo = $1 WHERE id = $2`, [Boolean(activo), contactId]);
            } else if (empresaId) {
                await sql.query(
                    `UPDATE public.whatsapp_contact_access SET activo = $1 WHERE contact_id = $2 AND empresa_id = $3`,
                    [Boolean(activo), contactId, String(empresaId)]
                );
            }
            return { ok: true };
        },

        async eliminarContactoPanel({ contactId, empresaId = null, esSuperAdmin = false }) {
            await ensureNeonSchema(sql);
            if (!contactId) return { ok: false, error: 'contactId requerido.' };
            if (esSuperAdmin) {
                await sql.query(`DELETE FROM public.whatsapp_contacts WHERE id = $1`, [contactId]);
            } else if (empresaId) {
                await sql.query(
                    `DELETE FROM public.whatsapp_contact_access WHERE contact_id = $1 AND empresa_id = $2`,
                    [contactId, String(empresaId)]
                );
            }
            return { ok: true };
        }
    };
}
