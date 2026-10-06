/**
 * GANADERO AD - REGISTRO GENERAL DE ACTIVIDADES & AUDITORÍA DE DATOS
 * Bitácora central de todos los datos ingresados al sistema ganadero:
 * pesajes, destetes, partos, traslados entre fincas, palpaciones, servicios reproductivos, etc.
 * Con buscador superior en tiempo real, filtro por fecha o acción, y exportación a Excel (.CSV).
 */

export class ModuloIngresosDiarios {
  constructor({
    containerId = 'pantalla-ingresos',
    getFincas,
    getFincaActiva,
    getAnimales,
    getOperaciones,
    getIngresosPorFecha,
    getFechasConRegistros,
    getRol,
    onVerFicha
  }) {
    this.containerId = containerId;
    this.container = typeof document !== 'undefined' ? document.getElementById(containerId) : null;
    this.getFincas = getFincas;
    this.getFincaActiva = getFincaActiva;
    this.getAnimales = getAnimales;
    this.getOperaciones = getOperaciones;
    this.getIngresosPorFecha = getIngresosPorFecha;
    this.getFechasConRegistros = getFechasConRegistros;
    this.getRol = getRol;
    this.onVerFicha = onVerFicha;

    this.filtroTexto = '';
    this.filtroAccion = 'todas';
    this.filtroFinca = 'todas';
    this.filtroFecha = '';
    this.fechaSeleccionada = '';
    this.filtroRango = 'todo'; // 'todo' | 'hoy' | '7dias' | '30dias'
  }

  init() {
    if (typeof document !== 'undefined') {
      this.container = document.getElementById(this.containerId);
    }
    this.render();
  }

  render() {
    if (!this.container && typeof document !== 'undefined') {
      this.container = document.getElementById(this.containerId);
    }
    if (!this.container) return;

    const fincas = this.getFincas ? this.getFincas() : [];
    const fActiva = this.getFincaActiva ? this.getFincaActiva() : null;

    // Obtener actividades filtradas
    let operaciones = [];
    if (this.getOperaciones) {
      operaciones = this.getOperaciones({
        texto: this.filtroTexto,
        accion: this.filtroAccion,
        finca: this.filtroFinca,
        fecha: this.filtroFecha || this.fechaSeleccionada || '',
        rango: this.filtroRango
      });
    } else if (this.getIngresosPorFecha) {
      const f = this.filtroFecha || this.fechaSeleccionada || '';
      operaciones = this.getIngresosPorFecha(f, this.filtroFinca || 'todas', this.filtroAccion === 'todas' ? 'todos' : this.filtroAccion) || [];
    }

    // Calcular estadísticas sobre los registros filtrados (soportando singular y plural)
    const totalRegistros = operaciones.length;
    const pesajes = operaciones.filter((o) => o.accion === 'pesajes' || o.modulo === 'pesajes' || o.accion === 'pesaje');
    const partos = operaciones.filter((o) => o.accion === 'partos' || o.modulo === 'partos' || o.accion === 'parto');
    const destetes = operaciones.filter((o) => o.accion === 'destetes' || o.modulo === 'destetes' || o.accion === 'destete');
    const traslados = operaciones.filter((o) => o.accion === 'traslados' || o.modulo === 'traslados' || o.accion === 'traslado');
    const palpaciones = operaciones.filter((o) => o.accion === 'palpaciones' || o.modulo === 'palpaciones' || o.accion === 'palpacion');
    const servicios = operaciones.filter((o) => o.accion === 'servicios' || o.modulo === 'servicios' || o.accion === 'servicio');
    const leches = operaciones.filter((o) => o.accion === 'leche' || o.modulo === 'leche' || o.accion === 'pesaje_leche' || o.modulo === 'lecheria');

    // Métricas de pesaje
    let pesoPromedio = 0;
    let gdpPromedio = 0;
    if (pesajes.length > 0) {
      const pesajesValidos = pesajes.filter((p) => p.peso !== undefined && p.peso !== null && !isNaN(p.peso));
      if (pesajesValidos.length > 0) {
        pesoPromedio = Math.round(pesajesValidos.reduce((acc, p) => acc + parseFloat(p.peso), 0) / pesajesValidos.length);
      }
      const gdpsValidos = pesajes.filter((p) => p.gdp !== undefined && p.gdp !== null && !isNaN(p.gdp));
      if (gdpsValidos.length > 0) {
        gdpPromedio = Math.round(gdpsValidos.reduce((acc, p) => acc + parseFloat(p.gdp), 0) / gdpsValidos.length);
      }
    }

    // Métrica de preñez en palpaciones
    let pctPrenez = 0;
    if (palpaciones.length > 0) {
      const prenadas = palpaciones.filter((p) => {
        const res = (p.resultado || p.detalle || '').toLowerCase();
        return res.includes('preñada') || res.includes('positiv');
      }).length;
      pctPrenez = Math.round((prenadas / palpaciones.length) * 100);
    }

    this.container.innerHTML = `
      <div class="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden space-y-4 pb-6">
        <!-- CABECERA PRINCIPAL SUPERIOR -->
        <div class="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 text-white p-4 sm:p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-2xl bg-blue-600/20 text-blue-300 border border-blue-500/30 flex items-center justify-center text-2xl shadow-inner">
              📅
            </div>
            <div>
              <h2 class="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                <span>Registro General de Actividades & Auditoría de Datos</span>
                <span class="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  Bitácora de Campo
                </span>
              </h2>
              <p class="text-xs text-slate-300 mt-0.5">Historial unificado de todos los datos ingresados: pesajes, destetes, partos, traslados y servicios.</p>
            </div>
          </div>

          <!-- BOTONES DE EXPORTACIÓN A EXCEL -->
          <div class="flex items-center gap-2 w-full md:w-auto flex-wrap justify-end">
            <button 
              id="btn-exportar-actual-excel" 
              class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs rounded-xl shadow-lg transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              ${totalRegistros === 0 ? 'disabled' : ''}
              title="Descargar los registros visibles actualmente en formato Excel CSV"
            >
              <span>📥</span> Exportar a Excel (.CSV)
            </button>
            <div class="relative inline-block text-left">
              <select id="sel-exportar-grupo-rapido" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-blue-300 font-bold text-xs rounded-xl border border-slate-700 outline-none cursor-pointer">
                <option value="" selected disabled>📥 Exportar Grupo...</option>
                <option value="pesajes">⚖️ Exportar Pesajes</option>
                <option value="partos">🍼 Exportar Partos y Destetes</option>
                <option value="traslados">🚚 Exportar Traslados</option>
                <option value="palpaciones">🩺 Exportar Reproducción</option>
                <option value="todo">🌐 Exportar Todo el Historial</option>
              </select>
            </div>
          </div>
        </div>

        <!-- BARRA SUPERIOR DE BÚSQUEDA Y FILTROS INTEGRADOS -->
        <div class="px-4 sm:px-6 space-y-3">
          <!-- BUSCADOR UNIVERSAL EN VIVO -->
          <div class="relative">
            <span class="absolute left-3.5 top-3 text-slate-400 text-sm">🔍</span>
            <input 
              type="text" 
              id="input-busqueda-actividades" 
              placeholder="Buscar por arete, nombre, finca (ej. Vesubio), técnico, lote, diagnóstico o nota..." 
              value="${this.filtroTexto}" 
              class="w-full pl-10 pr-4 py-2.5 bg-slate-50 hover:bg-white text-slate-900 font-bold text-xs rounded-xl border-2 border-slate-300 focus:border-blue-500 focus:bg-white outline-none transition shadow-sm"
            >
          </div>

          <!-- FILTROS CRUZADOS: ACCIÓN, FINCA, FECHA Y RANGO -->
          <div class="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 text-xs">
            <div class="flex items-center gap-2 flex-wrap">
              <!-- FILTRO ACCIÓN -->
              <div class="flex items-center gap-1">
                <span class="font-bold text-slate-600 text-[11px] whitespace-nowrap">⚡ Acción:</span>
                <select id="sel-filtro-accion" class="px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-xs text-slate-800 outline-none cursor-pointer">
                  <option value="todas" ${this.filtroAccion === 'todas' ? 'selected' : ''}>🌐 Todas las Acciones (${totalRegistros})</option>
                  <option value="pesajes" ${this.filtroAccion === 'pesajes' ? 'selected' : ''}>⚖️ Pesajes (${pesajes.length})</option>
                  <option value="partos" ${this.filtroAccion === 'partos' ? 'selected' : ''}>🍼 Partos (${partos.length})</option>
                  <option value="destetes" ${this.filtroAccion === 'destetes' ? 'selected' : ''}>🌾 Destetes (${destetes.length})</option>
                  <option value="traslados" ${this.filtroAccion === 'traslados' ? 'selected' : ''}>🚚 Traslados (${traslados.length})</option>
                  <option value="palpaciones" ${this.filtroAccion === 'palpaciones' ? 'selected' : ''}>🩺 Palpaciones (${palpaciones.length})</option>
                  <option value="servicios" ${this.filtroAccion === 'servicios' ? 'selected' : ''}>🧬 Servicios IA/Monta (${servicios.length})</option>
                  <option value="leche" ${this.filtroAccion === 'leche' ? 'selected' : ''}>🥛 Control Lechero (${leches.length})</option>
                </select>
              </div>

              <!-- FILTRO FINCA -->
              <div class="flex items-center gap-1">
                <span class="font-bold text-slate-600 text-[11px] whitespace-nowrap">🏡 Finca:</span>
                <select id="sel-filtro-finca" class="px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-xs text-black outline-none cursor-pointer" style="color: #000000 !important; background-color: #ffffff !important;">
                  <option value="todas" ${this.filtroFinca === 'todas' ? 'selected' : ''} class="text-black bg-white" style="color: #000000; background-color: #ffffff;">🌐 Todas las Fincas</option>
                  ${fincas.map((f) => `<option value="${f.id}" ${this.filtroFinca === f.id ? 'selected' : ''} class="text-black bg-white" style="color: #000000; background-color: #ffffff;">${f.nombre}</option>`).join('')}
                </select>
              </div>
            </div>

            <!-- FILTRO DE FECHA CON RANGOS RÁPIDOS -->
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="font-bold text-slate-600 text-[11px] whitespace-nowrap">📅 Fecha:</span>
              <input 
                type="date" 
                id="input-filtro-fecha" 
                value="${this.filtroFecha}" 
                class="px-2.5 py-1 rounded-xl border border-slate-300 bg-white font-mono font-bold text-xs text-slate-800 outline-none cursor-pointer"
              >
              <button id="btn-rango-todo" class="px-2.5 py-1 rounded-lg border font-bold text-[11px] transition cursor-pointer ${this.filtroRango === 'todo' && !this.filtroFecha ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}">
                Todo
              </button>
              <button id="btn-rango-hoy" class="px-2.5 py-1 rounded-lg border font-bold text-[11px] transition cursor-pointer ${this.filtroRango === 'hoy' || this.filtroFecha === new Date().toISOString().split('T')[0] ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}">
                Hoy
              </button>
              <button id="btn-rango-7dias" class="px-2.5 py-1 rounded-lg border font-bold text-[11px] transition cursor-pointer ${this.filtroRango === '7dias' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}">
                7 Días
              </button>
              <button id="btn-rango-30dias" class="px-2.5 py-1 rounded-lg border font-bold text-[11px] transition cursor-pointer ${this.filtroRango === '30dias' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}">
                30 Días
              </button>
              ${(this.filtroTexto || this.filtroAccion !== 'todas' || this.filtroFinca !== 'todas' || this.filtroFecha || this.filtroRango !== 'todo') ? `
                <button id="btn-limpiar-todos-filtros" class="px-2 py-1 text-[11px] font-bold text-rose-600 hover:underline cursor-pointer">
                  ✕ Limpiar Filtros
                </button>
              ` : ''}
            </div>
          </div>

          <!-- TARJETAS DE RESUMEN KPI DE LA CONSULTA -->
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div class="bg-slate-50 border border-slate-200 p-3 rounded-2xl">
              <span class="text-[10px] font-bold uppercase text-slate-500 block">Total Actividades</span>
              <div class="text-xl font-black font-mono text-slate-900 mt-0.5">${totalRegistros}</div>
              <span class="text-[10px] text-slate-400">Registros en consulta</span>
            </div>

            <div class="bg-blue-50/60 border border-blue-200 p-3 rounded-2xl">
              <span class="text-[10px] font-bold uppercase text-blue-900 block">⚖️ Pesajes Realizados</span>
              <div class="text-xl font-black font-mono text-blue-900 mt-0.5">${pesajes.length}</div>
              <span class="text-[10px] text-blue-700 font-bold block">
                ${pesoPromedio > 0 ? `Prom: ${pesoPromedio} kg ${gdpPromedio ? `| GDP: ${gdpPromedio} g/d` : ''}` : 'Sin mediciones'}
              </span>
            </div>

            <div class="bg-amber-50/60 border border-amber-200 p-3 rounded-2xl">
              <span class="text-[10px] font-bold uppercase text-amber-900 block">🍼 Partos & Destetes</span>
              <div class="text-xl font-black font-mono text-amber-900 mt-0.5">${partos.length + destetes.length}</div>
              <span class="text-[10px] text-amber-700 font-bold block">${partos.length} Nacimientos | ${destetes.length} Destetados</span>
            </div>

            <div class="bg-purple-50/60 border border-purple-200 p-3 rounded-2xl">
              <span class="text-[10px] font-bold uppercase text-purple-900 block">🚚 Traslados entre Fincas</span>
              <div class="text-xl font-black font-mono text-purple-900 mt-0.5">${traslados.length}</div>
              <span class="text-[10px] text-purple-700 font-bold block">Movilizaciones de lote</span>
            </div>

            <div class="bg-emerald-50/60 border border-emerald-200 p-3 rounded-2xl">
              <span class="text-[10px] font-bold uppercase text-emerald-900 block">🩺 Chequeos Repro</span>
              <div class="text-xl font-black font-mono text-emerald-900 mt-0.5">${palpaciones.length + servicios.length}</div>
              <span class="text-[10px] text-emerald-700 font-bold block">${palpaciones.length} Palpaciones (${pctPrenez}% preñez) | ${servicios.length} Servicios</span>
            </div>
          </div>

          <!-- TABLA DE ACTIVIDADES DETALLADAS -->
          <div class="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div class="hidden md:block overflow-x-auto max-h-[60vh]">
              <table class="w-full text-left text-xs border-collapse">
                <thead class="bg-slate-100 text-slate-700 uppercase font-black text-[10px] sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th class="p-3">Fecha & Hora</th>
                    <th class="p-3">Acción / Evento</th>
                    <th class="p-3">Arete / Animal</th>
                    <th class="p-3">Nombre & Raza</th>
                    <th class="p-3">Finca</th>
                    <th class="p-3">Detalle de la Operación</th>
                    <th class="p-3">Lote / Ubicación</th>
                    <th class="p-3">Responsable</th>
                    <th class="p-3 text-center">Ficha</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${operaciones.length > 0 ? operaciones.map((op) => {
                    let badgeClass = 'bg-slate-100 text-slate-800 border-slate-200';
                    let icono = '📋';
                    let nombreAccion = op.accion || op.modulo || 'Operación';

                    if (op.accion === 'pesajes' || op.modulo === 'pesajes') {
                      badgeClass = 'bg-blue-100 text-blue-800 border-blue-300';
                      icono = '⚖️';
                      nombreAccion = 'Pesaje';
                    } else if (op.accion === 'partos' || op.modulo === 'partos') {
                      badgeClass = 'bg-amber-100 text-amber-900 border-amber-300';
                      icono = '🍼';
                      nombreAccion = 'Parto';
                    } else if (op.accion === 'destetes' || op.modulo === 'destetes') {
                      badgeClass = 'bg-orange-100 text-orange-900 border-orange-300';
                      icono = '🌾';
                      nombreAccion = 'Destete';
                    } else if (op.accion === 'traslados' || op.modulo === 'traslados') {
                      badgeClass = 'bg-purple-100 text-purple-900 border-purple-300';
                      icono = '🚚';
                      nombreAccion = 'Traslado';
                    } else if (op.accion === 'palpaciones' || op.modulo === 'palpaciones') {
                      badgeClass = 'bg-rose-100 text-rose-900 border-rose-300';
                      icono = '🩺';
                      nombreAccion = 'Palpación';
                    } else if (op.accion === 'servicios' || op.modulo === 'servicios') {
                      badgeClass = 'bg-indigo-100 text-indigo-900 border-indigo-300';
                      icono = '🧬';
                      nombreAccion = 'Servicio / IA';
                    } else if (op.accion === 'leche' || op.modulo === 'leche') {
                      badgeClass = 'bg-cyan-100 text-cyan-900 border-cyan-300';
                      icono = '🥛';
                      nombreAccion = 'Leche';
                    } else if (op.accion === 'altas' || op.modulo === 'altas') {
                      badgeClass = 'bg-emerald-100 text-emerald-900 border-emerald-300';
                      icono = '🏷️';
                      nombreAccion = 'Alta Animal';
                    }

                    const esBufalo = (op.especie || '').toLowerCase() === 'bufalino';

                    return `
                      <tr class="hover:bg-slate-50 transition">
                        <td class="p-3 font-mono text-slate-600 whitespace-nowrap">
                          ${op.fecha || '-'}
                          <span class="block text-[10px] text-slate-400">${op.hora || ''}</span>
                        </td>
                        <td class="p-3 whitespace-nowrap">
                          <span class="px-2.5 py-1 rounded-full text-[10px] font-bold inline-flex items-center gap-1 border ${badgeClass}">
                            <span>${icono}</span> ${nombreAccion}
                          </span>
                        </td>
                        <td class="p-3">
                          <div class="flex items-center gap-1.5">
                            <span>${esBufalo ? '🦬' : '🐂'}</span>
                            <span class="font-black font-mono text-slate-900 text-sm">${op.tag || '-'}</span>
                          </div>
                        </td>
                        <td class="p-3">
                          <div class="font-bold text-slate-800">${op.nombreAlias || 'Sin Alias'}</div>
                          <div class="text-[10px] text-slate-500">${op.raza || 'Común'} ${op.categoria ? `• ${op.categoria}` : ''}</div>
                        </td>
                        <td class="p-3 font-semibold text-slate-700 whitespace-nowrap">
                          🏡 ${op.fincaNombre || op.fincaId || '-'}
                        </td>
                        <td class="p-3">
                          <div class="font-bold text-slate-800">${op.detalle || '-'}</div>
                          ${op.subDetalle ? `<div class="text-[10px] text-slate-500 font-mono">${op.subDetalle}</div>` : ''}
                        </td>
                        <td class="p-3 text-slate-600 font-mono text-[11px]">
                          ${op.lote || op.loteUbicacion || '-'}
                        </td>
                        <td class="p-3 text-slate-500 text-[11px]">
                          ${op.responsable || '-'}
                          ${op.observaciones ? `<div class="text-[10px] text-slate-400 italic mt-0.5">${op.observaciones}</div>` : ''}
                        </td>
                        <td class="p-3 text-center">
                          ${op.animalId ? `
                            <button class="btn-ver-ficha-actividad px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-[10px] transition cursor-pointer" data-id="${op.animalId}">
                              🔍 Ficha
                            </button>
                          ` : '-'}
                        </td>
                      </tr>
                    `;
                  }).join('') : `
                    <tr>
                      <td colspan="9" class="p-12 text-center text-slate-400">
                        <span class="text-3xl block mb-2">📋</span>
                        <div class="font-bold text-slate-600 text-sm">No se encontraron actividades registradas con los filtros seleccionados.</div>
                        <p class="text-xs mt-1">Prueba seleccionando "Todo el Historial" o limpiando el texto de búsqueda.</p>
                      </td>
                    </tr>
                  `}
                </tbody>
              </table>
            </div>

            <!-- FEED MÓVIL DE ACTIVIDADES (CELULARES) -->
            <div class="md:hidden space-y-2.5 p-3 max-h-[70vh] overflow-y-auto">
              ${operaciones.length > 0 ? operaciones.map((op) => {
                let badgeClass = 'bg-slate-100 text-slate-800 border-slate-200';
                let icono = '📋';
                let nombreAccion = op.accion || op.modulo || 'Operación';

                if (op.accion === 'pesajes' || op.modulo === 'pesajes') {
                  badgeClass = 'bg-blue-100 text-blue-800 border-blue-300';
                  icono = '⚖️';
                  nombreAccion = 'Pesaje';
                } else if (op.accion === 'partos' || op.modulo === 'partos') {
                  badgeClass = 'bg-amber-100 text-amber-900 border-amber-300';
                  icono = '🍼';
                  nombreAccion = 'Parto';
                } else if (op.accion === 'destetes' || op.modulo === 'destetes') {
                  badgeClass = 'bg-orange-100 text-orange-900 border-orange-300';
                  icono = '🌾';
                  nombreAccion = 'Destete';
                } else if (op.accion === 'traslados' || op.modulo === 'traslados') {
                  badgeClass = 'bg-purple-100 text-purple-900 border-purple-300';
                  icono = '🚚';
                  nombreAccion = 'Traslado';
                } else if (op.accion === 'palpaciones' || op.modulo === 'palpaciones') {
                  badgeClass = 'bg-rose-100 text-rose-900 border-rose-300';
                  icono = '🩺';
                  nombreAccion = 'Palpación';
                } else if (op.accion === 'servicios' || op.modulo === 'servicios') {
                  badgeClass = 'bg-indigo-100 text-indigo-900 border-indigo-300';
                  icono = '🧬';
                  nombreAccion = 'Servicio / IA';
                } else if (op.accion === 'leche' || op.modulo === 'leche') {
                  badgeClass = 'bg-cyan-100 text-cyan-900 border-cyan-300';
                  icono = '🥛';
                  nombreAccion = 'Leche';
                } else if (op.accion === 'altas' || op.modulo === 'altas') {
                  badgeClass = 'bg-emerald-100 text-emerald-900 border-emerald-300';
                  icono = '🏷️';
                  nombreAccion = 'Alta Animal';
                }

                const esBufalo = (op.especie || '').toLowerCase() === 'bufalino';

                return `
                  <div class="p-3 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-2">
                    <div class="flex items-center justify-between gap-2">
                      <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 border ${badgeClass}">
                        <span>${icono}</span> ${nombreAccion}
                      </span>
                      <span class="font-mono text-[10px] text-slate-500 font-bold">
                        ${op.fecha || ''} ${op.hora || ''}
                      </span>
                    </div>

                    <div class="flex items-center justify-between gap-2">
                      <div class="flex items-center gap-2">
                        <span class="text-xl shrink-0">${esBufalo ? '🦬' : '🐂'}</span>
                        <div>
                          <div class="font-black font-mono text-slate-900 text-sm">${op.tag || 'Sin Arete'}</div>
                          <div class="text-[10px] text-slate-500">${op.nombreAlias || 'Sin Alias'} ${op.raza ? `• ${op.raza}` : ''}</div>
                        </div>
                      </div>
                      ${op.animalId ? `
                        <button class="btn-ver-ficha-actividad px-3 py-1.5 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white rounded-xl font-bold text-xs transition cursor-pointer" data-id="${op.animalId}">
                          🔍 Ficha
                        </button>
                      ` : ''}
                    </div>

                    <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs">
                      <div class="font-bold text-slate-800">${op.detalle || '-'}</div>
                      ${op.subDetalle ? `<div class="text-[10px] text-slate-500 font-mono mt-0.5">${op.subDetalle}</div>` : ''}
                    </div>

                    <div class="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                      <span>🏡 ${op.fincaNombre || op.fincaId || '-'} • 📍 ${op.lote || op.loteUbicacion || 'General'}</span>
                      <span>${op.responsable || ''}</span>
                    </div>
                  </div>
                `;
              }).join('') : `
                <div class="p-8 text-center text-slate-400 bg-white rounded-2xl">
                  <span class="text-3xl block mb-2">📋</span>
                  No se encontraron actividades registradas con los filtros seleccionados.
                </div>
              `}
            </div>
          </div>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  exportarExcelCSV(grupo = null) {
    let dataset = this.getOperaciones
      ? this.getOperaciones({
          texto: this.filtroTexto,
          accion: grupo && grupo !== 'todo' ? grupo : this.filtroAccion,
          finca: this.filtroFinca,
          fecha: this.filtroFecha,
          rango: this.filtroRango
        })
      : [];

    if (grupo && grupo !== 'todo') {
      if (grupo === 'partos') {
        dataset = dataset.filter((o) => o.accion === 'partos' || o.accion === 'destetes');
      } else if (grupo === 'palpaciones') {
        dataset = dataset.filter((o) => o.accion === 'palpaciones' || o.accion === 'servicios');
      } else {
        dataset = dataset.filter((o) => o.accion === grupo || o.modulo === grupo);
      }
    }

    if (dataset.length === 0) {
      alert('No hay actividades disponibles para exportar con los filtros aplicados.');
      return;
    }

    const cabeceras = [
      'Fecha',
      'Hora',
      'Accion_Evento',
      'Arete_Tag',
      'Especie',
      'Nombre_Alias',
      'Raza',
      'Categoria',
      'Finca',
      'Detalle_Operacion',
      'Lote_Ubicacion',
      'Observaciones_Notas',
      'Responsable_Tecnico'
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      let s = String(val).replace(/"/g, '""');
      if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        s = `"${s}"`;
      }
      return s;
    };

    const lineas = [cabeceras.join(';')];
    dataset.forEach((op) => {
      const fila = [
        escapeCsv(op.fecha),
        escapeCsv(op.hora || ''),
        escapeCsv(op.accion || op.modulo || 'Actividad'),
        escapeCsv(op.tag || ''),
        escapeCsv(op.especie || 'bovino'),
        escapeCsv(op.nombreAlias || ''),
        escapeCsv(op.raza || ''),
        escapeCsv(op.categoria || ''),
        escapeCsv(op.fincaNombre || op.fincaId || ''),
        escapeCsv(op.detalle || ''),
        escapeCsv(op.lote || op.loteUbicacion || ''),
        escapeCsv(op.observaciones || ''),
        escapeCsv(op.responsable || '')
      ];
      lineas.push(fila.join(';'));
    });

    const csvContent = '\uFEFF' + lineas.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    const tagGrupo = grupo || this.filtroAccion || 'Actividades';
    const tagFinca = this.filtroFinca || 'Todas';
    a.download = `BoviTrack_Bitacora_${tagGrupo}_${tagFinca}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  attachEvents() {
    if (!this.container) return;

    // Buscador texto en vivo
    const inBusq = this.container.querySelector('#input-busqueda-actividades');
    if (inBusq) {
      inBusq.addEventListener('input', (e) => {
        this.filtroTexto = e.target.value;
        this.render();
        const refoc = this.container.querySelector('#input-busqueda-actividades');
        if (refoc) {
          refoc.focus();
          const l = refoc.value.length;
          refoc.setSelectionRange(l, l);
        }
      });
    }

    // Filtro Acción
    const selAccion = this.container.querySelector('#sel-filtro-accion');
    if (selAccion) {
      selAccion.addEventListener('change', (e) => {
        this.filtroAccion = e.target.value;
        this.render();
      });
    }

    // Filtro Finca
    const selFinca = this.container.querySelector('#sel-filtro-finca');
    if (selFinca) {
      selFinca.addEventListener('change', (e) => {
        this.filtroFinca = e.target.value;
        this.render();
      });
    }

    // Input Fecha
    const inFecha = this.container.querySelector('#input-filtro-fecha');
    if (inFecha) {
      inFecha.addEventListener('change', (e) => {
        this.filtroFecha = e.target.value;
        this.filtroRango = 'todo';
        this.render();
      });
    }

    // Botones rápidos de rango
    const btnTodo = this.container.querySelector('#btn-rango-todo');
    if (btnTodo) {
      btnTodo.addEventListener('click', () => {
        this.filtroRango = 'todo';
        this.filtroFecha = '';
        this.render();
      });
    }

    const btnHoy = this.container.querySelector('#btn-rango-hoy');
    if (btnHoy) {
      btnHoy.addEventListener('click', () => {
        this.filtroRango = 'hoy';
        this.filtroFecha = new Date().toISOString().split('T')[0];
        this.render();
      });
    }

    const btn7Dias = this.container.querySelector('#btn-rango-7dias');
    if (btn7Dias) {
      btn7Dias.addEventListener('click', () => {
        this.filtroRango = '7dias';
        this.filtroFecha = '';
        this.render();
      });
    }

    const btn30Dias = this.container.querySelector('#btn-rango-30dias');
    if (btn30Dias) {
      btn30Dias.addEventListener('click', () => {
        this.filtroRango = '30dias';
        this.filtroFecha = '';
        this.render();
      });
    }

    // Limpiar todos los filtros
    const btnLimpiar = this.container.querySelector('#btn-limpiar-todos-filtros');
    if (btnLimpiar) {
      btnLimpiar.addEventListener('click', () => {
        this.filtroTexto = '';
        this.filtroAccion = 'todas';
        this.filtroFinca = 'todas';
        this.filtroFecha = '';
        this.filtroRango = 'todo';
        this.render();
      });
    }

    // Exportar vista actual
    const btnExportar = this.container.querySelector('#btn-exportar-actual-excel');
    if (btnExportar) {
      btnExportar.addEventListener('click', () => this.exportarExcelCSV());
    }

    // Exportar grupo rápido
    const selExpGrupo = this.container.querySelector('#sel-exportar-grupo-rapido');
    if (selExpGrupo) {
      selExpGrupo.addEventListener('change', (e) => {
        const grp = e.target.value;
        if (grp) {
          this.exportarExcelCSV(grp);
          selExpGrupo.value = '';
        }
      });
    }

    // Botones Ver Ficha
    this.container.querySelectorAll('.btn-ver-ficha-actividad').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (id && this.onVerFicha) {
          this.onVerFicha(id);
        }
      });
    });
  }
}
