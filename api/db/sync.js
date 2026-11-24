// ============================================================================
// GANADERO AD - /api/db/sync (GET / POST / DELETE)
// Motor unificado de sincronización Multi-Tenant sobre Neon Postgres.
//   GET    -> Descarga completa delimitada por tenant en 1 sola petición gzip.
//   POST   -> Subida diferencial (upserts) de registros modificados + contabilidad/nómina.
//   DELETE -> Eliminaciones explícitas, purgas controladas y reemplazo seguro de animales.
// ============================================================================

import {
    getSql,
    setCorsHeaders,
    ensureNeonSchema,
    bulkUpsert,
    serializeEmpresaRow,
    serializeFincaRow,
    serializeAnimalRow,
    serializePesajeRow,
    serializeOperacionRow,
    formatDateOut,
    numOrZero,
    numOrNull
} from '../_lib/neonDb.js';

export const maxDuration = 60;

function mapFincaDbToApp(row) {
    let rawUbic = row.ubicacion || '';
    let tenantFromUbic = null;
    const m = rawUbic.match(/^\[TENANT:([^\]]+)\](.*)$/);
    if (m) {
        tenantFromUbic = m[1].trim();
        rawUbic = m[2];
    }
    const s = serializeFincaRow(row);
    return {
        id: s.id,
        empresaId: tenantFromUbic || s.empresa_id || null,
        codigo: s.codigo,
        nombre: s.nombre,
        ubicacion: rawUbic,
        areaHa: s.area_ha,
        hectareas: s.area_ha,
        precioLecheLitro: s.precio_leche_litro,
        precioCarneKgPie: s.precio_carne_kg_pie,
        numeroOrdenos: 1,
        tipoOrdeno: 'un_ordeno'
    };
}

function mapAnimalDbToApp(r) {
    const s = serializeAnimalRow(r);
    return {
        id: s.id,
        fincaId: s.finca_id,
        identificacionTag: s.identificacion_tag,
        numero: s.identificacion_tag,
        nombreAlias: s.nombre_alias || '',
        nombre: s.nombre_alias || '',
        especie: s.especie || 'bovino',
        raza: s.raza || 'Común',
        sexo: s.sexo || 'hembra',
        categoria: s.categoria || 'General',
        lote: s.lote || 'General',
        fechaNacimiento: s.fecha_nacimiento,
        padre: s.padre_tag || '',
        padreTag: s.padre_tag || '',
        madre: s.madre_tag || '',
        madreTag: s.madre_tag || '',
        estadoVida: s.estado_vida || 'activo',
        estado: s.estado_vida || 'activo',
        estadoReproductivo: s.estado_reproductivo || 'Vacía',
        diasGestacionActual: s.dias_gestacion_actual,
        fechaUltimoParto: s.fecha_ultimo_parto,
        ultimoPesoKg: s.ultimo_peso_kg,
        fechaUltimoPesaje: s.fecha_ultimo_pesaje,
        gdpPromedioGDia: s.gdp_promedio_g_dia,
        promedioLecheDiariaL: s.promedio_leche_diaria_l,
        partosPrevios: s.partos_previos,
        creadoEn: s.creado_en
    };
}

function mapServicioDbToApp(r) {
    return {
        id: r.id,
        fincaId: r.finca_id,
        animalTag: r.animal_tag,
        tag: r.animal_tag,
        tipo: r.tipo,
        fecha: formatDateOut(r.fecha),
        reproductor: r.reproductor || '',
        codigoPajilla: r.codigo_pajilla || '',
        donadora: r.donadora || '',
        tecnico: r.tecnico || '',
        protocolo: r.protocolo || '',
        resultado: r.resultado || 'Pendiente Chequeo',
        fechaEcografiaEstimada: formatDateOut(r.fecha_ecografia_estimada),
        fechaPalpacionEstimada: formatDateOut(r.fecha_palpacion_estimada),
        fechaPartoEstimada: formatDateOut(r.fecha_parto_estimada),
        observaciones: r.observaciones || ''
    };
}

function mapNutricionDbToApp(r) {
    const dieta = r.sugerencia_dieta && typeof r.sugerencia_dieta === 'object' ? r.sugerencia_dieta : {};
    return {
        id: r.id,
        fincaId: r.finca_id,
        animalId: r.animal_id || null,
        animalTag: r.animal_tag,
        tag: r.animal_tag,
        fechaAnalisis: formatDateOut(r.fecha_analisis),
        etapaProductiva: r.etapa_productiva || 'General',
        tallaFrame: r.talla_frame || '',
        tallaCm: dieta.tallaCm || null,
        frameScore: dieta.frameScore || null,
        categoriaFrame: dieta.categoriaFrame || null,
        indiceCompacidadKgCm: dieta.indiceCompacidadKgCm || null,
        condicionCorporal: numOrNull(r.condicion_corporal),
        pesoActualKg: numOrNull(r.peso_actual_kg),
        gdpEsperadaGDia: numOrNull(r.gdp_esperada_g_dia),
        sugerenciaDieta: dieta,
        sugerenciaMedicamentos: Array.isArray(r.sugerencia_medicamentos) ? r.sugerencia_medicamentos : [],
        sugerenciaHormonas: Array.isArray(r.sugerencia_hormonas) ? r.sugerencia_hormonas : [],
        analisisIA: r.analisis_ia || '',
        notas: r.notas || ''
    };
}

async function handleGet(req, res, sql) {
    const esSuperAdmin = String(req.query?.esSuperAdmin || '') === '1' ||
        String(req.headers?.['x-ganadero-rol'] || '').toLowerCase() === 'superadmin';
    const empId = String(req.query?.empresaId || req.headers?.['x-empresa-id'] || '').trim() || null;
    const empresasParam = String(req.query?.empresasIds || '').trim();
    const empresasReqIds = empresasParam
        ? empresasParam.split(',').map((s) => s.trim()).filter(Boolean)
        : (empId ? [empId] : []);
    const empresasReqSet = new Set(empresasReqIds);
    const fincasParam = String(req.query?.fincasIds || '').trim();
    const fincasReqIds = fincasParam ? fincasParam.split(',').map((s) => s.trim()).filter(Boolean) : [];

    // Fase 1: Estructura maestra + directorio
    const [empresasRows, fincasRows, usuariosRows, dirRows] = await Promise.all([
        sql.query(`SELECT * FROM public.empresas`),
        sql.query(`SELECT * FROM public.fincas`),
        sql.query(`SELECT * FROM public.usuarios`),
        sql.query(`SELECT detalles FROM public.operaciones_diarias WHERE id = 'SYS_DIRECTORIO_EMPRESAS' LIMIT 1`)
    ]);

    const empresas = (empresasRows || []).map((r) => {
        const s = serializeEmpresaRow(r);
        return {
            id: s.id,
            nit: s.nit,
            nombre: s.nombre,
            pais: s.pais,
            moneda: s.moneda,
            email: s.email,
            telefono: s.telefono,
            direccion: s.direccion,
            activa: s.activa,
            fechaVencimiento: s.fecha_vencimiento,
            tiempoIndefinido: s.tiempo_indefinido,
            planVigencia: s.plan_vigencia,
            fechaCreacion: s.creado_en ? s.creado_en.slice(0, 10) : '2026-01-01'
        };
    });

    let fincas = (fincasRows || []).map(mapFincaDbToApp);
    let usuarios = (usuariosRows || []).map((r) => {
        const empAsigRaw = Array.isArray(r.empresas_asignadas) ? r.empresas_asignadas.filter(Boolean) : [];
        const primaryEmp = r.empresa_id || empAsigRaw[0] || null;
        return {
            id: r.id,
            empresaId: primaryEmp,
            empresasAsignadas: empAsigRaw.length > 0 ? empAsigRaw : (primaryEmp ? [primaryEmp] : []),
            usuario: r.usuario,
            nombre: r.nombre,
            rol: r.rol,
            _superadminAutorizado: r.rol === 'superadmin',
            password: r.password || '',
            fincasAsignadas: r.fincas_asignadas !== undefined && r.fincas_asignadas !== null ? r.fincas_asignadas : 'todas',
            email: r.email || '',
            telefono: r.telefono || '',
            activo: r.activo !== false
        };
    });

    let empresasEliminadas = [];
    let fincasEliminadas = [];
    let fincasPurgadas = {};
    let animalesEliminados = [];

    const det = dirRows?.[0]?.detalles && typeof dirRows[0].detalles === 'object' ? dirRows[0].detalles : null;
    if (det) {
        empresasEliminadas = Array.isArray(det.empresasEliminadas) ? det.empresasEliminadas : [];
        fincasEliminadas = Array.isArray(det.fincasEliminadas) ? det.fincasEliminadas : [];
        fincasPurgadas = det.fincasPurgadas && typeof det.fincasPurgadas === 'object' ? det.fincasPurgadas : {};
        animalesEliminados = Array.isArray(det.animalesEliminados) ? det.animalesEliminados : [];

        const elimEmpSet = new Set(empresasEliminadas);
        if (Array.isArray(det.empresas)) {
            det.empresas.forEach((eDir) => {
                if (!eDir || !eDir.id || elimEmpSet.has(eDir.id)) return;
                if (!esSuperAdmin && empresasReqSet.size > 0 && !empresasReqSet.has(eDir.id)) return;
                const idx = empresas.findIndex((ec) => ec.id === eDir.id);
                if (idx === -1) empresas.push(eDir);
                else empresas[idx] = { ...empresas[idx], ...eDir };
            });
        }
        if (det.fincasEmpresaMap && typeof det.fincasEmpresaMap === 'object') {
            fincas.forEach((f) => {
                if (det.fincasEmpresaMap[f.id]) f.empresaId = det.fincasEmpresaMap[f.id];
                else if (!f.empresaId) f.empresaId = 'EMP-01';
            });
        } else {
            fincas.forEach((f) => { if (!f.empresaId) f.empresaId = 'EMP-01'; });
        }
        if (det.fincasOrdenosMap && typeof det.fincasOrdenosMap === 'object') {
            fincas.forEach((f) => {
                if (det.fincasOrdenosMap[f.id] !== undefined) {
                    const numOrd = Number(det.fincasOrdenosMap[f.id]) === 2 ? 2 : 1;
                    f.numeroOrdenos = numOrd;
                    f.tipoOrdeno = numOrd === 2 ? 'doble_ordeno' : 'un_ordeno';
                }
            });
        }
        if (det.usuariosEmpresaMap && typeof det.usuariosEmpresaMap === 'object') {
            usuarios.forEach((u) => {
                if (!u.empresaId && u.rol !== 'superadmin' && det.usuariosEmpresaMap[u.usuario]) {
                    u.empresaId = det.usuariosEmpresaMap[u.usuario];
                }
            });
        }
        if (det.usuariosEmpresasAsignadasMap && typeof det.usuariosEmpresasAsignadasMap === 'object') {
            usuarios.forEach((u) => {
                const arr = det.usuariosEmpresasAsignadasMap[u.usuario];
                if (Array.isArray(arr) && arr.length > 0) {
                    u.empresasAsignadas = Array.from(new Set([...arr, ...(u.empresaId ? [u.empresaId] : [])].filter(Boolean)));
                    if (!u.empresaId) u.empresaId = u.empresasAsignadas[0];
                } else if ((!u.empresasAsignadas || u.empresasAsignadas.length === 0) && u.empresaId) {
                    u.empresasAsignadas = [u.empresaId];
                }
            });
        }
    } else {
        fincas.forEach((f) => { if (!f.empresaId) f.empresaId = 'EMP-01'; });
    }

    let empresasFinal = empresas;
    let fincasIdsFilter = null;
    if (!esSuperAdmin && empresasReqSet.size > 0) {
        empresasFinal = empresas.filter((e) => empresasReqSet.has(e.id));
        fincas = fincas.filter((f) => empresasReqSet.has(f.empresaId));
        usuarios = usuarios.filter((u) =>
            u.rol === 'superadmin' ||
            empresasReqSet.has(u.empresaId) ||
            (Array.isArray(u.empresasAsignadas) && u.empresasAsignadas.some((eid) => empresasReqSet.has(eid)))
        );
        fincasIdsFilter = fincasReqIds.length > 0 ? fincasReqIds : fincas.map((f) => f.id).filter(Boolean);
    }

    // Fase 2: Tablas operativas (en paralelo sobre Neon)
    const usarFiltroFincas = Array.isArray(fincasIdsFilter) && fincasIdsFilter.length > 0;
    const sinFincasPermitidas = Array.isArray(fincasIdsFilter) && fincasIdsFilter.length === 0 && !esSuperAdmin;

    const [
        animalesRows,
        serviciosRows,
        costosRows,
        inversionesRows,
        trasladosRows,
        nutricionRows,
        pesajesRows,
        operacionesRows
    ] = sinFincasPermitidas
        ? [[], [], [], [], [], [], [], []]
        : await Promise.all([
            usarFiltroFincas
                ? sql.query(`SELECT * FROM public.animales WHERE finca_id = ANY($1::text[])`, [fincasIdsFilter])
                : sql.query(`SELECT * FROM public.animales`),
            usarFiltroFincas
                ? sql.query(`SELECT * FROM public.servicios_reproductivos WHERE finca_id = ANY($1::text[])`, [fincasIdsFilter])
                : sql.query(`SELECT * FROM public.servicios_reproductivos`),
            usarFiltroFincas
                ? sql.query(`SELECT * FROM public.costos_fijos_finca WHERE finca_id = ANY($1::text[])`, [fincasIdsFilter])
                : sql.query(`SELECT * FROM public.costos_fijos_finca`),
            usarFiltroFincas
                ? sql.query(`SELECT * FROM public.inversiones_diferidas WHERE finca_id = ANY($1::text[])`, [fincasIdsFilter])
                : sql.query(`SELECT * FROM public.inversiones_diferidas`),
            usarFiltroFincas
                ? sql.query(`SELECT * FROM public.traslados_animales WHERE empresa_id = $1 OR finca_origen_id = ANY($2::text[]) OR finca_destino_id = ANY($2::text[])`, [empId, fincasIdsFilter])
                : sql.query(`SELECT * FROM public.traslados_animales`),
            usarFiltroFincas
                ? sql.query(`SELECT * FROM public.nutricion_animales WHERE finca_id = ANY($1::text[])`, [fincasIdsFilter])
                : sql.query(`SELECT * FROM public.nutricion_animales`),
            usarFiltroFincas
                ? sql.query(`SELECT * FROM public.pesajes_animales WHERE finca_id = ANY($1::text[])`, [fincasIdsFilter])
                : sql.query(`SELECT * FROM public.pesajes_animales`),
            usarFiltroFincas
                ? sql.query(`SELECT * FROM public.operaciones_diarias WHERE (finca_id = ANY($1::text[]) OR empresa_id = $2 OR id LIKE 'SYS_%') AND id NOT LIKE 'ACT-PES-%'`, [fincasIdsFilter, empId])
                : sql.query(`SELECT * FROM public.operaciones_diarias WHERE id NOT LIKE 'ACT-PES-%'`)
        ]);

    const costosFijos = {};
    for (const r of (costosRows || [])) {
        costosFijos[r.finca_id] = {
            nomina: numOrZero(r.nomina),
            insumos: numOrZero(r.insumos),
            herbicidas: numOrZero(r.herbicidas),
            maquinaria: numOrZero(r.maquinaria),
            servicios: numOrZero(r.servicios),
            otros: numOrZero(r.otros)
        };
    }

    const inversiones = (inversionesRows || []).map((r) => ({
        id: r.id,
        fincaId: r.finca_id,
        descripcionActivo: r.descripcion_activo,
        montoTotalInversion: numOrZero(r.monto_total_inversion),
        plazoMesesDiferido: numOrZero(r.plazo_meses_diferido || 12),
        cuotaMensual: numOrZero(r.cuota_mensual),
        estado: r.estado || 'Activa'
    }));

    const traslados = (trasladosRows || []).map((r) => ({
        id: r.id,
        empresaId: r.empresa_id || null,
        fecha: formatDateOut(r.fecha),
        fincaOrigenId: r.finca_origen_id,
        fincaOrigenNombre: r.finca_origen_nombre || '',
        fincaDestinoId: r.finca_destino_id,
        fincaDestinoNombre: r.finca_destino_nombre || '',
        motivo: r.motivo || '',
        observaciones: r.observaciones || '',
        totalAnimales: numOrZero(r.total_animales),
        animales: Array.isArray(r.animales) ? r.animales : [],
        responsable: r.usuario_nombre || '',
        tag: Array.isArray(r.animales) && r.animales[0] ? r.animales[0].tag : '',
        nombreAlias: Array.isArray(r.animales) && r.animales[0] ? r.animales[0].alias : ''
    }));

    const contabilidadMovimientos = [];
    const nominaTrabajadores = [];
    const nominaPagos = [];
    const operacionesDiarias = [];
    const fincasSet = new Set(fincas.map((f) => f.id));

    for (const rawOp of (operacionesRows || [])) {
        const r = serializeOperacionRow(rawOp);
        const idStr = String(r.id || '');
        const d = r.detalles && typeof r.detalles === 'object' ? r.detalles : {};

        if (idStr === 'SYS_DIRECTORIO_EMPRESAS' || r.accion === 'SYS_DIRECTORIO_EMPRESAS' || d._esSistemaDirectorio) {
            continue;
        }
        const pertenece = esSuperAdmin ||
            (r.finca_id && fincasSet.has(r.finca_id)) ||
            (d.fincaId && fincasSet.has(d.fincaId)) ||
            (!empId) ||
            (d.empresaId && d.empresaId === empId) ||
            (r.empresa_id && r.empresa_id === empId);

        if (idStr.startsWith('SYS_CONTAB_MOV_') || d._tipoRegistroSistema === 'contabilidad_movimiento') {
            if (pertenece) {
                const { _tipoRegistroSistema, ...limpio } = d;
                contabilidadMovimientos.push({ ...limpio, id: limpio.id || idStr.replace(/^SYS_CONTAB_MOV_/, '') });
            }
            continue;
        }
        if (idStr.startsWith('SYS_NOMINA_TRAB_') || d._tipoRegistroSistema === 'nomina_trabajador') {
            if (pertenece) {
                const { _tipoRegistroSistema, ...limpio } = d;
                nominaTrabajadores.push({ ...limpio, id: limpio.id || idStr.replace(/^SYS_NOMINA_TRAB_/, '') });
            }
            continue;
        }
        if (idStr.startsWith('SYS_NOMINA_PAGO_') || d._tipoRegistroSistema === 'nomina_pago') {
            if (pertenece) {
                const { _tipoRegistroSistema, ...limpio } = d;
                nominaPagos.push({ ...limpio, id: limpio.id || idStr.replace(/^SYS_NOMINA_PAGO_/, '') });
            }
            continue;
        }

        if (Object.keys(d).length > 0) {
            operacionesDiarias.push({
                ...d,
                id: r.id,
                fecha: r.fecha || d.fecha,
                fincaId: r.finca_id || d.fincaId,
                fincaNombre: r.finca_nombre || d.fincaNombre,
                accion: r.accion || d.accion,
                modulo: r.modulo || d.modulo,
                responsable: r.usuario || d.responsable
            });
        } else {
            operacionesDiarias.push({
                id: r.id,
                fecha: r.fecha,
                fincaId: r.finca_id,
                fincaNombre: r.finca_nombre,
                accion: r.accion,
                modulo: r.modulo,
                responsable: r.usuario
            });
        }
    }

    const pesajes = (pesajesRows || []).map((rawP) => {
        const r = serializePesajeRow(rawP);
        return {
            id: r.id,
            fincaId: r.finca_id,
            tag: r.animal_tag,
            animalTag: r.animal_tag,
            fecha: r.fecha_pesaje,
            pesoNuevo: r.peso_kg,
            peso: r.peso_kg,
            gdp: r.gdp_calculada_g_dia,
            responsable: r.notas || 'Registro de Manga',
            observaciones: r.notas || ''
        };
    });

    return res.status(200).json({
        ok: true,
        provider: 'neon',
        directorio: det || null,
        datos: {
            empresas: empresasFinal,
            fincas,
            usuarios,
            animales: (animalesRows || []).map(mapAnimalDbToApp),
            servicios: (serviciosRows || []).map(mapServicioDbToApp),
            costosFijos,
            inversiones,
            traslados,
            operacionesDiarias,
            pesajes,
            nutricion: (nutricionRows || []).map(mapNutricionDbToApp),
            contabilidadMovimientos,
            nominaTrabajadores,
            nominaPagos,
            empresasEliminadas,
            fincasEliminadas,
            _fincasPurgadas: fincasPurgadas,
            _animalesEliminados: animalesEliminados
        }
    });
}

async function handlePost(req, res, sql) {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const resultados = {
        empresas: 0,
        fincas: 0,
        usuarios: 0,
        animales: 0,
        servicios: 0,
        costosFijos: 0,
        inversiones: 0,
        traslados: 0,
        operacionesDiarias: 0,
        pesajes: 0,
        nutricion: 0
    };

    if (Array.isArray(body.empresas) && body.empresas.length > 0) {
        resultados.empresas = await bulkUpsert(sql, {
            table: 'empresas',
            columns: ['id', 'nit', 'nombre', 'pais', 'moneda', 'email', 'telefono', 'direccion', 'activa', 'fecha_vencimiento', 'tiempo_indefinido', 'plan_vigencia'],
            conflictTarget: 'id',
            updateColumns: ['nit', 'nombre', 'pais', 'moneda', 'email', 'telefono', 'direccion', 'activa', 'fecha_vencimiento', 'tiempo_indefinido', 'plan_vigencia'],
            rows: body.empresas
        });
    }

    if (Array.isArray(body.fincas) && body.fincas.length > 0) {
        const nowIso = new Date().toISOString();
        resultados.fincas = await bulkUpsert(sql, {
            table: 'fincas',
            columns: ['id', 'empresa_id', 'codigo', 'nombre', 'ubicacion', 'area_ha', 'precio_leche_litro', 'precio_carne_kg_pie', 'actualizado_en'],
            tsColumns: ['actualizado_en'],
            conflictTarget: 'id',
            updateColumns: ['empresa_id', 'codigo', 'nombre', 'ubicacion', 'area_ha', 'precio_leche_litro', 'precio_carne_kg_pie', 'actualizado_en'],
            rows: body.fincas.map((f) => {
                let empId = f.empresa_id || null;
                const rawUbic = String(f.ubicacion || '');
                const m = rawUbic.match(/^\[TENANT:([^\]]+)\](.*)$/);
                if (m && !empId) empId = m[1].trim();
                return { ...f, empresa_id: empId, actualizado_en: nowIso };
            })
        });
    }

    if (body.directorio && typeof body.directorio === 'object' && body.directorio.detalles) {
        // Blindaje extra en servidor: jamás aceptar un directorio sin empresas si ya existen empresas en Neon
        const prevRows = await sql.query(`SELECT detalles FROM public.operaciones_diarias WHERE id = 'SYS_DIRECTORIO_EMPRESAS' LIMIT 1`);
        const prevDet = prevRows?.[0]?.detalles || {};
        const nuevoDet = body.directorio.detalles;
        const empMerge = new Map();
        (Array.isArray(prevDet.empresas) ? prevDet.empresas : []).forEach((e) => { if (e && e.id) empMerge.set(e.id, e); });
        (Array.isArray(nuevoDet.empresas) ? nuevoDet.empresas : []).forEach((e) => { if (e && e.id) empMerge.set(e.id, e); });
        const union = (a, b) => Array.from(new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].filter(Boolean)));
        const elimEmp = union(prevDet.empresasEliminadas, nuevoDet.empresasEliminadas);
        const elimEmpSet = new Set(elimEmp);
        const activosSet = new Set(['anuardavid', 'anuararana']);
        if (Array.isArray(body.usuarios)) {
            body.usuarios.forEach((u) => {
                if (u && u.activo !== false) {
                    if (u.usuario) activosSet.add(u.usuario);
                    if (u.id) activosSet.add(u.id);
                }
            });
        }
        const detFinal = {
            ...prevDet,
            ...nuevoDet,
            _esSistemaDirectorio: true,
            empresas: Array.from(empMerge.values()).filter((e) => !elimEmpSet.has(e.id)),
            empresasEliminadas: elimEmp,
            fincasEliminadas: union(prevDet.fincasEliminadas, nuevoDet.fincasEliminadas),
            usuariosEliminados: union(prevDet.usuariosEliminados, nuevoDet.usuariosEliminados).filter((x) => !activosSet.has(x)),
            fincasPurgadas: { ...(prevDet.fincasPurgadas || {}), ...(nuevoDet.fincasPurgadas || {}) },
            fincasEmpresaMap: { ...(prevDet.fincasEmpresaMap || {}), ...(nuevoDet.fincasEmpresaMap || {}) },
            fincasOrdenosMap: { ...(prevDet.fincasOrdenosMap || {}), ...(nuevoDet.fincasOrdenosMap || {}) },
            usuariosEmpresaMap: { ...(prevDet.usuariosEmpresaMap || {}), ...(nuevoDet.usuariosEmpresaMap || {}) },
            usuariosEmpresasAsignadasMap: { ...(prevDet.usuariosEmpresasAsignadasMap || {}), ...(nuevoDet.usuariosEmpresasAsignadasMap || {}) },
            superadminsAutorizados: union(prevDet.superadminsAutorizados, nuevoDet.superadminsAutorizados)
        };
        await bulkUpsert(sql, {
            table: 'operaciones_diarias',
            columns: ['id', 'empresa_id', 'fecha', 'finca_id', 'finca_nombre', 'accion', 'modulo', 'detalles', 'usuario'],
            dateColumns: ['fecha'],
            jsonColumns: ['detalles'],
            conflictTarget: 'id',
            updateColumns: ['fecha', 'detalles'],
            rows: [{
                id: 'SYS_DIRECTORIO_EMPRESAS',
                empresa_id: null,
                fecha: body.directorio.fecha || new Date().toISOString().slice(0, 10),
                finca_id: null,
                finca_nombre: 'SISTEMA',
                accion: 'SYS_DIRECTORIO_EMPRESAS',
                modulo: 'sistema_empresas',
                detalles: detFinal,
                usuario: 'Sistema'
            }]
        });
    }

    if (Array.isArray(body.usuarios) && body.usuarios.length > 0) {
        resultados.usuarios = await bulkUpsert(sql, {
            table: 'usuarios',
            columns: ['id', 'empresa_id', 'empresas_asignadas', 'usuario', 'nombre', 'rol', 'password', 'fincas_asignadas', 'email', 'telefono', 'activo'],
            jsonColumns: ['fincas_asignadas', 'empresas_asignadas'],
            conflictTarget: 'usuario',
            updateColumns: ['empresa_id', 'empresas_asignadas', 'nombre', 'rol', 'password', 'fincas_asignadas', 'email', 'telefono', 'activo'],
            rows: body.usuarios.map((u) => ({
                ...u,
                activo: u.activo !== false,
                empresas_asignadas: Array.isArray(u.empresas_asignadas)
                    ? u.empresas_asignadas
                    : (Array.isArray(u.empresasAsignadas) ? u.empresasAsignadas : (u.empresa_id ? [u.empresa_id] : []))
            }))
        });
    }

    if (Array.isArray(body.animales) && body.animales.length > 0) {
        const nowIso = new Date().toISOString();
        resultados.animales = await bulkUpsert(sql, {
            table: 'animales',
            columns: [
                'id', 'finca_id', 'identificacion_tag', 'nombre_alias', 'especie', 'raza', 'sexo', 'categoria',
                'lote', 'fecha_nacimiento', 'padre_tag', 'madre_tag', 'estado_vida', 'estado_reproductivo',
                'dias_gestacion_actual', 'fecha_ultimo_parto', 'ultimo_peso_kg', 'fecha_ultimo_pesaje',
                'gdp_promedio_g_dia', 'promedio_leche_diaria_l', 'partos_previos', 'actualizado_en'
            ],
            dateColumns: ['fecha_nacimiento', 'fecha_ultimo_parto', 'fecha_ultimo_pesaje'],
            jsonColumns: ['partos_previos'],
            tsColumns: ['actualizado_en'],
            conflictTarget: 'finca_id, identificacion_tag',
            updateColumns: [
                'nombre_alias', 'especie', 'raza', 'sexo', 'categoria', 'lote', 'fecha_nacimiento',
                'padre_tag', 'madre_tag', 'estado_vida', 'estado_reproductivo', 'dias_gestacion_actual',
                'fecha_ultimo_parto', 'ultimo_peso_kg', 'fecha_ultimo_pesaje', 'gdp_promedio_g_dia',
                'promedio_leche_diaria_l', 'partos_previos', 'actualizado_en'
            ],
            rows: body.animales.map((a) => ({
                ...a,
                dias_gestacion_actual: numOrZero(a.dias_gestacion_actual),
                ultimo_peso_kg: numOrNull(a.ultimo_peso_kg),
                gdp_promedio_g_dia: numOrNull(a.gdp_promedio_g_dia),
                promedio_leche_diaria_l: numOrZero(a.promedio_leche_diaria_l),
                partos_previos: Array.isArray(a.partos_previos) ? a.partos_previos : [],
                actualizado_en: nowIso
            })),
            batchSize: 120
        });
    }

    if (Array.isArray(body.servicios) && body.servicios.length > 0) {
        resultados.servicios = await bulkUpsert(sql, {
            table: 'servicios_reproductivos',
            columns: [
                'id', 'finca_id', 'animal_tag', 'tipo', 'fecha', 'reproductor', 'codigo_pajilla', 'donadora',
                'tecnico', 'protocolo', 'resultado', 'fecha_ecografia_estimada', 'fecha_palpacion_estimada',
                'fecha_parto_estimada', 'observaciones'
            ],
            dateColumns: ['fecha', 'fecha_ecografia_estimada', 'fecha_palpacion_estimada', 'fecha_parto_estimada'],
            conflictTarget: 'id',
            updateColumns: ['tipo', 'fecha', 'reproductor', 'codigo_pajilla', 'donadora', 'tecnico', 'protocolo', 'resultado', 'fecha_ecografia_estimada', 'fecha_palpacion_estimada', 'fecha_parto_estimada', 'observaciones'],
            rows: body.servicios
        });
    }

    if (Array.isArray(body.costosFijos) && body.costosFijos.length > 0) {
        const nowIso = new Date().toISOString();
        resultados.costosFijos = await bulkUpsert(sql, {
            table: 'costos_fijos_finca',
            columns: ['finca_id', 'nomina', 'insumos', 'herbicidas', 'maquinaria', 'servicios', 'otros', 'actualizado_en'],
            tsColumns: ['actualizado_en'],
            conflictTarget: 'finca_id',
            updateColumns: ['nomina', 'insumos', 'herbicidas', 'maquinaria', 'servicios', 'otros', 'actualizado_en'],
            rows: body.costosFijos.map((c) => ({ ...c, actualizado_en: nowIso }))
        });
    }

    if (Array.isArray(body.inversiones) && body.inversiones.length > 0) {
        resultados.inversiones = await bulkUpsert(sql, {
            table: 'inversiones_diferidas',
            columns: ['id', 'finca_id', 'descripcion_activo', 'monto_total_inversion', 'plazo_meses_diferido', 'cuota_mensual', 'estado'],
            conflictTarget: 'id',
            updateColumns: ['descripcion_activo', 'monto_total_inversion', 'plazo_meses_diferido', 'cuota_mensual', 'estado'],
            rows: body.inversiones
        });
    }

    if (Array.isArray(body.traslados) && body.traslados.length > 0) {
        resultados.traslados = await bulkUpsert(sql, {
            table: 'traslados_animales',
            columns: ['id', 'empresa_id', 'fecha', 'finca_origen_id', 'finca_origen_nombre', 'finca_destino_id', 'finca_destino_nombre', 'motivo', 'observaciones', 'total_animales', 'animales', 'usuario_nombre'],
            dateColumns: ['fecha'],
            jsonColumns: ['animales'],
            conflictTarget: 'id',
            updateColumns: ['motivo', 'observaciones', 'total_animales', 'animales'],
            rows: body.traslados
        });
    }

    if (Array.isArray(body.operacionesDiarias) && body.operacionesDiarias.length > 0) {
        resultados.operacionesDiarias = await bulkUpsert(sql, {
            table: 'operaciones_diarias',
            columns: ['id', 'empresa_id', 'fecha', 'finca_id', 'finca_nombre', 'accion', 'modulo', 'detalles', 'usuario'],
            dateColumns: ['fecha'],
            jsonColumns: ['detalles'],
            conflictTarget: 'id',
            updateColumns: ['fecha', 'finca_id', 'finca_nombre', 'accion', 'modulo', 'detalles', 'usuario'],
            rows: body.operacionesDiarias,
            batchSize: 100
        });
    }

    if (Array.isArray(body.pesajes) && body.pesajes.length > 0) {
        resultados.pesajes = await bulkUpsert(sql, {
            table: 'pesajes_animales',
            columns: ['id', 'finca_id', 'animal_tag', 'fecha_pesaje', 'peso_kg', 'gdp_calculada_g_dia', 'notas'],
            dateColumns: ['fecha_pesaje'],
            conflictTarget: 'id',
            updateColumns: ['fecha_pesaje', 'peso_kg', 'gdp_calculada_g_dia', 'notas'],
            rows: body.pesajes.map((p) => ({
                ...p,
                peso_kg: numOrZero(p.peso_kg),
                gdp_calculada_g_dia: numOrNull(p.gdp_calculada_g_dia)
            })),
            batchSize: 150
        });
    }

    if (Array.isArray(body.nutricion) && body.nutricion.length > 0) {
        resultados.nutricion = await bulkUpsert(sql, {
            table: 'nutricion_animales',
            columns: ['id', 'finca_id', 'animal_id', 'animal_tag', 'fecha_analisis', 'etapa_productiva', 'talla_frame', 'condicion_corporal', 'peso_actual_kg', 'gdp_esperada_g_dia', 'sugerencia_dieta', 'sugerencia_medicamentos', 'sugerencia_hormonas', 'analisis_ia', 'notas'],
            dateColumns: ['fecha_analisis'],
            jsonColumns: ['sugerencia_dieta', 'sugerencia_medicamentos', 'sugerencia_hormonas'],
            conflictTarget: 'finca_id, animal_tag',
            updateColumns: ['fecha_analisis', 'etapa_productiva', 'talla_frame', 'condicion_corporal', 'peso_actual_kg', 'gdp_esperada_g_dia', 'sugerencia_dieta', 'sugerencia_medicamentos', 'sugerencia_hormonas', 'analisis_ia', 'notas'],
            rows: body.nutricion
        });
    }

    return res.status(200).json({ ok: true, provider: 'neon', resumen: resultados });
}

async function handleDelete(req, res, sql) {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = String(body.action || req.query?.action || '').trim();
    const rolHeader = String(req.headers?.['x-ganadero-rol'] || '').toLowerCase();
    const esSuperAdmin = rolHeader === 'superadmin' || Boolean(body.confirmacionSuperAdmin);

    if (!action) return res.status(400).json({ ok: false, error: 'Parámetro action requerido.' });

    if (action === 'registro_sistema') {
        if (!body.id) return res.status(400).json({ ok: false, error: 'id requerido.' });
        await sql.query(`DELETE FROM public.operaciones_diarias WHERE id = $1`, [String(body.id)]);
        return res.status(200).json({ ok: true });
    }

    if (action === 'animal') {
        const { animalId, fincaId, tag } = body;
        if (fincaId && tag) {
            await Promise.all([
                sql.query(`DELETE FROM public.pesajes_animales WHERE finca_id = $1 AND animal_tag = $2`, [fincaId, tag]),
                sql.query(`DELETE FROM public.servicios_reproductivos WHERE finca_id = $1 AND animal_tag = $2`, [fincaId, tag]),
                sql.query(`DELETE FROM public.palpaciones_reproductivas WHERE finca_id = $1 AND animal_tag = $2`, [fincaId, tag]),
                sql.query(`DELETE FROM public.controles_lecheros WHERE finca_id = $1 AND animal_tag = $2`, [fincaId, tag]),
                sql.query(`DELETE FROM public.nutricion_animales WHERE finca_id = $1 AND animal_tag = $2`, [fincaId, tag])
            ]);
            await sql.query(`DELETE FROM public.animales WHERE finca_id = $1 AND identificacion_tag = $2`, [fincaId, tag]);
        }
        if (animalId) {
            await sql.query(`DELETE FROM public.animales WHERE id = $1`, [animalId]);
        }
        return res.status(200).json({ ok: true });
    }

    if (action === 'reemplazar_animales_finca') {
        if (!body.fincaId) return res.status(400).json({ ok: false, error: 'fincaId requerido.' });
        await sql.query(`DELETE FROM public.animales WHERE finca_id = $1`, [String(body.fincaId)]);
        return res.status(200).json({ ok: true });
    }

    if (action === 'purgar_finca') {
        if (!body.fincaId) return res.status(400).json({ ok: false, error: 'fincaId requerido.' });
        const fid = String(body.fincaId);
        await Promise.all([
            sql.query(`DELETE FROM public.pesajes_animales WHERE finca_id = $1`, [fid]),
            sql.query(`DELETE FROM public.servicios_reproductivos WHERE finca_id = $1`, [fid]),
            sql.query(`DELETE FROM public.palpaciones_reproductivas WHERE finca_id = $1`, [fid]),
            sql.query(`DELETE FROM public.controles_lecheros WHERE finca_id = $1`, [fid]),
            sql.query(`DELETE FROM public.nutricion_animales WHERE finca_id = $1`, [fid]),
            sql.query(`DELETE FROM public.inversiones_diferidas WHERE finca_id = $1`, [fid]),
            sql.query(`DELETE FROM public.operaciones_diarias WHERE finca_id = $1 AND id NOT LIKE 'SYS_%'`, [fid])
        ]);
        await sql.query(`DELETE FROM public.animales WHERE finca_id = $1`, [fid]);
        return res.status(200).json({ ok: true });
    }

    if (action === 'purgar_fincas') {
        const ids = Array.isArray(body.fincasIds) ? body.fincasIds.map(String).filter(Boolean) : [];
        if (ids.length === 0) return res.status(400).json({ ok: false, error: 'fincasIds requerido.' });
        await Promise.all([
            sql.query(`DELETE FROM public.pesajes_animales WHERE finca_id = ANY($1::text[])`, [ids]),
            sql.query(`DELETE FROM public.servicios_reproductivos WHERE finca_id = ANY($1::text[])`, [ids]),
            sql.query(`DELETE FROM public.palpaciones_reproductivas WHERE finca_id = ANY($1::text[])`, [ids]),
            sql.query(`DELETE FROM public.controles_lecheros WHERE finca_id = ANY($1::text[])`, [ids]),
            sql.query(`DELETE FROM public.nutricion_animales WHERE finca_id = ANY($1::text[])`, [ids]),
            sql.query(`DELETE FROM public.inversiones_diferidas WHERE finca_id = ANY($1::text[])`, [ids]),
            sql.query(`DELETE FROM public.operaciones_diarias WHERE finca_id = ANY($1::text[]) AND id NOT LIKE 'SYS_%'`, [ids])
        ]);
        await sql.query(`DELETE FROM public.animales WHERE finca_id = ANY($1::text[])`, [ids]);
        return res.status(200).json({ ok: true });
    }

    if (action === 'finca') {
        if (!body.fincaId) return res.status(400).json({ ok: false, error: 'fincaId requerido.' });
        const fid = String(body.fincaId);
        await sql.query(`DELETE FROM public.operaciones_diarias WHERE finca_id = $1 AND id NOT LIKE 'SYS_%'`, [fid]);
        await sql.query(`DELETE FROM public.fincas WHERE id = $1`, [fid]);
        return res.status(200).json({ ok: true });
    }

    if (action === 'empresa') {
        if (!body.empresaId) return res.status(400).json({ ok: false, error: 'empresaId requerido.' });
        const eid = String(body.empresaId);
        const fRows = await sql.query(`SELECT id FROM public.fincas WHERE empresa_id = $1`, [eid]);
        for (const f of (fRows || [])) {
            await sql.query(`DELETE FROM public.operaciones_diarias WHERE finca_id = $1 AND id NOT LIKE 'SYS_%'`, [f.id]);
            await sql.query(`DELETE FROM public.fincas WHERE id = $1`, [f.id]);
        }
        await Promise.all([
            sql.query(`DELETE FROM public.traslados_animales WHERE empresa_id = $1`, [eid]),
            sql.query(`DELETE FROM public.operaciones_diarias WHERE empresa_id = $1 AND id NOT LIKE 'SYS_%'`, [eid]),
            sql.query(`DELETE FROM public.usuarios WHERE empresa_id = $1 AND rol <> 'superadmin'`, [eid])
        ]);
        await sql.query(`DELETE FROM public.empresas WHERE id = $1`, [eid]);
        return res.status(200).json({ ok: true });
    }

    if (action === 'usuario') {
        const uLogin = String(body.usuario || '').replace(/^@/, '').trim();
        const uId = String(body.usuarioId || '').trim();
        if (!uLogin && !uId) return res.status(400).json({ ok: false, error: 'usuario o usuarioId requerido.' });
        if (uLogin) await sql.query(`DELETE FROM public.usuarios WHERE usuario = $1`, [uLogin]);
        if (uId) await sql.query(`DELETE FROM public.usuarios WHERE id = $1`, [uId]);
        return res.status(200).json({ ok: true });
    }

    if (action === 'registro_tabla') {
        const permitidas = {
            usuarios: ['usuario', 'id'],
            inversiones_diferidas: ['id', 'finca_id'],
            traslados_animales: ['id'],
            servicios_reproductivos: ['id', 'animal_tag'],
            pesajes_animales: ['id', 'animal_tag'],
            nutricion_animales: ['id', 'animal_tag'],
            operaciones_diarias: ['id']
        };
        const colsValidas = permitidas[body.tabla];
        const colSolicitada = String(body.columna || (colsValidas ? colsValidas[0] : '')).trim();
        if (!colsValidas || !colsValidas.includes(colSolicitada) || !body.valor) {
            return res.status(400).json({ ok: false, error: 'Tabla, columna o valor inválido.' });
        }
        await sql.query(`DELETE FROM public.${body.tabla} WHERE ${colSolicitada} = $1`, [String(body.valor)]);
        return res.status(200).json({ ok: true });
    }

    if (action === 'purgar_total' || action === 'limpiar_todo') {
        if (!esSuperAdmin) {
            return res.status(403).json({ ok: false, error: 'Requiere privilegios de Super Administrador.' });
        }
        await Promise.all([
            sql.query(`DELETE FROM public.pesajes_animales`),
            sql.query(`DELETE FROM public.servicios_reproductivos`),
            sql.query(`DELETE FROM public.palpaciones_reproductivas`),
            sql.query(`DELETE FROM public.controles_lecheros`),
            sql.query(`DELETE FROM public.nutricion_animales`),
            sql.query(`DELETE FROM public.inversiones_diferidas`),
            sql.query(`DELETE FROM public.traslados_animales`),
            sql.query(`DELETE FROM public.operaciones_diarias WHERE id <> 'SYS_DIRECTORIO_EMPRESAS'`)
        ]);
        await sql.query(`DELETE FROM public.animales`);
        if (action === 'limpiar_todo') {
            await sql.query(`DELETE FROM public.costos_fijos_finca`);
            await sql.query(`DELETE FROM public.fincas`);
            await sql.query(`DELETE FROM public.usuarios WHERE usuario <> 'anuardavid'`);
            await sql.query(`DELETE FROM public.empresas`);
            await sql.query(`DELETE FROM public.operaciones_diarias`);
        }
        return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: `Acción no soportada: ${action}` });
}

export default async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const sql = getSql();
        await ensureNeonSchema(sql);

        if (req.method === 'GET') return await handleGet(req, res, sql);
        if (req.method === 'POST') return await handlePost(req, res, sql);
        if (req.method === 'DELETE') return await handleDelete(req, res, sql);

        res.setHeader('Allow', ['GET', 'POST', 'DELETE', 'OPTIONS']);
        return res.status(405).json({ error: 'Method Not Allowed' });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err?.message || 'Error en /api/db/sync (Neon)' });
    }
}
