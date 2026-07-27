import { Router } from 'express'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { mkdir, unlink } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { pool, query } from '../db.mjs'
import { requireAnyModuleAccess, requireAnyPermission, requirePermission } from '../auth.mjs'
import { computeAdherence, conceptFromPercent, isChecklistValue } from '../checklistScoring.mjs'
import { renderPdf } from '../pdf.mjs'
import { renderChecklistAuditReportHtml, renderChecklistBlankFormatHtml, renderChecklistConsolidatedHtml, renderDataCenterHtml } from '../templates/checklistReport.mjs'
import { CHECKLIST_SEEDS } from '../checklistSeed.mjs'

export const checklistsRouter = Router()

const oid = request => request.auth.organization.id
const uid = request => request.auth.user.id
const checklistsModule = requireAnyModuleAccess(['checklists'])
const view = requirePermission('checklists.view')
const manage = requirePermission('checklists.manage')
const fill = requirePermission('checklists.fill')
// Planes de mejora: ahi conviven dos publicos con permisos distintos — quien audita/administra
// (view) y el colaborador que solo subsana (improve). El recorte fino va dentro de cada endpoint.
const plansAccess = requireAnyPermission(['checklists.view', 'checklists.improve'])

const FIELD_TYPES = new Set(['TEXT', 'LONG_TEXT', 'DATE', 'NUMBER', 'SELECT'])

function fail(status, message) {
  const error = new Error(message)
  error.status = status
  throw error
}

// El constructor manda la estructura completa de una vez (boton "Guardar" explicito), y los
// elementos nuevos llegan con un id temporal del cliente (`new_ab12`). Todo lo que no sea un
// entero es un alta; asi el cliente no necesita saber los ids reales antes de guardar.
function existingId(value) {
  return /^\d+$/.test(String(value ?? '')) ? Number(value) : null
}

async function assertTemplate(request) {
  const result = await query(
    'SELECT * FROM checklist_templates WHERE id = $1 AND organization_id = $2',
    [Number(request.params.id), oid(request)],
  )
  if (!result.rows[0]) fail(404, 'Lista no encontrada')
  return result.rows[0]
}

async function loadStructure(templateId) {
  const [headerFields, subjectFields, domains, criteria] = await Promise.all([
    query('SELECT * FROM checklist_header_fields WHERE template_id = $1 ORDER BY order_index, id', [templateId]),
    query('SELECT * FROM checklist_subject_fields WHERE template_id = $1 ORDER BY order_index, id', [templateId]),
    query('SELECT * FROM checklist_domains WHERE template_id = $1 ORDER BY order_index, id', [templateId]),
    query(
      `SELECT c.* FROM checklist_criteria c JOIN checklist_domains d ON d.id = c.domain_id
       WHERE d.template_id = $1 AND c.active ORDER BY c.order_index, c.id`,
      [templateId],
    ),
  ])
  return {
    headerFields: headerFields.rows,
    subjectFields: subjectFields.rows,
    domains: domains.rows.map(domain => ({
      ...domain,
      criteria: criteria.rows.filter(criterion => String(criterion.domain_id) === String(domain.id)),
    })),
  }
}

// ---- Areas / servicios auditados ----

checklistsRouter.get('/areas', checklistsModule, view, async (request, response, next) => {
  try {
    // Ordenado por centro y luego por servicio: es como se busca ("Urgencias del HOCY"), y el
    // hospital principal va primero.
    const result = await query(
      `SELECT * FROM checklist_areas WHERE organization_id = $1 AND active
        ORDER BY CASE WHEN center LIKE 'Hospital Central%' THEN 0
                      WHEN center = '' THEN 2 ELSE 1 END, center, name`,
      [oid(request)])
    response.json(result.rows)
  } catch (error) { next(error) }
})

checklistsRouter.post('/areas', checklistsModule, manage, async (request, response, next) => {
  try {
    const name = String(request.body?.name || '').trim()
    if (!name) fail(400, 'El nombre del área es obligatorio')
    const result = await query(
      `INSERT INTO checklist_areas (organization_id, center, name) VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, center, name) DO UPDATE SET active = TRUE RETURNING *`,
      [oid(request), String(request.body?.center || '').trim(), name],
    )
    response.status(201).json(result.rows[0])
  } catch (error) { next(error) }
})

checklistsRouter.patch('/areas/:areaId', checklistsModule, manage, async (request, response, next) => {
  try {
    const body = request.body || {}
    const result = await query(
      `UPDATE checklist_areas SET name = COALESCE($1, name), active = COALESCE($2, active)
       WHERE id = $3 AND organization_id = $4 RETURNING *`,
      [body.name !== undefined ? String(body.name).trim() : null, body.active !== undefined ? Boolean(body.active) : null,
        Number(request.params.areaId), oid(request)],
    )
    if (!result.rows[0]) fail(404, 'Área no encontrada')
    response.json(result.rows[0])
  } catch (error) { next(error) }
})


// ---- Programas (a que proceso pertenece cada lista) ----

checklistsRouter.get('/programs', checklistsModule, view, async (request, response, next) => {
  try {
    const result = await query(
      `SELECT p.*, (SELECT COUNT(*)::int FROM checklist_templates t
                     WHERE t.program_id = p.id) AS template_count
         FROM checklist_programs p
        WHERE p.organization_id = $1 AND p.active
        ORDER BY p.order_index, p.name`,
      [oid(request)],
    )
    response.json(result.rows.map(row => ({ ...row, id: String(row.id) })))
  } catch (error) { next(error) }
})

checklistsRouter.post('/programs', checklistsModule, manage, async (request, response, next) => {
  try {
    const name = String(request.body?.name || '').trim()
    if (!name) fail(400, 'El nombre del programa es obligatorio')
    const result = await query(
      `INSERT INTO checklist_programs (organization_id, name, description, order_index)
       VALUES ($1,$2,$3,COALESCE((SELECT MAX(order_index) + 1 FROM checklist_programs WHERE organization_id = $1), 0))
       ON CONFLICT (organization_id, name) DO UPDATE SET active = TRUE RETURNING *`,
      [oid(request), name, String(request.body?.description || '')],
    )
    response.status(201).json({ ...result.rows[0], id: String(result.rows[0].id) })
  } catch (error) { next(error) }
})

// ---- Listas (plantillas) ----

checklistsRouter.get('/', checklistsModule, view, async (request, response, next) => {
  try {
    const result = await query(
      `SELECT t.*, a.name AS area_name, pr.name AS program_name, u.full_name AS created_by_name,
              (SELECT COUNT(*)::int FROM checklist_domains d WHERE d.template_id = t.id) AS domain_count,
              (SELECT COUNT(*)::int FROM checklist_criteria c
                 JOIN checklist_domains d ON d.id = c.domain_id
                WHERE d.template_id = t.id AND c.active) AS criteria_count
       FROM checklist_templates t
       LEFT JOIN checklist_areas a ON a.id = t.area_id
       LEFT JOIN checklist_programs pr ON pr.id = t.program_id
       JOIN users u ON u.id = t.created_by_id
       WHERE t.organization_id = $1
       ORDER BY pr.order_index NULLS LAST, pr.name NULLS LAST, t.code, t.name`,
      [oid(request)],
    )
    response.json(result.rows)
  } catch (error) { next(error) }
})

checklistsRouter.post('/', checklistsModule, manage, async (request, response, next) => {
  try {
    const body = request.body || {}
    const name = String(body.name || '').trim()
    if (!name) fail(400, 'El nombre de la lista es obligatorio')
    const code = String(body.code || '').trim()
    if (code) {
      const duplicate = await query(
        'SELECT id FROM checklist_templates WHERE organization_id = $1 AND code = $2 AND version = $3',
        [oid(request), code, String(body.version || '01').trim()],
      )
      if (duplicate.rows[0]) fail(409, `Ya existe una lista con el código ${code} en esa versión`)
    }
    const inserted = await query(
      `INSERT INTO checklist_templates (organization_id, area_id, program_id, code, version, name, description, subject_label, numbered_items, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [oid(request), body.areaId ? Number(body.areaId) : null,
        body.programId ? Number(body.programId) : null,
        code, String(body.version || '01').trim(), name,
        String(body.description || ''), String(body.subjectLabel || 'Sujeto auditado').trim() || 'Sujeto auditado',
        Boolean(body.numberedItems), uid(request)],
    )
    response.status(201).json({ ...inserted.rows[0], headerFields: [], subjectFields: [], domains: [] })
  } catch (error) { next(error) }
})


// ===========================================================================
// FASE 2 — Diligenciamiento
// ===========================================================================

// ---- Asignaciones (quien puede diligenciar que lista) ----

checklistsRouter.get('/memberships', checklistsModule, manage, async (request, response, next) => {
  try {
    const result = await query(
      `SELECT m.id, u.full_name, u.email, r.name AS role_name
       FROM memberships m JOIN users u ON u.id = m.user_id JOIN roles r ON r.id = m.role_id
       WHERE m.organization_id = $1 AND m.active AND u.active
       ORDER BY u.full_name`,
      [oid(request)],
    )
    response.json(result.rows)
  } catch (error) { next(error) }
})

checklistsRouter.get('/:id/assignments', checklistsModule, manage, async (request, response, next) => {
  try {
    const template = await assertTemplate(request)
    const result = await query('SELECT membership_id FROM checklist_assignments WHERE template_id = $1', [template.id])
    response.json(result.rows.map(row => String(row.membership_id)))
  } catch (error) { next(error) }
})

checklistsRouter.put('/:id/assignments', checklistsModule, manage, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const template = await assertTemplate(request)
    const ids = (Array.isArray(request.body?.membershipIds) ? request.body.membershipIds : []).map(Number).filter(Boolean)
    await client.query('BEGIN')
    await client.query('DELETE FROM checklist_assignments WHERE template_id = $1', [template.id])
    for (const membershipId of ids) {
      // Solo membresias de la misma entidad: el id llega del cliente y no se confia en el.
      await client.query(
        `INSERT INTO checklist_assignments (template_id, membership_id)
         SELECT $1, m.id FROM memberships m WHERE m.id = $2 AND m.organization_id = $3
         ON CONFLICT DO NOTHING`,
        [template.id, membershipId, oid(request)],
      )
    }
    await client.query('COMMIT')
    response.json({ ok: true, count: ids.length })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    next(error)
  } finally { client.release() }
})

// Listas que YO puedo diligenciar. Un admin-tier ve todas las publicadas (no se le pide estar
// asignado a si mismo); un USUARIO ve solo las que le asignaron.
checklistsRouter.get('/assigned/mine', checklistsModule, view, async (request, response, next) => {
  try {
    const canManage = request.auth.permissions.includes('checklists.manage')
    const params = [oid(request)]
    // Quien administra ve tambien los borradores: el servidor le deja abrirlos, asi que
    // ocultarlos aqui solo dejaria el selector vacio sin explicar por que.
    let where = canManage
      ? "t.organization_id = $1 AND t.status <> 'ARCHIVADA'"
      : "t.organization_id = $1 AND t.status = 'PUBLICADA'"
    if (!canManage) {
      params.push(request.auth.membershipId)
      where += ` AND EXISTS (SELECT 1 FROM checklist_assignments a WHERE a.template_id = t.id AND a.membership_id = $${params.length})`
    }
    const result = await query(
      `SELECT t.id, t.code, t.version, t.name, t.subject_label, t.numbered_items, t.status, a.name AS area_name
       FROM checklist_templates t LEFT JOIN checklist_areas a ON a.id = t.area_id
       WHERE ${where} ORDER BY t.name`,
      params,
    )
    response.json(result.rows)
  } catch (error) { next(error) }
})

// ---- Directorio reutilizable de sujetos auditados ----

checklistsRouter.get('/subjects/directory', checklistsModule, view, async (request, response, next) => {
  try {
    const params = [oid(request)]
    let where = 'organization_id = $1 AND active'
    if (request.query.templateId) {
      params.push(Number(request.query.templateId))
      where += ` AND (template_id = $${params.length} OR template_id IS NULL)`
    }
    const result = await query(`SELECT * FROM checklist_subjects WHERE ${where} ORDER BY display_name LIMIT 300`, params)
    response.json(result.rows)
  } catch (error) { next(error) }
})

// ---- Auditorias ----

async function assertAudit(request, { requireOpen = false } = {}) {
  const result = await query(
    `SELECT a.*, t.name AS template_name, t.code, t.version, t.subject_label, t.numbered_items,
            ar.name AS area_name, u.full_name AS auditor_name
     FROM checklist_audits a
     JOIN checklist_templates t ON t.id = a.template_id
     LEFT JOIN checklist_areas ar ON ar.id = a.area_id
     JOIN users u ON u.id = a.auditor_id
     WHERE a.id = $1 AND a.organization_id = $2`,
    [Number(request.params.auditId), oid(request)],
  )
  const audit = result.rows[0]
  if (!audit) fail(404, 'Auditoría no encontrada')
  // AISLAMIENTO POR AUTOR. Una auditoria lleva nombre de paciente, documento, cama y firmas: es
  // dato sensible. El listado ya filtraba por auditor, pero el DETALLE no, asi que bastaba pedir
  // /audits/<id> con otro id para leer la ronda de un companero. Ocultarlo en la interfaz no es
  // proteger nada; la comprobacion tiene que estar aqui, que es por donde pasan todas las rutas
  // de una auditoria (ver, editar, firmar, cerrar, PDF).
  if (!request.auth.permissions.includes('checklists.manage') && String(audit.auditor_id) !== String(uid(request))) {
    fail(403, 'Esta auditoría es de otro auditor')
  }
  // Una auditoria cerrada es un registro firmado: no se le tocan respuestas ni sujetos.
  if (requireOpen && audit.status === 'CERRADA') fail(409, 'La auditoría está cerrada. Reábrela para modificarla.')
  return audit
}

/**
 * Deja constancia en la bitacora. Se le pasa `client` cuando va dentro de una transaccion, para
 * que el registro se revierta con ella y no queden apuntes de cosas que no llegaron a pasar.
 */
/** Etiqueta legible de la auditoria para la bitacora: tiene que seguir diciendo algo cuando la
 *  fila ya no exista, asi que se guarda el texto, no el id. */
function auditLabel(audit) {
  const code = audit.template_code || audit.code || ''
  // pg devuelve DATE como objeto Date: cortarlo como texto daba "Mon Jul 13 2026" en la
  // bitacora. Se normaliza a AAAA-MM-DD, que es lo que se lee y se ordena.
  const raw = audit.audit_date
  const date = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw || '').slice(0, 10)
  return [code, audit.template_name, date].filter(Boolean).join(' · ')
}

async function logAudit(request, { auditId, label, action, detail = '' }, client = null) {
  const run = client ? client.query.bind(client) : query
  await run(
    `INSERT INTO checklist_audit_log (organization_id, audit_id, audit_label, action, detail, actor_id, actor_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [oid(request), auditId, label, action, detail, uid(request), request.auth.user.fullName || ''],
  )
}

/**
 * Congela la adherencia por dominio y por sujeto. El tablero agrega sobre miles de respuestas y
 * recalcular en cada consulta no escala; ademas un resultado ya firmado tiene que quedar tal
 * como se firmo, aunque despues cambie la lista.
 */
async function persistResults(client, auditId, result) {
  await client.query('DELETE FROM checklist_audit_domain_results WHERE audit_id = $1', [auditId])
  await client.query('DELETE FROM checklist_audit_subject_results WHERE audit_id = $1', [auditId])
  for (const row of result.byDomain) {
    await client.query(
      `INSERT INTO checklist_audit_domain_results (audit_id, domain_id, c, nc, na, percent)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [auditId, row.domainId, row.c, row.nc, row.na, row.percent])
  }
  for (const row of result.bySubject) {
    await client.query(
      `INSERT INTO checklist_audit_subject_results (audit_id, audit_subject_id, c, nc, na, percent)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [auditId, row.subjectId, row.c, row.nc, row.na, row.percent])
  }
}

async function auditPayload(audit) {
  const structure = await loadStructure(audit.template_id)
  const [subjects, answers, headerFields, signatures, evidences, staff, plans] = await Promise.all([
    // linked_membership_id: si el sujeto del directorio esta enlazado a un usuario, la pantalla
    // de la ronda puede preseleccionar al responsable del plan de mejora.
    query(
      `SELECT s.*, cs.membership_id AS linked_membership_id
         FROM checklist_audit_subjects s
         LEFT JOIN checklist_subjects cs ON cs.id = s.subject_id
        WHERE s.audit_id = $1 ORDER BY s.order_index, s.id`,
      [audit.id]),
    query('SELECT * FROM checklist_answers WHERE audit_id = $1', [audit.id]),
    query('SELECT * FROM checklist_header_fields WHERE template_id = $1 ORDER BY order_index, id', [audit.template_id]),
    query('SELECT * FROM checklist_signatures WHERE audit_id = $1 ORDER BY signed_at', [audit.id]),
    query(`SELECT e.*, u.full_name AS uploaded_by_name FROM checklist_evidences e
             LEFT JOIN users u ON u.id = e.uploaded_by_id
            WHERE e.audit_id = $1 ORDER BY e.created_at`, [audit.id]),
    query('SELECT * FROM checklist_audit_staff WHERE audit_id = $1 ORDER BY order_index, id', [audit.id]),
    query(
      `SELECT p.id, p.criterion_id, p.audit_subject_id, p.status, p.assigned_name, p.finding,
              p.subject_name, p.criterion_text, p.created_at
         FROM checklist_action_plans p WHERE p.audit_id = $1 ORDER BY p.created_at, p.id`,
      [audit.id]),
  ])
  const result = computeAdherence({
    domains: structure.domains,
    subjects: subjects.rows.map(row => ({ id: row.id })),
    answers: answers.rows.map(row => ({ subject_id: row.audit_subject_id, criterion_id: row.criterion_id, value: row.value })),
  })
  return {
    ...audit,
    // .rows, no el resultado crudo de pg: los demas campos ya lo hacian y este se quedo atras.
    // Salia un objeto donde el cliente y la plantilla del PDF esperan un array, asi que
    // reventaban por igual la pantalla de diligenciamiento y el informe.
    headerFields: headerFields.rows,
    subjectFields: structure.subjectFields,
    domains: structure.domains,
    subjects: subjects.rows,
    answers: answers.rows,
    signatures: signatures.rows,
    evidences: evidences.rows.map(row => ({ ...row, id: String(row.id) })),
    staff: staff.rows.map(row => ({ ...row, id: String(row.id) })),
    plans: plans.rows.map(row => ({ ...row, id: String(row.id) })),
    adherence: { ...result, concept: conceptFromPercent(result.overall.percent) },
  }
}

checklistsRouter.get('/audits/list', checklistsModule, view, async (request, response, next) => {
  try {
    const canManage = request.auth.permissions.includes('checklists.manage')
    const params = [oid(request)]
    let where = 'a.organization_id = $1'
    // Quien no administra ve solo sus propias auditorias.
    if (!canManage) { params.push(request.auth.user.id); where += ` AND a.auditor_id = $${params.length}` }
    const result = await query(
      `SELECT a.id, a.audit_date, a.shift, a.status, a.adherence_percent, a.concept, a.created_at,
              a.template_code, a.template_version, a.area_id, a.template_id,
              t.name AS template_name, t.code, ar.name AS area_name, u.full_name AS auditor_name,
              (SELECT COUNT(*)::int FROM checklist_audit_subjects s WHERE s.audit_id = a.id) AS subject_count
       FROM checklist_audits a
       JOIN checklist_templates t ON t.id = a.template_id
       LEFT JOIN checklist_areas ar ON ar.id = a.area_id
       JOIN users u ON u.id = a.auditor_id
       WHERE ${where} ORDER BY a.audit_date DESC, a.id DESC LIMIT 200`,
      params,
    )
    response.json(result.rows)
  } catch (error) { next(error) }
})

checklistsRouter.post('/audits', checklistsModule, fill, async (request, response, next) => {
  try {
    const body = request.body || {}
    const templateId = Number(body.templateId)
    if (!templateId) fail(400, 'Selecciona la lista a diligenciar')
    // Fecha y servicio se exigen tambien aqui, no solo en el formulario: son las dos claves con
    // las que el tablero ubica la ronda despues, y una auditoria sin ellas no se puede filtrar
    // ni corregir. El turno queda opcional porque no todas las listas se hacen por turno.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.auditDate || ''))) {
      fail(400, 'Indica la fecha de la ronda (AAAA-MM-DD)')
    }
    if (!body.areaId) fail(400, 'Indica el servicio o área de la ronda')
    const template = await query(
      "SELECT * FROM checklist_templates WHERE id = $1 AND organization_id = $2 AND status <> 'ARCHIVADA'",
      [templateId, oid(request)],
    )
    if (!template.rows[0]) fail(404, 'La lista no existe o está archivada')
    // Publicar es un filtro de CIRCULACION, no de acceso: existe para que calidad revise antes
    // de que la lista llegue a los auditores. Quien administra ya la reviso — obligarle a
    // publicar solo para poder abrirla en la tablet no protege nada y deja las 13 listas
    // recien cargadas sin forma de usarse.
    if (!request.auth.permissions.includes('checklists.manage')) {
      if (template.rows[0].status !== 'PUBLICADA') fail(409, 'La lista todavía no está publicada')
      const assigned = await query(
        'SELECT 1 FROM checklist_assignments WHERE template_id = $1 AND membership_id = $2',
        [templateId, request.auth.membershipId],
      )
      if (!assigned.rows[0]) fail(403, 'No tienes asignada esta lista')
    }
    const inserted = await query(
      `INSERT INTO checklist_audits (organization_id, template_id, area_id, audit_date, shift, header_values,
                                     template_code, template_version, auditor_id, updated_by_id)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$9) RETURNING *`,
      [oid(request), templateId,
        body.areaId ? Number(body.areaId) : template.rows[0].area_id,
        body.auditDate || new Date().toISOString().slice(0, 10),
        body.shift ? String(body.shift).trim() : null,
        JSON.stringify(body.headerValues || {}),
        template.rows[0].code, template.rows[0].version, uid(request)],
    )
    await logAudit(request, {
      auditId: inserted.rows[0].id,
      label: auditLabel({ ...inserted.rows[0], template_name: template.rows[0].name }),
      action: 'CREADA',
    })
    response.status(201).json(inserted.rows[0])
  } catch (error) { next(error) }
})

// Bitacora consultable: quien creo, cerro, reabrio, edito o elimino cada auditoria.
checklistsRouter.get('/audits/log', checklistsModule, manage, async (request, response, next) => {
  try {
    const result = await query(
      `SELECT id, audit_id, audit_label, action, detail, actor_name, created_at
         FROM checklist_audit_log WHERE organization_id = $1
        ORDER BY created_at DESC, id DESC LIMIT 200`,
      [oid(request)],
    )
    response.json(result.rows)
  } catch (error) { next(error) }
})

checklistsRouter.get('/audits/:auditId', checklistsModule, view, async (request, response, next) => {
  try {
    const audit = await assertAudit(request)
    // Consultar una ronda ajena queda registrado: lleva nombre de paciente, documento y firmas.
    // El auditor abriendo LO SUYO no se anota, o la bitacora se llena de ruido y deja de servir
    // para lo que importa, que es saber quien miro lo que no es suyo.
    if (String(audit.auditor_id) !== String(uid(request))) {
      await logAudit(request, { auditId: audit.id, label: auditLabel(audit), action: 'CONSULTADA', detail: 'Abrió el detalle' })
    }
    response.json(await auditPayload(audit))
  } catch (error) { next(error) }
})

checklistsRouter.patch('/audits/:auditId', checklistsModule, fill, async (request, response, next) => {
  try {
    const audit = await assertAudit(request, { requireOpen: true })
    const body = request.body || {}
    const sets = []
    const params = []
    const set = (column, value) => { params.push(value); sets.push(`${column} = $${params.length}`) }
    const changed = []
    if (body.auditDate !== undefined) { set('audit_date', body.auditDate); changed.push('fecha') }
    if (body.areaId !== undefined) { set('area_id', body.areaId ? Number(body.areaId) : null); changed.push('servicio') }
    if (body.shift !== undefined) { set('shift', body.shift ? String(body.shift).trim() : null); changed.push('turno') }
    if (body.headerValues !== undefined) {
      params.push(JSON.stringify(body.headerValues)); sets.push(`header_values = $${params.length}::jsonb`)
      changed.push('cabecera')
    }
    if (!sets.length) return response.json(audit)
    set('updated_by_id', uid(request))
    params.push(audit.id)
    await query(`UPDATE checklist_audits SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params)
    await logAudit(request, {
      auditId: audit.id, label: auditLabel(audit), action: 'EDITADA',
      detail: `Cambió ${changed.join(', ')}`,
    })
    const refreshed = await assertAudit(request)
    response.json(await auditPayload(refreshed))
  } catch (error) { next(error) }
})

// Borrar exige `manage`, no `fill`: un auditor diligencia lo suyo, pero eliminar el registro de
// una ronda -- incluso una ya cerrada y firmada -- es una decision de calidad. La constancia se
// escribe ANTES del DELETE y sobrevive a la fila borrada.
checklistsRouter.delete('/audits/:auditId', checklistsModule, manage, async (request, response, next) => {
  try {
    const audit = await assertAudit(request)
    await logAudit(request, {
      auditId: audit.id, label: auditLabel(audit), action: 'ELIMINADA',
      detail: `${audit.status === 'CERRADA' ? 'Estaba cerrada' : 'Estaba en borrador'}${
        audit.adherence_percent !== null && audit.adherence_percent !== undefined
          ? ` con ${Number(audit.adherence_percent).toFixed(1)} %` : ''}`,
    })
    await query('DELETE FROM checklist_audits WHERE id = $1 AND organization_id = $2', [audit.id, oid(request)])
    response.json({ ok: true })
  } catch (error) { next(error) }
})

// Borrado por seleccion. En una transaccion: o se van todas o no se va ninguna, para que una
// seleccion de veinte no quede a medias sin que nadie sepa cuales cayeron.
checklistsRouter.post('/audits/bulk-delete', checklistsModule, manage, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const ids = (Array.isArray(request.body?.ids) ? request.body.ids : []).map(Number).filter(Boolean)
    if (!ids.length) fail(400, 'No seleccionaste ninguna auditoría')
    const found = await client.query(
      `SELECT a.*, t.name AS template_name FROM checklist_audits a
         JOIN checklist_templates t ON t.id = a.template_id
        WHERE a.id = ANY($1::bigint[]) AND a.organization_id = $2`,
      [ids, oid(request)],
    )
    if (!found.rows.length) fail(404, 'No se encontraron esas auditorías')
    await client.query('BEGIN')
    for (const audit of found.rows) {
      await logAudit(request, {
        auditId: audit.id, label: auditLabel(audit), action: 'ELIMINADA',
        detail: `Borrado por selección (${found.rows.length} auditorías)`,
      }, client)
    }
    await client.query(
      'DELETE FROM checklist_audits WHERE id = ANY($1::bigint[]) AND organization_id = $2',
      [found.rows.map(row => row.id), oid(request)],
    )
    await client.query('COMMIT')
    response.json({ ok: true, deleted: found.rows.length })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    next(error)
  } finally { client.release() }
})

// ---- Sujetos de la auditoria ----

checklistsRouter.post('/audits/:auditId/subjects', checklistsModule, fill, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const audit = await assertAudit(request, { requireOpen: true })
    const body = request.body || {}
    const displayName = String(body.displayName || '').trim()
    if (!displayName) fail(400, 'Escribe el identificador del sujeto auditado')
    const attributes = body.attributes && typeof body.attributes === 'object' ? body.attributes : {}

    await client.query('BEGIN')
    let directoryId = body.subjectId ? Number(body.subjectId) : null
    if (directoryId) {
      const exists = await client.query('SELECT id FROM checklist_subjects WHERE id = $1 AND organization_id = $2', [directoryId, oid(request)])
      if (!exists.rows[0]) directoryId = null
    }
    // Alta en el directorio para poder reutilizarlo en rondas siguientes sin volver a teclearlo.
    if (!directoryId && body.saveToDirectory !== false) {
      const created = await client.query(
        `INSERT INTO checklist_subjects (organization_id, template_id, display_name, attributes)
         VALUES ($1,$2,$3,$4::jsonb) RETURNING id`,
        [oid(request), audit.template_id, displayName, JSON.stringify(attributes)],
      )
      directoryId = created.rows[0].id
    }
    const order = await client.query('SELECT COALESCE(MAX(order_index), -1) + 1 AS n FROM checklist_audit_subjects WHERE audit_id = $1', [audit.id])
    const inserted = await client.query(
      `INSERT INTO checklist_audit_subjects (audit_id, subject_id, display_name, attributes_snapshot, order_index)
       VALUES ($1,$2,$3,$4::jsonb,$5) RETURNING *`,
      [audit.id, directoryId, displayName, JSON.stringify(attributes), order.rows[0].n],
    )
    await client.query('COMMIT')
    response.status(201).json(inserted.rows[0])
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    next(error)
  } finally { client.release() }
})

checklistsRouter.delete('/audits/:auditId/subjects/:subjectRowId', checklistsModule, fill, async (request, response, next) => {
  try {
    const audit = await assertAudit(request, { requireOpen: true })
    await query('DELETE FROM checklist_audit_subjects WHERE id = $1 AND audit_id = $2',
      [Number(request.params.subjectRowId), audit.id])
    response.json({ ok: true })
  } catch (error) { next(error) }
})

// ---- Respuestas ----

checklistsRouter.put('/audits/:auditId/answers', checklistsModule, fill, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const audit = await assertAudit(request, { requireOpen: true })
    const entries = Array.isArray(request.body?.answers) ? request.body.answers : []
    await client.query('BEGIN')
    for (const entry of entries) {
      const subjectRowId = Number(entry.auditSubjectId)
      const criterionId = Number(entry.criterionId)
      if (!subjectRowId || !criterionId) continue
      // value null = el auditor deshizo la marca. Se BORRA la fila, no se guarda como NA:
      // "sin responder" y "no aplica" son cosas distintas (NA es una decision deliberada).
      if (entry.value === null || entry.value === undefined || entry.value === '') {
        await client.query('DELETE FROM checklist_answers WHERE audit_subject_id = $1 AND criterion_id = $2', [subjectRowId, criterionId])
        continue
      }
      if (!isChecklistValue(entry.value)) continue
      await client.query(
        `INSERT INTO checklist_answers (audit_id, audit_subject_id, criterion_id, value, observation)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (audit_subject_id, criterion_id)
         DO UPDATE SET value = EXCLUDED.value, observation = EXCLUDED.observation`,
        [audit.id, subjectRowId, criterionId, entry.value, String(entry.observation || '')],
      )
    }
    await client.query(
      'UPDATE checklist_audits SET updated_at = NOW(), updated_by_id = $2 WHERE id = $1',
      [audit.id, uid(request)])
    await client.query('COMMIT')
    const refreshed = await assertAudit(request)
    response.json(await auditPayload(refreshed))
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    next(error)
  } finally { client.release() }
})



// ---- Personal de turno de la ronda ----
// Es una lista y no un campo de texto: en una ronda puede haber varios profesionales, igual que
// hay varios pacientes, y como texto suelto no se podia buscar despues.

checklistsRouter.post('/audits/:auditId/staff', checklistsModule, fill, async (request, response, next) => {
  try {
    const audit = await assertAudit(request, { requireOpen: true })
    const fullName = String(request.body?.fullName || '').trim()
    if (!fullName) fail(400, 'Escribe el nombre del profesional')
    const inserted = await query(
      `INSERT INTO checklist_audit_staff (audit_id, full_name, role, order_index)
       VALUES ($1,$2,$3,COALESCE((SELECT MAX(order_index) + 1 FROM checklist_audit_staff WHERE audit_id = $1), 0))
       RETURNING *`,
      [audit.id, fullName, String(request.body?.role || '').trim()],
    )
    response.status(201).json({ ...inserted.rows[0], id: String(inserted.rows[0].id) })
  } catch (error) { next(error) }
})

checklistsRouter.delete('/audits/:auditId/staff/:staffId', checklistsModule, fill, async (request, response, next) => {
  try {
    const audit = await assertAudit(request, { requireOpen: true })
    await query('DELETE FROM checklist_audit_staff WHERE id = $1 AND audit_id = $2',
      [Number(request.params.staffId), audit.id])
    response.json({ ok: true })
  } catch (error) { next(error) }
})

// ---- Evidencias de una auditoria ----
//
// Los archivos NO se sirven como estatico publico, a diferencia de las presentaciones de
// encuestas: aqui una foto puede mostrar a un paciente o una historia clinica. Se guardan fuera
// del arbol servido y se entregan solo por la ruta de descarga de abajo, que vuelve a pasar por
// assertAudit — es decir, por el mismo aislamiento por autor que el resto.
const evidenceRoot = resolve(process.env.CHECKLISTS_UPLOAD_DIR || 'uploads/checklists')
await mkdir(evidenceRoot, { recursive: true }).catch(() => {})

// El despliegue crea una carpeta nueva por release y solo enlaza .env; lo que quede dentro del
// release se pierde en el siguiente. Si la ruta de evidencias cae ahi, el sistema seguiria
// funcionando y las fotos desapareceran sin que nadie se entere hasta que hagan falta. Se avisa
// fuerte al arrancar en vez de dejarlo en silencio.
if (evidenceRoot.split(sep).includes('releases')) {
  console.warn(
    `[checklists] AVISO: las evidencias se estan guardando dentro del release (${evidenceRoot}). ` +
    'Se perderan en el proximo despliegue. Define CHECKLISTS_UPLOAD_DIR apuntando a la carpeta compartida.',
  )
}

const EVIDENCE_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf',
])

const evidenceUpload = multer({
  storage: multer.diskStorage({
    destination: evidenceRoot,
    // Nombre generado, nunca el del usuario: un nombre original puede traer rutas ("../") o
    // caracteres que el sistema de archivos interprete.
    filename: (_request, file, callback) => callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase().slice(0, 8)}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (EVIDENCE_TYPES.has(file.mimetype)) return callback(null, true)
    const error = new Error('Solo se permiten imágenes (JPG, PNG, WEBP, HEIC) o PDF de hasta 10 MB')
    error.status = 415
    callback(error)
  },
})

checklistsRouter.post('/audits/:auditId/evidences', checklistsModule, fill, evidenceUpload.single('file'), async (request, response, next) => {
  try {
    const audit = await assertAudit(request, { requireOpen: true })
    if (!request.file) fail(400, 'No llegó ningún archivo')
    const inserted = await query(
      `INSERT INTO checklist_evidences (audit_id, criterion_id, audit_subject_id, stored_name,
                                        original_name, mime_type, size_bytes, uploaded_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [audit.id,
        request.body?.criterionId ? Number(request.body.criterionId) : null,
        request.body?.auditSubjectId ? Number(request.body.auditSubjectId) : null,
        request.file.filename, request.file.originalname, request.file.mimetype, request.file.size,
        uid(request)],
    )
    await logAudit(request, {
      auditId: audit.id, label: auditLabel(audit), action: 'EDITADA',
      detail: `Adjuntó evidencia "${request.file.originalname}"`,
    })
    response.status(201).json({ ...inserted.rows[0], id: String(inserted.rows[0].id) })
  } catch (error) { next(error) }
})

// Descarga. Pasa por assertAudit a proposito: si el archivo se sirviera por su nombre desde una
// carpeta estatica, cualquiera con la URL lo tendria, y esa URL viaja en el HTML.
checklistsRouter.get('/audits/:auditId/evidences/:evidenceId', checklistsModule, view, async (request, response, next) => {
  try {
    const audit = await assertAudit(request)
    const result = await query(
      'SELECT * FROM checklist_evidences WHERE id = $1 AND audit_id = $2',
      [Number(request.params.evidenceId), audit.id],
    )
    const evidence = result.rows[0]
    if (!evidence) fail(404, 'Evidencia no encontrada')
    await logAudit(request, {
      auditId: audit.id, label: auditLabel(audit), action: 'DESCARGADA',
      detail: `Evidencia "${evidence.original_name}"`,
    })
    response.setHeader('Content-Type', evidence.mime_type || 'application/octet-stream')
    response.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(evidence.original_name)}"`)
    response.sendFile(join(evidenceRoot, evidence.stored_name))
  } catch (error) { next(error) }
})

checklistsRouter.delete('/audits/:auditId/evidences/:evidenceId', checklistsModule, fill, async (request, response, next) => {
  try {
    const audit = await assertAudit(request, { requireOpen: true })
    const result = await query(
      'DELETE FROM checklist_evidences WHERE id = $1 AND audit_id = $2 RETURNING *',
      [Number(request.params.evidenceId), audit.id],
    )
    const evidence = result.rows[0]
    if (!evidence) fail(404, 'Evidencia no encontrada')
    // El archivo se borra despues de la fila: si falla el disco, no queda una fila apuntando a
    // algo que ya no esta.
    await unlink(join(evidenceRoot, evidence.stored_name)).catch(() => {})
    await logAudit(request, {
      auditId: audit.id, label: auditLabel(audit), action: 'EDITADA',
      detail: `Quitó la evidencia "${evidence.original_name}"`,
    })
    response.json({ ok: true })
  } catch (error) { next(error) }
})

// Observaciones generales de la ronda.
checklistsRouter.put('/audits/:auditId/notes', checklistsModule, fill, async (request, response, next) => {
  try {
    const audit = await assertAudit(request, { requireOpen: true })
    const notes = String(request.body?.notes ?? '').slice(0, 4000)
    await query('UPDATE checklist_audits SET notes = $1, updated_at = NOW(), updated_by_id = $2 WHERE id = $3',
      [notes, uid(request), audit.id])
    response.json({ ok: true })
  } catch (error) { next(error) }
})

// ---- Firmas ----
// La firma se guarda como PNG en data URL. Se limita el tamano porque el trazo llega desde un
// canvas del cliente: sin tope, una firma manipulada podria inflar la fila sin control.
const MAX_SIGNATURE_BYTES = 400 * 1024

// Directorio de firmantes: se deriva de las firmas ya registradas en la entidad en vez de
// mantener una tabla aparte. Asi el directorio se mantiene solo — quien firmo una vez queda
// disponible para las rondas siguientes, sin alta previa ni datos que se queden viejos.
checklistsRouter.get('/signers/directory', checklistsModule, view, async (request, response, next) => {
  try {
    const result = await query(
      `SELECT DISTINCT ON (lower(s.signer_name)) s.signer_name, s.signer_role
       FROM checklist_signatures s JOIN checklist_audits a ON a.id = s.audit_id
       WHERE a.organization_id = $1 AND s.signer_name <> ''
       ORDER BY lower(s.signer_name), s.signed_at DESC
       LIMIT 200`,
      [oid(request)],
    )
    response.json(result.rows)
  } catch (error) { next(error) }
})

checklistsRouter.post('/audits/:auditId/signatures', checklistsModule, fill, async (request, response, next) => {
  try {
    // Solo se firma con la auditoria abierta: una vez cerrada es un registro firmado y no se
    // le agregan ni quitan firmas. El orden natural es firmar y despues cerrar.
    const audit = await assertAudit(request, { requireOpen: true })
    const body = request.body || {}
    const signerName = String(body.signerName || '').trim()
    if (!signerName) fail(400, 'Escribe el nombre de quien firma')
    const image = String(body.signatureImage || '')
    if (!image.startsWith('data:image/png;base64,')) fail(400, 'Firma inválida')
    if (image.length > MAX_SIGNATURE_BYTES) fail(413, 'La firma es demasiado pesada')
    const inserted = await query(
      `INSERT INTO checklist_signatures (audit_id, signer_name, signer_role, signature_image)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [audit.id, signerName, String(body.signerRole || '').trim(), image],
    )
    response.status(201).json(inserted.rows[0])
  } catch (error) { next(error) }
})

checklistsRouter.delete('/audits/:auditId/signatures/:signatureId', checklistsModule, fill, async (request, response, next) => {
  try {
    const audit = await assertAudit(request, { requireOpen: true })
    await query('DELETE FROM checklist_signatures WHERE id = $1 AND audit_id = $2',
      [Number(request.params.signatureId), audit.id])
    response.json({ ok: true })
  } catch (error) { next(error) }
})

// ---- Cierre y reapertura ----

checklistsRouter.post('/audits/:auditId/close', checklistsModule, fill, async (request, response, next) => {
  try {
    const audit = await assertAudit(request, { requireOpen: true })
    const payload = await auditPayload(audit)
    if (!payload.subjects.length) fail(400, `Agrega al menos un ${audit.subject_label.toLowerCase()} antes de cerrar`)
    // Sin responder bloquea el cierre; NA no, porque NA ya es una respuesta.
    if (payload.adherence.pending > 0) {
      fail(409, `Faltan ${payload.adherence.pending} respuestas por marcar. Complétalas antes de cerrar.`)
    }
    const percent = payload.adherence.overall.percent
    const client = await pool.connect()
    let updated
    try {
      await client.query('BEGIN')
      updated = await client.query(
        `UPDATE checklist_audits SET status = 'CERRADA', adherence_percent = $1, concept = $2,
                closed_at = NOW(), updated_at = NOW(), updated_by_id = $3
         WHERE id = $4 RETURNING *`,
        [percent, conceptFromPercent(percent), uid(request), audit.id],
      )
      await persistResults(client, audit.id, payload.adherence)
      await logAudit(request, {
        auditId: audit.id, label: `${audit.template_code || ''} · ${audit.template_name || ''}`.trim(),
        action: 'CERRADA', detail: percent === null ? 'Sin dato (todo NA)' : `${Number(percent).toFixed(1)} %`,
      }, client)
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally { client.release() }
    response.json({ ...payload, ...updated.rows[0] })
  } catch (error) { next(error) }
})

checklistsRouter.post('/audits/:auditId/reopen', checklistsModule, fill, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const audit = await assertAudit(request)
    if (audit.status !== 'CERRADA') fail(400, 'La auditoría no está cerrada')
    await client.query('BEGIN')
    // Al reabrir se INVALIDAN las firmas: quien firmo avalo un contenido concreto, y reabrir
    // permite cambiarlo. Conservarlas dejaria firmas avalando algo que ya no es lo que se
    // firmo. Hay que volver a firmar antes de cerrar de nuevo.
    const removed = await client.query('DELETE FROM checklist_signatures WHERE audit_id = $1 RETURNING id', [audit.id])
    await client.query(
      `UPDATE checklist_audits SET status = 'BORRADOR', adherence_percent = NULL, concept = NULL,
              closed_at = NULL, updated_at = NOW(), updated_by_id = $2 WHERE id = $1`,
      [audit.id, uid(request)],
    )
    // Los resultados congelados dejan de valer en cuanto la auditoria vuelve a ser editable.
    await client.query('DELETE FROM checklist_audit_domain_results WHERE audit_id = $1', [audit.id])
    await client.query('DELETE FROM checklist_audit_subject_results WHERE audit_id = $1', [audit.id])
    await logAudit(request, {
      auditId: audit.id, label: `${audit.template_code || ''} · ${audit.template_name || ''}`.trim(),
      action: 'REABIERTA',
      detail: removed.rowCount ? `Se invalidaron ${removed.rowCount} firma(s)` : 'Sin firmas que invalidar',
    }, client)
    await client.query('COMMIT')
    const refreshed = await assertAudit(request)
    response.json({ ...await auditPayload(refreshed), invalidatedSignatures: removed.rowCount })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    next(error)
  } finally { client.release() }
})


// ===========================================================================
// PLANES DE MEJORA
// ===========================================================================
// Un NC deja de morir en el informe: se vuelve un plan con responsable, evidencia de
// subsanacion y cierre verificado. El circuito es ABIERTO -> EN_PROCESO (primera evidencia)
// -> SUBSANADO (lo marca el colaborador) -> CERRADO (lo marca calidad). La regla que hace
// que el circuito valga como verificacion: QUIEN SUBSANA NO PUEDE SER QUIEN CIERRA, y eso
// se valida aqui, no en la interfaz.

const PLAN_STATUSES = ['ABIERTO', 'EN_PROCESO', 'SUBSANADO', 'CERRADO']

/** Etiqueta legible del plan para la bitacora: debe seguir diciendo algo si el plan se borra. */
function planLabel(plan) {
  return [plan.item_number ? `Ítem ${plan.item_number}` : '', plan.criterion_text, plan.subject_name]
    .filter(Boolean).join(' · ').slice(0, 300)
}

async function logPlan(request, { planId, label, action, detail = '' }, client = null) {
  const run = client ? client.query.bind(client) : query
  await run(
    `INSERT INTO checklist_action_log (organization_id, plan_id, plan_label, action, detail, actor_id, actor_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [oid(request), planId, label, action, detail, uid(request), request.auth.user.fullName || ''],
  )
}

/** Codigo visible del plan: es el id de la fila, unico por construccion, dicho como se busca. */
const planCode = id => `PM-${id}`

/** Notificacion interna a una persona (no a una membresia): al responsable cuando le asignan o
 *  devuelven, al auditor cuando el responsable subsana. Nunca a quien ejecuta la accion. */
async function notifyUser(request, { userId, planId, message }, client = null) {
  if (!userId || String(userId) === String(uid(request))) return
  const run = client ? client.query.bind(client) : query
  await run(
    'INSERT INTO checklist_notifications (organization_id, user_id, plan_id, message) VALUES ($1,$2,$3,$4)',
    [oid(request), userId, planId, message],
  )
}

/**
 * Carga el plan y aplica el aislamiento. Lo pueden ver: calidad (manage), el responsable
 * asignado (su membresia) y el auditor autor de la ronda. Nadie mas — el mismo criterio de
 * assertAudit: esconderlo en la interfaz no protege nada.
 */
async function assertPlan(request) {
  const result = await query(
    `SELECT p.*, a.auditor_id, a.audit_date, a.template_id, a.area_id,
            t.name AS template_name, a.template_code, ar.name AS area_name, ar.center AS area_center,
            au.full_name AS auditor_name, m.user_id AS assigned_user_id, mu.full_name AS assigned_user_name,
            cb.full_name AS created_by_name, rb.full_name AS resolved_by_name, xb.full_name AS closed_by_name
     FROM checklist_action_plans p
     JOIN checklist_audits a ON a.id = p.audit_id
     JOIN checklist_templates t ON t.id = a.template_id
     LEFT JOIN checklist_areas ar ON ar.id = a.area_id
     JOIN users au ON au.id = a.auditor_id
     LEFT JOIN memberships m ON m.id = p.assigned_membership_id
     LEFT JOIN users mu ON mu.id = m.user_id
     JOIN users cb ON cb.id = p.created_by_id
     LEFT JOIN users rb ON rb.id = p.resolved_by_id
     LEFT JOIN users xb ON xb.id = p.closed_by_id
     WHERE p.id = $1 AND p.organization_id = $2`,
    [Number(request.params.planId), oid(request)],
  )
  const plan = result.rows[0]
  if (!plan) fail(404, 'Plan de mejora no encontrado')
  const canManage = request.auth.permissions.includes('checklists.manage')
  const isAssignee = String(plan.assigned_membership_id || '') === String(request.auth.membershipId)
  const isAuthor = String(plan.auditor_id) === String(uid(request))
  if (!canManage && !isAssignee && !isAuthor) fail(403, 'Este plan de mejora no es tuyo')
  return { ...plan, _canManage: canManage, _isAssignee: isAssignee }
}

// ---- Notificaciones del circuito ----
// Bandeja simple por usuario: las no leidas primero. Se registran ANTES de /plans/:planId
// para que Express no tome "notifications" como un id.

checklistsRouter.get('/plans/notifications', checklistsModule, plansAccess, async (request, response, next) => {
  try {
    const result = await query(
      `SELECT id, plan_id, message, read, created_at FROM checklist_notifications
        WHERE organization_id = $1 AND user_id = $2
        ORDER BY read, created_at DESC LIMIT 30`,
      [oid(request), uid(request)],
    )
    response.json({
      rows: result.rows.map(row => ({ ...row, id: String(row.id), plan_id: row.plan_id ? String(row.plan_id) : null })),
      unread: result.rows.filter(row => !row.read).length,
    })
  } catch (error) { next(error) }
})

checklistsRouter.post('/plans/notifications/read', checklistsModule, plansAccess, async (request, response, next) => {
  try {
    await query(
      'UPDATE checklist_notifications SET read = TRUE WHERE organization_id = $1 AND user_id = $2 AND NOT read',
      [oid(request), uid(request)],
    )
    response.json({ ok: true })
  } catch (error) { next(error) }
})

// Posibles responsables. No se reusa GET /memberships porque es solo de manage y el AUDITOR
// tambien asigna planes desde la ronda. Solo expone nombre y correo de companeros de la misma
// entidad, lo mismo que ya expone el directorio de firmantes.
checklistsRouter.get('/plans/assignees', checklistsModule, requireAnyPermission(['checklists.fill', 'checklists.manage']), async (request, response, next) => {
  try {
    const result = await query(
      `SELECT m.id, u.full_name, u.email
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1 AND m.active AND u.active
       ORDER BY u.full_name`,
      [oid(request)],
    )
    response.json(result.rows.map(row => ({ ...row, id: String(row.id) })))
  } catch (error) { next(error) }
})

// Listado con aislamiento por rol: calidad ve todo; el colaborador SOLO lo asignado a el; un
// auditor sin manage, lo suyo (lo que asigno en sus rondas o le asignaron a el).
checklistsRouter.get('/plans', checklistsModule, plansAccess, async (request, response, next) => {
  try {
    const q = request.query || {}
    const params = [oid(request)]
    const where = ['p.organization_id = $1']
    const add = (value, sql) => { params.push(value); where.push(sql.replace('$$', `$${params.length}`)) }

    const canManage = request.auth.permissions.includes('checklists.manage')
    const canView = request.auth.permissions.includes('checklists.view')
    if (!canManage) {
      if (canView) {
        params.push(request.auth.membershipId, uid(request))
        where.push(`(p.assigned_membership_id = $${params.length - 1} OR a.auditor_id = $${params.length})`)
      } else {
        add(request.auth.membershipId, 'p.assigned_membership_id = $$')
      }
    }

    if (q.templateId) add(Number(q.templateId), 'a.template_id = $$')
    if (q.areaId) add(Number(q.areaId), 'a.area_id = $$')
    // Sede: todos los servicios del centro elegido.
    if (q.center) add(String(q.center), 'EXISTS (SELECT 1 FROM checklist_areas ca WHERE ca.id = a.area_id AND ca.center = $$)')
    if (q.auditId) add(Number(q.auditId), 'p.audit_id = $$')
    if (q.assignedId) add(Number(q.assignedId), 'p.assigned_membership_id = $$')
    // Persona auditada: el sujeto del hallazgo, por texto.
    if (q.subject) add(`%${String(q.subject).toLowerCase()}%`, 'lower(p.subject_name) LIKE $$')
    // Fecha DEL PLAN: la que se le puso al crearlo; si no tiene, el dia en que se creo.
    if (q.dateFrom) add(String(q.dateFrom), 'COALESCE(p.due_date, p.created_at::date) >= $$')
    if (q.dateTo) add(String(q.dateTo), 'COALESCE(p.due_date, p.created_at::date) <= $$')
    // Busqueda libre: "PM-12" (o solo el numero) va directo al id unico; cualquier otra cosa
    // busca en nombre, criterio y responsable.
    if (q.q) {
      const raw = String(q.q).trim()
      const byId = raw.match(/^pm-?\s*(\d+)$/i) || raw.match(/^(\d+)$/)
      if (byId) add(Number(byId[1]), 'p.id = $$')
      else {
        params.push(`%${raw.toLowerCase()}%`)
        const i = params.length
        where.push(`(lower(p.title) LIKE $${i} OR lower(p.criterion_text) LIKE $${i}
                     OR lower(p.subject_name) LIKE $${i} OR lower(p.assigned_name) LIKE $${i})`)
      }
    }
    // El estado va DE ULTIMO a proposito: los contadores de las pestañas usan los mismos
    // filtros menos este, y al ser el ultimo basta recortar la ultima clausula y el ultimo
    // parametro sin descuadrar la numeracion de los demas.
    const hasStatus = Boolean(q.status && PLAN_STATUSES.includes(String(q.status)))
    if (hasStatus) add(String(q.status), 'p.status = $$')

    const filter = where.join(' AND ')
    const [rows, counts] = await Promise.all([
      query(
        `SELECT p.*, a.audit_date, a.template_code, t.name AS template_name,
                COALESCE(ar.name, 'Sin servicio') AS area_name, ar.center AS area_center,
                au.full_name AS auditor_name, mu.full_name AS assigned_user_name,
                (SELECT COUNT(*)::int FROM checklist_action_evidences e WHERE e.plan_id = p.id) AS evidence_count
         FROM checklist_action_plans p
         JOIN checklist_audits a ON a.id = p.audit_id
         JOIN checklist_templates t ON t.id = a.template_id
         LEFT JOIN checklist_areas ar ON ar.id = a.area_id
         JOIN users au ON au.id = a.auditor_id
         LEFT JOIN memberships m ON m.id = p.assigned_membership_id
         LEFT JOIN users mu ON mu.id = m.user_id
         WHERE ${filter}
         ORDER BY CASE p.status WHEN 'SUBSANADO' THEN 0 WHEN 'ABIERTO' THEN 1 WHEN 'EN_PROCESO' THEN 2 ELSE 3 END,
                  p.created_at DESC, p.id DESC
         LIMIT 300`,
        params,
      ),
      // Los contadores ignoran el filtro por estado a proposito: son las pestañas, y una pestaña
      // que solo se contara a si misma siempre diria lo mismo.
      query(
        `SELECT p.status, COUNT(*)::int AS n
         FROM checklist_action_plans p JOIN checklist_audits a ON a.id = p.audit_id
         WHERE ${(hasStatus ? where.slice(0, -1) : where).join(' AND ')}
         GROUP BY p.status`,
        hasStatus ? params.slice(0, -1) : params,
      ),
    ])
    response.json({
      rows: rows.rows.map(row => ({ ...row, id: String(row.id) })),
      counts: Object.fromEntries(counts.rows.map(row => [row.status, row.n])),
    })
  } catch (error) { next(error) }
})

// El plan se crea DESDE LA RONDA, sobre un criterio ya marcado NC. Lo puede hacer quien
// diligencia (su propia ronda: assertAudit ya aisla) o calidad.
checklistsRouter.post('/audits/:auditId/plans', checklistsModule, requireAnyPermission(['checklists.fill', 'checklists.manage']), async (request, response, next) => {
  const client = await pool.connect()
  try {
    const audit = await assertAudit(request)
    const body = request.body || {}
    const criterionId = Number(body.criterionId)
    const subjectRowId = Number(body.auditSubjectId)
    if (!criterionId || !subjectRowId) fail(400, 'Indica el criterio y el sujeto del hallazgo')

    // El hallazgo tiene que existir: sin un NC guardado no hay nada que subsanar. Tambien frena
    // ids inventados de otra auditoria, porque la respuesta se busca dentro de ESTA.
    const answer = await query(
      `SELECT ans.value, ans.observation, c.text AS criterion_text, c.item_number, d.name AS domain_name,
              s.display_name AS subject_name, s.subject_id AS directory_subject_id
       FROM checklist_answers ans
       JOIN checklist_criteria c ON c.id = ans.criterion_id
       JOIN checklist_domains d ON d.id = c.domain_id
       JOIN checklist_audit_subjects s ON s.id = ans.audit_subject_id
       WHERE ans.audit_id = $1 AND ans.criterion_id = $2 AND ans.audit_subject_id = $3`,
      [audit.id, criterionId, subjectRowId],
    )
    if (!answer.rows[0]) fail(409, 'Ese criterio no está calificado en esta auditoría. Guarda la ronda primero.')
    if (answer.rows[0].value !== 'NC') fail(409, 'Solo un criterio marcado NC genera plan de mejora')

    const duplicate = await query(
      `SELECT id FROM checklist_action_plans
       WHERE audit_id = $1 AND criterion_id = $2 AND audit_subject_id = $3 AND status <> 'CERRADO'`,
      [audit.id, criterionId, subjectRowId],
    )
    if (duplicate.rows[0]) fail(409, 'Ese hallazgo ya tiene un plan de mejora en curso')

    // Responsable: membresia de la MISMA entidad. Se guarda tambien el nombre como snapshot.
    let assignedMembershipId = body.assignedMembershipId ? Number(body.assignedMembershipId) : null
    let assignedName = ''
    if (assignedMembershipId) {
      const member = await query(
        `SELECT m.id, u.full_name FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.id = $1 AND m.organization_id = $2 AND m.active`,
        [assignedMembershipId, oid(request)],
      )
      if (!member.rows[0]) fail(400, 'El responsable no pertenece a esta entidad')
      assignedName = member.rows[0].full_name
    } else if (String(body.assignedName || '').trim()) {
      // Responsable sin cuenta todavia: queda el nombre y calidad gestiona por el.
      assignedName = String(body.assignedName).trim()
    }

    // Nombre y fecha del plan (decision del usuario): el nombre lo identifica ademas del codigo
    // PM-<id>; la fecha es el compromiso de subsanacion y es opcional.
    const title = String(body.title || '').trim().slice(0, 300)
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.dueDate || '')) ? body.dueDate : null

    const meta = answer.rows[0]
    await client.query('BEGIN')
    const inserted = await client.query(
      `INSERT INTO checklist_action_plans
         (organization_id, audit_id, criterion_id, audit_subject_id, criterion_text, domain_name,
          item_number, subject_name, finding, assigned_membership_id, assigned_name, created_by_id,
          title, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [oid(request), audit.id, criterionId, subjectRowId, meta.criterion_text, meta.domain_name,
        meta.item_number || '', meta.subject_name,
        String(body.finding || meta.observation || '').trim().slice(0, 4000),
        assignedMembershipId, assignedName, uid(request), title, dueDate],
    )
    const plan = inserted.rows[0]

    // Notificacion al responsable: se entera al entrar, sin que nadie tenga que avisarle aparte.
    if (assignedMembershipId) {
      const member = await client.query('SELECT user_id FROM memberships WHERE id = $1', [assignedMembershipId])
      if (member.rows[0]) {
        await notifyUser(request, {
          userId: member.rows[0].user_id, planId: plan.id,
          message: `Te asignaron el plan de mejora ${planCode(plan.id)}${title ? ` «${title}»` : ''}${dueDate ? ` con fecha ${dueDate}` : ''}. Sube tu evidencia de subsanación.`,
        }, client)
      }
    }

    // Enlace sujeto -> usuario (§15.1 punto 1): si el auditor pide recordarlo, la proxima ronda
    // sobre el mismo colaborador preseleccionara a su responsable.
    if (assignedMembershipId && body.rememberAssignee && meta.directory_subject_id) {
      await client.query(
        'UPDATE checklist_subjects SET membership_id = $1 WHERE id = $2 AND organization_id = $3',
        [assignedMembershipId, meta.directory_subject_id, oid(request)],
      )
    }

    await logPlan(request, {
      planId: plan.id, label: planLabel(plan), action: 'CREADO',
      detail: assignedName ? `Responsable: ${assignedName}` : 'Sin responsable asignado',
    }, client)
    await client.query('COMMIT')
    response.status(201).json({ ...plan, id: String(plan.id) })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    next(error)
  } finally { client.release() }
})

checklistsRouter.get('/plans/:planId', checklistsModule, plansAccess, async (request, response, next) => {
  try {
    const plan = await assertPlan(request)
    const [evidences, log] = await Promise.all([
      query(
        `SELECT e.*, u.full_name AS uploaded_by_name FROM checklist_action_evidences e
         LEFT JOIN users u ON u.id = e.uploaded_by_id
         WHERE e.plan_id = $1 ORDER BY e.created_at`,
        [plan.id],
      ),
      query(
        `SELECT id, action, detail, actor_name, created_at FROM checklist_action_log
         WHERE plan_id = $1 ORDER BY created_at, id`,
        [plan.id],
      ),
    ])
    const { _canManage, _isAssignee, ...clean } = plan
    response.json({
      ...clean,
      id: String(plan.id),
      evidences: evidences.rows.map(row => ({ ...row, id: String(row.id) })),
      log: log.rows.map(row => ({ ...row, id: String(row.id) })),
    })
  } catch (error) { next(error) }
})

// Editar descripcion o reasignar responsable. Solo calidad o el auditor que lo creo, y nunca
// sobre un plan cerrado: cerrado es un registro verificado.
checklistsRouter.patch('/plans/:planId', checklistsModule, requireAnyPermission(['checklists.fill', 'checklists.manage']), async (request, response, next) => {
  try {
    const plan = await assertPlan(request)
    if (!plan._canManage && String(plan.created_by_id) !== String(uid(request))) fail(403, 'Solo calidad o quien creó el plan puede editarlo')
    if (plan.status === 'CERRADO') fail(409, 'El plan ya está cerrado')
    const body = request.body || {}
    const sets = []
    const params = []
    const set = (column, value) => { params.push(value); sets.push(`${column} = $${params.length}`) }
    const changed = []
    if (body.finding !== undefined) { set('finding', String(body.finding).trim().slice(0, 4000)); changed.push('hallazgo') }
    if (body.assignedMembershipId !== undefined) {
      const membershipId = body.assignedMembershipId ? Number(body.assignedMembershipId) : null
      let name = String(body.assignedName || '').trim()
      if (membershipId) {
        const member = await query(
          `SELECT u.full_name FROM memberships m JOIN users u ON u.id = m.user_id
           WHERE m.id = $1 AND m.organization_id = $2 AND m.active`,
          [membershipId, oid(request)],
        )
        if (!member.rows[0]) fail(400, 'El responsable no pertenece a esta entidad')
        name = member.rows[0].full_name
      }
      set('assigned_membership_id', membershipId)
      set('assigned_name', name)
      changed.push(`responsable → ${name || 'sin asignar'}`)
    }
    if (!sets.length) return response.json({ ok: true })
    params.push(plan.id)
    await query(`UPDATE checklist_action_plans SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params)
    await logPlan(request, {
      planId: plan.id, label: planLabel(plan),
      action: changed.some(item => item.startsWith('responsable')) ? 'REASIGNADO' : 'EDITADO',
      detail: `Cambió ${changed.join(', ')}`,
    })
    response.json({ ok: true })
  } catch (error) { next(error) }
})

// Evidencia de subsanacion: la sube el responsable (o calidad). Primera evidencia sobre un plan
// ABIERTO lo pasa a EN_PROCESO — subir algo ya es estar trabajando en ello.
checklistsRouter.post('/plans/:planId/evidences', checklistsModule, plansAccess, evidenceUpload.single('file'), async (request, response, next) => {
  try {
    const plan = await assertPlan(request)
    if (!plan._canManage && !plan._isAssignee) fail(403, 'Solo el responsable asignado puede subir evidencia')
    if (plan.status === 'CERRADO') fail(409, 'El plan ya está cerrado')
    if (!request.file) fail(400, 'No llegó ningún archivo')
    const inserted = await query(
      `INSERT INTO checklist_action_evidences (plan_id, stored_name, original_name, mime_type, size_bytes, note, uploaded_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [plan.id, request.file.filename, request.file.originalname, request.file.mimetype, request.file.size,
        String(request.body?.note || '').trim().slice(0, 1000), uid(request)],
    )
    if (plan.status === 'ABIERTO') {
      await query("UPDATE checklist_action_plans SET status = 'EN_PROCESO', updated_at = NOW() WHERE id = $1", [plan.id])
    }
    await logPlan(request, {
      planId: plan.id, label: planLabel(plan), action: 'EVIDENCIA',
      detail: `Adjuntó "${request.file.originalname}"`,
    })
    response.status(201).json({ ...inserted.rows[0], id: String(inserted.rows[0].id) })
  } catch (error) { next(error) }
})

checklistsRouter.get('/plans/:planId/evidences/:evidenceId', checklistsModule, plansAccess, async (request, response, next) => {
  try {
    const plan = await assertPlan(request)
    const result = await query(
      'SELECT * FROM checklist_action_evidences WHERE id = $1 AND plan_id = $2',
      [Number(request.params.evidenceId), plan.id],
    )
    const evidence = result.rows[0]
    if (!evidence) fail(404, 'Evidencia no encontrada')
    response.setHeader('Content-Type', evidence.mime_type || 'application/octet-stream')
    response.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(evidence.original_name)}"`)
    response.sendFile(join(evidenceRoot, evidence.stored_name))
  } catch (error) { next(error) }
})

checklistsRouter.delete('/plans/:planId/evidences/:evidenceId', checklistsModule, plansAccess, async (request, response, next) => {
  try {
    const plan = await assertPlan(request)
    if (plan.status === 'CERRADO') fail(409, 'El plan ya está cerrado')
    const result = await query(
      'DELETE FROM checklist_action_evidences WHERE id = $1 AND plan_id = $2 AND (uploaded_by_id = $3 OR $4) RETURNING *',
      [Number(request.params.evidenceId), plan.id, uid(request), plan._canManage],
    )
    const evidence = result.rows[0]
    if (!evidence) fail(404, 'Evidencia no encontrada (solo quien la subió, o calidad, puede quitarla)')
    await unlink(join(evidenceRoot, evidence.stored_name)).catch(() => {})
    await logPlan(request, {
      planId: plan.id, label: planLabel(plan), action: 'EVIDENCIA',
      detail: `Quitó "${evidence.original_name}"`,
    })
    response.json({ ok: true })
  } catch (error) { next(error) }
})

// El responsable declara el hallazgo subsanado. Exige al menos una evidencia: "ya lo arregle"
// sin nada que lo pruebe es justo lo que el circuito viene a evitar.
checklistsRouter.post('/plans/:planId/resolve', checklistsModule, plansAccess, async (request, response, next) => {
  try {
    const plan = await assertPlan(request)
    if (!plan._canManage && !plan._isAssignee) fail(403, 'Solo el responsable asignado puede marcarlo como subsanado')
    if (!['ABIERTO', 'EN_PROCESO'].includes(plan.status)) fail(409, 'El plan no está en un estado que se pueda subsanar')
    const evidences = await query('SELECT COUNT(*)::int AS n FROM checklist_action_evidences WHERE plan_id = $1', [plan.id])
    if (!evidences.rows[0].n) fail(409, 'Sube al menos una evidencia antes de marcarlo como subsanado')
    await query(
      `UPDATE checklist_action_plans SET status = 'SUBSANADO', resolution_note = $1,
              resolved_by_id = $2, resolved_at = NOW(), updated_at = NOW() WHERE id = $3`,
      [String(request.body?.note || '').trim().slice(0, 2000), uid(request), plan.id],
    )
    await logPlan(request, { planId: plan.id, label: planLabel(plan), action: 'SUBSANADO', detail: String(request.body?.note || '').trim().slice(0, 300) })
    // El AUDITOR es quien cierra: se le notifica que ya hay evidencia por verificar.
    await notifyUser(request, {
      userId: plan.auditor_id, planId: plan.id,
      message: `${planCode(plan.id)}${plan.title ? ` «${plan.title}»` : ''} fue marcado como subsanado por ${request.auth.user.fullName || 'el responsable'}. Revísalo para cerrarlo.`,
    })
    response.json({ ok: true })
  } catch (error) { next(error) }
})

/** Quien verifica: el AUDITOR que hallo el NC (decision del usuario) o calidad. */
function assertVerifier(request, plan) {
  const isAuditor = String(plan.auditor_id) === String(uid(request))
  if (!plan._canManage && !isAuditor) fail(403, 'Solo el auditor de la ronda o calidad puede verificar este plan')
}

// El verificador no acepta la subsanacion: el plan vuelve a EN_PROCESO con el motivo,
// y el responsable se entera por notificacion.
checklistsRouter.post('/plans/:planId/return', checklistsModule, plansAccess, async (request, response, next) => {
  try {
    const plan = await assertPlan(request)
    assertVerifier(request, plan)
    if (plan.status !== 'SUBSANADO') fail(409, 'Solo un plan subsanado se puede devolver')
    const note = String(request.body?.note || '').trim()
    if (!note) fail(400, 'Explica por qué se devuelve: el responsable tiene que saber qué corregir')
    await query(
      `UPDATE checklist_action_plans SET status = 'EN_PROCESO', resolved_by_id = NULL, resolved_at = NULL,
              resolution_note = '', updated_at = NOW() WHERE id = $1`,
      [plan.id],
    )
    await logPlan(request, { planId: plan.id, label: planLabel(plan), action: 'DEVUELTO', detail: note.slice(0, 500) })
    await notifyUser(request, {
      userId: plan.assigned_user_id, planId: plan.id,
      message: `${planCode(plan.id)}${plan.title ? ` «${plan.title}»` : ''} fue devuelto: ${note.slice(0, 300)}`,
    })
    response.json({ ok: true })
  } catch (error) { next(error) }
})

// Cierre: el AUDITOR de la ronda (o calidad), y NUNCA la misma persona que subsano. Si quien
// sube tambien cierra, el circuito no vale como verificacion (§15.1).
checklistsRouter.post('/plans/:planId/close', checklistsModule, plansAccess, async (request, response, next) => {
  try {
    const plan = await assertPlan(request)
    assertVerifier(request, plan)
    if (plan.status !== 'SUBSANADO') fail(409, 'Solo se cierra un plan ya subsanado por su responsable')
    if (String(plan.resolved_by_id) === String(uid(request))) {
      fail(409, 'Quien subsanó no puede cerrar el plan: el cierre debe verificarlo otra persona')
    }
    await query(
      `UPDATE checklist_action_plans SET status = 'CERRADO', closing_note = $1,
              closed_by_id = $2, closed_at = NOW(), updated_at = NOW() WHERE id = $3`,
      [String(request.body?.note || '').trim().slice(0, 2000), uid(request), plan.id],
    )
    await logPlan(request, { planId: plan.id, label: planLabel(plan), action: 'CERRADO', detail: String(request.body?.note || '').trim().slice(0, 300) })
    await notifyUser(request, {
      userId: plan.assigned_user_id, planId: plan.id,
      message: `${planCode(plan.id)}${plan.title ? ` «${plan.title}»` : ''} fue verificado y cerrado por ${request.auth.user.fullName || 'el auditor'}.`,
    })
    response.json({ ok: true })
  } catch (error) { next(error) }
})

// Borrar es decision de calidad. La constancia se escribe ANTES y sobrevive al plan; los
// archivos se limpian del disco despues de la fila, como en las evidencias de ronda.
checklistsRouter.delete('/plans/:planId', checklistsModule, manage, async (request, response, next) => {
  try {
    const plan = await assertPlan(request)
    const files = await query('SELECT stored_name FROM checklist_action_evidences WHERE plan_id = $1', [plan.id])
    await logPlan(request, {
      planId: plan.id, label: planLabel(plan), action: 'ELIMINADO',
      detail: `Estaba ${plan.status.toLowerCase().replace('_', ' ')}`,
    })
    await query('DELETE FROM checklist_action_plans WHERE id = $1 AND organization_id = $2', [plan.id, oid(request)])
    for (const row of files.rows) await unlink(join(evidenceRoot, row.stored_name)).catch(() => {})
    response.json({ ok: true })
  } catch (error) { next(error) }
})

// ===========================================================================
// REPOSITORIO DE AUDITORIAS
// ===========================================================================

/**
 * Filtros del repositorio. La FECHA es el eje: la vista ordena por ella y el filtro de rango es
 * el primero, porque la pregunta real del auditor es "¿que audite el 15 de julio?".
 *
 * El aislamiento por autor NO es opcional ni configurable: se aplica aqui, en la consulta. Un
 * auditor solo agrega lo suyo aunque pida otra cosa por API.
 */
function repositoryFilters(request) {
  const params = [oid(request)]
  const where = ['a.organization_id = $1']
  const q = request.query || {}
  const add = (value, sql) => { params.push(value); where.push(sql.replace('$$', `$${params.length}`)) }

  const canManage = request.auth.permissions.includes('checklists.manage')
  if (!canManage) add(uid(request), 'a.auditor_id = $$')
  else if (q.auditorId) add(Number(q.auditorId), 'a.auditor_id = $$')

  if (q.dateFrom) add(String(q.dateFrom), 'a.audit_date >= $$')
  if (q.dateTo) add(String(q.dateTo), 'a.audit_date <= $$')
  if (q.areaId) add(Number(q.areaId), 'a.area_id = $$')
  // Mismo filtro por sede que en el centro de datos.
  if (q.center) add(String(q.center), 'EXISTS (SELECT 1 FROM checklist_areas ca WHERE ca.id = a.area_id AND ca.center = $$)')
  if (q.templateId) add(Number(q.templateId), 'a.template_id = $$')
  if (q.shift) add(String(q.shift), 'a.shift = $$')
  if (q.status) add(String(q.status), 'a.status = $$')
  if (q.maxPercent) add(Number(q.maxPercent), 'a.adherence_percent < $$')

  // Sujeto auditado: busca en el nombre Y en los atributos guardados (documento, cama...), que
  // es como se pregunta de verdad ("el de la cama 203" o "CC 23.456.789"). El snapshot es jsonb,
  // asi que se compara sobre su texto. El valor se empuja una vez y se referencia dos.
  if (q.subject) {
    params.push(`%${String(q.subject).toLowerCase()}%`)
    const i = params.length
    where.push(`EXISTS (SELECT 1 FROM checklist_audit_subjects s
                         WHERE s.audit_id = a.id
                           AND (lower(s.display_name) LIKE $${i}
                                OR lower(s.attributes_snapshot::text) LIKE $${i}))`)
  }

  // Personal de turno / responsable: vive en los valores de la cabecera, que tambien son jsonb.
  if (q.staff) {
    params.push(`%${String(q.staff).toLowerCase()}%`)
    const i = params.length
    where.push(`(lower(a.header_values::text) LIKE $${i}
                 OR EXISTS (SELECT 1 FROM checklist_audit_staff st
                             WHERE st.audit_id = a.id AND lower(st.full_name) LIKE $${i}))`)
  }

  return { params, where: where.join(' AND '), canManage }
}

checklistsRouter.get('/repository', checklistsModule, view, async (request, response, next) => {
  try {
    const { params, where } = repositoryFilters(request)
    const page = Math.max(1, Number(request.query.page) || 1)
    const size = Math.min(100, Math.max(5, Number(request.query.size) || 25))

    const [rows, total] = await Promise.all([
      query(
        `SELECT a.id, a.audit_date, a.shift, a.status, a.adherence_percent, a.concept,
                a.template_code, a.template_version, a.created_at, a.updated_at,
                t.name AS template_name, t.subject_label,
                COALESCE(ar.name, 'Sin servicio') AS area_name,
                u.full_name AS auditor_name,
                (SELECT COUNT(*)::int FROM checklist_signatures g WHERE g.audit_id = a.id) AS signature_count,
                (SELECT COUNT(*)::int FROM checklist_audit_subjects s WHERE s.audit_id = a.id) AS subject_count,
                (SELECT string_agg(s.display_name, ' · ' ORDER BY s.order_index)
                   FROM checklist_audit_subjects s WHERE s.audit_id = a.id) AS subjects
         FROM checklist_audits a
         JOIN checklist_templates t ON t.id = a.template_id
         LEFT JOIN checklist_areas ar ON ar.id = a.area_id
         JOIN users u ON u.id = a.auditor_id
         WHERE ${where}
         ORDER BY a.audit_date DESC, a.id DESC
         LIMIT ${size} OFFSET ${(page - 1) * size}`,
        params,
      ),
      query(`SELECT COUNT(*)::int AS n FROM checklist_audits a WHERE ${where}`, params),
    ])

    response.json({
      rows: rows.rows.map(row => ({ ...row, id: String(row.id) })),
      total: total.rows[0].n,
      page,
      size,
      pages: Math.max(1, Math.ceil(total.rows[0].n / size)),
    })
  } catch (error) { next(error) }
})

// El formato EN BLANCO de la lista, listo para imprimir. Se registra antes que GET /:id porque
// si no, Express toma "formato.pdf" como si fuera el id y la consulta se va a NaN.
checklistsRouter.get('/:id/formato.pdf', checklistsModule, view, async (request, response, next) => {
  try {
    const template = await assertTemplate(request)
    const structure = await loadStructure(template.id)
    const organization = await query('SELECT name FROM organizations WHERE id = $1', [oid(request)])
    // Cuantas columnas de evaluado caben en una hoja apaisada sin que el criterio se estruje.
    const columns = Math.min(8, Math.max(1, Number(request.query.columnas) || 5))
    const html = renderChecklistBlankFormatHtml({
      organizationName: organization.rows[0]?.name || 'Entidad',
      template: { ...template, ...structure },
      columns,
    })
    const pdf = await renderPdf(html, { landscape: true })
    response.setHeader('Content-Type', 'application/pdf')
    response.setHeader('Content-Disposition', `inline; filename="${template.code || 'lista'}-formato.pdf"`)
    response.send(pdf)
  } catch (error) { next(error) }
})

checklistsRouter.get('/:id', checklistsModule, view, async (request, response, next) => {
  try {
    const template = await assertTemplate(request)
    const structure = await loadStructure(template.id)
    response.json({ ...template, ...structure })
  } catch (error) { next(error) }
})

checklistsRouter.patch('/:id', checklistsModule, manage, async (request, response, next) => {
  try {
    const template = await assertTemplate(request)
    const body = request.body || {}
    // SET dinamico en vez de COALESCE: area_id debe poder limpiarse a NULL.
    const sets = []
    const params = []
    const set = (column, value) => { params.push(value); sets.push(`${column} = $${params.length}`) }
    if (body.name !== undefined) set('name', String(body.name))
    if (body.code !== undefined) set('code', String(body.code).trim())
    if (body.version !== undefined) set('version', String(body.version).trim())
    if (body.description !== undefined) set('description', String(body.description))
    if (body.subjectLabel !== undefined) set('subject_label', String(body.subjectLabel).trim() || 'Sujeto auditado')
    if (body.numberedItems !== undefined) set('numbered_items', Boolean(body.numberedItems))
    if (body.areaId !== undefined) set('area_id', body.areaId ? Number(body.areaId) : null)
    if (body.programId !== undefined) set('program_id', body.programId ? Number(body.programId) : null)
    if (body.status !== undefined) {
      if (!['BORRADOR', 'PUBLICADA', 'ARCHIVADA'].includes(body.status)) fail(400, 'Estado inválido')
      set('status', body.status)
    }
    if (!sets.length) return response.json(template)
    params.push(template.id, oid(request))
    const result = await query(
      `UPDATE checklist_templates SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length - 1} AND organization_id = $${params.length} RETURNING *`,
      params,
    )
    response.json(result.rows[0])
  } catch (error) { next(error) }
})

checklistsRouter.delete('/:id', checklistsModule, manage, async (request, response, next) => {
  try {
    const template = await assertTemplate(request)
    const audits = await query('SELECT COUNT(*)::int AS n FROM checklist_audits WHERE template_id = $1', [template.id])
    // Una lista ya usada no se borra: se archiva. Borrarla arrastraria las auditorias firmadas.
    if (audits.rows[0].n > 0) fail(409, 'Esta lista ya tiene auditorías registradas: archívala en vez de eliminarla')
    await query('DELETE FROM checklist_templates WHERE id = $1 AND organization_id = $2', [template.id, oid(request)])
    response.json({ ok: true })
  } catch (error) { next(error) }
})

// ---- Estructura completa (guardado atomico desde el constructor) ----

async function replaceFields(client, table, templateId, rows) {
  const keep = rows.map(row => existingId(row.id)).filter(Boolean)
  if (keep.length) {
    await client.query(`DELETE FROM ${table} WHERE template_id = $1 AND NOT (id = ANY($2::bigint[]))`, [templateId, keep])
  } else {
    await client.query(`DELETE FROM ${table} WHERE template_id = $1`, [templateId])
  }
  for (const [index, row] of rows.entries()) {
    const label = String(row.label || '').trim()
    if (!label) continue
    const fieldType = FIELD_TYPES.has(row.field_type) ? row.field_type : 'TEXT'
    const options = JSON.stringify(Array.isArray(row.options) ? row.options : [])
    const id = existingId(row.id)
    if (id) {
      await client.query(
        `UPDATE ${table} SET label = $1, field_type = $2, options = $3::jsonb, required = $4, order_index = $5
         WHERE id = $6 AND template_id = $7`,
        [label, fieldType, options, Boolean(row.required), index, id, templateId],
      )
    } else {
      await client.query(
        `INSERT INTO ${table} (template_id, label, field_type, options, required, order_index)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6)`,
        [templateId, label, fieldType, options, Boolean(row.required), index],
      )
    }
  }
}

checklistsRouter.put('/:id/structure', checklistsModule, manage, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const template = await assertTemplate(request)
    const body = request.body || {}
    const domains = Array.isArray(body.domains) ? body.domains : []

    await client.query('BEGIN')

    await replaceFields(client, 'checklist_header_fields', template.id, Array.isArray(body.headerFields) ? body.headerFields : [])
    await replaceFields(client, 'checklist_subject_fields', template.id, Array.isArray(body.subjectFields) ? body.subjectFields : [])

    const keepDomains = domains.map(domain => existingId(domain.id)).filter(Boolean)
    if (keepDomains.length) {
      await client.query('DELETE FROM checklist_domains WHERE template_id = $1 AND NOT (id = ANY($2::bigint[]))', [template.id, keepDomains])
    } else {
      await client.query('DELETE FROM checklist_domains WHERE template_id = $1', [template.id])
    }

    for (const [domainIndex, domain] of domains.entries()) {
      const domainName = String(domain.name || '').trim()
      if (!domainName) continue
      let domainId = existingId(domain.id)
      if (domainId) {
        await client.query('UPDATE checklist_domains SET name = $1, order_index = $2 WHERE id = $3 AND template_id = $4',
          [domainName, domainIndex, domainId, template.id])
      } else {
        const inserted = await client.query(
          'INSERT INTO checklist_domains (template_id, name, order_index) VALUES ($1,$2,$3) RETURNING id',
          [template.id, domainName, domainIndex])
        domainId = inserted.rows[0].id
      }

      const criteria = Array.isArray(domain.criteria) ? domain.criteria : []
      const keepCriteria = criteria.map(criterion => existingId(criterion.id)).filter(Boolean)
      // Los criterios ya respondidos en alguna auditoria NO se borran fisicamente (arrastrarian
      // las respuestas por FK): se marcan inactivos y el motor los ignora.
      const removeSql = keepCriteria.length
        ? { text: 'SELECT id FROM checklist_criteria WHERE domain_id = $1 AND NOT (id = ANY($2::bigint[]))', values: [domainId, keepCriteria] }
        : { text: 'SELECT id FROM checklist_criteria WHERE domain_id = $1', values: [domainId] }
      const removable = await client.query(removeSql)
      for (const row of removable.rows) {
        const used = await client.query('SELECT 1 FROM checklist_answers WHERE criterion_id = $1 LIMIT 1', [row.id])
        if (used.rows[0]) await client.query('UPDATE checklist_criteria SET active = FALSE WHERE id = $1', [row.id])
        else await client.query('DELETE FROM checklist_criteria WHERE id = $1', [row.id])
      }

      for (const [criterionIndex, criterion] of criteria.entries()) {
        const text = String(criterion.text || '').trim()
        if (!text) continue
        const criterionId = existingId(criterion.id)
        if (criterionId) {
          await client.query(
            `UPDATE checklist_criteria SET item_number = $1, text = $2, guidance = $3, order_index = $4, active = TRUE
             WHERE id = $5 AND domain_id = $6`,
            [String(criterion.item_number || ''), text, String(criterion.guidance || ''), criterionIndex, criterionId, domainId],
          )
        } else {
          await client.query(
            `INSERT INTO checklist_criteria (domain_id, item_number, text, guidance, order_index)
             VALUES ($1,$2,$3,$4,$5)`,
            [domainId, String(criterion.item_number || ''), text, String(criterion.guidance || ''), criterionIndex],
          )
        }
      }
    }

    await client.query('UPDATE checklist_templates SET updated_at = NOW() WHERE id = $1', [template.id])
    await client.query('COMMIT')

    const structure = await loadStructure(template.id)
    const updated = await query('SELECT * FROM checklist_templates WHERE id = $1', [template.id])
    response.json({ ...updated.rows[0], ...structure })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    next(error)
  } finally { client.release() }
})

// ---- Simulacion de adherencia ----
// Deja probar el calculo con la estructura REAL de la lista antes de que exista el entorno de
// diligenciamiento (fase 2). Tambien sirve de vista previa en el constructor: responder unos
// criterios y ver como queda el porcentaje.
checklistsRouter.post('/:id/simulate', checklistsModule, view, async (request, response, next) => {
  try {
    const template = await assertTemplate(request)
    const structure = await loadStructure(template.id)
    const body = request.body || {}
    const subjects = Array.isArray(body.subjects) ? body.subjects : []
    const answers = (Array.isArray(body.answers) ? body.answers : []).filter(answer => isChecklistValue(answer.value))
    const result = computeAdherence({ domains: structure.domains, subjects, answers })
    response.json({ ...result, concept: conceptFromPercent(result.overall.percent) })
  } catch (error) { next(error) }
})

// ===========================================================================
// FASE 4 — Analitica e informes
// ===========================================================================

// Filtros comunes de analitica/consolidado. Solo entran auditorias CERRADAS: una en borrador
// esta a medio diligenciar y contarla distorsionaria el indicador.
function analyticsFilters(request) {
  const params = [oid(request)]
  const where = ["a.organization_id = $1", "a.status = 'CERRADA'"]
  if (request.query.templateId) { params.push(Number(request.query.templateId)); where.push(`a.template_id = $${params.length}`) }
  if (request.query.areaId) { params.push(Number(request.query.areaId)); where.push(`a.area_id = $${params.length}`) }
  if (request.query.dateFrom) { params.push(request.query.dateFrom); where.push(`a.audit_date >= $${params.length}`) }
  if (request.query.dateTo) { params.push(request.query.dateTo); where.push(`a.audit_date <= $${params.length}`) }
  return { params, where: where.join(' AND ') }
}

// Agregacion en SQL sobre las respuestas, NO promediando los porcentajes ya calculados de cada
// auditoria: promediar promedios le daria el mismo peso a una ronda de 1 sujeto que a una de 20.
// Se cuenta C y NC sobre el total real de criterios evaluados; NA queda fuera del denominador.
const TALLY = `
  COUNT(*) FILTER (WHERE ans.value = 'C')::int AS c,
  COUNT(*) FILTER (WHERE ans.value = 'NC')::int AS nc,
  COUNT(*) FILTER (WHERE ans.value = 'NA')::int AS na`

function percentOf(row) {
  const applicable = Number(row.c) + Number(row.nc)
  return applicable > 0 ? (Number(row.c) / applicable) * 100 : null
}

checklistsRouter.get('/analytics/summary', checklistsModule, view, async (request, response, next) => {
  try {
    const { params, where } = analyticsFilters(request)
    // El FROM y el WHERE van SEPARADOS a proposito. Antes esto era un solo trozo que ya incluia
    // el WHERE, y cada consulta le pegaba sus JOIN detras: SQL invalido (`... WHERE ... JOIN ...`)
    // que reventaba cinco de las siete consultas y dejaba la analitica entera sin cargar.
    const from = 'FROM checklist_audits a JOIN checklist_answers ans ON ans.audit_id = a.id'
    const filter = `WHERE ${where}`

    const [overall, byTemplate, byArea, byDomain, byMonth, worst, auditCount] = await Promise.all([
      query(`SELECT ${TALLY} ${from} ${filter}`, params),
      query(`SELECT t.id, t.name, COUNT(DISTINCT a.id)::int AS audits, ${TALLY}
             ${from} JOIN checklist_templates t ON t.id = a.template_id
             ${filter}
             GROUP BY t.id, t.name ORDER BY t.name`, params),
      query(`SELECT COALESCE(ar.name, 'Sin área') AS name, COUNT(DISTINCT a.id)::int AS audits, ${TALLY}
             ${from} LEFT JOIN checklist_areas ar ON ar.id = a.area_id
             ${filter}
             GROUP BY ar.name ORDER BY ar.name NULLS LAST`, params),
      query(`SELECT d.id, d.name, ${TALLY}
             ${from} JOIN checklist_criteria c ON c.id = ans.criterion_id
                     JOIN checklist_domains d ON d.id = c.domain_id
             ${filter}
             GROUP BY d.id, d.name ORDER BY d.name`, params),
      query(`SELECT to_char(a.audit_date, 'YYYY-MM') AS period, COUNT(DISTINCT a.id)::int AS audits, ${TALLY}
             ${from} ${filter} GROUP BY period ORDER BY period`, params),
      query(`SELECT c.id, c.text, t.name AS template_name, ${TALLY}
             ${from} JOIN checklist_criteria c ON c.id = ans.criterion_id
                     JOIN checklist_domains d ON d.id = c.domain_id
                     JOIN checklist_templates t ON t.id = d.template_id
             ${filter}
             GROUP BY c.id, c.text, t.name
             HAVING COUNT(*) FILTER (WHERE ans.value IN ('C','NC')) > 0
             ORDER BY (COUNT(*) FILTER (WHERE ans.value = 'C')::numeric
                       / NULLIF(COUNT(*) FILTER (WHERE ans.value IN ('C','NC')), 0)) ASC,
                      COUNT(*) FILTER (WHERE ans.value = 'NC') DESC
             LIMIT 10`, params),
      query(`SELECT COUNT(*)::int AS n FROM checklist_audits a WHERE ${where}`, params),
    ])

    const shape = rows => rows.map(row => ({
      id: row.id ? String(row.id) : undefined,
      name: row.name, period: row.period, template_name: row.template_name, text: row.text,
      audits: row.audits, c: Number(row.c), nc: Number(row.nc), na: Number(row.na),
      applicable: Number(row.c) + Number(row.nc), percent: percentOf(row),
    }))

    const totals = overall.rows[0] || { c: 0, nc: 0, na: 0 }
    response.json({
      auditCount: auditCount.rows[0].n,
      overall: { c: Number(totals.c), nc: Number(totals.nc), na: Number(totals.na), percent: percentOf(totals) },
      byTemplate: shape(byTemplate.rows),
      byArea: shape(byArea.rows),
      byDomain: shape(byDomain.rows),
      byMonth: shape(byMonth.rows),
      worstCriteria: shape(worst.rows),
    })
  } catch (error) { next(error) }
})


// ===========================================================================
// CENTRO DE DATOS
// ===========================================================================

/**
 * Filtros combinables del tablero. Se arman una sola vez y los usan TODAS las consultas: si
 * cada vista construyera los suyos, bastaria olvidar uno para que un grafico contradijera al
 * KPI de arriba, y ese es el fallo que nadie nota hasta que alguien decide con el dato malo.
 *
 * `domainId` y `level` filtran a nivel de RESPUESTA, no de auditoria: "solo el dominio X" no
 * quiere decir "las auditorias que tienen el dominio X", quiere decir sus respuestas.
 */
function dataCenterFilters(request) {
  const params = [oid(request)]
  const where = ['a.organization_id = $1', "a.status = 'CERRADA'"]
  const q = request.query || {}
  const add = (value, sql) => { params.push(value); where.push(sql.replace('$$', `$${params.length}`)) }

  // Quien no administra solo agrega LO SUYO, tambien en el tablero y en las exportaciones: de
  // nada sirve tapar el detalle si el CSV se lleva la entidad entera.
  if (!request.auth.permissions.includes('checklists.manage')) {
    add(uid(request), 'a.auditor_id = $$')
  }

  if (q.templateId) add(Number(q.templateId), 'a.template_id = $$')
  if (q.areaId) add(Number(q.areaId), 'a.area_id = $$')
  // Centro de atencion: recorta a TODOS los servicios de esa sede. Es un filtro propio, no un
  // prefijo del servicio: primero la sede, luego (opcional) el servicio concreto.
  if (q.center) add(String(q.center), 'EXISTS (SELECT 1 FROM checklist_areas ca WHERE ca.id = a.area_id AND ca.center = $$)')
  if (q.auditorId) add(Number(q.auditorId), 'a.auditor_id = $$')
  if (q.shift) add(String(q.shift), 'a.shift = $$')
  if (q.dateFrom) add(String(q.dateFrom), 'a.audit_date >= $$')
  if (q.dateTo) add(String(q.dateTo), 'a.audit_date <= $$')
  if (q.domainId) add(Number(q.domainId), 'd.id = $$')
  // Nivel de adherencia: recorta por el resultado YA calculado de la auditoria (ej. "solo <70%").
  if (q.maxPercent) add(Number(q.maxPercent), 'a.adherence_percent < $$')
  if (q.minPercent) add(Number(q.minPercent), 'a.adherence_percent >= $$')

  return { params, where: where.join(' AND ') }
}

// Todas las vistas parten del mismo grafo: auditoria -> respuesta -> criterio -> dominio. Se
// une siempre, aunque la vista no agrupe por dominio, para que el filtro por dominio pueda
// aplicarse de forma homogenea.
const DC_FROM = `
  FROM checklist_audits a
  JOIN checklist_answers ans ON ans.audit_id = a.id
  JOIN checklist_criteria c ON c.id = ans.criterion_id
  JOIN checklist_domains d ON d.id = c.domain_id`

const DC_TALLY = `
  COUNT(*) FILTER (WHERE ans.value = 'C')::int AS c,
  COUNT(*) FILTER (WHERE ans.value = 'NC')::int AS nc,
  COUNT(*) FILTER (WHERE ans.value = 'NA')::int AS na`

/** Agrupacion temporal. Es una lista blanca: el valor entra en el SQL sin parametrizar. */
const PERIOD_TRUNC = { dia: 'day', semana: 'week', mes: 'month', trimestre: 'quarter' }

/** Todo el calculo del tablero en un solo sitio: lo usan el endpoint y el PDF. */
async function dataCenterData(request) {
    const { params, where } = dataCenterFilters(request)
    const period = PERIOD_TRUNC[String(request.query.period || 'mes')] || 'month'

    const [overall, byAudit, byAuditor, bySubject, byDate, byArea, byDomain, byCriterion, kpis] = await Promise.all([
      query(`SELECT ${DC_TALLY} ${DC_FROM} WHERE ${where}`, params),

      query(`SELECT a.id, a.audit_date, a.shift, a.adherence_percent, a.concept,
                    a.template_code, t.name AS template_name, ar.name AS area_name,
                    u.full_name AS auditor_name, ${DC_TALLY}
             ${DC_FROM}
             JOIN checklist_templates t ON t.id = a.template_id
             LEFT JOIN checklist_areas ar ON ar.id = a.area_id
             JOIN users u ON u.id = a.auditor_id
             WHERE ${where}
             GROUP BY a.id, a.audit_date, a.shift, a.adherence_percent, a.concept, a.template_code,
                      t.name, ar.name, u.full_name
             ORDER BY a.audit_date DESC, a.id DESC LIMIT 300`, params),

      query(`SELECT u.id, u.full_name AS name, COUNT(DISTINCT a.id)::int AS audits, ${DC_TALLY}
             ${DC_FROM} JOIN users u ON u.id = a.auditor_id
             WHERE ${where} GROUP BY u.id, u.full_name ORDER BY u.full_name`, params),

      // Profesional EVALUADO, que no es lo mismo que el auditor. Se agrupa por nombre y no por
      // id porque el mismo profesional puede haberse registrado suelto en una ronda y desde el
      // directorio en otra.
      query(`SELECT s.display_name AS name, COUNT(DISTINCT a.id)::int AS audits, ${DC_TALLY}
             ${DC_FROM} JOIN checklist_audit_subjects s ON s.id = ans.audit_subject_id
             WHERE ${where} GROUP BY s.display_name ORDER BY s.display_name`, params),

      query(`SELECT to_char(date_trunc('${period}', a.audit_date), 'YYYY-MM-DD') AS period,
                    COUNT(DISTINCT a.id)::int AS audits, ${DC_TALLY}
             ${DC_FROM} WHERE ${where}
             GROUP BY 1 ORDER BY 1`, params),

      query(`SELECT COALESCE(ar.name, 'Sin servicio') AS name, COUNT(DISTINCT a.id)::int AS audits, ${DC_TALLY}
             ${DC_FROM} LEFT JOIN checklist_areas ar ON ar.id = a.area_id
             WHERE ${where} GROUP BY ar.name ORDER BY ar.name NULLS LAST`, params),

      // Agrupado por NOMBRE, no por id: el mismo dominio ("Indague al personal de turno") existe
      // en varias listas y por id salia repetido en la grafica. Aqui la pregunta es que paquete
      // concentra el incumplimiento en la entidad, no en que fila de que lista esta.
      query(`SELECT d.name, COUNT(DISTINCT a.id)::int AS audits, ${DC_TALLY}
             ${DC_FROM} WHERE ${where} GROUP BY d.name ORDER BY d.name`, params),

      query(`SELECT c.id, c.text, c.item_number, d.name AS domain_name, t.name AS template_name, ${DC_TALLY}
             ${DC_FROM}
             JOIN checklist_templates t ON t.id = d.template_id
             WHERE ${where}
             GROUP BY c.id, c.text, c.item_number, d.name, t.name
             HAVING COUNT(*) FILTER (WHERE ans.value IN ('C','NC')) > 0
             ORDER BY (COUNT(*) FILTER (WHERE ans.value = 'C')::numeric
                       / NULLIF(COUNT(*) FILTER (WHERE ans.value IN ('C','NC')), 0)) ASC,
                      COUNT(*) FILTER (WHERE ans.value = 'NC') DESC
             LIMIT 25`, params),

      // active_days y avg_seconds alimentan las metricas operativas del tablero: listas por dia
      // y duracion promedio (created_at -> closed_at). Se calculan aqui, sobre el MISMO recorte,
      // para que no contradigan a los KPIs de arriba.
      query(`SELECT COUNT(DISTINCT a.id)::int AS audits,
                    COUNT(DISTINCT a.area_id)::int AS areas,
                    COUNT(DISTINCT ans.audit_subject_id)::int AS subjects,
                    COUNT(DISTINCT a.auditor_id)::int AS auditors,
                    COUNT(DISTINCT a.audit_date)::int AS active_days,
                    AVG(EXTRACT(EPOCH FROM (a.closed_at - a.created_at)))
                      FILTER (WHERE a.closed_at IS NOT NULL) AS avg_seconds
             ${DC_FROM} WHERE ${where}`, params),
    ])

    // Planes de mejora del mismo recorte. COUNT(DISTINCT p.id) porque el grafo por respuestas
    // multiplica filas; sin el DISTINCT un plan contaria una vez por cada respuesta de su ronda.
    const plansTally = await query(
      `SELECT COUNT(DISTINCT p.id) FILTER (WHERE p.status <> 'CERRADO')::int AS open,
              COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'CERRADO')::int AS closed
         FROM checklist_action_plans p
         JOIN checklist_audits a ON a.id = p.audit_id
         JOIN checklist_answers ans ON ans.audit_id = a.id
         JOIN checklist_criteria c ON c.id = ans.criterion_id
         JOIN checklist_domains d ON d.id = c.domain_id
        WHERE ${where}`, params)

    const shape = rows => rows.map(row => {
      const applicable = Number(row.c) + Number(row.nc)
      return {
        ...row,
        id: row.id !== undefined && row.id !== null ? String(row.id) : undefined,
        c: Number(row.c), nc: Number(row.nc), na: Number(row.na), applicable,
        percent: applicable > 0 ? (Number(row.c) / applicable) * 100 : null,
      }
    })

    // Mezcla por ESTADO: es la unica consulta que NO filtra por cerradas, porque justamente
    // cuenta cuantas quedaron a medias. Solo tenemos dos estados reales (borrador y cerrada);
    // no se inventan "vencidas" ni "pendientes" que el modelo no distingue.
    const statusWhere = where.replace(" AND a.status = 'CERRADA'", '')
    const statusMix = await query(
      `SELECT a.status, COUNT(DISTINCT a.id)::int AS n
         FROM checklist_audits a
         LEFT JOIN checklist_answers ans ON ans.audit_id = a.id
         LEFT JOIN checklist_criteria c ON c.id = ans.criterion_id
         LEFT JOIN checklist_domains d ON d.id = c.domain_id
        WHERE ${statusWhere} GROUP BY a.status`, params)

    // Comparacion con el periodo anterior. Solo se calcula si hay un rango definido: sin fechas,
    // "el periodo anterior" no existe y cualquier numero seria inventado. La ventana previa es
    // del mismo largo y termina justo antes del inicio del rango.
    let previous = null
    const q = request.query || {}
    if (q.dateFrom && q.dateTo) {
      const desde = new Date(`${q.dateFrom}T00:00:00Z`)
      const hasta = new Date(`${q.dateTo}T00:00:00Z`)
      const dias = Math.max(1, Math.round((hasta - desde) / 86400000) + 1)
      const finPrevio = new Date(desde.getTime() - 86400000)
      const inicioPrevio = new Date(finPrevio.getTime() - (dias - 1) * 86400000)
      const previoRequest = {
        ...request,
        query: { ...q, dateFrom: inicioPrevio.toISOString().slice(0, 10), dateTo: finPrevio.toISOString().slice(0, 10) },
      }
      const { params: pParams, where: pWhere } = dataCenterFilters(previoRequest)
      const [pTally, pCount] = await Promise.all([
        query(`SELECT ${DC_TALLY} ${DC_FROM} WHERE ${pWhere}`, pParams),
        query(`SELECT COUNT(DISTINCT a.id)::int AS n ${DC_FROM} WHERE ${pWhere}`, pParams),
      ])
      const row = pTally.rows[0] || { c: 0, nc: 0 }
      const aplicables = Number(row.c) + Number(row.nc)
      previous = {
        from: previoRequest.query.dateFrom,
        to: previoRequest.query.dateTo,
        percent: aplicables > 0 ? (Number(row.c) / aplicables) * 100 : null,
        audits: pCount.rows[0].n,
      }
    }

    const totals = overall.rows[0] || { c: 0, nc: 0, na: 0 }
    const globalPercent = (Number(totals.c) + Number(totals.nc)) > 0
      ? (Number(totals.c) / (Number(totals.c) + Number(totals.nc))) * 100 : null
    const criteria = shape(byCriterion.rows)

    return {
      overall: {
        c: Number(totals.c), nc: Number(totals.nc), na: Number(totals.na),
        percent: globalPercent, concept: conceptFromPercent(globalPercent),
      },
      kpis: {
        audits: kpis.rows[0].audits,
        areas: kpis.rows[0].areas,
        subjects: kpis.rows[0].subjects,
        auditors: kpis.rows[0].auditors,
        activeDays: kpis.rows[0].active_days,
        avgSeconds: kpis.rows[0].avg_seconds === null ? null : Number(kpis.rows[0].avg_seconds),
        plansOpen: plansTally.rows[0].open,
        plansClosed: plansTally.rows[0].closed,
        // "Critico" = por debajo del corte mas bajo del semaforo, el mismo que pinta la pantalla
        // y el PDF. No es un numero elegido aparte.
        criticalCriteria: criteria.filter(row => row.percent !== null && row.percent < 70).length,
      },
      byAudit: shape(byAudit.rows),
      byAuditor: shape(byAuditor.rows),
      bySubject: shape(bySubject.rows),
      byDate: shape(byDate.rows),
      byArea: shape(byArea.rows),
      byDomain: shape(byDomain.rows),
      byCriterion: criteria,
      statusMix: statusMix.rows.map(row => ({ status: row.status, n: row.n })),
      previous,
  }
}

checklistsRouter.get('/analytics/datacenter', checklistsModule, view, async (request, response, next) => {
  try {
    response.json(await dataCenterData(request))
  } catch (error) { next(error) }
})


/**
 * PDF del centro de datos. Va por POST porque el cliente manda los SVG de los graficos ya
 * pintados (varios cientos de KB): no caben en una URL, y ademas asi el informe es exactamente
 * lo que hay en pantalla y no una segunda version dibujada aparte.
 *
 * Los datos se recalculan aqui a partir de los MISMOS filtros, no se aceptan del cliente: un
 * informe institucional no puede llevar cifras que las mando el navegador.
 */
checklistsRouter.post('/analytics/datacenter.pdf', checklistsModule, view, async (request, response, next) => {
  try {
    const body = request.body || {}
    // Se reutiliza el mismo constructor de filtros pasando los del cuerpo como si fueran query.
    const data = await dataCenterData({ ...request, query: body.filters || {} })
    const organization = await query('SELECT name FROM organizations WHERE id = $1', [oid(request)])
    const charts = (Array.isArray(body.charts) ? body.charts : [])
      .filter(chart => typeof chart?.svg === 'string' && chart.svg.startsWith('<svg'))
      .slice(0, 8)
    const html = renderDataCenterHtml({
      organizationName: organization.rows[0]?.name || 'Entidad',
      activeFilters: Array.isArray(body.activeFilters) ? body.activeFilters.map(String).slice(0, 20) : [],
      data,
      charts,
    })
    const pdf = await renderPdf(html, { landscape: true })
    response.setHeader('Content-Type', 'application/pdf')
    response.setHeader('Content-Disposition', 'attachment; filename="centro-de-datos-listas-chequeo.pdf"')
    response.send(pdf)
  } catch (error) { next(error) }
})

/** Opciones para armar los desplegables del panel de filtros.
 *  Listas y servicios se listan COMPLETOS (todo el catalogo activo), no solo los que ya tienen
 *  rondas: un filtro que solo ofrece lo ya auditado parece un catalogo incompleto y no deja
 *  preguntar "¿por que este servicio no tiene rondas?". Los servicios llevan su CENTRO, porque
 *  el filtro los presenta en dos campos separados: primero la sede, luego el servicio. */
checklistsRouter.get('/analytics/options', checklistsModule, view, async (request, response, next) => {
  try {
    const [templates, areas, auditors, shifts, domains] = await Promise.all([
      query(`SELECT t.id, t.name, t.code FROM checklist_templates t
              WHERE t.organization_id = $1 AND t.status <> 'ARCHIVADA' ORDER BY t.name`, [oid(request)]),
      query(`SELECT ar.id, ar.name, ar.center FROM checklist_areas ar
              WHERE ar.organization_id = $1 AND ar.active
              ORDER BY CASE WHEN ar.center LIKE 'Hospital Central%' THEN 0
                            WHEN ar.center = '' THEN 2 ELSE 1 END, ar.center, ar.name`, [oid(request)]),
      query(`SELECT DISTINCT u.id, u.full_name AS name FROM users u
               JOIN checklist_audits a ON a.auditor_id = u.id
              WHERE a.organization_id = $1 ORDER BY u.full_name`, [oid(request)]),
      query(`SELECT DISTINCT shift FROM checklist_audits
              WHERE organization_id = $1 AND shift IS NOT NULL ORDER BY shift`, [oid(request)]),
      query(`SELECT DISTINCT d.id, d.name FROM checklist_domains d
               JOIN checklist_templates t ON t.id = d.template_id
              WHERE t.organization_id = $1 ORDER BY d.name`, [oid(request)]),
    ])
    response.json({
      templates: templates.rows.map(r => ({ ...r, id: String(r.id) })),
      areas: areas.rows.map(r => ({ ...r, id: String(r.id) })),
      // Centros unicos, en el mismo orden de las areas (HOCY primero).
      centers: [...new Set(areas.rows.map(r => r.center))],
      auditors: auditors.rows.map(r => ({ ...r, id: String(r.id) })),
      shifts: shifts.rows.map(r => r.shift),
      domains: domains.rows.map(r => ({ ...r, id: String(r.id) })),
    })
  } catch (error) { next(error) }
})

/**
 * Exportacion en CSV del recorte que se esta viendo. Con BOM: sin el, Excel en Windows abre el
 * archivo en la codificacion del sistema y "Prevención de caídas" llega hecho un jeroglifico.
 */
checklistsRouter.get('/analytics/export.csv', checklistsModule, view, async (request, response, next) => {
  try {
    const { params, where } = dataCenterFilters(request)
    const result = await query(
      `SELECT a.id, a.audit_date, a.shift, a.template_code, t.name AS template_name,
              COALESCE(ar.name, 'Sin servicio') AS area_name, u.full_name AS auditor_name,
              s.display_name AS evaluado, d.name AS dominio, c.item_number, c.text AS criterio,
              ans.value, a.adherence_percent
       ${DC_FROM}
       JOIN checklist_templates t ON t.id = a.template_id
       LEFT JOIN checklist_areas ar ON ar.id = a.area_id
       JOIN users u ON u.id = a.auditor_id
       JOIN checklist_audit_subjects s ON s.id = ans.audit_subject_id
       WHERE ${where}
       ORDER BY a.audit_date DESC, a.id, s.order_index, d.order_index, c.order_index`,
      params,
    )
    const columns = ['id', 'audit_date', 'shift', 'template_code', 'template_name', 'area_name',
      'auditor_name', 'evaluado', 'dominio', 'item_number', 'criterio', 'value', 'adherence_percent']
    const titles = ['Auditoría', 'Fecha', 'Turno', 'Código', 'Lista', 'Servicio', 'Auditor',
      'Evaluado', 'Dominio', 'Ítem', 'Criterio', 'Calificación', 'Adherencia de la auditoría']
    const escape = value => {
      if (value === null || value === undefined) return ''
      const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value)
      return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
    }
    // Separador ';': Excel en configuracion regional española no parte por comas.
    const lines = [titles.join(';'), ...result.rows.map(row => columns.map(col => escape(row[col])).join(';'))]
    response.setHeader('Content-Type', 'text/csv; charset=utf-8')
    response.setHeader('Content-Disposition', 'attachment; filename="listas-chequeo-datos.csv"')
    response.send('﻿' + lines.join('\r\n'))
  } catch (error) { next(error) }
})

// ---- Informe PDF de una auditoria ----

checklistsRouter.get('/audits/:auditId/report.pdf', checklistsModule, view, async (request, response, next) => {
  try {
    const audit = await assertAudit(request)
    const payload = await auditPayload(audit)
    const organization = await query('SELECT name FROM organizations WHERE id = $1', [oid(request)])
    const html = renderChecklistAuditReportHtml({
      organizationName: organization.rows[0]?.name || 'Entidad',
      audit: payload,
      domains: payload.domains,
      subjects: payload.subjects,
      answers: payload.answers,
      signatures: payload.signatures,
      adherence: payload.adherence,
    })
    const pdf = await renderPdf(html)
    // Siempre, sea propia o ajena: un PDF sale del sistema y puede acabar en cualquier parte.
    await logAudit(request, { auditId: audit.id, label: auditLabel(audit), action: 'DESCARGADA', detail: 'Informe PDF' })
    response.setHeader('Content-Type', 'application/pdf')
    response.setHeader('Content-Disposition', `attachment; filename="lista-chequeo-${audit.id}.pdf"`)
    response.send(pdf)
  } catch (error) { next(error) }
})

// ---- Informe consolidado ----

checklistsRouter.get('/analytics/consolidated.pdf', checklistsModule, view, async (request, response, next) => {
  try {
    const { params, where } = analyticsFilters(request)
    // Mismo reparto que en /analytics/summary: los JOIN de cada consulta tienen que ir ANTES
    // del WHERE, no detras.
    const from = 'FROM checklist_audits a JOIN checklist_answers ans ON ans.audit_id = a.id'
    const filter = `WHERE ${where}`

    const [overall, byTemplate, byArea, byDomain, worst, audits, organization] = await Promise.all([
      query(`SELECT ${TALLY} ${from} ${filter}`, params),
      query(`SELECT t.name, COUNT(DISTINCT a.id)::int AS audits, ${TALLY}
             ${from} JOIN checklist_templates t ON t.id = a.template_id
             ${filter} GROUP BY t.name ORDER BY t.name`, params),
      query(`SELECT COALESCE(ar.name, 'Sin área') AS name, COUNT(DISTINCT a.id)::int AS audits, ${TALLY}
             ${from} LEFT JOIN checklist_areas ar ON ar.id = a.area_id
             ${filter} GROUP BY ar.name ORDER BY ar.name NULLS LAST`, params),
      query(`SELECT d.name, ${TALLY}
             ${from} JOIN checklist_criteria c ON c.id = ans.criterion_id JOIN checklist_domains d ON d.id = c.domain_id
             ${filter}
             GROUP BY d.name ORDER BY d.name`, params),
      query(`SELECT c.text, t.name AS template_name, ${TALLY}
             ${from} JOIN checklist_criteria c ON c.id = ans.criterion_id
                     JOIN checklist_domains d ON d.id = c.domain_id
                     JOIN checklist_templates t ON t.id = d.template_id
             ${filter}
             GROUP BY c.text, t.name
             HAVING COUNT(*) FILTER (WHERE ans.value IN ('C','NC')) > 0
             ORDER BY (COUNT(*) FILTER (WHERE ans.value = 'C')::numeric
                       / NULLIF(COUNT(*) FILTER (WHERE ans.value IN ('C','NC')), 0)) ASC
             LIMIT 12`, params),
      query(`SELECT a.id FROM checklist_audits a WHERE ${where}`, params),
      query('SELECT name FROM organizations WHERE id = $1', [oid(request)]),
    ])

    const withPercent = rows => rows.map(row => ({
      ...row, c: Number(row.c), nc: Number(row.nc), na: Number(row.na),
      applicable: Number(row.c) + Number(row.nc), percent: percentOf(row),
    }))
    const totals = overall.rows[0] || { c: 0, nc: 0, na: 0 }

    const describeFilters = [
      request.query.dateFrom || request.query.dateTo
        ? `Periodo: ${request.query.dateFrom || 'inicio'} a ${request.query.dateTo || 'hoy'}`
        : 'Todo el periodo registrado',
      'Solo auditorías cerradas',
    ].join(' · ')

    const html = renderChecklistConsolidatedHtml({
      organizationName: organization.rows[0]?.name || 'Entidad',
      filters: describeFilters,
      audits: audits.rows,
      byTemplate: withPercent(byTemplate.rows),
      byArea: withPercent(byArea.rows),
      byDomain: withPercent(byDomain.rows),
      worstCriteria: withPercent(worst.rows),
      overall: { c: Number(totals.c), nc: Number(totals.nc), na: Number(totals.na), percent: percentOf(totals) },
    })
    const pdf = await renderPdf(html)
    response.setHeader('Content-Type', 'application/pdf')
    response.setHeader('Content-Disposition', 'attachment; filename="consolidado-listas-chequeo.pdf"')
    response.send(pdf)
  } catch (error) { next(error) }
})

// ===========================================================================
// FASE 5 — Carga de las listas institucionales reales
// ===========================================================================
// Prueba de fuego del constructor generico: las listas entran SOLO como datos
// (server/checklistSeed.mjs), sin una linea de codigo por lista. Reutiliza los mismos
// INSERT que usa el constructor, asi que si algo no cupiera aqui tampoco cabria a mano.

checklistsRouter.get('/seed/available', checklistsModule, manage, async (request, response, next) => {
  try {
    const codes = CHECKLIST_SEEDS.map(seed => seed.code)
    const existing = await query(
      'SELECT code, version FROM checklist_templates WHERE organization_id = $1 AND code = ANY($2::text[])',
      [oid(request), codes],
    )
    const already = new Set(existing.rows.map(row => `${row.code}|${row.version}`))
    response.json(CHECKLIST_SEEDS.map(seed => ({
      code: seed.code,
      version: seed.version,
      name: seed.name,
      subjectLabel: seed.subjectLabel,
      domains: seed.domains.length,
      criteria: seed.domains.reduce((total, domain) => total + domain.criteria.length, 0),
      imported: already.has(`${seed.code}|${seed.version}`),
    })))
  } catch (error) { next(error) }
})

checklistsRouter.post('/seed/import', checklistsModule, manage, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const only = Array.isArray(request.body?.codes) && request.body.codes.length
      ? new Set(request.body.codes.map(String))
      : null
    const results = []

    await client.query('BEGIN')
    for (const seed of CHECKLIST_SEEDS) {
      if (only && !only.has(seed.code)) continue
      // Idempotente: si ya esta cargada no se duplica ni se pisa lo que el equipo de calidad
      // haya ajustado despues. El indice unico (organizacion, codigo, version) lo respalda.
      const existing = await client.query(
        'SELECT id FROM checklist_templates WHERE organization_id = $1 AND code = $2 AND version = $3',
        [oid(request), seed.code, seed.version],
      )
      if (existing.rows[0]) { results.push({ code: seed.code, status: 'ya-existia' }); continue }

      const template = await client.query(
        `INSERT INTO checklist_templates (organization_id, code, version, name, subject_label, numbered_items, status, created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,'BORRADOR',$7) RETURNING id`,
        [oid(request), seed.code, seed.version, seed.name, seed.subjectLabel, Boolean(seed.numberedItems), uid(request)],
      )
      const templateId = template.rows[0].id

      for (const [index, field] of (seed.headerFields || []).entries()) {
        await client.query(
          `INSERT INTO checklist_header_fields (template_id, label, field_type, options, required, order_index)
           VALUES ($1,$2,$3,$4::jsonb,$5,$6)`,
          [templateId, field.label, field.field_type || 'TEXT', JSON.stringify(field.options || []), Boolean(field.required), index],
        )
      }
      for (const [index, field] of (seed.subjectFields || []).entries()) {
        await client.query(
          `INSERT INTO checklist_subject_fields (template_id, label, field_type, options, required, order_index)
           VALUES ($1,$2,$3,$4::jsonb,$5,$6)`,
          [templateId, field.label, field.field_type || 'TEXT', JSON.stringify(field.options || []), Boolean(field.required), index],
        )
      }
      for (const [domainIndex, domain] of seed.domains.entries()) {
        const inserted = await client.query(
          'INSERT INTO checklist_domains (template_id, name, order_index) VALUES ($1,$2,$3) RETURNING id',
          [templateId, domain.name, domainIndex],
        )
        for (const [criterionIndex, criterion] of domain.criteria.entries()) {
          await client.query(
            `INSERT INTO checklist_criteria (domain_id, item_number, text, guidance, order_index)
             VALUES ($1,$2,$3,$4,$5)`,
            [inserted.rows[0].id, criterion.item_number || '', criterion.text, criterion.guidance || '', criterionIndex],
          )
        }
      }
      results.push({
        code: seed.code, status: 'importada', templateId: String(templateId),
        domains: seed.domains.length,
        criteria: seed.domains.reduce((total, domain) => total + domain.criteria.length, 0),
      })
    }
    await client.query('COMMIT')
    // Quedan en BORRADOR a proposito: el equipo de calidad revisa, ajusta y publica. Importar no
    // deberia poner en circulacion una lista que nadie ha mirado.
    response.json({ results })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    next(error)
  } finally { client.release() }
})
