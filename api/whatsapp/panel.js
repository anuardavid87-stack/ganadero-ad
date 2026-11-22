// ============================================================================
// GANADERO AD - /api/whatsapp/panel (GET / POST)
// Gestión del panel WhatsApp Cloud API (canales, contactos, permisos, logs,
// estados de entrega) 100% persistida en Neon Postgres.
// ============================================================================

import { getSql, setCorsHeaders, ensureNeonSchema, crearRepositorioWhatsAppNeon } from '../_lib/neonDb.js';

export default async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const sql = getSql();
        await ensureNeonSchema(sql);
        const repo = crearRepositorioWhatsAppNeon(sql);

        const rolHeader = String(req.headers?.['x-ganadero-rol'] || req.query?.rol || '').toLowerCase();
        const esSuperAdmin = rolHeader === 'superadmin';
        const empresaId = String(req.headers?.['x-empresa-id'] || req.query?.empresaId || '').trim() || null;

        if (req.method === 'GET') {
            const data = await repo.cargarDatosPanel({ esSuperAdmin, empresaId });
            return res.status(200).json(data);
        }

        if (req.method === 'POST') {
            const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
            const action = String(body.action || '').trim();

            if (action === 'guardar_canal') {
                if (!esSuperAdmin) return res.status(403).json({ ok: false, error: 'Solo Super Admin puede gestionar canales.' });
                const r = await repo.guardarCanalPanel(body.datos || {});
                return res.status(r.ok ? 200 : 400).json(r);
            }
            if (action === 'cambiar_estado_canal') {
                if (!esSuperAdmin) return res.status(403).json({ ok: false, error: 'Solo Super Admin puede gestionar canales.' });
                const r = await repo.cambiarEstadoCanalPanel(body.datos || {});
                return res.status(r.ok ? 200 : 400).json(r);
            }
            if (action === 'eliminar_canal') {
                if (!esSuperAdmin) return res.status(403).json({ ok: false, error: 'Solo Super Admin puede eliminar canales.' });
                const r = await repo.eliminarCanalPanel(body.datos || {});
                return res.status(r.ok ? 200 : 400).json(r);
            }
            if (action === 'listar_numeros_meta') {
                if (!esSuperAdmin) return res.status(403).json({ ok: false, error: 'Solo Super Admin puede consultar Meta Graph API.' });
                const token = String(process.env.WHATSAPP_SYSTEM_TOKEN || '').trim();
                if (!token) return res.status(500).json({ ok: false, error: 'WHATSAPP_SYSTEM_TOKEN no configurado en servidor.' });
                const wabaId = String(body.datos?.waba_id || '118927644541032').trim();
                if (!/^\d+$/.test(wabaId)) return res.status(400).json({ ok: false, error: 'waba_id inválido.' });
                const respMeta = await fetch(
                    `https://graph.facebook.com/v25.0/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,status,quality_rating,code_verification_status`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                const metaJson = await respMeta.json();
                if (!respMeta.ok) {
                    return res.status(respMeta.status).json({
                        ok: false,
                        error: metaJson?.error?.message || `Meta Graph API HTTP ${respMeta.status}`
                    });
                }
                const numeros = (Array.isArray(metaJson?.data) ? metaJson.data : []).map((n) => ({
                    id: n.id,
                    display_phone_number: n.display_phone_number || '',
                    verified_name: n.verified_name || '',
                    status: n.status || '',
                    quality_rating: n.quality_rating || '',
                    code_verification_status: n.code_verification_status || ''
                }));
                return res.status(200).json({ ok: true, waba_id: wabaId, numeros });
            }
            if (action === 'guardar_contacto') {
                const r = await repo.guardarContactoConAccesosPanel({
                    ...(body.datos || {}),
                    modoSuperAdmin: esSuperAdmin,
                    empresaIdContexto: empresaId
                });
                return res.status(r.ok ? 200 : 400).json(r);
            }
            if (action === 'cambiar_estado_contacto') {
                const r = await repo.cambiarEstadoContactoPanel({
                    ...(body.datos || {}),
                    empresaId,
                    esSuperAdmin
                });
                return res.status(r.ok ? 200 : 400).json(r);
            }
            if (action === 'eliminar_contacto') {
                const r = await repo.eliminarContactoPanel({
                    ...(body.datos || {}),
                    empresaId,
                    esSuperAdmin
                });
                return res.status(r.ok ? 200 : 400).json(r);
            }

            return res.status(400).json({ ok: false, error: `Acción no soportada: ${action}` });
        }

        res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
        return res.status(405).json({ error: 'Method Not Allowed' });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err?.message || 'Error en /api/whatsapp/panel (Neon)' });
    }
}
