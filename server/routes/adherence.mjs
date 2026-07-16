import { randomUUID } from 'node:crypto'
import { mkdir, unlink } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { pool, query } from '../db.mjs'
import { requireAnyModuleAccess, requireAnyPermission } from '../auth.mjs'
import { renderPdf } from '../pdf.mjs'
import { renderAdherenceReportHtml } from '../templates/adherenceReport.mjs'
import { renderAdherenceDashboardHtml } from '../templates/adherenceDashboardReport.mjs'

export const adherenceRouter = Router()

// Nombre de variable propio (antes UPLOAD_DIR, compartido por error con almera.mjs): si se
// configuraba una sola vez, ambos modulos apuntaban a la misma carpeta.
const uploadRoot = resolve(process.env.ADHERENCE_UPLOAD_DIR || 'uploads/adherence')
await mkdir(uploadRoot, { recursive: true })

const allowedEvidenceMimeTypes = new Set([
  'application/pdf', 'image/png', 'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/plain',
])

const uploadEvidence = multer({
  storage: multer.diskStorage({
    destination: uploadRoot,
    filename: (_request, file, callback) => callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase().slice(0, 10)}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 5 },
  fileFilter: (_request, file, callback) => {
    if (allowedEvidenceMimeTypes.has(file.mimetype)) return callback(null, true)
    const error = new Error('Tipo de archivo no permitido')
    error.status = 415
    callback(error)
  },
})

// Plantilla por defecto para una matriz nueva. Cada área puede tener ámbitos distintos:
// esta lista solo se usa para pre-llenar áreas recién creadas; luego son editables.
export const FIXED_SCOPES = ['ANAMNESIS', 'EXAMEN FÍSICO', 'ANÁLISIS', 'DIAGNÓSTICO', 'AYUDAS DIAGNÓSTICAS', 'PLAN DE MANEJO', 'LEGIBILIDAD']

const DEFAULT_CRITERIA = [
  { scopeIndex: 0, text: 'Se evidencia registro del motivo de consulta.', weight: 4 },
  { scopeIndex: 0, text: 'Se evidencia descripción (Tiempo de evolución, frecuencia de aparición, síntomas asociados, factores que mejoran o empeoran el cuadro clínico, tratamientos recibidos para atender la causa de motivo de consulta. En caso de trauma las circunstancias).', weight: 8 },
  { scopeIndex: 0, text: 'Evaluación de factores de riesgo según resolución 3280 de 2018', weight: 3 },
  { scopeIndex: 0, text: 'Se evidencia registro y/o actualización de los antecedentes personales (Médico, Quirúrgicos, Gineco-obstétricos / Pediátrico, Traumáticos, Tóxico / Alérgicos, Farmacológicos), antecedentes familiares, hospitalarios', weight: 6 },
  { scopeIndex: 0, text: 'Se evidencia registro de los hallazgos positivos en la revisión por sistemas, acordes al motivo de consulta, enfermedad actual, antecedentes e indaga sobre asistencia a urgencias.', weight: 4 },
  { scopeIndex: 1, text: 'Se evidencia registro de la totalidad de los signos vitales (frecuencia cardiaca, frecuencia respiratoria, tensión arterial, temperatura, escala de dolor)', weight: 4 },
  { scopeIndex: 1, text: 'Estado general del paciente (Peso, condiciones generales del paciente, explicando estas en lo posible)', weight: 4 },
  { scopeIndex: 1, text: 'Se evidencia registro de examen físico topográfico, acorde con la anamnesis. Registro de examen físico de los datos positivos y los negativos pertinentes al desarrollo de la historia clínica', weight: 8 },
  { scopeIndex: 2, text: 'Se evidencia análisis del contenido del paciente, diagnóstico y conducta a seguir. Teniendo en cuenta (orden, legibilidad, coherencia y racionalidad científica)', weight: 8 },
  { scopeIndex: 2, text: 'Se documenta en la historia clínica la conciliación medicamentosa, según los criterios institucionales de inclusión', weight: 3 },
  { scopeIndex: 3, text: 'El (los) diagnóstico(s) se correlacionan con los hallazgos positivos de la anamnesis y el examen físico.', weight: 8 },
  { scopeIndex: 4, text: 'Se correlacionan las solicitudes ayudas diagnosticas acorde a la anamnesis y hallazgos en el examen físico. En caso de no cumplir especificar en el recuadro inferior.', weight: 10 },
  { scopeIndex: 4, text: 'Se evidencia registro de resultados y análisis de las ayudas diagnósticas previamente solicitadas.', weight: 8 },
  { scopeIndex: 5, text: 'Se correlaciona el plan terapéutico con los hallazgos y este se hizo siguiendo la dosificación, presentación (genéricos), etc.', weight: 10 },
  { scopeIndex: 5, text: 'Se dieron las recomendaciones, educación y signos de alarma acordes a la condición del paciente.', weight: 8 },
  { scopeIndex: 6, text: 'La historia clínica es legible, se realiza uso únicamente de las siglas y abreviaturas permitidos.', weight: 4 },
]

async function seedMatrixVersion(client, matrixVersionId, criteriaTemplate = DEFAULT_CRITERIA) {
  const scopeIds = []
  for (const [index, name] of FIXED_SCOPES.entries()) {
    const result = await client.query(
      'INSERT INTO adherence_scopes (matrix_version_id, name, order_index) VALUES ($1, $2, $3) RETURNING id',
      [matrixVersionId, name, index],
    )
    scopeIds.push(result.rows[0].id)
  }
  for (const [index, criterion] of criteriaTemplate.entries()) {
    await client.query(
      'INSERT INTO adherence_criteria (matrix_version_id, scope_id, text, weight, order_index) VALUES ($1, $2, $3, $4, $5)',
      [matrixVersionId, scopeIds[criterion.scopeIndex], criterion.text, criterion.weight, index],
    )
  }
  return scopeIds
}

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

async function allowedAreaIds(request) {
  if (request.auth.permissions.includes('adherence_matrix.manage')) return null
  const result = await query('SELECT area_id FROM adherence_auditor_areas WHERE membership_id = $1', [mid(request)])
  return result.rows.map(row => String(row.area_id))
}

async function assertAreaAccess(request, areaId) {
  const allowed = await allowedAreaIds(request)
  if (allowed !== null && !allowed.includes(String(areaId))) fail(403, 'No tienes acceso a esta área')
}

async function assertEvaluationAccess(request) {
  const result = await query(
    `SELECT p.area_id FROM adherence_evaluations e JOIN adherence_professionals p ON p.id = e.professional_id
     WHERE e.id = $1 AND e.organization_id = $2`,
    [request.params.id, oid(request)],
  )
  if (!result.rows[0]) fail(404, 'Evaluación no encontrada')
  await assertAreaAccess(request, result.rows[0].area_id)
}

async function ownProfessionalId(request) {
  const result = await query('SELECT id FROM adherence_professionals WHERE membership_id = $1 AND organization_id = $2', [mid(request), oid(request)])
  return result.rows[0]?.id ?? null
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
    const allowed = await allowedAreaIds(request)
    if (allowed !== null && !allowed.length) return response.json([])
    const params = [oid(request)]
    const where = ['a.organization_id = $1']
    if (allowed !== null) { params.push(allowed); where.push(`a.id = ANY($${params.length}::bigint[])`) }
    const result = await query(
      `SELECT a.id, a.name, a.active, a.created_at, a.updated_at,
              mv.id AS matrix_version_id, mv.version_number,
              (SELECT COUNT(*) FROM adherence_scopes s WHERE s.matrix_version_id = mv.id AND s.active)::int AS scope_count,
              (SELECT COUNT(*) FROM adherence_criteria c WHERE c.matrix_version_id = mv.id AND c.active)::int AS criteria_count,
              (SELECT COALESCE(SUM(c.weight), 0) FROM adherence_criteria c WHERE c.matrix_version_id = mv.id AND c.active) AS weight_total
       FROM adherence_areas a
       LEFT JOIN adherence_matrix_versions mv ON mv.area_id = a.id AND mv.is_current
       WHERE ${where.join(' AND ')}
       ORDER BY a.name`,
      params,
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
    const version = await client.query(
      `INSERT INTO adherence_matrix_versions (area_id, version_number, is_current, created_by_id)
       VALUES ($1, 1, TRUE, $2) RETURNING id`,
      [area.rows[0].id, uid(request)],
    )
    await seedMatrixVersion(client, version.rows[0].id)
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
    await assertAreaAccess(request, area.rows[0].id)
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
    const scopesInput = (Array.isArray(body.scopes) ? body.scopes : FIXED_SCOPES.map(name => ({ name })))
      .map(scope => ({ name: String(scope?.name || '').trim() }))
    if (!scopesInput.length) return response.status(400).json({ error: 'La matriz necesita al menos un ámbito' })
    for (const scope of scopesInput) {
      if (!scope.name) return response.status(400).json({ error: 'Todos los ámbitos necesitan un nombre' })
    }
    if (new Set(scopesInput.map(scope => scope.name.toUpperCase())).size !== scopesInput.length) {
      return response.status(400).json({ error: 'No puede haber ámbitos con el mismo nombre' })
    }
    const criteriaInput = Array.isArray(body.criteria) ? body.criteria : []
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
        [targetVersionId, scope.name, index],
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
    const allowed = await allowedAreaIds(request)
    if (allowed !== null && !allowed.length) return response.json([])
    const params = [oid(request)]
    const where = ['p.organization_id = $1']
    if (allowed !== null) { params.push(allowed); where.push(`p.area_id = ANY($${params.length}::bigint[])`) }
    if (request.query.areaId) {
      if (allowed !== null && !allowed.includes(String(request.query.areaId))) return response.status(403).json({ error: 'No tienes acceso a esta área' })
      params.push(request.query.areaId); where.push(`p.area_id = $${params.length}`)
    }
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
      membershipId: 'membership_id',
    }
    if (Object.hasOwn(body, 'membershipId') && body.membershipId) {
      const membership = await query('SELECT id FROM memberships WHERE id = $1 AND organization_id = $2', [body.membershipId, oid(request)])
      if (!membership.rows[0]) return response.status(400).json({ error: 'La cuenta de usuario no pertenece a esta entidad' })
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
    const allowed = await allowedAreaIds(request)
    if (allowed !== null && !allowed.length) return response.json([])
    const params = [oid(request)]
    const where = ['e.organization_id = $1']
    if (allowed !== null) { params.push(allowed); where.push(`p.area_id = ANY($${params.length}::bigint[])`) }
    if (request.query.professionalId) { params.push(request.query.professionalId); where.push(`e.professional_id = $${params.length}`) }
    if (request.query.areaId) {
      if (allowed !== null && !allowed.includes(String(request.query.areaId))) return response.status(403).json({ error: 'No tienes acceso a esta área' })
      params.push(request.query.areaId); where.push(`p.area_id = $${params.length}`)
    }
    if (request.query.monthReported) { params.push(request.query.monthReported); where.push(`e.month_reported = $${params.length}`) }
    const result = await query(
      `SELECT e.id, e.month_reported, e.evaluation_date, e.total_records, e.overall_compliance, e.concept, e.status,
              e.evaluator_membership_id,
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
    const allowed = await allowedAreaIds(request)
    if (allowed !== null && !allowed.includes(String(professional.rows[0].area_id))) return response.status(403).json({ error: 'No tienes acceso al área de este profesional' })
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
    await assertEvaluationAccess(request)
    const detail = await loadEvaluationDetail(oid(request), request.params.id)
    if (!detail) return response.status(404).json({ error: 'Evaluación no encontrada' })
    response.json(detail)
  } catch (error) { next(error) }
})

adherenceRouter.patch('/evaluations/:id', evaluate, async (request, response, next) => {
  try {
    await assertEvaluationAccess(request)
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
    await assertEvaluationAccess(request)
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
    await assertEvaluationAccess(request)
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

const signPermission = requireAnyPermission(['adherence_matrix.close', 'adherence_matrix.manage', 'adherence_matrix.own_plan'])

adherenceRouter.post('/evaluations/:id/sign', signPermission, async (request, response, next) => {
  try {
    const isAuditor = request.auth.permissions.includes('adherence_matrix.close') || request.auth.permissions.includes('adherence_matrix.manage')
    let professionalSignedName
    if (isAuditor) {
      await assertEvaluationAccess(request)
      professionalSignedName = String(request.body?.professionalSignedName || '').trim()
      if (!professionalSignedName) return response.status(400).json({ error: 'El nombre del profesional es obligatorio para registrar la firma' })
    } else {
      const evaluation = await query('SELECT professional_id FROM adherence_evaluations WHERE id = $1 AND organization_id = $2', [request.params.id, oid(request)])
      if (!evaluation.rows[0]) return response.status(404).json({ error: 'Evaluación no encontrada' })
      const professionalId = await ownProfessionalId(request)
      if (!professionalId || String(professionalId) !== String(evaluation.rows[0].professional_id)) {
        return response.status(403).json({ error: 'Solo puedes firmar tu propia evaluación' })
      }
      professionalSignedName = request.auth.user.fullName
    }
    const result = await query(
      `UPDATE adherence_evaluations SET professional_signed_name = $1, professional_signed_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND organization_id = $3 RETURNING *`,
      [professionalSignedName, request.params.id, oid(request)],
    )
    if (!result.rows[0]) return response.status(404).json({ error: 'Evaluación no encontrada' })
    response.json(result.rows[0])
  } catch (error) { next(error) }
})

adherenceRouter.get('/my-evaluations', requireAnyPermission(['adherence_matrix.own_plan']), async (request, response, next) => {
  try {
    const professionalId = await ownProfessionalId(request)
    if (!professionalId) return response.status(404).json({ error: 'Tu cuenta no está vinculada a ningún profesional auditado todavía' })
    const evaluations = await query(
      `SELECT e.id, e.month_reported, e.evaluation_date, e.overall_compliance, e.concept, e.status,
              e.commitments, e.improvement_plan_percent, e.general_observations,
              e.professional_signed_name, e.professional_signed_at, e.evaluator_signed_name, e.evaluator_signed_at,
              a.name AS area_name
       FROM adherence_evaluations e
       JOIN adherence_professionals p ON p.id = e.professional_id
       JOIN adherence_areas a ON a.id = p.area_id
       WHERE e.professional_id = $1 AND e.organization_id = $2
       ORDER BY e.created_at DESC`,
      [professionalId, oid(request)],
    )
    response.json(evaluations.rows)
  } catch (error) { next(error) }
})

const planEvidencePermission = requireAnyPermission(['adherence_matrix.own_plan', 'adherence_matrix.evaluate', 'adherence_matrix.manage'])

async function assertEvaluationAccessForEvidence(request) {
  const isAuditor = request.auth.permissions.includes('adherence_matrix.evaluate') || request.auth.permissions.includes('adherence_matrix.manage')
  if (isAuditor) return assertEvaluationAccess(request)
  const evaluation = await query('SELECT professional_id FROM adherence_evaluations WHERE id = $1 AND organization_id = $2', [request.params.id, oid(request)])
  if (!evaluation.rows[0]) fail(404, 'Evaluación no encontrada')
  const professionalId = await ownProfessionalId(request)
  if (!professionalId || String(professionalId) !== String(evaluation.rows[0].professional_id)) fail(403, 'No tienes acceso a esta evaluación')
}

adherenceRouter.get('/evaluations/:id/plan-evidence', planEvidencePermission, async (request, response, next) => {
  try {
    await assertEvaluationAccessForEvidence(request)
    const result = await query(
      'SELECT id, original_name, mime_type, size_bytes, description, created_at FROM adherence_plan_evidence WHERE evaluation_id = $1 AND organization_id = $2 ORDER BY created_at',
      [request.params.id, oid(request)],
    )
    response.json(result.rows)
  } catch (error) { next(error) }
})

adherenceRouter.post('/evaluations/:id/plan-evidence', planEvidencePermission, uploadEvidence.array('files', 5), async (request, response, next) => {
  const files = request.files || []
  const client = await pool.connect()
  try {
    if (!files.length) return response.status(400).json({ error: 'Selecciona al menos un archivo' })
    await assertEvaluationAccessForEvidence(request)
    await client.query('BEGIN')
    const evaluation = await client.query('SELECT id FROM adherence_evaluations WHERE id = $1 AND organization_id = $2', [request.params.id, oid(request)])
    if (!evaluation.rows[0]) fail(404, 'Evaluación no encontrada')
    const saved = []
    for (const file of files) {
      const evidence = await client.query(
        `INSERT INTO adherence_plan_evidence (organization_id, evaluation_id, original_name, mime_type, size_bytes, storage_key, description, uploaded_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, original_name, mime_type, size_bytes, description, created_at`,
        [oid(request), request.params.id, file.originalname, file.mimetype, file.size, file.filename, request.body?.description || '', uid(request)],
      )
      saved.push(evidence.rows[0])
    }
    await client.query('COMMIT')
    response.status(201).json(saved)
  } catch (error) {
    await client.query('ROLLBACK')
    await Promise.allSettled(files.map(file => unlink(file.path)))
    next(error)
  } finally { client.release() }
})

adherenceRouter.get('/evaluations/:id/plan-evidence/:evidenceId/download', planEvidencePermission, async (request, response, next) => {
  try {
    await assertEvaluationAccessForEvidence(request)
    const result = await query(
      'SELECT original_name, storage_key FROM adherence_plan_evidence WHERE id = $1 AND evaluation_id = $2 AND organization_id = $3',
      [request.params.evidenceId, request.params.id, oid(request)],
    )
    if (!result.rows[0]) return response.status(404).json({ error: 'Evidencia no encontrada' })
    response.download(resolve(uploadRoot, result.rows[0].storage_key), result.rows[0].original_name)
  } catch (error) { next(error) }
})

// --- Plan de mejora con seguimientos (linea de tiempo) ---

async function loadPlanWithAccess(request) {
  const plan = await query(
    `SELECT pl.*, p.membership_id AS professional_membership_id, p.area_id, p.full_name AS professional_name,
            a.name AS area_name, e.month_reported
     FROM adherence_improvement_plans pl
     JOIN adherence_professionals p ON p.id = pl.professional_id
     JOIN adherence_areas a ON a.id = p.area_id
     JOIN adherence_evaluations e ON e.id = pl.evaluation_id
     WHERE pl.id = $1 AND pl.organization_id = $2`,
    [request.params.id, oid(request)],
  )
  if (!plan.rows[0]) fail(404, 'Plan de mejora no encontrado')
  const row = plan.rows[0]
  const isAuditorTier = request.auth.permissions.includes('adherence_matrix.evaluate') || request.auth.permissions.includes('adherence_matrix.manage')
  if (isAuditorTier) {
    await assertAreaAccess(request, row.area_id)
  } else {
    const professionalId = await ownProfessionalId(request)
    if (!professionalId || String(professionalId) !== String(row.professional_id)) fail(403, 'No tienes acceso a este plan de mejora')
  }
  return row
}

adherenceRouter.get('/evaluations/:id/plan', evaluate, async (request, response, next) => {
  try {
    await assertEvaluationAccess(request)
    const plan = await query('SELECT * FROM adherence_improvement_plans WHERE evaluation_id = $1 AND organization_id = $2', [request.params.id, oid(request)])
    response.json(plan.rows[0] || null)
  } catch (error) { next(error) }
})

adherenceRouter.put('/evaluations/:id/plan', evaluate, async (request, response, next) => {
  try {
    await assertEvaluationAccess(request)
    const description = String(request.body?.description || '').trim()
    const plannedStartDate = request.body?.plannedStartDate || null
    const plannedEndDate = request.body?.plannedEndDate || null
    if (!description) return response.status(400).json({ error: 'La descripción del plan de mejora es obligatoria' })
    const evaluation = await query('SELECT professional_id FROM adherence_evaluations WHERE id = $1 AND organization_id = $2', [request.params.id, oid(request)])
    if (!evaluation.rows[0]) return response.status(404).json({ error: 'Evaluación no encontrada' })
    const existing = await query('SELECT id FROM adherence_improvement_plans WHERE evaluation_id = $1 AND organization_id = $2', [request.params.id, oid(request)])
    let result
    if (existing.rows[0]) {
      result = await query(
        `UPDATE adherence_improvement_plans SET description=$1, planned_start_date=$2, planned_end_date=$3, updated_at=NOW()
         WHERE id=$4 RETURNING *`,
        [description, plannedStartDate, plannedEndDate, existing.rows[0].id],
      )
    } else {
      result = await query(
        `INSERT INTO adherence_improvement_plans (organization_id, evaluation_id, professional_id, description, planned_start_date, planned_end_date, created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [oid(request), request.params.id, evaluation.rows[0].professional_id, description, plannedStartDate, plannedEndDate, uid(request)],
      )
    }
    response.status(201).json(result.rows[0])
  } catch (error) { next(error) }
})

adherenceRouter.get('/my-plans', requireAnyPermission(['adherence_matrix.own_plan']), async (request, response, next) => {
  try {
    const professionalId = await ownProfessionalId(request)
    if (!professionalId) return response.status(404).json({ error: 'Tu cuenta no está vinculada a ningún profesional auditado todavía' })
    const plans = await query(
      `SELECT pl.*, a.name AS area_name, e.month_reported
       FROM adherence_improvement_plans pl
       JOIN adherence_areas a ON a.id = (SELECT area_id FROM adherence_professionals WHERE id = pl.professional_id)
       JOIN adherence_evaluations e ON e.id = pl.evaluation_id
       WHERE pl.professional_id = $1 AND pl.organization_id = $2
       ORDER BY pl.created_at DESC`,
      [professionalId, oid(request)],
    )
    response.json(plans.rows)
  } catch (error) { next(error) }
})

adherenceRouter.get('/plans/:id', requireAnyPermission(['adherence_matrix.own_plan', 'adherence_matrix.evaluate', 'adherence_matrix.manage']), async (request, response, next) => {
  try {
    const plan = await loadPlanWithAccess(request)
    response.json(plan)
  } catch (error) { next(error) }
})

adherenceRouter.post('/plans/:id/start', requireAnyPermission(['adherence_matrix.own_plan']), async (request, response, next) => {
  try {
    const plan = await loadPlanWithAccess(request)
    if (plan.status !== 'NO_INICIADO') return response.status(409).json({ error: 'El plan ya fue iniciado' })
    const result = await query(
      `UPDATE adherence_improvement_plans SET status='EN_EJECUCION', actual_start_date=CURRENT_DATE, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [plan.id],
    )
    response.json(result.rows[0])
  } catch (error) { next(error) }
})

adherenceRouter.post('/plans/:id/complete', requireAnyPermission(['adherence_matrix.own_plan']), async (request, response, next) => {
  try {
    const plan = await loadPlanWithAccess(request)
    if (Number(plan.progress_percent) < 100) return response.status(400).json({ error: 'El plan debe llegar a 100% de avance antes de marcarlo como terminado' })
    if (plan.status === 'TERMINADO') return response.status(409).json({ error: 'El plan ya está terminado' })
    const result = await query(
      `UPDATE adherence_improvement_plans SET status='TERMINADO', actual_end_date=CURRENT_DATE, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [plan.id],
    )
    response.json(result.rows[0])
  } catch (error) { next(error) }
})

adherenceRouter.get('/plans/:id/followups', requireAnyPermission(['adherence_matrix.own_plan', 'adherence_matrix.evaluate', 'adherence_matrix.manage']), async (request, response, next) => {
  try {
    await loadPlanWithAccess(request)
    const followups = await query(
      `SELECT f.id, f.description, f.progress_percent, f.created_at, u.full_name AS author_name,
              COALESCE(
                (SELECT json_agg(json_build_object('id', ev.id, 'original_name', ev.original_name, 'mime_type', ev.mime_type, 'size_bytes', ev.size_bytes) ORDER BY ev.created_at)
                 FROM adherence_plan_followup_evidence ev WHERE ev.followup_id = f.id),
                '[]'
              ) AS evidence
       FROM adherence_plan_followups f
       JOIN users u ON u.id = f.author_id
       WHERE f.plan_id = $1 AND f.organization_id = $2
       ORDER BY f.created_at DESC`,
      [request.params.id, oid(request)],
    )
    response.json(followups.rows)
  } catch (error) { next(error) }
})

adherenceRouter.post('/plans/:id/followups', requireAnyPermission(['adherence_matrix.own_plan']), uploadEvidence.array('files', 5), async (request, response, next) => {
  const files = request.files || []
  const client = await pool.connect()
  try {
    const plan = await loadPlanWithAccess(request)
    const description = String(request.body?.description || '').trim()
    const progressPercent = Number(request.body?.progressPercent)
    if (!description) fail(400, 'Describe qué se hizo en este seguimiento')
    if (!Number.isFinite(progressPercent) || progressPercent < 0 || progressPercent > 100) fail(400, 'El % de avance debe estar entre 0 y 100')
    if (plan.status === 'TERMINADO') fail(409, 'El plan ya está terminado, no se pueden agregar más seguimientos')

    await client.query('BEGIN')
    const followup = await client.query(
      `INSERT INTO adherence_plan_followups (organization_id, plan_id, author_id, description, progress_percent)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, description, progress_percent, created_at`,
      [oid(request), plan.id, uid(request), description, progressPercent],
    )
    for (const file of files) {
      await client.query(
        `INSERT INTO adherence_plan_followup_evidence (organization_id, followup_id, original_name, mime_type, size_bytes, storage_key, uploaded_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [oid(request), followup.rows[0].id, file.originalname, file.mimetype, file.size, file.filename, uid(request)],
      )
    }
    const nextStatus = plan.status === 'NO_INICIADO' ? 'EN_EJECUCION' : plan.status
    await client.query(
      `UPDATE adherence_improvement_plans SET progress_percent=$1, status=$2,
              actual_start_date = COALESCE(actual_start_date, CURRENT_DATE), updated_at=NOW()
       WHERE id=$3`,
      [progressPercent, nextStatus, plan.id],
    )
    await client.query('COMMIT')
    response.status(201).json(followup.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    await Promise.allSettled(files.map(file => unlink(file.path)))
    next(error)
  } finally { client.release() }
})

adherenceRouter.get('/plans/:id/followups/:followupId/evidence/:evidenceId/download', requireAnyPermission(['adherence_matrix.own_plan', 'adherence_matrix.evaluate', 'adherence_matrix.manage']), async (request, response, next) => {
  try {
    await loadPlanWithAccess(request)
    const result = await query(
      `SELECT ev.original_name, ev.storage_key FROM adherence_plan_followup_evidence ev
       JOIN adherence_plan_followups f ON f.id = ev.followup_id
       WHERE ev.id = $1 AND f.id = $2 AND f.plan_id = $3 AND ev.organization_id = $4`,
      [request.params.evidenceId, request.params.followupId, request.params.id, oid(request)],
    )
    if (!result.rows[0]) return response.status(404).json({ error: 'Evidencia no encontrada' })
    response.download(resolve(uploadRoot, result.rows[0].storage_key), result.rows[0].original_name)
  } catch (error) { next(error) }
})

adherenceRouter.get('/evaluations/:id/report.pdf', exportData, async (request, response, next) => {
  try {
    await assertEvaluationAccess(request)
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
    await assertEvaluationAccess(request)
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
    await assertEvaluationAccess(request)
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
    await assertEvaluationAccess(request)
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
    await assertEvaluationAccess(request)
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
  const allowed = await allowedAreaIds(request)
  if (allowed !== null && !allowed.length) {
    return { totalEvaluations: 0, averageCompliance: null, byConcept: { OPTIMO: 0, ACEPTABLE: 0, DEFICIENTE: 0, MUY_DEFICIENTE: 0 }, byScope: [], byProfessional: [], byMonth: [] }
  }
  const params = [oid(request)]
  const where = ['e.organization_id = $1', 'e.total_records > 0']
  if (allowed !== null) { params.push(allowed); where.push(`p.area_id = ANY($${params.length}::bigint[])`) }
  if (request.query.monthReported) { params.push(request.query.monthReported); where.push(`e.month_reported = $${params.length}`) }
  if (request.query.professionalId) { params.push(request.query.professionalId); where.push(`e.professional_id = $${params.length}`) }
  if (request.query.positionId) { params.push(request.query.positionId); where.push(`p.position_id = $${params.length}`) }
  if (request.query.areaId) {
    if (allowed !== null && !allowed.includes(String(request.query.areaId))) fail(403, 'No tienes acceso a esta área')
    params.push(request.query.areaId); where.push(`p.area_id = $${params.length}`)
  }

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

adherenceRouter.get('/auditors', manage, async (request, response, next) => {
  try {
    const result = await query(
      `SELECT m.id AS membership_id, u.full_name, u.email, r.name AS role_name,
              COALESCE(json_agg(DISTINCT aaa.area_id) FILTER (WHERE aaa.area_id IS NOT NULL), '[]') AS area_ids
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       JOIN roles r ON r.id = m.role_id
       JOIN role_modules rm ON rm.role_id = r.id
       JOIN modules mo ON mo.id = rm.module_id AND mo.key = 'adherence-matrix'
       LEFT JOIN adherence_auditor_areas aaa ON aaa.membership_id = m.id
       WHERE m.organization_id = $1 AND m.active = TRUE
       GROUP BY m.id, u.full_name, u.email, r.name
       ORDER BY u.full_name`,
      [oid(request)],
    )
    response.json(result.rows)
  } catch (error) { next(error) }
})

adherenceRouter.put('/auditors/:membershipId/areas', manage, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const areaIds = Array.isArray(request.body?.areaIds) ? request.body.areaIds : []
    const membership = await client.query('SELECT id FROM memberships WHERE id = $1 AND organization_id = $2', [request.params.membershipId, oid(request)])
    if (!membership.rows[0]) return response.status(404).json({ error: 'Usuario no encontrado' })
    if (areaIds.length) {
      const validAreas = await client.query('SELECT id FROM adherence_areas WHERE organization_id = $1 AND id = ANY($2::bigint[])', [oid(request), areaIds])
      if (validAreas.rows.length !== new Set(areaIds.map(String)).size) return response.status(400).json({ error: 'Una o más áreas no son válidas' })
    }
    await client.query('BEGIN')
    await client.query('DELETE FROM adherence_auditor_areas WHERE membership_id = $1', [request.params.membershipId])
    for (const areaId of areaIds) {
      await client.query('INSERT INTO adherence_auditor_areas (membership_id, area_id) VALUES ($1, $2)', [request.params.membershipId, areaId])
    }
    await client.query('COMMIT')
    response.json({ ok: true, areaIds })
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})
