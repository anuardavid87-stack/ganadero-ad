/**
 * GANADERO AD - MOTOR UNIVERSAL DE COINCIDENCIAS Y AUTOSUGGEST DE ANIMALES
 * Muestra coincidencias en tiempo real según números o letras digitadas en cualquier
 * módulo de la aplicación (Manga, Traslados, Inventario, Reproducción, Tablas Dinámicas).
 */

export function normalizarTextoBusqueda(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Busca animales que coincidan con los números o letras digitadas
 * Ordena los resultados por relevancia y exactitud.
 */
export function buscarCoincidenciasAnimales(animales, query, maxResultados = 8) {
  if (!Array.isArray(animales) || animales.length === 0) return [];
  if (!query || typeof query !== 'string') return [];

  const qRaw = query.trim();
  if (qRaw.length === 0) return [];

  const qNorm = normalizarTextoBusqueda(qRaw);
  const qDigits = qRaw.replace(/\D/g, ''); // Solo números ingresados

  const resultados = [];

  animales.forEach((a) => {
    const tag = String(a.identificacionTag || a.numero || a.tag || '').trim();
    const tagNorm = normalizarTextoBusqueda(tag);
    const tagDigits = tag.replace(/\D/g, '');

    const alias = String(a.nombreAlias || a.alias || '').trim();
    const aliasNorm = normalizarTextoBusqueda(alias);

    const raza = String(a.raza || '').trim();
    const razaNorm = normalizarTextoBusqueda(raza);

    const categoria = String(a.categoria || '').trim();
    const categoriaNorm = normalizarTextoBusqueda(categoria);

    const lote = String(a.lote || '').trim();
    const loteNorm = normalizarTextoBusqueda(lote);

    const finca = String(a.fincaNombre || a.fincaId || '').trim();
    const fincaNorm = normalizarTextoBusqueda(finca);

    let puntuacion = 0;
    let coincidenciaEncontrada = false;

    // 1. Coincidencia exacta por Arete / Tag
    if (tagNorm === qNorm) {
      puntuacion += 500;
      coincidenciaEncontrada = true;
    } else if (tagNorm.startsWith(qNorm)) {
      puntuacion += 250;
      coincidenciaEncontrada = true;
    } else if (tagNorm.includes(qNorm)) {
      puntuacion += 120;
      coincidenciaEncontrada = true;
    }

    // 2. Coincidencia por Dígitos / Números (Ej: digitando "401" encuentra "BV-401", "201" encuentra "VES-201")
    if (qDigits.length > 0 && tagDigits.length > 0) {
      if (tagDigits === qDigits) {
        puntuacion += 300;
        coincidenciaEncontrada = true;
      } else if (tagDigits.endsWith(qDigits)) {
        puntuacion += 200;
        coincidenciaEncontrada = true;
      } else if (tagDigits.includes(qDigits)) {
        puntuacion += 140;
        coincidenciaEncontrada = true;
      }
    }

    // 3. Coincidencia por Nombre / Alias (Ej: digitando "pal" encuentra "Paloma", "mor" encuentra "Mora")
    if (aliasNorm) {
      if (aliasNorm === qNorm) {
        puntuacion += 350;
        coincidenciaEncontrada = true;
      } else if (aliasNorm.startsWith(qNorm)) {
        puntuacion += 180;
        coincidenciaEncontrada = true;
      } else if (aliasNorm.includes(qNorm)) {
        puntuacion += 100;
        coincidenciaEncontrada = true;
      }
    }

    // 4. Coincidencia por Raza, Categoría o Lote
    if (razaNorm.includes(qNorm)) {
      puntuacion += 50;
      coincidenciaEncontrada = true;
    }
    if (categoriaNorm.includes(qNorm)) {
      puntuacion += 40;
      coincidenciaEncontrada = true;
    }
    if (loteNorm.includes(qNorm)) {
      puntuacion += 30;
      coincidenciaEncontrada = true;
    }
    if (fincaNorm.includes(qNorm)) {
      puntuacion += 20;
      coincidenciaEncontrada = true;
    }

    if (coincidenciaEncontrada) {
      resultados.push({
        animal: a,
        tag,
        alias,
        raza,
        categoria,
        lote,
        puntuacion
      });
    }
  });

  // Ordenar por puntuación descendente
  resultados.sort((x, y) => y.puntuacion - x.puntuacion);

  return resultados.slice(0, maxResultados).map((r) => r.animal);
}

/**
 * Resalta en texto las letras o números coincidentes
 */
function resaltarCoincidencia(texto, query) {
  if (!texto) return '';
  if (!query) return String(texto);
  const qClean = normalizarTextoBusqueda(query);
  const regex = new RegExp('(' + qClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  return String(texto).replace(regex, '<span class="bg-amber-300 text-slate-900 px-0.5 rounded font-black">$1</span>');
}

/**
 * Conecta el comportamiento de autocompletado en vivo a un elemento input de búsqueda
 */
export function conectarAutosuggestAnimales({
  inputElement,
  getAnimales,
  onSeleccionar,
  onTrasladarAFinca,
  onReactivarAnimal,
  theme = 'emerald', // 'emerald' | 'purple' | 'indigo' | 'amber'
  maxResultados = 8,
  textoVacio = 'Sin coincidencias con esos números o letras'
}) {
  if (!inputElement) return null;

  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return {
      cerrar: () => {},
      actualizarGetAnimales: () => {},
      destruir: () => {}
    };
  }

  const el = typeof inputElement === 'string' ? (document.getElementById ? document.getElementById(inputElement) : null) : inputElement;
  if (!el) return null;

  // Evitar vincular duplicados
  if (el._autosuggestBound) {
    el._autosuggestBound.actualizarGetAnimales(getAnimales);
    return el._autosuggestBound;
  }

  const parent = el.parentElement || el.parentNode;
  if (!parent || typeof parent.appendChild !== 'function') {
    return {
      cerrar: () => {},
      actualizarGetAnimales: () => {},
      destruir: () => {}
    };
  }

  // Colores por tema
  const temas = {
    emerald: {
      border: 'border-emerald-500',
      badgeBg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      activeItem: 'bg-emerald-50 text-emerald-950 border-emerald-200',
      headerBg: 'bg-emerald-50 border-emerald-100 text-emerald-800'
    },
    purple: {
      border: 'border-purple-500',
      badgeBg: 'bg-purple-100 text-purple-900 border-purple-300',
      activeItem: 'bg-purple-50 text-purple-950 border-purple-200',
      headerBg: 'bg-purple-50 border-purple-100 text-purple-800'
    },
    indigo: {
      border: 'border-indigo-500',
      badgeBg: 'bg-indigo-100 text-indigo-900 border-indigo-300',
      activeItem: 'bg-indigo-50 text-indigo-950 border-indigo-200',
      headerBg: 'bg-indigo-50 border-indigo-100 text-indigo-800'
    },
    amber: {
      border: 'border-amber-500',
      badgeBg: 'bg-amber-100 text-amber-900 border-amber-300',
      activeItem: 'bg-amber-50 text-amber-950 border-amber-200',
      headerBg: 'bg-amber-50 border-amber-100 text-amber-800'
    }
  };
  const tColors = temas[theme] || temas.emerald;

  // Asegurar que el contenedor padre tenga position relative
  if (parent && typeof getComputedStyle === 'function') {
    if (getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }
  }

  // Crear menú flotante de sugerencias
  const dropMenu = document.createElement('div');
  dropMenu.className = 'absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-2xl shadow-2xl border-2 ' + tColors.border + ' overflow-hidden hidden';
  dropMenu.style.maxHeight = '340px';
  dropMenu.style.overflowY = 'auto';

  parent.appendChild(dropMenu);

  let animalesCache = getAnimales ? getAnimales() : [];
  let coincidenciasActuales = [];
  let indiceActivo = -1;

  function renderizarMenu(coincidencias, query) {
    coincidenciasActuales = coincidencias;
    indiceActivo = -1;

    if (!coincidencias || coincidencias.length === 0) {
      if (!query || query.trim().length === 0) {
        dropMenu.classList.add('hidden');
        return;
      }
      dropMenu.innerHTML = '<div class="p-3.5 text-center text-xs text-slate-500 font-semibold flex items-center justify-center gap-2"><span>🔍</span> ' + textoVacio + '</div>';
      dropMenu.classList.remove('hidden');
      return;
    }

    let html = '<div class="px-3.5 py-1.5 ' + tColors.headerBg + ' border-b text-[11px] font-black flex items-center justify-between">' +
      '<span class="flex items-center gap-1.5"><span>✨</span> Coincidencias encontradas: ' + coincidencias.length + '</span>' +
      '<span class="text-[10px] font-normal text-slate-400">Clic o Enter para seleccionar</span>' +
      '</div><div class="divide-y divide-slate-100">';

    coincidencias.forEach((a, idx) => {
      const tag = a.identificacionTag || a.numero || a.tag || 'S/N';
      const alias = a.nombreAlias || a.alias || '';
      const especie = (a.especie || '').toLowerCase() === 'bufalino' ? '🦬' : '🐂';
      const raza = a.raza || 'Común';
      const categoria = a.categoria || 'Sin Categoría';
      const lote = a.lote || 'General';
      const peso = a.ultimoPesoKg ? a.ultimoPesoKg + ' Kg' : '';
      const repro = a.estadoReproductivo || '';

      const esEnOtraFinca = Boolean(a._estaEnOtraFinca);
      const esExtraido = Boolean(a._estaExtraido || a.estadoVida === 'inactivo' || a.estado === 'inactivo' || a.motivoBaja);
      const esAtenuado = esEnOtraFinca || esExtraido;

      let badgeEstadoExtra = '';
      if (esEnOtraFinca) {
        badgeEstadoExtra = `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">🏡 En: ${a._fincaNombre || 'Otra Finca'}</span>`;
      } else if (esExtraido) {
        badgeEstadoExtra = `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">🚪 Extraído (${a.motivoBaja || a._motivoExtraido || 'Baja'})</span>`;
      }

      html += `<div class="item-sugerencia-animal p-2.5 sm:px-3.5 hover:bg-slate-50 cursor-pointer transition flex items-center justify-between gap-2.5 text-xs ${esAtenuado ? 'opacity-65 text-slate-400 bg-slate-50/70 border-l-2 border-slate-300' : ''}" data-index="${idx}">` +
        `<div class="flex items-center gap-2.5 min-w-0">` +
          `<span class="text-base flex-shrink-0 ${esAtenuado ? 'grayscale opacity-70' : ''}">${especie}</span>` +
          `<div class="min-w-0">` +
            `<div class="flex items-center gap-1.5 flex-wrap">` +
              `<span class="font-mono font-black px-2 py-0.5 rounded-lg border text-xs ${esAtenuado ? 'bg-slate-100 text-slate-500 border-slate-300' : tColors.badgeBg}">` +
                resaltarCoincidencia(tag, query) +
              `</span>` +
              (alias ? `<span class="font-black ${esAtenuado ? 'text-slate-500 font-medium' : 'text-slate-900'} truncate">${resaltarCoincidencia(alias, query)}</span>` : '') +
              badgeEstadoExtra +
            `</div>` +
            `<div class="text-[11px] ${esAtenuado ? 'text-slate-400' : 'text-slate-500'} truncate flex items-center gap-1.5 mt-0.5">` +
              `<span>${raza}</span>` +
              `<span>•</span>` +
              `<span>${categoria}</span>` +
              `<span>•</span>` +
              `<span class="text-slate-400 font-mono">Lote: ${lote}</span>` +
            `</div>` +
          `</div>` +
        `</div>` +
        `<div class="text-right flex-shrink-0 flex flex-col items-end">` +
          (peso ? `<span class="font-black font-mono text-xs px-1.5 py-0.5 rounded ${esAtenuado ? 'bg-slate-100 text-slate-400' : 'text-slate-800 bg-slate-100'}">${peso}</span>` : '') +
          (repro ? `<span class="text-[10px] font-bold ${esAtenuado ? 'text-slate-400' : (repro === 'Preñada' ? 'text-emerald-600' : 'text-slate-500')}">${repro}</span>` : '') +
        `</div>` +
      `</div>`;
    });

    html += '</div>';
    dropMenu.innerHTML = html;
    dropMenu.classList.remove('hidden');

    dropMenu.querySelectorAll('.item-sugerencia-animal').forEach((item) => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const index = parseInt(item.getAttribute('data-index'), 10);
        const seleccionado = coincidenciasActuales[index];
        if (seleccionado) {
          seleccionar(seleccionado);
        }
      });
    });
  }

  function actualizarResaltadoTeclado() {
    const items = dropMenu.querySelectorAll('.item-sugerencia-animal');
    items.forEach((it, idx) => {
      if (idx === indiceActivo) {
        it.classList.add('bg-slate-100', 'font-black');
        it.scrollIntoView({ block: 'nearest' });
      } else {
        it.classList.remove('bg-slate-100', 'font-black');
      }
    });
  }

  function seleccionar(animal) {
    if (!animal) return;
    const tag = animal.identificacionTag || animal.numero || '';

    // Si el animal está en otra finca de la misma empresa
    if (animal._estaEnOtraFinca) {
      const confirmacion = confirm(`El animal "${tag}" se encuentra registrado en la finca "${animal._fincaNombre || 'otra finca'}".\n\n¿Deseas trasladarlo inmediatamente a la finca en la que estás trabajando?`);
      if (confirmacion && typeof onTrasladarAFinca === 'function') {
        onTrasladarAFinca(animal);
      }
    }
    // Si el animal está extraído (baja por venta o muerte)
    else if (animal._estaExtraido || animal.estadoVida === 'inactivo' || animal.estado === 'inactivo' || animal.motivoBaja) {
      const motivo = animal.motivoBaja || animal._motivoExtraido || 'Baja';
      const confirmacion = confirm(`El animal "${tag}" se encuentra actualmente EXTRAÍDO del hato (Motivo: ${motivo}).\n\n¿Deseas activarlo nuevamente en esta finca?`);
      if (confirmacion && typeof onReactivarAnimal === 'function') {
        onReactivarAnimal(animal);
      }
    }

    el.value = tag;
    dropMenu.classList.add('hidden');
    coincidenciasActuales = [];
    indiceActivo = -1;

    if (typeof onSeleccionar === 'function') {
      onSeleccionar(animal);
    }
  }

  function dispararBusqueda() {
    const q = el.value || '';
    if (!q.trim()) {
      dropMenu.classList.add('hidden');
      return;
    }
    animalesCache = getAnimales ? getAnimales() : [];
    const matches = buscarCoincidenciasAnimales(animalesCache, q, maxResultados);
    renderizarMenu(matches, q);
  }

  el.addEventListener('input', () => {
    dispararBusqueda();
  });

  el.addEventListener('focus', () => {
    if (el.value && el.value.trim().length > 0) {
      dispararBusqueda();
    }
  });

  el.addEventListener('blur', () => {
    setTimeout(() => {
      dropMenu.classList.add('hidden');
    }, 200);
  });

  el.addEventListener('keydown', (e) => {
    if (dropMenu.classList.contains('hidden') || coincidenciasActuales.length === 0) {
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      indiceActivo = (indiceActivo + 1) % coincidenciasActuales.length;
      actualizarResaltadoTeclado();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      indiceActivo = (indiceActivo - 1 + coincidenciasActuales.length) % coincidenciasActuales.length;
      actualizarResaltadoTeclado();
    } else if (e.key === 'Enter') {
      if (indiceActivo >= 0 && indiceActivo < coincidenciasActuales.length) {
        e.preventDefault();
        seleccionar(coincidenciasActuales[indiceActivo]);
      } else if (coincidenciasActuales.length > 0) {
        e.preventDefault();
        seleccionar(coincidenciasActuales[0]);
      }
    } else if (e.key === 'Escape') {
      dropMenu.classList.add('hidden');
    }
  });

  const controlador = {
    cerrar: () => dropMenu.classList.add('hidden'),
    actualizarGetAnimales: (nuevaFn) => { getAnimales = nuevaFn; },
    destruir: () => {
      dropMenu.remove();
      delete el._autosuggestBound;
    }
  };

  el._autosuggestBound = controlador;
  return controlador;
}

