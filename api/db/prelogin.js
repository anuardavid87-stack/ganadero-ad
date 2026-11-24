// ============================================================================
// GANADERO AD - GET /api/db/prelogin
// Directorio ligero pre-login desde Neon Postgres (empresas y usuarios activos).
// ============================================================================

import { getSql, setCorsHeaders, ensureNeonSchema, serializeEmpresaRow } from '../_lib/neonDb.js';

export default async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET', 'OPTIONS']);
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const sql = getSql();
        await ensureNeonSchema(sql);

        const [empresasRows, usuariosRows, dirRows] = await Promise.all([
            sql.query(`SELECT * FROM public.empresas WHERE activa = true`),
            sql.query(`SELECT * FROM public.usuarios WHERE activo = true`),
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

        const usuarios = (usuariosRows || []).map((r) => {
            const empAsigRaw = Array.isArray(r.empresas_asignadas) ? r.empresas_asignadas.filter(Boolean) : [];
            const empId = r.empresa_id || empAsigRaw[0] || null;
            const empresasAsignadas = empAsigRaw.length > 0 ? empAsigRaw : (empId ? [empId] : []);
            return {
                id: r.id,
                empresaId: empId,
                empresasAsignadas,
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

        const det = dirRows?.[0]?.detalles && typeof dirRows[0].detalles === 'object' ? dirRows[0].detalles : null;
        if (det) {
            const eliminadasSet = new Set(Array.isArray(det.empresasEliminadas) ? det.empresasEliminadas : []);
            if (Array.isArray(det.empresas)) {
                det.empresas.forEach((eDir) => {
                    if (!eDir || !eDir.id || eliminadasSet.has(eDir.id) || eDir.activa === false) return;
                    const idx = empresas.findIndex((ec) => ec.id === eDir.id);
                    if (idx === -1) empresas.push(eDir);
                    else empresas[idx] = { ...empresas[idx], ...eDir };
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
        }

        return res.status(200).json({
            ok: true,
            datos: { empresas, usuarios },
            directorio: det || null
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err?.message || 'Error en prelogin Neon' });
    }
}
