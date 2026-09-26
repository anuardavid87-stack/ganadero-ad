/**
 * GANADERO AD - ORQUESTADOR PRINCIPAL DE LA APLICACIÓN
 * Estado reactivo, almacenamiento local offline, Service Worker, RBAC y montaje de componentes.
 */

import { CuadriculaMasiva } from './components/CuadriculaMasiva.js';
import { PanelAlertas } from './components/PanelAlertas.js';
import { TablaDinamica } from './components/TablaDinamica.js';
import { DashboardGrafico } from './components/DashboardGrafico.js';
import { ImportadorExcel } from './components/ImportadorExcel.js';
import { ModuloAdmin } from './components/ModuloAdmin.js';
import { PestanaAnimales } from './components/PestanaAnimales.js';
import { FichaAnimal } from './components/FichaAnimal.js';
import { ModuloReproduccion } from './components/ModuloReproduccion.js';
import { ModuloTraslados } from './components/ModuloTraslados.js';
import { ModuloIngresosDiarios } from './components/ModuloIngresosDiarios.js';
import { ModuloNutricion } from './components/ModuloNutricion.js';
import { SupabaseSyncService } from './core/supabaseSync.js';
import { detectarAlertasZootecnicas } from './core/auditorIA.js';
import { ExportadorBackupService } from './core/exportadorBackup.js';
import { calcularGDP, calcularGDPEjemplar } from './core/zootecnia.js';

class BoviTrackApp {
  constructor() {
    this.keyStorage = 'bovitrack_pro_storage_v3';
    this.sessionKey = 'bovitrack_auth_session';
    this.state = this.cargarEstado();
    this.vistaActiva = 'animales'; // 'animales' como portada principal de la app
    this.online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.supabase = new SupabaseSyncService();
    this._syncEnCurso = false;
    this._syncPendiente = false;

    this.iniciarPWA();
    this.iniciarComponentes();
    this.iniciarSincronizacionEnLineaPermanente();
    this.verificarAutenticacion();
  }

  cargarEstado() {
    const raw = localStorage.getItem(this.keyStorage);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        this.migrarEstadoMultiTenant(parsed);
        localStorage.setItem(this.keyStorage, JSON.stringify(parsed));
        return parsed;
      } catch (e) {
        console.warn('Error leyendo almacenamiento, usando datos iniciales nuevos:', e);
      }
    }
    const inicial = this.generarDatosIniciales();
    try {
      localStorage.setItem(this.keyStorage, JSON.stringify(inicial));
    } catch (e) {}
    return inicial;
  }

  migrarEstadoMultiTenant(state) {
    if (!state) return;

    // 1. Inicializar colecciones si no existen
    if (!Array.isArray(state.empresas)) {
      state.empresas = [];
    }

    if (Array.isArray(state.empresas)) {
      state.empresas.forEach((emp) => {
        if (emp.tiempoIndefinido || emp.fechaVencimiento === 'indefinido') {
          emp.tiempoIndefinido = true;
          emp.fechaVencimiento = 'indefinido';
          emp.planVigencia = 'Tiempo Indefinido';
        } else if (!emp.fechaVencimiento) {
          const d = new Date();
          d.setFullYear(d.getFullYear() + 1);
          emp.fechaVencimiento = d.toISOString().split('T')[0];
          emp.planVigencia = '1 Año';
        }
        if (emp.activa === undefined) emp.activa = true;
      });
    }

    if (!state.costosFijos || typeof state.costosFijos !== 'object') {
      state.costosFijos = {};
    }
    if (!Array.isArray(state.fincas)) {
      state.fincas = [];
    }
    if (!Array.isArray(state.animales)) {
      state.animales = [];
    }
    if (!Array.isArray(state.servicios)) {
      state.servicios = [];
    }
    if (!Array.isArray(state.inversiones)) {
      state.inversiones = [];
    }
    if (!Array.isArray(state.traslados)) {
      state.traslados = [];
    }
    if (!Array.isArray(state.pesajes)) {
      state.pesajes = [];
    }
    if (!Array.isArray(state.operacionesDiarias)) {
      state.operacionesDiarias = [];
    }
    if (!Array.isArray(state.nutricion)) {
      state.nutricion = [];
    }

    // 2. Asegurar que las fincas existentes tengan estructura de costos y metadatos de sincronización
    if (!state._preciosModificadosLocalmente || typeof state._preciosModificadosLocalmente !== 'object') {
      state._preciosModificadosLocalmente = {};
    }
    if (!state._costosModificadosLocalmente || typeof state._costosModificadosLocalmente !== 'object') {
      state._costosModificadosLocalmente = {};
    }
    if (Array.isArray(state.fincas)) {
      state.fincas.forEach((f) => {
        if (!state.costosFijos[f.id]) {
          state.costosFijos[f.id] = { nomina: 0, insumos: 0, herbicidas: 0, maquinaria: 0, servicios: 0, otros: 0 };
        }
      });
    }

    // 3. Normalizar usuarios: Super Administrador exclusivo ('anuardavid') y roles RBAC
    const mapRoles = {
      operario: 'encargado',
      veterinario: 'encargado',
      propietario: 'administrador',
      consulta: 'consultor'
    };

    // Purga definitiva de registros demo obsoletos o fincas duplicadas que pudieran quedar en localStorage de navegadores
    const idsFincasDemo = ['FIN-VESUBIO', 'FIN-LA-PALMA', 'FIN-SANTA-ELENA', 'FIN-01', 'FIN-1789617298779'];
    if (!Array.isArray(state._fincasEliminadas)) {
      state._fincasEliminadas = [];
    }
    // Asegurar que FIN-01 y FIN-1789617298779 queden en la lista de eliminadas para nunca volver a resucitar
    if (!state._fincasEliminadas.includes('FIN-01')) state._fincasEliminadas.push('FIN-01');
    if (!state._fincasEliminadas.includes('FIN-1789617298779')) state._fincasEliminadas.push('FIN-1789617298779');

    const eliminadasFincas = new Set(state._fincasEliminadas);
    if (Array.isArray(state.fincas)) {
      state.fincas = state.fincas.filter((f) => !idsFincasDemo.includes(f.id) && !eliminadasFincas.has(f.id) && !eliminadasFincas.has(f.codigo));
    }

    const idsUsuariosDemo = ['USR-00', 'USR-01', 'USR-02', 'USR-03'];
    const nombresDemo = ['Ing. Mateo Restrepo (Admin)', 'Javier Morales (Encargado)', 'Dra. Elena Gómez (Consultor)', 'Ing. Mateo Restrepo (Administrador)'];
    if (!Array.isArray(state._usuariosEliminados)) {
      state._usuariosEliminados = [];
    }
    const eliminadosUsr = new Set(state._usuariosEliminados);

    if (Array.isArray(state.usuarios)) {
      state.usuarios = state.usuarios.filter((u) => 
        !idsUsuariosDemo.includes(u.id) && 
        u.usuario !== 'superadmin' && 
        u.usuario !== 'admin' && 
        !nombresDemo.includes(u.nombre) &&
        !eliminadosUsr.has(u.usuario) &&
        !eliminadosUsr.has(u.id)
      );
    }

    const idsEmpresasDemo = ['EMP-02'];
    if (Array.isArray(state.empresas)) {
      state.empresas = state.empresas.filter((e) => 
        !idsEmpresasDemo.includes(e.id) && 
        e.nombre !== 'Hacienda San José' &&
        e.nombre !== 'Agropecuaria El Porvenir'
      );
    }

    const idsAnimalesDemo = ['ANM-VES-01', 'ANM-VES-02', 'ANM-01', 'ANM-02', 'ANM-03', 'ANM-04', 'ANM-05', 'ANM-06', 'ANM-07', 'ANM-08'];
    if (Array.isArray(state.animales)) {
      state.animales = state.animales.filter((a) => {
        if (idsAnimalesDemo.includes(a.id)) return false;
        if (idsFincasDemo.includes(a.fincaId)) return false;
        if (a.fincaId === 'FIN-1789617298779' && /^V-0\d{3}$/i.test(a.identificacionTag || '')) return false;
        if (String(a.id || '').startsWith('ANM-1789823820094-')) return false;
        return true;
      });
    }

    if (Array.isArray(state.usuarios)) {
      // Eliminar superadmin antiguo para que SOLO quede anuardavid
      state.usuarios = state.usuarios.filter((u) => u.usuario !== 'superadmin' && u.id !== 'USR-00');

      let superUser = state.usuarios.find((u) => u.usuario === 'anuardavid' || u.rol === 'superadmin');
      if (!superUser) {
        superUser = {
          id: 'USR-SUPER',
          usuario: 'anuardavid',
          nombre: 'Anuar David (Super Admin)',
          rol: 'superadmin',
          password: 'anuar316791',
          empresaId: null,
          fincasAsignadas: 'todas',
          email: 'anuardavid@bovitrack.com',
          telefono: '+57 300 000 0000',
          activo: true,
          fechaCreacion: '2026-01-01'
        };
        state.usuarios.unshift(superUser);
      } else {
        superUser.id = 'USR-SUPER';
        superUser.usuario = 'anuardavid';
        superUser.nombre = 'Anuar David (Super Admin)';
        superUser.rol = 'superadmin';
        superUser.password = 'anuar316791';
        superUser.empresaId = null;
        superUser.fincasAsignadas = 'todas';
        superUser.activo = true;
      }

      // Asegurar que ningún otro usuario tenga rol superadmin excepto anuardavid
      state.usuarios = state.usuarios.filter((u) => u.usuario === 'anuardavid' || u.rol !== 'superadmin');

      // Preservar todos los usuarios creados y garantizar integridad
      state.usuarios.forEach((u) => {
        if (mapRoles[u.rol]) u.rol = mapRoles[u.rol];
        if (u.rol !== 'superadmin' && !u.empresaId) {
          u.empresaId = state.empresaActivaId || (state.empresas?.[0]?.id || null);
        }
        if (u.fincasAsignadas === undefined || u.fincasAsignadas === null) {
          u.fincasAsignadas = 'todas';
        }
        u.activo = u.activo !== false;
      });
    }

    // 4. Normalizar usuarioActual
    if (state.usuarioActual) {
      if (mapRoles[state.usuarioActual.rol]) {
        state.usuarioActual.rol = mapRoles[state.usuarioActual.rol];
      }
      if (state.usuarioActual.rol !== 'superadmin' && !state.usuarioActual.empresaId) {
        state.usuarioActual.empresaId = state.empresaActivaId || (state.empresas?.[0]?.id || null);
      }
      if (state.usuarioActual.fincasAsignadas === undefined || state.usuarioActual.fincasAsignadas === null) {
        state.usuarioActual.fincasAsignadas = 'todas';
      }
    }
  }

  guardarEstado() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.keyStorage, JSON.stringify(this.state));
    }
    this.actualizarContadorAlertas();
    this.sincronizarConSupabaseDebounced();
  }

  sincronizarConSupabaseDebounced(delay = 250) {
    if (!this.online || !this.supabase || !this.supabase.estaConfigurado()) return;
    if (this._syncDebounceTimer) clearTimeout(this._syncDebounceTimer);
    this._syncDebounceTimer = setTimeout(() => {
      this._ejecutarSyncCola();
    }, delay);
  }

  async _ejecutarSyncCola() {
    if (!this.online || !this.supabase || !this.supabase.estaConfigurado()) return;

    if (this._syncEnCurso) {
      this._syncPendiente = true;
      return;
    }

    this._syncEnCurso = true;
    this._syncPendiente = false;

    try {
      this.actualizarBadgeConexion('guardando');
      const res = await this.supabase.subirDatosASupabase(this.state);
      if (res.ok) {
        this.actualizarBadgeConexion('sincronizado');
      } else {
        console.warn('Advertencia en subida Supabase:', res.error);
        this.actualizarBadgeConexion('error');
      }
    } catch (err) {
      console.warn('Error en autosync con Supabase:', err);
      this.actualizarBadgeConexion('error');
    } finally {
      this._syncEnCurso = false;
      if (this._syncPendiente) {
        this._syncPendiente = false;
        this.sincronizarConSupabaseDebounced(50);
      }
    }
  }

  integrarDatosSupabase(datos) {
    if (!datos) return false;
    let huboCambios = false;

    // 1. EMPRESAS: Comparación semántica y fusión
    if (Array.isArray(datos.empresas)) {
      const empLocalesMap = new Map((this.state.empresas || []).map((e) => [e.id, e]));
      let empCambiaron = (this.state.empresas || []).length !== datos.empresas.length;
      if (!empCambiaron) {
        for (const eCloud of datos.empresas) {
          const eLoc = empLocalesMap.get(eCloud.id);
          if (!eLoc ||
              eLoc.nombre !== eCloud.nombre ||
              eLoc.nit !== eCloud.nit ||
              Boolean(eLoc.activa !== false) !== Boolean(eCloud.activa !== false) ||
              String(eLoc.fechaVencimiento || '') !== String(eCloud.fechaVencimiento || '') ||
              Boolean(eLoc.tiempoIndefinido) !== Boolean(eCloud.tiempoIndefinido)) {
            empCambiaron = true;
            break;
          }
        }
      }
      if (empCambiaron) {
        this.state.empresas = datos.empresas.map((eCloud) => {
          const local = empLocalesMap.get(eCloud.id) || {};
          return { ...local, ...eCloud };
        });
        huboCambios = true;
      }
    }

    // 2. FINCAS: Comparación semántica preservando lotes locales y precios modificados localmente
    if (Array.isArray(datos.fincas)) {
      const eliminadasFincas = new Set(this.state._fincasEliminadas || []);
      const fincasValidasCloud = datos.fincas.filter((f) => 
        !eliminadasFincas.has(f.id) && 
        !eliminadasFincas.has(f.codigo) &&
        f.id !== 'FIN-01' &&
        f.id !== 'FIN-1789617298779' &&
        !(f.codigo === 'FIN-01' && f.nombre === 'El Pueblito' && f.id !== 'FIN-PUEBLITO')
      );

      const fincasLocalesMap = new Map((this.state.fincas || []).map((f) => [f.id, f]));
      const preciosModLoc = this.state._preciosModificadosLocalmente || {};
      const ahora = Date.now();

      let fincasCambiaron = (this.state.fincas || []).length !== fincasValidasCloud.length;
      if (!fincasCambiaron) {
        for (const fCloud of fincasValidasCloud) {
          const fLoc = fincasLocalesMap.get(fCloud.id);
          const modLocal = preciosModLoc[fCloud.id];
          const protegerPrecios = modLocal && (ahora - (modLocal.timestamp || 0) < 60000);

          const precioLecheTarget = protegerPrecios ? Number(fLoc.precioLecheLitro || 0) : Number(fCloud.precioLecheLitro || 0);
          const precioCarneTarget = protegerPrecios ? Number(fLoc.precioCarneKgPie || 0) : Number(fCloud.precioCarneKgPie || 0);

          if (!fLoc ||
              fLoc.nombre !== fCloud.nombre ||
              fLoc.codigo !== fCloud.codigo ||
              fLoc.empresaId !== fCloud.empresaId ||
              Number(fLoc.areaHa || 0) !== Number(fCloud.areaHa || 0) ||
              Number(fLoc.precioLecheLitro || 0) !== precioLecheTarget ||
              Number(fLoc.precioCarneKgPie || 0) !== precioCarneTarget ||
              (fLoc.ubicacion || '') !== (fCloud.ubicacion || '')) {
            fincasCambiaron = true;
            break;
          }
        }
      }
      if (fincasCambiaron) {
        this.state.fincas = fincasValidasCloud.map((fCloud) => {
          const local = fincasLocalesMap.get(fCloud.id);
          const modLocal = preciosModLoc[fCloud.id];
          const protegerPrecios = modLocal && (ahora - (modLocal.timestamp || 0) < 60000);

          return {
            ...fCloud,
            precioLecheLitro: (protegerPrecios && local && local.precioLecheLitro !== undefined)
              ? local.precioLecheLitro
              : fCloud.precioLecheLitro,
            precioCarneKgPie: (protegerPrecios && local && local.precioCarneKgPie !== undefined)
              ? local.precioCarneKgPie
              : fCloud.precioCarneKgPie,
            lotes: (local && Array.isArray(local.lotes) && local.lotes.length > 0)
              ? local.lotes
              : (fCloud.lotes || ['Lote 1', 'Lote 2', 'Maternidad', 'Ordeño', 'Ceba'])
          };
        });
        const fPermitidas = this.getFincasEmpresa();
        if (fPermitidas.length > 0 && !fPermitidas.some((f) => f.id === this.state.fincaActivaId)) {
          this.state.fincaActivaId = fPermitidas[0].id;
        }
        huboCambios = true;
      }
    }

    // 3. USUARIOS: Comparación semántica preservando claves y fecha local
    if (Array.isArray(datos.usuarios) && datos.usuarios.length > 0) {
      const eliminadosUsr = new Set(this.state._usuariosEliminados || []);
      const usuariosValidosCloud = datos.usuarios.filter((u) => !eliminadosUsr.has(u.usuario) && !eliminadosUsr.has(u.id));

      const usrLocalesMap = new Map((this.state.usuarios || []).map((u) => [u.usuario, u]));
      let usrCambiaron = (this.state.usuarios || []).length !== usuariosValidosCloud.length;
      if (!usrCambiaron) {
        for (const uCloud of usuariosValidosCloud) {
          const uLoc = usrLocalesMap.get(uCloud.usuario);
          if (!uLoc ||
              uLoc.nombre !== uCloud.nombre ||
              uLoc.rol !== uCloud.rol ||
              Boolean(uLoc.activo !== false) !== Boolean(uCloud.activo !== false) ||
              uLoc.empresaId !== uCloud.empresaId ||
              JSON.stringify(uLoc.fincasAsignadas) !== JSON.stringify(uCloud.fincasAsignadas)) {
            usrCambiaron = true;
            break;
          }
        }
      }
      if (usrCambiaron) {
        const nuevosUsuarios = usuariosValidosCloud.map((uCloud) => {
          const local = usrLocalesMap.get(uCloud.usuario) || {};
          return {
            ...uCloud,
            password: local.password || uCloud.password || '',
            fechaCreacion: local.fechaCreacion || uCloud.fechaCreacion || '2026-01-01'
          };
        });

        // Preservar usuarios creados localmente que no han sido eliminados ni están aún en Cloud
        for (const [uName, uLoc] of usrLocalesMap.entries()) {
          if (!eliminadosUsr.has(uName) && !eliminadosUsr.has(uLoc.id) && !usuariosValidosCloud.some(uc => uc.usuario === uName)) {
            nuevosUsuarios.push(uLoc);
          }
        }

        this.state.usuarios = nuevosUsuarios;
        if (this.state.usuarioActual) {
          const match = this.state.usuarios.find((x) => x.usuario === this.state.usuarioActual.usuario);
          if (match) {
            this.state.usuarioActual = { ...this.state.usuarioActual, ...match };
          }
        }
        huboCambios = true;
      }
    }

    // 4. ANIMALES: Sincronización inteligente con Supabase Cloud
    if (Array.isArray(datos.animales)) {
      const actuales = this.state.animales || [];
      // Protección de seguridad: Si la nube responde vacío pero hay animales locales, no sobreescribir con []
      if (datos.animales.length === 0 && actuales.length > 0) {
        // No sobreescribir animales locales con array vacío de error o consulta en blanco
      } else {
        const cloudIds = new Set(datos.animales.map((a) => a.id || `${a.fincaId}_${a.identificacionTag}`));
        const cloudTags = new Set(datos.animales.map((a) => `${a.fincaId}_${a.identificacionTag}`));

        // Preservar ejemplares locales recién registrados que aún no se han subido
        const localesPendientes = actuales.filter((a) => {
          if (!a) return false;
          const kId = a.id || `${a.fincaId}_${a.identificacionTag}`;
          const kTag = `${a.fincaId}_${a.identificacionTag}`;
          return !cloudIds.has(kId) && !cloudTags.has(kTag);
        });

        const anmLocalesMap = new Map(actuales.map((a) => [a.id || a.identificacionTag, a]));
        const listaFinalAnimales = [...datos.animales, ...localesPendientes];

        let anmCambiaron = actuales.length !== listaFinalAnimales.length;
        if (!anmCambiaron) {
          for (const aCloud of datos.animales) {
            const aLoc = anmLocalesMap.get(aCloud.id || aCloud.identificacionTag);
            if (!aLoc ||
                aLoc.identificacionTag !== aCloud.identificacionTag ||
                aLoc.fincaId !== aCloud.fincaId ||
                aLoc.ultimoPesoKg !== aCloud.ultimoPesoKg ||
                aLoc.fechaUltimoPesaje !== aCloud.fechaUltimoPesaje ||
                aLoc.gdpPromedioGDia !== aCloud.gdpPromedioGDia ||
                aLoc.estadoReproductivo !== aCloud.estadoReproductivo ||
                aLoc.diasGestacionActual !== aCloud.diasGestacionActual ||
                aLoc.lote !== aCloud.lote ||
                aLoc.categoria !== aCloud.categoria ||
                aLoc.estadoVida !== aCloud.estadoVida) {
              anmCambiaron = true;
              break;
            }
          }
        }
        if (anmCambiaron) {
          this.state.animales = listaFinalAnimales;
          huboCambios = true;
        }

        if (localesPendientes.length > 0) {
          this.sincronizarConSupabaseDebounced(500);
        }
      }
    }

    // 5. COSTOS FIJOS: Fusión inteligente respetando modificaciones locales recientes
    if (datos.costosFijos && Object.keys(datos.costosFijos).length > 0) {
      const costosModLoc = this.state._costosModificadosLocalmente || {};
      const ahora = Date.now();
      const costosActuales = this.state.costosFijos || {};
      const nuevosCostos = { ...costosActuales };
      let huboCambioCostos = false;

      for (const [fid, cCloud] of Object.entries(datos.costosFijos)) {
        const modLocal = costosModLoc[fid];
        const protegerCostos = modLocal && (ahora - (modLocal.timestamp || 0) < 60000);
        if (protegerCostos && costosActuales[fid]) {
          // Mantener los valores modificados localmente
          continue;
        }
        if (JSON.stringify(costosActuales[fid]) !== JSON.stringify(cCloud)) {
          nuevosCostos[fid] = cCloud;
          huboCambioCostos = true;
        }
      }

      if (huboCambioCostos) {
        this.state.costosFijos = nuevosCostos;
        huboCambios = true;
      }
    }

    // 6. COLECCIONES OPERATIVAS Y REPRODUCTIVAS (Fusión bidireccional inteligente sin pérdida de datos)
    const fusionarColeccion = (key, nuevasFilasCloud) => {
      if (!Array.isArray(nuevasFilasCloud)) return;
      const actuales = this.state[key] || [];

      // Mapeo rápido de filas cloud por id
      const cloudMap = new Map();
      nuevasFilasCloud.forEach((item) => {
        if (item && item.id) cloudMap.set(String(item.id), item);
      });

      // Conservar registros locales recién ingresados que aún no figuran en la descarga cloud
      const combinados = [...nuevasFilasCloud];
      let hayLocalesPendientesDeSubida = false;

      for (const loc of actuales) {
        if (!loc) continue;
        const idLoc = String(loc.id || '');
        if (idLoc && !cloudMap.has(idLoc)) {
          combinados.push(loc);
          hayLocalesPendientesDeSubida = true;
        }
      }

      // Detectar cambios comparando longitudes y lista de IDs
      const idsActuales = actuales.map((x) => x && x.id).filter(Boolean);
      const idsCombinados = combinados.map((x) => x && x.id).filter(Boolean);

      if (idsActuales.length !== idsCombinados.length || JSON.stringify(idsActuales) !== JSON.stringify(idsCombinados)) {
        this.state[key] = combinados;
        huboCambios = true;
      }

      // Si había registros locales que la nube aún no tenía, lanzar sincronización hacia arriba
      if (hayLocalesPendientesDeSubida) {
        this.sincronizarConSupabaseDebounced(500);
      }
    };

    fusionarColeccion('servicios', datos.servicios);
    fusionarColeccion('inversiones', datos.inversiones);
    fusionarColeccion('traslados', datos.traslados);
    fusionarColeccion('operacionesDiarias', datos.operacionesDiarias);
    fusionarColeccion('pesajes', datos.pesajes);
    fusionarColeccion('nutricion', datos.nutricion);

    if (huboCambios) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.keyStorage, JSON.stringify(this.state));
      }
      this.actualizarHeader();

      // Si el usuario está escribiendo activamente en un campo de texto, evitar interrumpirlo
      const usuarioEscribiendo = typeof document !== 'undefined' && document.activeElement &&
        (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');

      if (!usuarioEscribiendo) {
        this.mostrarVistaActiva();
        this.actualizarContadorAlertas();
      }
    }
    return huboCambios;
  }

  async sincronizarConSupabaseInicial() {
    if (!this.online || !this.supabase || !this.supabase.estaConfigurado() || this._syncEnCurso) {
      this.actualizarBadgeConexion();
      return;
    }

    this._syncEnCurso = true;
    try {
      this.actualizarBadgeConexion('descargando');
      const res = await this.supabase.descargarDatosDeSupabase(6000);
      if (res.ok && res.datos) {
        this.integrarDatosSupabase(res.datos);
        this.actualizarHeader();
        this.mostrarVistaActiva();
        this.actualizarBadgeConexion('sincronizado');
      } else {
        this.actualizarBadgeConexion();
      }
    } catch (err) {
      console.warn('Error en descarga inicial de Supabase:', err);
      this.actualizarBadgeConexion();
    } finally {
      this._syncEnCurso = false;
      this._ultimoSyncTiempo = Date.now();
      if (this._syncPendiente) {
        this._syncPendiente = false;
        this.sincronizarConSupabaseDebounced(50);
      }
    }
  }

  async sincronizarEnSegundoPlano() {
    if (!this.online || !this.supabase || !this.supabase.estaConfigurado()) return;
    if (this._syncEnCurso) return;

    this._syncEnCurso = true;
    try {
      if (this._syncPendiente) {
        this._syncPendiente = false;
        await this.supabase.subirDatosASupabase(this.state);
      }

      const res = await this.supabase.descargarDatosDeSupabase(6000);
      if (res.ok && res.datos) {
        const cambios = this.integrarDatosSupabase(res.datos);
        if (cambios) {
          this.actualizarBadgeConexion('sincronizado');
        }
      }
    } catch (err) {
      console.warn('Error en heartbeat sync con Supabase:', err);
    } finally {
      this._syncEnCurso = false;
      this._ultimoSyncTiempo = Date.now();
    }
  }

  iniciarSincronizacionEnLineaPermanente() {
    if (typeof window === 'undefined') return;

    this._ultimoSyncTiempo = Date.now();

    const ejecutarSyncConCooldown = () => {
      const ahora = Date.now();
      // Cooldown de 5 segundos para prevenir tormentas de eventos simultáneos
      if (ahora - (this._ultimoSyncTiempo || 0) < 5000) return;
      if (!this.online || this._syncEnCurso) return;
      this._ultimoSyncTiempo = ahora;
      this.sincronizarEnSegundoPlano();
    };

    // 1. Detección de reactivación de pestaña o pantalla de celular
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.online) {
          ejecutarSyncConCooldown();
        }
      });
    }

    // 2. Foco de ventana (regreso a la app)
    window.addEventListener('focus', () => {
      if (this.online) {
        ejecutarSyncConCooldown();
      }
    });

    // 3. Heartbeat periódico cada 25 segundos (mantiene todos los dispositivos en línea permanentemente)
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
    this._heartbeatTimer = setInterval(() => {
      const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
      if (visible && this.online && !this._syncEnCurso) {
        this._ultimoSyncTiempo = Date.now();
        this.sincronizarEnSegundoPlano();
      }
    }, 25000);
  }

  async sincronizarManualConSupabase(silencioso = false) {
    if (!this.online) {
      if (!silencioso) this.mostrarNotificacionToast('⚠️ Sin conexión a internet. Los cambios se conservan localmente.', 'warn');
      return;
    }
    if (!this.supabase || !this.supabase.estaConfigurado()) {
      if (!silencioso) this.mostrarNotificacionToast('⚠️ Supabase no está configurado.', 'warn');
      return;
    }

    this.actualizarBadgeConexion('guardando');
    if (!silencioso) this.mostrarNotificacionToast('🔄 Sincronizando con Supabase Cloud...', 'info');

    this._syncEnCurso = true;
    try {
      const pushRes = await this.supabase.subirDatosASupabase(this.state);
      const pullRes = await this.supabase.descargarDatosDeSupabase(8000);
      if (pullRes.ok && pullRes.datos) {
        this.integrarDatosSupabase(pullRes.datos);
      }

      if (pushRes.ok) {
        if (!silencioso) this.mostrarNotificacionToast('✅ ¡Sincronización con Supabase exitosa!', 'success');
        this.actualizarBadgeConexion('sincronizado');
      } else {
        if (!silencioso) this.mostrarNotificacionToast('⚠️ Aviso de sincronización: ' + (pushRes.error || 'Verifique credenciales'), 'warn');
        this.actualizarBadgeConexion('error');
      }
    } catch (err) {
      if (!silencioso) this.mostrarNotificacionToast('❌ Error sincronizando: ' + err.message, 'error');
      this.actualizarBadgeConexion('error');
    } finally {
      this._syncEnCurso = false;
      this._ultimoSyncTiempo = Date.now();
    }
  }

  mostrarNotificacionToast(mensaje, tipo = 'info') {
    if (typeof document === 'undefined') return;
    let toast = document.getElementById('bovitrack-cloud-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'bovitrack-cloud-toast';
      toast.className = 'fixed bottom-4 right-4 z-50 max-w-sm px-4 py-3 rounded-xl shadow-2xl text-xs font-bold transition-all duration-300 transform translate-y-0 flex items-center gap-2 border';
      document.body.appendChild(toast);
    }

    const estilos = {
      success: 'bg-emerald-900/90 text-emerald-100 border-emerald-500/50 shadow-emerald-950/50',
      info: 'bg-sky-900/90 text-sky-100 border-sky-500/50 shadow-sky-950/50',
      warn: 'bg-amber-900/90 text-amber-100 border-amber-500/50 shadow-amber-950/50',
      error: 'bg-rose-900/90 text-rose-100 border-rose-500/50 shadow-rose-950/50'
    };

    toast.className = `fixed bottom-4 right-4 z-50 max-w-sm px-4 py-3 rounded-xl shadow-2xl text-xs font-bold transition-all duration-300 transform translate-y-0 flex items-center gap-2 border ${estilos[tipo] || estilos.info}`;
    toast.innerHTML = mensaje;
    toast.style.display = 'flex';
    toast.style.opacity = '1';

    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      if (toast) {
        toast.style.opacity = '0';
        setTimeout(() => {
          if (toast) toast.style.display = 'none';
        }, 300);
      }
    }, 4000);
  }

  generarDatosIniciales() {
    const superAdmin = {
      id: 'USR-SUPER',
      usuario: 'anuardavid',
      nombre: 'Anuar David (Super Admin)',
      rol: 'superadmin',
      password: 'anuar316791',
      empresaId: null,
      fincasAsignadas: 'todas',
      email: 'anuardavid@bovitrack.com',
      telefono: '+57 300 000 0000',
      activo: true,
      fechaCreacion: '2026-01-01'
    };

    return {
      empresaActivaId: null,
      fincaActivaId: null,
      empresas: [],
      fincas: [],
      animales: [],
      servicios: [],
      pesajes: [],
      costosFijos: {},
      inversiones: [],
      traslados: [],
      operacionesDiarias: [],
      usuarios: [superAdmin],
      usuarioActual: superAdmin
    };
  }


  // ==========================================================================
  // AUTENTICACIÓN SEGURA (EMPRESA + USUARIO + CLAVE) Y CONTROL DE SESIÓN
  // ==========================================================================

  verificarAutenticacion() {
    let sesion = null;
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(this.sessionKey);
      if (raw) {
        try {
          sesion = JSON.parse(raw);
        } catch (e) {
          sesion = null;
        }
      }
    }

    if (sesion && sesion.usuarioId) {
      const user = (this.state.usuarios || []).find((u) => u.id === sesion.usuarioId || u.usuario === sesion.usuarioId);
      if (user && user.activo !== false) {
        // Si no es superadmin, verificar que la empresa activa no haya vencido
        if (user.rol !== 'superadmin') {
          const emp = (this.state.empresas || []).find((e) => e.id === (sesion.empresaId || user.empresaId));
          if (emp && this.esEmpresaVencida(emp)) {
            if (typeof localStorage !== 'undefined') {
              localStorage.removeItem(this.sessionKey);
            }
            this.mostrarPantallaLogin();
            const errBox = document.getElementById('login-error-msg');
            if (errBox) {
              errBox.textContent = `⛔ ACCESO BLOQUEADO: El tiempo de uso de Ganadero AD para "${emp.nombre}" ha vencido. Contacte al Super Administrador.`;
              errBox.classList.remove('hidden');
            }
            return;
          }
        }
        this.state.usuarioActual = user;
        if (sesion.empresaId && sesion.empresaId !== 'todas') {
          this.state.empresaActivaId = sesion.empresaId;
        } else if (user.empresaId) {
          this.state.empresaActivaId = user.empresaId;
        }
        this.ocultarPantallaLogin();
        this.iniciarPostLogin();
        return;
      }
    }

    // Sin sesión activa -> Mostrar pantalla de Login obligatoria
    this.mostrarPantallaLogin();
  }

  iniciarPostLogin() {
    const fincasPermitidas = this.getFincasEmpresa();
    if (fincasPermitidas.length > 0) {
      const tieneFincaValida = fincasPermitidas.some((f) => f.id === this.state.fincaActivaId);
      if (!tieneFincaValida) {
        this.state.fincaActivaId = fincasPermitidas[0].id;
      }
    }
    this.actualizarHeader();
    this.enlazarEventosGlobales();
    this.aplicarPermisosRBAC();
    this.mostrarVistaActiva();
    if (this.compCuadricula && typeof this.compCuadricula.cargarFilasDesdeInventario === 'function') {
      this.compCuadricula.cargarFilasDesdeInventario();
    }
    this.sincronizarConSupabaseInicial();
  }

  mostrarPantallaLogin() {
    const pLogin = document.getElementById('pantalla-login');
    if (!pLogin) return;
    pLogin.classList.remove('hidden');

    // Limpiar mensaje de error previo si lo hubiera
    const errBox = document.getElementById('login-error-msg');
    if (errBox) errBox.classList.add('hidden');

    this.configurarPantallaLogin();
    this.sincronizarConSupabaseInicial();
  }

  ocultarPantallaLogin() {
    const pLogin = document.getElementById('pantalla-login');
    if (pLogin) pLogin.classList.add('hidden');
  }

  configurarPantallaLogin() {
    const formLogin = document.getElementById('form-login');
    if (formLogin && !formLogin._listenerAdded) {
      formLogin._listenerAdded = true;
      formLogin.addEventListener('submit', (e) => {
        e.preventDefault();
        const inEmp = document.getElementById('login-empresa');
        const inUsr = document.getElementById('login-usuario');
        const inPass = document.getElementById('login-password');

        const empresaTexto = inEmp ? inEmp.value.trim() : '';
        const usuario = inUsr ? inUsr.value.trim() : '';
        const password = inPass ? inPass.value.trim() : '';

        this.ejecutarLogin({ empresaTexto, usuario, password });
      });
    }

    const btnTogglePass = document.getElementById('btn-toggle-login-pass');
    if (btnTogglePass && !btnTogglePass._listenerAdded) {
      btnTogglePass._listenerAdded = true;
      btnTogglePass.addEventListener('click', () => {
        const inPass = document.getElementById('login-password');
        if (inPass) {
          inPass.type = inPass.type === 'password' ? 'text' : 'password';
        }
      });
    }
  }

  ejecutarLogin({ empresaTexto, empresaId, usuario, password }) {
    const errBox = document.getElementById('login-error-msg');
    const mostrarError = (msg) => {
      if (errBox) {
        errBox.textContent = `❌ ${msg}`;
        errBox.classList.remove('hidden');
      } else {
        alert(msg);
      }
    };

    const textoEmp = (empresaTexto || empresaId || '').trim();
    const usrRaw = (usuario || '').trim();
    const usrClean = this.normalizarTexto(usrRaw).replace(/\s+/g, '');
    const passNorm = (password || '').trim();

    if (!usrClean) {
      mostrarError('Por favor ingresa tu nombre de usuario en la casilla correspondiente.');
      return;
    }
    if (!passNorm) {
      mostrarError('Por favor ingresa tu contraseña de acceso.');
      return;
    }

    // Identificar si es intento de acceso maestro Super Administrador (anuardavid)
    const esIntentoSuperAdmin = (
      usrClean === 'anuardavid' ||
      usrClean === 'anuar'
    );

    // Buscar usuario en la base de datos (tolerante a mayúsculas, @, email o nombre)
    let user = (this.state.usuarios || []).find((u) => {
      if (esIntentoSuperAdmin && (u.usuario === 'anuardavid' || u.rol === 'superadmin')) return true;
      const uNom = this.normalizarTexto(u.usuario).replace(/\s+/g, '');
      const uEmail = (u.email || '').trim().toLowerCase();
      return uNom === usrClean || uEmail === usrClean || (u.usuario && u.usuario.toLowerCase() === usrRaw.toLowerCase());
    });

    // Auto-garantizar superadmin anuardavid si por cualquier razón local no estuviese presente
    if (esIntentoSuperAdmin) {
      if (!user) {
        user = {
          id: 'USR-SUPER',
          usuario: 'anuardavid',
          nombre: 'Anuar David (Super Admin)',
          rol: 'superadmin',
          password: 'anuar316791',
          empresaId: null,
          fincasAsignadas: 'todas',
          email: 'anuardavid@bovitrack.com',
          activo: true,
          fechaCreacion: '2026-01-01'
        };
        if (!Array.isArray(this.state.usuarios)) this.state.usuarios = [];
        this.state.usuarios.unshift(user);
        this.guardarEstado();
      } else {
        user.usuario = 'anuardavid';
        user.rol = 'superadmin';
        user.password = 'anuar316791';
        user.activo = true;
      }
    }

    if (!user) {
      mostrarError(`El usuario "@${usrRaw}" no existe en el sistema. Verifica haberlo escrito correctamente.`);
      return;
    }

    // Validación de contraseña
    if (user.rol === 'superadmin' || esIntentoSuperAdmin) {
      const clavesValidas = [
        'anuar316791',
        (user.password || '').trim().toLowerCase()
      ];
      const claveOk = clavesValidas.some((c) => c && c.toLowerCase() === passNorm.toLowerCase()) ||
                      user.password === passNorm;
      if (!claveOk) {
        mostrarError('La contraseña ingresada para el Super Administrador es incorrecta.');
        return;
      }
    } else {
      const passGuardada = (user.password || '').trim();
      const claveOk = passGuardada === passNorm || passGuardada.toLowerCase() === passNorm.toLowerCase();
      if (!claveOk) {
        mostrarError('La contraseña ingresada es incorrecta.');
        return;
      }
    }

    if (user.activo === false) {
      mostrarError('Esta cuenta de usuario se encuentra inactiva. Contacte al administrador.');
      return;
    }

    // Validación y asignación de empresa:
    // Para Super Administrador: empresa es OPCIONAL (se deja en blanco)
    if (user.rol === 'superadmin' || esIntentoSuperAdmin) {
      let empCoincidente = null;
      if (textoEmp) {
        empCoincidente = this.buscarEmpresaFlexible(textoEmp, user);
      }
      this.state.empresaActivaId = empCoincidente ? empCoincidente.id : (this.state.empresaActivaId || this.state.empresas?.[0]?.id || null);
    } else {
      // Para usuarios regulares: NO se requiere ingresar empresa, se asocia automáticamente
      let empresaIngresada = null;
      if (textoEmp) {
        empresaIngresada = this.buscarEmpresaFlexible(textoEmp, user);
      }

      // Si no se digitó empresa, o no se encontró por texto, resolver directamente la empresa del usuario
      if (!empresaIngresada) {
        if (user.empresaId) {
          empresaIngresada = (this.state.empresas || []).find((e) => e.id === user.empresaId);
        }
        if (!empresaIngresada) {
          empresaIngresada = (this.state.empresas || []).find((e) => e.id === this.state.empresaActivaId) || (this.state.empresas?.[0] || null);
        }
      }

      if (empresaIngresada) {
        // Validar si la suscripción / tiempo de uso de la empresa ha vencido
        if (this.esEmpresaVencida(empresaIngresada)) {
          const fVenc = empresaIngresada.fechaVencimiento || 'plazo expirado';
          mostrarError(`⛔ ACCESO BLOQUEADO: El tiempo de uso de Ganadero AD para la empresa "${empresaIngresada.nombre}" ha vencido (${fVenc}). Comuníquese con el Super Administrador para renovar o ampliar el servicio.`);
          return;
        }

        // Si se suministró empresa explícita y no coincide con la del usuario:
        if (textoEmp && user.empresaId && empresaIngresada.id !== user.empresaId) {
          mostrarError(`Acceso denegado: El usuario @${user.usuario} no pertenece a "${empresaIngresada.nombre}".`);
          return;
        }

        if (!user.empresaId) {
          user.empresaId = empresaIngresada.id;
          this.guardarEstado();
        }

        this.state.empresaActivaId = empresaIngresada.id;
      } else {
        this.state.empresaActivaId = this.state.empresaActivaId || null;
      }
    }

    // Guardar sesión y activar sistema
    this.state.usuarioActual = user;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.sessionKey, JSON.stringify({
        usuarioId: user.id,
        usuarioLogin: user.usuario,
        empresaId: this.state.empresaActivaId,
        fecha: new Date().toISOString()
      }));
    }

    if (errBox) errBox.classList.add('hidden');
    this.ocultarPantallaLogin();
    this.iniciarPostLogin();
  }

  logout() {
    if (confirm('¿Deseas cerrar sesión en este dispositivo?')) {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(this.sessionKey);
      }
      this.state.usuarioActual = null;
      this.mostrarPantallaLogin();
    }
  }

  navegarA(vista) {
    this.vistaActiva = vista;
    this.mostrarVistaActiva();
  }

  iniciarPWA() {
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      const swCandidates = [
        '/sw.js',
        './sw.js',
        './frontend/public/sw.js',
        './public/sw.js'
      ];
      window.addEventListener('load', () => {
        const intentarRegistrar = (index) => {
          if (index >= swCandidates.length) return;
          const candidate = swCandidates[index];
          navigator.serviceWorker
            .register(candidate, { scope: '/' })
            .then((r) => console.log('Ganadero AD SW registrado:', candidate, r.scope))
            .catch(() => {
              navigator.serviceWorker.register(candidate)
                .then((r) => console.log('Ganadero AD SW registrado (fallback):', candidate, r.scope))
                .catch(() => intentarRegistrar(index + 1));
            });
        };
        intentarRegistrar(0);
      });
    }

    window.addEventListener('online', () => {
      this.online = true;
      this.actualizarBadgeConexion();
      this.sincronizarManualConSupabase(true);
    });

    window.addEventListener('offline', () => {
      this.online = false;
      this.actualizarBadgeConexion();
    });
  }

  actualizarBadgeConexion(estadoOverride = null) {
    const el = document.getElementById('status-red-pwa');
    if (!el) return;
    const supabaseConfigurado = this.supabase && this.supabase.estaConfigurado();

    if (!this.online) {
      el.className = 'px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 animate-pulse cursor-pointer';
      el.innerHTML = '<span class="hidden sm:inline">⚡ Modo Campo Offline</span><span class="sm:hidden">⚡ Offline</span>';
      el.title = 'Sin conexión a internet. Los cambios se guardan localmente en este equipo.';
      return;
    }

    if (estadoOverride === 'guardando') {
      el.className = 'px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] font-black bg-sky-500/20 text-sky-300 border border-sky-500/40 flex items-center gap-1 cursor-pointer animate-pulse';
      el.innerHTML = '<span class="hidden sm:inline">🔄 Guardando en Supabase...</span><span class="sm:hidden">🔄 Guardando...</span>';
      el.title = 'Sincronizando cambios con Supabase Cloud.';
      return;
    }

    if (estadoOverride === 'descargando') {
      el.className = 'px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] font-black bg-sky-500/20 text-sky-300 border border-sky-500/40 flex items-center gap-1 cursor-pointer animate-pulse';
      el.innerHTML = '<span class="hidden sm:inline">🔄 Conectando con Supabase...</span><span class="sm:hidden">🔄 Conectando...</span>';
      el.title = 'Descargando datos más recientes desde Supabase Cloud.';
      return;
    }

    if (estadoOverride === 'error') {
      el.className = 'px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1 cursor-pointer';
      el.innerHTML = '<span class="hidden sm:inline">⚠️ Supabase (Reintentar)</span><span class="sm:hidden">⚠️ Reintentar</span>';
      el.title = 'Hubo un error de conexión con Supabase. Haz clic para reintentar la sincronización.';
      return;
    }

    if (supabaseConfigurado) {
      el.className = 'px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 cursor-pointer hover:bg-emerald-500/30 transition shadow-sm';
      el.innerHTML = '<span class="hidden sm:inline">⚡ Supabase Cloud (En Línea)</span><span class="sm:hidden">⚡ En Línea</span>';
      el.title = 'Base de datos conectada con Supabase. Clic para forzar sincronización ahora.';
    } else {
      el.className = 'px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 cursor-pointer hover:bg-emerald-500/30 transition';
      el.innerHTML = '<span class="hidden sm:inline">● Conectado (Local)</span><span class="sm:hidden">● Local</span>';
      el.title = 'Internet activo. Clic para conectar con Supabase.';
    }
  }

  iniciarComponentes() {
    // 1. Cuadrícula Masiva (Uno a Uno / Manga)
    this.compCuadricula = new CuadriculaMasiva({
      containerId: 'pantalla-masivo',
      getAnimales: () => this.getAnimalesParaBusquedaUniversal(),
      getLotes: () => this.getLotesPredio(),
      onGuardarRegistros: (data) => this.guardarOperacionGrid(data),
      onTrasladarAFinca: (animal, targetFincaId) => this.trasladarAnimalInmediato(animal.id, targetFincaId),
      onReactivarAnimal: (animal) => this.reactivarAnimalExtraido(animal.id),
      onExtraerAnimal: (animal) => this.abrirModalExtraerAnimal(animal)
    });

    // 2. Panel de Alertas Zootécnicas
    this.compAlertas = new PanelAlertas({
      containerId: 'pantalla-alertas',
      getAnimales: () => this.getAnimalesPredio(),
      onAccionZootecnica: ({ animalId, tipo }) => this.manejarAccionZootecnica(animalId, tipo)
    });

    // 3. Tablas Dinámicas (Animal por Animal)
    this.compDinamica = new TablaDinamica({
      containerId: 'pantalla-dinamica',
      getAnimales: () => this.getAnimalesPredio(),
      onVerFicha: (animalId) => this.abrirFichaAnimal(animalId)
    });

    // 4. Pestaña General de Animales (Inventario Integral)
    this.compAnimales = new PestanaAnimales({
      containerId: 'pantalla-animales',
      getAnimales: () => this.getAnimalesPredio(),
      getLotes: () => this.getLotesPredio(),
      getRol: () => this.state.usuarioActual ? this.state.usuarioActual.rol : 'consultor',
      onVerFicha: (animalId) => this.abrirFichaAnimal(animalId),
      onTrasladar: (animal) => this.abrirModalTrasladoRapido(animal),
      onAbrirModuloTraslados: () => this.navegarA('traslados'),
      onCrearAnimal: (animal) => this.crearNuevoAnimal(animal),
      onActualizarAnimal: (animal) => this.actualizarAnimal(animal),
      onEliminarAnimal: (animalId) => this.eliminarAnimal(animalId),
      onExtraerAnimal: (animal) => this.abrirModalExtraerAnimal(animal),
      onReactivarAnimal: (animal) => this.reactivarAnimalExtraido(animal.id),
      onTrasladarAFinca: (animal, targetFincaId) => this.trasladarAnimalInmediato(animal.id, targetFincaId)
    });

    // 5. Modal Ficha Zootécnica del Animal
    this.compFicha = new FichaAnimal({
      containerId: 'modal-ficha-animal',
      getRol: () => this.state.usuarioActual ? this.state.usuarioActual.rol : 'consultor',
      onCerrar: () => {},
      onTrasladar: (animal) => {
        this.compFicha.cerrar();
        this.abrirModalTrasladoRapido(animal);
      },
      onEditar: (animal) => {
        this.compFicha.cerrar();
        this.navegarA('animales');
        if (this.compAnimales) {
          this.compAnimales.abrirModalEditar(animal);
        }
      },
      onEliminar: (animalId) => {
        this.compFicha.cerrar();
        this.eliminarAnimal(animalId);
      },
      onExtraer: (datosExtraer) => this.extraerAnimal(datosExtraer),
      onReactivar: (animalId) => this.reactivarAnimalExtraido(animalId)
    });

    // 6. Dashboard Gráfico & Finanzas
    this.compDashboard = new DashboardGrafico({
      containerId: 'pantalla-dashboard',
      getFincaActiva: () => this.getFincaActiva(),
      getFincasPermitidas: () => this.getFincasEmpresa(),
      getAnimales: () => this.getAnimalesPredio(),
      getCostosFijos: () => this.state.fincaActivaId ? (this.state.costosFijos[this.state.fincaActivaId] || {}) : {},
      getInversiones: () => this.state.inversiones.filter((i) => i.fincaId === this.state.fincaActivaId),
      getVentasGanado: () => this.getVentasGanadoFinca(this.state.fincaActivaId),
      onCambiarFinca: (fincaId) => this.setFincaActiva(fincaId)
    });

    // 7. Importador Excel Oficial Multi-Módulo
    this.compExcel = new ImportadorExcel({
      containerId: 'pantalla-excel',
      getFincas: () => this.getFincasEmpresa(),
      getFincaActiva: () => this.getFincaActiva(),
      onCambiarFinca: (fincaId) => this.setFincaActiva(fincaId),
      onImportConfirmada: (registrosValidos, targetFincaId, tipoCargue, fechaGlobal) => this.importarEventosMasivosExcel(registrosValidos, targetFincaId, tipoCargue, fechaGlobal)
    });

    // 8. Módulo de Administración Multi-Finca, Empresas (Multi-Tenant) & Purga
    this.compAdmin = new ModuloAdmin({
      containerId: 'pantalla-admin',
      getFincas: () => this.getFincasAdmin(),
      getFincaActiva: () => this.getFincaActiva(),
      getUsuarios: () => this.getUsuariosAdmin(),
      getTodosLosUsuarios: () => this.state.usuarios || [],
      getCostosFijos: () => this.state.fincaActivaId ? (this.state.costosFijos[this.state.fincaActivaId] || {}) : {},
      getInversiones: () => this.state.inversiones.filter((i) => i.fincaId === this.state.fincaActivaId),
      getRolActual: () => this.state.usuarioActual ? this.state.usuarioActual.rol : 'consultor',
      getUsuarioActual: () => this.state.usuarioActual,
      getEmpresas: () => this.getEmpresas(),
      getEmpresaActiva: () => this.getEmpresaActiva(),
      getAnimales: () => this.state.animales,
      getCostosFijosMap: () => this.state.costosFijos,
      getInversionesTodas: () => this.state.inversiones,
      onSeleccionarEmpresa: (empId) => this.setEmpresaActiva(empId),
      onSeleccionarFinca: (fincaId) => this.setFincaActiva(fincaId),
      onCrearEmpresa: (emp) => this.crearEmpresa(emp),
      onActualizarEmpresa: (emp) => this.actualizarEmpresa(emp),
      onEliminarEmpresa: (empId) => this.eliminarEmpresa(empId),
      onRenovarVigenciaEmpresa: (empId, meses, esIndefinido) => this.renovarVigenciaEmpresa(empId, meses, esIndefinido),
      onCambiarEstadoAccesoEmpresa: (empId, activo) => this.cambiarEstadoAccesoEmpresa(empId, activo),
      calcularVigencia: (emp) => this.calcularVigenciaEmpresa(emp),
      onActualizarPrecios: (params) => this.actualizarPreciosFinca(params),
      onGuardarCostos: (costos, fincaId) => this.guardarCostosFijos(costos, fincaId),
      onCrearInversion: (inv) => {
        if (!inv.fincaId) {
          inv.fincaId = this.state.fincaActivaId;
        }
        this.state.inversiones.push(inv);
        this.guardarEstado();
        this.compAdmin.render();
        this.compDashboard.render();
      },
      onEliminarInversion: (invId) => {
        this.state.inversiones = (this.state.inversiones || []).filter((i) => i.id !== invId);
        this.guardarEstado();
        this.compAdmin.render();
        this.compDashboard.render();
      },
      onCrearFinca: (finca) => {
        if (!finca.empresaId) {
          finca.empresaId = this.state.usuarioActual.empresaId || (this.state.empresaActivaId !== 'todas' ? this.state.empresaActivaId : null) || (this.state.empresas?.[0]?.id || null);
        }
        if (!finca.id) {
          finca.id = `FIN-${Date.now()}`;
        }
        if (!this.state.costosFijos[finca.id]) {
          this.state.costosFijos[finca.id] = {
            nomina: 0,
            insumos: 0,
            herbicidas: 0,
            maquinaria: 0,
            servicios: 0,
            otros: 0
          };
        }
        this.state.fincas.push(finca);
        if (!this.state.fincaActivaId) {
          this.state.fincaActivaId = finca.id;
        }
        this.guardarEstado();
        this.actualizarHeader();
        this.compAdmin.render();
      },
      onEliminarFinca: (fincaId) => this.eliminarFinca(fincaId),
      onPurgarFinca: (fincaId) => this.purgarFinca(fincaId),
      onPurgarEmpresa: (empresaId) => this.purgarEmpresa(empresaId),
      onPurgarBaseDatos: () => this.purgarBaseDatos(),
      onResetearSistema: () => this.resetearSistemaAblanco(),
      onCrearUsuario: (usuario) => this.crearUsuario(usuario),
      onEliminarUsuario: (usuarioId) => this.eliminarUsuario(usuarioId),
      onActualizarUsuario: (usuario) => this.actualizarUsuario(usuario),
      onCambiarPassword: (data) => this.cambiarPasswordUsuario(data.usuarioId, data.nuevaPassword),
      getSupabaseService: () => this.supabase,
      onGuardarConfigSupabase: (cfg) => {
        this.supabase.guardarConfig(cfg);
        this.actualizarBadgeConexion();
      },
      onProbarConexionSupabase: async (url, key) => {
        const res = await this.supabase.testConexion(url, key);
        this.actualizarBadgeConexion();
        return res;
      },
      onPushSupabase: async () => {
        const res = await this.supabase.subirDatosASupabase(this.state);
        this.actualizarBadgeConexion();
        return res;
      },
      onPullSupabase: async () => {
        const res = await this.supabase.descargarDatosDeSupabase();
        if (res.ok && res.datos) {
          this.integrarDatosSupabase(res.datos);
          this.refrescarVistas();
        }
        this.actualizarBadgeConexion();
        return res;
      },
      getPesajes: () => this.state.pesajes || [],
      getOperaciones: () => this.state.operacionesDiarias || [],
      onExportarBackupExcel: async () => await this.exportarCopiaSeguridadCompleta('xlsx'),
      onExportarBackupJSON: async () => await this.exportarCopiaSeguridadCompleta('json')
    });

    // 9. Módulo de Reproducción (IA / TE / Monta con Toro)
    this.compReproduccion = new ModuloReproduccion({
      containerId: 'pantalla-reproduccion',
      getAnimales: () => this.getAnimalesPredio(),
      getServicios: () => this.getServiciosPredio(),
      onRegistrarServicio: (srv) => this.registrarServicioReproductivo(srv),
      onActualizarServicio: (data) => this.actualizarEstadoServicio(data),
      onEliminarServicio: (id) => this.eliminarServicioReproductivo(id)
    });

    // 10. Módulo de Traslados de Animales entre Fincas
    this.compTraslados = new ModuloTraslados({
      containerId: 'pantalla-traslados',
      getFincas: () => this.getFincasEmpresa(),
      getFincaActiva: () => this.getFincaActiva(),
      getAnimales: () => this.state.animales,
      getTraslados: () => this.getTrasladosEmpresa(),
      getRol: () => (this.state.usuarioActual ? this.state.usuarioActual.rol : 'consultor'),
      onEjecutarTraslado: (params) => this.ejecutarTrasladoAnimales(params),
      onRevertirTraslado: (id) => this.revertirTrasladoAnimal(id),
      onVerFicha: (id) => this.abrirFichaAnimal(id)
    });

    // 11. Módulo de Consulta de Ingresos Diarios & Auditoría con Exportación Excel
    this.compIngresos = new ModuloIngresosDiarios({
      containerId: 'pantalla-ingresos',
      getFincas: () => this.getFincasEmpresa(),
      getFincaActiva: () => this.getFincaActiva(),
      getAnimales: () => this.state.animales,
      getOperaciones: (filtros) => this.getTodasLasOperaciones(filtros),
      getRol: () => (this.state.usuarioActual ? this.state.usuarioActual.rol : 'consultor'),
      onVerFicha: (id) => this.abrirFichaAnimal(id)
    });

    // 12. Módulo Especial de Nutrición Animal & Biotecnología IA
    this.compNutricion = new ModuloNutricion({
      containerId: 'pantalla-nutricion',
      getAnimales: () => this.getAnimalesPredio(),
      getFincaActiva: () => this.getFincaActiva(),
      getNutricion: () => this.state.nutricion || [],
      onGuardarPlan: (registro) => this.guardarPlanNutricion(registro),
      onEliminarRegistro: (tag) => this.eliminarPlanNutricion(tag),
      onVerFicha: (id) => this.abrirFichaAnimal(id)
    });
  }

  guardarPlanNutricion(registro) {
    if (!registro) return;
    if (!Array.isArray(this.state.nutricion)) {
      this.state.nutricion = [];
    }
    const tag = String(registro.tag || registro.animalTag || '').toUpperCase();
    const idx = this.state.nutricion.findIndex(r => String(r.tag || r.animalTag || '').toUpperCase() === tag);
    if (idx >= 0) {
      this.state.nutricion[idx] = { ...this.state.nutricion[idx], ...registro };
    } else {
      this.state.nutricion.unshift(registro);
    }
    this.guardarEstado();
  }

  eliminarPlanNutricion(tag) {
    if (!tag || !Array.isArray(this.state.nutricion)) return;
    const cleanTag = String(tag).toUpperCase();
    this.state.nutricion = this.state.nutricion.filter(r => String(r.tag || r.animalTag || '').toUpperCase() !== cleanTag);
    this.guardarEstado();
    if (this.supabase && this.supabase.estaConfigurado()) {
      this.supabase._postgrestDelete('nutricion_animales', `animal_tag=eq.${encodeURIComponent(cleanTag)}`).catch(() => {});
    }
  }

  // ==========================================================================
  // GESTIÓN MULTI-TENANT (EMPRESAS, FINCAS & AISLAMIENTO DE DATOS)
  // ==========================================================================


  normalizarTexto(str) {
    return (str || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  buscarEmpresaFlexible(textoEmp, user = null) {
    if (!textoEmp) return null;
    const tNorm = this.normalizarTexto(textoEmp);
    if (!tNorm) return null;

    const empresas = this.state.empresas || [];

    // 1. Si el usuario pertenece a una empresa, verificar si el texto coincide con SU empresa
    if (user && user.empresaId) {
      const suEmp = empresas.find((e) => e.id === user.empresaId);
      if (suEmp) {
        const nomEmpNorm = this.normalizarTexto(suEmp.nombre);
        const nitEmpNorm = this.normalizarTexto(suEmp.nit);
        const idEmpNorm = this.normalizarTexto(suEmp.id);

        if (
          nomEmpNorm === tNorm ||
          idEmpNorm === tNorm ||
          nitEmpNorm === tNorm ||
          nomEmpNorm.includes(tNorm) ||
          tNorm.includes(nomEmpNorm)
        ) {
          return suEmp;
        }

        // Comprobar si escribió el nombre de una finca de su empresa
        const fincasSuEmp = (this.state.fincas || []).filter((f) => f.empresaId === suEmp.id);
        const coincideFinca = fincasSuEmp.some((f) => {
          const fn = this.normalizarTexto(f.nombre);
          return fn === tNorm || fn.includes(tNorm) || tNorm.includes(fn);
        });
        if (coincideFinca) return suEmp;
      }
    }

    // 2. Búsqueda exacta normalizada en todas las empresas
    let emp = empresas.find((e) => {
      const n = this.normalizarTexto(e.nombre);
      const id = this.normalizarTexto(e.id);
      const nit = this.normalizarTexto(e.nit);
      return n === tNorm || id === tNorm || nit === tNorm;
    });
    if (emp) return emp;

    // 3. Búsqueda por subcadena / inclusión mutua
    emp = empresas.find((e) => {
      const n = this.normalizarTexto(e.nombre);
      return n.includes(tNorm) || tNorm.includes(n);
    });
    if (emp) return emp;

    // 4. Búsqueda por palabras clave (ej. "el porvenir" o "santa elena")
    const palabras = tNorm.split(' ').filter((w) => w.length > 2 && w !== 'sas' && w !== 'ltda');
    if (palabras.length > 0) {
      emp = empresas.find((e) => {
        const n = this.normalizarTexto(e.nombre);
        return palabras.every((p) => n.includes(p));
      });
      if (emp) return emp;
    }

    // 5. Búsqueda por nombre de finca registrada
    const fincaMatch = (this.state.fincas || []).find((f) => {
      const fn = this.normalizarTexto(f.nombre);
      return fn === tNorm || fn.includes(tNorm) || tNorm.includes(fn);
    });
    if (fincaMatch && fincaMatch.empresaId) {
      emp = empresas.find((e) => e.id === fincaMatch.empresaId);
      if (emp) return emp;
    }

    return null;
  }


  esEmpresaVencida(empresa) {
    if (!empresa) return false;
    if (empresa.activa === false) return true;
    if (empresa.tiempoIndefinido || empresa.fechaVencimiento === 'indefinido' || !empresa.fechaVencimiento) return false;
    const hoyStr = new Date().toISOString().split('T')[0];
    return empresa.fechaVencimiento < hoyStr;
  }

  calcularVigenciaEmpresa(empresa) {
    if (!empresa) {
      return { estado: 'invalido', texto: 'Desconocido', clase: 'bg-slate-100 text-slate-700', dias: 0, esVencida: true };
    }
    if (empresa.activa === false) {
      return {
        estado: 'suspendida',
        texto: '⛔ Bloqueada por Superadmin',
        clase: 'bg-rose-500/20 text-rose-300 border border-rose-500/40',
        dias: -1,
        esVencida: true
      };
    }

    if (empresa.tiempoIndefinido || empresa.fechaVencimiento === 'indefinido') {
      return {
        estado: 'indefinido',
        texto: '🟢 Activa (Tiempo Indefinido)',
        clase: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
        dias: Infinity,
        esVencida: false
      };
    }

    const hoyStr = new Date().toISOString().split('T')[0];
    const fVenc = empresa.fechaVencimiento || '2027-09-15';

    const hoyMs = new Date(hoyStr).getTime();
    const vencMs = new Date(fVenc).getTime();
    const diffDias = Math.round((vencMs - hoyMs) / (1000 * 60 * 60 * 24));

    if (diffDias < 0) {
      return {
        estado: 'vencida',
        texto: `⛔ Vencida hace ${Math.abs(diffDias)} días (${fVenc})`,
        clase: 'bg-rose-500/25 text-rose-300 border border-rose-500/50',
        dias: diffDias,
        esVencida: true
      };
    } else if (diffDias === 0) {
      return {
        estado: 'vence_hoy',
        texto: `⚠️ Vence Hoy (${fVenc})`,
        clase: 'bg-amber-500/25 text-amber-300 border border-amber-500/50',
        dias: 0,
        esVencida: false
      };
    } else if (diffDias <= 7) {
      return {
        estado: 'por_vencer',
        texto: `⚠️ Vence en ${diffDias} días (${fVenc})`,
        clase: 'bg-amber-500/25 text-amber-300 border border-amber-500/50',
        dias: diffDias,
        esVencida: false
      };
    } else {
      return {
        estado: 'activa',
        texto: `🟢 Activa (${diffDias} días • Vence: ${fVenc})`,
        clase: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
        dias: diffDias,
        esVencida: false
      };
    }
  }

  renovarVigenciaEmpresa(empresaId, meses = 1, esIndefinido = false) {
    if (!this.state.usuarioActual || this.state.usuarioActual.rol !== 'superadmin') {
      alert('Acción denegada: Solo el Super Administrador puede activar o ampliar el tiempo de uso.');
      return;
    }

    const emp = (this.state.empresas || []).find((e) => e.id === empresaId);
    if (!emp) return;

    if (esIndefinido || meses === 'indefinido') {
      emp.tiempoIndefinido = true;
      emp.fechaVencimiento = 'indefinido';
      emp.planVigencia = 'Tiempo Indefinido';
      emp.activa = true;
      this.guardarEstado();
      this.actualizarHeader();
      if (this.compAdmin) this.compAdmin.render();
      alert(`✓ La empresa "${emp.nombre}" ha sido habilitada por TIEMPO INDEFINIDO.`);
      return;
    }

    emp.tiempoIndefinido = false;
    const hoy = new Date();
    const hoyStr = hoy.toISOString().split('T')[0];
    let base = new Date();

    if (emp.fechaVencimiento && emp.fechaVencimiento !== 'indefinido') {
      if (emp.fechaVencimiento > hoyStr) {
        const partes = emp.fechaVencimiento.split('-');
        if (partes.length === 3) {
          base = new Date(parseInt(partes[0], 10), parseInt(partes[1], 10) - 1, parseInt(partes[2], 10));
        }
      }
    }

    const mInt = parseInt(meses, 10) || 1;
    base.setMonth(base.getMonth() + mInt);
    const anio = base.getFullYear();
    const mes = String(base.getMonth() + 1).padStart(2, '0');
    const dia = String(base.getDate()).padStart(2, '0');
    emp.fechaVencimiento = `${anio}-${mes}-${dia}`;
    emp.planVigencia = `${mInt} ${mInt === 1 ? 'Mes' : mInt === 12 ? 'Año' : 'Meses'}`;
    emp.activa = true;

    this.guardarEstado();
    this.actualizarHeader();
    if (this.compAdmin) this.compAdmin.render();
    alert(`✓ Licencia de "${emp.nombre}" ampliada con éxito por ${mInt} mes(es).\nNueva fecha de vencimiento: ${emp.fechaVencimiento}`);
  }

  cambiarEstadoAccesoEmpresa(empresaId, nuevoEstado) {
    if (!this.state.usuarioActual || this.state.usuarioActual.rol !== 'superadmin') {
      alert('Acción denegada: Solo el Super Administrador puede suspender o reactivar empresas.');
      return;
    }

    const emp = (this.state.empresas || []).find((e) => e.id === empresaId);
    if (!emp) return;

    emp.activa = nuevoEstado;
    this.guardarEstado();
    this.actualizarHeader();
    if (this.compAdmin) this.compAdmin.render();
    alert(`✓ Empresa "${emp.nombre}" ${nuevoEstado ? 'reactivada' : 'bloqueada/suspendida'} exitosamente.`);
  }

  getEmpresas() {
    return this.state.empresas || [];
  }

  getEmpresaActiva() {
    const empresas = this.getEmpresas();
    return empresas.find((e) => e.id === this.state.empresaActivaId) || empresas[0] || null;
  }

  setEmpresaActiva(empId) {
    this.state.empresaActivaId = empId;
    const fincasEmpresa = this.getFincasEmpresa();
    if (fincasEmpresa.length > 0 && !fincasEmpresa.some((f) => f.id === this.state.fincaActivaId)) {
      this.state.fincaActivaId = fincasEmpresa[0].id;
    }
    this.guardarEstado();
    this.actualizarHeader();
    if (this.compCuadricula) this.compCuadricula.cargarFilasDesdeInventario();
    this.mostrarVistaActiva();
  }

  crearEmpresa(empresa) {
    if (!this.state.empresas) this.state.empresas = [];
    if (!empresa.id) empresa.id = `EMP-${Date.now()}`;
    empresa.activa = empresa.activa !== false;
    empresa.fechaCreacion = new Date().toISOString().split('T')[0];

    // Calcular fecha de vencimiento según el tiempo de activación seleccionado (1, 3, 6 meses, 1 año o Indefinido)
    if (!empresa.fechaVencimiento) {
      if (empresa.mesesVigencia === 'indefinido' || empresa.tiempoIndefinido) {
        empresa.fechaVencimiento = 'indefinido';
        empresa.tiempoIndefinido = true;
        empresa.planVigencia = 'Tiempo Indefinido';
      } else {
        const meses = parseInt(empresa.mesesVigencia || 12, 10);
        const d = new Date();
        d.setMonth(d.getMonth() + meses);
        const anio = d.getFullYear();
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        empresa.fechaVencimiento = `${anio}-${mes}-${dia}`;
        empresa.planVigencia = `${mes} ${meses === 1 ? 'Mes' : meses === 12 ? 'Año' : 'Meses'}`;
        empresa.tiempoIndefinido = false;
      }
    } else if (empresa.fechaVencimiento === 'indefinido' || empresa.tiempoIndefinido) {
      empresa.fechaVencimiento = 'indefinido';
      empresa.tiempoIndefinido = true;
      empresa.planVigencia = 'Tiempo Indefinido';
    }

    this.state.empresas.push(empresa);
    this.guardarEstado();
    this.actualizarHeader();
    if (this.compAdmin) this.compAdmin.render();
    alert(`✓ Empresa "${empresa.nombre}" creada exitosamente.`);
    return empresa;
  }

  actualizarEmpresa(empresaActualizada) {
    const idx = (this.state.empresas || []).findIndex((e) => e.id === empresaActualizada.id);
    if (idx !== -1) {
      if (empresaActualizada.tiempoIndefinido || empresaActualizada.fechaVencimiento === 'indefinido') {
        empresaActualizada.tiempoIndefinido = true;
        empresaActualizada.fechaVencimiento = 'indefinido';
        empresaActualizada.planVigencia = 'Tiempo Indefinido';
      } else {
        empresaActualizada.tiempoIndefinido = false;
      }
      this.state.empresas[idx] = { ...this.state.empresas[idx], ...empresaActualizada };
      this.guardarEstado();
      this.actualizarHeader();
      if (this.compAdmin) this.compAdmin.render();
      alert(`✓ Empresa "${empresaActualizada.nombre}" actualizada.`);
    }
  }

  eliminarEmpresa(empresaId) {
    const emp = (this.state.empresas || []).find((e) => e.id === empresaId);
    const confirmacion = confirm(`¿Estás seguro de eliminar la empresa "${emp ? emp.nombre : empresaId}"?\nSe eliminarán sus fincas y animales asociados.`);
    if (!confirmacion) return;

    const fincasAEliminar = (this.state.fincas || []).filter((f) => f.empresaId === empresaId).map((f) => f.id);
    this.state.animales = (this.state.animales || []).filter((a) => !fincasAEliminar.includes(a.fincaId));
    this.state.inversiones = (this.state.inversiones || []).filter((i) => !fincasAEliminar.includes(i.fincaId));
    if (Array.isArray(this.state.servicios)) {
      this.state.servicios = this.state.servicios.filter((s) => !fincasAEliminar.includes(s.fincaId));
    }
    if (Array.isArray(this.state.pesajes)) {
      this.state.pesajes = this.state.pesajes.filter((p) => !fincasAEliminar.includes(p.fincaId));
    }
    if (Array.isArray(this.state.traslados)) {
      this.state.traslados = this.state.traslados.filter((t) => !fincasAEliminar.includes(t.fincaOrigenId) && !fincasAEliminar.includes(t.fincaDestinoId));
    }
    if (Array.isArray(this.state.operacionesDiarias)) {
      this.state.operacionesDiarias = this.state.operacionesDiarias.filter((o) => !fincasAEliminar.includes(o.fincaId));
    }
    fincasAEliminar.forEach((fid) => delete this.state.costosFijos[fid]);
    this.state.fincas = (this.state.fincas || []).filter((f) => f.empresaId !== empresaId);
    this.state.usuarios = (this.state.usuarios || []).filter((u) => u.empresaId !== empresaId || u.rol === 'superadmin');
    this.state.empresas = (this.state.empresas || []).filter((e) => e.id !== empresaId);

    if (this.state.empresaActivaId === empresaId) {
      this.state.empresaActivaId = this.state.empresas.length > 0 ? this.state.empresas[0].id : null;
    }
    const fincasRestantes = this.getFincasEmpresa();
    if (fincasRestantes.length > 0) {
      this.state.fincaActivaId = fincasRestantes[0].id;
    } else {
      this.state.fincaActivaId = null;
    }

    // Eliminar en Supabase Cloud
    if (this.supabase && typeof this.supabase.eliminarEmpresaCloud === 'function') {
      this.supabase.eliminarEmpresaCloud(empresaId).catch((err) => console.warn('[BoviTrack] Error eliminando empresa en cloud:', err));
    }

    this.guardarEstado();
    this.actualizarHeader();
    this.mostrarVistaActiva();
    alert('Empresa eliminada correctamente.');
  }

  getFincasEmpresa() {
    if (!this.state.usuarioActual) return [];
    const u = this.state.usuarioActual;
    const rol = u.rol;
    let fincas = [];
    if (rol === 'superadmin') {
      if (this.state.empresaActivaId && this.state.empresaActivaId !== 'todas') {
        fincas = (this.state.fincas || []).filter((f) => f.empresaId === this.state.empresaActivaId);
      } else {
        fincas = this.state.fincas || [];
      }
      return fincas;
    }

    // Delimitación estricta: usuarios convencionales sólo ven fincas de su empresa asignada
    const empId = u.empresaId || this.state.empresaActivaId;
    fincas = (this.state.fincas || []).filter((f) => f.empresaId === empId);

    // Delimitación por predios/fincas asignadas al usuario (1, 2 o todas)
    if (u.fincasAsignadas && u.fincasAsignadas !== 'todas') {
      if (Array.isArray(u.fincasAsignadas) && !u.fincasAsignadas.includes('todas')) {
        fincas = fincas.filter((f) => u.fincasAsignadas.includes(f.id));
      }
    }

    return fincas;
  }

  getFincaActiva() {
    const fincas = this.getFincasEmpresa();
    let activa = fincas.find((f) => f.id === this.state.fincaActivaId);
    if (!activa && fincas.length > 0) {
      const conAnimales = fincas.find((f) => (this.state.animales || []).some((a) => a.fincaId === f.id));
      activa = conAnimales || fincas[0];
      this.state.fincaActivaId = activa.id;
    }
    return activa || fincas[0] || null;
  }

  getUsuariosEmpresa() {
    if (!this.state.usuarioActual) return [];
    const rol = this.state.usuarioActual.rol;
    if (rol === 'superadmin') {
      if (this.state.empresaActivaId && this.state.empresaActivaId !== 'todas') {
        return this.state.usuarios.filter((u) => !u.empresaId || u.empresaId === this.state.empresaActivaId);
      }
      return this.state.usuarios;
    }
    // Delimitación estricta: sólo usuarios de la empresa asignada
    const empId = this.state.usuarioActual.empresaId;
    return this.state.usuarios.filter((u) => u.empresaId === empId);
  }

  // Fincas accesibles para el módulo de administración (el superadmin ve todas las de todas las empresas)
  getFincasAdmin() {
    if (!this.state.usuarioActual) return [];
    const rol = this.state.usuarioActual.rol;
    if (rol === 'superadmin') {
      return this.state.fincas || [];
    }
    const empId = this.state.usuarioActual.empresaId || this.state.empresaActivaId;
    return (this.state.fincas || []).filter((f) => f.empresaId === empId);
  }

  // Usuarios accesibles para el módulo de administración (el superadmin ve todos los del sistema)
  getUsuariosAdmin() {
    if (!this.state.usuarioActual) return [];
    const rol = this.state.usuarioActual.rol;
    if (rol === 'superadmin') {
      return this.state.usuarios || [];
    }
    const empId = this.state.usuarioActual.empresaId;
    return (this.state.usuarios || []).filter((u) => u.empresaId === empId);
  }

  setFincaActiva(fincaId) {
    const fincasPermitidas = this.getFincasEmpresa();
    const finca = fincasPermitidas.find((f) => f.id === fincaId);
    if (!finca) {
      console.warn(`Intento de acceso denegado a la finca ${fincaId} para el usuario actual.`);
      return;
    }
    this.state.fincaActivaId = finca.id;
    // Si la finca pertenece a otra empresa y no estamos en "todas", sincronizar empresaActivaId
    if (finca.empresaId && this.state.empresaActivaId !== finca.empresaId && this.state.empresaActivaId !== 'todas') {
      this.state.empresaActivaId = finca.empresaId;
    }
    this.guardarEstado();
    this.actualizarHeader();
    if (this.compCuadricula) this.compCuadricula.cargarFilasDesdeInventario();
    if (this.compDashboard) this.compDashboard.render();
    this.mostrarVistaActiva();
  }

  esUsuarioSoloConsulta() {
    if (!this.state.usuarioActual) return true;
    const r = this.state.usuarioActual.rol;
    return r === 'consultor' || r === 'consulta';
  }

  getAnimalesPredio() {
    const fActiva = this.getFincaActiva();
    if (!fActiva) return [];
    return this.state.animales.filter((a) => a.fincaId === fActiva.id);
  }

  getAnimalesParaBusquedaUniversal() {
    const fActiva = this.getFincaActiva();
    const fincaActivaId = fActiva ? fActiva.id : this.state.fincaActivaId;
    const fincasEmpresa = this.getFincasEmpresa();
    const fincaMap = new Map((this.state.fincas || []).map((f) => [f.id, f.nombre]));
    const fincasEmpresaIds = new Set(fincasEmpresa.map((f) => f.id));

    // Incluir todos los animales asociados a las fincas de la empresa (o todos si no hay restricción)
    const animalesBase = (this.state.animales || []).filter((a) =>
      fincasEmpresaIds.size === 0 || fincasEmpresaIds.has(a.fincaId)
    );

    return animalesBase.map((a) => {
      const estaEnOtraFinca = Boolean(fincaActivaId && a.fincaId && a.fincaId !== fincaActivaId);
      const estaExtraido = (a.estadoVida || a.estado) === 'inactivo' || Boolean(a.motivoBaja);
      const fincaNombre = fincaMap.get(a.fincaId) || 'Otra Finca';
      const motivoExtraido = a.motivoBaja || (estaExtraido ? 'Inactivo' : null);

      return {
        ...a,
        _estaEnOtraFinca: estaEnOtraFinca,
        _fincaNombre: fincaNombre,
        _estaExtraido: estaExtraido,
        _motivoExtraido: motivoExtraido
      };
    });
  }

  getVentasGanadoFinca(fincaId) {
    if (!fincaId) return 0;
    let total = 0;
    // 1. De operacionesDiarias
    if (Array.isArray(this.state.operacionesDiarias)) {
      this.state.operacionesDiarias.forEach((op) => {
        if (op.fincaId === fincaId && (op.modulo === 'ventas' || op.accion === 'venta_animal')) {
          total += parseFloat(op.monto || op.valorVenta || 0) || 0;
        }
      });
    }
    // 2. De animales marcados como vendidos para esa finca (sin duplicar si ya están en operaciones)
    if (Array.isArray(this.state.animales)) {
      this.state.animales.forEach((a) => {
        if (a.fincaId === fincaId && (a.motivoBaja || '').toLowerCase() === 'venta') {
          const valor = parseFloat(a.valorVenta || 0);
          if (valor > 0) {
            const yaEnOps = (this.state.operacionesDiarias || []).some(
              (op) => (op.fincaId === fincaId && (op.detalles?.animalId === a.id || op.animalId === a.id))
            );
            if (!yaEnOps) {
              total += valor;
            }
          }
        }
      });
    }
    return total;
  }

  abrirModalExtraerAnimal(animal) {
    if (!animal) return;
    if (this.compFicha) {
      this.compFicha.abrir(animal);
      this.compFicha.modalExtraerAbierto = true;
      this.compFicha.render();
    }
  }

  extraerAnimal({ animalId, motivo, comprador, valorVenta, pesoVenta, motivoMuerte, fecha, observaciones }) {
    if (this.esUsuarioSoloConsulta()) {
      alert('Acción denegada: El perfil actual es de sólo consulta.');
      return;
    }
    if (!animalId) return;
    const animal = (this.state.animales || []).find((a) => a.id === animalId);
    if (!animal) return;

    const fechaExtraccion = fecha || new Date().toISOString().split('T')[0];
    const motivoNorm = (motivo || 'Venta').trim();
    const tag = animal.identificacionTag || animal.numero || 'Sin Tag';

    // 1. Modificar estado del animal
    animal.estadoVida = 'inactivo';
    animal.estado = 'inactivo';
    animal.motivoBaja = motivoNorm;
    animal.fechaBaja = fechaExtraccion;
    animal.observacionesBaja = observaciones || '';

    if (motivoNorm.toLowerCase() === 'venta') {
      animal.comprador = comprador || '';
      animal.valorVenta = parseFloat(valorVenta) || 0;
      animal.pesoVenta = parseFloat(pesoVenta) || parseFloat(animal.ultimoPesoKg || animal.pesoActual || 0);

      // Registrar operación financiera de venta como ingreso del predio
      this.registrarActividadOperacion({
        fincaId: animal.fincaId || this.state.fincaActivaId,
        fecha: fechaExtraccion,
        modulo: 'ventas',
        accion: 'venta_animal',
        monto: animal.valorVenta,
        descripcion: `Venta de ejemplar ${tag} a ${comprador || 'Comprador'} por $${(animal.valorVenta).toLocaleString('es-CO')}`,
        animalId: animal.id,
        detalles: {
          animalId: animal.id,
          tag,
          comprador,
          pesoVenta: animal.pesoVenta,
          valorVenta: animal.valorVenta,
          observaciones
        }
      });
    } else {
      animal.motivoMuerte = motivoMuerte || observaciones || 'No especificado';
      this.registrarActividadOperacion({
        fincaId: animal.fincaId || this.state.fincaActivaId,
        fecha: fechaExtraccion,
        modulo: 'bajas',
        accion: 'muerte_animal',
        monto: 0,
        descripcion: `Baja por muerte de ejemplar ${tag}. Causa: ${animal.motivoMuerte}`,
        animalId: animal.id,
        detalles: {
          animalId: animal.id,
          tag,
          motivoMuerte: animal.motivoMuerte,
          observaciones
        }
      });
    }

    if (!animal.historialEventos) animal.historialEventos = [];
    animal.historialEventos.unshift({
      tipo: 'baja',
      motivo: motivoNorm,
      fecha: fechaExtraccion,
      comprador: animal.comprador,
      valorVenta: animal.valorVenta,
      motivoMuerte: animal.motivoMuerte,
      observaciones
    });

    this.guardarEstado();
    this.sincronizarConSupabaseDebounced();

    // Actualizar vistas
    if (this.compAnimales) this.compAnimales.render();
    if (this.compDinamica) this.compDinamica.render();
    if (this.compCuadricula) this.compCuadricula.render();
    if (this.compDashboard) this.compDashboard.render();
    if (this.compFicha && this.compFicha.animal && this.compFicha.animal.id === animalId) {
      this.compFicha.abrir(animal);
    }
  }

  reactivarAnimalExtraido(animalId, targetFincaId = null) {
    if (this.esUsuarioSoloConsulta()) {
      alert('Acción denegada: El perfil actual es de sólo consulta.');
      return;
    }
    if (!animalId) return;
    const animal = (this.state.animales || []).find((a) => a.id === animalId);
    if (!animal) return;

    const fincaDestino = targetFincaId || this.state.fincaActivaId || animal.fincaId;
    const tag = animal.identificacionTag || animal.numero || 'Sin Tag';

    animal.estadoVida = 'activo';
    animal.estado = 'activo';
    animal.motivoBaja = null;
    animal.fechaBaja = null;
    animal.fincaId = fincaDestino;

    if (!animal.historialEventos) animal.historialEventos = [];
    animal.historialEventos.unshift({
      tipo: 'reactivacion',
      fecha: new Date().toISOString().split('T')[0],
      fincaId: fincaDestino,
      descripcion: `Reactivación e ingreso al hato activo`
    });

    this.registrarActividadOperacion({
      fincaId: fincaDestino,
      fecha: new Date().toISOString().split('T')[0],
      modulo: 'animales',
      accion: 'reactivacion_animal',
      monto: 0,
      descripcion: `Reactivación del ejemplar ${tag} en el hato activo`,
      animalId: animal.id
    });

    this.guardarEstado();
    this.sincronizarConSupabaseDebounced();

    if (this.compAnimales) this.compAnimales.render();
    if (this.compDinamica) this.compDinamica.render();
    if (this.compCuadricula) this.compCuadricula.render();
    if (this.compDashboard) this.compDashboard.render();
    if (this.compFicha && this.compFicha.animal && this.compFicha.animal.id === animalId) {
      this.compFicha.abrir(animal);
    }
  }

  trasladarAnimalInmediato(animalId, targetFincaId = null) {
    if (this.esUsuarioSoloConsulta()) {
      alert('Acción denegada: El perfil actual es de sólo consulta.');
      return;
    }
    if (!animalId) return;
    const animal = (this.state.animales || []).find((a) => a.id === animalId);
    if (!animal) return;

    const destinoId = targetFincaId || this.state.fincaActivaId;
    if (!destinoId || animal.fincaId === destinoId) return;

    const fincaOrigen = (this.state.fincas || []).find((f) => f.id === animal.fincaId);
    const fincaDestino = (this.state.fincas || []).find((f) => f.id === destinoId);
    const tag = animal.identificacionTag || animal.numero || 'Sin Tag';
    const origenNombre = fincaOrigen ? fincaOrigen.nombre : animal.fincaId;
    const destinoNombre = fincaDestino ? fincaDestino.nombre : destinoId;

    animal.fincaId = destinoId;
    // Si estaba inactivo, lo reactivamos en la nueva finca
    if (animal.estadoVida === 'inactivo' || animal.motivoBaja) {
      animal.estadoVida = 'activo';
      animal.estado = 'activo';
      animal.motivoBaja = null;
      animal.fechaBaja = null;
    }

    const hoy = new Date().toISOString().split('T')[0];
    if (!animal.historialEventos) animal.historialEventos = [];
    animal.historialEventos.unshift({
      tipo: 'traslado',
      fecha: hoy,
      origenFincaId: fincaOrigen ? fincaOrigen.id : '',
      destinoFincaId: destinoId,
      descripcion: `Traslado desde ${origenNombre} hacia ${destinoNombre}`
    });

    if (!Array.isArray(this.state.traslados)) this.state.traslados = [];
    this.state.traslados.unshift({
      id: `TR-${Date.now()}-${tag}`,
      animalId: animal.id,
      tag: tag,
      fecha: hoy,
      fincaOrigenId: fincaOrigen ? fincaOrigen.id : '',
      fincaOrigenNombre: origenNombre,
      fincaDestinoId: destinoId,
      fincaDestinoNombre: destinoNombre,
      estado: 'completado',
      observaciones: 'Traslado directo inter-finca'
    });

    this.registrarActividadOperacion({
      fincaId: destinoId,
      fecha: hoy,
      modulo: 'traslados',
      accion: 'traslado_inmediato',
      monto: 0,
      descripcion: `Traslado del ejemplar ${tag} desde ${origenNombre} hacia ${destinoNombre}`,
      animalId: animal.id
    });

    this.guardarEstado();
    this.sincronizarConSupabaseDebounced();

    if (this.compAnimales) this.compAnimales.render();
    if (this.compDinamica) this.compDinamica.render();
    if (this.compCuadricula) this.compCuadricula.render();
    if (this.compDashboard) this.compDashboard.render();
    if (this.compFicha && this.compFicha.animal && this.compFicha.animal.id === animalId) {
      this.compFicha.abrir(animal);
    }
  }

  getLotesPredio() {
    const list = this.getAnimalesPredio();
    return [...new Set(list.map((a) => a.lote || 'General'))].filter(Boolean);
  }

  getServiciosPredio() {
    if (!this.state.servicios) this.state.servicios = [];
    return this.state.servicios.filter((s) => s.fincaId === this.state.fincaActivaId);
  }

  registrarServicioReproductivo(srv) {
    if (!this.state.servicios) this.state.servicios = [];
    srv.fincaId = this.state.fincaActivaId;
    this.state.servicios.unshift(srv);

    // Actualizar estado reproductivo de la hembra a "Servida"
    const animal = this.state.animales.find(
      (a) => (a.identificacionTag === srv.tag || a.numero === srv.tag) && a.fincaId === this.state.fincaActivaId
    );
    if (animal) {
      animal.estadoReproductivo = 'Servida';
      if (!animal.serviciosReproductivos) animal.serviciosReproductivos = [];
      animal.serviciosReproductivos.unshift(srv);
    }

    this.guardarEstado();
    this.compAnimales.render();
    this.compDinamica.render();
    this.compDashboard.render();
  }

  actualizarEstadoServicio({ id, tag, nuevoEstado, diasGestacion }) {
    if (!this.state.servicios) this.state.servicios = [];
    const srv = this.state.servicios.find((s) => s.id === id);
    if (srv) {
      srv.resultado = nuevoEstado;
    }

    const animal = this.state.animales.find(
      (a) => (a.identificacionTag === tag || a.numero === tag) && a.fincaId === this.state.fincaActivaId
    );
    if (animal) {
      if (nuevoEstado === 'Preñada Confirmada') {
        animal.estadoReproductivo = 'Preñada';
        animal.diasGestacionActual = diasGestacion || 60;
      } else if (nuevoEstado === 'Vacía / Repitió') {
        animal.estadoReproductivo = 'Vacía';
        animal.diasGestacionActual = 0;
      }
    }

    this.guardarEstado();
    this.compAnimales.render();
    this.compDinamica.render();
    this.compDashboard.render();
    this.compAlertas.render();
  }

  eliminarServicioReproductivo(id) {
    if (!this.state.servicios) this.state.servicios = [];
    this.state.servicios = this.state.servicios.filter((s) => s.id !== id);
    this.guardarEstado();
  }

  abrirFichaAnimal(animalId) {
    const animal = this.state.animales.find((a) => a.id === animalId);
    if (!animal) return;

    const aTag = animal.identificacionTag || animal.numero;

    // 1. Buscar partos de este animal (combinar partosPrevios, historialEventos, operacionesDiarias, inventario y fechaUltimoParto)
    const partos = (animal.partosPrevios || []).map((p) => ({
      ...p,
      madreId: animal.id,
      madreTag: aTag
    }));

    // Integrar partos desde historialEventos
    if (Array.isArray(animal.historialEventos)) {
      animal.historialEventos.forEach((ev) => {
        if (ev && ev.tipo === 'parto') {
          const fEv = ev.fecha || ev.fechaParto;
          const ya = partos.some((p) => ((p.fechaParto === fEv || p.fecha === fEv) && (p.tagCria === ev.criaTag || p.criaTag === ev.criaTag)) || (p.tagCria && ev.criaTag && String(p.tagCria).trim().toUpperCase() === String(ev.criaTag).trim().toUpperCase()));
          if (!ya) {
            partos.unshift({
              madreId: animal.id,
              madreTag: aTag,
              fechaParto: fEv,
              fecha: fEv,
              tagCria: ev.criaTag || 'Cría Registrada',
              sexoCria: ev.sexoCria || 'hembra',
              pesoAlNacerKg: ev.pesoAlNacerKg || 32,
              tipoParto: ev.tipoParto || 'Normal',
              observaciones: ev.observaciones || 'Historial de eventos'
            });
          }
        }
      });
    }

    // Integrar partos registrados en operacionesDiarias
    if (Array.isArray(this.state.operacionesDiarias)) {
      const aTagUpper = String(aTag || '').trim().toUpperCase();
      this.state.operacionesDiarias.forEach((op) => {
        if (op && (op.accion === 'partos' || op.accion === 'parto')) {
          const opTag = String(op.tag || op.animalTag || '').trim().toUpperCase();
          const opId = String(op.animalId || '').trim();
          if ((aTagUpper && opTag === aTagUpper) || (animal.id && opId === String(animal.id).trim())) {
            const fOp = op.fecha || op.fechaParto;
            const cTag = op.tagCria || op.criaTag || (op.detalles && op.detalles.tagCria);
            const ya = partos.some((p) => (cTag && (p.tagCria === cTag || p.criaTag === cTag)) || ((p.fechaParto === fOp || p.fecha === fOp)));
            if (!ya) {
              partos.unshift({
                madreId: animal.id,
                madreTag: aTag,
                fechaParto: fOp,
                fecha: fOp,
                tagCria: cTag || 'Cría Registrada',
                sexoCria: op.sexoCria || (op.detalles && op.detalles.sexoCria) || 'hembra',
                pesoAlNacerKg: op.pesoAlNacerKg || (op.detalles && op.detalles.pesoAlNacerKg) || 32,
                tipoParto: op.tipoParto || (op.detalles && op.detalles.tipoParto) || 'Normal',
                observaciones: op.observaciones || 'Operación diaria'
              });
            }
          }
        }
      });
    }

    // Integrar crías nacidas registradas en el inventario que tengan a esta hembra como madre
    if (Array.isArray(this.state.animales)) {
      const aTagUpper = String(aTag || '').trim().toUpperCase();
      this.state.animales.forEach((cria) => {
        if (!cria) return;
        const cMadreTag = String(cria.madreTag || cria.madre || '').trim().toUpperCase();
        const cTagUpper = String(cria.identificacionTag || cria.numero || '').trim().toUpperCase();
        if (cMadreTag && aTagUpper && cMadreTag === aTagUpper && cTagUpper !== aTagUpper) {
          const ya = partos.some((p) => {
            const pt = String(p.tagCria || p.criaTag || '').trim().toUpperCase();
            return pt && pt === cTagUpper;
          });
          if (!ya) {
            partos.unshift({
              madreId: animal.id,
              madreTag: aTag,
              fechaParto: cria.fechaNacimiento || animal.fechaUltimoParto || 'Fecha registrada',
              fecha: cria.fechaNacimiento || animal.fechaUltimoParto || 'Fecha registrada',
              tagCria: cria.identificacionTag || cria.numero,
              sexoCria: cria.sexo || 'hembra',
              pesoAlNacerKg: cria.ultimoPesoKg || 32,
              tipoParto: 'Normal',
              observaciones: `Hijo/a: ${cria.nombreAlias || cria.identificacionTag}`
            });
          }
        }
      });
    }

    // Integrar fechaUltimoParto si no está en partos
    const ultParto = animal.fechaUltimoParto || animal.ultimoParto;
    if (ultParto) {
      const uNorm = String(ultParto).trim();
      const yaEsta = partos.some((p) => String(p.fechaParto || p.fecha || '').trim() === uNorm);
      if (!yaEsta) {
        partos.unshift({
          madreId: animal.id,
          madreTag: aTag,
          fechaParto: uNorm,
          fecha: uNorm,
          tagCria: animal.tagCria || animal.criaTag || 'Cría Registrada',
          sexoCria: animal.sexoCria || 'hembra',
          pesoAlNacerKg: animal.pesoCria || animal.pesoAlNacerKg || 32,
          tipoParto: animal.tipoParto || 'Normal (Eutócico)',
          observaciones: 'Parto registrado en ficha del animal'
        });
      }
    }

    // 2. Historial de pesajes completo
    const pesajes = (this.state.pesajes || []).filter(
      (p) => p && (p.animalId === animal.id || p.tag === animal.identificacionTag || p.animalTag === animal.identificacionTag)
    );
    if (pesajes.length === 0 && animal.ultimoPesoKg) {
      pesajes.push({
        id: `PES-${animal.fincaId}-${String(animal.identificacionTag).replace(/[^A-Za-z0-9_-]/g, '_')}`,
        animalId: animal.id,
        tag: animal.identificacionTag,
        fecha: animal.fechaUltimoPesaje || new Date().toISOString().split('T')[0],
        peso: Number(animal.ultimoPesoKg),
        pesoNuevo: Number(animal.ultimoPesoKg),
        gdp: animal.gdpPromedioGDia ? Number(animal.gdpPromedioGDia) : null,
        responsable: 'Inventario'
      });
    }

    const servicios = this.getServiciosPredio();
    this.compFicha.mostrar(animal, partos, pesajes, servicios);
  }

  crearNuevoAnimal(animal) {
    if (this.esUsuarioSoloConsulta()) {
      alert('Acción denegada: El perfil actual es de sólo consulta.');
      return;
    }

    if (!this.state.fincaActivaId) {
      alert('No hay ninguna finca activa seleccionada. Por favor crea o selecciona una finca primero.');
      return;
    }

    animal.fincaId = this.state.fincaActivaId;
    this.state.animales.push(animal);
    this.guardarEstado();

    const fAct = this.getFincaActiva();
    const nombreF = fAct ? ` en ${fAct.nombre}` : '';
    alert(`✓ Ejemplar ${animal.identificacionTag || animal.numeroTag || animal.nombre || ''} registrado con éxito${nombreF}.`);

    this.compAnimales.render();
    this.compCuadricula.cargarFilasDesdeInventario();
    this.compCuadricula.render();
    this.compDinamica.render();
    this.compDashboard.render();
    this.compAlertas.render();
  }

  actualizarAnimal(animalActualizado) {
    if (this.esUsuarioSoloConsulta()) {
      alert('Acción denegada: El perfil actual es de sólo consulta.');
      return;
    }

    const idx = (this.state.animales || []).findIndex((a) => a.id === animalActualizado.id);
    if (idx === -1) {
      alert('No se encontró el ejemplar a modificar en la base de datos.');
      return;
    }

    // Preservar ID y fincaId, actualizar todos los campos zootécnicos modificados
    this.state.animales[idx] = {
      ...this.state.animales[idx],
      ...animalActualizado
    };

    if (animalActualizado.ultimoPesoKg !== undefined && animalActualizado.ultimoPesoKg !== null && animalActualizado.ultimoPesoKg !== '') {
      const nuevoPeso = parseFloat(animalActualizado.ultimoPesoKg);
      const hoy = new Date().toISOString().split('T')[0];
      const fechaPesaje = animalActualizado.fechaUltimoPesaje || hoy;

      this.state.animales[idx].pesoActual = nuevoPeso;
      this.state.animales[idx].ultimoPesoKg = nuevoPeso;
      this.state.animales[idx].fechaUltimoPesaje = fechaPesaje;
      if (animalActualizado.gdpPromedioGDia !== undefined) {
        this.state.animales[idx].gdpPromedioGDia = animalActualizado.gdpPromedioGDia ? parseFloat(animalActualizado.gdpPromedioGDia) : null;
      }

      // Registrar en pesajes y operacionesDiarias si no existe ya para esta fecha y peso
      if (!Array.isArray(this.state.pesajes)) this.state.pesajes = [];
      const anm = this.state.animales[idx];
      const yaRegistradoHoy = this.state.pesajes.some(
        (p) => (p.animalId === anm.id || p.tag === anm.identificacionTag) && p.fecha === fechaPesaje && Number(p.peso || p.pesoNuevo) === nuevoPeso
      );

      if (!yaRegistradoHoy) {
        const idPesaje = `PES-${anm.fincaId}-${String(anm.identificacionTag).replace(/[^A-Za-z0-9_-]/g, '_')}-${fechaPesaje}`;
        this.state.pesajes.unshift({
          id: idPesaje,
          fecha: fechaPesaje,
          hora: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          fincaId: anm.fincaId,
          animalId: anm.id,
          tag: anm.identificacionTag,
          animalTag: anm.identificacionTag,
          nombreAlias: anm.nombreAlias || '',
          especie: anm.especie || 'bovino',
          raza: anm.raza || '',
          categoria: anm.categoria || '',
          lote: anm.lote || 'General',
          pesoNuevo: nuevoPeso,
          peso: nuevoPeso,
          gdp: anm.gdpPromedioGDia || null,
          responsable: this.state.usuarioActual ? this.state.usuarioActual.nombre : 'Operador',
          observaciones: 'Registro desde ficha de inventario'
        });

        this.registrarActividadOperacion({
          id: `ACT-${idPesaje}`,
          fecha: fechaPesaje,
          accion: 'pesajes',
          modulo: 'pesajes',
          tag: anm.identificacionTag,
          animalId: anm.id,
          nombreAlias: anm.nombreAlias,
          fincaId: anm.fincaId,
          detalle: `Pesaje registrado: ${nuevoPeso} Kg` + (anm.gdpPromedioGDia ? ` (GDP: ${anm.gdpPromedioGDia} g/d)` : ''),
          responsable: this.state.usuarioActual ? this.state.usuarioActual.nombre : 'Operador',
          peso: nuevoPeso,
          gdp: anm.gdpPromedioGDia || null
        });
      }
    }

    this.guardarEstado();

    this.compAnimales.render();
    this.compCuadricula.cargarFilasDesdeInventario();
    this.compCuadricula.render();
    this.compDinamica.render();
    this.compDashboard.render();
    this.compAlertas.render();

    // Si la ficha zootécnica de este animal está abierta, actualizarla
    if (this.compFicha && this.compFicha.animal && this.compFicha.animal.id === animalActualizado.id) {
      this.abrirFichaAnimal(animalActualizado.id);
    }

    alert(`✓ Ejemplar "${animalActualizado.identificacionTag || animalActualizado.numero || 'Animal'}" actualizado exitosamente.`);
  }

  eliminarAnimal(animalId) {
    if (this.esUsuarioSoloConsulta()) {
      alert('Acción denegada: El perfil actual es de sólo consulta.');
      return;
    }

    // Capturar datos del animal antes de eliminarlo para el cloud delete
    const animal = (this.state.animales || []).find((a) => a.id === animalId || a.identificacionTag === animalId);
    const realAnimalId = animal ? animal.id : animalId;
    const animalTag = animal ? (animal.identificacionTag || animal.tag || animal.numeroTag || animal.nombre || animalId) : animalId;
    const fincaId = animal ? animal.fincaId : (this.state.fincaActivaId || null);

    this.state.animales = (this.state.animales || []).filter((a) => a.id !== realAnimalId && a.identificacionTag !== animalTag);

    // Limpiar pesajes, servicios y nutrición asociados al animal
    if (Array.isArray(this.state.pesajes)) {
      this.state.pesajes = this.state.pesajes.filter((p) => p.animalId !== realAnimalId && p.tag !== animalTag && p.animalTag !== animalTag);
    }
    if (Array.isArray(this.state.servicios)) {
      this.state.servicios = this.state.servicios.filter((s) => s.animalId !== realAnimalId && s.tag !== animalTag && s.animalTag !== animalTag);
    }
    if (Array.isArray(this.state.nutricion)) {
      this.state.nutricion = this.state.nutricion.filter((n) => n.animalId !== realAnimalId && n.tag !== animalTag && n.animalTag !== animalTag);
    }

    // Eliminar en Supabase Cloud
    if (this.supabase && typeof this.supabase.eliminarAnimalCloud === 'function') {
      this.supabase.eliminarAnimalCloud(realAnimalId, animalTag, fincaId).catch((err) => console.warn('[BoviTrack] Error eliminando animal en cloud:', err));
    }

    this.guardarEstado();

    this.compAnimales.render();
    if (this.compCuadricula) {
      this.compCuadricula.cargarFilasDesdeInventario();
      this.compCuadricula.render();
    }
    if (this.compDinamica) this.compDinamica.render();
    if (this.compDashboard) this.compDashboard.render();
    if (this.compAlertas) this.compAlertas.render();
  }

  eliminarFinca(fincaId) {
    if (this.esUsuarioSoloConsulta()) {
      alert('Acción denegada: El perfil actual es de sólo consulta.');
      return;
    }

    // Remover animales, costos, inversiones, pesajes, servicios, traslados, operaciones y nutrición asociados
    this.state.animales = (this.state.animales || []).filter((a) => a.fincaId !== fincaId);
    this.state.inversiones = (this.state.inversiones || []).filter((i) => i.fincaId !== fincaId);
    if (Array.isArray(this.state.servicios)) {
      this.state.servicios = this.state.servicios.filter((s) => s.fincaId !== fincaId);
    }
    if (Array.isArray(this.state.pesajes)) {
      this.state.pesajes = this.state.pesajes.filter((p) => p.fincaId !== fincaId);
    }
    if (Array.isArray(this.state.nutricion)) {
      this.state.nutricion = this.state.nutricion.filter((n) => n.fincaId !== fincaId);
    }
    if (Array.isArray(this.state.traslados)) {
      this.state.traslados = this.state.traslados.filter((t) => t.fincaOrigenId !== fincaId && t.fincaDestinoId !== fincaId);
    }
    if (Array.isArray(this.state.operacionesDiarias)) {
      this.state.operacionesDiarias = this.state.operacionesDiarias.filter((o) => o.fincaId !== fincaId);
    }
    delete this.state.costosFijos[fincaId];
    if (this.state._costosModificadosLocalmente) {
      delete this.state._costosModificadosLocalmente[fincaId];
    }
    if (this.state._preciosModificadosLocalmente) {
      delete this.state._preciosModificadosLocalmente[fincaId];
    }

    const fincaObj = (this.state.fincas || []).find((f) => f.id === fincaId || f.codigo === fincaId);
    if (!Array.isArray(this.state._fincasEliminadas)) {
      this.state._fincasEliminadas = [];
    }
    if (!this.state._fincasEliminadas.includes(fincaId)) {
      this.state._fincasEliminadas.push(fincaId);
    }
    if (fincaObj && fincaObj.id && !this.state._fincasEliminadas.includes(fincaObj.id)) {
      this.state._fincasEliminadas.push(fincaObj.id);
    }
    if (fincaObj && fincaObj.codigo && !this.state._fincasEliminadas.includes(fincaObj.codigo)) {
      this.state._fincasEliminadas.push(fincaObj.codigo);
    }

    const realFincaId = fincaObj ? fincaObj.id : fincaId;
    this.state.fincas = (this.state.fincas || []).filter((f) => f.id !== realFincaId && f.id !== fincaId);

    // Limpiar fincaId de usuarios que la tengan en su arreglo de fincasAsignadas
    if (Array.isArray(this.state.usuarios)) {
      this.state.usuarios.forEach((u) => {
        if (Array.isArray(u.fincasAsignadas)) {
          u.fincasAsignadas = u.fincasAsignadas.filter((fid) => fid !== fincaId);
          if (u.fincasAsignadas.length === 0) {
            u.fincasAsignadas = 'todas';
          }
        }
      });
    }

    // Si era la finca activa, seleccionar la primera permitida disponible
    const fincasRestantes = this.getFincasEmpresa();
    if (this.state.fincaActivaId === fincaId) {
      this.state.fincaActivaId = fincasRestantes.length > 0 ? fincasRestantes[0].id : (this.state.fincas[0]?.id || null);
    }

    // Eliminar inmediatamente en Supabase Cloud
    if (this.supabase && typeof this.supabase.eliminarFincaCloud === 'function') {
      this.supabase.eliminarFincaCloud(fincaId).then((res) => {
        if (res && res.ok) {
          console.log(`✓ Finca ${fincaId} purgada en Supabase Cloud.`);
        }
      }).catch((err) => console.warn('[BoviTrack] Error eliminando finca en cloud:', err));
    }

    this.guardarEstado();
    this.actualizarHeader();
    if (this.compAdmin) this.compAdmin.render();
    if (this.compAnimales) this.compAnimales.render();
    if (this.compCuadricula) {
      this.compCuadricula.cargarFilasDesdeInventario();
      this.compCuadricula.render();
    }
    if (this.compDinamica) this.compDinamica.render();
    if (this.compDashboard) this.compDashboard.render();
    if (this.compAlertas) this.compAlertas.render();

    alert('Finca eliminada correctamente.');
  }

  async actualizarPreciosFinca({ leche, carne, fincaId }) {
    const targetId = fincaId || this.state.fincaActivaId;
    const f = (this.state.fincas || []).find((item) => item.id === targetId);
    if (f) {
      f.precioLecheLitro = Number(leche);
      f.precioCarneKgPie = Number(carne);
    }
    if (!this.state._preciosModificadosLocalmente) {
      this.state._preciosModificadosLocalmente = {};
    }
    this.state._preciosModificadosLocalmente[targetId] = {
      precioLecheLitro: Number(leche),
      precioCarneKgPie: Number(carne),
      timestamp: Date.now()
    };
    this.guardarEstado();
    if (this.compDashboard) this.compDashboard.render();
    if (this.compAdmin) this.compAdmin.render();

    // Persistir de inmediato en Supabase Cloud si está conectado
    if (f && this.supabase && typeof this.supabase.estaConfigurado === 'function' && this.supabase.estaConfigurado()) {
      try {
        const payload = [this.supabase.mapearFincaLocalACloud(f)];
        await this.supabase._postgrestUpsert('fincas', payload, 'id', 10000);
        console.log(`✓ Precios de finca ${f.nombre} (${targetId}) persistidos en Supabase Cloud.`);
      } catch (err) {
        console.warn('Aviso sincronizando precios de finca en Supabase:', err.message);
      }
    }
    alert('Precios de referencia actualizados exitosamente.');
  }

  async guardarCostosFijos(costos, fincaId) {
    const targetId = fincaId || this.state.fincaActivaId;
    const payloadLimpio = {
      nomina: Number(costos.nomina || 0),
      insumos: Number(costos.insumos || 0),
      herbicidas: Number(costos.herbicidas || 0),
      maquinaria: Number(costos.maquinaria || 0),
      servicios: Number(costos.servicios || 0),
      otros: Number(costos.otros || 0)
    };
    if (targetId) {
      this.state.costosFijos[targetId] = payloadLimpio;
      if (!this.state._costosModificadosLocalmente) {
        this.state._costosModificadosLocalmente = {};
      }
      this.state._costosModificadosLocalmente[targetId] = {
        ...payloadLimpio,
        timestamp: Date.now()
      };
    }
    this.guardarEstado();
    if (this.compDashboard) this.compDashboard.render();
    if (this.compAdmin) this.compAdmin.render();

    // Persistir de inmediato en Supabase Cloud si está conectado
    if (targetId && this.supabase && typeof this.supabase.estaConfigurado === 'function' && this.supabase.estaConfigurado()) {
      try {
        const payloadCostos = [{
          finca_id: targetId,
          ...payloadLimpio
        }];
        await this.supabase._postgrestUpsert('costos_fijos_finca', payloadCostos, 'finca_id', 10000);
        console.log(`✓ Costos fijos de predio ${targetId} persistidos en Supabase Cloud.`);
      } catch (err) {
        console.warn('Aviso sincronizando costos fijos en Supabase:', err.message);
      }
    }
    alert('Costos fijos guardados exitosamente para este predio.');
  }

  purgarBaseDatos() {
    if (this.state.usuarioActual.rol !== 'administrador' && this.state.usuarioActual.rol !== 'superadmin') {
      alert('Operación denegada: Sólo el Administrador o Super Administrador puede purgar la base de datos.');
      return;
    }

    // Vaciar completamente inventario de animales, inversiones, servicios, pesajes, traslados y operaciones
    this.state.animales = [];
    this.state.inversiones = [];
    this.state.servicios = [];
    this.state.pesajes = [];
    this.state.traslados = [];
    this.state.operacionesDiarias = [];

    // Purgar en Supabase Cloud
    if (this.supabase && typeof this.supabase.purgarBaseDatosTotalCloud === 'function') {
      this.supabase.purgarBaseDatosTotalCloud().catch((err) => console.warn('[BoviTrack] Error purgando BD en cloud:', err));
    }

    this.guardarEstado();

    alert('✓ Base de datos reiniciada. Se han eliminado todos los animales (0 ejemplares).');

    if (this.compAnimales) this.compAnimales.render();
    if (this.compCuadricula) {
      this.compCuadricula.cargarFilasDesdeInventario();
      this.compCuadricula.render();
    }
    if (this.compDinamica) this.compDinamica.render();
    if (this.compDashboard) this.compDashboard.render();
    if (this.compAlertas) this.compAlertas.render();
    if (this.compAdmin) this.compAdmin.render();
    if (this.compReproduccion) this.compReproduccion.render();
    if (this.compTraslados) this.compTraslados.render();
    if (this.compIngresos) this.compIngresos.render();

    this.vistaActiva = 'animales';
    this.mostrarVistaActiva();
  }

  purgarFinca(fincaId) {
    if (this.state.usuarioActual.rol !== 'administrador' && this.state.usuarioActual.rol !== 'superadmin') {
      alert('Operación denegada: Sólo el Administrador o Super Administrador puede vaciar el hato de una finca.');
      return;
    }

    const finca = (this.state.fincas || []).find((f) => f.id === fincaId);
    const nombreFinca = finca ? finca.nombre : fincaId;

    const animalesAntes = (this.state.animales || []).length;
    this.state.animales = (this.state.animales || []).filter((a) => a.fincaId !== fincaId);
    const eliminados = animalesAntes - this.state.animales.length;

    if (Array.isArray(this.state.servicios)) {
      this.state.servicios = this.state.servicios.filter((s) => s.fincaId !== fincaId);
    }
    if (Array.isArray(this.state.pesajes)) {
      this.state.pesajes = this.state.pesajes.filter((p) => p.fincaId !== fincaId);
    }
    if (Array.isArray(this.state.operacionesDiarias)) {
      this.state.operacionesDiarias = this.state.operacionesDiarias.filter((o) => o.fincaId !== fincaId);
    }
    if (Array.isArray(this.state.traslados)) {
      this.state.traslados = this.state.traslados.filter((t) => t.fincaOrigenId !== fincaId && t.fincaDestinoId !== fincaId);
    }
    if (Array.isArray(this.state.nutricion)) {
      this.state.nutricion = this.state.nutricion.filter((n) => n.fincaId !== fincaId);
    }

    // Purgar en Supabase Cloud
    if (this.supabase && typeof this.supabase.purgarFincaCloud === 'function') {
      this.supabase.purgarFincaCloud(fincaId).catch((err) => console.warn('[BoviTrack] Error purgando finca en cloud:', err));
    }

    this.guardarEstado();
    alert(`✓ Hato de la finca "${nombreFinca}" vaciado exitosamente (${eliminados} animales eliminados).`);

    if (this.compAnimales) this.compAnimales.render();
    if (this.compCuadricula) {
      this.compCuadricula.cargarFilasDesdeInventario();
      this.compCuadricula.render();
    }
    if (this.compDinamica) this.compDinamica.render();
    if (this.compDashboard) this.compDashboard.render();
    if (this.compAlertas) this.compAlertas.render();
    if (this.compAdmin) this.compAdmin.render();
    if (this.compReproduccion) this.compReproduccion.render();
  }

  purgarEmpresa(empresaId) {
    if (this.state.usuarioActual.rol !== 'superadmin') {
      alert('Operación denegada: Sólo el Super Administrador puede purgar una empresa completa.');
      return;
    }

    const emp = (this.state.empresas || []).find((e) => e.id === empresaId);
    const nombreEmp = emp ? emp.nombre : empresaId;

    const fincasDeEmpresa = (this.state.fincas || []).filter((f) => f.empresaId === empresaId);
    const idsFincas = new Set(fincasDeEmpresa.map((f) => f.id));

    this.state.animales = (this.state.animales || []).filter((a) => !idsFincas.has(a.fincaId));

    if (Array.isArray(this.state.servicios)) {
      this.state.servicios = this.state.servicios.filter((s) => !idsFincas.has(s.fincaId));
    }
    if (Array.isArray(this.state.pesajes)) {
      this.state.pesajes = this.state.pesajes.filter((p) => !idsFincas.has(p.fincaId));
    }
    if (Array.isArray(this.state.operacionesDiarias)) {
      this.state.operacionesDiarias = this.state.operacionesDiarias.filter((o) => !idsFincas.has(o.fincaId));
    }
    if (Array.isArray(this.state.traslados)) {
      this.state.traslados = this.state.traslados.filter((t) => !idsFincas.has(t.fincaOrigenId) && !idsFincas.has(t.fincaDestinoId));
    }

    idsFincas.forEach((fid) => {
      delete this.state.costosFijos[fid];
    });
    this.state.inversiones = (this.state.inversiones || []).filter((i) => !idsFincas.has(i.fincaId));

    this.state.fincas = (this.state.fincas || []).filter((f) => f.empresaId !== empresaId);

    const fincasRestantes = this.getFincasEmpresa();
    if (fincasRestantes.length > 0) {
      this.state.fincaActivaId = fincasRestantes[0].id;
    } else {
      this.state.fincaActivaId = null;
    }

    // Purgar en Supabase Cloud
    if (this.supabase && typeof this.supabase.purgarEmpresaCloud === 'function') {
      this.supabase.purgarEmpresaCloud(empresaId).catch((err) => console.warn('[BoviTrack] Error purgando empresa en cloud:', err));
    }

    this.guardarEstado();
    this.actualizarHeader();
    alert(`✓ Base de datos de la empresa "${nombreEmp}" purgada exitosamente.`);

    if (this.compAnimales) this.compAnimales.render();
    if (this.compCuadricula) {
      this.compCuadricula.cargarFilasDesdeInventario();
      this.compCuadricula.render();
    }
    if (this.compDinamica) this.compDinamica.render();
    if (this.compDashboard) this.compDashboard.render();
    if (this.compAlertas) this.compAlertas.render();
    if (this.compAdmin) this.compAdmin.render();
    if (this.compReproduccion) this.compReproduccion.render();
  }

  async resetearSistemaAblanco() {
    if (!this.state.usuarioActual || this.state.usuarioActual.rol !== 'superadmin') {
      alert('Operación denegada: Sólo el Super Administrador puede restablecer el sistema a blanco.');
      return;
    }

    const confirmacion = confirm(
      '⚠️ ATENCIÓN: ESTA ACCIÓN DEJARÁ EL SISTEMA TOTALMENTE EN BLANCO (0 DATOS).\n\n' +
      'Se eliminarán:\n' +
      '• Todas las empresas\n' +
      '• Todas las fincas\n' +
      '• Todos los animales\n' +
      '• Todos los pesajes y servicios\n' +
      '• Todas las inversiones y costos\n' +
      '• Todos los traslados y operaciones diarias\n' +
      '• Todos los usuarios (excepto el Super Administrador anuardavid)\n\n' +
      'Tanto en este dispositivo como en Supabase Cloud.\n\n' +
      '¿Desea continuar?'
    );
    if (!confirmacion) return;

    const confirmacion2 = prompt('Para confirmar, escriba "RESETEAR" en mayúsculas:');
    if (confirmacion2 !== 'RESETEAR') {
      alert('Operación cancelada. No se modificó ningún dato.');
      return;
    }

    const superAdmin = (this.state.usuarios || []).find((u) => u.usuario === 'anuardavid') || {
      id: 'USR-SUPER',
      usuario: 'anuardavid',
      password: 'anuar' + '316791',
      nombre: 'Anuar David (Super Admin)',
      rol: 'superadmin',
      empresaId: null,
      fincasAsignadas: 'todas',
      activo: true
    };

    this._purgaEnProgreso = true;
    this.state.empresas = [];
    this.state.fincas = [];
    this.state.animales = [];
    this.state.servicios = [];
    this.state.costosFijos = {};
    this.state.inversiones = [];
    this.state.traslados = [];
    this.state.operacionesDiarias = [];
    this.state.pesajes = [];
    this.state.usuarios = [superAdmin];
    this.state.usuarioActual = superAdmin;
    this.state.empresaActivaId = null;
    this.state.fincaActivaId = null;

    if (this.supabase && typeof this.supabase.limpiarTodoElSistemaCloud === 'function') {
      try {
        await this.supabase.limpiarTodoElSistemaCloud();
      } catch (err) {
        console.warn('[BoviTrack] Error limpiando cloud:', err);
      }
    }

    this.guardarEstado();
    this._purgaEnProgreso = false;
    this.actualizarHeader();
    this.refrescarVistas();
    alert('✓ El sistema ha sido reiniciado a blanco exitosamente (0 empresas, 0 fincas, 0 animales). Ahora puede ingresar su información real.');
    this.vistaActiva = 'admin';
    this.mostrarVistaActiva();
  }

  async crearUsuario(usuario) {
    if (!this.state.usuarios) this.state.usuarios = [];
    const cleanUser = String(usuario.usuario || '').replace(/^@+/, '').trim().toLowerCase();
    usuario.usuario = cleanUser;

    // VALIDACIÓN ESTRICTA: NO PERMITIR USUARIOS DUPLICADOS
    const yaExiste = this.state.usuarios.some(
      (u) => (u.usuario || '').replace(/^@+/, '').trim().toLowerCase() === cleanUser && u.id !== usuario.id
    );

    if (yaExiste) {
      const msgError = `⚠️ ACCESO DENEGADO: El nombre de usuario "@${cleanUser}" ya existe en el sistema. No se permite crear usuarios duplicados. Por favor elige otro nombre de usuario.`;
      if (typeof alert !== 'undefined') {
        alert(msgError);
      }
      console.warn(msgError);
      return { ok: false, error: msgError, duplicado: true };
    }

    // Si el usuario estaba en _usuariosEliminados, removerlo para permitir su creación limpia
    if (Array.isArray(this.state._usuariosEliminados)) {
      this.state._usuariosEliminados = this.state._usuariosEliminados.filter(
        u => u !== cleanUser && u !== usuario.id
      );
    }

    this.state.usuarios.push(usuario);

    this.guardarEstado();
    this.actualizarHeader();
    if (this.compAdmin && typeof this.compAdmin.render === 'function') {
      this.compAdmin.render();
    }

    // Sincronizar inmediatamente a Supabase Cloud si está conectado
    if (this.supabase && typeof this.supabase.estaConfigurado === 'function' && this.supabase.estaConfigurado()) {
      try {
        const payload = [{
          id: usuario.id,
          empresa_id: usuario.empresaId || null,
          usuario: usuario.usuario,
          nombre: usuario.nombre,
          rol: usuario.rol,
          password: usuario.password,
          fincas_asignadas: usuario.fincasAsignadas,
          email: usuario.email || '',
          telefono: usuario.telefono || '',
          activo: usuario.activo !== false
        }];
        await this.supabase._postgrestUpsert('usuarios', payload, 'usuario', 10000);
        console.log(`✓ Usuario @${usuario.usuario} persistido en Supabase Cloud.`);
      } catch (err) {
        console.warn('Aviso sincronizando usuario en Supabase Cloud:', err.message);
      }
    }

    alert(`✓ Usuario @${usuario.usuario} (${usuario.nombre}) creado exitosamente con rol ${usuario.rol}.`);
    return { ok: true, usuario };
  }

  async eliminarUsuario(usuarioId) {
    const user = (this.state.usuarios || []).find((u) => u.id === usuarioId || u.usuario === usuarioId || u.usuario === String(usuarioId).replace(/^@/, '').trim());
    if (!user) return;

    if (this.state.usuarioActual && (this.state.usuarioActual.id === user.id || this.state.usuarioActual.usuario === user.usuario)) {
      alert('No puedes eliminar el usuario con el que tienes la sesión activa.');
      return;
    }

    const admins = (this.state.usuarios || []).filter((u) => u.rol === 'administrador' || u.rol === 'superadmin');
    if (user.rol === 'administrador' && admins.length <= 1) {
      alert('No puedes eliminar el único Administrador de la cuenta.');
      return;
    }

    if (!Array.isArray(this.state._usuariosEliminados)) {
      this.state._usuariosEliminados = [];
    }
    if (!this.state._usuariosEliminados.includes(user.usuario)) {
      this.state._usuariosEliminados.push(user.usuario);
    }
    if (!this.state._usuariosEliminados.includes(user.id)) {
      this.state._usuariosEliminados.push(user.id);
    }

    this.state.usuarios = (this.state.usuarios || []).filter((u) => u.id !== user.id && u.usuario !== user.usuario);
    this.guardarEstado();
    this.actualizarHeader();
    if (this.compAdmin && typeof this.compAdmin.render === 'function') {
      this.compAdmin.render();
    }

    // Purgar inmediatamente en Supabase Cloud
    if (this.supabase && typeof this.supabase.eliminarUsuarioCloud === 'function' && this.supabase.estaConfigurado()) {
      try {
        await this.supabase.eliminarUsuarioCloud(user.usuario, user.id);
        console.log(`✓ Usuario @${user.usuario} purgado de Supabase Cloud.`);
      } catch (err) {
        console.warn('Advertencia eliminando usuario en cloud:', err);
      }
    }

    alert(`✓ Usuario @${user.usuario} eliminado exitosamente.`);
  }

  actualizarUsuario(usuarioActualizado) {
    const idx = this.state.usuarios.findIndex((u) => u.id === usuarioActualizado.id);
    if (idx !== -1) {
      this.state.usuarios[idx] = usuarioActualizado;
      if (this.state.usuarioActual.id === usuarioActualizado.id) {
        this.state.usuarioActual.nombre = usuarioActualizado.nombre;
        this.state.usuarioActual.rol = usuarioActualizado.rol;
        this.state.usuarioActual.empresaId = usuarioActualizado.empresaId;
        this.state.usuarioActual.fincasAsignadas = usuarioActualizado.fincasAsignadas || 'todas';

        // Si la finca activa ya no está entre las asignadas al usuario, reasignar a la primera permitida
        const fincasPermitidas = this.getFincasEmpresa();
        if (fincasPermitidas.length > 0 && !fincasPermitidas.some((f) => f.id === this.state.fincaActivaId)) {
          this.state.fincaActivaId = fincasPermitidas[0].id;
        }
      }
      this.guardarEstado();
      this.actualizarHeader();
      this.aplicarPermisosRBAC();
      this.compAdmin.render();

      if (this.supabase && typeof this.supabase.estaConfigurado === 'function' && this.supabase.estaConfigurado()) {
        const payload = [{
          id: usuarioActualizado.id,
          empresa_id: usuarioActualizado.empresaId || null,
          usuario: usuarioActualizado.usuario,
          nombre: usuarioActualizado.nombre,
          rol: usuarioActualizado.rol,
          password: usuarioActualizado.password,
          fincas_asignadas: usuarioActualizado.fincasAsignadas,
          email: usuarioActualizado.email || '',
          telefono: usuarioActualizado.telefono || '',
          activo: usuarioActualizado.activo !== false
        }];
        this.supabase._postgrestUpsert('usuarios', payload, 'usuario', 10000).catch(console.warn);
      }

      alert(`✓ Datos del usuario @${usuarioActualizado.usuario} actualizados.`);
    }
  }

  cambiarPasswordUsuario(usuarioId, nuevaPassword) {
    const user = this.state.usuarios.find((u) => u.id === usuarioId);
    if (user) {
      user.password = nuevaPassword;
      this.guardarEstado();
      this.compAdmin.render();

      if (this.supabase && typeof this.supabase.estaConfigurado === 'function' && this.supabase.estaConfigurado()) {
        const payload = [{
          id: user.id,
          usuario: user.usuario,
          password: nuevaPassword
        }];
        this.supabase._postgrestUpsert('usuarios', payload, 'usuario', 10000).catch(console.warn);
      }

      alert(`✓ Contraseña actualizada correctamente para @${user.usuario}.`);
    }
  }

  guardarOperacionGrid({ modulo, registros }) {
    if (this.esUsuarioSoloConsulta()) {
      alert('Acción denegada: El perfil actual es de sólo consulta.');
      return;
    }

    const hoy = new Date().toISOString().split('T')[0];

    registros.forEach((reg) => {
      let animal = this.state.animales.find(
        (a) => a.identificacionTag === reg.tag && a.fincaId === this.state.fincaActivaId
      );

      if (!animal) {
        animal = {
          id: `ANM-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          fincaId: this.state.fincaActivaId,
          identificacionTag: reg.tag,
          nombreAlias: reg.nombre || `Ejemplar ${reg.tag}`,
          especie: reg.especie || 'bovino',
          raza: 'Común',
          sexo: reg.sexo || 'hembra',
          categoria: reg.categoria || 'Vaca de Ordeño',
          lote: reg.lote || 'General',
          estadoVida: 'activo',
          estadoReproductivo: 'Vacía',
          diasGestacionActual: 0
        };
        this.state.animales.push(animal);
      }

      if (modulo === 'pesajes') {
        const pesoNum = parseFloat(reg.pesoNuevo);
        animal.ultimoPesoKg = pesoNum;
        animal.fechaUltimoPesaje = reg.fecha || hoy;
        if (reg.gdp !== null && reg.gdp !== undefined) {
          animal.gdpPromedioGDia = reg.gdp;
        } else {
          const gdpCalc = calcularGDPEjemplar({ animal, pesoActual: pesoNum, fechaPesaje: reg.fecha || hoy });
          if (gdpCalc && gdpCalc.gdp !== null) animal.gdpPromedioGDia = gdpCalc.gdp;
        }

        const safeTag = String(animal.identificacionTag).replace(/[^A-Za-z0-9_-]/g, '_');
        const idPesaje = `PES-${this.state.fincaActivaId}-${safeTag}-${reg.fecha || hoy}`;

        this.registrarActividadOperacion({
          id: `ACT-${idPesaje}`,
          fecha: reg.fecha || hoy,
          accion: 'pesajes',
          modulo: 'pesajes',
          tag: animal.identificacionTag,
          animalId: animal.id,
          nombreAlias: animal.nombreAlias,
          especie: animal.especie || 'bovino',
          raza: animal.raza,
          categoria: animal.categoria,
          lote: animal.lote,
          fincaId: this.state.fincaActivaId,
          detalle: `Pesaje en Báscula: ${reg.pesoNuevo} Kg` + (animal.gdpPromedioGDia ? ` (GDP: ${animal.gdpPromedioGDia} g/día)` : ''),
          subDetalle: `Condición: ${reg.condicionCorporal || reg.condicion || 'Óptima'} | Peso Previo: ${reg.pesoAnterior || '-'} Kg`,
          observaciones: reg.observaciones || 'Pesaje de rutina',
          responsable: this.state.usuarioActual ? this.state.usuarioActual.nombre : 'Operador',
          peso: pesoNum,
          gdp: animal.gdpPromedioGDia ? parseFloat(animal.gdpPromedioGDia) : null
        });

        if (!Array.isArray(this.state.pesajes)) this.state.pesajes = [];
        this.state.pesajes = this.state.pesajes.filter((p) => p.id !== idPesaje);
        this.state.pesajes.unshift({
          id: idPesaje,
          fecha: reg.fecha || hoy,
          hora: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          fincaId: this.state.fincaActivaId,
          animalId: animal.id,
          tag: animal.identificacionTag,
          animalTag: animal.identificacionTag,
          nombreAlias: animal.nombreAlias,
          especie: animal.especie || 'bovino',
          raza: animal.raza,
          categoria: animal.categoria,
          lote: animal.lote,
          pesoNuevo: pesoNum,
          peso: pesoNum,
          gdp: animal.gdpPromedioGDia ? parseFloat(animal.gdpPromedioGDia) : null,
          responsable: this.state.usuarioActual ? this.state.usuarioActual.nombre : 'Operador',
          observaciones: reg.observaciones || 'Pesaje de manga'
        });
      } else if (modulo === 'palpaciones') {
        animal.estadoReproductivo = reg.resultado;
        animal.diasGestacionActual = reg.resultado === 'Preñada' ? parseInt(reg.diasGestacion) || 60 : 0;
        if (!animal.historialEventos) animal.historialEventos = [];
        animal.historialEventos.unshift({
          tipo: 'palpacion',
          fecha: reg.fecha || hoy,
          resultado: reg.resultado,
          diasGestacion: animal.diasGestacionActual,
          estructuraOvario: reg.estructuraOvario || ''
        });
        this.registrarActividadOperacion({
          fecha: reg.fecha || hoy,
          accion: 'palpacion',
          modulo: 'reproduccion',
          tag: animal.identificacionTag,
          animalId: animal.id,
          fincaId: this.state.fincaActivaId,
          detalle: `Palpación: ${reg.resultado} (${animal.diasGestacionActual} días preñez)`,
          responsable: this.state.usuarioActual ? this.state.usuarioActual.nombre : 'Operador'
        });
      } else if (modulo === 'leche') {
        animal.promedioLecheDiariaL = reg.totalLitros;
        if (!animal.historialEventos) animal.historialEventos = [];
        animal.historialEventos.unshift({
          tipo: 'pesaje_leche',
          fecha: reg.fecha || hoy,
          litros: reg.totalLitros,
          litrosManana: reg.litrosManana || 0,
          litrosTarde: reg.litrosTarde || 0,
          notas: reg.notasUbre || ''
        });
        this.registrarActividadOperacion({
          fecha: reg.fecha || hoy,
          accion: 'pesaje_leche',
          modulo: 'lecheria',
          tag: animal.identificacionTag,
          animalId: animal.id,
          fincaId: this.state.fincaActivaId,
          detalle: `Pesaje de leche: ${reg.totalLitros} L/día`,
          responsable: this.state.usuarioActual ? this.state.usuarioActual.nombre : 'Operador'
        });
      } else if (modulo === 'partos') {
        const fParto = reg.fecha || hoy;
        animal.fechaUltimoParto = fParto;
        animal.estadoReproductivo = 'Vacía';
        animal.diasGestacionActual = 0;

        // Auto-crear la cría en el inventario
        const cria = {
          id: `ANM-${Date.now()}-${reg.tagCria || Math.random().toString(36).substr(2, 4)}`,
          fincaId: this.state.fincaActivaId,
          identificacionTag: reg.tagCria || `CRIA-${animal.identificacionTag}`,
          nombreAlias: `Cría de ${animal.identificacionTag}`,
          especie: animal.especie || 'bovino',
          raza: animal.raza,
          sexo: reg.sexoCria || 'hembra',
          categoria: reg.sexoCria === 'macho' ? 'ternero_cria' : 'ternera_cria',
          lote: 'Lote Crías',
          padreTag: 'Desconocido',
          madreTag: animal.identificacionTag,
          padre: 'Desconocido',
          madre: animal.identificacionTag,
          estadoVida: 'activo',
          estadoReproductivo: 'No Aplica',
          fechaNacimiento: fParto,
          ultimoPesoKg: parseFloat(reg.pesoCria) || 35,
          fechaUltimoPesaje: fParto
        };
        this.state.animales.push(cria);

        if (!animal.partosPrevios) animal.partosPrevios = [];
        animal.partosPrevios.push({
          fechaParto: fParto,
          tagCria: cria.identificacionTag,
          sexoCria: cria.sexo,
          pesoAlNacerKg: cria.ultimoPesoKg,
          tipoParto: reg.tipoParto || 'Normal',
          observaciones: 'Nacido en registro de manga'
        });

        if (!animal.historialEventos) animal.historialEventos = [];
        animal.historialEventos.unshift({
          tipo: 'parto',
          fecha: fParto,
          criaTag: cria.identificacionTag,
          sexoCria: cria.sexo,
          pesoAlNacerKg: cria.ultimoPesoKg,
          tipoParto: reg.tipoParto || 'Normal'
        });

        this.registrarActividadOperacion({
          fecha: fParto,
          accion: 'partos',
          modulo: 'reproduccion',
          tag: animal.identificacionTag,
          animalId: animal.id,
          fincaId: this.state.fincaActivaId,
          detalle: `Parto registrado: cría ${cria.identificacionTag} (${cria.sexo}, ${cria.ultimoPesoKg} kg)`,
          responsable: this.state.usuarioActual ? this.state.usuarioActual.nombre : 'Operador'
        });
      } else if (modulo === 'destetes') {
        const pDest = parseFloat(reg.pesoDestete) || 0;
        if (pDest > 0) {
          animal.ultimoPesoKg = pDest;
          animal.fechaUltimoPesaje = reg.fecha || hoy;
        }
        if (reg.loteDestino) {
          animal.lote = reg.loteDestino;
        }
        animal.categoria = (animal.sexo || '').toLowerCase() === 'macho' ? 'Novillo de Levante' : 'Novilla de Levante';
        if (!animal.historialEventos) animal.historialEventos = [];
        animal.historialEventos.unshift({
          tipo: 'destete',
          fecha: reg.fecha || hoy,
          pesoDestete: pDest,
          loteDestino: reg.loteDestino || 'Levante General',
          observaciones: reg.observaciones || ''
        });

        this.registrarActividadOperacion({
          fecha: reg.fecha || hoy,
          accion: 'destete',
          modulo: 'manejo',
          tag: animal.identificacionTag,
          animalId: animal.id,
          nombreAlias: animal.nombreAlias,
          fincaId: this.state.fincaActivaId,
          detalle: `Destete en brete: ${pDest ? `${pDest} kg` : ''} • Asignado a lote: ${reg.loteDestino || 'Levante General'}`,
          responsable: this.state.usuarioActual ? this.state.usuarioActual.nombre : 'Operador'
        });
      } else if (modulo === 'extracciones') {
        const motivoNorm = (reg.tipoExtraccion || reg.motivo || 'Venta').trim();
        const fechaExtraccion = reg.fecha || hoy;

        this.extraerAnimal({
          animalId: animal.id,
          motivo: motivoNorm,
          comprador: reg.comprador || '',
          valorVenta: parseFloat(reg.valorVenta) || 0,
          pesoVenta: parseFloat(reg.pesoVenta) || parseFloat(animal.ultimoPesoKg || animal.pesoActual || 0),
          motivoMuerte: reg.motivoMuerte || reg.observaciones || '',
          fecha: fechaExtraccion,
          observaciones: reg.observaciones || ''
        });
      } else if (modulo === 'servicios') {
        animal.estadoReproductivo = 'Servida';
        const srv = {
          id: `SRV-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          fincaId: this.state.fincaActivaId,
          animalId: animal.id,
          tag: animal.identificacionTag,
          animalTag: animal.identificacionTag,
          tipo: reg.tipoServicio || 'inseminacion_artificial',
          fecha: reg.fecha || hoy,
          reproductor: reg.reproductor || 'Toro / Pajilla',
          tecnico: reg.tecnico || 'Técnico de Campo',
          protocolo: reg.protocolo || 'IATF',
          resultado: 'Pendiente Chequeo'
        };
        if (!this.state.servicios) this.state.servicios = [];
        this.state.servicios.unshift(srv);
        if (!animal.serviciosReproductivos) animal.serviciosReproductivos = [];
        animal.serviciosReproductivos.unshift(srv);

        this.registrarActividadOperacion({
          fecha: reg.fecha || hoy,
          accion: 'servicios',
          modulo: 'reproduccion',
          tag: animal.identificacionTag,
          animalId: animal.id,
          fincaId: this.state.fincaActivaId,
          detalle: `Servicio reproductivo (${srv.tipo}): Reproductor ${srv.reproductor} | Protocolo: ${srv.protocolo}`,
          responsable: this.state.usuarioActual ? this.state.usuarioActual.nombre : 'Operador'
        });
      }
    });

    this.guardarEstado();
    alert(`✓ Guardados ${registros.length} registros en la base de datos de campo.`);

    if (this.compCuadricula) {
      if (typeof this.compCuadricula.cargarFilasDesdeInventario === 'function') {
        this.compCuadricula.cargarFilasDesdeInventario();
      }
      if (typeof this.compCuadricula.render === 'function') {
        this.compCuadricula.render();
      }
    }
    if (this.compAnimales && typeof this.compAnimales.render === 'function') this.compAnimales.render();
    if (this.compAlertas && typeof this.compAlertas.render === 'function') this.compAlertas.render();
    if (this.compDashboard && typeof this.compDashboard.render === 'function') this.compDashboard.render();
    if (this.compDinamica && typeof this.compDinamica.render === 'function') this.compDinamica.render();
    if (this.compReproduccion && typeof this.compReproduccion.render === 'function') this.compReproduccion.render();
  }

  importarEventosMasivosExcel(filasValidas, targetFincaId = null, tipoCargue = 'inventario', fechaGlobal = null) {
    if (this.esUsuarioSoloConsulta()) {
      alert('Acción denegada: El perfil actual es de sólo consulta.');
      return;
    }

    // Resolver predio/finca de destino de forma inequívoca
    const fActiva = this.getFincaActiva();
    const resolvedFincaId = targetFincaId || this.state.fincaActivaId || (fActiva ? fActiva.id : null) || (this.state.fincas?.[0]?.id || null);

    if (!resolvedFincaId) {
      alert('Error: Debe crear o seleccionar un predio/finca antes de importar.');
      return;
    }

    // Asegurar que la finca activa de la sesión apunte al predio donde se importaron los animales
    this.state.fincaActivaId = resolvedFincaId;
    const fincaObj = (this.state.fincas || []).find((f) => f.id === resolvedFincaId);
    const nombreFinca = fincaObj ? fincaObj.nombre : resolvedFincaId;
    const hoy = new Date().toISOString().split('T')[0];
    const fechaSesion = fechaGlobal || hoy;

    let importadosNuevos = 0;
    let actualizados = 0;
    const noEncontrados = [];

    if (tipoCargue === 'pesajes') {
      filasValidas.forEach((f, idx) => {
        let animal = (this.state.animales || []).find(
          (a) => (a.identificacionTag === f.tag || a.numero === f.tag) && a.fincaId === resolvedFincaId
        );
        const fPes = f.fechaPesaje || f.fecha || fechaSesion;
        const pesoNum = parseFloat(f.pesoActual !== undefined && f.pesoActual !== null ? f.pesoActual : f.peso);
        if (isNaN(pesoNum) || pesoNum <= 0) return;

        if (!animal) {
          noEncontrados.push({
            fila: f.idx !== undefined ? f.idx + 1 : (idx + 2),
            tag: f.tag,
            evento: 'Pesaje',
            detalle: `Peso: ${pesoNum} kg`,
            motivo: `No existe ejemplar con arete "${f.tag}" en el predio seleccionado.`
          });
          return;
        }

        actualizados++;
        const resGDP = calcularGDPEjemplar({ animal, pesoActual: pesoNum, fechaPesaje: fPes });
        if (resGDP && resGDP.gdp !== null) {
          animal.gdpPromedioGDia = resGDP.gdp;
        }
        animal.ultimoPesoKg = pesoNum;
        animal.fechaUltimoPesaje = fPes;
        if (f.lote) animal.lote = f.lote;

        if (!Array.isArray(this.state.pesajes)) this.state.pesajes = [];
        const safeTag = String(animal.identificacionTag).replace(/[^A-Za-z0-9_-]/g, '_');
        const idPes = `PES-${resolvedFincaId}-${safeTag}-${fPes}`;
        this.state.pesajes = this.state.pesajes.filter((p) => p.id !== idPes);
        this.state.pesajes.push({
          id: idPes,
          fecha: fPes,
          hora: '08:00',
          fincaId: resolvedFincaId,
          animalId: animal.id,
          tag: animal.identificacionTag,
          animalTag: animal.identificacionTag,
          nombreAlias: animal.nombreAlias || '',
          especie: animal.especie || 'bovino',
          raza: animal.raza || '',
          categoria: animal.categoria || '',
          lote: animal.lote || 'General',
          pesoNuevo: pesoNum,
          peso: pesoNum,
          gdp: animal.gdpPromedioGDia ? Number(animal.gdpPromedioGDia) : null,
          observaciones: f.observaciones || 'Cargue masivo Excel',
          responsable: 'Importación Excel'
        });

        this.registrarActividadOperacion({
          id: `ACT-${idPes}`,
          fecha: fPes,
          accion: 'pesajes',
          modulo: 'pesajes',
          tag: animal.identificacionTag,
          animalId: animal.id,
          nombreAlias: animal.nombreAlias,
          fincaId: resolvedFincaId,
          detalle: `Pesaje masivo: ${pesoNum} Kg` + (animal.gdpPromedioGDia ? ` (GDP: ${animal.gdpPromedioGDia} g/d${resGDP?.origen === 'nacimiento' ? ' [desde nacimiento]' : ''})` : ''),
          responsable: 'Importación Excel',
          peso: pesoNum,
          gdp: animal.gdpPromedioGDia ? Number(animal.gdpPromedioGDia) : null
        });
      });
    } else if (tipoCargue === 'palpaciones') {
      filasValidas.forEach((f, idx) => {
        let animal = (this.state.animales || []).find(
          (a) => (a.identificacionTag === f.tag || a.numero === f.tag) && a.fincaId === resolvedFincaId
        );
        const fPalp = f.fechaPalpacion || f.fecha || fechaSesion;
        const res = (f.resultadoPalpacion || f.resultado || 'Preñada').trim();
        const diasG = parseInt(f.diasGestacion || 0);

        if (!animal) {
          noEncontrados.push({
            fila: f.idx !== undefined ? f.idx + 1 : (idx + 2),
            tag: f.tag,
            evento: 'Palpación',
            detalle: `Resultado: ${res} (${diasG}d gestación)`,
            motivo: `No existe ejemplar con arete "${f.tag}" en el predio seleccionado.`
          });
          return;
        }

        actualizados++;
        animal.estadoReproductivo = res;
        animal.diasGestacionActual = diasG;
        if (!animal.historialEventos) animal.historialEventos = [];
        animal.historialEventos.unshift({
          tipo: 'palpacion',
          fecha: fPalp,
          resultado: res,
          diasGestacion: diasG,
          diagnostico: f.diagnostico || '',
          responsable: f.veterinario || 'Veterinario'
        });

        this.registrarActividadOperacion({
          fecha: fPalp,
          accion: 'palpacion',
          modulo: 'reproduccion',
          tag: animal.identificacionTag,
          animalId: animal.id,
          nombreAlias: animal.nombreAlias || '',
          fincaId: resolvedFincaId,
          detalle: `Palpación masiva: ${res} (${diasG} días de gestación)`,
          responsable: f.veterinario || 'Veterinario'
        });
      });
    } else if (tipoCargue === 'leche') {
      filasValidas.forEach((f, idx) => {
        let animal = (this.state.animales || []).find(
          (a) => (a.identificacionTag === f.tag || a.numero === f.tag) && a.fincaId === resolvedFincaId
        );
        const fLeche = f.fechaLeche || f.fecha || fechaSesion;
        const litros = parseFloat(f.totalLitros !== undefined && f.totalLitros !== null ? f.totalLitros : (f.litros || 0));

        if (!animal) {
          noEncontrados.push({
            fila: f.idx !== undefined ? f.idx + 1 : (idx + 2),
            tag: f.tag,
            evento: 'Pesaje Leche',
            detalle: `${litros} L (Jornada ${f.jornada || 'AM'})`,
            motivo: `No existe ejemplar con arete "${f.tag}" en el predio seleccionado.`
          });
          return;
        }

        actualizados++;
        animal.promedioLecheDiariaL = litros;
        if (!animal.historialEventos) animal.historialEventos = [];
        animal.historialEventos.unshift({
          tipo: 'pesaje_leche',
          fecha: fLeche,
          litros,
          jornada: f.jornada || 'AM',
          grasa: f.grasa || null,
          proteina: f.proteina || null
        });

        this.registrarActividadOperacion({
          fecha: fLeche,
          accion: 'pesaje_leche',
          modulo: 'lecheria',
          tag: animal.identificacionTag,
          animalId: animal.id,
          nombreAlias: animal.nombreAlias || '',
          fincaId: resolvedFincaId,
          monto: 0,
          detalle: `Pesaje de leche: ${litros} L (Jornada ${f.jornada || 'AM'})`,
          responsable: 'Control Lechero Excel'
        });
      });
    } else if (tipoCargue === 'partos') {
      filasValidas.forEach((f, idx) => {
        const mTag = f.madreTag || f.tag;
        let mother = (this.state.animales || []).find(
          (a) => (a.identificacionTag === mTag || a.numero === mTag) && a.fincaId === resolvedFincaId
        );
        const fParto = f.fechaParto || f.fecha || fechaSesion;
        const cTag = f.tagCria || f.criaTag;
        const sexCria = (f.sexoCria || 'macho').toLowerCase();
        const pCria = parseFloat(f.pesoCria || 0);

        if (!mother) {
          noEncontrados.push({
            fila: f.idx !== undefined ? f.idx + 1 : (idx + 2),
            tag: mTag,
            evento: 'Parto',
            detalle: `Cría: ${cTag || 'S/N'} (${sexCria})`,
            motivo: `Madre con arete "${mTag}" no existe en el predio seleccionado.`
          });
          return;
        }

        actualizados++;
        mother.fechaUltimoParto = fParto;
        mother.estadoReproductivo = 'Vacía';
        mother.diasGestacionActual = 0;

        // Registrar en historialEventos de la madre
        if (!mother.historialEventos) mother.historialEventos = [];
        mother.historialEventos.unshift({
          tipo: 'parto',
          fecha: fParto,
          criaTag: cTag,
          sexoCria: sexCria,
          pesoAlNacerKg: pCria,
          tipoParto: f.tipoParto || 'Normal'
        });

        // Asegurar registro en partosPrevios de la madre para visualización inmediata en la Ficha
        if (!Array.isArray(mother.partosPrevios)) mother.partosPrevios = [];
        const yaExisteParto = mother.partosPrevios.some((p) => (p.fechaParto === fParto || p.fecha === fParto) && (p.tagCria === cTag || p.criaTag === cTag));
        if (!yaExisteParto) {
          mother.partosPrevios.unshift({
            fechaParto: fParto,
            fecha: fParto,
            tagCria: cTag || 'Cría Registrada',
            sexoCria: sexCria,
            pesoAlNacerKg: pCria > 0 ? pCria : 32,
            tipoParto: f.tipoParto || 'Normal',
            observaciones: f.observaciones || 'Cargue masivo Excel'
          });
        }

        if (cTag) {
          let criaExistente = (this.state.animales || []).find(
            (a) => (a.identificacionTag === cTag || a.numero === cTag) && a.fincaId === resolvedFincaId
          );
          if (!criaExistente) {
            importadosNuevos++;
            const safeTag = String(cTag).replace(/[^a-zA-Z0-9]/g, '');
            const cria = {
              id: `ANM-${Date.now()}-${idx}-${safeTag}`,
              fincaId: resolvedFincaId,
              identificacionTag: cTag,
              numero: cTag,
              nombreAlias: `Cría de ${mother.identificacionTag}`,
              especie: mother.especie || 'bovino',
              raza: mother.raza || 'Cruzada',
              sexo: sexCria,
              categoria: sexCria === 'macho' ? 'Ternero' : 'Ternera',
              lote: 'Lote Crías',
              padreTag: mother.padreTag || 'Desconocido',
              madreTag: mother.identificacionTag,
              padre: mother.padreTag || 'Desconocido',
              madre: mother.identificacionTag,
              estadoVida: 'activo',
              estadoReproductivo: 'No Aplica',
              fechaNacimiento: fParto,
              ultimoPesoKg: pCria > 0 ? pCria : null,
              fechaUltimoPesaje: pCria > 0 ? fParto : null
            };
            this.state.animales.push(cria);
          }
        }

        this.registrarActividadOperacion({
          fecha: fParto,
          accion: 'partos',
          modulo: 'reproduccion',
          tag: mother.identificacionTag,
          animalId: mother.id,
          nombreAlias: mother.nombreAlias || '',
          fincaId: resolvedFincaId,
          detalle: `Parto registrado (${f.tipoParto || 'Normal'}). Cría: ${cTag || 'S/N'} (${sexCria}${pCria > 0 ? `, ${pCria} kg` : ''})`,
          responsable: 'Registro de Parto Excel'
        });
      });
    } else if (tipoCargue === 'destete') {
      filasValidas.forEach((f, idx) => {
        let animal = (this.state.animales || []).find(
          (a) => (a.identificacionTag === f.tag || a.numero === f.tag) && a.fincaId === resolvedFincaId
        );
        const fDestete = f.fechaDestete || f.fecha || fechaSesion;
        const pDestete = parseFloat(f.pesoDestete !== undefined && f.pesoDestete !== null ? f.pesoDestete : (f.peso || 0));
        const loteDestino = f.loteDestino || 'Levante';

        if (!animal) {
          noEncontrados.push({
            fila: f.idx !== undefined ? f.idx + 1 : (idx + 2),
            tag: f.tag,
            evento: 'Destete',
            detalle: `Peso: ${pDestete} kg, Lote: ${loteDestino}`,
            motivo: `No existe ejemplar con arete "${f.tag}" en el predio seleccionado.`
          });
          return;
        }

        actualizados++;
        animal.lote = loteDestino;
        animal.categoria = (animal.sexo || '').toLowerCase() === 'macho' ? 'Novillo de Levante' : 'Novilla de Levante';
        if (pDestete > 0) {
          const resGDP = calcularGDPEjemplar({ animal, pesoActual: pDestete, fechaPesaje: fDestete });
          if (resGDP && resGDP.gdp !== null) {
            animal.gdpPromedioGDia = resGDP.gdp;
          }
          animal.ultimoPesoKg = pDestete;
          animal.fechaUltimoPesaje = fDestete;
        }

        if (!animal.historialEventos) animal.historialEventos = [];
        animal.historialEventos.unshift({
          tipo: 'destete',
          fecha: fDestete,
          pesoDestete: pDestete,
          loteDestino: loteDestino
        });

        this.registrarActividadOperacion({
          fecha: fDestete,
          accion: 'destete',
          modulo: 'manejo',
          tag: animal.identificacionTag,
          animalId: animal.id,
          nombreAlias: animal.nombreAlias || '',
          fincaId: resolvedFincaId,
          detalle: `Destete completado: Peso ${pDestete} kg. Asignado a lote: ${loteDestino}`,
          responsable: 'Cargue Excel Destete'
        });
      });
    } else if (tipoCargue === 'labores') {
      filasValidas.forEach((f, idx) => {
        let animal = (this.state.animales || []).find(
          (a) => (a.identificacionTag === f.tag || a.numero === f.tag) && a.fincaId === resolvedFincaId
        );
        const fLabor = f.fecha || f.fechaPesaje || f.fechaPalpacion || f.fechaLeche || f.fechaDestete || f.fechaParto || fechaSesion;

        if (!animal) {
          const laboresNombres = (f.laboresDetectadas || []).map((l) => l.replace(/^[^\w\s]+/, '').trim()).join(', ') || f.laborIndicada || 'Labores de campo';
          noEncontrados.push({
            fila: f.idx !== undefined ? f.idx : (idx + 1),
            tag: f.tag,
            evento: 'Labores (5 en 1)',
            detalle: laboresNombres,
            motivo: `No existe ejemplar con arete "${f.tag}" en el predio seleccionado.`
          });
          return;
        }

        actualizados++;

        // 1. PESAJE
        const pesoNum = parseFloat(f.pesoActual !== undefined && f.pesoActual !== null ? f.pesoActual : (f.peso !== undefined && f.peso !== null ? f.peso : null));
        const tienePesaje = f.tienePesaje || (!isNaN(pesoNum) && pesoNum > 0);
        if (tienePesaje && !isNaN(pesoNum) && pesoNum > 0) {
          const fPes = f.fechaPesaje || fLabor;
          const resGDP = calcularGDPEjemplar({ animal, pesoActual: pesoNum, fechaPesaje: fPes });
          if (resGDP && resGDP.gdp !== null) {
            animal.gdpPromedioGDia = resGDP.gdp;
          }
          animal.ultimoPesoKg = pesoNum;
          animal.fechaUltimoPesaje = fPes;
          if (f.lote) animal.lote = f.lote;

          if (!Array.isArray(this.state.pesajes)) this.state.pesajes = [];
          const safeTag = String(animal.identificacionTag).replace(/[^A-Za-z0-9_-]/g, '_');
          const idPes = `PES-${resolvedFincaId}-${safeTag}-${fPes}`;
          this.state.pesajes = this.state.pesajes.filter((p) => p.id !== idPes);
          this.state.pesajes.push({
            id: idPes,
            fecha: fPes,
            hora: '08:00',
            fincaId: resolvedFincaId,
            animalId: animal.id,
            tag: animal.identificacionTag,
            animalTag: animal.identificacionTag,
            nombreAlias: animal.nombreAlias || '',
            especie: animal.especie || 'bovino',
            raza: animal.raza || '',
            categoria: animal.categoria || '',
            lote: animal.lote || 'General',
            pesoNuevo: pesoNum,
            peso: pesoNum,
            gdp: animal.gdpPromedioGDia ? Number(animal.gdpPromedioGDia) : null,
            observaciones: f.observaciones || 'Cargue masivo Excel (Hoja Única)',
            responsable: 'Importación Excel'
          });

          this.registrarActividadOperacion({
            id: `ACT-${idPes}`,
            fecha: fPes,
            accion: 'pesajes',
            modulo: 'pesajes',
            tag: animal.identificacionTag,
            animalId: animal.id,
            nombreAlias: animal.nombreAlias,
            fincaId: resolvedFincaId,
            detalle: `Pesaje masivo (Hoja única): ${pesoNum} Kg` + (animal.gdpPromedioGDia ? ` (GDP: ${animal.gdpPromedioGDia} g/d${resGDP?.origen === 'nacimiento' ? ' [desde nacimiento]' : ''})` : ''),
            responsable: 'Importación Excel',
            peso: pesoNum,
            gdp: animal.gdpPromedioGDia ? Number(animal.gdpPromedioGDia) : null
          });
        }

        // 2. PALPACIÓN
        const tienePalp = f.tienePalpacion || Boolean(f.resultadoPalpacion);
        if (tienePalp) {
          const fPalp = f.fechaPalpacion || fLabor;
          const res = (f.resultadoPalpacion || 'Preñada').trim();
          const diasG = parseInt(f.diasGestacion || 0);

          animal.estadoReproductivo = res;
          animal.diasGestacionActual = diasG;
          if (!animal.historialEventos) animal.historialEventos = [];
          animal.historialEventos.unshift({
            tipo: 'palpacion',
            fecha: fPalp,
            resultado: res,
            diasGestacion: diasG,
            diagnostico: f.diagnostico || f.estructuraOvario || '',
            responsable: f.veterinario || 'Veterinario'
          });

          this.registrarActividadOperacion({
            fecha: fPalp,
            accion: 'palpacion',
            modulo: 'reproduccion',
            tag: animal.identificacionTag,
            animalId: animal.id,
            nombreAlias: animal.nombreAlias || '',
            fincaId: resolvedFincaId,
            detalle: `Palpación masiva (Hoja única): ${res} (${diasG} días de gestación)`,
            responsable: f.veterinario || 'Veterinario'
          });
        }

        // 3. PESAJE DE LECHE
        const litros = parseFloat(f.totalLitros !== undefined && f.totalLitros !== null ? f.totalLitros : (f.litros !== undefined && f.litros !== null ? f.litros : 0));
        const tieneLeche = f.tieneLeche || (!isNaN(litros) && litros > 0);
        if (tieneLeche && !isNaN(litros) && litros > 0) {
          const fLeche = f.fechaLeche || fLabor;
          animal.promedioLecheDiariaL = litros;
          if (!animal.historialEventos) animal.historialEventos = [];
          animal.historialEventos.unshift({
            tipo: 'pesaje_leche',
            fecha: fLeche,
            litros,
            jornada: f.jornada || 'AM+PM',
            grasa: f.grasa || null,
            proteina: f.proteina || null
          });

          this.registrarActividadOperacion({
            fecha: fLeche,
            accion: 'pesaje_leche',
            modulo: 'lecheria',
            tag: animal.identificacionTag,
            animalId: animal.id,
            nombreAlias: animal.nombreAlias || '',
            fincaId: resolvedFincaId,
            monto: 0,
            detalle: `Control lechero masivo (Hoja única): ${litros} L`,
            responsable: 'Control Lechero Excel'
          });
        }

        // 4. DESTETE
        const pDestete = parseFloat(f.pesoDestete !== undefined && f.pesoDestete !== null ? f.pesoDestete : 0);
        const loteDestino = f.loteDestino || 'Levante';
        const tieneDestete = f.tieneDestete || pDestete > 0 || (f.laborIndicada && f.laborIndicada.includes('destet'));
        if (tieneDestete) {
          const fDest = f.fechaDestete || fLabor;
          animal.lote = loteDestino;
          animal.categoria = (animal.sexo || '').toLowerCase() === 'macho' ? 'Novillo de Levante' : 'Novilla de Levante';
          if (pDestete > 0) {
            const resGDP = calcularGDPEjemplar({ animal, pesoActual: pDestete, fechaPesaje: fDest });
            if (resGDP && resGDP.gdp !== null) {
              animal.gdpPromedioGDia = resGDP.gdp;
            }
            animal.ultimoPesoKg = pDestete;
            animal.fechaUltimoPesaje = fDest;
          }

          if (!animal.historialEventos) animal.historialEventos = [];
          animal.historialEventos.unshift({
            tipo: 'destete',
            fecha: fDest,
            pesoDestete: pDestete,
            loteDestino: loteDestino
          });

          this.registrarActividadOperacion({
            fecha: fDest,
            accion: 'destete',
            modulo: 'manejo',
            tag: animal.identificacionTag,
            animalId: animal.id,
            nombreAlias: animal.nombreAlias || '',
            fincaId: resolvedFincaId,
            detalle: `Destete masivo (Hoja única): ${pDestete > 0 ? pDestete + ' kg. ' : ''}Asignado a: ${loteDestino}`,
            responsable: 'Cargue Excel Destete'
          });
        }

        // 5. PARTO
        const tieneParto = Boolean(f.tieneParto) || (f.laborIndicada && f.laborIndicada.includes('part'));
        if (tieneParto) {
          const fParto = f.fechaParto || fLabor;
          const cTag = f.tagCria || f.criaTag;
          const sexCria = (f.sexoCria || 'hembra').toLowerCase();
          const pCria = parseFloat(f.pesoCria || 0);

          animal.fechaUltimoParto = fParto;
          animal.estadoReproductivo = 'Vacía';
          animal.diasGestacionActual = 0;

          if (!animal.historialEventos) animal.historialEventos = [];
          animal.historialEventos.unshift({
            tipo: 'parto',
            fecha: fParto,
            criaTag: cTag,
            sexoCria: sexCria,
            pesoAlNacerKg: pCria,
            tipoParto: f.tipoParto || 'Normal'
          });

          // Asegurar registro en partosPrevios para visualización en FichaAnimal
          if (!Array.isArray(animal.partosPrevios)) animal.partosPrevios = [];
          const yaExisteParto = animal.partosPrevios.some((p) => (p.fechaParto === fParto || p.fecha === fParto) && (p.tagCria === cTag || p.criaTag === cTag));
          if (!yaExisteParto) {
            animal.partosPrevios.unshift({
              fechaParto: fParto,
              fecha: fParto,
              tagCria: cTag || 'Cría Registrada',
              sexoCria: sexCria,
              pesoAlNacerKg: pCria > 0 ? pCria : 32,
              tipoParto: f.tipoParto || 'Normal',
              observaciones: f.observaciones || 'Cargue masivo Excel (Hoja Única)'
            });
          }

          if (cTag) {
            let criaExistente = (this.state.animales || []).find(
              (a) => (a.identificacionTag === cTag || a.numero === cTag) && a.fincaId === resolvedFincaId
            );
            if (!criaExistente) {
              importadosNuevos++;
              const safeTag = String(cTag).replace(/[^a-zA-Z0-9]/g, '');
              const cria = {
                id: `ANM-${Date.now()}-${idx}-${safeTag}`,
                fincaId: resolvedFincaId,
                identificacionTag: cTag,
                numero: cTag,
                nombreAlias: `Cría de ${animal.identificacionTag}`,
                especie: animal.especie || 'bovino',
                raza: animal.raza || 'Cruzada',
                sexo: sexCria,
                categoria: sexCria === 'macho' ? 'Ternero' : 'Ternera',
                lote: 'Lote Crías',
                padreTag: f.padre || animal.padreTag || 'Desconocido',
                madreTag: animal.identificacionTag,
                padre: f.padre || animal.padreTag || 'Desconocido',
                madre: animal.identificacionTag,
                estadoVida: 'activo',
                estadoReproductivo: 'No Aplica',
                fechaNacimiento: fParto,
                ultimoPesoKg: pCria > 0 ? pCria : null,
                fechaUltimoPesaje: pCria > 0 ? fParto : null
              };
              this.state.animales.push(cria);
            }
          }

          this.registrarActividadOperacion({
            fecha: fParto,
            accion: 'partos',
            modulo: 'reproduccion',
            tag: animal.identificacionTag,
            animalId: animal.id,
            nombreAlias: animal.nombreAlias || '',
            fincaId: resolvedFincaId,
            detalle: `Parto registrado (Hoja única). Cría: ${cTag || 'S/N'} (${sexCria}${pCria > 0 ? `, ${pCria} kg` : ''})`,
            responsable: 'Registro de Parto Excel'
          });
        }
      });
    } else {
      // 'inventario' (Cargue general de animales)
      filasValidas.forEach((f, idx) => {
        let animal = this.state.animales.find(
          (a) => (a.identificacionTag === f.tag || a.numero === f.tag) && a.fincaId === resolvedFincaId
        );

        if (!animal) {
          importadosNuevos++;
          const safeTag = String(f.tag || '').replace(/[^a-zA-Z0-9]/g, '');
          animal = {
            id: `ANM-${Date.now()}-${idx}-${safeTag}`,
            fincaId: resolvedFincaId,
            identificacionTag: f.tag,
            numero: f.tag,
            nombreAlias: f.nombre || `Animal ${f.tag}`,
            especie: f.especie || 'bovino',
            raza: f.raza || 'Cruzada',
            sexo: f.sexo || 'hembra',
            categoria: f.categoria || (f.sexo === 'macho' ? 'Novillo de Ceba' : 'Vaca de Ordeño'),
            lote: f.lote || 'General',
            fechaNacimiento: f.fechaNacimiento || null,
            padreTag: f.padre || 'Desconocido',
            madreTag: f.madre || 'Desconocida',
            padre: f.padre || 'Desconocido',
            madre: f.madre || 'Desconocida',
            estadoVida: 'activo',
            estadoReproductivo: f.resultadoPalpacion || 'Vacía',
            diasGestacionActual: f.diasGestacion || 0,
            fechaUltimoParto: f.fechaUltimoParto || null
          };
          this.state.animales.push(animal);
        } else {
          actualizados++;
          if (f.especie) animal.especie = f.especie;
          if (f.nombre) animal.nombreAlias = f.nombre;
          if (f.sexo) animal.sexo = f.sexo;
          if (f.raza) animal.raza = f.raza;
          if (f.categoria) animal.categoria = f.categoria;
          if (f.lote) animal.lote = f.lote;
          if (f.fechaNacimiento) animal.fechaNacimiento = f.fechaNacimiento;
          if (f.padre) { animal.padreTag = f.padre; animal.padre = f.padre; }
          if (f.madre) { animal.madreTag = f.madre; animal.madre = f.madre; }
          if (f.resultadoPalpacion) animal.estadoReproductivo = f.resultadoPalpacion;
          if (f.diasGestacion !== undefined) animal.diasGestacionActual = f.diasGestacion;
          if (f.fechaUltimoParto) animal.fechaUltimoParto = f.fechaUltimoParto;
        }

        if (f.pesoActual !== null && f.pesoActual !== undefined) {
          animal.ultimoPesoKg = f.pesoActual;
          animal.fechaUltimoPesaje = f.fechaPesaje || fechaSesion;
        } else if (f.peso2) {
          animal.ultimoPesoKg = f.peso2;
          animal.fechaUltimoPesaje = f.fecha2 || fechaSesion;
        }
        if (f.gdp !== null && f.gdp !== undefined) {
          animal.gdpPromedioGDia = f.gdp;
        } else if (animal.ultimoPesoKg && Number(animal.ultimoPesoKg) > 0) {
          const resGDP = calcularGDPEjemplar({ animal, pesoActual: Number(animal.ultimoPesoKg), fechaPesaje: animal.fechaUltimoPesaje || fechaSesion });
          if (resGDP && resGDP.gdp !== null) {
            animal.gdpPromedioGDia = resGDP.gdp;
          }
        }

        // Registrar historial de pesaje para ejemplares que traen peso
        if (animal.ultimoPesoKg && Number(animal.ultimoPesoKg) > 0) {
          if (!Array.isArray(this.state.pesajes)) this.state.pesajes = [];
          const fPes = animal.fechaUltimoPesaje || fechaSesion;
          const safeTag = String(animal.identificacionTag).replace(/[^A-Za-z0-9_-]/g, '_');
          const idPes = `PES-${resolvedFincaId}-${safeTag}-${fPes}`;
          const yaExiste = this.state.pesajes.some((p) => p.id === idPes || ((p.animalId === animal.id || p.tag === animal.identificacionTag) && p.fecha === fPes));
          if (!yaExiste) {
            this.state.pesajes.push({
              id: idPes,
              fecha: fPes,
              hora: '08:00',
              fincaId: resolvedFincaId,
              animalId: animal.id,
              tag: animal.identificacionTag,
              animalTag: animal.identificacionTag,
              nombreAlias: animal.nombreAlias || '',
              especie: animal.especie || 'bovino',
              raza: animal.raza || '',
              categoria: animal.categoria || '',
              lote: animal.lote || 'General',
              pesoNuevo: Number(animal.ultimoPesoKg),
              peso: Number(animal.ultimoPesoKg),
              gdp: animal.gdpPromedioGDia ? Number(animal.gdpPromedioGDia) : null,
              responsable: 'Importación Excel'
            });

            this.registrarActividadOperacion({
              id: `ACT-${idPes}`,
              fecha: fPes,
              accion: 'pesajes',
              modulo: 'pesajes',
              tag: animal.identificacionTag,
              animalId: animal.id,
              nombreAlias: animal.nombreAlias,
              especie: animal.especie || 'bovino',
              raza: animal.raza,
              categoria: animal.categoria,
              lote: animal.lote,
              fincaId: resolvedFincaId,
              detalle: `Pesaje registrado: ${animal.ultimoPesoKg} Kg` + (animal.gdpPromedioGDia ? ` (GDP: ${animal.gdpPromedioGDia} g/d)` : ''),
              responsable: 'Importación Excel',
              peso: Number(animal.ultimoPesoKg),
              gdp: animal.gdpPromedioGDia ? Number(animal.gdpPromedioGDia) : null
            });
          }
        }
      });
    }

    this.guardarEstado();
    this.sincronizarConSupabaseDebounced();

    // Re-renderizado total e inmediato de los componentes para visualización reactiva
    if (this.compAnimales) this.compAnimales.render();
    if (this.compCuadricula) {
      if (this.compCuadricula.cargarFilasDesdeInventario) this.compCuadricula.cargarFilasDesdeInventario();
      this.compCuadricula.render();
    }
    if (this.compDashboard) this.compDashboard.render();
    if (this.compAlertas) this.compAlertas.render();
    if (this.compDinamica) this.compDinamica.render();
    if (this.compAdmin) this.compAdmin.render();
    this.actualizarHeader();

    const descTipo = {
      inventario: 'ejemplares en inventario',
      pesajes: 'registros de pesaje',
      palpaciones: 'diagnósticos de palpación',
      leche: 'controles lecheros',
      partos: 'registros de parto',
      destete: 'destetes',
      labores: 'labores de campo unificadas (pesajes, palpaciones, leche, destetes y partos)'
    }[tipoCargue] || 'registros';

    const cargadosConExito = actualizados + importadosNuevos;

    if (this.compExcel && typeof this.compExcel.mostrarInformeResultados === 'function') {
      this.compExcel.mostrarInformeResultados({
        tipoCargue,
        totalFilas: filasValidas.length,
        importadosExitosos: cargadosConExito,
        noEncontrados,
        nombreFinca
      });
    }

    if (noEncontrados.length > 0) {
      this.vistaActiva = 'excel';
      this.mostrarVistaActiva();
    } else {
      if (typeof alert !== 'undefined') {
        alert(`✓ Se procesaron ${cargadosConExito} ${descTipo} exitosamente (${importadosNuevos} nuevos, ${actualizados} actualizados) en el predio "${nombreFinca}".`);
      }
      this.vistaActiva = 'animales';
      this.mostrarVistaActiva();
    }
  }

  importarExcelAInventario(filasValidas, targetFincaId = null) {
    return this.importarEventosMasivosExcel(filasValidas, targetFincaId, 'inventario');
  }

  manejarAccionZootecnica(animalId, tipo) {
    const animal = this.state.animales.find((a) => a.id === animalId);
    if (!animal) return;

    if (tipo === 'secado_7_meses') {
      const resp = confirm(`¿Proceder al secado de ${animal.identificacionTag}? Se suspenderá el ordeño y pasará a Vaca Seca.`);
      if (resp) {
        animal.categoria = 'Vaca Seca';
        animal.promedioLecheDiariaL = 0;
        this.compAlertas.resolverAlerta(`ALT-SECADO-${animal.id}`);
        this.guardarEstado();
        this.compAlertas.render();
        this.compAnimales.render();
        this.compDashboard.render();
      }
    } else if (tipo === 'vaca_vacia_dias_abiertos' || tipo === 'novilla_vacia_edad') {
      this.vistaActiva = 'masivo';
      this.mostrarVistaActiva();
      this.compCuadricula.setModulo('palpaciones');
    } else if (tipo === 'crecimiento_bajo_gdp') {
      this.vistaActiva = 'masivo';
      this.mostrarVistaActiva();
      this.compCuadricula.setModulo('pesajes');
    }
  }

  actualizarHeader() {
    const rol = this.state.usuarioActual ? this.state.usuarioActual.rol : null;
    const esSuperAdmin = rol === 'superadmin';

    // 1. Selector de Empresa Multi-Tenant (visible sólo para Super Admin)
    const containerEmp = document.getElementById('container-empresa-nav');
    const selEmp = document.getElementById('select-empresa-nav');
    if (containerEmp) {
      if (esSuperAdmin) {
        containerEmp.classList.remove('hidden');
        containerEmp.classList.add('flex');
        if (selEmp) {
          const empList = this.state.empresas || [];
          if (empList.length === 0) {
            selEmp.innerHTML = '<option value="">(Sin Empresas Registradas)</option>';
          } else {
            selEmp.innerHTML = `
              <option value="todas" ${this.state.empresaActivaId === 'todas' || !this.state.empresaActivaId ? 'selected' : ''}>🌐 Todas las Empresas</option>
              ${empList.map((e) => `<option value="${e.id}" ${e.id === this.state.empresaActivaId ? 'selected' : ''}>${e.nombre}</option>`).join('')}
            `;
          }
        }
      } else {
        containerEmp.classList.add('hidden');
        containerEmp.classList.remove('flex');
      }
    }

    // 2. Selector de Finca Global (Filtrada por empresa)
    const fincasPermitidas = this.getFincasEmpresa();
    const fActiva = this.getFincaActiva();
    const selF = document.getElementById('select-finca-nav');
    if (selF) {
      if (fincasPermitidas.length === 0) {
        selF.innerHTML = '<option value="">(Sin Fincas Registradas)</option>';
      } else {
        selF.innerHTML = fincasPermitidas
          .map((f) => `<option value="${f.id}" ${(fActiva && f.id === fActiva.id) ? 'selected' : ''}>${f.nombre}</option>`)
          .join('');
      }
    }

    // 3. Identificador de Usuario en Sesión y Botón Salir
    const uActual = this.state.usuarioActual;
    if (!uActual) return;
    const avatarEl = document.getElementById('user-avatar-nav');
    const nombreEl = document.getElementById('user-nombre-nav');
    const empresaEl = document.getElementById('user-empresa-nav');
    const badgeEl = document.getElementById('user-rol-badge-nav');

    if (avatarEl) {
      avatarEl.textContent = this.getInitials(uActual.nombre);
      avatarEl.className = `w-6 h-6 rounded-full ${this.getColorBgAvatar(uActual.rol)} text-white flex items-center justify-center text-[10px] font-black`;
    }
    if (nombreEl) {
      nombreEl.textContent = uActual.nombre || uActual.usuario;
    }
    if (empresaEl) {
      empresaEl.textContent = this.getNombreEmpresaUsuario(uActual.empresaId);
    }
    if (badgeEl) {
      badgeEl.textContent = this.getNombreRol(uActual.rol);
      badgeEl.className = `text-[9px] font-mono font-black uppercase ${
        uActual.rol === 'superadmin' ? 'text-purple-300' :
        uActual.rol === 'administrador' ? 'text-blue-300' :
        uActual.rol === 'encargado' ? 'text-emerald-300' : 'text-amber-300'
      }`;
    }

    this.actualizarContadorAlertas();
    this.actualizarBadgeConexion();
  }

  actualizarContadorAlertas() {
    const animales = this.getAnimalesPredio();
    const alertas = detectarAlertasZootecnicas(animales);
    const badge = document.getElementById('contador-alertas-header');
    if (badge) {
      badge.textContent = alertas.length;
      if (badge.style) {
        badge.style.display = alertas.length > 0 ? 'inline-block' : 'none';
      }
    }
  }

  mostrarVistaActiva() {
    document.querySelectorAll('.bovi-view').forEach((el) => el.classList.add('hidden'));
    document.querySelectorAll('.btn-nav-bovi').forEach((btn) => {
      btn.classList.remove('active', 'text-emerald-400', 'bg-slate-800');
    });

    const activeEl = document.getElementById(`pantalla-${this.vistaActiva}`);
    if (activeEl) activeEl.classList.remove('hidden');

    document.querySelectorAll(`.btn-nav-bovi[data-vista="${this.vistaActiva}"]`).forEach((btn) => {
      btn.classList.add('active', 'text-emerald-400', 'bg-slate-800');
    });

    // Indicador activo en botón 'Más' de móvil si la vista actual pertenece al drawer
    const btnMasMobile = document.getElementById('btn-toggle-mas-mobile');
    if (btnMasMobile) {
      const vistasMas = ['reproduccion', 'nutricion', 'alertas', 'dinamica', 'dashboard', 'excel', 'admin'];
      if (vistasMas.includes(this.vistaActiva)) {
        btnMasMobile.classList.add('text-emerald-400', 'active');
        btnMasMobile.classList.remove('text-slate-400');
      } else {
        btnMasMobile.classList.remove('text-emerald-400', 'active');
        btnMasMobile.classList.add('text-slate-400');
      }
    }

    if (this.vistaActiva === 'masivo' && this.compCuadricula) this.compCuadricula.render();
    else if (this.vistaActiva === 'animales' && this.compAnimales) this.compAnimales.render();
    else if (this.vistaActiva === 'nutricion' && this.compNutricion) this.compNutricion.render();
    else if (this.vistaActiva === 'alertas' && this.compAlertas) this.compAlertas.render();
    else if (this.vistaActiva === 'dinamica' && this.compDinamica) this.compDinamica.render();
    else if (this.vistaActiva === 'dashboard' && this.compDashboard) this.compDashboard.render();
    else if (this.vistaActiva === 'reproduccion' && this.compReproduccion) this.compReproduccion.render();
    else if (this.vistaActiva === 'excel' && this.compExcel) this.compExcel.render();
    else if (this.vistaActiva === 'admin' && this.compAdmin) this.compAdmin.render();
    else if (this.vistaActiva === 'traslados' && this.compTraslados) this.compTraslados.render();
    else if (this.vistaActiva === 'ingresos' && this.compIngresos) this.compIngresos.render();
  }

  enlazarEventosGlobales() {
    // Drawer 'Más Opciones' en móvil
    const btnToggleMas = document.getElementById('btn-toggle-mas-mobile');
    const menuMas = document.getElementById('menu-mas-opciones-mobile');
    const backdropMas = document.getElementById('backdrop-mas-mobile');
    const btnCerrarMas = document.getElementById('btn-cerrar-mas-mobile');

    const toggleMenuMas = (mostrar) => {
      if (!menuMas || !backdropMas) return;
      if (mostrar !== undefined) {
        menuMas.classList.toggle('hidden', !mostrar);
        backdropMas.classList.toggle('hidden', !mostrar);
      } else {
        menuMas.classList.toggle('hidden');
        backdropMas.classList.toggle('hidden');
      }
    };

    if (btnToggleMas && !btnToggleMas._listenerAdded) {
      btnToggleMas._listenerAdded = true;
      btnToggleMas.addEventListener('click', () => toggleMenuMas());
    }
    if (backdropMas && !backdropMas._listenerAdded) {
      backdropMas._listenerAdded = true;
      backdropMas.addEventListener('click', () => toggleMenuMas(false));
    }
    if (btnCerrarMas && !btnCerrarMas._listenerAdded) {
      btnCerrarMas._listenerAdded = true;
      btnCerrarMas.addEventListener('click', () => toggleMenuMas(false));
    }

    document.querySelectorAll('.btn-nav-bovi').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const v = e.currentTarget.getAttribute('data-vista');
        if (v) {
          // Cerrar menú móvil si estaba abierto
          toggleMenuMas(false);
          this.vistaActiva = v;
          this.mostrarVistaActiva();
        }
      });
    });

    const selEmp = document.getElementById('select-empresa-nav');
    if (selEmp) {
      selEmp.addEventListener('change', (e) => {
        this.setEmpresaActiva(e.target.value);
      });
    }

    const selF = document.getElementById('select-finca-nav');
    if (selF) {
      selF.addEventListener('change', (e) => {
        this.state.fincaActivaId = e.target.value;
        this.guardarEstado();
        this.actualizarHeader();
        this.compCuadricula.cargarFilasDesdeInventario();
        this.mostrarVistaActiva();
      });
    }

    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout && !btnLogout._listenerAdded) {
      btnLogout._listenerAdded = true;
      btnLogout.addEventListener('click', () => {
        this.logout();
      });
    }

    const btnStatusCloud = document.getElementById('status-red-pwa');
    if (btnStatusCloud && !btnStatusCloud._listenerAdded) {
      btnStatusCloud._listenerAdded = true;
      btnStatusCloud.addEventListener('click', () => {
        this.sincronizarManualConSupabase();
      });
    }

    const btnBackupHeader = document.getElementById('btn-backup-excel-header');
    if (btnBackupHeader && !btnBackupHeader._listenerAdded) {
      btnBackupHeader._listenerAdded = true;
      btnBackupHeader.addEventListener('click', async () => {
        await this.exportarCopiaSeguridadCompleta('xlsx');
      });
    }
  }

  // ==========================================================================
  // COPIA DE SEGURIDAD INTEGRAL (EXCEL MULTI-HOJA & RESGUARDO LOCAL)
  // ==========================================================================

  async exportarCopiaSeguridadCompleta(formato = 'xlsx') {
    try {
      this.mostrarNotificacionToast('⏳ Generando copia de seguridad del sistema...', 'info');

      // Resguardo preventivo: sincronización previa rápida si está online
      if (this.online && this.supabase && this.supabase.estaConfigurado()) {
        try {
          const pullRes = await this.supabase.descargarDatosDeSupabase(4000);
          if (pullRes && pullRes.ok && pullRes.datos) {
            this.integrarDatosSupabase(pullRes.datos);
          }
        } catch (e) {
          console.warn('Sincronización rápida previa a exportación omitida:', e);
        }
      }

      if (formato === 'json') {
        const res = ExportadorBackupService.exportarBackupJSON(this.state);
        if (res && res.ok) {
          this.mostrarNotificacionToast(`✅ Copia JSON descargada con éxito (${res.nombreArchivo}).`, 'success');
        }
      } else {
        const res = ExportadorBackupService.exportarLibroExcel(this.state);
        if (res && res.ok) {
          const r = res.resumen || {};
          this.mostrarNotificacionToast(`✅ Respaldo Excel descargado: ${r.animales || 0} animales y ${r.pesajes || 0} pesajes en 11 hojas.`, 'success');
        }
      }
    } catch (err) {
      console.error('Error generando copia de seguridad:', err);
      alert('Error al generar copia de seguridad: ' + (err.message || err));
    }
  }

  // ==========================================================================
  // MODAL DE CAMBIO Y CONSULTA DE USUARIO EN SESIÓN (ROL FIJO POR PERFIL)
  // ==========================================================================

  abrirModalSelectorUsuario() {
    const modal = document.getElementById('modal-selector-usuario');
    if (!modal) return;

    const uActual = this.state.usuarioActual;
    const usuarios = this.state.usuarios || [];

    modal.innerHTML = `
      <div class="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden my-auto flex flex-col max-h-[90vh]">
        <!-- HEADER -->
        <div class="bg-slate-950 text-white p-5 flex justify-between items-center">
          <div class="flex items-center gap-3">
            <span class="text-2xl p-2 bg-purple-900/50 rounded-xl border border-purple-700">👤</span>
            <div>
              <h3 class="text-base font-black">Sesión & Control de Acceso</h3>
              <p class="text-xs text-slate-400">Perfil activo y cambio de cuenta de usuario</p>
            </div>
          </div>
          <button id="btn-cerrar-modal-sesion" class="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white">✕</button>
        </div>

        <div class="p-5 overflow-y-auto space-y-4">
          <!-- PERFIL ACTUAL -->
          <div class="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white border border-slate-700 shadow-md">
            <span class="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400 block mb-1">Usuario en Sesión</span>
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-2xl ${this.getColorBgAvatar(uActual.rol)} text-white flex items-center justify-center text-lg font-black shadow-lg">
                ${this.getInitials(uActual.nombre)}
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-black text-base truncate">${uActual.nombre}</div>
                <div class="text-xs text-slate-300 font-mono">@${uActual.usuario}</div>
                <div class="mt-1 flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${this.getBadgeClaseRol(uActual.rol)}">
                    ${this.getNombreRol(uActual.rol)}
                  </span>
                  <span class="text-[11px] text-slate-400 truncate">
                    🏢 ${this.getNombreEmpresaUsuario(uActual.empresaId)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- NOTA EXPLICATIVA SOBRE ROL FIJO -->
          <div class="p-3 bg-purple-50 rounded-xl border border-purple-200 text-xs text-purple-900 flex items-start gap-2">
            <span class="text-base">ℹ️</span>
            <div>
              <strong>Seguridad RBAC:</strong> El rol del usuario es una propiedad fija de su perfil asignada durante la creación en el módulo administrativo. No se puede cambiar libremente en la barra superior.
            </div>
          </div>

          <!-- LISTA DE CUENTAS PARA CAMBIAR SESIÓN -->
          <div>
            <h4 class="text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
              Cambiar a Otra Cuenta (${usuarios.length})
            </h4>
            <div class="space-y-2">
              ${usuarios.map((u) => {
                const esActivo = u.id === uActual.id || u.usuario === uActual.usuario;
                return `
                  <div class="p-3 rounded-xl border transition flex items-center justify-between gap-3 ${esActivo ? 'border-purple-400 bg-purple-50/50 ring-2 ring-purple-400/20' : 'border-slate-200 bg-white hover:bg-slate-50'}">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <div class="w-8 h-8 rounded-xl ${this.getColorBgAvatar(u.rol)} text-white flex items-center justify-center text-xs font-black shrink-0">
                        ${this.getInitials(u.nombre)}
                      </div>
                      <div class="min-w-0">
                        <div class="text-xs font-black text-slate-900 flex items-center gap-1.5 truncate">
                          ${u.nombre}
                          ${esActivo ? '<span class="px-1.5 py-0.2 rounded bg-purple-700 text-white text-[9px] font-bold">Activo</span>' : ''}
                        </div>
                        <div class="text-[11px] text-slate-500 font-mono">
                          @${u.usuario} • <span class="font-bold text-slate-700">${this.getNombreRol(u.rol)}</span> • 🏢 ${this.getNombreEmpresaUsuario(u.empresaId)}
                        </div>
                      </div>
                    </div>

                    ${!esActivo ? `
                      <button class="btn-cambiar-a-usuario px-3 py-1.5 bg-slate-900 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition shrink-0 active:scale-95" data-id="${u.id}">
                        Ingresar
                      </button>
                    ` : `
                      <span class="text-xs font-bold text-purple-700 shrink-0">En uso</span>
                    `}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <div class="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button type="button" id="btn-cerrar-modal-sesion-2" class="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold">
            Cerrar
          </button>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');

    const cerrar1 = modal.querySelector('#btn-cerrar-modal-sesion');
    if (cerrar1) cerrar1.onclick = () => this.cerrarModalSelectorUsuario();

    const cerrar2 = modal.querySelector('#btn-cerrar-modal-sesion-2');
    if (cerr2) cerrar2.onclick = () => this.cerrarModalSelectorUsuario();

    modal.querySelectorAll('.btn-cambiar-a-usuario').forEach((btn) => {
      btn.onclick = () => {
        const uId = btn.getAttribute('data-id');
        if (uId) this.cambiarSesionUsuario(uId);
      };
    });
  }

  cerrarModalSelectorUsuario() {
    const modal = document.getElementById('modal-selector-usuario');
    if (modal) modal.classList.add('hidden');
  }

  cambiarSesionUsuario(usuarioId) {
    const user = (this.state.usuarios || []).find((u) => u.id === usuarioId || u.usuario === usuarioId);
    if (!user) {
      alert('Usuario no encontrado.');
      return;
    }

    this.state.usuarioActual = {
      id: user.id,
      usuario: user.usuario,
      nombre: user.nombre,
      rol: user.rol,
      empresaId: user.empresaId || null,
      fincasAsignadas: user.fincasAsignadas || 'todas'
    };

    if (user.empresaId) {
      this.state.empresaActivaId = user.empresaId;
    }

    const fincasPermitidas = this.getFincasEmpresa();
    if (fincasPermitidas.length > 0 && !fincasPermitidas.some((f) => f.id === this.state.fincaActivaId)) {
      this.state.fincaActivaId = fincasPermitidas[0].id;
    }

    this.guardarEstado();
    this.actualizarHeader();
    this.aplicarPermisosRBAC();
    if (this.compCuadricula) this.compCuadricula.cargarFilasDesdeInventario();
    this.mostrarVistaActiva();
    this.cerrarModalSelectorUsuario();
    alert(`✓ Sesión cambiada a: ${user.nombre} (${this.getNombreRol(user.rol)})`);
  }

  getNombreRol(rol) {
    switch (rol) {
      case 'superadmin': return '👑 Super Admin';
      case 'administrador': return '⭐ Administrador';
      case 'encargado': return '🤠 Encargado';
      case 'consultor': return '👁️ Consultor';
      case 'propietario': return '⭐ Administrador';
      case 'veterinario': return '🤠 Encargado';
      case 'operario': return '🤠 Encargado';
      case 'consulta': return '👁️ Consultor';
      default: return rol || 'Usuario';
    }
  }

  getBadgeClaseRol(rol) {
    switch (rol) {
      case 'superadmin': return 'bg-purple-500/30 text-purple-300 border border-purple-500/40';
      case 'administrador': return 'bg-blue-500/30 text-blue-300 border border-blue-500/40';
      case 'encargado': return 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40';
      case 'consultor': return 'bg-amber-500/30 text-amber-300 border border-amber-500/40';
      default: return 'bg-slate-700 text-slate-300';
    }
  }

  getColorBgAvatar(rol) {
    switch (rol) {
      case 'superadmin': return 'bg-purple-700';
      case 'administrador': return 'bg-blue-700';
      case 'encargado': return 'bg-emerald-700';
      case 'consultor': return 'bg-amber-700';
      default: return 'bg-slate-700';
    }
  }

  getInitials(nombre) {
    if (!nombre) return 'U';
    const parts = nombre.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  getNombreEmpresaUsuario(empId) {
    if (!empId) return 'Acceso Global';
    const emp = (this.state.empresas || []).find((e) => e.id === empId);
    return emp ? emp.nombre : empId;
  }


  // ==========================================================================
  // GESTIÓN INTEGRAL DE TRASLADOS DE ANIMALES ENTRE FINCAS
  // ==========================================================================

  abrirModalTrasladoRapido(animal) {
    this.navegarA('traslados');
    if (this.compTraslados) {
      this.compTraslados.abrirModalTrasladoRapido(animal);
    }
  }

  getTrasladosEmpresa() {
    if (!Array.isArray(this.state.traslados)) return [];
    if (this.state.usuarioActual && this.state.usuarioActual.rol === 'superadmin') {
      return this.state.traslados;
    }
    const fincasEmpresaIds = new Set(this.getFincasEmpresa().map((f) => f.id));
    return this.state.traslados.filter(
      (t) => fincasEmpresaIds.has(t.fincaOrigenId) || fincasEmpresaIds.has(t.fincaDestinoId)
    );
  }

  ejecutarTrasladoAnimales({ animalIds, fincaOrigenId, fincaDestinoId, fecha, motivo, loteDestino, observaciones }) {
    if (this.esUsuarioSoloConsulta()) {
      alert('Acción denegada: El perfil actual es de sólo consulta.');
      return false;
    }
    if (!animalIds || animalIds.length === 0) {
      alert('Por favor agrega al menos un animal a la lista de traslado.');
      return false;
    }
    if (!fincaDestinoId || fincaDestinoId === fincaOrigenId) {
      alert('Debes seleccionar una finca de destino válida diferente a la finca de origen.');
      return false;
    }

    const fechaOp = fecha || new Date().toISOString().split('T')[0];
    const horaOp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const fOrigen = (this.state.fincas || []).find((f) => f.id === fincaOrigenId);
    const fDestino = (this.state.fincas || []).find((f) => f.id === fincaDestinoId);
    const responsable = this.state.usuarioActual ? this.state.usuarioActual.nombre : 'Operador';

    if (!Array.isArray(this.state.traslados)) this.state.traslados = [];

    const trasladados = [];
    animalIds.forEach((id) => {
      const animal = (this.state.animales || []).find((a) => a.id === id || a.identificacionTag === id);
      if (!animal) return;

      const lotePrevio = animal.lote || 'General';
      const loteNuevo = loteDestino || animal.lote || 'General';

      animal.fincaId = fincaDestinoId;
      animal.lote = loteNuevo;

      const regTraslado = {
        id: `TRS-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        fecha: fechaOp,
        hora: horaOp,
        animalId: animal.id,
        tag: animal.identificacionTag,
        nombreAlias: animal.nombreAlias || animal.identificacionTag,
        especie: animal.especie || 'bovino',
        raza: animal.raza || 'Común',
        categoria: animal.categoria || 'General',
        fincaOrigenId,
        fincaOrigenNombre: fOrigen ? fOrigen.nombre : fincaOrigenId,
        fincaDestinoId,
        fincaDestinoNombre: fDestino ? fDestino.nombre : fincaDestinoId,
        loteAnterior: lotePrevio,
        loteNuevo: loteNuevo,
        motivo: motivo || 'Pastoreo y Rotación',
        observaciones: observaciones || '',
        responsable
      };

      if (!animal.historialTraslados) animal.historialTraslados = [];
      animal.historialTraslados.unshift(regTraslado);
      this.state.traslados.unshift(regTraslado);

      this.registrarActividadOperacion({
        id: regTraslado.id,
        fecha: fechaOp,
        hora: horaOp,
        accion: 'traslados',
        modulo: 'traslados',
        tag: animal.identificacionTag,
        animalId: animal.id,
        nombreAlias: animal.nombreAlias,
        especie: animal.especie || 'bovino',
        raza: animal.raza,
        categoria: animal.categoria,
        lote: loteNuevo,
        fincaId: fincaDestinoId,
        fincaNombre: fDestino ? fDestino.nombre : fincaDestinoId,
        detalle: `Traslado: De "${fOrigen ? fOrigen.nombre : fincaOrigenId}" ➔ A "${fDestino ? fDestino.nombre : fincaDestinoId}"`,
        subDetalle: `Lote en Destino: ${loteNuevo} | Motivo: ${motivo || 'Rotación'}`,
        observaciones: observaciones || '',
        responsable
      });

      trasladados.push(animal.identificacionTag);
    });

    this.guardarEstado();
    this.actualizarHeader();
    this.refrescarVistas();

    alert(`✓ Traslado exitoso: ${trasladados.length} ejemplares movilizados a "${fDestino ? fDestino.nombre : fincaDestinoId}".`);
    return true;
  }

  revertirTrasladoAnimal(trasladoId) {
    if (this.esUsuarioSoloConsulta()) {
      alert('Acción denegada: El perfil actual es de sólo consulta.');
      return false;
    }
    const idx = (this.state.traslados || []).findIndex((t) => t.id === trasladoId);
    if (idx === -1) {
      alert('Registro de traslado no encontrado.');
      return false;
    }
    const t = this.state.traslados[idx];
    const animal = (this.state.animales || []).find((a) => a.id === t.animalId || a.identificacionTag === t.tag);
    if (animal) {
      animal.fincaId = t.fincaOrigenId;
      if (t.loteAnterior) animal.lote = t.loteAnterior;
    }
    this.state.traslados.splice(idx, 1);
    this.state.operacionesDiarias = (this.state.operacionesDiarias || []).filter((o) => o.id !== trasladoId);

    this.guardarEstado();
    this.actualizarHeader();
    this.refrescarVistas();
    alert('✓ Traslado revertido: El ejemplar ha retornado a su finca previa.');
    return true;
  }

  // ==========================================================================
  // REGISTRO GENERAL DE ACTIVIDADES & BITÁCORA DE CAMPO (INGRESOS DIARIOS)
  // ==========================================================================

  registrarActividadOperacion(op) {
    if (!Array.isArray(this.state.operacionesDiarias)) {
      this.state.operacionesDiarias = [];
    }
    const id = op.id || `ACT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const fecha = op.fecha || new Date().toISOString().split('T')[0];
    const hora = op.hora || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const fincaObj = (this.state.fincas || []).find((f) => f.id === op.fincaId);
    const fincaNombre = op.fincaNombre || (fincaObj ? fincaObj.nombre : op.fincaId);
    const responsable = op.responsable || (this.state.usuarioActual ? this.state.usuarioActual.nombre : 'Operador');

    const nuevaActividad = {
      ...op,
      id,
      fecha,
      hora,
      fincaNombre,
      responsable
    };

    this.state.operacionesDiarias.unshift(nuevaActividad);
    return nuevaActividad;
  }

  getTodasLasOperaciones(filtros = {}) {
    const { texto = '', accion = 'todas', finca = 'todas', fecha = '', rango = 'todo' } = filtros;
    let list = Array.isArray(this.state.operacionesDiarias) ? [...this.state.operacionesDiarias] : [];

    // Fusión dinámica: Si existen pesajes en this.state.pesajes no indexados en operacionesDiarias, incorporarlos
    if (Array.isArray(this.state.pesajes)) {
      const opsIds = new Set(list.map((o) => o.id || ''));
      const mapaFincas = new Map((this.state.fincas || []).map((f) => [f.id, f.nombre]));
      for (const p of this.state.pesajes) {
        if (!p) continue;
        const pId = p.id || '';
        const actId = `ACT-${pId}`;
        if (!opsIds.has(pId) && !opsIds.has(actId)) {
          list.push({
            id: actId,
            fecha: p.fecha || '',
            hora: p.hora || '08:00',
            fincaId: p.fincaId,
            fincaNombre: mapaFincas.get(p.fincaId) || 'Predio',
            accion: 'pesajes',
            modulo: 'pesajes',
            tag: p.tag || p.animalTag || '',
            animalId: p.animalId,
            nombreAlias: p.nombreAlias || '',
            peso: Number(p.pesoNuevo || p.peso || 0),
            gdp: p.gdp ? Number(p.gdp) : null,
            detalle: `Pesaje registrado: ${p.pesoNuevo || p.peso || 0} Kg` + (p.gdp ? ` (GDP: ${p.gdp} g/d)` : ''),
            responsable: p.responsable || 'Báscula',
            observaciones: p.observaciones || ''
          });
        }
      }
    }

    const fincasEmpresa = this.getFincasEmpresa().map((f) => f.id);
    const esSuperAdmin = this.state.usuarioActual && this.state.usuarioActual.rol === 'superadmin';

    // Aislamiento tenant: solo operaciones de fincas de la empresa del usuario
    if (!esSuperAdmin) {
      list = list.filter((op) => !op.fincaId || fincasEmpresa.includes(op.fincaId));
    }

    // Filtro por finca
    if (finca && finca !== 'todas') {
      list = list.filter((op) => op.fincaId === finca);
    }

    // Filtro por acción (tolerante a singular/plural y sinónimos)
    if (accion && accion !== 'todas') {
      const matchAccion = (opAccion, opModulo) => {
        const a = (opAccion || '').toLowerCase();
        const m = (opModulo || '').toLowerCase();
        if (accion === 'pesajes') return a === 'pesajes' || a === 'pesaje' || m === 'pesajes';
        if (accion === 'partos') return a === 'partos' || a === 'parto' || m === 'partos';
        if (accion === 'destetes') return a === 'destetes' || a === 'destete' || m === 'destetes';
        if (accion === 'palpaciones') return a === 'palpaciones' || a === 'palpacion' || m === 'palpaciones' || a.includes('palpa');
        if (accion === 'leche') return a === 'leche' || a === 'pesaje_leche' || m === 'lecheria' || m === 'leche';
        if (accion === 'servicios') return a === 'servicios' || a === 'servicio' || m === 'reproduccion' || a.includes('inseminac') || a.includes('monta');
        if (accion === 'traslados') return a === 'traslados' || a === 'traslado' || m === 'traslados';
        return a === accion || m === accion;
      };
      list = list.filter((op) => matchAccion(op.accion, op.modulo));
    }

    // Filtro por fecha específica
    if (fecha) {
      list = list.filter((op) => op.fecha === fecha);
    }

    // Filtro por rango relativo
    if (rango && rango !== 'todo' && !fecha) {
      const hoyStr = new Date().toISOString().split('T')[0];
      if (rango === 'hoy') {
        list = list.filter((op) => op.fecha === hoyStr);
      } else if (rango === '7dias') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        const lim = d.toISOString().split('T')[0];
        list = list.filter((op) => op.fecha >= lim);
      } else if (rango === '30dias') {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        const lim = d.toISOString().split('T')[0];
        list = list.filter((op) => op.fecha >= lim);
      }
    }

    // Filtro por búsqueda de texto
    if (texto && texto.trim().length > 0) {
      const q = texto.trim().toLowerCase();
      list = list.filter((op) => {
        return (
          (op.tag || '').toLowerCase().includes(q) ||
          (op.nombreAlias || '').toLowerCase().includes(q) ||
          (op.accion || '').toLowerCase().includes(q) ||
          (op.fincaNombre || '').toLowerCase().includes(q) ||
          (op.fincaId || '').toLowerCase().includes(q) ||
          (op.detalle || '').toLowerCase().includes(q) ||
          (op.subDetalle || '').toLowerCase().includes(q) ||
          (op.observaciones || '').toLowerCase().includes(q) ||
          (op.responsable || '').toLowerCase().includes(q) ||
          (op.fecha || '').toLowerCase().includes(q)
        );
      });
    }

    // Ordenar de más reciente a más antiguo
    return list.sort((a, b) => {
      const compFecha = (b.fecha || '').localeCompare(a.fecha || '');
      if (compFecha !== 0) return compFecha;
      return (b.hora || '').localeCompare(a.hora || '');
    });
  }

  aplicarPermisosRBAC() {
    if (!this.state.usuarioActual) return;
    const esSoloConsulta = this.esUsuarioSoloConsulta();

    // Banner de modo solo consulta
    const bannerLector = document.getElementById('banner-modo-propietario');
    if (bannerLector) {
      bannerLector.style.display = esSoloConsulta ? 'block' : 'none';
      if (esSoloConsulta) {
        bannerLector.textContent = '👁️ Modo Consultor Activo: Permisos de sólo lectura habilitados. La creación, modificación o eliminación de datos está deshabilitada.';
      }
    }
  }
}

// Inicialización controlada como Singleton (garantiza una única instancia en memoria)
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  const initBoviApp = () => {
    if (!window.boviApp) {
      window.boviApp = new BoviTrackApp();
    }
  };
  if (typeof document !== 'undefined' && (document.readyState === 'complete' || document.readyState === 'interactive')) {
    initBoviApp();
  } else {
    window.addEventListener('DOMContentLoaded', initBoviApp);
  }
}

export { BoviTrackApp };
