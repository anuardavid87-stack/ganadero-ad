/**
 * GANADERO AD - TABLA DINÁMICA DE ANÁLISIS ZOOTÉCNICO ANIMAL POR ANIMAL
 * Análisis individualizado ejemplar por ejemplar:
 * Muestra explícitamente y destaca de forma prominente el dato/métrica por el cual se está ordenando
 * (GDP, Leche, Días Abiertos, Peso Corporal, Días de Preñez o IEP) para referencia y análisis comparativo.
 */

import { calcularDiasAbiertos, calcularDEL, calcularIEP } from '../core/zootecnia.js';
import { conectarAutosuggestAnimales } from '../ui/AutosuggestAnimales.js';

export class TablaDinamica {
  constructor({ containerId, getAnimales, onVerFicha }) {
    this.container = typeof document !== 'undefined' && containerId ? document.getElementById(containerId) : null;
    this.getAnimales = getAnimales;
    this.onVerFicha = onVerFicha;
    this.filtroEspecie = 'todas'; // 'todas' | 'bovino' | 'bufalino'
    this.filtroRepro = 'todos';
    this.filtroOrden = 'gdp_desc'; // 'gdp_desc' | 'leche_desc' | 'abiertos_desc' | 'peso_desc' | 'prened_desc' | 'iep_desc'
    this.busqueda = '';
  }

  init() {
    this.render();
  }

  obtenerMetaDatoOrden(animal, criterio) {
    const fParto = animal.fechaUltimoParto || animal.ultimoParto;
    const especie = animal.especie || 'bovino';
    const diasAbiertos = calcularDiasAbiertos(fParto, animal.estadoReproductivo);
    const iep = calcularIEP(diasAbiertos, especie);
    const gdp = animal.gdpPromedioGDia !== undefined ? animal.gdpPromedioGDia : (animal.gdpActual || null);
    const leche = animal.promedioLecheDiariaL !== undefined ? animal.promedioLecheDiariaL : (animal.produccionLecheDiaria || 0);
    const peso = animal.ultimoPesoKg || animal.pesoActual || 0;
    const estaPrenada = (animal.estadoReproductivo || '').toLowerCase().includes('prenad') || (animal.estadoReproductivo || '').toLowerCase().includes('preñad');
    const diasG = estaPrenada ? parseInt(animal.diasGestacionActual || animal.diasGestacion || 0) : 0;

    switch (criterio) {
      case 'gdp_desc':
        return {
          criterio: 'gdp_desc',
          tituloColumna: 'Ganancia Diaria (GDP)',
          icono: '⚖️',
          valorNumerico: gdp !== null ? gdp : -9999,
          valorTexto: gdp !== null ? `${gdp > 0 ? '+' : ''}${gdp} g/día` : 'No registrado',
          subtexto: gdp !== null ? (gdp >= 600 ? 'Óptima' : (gdp < 300 ? 'Alerta Crítica' : 'Moderada')) : '-',
          colorBadge: gdp >= 600 ? 'bg-emerald-100 text-emerald-900 border-emerald-300' : (gdp < 300 ? 'bg-rose-100 text-rose-900 border-rose-300 font-black' : 'bg-amber-100 text-amber-900 border-amber-300')
        };

      case 'leche_desc':
        return {
          criterio: 'leche_desc',
          tituloColumna: 'Producción Lechera',
          icono: '🥛',
          valorNumerico: leche || 0,
          valorTexto: leche > 0 ? `${parseFloat(leche).toFixed(1)} L/día` : '0.0 L/día',
          subtexto: leche > 0 ? `~${Math.round(leche * 30)} L/mes` : 'Sin ordeño',
          colorBadge: leche >= 12 ? 'bg-emerald-100 text-emerald-900 border-emerald-300 font-black' : (leche > 5 ? 'bg-blue-100 text-blue-900 border-blue-300' : 'bg-slate-100 text-slate-700 border-slate-300')
        };

      case 'abiertos_desc':
        return {
          criterio: 'abiertos_desc',
          tituloColumna: 'Días Abiertos',
          icono: '⏳',
          valorNumerico: diasAbiertos || 0,
          valorTexto: diasAbiertos > 0 ? `${diasAbiertos} días abiertos` : (estaPrenada ? '0 d (Preñada)' : '0 días'),
          subtexto: diasAbiertos > 200 ? '🔴 Alerta Vacía Crítica' : (diasAbiertos > 120 ? '🟡 En Seguimiento' : '🟢 En Rango Normal'),
          colorBadge: diasAbiertos > 200 ? 'bg-rose-100 text-rose-900 border-rose-300 font-black' : (diasAbiertos > 120 ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-slate-100 text-slate-700 border-slate-300')
        };

      case 'peso_desc':
        return {
          criterio: 'peso_desc',
          tituloColumna: 'Peso Corporal Actual',
          icono: '🏋️',
          valorNumerico: peso || 0,
          valorTexto: peso > 0 ? `${peso} kg` : 'Sin pesaje',
          subtexto: animal.categoria || 'Ejemplar',
          colorBadge: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-black'
        };

      case 'prened_desc':
        return {
          criterio: 'prened_desc',
          tituloColumna: 'Días de Preñez',
          icono: '🟢',
          valorNumerico: diasG,
          valorTexto: estaPrenada ? `${diasG} días de gestación` : '0 días (Vacía / No aplica)',
          subtexto: estaPrenada ? `~${(diasG / 30.4).toFixed(1)} meses` : 'No gestante',
          colorBadge: estaPrenada ? (diasG >= 210 ? 'bg-purple-100 text-purple-900 border-purple-300 font-black' : 'bg-emerald-100 text-emerald-900 border-emerald-300') : 'bg-slate-100 text-slate-600 border-slate-200'
        };

      case 'iep_desc':
        return {
          criterio: 'iep_desc',
          tituloColumna: 'IEP Proyectado',
          icono: '📅',
          valorNumerico: fParto ? iep.dias : 0,
          valorTexto: fParto ? `${iep.dias} días (${iep.meses} m)` : 'Primeriza / Sin parto',
          subtexto: fParto ? `Último: ${fParto}` : 'Sin partos previos',
          colorBadge: fParto && iep.dias > 450 ? 'bg-rose-100 text-rose-900 border-rose-300' : 'bg-blue-100 text-blue-900 border-blue-300'
        };

      default:
        return {
          criterio: 'gdp_desc',
          tituloColumna: 'Ganancia Diaria (GDP)',
          icono: '⚖️',
          valorNumerico: gdp !== null ? gdp : 0,
          valorTexto: `${gdp || 0} g/d`,
          subtexto: '',
          colorBadge: 'bg-slate-100 text-slate-800'
        };
    }
  }

  render() {
    if (!this.container) return;

    let animales = (this.getAnimales ? this.getAnimales() : []).filter(
      (a) => a.estadoVida === 'activo' || a.estado === 'activo'
    );

    // Filtro especie
    if (this.filtroEspecie !== 'todas') {
      animales = animales.filter((a) => (a.especie || 'bovino') === this.filtroEspecie);
    }

    // Filtro reproductivo
    if (this.filtroRepro !== 'todos') {
      animales = animales.filter((a) => (a.estadoReproductivo || '').toLowerCase().includes(this.filtroRepro));
    }

    // Búsqueda por número/tag o nombre
    if (this.busqueda.trim().length > 0) {
      const q = this.busqueda.trim().toLowerCase();
      const qDigits = q.replace(/\D/g, '');
      animales = animales.filter((a) => {
        const tag = (a.identificacionTag || a.numero || '').toLowerCase();
        const tagDigits = tag.replace(/\D/g, '');
        const matchTag = tag.includes(q) || (qDigits.length > 0 && tagDigits.includes(qDigits));
        const matchNombre = (a.nombreAlias || a.nombre || '').toLowerCase().includes(q);
        const matchRaza = (a.raza || '').toLowerCase().includes(q);
        return matchTag || matchNombre || matchRaza;
      });
    }

    // Ordenamiento animal por animal según el criterio seleccionado
    animales.sort((a, b) => {
      const metaA = this.obtenerMetaDatoOrden(a, this.filtroOrden);
      const metaB = this.obtenerMetaDatoOrden(b, this.filtroOrden);
      return metaB.valorNumerico - metaA.valorNumerico;
    });

    // Calcular estadísticas globales para el KPI banner del criterio activo
    const valoresValidos = animales
      .map((a) => this.obtenerMetaDatoOrden(a, this.filtroOrden).valorNumerico)
      .filter((v) => v !== -9999 && v > 0);

    const maxVal = valoresValidos.length > 0 ? Math.max(...valoresValidos) : 0;
    const minVal = valoresValidos.length > 0 ? Math.min(...valoresValidos) : 0;
    const avgVal = valoresValidos.length > 0 ? Math.round(valoresValidos.reduce((acc, x) => acc + x, 0) / valoresValidos.length) : 0;

    const infoCriterio = this.obtenerMetaDatoOrden({}, this.filtroOrden);

    this.container.innerHTML = `
      <div class="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <!-- HEADER DEL ANÁLISIS ANIMAL X ANIMAL -->
        <div class="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white p-5 space-y-4">
          <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div>
              <h3 class="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                <span>🔄</span> Análisis Zootécnico Dinámico: Animal por Animal
                <span class="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">Individualizado</span>
              </h3>
              <p class="text-xs text-slate-400">Comparativa ejemplar por ejemplar con visualización explícita del dato/métrica de ordenamiento para análisis zootécnico.</p>
            </div>

            <!-- CONTADOR DE REGISTROS -->
            <div id="contador-ejemplares-dinamica" class="text-xs font-mono font-bold bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700 text-emerald-300">
              ${animales.length} Ejemplares Analizados
            </div>
          </div>

          <!-- CONTROLES Y FILTROS EN TIEMPO REAL -->
          <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-800 text-xs">
            <div>
              <label class="block font-bold text-slate-400 uppercase text-[10px] mb-1">Buscar por Tag / Arete:</label>
              <input type="text" id="input-filtro-tag" value="${this.busqueda}" placeholder="Ej. BV-401, 102..." class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono font-bold outline-none focus:border-emerald-500" autocomplete="off">
            </div>

            <div>
              <label class="block font-bold text-slate-400 uppercase text-[10px] mb-1">Especie:</label>
              <select id="select-filtro-especie" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-bold outline-none cursor-pointer">
                <option value="todas" ${this.filtroEspecie === 'todas' ? 'selected' : ''}>Todas las Especies</option>
                <option value="bovino" ${this.filtroEspecie === 'bovino' ? 'selected' : ''}>🐂 Vacuno (Bovino)</option>
                <option value="bufalino" ${this.filtroEspecie === 'bufalino' ? 'selected' : ''}>🦬 Bufalino (Búfalos)</option>
              </select>
            </div>

            <div>
              <label class="block font-bold text-slate-400 uppercase text-[10px] mb-1">Estado Reproductivo:</label>
              <select id="select-filtro-repro" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-bold outline-none cursor-pointer">
                <option value="todos" ${this.filtroRepro === 'todos' ? 'selected' : ''}>Todos los Estados</option>
                <option value="preñad" ${this.filtroRepro === 'preñad' ? 'selected' : ''}>🟢 Preñadas (Gestantes)</option>
                <option value="vacia" ${this.filtroRepro === 'vacia' ? 'selected' : ''}>🔴 Vacías (Abiertas)</option>
              </select>
            </div>

            <div>
              <label class="block font-bold text-emerald-400 uppercase text-[10px] mb-1 flex items-center gap-1">
                <span>🎯</span> Ordenar Por (Métrica Principal):
              </label>
              <select id="select-filtro-orden" class="w-full px-3 py-2 bg-emerald-950 border-2 border-emerald-500 rounded-xl text-emerald-200 font-black outline-none cursor-pointer">
                <option value="gdp_desc" ${this.filtroOrden === 'gdp_desc' ? 'selected' : ''}>⚖️ Ganancia Diaria (GDP Mayor a Menor)</option>
                <option value="leche_desc" ${this.filtroOrden === 'leche_desc' ? 'selected' : ''}>🥛 Producción de Leche (Mayor a Menor)</option>
                <option value="abiertos_desc" ${this.filtroOrden === 'abiertos_desc' ? 'selected' : ''}>⏳ Días Abiertos (Mayor a Menor - Críticos)</option>
                <option value="peso_desc" ${this.filtroOrden === 'peso_desc' ? 'selected' : ''}>🏋️ Peso Corporal Actual (Mayor a Menor)</option>
                <option value="prened_desc" ${this.filtroOrden === 'prened_desc' ? 'selected' : ''}>🟢 Días de Preñez (Mayor a Menor)</option>
                <option value="iep_desc" ${this.filtroOrden === 'iep_desc' ? 'selected' : ''}>📅 IEP Proyectado (Mayor a Menor)</option>
              </select>
            </div>
          </div>
        </div>

        <!-- BANNER DE RESUMEN DEL CRITERIO ACTIVO DE ORDEN -->
        <div class="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white px-5 py-3 border-b border-emerald-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div class="flex items-center gap-2">
            <span class="text-xl">${infoCriterio.icono}</span>
            <div>
              <span class="text-[10px] uppercase font-bold text-emerald-300 tracking-wider">Criterio de Ordenamiento y Análisis Activo:</span>
              <div class="font-black text-white text-sm flex items-center gap-2">
                <span>${infoCriterio.tituloColumna}</span>
                <span class="px-2 py-0.2 rounded bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 text-[10px] font-mono">Orden Descendente ⬇️</span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-4 text-xs font-mono">
            <div class="bg-black/30 px-3 py-1 rounded-xl border border-white/10">
              <span class="text-[9px] uppercase text-emerald-300 block">Valor Máximo</span>
              <strong class="text-emerald-400">${maxVal > 0 ? `${maxVal}` : '-'}</strong>
            </div>
            <div class="bg-black/30 px-3 py-1 rounded-xl border border-white/10">
              <span class="text-[9px] uppercase text-emerald-300 block">Promedio Lote</span>
              <strong class="text-white">${avgVal > 0 ? `${avgVal}` : '-'}</strong>
            </div>
            <div class="bg-black/30 px-3 py-1 rounded-xl border border-white/10">
              <span class="text-[9px] uppercase text-emerald-300 block">Valor Mínimo</span>
              <strong class="text-amber-300">${minVal > 0 ? `${minVal}` : '-'}</strong>
            </div>
          </div>
        </div>

        <!-- TABLA DINÁMICA ANIMAL X ANIMAL CON COLUMNA DE REFERENCIA DESTACADA -->
        <div class="overflow-x-auto max-h-[580px] overflow-y-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead class="bg-slate-100 uppercase font-black tracking-wider text-slate-700 text-[10px] border-b border-slate-300 sticky top-0 z-10">
              <tr>
                <th class="p-3 w-12 text-center bg-slate-200/80"># Rank</th>
                <th class="p-3 w-28">Arete / Tag</th>
                <th class="p-3 w-28">Especie</th>
                <th class="p-3 w-36">Nombre & Raza</th>
                
                <!-- COLUMNA PRINCIPAL DE ORDENAMIENTO (DESTACADA) -->
                <th class="p-3 w-48 bg-emerald-700 text-white font-black shadow-md border-x border-emerald-600 text-center">
                  <div class="flex items-center justify-center gap-1">
                    <span>${infoCriterio.icono}</span>
                    <span>DATO DE ORDEN: ${infoCriterio.tituloColumna} ⬇️</span>
                  </div>
                </th>

                <th class="p-3 w-36">Categoría & Lote</th>
                <th class="p-3 w-36 cursor-pointer hover:bg-slate-200 transition ${this.filtroOrden === 'prened_desc' ? 'bg-emerald-100 text-emerald-950 font-black' : ''}" data-sort="prened_desc" title="Clic para ordenar por preñez">
                  Repro / Días Preñez ${this.filtroOrden === 'prened_desc' ? '⬇️' : ''}
                </th>
                <th class="p-3 text-right cursor-pointer hover:bg-slate-200 transition ${this.filtroOrden === 'abiertos_desc' ? 'bg-emerald-100 text-emerald-950 font-black' : ''}" data-sort="abiertos_desc" title="Clic para ordenar por días abiertos">
                  Días Abiertos ${this.filtroOrden === 'abiertos_desc' ? '⬇️' : ''}
                </th>
                <th class="p-3 text-right cursor-pointer hover:bg-slate-200 transition ${this.filtroOrden === 'iep_desc' ? 'bg-emerald-100 text-emerald-950 font-black' : ''}" data-sort="iep_desc" title="Clic para ordenar por IEP">
                  IEP Proyectado ${this.filtroOrden === 'iep_desc' ? '⬇️' : ''}
                </th>
                <th class="p-3 text-right cursor-pointer hover:bg-slate-200 transition ${this.filtroOrden === 'peso_desc' ? 'bg-emerald-100 text-emerald-950 font-black' : ''}" data-sort="peso_desc" title="Clic para ordenar por peso">
                  Peso Actual ${this.filtroOrden === 'peso_desc' ? '⬇️' : ''}
                </th>
                <th class="p-3 text-center cursor-pointer hover:bg-slate-200 transition ${this.filtroOrden === 'gdp_desc' ? 'bg-emerald-100 text-emerald-950 font-black' : ''}" data-sort="gdp_desc" title="Clic para ordenar por GDP">
                  GDP Promedio ${this.filtroOrden === 'gdp_desc' ? '⬇️' : ''}
                </th>
                <th class="p-3 text-right cursor-pointer hover:bg-slate-200 transition ${this.filtroOrden === 'leche_desc' ? 'bg-emerald-100 text-emerald-950 font-black' : ''}" data-sort="leche_desc" title="Clic para ordenar por leche">
                  Leche L/d ${this.filtroOrden === 'leche_desc' ? '⬇️' : ''}
                </th>
                <th class="p-3 text-center">Rendimiento</th>
                <th class="p-3 w-16 text-center">Ficha</th>
              </tr>
            </thead>
            <tbody id="tbody-tabla-dinamica" class="divide-y divide-slate-200 font-medium">
              ${animales.length > 0 ? animales.map((a, idx) => this.renderFilaAnimal(a, idx)).join('') : `
                <tr>
                  <td colspan="14" class="p-10 text-center text-slate-400">
                    No se encontraron animales con los filtros especificados.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  renderFilaAnimal(a, idx) {
    const especie = a.especie || 'bovino';
    const tag = a.identificacionTag || a.numero;
    const fParto = a.fechaUltimoParto || a.ultimoParto;
    const diasAbiertos = calcularDiasAbiertos(fParto, a.estadoReproductivo);
    const iep = calcularIEP(diasAbiertos, especie);
    const gdp = a.gdpPromedioGDia !== undefined ? a.gdpPromedioGDia : (a.gdpActual || null);
    const leche = a.promedioLecheDiariaL !== undefined ? a.promedioLecheDiariaL : (a.produccionLecheDiaria || 0);
    const estaPrenada = (a.estadoReproductivo || '').toLowerCase().includes('prenad') || (a.estadoReproductivo || '').toLowerCase().includes('preñad');
    const diasG = estaPrenada ? (a.diasGestacionActual || a.diasGestacion || 0) : 0;

    // Dato activo de ordenamiento para este animal
    const metaOrden = this.obtenerMetaDatoOrden(a, this.filtroOrden);

    // Medallas para los primeros lugares
    let medalla = `<span class="text-slate-400 font-mono text-xs">#${idx + 1}</span>`;
    if (idx === 0) medalla = `<span class="px-1.5 py-0.5 rounded-full bg-amber-400 text-amber-950 font-black text-xs shadow-sm">🥇 #1</span>`;
    else if (idx === 1) medalla = `<span class="px-1.5 py-0.5 rounded-full bg-slate-300 text-slate-900 font-black text-xs shadow-sm">🥈 #2</span>`;
    else if (idx === 2) medalla = `<span class="px-1.5 py-0.5 rounded-full bg-amber-600/30 text-amber-900 font-black text-xs shadow-sm">🥉 #3</span>`;

    // Clasificación de rendimiento zootécnico individual
    let badgeRendimiento = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Óptimo</span>';
    if (gdp !== null && gdp < 300) {
      badgeRendimiento = '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800">Baja GDP</span>';
    } else if (diasAbiertos > 200) {
      badgeRendimiento = '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800">Días Abiertos</span>';
    } else if (gdp !== null && gdp < 600) {
      badgeRendimiento = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">Regular</span>';
    }

    return `
      <tr class="hover:bg-emerald-50/50 transition">
        <!-- RANK -->
        <td class="p-2.5 text-center bg-slate-50/80">${medalla}</td>

        <!-- ARETE -->
        <td class="p-2.5 font-black font-mono text-slate-900 text-sm">${tag}</td>

        <!-- ESPECIE -->
        <td class="p-2.5">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${especie === 'bufalino' ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-900'}">
            ${especie === 'bufalino' ? '🦬 Bufalino' : '🐂 Vacuno'}
          </span>
        </td>

        <!-- NOMBRE & RAZA -->
        <td class="p-2.5">
          <div class="font-bold text-slate-800">${a.nombreAlias || a.nombre || 'Sin Alias'}</div>
          <div class="text-[10px] text-slate-500">${a.raza || 'Común'}</div>
        </td>

        <!-- ==================================================================== -->
        <!-- COLUMNA PRINCIPAL DE REFERENCIA Y ANÁLISIS (DATO ORDENADO)           -->
        <!-- ==================================================================== -->
        <td class="p-2.5 text-center bg-emerald-50/70 border-x-2 border-emerald-300">
          <div class="inline-flex flex-col items-center">
            <span class="px-3 py-1 rounded-xl text-xs font-black shadow-sm border ${metaOrden.colorBadge}">
              ${metaOrden.valorTexto}
            </span>
            ${metaOrden.subtexto ? `
              <span class="text-[9px] font-bold text-slate-500 mt-0.5">${metaOrden.subtexto}</span>
            ` : ''}
          </div>
        </td>

        <!-- CATEGORÍA & LOTE -->
        <td class="p-2.5">
          <div class="font-bold text-slate-700 text-[11px]">${a.categoria}</div>
          <span class="text-[10px] text-slate-400 block">📍 ${a.lote}</span>
        </td>

        <!-- REPRO / PREÑEZ -->
        <td class="p-2.5 ${this.filtroOrden === 'prened_desc' ? 'bg-emerald-50 font-bold' : ''}">
          <div class="font-bold ${estaPrenada ? 'text-emerald-700' : 'text-slate-700'}">
            ${a.estadoReproductivo || 'Vacía'}
          </div>
          ${estaPrenada ? `<div class="text-[10px] text-emerald-600 font-black font-mono">${diasG} días de preñez</div>` : ''}
        </td>

        <!-- DÍAS ABIERTOS -->
        <td class="p-2.5 text-right font-mono font-bold ${this.filtroOrden === 'abiertos_desc' ? 'bg-emerald-50' : ''} ${diasAbiertos > 200 ? 'text-rose-600' : 'text-slate-700'}">
          ${diasAbiertos > 0 ? `${diasAbiertos} d` : '-'}
        </td>

        <!-- IEP -->
        <td class="p-2.5 text-right font-mono text-slate-600 ${this.filtroOrden === 'iep_desc' ? 'bg-emerald-50 font-bold' : ''}">
          ${fParto ? `${iep.dias} d` : '-'}
        </td>

        <!-- PESO -->
        <td class="p-2.5 text-right font-mono font-bold text-slate-800 ${this.filtroOrden === 'peso_desc' ? 'bg-emerald-50' : ''}">
          ${a.ultimoPesoKg || a.pesoActual ? `${a.ultimoPesoKg || a.pesoActual} kg` : '-'}
        </td>

        <!-- GDP -->
        <td class="p-2.5 text-center ${this.filtroOrden === 'gdp_desc' ? 'bg-emerald-50' : ''}">
          ${gdp !== null ? `
            <span class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold ${gdp < 300 ? 'bg-rose-100 text-rose-800 font-black' : (gdp < 600 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')}">
              ${gdp > 0 ? '+' : ''}${gdp} g/d
            </span>
          ` : '<span class="text-slate-300 text-xs">-</span>'}
        </td>

        <!-- LECHE -->
        <td class="p-2.5 text-right font-mono font-bold text-emerald-800 ${this.filtroOrden === 'leche_desc' ? 'bg-emerald-50' : ''}">
          ${leche > 0 ? `${parseFloat(leche).toFixed(1)} L` : '-'}
        </td>

        <!-- RENDIMIENTO -->
        <td class="p-2.5 text-center">
          ${badgeRendimiento}
        </td>

        <!-- ACCIONES -->
        <td class="p-2.5 text-center">
          <button data-action="ver-ficha-animal" data-id="${a.id}" class="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold rounded-lg shadow transition" title="Ver Ficha Técnica">
            🔍
          </button>
        </td>
      </tr>
    `;
  }

  attachEvents() {
    const inTag = this.container.querySelector('#input-filtro-tag');
    if (inTag) {
      conectarAutosuggestAnimales({
        inputElement: inTag,
        getAnimales: () => this.getAnimales ? this.getAnimales() : [],
        theme: 'emerald',
        maxResultados: 8,
        onSeleccionar: (animal) => {
          const tag = animal.identificacionTag || animal.numero;
          inTag.value = tag;
          this.busqueda = tag;
          this.filtrarTabla();
        }
      });

      inTag.addEventListener('input', (e) => {
        this.busqueda = e.target.value;
        this.filtrarTabla();
      });
    }

    const selEsp = this.container.querySelector('#select-filtro-especie');
    if (selEsp) {
      selEsp.addEventListener('change', (e) => {
        this.filtroEspecie = e.target.value;
        this.render();
      });
    }

    const selRep = this.container.querySelector('#select-filtro-repro');
    if (selRep) {
      selRep.addEventListener('change', (e) => {
        this.filtroRepro = e.target.value;
        this.render();
      });
    }

    const selOrd = this.container.querySelector('#select-filtro-orden');
    if (selOrd) {
      selOrd.addEventListener('change', (e) => {
        this.filtroOrden = e.target.value;
        this.render();
      });
    }

    // Cabeceras clickeables para ordenar directamente
    this.container.querySelectorAll('th[data-sort]').forEach((th) => {
      th.addEventListener('click', (e) => {
        const criterio = e.currentTarget.getAttribute('data-sort');
        if (criterio) {
          this.filtroOrden = criterio;
          this.render();
        }
      });
    });

    this.enlazarEventosTabla();
  }

  enlazarEventosTabla() {
    if (!this.container) return;
    this.container.querySelectorAll('button[data-action="ver-ficha-animal"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (this.onVerFicha) this.onVerFicha(id);
      });
    });
  }

  filtrarTabla() {
    if (!this.container) return;

    let animales = (this.getAnimales ? this.getAnimales() : []).filter(
      (a) => a.estadoVida === 'activo' || a.estado === 'activo'
    );

    if (this.filtroEspecie !== 'todas') {
      animales = animales.filter((a) => (a.especie || 'bovino') === this.filtroEspecie);
    }

    if (this.filtroRepro !== 'todos') {
      animales = animales.filter((a) => (a.estadoReproductivo || '').toLowerCase().includes(this.filtroRepro));
    }

    if (this.busqueda.trim().length > 0) {
      const q = this.busqueda.trim().toLowerCase();
      const qDigits = q.replace(/\D/g, '');
      animales = animales.filter((a) => {
        const tag = (a.identificacionTag || a.numero || '').toLowerCase();
        const tagDigits = tag.replace(/\D/g, '');
        const matchTag = tag.includes(q) || (qDigits.length > 0 && tagDigits.includes(qDigits));
        const matchNombre = (a.nombreAlias || a.nombre || '').toLowerCase().includes(q);
        const matchRaza = (a.raza || '').toLowerCase().includes(q);
        return matchTag || matchNombre || matchRaza;
      });
    }

    animales.sort((a, b) => {
      const metaA = this.obtenerMetaDatoOrden(a, this.filtroOrden);
      const metaB = this.obtenerMetaDatoOrden(b, this.filtroOrden);
      return metaB.valorNumerico - metaA.valorNumerico;
    });

    const contador = this.container.querySelector('#contador-ejemplares-dinamica');
    if (contador) {
      contador.textContent = `${animales.length} Ejemplares Analizados`;
    }

    const tbody = this.container.querySelector('#tbody-tabla-dinamica');
    if (tbody) {
      if (animales.length > 0) {
        tbody.innerHTML = animales.map((a, idx) => this.renderFilaAnimal(a, idx)).join('');
      } else {
        tbody.innerHTML = `
          <tr>
            <td colspan="14" class="p-10 text-center text-slate-400">
              No se encontraron animales con los filtros especificados.
            </td>
          </tr>
        `;
      }
      this.enlazarEventosTabla();
    }
  }
}

