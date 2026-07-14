import { Router } from 'express'
import { pool, query } from '../db.mjs'
import { requireAnyModuleAccess, requireAnyPermission } from '../auth.mjs'
import { renderPdf } from '../pdf.mjs'
import { renderAdherenceReportHtml } from '../templates/adherenceReport.mjs'
import { renderAdherenceDashboardHtml } from '../templates/adherenceDashboardReport.mjs'

export const adherenceRouter = Router()

const oid = request => request.auth.organization.id
const uid = request => request.auth.user.id
const mid = request => request.auth.membershipId
const matrixModule = requireAnyModuleAccess(['adherence-matrix'])
const view = requireAnyPermission(['adherence_matrix.view', 'adherence_matrix.manage'])
const manage = requireAnyPermission(['adherence_matrix.manage'])
const evaluate = requireAnyPermission(['adherence_matrix.evaluate', 'adherence_matrix.manage'])
const close = requireAnyPermission(['adherence_matrix.close', 'adherence_matrix.manage'])
const exportData = requireAnyPermission(['adherence_matrix.export', 'adherence_matrix.manage'])

adherenceRouter.use(matrixModule)

function fail(status, message) {
  const error = new Error(message)
  error.status = status
  throw error
}

function computeCompliance(criteria, scores) {
  const byCriterion = new Map(criteria.map(criterion => [String(criterion.id), { weight: Number(criterion.weight), scopeId: String(criterion.scope_id), pointsSum: 0, appliedCount: 0 }]))
  for (const scoreRow of scores) {
    if (scoreRow.score === null || scoreRow.score === undefined) continue
    const entry = byCriterion.get(String(scoreRow.criterion_id))
    if (!entry) continue
    entry.pointsSum += (Number(scoreRow.score) / 2) * entry.weight
    entry.appliedCount += 1
  }
  const criterionResults = [...byCriterion.entries()].map(([criterionId, entry]) => {
    const applicable = entry.appliedCount > 0
    const ab = applicable ? entry.pointsSum / entry.appliedCount : 0
    const s = applicable ? entry.weight : 0
    return { criterionId, scopeId: entry.scopeId, ab, s, compliancePercent: applicable ? (ab / entry.weight) * 100 : null }
  })
  const byScope = new Map()
  for (const result of criterionResults) {
    const bucket = byScope.get(result.scopeId) || { abSum: 0, sSum: 0 }
    bucket.abSum += result.ab
    bucket.sSum += result.s
    byScope.set(result.scopeId, bucket)
  }
  const scopeResults = [...byScope.entries()].map(([scopeId, bucket]) => ({
    scopeId, compliancePercent: bucket.sSum > 0 ? (bucket.abSum / bucket.sSum) * 100 : null,
  }))
  const abTotal = criterionResults.reduce((sum, result) => sum + result.ab, 0)
  const sTotal = criterionResults.reduce((sum, result) => sum + result.s, 0)
  const overallCompliance = sTotal > 0 ? (abTotal / sTotal) * 100 : 0
  return { criterionResults, scopeResults, overallCompliance }
}

async function resolveConcept(organizationId, percent) {
  const thresholds = await query('SELECT concept, min_percent FROM adherence_thresholds WHERE organization_id = $1 ORDER BY min_percent DESC', [organizationId])
  const match = thresholds.rows.find(threshold => percent >= Number(threshold.min_percent))
  return match ? match.concept : (thresholds.rows[thresholds.rows.length - 1]?.concept || null)
}

adherenceRouter.get('/areas', view, async (request, response, next) => {
  try {
    const result = await query(
      `SELECT a.id, a.name, a.active, a.created_at, a.updated_at,
              mv.id AS matrix_version_id, mv.version_number,
              (SELECT COUNT(*) FROM adherence_scopes s WHERE s.matrix_version_id = mv.id AND s.active)::int AS scope_count,
              (SELECT COUNT(*) FROM adherence_criteria c WHERE c.matrix_version_id = mv.id AND c.active)::int AS criteria_count,
              (SELECT COALESCE(SUM(c.weight), 0) FROM adherence_criteria c WHERE c.matrix_version_id = mv.id AND c.active) AS weight_total
       FROM adherence_areas a
       LEFT JOIN adherence_matrix_versions mv ON mv.area_id = a.id AND mv.is_current
       WHERE a.organization_id = $1
       ORDER BY a.name`,
      [oid(request)],
    )
    response.json(result.rows)
  } catch (error) { next(error) }
})

adherenceRouter.post('/areas', manage, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const name = String(request.body?.name || '').trim()
    if (!name) return response.status(400).json({ error: 'El nombre del área es obligatorio' })
    await client.query('BEGIN')
    const area = await client.query(
      `INSERT INTO adherence_areas (organization_id, name) VALUES ($1, $2) RETURNING *`,
      [oid(request), name],
    )
    await client.query(
      `INSERT INTO adherence_matrix_versions (area_id, version_number, is_current, created_by_id)
       VALUES ($1, 1, TRUE, $2)`,
      [area.rows[0].id, uid(request)],
    )
    await client.query('COMMIT')
    response.status(201).json(area.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505') return response.status(409).json({ error: 'Ya existe un área con ese nombre' })
    next(error)
  } finally { client.release() }
})

adherenceRouter.patch('/areas/:id', manage, async (request, response, next) => {
  try {
    const body = request.body || {}
    const fields = []
    const values = []
    if (Object.hasOwn(body, 'name')) { values.push(String(body.name).trim()); fields.push(`name = $${values.length}`) }
    if (Object.hasOwn(body, 'active')) { values.push(Boolean(body.active)); fields.push(`active = $${values.length}`) }
    if (!fields.length) return response.status(400).json({ error: 'No hay cambios válidos' })
    values.push(request.params.id, oid(request))
    const result = await query(
      `UPDATE adherence_areas SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length - 1} AND organization_id = $${values.length} RETURNING *`,
      values,
    )
    if (!result.rows[0]) return response.status(404).json({ error: 'Área no encontrada' })
    response.json(result.rows[0])
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'Ya existe un área con ese nombre' })
    next(error)
  }
})

adherenceRouter.get('/areas/:id/matrix', view, async (request, response, next) => {
  try {
    const area = await query('SELECT id, name FROM adherence_areas WHERE id = $1 AND organization_id = $2', [request.params.id, oid(request)])
    if (!area.rows[0]) return response.status(404).json({ error: 'Área no encontrada' })
    const version = await query(
      'SELECT id, version_number FROM adherence_matrix_versions WHERE area_id = $1 AND is_current',
      [request.params.id],
    )
    if (!version.rows[0]) return response.status(404).json({ error: 'La matriz del área no tiene una versión vigente' })
    const [scopes, criteria] = await Promise.all([
      query('SELECT * FROM adherence_scopes WHERE matrix_version_id = $1 ORDER BY order_index, id', [version.rows[0].id]),
      query('SELECT * FROM adherence_criteria WHERE matrix_version_id = $1 ORDER BY scope_id, order_index, id', [version.rows[0].id]),
    ])
    response.json({
      area: area.rows[0],
      matrixVersionId: version.rows[0].id,
      versionNumber: version.rows[0].version_number,
      scopes: scopes.rows,
      criteria: criteria.rows,
    })
  } catch (error) { next(error) }
})

adherenceRouter.put('/areas/:id/matrix', manage, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const body = request.body || {}
    const scopesInput = Array.isArray(body.scopes) ? body.scopes : []
    const criteriaInput = Array.isArray(body.criteria) ? body.criteria : []
    if (!scopesInput.length) return response.status(400).json({ error: 'La matriz necesita al menos un ámbito' })
    for (const scope of scopesInput) {
      if (!String(scope?.name || '').trim()) return response.status(400).json({ error: 'Todos los ámbitos necesitan un nombre' })
    }
    for (const criterion of criteriaInput) {
      const weight = Number(criterion?.weight)
      if (!String(criterion?.text || '').trim()) return response.status(400).json({ error: 'Todos los criterios necesitan un texto' })
      if (!Number.isFinite(weight) || weight <= 0) return response.status(400).json({ error: 'Cada criterio necesita un peso mayor a 0' })
      if (!Number.isInteger(criterion?.scopeIndex) || criterion.scopeIndex < 0 || criterion.scopeIndex >= scopesInput.length) {
        return response.status(400).json({ error: 'Cada criterio debe pertenecer a un ámbito válido' })
      }
    }
    const weightTotal = criteriaInput.reduce((sum, criterion) => sum + Number(criterion.weight), 0)
    if (Math.abs(weightTotal - 100) > 0.01) {
      return response.status(400).json({ error: `La suma de los pesos debe ser 100. Actualmente suma ${weightTotal.toFixed(2)}` })
    }

    await client.query('BEGIN')
    const area = await client.query('SELECT id FROM adherence_areas WHERE id = $1 AND organization_id = $2 FOR UPDATE', [request.params.id, oid(request)])
    if (!area.rows[0]) fail(404, 'Área no encontrada')
    const current = await client.query('SELECT id, version_number FROM adherence_matrix_versions WHERE area_id = $1 AND is_current FOR UPDATE', [request.params.id])
    if (!current.rows[0]) fail(404, 'La matriz del área no tiene una versión vigente')
    const inUse = await client.query('SELECT EXISTS(SELECT 1 FROM adherence_evaluations WHERE matrix_version_id = $1) AS used', [current.rows[0].id])

    let targetVersionId = current.rows[0].id
    if (inUse.rows[0].used) {
      await client.query('UPDATE adherence_matrix_versions SET is_current = FALSE WHERE id = $1', [current.rows[0].id])
      const nextVersion = await client.query(
        `INSERT INTO adherence_matrix_versions (area_id, version_number, is_current, created_by_id)
         VALUES ($1, $2, TRUE, $3) RETURNING id`,
        [request.params.id, current.rows[0].version_number + 1, uid(request)],
      )
      targetVersionId = nextVersion.rows[0].id
    } else {
      await client.query('DELETE FROM adherence_criteria WHERE matrix_version_id = $1', [targetVersionId])
      await client.query('DELETE FROM adherence_scopes WHERE matrix_version_id = $1', [targetVersionId])
    }

    const scopeIds = []
    for (const [index, scope] of scopesInput.entries()) {
      const result = await client.query(
        `INSERT INTO adherence_scopes (matrix_version_id, name, order_index) VALUES ($1, $2, $3) RETURNING id`,
        [targetVersionId, String(scope.name).trim(), Number.isInteger(scope.orderIndex) ? scope.orderIndex : index],
      )
      scopeIds.push(result.rows[0].id)
    }
    for (const [index, criterion] of criteriaInput.entries()) {
      await client.query(
        `INSERT INTO adherence_criteria (matrix_version_id, scope_id, text, weight, order_index)
         VALUES ($1, $2, $3, $4, $5)`,
        [targetVersionId, scopeIds[criterion.scopeIndex], String(criterion.text).trim(), Number(criterion.weight), Number.isInteger(criterion.orderIndex) ? criterion.orderIndex : index],
      )
    }
    await client.query('COMMIT')

    const [scopes, criteria] = await Promise.all([
      query('SELECT * FROM adherence_scopes WHERE matrix_version_id = $1 ORDER BY order_index, id', [targetVersionId]),
      query('SELECT * FROM adherence_criteria WHERE matrix_version_id = $1 ORDER BY scope_id, order_index, id', [targetVersionId]),
    ])
    response.json({ matrixVersionId: targetVersionId, scopes: scopes.rows, criteria: criteria.rows, weightTotal })
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})

adherenceRouter.get('/positions', view, async (request, response, next) => {
  try {
    const result = await query('SELECT * FROM adherence_positions WHERE organization_id = $1 ORDER BY name', [oid(request)])
    response.json(result.rows)
  } catch (error) { next(error) }
})

adherenceRouter.post('/positions', manage, async (request, response, next) => {
  try {
    const name = String(request.body?.name || '').trim()
    if (!name) return response.status(400).json({ error: 'El nombre del cargo es obligatorio' })
    const result = await query('INSERT INTO adherence_positions (organization_id, name) VALUES ($1, $2) RETURNING *', [oid(request), name])
    response.status(201).json(result.rows[0])
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'Ya existe un cargo con ese nombre' })
    next(error)
  }
})

adherenceRouter.patch('/positions/:id', manage, async (request, response, next) => {
  try {
    const body = request.body || {}
    const fields = []
    const values = []
    if (Object.hasOwn(body, 'name')) { values.push(String(body.name).trim()); fields.push(`name = $${values.length}`) }
    if (Object.hasOwn(body, 'active')) { values.push(Boolean(body.active)); fields.push(`active = $${values.length}`) }
    if (!fields.length) return response.status(400).json({ error: 'No hay cambios válidos' })
    values.push(request.params.id, oid(request))
    const result = await query(
      `UPDATE adherence_positions SET ${fields.join(', ')} WHERE id = $${values.length - 1} AND organization_id = $${values.length} RETURNING *`,
      values,
    )
    if (!result.rows[0]) return response.status(404).json({ error: 'Cargo no encontrado' })
    response.json(result.rows[0])
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'Ya existe un cargo con ese nombre' })
    next(error)
  }
})

adherenceRouter.get('/professionals', view, async (request, response, next) => {
  try {
    const params = [oid(request)]
    const where = ['p.organization_id = $1']
    if (request.query.areaId) { params.push(request.query.areaId); where.push(`p.area_id = $${params.length}`) }
    if (request.query.positionId) { params.push(request.query.positionId); where.push(`p.position_id = $${params.length}`) }
    if (request.query.q) { params.push(`%${request.query.q}%`); where.push(`(p.full_name ILIKE $${params.length} OR p.document_id ILIKE $${params.length})`) }
    const result = await query(
      `SELECT p.*, a.name AS area_name, pos.name AS position_name
       FROM adherence_professionals p
       JOIN adherence_areas a ON a.id = p.area_id
       JOIN adherence_positions pos ON pos.id = p.position_id
       WHERE ${where.join(' AND ')}
       ORDER BY p.full_name`,
      params,
    )
    response.json(result.rows)
  } catch (error) { next(error) }
})

adherenceRouter.post('/professionals', manage, async (request, response, next) => {
  try {
    const body = request.body || {}
    const fullName = String(body.fullName || '').trim()
    const documentId = String(body.documentId || '').trim()
    if (!fullName || !documentId || !body.areaId || !body.positionId) {
      return response.status(400).json({ error: 'Nombre, documento, área y cargo son obligatorios' })
    }
    const result = await query(
      `INSERT INTO adherence_professionals (organization_id, area_id, position_id, full_name, document_id, specialty, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [oid(request), body.areaId, body.positionId, fullName, documentId, body.specialty || '', body.status || 'ACTIVE_INDEFINITE'],
    )
    response.status(201).json(result.rows[0])
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'Ya existe un profesional con ese documento' })
    next(error)
  }
})

adherenceRouter.patch('/professionals/:id', manage, async (request, response, next) => {
  try {
    const body = request.body || {}
    const fieldMap = {
      fullName: 'full_name', documentId: 'document_id', specialty: 'specialty',
      status: 'status', areaId: 'area_id', positionId: 'position_id', active: 'active',
    }
    const changes = Object.entries(fieldMap).filter(([key]) => Object.hasOwn(body, key))
    if (!changes.length) return response.status(400).json({ error: 'No hay cambios válidos' })
    const values = changes.map(([key]) => body[key])
    const sets = changes.map(([, column], index) => `${column} = $${index + 1}`)
    values.push(request.params.id, oid(request))
    const result = await query(
      `UPDATE adherence_professionals SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length - 1} AND organization_id = $${values.length} RETURNING *`,
      values,
    )
    if (!result.rows[0]) return response.status(404).json({ error: 'Profesional no encontrado' })
    response.json(result.rows[0])
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'Ya existe un profesional con ese documento' })
    next(error)
  }
})

adherenceRouter.get('/evaluations', view, async (request, response, next) => {
  try {
    const params = [oid(request)]
    const where = ['e.organization_id = $1']
    if (request.query.professionalId) { params.push(request.query.professionalId); where.push(`e.professional_id = $${params.length}`) }
    if (request.query.areaId) { params.push(request.query.areaId); where.push(`p.area_id = $${params.length}`) }
    if (request.query.monthReported) { params.push(request.query.monthReported); where.push(`e.month_reported = $${params.length}`) }
    const result = await query(
      `SELECT e.id, e.month_reported, e.evaluation_date, e.total_records, e.overall_compliance, e.concept, e.status,
              p.id AS professional_id, p.full_name AS professional_name, a.id AS area_id, a.name AS area_name
       FROM adherence_evaluations e
       JOIN adherence_professionals p ON p.id = e.professional_id
       JOIN adherence_areas a ON a.id = p.area_id
       WHERE ${where.join(' AND ')}
       ORDER BY e.created_at DESC`,
      params,
    )
    response.json(result.rows)
  } catch (error) { next(error) }
})

adherenceRouter.post('/evaluations', evaluate, async (request, response, next) => {
  try {
    const body = request.body || {}
    if (!body.professionalId || !body.monthReported || !body.professionalStatusSnapshot) {
      return response.status(400).json({ error: 'Profesional, mes reportado y estado del profesional son obligatorios' })
    }
    const professional = await query('SELECT id, area_id, status FROM adherence_professionals WHERE id = $1 AND organization_id = $2', [body.professionalId, oid(request)])
    if (!professional.rows[0]) return response.status(400).json({ error: 'El profesional no pertenece a esta entidad' })
    const version = await query('SELECT id FROM adherence_matrix_versions WHERE area_id = $1 AND is_current', [professional.rows[0].area_id])
    if (!version.rows[0]) return response.status(400).json({ error: 'El área del profesional no tiene una matriz vigente' })
    const result = await query(
      `INSERT INTO adherence_evaluations (
         organization_id, matrix_version_id, professional_id, evaluator_membership_id, service, city_site,
         professional_status_snapshot, month_reported, evaluation_date, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,CURRENT_DATE),$10) RETURNING *`,
      [oid(request), version.rows[0].id, body.professionalId, mid(request), body.service || '', body.citySite || '',
        body.professionalStatusSnapshot, body.monthReported, body.evaluationDate || null, uid(request)],
    )
    response.status(201).json(result.rows[0])
  } catch (error) { next(error) }
})

async function loadEvaluationDetail(organizationId, evaluationId) {
  const evaluation = await query(
    `SELECT e.*, p.full_name AS professional_name, p.document_id, a.id AS area_id, a.name AS area_name
     FROM adherence_evaluations e
     JOIN adherence_professionals p ON p.id = e.professional_id
     JOIN adherence_areas a ON a.id = p.area_id
     WHERE e.id = $1 AND e.organization_id = $2`,
    [evaluationId, organizationId],
  )
  if (!evaluation.rows[0]) return null
  const matrixVersionId = evaluation.rows[0].matrix_version_id
  const [scopes, criteria, records, scores] = await Promise.all([
    query('SELECT * FROM adherence_scopes WHERE matrix_version_id = $1 ORDER BY order_index, id', [matrixVersionId]),
    query('SELECT * FROM adherence_criteria WHERE matrix_version_id = $1 ORDER BY scope_id, order_index, id', [matrixVersionId]),
    query('SELECT * FROM adherence_evaluation_records WHERE evaluation_id = $1 ORDER BY created_at, id', [evaluationId]),
    query('SELECT evaluation_record_id, criterion_id, score FROM adherence_evaluation_scores WHERE evaluation_id = $1', [evaluationId]),
  ])
  const { criterionResults, scopeResults, overallCompliance } = computeCompliance(criteria.rows, scores.rows)
  return {
    evaluation: evaluation.rows[0], scopes: scopes.rows, criteria: criteria.rows, records: records.rows, scores: scores.rows,
    criterionResults, scopeResults, overallCompliance,
  }
}

adherenceRouter.get('/evaluations/:id', view, async (request, response, next) => {
  try {
    const detail = await loadEvaluationDetail(oid(request), request.params.id)
    if (!detail) return response.status(404).json({ error: 'Evaluación no encontrada' })
    response.json(detail)
  } catch (error) { next(error) }
})

adherenceRouter.patch('/evaluations/:id', evaluate, async (request, response, next) => {
  try {
    const body = request.body || {}
    const fieldMap = { generalObservations: 'general_observations', commitments: 'commitments', improvementPlanPercent: 'improvement_plan_percent' }
    const changes = Object.entries(fieldMap).filter(([key]) => Object.hasOwn(body, key))
    if (!changes.length) return response.status(400).json({ error: 'No hay cambios válidos' })
    const values = changes.map(([key]) => body[key])
    const sets = changes.map(([, column], index) => `${column} = $${index + 1}`)
    values.push(request.params.id, oid(request))
    const result = await query(
      `UPDATE adherence_evaluations SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length - 1} AND organization_id = $${values.length} AND status = 'DRAFT' RETURNING *`,
      values,
    )
    if (!result.rows[0]) return response.status(404).json({ error: 'Evaluación no encontrada o ya está cerrada' })
    response.json(result.rows[0])
  } catch (error) { next(error) }
})

adherenceRouter.post('/evaluations/:id/close', close, async (request, response, next) => {
  try {
    const evaluatorSignedName = String(request.body?.evaluatorSignedName || request.auth.user.fullName).trim()
    const result = await query(
      `UPDATE adherence_evaluations
       SET status = 'CLOSED', evaluator_signed_name = $1, evaluator_signed_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND organization_id = $3 AND status = 'DRAFT' AND total_records > 0 RETURNING *`,
      [evaluatorSignedName, request.params.id, oid(request)],
    )
    if (!result.rows[0]) return response.status(409).json({ error: 'La evaluación no puede cerrarse: verifica que tenga historias clínicas y no esté ya cerrada' })
    response.json(result.rows[0])
  } catch (error) { next(error) }
})

adherenceRouter.post('/evaluations/:id/reopen', close, async (request, response, next) => {
  try {
    if (!String(request.body?.justification || '').trim()) return response.status(400).json({ error: 'La justificación es obligatoria para reabrir' })
    const result = await query(
      `UPDATE adherence_evaluations
       SET status = 'DRAFT', evaluator_signed_name = NULL, evaluator_signed_at = NULL,
           professional_signed_name = NULL, professional_signed_at = NULL, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status = 'CLOSED' RETURNING *`,
      [request.params.id, oid(request)],
    )
    if (!result.rows[0]) return response.status(404).json({ error: 'Evaluación no encontrada o no está cerrada' })
    await query(
      `INSERT INTO activity_logs (organization_id, entity_type, entity_id, action, changes, actor_user_id)
       VALUES ($1, 'ADHERENCE_EVALUATION', $2, 'REOPENED', $3, $4)`,
      [oid(request), request.params.id, JSON.stringify({ justification: request.body.justification }), uid(request)],
    )
    response.json(result.rows[0])
  } catch (error) { next(error) }
})

adherenceRouter.post('/evaluations/:id/sign', close, async (request, response, next) => {
  try {
    const professionalSignedName = String(request.body?.professionalSignedName || '').trim()
    if (!professionalSignedName) return response.status(400).json({ error: 'El nombre del profesional es obligatorio para registrar la firma' })
    const result = await query(
      `UPDATE adherence_evaluations SET professional_signed_name = $1, professional_signed_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND organization_id = $3 RETURNING *`,
      [professionalSignedName, request.params.id, oid(request)],
    )
    if (!result.rows[0]) return response.status(404).json({ error: 'Evaluación no encontrada' })
    response.json(result.rows[0])
  } catch (error) { next(error) }
})

adherenceRouter.get('/evaluations/:id/report.pdf', exportData, async (request, response, next) => {
  try {
    const detail = await loadEvaluationDetail(oid(request), request.params.id)
    if (!detail) return response.status(404).json({ error: 'Evaluación no encontrada' })
    const thresholds = await query('SELECT concept, min_percent FROM adherence_thresholds WHERE organization_id = $1 ORDER BY min_percent DESC', [oid(request)])
    const html = renderAdherenceReportHtml({ ...detail, thresholds: thresholds.rows })
    const pdf = await renderPdf(html)
    response.setHeader('Content-Type', 'application/pdf')
    response.setHeader('Content-Disposition', `attachment; filename="informe-adherencia-${request.params.id}.pdf"`)
    response.send(pdf)
  } catch (error) { next(error) }
})

adherenceRouter.post('/evaluations/:id/records', evaluate, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const recordNumber = String(request.body?.recordNumber || '').trim()
    if (!recordNumber) return response.status(400).json({ error: 'El número de HC es obligatorio' })
    await client.query('BEGIN')
    const evaluation = await client.query('SELECT id, status FROM adherence_evaluations WHERE id = $1 AND organization_id = $2 FOR UPDATE', [request.params.id, oid(request)])
    if (!evaluation.rows[0]) fail(404, 'Evaluación no encontrada')
    if (evaluation.rows[0].status !== 'DRAFT') fail(409, 'La evaluación ya está cerrada')
    const record = await client.query(
      'INSERT INTO adherence_evaluation_records (evaluation_id, record_number, observations) VALUES ($1,$2,$3) RETURNING *',
      [request.params.id, recordNumber, request.body?.observations || ''],
    )
    await client.query(
      'UPDATE adherence_evaluations SET total_records = (SELECT COUNT(*) FROM adherence_evaluation_records WHERE evaluation_id = $1), updated_at = NOW() WHERE id = $1',
      [request.params.id],
    )
    await client.query('COMMIT')
    response.status(201).json(record.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})

adherenceRouter.patch('/evaluations/:id/records/:recordId', evaluate, async (request, response, next) => {
  try {
    const evaluation = await query('SELECT id FROM adherence_evaluations WHERE id = $1 AND organization_id = $2', [request.params.id, oid(request)])
    if (!evaluation.rows[0]) return response.status(404).json({ error: 'Evaluación no encontrada' })
    const body = request.body || {}
    const fields = []
    const values = []
    if (Object.hasOwn(body, 'recordNumber')) { values.push(String(body.recordNumber).trim()); fields.push(`record_number = $${values.length}`) }
    if (Object.hasOwn(body, 'observations')) { values.push(String(body.observations)); fields.push(`observations = $${values.length}`) }
    if (!fields.length) return response.status(400).json({ error: 'No hay cambios válidos' })
    values.push(request.params.recordId, request.params.id)
    const result = await query(
      `UPDATE adherence_evaluation_records SET ${fields.join(', ')}
       WHERE id = $${values.length - 1} AND evaluation_id = $${values.length} RETURNING *`,
      values,
    )
    if (!result.rows[0]) return response.status(404).json({ error: 'Historia clínica no encontrada' })
    response.json(result.rows[0])
  } catch (error) { next(error) }
})

adherenceRouter.delete('/evaluations/:id/records/:recordId', evaluate, async (request, response, next) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const evaluation = await client.query('SELECT id, status FROM adherence_evaluations WHERE id = $1 AND organization_id = $2 FOR UPDATE', [request.params.id, oid(request)])
    if (!evaluation.rows[0]) fail(404, 'Evaluación no encontrada')
    if (evaluation.rows[0].status !== 'DRAFT') fail(409, 'La evaluación ya está cerrada')
    const deleted = await client.query('DELETE FROM adherence_evaluation_records WHERE id = $1 AND evaluation_id = $2 RETURNING id', [request.params.recordId, request.params.id])
    if (!deleted.rows[0]) fail(404, 'Historia clínica no encontrada')
    await client.query(
      'UPDATE adherence_evaluations SET total_records = (SELECT COUNT(*) FROM adherence_evaluation_records WHERE evaluation_id = $1), updated_at = NOW() WHERE id = $1',
      [request.params.id],
    )
    await client.query('COMMIT')
    response.json({ ok: true })
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})

adherenceRouter.put('/evaluations/:id/scores', evaluate, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const scoresInput = Array.isArray(request.body?.scores) ? request.body.scores : []
    for (const item of scoresInput) {
      if (item.score !== null && ![0, 1, 2].includes(Number(item.score))) return response.status(400).json({ error: 'Cada puntuación debe ser 0, 1, 2 o No Aplica' })
    }
    await client.query('BEGIN')
    const evaluation = await client.query('SELECT * FROM adherence_evaluations WHERE id = $1 AND organization_id = $2 FOR UPDATE', [request.params.id, oid(request)])
    if (!evaluation.rows[0]) fail(404, 'Evaluación no encontrada')
    if (evaluation.rows[0].status !== 'DRAFT') fail(409, 'La evaluación ya está cerrada')
    const matrixVersionId = evaluation.rows[0].matrix_version_id
    const validRecords = await client.query('SELECT id FROM adherence_evaluation_records WHERE evaluation_id = $1', [request.params.id])
    const validRecordIds = new Set(validRecords.rows.map(row => String(row.id)))
    const validCriteria = await client.query('SELECT id FROM adherence_criteria WHERE matrix_version_id = $1', [matrixVersionId])
    const validCriterionIds = new Set(validCriteria.rows.map(row => String(row.id)))
    for (const item of scoresInput) {
      if (!validRecordIds.has(String(item.recordId)) || !validCriterionIds.has(String(item.criterionId))) {
        fail(400, 'Una calificación hace referencia a una historia clínica o criterio inválido')
      }
      await client.query(
        `INSERT INTO adherence_evaluation_scores (evaluation_id, evaluation_record_id, criterion_id, score)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (evaluation_record_id, criterion_id) DO UPDATE SET score = EXCLUDED.score`,
        [request.params.id, item.recordId, item.criterionId, item.score === null ? null : Number(item.score)],
      )
    }
    const [criteria, scores] = await Promise.all([
      client.query('SELECT * FROM adherence_criteria WHERE matrix_version_id = $1', [matrixVersionId]),
      client.query('SELECT evaluation_record_id, criterion_id, score FROM adherence_evaluation_scores WHERE evaluation_id = $1', [request.params.id]),
    ])
    const { criterionResults, scopeResults, overallCompliance } = computeCompliance(criteria.rows, scores.rows)
    const concept = await resolveConcept(oid(request), overallCompliance)
    await client.query('UPDATE adherence_evaluations SET overall_compliance = $1, concept = $2, updated_at = NOW() WHERE id = $3', [overallCompliance, concept, request.params.id])
    await client.query('COMMIT')
    response.json({ criterionResults, scopeResults, overallCompliance, concept })
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})

async function loadDashboard(request) {
  const params = [oid(request)]
  const where = ['e.organization_id = $1', 'e.total_records > 0']
  if (request.query.monthReported) { params.push(request.query.monthReported); where.push(`e.month_reported = $${params.length}`) }
  if (request.query.professionalId) { params.push(request.query.professionalId); where.push(`e.professional_id = $${params.length}`) }
  if (request.query.positionId) { params.push(request.query.positionId); where.push(`p.position_id = $${params.length}`) }
  if (request.query.areaId) { params.push(request.query.areaId); where.push(`p.area_id = $${params.length}`) }

  const evaluations = await query(
    `SELECT e.id, e.overall_compliance, e.concept, e.month_reported, e.matrix_version_id, e.status, e.evaluation_date,
            p.id AS professional_id, p.full_name AS professional_name, a.name AS area_name
     FROM adherence_evaluations e
     JOIN adherence_professionals p ON p.id = e.professional_id
     JOIN adherence_areas a ON a.id = p.area_id
     WHERE ${where.join(' AND ')}
     ORDER BY e.evaluation_date`,
    params,
  )
  const rows = evaluations.rows
  const matrixVersionIds = [...new Set(rows.map(row => row.matrix_version_id))]
  const evaluationIds = rows.map(row => row.id)
  const [scopesResult, criteriaResult, scoresResult] = await Promise.all([
    matrixVersionIds.length ? query('SELECT * FROM adherence_scopes WHERE matrix_version_id = ANY($1::bigint[])', [matrixVersionIds]) : { rows: [] },
    matrixVersionIds.length ? query('SELECT * FROM adherence_criteria WHERE matrix_version_id = ANY($1::bigint[])', [matrixVersionIds]) : { rows: [] },
    evaluationIds.length ? query('SELECT evaluation_id, evaluation_record_id, criterion_id, score FROM adherence_evaluation_scores WHERE evaluation_id = ANY($1::bigint[])', [evaluationIds]) : { rows: [] },
  ])

  const scopesByVersion = new Map()
  for (const scope of scopesResult.rows) {
    const list = scopesByVersion.get(scope.matrix_version_id) || []
    list.push(scope)
    scopesByVersion.set(scope.matrix_version_id, list)
  }
  const criteriaByVersion = new Map()
  for (const criterion of criteriaResult.rows) {
    const list = criteriaByVersion.get(criterion.matrix_version_id) || []
    list.push(criterion)
    criteriaByVersion.set(criterion.matrix_version_id, list)
  }
  const scoresByEvaluation = new Map()
  for (const scoreRow of scoresResult.rows) {
    const list = scoresByEvaluation.get(scoreRow.evaluation_id) || []
    list.push(scoreRow)
    scoresByEvaluation.set(scoreRow.evaluation_id, list)
  }

  const scopeAggregate = new Map()
  const byConcept = { OPTIMO: 0, ACEPTABLE: 0, DEFICIENTE: 0, MUY_DEFICIENTE: 0 }
  let complianceSum = 0
  let complianceCount = 0
  const byProfessional = new Map()
  const byMonth = new Map()

  for (const row of rows) {
    if (row.concept) byConcept[row.concept] = (byConcept[row.concept] || 0) + 1
    if (row.overall_compliance !== null) { complianceSum += Number(row.overall_compliance); complianceCount += 1 }

    const professionalBucket = byProfessional.get(row.professional_id) || { professionalName: row.professional_name, areaName: row.area_name, sum: 0, count: 0 }
    if (row.overall_compliance !== null) { professionalBucket.sum += Number(row.overall_compliance); professionalBucket.count += 1 }
    byProfessional.set(row.professional_id, professionalBucket)

    const monthBucket = byMonth.get(row.month_reported) || { month: row.month_reported, sum: 0, count: 0, firstDate: row.evaluation_date }
    if (row.overall_compliance !== null) { monthBucket.sum += Number(row.overall_compliance); monthBucket.count += 1 }
    byMonth.set(row.month_reported, monthBucket)

    const criteria = criteriaByVersion.get(row.matrix_version_id) || []
    const scopes = scopesByVersion.get(row.matrix_version_id) || []
    const scores = scoresByEvaluation.get(row.id) || []
    const { scopeResults } = computeCompliance(criteria, scores)
    const scopeNameById = new Map(scopes.map(scope => [String(scope.id), scope.name]))
    for (const scopeResult of scopeResults) {
      if (scopeResult.compliancePercent === null) continue
      const scopeName = scopeNameById.get(String(scopeResult.scopeId)) || 'Sin ámbito'
      const key = `${row.area_name}::${scopeName}`
      const bucket = scopeAggregate.get(key) || { areaName: row.area_name, scopeName, sum: 0, count: 0 }
      bucket.sum += scopeResult.compliancePercent
      bucket.count += 1
      scopeAggregate.set(key, bucket)
    }
  }

  return {
    totalEvaluations: rows.length,
    averageCompliance: complianceCount ? complianceSum / complianceCount : null,
    byConcept,
    byScope: [...scopeAggregate.values()].map(bucket => ({ areaName: bucket.areaName, scopeName: bucket.scopeName, averageCompliance: bucket.sum / bucket.count })),
    byProfessional: [...byProfessional.values()]
      .map(bucket => ({ professionalName: bucket.professionalName, areaName: bucket.areaName, averageCompliance: bucket.count ? bucket.sum / bucket.count : null, evaluationCount: bucket.count }))
      .sort((left, right) => (right.averageCompliance ?? -1) - (left.averageCompliance ?? -1)),
    byMonth: [...byMonth.values()]
      .map(bucket => ({ month: bucket.month, averageCompliance: bucket.count ? bucket.sum / bucket.count : null, evaluationCount: bucket.count, firstDate: bucket.firstDate }))
      .sort((left, right) => new Date(left.firstDate).getTime() - new Date(right.firstDate).getTime()),
  }
}

adherenceRouter.get('/thresholds', view, async (request, response, next) => {
  try {
    const result = await query('SELECT concept, min_percent, order_index FROM adherence_thresholds WHERE organization_id = $1 ORDER BY min_percent DESC', [oid(request)])
    response.json(result.rows)
  } catch (error) { next(error) }
})

adherenceRouter.patch('/thresholds/:concept', manage, async (request, response, next) => {
  try {
    const minPercent = Number(request.body?.minPercent)
    if (!Number.isFinite(minPercent) || minPercent < 0 || minPercent > 100) return response.status(400).json({ error: 'El umbral debe ser un número entre 0 y 100' })
    const result = await query(
      'UPDATE adherence_thresholds SET min_percent = $1 WHERE organization_id = $2 AND concept = $3 RETURNING *',
      [minPercent, oid(request), request.params.concept],
    )
    if (!result.rows[0]) return response.status(404).json({ error: 'Concepto no encontrado' })
    response.json(result.rows[0])
  } catch (error) { next(error) }
})

adherenceRouter.get('/dashboard', view, async (request, response, next) => {
  try { response.json(await loadDashboard(request)) } catch (error) { next(error) }
})

adherenceRouter.get('/dashboard/report.pdf', exportData, async (request, response, next) => {
  try {
    const dashboard = await loadDashboard(request)
    const thresholds = await query('SELECT concept, min_percent FROM adherence_thresholds WHERE organization_id = $1 ORDER BY min_percent DESC', [oid(request)])
    const html = renderAdherenceDashboardHtml({ dashboard, thresholds: thresholds.rows, filters: request.query })
    const pdf = await renderPdf(html)
    response.setHeader('Content-Type', 'application/pdf')
    response.setHeader('Content-Disposition', 'attachment; filename="dashboard-adherencia.pdf"')
    response.send(pdf)
  } catch (error) { next(error) }
})
