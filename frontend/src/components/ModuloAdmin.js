/**
 * Ganadero AD - Módulo Administrativo & Multi-Tenant
 * Reconstrucción completa con Gobierno de Roles:
 * - Super Administrador (Control global SaaS, creación de empresas, creación de usuarios, purga selectiva de BD)
 * - 3 Roles Asignables para Empresas:
 *   1. Administrador: Modificaciones de la empresa, fincas, costos y configuración en la app
 *   2. Encargado: Ingreso y gestión de datos de campo del ganado (báscula, palpaciones, partos, servicios)
 *   3. Consultor: Solo consulta de información del ganado (sin permisos de modificación)
 */

export class ModuloAdmin {
  constructor({
    containerId = 'pantalla-admin',
    getFincas,
    getFincaActiva,
    getUsuarios,
    getTodosLosUsuarios,
    getCostosFijos,
    getInversiones,
    getRolActual,
    getUsuarioActual,
    getEmpresas,
    getEmpresaActiva,
    getAnimales,
    getCostosFijosMap,
    getInversionesTodas,
    onSeleccionarEmpresa,
    onSeleccionarFinca,
    onCrearEmpresa,
    onActualizarEmpresa,
    onEliminarEmpresa,
    onRenovarVigenciaEmpresa,
    onCambiarEstadoAccesoEmpresa,
    calcularVigencia,
    onCrearFinca,
    onEliminarFinca,
    onActualizarPrecios,
    onGuardarCostos,
    onCrearInversion,
    onEliminarInversion,
    onPurgarFinca,
    onPurgarEmpresa,
    onPurgarBaseDatos,
    onResetearSistema,
    onCrearUsuario,
    onEliminarUsuario,
    onActualizarUsuario,
    onCambiarPassword,
    getSupabaseService,
    onGuardarConfigSupabase,
    onProbarConexionSupabase,
    onPushSupabase,
    onPullSupabase,
    onExportarBackupExcel,
    onExportarBackupJSON,
    getPesajes,
    getOperaciones
  }) {
    this.containerId = containerId;
    this.container = typeof document !== 'undefined' ? document.getElementById(containerId) : null;

    this.getFincas = getFincas;
    this.getFincaActiva = getFincaActiva;
    this.getUsuarios = getUsuarios;
    this.getTodosLosUsuarios = getTodosLosUsuarios || getUsuarios;
    this.getCostosFijos = getCostosFijos;
    this.getInversiones = getInversiones;
    this.getRolActual = getRolActual;
    this.getUsuarioActual = getUsuarioActual;
    this.getEmpresas = getEmpresas;
    this.getEmpresaActiva = getEmpresaActiva;
    this.getAnimales = getAnimales;
    this.getCostosFijosMap = getCostosFijosMap;
    this.getInversionesTodas = getInversionesTodas;
    this.getPesajes = getPesajes;
    this.getOperaciones = getOperaciones;

    this.onExportarBackupExcel = onExportarBackupExcel;
    this.onExportarBackupJSON = onExportarBackupJSON;

    this.onSeleccionarEmpresa = onSeleccionarEmpresa;
    this.onSeleccionarFinca = onSeleccionarFinca;
    this.onCrearEmpresa = onCrearEmpresa;
    this.onActualizarEmpresa = onActualizarEmpresa;
    this.onEliminarEmpresa = onEliminarEmpresa;
    this.onRenovarVigenciaEmpresa = onRenovarVigenciaEmpresa;
    this.onCambiarEstadoAccesoEmpresa = onCambiarEstadoAccesoEmpresa;
    this.calcularVigencia = calcularVigencia;

    this.onCrearFinca = onCrearFinca;
    this.onEliminarFinca = onEliminarFinca;
    this.onActualizarPrecios = onActualizarPrecios;
    this.onGuardarCostos = onGuardarCostos;
    this.onCrearInversion = onCrearInversion;
    this.onEliminarInversion = onEliminarInversion;
    this.onPurgarFinca = onPurgarFinca;
    this.onPurgarEmpresa = onPurgarEmpresa;
    this.onPurgarBaseDatos = onPurgarBaseDatos;
    this.onResetearSistema = onResetearSistema;

    this.onCrearUsuario = onCrearUsuario;
    this.onEliminarUsuario = onEliminarUsuario;
    this.onActualizarUsuario = onActualizarUsuario;
    this.onCambiarPassword = onCambiarPassword;

    this.getSupabaseService = getSupabaseService;
    this.onGuardarConfigSupabase = onGuardarConfigSupabase;
    this.onProbarConexionSupabase = onProbarConexionSupabase;
    this.onPushSupabase = onPushSupabase;
    this.onPullSupabase = onPullSupabase;

    this.seccion = 'empresas'; // 'empresas' | 'usuarios' | 'finanzas' | 'supabase' | 'mantenimiento'
    this.filtroUsuario = '';
    this.filtroEmpresaUsuario = 'todos';
    this.modalCrearEmpresaAbierto = false;
    this.empresaEditando = null;
    this.modalCrearFincaAbierto = false;
    this.empresaParaNuevaFinca = null;
    this.modalCrearUsuarioAbierto = false;
    this.usuarioEditando = null;
    this.usuarioCambiandoPassword = null;
    this.modalSqlSupabaseAbierto = false;
    this.modalCrearInversionAbierto = false;
    this.supabaseFeedback = null;
    this.sincronizandoSupabase = false;
    this.passwordsVisibles = {};
    this.empresaParaNuevoUsuario = null;
    this.fincaFinanzasSeleccionada = null;
  }

  init() {
    if (typeof document !== 'undefined') {
      this.container = document.getElementById(this.containerId);
    }
    this.render();
  }

  setSeccion(sec) {
    this.seccion = sec;
    this.render();
  }

  render() {
    if (typeof document === 'undefined') return;

    if (!this.container) {
      this.container = document.getElementById(this.containerId);
    }
    if (!this.container) {
      return;
    }

    const uActual = this.getUsuarioActual ? this.getUsuarioActual() : null;
    const rol = this.getRolActual ? this.getRolActual() : (uActual ? uActual.rol : 'consultor');
    const esSuperAdmin = rol === 'superadmin';
    const esAdmin = rol === 'administrador' || esSuperAdmin;
    const esEncargado = rol === 'encargado';
    const esConsultor = rol === 'consultor';

    // 1. RESTRICCIÓN PARA ENCARGADO DE CAMPO
    if (esEncargado) {
      this.container.innerHTML = `
        <div class="max-w-2xl mx-auto my-8 sm:my-14 p-6 sm:p-10 bg-white rounded-3xl shadow-xl border border-slate-200 text-center space-y-4">
          <div class="w-20 h-20 bg-amber-100 text-amber-800 rounded-3xl flex items-center justify-center mx-auto text-4xl shadow-inner border border-amber-200">
            🤠
          </div>
          <div class="space-y-1">
            <h3 class="text-xl font-black text-slate-900">Módulo Administrativo Restringido</h3>
            <p class="text-xs font-mono uppercase font-bold text-amber-700">Rol Activo: Encargado de Campo</p>
          </div>
          <p class="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
            Tu perfil está configurado para la <strong>operación directa en campo</strong> del ganado. Cuentas con permisos para ingresar información en báscula, partos, servicios y palpaciones, pero la administración corporativa y financiera está reservada al Administrador.
          </p>
          <div class="p-4 bg-slate-50 rounded-2xl text-xs text-slate-700 border border-slate-200 inline-block text-left space-y-2">
            <div class="font-black text-slate-900 flex items-center gap-1.5">
              <span>📋</span> Tus Módulos Operativos Habilitados:
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div class="p-2 bg-white rounded-xl border border-slate-200">
                ⚖️ <strong>Báscula Masiva:</strong> Pesajes y ganancias de peso.
              </div>
              <div class="p-2 bg-white rounded-xl border border-slate-200">
                🧬 <strong>Reproducción:</strong> Registro de IA, TE y Monta.
              </div>
              <div class="p-2 bg-white rounded-xl border border-slate-200">
                🏷️ <strong>Hato & Fichas:</strong> Partos, destetes y secados.
              </div>
              <div class="p-2 bg-white rounded-xl border border-slate-200">
                📊 <strong>Excel:</strong> Cargue masivo zootécnico unificado.
              </div>
            </div>
          </div>
          <div class="pt-2 text-xs text-slate-400">
            Si requieres ajustes de empresa, predios o contraseñas, comunícate con tu <strong>Administrador</strong>.
          </div>
        </div>
      `;
      return;
    }

    const fincas = this.getFincas ? this.getFincas() : [];
    const fincaActiva = this.getFincaActiva ? this.getFincaActiva() : null;
    const usuarios = this.getUsuarios ? this.getUsuarios() : [];
    const empresas = this.getEmpresas ? this.getEmpresas() : [];
    const empresaActiva = this.getEmpresaActiva ? this.getEmpresaActiva() : null;
    const costos = this.getCostosFijos ? this.getCostosFijos() : {};
    const inversiones = this.getInversiones ? this.getInversiones() : [];

    this.container.innerHTML = `
      <div class="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        <!-- HEADER DEL MÓDULO ADMINISTRATIVO -->
        <div class="bg-gradient-to-r from-slate-950 via-purple-950 to-slate-900 text-white p-5 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div class="flex items-center gap-3.5">
            <span class="text-3xl sm:text-4xl p-2.5 bg-purple-900/50 rounded-2xl border border-purple-600/60 shadow-inner">
              ${esSuperAdmin ? '👑' : '🏢'}
            </span>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="text-lg sm:text-xl font-black tracking-tight">
                  ${esSuperAdmin ? 'Panel Super Administrador (Global)' : 'Administración de Empresa'}
                </h3>
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase ${esSuperAdmin ? 'bg-purple-500/30 text-purple-200 border border-purple-400/50' : 'bg-blue-500/30 text-blue-200 border border-blue-400/50'}">
                  ${esSuperAdmin ? 'SaaS Multi-Tenant' : (empresaActiva ? empresaActiva.nombre : 'Tenant')}
                </span>
              </div>
              <p class="text-xs text-purple-200/80 mt-0.5 max-w-xl">
                ${esSuperAdmin 
                  ? 'Control supremo: gestión de empresas, creación de usuarios, fincas, bases de datos y sincronización central.'
                  : 'Gestión de la empresa ganadera, predios, inventarios zootécnicos, costos fijos y equipo de trabajo.'
                }
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2 self-end sm:self-center shrink-0">
            <div class="text-right font-mono text-xs">
              <span class="text-[10px] text-purple-300/70 block uppercase">Usuario en Sesión:</span>
              <span class="font-black text-white flex items-center gap-1">
                ${this.getBadgeRolHtml(rol)} @${uActual ? uActual.usuario : 'admin'}
              </span>
            </div>
          </div>
        </div>

        <!-- PESTAÑAS DE NAVEGACIÓN ADMINISTRATIVA -->
        <div class="grid grid-cols-2 sm:grid-cols-6 bg-slate-100 border-b border-slate-200 p-1.5 gap-1.5 text-xs font-black">
          <button class="btn-sub-admin py-3 px-3 rounded-2xl transition flex items-center justify-center gap-1.5 ${this.seccion === 'empresas' ? 'bg-white text-purple-950 shadow-md border border-slate-200 ring-2 ring-purple-400/30' : 'text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'} cursor-pointer" data-sec="empresas">
            <span>🏢</span> Empresas & Fincas
          </button>
          <button class="btn-sub-admin py-3 px-3 rounded-2xl transition flex items-center justify-center gap-1.5 ${this.seccion === 'usuarios' ? 'bg-white text-purple-950 shadow-md border border-slate-200 ring-2 ring-purple-400/30' : 'text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'} cursor-pointer" data-sec="usuarios">
            <span>👥</span> Usuarios & Accesos
          </button>
          <button class="btn-sub-admin py-3 px-3 rounded-2xl transition flex items-center justify-center gap-1.5 ${this.seccion === 'finanzas' ? 'bg-white text-purple-950 shadow-md border border-slate-200 ring-2 ring-purple-400/30' : 'text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'} cursor-pointer" data-sec="finanzas">
            <span>💰</span> Precios & Costos
          </button>
          <button class="btn-sub-admin py-3 px-3 rounded-2xl transition flex items-center justify-center gap-1.5 ${this.seccion === 'backup' ? 'bg-white text-emerald-950 shadow-md border border-slate-200 ring-2 ring-emerald-400/30' : 'text-emerald-800 hover:bg-emerald-100/70'} cursor-pointer" data-sec="backup">
            <span>💾</span> Copia de Seguridad
          </button>
          <button class="btn-sub-admin py-3 px-3 rounded-2xl transition flex items-center justify-center gap-1.5 ${this.seccion === 'supabase' ? 'bg-white text-emerald-950 shadow-md border border-slate-200 ring-2 ring-emerald-400/30' : 'text-emerald-800 hover:bg-emerald-100/70'} cursor-pointer" data-sec="supabase">
            <span>☁️</span> Supabase Cloud
          </button>
          <button class="btn-sub-admin py-3 px-3 rounded-2xl transition flex items-center justify-center gap-1.5 ${this.seccion === 'mantenimiento' ? 'bg-white text-rose-950 shadow-md border border-slate-200 ring-2 ring-rose-400/30' : 'text-rose-700 hover:bg-rose-100/70'} cursor-pointer" data-sec="mantenimiento">
            <span>🗑️</span> Mantenimiento BD
          </button>
        </div>

        <!-- CONTENEDOR DE SUB-SECCIÓN -->
        <div class="p-5 sm:p-7">
          ${this.renderContenidoSeccion(fincas, fincaActiva, usuarios, costos, inversiones, empresas, empresaActiva, esSuperAdmin, esAdmin, esConsultor)}
        </div>

        <!-- MODALES DE CONTROL -->
        ${this.modalCrearEmpresaAbierto ? this.renderModalCrearEmpresa() : ''}
        ${this.empresaEditando ? this.renderModalEditarEmpresa() : ''}
        ${this.modalCrearFincaAbierto ? this.renderModalCrearFinca(empresas) : ''}
        ${this.modalCrearUsuarioAbierto ? this.renderModalCrearUsuario(empresas, fincas, esSuperAdmin) : ''}
        ${this.usuarioEditando ? this.renderModalEditarUsuario(empresas, fincas, esSuperAdmin) : ''}
        ${this.usuarioCambiandoPassword ? this.renderModalCambiarPassword() : ''}
        ${this.modalCrearInversionAbierto ? this.renderModalCrearInversion(fincas) : ''}
        ${this.modalSqlSupabaseAbierto ? this.renderModalSqlSupabase() : ''}
      </div>
    `;

    this.attachEvents();
  }

  renderContenidoSeccion(fincas, fincaActiva, usuarios, costos, inversiones, empresas, empresaActiva, esSuperAdmin, esAdmin, esConsultor) {
    if (this.seccion === 'empresas') {
      return this.renderSeccionEmpresas(empresas, empresaActiva, fincas, fincaActiva, usuarios, esSuperAdmin, esAdmin, esConsultor);
    } else if (this.seccion === 'usuarios') {
      return this.renderSeccionUsuarios(usuarios, empresas, fincas, esSuperAdmin, esAdmin, esConsultor);
    } else if (this.seccion === 'finanzas') {
      return this.renderSeccionFinanzas(fincas, fincaActiva, costos, inversiones, esAdmin, esConsultor);
    } else if (this.seccion === 'backup') {
      return this.renderSeccionBackup();
    } else if (this.seccion === 'supabase') {
      return this.renderSeccionSupabase(esAdmin, esConsultor);
    } else if (this.seccion === 'mantenimiento') {
      return this.renderSeccionMantenimiento(empresas, fincas, esSuperAdmin, esAdmin, esConsultor);
    }
    return '';
  }

  // ==========================================================================
  // SECCIÓN 1: EMPRESAS & FINCAS (JERARQUÍA MULTI-TENANT)
  // ==========================================================================
  renderSeccionEmpresas(empresas = [], empresaActiva = null, fincas = [], fincaActiva = null, usuarios = [], esSuperAdmin = false, esAdmin = false, esConsultor = false) {
    const uActual = this.getUsuarioActual ? this.getUsuarioActual() : null;
    const fincaActivaActual = fincaActiva || (this.getFincaActiva ? this.getFincaActiva() : null);
    let empresasAMostrar = empresas;

    // Aislamiento estricto: usuarios que no sean superadmin solo ven su empresa asignada
    if (!esSuperAdmin && uActual && uActual.empresaId) {
      empresasAMostrar = empresas.filter((e) => e.id === uActual.empresaId);
      if (empresasAMostrar.length === 0 && empresas.length > 0) {
        empresasAMostrar = [empresas[0]];
      }
    }

    const todosLosAnimales = this.getAnimales ? this.getAnimales() : [];
    const costosMap = this.getCostosFijosMap ? this.getCostosFijosMap() : {};
    const todasInversiones = this.getInversionesTodas ? this.getInversionesTodas() : [];

    return `
      <div class="space-y-6">
        <!-- BANNER DE ENCABEZADO -->
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-purple-50/70 p-5 rounded-3xl border border-purple-200">
          <div>
            <div class="flex items-center gap-2">
              <h4 class="font-black text-slate-900 text-sm sm:text-base">
                Gestión Jerárquica de Empresas Ganaderas (${empresasAMostrar.length})
              </h4>
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase ${esSuperAdmin ? 'bg-purple-200 text-purple-900' : 'bg-blue-200 text-blue-900'}">
                ${esSuperAdmin ? '👑 Super Administrador' : '⭐ Administrador'}
              </span>
            </div>
            <p class="text-xs text-slate-600 mt-1 leading-relaxed max-w-2xl">
              Cada empresa delimita sus predios, su inventario zootécnico independiente y su equipo de usuarios autorizados. Los datos están 100% aislados entre sí.
            </p>
          </div>

          ${esSuperAdmin ? `
            <button id="btn-abrir-crear-empresa" class="px-4 py-2.5 bg-purple-700 hover:bg-purple-600 active:scale-95 text-white font-black text-xs rounded-2xl shadow-lg transition flex items-center gap-2 shrink-0 cursor-pointer">
              <span>➕</span> Crear Nueva Empresa
            </button>
          ` : ''}
        </div>

        <!-- LISTA JERÁRQUICA DE EMPRESAS -->
        <div class="space-y-6">
          ${empresasAMostrar.length > 0 ? empresasAMostrar.map((emp) => {
            const esActiva = empresaActiva && empresaActiva.id === emp.id;
            const fincasDeEmpresa = fincas.filter((f) => f.empresaId === emp.id);
            const usuariosDeEmpresa = usuarios.filter((u) => u.empresaId === emp.id);

            return `
              <div class="bg-white rounded-3xl border-2 ${esActiva ? 'border-purple-500 ring-4 ring-purple-400/20 shadow-xl' : 'border-slate-200 shadow-md'} overflow-hidden transition">
                <!-- TARJETA EMPRESA: CABECERA -->
                <div class="p-5 ${esActiva ? 'bg-gradient-to-r from-purple-950 via-slate-900 to-purple-950 text-white' : 'bg-slate-900 text-white'} flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div class="flex items-center gap-3.5">
                    <div class="w-12 h-12 rounded-2xl bg-white/10 text-white flex items-center justify-center text-2xl font-black border border-white/20 shadow-inner">
                      🏢
                    </div>
                    <div>
                      ${(() => {
                        const vig = this.calcularVigencia ? this.calcularVigencia(emp) : { texto: emp.fechaVencimiento ? `Vence: ${emp.fechaVencimiento}` : 'Activa', clase: 'bg-emerald-500/20 text-emerald-300' };
                        return `
                          <div class="flex items-center gap-2 flex-wrap">
                            <h3 class="text-base font-black tracking-tight">${emp.nombre}</h3>
                            ${esActiva ? '<span class="px-2 py-0.5 rounded-full bg-purple-500 text-white text-[9px] font-black uppercase tracking-wider">Activa en Sesión</span>' : ''}
                            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${vig.clase}">
                              ${vig.texto}
                            </span>
                          </div>
                        `;
                      })()}
                      <div class="text-xs text-purple-200 font-mono mt-0.5">
                        NIT: <strong>${emp.nit || 'Sin NIT'}</strong> • País: <strong>${emp.pais || 'Colombia'}</strong> • Moneda: <strong>${emp.moneda || 'COP'}</strong>
                      </div>
                      <div class="text-[11px] text-slate-300 mt-1">
                        📍 ${emp.direccion || 'Sin dirección'} • 📞 ${emp.telefono || 'Sin teléfono'} • ✉️ ${emp.email || 'Sin correo'}
                      </div>
                    </div>
                  </div>

                  <!-- ACCIONES SOBRE LA EMPRESA Y CONTROL DE TIEMPO / VIGENCIA -->
                  <div class="flex items-center gap-2 self-end sm:self-center shrink-0 flex-wrap justify-end">
                    ${esSuperAdmin ? (() => {
                      const vig = this.calcularVigencia ? this.calcularVigencia(emp) : { esVencida: false };
                      const esIndef = emp.tiempoIndefinido || emp.fechaVencimiento === 'indefinido';
                      return `
                        <div class="flex items-center gap-1.5 bg-white/10 p-1.5 rounded-xl border border-white/10 flex-wrap">
                          <span class="text-[9px] font-bold text-purple-200 px-1">⏱️ Activar:</span>
                          <button class="btn-renovar-empresa px-2 py-0.5 rounded bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-bold text-[10px] transition cursor-pointer" data-id="${emp.id}" data-meses="1" title="Activar o ampliar por 1 Mes">+1 Mes</button>
                          <button class="btn-renovar-empresa px-2 py-0.5 rounded bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-bold text-[10px] transition cursor-pointer" data-id="${emp.id}" data-meses="3" title="Activar o ampliar por 3 Meses">+3 Meses</button>
                          <button class="btn-renovar-empresa px-2 py-0.5 rounded bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-bold text-[10px] transition cursor-pointer" data-id="${emp.id}" data-meses="6" title="Activar o ampliar por 6 Meses">+6 Meses</button>
                          <button class="btn-renovar-empresa px-2 py-0.5 rounded bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-bold text-[10px] transition cursor-pointer" data-id="${emp.id}" data-meses="12" title="Activar o ampliar por 1 Año">+1 Año</button>
                          <button class="btn-indefinido-empresa px-2 py-0.5 rounded ${esIndef ? 'bg-emerald-600 ring-2 ring-emerald-300 font-black' : 'bg-amber-600 hover:bg-amber-500 font-bold'} active:scale-95 text-white text-[10px] transition cursor-pointer" data-id="${emp.id}" title="Habilitar por tiempo indefinido (Permanente)">♾️ Indefinido</button>
                          ${emp.activa !== false && !vig.esVencida ? `
                            <button class="btn-bloquear-empresa px-2 py-0.5 rounded bg-rose-500/40 hover:bg-rose-600 text-rose-100 font-bold text-[10px] transition cursor-pointer ml-0.5" data-id="${emp.id}" title="Bloquear o suspender acceso inmediatamente">⛔ Bloquear</button>
                          ` : `
                            <button class="btn-reactivar-empresa px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] transition cursor-pointer ml-0.5" data-id="${emp.id}" title="Reactivar acceso a la empresa">⚡ Reactivar</button>
                          `}
                        </div>
                      `;
                    })() : ''}
                    ${esSuperAdmin ? `
                      <button class="btn-seleccionar-empresa px-3.5 py-1.5 rounded-xl ${esActiva ? 'bg-purple-600 text-white font-black cursor-default' : 'bg-white/10 hover:bg-white/20 text-white font-bold'} text-xs transition flex items-center gap-1 cursor-pointer" data-id="${emp.id}">
                        <span>${esActiva ? '✓ Seleccionada' : '🎯 Seleccionar'}</span>
                      </button>
                    ` : ''}
                    ${!esConsultor ? `
                      <button class="btn-abrir-editar-empresa px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition flex items-center gap-1 cursor-pointer" data-id="${emp.id}" title="Editar Datos de la Empresa">
                        ✏️ Editar
                      </button>
                    ` : ''}
                    ${esSuperAdmin ? `
                      <button class="btn-eliminar-empresa p-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs transition cursor-pointer" data-id="${emp.id}" data-nombre="${emp.nombre}" title="Eliminar Empresa y Fincas">
                        🗑️
                      </button>
                    ` : ''}
                  </div>
                </div>

                <div class="p-5 sm:p-6 space-y-6">
                  <!-- SECCIÓN ANIDADA 1: PREDIOS & FINCAS -->
                  <div class="space-y-3.5">
                    <div class="flex justify-between items-center pb-2.5 border-b border-slate-100">
                      <div>
                        <h5 class="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-1.5">
                          <span>🏡</span> Predios & Fincas de esta Empresa (${fincasDeEmpresa.length})
                        </h5>
                        <p class="text-[11px] text-slate-500">Cada predio administra su hato zootécnico independiente y costos propios.</p>
                      </div>
                      ${!esConsultor ? `
                        <button class="btn-crear-finca-empresa px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer" data-empresa-id="${emp.id}" data-empresa-nombre="${emp.nombre}">
                          <span>➕</span> Nueva Finca
                        </button>
                      ` : ''}
                    </div>

                    ${fincasDeEmpresa.length > 0 ? `
                      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        ${fincasDeEmpresa.map((f) => {
                          const animalesF = todosLosAnimales.filter((a) => a.fincaId === f.id);
                          const costosF = costosMap[f.id] || {};
                          const totalCostosF = Object.values(costosF).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
                          const invsF = todasInversiones.filter((i) => i.fincaId === f.id);
                          const esFincaActiva = f.id === fincaActivaActual?.id;

                          return `
                            <div class="p-4 rounded-2xl border ${esFincaActiva ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-400/20' : 'border-slate-200 bg-white'} shadow-sm flex flex-col justify-between">
                              <div>
                                <div class="flex justify-between items-start gap-2">
                                  <div>
                                    <div class="flex items-center gap-2">
                                      <span class="font-black text-slate-900 text-sm">${f.nombre}</span>
                                      ${esFincaActiva ? '<span class="px-2 py-0.5 rounded bg-emerald-700 text-white text-[9px] font-black uppercase">Activa</span>' : ''}
                                    </div>
                                    <div class="text-[10px] text-slate-400 font-mono mt-0.5">Código: ${f.codigo || f.id} • 📍 ${f.ubicacion || 'Colombia'}</div>
                                  </div>
                                  <span class="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 font-mono text-[10px] font-bold">
                                    ${f.areaHa || 0} Ha
                                  </span>
                                </div>

                                <!-- MÉTRICAS ZOOTÉCNICAS Y FINANCIERAS -->
                                <div class="grid grid-cols-3 gap-2 mt-3.5 text-center text-[10px]">
                                  <div class="p-2 bg-purple-50 rounded-xl border border-purple-100">
                                    <span class="text-purple-600 block font-bold">🏷️ Hato</span>
                                    <strong class="text-purple-950 text-xs font-black">${animalesF.length} Cabezas</strong>
                                  </div>
                                  <div class="p-2 bg-blue-50 rounded-xl border border-blue-100">
                                    <span class="text-blue-600 block font-bold">🧾 Costos/mes</span>
                                    <strong class="text-blue-950 text-xs font-black">$${Math.round(totalCostosF / 1000000)}M</strong>
                                  </div>
                                  <div class="p-2 bg-amber-50 rounded-xl border border-amber-100">
                                    <span class="text-amber-600 block font-bold">🏗️ Inversiones</span>
                                    <strong class="text-amber-950 text-xs font-black">${invsF.length} Activas</strong>
                                  </div>
                                </div>

                                <div class="text-[10px] text-slate-500 mt-2.5 font-mono flex justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                  <span>Leche: <strong>$${f.precioLecheLitro || 2450}/L</strong></span>
                                  <span>Carne: <strong>$${f.precioCarneKgPie || 8900}/kg</strong></span>
                                </div>
                              </div>

                              <div class="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                                <div class="flex items-center gap-1.5 flex-wrap">
                                  ${!esFincaActiva ? `
                                    <button class="btn-activar-finca px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer" data-id="${f.id}" title="Activar predio en sesión de trabajo">
                                      <span>🎯 Activar</span>
                                    </button>
                                  ` : ''}
                                  <button class="btn-ir-finanzas-finca px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-900 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer" data-id="${f.id}" title="Parametrizar costos fijos, cuotas e inversiones para este predio">
                                    <span>💰 Finanzas</span>
                                  </button>
                                </div>

                                ${!esConsultor ? `
                                  <button class="btn-eliminar-finca text-[11px] font-bold text-rose-600 hover:text-rose-800 p-1 rounded transition flex items-center gap-1 cursor-pointer" data-id="${f.id}" data-nombre="${f.nombre}" title="Eliminar Finca">
                                    <span>🗑️ Eliminar</span>
                                  </button>
                                ` : ''}
                              </div>
                            </div>
                          `;
                        }).join('')}
                      </div>
                    ` : `
                      <div class="p-6 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs">
                        Esta empresa aún no tiene fincas registradas. Presiona <strong>"+ Nueva Finca"</strong> para registrar su primer predio.
                      </div>
                    `}
                  </div>

                  <!-- SECCIÓN ANIDADA 2: USUARIOS DE ESTA EMPRESA -->
                  <div class="space-y-3.5 pt-4 border-t border-slate-100">
                    <div class="flex justify-between items-center pb-2.5 border-b border-slate-100">
                      <div>
                        <h5 class="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-1.5">
                          <span>👥</span> Usuarios con Acceso a ${emp.nombre} (${usuariosDeEmpresa.length})
                        </h5>
                        <p class="text-[11px] text-slate-500">Credenciales delimitadas estrictamente a los datos de esta empresa ganadera.</p>
                      </div>
                      ${!esConsultor ? `
                        <button class="btn-crear-usuario-empresa px-3.5 py-1.5 bg-purple-700 hover:bg-purple-600 active:scale-95 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer" data-empresa-id="${emp.id}" data-empresa-nombre="${emp.nombre}">
                          <span>➕</span> Nuevo Usuario
                        </button>
                      ` : ''}
                    </div>

                    ${usuariosDeEmpresa.length > 0 ? `
                      <div class="overflow-x-auto border border-slate-200 rounded-2xl shadow-sm">
                        <table class="w-full text-xs text-left">
                          <thead class="bg-slate-50 uppercase font-black text-slate-600 text-[10px] border-b border-slate-200">
                            <tr>
                              <th class="p-2.5">Usuario / Login</th>
                              <th class="p-2.5">Nombre & Contacto</th>
                              <th class="p-2.5">Rol Oficial</th>
                              <th class="p-2.5">Fincas Permitidas</th>
                              <th class="p-2.5">Contraseña Asignada</th>
                              <th class="p-2.5 text-center">Estado</th>
                              ${!esConsultor ? '<th class="p-2.5 text-center">Acciones</th>' : ''}
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-slate-100 font-medium">
                            ${usuariosDeEmpresa.map((u) => {
                              const passVisible = !!this.passwordsVisibles[u.id];
                              const passwordText = u.password || 'BoviPass123';
                              return `
                                <tr class="hover:bg-purple-50/20 transition">
                                  <td class="p-2.5 font-mono font-bold text-slate-900">
                                    @${u.usuario}
                                  </td>
                                  <td class="p-2.5">
                                    <div class="font-bold text-slate-900">${u.nombre}</div>
                                    <div class="text-[10px] text-slate-400">${u.email || 'Sin correo'} • ${u.telefono || 'Sin tel'}</div>
                                  </td>
                                  <td class="p-2.5">
                                    ${this.getBadgeRolHtml(u.rol)}
                                  </td>
                                  <td class="p-2.5">
                                    <div class="flex flex-wrap gap-1 items-center">
                                      ${this.renderBadgeFincasUsuario(u, fincas)}
                                    </div>
                                  </td>
                                  <td class="p-2.5">
                                    <div class="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 w-fit">
                                      <span class="font-mono font-bold text-[11px] ${passVisible ? 'text-slate-900' : 'text-slate-400 tracking-widest'}">
                                        ${passVisible ? passwordText : '••••••••'}
                                      </span>
                                      <button class="btn-toggle-ver-pass text-[10px] p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer" data-id="${u.id}">
                                        ${passVisible ? '🙈' : '👁️'}
                                      </button>
                                    </div>
                                  </td>
                                  <td class="p-2.5 text-center">
                                    <span class="px-2 py-0.5 rounded-full text-[9px] font-bold ${u.activo !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}">
                                      ${u.activo !== false ? '● Activo' : '○ Inactivo'}
                                    </span>
                                  </td>
                                  ${!esConsultor ? `
                                    <td class="p-2.5 text-center">
                                      <div class="flex items-center justify-center gap-1">
                                        <button class="btn-abrir-modal-password px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold transition flex items-center gap-1 cursor-pointer" data-id="${u.id}" title="Cambiar Contraseña">
                                          <span>🔑</span> Clave
                                        </button>
                                        <button class="btn-abrir-modal-editar px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold transition cursor-pointer" data-id="${u.id}" title="Editar Usuario">
                                          ✏️
                                        </button>
                                        <button class="btn-eliminar-usuario p-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-[10px] transition cursor-pointer" data-id="${u.id}" data-usuario="${u.usuario}" title="Eliminar Usuario">
                                          🗑️
                                        </button>
                                      </div>
                                    </td>
                                  ` : ''}
                                </tr>
                              `;
                            }).join('')}
                          </tbody>
                        </table>
                      </div>
                    ` : `
                      <div class="p-4 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs">
                        No hay usuarios asignados a esta empresa. Haz clic en <strong>"+ Nuevo Usuario"</strong> para crear administradores, encargados o consultores.
                      </div>
                    `}
                  </div>
                </div>
              </div>
            `;
          }).join('') : `
            <div class="p-10 text-center bg-white rounded-3xl border-2 border-dashed border-slate-200 space-y-3 shadow-sm">
              <span class="text-4xl block">🏢</span>
              <h4 class="font-black text-slate-800 text-sm">No hay empresas registradas</h4>
              <p class="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">El sistema se encuentra en blanco (0 datos). Haz clic en "Crear Nueva Empresa" para ingresar tu ganadería real.</p>
              ${esSuperAdmin ? `
                <button id="btn-crear-primera-empresa" class="px-5 py-2.5 bg-purple-700 hover:bg-purple-600 active:scale-95 text-white font-black text-xs rounded-xl shadow-lg transition inline-flex items-center gap-2 cursor-pointer">
                  <span>➕</span> Crear Mi Primera Empresa
                </button>
              ` : ''}
            </div>
          `}
        </div>
      </div>
    `;
  }

  renderBadgeFincasUsuario(u, fincas = []) {
    if (u.rol === 'superadmin') {
      return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">🌐 Todas las Fincas (Global)</span>';
    }
    const empFincas = (fincas || []).filter((f) => f.empresaId === u.empresaId);
    const esTodas = !u.fincasAsignadas || u.fincasAsignadas === 'todas' || (Array.isArray(u.fincasAsignadas) && u.fincasAsignadas.includes('todas'));

    if (esTodas) {
      return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">🏡 Todas las fincas (${empFincas.length})</span>`;
    }

    if (Array.isArray(u.fincasAsignadas) && u.fincasAsignadas.length > 0) {
      return u.fincasAsignadas.map((fid) => {
        const f = (fincas || []).find((item) => item.id === fid);
        const nom = f ? f.nombre : fid;
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200" title="${nom}">📍 ${nom}</span>`;
      }).join(' ');
    }

    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">Sin fincas asignadas</span>';
  }

  // ==========================================================================
  // SECCIÓN 2: GESTIÓN DE USUARIOS Y ROLES (RBAC)
  // ==========================================================================
  renderSeccionUsuarios(usuarios = [], empresas = [], fincas = [], esSuperAdmin = false, esAdmin = false, esConsultor = false) {
    let lista = usuarios;

    // Filtro por texto
    if (this.filtroUsuario.trim()) {
      const q = this.filtroUsuario.trim().toLowerCase();
      lista = lista.filter(
        (u) =>
          (u.usuario || '').toLowerCase().includes(q) ||
          (u.nombre || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.rol || '').toLowerCase().includes(q)
      );
    }

    // Filtro por empresa
    if (this.filtroEmpresaUsuario !== 'todos') {
      lista = lista.filter((u) => u.empresaId === this.filtroEmpresaUsuario);
    }

    return `
      <div class="space-y-4">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h4 class="font-black text-slate-900 text-sm flex items-center gap-2">
              <span>Gestión de Usuarios & Control de Roles (${usuarios.length} Registrados)</span>
            </h4>
            <p class="text-xs text-slate-500 mt-0.5">
              Administración de credenciales de acceso. Cada usuario cuenta con un rol estricto asignado en su perfil.
            </p>
          </div>

          ${!esConsultor ? `
            <button id="btn-abrir-modal-nuevo-usuario" class="px-4 py-2 bg-purple-700 hover:bg-purple-600 active:scale-95 text-white font-black text-xs rounded-xl shadow-lg transition flex items-center gap-1.5 cursor-pointer">
              <span>➕</span> Crear Nuevo Usuario
            </button>
          ` : ''}
        </div>

        <!-- BARRA DE FILTROS DE USUARIOS -->
        <div class="flex flex-col sm:flex-row gap-2 max-w-2xl">
          <input 
            type="text" 
            id="input-buscar-usuario" 
            value="${this.filtroUsuario}" 
            placeholder="Buscar por usuario, nombre, rol o correo..." 
            class="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-300 outline-none focus:border-purple-600"
          >
          ${esSuperAdmin ? `
            <select id="select-filtro-empresa-usr" class="px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 outline-none bg-white">
              <option value="todos" ${this.filtroEmpresaUsuario === 'todos' ? 'selected' : ''}>🏢 Todas las Empresas</option>
              ${empresas.map((e) => `<option value="${e.id}" ${this.filtroEmpresaUsuario === e.id ? 'selected' : ''}>${e.nombre}</option>`).join('')}
            </select>
          ` : ''}
        </div>

        <!-- TABLA COMPLETA DE USUARIOS -->
        <div class="overflow-x-auto border border-slate-200 rounded-2xl shadow-sm">
          <table class="w-full text-xs text-left">
            <thead class="bg-slate-100 uppercase font-black text-slate-700 text-[10px] border-b border-slate-200">
              <tr>
                <th class="p-3">Usuario / Handle</th>
                <th class="p-3">Nombre & Contacto</th>
                <th class="p-3">Empresa & Fincas</th>
                <th class="p-3">Rol Oficial</th>
                <th class="p-3">Contraseña Asignada</th>
                <th class="p-3 text-center">Estado</th>
                ${!esConsultor ? '<th class="p-3 text-center">Acciones</th>' : ''}
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 font-medium">
              ${lista.length > 0 ? lista.map((u) => {
                const passVisible = !!this.passwordsVisibles[u.id];
                const passwordText = u.password || 'BoviPass123';
                const emp = (empresas || []).find((e) => e.id === u.empresaId);

                return `
                  <tr class="hover:bg-purple-50/20 transition">
                    <td class="p-3">
                      <span class="font-black font-mono text-slate-900 block">@${u.usuario}</span>
                      <span class="text-[10px] text-slate-400 font-mono">${u.id}</span>
                    </td>
                    <td class="p-3">
                      <div class="font-bold text-slate-900">${u.nombre}</div>
                      <div class="text-[10px] text-slate-500">${u.email || 'Sin correo'} • ${u.telefono || 'Sin tel'}</div>
                    </td>
                    <td class="p-3">
                      <span class="font-bold text-slate-800 block">${emp ? emp.nombre : (u.rol === 'superadmin' ? '🌐 Acceso Global' : 'Sin asignar')}</span>
                      <span class="text-[10px] text-slate-400 font-mono">${emp ? emp.nit || emp.id : (u.empresaId || '')}</span>
                      <div class="mt-1.5 flex flex-wrap gap-1 items-center">
                        ${this.renderBadgeFincasUsuario(u, fincas)}
                      </div>
                    </td>
                    <td class="p-3">
                      ${this.getBadgeRolHtml(u.rol)}
                      <div class="text-[10px] text-slate-400 mt-1 max-w-xs">${this.getDetalleRol(u.rol)}</div>
                    </td>
                    <td class="p-3">
                      <div class="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 w-fit">
                        <span class="font-mono font-bold text-xs ${passVisible ? 'text-slate-900' : 'text-slate-400 tracking-widest'}">
                          ${passVisible ? passwordText : '••••••••'}
                        </span>
                        <button class="btn-toggle-ver-pass text-[10px] p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer" data-id="${u.id}">
                          ${passVisible ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </td>
                    <td class="p-3 text-center">
                      <span class="px-2 py-0.5 rounded-full text-[9px] font-bold ${u.activo !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}">
                        ${u.activo !== false ? '● Activo' : '○ Inactivo'}
                      </span>
                    </td>
                    ${!esConsultor ? `
                      <td class="p-3 text-center">
                        <div class="flex items-center justify-center gap-1.5">
                          <button class="btn-abrir-modal-password px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer" data-id="${u.id}" title="Cambiar Contraseña">
                            <span>🔑</span> Clave
                          </button>
                          <button class="btn-abrir-modal-editar px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition cursor-pointer" data-id="${u.id}" title="Editar Usuario">
                            ✏️
                          </button>
                          <button class="btn-eliminar-usuario p-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-[11px] transition cursor-pointer" data-id="${u.id}" data-usuario="${u.usuario}" title="Eliminar Usuario">
                            🗑️
                          </button>
                        </div>
                      </td>
                    ` : ''}
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="7" class="p-8 text-center text-slate-400">
                    No se encontraron usuarios con el filtro seleccionado.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // SECCIÓN 3: PRECIOS & FINANZAS OPERATIVAS (POR FINCA)
  // ==========================================================================
  renderSeccionFinanzas(fincas = [], fincaActiva = null, costos = {}, inversiones = [], esAdmin = false, esConsultor = false) {
    const costosMap = this.getCostosFijosMap ? this.getCostosFijosMap() : {};
    const todasInversiones = this.getInversionesTodas ? this.getInversionesTodas() : [];
    const empresas = this.getEmpresas ? this.getEmpresas() : [];
    const todosAnimales = this.getAnimales ? this.getAnimales() : [];

    // Finca seleccionada para la gestión financiera
    const finca = (this.fincaFinanzasSeleccionada && fincas.find(f => f.id === this.fincaFinanzasSeleccionada))
      || fincaActiva
      || (fincas.length > 0 ? fincas[0] : null);

    const fid = finca ? finca.id : null;
    const empresaDeFinca = finca ? (empresas.find(e => e.id === finca.empresaId) || null) : null;
    const costosFinca = fid ? (costosMap[fid] || {}) : {};
    const inversionesFinca = fid ? todasInversiones.filter(i => i.fincaId === fid) : [];
    const animalesFinca = fid ? todosAnimales.filter(a => a.fincaId === fid) : [];

    const nomina = parseFloat(costosFinca.nomina) || 0;
    const insumos = parseFloat(costosFinca.insumos) || 0;
    const herbicidas = parseFloat(costosFinca.herbicidas) || 0;
    const maquinaria = parseFloat(costosFinca.maquinaria) || 0;
    const servicios = parseFloat(costosFinca.servicios) || 0;
    const otros = parseFloat(costosFinca.otros) || 0;
    const totalFijos = nomina + insumos + herbicidas + maquinaria + servicios + otros;

    const totalAmortizacion = inversionesFinca
      .filter((i) => (i.estado || '').toLowerCase() === 'activa')
      .reduce((acc, inv) => {
        const monto = parseFloat(inv.montoTotalInversion || inv.montoTotal) || 0;
        const plazo = parseInt(inv.plazoMesesDiferido || inv.plazoMeses) || 1;
        return acc + (inv.cuotaMensual ? parseFloat(inv.cuotaMensual) : monto / plazo);
      }, 0);

    const costoTotalMes = totalFijos + totalAmortizacion;
    const areaHa = parseFloat(finca?.areaHa || 1);
    const costoPorHa = areaHa > 0 ? Math.round(costoTotalMes / areaHa) : 0;
    const esFincaActivaEnSesion = finca && fincaActiva && finca.id === fincaActiva.id;

    return `
      <div class="space-y-6">
        <!-- SELECTOR DE PREDIO PARA FINANZAS -->
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-purple-900 via-indigo-950 to-slate-900 text-white p-5 rounded-3xl shadow-lg border border-purple-700/50">
          <div class="flex items-center gap-3.5">
            <span class="text-3xl p-2.5 bg-white/10 rounded-2xl border border-white/20">🏡</span>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h4 class="font-black text-sm sm:text-base">Finanzas & Costos Operativos por Finca</h4>
                ${esFincaActivaEnSesion ? '<span class="px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 text-[10px] font-mono font-bold border border-emerald-400/40">● Predio Activo en Sesión</span>' : ''}
              </div>
              <p class="text-xs text-purple-200/80 mt-0.5">
                Cada predio administra sus costos fijos, cuotas de inversión diferida y precios de mercado de manera 100% aislada.
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2 w-full sm:w-auto shrink-0">
            <label for="select-finca-finanzas" class="text-xs font-bold text-purple-200 whitespace-nowrap">Predio:</label>
            <select id="select-finca-finanzas" class="w-full sm:w-64 px-3 py-2 text-xs font-black rounded-xl border border-purple-400 bg-slate-900 text-white shadow-inner outline-none cursor-pointer focus:ring-2 focus:ring-purple-400">
              ${fincas.map((f) => {
                const emp = empresas.find(e => e.id === f.empresaId);
                const labelEmp = emp ? ` [${emp.nombre}]` : '';
                return `<option value="${f.id}" ${f.id === fid ? 'selected' : ''}>${f.nombre}${labelEmp}</option>`;
              }).join('')}
            </select>
          </div>
        </div>

        ${!finca ? `
          <div class="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs">
            No hay predios registrados en el sistema. Registra primero una finca en la pestaña "Empresas & Fincas".
          </div>
        ` : `
          <!-- RESUMEN FINANCIERO DEL PREDIO SELECCIONADO -->
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <span class="text-[10px] font-bold text-slate-500 uppercase block">Costos Fijos / Mes</span>
              <div class="text-xl font-black text-slate-900 mt-1 font-mono">$${Math.round(totalFijos).toLocaleString('es-CO')}</div>
              <span class="text-[10px] text-slate-400 font-medium">Nómina, insumos y mantenimiento</span>
            </div>

            <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <span class="text-[10px] font-bold text-purple-700 uppercase block">Amortizaciones / Mes</span>
              <div class="text-xl font-black text-purple-900 mt-1 font-mono">$${Math.round(totalAmortizacion).toLocaleString('es-CO')}</div>
              <span class="text-[10px] text-purple-600 font-medium">${inversionesFinca.length} inversiones activas</span>
            </div>

            <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <span class="text-[10px] font-bold text-emerald-700 uppercase block">Costo Total Mensual</span>
              <div class="text-xl font-black text-emerald-900 mt-1 font-mono">$${Math.round(costoTotalMes).toLocaleString('es-CO')}</div>
              <span class="text-[10px] text-emerald-600 font-medium">Fijos + Cuotas Amortizables</span>
            </div>

            <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <span class="text-[10px] font-bold text-blue-700 uppercase block">Costo por Hectárea</span>
              <div class="text-xl font-black text-blue-900 mt-1 font-mono">$${costoPorHa.toLocaleString('es-CO')} / Ha</div>
              <span class="text-[10px] text-blue-600 font-medium">Área total: ${finca.areaHa || 0} Ha</span>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- TARJETA 1: PRECIOS DE MERCADO DEL PREDIO -->
            <div class="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
              <div class="flex justify-between items-center">
                <h5 class="font-black text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <span>🏷️</span> Precios de Venta
                </h5>
                <span class="text-[10px] font-bold text-slate-500 font-mono">${finca.nombre}</span>
              </div>
              <form id="form-mercado-precios" class="space-y-3.5 text-xs">
                <div>
                  <label class="block font-bold text-slate-700 mb-1">Precio Litro de Leche ($ COP):</label>
                  <input type="number" id="input-leche" data-finca-id="${finca.id}" ${esConsultor ? 'disabled' : ''} value="${finca.precioLecheLitro || 2450}" class="w-full px-3 py-2 font-mono font-bold rounded-xl border border-slate-300 outline-none focus:border-purple-600 bg-white">
                </div>

                <div>
                  <label class="block font-bold text-slate-700 mb-1">Precio Kilo Carne en Pie ($ COP):</label>
                  <input type="number" id="input-carne" ${esConsultor ? 'disabled' : ''} value="${finca.precioCarneKgPie || 8900}" class="w-full px-3 py-2 font-mono font-bold rounded-xl border border-slate-300 outline-none focus:border-purple-600 bg-white">
                </div>

                ${!esConsultor ? `
                  <button type="submit" class="w-full py-2.5 bg-purple-700 hover:bg-purple-600 active:scale-95 text-white font-bold rounded-xl shadow transition cursor-pointer">
                    Actualizar Precios (${finca.nombre})
                  </button>
                ` : '<div class="text-[11px] text-slate-400 py-1 text-center">Solo lectura</div>'}
              </form>
            </div>

            <!-- TARJETA 2: COSTOS FIJOS MENSUALES DEL PREDIO -->
            <div class="lg:col-span-2 bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
              <div class="flex justify-between items-center">
                <h5 class="font-black text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <span>🧾</span> Costos Fijos Mensuales
                </h5>
                <div class="text-xs font-mono font-bold text-purple-900 bg-purple-100 px-2.5 py-0.5 rounded-lg">
                  Total Fijos: $${Math.round(totalFijos).toLocaleString('es-CO')}
                </div>
              </div>
              <form id="form-admin-costos" class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <input type="hidden" id="adm-costos-finca-id" value="${finca.id}">
                <div>
                  <label class="block font-bold text-slate-700 mb-1">Nómina y Jornales ($):</label>
                  <input type="number" id="adm-nomina" ${esConsultor ? 'disabled' : ''} value="${nomina}" class="w-full px-3 py-2 font-mono rounded-xl border border-slate-300 outline-none bg-white">
                </div>
                <div>
                  <label class="block font-bold text-slate-700 mb-1">Insumos y Sales ($):</label>
                  <input type="number" id="adm-insumos" ${esConsultor ? 'disabled' : ''} value="${insumos}" class="w-full px-3 py-2 font-mono rounded-xl border border-slate-300 outline-none bg-white">
                </div>
                <div>
                  <label class="block font-bold text-slate-700 mb-1">Herbicidas y Abonos ($):</label>
                  <input type="number" id="adm-herbicidas" ${esConsultor ? 'disabled' : ''} value="${herbicidas}" class="w-full px-3 py-2 font-mono rounded-xl border border-slate-300 outline-none bg-white">
                </div>
                <div>
                  <label class="block font-bold text-slate-700 mb-1">Maquinaria y Combustible ($):</label>
                  <input type="number" id="adm-maquinaria" ${esConsultor ? 'disabled' : ''} value="${maquinaria}" class="w-full px-3 py-2 font-mono rounded-xl border border-slate-300 outline-none bg-white">
                </div>
                <div>
                  <label class="block font-bold text-slate-700 mb-1">Servicios y Mantenimiento ($):</label>
                  <input type="number" id="adm-servicios" ${esConsultor ? 'disabled' : ''} value="${servicios}" class="w-full px-3 py-2 font-mono rounded-xl border border-slate-300 outline-none bg-white">
                </div>
                <div>
                  <label class="block font-bold text-slate-700 mb-1">Otros Gastos ($):</label>
                  <input type="number" id="adm-otros" ${esConsultor ? 'disabled' : ''} value="${otros}" class="w-full px-3 py-2 font-mono rounded-xl border border-slate-300 outline-none bg-white">
                </div>
                ${!esConsultor ? `
                  <div class="sm:col-span-2 pt-2">
                    <button type="submit" class="w-full py-2.5 bg-purple-700 hover:bg-purple-600 active:scale-95 text-white font-bold rounded-xl shadow transition cursor-pointer">
                      Guardar Costos Fijos de "${finca.nombre}"
                    </button>
                  </div>
                ` : '<div class="sm:col-span-2 text-[11px] text-slate-400 py-1 text-center">Solo lectura</div>'}
              </form>
            </div>
          </div>

          <!-- TARJETA 3: INVERSIONES AMORTIZABLES (DIFERIDAS) DE ESTA FINCA -->
          <div class="space-y-3 pt-2">
            <div class="flex justify-between items-center">
              <div>
                <h5 class="font-black text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <span>🏗️</span> Inversiones Amortizables de "${finca.nombre}" (${inversionesFinca.length})
                </h5>
                <p class="text-xs text-slate-500">Amortización mensual diferida e imputada específicamente a este predio.</p>
              </div>
              ${!esConsultor ? `
                <button id="btn-modal-inversion" class="px-3.5 py-1.5 bg-purple-700 hover:bg-purple-600 active:scale-95 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer">
                  <span>➕</span> Registrar Inversión
                </button>
              ` : ''}
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              ${inversionesFinca.length > 0 ? inversionesFinca.map((inv) => {
                const monto = parseFloat(inv.montoTotalInversion || inv.montoTotal) || 0;
                const meses = parseInt(inv.plazoMesesDiferido || inv.plazoMeses) || 1;
                const cuota = inv.cuotaMensual ? parseFloat(inv.cuotaMensual) : Math.round(monto / meses);

                return `
                  <div class="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col justify-between">
                    <div>
                      <div class="flex justify-between items-start gap-2">
                        <h5 class="font-black text-slate-900 text-sm">${inv.descripcionActivo || inv.concepto}</h5>
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 shrink-0">Activa</span>
                      </div>
                      <div class="grid grid-cols-2 gap-2 mt-3 text-xs">
                        <div>
                          <span class="text-slate-400 block text-[10px] uppercase font-bold">Monto Total</span>
                          <span class="font-mono font-black text-slate-800">$${monto.toLocaleString('es-CO')}</span>
                        </div>
                        <div>
                          <span class="text-slate-400 block text-[10px] uppercase font-bold">Plazo</span>
                          <span class="font-bold text-slate-800">${meses} Meses</span>
                        </div>
                      </div>
                    </div>

                    <div class="mt-3.5 pt-2.5 border-t border-slate-100 flex justify-between items-center">
                      <div class="bg-purple-50 px-2.5 py-1 rounded-xl">
                        <span class="text-[10px] text-purple-700 font-bold block">Cuota Mensual:</span>
                        <span class="text-xs font-black font-mono text-purple-900">$${Math.round(cuota).toLocaleString('es-CO')}/mes</span>
                      </div>
                      ${!esConsultor ? `
                        <button class="btn-eliminar-inversion p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition cursor-pointer" data-id="${inv.id}" data-concepto="${inv.descripcionActivo || inv.concepto}" title="Eliminar Inversión">
                          🗑️
                        </button>
                      ` : ''}
                    </div>
                  </div>
                `;
              }).join('') : `
                <div class="col-span-full p-6 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs">
                  No hay inversiones registradas en este predio. Presiona <strong>"+ Registrar Inversión"</strong> para agregar una.
                </div>
              `}
            </div>
          </div>

          <!-- TARJETA 4: CUADRO COMPARATIVO MULTI-PREDIO -->
          ${fincas.length > 1 ? `
            <div class="space-y-3 pt-4 border-t border-slate-100">
              <h5 class="font-black text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <span>📊</span> Cuadro Comparativo Financiero Entre Predios
              </h5>
              <div class="overflow-x-auto border border-slate-200 rounded-2xl shadow-sm bg-white">
                <table class="w-full text-xs text-left">
                  <thead class="bg-slate-50 uppercase font-black text-slate-600 text-[10px] border-b border-slate-200">
                    <tr>
                      <th class="p-3">Predio / Finca</th>
                      <th class="p-3">Empresa</th>
                      <th class="p-3 text-right">Área</th>
                      <th class="p-3 text-right">Hato</th>
                      <th class="p-3 text-right">Costos Fijos</th>
                      <th class="p-3 text-right">Inversiones</th>
                      <th class="p-3 text-right">Costo Total/mes</th>
                      <th class="p-3 text-right">Costo / Ha</th>
                      <th class="p-3 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 font-medium">
                    ${fincas.map((fItem) => {
                      const cItem = costosMap[fItem.id] || {};
                      const fijosItem = Object.values(cItem).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
                      const invsItem = todasInversiones.filter((i) => i.fincaId === fItem.id && (i.estado || '').toLowerCase() === 'activa');
                      const cuotasItem = invsItem.reduce((sum, i) => {
                        const m = parseFloat(i.montoTotalInversion || i.montoTotal) || 0;
                        const p = parseInt(i.plazoMesesDiferido || i.plazoMeses) || 1;
                        return sum + (i.cuotaMensual ? parseFloat(i.cuotaMensual) : m / p);
                      }, 0);
                      const totMesItem = fijosItem + cuotasItem;
                      const anmsItem = todosAnimales.filter((a) => a.fincaId === fItem.id);
                      const aHaItem = parseFloat(fItem.areaHa || 1);
                      const cHaItem = aHaItem > 0 ? Math.round(totMesItem / aHaItem) : 0;
                      const empItem = empresas.find((e) => e.id === fItem.empresaId);
                      const esSeleccionada = fItem.id === fid;

                      return `
                        <tr class="${esSeleccionada ? 'bg-purple-50/50 font-bold' : 'hover:bg-slate-50'} transition">
                          <td class="p-3 flex items-center gap-2">
                            <span>🏡</span>
                            <span class="font-black text-slate-900">${fItem.nombre}</span>
                            ${fItem.id === fincaActiva?.id ? '<span class="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold">Activa</span>' : ''}
                          </td>
                          <td class="p-3 text-slate-500">${empItem ? empItem.nombre : 'S/E'}</td>
                          <td class="p-3 text-right font-mono">${fItem.areaHa || 0} Ha</td>
                          <td class="p-3 text-right font-mono">${anmsItem.length} Cab</td>
                          <td class="p-3 text-right font-mono font-bold">$${Math.round(fijosItem).toLocaleString('es-CO')}</td>
                          <td class="p-3 text-right font-mono text-purple-700">$${Math.round(cuotasItem).toLocaleString('es-CO')}</td>
                          <td class="p-3 text-right font-mono font-black text-emerald-800">$${Math.round(totMesItem).toLocaleString('es-CO')}</td>
                          <td class="p-3 text-right font-mono text-slate-600">$${cHaItem.toLocaleString('es-CO')}</td>
                          <td class="p-3 text-center">
                            <button class="btn-ir-finanzas-finca px-2.5 py-1 rounded-lg ${esSeleccionada ? 'bg-purple-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'} text-[10px] font-bold transition cursor-pointer" data-id="${fItem.id}">
                              ${esSeleccionada ? '✓ Seleccionada' : '⚙️ Gestionar'}
                            </button>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          ` : ''}
        `}
      </div>
    `;
  }

  // ==========================================================================
  // SECCIÓN 4: SUPABASE CLOUD (SINCRONIZACIÓN NUBE)
  // ==========================================================================
  renderSeccionSupabase(esAdmin, esConsultor) {
    const srv = this.getSupabaseService ? this.getSupabaseService() : null;
    const cfg = srv ? srv.config : { url: '', anonKey: '' };
    const estaConectado = srv ? srv.estaConfigurado() : false;
    const ultimoSync = srv && srv.ultimoSync ? new Date(srv.ultimoSync).toLocaleString('es-CO') : 'Sin sincronizaciones';

    return `
      <div class="max-w-4xl mx-auto space-y-6">
        <div class="p-4 rounded-2xl border ${estaConectado ? 'bg-emerald-50 border-emerald-300' : 'bg-amber-50 border-amber-300'} flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div class="flex items-center gap-3">
            <span class="text-3xl p-2 rounded-xl ${estaConectado ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'}">
              ${estaConectado ? '☁️' : '⚡'}
            </span>
            <div>
              <div class="font-black text-sm ${estaConectado ? 'text-emerald-900' : 'text-amber-900'} flex items-center gap-2">
                Estado de Nube Supabase: 
                <span class="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-black ${estaConectado ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-200 text-amber-900'}">
                  ${estaConectado ? 'Configurado & Listo' : 'Sin Credenciales'}
                </span>
              </div>
              <p class="text-xs text-slate-500 mt-0.5">Última sincronización: <strong>${ultimoSync}</strong></p>
            </div>
          </div>
          <button id="btn-abrir-sql-modal" class="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer">
            <span>📋</span> Ver Script SQL
          </button>
        </div>

        ${this.supabaseFeedback ? `
          <div class="p-3.5 rounded-2xl text-xs font-bold flex items-center justify-between gap-2 ${
            this.supabaseFeedback.tipo === 'success' 
              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' 
              : this.supabaseFeedback.tipo === 'error'
              ? 'bg-rose-100 text-rose-900 border border-rose-300'
              : 'bg-blue-100 text-blue-900 border border-blue-300'
          }">
            <div class="flex items-center gap-2">
              <span>${this.supabaseFeedback.tipo === 'success' ? '✅' : this.supabaseFeedback.tipo === 'error' ? '❌' : 'ℹ️'}</span>
              <span>${this.supabaseFeedback.mensaje}</span>
            </div>
            <button id="btn-cerrar-feedback-supabase" class="text-slate-400 hover:text-slate-700 font-black cursor-pointer">✕</button>
          </div>
        ` : ''}

        <!-- FORMULARIO DE CREDENCIALES -->
        <div class="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
          <h5 class="font-black text-slate-900 text-xs uppercase tracking-wider">
            Credenciales de Conexión (Project Settings > API)
          </h5>

          <form id="form-credenciales-supabase" class="space-y-3">
            <div>
              <label class="block font-bold text-slate-700 text-xs mb-1">Project URL (API REST):</label>
              <input type="url" id="input-supabase-url" required value="${cfg.url || ''}" placeholder="https://xyzabcdef.supabase.co" class="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border border-slate-300 outline-none focus:border-emerald-600 bg-slate-50">
            </div>

            <div>
              <label class="block font-bold text-slate-700 text-xs mb-1">Project API Key (Anon Public Key):</label>
              <input type="text" id="input-supabase-key" required value="${cfg.anonKey || ''}" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." class="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border border-slate-300 outline-none focus:border-emerald-600 bg-slate-50">
            </div>

            <div class="pt-2 flex justify-between items-center gap-2">
              <button type="button" id="btn-probar-supabase" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow transition cursor-pointer">
                🔌 Probar Conexión
              </button>
              <button type="submit" class="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs rounded-xl shadow-lg transition cursor-pointer">
                💾 Guardar Credenciales
              </button>
            </div>
          </form>
        </div>

        <!-- BOTONES PUSH & PULL -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 flex flex-col justify-between">
            <div>
              <div class="font-black text-emerald-900 text-sm">⬆️ Subir Datos Locales (Push)</div>
              <p class="text-xs text-emerald-800 mt-1">Sube predios, animales, pesajes y servicios a Supabase Cloud.</p>
            </div>
            <button id="btn-push-supabase" ${!estaConectado || this.sincronizandoSupabase ? 'disabled' : ''} class="mt-4 py-2.5 px-4 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow transition cursor-pointer">
              ${this.sincronizandoSupabase ? '⏳ Sincronizando...' : 'Subir Todo (Push)'}
            </button>
          </div>

          <div class="p-4 rounded-2xl border border-blue-200 bg-blue-50/50 flex flex-col justify-between">
            <div>
              <div class="font-black text-blue-900 text-sm">⬇️ Descargar Datos (Pull)</div>
              <p class="text-xs text-blue-800 mt-1">Descarga el inventario centralizado para trabajar sin conexión.</p>
            </div>
            <button id="btn-pull-supabase" ${!estaConectado || this.sincronizandoSupabase ? 'disabled' : ''} class="mt-4 py-2.5 px-4 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow transition cursor-pointer">
              ${this.sincronizandoSupabase ? '⏳ Descargando...' : 'Descargar de Nube (Pull)'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // SECCIÓN 4.5: COPIA DE SEGURIDAD Y RESGUARDO LOCAL (EXCEL MULTI-HOJA)
  // ==========================================================================
  renderSeccionBackup() {
    const animales = this.getAnimales ? this.getAnimales() : [];
    const pesajes = this.getPesajes ? this.getPesajes() : [];
    const fincas = this.getFincas ? this.getFincas() : [];
    const empresas = this.getEmpresas ? this.getEmpresas() : [];
    const usuarios = this.getUsuarios ? this.getUsuarios() : [];
    const operaciones = this.getOperaciones ? this.getOperaciones() : [];
    const inversiones = this.getInversionesTodas ? this.getInversionesTodas() : [];

    return `
      <div class="max-w-4xl mx-auto space-y-6">
        <!-- BANNER PRINCIPAL COPIA DE SEGURIDAD -->
        <div class="p-6 bg-gradient-to-br from-emerald-900 via-teal-900 to-slate-900 text-white rounded-3xl shadow-xl border border-emerald-500/40 relative overflow-hidden">
          <div class="absolute -right-10 -bottom-10 w-48 h-48 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none"></div>
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 relative z-10">
            <div class="flex items-center gap-4">
              <span class="text-4xl sm:text-5xl p-3 bg-emerald-500/20 border border-emerald-400/40 rounded-3xl shadow-inner text-emerald-300">
                💾
              </span>
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="text-xl sm:text-2xl font-black tracking-tight text-white">
                    Copia de Seguridad del Sistema
                  </h3>
                  <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase bg-emerald-500/30 text-emerald-200 border border-emerald-400/50">
                    Local & Nube
                  </span>
                </div>
                <p class="text-xs sm:text-sm text-emerald-100/80 mt-1 max-w-xl leading-relaxed">
                  Exporta el 100% de la información del sistema en un archivo de Excel profesional (.xlsx) con hojas independientes para cada módulo, garantizando resguardo seguro en tu equipo.
                </p>
              </div>
            </div>
            
            <div class="shrink-0 flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <button id="btn-descargar-backup-excel" class="w-full sm:w-auto px-5 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-black rounded-2xl shadow-lg hover:shadow-emerald-500/30 transition flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer transform active:scale-95">
                <span>📗</span>
                <span>Descargar Respaldo Excel (.xlsx)</span>
              </button>
              <button id="btn-descargar-backup-json" class="w-full sm:w-auto px-4 py-3.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl border border-white/20 transition flex items-center justify-center gap-2 text-xs cursor-pointer">
                <span>📦</span>
                <span>JSON Crudo</span>
              </button>
            </div>
          </div>
        </div>

        <!-- RESUMEN DE REGISTROS A RESPALDAR -->
        <div class="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-4">
          <div class="flex items-center justify-between">
            <h4 class="font-black text-slate-900 text-sm flex items-center gap-2">
              <span>📊</span> Registros Reales en Base de Datos
            </h4>
            <span class="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              ● Todos los datos listos para exportar
            </span>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 text-center">
              <div class="text-2xl font-black text-purple-900">${empresas.length}</div>
              <div class="text-[11px] font-bold text-slate-600 mt-0.5">🏢 Empresas</div>
            </div>
            <div class="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 text-center">
              <div class="text-2xl font-black text-blue-900">${fincas.length}</div>
              <div class="text-[11px] font-bold text-slate-600 mt-0.5">🏡 Fincas / Predios</div>
            </div>
            <div class="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 text-center">
              <div class="text-2xl font-black text-emerald-900">${animales.length}</div>
              <div class="text-[11px] font-bold text-slate-600 mt-0.5">🐄 Animales Activos</div>
            </div>
            <div class="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 text-center">
              <div class="text-2xl font-black text-amber-900">${pesajes.length}</div>
              <div class="text-[11px] font-bold text-slate-600 mt-0.5">⚖️ Pesajes Históricos</div>
            </div>
            <div class="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 text-center">
              <div class="text-2xl font-black text-indigo-900">${usuarios.length}</div>
              <div class="text-[11px] font-bold text-slate-600 mt-0.5">👥 Usuarios Registrados</div>
            </div>
            <div class="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 text-center">
              <div class="text-2xl font-black text-teal-900">${operaciones.length}</div>
              <div class="text-[11px] font-bold text-slate-600 mt-0.5">📋 Operaciones & Trazabilidad</div>
            </div>
            <div class="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 text-center">
              <div class="text-2xl font-black text-rose-900">${inversiones.length}</div>
              <div class="text-[11px] font-bold text-slate-600 mt-0.5">🏗️ Inversiones Registradas</div>
            </div>
            <div class="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 text-center">
              <div class="text-2xl font-black text-sky-900">11</div>
              <div class="text-[11px] font-bold text-slate-600 mt-0.5">📑 Hojas Independientes</div>
            </div>
          </div>
        </div>

        <!-- ESTRUCTURA DEL ARCHIVO EXCEL DE RESPALDO -->
        <div class="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-4">
          <h4 class="font-black text-slate-900 text-sm flex items-center gap-2">
            <span>📑</span> Contenido del Archivo de Respaldo (.xlsx)
          </h4>
          <p class="text-xs text-slate-500">
            El archivo exportado contiene 11 hojas de cálculo separadas e independientes, con encabezados técnicos y listos para abrir en Microsoft Excel, Google Sheets o LibreOffice:
          </p>

          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div class="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-200 flex items-start gap-2.5">
              <span class="text-emerald-700 font-black text-base">1</span>
              <div>
                <strong class="text-slate-900 block font-bold">🏢 Empresas</strong>
                <span class="text-slate-500 text-[11px]">Razón social, NIT, país, moneda, plan de vigencia y fechas.</span>
              </div>
            </div>
            <div class="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-200 flex items-start gap-2.5">
              <span class="text-emerald-700 font-black text-base">2</span>
              <div>
                <strong class="text-slate-900 block font-bold">🏡 Fincas</strong>
                <span class="text-slate-500 text-[11px]">Código predial, nombre, hectáreas, precios base de carne y leche.</span>
              </div>
            </div>
            <div class="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-200 flex items-start gap-2.5">
              <span class="text-emerald-700 font-black text-base">3</span>
              <div>
                <strong class="text-slate-900 block font-bold">👥 Usuarios</strong>
                <span class="text-slate-500 text-[11px]">Cuentas de acceso, rol corporativo y fincas autorizadas.</span>
              </div>
            </div>
            <div class="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-200 flex items-start gap-2.5">
              <span class="text-emerald-700 font-black text-base">4</span>
              <div>
                <strong class="text-slate-900 block font-bold">🐄 Animales</strong>
                <span class="text-slate-500 text-[11px]">Inventario completo: chapeta, nombre, raza, sexo, CC, peso actual.</span>
              </div>
            </div>
            <div class="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-200 flex items-start gap-2.5">
              <span class="text-emerald-700 font-black text-base">5</span>
              <div>
                <strong class="text-slate-900 block font-bold">⚖️ Pesajes</strong>
                <span class="text-slate-500 text-[11px]">Histórico cronológico, peso, ganancia diaria (GDP), talla (cm) y CC.</span>
              </div>
            </div>
            <div class="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-200 flex items-start gap-2.5">
              <span class="text-emerald-700 font-black text-base">6</span>
              <div>
                <strong class="text-slate-900 block font-bold">🧬 Servicios</strong>
                <span class="text-slate-500 text-[11px]">Inseminación artificial, toro, pajilla, fecha de servicio y diagnóstico.</span>
              </div>
            </div>
            <div class="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-200 flex items-start gap-2.5">
              <span class="text-emerald-700 font-black text-base">7</span>
              <div>
                <strong class="text-slate-900 block font-bold">🥗 Nutrición</strong>
                <span class="text-slate-500 text-[11px]">Planes nutricionales, etapa fisiológica, raciones y requerimientos.</span>
              </div>
            </div>
            <div class="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-200 flex items-start gap-2.5">
              <span class="text-emerald-700 font-black text-base">8</span>
              <div>
                <strong class="text-slate-900 block font-bold">💰 Costos Fijos</strong>
                <span class="text-slate-500 text-[11px]">Mano de obra, praderas, suplementación y sanidad por predio.</span>
              </div>
            </div>
            <div class="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-200 flex items-start gap-2.5">
              <span class="text-emerald-700 font-black text-base">9</span>
              <div>
                <strong class="text-slate-900 block font-bold">🏗️ Inversiones</strong>
                <span class="text-slate-500 text-[11px]">Inversiones en infraestructura, maquinaria, genética y praderas.</span>
              </div>
            </div>
            <div class="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-200 flex items-start gap-2.5">
              <span class="text-emerald-700 font-black text-base">10</span>
              <div>
                <strong class="text-slate-900 block font-bold">🚚 Traslados</strong>
                <span class="text-slate-500 text-[11px]">Registro de movimientos de ganado entre fincas y potreros.</span>
              </div>
            </div>
            <div class="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-200 flex items-start gap-2.5">
              <span class="text-emerald-700 font-black text-base">11</span>
              <div>
                <strong class="text-slate-900 block font-bold">📋 Operaciones</strong>
                <span class="text-slate-500 text-[11px]">Bitácora y trazabilidad de eventos diarios registrados en campo.</span>
              </div>
            </div>
          </div>
        </div>

        <!-- POLÍTICA ESTRICTA DE SEGURIDAD Y PROTECCIÓN DE DATOS -->
        <div class="p-5 bg-amber-50 border border-amber-300 rounded-3xl space-y-3">
          <div class="flex items-start gap-3">
            <span class="text-2xl p-2 bg-amber-200 rounded-2xl text-amber-900">🛡️</span>
            <div>
              <h4 class="text-xs sm:text-sm font-black text-amber-950">Garantía de Cero Pérdida y Sin Datos Ficticios</h4>
              <p class="text-xs text-amber-900/90 mt-1 leading-relaxed">
                Cada actualización de la plataforma respeta rigurosamente tus registros. Se ha desactivado cualquier inyección de datos de prueba o demostración. Todos los pesajes, registros zootécnicos y predios permanecen protegidos tanto en el almacenamiento local como en Supabase Cloud.
              </p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // SECCIÓN 5: MANTENIMIENTO BD (BORRADO SEGURO DE EMPRESAS O FINCAS)
  // ==========================================================================
  renderSeccionMantenimiento(empresas = [], fincas = [], esSuperAdmin = false, esAdmin = false, esConsultor = false) {
    return `
      <div class="max-w-2xl mx-auto space-y-6">
        <div class="p-5 bg-rose-50 border-2 border-rose-300 rounded-3xl space-y-4">
          <div class="flex items-start gap-3.5">
            <span class="text-3xl p-2 bg-rose-200 rounded-2xl text-rose-800">⚠️</span>
            <div>
              <h4 class="text-base font-black text-rose-950">Mantenimiento de Base de Datos y Borrado Selectivo</h4>
              <p class="text-xs text-rose-800 mt-0.5 leading-relaxed">
                Herramientas de alta seguridad. Permiten reiniciar hatos a cero o depurar bases de datos por finca o por empresa.
              </p>
            </div>
          </div>

          <!-- BORRADO 1: VACIAR HATO DE UNA FINCA A CERO -->
          <div class="p-4 bg-white rounded-2xl border border-rose-200 space-y-3">
            <div class="font-black text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <span>🏡</span> 1. Borrar Base de Datos de una Finca (Reiniciar Hato a 0)
            </div>
            <p class="text-xs text-slate-500">
              Elimina todos los animales, pesajes y partos de la finca elegida, conservando el predio y sus costos fijos.
            </p>
            <div class="flex flex-col sm:flex-row gap-2">
              <select id="select-purgar-finca" class="flex-1 px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-slate-50 outline-none">
                ${fincas.map((f) => `<option value="${f.id}">${f.nombre} (${f.codigo || f.id})</option>`).join('')}
              </select>
              <button type="button" id="btn-ejecutar-purga-finca" class="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow transition cursor-pointer shrink-0">
                Vaciar Hato Finca
              </button>
            </div>
          </div>

          <!-- BORRADO 2: BORRAR EMPRESA COMPLETA (SOLO SUPERADMIN) -->
          ${esSuperAdmin ? `
            <div class="p-4 bg-white rounded-2xl border border-rose-200 space-y-3">
              <div class="font-black text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <span>🏢</span> 2. Borrar Base de Datos de una Empresa Completa
              </div>
              <p class="text-xs text-slate-500">
                Elimina todos los animales, predios y registros de la empresa seleccionada.
              </p>
              <div class="flex flex-col sm:flex-row gap-2">
                <select id="select-purgar-empresa" class="flex-1 px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-slate-50 outline-none">
                  ${empresas.map((e) => `<option value="${e.id}">${e.nombre} (${e.nit || e.id})</option>`).join('')}
                </select>
                <button type="button" id="btn-ejecutar-purga-empresa" class="px-4 py-2 bg-rose-800 hover:bg-rose-900 active:scale-95 text-white font-bold text-xs rounded-xl shadow transition cursor-pointer shrink-0">
                  Borrar Datos Empresa
                </button>
              </div>
            </div>

            <!-- BORRADO 3: PURGA TOTAL DEL SISTEMA -->
            <div class="p-4 bg-rose-100/60 rounded-2xl border border-rose-300 space-y-3">
              <div class="font-black text-rose-950 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <span>🚨</span> 3. Purga Total de Toda la Plataforma (Cero Animales)
              </div>
              <p class="text-xs text-rose-900 leading-relaxed">
                Borra permanentemente todos los animales registrados en todas las fincas de la plataforma.
              </p>
              <button type="button" id="btn-purgar-bd-total" class="w-full py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-lg transition cursor-pointer">
                🗑️ Borrar Toda la Base de Datos (0 Animales Global)
              </button>
            </div>

            <!-- BORRADO 4: REINICIO TOTAL A CERO (DEJAR SISTEMA EN BLANCO) -->
            <div class="p-4 bg-red-950 text-white rounded-2xl border-2 border-red-500 space-y-3">
              <div class="font-black text-red-300 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <span>🧹</span> 4. Dejar Sistema en Blanco (0 Datos - Listo para Datos Reales)
              </div>
              <p class="text-xs text-red-200 leading-relaxed">
                Elimina permanentemente todas las empresas de prueba, fincas, animales, pesajes y registros. Conserva únicamente tu cuenta de Super Admin (anuardavid) para que registres tu información ganadera real desde cero.
              </p>
              <button type="button" id="btn-resetear-sistema-total" class="w-full py-2.5 bg-red-600 hover:bg-red-500 active:scale-95 text-white font-black text-xs rounded-xl shadow-lg transition cursor-pointer border border-red-400">
                🧹 Reiniciar Todo a Cero (Dejar Sistema en Blanco)
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // MODALES (CREAR / EDITAR FINCA, EMPRESA, INVERSION, USUARIO, CLAVE Y SQL)
  // ==========================================================================

  renderModalCrearFinca(empresas = []) {
    const empId = this.empresaParaNuevaFinca;
    const emp = (empresas || []).find((e) => e.id === empId);

    return `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
        <div class="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden my-auto flex flex-col">
          <div class="bg-gradient-to-r from-emerald-950 to-slate-900 text-white p-5 flex justify-between items-center">
            <div class="flex items-center gap-2.5">
              <span class="text-2xl p-2 bg-emerald-900/50 rounded-xl border border-emerald-600">🏡</span>
              <div>
                <h3 class="text-base font-black">Registrar Nuevo Predio / Finca</h3>
                <p class="text-xs text-emerald-200">Asignado a: <strong>${emp ? emp.nombre : 'Empresa Ganadera'}</strong></p>
              </div>
            </div>
            <button id="btn-cerrar-modal-crear-finca" class="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white cursor-pointer">✕</button>
          </div>

          <form id="form-crear-finca" class="p-5 space-y-3.5 text-xs">
            <input type="hidden" id="finca-empresa-id" value="${empId || ''}">

            <div>
              <label class="block font-bold text-slate-700 mb-1">Nombre del Predio o Finca *:</label>
              <input type="text" id="finca-nombre" required placeholder="Ej. Hacienda La Esperanza, Finca Santa María" class="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none font-bold focus:border-emerald-600">
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Código Predial / RUVAT:</label>
                <input type="text" id="finca-codigo" placeholder="Ej. FIN-101" class="w-full px-3 py-2 font-mono rounded-xl border border-slate-300 outline-none focus:border-emerald-600">
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1">Área Total (Hectáreas) *:</label>
                <input type="number" step="0.1" id="finca-area" required placeholder="120" class="w-full px-3 py-2 font-mono font-bold rounded-xl border border-slate-300 outline-none focus:border-emerald-600">
              </div>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">Ubicación / Municipio / Depto:</label>
              <input type="text" id="finca-ubicacion" placeholder="Ej. Montería / Córdoba" class="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none">
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Precio Referencia Leche ($/L):</label>
                <input type="number" id="finca-precio-leche" value="2450" class="w-full px-3 py-1.5 font-mono font-bold rounded-xl border border-slate-300 outline-none bg-white">
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1">Precio Referencia Carne ($/kg):</label>
                <input type="number" id="finca-precio-carne" value="8900" class="w-full px-3 py-1.5 font-mono font-bold rounded-xl border border-slate-300 outline-none bg-white">
              </div>
            </div>

            <div class="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button type="button" id="btn-cancelar-crear-finca" class="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 cursor-pointer">
                Cancelar
              </button>
              <button type="submit" class="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white font-black shadow-lg cursor-pointer">
                Guardar Finca
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  renderModalCrearInversion(fincas = []) {
    const fid = this.fincaFinanzasSeleccionada || (this.getFincaActiva ? this.getFincaActiva()?.id : null);
    const f = (fincas || []).find((item) => item.id === fid);

    return `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
        <div class="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden my-auto flex flex-col">
          <div class="bg-gradient-to-r from-purple-950 to-slate-900 text-white p-5 flex justify-between items-center">
            <div class="flex items-center gap-2.5">
              <span class="text-2xl p-2 bg-purple-900/50 rounded-xl border border-purple-600">🏗️</span>
              <div>
                <h3 class="text-base font-black">Nueva Inversión Amortizable</h3>
                <p class="text-xs text-purple-200">Predio: <strong>${f ? f.nombre : 'Finca Seleccionada'}</strong></p>
              </div>
            </div>
            <button id="btn-cerrar-modal-crear-inv" class="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white cursor-pointer">✕</button>
          </div>

          <form id="form-crear-inversion" class="p-5 space-y-3.5 text-xs">
            <input type="hidden" id="inv-finca-id" value="${fid || ''}">

            <div>
              <label class="block font-bold text-slate-700 mb-1">Concepto o Activo *:</label>
              <input type="text" id="inv-concepto" required placeholder="Ej. Tractor Kubota, Pozo Profundo, Silo de Cemento" class="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none font-bold focus:border-purple-600">
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Monto Total ($ COP) *:</label>
                <input type="number" id="inv-monto" required placeholder="15000000" class="w-full px-3 py-2 font-mono font-bold rounded-xl border border-slate-300 outline-none focus:border-purple-600">
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1">Plazo Diferido (Meses) *:</label>
                <input type="number" id="inv-plazo" required value="24" min="1" max="120" class="w-full px-3 py-2 font-mono font-bold rounded-xl border border-slate-300 outline-none focus:border-purple-600">
              </div>
            </div>

            <div class="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button type="button" id="btn-cancelar-crear-inv" class="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 cursor-pointer">
                Cancelar
              </button>
              <button type="submit" class="px-5 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 active:scale-95 text-white font-black shadow-lg cursor-pointer">
                Registrar Inversión
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  renderModalCrearEmpresa() {
    return `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
        <div class="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden my-auto flex flex-col">
          <div class="bg-slate-950 text-white p-5 flex justify-between items-center">
            <div class="flex items-center gap-2.5">
              <span class="text-2xl p-2 bg-purple-900/50 rounded-xl border border-purple-600">🏢</span>
              <div>
                <h3 class="text-base font-black">Crear Nueva Empresa Ganadera</h3>
                <p class="text-xs text-slate-400">Nuevo tenant aislado para la gestión de predios y ganado.</p>
              </div>
            </div>
            <button id="btn-cerrar-modal-crear-emp" class="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white cursor-pointer">✕</button>
          </div>

          <form id="form-crear-empresa" class="p-5 space-y-3.5 text-xs">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Nombre / Razón Social *:</label>
              <input type="text" id="emp-nombre" required placeholder="Ej. Ganadería San Jerónimo S.A.S." class="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none font-bold focus:border-purple-600">
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">NIT / Identificación Fiscal *:</label>
                <input type="text" id="emp-nit" required placeholder="Ej. 900.123.456-7" class="w-full px-3 py-2 font-mono font-bold rounded-xl border border-slate-300 outline-none focus:border-purple-600">
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1">País:</label>
                <input type="text" id="emp-pais" value="Colombia" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none">
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Moneda:</label>
                <select id="emp-moneda" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none bg-white">
                  <option value="COP" selected>COP ($ Pesos Colombianos)</option>
                  <option value="USD">USD ($ Dólares)</option>
                  <option value="MXN">MXN ($ Pesos Mexicanos)</option>
                  <option value="BRL">BRL (R$ Reales)</option>
                </select>
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1">Teléfono:</label>
                <input type="tel" id="emp-telefono" placeholder="310 000 0000" class="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none">
              </div>
            </div>

            <!-- TIEMPO DE ACTIVACIÓN / LICENCIA -->
            <div class="bg-purple-50 p-3.5 rounded-2xl border border-purple-200 space-y-2.5">
              <label class="block font-black text-purple-950 flex items-center justify-between">
                <span>⏱️ Tiempo de Activación Inicial *:</span>
                <span class="text-[10px] text-purple-700 font-mono font-bold">Control de Licencia</span>
              </label>
              <select id="emp-tiempo-activacion" class="w-full px-3 py-2 font-bold rounded-xl border border-purple-300 bg-white outline-none cursor-pointer">
                <option value="1">1 Mes (30 días)</option>
                <option value="3">3 Meses (90 días)</option>
                <option value="6">6 Meses (180 días)</option>
                <option value="12" selected>1 Año (365 días)</option>
                <option value="indefinido">♾️ Tiempo Indefinido (Acceso Permanente)</option>
              </select>
              <label class="flex items-center gap-2 p-2 bg-purple-100/70 hover:bg-purple-100 rounded-xl cursor-pointer transition border border-purple-200">
                <input type="checkbox" id="emp-tiempo-indefinido-check" class="w-4 h-4 text-purple-600 rounded border-purple-300 focus:ring-purple-500 cursor-pointer">
                <span class="font-black text-xs text-purple-950">♾️ Habilitar por tiempo indefinido (Permanente)</span>
              </label>
              <p class="text-[11px] text-purple-900 leading-tight">
                Al seleccionar tiempo determinado, el sistema bloqueará el acceso al vencer el plazo hasta ser renovado por el Super Administrador. Con tiempo indefinido el acceso nunca expira.
              </p>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Correo Electrónico:</label>
                <input type="email" id="emp-email" placeholder="contacto@ganaderia.com" class="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none">
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1">Dirección / Sede:</label>
                <input type="text" id="emp-direccion" placeholder="Km 15 Vía Montería" class="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none">
              </div>
            </div>

            <div class="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button type="button" id="btn-cancelar-crear-emp" class="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 cursor-pointer">
                Cancelar
              </button>
              <button type="submit" class="px-5 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-black shadow-lg cursor-pointer">
                Guardar Empresa
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  renderModalEditarEmpresa() {
    const emp = this.empresaEditando;
    if (!emp) return '';

    return `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
        <div class="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden my-auto flex flex-col">
          <div class="bg-slate-950 text-white p-5 flex justify-between items-center">
            <div class="flex items-center gap-2.5">
              <span class="text-2xl p-2 bg-purple-900/50 rounded-xl border border-purple-600">✏️</span>
              <div>
                <h3 class="text-base font-black">Editar Empresa: ${emp.nombre}</h3>
                <p class="text-xs text-slate-400">Actualiza la información institucional del tenant.</p>
              </div>
            </div>
            <button id="btn-cerrar-modal-editar-emp" class="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white cursor-pointer">✕</button>
          </div>

          <form id="form-editar-empresa" class="p-5 space-y-3.5 text-xs">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Nombre / Razón Social *:</label>
              <input type="text" id="edit-emp-nombre" required value="${emp.nombre}" class="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none font-bold">
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">NIT / Identificación Fiscal *:</label>
                <input type="text" id="edit-emp-nit" required value="${emp.nit || ''}" class="w-full px-3 py-2 font-mono font-bold rounded-xl border border-slate-300 outline-none">
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1">País:</label>
                <input type="text" id="edit-emp-pais" value="${emp.pais || 'Colombia'}" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none">
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Moneda:</label>
                <select id="edit-emp-moneda" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none bg-white">
                  <option value="COP" ${emp.moneda === 'COP' ? 'selected' : ''}>COP ($ Pesos)</option>
                  <option value="USD" ${emp.moneda === 'USD' ? 'selected' : ''}>USD ($ Dólares)</option>
                  <option value="MXN" ${emp.moneda === 'MXN' ? 'selected' : ''}>MXN ($ Mexicanos)</option>
                  <option value="BRL" ${emp.moneda === 'BRL' ? 'selected' : ''}>BRL (R$ Reales)</option>
                </select>
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1">Estado de Acceso:</label>
                <select id="edit-emp-activa" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none bg-white">
                  <option value="true" ${emp.activa !== false ? 'selected' : ''}>● Activa / Habilitada</option>
                  <option value="false" ${emp.activa === false ? 'selected' : ''}>⛔ Bloqueada / Suspendida</option>
                </select>
              </div>
            </div>

            <!-- VIGENCIA Y FECHA DE VENCIMIENTO -->
            <div class="bg-purple-50 p-3.5 rounded-2xl border border-purple-200 space-y-2.5">
              <div class="flex justify-between items-center">
                <label class="block font-black text-purple-950">⏱️ Tiempo de Licencia y Vigencia:</label>
                <span id="label-estado-vencimiento" class="text-[11px] text-purple-700 font-mono font-bold px-2 py-0.5 bg-purple-100 rounded-lg">
                  ${emp.tiempoIndefinido || emp.fechaVencimiento === 'indefinido' ? '♾️ TIEMPO INDEFINIDO' : `Vence: ${emp.fechaVencimiento || '2027-09-15'}`}
                </span>
              </div>

              <!-- Casilla de Habilitar por Tiempo Indefinido -->
              <div class="p-2.5 bg-white rounded-xl border border-purple-200">
                <label class="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" id="edit-emp-indefinido" ${emp.tiempoIndefinido || emp.fechaVencimiento === 'indefinido' ? 'checked' : ''} class="w-4 h-4 text-purple-600 rounded border-purple-300 focus:ring-purple-500 cursor-pointer">
                  <span class="font-black text-xs text-purple-900">♾️ Habilitar por tiempo indefinido (Permanente)</span>
                </label>
                <p class="text-[10px] text-slate-500 mt-0.5 ml-6">
                  Si activas esta casilla, la empresa tendrá acceso permanente sin fecha límite de expiración.
                </p>
              </div>

              <!-- Contenedor Fecha de Vencimiento -->
              <div id="contenedor-fecha-vencimiento" class="space-y-1.5 ${emp.tiempoIndefinido || emp.fechaVencimiento === 'indefinido' ? 'opacity-50 pointer-events-none' : ''}">
                <label class="block text-[11px] font-bold text-slate-700">Fecha de Vencimiento de Licencia:</label>
                <input type="date" id="edit-emp-vencimiento" value="${emp.fechaVencimiento && emp.fechaVencimiento !== 'indefinido' ? emp.fechaVencimiento : ''}" class="w-full px-3 py-2 font-mono font-bold rounded-xl border border-purple-300 bg-white outline-none cursor-pointer">
                
                <div class="flex items-center gap-1.5 flex-wrap pt-1">
                  <span class="text-[10px] font-bold text-slate-500">Modificar fecha rápido:</span>
                  <button type="button" class="btn-quick-add-venc px-2 py-0.5 rounded bg-purple-200 hover:bg-purple-300 active:scale-95 text-purple-950 text-[10px] font-bold cursor-pointer" data-meses="1">+1 Mes</button>
                  <button type="button" class="btn-quick-add-venc px-2 py-0.5 rounded bg-purple-200 hover:bg-purple-300 active:scale-95 text-purple-950 text-[10px] font-bold cursor-pointer" data-meses="3">+3 Meses</button>
                  <button type="button" class="btn-quick-add-venc px-2 py-0.5 rounded bg-purple-200 hover:bg-purple-300 active:scale-95 text-purple-950 text-[10px] font-bold cursor-pointer" data-meses="6">+6 Meses</button>
                  <button type="button" class="btn-quick-add-venc px-2 py-0.5 rounded bg-purple-200 hover:bg-purple-300 active:scale-95 text-purple-950 text-[10px] font-bold cursor-pointer" data-meses="12">+1 Año</button>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Correo Electrónico:</label>
                <input type="email" id="edit-emp-email" value="${emp.email || ''}" class="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none">
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1">Teléfono:</label>
                <input type="tel" id="edit-emp-telefono" value="${emp.telefono || ''}" class="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none">
              </div>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">Dirección / Sede:</label>
              <input type="text" id="edit-emp-direccion" value="${emp.direccion || ''}" class="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none">
            </div>

            <div class="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button type="button" id="btn-cancelar-editar-emp" class="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 cursor-pointer">
                Cancelar
              </button>
              <button type="submit" class="px-5 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-black shadow-lg cursor-pointer">
                Guardar Cambios
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  renderListaChecksFincas(fincas = [], empresaId, modo = 'crear', fincasAsignadas = 'todas') {
    const fincasDeEmp = (fincas || []).filter((f) => f.empresaId === empresaId);
    if (fincasDeEmp.length === 0) {
      return '<div class="col-span-full text-slate-500 text-[11px] italic p-2.5 text-center bg-white rounded-xl border border-slate-200">No hay fincas registradas en esta empresa aún.</div>';
    }

    const esTodas = !fincasAsignadas || fincasAsignadas === 'todas' || (Array.isArray(fincasAsignadas) && fincasAsignadas.includes('todas'));
    const listaIds = Array.isArray(fincasAsignadas) ? fincasAsignadas : [];

    return fincasDeEmp.map((f) => {
      const isChecked = esTodas || listaIds.includes(f.id);
      return `
        <label class="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer text-slate-700 font-semibold transition select-none">
          <input 
            type="checkbox" 
            name="fincas_asignadas_${modo}" 
            value="${f.id}" 
            ${isChecked ? 'checked' : ''} 
            class="chk-finca-item-${modo} w-4 h-4 text-purple-600 rounded cursor-pointer"
          >
          <div class="truncate">
            <span class="text-xs font-bold text-slate-800 block truncate" title="${f.nombre}">${f.nombre}</span>
            <span class="text-[10px] text-slate-400 font-mono">${f.codigo || f.id}</span>
          </div>
        </label>
      `;
    }).join('');
  }

  renderModalCrearUsuario(empresas = [], fincas = [], esSuperAdmin = false) {
    const uActual = this.getUsuarioActual ? this.getUsuarioActual() : null;
    const empActiva = this.getEmpresaActiva ? this.getEmpresaActiva() : null;
    const empIdDefecto = this.empresaParaNuevoUsuario || (uActual && uActual.empresaId) || (empActiva && empActiva.id) || (empresas[0]?.id) || '';

    return `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
        <div class="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden my-auto flex flex-col">
          <div class="bg-slate-950 text-white p-5 flex justify-between items-center">
            <div class="flex items-center gap-2.5">
              <span class="text-2xl p-2 bg-purple-900/50 rounded-xl border border-purple-600">👤</span>
              <div>
                <h3 class="text-base font-black">Crear Nuevo Usuario</h3>
                <p class="text-xs text-slate-400">Asigna credenciales, rol y delimita fincas autorizadas.</p>
              </div>
            </div>
            <button id="btn-cerrar-modal-crear-usr" class="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white cursor-pointer">✕</button>
          </div>

          <form id="form-crear-usuario" class="p-5 space-y-3.5 text-xs max-h-[85vh] overflow-y-auto">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Nombre Completo *:</label>
              <input type="text" id="usr-nombre" required placeholder="Ej. Camila Rivera M." class="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none font-bold focus:border-purple-600">
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Usuario / Login *:</label>
                <div class="relative">
                  <span class="absolute left-3 top-2 text-slate-400 font-mono font-bold">@</span>
                  <input type="text" id="usr-login" required placeholder="Ej. crivera" autocomplete="off" class="w-full pl-8 pr-3 py-2 font-mono font-bold rounded-xl border border-slate-300 outline-none focus:border-purple-600 transition">
                </div>
                <p id="usr-login-feedback" class="text-[11px] font-bold mt-1 hidden"></p>
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1">Rol Asignado *:</label>
                <select id="usr-rol" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none bg-white">
                  ${esSuperAdmin ? '<option value="superadmin">👑 Super Administrador (Global)</option>' : ''}
                  <option value="administrador">⭐ Administrador (Modificaciones y Empresa)</option>
                  <option value="encargado" selected>🤠 Encargado (Ingreso de Datos de Ganado)</option>
                  <option value="consultor">👁️ Consultor (Solo Consulta de Información)</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">Empresa Ganadera Asignada *:</label>
              <select id="usr-empresa" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none bg-white">
                ${empresas.map((e) => `<option value="${e.id}" ${empIdDefecto === e.id ? 'selected' : ''}>${e.nombre} (${e.nit || e.id})</option>`).join('')}
              </select>
            </div>

            <!-- ASIGNACIÓN DE FINCAS PERMITIDAS (1, 2 O TODAS) -->
            <div class="bg-purple-50/60 p-3.5 rounded-2xl border border-purple-200/80 space-y-2">
              <div class="flex justify-between items-center">
                <label class="block font-black text-purple-950">🏡 Fincas Permitidas / Asignadas *:</label>
                <span class="text-[10px] text-purple-800 font-bold bg-purple-200/70 px-2 py-0.5 rounded-full">1, 2 o Todas</span>
              </div>
              <p class="text-[11px] text-slate-600">
                Selecciona las fincas a las que este usuario podrá ingresar para registrar o consultar datos:
              </p>

              <!-- Checkbox Maestro: Todas las fincas -->
              <label class="flex items-center gap-2 p-2 bg-white rounded-xl border border-purple-200 hover:bg-purple-100/50 cursor-pointer font-bold text-slate-800 transition select-none">
                <input type="checkbox" id="chk-todas-fincas-crear" checked class="w-4 h-4 text-purple-600 rounded cursor-pointer">
                <span>🌐 Todas las fincas de la empresa</span>
              </label>

              <!-- Contenedor dinámico de fincas -->
              <div id="contenedor-checks-fincas-crear" class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                ${this.renderListaChecksFincas(fincas, empIdDefecto, 'crear', 'todas')}
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Correo Electrónico:</label>
                <input type="email" id="usr-email" placeholder="usuario@ganaderia.com" class="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none">
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1">Teléfono:</label>
                <input type="tel" id="usr-telefono" placeholder="310 000 0000" class="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none">
              </div>
            </div>

            <!-- CONTRASEÑA -->
            <div class="bg-purple-50 p-3.5 rounded-2xl border border-purple-200 space-y-2">
              <div class="flex justify-between items-center">
                <label class="block font-black text-purple-900">Contraseña de Inicio de Sesión *:</label>
                <button type="button" id="btn-generar-pass-random" class="text-[10px] font-bold text-purple-700 hover:underline cursor-pointer">
                  🎲 Generar Clave Automática
                </button>
              </div>
              <input type="text" id="usr-password" required value="BoviPass2026*" class="w-full px-3 py-2 font-mono font-bold rounded-xl border border-purple-300 bg-white outline-none">
              <span class="text-[10px] text-purple-700 block">El usuario iniciará sesión ingresando Empresa, su Usuario y esta Contraseña.</span>
            </div>

            <div class="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button type="button" id="btn-cancelar-crear-usr" class="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 cursor-pointer">
                Cancelar
              </button>
              <button type="submit" class="px-5 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-black shadow-lg cursor-pointer">
                Crear Usuario
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  renderModalEditarUsuario(empresas = [], fincas = [], esSuperAdmin = false) {
    const u = this.usuarioEditando;
    if (!u) return '';

    const empIdUsuario = u.empresaId || (empresas[0]?.id) || '';
    const esTodas = !u.fincasAsignadas || u.fincasAsignadas === 'todas' || (Array.isArray(u.fincasAsignadas) && u.fincasAsignadas.includes('todas'));

    return `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
        <div class="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden my-auto flex flex-col">
          <div class="bg-slate-950 text-white p-5 flex justify-between items-center">
            <div class="flex items-center gap-2.5">
              <span class="text-2xl p-2 bg-purple-900/50 rounded-xl border border-purple-600">✏️</span>
              <div>
                <h3 class="text-base font-black">Editar Perfil: @${u.usuario}</h3>
                <p class="text-xs text-slate-400">Actualiza rol asignado, estado o delimita fincas autorizadas.</p>
              </div>
            </div>
            <button id="btn-cerrar-modal-edit" class="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white cursor-pointer">✕</button>
          </div>

          <form id="form-editar-usuario" class="p-5 space-y-3.5 text-xs max-h-[85vh] overflow-y-auto">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Nombre Completo *:</label>
              <input type="text" id="edit-nombre" required value="${u.nombre}" class="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none font-bold">
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Rol Asignado *:</label>
                <select id="edit-rol" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none bg-white">
                  ${esSuperAdmin ? `<option value="superadmin" ${u.rol === 'superadmin' ? 'selected' : ''}>👑 Super Administrador (Global)</option>` : ''}
                  <option value="administrador" ${u.rol === 'administrador' ? 'selected' : ''}>⭐ Administrador (Modificaciones y Empresa)</option>
                  <option value="encargado" ${u.rol === 'encargado' || u.rol === 'operario' || u.rol === 'veterinario' ? 'selected' : ''}>🤠 Encargado (Ingreso de Datos de Ganado)</option>
                  <option value="consultor" ${u.rol === 'consultor' || u.rol === 'consulta' || u.rol === 'propietario' ? 'selected' : ''}>👁️ Consultor (Solo Consulta de Información)</option>
                </select>
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1">Estado de la Cuenta:</label>
                <select id="edit-activo" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none bg-white">
                  <option value="true" ${u.activo !== false ? 'selected' : ''}>● Activo</option>
                  <option value="false" ${u.activo === false ? 'selected' : ''}>○ Inactivo</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">Empresa Ganadera Asignada *:</label>
              <select id="edit-empresa" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none bg-white">
                ${empresas.map((e) => `<option value="${e.id}" ${empIdUsuario === e.id ? 'selected' : ''}>${e.nombre} (${e.nit || e.id})</option>`).join('')}
              </select>
            </div>

            <!-- ASIGNACIÓN DE FINCAS PERMITIDAS (1, 2 O TODAS) -->
            <div class="bg-purple-50/60 p-3.5 rounded-2xl border border-purple-200/80 space-y-2">
              <div class="flex justify-between items-center">
                <label class="block font-black text-purple-950">🏡 Fincas Permitidas / Asignadas *:</label>
                <span class="text-[10px] text-purple-800 font-bold bg-purple-200/70 px-2 py-0.5 rounded-full">1, 2 o Todas</span>
              </div>
              <p class="text-[11px] text-slate-600">
                Selecciona las fincas a las que este usuario podrá ingresar para registrar o consultar datos:
              </p>

              <!-- Checkbox Maestro: Todas las fincas -->
              <label class="flex items-center gap-2 p-2 bg-white rounded-xl border border-purple-200 hover:bg-purple-100/50 cursor-pointer font-bold text-slate-800 transition select-none">
                <input type="checkbox" id="chk-todas-fincas-edit" ${esTodas ? 'checked' : ''} class="w-4 h-4 text-purple-600 rounded cursor-pointer">
                <span>🌐 Todas las fincas de la empresa</span>
              </label>

              <!-- Contenedor dinámico de fincas -->
              <div id="contenedor-checks-fincas-edit" class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                ${this.renderListaChecksFincas(fincas, empIdUsuario, 'edit', u.fincasAsignadas)}
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Correo Electrónico:</label>
                <input type="email" id="edit-email" value="${u.email || ''}" class="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none">
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1">Teléfono:</label>
                <input type="tel" id="edit-telefono" value="${u.telefono || ''}" class="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none">
              </div>
            </div>

            <div class="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button type="button" id="btn-cancelar-modal-edit" class="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 cursor-pointer">
                Cancelar
              </button>
              <button type="submit" class="px-5 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-black shadow-lg cursor-pointer">
                Guardar Cambios
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  renderModalCambiarPassword() {
    const u = this.usuarioCambiandoPassword;
    if (!u) return '';

    return `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
        <div class="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-sm w-full overflow-hidden my-auto flex flex-col">
          <div class="bg-slate-950 text-white p-5 flex justify-between items-center">
            <div class="flex items-center gap-2.5">
              <span class="text-2xl p-2 bg-amber-900/50 rounded-xl border border-amber-600">🔑</span>
              <div>
                <h3 class="text-base font-black">Asignar Contraseña</h3>
                <p class="text-xs text-slate-400">Usuario @${u.usuario}</p>
              </div>
            </div>
            <button id="btn-cerrar-modal-pass" class="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white cursor-pointer">✕</button>
          </div>

          <form id="form-cambiar-password" class="p-5 space-y-4 text-xs">
            <div>
              <div class="flex justify-between items-center mb-1">
                <label class="block font-bold text-slate-700">Nueva Contraseña *:</label>
                <button type="button" id="btn-pass-auto" class="text-[10px] font-bold text-purple-700 hover:underline cursor-pointer">
                  🎲 Generar Clave
                </button>
              </div>
              <input type="text" id="nueva-password" required placeholder="Escribe o genera la clave..." class="w-full px-3 py-2 font-mono font-bold rounded-xl border border-slate-300 outline-none focus:border-amber-600">
            </div>

            <p class="text-[11px] text-slate-500 leading-relaxed">
              El usuario @${u.usuario} podrá acceder inmediatamente con esta nueva contraseña.
            </p>

            <div class="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button type="button" id="btn-cancelar-modal-pass" class="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 cursor-pointer">
                Cancelar
              </button>
              <button type="submit" class="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black shadow-lg cursor-pointer">
                Actualizar Clave
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  renderModalSqlSupabase() {
    return `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
        <div class="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden my-auto flex flex-col max-h-[90vh]">
          <div class="bg-slate-950 text-white p-5 flex justify-between items-center">
            <div class="flex items-center gap-2.5">
              <span class="text-2xl p-2 bg-emerald-900/50 rounded-xl border border-emerald-600">⚡</span>
              <div>
                <h3 class="text-base font-black">Script SQL Oficial para Supabase</h3>
                <p class="text-xs text-slate-400">Ejecútalo en el SQL Editor de Supabase para inicializar las tablas.</p>
              </div>
            </div>
            <button id="btn-cerrar-sql-modal" class="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white cursor-pointer">✕</button>
          </div>

          <div class="p-5 overflow-y-auto space-y-3 flex-1">
            <p class="text-xs text-slate-600">
              Copia este script completo y pégalo en el SQL Editor de tu proyecto de Supabase:
            </p>
            <textarea id="textarea-sql-supabase" readonly class="w-full h-80 p-3 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-xl border border-slate-700 outline-none select-all leading-relaxed">${this.obtenerScriptSqlSupabase()}</textarea>
          </div>

          <div class="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
            <span id="label-copiado-sql" class="text-xs font-bold text-emerald-700 hidden">✓ ¡Copiado al portapapeles!</span>
            <div class="flex gap-2 ml-auto">
              <button type="button" id="btn-cerrar-sql-modal-2" class="px-4 py-2 rounded-xl bg-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-300 cursor-pointer">
                Cerrar
              </button>
              <button type="button" id="btn-copiar-sql-supabase" class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-lg flex items-center gap-1.5 cursor-pointer">
                <span>📋</span> Copiar al Portapapeles
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  obtenerScriptSqlSupabase() {
    return `-- ============================================================================
-- GANADERO AD PWA - ESQUEMA MULTI-TENANT PARA SUPABASE (POSTGREST + RLS)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.empresas (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    nit TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    pais TEXT DEFAULT 'Colombia',
    moneda TEXT DEFAULT 'COP',
    telefono TEXT,
    email TEXT,
    direccion TEXT,
    activa BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fincas (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    empresa_id TEXT REFERENCES public.empresas(id) ON DELETE CASCADE,
    codigo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    ubicacion TEXT,
    area_ha NUMERIC(10,2) DEFAULT 0,
    precio_leche_litro NUMERIC(10,2) DEFAULT 2450.00,
    precio_carne_kg_pie NUMERIC(10,2) DEFAULT 8900.00,
    creado_en TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.usuarios (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    empresa_id TEXT REFERENCES public.empresas(id) ON DELETE SET NULL,
    usuario TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'encargado',
    password TEXT,
    email TEXT,
    telefono TEXT,
    activo BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.costos_fijos_finca (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    finca_id TEXT NOT NULL REFERENCES public.fincas(id) ON DELETE CASCADE,
    nomina NUMERIC(14,2) DEFAULT 0,
    insumos NUMERIC(14,2) DEFAULT 0,
    herbicidas NUMERIC(14,2) DEFAULT 0,
    maquinaria NUMERIC(14,2) DEFAULT 0,
    servicios NUMERIC(14,2) DEFAULT 0,
    otros NUMERIC(14,2) DEFAULT 0,
    CONSTRAINT uq_costos_finca UNIQUE (finca_id)
);

CREATE TABLE IF NOT EXISTS public.inversiones_diferidas (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    finca_id TEXT NOT NULL REFERENCES public.fincas(id) ON DELETE CASCADE,
    descripcion_activo TEXT NOT NULL,
    monto_total_inversion NUMERIC(14,2) NOT NULL,
    plazo_meses_diferido INT NOT NULL,
    cuota_mensual NUMERIC(14,2) DEFAULT 0,
    estado TEXT DEFAULT 'Activa',
    creado_en TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.animales (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    finca_id TEXT NOT NULL REFERENCES public.fincas(id) ON DELETE CASCADE,
    identificacion_tag TEXT NOT NULL,
    nombre_alias TEXT,
    especie TEXT NOT NULL DEFAULT 'bovino',
    raza TEXT NOT NULL,
    sexo TEXT NOT NULL,
    categoria TEXT NOT NULL,
    lote TEXT NOT NULL DEFAULT 'General',
    fecha_nacimiento DATE,
    padre_tag TEXT,
    madre_tag TEXT,
    estado_vida TEXT DEFAULT 'activo',
    estado_reproductivo TEXT DEFAULT 'Vacía',
    dias_gestacion_actual INT DEFAULT 0,
    fecha_ultimo_parto DATE,
    ultimo_peso_kg NUMERIC(6,2),
    fecha_ultimo_pesaje DATE,
    gdp_promedio_g_dia NUMERIC(7,2),
    promedio_leche_diaria_l NUMERIC(5,2) DEFAULT 0,
    partos_previos JSONB DEFAULT '[]'::jsonb,
    creado_en TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_animal_finca_tag UNIQUE (finca_id, identificacion_tag)
);

DO $$
DECLARE
    tbl text;
    tablas text[] := ARRAY['empresas', 'fincas', 'usuarios', 'costos_fijos_finca', 'inversiones_diferidas', 'animales'];
BEGIN
    FOREACH tbl IN ARRAY tablas LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Permitir acceso anon" ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY "Permitir acceso anon" ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true);', tbl);
        EXECUTE format('GRANT ALL ON public.%I TO anon;', tbl);
        EXECUTE format('GRANT ALL ON public.%I TO authenticated;', tbl);
    END LOOP;
END $$;
`;
  }

  // ==========================================================================
  // HELPERS DE ROL Y BADGES
  // ==========================================================================
  getNombreRol(rol) {
    const mapa = {
      superadmin: '👑 Super Admin',
      administrador: '⭐ Administrador',
      encargado: '🤠 Encargado',
      consultor: '👁️ Consultor',
      operario: '🤠 Encargado',
      veterinario: '🩺 Veterinario',
      consulta: '👁️ Consultor',
      propietario: '💼 Consultor'
    };
    return mapa[rol] || rol;
  }

  getBadgeRolHtml(rol) {
    const clases = {
      superadmin: 'bg-purple-900 text-purple-100 border border-purple-700',
      administrador: 'bg-blue-100 text-blue-800 border border-blue-200',
      encargado: 'bg-amber-100 text-amber-800 border border-amber-300',
      consultor: 'bg-slate-100 text-slate-700 border border-slate-300',
      operario: 'bg-amber-100 text-amber-800 border border-amber-300',
      veterinario: 'bg-teal-100 text-teal-800 border border-teal-200',
      consulta: 'bg-slate-100 text-slate-700 border border-slate-300',
      propietario: 'bg-slate-100 text-slate-700 border border-slate-300'
    };
    const c = clases[rol] || 'bg-slate-100 text-slate-800';
    return `<span class="px-2 py-0.5 rounded-md font-black text-[10px] uppercase inline-block ${c}">${this.getNombreRol(rol)}</span>`;
  }

  getDetalleRol(rol) {
    const mapa = {
      superadmin: 'Control supremo global de la plataforma, creación de empresas, gestión de usuarios y borrado selectivo de bases de datos.',
      administrador: 'Encargado de hacer las modificaciones de la empresa dentro de la app (fincas, finanzas, costos y precios).',
      encargado: 'Permisos de ingreso y gestión de datos del ganado en campo (báscula, pesajes, partos y reproducción).',
      consultor: 'Solo lectura: Consulta de información zootécnica e inventario sin facultades de modificación.',
      operario: 'Operación zootécnica de campo.',
      veterinario: 'Diagnóstico y servicios reproductivos.'
    };
    return mapa[rol] || '';
  }

  // ==========================================================================
  // EVENTOS DEL COMPONENTE
  // ==========================================================================
  attachEvents() {
    if (!this.container) return;

    // Cambio de sub-pestaña
    this.container.querySelectorAll('.btn-sub-admin').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        this.setSeccion(e.currentTarget.getAttribute('data-sec'));
      });
    });

    // --- EVENTOS DE EMPRESAS Y FINCAS ---
    this.container.querySelectorAll('.btn-crear-finca-empresa').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const empId = e.currentTarget.getAttribute('data-empresa-id');
        this.empresaParaNuevaFinca = empId;
        this.modalCrearFincaAbierto = true;
        this.render();
      });
    });

    const btnCerrarCrearFinca = this.container.querySelector('#btn-cerrar-modal-crear-finca');
    if (btnCerrarCrearFinca) {
      btnCerrarCrearFinca.addEventListener('click', () => {
        this.modalCrearFincaAbierto = false;
        this.render();
      });
    }

    const btnCancelarCrearFinca = this.container.querySelector('#btn-cancelar-crear-finca');
    if (btnCancelarCrearFinca) {
      btnCancelarCrearFinca.addEventListener('click', () => {
        this.modalCrearFincaAbierto = false;
        this.render();
      });
    }

    const formCrearFinca = this.container.querySelector('#form-crear-finca');
    if (formCrearFinca) {
      formCrearFinca.addEventListener('submit', (e) => {
        e.preventDefault();
        const empId = document.getElementById('finca-empresa-id')?.value;
        const nombre = document.getElementById('finca-nombre')?.value.trim();
        const codigo = document.getElementById('finca-codigo')?.value.trim();
        const area = parseFloat(document.getElementById('finca-area')?.value);
        const ubicacion = document.getElementById('finca-ubicacion')?.value.trim() || 'Colombia';
        const leche = parseFloat(document.getElementById('finca-precio-leche')?.value) || 2450;
        const carne = parseFloat(document.getElementById('finca-precio-carne')?.value) || 8900;

        if (!nombre || isNaN(area) || area <= 0) {
          alert('Por favor ingresa un nombre válido y un área en hectáreas mayor a cero.');
          return;
        }

        if (this.onCrearFinca) {
          this.onCrearFinca({
            id: `FIN-${Date.now()}`,
            empresaId: empId,
            codigo: codigo || `FIN-${Math.floor(Math.random() * 900 + 100)}`,
            nombre,
            ubicacion,
            areaHa: area,
            precioLecheLitro: leche,
            precioCarneKgPie: carne
          });
        }
        this.modalCrearFincaAbierto = false;
        this.render();
      });
    }

    this.container.querySelectorAll('.btn-activar-finca').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (this.onSeleccionarFinca) {
          this.onSeleccionarFinca(id);
        }
        this.render();
      });
    });

    this.container.querySelectorAll('.btn-ir-finanzas-finca').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        this.fincaFinanzasSeleccionada = id;
        this.setSeccion('finanzas');
      });
    });

    this.container.querySelectorAll('.btn-crear-usuario-empresa').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const empId = e.currentTarget.getAttribute('data-empresa-id');
        this.empresaParaNuevoUsuario = empId;
        this.modalCrearUsuarioAbierto = true;
        this.render();
      });
    });

    const btnAbrirCrearEmp = this.container.querySelector('#btn-abrir-crear-empresa');
    if (btnAbrirCrearEmp) {
      btnAbrirCrearEmp.addEventListener('click', () => {
        this.modalCrearEmpresaAbierto = true;
        this.render();
      });
    }

    const btnCrearPrimera = this.container.querySelector('#btn-crear-primera-empresa');
    if (btnCrearPrimera) {
      btnCrearPrimera.addEventListener('click', () => {
        this.modalCrearEmpresaAbierto = true;
        this.render();
      });
    }

    const btnCerrarCrearEmp = this.container.querySelector('#btn-cerrar-modal-crear-emp');
    if (btnCerrarCrearEmp) {
      btnCerrarCrearEmp.addEventListener('click', () => {
        this.modalCrearEmpresaAbierto = false;
        this.render();
      });
    }

    const btnCancelarCrearEmp = this.container.querySelector('#btn-cancelar-crear-emp');
    if (btnCancelarCrearEmp) {
      btnCancelarCrearEmp.addEventListener('click', () => {
        this.modalCrearEmpresaAbierto = false;
        this.render();
      });
    }

    const formCrearEmp = this.container.querySelector('#form-crear-empresa');
    if (formCrearEmp) {
      const selTiempoCrear = this.container.querySelector('#emp-tiempo-activacion');
      const checkIndefCrear = this.container.querySelector('#emp-tiempo-indefinido-check');
      if (selTiempoCrear && checkIndefCrear) {
        checkIndefCrear.addEventListener('change', (e) => {
          if (e.target.checked) {
            selTiempoCrear.value = 'indefinido';
          } else if (selTiempoCrear.value === 'indefinido') {
            selTiempoCrear.value = '12';
          }
        });
        selTiempoCrear.addEventListener('change', (e) => {
          checkIndefCrear.checked = (e.target.value === 'indefinido');
        });
      }

      formCrearEmp.addEventListener('submit', (e) => {
        e.preventDefault();
        const nombre = document.getElementById('emp-nombre').value.trim();
        const nit = document.getElementById('emp-nit').value.trim();
        const pais = document.getElementById('emp-pais').value.trim() || 'Colombia';
        const moneda = document.getElementById('emp-moneda').value || 'COP';
        const email = document.getElementById('emp-email').value.trim();
        const telefono = document.getElementById('emp-telefono').value.trim();
        const direccion = document.getElementById('emp-direccion').value.trim();

        if (!nombre || !nit) {
          alert('El nombre y el NIT de la empresa son obligatorios.');
          return;
        }

        if (this.onCrearEmpresa) {
          const selTiempo = document.getElementById('emp-tiempo-activacion');
          const checkIndef = document.getElementById('emp-tiempo-indefinido-check');
          const esIndef = (checkIndef && checkIndef.checked) || (selTiempo && selTiempo.value === 'indefinido');
          const mesesVigencia = esIndef ? 'indefinido' : (selTiempo ? parseInt(selTiempo.value, 10) : 12);
          const tiempoIndefinido = esIndef;
          const fechaVencimiento = esIndef ? 'indefinido' : null;

          this.onCrearEmpresa({
            id: `EMP-${Date.now()}`,
            nit,
            nombre,
            pais,
            moneda,
            email,
            telefono,
            direccion,
            activa: true,
            mesesVigencia,
            tiempoIndefinido,
            fechaVencimiento
          });
        }

        this.modalCrearEmpresaAbierto = false;
        this.render();
      });
    }

    this.container.querySelectorAll('.btn-abrir-editar-empresa').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const empresas = this.getEmpresas ? this.getEmpresas() : [];
        this.empresaEditando = empresas.find((emp) => emp.id === id) || null;
        this.render();
      });
    });

    const btnCerrarEditarEmp = this.container.querySelector('#btn-cerrar-modal-editar-emp');
    if (btnCerrarEditarEmp) {
      btnCerrarEditarEmp.addEventListener('click', () => {
        this.empresaEditando = null;
        this.render();
      });
    }

    const btnCancelarEditarEmp = this.container.querySelector('#btn-cancelar-editar-emp');
    if (btnCancelarEditarEmp) {
      btnCancelarEditarEmp.addEventListener('click', () => {
        this.empresaEditando = null;
        this.render();
      });
    }

    const formEditarEmp = this.container.querySelector('#form-editar-empresa');
    if (formEditarEmp) {
      const checkIndefEdit = this.container.querySelector('#edit-emp-indefinido');
      const contFecha = this.container.querySelector('#contenedor-fecha-vencimiento');
      const lblVenc = this.container.querySelector('#label-estado-vencimiento');
      const inputVenc = this.container.querySelector('#edit-emp-vencimiento');

      if (checkIndefEdit && contFecha) {
        checkIndefEdit.addEventListener('change', (e) => {
          if (e.target.checked) {
            contFecha.classList.add('opacity-50', 'pointer-events-none');
            if (lblVenc) lblVenc.textContent = '♾️ TIEMPO INDEFINIDO';
          } else {
            contFecha.classList.remove('opacity-50', 'pointer-events-none');
            if (inputVenc) {
              if (!inputVenc.value) {
                const d = new Date();
                d.setMonth(d.getMonth() + 12);
                const anio = d.getFullYear();
                const mes = String(d.getMonth() + 1).padStart(2, '0');
                const dia = String(d.getDate()).padStart(2, '0');
                inputVenc.value = `${anio}-${mes}-${dia}`;
              }
              if (lblVenc) lblVenc.textContent = `Vence: ${inputVenc.value}`;
            }
          }
        });
      }

      if (inputVenc) {
        inputVenc.addEventListener('change', (e) => {
          if (lblVenc && e.target.value) {
            lblVenc.textContent = `Vence: ${e.target.value}`;
          }
        });
      }

      this.container.querySelectorAll('.btn-quick-add-venc').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const meses = parseInt(e.currentTarget.getAttribute('data-meses') || '1', 10);
          if (inputVenc) {
            let base = new Date();
            if (inputVenc.value) {
              const partes = inputVenc.value.split('-');
              if (partes.length === 3) {
                base = new Date(parseInt(partes[0], 10), parseInt(partes[1], 10) - 1, parseInt(partes[2], 10));
              }
            }
            base.setMonth(base.getMonth() + meses);
            const anio = base.getFullYear();
            const mes = String(base.getMonth() + 1).padStart(2, '0');
            const dia = String(base.getDate()).padStart(2, '0');
            const nuevaFecha = `${anio}-${mes}-${dia}`;
            inputVenc.value = nuevaFecha;
            if (lblVenc) lblVenc.textContent = `Vence: ${nuevaFecha}`;
            if (checkIndefEdit) {
              checkIndefEdit.checked = false;
              if (contFecha) contFecha.classList.remove('opacity-50', 'pointer-events-none');
            }
          }
        });
      });

      formEditarEmp.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!this.empresaEditando) return;

        const nombre = document.getElementById('edit-emp-nombre').value.trim();
        const nit = document.getElementById('edit-emp-nit').value.trim();
        const pais = document.getElementById('edit-emp-pais').value.trim();
        const moneda = document.getElementById('edit-emp-moneda').value;
        const activa = document.getElementById('edit-emp-activa').value === 'true';
        const email = document.getElementById('edit-emp-email').value.trim();
        const telefono = document.getElementById('edit-emp-telefono').value.trim();
        const direccion = document.getElementById('edit-emp-direccion').value.trim();
        const checkIndef = document.getElementById('edit-emp-indefinido');
        const inVenc = document.getElementById('edit-emp-vencimiento');
        const esIndef = checkIndef && checkIndef.checked;
        const fechaVencimiento = esIndef ? 'indefinido' : (inVenc && inVenc.value ? inVenc.value : (this.empresaEditando.fechaVencimiento || '2027-09-15'));
        const tiempoIndefinido = esIndef;
        const planVigencia = esIndef ? 'Tiempo Indefinido' : (this.empresaEditando.planVigencia || 'Personalizado');

        if (this.onActualizarEmpresa) {
          this.onActualizarEmpresa({
            ...this.empresaEditando,
            nombre,
            nit,
            pais,
            moneda,
            activa,
            email,
            telefono,
            direccion,
            fechaVencimiento,
            tiempoIndefinido,
            planVigencia
          });
        }

        this.empresaEditando = null;
        this.render();
      });
    }

    // --- ACCIONES DE VIGENCIA, RENOVACIÓN Y BLOQUEO DE EMPRESAS ---
    this.container.querySelectorAll('.btn-renovar-empresa').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const meses = parseInt(e.currentTarget.getAttribute('data-meses') || '1', 10);
        if (this.onRenovarVigenciaEmpresa) {
          this.onRenovarVigenciaEmpresa(id, meses, false);
        }
        this.render();
      });
    });

    this.container.querySelectorAll('.btn-indefinido-empresa').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (this.onRenovarVigenciaEmpresa) {
          this.onRenovarVigenciaEmpresa(id, 0, true);
        }
        this.render();
      });
    });

    this.container.querySelectorAll('.btn-bloquear-empresa').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (this.onCambiarEstadoAccesoEmpresa) {
          this.onCambiarEstadoAccesoEmpresa(id, false);
        }
        this.render();
      });
    });

    this.container.querySelectorAll('.btn-reactivar-empresa').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (this.onCambiarEstadoAccesoEmpresa) {
          this.onCambiarEstadoAccesoEmpresa(id, true);
        }
        this.render();
      });
    });

    this.container.querySelectorAll('.btn-seleccionar-empresa').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (this.onSeleccionarEmpresa) {
          this.onSeleccionarEmpresa(id);
        }
        this.render();
      });
    });

    this.container.querySelectorAll('.btn-eliminar-empresa').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const nombre = e.currentTarget.getAttribute('data-nombre');

        if (confirm(`¿Estás seguro de que deseas eliminar permanentemente la empresa "${nombre}" y todos sus predios y animales asociados?`)) {
          if (this.onEliminarEmpresa) {
            this.onEliminarEmpresa(id);
          }
          this.render();
        }
      });
    });

    this.container.querySelectorAll('.btn-eliminar-finca').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const nombre = e.currentTarget.getAttribute('data-nombre');

        if (confirm(`¿Estás seguro de eliminar la finca "${nombre}" y todos sus animales y registros asociados?`)) {
          if (this.onEliminarFinca) this.onEliminarFinca(id);
          this.render();
        }
      });
    });

    // --- EVENTOS DE GESTIÓN DE USUARIOS ---
    const inBusqUsr = this.container.querySelector('#input-buscar-usuario');
    if (inBusqUsr) {
      inBusqUsr.addEventListener('input', (e) => {
        this.filtroUsuario = e.target.value;
        this.render();
        const nuevoInput = document.getElementById('input-buscar-usuario');
        if (nuevoInput) {
          nuevoInput.focus();
          nuevoInput.setSelectionRange(nuevoInput.value.length, nuevoInput.value.length);
        }
      });
    }

    const selFiltroEmp = this.container.querySelector('#select-filtro-empresa-usr');
    if (selFiltroEmp) {
      selFiltroEmp.addEventListener('change', (e) => {
        this.filtroEmpresaUsuario = e.target.value;
        this.render();
      });
    }

    const btnAbrirCrearUsr = this.container.querySelector('#btn-abrir-modal-nuevo-usuario');
    if (btnAbrirCrearUsr) {
      btnAbrirCrearUsr.addEventListener('click', () => {
        this.empresaParaNuevoUsuario = null;
        this.modalCrearUsuarioAbierto = true;
        this.render();
      });
    }

    const btnCerrarCrearUsr = this.container.querySelector('#btn-cerrar-modal-crear-usr');
    if (btnCerrarCrearUsr) {
      btnCerrarCrearUsr.addEventListener('click', () => {
        this.modalCrearUsuarioAbierto = false;
        this.render();
      });
    }

    const btnCancelarCrearUsr = this.container.querySelector('#btn-cancelar-crear-usr');
    if (btnCancelarCrearUsr) {
      btnCancelarCrearUsr.addEventListener('click', () => {
        this.modalCrearUsuarioAbierto = false;
        this.render();
      });
    }

    const btnGenPass = this.container.querySelector('#btn-generar-pass-random');
    if (btnGenPass) {
      btnGenPass.addEventListener('click', () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
        let pass = 'Bovi-';
        for (let i = 0; i < 4; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
        pass += '-2026';
        const inPass = document.getElementById('usr-password');
        if (inPass) inPass.value = pass;
      });
    }

    // Vinculación reactiva de checkboxes de fincas
    this.vincularEventosFincasAsignadas('crear');
    this.vincularEventosFincasAsignadas('edit');

    const selEmpCrear = this.container.querySelector('#usr-empresa');
    if (selEmpCrear) {
      selEmpCrear.addEventListener('change', (e) => {
        const newEmpId = e.target.value;
        this.empresaParaNuevoUsuario = newEmpId;
        const contenedor = this.container.querySelector('#contenedor-checks-fincas-crear');
        const fincas = this.getFincas ? this.getFincas() : [];
        if (contenedor) {
          contenedor.innerHTML = this.renderListaChecksFincas(fincas, newEmpId, 'crear', 'todas');
          this.vincularEventosFincasAsignadas('crear');
        }
        const master = this.container.querySelector('#chk-todas-fincas-crear');
        if (master) master.checked = true;
      });
    }

    const selEmpEdit = this.container.querySelector('#edit-empresa');
    if (selEmpEdit) {
      selEmpEdit.addEventListener('change', (e) => {
        const newEmpId = e.target.value;
        const contenedor = this.container.querySelector('#contenedor-checks-fincas-edit');
        const fincas = this.getFincas ? this.getFincas() : [];
        if (contenedor) {
          contenedor.innerHTML = this.renderListaChecksFincas(fincas, newEmpId, 'edit', 'todas');
          this.vincularEventosFincasAsignadas('edit');
        }
        const master = this.container.querySelector('#chk-todas-fincas-edit');
        if (master) master.checked = true;
      });
    }

    // Validación reactiva en tiempo real al escribir el usuario
    const inputLogin = this.container.querySelector('#usr-login');
    const feedbackLogin = this.container.querySelector('#usr-login-feedback');
    if (inputLogin) {
      inputLogin.addEventListener('input', () => {
        const raw = inputLogin.value.trim();
        const login = raw.replace(/^@+/, '').trim().toLowerCase();
        if (!login) {
          if (feedbackLogin) {
            feedbackLogin.classList.add('hidden');
            feedbackLogin.textContent = '';
          }
          inputLogin.classList.remove('border-rose-500', 'bg-rose-50', 'border-emerald-500', 'bg-emerald-50');
          return;
        }

        const todosUsuarios = typeof this.getTodosLosUsuarios === 'function'
          ? this.getTodosLosUsuarios()
          : (this.getUsuarios ? this.getUsuarios() : []);

        const yaExiste = todosUsuarios.some(
          (u) => (u.usuario || '').replace(/^@+/, '').trim().toLowerCase() === login
        );

        if (yaExiste) {
          inputLogin.classList.remove('border-emerald-500', 'bg-emerald-50');
          inputLogin.classList.add('border-rose-500', 'bg-rose-50');
          if (feedbackLogin) {
            feedbackLogin.classList.remove('hidden', 'text-emerald-600');
            feedbackLogin.classList.add('text-rose-600');
            feedbackLogin.textContent = `⚠️ El usuario "@${login}" ya existe en el sistema. Elige otro.`;
          }
        } else {
          inputLogin.classList.remove('border-rose-500', 'bg-rose-50');
          inputLogin.classList.add('border-emerald-500', 'bg-emerald-50');
          if (feedbackLogin) {
            feedbackLogin.classList.remove('hidden', 'text-rose-600');
            feedbackLogin.classList.add('text-emerald-600');
            feedbackLogin.textContent = `✓ El usuario "@${login}" está disponible`;
          }
        }
      });
    }

    const formCrearUsr = this.container.querySelector('#form-crear-usuario');
    if (formCrearUsr) {
      formCrearUsr.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = (document.getElementById('usr-nombre')?.value || '').trim();
        const rawLogin = (document.getElementById('usr-login')?.value || '').trim();
        const login = rawLogin.replace(/^@+/, '').trim().toLowerCase();
        const rol = document.getElementById('usr-rol')?.value || 'encargado';
        const email = (document.getElementById('usr-email')?.value || '').trim();
        const telefono = (document.getElementById('usr-telefono')?.value || '').trim();
        const password = (document.getElementById('usr-password')?.value || '').trim();
        const elEmpresa = document.getElementById('usr-empresa');
        const empresaId = elEmpresa ? elEmpresa.value : (this.getEmpresaActiva ? this.getEmpresaActiva()?.id : null);

        if (!login || !nombre) {
          alert('El nombre y el usuario son obligatorios.');
          return;
        }

        const todosUsuarios = typeof this.getTodosLosUsuarios === 'function'
          ? this.getTodosLosUsuarios()
          : (this.getUsuarios ? this.getUsuarios() : []);

        const yaExiste = todosUsuarios.some(
          (u) => (u.usuario || '').replace(/^@+/, '').trim().toLowerCase() === login
        );

        if (yaExiste) {
          alert(`⚠️ ACCESO DENEGADO: El nombre de usuario "@${login}" ya está en uso en el sistema. No se permite crear usuarios duplicados. Por favor elige otro.`);
          const inUsr = document.getElementById('usr-login');
          if (inUsr) {
            inUsr.classList.add('border-rose-500', 'bg-rose-50');
            inUsr.focus();
          }
          return;
        }

        const chkMaster = this.container.querySelector('#chk-todas-fincas-crear');
        let fincasAsignadas = 'todas';
        if (chkMaster && !chkMaster.checked) {
          const checkedItems = Array.from(this.container.querySelectorAll('.chk-finca-item-crear:checked'));
          if (checkedItems.length === 0) {
            alert('Debes seleccionar al menos una finca para este usuario, o marcar "Todas las fincas".');
            return;
          }
          fincasAsignadas = checkedItems.map((c) => c.value);
        }

        const nuevoUsuario = {
          id: `USR-${Date.now()}`,
          usuario: login,
          nombre,
          rol,
          empresaId: empresaId || null,
          fincasAsignadas,
          email: email || `${login}@bovitrack.com`,
          telefono: telefono || '',
          password: password || 'BoviPass123*',
          activo: true,
          fechaCreacion: new Date().toISOString().split('T')[0]
        };

        if (this.onCrearUsuario) {
          const res = await this.onCrearUsuario(nuevoUsuario);
          if (res && res.ok === false) {
            return; // Bloqueado por duplicado o error, no cerrar modal
          }
        }

        this.modalCrearUsuarioAbierto = false;
        this.render();
      });
    }

    this.container.querySelectorAll('.btn-toggle-ver-pass').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        this.passwordsVisibles[id] = !this.passwordsVisibles[id];
        this.render();
      });
    });

    this.container.querySelectorAll('.btn-abrir-modal-password').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const usuarios = this.getUsuarios ? this.getUsuarios() : [];
        this.usuarioCambiandoPassword = usuarios.find((u) => u.id === id) || null;
        this.render();
      });
    });

    const btnCerrarModalPass = this.container.querySelector('#btn-cerrar-modal-pass');
    if (btnCerrarModalPass) {
      btnCerrarModalPass.addEventListener('click', () => {
        this.usuarioCambiandoPassword = null;
        this.render();
      });
    }

    const btnCancelarModalPass = this.container.querySelector('#btn-cancelar-modal-pass');
    if (btnCancelarModalPass) {
      btnCancelarModalPass.addEventListener('click', () => {
        this.usuarioCambiandoPassword = null;
        this.render();
      });
    }

    const btnPassAuto = this.container.querySelector('#btn-pass-auto');
    if (btnPassAuto) {
      btnPassAuto.addEventListener('click', () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
        let pass = 'Clave-';
        for (let i = 0; i < 4; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
        pass += '-2026';
        const inNueva = document.getElementById('nueva-password');
        if (inNueva) inNueva.value = pass;
      });
    }

    const formCambiarPass = this.container.querySelector('#form-cambiar-password');
    if (formCambiarPass) {
      formCambiarPass.addEventListener('submit', (e) => {
        e.preventDefault();
        const nuevaClave = document.getElementById('nueva-password').value.trim();
        if (!nuevaClave) {
          alert('Por favor escribe la nueva contraseña.');
          return;
        }

        if (this.onCambiarPassword && this.usuarioCambiandoPassword) {
          this.onCambiarPassword({
            usuarioId: this.usuarioCambiandoPassword.id,
            nuevaPassword: nuevaClave
          });
        }

        this.usuarioCambiandoPassword = null;
        this.render();
      });
    }

    this.container.querySelectorAll('.btn-abrir-modal-editar').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const usuarios = this.getUsuarios ? this.getUsuarios() : [];
        this.usuarioEditando = usuarios.find((u) => u.id === id) || null;
        this.render();
      });
    });

    const btnCerrarModalEditar = this.container.querySelector('#btn-cerrar-modal-edit');
    if (btnCerrarModalEditar) {
      btnCerrarModalEditar.addEventListener('click', () => {
        this.usuarioEditando = null;
        this.render();
      });
    }

    const btnCancelarModalEditar = this.container.querySelector('#btn-cancelar-modal-edit');
    if (btnCancelarModalEditar) {
      btnCancelarModalEditar.addEventListener('click', () => {
        this.usuarioEditando = null;
        this.render();
      });
    }

    const formEditarUsr = this.container.querySelector('#form-editar-usuario');
    if (formEditarUsr) {
      formEditarUsr.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!this.usuarioEditando) return;

        const nombre = document.getElementById('edit-nombre').value.trim();
        const rol = document.getElementById('edit-rol').value;
        const activo = document.getElementById('edit-activo').value === 'true';
        const email = document.getElementById('edit-email').value.trim();
        const telefono = document.getElementById('edit-telefono').value.trim();
        const elEditEmpresa = document.getElementById('edit-empresa');
        const empresaId = elEditEmpresa ? elEditEmpresa.value : this.usuarioEditando.empresaId;

        const chkMasterEdit = this.container.querySelector('#chk-todas-fincas-edit');
        let fincasAsignadas = 'todas';
        if (chkMasterEdit && !chkMasterEdit.checked) {
          const checkedItems = Array.from(this.container.querySelectorAll('.chk-finca-item-edit:checked'));
          if (checkedItems.length === 0) {
            alert('Debes seleccionar al menos una finca para este usuario, o marcar "Todas las fincas".');
            return;
          }
          fincasAsignadas = checkedItems.map((c) => c.value);
        }

        const usuarioActualizado = {
          ...this.usuarioEditando,
          nombre,
          rol,
          empresaId: empresaId || null,
          fincasAsignadas,
          activo,
          email,
          telefono
        };

        if (this.onActualizarUsuario) {
          this.onActualizarUsuario(usuarioActualizado);
        }

        this.usuarioEditando = null;
        this.render();
      });
    }

    this.container.querySelectorAll('.btn-eliminar-usuario').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const usuarioLogin = e.currentTarget.getAttribute('data-usuario');
        const usuarios = this.getUsuarios ? this.getUsuarios() : [];

        const admins = usuarios.filter((u) => u.rol === 'administrador' || u.rol === 'superadmin');
        const userToDelete = usuarios.find((u) => u.id === id);

        if (userToDelete && userToDelete.rol === 'administrador' && admins.length <= 1) {
          alert('No es posible eliminar el único Administrador de la cuenta.');
          return;
        }

        if (confirm(`¿Estás seguro de eliminar al usuario "@${usuarioLogin}"?`)) {
          if (this.onEliminarUsuario) {
            this.onEliminarUsuario(id);
          }
          this.render();
        }
      });
    });

    // --- EVENTOS DE FINANZAS Y PRECIOS ---
    const selFFin = this.container.querySelector('#select-finca-finanzas');
    if (selFFin) {
      selFFin.addEventListener('change', (e) => {
        this.fincaFinanzasSeleccionada = e.target.value;
        this.render();
      });
    }

    const formP = this.container.querySelector('#form-mercado-precios');
    if (formP) {
      formP.addEventListener('submit', (e) => {
        e.preventDefault();
        const inputL = document.getElementById('input-leche');
        const targetFincaId = inputL?.getAttribute('data-finca-id') || this.fincaFinanzasSeleccionada;
        const leche = parseFloat(inputL?.value) || 2450;
        const carne = parseFloat(document.getElementById('input-carne')?.value) || 8900;
        if (this.onActualizarPrecios) {
          this.onActualizarPrecios({ leche, carne, fincaId: targetFincaId });
        }
      });
    }

    const formC = this.container.querySelector('#form-admin-costos');
    if (formC) {
      formC.addEventListener('submit', (e) => {
        e.preventDefault();
        const targetFincaId = document.getElementById('adm-costos-finca-id')?.value || this.fincaFinanzasSeleccionada;
        const data = {
          nomina: parseFloat(document.getElementById('adm-nomina')?.value) || 0,
          insumos: parseFloat(document.getElementById('adm-insumos')?.value) || 0,
          herbicidas: parseFloat(document.getElementById('adm-herbicidas')?.value) || 0,
          maquinaria: parseFloat(document.getElementById('adm-maquinaria')?.value) || 0,
          servicios: parseFloat(document.getElementById('adm-servicios')?.value) || 0,
          otros: parseFloat(document.getElementById('adm-otros')?.value) || 0
        };
        if (this.onGuardarCostos) {
          this.onGuardarCostos(data, targetFincaId);
        }
      });
    }

    const btnInv = this.container.querySelector('#btn-modal-inversion');
    if (btnInv) {
      btnInv.addEventListener('click', () => {
        this.modalCrearInversionAbierto = true;
        this.render();
      });
    }

    const btnCerrarCrearInv = this.container.querySelector('#btn-cerrar-modal-crear-inv');
    if (btnCerrarCrearInv) {
      btnCerrarCrearInv.addEventListener('click', () => {
        this.modalCrearInversionAbierto = false;
        this.render();
      });
    }

    const btnCancelarCrearInv = this.container.querySelector('#btn-cancelar-crear-inv');
    if (btnCancelarCrearInv) {
      btnCancelarCrearInv.addEventListener('click', () => {
        this.modalCrearInversionAbierto = false;
        this.render();
      });
    }

    const formCrearInv = this.container.querySelector('#form-crear-inversion');
    if (formCrearInv) {
      formCrearInv.addEventListener('submit', (e) => {
        e.preventDefault();
        const targetFincaId = document.getElementById('inv-finca-id')?.value || this.fincaFinanzasSeleccionada;
        const concepto = document.getElementById('inv-concepto')?.value.trim();
        const monto = parseFloat(document.getElementById('inv-monto')?.value);
        const plazo = parseInt(document.getElementById('inv-plazo')?.value, 10);

        if (!concepto || isNaN(monto) || monto <= 0 || isNaN(plazo) || plazo <= 0) {
          alert('Por favor ingresa un concepto, monto y plazo de amortización válidos.');
          return;
        }

        if (this.onCrearInversion) {
          this.onCrearInversion({
            id: `INV-${Date.now()}`,
            fincaId: targetFincaId,
            descripcionActivo: concepto,
            montoTotalInversion: monto,
            plazoMesesDiferido: plazo,
            cuotaMensual: Math.round(monto / plazo),
            estado: 'Activa',
            fechaInicio: new Date().toISOString().split('T')[0]
          });
        }
        this.modalCrearInversionAbierto = false;
        this.render();
      });
    }

    this.container.querySelectorAll('.btn-eliminar-inversion').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const concepto = e.currentTarget.getAttribute('data-concepto') || 'esta inversión';
        if (confirm(`¿Estás seguro de eliminar la inversión "${concepto}"?`)) {
          if (this.onEliminarInversion) {
            this.onEliminarInversion(id);
          }
        }
      });
    });

    // --- EVENTOS DE SUPABASE CLOUD ---
    const btnCerrarFeedback = this.container.querySelector('#btn-cerrar-feedback-supabase');
    if (btnCerrarFeedback) {
      btnCerrarFeedback.addEventListener('click', () => {
        this.supabaseFeedback = null;
        this.render();
      });
    }

    const formCredenciales = this.container.querySelector('#form-credenciales-supabase');
    if (formCredenciales) {
      formCredenciales.addEventListener('submit', (e) => {
        e.preventDefault();
        const url = document.getElementById('input-supabase-url').value.trim();
        const anonKey = document.getElementById('input-supabase-key').value.trim();

        if (this.onGuardarConfigSupabase) {
          this.onGuardarConfigSupabase({ url, anonKey });
          this.supabaseFeedback = {
            tipo: 'success',
            mensaje: 'Credenciales de Supabase guardadas localmente con éxito.'
          };
          this.render();
        }
      });
    }

    const btnProbarSupabase = this.container.querySelector('#btn-probar-supabase');
    if (btnProbarSupabase) {
      btnProbarSupabase.addEventListener('click', async () => {
        const url = document.getElementById('input-supabase-url').value.trim();
        const anonKey = document.getElementById('input-supabase-key').value.trim();

        btnProbarSupabase.disabled = true;
        btnProbarSupabase.innerHTML = '<span>⏳ Probando...</span>';

        if (this.onProbarConexionSupabase) {
          const res = await this.onProbarConexionSupabase(url, anonKey);
          if (res.ok) {
            this.supabaseFeedback = { tipo: 'success', mensaje: res.mensaje || '¡Conexión verificada exitosamente!' };
          } else {
            this.supabaseFeedback = { tipo: 'error', mensaje: res.error || 'Error al conectar con Supabase.' };
          }
          this.render();
        }
      });
    }

    const btnPushSupabase = this.container.querySelector('#btn-push-supabase');
    if (btnPushSupabase) {
      btnPushSupabase.addEventListener('click', async () => {
        if (this.sincronizandoSupabase) return;
        this.sincronizandoSupabase = true;
        this.render();

        if (this.onPushSupabase) {
          const res = await this.onPushSupabase();
          this.sincronizandoSupabase = false;
          if (res.ok) {
            const r = res.resumen || {};
            this.supabaseFeedback = {
              tipo: 'success',
              mensaje: `Subida exitosa: ${r.animales || 0} animales y ${r.fincas || 0} predios sincronizados en Supabase.`
            };
          } else {
            this.supabaseFeedback = { tipo: 'error', mensaje: res.error || 'Error en subida a Supabase.' };
          }
          this.render();
        }
      });
    }

    const btnPullSupabase = this.container.querySelector('#btn-pull-supabase');
    if (btnPullSupabase) {
      btnPullSupabase.addEventListener('click', async () => {
        if (this.sincronizandoSupabase) return;
        if (!confirm('¿Deseas descargar los datos de la nube y actualizar la base de datos local?')) return;

        this.sincronizandoSupabase = true;
        this.render();

        if (this.onPullSupabase) {
          const res = await this.onPullSupabase();
          this.sincronizandoSupabase = false;
          if (res.ok) {
            const d = res.datos || {};
            this.supabaseFeedback = {
              tipo: 'success',
              mensaje: `Descarga exitosa: ${(d.animales || []).length} animales cargados desde la nube.`
            };
          } else {
            this.supabaseFeedback = { tipo: 'error', mensaje: res.error || 'Error al descargar datos de Supabase.' };
          }
          this.render();
        }
      });
    }

    const btnAbrirSql = this.container.querySelector('#btn-abrir-sql-modal');
    if (btnAbrirSql) {
      btnAbrirSql.addEventListener('click', () => {
        this.modalSqlSupabaseAbierto = true;
        this.render();
      });
    }

    const btnCerrarSql = this.container.querySelector('#btn-cerrar-sql-modal');
    if (btnCerrarSql) {
      btnCerrarSql.addEventListener('click', () => {
        this.modalSqlSupabaseAbierto = false;
        this.render();
      });
    }

    const btnCerrarSql2 = this.container.querySelector('#btn-cerrar-sql-modal-2');
    if (btnCerrarSql2) {
      btnCerrarSql2.addEventListener('click', () => {
        this.modalSqlSupabaseAbierto = false;
        this.render();
      });
    }

    const btnCopiarSql = this.container.querySelector('#btn-copiar-sql-supabase');
    if (btnCopiarSql) {
      btnCopiarSql.addEventListener('click', () => {
        const textarea = document.getElementById('textarea-sql-supabase');
        if (textarea) {
          textarea.select();
          if (navigator.clipboard) {
            navigator.clipboard.writeText(textarea.value);
          } else {
            document.execCommand('copy');
          }
          const label = document.getElementById('label-copiado-sql');
          if (label) label.classList.remove('hidden');
        }
      });
    }

    // --- EVENTOS DE COPIA DE SEGURIDAD (EXCEL / JSON) ---
    const btnBackupExcel = this.container.querySelector('#btn-descargar-backup-excel');
    if (btnBackupExcel) {
      btnBackupExcel.addEventListener('click', async () => {
        if (this.onExportarBackupExcel) {
          await this.onExportarBackupExcel();
        }
      });
    }

    const btnBackupJSON = this.container.querySelector('#btn-descargar-backup-json');
    if (btnBackupJSON) {
      btnBackupJSON.addEventListener('click', async () => {
        if (this.onExportarBackupJSON) {
          await this.onExportarBackupJSON();
        }
      });
    }

    // --- EVENTOS DE MANTENIMIENTO BD ---
    const btnPurgaFinca = this.container.querySelector('#btn-ejecutar-purga-finca');
    if (btnPurgaFinca) {
      btnPurgaFinca.addEventListener('click', () => {
        const selFinca = document.getElementById('select-purgar-finca');
        const fincaId = selFinca ? selFinca.value : null;
        if (!fincaId) return;

        const fincas = this.getFincas ? this.getFincas() : [];
        const f = fincas.find((item) => item.id === fincaId);
        const nombre = f ? f.nombre : fincaId;

        if (confirm(`⚠️ ¿Estás seguro de que deseas vaciar completamente el hato de la finca "${nombre}"?\n\nTodos sus animales y eventos serán eliminados (0 ejemplares).`)) {
          if (this.onPurgarFinca) {
            this.onPurgarFinca(fincaId);
          }
          this.render();
        }
      });
    }

    const btnPurgaEmpresa = this.container.querySelector('#btn-ejecutar-purga-empresa');
    if (btnPurgaEmpresa) {
      btnPurgaEmpresa.addEventListener('click', () => {
        const selEmp = document.getElementById('select-purgar-empresa');
        const empresaId = selEmp ? selEmp.value : null;
        if (!empresaId) return;

        const empresas = this.getEmpresas ? this.getEmpresas() : [];
        const emp = empresas.find((e) => e.id === empresaId);
        const nombre = emp ? emp.nombre : empresaId;

        if (confirm(`⚠️ ATENCIÓN: Esta acción eliminará permanentemente todos los animales, predios y datos asociados a la empresa "${nombre}".\n\n¿Deseas continuar?`)) {
          if (this.onPurgarEmpresa) {
            this.onPurgarEmpresa(empresaId);
          }
          this.render();
        }
      });
    }

    const btnPurgarTotal = this.container.querySelector('#btn-purgar-bd-total');
    if (btnPurgarTotal) {
      btnPurgarTotal.addEventListener('click', () => {
        const confirmacion = prompt(
          '🚨 ATENCIÓN GLOBAL: Esta acción ELIMINARÁ TODOS LOS ANIMALES de TODAS LAS FINCAS en la plataforma.\n\nPara confirmar escribe la palabra exacta: BORRAR'
        );

        if (confirmacion === 'BORRAR') {
          if (this.onPurgarBaseDatos) {
            this.onPurgarBaseDatos();
          }
        } else if (confirmacion !== null) {
          alert('Cancelado: La palabra de confirmación no coincide.');
        }
      });
    }

    const btnResetTotal = this.container.querySelector('#btn-resetear-sistema-total');
    if (btnResetTotal) {
      btnResetTotal.addEventListener('click', () => {
        if (this.onResetearSistema) {
          this.onResetearSistema();
        }
      });
    }
  }

  vincularEventosFincasAsignadas(modo) {
    const chkMaster = this.container.querySelector(`#chk-todas-fincas-${modo}`);
    const items = this.container.querySelectorAll(`.chk-finca-item-${modo}`);

    if (chkMaster) {
      chkMaster.addEventListener('change', (e) => {
        const checked = e.target.checked;
        this.container.querySelectorAll(`.chk-finca-item-${modo}`).forEach((chk) => {
          chk.checked = checked;
        });
      });
    }

    items.forEach((chk) => {
      chk.addEventListener('change', () => {
        const allItems = Array.from(this.container.querySelectorAll(`.chk-finca-item-${modo}`));
        const allChecked = allItems.length > 0 && allItems.every((i) => i.checked);
        const master = this.container.querySelector(`#chk-todas-fincas-${modo}`);
        if (master) master.checked = allChecked;
      });
    });
  }
}

export default ModuloAdmin;
