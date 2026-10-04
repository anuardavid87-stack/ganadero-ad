/**
 * GANADERO AD - MÓDULO ESPECIAL DE NUTRICIÓN ANIMAL & BIOTECNOLOGÍA IA
 * 
 * Permite seleccionar animales específicos mediante un buscador rápido estilo manga.
 * Solo estos animales forman parte del módulo y de las formulaciones de precisión:
 * - Sugerencias alimenticias por raza y estado reproductivo
 * - Prescripción de medicamentos, moduladores ruminales, suplementos y hormonas (IATF)
 * - Análisis fotográfico morfológico efímero (sin persistir la foto pesada en memoria)
 * - Persistencia y sincronización en tiempo real con Supabase Cloud
 */

import { evaluarNutricionAnimal, analizarMorfologiaFotoEfimera, resolverPerfilRaza } from '../core/nutricionIA.js';
import { conectarAutosuggestAnimales, buscarCoincidenciasAnimales } from '../ui/AutosuggestAnimales.js';

export class ModuloNutricion {
  constructor({
    containerId = 'pantalla-nutricion',
    getAnimales,
    getAnimalesBusqueda,
    getFincaActiva,
    getNutricion,
    onGuardarPlan,
    onEliminarRegistro,
    onVerFicha,
    onTrasladarAFinca,
    onReactivarAnimal
  }) {
    this.containerId = containerId;
    this.container = typeof document !== 'undefined' ? document.getElementById(containerId) : null;
    this.getAnimales = getAnimales;
    this.getAnimalesBusqueda = getAnimalesBusqueda;
    this.getFincaActiva = getFincaActiva;
    this.getNutricion = getNutricion;
    this.onGuardarPlan = onGuardarPlan;
    this.onEliminarRegistro = onEliminarRegistro;
    this.onVerFicha = onVerFicha;
    this.onTrasladarAFinca = onTrasladarAFinca;
    this.onReactivarAnimal = onReactivarAnimal;

    this.animalSeleccionado = null;
    this.planGenerado = null;
    this.analisisFotoEnCurso = false;
    this.mensajeFeedback = null;
    this.tipoFeedback = 'info'; // 'info' | 'exito' | 'error'
    this.filtroEtapa = 'todas';
    this.modoModalEvaluacion = false;
  }

  init() {
    if (typeof document !== 'undefined') {
      this.container = document.getElementById(this.containerId);
    }
    this.render();
  }

  getAnimalesEnrolados() {
    const todosAnimales = this.getAnimales ? this.getAnimales() : [];
    const registrosNutricion = this.getNutricion ? this.getNutricion() : [];

    // Mapear cada registro de nutrición al animal correspondiente
    const tagsEnrolados = new Set(registrosNutricion.map(r => String(r.tag || r.animalTag || '').toUpperCase()));

    // Los animales enrolados son aquellos que tienen un registro en nutricion
    const enrolados = [];
    registrosNutricion.forEach(reg => {
      const tag = String(reg.tag || reg.animalTag || '').toUpperCase();
      const animalData = todosAnimales.find(a => String(a.identificacionTag || a.numero || a.tag || '').toUpperCase() === tag) || {
        id: reg.animalId || ('ANM-' + tag),
        identificacionTag: tag,
        nombreAlias: reg.nombreAlias || '',
        raza: reg.raza || 'Comercial',
        sexo: 'Hembra',
        peso: reg.pesoActualKg || 420,
        categoria: reg.etapaProductiva || 'General',
        estadoReproductivo: reg.etapaProductiva || 'Vacía'
      };
      enrolados.push({
        ...animalData,
        registroNutricion: reg
      });
    });

    return enrolados;
  }

  enrolarAnimalPorTag(tagOAnimal) {
    if (!tagOAnimal) return;
    let animal = null;

    if (typeof tagOAnimal === 'object') {
      animal = tagOAnimal;
    } else {
      const cleanTag = String(tagOAnimal).trim().toUpperCase();
      const todos = this.getAnimalesBusqueda ? this.getAnimalesBusqueda() : (this.getAnimales ? this.getAnimales() : []);
      animal = todos.find(a => String(a.identificacionTag || a.numero || a.tag || '').toUpperCase() === cleanTag);

      if (animal) {
        if (animal._estaEnOtraFinca) {
          const confirmacion = confirm(`El animal "${animal.identificacionTag || animal.numero}" se encuentra registrado en la finca "${animal._fincaNombre || 'otra finca'}".\n\n¿Deseas trasladarlo inmediatamente a la finca en la que estás trabajando?`);
          if (confirmacion && typeof this.onTrasladarAFinca === 'function') {
            this.onTrasladarAFinca(animal);
          }
        } else if (animal._estaExtraido) {
          const motivo = animal.motivoBaja || animal._motivoExtraido || 'Baja';
          const confirmacion = confirm(`El animal "${animal.identificacionTag || animal.numero}" se encuentra actualmente EXTRAÍDO del hato (Motivo: ${motivo}).\n\n¿Deseas activarlo nuevamente en esta finca?`);
          if (confirmacion && typeof this.onReactivarAnimal === 'function') {
            this.onReactivarAnimal(animal);
          }
        }
      } else {
        // Permitir enrolar creando un registro provisional con ese Tag
        animal = {
          id: 'ANM-' + cleanTag,
          identificacionTag: cleanTag,
          nombreAlias: 'Ejemplar ' + cleanTag,
          raza: 'Brahman (Cebú)',
          sexo: 'Hembra',
          peso: 450,
          categoria: 'Vaca',
          estadoReproductivo: 'Vacía'
        };
      }
    }

    const registrosNutricion = this.getNutricion ? this.getNutricion() : [];
    const yaExiste = registrosNutricion.some(r => String(r.tag || r.animalTag || '').toUpperCase() === String(animal.identificacionTag || animal.tag).toUpperCase());

    if (yaExiste) {
      this.mensajeFeedback = `El ejemplar ${animal.identificacionTag || animal.tag} ya está en el grupo de Nutrición Especial.`;
      this.tipoFeedback = 'info';
      this.abrirEvaluacionParaAnimal(animal);
      return;
    }

    // Generar evaluación zootécnica inicial
    const planInicial = evaluarNutricionAnimal({
      animal,
      pesoActual: animal.ultimoPesoKg || animal.peso || 450,
      tallaCm: animal.tallaCm || null,
      tallaFrame: 'Medio (Frame 4-6)',
      condicionCorporal: 3.0
    });

    const nuevoRegistro = {
      id: 'NUT-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      animalId: animal.id,
      tag: animal.identificacionTag || animal.tag,
      animalTag: animal.identificacionTag || animal.tag,
      fechaAnalisis: new Date().toISOString().split('T')[0],
      etapaProductiva: planInicial.etapaProductiva,
      tallaCm: planInicial.tallaCm,
      tallaFrame: planInicial.tallaFrame,
      frameScore: planInicial.frameScore,
      categoriaFrame: planInicial.categoriaFrame,
      indiceCompacidadKgCm: planInicial.indiceCompacidadKgCm,
      statusCompacidad: planInicial.statusCompacidad,
      condicionCorporal: planInicial.condicionCorporal,
      pesoActualKg: planInicial.pesoActualKg,
      gdpEsperadaGDia: planInicial.gdpEsperadaGDia,
      sugerenciaDieta: planInicial.sugerenciaDieta,
      sugerenciaMedicamentos: planInicial.sugerenciaMedicamentos,
      sugerenciaSuplementos: planInicial.sugerenciaSuplementos,
      sugerenciaHormonas: planInicial.sugerenciaHormonas,
      analisisIA: planInicial.analisisIA,
      notas: ''
    };

    if (this.onGuardarPlan) {
      this.onGuardarPlan(nuevoRegistro);
    }

    this.mensajeFeedback = `✓ Ejemplar ${animal.identificacionTag || animal.tag} ingresado exitosamente al Módulo de Nutrición Especial.`;
    this.tipoFeedback = 'exito';
    this.abrirEvaluacionParaAnimal(animal);
  }

  retirarAnimalDelModulo(tag) {
    if (!tag) return;
    const cleanTag = String(tag).trim().toUpperCase();
    if (confirm(`¿Confirma retirar al ejemplar ${cleanTag} del Grupo de Nutrición Especial?`)) {
      if (this.onEliminarRegistro) {
        this.onEliminarRegistro(cleanTag);
      }
      if (this.animalSeleccionado && String(this.animalSeleccionado.identificacionTag || this.animalSeleccionado.tag).toUpperCase() === cleanTag) {
        this.modoModalEvaluacion = false;
        this.animalSeleccionado = null;
        this.planGenerado = null;
      }
      this.mensajeFeedback = `El ejemplar ${cleanTag} ha sido retirado del módulo de nutrición.`;
      this.tipoFeedback = 'info';
      this.render();
    }
  }

  abrirEvaluacionParaAnimal(animal) {
    this.animalSeleccionado = animal;
    this.modoModalEvaluacion = true;

    // Buscar si ya tiene un plan guardado
    const registros = this.getNutricion ? this.getNutricion() : [];
    const regGuardado = registros.find(r => String(r.tag || r.animalTag || '').toUpperCase() === String(animal.identificacionTag || animal.tag).toUpperCase());

    if (regGuardado) {
      this.planGenerado = {
        animalId: animal.id,
        animalTag: animal.identificacionTag || animal.tag,
        nombreAlias: animal.nombreAlias || animal.alias || '',
        raza: animal.raza || regGuardado.raza || 'Brahman',
        pesoActualKg: regGuardado.pesoActualKg || animal.peso || 450,
        tallaCm: regGuardado.tallaCm || (regGuardado.sugerenciaDieta && regGuardado.sugerenciaDieta.tallaCm) || (regGuardado.tallaFrame && regGuardado.tallaFrame.match(/(\d{2,3})\s*cm/i) ? Number(regGuardado.tallaFrame.match(/(\d{2,3})\s*cm/i)[1]) : null),
        tallaFrame: regGuardado.tallaFrame || 'Medio (Frame 4-6)',
        frameScore: regGuardado.frameScore || (regGuardado.sugerenciaDieta && regGuardado.sugerenciaDieta.frameScore) || null,
        categoriaFrame: regGuardado.categoriaFrame || (regGuardado.sugerenciaDieta && regGuardado.sugerenciaDieta.categoriaFrame) || '',
        indiceCompacidadKgCm: regGuardado.indiceCompacidadKgCm || (regGuardado.sugerenciaDieta && regGuardado.sugerenciaDieta.indiceCompacidadKgCm) || null,
        statusCompacidad: regGuardado.statusCompacidad || (regGuardado.sugerenciaDieta && regGuardado.sugerenciaDieta.statusCompacidad) || 'normal',
        condicionCorporal: regGuardado.condicionCorporal || 3.0,
        etapaProductiva: regGuardado.etapaProductiva || 'Vacía / Mantenimiento',
        gdpEsperadaGDia: regGuardado.gdpEsperadaGDia || 450,
        sugerenciaDieta: regGuardado.sugerenciaDieta || {},
        sugerenciaMedicamentos: regGuardado.sugerenciaMedicamentos || [],
        sugerenciaSuplementos: regGuardado.sugerenciaSuplementos || [],
        sugerenciaHormonas: regGuardado.sugerenciaHormonas || [],
        analisisIA: regGuardado.analisisIA || '',
        notas: regGuardado.notas || ''
      };
    } else {
      this.planGenerado = evaluarNutricionAnimal({
        animal,
        pesoActual: animal.ultimoPesoKg || animal.peso || 450,
        tallaCm: animal.tallaCm || null,
        tallaFrame: 'Medio (Frame 4-6)',
        condicionCorporal: 3.0
      });
    }

    this.render();
  }

  calcularPlanDesdeFormulario() {
    if (!this.animalSeleccionado || !this.container) return;

    const pesoInput = this.container.querySelector('#input-nutri-peso');
    const tallaCmInput = this.container.querySelector('#input-nutri-talla-cm');
    const tallaInput = this.container.querySelector('#input-nutri-talla');
    const bcsInput = this.container.querySelector('#input-nutri-bcs');
    const etapaInput = this.container.querySelector('#input-nutri-etapa');
    const gdpInput = this.container.querySelector('#input-nutri-gdp');
    const notasInput = this.container.querySelector('#input-nutri-notas');

    const peso = pesoInput ? Number(pesoInput.value) : (this.animalSeleccionado.ultimoPesoKg || this.animalSeleccionado.peso || 450);
    const tallaCm = tallaCmInput && tallaCmInput.value ? Number(tallaCmInput.value) : null;
    const talla = tallaInput ? tallaInput.value : 'Medio (Frame 4-6)';
    const bcs = bcsInput ? Number(bcsInput.value) : 3.0;
    const etapa = etapaInput ? etapaInput.value : 'Vacía / Mantenimiento';
    const gdp = gdpInput && gdpInput.value ? Number(gdpInput.value) : null;
    const notas = notasInput ? notasInput.value : '';

    this.planGenerado = evaluarNutricionAnimal({
      animal: this.animalSeleccionado,
      pesoActual: peso,
      tallaCm,
      tallaFrame: talla,
      condicionCorporal: bcs,
      etapaProductiva: etapa,
      gdpObjetivoGDia: gdp,
      notas
    });

    // Guardar automáticamente
    const registro = {
      id: 'NUT-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      animalId: this.animalSeleccionado.id,
      tag: this.animalSeleccionado.identificacionTag || this.animalSeleccionado.tag,
      animalTag: this.animalSeleccionado.identificacionTag || this.animalSeleccionado.tag,
      fechaAnalisis: new Date().toISOString().split('T')[0],
      etapaProductiva: this.planGenerado.etapaProductiva,
      tallaCm: this.planGenerado.tallaCm,
      tallaFrame: this.planGenerado.tallaFrame,
      frameScore: this.planGenerado.frameScore,
      categoriaFrame: this.planGenerado.categoriaFrame,
      indiceCompacidadKgCm: this.planGenerado.indiceCompacidadKgCm,
      statusCompacidad: this.planGenerado.statusCompacidad,
      condicionCorporal: this.planGenerado.condicionCorporal,
      pesoActualKg: this.planGenerado.pesoActualKg,
      gdpEsperadaGDia: this.planGenerado.gdpEsperadaGDia,
      sugerenciaDieta: this.planGenerado.sugerenciaDieta,
      sugerenciaMedicamentos: this.planGenerado.sugerenciaMedicamentos,
      sugerenciaSuplementos: this.planGenerado.sugerenciaSuplementos,
      sugerenciaHormonas: this.planGenerado.sugerenciaHormonas,
      analisisIA: this.planGenerado.analisisIA,
      notas: this.planGenerado.notas
    };

    if (this.onGuardarPlan) {
      this.onGuardarPlan(registro);
    }

    this.mensajeFeedback = `✓ Plan nutricional y biometría de pista actualizados para ${registro.tag} (${this.planGenerado.tallaCm} cm, Frame ${this.planGenerado.frameScore.toFixed(1)}).`;
    this.tipoFeedback = 'exito';
    this.render();
  }

  async procesarFotoEfimera(file) {
    if (!file) return;
    this.analisisFotoEnCurso = true;
    this.render();

    try {
      const resultadoFoto = await analizarMorfologiaFotoEfimera(file, this.animalSeleccionado);
      this.analisisFotoEnCurso = false;

      // Actualizar campos en el modal
      if (this.container) {
        const bcsInput = this.container.querySelector('#input-nutri-bcs');
        const bcsLabel = this.container.querySelector('#label-nutri-bcs');
        const tallaInput = this.container.querySelector('#input-nutri-talla');

        if (bcsInput) bcsInput.value = resultadoFoto.condicionCorporalEstimada;
        if (bcsLabel) bcsLabel.textContent = resultadoFoto.condicionCorporalEstimada.toFixed(2);
        if (tallaInput) tallaInput.value = resultadoFoto.tallaFrameEstimada;
        const tallaCmInput = this.container.querySelector('#input-nutri-talla-cm');
        if (tallaCmInput && resultadoFoto.tallaCmEstimada) {
          tallaCmInput.value = resultadoFoto.tallaCmEstimada;
        }
      }

      this.mensajeFeedback = `📸 ${resultadoFoto.observacionesIA} (La fotografía fue procesada y purgada efímeramente sin almacenar archivos en memoria).`;
      this.tipoFeedback = 'exito';

      // Recalcular plan con los nuevos parámetros estimados
      this.calcularPlanDesdeFormulario();
    } catch (err) {
      this.analisisFotoEnCurso = false;
      this.mensajeFeedback = 'Error analizando la fotografía: ' + err.message;
      this.tipoFeedback = 'error';
      this.render();
    }
  }

  imprimirPlanNutricional() {
    if (!this.planGenerado) return;
    window.print();
  }

  render() {
    if (!this.container) {
      if (typeof document !== 'undefined') {
        this.container = document.getElementById(this.containerId);
      }
      if (!this.container) return;
    }

    if (this.modoModalEvaluacion && this.animalSeleccionado) {
      this.container.innerHTML = this.renderPanelEvaluacion();
      this.enlazarEventos();
      return;
    }

    const enrolados = this.getAnimalesEnrolados();
    const finca = this.getFincaActiva ? this.getFincaActiva() : null;

    let html = `
      <div class="space-y-4">
        <!-- HEADER DEL MÓDULO -->
        <div class="bg-gradient-to-r from-emerald-950/70 via-slate-900 to-slate-900 p-4 sm:p-6 rounded-3xl border border-emerald-500/30 shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-2xl sm:text-3xl">🥗</span>
              <h2 class="text-xl sm:text-2xl font-black text-white">Módulo Especial de Nutrición Animal & Biotecnología IA</h2>
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">PREDICCIÓN IA</span>
            </div>
            <p class="text-xs sm:text-sm text-slate-400 mt-1">
              Programa de precisión para animales seleccionados en manga: raciones por raza y estado reproductivo, medicamentos, minerales quelatados y visión fotográfica efímera.
            </p>
          </div>
          <div class="flex items-center gap-3">
            <div class="bg-slate-800/90 border border-slate-700 px-4 py-2 rounded-2xl flex items-center gap-3">
              <div class="text-right">
                <div class="text-[10px] text-slate-400 uppercase font-black">Grupo Especial</div>
                <div class="text-lg font-black text-emerald-400 font-mono">${enrolados.length} <span class="text-xs text-slate-300">Animales</span></div>
              </div>
              <span class="text-2xl">🧬</span>
            </div>
          </div>
        </div>

        <!-- MENSAJE FEEDBACK TEMPORAL -->
        ${this.mensajeFeedback ? `
          <div class="p-3.5 rounded-2xl text-xs font-bold flex items-center justify-between transition-all ${
            this.tipoFeedback === 'exito'
              ? 'bg-emerald-950/60 border border-emerald-500/50 text-emerald-300'
              : this.tipoFeedback === 'error'
              ? 'bg-rose-950/60 border border-rose-500/50 text-rose-300'
              : 'bg-blue-950/60 border border-blue-500/50 text-blue-300'
          }">
            <div class="flex items-center gap-2">
              <span>${this.tipoFeedback === 'exito' ? '✅' : this.tipoFeedback === 'error' ? '⚠️' : 'ℹ️'}</span>
              <span>${this.mensajeFeedback}</span>
            </div>
            <button id="btn-cerrar-feedback-nutri" class="text-slate-400 hover:text-white px-2 py-0.5 text-xs font-mono">✕</button>
          </div>
        ` : ''}

        <!-- BUSCADOR DE MANGA PARA AGREGAR ANIMALES ESPECÍFICOS -->
        <div class="bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-800 space-y-3">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
            <div class="flex items-center gap-2">
              <span class="text-base sm:text-lg">🔍</span>
              <span class="text-xs sm:text-sm font-black text-white uppercase tracking-wider">Buscador Rápido en Manga (Ingreso de Animales al Módulo)</span>
            </div>
            <span class="text-[10px] text-slate-400">Escriba el número de arete, tag o nombre para incluir el animal</span>
          </div>

          <div class="flex flex-col sm:flex-row items-stretch gap-2.5">
            <div class="relative flex-1">
              <input
                id="input-buscador-nutricion-manga"
                type="text"
                autocomplete="off"
                placeholder="Digitar arete (ej: BV-401, 112, Paloma, Murrah)..."
                class="w-full bg-slate-950 border border-slate-700 text-white px-4 py-3 rounded-2xl text-sm font-black placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition shadow-inner font-mono"
              />
              <div id="dropdown-nutricion-autosuggest" class="hidden absolute left-0 right-0 top-full mt-1 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-50 max-h-60 overflow-y-auto divide-y divide-slate-800"></div>
            </div>
            <button
              id="btn-agregar-animal-nutricion"
              class="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950 transition cursor-pointer shrink-0"
            >
              <span>➕</span>
              <span>Incluir en Nutrición Especial</span>
            </button>
          </div>
        </div>

        <!-- LISTADO DE ANIMALES ENROLADOS EN EL PROGRAMA ESPECIAL -->
        <div class="bg-slate-900 p-4 sm:p-6 rounded-3xl border border-slate-800 space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <h3 class="text-sm sm:text-base font-black text-white flex items-center gap-2">
                <span>📋</span> Animales Activos en el Módulo (${enrolados.length})
              </h3>
              <p class="text-[11px] text-slate-400">Solo estos ejemplares específicos reciben seguimiento nutricional avanzado y planes IA</p>
            </div>
          </div>

          ${enrolados.length === 0 ? `
            <div class="py-12 px-4 text-center text-slate-400 space-y-3">
              <span class="text-4xl block">🌾</span>
              <p class="text-sm font-bold text-slate-300">No hay animales incluidos en el Módulo Especial de Nutrición aún.</p>
              <p class="text-xs text-slate-500 max-w-md mx-auto">
                Utilice el buscador de manga de arriba para seleccionar e incorporar ejemplares que requieran dietas especiales, biotecnología o seguimiento de condición corporal.
              </p>
            </div>
          ` : `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              ${enrolados.map(a => {
                const reg = a.registroNutricion || {};
                const bcs = reg.condicionCorporal || 3.0;
                const perfil = resolverPerfilRaza(a.raza);
                const esBuf = perfil.tipo === 'bufalo';

                return `
                  <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between space-y-3">
                    <div class="flex items-start justify-between gap-2">
                      <div>
                        <div class="flex items-center gap-1.5">
                          <span class="text-base">${esBuf ? '🐃' : '🐄'}</span>
                          <span class="text-sm font-black text-white font-mono">${a.identificacionTag || a.tag}</span>
                          ${a.nombreAlias ? `<span class="text-xs text-slate-300 font-bold">"${a.nombreAlias}"</span>` : ''}
                        </div>
                        <div class="text-[11px] text-emerald-400 font-semibold mt-0.5">${a.raza || 'Comercial'} • ${a.sexo || 'Hembra'}</div>
                      </div>
                      <button
                        class="btn-retirar-nutri text-slate-500 hover:text-rose-400 p-1.5 text-xs transition rounded-lg hover:bg-slate-900"
                        data-tag="${a.identificacionTag || a.tag}"
                        title="Retirar del grupo especial"
                      >
                        ✕
                      </button>
                    </div>

                    <div class="grid grid-cols-4 gap-1.5 bg-slate-900/80 p-2.5 rounded-xl text-center">
                      <div>
                        <div class="text-[9px] uppercase font-black text-slate-400">Peso (Báscula)</div>
                        <div class="text-xs font-black text-white font-mono">${a.ultimoPesoKg || reg.pesoActualKg || a.peso || '---'} kg</div>
                      </div>
                      <div>
                        <div class="text-[9px] uppercase font-black text-emerald-400">Talla</div>
                        <div class="text-xs font-black text-emerald-300 font-mono">${reg.tallaCm ? reg.tallaCm + 'cm' : (reg.tallaFrame && reg.tallaFrame.includes('cm') ? reg.tallaFrame.split(' ')[0] : '---')}</div>
                      </div>
                      <div>
                        <div class="text-[9px] uppercase font-black text-slate-400">BCS</div>
                        <div class="text-xs font-black ${bcs < 2.5 ? 'text-rose-400' : bcs > 3.75 ? 'text-amber-400' : 'text-emerald-400'} font-mono">${Number(bcs).toFixed(1)}/5</div>
                      </div>
                      <div>
                        <div class="text-[9px] uppercase font-black text-cyan-400">Frame</div>
                        <div class="text-xs font-black text-cyan-300 font-mono">${reg.frameScore ? 'FS ' + Number(reg.frameScore).toFixed(1) : (reg.sugerenciaDieta?.frameScore ? 'FS ' + Number(reg.sugerenciaDieta.frameScore).toFixed(1) : 'FS 5.0')}</div>
                      </div>
                    </div>

                    <div class="text-[11px] text-slate-300 bg-slate-900/50 p-2 rounded-xl border border-slate-800/60">
                      <div class="font-black text-slate-200 truncate">🌾 ${reg.etapaProductiva || a.categoria || 'Mantenimiento'}</div>
                      <div class="text-[10px] text-slate-400 truncate mt-0.5">Sal: ${reg.sugerenciaDieta?.formulaSalMineral ? reg.sugerenciaDieta.formulaSalMineral.slice(0, 38) + '...' : 'Sal mineralizada balanceada'}</div>
                    </div>

                    <div class="flex items-center gap-2 pt-1 border-t border-slate-800/80">
                      <button
                        class="btn-evaluar-nutri flex-1 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer"
                        data-tag="${a.identificacionTag || a.tag}"
                      >
                        <span>🔬</span>
                        <span>Plan & Diagnóstico IA</span>
                      </button>
                      ${this.onVerFicha ? `
                        <button
                          class="btn-ver-ficha-nutri p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
                          data-id="${a.id}"
                          title="Ver Ficha Zootécnica General"
                        >
                          👁️
                        </button>
                      ` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>

      </div>
    `;

    this.container.innerHTML = html;
    this.enlazarEventos();
  }

  renderPanelEvaluacion() {
    const animal = this.animalSeleccionado;
    const plan = this.planGenerado || {};
    const dieta = plan.sugerenciaDieta || {};
    const medicamentos = plan.sugerenciaMedicamentos || [];
    const suplementos = plan.sugerenciaSuplementos || [];
    const hormonas = plan.sugerenciaHormonas || [];
    const perfil = resolverPerfilRaza(animal.raza);
    const esBuf = perfil.tipo === 'bufalo';

    return `
      <div id="panel-evaluacion-nutricion" class="w-full flex flex-col space-y-4 fade-in">
        <div class="flex items-center">
          <button id="btn-cerrar-modal-nutri" class="px-5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold transition flex items-center gap-2 cursor-pointer shadow-lg active:scale-95 border border-slate-700">
            <span>⬅️</span> <span>Regresar a la Tabla de Todos los Animales</span>
          </button>
        </div>
        
        <div class="bg-slate-900 border border-slate-700 w-full rounded-3xl shadow-2xl overflow-hidden flex flex-col">
          
          <!-- PANEL HEADER -->
          <div class="bg-slate-950 p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between shrink-0">
            <div class="flex items-center gap-3">
              <span class="text-2xl">${esBuf ? '🐃' : '🐄'}</span>
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="text-base sm:text-lg font-black text-white font-mono">${animal.identificacionTag || animal.tag}</h3>
                  ${animal.nombreAlias ? `<span class="text-xs text-slate-300 font-bold">"${animal.nombreAlias}"</span>` : ''}
                  <span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">${perfil.nombre}</span>
                </div>
                <p class="text-[11px] text-slate-400">Evaluación Nutricional, Zootécnica y Prescripción IA</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button id="btn-imprimir-nutri" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer">
                <span>🖨️</span> <span class="hidden sm:inline">Imprimir Ficha</span>
              </button>
            </div>
          </div>

          <!-- CONTENIDO SCROLLABLE -->
          <div class="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
            
            <!-- FORMULARIO DE PARÁMETROS DE CAMPO -->
            <div class="bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-4">
              <div class="flex items-center justify-between">
                <h4 class="text-xs sm:text-sm font-black text-white flex items-center gap-2">
                  <span>⚙️</span> Parámetros Fisiológicos y de Campo
                </h4>
                <span class="text-[10px] text-slate-400">Actualice datos para regenerar la formulación</span>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <label class="block text-[10px] font-black uppercase text-slate-400 mb-1">1. Peso en Báscula (kg)</label>
                  <input
                    id="input-nutri-peso"
                    type="number"
                    value="${animal.ultimoPesoKg || animal.peso || plan.pesoActualKg || 0}"
                    class="w-full bg-slate-900 border border-slate-700 text-slate-400 px-3 py-2 rounded-xl text-sm font-black font-mono outline-none cursor-not-allowed opacity-80"
                    readonly
                    title="El peso proviene de la báscula y no se puede editar aquí."
                  />
                </div>

                <div>
                  <div class="flex items-center justify-between mb-1">
                    <label class="text-[10px] font-black uppercase text-emerald-400">2. Talla (cm) *</label>
                    <span id="badge-frame-calc" class="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">FS ${Number(plan.frameScore || 5.0).toFixed(1)}</span>
                  </div>
                  <input
                    id="input-nutri-talla-cm"
                    type="number"
                    step="0.5"
                    min="60"
                    max="190"
                    placeholder="ej. 138"
                    value="${plan.tallaCm || 135}"
                    class="w-full bg-slate-900 border border-emerald-500/60 text-emerald-300 px-3 py-2 rounded-xl text-sm font-black font-mono focus:border-emerald-400 outline-none shadow-sm"
                  />
                  <span class="text-[9px] text-slate-400 mt-0.5 block">Alzada cruz/grupa</span>
                </div>

                <div>
                  <label class="block text-[10px] font-black uppercase text-slate-400 mb-1">3. Categoría Frame</label>
                  <select
                    id="input-nutri-talla"
                    class="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded-xl text-xs font-bold focus:border-emerald-500 outline-none cursor-pointer"
                  >
                    <option value="Bajo (Frame 1-3) - Compacto" ${String(plan.tallaFrame).includes('Bajo') ? 'selected' : ''}>Bajo (Frame 1-3) - Compacto</option>
                    <option value="Medio (Frame 4-6) - Estándar" ${!String(plan.tallaFrame).includes('Bajo') && !String(plan.tallaFrame).includes('Alto') ? 'selected' : ''}>Medio (Frame 4-6) - Estándar Pista</option>
                    <option value="Alto (Frame 7-9) - Longilíneo" ${String(plan.tallaFrame).includes('Alto') ? 'selected' : ''}>Alto (Frame 7-9) - Longilíneo</option>
                  </select>
                </div>

                <div>
                  <div class="flex items-center justify-between mb-1">
                    <label class="text-[10px] font-black uppercase text-slate-400">4. Condición Corporal</label>
                    <span id="label-nutri-bcs" class="text-xs font-black text-emerald-400 font-mono">${Number(plan.condicionCorporal || 3.0).toFixed(2)}</span>
                  </div>
                  <input
                    id="input-nutri-bcs"
                    type="range"
                    min="1.0"
                    max="5.0"
                    step="0.25"
                    value="${plan.condicionCorporal || 3.0}"
                    class="w-full accent-emerald-500 cursor-pointer"
                  />
                  <div class="flex justify-between text-[9px] text-slate-500 font-bold mt-0.5">
                    <span>1 (Flaca)</span>
                    <span>3 (Óptima Pista)</span>
                    <span>5 (Obesa)</span>
                  </div>
                </div>

                <div>
                  <label class="block text-[10px] font-black uppercase text-slate-400 mb-1">5. Etapa Exposición / Repro</label>
                  <select
                    id="input-nutri-etapa"
                    class="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded-xl text-xs font-bold focus:border-emerald-500 outline-none cursor-pointer"
                  >
                    <option value="Terneros (0 - 7 meses) - Creep Feeding & Rumen" ${String(plan.etapaProductiva).includes('Ternero') ? 'selected' : ''}>1. Terneros (0-7 m) Creep Feeding & Rumen</option>
                    <option value="Novillas en Desarrollo (8 - 16 meses) - Altura de Pista" ${String(plan.etapaProductiva).includes('Novilla') ? 'selected' : ''}>2. Novillas Desarrollo (8-16 m) Altura Pista</option>
                    <option value="Vacas: Flushing & Prep. Reproductiva (21 días pre-servicio)" ${String(plan.etapaProductiva).includes('Flushing') ? 'selected' : ''}>3A. Vacas: Flushing Repro (21 d pre-servicio)</option>
                    <option value="Vacas: Gestación Media (CC 3.0 - 3.5)" ${String(plan.etapaProductiva).includes('Gestación') ? 'selected' : ''}>3B. Vacas: Gestación Media (CC 3.0-3.5)</option>
                    <option value="Vacas: Dieta de Transición Preparto (21 días pre-parto)" ${String(plan.etapaProductiva).includes('Preparto') || String(plan.etapaProductiva).includes('Transición') ? 'selected' : ''}>3C. Vacas: Preparto Transición (21 d)</option>
                    <option value="Vacas en Lactancia / Prep. Final de Feria (60 días pista)" ${String(plan.etapaProductiva).includes('Final de Feria') || String(plan.etapaProductiva).includes('Lactancia') ? 'selected' : ''}>4. Vacas Lactancia / Final Feria (60 d pista)</option>
                    <option value="Toro Reproductor" ${String(plan.etapaProductiva).includes('Toro') ? 'selected' : ''}>Toros: Reproductor de Pista</option>
                    <option value="Vaca Seca / Horra" ${String(plan.etapaProductiva).includes('Seca') ? 'selected' : ''}>Vaca Seca / Horra (Descanso)</option>
                  </select>
                </div>
              </div>

              <!-- BANNER DE BIOMETRÍA DE PISTA & ANÁLISIS DE CONFORMACIÓN -->
              <div class="bg-gradient-to-r from-slate-900 via-emerald-950/20 to-slate-900 p-3.5 rounded-xl border border-emerald-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
                <div class="flex items-center gap-3 flex-wrap">
                  <div class="flex items-center gap-1.5 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800">
                    <span class="text-slate-400 text-[10px] uppercase font-bold">Alzada:</span>
                    <span class="font-black text-emerald-300 font-mono">${plan.tallaCm || 135} cm</span>
                  </div>
                  <div class="flex items-center gap-1.5 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800">
                    <span class="text-slate-400 text-[10px] uppercase font-bold">Frame Score:</span>
                    <span class="font-black text-cyan-300 font-mono">${Number(plan.frameScore || 5.0).toFixed(1)} / 9.0</span>
                    <span class="text-[10px] text-slate-300 font-semibold">(${plan.categoriaFrame || 'Estándar'})</span>
                  </div>
                  <div class="flex items-center gap-1.5 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800">
                    <span class="text-slate-400 text-[10px] uppercase font-bold">Relación Peso/Talla:</span>
                    <span class="font-black text-amber-300 font-mono">${plan.indiceCompacidadKgCm ? Number(plan.indiceCompacidadKgCm).toFixed(2) + ' kg/cm' : (plan.pesoActualKg && plan.tallaCm ? (plan.pesoActualKg / plan.tallaCm).toFixed(2) + ' kg/cm' : '---')}</span>
                  </div>
                </div>
                <div class="text-[11px] text-slate-300 italic">
                  🎯 ${plan.sugerenciaDieta?.statusCompacidad === 'sobrepeso_riesgo' ? '⚠️ Precaución: Evitar depósitos grasos en ubre o cuello' : (plan.sugerenciaDieta?.statusCompacidad === 'subdesarrollo' ? '📈 Consolidar desarrollo muscular y arqueo' : '✨ Conformación y alzada óptimas de pista')}
                </div>
              </div>

              <!-- ZONA DE ESCANEO FOTOGRÁFICO MORFOLÓGICO EFÍMERO -->
              <div class="bg-gradient-to-r from-slate-900 to-slate-900/60 p-3.5 rounded-xl border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div class="space-y-0.5">
                  <div class="flex items-center gap-1.5">
                    <span class="text-base">📸</span>
                    <span class="text-xs font-black text-white">Escaneo Morfológico Fotográfico con Visión IA</span>
                    <span class="px-2 py-0.2 rounded-full text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">100% EFÍMERO</span>
                  </div>
                  <p class="text-[10px] text-slate-400">
                    Sube una foto del ejemplar: la IA analiza contorno dorsal, apófisis y cobertura grasa para estimar BCS y talla en cm. <strong>La foto nunca se guarda en memoria</strong> para no saturar el almacenamiento.
                  </p>
                </div>

                <div class="flex items-center gap-2 shrink-0">
                  <label class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-white font-bold text-xs flex items-center gap-2 cursor-pointer border border-slate-700 transition">
                    <span>${this.analisisFotoEnCurso ? '⏳' : '📷'}</span>
                    <span>${this.analisisFotoEnCurso ? 'Analizando...' : 'Subir / Tomar Foto'}</span>
                    <input id="input-foto-nutri-efimera" type="file" accept="image/*" capture="environment" class="hidden" />
                  </label>
                  <button
                    id="btn-recalcular-plan"
                    class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs flex items-center gap-1.5 shadow transition cursor-pointer"
                  >
                    <span>⚡</span>
                    <span>Actualizar Plan IA</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- RESULTADO 1: DIETA & RACIÓN ZOOTÉCNICA -->
            <div class="bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3">
              <div class="flex items-center justify-between pb-2 border-b border-slate-800">
                <h4 class="text-xs sm:text-sm font-black text-white flex items-center gap-2">
                  <span>🌾</span> 1. Ración & Dieta Zootécnica de Precisión
                </h4>
                <span class="text-[10px] font-mono text-emerald-400 font-bold">GDP Proyectada: +${plan.gdpEsperadaGDia || 450} g/día</span>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div class="bg-slate-900 p-3 rounded-xl border border-slate-800/80">
                  <div class="text-[9px] uppercase font-black text-slate-400">Materia Seca (CMS)</div>
                  <div class="text-base font-black text-white font-mono mt-0.5">${dieta.materiaSecaKgDia || 0} <span class="text-xs text-slate-400">kg/día</span></div>
                  <div class="text-[9px] text-slate-400 mt-0.5">Requerimiento base</div>
                </div>

                <div class="bg-slate-900 p-3 rounded-xl border border-slate-800/80">
                  <div class="text-[9px] uppercase font-black text-slate-400">Forraje Verde Fresco</div>
                  <div class="text-base font-black text-emerald-400 font-mono mt-0.5">${dieta.forrajeVerdeKgDia || 0} <span class="text-xs text-slate-400">kg/día</span></div>
                  <div class="text-[9px] text-slate-400 mt-0.5">Base fresca 22% MS</div>
                </div>

                <div class="bg-slate-900 p-3 rounded-xl border border-slate-800/80">
                  <div class="text-[9px] uppercase font-black text-slate-400">Concentrado Formulado</div>
                  <div class="text-base font-black text-amber-400 font-mono mt-0.5">${dieta.concentradoKgDia || 0} <span class="text-xs text-slate-400">kg/día</span></div>
                  <div class="text-[9px] text-slate-400 mt-0.5">${dieta.proteinaCrudaPorc || 14}% Prot. Cruda</div>
                </div>

                <div class="bg-slate-900 p-3 rounded-xl border border-slate-800/80">
                  <div class="text-[9px] uppercase font-black text-slate-400">Sal Mineralizada</div>
                  <div class="text-base font-black text-cyan-400 font-mono mt-0.5">${dieta.salMineralizadaGramosDia || 80} <span class="text-xs text-slate-400">g/día</span></div>
                  <div class="text-[9px] text-slate-400 mt-0.5">Con Fósforo y Selenio</div>
                </div>
              </div>

              <div class="bg-slate-900/60 p-3.5 rounded-xl text-xs space-y-1.5 border border-slate-800">
                <div class="text-slate-300 font-bold">🌿 Forraje Base: <span class="text-slate-200 font-normal">${dieta.tipoForrajeRecomendado || 'Pastura fresca y heno de excelente calidad'}</span></div>
                <div class="text-slate-300 font-bold">🥣 Ración Concentrada: <span class="text-slate-200 font-normal">${dieta.tipoConcentrado || 'Suplemento formulado'}</span></div>
                <div class="text-amber-300 font-bold">⏱️ Manejo de Comedero: <span class="text-slate-200 font-normal">${dieta.fraccionamientoRacion || (dieta.tomasAlimentacionDia ? `${dieta.tomasAlimentacionDia} tomas diarias` : '2 tomas diarias')}</span></div>
                ${dieta.aditivosPista && dieta.aditivosPista.length > 0 ? `
                  <div class="text-emerald-300 font-bold flex items-start gap-1">
                    <span class="shrink-0">✨ Aditivos de Pista:</span>
                    <span class="text-slate-300 font-normal">${dieta.aditivosPista.join(' • ')}</span>
                  </div>
                ` : ''}
                <div class="text-slate-300 font-bold">🧂 Sal Mineralizada: <span class="text-emerald-300 font-normal">${dieta.formulaSalMineral || 'Sal mineralizada balanceada'}</span></div>
                <div class="text-slate-300 font-bold">💧 Agua Requerida: <span class="text-cyan-300 font-mono font-bold">${dieta.recomendacionAguaLitrosDia || 50} litros/día</span> <span class="text-slate-400 font-normal">(limpia, fresca y a voluntad)</span></div>
              </div>
            </div>

            <!-- RESULTADO 2: MEDICAMENTOS & MODULADORES RUMINALES -->
            <div class="bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3">
              <h4 class="text-xs sm:text-sm font-black text-white flex items-center gap-2 pb-2 border-b border-slate-800">
                <span>💊</span> 2. Prescripción de Medicamentos & Sanidad Ruminal
              </h4>

              <div class="space-y-2.5">
                ${medicamentos.map(m => `
                  <div class="bg-slate-900 p-3 rounded-xl border border-slate-800 text-xs space-y-1">
                    <div class="flex items-center justify-between">
                      <span class="font-black text-white">${m.nombre}</span>
                      <span class="px-2 py-0.5 rounded text-[9px] font-black bg-blue-500/20 text-blue-300">${m.tipo}</span>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-slate-300 pt-1">
                      <div><strong class="text-slate-400">Dosis:</strong> ${m.dosis}</div>
                      <div><strong class="text-slate-400">Vía:</strong> ${m.via}</div>
                      <div><strong class="text-slate-400">Frecuencia:</strong> ${m.frecuencia}</div>
                    </div>
                    ${m.advertenciaRetiro ? `
                      <div class="text-[10px] text-amber-300 bg-amber-950/40 px-2 py-1 rounded border border-amber-500/20 mt-1">
                        ⚠️ ${m.advertenciaRetiro}
                      </div>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- RESULTADO 3: SUPLEMENTOS NUTRICIONALES, VITAMINAS & MINERALES QUELATADOS -->
            <div class="bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3">
              <h4 class="text-xs sm:text-sm font-black text-white flex items-center gap-2 pb-2 border-b border-slate-800">
                <span>💉</span> 3. Suplementos Nutricionales & Vitaminas de Alta Asimilación
              </h4>

              <div class="space-y-2.5">
                ${suplementos.map(s => `
                  <div class="bg-slate-900 p-3 rounded-xl border border-slate-800 text-xs space-y-1">
                    <div class="flex items-center justify-between">
                      <span class="font-black text-emerald-400">${s.nombre}</span>
                      <span class="text-[10px] text-slate-400 font-bold">${s.via}</span>
                    </div>
                    <p class="text-slate-300 text-[11px]">${s.objetivo}</p>
                    <div class="text-slate-400 text-[10px]"><strong class="text-slate-300">Dosis sugerida:</strong> ${s.dosisRecomendada}</div>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- RESULTADO 4: BIOTECNOLOGÍA & HORMONAS (IATF / SINCRONIZACIÓN) -->
            <div class="bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3">
              <h4 class="text-xs sm:text-sm font-black text-white flex items-center gap-2 pb-2 border-b border-slate-800">
                <span>🧬</span> 4. Protocolos Biotecnológicos & Hormonas Reproductivas
              </h4>

              <div class="space-y-2.5">
                ${hormonas.map(h => `
                  <div class="bg-slate-900 p-3 rounded-xl border border-slate-800 text-xs space-y-2">
                    <div class="flex items-center justify-between">
                      <span class="font-black text-purple-300">${h.nombre}</span>
                      <span class="text-[10px] text-purple-400 font-bold">${h.diasAplicacion}</span>
                    </div>
                    <p class="text-slate-300 text-[11px]">${h.indicacion}</p>
                    
                    ${Array.isArray(h.protocolo) ? `
                      <ul class="space-y-1 pl-4 list-disc text-slate-400 text-[11px]">
                        ${h.protocolo.map(p => `<li>${p}</li>`).join('')}
                      </ul>
                    ` : ''}

                    ${h.advertenciaSeguridad ? `
                      <div class="text-[10px] text-purple-300/90 bg-purple-950/40 px-2.5 py-1 rounded border border-purple-500/20">
                        🛡️ ${h.advertenciaSeguridad}
                      </div>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- RESULTADO 5: DIAGNÓSTICO INTEGRAL IA -->
            <div class="bg-gradient-to-br from-emerald-950/40 via-slate-950 to-slate-950 p-4 sm:p-5 rounded-2xl border border-emerald-500/40 space-y-2">
              <div class="flex items-center gap-2">
                <span class="text-lg">🤖</span>
                <h4 class="text-xs sm:text-sm font-black text-emerald-300">Diagnóstico Zootécnico Integral de la Inteligencia Artificial</h4>
              </div>
              <p class="text-xs text-slate-300 leading-relaxed font-sans">
                ${plan.analisisIA || 'Análisis no disponible.'}
              </p>
            </div>

          </div>

          <!-- MODAL FOOTER -->
          <div class="bg-slate-950 p-4 border-t border-slate-800 flex items-center justify-end gap-3 shrink-0">
            <button id="btn-cerrar-modal-nutri-footer" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer">
              Regresar a la Tabla
            </button>
            <button id="btn-guardar-plan-modal" class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition flex items-center gap-1.5 shadow cursor-pointer">
              <span>💾</span>
              <span>Guardar Plan en Ficha y Supabase</span>
            </button>
          </div>

        </div>
      </div>
    `;
  }

  enlazarEventos() {
    if (!this.container) return;

    // Cerrar feedback temporal
    const btnFeedback = this.container.querySelector('#btn-cerrar-feedback-nutri');
    if (btnFeedback) {
      btnFeedback.addEventListener('click', () => {
        this.mensajeFeedback = null;
        this.render();
      });
    }

    // Buscador rápido con Autosuggest
    const inputBuscador = this.container.querySelector('#input-buscador-nutricion-manga');
    const dropdownAutosuggest = this.container.querySelector('#dropdown-nutricion-autosuggest');
    const btnAgregar = this.container.querySelector('#btn-agregar-animal-nutricion');

    if (dropdownAutosuggest) {
      if (dropdownAutosuggest.style) dropdownAutosuggest.style.display = 'none';
      if (dropdownAutosuggest.classList && typeof dropdownAutosuggest.classList.add === 'function') {
        dropdownAutosuggest.classList.add('hidden');
      }
    }

    if (inputBuscador) {
      conectarAutosuggestAnimales({
        inputElement: inputBuscador,
        getAnimales: () => this.getAnimalesBusqueda ? this.getAnimalesBusqueda() : (this.getAnimales ? this.getAnimales() : []),
        theme: 'emerald',
        maxResultados: 6,
        onTrasladarAFinca: (animal) => {
          if (this.onTrasladarAFinca) this.onTrasladarAFinca(animal);
        },
        onReactivarAnimal: (animal) => {
          if (this.onReactivarAnimal) this.onReactivarAnimal(animal);
        },
        onSeleccionar: (animal) => {
          const tag = animal.identificacionTag || animal.numero;
          inputBuscador.value = tag;
          this.enrolarAnimalPorTag(animal);
        }
      });

      inputBuscador.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const tag = inputBuscador.value.trim();
          if (tag) {
            this.enrolarAnimalPorTag(tag);
          }
        }
      });
    }

    if (btnAgregar && inputBuscador) {
      btnAgregar.addEventListener('click', () => {
        const tag = inputBuscador.value.trim();
        if (tag) {
          this.enrolarAnimalPorTag(tag);
        } else {
          alert('Por favor ingrese el arete o tag del animal.');
        }
      });
    }

    // Botones de acción en tarjetas de animales
    this.container.querySelectorAll('.btn-evaluar-nutri').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tag = e.currentTarget.getAttribute('data-tag');
        const todos = this.getAnimales ? this.getAnimales() : [];
        const animal = todos.find(a => String(a.identificacionTag || a.tag).toUpperCase() === String(tag).toUpperCase()) || {
          id: 'ANM-' + tag,
          identificacionTag: tag,
          tag,
          peso: 450,
          raza: 'Brahman (Cebú)'
        };
        this.abrirEvaluacionParaAnimal(animal);
      });
    });

    this.container.querySelectorAll('.btn-retirar-nutri').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tag = e.currentTarget.getAttribute('data-tag');
        this.retirarAnimalDelModulo(tag);
      });
    });

    this.container.querySelectorAll('.btn-ver-ficha-nutri').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (this.onVerFicha) this.onVerFicha(id);
      });
    });

    // Eventos dentro del Modal de Evaluación
    if (this.modoModalEvaluacion) {
      const btnCerrar1 = this.container.querySelector('#btn-cerrar-modal-nutri');
      const btnCerrar2 = this.container.querySelector('#btn-cerrar-modal-nutri-footer');
      const cerrarModal = () => {
        this.modoModalEvaluacion = false;
        this.render();
      };
      if (btnCerrar1) btnCerrar1.addEventListener('click', cerrarModal);
      if (btnCerrar2) btnCerrar2.addEventListener('click', cerrarModal);

      // Slider BCS interactivo
      const inputBcs = this.container.querySelector('#input-nutri-bcs');
      const labelBcs = this.container.querySelector('#label-nutri-bcs');
      if (inputBcs && labelBcs) {
        inputBcs.addEventListener('input', () => {
          labelBcs.textContent = Number(inputBcs.value).toFixed(2);
        });
      }

      // Botón Recalcular Plan IA
      const btnRecalcular = this.container.querySelector('#btn-recalcular-plan');
      if (btnRecalcular) {
        btnRecalcular.addEventListener('click', () => {
          this.calcularPlanDesdeFormulario();
        });
      }

      // Input Foto Efímera
      const inputFoto = this.container.querySelector('#input-foto-nutri-efimera');
      if (inputFoto) {
        inputFoto.addEventListener('change', (e) => {
          if (e.target.files && e.target.files[0]) {
            this.procesarFotoEfimera(e.target.files[0]);
          }
        });
      }

      // Guardar Plan
      const btnGuardarModal = this.container.querySelector('#btn-guardar-plan-modal');
      if (btnGuardarModal) {
        btnGuardarModal.addEventListener('click', () => {
          this.calcularPlanDesdeFormulario();
          this.modoModalEvaluacion = false;
          this.render();
        });
      }

      // Imprimir Ficha
      const btnImprimir = this.container.querySelector('#btn-imprimir-nutri');
      if (btnImprimir) {
        btnImprimir.addEventListener('click', () => {
          this.imprimirPlanNutricional();
        });
      }
    }
  }
}
