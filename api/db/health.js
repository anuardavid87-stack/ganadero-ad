// ============================================================================
// GANADERO AD - GET /api/db/health
// Verifica conectividad real con Neon Postgres y conteo por tabla (sin secretos).
// ============================================================================

import { getSql, getDatabaseUrl, setCorsHeaders, ensureNeonSchema } from '../_lib/neonDb.js';

export default async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET', 'OPTIONS']);
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!getDatabaseUrl()) {
        return res.status(500).json({ ok: false, provider: 'neon', error: 'DATABASE_URL no configurada en Vercel.' });
    }

    try {
        const sql = getSql();
        await ensureNeonSchema(sql);
        const rows = await sql.query(`
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
                (SELECT count(*)::int FROM public.whatsapp_contacts) AS whatsapp_contacts,
                now() AS server_time
        `);
        const stats = rows[0] || {};
        return res.status(200).json({
            ok: true,
            provider: 'neon',
            counts: stats
        });
    } catch (err) {
        return res.status(500).json({
            ok: false,
            provider: 'neon',
            error: err?.message || 'Error conectando a Neon Postgres'
        });
    }
}
