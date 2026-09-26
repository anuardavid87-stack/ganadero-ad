/**
 * BOVITRACK PRO PWA - MOTOR FINANCIERO AGROTECNOLÓGICO
 * Cálculos de costos fijos, cuotas de amortización diferidas, valorización de leche y carne, y ROI.
 */

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
    .filter((inv) => (inv.estado || '').toLowerCase() === 'activa')
    .reduce((acum, inv) => {
      const monto = parseFloat(inv.montoTotalInversion || inv.montoTotal) || 0;
      const plazo = parseInt(inv.plazoMesesDiferido || inv.plazoMeses) || 1;
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
  const areaHa = parseFloat(finca?.areaTotalHa || finca?.areaHa || 1);

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
