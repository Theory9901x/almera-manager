import { Router } from 'express'
import { pool, query } from '../db.mjs'
import { requireAnyModuleAccess, requirePermission } from '../auth.mjs'
import { computeAdherence, conceptFromPercent, isChecklistValue } from '../checklistScoring.mjs'
import { renderPdf } from '../pdf.mjs'
import { renderChecklistAuditReportHtml, renderChecklistBlankFormatHtml, renderChecklistConsolidatedHtml } from '../templates/checklistReport.mjs'
import { CHECKLIST_SEEDS } from '../checklistSeed.mjs'

export const checklistsRouter = Router()

const oid = request => request.auth.organization.id
const uid = request => request.auth.user.id
const checklistsModule = requireAnyModuleAccess(['checklists'])
const view = requirePermission('checklists.view')
const manage = requirePermission('checklists.manage')
const fill = requirePermission('checklists.fill')

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
    const result = await query('SELECT * FROM checklist_areas WHERE organization_id = $1 ORDER BY name', [oid(request)])
    response.json(result.rows)
  } catch (error) { next(error) }
})

checklistsRouter.post('/areas', checklistsModule, manage, async (request, response, next) => {
  try {
    const name = String(request.body?.name || '').trim()
    if (!name) fail(400, 'El nombre del área es obligatorio')
    const result = await query(
      `INSERT INTO checklist_areas (organization_id, name) VALUES ($1, $2)
       ON CONFLICT (organization_id, name) DO UPDATE SET active = TRUE RETURNING *`,
      [oid(request), name],
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

// ---- Listas (plantillas) ----

checklistsRouter.get('/', checklistsModule, view, async (request, response, next) => {
  try {
    const result = await query(
      `SELECT t.*, a.name AS area_name, u.full_name AS created_by_name,
              (SELECT COUNT(*)::int FROM checklist_domains d WHERE d.template_id = t.id) AS domain_count,
              (SELECT COUNT(*)::int FROM checklist_criteria c
                 JOIN checklist_domains d ON d.id = c.domain_id
                WHERE d.template_id = t.id AND c.active) AS criteria_count
       FROM checklist_templates t
       LEFT JOIN checklist_areas a ON a.id = t.area_id
       JOIN users u ON u.id = t.created_by_id
       WHERE t.organization_id = $1
       ORDER BY t.updated_at DESC`,
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
      `INSERT INTO checklist_templates (organization_id, area_id, code, version, name, description, subject_label, numbered_items, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [oid(request), body.areaId ? Number(body.areaId) : null, code, String(body.version || '01').trim(), name,
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
  const [subjects, answers, headerFields, signatures] = await Promise.all([
    query('SELECT * FROM checklist_audit_subjects WHERE audit_id = $1 ORDER BY order_index, id', [audit.id]),
    query('SELECT * FROM checklist_answers WHERE audit_id = $1', [audit.id]),
    query('SELECT * FROM checklist_header_fields WHERE template_id = $1 ORDER BY order_index, id', [audit.template_id]),
    query('SELECT * FROM checklist_signatures WHERE audit_id = $1 ORDER BY signed_at', [audit.id]),
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
      `SELECT a.id, a.audit_date, a.status, a.adherence_percent, a.concept, a.created_at,
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
