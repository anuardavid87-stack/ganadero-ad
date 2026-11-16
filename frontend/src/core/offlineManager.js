/**
 * GANADERO AD - MOTOR DE TRABAJO EN CAMPO SIN CONEXIÓN (OFFLINE-FIRST ENGINE)
 * Permite descargar el inventario completo al dispositivo (IndexedDB + localStorage),
 * trabajar sin señal en corral/potrero/manga registrando pesajes, leche, reproducción o gastos,
 * y encolar de forma persistente todos los cambios para enviarlos automáticamente a Supabase
 * apenas el dispositivo recupere conexión a internet.
 */

const IDB_NAME_OFFLINE = 'ganadero_ad_offline_field_v1';
const IDB_VERSION_OFFLINE = 1;
const STORE_SNAPSHOT = 'inventario_snapshots';

export class OfflineFieldManager {
  constructor() {
    this._dbPromise = null;
  }

  _abrirDB() {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      return Promise.resolve(null);
    }
    if (this._dbPromise) return this._dbPromise;

    this._dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(IDB_NAME_OFFLINE, IDB_VERSION_OFFLINE);
        req.onupgradeneeded = (ev) => {
          const db = ev.target.result;
          if (!db.objectStoreNames.contains(STORE_SNAPSHOT)) {
            db.createObjectStore(STORE_SNAPSHOT, { keyPath: 'id' });
          }
        };
        req.onsuccess = (ev) => resolve(ev.target.result);
        req.onerror = () => resolve(null);
      } catch (_err) {
        resolve(null);
      }
    });
    return this._dbPromise;
  }

  /**
   * Guarda una copia completa del estado e inventario en IndexedDB (soporta >50MB en celulares)
   * además de metadatos de preparación para trabajo en campo sin internet.
   */
  async guardarSnapshotInventario(state, metaExtra = {}) {
    if (!state || typeof state !== 'object') return { ok: false };

    const ahoraIso = new Date().toISOString();
    const resumenMeta = {
      descargadoEn: metaExtra.descargadoEn || ahoraIso,
      empresaId: state.empresaActivaId || null,
      fincaActivaId: state.fincaActivaId || null,
      totalFincas: Array.isArray(state.fincas) ? state.fincas.length : 0,
      totalAnimales: Array.isArray(state.animales)
        ? state.animales.filter((a) => a && (a.estadoVida || a.estado || 'activo') === 'activo').length
        : 0,
      totalPesajes: Array.isArray(state.pesajes) ? state.pesajes.length : 0,
      ...metaExtra
    };

    state._offlineMeta = {
      ...(state._offlineMeta || {}),
      ...resumenMeta
    };

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('bovitrack_offline_meta_v1', JSON.stringify(state._offlineMeta));
      } catch (_e) {}
    }

    const db = await this._abrirDB();
    if (!db) {
      return { ok: true, via: 'localStorage', meta: state._offlineMeta };
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_SNAPSHOT], 'readwrite');
        const store = tx.objectStore(STORE_SNAPSHOT);
        store.put({
          id: 'SNAPSHOT_PRINCIPAL',
          actualizadoEn: ahoraIso,
          meta: state._offlineMeta,
          state: JSON.parse(JSON.stringify(state))
        });
        tx.oncomplete = () => resolve({ ok: true, via: 'IndexedDB', meta: state._offlineMeta });
        tx.onerror = () => resolve({ ok: true, via: 'localStorage', meta: state._offlineMeta });
      } catch (_err) {
        resolve({ ok: true, via: 'localStorage', meta: state._offlineMeta });
      }
    });
  }

  /**
   * Recupera el snapshot completo desde IndexedDB (ideal cuando localStorage en móvil se truncó por cuota).
   */
  async cargarSnapshotInventario() {
    const db = await this._abrirDB();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_SNAPSHOT], 'readonly');
        const store = tx.objectStore(STORE_SNAPSHOT);
        const req = store.get('SNAPSHOT_PRINCIPAL');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (_err) {
        resolve(null);
      }
    });
  }

  /**
   * Registra un cambio realizado sin conexión (o pendiente de subir) en la cola persistente,
   * y protege el ejemplar modificado para que ninguna descarga posterior pise su peso/estado antes de subirlo.
   */
  registrarCambioPendiente(state, {
    modulo = 'operacion',
    tag = '',
    animalId = '',
    fincaId = '',
    fincaNombre = '',
    descripcion = 'Cambio registrado en dispositivo'
  } = {}) {
    if (!state || typeof state !== 'object') return null;

    if (!Array.isArray(state._colaSincronizacionOffline)) {
      state._colaSincronizacionOffline = [];
    }
    if (!state._animalesPendientesSync || typeof state._animalesPendientesSync !== 'object') {
      state._animalesPendientesSync = {};
    }

    const ahoraIso = new Date().toISOString();
    const ahoraTs = Date.now();
    const cleanTag = String(tag || '').trim().toUpperCase();

    if (cleanTag || animalId) {
      const claveTag = `${fincaId || state.fincaActivaId || 'SIN_FINCA'}__${cleanTag}`;
      const infoDirty = {
        timestamp: ahoraTs,
        fechaIso: ahoraIso,
        modulo,
        fincaId: fincaId || state.fincaActivaId || null,
        tag: cleanTag,
        animalId: animalId || null
      };
      if (cleanTag) state._animalesPendientesSync[claveTag] = infoDirty;
      if (animalId) state._animalesPendientesSync[animalId] = infoDirty;
    }

    // Deduplicar si es el mismo animal + módulo en la misma cola pendiente
    const claveItem = `${modulo}__${fincaId || state.fincaActivaId || ''}__${cleanTag || animalId || descripcion}`;
    const item = {
      id: `OFF-${ahoraTs}-${Math.random().toString(36).slice(2, 6)}`,
      clave: claveItem,
      fechaHora: ahoraIso,
      modulo,
      tag: cleanTag,
      animalId: animalId || '',
      fincaId: fincaId || state.fincaActivaId || '',
      fincaNombre: fincaNombre || '',
      descripcion
    };

    const idxPrev = state._colaSincronizacionOffline.findIndex((x) => x && x.clave === claveItem);
    if (idxPrev >= 0) {
      state._colaSincronizacionOffline[idxPrev] = item;
    } else {
      state._colaSincronizacionOffline.unshift(item);
    }

    // Mantener tope razonable de historial de cola descriptiva (los datos reales viven completos en state.*)
    if (state._colaSincronizacionOffline.length > 1500) {
      state._colaSincronizacionOffline = state._colaSincronizacionOffline.slice(0, 1500);
    }

    state._hayCambiosOfflinePendientes = true;
    return item;
  }

  /**
   * Limpia las banderas de pendientes únicamente después de confirmar subida exitosa a Supabase.
   */
  limpiarColaSincronizada(state) {
    if (!state || typeof state !== 'object') return 0;
    const cantidad = Array.isArray(state._colaSincronizacionOffline)
      ? state._colaSincronizacionOffline.length
      : 0;
    state._colaSincronizacionOffline = [];
    state._animalesPendientesSync = {};
    state._hayCambiosOfflinePendientes = false;
    if (!state._offlineMeta || typeof state._offlineMeta !== 'object') {
      state._offlineMeta = {};
    }
    state._offlineMeta.ultimaSincronizacionSubida = new Date().toISOString();
    return cantidad;
  }

  /**
   * Solicita al Service Worker precachear activos estáticos para asegurar apertura sin red.
   */
  async calentarCacheServiceWorker() {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sw = reg?.active || navigator.serviceWorker.controller;
      if (sw && typeof sw.postMessage === 'function') {
        sw.postMessage({ type: 'WARM_OFFLINE_CACHE' });
        return true;
      }
    } catch (_e) {}
    return false;
  }

  /**
   * Retorna estado consolidado del modo sin conexión para mostrar en la interfaz.
   */
  obtenerResumenOffline(state, online = true, fincasPermitidas = null) {
    let meta = state?._offlineMeta || null;
    if (!meta && typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('bovitrack_offline_meta_v1');
        if (raw) meta = JSON.parse(raw);
      } catch (_e) {}
    }

    const fincasLista = Array.isArray(fincasPermitidas)
      ? fincasPermitidas
      : (Array.isArray(state?.fincas) ? state.fincas : []);
    const fincasSet = new Set(fincasLista.map((f) => f && f.id).filter(Boolean));

    const animalesDisponibles = Array.isArray(state?.animales)
      ? state.animales.filter((a) => {
          if (!a) return false;
          const activo = (a.estadoVida || a.estado || 'activo') === 'activo' && !a.motivoBaja;
          if (!activo) return false;
          return fincasSet.size > 0 ? fincasSet.has(a.fincaId) : true;
        }).length
      : 0;

    const pesajesDisponibles = Array.isArray(state?.pesajes)
      ? state.pesajes.filter((p) => p && (fincasSet.size === 0 || !p.fincaId || fincasSet.has(p.fincaId))).length
      : 0;

    const cola = Array.isArray(state?._colaSincronizacionOffline)
      ? state._colaSincronizacionOffline
      : [];

    return {
      online: Boolean(online),
      listoParaOffline: animalesDisponibles > 0 || fincasLista.length > 0,
      fincasLocales: fincasLista.length,
      animalesLocales: animalesDisponibles,
      pesajesLocales: pesajesDisponibles,
      pendientesCount: cola.length,
      hayCambiosPendientes: Boolean(state?._hayCambiosOfflinePendientes || cola.length > 0),
      colaPendiente: cola,
      descargadoEn: meta?.descargadoEn || null,
      ultimaSincronizacionSubida: meta?.ultimaSincronizacionSubida || null
    };
  }
}
