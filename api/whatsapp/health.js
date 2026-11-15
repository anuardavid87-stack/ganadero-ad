// ============================================================================
// GANADERO AD - VERCEL SERVERLESS FUNCTION: GET /api/whatsapp/health
// Verifica la existencia real de las variables de entorno en el servidor
// (WHATSAPP_SYSTEM_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN)
// sin devolver jamás sus valores. Acceso exclusivo para Super Admin.
// ============================================================================

import { verificarSaludSecretosWhatsApp } from '../../frontend/src/core/whatsappCloudService.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const pEnv = typeof process !== 'undefined' && process.env ? process.env : {};
    const rolHeader =
        req.headers?.['x-ganadero-rol'] ||
        req.headers?.['X-Ganadero-Rol'] ||
        req.headers?.['x-user-role'] ||
        req.query?.rol ||
        '';

    const resultado = verificarSaludSecretosWhatsApp(
        {
            WHATSAPP_SYSTEM_TOKEN: pEnv.WHATSAPP_SYSTEM_TOKEN || '',
            WHATSAPP_APP_SECRET: pEnv.WHATSAPP_APP_SECRET || '',
            WHATSAPP_VERIFY_TOKEN: pEnv.WHATSAPP_VERIFY_TOKEN || '',
            SUPABASE_SERVICE_ROLE_KEY: pEnv.SUPABASE_SERVICE_ROLE_KEY || '',
            SUPABASE_URL: pEnv.SUPABASE_URL || ''
        },
        { rol: rolHeader }
    );

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(resultado.status).json(resultado.body);
}
