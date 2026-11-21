// ============================================================================
// GANADERO AD - GET /api/db/probe
// Sonda ultraliviana (< 250 bytes) en Neon Postgres para detectar cambios
// remotos sin descargar tablas completas en recargas o heartbeats.
// ============================================================================

import { getSql, setCorsHeaders, ensureNeonSchema, formatTsOut } from '../_lib/neonDb.js';

export default async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET', 'OPTIONS']);
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const sql = getSql();
        await ensureNeonSchema(sql);

        const esSuperAdmin = String(req.query?.esSuperAdmin || '') === '1' ||
            String(req.headers?.['x-ganadero-rol'] || '').toLowerCase() === 'superadmin';
        const fincasParam = String(req.query?.fincasIds || '').trim();
        const fincasIds = fincasParam ? fincasParam.split(',').map((s) => s.trim()).filter(Boolean) : [];
        const filtrar = !esSuperAdmin && fincasIds.length > 0;

        const rows = filtrar
            ? await sql.query(`
                SELECT
                    (SELECT count(*)::int FROM public.fincas) AS c_fin,
                    (SELECT max(actualizado_en) FROM public.fincas) AS t_fin,
                    (SELECT count(*)::int FROM public.animales WHERE finca_id = ANY($1::text[])) AS c_anm,
                    (SELECT max(actualizado_en) FROM public.animales WHERE finca_id = ANY($1::text[])) AS t_anm,
                    (SELECT count(*)::int FROM public.pesajes_animales WHERE finca_id = ANY($1::text[])) AS c_pes,
                    (SELECT max(creado_en) FROM public.pesajes_animales WHERE finca_id = ANY($1::text[])) AS t_pes,
                    (SELECT count(*)::int FROM public.operaciones_diarias WHERE (finca_id IS NULL OR finca_id = ANY($1::text[])) AND id NOT LIKE 'ACT-PES-%') AS c_ops,
                    (SELECT max(creado_en) FROM public.operaciones_diarias WHERE (finca_id IS NULL OR finca_id = ANY($1::text[])) AND id NOT LIKE 'ACT-PES-%') AS t_ops,
                    (SELECT md5(COALESCE(detalles::text, '')) FROM public.operaciones_diarias WHERE id = 'SYS_DIRECTORIO_EMPRESAS' LIMIT 1) AS h_dir
            `, [fincasIds])
            : await sql.query(`
                SELECT
                    (SELECT count(*)::int FROM public.fincas) AS c_fin,
                    (SELECT max(actualizado_en) FROM public.fincas) AS t_fin,
                    (SELECT count(*)::int FROM public.animales) AS c_anm,
                    (SELECT max(actualizado_en) FROM public.animales) AS t_anm,
                    (SELECT count(*)::int FROM public.pesajes_animales) AS c_pes,
                    (SELECT max(creado_en) FROM public.pesajes_animales) AS t_pes,
                    (SELECT count(*)::int FROM public.operaciones_diarias WHERE id NOT LIKE 'ACT-PES-%') AS c_ops,
                    (SELECT max(creado_en) FROM public.operaciones_diarias WHERE id NOT LIKE 'ACT-PES-%') AS t_ops,
                    (SELECT md5(COALESCE(detalles::text, '')) FROM public.operaciones_diarias WHERE id = 'SYS_DIRECTORIO_EMPRESAS' LIMIT 1) AS h_dir
            `);

        const s = rows[0] || {};
        const firma = [
            `f:${s.c_fin || 0}:${formatTsOut(s.t_fin) || ''}`,
            `a:${s.c_anm || 0}:${formatTsOut(s.t_anm) || ''}`,
            `p:${s.c_pes || 0}:${formatTsOut(s.t_pes) || ''}`,
            `o:${s.c_ops || 0}:${formatTsOut(s.t_ops) || ''}`,
            `d:${s.h_dir || ''}`
        ].join('||');

        return res.status(200).json({ ok: true, firma });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err?.message || 'Error en sonda Neon' });
    }
}
