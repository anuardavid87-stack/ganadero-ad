// ============================================================================
// GANADERO AD - VERCEL SERVERLESS FUNCTION: /api/whatsapp
// Webhook Oficial Multitenant de WhatsApp Cloud API (Meta Graph API v25.0)
// ============================================================================
// Variables de entorno del servidor (NUNCA en el frontend):
//   - WHATSAPP_SYSTEM_TOKEN (token permanente de System User)
//   - WHATSAPP_APP_SECRET   (validación HMAC-SHA256 de X-Hub-Signature-256)
//   - WHATSAPP_VERIFY_TOKEN (verificación GET del Webhook)
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

import {
    GRAPH_API_VERSION,
    verificarWebhookWhatsApp,
    validarFirmaWebhookMeta,
    procesarWebhookPostWhatsApp,
    enviarWhatsApp,
    cargarEstadoWhatsAppDesdeSupabase,
    sincronizarEstadoWhatsAppConSupabase
} from '../frontend/src/core/whatsappCloudService.js';

function obtenerVariablesServidor() {
    const pEnv = typeof process !== 'undefined' && process.env ? process.env : {};
    return {
        WHATSAPP_SYSTEM_TOKEN: pEnv.WHATSAPP_SYSTEM_TOKEN || pEnv.WHATSAPP_ACCESS_TOKEN || '',
        WHATSAPP_APP_SECRET: pEnv.WHATSAPP_APP_SECRET || '',
        WHATSAPP_VERIFY_TOKEN: pEnv.WHATSAPP_VERIFY_TOKEN || '',
        SUPABASE_URL: pEnv.SUPABASE_URL || '',
        SUPABASE_SERVICE_ROLE_KEY: pEnv.SUPABASE_SERVICE_ROLE_KEY || pEnv.SUPABASE_ANON_KEY || ''
    };
}

export default async function handler(req, res) {
    const env = obtenerVariablesServidor();

    // ------------------------------------------------------------------------
    // 1. MÉTODO GET: Verificación de Webhook de Meta o Estado Seguro Servidor
    // ------------------------------------------------------------------------
    if (req.method === 'GET') {
        const query = req.query || {};

        if (query.action === 'status') {
            return res.status(200).json({
                ok: true,
                graph_api_version: GRAPH_API_VERSION,
                tokens: {
                    WHATSAPP_SYSTEM_TOKEN: env.WHATSAPP_SYSTEM_TOKEN ? 'configurado ✓' : 'pendiente de configurar en servidor',
                    WHATSAPP_APP_SECRET: env.WHATSAPP_APP_SECRET ? 'configurado ✓' : 'pendiente de configurar en servidor',
                    WHATSAPP_VERIFY_TOKEN: env.WHATSAPP_VERIFY_TOKEN ? 'configurado ✓' : 'pendiente de configurar en servidor'
                }
            });
        }

        const resultado = verificarWebhookWhatsApp(query, env);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(resultado.status).send(resultado.body);
    }

    // ------------------------------------------------------------------------
    // 2. MÉTODO POST: Webhook Entrante de Meta o Envío Saliente desde Servidor
    // ------------------------------------------------------------------------
    if (req.method === 'POST') {
        try {
            const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
            const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

            await cargarEstadoWhatsAppDesdeSupabase(env);

            // Envío saliente solicitado desde la aplicación (solo se ejecuta desde servidor)
            if (payload && payload.action === 'enviar_whatsapp') {
                const resultadoEnvio = await enviarWhatsApp(
                    payload.empresa_id,
                    payload.telefono,
                    payload.mensaje || payload.plantilla,
                    {
                        env,
                        tipo: payload.tipo || 'text',
                        esPlantilla: payload.tipo === 'template'
                    }
                );
                await sincronizarEstadoWhatsAppConSupabase(undefined, env);
                return res.status(resultadoEnvio.ok ? 200 : 400).json(resultadoEnvio);
            }

            // Validación criptográfica X-Hub-Signature-256 con WHATSAPP_APP_SECRET
            const signatureHeader =
                req.headers?.['x-hub-signature-256'] ||
                req.headers?.['X-Hub-Signature-256'] ||
                '';

            if (env.WHATSAPP_APP_SECRET || signatureHeader) {
                const validacion = validarFirmaWebhookMeta(rawBody, signatureHeader, env.WHATSAPP_APP_SECRET);
                if (!validacion.ok) {
                    return res.status(401).json({ error: validacion.error });
                }
            }

            // Procesar evento multitenant y responder 200 a Meta
            const resultado = await procesarWebhookPostWhatsApp(payload, {
                env,
                rawBody,
                signatureHeader,
                validarFirma: Boolean(env.WHATSAPP_APP_SECRET)
            });

            await sincronizarEstadoWhatsAppConSupabase(undefined, env);
            return res.status(resultado.status).json(resultado.body);
        } catch (error) {
            return res.status(200).json({
                status: 'EVENT_RECEIVED',
                error: error?.message || 'Payload procesado con advertencias'
            });
        }
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
}
