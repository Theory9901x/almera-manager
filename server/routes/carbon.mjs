import { randomUUID } from 'node:crypto'
import { mkdir, unlink } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { pool, query } from '../db.mjs'
import { requireAnyModuleAccess, requirePermission } from '../auth.mjs'
import { computeEmissions, lookupFactor, resolveScope } from '../carbonEngine.mjs'

export const carbonRouter = Router()

const oid = request => request.auth.organization.id
const uid = request => request.auth.user.id

const carbonModule = requireAnyModuleAccess(['carbon-footprint'])
const view = requirePermission('carbon.view')
const capture = requirePermission('carbon.capture')
const manage = requirePermission('carbon.manage')
const exportPerm = requirePermission('carbon.export')

function fail(status, message) {
  const error = new Error(message)
  error.status = status
  throw error
}

const uploadRoot = resolve(process.env.CARBON_UPLOAD_DIR || 'uploads/carbon')
await mkdir(uploadRoot, { recursive: true })
const allowedEvidenceMimeTypes = new Set(['application/pdf', 'image/png', 'image/jpeg'])
const uploadEvidence = multer({
  storage: multer.diskStorage({
    destination: uploadRoot,
    filename: (_request, file, callback) => callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase().slice(0, 10)}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 5 },
  fileFilter: (_request, file, callback) => {
    if (allowedEvidenceMimeTypes.has(file.mimetype)) return callback(null, true)
    const error = new Error('Solo se permiten PDF, PNG o JPEG de hasta 15MB')
    error.status = 415
    callback(error)
  },
})

async function loadBlock(blockKey) {
  const result = await query('SELECT * FROM carbon_blocks WHERE key = $1', [blockKey])
  if (!result.rows[0]) fail(404, 'Variable no encontrada')
  return result.rows[0]
}

async function assertBlockEnabled(organizationId, blockKey) {
  const block = await loadBlock(blockKey)
  const result = await query(
    'SELECT enabled, responsible_membership_id FROM carbon_organization_blocks WHERE organization_id = $1 AND block_id = $2',
    [organizationId, block.id],
  )
  if (!result.rows[0]?.enabled) fail(403, `La variable "${block.name}" no está habilitada para esta entidad`)
  return { block, orgBlock: result.rows[0] }
}

// ---- Bloques (variables nucleo + activables) ----

carbonRouter.get('/blocks', carbonModule, view, async (request, response, next) => {
  try {
    const result = await query(
      `SELECT b.id, b.key, b.name, b.scope, b.is_core, b.description, b.position,
              COALESCE(ob.enabled, FALSE) AS enabled, ob.responsible_membership_id, u.full_name AS responsible_name
       FROM carbon_blocks b
       LEFT JOIN carbon_organization_blocks ob ON ob.block_id = b.id AND ob.organization_id = $1
       LEFT JOIN memberships m ON m.id = ob.responsible_membership_id
       LEFT JOIN users u ON u.id = m.user_id
       ORDER BY b.position`,
      [oid(request)],
    )
    response.json(result.rows)
  } catch (error) { next(error) }
})

carbonRouter.patch('/blocks/:blockId', carbonModule, manage, async (request, response, next) => {
  try {
    const body = request.body || {}
    const blockId = Number(request.params.blockId)
    await query(
      `INSERT INTO carbon_organization_blocks (organization_id, block_id, enabled, responsible_membership_id)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (organization_id, block_id) DO UPDATE SET enabled = $3, responsible_membership_id = $4`,
      [oid(request), blockId, Boolean(body.enabled), body.responsibleMembershipId || null],
    )
    response.json({ ok: true })
  } catch (error) { next(error) }
})

// ---- Factores de emision (referencia global, editable solo por quien tenga carbon.manage) ----

carbonRouter.get('/factors', carbonModule, view, async (request, response, next) => {
  try {
    const params = []
    let where = ''
    if (request.query.blockKey) { params.push(request.query.blockKey); where = 'WHERE block_key = $1' }
    const result = await query(`SELECT * FROM carbon_emission_factors ${where} ORDER BY block_key, subtype, valid_from DESC`, params)
    response.json(result.rows)
  } catch (error) { next(error) }
})

// Un factor nuevo para el mismo bloque+subtipo CIERRA la vigencia del anterior (valid_to = un dia
// antes de la nueva vigencia) en vez de sobrescribirlo — asi una medicion antigua sigue calculando
// con el factor que estaba vigente cuando se registro, y el historial de factores queda trazable.
carbonRouter.post('/factors', carbonModule, manage, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const body = request.body || {}
    if (!body.blockKey || !body.subtype || body.value == null || !body.unit || !body.validFrom || !body.methodologySource) {
      fail(400, 'Faltan campos obligatorios (variable, subtipo, valor, unidad, vigencia desde, fuente metodológica)')
    }
    await client.query('BEGIN')
    await client.query(
      `UPDATE carbon_emission_factors SET valid_to = $1::date - INTERVAL '1 day'
       WHERE block_key = $2 AND subtype = $3 AND valid_to IS NULL AND valid_from < $1::date`,
      [body.validFrom, body.blockKey, body.subtype],
    )
    const inserted = await client.query(
      `INSERT INTO carbon_emission_factors (block_key, subtype, subtype_label, value, unit, valid_from, methodology_source)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [body.blockKey, body.subtype, body.subtypeLabel || body.subtype, Number(body.value), body.unit, body.validFrom, body.methodologySource],
    )
    await client.query('COMMIT')
    response.status(201).json(inserted.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})

// ---- Mediciones (registro historico por periodo, nunca se sobrescribe) ----

carbonRouter.get('/measurements', carbonModule, view, async (request, response, next) => {
  try {
    const params = [oid(request)]
    const where = ['m.organization_id = $1']
    if (request.query.blockKey) { params.push(request.query.blockKey); where.push(`m.block_key = $${params.length}`) }
    if (request.query.dateFrom) { params.push(request.query.dateFrom); where.push(`m.record_date >= $${params.length}`) }
    if (request.query.dateTo) { params.push(request.query.dateTo); where.push(`m.record_date <= $${params.length}`) }
    const limit = Math.min(200, Number(request.query.limit) || 100)
    const offset = Math.max(0, Number(request.query.offset) || 0)
    const [rowsResult, countResult] = await Promise.all([
      query(
        `SELECT m.*, b.name AS block_name, b.scope AS block_scope, u.full_name AS recorded_by_name,
                (SELECT COUNT(*)::int FROM carbon_measurement_evidence e WHERE e.measurement_id = m.id) AS evidence_count
         FROM carbon_measurements m JOIN carbon_blocks b ON b.key = m.block_key JOIN users u ON u.id = m.recorded_by_id
         WHERE ${where.join(' AND ')} ORDER BY m.record_date DESC, m.id DESC LIMIT ${limit} OFFSET ${offset}`,
        params,
      ),
      query(`SELECT COUNT(*)::int AS total FROM carbon_measurements m WHERE ${where.join(' AND ')}`, params),
    ])
    response.json({ rows: rowsResult.rows, total: countResult.rows[0].total, limit, offset })
  } catch (error) { next(error) }
})

carbonRouter.post('/measurements', carbonModule, capture, async (request, response, next) => {
  try {
    const body = request.body || {}
    if (!body.blockKey || !body.period || !body.recordDate || body.quantity == null || !body.quantityUnit) {
      fail(400, 'Faltan campos obligatorios (variable, período, fecha, cantidad, unidad)')
    }
    const { block } = await assertBlockEnabled(oid(request), body.blockKey)

    let computedKgco2e = null
    let factorId = null
    if (body.subtype) {
      const factor = await lookupFactor(query, body.blockKey, body.subtype, body.recordDate)
      if (!factor) fail(422, `No hay un factor de emisión vigente para "${body.subtype}" en la fecha indicada — carga uno desde Configuración`)
      computedKgco2e = computeEmissions(factor, body.quantity)
      factorId = factor.id
    }

    const inSitu = Boolean(body.inSitu)
    const scope = resolveScope(block, { in_situ: inSitu })

    const inserted = await query(
      `INSERT INTO carbon_measurements (organization_id, block_key, period, record_date, subtype, quantity, quantity_unit, scope_override, in_situ, computed_kgco2e, factor_id, notes, recorded_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [oid(request), body.blockKey, body.period, body.recordDate, body.subtype || null, Number(body.quantity), body.quantityUnit, scope, inSitu, computedKgco2e, factorId, body.notes || '', uid(request)],
    )
    response.status(201).json(inserted.rows[0])
  } catch (error) { next(error) }
})

carbonRouter.get('/measurements/:id', carbonModule, view, async (request, response, next) => {
  try {
    const result = await query(
      `SELECT m.*, b.name AS block_name, u.full_name AS recorded_by_name
       FROM carbon_measurements m JOIN carbon_blocks b ON b.key = m.block_key JOIN users u ON u.id = m.recorded_by_id
       WHERE m.id = $1 AND m.organization_id = $2`,
      [Number(request.params.id), oid(request)],
    )
    if (!result.rows[0]) fail(404, 'Medición no encontrada')
    const evidence = await query(
      'SELECT id, original_name, mime_type, size_bytes, created_at FROM carbon_measurement_evidence WHERE measurement_id = $1 ORDER BY created_at',
      [result.rows[0].id],
    )
    response.json({ ...result.rows[0], evidence: evidence.rows })
  } catch (error) { next(error) }
})

// Borrado exclusivo de superadmin: son registros auditables (pueden alimentar el PIGCCS oficial),
// igual criterio ya aplicado a respuestas de encuestas.
function requireSuperadmin(request, response, next) {
  if (request.auth?.role?.key !== 'SUPERADMIN') return response.status(403).json({ error: 'Solo un superadministrador puede eliminar mediciones' })
  next()
}

carbonRouter.delete('/measurements/:id', carbonModule, view, requireSuperadmin, async (request, response, next) => {
  try {
    const result = await query('DELETE FROM carbon_measurements WHERE id = $1 AND organization_id = $2 RETURNING id', [Number(request.params.id), oid(request)])
    if (!result.rows[0]) fail(404, 'Medición no encontrada')
    await query(
      `INSERT INTO activity_logs (organization_id, entity_type, entity_id, action, changes, actor_user_id)
       VALUES ($1, 'CARBON_MEASUREMENT', $2, 'DELETED', '{}'::jsonb, $3)`,
      [oid(request), result.rows[0].id, uid(request)],
    )
    response.json({ ok: true })
  } catch (error) { next(error) }
})

carbonRouter.post('/measurements/:id/evidence', carbonModule, capture, uploadEvidence.array('files', 5), async (request, response, next) => {
  const files = request.files || []
  const client = await pool.connect()
  try {
    if (!files.length) return response.status(400).json({ error: 'Selecciona al menos un archivo' })
    await client.query('BEGIN')
    const measurement = await client.query('SELECT id FROM carbon_measurements WHERE id = $1 AND organization_id = $2', [Number(request.params.id), oid(request)])
    if (!measurement.rows[0]) fail(404, 'Medición no encontrada')
    const saved = []
    for (const file of files) {
      const evidence = await client.query(
        `INSERT INTO carbon_measurement_evidence (organization_id, measurement_id, original_name, mime_type, size_bytes, storage_key, uploaded_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, original_name, mime_type, size_bytes, created_at`,
        [oid(request), request.params.id, file.originalname, file.mimetype, file.size, file.filename, uid(request)],
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

carbonRouter.get('/measurements/:id/evidence/:evidenceId/download', carbonModule, view, async (request, response, next) => {
  try {
    const result = await query(
      'SELECT original_name, storage_key FROM carbon_measurement_evidence WHERE id = $1 AND measurement_id = $2 AND organization_id = $3',
      [request.params.evidenceId, request.params.id, oid(request)],
    )
    if (!result.rows[0]) return response.status(404).json({ error: 'Evidencia no encontrada' })
    response.download(resolve(uploadRoot, result.rows[0].storage_key), result.rows[0].original_name)
  } catch (error) { next(error) }
})

// ---- Metas de reduccion ----

carbonRouter.get('/targets', carbonModule, view, async (request, response, next) => {
  try {
    const result = await query('SELECT * FROM carbon_reduction_targets WHERE organization_id = $1 ORDER BY target_year', [oid(request)])
    response.json(result.rows)
  } catch (error) { next(error) }
})

carbonRouter.post('/targets', carbonModule, manage, async (request, response, next) => {
  try {
    const body = request.body || {}
    if (!body.baseYear || body.baseValueKgco2e == null || !body.targetYear || body.targetReductionPercent == null) fail(400, 'Faltan campos obligatorios')
    const inserted = await query(
      `INSERT INTO carbon_reduction_targets (organization_id, base_year, base_value_kgco2e, target_year, target_reduction_percent)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (organization_id, target_year) DO UPDATE SET base_year = $2, base_value_kgco2e = $3, target_reduction_percent = $5
       RETURNING *`,
      [oid(request), Number(body.baseYear), Number(body.baseValueKgco2e), Number(body.targetYear), Number(body.targetReductionPercent)],
    )
    response.status(201).json(inserted.rows[0])
  } catch (error) { next(error) }
})

// ---- Dashboard ----

carbonRouter.get('/stats', carbonModule, view, async (request, response, next) => {
  try {
    const params = [oid(request)]
    const where = ['m.organization_id = $1']
    if (request.query.dateFrom) { params.push(request.query.dateFrom); where.push(`m.record_date >= $${params.length}`) }
    if (request.query.dateTo) { params.push(request.query.dateTo); where.push(`m.record_date <= $${params.length}`) }

    const [measurementsResult, blocksResult, lastUpdatedResult] = await Promise.all([
      query(`SELECT m.*, b.name AS block_name, b.scope AS block_scope FROM carbon_measurements m JOIN carbon_blocks b ON b.key = m.block_key WHERE ${where.join(' AND ')}`, params),
      query('SELECT key, name, scope FROM carbon_blocks'),
      query('SELECT MAX(created_at) AS last_updated FROM carbon_measurements WHERE organization_id = $1', [oid(request)]),
    ])

    const blockByKey = new Map(blocksResult.rows.map(block => [block.key, block]))
    const byScope = { SCOPE_1: 0, SCOPE_2: 0, SCOPE_3: 0 }
    const byBlockMap = new Map()
    const byPeriodMap = new Map()
    let total = 0

    for (const row of measurementsResult.rows) {
      const kgco2e = Number(row.computed_kgco2e) || 0
      const block = blockByKey.get(row.block_key)
      const scope = row.scope_override || row.block_scope
      if (scope && byScope[scope] != null) byScope[scope] += kgco2e
      total += kgco2e

      const blockBucket = byBlockMap.get(row.block_key) || { blockKey: row.block_key, name: row.block_name, kgco2e: 0 }
      blockBucket.kgco2e += kgco2e
      byBlockMap.set(row.block_key, blockBucket)

      const periodBucket = byPeriodMap.get(row.period) || { period: row.period, kgco2e: 0 }
      periodBucket.kgco2e += kgco2e
      byPeriodMap.set(row.period, periodBucket)
    }

    const timeline = [...byPeriodMap.values()].sort((a, b) => a.period.localeCompare(b.period))
    const previousPeriod = timeline.length > 1 ? timeline[timeline.length - 2] : null
    const currentPeriod = timeline.length ? timeline[timeline.length - 1] : null
    const trendPercent = previousPeriod && previousPeriod.kgco2e
      ? Math.round(((currentPeriod.kgco2e - previousPeriod.kgco2e) / previousPeriod.kgco2e) * 1000) / 10
      : null

    const targetsResult = await query('SELECT * FROM carbon_reduction_targets WHERE organization_id = $1 ORDER BY target_year DESC LIMIT 1', [oid(request)])
    const target = targetsResult.rows[0] || null
    let targetProgress = null
    if (target) {
      const expectedValue = Number(target.base_value_kgco2e) * (1 - Number(target.target_reduction_percent) / 100)
      targetProgress = {
        baseYear: target.base_year, baseValue: Number(target.base_value_kgco2e),
        targetYear: target.target_year, targetReductionPercent: Number(target.target_reduction_percent),
        expectedValue, currentValue: total,
        onTrack: total <= Number(target.base_value_kgco2e),
      }
    }

    response.json({
      total: Math.round(total * 100) / 100,
      byScope: { SCOPE_1: Math.round(byScope.SCOPE_1 * 100) / 100, SCOPE_2: Math.round(byScope.SCOPE_2 * 100) / 100, SCOPE_3: Math.round(byScope.SCOPE_3 * 100) / 100 },
      byBlock: [...byBlockMap.values()].map(item => ({ ...item, kgco2e: Math.round(item.kgco2e * 100) / 100 })).sort((a, b) => b.kgco2e - a.kgco2e),
      timeline: timeline.map(item => ({ ...item, kgco2e: Math.round(item.kgco2e * 100) / 100 })),
      trendPercent,
      lastUpdated: lastUpdatedResult.rows[0]?.last_updated || null,
      // Indicadores normalizados: el sistema no tiene todavia datos de pacientes atendidos ni camas
      // disponibles en ningun modulo — se deja el indicador listo, mostrando explicitamente que no
      // hay dato disponible en vez de forzar un calculo incorrecto (division por un valor inventado).
      normalized: { perPatient: null, perBed: null, note: 'Este indicador requiere datos de pacientes atendidos/camas que aún no están disponibles en el sistema.' },
      target: targetProgress,
    })
  } catch (error) { next(error) }
})
