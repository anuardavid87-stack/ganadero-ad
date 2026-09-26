/**
 * GANADERO AD - MÓDULO DE TRASLADO DE ANIMALES ENTRE FINCAS
 * Flujo en manga uno a uno: selección superior de finca origen y destino,
 * cuadro para buscar el animal y acumularlo en la planilla, y botón final para guardar.
 */

import { conectarAutosuggestAnimales } from '../ui/AutosuggestAnimales.js';

export class ModuloTraslados {
  constructor({
    containerId = 'pantalla-traslados',
    getFincas,
    getFincaActiva,
    getAnimales,
    getTraslados,
    getRol,
    onEjecutarTraslado,
    onRevertirTraslado,
    onVerFicha
  }) {
    this.containerId = containerId;
    this.container = typeof document !== 'undefined' ? document.getElementById(containerId) : null;
    this.getFincas = getFincas;
    this.getFincaActiva = getFincaActiva;
    this.getAnimales = getAnimales;
    this.getTraslados = getTraslados;
    this.getRol = getRol;
    this.onEjecutarTraslado = onEjecutarTraslado;
    this.onRevertirTraslado = onRevertirTraslado;
    this.onVerFicha = onVerFicha;

    this.fincaOrigenId = null;
    this.fincaDestinoId = null;
    this.fechaTraslado = new Date().toISOString().split('T')[0];
    this.motivo = 'Pastoreo y Rotación de Potreros';
    this.loteDestino = 'Lote Traslado';
    this.observaciones = '';

    this.animalesSesion = []; // Lista de animales acumulados en la sesión de manga
    this.vistaSubTab = 'manga'; // 'manga' (Nuevo Traslado) | 'historial' (Historial)
    this.ultimoAnimalCargado = null;
    this.mensajeFeedback = null;
  }

  init() {
    if (typeof document !== 'undefined') {
      this.container = document.getElementById(this.containerId);
    }
    this.render();
  }

  abrirModalTrasladoRapido(animal) {
    if (!animal) return;
    this.vistaSubTab = 'manga';
    this.fincaOrigenId = animal.fincaId;
    if (!this.animalesSesion.some((a) => a.id === animal.id)) {
      this.animalesSesion.push(animal);
      this.ultimoAnimalCargado = animal;
    }
    this.render();
  }

  buscarAnimalPorTag(tag) {
    if (!tag) return null;
    const cleanTag = tag.trim().toUpperCase();
    const animales = (this.getAnimales ? this.getAnimales() : []).filter(
      (a) => a.estadoVida === 'activo' || a.estado === 'activo' || !a.estadoVida
    );
    return animales.find(
      (a) => (a.identificacionTag || a.numero || '').toUpperCase() === cleanTag
    ) || null;
  }

  agregarAnimalATraslado(animal) {
    if (!animal) return;

    // Validar que pertenezca a la Finca Origen
    if (animal.fincaId !== this.fincaOrigenId) {
      const fincas = this.getFincas ? this.getFincas() : [];
      const fActual = fincas.find((f) => f.id === animal.fincaId);
      this.mensajeFeedback = `El animal ${animal.identificacionTag} se encuentra en "${fActual ? fActual.nombre : animal.fincaId}", no en la finca origen seleccionada.`;
      this.render();
      return;
    }

    // Validar que no esté ya en la lista
    if (this.animalesSesion.some((a) => a.id === animal.id)) {
      this.mensajeFeedback = `El animal ${animal.identificacionTag} ya está en la lista de traslado.`;
      this.render();
      return;
    }

    // Agregar exitosamente a la sesión
    this.animalesSesion.unshift(animal);
    this.ultimoAnimalCargado = animal;
    this.mensajeFeedback = null;
    this.render();

    const refoc = this.container.querySelector('#input-tag-traslado-manga');
    if (refoc) {
      refoc.value = '';
      refoc.focus();
    }
  }

  render() {
    if (!this.container && typeof document !== 'undefined') {
      this.container = document.getElementById(this.containerId);
    }
    if (!this.container) return;

    const fincas = this.getFincas ? this.getFincas() : [];
    const fActiva = this.getFincaActiva ? this.getFincaActiva() : null;

    if (!this.fincaOrigenId) {
      this.fincaOrigenId = fActiva ? fActiva.id : (fincas[0]?.id || null);
    }

    const fincasDestino = fincas.filter((f) => f.id !== this.fincaOrigenId);
    if (!this.fincaDestinoId || this.fincaDestinoId === this.fincaOrigenId) {
      this.fincaDestinoId = fincasDestino[0]?.id || null;
    }

    const todosAnimales = this.getAnimales ? this.getAnimales() : [];
    const animalesEnOrigen = todosAnimales.filter(
      (a) => a.fincaId === this.fincaOrigenId && (a.estadoVida === 'activo' || !a.estadoVida)
    );

    const traslados = this.getTraslados ? this.getTraslados() : [];
    const rol = this.getRol ? this.getRol() : 'administrador';
    const esSoloConsulta = rol === 'consulta' || rol === 'consultor';

    const fOrigenObj = fincas.find((f) => f.id === this.fincaOrigenId);
    const fDestinoObj = fincas.find((f) => f.id === this.fincaDestinoId);
    const lotesOrigen = [...new Set(animalesEnOrigen.map((a) => a.lote || 'General'))].filter(Boolean);

    this.container.innerHTML = `
      <div class="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <!-- CABECERA PRINCIPAL SUPERIOR (ESTILO CUADRICULA MASIVA) -->
        <div class="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white p-4 sm:p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-2xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center text-2xl shadow-inner">
              🚚
            </div>
            <div>
              <h2 class="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                <span>Módulo de Traslado de Animales</span>
                <span class="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-400/30">
                  Modo Manga / Planilla
                </span>
              </h2>
              <p class="text-xs text-slate-400 mt-0.5">Selecciona origen y destino, busca el animal para sumarlo a la lista y confirma el traslado.</p>
            </div>
          </div>

          <!-- BOTONES DE PESTAÑAS (PLANILLA DE TRASLADO / HISTORIAL) -->
          <div class="flex items-center gap-1.5 bg-slate-800 p-1.5 rounded-xl border border-slate-700 w-full md:w-auto">
            <button id="btn-subtab-manga" class="flex-1 md:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${this.vistaSubTab === 'manga' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'}">
              <span>📋</span> Planilla de Traslado
            </button>
            <button id="btn-subtab-historial" class="flex-1 md:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${this.vistaSubTab === 'historial' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'}">
              <span>🕒</span> Historial (${traslados.length})
            </button>
          </div>
        </div>

        ${this.vistaSubTab === 'manga' ? `
          <!-- PARTE SUPERIOR: SELECCIÓN DE FINCA ORIGEN Y DESTINO + PARÁMETROS -->
          <div class="p-4 sm:p-5 bg-slate-50 border-b border-slate-200">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <!-- FINCA ORIGEN -->
              <div class="bg-white p-3 rounded-xl border border-slate-300 shadow-sm space-y-1">
                <label class="block font-black text-slate-800 uppercase tracking-wider text-[10px] flex items-center gap-1">
                  <span>🏡</span> Finca de Origen (Emisora) *:
                </label>
                <select id="sel-finca-origen-traslado" class="w-full px-2.5 py-2 bg-slate-50 font-bold text-slate-900 rounded-lg border border-slate-300 outline-none focus:border-purple-600 cursor-pointer">
                  ${fincas.map((f) => `<option value="${f.id}" ${f.id === this.fincaOrigenId ? 'selected' : ''}>${f.nombre}</option>`).join('')}
                </select>
                <div class="text-[10px] text-slate-500 flex justify-between">
                  <span>Predio de salida</span>
                  <span class="font-bold text-purple-700">${animalesEnOrigen.length} disponibles</span>
                </div>
              </div>

              <!-- FINCA DESTINO -->
              <div class="bg-white p-3 rounded-xl border border-purple-300 shadow-sm space-y-1">
                <label class="block font-black text-purple-900 uppercase tracking-wider text-[10px] flex items-center gap-1">
                  <span>🏁</span> Finca de Destino (Receptora) *:
                </label>
                ${fincasDestino.length > 0 ? `
                  <select id="sel-finca-destino-traslado" class="w-full px-2.5 py-2 bg-purple-50/50 font-bold text-purple-950 rounded-lg border border-purple-300 outline-none focus:border-purple-600 cursor-pointer">
                    ${fincasDestino.map((f) => `<option value="${f.id}" ${f.id === this.fincaDestinoId ? 'selected' : ''}>${f.nombre}</option>`).join('')}
                  </select>
                ` : `
                  <div class="p-2 bg-amber-50 text-amber-900 font-bold rounded-lg text-[11px] border border-amber-200">
                    Se requieren 2 fincas registradas
                  </div>
                `}
                <div class="text-[10px] text-purple-700">Predio de llegada de los animales</div>
              </div>

              <!-- FECHA Y MOTIVO -->
              <div class="bg-white p-3 rounded-xl border border-slate-300 shadow-sm space-y-1">
                <label class="block font-bold text-slate-700 text-[10px] uppercase">📅 Fecha y Motivo:</label>
                <input type="date" id="input-fecha-traslado" value="${this.fechaTraslado}" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold text-xs outline-none focus:border-purple-600 mb-1">
                <select id="sel-motivo-traslado" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold text-xs bg-slate-50 outline-none cursor-pointer">
                  <option value="Pastoreo y Rotación de Potreros" ${this.motivo === 'Pastoreo y Rotación de Potreros' ? 'selected' : ''}>Pastoreo y Rotación</option>
                  <option value="Ceba y Engorde" ${this.motivo === 'Ceba y Engorde' ? 'selected' : ''}>Ceba y Engorde</option>
                  <option value="Reproducción y Monta" ${this.motivo === 'Reproducción y Monta' ? 'selected' : ''}>Reproducción / Monta</option>
                  <option value="Producción de Leche" ${this.motivo === 'Producción de Leche' ? 'selected' : ''}>Producción de Leche</option>
                  <option value="Cuarentena y Sanidad" ${this.motivo === 'Cuarentena y Sanidad' ? 'selected' : ''}>Cuarentena / Sanidad</option>
                  <option value="Transferencia Interna" ${this.motivo === 'Transferencia Interna' ? 'selected' : ''}>Transferencia Interna</option>
                </select>
              </div>

              <!-- LOTE EN DESTINO Y GUÍA -->
              <div class="bg-white p-3 rounded-xl border border-slate-300 shadow-sm space-y-1">
                <label class="block font-bold text-slate-700 text-[10px] uppercase">🏷️ Lote en Destino & Notas:</label>
                <input type="text" id="input-lote-destino-traslado" value="${this.loteDestino}" placeholder="Ej. Lote Ceba 1" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold text-xs outline-none focus:border-purple-600 mb-1">
                <input type="text" id="input-obs-traslado" value="${this.observaciones}" placeholder="Guía ICA / Conductor / Camión" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs outline-none">
              </div>
            </div>
          </div>

          <!-- SECCIÓN DE BÚSQUEDA Y CAPTURA UNO A UNO EN MANGA -->
          <div class="p-4 sm:p-5 bg-emerald-50/40 border-b border-emerald-100">
            <div class="max-w-3xl mx-auto space-y-3">
              <form id="form-buscar-traslado-manga" class="flex flex-col sm:flex-row items-center gap-3">
                <div class="relative w-full">
                  <span class="absolute left-3.5 top-3.5 text-slate-400 text-sm">🔍</span>
                  <input 
                    type="text" 
                    id="input-tag-traslado-manga" 
                    list="datalist-animales-traslado-origen"
                    placeholder="Digite o escanee No. de animal en ${fOrigenObj ? fOrigenObj.nombre : 'finca origen'} (Ej. BV-401, 102)..." 
                    class="w-full pl-10 pr-4 py-3 bg-white text-slate-900 font-mono font-black text-base rounded-xl border-2 border-purple-500 focus:ring-4 focus:ring-purple-500/20 outline-none uppercase shadow-sm"
                    autocomplete="off"
                  >
                  <datalist id="datalist-animales-traslado-origen">
                    ${animalesEnOrigen.map((a) => `<option value="${a.identificacionTag || a.numero}">${a.nombreAlias ? a.nombreAlias + ' - ' : ''}${a.raza || ''} (Lote: ${a.lote || 'Sin Lote'})</option>`).join('')}
                  </datalist>
                </div>
                <button 
                  type="submit" 
                  id="btn-agregar-traslado-manga" 
                  class="w-full sm:w-auto px-6 py-3 bg-purple-700 hover:bg-purple-600 active:scale-95 text-white font-black text-sm rounded-xl shadow transition whitespace-nowrap flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>➕</span> Agregar a la Lista
                </button>
              </form>

              <!-- FEEDBACK RÁPIDO / ANIMAL RECIÉN AGREGADO -->
              ${this.ultimoAnimalCargado ? `
                <div class="p-3 bg-purple-100/70 border border-purple-300 rounded-xl flex items-center justify-between text-xs text-purple-950 animate-fadeIn">
                  <div class="flex items-center gap-2">
                    <span class="text-base">${(this.ultimoAnimalCargado.especie || '').toLowerCase() === 'bufalino' ? '🦬' : '🐂'}</span>
                    <span class="font-mono font-black text-sm text-purple-900">${this.ultimoAnimalCargado.identificacionTag}</span>
                    <span class="font-bold">${this.ultimoAnimalCargado.nombreAlias || 'Sin Alias'}</span>
                    <span class="text-slate-600 font-mono">(${this.ultimoAnimalCargado.raza || 'Común'})</span>
                    <span class="bg-purple-200 text-purple-800 px-2 py-0.5 rounded text-[10px] font-bold">Lote: ${this.ultimoAnimalCargado.lote || 'General'}</span>
                  </div>
                  <span class="text-emerald-700 font-bold text-[11px]">✓ En lista de traslado</span>
                </div>
              ` : ''}

              ${this.mensajeFeedback ? `
                <div class="p-2.5 bg-amber-100 border border-amber-300 text-amber-900 rounded-xl text-xs font-bold flex items-center justify-between">
                  <span>⚠️ ${this.mensajeFeedback}</span>
                  <button type="button" id="btn-cerrar-feedback" class="text-amber-700 font-bold hover:text-amber-900 cursor-pointer">✕</button>
                </div>
              ` : ''}

              <!-- BOTÓN OPCIONAL: AGREGAR TODO UN LOTE -->
              ${lotesOrigen.length > 0 ? `
                <div class="flex items-center justify-between pt-1 text-xs text-slate-500">
                  <span>O agrega los animales de un lote completo:</span>
                  <div class="flex items-center gap-2">
                    <select id="sel-lote-completo-traslado" class="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 outline-none">
                      ${lotesOrigen.map((l) => `<option value="${l}">Lote ${l}</option>`).join('')}
                    </select>
                    <button type="button" id="btn-agregar-lote-completo" class="px-3 py-1 bg-slate-200 hover:bg-slate-300 font-bold text-slate-800 rounded-lg text-xs transition cursor-pointer">
                      + Agregar Lote
                    </button>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- LISTA DE REGISTROS DE LA PLANILLA ACUMULADA -->
          <div class="p-4 sm:p-5">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
              <h3 class="font-black text-slate-900 text-sm flex items-center gap-2">
                <span>📝</span> Animales Listados para Traslado
                <span class="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                  ${this.animalesSesion.length} Animales en Lista
                </span>
                <span class="text-xs text-slate-500 font-normal">
                  (${fOrigenObj ? fOrigenObj.nombre : 'Origen'} ➔ ${fDestinoObj ? fDestinoObj.nombre : 'Destino'})
                </span>
              </h3>

              <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button id="btn-limpiar-lista-traslado" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs transition cursor-pointer ${this.animalesSesion.length === 0 ? 'hidden' : ''}">
                  Limpiar Lista
                </button>
                ${!esSoloConsulta ? `
                  <button id="btn-guardar-traslado-sesion" class="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs shadow-lg transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer ${this.animalesSesion.length === 0 || fincasDestino.length === 0 ? 'opacity-50 pointer-events-none' : ''}">
                    <span>💾</span> Confirmar y Guardar Traslado (${this.animalesSesion.length})
                  </button>
                ` : `
                  <span class="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-xl text-xs font-bold">Modo Consulta</span>
                `}
              </div>
            </div>

            <!-- TABLA DESKTOP -->
            <div class="hidden md:block overflow-x-auto border border-slate-200 rounded-xl shadow-sm">
              <table class="w-full text-left text-xs border-collapse">
                <thead class="bg-slate-100 uppercase font-bold text-slate-700 text-[10px] border-b border-slate-200">
                  <tr>
                    <th class="p-3 w-10 text-center">#</th>
                    <th class="p-3">Tag / Arete</th>
                    <th class="p-3">Nombre & Raza</th>
                    <th class="p-3">Categoría</th>
                    <th class="p-3">Lote Origen ➔ Lote Destino</th>
                    <th class="p-3 text-right">Peso Actual</th>
                    <th class="p-3 w-12 text-center">✕</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${this.animalesSesion.length > 0 ? this.animalesSesion.map((a, idx) => {
                    const esBufalo = (a.especie || 'bovino').toLowerCase() === 'bufalino';
                    return `
                      <tr class="hover:bg-slate-50 transition">
                        <td class="p-3 text-center font-mono text-slate-400 font-bold">${idx + 1}</td>
                        <td class="p-3">
                          <div class="flex items-center gap-2">
                            <span>${esBufalo ? '🦬' : '🐂'}</span>
                            <span class="font-black font-mono text-slate-900 text-sm">${a.identificacionTag || a.numero}</span>
                          </div>
                        </td>
                        <td class="p-3">
                          <div class="font-bold text-slate-800">${a.nombreAlias || a.nombre || 'Sin Alias'}</div>
                          <div class="text-[10px] text-slate-500">${a.raza || 'Común'}</div>
                        </td>
                        <td class="p-3 font-semibold text-slate-700">${a.categoria || 'General'}</td>
                        <td class="p-3">
                          <span class="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-bold">${a.lote || 'General'}</span>
                          <span class="text-purple-600 font-bold mx-1">➔</span>
                          <span class="px-2 py-0.5 bg-purple-100 text-purple-900 rounded text-[10px] font-bold">${this.loteDestino || a.lote || 'General'}</span>
                        </td>
                        <td class="p-3 text-right font-black font-mono text-slate-800">
                          ${a.ultimoPesoKg || a.pesoActual ? `${a.ultimoPesoKg || a.pesoActual} kg` : '-'}
                        </td>
                        <td class="p-3 text-center">
                          <button data-action="quitar-animal-traslado" data-idx="${idx}" class="text-slate-400 hover:text-rose-600 font-black transition p-1.5 hover:bg-rose-50 rounded-lg cursor-pointer" title="Quitar de la lista de traslado">
                            ✕
                          </button>
                        </td>
                      </tr>
                    `;
                  }).join('') : `
                    <tr>
                      <td colspan="7" class="p-10 text-center text-slate-400">
                        <span class="text-3xl block mb-2">🎯</span>
                        <div class="font-bold text-slate-600 text-sm">No hay animales en la lista de traslado.</div>
                        <p class="text-xs mt-1">Digita o escanea el número de arete arriba en el cuadro de búsqueda para agregarlo a esta planilla.</p>
                      </td>
                    </tr>
                  `}
                </tbody>
              </table>
            </div>

            <!-- TARJETAS MÓVILES (CELULARES) -->
            <div class="md:hidden space-y-2 mt-3">
              ${this.animalesSesion.length > 0 ? this.animalesSesion.map((a, idx) => {
                const esBufalo = (a.especie || 'bovino').toLowerCase() === 'bufalino';
                return `
                  <div class="p-3 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2.5">
                      <span class="text-xl">${esBufalo ? '🦬' : '🐂'}</span>
                      <div>
                        <div class="flex items-center gap-1.5">
                          <span class="font-black font-mono text-slate-900 text-sm">${a.identificacionTag || a.numero}</span>
                          <span class="text-[10px] font-bold text-slate-500">${a.nombreAlias || a.nombre || ''}</span>
                        </div>
                        <div class="text-[10px] text-slate-500 mt-0.5">
                          <span>${a.lote || 'General'} ➔ <strong class="text-purple-700">${this.loteDestino || 'Destino'}</strong></span>
                          ${a.ultimoPesoKg || a.pesoActual ? ` • <strong>${a.ultimoPesoKg || a.pesoActual} kg</strong>` : ''}
                        </div>
                      </div>
                    </div>
                    <button data-action="quitar-animal-traslado" data-idx="${idx}" class="p-2 text-rose-500 hover:bg-rose-50 rounded-xl font-black text-sm active:scale-95 cursor-pointer">
                      ✕
                    </button>
                  </div>
                `;
              }).join('') : `
                <div class="p-6 text-center text-slate-400 bg-white border border-dashed border-slate-200 rounded-2xl">
                  <span class="text-2xl block mb-1">🚚</span>
                  No hay animales en la lista de traslado. Digite aretes arriba para añadirlos.
                </div>
              `}
            </div>
          </div>
        ` : `
          <!-- PESTAÑA: HISTORIAL DE TRASLADOS REALIZADOS -->
          <div class="p-4 sm:p-6 space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="font-black text-slate-900 text-sm flex items-center gap-2">
                <span>📋</span> Historial Cronológico de Movilización
                <span class="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  ${traslados.length} Registros
                </span>
              </h3>
            </div>

            <div class="overflow-x-auto border border-slate-200 rounded-2xl shadow-sm">
              <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 uppercase font-black text-[10px] text-slate-700 border-b border-slate-200">
                  <tr>
                    <th class="p-3">Fecha & Hora</th>
                    <th class="p-3">Arete / Animal</th>
                    <th class="p-3">Finca Origen</th>
                    <th class="p-3">Finca Destino</th>
                    <th class="p-3">Lote Destino</th>
                    <th class="p-3">Motivo</th>
                    <th class="p-3">Responsable</th>
                    ${!esSoloConsulta ? '<th class="p-3 text-center">Acción</th>' : ''}
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${traslados.length > 0 ? traslados.map((t) => `
                    <tr class="hover:bg-slate-50 transition">
                      <td class="p-3 font-mono text-slate-600 whitespace-nowrap">
                        ${t.fecha}
                        <span class="block text-[10px] text-slate-400">${t.hora || ''}</span>
                      </td>
                      <td class="p-3">
                        <div class="font-black font-mono text-slate-900">${t.tag || t.animalTag || t.animalId}</div>
                        ${t.nombreAlias ? `<div class="text-[10px] text-slate-500">${t.nombreAlias}</div>` : ''}
                      </td>
                      <td class="p-3 font-semibold text-slate-700">${t.fincaOrigenNombre || t.fincaOrigenId}</td>
                      <td class="p-3 font-bold text-purple-900">${t.fincaDestinoNombre || t.fincaDestinoId}</td>
                      <td class="p-3 font-mono text-xs text-slate-700">${t.loteNuevo || '-'}</td>
                      <td class="p-3 text-slate-600 font-medium">${t.motivo || 'Rotación'}</td>
                      <td class="p-3 text-slate-500 text-[11px]">${t.responsable || '-'}</td>
                      ${!esSoloConsulta ? `
                        <td class="p-3 text-center">
                          <button class="btn-revertir-traslado-historial text-[10px] font-bold px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg transition cursor-pointer" data-id="${t.id}" title="Revertir y devolver animal a su finca previa">
                            ↩️ Revertir
                          </button>
                        </td>
                      ` : ''}
                    </tr>
                  `).join('') : `
                    <tr>
                      <td colspan="8" class="p-10 text-center text-slate-400">
                        <span class="text-3xl block mb-2">🚚</span>
                        No hay traslados registrados en el historial todavía.
                      </td>
                    </tr>
                  `}
                </tbody>
              </table>
            </div>
          </div>
        `}
      </div>
    `;

    this.attachEvents();
  }

  attachEvents() {
    if (!this.container) return;

    // Subtabs manga vs historial
    const btnTabManga = this.container.querySelector('#btn-subtab-manga');
    if (btnTabManga) {
      btnTabManga.addEventListener('click', () => {
        this.vistaSubTab = 'manga';
        this.render();
      });
    }

    const btnTabHist = this.container.querySelector('#btn-subtab-historial');
    if (btnTabHist) {
      btnTabHist.addEventListener('click', () => {
        this.vistaSubTab = 'historial';
        this.render();
      });
    }

    // Finca Origen
    const selOrigen = this.container.querySelector('#sel-finca-origen-traslado');
    if (selOrigen) {
      selOrigen.addEventListener('change', (e) => {
        const nuevaOrigen = e.target.value;
        if (nuevaOrigen !== this.fincaOrigenId) {
          this.fincaOrigenId = nuevaOrigen;
          this.animalesSesion = [];
          this.ultimoAnimalCargado = null;
          this.mensajeFeedback = null;
          this.render();
        }
      });
    }

    // Finca Destino
    const selDestino = this.container.querySelector('#sel-finca-destino-traslado');
    if (selDestino) {
      selDestino.addEventListener('change', (e) => {
        this.fincaDestinoId = e.target.value;
      });
    }

    // Fecha
    const inFecha = this.container.querySelector('#input-fecha-traslado');
    if (inFecha) {
      inFecha.addEventListener('change', (e) => {
        this.fechaTraslado = e.target.value;
      });
    }

    // Motivo
    const selMotivo = this.container.querySelector('#sel-motivo-traslado');
    if (selMotivo) {
      selMotivo.addEventListener('change', (e) => {
        this.motivo = e.target.value;
      });
    }

    // Lote Destino
    const inLoteDestino = this.container.querySelector('#input-lote-destino-traslado');
    if (inLoteDestino) {
      inLoteDestino.addEventListener('input', (e) => {
        this.loteDestino = e.target.value;
      });
    }

    // Observaciones
    const inObs = this.container.querySelector('#input-obs-traslado');
    if (inObs) {
      inObs.addEventListener('input', (e) => {
        this.observaciones = e.target.value;
      });
    }

    // Buscador en manga (form submit & autosuggest en vivo)
    const formBusq = this.container.querySelector('#form-buscar-traslado-manga');
    const inTag = this.container.querySelector('#input-tag-traslado-manga');

    if (inTag) {
      conectarAutosuggestAnimales({
        inputElement: inTag,
        getAnimales: () => {
          const todos = this.getAnimales ? this.getAnimales() : [];
          return todos.filter((a) => a.fincaId === this.fincaOrigenId);
        },
        onSeleccionar: (animal) => {
          this.agregarAnimalATraslado(animal);
        },
        theme: 'purple',
        textoVacio: 'Sin animales en finca origen con esos números o letras'
      });
    }

    if (formBusq) {
      formBusq.addEventListener('submit', (e) => {
        e.preventDefault();
        const tag = inTag ? inTag.value.trim() : '';
        if (!tag) return;

        const animal = this.buscarAnimalPorTag(tag);
        if (!animal) {
          this.mensajeFeedback = `No se encontró ningún ejemplar registrado con arete o número "${tag}".`;
          this.render();
          return;
        }

        this.agregarAnimalATraslado(animal);
      });
    }

    // Cerrar feedback
    const btnCerrarFeed = this.container.querySelector('#btn-cerrar-feedback');
    if (btnCerrarFeed) {
      btnCerrarFeed.addEventListener('click', () => {
        this.mensajeFeedback = null;
        this.render();
      });
    }

    // Agregar lote completo
    const btnLoteCompleto = this.container.querySelector('#btn-agregar-lote-completo');
    if (btnLoteCompleto) {
      btnLoteCompleto.addEventListener('click', () => {
        const selLote = this.container.querySelector('#sel-lote-completo-traslado');
        const loteVal = selLote ? selLote.value : null;
        if (!loteVal) return;

        const todosAnimales = this.getAnimales ? this.getAnimales() : [];
        const delLote = todosAnimales.filter(
          (a) => a.fincaId === this.fincaOrigenId &&
                 (a.lote === loteVal) &&
                 !this.animalesSesion.some((item) => item.id === a.id) &&
                 (a.estadoVida === 'activo' || !a.estadoVida)
        );

        if (delLote.length === 0) {
          alert(`Todos los animales del lote "${loteVal}" ya están en la lista o no hay animales activos.`);
          return;
        }

        delLote.forEach((a) => this.animalesSesion.push(a));
        this.mensajeFeedback = null;
        this.render();
      });
    }

    // Quitar animal individual de la planilla
    this.container.querySelectorAll('[data-action="quitar-animal-traslado"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-idx'));
        if (!isNaN(idx)) {
          this.animalesSesion.splice(idx, 1);
          this.render();
        }
      });
    });

    // Limpiar lista
    const btnLimpiar = this.container.querySelector('#btn-limpiar-lista-traslado');
    if (btnLimpiar) {
      btnLimpiar.addEventListener('click', () => {
        if (confirm('¿Deseas limpiar todos los animales de la lista de traslado actual?')) {
          this.animalesSesion = [];
          this.ultimoAnimalCargado = null;
          this.mensajeFeedback = null;
          this.render();
        }
      });
    }

    // Botón Guardar Traslado
    const btnGuardar = this.container.querySelector('#btn-guardar-traslado-sesion');
    if (btnGuardar) {
      btnGuardar.addEventListener('click', () => {
        if (this.animalesSesion.length === 0) {
          alert('Por favor agrega al menos un animal a la lista de traslado.');
          return;
        }
        if (!this.fincaDestinoId || this.fincaDestinoId === this.fincaOrigenId) {
          alert('Por favor selecciona una finca destino válida y diferente al origen.');
          return;
        }

        const fincas = this.getFincas ? this.getFincas() : [];
        const fOrig = fincas.find((f) => f.id === this.fincaOrigenId);
        const fDest = fincas.find((f) => f.id === this.fincaDestinoId);

        const fecha = this.container.querySelector('#input-fecha-traslado')?.value || this.fechaTraslado;
        const motivo = this.container.querySelector('#sel-motivo-traslado')?.value || this.motivo;
        const loteDestino = this.container.querySelector('#input-lote-destino-traslado')?.value || this.loteDestino;
        const obs = this.container.querySelector('#input-obs-traslado')?.value || this.observaciones;

        const conf = confirm(
          `¿Confirmar el traslado de ${this.animalesSesion.length} animales?\n\n` +
          `• Finca Origen: ${fOrig ? fOrig.nombre : this.fincaOrigenId}\n` +
          `• Finca Destino: ${fDest ? fDest.nombre : this.fincaDestinoId}\n` +
          `• Fecha: ${fecha}\n` +
          `• Motivo: ${motivo}\n` +
          `• Lote Destino: ${loteDestino}`
        );
        if (!conf) return;

        if (this.onEjecutarTraslado) {
          const ok = this.onEjecutarTraslado({
            animalIds: this.animalesSesion.map((a) => a.id),
            fincaOrigenId: this.fincaOrigenId,
            fincaDestinoId: this.fincaDestinoId,
            fecha,
            motivo,
            loteDestino,
            observaciones: obs
          });
          if (ok !== false) {
            this.animalesSesion = [];
            this.ultimoAnimalCargado = null;
            this.mensajeFeedback = null;
            this.vistaSubTab = 'historial';
            this.render();
          }
        }
      });
    }

    // Revertir traslado en historial
    this.container.querySelectorAll('.btn-revertir-traslado-historial').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (confirm('¿Deseas revertir este traslado y devolver el ejemplar a su predio original?')) {
          if (this.onRevertirTraslado) this.onRevertirTraslado(id);
          this.render();
        }
      });
    });
  }
}
