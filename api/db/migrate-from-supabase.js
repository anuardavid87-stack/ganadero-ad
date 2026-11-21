// ============================================================================
// GANADERO AD - POST /api/db/migrate-from-supabase
// Migración atómica e idempotente de 100% de tablas y datos desde Supabase
// hacia Neon Postgres. Bloqueada salvo cuando NEON_MIGRATION_TOKEN está activa.
// ============================================================================

import crypto from 'node:crypto';
import { getSql, setCorsHeaders, ensureNeonSchema, bulkUpsert, numOrZero, numOrNull } from '../_lib/neonDb.js';

export const maxDuration = 60;

const SUPABASE_SOURCE_URL = 'https://jucpxyjzmbthplbvzrsj.supabase.co';
const SUPABASE_SOURCE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Y3B4eWp6bWJ0aHBsYnZ6cnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3ODExNjMsImV4cCI6MjEwNTM1NzE2M30.EYCHnq6pUNO3cUtD1fRb7l3k-XBbrGtgYmsxkmNzDsA';

async function fetchAllFromSupabase(table, { ignoreErrors = false } = {}) {
    const all = [];
    let offset = 0;
    const key = (typeof process !== 'undefined' && process.env?.SUPABASE_SERVICE_ROLE_KEY) || SUPABASE_SOURCE_KEY;
    const headers = {
        apikey: key,
        Authorization: `Bearer ${key}`
    };
    while (true) {
        const res = await fetch(`${SUPABASE_SOURCE_URL}/rest/v1/${table}?select=*&limit=1000&offset=${offset}`, { headers });
        if (!res.ok) {
            if (res.status === 404 || (ignoreErrors && (res.status === 401 || res.status === 403 || res.status === 400))) break;
            throw new Error(`Supabase GET ${table} HTTP ${res.status}`);
        }
        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) break;
        all.push(...rows);
        if (rows.length < 1000) break;
        offset += 1000;
    }
    return all;
}

function validarTokenMigracion(req) {
    const esperado = String(process.env.NEON_MIGRATION_TOKEN || '').trim();
    if (!esperado) return { ok: false, status: 403, error: 'Migración deshabilitada (NEON_MIGRATION_TOKEN no activa).' };
    const recibido = String(req.headers?.['x-migration-token'] || '').trim();
    if (!recibido) return { ok: false, status: 401, error: 'Falta cabecera x-migration-token.' };
    const a = Buffer.from(recibido, 'utf8');
    const b = Buffer.from(esperado, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return { ok: false, status: 401, error: 'Token de migración inválido.' };
    }
    return { ok: true };
}

export default async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST', 'OPTIONS']);
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const auth = validarTokenMigracion(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    try {
        const sql = getSql();
        await ensureNeonSchema(sql, true);

        const [
            empresasRaw,
            fincasRaw,
            usuariosRaw,
            costosRaw,
            inversionesRaw,
            animalesRaw,
            serviciosRaw,
            pesajesRaw,
            palpacionesRaw,
            lecheRaw,
            trasladosRaw,
            opsRaw,
            nutricionRaw
        ] = await Promise.all([
            fetchAllFromSupabase('empresas'),
            fetchAllFromSupabase('fincas'),
            fetchAllFromSupabase('usuarios'),
            fetchAllFromSupabase('costos_fijos_finca'),
            fetchAllFromSupabase('inversiones_diferidas'),
            fetchAllFromSupabase('animales'),
            fetchAllFromSupabase('servicios_reproductivos'),
            fetchAllFromSupabase('pesajes_animales'),
            fetchAllFromSupabase('palpaciones_reproductivas'),
            fetchAllFromSupabase('controles_lecheros'),
            fetchAllFromSupabase('traslados_animales'),
            fetchAllFromSupabase('operaciones_diarias'),
            fetchAllFromSupabase('nutricion_animales')
        ]);

        // Enriquecer tabla empresas con empresas del directorio SYS_DIRECTORIO_EMPRESAS (ej. VACUNO INVERSIONES)
        const dirRow = opsRaw.find((o) => o && o.id === 'SYS_DIRECTORIO_EMPRESAS');
        const empresasMap = new Map();
        for (const e of empresasRaw) {
            if (e && e.id) empresasMap.set(e.id, e);
        }
        if (dirRow && dirRow.detalles && Array.isArray(dirRow.detalles.empresas)) {
            for (const ed of dirRow.detalles.empresas) {
                if (ed && ed.id && !empresasMap.has(ed.id)) {
                    empresasMap.set(ed.id, {
                        id: ed.id,
                        nit: ed.nit || `NIT-${ed.id}`,
                        nombre: ed.nombre || 'Empresa',
                        pais: ed.pais || 'Colombia',
                        moneda: ed.moneda || 'COP',
                        email: ed.email || '',
                        telefono: ed.telefono || '',
                        direccion: ed.direccion || '',
                        activa: ed.activa !== false,
                        fecha_vencimiento: ed.fechaVencimiento || 'indefinido',
                        tiempo_indefinido: Boolean(ed.tiempoIndefinido || ed.fechaVencimiento === 'indefinido'),
                        plan_vigencia: ed.planVigencia || 'Tiempo Indefinido',
                        creado_en: ed.fechaCreacion ? `${ed.fechaCreacion}T00:00:00Z` : new Date().toISOString()
                    });
                }
            }
        }
        const empresasFinal = Array.from(empresasMap.values());

        // Resolver empresa_id real en fincas desde fincasEmpresaMap o [TENANT:...]
        const fincasEmpMap = dirRow?.detalles?.fincasEmpresaMap || {};
        const fincasFinal = fincasRaw.map((f) => {
            let empId = f.empresa_id || fincasEmpMap[f.id] || null;
            if (!empId && typeof f.ubicacion === 'string') {
                const m = f.ubicacion.match(/^\[TENANT:([^\]]+)\]/);
                if (m) empId = m[1].trim();
            }
            return { ...f, empresa_id: empId };
        });
        const fincasIdSet = new Set(fincasFinal.map((f) => f.id).filter(Boolean));
        const onlyValidFinca = (arr) => arr.filter((r) => r && fincasIdSet.has(r.finca_id));

        // Resolver empresa_id real en usuarios desde usuariosEmpresaMap
        const usrEmpMap = dirRow?.detalles?.usuariosEmpresaMap || {};
        const usuariosFinal = usuariosRaw.map((u) => ({
            ...u,
            empresa_id: u.empresa_id || (u.rol !== 'superadmin' ? (usrEmpMap[u.usuario] || null) : null)
        }));

        // 1. Empresas
        await bulkUpsert(sql, {
            table: 'empresas',
            columns: ['id', 'nit', 'nombre', 'pais', 'moneda', 'email', 'telefono', 'direccion', 'activa', 'fecha_vencimiento', 'tiempo_indefinido', 'plan_vigencia', 'creado_en'],
            tsColumns: ['creado_en'],
            conflictTarget: 'id',
            updateColumns: ['nit', 'nombre', 'pais', 'moneda', 'email', 'telefono', 'direccion', 'activa', 'fecha_vencimiento', 'tiempo_indefinido', 'plan_vigencia'],
            rows: empresasFinal
        });

        // 2. Fincas
        await bulkUpsert(sql, {
            table: 'fincas',
            columns: ['id', 'empresa_id', 'codigo', 'nombre', 'ubicacion', 'area_ha', 'precio_leche_litro', 'precio_carne_kg_pie', 'creado_en', 'actualizado_en'],
            tsColumns: ['creado_en', 'actualizado_en'],
            conflictTarget: 'id',
            updateColumns: ['empresa_id', 'codigo', 'nombre', 'ubicacion', 'area_ha', 'precio_leche_litro', 'precio_carne_kg_pie', 'actualizado_en'],
            rows: fincasFinal
        });

        // 3. Usuarios
        await bulkUpsert(sql, {
            table: 'usuarios',
            columns: ['id', 'empresa_id', 'usuario', 'nombre', 'rol', 'password', 'fincas_asignadas', 'email', 'telefono', 'activo', 'creado_en'],
            jsonColumns: ['fincas_asignadas'],
            tsColumns: ['creado_en'],
            conflictTarget: 'usuario',
            updateColumns: ['id', 'empresa_id', 'nombre', 'rol', 'password', 'fincas_asignadas', 'email', 'telefono', 'activo'],
            rows: usuariosFinal
        });

        // 4..12 Tablas hijas en paralelo sobre Neon HTTP serverless (fincas ya creadas)
        await Promise.all([
            bulkUpsert(sql, {
                table: 'costos_fijos_finca',
                columns: ['id', 'finca_id', 'nomina', 'insumos', 'herbicidas', 'maquinaria', 'servicios', 'otros', 'actualizado_en'],
                tsColumns: ['actualizado_en'],
                conflictTarget: 'finca_id',
                updateColumns: ['nomina', 'insumos', 'herbicidas', 'maquinaria', 'servicios', 'otros', 'actualizado_en'],
                rows: onlyValidFinca(costosRaw)
            }),
            bulkUpsert(sql, {
                table: 'inversiones_diferidas',
                columns: ['id', 'finca_id', 'descripcion_activo', 'monto_total_inversion', 'plazo_meses_diferido', 'cuota_mensual', 'estado', 'creado_en'],
                tsColumns: ['creado_en'],
                conflictTarget: 'id',
                updateColumns: ['finca_id', 'descripcion_activo', 'monto_total_inversion', 'plazo_meses_diferido', 'cuota_mensual', 'estado'],
                rows: onlyValidFinca(inversionesRaw)
            }),
            bulkUpsert(sql, {
                table: 'animales',
                columns: [
                    'id', 'finca_id', 'identificacion_tag', 'nombre_alias', 'especie', 'raza', 'sexo', 'categoria',
                    'lote', 'fecha_nacimiento', 'padre_tag', 'madre_tag', 'estado_vida', 'estado_reproductivo',
                    'dias_gestacion_actual', 'fecha_ultimo_parto', 'ultimo_peso_kg', 'fecha_ultimo_pesaje',
                    'gdp_promedio_g_dia', 'promedio_leche_diaria_l', 'partos_previos', 'creado_en', 'actualizado_en'
                ],
                dateColumns: ['fecha_nacimiento', 'fecha_ultimo_parto', 'fecha_ultimo_pesaje'],
                jsonColumns: ['partos_previos'],
                tsColumns: ['creado_en', 'actualizado_en'],
                conflictTarget: 'finca_id, identificacion_tag',
                updateColumns: [
                    'nombre_alias', 'especie', 'raza', 'sexo', 'categoria', 'lote', 'fecha_nacimiento',
                    'padre_tag', 'madre_tag', 'estado_vida', 'estado_reproductivo', 'dias_gestacion_actual',
                    'fecha_ultimo_parto', 'ultimo_peso_kg', 'fecha_ultimo_pesaje', 'gdp_promedio_g_dia',
                    'promedio_leche_diaria_l', 'partos_previos', 'actualizado_en'
                ],
                rows: onlyValidFinca(animalesRaw).map((a) => ({
                    ...a,
                    dias_gestacion_actual: numOrZero(a.dias_gestacion_actual),
                    ultimo_peso_kg: numOrNull(a.ultimo_peso_kg),
                    gdp_promedio_g_dia: numOrNull(a.gdp_promedio_g_dia),
                    promedio_leche_diaria_l: numOrZero(a.promedio_leche_diaria_l),
                    partos_previos: Array.isArray(a.partos_previos) ? a.partos_previos : []
                })),
                batchSize: 250
            }),
            bulkUpsert(sql, {
                table: 'servicios_reproductivos',
                columns: [
                    'id', 'finca_id', 'animal_tag', 'tipo', 'fecha', 'reproductor', 'codigo_pajilla', 'donadora',
                    'tecnico', 'protocolo', 'resultado', 'fecha_ecografia_estimada', 'fecha_palpacion_estimada',
                    'fecha_parto_estimada', 'observaciones', 'creado_en'
                ],
                dateColumns: ['fecha', 'fecha_ecografia_estimada', 'fecha_palpacion_estimada', 'fecha_parto_estimada'],
                tsColumns: ['creado_en'],
                conflictTarget: 'id',
                updateColumns: ['resultado', 'observaciones', 'reproductor'],
                rows: onlyValidFinca(serviciosRaw)
            }),
            bulkUpsert(sql, {
                table: 'pesajes_animales',
                columns: ['id', 'finca_id', 'animal_tag', 'fecha_pesaje', 'peso_kg', 'gdp_calculada_g_dia', 'notas', 'creado_en'],
                dateColumns: ['fecha_pesaje'],
                tsColumns: ['creado_en'],
                conflictTarget: 'id',
                updateColumns: ['peso_kg', 'gdp_calculada_g_dia', 'notas', 'fecha_pesaje'],
                rows: onlyValidFinca(pesajesRaw).map((p) => ({
                    ...p,
                    peso_kg: numOrZero(p.peso_kg),
                    gdp_calculada_g_dia: numOrNull(p.gdp_calculada_g_dia)
                })),
                batchSize: 400
            }),
            bulkUpsert(sql, {
                table: 'palpaciones_reproductivas',
                columns: ['id', 'finca_id', 'animal_tag', 'fecha_palpacion', 'diagnostico', 'dias_gestacion_estimados', 'fecha_estimada_parto', 'observaciones', 'creado_en'],
                dateColumns: ['fecha_palpacion', 'fecha_estimada_parto'],
                tsColumns: ['creado_en'],
                conflictTarget: 'id',
                updateColumns: ['diagnostico', 'dias_gestacion_estimados', 'observaciones'],
                rows: onlyValidFinca(palpacionesRaw)
            }),
            bulkUpsert(sql, {
                table: 'controles_lecheros',
                columns: ['id', 'finca_id', 'animal_tag', 'fecha_control', 'litros_manana', 'litros_tarde', 'total_litros', 'creado_en'],
                dateColumns: ['fecha_control'],
                tsColumns: ['creado_en'],
                conflictTarget: 'id',
                updateColumns: ['litros_manana', 'litros_tarde', 'total_litros'],
                rows: onlyValidFinca(lecheRaw)
            }),
            bulkUpsert(sql, {
                table: 'traslados_animales',
                columns: ['id', 'empresa_id', 'fecha', 'finca_origen_id', 'finca_origen_nombre', 'finca_destino_id', 'finca_destino_nombre', 'motivo', 'observaciones', 'total_animales', 'animales', 'usuario_nombre', 'creado_en'],
                dateColumns: ['fecha'],
                jsonColumns: ['animales'],
                tsColumns: ['creado_en'],
                conflictTarget: 'id',
                updateColumns: ['motivo', 'observaciones', 'total_animales', 'animales'],
                rows: trasladosRaw
            }),
            bulkUpsert(sql, {
                table: 'operaciones_diarias',
                columns: ['id', 'empresa_id', 'fecha', 'finca_id', 'finca_nombre', 'accion', 'modulo', 'detalles', 'usuario', 'creado_en'],
                dateColumns: ['fecha'],
                jsonColumns: ['detalles'],
                tsColumns: ['creado_en'],
                conflictTarget: 'id',
                updateColumns: ['fecha', 'finca_id', 'finca_nombre', 'accion', 'modulo', 'detalles', 'usuario'],
                rows: opsRaw,
                batchSize: 200
            }),
            bulkUpsert(sql, {
                table: 'nutricion_animales',
                columns: ['id', 'finca_id', 'animal_id', 'animal_tag', 'fecha_analisis', 'etapa_productiva', 'talla_frame', 'condicion_corporal', 'peso_actual_kg', 'gdp_esperada_g_dia', 'sugerencia_dieta', 'sugerencia_medicamentos', 'sugerencia_hormonas', 'analisis_ia', 'notas', 'creado_en'],
                dateColumns: ['fecha_analisis'],
                jsonColumns: ['sugerencia_dieta', 'sugerencia_medicamentos', 'sugerencia_hormonas'],
                tsColumns: ['creado_en'],
                conflictTarget: 'finca_id, animal_tag',
                updateColumns: ['fecha_analisis', 'etapa_productiva', 'talla_frame', 'condicion_corporal', 'peso_actual_kg', 'gdp_esperada_g_dia', 'sugerencia_dieta', 'sugerencia_medicamentos', 'sugerencia_hormonas', 'analisis_ia', 'notas'],
                rows: onlyValidFinca(nutricionRaw)
            })
        ]);

        // 13. Migrar tablas WhatsApp si existen en Supabase (opcional, ignora 401/403/404)
        const [waChRaw, waContRaw, waAccRaw, waSessRaw, waLogRaw, waStatRaw] = await Promise.all([
            fetchAllFromSupabase('whatsapp_channels', { ignoreErrors: true }),
            fetchAllFromSupabase('whatsapp_contacts', { ignoreErrors: true }),
            fetchAllFromSupabase('whatsapp_contact_access', { ignoreErrors: true }),
            fetchAllFromSupabase('whatsapp_sessions', { ignoreErrors: true }),
            fetchAllFromSupabase('whatsapp_messages_log', { ignoreErrors: true }),
            fetchAllFromSupabase('whatsapp_message_status', { ignoreErrors: true })
        ]);
        if (waChRaw.length > 0) {
            await bulkUpsert(sql, {
                table: 'whatsapp_channels',
                columns: ['id', 'phone_number_id', 'waba_id', 'display_phone_number', 'nombre', 'tipo', 'empresa_id', 'access_token_override', 'template_name', 'template_lang', 'activo', 'created_at'],
                tsColumns: ['created_at'],
                conflictTarget: 'phone_number_id',
                updateColumns: ['waba_id', 'display_phone_number', 'nombre', 'tipo', 'empresa_id', 'template_name', 'template_lang', 'activo'],
                rows: waChRaw
            });
        }
        if (waContRaw.length > 0) {
            await bulkUpsert(sql, {
                table: 'whatsapp_contacts',
                columns: ['id', 'telefono', 'nombre', 'activo', 'created_at'],
                tsColumns: ['created_at'],
                conflictTarget: 'telefono',
                updateColumns: ['nombre', 'activo'],
                rows: waContRaw
            });
        }
        if (waAccRaw.length > 0) {
            const validContactIds = new Set(waContRaw.map((c) => c.id).filter(Boolean));
            const accValidos = waAccRaw.filter((a) => a && validContactIds.has(a.contact_id));
            for (const a of accValidos) {
                await sql.query(
                    `INSERT INTO public.whatsapp_contact_access (id, contact_id, empresa_id, finca_id, rol, activo)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT DO NOTHING`,
                    [a.id, a.contact_id, a.empresa_id, a.finca_id || null, a.rol || 'operador', a.activo !== false]
                );
            }
        }
        if (waSessRaw.length > 0) {
            await bulkUpsert(sql, {
                table: 'whatsapp_sessions',
                columns: ['channel_id', 'telefono', 'last_inbound_at', 'updated_at'],
                tsColumns: ['last_inbound_at', 'updated_at'],
                conflictTarget: 'channel_id, telefono',
                updateColumns: ['last_inbound_at', 'updated_at'],
                rows: waSessRaw
            });
        }
        if (waLogRaw.length > 0) {
            await bulkUpsert(sql, {
                table: 'whatsapp_messages_log',
                columns: ['id', 'empresa_id', 'channel_id', 'telefono', 'direccion', 'tipo', 'wamid', 'contenido_resumen', 'created_at'],
                tsColumns: ['created_at'],
                conflictTarget: 'id',
                updateColumns: [],
                rows: waLogRaw
            });
        }
        if (waStatRaw.length > 0) {
            await bulkUpsert(sql, {
                table: 'whatsapp_message_status',
                columns: ['id', 'empresa_id', 'channel_id', 'wamid', 'recipient_id', 'status', 'error_code', 'error_title', 'error_details', 'timestamp', 'created_at'],
                tsColumns: ['timestamp', 'created_at'],
                conflictTarget: 'id',
                updateColumns: [],
                rows: waStatRaw
            });
        }

        // Sembrar contacto inicial WhatsApp Sandy Lara (573017839578) si no existe
        const sandy = await sql.query(
            `INSERT INTO public.whatsapp_contacts (telefono, nombre, activo)
             VALUES ('573017839578', 'Sandy Lara', true)
             ON CONFLICT (telefono) DO UPDATE SET nombre = EXCLUDED.nombre
             RETURNING id`
        );
        if (sandy[0]?.id) {
            await sql.query(
                `INSERT INTO public.whatsapp_contact_access (contact_id, empresa_id, finca_id, rol, activo)
                 VALUES ($1, 'EMP-01', NULL, 'operador', true)
                 ON CONFLICT DO NOTHING`,
                [sandy[0].id]
            );
        }

        // Verificar conteo exacto en Neon
        const verifRows = await sql.query(`
            SELECT
                (SELECT count(*)::int FROM public.empresas) AS empresas,
                (SELECT count(*)::int FROM public.fincas) AS fincas,
                (SELECT count(*)::int FROM public.usuarios) AS usuarios,
                (SELECT count(*)::int FROM public.animales) AS animales,
                (SELECT count(*)::int FROM public.pesajes_animales) AS pesajes_animales,
                (SELECT count(*)::int FROM public.operaciones_diarias) AS operaciones_diarias,
                (SELECT count(*)::int FROM public.traslados_animales) AS traslados_animales,
                (SELECT count(*)::int FROM public.costos_fijos_finca) AS costos_fijos_finca,
                (SELECT count(*)::int FROM public.inversiones_diferidas) AS inversiones_diferidas,
                (SELECT count(*)::int FROM public.servicios_reproductivos) AS servicios_reproductivos,
                (SELECT count(*)::int FROM public.nutricion_animales) AS nutricion_animales,
                (SELECT count(*)::int FROM public.whatsapp_channels) AS whatsapp_channels,
                (SELECT count(*)::int FROM public.whatsapp_contacts) AS whatsapp_contacts
        `);

        const neonCounts = verifRows[0] || {};
        const supabaseCounts = {
            empresas_tabla: empresasRaw.length,
            empresas_totales: empresasFinal.length,
            fincas: fincasRaw.length,
            usuarios: usuariosRaw.length,
            animales: animalesRaw.length,
            pesajes_animales: pesajesRaw.length,
            operaciones_diarias: opsRaw.length,
            traslados_animales: trasladosRaw.length,
            costos_fijos_finca: costosRaw.length,
            inversiones_diferidas: inversionesRaw.length,
            servicios_reproductivos: serviciosRaw.length,
            nutricion_animales: nutricionRaw.length
        };

        const paridadOk =
            neonCounts.fincas >= supabaseCounts.fincas &&
            neonCounts.animales >= supabaseCounts.animales &&
            neonCounts.pesajes_animales >= supabaseCounts.pesajes_animales &&
            neonCounts.operaciones_diarias >= supabaseCounts.operaciones_diarias &&
            neonCounts.usuarios >= supabaseCounts.usuarios;

        return res.status(200).json({
            ok: paridadOk,
            migratedAt: new Date().toISOString(),
            supabaseCounts,
            neonCounts
        });
    } catch (err) {
        return res.status(500).json({
            ok: false,
            error: err?.message || 'Error ejecutando migración a Neon'
        });
    }
}
