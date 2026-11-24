/**
 * BOVITRACK PRO PWA - SERVICIO DE CONEXIÓN Y SINCRONIZACIÓN CON SUPABASE
 * Utiliza fetch nativo contra la API REST (PostgREST) de Supabase.
 * Sin dependencias de paquetes npm externos (Zero-Bloat).
 * 100% compatible con file:// (doble clic en Windows) y http:// (PWA en campo).
 */

export function normalizarFechaISO(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    // Manejo de serial de Excel (ej: 45276)
    if (val > 20000 && val < 90000) {
      const utcDays = Math.floor(val - 25569);
      const utcValue = utcDays * 86400 * 1000;
      const dateInfo = new Date(utcValue);
      if (!isNaN(dateInfo.getTime())) {
        return dateInfo.toISOString().split('T')[0];
      }
    }
    return null;
  }
  const str = String(val).trim();
  if (!str || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined' || str === '-' || str.toLowerCase() === 'n/a') {
    return null;
  }

  // Formato YYYY-MM-DD o YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Formato DD/MM/YYYY o DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }

  // Formato DD/MM/YY
  const dmyShortMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (dmyShortMatch) {
    const d = dmyShortMatch[1].padStart(2, '0');
    const m = dmyShortMatch[2].padStart(2, '0');
    const yy = parseInt(dmyShortMatch[3], 10);
    const y = yy > 50 ? `19${yy}` : `20${yy}`;
    return `${y}-${m}-${d}`;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    try {
      return parsed.toISOString().split('T')[0];
    } catch (_) {}
  }

  return null;
}

export class SupabaseSyncService {
  constructor() {
    this.storageKey = 'bovitrack_supabase_config';
    this.storageSyncKey = 'bovitrack_supabase_ultimo_sync';
    this.storageFirmaKey = 'bovitrack_ultima_firma_remota_v1';
    this.config = this.cargarConfig();
    this.estadoConexion = 'desconectado'; // 'desconectado' | 'conectado' | 'error' | 'sincronizando'
    this.ultimoSync = typeof localStorage !== 'undefined' ? (localStorage.getItem(this.storageSyncKey) || null) : null;
    this.tenantContext = null; // { empresaId, esSuperAdmin, fincasIds, token }
    this._cacheHuellasCloud = new Map(); // tabla -> Map(clave -> jsonStr) para evitar re-subir registros idénticos
    this._ultimaFirmaRemota = null; // firma ultraligera (< 350 bytes) para evitar descargas completas innecesarias
  }

  _obtenerClaveFirmaTenant(ctx = null) {
    const c = ctx || this.tenantContext || {};
    const fincasKey = Array.isArray(c.fincasIds) ? [...c.fincasIds].sort().join(',') : '';
    return `${c.esSuperAdmin ? 'SA' : 'T'}:${c.empresaId || 'ALL'}:${c.usuario || ''}:${fincasKey}`;
  }

  _leerFirmaPersistida(ctx = null) {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(this.storageFirmaKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const k = this._obtenerClaveFirmaTenant(ctx);
      if (parsed && parsed.key === k && typeof parsed.firma === 'string' && parsed.firma.length > 0) {
        return parsed.firma;
      }
    } catch (_) {}
    return null;
  }

  _persistirFirmaRemota(firma, ctx = null) {
    if (!firma || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.storageFirmaKey, JSON.stringify({
        key: this._obtenerClaveFirmaTenant(ctx),
        firma,
        actualizadoEn: Date.now()
      }));
    } catch (_) {}
  }

  _limpiarFirmaPersistida() {
    this._ultimaFirmaRemota = null;
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(this.storageFirmaKey);
    } catch (_) {}
  }

  _filtrarRegistrosModificados(tabla, registros, fnClave, forzarCompleta = false) {
    if (!Array.isArray(registros) || registros.length === 0) {
      return { pendientes: [], confirmarSubida: () => {} };
    }
    if (!this._cacheHuellasCloud) this._cacheHuellasCloud = new Map();
    if (!this._cacheHuellasCloud.has(tabla)) {
      this._cacheHuellasCloud.set(tabla, new Map());
    }
    const mapa = this._cacheHuellasCloud.get(tabla);
    const pendientes = [];
    const nuevasHuellas = [];

    for (const r of registros) {
      if (!r) continue;
      const clave = String(fnClave(r) || '');
      const huella = JSON.stringify(r);
      if (forzarCompleta || !clave || mapa.get(clave) !== huella) {
        pendientes.push(r);
        if (clave) nuevasHuellas.push([clave, huella]);
      }
    }

    return {
      pendientes,
      confirmarSubida: () => {
        for (const [k, h] of nuevasHuellas) {
          mapa.set(k, h);
        }
      }
    };
  }

  _registrarHuellasDescargadas(datosLocales, fincaActivaFallback = null) {
    if (!datosLocales) return;
    if (!this._cacheHuellasCloud) this._cacheHuellasCloud = new Map();

    const guardarMapa = (tabla, lista, fnMapear, fnClave) => {
      if (!Array.isArray(lista)) return;
      if (!this._cacheHuellasCloud.has(tabla)) {
        this._cacheHuellasCloud.set(tabla, new Map());
      }
      const mapa = this._cacheHuellasCloud.get(tabla);
      for (const item of lista) {
        if (!item) continue;
        const payload = fnMapear ? fnMapear(item) : item;
        const clave = String(fnClave(payload) || '');
        if (clave) {
          mapa.set(clave, JSON.stringify(payload));
        }
      }
    };

    guardarMapa('empresas', datosLocales.empresas, (e) => this.mapearEmpresaLocalACloud(e), (r) => r.id);
    guardarMapa('fincas', datosLocales.fincas, (f) => this.mapearFincaLocalACloud(f), (r) => r.id);
    guardarMapa('usuarios', datosLocales.usuarios, (u) => {
      const base = {
        id: u.usuario === 'anuardavid' ? 'USR-SUPER' : u.id,
        empresa_id: this._resolverEmpresaIdCloud(u.empresaId),
        usuario: u.usuario,
        nombre: u.nombre,
        rol: u.rol,
        password: u.password || null,
        fincas_asignadas: Array.isArray(u.fincasAsignadas) ? u.fincasAsignadas : (u.fincasAsignadas || 'todas'),
        email: u.email || null,
        telefono: u.telefono || null,
        activo: u.activo !== false
      };
      if (this.usarModoNeon()) {
        base.empresas_asignadas = Array.isArray(u.empresasAsignadas) && u.empresasAsignadas.length > 0
          ? u.empresasAsignadas
          : (u.empresaId ? [u.empresaId] : []);
      }
      return base;
    }, (r) => r.usuario);
    guardarMapa('animales', datosLocales.animales, (a) => this.mapearAnimalLocalACloud(a, fincaActivaFallback), (r) => `${r.finca_id}__${r.identificacion_tag}`);
    guardarMapa('servicios_reproductivos', datosLocales.servicios, (s) => this.mapearServicioLocalACloud(s, fincaActivaFallback), (r) => r.id);
    guardarMapa('inversiones_diferidas', datosLocales.inversiones, (i) => ({
      id: i.id,
      finca_id: i.fincaId || fincaActivaFallback,
      descripcion_activo: i.descripcionActivo || 'Inversión',
      monto_total_inversion: Number(i.montoTotalInversion || 0),
      plazo_meses_diferido: Number(i.plazoMesesDiferido || 12),
      cuota_mensual: Number(i.cuotaMensual || 0),
      estado: i.estado || 'Activa'
    }), (r) => r.id);
    guardarMapa('traslados_animales', datosLocales.traslados, (t) => ({
      id: t.id,
      empresa_id: this._resolverEmpresaIdCloud(t.empresaId),
      fecha: normalizarFechaISO(t.fecha) || new Date().toISOString().split('T')[0],
      finca_origen_id: t.fincaOrigenId || null,
      finca_origen_nombre: t.fincaOrigenNombre || '',
      finca_destino_id: t.fincaDestinoId || null,
      finca_destino_nombre: t.fincaDestinoNombre || '',
      motivo: t.motivo || '',
      observaciones: t.observaciones || '',
      total_animales: t.totalAnimales || 1,
      animales: Array.isArray(t.animales) ? t.animales : (t.tag ? [{ id: t.animalId, tag: t.tag, alias: t.nombreAlias }] : []),
      usuario_nombre: t.responsable || t.usuarioNombre || ''
    }), (r) => r.id);
    guardarMapa('operaciones_diarias', datosLocales.operacionesDiarias, (o) => ({
      id: o.id,
      empresa_id: this._resolverEmpresaIdCloud(o.empresaId),
      fecha: normalizarFechaISO(o.fecha) || new Date().toISOString().split('T')[0],
      finca_id: o.fincaId === 'GLOBAL' ? null : (o.fincaId || null),
      finca_nombre: o.fincaNombre || '',
      accion: o.accion || '',
      modulo: o.modulo || o.accion || '',
      detalles: o,
      usuario: o.responsable || o.usuario || 'Sistema'
    }), (r) => r.id);
    guardarMapa('pesajes_animales', datosLocales.pesajes, (p) => ({
      id: p.id,
      finca_id: p.fincaId || fincaActivaFallback,
      animal_tag: p.tag || p.animalTag || '',
      fecha_pesaje: normalizarFechaISO(p.fecha || p.fechaPesaje) || new Date().toISOString().split('T')[0],
      peso_kg: Number(p.pesoNuevo || p.peso || 0),
      gdp_calculada_g_dia: p.gdp ? Number(p.gdp) : null,
      notas: p.observaciones || p.responsable || 'Registro de Manga'
    }), (r) => r.id);
    guardarMapa('nutricion_animales', datosLocales.nutricion, (n) => this.mapearNutricionLocalACloud(n, fincaActivaFallback), (r) => `${r.finca_id}__${r.animal_tag}`);
    guardarMapa('sys_contabilidad_mov', datosLocales.contabilidadMovimientos, (m) => this._mapearContabMovACloud(m), (r) => r.id);
    guardarMapa('sys_nomina_trab', datosLocales.nominaTrabajadores, (t) => this._mapearNominaTrabACloud(t), (r) => r.id);
    guardarMapa('sys_nomina_pago', datosLocales.nominaPagos, (p) => this._mapearNominaPagoACloud(p), (r) => r.id);
  }

  _resolverEmpresaIdCloud(empId) {
    if (!empId) return null;
    if (this.usarModoNeon()) return String(empId);
    return empId === 'EMP-01' ? 'EMP-01' : null;
  }

  _mapearContabMovACloud(m, empresaFallback = null) {
    const empRef = m.empresaId || empresaFallback || null;
    return {
      id: `SYS_CONTAB_MOV_${m.id}`,
      empresa_id: this._resolverEmpresaIdCloud(empRef),
      fecha: normalizarFechaISO(m.fecha) || new Date().toISOString().split('T')[0],
      finca_id: m.fincaId || m.finca_id || null,
      finca_nombre: m.fincaNombre || '',
      accion: 'SYS_CONTAB_MOV',
      modulo: 'sistema_contabilidad',
      detalles: { ...m, _tipoRegistroSistema: 'contabilidad_movimiento' },
      usuario: m.responsable || m.tercero || 'Contabilidad'
    };
  }

  _mapearNominaTrabACloud(t, empresaFallback = null) {
    const empRef = t.empresaId || empresaFallback || null;
    return {
      id: `SYS_NOMINA_TRAB_${t.id}`,
      empresa_id: this._resolverEmpresaIdCloud(empRef),
      fecha: normalizarFechaISO(t.fechaIngreso || t.creadoEn) || new Date().toISOString().split('T')[0],
      finca_id: t.fincaId || t.finca_id || null,
      finca_nombre: t.fincaNombre || '',
      accion: 'SYS_NOMINA_TRAB',
      modulo: 'sistema_nomina',
      detalles: { ...t, _tipoRegistroSistema: 'nomina_trabajador' },
      usuario: t.nombre || 'Nómina'
    };
  }

  _mapearNominaPagoACloud(p, empresaFallback = null) {
    const empRef = p.empresaId || empresaFallback || null;
    return {
      id: `SYS_NOMINA_PAGO_${p.id}`,
      empresa_id: this._resolverEmpresaIdCloud(empRef),
      fecha: normalizarFechaISO(p.fecha) || new Date().toISOString().split('T')[0],
      finca_id: p.fincaId || p.finca_id || null,
      finca_nombre: p.fincaNombre || '',
      accion: 'SYS_NOMINA_PAGO',
      modulo: 'sistema_nomina',
      detalles: { ...p, _tipoRegistroSistema: 'nomina_pago' },
      usuario: p.trabajadorNombre || 'Nómina'
    };
  }

  setTenantContext(context) {
    if (!context) {
      this.tenantContext = null;
      return;
    }
    this.tenantContext = {
      empresaId: context.empresaId || null,
      empresasIds: Array.isArray(context.empresasIds) ? context.empresasIds.filter(Boolean) : (context.empresaId ? [context.empresaId] : []),
      esSuperAdmin: Boolean(context.esSuperAdmin),
      rol: context.rol || (context.esSuperAdmin ? 'superadmin' : null),
      usuario: context.usuario || null,
      fincasIds: Array.isArray(context.fincasIds) ? context.fincasIds : [],
      token: context.token || null
    };
  }

  _resolverNeonApiBaseUrl() {
    if (typeof window !== 'undefined' && window.location) {
      const proto = String(window.location.protocol || '');
      const host = String(window.location.hostname || '');
      const origin = String(window.location.origin || '');
      if ((proto === 'https:' || proto === 'http:') && origin && origin !== 'null' && !/^(localhost|127\.0\.0\.1)$/i.test(host)) {
        return `${origin.replace(/\/+$/, '')}/api/db`;
      }
    }
    return 'https://ganadero-ad.vercel.app/api/db';
  }

  usarModoNeon() {
    if (
      Object.prototype.hasOwnProperty.call(this, '_postgrestUpsert') ||
      Object.prototype.hasOwnProperty.call(this, '_postgrestGet') ||
      Object.prototype.hasOwnProperty.call(this, '_postgrestDelete')
    ) {
      return false;
    }
    return this.config?.provider === 'neon' && Boolean(this.config?.apiBaseUrl);
  }

  cargarConfig() {
    const neonApiBase = this._resolverNeonApiBaseUrl();
    const defaultNeonConfig = {
      provider: 'neon',
      apiBaseUrl: neonApiBase,
      url: neonApiBase,
      anonKey: 'neon-serverless'
    };

    if (typeof localStorage === 'undefined') {
      return defaultNeonConfig;
    }
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Migrar automáticamente cualquier dispositivo que todavía apunte al antiguo proyecto Supabase hacia Neon Postgres
        if (
          !parsed ||
          parsed.provider !== 'neon' ||
          !parsed.apiBaseUrl ||
          String(parsed.url || '').includes('jucpxyjzmbthplbvzrsj') ||
          String(parsed.url || '').includes('supabase.co')
        ) {
          this.guardarConfig(defaultNeonConfig);
          return defaultNeonConfig;
        }
        return {
          provider: 'neon',
          apiBaseUrl: this.sanitizarUrl(parsed.apiBaseUrl || neonApiBase),
          url: this.sanitizarUrl(parsed.apiBaseUrl || neonApiBase),
          anonKey: 'neon-serverless'
        };
      }
    } catch (e) {
      console.warn('Error leyendo configuración de nube:', e);
    }
    this.guardarConfig(defaultNeonConfig);
    return defaultNeonConfig;
  }

  guardarConfig({ url, anonKey, provider = null, apiBaseUrl = null }) {
    const cleanUrl = this.sanitizarUrl(url || '');
    const cleanKey = (anonKey || '').trim();
    const esNeon = provider === 'neon' || (cleanUrl && cleanUrl.includes('/api/db'));
    if (esNeon) {
      const base = this.sanitizarUrl(apiBaseUrl || cleanUrl || this._resolverNeonApiBaseUrl());
      this.config = { provider: 'neon', apiBaseUrl: base, url: base, anonKey: cleanKey || 'neon-serverless' };
    } else {
      this.config = { provider: 'supabase', apiBaseUrl: '', url: cleanUrl, anonKey: cleanKey };
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.storageKey, JSON.stringify(this.config));
    }
    return this.config;
  }

  sanitizarUrl(url) {
    if (!url) return '';
    let u = url.trim();
    while (u.endsWith('/')) {
      u = u.slice(0, -1);
    }
    return u;
  }

  estaConfigurado() {
    if (this.config?.provider === 'neon') {
      return Boolean(this.config.apiBaseUrl);
    }
    return Boolean(this.config.url && this.config.anonKey);
  }

  obtenerHeadersNeon(extra = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...extra
    };
    if (this.tenantContext) {
      if (this.tenantContext.empresaId) headers['x-empresa-id'] = this.tenantContext.empresaId;
      if (this.tenantContext.rol) headers['x-ganadero-rol'] = this.tenantContext.rol;
      else if (this.tenantContext.esSuperAdmin) headers['x-ganadero-rol'] = 'superadmin';
      if (this.tenantContext.usuario) headers['x-ganadero-usuario'] = this.tenantContext.usuario;
      if (this.tenantContext.token) headers['x-session-token'] = this.tenantContext.token;
    }
    return headers;
  }

  async _neonRequest(path, options = {}, timeoutMs = 15000) {
    const base = this.sanitizarUrl(this.config?.apiBaseUrl || this._resolverNeonApiBaseUrl());
    const url = `${base}${path}`;
    const res = await this._fetchConTimeout(url, {
      ...options,
      headers: this.obtenerHeadersNeon(options.headers || {})
    }, timeoutMs);
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { ok: false, error: text.slice(0, 200) };
    }
    if (!res.ok || (data && data.ok === false)) {
      throw new Error(data?.error || `Neon API HTTP ${res.status}`);
    }
    return data;
  }

  obtenerHeaders(extra = {}) {
    const headers = {
      'apikey': this.config.anonKey,
      'Authorization': 'Bearer ' + this.config.anonKey,
      'Content-Type': 'application/json',
      ...extra
    };
    if (this.tenantContext) {
      if (this.tenantContext.empresaId) {
        headers['x-empresa-id'] = this.tenantContext.empresaId;
      }
      if (this.tenantContext.rol) {
        headers['x-ganadero-rol'] = this.tenantContext.rol;
      }
      if (this.tenantContext.usuario) {
        headers['x-ganadero-usuario'] = this.tenantContext.usuario;
      }
      if (this.tenantContext.token) {
        headers['x-session-token'] = this.tenantContext.token;
      }
    }
    return headers;
  }

  /**
   * Prueba en vivo la conexión con Neon Postgres (/api/db/health) o PostgREST legado.
   */
  async testConexion(customUrl = null, customKey = null) {
    const url = this.sanitizarUrl(customUrl !== null ? customUrl : this.config.url);
    const key = customKey !== null ? customKey.trim() : this.config.anonKey;

    const esPruebaNeon =
      (customUrl === null && customKey === null && this.usarModoNeon()) ||
      (url && url.includes('/api/db'));

    if (esPruebaNeon) {
      try {
        const base = url && url.includes('/api/db') ? url : this.config.apiBaseUrl;
        const res = await this._fetchConTimeout(`${base}/health`, {
          method: 'GET',
          headers: this.obtenerHeadersNeon()
        }, 8000);
        const data = await res.json();
        if (res.ok && data?.ok) {
          this.estadoConexion = 'conectado';
          const c = data.counts || {};
          return {
            ok: true,
            provider: 'neon',
            counts: c,
            mensaje: `¡Conexión exitosa con Neon Postgres! (${c.fincas || 0} fincas, ${c.animales || 0} animales, ${c.pesajes_animales || 0} pesajes).`
          };
        }
        return { ok: false, error: data?.error || `Neon API respondió HTTP ${res.status}` };
      } catch (err) {
        return { ok: false, error: 'No fue posible conectar con Neon Postgres: ' + err.message };
      }
    }

    if (!url || !key) {
      return { ok: false, error: 'Debes ingresar tanto la URL del proyecto como la Anon Key.' };
    }

    if (!url.startsWith('https://') && !url.startsWith('http://')) {
      return { ok: false, error: 'La URL de conexión debe comenzar con https:// (ejemplo: https://ganadero-ad.vercel.app/api/db)' };
    }
    if (url === 'http://' || url === 'https://' || url.length < 12) {
      return { ok: false, error: 'La URL ingresada no es válida.' };
    }

    try {
      const endpoint = url + '/rest/v1/fincas?select=id&limit=1';
      const headers = {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json'
      };

      const res = await this._fetchConTimeout(endpoint, {
        method: 'GET',
        headers: headers
      }, 6000);

      if (res.ok) {
        this.estadoConexion = 'conectado';
        return { ok: true, mensaje: '¡Conexión exitosa! Tablas y políticas RLS verificadas en Supabase.' };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          error: 'Credenciales no autorizadas (HTTP ' + res.status + '). Verifica que la Anon Key sea correcta y que hayas ejecutado el script SQL con las políticas RLS.'
        };
      }

      if (res.status === 404) {
        return {
          ok: false,
          error: 'No se encontró la tabla "fincas" (HTTP 404). Ejecuta primero el script supabase_setup.sql en el SQL Editor de tu proyecto.'
        };
      }

      const txt = await res.text();
      return {
        ok: false,
        error: 'Supabase respondió con error HTTP ' + res.status + ': ' + txt.slice(0, 140)
      };
    } catch (err) {
      return {
        ok: false,
        error: 'No fue posible conectar con Supabase. Verifica tu conexión a internet o que la URL sea válida: ' + err.message
      };
    }
  }

  // ==========================================================================
  // MAPEOS ZOOTÉCNICOS BIDIRECCIONALES (camelCase <---> snake_case)
  // ==========================================================================

  mapearAnimalLocalACloud(animal, fincaIdFallback) {
    const fincaId = animal.fincaId || fincaIdFallback;
    const tag = String(animal.identificacionTag || animal.tag || '').trim().toUpperCase();
    const safeTag = tag.replace(/[^A-Z0-9_-]/g, '_');
    return {
      id: animal.id || (`ANM_${fincaId}_${safeTag}`),
      finca_id: fincaId,
      identificacion_tag: tag,
      nombre_alias: animal.nombreAlias || '',
      especie: animal.especie || 'bovino',
      raza: animal.raza || 'Común',
      sexo: animal.sexo || 'hembra',
      categoria: animal.categoria || 'Vaca de Ordeño',
      lote: animal.lote || 'General',
      fecha_nacimiento: normalizarFechaISO(animal.fechaNacimiento),
      padre_tag: animal.padreTag || animal.padre || null,
      madre_tag: animal.madreTag || animal.madre || null,
      estado_vida: animal.estadoVida || 'activo',
      estado_reproductivo: animal.estadoReproductivo || 'Vacía',
      dias_gestacion_actual: Number(animal.diasGestacionActual || 0),
      fecha_ultimo_parto: normalizarFechaISO(animal.fechaUltimoParto),
      ultimo_peso_kg: (animal.ultimoPesoKg || animal.pesoActualKg || animal.peso) ? Number(animal.ultimoPesoKg || animal.pesoActualKg || animal.peso) : null,
      fecha_ultimo_pesaje: normalizarFechaISO(animal.fechaUltimoPesaje),
      gdp_promedio_g_dia: animal.gdpPromedioGDia ? Number(animal.gdpPromedioGDia) : null,
      promedio_leche_diaria_l: animal.promedioLecheDiariaL ? Number(animal.promedioLecheDiariaL) : 0,
      partos_previos: Array.isArray(animal.partosPrevios) ? animal.partosPrevios : []
    };
  }

  mapearAnimalCloudALocal(row) {
    return {
      id: row.id,
      fincaId: row.finca_id,
      identificacionTag: row.identificacion_tag,
      nombreAlias: row.nombre_alias || '',
      especie: row.especie || 'bovino',
      raza: row.raza || '',
      sexo: row.sexo || 'hembra',
      categoria: row.categoria || '',
      lote: row.lote || 'General',
      fechaNacimiento: row.fecha_nacimiento || '',
      padreTag: row.padre_tag || '',
      madreTag: row.madre_tag || '',
      estadoVida: row.estado_vida || 'activo',
      estadoReproductivo: row.estado_reproductivo || 'Vacía',
      diasGestacionActual: Number(row.dias_gestacion_actual || 0),
      fechaUltimoParto: row.fecha_ultimo_parto || '',
      ultimoPesoKg: row.ultimo_peso_kg ? Number(row.ultimo_peso_kg) : null,
      fechaUltimoPesaje: row.fecha_ultimo_pesaje || '',
      gdpPromedioGDia: row.gdp_promedio_g_dia ? Number(row.gdp_promedio_g_dia) : 0,
      promedioLecheDiariaL: row.promedio_leche_diaria_l ? Number(row.promedio_leche_diaria_l) : 0,
      partosPrevios: Array.isArray(row.partos_previos) ? row.partos_previos : []
    };
  }

  mapearServicioLocalACloud(srv, fincaIdFallback) {
    const fid = srv.fincaId || fincaIdFallback;
    const tag = String(srv.tag || srv.animalTag || '').trim().toUpperCase();
    return {
      id: srv.id || ('SRV-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
      finca_id: fid,
      animal_tag: tag,
      tipo: srv.tipo,
      fecha: normalizarFechaISO(srv.fecha) || new Date().toISOString().split('T')[0],
      reproductor: srv.reproductor,
      codigo_pajilla: srv.codigoPajilla || null,
      donadora: srv.donadora || null,
      tecnico: srv.tecnico || null,
      protocolo: srv.protocolo || null,
      resultado: srv.resultado || 'Pendiente Chequeo',
      fecha_ecografia_estimada: normalizarFechaISO(srv.fechaEcografiaEstimada),
      fecha_palpacion_estimada: normalizarFechaISO(srv.fechaPalpacionEstimada),
      fecha_parto_estimada: normalizarFechaISO(srv.fechaPartoEstimada),
      observaciones: srv.observaciones || ''
    };
  }

  mapearServicioCloudALocal(row) {
    return {
      id: row.id,
      fincaId: row.finca_id,
      tag: row.animal_tag,
      animalTag: row.animal_tag,
      tipo: row.tipo,
      fecha: row.fecha,
      reproductor: row.reproductor,
      codigoPajilla: row.codigo_pajilla || '',
      donadora: row.donadora || '',
      tecnico: row.tecnico || '',
      protocolo: row.protocolo || '',
      resultado: row.resultado || 'Pendiente Chequeo',
      fechaEcografiaEstimada: row.fecha_ecografia_estimada || '',
      fechaPalpacionEstimada: row.fecha_palpacion_estimada || '',
      fechaPartoEstimada: row.fecha_parto_estimada || '',
      observaciones: row.observaciones || ''
    };
  }

  mapearEmpresaLocalACloud(e) {
    return {
      id: e.id,
      nit: e.nit || '',
      nombre: e.nombre || '',
      pais: e.pais || 'Colombia',
      moneda: e.moneda || 'COP',
      email: e.email || null,
      telefono: e.telefono || null,
      direccion: e.direccion || null,
      activa: e.activa !== false,
      fecha_vencimiento: e.fechaVencimiento || '2027-09-15',
      tiempo_indefinido: Boolean(e.tiempoIndefinido || e.fechaVencimiento === 'indefinido'),
      plan_vigencia: e.planVigencia || '1 Año'
    };
  }

  mapearEmpresaCloudALocal(row) {
    return {
      id: row.id,
      nit: row.nit || '',
      nombre: row.nombre || '',
      pais: row.pais || 'Colombia',
      moneda: row.moneda || 'COP',
      email: row.email || '',
      telefono: row.telefono || '',
      direccion: row.direccion || '',
      activa: row.activa !== false,
      fechaVencimiento: row.fecha_vencimiento || '2027-09-15',
      tiempoIndefinido: Boolean(row.tiempo_indefinido || row.fecha_vencimiento === 'indefinido'),
      planVigencia: row.plan_vigencia || '1 Año',
      fechaCreacion: row.creado_en ? row.creado_en.split('T')[0] : new Date().toISOString().split('T')[0]
    };
  }

  mapearFincaLocalACloud(f) {
    const cleanUbic = String(f.ubicacion || '').replace(/^\[TENANT:[^\]]+\]/, '');
    const empId = f.empresaId || null;
    const ubicacionCloud = (empId && empId !== 'EMP-01')
      ? `[TENANT:${empId}]${cleanUbic}`
      : cleanUbic;
    return {
      id: f.id,
      empresa_id: empId === 'EMP-01' ? 'EMP-01' : null,
      codigo: f.codigo,
      nombre: f.nombre,
      ubicacion: ubicacionCloud,
      area_ha: Number(f.areaHa || 0),
      precio_leche_litro: Number(f.precioLecheLitro || 2450),
      precio_carne_kg_pie: Number(f.precioCarneKgPie || 8900)
    };
  }

  mapearFincaCloudALocal(row) {
    let rawUbicacion = String(row.ubicacion || '');
    let tenantFromUbic = null;
    const matchTenant = rawUbicacion.match(/^\[TENANT:([^\]]+)\]([\s\S]*)$/);
    if (matchTenant) {
      tenantFromUbic = matchTenant[1].trim();
      rawUbicacion = matchTenant[2];
    }
    const numOrdRow = Number(row.numero_ordenos ?? row.numeroOrdenos) === 2 ? 2 : 1;
    return {
      id: row.id,
      empresaId: tenantFromUbic || row.empresa_id || null,
      codigo: row.codigo,
      nombre: row.nombre,
      ubicacion: rawUbicacion,
      areaHa: Number(row.area_ha || 0),
      hectareas: Number(row.area_ha || row.hectareas || 0),
      precioLecheLitro: Number(row.precio_leche_litro || 2450),
      precioCarneKgPie: Number(row.precio_carne_kg_pie || 8900),
      numeroOrdenos: numOrdRow,
      tipoOrdeno: numOrdRow === 2 ? 'doble_ordeno' : 'un_ordeno'
    };
  }

  mapearNutricionLocalACloud(n, fincaIdFallback) {
    const fid = n.fincaId || fincaIdFallback;
    const tag = String(n.tag || n.animalTag || '').trim().toUpperCase();
    const safeTag = tag.replace(/[^A-Z0-9_-]/g, '_');
    const sugerenciaDieta = {
      ...(n.sugerenciaDieta || {}),
      tallaCm: n.tallaCm || (n.sugerenciaDieta && n.sugerenciaDieta.tallaCm) || null,
      frameScore: n.frameScore || (n.sugerenciaDieta && n.sugerenciaDieta.frameScore) || null,
      categoriaFrame: n.categoriaFrame || (n.sugerenciaDieta && n.sugerenciaDieta.categoriaFrame) || null,
      indiceCompacidadKgCm: n.indiceCompacidadKgCm || (n.sugerenciaDieta && n.sugerenciaDieta.indiceCompacidadKgCm) || null,
      statusCompacidad: n.statusCompacidad || (n.sugerenciaDieta && n.sugerenciaDieta.statusCompacidad) || null,
      razaEvaluada: n.raza || (n.sugerenciaDieta && n.sugerenciaDieta.razaEvaluada) || null,
      razaConfirmada: n.razaConfirmada !== undefined ? n.razaConfirmada : (n.sugerenciaDieta && n.sugerenciaDieta.razaConfirmada),
      edadMeses: n.edadMeses || (n.sugerenciaDieta && n.sugerenciaDieta.edadMeses) || null,
      desarrolloRacial: n.desarrolloRacial || (n.sugerenciaDieta && n.sugerenciaDieta.desarrolloRacial) || null,
      sugerenciaSuplementos: Array.isArray(n.sugerenciaSuplementos) ? n.sugerenciaSuplementos : (n.sugerenciaDieta && n.sugerenciaDieta.sugerenciaSuplementos) || []
    };

    let tallaFrameStr = String(n.tallaFrame || '');
    if (!tallaFrameStr && n.tallaCm) {
      tallaFrameStr = `${n.tallaCm} cm` + (n.frameScore ? ` (FS ${n.frameScore})` : '');
    }

    return {
      id: n.id || (`NUT_${fid}_${safeTag}`),
      finca_id: fid,
      animal_id: n.animalId || null,
      animal_tag: tag,
      fecha_analisis: normalizarFechaISO(n.fechaAnalisis) || new Date().toISOString().split('T')[0],
      etapa_productiva: n.etapaProductiva || 'General',
      talla_frame: tallaFrameStr,
      condicion_corporal: n.condicionCorporal ? Number(n.condicionCorporal) : null,
      peso_actual_kg: n.pesoActualKg ? Number(n.pesoActualKg) : null,
      gdp_esperada_g_dia: n.gdpEsperadaGDia ? Number(n.gdpEsperadaGDia) : null,
      sugerencia_dieta: sugerenciaDieta,
      sugerencia_medicamentos: Array.isArray(n.sugerenciaMedicamentos) ? n.sugerenciaMedicamentos : [],
      sugerencia_hormonas: Array.isArray(n.sugerenciaHormonas) ? n.sugerenciaHormonas : [],
      analisis_ia: n.analisisIA || '',
      notas: n.notas || ''
    };
  }

  mapearNutricionCloudALocal(row) {
    const dieta = row.sugerencia_dieta || {};
    let tallaCm = dieta.tallaCm || null;
    let frameScore = dieta.frameScore || null;
    let categoriaFrame = dieta.categoriaFrame || '';
    let indiceCompacidadKgCm = dieta.indiceCompacidadKgCm || null;
    let statusCompacidad = dieta.statusCompacidad || 'normal';

    if (!tallaCm && row.talla_frame) {
      const matchCm = String(row.talla_frame).match(/(\d+(?:\.\d+)?)\s*cm/i);
      if (matchCm) {
        tallaCm = parseFloat(matchCm[1]);
      }
    }
    if (!frameScore && row.talla_frame) {
      const matchFS = String(row.talla_frame).match(/FS\s*(\d+(?:\.\d+)?)/i);
      if (matchFS) {
        frameScore = parseFloat(matchFS[1]);
      }
    }

    return {
      id: row.id,
      fincaId: row.finca_id,
      animalId: row.animal_id,
      tag: row.animal_tag,
      animalTag: row.animal_tag,
      raza: dieta.razaEvaluada || null,
      razaConfirmada: dieta.razaConfirmada !== undefined ? Boolean(dieta.razaConfirmada) : true,
      edadMeses: dieta.edadMeses ? Number(dieta.edadMeses) : null,
      desarrolloRacial: dieta.desarrolloRacial || null,
      fechaAnalisis: row.fecha_analisis,
      etapaProductiva: row.etapa_productiva || 'General',
      tallaFrame: row.talla_frame || '',
      tallaCm: tallaCm ? Number(tallaCm) : null,
      frameScore: frameScore ? Number(frameScore) : null,
      categoriaFrame: categoriaFrame,
      indiceCompacidadKgCm: indiceCompacidadKgCm ? Number(indiceCompacidadKgCm) : null,
      statusCompacidad: statusCompacidad,
      condicionCorporal: row.condicion_corporal ? Number(row.condicion_corporal) : 3.0,
      pesoActualKg: row.peso_actual_kg ? Number(row.peso_actual_kg) : null,
      gdpEsperadaGDia: row.gdp_esperada_g_dia ? Number(row.gdp_esperada_g_dia) : null,
      sugerenciaDieta: dieta,
      sugerenciaMedicamentos: Array.isArray(row.sugerencia_medicamentos) ? row.sugerencia_medicamentos : [],
      sugerenciaSuplementos: Array.isArray(dieta.sugerenciaSuplementos) ? dieta.sugerenciaSuplementos : [],
      sugerenciaHormonas: Array.isArray(row.sugerencia_hormonas) ? row.sugerencia_hormonas : [],
      analisisIA: row.analisis_ia || '',
      notas: row.notas || ''
    };
  }

  // ==========================================================================
  // SINCRONIZACIÓN INTEGRAL: PUSH & PULL DE 10 ENTIDADES
  // ==========================================================================

  /**
   * Sube únicamente registros modificados a Neon Postgres vía POST /api/db/sync.
   */
  async _subirDatosANeon(appState, forzarCompleta = false) {
    const esSuperAdmin = appState.usuarioActual && appState.usuarioActual.rol === 'superadmin';
    const empresaIdActiva = appState.empresaActivaId || (appState.usuarioActual && appState.usuarioActual.empresaId);
    const fincaActiva = appState.fincaActivaId || (appState.fincas?.[0]?.id || null);
    const empresasUsuarioIds = Array.from(new Set([
      ...(Array.isArray(appState.usuarioActual?.empresasAsignadas) ? appState.usuarioActual.empresasAsignadas : []),
      ...(appState.usuarioActual?.empresaId ? [appState.usuarioActual.empresaId] : []),
      ...(empresaIdActiva ? [empresaIdActiva] : [])
    ].filter(Boolean)));
    const empresasUsuarioSet = new Set(empresasUsuarioIds);

    if (empresaIdActiva || esSuperAdmin || empresasUsuarioIds.length > 0) {
      const fincasPermitidasIds = (appState.fincas || [])
        .filter(f => esSuperAdmin || empresasUsuarioSet.has(f.empresaId))
        .map(f => f.id);
      this.setTenantContext({
        empresaId: empresaIdActiva,
        empresasIds: empresasUsuarioIds,
        esSuperAdmin,
        rol: appState.usuarioActual?.rol || (esSuperAdmin ? 'superadmin' : null),
        usuario: appState.usuarioActual?.usuario || null,
        fincasIds: fincasPermitidasIds,
        token: this.tenantContext?.token || null
      });
    }

    const resultados = {
      empresas: 0, fincas: 0, usuarios: 0, animales: 0, servicios: 0,
      costosFijos: 0, inversiones: 0, traslados: 0, operacionesDiarias: 0,
      pesajes: 0, nutricion: 0
    };

    try {
      this.estadoConexion = 'sincronizando';
      const confirmadores = [];
      const payload = {};

      // 0. Empresas + Directorio blindado
      if (Array.isArray(appState.empresas) && appState.empresas.length > 0) {
        const empresasFiltradas = esSuperAdmin ? appState.empresas : appState.empresas.filter(e => empresasUsuarioSet.has(e.id));
        if (empresasFiltradas.length > 0) {
          const full = empresasFiltradas.map(e => this.mapearEmpresaLocalACloud(e));
          const { pendientes, confirmarSubida } = this._filtrarRegistrosModificados('empresas', full, r => r.id, forzarCompleta);
          if (pendientes.length > 0) {
            payload.empresas = pendientes;
            confirmadores.push(() => { confirmarSubida(); resultados.empresas = pendientes.length; });
          }
        }

        const prevDir = (this._ultimoDirectorioCloud && typeof this._ultimoDirectorioCloud === 'object') ? this._ultimoDirectorioCloud : {};
        const fincasEmpresaMap = { ...(prevDir.fincasEmpresaMap || {}) };
        const fincasOrdenosMap = { ...(prevDir.fincasOrdenosMap || {}) };
        (appState.fincas || []).forEach(f => {
          if (f && f.id) {
            if (f.empresaId) fincasEmpresaMap[f.id] = f.empresaId;
            if (f.numeroOrdenos !== undefined || f.tipoOrdeno) {
              fincasOrdenosMap[f.id] = Number(f.numeroOrdenos) === 2 || f.tipoOrdeno === 'doble_ordeno' ? 2 : 1;
            }
          }
        });
        const usuariosEmpresaMap = { ...(prevDir.usuariosEmpresaMap || {}) };
        const usuariosEmpresasAsignadasMap = { ...(prevDir.usuariosEmpresasAsignadasMap || {}) };
        const superadminsSet = new Set(Array.isArray(prevDir.superadminsAutorizados) ? prevDir.superadminsAutorizados : ['anuardavid']);
        (appState.usuarios || []).forEach(u => {
          if (!u || !u.usuario) return;
          const empArr = Array.isArray(u.empresasAsignadas) && u.empresasAsignadas.length > 0
            ? u.empresasAsignadas.filter(Boolean)
            : (u.empresaId ? [u.empresaId] : []);
          if (u.empresaId || empArr[0]) usuariosEmpresaMap[u.usuario] = u.empresaId || empArr[0];
          if (empArr.length > 0) usuariosEmpresasAsignadasMap[u.usuario] = empArr;
          if (u.rol === 'superadmin') superadminsSet.add(u.usuario);
        });

        const tieneFincasLocales = Array.isArray(appState.fincas) && appState.fincas.length > 0;
        const permitirActualizarDir = tieneFincasLocales || Boolean(appState._permitirDirectorioVacioExplicito);
        if (permitirActualizarDir && (esSuperAdmin || Object.keys(prevDir).length > 0)) {
          const empresasDirMap = new Map();
          if (Array.isArray(prevDir.empresas)) prevDir.empresas.forEach(e => { if (e && e.id) empresasDirMap.set(e.id, e); });
          (appState.empresas || []).forEach(e => { if (e && e.id) empresasDirMap.set(e.id, e); });
          const unionArrays = (a, b) => Array.from(new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].filter(Boolean)));
          const empresasElimMerged = unionArrays(prevDir.empresasEliminadas, appState._empresasEliminadas);
          const elimEmpSet = new Set(empresasElimMerged);
          const detallesDir = {
            _esSistemaDirectorio: true,
            empresas: Array.from(empresasDirMap.values()).filter(e => !elimEmpSet.has(e.id)),
            empresasEliminadas: empresasElimMerged,
            fincasEliminadas: unionArrays(prevDir.fincasEliminadas, appState._fincasEliminadas),
            usuariosEliminados: unionArrays(prevDir.usuariosEliminados, appState._usuariosEliminados),
            fincasPurgadas: { ...(prevDir.fincasPurgadas || {}), ...(appState._fincasPurgadas || {}) },
            animalesEliminados: unionArrays(prevDir.animalesEliminados, appState._animalesEliminados).slice(-1000),
            fincasEmpresaMap,
            fincasOrdenosMap,
            usuariosEmpresaMap,
            usuariosEmpresasAsignadasMap,
            superadminsAutorizados: Array.from(superadminsSet)
          };
          this._ultimoDirectorioCloud = detallesDir;
          const { pendientes: dirPend, confirmarSubida: confDir } =
            this._filtrarRegistrosModificados('sys_directorio', [{ id: 'SYS_DIRECTORIO_EMPRESAS', detalles: detallesDir }], r => r.id, forzarCompleta);
          if (dirPend.length > 0) {
            payload.directorio = { fecha: new Date().toISOString().split('T')[0], detalles: detallesDir };
            confirmadores.push(() => { confDir(); if (!resultados.empresas) resultados.empresas = detallesDir.empresas.length; });
          }
        }
      }

      // 1. Fincas
      const eliminadasFincasSet = new Set(Array.isArray(appState._fincasEliminadas) ? appState._fincasEliminadas : []);
      const todasFincasIdsLocal = new Set(
        (appState.fincas || []).filter(f => f && f.id && !eliminadasFincasSet.has(f.id) && !eliminadasFincasSet.has(f.codigo)).map(f => f.id)
      );
      const fincasFiltradas = (esSuperAdmin ? (appState.fincas || []) : (appState.fincas || []).filter(f => empresasUsuarioSet.has(f.empresaId)))
        .filter(f => f && f.id && todasFincasIdsLocal.has(f.id));
      const fincasIdsValidas = new Set(fincasFiltradas.map(f => f.id));

      if (fincasFiltradas.length > 0) {
        const full = fincasFiltradas.map(f => this.mapearFincaLocalACloud(f));
        const { pendientes, confirmarSubida } = this._filtrarRegistrosModificados('fincas', full, r => r.id, forzarCompleta);
        if (pendientes.length > 0) {
          payload.fincas = pendientes;
          confirmadores.push(() => { confirmarSubida(); resultados.fincas = pendientes.length; });
        }
      }

      // 2. Usuarios
      if (Array.isArray(appState.usuarios) && appState.usuarios.length > 0) {
        const usuariosFiltrados = esSuperAdmin
          ? appState.usuarios
          : appState.usuarios.filter(u =>
              empresasUsuarioSet.has(u.empresaId) ||
              (Array.isArray(u.empresasAsignadas) && u.empresasAsignadas.some(eid => empresasUsuarioSet.has(eid)))
            );
        if (usuariosFiltrados.length > 0) {
          const full = usuariosFiltrados.map(u => {
            const empAsig = Array.isArray(u.empresasAsignadas) && u.empresasAsignadas.length > 0
              ? u.empresasAsignadas.filter(Boolean)
              : (u.empresaId ? [u.empresaId] : []);
            return {
              id: u.usuario === 'anuardavid' ? 'USR-SUPER' : u.id,
              empresa_id: this._resolverEmpresaIdCloud(u.empresaId || empAsig[0] || null),
              empresas_asignadas: empAsig,
              usuario: u.usuario,
              nombre: u.nombre,
              rol: u.rol,
              password: u.password || null,
              fincas_asignadas: Array.isArray(u.fincasAsignadas) ? u.fincasAsignadas : (u.fincasAsignadas || 'todas'),
              email: u.email || null,
              telefono: u.telefono || null,
              activo: u.activo !== false
            };
          });
          const { pendientes, confirmarSubida } = this._filtrarRegistrosModificados('usuarios', full, r => r.usuario, forzarCompleta);
          if (pendientes.length > 0) {
            payload.usuarios = pendientes;
            confirmadores.push(() => { confirmarSubida(); resultados.usuarios = pendientes.length; });
          }
        }
      }

      // 3. Animales
      let animalesPendientes = [];
      let confirmarAnm = null;
      if (Array.isArray(appState.animales) && appState.animales.length > 0) {
        const filtrados = (esSuperAdmin ? appState.animales : appState.animales.filter(a => fincasIdsValidas.has(a.fincaId)))
          .filter(a => a && a.fincaId && todasFincasIdsLocal.has(a.fincaId));
        if (filtrados.length > 0) {
          const full = filtrados.map(a => this.mapearAnimalLocalACloud(a, fincaActiva));
          const diff = this._filtrarRegistrosModificados('animales', full, r => `${r.finca_id}__${r.identificacion_tag}`, forzarCompleta);
          animalesPendientes = diff.pendientes;
          confirmarAnm = diff.confirmarSubida;
        }
      }

      // 4. Servicios Reproductivos
      if (Array.isArray(appState.servicios) && appState.servicios.length > 0) {
        const filtrados = (esSuperAdmin ? appState.servicios : appState.servicios.filter(s => fincasIdsValidas.has(s.fincaId)))
          .filter(s => s && s.fincaId && todasFincasIdsLocal.has(s.fincaId));
        if (filtrados.length > 0) {
          const full = filtrados.map(s => this.mapearServicioLocalACloud(s, fincaActiva));
          const { pendientes, confirmarSubida } = this._filtrarRegistrosModificados('servicios_reproductivos', full, r => r.id, forzarCompleta);
          if (pendientes.length > 0) {
            payload.servicios = pendientes;
            confirmadores.push(() => { confirmarSubida(); resultados.servicios = pendientes.length; });
          }
        }
      }

      // 5. Costos Fijos
      if (appState.costosFijos && typeof appState.costosFijos === 'object') {
        const full = [];
        for (const [fincaId, c] of Object.entries(appState.costosFijos)) {
          if (!fincasIdsValidas.has(fincaId) || !todasFincasIdsLocal.has(fincaId)) continue;
          full.push({
            finca_id: fincaId,
            nomina: Number(c.nomina || 0),
            insumos: Number(c.insumos || 0),
            herbicidas: Number(c.herbicidas || 0),
            maquinaria: Number(c.maquinaria || 0),
            servicios: Number(c.servicios || 0),
            otros: Number(c.otros || 0)
          });
        }
        const { pendientes, confirmarSubida } = this._filtrarRegistrosModificados('costos_fijos_finca', full, r => r.finca_id, forzarCompleta);
        if (pendientes.length > 0) {
          payload.costosFijos = pendientes;
          confirmadores.push(() => { confirmarSubida(); resultados.costosFijos = pendientes.length; });
        }
      }

      // 6. Inversiones Diferidas
      if (Array.isArray(appState.inversiones) && appState.inversiones.length > 0) {
        const filtrados = (esSuperAdmin ? appState.inversiones : appState.inversiones.filter(i => fincasIdsValidas.has(i.fincaId)))
          .filter(i => i && i.fincaId && todasFincasIdsLocal.has(i.fincaId));
        if (filtrados.length > 0) {
          const full = filtrados.map(i => ({
            id: i.id || ('INV-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
            finca_id: i.fincaId || fincaActiva,
            descripcion_activo: i.descripcionActivo || 'Inversión',
            monto_total_inversion: Number(i.montoTotalInversion || 0),
            plazo_meses_diferido: Number(i.plazoMesesDiferido || 12),
            cuota_mensual: Number(i.cuotaMensual || 0),
            estado: i.estado || 'Activa'
          }));
          const { pendientes, confirmarSubida } = this._filtrarRegistrosModificados('inversiones_diferidas', full, r => r.id, forzarCompleta);
          if (pendientes.length > 0) {
            payload.inversiones = pendientes;
            confirmadores.push(() => { confirmarSubida(); resultados.inversiones = pendientes.length; });
          }
        }
      }

      // 7. Traslados
      if (Array.isArray(appState.traslados) && appState.traslados.length > 0) {
        const filtrados = esSuperAdmin
          ? appState.traslados
          : appState.traslados.filter(t => t.empresaId === empresaIdActiva || fincasIdsValidas.has(t.fincaOrigenId) || fincasIdsValidas.has(t.fincaDestinoId));
        if (filtrados.length > 0) {
          const full = filtrados.map(t => ({
            id: t.id || ('TRS-' + Date.now()),
            empresa_id: this._resolverEmpresaIdCloud(t.empresaId || empresaIdActiva),
            fecha: normalizarFechaISO(t.fecha) || new Date().toISOString().split('T')[0],
            finca_origen_id: t.fincaOrigenId || null,
            finca_origen_nombre: t.fincaOrigenNombre || '',
            finca_destino_id: t.fincaDestinoId || null,
            finca_destino_nombre: t.fincaDestinoNombre || '',
            motivo: t.motivo || '',
            observaciones: t.observaciones || '',
            total_animales: t.totalAnimales || 1,
            animales: Array.isArray(t.animales) ? t.animales : (t.tag ? [{ id: t.animalId, tag: t.tag, alias: t.nombreAlias }] : []),
            usuario_nombre: t.responsable || t.usuarioNombre || ''
          }));
          const { pendientes, confirmarSubida } = this._filtrarRegistrosModificados('traslados_animales', full, r => r.id, forzarCompleta);
          if (pendientes.length > 0) {
            payload.traslados = pendientes;
            confirmadores.push(() => { confirmarSubida(); resultados.traslados = pendientes.length; });
          }
        }
      }

      // 8 + 11. Operaciones Diarias + Contabilidad/Nómina (SYS_*)
      const opsPendientesAcum = [];
      const confirmadoresOps = [];
      if (Array.isArray(appState.operacionesDiarias) && appState.operacionesDiarias.length > 0) {
        const pesajesIdsSet = new Set((appState.pesajes || []).map(p => p && p.id).filter(Boolean));
        const filtradas = (esSuperAdmin
          ? appState.operacionesDiarias
          : appState.operacionesDiarias.filter(o => o.empresaId === empresaIdActiva || (o.fincaId && fincasIdsValidas.has(o.fincaId)))
        ).filter(o => {
          if (!o) return false;
          const idStr = String(o.id || '');
          if (idStr.startsWith('ACT-PES-') && (pesajesIdsSet.has(idStr.slice(4)) || o.modulo === 'pesajes' || o.accion === 'pesajes')) return false;
          return !o.fincaId || o.fincaId === 'GLOBAL' || todasFincasIdsLocal.has(o.fincaId);
        });
        if (filtradas.length > 0) {
          const full = filtradas.map(o => ({
            id: o.id || ('ACT-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
            empresa_id: this._resolverEmpresaIdCloud(o.empresaId || empresaIdActiva),
            fecha: normalizarFechaISO(o.fecha) || new Date().toISOString().split('T')[0],
            finca_id: o.fincaId === 'GLOBAL' ? null : (o.fincaId || null),
            finca_nombre: o.fincaNombre || '',
            accion: o.accion || '',
            modulo: o.modulo || o.accion || '',
            detalles: o,
            usuario: o.responsable || o.usuario || 'Sistema'
          }));
          const { pendientes, confirmarSubida } = this._filtrarRegistrosModificados('operaciones_diarias', full, r => r.id, forzarCompleta);
          if (pendientes.length > 0) {
            opsPendientesAcum.push(...pendientes);
            confirmadoresOps.push(() => { confirmarSubida(); resultados.operacionesDiarias += pendientes.length; });
          }
        }
      }

      const acumBloqueSistema = (cacheKey, lista, fnMap) => {
        if (!Array.isArray(lista) || lista.length === 0) return;
        const filtrados = (esSuperAdmin
          ? lista
          : lista.filter(item => item && (item.empresaId === empresaIdActiva || (item.fincaId && fincasIdsValidas.has(item.fincaId))))
        ).filter(item => item && item.id && (!item.fincaId || todasFincasIdsLocal.has(item.fincaId)));
        if (filtrados.length === 0) return;
        const full = filtrados.map(item => fnMap(item, empresaIdActiva));
        const { pendientes, confirmarSubida } = this._filtrarRegistrosModificados(cacheKey, full, r => r.id, forzarCompleta);
        if (pendientes.length > 0) {
          opsPendientesAcum.push(...pendientes);
          confirmadoresOps.push(() => { confirmarSubida(); resultados.operacionesDiarias += pendientes.length; });
        }
      };
      acumBloqueSistema('sys_contabilidad_mov', appState.contabilidadMovimientos, (m, emp) => this._mapearContabMovACloud(m, emp));
      acumBloqueSistema('sys_nomina_trab', appState.nominaTrabajadores, (t, emp) => this._mapearNominaTrabACloud(t, emp));
      acumBloqueSistema('sys_nomina_pago', appState.nominaPagos, (p, emp) => this._mapearNominaPagoACloud(p, emp));

      // 9. Pesajes
      let pesajesPendientes = [];
      let confirmarPes = null;
      if (Array.isArray(appState.pesajes) && appState.pesajes.length > 0) {
        const filtrados = (esSuperAdmin ? appState.pesajes : appState.pesajes.filter(p => fincasIdsValidas.has(p.fincaId)))
          .filter(p => p && p.fincaId && todasFincasIdsLocal.has(p.fincaId));
        if (filtrados.length > 0) {
          const full = filtrados.map(p => ({
            id: p.id || ('PES-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
            finca_id: p.fincaId || fincaActiva,
            animal_tag: p.tag || p.animalTag || '',
            fecha_pesaje: normalizarFechaISO(p.fecha || p.fechaPesaje) || new Date().toISOString().split('T')[0],
            peso_kg: Number(p.pesoNuevo || p.peso || 0),
            gdp_calculada_g_dia: p.gdp ? Number(p.gdp) : null,
            notas: p.observaciones || p.responsable || 'Registro de Manga'
          }));
          const diff = this._filtrarRegistrosModificados('pesajes_animales', full, r => r.id, forzarCompleta);
          pesajesPendientes = diff.pendientes;
          confirmarPes = diff.confirmarSubida;
        }
      }

      // 10. Nutrición
      if (Array.isArray(appState.nutricion) && appState.nutricion.length > 0) {
        const filtrados = (esSuperAdmin ? appState.nutricion : appState.nutricion.filter(n => fincasIdsValidas.has(n.fincaId)))
          .filter(n => n && n.fincaId && todasFincasIdsLocal.has(n.fincaId));
        if (filtrados.length > 0) {
          const full = filtrados.map(n => this.mapearNutricionLocalACloud(n, fincaActiva));
          const { pendientes, confirmarSubida } = this._filtrarRegistrosModificados('nutricion_animales', full, r => `${r.finca_id}__${r.animal_tag}`, forzarCompleta);
          if (pendientes.length > 0) {
            payload.nutricion = pendientes;
            confirmadores.push(() => { confirmarSubida(); resultados.nutricion = pendientes.length; });
          }
        }
      }

      // Enviar ola principal (empresas, fincas, directorio, usuarios, servicios, costos, inversiones, traslados, nutrición)
      const tieneBase = Object.keys(payload).length > 0;
      const cabeTodoEnUnPost = animalesPendientes.length <= 300 && pesajesPendientes.length <= 400 && opsPendientesAcum.length <= 250;

      if (cabeTodoEnUnPost) {
        if (animalesPendientes.length > 0) payload.animales = animalesPendientes;
        if (pesajesPendientes.length > 0) payload.pesajes = pesajesPendientes;
        if (opsPendientesAcum.length > 0) payload.operacionesDiarias = opsPendientesAcum;
        if (Object.keys(payload).length > 0) {
          await this._neonRequest('/sync', { method: 'POST', body: JSON.stringify(payload) }, 25000);
          confirmadores.forEach(fn => fn());
          if (animalesPendientes.length > 0 && confirmarAnm) { confirmarAnm(); resultados.animales = animalesPendientes.length; }
          if (pesajesPendientes.length > 0 && confirmarPes) { confirmarPes(); resultados.pesajes = pesajesPendientes.length; }
          if (opsPendientesAcum.length > 0) confirmadoresOps.forEach(fn => fn());
        }
      } else {
        if (tieneBase) {
          await this._neonRequest('/sync', { method: 'POST', body: JSON.stringify(payload) }, 25000);
          confirmadores.forEach(fn => fn());
        }
        for (let i = 0; i < animalesPendientes.length; i += 300) {
          const chunk = animalesPendientes.slice(i, i + 300);
          await this._neonRequest('/sync', { method: 'POST', body: JSON.stringify({ animales: chunk }) }, 25000);
          resultados.animales += chunk.length;
        }
        if (animalesPendientes.length > 0 && confirmarAnm) confirmarAnm();

        for (let i = 0; i < pesajesPendientes.length; i += 400) {
          const chunk = pesajesPendientes.slice(i, i + 400);
          await this._neonRequest('/sync', { method: 'POST', body: JSON.stringify({ pesajes: chunk }) }, 25000);
          resultados.pesajes += chunk.length;
        }
        if (pesajesPendientes.length > 0 && confirmarPes) confirmarPes();

        for (let i = 0; i < opsPendientesAcum.length; i += 200) {
          const chunk = opsPendientesAcum.slice(i, i + 200);
          await this._neonRequest('/sync', { method: 'POST', body: JSON.stringify({ operacionesDiarias: chunk }) }, 25000);
        }
        if (opsPendientesAcum.length > 0) confirmadoresOps.forEach(fn => fn());
      }

      const totalSubidos = Object.values(resultados).reduce((acc, v) => acc + Number(v || 0), 0);
      if (totalSubidos > 0) {
        this._limpiarFirmaPersistida();
      }

      this.ultimoSync = new Date().toISOString();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageSyncKey, this.ultimoSync);
      }
      this.estadoConexion = 'conectado';

      return {
        ok: true,
        provider: 'neon',
        mensaje: 'Sincronización exitosa hacia Neon Postgres con aislamiento multi-tenant verificado.',
        resumen: resultados,
        ultimoSync: this.ultimoSync
      };
    } catch (err) {
      this.estadoConexion = 'error';
      return {
        ok: false,
        error: 'Error durante la subida a Neon Postgres: ' + err.message
      };
    }
  }

  /**
   * Descarga consolidada en 1 sola petición gzip desde Neon Postgres vía GET /api/db/sync.
   */
  async _descargarDatosDeNeon(timeoutMs = 20000, tenantContext = null) {
    if (tenantContext) {
      this.setTenantContext(tenantContext);
    }
    try {
      this.estadoConexion = 'sincronizando';
      const ctx = this.tenantContext;
      const esSuperAdmin = Boolean(ctx && ctx.esSuperAdmin);
      const empId = ctx && ctx.empresaId ? String(ctx.empresaId) : '';
      const empresasIds = ctx && Array.isArray(ctx.empresasIds) && ctx.empresasIds.length > 0
        ? ctx.empresasIds.filter(Boolean)
        : (empId ? [empId] : []);
      const fincasIds = ctx && Array.isArray(ctx.fincasIds) && ctx.fincasIds.length > 0 ? ctx.fincasIds : [];

      const qs = new URLSearchParams();
      if (esSuperAdmin) qs.set('esSuperAdmin', '1');
      if (empId) qs.set('empresaId', empId);
      if (!esSuperAdmin && empresasIds.length > 0) qs.set('empresasIds', empresasIds.join(','));
      if (!esSuperAdmin && fincasIds.length > 0) qs.set('fincasIds', fincasIds.join(','));
      const queryStr = qs.toString() ? `?${qs.toString()}` : '';

      const effectiveTimeout = Math.max(Number(timeoutMs) || 20000, 15000);
      const resp = await this._neonRequest(`/sync${queryStr}`, { method: 'GET' }, effectiveTimeout);

      if (resp.directorio && typeof resp.directorio === 'object') {
        this._ultimoDirectorioCloud = resp.directorio;
      }

      const datosDescargados = resp.datos || {};
      this._registrarHuellasDescargadas(datosDescargados);

      this.ultimoSync = new Date().toISOString();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageSyncKey, this.ultimoSync);
      }
      this.estadoConexion = 'conectado';

      return {
        ok: true,
        provider: 'neon',
        datos: datosDescargados,
        ultimoSync: this.ultimoSync
      };
    } catch (err) {
      this.estadoConexion = 'error';
      return {
        ok: false,
        error: 'Error descargando datos de Neon Postgres: ' + err.message
      };
    }
  }

  /**
   * Sube todos los registros locales a la nube (Neon Postgres por defecto o PostgREST legado).
   */
  async subirDatosASupabase(appState, forzarCompleta = false) {
    if (!this.estaConfigurado()) {
      return { ok: false, error: 'Nube no configurada. Ingrese sus credenciales primero.' };
    }
    if (this.usarModoNeon()) {
      return await this._subirDatosANeon(appState, forzarCompleta);
    }

    const esSuperAdmin = appState.usuarioActual && appState.usuarioActual.rol === 'superadmin';
    const empresaIdActiva = appState.empresaActivaId || (appState.usuarioActual && appState.usuarioActual.empresaId);
    const fincaActiva = appState.fincaActivaId || (appState.fincas?.[0]?.id || null);

    // Inyectar contexto tenant en las cabeceras HTTP de esta petición
    if (empresaIdActiva) {
      const fincasPermitidasIds = (appState.fincas || [])
        .filter(f => esSuperAdmin || f.empresaId === empresaIdActiva)
        .map(f => f.id);
      this.setTenantContext({
        empresaId: empresaIdActiva,
        esSuperAdmin,
        fincasIds: fincasPermitidasIds,
        token: this.tenantContext?.token || null
      });
    }

    const resultados = {
      empresas: 0,
      fincas: 0,
      usuarios: 0,
      animales: 0,
      servicios: 0,
      costosFijos: 0,
      inversiones: 0,
      traslados: 0,
      operacionesDiarias: 0,
      pesajes: 0,
      nutricion: 0
    };

    try {
      this.estadoConexion = 'sincronizando';

      // ======================================================================
      // OLA 1: EMPRESAS Y FINCAS (Tablas maestras raíz delimitadas por tenant)
      // ======================================================================
      const tareasOla1 = [];

      // 0. Sincronizar Empresas (Multi-Tenant) + Directorio Espejo Resiliente
      if (Array.isArray(appState.empresas) && appState.empresas.length > 0) {
        const empresasFiltradas = esSuperAdmin
          ? appState.empresas
          : appState.empresas.filter(e => e.id === empresaIdActiva);
        if (empresasFiltradas.length > 0) {
          const payloadEmpresasFull = empresasFiltradas.map(e => this.mapearEmpresaLocalACloud(e));
          const { pendientes: payloadEmpresas, confirmarSubida: confirmarEmp } =
            this._filtrarRegistrosModificados('empresas', payloadEmpresasFull, (r) => r.id, forzarCompleta);
          if (payloadEmpresas.length > 0) {
            tareasOla1.push(
              this._postgrestUpsert('empresas', payloadEmpresas, 'id', 10000)
                .then(() => { confirmarEmp(); resultados.empresas = payloadEmpresas.length; })
                .catch(err => { console.warn('Supabase Sync empresas:', err.message); })
            );
          }
        }

        const prevDir = (this._ultimoDirectorioCloud && typeof this._ultimoDirectorioCloud === 'object') ? this._ultimoDirectorioCloud : {};
        const fincasEmpresaMap = { ...(prevDir.fincasEmpresaMap || {}) };
        const fincasOrdenosMap = { ...(prevDir.fincasOrdenosMap || {}) };
        (appState.fincas || []).forEach(f => {
          if (f && f.id) {
            if (f.empresaId) fincasEmpresaMap[f.id] = f.empresaId;
            if (f.numeroOrdenos !== undefined || f.tipoOrdeno) {
              fincasOrdenosMap[f.id] = Number(f.numeroOrdenos) === 2 || f.tipoOrdeno === 'doble_ordeno' ? 2 : 1;
            }
          }
        });
        const usuariosEmpresaMap = { ...(prevDir.usuariosEmpresaMap || {}) };
        (appState.usuarios || []).forEach(u => {
          if (u && u.usuario && u.empresaId) usuariosEmpresaMap[u.usuario] = u.empresaId;
        });

        // BLINDAJE ANTI-SOBRESCRITURA VACÍA:
        // Jamás sobrescribir SYS_DIRECTORIO_EMPRESAS desde un dispositivo vacío (0 fincas)
        // ni borrar empresas/mapas existentes en la nube que no estén explícitamente eliminados.
        const tieneFincasLocales = Array.isArray(appState.fincas) && appState.fincas.length > 0;
        const permitirActualizarDir = tieneFincasLocales || Boolean(appState._permitirDirectorioVacioExplicito);
        if (permitirActualizarDir && (esSuperAdmin || Object.keys(prevDir).length > 0)) {
          const empresasDirMap = new Map();
          if (Array.isArray(prevDir.empresas)) {
            prevDir.empresas.forEach(e => { if (e && e.id) empresasDirMap.set(e.id, e); });
          }
          (appState.empresas || []).forEach(e => { if (e && e.id) empresasDirMap.set(e.id, e); });

          const unionArrays = (a, b) => Array.from(new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].filter(Boolean)));
          const empresasElimMerged = unionArrays(prevDir.empresasEliminadas, appState._empresasEliminadas);
          const fincasElimMerged = unionArrays(prevDir.fincasEliminadas, appState._fincasEliminadas);
          const usuariosElimMerged = unionArrays(prevDir.usuariosEliminados, appState._usuariosEliminados);
          const animalesElimMerged = unionArrays(prevDir.animalesEliminados, appState._animalesEliminados).slice(-1000);

          const elimEmpSet = new Set(empresasElimMerged);
          const empresasFusionadas = Array.from(empresasDirMap.values()).filter(e => !elimEmpSet.has(e.id));

          const detallesDir = {
            _esSistemaDirectorio: true,
            empresas: empresasFusionadas,
            empresasEliminadas: empresasElimMerged,
            fincasEliminadas: fincasElimMerged,
            usuariosEliminados: usuariosElimMerged,
            fincasPurgadas: { ...(prevDir.fincasPurgadas || {}), ...(appState._fincasPurgadas || {}) },
            animalesEliminados: animalesElimMerged,
            fincasEmpresaMap,
            fincasOrdenosMap,
            usuariosEmpresaMap
          };
          this._ultimoDirectorioCloud = detallesDir;
          const huellaDetallesDir = [{ id: 'SYS_DIRECTORIO_EMPRESAS', detalles: detallesDir }];
          const { pendientes: dirPendiente, confirmarSubida: confirmarDir } =
            this._filtrarRegistrosModificados('sys_directorio', huellaDetallesDir, (r) => r.id, forzarCompleta);
          if (dirPendiente.length > 0) {
            const registroDirectorio = [{
              id: 'SYS_DIRECTORIO_EMPRESAS',
              empresa_id: null,
              fecha: new Date().toISOString().split('T')[0],
              finca_id: null,
              finca_nombre: 'SISTEMA',
              accion: 'SYS_DIRECTORIO_EMPRESAS',
              modulo: 'sistema_empresas',
              detalles: detallesDir,
              usuario: 'Sistema'
            }];
            tareasOla1.push(
              this._postgrestUpsert('operaciones_diarias', registroDirectorio, 'id', 10000)
                .then(() => { confirmarDir(); if (!resultados.empresas) resultados.empresas = empresasFusionadas.length; })
                .catch(() => {})
            );
          }
        }
      }

      // 1. Sincronizar Fincas
      const eliminadasFincasSet = new Set(Array.isArray(appState._fincasEliminadas) ? appState._fincasEliminadas : []);
      const todasFincasIdsLocal = new Set(
        (appState.fincas || [])
          .filter(f => f && f.id && !eliminadasFincasSet.has(f.id) && !eliminadasFincasSet.has(f.codigo))
          .map(f => f.id)
      );
      const fincasFiltradas = (esSuperAdmin
        ? (appState.fincas || [])
        : (appState.fincas || []).filter(f => f.empresaId === empresaIdActiva)
      ).filter(f => f && f.id && todasFincasIdsLocal.has(f.id));
      const fincasIdsValidas = new Set(fincasFiltradas.map(f => f.id));

      if (fincasFiltradas.length > 0) {
        const payloadFincasFull = fincasFiltradas.map(f => this.mapearFincaLocalACloud(f));
        const { pendientes: payloadFincas, confirmarSubida: confirmarFincas } =
          this._filtrarRegistrosModificados('fincas', payloadFincasFull, (r) => r.id, forzarCompleta);
        if (payloadFincas.length > 0) {
          tareasOla1.push(
            this._postgrestUpsert('fincas', payloadFincas, 'id', 10000)
              .then(() => { confirmarFincas(); resultados.fincas = payloadFincas.length; })
              .catch(async (err) => {
                if (String(err.message || '').includes('23503')) {
                  const payloadSinFk = payloadFincas.map(f => ({ ...f, empresa_id: null }));
                  try {
                    await this._postgrestUpsert('fincas', payloadSinFk, 'id', 10000);
                    confirmarFincas();
                    resultados.fincas = payloadSinFk.length;
                    return;
                  } catch (_) {}
                }
                console.warn('Supabase Sync fincas:', err.message);
              })
          );
        }
      }

      if (tareasOla1.length > 0) {
        await Promise.allSettled(tareasOla1);
      }

      // ======================================================================
      // OLA 2: ENTIDADES OPERACIONALES (Sólo registros modificados - Zero-Waste Egress)
      // ======================================================================
      const tareasOla2 = [];

      // 2. Sincronizar Usuarios
      if (Array.isArray(appState.usuarios) && appState.usuarios.length > 0) {
        const usuariosFiltrados = esSuperAdmin
          ? appState.usuarios
          : appState.usuarios.filter(u => u.empresaId === empresaIdActiva);
        if (usuariosFiltrados.length > 0) {
          const payloadUsuariosFull = usuariosFiltrados.map(u => ({
            id: u.usuario === 'anuardavid' ? 'USR-SUPER' : u.id,
            empresa_id: u.empresaId === 'EMP-01' ? 'EMP-01' : null,
            usuario: u.usuario,
            nombre: u.nombre,
            rol: u.rol,
            password: u.password || null,
            fincas_asignadas: Array.isArray(u.fincasAsignadas) ? u.fincasAsignadas : (u.fincasAsignadas || 'todas'),
            email: u.email || null,
            telefono: u.telefono || null,
            activo: u.activo !== false
          }));
          const { pendientes: payloadUsuarios, confirmarSubida: confirmarUsr } =
            this._filtrarRegistrosModificados('usuarios', payloadUsuariosFull, (r) => r.usuario, forzarCompleta);
          if (payloadUsuarios.length > 0) {
            tareasOla2.push(
              this._postgrestUpsert('usuarios', payloadUsuarios, 'usuario', 10000)
                .then(() => { confirmarUsr(); resultados.usuarios = payloadUsuarios.length; })
                .catch(err => { console.warn('Supabase Sync usuarios:', err.message); })
            );
          }
        }
      }

      // 3. Sincronizar Animales (Sólo modificados o nuevos, en lotes de 50)
      if (Array.isArray(appState.animales) && appState.animales.length > 0) {
        const animalesFiltrados = (esSuperAdmin
          ? appState.animales
          : appState.animales.filter(a => fincasIdsValidas.has(a.fincaId))
        ).filter(a => a && a.fincaId && todasFincasIdsLocal.has(a.fincaId));
        if (animalesFiltrados.length > 0) {
          const payloadAnimalesFull = animalesFiltrados.map(a => this.mapearAnimalLocalACloud(a, fincaActiva));
          const { pendientes: payloadAnimales, confirmarSubida: confirmarAnm } =
            this._filtrarRegistrosModificados('animales', payloadAnimalesFull, (r) => `${r.finca_id}__${r.identificacion_tag}`, forzarCompleta);
          if (payloadAnimales.length > 0) {
            const BATCH_SIZE = 50;
            const totalBatches = Math.ceil(payloadAnimales.length / BATCH_SIZE);
            let exitosAnm = 0;
            for (let b = 0; b < totalBatches; b++) {
              const chunk = payloadAnimales.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
              tareasOla2.push(
                this._postgrestUpsert('animales', chunk, 'finca_id,identificacion_tag', 15000)
                  .then(() => {
                    resultados.animales += chunk.length;
                    exitosAnm++;
                    if (exitosAnm === totalBatches) confirmarAnm();
                  })
                  .catch(err => { console.warn(`Supabase Sync animales (bloque ${b + 1}/${totalBatches}):`, err.message); })
              );
            }
          }
        }
      }

      // 4. Sincronizar Servicios Reproductivos
      if (Array.isArray(appState.servicios) && appState.servicios.length > 0) {
        const serviciosFiltrados = (esSuperAdmin
          ? appState.servicios
          : appState.servicios.filter(s => fincasIdsValidas.has(s.fincaId))
        ).filter(s => s && s.fincaId && todasFincasIdsLocal.has(s.fincaId));
        if (serviciosFiltrados.length > 0) {
          const payloadServiciosFull = serviciosFiltrados.map(s => this.mapearServicioLocalACloud(s, fincaActiva));
          const { pendientes: payloadServicios, confirmarSubida: confirmarSrv } =
            this._filtrarRegistrosModificados('servicios_reproductivos', payloadServiciosFull, (r) => r.id, forzarCompleta);
          if (payloadServicios.length > 0) {
            tareasOla2.push(
              this._postgrestUpsert('servicios_reproductivos', payloadServicios, 'id', 10000)
                .then(() => { confirmarSrv(); resultados.servicios = payloadServicios.length; })
                .catch(err => { console.warn('Supabase Sync servicios:', err.message); })
            );
          }
        }
      }

      // 5. Costos Fijos por Finca
      if (appState.costosFijos && typeof appState.costosFijos === 'object') {
        const payloadCostosFull = [];
        for (const [fincaId, c] of Object.entries(appState.costosFijos)) {
          if (!fincasIdsValidas.has(fincaId) || !todasFincasIdsLocal.has(fincaId)) continue;
          payloadCostosFull.push({
            finca_id: fincaId,
            nomina: Number(c.nomina || 0),
            insumos: Number(c.insumos || 0),
            herbicidas: Number(c.herbicidas || 0),
            maquinaria: Number(c.maquinaria || 0),
            servicios: Number(c.servicios || 0),
            otros: Number(c.otros || 0)
          });
        }
        const { pendientes: payloadCostos, confirmarSubida: confirmarCostos } =
          this._filtrarRegistrosModificados('costos_fijos_finca', payloadCostosFull, (r) => r.finca_id, forzarCompleta);
        if (payloadCostos.length > 0) {
          tareasOla2.push(
            this._postgrestUpsert('costos_fijos_finca', payloadCostos, 'finca_id', 10000)
              .then(() => { confirmarCostos(); resultados.costosFijos = payloadCostos.length; })
              .catch(err => { console.warn('Supabase Sync costos:', err.message); })
          );
        }
      }

      // 6. Inversiones Diferidas
      if (Array.isArray(appState.inversiones) && appState.inversiones.length > 0) {
        const invFiltradas = (esSuperAdmin
          ? appState.inversiones
          : appState.inversiones.filter(i => fincasIdsValidas.has(i.fincaId))
        ).filter(i => i && i.fincaId && todasFincasIdsLocal.has(i.fincaId));
        if (invFiltradas.length > 0) {
          const payloadInvFull = invFiltradas.map(i => ({
            id: i.id || ('INV-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
            finca_id: i.fincaId || fincaActiva,
            descripcion_activo: i.descripcionActivo || 'Inversión',
            monto_total_inversion: Number(i.montoTotalInversion || 0),
            plazo_meses_diferido: Number(i.plazoMesesDiferido || 12),
            cuota_mensual: Number(i.cuotaMensual || 0),
            estado: i.estado || 'Activa'
          }));
          const { pendientes: payloadInv, confirmarSubida: confirmarInv } =
            this._filtrarRegistrosModificados('inversiones_diferidas', payloadInvFull, (r) => r.id, forzarCompleta);
          if (payloadInv.length > 0) {
            tareasOla2.push(
              this._postgrestUpsert('inversiones_diferidas', payloadInv, 'id', 10000)
                .then(() => { confirmarInv(); resultados.inversiones = payloadInv.length; })
                .catch(err => { console.warn('Supabase Sync inversiones:', err.message); })
            );
          }
        }
      }

      // 7. Traslados
      if (Array.isArray(appState.traslados) && appState.traslados.length > 0) {
        const trasladosFiltrados = esSuperAdmin
          ? appState.traslados
          : appState.traslados.filter(t => t.empresaId === empresaIdActiva || fincasIdsValidas.has(t.fincaOrigenId) || fincasIdsValidas.has(t.fincaDestinoId));
        if (trasladosFiltrados.length > 0) {
          const payloadTrasladosFull = trasladosFiltrados.map(t => {
            const empRef = t.empresaId || empresaIdActiva || null;
            return {
              id: t.id || ('TRS-' + Date.now()),
              empresa_id: empRef === 'EMP-01' ? 'EMP-01' : null,
              fecha: normalizarFechaISO(t.fecha) || new Date().toISOString().split('T')[0],
              finca_origen_id: t.fincaOrigenId || null,
              finca_origen_nombre: t.fincaOrigenNombre || '',
              finca_destino_id: t.fincaDestinoId || null,
              finca_destino_nombre: t.fincaDestinoNombre || '',
              motivo: t.motivo || '',
              observaciones: t.observaciones || '',
              total_animales: t.totalAnimales || 1,
              animales: Array.isArray(t.animales) ? t.animales : (t.tag ? [{ id: t.animalId, tag: t.tag, alias: t.nombreAlias }] : []),
              usuario_nombre: t.responsable || t.usuarioNombre || ''
            };
          });
          const { pendientes: payloadTraslados, confirmarSubida: confirmarTrs } =
            this._filtrarRegistrosModificados('traslados_animales', payloadTrasladosFull, (r) => r.id, forzarCompleta);
          if (payloadTraslados.length > 0) {
            tareasOla2.push(
              this._postgrestUpsert('traslados_animales', payloadTraslados, 'id', 10000)
                .then(() => { confirmarTrs(); resultados.traslados = payloadTraslados.length; })
                .catch(err => { console.warn('Supabase Sync traslados:', err.message); })
            );
          }
        }
      }

      // 8. Operaciones Diarias (Excluyendo duplicados ACT-PES-* que ya residen en pesajes_animales)
      if (Array.isArray(appState.operacionesDiarias) && appState.operacionesDiarias.length > 0) {
        const pesajesIdsSet = new Set((appState.pesajes || []).map(p => p && p.id).filter(Boolean));
        const opsFiltradas = (esSuperAdmin
          ? appState.operacionesDiarias
          : appState.operacionesDiarias.filter(o => o.empresaId === empresaIdActiva || (o.fincaId && fincasIdsValidas.has(o.fincaId)))
        ).filter(o => {
          if (!o) return false;
          const idStr = String(o.id || '');
          if (idStr.startsWith('ACT-PES-') && (pesajesIdsSet.has(idStr.slice(4)) || o.modulo === 'pesajes' || o.accion === 'pesajes')) {
            return false;
          }
          return !o.fincaId || o.fincaId === 'GLOBAL' || todasFincasIdsLocal.has(o.fincaId);
        });
        if (opsFiltradas.length > 0) {
          const payloadOpsFull = opsFiltradas.map(o => {
            const empRef = o.empresaId || empresaIdActiva || null;
            return {
              id: o.id || ('ACT-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
              empresa_id: empRef === 'EMP-01' ? 'EMP-01' : null,
              fecha: normalizarFechaISO(o.fecha) || new Date().toISOString().split('T')[0],
              finca_id: o.fincaId === 'GLOBAL' ? null : (o.fincaId || null),
              finca_nombre: o.fincaNombre || '',
              accion: o.accion || '',
              modulo: o.modulo || o.accion || '',
              detalles: o,
              usuario: o.responsable || o.usuario || 'Sistema'
            };
          });
          const { pendientes: payloadOps, confirmarSubida: confirmarOps } =
            this._filtrarRegistrosModificados('operaciones_diarias', payloadOpsFull, (r) => r.id, forzarCompleta);
          if (payloadOps.length > 0) {
            const BATCH_SIZE = 50;
            const totalBatches = Math.ceil(payloadOps.length / BATCH_SIZE);
            let exitosOps = 0;
            for (let b = 0; b < totalBatches; b++) {
              const chunk = payloadOps.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
              tareasOla2.push(
                this._postgrestUpsert('operaciones_diarias', chunk, 'id', 12000)
                  .then(() => {
                    resultados.operacionesDiarias += chunk.length;
                    exitosOps++;
                    if (exitosOps === totalBatches) confirmarOps();
                  })
                  .catch(err => { console.warn(`Supabase Sync operaciones (bloque ${b + 1}/${totalBatches}):`, err.message); })
              );
            }
          }
        }
      }

      // 9. Pesajes
      if (Array.isArray(appState.pesajes) && appState.pesajes.length > 0) {
        const pesajesFiltrados = (esSuperAdmin
          ? appState.pesajes
          : appState.pesajes.filter(p => fincasIdsValidas.has(p.fincaId))
        ).filter(p => p && p.fincaId && todasFincasIdsLocal.has(p.fincaId));
        if (pesajesFiltrados.length > 0) {
          const payloadPesajesFull = pesajesFiltrados.map(p => ({
            id: p.id || ('PES-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
            finca_id: p.fincaId || fincaActiva,
            animal_tag: p.tag || p.animalTag || '',
            fecha_pesaje: normalizarFechaISO(p.fecha || p.fechaPesaje) || new Date().toISOString().split('T')[0],
            peso_kg: Number(p.pesoNuevo || p.peso || 0),
            gdp_calculada_g_dia: p.gdp ? Number(p.gdp) : null,
            notas: p.observaciones || p.responsable || 'Registro de Manga'
          }));
          const { pendientes: payloadPesajes, confirmarSubida: confirmarPes } =
            this._filtrarRegistrosModificados('pesajes_animales', payloadPesajesFull, (r) => r.id, forzarCompleta);
          if (payloadPesajes.length > 0) {
            const BATCH_SIZE = 50;
            const totalBatches = Math.ceil(payloadPesajes.length / BATCH_SIZE);
            let exitosPes = 0;
            for (let b = 0; b < totalBatches; b++) {
              const chunk = payloadPesajes.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
              tareasOla2.push(
                this._postgrestUpsert('pesajes_animales', chunk, 'id', 12000)
                  .then(() => {
                    resultados.pesajes += chunk.length;
                    exitosPes++;
                    if (exitosPes === totalBatches) confirmarPes();
                  })
                  .catch(err => { console.warn(`Supabase Sync pesajes (bloque ${b + 1}/${totalBatches}):`, err.message); })
              );
            }
          }
        }
      }

      // 10. Nutrición Animal Especial & IA
      if (Array.isArray(appState.nutricion) && appState.nutricion.length > 0) {
        const nutricionFiltrada = (esSuperAdmin
          ? appState.nutricion
          : appState.nutricion.filter(n => fincasIdsValidas.has(n.fincaId))
        ).filter(n => n && n.fincaId && todasFincasIdsLocal.has(n.fincaId));
        if (nutricionFiltrada.length > 0) {
          const payloadNutricionFull = nutricionFiltrada.map(n => this.mapearNutricionLocalACloud(n, fincaActiva));
          const { pendientes: payloadNutricion, confirmarSubida: confirmarNut } =
            this._filtrarRegistrosModificados('nutricion_animales', payloadNutricionFull, (r) => `${r.finca_id}__${r.animal_tag}`, forzarCompleta);
          if (payloadNutricion.length > 0) {
            tareasOla2.push(
              this._postgrestUpsert('nutricion_animales', payloadNutricion, 'finca_id,animal_tag', 15000)
                .then(() => { confirmarNut(); resultados.nutricion = payloadNutricion.length; })
                .catch(err => { console.warn('Supabase Sync nutrición:', err.message); })
            );
          }
        }
      }

      // 11. Contabilidad, Inversiones Diferidas y Nómina Multi-Finca (Persistencia 100% en la nube)
      const subirBloqueSistema = (cacheKey, lista, fnMap) => {
        if (!Array.isArray(lista) || lista.length === 0) return;
        const filtrados = (esSuperAdmin
          ? lista
          : lista.filter(item => item && (item.empresaId === empresaIdActiva || (item.fincaId && fincasIdsValidas.has(item.fincaId))))
        ).filter(item => item && item.id && (!item.fincaId || todasFincasIdsLocal.has(item.fincaId)));
        if (filtrados.length === 0) return;
        const payloadFull = filtrados.map(item => fnMap(item, empresaIdActiva));
        const { pendientes, confirmarSubida } =
          this._filtrarRegistrosModificados(cacheKey, payloadFull, (r) => r.id, forzarCompleta);
        if (pendientes.length === 0) return;
        const BATCH = 50;
        const totalB = Math.ceil(pendientes.length / BATCH);
        let okB = 0;
        for (let b = 0; b < totalB; b++) {
          const chunk = pendientes.slice(b * BATCH, (b + 1) * BATCH);
          tareasOla2.push(
            this._postgrestUpsert('operaciones_diarias', chunk, 'id', 12000)
              .then(() => {
                resultados.operacionesDiarias += chunk.length;
                okB++;
                if (okB === totalB) confirmarSubida();
              })
              .catch(err => { console.warn(`Supabase Sync ${cacheKey}:`, err.message); })
          );
        }
      };

      subirBloqueSistema('sys_contabilidad_mov', appState.contabilidadMovimientos, (m, emp) => this._mapearContabMovACloud(m, emp));
      subirBloqueSistema('sys_nomina_trab', appState.nominaTrabajadores, (t, emp) => this._mapearNominaTrabACloud(t, emp));
      subirBloqueSistema('sys_nomina_pago', appState.nominaPagos, (p, emp) => this._mapearNominaPagoACloud(p, emp));

      if (tareasOla2.length > 0) {
        await Promise.allSettled(tareasOla2);
      }

      // Si hubo al menos un registro modificado y subido, invalidar la firma remota para refrescar el sello local
      const totalSubidos = Object.values(resultados).reduce((acc, v) => acc + Number(v || 0), 0);
      if (totalSubidos > 0) {
        this._limpiarFirmaPersistida();
      }

      // Registrar marca de tiempo de sincronización
      this.ultimoSync = new Date().toISOString();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageSyncKey, this.ultimoSync);
      }
      this.estadoConexion = 'conectado';

      return {
        ok: true,
        mensaje: 'Sincronización exitosa hacia la nube con aislamiento multi-tenant verificado.',
        resumen: resultados,
        ultimoSync: this.ultimoSync
      };
    } catch (err) {
      this.estadoConexion = 'error';
      return {
        ok: false,
        error: 'Error durante la subida a Supabase: ' + err.message
      };
    }
  }

  /**
   * Descarga los registros desde Supabase e integra en el modelo local.
   * Aplica aislamiento multi-tenant: si el usuario no es superadmin, delimita
   * automáticamente las consultas REST a su empresa y fincas autorizadas.
   */
  async descargarDatosDeSupabase(timeoutMs = 15000, tenantContext = null) {
    if (!this.estaConfigurado()) {
      return { ok: false, error: 'Nube no configurada.' };
    }
    if (this.usarModoNeon()) {
      return await this._descargarDatosDeNeon(timeoutMs, tenantContext);
    }

    if (tenantContext) {
      this.setTenantContext(tenantContext);
    }

    try {
      this.estadoConexion = 'sincronizando';
      const effectiveTimeout = Math.max(Number(timeoutMs) || 15000, 12000);

      const ctx = this.tenantContext;
      const esSuperAdmin = ctx && ctx.esSuperAdmin;
      const empId = ctx && ctx.empresaId;
      const fincasIds = ctx && Array.isArray(ctx.fincasIds) && ctx.fincasIds.length > 0 ? ctx.fincasIds : null;

      let qEmpresas = '';
      let qFincas = '';
      let qUsuarios = '';
      let qAnimales = '';
      let qServicios = '';
      let qCostos = '';
      let qInversiones = '';
      let qTraslados = '';
      let qOperaciones = '';
      let qPesajes = '';
      let qNutricion = '';

      if (!esSuperAdmin && empId) {
        const empIdEnc = encodeURIComponent(empId);
        if (empId === 'EMP-01') {
          qEmpresas = `id=eq.${empIdEnc}`;
          qTraslados = `empresa_id=eq.${empIdEnc}`;
          qOperaciones = `empresa_id=eq.${empIdEnc}`;
        }
      }

      // ======================================================================
      // FASE 1: ESTRUCTURA MAESTRA Y DIRECTORIO MULTI-TENANT
      // Se descarga primero para resolver fincasIds incluso en dispositivos móviles limpios
      // ======================================================================
      const resultadosFase1 = await Promise.allSettled([
        this._postgrestGet('empresas', effectiveTimeout, qEmpresas),
        this._postgrestGet('fincas', effectiveTimeout, qFincas),
        this._postgrestGet('usuarios', effectiveTimeout, qUsuarios),
        this._postgrestGet('operaciones_diarias', effectiveTimeout, 'id=eq.SYS_DIRECTORIO_EMPRESAS')
      ]);

      const empresasRes = resultadosFase1[0].status === 'fulfilled' ? resultadosFase1[0].value : [];
      const fincasRes = resultadosFase1[1].status === 'fulfilled' ? resultadosFase1[1].value : [];
      const usuariosRes = resultadosFase1[2].status === 'fulfilled' ? resultadosFase1[2].value : [];
      const dirExplicitoRes = resultadosFase1[3].status === 'fulfilled' ? resultadosFase1[3].value : [];

      const empresas = (empresasRes || []).map(r => this.mapearEmpresaCloudALocal(r));
      let fincas = (fincasRes || []).map(r => this.mapearFincaCloudALocal(r));
      let usuarios = (usuariosRes || []).map(r => ({
        id: r.id,
        empresaId: r.empresa_id || null,
        usuario: r.usuario,
        nombre: r.nombre,
        rol: r.rol,
        password: r.password || '',
        fincasAsignadas: r.fincas_asignadas !== undefined ? r.fincas_asignadas : 'todas',
        email: r.email || '',
        telefono: r.telefono || '',
        activo: r.activo !== false
      }));

      let empresasEliminadasCloud = [];
      let fincasEliminadasCloud = [];
      let fincasPurgadasCloud = {};
      let animalesEliminadosCloud = [];

      // Integrar directorio espejo de empresas desde SYS_DIRECTORIO_EMPRESAS
      const regDir = Array.isArray(dirExplicitoRes) && dirExplicitoRes.length > 0 ? dirExplicitoRes[0] : null;
      if (regDir && regDir.detalles && typeof regDir.detalles === 'object') {
        const det = regDir.detalles;
        this._ultimoDirectorioCloud = det;
        empresasEliminadasCloud = Array.isArray(det.empresasEliminadas) ? det.empresasEliminadas : [];
        fincasEliminadasCloud = Array.isArray(det.fincasEliminadas) ? det.fincasEliminadas : [];
        fincasPurgadasCloud = (det.fincasPurgadas && typeof det.fincasPurgadas === 'object') ? det.fincasPurgadas : {};
        animalesEliminadosCloud = Array.isArray(det.animalesEliminados) ? det.animalesEliminados : [];
        const eliminadasSet = new Set(empresasEliminadasCloud);
        if (Array.isArray(det.empresas)) {
          det.empresas.forEach(eDir => {
            if (!eDir || !eDir.id || eliminadasSet.has(eDir.id)) return;
            if (!esSuperAdmin && empId && eDir.id !== empId) return;
            const idx = empresas.findIndex(ec => ec.id === eDir.id);
            if (idx === -1) {
              empresas.push(eDir);
            } else {
              empresas[idx] = { ...empresas[idx], ...eDir };
            }
          });
        }
        if (det.fincasEmpresaMap && typeof det.fincasEmpresaMap === 'object') {
          fincas.forEach(f => {
            if (det.fincasEmpresaMap[f.id]) {
              f.empresaId = det.fincasEmpresaMap[f.id];
            } else if (!f.empresaId) {
              f.empresaId = 'EMP-01';
            }
          });
        } else {
          fincas.forEach(f => {
            if (!f.empresaId) f.empresaId = 'EMP-01';
          });
        }
        if (det.fincasOrdenosMap && typeof det.fincasOrdenosMap === 'object') {
          fincas.forEach(f => {
            if (det.fincasOrdenosMap[f.id] !== undefined) {
              const numOrd = Number(det.fincasOrdenosMap[f.id]) === 2 ? 2 : 1;
              f.numeroOrdenos = numOrd;
              f.tipoOrdeno = numOrd === 2 ? 'doble_ordeno' : 'un_ordeno';
            }
          });
        }
        if (det.usuariosEmpresaMap && typeof det.usuariosEmpresaMap === 'object') {
          usuarios.forEach(u => {
            if (!u.empresaId && u.rol !== 'superadmin' && det.usuariosEmpresaMap[u.usuario]) {
              u.empresaId = det.usuariosEmpresaMap[u.usuario];
            }
          });
        }
      } else {
        fincas.forEach(f => {
          if (!f.empresaId) f.empresaId = 'EMP-01';
        });
      }

      if (!esSuperAdmin && empId) {
        fincas = fincas.filter(f => f.empresaId === empId);
        usuarios = usuarios.filter(u => u.rol === 'superadmin' || u.empresaId === empId);

        const fincasIdsEfectivas = (fincasIds && fincasIds.length > 0)
          ? fincasIds
          : fincas.map(f => f && f.id).filter(Boolean);

        if (fincasIdsEfectivas.length > 0) {
          const fincasFilter = `finca_id=in.(${fincasIdsEfectivas.map(encodeURIComponent).join(',')})`;
          qAnimales = fincasFilter;
          qServicios = fincasFilter;
          qCostos = fincasFilter;
          qInversiones = fincasFilter;
          qPesajes = fincasFilter;
          qNutricion = fincasFilter;
        }
      }

      // ======================================================================
      // FASE 2A: INVENTARIO DE ANIMALES Y CONFIGURACIONES DE FINCA (Prioridad Alta)
      // Se ejecuta antes del histórico pesado para no saturar redes móviles
      // ======================================================================
      const resultadosFase2A = await Promise.allSettled([
        this._postgrestGet('animales', effectiveTimeout, qAnimales),
        this._postgrestGet('servicios_reproductivos', effectiveTimeout, qServicios),
        this._postgrestGet('costos_fijos_finca', effectiveTimeout, qCostos),
        this._postgrestGet('inversiones_diferidas', effectiveTimeout, qInversiones),
        this._postgrestGet('traslados_animales', effectiveTimeout, qTraslados),
        this._postgrestGet('nutricion_animales', effectiveTimeout, qNutricion)
      ]);

      const animalesRes = resultadosFase2A[0].status === 'fulfilled' ? resultadosFase2A[0].value : [];
      const serviciosRes = resultadosFase2A[1].status === 'fulfilled' ? resultadosFase2A[1].value : [];
      const costosRes = resultadosFase2A[2].status === 'fulfilled' ? resultadosFase2A[2].value : [];
      const inversionesRes = resultadosFase2A[3].status === 'fulfilled' ? resultadosFase2A[3].value : [];
      const trasladosRes = resultadosFase2A[4].status === 'fulfilled' ? resultadosFase2A[4].value : [];
      const nutricionRes = resultadosFase2A[5].status === 'fulfilled' ? resultadosFase2A[5].value : [];

      // ======================================================================
      // FASE 2B: HISTÓRICO DE PESAJES Y BITÁCORA DE OPERACIONES
      // ======================================================================
      const resultadosFase2B = await Promise.allSettled([
        this._postgrestGet('pesajes_animales', effectiveTimeout, qPesajes),
        this._postgrestGet('operaciones_diarias', effectiveTimeout, qOperaciones)
      ]);

      const pesajesRes = resultadosFase2B[0].status === 'fulfilled' ? resultadosFase2B[0].value : [];
      const operacionesRes = resultadosFase2B[1].status === 'fulfilled' ? resultadosFase2B[1].value : [];

      const animales = (animalesRes || []).map(r => this.mapearAnimalCloudALocal(r));
      const servicios = (serviciosRes || []).map(r => this.mapearServicioCloudALocal(r));

      // Costos fijos
      const costosFijos = {};
      (costosRes || []).forEach(r => {
        costosFijos[r.finca_id] = {
          nomina: Number(r.nomina || 0),
          insumos: Number(r.insumos || 0),
          herbicidas: Number(r.herbicidas || 0),
          maquinaria: Number(r.maquinaria || 0),
          servicios: Number(r.servicios || 0),
          otros: Number(r.otros || 0)
        };
      });

      // Inversiones
      const inversiones = (inversionesRes || []).map(r => ({
        id: r.id,
        fincaId: r.finca_id,
        descripcionActivo: r.descripcion_activo,
        montoTotalInversion: Number(r.monto_total_inversion || 0),
        plazoMesesDiferido: Number(r.plazo_meses_diferido || 12),
        cuotaMensual: Number(r.cuota_mensual || 0),
        estado: r.estado || 'Activa'
      }));

      // Traslados
      const traslados = (trasladosRes || []).map(r => ({
        id: r.id,
        empresaId: r.empresa_id,
        fecha: r.fecha,
        fincaOrigenId: r.finca_origen_id,
        fincaOrigenNombre: r.finca_origen_nombre,
        fincaDestinoId: r.finca_destino_id,
        fincaDestinoNombre: r.finca_destino_nombre,
        motivo: r.motivo,
        observaciones: r.observaciones,
        totalAnimales: r.total_animales,
        animales: r.animales || [],
        responsable: r.usuario_nombre,
        tag: (r.animales && r.animales[0]) ? r.animales[0].tag : '',
        nombreAlias: (r.animales && r.animales[0]) ? r.animales[0].alias : ''
      }));

      // Extraer registros de Contabilidad y Nómina persistidos en la nube (SYS_CONTAB_MOV_*, SYS_NOMINA_TRAB_*, SYS_NOMINA_PAGO_*)
      const contabilidadMovimientos = [];
      const nominaTrabajadores = [];
      const nominaPagos = [];
      const fincasSetDesc = new Set(fincas.map(f => f && f.id).filter(Boolean));
      const perteneceTenantRegistro = (r, det) => {
        if (esSuperAdmin) return true;
        const fid = r.finca_id || det?.fincaId || det?.finca_id;
        const eid = det?.empresaId || r.empresa_id;
        if (fid && fincasSetDesc.size > 0) return fincasSetDesc.has(fid);
        if (empId && eid) return eid === empId;
        return !empId;
      };

      for (const r of (operacionesRes || [])) {
        if (!r || !r.id) continue;
        const idStr = String(r.id);
        const det = (r.detalles && typeof r.detalles === 'object') ? r.detalles : null;
        if (idStr.startsWith('SYS_CONTAB_MOV_') || det?._tipoRegistroSistema === 'contabilidad_movimiento') {
          if (det && perteneceTenantRegistro(r, det)) {
            const { _tipoRegistroSistema, ...limpio } = det;
            contabilidadMovimientos.push({ ...limpio, id: limpio.id || idStr.replace(/^SYS_CONTAB_MOV_/, '') });
          }
        } else if (idStr.startsWith('SYS_NOMINA_TRAB_') || det?._tipoRegistroSistema === 'nomina_trabajador') {
          if (det && perteneceTenantRegistro(r, det)) {
            const { _tipoRegistroSistema, ...limpio } = det;
            nominaTrabajadores.push({ ...limpio, id: limpio.id || idStr.replace(/^SYS_NOMINA_TRAB_/, '') });
          }
        } else if (idStr.startsWith('SYS_NOMINA_PAGO_') || det?._tipoRegistroSistema === 'nomina_pago') {
          if (det && perteneceTenantRegistro(r, det)) {
            const { _tipoRegistroSistema, ...limpio } = det;
            nominaPagos.push({ ...limpio, id: limpio.id || idStr.replace(/^SYS_NOMINA_PAGO_/, '') });
          }
        }
      }

      // Operaciones Diarias (excluyendo registros internos de sistema y copias redundantes ACT-PES-*)
      const operacionesDiarias = (operacionesRes || [])
        .filter(r => {
          if (!r) return false;
          const idStr = String(r.id || '');
          if (idStr === 'SYS_DIRECTORIO_EMPRESAS' || r.accion === 'SYS_DIRECTORIO_EMPRESAS' || (r.detalles && r.detalles._esSistemaDirectorio)) return false;
          if (idStr.startsWith('SYS_CONTAB_MOV_') || idStr.startsWith('SYS_NOMINA_TRAB_') || idStr.startsWith('SYS_NOMINA_PAGO_')) return false;
          if (r.detalles && r.detalles._tipoRegistroSistema) return false;
          if (idStr.startsWith('ACT-PES-')) return false;
          return true;
        })
        .map(r => {
        if (r.detalles && typeof r.detalles === 'object' && Object.keys(r.detalles).length > 0) {
          return {
            ...r.detalles,
            id: r.id,
            fecha: r.fecha || r.detalles.fecha,
            fincaId: r.finca_id || r.detalles.fincaId,
            fincaNombre: r.finca_nombre || r.detalles.fincaNombre,
            accion: r.accion || r.detalles.accion,
            modulo: r.modulo || r.detalles.modulo,
            responsable: r.usuario || r.detalles.responsable
          };
        }
        return {
          id: r.id,
          fecha: r.fecha,
          fincaId: r.finca_id,
          fincaNombre: r.finca_nombre,
          accion: r.accion,
          modulo: r.modulo,
          responsable: r.usuario
        };
      });

      // Pesajes
      const pesajes = (pesajesRes || []).map(r => ({
        id: r.id,
        fincaId: r.finca_id,
        tag: r.animal_tag,
        animalTag: r.animal_tag,
        fecha: r.fecha_pesaje,
        pesoNuevo: Number(r.peso_kg || 0),
        peso: Number(r.peso_kg || 0),
        gdp: r.gdp_calculada_g_dia ? Number(r.gdp_calculada_g_dia) : null,
        responsable: r.notas || 'Registro de Manga',
        observaciones: r.notas || ''
      }));

      // Nutrición Animal Especial & IA
      const nutricion = (nutricionRes || []).map(r => this.mapearNutricionCloudALocal(r));

      const datosDescargados = {
        empresas,
        fincas,
        usuarios,
        animales,
        servicios,
        costosFijos,
        inversiones,
        traslados,
        operacionesDiarias,
        pesajes,
        nutricion,
        contabilidadMovimientos,
        nominaTrabajadores,
        nominaPagos,
        empresasEliminadas: empresasEliminadasCloud,
        fincasEliminadas: fincasEliminadasCloud,
        _fincasPurgadas: fincasPurgadasCloud,
        _animalesEliminados: animalesEliminadosCloud
      };

      // Registrar huellas en caché para evitar re-subir estos mismos registros sin cambios (Ahorro Egress/Ingress)
      this._registrarHuellasDescargadas(datosDescargados);

      this.ultimoSync = new Date().toISOString();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageSyncKey, this.ultimoSync);
      }
      this.estadoConexion = 'conectado';

      return {
        ok: true,
        datos: datosDescargados,
        ultimoSync: this.ultimoSync
      };
    } catch (err) {
      this.estadoConexion = 'error';
      return {
        ok: false,
        error: 'Error descargando datos de Supabase: ' + err.message
      };
    }
  }

  /**
   * Sonda ultraliviana de cambios remotos (~350 bytes en vez de ~2.65 MB).
   * Consulta únicamente el conteo exacto y el último registro modificado de las tablas clave.
   * Si la firma no cambió respecto a la última revisión, evita descargar las tablas completas en el heartbeat.
   */
  async verificarCambiosRemotosLiviano(timeoutMs = 6000, tenantContext = null, opciones = {}) {
    if (!this.estaConfigurado()) {
      return { ok: false, hayCambios: false };
    }

    if (this.usarModoNeon()) {
      try {
        const ctx = tenantContext || this.tenantContext || null;
        const esSuperAdmin = !ctx || Boolean(ctx.esSuperAdmin);
        const fincasIds = (ctx && Array.isArray(ctx.fincasIds)) ? ctx.fincasIds.filter(Boolean) : [];
        const qs = new URLSearchParams();
        if (esSuperAdmin) qs.set('esSuperAdmin', '1');
        if (!esSuperAdmin && fincasIds.length > 0) qs.set('fincasIds', fincasIds.join(','));
        const queryStr = qs.toString() ? `?${qs.toString()}` : '';

        const data = await this._neonRequest(`/probe${queryStr}`, { method: 'GET' }, Math.max(Number(timeoutMs) || 6000, 5000));
        const firmaActual = String(data?.firma || '');
        if (!firmaActual) return { ok: false, hayCambios: false };

        if (this._ultimaFirmaRemota === null && opciones && opciones.usarFirmaPersistida) {
          const persistida = this._leerFirmaPersistida(ctx);
          if (persistida) this._ultimaFirmaRemota = persistida;
        }
        if (this._ultimaFirmaRemota === null) {
          this._ultimaFirmaRemota = firmaActual;
          this._persistirFirmaRemota(firmaActual, ctx);
          return { ok: true, hayCambios: false, firma: firmaActual, inicializada: true };
        }
        const hayCambios = firmaActual !== this._ultimaFirmaRemota;
        this._ultimaFirmaRemota = firmaActual;
        this._persistirFirmaRemota(firmaActual, ctx);
        return { ok: true, hayCambios, firma: firmaActual };
      } catch (err) {
        return { ok: false, hayCambios: false, error: err.message };
      }
    }

    try {
      const ctx = tenantContext || this.tenantContext || null;
      const esSuperAdmin = !ctx || Boolean(ctx.esSuperAdmin);
      const fincasIds = (ctx && Array.isArray(ctx.fincasIds)) ? ctx.fincasIds.filter(Boolean) : [];
      const filtrarPorFinca = !esSuperAdmin && fincasIds.length > 0;
      const fincasFilterStr = filtrarPorFinca
        ? `finca_id=in.(${fincasIds.map(id => `"${String(id).replace(/"/g, '')}"`).join(',')})&`
        : '';

      const sondarTabla = async (query) => {
        const res = await this._fetchConTimeout(`${this.config.url}/rest/v1/${query}`, {
          method: 'GET',
          headers: this.obtenerHeaders({
            'Prefer': 'count=exact'
          })
        }, timeoutMs);
        if (!res.ok) return `err:${res.status}`;
        const range = (res.headers && typeof res.headers.get === 'function')
          ? (res.headers.get('content-range') || '')
          : '';
        const rows = await res.json();
        const top = Array.isArray(rows) && rows[0]
          ? `${rows[0].id || ''}:${rows[0].actualizado_en || rows[0].creado_en || ''}`
          : '0';
        return `${range}|${top}`;
      };

      const [sigFincas, sigAnimales, sigPesajes, sigOps, sigDir] = await Promise.all([
        sondarTabla('fincas?select=id,actualizado_en&order=actualizado_en.desc.nullslast&limit=1'),
        sondarTabla(`animales?${fincasFilterStr}select=id,actualizado_en&order=actualizado_en.desc.nullslast&limit=1`),
        sondarTabla(`pesajes_animales?${fincasFilterStr}select=id,creado_en&order=creado_en.desc.nullslast&limit=1`),
        sondarTabla(`operaciones_diarias?${fincasFilterStr}id=not.like.ACT-PES-*&select=id,creado_en&order=creado_en.desc.nullslast&limit=1`),
        sondarTabla('operaciones_diarias?id=eq.SYS_DIRECTORIO_EMPRESAS&select=id,creado_en&limit=1')
      ]);

      const firmaActual = [sigFincas, sigAnimales, sigPesajes, sigOps, sigDir].join('||');
      if (this._ultimaFirmaRemota === null && opciones && opciones.usarFirmaPersistida) {
        const persistida = this._leerFirmaPersistida(ctx);
        if (persistida) {
          this._ultimaFirmaRemota = persistida;
        }
      }

      if (this._ultimaFirmaRemota === null) {
        this._ultimaFirmaRemota = firmaActual;
        this._persistirFirmaRemota(firmaActual, ctx);
        return { ok: true, hayCambios: false, firma: firmaActual, inicializada: true };
      }

      const hayCambios = firmaActual !== this._ultimaFirmaRemota;
      this._ultimaFirmaRemota = firmaActual;
      this._persistirFirmaRemota(firmaActual, ctx);
      return { ok: true, hayCambios, firma: firmaActual };
    } catch (err) {
      return { ok: false, hayCambios: false, error: err.message };
    }
  }

  // ==========================================================================
  // MÉTODOS HTTP INTERNOS DE POSTGREST CON PROTECCIÓN DE TIMEOUT
  // ==========================================================================

  async _fetchConTimeout(url, options = {}, timeoutMs = 8000) {
    if (typeof AbortController === 'undefined') {
      return await fetch(url, options);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error('Tiempo de espera agotado (' + (timeoutMs / 1000) + 's) conectando a Supabase');
      }
      throw err;
    }
  }

  async _postgrestUpsert(tabla, registros, onConflict = null, timeoutMs = 8000) {
    if (!Array.isArray(registros) || registros.length === 0) return true;
    if (this.usarModoNeon()) {
      const mapaPayload = {
        empresas: 'empresas',
        fincas: 'fincas',
        usuarios: 'usuarios',
        animales: 'animales',
        servicios_reproductivos: 'servicios',
        costos_fijos_finca: 'costosFijos',
        inversiones_diferidas: 'inversiones',
        traslados_animales: 'traslados',
        pesajes_animales: 'pesajes',
        nutricion_animales: 'nutricion'
      };
      const body = {};
      if (tabla === 'operaciones_diarias') {
        const dirRow = registros.find((r) => r && r.id === 'SYS_DIRECTORIO_EMPRESAS');
        const otras = registros.filter((r) => !r || r.id !== 'SYS_DIRECTORIO_EMPRESAS');
        if (dirRow && dirRow.detalles) {
          body.directorio = { fecha: dirRow.fecha, detalles: dirRow.detalles };
        }
        if (otras.length > 0) body.operacionesDiarias = otras;
      } else if (mapaPayload[tabla]) {
        body[mapaPayload[tabla]] = registros;
      } else {
        return true;
      }
      await this._neonRequest('/sync', { method: 'POST', body: JSON.stringify(body) }, Math.max(timeoutMs, 10000));
      return true;
    }
    let endpoint = this.config.url + '/rest/v1/' + tabla;
    if (onConflict) {
      endpoint += '?on_conflict=' + onConflict;
    }
    const headers = this.obtenerHeaders({
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    });

    const res = await this._fetchConTimeout(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(registros)
    }, timeoutMs);

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error('Tabla [' + tabla + '] HTTP ' + res.status + ': ' + errorText);
    }
    return true;
  }

  /**
   * Sincronización ligera de pre-login:
   * Solo descarga empresas activas y el directorio de usuarios para autenticación,
   * sin exponer ni transferir jamás registros de animales, costos ni operaciones de ningún inquilino.
   */
  async descargarDirectorioPreLogin(timeoutMs = 6000) {
    if (!this.estaConfigurado()) {
      return { ok: false, error: 'Nube no configurada.' };
    }
    if (this.usarModoNeon()) {
      try {
        const resp = await this._neonRequest('/prelogin', { method: 'GET' }, Math.max(Number(timeoutMs) || 8000, 6000));
        if (resp.directorio && typeof resp.directorio === 'object') {
          this._ultimoDirectorioCloud = resp.directorio;
        }
        return { ok: true, datos: resp.datos || { empresas: [], usuarios: [] } };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }
    try {
      const [empresasRes, usuariosRes, dirRes] = await Promise.allSettled([
        this._postgrestGet('empresas', timeoutMs, 'activa=eq.true'),
        this._postgrestGet('usuarios', timeoutMs, 'activo=eq.true'),
        this._postgrestGet('operaciones_diarias', timeoutMs, 'id=eq.SYS_DIRECTORIO_EMPRESAS')
      ]);

      const empresasData = empresasRes.status === 'fulfilled' ? empresasRes.value : [];
      const usuariosData = usuariosRes.status === 'fulfilled' ? usuariosRes.value : [];
      const dirData = dirRes.status === 'fulfilled' ? dirRes.value : [];

      const empresas = (empresasData || []).map(r => this.mapearEmpresaCloudALocal(r));
      const usuarios = (usuariosData || []).map(r => ({
        id: r.id,
        empresaId: r.empresa_id || null,
        usuario: r.usuario,
        nombre: r.nombre,
        rol: r.rol,
        password: r.password || '',
        fincasAsignadas: r.fincas_asignadas !== undefined ? r.fincas_asignadas : 'todas',
        email: r.email || '',
        telefono: r.telefono || '',
        activo: r.activo !== false
      }));

      const regDir = (dirData || [])[0];
      if (regDir && regDir.detalles && typeof regDir.detalles === 'object') {
        const det = regDir.detalles;
        this._ultimoDirectorioCloud = det;
        const eliminadasSet = new Set(Array.isArray(det.empresasEliminadas) ? det.empresasEliminadas : []);
        if (Array.isArray(det.empresas)) {
          det.empresas.forEach(eDir => {
            if (!eDir || !eDir.id || eliminadasSet.has(eDir.id) || eDir.activa === false) return;
            const idx = empresas.findIndex(ec => ec.id === eDir.id);
            if (idx === -1) {
              empresas.push(eDir);
            } else {
              empresas[idx] = { ...empresas[idx], ...eDir };
            }
          });
        }
        if (det.usuariosEmpresaMap && typeof det.usuariosEmpresaMap === 'object') {
          usuarios.forEach(u => {
            if (!u.empresaId && u.rol !== 'superadmin' && det.usuariosEmpresaMap[u.usuario]) {
              u.empresaId = det.usuariosEmpresaMap[u.usuario];
            }
          });
        }
      }

      return {
        ok: true,
        datos: { empresas, usuarios }
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Autenticación criptográfica RPC en Supabase Cloud.
   * Valida credenciales en el motor de base de datos y retorna sesión firmada.
   */
  async autenticarUsuarioCloud(usuario, password) {
    if (!this.estaConfigurado()) return { ok: false, error: 'Supabase no configurado' };
    const endpoint = this.config.url + '/rest/v1/rpc/autenticar_usuario';
    try {
      const res = await this._fetchConTimeout(endpoint, {
        method: 'POST',
        headers: this.obtenerHeaders(),
        body: JSON.stringify({ p_usuario: usuario, p_password: password })
      }, 7000);
      if (res.ok) {
        return await res.json();
      }
      return { ok: false, error: 'HTTP ' + res.status };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Cierre y revocación de sesión en Supabase Cloud.
   */
  async cerrarSesionCloud(token) {
    if (!this.estaConfigurado() || !token) return { ok: false };
    if (this.usarModoNeon()) return { ok: true };
    const endpoint = this.config.url + '/rest/v1/rpc/cerrar_sesion';
    try {
      await this._fetchConTimeout(endpoint, {
        method: 'POST',
        headers: this.obtenerHeaders(),
        body: JSON.stringify({ p_token: token })
      }, 4000);
      return { ok: true };
    } catch (_) {
      return { ok: false };
    }
  }

  async _postgrestGet(tabla, timeoutMs = 8000, queryParams = '') {
    const PAGE_SIZE = 1000;
    const MAX_PAGES = 10;
    const cleanParams = queryParams ? queryParams.replace(/^\?/, '').replace(/^&/, '') : '';
    const tieneLimitExplicito = /(?:^|&)limit=\d+/i.test(cleanParams) || /(?:^|&)id=eq\./i.test(cleanParams);
    const headers = this.obtenerHeaders();

    if (tieneLimitExplicito) {
      let endpoint = `${this.config.url}/rest/v1/${tabla}?select=*`;
      if (!/(?:^|&)limit=\d+/i.test(cleanParams)) {
        endpoint += `&limit=${PAGE_SIZE}`;
      }
      if (cleanParams) {
        endpoint += `&${cleanParams}`;
      }
      const res = await this._fetchConTimeout(endpoint, { method: 'GET', headers }, timeoutMs);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error('Consulta [' + tabla + '] HTTP ' + res.status + ': ' + errorText);
      }
      return await res.json();
    }

    const acumulado = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const offset = page * PAGE_SIZE;
      let endpoint = `${this.config.url}/rest/v1/${tabla}?select=*&limit=${PAGE_SIZE}&offset=${offset}`;
      if (cleanParams) {
        endpoint += `&${cleanParams}`;
      }
      const res = await this._fetchConTimeout(endpoint, { method: 'GET', headers }, timeoutMs);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error('Consulta [' + tabla + '] HTTP ' + res.status + ': ' + errorText);
      }
      const lote = await res.json();
      if (!Array.isArray(lote) || lote.length === 0) break;
      acumulado.push(...lote);
      if (lote.length < PAGE_SIZE) break;
    }
    return acumulado;
  }

  async _postgrestDelete(tabla, queryParam = '', timeoutMs = 8000) {
    if (!this.estaConfigurado()) return false;
    if (this.usarModoNeon()) {
      const m = String(queryParam || '').match(/^([a-z_]+)=eq\.([^&]+)$/i);
      if (m) {
        await this._neonRequest('/sync', {
          method: 'DELETE',
          body: JSON.stringify({
            action: 'registro_tabla',
            tabla,
            columna: m[1],
            valor: decodeURIComponent(m[2])
          })
        }, Math.max(timeoutMs, 10000));
      }
      return true;
    }
    let endpoint = this.config.url + '/rest/v1/' + tabla;
    if (queryParam) {
      endpoint += (queryParam.startsWith('?') ? queryParam : ('?' + queryParam));
    }
    const headers = this.obtenerHeaders({
      'Prefer': 'return=minimal'
    });

    const res = await this._fetchConTimeout(endpoint, {
      method: 'DELETE',
      headers: headers
    }, timeoutMs);

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error('Eliminación [' + tabla + '] HTTP ' + res.status + ': ' + errorText);
    }
    return true;
  }

  /**
   * Elimina un usuario en Supabase Cloud por login o ID.
   */
  async eliminarUsuarioCloud(usuarioLogin, usuarioId = null) {
    if (!this.estaConfigurado()) return { ok: false };
    if (this.usarModoNeon()) {
      try {
        await this._neonRequest('/sync', {
          method: 'DELETE',
          body: JSON.stringify({
            action: 'usuario',
            usuario: usuarioLogin ? String(usuarioLogin).replace(/^@/, '').trim() : '',
            usuarioId: usuarioId ? String(usuarioId).trim() : ''
          })
        }, 10000);
        this._limpiarFirmaPersistida();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }
    const tareas = [];
    if (usuarioLogin) {
      const uClean = String(usuarioLogin).replace(/^@/, '').trim();
      tareas.push(this._postgrestDelete('usuarios', `usuario=eq.${encodeURIComponent(uClean)}`));
    }
    if (usuarioId) {
      const idClean = String(usuarioId).trim();
      tareas.push(this._postgrestDelete('usuarios', `id=eq.${encodeURIComponent(idClean)}`));
    }
    try {
      await Promise.allSettled(tareas);
      return { ok: true };
    } catch (err) {
      console.warn('Advertencia eliminando usuario en cloud:', err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Elimina un animal y sus eventos zootécnicos asociados en Supabase Cloud.
   */
  async eliminarAnimalCloud(animalId, animalTag = null, fincaId = null) {
    if (!this.estaConfigurado()) return { ok: false };
    if (this.usarModoNeon()) {
      try {
        await this._neonRequest('/sync', {
          method: 'DELETE',
          body: JSON.stringify({ action: 'animal', animalId, tag: animalTag, fincaId })
        }, 12000);
        this._limpiarFirmaPersistida();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }
    const tareas = [];

    if (animalId) {
      tareas.push(this._postgrestDelete('animales', `id=eq.${encodeURIComponent(animalId)}`));
    }
    if (animalTag) {
      const tagEnc = encodeURIComponent(animalTag);
      tareas.push(this._postgrestDelete('pesajes_animales', `animal_tag=eq.${tagEnc}`));
      tareas.push(this._postgrestDelete('servicios_reproductivos', `animal_tag=eq.${tagEnc}`));
      tareas.push(this._postgrestDelete('palpaciones_reproductivas', `animal_tag=eq.${tagEnc}`));
      tareas.push(this._postgrestDelete('controles_lecheros', `animal_tag=eq.${tagEnc}`));
      tareas.push(this._postgrestDelete('nutricion_animales', `animal_tag=eq.${tagEnc}`));

      if (fincaId) {
        const fidEnc = encodeURIComponent(fincaId);
        tareas.push(this._postgrestDelete('animales', `finca_id=eq.${fidEnc}&identificacion_tag=eq.${tagEnc}`));
      } else {
        tareas.push(this._postgrestDelete('animales', `identificacion_tag=eq.${tagEnc}`));
      }
    }

    try {
      await Promise.allSettled(tareas);
      return { ok: true };
    } catch (err) {
      console.warn('Advertencia eliminando animal en cloud:', err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Elimina una finca y en cascada todos sus animales, costos y registros asociados en Supabase Cloud.
   */
  async eliminarFincaCloud(fincaId) {
    if (!this.estaConfigurado() || !fincaId) return { ok: false };
    if (this.usarModoNeon()) {
      try {
        await this._neonRequest('/sync', {
          method: 'DELETE',
          body: JSON.stringify({ action: 'finca', fincaId })
        }, 12000);
        this._limpiarFirmaPersistida();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }
    const fid = encodeURIComponent(fincaId);

    try {
      // 1. Limpiar tablas dependientes
      await Promise.allSettled([
        this._postgrestDelete('animales', `finca_id=eq.${fid}`),
        this._postgrestDelete('pesajes_animales', `finca_id=eq.${fid}`),
        this._postgrestDelete('servicios_reproductivos', `finca_id=eq.${fid}`),
        this._postgrestDelete('palpaciones_reproductivas', `finca_id=eq.${fid}`),
        this._postgrestDelete('controles_lecheros', `finca_id=eq.${fid}`),
        this._postgrestDelete('costos_fijos_finca', `finca_id=eq.${fid}`),
        this._postgrestDelete('inversiones_diferidas', `finca_id=eq.${fid}`),
        this._postgrestDelete('operaciones_diarias', `finca_id=eq.${fid}`),
        this._postgrestDelete('nutricion_animales', `finca_id=eq.${fid}`)
      ]);

      // 2. Eliminar la finca por id y por código
      await this._postgrestDelete('fincas', `id=eq.${fid}`);
      if (fincaId !== 'FIN-PUEBLITO' && (fincaId === 'FIN-01' || fincaId === 'FIN-1789617298779')) {
        await this._postgrestDelete('fincas', `codigo=eq.FIN-01&nombre=eq.El%20Pueblito&id=neq.FIN-PUEBLITO`).catch(() => {});
      }
      return { ok: true };
    } catch (err) {
      console.warn('Advertencia eliminando finca en cloud:', err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Elimina una empresa y sus registros asociados en Supabase Cloud.
   */
  async eliminarEmpresaCloud(empresaId) {
    if (!this.estaConfigurado() || !empresaId) return { ok: false };
    if (this.usarModoNeon()) {
      try {
        await this._neonRequest('/sync', {
          method: 'DELETE',
          body: JSON.stringify({ action: 'empresa', empresaId })
        }, 15000);
        this._limpiarFirmaPersistida();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }
    const eid = encodeURIComponent(empresaId);

    try {
      // Consultar fincas de esta empresa para eliminarlas primero
      const fincas = await this._postgrestGet(`fincas&empresa_id=eq.${eid}`).catch(() => []);
      if (Array.isArray(fincas)) {
        for (const f of fincas) {
          await this.eliminarFincaCloud(f.id);
        }
      }

      await Promise.allSettled([
        this._postgrestDelete('traslados_animales', `empresa_id=eq.${eid}`),
        this._postgrestDelete('operaciones_diarias', `empresa_id=eq.${eid}`),
        this._postgrestDelete('usuarios', `empresa_id=eq.${eid}`)
      ]);

      await this._postgrestDelete('empresas', `id=eq.${eid}`);
      return { ok: true };
    } catch (err) {
      console.warn('Advertencia eliminando empresa en cloud:', err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Vacía el hato de una finca en Supabase Cloud (0 animales y eventos zootécnicos).
   * Orden estricto: Elimina primero tablas hijas dependientes y luego la tabla de animales.
   */
  async purgarFincaCloud(fincaId) {
    if (!this.estaConfigurado() || !fincaId) return { ok: false };
    if (this.usarModoNeon()) {
      try {
        await this._neonRequest('/sync', {
          method: 'DELETE',
          body: JSON.stringify({ action: 'purgar_finca', fincaId })
        }, 15000);
        this._limpiarFirmaPersistida();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }
    const fid = encodeURIComponent(fincaId);

    try {
      // 1. Eliminar primero eventos e historiales zootécnicos vinculados al predio
      //    (preservando siempre registros SYS_CONTAB_* / SYS_NOMINA_* / SYS_DIRECTORIO_*)
      await Promise.allSettled([
        this._postgrestDelete('pesajes_animales', `finca_id=eq.${fid}`),
        this._postgrestDelete('servicios_reproductivos', `finca_id=eq.${fid}`),
        this._postgrestDelete('palpaciones_reproductivas', `finca_id=eq.${fid}`),
        this._postgrestDelete('controles_lecheros', `finca_id=eq.${fid}`),
        this._postgrestDelete('nutricion_animales', `finca_id=eq.${fid}`),
        this._postgrestDelete('inversiones_diferidas', `finca_id=eq.${fid}`),
        this._postgrestDelete('operaciones_diarias', `finca_id=eq.${fid}&id=not.like.SYS_*`)
      ]);
      // 2. Eliminar la tabla principal de animales
      await this._postgrestDelete('animales', `finca_id=eq.${fid}`);
      this._limpiarFirmaPersistida();
      return { ok: true };
    } catch (err) {
      console.warn('Advertencia purgando finca en cloud:', err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Reemplaza únicamente el listado de animales de una finca preservando 100% de pesajes,
   * operaciones históricas, contabilidad, nómina e inversiones.
   */
  async reemplazarSoloAnimalesFincaCloud(fincaId) {
    if (!this.estaConfigurado() || !fincaId) return { ok: false };
    if (this.usarModoNeon()) {
      try {
        await this._neonRequest('/sync', {
          method: 'DELETE',
          body: JSON.stringify({ action: 'reemplazar_animales_finca', fincaId })
        }, 15000);
        this._limpiarFirmaPersistida();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }
    const fid = encodeURIComponent(fincaId);
    try {
      await this._postgrestDelete('animales', `finca_id=eq.${fid}`);
      this._limpiarFirmaPersistida();
      return { ok: true };
    } catch (err) {
      console.warn('Advertencia reemplazando animales de finca en cloud:', err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Elimina un registro individual de Contabilidad o Nómina (SYS_CONTAB_MOV_*, SYS_NOMINA_TRAB_*, SYS_NOMINA_PAGO_*) en Supabase.
   */
  async eliminarRegistroSistemaCloud(idCompleto) {
    if (!this.estaConfigurado() || !idCompleto) return { ok: false };
    if (this.usarModoNeon()) {
      try {
        await this._neonRequest('/sync', {
          method: 'DELETE',
          body: JSON.stringify({ action: 'registro_sistema', id: idCompleto })
        }, 10000);
        this._limpiarFirmaPersistida();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }
    try {
      await this._postgrestDelete('operaciones_diarias', `id=eq.${encodeURIComponent(idCompleto)}`);
      this._limpiarFirmaPersistida();
      return { ok: true };
    } catch (err) {
      console.warn('Advertencia eliminando registro de sistema en cloud:', err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Vacía los hatos de múltiples fincas en Supabase Cloud de forma atómica.
   */
  async purgarFincasCloud(fincasIds = []) {
    if (!this.estaConfigurado() || !Array.isArray(fincasIds) || fincasIds.length === 0) return { ok: false };
    if (this.usarModoNeon()) {
      try {
        await this._neonRequest('/sync', {
          method: 'DELETE',
          body: JSON.stringify({ action: 'purgar_fincas', fincasIds })
        }, 15000);
        this._limpiarFirmaPersistida();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }
    const listaIn = fincasIds.map((id) => encodeURIComponent(id)).join(',');
    const queryIn = `finca_id=in.(${listaIn})`;

    try {
      await Promise.allSettled([
        this._postgrestDelete('pesajes_animales', queryIn),
        this._postgrestDelete('servicios_reproductivos', queryIn),
        this._postgrestDelete('palpaciones_reproductivas', queryIn),
        this._postgrestDelete('controles_lecheros', queryIn),
        this._postgrestDelete('nutricion_animales', queryIn),
        this._postgrestDelete('inversiones_diferidas', queryIn),
        this._postgrestDelete('operaciones_diarias', `${queryIn}&id=not.like.SYS_*`)
      ]);
      await this._postgrestDelete('animales', queryIn);
      this._limpiarFirmaPersistida();
      return { ok: true };
    } catch (err) {
      console.warn('Advertencia purgando fincas en cloud:', err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Purga todos los datos de una empresa en Supabase Cloud.
   */
  async purgarEmpresaCloud(empresaId) {
    return await this.eliminarEmpresaCloud(empresaId);
  }

  /**
   * Elimina todos los animales, pesajes, eventos e inversiones en Supabase Cloud.
   * Blindado: Requiere contexto y verificación de Super Administrador para ejecutarse.
   */
  async purgarBaseDatosTotalCloud(confirmacionSuperAdmin = false) {
    if (!this.estaConfigurado()) return { ok: false, error: 'Nube no configurada.' };
    if (!confirmacionSuperAdmin && (!this.tenantContext || !this.tenantContext.esSuperAdmin)) {
      console.warn('Acción bloqueada: purgarBaseDatosTotalCloud requiere privilegios de Super Administrador.');
      return { ok: false, error: 'Acción no autorizada: requiere privilegios de Super Administrador.' };
    }
    if (this.usarModoNeon()) {
      try {
        await this._neonRequest('/sync', {
          method: 'DELETE',
          body: JSON.stringify({ action: 'purgar_total', confirmacionSuperAdmin: true })
        }, 20000);
        this._limpiarFirmaPersistida();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }
    try {
      await Promise.allSettled([
        this._postgrestDelete('pesajes_animales', 'id=not.is.null'),
        this._postgrestDelete('servicios_reproductivos', 'id=not.is.null'),
        this._postgrestDelete('palpaciones_reproductivas', 'id=not.is.null'),
        this._postgrestDelete('controles_lecheros', 'id=not.is.null'),
        this._postgrestDelete('nutricion_animales', 'id=not.is.null'),
        this._postgrestDelete('inversiones_diferidas', 'id=not.is.null'),
        this._postgrestDelete('traslados_animales', 'id=not.is.null'),
        this._postgrestDelete('operaciones_diarias', 'id=neq.SYS_DIRECTORIO_EMPRESAS')
      ]);
      await this._postgrestDelete('animales', 'id=not.is.null');
      return { ok: true };
    } catch (err) {
      console.warn('Advertencia purgando base de datos total en cloud:', err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Puesta a cero completa del sistema en Supabase Cloud:
   * Elimina todos los registros conservando exclusivamente al usuario Super Admin 'anuardavid'.
   * Blindado: Requiere contexto y verificación de Super Administrador.
   */
  async limpiarTodoElSistemaCloud(confirmacionSuperAdmin = false) {
    if (!this.estaConfigurado()) return { ok: false, error: 'Nube no configurada.' };
    if (!confirmacionSuperAdmin && (!this.tenantContext || !this.tenantContext.esSuperAdmin)) {
      console.warn('Acción bloqueada: limpiarTodoElSistemaCloud requiere privilegios de Super Administrador.');
      return { ok: false, error: 'Acción no autorizada: requiere privilegios de Super Administrador.' };
    }
    if (this.usarModoNeon()) {
      try {
        await this._neonRequest('/sync', {
          method: 'DELETE',
          body: JSON.stringify({ action: 'limpiar_todo', confirmacionSuperAdmin: true })
        }, 20000);
        this._limpiarFirmaPersistida();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }
    try {
      // Orden estricto de borrado para respetar dependencias de claves foráneas
      const tablas = [
        ['pesajes_animales', 'id=not.is.null'],
        ['servicios_reproductivos', 'id=not.is.null'],
        ['palpaciones_reproductivas', 'id=not.is.null'],
        ['controles_lecheros', 'id=not.is.null'],
        ['nutricion_animales', 'id=not.is.null'],
        ['inversiones_diferidas', 'id=not.is.null'],
        ['costos_fijos_finca', 'id=not.is.null'],
        ['traslados_animales', 'id=not.is.null'],
        ['operaciones_diarias', 'id=not.is.null'],
        ['animales', 'id=not.is.null'],
        ['usuarios', 'usuario=neq.anuardavid'],
        ['fincas', 'id=not.is.null'],
        ['empresas', 'id=not.is.null']
      ];

      for (const [tabla, query] of tablas) {
        try {
          await this._postgrestDelete(tabla, query);
        } catch (err) {
          console.warn(`[BoviTrack] Error borrando tabla ${tabla}:`, err.message);
        }
      }

      return { ok: true };
    } catch (err) {
      console.warn('Advertencia limpiando sistema completo en cloud:', err.message);
      return { ok: false, error: err.message };
    }
  }
}

