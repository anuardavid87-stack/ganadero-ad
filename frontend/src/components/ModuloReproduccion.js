/**
 * GANADERO AD - MÓDULO INTEGRAL DE SERVICIOS REPRODUCTIVOS
 * Registro y seguimiento de:
 * 1. Inseminación Artificial (IA / IATF)
 * 2. Transferencia de Embriones (TE / FIV)
 * 3. Servicios con Toro (Monta Natural / Dirigida)
 * Incluye proyecciones zootécnicas de chequeo (ecografía/palpación) y parto.
 */

import { calcularProyeccionServicio } from '../core/zootecnia.js';
import { auditarServicioInput } from '../core/auditorIA.js';
import { conectarAutosuggestAnimales } from '../ui/AutosuggestAnimales.js';

export class ModuloReproduccion {
  constructor({ containerId, getAnimales, getAnimalesBusqueda, getServicios, onRegistrarServicio, onActualizarServicio, onEliminarServicio, onTrasladarAFinca, onReactivarAnimal }) {
    this.container = document.getElementById(containerId);
    this.getAnimales = getAnimales;
    this.getAnimalesBusqueda = getAnimalesBusqueda;
    this.getServicios = getServicios;
    this.onRegistrarServicio = onRegistrarServicio;
    this.onActualizarServicio = onActualizarServicio;
    this.onEliminarServicio = onEliminarServicio;
    this.onTrasladarAFinca = onTrasladarAFinca;
    this.onReactivarAnimal = onReactivarAnimal;

    this.subvistaActiva = 'formulario'; // 'formulario' | 'historial' | 'kpis'
    this.tipoServicioSeleccionado = 'inseminacion_artificial';
    this.filtroTipoHistorial = 'todos';
    this.filtroEstadoHistorial = 'todos';
    this.busquedaHistorial = '';

    this.animalSeleccionado = null;
  }

  init() {
    this.render();
  }

  render() {
    if (!this.container) return;

    const animales = (this.getAnimales ? this.getAnimales() : []).filter(
      (a) => a.estadoVida === 'activo' || a.estado === 'activo'
    );
    const hembras = animales.filter((a) => (a.sexo || '').toLowerCase() === 'hembra');
    const servicios = this.getServicios ? this.getServicios() : [];

    this.container.innerHTML = `
      <div class="space-y-6">
        <!-- CABECERA PRINCIPAL DEL MÓDULO -->
        <div class="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white p-5 rounded-3xl shadow-xl border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div class="flex items-center gap-3.5">
            <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-2xl shadow-lg">
              🧬
            </div>
            <div>
              <h2 class="text-xl font-black tracking-tight flex items-center gap-2">
                <span>Reproducción & Servicios Genéticos</span>
                <span class="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">IA • TE • Monta</span>
              </h2>
              <p class="text-xs text-slate-400 mt-0.5">Control de inseminaciones artificiales, transferencia de embriones y servicios con toro.</p>
            </div>
          </div>

          <!-- SELECTOR DE SUBPESTAÑAS -->
          <div class="flex bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 w-full md:w-auto overflow-x-auto text-xs gap-1">
            <button id="tab-repro-form" class="btn-subtab-repro px-4 py-2 rounded-xl font-bold transition flex items-center gap-1.5 ${this.subvistaActiva === 'formulario' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}">
              <span>➕</span> Registrar Servicio
            </button>
            <button id="tab-repro-hist" class="btn-subtab-repro px-4 py-2 rounded-xl font-bold transition flex items-center gap-1.5 ${this.subvistaActiva === 'historial' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}">
              <span>📋</span> Historial (${servicios.length})
            </button>
            <button id="tab-repro-kpis" class="btn-subtab-repro px-4 py-2 rounded-xl font-bold transition flex items-center gap-1.5 ${this.subvistaActiva === 'kpis' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}">
              <span>📊</span> Indicadores
            </button>
          </div>
        </div>

        <!-- CONTENIDO DINÁMICO DE SUBPESTAÑA -->
        <div id="contenedor-subvista-repro">
          ${this.renderSubvista(hembras, servicios)}
        </div>
      </div>
    `;

    this.enlazarEventos(hembras, servicios);
  }

  renderSubvista(hembras, servicios) {
    if (this.subvistaActiva === 'formulario') {
      return this.renderFormularioRegistro(hembras);
    } else if (this.subvistaActiva === 'historial') {
      return this.renderHistorial(servicios);
    } else if (this.subvistaActiva === 'kpis') {
      return this.renderKPIs(servicios);
    }
    return '';
  }

  renderFormularioRegistro(hembras) {
    const hoy = new Date().toISOString().split('T')[0];

    return `
      <div class="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <!-- SELECTOR DE TIPO DE SERVICIO -->
        <div class="p-5 bg-slate-50 border-b border-slate-200">
          <label class="block text-xs font-black uppercase text-slate-500 tracking-wider mb-2.5">
            Selecciona la Modalidad de Servicio Reproductivo:
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button type="button" class="btn-tipo-srv p-4 rounded-2xl border-2 text-left transition flex items-center gap-3 ${this.tipoServicioSeleccionado === 'inseminacion_artificial' ? 'border-indigo-600 bg-indigo-50/50 shadow-sm' : 'border-slate-200 hover:border-slate-300 bg-white'}" data-tipo="inseminacion_artificial">
              <span class="text-3xl">💉</span>
              <div>
                <div class="font-black text-slate-900 text-sm">Inseminación Artificial</div>
                <div class="text-[11px] text-slate-500 font-medium">IA Convencional / IATF con Pajilla</div>
              </div>
            </button>

            <button type="button" class="btn-tipo-srv p-4 rounded-2xl border-2 text-left transition flex items-center gap-3 ${this.tipoServicioSeleccionado === 'transferencia_embriones' ? 'border-purple-600 bg-purple-50/50 shadow-sm' : 'border-slate-200 hover:border-slate-300 bg-white'}" data-tipo="transferencia_embriones">
              <span class="text-3xl">🔬</span>
              <div>
                <div class="font-black text-slate-900 text-sm">Transferencia de Embriones</div>
                <div class="text-[11px] text-slate-500 font-medium">TE / FIV Receptora + Donadora</div>
              </div>
            </button>

            <button type="button" class="btn-tipo-srv p-4 rounded-2xl border-2 text-left transition flex items-center gap-3 ${this.tipoServicioSeleccionado === 'monta_natural' ? 'border-amber-600 bg-amber-50/50 shadow-sm' : 'border-slate-200 hover:border-slate-300 bg-white'}" data-tipo="monta_natural">
              <span class="text-3xl">🐂</span>
              <div>
                <div class="font-black text-slate-900 text-sm">Servicio con Toro</div>
                <div class="text-[11px] text-slate-500 font-medium">Monta Natural / Monta Dirigida</div>
              </div>
            </button>
          </div>
        </div>

        <!-- FORMULARIO DETALLADO -->
        <form id="form-servicio-reproductivo" class="p-5 sm:p-7 space-y-6">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
            <!-- 1. SELECCIÓN DE HEMBRA -->
            <div class="md:col-span-2">
              <label class="block text-xs font-bold text-slate-700 mb-1.5 flex justify-between">
                <span>🏷️ Hembra Servida (Arete / Tag):</span>
                <span class="text-slate-400 font-normal">Solo hembras activas</span>
              </label>
              <div class="flex flex-col sm:flex-row gap-2">
                <select id="select-hembra-servicio" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500">
                  <option value="">-- Seleccionar Hembra del Inventario --</option>
                  ${hembras.map((h) => {
                    const tag = h.identificacionTag || h.numero;
                    const st = h.estadoReproductivo || 'Vacía';
                    const icon = h.especie === 'bufalino' ? '🦬' : '🐂';
                    return `<option value="${tag}">${icon} Arete ${tag} - ${h.nombreAlias || 'Sin Nombre'} (${h.raza} | ${st})</option>`;
                  }).join('')}
                </select>
                <input type="text" id="input-tag-manual-repro" placeholder="O digita arete..." class="w-full sm:w-48 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-mono font-bold uppercase outline-none focus:border-indigo-500 shadow-sm" />
              </div>
            </div>

            <!-- 2. FECHA Y HORA -->
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1.5">📅 Fecha del Servicio:</label>
              <input type="date" id="input-fecha-servicio" value="${hoy}" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500" required />
            </div>
          </div>

          <!-- TARJETA INFORMATIVA ANIMAL SELECCIONADO (SI EXISTE) -->
          <div id="card-antecedentes-hembra" class="hidden p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 text-xs"></div>

          <!-- CAMPOS DINÁMICOS POR MODALIDAD -->
          <div class="bg-slate-50/80 p-5 rounded-2xl border border-slate-200 space-y-4">
            <h4 class="font-black text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
              <span>🧬</span> Parámetros Genéticos y Operativos: ${this.getTituloModalidad()}
            </h4>

            ${this.renderCamposDinamicosPorModalidad()}
          </div>

          <!-- PROYECCIONES ZOOTÉCNICAS ESTIMADAS EN VIVO -->
          <div id="panel-proyeccion-repro" class="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
            <div class="flex items-center gap-2 font-black text-xs text-emerald-900 uppercase tracking-wider mb-2.5">
              <span>⏱️</span> Proyecciones Zootécnicas Estimadas (Calculadas Automáticamente):
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div class="bg-white p-3 rounded-xl border border-emerald-200 shadow-xs">
                <span class="block text-[10px] font-bold text-slate-500 uppercase">Ecografía Temprana (30-35 d)</span>
                <span id="proj-ecografia" class="text-sm font-black font-mono text-emerald-800 mt-0.5 block">-</span>
                <span class="text-[10px] text-slate-400">Detección de vesícula embrionaria</span>
              </div>
              <div class="bg-white p-3 rounded-xl border border-emerald-200 shadow-xs">
                <span class="block text-[10px] font-bold text-slate-500 uppercase">Palpación Confirmatoria (60 d)</span>
                <span id="proj-palpacion" class="text-sm font-black font-mono text-emerald-800 mt-0.5 block">-</span>
                <span class="text-[10px] text-slate-400">Chequeo manual ginecológico</span>
              </div>
              <div class="bg-white p-3 rounded-xl border border-emerald-200 shadow-xs">
                <span class="block text-[10px] font-bold text-slate-500 uppercase">Fecha Probable de Parto</span>
                <span id="proj-parto" class="text-sm font-black font-mono text-emerald-800 mt-0.5 block">-</span>
                <span class="text-[10px] text-slate-400">283 d bovino / 310 d bufalino</span>
              </div>
            </div>
          </div>

          <!-- ALERTAS DE AUDITORÍA CON IA -->
          <div id="alertas-ia-servicio" class="hidden p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1"></div>

          <!-- BOTONES DE ACCIÓN -->
          <div class="flex flex-col sm:flex-row justify-end items-stretch sm:items-center gap-2.5 sm:gap-3 pt-2">
            <button type="reset" class="w-full sm:w-auto px-5 py-3 sm:py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition active:scale-95 cursor-pointer text-center">
              Limpiar Formulario
            </button>
            <button type="submit" class="w-full sm:w-auto px-6 py-3.5 sm:py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 active:scale-95 text-white font-black text-xs shadow-lg hover:from-indigo-700 hover:to-purple-700 transition flex items-center justify-center gap-2 cursor-pointer">
              <span>💾</span> Guardar Servicio Reproductivo
            </button>
          </div>
        </form>
      </div>
    `;
  }

  getTituloModalidad() {
    if (this.tipoServicioSeleccionado === 'inseminacion_artificial') return 'Inseminación Artificial (IA / IATF)';
    if (this.tipoServicioSeleccionado === 'transferencia_embriones') return 'Transferencia de Embriones (TE / FIV)';
    return 'Servicio con Toro (Monta)';
  }

  renderCamposDinamicosPorModalidad() {
    if (this.tipoServicioSeleccionado === 'inseminacion_artificial') {
      return `
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Toro / Código de Pajilla (*):</label>
            <input type="text" id="input-reproductor-ia" placeholder="Ej. TORO-GIR-08 (Pajilla #4082)" class="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-indigo-500" required />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Raza del Semen:</label>
            <input type="text" id="input-raza-semen" placeholder="Ej. Gyr Lechero / Angus Negro" class="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Técnico / Inseminador (*):</label>
            <input type="text" id="input-tecnico-ia" placeholder="Nombre del inseminador" class="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-indigo-500" required />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Protocolo de Sincronización:</label>
            <select id="select-protocolo-ia" class="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500">
              <option value="IATF (Dispositivo Progesterona + Benzoato)">IATF (Dispositivo P4 + Benzoato Estradiol)</option>
              <option value="IATF (Ovsynch / Doble Ovsynch)">IATF (Ovsynch / Doble Ovsynch)</option>
              <option value="Celo Natural Detectado (AM-PM)">Celo Natural Detectado (Regla AM-PM)</option>
              <option value="Sincronización con Prostaglandina (PGF2α)">Sincronización con Prostaglandina (PGF2α)</option>
              <option value="Otro">Otro Protocolo</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Turno / Hora del Servicio:</label>
            <select id="select-hora-ia" class="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500">
              <option value="Mañana (AM)">Mañana (AM)</option>
              <option value="Tarde (PM)">Tarde (PM)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Condición Corporal (1.0 - 5.0):</label>
            <input type="number" id="input-cc-ia" min="1" max="5" step="0.25" value="3.0" class="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-indigo-500" />
          </div>
        </div>
      `;
    } else if (this.tipoServicioSeleccionado === 'transferencia_embriones') {
      return `
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Donadora Genética (Madre Biológica) (*):</label>
            <input type="text" id="input-donadora-te" placeholder="Ej. VACA-DON-101 (Gyr Plus)" class="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-purple-500" required />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Toro Padre Genético (*):</label>
            <input type="text" id="input-toro-padre-te" placeholder="Ej. TORO-HOLSTEIN-ELITE" class="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-purple-500" required />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Veterinario / Embriólogo (*):</label>
            <input type="text" id="input-veterinario-te" placeholder="Médico Veterinario responsable" class="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-purple-500" required />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Estadio y Calidad del Embrión:</label>
            <select id="select-calidad-embrio" class="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-purple-500">
              <option value="Blastocisto Día 7 - Grado 1 (Excelente)">Blastocisto Día 7 - Grado 1 (Excelente)</option>
              <option value="Mórula Día 7 - Grado 1 (Excelente)">Mórula Día 7 - Grado 1 (Excelente)</option>
              <option value="Blastocisto Expandido - Grado 2 (Bueno)">Blastocisto Expandido - Grado 2 (Bueno)</option>
              <option value="Embrión Vitrificado / Congelado">Embrión Vitrificado / Congelado</option>
              <option value="Embrión en Fresco (FIV)">Embrión en Fresco (FIV)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Cuerno Uterino Implantado:</label>
            <select id="select-cuerno-te" class="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-purple-500">
              <option value="Cuerno Derecho (Ipsilateral CL)">Cuerno Derecho (Ipsilateral CL)</option>
              <option value="Cuerno Izquierdo (Ipsilateral CL)">Cuerno Izquierdo (Ipsilateral CL)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Cuerpo Lúteo Receptora (CL):</label>
            <input type="text" id="input-cl-te" placeholder="Ej. CL Compacto > 18mm" class="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-purple-500" />
          </div>
        </div>
      `;
    } else {
      return `
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Toro Reproductor / Padrote (*):</label>
            <input type="text" id="input-toro-monta" placeholder="Ej. TORO-PADROTE-01 (Titán)" class="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-amber-500" required />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Modalidad de Monta:</label>
            <select id="select-modalidad-monta" class="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-amber-500">
              <option value="Monta Dirigida (Corral / Asistida)">Monta Dirigida (Corral / Asistida)</option>
              <option value="Monta en Lote (Toro con vacas a campo)">Monta en Lote (Toro con vacas a campo)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Lote / Potrero:</label>
            <input type="text" id="input-lote-monta" placeholder="Ej. Potrero 4 - Lote Reproductivo" class="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-amber-500" />
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Observaciones de la Cópula / Conducta de Celo:</label>
          <input type="text" id="input-obs-monta" placeholder="Ej. Servicio observado a las 7:00 AM con aceptación plena del celo" class="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-amber-500" />
        </div>
      `;
    }
  }

  renderHistorial(servicios) {
    let filtrados = [...servicios];

    if (this.filtroTipoHistorial !== 'todos') {
      filtrados = filtrados.filter((s) => s.tipo === this.filtroTipoHistorial);
    }

    if (this.filtroEstadoHistorial !== 'todos') {
      filtrados = filtrados.filter((s) => (s.resultado || 'Pendiente Chequeo') === this.filtroEstadoHistorial);
    }

    if (this.busquedaHistorial.trim()) {
      const q = this.busquedaHistorial.trim().toUpperCase();
      filtrados = filtrados.filter((s) =>
        (s.tag || s.animalTag || '').toUpperCase().includes(q) ||
        (s.reproductor || '').toUpperCase().includes(q) ||
        (s.donadora || '').toUpperCase().includes(q) ||
        (s.tecnico || '').toUpperCase().includes(q)
      );
    }

    // Ordenar por fecha descendente
    filtrados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    return `
      <div class="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden space-y-4 p-5">
        <!-- BARRA DE FILTROS -->
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
          <div class="flex items-center gap-2 w-full md:w-auto">
            <span class="text-xs font-bold text-slate-600">🔍 Buscar:</span>
            <input type="text" id="input-buscar-hist-repro" value="${this.busquedaHistorial}" placeholder="Buscar por arete, toro, pajilla..." class="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold outline-none w-full md:w-64" />
          </div>

          <div class="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <select id="select-filtro-tipo-hist" class="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 outline-none">
              <option value="todos" ${this.filtroTipoHistorial === 'todos' ? 'selected' : ''}>Todas las Modalidades</option>
              <option value="inseminacion_artificial" ${this.filtroTipoHistorial === 'inseminacion_artificial' ? 'selected' : ''}>💉 Inseminación Artificial</option>
              <option value="transferencia_embriones" ${this.filtroTipoHistorial === 'transferencia_embriones' ? 'selected' : ''}>🔬 Transferencia de Embriones</option>
              <option value="monta_natural" ${this.filtroTipoHistorial === 'monta_natural' ? 'selected' : ''}>🐂 Servicio con Toro</option>
            </select>

            <select id="select-filtro-estado-hist" class="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 outline-none">
              <option value="todos" ${this.filtroEstadoHistorial === 'todos' ? 'selected' : ''}>Todos los Estados</option>
              <option value="Pendiente Chequeo" ${this.filtroEstadoHistorial === 'Pendiente Chequeo' ? 'selected' : ''}>⏳ Pendiente Chequeo</option>
              <option value="Preñada Confirmada" ${this.filtroEstadoHistorial === 'Preñada Confirmada' ? 'selected' : ''}>🟢 Preñada Confirmada</option>
              <option value="Vacía / Repitió" ${this.filtroEstadoHistorial === 'Vacía / Repitió' ? 'selected' : ''}>🔴 Vacía / Repitió Celo</option>
            </select>
          </div>
        </div>

        <!-- TABLA DE HISTORIAL -->
        ${filtrados.length === 0 ? `
          <div class="p-10 text-center text-slate-400">
            <span class="text-4xl block mb-2">🧬</span>
            <span class="font-bold">No se encontraron registros de servicios con los filtros aplicados.</span>
          </div>
        ` : `
          <div class="overflow-x-auto border border-slate-200 rounded-2xl">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-100 uppercase font-bold text-slate-700 text-[10px] tracking-wider">
                <tr>
                  <th class="p-3">Fecha Servicio</th>
                  <th class="p-3">Hembra</th>
                  <th class="p-3">Modalidad</th>
                  <th class="p-3">Reproductor / Pajilla / Donadora</th>
                  <th class="p-3">Técnico / Responsable</th>
                  <th class="p-3">Días Post-Servicio</th>
                  <th class="p-3">Diagnóstico / Estado</th>
                  <th class="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${filtrados.map((s) => {
                  const hoy = new Date();
                  const fServ = new Date(s.fecha);
                  const diasPost = Math.max(0, Math.floor((hoy.getTime() - fServ.getTime()) / (1000 * 60 * 60 * 24)));
                  const st = s.resultado || 'Pendiente Chequeo';

                  let badgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
                  if (st === 'Preñada Confirmada') badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
                  if (st === 'Vacía / Repitió') badgeColor = 'bg-rose-100 text-rose-800 border-rose-300';

                  let badgeTipo = 'bg-indigo-100 text-indigo-800';
                  let nombreTipo = '💉 Inseminación Artificial';
                  if (s.tipo === 'transferencia_embriones') {
                    badgeTipo = 'bg-purple-100 text-purple-800';
                    nombreTipo = '🔬 Transf. Embriones';
                  } else if (s.tipo === 'monta_natural') {
                    badgeTipo = 'bg-amber-100 text-amber-900';
                    nombreTipo = '🐂 Servicio con Toro';
                  }

                  return `
                    <tr class="hover:bg-slate-50 transition">
                      <td class="p-3 font-bold font-mono text-slate-800">${s.fecha}</td>
                      <td class="p-3">
                        <span class="font-mono font-black text-slate-900 px-2 py-0.5 rounded bg-slate-100 border border-slate-200">
                          ${s.tag || s.animalTag}
                        </span>
                      </td>
                      <td class="p-3">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeTipo}">
                          ${nombreTipo}
                        </span>
                      </td>
                      <td class="p-3 font-bold text-slate-800">
                        ${s.reproductor || '-'}
                        ${s.donadora ? `<span class="block text-[10px] text-purple-700 font-normal">Donadora: ${s.donadora}</span>` : ''}
                      </td>
                      <td class="p-3 text-slate-600">${s.tecnico || '-'}</td>
                      <td class="p-3 font-mono font-bold text-slate-700">${diasPost} días</td>
                      <td class="p-3">
                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badgeColor}">
                          ${st}
                        </span>
                      </td>
                      <td class="p-3 text-right whitespace-nowrap space-x-1">
                        ${st === 'Pendiente Chequeo' ? `
                          <button class="btn-confirmar-prenez px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px] transition" data-id="${s.id}" data-tag="${s.tag || s.animalTag}" data-dias="${diasPost}" title="Confirmar Preñez">
                            ✓ Preñada
                          </button>
                          <button class="btn-declarar-vacia px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-[10px] transition" data-id="${s.id}" data-tag="${s.tag || s.animalTag}" title="Declarar Vacía / Repitió Celo">
                            ✗ Vacía
                          </button>
                        ` : ''}
                        <button class="btn-eliminar-srv px-2 py-1 bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-700 font-bold rounded-lg text-[10px] transition" data-id="${s.id}" title="Eliminar Registro">
                          🗑️
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  }

  renderKPIs(servicios) {
    const total = servicios.length;
    const iaCount = servicios.filter((s) => s.tipo === 'inseminacion_artificial').length;
    const teCount = servicios.filter((s) => s.tipo === 'transferencia_embriones').length;
    const montaCount = servicios.filter((s) => s.tipo === 'monta_natural').length;

    const prenadas = servicios.filter((s) => s.resultado === 'Preñada Confirmada').length;
    const vacias = servicios.filter((s) => s.resultado === 'Vacía / Repitió').length;
    const pendientes = servicios.filter((s) => !s.resultado || s.resultado === 'Pendiente Chequeo').length;

    const evaluados = prenadas + vacias;
    const tasaConcepcion = evaluados > 0 ? ((prenadas / evaluados) * 100).toFixed(1) : 0;

    return `
      <div class="space-y-5">
        <!-- TARJETAS PRINCIPALES -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <span class="text-[10px] font-bold text-slate-400 uppercase">Total Servicios Registrados</span>
            <div class="text-2xl font-black text-slate-900 mt-1 font-mono">${total}</div>
            <span class="text-[10px] text-indigo-600 font-bold">En el predio activo</span>
          </div>

          <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <span class="text-[10px] font-bold text-slate-400 uppercase">Tasa de Concepción Evaluada</span>
            <div class="text-2xl font-black text-emerald-600 mt-1 font-mono">${tasaConcepcion}%</div>
            <span class="text-[10px] text-slate-500">${prenadas} preñadas de ${evaluados} evaluadas</span>
          </div>

          <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <span class="text-[10px] font-bold text-slate-400 uppercase">Pendientes de Chequeo</span>
            <div class="text-2xl font-black text-amber-600 mt-1 font-mono">${pendientes}</div>
            <span class="text-[10px] text-amber-700">Ecografía / Palpación en espera</span>
          </div>

          <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <span class="text-[10px] font-bold text-slate-400 uppercase">Repetición de Celo / Vacías</span>
            <div class="text-2xl font-black text-rose-600 mt-1 font-mono">${vacias}</div>
            <span class="text-[10px] text-rose-600">Servicios fallidos</span>
          </div>
        </div>

        <!-- DESGLOSE POR MODALIDAD -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center text-2xl font-bold">
              💉
            </div>
            <div>
              <span class="text-xs font-bold text-slate-500 block">Inseminación Artificial (IA)</span>
              <span class="text-xl font-black text-slate-900 font-mono">${iaCount}</span>
              <span class="text-[10px] text-slate-400 block">${total > 0 ? ((iaCount / total) * 100).toFixed(0) : 0}% del total</span>
            </div>
          </div>

          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center text-2xl font-bold">
              🔬
            </div>
            <div>
              <span class="text-xs font-bold text-slate-500 block">Transferencia de Embriones (TE)</span>
              <span class="text-xl font-black text-slate-900 font-mono">${teCount}</span>
              <span class="text-[10px] text-slate-400 block">${total > 0 ? ((teCount / total) * 100).toFixed(0) : 0}% del total</span>
            </div>
          </div>

          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center text-2xl font-bold">
              🐂
            </div>
            <div>
              <span class="text-xs font-bold text-slate-500 block">Servicios con Toro (Monta)</span>
              <span class="text-xl font-black text-slate-900 font-mono">${montaCount}</span>
              <span class="text-[10px] text-slate-400 block">${total > 0 ? ((montaCount / total) * 100).toFixed(0) : 0}% del total</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  enlazarEventos(hembras, servicios) {
    // 1. Selector de subpestañas
    const btnForm = document.getElementById('tab-repro-form');
    if (btnForm) {
      btnForm.addEventListener('click', () => {
        this.subvistaActiva = 'formulario';
        this.render();
      });
    }

    const btnHist = document.getElementById('tab-repro-hist');
    if (btnHist) {
      btnHist.addEventListener('click', () => {
        this.subvistaActiva = 'historial';
        this.render();
      });
    }

    const btnKpis = document.getElementById('tab-repro-kpis');
    if (btnKpis) {
      btnKpis.addEventListener('click', () => {
        this.subvistaActiva = 'kpis';
        this.render();
      });
    }

    // 2. Botones de tipo de servicio (IA, TE, Monta)
    document.querySelectorAll('.btn-tipo-srv').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tipo = e.currentTarget.getAttribute('data-tipo');
        if (tipo) {
          this.tipoServicioSeleccionado = tipo;
          this.render();
        }
      });
    });

    // 3. Selección de hembra y antecedentes
    const selH = document.getElementById('select-hembra-servicio');
    const inputTagManual = document.getElementById('input-tag-manual-repro');

    const actualizarAnimalSeleccionado = (tag) => {
      if (!tag) {
        this.animalSeleccionado = null;
        this.actualizarCardAntecedentes(null);
        return;
      }
      const cleanTag = tag.trim().toUpperCase();
      const todosHembras = (this.getAnimalesBusqueda ? this.getAnimalesBusqueda() : (this.getAnimales ? this.getAnimales() : []))
        .filter((a) => (a.sexo || '').toLowerCase() === 'hembra');
      const match = todosHembras.find((h) => (h.identificacionTag || h.numero || '').toUpperCase() === cleanTag);
      this.animalSeleccionado = match || null;
      this.actualizarCardAntecedentes(match);
      this.actualizarProyeccionesEnVivo();
      this.validarConIA();
    };

    if (selH) {
      selH.addEventListener('change', (e) => {
        if (inputTagManual) inputTagManual.value = e.target.value;
        actualizarAnimalSeleccionado(e.target.value);
      });
    }

    if (inputTagManual) {
      conectarAutosuggestAnimales({
        inputElement: inputTagManual,
        getAnimales: () => {
          const base = this.getAnimalesBusqueda ? this.getAnimalesBusqueda() : (this.getAnimales ? this.getAnimales() : []);
          return base.filter((a) => (a.sexo || '').toLowerCase() === 'hembra');
        },
        theme: 'indigo',
        maxResultados: 8,
        onTrasladarAFinca: (animal) => {
          if (this.onTrasladarAFinca) this.onTrasladarAFinca(animal);
        },
        onReactivarAnimal: (animal) => {
          if (this.onReactivarAnimal) this.onReactivarAnimal(animal);
        },
        onSeleccionar: (animal) => {
          const tag = animal.identificacionTag || animal.numero;
          inputTagManual.value = tag;
          if (selH) selH.value = tag;
          actualizarAnimalSeleccionado(tag);
        }
      });

      inputTagManual.addEventListener('input', (e) => {
        if (selH) selH.value = e.target.value.toUpperCase();
        actualizarAnimalSeleccionado(e.target.value);
      });
    }

    // Autosuggest para Donadora Genética (TE)
    const inDonadora = document.getElementById('input-donadora-te');
    if (inDonadora) {
      conectarAutosuggestAnimales({
        inputElement: inDonadora,
        getAnimales: () => {
          const base = this.getAnimalesBusqueda ? this.getAnimalesBusqueda() : (this.getAnimales ? this.getAnimales() : []);
          return base.filter((a) => (a.sexo || '').toLowerCase() === 'hembra');
        },
        theme: 'purple',
        maxResultados: 6,
        onTrasladarAFinca: (animal) => {
          if (this.onTrasladarAFinca) this.onTrasladarAFinca(animal);
        },
        onReactivarAnimal: (animal) => {
          if (this.onReactivarAnimal) this.onReactivarAnimal(animal);
        },
        onSeleccionar: (animal) => {
          inDonadora.value = (animal.identificacionTag || animal.numero) + (animal.nombreAlias ? ` (${animal.nombreAlias})` : '');
        }
      });
    }

    // Autosuggest para Toro Padre (TE)
    const inToroTE = document.getElementById('input-toro-padre-te');
    if (inToroTE) {
      conectarAutosuggestAnimales({
        inputElement: inToroTE,
        getAnimales: () => {
          const base = this.getAnimalesBusqueda ? this.getAnimalesBusqueda() : (this.getAnimales ? this.getAnimales() : []);
          return base.filter((a) => (a.sexo || '').toLowerCase() === 'macho');
        },
        theme: 'purple',
        maxResultados: 6,
        onTrasladarAFinca: (animal) => {
          if (this.onTrasladarAFinca) this.onTrasladarAFinca(animal);
        },
        onReactivarAnimal: (animal) => {
          if (this.onReactivarAnimal) this.onReactivarAnimal(animal);
        },
        onSeleccionar: (animal) => {
          inToroTE.value = (animal.identificacionTag || animal.numero) + (animal.nombreAlias ? ` (${animal.nombreAlias})` : '');
        }
      });
    }

    // Autosuggest para Toro Padrote (Monta Natural)
    const inToroMonta = document.getElementById('input-toro-monta');
    if (inToroMonta) {
      conectarAutosuggestAnimales({
        inputElement: inToroMonta,
        getAnimales: () => {
          const base = this.getAnimalesBusqueda ? this.getAnimalesBusqueda() : (this.getAnimales ? this.getAnimales() : []);
          return base.filter((a) => (a.sexo || '').toLowerCase() === 'macho');
        },
        theme: 'amber',
        maxResultados: 6,
        onTrasladarAFinca: (animal) => {
          if (this.onTrasladarAFinca) this.onTrasladarAFinca(animal);
        },
        onReactivarAnimal: (animal) => {
          if (this.onReactivarAnimal) this.onReactivarAnimal(animal);
        },
        onSeleccionar: (animal) => {
          inToroMonta.value = (animal.identificacionTag || animal.numero) + (animal.nombreAlias ? ` (${animal.nombreAlias})` : '');
        }
      });
    }

    // 4. Cambio de fecha para proyecciones
    const inputFecha = document.getElementById('input-fecha-servicio');
    if (inputFecha) {
      inputFecha.addEventListener('change', () => {
        this.actualizarProyeccionesEnVivo();
        this.validarConIA();
      });
      // Calcular proyecciones iniciales
      this.actualizarProyeccionesEnVivo();
    }

    // 5. Envío de formulario
    const form = document.getElementById('form-servicio-reproductivo');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.manejarEnvioFormulario();
      });
    }

    // 6. Eventos de Historial (Filtros y Búsqueda)
    const inputBuscar = document.getElementById('input-buscar-hist-repro');
    if (inputBuscar) {
      inputBuscar.addEventListener('input', (e) => {
        this.busquedaHistorial = e.target.value;
        const cont = document.getElementById('contenedor-subvista-repro');
        if (cont) cont.innerHTML = this.renderHistorial(this.getServicios ? this.getServicios() : []);
        this.enlazarEventosHistorial();
      });
    }

    const selFiltroTipo = document.getElementById('select-filtro-tipo-hist');
    if (selFiltroTipo) {
      selFiltroTipo.addEventListener('change', (e) => {
        this.filtroTipoHistorial = e.target.value;
        const cont = document.getElementById('contenedor-subvista-repro');
        if (cont) cont.innerHTML = this.renderHistorial(this.getServicios ? this.getServicios() : []);
        this.enlazarEventosHistorial();
      });
    }

    const selFiltroEstado = document.getElementById('select-filtro-estado-hist');
    if (selFiltroEstado) {
      selFiltroEstado.addEventListener('change', (e) => {
        this.filtroEstadoHistorial = e.target.value;
        const cont = document.getElementById('contenedor-subvista-repro');
        if (cont) cont.innerHTML = this.renderHistorial(this.getServicios ? this.getServicios() : []);
        this.enlazarEventosHistorial();
      });
    }

    this.enlazarEventosHistorial();
  }

  enlazarEventosHistorial() {
    // Confirmar preñez
    document.querySelectorAll('.btn-confirmar-prenez').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const tag = e.currentTarget.getAttribute('data-tag');
        const dias = parseInt(e.currentTarget.getAttribute('data-dias')) || 60;
        if (confirm(`¿Confirmar diagnóstico de preñez para la hembra ${tag}? Pasará a estado "Preñada" con ${dias} días de gestación estimados.`)) {
          if (this.onActualizarServicio) {
            this.onActualizarServicio({ id, tag, nuevoEstado: 'Preñada Confirmada', diasGestacion: dias });
          }
          this.render();
        }
      });
    });

    // Declarar vacía / repitió celo
    document.querySelectorAll('.btn-declarar-vacia').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const tag = e.currentTarget.getAttribute('data-tag');
        if (confirm(`¿Registrar repetición de celo / vacía para la hembra ${tag}? Pasará a estado "Vacía".`)) {
          if (this.onActualizarServicio) {
            this.onActualizarServicio({ id, tag, nuevoEstado: 'Vacía / Repitió', diasGestacion: 0 });
          }
          this.render();
        }
      });
    });

    // Eliminar servicio
    document.querySelectorAll('.btn-eliminar-srv').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (confirm('¿Seguro que deseas eliminar este registro de servicio?')) {
          if (this.onEliminarServicio) {
            this.onEliminarServicio(id);
          }
          this.render();
        }
      });
    });
  }

  actualizarCardAntecedentes(animal) {
    const card = document.getElementById('card-antecedentes-hembra');
    if (!card) return;

    if (!animal) {
      card.classList.add('hidden');
      card.innerHTML = '';
      return;
    }

    const tag = animal.identificacionTag || animal.numero;
    const st = animal.estadoReproductivo || 'Vacía';
    const especie = animal.especie === 'bufalino' ? 'Bufalino 🦬' : 'Vacuno 🐂';

    card.classList.remove('hidden');
    card.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <span class="font-black text-indigo-900 text-sm">Hembra Seleccionada: ${tag} (${animal.nombreAlias || 'Sin Nombre'})</span>
          <p class="text-[11px] text-indigo-700 mt-0.5">${especie} • Raza: ${animal.raza} • Lote: ${animal.lote} • Estado Reproductivo: <strong>${st}</strong></p>
        </div>
        <div class="text-right">
          <span class="text-[10px] text-indigo-800 uppercase font-bold block">Último Parto</span>
          <span class="font-mono font-bold text-slate-800">${animal.fechaUltimoParto || 'Primeriza / Sin Partos'}</span>
        </div>
      </div>
    `;
  }

  actualizarProyeccionesEnVivo() {
    const inputFecha = document.getElementById('input-fecha-servicio');
    if (!inputFecha || !inputFecha.value) return;

    const especie = this.animalSeleccionado ? this.animalSeleccionado.especie || 'bovino' : 'bovino';
    const proy = calcularProyeccionServicio(inputFecha.value, especie);

    const elEco = document.getElementById('proj-ecografia');
    const elPalp = document.getElementById('proj-palpacion');
    const elParto = document.getElementById('proj-parto');

    if (elEco && proy) elEco.textContent = proy.fechaEcografiaEstimada;
    if (elPalp && proy) elPalp.textContent = proy.fechaPalpacionEstimada;
    if (elParto && proy) elParto.textContent = `${proy.fechaPartoEstimada} (${proy.diasGestacionMedia} d)`;
  }

  validarConIA() {
    const panel = document.getElementById('alertas-ia-servicio');
    if (!panel) return;

    const tag = (document.getElementById('input-tag-manual-repro')?.value || '').trim();
    const fecha = document.getElementById('input-fecha-servicio')?.value;
    let reproductor = '';

    if (this.tipoServicioSeleccionado === 'inseminacion_artificial') {
      reproductor = document.getElementById('input-reproductor-ia')?.value;
    } else if (this.tipoServicioSeleccionado === 'transferencia_embriones') {
      reproductor = document.getElementById('input-toro-padre-te')?.value;
    } else {
      reproductor = document.getElementById('input-toro-monta')?.value;
    }

    if (!this.animalSeleccionado && tag) {
      const animales = this.getAnimales ? this.getAnimales() : [];
      this.animalSeleccionado = animales.find((a) => (a.identificacionTag || a.numero || '').toUpperCase() === tag.toUpperCase());
    }

    const anomalías = auditarServicioInput(this.animalSeleccionado, this.tipoServicioSeleccionado, fecha, reproductor);

    if (anomalías.length > 0) {
      panel.classList.remove('hidden');
      panel.innerHTML = anomalías.map((a) => `<div class="${a.tipo === 'error' ? 'font-black text-rose-700' : 'text-amber-800'}">• ${a.mensaje}</div>`).join('');
    } else {
      panel.classList.add('hidden');
      panel.innerHTML = '';
    }

    return anomalías.filter((a) => a.tipo === 'error');
  }

  manejarEnvioFormulario() {
    const inputTag = document.getElementById('input-tag-manual-repro');
    const selTag = document.getElementById('select-hembra-servicio');
    const tag = (inputTag?.value || selTag?.value || '').trim().toUpperCase();

    if (!tag) {
      alert('Debes seleccionar o digitar el arete de la hembra.');
      return;
    }

    const fecha = document.getElementById('input-fecha-servicio')?.value;
    if (!fecha) {
      alert('Debes ingresar la fecha del servicio.');
      return;
    }

    const errores = this.validarConIA();
    if (errores && errores.length > 0) {
      alert(`No se puede guardar el servicio debido a errores biológicos:\n${errores.map((e) => e.mensaje).join('\n')}`);
      return;
    }

    let reproductor = '';
    let donadora = '';
    let tecnico = '';
    let protocolo = '';
    let observaciones = '';

    if (this.tipoServicioSeleccionado === 'inseminacion_artificial') {
      reproductor = document.getElementById('input-reproductor-ia')?.value || '';
      tecnico = document.getElementById('input-tecnico-ia')?.value || '';
      protocolo = document.getElementById('select-protocolo-ia')?.value || '';
      const razaSemen = document.getElementById('input-raza-semen')?.value || '';
      const cc = document.getElementById('input-cc-ia')?.value || '';
      observaciones = `Raza Semen: ${razaSemen} | CC: ${cc}`;
    } else if (this.tipoServicioSeleccionado === 'transferencia_embriones') {
      donadora = document.getElementById('input-donadora-te')?.value || '';
      reproductor = document.getElementById('input-toro-padre-te')?.value || '';
      tecnico = document.getElementById('input-veterinario-te')?.value || '';
      protocolo = document.getElementById('select-calidad-embrio')?.value || '';
      const cuerno = document.getElementById('select-cuerno-te')?.value || '';
      const cl = document.getElementById('input-cl-te')?.value || '';
      observaciones = `Embrión: ${protocolo} | Cuerno: ${cuerno} | CL: ${cl}`;
    } else {
      reproductor = document.getElementById('input-toro-monta')?.value || '';
      protocolo = document.getElementById('select-modalidad-monta')?.value || '';
      const lote = document.getElementById('input-lote-monta')?.value || '';
      const obs = document.getElementById('input-obs-monta')?.value || '';
      tecnico = 'Monta Natural / Operario';
      observaciones = `Modalidad: ${protocolo} | Lote: ${lote} | ${obs}`;
    }

    const especie = this.animalSeleccionado ? this.animalSeleccionado.especie || 'bovino' : 'bovino';
    const proyeccion = calcularProyeccionServicio(fecha, especie);

    const nuevoServicio = {
      id: `SRV-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      tag,
      animalTag: tag,
      tipo: this.tipoServicioSeleccionado,
      fecha,
      reproductor,
      donadora,
      tecnico,
      protocolo,
      observaciones,
      resultado: 'Pendiente Chequeo',
      fechaEcografiaEstimada: proyeccion?.fechaEcografiaEstimada,
      fechaPalpacionEstimada: proyeccion?.fechaPalpacionEstimada,
      fechaPartoEstimada: proyeccion?.fechaPartoEstimada
    };

    if (this.onRegistrarServicio) {
      this.onRegistrarServicio(nuevoServicio);
    }

    alert(`✓ Servicio reproductivo guardado con éxito para la hembra ${tag}.\nEstado actualizado a "Servida".`);
    this.subvistaActiva = 'historial';
    this.render();
  }
}
