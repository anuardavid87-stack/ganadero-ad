/**
 * GANADERO AD - CENTRO DE INFORMES & INTELIGENCIA GANADERA (INFORMES)
 * Basado en estándares zootécnicos internacionales y tropicales:
 * - ICAR (International Committee for Animal Recording - Lactancia 305d / 270d)
 * - FEDEGÁN & AGROSAVIA (Eficiencia reproductiva IEP, Días Abiertos, Carga UGG y Bienestar)
 * - EMBRAPA Gado de Leite & Gado de Corte (Evaluación racial, GDP en pastoreo y Mérito Genético)
 * - Software Ganadero SG / DairyComp 305 (Rankings productivos, Progenie y Descarte Técnico)
 *
 * Permite:
 * 1. Ejecutar 12 Informes Ganaderos Especializados con un clic (Rankings de Leche, Peso, GDP, IEP,
 *    Desempeño por Raza, Vientres Abiertos, Próximos Partos/Secado, Mérito Genético, Candidatos a Descarte,
 *    Evaluación de Progenie por Padre/Madre, Carga UGG por Lote y Explorador Libre).
 * 2. Cruzar cualquier combinación de filtros (Raza ej. Simmental, Especie, Categoría, Lote, Sexo,
 *    Estado Reproductivo, Padre/Toro, Rangos de Peso/GDP/Leche).
 * 3. Elegir exactamente qué dato(s) visualizar:
 *    - "Solo el Dato Seleccionado" (Enfoque directo en la métrica elegida, ej. Raza Simmental -> GDP)
 *    - "Todos los Datos" (Ficha tabular completa del ejemplar)
 *    - Enfoques temáticos (Carne/Peso, Leche/Lactancia, Reproducción/IEP, Genealogía)
 *    - Selección Personalizada de Columnas (check/uncheck de cada variable).
 * 4. Agrupar y comparar estadísticamente por Raza, Lote, Categoría, Padre o Estado Reproductivo,
 *    y exportar cualquier informe personalizado a Excel (.xlsx / .csv).
 */

import {
  calcularDiasAbiertos,
  calcularDEL,
  calcularIEP,
  calcularEdadMeses,
  verificarSecado7Meses,
  formatearFecha,
  PARAMETROS_ESPECIES
} from '../core/zootecnia.js';
import { conectarAutosuggestAnimales } from '../ui/AutosuggestAnimales.js';

export const RAZAS_REFERENCIA_GANADERA = [
  'Simmental',
  'Brahman',
  'Gyr',
  'Girolando',
  'Guzerá',
  'Nelore',
  'Holstein',
  'Jersey',
  'Pardo Suizo',
  'Normando',
  'Brangus',
  'Angus',
  'Senepol',
  'Simbrah',
  'Romosinuano',
  'BON (Blanco Orejinegro)',
  'Hartón del Valle',
  'Cebú Comercial',
  'F1 Lechero',
  'Murrah',
  'Mediterráneo',
  'Jafarabadi',
  'Bufalypso'
];

export const CATALOGO_INFORMES_GANADEROS = [
  {
    id: 'explorador_libre',
    nombre: 'Explorador Libre & Cruce por Raza',
    subtitulo: 'Filtra cualquier raza o lote y elige un dato o todos',
    icono: '🔬',
    fuente: 'Multicriterio / Custom BI',
    descripcion: 'Selecciona cualquier raza (ej. Simmental, Brahman, Girolando), categoría o lote, y elige ver un dato específico (ej. Ganancia de Peso) o todos los datos zootécnicos del grupo.',
    config: {
      filtroOrden: 'gdp_desc',
      modoColumnas: 'todas',
      agruparPor: 'raza',
      filtroSexo: 'todos',
      filtroRepro: 'todos',
      soloEnOrdeno: false,
      soloConPartos: false,
      soloCandidatosDescarte: false
    }
  },
  {
    id: 'ranking_leche',
    nombre: 'Ranking de Producción de Leche (305d)',
    subtitulo: 'Élite lechera, L/día, L/mes y proyección a 305 días',
    icono: '🥛',
    fuente: 'ICAR / EMBRAPA Gado de Leite',
    descripcion: 'Clasifica las hembras productoras de mayor a menor producción diaria (L/día), proyecta lactancia estandarizada a 305 días (bovino) / 270 días (bufalino), Días en Leche (DEL) e ingreso estimado.',
    config: {
      filtroOrden: 'leche_desc',
      modoColumnas: 'leche_lactancia',
      agruparPor: 'ninguno',
      filtroSexo: 'hembra',
      filtroRepro: 'todos',
      soloEnOrdeno: false,
      soloConPartos: false,
      soloCandidatosDescarte: false
    }
  },
  {
    id: 'ranking_gdp',
    nombre: 'Ranking de Ganancia de Peso (GDP)',
    subtitulo: 'Velocidad de crecimiento (g/día), kg/mes y ceba',
    icono: '⚖️',
    fuente: 'AGROSAVIA / EMBRAPA Corte',
    descripcion: 'Ordena los ejemplares según su Ganancia Diaria de Peso (g/día y kg/mes), comparando cada animal contra el promedio de su raza o lote y proyectando días a peso de venta (480 kg).',
    config: {
      filtroOrden: 'gdp_desc',
      modoColumnas: 'carne_peso',
      agruparPor: 'raza',
      filtroSexo: 'todos',
      filtroRepro: 'todos',
      soloEnOrdeno: false,
      soloConPartos: false,
      soloCandidatosDescarte: false
    }
  },
  {
    id: 'ranking_peso',
    nombre: 'Ranking de Peso Corporal & Lote de Venta',
    subtitulo: 'Peso actual (kg), carga UGG y valor comercial en pie',
    icono: '🏋️',
    fuente: 'FEDEGÁN / Comercialización Ceba',
    descripcion: 'Clasifica el hato de mayor a menor peso corporal (kg), calcula el equivalente en Unidades Gran Ganado (UGG = 450 kg) y estima el valor comercial en pie de los ejemplares listos para camión.',
    config: {
      filtroOrden: 'peso_desc',
      modoColumnas: 'carne_peso',
      agruparPor: 'lote',
      filtroSexo: 'todos',
      filtroRepro: 'todos',
      soloEnOrdeno: false,
      soloConPartos: false,
      soloCandidatosDescarte: false
    }
  },
  {
    id: 'ranking_iep',
    nombre: 'Ranking de Intervalo Entre Partos (IEP)',
    subtitulo: 'Eficiencia reproductiva (meta 365-400 días) vs alargados',
    icono: '📅',
    fuente: 'FEDEGÁN / Software Ganadero SG',
    descripcion: 'Evalúa la eficiencia reproductiva de los vientres según su Intervalo Entre Partos (IEP proyectado en días y meses), destacando las vacas más fértiles (menor IEP) y detectando retrasos.',
    config: {
      filtroOrden: 'iep_asc',
      modoColumnas: 'reproduccion_iep',
      agruparPor: 'ninguno',
      filtroSexo: 'hembra',
      filtroRepro: 'todos',
      soloEnOrdeno: false,
      soloConPartos: true,
      soloCandidatosDescarte: false
    }
  },
  {
    id: 'analisis_raza',
    nombre: 'Comparativa y Comportamiento por Raza',
    subtitulo: 'Cruce estadístico racial: GDP, Peso, Leche, IEP y Preñez',
    icono: '🧬',
    fuente: 'EMBRAPA / Asociaciones Raciales',
    descripcion: 'Compara el rendimiento real de cada raza presente en la finca (ej. Simmental vs Brahman vs Girolando) en ganancia de peso, producción lechera, fertilidad y adaptación.',
    config: {
      filtroOrden: 'gdp_desc',
      modoColumnas: 'todas',
      agruparPor: 'raza',
      filtroSexo: 'todos',
      filtroRepro: 'todos',
      soloEnOrdeno: false,
      soloConPartos: false,
      soloCandidatosDescarte: false
    }
  },
  {
    id: 'vientres_abiertos',
    nombre: 'Vientres Abiertos & Días Abiertos Críticos',
    subtitulo: 'Prioridad veterinaria de palpación, IATF y repaso con toro',
    icono: '⏳',
    fuente: 'DairyComp 305 / Reproducción Bovina',
    descripcion: 'Filtra las hembras vacías ordenadas de mayor a menor cantidad de Días Abiertos (>90d en observación, >120d alerta, >200d crítica) y estima el costo económico por días abiertos.',
    config: {
      filtroOrden: 'abiertos_desc',
      modoColumnas: 'reproduccion_iep',
      agruparPor: 'lote',
      filtroSexo: 'hembra',
      filtroRepro: 'vacia',
      soloEnOrdeno: false,
      soloConPartos: false,
      soloCandidatosDescarte: false
    }
  },
  {
    id: 'proximos_partos_secado',
    nombre: 'Proyección de Partos & Secado (7 Meses)',
    subtitulo: 'Hembras preñadas, fecha probable de parto y lote maternidad',
    icono: '🤰',
    fuente: 'Protocolo Preparto (283d Vacuno / 310d Bufalino)',
    descripcion: 'Lista todas las hembras preñadas de mayor a menor avance gestacional, proyectando la fecha exacta de parto y alertando las que cumplen 7 meses para secado inmediato.',
    config: {
      filtroOrden: 'prened_desc',
      modoColumnas: 'reproduccion_iep',
      agruparPor: 'ninguno',
      filtroSexo: 'hembra',
      filtroRepro: 'preñad',
      soloEnOrdeno: false,
      soloConPartos: false,
      soloCandidatosDescarte: false
    }
  },
  {
    id: 'merito_genetico',
    nombre: 'Índice de Mérito Genético & Madres Élite',
    subtitulo: 'Selección multicriterio (0-100 pts) para cría y reemplazos',
    icono: '🏆',
    fuente: 'Índice de Mérito Neto (ICAR / BLUP Práctico)',
    descripcion: 'Combina en un puntaje de 0 a 100 pts la Ganancia de Peso (GDP), Producción Lechera, Eficiencia Reproductiva (IEP/Días Abiertos) y Partos para elegir las mejores madres donadoras.',
    config: {
      filtroOrden: 'merito_desc',
      modoColumnas: 'todas',
      agruparPor: 'raza',
      filtroSexo: 'todos',
      filtroRepro: 'todos',
      soloEnOrdeno: false,
      soloConPartos: false,
      soloCandidatosDescarte: false
    }
  },
  {
    id: 'candidatos_descarte',
    nombre: 'Candidatos a Descarte Técnico / Improductivos',
    subtitulo: 'Depuración por baja GDP (<300g/d) o infertilidad (>200d abiertos)',
    icono: '🚨',
    fuente: 'Auditoría Técnica de Presión de Selección',
    descripcion: 'Identifica objetivamente los animales que están generando pérdidas en el hato por ganancia diaria inferior a 300 g/día, más de 200 días abiertos o IEP superior a 480 días.',
    config: {
      filtroOrden: 'abiertos_desc',
      modoColumnas: 'todas',
      agruparPor: 'categoria',
      filtroSexo: 'todos',
      filtroRepro: 'todos',
      soloEnOrdeno: false,
      soloConPartos: false,
      soloCandidatosDescarte: true
    }
  },
  {
    id: 'evaluacion_progenie',
    nombre: 'Evaluación de Progenie por Padre / Toro',
    subtitulo: 'Desempeño de hijos por reproductor (GDP, Peso y Leche)',
    icono: '🐂',
    fuente: 'Prueba de Progenie & Genealogía Aplicada',
    descripcion: 'Cruza la información genealógica para evaluar cómo se comportan los hijos de cada Toro (Padre) o Vaca (Madre) en Ganancia de Peso, Peso Corporal y Producción de Leche.',
    config: {
      filtroOrden: 'gdp_desc',
      modoColumnas: 'genealogia_edad',
      agruparPor: 'padre',
      filtroSexo: 'todos',
      filtroRepro: 'todos',
      soloEnOrdeno: false,
      soloConPartos: false,
      soloCandidatosDescarte: false
    }
  },
  {
    id: 'carga_ugg_lotes',
    nombre: 'Estructura del Hato, Edad & Carga UGG por Lote',
    subtitulo: 'Biomasa total (kg), Unidades Gran Ganado y pirámide etaria',
    icono: '🌱',
    fuente: 'AGROSAVIA MEP-2 / Manejo de Praderas',
    descripcion: 'Analiza la distribución del ganado por Lote y Categoría, calculando Kilos totales en pie, Unidades Gran Ganado (UGG) y edad promedio en meses para ajustar carga de potreros.',
    config: {
      filtroOrden: 'ugg_desc',
      modoColumnas: 'todas',
      agruparPor: 'lote',
      filtroSexo: 'todos',
      filtroRepro: 'todos',
      soloEnOrdeno: false,
      soloConPartos: false,
      soloCandidatosDescarte: false
    }
  }
];

export const DEFINICION_COLUMNAS_INFORME = [
  { id: 'especie', label: 'Especie', icono: '🐂' },
  { id: 'categoria_lote', label: 'Categoría & Lote', icono: '📍' },
  { id: 'edad', label: 'Edad (Meses)', icono: '🎂' },
  { id: 'peso', label: 'Peso Actual & UGG', icono: '🏋️' },
  { id: 'gdp', label: 'Ganancia Peso (GDP & Kg/Mes)', icono: '⚖️' },
  { id: 'leche', label: 'Leche (L/d & Proy. 305d)', icono: '🥛' },
  { id: 'repro_prenez', label: 'Estado Repro & Preñez', icono: '🤰' },
  { id: 'dias_abiertos', label: 'Días Abiertos', icono: '⏳' },
  { id: 'iep', label: 'IEP Proyectado & Partos', icono: '📅' },
  { id: 'genealogia', label: 'Genealogía (Padre/Madre)', icono: '🌳' },
  { id: 'valor_merito', label: 'Mérito & Valor Estimado', icono: '🏆' }
];

export class TablaDinamica {
  constructor({ containerId, getAnimales, getAnimalesBusqueda, getFincaActiva, onVerFicha }) {
    this.container = typeof document !== 'undefined' && containerId ? document.getElementById(containerId) : null;
    this.getAnimales = getAnimales;
    this.getAnimalesBusqueda = getAnimalesBusqueda;
    this.getFincaActiva = getFincaActiva;
    this.onVerFicha = onVerFicha;

    // Estado del informe activo y filtros multicriterio
    this.informeActivoId = 'explorador_libre';
    this.filtroEspecie = 'todas'; // 'todas' | 'bovino' | 'bufalino'
    this.filtroRaza = 'todas'; // 'todas' | nombre de raza (ej. 'Simmental', 'Brahman', etc.)
    this.filtroCategoria = 'todas';
    this.filtroLote = 'todos';
    this.filtroSexo = 'todos'; // 'todos' | 'hembra' | 'macho'
    this.filtroRepro = 'todos'; // 'todos' | 'preñad' | 'vacia' | 'servid'
    this.filtroPadre = 'todos';
    this.filtroOrden = 'gdp_desc'; // 'gdp_desc' | 'gdp_asc' | 'leche_desc' | 'lactancia305_desc' | 'abiertos_desc' | 'peso_desc' | 'peso_asc' | 'prened_desc' | 'iep_desc' | 'iep_asc' | 'merito_desc' | 'edad_desc' | 'partos_desc' | 'ugg_desc' | 'valor_desc'
    this.modoColumnas = 'todas'; // 'todas' | 'solo_dato' | 'carne_peso' | 'leche_lactancia' | 'reproduccion_iep' | 'genealogia_edad' | 'personalizado'
    this.agruparPor = 'raza'; // 'ninguno' | 'raza' | 'lote' | 'categoria' | 'padre' | 'estadoReproductivo' | 'sexo'

    this.pesoMinimo = '';
    this.gdpMinima = '';
    this.lecheMinima = '';
    this.soloEnOrdeno = false;
    this.soloConPartos = false;
    this.soloCandidatosDescarte = false;
    this.busqueda = '';

    this.columnasPersonalizadas = new Set(DEFINICION_COLUMNAS_INFORME.map((c) => c.id));
  }

  init() {
    this.render();
  }

  obtenerPreciosFinca() {
    const finca = typeof this.getFincaActiva === 'function' ? this.getFincaActiva() : null;
    return {
      nombreFinca: finca?.nombre || 'Predio Activo',
      precioLecheLitro: Number(finca?.precioLecheLitro || 2450),
      precioCarneKgPie: Number(finca?.precioCarneKgPie || 8900)
    };
  }

  calcularIndiceMeritoAnimal(animal) {
    const fParto = animal.fechaUltimoParto || animal.ultimoParto;
    const especie = animal.especie || 'bovino';
    const diasAbiertos = calcularDiasAbiertos(fParto, animal.estadoReproductivo);
    const iep = calcularIEP(diasAbiertos, especie);
    const gdp = animal.gdpPromedioGDia !== undefined && animal.gdpPromedioGDia !== null
      ? Number(animal.gdpPromedioGDia)
      : (animal.gdpActual !== undefined && animal.gdpActual !== null ? Number(animal.gdpActual) : null);
    const leche = Number(animal.promedioLecheDiariaL !== undefined ? animal.promedioLecheDiariaL : (animal.produccionLecheDiaria || 0));
    const estaPrenada = (animal.estadoReproductivo || '').toLowerCase().includes('prenad') || (animal.estadoReproductivo || '').toLowerCase().includes('preñad');
    const numPartos = Array.isArray(animal.partosPrevios) ? animal.partosPrevios.length : Number(animal.numeroPartos || (fParto ? 1 : 0));

    let puntaje = 50;

    // 1. Componente Crecimiento / Carne (GDP)
    if (gdp !== null && !isNaN(gdp)) {
      if (gdp >= 800) puntaje += 25;
      else if (gdp >= 600) puntaje += 18;
      else if (gdp >= 450) puntaje += 10;
      else if (gdp < 300) puntaje -= 18;
    }

    // 2. Componente Producción Lechera
    if (leche > 0) {
      if (leche >= 18) puntaje += 25;
      else if (leche >= 12) puntaje += 18;
      else if (leche >= 8) puntaje += 10;
      else if (leche < 4) puntaje -= 5;
    }

    // 3. Componente Eficiencia Reproductiva (Hembras)
    const sexo = (animal.sexo || 'hembra').toLowerCase();
    if (sexo === 'hembra') {
      if (estaPrenada) puntaje += 12;
      if (fParto && iep.dias <= 395) puntaje += 12;
      else if (fParto && iep.dias > 450) puntaje -= 12;
      if (diasAbiertos > 200) puntaje -= 18;
      else if (diasAbiertos > 120) puntaje -= 8;
      if (numPartos >= 2) puntaje += Math.min(8, numPartos * 2);
    }

    return Math.max(5, Math.min(100, Math.round(puntaje)));
  }

  esCandidatoDescarte(animal) {
    const fParto = animal.fechaUltimoParto || animal.ultimoParto;
    const especie = animal.especie || 'bovino';
    const diasAbiertos = calcularDiasAbiertos(fParto, animal.estadoReproductivo);
    const iep = calcularIEP(diasAbiertos, especie);
    const gdp = animal.gdpPromedioGDia !== undefined && animal.gdpPromedioGDia !== null
      ? Number(animal.gdpPromedioGDia)
      : (animal.gdpActual !== undefined && animal.gdpActual !== null ? Number(animal.gdpActual) : null);

    if (gdp !== null && !isNaN(gdp) && gdp > 0 && gdp < 300) return true;
    if (diasAbiertos > 200) return true;
    if (fParto && iep.dias > 480) return true;
    return false;
  }

  obtenerMotivoDescarte(animal) {
    const motivos = [];
    const fParto = animal.fechaUltimoParto || animal.ultimoParto;
    const especie = animal.especie || 'bovino';
    const diasAbiertos = calcularDiasAbiertos(fParto, animal.estadoReproductivo);
    const iep = calcularIEP(diasAbiertos, especie);
    const gdp = animal.gdpPromedioGDia !== undefined && animal.gdpPromedioGDia !== null
      ? Number(animal.gdpPromedioGDia)
      : (animal.gdpActual !== undefined && animal.gdpActual !== null ? Number(animal.gdpActual) : null);

    if (gdp !== null && !isNaN(gdp) && gdp > 0 && gdp < 300) {
      motivos.push(`Baja GDP (${gdp} g/d)`);
    }
    if (diasAbiertos > 200) {
      motivos.push(`Vacía Crítica (${diasAbiertos} d abiertos)`);
    } else if (fParto && iep.dias > 480) {
      motivos.push(`IEP Prolongado (${iep.dias} d)`);
    }
    return motivos.join(' • ') || 'Bajo desempeño';
  }

  /**
   * Extrae y formatea el dato/métrica principal por el cual se está ordenando o analizando.
   * Mantiene compatibilidad total con los criterios base y añade métricas avanzadas de informes.
   */
  obtenerMetaDatoOrden(animal, criterio) {
    const fParto = animal.fechaUltimoParto || animal.ultimoParto;
    const especie = animal.especie || 'bovino';
    const confEsp = PARAMETROS_ESPECIES[especie] || PARAMETROS_ESPECIES.bovino;
    const diasAbiertos = calcularDiasAbiertos(fParto, animal.estadoReproductivo);
    const iep = calcularIEP(diasAbiertos, especie);
    const gdpRaw = animal.gdpPromedioGDia !== undefined ? animal.gdpPromedioGDia : (animal.gdpActual !== undefined ? animal.gdpActual : null);
    const gdp = gdpRaw !== null && gdpRaw !== undefined && gdpRaw !== '' ? Number(gdpRaw) : null;
    const leche = Number(animal.promedioLecheDiariaL !== undefined ? animal.promedioLecheDiariaL : (animal.produccionLecheDiaria || 0));
    const peso = Number(animal.ultimoPesoKg || animal.pesoActual || 0);
    const estaPrenada = (animal.estadoReproductivo || '').toLowerCase().includes('prenad') || (animal.estadoReproductivo || '').toLowerCase().includes('preñad');
    const diasG = estaPrenada ? parseInt(animal.diasGestacionActual || animal.diasGestacion || 0, 10) : 0;
    const edadMeses = animal.edadMeses !== undefined ? Number(animal.edadMeses) : calcularEdadMeses(animal.fechaNacimiento);
    const numPartos = Array.isArray(animal.partosPrevios) ? animal.partosPrevios.length : Number(animal.numeroPartos || (fParto ? 1 : 0));
    const diasLactanciaBase = especie === 'bufalino' ? 270 : 305;
    const proyeccionLactancia = Math.round(leche * diasLactanciaBase);
    const ugg = peso > 0 ? parseFloat((peso / (confEsp.pesoBaseUGG || 450)).toFixed(2)) : 0;
    const { precioCarneKgPie, precioLecheLitro } = this.obtenerPreciosFinca();
    const valorEstimado = Math.round(peso * precioCarneKgPie);
    const merito = Object.keys(animal || {}).length > 0 ? this.calcularIndiceMeritoAnimal(animal) : 0;

    switch (criterio) {
      case 'gdp_desc':
      case 'gdp_asc':
        return {
          criterio,
          tituloColumna: 'Ganancia Diaria (GDP)',
          unidad: 'g/día',
          icono: '⚖️',
          esAscendente: criterio === 'gdp_asc',
          valorNumerico: gdp !== null && !isNaN(gdp) ? gdp : -9999,
          valorEstadistico: gdp !== null && !isNaN(gdp) && gdp > 0 ? gdp : null,
          valorTexto: gdp !== null && !isNaN(gdp) ? `${gdp > 0 ? '+' : ''}${gdp} g/día` : 'No registrado',
          subtexto: gdp !== null && !isNaN(gdp)
            ? `${(gdp * 30 / 1000).toFixed(1)} kg/mes • ${gdp >= 600 ? 'Óptima' : (gdp < 300 ? 'Alerta Crítica' : 'Moderada')}`
            : '-',
          colorBadge: gdp >= 600
            ? 'bg-emerald-100 text-emerald-900 border-emerald-300 font-black'
            : (gdp !== null && gdp < 300 ? 'bg-rose-100 text-rose-900 border-rose-300 font-black' : 'bg-amber-100 text-amber-900 border-amber-300')
        };

      case 'leche_desc':
        return {
          criterio: 'leche_desc',
          tituloColumna: 'Producción Lechera',
          unidad: 'L/día',
          icono: '🥛',
          esAscendente: false,
          valorNumerico: leche || 0,
          valorEstadistico: leche > 0 ? leche : null,
          valorTexto: leche > 0 ? `${parseFloat(leche).toFixed(1)} L/día` : '0.0 L/día',
          subtexto: leche > 0 ? `~${Math.round(leche * 30)} L/mes ($${Math.round(leche * precioLecheLitro).toLocaleString('es-CO')}/d)` : 'Sin ordeño',
          colorBadge: leche >= 12
            ? 'bg-emerald-100 text-emerald-900 border-emerald-300 font-black'
            : (leche > 5 ? 'bg-blue-100 text-blue-900 border-blue-300' : 'bg-slate-100 text-slate-700 border-slate-300')
        };

      case 'lactancia305_desc':
        return {
          criterio: 'lactancia305_desc',
          tituloColumna: `Lactancia Proyectada (${diasLactanciaBase}d)`,
          unidad: 'Litros',
          icono: '🥛',
          esAscendente: false,
          valorNumerico: proyeccionLactancia || 0,
          valorEstadistico: proyeccionLactancia > 0 ? proyeccionLactancia : null,
          valorTexto: proyeccionLactancia > 0 ? `${proyeccionLactancia.toLocaleString('es-CO')} L (${diasLactanciaBase}d)` : '0 L',
          subtexto: leche > 0 ? `${leche.toFixed(1)} L/día actual` : 'Sin lactancia activa',
          colorBadge: proyeccionLactancia >= 3500
            ? 'bg-emerald-100 text-emerald-900 border-emerald-300 font-black'
            : (proyeccionLactancia > 1500 ? 'bg-blue-100 text-blue-900 border-blue-300' : 'bg-slate-100 text-slate-700 border-slate-300')
        };

      case 'abiertos_desc':
        return {
          criterio: 'abiertos_desc',
          tituloColumna: 'Días Abiertos',
          unidad: 'días',
          icono: '⏳',
          esAscendente: false,
          valorNumerico: diasAbiertos || 0,
          valorEstadistico: diasAbiertos > 0 ? diasAbiertos : null,
          valorTexto: diasAbiertos > 0 ? `${diasAbiertos} días abiertos` : (estaPrenada ? '0 d (Preñada)' : '0 días'),
          subtexto: diasAbiertos > 200
            ? '🔴 Alerta Vacía Crítica'
            : (diasAbiertos > 120 ? '🟡 En Seguimiento' : '🟢 En Rango Normal'),
          colorBadge: diasAbiertos > 200
            ? 'bg-rose-100 text-rose-900 border-rose-300 font-black'
            : (diasAbiertos > 120 ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-slate-100 text-slate-700 border-slate-300')
        };

      case 'peso_desc':
      case 'peso_asc':
        return {
          criterio,
          tituloColumna: 'Peso Corporal Actual',
          unidad: 'kg',
          icono: '🏋️',
          esAscendente: criterio === 'peso_asc',
          valorNumerico: peso || 0,
          valorEstadistico: peso > 0 ? peso : null,
          valorTexto: peso > 0 ? `${peso} kg` : 'Sin pesaje',
          subtexto: peso > 0 ? `${ugg} UGG • ${animal.categoria || 'Ejemplar'}` : (animal.categoria || 'Ejemplar'),
          colorBadge: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-black'
        };

      case 'prened_desc':
        return {
          criterio: 'prened_desc',
          tituloColumna: 'Días de Preñez',
          unidad: 'días',
          icono: '🟢',
          esAscendente: false,
          valorNumerico: diasG,
          valorEstadistico: diasG > 0 ? diasG : null,
          valorTexto: estaPrenada ? `${diasG} días de gestación` : '0 días (Vacía / No aplica)',
          subtexto: estaPrenada
            ? `~${(diasG / 30.4).toFixed(1)} meses ${verificarSecado7Meses(diasG, especie) ? '• ⚠️ SECAR' : ''}`
            : 'No gestante',
          colorBadge: estaPrenada
            ? (diasG >= 210 ? 'bg-purple-100 text-purple-900 border-purple-300 font-black' : 'bg-emerald-100 text-emerald-900 border-emerald-300')
            : 'bg-slate-100 text-slate-600 border-slate-200'
        };

      case 'iep_desc':
      case 'iep_asc':
        return {
          criterio,
          tituloColumna: 'IEP Proyectado',
          unidad: 'días',
          icono: '📅',
          esAscendente: criterio === 'iep_asc',
          valorNumerico: fParto ? iep.dias : 0,
          valorEstadistico: fParto && iep.dias > 0 ? iep.dias : null,
          valorTexto: fParto ? `${iep.dias} días (${iep.meses} m)` : 'Primeriza / Sin parto',
          subtexto: fParto ? `Último: ${formatearFecha(fParto)}` : 'Sin partos previos',
          colorBadge: fParto && iep.dias > 450
            ? 'bg-rose-100 text-rose-900 border-rose-300 font-black'
            : (fParto && iep.dias <= 400 ? 'bg-emerald-100 text-emerald-900 border-emerald-300 font-black' : 'bg-blue-100 text-blue-900 border-blue-300')
        };

      case 'merito_desc':
        return {
          criterio: 'merito_desc',
          tituloColumna: 'Índice de Mérito Genético',
          unidad: 'pts',
          icono: '🏆',
          esAscendente: false,
          valorNumerico: merito,
          valorEstadistico: merito > 0 ? merito : null,
          valorTexto: `${merito} / 100 pts`,
          subtexto: merito >= 75 ? '🌟 Élite Genética (Donadora)' : (merito >= 55 ? '✅ Superior al Promedio' : '⚠️ Bajo Mérito'),
          colorBadge: merito >= 75
            ? 'bg-amber-100 text-amber-950 border-amber-400 font-black'
            : (merito >= 55 ? 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold' : 'bg-rose-100 text-rose-900 border-rose-300')
        };

      case 'edad_desc':
        return {
          criterio: 'edad_desc',
          tituloColumna: 'Edad del Ejemplar',
          unidad: 'meses',
          icono: '🎂',
          esAscendente: false,
          valorNumerico: edadMeses || 0,
          valorEstadistico: edadMeses > 0 ? edadMeses : null,
          valorTexto: edadMeses > 0 ? `${edadMeses} meses (${(edadMeses / 12).toFixed(1)} años)` : 'Sin F. Nacimiento',
          subtexto: animal.fechaNacimiento ? `Nac: ${formatearFecha(animal.fechaNacimiento)}` : '-',
          colorBadge: 'bg-indigo-100 text-indigo-900 border-indigo-300 font-bold'
        };

      case 'partos_desc':
        return {
          criterio: 'partos_desc',
          tituloColumna: 'Historial de Partos',
          unidad: 'partos',
          icono: '🐄',
          esAscendente: false,
          valorNumerico: numPartos,
          valorEstadistico: numPartos > 0 ? numPartos : null,
          valorTexto: `${numPartos} parto(s)`,
          subtexto: fParto ? `Último: ${formatearFecha(fParto)}` : 'Sin partos registrados',
          colorBadge: numPartos >= 3
            ? 'bg-emerald-100 text-emerald-900 border-emerald-300 font-black'
            : 'bg-slate-100 text-slate-700 border-slate-300'
        };

      case 'ugg_desc':
      case 'valor_desc':
        return {
          criterio,
          tituloColumna: criterio === 'valor_desc' ? 'Valor Comercial en Pie' : 'Carga Animal (UGG)',
          unidad: criterio === 'valor_desc' ? 'COP' : 'UGG',
          icono: criterio === 'valor_desc' ? '💰' : '🌱',
          esAscendente: false,
          valorNumerico: criterio === 'valor_desc' ? valorEstimado : ugg,
          valorEstadistico: peso > 0 ? (criterio === 'valor_desc' ? valorEstimado : ugg) : null,
          valorTexto: peso > 0
            ? (criterio === 'valor_desc' ? `$${valorEstimado.toLocaleString('es-CO')}` : `${ugg} UGG (${peso} kg)`)
            : 'Sin peso',
          subtexto: peso > 0 ? `$${valorEstimado.toLocaleString('es-CO')} est. • ${ugg} UGG` : '-',
          colorBadge: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-black'
        };

      default:
        return {
          criterio: 'gdp_desc',
          tituloColumna: 'Ganancia Diaria (GDP)',
          unidad: 'g/día',
          icono: '⚖️',
          esAscendente: false,
          valorNumerico: gdp !== null ? gdp : 0,
          valorEstadistico: gdp,
          valorTexto: `${gdp || 0} g/d`,
          subtexto: '',
          colorBadge: 'bg-slate-100 text-slate-800'
        };
    }
  }

  /**
   * Activa uno de los 12 informes especializados del catálogo ganadero.
   */
  seleccionarInforme(idInforme) {
    const info = CATALOGO_INFORMES_GANADEROS.find((item) => item.id === idInforme);
    if (!info) return;

    this.informeActivoId = info.id;
    const cfg = info.config || {};
    this.filtroOrden = cfg.filtroOrden || 'gdp_desc';
    this.modoColumnas = cfg.modoColumnas || 'todas';
    this.agruparPor = cfg.agruparPor || 'ninguno';
    this.filtroSexo = cfg.filtroSexo || 'todos';
    this.filtroRepro = cfg.filtroRepro || 'todos';
    this.soloEnOrdeno = Boolean(cfg.soloEnOrdeno);
    this.soloConPartos = Boolean(cfg.soloConPartos);
    this.soloCandidatosDescarte = Boolean(cfg.soloCandidatosDescarte);

    this.render();
  }

  limpiarFiltros() {
    this.informeActivoId = 'explorador_libre';
    this.filtroEspecie = 'todas';
    this.filtroRaza = 'todas';
    this.filtroCategoria = 'todas';
    this.filtroLote = 'todos';
    this.filtroSexo = 'todos';
    this.filtroRepro = 'todos';
    this.filtroPadre = 'todos';
    this.filtroOrden = 'gdp_desc';
    this.modoColumnas = 'todas';
    this.agruparPor = 'raza';
    this.pesoMinimo = '';
    this.gdpMinima = '';
    this.lecheMinima = '';
    this.soloEnOrdeno = false;
    this.soloConPartos = false;
    this.soloCandidatosDescarte = false;
    this.busqueda = '';
    this.render();
  }

  /**
   * Determina qué columnas secundarias se muestran en la tabla según el modo elegido por el usuario.
   * Si el usuario selecciona 'solo_dato' (ej. Raza Simmental -> Solo Ganancia de Peso),
   * se ocultan las demás columnas secundarias para dejar un informe limpio centrado en ese dato.
   */
  obtenerColumnasActivas() {
    switch (this.modoColumnas) {
      case 'solo_dato':
        return new Set();
      case 'carne_peso':
        return new Set(['especie', 'categoria_lote', 'edad', 'peso', 'gdp', 'valor_merito']);
      case 'leche_lactancia':
        return new Set(['especie', 'categoria_lote', 'leche', 'repro_prenez', 'dias_abiertos', 'iep']);
      case 'reproduccion_iep':
        return new Set(['especie', 'categoria_lote', 'edad', 'repro_prenez', 'dias_abiertos', 'iep']);
      case 'genealogia_edad':
        return new Set(['especie', 'categoria_lote', 'edad', 'genealogia', 'peso', 'gdp', 'leche', 'valor_merito']);
      case 'personalizado':
        return new Set(this.columnasPersonalizadas);
      case 'todas':
      default:
        return new Set(DEFINICION_COLUMNAS_INFORME.map((c) => c.id));
    }
  }

  obtenerAnimalesBaseActivos() {
    const fuenteBase = (this.busqueda.trim().length > 0 && this.getAnimalesBusqueda)
      ? this.getAnimalesBusqueda()
      : (this.getAnimales ? this.getAnimales() : []);
    return (fuenteBase || []).filter(
      (a) => a && (a.estadoVida === 'activo' || a.estado === 'activo' || (!a.estadoVida && !a.estado))
    );
  }

  obtenerOpcionesDinamicasHato(animalesBase) {
    const razasConteo = new Map();
    const categoriasSet = new Set();
    const lotesSet = new Set();
    const padresSet = new Set();

    animalesBase.forEach((a) => {
      const r = (a.raza || '').trim();
      if (r) {
        razasConteo.set(r, (razasConteo.get(r) || 0) + 1);
      }
      if (a.categoria) categoriasSet.add(a.categoria.trim());
      if (a.lote) lotesSet.add(a.lote.trim());
      const padre = (a.padre || a.padreTag || a.toroPadre || '').trim();
      if (padre && padre !== '-') padresSet.add(padre);
    });

    // Combinar razas presentes en el hato (primero) con razas de referencia ganadera (ej. Simmental)
    const razasEnHato = Array.from(razasConteo.keys()).sort((a, b) => a.localeCompare(b));
    const razasReferenciaFaltantes = RAZAS_REFERENCIA_GANADERA.filter(
      (rRef) => !razasEnHato.some((rHato) => rHato.toLowerCase() === rRef.toLowerCase())
    );

    return {
      razasEnHato,
      razasConteo,
      razasReferenciaFaltantes,
      categorias: Array.from(categoriasSet).sort((a, b) => a.localeCompare(b)),
      lotes: Array.from(lotesSet).sort((a, b) => a.localeCompare(b)),
      padres: Array.from(padresSet).sort((a, b) => a.localeCompare(b))
    };
  }

  obtenerAnimalesFiltradosYOrdenados() {
    let animales = this.obtenerAnimalesBaseActivos();

    // 1. Filtro por Especie
    if (this.filtroEspecie !== 'todas') {
      animales = animales.filter((a) => (a.especie || 'bovino') === this.filtroEspecie);
    }

    // 2. Filtro por Raza (Coincidencia exacta o subcadena insensible a mayúsculas/acentos, ej. Simmental)
    if (this.filtroRaza && this.filtroRaza !== 'todas') {
      const razaBuscada = this.filtroRaza.trim().toLowerCase();
      animales = animales.filter((a) => {
        const razaAnimal = (a.raza || '').trim().toLowerCase();
        return razaAnimal === razaBuscada || razaAnimal.includes(razaBuscada);
      });
    }

    // 3. Filtro por Categoría
    if (this.filtroCategoria && this.filtroCategoria !== 'todas') {
      const catBuscada = this.filtroCategoria.trim().toLowerCase();
      animales = animales.filter((a) => (a.categoria || '').trim().toLowerCase().includes(catBuscada));
    }

    // 4. Filtro por Lote / Potrero
    if (this.filtroLote && this.filtroLote !== 'todos') {
      const loteBuscado = this.filtroLote.trim().toLowerCase();
      animales = animales.filter((a) => (a.lote || '').trim().toLowerCase() === loteBuscado);
    }

    // 5. Filtro por Sexo
    if (this.filtroSexo && this.filtroSexo !== 'todos') {
      const sexoBuscado = this.filtroSexo.toLowerCase();
      animales = animales.filter((a) => (a.sexo || 'hembra').toLowerCase() === sexoBuscado);
    }

    // 6. Filtro por Estado Reproductivo
    if (this.filtroRepro && this.filtroRepro !== 'todos') {
      const reproBuscado = this.filtroRepro.toLowerCase();
      animales = animales.filter((a) => {
        const st = (a.estadoReproductivo || 'Vacía').toLowerCase();
        if (reproBuscado === 'preñad' || reproBuscado === 'prenad') {
          return st.includes('preñad') || st.includes('prenad');
        }
        if (reproBuscado === 'vacia') {
          return st.includes('vacía') || st.includes('vacia') || (!st.includes('preñad') && !st.includes('prenad') && !st.includes('servid'));
        }
        return st.includes(reproBuscado);
      });
    }

    // 7. Filtro por Padre / Reproductor
    if (this.filtroPadre && this.filtroPadre !== 'todos') {
      const padreBuscado = this.filtroPadre.trim().toLowerCase();
      animales = animales.filter((a) => {
        const p = (a.padre || a.padreTag || a.toroPadre || '').trim().toLowerCase();
        return p === padreBuscado || p.includes(padreBuscado);
      });
    }

    // 8. Filtros numéricos de umbral (Peso mínimo, GDP mínima, Leche mínima)
    const pMin = parseFloat(this.pesoMinimo);
    if (!isNaN(pMin) && pMin > 0) {
      animales = animales.filter((a) => Number(a.ultimoPesoKg || a.pesoActual || 0) >= pMin);
    }

    const gMin = parseFloat(this.gdpMinima);
    if (!isNaN(gMin) && gMin > 0) {
      animales = animales.filter((a) => {
        const gdp = a.gdpPromedioGDia !== undefined ? Number(a.gdpPromedioGDia) : Number(a.gdpActual || 0);
        return !isNaN(gdp) && gdp >= gMin;
      });
    }

    const lMin = parseFloat(this.lecheMinima);
    if (!isNaN(lMin) && lMin > 0) {
      animales = animales.filter((a) => {
        const leche = Number(a.promedioLecheDiariaL !== undefined ? a.promedioLecheDiariaL : (a.produccionLecheDiaria || 0));
        return leche >= lMin;
      });
    }

    // 9. Filtros de condición de informe especializado
    if (this.soloEnOrdeno) {
      animales = animales.filter((a) => {
        const leche = Number(a.promedioLecheDiariaL !== undefined ? a.promedioLecheDiariaL : (a.produccionLecheDiaria || 0));
        const cat = (a.categoria || '').toLowerCase();
        return leche > 0 || cat.includes('ordeño') || cat.includes('lactante');
      });
    }

    if (this.soloConPartos) {
      animales = animales.filter((a) => Boolean(a.fechaUltimoParto || a.ultimoParto || (Array.isArray(a.partosPrevios) && a.partosPrevios.length > 0)));
    }

    if (this.soloCandidatosDescarte) {
      animales = animales.filter((a) => this.esCandidatoDescarte(a));
    }

    // 10. Búsqueda libre por Tag, Nombre, Raza, Categoría, Lote o Padre
    if (this.busqueda.trim().length > 0) {
      const q = this.busqueda.trim().toLowerCase();
      const qDigits = q.replace(/\D/g, '');
      animales = animales.filter((a) => {
        const tag = (a.identificacionTag || a.numero || '').toLowerCase();
        const tagDigits = tag.replace(/\D/g, '');
        const matchTag = tag.includes(q) || (qDigits.length > 0 && tagDigits.includes(qDigits));
        const matchNombre = (a.nombreAlias || a.nombre || '').toLowerCase().includes(q);
        const matchRaza = (a.raza || '').toLowerCase().includes(q);
        const matchCat = (a.categoria || '').toLowerCase().includes(q);
        const matchLote = (a.lote || '').toLowerCase().includes(q);
        const matchPadre = (a.padre || a.padreTag || '').toLowerCase().includes(q);
        return matchTag || matchNombre || matchRaza || matchCat || matchLote || matchPadre;
      });
    }

    // 11. Ordenamiento dinámico según la métrica seleccionada (ascendente o descendente)
    const infoOrd = this.obtenerMetaDatoOrden({}, this.filtroOrden);
    const esAsc = Boolean(infoOrd.esAscendente);

    animales.sort((a, b) => {
      const metaA = this.obtenerMetaDatoOrden(a, this.filtroOrden);
      const metaB = this.obtenerMetaDatoOrden(b, this.filtroOrden);
      const valA = metaA.valorNumerico;
      const valB = metaB.valorNumerico;

      // Enviar registros sin dato válido (-9999 o 0 en métricas ascendentes) al final
      const invalidoA = valA === -9999 || (esAsc && valA <= 0);
      const invalidoB = valB === -9999 || (esAsc && valB <= 0);
      if (invalidoA && !invalidoB) return 1;
      if (!invalidoA && invalidoB) return -1;

      return esAsc ? (valA - valB) : (valB - valA);
    });

    return animales;
  }

  /**
   * Calcula la Matriz de Cruce Estadístico agrupada por Raza, Lote, Categoría, Padre, Estado Reproductivo o Sexo.
   */
  calcularResumenAgrupado(animales, dimension = this.agruparPor) {
    if (!dimension || dimension === 'ninguno' || !Array.isArray(animales) || animales.length === 0) {
      return [];
    }

    const gruposMap = new Map();
    const totalGlobal = animales.length;

    animales.forEach((a) => {
      let clave = 'Sin clasificar';
      if (dimension === 'raza') clave = (a.raza || 'Común / Sin Raza').trim();
      else if (dimension === 'lote') clave = (a.lote || 'Sin Lote').trim();
      else if (dimension === 'categoria') clave = (a.categoria || 'Sin Categoría').trim();
      else if (dimension === 'padre') clave = (a.padre || a.padreTag || a.toroPadre || 'Padre No Registrado').trim();
      else if (dimension === 'estadoReproductivo') clave = (a.estadoReproductivo || 'Vacía / No aplica').trim();
      else if (dimension === 'sexo') clave = (a.sexo || 'hembra').toLowerCase() === 'macho' ? 'Machos' : 'Hembras';

      if (!gruposMap.has(clave)) {
        gruposMap.set(clave, {
          grupo: clave,
          cantidad: 0,
          pesos: [],
          gdps: [],
          leches: [],
          diasAbiertosList: [],
          ieps: [],
          edades: [],
          prenadasCount: 0,
          hembrasCount: 0,
          uggTotal: 0,
          mejorEjemplar: null,
          mejorValorOrden: -Infinity
        });
      }

      const g = gruposMap.get(clave);
      g.cantidad++;

      const peso = Number(a.ultimoPesoKg || a.pesoActual || 0);
      if (peso > 0) {
        g.pesos.push(peso);
        const baseUgg = (a.especie || 'bovino') === 'bufalino' ? 500 : 450;
        g.uggTotal += peso / baseUgg;
      }

      const gdpRaw = a.gdpPromedioGDia !== undefined ? a.gdpPromedioGDia : a.gdpActual;
      const gdp = gdpRaw !== null && gdpRaw !== undefined && gdpRaw !== '' ? Number(gdpRaw) : null;
      if (gdp !== null && !isNaN(gdp) && gdp > 0) {
        g.gdps.push(gdp);
      }

      const leche = Number(a.promedioLecheDiariaL !== undefined ? a.promedioLecheDiariaL : (a.produccionLecheDiaria || 0));
      if (leche > 0) {
        g.leches.push(leche);
      }

      const sexo = (a.sexo || 'hembra').toLowerCase();
      if (sexo === 'hembra') {
        g.hembrasCount++;
        const estaPrenada = (a.estadoReproductivo || '').toLowerCase().includes('prenad') || (a.estadoReproductivo || '').toLowerCase().includes('preñad');
        if (estaPrenada) g.prenadasCount++;

        const fParto = a.fechaUltimoParto || a.ultimoParto;
        const dAb = calcularDiasAbiertos(fParto, a.estadoReproductivo);
        if (dAb > 0) g.diasAbiertosList.push(dAb);
        if (fParto) {
          const iep = calcularIEP(dAb, a.especie || 'bovino');
          if (iep.dias > 0) g.ieps.push(iep.dias);
        }
      }

      const edad = a.edadMeses !== undefined ? Number(a.edadMeses) : calcularEdadMeses(a.fechaNacimiento);
      if (edad > 0) g.edades.push(edad);

      const metaOrd = this.obtenerMetaDatoOrden(a, this.filtroOrden);
      if (metaOrd.valorNumerico > g.mejorValorOrden) {
        g.mejorValorOrden = metaOrd.valorNumerico;
        g.mejorEjemplar = {
          tag: a.identificacionTag || a.numero,
          nombre: a.nombreAlias || a.nombre || '',
          valorTexto: metaOrd.valorTexto
        };
      }
    });

    const promediar = (arr, decimales = 0) => {
      if (!arr || arr.length === 0) return null;
      const avg = arr.reduce((acc, v) => acc + v, 0) / arr.length;
      return decimales > 0 ? Number(avg.toFixed(decimales)) : Math.round(avg);
    };

    const resumen = Array.from(gruposMap.values()).map((g) => {
      const lecheTotalDia = g.leches.reduce((acc, v) => acc + v, 0);
      return {
        grupo: g.grupo,
        cantidad: g.cantidad,
        porcentajeHato: Number(((g.cantidad / totalGlobal) * 100).toFixed(1)),
        pesoPromedio: promediar(g.pesos, 0),
        pesoTotalKg: Math.round(g.pesos.reduce((acc, v) => acc + v, 0)),
        uggTotal: Number(g.uggTotal.toFixed(2)),
        gdpPromedio: promediar(g.gdps, 0),
        gdpMax: g.gdps.length > 0 ? Math.max(...g.gdps) : null,
        lechePromedio: promediar(g.leches, 1),
        lecheTotalDia: Number(lecheTotalDia.toFixed(1)),
        diasAbiertosPromedio: promediar(g.diasAbiertosList, 0),
        iepPromedio: promediar(g.ieps, 0),
        edadPromedioMeses: promediar(g.edades, 0),
        tasaPrenezPorc: g.hembrasCount > 0 ? Math.round((g.prenadasCount / g.hembrasCount) * 100) : null,
        mejorEjemplar: g.mejorEjemplar
      };
    });

    // Ordenar los grupos por el promedio del dato activo o por cantidad de ejemplares
    resumen.sort((a, b) => {
      if (this.filtroOrden.startsWith('gdp')) return (b.gdpPromedio || 0) - (a.gdpPromedio || 0);
      if (this.filtroOrden.startsWith('leche') || this.filtroOrden.startsWith('lactancia')) return (b.lechePromedio || 0) - (a.lechePromedio || 0);
      if (this.filtroOrden.startsWith('peso') || this.filtroOrden.startsWith('ugg')) return (b.pesoPromedio || 0) - (a.pesoPromedio || 0);
      if (this.filtroOrden.startsWith('abiertos')) return (b.diasAbiertosPromedio || 0) - (a.diasAbiertosPromedio || 0);
      if (this.filtroOrden.startsWith('iep')) return (a.iepPromedio || 9999) - (b.iepPromedio || 9999);
      return b.cantidad - a.cantidad;
    });

    return resumen;
  }

  render() {
    if (!this.container) return;

    const animalesBase = this.obtenerAnimalesBaseActivos();
    const opciones = this.obtenerOpcionesDinamicasHato(animalesBase);
    const animales = this.obtenerAnimalesFiltradosYOrdenados();
    const informeActual = CATALOGO_INFORMES_GANADEROS.find((i) => i.id === this.informeActivoId) || CATALOGO_INFORMES_GANADEROS[0];
    const infoCriterio = this.obtenerMetaDatoOrden({}, this.filtroOrden);
    const columnasActivas = this.obtenerColumnasActivas();
    const resumenGrupos = this.calcularResumenAgrupado(animales, this.agruparPor);
    const { nombreFinca } = this.obtenerPreciosFinca();

    // Calcular estadísticas globales para el KPI banner del criterio activo
    const valoresValidos = animales
      .map((a) => this.obtenerMetaDatoOrden(a, this.filtroOrden).valorEstadistico)
      .filter((v) => v !== null && v !== undefined && !isNaN(v) && v > 0);

    const maxVal = valoresValidos.length > 0 ? Math.max(...valoresValidos) : 0;
    const minVal = valoresValidos.length > 0 ? Math.min(...valoresValidos) : 0;
    const avgVal = valoresValidos.length > 0
      ? (infoCriterio.unidad === 'L/día' || infoCriterio.unidad === 'UGG'
          ? Number((valoresValidos.reduce((acc, x) => acc + x, 0) / valoresValidos.length).toFixed(1))
          : Math.round(valoresValidos.reduce((acc, x) => acc + x, 0) / valoresValidos.length))
      : 0;

    // Estadísticas transversales del lote filtrado
    const pesosFiltro = animales.map((a) => Number(a.ultimoPesoKg || a.pesoActual || 0)).filter((p) => p > 0);
    const gdpsFiltro = animales
      .map((a) => (a.gdpPromedioGDia !== undefined ? Number(a.gdpPromedioGDia) : Number(a.gdpActual || 0)))
      .filter((g) => !isNaN(g) && g > 0);
    const lechesFiltro = animales
      .map((a) => Number(a.promedioLecheDiariaL !== undefined ? a.promedioLecheDiariaL : (a.produccionLecheDiaria || 0)))
      .filter((l) => l > 0);

    const promPesoFiltro = pesosFiltro.length > 0 ? Math.round(pesosFiltro.reduce((s, v) => s + v, 0) / pesosFiltro.length) : 0;
    const promGdpFiltro = gdpsFiltro.length > 0 ? Math.round(gdpsFiltro.reduce((s, v) => s + v, 0) / gdpsFiltro.length) : 0;
    const totalLecheFiltro = lechesFiltro.length > 0 ? Number(lechesFiltro.reduce((s, v) => s + v, 0).toFixed(1)) : 0;

    this.container.innerHTML = `
      <div class="space-y-4">
        <!-- ================================================================== -->
        <!-- 1. CABECERA PRINCIPAL Y CATÁLOGO DE 12 INFORMES GANADEROS          -->
        <!-- ================================================================== -->
        <div class="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
          <div class="bg-gradient-to-r from-slate-950 via-emerald-950 to-slate-950 text-white p-5 space-y-4">
            <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-2xl">📈</span>
                  <h2 class="text-base sm:text-xl font-black tracking-tight">
                    Centro de Informes & Inteligencia Ganadera
                  </h2>
                  <span class="text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-bold">
                    Rankings • Razas • Cruces Zootécnicos
                  </span>
                </div>
                <p class="text-xs text-slate-300 mt-1">
                  Estándares técnicos <strong>FEDEGÁN • AGROSAVIA • EMBRAPA • ICAR</strong> — Analiza rankings de leche, ganancia de peso, IEP, comportamiento por raza (ej. Simmental, Brahman, Girolando) y cruces personalizados en <strong>${nombreFinca}</strong>.
                </p>
              </div>

              <div class="flex flex-wrap items-center gap-2 shrink-0">
                <div id="contador-ejemplares-dinamica" class="text-xs font-mono font-black bg-slate-900/90 px-3.5 py-2 rounded-xl border border-emerald-500/40 text-emerald-300 shadow">
                  ${animales.length} Ejemplares Analizados
                </div>
                <button type="button" id="btn-exportar-informe-excel" class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs shadow-lg transition flex items-center gap-1.5 cursor-pointer">
                  <span>📥</span> Exportar Informe a Excel
                </button>
                <button type="button" id="btn-limpiar-filtros-informes" class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition cursor-pointer" title="Restablecer todos los filtros">
                  🔄 Limpiar Filtros
                </button>
              </div>
            </div>

            <!-- CATÁLOGO VISUAL DE LOS 12 INFORMES ESPECIALIZADOS -->
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-[10px] font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                  <span>📚</span> Selecciona un Informe Ganadero Especializado o usa el Explorador Libre:
                </span>
                <span class="text-[10px] text-slate-400 hidden sm:inline">Clic en cualquier tarjeta para cargar el informe</span>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                ${CATALOGO_INFORMES_GANADEROS.map((inf) => {
                  const activo = inf.id === this.informeActivoId;
                  return `
                    <button type="button" data-informe-id="${inf.id}" class="btn-seleccionar-informe text-left p-2.5 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${
                      activo
                        ? 'bg-emerald-600/30 border-emerald-400 text-white shadow-lg ring-2 ring-emerald-400/30'
                        : 'bg-slate-900/80 hover:bg-slate-800 border-slate-800 text-slate-300'
                    }">
                      <div>
                        <div class="flex items-center justify-between gap-1 mb-1">
                          <span class="text-lg">${inf.icono}</span>
                          ${activo ? '<span class="text-[9px] px-1.5 py-0.2 rounded bg-emerald-400 text-slate-950 font-black uppercase">Activo</span>' : ''}
                        </div>
                        <div class="font-black text-[11px] leading-tight text-white">${inf.nombre}</div>
                      </div>
                      <div class="text-[9px] text-slate-400 mt-1 line-clamp-2 leading-snug">${inf.subtitulo}</div>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- DESCRIPCIÓN TÉCNICA DEL INFORME ACTIVO -->
            <div class="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
              <div class="flex items-start sm:items-center gap-2.5">
                <span class="text-2xl p-1.5 rounded-xl bg-emerald-950 border border-emerald-700/60">${informeActual.icono}</span>
                <div>
                  <div class="font-black text-emerald-300 flex items-center gap-2 flex-wrap">
                    <span>${informeActual.nombre}</span>
                    <span class="text-[10px] font-mono px-2 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">Ref: ${informeActual.fuente}</span>
                  </div>
                  <p class="text-[11px] text-slate-300 mt-0.5">${informeActual.descripcion}</p>
                </div>
              </div>
            </div>

            <!-- ============================================================== -->
            <!-- 2. MOTOR DE FILTROS MULTIDIMENSIONALES Y CRUCE DE VARIABLES     -->
            <!-- ============================================================== -->
            <div class="pt-3 border-t border-slate-800/90 space-y-3 text-xs">
              <!-- FILA 1: RAZA + DATO A VER/ORDENAR + QUÉ COLUMNAS MOSTRAR + AGRUPACIÓN -->
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <!-- SELECTOR DE RAZA (EJ. SIMMENTAL, BRAHMAN, GIROLANDO, ETC.) -->
                <div class="bg-slate-900/90 p-2.5 rounded-2xl border border-emerald-500/40">
                  <label for="select-filtro-raza" class="block font-black text-emerald-300 uppercase text-[10px] mb-1 flex items-center gap-1">
                    <span>🧬</span> 1. Filtrar por Raza (Ej. Simmental):
                  </label>
                  <select id="select-filtro-raza" class="w-full px-3 py-2 bg-slate-950 border border-emerald-500/60 rounded-xl text-white font-black outline-none cursor-pointer focus:border-emerald-400">
                    <option value="todas" ${this.filtroRaza === 'todas' ? 'selected' : ''}>Todas las Razas (${animalesBase.length} animales)</option>
                    ${opciones.razasEnHato.length > 0 ? `
                      <optgroup label="Razas Presentes en la Finca">
                        ${opciones.razasEnHato.map((r) => `
                          <option value="${r}" ${this.filtroRaza.toLowerCase() === r.toLowerCase() ? 'selected' : ''}>
                            🧬 ${r} (${opciones.razasConteo.get(r) || 0} animales)
                          </option>
                        `).join('')}
                      </optgroup>
                    ` : ''}
                    <optgroup label="Catálogo de Razas Ganaderas (Búsqueda Directa)">
                      ${opciones.razasReferenciaFaltantes.map((r) => `
                        <option value="${r}" ${this.filtroRaza.toLowerCase() === r.toLowerCase() ? 'selected' : ''}>
                          🧬 ${r} (0 en hato actual)
                        </option>
                      `).join('')}
                    </optgroup>
                  </select>
                </div>

                <!-- SELECTOR DEL DATO / MÉTRICA PRINCIPAL A ANALIZAR Y ORDENAR -->
                <div class="bg-slate-900/90 p-2.5 rounded-2xl border border-emerald-500/40">
                  <label for="select-filtro-orden" class="block font-black text-emerald-300 uppercase text-[10px] mb-1 flex items-center gap-1">
                    <span>🎯</span> 2. Dato Principal a Evaluar / Ranking:
                  </label>
                  <select id="select-filtro-orden" class="w-full px-3 py-2 bg-emerald-950 border-2 border-emerald-500 rounded-xl text-emerald-100 font-black outline-none cursor-pointer">
                    <option value="gdp_desc" ${this.filtroOrden === 'gdp_desc' ? 'selected' : ''}>⚖️ Ganancia Diaria de Peso - GDP (Mayor a Menor)</option>
                    <option value="gdp_asc" ${this.filtroOrden === 'gdp_asc' ? 'selected' : ''}>⚖️ Ganancia Diaria de Peso - GDP (Menor a Mayor / Rezago)</option>
                    <option value="leche_desc" ${this.filtroOrden === 'leche_desc' ? 'selected' : ''}>🥛 Producción de Leche L/día (Mayor a Menor)</option>
                    <option value="lactancia305_desc" ${this.filtroOrden === 'lactancia305_desc' ? 'selected' : ''}>🥛 Lactancia Proyectada 305 Días (Mayor a Menor)</option>
                    <option value="peso_desc" ${this.filtroOrden === 'peso_desc' ? 'selected' : ''}>🏋️ Peso Corporal Actual (Mayor a Menor)</option>
                    <option value="peso_asc" ${this.filtroOrden === 'peso_asc' ? 'selected' : ''}>🏋️ Peso Corporal Actual (Menor a Mayor)</option>
                    <option value="iep_asc" ${this.filtroOrden === 'iep_asc' ? 'selected' : ''}>📅 Intervalo Entre Partos - IEP (Mejor / Menor a Mayor)</option>
                    <option value="iep_desc" ${this.filtroOrden === 'iep_desc' ? 'selected' : ''}>📅 Intervalo Entre Partos - IEP (Crítico / Mayor a Menor)</option>
                    <option value="abiertos_desc" ${this.filtroOrden === 'abiertos_desc' ? 'selected' : ''}>⏳ Días Abiertos (Mayor a Menor - Críticos)</option>
                    <option value="prened_desc" ${this.filtroOrden === 'prened_desc' ? 'selected' : ''}>🟢 Días de Preñez / Gestación (Mayor a Menor)</option>
                    <option value="merito_desc" ${this.filtroOrden === 'merito_desc' ? 'selected' : ''}>🏆 Índice de Mérito Genético Global (Mayor a Menor)</option>
                    <option value="edad_desc" ${this.filtroOrden === 'edad_desc' ? 'selected' : ''}>🎂 Edad en Meses (Mayor a Menor)</option>
                    <option value="partos_desc" ${this.filtroOrden === 'partos_desc' ? 'selected' : ''}>🐄 Número de Partos (Mayor a Menor)</option>
                    <option value="ugg_desc" ${this.filtroOrden === 'ugg_desc' ? 'selected' : ''}>🌱 Equivalente Carga Animal UGG (Mayor a Menor)</option>
                    <option value="valor_desc" ${this.filtroOrden === 'valor_desc' ? 'selected' : ''}>💰 Valor Comercial Estimado en Pie (Mayor a Menor)</option>
                  </select>
                </div>

                <!-- SELECTOR DE QUÉ DATOS / COLUMNAS MOSTRAR EN PANTALLA -->
                <div class="bg-slate-900/90 p-2.5 rounded-2xl border border-emerald-500/40">
                  <label for="select-modo-columnas" class="block font-black text-emerald-300 uppercase text-[10px] mb-1 flex items-center gap-1">
                    <span>👁️</span> 3. ¿Qué Datos Quieres Ver?:
                  </label>
                  <select id="select-modo-columnas" class="w-full px-3 py-2 bg-slate-950 border border-emerald-500/60 rounded-xl text-white font-black outline-none cursor-pointer">
                    <option value="todas" ${this.modoColumnas === 'todas' ? 'selected' : ''}>📋 Ver Todos los Datos (Vista Completa)</option>
                    <option value="solo_dato" ${this.modoColumnas === 'solo_dato' ? 'selected' : ''}>🎯 Ver SOLO el Dato Seleccionado (${infoCriterio.tituloColumna})</option>
                    <option value="carne_peso" ${this.modoColumnas === 'carne_peso' ? 'selected' : ''}>⚖️ Datos de Peso, Ganancia (GDP) & Ceba</option>
                    <option value="leche_lactancia" ${this.modoColumnas === 'leche_lactancia' ? 'selected' : ''}>🥛 Datos de Leche, Lactancia 305d & Repro</option>
                    <option value="reproduccion_iep" ${this.modoColumnas === 'reproduccion_iep' ? 'selected' : ''}>🧬 Datos Reproductivos (Preñez, Abiertos, IEP)</option>
                    <option value="genealogia_edad" ${this.modoColumnas === 'genealogia_edad' ? 'selected' : ''}>🌳 Datos de Genealogía (Padre/Madre) & Edad</option>
                    <option value="personalizado" ${this.modoColumnas === 'personalizado' ? 'selected' : ''}>⚙️ Elegir Columnas Manualmente (Personalizado)</option>
                  </select>
                </div>

                <!-- SELECTOR DE CRUCE / AGRUPACIÓN ESTADÍSTICA -->
                <div class="bg-slate-900/90 p-2.5 rounded-2xl border border-slate-700">
                  <label for="select-agrupar-por" class="block font-bold text-slate-300 uppercase text-[10px] mb-1 flex items-center gap-1">
                    <span>📊</span> 4. Cruzar y Comparar Resumen Por:
                  </label>
                  <select id="select-agrupar-por" class="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-bold outline-none cursor-pointer">
                    <option value="raza" ${this.agruparPor === 'raza' ? 'selected' : ''}>🧬 Agrupar y Comparar por RAZA</option>
                    <option value="lote" ${this.agruparPor === 'lote' ? 'selected' : ''}>📍 Agrupar y Comparar por LOTE / POTRERO</option>
                    <option value="categoria" ${this.agruparPor === 'categoria' ? 'selected' : ''}>🏷️ Agrupar y Comparar por CATEGORÍA</option>
                    <option value="padre" ${this.agruparPor === 'padre' ? 'selected' : ''}>🐂 Agrupar por PADRE / TORO (Progenie)</option>
                    <option value="estadoReproductivo" ${this.agruparPor === 'estadoReproductivo' ? 'selected' : ''}>🤰 Agrupar por ESTADO REPRODUCTIVO</option>
                    <option value="sexo" ${this.agruparPor === 'sexo' ? 'selected' : ''}>⚧️ Agrupar por SEXO (Hembras vs Machos)</option>
                    <option value="ninguno" ${this.agruparPor === 'ninguno' ? 'selected' : ''}>📋 Sin Agrupar (Solo Ranking Individual)</option>
                  </select>
                </div>
              </div>

              <!-- FILA 2: FILTROS SECUNDARIOS DE CRUCE (BUSCADOR, ESPECIE, CATEGORÍA, LOTE, SEXO, REPRO, PADRE) -->
              <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                <div class="col-span-2 sm:col-span-1">
                  <label class="block font-bold text-slate-400 uppercase text-[10px] mb-1">Buscar Tag / Nombre / Raza:</label>
                  <input type="text" id="input-filtro-tag" value="${this.busqueda}" placeholder="Ej. BV-401, Simmental..." class="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono font-bold outline-none focus:border-emerald-500" autocomplete="off">
                </div>

                <div>
                  <label class="block font-bold text-slate-400 uppercase text-[10px] mb-1">Especie:</label>
                  <select id="select-filtro-especie" class="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold outline-none cursor-pointer">
                    <option value="todas" ${this.filtroEspecie === 'todas' ? 'selected' : ''}>Todas las Especies</option>
                    <option value="bovino" ${this.filtroEspecie === 'bovino' ? 'selected' : ''}>🐂 Vacuno (Bovino)</option>
                    <option value="bufalino" ${this.filtroEspecie === 'bufalino' ? 'selected' : ''}>🦬 Bufalino (Búfalos)</option>
                  </select>
                </div>

                <div>
                  <label class="block font-bold text-slate-400 uppercase text-[10px] mb-1">Categoría:</label>
                  <select id="select-filtro-categoria" class="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold outline-none cursor-pointer">
                    <option value="todas" ${this.filtroCategoria === 'todas' ? 'selected' : ''}>Todas las Categorías</option>
                    ${opciones.categorias.map((cat) => `
                      <option value="${cat}" ${this.filtroCategoria === cat ? 'selected' : ''}>${cat}</option>
                    `).join('')}
                  </select>
                </div>

                <div>
                  <label class="block font-bold text-slate-400 uppercase text-[10px] mb-1">Lote / Potrero:</label>
                  <select id="select-filtro-lote" class="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold outline-none cursor-pointer">
                    <option value="todos" ${this.filtroLote === 'todos' ? 'selected' : ''}>Todos los Lotes</option>
                    ${opciones.lotes.map((l) => `
                      <option value="${l}" ${this.filtroLote === l ? 'selected' : ''}>📍 ${l}</option>
                    `).join('')}
                  </select>
                </div>

                <div>
                  <label class="block font-bold text-slate-400 uppercase text-[10px] mb-1">Sexo:</label>
                  <select id="select-filtro-sexo" class="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold outline-none cursor-pointer">
                    <option value="todos" ${this.filtroSexo === 'todos' ? 'selected' : ''}>♀️♂️ Ambos Sexos</option>
                    <option value="hembra" ${this.filtroSexo === 'hembra' ? 'selected' : ''}>♀️ Solo Hembras</option>
                    <option value="macho" ${this.filtroSexo === 'macho' ? 'selected' : ''}>♂️ Solo Machos</option>
                  </select>
                </div>

                <div>
                  <label class="block font-bold text-slate-400 uppercase text-[10px] mb-1">Estado Reproductivo:</label>
                  <select id="select-filtro-repro" class="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold outline-none cursor-pointer">
                    <option value="todos" ${this.filtroRepro === 'todos' ? 'selected' : ''}>Todos los Estados</option>
                    <option value="preñad" ${this.filtroRepro === 'preñad' ? 'selected' : ''}>🟢 Preñadas (Gestantes)</option>
                    <option value="vacia" ${this.filtroRepro === 'vacia' ? 'selected' : ''}>🔴 Vacías (Abiertas)</option>
                    <option value="servid" ${this.filtroRepro === 'servid' ? 'selected' : ''}>🔵 Servidas / Inseminadas</option>
                  </select>
                </div>

                <div>
                  <label class="block font-bold text-slate-400 uppercase text-[10px] mb-1">Padre / Toro:</label>
                  <select id="select-filtro-padre" class="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold outline-none cursor-pointer">
                    <option value="todos" ${this.filtroPadre === 'todos' ? 'selected' : ''}>Todos los Padres</option>
                    ${opciones.padres.map((p) => `
                      <option value="${p}" ${this.filtroPadre === p ? 'selected' : ''}>🐂 ${p}</option>
                    `).join('')}
                  </select>
                </div>
              </div>

              <!-- FILA 3: UMBRALES RÁPIDOS Y SELECTOR PERSONALIZADO DE COLUMNAS -->
              <div class="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/60">
                <div class="flex flex-wrap items-center gap-2 text-[11px]">
                  <span class="text-slate-400 font-bold">Umbrales mínimos:</span>
                  <label class="inline-flex items-center gap-1 bg-slate-900 px-2.5 py-1 rounded-xl border border-slate-800">
                    <span class="text-slate-400">Peso ≥</span>
                    <input type="number" id="input-peso-minimo" value="${this.pesoMinimo}" placeholder="kg" class="w-14 bg-transparent text-white font-mono font-bold outline-none border-b border-slate-600 focus:border-emerald-400 text-center">
                  </label>
                  <label class="inline-flex items-center gap-1 bg-slate-900 px-2.5 py-1 rounded-xl border border-slate-800">
                    <span class="text-slate-400">GDP ≥</span>
                    <input type="number" id="input-gdp-minima" value="${this.gdpMinima}" placeholder="g/d" class="w-16 bg-transparent text-white font-mono font-bold outline-none border-b border-slate-600 focus:border-emerald-400 text-center">
                  </label>
                  <label class="inline-flex items-center gap-1 bg-slate-900 px-2.5 py-1 rounded-xl border border-slate-800">
                    <span class="text-slate-400">Leche ≥</span>
                    <input type="number" step="0.5" id="input-leche-minima" value="${this.lecheMinima}" placeholder="L/d" class="w-14 bg-transparent text-white font-mono font-bold outline-none border-b border-slate-600 focus:border-emerald-400 text-center">
                  </label>
                  <label class="inline-flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded-xl border border-slate-800 cursor-pointer">
                    <input type="checkbox" id="check-solo-descarte" ${this.soloCandidatosDescarte ? 'checked' : ''} class="accent-rose-500">
                    <span class="text-rose-300 font-bold">🚨 Solo Candidatos a Descarte</span>
                  </label>
                </div>

                <!-- PÍLDORAS DE SELECCIÓN MANUAL DE COLUMNAS -->
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="text-[10px] font-bold text-slate-400 uppercase mr-1">Datos visibles:</span>
                  ${DEFINICION_COLUMNAS_INFORME.map((col) => {
                    const activa = columnasActivas.has(col.id);
                    return `
                      <button type="button" data-col-toggle="${col.id}" class="btn-toggle-columna px-2 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                        activa
                          ? 'bg-emerald-600/30 border-emerald-400 text-emerald-200'
                          : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
                      }" title="Mostrar u ocultar columna ${col.label}">
                        ${activa ? '✓' : '+'} ${col.icono} ${col.label}
                      </button>
                    `;
                  }).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- ================================================================ -->
          <!-- 3. BANNER DE ESTADÍSTICAS DEL CRUCE Y DATO ACTIVO                -->
          <!-- ================================================================ -->
          <div class="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white px-5 py-3.5 border-b border-emerald-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div class="flex items-center gap-3">
              <span class="text-2xl">${infoCriterio.icono}</span>
              <div>
                <div class="text-[10px] uppercase font-bold text-emerald-300 tracking-wider flex items-center gap-2 flex-wrap">
                  <span>Métrica Principal Seleccionada:</span>
                  ${this.filtroRaza !== 'todas' ? `<span class="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black">🧬 Raza: ${this.filtroRaza}</span>` : ''}
                  ${this.filtroCategoria !== 'todas' ? `<span class="px-2 py-0.5 rounded-full bg-blue-400 text-slate-950 font-black">🏷️ ${this.filtroCategoria}</span>` : ''}
                  ${this.filtroLote !== 'todos' ? `<span class="px-2 py-0.5 rounded-full bg-purple-400 text-slate-950 font-black">📍 Lote: ${this.filtroLote}</span>` : ''}
                </div>
                <div class="font-black text-white text-sm flex items-center gap-2 flex-wrap mt-0.5">
                  <span>${infoCriterio.tituloColumna}</span>
                  <span class="px-2 py-0.2 rounded bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 text-[10px] font-mono">
                    ${infoCriterio.esAscendente ? 'Orden Ascendente (Mejor Menor Valor) ⬆️' : 'Orden Descendente (Mayor a Menor) ⬇️'}
                  </span>
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2.5 text-xs font-mono">
              <div class="bg-black/35 px-3 py-1.5 rounded-xl border border-white/10">
                <span class="text-[9px] uppercase text-emerald-300 block">Máximo (${infoCriterio.unidad})</span>
                <strong class="text-emerald-400 text-sm">${maxVal > 0 ? `${maxVal.toLocaleString('es-CO')}` : '-'}</strong>
              </div>
              <div class="bg-black/35 px-3 py-1.5 rounded-xl border border-white/10">
                <span class="text-[9px] uppercase text-emerald-300 block">Promedio del Grupo</span>
                <strong class="text-white text-sm">${avgVal > 0 ? `${avgVal.toLocaleString('es-CO')}` : '-'}</strong>
              </div>
              <div class="bg-black/35 px-3 py-1.5 rounded-xl border border-white/10">
                <span class="text-[9px] uppercase text-emerald-300 block">Mínimo (${infoCriterio.unidad})</span>
                <strong class="text-amber-300 text-sm">${minVal > 0 ? `${minVal.toLocaleString('es-CO')}` : '-'}</strong>
              </div>
              <div class="bg-black/35 px-3 py-1.5 rounded-xl border border-white/10 hidden md:block">
                <span class="text-[9px] uppercase text-slate-300 block">Peso Prom. / GDP Prom.</span>
                <strong class="text-slate-100 text-sm">${promPesoFiltro > 0 ? `${promPesoFiltro} kg` : '-'} / ${promGdpFiltro > 0 ? `+${promGdpFiltro} g/d` : '-'}</strong>
              </div>
              <div class="bg-black/35 px-3 py-1.5 rounded-xl border border-white/10 hidden md:block">
                <span class="text-[9px] uppercase text-slate-300 block">Leche Total Grupo</span>
                <strong class="text-sky-300 text-sm">${totalLecheFiltro > 0 ? `${totalLecheFiltro} L/día` : '0 L/día'}</strong>
              </div>
            </div>
          </div>

          <!-- ================================================================ -->
          <!-- 4. MATRIZ DE CRUCE ESTADÍSTICO POR RAZA / LOTE / CATEGORÍA       -->
          <!-- ================================================================ -->
          ${this.agruparPor !== 'ninguno' && resumenGrupos.length > 0 ? `
            <div class="p-4 bg-slate-50 border-b border-slate-200">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <h4 class="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <span>📊</span> Matriz Comparativa Agrupada por ${this.obtenerEtiquetaDimension(this.agruparPor)} (${resumenGrupos.length} grupos)
                  </h4>
                  <p class="text-[11px] text-slate-500">
                    Haz clic en <strong>"Filtrar Grupo"</strong> en cualquier fila (ej. una raza específica) para aislar únicamente esos animales en la tabla inferior.
                  </p>
                </div>
              </div>
              <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table class="w-full text-left text-xs border-collapse">
                  <thead class="bg-slate-900 text-white uppercase text-[10px] font-black tracking-wider">
                    <tr>
                      <th class="p-2.5">${this.obtenerEtiquetaDimension(this.agruparPor)}</th>
                      <th class="p-2.5 text-center">Cabezas (% Hato)</th>
                      <th class="p-2.5 text-right">Peso Promedio</th>
                      <th class="p-2.5 text-right">Carga UGG Total</th>
                      <th class="p-2.5 text-center bg-emerald-900/60">⚖️ GDP Promedio (Máx)</th>
                      <th class="p-2.5 text-right">🥛 Leche Prom. (Total/d)</th>
                      <th class="p-2.5 text-center">🤰 % Preñez</th>
                      <th class="p-2.5 text-right">⏳ Días Abiertos Prom.</th>
                      <th class="p-2.5 text-right">📅 IEP Promedio</th>
                      <th class="p-2.5">🥇 Ejemplar Líder (${infoCriterio.tituloColumna})</th>
                      <th class="p-2.5 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-200">
                    ${resumenGrupos.map((g) => `
                      <tr class="hover:bg-emerald-50/60 transition">
                        <td class="p-2.5 font-black text-slate-900">${g.grupo}</td>
                        <td class="p-2.5 text-center font-mono">
                          <span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 font-black">${g.cantidad}</span>
                          <span class="text-[10px] text-slate-500 ml-1">(${g.porcentajeHato}%)</span>
                        </td>
                        <td class="p-2.5 text-right font-mono font-bold text-slate-800">
                          ${g.pesoPromedio ? `${g.pesoPromedio} kg` : '-'}
                        </td>
                        <td class="p-2.5 text-right font-mono text-slate-700">
                          ${g.uggTotal > 0 ? `${g.uggTotal} UGG` : '-'}
                        </td>
                        <td class="p-2.5 text-center bg-emerald-50/50 font-mono">
                          ${g.gdpPromedio !== null ? `
                            <span class="px-2 py-0.5 rounded-full font-black text-[11px] ${g.gdpPromedio >= 600 ? 'bg-emerald-100 text-emerald-900' : (g.gdpPromedio < 300 ? 'bg-rose-100 text-rose-900' : 'bg-amber-100 text-amber-900')}">
                              +${g.gdpPromedio} g/d
                            </span>
                            <span class="text-[10px] text-slate-500 block">Máx: +${g.gdpMax} g/d</span>
                          ` : '-'}
                        </td>
                        <td class="p-2.5 text-right font-mono">
                          ${g.lechePromedio !== null ? `
                            <strong class="text-emerald-800">${g.lechePromedio} L/d</strong>
                            <span class="text-[10px] text-slate-500 block">Total: ${g.lecheTotalDia} L/d</span>
                          ` : '-'}
                        </td>
                        <td class="p-2.5 text-center font-mono">
                          ${g.tasaPrenezPorc !== null ? `
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${g.tasaPrenezPorc >= 65 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                              ${g.tasaPrenezPorc}%
                            </span>
                          ` : '-'}
                        </td>
                        <td class="p-2.5 text-right font-mono ${g.diasAbiertosPromedio && g.diasAbiertosPromedio > 150 ? 'text-rose-600 font-bold' : 'text-slate-700'}">
                          ${g.diasAbiertosPromedio !== null ? `${g.diasAbiertosPromedio} d` : '-'}
                        </td>
                        <td class="p-2.5 text-right font-mono text-slate-700">
                          ${g.iepPromedio !== null ? `${g.iepPromedio} d` : '-'}
                        </td>
                        <td class="p-2.5 text-[11px]">
                          ${g.mejorEjemplar ? `
                            <span class="font-mono font-black text-slate-900">${g.mejorEjemplar.tag}</span>
                            <span class="text-slate-500">${g.mejorEjemplar.nombre ? `(${g.mejorEjemplar.nombre})` : ''}</span>
                            <span class="block text-[10px] font-bold text-emerald-700">${g.mejorEjemplar.valorTexto}</span>
                          ` : '-'}
                        </td>
                        <td class="p-2.5 text-center">
                          <button type="button" data-filtrar-dim="${this.agruparPor}" data-filtrar-val="${g.grupo}" class="btn-filtrar-grupo-matriz px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-black shadow-sm transition cursor-pointer">
                            🎯 Filtrar Grupo
                          </button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          ` : ''}

          <!-- ================================================================ -->
          <!-- 5. TABLA DETALLADA ANIMAL POR ANIMAL CON COLUMNAS CONFIGURABLES  -->
          <!-- ================================================================ -->
          <div class="overflow-x-auto max-h-[620px] overflow-y-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead class="bg-slate-100 uppercase font-black tracking-wider text-slate-700 text-[10px] border-b border-slate-300 sticky top-0 z-10">
                <tr>
                  <th class="p-3 w-12 text-center bg-slate-200/80"># Rank</th>
                  <th class="p-3 w-28">Arete / Tag</th>
                  ${columnasActivas.has('especie') ? `<th class="p-3 w-24">Especie</th>` : ''}
                  <th class="p-3 w-40">Nombre & Raza</th>

                  <!-- COLUMNA PRINCIPAL DE ORDENAMIENTO Y ANÁLISIS (SIEMPRE DESTACADA) -->
                  <th class="p-3 w-52 bg-emerald-700 text-white font-black shadow-md border-x border-emerald-600 text-center">
                    <div class="flex items-center justify-center gap-1">
                      <span>${infoCriterio.icono}</span>
                      <span>DATO DE ORDEN: ${infoCriterio.tituloColumna} ${infoCriterio.esAscendente ? '⬆️' : '⬇️'}</span>
                    </div>
                  </th>

                  ${columnasActivas.has('categoria_lote') ? `<th class="p-3 w-36">Categoría & Lote</th>` : ''}
                  ${columnasActivas.has('edad') ? `
                    <th class="p-3 text-right cursor-pointer hover:bg-slate-200 transition ${this.filtroOrden === 'edad_desc' ? 'bg-emerald-100 text-emerald-950 font-black' : ''}" data-sort="edad_desc" title="Clic para ordenar por edad">
                      Edad ${this.filtroOrden === 'edad_desc' ? '⬇️' : ''}
                    </th>
                  ` : ''}
                  ${columnasActivas.has('peso') ? `
                    <th class="p-3 text-right cursor-pointer hover:bg-slate-200 transition ${this.filtroOrden.startsWith('peso') ? 'bg-emerald-100 text-emerald-950 font-black' : ''}" data-sort="peso_desc" title="Clic para ordenar por peso">
                      Peso & UGG ${this.filtroOrden.startsWith('peso') ? '⬇️' : ''}
                    </th>
                  ` : ''}
                  ${columnasActivas.has('gdp') ? `
                    <th class="p-3 text-center cursor-pointer hover:bg-slate-200 transition ${this.filtroOrden.startsWith('gdp') ? 'bg-emerald-100 text-emerald-950 font-black' : ''}" data-sort="gdp_desc" title="Clic para ordenar por GDP">
                      GDP Promedio ${this.filtroOrden.startsWith('gdp') ? '⬇️' : ''}
                    </th>
                  ` : ''}
                  ${columnasActivas.has('leche') ? `
                    <th class="p-3 text-right cursor-pointer hover:bg-slate-200 transition ${this.filtroOrden === 'leche_desc' || this.filtroOrden === 'lactancia305_desc' ? 'bg-emerald-100 text-emerald-950 font-black' : ''}" data-sort="leche_desc" title="Clic para ordenar por leche">
                      Leche L/d (305d) ${this.filtroOrden === 'leche_desc' ? '⬇️' : ''}
                    </th>
                  ` : ''}
                  ${columnasActivas.has('repro_prenez') ? `
                    <th class="p-3 w-36 cursor-pointer hover:bg-slate-200 transition ${this.filtroOrden === 'prened_desc' ? 'bg-emerald-100 text-emerald-950 font-black' : ''}" data-sort="prened_desc" title="Clic para ordenar por preñez">
                      Repro / Días Preñez ${this.filtroOrden === 'prened_desc' ? '⬇️' : ''}
                    </th>
                  ` : ''}
                  ${columnasActivas.has('dias_abiertos') ? `
                    <th class="p-3 text-right cursor-pointer hover:bg-slate-200 transition ${this.filtroOrden === 'abiertos_desc' ? 'bg-emerald-100 text-emerald-950 font-black' : ''}" data-sort="abiertos_desc" title="Clic para ordenar por días abiertos">
                      Días Abiertos ${this.filtroOrden === 'abiertos_desc' ? '⬇️' : ''}
                    </th>
                  ` : ''}
                  ${columnasActivas.has('iep') ? `
                    <th class="p-3 text-right cursor-pointer hover:bg-slate-200 transition ${this.filtroOrden.startsWith('iep') ? 'bg-emerald-100 text-emerald-950 font-black' : ''}" data-sort="iep_desc" title="Clic para ordenar por IEP">
                      IEP Proyectado ${this.filtroOrden.startsWith('iep') ? '⬇️' : ''}
                    </th>
                  ` : ''}
                  ${columnasActivas.has('genealogia') ? `<th class="p-3 w-36">Padre / Madre</th>` : ''}
                  ${columnasActivas.has('valor_merito') ? `
                    <th class="p-3 text-center cursor-pointer hover:bg-slate-200 transition ${this.filtroOrden === 'merito_desc' ? 'bg-emerald-100 text-emerald-950 font-black' : ''}" data-sort="merito_desc" title="Clic para ordenar por mérito genético">
                      Mérito & Diagnóstico
                    </th>
                  ` : ''}
                  <th class="p-3 w-16 text-center">Ficha</th>
                </tr>
              </thead>
              <tbody id="tbody-tabla-dinamica" class="divide-y divide-slate-200 font-medium">
                ${animales.length > 0 ? animales.map((a, idx) => this.renderFilaAnimal(a, idx, columnasActivas, avgVal)).join('') : `
                  <tr>
                    <td colspan="16" class="p-10 text-center text-slate-400">
                      No se encontraron ejemplares con los criterios seleccionados${this.filtroRaza !== 'todas' ? ` para la raza "${this.filtroRaza}"` : ''}.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  obtenerEtiquetaDimension(dim) {
    switch (dim) {
      case 'raza': return 'Raza';
      case 'lote': return 'Lote / Potrero';
      case 'categoria': return 'Categoría Productiva';
      case 'padre': return 'Padre / Toro Reproductor';
      case 'estadoReproductivo': return 'Estado Reproductivo';
      case 'sexo': return 'Sexo';
      default: return 'Grupo';
    }
  }

  renderFilaAnimal(a, idx, columnasActivas = this.obtenerColumnasActivas(), promedioGrupo = 0) {
    const especie = a.especie || 'bovino';
    const tag = a.identificacionTag || a.numero;
    const fParto = a.fechaUltimoParto || a.ultimoParto;
    const diasAbiertos = calcularDiasAbiertos(fParto, a.estadoReproductivo);
    const iep = calcularIEP(diasAbiertos, especie);
    const gdpRaw = a.gdpPromedioGDia !== undefined ? a.gdpPromedioGDia : a.gdpActual;
    const gdp = gdpRaw !== null && gdpRaw !== undefined && gdpRaw !== '' ? Number(gdpRaw) : null;
    const leche = Number(a.promedioLecheDiariaL !== undefined ? a.promedioLecheDiariaL : (a.produccionLecheDiaria || 0));
    const peso = Number(a.ultimoPesoKg || a.pesoActual || 0);
    const estaPrenada = (a.estadoReproductivo || '').toLowerCase().includes('prenad') || (a.estadoReproductivo || '').toLowerCase().includes('preñad');
    const diasG = estaPrenada ? parseInt(a.diasGestacionActual || a.diasGestacion || 0, 10) : 0;
    const edadMeses = a.edadMeses !== undefined ? Number(a.edadMeses) : calcularEdadMeses(a.fechaNacimiento);
    const baseUgg = especie === 'bufalino' ? 500 : 450;
    const ugg = peso > 0 ? (peso / baseUgg).toFixed(2) : null;
    const diasLactanciaBase = especie === 'bufalino' ? 270 : 305;
    const proyeccion305 = leche > 0 ? Math.round(leche * diasLactanciaBase) : 0;
    const merito = this.calcularIndiceMeritoAnimal(a);

    // Dato activo de ordenamiento para este animal
    const metaOrden = this.obtenerMetaDatoOrden(a, this.filtroOrden);

    // Comparación contra el promedio del grupo filtrado (diferencial zootécnico)
    let diffTexto = '';
    if (promedioGrupo > 0 && metaOrden.valorEstadistico !== null && metaOrden.valorEstadistico > 0) {
      const diff = Math.round(metaOrden.valorEstadistico - promedioGrupo);
      if (diff !== 0) {
        diffTexto = `${diff > 0 ? '+' : ''}${diff} vs prom.`;
      }
    }

    // Medallas para los primeros lugares
    let medalla = `<span class="text-slate-400 font-mono text-xs">#${idx + 1}</span>`;
    if (idx === 0) medalla = `<span class="px-1.5 py-0.5 rounded-full bg-amber-400 text-amber-950 font-black text-xs shadow-sm">🥇 #1</span>`;
    else if (idx === 1) medalla = `<span class="px-1.5 py-0.5 rounded-full bg-slate-300 text-slate-900 font-black text-xs shadow-sm">🥈 #2</span>`;
    else if (idx === 2) medalla = `<span class="px-1.5 py-0.5 rounded-full bg-amber-600/30 text-amber-900 font-black text-xs shadow-sm">🥉 #3</span>`;

    // Clasificación de rendimiento zootécnico individual
    let badgeRendimiento = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Óptimo</span>';
    if (gdp !== null && !isNaN(gdp) && gdp > 0 && gdp < 300) {
      badgeRendimiento = '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800">Baja GDP</span>';
    } else if (diasAbiertos > 200) {
      badgeRendimiento = '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800">Días Abiertos</span>';
    } else if (gdp !== null && !isNaN(gdp) && gdp < 600) {
      badgeRendimiento = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">Regular</span>';
    }

    const padreStr = a.padre || a.padreTag || a.toroPadre || '-';
    const madreStr = a.madre || a.madreTag || '-';

    return `
      <tr class="hover:bg-emerald-50/50 transition">
        <!-- RANK -->
        <td class="p-2.5 text-center bg-slate-50/80">${medalla}</td>

        <!-- ARETE -->
        <td class="p-2.5 font-black font-mono text-slate-900 text-sm">${tag}</td>

        <!-- ESPECIE -->
        ${columnasActivas.has('especie') ? `
          <td class="p-2.5">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${especie === 'bufalino' ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-900'}">
              ${especie === 'bufalino' ? '🦬 Bufalino' : '🐂 Vacuno'}
            </span>
          </td>
        ` : ''}

        <!-- NOMBRE & RAZA -->
        <td class="p-2.5">
          <div class="font-bold text-slate-800">${a.nombreAlias || a.nombre || 'Sin Alias'}</div>
          <div class="text-[10px] font-bold text-emerald-700">🧬 ${a.raza || 'Común'}</div>
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
            ${diffTexto ? `
              <span class="text-[9px] font-mono font-bold text-emerald-800">${diffTexto}</span>
            ` : ''}
          </div>
        </td>

        <!-- CATEGORÍA & LOTE -->
        ${columnasActivas.has('categoria_lote') ? `
          <td class="p-2.5">
            <div class="font-bold text-slate-700 text-[11px]">${a.categoria || 'General'}</div>
            <span class="text-[10px] text-slate-400 block">📍 ${a.lote || 'General'}</span>
          </td>
        ` : ''}

        <!-- EDAD -->
        ${columnasActivas.has('edad') ? `
          <td class="p-2.5 text-right font-mono text-slate-700 ${this.filtroOrden === 'edad_desc' ? 'bg-emerald-50 font-bold' : ''}">
            ${edadMeses > 0 ? `${edadMeses} m` : '-'}
          </td>
        ` : ''}

        <!-- PESO & UGG -->
        ${columnasActivas.has('peso') ? `
          <td class="p-2.5 text-right font-mono font-bold text-slate-800 ${this.filtroOrden.startsWith('peso') ? 'bg-emerald-50' : ''}">
            ${peso > 0 ? `
              <div>${peso} kg</div>
              <div class="text-[9px] text-slate-400 font-normal">${ugg} UGG</div>
            ` : '-'}
          </td>
        ` : ''}

        <!-- GDP -->
        ${columnasActivas.has('gdp') ? `
          <td class="p-2.5 text-center ${this.filtroOrden.startsWith('gdp') ? 'bg-emerald-50' : ''}">
            ${gdp !== null && !isNaN(gdp) ? `
              <span class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold ${gdp < 300 ? 'bg-rose-100 text-rose-800 font-black' : (gdp < 600 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')}">
                ${gdp > 0 ? '+' : ''}${gdp} g/d
              </span>
            ` : '<span class="text-slate-300 text-xs">-</span>'}
          </td>
        ` : ''}

        <!-- LECHE -->
        ${columnasActivas.has('leche') ? `
          <td class="p-2.5 text-right font-mono font-bold text-emerald-800 ${this.filtroOrden === 'leche_desc' || this.filtroOrden === 'lactancia305_desc' ? 'bg-emerald-50' : ''}">
            ${leche > 0 ? `
              <div>${parseFloat(leche).toFixed(1)} L</div>
              <div class="text-[9px] text-slate-400 font-normal">${proyeccion305}L/${diasLactanciaBase}d</div>
            ` : '-'}
          </td>
        ` : ''}

        <!-- REPRO / PREÑEZ -->
        ${columnasActivas.has('repro_prenez') ? `
          <td class="p-2.5 ${this.filtroOrden === 'prened_desc' ? 'bg-emerald-50 font-bold' : ''}">
            <div class="font-bold ${estaPrenada ? 'text-emerald-700' : 'text-slate-700'}">
              ${a.estadoReproductivo || 'Vacía'}
            </div>
            ${estaPrenada ? `<div class="text-[10px] text-emerald-600 font-black font-mono">${diasG} días de preñez</div>` : ''}
          </td>
        ` : ''}

        <!-- DÍAS ABIERTOS -->
        ${columnasActivas.has('dias_abiertos') ? `
          <td class="p-2.5 text-right font-mono font-bold ${this.filtroOrden === 'abiertos_desc' ? 'bg-emerald-50' : ''} ${diasAbiertos > 200 ? 'text-rose-600' : 'text-slate-700'}">
            ${diasAbiertos > 0 ? `${diasAbiertos} d` : '-'}
          </td>
        ` : ''}

        <!-- IEP -->
        ${columnasActivas.has('iep') ? `
          <td class="p-2.5 text-right font-mono text-slate-600 ${this.filtroOrden.startsWith('iep') ? 'bg-emerald-50 font-bold' : ''}">
            ${fParto ? `${iep.dias} d` : '-'}
          </td>
        ` : ''}

        <!-- GENEALOGÍA PADRE / MADRE -->
        ${columnasActivas.has('genealogia') ? `
          <td class="p-2.5 text-[10px] font-mono text-slate-600">
            <div>🐂 P: <strong class="text-slate-800">${padreStr}</strong></div>
            <div>🐄 M: <strong class="text-slate-800">${madreStr}</strong></div>
          </td>
        ` : ''}

        <!-- RENDIMIENTO & MÉRITO -->
        ${columnasActivas.has('valor_merito') ? `
          <td class="p-2.5 text-center">
            <div class="flex flex-col items-center gap-0.5">
              ${badgeRendimiento}
              <span class="text-[9px] font-mono font-bold text-slate-500">Mérito: ${merito} pts</span>
            </div>
          </td>
        ` : ''}

        <!-- ACCIONES -->
        <td class="p-2.5 text-center">
          <button data-action="ver-ficha-animal" data-id="${a.id}" class="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold rounded-lg shadow transition cursor-pointer" title="Ver Ficha Técnica">
            🔍
          </button>
        </td>
      </tr>
    `;
  }

  exportarInformeActualExcel() {
    const animales = this.obtenerAnimalesFiltradosYOrdenados();
    const resumenGrupos = this.calcularResumenAgrupado(animales, this.agruparPor);
    const informeActual = CATALOGO_INFORMES_GANADEROS.find((i) => i.id === this.informeActivoId) || CATALOGO_INFORMES_GANADEROS[0];

    const filasAnimales = animales.map((a, idx) => {
      const especie = a.especie || 'bovino';
      const fParto = a.fechaUltimoParto || a.ultimoParto;
      const diasAbiertos = calcularDiasAbiertos(fParto, a.estadoReproductivo);
      const iep = calcularIEP(diasAbiertos, especie);
      const gdp = a.gdpPromedioGDia !== undefined ? a.gdpPromedioGDia : (a.gdpActual || '');
      const leche = a.promedioLecheDiariaL !== undefined ? a.promedioLecheDiariaL : (a.produccionLecheDiaria || 0);
      const peso = a.ultimoPesoKg || a.pesoActual || 0;
      const edadMeses = a.edadMeses !== undefined ? a.edadMeses : calcularEdadMeses(a.fechaNacimiento);
      const metaOrden = this.obtenerMetaDatoOrden(a, this.filtroOrden);

      return {
        Ranking: idx + 1,
        Arete_Tag: a.identificacionTag || a.numero || '',
        Nombre: a.nombreAlias || a.nombre || '',
        Especie: especie,
        Raza: a.raza || 'Común',
        Sexo: a.sexo || 'hembra',
        Categoria: a.categoria || '',
        Lote: a.lote || '',
        Dato_Evaluado: metaOrden.tituloColumna,
        Valor_Dato_Evaluado: metaOrden.valorTexto,
        Edad_Meses: edadMeses || '',
        Peso_Actual_Kg: peso || '',
        GDP_g_dia: gdp !== null ? gdp : '',
        Leche_L_dia: leche || 0,
        Proyeccion_Lactancia_305d: leche > 0 ? Math.round(leche * (especie === 'bufalino' ? 270 : 305)) : 0,
        Estado_Reproductivo: a.estadoReproductivo || 'Vacía',
        Dias_Gestacion: a.diasGestacionActual || a.diasGestacion || 0,
        Dias_Abiertos: diasAbiertos || 0,
        IEP_Proyectado_Dias: fParto ? iep.dias : '',
        Padre: a.padre || a.padreTag || '',
        Madre: a.madre || a.madreTag || '',
        Indice_Merito_Pts: this.calcularIndiceMeritoAnimal(a)
      };
    });

    if (typeof XLSX !== 'undefined' && XLSX.utils && typeof XLSX.utils.book_new === 'function' && typeof XLSX.utils.json_to_sheet === 'function') {
      const wb = XLSX.utils.book_new();
      const wsAnimales = XLSX.utils.json_to_sheet(filasAnimales.length > 0 ? filasAnimales : [{ Mensaje: 'Sin registros para el filtro actual' }]);
      XLSX.utils.book_append_sheet(wb, wsAnimales, 'Informe_Animales');

      if (resumenGrupos.length > 0) {
        const wsResumen = XLSX.utils.json_to_sheet(resumenGrupos.map((g) => ({
          Grupo: g.grupo,
          Cabezas: g.cantidad,
          Porcentaje_Hato: g.porcentajeHato,
          Peso_Promedio_Kg: g.pesoPromedio || '',
          UGG_Total: g.uggTotal || '',
          GDP_Promedio_g_dia: g.gdpPromedio || '',
          Leche_Promedio_L_dia: g.lechePromedio || '',
          Leche_Total_Grupo_L_dia: g.lecheTotalDia || '',
          Porcentaje_Prenez: g.tasaPrenezPorc !== null ? `${g.tasaPrenezPorc}%` : '',
          Dias_Abiertos_Promedio: g.diasAbiertosPromedio || '',
          IEP_Promedio_Dias: g.iepPromedio || ''
        })));
        XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen_Cruce');
      }

      const nombreArchivo = `Informe_${informeActual.id}_${this.filtroRaza !== 'todas' ? this.filtroRaza + '_' : ''}${new Date().toISOString().split('T')[0]}.xlsx`;
      if (typeof XLSX.writeFile === 'function') {
        XLSX.writeFile(wb, nombreArchivo);
      }
      return { ok: true, total: filasAnimales.length, nombreArchivo };
    }

    return { ok: true, total: filasAnimales.length, filas: filasAnimales };
  }

  attachEvents() {
    if (!this.container) return;

    // 1. Selección de informe del catálogo
    this.container.querySelectorAll('.btn-seleccionar-informe').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idInf = e.currentTarget.getAttribute('data-informe-id');
        if (idInf) this.seleccionarInforme(idInf);
      });
    });

    // 2. Botón limpiar filtros
    const btnLimpiar = this.container.querySelector('#btn-limpiar-filtros-informes');
    if (btnLimpiar) {
      btnLimpiar.addEventListener('click', () => this.limpiarFiltros());
    }

    // 3. Botón exportar a Excel
    const btnExportar = this.container.querySelector('#btn-exportar-informe-excel');
    if (btnExportar) {
      btnExportar.addEventListener('click', () => {
        this.exportarInformeActualExcel();
      });
    }

    // 4. Buscador por Tag / Nombre / Raza con Autosuggest
    const inTag = this.container.querySelector('#input-filtro-tag');
    if (inTag) {
      conectarAutosuggestAnimales({
        inputElement: inTag,
        getAnimales: () => this.getAnimalesBusqueda ? this.getAnimalesBusqueda() : (this.getAnimales ? this.getAnimales() : []),
        theme: 'emerald',
        maxResultados: 8,
        modoConsulta: true,
        onVerFicha: (animalId) => {
          if (this.onVerFicha) this.onVerFicha(animalId);
        },
        onSeleccionar: (animal) => {
          const tag = animal.identificacionTag || animal.numero;
          inTag.value = tag;
          this.busqueda = tag;
          if (animal && animal._estaEnOtraFinca && this.onVerFicha) {
            this.onVerFicha(animal.id);
          }
          this.filtrarTabla();
        }
      });

      inTag.addEventListener('input', (e) => {
        this.busqueda = e.target.value;
        this.filtrarTabla();
      });
    }

    // 5. Selectores de filtros y cruces
    const bindSelect = (selector, prop) => {
      const el = this.container.querySelector(selector);
      if (el) {
        el.addEventListener('change', (e) => {
          this[prop] = e.target.value;
          this.render();
        });
      }
    };

    bindSelect('#select-filtro-raza', 'filtroRaza');
    bindSelect('#select-filtro-orden', 'filtroOrden');
    bindSelect('#select-modo-columnas', 'modoColumnas');
    bindSelect('#select-agrupar-por', 'agruparPor');
    bindSelect('#select-filtro-especie', 'filtroEspecie');
    bindSelect('#select-filtro-categoria', 'filtroCategoria');
    bindSelect('#select-filtro-lote', 'filtroLote');
    bindSelect('#select-filtro-sexo', 'filtroSexo');
    bindSelect('#select-filtro-repro', 'filtroRepro');
    bindSelect('#select-filtro-padre', 'filtroPadre');

    // 6. Umbrales numéricos y checkbox de descarte
    const bindInputUmbral = (selector, prop) => {
      const el = this.container.querySelector(selector);
      if (el) {
        el.addEventListener('change', (e) => {
          this[prop] = e.target.value;
          this.render();
        });
      }
    };
    bindInputUmbral('#input-peso-minimo', 'pesoMinimo');
    bindInputUmbral('#input-gdp-minima', 'gdpMinima');
    bindInputUmbral('#input-leche-minima', 'lecheMinima');

    const chkDescarte = this.container.querySelector('#check-solo-descarte');
    if (chkDescarte) {
      chkDescarte.addEventListener('change', (e) => {
        this.soloCandidatosDescarte = Boolean(e.target.checked);
        this.render();
      });
    }

    // 7. Toggle individual de columnas visibles
    this.container.querySelectorAll('.btn-toggle-columna').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const colId = e.currentTarget.getAttribute('data-col-toggle');
        if (!colId) return;
        if (this.modoColumnas !== 'personalizado') {
          this.columnasPersonalizadas = this.obtenerColumnasActivas();
          this.modoColumnas = 'personalizado';
        }
        if (this.columnasPersonalizadas.has(colId)) {
          this.columnasPersonalizadas.delete(colId);
        } else {
          this.columnasPersonalizadas.add(colId);
        }
        this.render();
      });
    });

    // 8. Botones de filtrar grupo desde la Matriz Comparativa
    this.container.querySelectorAll('.btn-filtrar-grupo-matriz').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const dim = e.currentTarget.getAttribute('data-filtrar-dim');
        const val = e.currentTarget.getAttribute('data-filtrar-val');
        if (!dim || !val) return;
        if (dim === 'raza') this.filtroRaza = val;
        else if (dim === 'lote') this.filtroLote = val;
        else if (dim === 'categoria') this.filtroCategoria = val;
        else if (dim === 'padre') this.filtroPadre = val;
        else if (dim === 'sexo') this.filtroSexo = val === 'Machos' ? 'macho' : 'hembra';
        this.render();
      });
    });

    // 9. Cabeceras clickeables para ordenar directamente
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

    const animales = this.obtenerAnimalesFiltradosYOrdenados();
    const columnasActivas = this.obtenerColumnasActivas();

    const valoresValidos = animales
      .map((a) => this.obtenerMetaDatoOrden(a, this.filtroOrden).valorEstadistico)
      .filter((v) => v !== null && v !== undefined && !isNaN(v) && v > 0);
    const avgVal = valoresValidos.length > 0
      ? Math.round(valoresValidos.reduce((acc, x) => acc + x, 0) / valoresValidos.length)
      : 0;

    const contador = this.container.querySelector('#contador-ejemplares-dinamica');
    if (contador) {
      contador.textContent = `${animales.length} Ejemplares Analizados`;
    }

    const tbody = this.container.querySelector('#tbody-tabla-dinamica');
    if (tbody) {
      if (animales.length > 0) {
        tbody.innerHTML = animales.map((a, idx) => this.renderFilaAnimal(a, idx, columnasActivas, avgVal)).join('');
      } else {
        tbody.innerHTML = `
          <tr>
            <td colspan="16" class="p-10 text-center text-slate-400">
              No se encontraron ejemplares con los criterios seleccionados.
            </td>
          </tr>
        `;
      }
      this.enlazarEventosTabla();
    }
  }
}
