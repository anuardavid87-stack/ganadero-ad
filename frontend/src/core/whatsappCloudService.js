// ============================================================================
// GANADERO AD - SERVICIO OFICIAL WHATSAPP CLOUD API (META GRAPH API v25.0)
// Arquitectura 100% en Supabase (Cero localStorage) con Acceso Multi-Empresa,
// Multi-Finca (whatsapp_contact_access), Búsqueda Automática, Ventana 24h y RLS
// ============================================================================

import { calcularGDPEjemplar } from './zootecnia.js';

export const GRAPH_API_VERSION = 'v25.0';

export const DEFAULT_SHARED_WHATSAPP_CHANNEL = Object.freeze({
    id: 'CH-SHARED-DEFAULT',
    phone_number_id: '111443548633291',
    waba_id: '118927644541032',
    display_phone_number: '+57 322 5694112',
    nombre: 'Canal Compartido Ganadero AD',
    tipo: 'compartido',
    empresa_id: null,
    access_token_override: null,
    template_name: 'notificacion_ganadero_ad',
    template_lang: 'es',
    activo: true,
    created_at: '2026-01-01T00:00:00.000Z'
});

export const WHATSAPP_MAX_CHARS = 4000;
export const WHATSAPP_MAX_INFO_MATCHES = 10;
const VENTANA_24H_MS = 24 * 60 * 60 * 1000;

// Credenciales públicas de PostgREST del proyecto Supabase "ganadero" (solo para el panel con RLS;
// el webhook en el servidor utiliza exclusivamente SUPABASE_SERVICE_ROLE_KEY).
const SUPABASE_GANADERO_URL = 'https://jucpxyjzmbthplbvzrsj.supabase.co';
const SUPABASE_GANADERO_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Y3B4eWp6bWJ0aHBsYnZ6cnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3ODExNjMsImV4cCI6MjEwNTM1NzE2M30.EYCHnq6pUNO3cUtD1fRb7l3k-XBbrGtgYmsxkmNzDsA';

const CLAVES_LOCALSTORAGE_OBSOLETAS = Object.freeze([
    'bovitrack_whatsapp_multitenant_v25',
    'bovitrack_whatsapp_cloud_config_v1'
]);

/**
 * Purga definitivamente las claves obsoletas de localStorage en navegadores que aún las tengan.
 * El panel y el webhook leen y escriben únicamente en Supabase.
 */
export function limpiarLocalStorageWhatsAppObsoleto() {
    try {
        if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
            for (const key of CLAVES_LOCALSTORAGE_OBSOLETAS) {
                localStorage.removeItem(key);
            }
        }
    } catch {
        // Ignorar en entornos sin localStorage (servidor / sandbox)
    }
}

limpiarLocalStorageWhatsAppObsoleto();

// ============================================================================
// 1. NORMALIZACIÓN ÚNICA DE TELÉFONO, TEXTO SIN TILDES Y CRIPTOGRAFÍA WEBHOOK
// ============================================================================

/**
 * Función única de normalización de teléfono:
 * - Quita '+', espacios, guiones, paréntesis y cualquier carácter no numérico.
 * - Si tiene 10 dígitos y empieza por '3', antepone '57'.
 * Ej: "+57 (301) 783-9578" -> "573017839578", "3017839578" -> "573017839578".
 */
export function normalizarTelefono(telefono = '') {
    const limpio = String(telefono ?? '')
        .replace(/[+\s\-()]/g, '')
        .replace(/[^\d]/g, '');
    if (limpio.length === 10 && limpio.startsWith('3')) {
        return `57${limpio}`;
    }
    return limpio;
}

export const normalizarTelefonoWhatsApp = normalizarTelefono;

export function normalizarTextoSinTildes(str = '') {
    return String(str ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

function normalizarTagComparacion(tag = '') {
    return String(tag ?? '').trim().toUpperCase();
}

function utf8ToBytes(str) {
    const texto = String(str ?? '');
    if (typeof TextEncoder !== 'undefined') {
        return Array.from(new TextEncoder().encode(texto));
    }
    const bytes = [];
    for (let i = 0; i < texto.length; i++) {
        let code = texto.charCodeAt(i);
        if (code < 0x80) {
            bytes.push(code);
        } else if (code < 0x800) {
            bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        } else if (code < 0xd800 || code >= 0xe000) {
            bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        } else {
            i++;
            code = 0x10000 + (((code & 0x3ff) << 10) | (texto.charCodeAt(i) & 0x3ff));
            bytes.push(
                0xf0 | (code >> 18),
                0x80 | ((code >> 12) & 0x3f),
                0x80 | ((code >> 6) & 0x3f),
                0x80 | (code & 0x3f)
            );
        }
    }
    return bytes;
}

function sha256Bytes(msgBytes) {
    const K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    let H0 = 0x6a09e667, H1 = 0xbb67ae85, H2 = 0x3c6ef372, H3 = 0xa54ff53a;
    let H4 = 0x510e527f, H5 = 0x9b05688c, H6 = 0x1f83d9ab, H7 = 0x5be0cd19;

    const bytes = msgBytes.slice();
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) bytes.push(0);
    const highBits = Math.floor(bitLen / 0x100000000);
    const lowBits = bitLen >>> 0;
    bytes.push(
        (highBits >>> 24) & 0xff, (highBits >>> 16) & 0xff, (highBits >>> 8) & 0xff, highBits & 0xff,
        (lowBits >>> 24) & 0xff, (lowBits >>> 16) & 0xff, (lowBits >>> 8) & 0xff, lowBits & 0xff
    );

    const W = new Array(64);
    const rotr = (n, x) => (x >>> n) | (x << (32 - n));

    for (let i = 0; i < bytes.length; i += 64) {
        for (let t = 0; t < 16; t++) {
            const idx = i + t * 4;
            W[t] = ((bytes[idx] << 24) | (bytes[idx + 1] << 16) | (bytes[idx + 2] << 8) | bytes[idx + 3]) >>> 0;
        }
        for (let t = 16; t < 64; t++) {
            const s0 = (rotr(7, W[t - 15]) ^ rotr(18, W[t - 15]) ^ (W[t - 15] >>> 3)) >>> 0;
            const s1 = (rotr(17, W[t - 2]) ^ rotr(19, W[t - 2]) ^ (W[t - 2] >>> 10)) >>> 0;
            W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
        }
        let a = H0, b = H1, c = H2, d = H3, e = H4, f = H5, g = H6, h = H7;
        for (let t = 0; t < 64; t++) {
            const S1 = (rotr(6, e) ^ rotr(11, e) ^ rotr(25, e)) >>> 0;
            const ch = ((e & f) ^ (~e & g)) >>> 0;
            const temp1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
            const S0 = (rotr(2, a) ^ rotr(13, a) ^ rotr(22, a)) >>> 0;
            const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
            const temp2 = (S0 + maj) >>> 0;
            h = g; g = f; f = e; e = (d + temp1) >>> 0;
            d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
        }
        H0 = (H0 + a) >>> 0; H1 = (H1 + b) >>> 0; H2 = (H2 + c) >>> 0; H3 = (H3 + d) >>> 0;
        H4 = (H4 + e) >>> 0; H5 = (H5 + f) >>> 0; H6 = (H6 + g) >>> 0; H7 = (H7 + h) >>> 0;
    }

    const out = [];
    for (const word of [H0, H1, H2, H3, H4, H5, H6, H7]) {
        out.push((word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff);
    }
    return out;
}

export function calcularHmacSha256Hex(rawBody, secret) {
    const nodeCrypto = typeof process !== 'undefined' && typeof process.getBuiltinModule === 'function'
        ? process.getBuiltinModule('node:crypto')
        : null;
    if (nodeCrypto && typeof nodeCrypto.createHmac === 'function') {
        const bodyInput = (typeof Buffer !== 'undefined' && Buffer.isBuffer(rawBody))
            ? rawBody
            : String(rawBody ?? '');
        return nodeCrypto.createHmac('sha256', String(secret ?? '')).update(bodyInput).digest('hex');
    }

    let keyBytes = utf8ToBytes(secret);
    if (keyBytes.length > 64) keyBytes = sha256Bytes(keyBytes);
    while (keyBytes.length < 64) keyBytes.push(0);

    const oKeyPad = keyBytes.map((b) => b ^ 0x5c);
    const iKeyPad = keyBytes.map((b) => b ^ 0x36);
    const msgBytes = typeof rawBody === 'string' ? utf8ToBytes(rawBody) : utf8ToBytes(JSON.stringify(rawBody ?? ''));

    const innerHash = sha256Bytes(iKeyPad.concat(msgBytes));
    const outerHash = sha256Bytes(oKeyPad.concat(innerHash));
    return outerHash.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Valida la firma X-Hub-Signature-256 enviada por Meta con WHATSAPP_APP_SECRET
 * sobre el body CRUDO (sin parsear):
 * - Si falta WHATSAPP_APP_SECRET -> retorna { ok: false, status: 500 } y console.error.
 * - Si falta el header X-Hub-Signature-256 o la firma HMAC-SHA256 no coincide -> retorna { ok: false, status: 401 }.
 * - Usa crypto.timingSafeEqual para comparar.
 */
export function validarFirmaWebhookMeta(rawBody, signatureHeader, appSecret, cryptoOverride = null) {
    if (!appSecret || !String(appSecret).trim()) {
        console.error('[WhatsApp Webhook Security] ERROR 500: Falta configurar WHATSAPP_APP_SECRET en las variables de entorno del servidor.');
        return {
            ok: false,
            status: 500,
            error: 'Error de configuración en el servidor: falta WHATSAPP_APP_SECRET.'
        };
    }

    const header = String(signatureHeader || '').trim();
    if (!header || !header.startsWith('sha256=')) {
        return {
            ok: false,
            status: 401,
            error: 'Cabecera X-Hub-Signature-256 ausente o mal formada.'
        };
    }

    if (rawBody === undefined || rawBody === null) {
        return {
            ok: false,
            status: 401,
            error: 'Body crudo ausente para verificación HMAC-SHA256.'
        };
    }

    const firmaRecibidaHex = header.slice('sha256='.length).toLowerCase();
    const firmaEsperadaHex = calcularHmacSha256Hex(rawBody, String(appSecret).trim()).toLowerCase();

    const nodeCrypto = cryptoOverride || (
        typeof process !== 'undefined' && typeof process.getBuiltinModule === 'function'
            ? process.getBuiltinModule('node:crypto')
            : null
    );

    if (nodeCrypto && typeof nodeCrypto.timingSafeEqual === 'function' && typeof Buffer !== 'undefined') {
        const bufRecibida = Buffer.from(firmaRecibidaHex, 'utf8');
        const bufEsperada = Buffer.from(firmaEsperadaHex, 'utf8');
        if (bufRecibida.length !== bufEsperada.length || !nodeCrypto.timingSafeEqual(bufRecibida, bufEsperada)) {
            return {
                ok: false,
                status: 401,
                error: 'Firma X-Hub-Signature-256 inválida.'
            };
        }
        return { ok: true, status: 200 };
    }

    if (firmaRecibidaHex.length !== firmaEsperadaHex.length) {
        return { ok: false, status: 401, error: 'Firma X-Hub-Signature-256 inválida.' };
    }
    let diff = 0;
    for (let i = 0; i < firmaEsperadaHex.length; i++) {
        diff |= firmaRecibidaHex.charCodeAt(i) ^ firmaEsperadaHex.charCodeAt(i);
    }
    if (diff !== 0) {
        return { ok: false, status: 401, error: 'Firma X-Hub-Signature-256 no coincide con el payload.' };
    }
    return { ok: true, status: 200 };
}

export function verificarWebhookWhatsApp(queryParams = {}, env = {}) {
    const mode = queryParams['hub.mode'] ?? queryParams.mode;
    const token = queryParams['hub.verify_token'] ?? queryParams.verify_token;
    const challenge = queryParams['hub.challenge'] ?? queryParams.challenge;
    const verifyTokenEsperado = env.WHATSAPP_VERIFY_TOKEN || '';

    if (mode === 'subscribe' && verifyTokenEsperado && token === verifyTokenEsperado) {
        return {
            status: 200,
            body: String(challenge ?? ''),
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        };
    }

    return {
        status: 403,
        body: 'Forbidden: hub.verify_token inválido o suscripción rechazada.',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    };
}

/**
 * Endpoint GET /api/whatsapp/health (exclusivo para Super Admin).
 * Devuelve booleanos reales sin exponer valores de secretos.
 */
export function verificarSaludSecretosWhatsApp(env = {}, { rol = '' } = {}) {
    const rolLimpio = String(rol || '').trim().toLowerCase();
    if (rolLimpio !== 'superadmin') {
        return {
            status: 403,
            body: {
                ok: false,
                error: 'Forbidden: El endpoint /api/whatsapp/health es exclusivo para Super Admin.'
            }
        };
    }

    const tieneSystemToken = Boolean(env.WHATSAPP_SYSTEM_TOKEN && String(env.WHATSAPP_SYSTEM_TOKEN).trim().length > 0);
    const tieneAppSecret = Boolean(env.WHATSAPP_APP_SECRET && String(env.WHATSAPP_APP_SECRET).trim().length > 0);
    const tieneVerifyToken = Boolean(env.WHATSAPP_VERIFY_TOKEN && String(env.WHATSAPP_VERIFY_TOKEN).trim().length > 0);
    const tieneServiceRole = Boolean(env.SUPABASE_SERVICE_ROLE_KEY && String(env.SUPABASE_SERVICE_ROLE_KEY).trim().length > 0);
    const tieneSupabaseUrl = Boolean((env.SUPABASE_URL && String(env.SUPABASE_URL).trim().length > 0) || SUPABASE_GANADERO_URL);

    return {
        status: 200,
        body: {
            ok: true,
            WHATSAPP_SYSTEM_TOKEN: tieneSystemToken,
            WHATSAPP_APP_SECRET: tieneAppSecret,
            WHATSAPP_VERIFY_TOKEN: tieneVerifyToken,
            SUPABASE_SERVICE_ROLE_KEY: tieneServiceRole,
            SUPABASE_URL: tieneSupabaseUrl
        }
    };
}

export function sanitizarCanalParaFrontend(canal = {}) {
    const tieneOverride = Boolean(canal.access_token_override && String(canal.access_token_override).trim());
    const copia = { ...canal };
    delete copia.access_token_override;
    return {
        ...copia,
        tiene_token_override: tieneOverride
    };
}

// ============================================================================
// 2. RESOLUCIÓN DE ALCANCE PERMITIDO MULTI-EMPRESA / MULTI-FINCA Y FORMATO UI
// ============================================================================

const PRIORIDAD_ROL_WA = {
    administrador: 3,
    operador: 2,
    veterinario: 1
};

function elegirRolMayorPrivilegio(rolA = 'operador', rolB = 'operador') {
    const a = String(rolA || 'operador').toLowerCase();
    const b = String(rolB || 'operador').toLowerCase();
    return (PRIORIDAD_ROL_WA[b] || 0) > (PRIORIDAD_ROL_WA[a] || 0) ? b : a;
}

/**
 * Construye el ALCANCE PERMITIDO de un contacto a partir de sus filas activas en whatsapp_contact_access:
 * - finca_id NULL -> todas las fincas de esa empresa.
 * - finca_id con valor -> solo esa finca.
 * - Si el canal es DEDICADO -> limita estrictamente el alcance a canal.empresa_id.
 */
export function resolverAlcancePermitidoContacto({
    contacto = null,
    accesos = [],
    canal = DEFAULT_SHARED_WHATSAPP_CHANNEL,
    empresas = [],
    fincas = []
} = {}) {
    if (!contacto || contacto.activo === false) {
        return { autorizado: false, fincasPermitidas: [], empresasIds: [], rolesPorFinca: new Map(), todosVeterinario: false };
    }

    const accesosActivos = (Array.isArray(accesos) ? accesos : []).filter((a) => {
        if (!a || a.activo === false || !a.empresa_id) return false;
        if (canal && canal.tipo === 'dedicado' && canal.empresa_id) {
            return String(a.empresa_id) === String(canal.empresa_id);
        }
        return true;
    });

    if (accesosActivos.length === 0) {
        return { autorizado: false, fincasPermitidas: [], empresasIds: [], rolesPorFinca: new Map(), todosVeterinario: false };
    }

    const mapaEmpresas = new Map();
    for (const e of Array.isArray(empresas) ? empresas : []) {
        if (e && e.id) {
            mapaEmpresas.set(String(e.id), e.nombre || e.razonSocial || String(e.id));
        }
    }

    const fincasNormalizadas = (Array.isArray(fincas) ? fincas : []).map((f) => {
        let empId = f.empresaId || f.empresa_id || null;
        let rawUbic = String(f.ubicacion || '');
        const matchTenant = rawUbic.match(/^\[TENANT:([^\]]+)\]/);
        if (!empId && matchTenant) {
            empId = matchTenant[1].trim();
        }
        return {
            id: String(f.id),
            nombre: f.nombre || String(f.id),
            codigo: f.codigo || '',
            empresa_id: empId ? String(empId) : null
        };
    });

    const mapaFincasPermitidas = new Map(); // fincaId -> { finca_id, finca_nombre, empresa_id, empresa_nombre, rol }
    const empresasSet = new Set();
    const rolesObservados = new Set();

    for (const acc of accesosActivos) {
        const empId = String(acc.empresa_id);
        const rolAcc = ['operador', 'administrador', 'veterinario'].includes(String(acc.rol || '').toLowerCase())
            ? String(acc.rol).toLowerCase()
            : 'operador';
        rolesObservados.add(rolAcc);
        empresasSet.add(empId);

        const empNombre = mapaEmpresas.get(empId) || empId;

        if (!acc.finca_id) {
            // finca_id NULL = todas las fincas de esa empresa
            const fincasEmp = fincasNormalizadas.filter((f) => f.empresa_id === empId);
            for (const f of fincasEmp) {
                const prev = mapaFincasPermitidas.get(f.id);
                mapaFincasPermitidas.set(f.id, {
                    finca_id: f.id,
                    finca_nombre: f.nombre,
                    empresa_id: empId,
                    empresa_nombre: empNombre,
                    rol: prev ? elegirRolMayorPrivilegio(prev.rol, rolAcc) : rolAcc
                });
            }
        } else {
            const fincaTarget = fincasNormalizadas.find(
                (f) => f.id === String(acc.finca_id) && (!f.empresa_id || f.empresa_id === empId)
            );
            if (fincaTarget) {
                const prev = mapaFincasPermitidas.get(fincaTarget.id);
                mapaFincasPermitidas.set(fincaTarget.id, {
                    finca_id: fincaTarget.id,
                    finca_nombre: fincaTarget.nombre,
                    empresa_id: empId,
                    empresa_nombre: empNombre,
                    rol: prev ? elegirRolMayorPrivilegio(prev.rol, rolAcc) : rolAcc
                });
            }
        }
    }

    const fincasPermitidas = Array.from(mapaFincasPermitidas.values());
    const rolesPorFinca = new Map(fincasPermitidas.map((fp) => [fp.finca_id, fp.rol]));
    const todosVeterinario =
        rolesObservados.size > 0 && Array.from(rolesObservados).every((r) => r === 'veterinario');

    return {
        autorizado: true,
        fincasPermitidas,
        empresasIds: Array.from(empresasSet),
        rolesPorFinca,
        todosVeterinario
    };
}

/**
 * Formatea los permisos de un contacto para mostrarlos en la tabla del panel:
 * Ej: "INVERSIONES: todas (operador) · VACUNO INVERSIONES: Waterloo, Gallinazo (administrador)"
 */
export function formatearResumenPermisosContacto(
    accesos = [],
    empresas = [],
    fincas = [],
    { soloEmpresaId = null, incluirRol = true } = {}
) {
    const mapaEmp = new Map((empresas || []).map((e) => [String(e.id), e.nombre || String(e.id)]));
    const mapaFin = new Map((fincas || []).map((f) => [String(f.id), f.nombre || String(f.id)]));

    const filtrados = (Array.isArray(accesos) ? accesos : []).filter(
        (a) => a && (!soloEmpresaId || String(a.empresa_id) === String(soloEmpresaId))
    );

    if (filtrados.length === 0) return 'Sin permisos asignados';

    const porEmpresa = new Map();
    for (const acc of filtrados) {
        const empId = String(acc.empresa_id);
        if (!porEmpresa.has(empId)) {
            porEmpresa.set(empId, { todas: false, fincas: [], rol: acc.rol || 'operador', activo: acc.activo !== false });
        }
        const grupo = porEmpresa.get(empId);
        grupo.rol = elegirRolMayorPrivilegio(grupo.rol, acc.rol || 'operador');
        if (acc.activo !== false) grupo.activo = true;
        if (!acc.finca_id) {
            grupo.todas = true;
        } else {
            const nomFinca = mapaFin.get(String(acc.finca_id)) || String(acc.finca_id);
            if (!grupo.fincas.includes(nomFinca)) {
                grupo.fincas.push(nomFinca);
            }
        }
    }

    const partes = [];
    for (const [empId, info] of porEmpresa.entries()) {
        const nomEmp = mapaEmp.get(empId) || empId;
        const detalleFincas = info.todas ? 'todas' : info.fincas.join(', ');
        const sufijoRol = incluirRol ? ` (${info.rol})` : '';
        const sufijoInactivo = !info.activo ? ' [inactivo]' : '';
        partes.push(`${nomEmp}: ${detalleFincas}${sufijoRol}${sufijoInactivo}`);
    }
    return partes.join(' · ');
}

// ============================================================================
// 3. PARSER DE COMANDOS Y DIVISIÓN DE MENSAJES (> 4.000 CARACTERES)
// ============================================================================

export function obtenerTextoAyudaWhatsApp() {
    return (
        `🤖 *Ganadero AD — Comandos disponibles*\n\n` +
        `• *INFO <ID>* → Consultar la ficha del animal en todas tus fincas autorizadas (ej: INFO 045)\n` +
        `• *PESO <ID> <KG>* → Registrar peso en kg (ej: PESO 045 350)\n` +
        `• *PESO <ID> <KG> <FINCA>* → Registrar peso indicando la finca cuando el número existe en varias (ej: PESO 045 350 Vesubio)`
    );
}

/**
 * Parsea comandos sin distinguir mayúsculas/minúsculas ni tildes:
 * - INFO <ID>
 * - PESO <ID> <KG> [FINCA opcional]
 * - AYUDA
 * NO existen comandos EMPRESA, EMPRESAS ni cambio de finca activa (FINCA ...).
 */
export function parsearComandoTextoWhatsApp(textoMensaje = '') {
    const limpio = String(textoMensaje ?? '').trim().replace(/\s+/g, ' ');
    if (!limpio) {
        return { comando: 'AYUDA', valido: true, esFallbackAyuda: true };
    }

    const partes = limpio.split(' ');
    const verboNorm = normalizarTextoSinTildes(partes[0]).toUpperCase();

    if (verboNorm === 'AYUDA') {
        if (partes.length === 1) {
            return { comando: 'AYUDA', valido: true, esFallbackAyuda: false };
        }
        return { comando: 'DESCONOCIDO', valido: false, textoOriginal: limpio };
    }

    if (verboNorm === 'INFO') {
        const resto = limpio.slice(partes[0].length).trim();
        const matchId = resto.match(/^([A-Za-z0-9\-_/.]+)$/);
        if (matchId) {
            return {
                comando: 'INFO',
                valido: true,
                idAnimal: matchId[1].toUpperCase()
            };
        }
        return { comando: 'DESCONOCIDO', valido: false, textoOriginal: limpio };
    }

    if (verboNorm === 'PESO') {
        const resto = limpio.slice(partes[0].length).trim();
        const matchPeso = resto.match(/^([A-Za-z0-9\-_/.]+)\s+(\d+(?:[.,]\d+)?)(?:\s*kg)?(?:\s+(.+))?$/i);
        if (matchPeso) {
            const pesoKg = parseFloat(matchPeso[2].replace(',', '.'));
            if (Number.isFinite(pesoKg) && pesoKg > 0 && pesoKg < 2500) {
                const fincaOpcional = matchPeso[3] ? matchPeso[3].trim() : null;
                return {
                    comando: 'PESO',
                    valido: true,
                    idAnimal: matchPeso[1].toUpperCase(),
                    pesoKg: Number(pesoKg.toFixed(1)),
                    fincaFiltro: fincaOpcional || null
                };
            }
        }
        return { comando: 'DESCONOCIDO', valido: false, textoOriginal: limpio };
    }

    return {
        comando: 'DESCONOCIDO',
        valido: false,
        textoOriginal: limpio
    };
}

/**
 * Divide un texto en fragmentos de máximo `maxChars` caracteres (por defecto 4.000,
 * inferior al límite de 4.096 de WhatsApp Cloud API), cortando preferiblemente en bloques \n\n.
 */
export function dividirMensajeWhatsApp(texto = '', maxChars = WHATSAPP_MAX_CHARS) {
    const str = String(texto ?? '');
    if (!str) return [];
    if (str.length <= maxChars) return [str];

    const bloques = str.split('\n\n');
    const partes = [];
    let actual = '';

    const empujarLineaLarga = (segmento) => {
        let rest = segmento;
        while (rest.length > maxChars) {
            let corte = rest.lastIndexOf('\n', maxChars);
            if (corte <= 0) corte = maxChars;
            partes.push(rest.slice(0, corte).trimEnd());
            rest = rest.slice(corte).trimStart();
        }
        if (rest) actual = rest;
    };

    for (const bloque of bloques) {
        if (!actual) {
            if (bloque.length <= maxChars) {
                actual = bloque;
            } else {
                empujarLineaLarga(bloque);
            }
        } else if (actual.length + 2 + bloque.length <= maxChars) {
            actual += '\n\n' + bloque;
        } else {
            partes.push(actual);
            actual = '';
            if (bloque.length <= maxChars) {
                actual = bloque;
            } else {
                empujarLineaLarga(bloque);
            }
        }
    }

    if (actual) {
        partes.push(actual);
    }
    return partes;
}

/**
 * Formatea una ficha individual de animal conservando intacta la lógica de campos de la ficha.
 */
export function formatearBloqueFichaAnimalWhatsApp(animal = {}, metaFinca = {}, idFallback = '') {
    const tagReal = animal.identificacion_tag || animal.identificacionTag || animal.numero || idFallback;
    const nombre = animal.nombre_alias || animal.nombreAlias || animal.nombre || 'Sin nombre';
    const especie = String(animal.especie || 'bovino').toLowerCase() === 'bufalino' ? '🐃 Búfalo(a)' : '🐄 Vacuno';
    const estadoReprod = animal.estado_reproductivo || animal.estadoReproductivo || animal.estado || 'Abierta / Vacía';
    const diasPrenez = Number(
        animal.dias_gestacion_actual ??
        animal.dias_gestacion ??
        animal.diasGestacionActual ??
        animal.diasPrenez ??
        animal.diasGestacion ??
        0
    );
    const detallePrenez = diasPrenez > 0 ? ` (${diasPrenez} días de gestación)` : '';
    const pesoActual = Number(
        animal.ultimo_peso_kg ??
        animal.ultimoPesoKg ??
        animal.pesoActualKg ??
        animal.peso ??
        0
    );
    const fechaPeso = animal.fecha_ultimo_pesaje || animal.fechaUltimoPesaje || '';
    const textoPeso = pesoActual > 0
        ? (fechaPeso ? `${pesoActual} kg (${fechaPeso})` : `${pesoActual} kg`)
        : 'Sin pesaje';
    const lote = animal.lote || 'General';
    const fincaNombre = metaFinca.finca_nombre || animal.finca_nombre || metaFinca.finca_id || 'Finca';
    const empresaNombre = metaFinca.empresa_nombre || animal.empresa_nombre || metaFinca.empresa_id || 'Empresa';

    return (
        `📍 Finca ${fincaNombre} · 🏢 ${empresaNombre}\n` +
        `📋 FICHA DEL ANIMAL ${tagReal}\n` +
        `• Nombre: ${nombre}\n` +
        `• Especie: ${especie}\n` +
        `• Estado reproductivo: ${estadoReprod}${detallePrenez}\n` +
        `• Último peso: ${textoPeso}\n` +
        `• Lote: ${lote}`
    );
}

// ============================================================================
// 4. EJECUTOR DE COMANDOS CON BÚSQUEDA AUTOMÁTICA MULTI-EMPRESA Y MULTI-FINCA
// ============================================================================

/**
 * Ejecuta un comando de WhatsApp (INFO, PESO, AYUDA o fallback a AYUDA)
 * buscando automáticamente en todas las fincas del alcance permitido del contacto.
 */
export async function ejecutarComandoAlcanceWhatsApp(textoMensaje, alcance, repoOrAdapter, contexto = {}) {
    const parsed = parsearComandoTextoWhatsApp(textoMensaje);
    const fechaHoy = contexto.fechaHoy || new Date().toISOString().split('T')[0];
    const fincasPermitidas = Array.isArray(alcance?.fincasPermitidas) ? alcance.fincasPermitidas : [];
    const mapaFincaMeta = new Map(fincasPermitidas.map((fp) => [String(fp.finca_id), fp]));
    const empresasAlcance = Array.isArray(alcance?.empresasIds) && alcance.empresasIds.length > 0
        ? alcance.empresasIds
        : Array.from(new Set(fincasPermitidas.map((f) => f.empresa_id).filter(Boolean)));

    // AYUDA o cualquier texto no reconocido -> responde con AYUDA
    if (!parsed.valido || parsed.comando === 'AYUDA' || parsed.comando === 'DESCONOCIDO') {
        const msgAyuda = obtenerTextoAyudaWhatsApp();
        return {
            exito: parsed.comando === 'AYUDA',
            comando: parsed.comando === 'AYUDA' ? 'AYUDA' : 'DESCONOCIDO',
            mensajeRespuesta: msgAyuda,
            mensajesRespuesta: dividirMensajeWhatsApp(msgAyuda),
            empresasInvolucradas: empresasAlcance
        };
    }

    const buscarEnAlcance = async (idAnimal) => {
        const idsFincas = fincasPermitidas.map((f) => f.finca_id);
        if (idsFincas.length === 0) return [];

        let filas = [];
        if (typeof repoOrAdapter?.buscarAnimalesPorTagEnFincas === 'function') {
            filas = await repoOrAdapter.buscarAnimalesPorTagEnFincas(idAnimal, idsFincas);
        } else if (typeof repoOrAdapter?.consultarAnimalesAlcance === 'function') {
            filas = await repoOrAdapter.consultarAnimalesAlcance(idAnimal, fincasPermitidas);
        } else if (typeof repoOrAdapter?.consultarAnimalPorId === 'function') {
            // Compatibilidad con adaptadores unitarios simples
            for (const fp of fincasPermitidas) {
                const hallado = await repoOrAdapter.consultarAnimalPorId(idAnimal, {
                    empresaId: fp.empresa_id,
                    fincaId: fp.finca_id
                });
                if (hallado) filas.push({ ...hallado, finca_id: hallado.finca_id || hallado.fincaId || fp.finca_id });
            }
        }

        const enriquecidos = [];
        for (const a of Array.isArray(filas) ? filas : []) {
            const fid = String(a.finca_id || a.fincaId || '');
            const meta = mapaFincaMeta.get(fid);
            if (!meta) continue;
            enriquecidos.push({
                animal: a,
                finca_id: meta.finca_id,
                finca_nombre: meta.finca_nombre,
                empresa_id: meta.empresa_id,
                empresa_nombre: meta.empresa_nombre,
                rol: meta.rol
            });
        }

        // Ordenar por empresa y finca para agrupar limpiamente
        enriquecidos.sort((x, y) => {
            const cmpEmp = x.empresa_nombre.localeCompare(y.empresa_nombre, 'es');
            if (cmpEmp !== 0) return cmpEmp;
            return x.finca_nombre.localeCompare(y.finca_nombre, 'es');
        });
        return enriquecidos;
    };

    // ------------------------------------------------------------------------
    // COMANDO INFO <ID>
    // ------------------------------------------------------------------------
    if (parsed.comando === 'INFO') {
        const coincidencias = await buscarEnAlcance(parsed.idAnimal);
        if (coincidencias.length === 0) {
            const msgNo = `No encontré el animal ${parsed.idAnimal} en tus fincas autorizadas.`;
            return {
                exito: false,
                comando: 'INFO',
                idAnimal: parsed.idAnimal,
                coincidencias: [],
                mensajeRespuesta: msgNo,
                mensajesRespuesta: [msgNo],
                empresasInvolucradas: empresasAlcance
            };
        }

        const total = coincidencias.length;
        const visibles = coincidencias.slice(0, WHATSAPP_MAX_INFO_MATCHES);
        const faltantes = total - visibles.length;

        const bloques = visibles.map((item) =>
            formatearBloqueFichaAnimalWhatsApp(item.animal, item, parsed.idAnimal)
        );

        let respuestaCompleta =
            `🔎 Encontré ${total} animal(es) con el número ${parsed.idAnimal}:\n\n` +
            bloques.join('\n\n');

        if (faltantes > 0) {
            respuestaCompleta += `\n\n⚠️ Mostrando las ${WHATSAPP_MAX_INFO_MATCHES} primeras coincidencias (faltan ${faltantes} más).`;
        }

        const empresasInvolucradas = Array.from(new Set(coincidencias.map((c) => c.empresa_id)));

        return {
            exito: true,
            comando: 'INFO',
            idAnimal: parsed.idAnimal,
            coincidencias,
            mensajeRespuesta: respuestaCompleta,
            mensajesRespuesta: dividirMensajeWhatsApp(respuestaCompleta),
            empresasInvolucradas
        };
    }

    // ------------------------------------------------------------------------
    // COMANDO PESO <ID> <KG> [FINCA opcional]
    // ------------------------------------------------------------------------
    if (parsed.comando === 'PESO') {
        // Si TODOS los permisos activos del contacto son de rol veterinario -> denegar de inmediato
        if (alcance?.todosVeterinario) {
            const msgVet = 'Tu rol solo permite consultas (INFO)';
            return {
                exito: false,
                comando: 'PESO',
                codigo: 'ROL_SOLO_CONSULTA',
                idAnimal: parsed.idAnimal,
                mensajeRespuesta: msgVet,
                mensajesRespuesta: [msgVet],
                empresasInvolucradas: empresasAlcance
            };
        }

        let coincidencias = await buscarEnAlcance(parsed.idAnimal);

        // Si se especificó FINCA al final (sin importar mayúsculas ni tildes), filtrar por esa finca
        if (parsed.fincaFiltro) {
            const filtroNorm = normalizarTextoSinTildes(parsed.fincaFiltro);
            coincidencias = coincidencias.filter(
                (c) => normalizarTextoSinTildes(c.finca_nombre) === filtroNorm
            );
        }

        if (coincidencias.length === 0) {
            const msgNo = `No encontré el animal ${parsed.idAnimal} en tus fincas autorizadas.`;
            return {
                exito: false,
                comando: 'PESO',
                idAnimal: parsed.idAnimal,
                mensajeRespuesta: msgNo,
                mensajesRespuesta: [msgNo],
                empresasInvolucradas: empresasAlcance
            };
        }

        if (coincidencias.length > 1) {
            const listadoFincas = coincidencias
                .map((c) => `${c.finca_nombre} (${c.empresa_nombre})`)
                .join(', ');
            const ejemploFinca = String(coincidencias[0].finca_nombre || '').toUpperCase();
            const msgAmbiguo =
                `⚠️ Encontré el ${parsed.idAnimal} en varias fincas: ${listadoFincas}.\n` +
                `Para registrar el peso, escribe la finca al final, por ejemplo:\n` +
                `PESO ${parsed.idAnimal} ${parsed.pesoKg} ${ejemploFinca}`;
            const empresasInvolucradas = Array.from(new Set(coincidencias.map((c) => c.empresa_id)));
            return {
                exito: false,
                comando: 'PESO',
                codigo: 'MULTIPLES_FINCAS',
                idAnimal: parsed.idAnimal,
                coincidencias,
                mensajeRespuesta: msgAmbiguo,
                mensajesRespuesta: dividirMensajeWhatsApp(msgAmbiguo),
                empresasInvolucradas
            };
        }

        // Exactamente 1 coincidencia -> verificar rol sobre esa finca específica
        const unico = coincidencias[0];
        if (String(unico.rol || '').toLowerCase() === 'veterinario') {
            const msgVet = 'Tu rol solo permite consultas (INFO)';
            return {
                exito: false,
                comando: 'PESO',
                codigo: 'ROL_SOLO_CONSULTA',
                idAnimal: parsed.idAnimal,
                mensajeRespuesta: msgVet,
                mensajesRespuesta: [msgVet],
                empresasInvolucradas: [unico.empresa_id]
            };
        }

        const fnRegistrar = repoOrAdapter?.registrarPesoAnimalEnFinca || repoOrAdapter?.registrarPesoAnimal;
        if (typeof fnRegistrar !== 'function') {
            throw new Error('El repositorio de datos no implementa registrarPesoAnimalEnFinca.');
        }

        const resultado = await fnRegistrar({
            animal: unico.animal,
            idAnimal: parsed.idAnimal,
            tag: parsed.idAnimal,
            pesoKg: parsed.pesoKg,
            fecha: fechaHoy,
            remitente: contexto.remitente || 'whatsapp',
            empresaId: unico.empresa_id,
            fincaId: unico.finca_id
        });

        if (!resultado || resultado.exito === false) {
            const msgErr = resultado?.mensajeError || `No encontré el animal ${parsed.idAnimal} en tus fincas autorizadas.`;
            return {
                exito: false,
                comando: 'PESO',
                idAnimal: parsed.idAnimal,
                mensajeRespuesta: msgErr,
                mensajesRespuesta: [msgErr],
                empresasInvolucradas: [unico.empresa_id]
            };
        }

        const tagConfirmado = unico.animal.identificacion_tag || unico.animal.identificacionTag || parsed.idAnimal;
        const msgOk = `✅ Peso de ${parsed.pesoKg} kg registrado para ${tagConfirmado} · 📍 ${unico.finca_nombre} · 🏢 ${unico.empresa_nombre}`;

        return {
            exito: true,
            comando: 'PESO',
            idAnimal: tagConfirmado,
            pesoKg: parsed.pesoKg,
            finca_id: unico.finca_id,
            finca_nombre: unico.finca_nombre,
            empresa_id: unico.empresa_id,
            empresa_nombre: unico.empresa_nombre,
            resultado,
            mensajeRespuesta: msgOk,
            mensajesRespuesta: [msgOk],
            empresasInvolucradas: [unico.empresa_id]
        };
    }

    const msgFallback = obtenerTextoAyudaWhatsApp();
    return {
        exito: false,
        comando: 'DESCONOCIDO',
        mensajeRespuesta: msgFallback,
        mensajesRespuesta: [msgFallback],
        empresasInvolucradas: empresasAlcance
    };
}

// Compatibilidad con firmas previas de procesarComandoWhatsApp
export async function procesarComandoWhatsApp(textoMensaje, dbAdapter, contexto = {}) {
    if (contexto?.alcance) {
        return ejecutarComandoAlcanceWhatsApp(textoMensaje, contexto.alcance, dbAdapter, contexto);
    }
    const empresaId = contexto.empresaId || contexto.empresa_id || 'EMP-01';
    const fincaId = contexto.fincaId || contexto.finca_id || 'FIN-DEFAULT';
    const alcanceSimple = {
        autorizado: true,
        fincasPermitidas: [
            {
                finca_id: fincaId,
                finca_nombre: contexto.fincaNombre || fincaId,
                empresa_id: empresaId,
                empresa_nombre: contexto.empresaNombre || empresaId,
                rol: contexto.rol || 'operador'
            }
        ],
        empresasIds: [empresaId],
        todosVeterinario: String(contexto.rol || '').toLowerCase() === 'veterinario'
    };
    return ejecutarComandoAlcanceWhatsApp(textoMensaje, alcanceSimple, dbAdapter, contexto);
}

// ============================================================================
// 5. REPOSITORIO OFICIAL SUPABASE (SERVIDOR CON SERVICE_ROLE Y PANEL CON RLS)
// ============================================================================

function construirHeadersSupabase({ env = {}, contextoPanel = null, usarServiceRole = false } = {}) {
    const supabaseUrl = String(
        (usarServiceRole ? env.SUPABASE_URL : contextoPanel?.supabaseUrl || env.SUPABASE_URL) ||
        SUPABASE_GANADERO_URL
    ).replace(/\/+$/, '');

    const apiKey = usarServiceRole
        ? String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
        : String(contextoPanel?.anonKey || env.SUPABASE_ANON_KEY || SUPABASE_GANADERO_ANON_KEY).trim();

    const headers = {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
    };

    if (!usarServiceRole && contextoPanel) {
        if (contextoPanel.rol) headers['x-ganadero-rol'] = String(contextoPanel.rol).toLowerCase();
        if (contextoPanel.usuario) headers['x-ganadero-usuario'] = String(contextoPanel.usuario).toLowerCase();
        if (contextoPanel.empresaId) headers['x-empresa-id'] = String(contextoPanel.empresaId);
        if (contextoPanel.sessionToken) headers['x-session-token'] = String(contextoPanel.sessionToken);
    }

    return { supabaseUrl, apiKey, headers };
}

export function crearRepositorioWhatsAppSupabase({
    env = {},
    contextoPanel = null,
    usarServiceRole = false,
    fetchImpl = globalThis.fetch
} = {}) {
    const { supabaseUrl, apiKey, headers } = construirHeadersSupabase({ env, contextoPanel, usarServiceRole });

    async function peticionJson(ruta, opcionesFetch = {}) {
        if (typeof fetchImpl !== 'function') {
            throw new Error('fetch no disponible.');
        }
        if (usarServiceRole && !apiKey) {
            throw new Error('Falta configurar SUPABASE_SERVICE_ROLE_KEY en las variables de entorno del servidor.');
        }
        const res = await fetchImpl(`${supabaseUrl}${ruta}`, {
            ...opcionesFetch,
            headers: {
                ...headers,
                ...(opcionesFetch.headers || {})
            }
        });
        const texto = await res.text();
        let data = null;
        try {
            data = texto ? JSON.parse(texto) : null;
        } catch {
            data = texto;
        }
        return { ok: res.ok, status: res.status, data };
    }

    return {
        esSupabaseReal: true,

        async obtenerCanalPorPhoneNumberId(phoneNumberId) {
            const pid = encodeURIComponent(String(phoneNumberId || '').trim());
            const r = await peticionJson(`/rest/v1/whatsapp_channels?phone_number_id=eq.${pid}&select=*&limit=1`, {
                method: 'GET'
            });
            if (!r.ok || !Array.isArray(r.data) || r.data.length === 0) return null;
            return r.data[0];
        },

        async obtenerCanalActivoEmpresa(empresaId) {
            const r = await peticionJson(`/rest/v1/whatsapp_channels?activo=eq.true&select=*`, { method: 'GET' });
            const canales = r.ok && Array.isArray(r.data) ? r.data : [];
            const dedicado = empresaId
                ? canales.find((c) => c.tipo === 'dedicado' && c.activo !== false && String(c.empresa_id) === String(empresaId))
                : null;
            const compartido = canales.find((c) => c.tipo === 'compartido' && c.activo !== false) || DEFAULT_SHARED_WHATSAPP_CHANNEL;
            return dedicado || compartido;
        },

        async obtenerContactoConAccesosPorTelefono(telefono) {
            const telNorm = normalizarTelefono(telefono);
            if (!telNorm) return null;
            const rCont = await peticionJson(
                `/rest/v1/whatsapp_contacts?telefono=eq.${encodeURIComponent(telNorm)}&activo=eq.true&select=*&limit=1`,
                { method: 'GET' }
            );
            if (!rCont.ok || !Array.isArray(rCont.data) || rCont.data.length === 0) {
                return null;
            }
            const contacto = rCont.data[0];
            const rAcc = await peticionJson(
                `/rest/v1/whatsapp_contact_access?contact_id=eq.${encodeURIComponent(contacto.id)}&activo=eq.true&select=*`,
                { method: 'GET' }
            );
            const accesos = rAcc.ok && Array.isArray(rAcc.data) ? rAcc.data : [];
            return { contacto, accesos };
        },

        async obtenerCatalogoEmpresasYFincas() {
            const [rEmp, rFin, rDir] = await Promise.all([
                peticionJson('/rest/v1/empresas?select=id,nombre,activa', { method: 'GET' }),
                peticionJson('/rest/v1/fincas?select=id,empresa_id,codigo,nombre,ubicacion', { method: 'GET' }),
                peticionJson('/rest/v1/operaciones_diarias?id=eq.SYS_DIRECTORIO_EMPRESAS&select=detalles&limit=1', { method: 'GET' })
            ]);

            const detallesDir = rDir.ok && Array.isArray(rDir.data) && rDir.data[0]?.detalles ? rDir.data[0].detalles : {};
            const empEliminadas = new Set(Array.isArray(detallesDir.empresasEliminadas) ? detallesDir.empresasEliminadas : []);
            const finEliminadas = new Set(Array.isArray(detallesDir.fincasEliminadas) ? detallesDir.fincasEliminadas : []);
            const fincasEmpresaMap = detallesDir.fincasEmpresaMap || {};

            const mapaEmpresas = new Map();
            if (rEmp.ok && Array.isArray(rEmp.data)) {
                for (const e of rEmp.data) {
                    if (e?.id && !empEliminadas.has(e.id)) {
                        mapaEmpresas.set(String(e.id), { id: String(e.id), nombre: e.nombre || String(e.id), activa: e.activa !== false });
                    }
                }
            }
            if (Array.isArray(detallesDir.empresas)) {
                for (const e of detallesDir.empresas) {
                    if (e?.id && !empEliminadas.has(e.id)) {
                        mapaEmpresas.set(String(e.id), { id: String(e.id), nombre: e.nombre || String(e.id), activa: e.activa !== false });
                    }
                }
            }

            const fincas = [];
            if (rFin.ok && Array.isArray(rFin.data)) {
                for (const f of rFin.data) {
                    if (!f?.id || finEliminadas.has(f.id) || finEliminadas.has(f.codigo)) continue;
                    let rawUbic = String(f.ubicacion || '');
                    let tenantUbic = null;
                    const m = rawUbic.match(/^\[TENANT:([^\]]+)\]/);
                    if (m) tenantUbic = m[1].trim();
                    const empId = tenantUbic || fincasEmpresaMap[f.id] || f.empresa_id || null;
                    fincas.push({
                        id: String(f.id),
                        codigo: f.codigo || '',
                        nombre: f.nombre || String(f.id),
                        empresa_id: empId ? String(empId) : null
                    });
                }
            }

            return {
                empresas: Array.from(mapaEmpresas.values()),
                fincas
            };
        },

        async buscarAnimalesPorTagEnFincas(idAnimal, fincasIds = []) {
            if (!Array.isArray(fincasIds) || fincasIds.length === 0) return [];
            const tagLimpio = String(idAnimal || '').trim();
            if (!tagLimpio) return [];

            const listaFincasIn = fincasIds.map((id) => `"${String(id).replace(/"/g, '')}"`).join(',');
            const ruta =
                `/rest/v1/animales?finca_id=in.(${encodeURIComponent(listaFincasIn)})` +
                `&estado_vida=eq.activo` +
                `&identificacion_tag=ilike.${encodeURIComponent(tagLimpio)}` +
                `&select=*`;

            const r = await peticionJson(ruta, { method: 'GET' });
            if (!r.ok || !Array.isArray(r.data)) return [];

            const objetivo = normalizarTagComparacion(tagLimpio);
            return r.data.filter((row) => normalizarTagComparacion(row.identificacion_tag) === objetivo);
        },

        async registrarPesoAnimalEnFinca({ animal, idAnimal, pesoKg, fecha, remitente }) {
            if (!animal || !animal.id || !animal.finca_id) {
                return { exito: false, motivo: 'NO_ENCONTRADO' };
            }

            const tagReal = animal.identificacion_tag || animal.identificacionTag || idAnimal;
            const pesoAnterior = Number(animal.ultimo_peso_kg ?? animal.ultimoPesoKg ?? 0);

            const calculoGdp = calcularGDPEjemplar({
                animal: {
                    ultimoPesoKg: animal.ultimo_peso_kg ?? animal.ultimoPesoKg ?? null,
                    fechaUltimoPesaje: animal.fecha_ultimo_pesaje || animal.fechaUltimoPesaje || null,
                    fechaNacimiento: animal.fecha_nacimiento || animal.fechaNacimiento || null
                },
                pesoActual: pesoKg,
                fechaPesaje: fecha
            });
            const gdpNueva = calculoGdp && Number.isFinite(calculoGdp.gdp) ? calculoGdp.gdp : null;
            const idPesaje = `PES-WA-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

            const rInsert = await peticionJson('/rest/v1/pesajes_animales', {
                method: 'POST',
                headers: { Prefer: 'return=representation' },
                body: JSON.stringify({
                    id: idPesaje,
                    finca_id: animal.finca_id,
                    animal_tag: tagReal,
                    fecha_pesaje: fecha,
                    peso_kg: pesoKg,
                    gdp_calculada_g_dia: gdpNueva,
                    notas: `Registrado vía WhatsApp (${normalizarTelefono(remitente) || 'autorizado'})`
                })
            });

            if (!rInsert.ok) {
                return { exito: false, motivo: 'ERROR_INSERT_PESAJE' };
            }

            const patchAnimal = {
                ultimo_peso_kg: pesoKg,
                fecha_ultimo_pesaje: fecha
            };
            if (gdpNueva !== null) {
                patchAnimal.gdp_promedio_g_dia = gdpNueva;
            }

            await peticionJson(`/rest/v1/animales?id=eq.${encodeURIComponent(animal.id)}`, {
                method: 'PATCH',
                body: JSON.stringify(patchAnimal)
            });

            return {
                exito: true,
                idPesaje,
                animal: { ...animal, ...patchAnimal },
                pesoAnterior,
                pesoNuevo: pesoKg,
                gdp: gdpNueva,
                fecha
            };
        },

        async actualizarSesion24h(channelId, telefono, fechaIso = new Date().toISOString()) {
            const telNorm = normalizarTelefono(telefono);
            const fila = {
                channel_id: channelId,
                telefono: telNorm,
                last_inbound_at: fechaIso,
                updated_at: fechaIso
            };
            await peticionJson('/rest/v1/whatsapp_sessions?on_conflict=channel_id,telefono', {
                method: 'POST',
                headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
                body: JSON.stringify(fila)
            });
            return fila;
        },

        async obtenerSesion24h(channelId, telefono) {
            const telNorm = normalizarTelefono(telefono);
            const r = await peticionJson(
                `/rest/v1/whatsapp_sessions?channel_id=eq.${encodeURIComponent(channelId)}&telefono=eq.${encodeURIComponent(telNorm)}&select=*&limit=1`,
                { method: 'GET' }
            );
            return r.ok && Array.isArray(r.data) && r.data.length > 0 ? r.data[0] : null;
        },

        async insertarLogsMensajes(filas = []) {
            if (!Array.isArray(filas) || filas.length === 0) return [];
            const payload = filas.map((f) => ({
                id: f.id || `WML-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                empresa_id: f.empresa_id || null,
                channel_id: f.channel_id || DEFAULT_SHARED_WHATSAPP_CHANNEL.id,
                telefono: normalizarTelefono(f.telefono),
                direccion: f.direccion === 'in' ? 'in' : 'out',
                tipo: f.tipo === 'template' ? 'template' : 'text',
                wamid: f.wamid || null,
                contenido_resumen: String(f.contenido_resumen || '').slice(0, 500),
                created_at: f.created_at || new Date().toISOString()
            }));
            await peticionJson('/rest/v1/whatsapp_messages_log', {
                method: 'POST',
                headers: { Prefer: 'return=minimal' },
                body: JSON.stringify(payload)
            });
            return payload;
        },

        async registrarEstadoMensaje(statusObj = {}, channelId = null, empresaIdFallback = null) {
            const wamid = String(statusObj.id || statusObj.wamid || '').trim();
            const recipientId = normalizarTelefono(statusObj.recipient_id || '');

            let empresasAsociadas = [];
            let canalResuelto = channelId || DEFAULT_SHARED_WHATSAPP_CHANNEL.id;

            if (wamid) {
                const rLogs = await peticionJson(
                    `/rest/v1/whatsapp_messages_log?wamid=eq.${encodeURIComponent(wamid)}&select=empresa_id,channel_id`,
                    { method: 'GET' }
                );
                if (rLogs.ok && Array.isArray(rLogs.data) && rLogs.data.length > 0) {
                    if (rLogs.data[0].channel_id) canalResuelto = rLogs.data[0].channel_id;
                    empresasAsociadas = Array.from(new Set(rLogs.data.map((l) => l.empresa_id).filter(Boolean)));
                }
            }

            if (empresasAsociadas.length === 0) {
                empresasAsociadas = [empresaIdFallback || null];
            }

            const err0 = Array.isArray(statusObj.errors) && statusObj.errors.length > 0 ? statusObj.errors[0] : null;
            const errorCode = statusObj.error_code || (err0?.code !== undefined ? String(err0.code) : null);
            const errorTitle = statusObj.error_title || err0?.title || err0?.message || null;
            const errorDetails = statusObj.error_details || err0?.error_data?.details || err0?.details || null;

            const tsIso = statusObj.timestamp
                ? (Number.isFinite(Number(statusObj.timestamp)) && Number(statusObj.timestamp) < 1e11
                    ? new Date(Number(statusObj.timestamp) * 1000).toISOString()
                    : new Date(statusObj.timestamp).toISOString())
                : new Date().toISOString();

            const filasStatus = empresasAsociadas.map((empId) => ({
                id: `WMS-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                empresa_id: empId,
                channel_id: canalResuelto,
                wamid: wamid || `wamid.status.${Date.now()}`,
                recipient_id: recipientId,
                status: String(statusObj.status || 'unknown').toLowerCase(),
                error_code: errorCode ? String(errorCode) : null,
                error_title: errorTitle ? String(errorTitle) : null,
                error_details: errorDetails ? String(errorDetails) : null,
                timestamp: tsIso,
                created_at: new Date().toISOString()
            }));

            await peticionJson('/rest/v1/whatsapp_message_status', {
                method: 'POST',
                headers: { Prefer: 'return=minimal' },
                body: JSON.stringify(filasStatus)
            });

            return filasStatus;
        },

        // ---------------- MÉTODOS DEL PANEL ADMINISTRATIVO (RLS) ----------------

        async cargarDatosPanel() {
            const [rCh, rCont, rAcc, rLogs, rStat] = await Promise.all([
                peticionJson(
                    '/rest/v1/whatsapp_channels?select=id,phone_number_id,waba_id,display_phone_number,nombre,tipo,empresa_id,template_name,template_lang,activo,created_at&order=created_at.asc',
                    { method: 'GET' }
                ),
                peticionJson(
                    '/rest/v1/whatsapp_contacts?select=id,telefono,nombre,activo,created_at&order=created_at.desc',
                    { method: 'GET' }
                ),
                peticionJson(
                    '/rest/v1/whatsapp_contact_access?select=id,contact_id,empresa_id,finca_id,rol,activo,created_at&order=created_at.asc',
                    { method: 'GET' }
                ),
                peticionJson(
                    '/rest/v1/whatsapp_messages_log?select=*&order=created_at.desc&limit=500',
                    { method: 'GET' }
                ),
                peticionJson(
                    '/rest/v1/whatsapp_message_status?select=*&order=created_at.desc&limit=50',
                    { method: 'GET' }
                )
            ]);

            const faltaMigracionSql =
                rCh.status === 404 ||
                rCont.status === 404 ||
                rAcc.status === 404 ||
                String(rCh.data?.code || '') === 'PGRST205' ||
                String(rCont.data?.code || '') === 'PGRST205' ||
                String(rAcc.data?.code || '') === 'PGRST205';

            const channels = rCh.ok && Array.isArray(rCh.data) ? rCh.data.map(sanitizarCanalParaFrontend) : [];
            const rawContacts = rCont.ok && Array.isArray(rCont.data) ? rCont.data : [];
            const rawAccess = rAcc.ok && Array.isArray(rAcc.data) ? rAcc.data : [];
            const messagesLog = rLogs.ok && Array.isArray(rLogs.data) ? rLogs.data : [];
            const messageStatus = rStat.ok && Array.isArray(rStat.data) ? rStat.data : [];

            const accesosPorContacto = new Map();
            for (const acc of rawAccess) {
                const cid = String(acc.contact_id);
                if (!accesosPorContacto.has(cid)) accesosPorContacto.set(cid, []);
                accesosPorContacto.get(cid).push(acc);
            }

            const contacts = rawContacts.map((c) => ({
                ...c,
                telefono: normalizarTelefono(c.telefono),
                accesos: accesosPorContacto.get(String(c.id)) || []
            }));

            return {
                ok: !faltaMigracionSql && rCh.ok,
                faltaMigracionSql,
                error: faltaMigracionSql
                    ? 'Las tablas whatsapp_* aún no existen en el proyecto Supabase "ganadero". Ejecuta la migración SQL en el SQL Editor de Supabase.'
                    : (!rCh.ok ? (rCh.data?.message || `Error HTTP ${rCh.status} consultando Supabase`) : null),
                channels,
                contacts,
                contactAccess: rawAccess,
                messagesLog,
                messageStatus
            };
        },

        async guardarCanalPanel(datos = {}) {
            const phoneNumberId = String(datos.phone_number_id || '').trim();
            if (!phoneNumberId) {
                return { ok: false, error: 'El phone_number_id de Meta es obligatorio.' };
            }
            const tipo = datos.tipo === 'dedicado' ? 'dedicado' : 'compartido';
            const empresaId = tipo === 'dedicado' ? String(datos.empresa_id || '').trim() : null;
            if (tipo === 'dedicado' && !empresaId) {
                return { ok: false, error: 'Un canal dedicado requiere empresa_id.' };
            }

            const payload = {
                id: datos.id || `CH-${Date.now()}`,
                phone_number_id: phoneNumberId,
                waba_id: String(datos.waba_id || '118927644541032').trim(),
                display_phone_number: String(datos.display_phone_number || '').trim(),
                nombre: String(datos.nombre || (tipo === 'dedicado' ? `Canal Dedicado ${empresaId}` : 'Canal Compartido Ganadero AD')).trim(),
                tipo,
                empresa_id: empresaId,
                template_name: String(datos.template_name || 'notificacion_ganadero_ad').trim(),
                template_lang: String(datos.template_lang || 'es').trim(),
                activo: datos.activo !== undefined ? Boolean(datos.activo) : true
            };

            if (datos.access_token_override && String(datos.access_token_override).trim()) {
                payload.access_token_override = String(datos.access_token_override).trim();
            }

            const r = await peticionJson('/rest/v1/whatsapp_channels?on_conflict=phone_number_id', {
                method: 'POST',
                headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
                body: JSON.stringify(payload)
            });

            if (!r.ok) {
                return { ok: false, error: r.data?.message || `Error HTTP ${r.status} guardando canal en Supabase.` };
            }
            return { ok: true, channel: sanitizarCanalParaFrontend(payload) };
        },

        async guardarContactoConAccesosPanel({
            contactId = null,
            telefono = '',
            nombre = '',
            activo = true,
            accesos = [],
            modoSuperAdmin = false
        } = {}) {
            const telNorm = normalizarTelefono(telefono);
            if (!telNorm || telNorm.length < 8) {
                return { ok: false, error: 'Ingresa un teléfono válido (ej: 573017839578 o 3017839578).' };
            }

            const accesosLimpios = (Array.isArray(accesos) ? accesos : []).map((a) => ({
                empresa_id: String(a.empresa_id || '').trim(),
                finca_id: a.finca_id ? String(a.finca_id).trim() : null,
                rol: ['operador', 'administrador', 'veterinario'].includes(String(a.rol || '').toLowerCase())
                    ? String(a.rol).toLowerCase()
                    : 'operador',
                activo: a.activo !== false
            })).filter((a) => a.empresa_id);

            if (accesosLimpios.length === 0) {
                return { ok: false, error: 'Debes asignar al menos un permiso de empresa.' };
            }

            const r = await peticionJson('/rest/v1/rpc/rpc_whatsapp_guardar_contacto', {
                method: 'POST',
                body: JSON.stringify({
                    p_telefono: telNorm,
                    p_nombre: String(nombre || 'Operador Autorizado').trim(),
                    p_activo: Boolean(activo),
                    p_accesos: accesosLimpios,
                    p_modo_superadmin: Boolean(modoSuperAdmin),
                    p_contact_id: contactId || null
                })
            });

            if (!r.ok) {
                return {
                    ok: false,
                    error: r.data?.message || r.data?.details || `Error HTTP ${r.status} guardando contacto en Supabase.`
                };
            }
            return { ok: true, data: r.data };
        },

        async cambiarEstadoContactoPanel({ contactId, activo, empresaId = null, esSuperAdmin = false }) {
            const r = await peticionJson('/rest/v1/rpc/rpc_whatsapp_cambiar_estado_contacto', {
                method: 'POST',
                body: JSON.stringify({
                    p_contact_id: contactId,
                    p_activo: Boolean(activo),
                    p_empresa_id: esSuperAdmin ? null : empresaId
                })
            });
            if (!r.ok) {
                return { ok: false, error: r.data?.message || `Error HTTP ${r.status} actualizando estado.` };
            }
            return { ok: true };
        },

        async eliminarContactoPanel({ contactId, empresaId = null, esSuperAdmin = false }) {
            const r = await peticionJson('/rest/v1/rpc/rpc_whatsapp_eliminar_contacto', {
                method: 'POST',
                body: JSON.stringify({
                    p_contact_id: contactId,
                    p_empresa_id: esSuperAdmin ? null : empresaId
                })
            });
            if (!r.ok) {
                return { ok: false, error: r.data?.message || `Error HTTP ${r.status} eliminando contacto.` };
            }
            return { ok: true };
        }
    };
}

// ============================================================================
// 6. REPORTE DE CONSUMO MENSUAL DESDE FILAS DE SUPABASE (whatsapp_messages_log)
// ============================================================================

export function calcularReporteConsumoWhatsAppDesdeLogs(
    logs = [],
    { empresaId = null, esSuperAdmin = true, empresasCatalogo = [] } = {}
) {
    const mapaEmpresas = new Map();
    for (const emp of Array.isArray(empresasCatalogo) ? empresasCatalogo : []) {
        if (emp?.id) mapaEmpresas.set(String(emp.id), emp.nombre || emp.razonSocial || String(emp.id));
    }

    const agrupado = new Map();
    for (const log of Array.isArray(logs) ? logs : []) {
        if (!log || log.contenido_resumen === '[NO_AUTORIZADO]') continue;
        const empId = log.empresa_id || 'SIN_EMPRESA';
        if (!esSuperAdmin && empresaId && String(empId) !== String(empresaId)) continue;
        if (empresaId && String(empId) !== String(empresaId)) continue;

        const mes = String(log.created_at || new Date().toISOString()).slice(0, 7);
        const key = `${empId}::${mes}`;
        if (!agrupado.has(key)) {
            agrupado.set(key, {
                empresa_id: empId,
                empresa_nombre: mapaEmpresas.get(String(empId)) || empId,
                mes,
                entrantes_texto: 0,
                salientes_texto: 0,
                plantillas_salientes: 0,
                total_mensajes: 0
            });
        }
        const fila = agrupado.get(key);
        if (log.direccion === 'in') {
            fila.entrantes_texto += 1;
        } else if (log.tipo === 'template') {
            fila.plantillas_salientes += 1;
        } else {
            fila.salientes_texto += 1;
        }
        fila.total_mensajes += 1;
    }

    return Array.from(agrupado.values()).sort((a, b) => b.mes.localeCompare(a.mes));
}

// ============================================================================
// 7. ENVÍO SALIENTE A META GRAPH API v25.0 Y CONTROL DE VENTANA DE 24H
// ============================================================================

export async function enviarMensajeWhatsApp(telefonoDestino, textoMensaje, env = {}, fetchImpl = globalThis.fetch, opciones = {}) {
    const phoneNumberId = opciones.phoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID || DEFAULT_SHARED_WHATSAPP_CHANNEL.phone_number_id;
    const accessToken = opciones.accessToken || env.WHATSAPP_SYSTEM_TOKEN || env.WHATSAPP_ACCESS_TOKEN;
    const destinatario = normalizarTelefono(telefonoDestino);

    if (!phoneNumberId || !accessToken) {
        throw new Error('Faltan credenciales del servidor (WHATSAPP_SYSTEM_TOKEN o phone_number_id).');
    }

    if (typeof fetchImpl !== 'function') {
        throw new Error('No hay implementación de fetch disponible para llamar a Graph API.');
    }

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
    const esPlantilla = Boolean(opciones.esPlantilla || (typeof textoMensaje === 'object' && textoMensaje?.type === 'template'));

    const payload = esPlantilla
        ? {
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: destinatario,
              type: 'template',
              template: textoMensaje.template || {
                  name: opciones.templateName || 'notificacion_ganadero_ad',
                  language: { code: opciones.templateLang || 'es' }
              }
          }
        : {
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: destinatario,
              type: 'text',
              preview_url: false,
              text: {
                  body: String(textoMensaje)
              }
          };

    const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    let data = {};
    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (!response.ok) {
        const detalleError = data?.error?.message || `HTTP ${response.status}`;
        const err = new Error(`Error Graph API (${response.status}): ${detalleError}`);
        err.errorCode = data?.error?.code ? String(data.error.code) : String(response.status);
        err.errorTitle = data?.error?.error_user_title || data?.error?.type || detalleError;
        err.errorDetails = data?.error?.error_data?.details || detalleError;
        throw err;
    }

    return data;
}

export function evaluarVentana24hSesion(sesion = null, ahoraMs = Date.now()) {
    if (!sesion || !sesion.last_inbound_at) {
        return { abierta: false, sesion: null, msTranscurridos: Infinity };
    }
    const lastMs = Date.parse(sesion.last_inbound_at);
    if (!Number.isFinite(lastMs)) {
        return { abierta: false, sesion, msTranscurridos: Infinity };
    }
    const msTranscurridos = Math.max(0, ahoraMs - lastMs);
    return {
        abierta: msTranscurridos <= VENTANA_24H_MS,
        sesion,
        msTranscurridos
    };
}

export async function enviarWhatsApp(empresaId, telefonoDestino, mensajeOPlantilla, opciones = {}) {
    if (!empresaId || !String(empresaId).trim()) {
        return {
            ok: false,
            codigo: 'EMPRESA_ID_REQUERIDO',
            error: 'Se requiere empresa_id para enviar mensajes en modo multitenant.'
        };
    }

    const destinatario = normalizarTelefono(telefonoDestino);
    if (!destinatario || destinatario.length < 8) {
        return {
            ok: false,
            codigo: 'TELEFONO_INVALIDO',
            error: 'El teléfono destino no es válido.'
        };
    }

    const env = opciones.env || (typeof process !== 'undefined' && process.env ? process.env : {});
    const fetchImpl = opciones.fetchImpl || globalThis.fetch;
    const repo = opciones.repo || crearRepositorioWhatsAppSupabase({ env, usarServiceRole: true, fetchImpl });

    const canal = (await repo.obtenerCanalActivoEmpresa(empresaId)) || DEFAULT_SHARED_WHATSAPP_CHANNEL;
    const numeroPropioCanal = normalizarTelefono(canal.display_phone_number);

    if ((numeroPropioCanal && destinatario === numeroPropioCanal) || destinatario === String(canal.phone_number_id)) {
        return {
            ok: false,
            codigo: 'DESTINO_PROPIO_CANAL',
            error: 'El número de destino no puede ser el propio número del canal de WhatsApp.'
        };
    }

    const esPlantilla = Boolean(
        opciones.tipo === 'template' ||
        opciones.esPlantilla === true ||
        (typeof mensajeOPlantilla === 'object' &&
            mensajeOPlantilla !== null &&
            (mensajeOPlantilla.tipo === 'template' || mensajeOPlantilla.type === 'template' || mensajeOPlantilla.template_name))
    );

    const sesionActual = await repo.obtenerSesion24h(canal.id, destinatario);
    const estadoVentana = evaluarVentana24hSesion(sesionActual, opciones.ahoraMs || Date.now());

    if (!esPlantilla && !estadoVentana.abierta) {
        if (opciones.usarPlantillaSiCerrada) {
            return enviarWhatsApp(
                empresaId,
                destinatario,
                {
                    tipo: 'template',
                    template_name: canal.template_name || 'notificacion_ganadero_ad',
                    template_lang: canal.template_lang || 'es'
                },
                { ...opciones, repo, tipo: 'template', esPlantilla: true }
            );
        }
        return {
            ok: false,
            codigo: 'FUERA_VENTANA_24H',
            error: 'Fuera de la ventana de 24h: usa una plantilla aprobada'
        };
    }

    const tokenAUsar = canal.access_token_override || env.WHATSAPP_SYSTEM_TOKEN || env.WHATSAPP_ACCESS_TOKEN;
    const templateName =
        (typeof mensajeOPlantilla === 'object' && mensajeOPlantilla?.template_name) ||
        canal.template_name ||
        'notificacion_ganadero_ad';
    const templateLang =
        (typeof mensajeOPlantilla === 'object' && mensajeOPlantilla?.template_lang) ||
        canal.template_lang ||
        'es';

    const payloadEnvio = esPlantilla
        ? {
              type: 'template',
              template: {
                  name: templateName,
                  language: { code: templateLang }
              }
          }
        : String(typeof mensajeOPlantilla === 'object' ? (mensajeOPlantilla.texto || mensajeOPlantilla.body || '') : mensajeOPlantilla);

    try {
        const respuestaMeta = await enviarMensajeWhatsApp(destinatario, payloadEnvio, env, fetchImpl, {
            phoneNumberId: canal.phone_number_id,
            accessToken: tokenAUsar,
            esPlantilla,
            templateName,
            templateLang
        });

        const wamid = respuestaMeta?.messages?.[0]?.id || `wamid.out.${Date.now()}`;
        const logs = await repo.insertarLogsMensajes([
            {
                empresa_id: empresaId,
                channel_id: canal.id,
                telefono: destinatario,
                direccion: 'out',
                tipo: esPlantilla ? 'template' : 'text',
                wamid,
                contenido_resumen: esPlantilla ? `[PLANTILLA: ${templateName} (${templateLang})]` : payloadEnvio
            }
        ]);

        return {
            ok: true,
            wamid,
            channel: sanitizarCanalParaFrontend(canal),
            log: logs[0] || null,
            respuestaMeta
        };
    } catch (error) {
        await repo.registrarEstadoMensaje(
            {
                id: `wamid.err.${Date.now()}`,
                recipient_id: destinatario,
                status: 'failed',
                error_code: error.errorCode || '500',
                error_title: error.errorTitle || 'Error de envío Graph API',
                error_details: error.errorDetails || error.message
            },
            canal.id,
            empresaId
        );
        return {
            ok: false,
            codigo: error.errorCode || 'ERROR_ENVIO_META',
            error: error.message
        };
    }
}

// ============================================================================
// 8. PROCESADOR DEL WEBHOOK POST /api/whatsapp (100% SUPABASE + SERVICE_ROLE)
// ============================================================================

/**
 * Procesa el payload POST recibido en `/api/whatsapp` desde Meta Cloud API v25.0:
 * 1) Valida firma X-Hub-Signature-256 sobre body CRUDO con crypto.timingSafeEqual (500 / 401).
 * 2) Usa SUPABASE_SERVICE_ROLE_KEY en el servidor (o opciones.repo en pruebas).
 * 3) Canal = whatsapp_channels por metadata.phone_number_id. Si no existe o inactivo -> ignorar.
 * 4) Procesa value.statuses[] -> whatsapp_message_status.
 * 5) Contacto = whatsapp_contacts por telefono normalizado y activo. Si no existe o sin alcance ->
 *    responde "Este número no está autorizado. Contacta al administrador de tu empresa." y termina.
 * 6) Calcula ALCANCE PERMITIDO desde whatsapp_contact_access (y limita a canal.empresa_id si dedicado).
 * 7) Ejecuta INFO <ID>, PESO <ID> <KG> [FINCA] o AYUDA sobre todo el alcance permitido.
 * 8) Actualiza whatsapp_sessions (last_inbound_at, updated_at) y registra entrada y salida en
 *    whatsapp_messages_log (en la salida, una fila por empresa involucrada para el reporte de consumo).
 * 9) Responde por el mismo canal del que llegó el mensaje (dividiendo en varios mensajes si > 4.000 chars).
 */
export async function procesarWebhookPostWhatsApp(payload = {}, opciones = {}) {
    const env = opciones.env || (typeof process !== 'undefined' && process.env ? process.env : {});
    const fetchImpl = opciones.fetchImpl || globalThis.fetch;

    // Validación obligatoria de firma X-Hub-Signature-256
    if (opciones.omitirValidacionFirma !== true) {
        const rawBody = opciones.rawBody !== undefined
            ? opciones.rawBody
            : (typeof payload === 'string' ? payload : JSON.stringify(payload ?? {}));
        const verifFirma = validarFirmaWebhookMeta(rawBody, opciones.signatureHeader, env.WHATSAPP_APP_SECRET);
        if (!verifFirma.ok) {
            return {
                status: verifFirma.status || 401,
                body: { error: verifFirma.error }
            };
        }
    }

    try {
        const repo = opciones.repo || crearRepositorioWhatsAppSupabase({
            env,
            usarServiceRole: true,
            fetchImpl
        });

        const entries = Array.isArray(payload?.entry) ? payload.entry : [];
        const resultadosProcesados = [];
        const estadosProcesados = [];
        let huboMensajeNoAutorizado = false;
        let canalInactivoOInexistente = false;
        let catalogoCache = null;

        for (const entry of entries) {
            const changes = Array.isArray(entry?.changes) ? entry.changes : [];
            for (const change of changes) {
                const value = change?.value || {};
                const phoneNumberIdEvento = value?.metadata?.phone_number_id
                    ? String(value.metadata.phone_number_id).trim()
                    : null;

                if (!phoneNumberIdEvento) {
                    canalInactivoOInexistente = true;
                    continue;
                }

                // 1. Canal = whatsapp_channels por metadata.phone_number_id. Si no existe o inactivo -> ignorar.
                const canal = await repo.obtenerCanalPorPhoneNumberId(phoneNumberIdEvento);
                if (!canal || canal.activo === false) {
                    canalInactivoOInexistente = true;
                    continue;
                }

                // Procesar statuses
                const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
                for (const st of statuses) {
                    const regSt = await repo.registrarEstadoMensaje(st, canal.id, canal.empresa_id || null);
                    estadosProcesados.push(...(Array.isArray(regSt) ? regSt : [regSt]));
                }

                // Procesar mensajes entrantes
                const messages = Array.isArray(value?.messages) ? value.messages : [];
                const waIdContacto = value?.contacts?.[0]?.wa_id || '';

                for (const msg of messages) {
                    const remitente = normalizarTelefono(msg?.from || waIdContacto || '');
                    if (!remitente) continue;

                    // Evitar auto-bucle si el remitente es el propio número del canal
                    const numPropioCanal = normalizarTelefono(canal.display_phone_number);
                    if ((numPropioCanal && remitente === numPropioCanal) || remitente === String(canal.phone_number_id)) {
                        continue;
                    }

                    const tokenCanal = canal.access_token_override || env.WHATSAPP_SYSTEM_TOKEN || env.WHATSAPP_ACCESS_TOKEN;

                    // 2. Contacto = whatsapp_contacts por telefono normalizado y activo
                    const datosContacto = await repo.obtenerContactoConAccesosPorTelefono(remitente);

                    if (!catalogoCache) {
                        catalogoCache = await repo.obtenerCatalogoEmpresasYFincas();
                    }

                    // 3. ALCANCE PERMITIDO desde whatsapp_contact_access
                    const alcance = datosContacto
                        ? resolverAlcancePermitidoContacto({
                              contacto: datosContacto.contacto,
                              accesos: datosContacto.accesos,
                              canal,
                              empresas: catalogoCache.empresas,
                              fincas: catalogoCache.fincas
                          })
                        : { autorizado: false, fincasPermitidas: [], empresasIds: [] };

                    if (!datosContacto || !alcance.autorizado) {
                        huboMensajeNoAutorizado = true;
                        if (tokenCanal && typeof fetchImpl === 'function') {
                            const msgNoAuth = 'Este número no está autorizado. Contacta al administrador de tu empresa.';
                            try {
                                await enviarMensajeWhatsApp(remitente, msgNoAuth, env, fetchImpl, {
                                    phoneNumberId: canal.phone_number_id,
                                    accessToken: tokenCanal
                                });
                            } catch {
                                // Ignorar fallo de red en aviso a no autorizado
                            }
                        }
                        continue;
                    }

                    // 9. Actualizar whatsapp_sessions.last_inbound_at y updated_at
                    const ahoraIso = new Date().toISOString();
                    await repo.actualizarSesion24h(canal.id, remitente, ahoraIso);

                    const textoRecibido = msg?.type === 'text' ? String(msg?.text?.body || '') : '';

                    // Ejecutar comando sobre todo el alcance permitido
                    const adaptadorEjecucion = opciones.dbAdapter || repo;
                    const resultadoComando = await ejecutarComandoAlcanceWhatsApp(
                        textoRecibido,
                        alcance,
                        adaptadorEjecucion,
                        { remitente }
                    );

                    const empresasInvolucradas =
                        Array.isArray(resultadoComando.empresasInvolucradas) && resultadoComando.empresasInvolucradas.length > 0
                            ? resultadoComando.empresasInvolucradas
                            : (alcance.empresasIds.length > 0 ? alcance.empresasIds : [canal.empresa_id || null]);

                    // Registrar mensaje entrante en whatsapp_messages_log
                    await repo.insertarLogsMensajes([
                        {
                            empresa_id: empresasInvolucradas.length === 1 ? empresasInvolucradas[0] : (canal.empresa_id || empresasInvolucradas[0] || null),
                            channel_id: canal.id,
                            telefono: remitente,
                            direccion: 'in',
                            tipo: 'text',
                            wamid: msg?.id || `wamid.in.${Date.now()}`,
                            contenido_resumen: textoRecibido || '[NO_TEXTO]',
                            created_at: ahoraIso
                        }
                    ]);

                    // 10. Responder por el mismo canal (dividiendo en varios mensajes si supera 4.000 caracteres)
                    const fragmentos = Array.isArray(resultadoComando.mensajesRespuesta) && resultadoComando.mensajesRespuesta.length > 0
                        ? resultadoComando.mensajesRespuesta
                        : dividirMensajeWhatsApp(resultadoComando.mensajeRespuesta || '');

                    const respuestasGraph = [];
                    if (tokenCanal && fragmentos.length > 0) {
                        for (const fragmento of fragmentos) {
                            const respMeta = await enviarMensajeWhatsApp(remitente, fragmento, env, fetchImpl, {
                                phoneNumberId: canal.phone_number_id,
                                accessToken: tokenCanal
                            });
                            respuestasGraph.push(respMeta);
                            const wamidOut = respMeta?.messages?.[0]?.id || `wamid.reply.${Date.now()}`;

                            // En la salida: una fila por empresa involucrada, para el reporte de consumo
                            const filasSalida = empresasInvolucradas.map((empId) => ({
                                empresa_id: empId || null,
                                channel_id: canal.id,
                                telefono: remitente,
                                direccion: 'out',
                                tipo: 'text',
                                wamid: wamidOut,
                                contenido_resumen: fragmento
                            }));
                            await repo.insertarLogsMensajes(filasSalida);
                        }
                    }

                    resultadosProcesados.push({
                        remitente,
                        contact_id: datosContacto.contacto.id,
                        empresas_involucradas: empresasInvolucradas,
                        channel_id: canal.id,
                        phone_number_id: canal.phone_number_id,
                        comando: resultadoComando.comando,
                        exito: resultadoComando.exito,
                        mensajeRespuesta: resultadoComando.mensajeRespuesta,
                        mensajesEnviados: fragmentos.length,
                        respuestasGraph
                    });
                }
            }
        }

        return {
            status: 200,
            body: {
                status: 'EVENT_RECEIVED',
                processed: resultadosProcesados.length,
                statusesProcessed: estadosProcesados.length,
                ignored: resultadosProcesados.length === 0 && (huboMensajeNoAutorizado || canalInactivoOInexistente),
                results: resultadosProcesados
            }
        };
    } catch (error) {
        console.error('[POST /api/whatsapp] Error interno:', error?.message || error);
        return {
            status: 200,
            body: {
                status: 'EVENT_RECEIVED_WITH_INTERNAL_ERROR',
                error: error?.message || 'Error interno procesando webhook de WhatsApp'
            }
        };
    }
}

// ============================================================================
// 9. REPOSITORIO EN MEMORIA (EXCLUSIVO PARA PRUEBAS AUTOMATIZADAS SIN RED)
//    NUNCA USA localStorage — SIMULA LAS 6 TABLAS Y LAS REGLAS RLS DE SUPABASE
// ============================================================================

export function crearRepositorioWhatsAppMemoria({
    empresas = [],
    fincas = [],
    animales = []
} = {}) {
    const db = {
        channels: [{ ...DEFAULT_SHARED_WHATSAPP_CHANNEL }],
        contacts: [],
        contact_access: [],
        sessions: new Map(), // `${channel_id}::${telefono}` -> { channel_id, telefono, last_inbound_at, updated_at }
        messages_log: [],
        message_status: [],
        empresas: Array.isArray(empresas) ? empresas.map((e) => ({ ...e })) : [],
        fincas: Array.isArray(fincas) ? fincas.map((f) => ({ ...f })) : [],
        animales: Array.isArray(animales) ? animales.map((a) => ({ ...a })) : [],
        pesajes_animales: []
    };

    return {
        _db: db,

        async obtenerCanalPorPhoneNumberId(phoneNumberId) {
            return db.channels.find((c) => String(c.phone_number_id) === String(phoneNumberId)) || null;
        },

        async obtenerCanalActivoEmpresa(empresaId) {
            const dedicado = empresaId
                ? db.channels.find((c) => c.tipo === 'dedicado' && c.activo !== false && String(c.empresa_id) === String(empresaId))
                : null;
            const compartido = db.channels.find((c) => c.tipo === 'compartido' && c.activo !== false) || DEFAULT_SHARED_WHATSAPP_CHANNEL;
            return dedicado || compartido;
        },

        async obtenerContactoConAccesosPorTelefono(telefono) {
            const telNorm = normalizarTelefono(telefono);
            const contacto = db.contacts.find((c) => c.telefono === telNorm && c.activo !== false);
            if (!contacto) return null;
            const accesos = db.contact_access.filter((a) => a.contact_id === contacto.id && a.activo !== false);
            return { contacto: { ...contacto }, accesos: accesos.map((a) => ({ ...a })) };
        },

        async obtenerCatalogoEmpresasYFincas() {
            return {
                empresas: db.empresas.map((e) => ({ ...e })),
                fincas: db.fincas.map((f) => ({
                    id: String(f.id),
                    nombre: f.nombre,
                    codigo: f.codigo || '',
                    empresa_id: String(f.empresa_id || f.empresaId || '')
                }))
            };
        },

        async buscarAnimalesPorTagEnFincas(idAnimal, fincasIds = []) {
            const setFincas = new Set(fincasIds.map(String));
            const tagObj = normalizarTagComparacion(idAnimal);
            return db.animales
                .filter((a) => {
                    const fid = String(a.finca_id || a.fincaId || '');
                    const activo = (a.estado_vida || a.estadoVida || 'activo') === 'activo';
                    const tag = normalizarTagComparacion(a.identificacion_tag || a.identificacionTag);
                    return setFincas.has(fid) && activo && tag === tagObj;
                })
                .map((a) => ({ ...a }));
        },

        async registrarPesoAnimalEnFinca({ animal, idAnimal, pesoKg, fecha, remitente }) {
            const idx = db.animales.findIndex((a) => a.id === animal.id);
            if (idx === -1) return { exito: false, motivo: 'NO_ENCONTRADO' };
            const actual = db.animales[idx];
            const pesoAnterior = Number(actual.ultimo_peso_kg ?? actual.ultimoPesoKg ?? 0);
            const tagReal = actual.identificacion_tag || actual.identificacionTag || idAnimal;

            const calcGdp = calcularGDPEjemplar({
                animal: {
                    ultimoPesoKg: actual.ultimo_peso_kg ?? actual.ultimoPesoKg ?? null,
                    fechaUltimoPesaje: actual.fecha_ultimo_pesaje || actual.fechaUltimoPesaje || null,
                    fechaNacimiento: actual.fecha_nacimiento || actual.fechaNacimiento || null
                },
                pesoActual: pesoKg,
                fechaPesaje: fecha
            });
            const gdp = calcGdp ? calcGdp.gdp : null;

            actual.ultimo_peso_kg = pesoKg;
            actual.ultimoPesoKg = pesoKg;
            actual.fecha_ultimo_pesaje = fecha;
            actual.fechaUltimoPesaje = fecha;
            if (gdp !== null) actual.gdp_promedio_g_dia = gdp;

            const regPesaje = {
                id: `PES-WA-${Date.now()}-${db.pesajes_animales.length + 1}`,
                finca_id: actual.finca_id || actual.fincaId,
                animal_tag: tagReal,
                fecha_pesaje: fecha,
                peso_kg: pesoKg,
                gdp_calculada_g_dia: gdp,
                notas: `Registrado vía WhatsApp (${normalizarTelefono(remitente)})`
            };
            db.pesajes_animales.push(regPesaje);

            return {
                exito: true,
                idPesaje: regPesaje.id,
                animal: { ...actual },
                pesoAnterior,
                pesoNuevo: pesoKg,
                gdp,
                fecha
            };
        },

        async actualizarSesion24h(channelId, telefono, fechaIso = new Date().toISOString()) {
            const telNorm = normalizarTelefono(telefono);
            const fila = {
                channel_id: channelId,
                telefono: telNorm,
                last_inbound_at: fechaIso,
                updated_at: fechaIso
            };
            db.sessions.set(`${channelId}::${telNorm}`, fila);
            return fila;
        },

        async obtenerSesion24h(channelId, telefono) {
            const telNorm = normalizarTelefono(telefono);
            return db.sessions.get(`${channelId}::${telNorm}`) || null;
        },

        async insertarLogsMensajes(filas = []) {
            const creados = filas.map((f, idx) => ({
                id: f.id || `WML-${Date.now()}-${db.messages_log.length + idx}`,
                empresa_id: f.empresa_id || null,
                channel_id: f.channel_id || DEFAULT_SHARED_WHATSAPP_CHANNEL.id,
                telefono: normalizarTelefono(f.telefono),
                direccion: f.direccion === 'in' ? 'in' : 'out',
                tipo: f.tipo === 'template' ? 'template' : 'text',
                wamid: f.wamid || null,
                contenido_resumen: String(f.contenido_resumen || '').slice(0, 500),
                created_at: f.created_at || new Date().toISOString()
            }));
            db.messages_log.unshift(...creados);
            return creados;
        },

        async registrarEstadoMensaje(statusObj = {}, channelId = null, empresaIdFallback = null) {
            const wamid = String(statusObj.id || statusObj.wamid || '').trim();
            const recipientId = normalizarTelefono(statusObj.recipient_id || '');
            const logsMatch = wamid ? db.messages_log.filter((l) => l.wamid === wamid) : [];
            const empresas = logsMatch.length > 0
                ? Array.from(new Set(logsMatch.map((l) => l.empresa_id).filter(Boolean)))
                : [empresaIdFallback || null];
            if (empresas.length === 0) empresas.push(null);

            const err0 = Array.isArray(statusObj.errors) && statusObj.errors.length > 0 ? statusObj.errors[0] : null;
            const filas = empresas.map((empId, idx) => ({
                id: `WMS-${Date.now()}-${db.message_status.length + idx}`,
                empresa_id: empId,
                channel_id: logsMatch[0]?.channel_id || channelId || DEFAULT_SHARED_WHATSAPP_CHANNEL.id,
                wamid,
                recipient_id: recipientId,
                status: String(statusObj.status || 'unknown').toLowerCase(),
                error_code: statusObj.error_code || (err0?.code !== undefined ? String(err0.code) : null),
                error_title: statusObj.error_title || err0?.title || null,
                error_details: statusObj.error_details || err0?.error_data?.details || null,
                timestamp: new Date().toISOString(),
                created_at: new Date().toISOString()
            }));
            db.message_status.unshift(...filas);
            return filas;
        },

        // Simula RLS para pruebas del Panel (Super Admin vs Admin de Empresa)
        paraContextoPanel({ esSuperAdmin = false, empresaId = null } = {}) {
            const parent = this;
            return {
                async cargarDatosPanel() {
                    const channels = db.channels
                        .filter((c) => esSuperAdmin || c.tipo === 'compartido' || String(c.empresa_id) === String(empresaId))
                        .map(sanitizarCanalParaFrontend);

                    const contactAccess = db.contact_access.filter(
                        (a) => esSuperAdmin || String(a.empresa_id) === String(empresaId)
                    );
                    const idsContactosVisibles = new Set(contactAccess.map((a) => a.contact_id));

                    const contacts = db.contacts
                        .filter((c) => esSuperAdmin || idsContactosVisibles.has(c.id))
                        .map((c) => ({
                            ...c,
                            accesos: contactAccess.filter((a) => a.contact_id === c.id)
                        }));

                    const messagesLog = db.messages_log.filter(
                        (m) => esSuperAdmin || String(m.empresa_id) === String(empresaId)
                    );
                    const messageStatus = db.message_status.filter(
                        (s) => esSuperAdmin || String(s.empresa_id) === String(empresaId)
                    );

                    return {
                        ok: true,
                        faltaMigracionSql: false,
                        error: null,
                        channels,
                        contacts,
                        contactAccess,
                        messagesLog,
                        messageStatus
                    };
                },

                async guardarCanalPanel(datos = {}) {
                    if (!esSuperAdmin) return { ok: false, error: 'Solo Super Admin.' };
                    const idx = db.channels.findIndex(
                        (c) => String(c.phone_number_id) === String(datos.phone_number_id) || (datos.id && c.id === datos.id)
                    );
                    const reg = {
                        id: idx >= 0 ? db.channels[idx].id : (datos.id || `CH-${db.channels.length + 1}`),
                        phone_number_id: String(datos.phone_number_id).trim(),
                        waba_id: datos.waba_id || '118927644541032',
                        display_phone_number: datos.display_phone_number || '',
                        nombre: datos.nombre || 'Canal Dedicado',
                        tipo: datos.tipo === 'dedicado' ? 'dedicado' : 'compartido',
                        empresa_id: datos.tipo === 'dedicado' ? datos.empresa_id : null,
                        access_token_override: datos.access_token_override || (idx >= 0 ? db.channels[idx].access_token_override : null),
                        template_name: datos.template_name || 'notificacion_ganadero_ad',
                        template_lang: datos.template_lang || 'es',
                        activo: datos.activo !== false,
                        created_at: idx >= 0 ? db.channels[idx].created_at : new Date().toISOString()
                    };
                    if (idx >= 0) db.channels[idx] = reg;
                    else db.channels.push(reg);
                    return { ok: true, channel: sanitizarCanalParaFrontend(reg) };
                },

                async guardarContactoConAccesosPanel({ contactId = null, telefono, nombre, activo = true, accesos = [], modoSuperAdmin = false }) {
                    const telNorm = normalizarTelefono(telefono);
                    if (!telNorm || telNorm.length < 8) return { ok: false, error: 'Teléfono inválido.' };

                    const esPropioCanal = db.channels.some(
                        (ch) => normalizarTelefono(ch.display_phone_number) === telNorm || String(ch.phone_number_id) === telNorm
                    );
                    if (esPropioCanal) return { ok: false, error: 'No puedes registrar el propio número del canal.' };

                    let cont = (contactId && db.contacts.find((c) => c.id === contactId)) ||
                        db.contacts.find((c) => c.telefono === telNorm);

                    if (!cont) {
                        cont = {
                            id: contactId || `WAC-${db.contacts.length + 1}`,
                            telefono: telNorm,
                            nombre: String(nombre || 'Operador').trim(),
                            activo: Boolean(activo),
                            created_at: new Date().toISOString()
                        };
                        db.contacts.push(cont);
                    } else if (esSuperAdmin && modoSuperAdmin) {
                        cont.telefono = telNorm;
                        cont.nombre = String(nombre || cont.nombre).trim();
                        cont.activo = Boolean(activo);
                    } else {
                        cont.activo = true;
                    }

                    if (esSuperAdmin && modoSuperAdmin) {
                        db.contact_access = db.contact_access.filter((a) => a.contact_id !== cont.id);
                    } else {
                        db.contact_access = db.contact_access.filter(
                            (a) => !(a.contact_id === cont.id && String(a.empresa_id) === String(empresaId))
                        );
                    }

                    for (const item of accesos) {
                        const empTarget = esSuperAdmin && modoSuperAdmin ? String(item.empresa_id) : String(empresaId);
                        if (!empTarget) continue;
                        const fincaTarget = item.finca_id ? String(item.finca_id) : null;
                        const rolTarget = ['operador', 'administrador', 'veterinario'].includes(String(item.rol || '').toLowerCase())
                            ? String(item.rol).toLowerCase()
                            : 'operador';

                        if (fincaTarget === null) {
                            db.contact_access = db.contact_access.filter(
                                (a) => !(a.contact_id === cont.id && String(a.empresa_id) === empTarget)
                            );
                            db.contact_access.push({
                                id: `WCA-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                                contact_id: cont.id,
                                empresa_id: empTarget,
                                finca_id: null,
                                rol: rolTarget,
                                activo: item.activo !== false,
                                created_at: new Date().toISOString()
                            });
                        } else {
                            const yaTieneTodas = db.contact_access.some(
                                (a) => a.contact_id === cont.id && String(a.empresa_id) === empTarget && a.finca_id === null
                            );
                            if (!yaTieneTodas) {
                                const dup = db.contact_access.find(
                                    (a) => a.contact_id === cont.id && String(a.empresa_id) === empTarget && String(a.finca_id) === fincaTarget
                                );
                                if (dup) {
                                    dup.rol = rolTarget;
                                    dup.activo = item.activo !== false;
                                } else {
                                    db.contact_access.push({
                                        id: `WCA-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                                        contact_id: cont.id,
                                        empresa_id: empTarget,
                                        finca_id: fincaTarget,
                                        rol: rolTarget,
                                        activo: item.activo !== false,
                                        created_at: new Date().toISOString()
                                    });
                                }
                            }
                        }
                    }

                    return { ok: true, data: { ok: true, contact_id: cont.id, telefono: cont.telefono } };
                },

                async cambiarEstadoContactoPanel({ contactId, activo }) {
                    if (esSuperAdmin) {
                        const c = db.contacts.find((x) => x.id === contactId);
                        if (c) c.activo = Boolean(activo);
                    } else {
                        db.contact_access
                            .filter((a) => a.contact_id === contactId && String(a.empresa_id) === String(empresaId))
                            .forEach((a) => { a.activo = Boolean(activo); });
                    }
                    return { ok: true };
                },

                async eliminarContactoPanel({ contactId }) {
                    if (esSuperAdmin) {
                        db.contacts = db.contacts.filter((c) => c.id !== contactId);
                        db.contact_access = db.contact_access.filter((a) => a.contact_id !== contactId);
                    } else {
                        db.contact_access = db.contact_access.filter(
                            (a) => !(a.contact_id === contactId && String(a.empresa_id) === String(empresaId))
                        );
                        if (!db.contact_access.some((a) => a.contact_id === contactId)) {
                            db.contacts = db.contacts.filter((c) => c.id !== contactId);
                        }
                    }
                    return { ok: true };
                },

                obtenerCanalActivoEmpresa: parent.obtenerCanalActivoEmpresa.bind(parent),
                obtenerContactoConAccesosPorTelefono: parent.obtenerContactoConAccesosPorTelefono.bind(parent),
                obtenerCatalogoEmpresasYFincas: parent.obtenerCatalogoEmpresasYFincas.bind(parent),
                buscarAnimalesPorTagEnFincas: parent.buscarAnimalesPorTagEnFincas.bind(parent),
                registrarPesoAnimalEnFinca: parent.registrarPesoAnimalEnFinca.bind(parent),
                actualizarSesion24h: parent.actualizarSesion24h.bind(parent),
                insertarLogsMensajes: parent.insertarLogsMensajes.bind(parent)
            };
        }
    };
}
