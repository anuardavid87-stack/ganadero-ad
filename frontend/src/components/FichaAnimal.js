/**
 * GANADERO AD - FICHA ZOOTÉCNICA INDIVIDUAL DEL ANIMAL
 * Visualización completa del ejemplar: genealogía (padre, madre), días de preñez,
 * historial de partos, crías nacidas, pesajes previos, GDP e IEP.
 */

import { calcularDiasAbiertos, calcularDEL, calcularIEP, calcularEdadMeses } from '../core/zootecnia.js';

export class FichaAnimal {
  constructor({ containerId = 'modal-ficha-animal', onCerrar, onEditar, onEliminar, onTrasladar, onExtraer, onReactivar, getRol }) {
    this.containerId = containerId;
    this.container = typeof document !== 'undefined' ? document.getElementById(containerId) : null;
    this.onCerrar = onCerrar;
    this.onEditar = onEditar;
    this.onEliminar = onEliminar;
    this.onTrasladar = onTrasladar;
    this.onExtraer = onExtraer;
    this.onReactivar = onReactivar;
    this.getRol = getRol;
    this.animal = null;
    this.historialPartos = [];
    this.historialPesajes = [];
    this.historialServicios = [];
    this.modalExtraerAbierto = false;
  }

  abrir(animal, partos = [], pesajes = [], servicios = []) {
    return this.mostrar(animal, partos, pesajes, servicios);
  }

  mostrar(animal, partos = [], pesajes = [], servicios = []) {
    if (!this.container && typeof document !== 'undefined') {
      this.container = document.getElementById(this.containerId || 'modal-ficha-animal');
    }
    this.animal = animal;
    const tag = animal.identificacionTag || animal.numero;
    const tagUpper = String(tag || '').trim().toUpperCase();
    const animalIdStr = String(animal.id || '').trim();

    this.historialPartos = (partos || []).filter((p) => {
      if (!p) return false;
      if (!p.madreTag && !p.madreId) return true; // Si se pasó en la lista sintetizada de este animal
      const pMadreTag = String(p.madreTag || '').trim().toUpperCase();
      const pMadreId = String(p.madreId || '').trim();
      return (tagUpper && pMadreTag === tagUpper) || (animalIdStr && pMadreId === animalIdStr);
    });

    if (Array.isArray(animal.partosPrevios) && animal.partosPrevios.length > 0) {
      animal.partosPrevios.forEach((p) => {
        if (!p) return;
        const yaExiste = this.historialPartos.some((x) => 
          (x.tagCria && p.tagCria && String(x.tagCria).trim().toUpperCase() === String(p.tagCria).trim().toUpperCase()) ||
          ((x.fechaParto || x.fecha) && (p.fechaParto || p.fecha) && (x.fechaParto || x.fecha) === (p.fechaParto || p.fecha))
        );
        if (!yaExiste) {
          this.historialPartos.push(p);
        }
      });
    }

    // Si el animal tiene fechaUltimoParto registrada y no está en historialPartos, incorporarlo
    const fechaUltParto = animal.fechaUltimoParto || animal.ultimoParto;
    if (fechaUltParto) {
      const fNorm = String(fechaUltParto).trim();
      const yaExiste = this.historialPartos.some((x) => String(x.fechaParto || x.fecha || '').trim() === fNorm);
      if (!yaExiste) {
        this.historialPartos.unshift({
          madreId: animal.id,
          madreTag: tag,
          fechaParto: fNorm,
          fecha: fNorm,
          tagCria: animal.tagCria || animal.criaTag || 'Cría Registrada',
          sexoCria: animal.sexoCria || 'hembra',
          pesoAlNacerKg: animal.pesoCria || animal.pesoAlNacerKg || 32,
          tipoParto: animal.tipoParto || 'Normal (Eutócico)',
          observaciones: 'Parto registrado en ficha del animal'
        });
      }
    }
    this.historialPesajes = pesajes.filter(
      (ps) => ps.animalId === animal.id || ps.tag === tag
    );
    this.historialServicios = servicios.filter(
      (s) => s.animalId === animal.id || s.tag === tag || s.animalTag === tag
    );
    if (animal.serviciosReproductivos && animal.serviciosReproductivos.length > 0) {
      animal.serviciosReproductivos.forEach((s) => {
        if (!this.historialServicios.some((x) => x.id === s.id)) {
          this.historialServicios.push(s);
        }
      });
    }
    this.render();
  }

  cerrar() {
    this.animal = null;
    if (this.container) this.container.innerHTML = '';
    if (this.onCerrar) this.onCerrar();
  }

  render() {
    if (!this.container || !this.animal) return;

    const a = this.animal;
    const tag = a.identificacionTag || a.numero;
    const especie = a.especie || 'bovino';
    const edadMeses = calcularEdadMeses(a.fechaNacimiento);
    const edadAnios = (edadMeses / 12).toFixed(1);

    const fParto = a.fechaUltimoParto || a.ultimoParto;
    const diasAbiertos = calcularDiasAbiertos(fParto, a.estadoReproductivo);
    const del = calcularDEL(fParto, a.categoria);
    const iep = calcularIEP(diasAbiertos, especie);

    const estaPrenada = (a.estadoReproductivo || '').toLowerCase().includes('prenad') || (a.estadoReproductivo || '').toLowerCase().includes('preñad');
    const diasG = parseInt(a.diasGestacionActual || a.diasGestacion || 0);

    // Partos y crías registradas
    let partosRegistrados = Array.isArray(this.historialPartos) ? [...this.historialPartos] : [];
    if (fParto) {
      const fPartoNorm = String(fParto).trim();
      const yaExisteParto = partosRegistrados.some((p) => {
        const fp = String(p.fechaParto || p.fecha || '').trim();
        return fp === fPartoNorm;
      });
      if (!yaExisteParto) {
        partosRegistrados.unshift({
          madreId: a.id,
          madreTag: tag,
          fechaParto: fPartoNorm,
          fecha: fPartoNorm,
          tagCria: a.tagCria || a.criaTag || 'Cría Registrada',
          sexoCria: a.sexoCria || 'hembra',
          pesoAlNacerKg: a.pesoCria || a.pesoAlNacerKg || 32,
          tipoParto: a.tipoParto || 'Normal (Eutócico)',
          observaciones: 'Parto registrado en ficha del animal'
        });
        this.historialPartos = partosRegistrados;
      }
    }
    const rol = this.getRol ? this.getRol() : 'consultor';
    const esSoloConsulta = rol === 'consulta' || rol === 'consultor';

    this.container.innerHTML = `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-0 sm:p-5 overflow-y-auto">
        <div class="bg-white rounded-none sm:rounded-3xl shadow-2xl border border-slate-200 max-w-4xl w-full h-full sm:h-auto sm:max-h-[92vh] flex flex-col modal-fullscreen-mobile">
          <!-- CABECERA DE LA FICHA -->
          <div class="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
            <div class="flex items-center gap-3 sm:gap-4">
              <div class="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-2xl sm:text-3xl font-black shadow-inner shrink-0">
                ${especie === 'bufalino' ? '🦬' : '🐂'}
              </div>
              <div>
                <div class="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <span class="text-xl sm:text-2xl font-black font-mono tracking-tight text-white">
                    Arete: ${tag}
                  </span>
                  <span class="px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold ${especie === 'bufalino' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'}">
                    ${especie === 'bufalino' ? 'Bufalino' : 'Vacuno'}
                  </span>
                  ${(a.estadoVida === 'inactivo' || a.estado === 'inactivo' || a.motivoBaja) ? `
                    <span class="px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-black bg-rose-500/30 text-rose-300 border border-rose-500/50">
                      🚪 Extraído (${a.motivoBaja || 'Baja'})
                    </span>
                  ` : ''}
                </div>
                <h3 class="text-sm sm:text-base font-bold text-slate-200 mt-0.5">${a.nombreAlias || a.nombre || 'Sin Alias Asignado'}</h3>
                <p class="text-[11px] sm:text-xs text-slate-400 font-mono mt-0.5">${a.raza} • ${a.categoria} • Lote: ${a.lote}</p>
              </div>
            </div>

            <div class="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end shrink-0 flex-wrap pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
              ${!esSoloConsulta ? `
                ${(a.estadoVida === 'inactivo' || a.estado === 'inactivo' || a.motivoBaja) ? `
                  <button id="btn-ficha-reactivar-animal" class="flex-1 sm:flex-none px-3.5 py-2.5 sm:py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5 cursor-pointer" title="Activar nuevamente en este hato">
                    <span>🔄</span> Reactivar en el Hato
                  </button>
                ` : `
                  <button id="btn-ficha-extraer-animal" class="flex-1 sm:flex-none px-3.5 py-2.5 sm:py-2 bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-black text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5 cursor-pointer" title="Extraer animal por venta o muerte">
                    <span>🚪</span> Extraer Animal
                  </button>
                  <button id="btn-ficha-trasladar-animal" class="flex-1 sm:flex-none px-3.5 py-2.5 sm:py-2 bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5 cursor-pointer" title="Trasladar este animal a otra finca">
                    <span>🚚</span> Trasladar Finca
                  </button>
                `}
                <button id="btn-ficha-editar-animal" class="flex-1 sm:flex-none px-3.5 py-2.5 sm:py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5 cursor-pointer" title="Modificar datos de este ejemplar">
                  <span>✏️</span> Editar
                </button>
                <button id="btn-ficha-eliminar-animal" class="p-2.5 sm:px-3.5 sm:py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 hover:text-white border border-rose-500/40 font-bold text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5 cursor-pointer" title="Eliminar este animal del inventario">
                  <span>🗑️</span>
                </button>
              ` : ''}
              <button id="btn-cerrar-modal-ficha" class="p-2.5 sm:p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer" title="Cerrar Ficha">
                ✕
              </button>
            </div>
          </div>

          <!-- CONTENIDO SCROLLEABLE -->
          <div class="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-xs">
            ${(a.estadoVida === 'inactivo' || a.estado === 'inactivo' || a.motivoBaja) ? `
              <div class="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-black text-rose-900">🚪 ANIMAL EXTRAÍDO DEL HATO</span>
                    <span class="px-2 py-0.5 rounded-full font-mono text-[10px] font-black uppercase bg-rose-200 text-rose-900">${a.motivoBaja || 'Baja'}</span>
                  </div>
                  <div class="text-xs text-rose-800 font-medium mt-1">
                    ${(a.motivoBaja || '').toLowerCase() === 'venta' ? `
                      Vendido a: <strong>${a.compradorVenta || 'Comprador no registrado'}</strong> • Valor Venta: <strong>$${(parseFloat(a.valorVenta) || 0).toLocaleString('es-CO')} COP</strong> ${a.pesoVenta ? `• Peso: <strong>${a.pesoVenta} Kg</strong>` : ''} • Fecha: <strong>${a.fechaBaja || '-'}</strong>
                    ` : `
                      Motivo / Causa de Muerte: <strong>${a.motivoMuerte || 'Causa no especificada'}</strong> • Fecha: <strong>${a.fechaBaja || '-'}</strong>
                    `}
                  </div>
                </div>
                <button id="btn-ficha-banner-reactivar" class="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white font-black text-xs rounded-xl shadow transition cursor-pointer active:scale-95 shrink-0">
                  <span>🔄</span> Reactivar Ejemplar
                </button>
              </div>
            ` : ''}
            <!-- SECCIÓN 1: DATOS BÁSICOS & GENEALOGÍA -->
            <div>
              <h4 class="font-black text-slate-900 text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
                <span>🧬</span> Identidad y Genealogía (Pedigree)
              </h4>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div>
                  <span class="block text-slate-400 text-[10px] uppercase font-bold">Fecha Nacimiento</span>
                  <span class="font-bold text-slate-800">${a.fechaNacimiento || 'No registrada'}</span>
                  <span class="text-[10px] text-slate-500 block">Edad: ${edadMeses} meses (${edadAnios} años)</span>
                </div>
                <div>
                  <span class="block text-slate-400 text-[10px] uppercase font-bold">Sexo</span>
                  <span class="font-bold text-slate-800">${a.sexo === 'hembra' ? '♀️ Hembra' : '♂️ Macho'}</span>
                </div>
                <div>
                  <span class="block text-slate-400 text-[10px] uppercase font-bold">Padre (Toro)</span>
                  <span class="font-bold font-mono text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 inline-block mt-0.5">
                    ${a.padreTag || a.padre || 'Desconocido'}
                  </span>
                </div>
                <div>
                  <span class="block text-slate-400 text-[10px] uppercase font-bold">Madre (Vaca)</span>
                  <span class="font-bold font-mono text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 inline-block mt-0.5">
                    ${a.madreTag || a.madre || 'Desconocida'}
                  </span>
                </div>
              </div>
            </div>

            <!-- SECCIÓN 2: ESTADO REPRODUCTIVO Y DÍAS DE PREÑEZ -->
            <div>
              <h4 class="font-black text-slate-900 text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
                <span>⚡</span> Estado Reproductivo & Indicadores Zootécnicos
              </h4>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <!-- Tarjeta Preñez -->
                <div class="p-4 rounded-2xl border ${estaPrenada ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-slate-50'}">
                  <span class="text-[10px] font-bold uppercase text-slate-500 block">Diagnóstico Actual</span>
                  <div class="text-base font-black ${estaPrenada ? 'text-emerald-800' : 'text-slate-800'} mt-0.5">
                    ${estaPrenada ? '🟢 Preñada (Gestante)' : (a.estadoReproductivo || 'Vacía')}
                  </div>
                  ${estaPrenada ? `
                    <div class="mt-2 pt-2 border-t border-emerald-200">
                      <span class="text-xs font-bold text-emerald-900">Días de Preñez:</span>
                      <div class="text-xl font-black font-mono text-emerald-700">${diasG} días</div>
                      <div class="w-full h-2 bg-emerald-200 rounded-full mt-1.5 overflow-hidden">
                        <div class="h-full bg-emerald-600 rounded-full" style="width: ${Math.min(100, (diasG / 283) * 100)}%"></div>
                      </div>
                      <span class="text-[10px] text-emerald-700 block mt-1">${(diasG / 30.4).toFixed(1)} meses de gestación (~${283 - diasG} días al parto)</span>
                    </div>
                  ` : `
                    <span class="text-[10px] text-slate-400 block mt-1">Días Abiertos: ${diasAbiertos} días</span>
                  `}
                </div>

                <!-- Tarjeta Intervalo Entre Partos -->
                <div class="p-4 rounded-2xl border border-slate-200 bg-slate-50">
                  <span class="text-[10px] font-bold uppercase text-slate-500 block">Intervalo Entre Partos (IEP)</span>
                  <div class="text-base font-black text-slate-900 mt-0.5">
                    ${fParto ? `${iep.dias} Días` : 'Primerizo / Sin registro'}
                  </div>
                  <span class="text-[10px] text-slate-500 block mt-1">
                    ${fParto ? `Proyección: ${iep.meses} Meses entre partos` : 'Sin partos previos'}
                  </span>
                  <div class="mt-2 text-[10px] text-slate-400">
                    Último Parto: <strong>${fParto || 'No registra'}</strong>
                  </div>
                </div>

                <!-- Tarjeta Productiva (Peso & Leche) -->
                <div class="p-4 rounded-2xl border border-slate-200 bg-slate-50">
                  <span class="text-[10px] font-bold uppercase text-slate-500 block">Producción Actual</span>
                  <div class="text-base font-black text-slate-900 mt-0.5">
                    ${a.ultimoPesoKg || a.pesoActual ? `${a.ultimoPesoKg || a.pesoActual} kg` : '-'}
                  </div>
                  <span class="text-[10px] text-emerald-700 font-bold block mt-1">
                    GDP: ${a.gdpPromedioGDia !== undefined ? `${a.gdpPromedioGDia} g/d` : (a.gdpActual ? `${a.gdpActual} g/d` : 'No calculada')}
                  </span>
                  <div class="mt-2 text-[10px] text-slate-500">
                    Leche: <strong>${a.promedioLecheDiariaL || a.produccionLecheDiaria || 0} L/día</strong> ${del > 0 ? `(${del} DEL)` : ''}
                  </div>
                </div>
              </div>
            </div>

            <!-- SECCIÓN 3: HISTORIAL DE PARTOS Y CRÍAS -->
            <div>
              <div class="flex justify-between items-center mb-3">
                <h4 class="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                  <span>🍼</span> Historial de Partos y Crías (${partosRegistrados.length})
                </h4>
              </div>

              ${partosRegistrados.length > 0 ? `
                <div class="overflow-x-auto border border-slate-200 rounded-2xl">
                  <table class="w-full text-left text-xs">
                    <thead class="bg-slate-100 uppercase font-bold text-slate-700 text-[10px]">
                      <tr>
                        <th class="p-2.5">Fecha de Parto</th>
                        <th class="p-2.5">Tag de la Cría</th>
                        <th class="p-2.5">Sexo Cría</th>
                        <th class="p-2.5 text-right">Peso al Nacer</th>
                        <th class="p-2.5">Tipo de Parto</th>
                        <th class="p-2.5">Observaciones</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                      ${partosRegistrados.map((p) => `
                        <tr class="hover:bg-slate-50">
                          <td class="p-2.5 font-bold">${p.fechaParto || p.fecha}</td>
                          <td class="p-2.5 font-mono font-black text-emerald-800">${p.tagCria || p.tagCriaGenerado || p.criaId || 'Cría Registrada'}</td>
                          <td class="p-2.5">${(p.sexoCria || '').toLowerCase().includes('hembra') ? '♀️ Hembra' : '♂️ Macho'}</td>
                          <td class="p-2.5 text-right font-mono font-bold">${p.pesoAlNacerKg || p.pesoCria || p.pesoNacimientoKg || 32} kg</td>
                          <td class="p-2.5">${p.tipoParto || 'Normal (Eutócico)'}</td>
                          <td class="p-2.5 text-slate-500">${p.observaciones || 'Sin novedad'}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              ` : `
                <div class="p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center text-slate-400 text-xs">
                  Este ejemplar no tiene partos o crías registradas en su historial.
                </div>
              `}
            </div>

            <!-- SECCIÓN 4: HISTORIAL DE SERVICIOS REPRODUCTIVOS (IA / TE / MONTA) -->
            ${(a.sexo || '').toLowerCase() === 'hembra' ? `
              <div>
                <div class="flex justify-between items-center mb-3">
                  <h4 class="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                    <span>🧬</span> Historial de Inseminaciones, Embriones y Montas (${this.historialServicios.length})
                  </h4>
                </div>

                ${this.historialServicios.length > 0 ? `
                  <div class="overflow-x-auto border border-slate-200 rounded-2xl">
                    <table class="w-full text-left text-xs">
                      <thead class="bg-slate-100 uppercase font-bold text-slate-700 text-[10px]">
                        <tr>
                          <th class="p-2.5">Fecha</th>
                          <th class="p-2.5">Modalidad</th>
                          <th class="p-2.5">Toro / Pajilla / Donadora</th>
                          <th class="p-2.5">Técnico / Responsable</th>
                          <th class="p-2.5">Protocolo / Observación</th>
                          <th class="p-2.5">Resultado</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-100">
                        ${this.historialServicios.map((s) => {
                          let badgeTipo = 'bg-indigo-100 text-indigo-800';
                          let nomTipo = '💉 Inseminación Artificial';
                          if (s.tipo === 'transferencia_embriones') {
                            badgeTipo = 'bg-purple-100 text-purple-800';
                            nomTipo = '🔬 Transf. Embriones';
                          } else if (s.tipo === 'monta_natural') {
                            badgeTipo = 'bg-amber-100 text-amber-900';
                            nomTipo = '🐂 Servicio con Toro';
                          }

                          const st = s.resultado || 'Pendiente Chequeo';
                          let badgeSt = 'bg-amber-100 text-amber-800 border-amber-300';
                          if (st === 'Preñada Confirmada') badgeSt = 'bg-emerald-100 text-emerald-800 border-emerald-300';
                          if (st === 'Vacía / Repitió') badgeSt = 'bg-rose-100 text-rose-800 border-rose-300';

                          return `
                            <tr class="hover:bg-slate-50">
                              <td class="p-2.5 font-bold font-mono text-slate-800">${s.fecha}</td>
                              <td class="p-2.5">
                                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeTipo}">
                                  ${nomTipo}
                                </span>
                              </td>
                              <td class="p-2.5 font-bold text-slate-800">
                                ${s.reproductor || '-'}
                                ${s.donadora ? `<span class="block text-[10px] text-purple-700 font-normal">Donadora: ${s.donadora}</span>` : ''}
                              </td>
                              <td class="p-2.5 text-slate-600">${s.tecnico || '-'}</td>
                              <td class="p-2.5 text-slate-500">${s.protocolo || s.observaciones || '-'}</td>
                              <td class="p-2.5">
                                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeSt}">
                                  ${st}
                                </span>
                              </td>
                            </tr>
                          `;
                        }).join('')}
                      </tbody>
                    </table>
                  </div>
                ` : `
                  <div class="p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center text-slate-400 text-xs">
                    No se registran servicios reproductivos (IA, TE o Monta) para esta hembra.
                  </div>
                `}
              </div>
            ` : ''}

            <!-- SECCIÓN 5: HISTORIAL DE PESAJES -->
            <div>
              <div class="flex justify-between items-center mb-3">
                <h4 class="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                  <span>⚖️</span> Trazabilidad de Pesajes y Ganancia Ponderal (${this.historialPesajes.length})
                </h4>
              </div>

              <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-3">
                <div class="flex justify-between items-center text-xs text-slate-700">
                  <span>Último Pesaje Registrado: <strong>${a.fechaUltimoPesaje || a.ultimoPesajeFecha || 'Reciente'}</strong></span>
                  <span class="font-mono font-black text-base text-emerald-800">${a.ultimoPesoKg || a.pesoActual || 0} kg</span>
                </div>
                <div class="mt-2 text-[11px] text-slate-500">
                  Condición corporal actual evaluada: <strong>${a.condicionCorporal || '3.5 (Óptima)'}</strong>
                </div>
              </div>

              ${this.historialPesajes.length > 0 ? `
                <div class="overflow-x-auto border border-slate-200 rounded-2xl">
                  <table class="w-full text-left text-xs">
                    <thead class="bg-slate-100 uppercase font-bold text-slate-700 text-[10px]">
                      <tr>
                        <th class="p-2.5">Fecha</th>
                        <th class="p-2.5 text-right">Peso Registrado</th>
                        <th class="p-2.5 text-right">GDP</th>
                        <th class="p-2.5">Lote / Ubicación</th>
                        <th class="p-2.5">Responsable</th>
                        <th class="p-2.5">Observaciones</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                      ${this.historialPesajes.slice().sort((p1, p2) => (p2.fecha || '').localeCompare(p1.fecha || '')).map((ps) => {
                        const pNum = ps.pesoNuevo || ps.peso || 0;
                        return `
                          <tr class="hover:bg-slate-50">
                            <td class="p-2.5 font-bold font-mono text-slate-800">${ps.fecha || '-'}</td>
                            <td class="p-2.5 text-right font-mono font-black text-emerald-800">${pNum} kg</td>
                            <td class="p-2.5 text-right font-mono font-bold ${ps.gdp ? (Number(ps.gdp) >= 0 ? 'text-emerald-700' : 'text-rose-700') : 'text-slate-400'}">
                              ${ps.gdp ? `${ps.gdp > 0 ? '+' : ''}${ps.gdp} g/d` : '-'}
                            </td>
                            <td class="p-2.5 font-mono text-slate-600">${ps.lote || a.lote || 'General'}</td>
                            <td class="p-2.5 text-slate-600">${ps.responsable || 'Báscula'}</td>
                            <td class="p-2.5 text-slate-500">${ps.observaciones || '-'}</td>
                          </tr>
                        `;
                      }).join('')}
                    </tbody>
                  </table>
                </div>
              ` : ''}
            </div>

            <!-- SECCIÓN 6: HISTORIAL DE PALPACIONES, CONTROLES DE LECHE Y LABORES DE CAMPO -->
            <div>
              <div class="flex justify-between items-center mb-3">
                <h4 class="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                  <span>🩺</span> Palpaciones, Controles de Leche, Destetes y Bitácora (${(a.historialEventos || []).length})
                </h4>
              </div>

              ${Array.isArray(a.historialEventos) && a.historialEventos.length > 0 ? `
                <div class="overflow-x-auto border border-slate-200 rounded-2xl">
                  <table class="w-full text-left text-xs">
                    <thead class="bg-slate-100 uppercase font-bold text-slate-700 text-[10px]">
                      <tr>
                        <th class="p-2.5">Fecha</th>
                        <th class="p-2.5">Labor / Evento</th>
                        <th class="p-2.5">Resultado / Detalle Zootécnico</th>
                        <th class="p-2.5">Responsable / Profesional</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                      ${a.historialEventos.map((ev) => {
                        let badgeTipo = 'bg-slate-100 text-slate-800';
                        let tituloTipo = ev.tipo || 'Evento';
                        let detalleEv = '';

                        if (ev.tipo === 'palpacion') {
                          badgeTipo = 'bg-rose-100 text-rose-800 border border-rose-200';
                          tituloTipo = '🩺 Palpación Ginecológica';
                          detalleEv = `<strong>${ev.resultado || 'Diagnóstico'}</strong> ${ev.diasGestacion ? `• ${ev.diasGestacion} días gestación` : ''} ${ev.diagnostico || ev.estructuraOvario ? `(${ev.diagnostico || ev.estructuraOvario})` : ''}`;
                        } else if (ev.tipo === 'pesaje_leche') {
                          badgeTipo = 'bg-cyan-100 text-cyan-800 border border-cyan-200';
                          tituloTipo = '🥛 Control Lechero';
                          detalleEv = `Producción: <strong>${ev.litros || 0} L</strong> ${ev.jornada ? `• Jornada ${ev.jornada}` : ''} ${ev.grasa ? `• Grasa: ${ev.grasa}%` : ''} ${ev.proteina ? `• Proteína: ${ev.proteina}%` : ''}`;
                        } else if (ev.tipo === 'destete') {
                          badgeTipo = 'bg-orange-100 text-orange-800 border border-orange-200';
                          tituloTipo = '🌾 Destete';
                          detalleEv = `Destete completado ${ev.pesoDestete ? `• Peso: <strong>${ev.pesoDestete} kg</strong>` : ''} ${ev.loteDestino ? `• Asignado a: <strong>${ev.loteDestino}</strong>` : ''}`;
                        } else if (ev.tipo === 'parto') {
                          badgeTipo = 'bg-amber-100 text-amber-800 border border-amber-200';
                          tituloTipo = '🍼 Parto';
                          detalleEv = `Cría: <strong>${ev.criaTag || 'S/N'}</strong> (${ev.sexoCria || 'Cría'}) ${ev.pesoAlNacerKg ? `• Peso al nacer: ${ev.pesoAlNacerKg} kg` : ''} ${ev.tipoParto ? `• Parto: ${ev.tipoParto}` : ''}`;
                        } else {
                          detalleEv = ev.detalle || ev.observaciones || '-';
                        }

                        return `
                          <tr class="hover:bg-slate-50">
                            <td class="p-2.5 font-bold font-mono text-slate-800 whitespace-nowrap">${ev.fecha || '-'}</td>
                            <td class="p-2.5 whitespace-nowrap">
                              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeTipo}">
                                ${tituloTipo}
                              </span>
                            </td>
                            <td class="p-2.5 text-slate-700">${detalleEv}</td>
                            <td class="p-2.5 text-slate-500 whitespace-nowrap">${ev.responsable || ev.veterinario || 'Veterinario / Operario'}</td>
                          </tr>
                        `;
                      }).join('')}
                    </tbody>
                  </table>
                </div>
              ` : `
                <div class="p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center text-slate-400 text-xs">
                  No se registran eventos adicionales de campo (palpaciones, leche o destetes) para este ejemplar.
                </div>
              `}
            </div>
          </div>

          <!-- PIE DE LA FICHA -->
          <div class="bg-slate-50 p-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-3">
            <div>
              ${!esSoloConsulta ? `
                <button id="btn-ficha-editar-animal-footer" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer">
                  <span>✏️</span> Modificar Datos de este Animal
                </button>
              ` : '<span class="text-xs text-slate-400 italic">Modo sólo lectura (Consultor)</span>'}
            </div>
            <button id="btn-cerrar-ficha-footer" class="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow transition cursor-pointer">
              Cerrar Ficha
            </button>
          </div>
        </div>

        <!-- MODAL DE EXTRACCIÓN (VENTA O MUERTE) -->
        ${this.modalExtraerAbierto ? this.renderModalExtraer() : ''}
      </div>
    `;

    this.attachEvents();
  }

  renderModalExtraer() {
    const a = this.animal;
    const tag = a.identificacionTag || a.numero;
    const hoy = new Date().toISOString().split('T')[0];

    return `
      <div id="modal-extraer-animal" class="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[60] flex items-center justify-center p-3 sm:p-5">
        <div class="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-fadeIn">
          <div class="bg-gradient-to-r from-amber-900 via-amber-800 to-amber-900 text-white p-5 flex justify-between items-center">
            <div class="flex items-center gap-3">
              <span class="text-2xl">🚪</span>
              <div>
                <h3 class="font-black text-base">Extraer Animal: ${tag}</h3>
                <p class="text-xs text-amber-200 mt-0.5">Registre la salida del ejemplar por venta o muerte.</p>
              </div>
            </div>
            <button id="btn-cerrar-modal-extraer" class="text-amber-200 hover:text-white text-lg font-bold cursor-pointer">✕</button>
          </div>

          <div class="p-5 sm:p-6 space-y-4 text-xs">
            <div>
              <label class="block font-black text-slate-800 uppercase tracking-wider text-[11px] mb-2">Motivo de Extracción:</label>
              <div class="grid grid-cols-2 gap-3">
                <label class="flex items-center justify-center gap-2 p-3 rounded-2xl border-2 border-emerald-500 bg-emerald-50/60 font-black cursor-pointer text-emerald-950">
                  <input type="radio" name="radio-motivo-extraccion" value="Venta" checked class="text-emerald-600">
                  <span>💰 Por Venta</span>
                </label>
                <label class="flex items-center justify-center gap-2 p-3 rounded-2xl border-2 border-slate-200 bg-slate-50 font-black cursor-pointer text-slate-800">
                  <input type="radio" name="radio-motivo-extraccion" value="Muerte" class="text-rose-600">
                  <span>💀 Por Muerte</span>
                </label>
              </div>
            </div>

            <!-- Campos para Venta -->
            <div id="seccion-extraer-venta" class="space-y-3 bg-amber-50/60 p-4 rounded-2xl border border-amber-200">
              <div>
                <label class="block font-bold text-slate-800 mb-1">¿A quién se le vendió? (Comprador):</label>
                <input type="text" id="input-extraer-comprador" placeholder="Ej. Frigorífico, Subasta, Don Carlos..." class="w-full px-3 py-2 bg-white rounded-xl border border-slate-300 font-bold outline-none text-xs">
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block font-bold text-slate-800 mb-1">Valor Venta ($ COP):</label>
                  <input type="number" id="input-extraer-valor" placeholder="Ej. 3500000" class="w-full px-3 py-2 bg-white rounded-xl border border-slate-300 font-bold font-mono text-emerald-800 outline-none text-xs">
                </div>
                <div>
                  <label class="block font-bold text-slate-800 mb-1">Peso Venta (kg):</label>
                  <input type="number" step="0.5" id="input-extraer-peso" value="${a.ultimoPesoKg || ''}" placeholder="Ej. 480" class="w-full px-3 py-2 bg-white rounded-xl border border-slate-300 font-bold font-mono outline-none text-xs">
                </div>
              </div>
              <p class="text-[10px] text-amber-900 font-medium">💡 Este valor se sumará a los ingresos financieros de la finca.</p>
            </div>

            <!-- Campos para Muerte -->
            <div id="seccion-extraer-muerte" class="space-y-3 bg-rose-50/60 p-4 rounded-2xl border border-rose-200 hidden">
              <div>
                <label class="block font-bold text-slate-800 mb-1">Cuadro de Motivo / Causa de la Muerte *:</label>
                <textarea id="input-extraer-causa-muerte" rows="3" placeholder="Describa en este cuadro el motivo o causa de la muerte (ej. Timpanismo agudo, picadura de serpiente, infarto, enfermedad, accidente, diagnóstico veterinario)..." class="w-full px-3 py-2 bg-white rounded-xl border border-slate-300 font-medium outline-none text-xs resize-none focus:border-rose-500"></textarea>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-800 mb-1">Fecha del Suceso:</label>
                <input type="date" id="input-extraer-fecha" value="${hoy}" class="w-full px-3 py-2 bg-white rounded-xl border border-slate-300 font-bold outline-none text-xs">
              </div>
              <div>
                <label class="block font-bold text-slate-800 mb-1">Observaciones:</label>
                <input type="text" id="input-extraer-obs" placeholder="Detalles de la baja..." class="w-full px-3 py-2 bg-white rounded-xl border border-slate-300 text-xs outline-none">
              </div>
            </div>

            <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button id="btn-cancelar-modal-extraer" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer">
                Cancelar
              </button>
              <button id="btn-confirmar-modal-extraer" class="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-xl text-xs shadow-md transition cursor-pointer active:scale-95">
                Confirmar Extracción
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  attachEvents() {
    const btnCerrar = this.container.querySelector('#btn-cerrar-modal-ficha');
    if (btnCerrar) btnCerrar.addEventListener('click', () => this.cerrar());

    const btnFooter = this.container.querySelector('#btn-cerrar-ficha-footer');
    if (btnFooter) btnFooter.addEventListener('click', () => this.cerrar());

    const btnEditar = this.container.querySelector('#btn-ficha-editar-animal');
    if (btnEditar) {
      btnEditar.addEventListener('click', () => {
        if (this.onEditar) this.onEditar(this.animal);
      });
    }

    const btnEditarFooter = this.container.querySelector('#btn-ficha-editar-animal-footer');
    if (btnEditarFooter) {
      btnEditarFooter.addEventListener('click', () => {
        if (this.onEditar) this.onEditar(this.animal);
      });
    }

    const btnEliminar = this.container.querySelector('#btn-ficha-eliminar-animal');
    if (btnEliminar) {
      btnEliminar.addEventListener('click', () => {
        const tag = this.animal.identificacionTag || this.animal.numero;
        if (confirm(`¿Estás seguro de eliminar permanentemente al ejemplar ${tag} del inventario?`)) {
          if (this.onEliminar) this.onEliminar(this.animal.id);
        }
      });
    }

    const btnTrasladar = this.container.querySelector('#btn-ficha-trasladar-animal');
    if (btnTrasladar) {
      btnTrasladar.addEventListener('click', () => {
        if (this.onTrasladar) this.onTrasladar(this.animal);
      });
    }

    // Botón abrir modal de extracción
    const btnExtraer = this.container.querySelector('#btn-ficha-extraer-animal');
    if (btnExtraer) {
      btnExtraer.addEventListener('click', () => {
        this.modalExtraerAbierto = true;
        this.render();
      });
    }

    // Botones de reactivación
    const ejecutarReactivacion = () => {
      const tag = this.animal.identificacionTag || this.animal.numero;
      if (confirm(`¿Deseas activar nuevamente al animal ${tag} en este hato?`)) {
        if (this.onReactivar) {
          this.onReactivar(this.animal);
          this.cerrar();
        }
      }
    };

    const btnReactivar = this.container.querySelector('#btn-ficha-reactivar-animal');
    if (btnReactivar) btnReactivar.addEventListener('click', ejecutarReactivacion);

    const btnBannerReactivar = this.container.querySelector('#btn-ficha-banner-reactivar');
    if (btnBannerReactivar) btnBannerReactivar.addEventListener('click', ejecutarReactivacion);

    // Eventos dentro del modal de extracción
    if (this.modalExtraerAbierto) {
      const btnCerrarExtraer = this.container.querySelector('#btn-cerrar-modal-extraer');
      const btnCancelExtraer = this.container.querySelector('#btn-cancelar-modal-extraer');
      const cerrarModalExtraer = () => {
        this.modalExtraerAbierto = false;
        this.render();
      };
      if (btnCerrarExtraer) btnCerrarExtraer.addEventListener('click', cerrarModalExtraer);
      if (btnCancelExtraer) btnCancelExtraer.addEventListener('click', cerrarModalExtraer);

      const secVenta = this.container.querySelector('#seccion-extraer-venta');
      const secMuerte = this.container.querySelector('#seccion-extraer-muerte');
      const radios = this.container.querySelectorAll('input[name="radio-motivo-extraccion"]');

      radios.forEach((r) => {
        r.addEventListener('change', () => {
          if (r.value === 'Venta') {
            if (secVenta) secVenta.classList.remove('hidden');
            if (secMuerte) secMuerte.classList.add('hidden');
          } else {
            if (secVenta) secVenta.classList.add('hidden');
            if (secMuerte) secMuerte.classList.remove('hidden');
          }
        });
      });

      const btnConfirmarExtraer = this.container.querySelector('#btn-confirmar-modal-extraer');
      if (btnConfirmarExtraer) {
        btnConfirmarExtraer.addEventListener('click', () => {
          let motivo = 'Venta';
          radios.forEach((rd) => { if (rd.checked) motivo = rd.value; });

          const fecha = this.container.querySelector('#input-extraer-fecha')?.value || new Date().toISOString().split('T')[0];
          const observaciones = (this.container.querySelector('#input-extraer-obs')?.value || '').trim();

          const datos = {
            motivo,
            fecha,
            observaciones
          };

          if (motivo === 'Venta') {
            const comprador = (this.container.querySelector('#input-extraer-comprador')?.value || '').trim() || 'Cliente Particular';
            const valorVenta = parseFloat(this.container.querySelector('#input-extraer-valor')?.value) || 0;
            const pesoVenta = parseFloat(this.container.querySelector('#input-extraer-peso')?.value) || this.animal.ultimoPesoKg || null;
            datos.comprador = comprador;
            datos.valorVenta = valorVenta;
            datos.pesoVenta = pesoVenta;
          } else {
            const causa = (this.container.querySelector('#input-extraer-causa-muerte')?.value || '').trim() || 'Causa no especificada';
            datos.motivoMuerte = causa;
          }

          if (this.onExtraer) {
            this.onExtraer(this.animal, datos);
          }
          this.modalExtraerAbierto = false;
          this.cerrar();
        });
      }
    }
  }
}
