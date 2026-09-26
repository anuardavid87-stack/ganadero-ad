/**
 * GANADERO AD - DASHBOARD GRÁFICO E INFORMES INTERACTIVOS (100% OFFLINE SVG)
 * Gráficos de Fertilidad, Finanzas (Costos vs Ingresos), Curva de Lactancia e Inventario por Categorías.
 */

import { computarRendimientoFinanciero } from '../core/finanzas.js';

export class DashboardGrafico {
  constructor({ containerId, getFincaActiva, getFincasPermitidas, getAnimales, getCostosFijos, getInversiones, onCambiarFinca, getVentasGanado }) {
    this.container = document.getElementById(containerId);
    this.getFincaActiva = getFincaActiva;
    this.getFincasPermitidas = getFincasPermitidas;
    this.getAnimales = getAnimales;
    this.getCostosFijos = getCostosFijos;
    this.getInversiones = getInversiones;
    this.onCambiarFinca = onCambiarFinca;
    this.getVentasGanado = getVentasGanado;
  }

  init() {
    this.render();
  }

  render() {
    if (!this.container) return;

    const finca = this.getFincaActiva ? this.getFincaActiva() : null;
    const fincasPermitidas = this.getFincasPermitidas ? this.getFincasPermitidas() : [];
    const animales = (this.getAnimales ? this.getAnimales() : []).filter(
      (a) => a.estadoVida === 'activo' || a.estado === 'activo'
    );
    const costos = this.getCostosFijos ? this.getCostosFijos() : {};
    const inversiones = this.getInversiones ? this.getInversiones() : [];
    const ventasGanado = this.getVentasGanado ? this.getVentasGanado() : 0;

    // 1. Fertilidad
    const vientres = animales.filter((a) => a.sexo === 'hembra' && !(a.categoria || '').toLowerCase().includes('cria'));
    const prenadas = vientres.filter((a) => (a.estadoReproductivo || '').toLowerCase().includes('prenad') || (a.estadoReproductivo || '').toLowerCase().includes('preñad')).length;
    const vacias = vientres.filter((a) => (a.estadoReproductivo || '').toLowerCase().includes('vacia') || (a.estadoReproductivo || '').toLowerCase().includes('vacía')).length;
    const servidas = Math.max(0, vientres.length - prenadas - vacias);
    const tasaPrenez = vientres.length > 0 ? ((prenadas / vientres.length) * 100).toFixed(1) : 0;

    // 2. Finanzas Dinámicas Basadas en los Animales Reales de esta Finca
    const vacasOrdeno = animales.filter((a) => 
      (a.categoria || '').toLowerCase().includes('ordeño') || 
      (a.categoria || '').toLowerCase().includes('lact') ||
      (parseFloat(a.promedioLecheDiariaL) || 0) > 0
    );
    let litrosLecheMensuales = vacasOrdeno.reduce((sum, a) => sum + (parseFloat(a.promedioLecheDiariaL) || 0), 0) * 30;
    if (litrosLecheMensuales === 0 && vacasOrdeno.length > 0) {
      litrosLecheMensuales = vacasOrdeno.length * 12 * 30;
    }

    const animalesCarne = animales.filter((a) => 
      (a.categoria || '').toLowerCase().includes('ceba') || 
      (a.categoria || '').toLowerCase().includes('levante') || 
      (a.categoria || '').toLowerCase().includes('novillo') || 
      (a.categoria || '').toLowerCase().includes('macho')
    );
    let kilosCarneMensuales = animalesCarne.reduce((sum, a) => {
      const gdpGramos = parseFloat(a.gdpPromedioGDia) || 450;
      return sum + (gdpGramos / 1000) * 30;
    }, 0);
    if (kilosCarneMensuales === 0 && animales.length > 0 && vacasOrdeno.length === 0) {
      kilosCarneMensuales = animales.length * 15;
    }

    const balance = computarRendimientoFinanciero({
      finca,
      costosFijos: costos,
      inversiones,
      litrosLecheMensuales: Math.round(litrosLecheMensuales),
      kilosCarneMensuales: Math.round(kilosCarneMensuales),
      ingresosVentasAnimales: ventasGanado
    });

    // 3. Distribución Categorías
    const categorias = {};
    animales.forEach((a) => {
      const c = a.categoria || 'Sin Categoría';
      categorias[c] = (categorias[c] || 0) + 1;
    });

    this.container.innerHTML = `
      <div class="space-y-6">
        <!-- ENCABEZADO Y SELECTOR DE PREDIO -->
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div class="flex items-center gap-3.5">
            <div class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-2xl border border-emerald-200 shadow-inner">
              🏡
            </div>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="font-black text-slate-900 text-base sm:text-lg tracking-tight">${finca?.nombre || 'Predio Ganadero'}</h3>
                <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-mono font-black uppercase">Finca Activa</span>
              </div>
              <div class="text-xs text-slate-500 font-mono mt-0.5">
                Código: <strong>${finca?.codigo || finca?.id || 'S/C'}</strong> • Área: <strong>${finca?.areaHa || 0} Ha</strong> • 📍 ${finca?.ubicacion || 'Colombia'}
              </div>
            </div>
          </div>

          ${fincasPermitidas.length > 1 ? `
            <div class="flex items-center gap-2 w-full sm:w-auto shrink-0 bg-slate-50 p-2 rounded-2xl border border-slate-200">
              <span class="text-xs font-bold text-slate-600 pl-1 whitespace-nowrap">Predio:</span>
              <select id="select-finca-dashboard" class="w-full sm:w-56 px-3 py-1.5 text-xs font-black rounded-xl border border-slate-300 bg-white shadow-sm outline-none cursor-pointer focus:border-emerald-600">
                ${fincasPermitidas.map((f) => `<option value="${f.id}" ${f.id === finca?.id ? 'selected' : ''}>${f.nombre} (${f.areaHa || 0} Ha)</option>`).join('')}
              </select>
            </div>
          ` : ''}
        </div>
        <!-- KPIS PRINCIPALES -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <span class="text-[11px] font-bold text-slate-500 uppercase">Tasa de Preñez</span>
              <div class="text-2xl font-black text-emerald-800 mt-1">${tasaPrenez}%</div>
              <span class="text-[10px] text-emerald-600 font-bold">${prenadas} de ${vientres.length} vientres</span>
            </div>
            <div class="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-xl">
              🧬
            </div>
          </div>

          <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <span class="text-[11px] font-bold text-slate-500 uppercase">Total Hato Activo</span>
              <div class="text-2xl font-black text-slate-900 mt-1">${animales.length}</div>
              <span class="text-[10px] text-slate-500 font-medium">${finca?.nombre || 'Predio activo'}</span>
            </div>
            <div class="w-11 h-11 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center text-xl">
              🐂
            </div>
          </div>

          <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <span class="text-[11px] font-bold text-slate-500 uppercase">Margen Neto Mes</span>
              <div class="text-2xl font-black ${balance.indicadores.margenNeto >= 0 ? 'text-emerald-700' : 'text-rose-700'} mt-1">
                $${(balance.indicadores.margenNeto / 1000000).toFixed(2)}M
              </div>
              <span class="text-[10px] font-bold ${balance.indicadores.roiPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}">ROI: ${balance.indicadores.roiPct}%</span>
            </div>
            <div class="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-xl">
              💵
            </div>
          </div>

          <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <span class="text-[11px] font-bold text-slate-500 uppercase">Amortización Diferida</span>
              <div class="text-2xl font-black text-purple-700 mt-1">
                $${(balance.costos.cuotaInversionesDiferidas / 1000).toFixed(0)}k
              </div>
              <span class="text-[10px] text-purple-600 font-medium">Cuota mensual diferida</span>
            </div>
            <div class="w-11 h-11 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center text-xl">
              🏗️
            </div>
          </div>
        </div>

        <!-- FILA DE GRÁFICOS: FERTILIDAD & FINANZAS -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- GRÁFICO 1: DONUT FERTILIDAD -->
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div class="flex justify-between items-center mb-4">
              <div>
                <h3 class="font-black text-slate-900 text-sm flex items-center gap-2">
                  <span>🧬</span> Dinámica Reproductiva y Fertilidad
                </h3>
                <p class="text-xs text-slate-500">Distribución de vientres gestantes, vacíos y servidos.</p>
              </div>
              <span class="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                ${tasaPrenez}% Preñez
              </span>
            </div>

            <div class="flex flex-col sm:flex-row items-center justify-around gap-4 py-2">
              <div class="relative w-44 h-44">
                ${this.renderDonut(prenadas, vacias, servidas)}
                <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span class="text-2xl font-black text-slate-900">${tasaPrenez}%</span>
                  <span class="text-[10px] uppercase font-bold text-slate-400">Preñadas</span>
                </div>
              </div>

              <div class="space-y-2 text-xs w-full sm:w-auto">
                <div class="flex items-center justify-between sm:justify-start gap-3 p-2 rounded-xl bg-emerald-50/60 border border-emerald-100">
                  <span class="flex items-center gap-2 font-bold text-emerald-900">
                    <span class="w-3 h-3 rounded-full bg-emerald-600 inline-block"></span> Preñadas
                  </span>
                  <span class="font-mono font-bold text-emerald-800">${prenadas} (${tasaPrenez}%)</span>
                </div>
                <div class="flex items-center justify-between sm:justify-start gap-3 p-2 rounded-xl bg-rose-50/60 border border-rose-100">
                  <span class="flex items-center gap-2 font-bold text-rose-900">
                    <span class="w-3 h-3 rounded-full bg-rose-500 inline-block"></span> Vacías (Abiertas)
                  </span>
                  <span class="font-mono font-bold text-rose-800">${vacias}</span>
                </div>
                <div class="flex items-center justify-between sm:justify-start gap-3 p-2 rounded-xl bg-amber-50/60 border border-amber-100">
                  <span class="flex items-center gap-2 font-bold text-amber-900">
                    <span class="w-3 h-3 rounded-full bg-amber-500 inline-block"></span> Servidas / Sospecha
                  </span>
                  <span class="font-mono font-bold text-amber-800">${servidas}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- GRÁFICO 2: BARRAS FINANCIERAS -->
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div class="flex justify-between items-center mb-4">
              <div>
                <h3 class="font-black text-slate-900 text-sm flex items-center gap-2">
                  <span>📈</span> Rendimiento Financiero (Costos vs Ingresos)
                </h3>
                <p class="text-xs text-slate-500">Cruce de costos fijos, cuotas amortizables e ingresos de leche y carne.</p>
              </div>
              <span class="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                Margen: ${balance.indicadores.margenPct}%
              </span>
            </div>

            ${this.renderFinanzasBars(balance)}
          </div>
        </div>

        <!-- FILA DE GRÁFICOS: CURVA DE LACTANCIA & INVENTARIO -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div class="flex justify-between items-center mb-4">
              <div>
                <h3 class="font-black text-slate-900 text-sm flex items-center gap-2">
                  <span>🥛</span> Curva de Lactancia Promedio (Litros vs DEL)
                </h3>
                <p class="text-xs text-slate-500">Comportamiento de producción según días en lactancia.</p>
              </div>
              <span class="text-xs font-bold text-slate-500">Pico: Día 60</span>
            </div>
            ${this.renderCurvaLactancia()}
          </div>

          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div class="flex justify-between items-center mb-4">
              <div>
                <h3 class="font-black text-slate-900 text-sm flex items-center gap-2">
                  <span>🏷️</span> Estructura Demográfica del Hato
                </h3>
                <p class="text-xs text-slate-500">Distribución por categorías zootécnicas.</p>
              </div>
              <span class="text-xs font-bold text-emerald-800 font-mono">${animales.length} Cabezas</span>
            </div>
            ${this.renderCategorias(categorias, animales.length)}
          </div>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  renderDonut(p, v, s) {
    const total = p + v + s;
    if (total === 0) return '<div class="text-xs text-slate-400">Sin datos</div>';

    const r = 58;
    const c = 2 * Math.PI * r;
    const sp = (p / total) * c;
    const sv = (v / total) * c;
    const ss = (s / total) * c;

    return `
      <svg class="w-44 h-44 transform -rotate-90" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r="${r}" fill="transparent" stroke="#f1f5f9" stroke-width="22" />
        <circle cx="80" cy="80" r="${r}" fill="transparent" stroke="#059669" stroke-width="22" stroke-dasharray="${sp} ${c}" stroke-dashoffset="0" stroke-linecap="round" />
        <circle cx="80" cy="80" r="${r}" fill="transparent" stroke="#f43f5e" stroke-width="22" stroke-dasharray="${sv} ${c}" stroke-dashoffset="-${sp}" />
        <circle cx="80" cy="80" r="${r}" fill="transparent" stroke="#f59e0b" stroke-width="22" stroke-dasharray="${ss} ${c}" stroke-dashoffset="-${sp + sv}" stroke-linecap="round" />
      </svg>
    `;
  }

  renderFinanzasBars(b) {
    const maxVal = Math.max(b.costos.total, b.ingresos.total, 1);
    const hFijos = (b.costos.fijos / maxVal) * 110;
    const hAmort = (b.costos.cuotaInversionesDiferidas / maxVal) * 110;
    const hLeche = (b.ingresos.leche / maxVal) * 110;
    const hCarne = (b.ingresos.carne / maxVal) * 110;
    const hVentas = ((b.ingresos.ventasGanado || 0) / maxVal) * 110;

    return `
      <div class="h-44 flex items-end justify-around gap-2 sm:gap-4 pt-4 px-3 bg-slate-50 rounded-xl border border-slate-100">
        <div class="flex flex-col items-center gap-1 flex-1">
          <span class="text-[10px] font-bold text-slate-700 font-mono">$${(b.costos.fijos / 1000000).toFixed(1)}M</span>
          <div class="w-full max-w-[42px] bg-slate-700 rounded-t-lg transition-all" style="height: ${Math.max(6, hFijos)}px"></div>
          <span class="text-[9px] font-bold text-slate-500 uppercase">Costos Fijos</span>
        </div>
        <div class="flex flex-col items-center gap-1 flex-1">
          <span class="text-[10px] font-bold text-purple-700 font-mono">$${(b.costos.cuotaInversionesDiferidas / 1000).toFixed(0)}k</span>
          <div class="w-full max-w-[42px] bg-purple-600 rounded-t-lg transition-all" style="height: ${Math.max(6, hAmort)}px"></div>
          <span class="text-[9px] font-bold text-purple-600 uppercase">Amortización</span>
        </div>
        <div class="flex flex-col items-center gap-1 flex-1">
          <span class="text-[10px] font-bold text-emerald-700 font-mono">$${(b.ingresos.leche / 1000000).toFixed(1)}M</span>
          <div class="w-full max-w-[42px] bg-emerald-600 rounded-t-lg transition-all" style="height: ${Math.max(6, hLeche)}px"></div>
          <span class="text-[9px] font-bold text-emerald-700 uppercase">Leche</span>
        </div>
        <div class="flex flex-col items-center gap-1 flex-1">
          <span class="text-[10px] font-bold text-teal-700 font-mono">$${(b.ingresos.carne / 1000000).toFixed(1)}M</span>
          <div class="w-full max-w-[42px] bg-teal-500 rounded-t-lg transition-all" style="height: ${Math.max(6, hCarne)}px"></div>
          <span class="text-[9px] font-bold text-teal-700 uppercase">Carne</span>
        </div>
        ${(b.ingresos.ventasGanado || 0) > 0 ? `
        <div class="flex flex-col items-center gap-1 flex-1">
          <span class="text-[10px] font-bold text-amber-700 font-mono">$${(b.ingresos.ventasGanado / 1000000).toFixed(1)}M</span>
          <div class="w-full max-w-[42px] bg-amber-500 rounded-t-lg transition-all" style="height: ${Math.max(6, hVentas)}px"></div>
          <span class="text-[9px] font-bold text-amber-700 uppercase">Ventas</span>
        </div>
        ` : ''}
      </div>
    `;
  }

  renderCurvaLactancia() {
    return `
      <div class="h-44 flex flex-col justify-end bg-slate-50 p-2.5 rounded-xl border border-slate-100">
        <svg viewBox="0 0 380 120" class="w-full h-full">
          <line x1="30" y1="20" x2="360" y2="20" stroke="#e2e8f0" stroke-dasharray="2,2" />
          <line x1="30" y1="60" x2="360" y2="60" stroke="#e2e8f0" stroke-dasharray="2,2" />
          <line x1="30" y1="95" x2="360" y2="95" stroke="#cbd5e1" />
          <text x="24" y="24" font-size="8" fill="#94a3b8" text-anchor="end">18L</text>
          <text x="24" y="64" font-size="8" fill="#94a3b8" text-anchor="end">12L</text>
          <text x="24" y="98" font-size="8" fill="#94a3b8" text-anchor="end">6L</text>
          <path d="M 40 80 C 70 35, 100 20, 130 25 C 180 35, 250 65, 350 90" fill="none" stroke="#059669" stroke-width="3" stroke-linecap="round" />
          <circle cx="115" cy="22" r="4" fill="#f59e0b" stroke="#fff" stroke-width="1.5" />
          <text x="40" y="112" font-size="8" fill="#64748b" text-anchor="middle">Parto</text>
          <text x="115" y="112" font-size="8" fill="#64748b" text-anchor="middle">60 DEL</text>
          <text x="200" y="112" font-size="8" fill="#64748b" text-anchor="middle">150 DEL</text>
          <text x="280" y="112" font-size="8" fill="#64748b" text-anchor="middle">210 DEL (Secado)</text>
          <text x="350" y="112" font-size="8" fill="#64748b" text-anchor="middle">305 DEL</text>
        </svg>
      </div>
    `;
  }

  renderCategorias(catMap, total) {
    const entries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    return `
      <div class="space-y-2 py-1">
        ${entries.map(([c, n]) => {
          const pct = total > 0 ? ((n / total) * 100).toFixed(0) : 0;
          return `
            <div>
              <div class="flex justify-between text-xs font-bold text-slate-700 mb-0.5">
                <span>${c}</span>
                <span class="font-mono text-slate-500">${n} (${pct}%)</span>
              </div>
              <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div class="h-full bg-emerald-600 rounded-full" style="width: ${pct}%"></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  attachEvents() {
    if (!this.container) return;
    const sel = this.container.querySelector('#select-finca-dashboard');
    if (sel) {
      sel.addEventListener('change', (e) => {
        if (this.onCambiarFinca) {
          this.onCambiarFinca(e.target.value);
        }
      });
    }
  }
}
