/**
 * ============================================================================
 * ENDPOINT SERVERLESS VERCEL: /api/whatsapp
 * ============================================================================
 * Maneja las peticiones GET (Verificación del Webhook de Meta) y POST
 * (Recepción bidireccional de mensajes entrantes desde WhatsApp Cloud API).
 *
 * Lee las credenciales desde Variables de Entorno (process.env) O automáticamente
 * desde la configuración guardada dentro del programa en:
 * ⚙️ Admin -> 💬 WhatsApp API (registro SYS_WHATSAPP_CONFIG en Supabase).
 * ============================================================================
 */

import {
    verificarWebhookWhatsApp,
    procesarWebhookPostWhatsApp
} from '../frontend/src/core/whatsappCloudService.js';

const DEFAULT_SUPABASE_URL = 'https://jucpxyjzmbthplbvzrsj.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Y3B4eWp6bWJ0aHBsYnZ6cnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3ODExNjMsImV4cCI6MjEwNTM1NzE2M30.EYCHnq6pUNO3cUtD1fRb7l3k-XBbrGtgYmsxkmNzDsA';

async function obtenerEnvCombinado() {
    const envCombinado = { ...(process.env || {}) };
    if (envCombinado.WHATSAPP_ACCESS_TOKEN && envCombinado.WHATSAPP_PHONE_NUMBER_ID && envCombinado.WHATSAPP_VERIFY_TOKEN) {
        return envCombinado;
    }

    try {
        const supabaseUrl = (envCombinado.SUPABASE_URL || envCombinado.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
        const supabaseKey = envCombinado.SUPABASE_SERVICE_ROLE_KEY || envCombinado.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY;

        const res = await fetch(`${supabaseUrl}/rest/v1/operaciones_diarias?id=eq.SYS_WHATSAPP_CONFIG&limit=1`, {
            method: 'GET',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (res.ok) {
            const filas = await res.json();
            const detalles = filas?.[0]?.detalles;
            if (detalles && typeof detalles === 'object') {
                if (!envCombinado.WHATSAPP_PHONE_NUMBER_ID && detalles.phoneNumberId) {
                    envCombinado.WHATSAPP_PHONE_NUMBER_ID = detalles.phoneNumberId;
                }
                if (!envCombinado.WHATSAPP_ACCESS_TOKEN && detalles.accessToken) {
                    envCombinado.WHATSAPP_ACCESS_TOKEN = detalles.accessToken;
                }
                if (!envCombinado.WHATSAPP_VERIFY_TOKEN && detalles.verifyToken) {
                    envCombinado.WHATSAPP_VERIFY_TOKEN = detalles.verifyToken;
                }
                if (!envCombinado.WHATSAPP_AUTHORIZED_NUMBERS && detalles.authorizedNumbers) {
                    envCombinado.WHATSAPP_AUTHORIZED_NUMBERS = detalles.authorizedNumbers;
                }
            }
        }
    } catch (e) {
        console.warn('[Webhook WhatsApp] No se pudo consultar SYS_WHATSAPP_CONFIG en Supabase:', e.message);
    }

    return envCombinado;
}

export default async function handler(req, res) {
    try {
        const envActivo = await obtenerEnvCombinado();

        // --------------------------------------------------------------------
        // 1. MÉTODO GET: Verificación oficial del Webhook de Meta
        // --------------------------------------------------------------------
        if (req.method === 'GET') {
            const resultado = verificarWebhookWhatsApp(req.query || {}, envActivo);
            res.status(resultado.status).setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.send(resultado.body);
        }

        // --------------------------------------------------------------------
        // 2. MÉTODO POST: Procesamiento de mensajes entrantes de WhatsApp
        // --------------------------------------------------------------------
        if (req.method === 'POST') {
            const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
            const resultado = await procesarWebhookPostWhatsApp(payload, { env: envActivo });
            return res.status(resultado.status || 200).json(resultado.body);
        }

        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    } catch (error) {
        console.error('[Webhook WhatsApp Serverless Error]:', error);
        return res.status(200).json({
            status: 'error',
            message: error.message || 'Error interno procesando el webhook'
        });
    }
}
