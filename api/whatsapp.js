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

import crypto from 'node:crypto';
import {
    verificarWebhookWhatsApp,
    procesarWebhookPostWhatsApp
} from '../frontend/src/core/whatsappCloudService.js';
import {
    getDatabaseUrl,
    crearRepositorioWhatsAppNeon
} from './_lib/neonDb.js';

// Desactivar el bodyParser automático de Vercel para leer el body CRUDO (Buffer) sin parsear
export const config = {
    api: {
        bodyParser: false
    }
};

function obtenerVariablesServidor() {
    const pEnv = typeof process !== 'undefined' && process.env ? process.env : {};
    return {
        WHATSAPP_SYSTEM_TOKEN: pEnv.WHATSAPP_SYSTEM_TOKEN || '',
        WHATSAPP_APP_SECRET: pEnv.WHATSAPP_APP_SECRET || '',
        WHATSAPP_VERIFY_TOKEN: pEnv.WHATSAPP_VERIFY_TOKEN || '',
        DATABASE_URL: getDatabaseUrl(),
        SUPABASE_URL: pEnv.SUPABASE_URL || 'https://jucpxyjzmbthplbvzrsj.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: pEnv.SUPABASE_SERVICE_ROLE_KEY || ''
    };
}

/**
 * Lee los bytes crudos (Buffer) del request HTTP sin parsear JSON previamente,
 * garantizando que el cálculo de HMAC-SHA256 coincida byte a byte con Meta.
 */
async function leerRawBodyBuffer(req) {
    if (req && Buffer.isBuffer(req.rawBody)) {
        return req.rawBody;
    }
    if (req && typeof req.rawBody === 'string') {
        return Buffer.from(req.rawBody, 'utf8');
    }
    if (req && typeof req[Symbol.asyncIterator] === 'function') {
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8'));
        }
        if (chunks.length > 0) {
            return Buffer.concat(chunks);
        }
    }
    if (req && req.body !== undefined && req.body !== null) {
        if (Buffer.isBuffer(req.body)) return req.body;
        if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
        return Buffer.from(JSON.stringify(req.body), 'utf8');
    }
    return Buffer.alloc(0);
}

export default async function handler(req, res) {
    const env = obtenerVariablesServidor();

    // ------------------------------------------------------------------------
    // 1. MÉTODO GET: Verificación de Webhook de Meta (hub.verify_token)
    // ------------------------------------------------------------------------
    if (req.method === 'GET') {
        const query = req.query || {};
        const resultado = verificarWebhookWhatsApp(query, env);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(resultado.status).send(resultado.body);
    }

    // ------------------------------------------------------------------------
    // 2. MÉTODO POST: Webhook Entrante de Meta (Validación Estricta HMAC-SHA256)
    // ------------------------------------------------------------------------
    if (req.method === 'POST') {
        // Regla 1: Si falta WHATSAPP_APP_SECRET -> 500 y log de error
        if (!env.WHATSAPP_APP_SECRET || !String(env.WHATSAPP_APP_SECRET).trim()) {
            console.error('[POST /api/whatsapp] ERROR CRÍTICO 500: Falta configurar WHATSAPP_APP_SECRET en el servidor.');
            return res.status(500).json({
                error: 'Error de configuración del servidor: falta WHATSAPP_APP_SECRET.'
            });
        }

        // Regla 2: Si falta el header X-Hub-Signature-256 -> 401
        const signatureHeader = String(
            req.headers?.['x-hub-signature-256'] ||
            req.headers?.['X-Hub-Signature-256'] ||
            ''
        ).trim();

        if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
            return res.status(401).json({
                error: 'No autorizado: cabecera X-Hub-Signature-256 ausente o mal formada.'
            });
        }

        // Regla 3: Calcular HMAC-SHA256 sobre el body CRUDO (sin parsear) y comparar con crypto.timingSafeEqual
        const rawBuffer = await leerRawBodyBuffer(req);
        const firmaRecibidaHex = signatureHeader.slice('sha256='.length).trim().toLowerCase();
        const firmaEsperadaHex = crypto
            .createHmac('sha256', String(env.WHATSAPP_APP_SECRET).trim())
            .update(rawBuffer)
            .digest('hex')
            .toLowerCase();

        const bufRecibida = Buffer.from(firmaRecibidaHex, 'utf8');
        const bufEsperada = Buffer.from(firmaEsperadaHex, 'utf8');

        if (bufRecibida.length !== bufEsperada.length || !crypto.timingSafeEqual(bufRecibida, bufEsperada)) {
            return res.status(401).json({
                error: 'No autorizado: firma X-Hub-Signature-256 inválida.'
            });
        }

        // Firma válida -> parsear JSON y procesar evento multitenant
        let payload = {};
        try {
            const rawString = rawBuffer.toString('utf8');
            payload = rawString ? JSON.parse(rawString) : {};
        } catch {
            return res.status(400).json({ error: 'JSON inválido en body.' });
        }

        try {
            const usarNeon = Boolean(env.DATABASE_URL);
            if (!usarNeon && !env.SUPABASE_SERVICE_ROLE_KEY) {
                console.error('[POST /api/whatsapp] ERROR CRÍTICO: Falta DATABASE_URL (Neon) o SUPABASE_SERVICE_ROLE_KEY en variables de entorno del servidor.');
            }

            const resultado = await procesarWebhookPostWhatsApp(payload, {
                env,
                repo: usarNeon ? crearRepositorioWhatsAppNeon() : undefined,
                rawBody: rawBuffer,
                signatureHeader,
                omitirValidacionFirma: true
            });

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
