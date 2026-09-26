/**
 * GANADERO AD - PANEL DE ALERTAS ZOOTÉCNICAS E IA
 * Notificaciones destacadas para animales improductivos, sanidad y auditoría.
 */

import { detectarAlertasZootecnicas } from '../core/auditorIA.js';

export class PanelAlertas {
  constructor({ containerId, getAnimales, onAccionZootecnica }) {
    this.container = document.getElementById(containerId);
    this.getAnimales = getAnimales;
    this.onAccionZootecnica = onAccionZootecnica;
    this.filtroSeveridad = 'todas'; // 'todas' | 'critica' | 'advertencia' | 'sanidad_preventiva'
    this.alertasResueltas = new Set();
  }

  init() {
    this.render();
  }

  resolverAlerta(id) {
    this.alertasResueltas.add(id);
    this.render();
  }

  obtenerAlertas() {
    const todos = this.getAnimales ? this.getAnimales() : [];
    const lista = detectarAlertasZootecnicas(todos);
    return lista.filter((a) => !this.alertasResueltas.has(a.id));
  }

  render() {
    if (!this.container) return;

    const alertas = this.obtenerAlertas();
    const criticas = alertas.filter((a) => a.severidad === 'critica');
    const advertencias = alertas.filter((a) => a.severidad === 'advertencia');
    const sanidad = alertas.filter((a) => a.severidad === 'sanidad_preventiva');

    let mostradas = alertas;
    if (this.filtroSeveridad !== 'todas') {
      mostradas = alertas.filter((a) => a.severidad === this.filtroSeveridad);
    }

    this.container.innerHTML = `
      <div class="space-y-4">
        <!-- HEADER DE ALERTAS INTELIGENTES -->
        <div class="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white p-5 rounded-2xl shadow-xl border border-slate-800">
          <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center text-2xl shadow">
                🚨
              </div>
              <div>
                <h2 class="text-base sm:text-xl font-black tracking-tight flex items-center gap-2">
                  Panel de Alertas Inteligentes & Auditoría IA
                  <span class="text-[10px] px-2.5 py-0.5 rounded-full bg-rose-600 text-white font-mono font-bold">${alertas.length} ACTIVAS</span>
                </h2>
                <p class="text-xs text-slate-400">Detección de animales improductivos, días abiertos excesivos y vacas próximas al secado.</p>
              </div>
            </div>

            <!-- FILTROS POR SEVERIDAD -->
            <div class="flex items-center gap-1.5 bg-slate-800/80 p-1.5 rounded-xl border border-slate-700 text-xs w-full md:w-auto overflow-x-auto">
              <button class="btn-filtro-alerta px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${this.filtroSeveridad === 'todas' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:text-white'}" data-sev="todas">
                Todas (${alertas.length})
              </button>
              <button class="btn-filtro-alerta px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${this.filtroSeveridad === 'critica' ? 'bg-rose-600 text-white' : 'text-rose-300 hover:text-white'}" data-sev="critica">
                🔴 Críticas (${criticas.length})
              </button>
              <button class="btn-filtro-alerta px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${this.filtroSeveridad === 'advertencia' ? 'bg-amber-600 text-white' : 'text-amber-300 hover:text-white'}" data-sev="advertencia">
                🟡 Advertencias (${advertencias.length})
              </button>
              <button class="btn-filtro-alerta px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${this.filtroSeveridad === 'sanidad_preventiva' ? 'bg-sky-600 text-white' : 'text-sky-300 hover:text-white'}" data-sev="sanidad_preventiva">
                🔵 Secado 7 Meses (${sanidad.length})
              </button>
            </div>
          </div>

          <!-- RESUMEN DE LOS 4 PILARES ZOOTÉCNICOS REQUERIDOS -->
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-800 text-xs">
            <div class="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
              <span class="text-slate-400 block text-[10px] uppercase font-bold">1. Crecimiento (GDP &lt; 300g/d)</span>
              <span class="text-xl font-black text-rose-400">
                ${alertas.filter((a) => a.tipo === 'crecimiento_bajo_gdp').length} <span class="text-xs text-slate-400 font-normal">animales</span>
              </span>
            </div>
            <div class="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
              <span class="text-slate-400 block text-[10px] uppercase font-bold">2. Vacas Vacías (&gt; 200 Días)</span>
              <span class="text-xl font-black text-rose-400">
                ${alertas.filter((a) => a.tipo === 'vaca_vacia_dias_abiertos').length} <span class="text-xs text-slate-400 font-normal">vientres</span>
              </span>
            </div>
            <div class="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
              <span class="text-slate-400 block text-[10px] uppercase font-bold">3. Novillas Vacías (&gt; 36 Meses)</span>
              <span class="text-xl font-black text-amber-400">
                ${alertas.filter((a) => a.tipo === 'novilla_vacia_edad').length} <span class="text-xs text-slate-400 font-normal">novillas</span>
              </span>
            </div>
            <div class="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
              <span class="text-slate-400 block text-[10px] uppercase font-bold">4. Secado Gestación (~7 Meses)</span>
              <span class="text-xl font-black text-sky-400">
                ${alertas.filter((a) => a.tipo === 'secado_7_meses').length} <span class="text-xs text-slate-400 font-normal">vacas</span>
              </span>
            </div>
          </div>
        </div>

        <!-- LISTA DE TARJETAS DE ALERTA -->
        <div class="space-y-3">
          ${mostradas.length > 0 ? mostradas.map((a) => this.renderTarjeta(a)).join('') : `
            <div class="bg-white p-12 rounded-2xl border border-slate-200 text-center shadow-sm">
              <div class="w-16 h-16 mx-auto mb-3 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-3xl">
                ✨
              </div>
              <h3 class="text-base font-black text-slate-800">Sin Alertas en esta Categoría</h3>
              <p class="text-xs text-slate-500 mt-1 max-w-md mx-auto">Los animales cumplen los estándares zootécnicos establecidos.</p>
            </div>
          `}
        </div>
      </div>
    `;

    this.attachEvents();
  }

  renderTarjeta(a) {
    let badge = '';
    let border = 'border-slate-200';
    let bgHeader = 'bg-slate-50';

    if (a.severidad === 'critica') {
      badge = '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-800 border border-rose-200">Crítica</span>';
      border = 'border-rose-200';
      bgHeader = 'bg-rose-50/50';
    } else if (a.severidad === 'advertencia') {
      badge = '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-200">Advertencia</span>';
      border = 'border-amber-200';
      bgHeader = 'bg-amber-50/50';
    } else {
      badge = '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-sky-100 text-sky-800 border border-sky-200">Preventiva</span>';
      border = 'border-sky-200';
      bgHeader = 'bg-sky-50/50';
    }

    return `
      <div class="bg-white rounded-2xl border ${border} shadow-md hover:shadow-lg transition overflow-hidden">
        <div class="${bgHeader} p-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div class="flex items-center gap-3">
            <span class="font-mono font-black text-slate-900 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-sm shadow-sm">
              Tag: ${a.tag}
            </span>
            <div>
              <div class="flex items-center gap-2">
                <span class="font-bold text-slate-800 text-sm">${a.nombre}</span>
                <span class="text-xs text-slate-400">• ${a.categoria}</span>
                <span class="text-xs text-slate-400">• ${a.lote}</span>
              </div>
              <h4 class="font-black text-slate-900 text-sm mt-0.5">${a.titulo}</h4>
            </div>
          </div>
          <div>${badge}</div>
        </div>

        <div class="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div class="space-y-1.5 max-w-2xl">
            <p class="text-xs text-slate-600 leading-relaxed">${a.mensaje}</p>
            <div class="flex flex-wrap items-center gap-2 text-xs pt-1">
              <span class="bg-slate-100 px-2 py-0.5 rounded font-mono text-slate-700 font-bold">Detectado: <strong>${a.valorMedido}</strong></span>
              <span class="bg-slate-100 px-2 py-0.5 rounded font-mono text-slate-700 font-bold">Meta: <strong>${a.valorLimite}</strong></span>
              <span class="text-emerald-700 font-medium">💡 ${a.accionRecomendada}</span>
            </div>
          </div>

          <div class="flex items-center gap-2 w-full md:w-auto justify-end border-t md:border-t-0 pt-3 md:pt-0">
            <button class="btn-resolver-alerta px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs border border-slate-200 transition" data-id="${a.id}">
              ✓ Marcar Resuelta
            </button>
            <button class="btn-accion-directa px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs shadow transition active:scale-95" data-animal="${a.animalId}" data-tipo="${a.tipo}">
              ⚡ Tomar Acción
            </button>
          </div>
        </div>
      </div>
    `;
  }

  attachEvents() {
    this.container.querySelectorAll('.btn-filtro-alerta').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        this.filtroSeveridad = e.currentTarget.getAttribute('data-sev');
        this.render();
      });
    });

    this.container.querySelectorAll('.btn-resolver-alerta').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        this.resolverAlerta(e.currentTarget.getAttribute('data-id'));
      });
    });

    this.container.querySelectorAll('.btn-accion-directa').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const animalId = e.currentTarget.getAttribute('data-animal');
        const tipo = e.currentTarget.getAttribute('data-tipo');
        if (this.onAccionZootecnica) {
          this.onAccionZootecnica({ animalId, tipo });
        }
      });
    });
  }
}
