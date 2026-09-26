/**
 * BOVITRACK PRO PWA - AUDITOR INTELIGENTE DE IA Y ALERTAS ZOOTÉCNICAS
 * Validador estricto de anomalías biológicas en tiempo real y escáner de animales improductivos.
 */

import { calcularGDP, calcularDiasAbiertos, calcularEdadMeses, verificarSecado7Meses } from './zootecnia.js';

// ----------------------------------------------------------------------------
// 1. IA DE VALIDACIÓN EN TIEMPO REAL (BLOQUEO DE IMPOSIBILIDADES BIOLÓGICAS)
// ----------------------------------------------------------------------------

export function auditarPesajeInput(animal, nuevoPeso, fechaPesaje, historialPesajes = []) {
  const anomalias = [];
  const peso = parseFloat(nuevoPeso);

  if (isNaN(peso) || peso <= 0) {
    anomalias.push({ tipo: 'error', mensaje: 'El peso debe ser mayor a 0 kg.' });
    return anomalias;
  }

  if (peso > 1450) {
    anomalias.push({
      tipo: 'error',
      mensaje: `Peso de ${peso} kg supera el límite biológico máximo bovino/bufalino (1450 kg).`
    });
  }

  // Comprobar salto de peso irreal respecto al último pesaje
  const anterior = historialPesajes && historialPesajes.length > 0
    ? historialPesajes[0]
    : (animal?.ultimoPesoKg ? { peso: animal.ultimoPesoKg, fecha: animal.fechaUltimoPesaje } : null);

  if (anterior && anterior.peso && anterior.fecha && fechaPesaje) {
    const gdp = calcularGDP(peso, anterior.peso, fechaPesaje, anterior.fecha);
    const dias = Math.round((new Date(fechaPesaje) - new Date(anterior.fecha)) / (1000 * 60 * 60 * 24));

    if (gdp !== null && dias > 0) {
      // Regla: Salto irreal de peso (> 2500 g/día)
      if (gdp > 2500) {
        anomalias.push({
          tipo: 'error',
          mensaje: `🚨 Salto irreal de peso: +${(gdp / 1000).toFixed(2)} kg/día (${gdp} g/d) en ${dias} días. Imposible biológicamente a pastoreo.`
        });
      }
      // Regla: Caída de peso > 30% en menos de 45 días
      const perdidaPct = ((anterior.peso - peso) / anterior.peso) * 100;
      if (perdidaPct > 30 && dias <= 45) {
        anomalias.push({
          tipo: 'warning',
          mensaje: `⚠️ Caída extrema de peso: -${perdidaPct.toFixed(1)}% en ${dias} días (${anterior.peso} kg ➔ ${peso} kg).`
        });
      }
    }
  }

  return anomalias;
}

export function auditarPartoInput(madre, fechaParto, partosPrevios = []) {
  const anomalias = [];
  if (!madre) return anomalias;

  if (madre.sexo === 'macho') {
    anomalias.push({
      tipo: 'error',
      mensaje: `Imposibilidad biológica: El animal ${madre.identificacionTag || madre.numero} es macho.`
    });
    return anomalias;
  }

  // Regla: Vaca pariendo dos veces en 3 meses (o menos de 210 días)
  const partos = [...partosPrevios];
  if (madre.fechaUltimoParto) partos.push({ fecha: madre.fechaUltimoParto });
  partos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  if (partos.length > 0 && fechaParto) {
    const ultimo = partos[0];
    const diffDias = Math.round((new Date(fechaParto) - new Date(ultimo.fecha)) / (1000 * 60 * 60 * 24));
    if (diffDias < 210) {
      anomalias.push({
        tipo: 'error',
        mensaje: `🚨 Imposibilidad biológica: Intervalo de parto de ${diffDias} días respecto al anterior (${ultimo.fecha}). Una vaca no puede parir dos veces en menos de 7 meses (~210-280 días).`
      });
    }
  }

  return anomalias;
}

export function auditarPalpacionInput(animal, resultado, diasGestacion) {
  const anomalias = [];
  if (!animal) return anomalias;

  if (animal.sexo === 'macho') {
    anomalias.push({
      tipo: 'error',
      mensaje: `Imposibilidad zootécnica: Diagnóstico reproductivo no aplicable a ejemplares machos.`
    });
  }

  const edadMeses = calcularEdadMeses(animal.fechaNacimiento);
  if (edadMeses < 12 && resultado === 'Preñada') {
    anomalias.push({
      tipo: 'error',
      mensaje: `Inconsistencia: Ternera prepúber (${edadMeses} meses) sin madurez reproductiva para gestación.`
    });
  }

  return anomalias;
}

export function auditarServicioInput(animal, tipoServicio, fechaServicio, reproductor = '') {
  const anomalias = [];
  if (!animal) return anomalias;

  // 1. Imposibilidad biológica: Servicio en macho
  if (animal.sexo === 'macho') {
    anomalias.push({
      tipo: 'error',
      mensaje: `🚨 Imposibilidad biológica: El animal ${animal.identificacionTag || animal.numero} es macho. No se pueden registrar servicios de IA, TE ni Monta en machos.`
    });
    return anomalias;
  }

  // 2. Alerta de riesgo de aborto si la hembra está preñada confirmada
  const estRepro = (animal.estadoReproductivo || '').toLowerCase();
  const diasG = parseInt(animal.diasGestacionActual || animal.diasGestacion || 0);
  if ((estRepro.includes('prenad') || estRepro.includes('preñad')) && diasG > 45) {
    anomalias.push({
      tipo: 'warning',
      mensaje: `⚠️ Advertencia Zootécnica: La hembra figura preñada confirmada (${diasG} días de gestación). Inseminar o introducir pistola/catéter puede inducir pérdida embrionaria o aborto.`
    });
  }

  // 3. Edad mínima reproductiva (novilla < 13 meses)
  const edadMeses = calcularEdadMeses(animal.fechaNacimiento);
  if (edadMeses > 0 && edadMeses < 13) {
    anomalias.push({
      tipo: 'warning',
      mensaje: `⚠️ Atención: Novilla con solo ${edadMeses} meses de edad. Se recomienda verificar desarrollo pélvico antes del primer servicio.`
    });
  }

  // 4. Fecha futura
  if (fechaServicio) {
    const fServ = new Date(fechaServicio);
    const hoy = new Date();
    hoy.setHours(23, 59, 59, 999);
    if (fServ > hoy) {
      anomalias.push({
        tipo: 'error',
        mensaje: `La fecha del servicio no puede ser futura (${fechaServicio}).`
      });
    }
  }

  // 5. Reproductor / Pajilla requerido
  if (!reproductor || !reproductor.trim()) {
    anomalias.push({
      tipo: 'warning',
      mensaje: `Se recomienda especificar el toro, código de pajilla o donadora para garantizar la trazabilidad genética.`
    });
  }

  return anomalias;
}


// ----------------------------------------------------------------------------
// 2. ALERTAS ZOOTÉCNICAS AUTOMÁTICAS (ANIMALES IMPRODUCTIVOS)
// ----------------------------------------------------------------------------

export function detectarAlertasZootecnicas(animales = [], fechaReferencia = new Date()) {
  const alertas = [];

  animales.forEach((a) => {
    if (a.estadoVida !== 'activo' && a.estado !== 'activo') return;

    const especie = a.especie || 'bovino';
    const cat = (a.categoria || '').toLowerCase();
    const tag = a.identificacionTag || a.numero || a.id;
    const nombre = a.nombreAlias || a.nombre || 'Sin Alias';
    const lote = a.lote || 'General';
    const estadoRepro = a.estadoReproductivo || 'Vacía';

    // 1. ALERTA CRECIMIENTO: GDP < 300 g/día en animales de levante o ceba
    const esCebaOLevante = cat.includes('ceba') || cat.includes('levante') || cat.includes('novillo');
    const gdp = a.gdpPromedioGDia !== undefined ? a.gdpPromedioGDia : a.gdpActual;

    if (esCebaOLevante && gdp !== null && gdp !== undefined) {
      const gdpNum = parseFloat(gdp);
      if (gdpNum < 300) {
        alertas.push({
          id: `ALT-CREC-${a.id}`,
          animalId: a.id,
          tag,
          nombre,
          lote,
          categoria: a.categoria,
          tipo: 'crecimiento_bajo_gdp',
          severidad: 'critica',
          titulo: `Ganancia Crítica de Peso: ${gdpNum} g/d`,
          mensaje: `Ejemplar en levante/ceba ganando apenas ${gdpNum} g/día (mínimo zootécnico rentable: 300 g/d).`,
          valorMedido: `${gdpNum} g/día`,
          valorLimite: '≥ 300 g/día',
          accionRecomendada: 'Evaluar parasitismo interno, calidad de forraje y suplementación mineral.'
        });
      }
    }

    // 2. ALERTA REPRODUCCIÓN (VACAS): Vacas vacías con más de 200 días abiertos
    const esVaca = cat.includes('vaca') || cat.includes('ordeño');
    const esVacia = estadoRepro.toLowerCase().includes('vacía') || estadoRepro.toLowerCase().includes('vacia') || estadoRepro.toLowerCase().includes('abierta');
    const fParto = a.fechaUltimoParto || a.ultimoParto;

    if (esVaca && esVacia && fParto) {
      const diasAbiertos = calcularDiasAbiertos(fParto, estadoRepro, fechaReferencia);
      if (diasAbiertos > 200) {
        alertas.push({
          id: `ALT-REP-VACA-${a.id}`,
          animalId: a.id,
          tag,
          nombre,
          lote,
          categoria: a.categoria,
          tipo: 'vaca_vacia_dias_abiertos',
          severidad: 'critica',
          titulo: `Vaca Vacía con ${diasAbiertos} Días Abiertos`,
          mensaje: `Vientre con ${diasAbiertos} días sin confirmar gestación desde su último parto (${fParto}). Supera el límite de 200 días.`,
          valorMedido: `${diasAbiertos} días`,
          valorLimite: '≤ 200 días',
          accionRecomendada: 'Programar protocolo de sincronización IATF o chequeo ecográfico ovárico.'
        });
      }
    }

    // 3. ALERTA REPRODUCCIÓN (NOVILLAS): Novillas vacías con edad superior a 36 meses
    const esNovilla = cat.includes('novilla') || cat.includes('bubilla');
    const fNac = a.fechaNacimiento;
    if (esNovilla && esVacia && fNac) {
      const edadMeses = calcularEdadMeses(fNac, fechaReferencia);
      if (edadMeses > 36) {
        alertas.push({
          id: `ALT-REP-NOV-${a.id}`,
          animalId: a.id,
          tag,
          nombre,
          lote,
          categoria: a.categoria,
          tipo: 'novilla_vacia_edad',
          severidad: 'advertencia',
          titulo: `Novilla Vacía con ${edadMeses} Meses de Edad`,
          mensaje: `Novilla de vientre de ${edadMeses} meses (>${(edadMeses / 12).toFixed(1)} años) sin preñez confirmada.`,
          valorMedido: `${edadMeses} meses`,
          valorLimite: '≤ 36 meses',
          accionRecomendada: 'Evaluar desarrollo pélvico, condición corporal o considerar descarte.'
        });
      }
    }

    // 4. ALERTA SANIDAD / MANEJO: Secado de vacas próximas a parir (7 meses de gestación / 210 días)
    const estaPrenada = estadoRepro.toLowerCase().includes('preñad') || estadoRepro.toLowerCase().includes('prenad');
    const diasG = parseInt(a.diasGestacionActual || a.diasGestacion || 0);

    if (esVaca && estaPrenada && diasG > 0) {
      if (verificarSecado7Meses(diasG, especie)) {
        alertas.push({
          id: `ALT-SECADO-${a.id}`,
          animalId: a.id,
          tag,
          nombre,
          lote,
          categoria: a.categoria,
          tipo: 'secado_7_meses',
          severidad: 'sanidad_preventiva',
          titulo: `Alerta de Secado: ${diasG} Días de Preñez (~7 Meses)`,
          mensaje: `Hembra gestante con 7 meses de preñez. Suspender ordeño y aplicar pomo intramamario de secado.`,
          valorMedido: `${diasG} días de gestación`,
          valorLimite: '≥ 210 días (~7 meses)',
          accionRecomendada: 'Suspender ordeño, aplicar sellador de pezones y trasladar a lote de vacas secas.'
        });
      }
    }
  });

  return alertas;
}
