/**
 * GANADERO AD - INGRESO MASIVO RÁPIDO EN CAMPO (FLUJO UNO A UNO EN MANGA/BÁSCULA)
 * Permite buscar/digitar el número del animal uno a uno, cargar sus antecedentes,
 * registrar la medición con auditoría de IA y acumular la sesión de trabajo.
 */

import { calcularGDP, calcularGDPEjemplar } from '../core/zootecnia.js';
import { auditarPesajeInput, auditarPalpacionInput, auditarPartoInput } from '../core/auditorIA.js';
import { conectarAutosuggestAnimales } from '../ui/AutosuggestAnimales.js';

export class CuadriculaMasiva {
  constructor({ containerId, onGuardarRegistros, getAnimales, getLotes, onTrasladarAFinca, onReactivarAnimal, onExtraerAnimal }) {
    this.container = document.getElementById(containerId);
    this.onGuardarRegistros = onGuardarRegistros;
    this.getAnimales = getAnimales;
    this.getLotes = getLotes;
    this.onTrasladarAFinca = onTrasladarAFinca;
    this.onReactivarAnimal = onReactivarAnimal;
    this.onExtraerAnimal = onExtraerAnimal;
    this.moduloActivo = 'pesajes'; // 'pesajes' | 'palpaciones' | 'leche' | 'partos' | 'destetes' | 'extracciones'
    this.loteFiltro = 'todos';
    this.animalSeleccionado = null;
    this.fechaJornada = new Date().toISOString().split('T')[0];
    this.registrosSesion = []; // Acumulador de la sesión de trabajo en campo
  }

  init() {
    this.render();
  }

  cargarFilasDesdeInventario() {
    // Si la vista está visible, refrescar los datos desde el inventario del predio activo
    if (this.container && !this.container.classList.contains('hidden')) {
      this.render();
    }
  }

  setModulo(mod) {
    this.moduloActivo = mod;
    this.animalSeleccionado = null;
    this.render();
  }

  setLoteFiltro(lote) {
    this.loteFiltro = lote;
    this.render();
  }

  buscarAnimalPorTag(tag) {
    if (!tag) return null;
    const cleanTag = tag.trim().toUpperCase();
    const animales = this.getAnimales ? this.getAnimales() : [];

    let match = animales.find(
      (a) => (a.identificacionTag || a.numero || '').toUpperCase() === cleanTag
    );

    return match || null;
  }

  seleccionarAnimal(tag) {
    const animal = this.buscarAnimalPorTag(tag);
    this.animalSeleccionado = animal;
    this.renderFormularioIngreso();
  }

  render() {
    if (!this.container) return;

    const hoy = new Date().toISOString().split('T')[0];
    const lotes = this.getLotes ? this.getLotes() : [];
    const todosAnimales = (this.getAnimales ? this.getAnimales() : []).filter(
      (a) => a.estadoVida === 'activo' || a.estado === 'activo'
    );

    this.container.innerHTML = `
      <div class="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <!-- BARRA SUPERIOR -->
        <div class="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white p-4 sm:p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <h2 class="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
              <span>📋</span> Cuadrícula Masiva: Ingreso de Campo en Báscula / Brete
              <span class="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">Modo Uno a Uno</span>
            </h2>
            <p class="text-xs text-slate-400 mt-0.5">Ingresa el número de cada animal individualmente al pasar por la manga.</p>
          </div>

          <!-- Controles superiores: Fecha en que se hace el trabajo y Filtro rápido de Lote -->
          <div class="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            <div class="flex items-center gap-2 bg-slate-800/90 border border-slate-700 px-3 py-1.5 rounded-xl shadow-inner">
              <label for="input-fecha-jornada-manga" class="text-xs font-bold text-slate-200 whitespace-nowrap cursor-pointer">📅 Fecha en que se hace el trabajo:</label>
              <input type="date" id="input-fecha-jornada-manga" value="${this.fechaJornada || hoy}" title="Fecha en que se hace el trabajo (pesajes, palpaciones, partos, destetes...)" class="bg-slate-900 border border-slate-600 text-emerald-300 font-bold font-mono text-xs rounded-lg px-2.5 py-1 outline-none cursor-pointer focus:border-emerald-400">
            </div>
            <div class="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 px-3 py-1.5 rounded-xl shadow-inner">
              <span class="text-xs font-bold text-slate-300 whitespace-nowrap">📍 Lote:</span>
              <select id="select-filtro-lote" class="bg-slate-900 border border-slate-600 text-emerald-300 font-bold text-xs rounded-lg px-2 py-0.5 outline-none w-32 md:w-36">
                <option value="todos" ${this.loteFiltro === 'todos' ? 'selected' : ''}>Todos los Lotes</option>
                ${lotes.map((l) => `<option value="${l}" ${this.loteFiltro === l ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <!-- SELECTOR DE PESTAÑAS TOUCH (PESAJES, PALPACIONES, LECHE, PARTOS, DESTETES, EXTRACCIONES) -->
        <div class="grid grid-cols-2 sm:grid-cols-6 bg-slate-100 border-b border-slate-200 p-1.5 gap-1.5 text-xs">
          <button class="btn-grid-mod py-2.5 px-2 rounded-xl font-black transition flex items-center justify-center gap-1.5 ${this.moduloActivo === 'pesajes' ? 'bg-white text-emerald-800 shadow border border-slate-200' : 'text-slate-600 hover:bg-slate-200/70'}" data-mod="pesajes">
            <span>⚖️</span> Pesajes & GDP
          </button>
          <button class="btn-grid-mod py-2.5 px-2 rounded-xl font-black transition flex items-center justify-center gap-1.5 ${this.moduloActivo === 'palpaciones' ? 'bg-white text-emerald-800 shadow border border-slate-200' : 'text-slate-600 hover:bg-slate-200/70'}" data-mod="palpaciones">
            <span>✋</span> Palpaciones
          </button>
          <button class="btn-grid-mod py-2.5 px-2 rounded-xl font-black transition flex items-center justify-center gap-1.5 ${this.moduloActivo === 'leche' ? 'bg-white text-emerald-800 shadow border border-slate-200' : 'text-slate-600 hover:bg-slate-200/70'}" data-mod="leche">
            <span>🥛</span> Control Leche
          </button>
          <button class="btn-grid-mod py-2.5 px-2 rounded-xl font-black transition flex items-center justify-center gap-1.5 ${this.moduloActivo === 'partos' ? 'bg-white text-emerald-800 shadow border border-slate-200' : 'text-slate-600 hover:bg-slate-200/70'}" data-mod="partos">
            <span>🍼</span> Partos
          </button>
          <button class="btn-grid-mod py-2.5 px-2 rounded-xl font-black transition flex items-center justify-center gap-1.5 ${this.moduloActivo === 'destetes' ? 'bg-white text-emerald-800 shadow border border-slate-200' : 'text-slate-600 hover:bg-slate-200/70'}" data-mod="destetes">
            <span>🌾</span> Destetes
          </button>
          <button class="btn-grid-mod py-2.5 px-2 rounded-xl font-black transition flex items-center justify-center gap-1.5 ${this.moduloActivo === 'extracciones' ? 'bg-white text-rose-800 shadow border border-rose-300' : 'text-slate-600 hover:bg-slate-200/70'}" data-mod="extracciones">
            <span>🚪</span> Extracción Animales
          </button>
        </div>

        <!-- SECCIÓN DE BÚSQUEDA Y CAPTURA UNO A UNO EN MANGA -->
        <div class="p-4 sm:p-5 bg-emerald-50/40 border-b border-emerald-100">
          <div class="max-w-3xl mx-auto space-y-3">
            <!-- BUSCADOR RÁPIDO DE ARETE -->
            <div class="flex flex-col sm:flex-row items-center gap-3">
              <div class="relative w-full">
                <span class="absolute left-3.5 top-3 text-slate-400 text-sm">🔍</span>
                <input type="text" id="input-tag-manga" autofocus placeholder="Digite o escanee No. de animal (Ej. BV-401, 102)..." class="w-full pl-10 pr-4 py-3 bg-white text-slate-900 font-mono font-black text-base rounded-xl border-2 border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 outline-none uppercase shadow-sm">
              </div>
              <button id="btn-buscar-manga" class="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm rounded-xl shadow transition whitespace-nowrap active:scale-95 flex items-center justify-center gap-1.5">
                <span>🔍</span> Buscar
              </button>
            </div>

            <!-- CONTENEDOR DEL FORMULARIO DINÁMICO DEL ANIMAL CARGADO -->
            <div id="contenedor-formulario-animal">
              ${this.obtenerHtmlFormularioIngreso()}
            </div>
          </div>
        </div>

        <!-- LISTA DE REGISTROS DE LA SESIÓN ACTUAL (PLANILLA DE CAMPO ACUMULADA) -->
        <div class="p-4 sm:p-5">
          <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
            <h3 class="font-black text-slate-900 text-sm flex items-center gap-2">
              <span>📝</span> Planilla de la Sesión Actual
              <span class="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                ${this.registrosSesion.length} Registros Capturados
              </span>
            </h3>

            <div class="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
              <button id="btn-aplicar-fecha-sesion" class="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold rounded-xl text-xs transition flex items-center gap-1 cursor-pointer ${this.registrosSesion.length === 0 ? 'hidden' : ''}" title="Aplica la fecha activa a todos los registros de la sesión">
                <span>📅</span> Aplicar Fecha a la Sesión
              </button>
              <button id="btn-limpiar-sesion" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs transition ${this.registrosSesion.length === 0 ? 'hidden' : ''}">
                Limpiar Sesión
              </button>
              <button id="btn-guardar-sesion" class="w-full sm:w-auto px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs shadow transition active:scale-95 flex items-center justify-center gap-1.5 ${this.registrosSesion.length === 0 ? 'opacity-50 pointer-events-none' : ''}">
                <span>💾</span> Guardar Todo en Base de Datos (${this.registrosSesion.length})
              </button>
            </div>
          </div>

          <div class="overflow-x-auto border border-slate-200 rounded-xl">
            <table class="w-full text-left text-xs border-collapse">
              <thead class="bg-slate-100 uppercase font-bold text-slate-700 text-[10px]">
                <tr>
                  <th class="p-2.5 w-10 text-center">#</th>
                  <th class="p-2.5">Tag / Arete</th>
                  <th class="p-2.5">📅 Fecha del Trabajo</th>
                  <th class="p-2.5">Especie</th>
                  <th class="p-2.5">Datos Registrados</th>
                  <th class="p-2.5 text-center">Auditoría / Indicador</th>
                  <th class="p-2.5 w-10 text-center">✕</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${this.registrosSesion.length > 0 ? this.registrosSesion.map((reg, idx) => `
                  <tr class="hover:bg-slate-50">
                    <td class="p-2.5 text-center font-mono text-slate-400">${idx + 1}</td>
                    <td class="p-2.5 font-black font-mono text-slate-900">${reg.tag}</td>
                    <td class="p-2.5 font-mono text-slate-600 font-bold whitespace-nowrap">${reg.fecha || this.fechaJornada}</td>
                    <td class="p-2.5">
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold ${reg.especie === 'bufalino' ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-900'}">
                        ${reg.especie === 'bufalino' ? '🦬 Bufalino' : '🐂 Vacuno'}
                      </span>
                    </td>
                    <td class="p-2.5">${this.renderResumenMedicion(reg)}</td>
                    <td class="p-2.5 text-center">${this.renderBadgeMedicion(reg)}</td>
                    <td class="p-2.5 text-center">
                      <button data-action="delete-sesion-row" data-idx="${idx}" class="text-slate-300 hover:text-rose-600 transition p-1 cursor-pointer">✕</button>
                    </td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="7" class="p-8 text-center text-slate-400">
                      <span class="text-2xl block mb-1">🎯</span>
                      Digite el primer animal arriba para cargarlo y registrar su medición.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    this.renderFormularioIngreso();
    this.attachEvents();
  }

  obtenerHtmlFormularioIngreso() {
    if (!this.animalSeleccionado) {
      return `
        <div class="bg-white/80 p-4 rounded-xl border border-dashed border-emerald-300 text-center text-xs text-slate-500">
          Esperando número de animal en la manga para cargar historial de pesajes y palpaciones...
        </div>
      `;
    }

    const a = this.animalSeleccionado;
    const especie = a.especie || 'bovino';
    const tag = a.identificacionTag || a.numero;
    const hoy = new Date().toISOString().split('T')[0];

    let inputsModulo = '';

    if (this.moduloActivo === 'pesajes') {
      const pesoPrev = a.ultimoPesoKg || a.pesoActual || 0;
      const fechaPrev = a.fechaUltimoPesaje || a.ultimoPesajeFecha || '';
      inputsModulo = `
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-emerald-200">
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">📅 Fecha en que se pesó (Trabajo):</label>
            <input type="date" id="form-peso-fecha" value="${this.fechaJornada || hoy}" class="w-full px-2 py-3 sm:py-2 text-xs font-bold rounded-xl border border-slate-300 outline-none">
            <span class="text-[10px] text-slate-400 block mt-1">${pesoPrev ? `Previo: ${pesoPrev} kg (${fechaPrev || 'S/F'})` : (a.fechaNacimiento ? `Nacido: ${a.fechaNacimiento}` : 'Sin pesajes previos')}</span>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Nuevo Peso en Báscula (kg):</label>
            <input type="number" step="0.5" inputmode="decimal" id="form-nuevo-peso" autofocus placeholder="Ej. 420.5" class="w-full px-3 py-3 sm:py-2 text-lg sm:text-base font-black font-mono text-emerald-800 bg-emerald-50 rounded-xl border-2 border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none text-right shadow-sm">
            <div id="live-gdp-indicator" class="text-xs font-bold mt-1 text-slate-500"></div>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Condición Corporal:</label>
            <select id="form-condicion" class="w-full px-3 py-3 sm:py-2 bg-white text-xs font-bold rounded-xl border border-slate-300 outline-none">
              <option value="2.5">2.5 (Delgada)</option>
              <option value="3.0">3.0 (Regular)</option>
              <option value="3.5" selected>3.5 (Óptima)</option>
              <option value="4.0">4.0 (Buena)</option>
              <option value="4.5">4.5 (Excelente)</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Observaciones / Notas:</label>
            <input type="text" id="form-peso-notas" placeholder="Báscula, lote ceba..." class="w-full px-3 py-3 sm:py-2 text-xs rounded-xl border border-slate-300 outline-none">
          </div>
        </div>
      `;
    } else if (this.moduloActivo === 'palpaciones') {
      inputsModulo = `
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-emerald-200">
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">📅 Fecha en que se palpó (Trabajo):</label>
            <input type="date" id="form-palp-fecha" value="${this.fechaJornada || hoy}" class="w-full px-2 py-3 sm:py-2 text-xs font-bold rounded-xl border border-slate-300 outline-none">
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Diagnóstico:</label>
            <select id="form-diagnostico" class="w-full px-3 py-3 sm:py-2 bg-white text-xs font-bold rounded-xl border border-slate-300 outline-none">
              <option value="Preñada" selected>🟢 Preñada (Gestante)</option>
              <option value="Vacía">🔴 Vacía (Abierta)</option>
              <option value="Sospechosa">🟡 Sospechosa</option>
            </select>
          </div>

          <div id="box-dias-gestacion">
            <label class="block text-xs font-bold text-slate-800 mb-1">Días de Preñez Estimados:</label>
            <input type="number" inputmode="numeric" id="form-dias-preñez" value="60" class="w-full px-3 py-3 sm:py-2 font-mono font-bold text-center rounded-xl border border-slate-300 outline-none">
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Estructura Ovárica / Notas:</label>
            <input type="text" id="form-estructura-ovario" placeholder="CL activo / Folículo / Dr..." class="w-full px-3 py-3 sm:py-2 text-xs rounded-xl border border-slate-300 outline-none">
          </div>
        </div>
      `;
    } else if (this.moduloActivo === 'leche') {
      inputsModulo = `
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-emerald-200">
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">📅 Fecha de pesaje de leche (Trabajo):</label>
            <input type="date" id="form-leche-fecha" value="${this.fechaJornada || hoy}" class="w-full px-2 py-3 sm:py-2 text-xs font-bold rounded-xl border border-slate-300 outline-none">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Turno Mañana (L):</label>
            <input type="number" step="0.1" inputmode="decimal" id="form-leche-am" placeholder="0.0" class="w-full px-3 py-3 sm:py-2 font-mono font-bold text-right text-base rounded-xl border border-slate-300 outline-none">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Turno Tarde (L):</label>
            <input type="number" step="0.1" inputmode="decimal" id="form-leche-pm" placeholder="0.0" class="w-full px-3 py-3 sm:py-2 font-mono font-bold text-right text-base rounded-xl border border-slate-300 outline-none">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Notas Ubre / Calidad:</label>
            <input type="text" id="form-leche-notas" placeholder="Salud ubre / Mastitis..." class="w-full px-3 py-3 sm:py-2 text-xs rounded-xl border border-slate-300 outline-none">
          </div>
        </div>
      `;
    } else if (this.moduloActivo === 'partos') {
      inputsModulo = `
        <div class="grid grid-cols-1 sm:grid-cols-5 gap-3 bg-white p-4 rounded-xl border border-emerald-200">
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">📅 Fecha en que parió (Trabajo):</label>
            <input type="date" id="form-parto-fecha" value="${this.fechaJornada || hoy}" class="w-full px-2 py-3 sm:py-2 text-xs font-bold rounded-xl border border-slate-300">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Sexo Cría:</label>
            <select id="form-parto-sexo" class="w-full px-2 py-3 sm:py-2 text-xs font-bold rounded-xl border border-slate-300">
              <option value="hembra">♀️ Hembra</option>
              <option value="macho">♂️ Macho</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Peso Cría (kg):</label>
            <input type="number" step="0.5" inputmode="decimal" id="form-parto-peso" value="32" class="w-full px-2 py-3 sm:py-2 font-mono text-center font-bold rounded-xl border border-slate-300">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Tag Cría Generado:</label>
            <input type="text" id="form-parto-tag-cria" value="CRIA-${tag}" class="w-full px-2 py-3 sm:py-2 font-mono text-xs font-bold uppercase rounded-xl border border-slate-300">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Tipo de Parto:</label>
            <select id="form-parto-tipo" class="w-full px-2 py-3 sm:py-2 text-xs font-bold rounded-xl border border-slate-300">
              <option value="Normal">Normal</option>
              <option value="Distócico">Distócico</option>
              <option value="Cesárea">Cesárea</option>
            </select>
          </div>
        </div>
      `;
    } else if (this.moduloActivo === 'destetes') {
      inputsModulo = `
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-emerald-200">
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">📅 Fecha en que se destetó (Trabajo):</label>
            <input type="date" id="form-destete-fecha" value="${this.fechaJornada || hoy}" class="w-full px-2 py-3 sm:py-2 text-xs font-bold rounded-xl border border-slate-300">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Peso al Destete (kg):</label>
            <input type="number" step="0.5" inputmode="decimal" id="form-destete-peso" value="${a.ultimoPesoKg || ''}" placeholder="Ej. 185" class="w-full px-2 py-3 sm:py-2 font-mono text-center font-bold rounded-xl border border-slate-300">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Lote Destino:</label>
            <input type="text" id="form-destete-lote" value="Lote Levante" placeholder="Ej. Lote Levante" class="w-full px-2 py-3 sm:py-2 text-xs font-bold rounded-xl border border-slate-300">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Observaciones:</label>
            <input type="text" id="form-destete-obs" placeholder="Vacunación al destete, estado..." class="w-full px-2 py-3 sm:py-2 text-xs rounded-xl border border-slate-300">
          </div>
        </div>
      `;
    } else if (this.moduloActivo === 'extracciones') {
      inputsModulo = `
        <div class="bg-white p-4 rounded-xl border-2 border-rose-200 shadow-sm space-y-3">
          <div class="flex items-center justify-between border-b border-rose-100 pb-2">
            <span class="font-black text-rose-900 text-xs flex items-center gap-1.5">
              <span>🚪</span> Registro de Salida / Extracción de Manga
            </span>
            <span class="text-[10px] bg-rose-50 text-rose-700 font-bold px-2 py-0.5 rounded-full border border-rose-200">
              Venta / Muerte / Descarte
            </span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-800 mb-1">📅 Fecha de Extracción (Trabajo):</label>
              <input type="date" id="form-extraer-fecha" value="${this.fechaJornada || hoy}" class="w-full px-2 py-3 sm:py-2 text-xs font-bold rounded-xl border border-slate-300">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-800 mb-1">Motivo de Extracción:</label>
              <select id="form-extraer-motivo" class="w-full px-2 py-3 sm:py-2 text-xs font-bold rounded-xl border-2 border-rose-300 bg-white">
                <option value="Venta" selected>💰 Venta Comercial</option>
                <option value="Muerte">☠️ Muerte</option>
                <option value="Descarte">⚠️ Descarte / Sacrificio</option>
              </select>
            </div>
            <div id="col-extraer-comprador">
              <label class="block text-xs font-bold text-slate-800 mb-1">Comprador / Destino:</label>
              <input type="text" id="form-extraer-comprador" placeholder="Ej. Frigorífico / Juan Pérez" class="w-full px-2 py-3 sm:py-2 text-xs font-bold rounded-xl border border-slate-300">
            </div>
            <div id="col-extraer-valor">
              <label class="block text-xs font-bold text-slate-800 mb-1">Valor Venta (COP $):</label>
              <input type="number" id="form-extraer-valor" step="1000" placeholder="Ej. 3500000" class="w-full px-2 py-3 sm:py-2 font-mono text-xs font-bold rounded-xl border border-slate-300">
            </div>
            <div id="col-extraer-peso">
              <label class="block text-xs font-bold text-slate-800 mb-1">Peso de Salida (kg):</label>
              <input type="number" id="form-extraer-peso" step="0.5" value="${a.ultimoPesoKg || a.pesoActual || ''}" placeholder="Ej. 480" class="w-full px-2 py-3 sm:py-2 font-mono text-xs font-bold rounded-xl border border-slate-300">
            </div>
            <div id="col-extraer-muerte" class="hidden sm:col-span-3">
              <label class="block text-xs font-bold text-rose-800 mb-1">Causa / Diagnóstico de Muerte o Descarte:</label>
              <input type="text" id="form-extraer-causa" placeholder="Ej. Picadura de culebra, Timpanismo, Neumonía, Fractura..." class="w-full px-2 py-3 sm:py-2 text-xs font-bold rounded-xl border border-rose-300 bg-rose-50/50">
            </div>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Observaciones / Notas:</label>
            <input type="text" id="form-extraer-obs" placeholder="Detalles adicionales de la extracción de este ejemplar..." class="w-full px-2 py-3 sm:py-2 text-xs rounded-xl border border-slate-300">
          </div>
        </div>
      `;
    } else if (this.moduloActivo === 'servicios') {
      inputsModulo = `
        <div class="grid grid-cols-1 sm:grid-cols-5 gap-3 bg-white p-4 rounded-xl border border-indigo-200">
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">📅 Fecha en que se sirvió (Trabajo):</label>
            <input type="date" id="form-srv-fecha" value="${this.fechaJornada || hoy}" class="w-full px-2 py-3 sm:py-2 text-xs font-bold rounded-xl border border-slate-300">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Modalidad:</label>
            <select id="form-srv-tipo" class="w-full px-2 py-3 sm:py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white">
              <option value="inseminacion_artificial" selected>💉 Inseminación Artificial</option>
              <option value="transferencia_embriones">🔬 Transf. Embriones</option>
              <option value="monta_natural">🐂 Servicio con Toro</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Toro / Pajilla:</label>
            <input type="text" id="form-srv-reproductor" placeholder="Ej. TORO-08" class="w-full px-2 py-3 sm:py-2 font-mono text-xs font-bold rounded-xl border border-slate-300">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Técnico:</label>
            <input type="text" id="form-srv-tecnico" placeholder="Inseminador" class="w-full px-2 py-3 sm:py-2 text-xs rounded-xl border border-slate-300">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Protocolo:</label>
            <input type="text" id="form-srv-protocolo" placeholder="IATF" class="w-full px-2 py-3 sm:py-2 text-xs rounded-xl border border-slate-300">
          </div>
        </div>
      `;
    }

    return `
      <div class="bg-white p-4 rounded-2xl border border-emerald-300 shadow-md space-y-3">
        <!-- FICHA RESUMEN DEL ANIMAL EN LA MANGA -->
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div class="flex items-center gap-3">
            <span class="text-base sm:text-lg font-mono font-black bg-slate-900 text-white px-3 py-1 rounded-xl">
              Tag: ${tag}
            </span>
            <div>
              <div class="flex items-center gap-2">
                <span class="font-bold text-slate-900 text-sm">${a.nombreAlias || a.nombre || 'Sin Alias'}</span>
                <span class="text-xs text-slate-500">• ${a.raza}</span>
                <span class="text-xs text-slate-500">• ${a.categoria}</span>
              </div>
              <div class="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                <span class="px-2 py-0.2 rounded text-[10px] font-bold ${especie === 'bufalino' ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-900'}">
                  ${especie === 'bufalino' ? '🦬 Especie Bufalina' : '🐂 Especie Vacuna'}
                </span>
                <span>Lote: <strong>${a.lote}</strong></span>
                <span>Estado: <strong>${a.estadoReproductivo || 'Vacía'}</strong> ${a.estadoReproductivo === 'Preñada' ? `(${a.diasGestacionActual || 0} d preñez)` : ''}</span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2">
            ${this.onExtraerAnimal ? `
              <button id="btn-manga-extraer-animal" class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-1 cursor-pointer" title="Extraer animal por venta o muerte">
                <span>🚪</span> Extraer Animal
              </button>
            ` : ''}
            <button id="btn-cerrar-animal-manga" class="text-slate-400 hover:text-slate-600 text-xs font-bold p-1 cursor-pointer">
              ✕ Cancelar
            </button>
          </div>
        </div>

        <!-- INPUTS ESPECÍFICOS DEL MÓDULO -->
        ${inputsModulo}

        <!-- FEEDBACK DE IA EN TIEMPO REAL -->
        <div id="alerta-ia-manga" class="empty:hidden"></div>

        <!-- BOTÓN DE CONFIRMACIÓN -->
        <div class="flex justify-end pt-1">
          <button id="btn-agregar-a-sesion" class="w-full sm:w-auto px-6 py-3.5 sm:py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm rounded-xl shadow-lg transition flex items-center justify-center gap-2 active:scale-95 cursor-pointer">
            <span>➕</span> Añadir Registro a la Sesión (Enter)
          </button>
        </div>
      </div>
    `;
  }

  renderFormularioIngreso() {
    const cont = this.container.querySelector('#contenedor-formulario-animal');
    if (cont) {
      cont.innerHTML = this.obtenerHtmlFormularioIngreso();
    }
    this.attachEventsFormulario();
  }

  attachEventsFormulario() {
    const a = this.animalSeleccionado;
    if (!a) return;

    // Cálculo dinámico de GDP en vivo mientras escribe peso o cambia fecha
    const inputPeso = this.container.querySelector('#form-nuevo-peso');
    const inputFechaPeso = this.container.querySelector('#form-peso-fecha');
    const gdpIndicador = this.container.querySelector('#live-gdp-indicator');
    const alertaIa = this.container.querySelector('#alerta-ia-manga');

    const recalcularLiveGDP = () => {
      const pNum = parseFloat(inputPeso?.value);
      const fPes = inputFechaPeso?.value || this.fechaJornada || new Date().toISOString().split('T')[0];

      if (!isNaN(pNum) && pNum > 0) {
        const res = calcularGDPEjemplar({ animal: a, pesoActual: pNum, fechaPesaje: fPes });
        if (res && res.gdp !== null) {
          let color = 'text-emerald-700 font-bold';
          if (res.gdp < 300) color = 'text-rose-600 font-black';
          else if (res.gdp < 600) color = 'text-amber-600 font-bold';

          const detalleOrigen = res.origen === 'nacimiento'
            ? `🌱 Desde nacimiento (${res.dias} días de vida, peso base ${res.pesoBase || 0} kg)`
            : `⚖️ En ${res.dias} días contra pesaje anterior de ${res.pesoBase} kg`;

          gdpIndicador.innerHTML = `GDP (${fPes}): <span class="${color}">${res.gdp > 0 ? '+' : ''}${res.gdp} g/día</span> <span class="text-[10px] text-slate-500 block">${detalleOrigen}</span>`;
        } else {
          gdpIndicador.innerHTML = `<span class="text-[10px] text-slate-400">Sin antecedentes para calcular GDP (registre fecha nacimiento o pesaje previo)</span>`;
        }
      } else {
        gdpIndicador.innerHTML = '';
      }

      // Auditar IA
      if (inputPeso && alertaIa) {
        const errs = auditarPesajeInput(a, inputPeso.value, fPes, a.ultimoPesoKg ? [{ peso: a.ultimoPesoKg, fecha: a.fechaUltimoPesaje }] : []);
        if (errs.length > 0) {
          const e = errs[0];
          alertaIa.innerHTML = `
            <div class="p-2 rounded-xl text-xs ${e.tipo === 'error' ? 'bg-rose-100 text-rose-800 border border-rose-300 font-bold' : 'bg-amber-100 text-amber-800 border border-amber-300'}">
              ${e.mensaje}
            </div>
          `;
        } else {
          alertaIa.innerHTML = '';
        }
      }
    };

    if (inputPeso) {
      if (typeof inputPeso.focus === 'function') inputPeso.focus();
      inputPeso.addEventListener('input', recalcularLiveGDP);
    }
    if (inputFechaPeso) {
      inputFechaPeso.addEventListener('change', recalcularLiveGDP);
    }

    // Sincronizar fecha de trabajo desde el formulario hacia la jornada general
    const inputsFechaForm = this.container.querySelectorAll('#form-peso-fecha, #form-palp-fecha, #form-leche-fecha, #form-parto-fecha, #form-destete-fecha, #form-extraer-fecha, #form-srv-fecha');
    inputsFechaForm.forEach(inp => {
      inp.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val) {
          this.fechaJornada = val;
          const inHdr = this.container.querySelector('#input-fecha-jornada-manga');
          if (inHdr && inHdr.value !== val) inHdr.value = val;
        }
      });
    });

    // Toggle de campos según motivo de extracción (Venta vs Muerte/Descarte)
    const selectMotivoExtraer = this.container.querySelector('#form-extraer-motivo');
    const colComprador = this.container.querySelector('#col-extraer-comprador');
    const colValor = this.container.querySelector('#col-extraer-valor');
    const colPeso = this.container.querySelector('#col-extraer-peso');
    const colMuerte = this.container.querySelector('#col-extraer-muerte');
    if (selectMotivoExtraer) {
      const actualizarCamposExtraer = () => {
        const esVenta = selectMotivoExtraer.value === 'Venta';
        if (colComprador) {
          if (!colComprador.style) colComprador.style = {};
          colComprador.style.display = esVenta ? 'block' : 'none';
        }
        if (colValor) {
          if (!colValor.style) colValor.style = {};
          colValor.style.display = esVenta ? 'block' : 'none';
        }
        if (colPeso) {
          if (!colPeso.style) colPeso.style = {};
          colPeso.style.display = esVenta ? 'block' : 'none';
        }
        if (colMuerte) {
          if (colMuerte.classList && typeof colMuerte.classList.toggle === 'function') {
            colMuerte.classList.toggle('hidden', esVenta);
          } else {
            if (!colMuerte.style) colMuerte.style = {};
            colMuerte.style.display = esVenta ? 'none' : 'block';
          }
        }
      };
      selectMotivoExtraer.addEventListener('change', actualizarCamposExtraer);
      actualizarCamposExtraer();
    }

    // Botón de extraer animal directamente desde la manga
    const btnExtraerManga = this.container.querySelector('#btn-manga-extraer-animal');
    if (btnExtraerManga) {
      btnExtraerManga.addEventListener('click', () => {
        if (this.onExtraerAnimal) {
          this.onExtraerAnimal(this.animalSeleccionado);
        }
      });
    }

    // Toggle de días de preñez según diagnóstico
    const diagSelect = this.container.querySelector('#form-diagnostico');
    const boxDias = this.container.querySelector('#box-dias-gestacion');
    if (diagSelect && boxDias) {
      diagSelect.addEventListener('change', () => {
        boxDias.style.display = diagSelect.value === 'Preñada' ? 'block' : 'none';
      });
    }

    // Botón agregar a sesión
    const btnAdd = this.container.querySelector('#btn-agregar-a-sesion');
    if (btnAdd) {
      btnAdd.addEventListener('click', () => this.confirmarRegistroActual());
    }

    const btnCerrar = this.container.querySelector('#btn-cerrar-animal-manga');
    if (btnCerrar) {
      btnCerrar.addEventListener('click', () => {
        this.animalSeleccionado = null;
        this.renderFormularioIngreso();
      });
    }

    // Tecla Enter para confirmar
    const contForm = this.container.querySelector('#contenedor-formulario-animal');
    if (contForm) {
      contForm.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.confirmarRegistroActual();
        }
      });
    }
  }

  confirmarRegistroActual() {
    const a = this.animalSeleccionado;
    if (!a) return;

    const hoy = new Date().toISOString().split('T')[0];
    const tag = a.identificacionTag || a.numero;

    // Extraer fecha explícita del formulario según el módulo activo (o usa la fecha de la jornada)
    let fechaEvento = this.fechaJornada || hoy;
    if (this.moduloActivo === 'pesajes') {
      fechaEvento = this.container.querySelector('#form-peso-fecha')?.value || fechaEvento;
    } else if (this.moduloActivo === 'palpaciones') {
      fechaEvento = this.container.querySelector('#form-palp-fecha')?.value || fechaEvento;
    } else if (this.moduloActivo === 'leche') {
      fechaEvento = this.container.querySelector('#form-leche-fecha')?.value || fechaEvento;
    } else if (this.moduloActivo === 'partos') {
      fechaEvento = this.container.querySelector('#form-parto-fecha')?.value || fechaEvento;
    } else if (this.moduloActivo === 'destetes') {
      fechaEvento = this.container.querySelector('#form-destete-fecha')?.value || fechaEvento;
    } else if (this.moduloActivo === 'extracciones') {
      fechaEvento = this.container.querySelector('#form-extraer-fecha')?.value || fechaEvento;
    } else if (this.moduloActivo === 'servicios') {
      fechaEvento = this.container.querySelector('#form-srv-fecha')?.value || fechaEvento;
    }

    // Recordar la fecha seleccionada para los siguientes registros de la jornada
    this.fechaJornada = fechaEvento;

    const registro = {
      animalId: a.id,
      tag,
      especie: a.especie || 'bovino',
      nombre: a.nombreAlias || a.nombre,
      modulo: this.moduloActivo,
      fecha: fechaEvento
    };

    if (this.moduloActivo === 'pesajes') {
      const pInput = this.container.querySelector('#form-nuevo-peso');
      const peso = parseFloat(pInput?.value);
      if (isNaN(peso) || peso <= 0) {
        alert('Ingrese un peso válido.');
        return;
      }
      const pPrev = a.ultimoPesoKg || a.pesoActual || 0;
      const gdpRes = calcularGDPEjemplar({ animal: a, pesoActual: peso, fechaPesaje: fechaEvento });

      registro.pesoNuevo = peso;
      registro.pesoAnterior = pPrev;
      registro.gdp = gdpRes ? gdpRes.gdp : null;
      registro.gdpOrigen = gdpRes ? gdpRes.origen : null;
      registro.gdpDias = gdpRes ? gdpRes.dias : null;
      registro.condicionCorporal = this.container.querySelector('#form-condicion')?.value || '3.5';
      registro.observaciones = (this.container.querySelector('#form-peso-notas')?.value || '').trim();
    } else if (this.moduloActivo === 'palpaciones') {
      const resultado = this.container.querySelector('#form-diagnostico')?.value || 'Preñada';
      const diasG = parseInt(this.container.querySelector('#form-dias-preñez')?.value) || 0;
      registro.resultado = resultado;
      registro.diasGestacion = resultado === 'Preñada' ? diasG : 0;
      registro.estructuraOvario = (this.container.querySelector('#form-estructura-ovario')?.value || '').trim();
    } else if (this.moduloActivo === 'leche') {
      const am = parseFloat(this.container.querySelector('#form-leche-am')?.value) || 0;
      const pm = parseFloat(this.container.querySelector('#form-leche-pm')?.value) || 0;
      registro.litrosManana = am;
      registro.litrosTarde = pm;
      registro.totalLitros = parseFloat((am + pm).toFixed(1));
      registro.notasUbre = (this.container.querySelector('#form-leche-notas')?.value || '').trim();
    } else if (this.moduloActivo === 'partos') {
      registro.fechaParto = fechaEvento;
      registro.sexoCria = this.container.querySelector('#form-parto-sexo')?.value || 'hembra';
      registro.pesoCria = parseFloat(this.container.querySelector('#form-parto-peso')?.value) || 32;
      registro.tagCria = this.container.querySelector('#form-parto-tag-cria')?.value || `CRIA-${tag}`;
      registro.tipoParto = this.container.querySelector('#form-parto-tipo')?.value || 'Normal';
    } else if (this.moduloActivo === 'destetes') {
      const pDestete = parseFloat(this.container.querySelector('#form-destete-peso')?.value) || 0;
      const loteDestino = (this.container.querySelector('#form-destete-lote')?.value || 'Lote Levante').trim();
      const obs = (this.container.querySelector('#form-destete-obs')?.value || '').trim();
      registro.fechaDestete = fechaEvento;
      registro.pesoDestete = pDestete;
      registro.loteDestino = loteDestino;
      registro.observaciones = obs;
    } else if (this.moduloActivo === 'extracciones') {
      const motivo = this.container.querySelector('#form-extraer-motivo')?.value || 'Venta';
      const comprador = (this.container.querySelector('#form-extraer-comprador')?.value || '').trim();
      const valor = parseFloat(this.container.querySelector('#form-extraer-valor')?.value) || 0;
      const pesoSalida = parseFloat(this.container.querySelector('#form-extraer-peso')?.value) || parseFloat(a.ultimoPesoKg || a.pesoActual || 0);
      const causa = (this.container.querySelector('#form-extraer-causa')?.value || '').trim();
      const obs = (this.container.querySelector('#form-extraer-obs')?.value || '').trim();

      registro.fechaExtraccion = fechaEvento;
      registro.tipoExtraccion = motivo;
      registro.motivo = motivo;
      registro.comprador = comprador;
      registro.valorVenta = valor;
      registro.pesoVenta = pesoSalida;
      registro.motivoMuerte = causa;
      registro.observaciones = obs;
    } else if (this.moduloActivo === 'servicios') {
      const tipoSrv = this.container.querySelector('#form-srv-tipo')?.value || 'inseminacion_artificial';
      const reprod = (this.container.querySelector('#form-srv-reproductor')?.value || '').trim() || 'Pajilla / Toro General';
      const tec = (this.container.querySelector('#form-srv-tecnico')?.value || '').trim() || 'Inseminador';
      const proto = (this.container.querySelector('#form-srv-protocolo')?.value || '').trim() || 'IATF';

      registro.fechaServicio = fechaEvento;
      registro.tipoServicio = tipoSrv;
      registro.reproductor = reprod;
      registro.tecnico = tec;
      registro.protocolo = proto;
      registro.resultado = 'Pendiente Chequeo';
    }

    // Agregar al inicio de la sesión
    this.registrosSesion.unshift(registro);

    // Limpiar selección y preparar para el siguiente
    this.animalSeleccionado = null;
    this.render();

    // Enfocar input de búsqueda de nuevo
    setTimeout(() => {
      const inTag = this.container.querySelector('#input-tag-manga');
      if (inTag && typeof inTag.focus === 'function') inTag.focus();
    }, 50);
  }

  renderResumenMedicion(r) {
    if (r.modulo === 'pesajes') {
      const txtGdp = r.gdp !== null ? ` • GDP: ${r.gdp > 0 ? '+' : ''}${r.gdp} g/d` : '';
      return `Nuevo Peso: <strong>${r.pesoNuevo} kg</strong> (Previo: ${r.pesoAnterior || 0} kg) • CC: ${r.condicionCorporal}${txtGdp}`;
    } else if (r.modulo === 'palpaciones') {
      return `Diagnóstico: <strong>${r.resultado}</strong> ${r.resultado === 'Preñada' ? `(${r.diasGestacion} días de preñez)` : ''}`;
    } else if (r.modulo === 'destetes') {
      return `Destete: Peso <strong>${r.pesoDestete || 0} kg</strong> • Lote: <strong>${r.loteDestino || 'Levante'}</strong>`;
    } else if (r.modulo === 'extracciones') {
      if (r.tipoExtraccion === 'Venta') {
        return `Extracción: <strong>Venta</strong> a <strong>${r.comprador || 'Comprador'}</strong> • $${(r.valorVenta || 0).toLocaleString('es-CO')} (${r.pesoVenta || 0} kg)`;
      } else {
        return `Extracción: <strong>${r.tipoExtraccion || 'Baja'}</strong> • Causa: <strong>${r.motivoMuerte || 'No especificada'}</strong>`;
      }
    } else if (r.modulo === 'servicios') {
      const nomTipo = r.tipoServicio === 'transferencia_embriones' ? '🔬 TE' : (r.tipoServicio === 'monta_natural' ? '🐂 Monta' : '💉 IA');
      return `Servicio: <strong>${nomTipo}</strong> • Toro/Pajilla: <strong>${r.reproductor}</strong> • Téc: ${r.tecnico} (${r.protocolo})`;
    } else if (r.modulo === 'leche') {
      return `Producción: <strong>${r.totalLitros} Litros</strong> (Mañana: ${r.litrosManana}L, Tarde: ${r.litrosTarde}L)`;
    } else if (r.modulo === 'partos') {
      return `Parto: <strong>Cría ${r.tagCria}</strong> (${r.sexoCria === 'hembra' ? '♀️ Hembra' : '♂️ Macho'}, ${r.pesoCria} kg)`;
    }
    return '';
  }

  renderBadgeMedicion(r) {
    if (r.modulo === 'pesajes') {
      if (r.gdp !== null) {
        let b = 'bg-emerald-100 text-emerald-800';
        if (r.gdp < 300) b = 'bg-rose-100 text-rose-800 font-bold';
        else if (r.gdp < 600) b = 'bg-amber-100 text-amber-800';
        return `<span class="px-2 py-0.5 rounded-full text-xs ${b}">${r.gdp > 0 ? '+' : ''}${r.gdp} g/d</span>`;
      }
      return '<span class="text-slate-400 text-xs">Pesaje</span>';
    } else if (r.modulo === 'palpaciones') {
      return `<span class="px-2 py-0.5 rounded-full text-xs font-bold ${r.resultado === 'Preñada' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">${r.resultado}</span>`;
    } else if (r.modulo === 'destetes') {
      return `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">🌾 Destetado</span>`;
    } else if (r.modulo === 'extracciones') {
      if (r.tipoExtraccion === 'Venta') {
        return `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">💰 Venta</span>`;
      } else {
        return `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">☠️ ${r.tipoExtraccion || 'Baja'}</span>`;
      }
    } else if (r.modulo === 'servicios') {
      return `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">🧬 Servida</span>`;
    } else if (r.modulo === 'leche') {
      return `<span class="px-2 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800">${r.totalLitros} L/d</span>`;
    } else if (r.modulo === 'partos') {
      return `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">Cría Registrada</span>`;
    }
    return '';
  }

  guardarSesionCompleta() {
    if (this.registrosSesion.length === 0) return;
    if (this.onGuardarRegistros) {
      this.onGuardarRegistros({
        modulo: this.moduloActivo,
        registros: this.registrosSesion
      });
      this.registrosSesion = [];
      this.render();
    }
  }

  attachEvents() {
    // Sincronizador de fecha de trabajo (sólo la cabecera superior)
    const inFechaJornada = this.container.querySelector('#input-fecha-jornada-manga');

    const sincronizarFecha = (nuevaFecha) => {
      if (!nuevaFecha) return;
      this.fechaJornada = nuevaFecha;
      if (inFechaJornada && inFechaJornada.value !== nuevaFecha) inFechaJornada.value = nuevaFecha;

      const formDateInputs = this.container.querySelectorAll('#form-peso-fecha, #form-palp-fecha, #form-leche-fecha, #form-parto-fecha, #form-destete-fecha, #form-extraer-fecha, #form-srv-fecha');
      formDateInputs.forEach(inp => {
        if (inp.value !== nuevaFecha) {
          inp.value = nuevaFecha;
          inp.dispatchEvent(new Event('change'));
        }
      });
    };

    if (inFechaJornada) {
      inFechaJornada.addEventListener('change', (e) => sincronizarFecha(e.target.value));
    }

    // Botón para aplicar fecha activa a todos los registros de la sesión actual
    const btnAplicarFechaSesion = this.container.querySelector('#btn-aplicar-fecha-sesion');
    if (btnAplicarFechaSesion) {
      btnAplicarFechaSesion.addEventListener('click', () => {
        if (this.registrosSesion.length === 0) return;
        const fechaActiva = this.fechaJornada || new Date().toISOString().split('T')[0];
        this.registrosSesion.forEach(reg => {
          reg.fecha = fechaActiva;
          if (reg.modulo === 'partos') reg.fechaParto = fechaActiva;
          if (reg.modulo === 'destetes') reg.fechaDestete = fechaActiva;
          if (reg.modulo === 'extracciones') reg.fechaExtraccion = fechaActiva;
          if (reg.modulo === 'servicios') reg.fechaServicio = fechaActiva;
          if (reg.modulo === 'pesajes' && reg.pesoNuevo) {
            const a = this.getAnimales ? this.getAnimales().find(item => item.id === reg.animalId || item.identificacionTag === reg.tag) : null;
            if (a) {
              const gdpRes = calcularGDPEjemplar({ animal: a, pesoActual: reg.pesoNuevo, fechaPesaje: fechaActiva });
              if (gdpRes) {
                reg.gdp = gdpRes.gdp;
                reg.gdpOrigen = gdpRes.origen;
                reg.gdpDias = gdpRes.dias;
              }
            }
          }
        });
        this.render();
        alert(`Se actualizó la fecha de trabajo de todos los ${this.registrosSesion.length} registros a ${fechaActiva}.`);
      });
    }

    // Cambio de módulo
    this.container.querySelectorAll('.btn-grid-mod').forEach((btn) => {
      btn.addEventListener('click', (e) => this.setModulo(e.currentTarget.getAttribute('data-mod')));
    });

    // Búsqueda en manga
    const inTag = this.container.querySelector('#input-tag-manga');
    const btnBuscar = this.container.querySelector('#btn-buscar-manga');

    const dispararBusqueda = () => {
      const val = inTag?.value;
      if (!val) return;
      const encontrado = this.buscarAnimalPorTag(val);
      if (encontrado) {
        if (encontrado._estaEnOtraFinca && this.onTrasladarAFinca) {
          const confirmar = confirm(`El animal "${val}" se encuentra registrado en "${encontrado._fincaNombre || 'otra finca'}".\n\n¿Deseas trasladarlo inmediatamente a esta finca de trabajo?`);
          if (confirmar) {
            this.onTrasladarAFinca(encontrado);
          }
        } else if (encontrado._estaExtraido && this.onReactivarAnimal) {
          const confirmar = confirm(`El animal "${val}" se encuentra actualmente EXTRAÍDO (${encontrado._motivoExtraido || 'Baja'}).\n\n¿Deseas reactivarlo e ingresarlo nuevamente al hato de esta finca?`);
          if (confirmar) {
            this.onReactivarAnimal(encontrado);
          }
        }
        this.seleccionarAnimal(val);
      } else {
        const crear = confirm(`El animal "${val}" no existe en el inventario. ¿Deseas cargarlo para crearlo automáticamente en este lote?`);
        if (crear) {
          this.animalSeleccionado = {
            identificacionTag: val.trim().toUpperCase(),
            especie: 'bovino',
            raza: 'Cruzada',
            sexo: 'hembra',
            categoria: 'Vaca de Ordeño',
            lote: this.loteFiltro !== 'todos' ? this.loteFiltro : 'General',
            ultimoPesoKg: 0,
            estadoReproductivo: 'Vacía'
          };
          this.renderFormularioIngreso();
        }
      }
    };

    if (btnBuscar) btnBuscar.addEventListener('click', dispararBusqueda);
    if (inTag) {
      conectarAutosuggestAnimales({
        inputElement: inTag,
        getAnimales: () => this.getAnimales ? this.getAnimales() : [],
        onSeleccionar: (animal) => {
          this.seleccionarAnimal(animal.identificacionTag);
        },
        onTrasladarAFinca: (animal) => {
          if (this.onTrasladarAFinca) this.onTrasladarAFinca(animal);
        },
        onReactivarAnimal: (animal) => {
          if (this.onReactivarAnimal) this.onReactivarAnimal(animal);
        },
        theme: 'emerald'
      });

      inTag.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          dispararBusqueda();
        }
      });
    }

    // Botones de sesión
    const btnSave = this.container.querySelector('#btn-guardar-sesion');
    if (btnSave) btnSave.addEventListener('click', () => this.guardarSesionCompleta());

    const btnClear = this.container.querySelector('#btn-limpiar-sesion');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (confirm('¿Limpiar los registros de la sesión actual no guardados?')) {
          this.registrosSesion = [];
          this.render();
        }
      });
    }

    // Borrar fila de sesión
    this.container.querySelectorAll('button[data-action="delete-sesion-row"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-idx'));
        this.registrosSesion.splice(idx, 1);
        this.render();
      });
    });
  }
}
