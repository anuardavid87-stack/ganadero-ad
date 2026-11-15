// ============================================================================
// GANADERO AD - NEXT.JS APP ROUTER API ROUTE: GET /api/whatsapp/health
// Verifica la existencia real de WHATSAPP_SYSTEM_TOKEN, WHATSAPP_APP_SECRET y
// WHATSAPP_VERIFY_TOKEN en el servidor (solo Super Admin), sin devolver valores.
// ============================================================================

import { verificarSaludSecretosWhatsApp } from '../../../../frontend/src/core/whatsappCloudService.js';

declare const process: { env: Record<string, string | undefined> };

export async function GET(request: Request): Promise<Response> {
    const pEnv = typeof process !== 'undefined' && process.env ? process.env : {};
    const url = new URL(request.url);
    const rolHeader =
        request.headers.get('x-ganadero-rol') ||
        request.headers.get('x-user-role') ||
        url.searchParams.get('rol') ||
        '';

    const resultado = verificarSaludSecretosWhatsApp(
        {
            WHATSAPP_SYSTEM_TOKEN: pEnv.WHATSAPP_SYSTEM_TOKEN || '',
            WHATSAPP_APP_SECRET: pEnv.WHATSAPP_APP_SECRET || '',
            WHATSAPP_VERIFY_TOKEN: pEnv.WHATSAPP_VERIFY_TOKEN || ''
        },
        { rol: rolHeader }
    );

    return new Response(JSON.stringify(resultado.body), {
        status: resultado.status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
    });
}
