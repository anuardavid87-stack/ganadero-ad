// ============================================================================
// GANADERO AD - NEXT.JS APP ROUTER API ROUTE: app/api/whatsapp/route.ts
// Webhook Oficial Multitenant de WhatsApp Cloud API (Meta Graph API v25.0)
// ============================================================================

import crypto from 'node:crypto';
import {
    verificarWebhookWhatsApp,
    procesarWebhookPostWhatsApp
} from '../../../frontend/src/core/whatsappCloudService.js';

declare const process: { env: Record<string, string | undefined> };

function getServerEnv(): Record<string, string> {
    const pEnv = typeof process !== 'undefined' && process.env ? process.env : {};
    return {
        WHATSAPP_SYSTEM_TOKEN: pEnv.WHATSAPP_SYSTEM_TOKEN || '',
        WHATSAPP_APP_SECRET: pEnv.WHATSAPP_APP_SECRET || '',
        WHATSAPP_VERIFY_TOKEN: pEnv.WHATSAPP_VERIFY_TOKEN || '',
        SUPABASE_URL: pEnv.SUPABASE_URL || 'https://jucpxyjzmbthplbvzrsj.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: pEnv.SUPABASE_SERVICE_ROLE_KEY || ''
    };
}

export async function GET(request: Request): Promise<Response> {
    const env = getServerEnv();
    const url = new URL(request.url);

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

    // Regla 1: Si falta WHATSAPP_APP_SECRET -> 500 y log de error
    if (!env.WHATSAPP_APP_SECRET || !String(env.WHATSAPP_APP_SECRET).trim()) {
        console.error('[POST /api/whatsapp] ERROR CRÍTICO 500: Falta configurar WHATSAPP_APP_SECRET en el servidor.');
        return new Response(
            JSON.stringify({ error: 'Error de configuración del servidor: falta WHATSAPP_APP_SECRET.' }),
            { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
        );
    }

    // Regla 2: Si falta el header X-Hub-Signature-256 -> 401
    const signatureHeader = (request.headers.get('x-hub-signature-256') || '').trim();
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
        return new Response(
            JSON.stringify({ error: 'No autorizado: cabecera X-Hub-Signature-256 ausente o mal formada.' }),
            { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
        );
    }

    // Regla 3: Calcular HMAC-SHA256 sobre el body CRUDO (sin parsear) y comparar con crypto.timingSafeEqual
    const rawArrayBuffer = await request.arrayBuffer();
    const rawBuffer = Buffer.from(rawArrayBuffer);

    const firmaRecibidaHex = signatureHeader.slice('sha256='.length).trim().toLowerCase();
    const firmaEsperadaHex = crypto
        .createHmac('sha256', String(env.WHATSAPP_APP_SECRET).trim())
        .update(rawBuffer)
        .digest('hex')
        .toLowerCase();

    const bufRecibida = Buffer.from(firmaRecibidaHex, 'utf8');
    const bufEsperada = Buffer.from(firmaEsperadaHex, 'utf8');

    if (bufRecibida.length !== bufEsperada.length || !crypto.timingSafeEqual(bufRecibida, bufEsperada)) {
        return new Response(
            JSON.stringify({ error: 'No autorizado: firma X-Hub-Signature-256 inválida.' }),
            { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
        );
    }

    let payload = {};
    try {
        const rawText = rawBuffer.toString('utf8');
        payload = rawText ? JSON.parse(rawText) : {};
    } catch {
        return new Response(
            JSON.stringify({ error: 'JSON inválido en body.' }),
            { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
        );
    }

    try {
        if (!env.SUPABASE_SERVICE_ROLE_KEY) {
            console.error('[POST /api/whatsapp] ERROR CRÍTICO: Falta SUPABASE_SERVICE_ROLE_KEY en variables de entorno del servidor.');
        }

        const resultado = await procesarWebhookPostWhatsApp(payload, {
            env,
            rawBody: rawBuffer,
            signatureHeader,
            omitirValidacionFirma: true
        });

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
