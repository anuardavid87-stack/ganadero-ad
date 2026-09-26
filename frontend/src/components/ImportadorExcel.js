/**
 * GANADERO AD - IMPORTADOR OFICIAL MULTI-MÓDULO DE EXCEL / CSV (.xlsx, .xls, .csv)
 * Soporta importación masiva para:
 * 1. Inventario General (genealogía, especie, pesos, palpaciones)
 * 2. Pesajes & GDP
 * 3. Palpaciones & Reproducción
 * 4. Control Lechero (Pesaje de Leche)
 * 5. Partos & Nacimientos
 * 6. Destete de Terneros
 *
 * Incluye selector de tipo de cargue, campo de fecha de jornada superior,
 * descarga dinámica de plantillas y auditoría biológica con IA.
 */

import { auditarPesajeInput } from '../core/auditorIA.js';
import { normalizarFechaISO } from '../core/supabaseSync.js';

export class ImportadorExcel {
  constructor({ containerId, onImportConfirmada, getFincas, getFincaActiva, onCambiarFinca }) {
    this.container = document.getElementById(containerId);
    this.onImportConfirmada = onImportConfirmada;
    this.getFincas = getFincas || (() => []);
    this.getFincaActiva = getFincaActiva || (() => null);
    this.onCambiarFinca = onCambiarFinca || null;

    this.tipoCargue = 'inventario'; // 'inventario' | 'pesajes' | 'palpaciones' | 'leche' | 'partos' | 'destete'
    this.fechaGlobal = new Date().toISOString().split('T')[0];
    this.aplicarFechaGlobal = true;
    this.registros = [];
    this.fincaDestinoId = null;
    this.informeResultados = null;
  }

  init() {
    this.render();
  }

  setTipoCargue(tipo) {
    this.tipoCargue = tipo;
    this.registros = [];
    this.render();
  }

  descargarPlantillaCSV(tipo = this.tipoCargue) {
    let encabezados = [];
    let ejemplos = [];
    let nombreArchivo = `plantilla_${tipo}_${this.fechaGlobal}.csv`;

    if (tipo === 'labores') {
      encabezados = [
        'numero_animal',
        'fecha',
        'labor',
        'peso_kg',
        'condicion_corporal',
        'palpacion',
        'dias_gestacion',
        'estructura_ovario',
        'leche_litros',
        'peso_destete_kg',
        'lote_destino',
        'sexo_cria',
        'peso_cria_kg',
        'tag_cria',
        'padre_toro',
        'observaciones'
      ];
      ejemplos = [
        ['BV-101', this.fechaGlobal, 'Pesaje', '512.5', '3.5', '', '', '', '', '', '', '', '', '', '', 'Pesaje regular de manga'],
        ['BV-102', this.fechaGlobal, 'Palpacion', '', '', 'Preñada', '95', 'CL activo cuerno derecho', '', '', '', '', '', '', '', 'Confirmada preñez'],
        ['BV-208', this.fechaGlobal, 'Leche', '', '', '', '', '', '16.5', '', '', '', '', '', '', 'Control lechero diario'],
        ['BV-301', this.fechaGlobal, 'Destete', '', '', '', '', '', '', '185.0', 'Levante Machos', '', '', '', '', 'Destete tradicional'],
        ['BV-401', this.fechaGlobal, 'Parto', '', '', '', '', '', '', '', '', 'hembra', '36.0', 'CRIA-BV-401', 'TORO-08', 'Parto normal eutócico'],
        ['BV-501', this.fechaGlobal, 'Pesaje y Palpacion', '480.0', '3.5', 'Preñada', '110', 'CL activo', '', '', '', '', '', '', '', 'Pesaje y palpación simultáneos en brete']
      ];
      nombreArchivo = `plantilla_hoja_unica_labores_${this.fechaGlobal}.csv`;
    } else if (tipo === 'pesajes') {
      encabezados = ['numero_animal', 'fecha_pesaje', 'peso_kg', 'condicion_corporal', 'observaciones'];
      ejemplos = [
        ['BV-101', this.fechaGlobal, '512.5', '3.5', 'Pesaje regular de manga'],
        ['BV-102', this.fechaGlobal, '498.0', '4.0', 'Excelente condición'],
        ['BV-301', this.fechaGlobal, '465.0', '3.5', 'Lote de ceba intensiva'],
        ['BUF-01', this.fechaGlobal, '620.0', '3.5', 'Búfala pesaje mensual']
      ];
    } else if (tipo === 'palpaciones') {
      encabezados = ['numero_animal', 'fecha_palpacion', 'resultado', 'dias_gestacion', 'estructura_ovario', 'observaciones'];
      ejemplos = [
        ['BV-101', this.fechaGlobal, 'Preñada', '110', 'CL activo cuerno derecho', 'Confirmada en primer celo'],
        ['BV-102', this.fechaGlobal, 'Vacía', '0', 'Folículo 14mm ovárico', 'Apta para protocolo IATF'],
        ['BV-208', this.fechaGlobal, 'Sospechosa', '35', 'Asimetría uterina', 'Rechequear en 15 días'],
        ['BUF-01', this.fechaGlobal, 'Preñada', '135', 'CL activo', 'Gestación confirmada']
      ];
    } else if (tipo === 'leche') {
      encabezados = ['numero_animal', 'fecha_pesaje_leche', 'litros_manana', 'litros_tarde', 'total_litros', 'notas_ubre'];
      ejemplos = [
        ['BV-101', this.fechaGlobal, '8.5', '6.0', '14.5', 'Ubre sana sin mastitis'],
        ['BV-102', this.fechaGlobal, '9.2', '7.3', '16.5', 'Pico de lactancia'],
        ['BV-208', this.fechaGlobal, '5.0', '4.0', '9.0', 'Tercio final de lactancia'],
        ['BUF-01', this.fechaGlobal, '6.0', '4.5', '10.5', 'Leche rica en sólidos']
      ];
    } else if (tipo === 'partos') {
      encabezados = ['numero_madre', 'fecha_parto', 'sexo_cria', 'peso_cria_kg', 'tag_cria', 'padre_toro', 'observaciones'];
      ejemplos = [
        ['BV-101', this.fechaGlobal, 'hembra', '34.5', 'CRIA-BV-101', 'TORO-08', 'Parto normal eutócico'],
        ['BV-102', this.fechaGlobal, 'macho', '38.0', 'CRIA-BV-102', 'TORO-12', 'Cría vigorosa'],
        ['BUF-01', this.fechaGlobal, 'hembra', '39.0', 'BUF-CRIA-01', 'BUF-TORO-01', 'Bucerro nacido en potrero']
      ];
    } else if (tipo === 'destete') {
      encabezados = ['numero_animal', 'fecha_destete', 'peso_destete_kg', 'lote_destino', 'observaciones'];
      ejemplos = [
        ['CRIA-BV-101', this.fechaGlobal, '185.0', 'Levante Hembras', 'Destete a los 8 meses'],
        ['CRIA-BV-102', this.fechaGlobal, '210.5', 'Levante Machos', 'Buen desarrollo muscular'],
        ['BUF-CRIA-01', this.fechaGlobal, '195.0', 'Búfalas Levante', 'Destete en peso ideal']
      ];
    } else {
      // Inventario General
      encabezados = [
        'numero_animal',
        'especie',
        'nombre',
        'sexo',
        'raza',
        'categoria',
        'lote',
        'fecha_nacimiento',
        'padre',
        'madre',
        'fecha_pesaje',
        'peso_actual',
        'ganancia_peso_dia',
        'fecha_ultima_palpacion',
        'resultado_ultima_palpacion',
        'dias_gestacion',
        'fecha_ultimo_parto'
      ];
      ejemplos = [
        ['BV-101', 'vacuno', 'Paloma', 'hembra', 'Brahman x Gyr', 'Vaca de Ordeño', 'Ordeño 1', '2021-04-12', 'TORO-08', 'BV-050', this.fechaGlobal, '510', '420', this.fechaGlobal, 'Preñada', '110', '2025-11-20'],
        ['BV-102', 'vacuno', 'Candela', 'hembra', 'Gyr Puro', 'Vaca de Ordeño', 'Ordeño 1', '2020-08-05', 'TORO-12', 'BV-014', this.fechaGlobal, '500', '350', this.fechaGlobal, 'Preñada', '215', '2025-10-20'],
        ['BV-208', 'vacuno', 'Sultana', 'hembra', 'Guzerá x Holstein', 'Vaca de Ordeño', 'Ordeño 2', '2021-01-20', 'TORO-04', 'BV-098', this.fechaGlobal, '515', '180', this.fechaGlobal, 'Vacía', '0', '2026-01-05'],
        ['BV-301', 'vacuno', 'Centella', 'macho', 'Nelore x Angus', 'Novillo de Ceba', 'Ceba Intensiva', '2024-03-10', 'TORO-15', 'BV-210', this.fechaGlobal, '455', '650', '', 'No Aplica', '0', ''],
        ['BUF-01', 'bufalino', 'Noche Buena', 'hembra', 'Murrah Lechero', 'Vaca de Ordeño', 'Búfalas Ordeño', '2021-09-14', 'BUF-TORO-01', 'BUF-005', this.fechaGlobal, '610', '490', this.fechaGlobal, 'Preñada', '130', '2025-12-01']
      ];
    }

    let csv = '\uFEFF' + encabezados.join(';') + '\r\n';
    ejemplos.forEach((row) => {
      csv += row.join(';') + '\r\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  procesarArchivo(file) {
    if (!file) return;

    const nombreArchivo = (file.name || '').toLowerCase();
    const esBinarioExcel = nombreArchivo.endsWith('.xlsx') || nombreArchivo.endsWith('.xls');

    if (esBinarioExcel) {
      if (typeof window !== 'undefined' && window.XLSX) {
        this._procesarConSheetJS(file);
      } else {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
        script.onload = () => {
          this._procesarConSheetJS(file);
        };
        script.onerror = () => {
          alert('No se pudo cargar el módulo lector de Excel (.xlsx). Por favor exporta tu archivo en formato (.csv) delimitado por comas o punto y coma.');
        };
        document.head.appendChild(script);
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      this._parsearTextoCSV(e.target.result);
    };
    reader.readAsText(file, 'UTF-8');
  }

  _procesarConSheetJS(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = window.XLSX.read(data, { type: 'array' });
        const sheetNames = workbook.SheetNames || [];
        const tieneMultiplesHojasLabores = sheetNames.length > 1 && sheetNames.some(name => {
          const n = name.toLowerCase();
          return n.includes('pesaj') || n.includes('palp') || n.includes('lech') || n.includes('part') || n.includes('destet');
        });

        if (tieneMultiplesHojasLabores) {
          this._procesarWorkbookMultiplesHojas(workbook);
        } else {
          const firstSheetName = sheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const csvText = window.XLSX.utils.sheet_to_csv(worksheet, { FS: ';' });
          this._parsearTextoCSV(csvText);
        }
      } catch (err) {
        alert('Error al leer el archivo Excel: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  _procesarWorkbookMultiplesHojas(workbook) {
    const registrosCombinados = [];
    let idxGlobal = 1;
    const hoyDefecto = this.fechaGlobal || new Date().toISOString().split('T')[0];

    (workbook.SheetNames || []).forEach((sheetName) => {
      const sNameLower = (sheetName || '').toLowerCase();
      const worksheet = workbook.Sheets ? workbook.Sheets[sheetName] : null;
      const xlsx = (typeof window !== 'undefined' && window.XLSX) ? window.XLSX : (typeof XLSX !== 'undefined' ? XLSX : globalThis.XLSX);
      const csvText = xlsx?.utils?.sheet_to_csv ? xlsx.utils.sheet_to_csv(worksheet, { FS: ';' }) : (worksheet?._csvContent || '');
      const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) return;

      const sep = ';';
      const headers = lines[0].split(sep).map((h) =>
        h.trim().toLowerCase().replace(/^"|"$/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_]/g, '')
      );

      const findIdx = (keywords, defaultIdx) => {
        for (const kw of keywords) {
          const idx = headers.findIndex((h) => h === kw);
          if (idx !== -1) return idx;
        }
        for (const kw of keywords) {
          const idx = headers.findIndex((h) => h.includes(kw));
          if (idx !== -1) return idx;
        }
        return defaultIdx;
      };

      if (sNameLower.includes('pesaj')) {
        const idxTag = findIdx(['tag', 'numero_animal', 'numero', 'arete', 'id'], 0);
        const idxFecha = findIdx(['fecha_pesaje', 'fecha', 'dia'], 1);
        const idxPeso = findIdx(['peso_kg', 'peso_actual', 'peso', 'kilos'], 2);
        const idxCond = findIdx(['condicion_corporal', 'condicion', 'cc'], 3);
        const idxObs = findIdx(['observaciones', 'notas', 'obs'], 4);

        lines.slice(1).forEach((l) => {
          const c = l.split(sep).map((v) => v.trim().replace(/^"|"$/g, ''));
          const tag = (c[idxTag] || '').trim();
          if (!tag) return;
          let fecha = normalizarFechaISO((c[idxFecha] || '').trim()) || hoyDefecto;
          const peso = parseFloat(c[idxPeso]) || null;
          registrosCombinados.push({
            idx: idxGlobal++,
            tag,
            fecha,
            laborIndicada: 'pesaje',
            laboresDetectadas: [`⚖️ Pesaje (${peso || 0} kg)`],
            tienePesaje: true,
            pesoActual: peso,
            condicionCorporal: (c[idxCond] || '3.5').trim(),
            observaciones: (c[idxObs] || '').trim(),
            errores: !peso ? [{ tipo: 'error', mensaje: 'Peso inválido' }] : []
          });
        });
      } else if (sNameLower.includes('palp')) {
        const idxTag = findIdx(['tag', 'numero_animal', 'numero', 'arete', 'id'], 0);
        const idxFecha = findIdx(['fecha_palpacion', 'fecha', 'dia'], 1);
        const idxRes = findIdx(['resultado', 'diagnostico', 'palpacion', 'estado'], 2);
        const idxDias = findIdx(['dias_gestacion', 'dias', 'gestacion', 'prenez'], 3);
        const idxObs = findIdx(['observaciones', 'notas', 'obs'], 4);

        lines.slice(1).forEach((l) => {
          const c = l.split(sep).map((v) => v.trim().replace(/^"|"$/g, ''));
          const tag = (c[idxTag] || '').trim();
          if (!tag) return;
          let fecha = normalizarFechaISO((c[idxFecha] || '').trim()) || hoyDefecto;
          let resRaw = (c[idxRes] || 'Preñada').trim();
          let resNorm = resRaw.toLowerCase().includes('pre') ? 'Preñada' : (resRaw.toLowerCase().includes('sosp') ? 'Sospechosa' : 'Vacía');
          const dias = parseInt(c[idxDias]) || (resNorm === 'Preñada' ? 60 : 0);
          registrosCombinados.push({
            idx: idxGlobal++,
            tag,
            fecha,
            laborIndicada: 'palpacion',
            laboresDetectadas: [`✋ Palpación (${resNorm} ${dias > 0 ? dias + 'd' : ''})`],
            tienePalpacion: true,
            resultadoPalpacion: resNorm,
            diasGestacion: dias,
            observaciones: (c[idxObs] || '').trim(),
            errores: []
          });
        });
      } else if (sNameLower.includes('lech')) {
        const idxTag = findIdx(['tag', 'numero_animal', 'numero', 'arete', 'id'], 0);
        const idxFecha = findIdx(['fecha_pesaje_leche', 'fecha_leche', 'fecha'], 1);
        const idxAm = findIdx(['litros_manana', 'manana', 'am'], 2);
        const idxPm = findIdx(['litros_tarde', 'tarde', 'pm'], 3);
        const idxTot = findIdx(['total_litros', 'total', 'litros'], 4);

        lines.slice(1).forEach((l) => {
          const c = l.split(sep).map((v) => v.trim().replace(/^"|"$/g, ''));
          const tag = (c[idxTag] || '').trim();
          if (!tag) return;
          let fecha = normalizarFechaISO((c[idxFecha] || '').trim()) || hoyDefecto;
          const am = parseFloat(c[idxAm]) || 0;
          const pm = parseFloat(c[idxPm]) || 0;
          let tot = parseFloat(c[idxTot]);
          if (isNaN(tot) || tot === null) tot = parseFloat((am + pm).toFixed(1));
          registrosCombinados.push({
            idx: idxGlobal++,
            tag,
            fecha,
            laborIndicada: 'leche',
            laboresDetectadas: [`🥛 Leche (${tot || 0} L)`],
            tieneLeche: true,
            totalLitros: tot,
            litrosManana: am,
            litrosTarde: pm,
            errores: tot <= 0 ? [{ tipo: 'error', mensaje: 'Litros en cero' }] : []
          });
        });
      } else if (sNameLower.includes('part')) {
        const idxTag = findIdx(['numero_madre', 'madre', 'tag_madre', 'tag'], 0);
        const idxFecha = findIdx(['fecha_parto', 'fecha', 'parto'], 1);
        const idxSexo = findIdx(['sexo_cria', 'sexo'], 2);
        const idxPeso = findIdx(['peso_cria_kg', 'peso_cria', 'peso'], 3);
        const idxCria = findIdx(['tag_cria', 'cria_tag', 'cria'], 4);

        lines.slice(1).forEach((l) => {
          const c = l.split(sep).map((v) => v.trim().replace(/^"|"$/g, ''));
          const tag = (c[idxTag] || '').trim();
          if (!tag) return;
          let fecha = normalizarFechaISO((c[idxFecha] || '').trim()) || hoyDefecto;
          const sex = (c[idxSexo] || 'hembra').toLowerCase().includes('macho') ? 'macho' : 'hembra';
          const pCria = parseFloat(c[idxPeso]) || 35.0;
          const tCria = (c[idxCria] || '').trim() || `CRIA-${tag}`;
          registrosCombinados.push({
            idx: idxGlobal++,
            tag,
            fecha,
            laborIndicada: 'partos',
            laboresDetectadas: [`🍼 Parto (${tCria}, ${sex})`],
            tieneParto: true,
            madreTag: tag,
            fechaParto: fecha,
            sexoCria: sex,
            pesoCria: pCria,
            tagCria: tCria,
            errores: []
          });
        });
      } else if (sNameLower.includes('destet')) {
        const idxTag = findIdx(['numero_animal', 'tag', 'numero', 'cria'], 0);
        const idxFecha = findIdx(['fecha_destete', 'fecha', 'destete'], 1);
        const idxPeso = findIdx(['peso_destete_kg', 'peso_destete', 'peso'], 2);
        const idxLote = findIdx(['lote_destino', 'lote'], 3);

        lines.slice(1).forEach((l) => {
          const c = l.split(sep).map((v) => v.trim().replace(/^"|"$/g, ''));
          const tag = (c[idxTag] || '').trim();
          if (!tag) return;
          let fecha = normalizarFechaISO((c[idxFecha] || '').trim()) || hoyDefecto;
          const pDest = parseFloat(c[idxPeso]) || 180.0;
          const lDest = (c[idxLote] || 'Levante').trim();
          registrosCombinados.push({
            idx: idxGlobal++,
            tag,
            fecha,
            laborIndicada: 'destete',
            laboresDetectadas: [`🌾 Destete (${pDest} kg, ${lDest})`],
            tieneDestete: true,
            pesoDestete: pDest,
            loteDestino: lDest,
            errores: []
          });
        });
      }
    });

    if (registrosCombinados.length > 0) {
      this.tipoCargue = 'labores';
      this.registros = registrosCombinados;
      this.render();
    }
    return this.registros || [];
  }

  parsearContenidoCSV(text) {
    this._parsearTextoCSV(text);
    return this.registros || [];
  }

  _parsearTextoCSV(text) {
    if (!text || typeof text !== 'string') return [];
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      alert('El archivo no contiene filas de datos suficientes.');
      return;
    }

    const firstLine = lines[0];
    const sep = firstLine.includes(';') ? ';' : (firstLine.includes('\t') ? '\t' : ',');

    // Normalizar encabezados
    const headers = firstLine.split(sep).map((h) =>
      h.trim().toLowerCase().replace(/^"|"$/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_]/g, '')
    );

    const findIdx = (keywords, defaultIdx) => {
      // 1. Coincidencia exacta
      for (const kw of keywords) {
        const idx = headers.findIndex((h) => h === kw);
        if (idx !== -1) return idx;
      }
      // 2. Coincidencia parcial (evitar que 'tag' o 'peso' colisione con 'tag_cria' o 'peso_cria')
      for (const kw of keywords) {
        const idx = headers.findIndex((h) => h.includes(kw));
        if (idx !== -1) return idx;
      }
      return defaultIdx;
    };

    const hoyDefecto = this.fechaGlobal || new Date().toISOString().split('T')[0];

    // Detección automática si la hoja contiene columnas unificadas de múltiples labores
    const tieneColumnaLabor = headers.some((h) => h === 'labor' || h === 'tipo_labor' || h === 'evento_labor');
    const hasPesajeCol = headers.some((h) => (h === 'peso' || h === 'peso_kg' || h === 'peso_actual') && !h.includes('destet') && !h.includes('cria'));
    const hasPalpCol = headers.some((h) => h.includes('palp'));
    const hasLecheCol = headers.some((h) => h.includes('leche') || h === 'litros' || h === 'total_litros');
    const hasDesteteCol = headers.some((h) => h.includes('destet'));
    const hasPartoCol = headers.some((h) => h.includes('part') || h.includes('cria'));
    const countLaboresDistintas = [hasPesajeCol, hasPalpCol, hasLecheCol, hasDesteteCol, hasPartoCol].filter(Boolean).length;
    const tieneColumnasMultiplesLabores = tieneColumnaLabor || countLaboresDistintas >= 2;

    if (this.tipoCargue === 'labores' || (tieneColumnasMultiplesLabores && this.tipoCargue !== 'inventario')) {
      this.tipoCargue = 'labores';
      const idxTag = findIdx(['numero_animal', 'arete', 'identificacion', 'tag', 'numero', 'id'], 0);
      const idxFecha = findIdx(['fecha_trabajo', 'fecha_labor', 'fecha', 'dia'], 1);
      const idxLabor = findIdx(['labor', 'tipo_labor', 'tipo_evento', 'evento', 'operacion'], 2);

      // Pesaje
      const idxPeso = findIdx(['peso_kg', 'peso_actual', 'peso', 'kilos'], 3);
      const idxCond = findIdx(['condicion_corporal', 'condicion', 'cc'], 4);

      // Palpación
      const idxPalp = findIdx(['palpacion', 'resultado_palpacion', 'resultado', 'diagnostico'], 5);
      const idxDias = findIdx(['dias_gestacion', 'dias_prenez', 'dias', 'gestacion'], 6);
      const idxOvario = findIdx(['estructura_ovario', 'ovario', 'estructura'], 7);

      // Leche
      const idxLeche = findIdx(['leche_litros', 'total_litros', 'litros_leche', 'litros', 'leche'], 8);
      const idxLecheAm = findIdx(['litros_manana', 'manana', 'leche_am', 'am'], -1);
      const idxLechePm = findIdx(['litros_tarde', 'tarde', 'leche_pm', 'pm'], -1);
      const idxUbre = findIdx(['notas_ubre', 'ubre'], -1);

      // Destete
      const idxPesoDestete = findIdx(['peso_destete_kg', 'peso_destete', 'destete_peso'], 9);
      const idxLoteDestino = findIdx(['lote_destino', 'lote_destete', 'destino'], 10);

      // Parto
      const idxSexoCria = findIdx(['sexo_cria', 'sexo_ternero', 'sexo'], 11);
      const idxPesoCria = findIdx(['peso_cria_kg', 'peso_cria', 'peso_nacer'], 12);
      const idxTagCria = findIdx(['tag_cria', 'cria_tag', 'arete_cria', 'cria'], 13);
      const idxPadre = findIdx(['padre_toro', 'padre', 'toro'], -1);
      const idxFechaParto = findIdx(['fecha_parto'], -1);

      // Observaciones
      const idxObs = findIdx(['observaciones', 'notas', 'obs', 'comentarios'], 14);

      this.registros = lines.slice(1).map((l, lineIdx) => {
        const c = l.split(sep).map((v) => v.trim().replace(/^"|"$/g, ''));
        const tag = (c[idxTag] || '').trim();
        let fecha = normalizarFechaISO((c[idxFecha] || '').trim());
        if (!fecha && this.aplicarFechaGlobal) fecha = hoyDefecto;
        const laborRaw = (c[idxLabor] || '').toLowerCase().trim();

        const peso = parseFloat(c[idxPeso]) || null;
        const condicion = (c[idxCond] || '3.5').trim();

        let palpRaw = (c[idxPalp] || '').trim();
        let palpRes = null;
        if (palpRaw) {
          if (palpRaw.toLowerCase().includes('pre') || palpRaw.toLowerCase().includes('gest')) palpRes = 'Preñada';
          else if (palpRaw.toLowerCase().includes('sosp')) palpRes = 'Sospechosa';
          else palpRes = 'Vacía';
        }
        const diasG = parseInt(c[idxDias]) || (palpRes === 'Preñada' ? 60 : 0);
        const ovario = (c[idxOvario] || '').trim();

        let lecheTot = parseFloat(c[idxLeche]) || null;
        const lecheAm = idxLecheAm !== -1 ? (parseFloat(c[idxLecheAm]) || 0) : 0;
        const lechePm = idxLechePm !== -1 ? (parseFloat(c[idxLechePm]) || 0) : 0;
        if ((lecheTot === null || isNaN(lecheTot)) && (lecheAm > 0 || lechePm > 0)) {
          lecheTot = parseFloat((lecheAm + lechePm).toFixed(1));
        }

        const pesoDestete = parseFloat(c[idxPesoDestete]) || null;
        const loteDestino = (c[idxLoteDestino] || '').trim();

        const sexoCriaRaw = (c[idxSexoCria] || '').trim().toLowerCase();
        let sexoCria = null;
        if (sexoCriaRaw.includes('macho') || sexoCriaRaw.startsWith('m')) sexoCria = 'macho';
        else if (sexoCriaRaw.includes('hembra') || sexoCriaRaw.startsWith('h')) sexoCria = 'hembra';
        const pesoCria = parseFloat(c[idxPesoCria]) || null;
        const tagCria = (c[idxTagCria] || '').trim();
        const padre = idxPadre !== -1 ? (c[idxPadre] || '').trim() : '';
        const fechaParto = idxFechaParto !== -1 ? normalizarFechaISO((c[idxFechaParto] || '').trim()) : null;

        const observaciones = (c[idxObs] || '').trim();

        // Determinar qué labores contiene esta fila
        const tienePesaje = (peso !== null && peso > 0) || laborRaw.includes('pesaj');
        const tienePalpacion = palpRes !== null || laborRaw.includes('palp');
        const tieneLeche = (lecheTot !== null && lecheTot > 0) || laborRaw.includes('lech');
        const tieneDestete = (pesoDestete !== null && pesoDestete > 0) || Boolean(loteDestino) || laborRaw.includes('destet');
        const tieneParto = Boolean(sexoCria) || Boolean(tagCria) || (pesoCria !== null && pesoCria > 0) || laborRaw.includes('part');

        const laboresDetectadas = [];
        if (tienePesaje) laboresDetectadas.push(`⚖️ Pesaje (${peso || 0} kg)`);
        if (tienePalpacion) laboresDetectadas.push(`✋ Palpación (${palpRes || 'Preñada'} ${diasG > 0 ? diasG + 'd' : ''})`);
        if (tieneLeche) laboresDetectadas.push(`🥛 Leche (${lecheTot || 0} L)`);
        if (tieneDestete) laboresDetectadas.push(`🌾 Destete (${pesoDestete ? pesoDestete + ' kg' : loteDestino})`);
        if (tieneParto) laboresDetectadas.push(`🍼 Parto (${tagCria || 'Cría ' + (sexoCria || '')})`);

        const errores = [];
        if (!tag) errores.push({ tipo: 'error', mensaje: 'Falta número de arete / tag.' });
        if (laboresDetectadas.length === 0) errores.push({ tipo: 'error', mensaje: 'La fila no contiene datos de pesaje, palpación, leche, destete ni parto.' });

        return {
          idx: lineIdx + 1,
          tag,
          fecha: fecha || hoyDefecto,
          laborIndicada: laborRaw,
          laboresDetectadas,
          // Pesaje
          tienePesaje,
          pesoActual: peso,
          peso: peso,
          fechaPesaje: fecha || hoyDefecto,
          condicionCorporal: condicion,
          // Palpación
          tienePalpacion,
          resultadoPalpacion: palpRes || (laborRaw.includes('palp') ? 'Preñada' : null),
          diasGestacion: diasG,
          estructuraOvario: ovario,
          fechaPalpacion: fecha || hoyDefecto,
          // Leche
          tieneLeche,
          totalLitros: lecheTot,
          litrosManana: lecheAm,
          litrosTarde: lechePm,
          fechaLeche: fecha || hoyDefecto,
          notasUbre: idxUbre !== -1 ? (c[idxUbre] || '').trim() : '',
          // Destete
          tieneDestete,
          pesoDestete,
          fechaDestete: fecha || hoyDefecto,
          loteDestino: loteDestino || 'Levante',
          // Parto
          tieneParto,
          madreTag: tag,
          fechaParto: fechaParto || fecha || hoyDefecto,
          sexoCria: sexoCria || 'hembra',
          pesoCria: pesoCria || 35.0,
          tagCria: tagCria || (tieneParto ? (tag ? `CRIA-${tag}` : `CRIA-${lineIdx + 1}`) : ''),
          padre: padre || 'Desconocido',
          // General
          observaciones,
          errores
        };
      }).filter((r) => r.tag !== '');

    } else if (this.tipoCargue === 'pesajes') {
      const idxTag = findIdx(['tag', 'numero_animal', 'numero', 'arete', 'id'], 0);
      const idxFecha = findIdx(['fecha_pesaje', 'fecha', 'dia'], 1);
      const idxPeso = findIdx(['peso_kg', 'peso_actual', 'peso', 'kilos'], 2);
      const idxCond = findIdx(['condicion_corporal', 'condicion', 'cc'], 3);
      const idxObs = findIdx(['observaciones', 'notas', 'obs'], 4);

      this.registros = lines.slice(1).map((l, lineIdx) => {
        const c = l.split(sep).map((v) => v.trim().replace(/^"|"$/g, ''));
        const tag = (c[idxTag] || '').trim();
        let fecha = normalizarFechaISO((c[idxFecha] || '').trim());
        if (!fecha && this.aplicarFechaGlobal) fecha = hoyDefecto;

        const peso = parseFloat(c[idxPeso]) || null;
        const condicion = (c[idxCond] || '3.5').trim();
        const observaciones = (c[idxObs] || '').trim();

        const errores = [];
        if (!tag) errores.push({ tipo: 'error', mensaje: 'Falta número de arete / tag.' });
        if (!peso || peso <= 0) errores.push({ tipo: 'error', mensaje: 'Peso inválido o nulo.' });

        return {
          idx: lineIdx + 1,
          tag,
          fechaPesaje: fecha || hoyDefecto,
          pesoActual: peso,
          condicionCorporal: condicion,
          observaciones,
          errores
        };
      }).filter((r) => r.tag !== '');

    } else if (this.tipoCargue === 'palpaciones') {
      const idxTag = findIdx(['tag', 'numero_animal', 'numero', 'arete', 'id'], 0);
      const idxFecha = findIdx(['fecha_palpacion', 'fecha', 'dia'], 1);
      const idxRes = findIdx(['resultado', 'diagnostico', 'palpacion', 'estado'], 2);
      const idxDias = findIdx(['dias_gestacion', 'dias', 'gestacion', 'prenez'], 3);
      const idxOvario = findIdx(['estructura_ovario', 'ovario', 'estructura'], 4);
      const idxObs = findIdx(['observaciones', 'notas', 'obs'], 5);

      this.registros = lines.slice(1).map((l, lineIdx) => {
        const c = l.split(sep).map((v) => v.trim().replace(/^"|"$/g, ''));
        const tag = (c[idxTag] || '').trim();
        let fecha = normalizarFechaISO((c[idxFecha] || '').trim());
        if (!fecha && this.aplicarFechaGlobal) fecha = hoyDefecto;

        let resRaw = (c[idxRes] || 'Preñada').trim();
        let resNorm = 'Vacía';
        if (resRaw.toLowerCase().includes('pre') || resRaw.toLowerCase().includes('gest')) {
          resNorm = 'Preñada';
        } else if (resRaw.toLowerCase().includes('sosp')) {
          resNorm = 'Sospechosa';
        }

        const dias = parseInt(c[idxDias]) || (resNorm === 'Preñada' ? 60 : 0);
        const estructuraOvario = (c[idxOvario] || '').trim();
        const observaciones = (c[idxObs] || '').trim();

        const errores = [];
        if (!tag) errores.push({ tipo: 'error', mensaje: 'Falta número de arete / tag.' });

        return {
          idx: lineIdx + 1,
          tag,
          fechaPalpacion: fecha || hoyDefecto,
          resultadoPalpacion: resNorm,
          diasGestacion: dias,
          estructuraOvario,
          observaciones,
          errores
        };
      }).filter((r) => r.tag !== '');

    } else if (this.tipoCargue === 'leche') {
      const idxTag = findIdx(['tag', 'numero_animal', 'numero', 'arete', 'id'], 0);
      const idxFecha = findIdx(['fecha_pesaje_leche', 'fecha_leche', 'fecha'], 1);
      const idxAm = findIdx(['litros_manana', 'manana', 'am'], 2);
      const idxPm = findIdx(['litros_tarde', 'tarde', 'pm'], 3);
      const idxTot = findIdx(['total_litros', 'total', 'litros'], 4);
      const idxObs = findIdx(['notas_ubre', 'observaciones', 'notas', 'ubre'], 5);

      this.registros = lines.slice(1).map((l, lineIdx) => {
        const c = l.split(sep).map((v) => v.trim().replace(/^"|"$/g, ''));
        const tag = (c[idxTag] || '').trim();
        let fecha = normalizarFechaISO((c[idxFecha] || '').trim());
        if (!fecha && this.aplicarFechaGlobal) fecha = hoyDefecto;

        const am = parseFloat(c[idxAm]) || 0;
        const pm = parseFloat(c[idxPm]) || 0;
        let tot = parseFloat(c[idxTot]);
        if (isNaN(tot) || tot === null) tot = parseFloat((am + pm).toFixed(1));
        const notasUbre = (c[idxObs] || '').trim();

        const errores = [];
        if (!tag) errores.push({ tipo: 'error', mensaje: 'Falta número de arete / tag.' });
        if (tot <= 0 && am <= 0 && pm <= 0) errores.push({ tipo: 'error', mensaje: 'Litros de leche inválidos o en cero.' });

        return {
          idx: lineIdx + 1,
          tag,
          fechaLeche: fecha || hoyDefecto,
          litrosManana: am,
          litrosTarde: pm,
          totalLitros: tot,
          notasUbre,
          errores
        };
      }).filter((r) => r.tag !== '');

    } else if (this.tipoCargue === 'partos') {
      const idxMadre = findIdx(['numero_madre', 'madre', 'tag_madre', 'tag'], 0);
      const idxFecha = findIdx(['fecha_parto', 'fecha', 'parto'], 1);
      const idxSexo = findIdx(['sexo_cria', 'sexo', 'genero'], 2);
      const idxPeso = findIdx(['peso_cria_kg', 'peso_cria', 'peso'], 3);
      const idxCria = findIdx(['tag_cria', 'cria_tag', 'cria', 'arete_cria'], 4);
      const idxPadre = findIdx(['padre_toro', 'padre', 'toro'], 5);
      const idxObs = findIdx(['observaciones', 'notas', 'obs'], 6);

      this.registros = lines.slice(1).map((l, lineIdx) => {
        const c = l.split(sep).map((v) => v.trim().replace(/^"|"$/g, ''));
        const tag = (c[idxMadre] || '').trim();
        let fecha = normalizarFechaISO((c[idxFecha] || '').trim());
        if (!fecha && this.aplicarFechaGlobal) fecha = hoyDefecto;

        const sexoRaw = (c[idxSexo] || 'hembra').toLowerCase();
        const sexoCria = sexoRaw.includes('macho') || sexoRaw.startsWith('m') ? 'macho' : 'hembra';
        const pesoCria = parseFloat(c[idxPeso]) || 35.0;
        const tagCria = (c[idxCria] || '').trim() || (tag ? `CRIA-${tag}` : `CRIA-${lineIdx + 1}`);
        const padre = (c[idxPadre] || '').trim() || 'Desconocido';
        const observaciones = (c[idxObs] || '').trim();

        const errores = [];
        if (!tag) errores.push({ tipo: 'error', mensaje: 'Falta número de arete de la madre.' });

        return {
          idx: lineIdx + 1,
          tag,
          madreTag: tag,
          fechaParto: fecha || hoyDefecto,
          sexoCria,
          pesoCria,
          tagCria,
          padre,
          observaciones,
          errores
        };
      }).filter((r) => r.tag !== '');

    } else if (this.tipoCargue === 'destete') {
      const idxTag = findIdx(['numero_animal', 'tag', 'numero', 'cria'], 0);
      const idxFecha = findIdx(['fecha_destete', 'fecha', 'destete'], 1);
      const idxPeso = findIdx(['peso_destete_kg', 'peso_destete', 'peso'], 2);
      const idxLote = findIdx(['lote_destino', 'lote', 'grupo'], 3);
      const idxObs = findIdx(['observaciones', 'notas', 'obs'], 4);

      this.registros = lines.slice(1).map((l, lineIdx) => {
        const c = l.split(sep).map((v) => v.trim().replace(/^"|"$/g, ''));
        const tag = (c[idxTag] || '').trim();
        let fecha = normalizarFechaISO((c[idxFecha] || '').trim());
        if (!fecha && this.aplicarFechaGlobal) fecha = hoyDefecto;

        const pesoDestete = parseFloat(c[idxPeso]) || 180.0;
        const loteDestino = (c[idxLote] || 'Levante').trim();
        const observaciones = (c[idxObs] || '').trim();

        const errores = [];
        if (!tag) errores.push({ tipo: 'error', mensaje: 'Falta número de arete o identificación.' });

        return {
          idx: lineIdx + 1,
          tag,
          fechaDestete: fecha || hoyDefecto,
          pesoDestete,
          loteDestino,
          observaciones,
          errores
        };
      }).filter((r) => r.tag !== '');

    } else {
      // INVENTARIO GENERAL
      const idxTag = findIdx(['tag', 'numero_animal', 'numero', 'arete', 'identificacion', 'id_animal'], 0);
      const idxEspecie = findIdx(['especie', 'tipo_animal'], 1);
      const idxNombre = findIdx(['nombre', 'alias'], 2);
      const idxSexo = findIdx(['sexo', 'genero'], 3);
      const idxRaza = findIdx(['raza'], 4);
      const idxCat = findIdx(['categoria'], 5);
      const idxLote = findIdx(['lote', 'grupo'], 6);
      const idxNac = findIdx(['fecha_nacimiento', 'nacimiento', 'f_nac'], 7);
      const idxPadre = findIdx(['padre', 'toro', 'sire'], 8);
      const idxMadre = findIdx(['madre', 'dam'], 9);

      const idxFechaPesaje = findIdx(['fecha_pesaje_1', 'fecha_pesaje', 'fecha_peso'], 10);
      const idxPeso = findIdx(['peso_actual', 'peso_1', 'peso_pesaje_1', 'peso', 'ultimo_peso'], 11);
      const idxGdp = findIdx(['ganancia_peso_dia', 'gdp', 'ganancia'], 12);
      const idxFechaPalp = findIdx(['fecha_ultima_palpacion', 'fecha_palpacion', 'fecha_palp'], 13);
      const idxResPalp = findIdx(['resultado_ultima_palpacion', 'resultado_palpacion', 'resultado', 'palpacion', 'diagnostico'], 14);
      const idxDiasGest = findIdx(['dias_gestacion', 'gestacion', 'dias_prenez', 'prenez'], 15);
      const idxUltParto = findIdx(['fecha_ultimo_parto', 'ultimo_parto', 'fecha_parto', 'parto'], 16);

      this.registros = lines.slice(1).map((l, lineIdx) => {
        const c = l.split(sep).map((val) => val.trim().replace(/^"|"$/g, ''));

        const tag = (c[idxTag] || '').trim();
        const especieRaw = (c[idxEspecie] || 'vacuno').toLowerCase();
        const especie = especieRaw.includes('buf') ? 'bufalino' : 'bovino';
        const nombre = (c[idxNombre] || '').trim() || (tag ? `Animal ${tag}` : `Ejemplar ${lineIdx + 1}`);
        const sexoRaw = (c[idxSexo] || 'hembra').toLowerCase();
        const sexo = sexoRaw.includes('macho') || sexoRaw.startsWith('m') ? 'macho' : 'hembra';
        const raza = (c[idxRaza] || '').trim() || 'Común';
        const categoria = (c[idxCat] || '').trim() || (sexo === 'macho' ? 'Novillo de Ceba' : 'Vaca de Ordeño');
        const lote = (c[idxLote] || '').trim() || 'General';
        const fechaNacimiento = normalizarFechaISO((c[idxNac] || '').trim());
        const padre = (c[idxPadre] || '').trim() || 'Desconocido';
        const madre = (c[idxMadre] || '').trim() || 'Desconocida';

        let fechaPesaje = normalizarFechaISO((c[idxFechaPesaje] || '').trim());
        let pesoActual = parseFloat(c[idxPeso]) || null;
        if (pesoActual && !fechaPesaje && this.aplicarFechaGlobal) {
          fechaPesaje = hoyDefecto;
        }

        let gdp = c[idxGdp] !== '' && c[idxGdp] !== undefined ? parseFloat(c[idxGdp]) : null;
        let fechaPalpacion = normalizarFechaISO((c[idxFechaPalp] || '').trim());
        let resultadoPalpacion = (c[idxResPalp] || '').trim() || 'Vacía';
        let diasGestacion = parseInt(c[idxDiasGest]) || 0;
        if (resultadoPalpacion && !fechaPalpacion && this.aplicarFechaGlobal) {
          fechaPalpacion = hoyDefecto;
        }
        let fechaUltimoParto = normalizarFechaISO((c[idxUltParto] || '').trim());

        // Normalizar resultado de palpación
        const resLower = resultadoPalpacion.toLowerCase();
        if (resLower.includes('pre') || resLower.includes('gest')) {
          resultadoPalpacion = 'Preñada';
        } else if (resLower.includes('no') || resLower.includes('n/a') || sexo === 'macho') {
          resultadoPalpacion = 'No Aplica';
        } else {
          resultadoPalpacion = 'Vacía';
        }

        const reg = {
          idx: lineIdx + 1,
          tag,
          especie,
          nombre,
          sexo,
          raza,
          categoria,
          lote,
          fechaNacimiento,
          padre,
          madre,
          fechaPesaje,
          pesoActual,
          gdp,
          fechaPalpacion,
          resultadoPalpacion,
          diasGestacion,
          fechaUltimoParto,
          errores: []
        };

        if (!tag) {
          reg.errores.push({ tipo: 'error', mensaje: 'Falta número de arete o identificación.' });
        }

        // Auditoría biológica con IA
        if (reg.pesoActual && reg.fechaPesaje) {
          const errsPeso = auditarPesajeInput(
            { identificacionTag: reg.tag, ultimoPesoKg: null, fechaUltimoPesaje: null },
            reg.pesoActual,
            reg.fechaPesaje,
            []
          );
          reg.errores.push(...errsPeso);
        }

        if (reg.gdp !== null && reg.gdp > 2500) {
          reg.errores.push({ tipo: 'error', mensaje: `GDP de ${reg.gdp} g/día supera el límite biológico en pastoreo (>2500 g/d).` });
        }

        if (reg.resultadoPalpacion === 'Preñada' && reg.sexo === 'macho') {
          reg.errores.push({ tipo: 'error', mensaje: 'Imposibilidad biológica: Un macho no puede registrarse como gestante.' });
        }

        return reg;
      }).filter((r) => r.tag !== '');
    }

    this.render();
  }

  confirmar() {
    const bloqueos = this.registros.filter((r) => r.errores && r.errores.some((e) => e.tipo === 'error'));
    const validos = this.registros.filter((r) => !r.errores || !r.errores.some((e) => e.tipo === 'error'));

    if (bloqueos.length > 0) {
      if (!confirm(`Se detectaron ${bloqueos.length} filas con inconsistencias críticas. ¿Deseas omitirlas y cargar únicamente las ${validos.length} filas válidas?`)) {
        return;
      }
    }

    if (validos.length === 0) {
      alert('No hay registros válidos para importar.');
      return;
    }

    const fincas = this.getFincas ? this.getFincas() : [];
    const fActiva = this.getFincaActiva ? this.getFincaActiva() : null;
    const targetFincaId = this.fincaDestinoId || (fActiva ? fActiva.id : null) || (fincas[0]?.id || null);

    if (!targetFincaId) {
      alert('Debes seleccionar un predio o finca antes de confirmar la importación.');
      return;
    }

    if (this.onImportConfirmada) {
      this.onImportConfirmada(validos, targetFincaId, this.tipoCargue, this.fechaGlobal);
    }
  }

  mostrarInformeResultados({ tipoCargue, totalFilas, importadosExitosos, noEncontrados = [], nombreFinca = '' }) {
    this.informeResultados = { tipoCargue, totalFilas, importadosExitosos, noEncontrados, nombreFinca };
    this.render();
  }

  copiarAretesNoEncontrados() {
    if (!this.informeResultados || !this.informeResultados.noEncontrados) return;
    const tags = this.informeResultados.noEncontrados.map((i) => i.tag).filter(Boolean).join(', ');
    if (!tags) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tags).then(() => {
        alert(`✓ Se copiaron ${this.informeResultados.noEncontrados.length} aretes al portapapeles:\n\n${tags}`);
      }).catch(() => {
        prompt('Copie los aretes no encontrados:', tags);
      });
    } else {
      prompt('Copie los aretes no encontrados:', tags);
    }
  }

  descargarReporteNoEncontradosCSV() {
    if (!this.informeResultados || !this.informeResultados.noEncontrados) return;
    const list = this.informeResultados.noEncontrados;
    let csv = '\uFEFFfila_excel;tag_arete;labor_evento;detalle;causa\r\n';
    list.forEach((item) => {
      csv += `${item.fila || ''};${item.tag || ''};${item.evento || ''};${item.detalle || ''};${item.motivo || ''}\r\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_no_encontrados_${this.informeResultados.tipoCargue || 'masivo'}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  renderModalInforme() {
    if (!this.informeResultados) return '';
    const { tipoCargue = 'eventos', totalFilas = 0, importadosExitosos = 0, noEncontrados = [], nombreFinca = '' } = this.informeResultados;
    const tieneFaltantes = noEncontrados.length > 0;

    return `
      <div id="modal-informe-cargue" class="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[70] flex items-center justify-center p-3 sm:p-5 animate-fadeIn">
        <div class="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
          <!-- CABECERA -->
          <div class="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white p-5 flex justify-between items-center">
            <div class="flex items-center gap-3">
              <span class="text-2xl">${tieneFaltantes ? '⚠️' : '✅'}</span>
              <div>
                <h3 class="font-black text-base">Informe de Carga Masiva: ${tipoCargue.toUpperCase()}</h3>
                <p class="text-xs text-slate-400 mt-0.5">Predio / Finca: <strong>${nombreFinca || 'Predio Activo'}</strong></p>
              </div>
            </div>
            <button id="btn-cerrar-informe-excel" class="text-slate-400 hover:text-white text-lg font-bold p-1 cursor-pointer">✕</button>
          </div>

          <!-- CONTENIDO -->
          <div class="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs">
            <!-- TARJETAS DE RESUMEN -->
            <div class="grid grid-cols-3 gap-3 text-center">
              <div class="bg-emerald-50 border border-emerald-200 p-3.5 rounded-2xl">
                <span class="block text-[10px] font-bold uppercase text-emerald-800">Cargados con Éxito</span>
                <span class="text-2xl font-black font-mono text-emerald-700">${importadosExitosos}</span>
                <span class="text-[10px] text-emerald-600 block mt-0.5">Actualizados / Nuevos</span>
              </div>
              <div class="${tieneFaltantes ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'} border p-3.5 rounded-2xl">
                <span class="block text-[10px] font-bold uppercase ${tieneFaltantes ? 'text-rose-800' : 'text-slate-500'}">No Encontrados</span>
                <span class="text-2xl font-black font-mono ${tieneFaltantes ? 'text-rose-700' : 'text-slate-400'}">${noEncontrados.length}</span>
                <span class="text-[10px] ${tieneFaltantes ? 'text-rose-600 font-bold' : 'text-slate-400'} block mt-0.5">Omitidos</span>
              </div>
              <div class="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
                <span class="block text-[10px] font-bold uppercase text-slate-500">Total Filas</span>
                <span class="text-2xl font-black font-mono text-slate-700">${totalFilas}</span>
                <span class="text-[10px] text-slate-400 block mt-0.5">Leídas de archivo</span>
              </div>
            </div>

            ${tieneFaltantes ? `
              <div class="bg-amber-50 border border-amber-300 p-4 rounded-2xl space-y-3">
                <div class="flex items-start gap-2 text-amber-900">
                  <span class="text-base">📢</span>
                  <div>
                    <h4 class="font-black text-xs">Animales no encontrados en el inventario (${noEncontrados.length})</h4>
                    <p class="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                      Estos ejemplares no se encontraron registrados en la finca seleccionada, por lo que sus registros no pudieron ser aplicados. Puede copiar la lista de aretes o descargar el reporte en CSV para registrarlos en el inventario general.
                    </p>
                  </div>
                </div>

                <div class="flex flex-wrap gap-2">
                  <button id="btn-copiar-aretes-no-encontrados" class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow transition cursor-pointer">
                    <span>📋</span> Copiar Aretes Faltantes
                  </button>
                  <button id="btn-descargar-no-encontrados-csv" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow transition cursor-pointer">
                    <span>📥</span> Descargar Reporte CSV
                  </button>
                </div>

                <div class="max-h-60 overflow-y-auto border border-amber-200 rounded-xl bg-white">
                  <table class="w-full text-left text-xs border-collapse">
                    <thead class="bg-amber-100/70 font-bold text-amber-900 text-[10px] sticky top-0 uppercase">
                      <tr>
                        <th class="p-2 w-16 text-center">Fila</th>
                        <th class="p-2">Tag / Arete</th>
                        <th class="p-2">Labor / Evento</th>
                        <th class="p-2">Datos Fila</th>
                        <th class="p-2">Causa</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-amber-100">
                      ${noEncontrados.map((item) => `
                        <tr class="hover:bg-amber-50/50">
                          <td class="p-2 text-center font-mono text-slate-400">${item.fila || '-'}</td>
                          <td class="p-2 font-black font-mono text-rose-700">${item.tag}</td>
                          <td class="p-2 font-bold text-slate-700">${item.evento}</td>
                          <td class="p-2 font-mono text-slate-600 text-[11px]">${item.detalle || '-'}</td>
                          <td class="p-2 text-rose-600 font-bold text-[11px]">${item.motivo || 'No existe en finca'}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            ` : `
              <div class="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 text-center font-bold">
                🎉 ¡Excelente! Todos los ${importadosExitosos} registros del archivo coincidieron con el inventario y fueron cargados sin inconvenientes.
              </div>
            `}
          </div>

          <!-- FOOTER -->
          <div class="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
            <button id="btn-cerrar-informe-excel-pie" class="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-xl shadow transition cursor-pointer">
              Entendido / Cerrar
            </button>
          </div>
        </div>
      </div>
    `;
  }

  render() {
    if (!this.container) return;

    const fincas = this.getFincas ? this.getFincas() : [];
    const fActiva = this.getFincaActiva ? this.getFincaActiva() : null;
    const targetFincaId = this.fincaDestinoId || (fActiva ? fActiva.id : null) || (fincas[0]?.id || null);
    if (!this.fincaDestinoId && targetFincaId) {
      this.fincaDestinoId = targetFincaId;
    }

    const tipoTitulos = {
      labores: '🌟 Hoja Única de Labores de Campo (5 en 1)',
      inventario: '📦 Inventario General de Animales',
      pesajes: '⚖️ Carga Masiva de Pesajes & GDP',
      palpaciones: '✋ Carga Masiva de Palpaciones & Preñez',
      leche: '🥛 Carga Masiva de Control Lechero',
      partos: '🍼 Carga Masiva de Partos & Crías',
      destete: '🌾 Carga Masiva de Destetes'
    };

    const subtitulos = {
      labores: 'Carga en una sola hoja de Excel todas las labores: pesajes, palpaciones, pesajes de leche, destetes y partos.',
      inventario: 'Plantilla completa con identificación, especie, genealogía, nacimientos, pesajes y preñez.',
      pesajes: 'Carga lotes de pesajes con fecha de jornada, peso en kg y condición corporal.',
      palpaciones: 'Carga diagnósticos reproductivos (Preñada / Vacía), días de gestación y estructuras ováricas.',
      leche: 'Carga producciones de leche por turno mañana/tarde o total diario.',
      partos: 'Carga nacimientos de terneros, peso al nacer, sexo y asignación de madre/padre.',
      destete: 'Carga destetes masivos, peso al destete y asignación a lotes de levante.'
    };

    this.container.innerHTML = `
      <div class="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <!-- HEADER IMPORTADOR -->
        <div class="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <h3 class="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
              <span>📤</span> Carga Masiva con Excel / CSV
              <span class="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                ${this.tipoCargue.toUpperCase()}
              </span>
            </h3>
            <p class="text-xs text-slate-400 mt-0.5">${subtitulos[this.tipoCargue] || 'Importación de datos zootécnicos.'}</p>
          </div>

          <button id="btn-descargar-plantilla" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-2 cursor-pointer active:scale-95">
            <span>📥</span> Descargar Plantilla (.CSV)
          </button>
        </div>

        <!-- SELECTOR TOUCH DE MÓDULO A CARGAR (HOJA ÚNICA, INVENTARIO, PESAJES, PALPACIONES, LECHE, PARTOS, DESTETE) -->
        <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 bg-slate-100 border-b border-slate-200 p-1.5 gap-1.5 text-xs font-black">
          <button class="btn-import-tipo py-2.5 px-2 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${this.tipoCargue === 'labores' ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg border border-emerald-500 font-black' : 'text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300'}" data-tipo="labores">
            <span>🌟</span> Hoja Única (5 Labores)
          </button>
          <button class="btn-import-tipo py-2.5 px-2 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${this.tipoCargue === 'inventario' ? 'bg-white text-emerald-900 shadow border border-slate-200' : 'text-slate-600 hover:bg-slate-200/70'}" data-tipo="inventario">
            <span>📦</span> Inventario
          </button>
          <button class="btn-import-tipo py-2.5 px-2 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${this.tipoCargue === 'pesajes' ? 'bg-white text-emerald-900 shadow border border-slate-200' : 'text-slate-600 hover:bg-slate-200/70'}" data-tipo="pesajes">
            <span>⚖️</span> Pesajes
          </button>
          <button class="btn-import-tipo py-2.5 px-2 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${this.tipoCargue === 'palpaciones' ? 'bg-white text-emerald-900 shadow border border-slate-200' : 'text-slate-600 hover:bg-slate-200/70'}" data-tipo="palpaciones">
            <span>✋</span> Palpaciones
          </button>
          <button class="btn-import-tipo py-2.5 px-2 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${this.tipoCargue === 'leche' ? 'bg-white text-emerald-900 shadow border border-slate-200' : 'text-slate-600 hover:bg-slate-200/70'}" data-tipo="leche">
            <span>🥛</span> Leche
          </button>
          <button class="btn-import-tipo py-2.5 px-2 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${this.tipoCargue === 'partos' ? 'bg-white text-emerald-900 shadow border border-slate-200' : 'text-slate-600 hover:bg-slate-200/70'}" data-tipo="partos">
            <span>🍼</span> Partos
          </button>
          <button class="btn-import-tipo py-2.5 px-2 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${this.tipoCargue === 'destete' ? 'bg-white text-emerald-900 shadow border border-slate-200' : 'text-slate-600 hover:bg-slate-200/70'}" data-tipo="destete">
            <span>🌾</span> Destete
          </button>
        </div>

        <!-- BARRA DE CONFIGURACIÓN SUPERIOR: FECHA DE JORNADA & PREDIO DESTINO -->
        <div class="p-4 sm:p-6 pb-0">
          <div class="bg-gradient-to-r from-emerald-50 via-slate-50 to-blue-50 p-4 rounded-2xl border-2 border-emerald-300 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            
            <!-- FECHA SUPERIOR DE LA JORNADA / CARGA -->
            <div class="flex items-center gap-3 w-full md:w-auto">
              <div class="w-11 h-11 rounded-2xl bg-emerald-700 text-white flex items-center justify-center text-xl shadow shrink-0">
                📅
              </div>
              <div>
                <span class="text-xs font-black uppercase text-emerald-950 tracking-wider block">Fecha de la Jornada / Evento:</span>
                <div class="flex items-center gap-2 mt-1">
                  <input type="date" id="input-fecha-global-excel" value="${this.fechaGlobal}" class="px-3 py-1.5 text-xs font-black font-mono rounded-xl border-2 border-emerald-500 bg-white text-slate-900 shadow-sm outline-none cursor-pointer focus:ring-2 focus:ring-emerald-400">
                  <label class="text-[11px] text-slate-600 font-semibold flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" id="check-aplicar-fecha-global" ${this.aplicarFechaGlobal ? 'checked' : ''} class="rounded text-emerald-600">
                    <span>Aplicar si la fila no trae fecha</span>
                  </label>
                </div>
              </div>
            </div>

            <!-- SELECTOR DE PREDIO DESTINO -->
            <div class="flex items-center gap-3 w-full md:w-auto justify-end">
              <div class="text-right hidden sm:block">
                <span class="text-xs font-black uppercase text-slate-800 block">Finca de Destino:</span>
                <span class="text-[10px] text-slate-500">Asignación automática</span>
              </div>
              <select id="select-finca-importador" class="w-full sm:w-64 px-3.5 py-2 text-xs font-black rounded-xl border-2 border-emerald-500 bg-white text-slate-900 shadow-inner outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer">
                ${fincas.length > 0 ? fincas.map((f) => `<option value="${f.id}" ${f.id === targetFincaId ? 'selected' : ''}>${f.nombre} (${f.areaHa || 0} Ha)</option>`).join('') : '<option value="">(Crea primero una finca)</option>'}
              </select>
            </div>
          </div>
        </div>

        <!-- ZONA DRAG & DROP -->
        <div class="p-4 sm:p-6">
          <div id="drop-zone" class="border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50 hover:bg-emerald-50/30 rounded-2xl p-6 sm:p-8 text-center transition cursor-pointer">
            <input type="file" id="input-archivo-excel" accept=".csv, .txt, .xlsx, .xls" class="hidden">
            <span class="text-4xl block mb-2">📊</span>
            <h4 class="font-black text-slate-800 text-sm">Haga clic o arrastre el archivo Excel (.xlsx, .xls) o CSV aquí</h4>
            <p class="text-xs text-slate-500 mt-1">
              ${tipoTitulos[this.tipoCargue]} • Fecha asignada: <strong class="font-mono text-emerald-800">${this.fechaGlobal}</strong>
            </p>
          </div>

          <!-- PREVISUALIZACIÓN DE REGISTROS -->
          ${this.registros.length > 0 ? `
            <div class="mt-6 space-y-3">
              <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <h4 class="font-black text-slate-900 text-sm flex items-center gap-2">
                  <span>📋</span> Previsualización (${this.registros.length} filas analizadas)
                </h4>
                <button id="btn-confirmar-importacion" class="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer">
                  <span>✓</span> Confirmar e Integrar al Sistema (${this.registros.length})
                </button>
              </div>

              <div class="overflow-x-auto border border-slate-200 rounded-xl">
                <table class="w-full text-xs text-left">
                  <thead class="bg-slate-100 uppercase font-black text-slate-700 text-[10px]">
                    ${this.renderHeadersTabla()}
                  </thead>
                  <tbody class="divide-y divide-slate-100 font-mono">
                    ${this.registros.map((r) => this.renderFilaTabla(r)).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
      ${this.renderModalInforme()}
    `;

    this.attachEvents();
  }

  renderHeadersTabla() {
    if (this.tipoCargue === 'labores') {
      return `
        <tr>
          <th class="p-2.5">#</th>
          <th class="p-2.5">Arete / Tag</th>
          <th class="p-2.5">Fecha</th>
          <th class="p-2.5">Labores Registradas</th>
          <th class="p-2.5">Pesaje</th>
          <th class="p-2.5">Palpación</th>
          <th class="p-2.5">Leche</th>
          <th class="p-2.5">Destete</th>
          <th class="p-2.5">Parto</th>
          <th class="p-2.5">Auditoría</th>
        </tr>
      `;
    } else if (this.tipoCargue === 'pesajes') {
      return `
        <tr>
          <th class="p-2.5">#</th>
          <th class="p-2.5">Arete / Tag</th>
          <th class="p-2.5">Fecha Pesaje</th>
          <th class="p-2.5">Nuevo Peso (kg)</th>
          <th class="p-2.5">Condición</th>
          <th class="p-2.5">Observaciones</th>
          <th class="p-2.5">Auditoría</th>
        </tr>
      `;
    } else if (this.tipoCargue === 'palpaciones') {
      return `
        <tr>
          <th class="p-2.5">#</th>
          <th class="p-2.5">Arete / Tag</th>
          <th class="p-2.5">Fecha Palpación</th>
          <th class="p-2.5">Diagnóstico</th>
          <th class="p-2.5">Días Gestación</th>
          <th class="p-2.5">Estructura Ovárica</th>
          <th class="p-2.5">Auditoría</th>
        </tr>
      `;
    } else if (this.tipoCargue === 'leche') {
      return `
        <tr>
          <th class="p-2.5">#</th>
          <th class="p-2.5">Arete / Tag</th>
          <th class="p-2.5">Fecha Control</th>
          <th class="p-2.5">Mañana (L)</th>
          <th class="p-2.5">Tarde (L)</th>
          <th class="p-2.5">Total Litros</th>
          <th class="p-2.5">Notas Ubre</th>
          <th class="p-2.5">Auditoría</th>
        </tr>
      `;
    } else if (this.tipoCargue === 'partos') {
      return `
        <tr>
          <th class="p-2.5">#</th>
          <th class="p-2.5">Madre (Tag)</th>
          <th class="p-2.5">Fecha Parto</th>
          <th class="p-2.5">Sexo Cría</th>
          <th class="p-2.5">Peso Cría (kg)</th>
          <th class="p-2.5">Tag Cría Generado</th>
          <th class="p-2.5">Padre (Toro)</th>
          <th class="p-2.5">Auditoría</th>
        </tr>
      `;
    } else if (this.tipoCargue === 'destete') {
      return `
        <tr>
          <th class="p-2.5">#</th>
          <th class="p-2.5">Arete / Tag</th>
          <th class="p-2.5">Fecha Destete</th>
          <th class="p-2.5">Peso Destete (kg)</th>
          <th class="p-2.5">Lote Destino</th>
          <th class="p-2.5">Observaciones</th>
          <th class="p-2.5">Auditoría</th>
        </tr>
      `;
    }

    // Inventario General
    return `
      <tr>
        <th class="p-2.5">#</th>
        <th class="p-2.5">Arete</th>
        <th class="p-2.5">Especie</th>
        <th class="p-2.5">Nombre & Sexo</th>
        <th class="p-2.5">Padre / Madre</th>
        <th class="p-2.5">Nacimiento</th>
        <th class="p-2.5">Fecha Pesaje</th>
        <th class="p-2.5">Peso Actual</th>
        <th class="p-2.5 text-right">GDP (g/d)</th>
        <th class="p-2.5">Palpación & Preñez</th>
        <th class="p-2.5">Último Parto</th>
        <th class="p-2.5">Auditoría IA</th>
      </tr>
    `;
  }

  renderFilaTabla(r) {
    const tieneError = r.errores && r.errores.some((e) => e.tipo === 'error');
    const bgRow = tieneError ? 'bg-rose-50/70 text-rose-900' : 'hover:bg-slate-50';

    if (this.tipoCargue === 'labores') {
      return `
        <tr class="${bgRow}">
          <td class="p-2.5 font-bold">${r.idx}</td>
          <td class="p-2.5 font-black text-slate-900 font-mono">${r.tag}</td>
          <td class="p-2.5 whitespace-nowrap font-mono text-slate-600">${r.fecha}</td>
          <td class="p-2.5">
            <div class="flex flex-wrap gap-1">
              ${(r.laboresDetectadas || []).map((l) => `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">${l}</span>`).join('')}
            </div>
          </td>
          <td class="p-2.5 font-bold ${r.tienePesaje ? 'text-emerald-800 font-mono' : 'text-slate-300'}">${r.pesoActual ? `${r.pesoActual} kg` : '-'}</td>
          <td class="p-2.5 font-bold ${r.tienePalpacion ? 'text-purple-800' : 'text-slate-300'}">
            ${r.resultadoPalpacion ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold ${r.resultadoPalpacion === 'Preñada' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">${r.resultadoPalpacion} ${r.diasGestacion ? `(${r.diasGestacion}d)` : ''}</span>` : '-'}
          </td>
          <td class="p-2.5 font-bold ${r.tieneLeche ? 'text-blue-800 font-mono' : 'text-slate-300'}">${r.totalLitros ? `${r.totalLitros} L` : '-'}</td>
          <td class="p-2.5 font-bold ${r.tieneDestete ? 'text-amber-800' : 'text-slate-300'}">${r.tieneDestete ? `${r.pesoDestete ? r.pesoDestete + ' kg' : ''} (${r.loteDestino})` : '-'}</td>
          <td class="p-2.5 font-bold ${r.tieneParto ? 'text-pink-800' : 'text-slate-300'}">${r.tieneParto ? `${r.tagCria} (${r.sexoCria === 'hembra' ? '♀️' : '♂️'})` : '-'}</td>
          <td class="p-2.5 font-sans">
            ${r.errores && r.errores.length > 0 ? `<span class="text-rose-600 font-bold text-[10px]">🚫 ${r.errores[0].mensaje}</span>` : '<span class="text-emerald-600 font-bold text-[10px]">✓ Válido</span>'}
          </td>
        </tr>
      `;
    } else if (this.tipoCargue === 'pesajes') {
      return `
        <tr class="${bgRow}">
          <td class="p-2.5 font-bold">${r.idx}</td>
          <td class="p-2.5 font-black text-slate-900">${r.tag}</td>
          <td class="p-2.5">${r.fechaPesaje}</td>
          <td class="p-2.5 font-bold text-emerald-800">${r.pesoActual} kg</td>
          <td class="p-2.5 font-sans">${r.condicionCorporal}</td>
          <td class="p-2.5 font-sans text-slate-500">${r.observaciones || '-'}</td>
          <td class="p-2.5 font-sans">
            ${r.errores && r.errores.length > 0 ? `<span class="text-rose-600 font-bold text-[10px]">🚫 ${r.errores[0].mensaje}</span>` : '<span class="text-emerald-600 font-bold text-[10px]">✓ Válido</span>'}
          </td>
        </tr>
      `;
    } else if (this.tipoCargue === 'palpaciones') {
      return `
        <tr class="${bgRow}">
          <td class="p-2.5 font-bold">${r.idx}</td>
          <td class="p-2.5 font-black text-slate-900">${r.tag}</td>
          <td class="p-2.5">${r.fechaPalpacion}</td>
          <td class="p-2.5">
            <span class="px-2 py-0.5 rounded font-sans text-[10px] font-bold ${r.resultadoPalpacion === 'Preñada' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">
              ${r.resultadoPalpacion}
            </span>
          </td>
          <td class="p-2.5 font-bold">${r.diasGestacion || 0} d</td>
          <td class="p-2.5 font-sans text-slate-500">${r.estructuraOvario || '-'}</td>
          <td class="p-2.5 font-sans">
            ${r.errores && r.errores.length > 0 ? `<span class="text-rose-600 font-bold text-[10px]">🚫 ${r.errores[0].mensaje}</span>` : '<span class="text-emerald-600 font-bold text-[10px]">✓ Válido</span>'}
          </td>
        </tr>
      `;
    } else if (this.tipoCargue === 'leche') {
      return `
        <tr class="${bgRow}">
          <td class="p-2.5 font-bold">${r.idx}</td>
          <td class="p-2.5 font-black text-slate-900">${r.tag}</td>
          <td class="p-2.5">${r.fechaLeche}</td>
          <td class="p-2.5">${r.litrosManana} L</td>
          <td class="p-2.5">${r.litrosTarde} L</td>
          <td class="p-2.5 font-black text-emerald-800">${r.totalLitros} L</td>
          <td class="p-2.5 font-sans text-slate-500">${r.notasUbre || '-'}</td>
          <td class="p-2.5 font-sans">
            ${r.errores && r.errores.length > 0 ? `<span class="text-rose-600 font-bold text-[10px]">🚫 ${r.errores[0].mensaje}</span>` : '<span class="text-emerald-600 font-bold text-[10px]">✓ Válido</span>'}
          </td>
        </tr>
      `;
    } else if (this.tipoCargue === 'partos') {
      return `
        <tr class="${bgRow}">
          <td class="p-2.5 font-bold">${r.idx}</td>
          <td class="p-2.5 font-black text-slate-900">${r.madreTag}</td>
          <td class="p-2.5">${r.fechaParto}</td>
          <td class="p-2.5 font-sans font-bold ${r.sexoCria === 'hembra' ? 'text-pink-700' : 'text-blue-700'}">${r.sexoCria === 'hembra' ? '♀️ Hembra' : '♂️ Macho'}</td>
          <td class="p-2.5 font-bold">${r.pesoCria} kg</td>
          <td class="p-2.5 font-bold text-slate-900">${r.tagCria}</td>
          <td class="p-2.5 font-sans text-slate-600">${r.padre}</td>
          <td class="p-2.5 font-sans">
            ${r.errores && r.errores.length > 0 ? `<span class="text-rose-600 font-bold text-[10px]">🚫 ${r.errores[0].mensaje}</span>` : '<span class="text-emerald-600 font-bold text-[10px]">✓ Válido</span>'}
          </td>
        </tr>
      `;
    } else if (this.tipoCargue === 'destete') {
      return `
        <tr class="${bgRow}">
          <td class="p-2.5 font-bold">${r.idx}</td>
          <td class="p-2.5 font-black text-slate-900">${r.tag}</td>
          <td class="p-2.5">${r.fechaDestete}</td>
          <td class="p-2.5 font-black text-emerald-800">${r.pesoDestete} kg</td>
          <td class="p-2.5 font-sans">${r.loteDestino}</td>
          <td class="p-2.5 font-sans text-slate-500">${r.observaciones || '-'}</td>
          <td class="p-2.5 font-sans">
            ${r.errores && r.errores.length > 0 ? `<span class="text-rose-600 font-bold text-[10px]">🚫 ${r.errores[0].mensaje}</span>` : '<span class="text-emerald-600 font-bold text-[10px]">✓ Válido</span>'}
          </td>
        </tr>
      `;
    }

    // Inventario
    return `
      <tr class="${bgRow}">
        <td class="p-2.5 font-bold">${r.idx}</td>
        <td class="p-2.5 font-black text-slate-900">${r.tag}</td>
        <td class="p-2.5 uppercase font-bold text-[10px] ${r.especie === 'bufalino' ? 'text-amber-700' : 'text-blue-700'}">
          ${r.especie === 'bufalino' ? '🦬 Bufalino' : '🐂 Vacuno'}
        </td>
        <td class="p-2.5 font-sans">${r.nombre} (${r.sexo === 'hembra' ? '♀️' : '♂️'})</td>
        <td class="p-2.5 font-sans text-[11px]">P: ${r.padre} | M: ${r.madre}</td>
        <td class="p-2.5">${r.fechaNacimiento || '-'}</td>
        <td class="p-2.5">${r.fechaPesaje || '-'}</td>
        <td class="p-2.5 font-bold">${r.pesoActual ? `${r.pesoActual} kg` : '-'}</td>
        <td class="p-2.5 text-right font-bold ${r.gdp < 300 && r.gdp !== null ? 'text-rose-600' : 'text-emerald-700'}">
          ${r.gdp !== null && r.gdp !== undefined ? `${r.gdp > 0 ? '+' : ''}${r.gdp} g/d` : '-'}
        </td>
        <td class="p-2.5">
          <span class="px-2 py-0.5 rounded font-sans text-[10px] font-bold ${r.resultadoPalpacion === 'Preñada' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">
            ${r.resultadoPalpacion} ${r.diasGestacion > 0 ? `(${r.diasGestacion}d preñez)` : ''}
          </span>
        </td>
        <td class="p-2.5">${r.fechaUltimoParto || '-'}</td>
        <td class="p-2.5 font-sans">
          ${r.errores && r.errores.length > 0 ? `
            <span class="text-rose-600 font-bold text-[10px] block">
              🚫 ${r.errores.map((e) => e.mensaje).join('; ')}
            </span>
          ` : `
            <span class="text-emerald-600 font-bold text-[10px]">✓ Válido biológicamente</span>
          `}
        </td>
      </tr>
    `;
  }

  attachEvents() {
    // Selector de tipo de carga
    this.container.querySelectorAll('.btn-import-tipo').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tipo = e.currentTarget.getAttribute('data-tipo');
        if (tipo) this.setTipoCargue(tipo);
      });
    });

    // Input de fecha global superior
    const inFecha = this.container.querySelector('#input-fecha-global-excel');
    if (inFecha) {
      inFecha.addEventListener('change', (e) => {
        this.fechaGlobal = e.target.value;
      });
    }

    const checkGlobal = this.container.querySelector('#check-aplicar-fecha-global');
    if (checkGlobal) {
      checkGlobal.addEventListener('change', (e) => {
        this.aplicarFechaGlobal = e.target.checked;
      });
    }

    // Botón descargar plantilla dinámica
    const btnDescargar = this.container.querySelector('#btn-descargar-plantilla');
    if (btnDescargar) {
      btnDescargar.addEventListener('click', () => this.descargarPlantillaCSV());
    }

    // Drag and drop & input archivo
    const dropZone = this.container.querySelector('#drop-zone');
    const inputArchivo = this.container.querySelector('#input-archivo-excel');

    if (dropZone && inputArchivo) {
      dropZone.addEventListener('click', () => inputArchivo.click());
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-emerald-500', 'bg-emerald-50/50');
      });
      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-emerald-500', 'bg-emerald-50/50');
      });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-emerald-500', 'bg-emerald-50/50');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.procesarArchivo(e.dataTransfer.files[0]);
        }
      });

      inputArchivo.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.procesarArchivo(e.target.files[0]);
        }
      });
    }

    // Selector finca destino
    const selFinca = this.container.querySelector('#select-finca-importador');
    if (selFinca) {
      selFinca.addEventListener('change', (e) => {
        this.fincaDestinoId = e.target.value;
        if (this.onCambiarFinca) {
          this.onCambiarFinca(e.target.value);
        }
      });
    }

    // Botón confirmar importación
    const btnConfirmar = this.container.querySelector('#btn-confirmar-importacion');
    if (btnConfirmar) {
      btnConfirmar.addEventListener('click', () => this.confirmar());
    }

    // Eventos del modal de informe de resultados
    const btnCerrarInf = this.container.querySelector('#btn-cerrar-informe-excel');
    const btnCerrarInfPie = this.container.querySelector('#btn-cerrar-informe-excel-pie');
    const cerrarModal = () => {
      this.informeResultados = null;
      this.render();
    };
    if (btnCerrarInf) btnCerrarInf.addEventListener('click', cerrarModal);
    if (btnCerrarInfPie) btnCerrarInfPie.addEventListener('click', cerrarModal);

    const btnCopiarFaltantes = this.container.querySelector('#btn-copiar-aretes-no-encontrados');
    if (btnCopiarFaltantes) {
      btnCopiarFaltantes.addEventListener('click', () => this.copiarAretesNoEncontrados());
    }

    const btnDescargarCsvFaltantes = this.container.querySelector('#btn-descargar-no-encontrados-csv');
    if (btnDescargarCsvFaltantes) {
      btnDescargarCsvFaltantes.addEventListener('click', () => this.descargarReporteNoEncontradosCSV());
    }
  }
}

