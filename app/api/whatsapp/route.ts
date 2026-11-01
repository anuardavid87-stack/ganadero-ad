/**
 * ============================================================================
 * WEBHOOK OFICIAL DE WHATSAPP CLOUD API (META) - NEXT.JS APP ROUTER
 * Archivo: app/api/whatsapp/route.ts
 * ============================================================================
 *
 * VARIABLES DE ENTORNO REQUERIDAS (Configurar en .env.local o en Vercel):
 * ----------------------------------------------------------------------------
 * - WHATSAPP_VERIFY_TOKEN      : Token secreto para verificar el webhook en Meta (ej: "ganadero_ad_verify_2026")
 * - WHATSAPP_ACCESS_TOKEN      : Token de acceso Bearer de Meta WhatsApp Cloud API
 * - WHATSAPP_PHONE_NUMBER_ID   : ID del número de teléfono de WhatsApp Business en Meta
 * - WHATSAPP_AUTHORIZED_NUMBERS: Números adicionales autorizados separados por comas (ej: "573001234567,573109876543")
 * - SUPABASE_URL               : URL de tu proyecto en Supabase (ej: "https://xxxx.supabase.co")
 * - SUPABASE_ANON_KEY          : Clave API (anon o service_role) de Supabase
 * ============================================================================
 */

// ============================================================================
// 4. CAPA DE SEGURIDAD: ARREGLO DE NÚMEROS AUTORIZADOS (WHITELIST)
// Agrega aquí los números de teléfono autorizados en formato internacional sin '+'
// ============================================================================
const WHITELIST_NUMEROS_AUTORIZADOS: string[] = [
  '573001234567',
  '573109876543',
  '573167910000',
  ...(process.env.WHATSAPP_AUTHORIZED_NUMBERS
    ? process.env.WHATSAPP_AUTHORIZED_NUMBERS.split(',').map((n) => n.replace(/[^\d]/g, '').trim()).filter(Boolean)
    : [])
];

/**
 * Normaliza un número telefónico dejando solo dígitos.
 */
function normalizarTelefono(telefono: string): string {
  return String(telefono || '').replace(/[^\d]/g, '').trim();
}

/**
 * Verifica si un número está dentro de la lista blanca (Whitelist).
 */
function estaEnWhitelist(numeroRemitente: string): boolean {
  const limpio = normalizarTelefono(numeroRemitente);
  return Boolean(limpio && WHITELIST_NUMEROS_AUTORIZADOS.includes(limpio));
}

// ============================================================================
// 6. FUNCIÓN PARA ENVIAR MENSAJES DE RESPUESTA VÍA META GRAPH API (v17.0)
// ============================================================================
export async function enviarMensajeWhatsApp(numeroDestino: string, texto: string): Promise<boolean> {
  try {
    // ⚠️ COLOCA TUS VARIABLES DE ENTORNO DE META AQUÍ (en tu archivo .env.local):
    const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
      console.error('[WhatsApp API] Faltan WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_ACCESS_TOKEN en las variables de entorno.');
      return false;
    }

    const url = `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizarTelefono(numeroDestino),
        type: 'text',
        text: {
          preview_url: false,
          body: texto
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[WhatsApp API] Error al enviar mensaje:', response.status, errorData);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[WhatsApp API] Excepción en enviarMensajeWhatsApp:', error);
    return false;
  }
}

// ============================================================================
// FUNCIONES DE ACCESO A LA BASE DE DATOS (SUPABASE REST)
// ============================================================================
function obtenerConfiguracionBaseDatos() {
  // ⚠️ COLOCA TUS URLS Y TOKENS DE BASE DE DATOS AQUÍ (en tu archivo .env.local):
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  return { supabaseUrl, supabaseKey };
}

async function consultarEstadoAnimalEnBD(idAnimal: string) {
  const { supabaseUrl, supabaseKey } = obtenerConfiguracionBaseDatos();
  const tag = idAnimal.trim().toUpperCase();

  const url = `${supabaseUrl}/rest/v1/animales?identificacion_tag=ilike.${encodeURIComponent(tag)}&limit=1`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    throw new Error(`Error consultando base de datos (${res.status})`);
  }

  const filas = await res.json();
  return Array.isArray(filas) && filas.length > 0 ? filas[0] : null;
}

async function insertarPesoAnimalEnBD(idAnimal: string, pesoKg: number, remitente: string) {
  const { supabaseUrl, supabaseKey } = obtenerConfiguracionBaseDatos();
  const tag = idAnimal.trim().toUpperCase();
  const fechaHoy = new Date().toISOString().split('T')[0];

  const animal = await consultarEstadoAnimalEnBD(tag);
  const fincaId = animal?.finca_id || 'FIN-WHATSAPP';
  const animalId = animal?.id || `ANM-WA-${tag}`;
  const idPesaje = `PES-${fincaId}-${tag.replace(/[^A-Za-z0-9_-]/g, '_')}-${fechaHoy}`;

  // 1. Insertar registro en la tabla pesajes_animales
  const resInsert = await fetch(`${supabaseUrl}/rest/v1/pesajes_animales?on_conflict=id`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify([{
      id: idPesaje,
      finca_id: fincaId,
      animal_id: animalId,
      animal_tag: tag,
      fecha: fechaHoy,
      peso_kg: pesoKg,
      responsable: `WhatsApp (${remitente})`,
      observaciones: `Pesaje registrado por WhatsApp (${pesoKg} kg)`
    }])
  });

  if (!resInsert.ok) {
    throw new Error(`Error al insertar el peso en la base de datos (${resInsert.status})`);
  }

  // 2. Actualizar el último peso en la ficha del animal si existe
  if (animal?.id) {
    await fetch(`${supabaseUrl}/rest/v1/animales?id=eq.${encodeURIComponent(animal.id)}`, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ultimo_peso_kg: pesoKg,
        fecha_ultimo_pesaje: fechaHoy
      })
    });
  }

  return { tag, pesoKg, fecha: fechaHoy };
}

// ============================================================================
// 2. MÉTODO GET: VERIFICACIÓN DEL WEBHOOK DE META
// ============================================================================
export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    // ⚠️ COLOCA TU TOKEN DE VERIFICACIÓN EN .env.local: WHATSAPP_VERIFY_TOKEN="tu_token_secreto"
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

    if (mode === 'subscribe' && token && VERIFY_TOKEN && token === VERIFY_TOKEN) {
      // Retorna el challenge en texto plano con status 200
      return new Response(challenge || '', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    return new Response('Forbidden: Token de verificación inválido', { status: 403 });
  } catch (error) {
    console.error('[WhatsApp Webhook GET] Error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

// ============================================================================
// 3. MÉTODO POST: RECEPCIÓN Y PROCESAMIENTO DE MENSAJES ENTRANTES DE WHATSAPP
// ============================================================================
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();

    // Extraer el mensaje entrante de la estructura estándar de WhatsApp Cloud API
    const mensaje = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    // Si es un evento de estado (entregado/leído) y no contiene mensaje, retornar 200
    if (!mensaje || !mensaje.from) {
      return new Response(JSON.stringify({ status: 'ignored_no_message' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const numeroRemitente = normalizarTelefono(mensaje.from);
    const textoRecibido = String(mensaje?.text?.body || '').trim();

    // 4. CAPA DE SEGURIDAD (WHITELIST):
    // Si el número del remitente NO está en la lista autorizada, retorna 200 sin hacer nada.
    if (!estaEnWhitelist(numeroRemitente)) {
      console.warn(`[WhatsApp Seguridad] Remitente no autorizado ignorado: ${numeroRemitente}`);
      return new Response(JSON.stringify({ status: 'unauthorized_ignored' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 5. LÓGICA DE PROCESAMIENTO DE COMANDOS ("INFO" y "PESO")
    const partes = textoRecibido.split(/\s+/);
    const comando = (partes[0] || '').toUpperCase();
    let respuestaTexto = '';

    if (comando === 'INFO') {
      // Ejemplo: "INFO 045"
      const idAnimal = (partes[1] || '').trim().toUpperCase();
      if (!idAnimal) {
        respuestaTexto = '⚠️ Formato incorrecto. Usa: *INFO <ID>* (Ejemplo: *INFO 045*).';
      } else {
        const animal = await consultarEstadoAnimalEnBD(idAnimal);
        if (!animal) {
          respuestaTexto = `🔍 No se encontró el animal con ID *${idAnimal}* en la base de datos.`;
        } else {
          const estadoReproductivo = animal.estado_reproductivo || 'Vacía';
          const diasGestacion = animal.dias_gestacion_actual ? ` (${animal.dias_gestacion_actual} días)` : '';
          const ultimoPeso = animal.ultimo_peso_kg ? `${animal.ultimo_peso_kg} kg` : 'Sin registro';
          const lote = animal.lote || 'General';

          respuestaTexto =
            `🐄 *INFORMACIÓN DEL ANIMAL ${animal.identificacion_tag || idAnimal}*\n` +
            `• Estado Reproductivo: *${estadoReproductivo}*${diasGestacion}\n` +
            `• Último Peso: *${ultimoPeso}*\n` +
            `• Lote: ${lote}`;
        }
      }
    } else if (comando === 'PESO') {
      // Ejemplo: "PESO 045 350"
      const idAnimal = (partes[1] || '').trim().toUpperCase();
      const pesoValor = parseFloat((partes[2] || '').replace(',', '.'));

      if (!idAnimal || isNaN(pesoValor) || pesoValor <= 0) {
        respuestaTexto = '⚠️ Formato incorrecto. Usa: *PESO <ID> <KG>* (Ejemplo: *PESO 045 350*).';
      } else {
        const reg = await insertarPesoAnimalEnBD(idAnimal, pesoValor, numeroRemitente);
        respuestaTexto =
          `✅ *PESO REGISTRADO CON ÉXITO*\n` +
          `• Animal ID: *${reg.tag}*\n` +
          `• Peso Registrado: *${reg.pesoKg} kg*\n` +
          `• Fecha: ${reg.fecha}`;
      }
    } else {
      respuestaTexto =
        `🤖 *Asistente Ganadero AD*\n` +
        `Envía uno de los siguientes comandos:\n` +
        `• *INFO <ID>* (ej. INFO 045)\n` +
        `• *PESO <ID> <PESO>* (ej. PESO 045 350)`;
    }

    // 6. Enviar respuesta por WhatsApp al remitente autorizado
    await enviarMensajeWhatsApp(numeroRemitente, respuestaTexto);

    return new Response(JSON.stringify({ status: 'ok', comando, respuestaTexto }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[WhatsApp Webhook POST] Error procesando mensaje:', error);
    return new Response(JSON.stringify({ status: 'error', message: (error as Error).message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
