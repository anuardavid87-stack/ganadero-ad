// ============================================================================
// GANADERO AD - NEXT.JS APP ROUTER API ROUTE: app/api/whatsapp/route.ts
// Webhook Oficial Multitenant de WhatsApp Cloud API (Meta Graph API v25.0)
// ============================================================================
// Variables de entorno del servidor (NUNCA expuestas al frontend):
//   - WHATSAPP_SYSTEM_TOKEN (token permanente)
//   - WHATSAPP_APP_SECRET   (validación X-Hub-Signature-256)
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
} from '../../../frontend/src/core/whatsappCloudService.js';

declare const process: { env: Record<string, string | undefined> };

function getServerEnv(): Record<string, string> {
    const pEnv = typeof process !== 'undefined' && process.env ? process.env : {};
    return {
        WHATSAPP_SYSTEM_TOKEN: pEnv.WHATSAPP_SYSTEM_TOKEN || pEnv.WHATSAPP_ACCESS_TOKEN || '',
        WHATSAPP_APP_SECRET: pEnv.WHATSAPP_APP_SECRET || '',
        WHATSAPP_VERIFY_TOKEN: pEnv.WHATSAPP_VERIFY_TOKEN || '',
        SUPABASE_URL: pEnv.SUPABASE_URL || '',
        SUPABASE_SERVICE_ROLE_KEY: pEnv.SUPABASE_SERVICE_ROLE_KEY || pEnv.SUPABASE_ANON_KEY || ''
    };
}

export async function GET(request: Request): Promise<Response> {
    const env = getServerEnv();
    const url = new URL(request.url);

    if (url.searchParams.get('action') === 'status') {
        return new Response(
            JSON.stringify({
                ok: true,
                graph_api_version: GRAPH_API_VERSION,
                tokens: {
                    WHATSAPP_SYSTEM_TOKEN: env.WHATSAPP_SYSTEM_TOKEN ? 'configurado ✓' : 'pendiente de configurar en servidor',
                    WHATSAPP_APP_SECRET: env.WHATSAPP_APP_SECRET ? 'configurado ✓' : 'pendiente de configurar en servidor',
                    WHATSAPP_VERIFY_TOKEN: env.WHATSAPP_VERIFY_TOKEN ? 'configurado ✓' : 'pendiente de configurar en servidor'
                }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
        );
    }

    const resultado = verificarWebhookWhatsApp(
        {
            'hub.mode': url.searchParams.get('hub.mode') || '',
            'hub.verify_token': url.searchParams.get('hub.verify_token') || '',
            'hub.challenge': url.searchParams.get('hub.challenge') || ''
        },
        env
    );

    return new Response(resultado.body, {
        status: resultado.status,
        headers: resultado.headers
    });
}

export async function POST(request: Request): Promise<Response> {
    const env = getServerEnv();
    try {
        const rawBody = await request.text();
        const payload = rawBody ? JSON.parse(rawBody) : {};

        await cargarEstadoWhatsAppDesdeSupabase(env);

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
            return new Response(JSON.stringify(resultadoEnvio), {
                status: resultadoEnvio.ok ? 200 : 400,
                headers: { 'Content-Type': 'application/json; charset=utf-8' }
            });
        }

        const signatureHeader = request.headers.get('x-hub-signature-256') || '';
        if (env.WHATSAPP_APP_SECRET || signatureHeader) {
            const validacion = validarFirmaWebhookMeta(rawBody, signatureHeader, env.WHATSAPP_APP_SECRET);
            if (!validacion.ok) {
                return new Response(JSON.stringify({ error: validacion.error }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json; charset=utf-8' }
                });
            }
        }

        const resultado = await procesarWebhookPostWhatsApp(payload, {
            env,
            rawBody,
            signatureHeader,
            validarFirma: Boolean(env.WHATSAPP_APP_SECRET)
        });

        await sincronizarEstadoWhatsAppConSupabase(undefined, env);
        return new Response(JSON.stringify(resultado.body), {
            status: resultado.status,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    } catch (error: unknown) {
        return new Response(
            JSON.stringify({
                status: 'EVENT_RECEIVED',
                error: error instanceof Error ? error.message : 'Error procesando webhook'
            }),
            { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
        );
    }
}
