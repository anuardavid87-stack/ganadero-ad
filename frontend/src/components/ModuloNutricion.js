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

import {
  evaluarNutricionAnimal,
  evaluarDesarrolloRacial,
  obtenerCatalogoRazasNutricion,
  analizarMorfologiaFotoEfimera,
  resolverPerfilRaza,
  obtenerGeminiApiKey,
  guardarGeminiApiKey,
  probarConexionGemini,
  eliminarGeminiApiKey,
  obtenerModeloGeminiActivo,
  generarDiagnosticoNutricionalGemini
} from '../core/nutricionIA.js';
import { calcularEdadMeses, obtenerEdadMesesAnimal, obtenerPesoActualAnimal, formatearFecha } from '../core/zootecnia.js';
import { conectarAutosuggestAnimales, buscarCoincidenciasAnimales } from '../ui/AutosuggestAnimales.js';

export class ModuloNutricion {
  constructor({
    containerId = 'pantalla-nutricion',
    getAnimales,
    getAnimalesBusqueda,
    getFincaActiva,
    getNutricion,
    getPesajes,
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
    this.getPesajes = getPesajes;
    this.onGuardarPlan = onGuardarPlan;
    this.onEliminarRegistro = onEliminarRegistro;
    this.onVerFicha = onVerFicha;
    this.onTrasladarAFinca = onTrasladarAFinca;
    this.onReactivarAnimal = onReactivarAnimal;

    this.animalSeleccionado = null;
    this.planGenerado = null;
    this.analisisFotoEnCurso = false;
    this.consultaGeminiEnCurso = false;
    this.mensajeFeedback = null;
    this.tipoFeedback = 'info'; // 'info' | 'exito' | 'error'
    this.filtroEtapa = 'todas';
    this.modoModalEvaluacion = false;
    this.modalConfigGeminiAbierto = false;
    this.geminiProbando = false;
    this.geminiFeedback = null;
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
        raza: reg.raza || reg.sugerenciaDieta?.razaEvaluada || 'Comercial',
        sexo: 'Hembra',
        peso: reg.pesoActualKg || 420,
        categoria: reg.etapaProductiva || 'General',
        estadoReproductivo: reg.etapaProductiva || 'Vacía'
      };
      enrolados.push({
        ...animalData,
        raza: reg.raza || reg.sugerenciaDieta?.razaEvaluada || animalData.raza || 'Comercial',
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
      raza: planInicial.raza,
      razaConfirmada: planInicial.razaConfirmada,
      edadMeses: planInicial.edadMeses,
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
      desarrolloRacial: planInicial.desarrolloRacial,
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

  obtenerAnimalSincronizado(animalBase) {
    if (!animalBase) return null;
    const inventario = this.getAnimales ? this.getAnimales() : [];
    const tagTarget = String(animalBase.identificacionTag || animalBase.tag || animalBase.numero || '').trim().toUpperCase();
    const enFicha = inventario.find((a) =>
      a && (
        (animalBase.id && a.id === animalBase.id) ||
        (tagTarget && String(a.identificacionTag || a.tag || a.numero || '').trim().toUpperCase() === tagTarget)
      )
    );
    const fusionado = enFicha ? { ...animalBase, ...enFicha } : { ...animalBase };
    const pesajes = this.getPesajes ? this.getPesajes() : null;
    const pesoReal = obtenerPesoActualAnimal(fusionado, pesajes);
    const edadReal = obtenerEdadMesesAnimal(fusionado);
    if (pesoReal > 0) {
      fusionado.ultimoPesoKg = pesoReal;
      fusionado.pesoActual = pesoReal;
    }
    if (edadReal > 0) {
      fusionado.edadMeses = edadReal;
    }
    return fusionado;
  }

  abrirEvaluacionParaAnimal(animalInput) {
    const animal = this.obtenerAnimalSincronizado(animalInput);
    this.animalSeleccionado = animal;
    this.modoModalEvaluacion = true;

    const pesajes = this.getPesajes ? this.getPesajes() : null;
    const pesoFicha = obtenerPesoActualAnimal(animal, pesajes);
    const edadFicha = obtenerEdadMesesAnimal(animal);

    // Buscar si ya tiene un plan guardado
    const registros = this.getNutricion ? this.getNutricion() : [];
    const regGuardado = registros.find(r => String(r.tag || r.animalTag || '').toUpperCase() === String(animal.identificacionTag || animal.tag).toUpperCase());

    if (regGuardado) {
      const razaGuardada = regGuardado.raza || regGuardado.sugerenciaDieta?.razaEvaluada || animal.raza || (animal.especie === 'bufalino' ? 'Búfalo Murrah (Lechero & Doble Propósito)' : 'Brahman (Cebú)');
      // Sincronización estricta con la ficha técnica (Single Source of Truth):
      // El peso y la edad provienen SIEMPRE de la ficha del animal si están registrados
      const pesoVal = pesoFicha > 0 ? pesoFicha : (regGuardado.pesoActualKg || 450);
      const edadVal = edadFicha > 0 ? edadFicha : (regGuardado.edadMeses || regGuardado.sugerenciaDieta?.edadMeses || 24);
      const tallaVal = regGuardado.tallaCm || (regGuardado.sugerenciaDieta && regGuardado.sugerenciaDieta.tallaCm) || (regGuardado.tallaFrame && regGuardado.tallaFrame.match(/(\d{2,3})\s*cm/i) ? Number(regGuardado.tallaFrame.match(/(\d{2,3})\s*cm/i)[1]) : 135);
      const desRacial = evaluarDesarrolloRacial({
        animal,
        razaTexto: razaGuardada,
        pesoActual: pesoVal,
        tallaCm: tallaVal,
        edadMeses: edadVal,
        sexo: animal.sexo || 'hembra'
      });

      this.planGenerado = {
        animalId: animal.id,
        animalTag: animal.identificacionTag || animal.tag,
        nombreAlias: animal.nombreAlias || animal.alias || '',
        raza: razaGuardada,
        razaConfirmada: regGuardado.razaConfirmada !== undefined ? regGuardado.razaConfirmada : (regGuardado.sugerenciaDieta?.razaConfirmada !== undefined ? regGuardado.sugerenciaDieta.razaConfirmada : Boolean(animal.raza)),
        edadMeses: edadVal,
        pesoActualKg: pesoVal,
        tallaCm: tallaVal,
        tallaFrame: regGuardado.tallaFrame || 'Medio (Frame 4-6)',
        frameScore: regGuardado.frameScore || (regGuardado.sugerenciaDieta && regGuardado.sugerenciaDieta.frameScore) || null,
        categoriaFrame: regGuardado.categoriaFrame || (regGuardado.sugerenciaDieta && regGuardado.sugerenciaDieta.categoriaFrame) || '',
        indiceCompacidadKgCm: regGuardado.indiceCompacidadKgCm || (regGuardado.sugerenciaDieta && regGuardado.sugerenciaDieta.indiceCompacidadKgCm) || null,
        statusCompacidad: regGuardado.statusCompacidad || (regGuardado.sugerenciaDieta && regGuardado.sugerenciaDieta.statusCompacidad) || 'normal',
        condicionCorporal: regGuardado.condicionCorporal || 3.0,
        etapaProductiva: regGuardado.etapaProductiva || 'Vacía / Mantenimiento',
        gdpEsperadaGDia: desRacial.gdpMetaCorrectivaGDia || regGuardado.gdpEsperadaGDia || 450,
        desarrolloRacial: desRacial,
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
        pesoActual: pesoFicha > 0 ? pesoFicha : 450,
        edadMeses: edadFicha > 0 ? edadFicha : null,
        tallaCm: animal.tallaCm || null,
        tallaFrame: 'Medio (Frame 4-6)',
        condicionCorporal: 3.0
      });
    }

    this.render();
  }

  async calcularPlanDesdeFormulario(consultarIAEnVivo = false) {
    if (!this.animalSeleccionado || !this.container) return;

    // Sincronizar con la ficha técnica en tiempo real antes de recalcular
    this.animalSeleccionado = this.obtenerAnimalSincronizado(this.animalSeleccionado);
    const pesajes = this.getPesajes ? this.getPesajes() : null;
    const pesoFicha = obtenerPesoActualAnimal(this.animalSeleccionado, pesajes);
    const edadFicha = obtenerEdadMesesAnimal(this.animalSeleccionado);

    const pesoInput = this.container.querySelector('#input-nutri-peso');
    const tallaCmInput = this.container.querySelector('#input-nutri-talla-cm');
    const tallaInput = this.container.querySelector('#input-nutri-talla');
    const bcsInput = this.container.querySelector('#input-nutri-bcs');
    const etapaInput = this.container.querySelector('#input-nutri-etapa');
    const edadInput = this.container.querySelector('#input-nutri-edad-meses');
    const razaInput = this.container.querySelector('#input-nutri-raza');
    const checkRazaInput = this.container.querySelector('#check-nutri-raza-confirmada');
    const gdpInput = this.container.querySelector('#input-nutri-gdp');
    const notasInput = this.container.querySelector('#input-nutri-notas');

    const peso = pesoFicha > 0 ? pesoFicha : (pesoInput ? Number(pesoInput.value) : 450);
    const tallaCm = tallaCmInput && tallaCmInput.value ? Number(tallaCmInput.value) : null;
    const talla = tallaInput ? tallaInput.value : 'Medio (Frame 4-6)';
    const bcs = bcsInput ? Number(bcsInput.value) : 3.0;
    const etapa = etapaInput ? etapaInput.value : 'Vacía / Mantenimiento';
    const edadMeses = edadFicha > 0 ? edadFicha : (edadInput && edadInput.value ? Number(edadInput.value) : (this.planGenerado?.edadMeses || 24));
    const razaSeleccionada = razaInput && razaInput.value ? razaInput.value : (this.planGenerado?.raza || this.animalSeleccionado.raza || 'Brahman (Cebú)');
    const razaConfirmadaCheck = checkRazaInput ? Boolean(checkRazaInput.checked) : true;
    const gdp = gdpInput && gdpInput.value ? Number(gdpInput.value) : null;
    const notas = notasInput ? notasInput.value : '';

    if (razaConfirmadaCheck && razaSeleccionada) {
      this.animalSeleccionado.raza = razaSeleccionada;
    }

    this.planGenerado = evaluarNutricionAnimal({
      animal: this.animalSeleccionado,
      pesoActual: peso,
      tallaCm,
      tallaFrame: talla,
      condicionCorporal: bcs,
      etapaProductiva: etapa,
      edadMeses,
      razaConfirmada: razaSeleccionada,
      razaConfirmadaCheck,
      gdpObjetivoGDia: gdp,
      notas
    });

    // Si se solicitó enriquecimiento con IA, consultar Gemini en tiempo real con respaldo automático del Motor Híbrido
    const apiKey = obtenerGeminiApiKey();
    if (consultarIAEnVivo) {
      this.consultaGeminiEnCurso = true;
      this.render();
      try {
        const resIA = await generarDiagnosticoNutricionalGemini({
          planBase: this.planGenerado,
          animal: this.animalSeleccionado,
          finca: this.getFincaActiva ? this.getFincaActiva() : null,
          apiKey
        });
        if (resIA.ok && resIA.iaData) {
          const d = resIA.iaData;
          if (d.diagnosticoDesarrolloRacialIA) {
            this.planGenerado.analisisIA = `✨ DIAGNÓSTICO AVANZADO GEMINI IA (${resIA.modelo || 'flash'}) — ${this.planGenerado.raza}:\n${d.diagnosticoDesarrolloRacialIA}\n\n${d.recomendacionDietaPrecisaIA ? '🥗 AJUSTE NUTRICIONAL IA: ' + d.recomendacionDietaPrecisaIA + '\n\n' : ''}${this.planGenerado.analisisIA}`;
          }
          if (d.medicamentoPrioritarioIA && d.medicamentoPrioritarioIA.nombre) {
            this.planGenerado.sugerenciaMedicamentos = [
              {
                nombre: `✨ [IA Gemini] ${d.medicamentoPrioritarioIA.nombre}`,
                tipo: d.medicamentoPrioritarioIA.tipo || 'Prescripción Específica por Raza y Desarrollo',
                dosis: d.medicamentoPrioritarioIA.dosis || 'Según peso vivo',
                via: d.medicamentoPrioritarioIA.via || 'Parenteral / Oral',
                frecuencia: d.medicamentoPrioritarioIA.frecuencia || 'Según evaluación veterinaria',
                advertenciaRetiro: d.medicamentoPrioritarioIA.advertenciaRetiro || 'Verificar tiempo de retiro oficial.'
              },
              ...(this.planGenerado.sugerenciaMedicamentos || [])
            ];
          }
          if (d.vitaminaSuplementoPrioritarioIA && d.vitaminaSuplementoPrioritarioIA.nombre) {
            this.planGenerado.sugerenciaSuplementos = [
              {
                nombre: `✨ [IA Gemini] ${d.vitaminaSuplementoPrioritarioIA.nombre}`,
                componente: d.vitaminaSuplementoPrioritarioIA.componente || 'Complejo vitamínico-mineral de precisión',
                objetivo: d.vitaminaSuplementoPrioritarioIA.objetivo || `Optimizar curva de desarrollo de ${this.planGenerado.raza}`,
                dosisRecomendada: d.vitaminaSuplementoPrioritarioIA.dosisRecomendada || 'Según peso actual',
                via: d.vitaminaSuplementoPrioritarioIA.via || 'Oral / Intramuscular'
              },
              ...(this.planGenerado.sugerenciaSuplementos || [])
            ];
          }
        }
      } catch (errIA) {
        console.warn('Aviso al enriquecer plan con Gemini IA:', errIA);
      } finally {
        this.consultaGeminiEnCurso = false;
      }
    }

    // Guardar automáticamente
    const registro = {
      id: 'NUT-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      animalId: this.animalSeleccionado.id,
      tag: this.animalSeleccionado.identificacionTag || this.animalSeleccionado.tag,
      animalTag: this.animalSeleccionado.identificacionTag || this.animalSeleccionado.tag,
      raza: this.planGenerado.raza,
      razaConfirmada: this.planGenerado.razaConfirmada,
      sincronizarRazaFicha: razaConfirmadaCheck,
      edadMeses: this.planGenerado.edadMeses,
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
      desarrolloRacial: this.planGenerado.desarrolloRacial,
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

    this.mensajeFeedback = `✓ Análisis de desarrollo racial (${this.planGenerado.raza}: ${this.planGenerado.desarrolloRacial?.indiceDesarrolloPorc || 100}% estándar) y plan nutricional IA actualizados para ${registro.tag}.`;
    this.tipoFeedback = 'exito';
    this.render();
  }

  async procesarFotoEfimera(file) {
    if (!file) return;

    if (!obtenerGeminiApiKey()) {
      this.modalConfigGeminiAbierto = true;
      this.geminiFeedback = {
        ok: false,
        mensaje: 'Configura tu clave de Google Gemini para habilitar el análisis fotográfico con Visión IA.'
      };
      this.render();
      return;
    }

    this.analisisFotoEnCurso = true;
    this.render();

    try {
      const razaInput = this.container ? this.container.querySelector('#input-nutri-raza') : null;
      const razaActiva = razaInput ? razaInput.value : (this.planGenerado?.raza || this.animalSeleccionado?.raza || '');
      const resultadoFoto = await analizarMorfologiaFotoEfimera(file, this.animalSeleccionado, razaActiva);
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
      await this.calcularPlanDesdeFormulario(false);
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
      const evalHtml = this.renderPanelEvaluacion();
      this.container.innerHTML = evalHtml;
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
            <div
              class="bg-slate-800/90 border border-purple-500/40 px-3.5 py-2 rounded-2xl flex items-center gap-2 text-left"
              title="Conexión de IA administrada globalmente por el Super Administrador para todas las empresas y fincas"
            >
              <span class="text-xl">✨</span>
              <div>
                <div class="text-[9px] text-purple-300 font-black uppercase">Motor IA Global</div>
                <div class="text-xs font-black text-emerald-400 flex items-center gap-1">
                  <span>● Activo (Todas las Fincas)</span>
                </div>
              </div>
            </div>

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
                const aSync = this.obtenerAnimalSincronizado(a);
                const reg = aSync.registroNutricion || a.registroNutricion || {};
                const bcs = reg.condicionCorporal || 3.0;
                const perfil = resolverPerfilRaza(aSync.raza || a.raza);
                const esBuf = perfil.tipo === 'bufalo';
                const pesoCard = obtenerPesoActualAnimal(aSync);
                const edadCard = obtenerEdadMesesAnimal(aSync);

                return `
                  <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between space-y-3">
                    <div class="flex items-start justify-between gap-2">
                      <div>
                        <div class="flex items-center gap-1.5">
                          <span class="text-base">${esBuf ? '🐃' : '🐄'}</span>
                          <span class="text-sm font-black text-white font-mono">${aSync.identificacionTag || aSync.tag}</span>
                          ${aSync.nombreAlias ? `<span class="text-xs text-slate-300 font-bold">"${aSync.nombreAlias}"</span>` : ''}
                        </div>
                        <div class="text-[11px] text-emerald-400 font-semibold mt-0.5">${aSync.raza || 'Comercial'} • ${aSync.sexo || 'Hembra'} • ${edadCard ? `${edadCard} meses` : 'Edad s/f'}</div>
                      </div>
                      <button
                        class="btn-retirar-nutri text-slate-500 hover:text-rose-400 p-1.5 text-xs transition rounded-lg hover:bg-slate-900"
                        data-tag="${aSync.identificacionTag || aSync.tag}"
                        title="Retirar del grupo especial"
                      >
                        ✕
                      </button>
                    </div>

                    <div class="grid grid-cols-4 gap-1.5 bg-slate-900/80 p-2.5 rounded-xl text-center">
                      <div>
                        <div class="text-[9px] uppercase font-black text-slate-400">Peso (Ficha)</div>
                        <div class="text-xs font-black text-white font-mono">${pesoCard || reg.pesoActualKg || '---'} kg</div>
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
    const animal = this.obtenerAnimalSincronizado(this.animalSeleccionado);
    const plan = this.planGenerado || {};
    const dieta = plan.sugerenciaDieta || {};
    const medicamentos = plan.sugerenciaMedicamentos || [];
    const suplementos = plan.sugerenciaSuplementos || [];
    const hormonas = plan.sugerenciaHormonas || [];
    const pesoSincronizado = obtenerPesoActualAnimal(animal) || plan.pesoActualKg || 420;
    const edadSincronizada = obtenerEdadMesesAnimal(animal) || plan.edadMeses || 24;
    const razaActivaTexto = plan.raza || dieta.razaEvaluada || animal.raza || (animal.especie === 'bufalino' ? 'Búfalo Murrah (Lechero & Doble Propósito)' : 'Brahman (Cebú)');
    const perfil = resolverPerfilRaza(razaActivaTexto);
    const esBuf = perfil.tipo === 'bufalo' || perfil.especie === 'bufalino';
    const catalogoRazas = obtenerCatalogoRazasNutricion();
    const gruposRazas = {};
    catalogoRazas.forEach((r) => {
      const g = r.grupo || 'Otras Razas';
      if (!gruposRazas[g]) gruposRazas[g] = [];
      gruposRazas[g].push(r);
    });

    const tieneRazaEnFicha = Boolean(animal.raza && String(animal.raza).trim() && String(animal.raza).toLowerCase() !== 'comercial');
    const razaConfirmada = plan.razaConfirmada !== undefined ? Boolean(plan.razaConfirmada) : tieneRazaEnFicha;
    const des = plan.desarrolloRacial || dieta.desarrolloRacial || evaluarDesarrolloRacial({
      animal,
      razaTexto: perfil.nombre,
      pesoActual: pesoSincronizado,
      tallaCm: plan.tallaCm || 135,
      edadMeses: edadSincronizada,
      sexo: animal.sexo || 'hembra'
    });
    const porcDesarrollo = des.indiceDesarrolloPorc || 100;
    const colorDesarrollo =
      des.estadoDesarrollo === 'rezago_severo'
        ? 'text-rose-400 border-rose-500/40 bg-rose-950/30'
        : des.estadoDesarrollo === 'rezago_moderado'
        ? 'text-amber-300 border-amber-500/40 bg-amber-950/30'
        : des.estadoDesarrollo === 'superior'
        ? 'text-cyan-300 border-cyan-500/40 bg-cyan-950/30'
        : 'text-emerald-300 border-emerald-500/40 bg-emerald-950/30';

    return `
      <div id="panel-evaluacion-nutricion" class="w-full flex flex-col space-y-4 fade-in">
        <div class="flex items-center">
          <button id="btn-cerrar-modal-nutri" class="px-5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold transition flex items-center gap-2 cursor-pointer shadow-lg active:scale-95 border border-slate-700">
            <span>⬅️</span> <span>Regresar a la Tabla de Todos los Animales</span>
          </button>
        </div>
        
        <div class="bg-slate-900 border border-slate-700 w-full rounded-3xl shadow-2xl overflow-hidden flex flex-col">
          
          <!-- PANEL HEADER -->
          <div class="bg-slate-950 p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between shrink-0 flex-wrap gap-2">
            <div class="flex items-center gap-3">
              <span class="text-2xl">${esBuf ? '🐃' : '🐄'}</span>
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="text-base sm:text-lg font-black text-white font-mono">${animal.identificacionTag || animal.tag}</h3>
                  ${animal.nombreAlias ? `<span class="text-xs text-slate-300 font-bold">"${animal.nombreAlias}"</span>` : ''}
                  <span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">${perfil.nombre}</span>
                  <span class="px-2 py-0.5 rounded-full text-[9px] font-black ${razaConfirmada ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}">
                    ${razaConfirmada ? '✓ RAZA CONFIRMADA' : '⚠️ CONFIRMAR RAZA'}
                  </span>
                </div>
                <p class="text-[11px] text-slate-400">Análisis Directo de Desarrollo Racial, Nutrición de Precisión, Medicamentos y Vitaminas con IA</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="px-3 py-1.5 rounded-xl bg-purple-950/60 text-purple-200 text-xs font-bold border border-purple-500/40 flex items-center gap-1.5" title="Conexión IA Global administrada en Super Admin">
                <span>✨</span> <span class="hidden sm:inline">IA Global Activa (${obtenerModeloGeminiActivo()})</span>
              </span>
              <button id="btn-imprimir-nutri" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer">
                <span>🖨️</span> <span class="hidden sm:inline">Imprimir Ficha</span>
              </button>
            </div>
          </div>

          <!-- CONTENIDO SCROLLABLE -->
          <div class="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
            
            <!-- SECCIÓN 0: CASILLA DE CONFIRMACIÓN DE RAZA (GANADO Y BÚFALOS) & ANÁLISIS DIRECTO DE DESARROLLO -->
            <div class="bg-gradient-to-br from-slate-950 via-emerald-950/20 to-slate-950 p-4 sm:p-5 rounded-2xl border border-emerald-500/40 space-y-4">
              <div class="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 border-b border-slate-800">
                <div>
                  <h4 class="text-xs sm:text-sm font-black text-white flex items-center gap-2">
                    <span>🧬</span> Confirmación de Raza (Bovinos & Búfalos) y Análisis Directo de Desarrollo por Edades
                  </h4>
                  <p class="text-[11px] text-slate-400 mt-0.5">
                    Selecciona y confirma la raza del animal (esté o no registrada en su ficha) para comparar su peso, alzada y ganancia diaria en cada etapa de crecimiento.
                  </p>
                </div>
                <span class="px-2.5 py-1 rounded-xl text-[10px] font-black border ${tieneRazaEnFicha ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' : 'bg-amber-950/60 border-amber-500/40 text-amber-300'} shrink-0">
                  ${tieneRazaEnFicha ? `📋 En Ficha: ${animal.raza}` : '📋 Sin raza específica en ficha (Confírmala abajo)'}
                </span>
              </div>

              <!-- ACCESO RÁPIDO A RAZAS PRIORIZADAS (RED SINDHI, GYR, GUZERAT, NELORE, GIROLANDO, BRAHMAN) -->
              <div class="bg-slate-900/90 p-3 rounded-xl border border-amber-500/30 space-y-2">
                <div class="flex items-center justify-between flex-wrap gap-1">
                  <span class="text-[10px] font-black uppercase text-amber-300 flex items-center gap-1.5">
                    <span>⭐</span> Razas Priorizadas (Selección Rápida con Curvas Oficiales ABCZ / Embrapa / Asocebú):
                  </span>
                  <span class="text-[10px] text-slate-400">Clic para aplicar estándar genético y curva por edades</span>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  ${catalogoRazas.filter(r => r.esPriorizada).map(r => {
                    const activa = r.clave === perfil.clave || r.nombre === perfil.nombre;
                    return `
                      <button
                        type="button"
                        data-raza-nombre="${r.nombre}"
                        class="btn-chip-raza-priorizada px-3 py-1.5 rounded-xl text-[11px] font-black transition cursor-pointer flex items-center gap-1.5 ${
                          activa
                            ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 border border-amber-300'
                            : 'bg-slate-950 hover:bg-slate-800 text-amber-200 border border-amber-500/30'
                        }"
                      >
                        <span>⭐</span>
                        <span>${r.nombre.split('(')[0].trim()}</span>
                      </button>
                    `;
                  }).join('')}
                </div>
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
                <div class="lg:col-span-5">
                  <label class="block text-[10px] font-black uppercase text-emerald-400 mb-1">
                    Raza del Ejemplar (Catálogo Completo Ganado & Búfalos):
                  </label>
                  <select
                    id="input-nutri-raza"
                    class="bovi-select-raza w-full bg-slate-950 border border-emerald-500/60 text-slate-100 px-3 py-2.5 rounded-xl text-xs font-black focus:border-emerald-400 outline-none cursor-pointer"
                  >
                    ${Object.keys(gruposRazas).map(nombreGrupo => `
                      <optgroup label="── ${nombreGrupo} ──">
                        ${gruposRazas[nombreGrupo].map(r => `
                          <option value="${r.nombre}" ${r.clave === perfil.clave || r.nombre === perfil.nombre ? 'selected' : ''}>
                            ${r.especie === 'bufalino' ? '🐃' : (r.esPriorizada ? '⭐' : '🐄')} ${r.nombre} — (${r.aptitud})
                          </option>
                        `).join('')}
                      </optgroup>
                    `).join('')}
                  </select>
                </div>

                <div class="lg:col-span-2">
                  <label class="block text-[10px] font-black uppercase text-cyan-400 mb-1">
                    Edad Actual (Meses):
                  </label>
                  <input
                    id="input-nutri-edad-meses"
                    type="number"
                    min="1"
                    max="240"
                    step="1"
                    value="${edadSincronizada}"
                    readonly
                    title="Calculada automáticamente en tiempo real desde la fecha de nacimiento registrada en la ficha del animal"
                    class="w-full bg-slate-950 border border-cyan-500/50 text-cyan-300 px-3 py-2 rounded-xl text-sm font-black font-mono outline-none cursor-not-allowed"
                  />
                  <span class="text-[9px] text-slate-400 mt-0.5 block truncate">📅 Nac: ${formatearFecha(animal.fechaNacimiento || animal.fecha_nacimiento, 'Según Ficha')}</span>
                </div>

                <div class="lg:col-span-5">
                  <label class="flex items-start gap-2.5 p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 cursor-pointer hover:bg-emerald-950/60 transition">
                    <input
                      id="check-nutri-raza-confirmada"
                      type="checkbox"
                      ${razaConfirmada ? 'checked' : ''}
                      class="mt-0.5 w-4 h-4 accent-emerald-500 rounded cursor-pointer shrink-0"
                    />
                    <span class="text-[11px] leading-snug text-slate-200">
                      <strong class="text-emerald-300 block">✓ Confirmar Raza para Diagnóstico IA y Guardar en Ficha</strong>
                      Usa todos los parámetros genéticos de <strong>${perfil.nombre}</strong> para calcular su desarrollo, alimentación, medicamentos y vitaminas.
                    </span>
                  </label>
                </div>
              </div>

              <!-- CARACTERÍSTICAS DE LA RAZA & COMPARATIVA DIRECTA DE DESARROLLO -->
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <!-- Tarjeta A: Características Zootécnicas de la Raza -->
                <div class="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 space-y-2 text-xs">
                  <div class="flex items-center justify-between border-b border-slate-800 pb-1.5">
                    <span class="font-black text-emerald-300 flex items-center gap-1.5">
                      <span>${esBuf ? '🐃' : '🐄'}</span> Perfil Genético: ${perfil.nombre}
                    </span>
                    <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">${perfil.aptitud || 'Doble Propósito'}</span>
                  </div>
                  <p class="text-[11px] text-slate-300 leading-relaxed">${perfil.caracteristicas}</p>
                  <div class="grid grid-cols-4 gap-1.5 pt-1 text-center">
                    <div class="bg-slate-950 p-1.5 rounded-lg border border-slate-800">
                      <div class="text-[9px] text-slate-400 uppercase font-bold">Peso Adulto</div>
                      <div class="text-[11px] font-black text-white font-mono">H:${perfil.pesoAdultoHembraKg} / M:${perfil.pesoAdultoMachoKg}kg</div>
                    </div>
                    <div class="bg-slate-950 p-1.5 rounded-lg border border-slate-800">
                      <div class="text-[9px] text-slate-400 uppercase font-bold">Consumo MS</div>
                      <div class="text-[11px] font-black text-emerald-400 font-mono">${perfil.consumoMsPorcPV}% PV</div>
                    </div>
                    <div class="bg-slate-950 p-1.5 rounded-lg border border-slate-800">
                      <div class="text-[9px] text-slate-400 uppercase font-bold">Proteína Req.</div>
                      <div class="text-[11px] font-black text-amber-400 font-mono">${perfil.pcMantenimientoPorc}-${perfil.pcProduccionPorc}% PC</div>
                    </div>
                    <div class="bg-slate-950 p-1.5 rounded-lg border border-slate-800">
                      <div class="text-[9px] text-slate-400 uppercase font-bold">Fósforo / Cu</div>
                      <div class="text-[11px] font-black ${esBuf ? 'text-rose-400' : 'text-cyan-400'} font-mono">${perfil.fosforoRequeridoPorc}%P ${esBuf ? '(Bajo Cu)' : ''}</div>
                    </div>
                  </div>
                  ${des.fichaZootecnicaRaza ? `
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1 text-center">
                      <div class="bg-slate-950/90 p-1.5 rounded-lg border border-slate-800/80">
                        <div class="text-[9px] text-slate-400 uppercase font-bold">1er Servicio</div>
                        <div class="text-[10px] font-black text-cyan-300 font-mono">${des.fichaZootecnicaRaza.edadPrimerServicioMeses} (${des.pesoMetaPrimerServicioKg}kg)</div>
                      </div>
                      <div class="bg-slate-950/90 p-1.5 rounded-lg border border-slate-800/80">
                        <div class="text-[9px] text-slate-400 uppercase font-bold">Edad 1er Parto</div>
                        <div class="text-[10px] font-black text-emerald-300 font-mono">${des.fichaZootecnicaRaza.edadPrimerPartoMeses}</div>
                      </div>
                      <div class="bg-slate-950/90 p-1.5 rounded-lg border border-slate-800/80">
                        <div class="text-[9px] text-slate-400 uppercase font-bold">Lactancia Raza</div>
                        <div class="text-[10px] font-black text-amber-300 font-mono">${des.fichaZootecnicaRaza.produccionLecheLactancia}</div>
                      </div>
                      <div class="bg-slate-950/90 p-1.5 rounded-lg border border-slate-800/80">
                        <div class="text-[9px] text-slate-400 uppercase font-bold">Rend. Canal</div>
                        <div class="text-[10px] font-black text-purple-300 font-mono">${des.fichaZootecnicaRaza.rendimientoCanalPorc}</div>
                      </div>
                    </div>
                  ` : ''}
                  ${perfil.manejoNutricionalEspecial ? `
                    <div class="text-[10px] text-emerald-200/90 bg-emerald-950/30 px-2.5 py-1.5 rounded-lg border border-emerald-500/20">
                      💡 <strong>Clave Nutricional de la Raza:</strong> ${perfil.manejoNutricionalEspecial}
                    </div>
                  ` : ''}
                </div>

                <!-- Tarjeta B: Análisis Directo del Desarrollo del Animal vs Estándar Racial -->
                <div class="p-3.5 rounded-xl border ${colorDesarrollo} space-y-2.5 text-xs">
                  <div class="flex items-center justify-between border-b border-slate-800/80 pb-1.5 flex-wrap gap-1">
                    <span class="font-black text-white flex items-center gap-1.5">
                      <span>📈</span> Desarrollo a los ${des.edadMesesEvaluada} Meses (${des.etapaCrecimientoNombre || 'Crecimiento'})
                    </span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-950/90 border border-slate-700">
                      Índice Racial: ${porcDesarrollo}%
                    </span>
                  </div>

                  <div class="grid grid-cols-3 gap-2 text-center">
                    <div class="bg-slate-950/90 p-2 rounded-lg border border-slate-800">
                      <div class="text-[9px] text-slate-400 uppercase font-bold">Peso Actual vs Raza</div>
                      <div class="text-xs font-black text-white font-mono">${des.pesoActualKg} vs ${des.pesoEsperadoRazaKg} kg</div>
                      <div class="text-[10px] font-bold ${des.diferenciaPesoKg >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-mono">
                        ${des.diferenciaPesoKg >= 0 ? `+${des.diferenciaPesoKg} kg` : `${des.diferenciaPesoKg} kg`}
                      </div>
                    </div>
                    <div class="bg-slate-950/90 p-2 rounded-lg border border-slate-800">
                      <div class="text-[9px] text-slate-400 uppercase font-bold">Talla Actual vs Raza</div>
                      <div class="text-xs font-black text-emerald-300 font-mono">${des.tallaActualCm} vs ${des.tallaEsperadaRazaCm} cm</div>
                      <div class="text-[10px] font-bold text-slate-400 font-mono">
                        ${des.diferenciaTallaCm >= 0 ? `+${des.diferenciaTallaCm} cm` : `${des.diferenciaTallaCm} cm`}
                      </div>
                    </div>
                    <div class="bg-slate-950/90 p-2 rounded-lg border border-slate-800">
                      <div class="text-[9px] text-slate-400 uppercase font-bold">GDP Etapa vs Meta</div>
                      <div class="text-xs font-black text-amber-300 font-mono">${des.gdpEsperadaEtapaGDia || des.gdpReferenciaPastoreoGDia} → +${des.gdpMetaCorrectivaGDia} g/d</div>
                      <div class="text-[9px] text-slate-400">${des.gdpActualAnimalGDia ? `Actual: ${des.gdpActualAnimalGDia} g/d` : 'Objetivo diario'}</div>
                    </div>
                  </div>

                  <div class="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div class="h-full ${porcDesarrollo < 78 ? 'bg-rose-500' : porcDesarrollo < 90 ? 'bg-amber-500' : 'bg-emerald-500'}" style="width: ${Math.min(100, Math.max(15, porcDesarrollo))}%"></div>
                  </div>

                  <p class="text-[11px] text-slate-200 leading-relaxed">
                    <strong>${des.etiquetaDesarrollo}:</strong> ${des.diagnosticoDesarrollo}
                  </p>
                  ${des.kgFaltantesPrimerServicio > 0 ? `
                    <div class="text-[10px] bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-cyan-500/30 text-cyan-200 font-semibold">
                      🎯 <strong>Proyección a 1er Servicio (${des.pesoMetaPrimerServicioKg} kg):</strong> Faltan <strong>${des.kgFaltantesPrimerServicio} kg</strong> (aprox. ${Math.ceil(des.kgFaltantesPrimerServicio / ((des.gdpMetaCorrectivaGDia || 650) / 1000))} días con el plan nutricional sugerido).
                    </div>
                  ` : ''}
                </div>
              </div>

              <!-- CURVA DE DESARROLLO POR EDADES Y GANANCIA DE PESO (GDP) POR ETAPA DE CRECIMIENTO -->
              <div class="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 space-y-3">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-800 pb-2">
                  <div class="text-xs font-black text-white flex items-center gap-1.5">
                    <span>📊</span> Curva Oficial de Desarrollo por Edades y Ganancia Diaria (GDP) por Etapa — ${perfil.nombre}
                  </div>
                  <span class="text-[10px] text-emerald-400 font-mono">
                    ${des.fichaZootecnicaRaza?.fuenteReferencia || 'Estándar Zootécnico ABCZ / Embrapa / Asocebú'}
                  </span>
                </div>

                <!-- Ganancia Diaria de Peso (GDP) en cada etapa de crecimiento -->
                ${des.gdpPorEtapaGDia ? `
                  <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                    <div class="bg-slate-950 p-2 rounded-lg border ${des.edadMesesEvaluada <= 7 ? 'border-emerald-500/60 bg-emerald-950/20' : 'border-slate-800'}">
                      <div class="text-[9px] text-slate-400 uppercase font-bold">1. Cría (0-7 m)</div>
                      <div class="text-xs font-black text-emerald-400 font-mono">+${des.gdpPorEtapaGDia.cria_0_7m} g/día</div>
                      <div class="text-[9px] text-slate-500">Predestete</div>
                    </div>
                    <div class="bg-slate-950 p-2 rounded-lg border ${des.edadMesesEvaluada > 7 && des.edadMesesEvaluada <= 12 ? 'border-emerald-500/60 bg-emerald-950/20' : 'border-slate-800'}">
                      <div class="text-[9px] text-slate-400 uppercase font-bold">2. Recría (7-12 m)</div>
                      <div class="text-xs font-black text-cyan-300 font-mono">+${des.gdpPorEtapaGDia.levante_7_12m} g/día</div>
                      <div class="text-[9px] text-slate-500">Post-destete</div>
                    </div>
                    <div class="bg-slate-950 p-2 rounded-lg border ${des.edadMesesEvaluada > 12 && des.edadMesesEvaluada <= 18 ? 'border-emerald-500/60 bg-emerald-950/20' : 'border-slate-800'}">
                      <div class="text-[9px] text-slate-400 uppercase font-bold">3. Levante (12-18 m)</div>
                      <div class="text-xs font-black text-amber-300 font-mono">+${des.gdpPorEtapaGDia.levante_12_18m} g/día</div>
                      <div class="text-[9px] text-slate-500">Entrada Servicio</div>
                    </div>
                    <div class="bg-slate-950 p-2 rounded-lg border ${des.edadMesesEvaluada > 18 && des.edadMesesEvaluada <= 24 ? 'border-emerald-500/60 bg-emerald-950/20' : 'border-slate-800'}">
                      <div class="text-[9px] text-slate-400 uppercase font-bold">4. Vientre/Ceba (18-24 m)</div>
                      <div class="text-xs font-black text-purple-300 font-mono">+${des.gdpPorEtapaGDia.vientre_ceba_18_24m} g/día</div>
                      <div class="text-[9px] text-slate-500">Novilla / Torete</div>
                    </div>
                    <div class="bg-slate-950 p-2 rounded-lg border border-amber-500/30">
                      <div class="text-[9px] text-amber-300 uppercase font-bold">🏆 Pista / Sup. Intensiva</div>
                      <div class="text-xs font-black text-amber-400 font-mono">+${des.gdpPorEtapaGDia.pista_intensivo} g/día</div>
                      <div class="text-[9px] text-slate-500">Potencial Genético</div>
                    </div>
                  </div>
                ` : ''}

                <!-- Tabla de hitos de peso y alzada por edades (0m a Adulto) -->
                ${Array.isArray(des.tablaHitosRaza) && des.tablaHitosRaza.length > 0 ? `
                  <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr class="border-b border-slate-800 text-[9px] uppercase text-slate-400 font-black">
                          <th class="py-1.5 px-2">Etapa / Edad</th>
                          ${des.tablaHitosRaza.map(h => `
                            <th class="py-1.5 px-2 text-center ${Math.abs((des.edadMesesEvaluada || 24) - h.edadMeses) <= 3 ? 'text-emerald-300 bg-emerald-950/40 rounded-t-lg' : ''}">
                              ${h.etapa}
                            </th>
                          `).join('')}
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-800/60 font-mono">
                        <tr>
                          <td class="py-1.5 px-2 font-sans font-bold text-slate-300">Peso Estándar Raza (${des.sexoEvaluado === 'macho' ? 'Macho' : 'Hembra'})</td>
                          ${des.tablaHitosRaza.map(h => `
                            <td class="py-1.5 px-2 text-center font-black ${Math.abs((des.edadMesesEvaluada || 24) - h.edadMeses) <= 3 ? 'text-emerald-300 bg-emerald-950/30' : 'text-white'}">
                              ${h.pesoEsperadoKg} kg
                            </td>
                          `).join('')}
                        </tr>
                        <tr>
                          <td class="py-1.5 px-2 font-sans font-bold text-slate-400">Alzada Estándar (Cruz/Grupa)</td>
                          ${des.tablaHitosRaza.map(h => `
                            <td class="py-1.5 px-2 text-center ${Math.abs((des.edadMesesEvaluada || 24) - h.edadMeses) <= 3 ? 'text-cyan-300 font-black bg-emerald-950/30' : 'text-slate-400'}">
                              ${h.tallaEsperadaCm ? `${h.tallaEsperadaCm} cm` : '—'}
                            </td>
                          `).join('')}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ` : ''}
              </div>
            </div>

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
                  <label class="block text-[10px] font-black uppercase text-slate-400 mb-1">1. Peso en Ficha (kg)</label>
                  <input
                    id="input-nutri-peso"
                    type="number"
                    value="${pesoSincronizado}"
                    class="w-full bg-slate-900 border border-slate-700 text-slate-300 px-3 py-2 rounded-xl text-sm font-black font-mono outline-none cursor-not-allowed opacity-90"
                    readonly
                    title="Sincronizado automáticamente con el último pesaje válido de la ficha técnica."
                  />
                  <span class="text-[9px] text-slate-400 mt-0.5 block truncate">📅 Ficha: ${formatearFecha(animal.fechaUltimoPesaje, 'Último pesaje')}</span>
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

              <!-- ZONA DE ESCANEO FOTOGRÁFICO MORFOLÓGICO EFÍMERO & BOTONES DE ACTUALIZACIÓN IA -->
              <div class="bg-gradient-to-r from-slate-900 to-slate-900/60 p-3.5 rounded-xl border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div class="space-y-0.5">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="text-base">📸</span>
                    <span class="text-xs font-black text-white">Escaneo Morfológico Fotográfico & Diagnóstico Gemini IA</span>
                    <span class="px-2 py-0.2 rounded-full text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">100% EFÍMERO</span>
                    <span class="text-[10px] font-bold text-purple-300">
                      ✨ Motor IA Global Activo (${obtenerModeloGeminiActivo()})
                    </span>
                  </div>
                  <p class="text-[10px] text-slate-400">
                    Sube una foto del ejemplar o pulsa <strong>Actualizar Plan IA</strong> para recalcular dieta, medicamentos y vitaminas según su raza confirmada y curva de desarrollo.
                  </p>
                </div>

                <div class="flex items-center gap-2 shrink-0 flex-wrap">
                  <label class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-white font-bold text-xs flex items-center gap-2 cursor-pointer border border-slate-700 transition">
                    <span>${this.analisisFotoEnCurso ? '⏳' : '📷'}</span>
                    <span>${this.analisisFotoEnCurso ? 'Analizando...' : 'Subir / Tomar Foto'}</span>
                    <input id="input-foto-nutri-efimera" type="file" accept="image/*" capture="environment" class="hidden" />
                  </label>
                  <button
                    id="btn-recalcular-plan"
                    ${this.consultaGeminiEnCurso ? 'disabled' : ''}
                    class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs flex items-center gap-1.5 shadow transition cursor-pointer ${this.consultaGeminiEnCurso ? 'opacity-60 cursor-wait' : ''}"
                  >
                    <span>${this.consultaGeminiEnCurso ? '⏳' : '⚡'}</span>
                    <span>${this.consultaGeminiEnCurso ? 'Consultando IA...' : 'Actualizar Plan IA'}</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- RESULTADO 1: DIETA & RACIÓN ZOOTÉCNICA -->
            <div class="bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3">
              <div class="flex items-center justify-between pb-2 border-b border-slate-800">
                <h4 class="text-xs sm:text-sm font-black text-white flex items-center gap-2">
                  <span>🌾</span> 1. Ración & Dieta Zootécnica de Precisión (${perfil.nombre})
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
                <h4 class="text-xs sm:text-sm font-black text-emerald-300">Diagnóstico Zootécnico Integral & de Desarrollo Racial (IA)</h4>
              </div>
              <p class="text-xs text-slate-300 leading-relaxed font-sans whitespace-pre-line">
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

      // Cambio de Raza, Confirmación de Raza o Edad recalcula inmediatamente el análisis de desarrollo racial
      const inputRaza = this.container.querySelector('#input-nutri-raza');
      const checkRaza = this.container.querySelector('#check-nutri-raza-confirmada');
      const inputEdad = this.container.querySelector('#input-nutri-edad-meses');

      // Selección rápida de razas priorizadas (Red Sindhi, Gyr, Guzerat, Nelore, Girolando, Brahman)
      this.container.querySelectorAll('.btn-chip-raza-priorizada').forEach((btnChip) => {
        btnChip.addEventListener('click', () => {
          const razaNombre = btnChip.getAttribute('data-raza-nombre');
          if (razaNombre && inputRaza) {
            inputRaza.value = razaNombre;
            if (checkRaza) checkRaza.checked = true;
            this.calcularPlanDesdeFormulario(false);
          }
        });
      });

      if (inputRaza) {
        inputRaza.addEventListener('change', () => {
          if (checkRaza) checkRaza.checked = true;
          this.calcularPlanDesdeFormulario(false);
        });
      }
      if (checkRaza) {
        checkRaza.addEventListener('change', () => {
          this.calcularPlanDesdeFormulario(false);
        });
      }
      if (inputEdad) {
        inputEdad.addEventListener('change', () => {
          this.calcularPlanDesdeFormulario(false);
        });
      }

      // Botón Recalcular Plan IA (invoca también Gemini en vivo si tiene API Key)
      const btnRecalcular = this.container.querySelector('#btn-recalcular-plan');
      if (btnRecalcular) {
        btnRecalcular.addEventListener('click', () => {
          this.calcularPlanDesdeFormulario(true);
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
        btnGuardarModal.addEventListener('click', async () => {
          await this.calcularPlanDesdeFormulario(false);
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
