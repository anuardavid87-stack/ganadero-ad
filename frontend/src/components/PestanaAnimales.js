/**
 * GANADERO AD - PESTAÑA DEDICADA DE ANIMALES
 * Muestra el inventario completo de la finca con todos sus datos:
 * Tag/Arete, Especie (Vacuno/Bufalino), Nombre/Alias, Sexo, Raza, Categoría, Lote,
 * Padre, Madre, Fecha de Nacimiento, Edad, Estado Reproductivo (con Días de Preñez),
 * Días Abiertos, Último Parto, IEP proyectado, Peso Actual y GDP.
 * Incluye búsqueda en vivo, filtros combinados, modal de "+ Nuevo Animal" y apertura de Ficha Técnica.
 */

import { calcularDiasAbiertos, calcularDEL, calcularIEP, calcularEdadMeses } from '../core/zootecnia.js';
import { conectarAutosuggestAnimales } from '../ui/AutosuggestAnimales.js';

export class PestanaAnimales {
  constructor({
    containerId,
    getAnimales,
    getAnimalesBusqueda,
    getLotes,
    getRol,
    onVerFicha,
    onCrearAnimal,
    onActualizarAnimal,
    onEliminarAnimal,
    onTrasladar,
    onAbrirModuloTraslados,
    onExtraerAnimal,
    onReactivarAnimal,
    onTrasladarAFinca
  }) {
    this.container = typeof document !== 'undefined' && containerId ? document.getElementById(containerId) : null;
    this.getAnimales = getAnimales;
    this.getAnimalesBusqueda = getAnimalesBusqueda;
    this.getLotes = getLotes;
    this.getRol = getRol;
    this.onVerFicha = onVerFicha;
    this.onCrearAnimal = onCrearAnimal;
    this.onActualizarAnimal = onActualizarAnimal;
    this.onEliminarAnimal = onEliminarAnimal;
    this.onTrasladar = onTrasladar;
    this.onAbrirModuloTraslados = onAbrirModuloTraslados;
    this.onExtraerAnimal = onExtraerAnimal;
    this.onReactivarAnimal = onReactivarAnimal;
    this.onTrasladarAFinca = onTrasladarAFinca || onTrasladar;

    this.filtroBusqueda = '';
    this.filtroEspecie = 'todas'; // 'todas' | 'bovino' | 'bufalino'
    this.filtroLote = 'todos';
    this.filtroRepro = 'todos';
    this.filtroSexo = 'todos';
    this.filtroRaza = 'todas';
    this.filtroEstadoVida = 'activos'; // 'activos' | 'vendidos' | 'muertos' | 'todos'

    this.modalNuevoAbierto = false;
    this.animalEditando = null;
  }

  abrirModalEditar(animal) {
    this.animalEditando = animal;
    this.render();
  }

  init() {
    this.render();
  }

  render() {
    if (!this.container) return;

    const rol = this.getRol ? this.getRol() : 'administrador';
    const esSoloConsulta = rol === 'consulta' || rol === 'propietario' || rol === 'consultor';

    const todosAnimales = this.getAnimales ? this.getAnimales() : [];
    const lotes = this.getLotes ? this.getLotes() : [];
    const razas = [...new Set(todosAnimales.map((a) => (a.raza || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

    // Aplicar filtros
    let lista = todosAnimales;
    if (this.filtroEstadoVida === 'activos') {
      lista = lista.filter((a) => a.estadoVida === 'activo' || a.estado === 'activo');
    } else if (this.filtroEstadoVida === 'vendidos') {
      lista = lista.filter((a) => (a.motivoBaja || '').toLowerCase() === 'venta');
    } else if (this.filtroEstadoVida === 'muertos') {
      lista = lista.filter((a) => (a.motivoBaja || '').toLowerCase() === 'muerte');
    }

    if (this.filtroEspecie !== 'todas') {
      lista = lista.filter((a) => (a.especie || 'bovino').toLowerCase() === this.filtroEspecie);
    }

    if (this.filtroLote !== 'todos') {
      lista = lista.filter((a) => (a.lote || 'General') === this.filtroLote);
    }

    if (this.filtroRepro !== 'todos') {
      lista = lista.filter((a) => {
        const est = (a.estadoReproductivo || '').toLowerCase();
        if (this.filtroRepro === 'prenada') return est.includes('prenad') || est.includes('preñad');
        if (this.filtroRepro === 'vacia') return est.includes('vaci') || est.includes('vací');
        if (this.filtroRepro === 'no_aplica') return est.includes('no');
        return true;
      });
    }

    if (this.filtroSexo !== 'todos') {
      lista = lista.filter((a) => (a.sexo || '').toLowerCase() === this.filtroSexo);
    }

    if (this.filtroRaza !== 'todas') {
      const fRaza = this.filtroRaza.toLowerCase();
      lista = lista.filter((a) => {
        const r = (a.raza || '').trim().toLowerCase();
        return r === fRaza || r.includes(fRaza) || fRaza.includes(r);
      });
    }

    if (this.filtroBusqueda.trim().length > 0) {
      const q = this.filtroBusqueda.trim().toLowerCase();
      lista = lista.filter(
        (a) =>
          (a.identificacionTag || a.numero || '').toLowerCase().includes(q) ||
          (a.nombreAlias || a.nombre || '').toLowerCase().includes(q) ||
          (a.padreTag || a.padre || '').toLowerCase().includes(q) ||
          (a.madreTag || a.madre || '').toLowerCase().includes(q) ||
          (a.raza || '').toLowerCase().includes(q)
      );
    }

    this.container.innerHTML = `
      <div class="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <!-- HEADER PESTAÑA -->
        <div class="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white p-4 sm:p-5 space-y-4">
          <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-2xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-2xl shadow-inner">
                🏷️
              </div>
              <div>
                <h2 class="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                  <span>Inventario General de Animales</span>
                  <span id="contador-animales-pestana" class="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-bold">
                    ${lista.length} de ${todosAnimales.length} Ejemplares
                  </span>
                </h2>
                <p class="text-xs text-slate-400 mt-0.5">Listado detallado con genealogía (padre, madre), especie, días de preñez, partos y trazabilidad.</p>
              </div>
            </div>

            <!-- BOTÓN TRASLADAR Y AGREGAR ANIMAL (Oculto en Solo Consulta) -->
            ${!esSoloConsulta ? `
              <div class="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                <button id="btn-abrir-traslados-pestana" class="flex-1 sm:flex-none px-3.5 py-2.5 bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-black text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer" title="Módulo de traslado de animales entre predios">
                  <span>🚚</span> Trasladar
                </button>
                <button id="btn-abrir-modal-nuevo-animal" class="flex-1 sm:flex-none px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer">
                  <span>➕</span> Nuevo Animal
                </button>
              </div>
            ` : `
              <div class="text-[11px] font-bold text-amber-300 bg-amber-950/60 px-3 py-1.5 rounded-xl border border-amber-500/40 flex items-center gap-1.5">
                <span>👁️</span> Modo Consulta: Modificaciones Deshabilitadas
              </div>
            `}
          </div>
        </div>

        <!-- SECCIÓN DE BÚSQUEDA RÁPIDA EXACTA A LA CUADRÍCULA MASIVA -->
        <div class="p-3.5 sm:p-5 bg-emerald-50/50 border-b border-emerald-100">
          <div class="max-w-3xl mx-auto space-y-3">
            <!-- BUSCADOR RÁPIDO DE ARETE CON BOTÓN BUSCAR QUE ABRE FICHA -->
            <form id="form-buscar-animal-directo" class="flex flex-col sm:flex-row items-center gap-2.5 sm:gap-3">
              <div class="relative w-full">
                <span class="absolute left-3.5 top-3.5 text-slate-400 text-sm">🔍</span>
                <input 
                  type="text" 
                  id="input-tag-animal-directo" 
                  placeholder="Digite o escanee No. de animal (Ej. BV-401, 102)..." 
                  value="${this.filtroBusqueda || ''}"
                  class="w-full pl-10 pr-4 py-3 bg-white text-slate-900 font-mono font-black text-base rounded-xl border-2 border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 outline-none uppercase shadow-sm"
                  autocomplete="off"
                >
              </div>
              <button 
                type="submit" 
                id="btn-buscar-animal-directo" 
                class="w-full sm:w-auto px-7 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm rounded-xl shadow transition whitespace-nowrap active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>🔍</span> Buscar
              </button>
            </form>

            <!-- FILTROS COMPLEMENTARIOS Y RESET -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs pt-1 text-slate-600">
              <div class="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2">
                <select id="select-filtro-estado-pestana" class="w-full sm:w-auto px-2 py-2 sm:py-1 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer">
                  <option value="activos" ${this.filtroEstadoVida === 'activos' ? 'selected' : ''}>🟢 Activos (En Hato)</option>
                  <option value="vendidos" ${this.filtroEstadoVida === 'vendidos' ? 'selected' : ''}>💰 Vendidos</option>
                  <option value="muertos" ${this.filtroEstadoVida === 'muertos' ? 'selected' : ''}>☠️ Muertes</option>
                  <option value="todos" ${this.filtroEstadoVida === 'todos' ? 'selected' : ''}>📋 Todos (Histórico)</option>
                </select>
                <select id="select-filtro-especie-pestana" class="w-full sm:w-auto px-2 py-2 sm:py-1 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer">
                  <option value="todas" ${this.filtroEspecie === 'todas' ? 'selected' : ''}>Todas Especies</option>
                  <option value="bovino" ${this.filtroEspecie === 'bovino' ? 'selected' : ''}>🐂 Vacunos</option>
                  <option value="bufalino" ${this.filtroEspecie === 'bufalino' ? 'selected' : ''}>🦬 Bufalinos</option>
                </select>
                <select id="select-filtro-lote-pestana" class="w-full sm:w-auto px-2 py-2 sm:py-1 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer">
                  <option value="todos" ${this.filtroLote === 'todos' ? 'selected' : ''}>Todos Lotes</option>
                  ${lotes.map((l) => `<option value="${l}" ${this.filtroLote === l ? 'selected' : ''}>${l}</option>`).join('')}
                </select>
                <select id="select-filtro-repro-pestana" class="w-full sm:w-auto px-2 py-2 sm:py-1 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer">
                  <option value="todos" ${this.filtroRepro === 'todos' ? 'selected' : ''}>Todos Estados</option>
                  <option value="prenada" ${this.filtroRepro === 'prenada' ? 'selected' : ''}>🟢 Preñadas</option>
                  <option value="vacia" ${this.filtroRepro === 'vacia' ? 'selected' : ''}>⚪ Vacías</option>
                  <option value="no_aplica" ${this.filtroRepro === 'no_aplica' ? 'selected' : ''}>⚪ Machos</option>
                </select>
                <select id="select-filtro-raza-pestana" class="w-full sm:w-auto px-2 py-2 sm:py-1 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer">
                  <option value="todas" ${this.filtroRaza === 'todas' ? 'selected' : ''}>Todas Razas</option>
                  ${razas.map((r) => `<option value="${r}" ${this.filtroRaza.toLowerCase() === r.toLowerCase() ? 'selected' : ''}>🧬 ${r}</option>`).join('')}
                </select>
              </div>

              <div class="flex items-center justify-between sm:justify-end gap-2">
                ${this.filtroBusqueda ? `
                  <button id="btn-limpiar-busqueda-pestana" class="text-xs font-bold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer">
                    ✕ Limpiar ("${this.filtroBusqueda}")
                  </button>
                ` : `
                  <span id="subtexto-contador-pestana" class="text-[11px] text-slate-500 font-medium">Mostrando ${lista.length} ejemplares</span>
                `}
              </div>
            </div>
          </div>
        </div>

        <!-- TABLA DE ANIMALES (DESKTOP) -->
        <div class="hidden md:block overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-100 text-slate-700 uppercase font-black text-[10px] border-b border-slate-200">
              <tr>
                <th class="p-3">Arete / Especie</th>
                <th class="p-3">Nombre & Raza</th>
                <th class="p-3">Categoría & Lote</th>
                <th class="p-3">Padre & Madre (Pedigree)</th>
                <th class="p-3">Nacimiento & Edad</th>
                <th class="p-3">Estado Reproductivo</th>
                <th class="p-3">Último Parto & IEP</th>
                <th class="p-3 text-right">Peso & GDP</th>
                <th class="p-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody id="tbody-animales-pestana" class="divide-y divide-slate-100 font-medium">
              ${lista.length > 0 ? lista.map((a) => this.renderFilaAnimal(a, esSoloConsulta)).join('') : this.renderFilaVacia()}
            </tbody>
          </table>
        </div>

        <!-- LISTADO DE TARJETAS MÓVILES (CELULARES) -->
        <div id="contenedor-tarjetas-mobile" class="md:hidden divide-y divide-slate-100 p-2.5 sm:p-3 space-y-2.5">
          ${lista.length > 0 ? lista.map((a) => this.renderTarjetaAnimalMobile(a, esSoloConsulta)).join('') : this.renderTarjetaVaciaMobile()}
        </div>

        <!-- MODAL "+ NUEVO ANIMAL" -->
        ${this.modalNuevoAbierto ? this.renderModalNuevoAnimal(lotes) : ''}
        <!-- MODAL "✏️ EDITAR ANIMAL" -->
        ${this.animalEditando ? this.renderModalEditarAnimal(lotes) : ''}
      </div>
    `;

    this.attachEvents();
  }

  renderFilaAnimal(a, esSoloConsulta) {
    const tag = a.identificacionTag || a.numero;
    const especie = (a.especie || 'bovino').toLowerCase();
    const esBufalo = especie === 'bufalino';
    const edadMeses = calcularEdadMeses(a.fechaNacimiento);
    const edadAnios = (edadMeses / 12).toFixed(1);

    const fParto = a.fechaUltimoParto || a.ultimoParto;
    const diasAbiertos = calcularDiasAbiertos(fParto, a.estadoReproductivo);
    const iep = calcularIEP(diasAbiertos, especie);
    const estaPrenada = (a.estadoReproductivo || '').toLowerCase().includes('prenad') || (a.estadoReproductivo || '').toLowerCase().includes('preñad');
    const diasG = parseInt(a.diasGestacionActual || a.diasGestacion || 0);

    const esInactivo = (a.estadoVida || a.estado) === 'inactivo' || Boolean(a.motivoBaja);
    const motivoBaja = (a.motivoBaja || '').toLowerCase();

    return `
      <tr class="${esInactivo ? 'opacity-65 bg-slate-50/80 text-slate-500' : 'hover:bg-slate-50'} transition items-center">
        <!-- Arete & Especie -->
        <td class="p-3">
          <div class="flex items-center gap-2">
            <span class="text-lg">${esBufalo ? '🦬' : '🐂'}</span>
            <div>
              <span class="font-black font-mono text-slate-900 text-sm block">${tag}</span>
              <div class="flex items-center gap-1 mt-0.5">
                <span class="text-[9px] font-bold px-1.5 py-0.2 rounded ${esBufalo ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}">
                  ${esBufalo ? 'Bufalino' : 'Vacuno'}
                </span>
                ${esInactivo ? `
                  <span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 border border-rose-200">
                    🚪 ${motivoBaja === 'venta' ? 'Vendido' : (motivoBaja === 'muerte' ? 'Muerto' : 'Extraído')}
                  </span>
                ` : ''}
              </div>
            </div>
          </div>
        </td>

        <!-- Nombre & Raza -->
        <td class="p-3">
          <div class="font-bold text-slate-800">${a.nombreAlias || a.nombre || 'Sin Alias'}</div>
          <div class="text-[10px] text-slate-500">${a.raza || 'Común'} • ${a.sexo === 'hembra' ? '♀️ Hembra' : '♂️ Macho'}</div>
        </td>

        <!-- Categoría & Lote -->
        <td class="p-3">
          <div class="font-bold text-slate-700">${a.categoria || 'Sin Categoría'}</div>
          <span class="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-medium">
            📍 ${a.lote || 'General'}
          </span>
        </td>

        <!-- Genealogía: Padre & Madre -->
        <td class="p-3">
          <div class="text-[11px] font-mono">
            <span class="text-slate-400 font-bold">P:</span> <strong class="text-slate-800">${a.padreTag || a.padre || 'Desc.'}</strong>
          </div>
          <div class="text-[11px] font-mono mt-0.5">
            <span class="text-slate-400 font-bold">M:</span> <strong class="text-slate-800">${a.madreTag || a.madre || 'Desc.'}</strong>
          </div>
        </td>

        <!-- Nacimiento & Edad -->
        <td class="p-3">
          <div class="font-bold text-slate-800">${a.fechaNacimiento || '-'}</div>
          <div class="text-[10px] text-slate-500">${edadMeses > 0 ? `${edadMeses} m (${edadAnios} a)` : 'Sin fecha'}</div>
        </td>

        <!-- Estado Reproductivo & Días de Preñez -->
        <td class="p-3">
          ${estaPrenada ? `
            <div class="inline-flex flex-col">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 w-fit">
                <span>🟢</span> Preñada
              </span>
              <span class="text-xs font-black font-mono text-emerald-700 mt-1">
                ${diasG} Días de Preñez
              </span>
              <span class="text-[9px] text-slate-400">~${Math.round(diasG / 30.4)} meses</span>
            </div>
          ` : `
            <div class="inline-flex flex-col">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${a.estadoReproductivo === 'No Aplica' ? 'bg-slate-100 text-slate-600' : 'bg-rose-100 text-rose-800 border border-rose-200'} w-fit">
                ${a.estadoReproductivo || 'Vacía'}
              </span>
              ${a.sexo === 'hembra' && diasAbiertos > 0 ? `
                <span class="text-[10px] font-mono text-slate-500 mt-0.5">${diasAbiertos} Días Abiertos</span>
              ` : ''}
            </div>
          `}
        </td>

        <!-- Último Parto & IEP -->
        <td class="p-3">
          <div class="font-bold text-slate-800">${fParto || 'Sin partos'}</div>
          <div class="text-[10px] text-slate-500 mt-0.5">
            ${fParto ? `IEP: <strong class="text-slate-700">${iep.dias}d</strong> (${iep.meses}m)` : 'Primeriza'}
          </div>
        </td>

        <!-- Peso Actual & GDP -->
        <td class="p-3 text-right">
          <span class="font-black font-mono text-slate-900 text-sm">
            ${a.ultimoPesoKg || a.pesoActual ? `${a.ultimoPesoKg || a.pesoActual} kg` : '-'}
          </span>
          <div class="text-[10px] font-bold mt-0.5 ${a.gdpPromedioGDia < 300 ? 'text-rose-600' : 'text-emerald-700'}">
            ${a.gdpPromedioGDia !== undefined ? `${a.gdpPromedioGDia} g/d` : '-'}
          </div>
        </td>

        <!-- Acciones -->
        <td class="p-3 text-center">
          <div class="flex items-center justify-center gap-1.5">
            <button class="btn-ver-ficha-animal px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] shadow transition flex items-center gap-1 cursor-pointer" data-id="${a.id}" title="Ver Ficha Zootécnica">
              <span>🔍</span> Ficha
            </button>
            ${esInactivo ? `
              <button class="btn-reactivar-fila-animal px-2 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] shadow-sm transition flex items-center gap-1 cursor-pointer" data-id="${a.id}" data-tag="${tag}" title="Reactivar ejemplar en el hato">
                <span>🔄</span> Reactivar
              </button>
            ` : (!esSoloConsulta ? `
              <button class="btn-extraer-fila-animal px-2 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] shadow-sm transition flex items-center gap-1 cursor-pointer" data-id="${a.id}" data-tag="${tag}" title="Extraer animal por Venta o Muerte">
                <span>🚪</span>
              </button>
              <button class="btn-trasladar-animal px-2 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-[11px] shadow-sm transition flex items-center gap-1 cursor-pointer" data-id="${a.id}" title="Trasladar este animal a otra finca">
                <span>🚚</span>
              </button>
              <button class="btn-editar-animal px-2 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] shadow-sm transition flex items-center gap-1 cursor-pointer" data-id="${a.id}" title="Modificar cualquier dato de este animal">
                <span>✏️</span>
              </button>
              <button class="btn-eliminar-animal p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition cursor-pointer" data-id="${a.id}" data-tag="${tag}" title="Eliminar animal">
                🗑️
              </button>
            ` : '')}
          </div>
        </td>
      </tr>
    `;
  }

  renderFilaVacia() {
    return `
      <tr>
        <td colspan="9" class="p-8 text-center text-slate-400">
          <span class="text-3xl block mb-2">🐄</span>
          No se encontraron animales registrados con los filtros aplicados.
        </td>
      </tr>
    `;
  }

  renderTarjetaAnimalMobile(a, esSoloConsulta) {
    const tag = a.identificacionTag || a.numero;
    const especie = (a.especie || 'bovino').toLowerCase();
    const esBufalo = especie === 'bufalino';
    const edadMeses = calcularEdadMeses(a.fechaNacimiento);
    const edadAnios = (edadMeses / 12).toFixed(1);

    const fParto = a.fechaUltimoParto || a.ultimoParto;
    const diasAbiertos = calcularDiasAbiertos(fParto, a.estadoReproductivo);
    const iep = calcularIEP(diasAbiertos, especie);
    const estaPrenada = (a.estadoReproductivo || '').toLowerCase().includes('prenad') || (a.estadoReproductivo || '').toLowerCase().includes('preñad');
    const diasG = parseInt(a.diasGestacionActual || a.diasGestacion || 0);

    const esInactivo = (a.estadoVida || a.estado) === 'inactivo' || Boolean(a.motivoBaja);
    const motivoBaja = (a.motivoBaja || '').toLowerCase();

    return `
      <div class="card-animal-mobile p-3.5 bg-white border border-slate-200/80 rounded-2xl shadow-sm space-y-2.5 ${esInactivo ? 'opacity-65 bg-slate-50/80 text-slate-500' : ''}">
        <!-- CABECERA DE LA TARJETA: Tag, Nombre, Sexo, Especie, Peso -->
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="text-2xl shrink-0">${esBufalo ? '🦬' : '🐂'}</span>
            <div>
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="font-black font-mono text-slate-950 text-base tracking-tight">${tag}</span>
                <span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${esBufalo ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-900'}">
                  ${esBufalo ? 'Bufalino' : 'Vacuno'}
                </span>
                <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                  ${a.sexo === 'hembra' ? '♀️' : '♂️'}
                </span>
                ${esInactivo ? `
                  <span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                    🚪 ${motivoBaja === 'venta' ? 'Vendido' : (motivoBaja === 'muerte' ? 'Muerto' : 'Extraído')}
                  </span>
                ` : ''}
              </div>
              <h3 class="font-bold text-slate-800 text-sm mt-0.5">${a.nombreAlias || a.nombre || 'Sin Alias'}</h3>
            </div>
          </div>
          <div class="text-right shrink-0">
            <span class="inline-block px-2.5 py-1 rounded-xl text-xs font-mono font-black bg-slate-900 text-white shadow-sm">
              ${a.ultimoPesoKg || a.pesoActual ? `${a.ultimoPesoKg || a.pesoActual} kg` : '-'}
            </span>
            ${a.gdpPromedioGDia !== undefined ? `
              <div class="text-[10px] font-bold mt-0.5 ${a.gdpPromedioGDia < 300 ? 'text-rose-600' : 'text-emerald-700'}">
                ${a.gdpPromedioGDia} g/d
              </div>
            ` : ''}
          </div>
        </div>

        <!-- DETALLES ZOOTÉCNICOS EN GRID DE 2 COLUMNAS -->
        <div class="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
          <div>
            <span class="text-[9px] uppercase font-bold text-slate-400 block">Raza & Lote</span>
            <span class="font-bold text-slate-800 truncate block">${a.raza || 'Común'}</span>
            <span class="text-[10px] text-slate-500 block truncate">${a.categoria || 'General'} • 📍 ${a.lote || 'General'}</span>
          </div>

          <div>
            <span class="text-[9px] uppercase font-bold text-slate-400 block">Reproductivo</span>
            ${estaPrenada ? `
              <span class="inline-flex items-center gap-1 font-black text-emerald-700">
                <span>🟢</span> Preñada (${diasG}d)
              </span>
            ` : `
              <span class="font-bold text-slate-700">
                ${a.estadoReproductivo || 'Vacía'}
              </span>
            `}
            <span class="text-[10px] text-slate-500 block">
              ${fParto ? `Parto: ${fParto}` : `${edadMeses} m`}
            </span>
          </div>
        </div>

        <!-- PEDIGREE COMPACTO -->
        <div class="flex items-center justify-between text-[11px] font-mono text-slate-600 px-1">
          <div><span class="text-slate-400">P:</span> <strong class="text-slate-800">${a.padreTag || a.padre || 'Desc.'}</strong></div>
          <div><span class="text-slate-400">M:</span> <strong class="text-slate-800">${a.madreTag || a.madre || 'Desc.'}</strong></div>
        </div>

        <!-- BOTONES DE ACCIÓN ERGONÓMICOS (TOUCH FRIENDLY) -->
        <div class="flex items-center gap-2 pt-1 border-t border-slate-100">
          <button class="btn-ver-ficha-animal flex-1 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow transition flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer" data-id="${a.id}">
            <span>🔍</span> Ficha
          </button>
          ${esInactivo ? `
            <button class="btn-reactivar-fila-animal flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer" data-id="${a.id}" data-tag="${tag}">
              <span>🔄</span> Reactivar
            </button>
          ` : (!esSoloConsulta ? `
            <button class="btn-extraer-fila-animal p-2.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-xs shadow-sm transition flex items-center justify-center active:scale-95 cursor-pointer" data-id="${a.id}" data-tag="${tag}" title="Extraer">
              <span>🚪</span>
            </button>
            <button class="btn-trasladar-animal p-2.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-800 font-bold text-xs shadow-sm transition flex items-center justify-center active:scale-95 cursor-pointer" data-id="${a.id}" title="Trasladar">
              <span>🚚</span>
            </button>
            <button class="btn-editar-animal p-2.5 rounded-xl bg-blue-100 hover:bg-blue-200 text-blue-800 font-bold text-xs shadow-sm transition flex items-center justify-center active:scale-95 cursor-pointer" data-id="${a.id}" title="Editar">
              <span>✏️</span>
            </button>
            <button class="btn-eliminar-animal p-2.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-xs shadow-sm transition flex items-center justify-center active:scale-95 cursor-pointer" data-id="${a.id}" data-tag="${tag}" title="Eliminar">
              <span>🗑️</span>
            </button>
          ` : '')}
        </div>
      </div>
    `;
  }

  renderTarjetaVaciaMobile() {
    return `
      <div class="p-8 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
        <span class="text-3xl block mb-2">🐄</span>
        No se encontraron animales registrados con los filtros aplicados.
      </div>
    `;
  }

  renderModalNuevoAnimal(lotes) {
    return `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-0 sm:p-5 overflow-y-auto">
        <div class="bg-white rounded-none sm:rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full h-full sm:h-auto sm:max-h-[95vh] flex flex-col modal-fullscreen-mobile">
          <!-- CABECERA MODAL -->
          <div class="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white p-5 flex justify-between items-center">
            <div class="flex items-center gap-3">
              <span class="text-2xl p-2 bg-emerald-600/30 rounded-xl border border-emerald-500/40">➕</span>
              <div>
                <h3 class="text-base font-black tracking-tight">Registrar Nuevo Ejemplar</h3>
                <p class="text-xs text-slate-400">Ingreso individual al inventario con datos genealógicos y reproductivos.</p>
              </div>
            </div>
            <button id="btn-cerrar-modal-nuevo" class="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white transition">
              ✕
            </button>
          </div>

          <!-- FORMULARIO -->
          <form id="form-nuevo-animal" class="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs flex-1">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <!-- Arete -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Número de Arete / Tag *:</label>
                <input type="text" id="nuevo-tag" required placeholder="Ej. BV-650" class="w-full px-3 py-2 font-mono font-bold rounded-xl border border-slate-300 outline-none uppercase focus:border-emerald-500">
              </div>

              <!-- Especie -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Especie *:</label>
                <select id="nuevo-especie" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none bg-white">
                  <option value="bovino">🐂 Vacuno (Bovino)</option>
                  <option value="bufalino">🦬 Bufalino (Búfalo)</option>
                </select>
              </div>

              <!-- Nombre / Alias -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Nombre / Alias:</label>
                <input type="text" id="nuevo-nombre" placeholder="Ej. Princesa" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none">
              </div>

              <!-- Sexo -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Sexo *:</label>
                <select id="nuevo-sexo" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none bg-white">
                  <option value="hembra">♀️ Hembra</option>
                  <option value="macho">♂️ Macho</option>
                </select>
              </div>

              <!-- Raza -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Raza:</label>
                <input type="text" id="nuevo-raza" placeholder="Ej. Brahman Blanco, Gyr, Murrah..." class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none">
              </div>

              <!-- Categoría -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Categoría:</label>
                <select id="nuevo-categoria" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none bg-white">
                  <option value="Vaca de Ordeño">Vaca de Ordeño</option>
                  <option value="Vaca Horra">Vaca Horra / Seca</option>
                  <option value="Novilla de Vientre">Novilla de Vientre</option>
                  <option value="Novillo de Ceba">Novillo de Ceba</option>
                  <option value="Ternero / Ternera">Ternero / Ternera</option>
                  <option value="Toro Reproductor">Toro Reproductor</option>
                </select>
              </div>

              <!-- Lote -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Lote de Destino:</label>
                <input type="text" id="nuevo-lote" list="lotes-existentes" placeholder="General" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none">
                <datalist id="lotes-existentes">
                  ${lotes.map((l) => `<option value="${l}"></option>`).join('')}
                </datalist>
              </div>

              <!-- Fecha de Nacimiento -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Fecha de Nacimiento:</label>
                <input type="date" id="nuevo-nacimiento" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none">
              </div>

              <!-- Padre -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Padre (Toro / Tag):</label>
                <input type="text" id="nuevo-padre" placeholder="Ej. TORO-01 o Pajilla 883" class="w-full px-3 py-2 font-mono font-bold rounded-xl border border-slate-300 outline-none uppercase">
              </div>

              <!-- Madre -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Madre (Vaca / Tag):</label>
                <input type="text" id="nuevo-madre" placeholder="Ej. BV-102" class="w-full px-3 py-2 font-mono font-bold rounded-xl border border-slate-300 outline-none uppercase">
              </div>

              <!-- Peso Actual (Kg) -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Peso Inicial / Actual (Kg):</label>
                <input type="number" step="0.5" id="nuevo-peso" placeholder="Ej. 420" class="w-full px-3 py-2 font-mono font-bold rounded-xl border border-slate-300 outline-none">
              </div>

              <!-- Estado Reproductivo -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Estado Reproductivo:</label>
                <select id="nuevo-repro" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none bg-white">
                  <option value="Vacía">⚪ Vacía</option>
                  <option value="Preñada">🟢 Preñada (Gestante)</option>
                  <option value="No Aplica">⚪ No Aplica (Macho/Cría)</option>
                </select>
              </div>

              <!-- Días de Preñez (Condicional) -->
              <div id="wrapper-nuevo-dias-prened" class="hidden">
                <label class="block font-bold text-emerald-800 mb-1">Días de Preñez / Gestación:</label>
                <input type="number" id="nuevo-dias-gestacion" value="60" min="0" max="315" class="w-full px-3 py-2 font-mono font-bold rounded-xl border border-emerald-300 bg-emerald-50 outline-none">
                <span class="text-[10px] text-emerald-700 block mt-0.5">Días calculados desde la monta o inseminación.</span>
              </div>

              <!-- Fecha de Último Parto -->
              <div id="wrapper-nuevo-parto">
                <label class="block font-bold text-slate-700 mb-1">Fecha Último Parto (si aplica):</label>
                <input type="date" id="nuevo-ultimo-parto" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none">
              </div>
            </div>

            <!-- BOTONES ACCIÓN -->
            <div class="pt-4 border-t border-slate-200 flex justify-end gap-2">
              <button type="button" id="btn-cancelar-nuevo-animal" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 transition">
                Cancelar
              </button>
              <button type="submit" class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-black text-white shadow-lg transition">
                Guardar Animal
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  renderModalEditarAnimal(lotes = []) {
    const a = this.animalEditando;
    if (!a) return '';

    const tag = a.identificacionTag || a.numero || a.tag || '';
    const especie = (a.especie || 'bovino').toLowerCase();
    const nombre = a.nombreAlias || a.nombre || '';
    const sexo = (a.sexo || 'hembra').toLowerCase();
    const raza = a.raza || '';
    const categoria = a.categoria || 'Vaca de Ordeño';
    const lote = a.lote || 'General';
    const fNac = a.fechaNacimiento || '';
    const padre = a.genealogiaPadre || a.padre || a.padreTag || '';
    const madre = a.genealogiaMadre || a.madre || a.madreTag || '';
    const peso = a.ultimoPesoKg || a.pesoActual || '';
    const repro = a.estadoReproductivo || 'Vacía';
    const diasG = a.diasGestacionActual || a.diasGestacion || 0;
    const fParto = a.fechaUltimoParto || a.ultimoParto || '';
    const condicion = a.condicionCorporal || '3.5';

    const esPrenada = repro.toLowerCase().includes('prenad') || repro.toLowerCase().includes('preñad');

    return `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-0 sm:p-5 overflow-y-auto">
        <div class="bg-white rounded-none sm:rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full h-full sm:h-auto sm:max-h-[95vh] flex flex-col modal-fullscreen-mobile">
          <!-- CABECERA MODAL -->
          <div class="bg-gradient-to-r from-slate-950 via-blue-950 to-slate-950 text-white p-5 flex justify-between items-center">
            <div class="flex items-center gap-3">
              <span class="text-2xl p-2 bg-blue-600/30 rounded-xl border border-blue-500/40">✏️</span>
              <div>
                <h3 class="text-base font-black tracking-tight">Modificar Datos del Ejemplar: ${tag}</h3>
                <p class="text-xs text-slate-400">Edita cualquier dato genealógico, zootécnico, de peso o reproductivo.</p>
              </div>
            </div>
            <button id="btn-cerrar-modal-editar-animal" class="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer">
              ✕
            </button>
          </div>

          <!-- FORMULARIO -->
          <form id="form-editar-animal" class="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs flex-1">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <!-- Arete -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Número de Arete / Tag *:</label>
                <input type="text" id="edit-tag" required value="${tag}" class="w-full px-3 py-2 font-mono font-bold rounded-xl border border-slate-300 outline-none uppercase focus:border-blue-500">
              </div>

              <!-- Especie -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Especie *:</label>
                <select id="edit-especie" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none bg-white">
                  <option value="bovino" ${especie === 'bovino' ? 'selected' : ''}>🐂 Vacuno (Bovino)</option>
                  <option value="bufalino" ${especie === 'bufalino' ? 'selected' : ''}>🦬 Bufalino (Búfalo)</option>
                </select>
              </div>

              <!-- Nombre / Alias -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Nombre / Alias:</label>
                <input type="text" id="edit-nombre" value="${nombre}" placeholder="Ej. Princesa" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none">
              </div>

              <!-- Sexo -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Sexo *:</label>
                <select id="edit-sexo" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none bg-white">
                  <option value="hembra" ${sexo === 'hembra' ? 'selected' : ''}>♀️ Hembra</option>
                  <option value="macho" ${sexo === 'macho' ? 'selected' : ''}>♂️ Macho</option>
                </select>
              </div>

              <!-- Raza -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Raza:</label>
                <input type="text" id="edit-raza" value="${raza}" placeholder="Ej. Brahman Blanco, Gyr, Murrah..." class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none">
              </div>

              <!-- Categoría -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Categoría:</label>
                <select id="edit-categoria" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none bg-white">
                  <option value="Vaca de Ordeño" ${categoria === 'Vaca de Ordeño' || categoria === 'Vaca en Producción' ? 'selected' : ''}>Vaca de Ordeño / Producción</option>
                  <option value="Vaca Horra" ${categoria === 'Vaca Horra' ? 'selected' : ''}>Vaca Horra / Seca</option>
                  <option value="Novilla de Vientre" ${categoria === 'Novilla de Vientre' ? 'selected' : ''}>Novilla de Vientre</option>
                  <option value="Novillo de Ceba" ${categoria === 'Novillo de Ceba' ? 'selected' : ''}>Novillo de Ceba</option>
                  <option value="Ternero / Ternera" ${categoria === 'Ternero / Ternera' || categoria === 'Ternera' ? 'selected' : ''}>Ternero / Ternera</option>
                  <option value="Toro Reproductor" ${categoria === 'Toro Reproductor' ? 'selected' : ''}>Toro Reproductor</option>
                  <option value="Búfala de Ordeño" ${categoria === 'Búfala de Ordeño' ? 'selected' : ''}>Búfala de Ordeño</option>
                  <option value="Búfala Horra" ${categoria === 'Búfala Horra' ? 'selected' : ''}>Búfala Horra / Seca</option>
                  <option value="Bubilla de Vientre" ${categoria === 'Bubilla de Vientre' ? 'selected' : ''}>Bubilla de Vientre</option>
                  <option value="Búfalo de Ceba" ${categoria === 'Búfalo de Ceba' ? 'selected' : ''}>Búfalo de Ceba</option>
                </select>
              </div>

              <!-- Lote -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Lote de Destino:</label>
                <input type="text" id="edit-lote" value="${lote}" list="lotes-existentes-edit" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none">
                <datalist id="lotes-existentes-edit">
                  ${lotes.map((l) => `<option value="${l}"></option>`).join('')}
                </datalist>
              </div>

              <!-- Fecha de Nacimiento -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Fecha de Nacimiento:</label>
                <input type="date" id="edit-nacimiento" value="${fNac}" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none">
              </div>

              <!-- Padre -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Padre (Toro / Tag):</label>
                <input type="text" id="edit-padre" value="${padre}" placeholder="Ej. TORO-01 o Pajilla" class="w-full px-3 py-2 font-mono font-bold rounded-xl border border-slate-300 outline-none uppercase">
              </div>

              <!-- Madre -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Madre (Vaca / Tag):</label>
                <input type="text" id="edit-madre" value="${madre}" placeholder="Ej. BV-102" class="w-full px-3 py-2 font-mono font-bold rounded-xl border border-slate-300 outline-none uppercase">
              </div>

              <!-- Peso Actual (Kg) -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Peso Actual (Kg):</label>
                <input type="number" step="0.5" id="edit-peso" value="${peso}" placeholder="Ej. 450" class="w-full px-3 py-2 font-mono font-bold rounded-xl border border-slate-300 outline-none">
              </div>

              <!-- Condición Corporal -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Condición Corporal (1-5):</label>
                <select id="edit-condicion" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none bg-white">
                  <option value="1.0" ${condicion === '1.0' ? 'selected' : ''}>1.0 - Muy Flaca</option>
                  <option value="2.0" ${condicion === '2.0' ? 'selected' : ''}>2.0 - Flaca</option>
                  <option value="3.0" ${condicion === '3.0' ? 'selected' : ''}>3.0 - Regular</option>
                  <option value="3.5" ${condicion === '3.5' ? 'selected' : ''}>3.5 - Óptima / Ideal</option>
                  <option value="4.0" ${condicion === '4.0' ? 'selected' : ''}>4.0 - Buena</option>
                  <option value="5.0" ${condicion === '5.0' ? 'selected' : ''}>5.0 - Obesa</option>
                </select>
              </div>

              <!-- Estado Reproductivo -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Estado Reproductivo:</label>
                <select id="edit-repro" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none bg-white">
                  <option value="Vacía" ${repro === 'Vacía' ? 'selected' : ''}>⚪ Vacía</option>
                  <option value="Servida" ${repro === 'Servida' ? 'selected' : ''}>🟡 Servida</option>
                  <option value="Preñada" ${esPrenada ? 'selected' : ''}>🟢 Preñada (Gestante)</option>
                  <option value="No Aplica" ${repro === 'No Aplica' ? 'selected' : ''}>⚪ No Aplica (Macho/Cría)</option>
                </select>
              </div>

              <!-- Días de Preñez (Condicional) -->
              <div id="wrapper-edit-dias-prened" class="${esPrenada ? '' : 'hidden'}">
                <label class="block font-bold text-emerald-800 mb-1">Días de Preñez / Gestación:</label>
                <input type="number" id="edit-dias-gestacion" value="${diasG}" min="0" max="315" class="w-full px-3 py-2 font-mono font-bold rounded-xl border border-emerald-300 bg-emerald-50 outline-none">
                <span class="text-[10px] text-emerald-700 block mt-0.5">Días calculados desde la monta o inseminación.</span>
              </div>

              <!-- Fecha de Último Parto -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">Fecha Último Parto:</label>
                <input type="date" id="edit-ultimo-parto" value="${fParto}" class="w-full px-3 py-2 font-bold rounded-xl border border-slate-300 outline-none">
              </div>
            </div>

            <!-- BOTONES ACCIÓN -->
            <div class="pt-4 border-t border-slate-200 flex justify-end gap-2">
              <button type="button" id="btn-cancelar-editar-animal" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 transition cursor-pointer">
                Cancelar
              </button>
              <button type="submit" class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 font-black text-white shadow-lg transition cursor-pointer">
                Guardar Modificaciones
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  attachEvents() {
    // Búsqueda reactiva con autosuggest universal (números o letras)
    const inputTag = this.container.querySelector('#input-tag-animal-directo');
    if (inputTag) {
      conectarAutosuggestAnimales({
        inputElement: inputTag,
        getAnimales: () => this.getAnimalesBusqueda ? this.getAnimalesBusqueda() : (this.getAnimales ? this.getAnimales() : []),
        theme: 'emerald',
        maxResultados: 8,
        onTrasladarAFinca: (animal) => {
          if (this.onTrasladarAFinca) this.onTrasladarAFinca(animal);
        },
        onReactivarAnimal: (animal) => {
          if (this.onReactivarAnimal) this.onReactivarAnimal(animal);
        },
        onSeleccionar: (animal) => {
          const tag = animal.identificacionTag || animal.numero;
          inputTag.value = tag;
          this.filtroBusqueda = tag;
          if (this.onVerFicha) {
            this.onVerFicha(animal.id);
          }
          this.filtrarTablaEnVivo();
        }
      });

      inputTag.addEventListener('input', (e) => {
        this.filtroBusqueda = e.target.value;
        this.filtrarTablaEnVivo();
      });
    }

    // Formulario de Búsqueda Directa estilo Manga (Abre la Ficha si coincide exactamente)
    const formBuscarDirecto = this.container.querySelector('#form-buscar-animal-directo');
    if (formBuscarDirecto) {
      formBuscarDirecto.addEventListener('submit', (e) => {
        e.preventDefault();
        const inputTagEl = this.container.querySelector('#input-tag-animal-directo');
        const q = inputTagEl ? inputTagEl.value.trim().toUpperCase() : '';

        this.filtroBusqueda = q;
        if (!q) {
          this.filtrarTablaEnVivo();
          return;
        }

        const todos = this.getAnimalesBusqueda ? this.getAnimalesBusqueda() : (this.getAnimales ? this.getAnimales() : []);

        // 1. Buscar coincidencia exacta por arete/tag o número
        let matchExacto = todos.find((a) =>
          (a.identificacionTag || '').toUpperCase() === q ||
          (a.numero || '').toUpperCase() === q
        );

        // Si es exacto, comprobar si está en otra finca o extraído
        if (matchExacto) {
          if (matchExacto._estaEnOtraFinca) {
            const confirmacion = confirm(`El animal "${matchExacto.identificacionTag || matchExacto.numero}" se encuentra registrado en la finca "${matchExacto._fincaNombre || 'otra finca'}".\n\n¿Deseas trasladarlo inmediatamente a la finca en la que estás trabajando?`);
            if (confirmacion && typeof this.onTrasladarAFinca === 'function') {
              this.onTrasladarAFinca(matchExacto);
            }
          } else if (matchExacto._estaExtraido) {
            const motivo = matchExacto.motivoBaja || matchExacto._motivoExtraido || 'Baja';
            const confirmacion = confirm(`El animal "${matchExacto.identificacionTag || matchExacto.numero}" se encuentra actualmente EXTRAÍDO del hato (Motivo: ${motivo}).\n\n¿Deseas activarlo nuevamente en esta finca?`);
            if (confirmacion && typeof this.onReactivarAnimal === 'function') {
              this.onReactivarAnimal(matchExacto);
            }
          }

          if (this.onVerFicha) {
            this.onVerFicha(matchExacto.id);
          }
        }

        this.filtrarTablaEnVivo();
      });
    }

    // Botón para abrir el módulo de traslados entre fincas
    const btnTrasladosPestana = this.container.querySelector('#btn-abrir-traslados-pestana');
    if (btnTrasladosPestana) {
      btnTrasladosPestana.addEventListener('click', () => {
        if (this.onAbrirModuloTraslados) {
          this.onAbrirModuloTraslados();
        }
      });
    }

    // Botón para limpiar filtro de búsqueda
    const btnLimpiar = this.container.querySelector('#btn-limpiar-busqueda-pestana');
    if (btnLimpiar) {
      btnLimpiar.addEventListener('click', () => {
        this.filtroBusqueda = '';
        const inEl = this.container.querySelector('#input-tag-animal-directo');
        if (inEl) inEl.value = '';
        this.filtrarTablaEnVivo();
      });
    }

    // Filtro Estado Vida (Activos, Vendidos, Muertos, Todos)
    const selEst = this.container.querySelector('#select-filtro-estado-pestana');
    if (selEst) {
      selEst.addEventListener('change', (e) => {
        this.filtroEstadoVida = e.target.value;
        this.render();
      });
    }

    // Filtro Especie
    const selEsp = this.container.querySelector('#select-filtro-especie-pestana');
    if (selEsp) {
      selEsp.addEventListener('change', (e) => {
        this.filtroEspecie = e.target.value;
        this.render();
      });
    }

    // Filtro Lote
    const selLot = this.container.querySelector('#select-filtro-lote-pestana');
    if (selLot) {
      selLot.addEventListener('change', (e) => {
        this.filtroLote = e.target.value;
        this.render();
      });
    }

    // Filtro Repro
    const selRep = this.container.querySelector('#select-filtro-repro-pestana');
    if (selRep) {
      selRep.addEventListener('change', (e) => {
        this.filtroRepro = e.target.value;
        this.render();
      });
    }

    // Filtro Raza
    const selRaza = this.container.querySelector('#select-filtro-raza-pestana');
    if (selRaza) {
      selRaza.addEventListener('change', (e) => {
        this.filtroRaza = e.target.value;
        this.render();
      });
    }

    // Eventos de la tabla
    this.enlazarEventosTabla();

    // Modal "+ Nuevo Animal"
    const btnAbrir = this.container.querySelector('#btn-abrir-modal-nuevo-animal');
    if (btnAbrir) {
      btnAbrir.addEventListener('click', () => {
        this.modalNuevoAbierto = true;
        this.render();
      });
    }

    const btnCerrar = this.container.querySelector('#btn-cerrar-modal-nuevo');
    if (btnCerrar) {
      btnCerrar.addEventListener('click', () => {
        this.modalNuevoAbierto = false;
        this.render();
      });
    }

    const btnCancelar = this.container.querySelector('#btn-cancelar-nuevo-animal');
    if (btnCancelar) {
      btnCancelar.addEventListener('click', () => {
        this.modalNuevoAbierto = false;
        this.render();
      });
    }

    // Dinámica campo días de gestación en modal
    const selReproModal = this.container.querySelector('#nuevo-repro');
    const wrapPrened = this.container.querySelector('#wrapper-nuevo-dias-prened');
    if (selReproModal && wrapPrened) {
      selReproModal.addEventListener('change', (e) => {
        if (e.target.value === 'Preñada') {
          wrapPrened.classList.remove('hidden');
        } else {
          wrapPrened.classList.add('hidden');
        }
      });
    }

    // Submit Nuevo Animal
    const formNuevo = this.container.querySelector('#form-nuevo-animal');
    if (formNuevo) {
      formNuevo.addEventListener('submit', (e) => {
        e.preventDefault();
        const tag = document.getElementById('nuevo-tag').value.trim().toUpperCase();
        const especie = document.getElementById('nuevo-especie').value;
        const nombre = document.getElementById('nuevo-nombre').value.trim();
        const sexo = document.getElementById('nuevo-sexo').value;
        const raza = document.getElementById('nuevo-raza').value.trim() || 'Común';
        const categoria = document.getElementById('nuevo-categoria').value;
        const lote = document.getElementById('nuevo-lote').value.trim() || 'General';
        const nacimiento = document.getElementById('nuevo-nacimiento').value || null;
        const padre = document.getElementById('nuevo-padre').value.trim().toUpperCase() || 'Desconocido';
        const madre = document.getElementById('nuevo-madre').value.trim().toUpperCase() || 'Desconocida';
        const peso = parseFloat(document.getElementById('nuevo-peso').value) || null;
        const repro = document.getElementById('nuevo-repro').value;
        const diasG = repro === 'Preñada' ? parseInt(document.getElementById('nuevo-dias-gestacion').value) || 60 : 0;
        const ultimoParto = document.getElementById('nuevo-ultimo-parto').value || null;

        if (sexo === 'macho' && repro === 'Preñada') {
          alert('Error biológico: Un macho no puede registrarse como preñado.');
          return;
        }

        const nuevoAnimal = {
          id: `ANM-${Date.now()}-${tag}`,
          identificacionTag: tag,
          especie: especie,
          nombreAlias: nombre || `Ejemplar ${tag}`,
          sexo: sexo,
          raza: raza,
          categoria: categoria,
          lote: lote,
          fechaNacimiento: nacimiento,
          padreTag: padre,
          madreTag: madre,
          padre: padre,
          madre: madre,
          ultimoPesoKg: peso,
          fechaUltimoPesaje: peso ? new Date().toISOString().split('T')[0] : null,
          estadoReproductivo: repro,
          diasGestacionActual: diasG,
          fechaUltimoParto: ultimoParto,
          estadoVida: 'activo'
        };

        if (this.onCrearAnimal) {
          this.onCrearAnimal(nuevoAnimal);
        }

        this.modalNuevoAbierto = false;
        this.render();
      });
    }

    // Editar Animal Buttons en tabla
    this.container.querySelectorAll('.btn-editar-animal').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const todosAnimales = this.getAnimales ? this.getAnimales() : [];
        const animal = todosAnimales.find((a) => a.id === id);
        if (animal) {
          this.abrirModalEditar(animal);
        }
      });
    });

    const btnCerrarEdit = this.container.querySelector('#btn-cerrar-modal-editar-animal');
    if (btnCerrarEdit) {
      btnCerrarEdit.addEventListener('click', () => {
        this.animalEditando = null;
        this.render();
      });
    }

    const btnCancelarEdit = this.container.querySelector('#btn-cancelar-editar-animal');
    if (btnCancelarEdit) {
      btnCancelarEdit.addEventListener('click', () => {
        this.animalEditando = null;
        this.render();
      });
    }

    const selReproEdit = this.container.querySelector('#edit-repro');
    const wrapPrenedEdit = this.container.querySelector('#wrapper-edit-dias-prened');
    if (selReproEdit && wrapPrenedEdit) {
      selReproEdit.addEventListener('change', (e) => {
        if (e.target.value === 'Preñada') {
          wrapPrenedEdit.classList.remove('hidden');
        } else {
          wrapPrenedEdit.classList.add('hidden');
        }
      });
    }

    const formEdit = this.container.querySelector('#form-editar-animal');
    if (formEdit) {
      formEdit.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!this.animalEditando) return;

        const tag = document.getElementById('edit-tag').value.trim().toUpperCase();
        const especie = document.getElementById('edit-especie').value;
        const nombre = document.getElementById('edit-nombre').value.trim();
        const sexo = document.getElementById('edit-sexo').value;
        const raza = document.getElementById('edit-raza').value.trim() || 'Común';
        const categoria = document.getElementById('edit-categoria').value;
        const lote = document.getElementById('edit-lote').value.trim() || 'General';
        const nacimiento = document.getElementById('edit-nacimiento').value || null;
        const padre = document.getElementById('edit-padre').value.trim().toUpperCase() || 'Desconocido';
        const madre = document.getElementById('edit-madre').value.trim().toUpperCase() || 'Desconocida';
        const peso = parseFloat(document.getElementById('edit-peso').value) || null;
        const repro = document.getElementById('edit-repro').value;
        const diasG = repro === 'Preñada' ? parseInt(document.getElementById('edit-dias-gestacion').value) || 60 : 0;
        const ultimoParto = document.getElementById('edit-ultimo-parto').value || null;
        const condicion = document.getElementById('edit-condicion').value || '3.5';

        if (sexo === 'macho' && repro === 'Preñada') {
          alert('Error biológico: Un macho no puede registrarse como preñado.');
          return;
        }

        const animalActualizado = {
          ...this.animalEditando,
          identificacionTag: tag,
          numero: tag,
          tag: tag,
          especie: especie,
          nombreAlias: nombre || `Ejemplar ${tag}`,
          nombre: nombre,
          sexo: sexo,
          raza: raza,
          categoria: categoria,
          lote: lote,
          fechaNacimiento: nacimiento,
          padreTag: padre,
          madreTag: madre,
          padre: padre,
          genealogiaPadre: padre,
          madre: madre,
          genealogiaMadre: madre,
          ultimoPesoKg: peso,
          pesoActual: peso,
          condicionCorporal: condicion,
          estadoReproductivo: repro,
          diasGestacionActual: diasG,
          diasGestacion: diasG,
          fechaUltimoParto: ultimoParto
        };

        if (this.onActualizarAnimal) {
          this.onActualizarAnimal(animalActualizado);
        }

        this.animalEditando = null;
        this.render();
      });
    }

    // Autosuggest para Padre y Madre en Modal Nuevo Animal
    const inNuevoPadre = this.container.querySelector('#nuevo-padre');
    if (inNuevoPadre) {
      conectarAutosuggestAnimales({
        inputElement: inNuevoPadre,
        getAnimales: () => (this.getAnimales ? this.getAnimales() : []).filter((a) => (a.sexo || '').toLowerCase() === 'macho'),
        theme: 'emerald',
        maxResultados: 6,
        onSeleccionar: (a) => {
          inNuevoPadre.value = a.identificacionTag || a.numero;
        }
      });
    }

    const inNuevoMadre = this.container.querySelector('#nuevo-madre');
    if (inNuevoMadre) {
      conectarAutosuggestAnimales({
        inputElement: inNuevoMadre,
        getAnimales: () => (this.getAnimales ? this.getAnimales() : []).filter((a) => (a.sexo || '').toLowerCase() === 'hembra'),
        theme: 'emerald',
        maxResultados: 6,
        onSeleccionar: (a) => {
          inNuevoMadre.value = a.identificacionTag || a.numero;
        }
      });
    }

    // Autosuggest para Padre y Madre en Modal Editar Animal
    const inEditPadre = this.container.querySelector('#edit-padre');
    if (inEditPadre) {
      conectarAutosuggestAnimales({
        inputElement: inEditPadre,
        getAnimales: () => (this.getAnimales ? this.getAnimales() : []).filter((a) => (a.sexo || '').toLowerCase() === 'macho'),
        theme: 'emerald',
        maxResultados: 6,
        onSeleccionar: (a) => {
          inEditPadre.value = a.identificacionTag || a.numero;
        }
      });
    }

    const inEditMadre = this.container.querySelector('#edit-madre');
    if (inEditMadre) {
      conectarAutosuggestAnimales({
        inputElement: inEditMadre,
        getAnimales: () => (this.getAnimales ? this.getAnimales() : []).filter((a) => (a.sexo || '').toLowerCase() === 'hembra'),
        theme: 'emerald',
        maxResultados: 6,
        onSeleccionar: (a) => {
          inEditMadre.value = a.identificacionTag || a.numero;
        }
      });
    }
  }

  enlazarEventosTabla() {
    if (!this.container) return;

    // Ver Ficha Buttons
    this.container.querySelectorAll('.btn-ver-ficha-animal').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (this.onVerFicha) this.onVerFicha(id);
      });
    });

    // Extraer Animal individual desde la tabla
    this.container.querySelectorAll('.btn-extraer-fila-animal').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const todos = this.getAnimales ? this.getAnimales() : [];
        const animal = todos.find((a) => a.id === id);
        if (animal && this.onExtraerAnimal) {
          this.onExtraerAnimal(animal);
        } else if (this.onVerFicha) {
          this.onVerFicha(id);
        }
      });
    });

    // Reactivar Animal individual desde la tabla
    this.container.querySelectorAll('.btn-reactivar-fila-animal').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const tag = e.currentTarget.getAttribute('data-tag');
        if (confirm(`¿Deseas reactivar al ejemplar ${tag} en el inventario activo de esta finca?`)) {
          const todos = this.getAnimales ? this.getAnimales() : [];
          const animal = todos.find((a) => a.id === id);
          if (animal && this.onReactivarAnimal) {
            this.onReactivarAnimal(animal);
          }
        }
      });
    });

    // Trasladar Animal individual desde la tabla
    this.container.querySelectorAll('.btn-trasladar-animal').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const todos = this.getAnimales ? this.getAnimales() : [];
        const animal = todos.find((a) => a.id === id);
        if (animal && this.onTrasladar) {
          this.onTrasladar(animal);
        }
      });
    });

    // Editar Animal Buttons en tabla
    this.container.querySelectorAll('.btn-editar-animal').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const todosAnimales = this.getAnimales ? this.getAnimales() : [];
        const animal = todosAnimales.find((a) => a.id === id);
        if (animal) {
          this.abrirModalEditar(animal);
        }
      });
    });

    // Eliminar Animal Buttons
    this.container.querySelectorAll('.btn-eliminar-animal').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const tag = e.currentTarget.getAttribute('data-tag');
        if (confirm(`¿Eliminar al ejemplar ${tag} del inventario?`)) {
          if (this.onEliminarAnimal) this.onEliminarAnimal(id);
        }
      });
    });
  }

  filtrarTablaEnVivo() {
    if (!this.container) return;
    const todosAnimales = this.getAnimales ? this.getAnimales() : [];
    let lista = todosAnimales;

    if (this.filtroEstadoVida === 'activos') {
      lista = lista.filter((a) => a.estadoVida === 'activo' || a.estado === 'activo');
    } else if (this.filtroEstadoVida === 'vendidos') {
      lista = lista.filter((a) => (a.motivoBaja || '').toLowerCase() === 'venta');
    } else if (this.filtroEstadoVida === 'muertos') {
      lista = lista.filter((a) => (a.motivoBaja || '').toLowerCase() === 'muerte');
    }

    if (this.filtroEspecie !== 'todas') {
      lista = lista.filter((a) => (a.especie || 'bovino').toLowerCase() === this.filtroEspecie);
    }

    if (this.filtroLote !== 'todos') {
      lista = lista.filter((a) => (a.lote || 'General') === this.filtroLote);
    }

    if (this.filtroRepro !== 'todos') {
      lista = lista.filter((a) => {
        const est = (a.estadoReproductivo || '').toLowerCase();
        if (this.filtroRepro === 'prenada') return est.includes('prenad') || est.includes('preñad');
        if (this.filtroRepro === 'vacia') return est.includes('vaci') || est.includes('vací');
        if (this.filtroRepro === 'no_aplica') return est.includes('no');
        return true;
      });
    }

    if (this.filtroSexo !== 'todos') {
      lista = lista.filter((a) => (a.sexo || '').toLowerCase() === this.filtroSexo);
    }

    if (this.filtroRaza !== 'todas') {
      lista = lista.filter((a) => (a.raza || '').trim().toLowerCase() === this.filtroRaza.toLowerCase());
    }

    if (this.filtroBusqueda.trim().length > 0) {
      const q = this.filtroBusqueda.trim().toLowerCase();
      const qDigits = q.replace(/\D/g, '');
      lista = lista.filter((a) => {
        const tag = (a.identificacionTag || a.numero || '').toLowerCase();
        const tagDigits = tag.replace(/\D/g, '');
        const matchTag = tag.includes(q) || (qDigits.length > 0 && tagDigits.includes(qDigits));
        const matchNombre = (a.nombreAlias || a.nombre || '').toLowerCase().includes(q);
        const matchPadre = (a.padreTag || a.padre || '').toLowerCase().includes(q);
        const matchMadre = (a.madreTag || a.madre || '').toLowerCase().includes(q);
        const matchRaza = (a.raza || '').toLowerCase().includes(q);
        return matchTag || matchNombre || matchPadre || matchMadre || matchRaza;
      });
    }

    const badgeContador = this.container.querySelector('#contador-animales-pestana');
    if (badgeContador) {
      badgeContador.textContent = `${lista.length} de ${todosAnimales.length} Ejemplares`;
    }
    const subtexto = this.container.querySelector('#subtexto-contador-pestana');
    if (subtexto) {
      subtexto.textContent = `Mostrando ${lista.length} ejemplares`;
    }

    const tbody = this.container.querySelector('#tbody-animales-pestana');
    const contTarjetas = this.container.querySelector('#contenedor-tarjetas-mobile');
    const rol = this.getRol ? this.getRol() : 'administrador';
    const esSoloConsulta = rol === 'consulta' || rol === 'propietario' || rol === 'consultor';

    if (tbody) {
      if (lista.length > 0) {
        tbody.innerHTML = lista.map((a) => this.renderFilaAnimal(a, esSoloConsulta)).join('');
      } else {
        tbody.innerHTML = this.renderFilaVacia();
      }
    }

    if (contTarjetas) {
      if (lista.length > 0) {
        contTarjetas.innerHTML = lista.map((a) => this.renderTarjetaAnimalMobile(a, esSoloConsulta)).join('');
      } else {
        contTarjetas.innerHTML = this.renderTarjetaVaciaMobile();
      }
    }

    this.enlazarEventosTabla();
  }
}
