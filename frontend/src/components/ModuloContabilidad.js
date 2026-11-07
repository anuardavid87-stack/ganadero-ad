/**
 * GANADERO AD - MÓDULO INTEGRAL DE CONTABILIDAD, COSTOS Y NÓMINA MULTI-FINCA
 * Diseño "Modern Agro-Tech" | Aislamiento 100% por Finca + Consolidado General
 * Submódulos:
 *  1. Dashboard Financiero, Indicadores Unitarios ($/Cabeza y $/Ha) y Estado de Resultados (P&G)
 *  2. Ingresos, Costos Directos de Producción y Gastos Administrativos
 *  3. Nómina, Seguridad Social (EPS, AFP, ARL, Caja) y Prestaciones (Prima, Cesantías, Intereses, Vacaciones)
 */

export const CATEGORIAS_CONTABILIDAD = {
  ingreso: [
    'Venta de ganado (novillos, destetos, descarte)',
    'Venta de leche/queso',
    'Alquiler de pasturas',
    'Otros'
  ],
  costo_directo: [
    'Compra de ganado',
    'Sanidad y medicamentos',
    'Suplementación (sal, melaza, silo, concentrado)',
    'Mantenimiento de potreros y cercas (herbicidas, alambre, semillas)',
    'Energía/riego y bombeo',
    'Transporte/fletes'
  ],
  gasto_admin: [
    'Servicios',
    'Impuestos',
    'Honorarios profesionales',
    'Mantenimiento de vehículos/maquinaria',
    'Varios'
  ],
  nomina: [
    'Nómina, Seguridad Social y Prestaciones'
  ]
};

export function formatearMonedaCOP(valor) {
  const num = Math.round(Number(valor) || 0);
  const signo = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  return `${signo}$${abs.toLocaleString('es-CO')}`;
}

/**
 * Calcula la liquidación de nómina, aportes de seguridad social y provisión de prestaciones
 */
export function calcularLiquidacionNomina({
  modalidad = 'Sueldo fijo mensual',
  valorBase = 0,
  tipoPeriodo = 'Mensual',
  diasTrabajados = 30,
  bonificaciones = 0,
  descuentoPrestamos = 0,
  incluirSeguridadSocial = true,
  incluirPrestaciones = true,
  saludEps = null,
  pensionAfp = null,
  arlRiesgo = null,
  cajaCompensacion = null,
  prima = null,
  cesantias = null,
  interesesCesantias = null,
  vacaciones = null
} = {}) {
  const baseNum = Math.max(0, Number(valorBase) || 0);
  const diasNum = Math.max(1, Number(diasTrabajados) || (tipoPeriodo === 'Quincenal' ? 15 : 30));
  const esJornal = String(modalidad || '').toLowerCase().includes('jornal');

  let salarioBasePeriodo = 0;
  if (esJornal) {
    salarioBasePeriodo = Math.round(baseNum * diasNum);
  } else if (tipoPeriodo === 'Quincenal') {
    salarioBasePeriodo = Math.round((baseNum / 30) * diasNum);
  } else {
    salarioBasePeriodo = Math.round((baseNum / 30) * diasNum);
  }

  const bonifNum = Math.max(0, Number(bonificaciones) || 0);
  const prestamosNum = Math.max(0, Number(descuentoPrestamos) || 0);
  const baseCotizacion = salarioBasePeriodo + bonifNum;

  // Seguridad Social (Valores manuales o cálculo normativo agropecuario)
  const calcSalud = saludEps !== null && saludEps !== undefined && saludEps !== ''
    ? Math.max(0, Number(saludEps) || 0)
    : (incluirSeguridadSocial ? Math.round(baseCotizacion * 0.085) : 0);

  const calcPension = pensionAfp !== null && pensionAfp !== undefined && pensionAfp !== ''
    ? Math.max(0, Number(pensionAfp) || 0)
    : (incluirSeguridadSocial ? Math.round(baseCotizacion * 0.12) : 0);

  // Riesgo Agropecuario ARL (Riesgo III: 2.436%)
  const calcArl = arlRiesgo !== null && arlRiesgo !== undefined && arlRiesgo !== ''
    ? Math.max(0, Number(arlRiesgo) || 0)
    : (incluirSeguridadSocial ? Math.round(baseCotizacion * 0.02436) : 0);

  // Caja de Compensación Familiar (4%)
  const calcCaja = cajaCompensacion !== null && cajaCompensacion !== undefined && cajaCompensacion !== ''
    ? Math.max(0, Number(cajaCompensacion) || 0)
    : (incluirSeguridadSocial ? Math.round(baseCotizacion * 0.04) : 0);

  // Prestaciones Sociales (Prima 8.33%, Cesantías 8.33%, Intereses 1% mensual, Vacaciones 4.17%)
  const calcPrima = prima !== null && prima !== undefined && prima !== ''
    ? Math.max(0, Number(prima) || 0)
    : (incluirPrestaciones ? Math.round(baseCotizacion * 0.0833) : 0);

  const calcCesantias = cesantias !== null && cesantias !== undefined && cesantias !== ''
    ? Math.max(0, Number(cesantias) || 0)
    : (incluirPrestaciones ? Math.round(baseCotizacion * 0.0833) : 0);

  const calcIntereses = interesesCesantias !== null && interesesCesantias !== undefined && interesesCesantias !== ''
    ? Math.max(0, Number(interesesCesantias) || 0)
    : (incluirPrestaciones ? Math.round(calcCesantias * 0.12) : 0);

  const calcVacaciones = vacaciones !== null && vacaciones !== undefined && vacaciones !== ''
    ? Math.max(0, Number(vacaciones) || 0)
    : (incluirPrestaciones ? Math.round(salarioBasePeriodo * 0.0417) : 0);

  const netoTrabajador = Math.max(0, salarioBasePeriodo + bonifNum - prestamosNum);
  const totalSeguridadSocial = calcSalud + calcPension + calcArl + calcCaja;
  const totalPrestaciones = calcPrima + calcCesantias + calcIntereses + calcVacaciones;
  const costoTotalFinca = netoTrabajador + totalSeguridadSocial + totalPrestaciones;

  return {
    salarioBasePeriodo,
    bonificaciones: bonifNum,
    descuentoPrestamos: prestamosNum,
    netoTrabajador,
    saludEps: calcSalud,
    pensionAfp: calcPension,
    arlRiesgo: calcArl,
    cajaCompensacion: calcCaja,
    totalSeguridadSocial,
    prima: calcPrima,
    cesantias: calcCesantias,
    interesesCesantias: calcIntereses,
    vacaciones: calcVacaciones,
    totalPrestaciones,
    costoTotalFinca
  };
}

/**
 * Calcula todos los KPIs financieros, Estado de Resultados (P&G), indicadores unitarios
 * ($/Cabeza de ganado y $/Hectárea) y series para gráficos filtrados por finca o consolidado general.
 */
export function calcularResumenContableFinca({
  movimientos = [],
  pagosNomina = [],
  animales = [],
  fincas = [],
  fincaFiltroId = 'ALL',
  periodoFiltro = 'ALL'
} = {}) {
  const esConsolidado = !fincaFiltroId || fincaFiltroId === 'ALL' || fincaFiltroId === 'todas';
  const fincasPermitidasIds = new Set((fincas || []).map((f) => f.id));

  const perteneceAFinca = (itemFincaId) => {
    if (!itemFincaId) return false;
    if (fincasPermitidasIds.size > 0 && !fincasPermitidasIds.has(itemFincaId)) return false;
    return esConsolidado ? true : itemFincaId === fincaFiltroId;
  };

  const cumplePeriodo = (fechaStr) => {
    if (!periodoFiltro || periodoFiltro === 'ALL' || !fechaStr) return true;
    const f = String(fechaStr).slice(0, 10);
    const hoy = new Date();
    const mesActualPrefix = hoy.toISOString().slice(0, 7);
    const anioActualPrefix = hoy.toISOString().slice(0, 4);

    if (periodoFiltro === 'MES_ACTUAL') {
      return f.startsWith(mesActualPrefix);
    }
    if (periodoFiltro === 'ANIO_ACTUAL') {
      return f.startsWith(anioActualPrefix);
    }
    if (periodoFiltro === 'ULTIMOS_90') {
      const lim = new Date();
      lim.setDate(lim.getDate() - 90);
      return f >= lim.toISOString().slice(0, 10);
    }
    if (/^\d{4}-\d{2}$/.test(periodoFiltro)) {
      return f.startsWith(periodoFiltro);
    }
    return true;
  };

  // Filtrar movimientos contables de la finca o consolidado
  const movsFiltrados = (movimientos || []).filter((m) => {
    if (!m) return false;
    const fid = m.fincaId || m.finca_id;
    return perteneceAFinca(fid) && cumplePeriodo(m.fecha);
  });

  // Asegurar que pagos de nómina que no tengan aún su espejo en movimientos se contabilicen sin duplicar
  const idsPagosEnMovimientos = new Set(
    movsFiltrados.map((m) => m.nominaPagoId).filter(Boolean)
  );
  const pagosNominaExtra = (pagosNomina || []).filter((p) => {
    if (!p) return false;
    const fid = p.fincaId || p.finca_id;
    return perteneceAFinca(fid) && cumplePeriodo(p.fecha) && !idsPagosEnMovimientos.has(p.id);
  });

  let totalIngresos = 0;
  let totalCostosDirectos = 0;
  let totalGastosAdmin = 0;
  let totalNominaSeguridadSocial = 0;
  let cuentasPorPagar = 0;
  let cuentasPorCobrar = 0;

  const porCategoriaMap = new Map();

  for (const m of movsFiltrados) {
    const monto = Math.max(0, Number(m.monto) || 0);
    const tipo = String(m.tipo || '').toLowerCase();
    const estado = String(m.estado || 'Pagado').toLowerCase();
    const cat = m.categoria || 'General';

    if (tipo === 'ingreso') {
      totalIngresos += monto;
      if (estado.includes('cobrar') || estado.includes('pendiente')) {
        cuentasPorCobrar += monto;
      }
    } else if (tipo === 'costo_directo') {
      totalCostosDirectos += monto;
      if (estado.includes('pagar') || estado.includes('pendiente')) {
        cuentasPorPagar += monto;
      }
      porCategoriaMap.set(cat, (porCategoriaMap.get(cat) || 0) + monto);
    } else if (tipo === 'gasto_admin') {
      totalGastosAdmin += monto;
      if (estado.includes('pagar') || estado.includes('pendiente')) {
        cuentasPorPagar += monto;
      }
      porCategoriaMap.set(cat, (porCategoriaMap.get(cat) || 0) + monto);
    } else if (tipo === 'nomina') {
      totalNominaSeguridadSocial += monto;
      if (estado.includes('pagar') || estado.includes('pendiente')) {
        cuentasPorPagar += monto;
      }
      const catNom = 'Nómina y Seguridad Social';
      porCategoriaMap.set(catNom, (porCategoriaMap.get(catNom) || 0) + monto);
    }
  }

  for (const p of pagosNominaExtra) {
    const montoNom = Math.max(0, Number(p.costoTotalFinca || p.montoTotal || p.netoTrabajador || 0));
    totalNominaSeguridadSocial += montoNom;
    const catNom = 'Nómina y Seguridad Social';
    porCategoriaMap.set(catNom, (porCategoriaMap.get(catNom) || 0) + montoNom);
  }

  const totalCostosOperativos = totalCostosDirectos + totalGastosAdmin;
  const totalEgresos = totalCostosOperativos + totalNominaSeguridadSocial;
  const utilidadBruta = totalIngresos - totalCostosDirectos;
  const utilidadNeta = totalIngresos - totalEgresos;
  const margenNetoPct = totalIngresos > 0
    ? Number(((utilidadNeta / totalIngresos) * 100).toFixed(1))
    : 0;

  // Cruzar con el inventario activo de animales en esa finca (o consolidado)
  const animalesActivos = (animales || []).filter((a) => {
    if (!a) return false;
    const fid = a.fincaId || a.finca_id;
    const esActivo = (a.estadoVida || a.estado || 'activo') === 'activo' && !a.motivoBaja;
    return esActivo && perteneceAFinca(fid);
  });
  const animalesActivosCount = animalesActivos.length;

  // Cruzar con las hectáreas de la finca seleccionada (o suma de fincas en consolidado)
  const fincasSeleccionadas = (fincas || []).filter((f) => f && (esConsolidado ? true : f.id === fincaFiltroId));
  const hectareasTotales = fincasSeleccionadas.reduce((acc, f) => acc + (Number(f.hectareas) || 0), 0);

  const costoMensualPorCabeza = animalesActivosCount > 0
    ? Math.round(totalEgresos / animalesActivosCount)
    : 0;

  const costoPorHectarea = hectareasTotales > 0
    ? Math.round(totalEgresos / hectareasTotales)
    : 0;

  const ingresoPorCabeza = animalesActivosCount > 0
    ? Math.round(totalIngresos / animalesActivosCount)
    : 0;

  // Distribución de egresos por categoría para el Gráfico de Dona
  const coloresDona = ['#059669', '#D97706', '#1D4ED8', '#B91C1C', '#7C3AED', '#0D9488', '#EA580C', '#475569'];
  const distribucionCategorias = Array.from(porCategoriaMap.entries())
    .map(([categoria, monto], idx) => ({
      categoria,
      monto,
      porcentaje: totalEgresos > 0 ? Number(((monto / totalEgresos) * 100).toFixed(1)) : 0,
      color: coloresDona[idx % coloresDona.length]
    }))
    .sort((a, b) => b.monto - a.monto);

  // Serie mensual de los últimos 6 meses para el Gráfico de Barras (Ingresos vs Egresos)
  const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const mesesMap = new Map();
  const hoyDate = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoyDate.getFullYear(), hoyDate.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${mesesNombres[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
    mesesMap.set(ym, { ym, label, ingresos: 0, egresos: 0 });
  }

  for (const m of (movimientos || [])) {
    if (!m) continue;
    const fid = m.fincaId || m.finca_id;
    if (!perteneceAFinca(fid)) continue;
    const ym = String(m.fecha || '').slice(0, 7);
    if (!ym) continue;
    if (!mesesMap.has(ym)) {
      const [y, mo] = ym.split('-');
      const mIdx = Math.max(0, Math.min(11, (parseInt(mo, 10) || 1) - 1));
      mesesMap.set(ym, { ym, label: `${mesesNombres[mIdx]} ${String(y || '').slice(2)}`, ingresos: 0, egresos: 0 });
    }
    const bucket = mesesMap.get(ym);
    const monto = Math.max(0, Number(m.monto) || 0);
    if (m.tipo === 'ingreso') {
      bucket.ingresos += monto;
    } else {
      bucket.egresos += monto;
    }
  }

  const serieMensual = Array.from(mesesMap.values())
    .sort((a, b) => a.ym.localeCompare(b.ym))
    .slice(-6);

  return {
    fincaFiltroId: esConsolidado ? 'ALL' : fincaFiltroId,
    esConsolidado,
    totalIngresos,
    totalCostosDirectos,
    totalGastosAdmin,
    totalCostosOperativos,
    totalNominaSeguridadSocial,
    totalEgresos,
    utilidadBruta,
    utilidadNeta,
    margenNetoPct,
    cuentasPorPagar,
    cuentasPorCobrar,
    animalesActivosCount,
    hectareasTotales,
    costoMensualPorCabeza,
    costoPorHectarea,
    ingresoPorCabeza,
    distribucionCategorias,
    serieMensual,
    movimientosFiltrados: movsFiltrados
  };
}

export class ModuloContabilidad {
  constructor({
    containerId,
    getFincas,
    getFincaActiva,
    getAnimales,
    getMovimientos,
    getTrabajadores,
    getPagosNomina,
    getRol,
    onGuardarMovimiento,
    onEliminarMovimiento,
    onCambiarEstadoMovimiento,
    onGuardarTrabajador,
    onEliminarTrabajador,
    onRegistrarPagoNomina,
    onEliminarPagoNomina
  }) {
    this.container = typeof document !== 'undefined' ? document.getElementById(containerId) : null;
    this.getFincas = getFincas || (() => []);
    this.getFincaActiva = getFincaActiva || (() => null);
    this.getAnimales = getAnimales || (() => []);
    this.getMovimientos = getMovimientos || (() => []);
    this.getTrabajadores = getTrabajadores || (() => []);
    this.getPagosNomina = getPagosNomina || (() => []);
    this.getRol = getRol || (() => 'administrador');

    this.onGuardarMovimiento = onGuardarMovimiento;
    this.onEliminarMovimiento = onEliminarMovimiento;
    this.onCambiarEstadoMovimiento = onCambiarEstadoMovimiento;
    this.onGuardarTrabajador = onGuardarTrabajador;
    this.onEliminarTrabajador = onEliminarTrabajador;
    this.onRegistrarPagoNomina = onRegistrarPagoNomina;
    this.onEliminarPagoNomina = onEliminarPagoNomina;

    // Estado de UI y filtros Multi-Finca
    this.fincaFiltroId = 'ALL'; // 'ALL' = Consolidado General (Todas las Fincas) o ID de una finca
    this.periodoFiltro = 'ALL';
    this.subvistaActiva = 'integral'; // 'integral' | 'dashboard' | 'movimientos' | 'nomina'
    this.tipoMovimientoForm = 'costo_directo';
    this.filtroTablaTipo = 'todos';
    this.filtroTablaEstado = 'todos';
    this.filtroTablaTexto = '';
  }

  escape(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  getFincaPredeterminadaFormulario() {
    const fincas = this.getFincas() || [];
    if (this.fincaFiltroId && this.fincaFiltroId !== 'ALL' && fincas.some((f) => f.id === this.fincaFiltroId)) {
      return this.fincaFiltroId;
    }
    const activa = this.getFincaActiva();
    if (activa && activa.id) return activa.id;
    return fincas[0]?.id || '';
  }

  render() {
    if (!this.container) return;

    const fincas = this.getFincas() || [];
    const animales = this.getAnimales() || [];
    const movimientos = this.getMovimientos() || [];
    const trabajadores = this.getTrabajadores() || [];
    const pagosNomina = this.getPagosNomina() || [];
    const rol = (this.getRol() || 'administrador').toLowerCase();
    const esSoloConsulta = rol === 'consultor' || rol === 'consulta';

    // Si la finca filtrada ya no existe en la empresa actual, volver a Consolidado General
    if (this.fincaFiltroId !== 'ALL' && !fincas.some((f) => f.id === this.fincaFiltroId)) {
      this.fincaFiltroId = 'ALL';
    }

    const fincaSeleccionadaObj = this.fincaFiltroId === 'ALL'
      ? null
      : fincas.find((f) => f.id === this.fincaFiltroId);

    const nombreContextoFinca = fincaSeleccionadaObj
      ? `${fincaSeleccionadaObj.nombre} (${fincaSeleccionadaObj.hectareas || 0} Ha)`
      : `Consolidado General (${fincas.length} ${fincas.length === 1 ? 'Finca' : 'Fincas'})`;

    const resumen = calcularResumenContableFinca({
      movimientos,
      pagosNomina,
      animales,
      fincas,
      fincaFiltroId: this.fincaFiltroId,
      periodoFiltro: this.periodoFiltro
    });

    const fincaDefaultForm = this.getFincaPredeterminadaFormulario();
    const categoriasForm = CATEGORIAS_CONTABILIDAD[this.tipoMovimientoForm] || CATEGORIAS_CONTABILIDAD.costo_directo;

    // Filtrar trabajadores y planillas por la finca seleccionada
    const fincasIdsEmpresa = new Set(fincas.map((f) => f.id));
    const trabajadoresFiltrados = trabajadores.filter((t) => {
      if (!t) return false;
      const fid = t.fincaId || t.finca_id;
      if (fincasIdsEmpresa.size > 0 && !fincasIdsEmpresa.has(fid)) return false;
      return this.fincaFiltroId === 'ALL' ? true : fid === this.fincaFiltroId;
    });

    const pagosNominaFiltrados = pagosNomina.filter((p) => {
      if (!p) return false;
      const fid = p.fincaId || p.finca_id;
      if (fincasIdsEmpresa.size > 0 && !fincasIdsEmpresa.has(fid)) return false;
      return this.fincaFiltroId === 'ALL' ? true : fid === this.fincaFiltroId;
    });

    const mostrarDashboard = this.subvistaActiva === 'integral' || this.subvistaActiva === 'dashboard';
    const mostrarMovimientos = this.subvistaActiva === 'integral' || this.subvistaActiva === 'movimientos';
    const mostrarNomina = this.subvistaActiva === 'integral' || this.subvistaActiva === 'nomina';

    this.container.innerHTML = `
      <div class="space-y-6 pb-8">

        <!-- ================================================================== -->
        <!-- CABECERA DEL MÓDULO + SELECTOR DESTACADO MULTI-FINCA / CONSOLIDADO -->
        <!-- ================================================================== -->
        <div class="bovi-agrotech-card bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm">
          <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div class="flex items-start gap-3.5">
              <div class="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <svg class="w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <h2 class="text-lg sm:text-xl font-black tracking-tight text-slate-800 bovi-module-title">
                    Contabilidad, Costos y Nómina Multi-Finca
                  </h2>
                  <span class="px-2.5 py-0.5 rounded-full text-[11px] bovi-badge-ingreso">
                    ${this.escape(nombreContextoFinca)}
                  </span>
                </div>
                <p class="text-xs text-slate-600 mt-1">
                  Control financiero 100% independiente por predio o consolidado general: Ingresos, Costos Directos, Gastos Administrativos, Nómina, Seguridad Social y Estado de Resultados (P&G).
                </p>
              </div>
            </div>

            <!-- CONTROLES DE FILTRO GLOBAL MULTI-FINCA Y PERIODO -->
            <div class="flex flex-wrap items-center gap-2.5">
              <div class="flex flex-col">
                <label for="select-contabilidad-finca-filtro" class="text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Filtro Contable Multi-Finca
                </label>
                <select
                  id="select-contabilidad-finca-filtro"
                  class="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-slate-50 cursor-pointer min-w-[240px]"
                >
                  <option value="ALL" ${this.fincaFiltroId === 'ALL' ? 'selected' : ''}>
                    🌐 Consolidado General (Todas las Fincas)
                  </option>
                  ${fincas.map((f) => `
                    <option value="${this.escape(f.id)}" ${this.fincaFiltroId === f.id ? 'selected' : ''}>
                      🏡 ${this.escape(f.nombre)} (${Number(f.hectareas) || 0} Ha)
                    </option>
                  `).join('')}
                </select>
              </div>

              <div class="flex flex-col">
                <label for="select-contabilidad-periodo-filtro" class="text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Periodo de Análisis
                </label>
                <select
                  id="select-contabilidad-periodo-filtro"
                  class="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-slate-50 cursor-pointer"
                >
                  <option value="ALL" ${this.periodoFiltro === 'ALL' ? 'selected' : ''}>Todo el Historial</option>
                  <option value="MES_ACTUAL" ${this.periodoFiltro === 'MES_ACTUAL' ? 'selected' : ''}>Mes Actual</option>
                  <option value="ULTIMOS_90" ${this.periodoFiltro === 'ULTIMOS_90' ? 'selected' : ''}>Últimos 90 Días</option>
                  <option value="ANIO_ACTUAL" ${this.periodoFiltro === 'ANIO_ACTUAL' ? 'selected' : ''}>Año en Curso</option>
                </select>
              </div>

              <div class="flex items-end gap-2 pt-4">
                <button
                  type="button"
                  id="btn-exportar-contabilidad-excel"
                  class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all duration-200 flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="Exportar Contabilidad y Nómina a Excel (.xlsx)"
                >
                  <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Exportar Excel</span>
                </button>
                <button
                  type="button"
                  id="btn-exportar-contabilidad-csv"
                  class="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-bold transition-all duration-200 flex items-center gap-1.5 cursor-pointer"
                  title="Exportar tabla filtrada a CSV"
                >
                  <span>CSV</span>
                </button>
              </div>
            </div>
          </div>

          <!-- PESTAÑAS DE NAVEGACIÓN DE SUBMÓDULOS -->
          <div class="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-slate-200">
            <button
              type="button"
              data-subvista="integral"
              class="btn-subvista-contab px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                this.subvistaActiva === 'integral'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }"
            >
              <span>✨ Vista Integral 360°</span>
            </button>
            <button
              type="button"
              data-subvista="dashboard"
              class="btn-subvista-contab px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                this.subvistaActiva === 'dashboard'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }"
            >
              <span>📊 Dashboard & Estado de Resultados (P&G)</span>
            </button>
            <button
              type="button"
              data-subvista="movimientos"
              class="btn-subvista-contab px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                this.subvistaActiva === 'movimientos'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }"
            >
              <span>🧾 Ingresos, Costos Directos & Gastos (${resumen.movimientosFiltrados.length})</span>
            </button>
            <button
              type="button"
              data-subvista="nomina"
              class="btn-subvista-contab px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                this.subvistaActiva === 'nomina'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }"
            >
              <span>👷 Nómina, Seguridad Social & Prestaciones (${trabajadoresFiltrados.length})</span>
            </button>
          </div>
        </div>

        <!-- ================================================================== -->
        <!-- TARJETAS KPI SUPERIORES + INDICADORES UNITARIOS AUTOMÁTICOS        -->
        <!-- ================================================================== -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- KPI 1: TOTAL INGRESOS -->
          <div class="bovi-agrotech-card bg-white rounded-xl border border-slate-200 p-5 shadow-sm transition-all duration-200">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-600">Total Ingresos</span>
              <span class="px-2.5 py-0.5 rounded-full text-[11px] bovi-badge-ingreso">Ingresos / Ventas</span>
            </div>
            <div id="kpi-contab-ingresos" class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 bovi-kpi-value">
              ${formatearMonedaCOP(resumen.totalIngresos)}
            </div>
            <div class="mt-2 flex items-center justify-between text-xs text-slate-600">
              <span>Ingreso / Cabeza: <strong class="text-slate-800">${formatearMonedaCOP(resumen.ingresoPorCabeza)}</strong></span>
              ${resumen.cuentasPorCobrar > 0 ? `<span class="text-amber-700 font-semibold">Por cobrar: ${formatearMonedaCOP(resumen.cuentasPorCobrar)}</span>` : '<span>100% Conciliado</span>'}
            </div>
          </div>

          <!-- KPI 2: TOTAL COSTOS Y GASTOS OPERATIVOS -->
          <div class="bovi-agrotech-card bg-white rounded-xl border border-slate-200 p-5 shadow-sm transition-all duration-200">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-600">Total Costos Operativos</span>
              <span class="px-2.5 py-0.5 rounded-full text-[11px] bovi-badge-costo">Costos + Gastos</span>
            </div>
            <div id="kpi-contab-costos" class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 bovi-kpi-value">
              ${formatearMonedaCOP(resumen.totalCostosOperativos)}
            </div>
            <div class="mt-2 flex items-center justify-between text-xs text-slate-600">
              <span>Directos: <strong class="text-slate-800">${formatearMonedaCOP(resumen.totalCostosDirectos)}</strong></span>
              <span>Admin: <strong class="text-slate-800">${formatearMonedaCOP(resumen.totalGastosAdmin)}</strong></span>
            </div>
          </div>

          <!-- KPI 3: TOTAL GASTO DE NÓMINA + SEGURIDAD SOCIAL -->
          <div class="bovi-agrotech-card bg-white rounded-xl border border-slate-200 p-5 shadow-sm transition-all duration-200">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-600">Nómina + Seguridad Social</span>
              <span class="px-2.5 py-0.5 rounded-full text-[11px] bovi-badge-nomina">Personal & Ley</span>
            </div>
            <div id="kpi-contab-nomina" class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 bovi-kpi-value">
              ${formatearMonedaCOP(resumen.totalNominaSeguridadSocial)}
            </div>
            <div class="mt-2 flex items-center justify-between text-xs text-slate-600">
              <span>Trabajadores activos: <strong class="text-slate-800">${trabajadoresFiltrados.length}</strong></span>
              <span>Planillas: <strong class="text-slate-800">${pagosNominaFiltrados.length}</strong></span>
            </div>
          </div>

          <!-- KPI 4: UTILIDAD NETA / FLUJO DE CAJA -->
          <div class="bovi-agrotech-card bg-white rounded-xl border border-slate-200 p-5 shadow-sm transition-all duration-200">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-600">Utilidad Neta / Flujo de Caja</span>
              <span class="px-2.5 py-0.5 rounded-full text-[11px] ${resumen.utilidadNeta >= 0 ? 'bovi-badge-ingreso' : 'bovi-badge-gasto'}">
                ${resumen.utilidadNeta >= 0 ? `Rentable (${resumen.margenNetoPct}%)` : `Déficit (${resumen.margenNetoPct}%)`}
              </span>
            </div>
            <div id="kpi-contab-utilidad" class="text-2xl sm:text-3xl font-bold tracking-tight ${resumen.utilidadNeta >= 0 ? 'text-emerald-700' : 'text-rose-700'} bovi-kpi-value">
              ${formatearMonedaCOP(resumen.utilidadNeta)}
            </div>
            <div class="mt-2 flex items-center justify-between text-xs text-slate-600">
              <span>Egresos Totales: <strong class="text-slate-800">${formatearMonedaCOP(resumen.totalEgresos)}</strong></span>
              ${resumen.cuentasPorPagar > 0 ? `<span class="text-rose-700 font-bold">CxP: ${formatearMonedaCOP(resumen.cuentasPorPagar)}</span>` : '<span>Al día</span>'}
            </div>
          </div>
        </div>

        <!-- INDICADORES UNITARIOS AUTOMÁTICOS (CRUCE CON INVENTARIO ACTIVO Y HECTÁREAS) -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bovi-agrotech-card bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center justify-between">
            <div>
              <span class="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                Costo Mensual por Cabeza de Ganado
              </span>
              <div id="kpi-costo-por-cabeza" class="text-2xl font-bold tracking-tight text-slate-800 mt-1 bovi-kpi-value">
                ${formatearMonedaCOP(resumen.costoMensualPorCabeza)} <span class="text-xs font-semibold text-slate-600">/ animal</span>
              </div>
              <p class="text-[11px] text-slate-600 mt-1">
                Cruzado con <strong class="text-slate-800">${resumen.animalesActivosCount} animales activos</strong> en ${this.fincaFiltroId === 'ALL' ? 'todas las fincas' : 'esta finca'}.
              </p>
            </div>
            <div class="w-11 h-11 rounded-xl bovi-badge-costo flex items-center justify-center text-lg shrink-0">
              🐄
            </div>
          </div>

          <div class="bovi-agrotech-card bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center justify-between">
            <div>
              <span class="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                Costo Operativo por Hectárea
              </span>
              <div id="kpi-costo-por-hectarea" class="text-2xl font-bold tracking-tight text-slate-800 mt-1 bovi-kpi-value">
                ${formatearMonedaCOP(resumen.costoPorHectarea)} <span class="text-xs font-semibold text-slate-600">/ Ha</span>
              </div>
              <p class="text-[11px] text-slate-600 mt-1">
                Calculado sobre <strong class="text-slate-800">${resumen.hectareasTotales} Hectáreas</strong> productivas registradas.
              </p>
            </div>
            <div class="w-11 h-11 rounded-xl bovi-badge-ingreso flex items-center justify-center text-lg shrink-0">
              🌱
            </div>
          </div>

          <div class="bovi-agrotech-card bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center justify-between">
            <div>
              <span class="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                Carga Animal & Eficiencia Forrajera
              </span>
              <div class="text-2xl font-bold tracking-tight text-slate-800 mt-1 bovi-kpi-value">
                ${resumen.hectareasTotales > 0 ? (resumen.animalesActivosCount / resumen.hectareasTotales).toFixed(2) : '0.00'} <span class="text-xs font-semibold text-slate-600">Cab / Ha</span>
              </div>
              <p class="text-[11px] text-slate-600 mt-1">
                Utilidad Bruta: <strong class="text-emerald-700">${formatearMonedaCOP(resumen.utilidadBruta)}</strong>
              </p>
            </div>
            <div class="w-11 h-11 rounded-xl bovi-badge-nomina flex items-center justify-center text-lg shrink-0">
              ⚖️
            </div>
          </div>
        </div>

        <!-- ================================================================== -->
        <!-- SECCIÓN 1: DASHBOARD FINANCIERO, ESTADO DE RESULTADOS (P&G) Y GRÁFICOS -->
        <!-- ================================================================== -->
        ${mostrarDashboard ? this.renderSeccionDashboardPyG(resumen, nombreContextoFinca) : ''}

        <!-- ================================================================== -->
        <!-- SECCIÓN 2: SUBMÓDULO DE INGRESOS, COSTOS DIRECTOS Y GASTOS         -->
        <!-- ================================================================== -->
        ${mostrarMovimientos ? this.renderSeccionMovimientos({
          fincas,
          fincaDefaultForm,
          categoriasForm,
          esSoloConsulta
        }) : ''}

        <!-- ================================================================== -->
        <!-- SECCIÓN 3: SUBMÓDULO DE NÓMINA, SEGURIDAD SOCIAL Y PRESTACIONES    -->
        <!-- ================================================================== -->
        ${mostrarNomina ? this.renderSeccionNomina({
          fincas,
          fincaDefaultForm,
          trabajadoresFiltrados,
          pagosNominaFiltrados,
          esSoloConsulta
        }) : ''}

        <!-- ================================================================== -->
        <!-- SECCIÓN 4: TABLA HISTÓRICA FILTRABLE CON EXPORTACIÓN A EXCEL/CSV   -->
        <!-- ================================================================== -->
        ${(mostrarMovimientos || mostrarDashboard) ? this.renderTablaHistoricaMovimientos({
          movimientos: resumen.movimientosFiltrados,
          fincas,
          esSoloConsulta
        }) : ''}

      </div>
    `;

    this.attachEvents();
  }

  renderSeccionDashboardPyG(resumen, nombreContextoFinca) {
    const maxBarra = Math.max(
      1,
      ...resumen.serieMensual.map((m) => Math.max(m.ingresos, m.egresos))
    );

    // Construcción de segmentos para el Gráfico de Dona SVG
    const radio = 54;
    const circunferencia = 2 * Math.PI * radio;
    let offsetAcumulado = 0;
    const segmentosDona = resumen.distribucionCategorias.map((item) => {
      const longitud = (item.porcentaje / 100) * circunferencia;
      const seg = {
        ...item,
        dasharray: `${longitud} ${circunferencia}`,
        dashoffset: -offsetAcumulado
      };
      offsetAcumulado += longitud;
      return seg;
    });

    return `
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <!-- ESTADO DE RESULTADOS (P&G) AGROPECUARIO -->
        <div class="lg:col-span-5 bovi-agrotech-card bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
              <div>
                <h3 class="text-sm font-black uppercase tracking-wider text-slate-800">
                  Estado de Resultados (P&G)
                </h3>
                <p class="text-[11px] text-slate-600">${this.escape(nombreContextoFinca)}</p>
              </div>
              <span class="px-2.5 py-1 rounded-lg text-[10px] font-bold bovi-badge-info">Norma Agro-P&G</span>
            </div>

            <div class="space-y-3 text-xs">
              <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span class="font-bold text-slate-800">(+) Ingresos Operacionales (Ganado, Leche, Pasturas)</span>
                <span class="font-bold text-emerald-700 bovi-kpi-value">${formatearMonedaCOP(resumen.totalIngresos)}</span>
              </div>

              <div class="flex items-center justify-between px-2.5 py-2 text-slate-700">
                <span>(-) Costos Directos de Producción (Sanidad, Sal, Potreros)</span>
                <span class="font-bold text-amber-700 bovi-kpi-value">-${formatearMonedaCOP(resumen.totalCostosDirectos)}</span>
              </div>

              <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-100 border border-slate-200 font-bold">
                <span class="text-slate-800">(=) UTILIDAD BRUTA AGROPECUARIA</span>
                <span class="${resumen.utilidadBruta >= 0 ? 'text-emerald-700' : 'text-rose-700'} bovi-kpi-value">${formatearMonedaCOP(resumen.utilidadBruta)}</span>
              </div>

              <div class="flex items-center justify-between px-2.5 py-2 text-slate-700">
                <span>(-) Gastos Fijos y Administrativos (Servicios, Impuestos, Honorarios)</span>
                <span class="font-bold text-rose-700 bovi-kpi-value">-${formatearMonedaCOP(resumen.totalGastosAdmin)}</span>
              </div>

              <div class="flex items-center justify-between px-2.5 py-2 text-slate-700">
                <span>(-) Nómina, Seguridad Social (EPS/AFP/ARL) y Prestaciones</span>
                <span class="font-bold text-blue-700 bovi-kpi-value">-${formatearMonedaCOP(resumen.totalNominaSeguridadSocial)}</span>
              </div>
            </div>
          </div>

          <div class="mt-4 pt-3 border-t-2 border-slate-300 flex items-center justify-between">
            <div>
              <span class="text-xs font-black uppercase tracking-wider text-slate-800 block">
                (=) UTILIDAD NETA / FLUJO DE CAJA
              </span>
              <span class="text-[11px] text-slate-600">Margen Neto Operacional: <strong>${resumen.margenNetoPct}%</strong></span>
            </div>
            <span class="text-xl font-black ${resumen.utilidadNeta >= 0 ? 'text-emerald-700' : 'text-rose-700'} bovi-kpi-value">
              ${formatearMonedaCOP(resumen.utilidadNeta)}
            </span>
          </div>
        </div>

        <!-- GRÁFICO DE BARRAS MODERNO (INGRESOS VS EGRESOS MENSUALES) -->
        <div class="lg:col-span-4 bovi-agrotech-card bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
              <div>
                <h3 class="text-sm font-black uppercase tracking-wider text-slate-800">
                  Ingresos vs. Egresos Mensuales
                </h3>
                <p class="text-[11px] text-slate-600">Comparativa de flujo de caja (Últimos 6 meses)</p>
              </div>
              <div class="flex items-center gap-2 text-[10px] font-bold">
                <span class="flex items-center gap-1 text-emerald-700"><span class="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block"></span> Ingresos</span>
                <span class="flex items-center gap-1 text-rose-700"><span class="w-2.5 h-2.5 rounded-sm bg-rose-600 inline-block"></span> Egresos</span>
              </div>
            </div>

            <div class="grid grid-cols-6 gap-2 items-end h-44 pt-4 px-1">
              ${resumen.serieMensual.map((item) => {
                const hIng = Math.max(6, Math.round((item.ingresos / maxBarra) * 120));
                const hEgr = Math.max(6, Math.round((item.egresos / maxBarra) * 120));
                return `
                  <div class="flex flex-col items-center gap-1.5">
                    <div class="flex items-end justify-center gap-1 h-32 w-full">
                      <div
                        class="w-3 sm:w-3.5 rounded-t-md bg-emerald-600 transition-all duration-200"
                        style="height: ${item.ingresos > 0 ? hIng : 4}px"
                        title="${item.label} - Ingresos: ${formatearMonedaCOP(item.ingresos)}"
                      ></div>
                      <div
                        class="w-3 sm:w-3.5 rounded-t-md bg-rose-600 transition-all duration-200"
                        style="height: ${item.egresos > 0 ? hEgr : 4}px"
                        title="${item.label} - Egresos: ${formatearMonedaCOP(item.egresos)}"
                      ></div>
                    </div>
                    <span class="text-[10px] font-bold text-slate-600 truncate">${this.escape(item.label)}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <div class="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
            <span>Balance Acumulado:</span>
            <strong class="text-slate-800">${formatearMonedaCOP(resumen.utilidadNeta)}</strong>
          </div>
        </div>

        <!-- GRÁFICO DE DONA MODERNO (DISTRIBUCIÓN DE COSTOS Y GASTOS POR CATEGORÍA) -->
        <div class="lg:col-span-3 bovi-agrotech-card bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div class="pb-3 mb-3 border-b border-slate-200">
              <h3 class="text-sm font-black uppercase tracking-wider text-slate-800">
                Distribución de Egresos
              </h3>
              <p class="text-[11px] text-slate-600">Costos, Gastos y Nómina por Categoría</p>
            </div>

            <div class="flex flex-col items-center justify-center my-2">
              <svg class="w-36 h-36 -rotate-90" viewBox="0 0 140 140">
                <circle cx="70" cy="70" r="${radio}" fill="transparent" stroke="#E2E8F0" stroke-width="16"></circle>
                ${segmentosDona.map((seg) => `
                  <circle
                    cx="70"
                    cy="70"
                    r="${radio}"
                    fill="transparent"
                    stroke="${seg.color}"
                    stroke-width="16"
                    stroke-dasharray="${seg.dasharray}"
                    stroke-dashoffset="${seg.dashoffset}"
                  >
                    <title>${this.escape(seg.categoria)}: ${formatearMonedaCOP(seg.monto)} (${seg.porcentaje}%)</title>
                  </circle>
                `).join('')}
              </svg>
            </div>

            <div class="space-y-1.5 max-h-36 overflow-y-auto pr-1 mt-2">
              ${resumen.distribucionCategorias.length > 0 ? resumen.distribucionCategorias.map((item) => `
                <div class="flex items-center justify-between text-[11px] gap-2">
                  <span class="flex items-center gap-1.5 truncate text-slate-700">
                    <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${item.color}"></span>
                    <span class="truncate" title="${this.escape(item.categoria)}">${this.escape(item.categoria)}</span>
                  </span>
                  <span class="font-bold text-slate-800 shrink-0">${item.porcentaje}%</span>
                </div>
              `).join('') : `
                <p class="text-xs text-slate-600 text-center py-3">Sin egresos registrados en este filtro.</p>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderSeccionMovimientos({ fincas, fincaDefaultForm, categoriasForm, esSoloConsulta }) {
    const hoyIso = new Date().toISOString().split('T')[0];
    return `
      <div class="bovi-agrotech-card bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 mb-5 border-b border-slate-200">
          <div>
            <h3 class="text-base font-black text-slate-800 flex items-center gap-2">
              <span>🧾 Submódulo de Ingresos, Costos Directos y Gastos Operativos</span>
            </h3>
            <p class="text-xs text-slate-600">
              Registra ventas de ganado/leche, compras de insumos, sanidad, suplementación, mantenimiento de potreros y gastos administrativos por finca.
            </p>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="px-2.5 py-1 rounded-full text-[11px] bovi-badge-ingreso">Ingresos</span>
            <span class="px-2.5 py-1 rounded-full text-[11px] bovi-badge-costo">Costos Directos</span>
            <span class="px-2.5 py-1 rounded-full text-[11px] bovi-badge-gasto">Gastos Admin</span>
          </div>
        </div>

        ${esSoloConsulta ? `
          <div class="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-800">
            Modo Consulta Activo: El registro de movimientos contables está reservado para usuarios autorizados.
          </div>
        ` : `
          <form id="form-contabilidad-movimiento" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 text-xs">
            <div>
              <label for="contab-mov-fecha" class="block font-bold text-slate-700 mb-1">Fecha *</label>
              <input
                type="date"
                id="contab-mov-fecha"
                value="${hoyIso}"
                required
                class="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold text-slate-800"
              />
            </div>

            <div>
              <label for="contab-mov-finca" class="block font-bold text-slate-700 mb-1">Finca Asignada *</label>
              <select
                id="contab-mov-finca"
                required
                class="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-800"
              >
                ${fincas.map((f) => `
                  <option value="${this.escape(f.id)}" ${f.id === fincaDefaultForm ? 'selected' : ''}>
                    ${this.escape(f.nombre)}
                  </option>
                `).join('')}
              </select>
            </div>

            <div>
              <label for="contab-mov-tipo" class="block font-bold text-slate-700 mb-1">Tipo de Movimiento *</label>
              <select
                id="contab-mov-tipo"
                required
                class="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-800"
              >
                <option value="ingreso" ${this.tipoMovimientoForm === 'ingreso' ? 'selected' : ''}>🟢 Ingreso Agropecuario</option>
                <option value="costo_directo" ${this.tipoMovimientoForm === 'costo_directo' ? 'selected' : ''}>🟡 Costo Directo (Producción)</option>
                <option value="gasto_admin" ${this.tipoMovimientoForm === 'gasto_admin' ? 'selected' : ''}>🔴 Gasto Fijo / Administrativo</option>
              </select>
            </div>

            <div class="lg:col-span-2">
              <label for="contab-mov-categoria" class="block font-bold text-slate-700 mb-1">Categoría Agropecuaria *</label>
              <select
                id="contab-mov-categoria"
                required
                class="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-800"
              >
                ${categoriasForm.map((cat) => `
                  <option value="${this.escape(cat)}">${this.escape(cat)}</option>
                `).join('')}
              </select>
            </div>

            <div class="sm:col-span-2">
              <label for="contab-mov-concepto" class="block font-bold text-slate-700 mb-1">Concepto / Descripción Detallada *</label>
              <input
                type="text"
                id="contab-mov-concepto"
                required
                placeholder="Ej. Compra 40 bultos sal mineralizada 8% / Venta 12 novillos cebados..."
                class="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold text-slate-800"
              />
            </div>

            <div>
              <label for="contab-mov-tercero" class="block font-bold text-slate-700 mb-1">Proveedor / Tercero / Cliente</label>
              <input
                type="text"
                id="contab-mov-tercero"
                placeholder="Ej. Agrocampo / Frigocolanta / Subasta..."
                class="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold text-slate-800"
              />
            </div>

            <div>
              <label for="contab-mov-metodo" class="block font-bold text-slate-700 mb-1">Método de Pago</label>
              <select
                id="contab-mov-metodo"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold text-slate-800"
              >
                <option value="Transferencia Bancaria">Transferencia Bancaria</option>
                <option value="Efectivo">Efectivo en Finca</option>
                <option value="Cheque">Cheque</option>
                <option value="Nequi / Daviplata">Nequi / Daviplata</option>
                <option value="Crédito Proveedor">Crédito Proveedor</option>
              </select>
            </div>

            <div>
              <label for="contab-mov-estado" class="block font-bold text-slate-700 mb-1">Estado Contable *</label>
              <select
                id="contab-mov-estado"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-800"
              >
                <option value="Pagado">Pagado / Ejecutado</option>
                <option value="Cuenta por Pagar">Cuenta por Pagar (Pendiente)</option>
              </select>
            </div>

            <div class="sm:col-span-2 lg:col-span-2">
              <label for="contab-mov-monto" class="block font-bold text-slate-700 mb-1">Monto Total ($ COP) *</label>
              <input
                type="number"
                id="contab-mov-monto"
                required
                min="1"
                step="any"
                placeholder="Ej. 2450000"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-sm text-slate-800 bovi-kpi-value"
              />
            </div>

            <div class="sm:col-span-2 lg:col-span-3 flex items-end">
              <button
                type="submit"
                id="btn-guardar-movimiento-contab"
                class="w-full py-2.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-sm"
              >
                + Registrar Movimiento Contable en la Finca
              </button>
            </div>
          </form>
        `}
      </div>
    `;
  }

  renderSeccionNomina({ fincas, fincaDefaultForm, trabajadoresFiltrados, pagosNominaFiltrados, esSoloConsulta }) {
    const hoyIso = new Date().toISOString().split('T')[0];
    const primerTrab = trabajadoresFiltrados[0] || null;
    const liqInicial = calcularLiquidacionNomina({
      modalidad: primerTrab ? primerTrab.modalidad : 'Sueldo fijo mensual',
      valorBase: primerTrab ? primerTrab.valorBase : 1423500,
      tipoPeriodo: 'Mensual',
      diasTrabajados: 30
    });

    return `
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <!-- DIRECTORIO DE PERSONAL POR FINCA -->
        <div class="lg:col-span-5 bovi-agrotech-card bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
              <div>
                <h3 class="text-sm font-black uppercase tracking-wider text-slate-800">
                  👷 Directorio de Personal por Finca
                </h3>
                <p class="text-[11px] text-slate-600">Mayordomos, Vaqueros, Ordeñadores y Jornaleros por día</p>
              </div>
              <span class="px-2.5 py-0.5 rounded-full text-[11px] bovi-badge-nomina">${trabajadoresFiltrados.length} registrados</span>
            </div>

            ${!esSoloConsulta ? `
              <form id="form-nomina-trabajador" class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-5 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <label for="nomina-trab-nombre" class="block font-bold text-slate-700 mb-1">Nombre Completo *</label>
                  <input
                    type="text"
                    id="nomina-trab-nombre"
                    required
                    placeholder="Ej. Carlos Julio Pérez"
                    class="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold text-slate-800"
                  />
                </div>

                <div>
                  <label for="nomina-trab-cedula" class="block font-bold text-slate-700 mb-1">Cédula / Documento *</label>
                  <input
                    type="text"
                    id="nomina-trab-cedula"
                    required
                    placeholder="Ej. 1098456123"
                    class="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold text-slate-800"
                  />
                </div>

                <div>
                  <label for="nomina-trab-cargo" class="block font-bold text-slate-700 mb-1">Cargo en la Finca *</label>
                  <select id="nomina-trab-cargo" class="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-800">
                    <option value="Mayordomo">Mayordomo</option>
                    <option value="Vaquero">Vaquero</option>
                    <option value="Ordeñador">Ordeñador</option>
                    <option value="Jornalero por día">Jornalero por día</option>
                    <option value="Tractorista / Maquinaria">Tractorista / Maquinaria</option>
                    <option value="Veterinario / Técnico">Veterinario / Técnico</option>
                    <option value="Administrador de Finca">Administrador de Finca</option>
                  </select>
                </div>

                <div>
                  <label for="nomina-trab-finca" class="block font-bold text-slate-700 mb-1">Finca Asignada *</label>
                  <select id="nomina-trab-finca" class="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-800">
                    ${fincas.map((f) => `
                      <option value="${this.escape(f.id)}" ${f.id === fincaDefaultForm ? 'selected' : ''}>
                        ${this.escape(f.nombre)}
                      </option>
                    `).join('')}
                  </select>
                </div>

                <div>
                  <label for="nomina-trab-modalidad" class="block font-bold text-slate-700 mb-1">Modalidad de Pago *</label>
                  <select id="nomina-trab-modalidad" class="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-800">
                    <option value="Sueldo fijo mensual">Sueldo fijo mensual</option>
                    <option value="Jornal diario">Jornal diario</option>
                  </select>
                </div>

                <div>
                  <label for="nomina-trab-valor" class="block font-bold text-slate-700 mb-1">Valor Base ($ COP) *</label>
                  <input
                    type="number"
                    id="nomina-trab-valor"
                    required
                    min="1"
                    placeholder="Ej. 1600000 o 65000"
                    class="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-800"
                  />
                </div>

                <div class="sm:col-span-2">
                  <button
                    type="submit"
                    id="btn-guardar-trabajador"
                    class="w-full py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all duration-200 cursor-pointer"
                  >
                    + Agregar Trabajador al Directorio de la Finca
                  </button>
                </div>
              </form>
            ` : ''}

            <!-- LISTA DE PERSONAL -->
            <div class="space-y-2 max-h-72 overflow-y-auto pr-1">
              ${trabajadoresFiltrados.length > 0 ? trabajadoresFiltrados.map((t) => {
                const fincaObj = fincas.find((f) => f.id === (t.fincaId || t.finca_id));
                return `
                  <div class="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition flex items-center justify-between gap-2 text-xs">
                    <div class="min-w-0">
                      <div class="font-bold text-slate-800 truncate flex items-center gap-1.5">
                        <span>${this.escape(t.nombre)}</span>
                        <span class="px-2 py-0.5 rounded-full text-[10px] bovi-badge-nomina">${this.escape(t.cargo)}</span>
                      </div>
                      <div class="text-[11px] text-slate-600 mt-0.5">
                        CC: ${this.escape(t.cedula)} • 🏡 ${this.escape(fincaObj ? fincaObj.nombre : 'Finca')} • ${this.escape(t.modalidad)}: <strong class="text-slate-800">${formatearMonedaCOP(t.valorBase)}</strong>
                      </div>
                    </div>
                    ${!esSoloConsulta ? `
                      <button
                        type="button"
                        data-eliminar-trabajador="${this.escape(t.id)}"
                        class="btn-eliminar-trabajador px-2 py-1 rounded-lg text-rose-700 hover:bg-rose-50 font-bold text-xs shrink-0 cursor-pointer"
                        title="Eliminar trabajador"
                      >
                        🗑️
                      </button>
                    ` : ''}
                  </div>
                `;
              }).join('') : `
                <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 text-center">
                  No hay trabajadores registrados en este filtro de finca. Registra mayordomos, vaqueros o jornaleros arriba.
                </div>
              `}
            </div>
          </div>
        </div>

        <!-- LIQUIDACIÓN DE NÓMINA, SEGURIDAD SOCIAL Y PRESTACIONES -->
        <div class="lg:col-span-7 bovi-agrotech-card bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 mb-4 border-b border-slate-200">
            <div>
              <h3 class="text-sm font-black uppercase tracking-wider text-slate-800">
                📑 Liquidación de Nómina, Seguridad Social (EPS, AFP, ARL, Caja) y Prestaciones
              </h3>
              <p class="text-[11px] text-slate-600">
                Cada pago confirmado impacta automáticamente como un egreso contable en la finca asignada.
              </p>
            </div>
            <button
              type="button"
              id="btn-autocalcular-nomina-ley"
              class="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold transition cursor-pointer shrink-0"
            >
              ⚡ Recalcular Aportes de Ley
            </button>
          </div>

          ${!esSoloConsulta ? `
            <form id="form-nomina-liquidacion" class="space-y-4 text-xs">
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label for="nomina-liq-trabajador" class="block font-bold text-slate-700 mb-1">Trabajador *</label>
                  <select id="nomina-liq-trabajador" class="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-800">
                    ${trabajadoresFiltrados.length > 0 ? trabajadoresFiltrados.map((t) => `
                      <option
                        value="${this.escape(t.id)}"
                        data-finca="${this.escape(t.fincaId || t.finca_id)}"
                        data-modalidad="${this.escape(t.modalidad)}"
                        data-base="${Number(t.valorBase) || 0}"
                        data-nombre="${this.escape(t.nombre)}"
                        data-cedula="${this.escape(t.cedula)}"
                        data-cargo="${this.escape(t.cargo)}"
                      >
                        ${this.escape(t.nombre)} (${this.escape(t.cargo)})
                      </option>
                    `).join('') : `
                      <option value="">-- Sin personal en directorio (Ingreso Manual) --</option>
                    `}
                  </select>
                </div>

                <div>
                  <label for="nomina-liq-finca" class="block font-bold text-slate-700 mb-1">Finca que Asume el Egreso *</label>
                  <select id="nomina-liq-finca" required class="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-800">
                    ${fincas.map((f) => `
                      <option value="${this.escape(f.id)}" ${f.id === (primerTrab ? (primerTrab.fincaId || primerTrab.finca_id) : fincaDefaultForm) ? 'selected' : ''}>
                        ${this.escape(f.nombre)}
                      </option>
                    `).join('')}
                  </select>
                </div>

                <div>
                  <label for="nomina-liq-fecha" class="block font-bold text-slate-700 mb-1">Fecha de Pago *</label>
                  <input type="date" id="nomina-liq-fecha" value="${hoyIso}" required class="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold text-slate-800" />
                </div>
              </div>

              <!-- DEVENGADOS Y DEDUCCIONES -->
              <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <label for="nomina-liq-periodo" class="block font-bold text-slate-700 mb-1">Modalidad / Periodo</label>
                  <select id="nomina-liq-periodo" class="w-full px-2.5 py-2 rounded-xl border border-slate-300 font-bold text-slate-800">
                    <option value="Mensual">Mes Completo (30d)</option>
                    <option value="Quincenal">Quincena (15d)</option>
                    <option value="Jornales">Jornales por Día</option>
                  </select>
                </div>

                <div>
                  <label for="nomina-liq-dias" class="block font-bold text-slate-700 mb-1">Días / Jornales</label>
                  <input type="number" id="nomina-liq-dias" value="30" min="1" max="365" class="w-full px-2.5 py-2 rounded-xl border border-slate-300 font-bold text-slate-800" />
                </div>

                <div>
                  <label for="nomina-liq-base" class="block font-bold text-slate-700 mb-1">Sueldo / Jornal Base ($)</label>
                  <input type="number" id="nomina-liq-base" value="${liqInicial.salarioBasePeriodo}" min="0" required class="w-full px-2.5 py-2 rounded-xl border border-slate-300 font-bold text-slate-800" />
                </div>

                <div>
                  <label for="nomina-liq-bonificaciones" class="block font-bold text-slate-700 mb-1">(+) Bonificaciones ($)</label>
                  <input type="number" id="nomina-liq-bonificaciones" value="0" min="0" class="w-full px-2.5 py-2 rounded-xl border border-slate-300 font-semibold text-emerald-700" />
                </div>

                <div>
                  <label for="nomina-liq-prestamos" class="block font-bold text-slate-700 mb-1">(-) Préstamos / Anticipos</label>
                  <input type="number" id="nomina-liq-prestamos" value="0" min="0" class="w-full px-2.5 py-2 rounded-xl border border-slate-300 font-semibold text-rose-700" />
                </div>
              </div>

              <!-- SEGURIDAD SOCIAL Y PARAFISCALES (SALUD EPS, PENSIÓN AFP, ARL RIESGO AGROPECUARIO, CAJA) -->
              <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div class="font-bold text-slate-800 mb-2 flex items-center justify-between">
                  <span>🛡️ Aportes de Seguridad Social y Parafiscales</span>
                  <span class="text-[11px] text-slate-600">Salud (EPS) • Pensión (AFP) • ARL Agropecuaria • Caja Compensación</span>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label for="nomina-liq-salud" class="block font-semibold text-slate-600 mb-1">Salud - EPS ($)</label>
                    <input type="number" id="nomina-liq-salud" value="${liqInicial.saludEps}" min="0" class="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 font-bold text-slate-800" />
                  </div>
                  <div>
                    <label for="nomina-liq-pension" class="block font-semibold text-slate-600 mb-1">Pensión - AFP ($)</label>
                    <input type="number" id="nomina-liq-pension" value="${liqInicial.pensionAfp}" min="0" class="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 font-bold text-slate-800" />
                  </div>
                  <div>
                    <label for="nomina-liq-arl" class="block font-semibold text-slate-600 mb-1">ARL Riesgo Agro ($)</label>
                    <input type="number" id="nomina-liq-arl" value="${liqInicial.arlRiesgo}" min="0" class="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 font-bold text-slate-800" />
                  </div>
                  <div>
                    <label for="nomina-liq-caja" class="block font-semibold text-slate-600 mb-1">Caja Compensación ($)</label>
                    <input type="number" id="nomina-liq-caja" value="${liqInicial.cajaCompensacion}" min="0" class="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 font-bold text-slate-800" />
                  </div>
                </div>
              </div>

              <!-- PRESTACIONES SOCIALES (PRIMA, CESANTÍAS, INTERESES, VACACIONES) -->
              <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div class="font-bold text-slate-800 mb-2 flex items-center justify-between">
                  <span>🎁 Provisión / Liquidación de Prestaciones Sociales</span>
                  <span class="text-[11px] text-slate-600">Prima • Cesantías • Intereses • Vacaciones</span>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label for="nomina-liq-prima" class="block font-semibold text-slate-600 mb-1">Prima de Servicios ($)</label>
                    <input type="number" id="nomina-liq-prima" value="${liqInicial.prima}" min="0" class="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 font-bold text-slate-800" />
                  </div>
                  <div>
                    <label for="nomina-liq-cesantias" class="block font-semibold text-slate-600 mb-1">Cesantías ($)</label>
                    <input type="number" id="nomina-liq-cesantias" value="${liqInicial.cesantias}" min="0" class="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 font-bold text-slate-800" />
                  </div>
                  <div>
                    <label for="nomina-liq-intereses" class="block font-semibold text-slate-600 mb-1">Intereses Cesantías ($)</label>
                    <input type="number" id="nomina-liq-intereses" value="${liqInicial.interesesCesantias}" min="0" class="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 font-bold text-slate-800" />
                  </div>
                  <div>
                    <label for="nomina-liq-vacaciones" class="block font-semibold text-slate-600 mb-1">Vacaciones ($)</label>
                    <input type="number" id="nomina-liq-vacaciones" value="${liqInicial.vacaciones}" min="0" class="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 font-bold text-slate-800" />
                  </div>
                </div>
              </div>

              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                <div class="text-xs text-slate-700">
                  Impacto automático en el flujo de caja de la finca seleccionada al confirmar la planilla.
                </div>
                <button
                  type="submit"
                  id="btn-confirmar-pago-nomina"
                  class="py-2.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-sm"
                >
                  ✓ Confirmar Pago de Nómina e Impactar Contabilidad
                </button>
              </div>
            </form>
          ` : ''}

          <!-- HISTORIAL DE PLANILLAS DE NÓMINA LIQUIDADAS -->
          <div class="mt-5 pt-4 border-t border-slate-200">
            <h4 class="text-xs font-black uppercase tracking-wider text-slate-700 mb-2">
              Planillas y Pagos de Nómina Confirmados (${pagosNominaFiltrados.length})
            </h4>
            <div class="space-y-2 max-h-48 overflow-y-auto pr-1">
              ${pagosNominaFiltrados.length > 0 ? pagosNominaFiltrados.map((p) => {
                const fincaObj = fincas.find((f) => f.id === (p.fincaId || p.finca_id));
                return `
                  <div class="p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span class="font-bold text-slate-800">${this.escape(p.trabajadorNombre || 'Trabajador')}</span>
                      <span class="text-slate-600"> • ${this.escape(p.periodo || 'Mensual')} (${this.escape(p.fecha)}) • 🏡 ${this.escape(fincaObj ? fincaObj.nombre : p.fincaId)}</span>
                      <div class="text-[11px] text-slate-600 mt-0.5">
                        Neto: <strong>${formatearMonedaCOP(p.netoTrabajador)}</strong> | Seg. Social: <strong>${formatearMonedaCOP(p.totalSeguridadSocial)}</strong> | Prestaciones: <strong>${formatearMonedaCOP(p.totalPrestaciones)}</strong>
                      </div>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="px-2.5 py-1 rounded-lg text-xs bovi-badge-nomina bovi-kpi-value">
                        Total: ${formatearMonedaCOP(p.costoTotalFinca)}
                      </span>
                      ${!esSoloConsulta ? `
                        <button
                          type="button"
                          data-eliminar-pago-nomina="${this.escape(p.id)}"
                          class="btn-eliminar-pago-nomina px-2 py-1 rounded-lg text-rose-700 hover:bg-rose-50 font-bold cursor-pointer"
                          title="Anular planilla y su asiento contable"
                        >
                          🗑️
                        </button>
                      ` : ''}
                    </div>
                  </div>
                `;
              }).join('') : `
                <p class="text-xs text-slate-600 py-2">Aún no se han liquidado planillas de nómina en este filtro.</p>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderTablaHistoricaMovimientos({ movimientos, fincas, esSoloConsulta }) {
    const listaFiltrada = (movimientos || []).filter((m) => {
      if (!m) return false;
      if (this.filtroTablaTipo !== 'todos' && m.tipo !== this.filtroTablaTipo) return false;
      if (this.filtroTablaEstado !== 'todos') {
        const est = String(m.estado || 'Pagado').toLowerCase();
        if (this.filtroTablaEstado === 'pagado' && !est.includes('pagad') && !est.includes('cobrad')) return false;
        if (this.filtroTablaEstado === 'pendiente' && !est.includes('pagar') && !est.includes('pendient')) return false;
      }
      if (this.filtroTablaTexto && this.filtroTablaTexto.trim()) {
        const q = this.filtroTablaTexto.trim().toLowerCase();
        const coincide =
          String(m.concepto || '').toLowerCase().includes(q) ||
          String(m.categoria || '').toLowerCase().includes(q) ||
          String(m.tercero || '').toLowerCase().includes(q) ||
          String(m.metodoPago || '').toLowerCase().includes(q);
        if (!coincide) return false;
      }
      return true;
    });

    const getBadgeTipo = (tipo) => {
      if (tipo === 'ingreso') return { clase: 'bovi-badge-ingreso', label: 'Ingreso' };
      if (tipo === 'costo_directo') return { clase: 'bovi-badge-costo', label: 'Costo Directo' };
      if (tipo === 'nomina') return { clase: 'bovi-badge-nomina', label: 'Nómina & Ley' };
      return { clase: 'bovi-badge-gasto', label: 'Gasto Admin' };
    };

    return `
      <div class="bovi-agrotech-card bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div class="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h3 class="text-base font-black text-slate-800">
              📚 Libro Mayor e Historial de Movimientos Financieros (${listaFiltrada.length})
            </h3>
            <p class="text-xs text-slate-600">
              Trazabilidad completa de ingresos, costos directos, gastos administrativos y asientos automáticos de nómina por finca.
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="search"
              id="input-buscar-movimiento-contab"
              value="${this.escape(this.filtroTablaTexto)}"
              placeholder="Buscar concepto, proveedor, categoría..."
              class="px-3 py-1.5 rounded-xl border border-slate-300 font-semibold text-slate-800 min-w-[210px]"
            />
            <select id="select-filtro-tabla-tipo" class="px-2.5 py-1.5 rounded-xl border border-slate-300 font-bold text-slate-800">
              <option value="todos" ${this.filtroTablaTipo === 'todos' ? 'selected' : ''}>Todos los Tipos</option>
              <option value="ingreso" ${this.filtroTablaTipo === 'ingreso' ? 'selected' : ''}>Ingresos</option>
              <option value="costo_directo" ${this.filtroTablaTipo === 'costo_directo' ? 'selected' : ''}>Costos Directos</option>
              <option value="gasto_admin" ${this.filtroTablaTipo === 'gasto_admin' ? 'selected' : ''}>Gastos Admin</option>
              <option value="nomina" ${this.filtroTablaTipo === 'nomina' ? 'selected' : ''}>Nómina y Seg. Social</option>
            </select>
            <select id="select-filtro-tabla-estado" class="px-2.5 py-1.5 rounded-xl border border-slate-300 font-bold text-slate-800">
              <option value="todos" ${this.filtroTablaEstado === 'todos' ? 'selected' : ''}>Todos los Estados</option>
              <option value="pagado" ${this.filtroTablaEstado === 'pagado' ? 'selected' : ''}>Pagados / Ejecutados</option>
              <option value="pendiente" ${this.filtroTablaEstado === 'pendiente' ? 'selected' : ''}>Cuentas por Pagar</option>
            </select>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="border-b border-slate-200 uppercase text-[11px]">
                <th class="p-3.5">Fecha</th>
                <th class="p-3.5">Finca</th>
                <th class="p-3.5">Tipo</th>
                <th class="p-3.5">Categoría & Concepto</th>
                <th class="p-3.5">Proveedor / Tercero</th>
                <th class="p-3.5">Método & Estado</th>
                <th class="p-3.5 text-right">Monto ($ COP)</th>
                <th class="p-3.5 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200">
              ${listaFiltrada.length > 0 ? listaFiltrada.map((m) => {
                const fincaObj = fincas.find((f) => f.id === (m.fincaId || m.finca_id));
                const badge = getBadgeTipo(m.tipo);
                const esIngreso = m.tipo === 'ingreso';
                const esPendiente = String(m.estado || '').toLowerCase().includes('pagar') || String(m.estado || '').toLowerCase().includes('pendient');

                return `
                  <tr class="bovi-table-row-hover transition">
                    <td class="p-3.5 font-mono font-semibold text-slate-700 whitespace-nowrap">${this.escape(m.fecha)}</td>
                    <td class="p-3.5 font-bold text-slate-800 whitespace-nowrap">
                      🏡 ${this.escape(fincaObj ? fincaObj.nombre : (m.fincaNombre || m.fincaId))}
                    </td>
                    <td class="p-3.5 whitespace-nowrap">
                      <span class="px-2.5 py-0.5 rounded-full text-[11px] ${badge.clase}">
                        ${badge.label}
                      </span>
                    </td>
                    <td class="p-3.5">
                      <div class="font-bold text-slate-800">${this.escape(m.concepto)}</div>
                      <div class="text-[11px] text-slate-600">${this.escape(m.categoria)}</div>
                    </td>
                    <td class="p-3.5 font-semibold text-slate-700">${this.escape(m.tercero || '—')}</td>
                    <td class="p-3.5 whitespace-nowrap">
                      <div class="text-slate-700 font-semibold">${this.escape(m.metodoPago || 'Transferencia')}</div>
                      <span class="inline-block mt-0.5 px-2 py-0.5 rounded-md text-[10px] ${esPendiente ? 'bovi-badge-costo' : 'bovi-badge-ingreso'}">
                        ${this.escape(m.estado || 'Pagado')}
                      </span>
                    </td>
                    <td class="p-3.5 text-right font-bold text-sm whitespace-nowrap bovi-kpi-value ${esIngreso ? 'text-emerald-700' : 'text-rose-700'}">
                      ${esIngreso ? '+' : '-'}${formatearMonedaCOP(m.monto)}
                    </td>
                    <td class="p-3.5 text-center whitespace-nowrap">
                      ${!esSoloConsulta ? `
                        <div class="flex items-center justify-center gap-1.5">
                          ${esPendiente ? `
                            <button
                              type="button"
                              data-marcar-pagado="${this.escape(m.id)}"
                              class="btn-marcar-pagado-contab px-2 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-bold cursor-pointer"
                              title="Marcar Cuenta por Pagar como Pagado"
                            >
                              ✓ Pagar
                            </button>
                          ` : ''}
                          <button
                            type="button"
                            data-eliminar-movimiento="${this.escape(m.id)}"
                            class="btn-eliminar-movimiento-contab px-2 py-1 rounded-lg text-rose-700 hover:bg-rose-50 font-bold cursor-pointer"
                            title="Eliminar registro contable"
                          >
                            🗑️
                          </button>
                        </div>
                      ` : '—'}
                    </td>
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="8" class="p-8 text-center text-slate-600">
                    No se encontraron movimientos contables para los filtros seleccionados.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  attachEvents() {
    if (!this.container) return;

    // 1. Filtro Global Multi-Finca
    const selFinca = this.container.querySelector('#select-contabilidad-finca-filtro');
    if (selFinca) {
      selFinca.onchange = (e) => {
        this.fincaFiltroId = e.target.value || 'ALL';
        this.render();
      };
    }

    // 2. Filtro de Periodo
    const selPeriodo = this.container.querySelector('#select-contabilidad-periodo-filtro');
    if (selPeriodo) {
      selPeriodo.onchange = (e) => {
        this.periodoFiltro = e.target.value || 'ALL';
        this.render();
      };
    }

    // 3. Subvistas (Integral / Dashboard / Movimientos / Nómina)
    this.container.querySelectorAll('.btn-subvista-contab').forEach((btn) => {
      btn.onclick = () => {
        const sv = btn.getAttribute('data-subvista');
        if (sv) {
          this.subvistaActiva = sv;
          this.render();
        }
      };
    });

    // 4. Cambio dinámico de categorías al cambiar Tipo de Movimiento
    const selTipoMov = this.container.querySelector('#contab-mov-tipo');
    const selCatMov = this.container.querySelector('#contab-mov-categoria');
    if (selTipoMov && selCatMov) {
      selTipoMov.onchange = (e) => {
        this.tipoMovimientoForm = e.target.value || 'costo_directo';
        const cats = CATEGORIAS_CONTABILIDAD[this.tipoMovimientoForm] || [];
        selCatMov.innerHTML = cats
          .map((c) => `<option value="${this.escape(c)}">${this.escape(c)}</option>`)
          .join('');
      };
    }

    // 5. Guardar nuevo Movimiento Contable (Ingreso / Costo Directo / Gasto Administrativo)
    const formMov = this.container.querySelector('#form-contabilidad-movimiento');
    if (formMov) {
      formMov.onsubmit = (e) => {
        e.preventDefault();
        const fecha = this.container.querySelector('#contab-mov-fecha')?.value;
        const fincaId = this.container.querySelector('#contab-mov-finca')?.value;
        const tipo = this.container.querySelector('#contab-mov-tipo')?.value || 'costo_directo';
        const categoria = this.container.querySelector('#contab-mov-categoria')?.value || 'General';
        const concepto = (this.container.querySelector('#contab-mov-concepto')?.value || '').trim();
        const tercero = (this.container.querySelector('#contab-mov-tercero')?.value || '').trim();
        const metodoPago = this.container.querySelector('#contab-mov-metodo')?.value || 'Transferencia Bancaria';
        const estado = this.container.querySelector('#contab-mov-estado')?.value || 'Pagado';
        const monto = Number(this.container.querySelector('#contab-mov-monto')?.value || 0);

        if (!fincaId) {
          if (typeof alert !== 'undefined') alert('Por favor selecciona la finca asignada al registro contable.');
          return;
        }
        if (!concepto || monto <= 0) {
          if (typeof alert !== 'undefined') alert('Ingresa un concepto válido y un monto mayor a $0.');
          return;
        }

        if (typeof this.onGuardarMovimiento === 'function') {
          this.onGuardarMovimiento({
            fecha,
            fincaId,
            finca_id: fincaId,
            tipo,
            categoria,
            concepto,
            tercero,
            metodoPago,
            estado,
            monto
          });
        }
        this.render();
      };
    }

    // 6. Guardar Trabajador en el Directorio por Finca
    const formTrab = this.container.querySelector('#form-nomina-trabajador');
    if (formTrab) {
      formTrab.onsubmit = (e) => {
        e.preventDefault();
        const nombre = (this.container.querySelector('#nomina-trab-nombre')?.value || '').trim();
        const cedula = (this.container.querySelector('#nomina-trab-cedula')?.value || '').trim();
        const cargo = this.container.querySelector('#nomina-trab-cargo')?.value || 'Vaquero';
        const fincaId = this.container.querySelector('#nomina-trab-finca')?.value;
        const modalidad = this.container.querySelector('#nomina-trab-modalidad')?.value || 'Sueldo fijo mensual';
        const valorBase = Number(this.container.querySelector('#nomina-trab-valor')?.value || 0);

        if (!nombre || !fincaId || valorBase <= 0) {
          if (typeof alert !== 'undefined') alert('Completa el nombre, finca asignada y valor base del trabajador.');
          return;
        }

        if (typeof this.onGuardarTrabajador === 'function') {
          this.onGuardarTrabajador({
            nombre,
            cedula,
            cargo,
            fincaId,
            finca_id: fincaId,
            modalidad,
            valorBase
          });
        }
        this.render();
      };
    }

    // 7. Eliminar Trabajador
    this.container.querySelectorAll('.btn-eliminar-trabajador').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-eliminar-trabajador');
        if (id && typeof this.onEliminarTrabajador === 'function') {
          this.onEliminarTrabajador(id);
          this.render();
        }
      };
    });

    // 8. Autocalcular Liquidación de Nómina y Seguridad Social al cambiar trabajador, periodo o días
    const recalcularCamposNomina = () => {
      const selTrab = this.container.querySelector('#nomina-liq-trabajador');
      const opt = selTrab && selTrab.options ? selTrab.options[selTrab.selectedIndex] : null;
      const modalidad = opt?.getAttribute('data-modalidad') || 'Sueldo fijo mensual';
      const valorUnitarioTrab = Number(opt?.getAttribute('data-base') || this.container.querySelector('#nomina-liq-base')?.value || 0);
      const fincaTrab = opt?.getAttribute('data-finca');

      if (fincaTrab) {
        const selFincaLiq = this.container.querySelector('#nomina-liq-finca');
        if (selFincaLiq) selFincaLiq.value = fincaTrab;
      }

      const tipoPeriodo = this.container.querySelector('#nomina-liq-periodo')?.value || 'Mensual';
      const dias = Number(this.container.querySelector('#nomina-liq-dias')?.value || 30);
      const bonif = Number(this.container.querySelector('#nomina-liq-bonificaciones')?.value || 0);
      const prestamos = Number(this.container.querySelector('#nomina-liq-prestamos')?.value || 0);

      const calc = calcularLiquidacionNomina({
        modalidad,
        valorBase: valorUnitarioTrab,
        tipoPeriodo,
        diasTrabajados: dias,
        bonificaciones: bonif,
        descuentoPrestamos: prestamos
      });

      const setVal = (sel, v) => {
        const el = this.container.querySelector(sel);
        if (el) el.value = v;
      };
      setVal('#nomina-liq-base', calc.salarioBasePeriodo);
      setVal('#nomina-liq-salud', calc.saludEps);
      setVal('#nomina-liq-pension', calc.pensionAfp);
      setVal('#nomina-liq-arl', calc.arlRiesgo);
      setVal('#nomina-liq-caja', calc.cajaCompensacion);
      setVal('#nomina-liq-prima', calc.prima);
      setVal('#nomina-liq-cesantias', calc.cesantias);
      setVal('#nomina-liq-intereses', calc.interesesCesantias);
      setVal('#nomina-liq-vacaciones', calc.vacaciones);
    };

    const selTrabLiq = this.container.querySelector('#nomina-liq-trabajador');
    const selPerLiq = this.container.querySelector('#nomina-liq-periodo');
    const inpDiasLiq = this.container.querySelector('#nomina-liq-dias');
    const btnAutoLey = this.container.querySelector('#btn-autocalcular-nomina-ley');

    if (selTrabLiq) selTrabLiq.onchange = () => recalcularCamposNomina();
    if (selPerLiq) {
      selPerLiq.onchange = (e) => {
        const p = e.target.value;
        const elDias = this.container.querySelector('#nomina-liq-dias');
        if (elDias) {
          elDias.value = p === 'Quincenal' ? 15 : (p === 'Jornales' ? 6 : 30);
        }
        recalcularCamposNomina();
      };
    }
    if (inpDiasLiq) inpDiasLiq.onchange = () => recalcularCamposNomina();
    if (btnAutoLey) btnAutoLey.onclick = () => recalcularCamposNomina();

    // 9. Confirmar Liquidación de Nómina e Impactar Contabilidad de la Finca
    const formLiq = this.container.querySelector('#form-nomina-liquidacion');
    if (formLiq) {
      formLiq.onsubmit = (e) => {
        e.preventDefault();
        const selTrab = this.container.querySelector('#nomina-liq-trabajador');
        const opt = selTrab && selTrab.options ? selTrab.options[selTrab.selectedIndex] : null;
        const trabajadorId = selTrab?.value || `TRAB-MANUAL-${Date.now()}`;
        const trabajadorNombre = opt?.getAttribute('data-nombre') || 'Personal de Campo';
        const cedula = opt?.getAttribute('data-cedula') || 'S/N';
        const cargo = opt?.getAttribute('data-cargo') || 'Operario Agropecuario';
        const modalidad = opt?.getAttribute('data-modalidad') || 'Sueldo fijo mensual';

        const fincaId = this.container.querySelector('#nomina-liq-finca')?.value;
        const fecha = this.container.querySelector('#nomina-liq-fecha')?.value;
        const periodo = this.container.querySelector('#nomina-liq-periodo')?.value || 'Mensual';
        const diasTrabajados = Number(this.container.querySelector('#nomina-liq-dias')?.value || 30);
        const salarioBase = Number(this.container.querySelector('#nomina-liq-base')?.value || 0);
        const bonificaciones = Number(this.container.querySelector('#nomina-liq-bonificaciones')?.value || 0);
        const descuentoPrestamos = Number(this.container.querySelector('#nomina-liq-prestamos')?.value || 0);

        const saludEps = Number(this.container.querySelector('#nomina-liq-salud')?.value || 0);
        const pensionAfp = Number(this.container.querySelector('#nomina-liq-pension')?.value || 0);
        const arlRiesgo = Number(this.container.querySelector('#nomina-liq-arl')?.value || 0);
        const cajaCompensacion = Number(this.container.querySelector('#nomina-liq-caja')?.value || 0);

        const prima = Number(this.container.querySelector('#nomina-liq-prima')?.value || 0);
        const cesantias = Number(this.container.querySelector('#nomina-liq-cesantias')?.value || 0);
        const interesesCesantias = Number(this.container.querySelector('#nomina-liq-intereses')?.value || 0);
        const vacaciones = Number(this.container.querySelector('#nomina-liq-vacaciones')?.value || 0);

        const netoTrabajador = Math.max(0, salarioBase + bonificaciones - descuentoPrestamos);
        const totalSeguridadSocial = saludEps + pensionAfp + arlRiesgo + cajaCompensacion;
        const totalPrestaciones = prima + cesantias + interesesCesantias + vacaciones;
        const costoTotalFinca = netoTrabajador + totalSeguridadSocial + totalPrestaciones;

        if (!fincaId || costoTotalFinca <= 0) {
          if (typeof alert !== 'undefined') alert('Verifica la finca seleccionada y los valores de liquidación.');
          return;
        }

        if (typeof this.onRegistrarPagoNomina === 'function') {
          this.onRegistrarPagoNomina({
            fecha,
            periodo,
            trabajadorId,
            trabajadorNombre,
            cedula,
            cargo,
            fincaId,
            finca_id: fincaId,
            modalidad,
            diasTrabajados,
            salarioBasePeriodo: salarioBase,
            bonificaciones,
            descuentoPrestamos,
            netoTrabajador,
            saludEps,
            pensionAfp,
            arlRiesgo,
            cajaCompensacion,
            totalSeguridadSocial,
            prima,
            cesantias,
            interesesCesantias,
            vacaciones,
            totalPrestaciones,
            costoTotalFinca
          });
        }
        this.render();
      };
    }

    // 10. Eliminar planilla de nómina
    this.container.querySelectorAll('.btn-eliminar-pago-nomina').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-eliminar-pago-nomina');
        if (id && typeof this.onEliminarPagoNomina === 'function') {
          this.onEliminarPagoNomina(id);
          this.render();
        }
      };
    });

    // 11. Filtros de la Tabla Histórica
    const inpBuscar = this.container.querySelector('#input-buscar-movimiento-contab');
    if (inpBuscar) {
      inpBuscar.oninput = (e) => {
        this.filtroTablaTexto = e.target.value || '';
        this.render();
      };
    }

    const selFiltroTipo = this.container.querySelector('#select-filtro-tabla-tipo');
    if (selFiltroTipo) {
      selFiltroTipo.onchange = (e) => {
        this.filtroTablaTipo = e.target.value || 'todos';
        this.render();
      };
    }

    const selFiltroEst = this.container.querySelector('#select-filtro-tabla-estado');
    if (selFiltroEst) {
      selFiltroEst.onchange = (e) => {
        this.filtroTablaEstado = e.target.value || 'todos';
        this.render();
      };
    }

    // 12. Marcar Cuenta por Pagar como Pagado y Eliminar Movimiento
    this.container.querySelectorAll('.btn-marcar-pagado-contab').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-marcar-pagado');
        if (id && typeof this.onCambiarEstadoMovimiento === 'function') {
          this.onCambiarEstadoMovimiento(id, 'Pagado');
          this.render();
        }
      };
    });

    this.container.querySelectorAll('.btn-eliminar-movimiento-contab').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-eliminar-movimiento');
        if (id && typeof this.onEliminarMovimiento === 'function') {
          this.onEliminarMovimiento(id);
          this.render();
        }
      };
    });

    // 13. Exportación a Excel (.xlsx) y CSV (.csv)
    const btnExcel = this.container.querySelector('#btn-exportar-contabilidad-excel');
    if (btnExcel) {
      btnExcel.onclick = () => this.exportarDatosContables('xlsx');
    }

    const btnCsv = this.container.querySelector('#btn-exportar-contabilidad-csv');
    if (btnCsv) {
      btnCsv.onclick = () => this.exportarDatosContables('csv');
    }
  }

  exportarDatosContables(formato = 'csv') {
    const fincas = this.getFincas() || [];
    const movimientos = this.getMovimientos() || [];
    const pagosNomina = this.getPagosNomina() || [];
    const animales = this.getAnimales() || [];

    const resumen = calcularResumenContableFinca({
      movimientos,
      pagosNomina,
      animales,
      fincas,
      fincaFiltroId: this.fincaFiltroId,
      periodoFiltro: this.periodoFiltro
    });

    const filas = resumen.movimientosFiltrados.map((m) => {
      const fObj = fincas.find((f) => f.id === (m.fincaId || m.finca_id));
      return {
        Fecha: m.fecha || '',
        Finca_ID: m.fincaId || m.finca_id || '',
        Finca: fObj ? fObj.nombre : (m.fincaNombre || m.fincaId || ''),
        Tipo: m.tipo === 'ingreso' ? 'Ingreso' : m.tipo === 'costo_directo' ? 'Costo Directo' : m.tipo === 'nomina' ? 'Nómina y Seg. Social' : 'Gasto Administrativo',
        Categoria: m.categoria || '',
        Concepto: m.concepto || '',
        Proveedor_Tercero: m.tercero || '',
        Metodo_Pago: m.metodoPago || '',
        Estado: m.estado || 'Pagado',
        Monto_COP: Number(m.monto || 0)
      };
    });

    if (formato === 'xlsx' && typeof XLSX !== 'undefined') {
      const wb = XLSX.utils.book_new();
      const wsMovs = XLSX.utils.json_to_sheet(filas.length > 0 ? filas : [{ Mensaje: 'Sin movimientos en este filtro' }]);
      XLSX.utils.book_append_sheet(wb, wsMovs, 'Movimientos_Contables');

      const wsPyG = XLSX.utils.json_to_sheet([
        { Rubro: '(+) Total Ingresos Operacionales', Valor_COP: resumen.totalIngresos },
        { Rubro: '(-) Costos Directos de Producción', Valor_COP: resumen.totalCostosDirectos },
        { Rubro: '(=) Utilidad Bruta', Valor_COP: resumen.utilidadBruta },
        { Rubro: '(-) Gastos Administrativos', Valor_COP: resumen.totalGastosAdmin },
        { Rubro: '(-) Nómina, Seguridad Social y Prestaciones', Valor_COP: resumen.totalNominaSeguridadSocial },
        { Rubro: '(=) Utilidad Neta / Flujo de Caja', Valor_COP: resumen.utilidadNeta },
        { Rubro: 'Animales Activos en Finca(s)', Valor_COP: resumen.animalesActivosCount },
        { Rubro: 'Costo Mensual por Cabeza ($/Animal)', Valor_COP: resumen.costoMensualPorCabeza },
        { Rubro: 'Costo Operativo por Hectárea ($/Ha)', Valor_COP: resumen.costoPorHectarea }
      ]);
      XLSX.utils.book_append_sheet(wb, wsPyG, 'Estado_Resultados_PyG');

      const fechaStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `Contabilidad_Nomina_GanaderoAD_${fechaStr}.xlsx`);
      return { ok: true, formato: 'xlsx', filas: filas.length };
    }

    // Exportación CSV universal con BOM UTF-8
    const headers = ['Fecha', 'Finca_ID', 'Finca', 'Tipo', 'Categoria', 'Concepto', 'Proveedor_Tercero', 'Metodo_Pago', 'Estado', 'Monto_COP'];
    const csvRows = [
      headers.join(','),
      ...filas.map((r) => headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))
    ];
    const csvContent = '\uFEFF' + csvRows.join('\n');

    if (
      typeof document !== 'undefined' &&
      typeof document.createElement === 'function' &&
      document.body &&
      typeof document.body.appendChild === 'function' &&
      typeof Blob !== 'undefined' &&
      typeof URL !== 'undefined' &&
      URL.createObjectURL
    ) {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Contabilidad_Nomina_GanaderoAD_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      if (typeof a.click === 'function') a.click();
      document.body.removeChild(a);
    }

    return { ok: true, formato: 'csv', filas: filas.length, csv: csvContent };
  }
}
