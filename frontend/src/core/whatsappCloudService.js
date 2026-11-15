// ============================================================================
// GANADERO AD - SERVICIO OFICIAL WHATSAPP CLOUD API (META GRAPH API v25.0)
// Arquitectura Multitenant en Base Central Compartida con Aislamiento por
// empresa_id + finca_id, Canales Compartido/Dedicados, Ventana 24h y Auditoría
// ============================================================================

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
    template_lang: 'es_CO',
    activo: true,
    created_at: '2026-01-01T00:00:00.000Z'
});

const STORAGE_KEY_WA_MULTITENANT = 'bovitrack_whatsapp_multitenant_v25';
const SUPABASE_STATE_ROW_ID = 'SYS_WHATSAPP_MULTITENANT_STATE';
const VENTANA_24H_MS = 24 * 60 * 60 * 1000;

const SUPABASE_FALLBACK_URL = 'https://jucpxyjzmbthplbvzrsj.supabase.co';
const SUPABASE_FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Y3B4eWp6bWJ0aHBsYnZ6cnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MjI3MjAsImV4cCI6MjA4ODk5ODcyMH0.b1s113123123';

// ============================================================================
// 1. UTILIDADES DE NORMALIZACIÓN Y CRIPTOGRAFÍA (HMAC-SHA256 SÍNCRONO)
// ============================================================================

/**
 * Normaliza un número telefónico al formato estándar E.164 sin símbolo '+'
 * Ej: "+57 (301) 783-9578" -> "573017839578"
 * Si recibe un móvil colombiano de 10 dígitos que inicia en 3 ("3017839578"),
 * le antepone el indicativo "57" -> "573017839578".
 */
export function normalizarTelefonoWhatsApp(telefono = '') {
    const digitos = String(telefono || '').replace(/[^\d]/g, '');
    if (digitos.length === 10 && digitos.startsWith('3')) {
        return `57${digitos}`;
    }
    return digitos;
}

function normalizarTextoBusqueda(str = '') {
    return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

/**
 * Implementación pura y determinista de SHA-256 y HMAC-SHA256 (UTF-8)
 * Funciona de forma síncrona tanto en Node.js / Serverless como en Browser.
 */
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
 * Valida la firma X-Hub-Signature-256 enviada por Meta con WHATSAPP_APP_SECRET.
 * Si no es válida, retorna { ok: false, status: 401 }.
 */
export function validarFirmaWebhookMeta(rawBody, signatureHeader, appSecret) {
    if (!appSecret || !String(appSecret).trim()) {
        return { ok: false, status: 401, error: 'WHATSAPP_APP_SECRET no configurado en el servidor.' };
    }
    const header = String(signatureHeader || '').trim();
    if (!header.startsWith('sha256=')) {
        return { ok: false, status: 401, error: 'Cabecera X-Hub-Signature-256 ausente o mal formada.' };
    }
    const firmaRecibida = header.slice('sha256='.length).toLowerCase();
    const firmaEsperada = calcularHmacSha256Hex(rawBody, String(appSecret).trim()).toLowerCase();

    if (firmaRecibida.length !== firmaEsperada.length) {
        return { ok: false, status: 401, error: 'Firma X-Hub-Signature-256 inválida.' };
    }
    let diff = 0;
    for (let i = 0; i < firmaEsperada.length; i++) {
        diff |= firmaRecibida.charCodeAt(i) ^ firmaEsperada.charCodeAt(i);
    }
    if (diff !== 0) {
        return { ok: false, status: 401, error: 'Firma X-Hub-Signature-256 no coincide con el payload.' };
    }
    return { ok: true, status: 200 };
}

// ============================================================================
// 2. ESTADO MULTITENANT CENTRALIZADO (CANALES, CONTACTOS, LOGS, ESTADOS, 24H)
// ============================================================================

function crearEstadoInicialMultitenant() {
    return {
        channels: [{ ...DEFAULT_SHARED_WHATSAPP_CHANNEL }],
        contacts: [],
        messages_log: [],
        message_status: [],
        sessions: {}, // key: `${channel_id}::${telefono}` -> { channel_id, telefono, empresa_id, last_inbound_at }
        unauthorized_notified: {} // key: `${channel_id}::${telefono}` -> timestampIso
    };
}

let memoriaMultitenantState = crearEstadoInicialMultitenant();

function asegurarCanalCompartidoPorDefecto(state) {
    if (!state || typeof state !== 'object') return crearEstadoInicialMultitenant();
    if (!Array.isArray(state.channels)) state.channels = [];
    if (!Array.isArray(state.contacts)) state.contacts = [];
    if (!Array.isArray(state.messages_log)) state.messages_log = [];
    if (!Array.isArray(state.message_status)) state.message_status = [];
    if (!state.sessions || typeof state.sessions !== 'object') state.sessions = {};
    if (!state.unauthorized_notified || typeof state.unauthorized_notified !== 'object') state.unauthorized_notified = {};

    const idxShared = state.channels.findIndex(
        (c) => String(c.phone_number_id) === DEFAULT_SHARED_WHATSAPP_CHANNEL.phone_number_id || c.id === DEFAULT_SHARED_WHATSAPP_CHANNEL.id
    );
    if (idxShared === -1) {
        state.channels.unshift({ ...DEFAULT_SHARED_WHATSAPP_CHANNEL });
    } else {
        state.channels[idxShared] = {
            ...DEFAULT_SHARED_WHATSAPP_CHANNEL,
            ...state.channels[idxShared],
            phone_number_id: DEFAULT_SHARED_WHATSAPP_CHANNEL.phone_number_id,
            waba_id: state.channels[idxShared].waba_id || DEFAULT_SHARED_WHATSAPP_CHANNEL.waba_id,
            display_phone_number: state.channels[idxShared].display_phone_number || DEFAULT_SHARED_WHATSAPP_CHANNEL.display_phone_number,
            tipo: 'compartido',
            empresa_id: null
        };
    }
    return state;
}

export function obtenerEstadoWhatsAppMultitenant() {
    try {
        if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem(STORAGE_KEY_WA_MULTITENANT);
            if (raw) {
                const parsed = JSON.parse(raw);
                memoriaMultitenantState = asegurarCanalCompartidoPorDefecto(parsed);
            }
        }
    } catch { /* ignore storage errors */ }
    return asegurarCanalCompartidoPorDefecto(memoriaMultitenantState);
}

export function guardarEstadoWhatsAppMultitenant(nuevoEstado, opciones = {}) {
    memoriaMultitenantState = asegurarCanalCompartidoPorDefecto(nuevoEstado);
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(STORAGE_KEY_WA_MULTITENANT, JSON.stringify(memoriaMultitenantState));
        }
    } catch { /* ignore storage errors */ }
    if (!opciones.omitirSyncNube) {
        sincronizarEstadoWhatsAppConSupabase(memoriaMultitenantState).catch(() => {});
    }
    return memoriaMultitenantState;
}

export function reiniciarEstadoWhatsAppMultitenantParaTests() {
    memoriaMultitenantState = crearEstadoInicialMultitenant();
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(STORAGE_KEY_WA_MULTITENANT);
        }
    } catch { /* ignore */ }
    return memoriaMultitenantState;
}

/**
 * Enmascara tokens sensibles antes de entregar canales al frontend.
 * NUNCA devuelve access_token_override en texto plano.
 */
export function sanitizarCanalParaFrontend(canal = {}) {
    const tieneOverride = Boolean(canal.access_token_override && String(canal.access_token_override).trim());
    const copia = { ...canal };
    delete copia.access_token_override;
    return {
        ...copia,
        tiene_token_override: tieneOverride,
        token_estado: tieneOverride ? 'configurado ✓' : 'WHATSAPP_SYSTEM_TOKEN (configurado ✓)'
    };
}

/**
 * Obtiene los canales visibles según el rol:
 * - Super Admin: todos los canales (compartido + dedicados)
 * - Empresa: su canal dedicado (si existe) + el canal compartido por defecto
 */
export function listarCanalesWhatsApp({ empresaId = null, esSuperAdmin = false, incluirTokenInterno = false } = {}) {
    const state = obtenerEstadoWhatsAppMultitenant();
    const filtrados = state.channels.filter((ch) => {
        if (esSuperAdmin) return true;
        if (ch.tipo === 'compartido') return true;
        if (empresaId && String(ch.empresa_id) === String(empresaId)) return true;
        return false;
    });
    return incluirTokenInterno ? filtrados.map((c) => ({ ...c })) : filtrados.map(sanitizarCanalParaFrontend);
}

/**
 * Resuelve el canal activo que debe usar una empresa:
 * - Si la empresa tiene un canal DEDICADO activo, lo retorna.
 * - En caso contrario, retorna el canal COMPARTIDO por defecto (111443548633291 / +57 322 5694112).
 */
export function obtenerCanalActivoEmpresa(empresaId, { incluirTokenInterno = false } = {}) {
    const state = obtenerEstadoWhatsAppMultitenant();
    const dedicado = empresaId
        ? state.channels.find(
              (ch) => ch.tipo === 'dedicado' && ch.activo !== false && String(ch.empresa_id) === String(empresaId)
          )
        : null;
    const compartido = state.channels.find(
        (ch) => ch.tipo === 'compartido' && ch.activo !== false
    ) || DEFAULT_SHARED_WHATSAPP_CHANNEL;

    const elegido = dedicado || compartido;
    return incluirTokenInterno ? { ...elegido } : sanitizarCanalParaFrontend(elegido);
}

/**
 * Crea o actualiza un canal de WhatsApp (solo Super Admin).
 */
export function guardarCanalWhatsApp(datos = {}, { esSuperAdmin = true } = {}) {
    if (!esSuperAdmin) {
        return { ok: false, error: 'Solo el Super Administrador puede crear o modificar canales de WhatsApp.' };
    }
    const phoneNumberId = String(datos.phone_number_id || '').trim();
    if (!phoneNumberId) {
        return { ok: false, error: 'El phone_number_id de Meta es obligatorio.' };
    }
    const tipo = datos.tipo === 'dedicado' ? 'dedicado' : 'compartido';
    const empresaId = tipo === 'dedicado' ? String(datos.empresa_id || '').trim() : null;
    if (tipo === 'dedicado' && !empresaId) {
        return { ok: false, error: 'Un canal dedicado debe estar asignado a una empresa_id.' };
    }

    const state = obtenerEstadoWhatsAppMultitenant();
    const existenteIdx = state.channels.findIndex(
        (c) => String(c.phone_number_id) === phoneNumberId || (datos.id && c.id === datos.id)
    );

    const tokenOverride = datos.access_token_override && String(datos.access_token_override).trim()
        && !String(datos.access_token_override).includes('configurado')
        ? String(datos.access_token_override).trim()
        : (existenteIdx >= 0 ? state.channels[existenteIdx].access_token_override : null);

    const registro = {
        id: existenteIdx >= 0 ? state.channels[existenteIdx].id : (datos.id || `CH-${Date.now()}`),
        phone_number_id: phoneNumberId,
        waba_id: String(datos.waba_id || (existenteIdx >= 0 ? state.channels[existenteIdx].waba_id : '') || '').trim(),
        display_phone_number: String(datos.display_phone_number || (existenteIdx >= 0 ? state.channels[existenteIdx].display_phone_number : '') || '').trim(),
        nombre: String(datos.nombre || (tipo === 'dedicado' ? `Canal Dedicado ${empresaId}` : 'Canal Compartido Ganadero AD')).trim(),
        tipo,
        empresa_id: empresaId,
        access_token_override: tokenOverride || null,
        template_name: String(datos.template_name || 'notificacion_ganadero_ad').trim(),
        template_lang: String(datos.template_lang || 'es_CO').trim(),
        activo: datos.activo !== undefined ? Boolean(datos.activo) : true,
        created_at: existenteIdx >= 0 ? state.channels[existenteIdx].created_at : new Date().toISOString()
    };

    if (existenteIdx >= 0) {
        state.channels[existenteIdx] = registro;
    } else {
        state.channels.push(registro);
    }
    guardarEstadoWhatsAppMultitenant(state);
    return { ok: true, channel: sanitizarCanalParaFrontend(registro) };
}

/**
 * Lista los contactos de la lista blanca (whatsapp_contacts) filtrados por empresa_id
 * o todos si esSuperAdmin = true.
 */
export function listarContactosWhatsApp({ empresaId = null, esSuperAdmin = false } = {}) {
    const state = obtenerEstadoWhatsAppMultitenant();
    return state.contacts.filter((c) => {
        if (esSuperAdmin && !empresaId) return true;
        return String(c.empresa_id) === String(empresaId);
    });
}

/**
 * Registra o actualiza un contacto en whatsapp_contacts (lista blanca).
 * REGLA ESTRICTA: Un teléfono solo puede estar activo en UNA empresa a la vez
 * (UNIQUE (telefono) WHERE activo = true). Si ya está activo en otra empresa,
 * retorna error claro y bloquea el registro.
 */
export function guardarContactoWhatsApp(datos = {}) {
    const telefonoNorm = normalizarTelefonoWhatsApp(datos.telefono);
    const empresaId = String(datos.empresa_id || '').trim();
    if (!telefonoNorm || telefonoNorm.length < 8) {
        return { ok: false, codigo: 'TELEFONO_INVALIDO', error: 'Ingresa un número de teléfono válido en formato E.164 (ej: 573017839578).' };
    }
    if (!empresaId) {
        return { ok: false, codigo: 'EMPRESA_REQUERIDA', error: 'Debes especificar la empresa_id a la que pertenece el contacto.' };
    }

    const state = obtenerEstadoWhatsAppMultitenant();
    const activo = datos.activo !== undefined ? Boolean(datos.activo) : true;

    // Validar que el teléfono nunca sea el número propio de ningún canal del bot
    const esNumeroDeCanal = state.channels.some((ch) => {
        const displayNorm = normalizarTelefonoWhatsApp(ch.display_phone_number);
        return (displayNorm && displayNorm === telefonoNorm) || String(ch.phone_number_id) === telefonoNorm;
    });
    if (esNumeroDeCanal) {
        return {
            ok: false,
            codigo: 'TELEFONO_PROPIO_BOT',
            error: 'No puedes registrar el número del propio canal de WhatsApp como contacto.'
        };
    }

    // REGLA MULTITENANT: Un teléfono solo puede estar activo en UNA empresa
    if (activo) {
        const conflictoOtraEmpresa = state.contacts.find(
            (c) =>
                c.activo !== false &&
                normalizarTelefonoWhatsApp(c.telefono) === telefonoNorm &&
                String(c.empresa_id) !== empresaId &&
                (!datos.id || c.id !== datos.id)
        );
        if (conflictoOtraEmpresa) {
            return {
                ok: false,
                codigo: 'TELEFONO_ACTIVO_OTRA_EMPRESA',
                error: `El número ${telefonoNorm} ya está activo en otra empresa (${conflictoOtraEmpresa.empresa_id}). Un teléfono solo puede estar activo en una empresa a la vez.`
            };
        }
    }

    const idxExistente = state.contacts.findIndex(
        (c) =>
            (datos.id && c.id === datos.id) ||
            (normalizarTelefonoWhatsApp(c.telefono) === telefonoNorm && String(c.empresa_id) === empresaId)
    );

    const contacto = {
        id: idxExistente >= 0 ? state.contacts[idxExistente].id : (datos.id || `WAC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
        telefono: telefonoNorm,
        empresa_id: empresaId,
        finca_id: datos.finca_id ? String(datos.finca_id).trim() : null,
        nombre: String(datos.nombre || (idxExistente >= 0 ? state.contacts[idxExistente].nombre : 'Operador Autorizado')).trim(),
        rol: String(datos.rol || (idxExistente >= 0 ? state.contacts[idxExistente].rol : 'operador')).trim(),
        activo,
        created_at: idxExistente >= 0 ? state.contacts[idxExistente].created_at : new Date().toISOString()
    };

    if (idxExistente >= 0) {
        state.contacts[idxExistente] = contacto;
    } else {
        state.contacts.push(contacto);
    }

    // Limpiar bloqueo de notificación no autorizada si se acaba de autorizar
    for (const ch of state.channels) {
        delete state.unauthorized_notified[`${ch.id}::${telefonoNorm}`];
        delete state.unauthorized_notified[`${ch.phone_number_id}::${telefonoNorm}`];
    }

    guardarEstadoWhatsAppMultitenant(state);
    return { ok: true, contact: contacto };
}

export function cambiarEstadoContactoWhatsApp(contactoId, nuevoActivo, { empresaId = null, esSuperAdmin = false } = {}) {
    const state = obtenerEstadoWhatsAppMultitenant();
    const idx = state.contacts.findIndex((c) => c.id === contactoId);
    if (idx === -1) return { ok: false, error: 'Contacto no encontrado.' };
    const actual = state.contacts[idx];
    if (!esSuperAdmin && empresaId && String(actual.empresa_id) !== String(empresaId)) {
        return { ok: false, error: 'No tienes permiso para modificar contactos de otra empresa.' };
    }
    return guardarContactoWhatsApp({ ...actual, activo: Boolean(nuevoActivo) });
}

export function eliminarContactoWhatsApp(contactoId, { empresaId = null, esSuperAdmin = false } = {}) {
    const state = obtenerEstadoWhatsAppMultitenant();
    const idx = state.contacts.findIndex((c) => c.id === contactoId);
    if (idx === -1) return { ok: false, error: 'Contacto no encontrado.' };
    if (!esSuperAdmin && empresaId && String(state.contacts[idx].empresa_id) !== String(empresaId)) {
        return { ok: false, error: 'No tienes permiso para eliminar contactos de otra empresa.' };
    }
    const eliminado = state.contacts.splice(idx, 1)[0];
    guardarEstadoWhatsAppMultitenant(state);
    return { ok: true, deleted: eliminado };
}

/**
 * Registra o actualiza la ventana de 24h en whatsapp_sessions cuando entra un mensaje del usuario.
 */
export function actualizarSesion24hWhatsApp(channelId, telefono, empresaId, fechaIso = new Date().toISOString()) {
    const state = obtenerEstadoWhatsAppMultitenant();
    const telNorm = normalizarTelefonoWhatsApp(telefono);
    const key = `${channelId}::${telNorm}`;
    state.sessions[key] = {
        channel_id: channelId,
        telefono: telNorm,
        empresa_id: empresaId || null,
        last_inbound_at: fechaIso
    };
    guardarEstadoWhatsAppMultitenant(state);
    return state.sessions[key];
}

/**
 * Verifica si el teléfono tiene una sesión abierta (< 24h desde last_inbound_at) en el canal.
 */
export function verificarSesion24hWhatsApp(channelId, telefono, ahoraMs = Date.now()) {
    const state = obtenerEstadoWhatsAppMultitenant();
    const telNorm = normalizarTelefonoWhatsApp(telefono);
    const sesion = state.sessions[`${channelId}::${telNorm}`];
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
        msTranscurridos,
        horasRestantes: Math.max(0, Number(((VENTANA_24H_MS - msTranscurridos) / 3600000).toFixed(2)))
    };
}

/**
 * Registra un mensaje entrante o saliente en whatsapp_messages_log (para facturación por empresa).
 */
export function registrarLogMensajeWhatsApp({
    empresa_id = null,
    channel_id = DEFAULT_SHARED_WHATSAPP_CHANNEL.id,
    telefono = '',
    direccion = 'out',
    tipo = 'text',
    wamid = null,
    contenido_resumen = '',
    created_at = new Date().toISOString()
} = {}) {
    const state = obtenerEstadoWhatsAppMultitenant();
    const item = {
        id: `WML-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        empresa_id: empresa_id || null,
        channel_id: channel_id || DEFAULT_SHARED_WHATSAPP_CHANNEL.id,
        telefono: normalizarTelefonoWhatsApp(telefono),
        direccion: direccion === 'in' ? 'in' : 'out',
        tipo: tipo === 'template' ? 'template' : 'text',
        wamid: wamid || `wamid.local.${Date.now()}`,
        contenido_resumen: String(contenido_resumen || '').slice(0, 280),
        created_at
    };
    state.messages_log.unshift(item);
    if (state.messages_log.length > 1000) state.messages_log.length = 1000;
    guardarEstadoWhatsAppMultitenant(state);
    return item;
}

/**
 * Procesa y guarda estados de entrega de Meta (value.statuses[]) en whatsapp_message_status,
 * resolviendo empresa_id por wamid desde whatsapp_messages_log.
 */
export function registrarEstadoMensajeWhatsApp(statusObj = {}, channelId = null, empresaIdFallback = null) {
    const state = obtenerEstadoWhatsAppMultitenant();
    const wamid = String(statusObj.id || statusObj.wamid || '').trim();
    const recipientId = normalizarTelefonoWhatsApp(statusObj.recipient_id || '');
    const logAsociado = wamid
        ? state.messages_log.find((m) => m.wamid === wamid)
        : null;
    const contactoAsociado = !logAsociado && recipientId
        ? state.contacts.find((c) => c.activo !== false && normalizarTelefonoWhatsApp(c.telefono) === recipientId)
        : null;

    const empresaResuelta = logAsociado?.empresa_id || contactoAsociado?.empresa_id || empresaIdFallback || null;
    const canalResuelto = logAsociado?.channel_id || channelId || DEFAULT_SHARED_WHATSAPP_CHANNEL.id;

    const err0 = Array.isArray(statusObj.errors) && statusObj.errors.length > 0 ? statusObj.errors[0] : null;
    const errorCode = statusObj.error_code || (err0?.code !== undefined ? String(err0.code) : null);
    const errorTitle = statusObj.error_title || err0?.title || err0?.message || null;
    const errorDetails = statusObj.error_details || err0?.error_data?.details || err0?.details || null;

    const tsIso = statusObj.timestamp
        ? (Number.isFinite(Number(statusObj.timestamp)) && Number(statusObj.timestamp) < 1e11
            ? new Date(Number(statusObj.timestamp) * 1000).toISOString()
            : new Date(statusObj.timestamp).toISOString())
        : new Date().toISOString();

    const item = {
        id: `WMS-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        empresa_id: empresaResuelta,
        channel_id: canalResuelto,
        wamid: wamid || `wamid.status.${Date.now()}`,
        recipient_id: recipientId,
        status: String(statusObj.status || 'unknown').toLowerCase(),
        error_code: errorCode ? String(errorCode) : null,
        error_title: errorTitle ? String(errorTitle) : null,
        error_details: errorDetails ? String(errorDetails) : null,
        timestamp: tsIso,
        created_at: new Date().toISOString()
    };

    state.message_status.unshift(item);
    if (state.message_status.length > 500) state.message_status.length = 500;
    guardarEstadoWhatsAppMultitenant(state);
    return item;
}

export function listarLogsMensajesWhatsApp({ empresaId = null, esSuperAdmin = false, limite = 100 } = {}) {
    const state = obtenerEstadoWhatsAppMultitenant();
    return state.messages_log
        .filter((m) => (esSuperAdmin && !empresaId ? true : String(m.empresa_id) === String(empresaId)))
        .slice(0, limite);
}

export function listarEstadosMensajesWhatsApp({ empresaId = null, esSuperAdmin = false, limite = 50 } = {}) {
    const state = obtenerEstadoWhatsAppMultitenant();
    return state.message_status
        .filter((s) => (esSuperAdmin && !empresaId ? true : String(s.empresa_id) === String(empresaId)))
        .slice(0, limite);
}

/**
 * Genera el reporte de consumo mensual por empresa (mensajes de texto in/out y plantillas)
 * para facturación del dueño del sistema (Super Admin).
 */
export function obtenerReporteConsumoWhatsApp({ empresaId = null, esSuperAdmin = true, empresasCatalogo = [] } = {}) {
    const state = obtenerEstadoWhatsAppMultitenant();
    const mapaEmpresas = new Map();
    for (const emp of empresasCatalogo) {
        if (emp?.id) mapaEmpresas.set(String(emp.id), emp.nombre || emp.razonSocial || emp.id);
    }

    const agrupado = new Map();
    for (const log of state.messages_log) {
        if (log.contenido_resumen === '[NO_AUTORIZADO_NOTIFICADO]') continue;
        const empId = log.empresa_id || 'SIN_EMPRESA';
        if (!esSuperAdmin && empresaId && String(empId) !== String(empresaId)) continue;
        if (empresaId && String(empId) !== String(empresaId)) continue;

        const mes = String(log.created_at || new Date().toISOString()).slice(0, 7); // YYYY-MM
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
// 3. SINCRONIZACIÓN CON SUPABASE (TABLAS SQL + ESPEJO OPERACIONES_DIARIAS)
// ============================================================================

export async function sincronizarEstadoWhatsAppConSupabase(state = obtenerEstadoWhatsAppMultitenant(), env = {}, fetchImpl = globalThis.fetch) {
    if (typeof fetchImpl !== 'function') return { ok: false };
    const supabaseUrl = String(env.SUPABASE_URL || SUPABASE_FALLBACK_URL).replace(/\/+$/, '');
    const supabaseKey = String(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || SUPABASE_FALLBACK_KEY).trim();
    const headers = {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
    };

    try {
        // 1. Guardar espejo consolidado en operaciones_diarias para disponibilidad inmediata
        const payloadMirror = {
            id: SUPABASE_STATE_ROW_ID,
            empresa_id: 'EMP-01',
            fecha: new Date().toISOString().slice(0, 10),
            categoria: 'sistema',
            subtipo: 'whatsapp_multitenant_v25',
            detalles: {
                channels: state.channels.map(sanitizarCanalParaFrontend),
                contacts: state.contacts,
                messages_log: state.messages_log.slice(0, 300),
                message_status: state.message_status.slice(0, 150),
                sessions: state.sessions,
                updated_at: new Date().toISOString()
            },
            usuario_registro: 'sistema_whatsapp_v25'
        };
        await fetchImpl(`${supabaseUrl}/rest/v1/operaciones_diarias?on_conflict=id`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payloadMirror)
        });
        return { ok: true };
    } catch {
        return { ok: false };
    }
}

export async function cargarEstadoWhatsAppDesdeSupabase(env = {}, fetchImpl = globalThis.fetch) {
    if (typeof fetchImpl !== 'function') return obtenerEstadoWhatsAppMultitenant();
    const supabaseUrl = String(env.SUPABASE_URL || SUPABASE_FALLBACK_URL).replace(/\/+$/, '');
    const supabaseKey = String(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || SUPABASE_FALLBACK_KEY).trim();
    const headers = {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
    };

    const state = obtenerEstadoWhatsAppMultitenant();
    try {
        // Intentar leer espejo consolidado primero
        const resMirror = await fetchImpl(
            `${supabaseUrl}/rest/v1/operaciones_diarias?id=eq.${SUPABASE_STATE_ROW_ID}&select=detalles&limit=1`,
            { method: 'GET', headers }
        );
        if (resMirror.ok) {
            const rows = await resMirror.json();
            const remoto = rows?.[0]?.detalles;
            if (remoto && typeof remoto === 'object') {
                if (Array.isArray(remoto.channels) && remoto.channels.length > 0) state.channels = remoto.channels;
                if (Array.isArray(remoto.contacts) && state.contacts.length === 0) state.contacts = remoto.contacts;
                if (Array.isArray(remoto.messages_log) && state.messages_log.length === 0) state.messages_log = remoto.messages_log;
                if (Array.isArray(remoto.message_status) && state.message_status.length === 0) state.message_status = remoto.message_status;
                if (remoto.sessions && typeof remoto.sessions === 'object') {
                    state.sessions = { ...remoto.sessions, ...state.sessions };
                }
            }
        }

        // Intentar leer tablas nativas whatsapp_channels y whatsapp_contacts si existen en PostgREST
        const resCh = await fetchImpl(
            `${supabaseUrl}/rest/v1/whatsapp_channels?select=id,phone_number_id,waba_id,display_phone_number,nombre,tipo,empresa_id,template_name,template_lang,activo,created_at`,
            { method: 'GET', headers }
        );
        if (resCh.ok) {
            const dbChannels = await resCh.json();
            if (Array.isArray(dbChannels) && dbChannels.length > 0) {
                state.channels = dbChannels;
            }
        }

        const resContacts = await fetchImpl(
            `${supabaseUrl}/rest/v1/whatsapp_contacts?select=*`,
            { method: 'GET', headers }
        );
        if (resContacts.ok) {
            const dbContacts = await resContacts.json();
            if (Array.isArray(dbContacts) && dbContacts.length > 0) {
                state.contacts = dbContacts;
            }
        }
    } catch { /* fallback to local state */ }

    return guardarEstadoWhatsAppMultitenant(state, { omitirSyncNube: true });
}

// ============================================================================
// 4. VERIFICACIÓN DEL WEBHOOK GET Y WHITELIST
// ============================================================================

export function verificarNumeroEnWhitelist(telefonoRemitente, env = {}, { phoneNumberId = null } = {}) {
    const remitenteNorm = normalizarTelefonoWhatsApp(telefonoRemitente);
    if (!remitenteNorm) return false;

    // 1. Verificar en la tabla multitenant whatsapp_contacts
    const state = obtenerEstadoWhatsAppMultitenant();
    const canal = phoneNumberId
        ? state.channels.find((c) => String(c.phone_number_id) === String(phoneNumberId) && c.activo !== false)
        : null;

    if (canal && canal.tipo === 'dedicado') {
        const matchDedicado = state.contacts.find(
            (c) =>
                c.activo !== false &&
                normalizarTelefonoWhatsApp(c.telefono) === remitenteNorm &&
                String(c.empresa_id) === String(canal.empresa_id)
        );
        if (matchDedicado) return true;
    } else {
        const matchActivo = state.contacts.find(
            (c) => c.activo !== false && normalizarTelefonoWhatsApp(c.telefono) === remitenteNorm
        );
        if (matchActivo) return true;
    }

    // 2. Fallback para variables de entorno legadas en tests unitarios
    const listaCruda = env.WHATSAPP_AUTHORIZED_NUMBERS || '';
    const listaAutorizados = String(listaCruda)
        .split(',')
        .map((n) => normalizarTelefonoWhatsApp(n))
        .filter(Boolean);

    return listaAutorizados.includes(remitenteNorm);
}

/**
 * Valida la petición GET de verificación de Webhook de Meta (Handshake).
 * Verifica hub.verify_token === WHATSAPP_VERIFY_TOKEN.
 */
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

// ============================================================================
// 5. PARSER DE COMANDOS (INFO <ID> | PESO <ID> <KG> | FINCA <NOMBRE>)
// ============================================================================

/**
 * Parsea el texto recibido desde WhatsApp y extrae la intención y parámetros.
 * Comandos soportados:
 *   - "INFO <ID>"  (Ej: "INFO 045", "info BV-401")
 *   - "PESO <ID> <KG>" (Ej: "PESO 045 350", "peso 102 412.5")
 *   - "FINCA <NOMBRE>" (Ej: "FINCA Vesubio", "finca Gallinazo")
 */
export function parsearComandoTextoWhatsApp(textoMensaje = '') {
    const limpio = String(textoMensaje || '').trim().replace(/\s+/g, ' ');
    if (!limpio) {
        return { comando: 'VACIO', valido: false };
    }

    const matchInfo = limpio.match(/^INFO\s+([A-Za-z0-9\-_]+)$/i);
    if (matchInfo) {
        return {
            comando: 'INFO',
            valido: true,
            idAnimal: matchInfo[1].toUpperCase()
        };
    }

    const matchPeso = limpio.match(/^PESO\s+([A-Za-z0-9\-_]+)\s+(\d+(?:[.,]\d+)?)\s*(?:kg)?$/i);
    if (matchPeso) {
        const pesoKg = parseFloat(matchPeso[2].replace(',', '.'));
        if (Number.isFinite(pesoKg) && pesoKg > 0 && pesoKg < 2500) {
            return {
                comando: 'PESO',
                valido: true,
                idAnimal: matchPeso[1].toUpperCase(),
                pesoKg: Number(pesoKg.toFixed(1))
            };
        }
    }

    const matchFinca = limpio.match(/^FINCA\s+(.+)$/i);
    if (matchFinca) {
        return {
            comando: 'FINCA',
            valido: true,
            nombreFinca: matchFinca[1].trim()
        };
    }

    return {
        comando: 'DESCONOCIDO',
        valido: false,
        textoOriginal: limpio
    };
}

// ============================================================================
// 6. PROCESADOR DE COMANDOS CON AISLAMIENTO ESTRICTO POR EMPRESA_ID Y FINCA_ID
// ============================================================================

/**
 * Ejecuta la lógica de negocio asociada al comando parseado usando el adaptador de BD.
 * NUNCA altera el formato ni cálculos internos de INFO y PESO; únicamente filtra
 * estrictamente por empresa_id (y finca_id del contacto si está definida) y agrega FINCA <nombre>.
 */
export async function procesarComandoWhatsApp(textoMensaje, dbAdapter, contexto = {}) {
    const parsed = parsearComandoTextoWhatsApp(textoMensaje);
    const fechaHoy = contexto.fechaHoy || new Date().toISOString().split('T')[0];
    const empresaId = contexto.empresaId || contexto.empresa_id || null;
    const fincaId = contexto.fincaId || contexto.finca_id || null;

    if (!parsed.valido) {
        return {
            exito: false,
            comando: parsed.comando,
            mensajeRespuesta:
                `🤖 *Ganadero AD - Asistente de Campo*\n\n` +
                `No reconocí ese comando. Usa uno de los siguientes formatos:\n` +
                `• *INFO <ID>* → Consultar estado reproductivo y último peso (Ej: _INFO 045_)\n` +
                `• *PESO <ID> <KG>* → Registrar nuevo pesaje en manga (Ej: _PESO 045 350_)\n` +
                `• *FINCA <nombre>* → Cambiar tu finca activa de trabajo (Ej: _FINCA Vesubio_)`
        };
    }

    if (parsed.comando === 'FINCA') {
        if (typeof dbAdapter?.cambiarFincaActiva === 'function') {
            const resFinca = await dbAdapter.cambiarFincaActiva({
                nombreFinca: parsed.nombreFinca,
                empresaId,
                remitente: contexto.remitente || ''
            });
            if (resFinca && resFinca.exito) {
                return {
                    exito: true,
                    comando: 'FINCA',
                    finca: resFinca.finca,
                    mensajeRespuesta:
                        `🏡 *Finca Activa Actualizada*\n` +
                        `• *Finca:* ${resFinca.finca.nombre}\n` +
                        `• *Empresa:* ${resFinca.empresaNombre || empresaId}\n\n` +
                        `A partir de ahora tus consultas *INFO* y registros *PESO* se ejecutarán sobre *${resFinca.finca.nombre}*.`
                };
            }
            const listaDisponibles = Array.isArray(resFinca?.fincasDisponibles) && resFinca.fincasDisponibles.length > 0
                ? `\n\n*Fincas disponibles en tu empresa:*\n` + resFinca.fincasDisponibles.map((f) => `• ${f.nombre}`).join('\n')
                : '';
            return {
                exito: false,
                comando: 'FINCA',
                mensajeRespuesta: `⚠️ No se encontró la finca *${parsed.nombreFinca}* dentro de tu empresa.${listaDisponibles}`
            };
        }
        return {
            exito: false,
            comando: 'FINCA',
            mensajeRespuesta: `⚠️ El cambio de finca no está disponible en este adaptador.`
        };
    }

    if (parsed.comando === 'INFO') {
        const fnConsulta = dbAdapter?.consultarAnimalPorId || dbAdapter?.consultarAnimalPorTag;
        if (typeof fnConsulta !== 'function') {
            throw new Error('El adaptador de base de datos no implementa consultarAnimalPorId.');
        }

        const animal = await fnConsulta(parsed.idAnimal, { empresaId, fincaId });
        if (!animal) {
            return {
                exito: false,
                comando: 'INFO',
                idAnimal: parsed.idAnimal,
                mensajeRespuesta: `⚠️ No se encontró ningún ejemplar activo con el número *${parsed.idAnimal}* en el inventario de tu empresa.`
            };
        }

        const tag = animal.identificacion_tag || animal.numero || animal.id || parsed.idAnimal;
        const nombre = animal.nombre ? ` (${animal.nombre})` : '';
        const especie = (animal.especie || 'bovino').toLowerCase() === 'bufalino' ? '🐃 Búfalo(a)' : '🐄 Vacuno';
        const estadoReprod = animal.estado_reproductivo || animal.estadoReproductivo || animal.estado || 'Abierta / Vacía';
        const diasPrenez = Number(animal.dias_gestacion ?? animal.diasPrenez ?? animal.diasGestacion ?? 0);
        const detallePrenez = diasPrenez > 0 ? ` (${diasPrenez} días de gestación)` : '';
        const pesoActual = Number(animal.ultimo_peso_kg ?? animal.pesoActualKg ?? animal.ultimoPesoKg ?? animal.peso ?? 0);
        const fechaPeso = animal.fecha_ultimo_pesaje || animal.fechaUltimoPesaje || 'Sin registro reciente';
        const lote = animal.lote || 'General';

        return {
            exito: true,
            comando: 'INFO',
            idAnimal: tag,
            animal,
            mensajeRespuesta:
                `📋 *Ficha de Campo — Ejemplar #${tag}*${nombre}\n` +
                `• *Especie:* ${especie}\n` +
                `• *Estado Reproductivo:* ${estadoReprod}${detallePrenez}\n` +
                `• *Último Peso:* ${pesoActual > 0 ? `${pesoActual} kg` : 'Sin pesaje'} (${fechaPeso})\n` +
                `• *Lote Actual:* ${lote}`
        };
    }

    if (parsed.comando === 'PESO') {
        const fnRegistrar = dbAdapter?.registrarPesoAnimal;
        if (typeof fnRegistrar !== 'function') {
            throw new Error('El adaptador de base de datos no implementa registrarPesoAnimal.');
        }

        const resultado = await fnRegistrar({
            idAnimal: parsed.idAnimal,
            tag: parsed.idAnimal,
            pesoKg: parsed.pesoKg,
            fecha: fechaHoy,
            remitente: contexto.remitente || 'whatsapp',
            empresaId,
            fincaId
        });

        if (!resultado || resultado.exito === false) {
            return {
                exito: false,
                comando: 'PESO',
                idAnimal: parsed.idAnimal,
                mensajeRespuesta:
                    resultado?.mensajeError ||
                    `⚠️ No se pudo registrar el peso: el ejemplar *#${parsed.idAnimal}* no existe en el inventario activo de tu empresa.`
            };
        }

        const animal = resultado.animal || {};
        const tag = animal.identificacion_tag || animal.numero || parsed.idAnimal;
        const pesoPrevio = Number(resultado.pesoAnterior ?? 0);
        const diffTexto =
            pesoPrevio > 0
                ? ` (${parsed.pesoKg - pesoPrevio >= 0 ? '+' : ''}${Number((parsed.pesoKg - pesoPrevio).toFixed(1))} kg vs. anterior de ${pesoPrevio} kg)`
                : '';

        return {
            exito: true,
            comando: 'PESO',
            idAnimal: tag,
            pesoKg: parsed.pesoKg,
            resultado,
            mensajeRespuesta:
                `✅ *Pesaje Registrado con Éxito*\n` +
                `• *Ejemplar:* #${tag}${animal.nombre ? ` (${animal.nombre})` : ''}\n` +
                `• *Nuevo Peso:* *${parsed.pesoKg} kg*${diffTexto}\n` +
                `• *Fecha:* ${fechaHoy}\n` +
                `☁️ _Sincronizado en tiempo real con Ganadero AD._`
        };
    }

    return {
        exito: false,
        comando: 'DESCONOCIDO',
        mensajeRespuesta: '⚠️ Comando no soportado.'
    };
}

// ============================================================================
// 7. ENVÍO SALIENTE A META GRAPH API v25.0 Y CONTROL DE VENTANA DE 24H
// ============================================================================

/**
 * Envía un mensaje de texto o plantilla a través de Meta Graph API v25.0:
 * POST https://graph.facebook.com/v25.0/{PHONE_NUMBER_ID}/messages
 */
export async function enviarMensajeWhatsApp(telefonoDestino, textoMensaje, env = {}, fetchImpl = globalThis.fetch, opciones = {}) {
    const phoneNumberId = opciones.phoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID || DEFAULT_SHARED_WHATSAPP_CHANNEL.phone_number_id;
    const accessToken = opciones.accessToken || env.WHATSAPP_SYSTEM_TOKEN || env.WHATSAPP_ACCESS_TOKEN;
    const destinatario = normalizarTelefonoWhatsApp(telefonoDestino);

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
                  language: { code: opciones.templateLang || 'es_CO' }
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

/**
 * Función oficial multitenant de envío saliente:
 * enviarWhatsApp(empresa_id, telefono, mensaje | plantilla, opciones)
 * - Elige el canal dedicado de la empresa si existe y está activo; si no, el compartido.
 * - Valida que el destino NUNCA sea el propio número del canal.
 * - Verifica whatsapp_sessions.last_inbound_at: si pasaron > 24h, NO envía texto libre
 *   (envía plantilla si se solicita o retorna error "Fuera de la ventana de 24h: usa una plantilla aprobada").
 * - Registra en whatsapp_messages_log.
 */
export async function enviarWhatsApp(empresaId, telefonoDestino, mensajeOPlantilla, opciones = {}) {
    if (!empresaId || !String(empresaId).trim()) {
        return {
            ok: false,
            codigo: 'EMPRESA_ID_REQUERIDO',
            error: 'Se requiere empresa_id para enviar mensajes en modo multitenant.'
        };
    }

    const destinatario = normalizarTelefonoWhatsApp(telefonoDestino);
    if (!destinatario || destinatario.length < 8) {
        return {
            ok: false,
            codigo: 'TELEFONO_INVALIDO',
            error: 'El teléfono destino no es válido.'
        };
    }

    const canal = obtenerCanalActivoEmpresa(empresaId, { incluirTokenInterno: true });
    const numeroPropioCanal = normalizarTelefonoWhatsApp(canal.display_phone_number);

    // Validar que el destino NUNCA sea el propio número del canal
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
        (typeof mensajeOPlantilla === 'object' && mensajeOPlantilla !== null && (mensajeOPlantilla.tipo === 'template' || mensajeOPlantilla.type === 'template' || mensajeOPlantilla.template_name))
    );

    // Verificar ventana de 24 horas en whatsapp_sessions
    const estadoVentana = verificarSesion24hWhatsApp(canal.id, destinatario, opciones.ahoraMs || Date.now());
    if (!esPlantilla && !estadoVentana.abierta) {
        if (opciones.usarPlantillaSiCerrada) {
            return enviarWhatsApp(
                empresaId,
                destinatario,
                {
                    tipo: 'template',
                    template_name: canal.template_name || 'notificacion_ganadero_ad',
                    template_lang: canal.template_lang || 'es_CO'
                },
                { ...opciones, tipo: 'template', esPlantilla: true }
            );
        }
        return {
            ok: false,
            codigo: 'FUERA_VENTANA_24H',
            error: 'Fuera de la ventana de 24h: usa una plantilla aprobada'
        };
    }

    const env = opciones.env || (typeof process !== 'undefined' && process.env ? process.env : {});
    const tokenAUsar = canal.access_token_override || env.WHATSAPP_SYSTEM_TOKEN || env.WHATSAPP_ACCESS_TOKEN;
    const fetchImpl = opciones.fetchImpl || globalThis.fetch;

    const templateName = (typeof mensajeOPlantilla === 'object' && mensajeOPlantilla?.template_name) || canal.template_name || 'notificacion_ganadero_ad';
    const templateLang = (typeof mensajeOPlantilla === 'object' && mensajeOPlantilla?.template_lang) || canal.template_lang || 'es_CO';

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
        const logEntry = registrarLogMensajeWhatsApp({
            empresa_id: empresaId,
            channel_id: canal.id,
            telefono: destinatario,
            direccion: 'out',
            tipo: esPlantilla ? 'template' : 'text',
            wamid,
            contenido_resumen: esPlantilla ? `[PLANTILLA: ${templateName} (${templateLang})]` : payloadEnvio
        });

        return {
            ok: true,
            wamid,
            channel: sanitizarCanalParaFrontend(canal),
            log: logEntry,
            respuestaMeta
        };
    } catch (error) {
        registrarEstadoMensajeWhatsApp(
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
// 8. ADAPTADOR DE BASE DE DATOS CENTRAL SUPABASE (CON FILTRO EMPRESA + FINCA)
// ============================================================================

/**
 * Crea un adaptador conectado a la Base Central de Supabase que garantiza
 * que TODAS las consultas INFO, registros PESO y cambios FINCA filtren
 * estrictamente por empresa_id (y finca_id cuando aplique).
 */
export function crearAdaptadorBaseDatosSupabase(env = {}, fetchImpl = globalThis.fetch) {
    const supabaseUrl = String(env.SUPABASE_URL || SUPABASE_FALLBACK_URL).replace(/\/+$/, '');
    const supabaseKey = String(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || SUPABASE_FALLBACK_KEY).trim();

    const headersBase = {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
    };

    /**
     * Obtiene las fincas que pertenecen a una empresa_id combinando la tabla SQL `fincas`
     * y el directorio multitenant `SYS_DIRECTORIO_EMPRESAS` en `operaciones_diarias`.
     */
    async function obtenerFincasDeEmpresa(empresaId) {
        if (!empresaId) return [];
        const resFincas = await fetchImpl(`${supabaseUrl}/rest/v1/fincas?select=id,empresa_id,codigo,nombre`, {
            method: 'GET',
            headers: headersBase
        });
        const todasFincas = resFincas.ok ? await resFincas.json() : [];

        let mapaDirectorio = {};
        let nombreEmpresa = empresaId;
        try {
            const resDir = await fetchImpl(
                `${supabaseUrl}/rest/v1/operaciones_diarias?id=eq.SYS_DIRECTORIO_EMPRESAS&select=detalles&limit=1`,
                { method: 'GET', headers: headersBase }
            );
            if (resDir.ok) {
                const rowsDir = await resDir.json();
                const det = rowsDir?.[0]?.detalles;
                if (det?.fincasEmpresaMap) mapaDirectorio = det.fincasEmpresaMap;
                const empObj = Array.isArray(det?.empresas) ? det.empresas.find((e) => String(e.id) === String(empresaId)) : null;
                if (empObj?.nombre) nombreEmpresa = empObj.nombre;
            }
        } catch { /* ignore */ }

        const fincasEmpresa = (Array.isArray(todasFincas) ? todasFincas : []).filter((f) => {
            const empDirecta = f.empresa_id ? String(f.empresa_id) : null;
            const empMapeada = mapaDirectorio[f.id] ? String(mapaDirectorio[f.id]) : null;
            return empDirecta === String(empresaId) || empMapeada === String(empresaId);
        });

        return { fincas: fincasEmpresa, nombreEmpresa };
    }

    return {
        async consultarAnimalPorId(idAnimal, { empresaId = null, fincaId = null } = {}) {
            if (!empresaId) {
                throw new Error('SEGURIDAD MULTITENANT: Prohibido consultar animales sin filtro de empresa_id.');
            }
            const tagBuscado = encodeURIComponent(String(idAnimal).trim());
            const { fincas } = await obtenerFincasDeEmpresa(empresaId);
            const idsFincasEmpresa = fincas.map((f) => f.id);
            if (idsFincasEmpresa.length === 0) return null;

            const fincasPermitidas = fincaId && idsFincasEmpresa.includes(fincaId)
                ? [fincaId]
                : idsFincasEmpresa;

            const filtroFincas = fincasPermitidas.map((id) => `"${id}"`).join(',');
            const url = `${supabaseUrl}/rest/v1/animales?identificacion_tag=ilike.${tagBuscado}&estado_hato=eq.activo&finca_id=in.(${encodeURIComponent(filtroFincas)})&select=*&limit=1`;
            const res = await fetchImpl(url, { method: 'GET', headers: headersBase });
            if (!res.ok) return null;
            const filas = await res.json();
            return Array.isArray(filas) && filas.length > 0 ? filas[0] : null;
        },

        async registrarPesoAnimal({ idAnimal, pesoKg, fecha, remitente, empresaId = null, fincaId = null }) {
            if (!empresaId) {
                throw new Error('SEGURIDAD MULTITENANT: Prohibido registrar pesajes sin filtro de empresa_id.');
            }
            const animal = await this.consultarAnimalPorId(idAnimal, { empresaId, fincaId });
            if (!animal) {
                return { exito: false, motivo: 'NO_ENCONTRADO' };
            }

            const pesoAnterior = Number(animal.ultimo_peso_kg ?? 0);
            const idPesaje = `PES-WA-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

            const resInsert = await fetchImpl(`${supabaseUrl}/rest/v1/pesajes`, {
                method: 'POST',
                headers: { ...headersBase, Prefer: 'return=representation' },
                body: JSON.stringify({
                    id: idPesaje,
                    finca_id: animal.finca_id,
                    animal_id: animal.id,
                    fecha_pesaje: fecha,
                    peso_kg: pesoKg,
                    gdp_calculado: 0,
                    observaciones: `Registrado vía WhatsApp Bot v25.0 (${remitente || 'autorizado'})`
                })
            });

            if (!resInsert.ok) {
                return { exito: false, motivo: 'ERROR_INSERT_PESAJE' };
            }

            await fetchImpl(`${supabaseUrl}/rest/v1/animales?id=eq.${encodeURIComponent(animal.id)}`, {
                method: 'PATCH',
                headers: headersBase,
                body: JSON.stringify({
                    ultimo_peso_kg: pesoKg,
                    fecha_ultimo_pesaje: fecha
                })
            });

            return {
                exito: true,
                idPesaje,
                animal: { ...animal, ultimo_peso_kg: pesoKg, fecha_ultimo_pesaje: fecha },
                pesoAnterior,
                pesoNuevo: pesoKg,
                fecha
            };
        },

        async cambiarFincaActiva({ nombreFinca, empresaId, remitente }) {
            if (!empresaId) {
                return { exito: false, motivo: 'SIN_EMPRESA' };
            }
            const { fincas, nombreEmpresa } = await obtenerFincasDeEmpresa(empresaId);
            const buscado = normalizarTextoBusqueda(nombreFinca);

            const encontrada = fincas.find(
                (f) =>
                    normalizarTextoBusqueda(f.nombre) === buscado ||
                    normalizarTextoBusqueda(f.codigo) === buscado ||
                    normalizarTextoBusqueda(f.id) === buscado ||
                    normalizarTextoBusqueda(f.nombre).includes(buscado)
            );

            if (!encontrada) {
                return { exito: false, fincasDisponibles: fincas, empresaNombre: nombreEmpresa };
            }

            // Actualizar finca_id del contacto en el estado multitenant
            const state = obtenerEstadoWhatsAppMultitenant();
            const telNorm = normalizarTelefonoWhatsApp(remitente);
            const contacto = state.contacts.find(
                (c) => c.activo !== false && normalizarTelefonoWhatsApp(c.telefono) === telNorm && String(c.empresa_id) === String(empresaId)
            );
            if (contacto) {
                contacto.finca_id = encontrada.id;
                guardarEstadoWhatsAppMultitenant(state);
            }

            return {
                exito: true,
                finca: encontrada,
                empresaNombre: nombreEmpresa
            };
        }
    };
}

// ============================================================================
// 9. PROCESADOR DEL WEBHOOK POST /api/whatsapp (UNA SOLA URL MULTITENANT)
// ============================================================================

/**
 * Procesa el payload POST recibido en `/api/whatsapp` desde Meta Cloud API v25.0:
 * 1) Valida X-Hub-Signature-256 con WHATSAPP_APP_SECRET (si se provee rawBody/signatureHeader).
 * 2) Procesa value.statuses[] -> guarda en whatsapp_message_status con empresa_id resuelto por wamid.
 * 3) Lee value.metadata.phone_number_id -> busca canal en whatsapp_channels. Si no existe o activo=false -> ignora.
 * 4) Resuelve empresa_id según canal DEDICADO o COMPARTIDO y contacto activo en whatsapp_contacts.
 *    Si el teléfono no está autorizado -> responde UNA SOLA VEZ:
 *    "Este número no está autorizado. Contacta al administrador de tu empresa." y no ejecuta comando.
 * 5) Actualiza whatsapp_sessions.last_inbound_at y registra en whatsapp_messages_log.
 * 6) Ejecuta INFO / PESO / FINCA filtrando SIEMPRE por empresa_id (y finca_id del contacto).
 * 7) Responde por el MISMO canal (phone_number_id) que recibió el mensaje.
 */
export async function procesarWebhookPostWhatsApp(payload = {}, opciones = {}) {
    const env = opciones.env || (typeof process !== 'undefined' && process.env ? process.env : {});
    const fetchImpl = opciones.fetchImpl || globalThis.fetch;

    // 1. Validación criptográfica X-Hub-Signature-256 si viene cabecera o se exige validación
    if (opciones.validarFirma === true || (opciones.signatureHeader !== undefined && env.WHATSAPP_APP_SECRET)) {
        const rawBody = opciones.rawBody !== undefined ? opciones.rawBody : JSON.stringify(payload);
        const verifFirma = validarFirmaWebhookMeta(rawBody, opciones.signatureHeader, env.WHATSAPP_APP_SECRET);
        if (!verifFirma.ok) {
            return {
                status: 401,
                body: { error: verifFirma.error }
            };
        }
    }

    try {
        const state = obtenerEstadoWhatsAppMultitenant();
        const entries = Array.isArray(payload?.entry) ? payload.entry : [];
        const resultadosProcesados = [];
        const estadosProcesados = [];
        let huboMensajeNoAutorizado = false;
        let canalInactivoOInexistente = false;

        for (const entry of entries) {
            const changes = Array.isArray(entry?.changes) ? entry.changes : [];
            for (const change of changes) {
                const value = change?.value || {};
                const phoneNumberIdEvento = value?.metadata?.phone_number_id
                    ? String(value.metadata.phone_number_id).trim()
                    : null;

                // Buscar canal en whatsapp_channels
                let canal = null;
                if (phoneNumberIdEvento) {
                    canal = state.channels.find((c) => String(c.phone_number_id) === phoneNumberIdEvento);
                    // Compatibilidad si se pasa WHATSAPP_PHONE_NUMBER_ID en env de pruebas
                    if (!canal && env.WHATSAPP_PHONE_NUMBER_ID && String(env.WHATSAPP_PHONE_NUMBER_ID) === phoneNumberIdEvento) {
                        canal = {
                            ...DEFAULT_SHARED_WHATSAPP_CHANNEL,
                            phone_number_id: phoneNumberIdEvento
                        };
                    }
                    if (!canal || canal.activo === false) {
                        canalInactivoOInexistente = true;
                        continue;
                    }
                } else {
                    canal = {
                        ...DEFAULT_SHARED_WHATSAPP_CHANNEL,
                        phone_number_id: env.WHATSAPP_PHONE_NUMBER_ID || DEFAULT_SHARED_WHATSAPP_CHANNEL.phone_number_id
                    };
                }

                // 8) Procesar value.statuses[] -> guardar en whatsapp_message_status
                const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
                for (const st of statuses) {
                    const regStatus = registrarEstadoMensajeWhatsApp(st, canal.id, canal.empresa_id || null);
                    estadosProcesados.push(regStatus);
                }

                // Procesar mensajes entrantes
                const messages = Array.isArray(value?.messages) ? value.messages : [];
                for (const msg of messages) {
                    const remitente = normalizarTelefonoWhatsApp(msg?.from || '');
                    if (!remitente) continue;

                    // Ignorar si el remitente es el propio número del canal
                    const numPropioCanal = normalizarTelefonoWhatsApp(canal.display_phone_number);
                    if ((numPropioCanal && remitente === numPropioCanal) || remitente === String(canal.phone_number_id)) {
                        continue;
                    }

                    // 4) Resolver empresa_id y contacto autorizado
                    let contactoAutorizado = null;
                    let empresaResuelta = null;

                    if (canal.tipo === 'dedicado') {
                        empresaResuelta = canal.empresa_id;
                        contactoAutorizado = state.contacts.find(
                            (c) =>
                                c.activo !== false &&
                                normalizarTelefonoWhatsApp(c.telefono) === remitente &&
                                String(c.empresa_id) === String(canal.empresa_id)
                        );
                    } else {
                        contactoAutorizado = state.contacts.find(
                            (c) => c.activo !== false && normalizarTelefonoWhatsApp(c.telefono) === remitente
                        );
                        empresaResuelta = contactoAutorizado?.empresa_id || null;
                    }

                    // Fallback de compatibilidad si en pruebas unitarias se usa WHATSAPP_AUTHORIZED_NUMBERS sin contactos en tabla
                    if (!contactoAutorizado && env.WHATSAPP_AUTHORIZED_NUMBERS) {
                        const enWhitelistEnv = verificarNumeroEnWhitelist(remitente, env);
                        if (enWhitelistEnv) {
                            empresaResuelta = empresaResuelta || opciones.empresaIdDefault || 'EMP-01';
                            contactoAutorizado = {
                                id: 'WAC-ENV-FALLBACK',
                                telefono: remitente,
                                empresa_id: empresaResuelta,
                                finca_id: null,
                                nombre: 'Operador Autorizado',
                                activo: true
                            };
                        }
                    }

                    // Si el teléfono NO está autorizado -> responder UNA SOLA VEZ y no ejecutar comando
                    if (!contactoAutorizado || !empresaResuelta) {
                        huboMensajeNoAutorizado = true;
                        const llaveNoAuth = `${canal.phone_number_id}::${remitente}`;
                        const yaNotificado = Boolean(state.unauthorized_notified[llaveNoAuth]);
                        const tokenCanal = canal.access_token_override || env.WHATSAPP_SYSTEM_TOKEN || env.WHATSAPP_ACCESS_TOKEN;

                        if (!yaNotificado && tokenCanal && typeof fetchImpl === 'function') {
                            state.unauthorized_notified[llaveNoAuth] = new Date().toISOString();
                            guardarEstadoWhatsAppMultitenant(state);
                            const msgNoAuth = 'Este número no está autorizado. Contacta al administrador de tu empresa.';
                            try {
                                await enviarMensajeWhatsApp(remitente, msgNoAuth, env, fetchImpl, {
                                    phoneNumberId: canal.phone_number_id,
                                    accessToken: tokenCanal
                                });
                                registrarLogMensajeWhatsApp({
                                    empresa_id: canal.empresa_id || null,
                                    channel_id: canal.id,
                                    telefono: remitente,
                                    direccion: 'out',
                                    tipo: 'text',
                                    contenido_resumen: '[NO_AUTORIZADO_NOTIFICADO]'
                                });
                            } catch { /* ignore send error on unauthorized notice */ }
                        }
                        continue;
                    }

                    if (msg?.type !== 'text' || !msg?.text?.body) {
                        continue;
                    }

                    const textoRecibido = msg.text.body;

                    // 5) Actualizar whatsapp_sessions.last_inbound_at y registrar en whatsapp_messages_log
                    actualizarSesion24hWhatsApp(canal.id, remitente, empresaResuelta);
                    registrarLogMensajeWhatsApp({
                        empresa_id: empresaResuelta,
                        channel_id: canal.id,
                        telefono: remitente,
                        direccion: 'in',
                        tipo: 'text',
                        wamid: msg.id || `wamid.in.${Date.now()}`,
                        contenido_resumen: textoRecibido
                    });

                    // 6) Ejecutar comando INFO / PESO / FINCA filtrando SIEMPRE por empresa_id y finca_id del contacto
                    const dbAdapter = opciones.dbAdapter || crearAdaptadorBaseDatosSupabase(env, fetchImpl);
                    const resultadoComando = await procesarComandoWhatsApp(textoRecibido, dbAdapter, {
                        remitente,
                        empresaId: empresaResuelta,
                        fincaId: contactoAutorizado.finca_id || null
                    });

                    // 7) Responder por el MISMO canal (phone_number_id) que recibió el mensaje
                    const tokenRespuesta = canal.access_token_override || env.WHATSAPP_SYSTEM_TOKEN || env.WHATSAPP_ACCESS_TOKEN;
                    let respuestaGraph = null;
                    if (resultadoComando?.mensajeRespuesta && tokenRespuesta) {
                        respuestaGraph = await enviarMensajeWhatsApp(
                            remitente,
                            resultadoComando.mensajeRespuesta,
                            env,
                            fetchImpl,
                            {
                                phoneNumberId: canal.phone_number_id,
                                accessToken: tokenRespuesta
                            }
                        );
                        const wamidOut = respuestaGraph?.messages?.[0]?.id || `wamid.reply.${Date.now()}`;
                        registrarLogMensajeWhatsApp({
                            empresa_id: empresaResuelta,
                            channel_id: canal.id,
                            telefono: remitente,
                            direccion: 'out',
                            tipo: 'text',
                            wamid: wamidOut,
                            contenido_resumen: resultadoComando.mensajeRespuesta
                        });
                    }

                    resultadosProcesados.push({
                        remitente,
                        empresa_id: empresaResuelta,
                        finca_id: contactoAutorizado.finca_id || null,
                        channel_id: canal.id,
                        phone_number_id: canal.phone_number_id,
                        comando: resultadoComando.comando,
                        exito: resultadoComando.exito,
                        mensajeRespuesta: resultadoComando.mensajeRespuesta,
                        respuestaGraph
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
        return {
            status: 200,
            body: {
                status: 'EVENT_RECEIVED_WITH_INTERNAL_ERROR',
                error: error?.message || 'Error interno procesando webhook de WhatsApp'
            }
        };
    }
}
