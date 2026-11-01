/**
 * ============================================================================
 * GANADERO AD - SERVICIO DE INTEGRACIÓN BIDIRECCIONAL CON WHATSAPP CLOUD API (META)
 * ============================================================================
 *
 * VARIABLES DE ENTORNO REQUERIDAS (Configurar en .env.local o en el panel de Vercel):
 * ----------------------------------------------------------------------------
 * 1. WHATSAPP_VERIFY_TOKEN      -> Token secreto personalizado para verificar el Webhook (GET) en Meta App Dashboard.
 * 2. WHATSAPP_ACCESS_TOKEN      -> Token de acceso permanente o temporal de Meta WhatsApp Cloud API (Bearer Token).
 * 3. WHATSAPP_PHONE_NUMBER_ID   -> ID del número de teléfono de WhatsApp Business en Meta Developers.
 * 4. WHATSAPP_AUTHORIZED_NUMBERS-> Lista separada por comas de números en whitelist (ej: "573001234567,573109876543").
 * 5. SUPABASE_URL               -> URL del proyecto en Supabase (ej: "https://xxxx.supabase.co").
 * 6. SUPABASE_ANON_KEY          -> Anon Key / Service Role Key de Supabase para consultar e insertar registros.
 * ============================================================================
 */

const WA_DEFAULT_SUPABASE_URL = 'https://jucpxyjzmbthplbvzrsj.supabase.co';
const WA_DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Y3B4eWp6bWJ0aHBsYnZ6cnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3ODExNjMsImV4cCI6MjEwNTM1NzE2M30.EYCHnq6pUNO3cUtD1fRb7l3k-XBbrGtgYmsxkmNzDsA';
const WHATSAPP_STORAGE_KEY = 'bovitrack_whatsapp_cloud_config_v1';

/**
 * Obtiene la configuración de WhatsApp Cloud API almacenada en el programa (localStorage).
 */
export function obtenerConfigWhatsAppLocal() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(WHATSAPP_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          phoneNumberId: String(parsed.phoneNumberId || '').trim(),
          accessToken: String(parsed.accessToken || '').trim(),
          verifyToken: String(parsed.verifyToken || 'ganadero_ad_verify_2026').trim(),
          authorizedNumbers: String(parsed.authorizedNumbers || '573001234567, 573109876543').trim()
        };
      }
    }
  } catch (e) {
    console.warn('[WhatsApp Config] Error leyendo configuración local:', e);
  }
  return {
    phoneNumberId: '',
    accessToken: '',
    verifyToken: 'ganadero_ad_verify_2026',
    authorizedNumbers: '573001234567, 573109876543'
  };
}

/**
 * Guarda la configuración de WhatsApp Cloud API en el programa (localStorage).
 */
export function guardarConfigWhatsAppLocal(cfg = {}) {
  const clean = {
    phoneNumberId: String(cfg.phoneNumberId || '').trim(),
    accessToken: String(cfg.accessToken || '').trim(),
    verifyToken: String(cfg.verifyToken || 'ganadero_ad_verify_2026').trim(),
    authorizedNumbers: String(cfg.authorizedNumbers || '').trim(),
    actualizadoEn: new Date().toISOString()
  };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(WHATSAPP_STORAGE_KEY, JSON.stringify(clean));
    }
  } catch (e) {
    console.warn('[WhatsApp Config] Error guardando configuración local:', e);
  }
  return clean;
}

/**
 * Arreglo base de números de teléfono autorizados (Whitelist).
 * Formato internacional sin el signo '+' (código de país + número, ej. Colombia: 573001234567).
 * Se combina automáticamente con la variable de entorno WHATSAPP_AUTHORIZED_NUMBERS.
 */
export const WHITELIST_NUMEROS_AUTORIZADOS = [
  '573001234567',
  '573109876543',
  '573167910000'
];

/**
 * Normaliza un número telefónico dejando únicamente los dígitos (remueve '+', espacios y guiones).
 * @param {string} numero
 * @returns {string}
 */
export function normalizarNumeroTelefono(numero) {
  return String(numero || '').replace(/[^\d]/g, '').trim();
}

/**
 * Obtiene la lista consolidada de números autorizados (arreglo en código + variable de entorno).
 * @param {string[]} [whitelistPersonalizada]
 * @returns {string[]}
 */
export function obtenerWhitelistAutorizada(whitelistPersonalizada = null) {
  if (Array.isArray(whitelistPersonalizada) && whitelistPersonalizada.length > 0) {
    return whitelistPersonalizada.map(normalizarNumeroTelefono).filter(Boolean);
  }

  if (whitelistPersonalizada && typeof whitelistPersonalizada === 'object' && whitelistPersonalizada.WHATSAPP_AUTHORIZED_NUMBERS) {
    return String(whitelistPersonalizada.WHATSAPP_AUTHORIZED_NUMBERS)
      .split(',')
      .map(normalizarNumeroTelefono)
      .filter(Boolean);
  }

  const envNums = (typeof process !== 'undefined' && process.env && process.env.WHATSAPP_AUTHORIZED_NUMBERS)
    ? String(process.env.WHATSAPP_AUTHORIZED_NUMBERS).split(',').map(normalizarNumeroTelefono).filter(Boolean)
    : [];

  return Array.from(new Set([
    ...WHITELIST_NUMEROS_AUTORIZADOS.map(normalizarNumeroTelefono),
    ...envNums
  ]));
}

/**
 * Verifica si el número del remitente está autorizado en la Whitelist.
 * @param {string} numeroRemitente
 * @param {string[]|object} [whitelistPersonalizada]
 * @returns {boolean}
 */
export function verificarNumeroEnWhitelist(numeroRemitente, whitelistPersonalizada = null) {
  const numNorm = normalizarNumeroTelefono(numeroRemitente);
  if (!numNorm) return false;
  const lista = obtenerWhitelistAutorizada(whitelistPersonalizada);
  return lista.includes(numNorm);
}

/**
 * 2. Verificación GET del Webhook de Meta WhatsApp Cloud API.
 * Recibe hub.mode, hub.verify_token y hub.challenge y los compara con WHATSAPP_VERIFY_TOKEN.
 * @param {object} params - Parámetros de query ({ 'hub.mode', 'hub.verify_token', 'hub.challenge' })
 * @param {string|object} [verifyTokenEnv] - Token esperado o process.env con WHATSAPP_VERIFY_TOKEN
 * @returns {{ status: number, body: string }}
 */
export function verificarWebhookWhatsApp(params = {}, verifyTokenEnv = undefined) {
  try {
    const mode = params['hub.mode'] ?? params.hub_mode ?? params.mode;
    const token = params['hub.verify_token'] ?? params.hub_verify_token ?? params.verify_token;
    const challenge = params['hub.challenge'] ?? params.hub_challenge ?? params.challenge;

    // ========================================================================
    // COLOCA TU VARIABLE DE ENTORNO AQUÍ: process.env.WHATSAPP_VERIFY_TOKEN
    // ========================================================================
    let tokenEsperado = '';
    if (typeof verifyTokenEnv === 'string') {
      tokenEsperado = verifyTokenEnv;
    } else if (verifyTokenEnv && typeof verifyTokenEnv === 'object') {
      tokenEsperado = verifyTokenEnv.WHATSAPP_VERIFY_TOKEN || '';
    } else if (typeof process !== 'undefined' && process.env) {
      tokenEsperado = process.env.WHATSAPP_VERIFY_TOKEN || '';
    }

    if (mode === 'subscribe' && token && tokenEsperado && token === tokenEsperado) {
      return {
        status: 200,
        body: String(challenge ?? '')
      };
    }

    return {
      status: 403,
      body: 'Forbidden: Token de verificación de WhatsApp inválido.'
    };
  } catch (error) {
    console.error('[WhatsApp Webhook GET] Error en verificación:', error);
    return {
      status: 500,
      body: 'Error interno verificando webhook.'
    };
  }
}

/**
 * 6. Envía un mensaje de texto saliente mediante la API oficial de WhatsApp Cloud de Meta.
 * Endpoint oficial: https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages
 *
 * @param {string} numeroDestino - Número del destinatario en formato internacional (ej. "573001234567")
 * @param {string} texto - Contenido del mensaje de texto a enviar
 * @param {object} [opciones] - Opciones adicionales para inyección de configuración o fetch en pruebas
 * @returns {Promise<{ ok: boolean, status: number, data?: any, error?: string }>}
 */
export async function enviarMensajeWhatsApp(numeroDestino, texto, opciones = {}) {
  try {
    // ========================================================================
    // COLOCA TUS VARIABLES DE ENTORNO DE META AQUÍ:
    // - WHATSAPP_PHONE_NUMBER_ID: ID del teléfono en Meta App Dashboard
    // - WHATSAPP_ACCESS_TOKEN: Token Bearer de acceso a Graph API
    // ========================================================================
    const envRef = opciones.env || (typeof process !== 'undefined' && process.env ? process.env : {});
    const PHONE_NUMBER_ID = opciones.phoneNumberId || envRef.WHATSAPP_PHONE_NUMBER_ID || '';
    const ACCESS_TOKEN = opciones.accessToken || envRef.WHATSAPP_ACCESS_TOKEN || '';
    const fetchFn = opciones.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);

    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
      throw new Error('Faltan las variables de entorno WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_ACCESS_TOKEN.');
    }
    if (!fetchFn) {
      throw new Error('La función fetch no está disponible en este entorno.');
    }

    const url = `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`;
    const destinatario = normalizarNumeroTelefono(numeroDestino);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: destinatario,
      type: 'text',
      text: {
        preview_url: false,
        body: String(texto || '')
      }
    };

    const response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('[WhatsApp Cloud API] Error enviando mensaje:', data);
      return {
        ok: false,
        status: response.status,
        data,
        error: data?.error?.message || `Error HTTP ${response.status} al enviar mensaje por WhatsApp.`
      };
    }

    return {
      ok: true,
      status: response.status,
      data
    };
  } catch (error) {
    console.error('[WhatsApp Cloud API] Excepción en enviarMensajeWhatsApp:', error);
    return {
      ok: false,
      status: 500,
      error: error.message || 'Error desconocido al enviar mensaje de WhatsApp.'
    };
  }
}

/**
 * Crea un adaptador por defecto conectado a Supabase PostgREST para consultar y registrar datos de animales.
 * @param {object} [config]
 */
export function crearAdaptadorBaseDatosSupabase(config = {}) {
  // ==========================================================================
  // COLOCA TUS VARIABLES DE ENTORNO DE BASE DE DATOS (SUPABASE) AQUÍ:
  // - SUPABASE_URL: URL REST de tu proyecto Supabase
  // - SUPABASE_ANON_KEY: Clave de API (anon o service_role) de Supabase
  // ==========================================================================
  const supabaseUrl = (
    config.supabaseUrl ||
    (typeof process !== 'undefined' && process.env && (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)) ||
    WA_DEFAULT_SUPABASE_URL
  ).replace(/\/+$/, '');

  const supabaseKey = (
    config.supabaseKey ||
    (typeof process !== 'undefined' && process.env && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) ||
    WA_DEFAULT_SUPABASE_KEY
  ).trim();

  const fetchFn = config.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);

  const headersBase = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  };

  return {
    /**
     * Consulta un ejemplar por su número/ID (identificacion_tag o id).
     * @param {string} idAnimal
     */
    async consultarAnimalPorId(idAnimal) {
      const tagLimpio = String(idAnimal || '').trim().toUpperCase();
      if (!tagLimpio) return null;

      const query = `identificacion_tag=ilike.${encodeURIComponent(tagLimpio)}&limit=1`;
      const url = `${supabaseUrl}/rest/v1/animales?${query}`;
      const res = await fetchFn(url, { method: 'GET', headers: headersBase });
      if (!res.ok) {
        throw new Error(`Error consultando animal en BD (${res.status})`);
      }
      const filas = await res.json();
      if (Array.isArray(filas) && filas.length > 0) {
        return filas[0];
      }
      return null;
    },

    /**
     * Inserta un nuevo pesaje y actualiza el último peso del animal en la base de datos.
     * @param {{ idAnimal: string, pesoKg: number, fecha?: string, remitente?: string }} datos
     */
    async registrarPesoAnimal({ idAnimal, pesoKg, fecha, remitente }) {
      const tagLimpio = String(idAnimal || '').trim().toUpperCase();
      const fechaHoy = fecha || new Date().toISOString().split('T')[0];
      const animal = await this.consultarAnimalPorId(tagLimpio);

      const fincaId = animal ? animal.finca_id : 'FIN-WHATSAPP';
      const animalId = animal ? animal.id : `ANM-WA-${tagLimpio}`;
      const safeTag = tagLimpio.replace(/[^A-Za-z0-9_-]/g, '_');
      const idPesaje = `PES-${fincaId}-${safeTag}-${fechaHoy}`;

      // 1. Insertar/actualizar registro en la tabla de pesajes (pesajes_animales)
      const registroPesaje = [{
        id: idPesaje,
        finca_id: fincaId,
        animal_id: animalId,
        animal_tag: tagLimpio,
        fecha: fechaHoy,
        peso_kg: Number(pesoKg),
        gdp_calculado: null,
        responsable: remitente ? `WhatsApp (${remitente})` : 'WhatsApp Bot',
        observaciones: `Pesaje registrado vía WhatsApp Cloud API (${pesoKg} kg)`
      }];

      const urlPesajes = `${supabaseUrl}/rest/v1/pesajes_animales?on_conflict=id`;
      const resPesaje = await fetchFn(urlPesajes, {
        method: 'POST',
        headers: { ...headersBase, 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(registroPesaje)
      });

      if (!resPesaje.ok) {
        throw new Error(`Error insertando pesaje en BD (${resPesaje.status})`);
      }

      // 2. Si el animal existe en la tabla animales, actualizar su ultimo_peso_kg y fecha_ultimo_pesaje
      if (animal && animal.id) {
        const urlUpdateAnimal = `${supabaseUrl}/rest/v1/animales?id=eq.${encodeURIComponent(animal.id)}`;
        await fetchFn(urlUpdateAnimal, {
          method: 'PATCH',
          headers: headersBase,
          body: JSON.stringify({
            ultimo_peso_kg: Number(pesoKg),
            fecha_ultimo_pesaje: fechaHoy
          })
        });
      }

      return {
        ok: true,
        idPesaje,
        animalId,
        tag: tagLimpio,
        pesoKg: Number(pesoKg),
        fecha: fechaHoy,
        animalEncontrado: Boolean(animal)
      };
    }
  };
}

/**
 * 5. Procesa los comandos entrantes de texto ("INFO <ID>" y "PESO <ID> <PESO>")
 * interactuando con la base de datos y preparando la respuesta de texto.
 *
 * @param {string} textoMensaje - Texto enviado por el usuario en WhatsApp
 * @param {object} [dbAdapter] - Adaptador de base de datos con consultarAnimalPorId y registrarPesoAnimal
 * @param {string} [remitente] - Número de teléfono del remitente
 * @returns {Promise<{ comando: string, idAnimal?: string, peso?: number, respuestaTexto: string, exito: boolean }>}
 */
export async function procesarComandoWhatsApp(textoMensaje, dbAdapter = null, remitente = '') {
  try {
    const textoLimpio = String(textoMensaje || '').trim();
    if (!textoLimpio) {
      return {
        comando: 'VACIO',
        exito: false,
        respuestaTexto: '⚠️ Mensaje vacío. Comandos disponibles:\n• *INFO <ID>* (ej. INFO 045)\n• *PESO <ID> <KG>* (ej. PESO 045 350)'
      };
    }

    const db = dbAdapter || crearAdaptadorBaseDatosSupabase();
    const partes = textoLimpio.split(/\s+/);
    const prefijo = (partes[0] || '').toUpperCase();

    // ========================================================================
    // COMANDO 1: CONSULTA -> "INFO <ID>" (ej. "INFO 045")
    // ========================================================================
    if (prefijo === 'INFO') {
      const idAnimal = (partes[1] || '').trim().toUpperCase();
      if (!idAnimal) {
        return {
          comando: 'INFO',
          exito: false,
          respuestaTexto: '⚠️ Debes indicar el ID del animal. Ejemplo: *INFO 045*'
        };
      }

      const consultarFn = typeof db.consultarAnimalPorId === 'function'
        ? db.consultarAnimalPorId.bind(db)
        : db.consultarAnimalPorTag.bind(db);
      const animal = await consultarFn(idAnimal);
      if (!animal) {
        return {
          comando: 'INFO',
          idAnimal,
          exito: false,
          respuestaTexto: `🔍 No se encontró ningún ejemplar registrado con el ID *${idAnimal}* en la base de datos.`
        };
      }

      const tag = animal.identificacion_tag || animal.identificacionTag || idAnimal;
      const nombre = animal.nombre_alias || animal.nombreAlias || animal.nombre || 'Sin alias';
      const estadoReprod = animal.estado_reproductivo || animal.estadoReproductivo || 'Vacía';
      const diasGest = animal.dias_gestacion_actual ?? animal.diasGestacionActual ?? animal.dias_gestacion ?? animal.diasGestacion ?? 0;
      const peso = animal.ultimo_peso_kg ?? animal.ultimoPesoKg ?? 'S/R';
      const lote = animal.lote || 'General';
      const especie = (animal.especie || 'bovino').toLowerCase() === 'bufalino' ? 'Bufalino 🦬' : 'Vacuno 🐂';
      const detalleGestacion = estadoReprod.toLowerCase().includes('preñada') && diasGest > 0
        ? ` (${diasGest} días de gestación)`
        : '';

      const respuestaTexto =
        `📋 *FICHA DEL ANIMAL ${tag}*\n` +
        `• Nombre: ${nombre}\n` +
        `• Especie: ${especie}\n` +
        `• Estado Reproductivo: *${estadoReprod}*${detalleGestacion}\n` +
        `• Último Peso: *${peso} kg*\n` +
        `• Lote Actual: ${lote}`;

      return {
        comando: 'INFO',
        idAnimal: tag,
        exito: true,
        respuestaTexto
      };
    }

    // ========================================================================
    // COMANDO 2: REGISTRO -> "PESO <ID> <PESO>" (ej. "PESO 045 350")
    // ========================================================================
    if (prefijo === 'PESO') {
      const idAnimal = (partes[1] || '').trim().toUpperCase();
      const pesoStr = (partes[2] || '').replace(',', '.').trim();
      const pesoNumero = parseFloat(pesoStr);

      if (!idAnimal || isNaN(pesoNumero) || pesoNumero <= 0) {
        return {
          comando: 'PESO',
          exito: false,
          respuestaTexto: '⚠️ Formato inválido. Usa: *PESO <ID> <KG>* (Ejemplo: *PESO 045 350*).'
        };
      }

      const fechaHoy = new Date().toISOString().split('T')[0];
      const resultado = db.registrarPesoAnimal.length >= 2
        ? await db.registrarPesoAnimal(idAnimal, pesoNumero, fechaHoy, remitente)
        : await db.registrarPesoAnimal({
            idAnimal,
            pesoKg: pesoNumero,
            fecha: fechaHoy,
            remitente
          });

      const respuestaTexto =
        `✅ *PESAJE REGISTRADO EXITOSAMENTE*\n` +
        `• Animal ID: *${resultado.tag || idAnimal}*\n` +
        `• Nuevo Peso: *${pesoNumero} kg*\n` +
        `• Fecha: ${resultado.fecha || new Date().toISOString().split('T')[0]}`;

      return {
        comando: 'PESO',
        idAnimal,
        peso: pesoNumero,
        exito: true,
        respuestaTexto
      };
    }

    // Comando no reconocido
    return {
      comando: 'DESCONOCIDO',
      exito: false,
      respuestaTexto:
        `🤖 Hola, soy el asistente de *Ganadero AD*.\n` +
        `Comandos disponibles:\n` +
        `1️⃣ *INFO <ID>* → Consultar estado (ej. *INFO 045*)\n` +
        `2️⃣ *PESO <ID> <KG>* → Registrar peso (ej. *PESO 045 350*)`
    };
  } catch (error) {
    console.error('[WhatsApp Bot] Error procesando comando:', error);
    return {
      comando: 'ERROR',
      exito: false,
      respuestaTexto: `❌ Ocurrió un error al procesar tu solicitud en la base de datos: ${error.message}`
    };
  }
}

/**
 * Extrae el mensaje entrante del payload oficial de Meta WhatsApp Cloud API.
 * @param {object} payload
 * @returns {{ from: string, text: string, messageId: string } | null}
 */
export function extraerMensajeEntranteMeta(payload) {
  try {
    const entry = payload?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) return null;

    const from = normalizarNumeroTelefono(message.from || '');
    const text = message?.text?.body ? String(message.text.body).trim() : '';
    const messageId = message.id || '';

    return { from, text, messageId };
  } catch (error) {
    console.error('[WhatsApp Webhook] Error extrayendo mensaje del payload:', error);
    return null;
  }
}

/**
 * 3 y 4. Procesa el método POST completo del Webhook de WhatsApp:
 * - Extrae el número del remitente.
 * - Verifica que exista dentro del arreglo de números autorizados (whitelist).
 * - Si NO está en la whitelist, retorna status 200 sin hacer nada.
 * - Si está autorizado, ejecuta el comando (INFO / PESO) contra la base de datos y envía la respuesta por WhatsApp.
 *
 * @param {object} body - Payload JSON entrante enviado por Meta
 * @param {object} [opciones] - Opciones para inyección de dependencias (whitelist, dbAdapter, enviarMensajeFn)
 * @returns {Promise<{ status: number, autorizado: boolean, procesado: boolean, remitente?: string, comando?: string, respuestaTexto?: string }>}
 */
export async function procesarWebhookPostWhatsApp(body, opciones = {}) {
  try {
    const mensaje = extraerMensajeEntranteMeta(body);

    // Si es una notificación de estado de entrega/lectura (sin objeto messages), retornar 200 OK
    if (!mensaje || !mensaje.from) {
      return {
        status: 200,
        autorizado: false,
        procesado: false,
        body: { status: 'ok', ignored: true }
      };
    }

    const remitente = mensaje.from;

    // 4. CAPA DE SEGURIDAD: Validar que el número del remitente exista en la Whitelist
    const estaAutorizado = verificarNumeroEnWhitelist(remitente, opciones.whitelist || opciones.env);
    if (!estaAutorizado) {
      console.warn(`[WhatsApp Seguridad] Número no autorizado ignorado: ${remitente}`);
      // Retornar status 200 sin hacer nada para que Meta no reintente el webhook
      return {
        status: 200,
        autorizado: false,
        procesado: false,
        remitente,
        body: { status: 'ignored', ignored: true, reason: 'unauthorized_sender' }
      };
    }

    // 5. Procesar comando ("INFO <ID>" o "PESO <ID> <PESO>")
    const resultadoComando = await procesarComandoWhatsApp(
      mensaje.text,
      opciones.dbAdapter || null,
      remitente
    );

    // 6. Enviar respuesta al usuario mediante la API de Meta
    const enviarFn = opciones.enviarMensajeFn ||
      ((dest, txt) => enviarMensajeWhatsApp(dest, txt, opciones));

    const envio = await enviarFn(remitente, resultadoComando.respuestaTexto);

    return {
      status: 200,
      autorizado: true,
      procesado: true,
      remitente,
      comando: resultadoComando.comando,
      respuestaTexto: resultadoComando.respuestaTexto,
      envioOk: Boolean(envio && envio.ok),
      body: {
        status: 'processed',
        ignored: false,
        comando: resultadoComando.comando,
        remitente,
        envioOk: Boolean(envio && envio.ok)
      }
    };
  } catch (error) {
    console.error('[WhatsApp Webhook POST] Error procesando evento entrante:', error);
    // Siempre retornar 200 a Meta tras capturar el error para evitar bucles de reintentos
    return {
      status: 200,
      autorizado: false,
      procesado: false,
      error: error.message
    };
  }
}
