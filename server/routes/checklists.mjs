import { Router } from 'express'
import { pool, query } from '../db.mjs'
import { requireAnyModuleAccess, requirePermission } from '../auth.mjs'
import { computeAdherence, conceptFromPercent, isChecklistValue } from '../checklistScoring.mjs'

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
    let where = "t.organization_id = $1 AND t.status = 'PUBLICADA'"
    if (!canManage) {
      params.push(request.auth.membershipId)
      where += ` AND EXISTS (SELECT 1 FROM checklist_assignments a WHERE a.template_id = t.id AND a.membership_id = $${params.length})`
    }
    const result = await query(
      `SELECT t.id, t.code, t.version, t.name, t.subject_label, t.numbered_items, a.name AS area_name
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
    headerFields,
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
      "SELECT * FROM checklist_templates WHERE id = $1 AND organization_id = $2 AND status = 'PUBLICADA'",
      [templateId, oid(request)],
    )
    if (!template.rows[0]) fail(404, 'La lista no existe o no está publicada')
    if (!request.auth.permissions.includes('checklists.manage')) {
      const assigned = await query(
        'SELECT 1 FROM checklist_assignments WHERE template_id = $1 AND membership_id = $2',
        [templateId, request.auth.membershipId],
      )
      if (!assigned.rows[0]) fail(403, 'No tienes asignada esta lista')
    }
    const inserted = await query(
      `INSERT INTO checklist_audits (organization_id, template_id, area_id, audit_date, header_values, auditor_id)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING *`,
      [oid(request), templateId, template.rows[0].area_id, body.auditDate || new Date().toISOString().slice(0, 10),
        JSON.stringify(body.headerValues || {}), uid(request)],
    )
    response.status(201).json(inserted.rows[0])
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
    if (body.auditDate !== undefined) set('audit_date', body.auditDate)
    if (body.areaId !== undefined) set('area_id', body.areaId ? Number(body.areaId) : null)
    if (body.headerValues !== undefined) { params.push(JSON.stringify(body.headerValues)); sets.push(`header_values = $${params.length}::jsonb`) }
    if (!sets.length) return response.json(audit)
    params.push(audit.id)
    await query(`UPDATE checklist_audits SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params)
    const refreshed = await assertAudit(request)
    response.json(await auditPayload(refreshed))
  } catch (error) { next(error) }
})

checklistsRouter.delete('/audits/:auditId', checklistsModule, fill, async (request, response, next) => {
  try {
    const audit = await assertAudit(request, { requireOpen: true })
    await query('DELETE FROM checklist_audits WHERE id = $1 AND organization_id = $2', [audit.id, oid(request)])
    response.json({ ok: true })
  } catch (error) { next(error) }
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
    await client.query('UPDATE checklist_audits SET updated_at = NOW() WHERE id = $1', [audit.id])
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
    const updated = await query(
      `UPDATE checklist_audits SET status = 'CERRADA', adherence_percent = $1, concept = $2,
              closed_at = NOW(), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [percent, conceptFromPercent(percent), audit.id],
    )
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
              closed_at = NULL, updated_at = NOW() WHERE id = $1`,
      [audit.id],
    )
    await client.query('COMMIT')
    const refreshed = await assertAudit(request)
    response.json({ ...await auditPayload(refreshed), invalidatedSignatures: removed.rowCount })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    next(error)
  } finally { client.release() }
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
