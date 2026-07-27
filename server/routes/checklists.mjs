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
