/**
 * GANADERO AD - SELECTOR UNIVERSAL DE FECHAS EN FORMATO DÍA/MES/AÑO (DD/MM/AAAA)
 * Garantiza que el 100% de los campos <input type="date"> del sistema muestren y reciban
 * siempre el formato DD/MM/AAAA (día/mes/año) sin importar el idioma del navegador o sistema
 * operativo (evitando MM/DD/YYYY en Windows/Chrome/Android en inglés), manteniendo el valor
 * interno ISO (YYYY-MM-DD) para compatibilidad total con cálculos y PostgreSQL/Supabase.
 */

import { formatearFecha, convertirFechaAISO } from '../core/zootecnia.js';

/**
 * Aplica máscara progresiva DD/MM/AAAA mientras el usuario escribe dígitos.
 */
export function aplicarMascaraFechaDMY(textoCrudo = '') {
  const limpio = String(textoCrudo || '').trim();
  // Si el usuario escribió separadores explícitos (ej. 5/9/2026), respetar mientras edita
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{0,4}$/.test(limpio)) {
    return limpio.replace(/-/g, '/').slice(0, 10);
  }
  const digitos = limpio.replace(/\D/g, '').slice(0, 8);
  if (digitos.length <= 2) return digitos;
  if (digitos.length <= 4) return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
  return `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4, 8)}`;
}

/**
 * Mejora un único <input type="date"> para mostrar siempre DD/MM/AAAA + botón de calendario.
 */
export function mejorarInputFechaDMY(dateInput) {
  if (!dateInput || dateInput.nodeType !== 1) return null;
  if (dateInput.dataset && dateInput.dataset.dmyEnhanced === '1') {
    if (typeof dateInput._sincronizarVistaDMY === 'function') {
      dateInput._sincronizarVistaDMY();
    }
    return dateInput;
  }

  const doc = dateInput.ownerDocument;
  if (!doc || !dateInput.parentNode) return null;

  dateInput.dataset.dmyEnhanced = '1';

  const clasesOriginales = dateInput.className || '';
  const tieneAnchoCompleto = /\bw-full\b/.test(clasesOriginales);

  const wrapper = doc.createElement('div');
  wrapper.className = `bovi-dmy-wrapper relative inline-flex items-center ${tieneAnchoCompleto ? 'w-full' : ''}`.trim();

  const textInput = doc.createElement('input');
  textInput.type = 'text';
  textInput.inputMode = 'numeric';
  textInput.autocomplete = 'off';
  textInput.maxLength = 10;
  textInput.placeholder = 'dd/mm/aaaa';
  textInput.title = dateInput.title ? `${dateInput.title} (Día/Mes/Año)` : 'Formato día/mes/año (DD/MM/AAAA)';
  textInput.className = `${clasesOriginales} bovi-dmy-display pr-8`.trim();
  if (dateInput.id) {
    textInput.dataset.dmyFor = dateInput.id;
  }
  if (dateInput.disabled) textInput.disabled = true;
  if (dateInput.readOnly) textInput.readOnly = true;
  if (dateInput.required) textInput.required = true;

  const calBtn = doc.createElement('button');
  calBtn.type = 'button';
  calBtn.tabIndex = -1;
  calBtn.className = 'bovi-dmy-cal-btn';
  calBtn.title = 'Elegir fecha en calendario (día/mes/año)';
  calBtn.setAttribute('aria-label', 'Abrir calendario');
  calBtn.textContent = '📅';

  // Insertar wrapper en la posición exacta del input original
  dateInput.parentNode.insertBefore(wrapper, dateInput);
  wrapper.appendChild(textInput);
  wrapper.appendChild(dateInput);
  wrapper.appendChild(calBtn);

  // Ocultar visualmente el picker nativo sin perder capacidad de showPicker() ni su ID/value
  dateInput.className = 'bovi-dmy-native-picker';
  dateInput.tabIndex = -1;
  dateInput.setAttribute('aria-hidden', 'true');

  // Descriptor nativo de HTMLInputElement.prototype.value para interceptar asignaciones JS
  const proto = doc.defaultView ? doc.defaultView.HTMLInputElement?.prototype : (typeof HTMLInputElement !== 'undefined' ? HTMLInputElement.prototype : null);
  const nativeDesc = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;

  const leerValorNativo = () => {
    if (nativeDesc && typeof nativeDesc.get === 'function') {
      return nativeDesc.get.call(dateInput);
    }
    return dateInput.getAttribute('value') || '';
  };

  const escribirValorNativo = (nuevoVal) => {
    const str = nuevoVal === null || nuevoVal === undefined ? '' : String(nuevoVal).trim();
    const iso = str ? (convertirFechaAISO(str) || str) : '';
    if (nativeDesc && typeof nativeDesc.set === 'function') {
      nativeDesc.set.call(dateInput, iso);
    } else {
      dateInput.setAttribute('value', iso);
    }
    const dmy = iso ? formatearFecha(iso, '') : '';
    dateInput.dataset.valorDmy = dmy;
    if (doc.activeElement !== textInput) {
      textInput.value = dmy;
    } else if (dmy && convertirFechaAISO(textInput.value) === iso && textInput.value.length === 10) {
      textInput.value = dmy;
    } else if (!iso && !textInput.value) {
      textInput.value = '';
    }
  };

  if (nativeDesc && nativeDesc.configurable !== false) {
    try {
      Object.defineProperty(dateInput, 'value', {
        configurable: true,
        enumerable: true,
        get() {
          return leerValorNativo();
        },
        set(v) {
          escribirValorNativo(v);
        }
      });
    } catch (_) {
      // Ignorar en entornos restringidos
    }
  }

  const sincronizarVistaDesdeNativo = () => {
    const valActual = leerValorNativo();
    const dmy = valActual ? formatearFecha(valActual, '') : '';
    dateInput.dataset.valorDmy = dmy;
    textInput.value = dmy;
    textInput.disabled = Boolean(dateInput.disabled);
    textInput.readOnly = Boolean(dateInput.readOnly);
  };

  dateInput._sincronizarVistaDMY = sincronizarVistaDesdeNativo;
  sincronizarVistaDesdeNativo();

  let disparandoInterno = false;
  const emitirCambioNativo = (isoNuevo) => {
    const actual = leerValorNativo();
    if (actual === isoNuevo) return;
    disparandoInterno = true;
    try {
      if (nativeDesc && typeof nativeDesc.set === 'function') {
        nativeDesc.set.call(dateInput, isoNuevo);
      } else {
        dateInput.setAttribute('value', isoNuevo);
      }
      dateInput.dataset.valorDmy = isoNuevo ? formatearFecha(isoNuevo, '') : '';
      const Ev = (doc.defaultView && doc.defaultView.Event) || Event;
      dateInput.dispatchEvent(new Ev('input', { bubbles: true }));
      dateInput.dispatchEvent(new Ev('change', { bubbles: true }));
    } finally {
      disparandoInterno = false;
    }
  };

  // Cuando el usuario escribe DD/MM/AAAA
  textInput.addEventListener('input', () => {
    const enmascarado = aplicarMascaraFechaDMY(textInput.value);
    if (textInput.value !== enmascarado) {
      textInput.value = enmascarado;
    }
    if (enmascarado === '') {
      if (!dateInput.required) {
        emitirCambioNativo('');
      }
      return;
    }
    if (enmascarado.length >= 8) {
      const iso = convertirFechaAISO(enmascarado);
      if (iso && enmascarado.length === 10) {
        emitirCambioNativo(iso);
      }
    }
  });

  // Al salir del campo: normalizar ej. 5/11/2026 -> 05/11/2026 o restaurar si es inválido
  textInput.addEventListener('blur', () => {
    const txt = String(textInput.value || '').trim();
    if (!txt) {
      if (!dateInput.required) {
        emitirCambioNativo('');
        textInput.value = '';
      } else {
        sincronizarVistaDesdeNativo();
      }
      return;
    }
    const iso = convertirFechaAISO(txt);
    if (iso) {
      textInput.value = formatearFecha(iso, '');
      emitirCambioNativo(iso);
    } else {
      sincronizarVistaDesdeNativo();
    }
  });

  textInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      const iso = convertirFechaAISO(textInput.value);
      if (iso) {
        textInput.value = formatearFecha(iso, '');
        emitirCambioNativo(iso);
      }
    }
  });

  // Cuando cambia el <input type="date"> nativo (desde showPicker() o código externo)
  const alCambiarNativo = () => {
    if (disparandoInterno) return;
    sincronizarVistaDesdeNativo();
  };
  dateInput.addEventListener('input', alCambiarNativo);
  dateInput.addEventListener('change', alCambiarNativo);

  // Botón de calendario abre el selector nativo del sistema
  calBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (dateInput.disabled || dateInput.readOnly) return;
    try {
      if (typeof dateInput.showPicker === 'function') {
        dateInput.showPicker();
        return;
      }
    } catch (_) {
      // Fallback para navegadores sin showPicker
    }
    textInput.focus();
    textInput.select();
  });

  return dateInput;
}

/**
 * Escanea un contenedor DOM y actualiza todos sus <input type="date"> a DD/MM/AAAA.
 */
export function mejorarInputsFechaDMYEnContenedor(raiz) {
  if (!raiz || typeof raiz.querySelectorAll !== 'function') return 0;
  const inputs = raiz.querySelectorAll('input[type="date"]');
  let total = 0;
  inputs.forEach((inp) => {
    if (mejorarInputFechaDMY(inp)) total++;
  });
  return total;
}

/**
 * Inicializa el observador automático global para que cualquier <input type="date">
 * renderizado estática o dinámicamente en modales/vistas use siempre DD/MM/AAAA.
 */
export function inicializarInputsFechaDMYGlobal(docRef = null) {
  const doc = docRef || (typeof document !== 'undefined' ? document : null);
  if (!doc || !doc.body) return null;

  mejorarInputsFechaDMYEnContenedor(doc.body);

  if (doc.body._boviDmyObserverActivo) return doc.body._boviDmyObserverActivo;

  const Obs = (doc.defaultView && doc.defaultView.MutationObserver) || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
  if (!Obs) return null;

  const nodosPendientes = new Set();
  let framePendiente = null;
  let procesandoLote = false;

  const procesarPendientes = () => {
    framePendiente = null;
    if (procesandoLote || nodosPendientes.size === 0) return;
    procesandoLote = true;
    try {
      const lote = Array.from(nodosPendientes);
      nodosPendientes.clear();
      for (const node of lote) {
        if (!node || !node.isConnected) continue;
        if (node.tagName === 'INPUT' && node.type === 'date') {
          mejorarInputFechaDMY(node);
        } else if (typeof node.querySelectorAll === 'function') {
          mejorarInputsFechaDMYEnContenedor(node);
        }
      }
    } finally {
      procesandoLote = false;
    }
  };

  const programarProcesamiento = () => {
    if (framePendiente !== null) return;
    const raf = (doc.defaultView && doc.defaultView.requestAnimationFrame) || (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null);
    if (raf) {
      framePendiente = raf(procesarPendientes);
    } else {
      framePendiente = setTimeout(procesarPendientes, 0);
    }
  };

  const observer = new Obs((mutations) => {
    if (procesandoLote) return;
    let agrego = false;
    for (const m of mutations) {
      if (m.type === 'childList' && m.addedNodes && m.addedNodes.length > 0) {
        for (let i = 0; i < m.addedNodes.length; i++) {
          const node = m.addedNodes[i];
          if (!node || node.nodeType !== 1) continue;
          if (node.classList && node.classList.contains('bovi-dmy-wrapper')) continue;
          if (node.tagName === 'TR' || node.tagName === 'TD' || node.tagName === 'SPAN' || node.tagName === 'OPTION') continue;
          nodosPendientes.add(node);
          agrego = true;
        }
      }
    }
    if (agrego) programarProcesamiento();
  });

  observer.observe(doc.body, { childList: true, subtree: true });
  doc.body._boviDmyObserverActivo = observer;
  return observer;
}
