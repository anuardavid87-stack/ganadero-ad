/**
 * BOVITRACK PRO PWA - MOTOR ZOOTÉCNICO DE CAMPO
 * Cálculos zootécnicos tropicales: GDP, Días Abiertos, DEL, IEP Proyectado y Secado.
 */

export const PARAMETROS_ESPECIES = {
  bovino: {
    nombre: 'Bovino (Bos taurus / Bos indicus)',
    diasGestacionMedia: 283,
    diasSecadoRecomendado: 60,
    umbralAlertaSecado: 210, // 7 meses de gestación (210 días)
    pesoBaseUGG: 450
  },
  bufalino: {
    nombre: 'Bufalino (Bubalus bubalis)',
    diasGestacionMedia: 310,
    diasSecadoRecomendado: 60,
    umbralAlertaSecado: 235,
    pesoBaseUGG: 500
  }
};

/**
 * Calcula la Ganancia Diaria de Peso (GDP) en gramos/día.
 */
export function calcularGDP(pesoFinal, pesoInicial, fechaFinal, fechaInicial) {
  if (!pesoFinal || !pesoInicial || !fechaFinal || !fechaInicial) return null;
  const pf = parseFloat(pesoFinal);
  const pi = parseFloat(pesoInicial);
  const df = new Date(fechaFinal);
  const di = new Date(fechaInicial);

  const diffMs = df.getTime() - di.getTime();
  const dias = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (dias <= 0) return null;

  const gdp = ((pf - pi) * 1000) / dias;
  return Math.round(gdp);
}

/**
 * Calcula la Ganancia Diaria de Peso (GDP) de un ejemplar.
 * Si no tiene registro de pesaje anterior, se calcula desde su fecha de nacimiento
 * hasta el día en que se pesó.
 */
export function calcularGDPEjemplar({ animal, pesoActual, fechaPesaje }) {
  if (!pesoActual || !fechaPesaje) return null;
  const pAct = parseFloat(pesoActual);
  if (isNaN(pAct) || pAct <= 0) return null;

  // 1. Caso A: Si tiene pesaje previo registrado
  const pPrev = parseFloat(animal?.ultimoPesoKg || animal?.pesoActual);
  const fPrev = animal?.fechaUltimoPesaje || animal?.ultimoPesajeFecha;

  if (pPrev > 0 && fPrev && fPrev !== fechaPesaje) {
    const gdp = calcularGDP(pAct, pPrev, fechaPesaje, fPrev);
    if (gdp !== null) {
      const dPrev = new Date(fPrev);
      const dPes = new Date(fechaPesaje);
      const dias = Math.round((dPes.getTime() - dPrev.getTime()) / (1000 * 60 * 60 * 24));
      return { gdp, origen: 'anterior', dias, pesoBase: pPrev, fechaBase: fPrev };
    }
  }

  // 2. Caso B: Si NO tiene pesaje anterior, calcular con fecha de nacimiento
  const fNac = animal?.fechaNacimiento || animal?.fecha_nacimiento;
  if (fNac) {
    const dNac = new Date(fNac);
    const dPes = new Date(fechaPesaje);
    const diasVida = Math.round((dPes.getTime() - dNac.getTime()) / (1000 * 60 * 60 * 24));
    if (diasVida > 0) {
      const pesoNac = parseFloat(animal?.pesoAlNacer || animal?.pesoNacimiento || animal?.pesoNacimientoKg || animal?.pesoAlNacerKg || animal?.peso_al_nacer || 0);
      const gananciaKg = pAct - pesoNac;
      const gdp = Math.round((gananciaKg * 1000) / diasVida);
      return { gdp, origen: 'nacimiento', dias: diasVida, pesoBase: pesoNac, fechaBase: fNac };
    }
  }

  return null;
}

/**
 * Calcula los Días Abiertos transcurridos desde el último parto.
 */
export function calcularDiasAbiertos(fechaUltimoParto, estadoRepro, fechaCorte = new Date()) {
  if (!fechaUltimoParto) return 0;
  const st = (estadoRepro || '').toLowerCase();
  if (st.includes('preñad') || st.includes('prenad')) return 0;

  const fParto = new Date(fechaUltimoParto);
  const fRef = new Date(fechaCorte);
  const dias = Math.floor((fRef.getTime() - fParto.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, dias);
}

/**
 * Calcula los Días en Leche (DEL) en vacas en lactancia.
 */
export function calcularDEL(fechaUltimoParto, categoria, fechaCorte = new Date()) {
  if (!fechaUltimoParto) return 0;
  const cat = (categoria || '').toLowerCase();
  if (!cat.includes('ordeño') && !cat.includes('lactante')) return 0;

  const fParto = new Date(fechaUltimoParto);
  const fRef = new Date(fechaCorte);
  const dias = Math.floor((fRef.getTime() - fParto.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, dias);
}

/**
 * Calcula el Intervalo Entre Partos (IEP) proyectado en días y meses.
 */
export function calcularIEP(diasAbiertos, especie = 'bovino') {
  const conf = PARAMETROS_ESPECIES[especie] || PARAMETROS_ESPECIES.bovino;
  const dias = (diasAbiertos || 0) + conf.diasGestacionMedia;
  return {
    dias,
    meses: parseFloat((dias / 30.417).toFixed(1))
  };
}

/**
 * Calcula la edad en meses cumplidos.
 */
export function calcularEdadMeses(fechaNacimiento, fechaCorte = new Date()) {
  if (!fechaNacimiento) return 0;
  const fn = new Date(fechaNacimiento);
  const fc = new Date(fechaCorte);
  let m = (fc.getFullYear() - fn.getFullYear()) * 12 + (fc.getMonth() - fn.getMonth());
  if (fc.getDate() < fn.getDate()) m--;
  return Math.max(0, m);
}

/**
 * Verifica si una hembra gestante debe recibir alerta de secado (7 meses = 210 días).
 */
export function verificarSecado7Meses(diasGestacion, especie = 'bovino') {
  const conf = PARAMETROS_ESPECIES[especie] || PARAMETROS_ESPECIES.bovino;
  return diasGestacion >= conf.umbralAlertaSecado && diasGestacion < conf.diasGestacionMedia;
}

/**
 * Calcula las fechas clave proyectadas a partir de un servicio reproductivo (IA, TE o Monta).
 */
export function calcularProyeccionServicio(fechaServicio, especie = 'bovino') {
  if (!fechaServicio) return null;
  const conf = PARAMETROS_ESPECIES[especie] || PARAMETROS_ESPECIES.bovino;
  const fServ = new Date(fechaServicio);

  // 1. Ecografía temprana (30-35 días post-servicio)
  const fEco = new Date(fServ);
  fEco.setDate(fEco.getDate() + 32);

  // 2. Palpación rectal confirmatoria (45-60 días post-servicio)
  const fPalp = new Date(fServ);
  fPalp.setDate(fPalp.getDate() + 60);

  // 3. Fecha probable de parto
  const fParto = new Date(fServ);
  fParto.setDate(fParto.getDate() + conf.diasGestacionMedia);

  // 4. Días transcurridos desde el servicio
  const hoy = new Date();
  const diasDesdeServicio = Math.max(0, Math.floor((hoy.getTime() - fServ.getTime()) / (1000 * 60 * 60 * 24)));

  return {
    fechaServicio,
    diasDesdeServicio,
    fechaEcografiaEstimada: fEco.toISOString().split('T')[0],
    fechaPalpacionEstimada: fPalp.toISOString().split('T')[0],
    fechaPartoEstimada: fParto.toISOString().split('T')[0],
    diasGestacionMedia: conf.diasGestacionMedia
  };
}

