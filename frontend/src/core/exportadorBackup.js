/**
 * GANADERO AD PWA - SERVICIO DE COPIA DE SEGURIDAD Y RESGUARDO LOCAL INTEGRAL
 * Genera un archivo Excel (.xlsx) nativo con 11 hojas independientes
 * para resguardo total de la información en local sin depender de la nube.
 */

export class ExportadorBackupService {
  /**
   * Genera y descarga el archivo Excel (.xlsx) con todas las entidades del sistema
   * en hojas separadas.
   */
  static exportarLibroExcel(appState) {
    if (!appState || typeof appState !== 'object') {
      alert('Error: No se encontraron datos para exportar en la copia de seguridad.');
      return false;
    }

    if (typeof window === 'undefined' || !window.XLSX) {
      console.warn('SheetJS (XLSX) no disponible en window, usando descarga JSON de respaldo');
      return this.exportarBackupJSON(appState);
    }

    const XLSX = window.XLSX;
    const wb = XLSX.utils.book_new();

    // Mapas de ayuda para resolver nombres legibles
    const mapaEmpresas = new Map((appState.empresas || []).map(e => [e.id, e.nombre]));
    const mapaFincas = new Map((appState.fincas || []).map(f => [f.id, f.nombre]));

    // 1. HOJA: Empresas
    const rowsEmpresas = (appState.empresas || []).map(e => ({
      'ID Empresa': e.id,
      'NIT': e.nit || '',
      'Razón Social / Nombre': e.nombre || '',
      'País': e.pais || 'Colombia',
      'Moneda': e.moneda || 'COP',
      'Email': e.email || '',
      'Teléfono': e.telefono || '',
      'Dirección': e.direccion || '',
      'Estado': e.activa !== false ? 'Activa' : 'Inactiva',
      'Plan Vigencia': e.planVigencia || '1 Año',
      'Fecha Vencimiento': e.tiempoIndefinido ? 'Tiempo Indefinido' : (e.fechaVencimiento || ''),
      'Tiempo Indefinido': e.tiempoIndefinido ? 'SÍ' : 'NO'
    }));
    const wsEmpresas = XLSX.utils.json_to_sheet(rowsEmpresas.length ? rowsEmpresas : [{ 'Mensaje': 'Sin empresas registradas' }]);
    XLSX.utils.book_append_sheet(wb, wsEmpresas, '1. Empresas');

    // 2. HOJA: Fincas y Predios
    const rowsFincas = (appState.fincas || []).map(f => ({
      'ID Finca': f.id,
      'Empresa': mapaEmpresas.get(f.empresaId) || f.empresaId || 'General',
      'Código Predio': f.codigo || '',
      'Nombre de la Finca': f.nombre || '',
      'Ubicación / Municipio': f.ubicacion || '',
      'Área Total (Ha)': Number(f.areaHa || 0),
      'Precio Leche ($/Litro)': Number(f.precioLecheLitro || 0),
      'Precio Carne ($/Kg)': Number(f.precioCarneKgPie || 0),
      'Lotes Registrados': Array.isArray(f.lotes) ? f.lotes.join(', ') : ''
    }));
    const wsFincas = XLSX.utils.json_to_sheet(rowsFincas.length ? rowsFincas : [{ 'Mensaje': 'Sin fincas registradas' }]);
    XLSX.utils.book_append_sheet(wb, wsFincas, '2. Fincas y Predios');

    // 3. HOJA: Usuarios y Roles
    const rowsUsuarios = (appState.usuarios || []).map(u => ({
      'ID Usuario': u.id,
      'Empresa': mapaEmpresas.get(u.empresaId) || u.empresaId || 'Todas (Superadmin)',
      'Nombre de Usuario': u.usuario,
      'Nombre Completo': u.nombre,
      'Rol Asignado': u.rol,
      'Fincas Autorizadas': Array.isArray(u.fincasAsignadas) ? u.fincasAsignadas.map(id => mapaFincas.get(id) || id).join(', ') : (u.fincasAsignadas || 'Todas'),
      'Email': u.email || '',
      'Teléfono': u.telefono || '',
      'Estado': u.activo !== false ? 'Activo' : 'Inactivo',
      'Fecha Creación': u.fechaCreacion || ''
    }));
    const wsUsuarios = XLSX.utils.json_to_sheet(rowsUsuarios.length ? rowsUsuarios : [{ 'Mensaje': 'Sin usuarios registrados' }]);
    XLSX.utils.book_append_sheet(wb, wsUsuarios, '3. Usuarios y Roles');

    // 4. HOJA: Inventario de Animales
    const rowsAnimales = (appState.animales || []).map(a => ({
      'ID Ejemplar': a.id,
      'Finca / Predio': mapaFincas.get(a.fincaId) || a.fincaId || '',
      'Arete / Tag': a.identificacionTag || a.numeroTag || a.numero || '',
      'Nombre / Alias': a.nombreAlias || a.nombre || '',
      'Especie': a.especie || 'bovino',
      'Raza': a.raza || '',
      'Sexo': a.sexo || '',
      'Categoría Zootécnica': a.categoria || '',
      'Lote': a.lote || 'General',
      'Fecha Nacimiento': a.fechaNacimiento || '',
      'Arete Padre': a.padreTag || a.padre || '',
      'Arete Madre': a.madreTag || a.madre || '',
      'Estado de Vida': a.estadoVida || 'activo',
      'Estado Reproductivo': a.estadoReproductivo || 'Vacía',
      'Días Gestación': Number(a.diasGestacionActual || 0),
      'Fecha Último Parto': a.fechaUltimoParto || '',
      'Último Peso (Kg)': a.ultimoPesoKg ? Number(a.ultimoPesoKg) : '',
      'Fecha Último Pesaje': a.fechaUltimoPesaje || '',
      'GDP Promedio (g/día)': a.gdpPromedioGDia ? Number(a.gdpPromedioGDia) : '',
      'Producción Leche (L/día)': Number(a.promedioLecheDiariaL || 0),
      'Total Partos Previos': Array.isArray(a.partosPrevios) ? a.partosPrevios.length : 0
    }));
    const wsAnimales = XLSX.utils.json_to_sheet(rowsAnimales.length ? rowsAnimales : [{ 'Mensaje': 'Sin animales registrados' }]);
    XLSX.utils.book_append_sheet(wb, wsAnimales, '4. Inventario Animales');

    // 5. HOJA: Historial de Pesajes
    const rowsPesajes = (appState.pesajes || []).map(p => ({
      'ID Pesaje': p.id,
      'Finca / Predio': mapaFincas.get(p.fincaId) || p.fincaId || '',
      'Arete / Tag': p.tag || p.animalTag || '',
      'Nombre / Alias': p.nombreAlias || '',
      'Fecha de Pesaje': p.fecha || p.fechaPesaje || '',
      'Hora': p.hora || '',
      'Peso (Kg)': Number(p.pesoNuevo !== undefined ? p.pesoNuevo : (p.peso || 0)),
      'GDP Calculada (g/día)': p.gdp !== null && p.gdp !== undefined ? Number(p.gdp) : '',
      'Talla Alzada (cm)': p.tallaCm || p.talla || '',
      'Condición Corporal': p.condicionCorporal || p.cc || '',
      'Responsable / Báscula': p.responsable || 'Báscula',
      'Observaciones': p.observaciones || ''
    }));
    const wsPesajes = XLSX.utils.json_to_sheet(rowsPesajes.length ? rowsPesajes : [{ 'Mensaje': 'Sin pesajes registrados' }]);
    XLSX.utils.book_append_sheet(wb, wsPesajes, '5. Historial Pesajes');

    // 6. HOJA: Servicios Reproductivos (IA, TE y Monta)
    const rowsServicios = (appState.servicios || []).map(s => ({
      'ID Servicio': s.id,
      'Finca / Predio': mapaFincas.get(s.fincaId) || s.fincaId || '',
      'Arete Hembra': s.tag || s.animalTag || '',
      'Tipo de Servicio': s.tipo || '',
      'Fecha de Servicio': s.fecha || '',
      'Reproductor / Toro / Pajilla': s.reproductor || '',
      'Código de Pajilla': s.codigoPajilla || '',
      'Donadora': s.donadora || '',
      'Técnico / Inseminador': s.tecnico || '',
      'Protocolo IATF/Biotecnología': s.protocolo || '',
      'Resultado Chequeo': s.resultado || 'Pendiente Chequeo',
      'Fecha Ecografía Estimada': s.fechaEcografiaEstimada || '',
      'Fecha Palpación Estimada': s.fechaPalpacionEstimada || '',
      'Fecha Parto Estimada': s.fechaPartoEstimada || '',
      'Observaciones': s.observaciones || ''
    }));
    const wsServicios = XLSX.utils.json_to_sheet(rowsServicios.length ? rowsServicios : [{ 'Mensaje': 'Sin servicios registrados' }]);
    XLSX.utils.book_append_sheet(wb, wsServicios, '6. Servicios Reproductivos');

    // 7. HOJA: Nutrición Especial y Talla de Pista
    const rowsNutricion = (appState.nutricion || []).map(n => {
      const dieta = n.sugerenciaDieta || {};
      return {
        'ID Plan': n.id,
        'Finca / Predio': mapaFincas.get(n.fincaId) || n.fincaId || '',
        'Arete / Tag': n.tag || n.animalTag || '',
        'Fecha Análisis': n.fechaAnalisis || '',
        'Etapa Productiva': n.etapaProductiva || 'General',
        'Talla (cm)': n.tallaCm || dieta.tallaCm || '',
        'Frame Score (Alzada)': n.frameScore || dieta.frameScore || '',
        'Categoría de Frame': n.categoriaFrame || dieta.categoriaFrame || '',
        'Índice Compacidad (kg/cm)': n.indiceCompacidadKgCm || dieta.indiceCompacidadKgCm || '',
        'Condición Corporal (1-5)': n.condicionCorporal ? Number(n.condicionCorporal) : '',
        'Peso Actual (Kg)': n.pesoActualKg ? Number(n.pesoActualKg) : '',
        'GDP Esperada (g/d)': n.gdpEsperadaGDia ? Number(n.gdpEsperadaGDia) : '',
        'Ración MS Sugerida (kg/d)': dieta.materiaSecaKgDia || '',
        'Concentrado Sugerido (kg/d)': dieta.concentradoKgDia || '',
        'Análisis IA Zootécnico': n.analisisIA || '',
        'Notas de Manejo': n.notas || ''
      };
    });
    const wsNutricion = XLSX.utils.json_to_sheet(rowsNutricion.length ? rowsNutricion : [{ 'Mensaje': 'Sin planes de nutrición registrados' }]);
    XLSX.utils.book_append_sheet(wb, wsNutricion, '7. Nutrición y Talla');

    // 8. HOJA: Costos Fijos por Finca
    const rowsCostos = [];
    if (appState.costosFijos && typeof appState.costosFijos === 'object') {
      for (const [fincaId, c] of Object.entries(appState.costosFijos)) {
        const nomFinca = mapaFincas.get(fincaId) || fincaId;
        const total = Number(c.nomina || 0) + Number(c.insumos || 0) + Number(c.herbicidas || 0) +
                      Number(c.maquinaria || 0) + Number(c.servicios || 0) + Number(c.otros || 0);
        rowsCostos.push({
          'ID Finca': fincaId,
          'Nombre de la Finca': nomFinca,
          'Nómina Mensual ($)': Number(c.nomina || 0),
          'Insumos ($)': Number(c.insumos || 0),
          'Herbicidas / Químicos ($)': Number(c.herbicidas || 0),
          'Maquinaria ($)': Number(c.maquinaria || 0),
          'Servicios Públicos ($)': Number(c.servicios || 0),
          'Otros Costos ($)': Number(c.otros || 0),
          'TOTAL Costos Fijos Mensuales ($)': total
        });
      }
    }
    const wsCostos = XLSX.utils.json_to_sheet(rowsCostos.length ? rowsCostos : [{ 'Mensaje': 'Sin costos fijos registrados' }]);
    XLSX.utils.book_append_sheet(wb, wsCostos, '8. Costos Fijos');

    // 9. HOJA: Inversiones Diferidas
    const rowsInversiones = (appState.inversiones || []).map(i => ({
      'ID Inversión': i.id,
      'Finca / Predio': mapaFincas.get(i.fincaId) || i.fincaId || '',
      'Descripción del Activo': i.descripcionActivo || '',
      'Monto Total Inversión ($)': Number(i.montoTotalInversion || 0),
      'Plazo Meses Diferido': Number(i.plazoMesesDiferido || 12),
      'Cuota Mensual Amortización ($)': Number(i.cuotaMensual || 0),
      'Estado de la Inversión': i.estado || 'Activa'
    }));
    const wsInversiones = XLSX.utils.json_to_sheet(rowsInversiones.length ? rowsInversiones : [{ 'Mensaje': 'Sin inversiones diferidas registradas' }]);
    XLSX.utils.book_append_sheet(wb, wsInversiones, '9. Inversiones Diferidas');

    // 10. HOJA: Traslados de Animales
    const rowsTraslados = (appState.traslados || []).map(t => ({
      'ID Traslado': t.id,
      'Fecha': t.fecha || '',
      'Hora': t.hora || '',
      'Finca Origen': t.fincaOrigenNombre || mapaFincas.get(t.fincaOrigenId) || t.fincaOrigenId || '',
      'Finca Destino': t.fincaDestinoNombre || mapaFincas.get(t.fincaDestinoId) || t.fincaDestinoId || '',
      'Arete / Tag': t.tag || (t.animales && t.animales[0] ? t.animales[0].tag : '') || '',
      'Nombre / Alias': t.nombreAlias || (t.animales && t.animales[0] ? t.animales[0].alias : '') || '',
      'Lote Anterior': t.loteAnterior || '',
      'Lote Destino': t.loteNuevo || '',
      'Motivo': t.motivo || '',
      'Total Ejemplares': Number(t.totalAnimales || 1),
      'Responsable': t.responsable || '',
      'Observaciones': t.observaciones || ''
    }));
    const wsTraslados = XLSX.utils.json_to_sheet(rowsTraslados.length ? rowsTraslados : [{ 'Mensaje': 'Sin traslados registrados' }]);
    XLSX.utils.book_append_sheet(wb, wsTraslados, '10. Traslados');

    // 11. HOJA: Bitácora de Operaciones Diarias
    const rowsOperaciones = (appState.operacionesDiarias || []).map(o => ({
      'ID Operación': o.id,
      'Fecha': o.fecha || '',
      'Hora': o.hora || '',
      'Finca / Predio': o.fincaNombre || mapaFincas.get(o.fincaId) || o.fincaId || '',
      'Módulo / Acción': o.accion || o.modulo || '',
      'Arete / Tag': o.tag || '',
      'Nombre / Alias': o.nombreAlias || '',
      'Detalle Principal': o.detalle || '',
      'Sub-Detalle': o.subDetalle || '',
      'Peso (Kg)': o.peso !== undefined && o.peso !== null ? Number(o.peso) : '',
      'GDP (g/d)': o.gdp !== undefined && o.gdp !== null ? Number(o.gdp) : '',
      'Responsable / Operador': o.responsable || o.usuario || '',
      'Observaciones': o.observaciones || ''
    }));
    const wsOperaciones = XLSX.utils.json_to_sheet(rowsOperaciones.length ? rowsOperaciones : [{ 'Mensaje': 'Sin operaciones registradas' }]);
    XLSX.utils.book_append_sheet(wb, wsOperaciones, '11. Bitácora Operaciones');

    // Generar nombre de archivo con fecha y hora actual
    const ahora = new Date();
    const pad = n => String(n).padStart(2, '0');
    const timestamp = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}_${pad(ahora.getHours())}-${pad(ahora.getMinutes())}`;
    const nombreArchivo = `Copia_Seguridad_Ganadero_AD_${timestamp}.xlsx`;

    try {
      XLSX.writeFile(wb, nombreArchivo);
      return {
        ok: true,
        nombreArchivo,
        resumen: {
          empresas: rowsEmpresas.length,
          fincas: rowsFincas.length,
          usuarios: rowsUsuarios.length,
          animales: rowsAnimales.length,
          pesajes: rowsPesajes.length,
          servicios: rowsServicios.length,
          nutricion: rowsNutricion.length,
          costosFijos: rowsCostos.length,
          inversiones: rowsInversiones.length,
          traslados: rowsTraslados.length,
          operaciones: rowsOperaciones.length
        }
      };
    } catch (err) {
      console.error('Error escribiendo archivo Excel:', err);
      alert('Error descargando el archivo Excel: ' + err.message);
      return false;
    }
  }

  /**
   * Genera y descarga un respaldo completo en JSON crudo (opción alternativa de texto puro).
   */
  static exportarBackupJSON(appState) {
    if (!appState || typeof appState !== 'object') {
      alert('Error: No se encontraron datos para exportar.');
      return false;
    }

    const payload = {
      version: '3.3.0',
      fechaExportacion: new Date().toISOString(),
      origen: 'Ganadero AD PRO PWA',
      datos: {
        empresas: appState.empresas || [],
        fincas: appState.fincas || [],
        usuarios: (appState.usuarios || []).map(u => ({ ...u, password: '***' })),
        animales: appState.animales || [],
        pesajes: appState.pesajes || [],
        servicios: appState.servicios || [],
        nutricion: appState.nutricion || [],
        costosFijos: appState.costosFijos || {},
        inversiones: appState.inversiones || [],
        traslados: appState.traslados || [],
        operacionesDiarias: appState.operacionesDiarias || []
      }
    };

    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const ahora = new Date();
    const pad = n => String(n).padStart(2, '0');
    const timestamp = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}_${pad(ahora.getHours())}-${pad(ahora.getMinutes())}`;
    const nombreArchivo = `Respaldo_Ganadero_AD_${timestamp}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return {
      ok: true,
      nombreArchivo,
      resumen: {
        animales: (appState.animales || []).length,
        pesajes: (appState.pesajes || []).length
      }
    };
  }
}
