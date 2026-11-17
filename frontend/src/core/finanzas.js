/**
 * GANADERO AD - MOTOR FINANCIERO, INVERSIONES DIFERIDAS, UTILIDAD BIOLÓGICA (NIC 41) Y AUDITORÍA DE CAMPO
 * Estándares aplicados:
 *  - NIC 41 / IAS 41 Agricultura (Valorización biológica de activos ganaderos sin doble conteo en ventas)
 *  - Metodología CREA / FEDEGÁN / IFCN / Ranching for Profit (Producción equivalente de carne y leche, UGG/Ha, EBITDA)
 *  - Amortización lineal diferida por meses de inversiones CAPEX agropecuarias
 */

import { calcularGDP, calcularGDPEjemplar, calcularDiasAbiertos, parsearFechaObjeto, obtenerFechaHoyLocal, formatearFecha } from './zootecnia.js';

export function consolidarCostosFijos(costos = {}) {
  return (
    (parseFloat(costos.nomina) || 0) +
    (parseFloat(costos.insumos) || 0) +
    (parseFloat(costos.herbicidas) || 0) +
    (parseFloat(costos.maquinaria) || 0) +
    (parseFloat(costos.servicios) || 0) +
    (parseFloat(costos.otros) || 0)
  );
}

export function sumarCuotasInversionesDiferidas(inversiones = []) {
  if (!Array.isArray(inversiones)) return 0;
  return inversiones
    .filter((inv) => (inv.estado || 'activa').toLowerCase() === 'activa')
    .reduce((acum, inv) => {
      const monto = parseFloat(inv.montoTotalInversion || inv.montoTotal || inv.monto) || 0;
      const plazo = Math.max(1, parseInt(inv.plazoMesesDiferido || inv.plazoMeses) || 1);
      const cuota = inv.cuotaMensual ? parseFloat(inv.cuotaMensual) : monto / plazo;
      return acum + cuota;
    }, 0);
}

export function computarRendimientoFinanciero({
  finca,
  costosFijos,
  inversiones,
  litrosLecheMensuales = 0,
  kilosCarneMensuales = 0,
  ingresosVentasAnimales = 0
}) {
  const precioLeche = parseFloat(finca?.precioLecheLitro || finca?.precios?.lecheLitro || 2400);
  const precioCarne = parseFloat(finca?.precioCarneKgPie || finca?.precios?.kiloEnPie || 8800);
  const areaHa = parseFloat(finca?.areaTotalHa || finca?.areaHa || finca?.hectareas || 1);

  // Costos
  const totalFijos = consolidarCostosFijos(costosFijos);
  const cuotaInversiones = sumarCuotasInversionesDiferidas(inversiones);
  const costoTotalMes = totalFijos + cuotaInversiones;

  // Ingresos
  const ingresoLeche = litrosLecheMensuales * precioLeche;
  const ingresoCarne = kilosCarneMensuales * precioCarne;
  const ingresoVentaGanado = parseFloat(ingresosVentasAnimales) || 0;
  const ingresoTotalMes = ingresoLeche + ingresoCarne + ingresoVentaGanado;

  // Rentabilidad
  const margenNeto = ingresoTotalMes - costoTotalMes;
  const margenPct = ingresoTotalMes > 0 ? (margenNeto / ingresoTotalMes) * 100 : 0;
  const roiPct = costoTotalMes > 0 ? (margenNeto / costoTotalMes) * 100 : 0;

  return {
    costos: {
      fijos: Math.round(totalFijos),
      cuotaInversionesDiferidas: Math.round(cuotaInversiones),
      total: Math.round(costoTotalMes)
    },
    ingresos: {
      leche: Math.round(ingresoLeche),
      carne: Math.round(ingresoCarne),
      ventasGanado: Math.round(ingresoVentaGanado),
      total: Math.round(ingresoTotalMes)
    },
    indicadores: {
      margenNeto: Math.round(margenNeto),
      margenPct: parseFloat(margenPct.toFixed(2)),
      roiPct: parseFloat(roiPct.toFixed(2)),
      costoPorHa: areaHa > 0 ? Math.round(costoTotalMes / areaHa) : 0,
      ingresoPorHa: areaHa > 0 ? Math.round(ingresoTotalMes / areaHa) : 0,
      margenPorHa: areaHa > 0 ? Math.round(margenNeto / areaHa) : 0
    }
  };
}

// ============================================================================
// 1. MOTOR DE AMORTIZACIÓN DE INVERSIONES DIFERIDAS POR MESES
// ============================================================================

function ymToIndex(ymStr) {
  if (!ymStr || typeof ymStr !== 'string') return null;
  const m = ymStr.slice(0, 7).match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 12 + (parseInt(m[2], 10) - 1);
}

function indexToYm(idx) {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * Calcula cuánto impacta una inversión diferida en un período dado para que
 * el monto NO entre todo en un solo mes sino repartido en N cuotas mensuales.
 */
export function calcularAmortizacionInversionEnPeriodo(inv, {
  periodoFiltro = 'MES_ACTUAL',
  fechaDesde = null,
  fechaHasta = null,
  fechaReferencia = null
} = {}) {
  if (!inv) {
    return {
      montoTotal: 0,
      plazoMeses: 1,
      cuotaMensual: 0,
      mesesActivosEnPeriodo: 0,
      impactoPeriodo: 0,
      mesesTranscurridos: 0,
      amortizadoAcumulado: 0,
      saldoPorDiferir: 0,
      porcentajeAvance: 0,
      mesInicio: '',
      mesFin: '',
      fechaInicio: '',
      fechaFin: '',
      fechaInicioDMY: '-',
      fechaFinDMY: '-',
      activa: false
    };
  }

  const hoyStr = fechaReferencia || obtenerFechaHoyLocal();
  const fechaIniStr = String(inv.fecha || inv.fechaInicio || hoyStr).slice(0, 10);
  const montoTotal = Math.max(0, Number(inv.monto ?? inv.montoTotalInversion ?? inv.montoTotal ?? 0));
  const plazoMeses = Math.max(1, parseInt(inv.plazoMeses ?? inv.plazoMesesDiferido ?? 1, 10) || 1);
  const cuotaMensual = montoTotal / plazoMeses;

  const idxInicio = ymToIndex(fechaIniStr) ?? ymToIndex(hoyStr) ?? (2026 * 12);
  const idxFin = idxInicio + plazoMeses - 1;
  const idxHoy = ymToIndex(hoyStr) ?? idxInicio;

  const yFin = Math.floor(idxFin / 12);
  const mFin = (idxFin % 12) + 1;
  const ultimoDiaFin = new Date(yFin, mFin, 0).getDate();
  const fechaFinStr = `${String(yFin).padStart(4, '0')}-${String(mFin).padStart(2, '0')}-${String(ultimoDiaFin).padStart(2, '0')}`;
  const fechaInicioDMY = formatearFecha(fechaIniStr, '-');
  const fechaFinDMY = formatearFecha(fechaFinStr, '-');

  // Meses transcurridos hasta hoy (para barra de progreso de amortización)
  const mesesTranscurridos = idxHoy < idxInicio
    ? 0
    : Math.min(plazoMeses, idxHoy - idxInicio + 1);
  const amortizadoAcumulado = Math.round(cuotaMensual * mesesTranscurridos);
  const saldoPorDiferir = Math.max(0, Math.round(montoTotal - amortizadoAcumulado));
  const porcentajeAvance = Math.min(100, Math.round((mesesTranscurridos / plazoMeses) * 100));

  // Determinar ventana de meses [winStart, winEnd] del período evaluado
  let winStart = idxHoy;
  let winEnd = idxHoy;

  if (fechaDesde && fechaHasta) {
    const iDesde = ymToIndex(fechaDesde);
    const iHasta = ymToIndex(fechaHasta);
    if (iDesde !== null && iHasta !== null && iHasta >= iDesde) {
      // Si el rango está dentro del mismo mes o es menor a 45 días, prorratear por días/30 o 1 cuota mensual
      const d1 = parsearFechaObjeto(fechaDesde);
      const d2 = parsearFechaObjeto(fechaHasta);
      const diasRango = (!isNaN(d1.getTime()) && !isNaN(d2.getTime()))
        ? Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1)
        : 30;

      const solapeIni = Math.max(idxInicio, iDesde);
      const solapeFin = Math.min(idxFin, iHasta);
      if (solapeFin < solapeIni) {
        return {
          montoTotal,
          plazoMeses,
          cuotaMensual: Math.round(cuotaMensual),
          mesesActivosEnPeriodo: 0,
          impactoPeriodo: 0,
          mesesTranscurridos,
          amortizadoAcumulado,
          saldoPorDiferir,
          porcentajeAvance,
          mesInicio: indexToYm(idxInicio),
          mesFin: indexToYm(idxFin),
          fechaInicio: fechaIniStr,
          fechaFin: fechaFinStr,
          fechaInicioDMY,
          fechaFinDMY,
          activa: idxHoy <= idxFin
        };
      }
      const mesesSolapados = solapeFin - solapeIni + 1;
      const factorEquivalente = (iDesde === iHasta || (diasRango >= 27 && diasRango <= 31 && mesesSolapados === 1))
        ? 1
        : Math.min(plazoMeses, Number((diasRango / 30).toFixed(4)));
      const mesesEfectivos = Math.min(mesesSolapados, factorEquivalente);
      return {
        montoTotal,
        plazoMeses,
        cuotaMensual: Math.round(cuotaMensual),
        mesesActivosEnPeriodo: Number(mesesEfectivos.toFixed(2)),
        impactoPeriodo: Math.round(cuotaMensual * mesesEfectivos),
        mesesTranscurridos,
        amortizadoAcumulado,
        saldoPorDiferir,
        porcentajeAvance,
        mesInicio: indexToYm(idxInicio),
        mesFin: indexToYm(idxFin),
        fechaInicio: fechaIniStr,
        fechaFin: fechaFinStr,
        fechaInicioDMY,
        fechaFinDMY,
        activa: idxHoy <= idxFin
      };
    }
  }

  if (periodoFiltro === 'MES_ACTUAL') {
    winStart = idxHoy;
    winEnd = idxHoy;
  } else if (/^\d{4}-\d{2}$/.test(periodoFiltro)) {
    const idxMes = ymToIndex(periodoFiltro);
    winStart = idxMes ?? idxHoy;
    winEnd = winStart;
  } else if (periodoFiltro === 'ULTIMOS_90') {
    winStart = idxHoy - 2;
    winEnd = idxHoy;
  } else if (periodoFiltro === 'ANIO_ACTUAL') {
    const anio = parseInt(hoyStr.slice(0, 4), 10) || new Date().getFullYear();
    winStart = anio * 12;
    winEnd = idxHoy;
  } else if (periodoFiltro === 'ALL') {
    winStart = idxInicio;
    winEnd = Math.max(idxInicio, idxHoy);
  }

  const solapeInicio = Math.max(idxInicio, winStart);
  const solapeFinal = Math.min(idxFin, winEnd);
  const mesesActivosEnPeriodo = solapeFinal >= solapeInicio ? (solapeFinal - solapeInicio + 1) : 0;
  const impactoPeriodo = Math.round(cuotaMensual * mesesActivosEnPeriodo);

  return {
    montoTotal,
    plazoMeses,
    cuotaMensual: Math.round(cuotaMensual),
    mesesActivosEnPeriodo,
    impactoPeriodo,
    mesesTranscurridos,
    amortizadoAcumulado,
    saldoPorDiferir,
    porcentajeAvance,
    mesInicio: indexToYm(idxInicio),
    mesFin: indexToYm(idxFin),
    fechaInicio: fechaIniStr,
    fechaFin: fechaFinStr,
    fechaInicioDMY,
    fechaFinDMY,
    activa: idxHoy <= idxFin && (inv.estado || 'activa').toLowerCase() !== 'anulada'
  };
}

// ============================================================================
// 2. MOTOR DE INFORME DE UTILIDAD INTEGRAL POR FINCA (ESTÁNDAR MUNDIAL NIC 41 / CREA)
// ============================================================================

/**
 * Calcula la utilidad económica y biológica real de una finca en un período:
 * - Leche según el último pesaje registrado (si NO hay pesaje de leche en la finca => $0 / Sin ordeño)
 * - Ganancia de peso de todo el ganado (con respaldo al último dato de pesaje de la finca)
 * - Partos / nacimientos registrados como ganancia biológica del ternero (ej. 30 kg × $/kg en sistema)
 * - Todos los costos directos, gastos administrativos, nómina, cuotas diferidas de inversiones y mortalidad NIC 41
 */
export function calcularInformeUtilidadPorFinca({
  finca,
  animales = [],
  pesajes = [],
  operacionesDiarias = [],
  movimientosContables = [],
  pagosNomina = [],
  costosFijosFinca = {},
  inversiones = [],
  fechaDesde = null,
  fechaHasta = null,
  pesoBaseNacimientoKg = 30,
  precioLecheOverride = null,
  precioCarneOverride = null
} = {}) {
  const hoyStr = obtenerFechaHoyLocal();
  const hastaStr = fechaHasta || hoyStr;
  const desdeStr = fechaDesde || `${hastaStr.slice(0, 8)}01`;

  const dtDesde = parsearFechaObjeto(desdeStr);
  const dtHasta = parsearFechaObjeto(hastaStr);
  const diasPeriodo = (!isNaN(dtDesde.getTime()) && !isNaN(dtHasta.getTime()) && dtHasta >= dtDesde)
    ? Math.max(1, Math.round((dtHasta.getTime() - dtDesde.getTime()) / 86400000) + 1)
    : 30;

  const fincaId = finca?.id || '';
  const nombreFinca = finca?.nombre || 'Predio Seleccionado';
  const areaHa = Math.max(0, Number(finca?.areaHa || finca?.hectareas || finca?.areaTotalHa || 0));
  const precioLecheLitro = precioLecheOverride !== null && precioLecheOverride !== undefined && Number(precioLecheOverride) > 0
    ? Number(precioLecheOverride)
    : Number(finca?.precioLecheLitro || finca?.precios?.lecheLitro || 2450);
  const precioCarneKgPie = precioCarneOverride !== null && precioCarneOverride !== undefined && Number(precioCarneOverride) > 0
    ? Number(precioCarneOverride)
    : Number(finca?.precioCarneKgPie || finca?.precios?.kiloEnPie || 8900);
  const pesoTerneroDefault = Math.max(1, Number(pesoBaseNacimientoKg) || 30);

  // Filtrar animales pertenecientes a esta finca
  const animalesFincaTodos = (animales || []).filter((a) => a && (!fincaId || (a.fincaId || a.finca_id) === fincaId));
  const animalesActivos = animalesFincaTodos.filter(
    (a) => (a.estadoVida || a.estado || 'activo') === 'activo' && !a.motivoBaja
  );

  // Operaciones y pesajes de esta finca
  const pesajesFinca = (pesajes || []).filter((p) => p && (!fincaId || (p.fincaId || p.finca_id) === fincaId));
  const opsFinca = (operacionesDiarias || []).filter((op) => op && (!fincaId || (op.fincaId || op.finca_id) === fincaId));

  // --------------------------------------------------------------------------
  // A) PRODUCCIÓN DE LECHE (Basado en último pesaje de leche; si no hay pesajes => SIN ORDEÑO = $0)
  // --------------------------------------------------------------------------
  const eventosLechePorAnimal = new Map(); // clave tag/id -> { litros, fecha }
  let fechaUltimoPesajeLecheFinca = '';
  let totalRegistrosLecheHistoricos = 0;

  // 1. Revisar historialEventos de cada animal de la finca
  for (const a of animalesActivos) {
    const claveA = a.id || String(a.identificacionTag || a.numero || '').trim().toUpperCase();
    const evs = Array.isArray(a.historialEventos) ? a.historialEventos : [];
    for (const ev of evs) {
      if (!ev || (ev.tipo !== 'pesaje_leche' && ev.tipo !== 'leche')) continue;
      const litros = Number(ev.litros ?? ev.totalLitros ?? 0);
      if (litros > 0) {
        totalRegistrosLecheHistoricos++;
        const fEv = String(ev.fecha || '').slice(0, 10);
        if (fEv > fechaUltimoPesajeLecheFinca) fechaUltimoPesajeLecheFinca = fEv;
        const prev = eventosLechePorAnimal.get(claveA);
        if (!prev || fEv >= prev.fecha) {
          eventosLechePorAnimal.set(claveA, { litros, fecha: fEv });
        }
      }
    }
    // También considerar promedioLecheDiariaL cargado explícitamente en el animal
    const promDirecto = Number(a.promedioLecheDiariaL ?? a.produccionLecheDiaria ?? 0);
    if (promDirecto > 0 && !eventosLechePorAnimal.has(claveA)) {
      totalRegistrosLecheHistoricos++;
      eventosLechePorAnimal.set(claveA, { litros: promDirecto, fecha: a.fechaUltimoControlLeche || '' });
    }
  }

  // 2. Revisar operacionesDiarias de leche de la finca
  for (const op of opsFinca) {
    const acc = String(op.accion || op.modulo || '').toLowerCase();
    if (acc !== 'pesaje_leche' && acc !== 'leche' && acc !== 'lecheria') continue;
    const fOp = String(op.fecha || '').slice(0, 10);
    let litrosOp = Number(op.litros ?? op.totalLitros ?? 0);
    if (!litrosOp && typeof op.detalle === 'string') {
      const mLit = op.detalle.match(/(\d+(?:\.\d+)?)\s*L/i);
      if (mLit) litrosOp = parseFloat(mLit[1]);
    }
    if (litrosOp > 0) {
      totalRegistrosLecheHistoricos++;
      if (fOp > fechaUltimoPesajeLecheFinca) fechaUltimoPesajeLecheFinca = fOp;
      const tagOp = String(op.tag || op.animalTag || '').trim().toUpperCase();
      const anmMatch = animalesActivos.find(
        (x) => (op.animalId && x.id === op.animalId) || (tagOp && String(x.identificacionTag || x.numero || '').trim().toUpperCase() === tagOp)
      );
      if (anmMatch) {
        const claveA = anmMatch.id || tagOp;
        const prev = eventosLechePorAnimal.get(claveA);
        if (!prev || fOp >= prev.fecha) {
          eventosLechePorAnimal.set(claveA, { litros: litrosOp, fecha: fOp });
        }
      } else if (tagOp) {
        const prev = eventosLechePorAnimal.get(tagOp);
        if (!prev || fOp >= prev.fecha) {
          eventosLechePorAnimal.set(tagOp, { litros: litrosOp, fecha: fOp });
        }
      }
    }
  }

  const tieneOrdeno = totalRegistrosLecheHistoricos > 0 && eventosLechePorAnimal.size > 0;
  let litrosDiariosFinca = 0;
  if (tieneOrdeno) {
    for (const item of eventosLechePorAnimal.values()) {
      litrosDiariosFinca += Number(item.litros) || 0;
    }
  }
  litrosDiariosFinca = Number(litrosDiariosFinca.toFixed(1));
  const vacasEnOrdeno = tieneOrdeno ? eventosLechePorAnimal.size : 0;
  const litrosProducidosPeriodo = tieneOrdeno ? Number((litrosDiariosFinca * diasPeriodo).toFixed(1)) : 0;
  const ingresoLeche = tieneOrdeno ? Math.round(litrosProducidosPeriodo * precioLecheLitro) : 0;

  // --------------------------------------------------------------------------
  // B) PARTOS / NACIMIENTOS EN EL PERÍODO (Ganancia biológica de la cría al nacer)
  // --------------------------------------------------------------------------
  const partosDedupMap = new Map(); // clave única cría o madre+fecha -> { fecha, pesoKg, tagCria, madreTag }

  const registrarPartoPeriodo = ({ fecha, pesoKg, tagCria, madreTag }) => {
    const f = String(fecha || '').slice(0, 10);
    if (!f || f < desdeStr || f > hastaStr) return;
    const pesoReal = Number(pesoKg) > 0 ? Number(pesoKg) : pesoTerneroDefault;
    const cTag = String(tagCria || '').trim().toUpperCase();
    const mTag = String(madreTag || '').trim().toUpperCase();
    const clave = cTag ? `CRIA__${cTag}` : `MADRE__${mTag}__${f}`;
    if (!partosDedupMap.has(clave)) {
      partosDedupMap.set(clave, {
        fecha: f,
        pesoKg: pesoReal,
        tagCria: cTag,
        madreTag: mTag
      });
    }
  };

  for (const a of animalesFincaTodos) {
    const mTag = a.identificacionTag || a.numero || '';
    if (Array.isArray(a.partosPrevios)) {
      for (const p of a.partosPrevios) {
        if (!p) continue;
        registrarPartoPeriodo({
          fecha: p.fechaParto || p.fecha,
          pesoKg: p.pesoAlNacerKg ?? p.pesoCria ?? p.peso,
          tagCria: p.tagCria || p.criaTag,
          madreTag: mTag
        });
      }
    }
    if (Array.isArray(a.historialEventos)) {
      for (const ev of a.historialEventos) {
        if (!ev || ev.tipo !== 'parto') continue;
        registrarPartoPeriodo({
          fecha: ev.fecha,
          pesoKg: ev.pesoAlNacerKg ?? ev.pesoCria,
          tagCria: ev.criaTag || ev.tagCria,
          madreTag: mTag
        });
      }
    }
    // Terneros en inventario cuya fechaNacimiento está dentro del período evaluado
    const fNac = String(a.fechaNacimiento || a.fecha_nacimiento || '').slice(0, 10);
    if (fNac && fNac >= desdeStr && fNac <= hastaStr) {
      const pNac = Number(a.pesoAlNacer || a.pesoNacimiento || a.pesoAlNacerKg || 0);
      // Si acaba de nacer en la misma fecha de su único pesaje, ese peso corresponde al nacimiento
      const pInicial = pNac > 0
        ? pNac
        : ((String(a.fechaUltimoPesaje || '').slice(0, 10) === fNac && Number(a.ultimoPesoKg) > 0 && Number(a.ultimoPesoKg) <= 65)
            ? Number(a.ultimoPesoKg)
            : pesoTerneroDefault);
      registrarPartoPeriodo({
        fecha: fNac,
        pesoKg: pInicial,
        tagCria: a.identificacionTag || a.numero,
        madreTag: a.madreTag || a.madre || ''
      });
    }
  }

  for (const op of opsFinca) {
    const acc = String(op.accion || op.modulo || '').toLowerCase();
    if (acc !== 'partos' && acc !== 'parto') continue;
    let pCria = Number(op.pesoCria ?? op.peso ?? 0);
    let cTag = op.tagCria || op.criaTag || '';
    if (typeof op.detalle === 'string') {
      if (!pCria) {
        const mKg = op.detalle.match(/(\d+(?:\.\d+)?)\s*kg/i);
        if (mKg) pCria = parseFloat(mKg[1]);
      }
      if (!cTag) {
        const mCr = op.detalle.match(/cr[íi]a\s+([A-Za-z0-9_-]+)/i);
        if (mCr) cTag = mCr[1];
      }
    }
    registrarPartoPeriodo({
      fecha: op.fecha,
      pesoKg: pCria,
      tagCria: cTag,
      madreTag: op.tag || ''
    });
  }

  const listaPartosPeriodo = Array.from(partosDedupMap.values());
  const totalPartosPeriodo = listaPartosPeriodo.length;
  const kilosPartosPeriodo = Number(listaPartosPeriodo.reduce((acc, p) => acc + p.pesoKg, 0).toFixed(1));
  const ingresoPartos = Math.round(kilosPartosPeriodo * precioCarneKgPie);

  // --------------------------------------------------------------------------
  // C) GANANCIA DE PESO DE TODO EL GANADO (Con respaldo al último dato de pesaje de la finca)
  // --------------------------------------------------------------------------
  // Agrupar pesajes históricos por animal para obtener su última GDP real conocida
  const pesajesPorAnimal = new Map();
  let fechaUltimoPesajeFinca = '';

  for (const p of pesajesFinca) {
    const pesoVal = Number(p.pesoNuevo ?? p.peso ?? p.peso_kg ?? 0);
    if (pesoVal <= 0) continue;
    const fPes = String(p.fecha || '').slice(0, 10);
    if (fPes > fechaUltimoPesajeFinca) fechaUltimoPesajeFinca = fPes;

    const clave = p.animalId || String(p.tag || p.animalTag || '').trim().toUpperCase();
    if (!clave) continue;
    if (!pesajesPorAnimal.has(clave)) pesajesPorAnimal.set(clave, []);
    pesajesPorAnimal.get(clave).push({ peso: pesoVal, fecha: fPes, gdp: p.gdp });
  }

  const gdpsIndividualesMap = new Map();
  const gdpsValidasFinca = [];

  for (const a of animalesActivos) {
    const claveId = a.id || '';
    const claveTag = String(a.identificacionTag || a.numero || '').trim().toUpperCase();
    const fUltAnm = String(a.fechaUltimoPesaje || '').slice(0, 10);
    if (fUltAnm > fechaUltimoPesajeFinca) fechaUltimoPesajeFinca = fUltAnm;

    const hist = [
      ...(claveId && pesajesPorAnimal.get(claveId) ? pesajesPorAnimal.get(claveId) : []),
      ...(claveTag && claveTag !== claveId && pesajesPorAnimal.get(claveTag) ? pesajesPorAnimal.get(claveTag) : [])
    ];
    // Ordenar por fecha descendente y deduplicar por fecha
    const porFecha = new Map();
    hist.forEach((h) => {
      if (h.fecha && !porFecha.has(h.fecha)) porFecha.set(h.fecha, h);
    });
    const ordenados = Array.from(porFecha.values()).sort((x, y) => y.fecha.localeCompare(x.fecha));

    let gdpAnimal = null;
    if (ordenados.length >= 2) {
      gdpAnimal = calcularGDP(ordenados[0].peso, ordenados[1].peso, ordenados[0].fecha, ordenados[1].fecha);
    }
    if (gdpAnimal === null && ordenados.length === 1 && ordenados[0].gdp !== null && ordenados[0].gdp !== undefined && !isNaN(Number(ordenados[0].gdp))) {
      gdpAnimal = Number(ordenados[0].gdp);
    }
    if (gdpAnimal === null && a.gdpPromedioGDia !== undefined && a.gdpPromedioGDia !== null && !isNaN(Number(a.gdpPromedioGDia))) {
      gdpAnimal = Number(a.gdpPromedioGDia);
    }
    if (gdpAnimal === null && a.gdpActual !== undefined && a.gdpActual !== null && !isNaN(Number(a.gdpActual))) {
      gdpAnimal = Number(a.gdpActual);
    }
    if (gdpAnimal === null && Number(a.ultimoPesoKg) > 0 && a.fechaNacimiento) {
      const calcNac = calcularGDPEjemplar({
        animal: { ...a, pesoAlNacer: a.pesoAlNacer || pesoTerneroDefault, ultimoPesoKg: 0 },
        pesoActual: Number(a.ultimoPesoKg),
        fechaPesaje: fUltAnm || hastaStr
      });
      if (calcNac && calcNac.gdp !== null) gdpAnimal = calcNac.gdp;
    }

    // Acotar valores extremos irreales por errores de digitación (-1000 a +2200 g/día)
    if (gdpAnimal !== null && !isNaN(gdpAnimal)) {
      const acotado = Math.max(-1000, Math.min(2200, Math.round(gdpAnimal)));
      gdpsIndividualesMap.set(a.id || claveTag, acotado);
      gdpsValidasFinca.push(acotado);
    }
  }

  // Respaldo al último dato promedio de pesaje de la finca para ejemplares activos sin segundo pesaje aún
  const gdpPromedioFinca = gdpsValidasFinca.length > 0
    ? Math.round(gdpsValidasFinca.reduce((s, v) => s + v, 0) / gdpsValidasFinca.length)
    : 0;

  let kilosGanadosMedidos = 0;
  let kilosGanadosProyectadosUltimoDato = 0;
  let uggTotalesFinca = 0;
  let pesoTotalInventarioKg = 0;
  let animalesConGdpDirecta = 0;
  let animalesConGdpUltimoDatoFinca = 0;

  for (const a of animalesActivos) {
    const pesoAct = Number(a.ultimoPesoKg || a.pesoActual || 0);
    if (pesoAct > 0) {
      pesoTotalInventarioKg += pesoAct;
      const baseUgg = (a.especie || 'bovino') === 'bufalino' ? 500 : 450;
      uggTotalesFinca += pesoAct / baseUgg;
    }

    // Si nació dentro del período, su peso de nacimiento ya entró en Partos; sólo gana días posteriores al nacimiento
    const fNac = String(a.fechaNacimiento || a.fecha_nacimiento || '').slice(0, 10);
    let diasActivosAnimal = diasPeriodo;
    if (fNac && fNac > hastaStr) {
      diasActivosAnimal = 0;
    } else if (fNac && fNac >= desdeStr && fNac <= hastaStr) {
      const dtN = parsearFechaObjeto(fNac);
      diasActivosAnimal = !isNaN(dtN.getTime())
        ? Math.max(0, Math.round((dtHasta.getTime() - dtN.getTime()) / 86400000))
        : 0;
    }
    if (diasActivosAnimal <= 0) continue;

    const clave = a.id || String(a.identificacionTag || a.numero || '').trim().toUpperCase();
    if (gdpsIndividualesMap.has(clave)) {
      const gdpInd = gdpsIndividualesMap.get(clave);
      kilosGanadosMedidos += (gdpInd / 1000) * diasActivosAnimal;
      animalesConGdpDirecta++;
    } else if (gdpPromedioFinca !== 0) {
      kilosGanadosProyectadosUltimoDato += (gdpPromedioFinca / 1000) * diasActivosAnimal;
      animalesConGdpUltimoDatoFinca++;
    }
  }

  const kilosGanadosGanado = Number((kilosGanadosMedidos + kilosGanadosProyectadosUltimoDato).toFixed(1));
  const ingresoGananciaPeso = Math.round(kilosGanadosGanado * precioCarneKgPie);

  // --------------------------------------------------------------------------
  // D) COSTOS, GASTOS, NÓMINA, INVERSIONES DIFERIDAS, VENTAS Y MORTALIDAD (NIC 41)
  // --------------------------------------------------------------------------
  const cumpleRangoFecha = (f) => {
    const s = String(f || '').slice(0, 10);
    return Boolean(s && s >= desdeStr && s <= hastaStr);
  };

  const movsFincaPeriodo = (movimientosContables || []).filter(
    (m) => m && (!fincaId || (m.fincaId || m.finca_id) === fincaId) && cumpleRangoFecha(m.fecha)
  );

  let costosDirectosContab = 0;
  let comprasGanadoReposicion = 0;
  let gastosAdminContab = 0;
  let nominaContab = 0;
  let ventasLecheEfectivoContab = 0;
  let ventasGanadoEfectivoContab = 0;
  let otrosIngresosContab = 0;

  const idsNominaEnMovs = new Set(movsFincaPeriodo.map((m) => m.nominaPagoId).filter(Boolean));

  for (const m of movsFincaPeriodo) {
    const monto = Math.max(0, Number(m.monto) || 0);
    const tipo = String(m.tipo || '').toLowerCase();
    const catLower = String(m.categoria || '').toLowerCase();

    if (tipo === 'ingreso') {
      if (catLower.includes('leche') || catLower.includes('queso')) {
        ventasLecheEfectivoContab += monto;
      } else if (catLower.includes('ganado') || catLower.includes('novillo') || catLower.includes('desteto')) {
        ventasGanadoEfectivoContab += monto;
      } else {
        otrosIngresosContab += monto;
      }
    } else if (tipo === 'costo_directo') {
      if (catLower.includes('compra de ganado')) {
        comprasGanadoReposicion += monto;
      } else {
        costosDirectosContab += monto;
      }
    } else if (tipo === 'gasto_admin') {
      gastosAdminContab += monto;
    } else if (tipo === 'nomina') {
      nominaContab += monto;
    }
    // Nota: tipo === 'inversion_diferida' NO entra de golpe aquí, sino abajo por su cuota mensual diferida
  }

  for (const p of (pagosNomina || [])) {
    if (!p) continue;
    const fid = p.fincaId || p.finca_id;
    if (fincaId && fid !== fincaId) continue;
    if (!cumpleRangoFecha(p.fecha) || idsNominaEnMovs.has(p.id)) continue;
    nominaContab += Math.max(0, Number(p.costoTotalFinca || p.montoTotal || p.netoTrabajador || 0));
  }

  // Respaldo inteligente a costosFijosFinca parametrizados en Administración si aún no se digitaron en Contabilidad del período
  const factorMes = diasPeriodo / 30;
  const fijosConfig = costosFijosFinca || {};
  let costosFijosRespaldo = 0;
  if (costosDirectosContab === 0 && gastosAdminContab === 0) {
    const fijosSinNomina =
      (parseFloat(fijosConfig.insumos) || 0) +
      (parseFloat(fijosConfig.herbicidas) || 0) +
      (parseFloat(fijosConfig.maquinaria) || 0) +
      (parseFloat(fijosConfig.servicios) || 0) +
      (parseFloat(fijosConfig.otros) || 0);
    costosFijosRespaldo += Math.round(fijosSinNomina * factorMes);
  }
  if (nominaContab === 0 && (parseFloat(fijosConfig.nomina) || 0) > 0) {
    nominaContab = Math.round((parseFloat(fijosConfig.nomina) || 0) * factorMes);
  }

  // Inversiones Diferidas (tanto de ModuloContabilidad tipo 'inversion_diferida' como de ModuloAdmin inversiones[])
  const inversionesUnificadasMap = new Map();
  for (const m of (movimientosContables || [])) {
    if (!m || String(m.tipo || '').toLowerCase() !== 'inversion_diferida') continue;
    if (fincaId && (m.fincaId || m.finca_id) !== fincaId) continue;
    inversionesUnificadasMap.set(m.id, m);
  }
  for (const inv of (inversiones || [])) {
    if (!inv) continue;
    if (fincaId && (inv.fincaId || inv.finca_id) !== fincaId) continue;
    const key = inv.movimientoContableId || inv.id;
    if (!inversionesUnificadasMap.has(key)) {
      inversionesUnificadasMap.set(key, inv);
    }
  }

  let cuotaInversionesDiferidas = 0;
  const inversionesActivasDetalle = [];
  for (const inv of inversionesUnificadasMap.values()) {
    const calcInv = calcularAmortizacionInversionEnPeriodo(inv, {
      fechaDesde: desdeStr,
      fechaHasta: hastaStr,
      fechaReferencia: hastaStr
    });
    if (calcInv.impactoPeriodo > 0 || calcInv.activa) {
      cuotaInversionesDiferidas += calcInv.impactoPeriodo;
      inversionesActivasDetalle.push({
        id: inv.id,
        concepto: inv.concepto || inv.nombreInversion || inv.descripcion || 'Inversión Diferida',
        categoria: inv.categoria || 'Infraestructura / Equipos',
        ...calcInv
      });
    }
  }

  // Variables Expertas Mundiales (NIC 41 / CREA / DairyComp 305):
  // 1. Pérdida patrimonial biológica por Mortalidad en el período
  let muertesCount = 0;
  let kilosPerdidosMortalidad = 0;
  // 2. Diferencial comercial en ventas de ganado (sobreprecio o descuento frente al valor biológico ya causado)
  let ventasAnimalesCount = 0;
  let valorVentasAnimalesReal = 0;
  let diferencialComercialVentas = 0;

  for (const a of animalesFincaTodos) {
    const fBaja = String(a.fechaBaja || a.fechaExtraccion || '').slice(0, 10);
    if (!fBaja || fBaja < desdeStr || fBaja > hastaStr) continue;
    const mot = String(a.motivoBaja || a.estadoVida || '').toLowerCase();
    const pesoSalida = Number(a.pesoVenta || a.ultimoPesoKg || a.pesoActual || 250);

    if (mot.includes('muert')) {
      muertesCount++;
      kilosPerdidosMortalidad += pesoSalida;
    } else if (mot.includes('venta')) {
      ventasAnimalesCount++;
      const valVenta = Number(a.valorVenta || 0);
      if (valVenta > 0) {
        valorVentasAnimalesReal += valVenta;
        const valorBiologicoEnLibros = pesoSalida * precioCarneKgPie;
        diferencialComercialVentas += Math.round(valVenta - valorBiologicoEnLibros);
      }
    }
  }

  const perdidaMortalidadCOP = Math.round(kilosPerdidosMortalidad * precioCarneKgPie);

  // 3. Indicador de Alerta Experta: Lucro cesante estimado por Días Abiertos > 120d (Estándar DairyComp 305 / FEDEGÁN: ~0.8 L leche + proporción ternero perdido por día abierto extra)
  let vientresCriticosAbiertos = 0;
  let diasAbiertosExcesoTotal = 0;
  for (const a of animalesActivos) {
    if (String(a.sexo || 'hembra').toLowerCase() !== 'hembra') continue;
    const fParto = a.fechaUltimoParto || a.ultimoParto;
    if (!fParto) continue;
    const dAb = calcularDiasAbiertos(fParto, a.estadoReproductivo, hastaStr);
    if (dAb > 120) {
      vientresCriticosAbiertos++;
      diasAbiertosExcesoTotal += Math.min(diasPeriodo, dAb - 120);
    }
  }
  const costoDiaAbiertoUnitario = Math.round((pesoTerneroDefault * precioCarneKgPie) / 365 + (tieneOrdeno ? precioLecheLitro * 1.5 : 0));
  const lucroCesanteDiasAbiertos = Math.round(diasAbiertosExcesoTotal * costoDiaAbiertoUnitario);

  // --------------------------------------------------------------------------
  // E) CONSOLIDACIÓN DE ESTADO DE RESULTADOS BIOLÓGICO + ECONÓMICO Y KPIs MUNDIALES
  // --------------------------------------------------------------------------
  const totalCostosDirectos = costosDirectosContab + costosFijosRespaldo;
  const totalGastosAdmin = gastosAdminContab;
  const totalNomina = nominaContab;
  const egresosOperativosSinDiferidos = totalCostosDirectos + totalGastosAdmin + totalNomina;
  const totalEgresosConDiferidosYMortalidad = egresosOperativosSinDiferidos + cuotaInversionesDiferidas + perdidaMortalidadCOP;

  const ingresoBrutoProduccion =
    ingresoLeche +
    ingresoGananciaPeso +
    ingresoPartos +
    otrosIngresosContab +
    diferencialComercialVentas;

  const ebitdaGanadero = ingresoBrutoProduccion - egresosOperativosSinDiferidos;
  const utilidadNeta = ebitdaGanadero - cuotaInversionesDiferidas - perdidaMortalidadCOP;
  const margenNetoPct = ingresoBrutoProduccion > 0
    ? Number(((utilidadNeta / ingresoBrutoProduccion) * 100).toFixed(1))
    : 0;
  const roiOperativoPct = totalEgresosConDiferidosYMortalidad > 0
    ? Number(((utilidadNeta / totalEgresosConDiferidosYMortalidad) * 100).toFixed(1))
    : 0;

  // Costos unitarios prorrateados por participación de ingresos (Estándar CREA Doble Propósito)
  const baseProdCarneLeche = Math.max(1, ingresoLeche + ingresoGananciaPeso + ingresoPartos);
  const propLeche = tieneOrdeno ? (ingresoLeche / baseProdCarneLeche) : 0;
  const propCarne = 1 - propLeche;

  const egresosTotalesAsignables = egresosOperativosSinDiferidos + cuotaInversionesDiferidas;
  const kilosTotalesCarneProducidos = Number((kilosGanadosGanado + kilosPartosPeriodo).toFixed(1));

  const costoUnitarioLitroLeche = (tieneOrdeno && litrosProducidosPeriodo > 0)
    ? Math.round((egresosTotalesAsignables * propLeche) / litrosProducidosPeriodo)
    : 0;
  const costoUnitarioKgCarne = kilosTotalesCarneProducidos > 0
    ? Math.round((egresosTotalesAsignables * propCarne) / kilosTotalesCarneProducidos)
    : 0;

  const uggRedondeado = Number(uggTotalesFinca.toFixed(2));
  const cargaUGGPorHa = areaHa > 0 ? Number((uggTotalesFinca / areaHa).toFixed(2)) : 0;
  const utilidadPorHa = areaHa > 0 ? Math.round(utilidadNeta / areaHa) : 0;
  const utilidadAnualizadaPorHa = areaHa > 0 ? Math.round((utilidadNeta * (365 / diasPeriodo)) / areaHa) : 0;
  const utilidadPorCabeza = animalesActivos.length > 0 ? Math.round(utilidadNeta / animalesActivos.length) : 0;
  const utilidadPorUGG = uggTotalesFinca > 0 ? Math.round(utilidadNeta / uggTotalesFinca) : 0;

  const puntoEquilibrioKgCarne = precioCarneKgPie > 0
    ? Number((egresosTotalesAsignables / precioCarneKgPie).toFixed(1))
    : 0;
  const puntoEquilibrioLitrosPeriodo = (tieneOrdeno && precioLecheLitro > 0)
    ? Number((egresosTotalesAsignables / precioLecheLitro).toFixed(1))
    : 0;

  // Flujo de caja en efectivo (para conciliación frente a utilidad biológica)
  const ingresosCajaEfectivo = (ventasLecheEfectivoContab || (tieneOrdeno ? ingresoLeche : 0)) +
    Math.max(ventasGanadoEfectivoContab, valorVentasAnimalesReal) +
    otrosIngresosContab;
  const flujoCajaLiquido = ingresosCajaEfectivo - egresosOperativosSinDiferidos - comprasGanadoReposicion;

  return {
    fincaId,
    nombreFinca,
    areaHa,
    fechaDesde: desdeStr,
    fechaHasta: hastaStr,
    diasPeriodo,
    precios: {
      precioLecheLitro,
      precioCarneKgPie,
      pesoBaseNacimientoKg: pesoTerneroDefault
    },
    leche: {
      tieneOrdeno,
      vacasEnOrdeno,
      fechaUltimoPesajeLeche: fechaUltimoPesajeLecheFinca || null,
      litrosDiariosFinca,
      litrosProducidosPeriodo,
      ingresoLeche,
      ventasLecheEfectivoContab
    },
    carne: {
      animalesActivosCount: animalesActivos.length,
      animalesConGdpDirecta,
      animalesConGdpUltimoDatoFinca,
      fechaUltimoPesajeFinca: fechaUltimoPesajeFinca || null,
      gdpPromedioFinca,
      kilosGanadosMedidos: Number(kilosGanadosMedidos.toFixed(1)),
      kilosGanadosProyectadosUltimoDato: Number(kilosGanadosProyectadosUltimoDato.toFixed(1)),
      kilosGanadosGanado,
      ingresoGananciaPeso,
      pesoTotalInventarioKg: Math.round(pesoTotalInventarioKg),
      uggTotalesFinca: uggRedondeado,
      cargaUGGPorHa
    },
    partos: {
      totalPartosPeriodo,
      kilosPartosPeriodo,
      ingresoPartos,
      detallePartos: listaPartosPeriodo
    },
    ajustesNIC41: {
      otrosIngresosContab,
      ventasAnimalesCount,
      valorVentasAnimalesReal,
      diferencialComercialVentas,
      comprasGanadoReposicion,
      muertesCount,
      kilosPerdidosMortalidad: Number(kilosPerdidosMortalidad.toFixed(1)),
      perdidaMortalidadCOP,
      vientresCriticosAbiertos,
      diasAbiertosExcesoTotal,
      lucroCesanteDiasAbiertos
    },
    egresos: {
      costosDirectos: totalCostosDirectos,
      costosFijosRespaldo,
      gastosAdmin: totalGastosAdmin,
      nomina: totalNomina,
      egresosOperativosSinDiferidos,
      cuotaInversionesDiferidas: Math.round(cuotaInversionesDiferidas),
      inversionesActivasDetalle,
      perdidaMortalidadCOP,
      totalEgresos: Math.round(totalEgresosConDiferidosYMortalidad)
    },
    resultados: {
      ingresoBrutoProduccion: Math.round(ingresoBrutoProduccion),
      ebitdaGanadero: Math.round(ebitdaGanadero),
      utilidadNeta: Math.round(utilidadNeta),
      margenNetoPct,
      roiOperativoPct,
      utilidadPorHa,
      utilidadAnualizadaPorHa,
      utilidadPorCabeza,
      utilidadPorUGG,
      kilosTotalesCarneProducidos,
      costoUnitarioKgCarne,
      costoUnitarioLitroLeche,
      puntoEquilibrioKgCarne,
      puntoEquilibrioLitrosPeriodo,
      flujoCajaLiquido: Math.round(flujoCajaLiquido)
    }
  };
}

// ============================================================================
// 3. AUDITORÍA DE JORNADAS: ANIMALES NO TRABAJADOS / FALTANTES EN CAMPO
// ============================================================================

/**
 * Detecta automáticamente las fechas de jornadas de trabajo registradas en una finca
 * para facilitar elegir con un clic la jornada a auditar (ej. Pesaje en Waterloo).
 */
export function detectarJornadasTrabajoFinca({
  fincaId,
  pesajes = [],
  operacionesDiarias = [],
  servicios = [],
  tipoTrabajo = 'pesajes'
} = {}) {
  const conteoPorFecha = new Map(); // fecha -> Set(claves animal)

  const registrar = (fechaRaw, claveAnimal) => {
    const f = String(fechaRaw || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !claveAnimal) return;
    if (!conteoPorFecha.has(f)) conteoPorFecha.set(f, new Set());
    conteoPorFecha.get(f).add(String(claveAnimal).toUpperCase());
  };

  if (tipoTrabajo === 'pesajes' || tipoTrabajo === 'cualquiera') {
    for (const p of (pesajes || [])) {
      if (!p) continue;
      if (fincaId && (p.fincaId || p.finca_id) !== fincaId) continue;
      registrar(p.fecha, p.animalId || p.tag || p.animalTag);
    }
  }

  for (const op of (operacionesDiarias || [])) {
    if (!op) continue;
    if (fincaId && (op.fincaId || op.finca_id) !== fincaId) continue;
    const acc = String(op.accion || op.modulo || '').toLowerCase();
    const coincide =
      tipoTrabajo === 'cualquiera' ||
      (tipoTrabajo === 'pesajes' && (acc === 'pesajes' || acc === 'pesaje' || acc === 'destete' || acc === 'destetes')) ||
      (tipoTrabajo === 'leche' && (acc === 'pesaje_leche' || acc === 'leche' || acc === 'lecheria')) ||
      (tipoTrabajo === 'palpaciones' && (acc === 'palpacion' || acc === 'palpaciones')) ||
      (tipoTrabajo === 'servicios' && (acc === 'servicios' || acc === 'servicio')) ||
      (tipoTrabajo === 'partos' && (acc === 'partos' || acc === 'parto' || acc === 'destete' || acc === 'destetes'));
    if (coincide) {
      registrar(op.fecha, op.animalId || op.tag || op.animalTag);
    }
  }

  if (tipoTrabajo === 'servicios' || tipoTrabajo === 'cualquiera') {
    for (const s of (servicios || [])) {
      if (!s) continue;
      if (fincaId && (s.fincaId || s.finca_id) !== fincaId) continue;
      registrar(s.fecha, s.animalId || s.tag || s.animalTag);
    }
  }

  return Array.from(conteoPorFecha.entries())
    .map(([fecha, setAnimales]) => ({
      fecha,
      cantidadAnimales: setAnimales.size
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 30);
}

/**
 * Genera el informe exacto de animales que NO se trabajaron en una jornada o rango de fechas
 * (ej. Sistema tiene 250 activos en Waterloo, se pesaron 200 => lista los 50 faltantes para buscar en terreno).
 */
export function calcularAnimalesNoTrabajados({
  fincaId,
  fincaNombre = '',
  animales = [],
  pesajes = [],
  operacionesDiarias = [],
  servicios = [],
  tipoTrabajo = 'pesajes', // 'pesajes' | 'leche' | 'palpaciones' | 'servicios' | 'cualquiera'
  fechaDesde = null,
  fechaHasta = null,
  filtroLote = 'todos',
  filtroCategoria = 'todas',
  filtroSexo = 'todos'
} = {}) {
  const hoyStr = obtenerFechaHoyLocal();
  const desdeStr = fechaDesde || hoyStr;
  const hastaStr = fechaHasta || desdeStr;

  // 1. Inventario activo esperado en la finca
  let inventarioEsperado = (animales || []).filter((a) => {
    if (!a) return false;
    if (fincaId && (a.fincaId || a.finca_id) !== fincaId) return false;
    const activo = (a.estadoVida || a.estado || 'activo') === 'activo' && !a.motivoBaja;
    if (!activo) return false;
    // Excluir crías nacidas en fecha posterior al cierre de la jornada auditada
    const fNac = String(a.fechaNacimiento || a.fecha_nacimiento || '').slice(0, 10);
    if (fNac && fNac > hastaStr) return false;
    return true;
  });

  if (filtroLote && filtroLote !== 'todos') {
    const lLower = filtroLote.trim().toLowerCase();
    inventarioEsperado = inventarioEsperado.filter((a) => String(a.lote || '').trim().toLowerCase() === lLower);
  }
  if (filtroCategoria && filtroCategoria !== 'todas') {
    const cLower = filtroCategoria.trim().toLowerCase();
    inventarioEsperado = inventarioEsperado.filter((a) => String(a.categoria || '').trim().toLowerCase().includes(cLower));
  }
  if (filtroSexo && filtroSexo !== 'todos') {
    const sLower = filtroSexo.trim().toLowerCase();
    inventarioEsperado = inventarioEsperado.filter((a) => String(a.sexo || 'hembra').trim().toLowerCase() === sLower);
  }

  // 2. Identificar todos los animales trabajados dentro del rango [desdeStr, hastaStr]
  const idsTrabajados = new Set();
  const tagsTrabajados = new Set();

  const marcarTrabajado = (id, tag) => {
    if (id) idsTrabajados.add(String(id));
    if (tag) tagsTrabajados.add(String(tag).trim().toUpperCase());
  };

  const enRango = (fechaVal) => {
    const f = String(fechaVal || '').slice(0, 10);
    return Boolean(f && f >= desdeStr && f <= hastaStr);
  };

  if (tipoTrabajo === 'pesajes' || tipoTrabajo === 'cualquiera') {
    for (const p of (pesajes || [])) {
      if (!p) continue;
      if (fincaId && (p.fincaId || p.finca_id) !== fincaId) continue;
      if (enRango(p.fecha)) {
        marcarTrabajado(p.animalId, p.tag || p.animalTag);
      }
    }
    for (const a of inventarioEsperado) {
      if (enRango(a.fechaUltimoPesaje || a.ultimoPesajeFecha)) {
        marcarTrabajado(a.id, a.identificacionTag || a.numero);
      }
    }
  }

  for (const op of (operacionesDiarias || [])) {
    if (!op) continue;
    if (fincaId && (op.fincaId || op.finca_id) !== fincaId) continue;
    if (!enRango(op.fecha)) continue;
    const acc = String(op.accion || op.modulo || '').toLowerCase();
    const coincide =
      tipoTrabajo === 'cualquiera' ||
      (tipoTrabajo === 'pesajes' && (acc === 'pesajes' || acc === 'pesaje' || acc === 'destete' || acc === 'destetes')) ||
      (tipoTrabajo === 'leche' && (acc === 'pesaje_leche' || acc === 'leche' || acc === 'lecheria')) ||
      (tipoTrabajo === 'palpaciones' && (acc === 'palpacion' || acc === 'palpaciones')) ||
      (tipoTrabajo === 'servicios' && (acc === 'servicios' || acc === 'servicio'));
    if (coincide) {
      marcarTrabajado(op.animalId, op.tag || op.animalTag);
      if (op.madreTag) marcarTrabajado(null, op.madreTag);
      if (op.criaTag) marcarTrabajado(null, op.criaTag);
    }
  }

  if (tipoTrabajo === 'servicios' || tipoTrabajo === 'cualquiera') {
    for (const s of (servicios || [])) {
      if (!s) continue;
      if (fincaId && (s.fincaId || s.finca_id) !== fincaId) continue;
      if (enRango(s.fecha)) {
        marcarTrabajado(s.animalId, s.tag || s.animalTag);
      }
    }
  }

  // También inspeccionar historialEventos internos de cada ejemplar (para palpaciones/leche/destetes)
  for (const a of inventarioEsperado) {
    if (!Array.isArray(a.historialEventos)) continue;
    for (const ev of a.historialEventos) {
      if (!ev || !enRango(ev.fecha)) continue;
      const t = String(ev.tipo || '').toLowerCase();
      const coincideEv =
        tipoTrabajo === 'cualquiera' ||
        (tipoTrabajo === 'pesajes' && (t === 'pesaje' || t === 'destete')) ||
        (tipoTrabajo === 'leche' && (t === 'pesaje_leche' || t === 'leche')) ||
        (tipoTrabajo === 'palpaciones' && t === 'palpacion');
      if (coincideEv) {
        marcarTrabajado(a.id, a.identificacionTag || a.numero);
      }
    }
  }

  // 3. Separar Trabajados vs NO Trabajados (Faltantes)
  const trabajados = [];
  const faltantes = [];
  const dtRef = parsearFechaObjeto(hastaStr);

  for (const a of inventarioEsperado) {
    const tagUpper = String(a.identificacionTag || a.numero || '').trim().toUpperCase();
    const fueTrabajado = (a.id && idsTrabajados.has(String(a.id))) || (tagUpper && tagsTrabajados.has(tagUpper));
    if (fueTrabajado) {
      trabajados.push(a);
    } else {
      const fechaUlt = a.fechaUltimoPesaje || a.ultimoPesajeFecha || a.fechaUltimoParto || '';
      let diasSinTrabajar = null;
      if (fechaUlt) {
        const dtU = parsearFechaObjeto(fechaUlt);
        if (!isNaN(dtU.getTime()) && !isNaN(dtRef.getTime())) {
          diasSinTrabajar = Math.max(0, Math.round((dtRef.getTime() - dtU.getTime()) / 86400000));
        }
      }
      faltantes.push({
        ...a,
        tag: a.identificacionTag || a.numero || '',
        fechaUltimoTrabajoPrevio: fechaUlt || null,
        diasSinTrabajar
      });
    }
  }

  // Ordenar faltantes por Lote y luego por Arete para facilitar recorrido en potrero
  faltantes.sort((x, y) => {
    const lComp = String(x.lote || 'General').localeCompare(String(y.lote || 'General'), 'es');
    if (lComp !== 0) return lComp;
    return String(x.tag || '').localeCompare(String(y.tag || ''), 'es', { numeric: true });
  });

  // Agrupar faltantes por lote / potrero
  const lotesMap = new Map();
  for (const f of faltantes) {
    const loteNombre = (f.lote || 'General').trim();
    lotesMap.set(loteNombre, (lotesMap.get(loteNombre) || 0) + 1);
  }
  const resumenPorLote = Array.from(lotesMap.entries())
    .map(([lote, cantidad]) => ({ lote, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);

  const totalSistema = inventarioEsperado.length;
  const totalTrabajados = trabajados.length;
  const totalFaltantes = faltantes.length;
  const porcentajeCobertura = totalSistema > 0
    ? Number(((totalTrabajados / totalSistema) * 100).toFixed(1))
    : 0;

  return {
    fincaId,
    fincaNombre,
    tipoTrabajo,
    fechaDesde: desdeStr,
    fechaHasta: hastaStr,
    totalSistema,
    totalTrabajados,
    totalFaltantes,
    porcentajeCobertura,
    trabajados,
    faltantes,
    resumenPorLote
  };
}
