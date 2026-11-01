/**
 * ============================================================================
 * ENDPOINT SERVERLESS VERCEL: /api/whatsapp
 * ============================================================================
 * Maneja las peticiones GET (Verificación del Webhook de Meta) y POST
 * (Recepción bidireccional de mensajes entrantes desde WhatsApp Cloud API).
 *
 * VARIABLES DE ENTORNO REQUERIDAS (Configurar en Vercel / .env):
 * - WHATSAPP_VERIFY_TOKEN       : Token secreto para verificar el webhook con Meta
 * - WHATSAPP_ACCESS_TOKEN       : Token de acceso permanente de Meta Graph API (Bearer)
 * - WHATSAPP_PHONE_NUMBER_ID    : ID del número de teléfono en WhatsApp Business Cloud
 * - WHATSAPP_AUTHORIZED_NUMBERS : Lista de teléfonos autorizados separados por coma
 * - SUPABASE_URL                : URL del proyecto Supabase (Base de Datos Ganadera)
 * - SUPABASE_ANON_KEY           : Service Role Key o Anon Key de Supabase
 * ============================================================================
 */

import {
    verificarWebhookWhatsApp,
    procesarWebhookPostWhatsApp
} from '../frontend/src/core/whatsappCloudService.js';

export default async function handler(req, res) {
    try {
        // --------------------------------------------------------------------
        // 1. MÉTODO GET: Verificación oficial del Webhook de Meta
        // --------------------------------------------------------------------
        if (req.method === 'GET') {
            const resultado = verificarWebhookWhatsApp(req.query || {}, process.env);
            res.status(resultado.status).setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.send(resultado.body);
        }

        // --------------------------------------------------------------------
        // 2. MÉTODO POST: Procesamiento de mensajes entrantes de WhatsApp
        // --------------------------------------------------------------------
        if (req.method === 'POST') {
            const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
            const resultado = await procesarWebhookPostWhatsApp(payload, { env: process.env });
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
