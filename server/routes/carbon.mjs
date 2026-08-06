import { randomUUID } from 'node:crypto'
import { mkdir, unlink } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { pool, query } from '../db.mjs'
import { requireAnyModuleAccess, requirePermission } from '../auth.mjs'
import { computeEmissions, lookupFactor, resolveScope } from '../carbonEngine.mjs'
import { calcElectricity, calcMobile, calcStationary, derivePeriod, loadBiofuelBlend, loadElectricityFactor, loadFuel, loadFuels } from '../carbonEngine2.mjs'
import { PERIODICITIES, periodKey } from '../../shared/carbonScoring.mjs'
import { renderPdf } from '../pdf.mjs'
import { renderCarbonReportHtml } from '../templates/carbonReport.mjs'
import { renderCarbonReportHtmlV2 } from '../templates/carbonReportV2.mjs'

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

// ---- Benchmarks cientificos de referencia (NHS/HHS/Global Roadmap) ----

carbonRouter.get('/benchmarks', carbonModule, view, async (request, response, next) => {
  try {
    const result = await query('SELECT * FROM carbon_benchmarks ORDER BY source, id')
    response.json(result.rows)
  } catch (error) { next(error) }
})

// ---- Analisis trimestral automatico ----

function quarterOf(date) { return Math.floor(date.getUTCMonth() / 3) + 1 }
function quarterRange(year, quarter) {
  const startMonth = (quarter - 1) * 3
  const start = new Date(Date.UTC(year, startMonth, 1))
  const end = new Date(Date.UTC(year, startMonth + 3, 0))
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

carbonRouter.get('/quarterly-analysis', carbonModule, view, async (request, response, next) => {
  try {
    const result = await query('SELECT * FROM carbon_quarterly_analyses WHERE organization_id = $1 ORDER BY year DESC, quarter DESC', [oid(request)])
    response.json(result.rows)
  } catch (error) { next(error) }
})

// Genera el analisis de un trimestre y lo deja guardado como registro historico — si ya existe uno
// para ese trimestre, NO se regenera/sobrescribe (se pierde la trazabilidad de que recomendaciones
// se dieron entonces); hay que eliminarlo explicitamente primero si de verdad hace falta rehacerlo.
carbonRouter.post('/quarterly-analysis/generate', carbonModule, manage, async (request, response, next) => {
  try {
    const body = request.body || {}
    const now = new Date()
    const year = Number(body.year) || now.getUTCFullYear()
    const quarter = Number(body.quarter) || quarterOf(now)
    const { start, end } = quarterRange(year, quarter)

    const existing = await query('SELECT id FROM carbon_quarterly_analyses WHERE organization_id = $1 AND year = $2 AND quarter = $3', [oid(request), year, quarter])
    if (existing.rows[0]) fail(409, `Ya existe un análisis para ${year} T${quarter}. Consulta el historial o elimínalo antes de regenerarlo.`)

    const prevQuarter = quarter === 1 ? 4 : quarter - 1
    const prevYear = quarter === 1 ? year - 1 : year
    const previousRange = quarterRange(prevYear, prevQuarter)

    const [currentResult, previousResult, benchmarksResult] = await Promise.all([
      query('SELECT block_key, b.name, COALESCE(SUM(m.computed_kgco2e), 0) AS total FROM carbon_measurements m JOIN carbon_blocks b ON b.key = m.block_key WHERE m.organization_id = $1 AND m.record_date BETWEEN $2 AND $3 GROUP BY block_key, b.name', [oid(request), start, end]),
      query('SELECT COALESCE(SUM(computed_kgco2e), 0) AS total FROM carbon_measurements WHERE organization_id = $1 AND record_date BETWEEN $2 AND $3', [oid(request), previousRange.start, previousRange.end]),
      query('SELECT metric_key, label, value, unit, note FROM carbon_benchmarks'),
    ])

    const totalCurrent = currentResult.rows.reduce((sum, row) => sum + Number(row.total || 0), 0)
    if (!totalCurrent) fail(422, `No hay mediciones registradas para ${year} T${quarter}`)

    const previousTotal = Number(previousResult.rows[0].total)
    const trendPercent = previousTotal ? Math.round(((totalCurrent - previousTotal) / previousTotal) * 1000) / 10 : null

    const topBlock = currentResult.rows.slice().sort((a, b) => Number(b.total) - Number(a.total))[0]
    const topBlockKey = topBlock?.block_key || null

    let recommendations = []
    if (topBlockKey) {
      const recResult = await query('SELECT text, source FROM carbon_recommendations WHERE block_key = $1 ORDER BY position LIMIT 4', [topBlockKey])
      recommendations = recResult.rows
    }

    const benchmarkComparison = {
      benchmarks: benchmarksResult.rows,
      caveat: 'Los benchmarks del NHS/HHS corresponden a sistemas de salud de altos ingresos; se muestran como referencia de dirección, no como meta exacta esperable en el contexto colombiano.',
    }

    const inserted = await query(
      `INSERT INTO carbon_quarterly_analyses (organization_id, year, quarter, total_kgco2e, trend_percent, top_block_key, benchmark_comparison, recommendations, generated_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [oid(request), year, quarter, totalCurrent, trendPercent, topBlockKey, JSON.stringify(benchmarkComparison), JSON.stringify(recommendations), uid(request)],
    )
    response.status(201).json(inserted.rows[0])
  } catch (error) { next(error) }
})

// ---- Informe PDF institucional ----

carbonRouter.get('/report.pdf', carbonModule, exportPerm, async (request, response, next) => {
  try {
    const params = [oid(request)]
    const where = ['m.organization_id = $1']
    if (request.query.dateFrom) { params.push(request.query.dateFrom); where.push(`m.record_date >= $${params.length}`) }
    if (request.query.dateTo) { params.push(request.query.dateTo); where.push(`m.record_date <= $${params.length}`) }

    const measurementsResult = await query(
      `SELECT m.*, b.name AS block_name, b.scope AS block_scope FROM carbon_measurements m JOIN carbon_blocks b ON b.key = m.block_key WHERE ${where.join(' AND ')} ORDER BY m.record_date`,
      params,
    )
    const orgResult = await query('SELECT name FROM organizations WHERE id = $1', [oid(request)])

    const byScope = { SCOPE_1: 0, SCOPE_2: 0, SCOPE_3: 0 }
    const byBlockMap = new Map()
    let total = 0
    for (const row of measurementsResult.rows) {
      const kgco2e = Number(row.computed_kgco2e) || 0
      const scope = row.scope_override || row.block_scope
      if (scope && byScope[scope] != null) byScope[scope] += kgco2e
      total += kgco2e
      const bucket = byBlockMap.get(row.block_key) || { name: row.block_name, kgco2e: 0, count: 0 }
      bucket.kgco2e += kgco2e
      bucket.count += 1
      byBlockMap.set(row.block_key, bucket)
    }

    const html = renderCarbonReportHtml({
      organizationName: orgResult.rows[0]?.name || '',
      dateFrom: request.query.dateFrom || null,
      dateTo: request.query.dateTo || null,
      generatedAt: new Date().toISOString(),
      total,
      byScope,
      byBlock: [...byBlockMap.entries()].map(([key, value]) => ({ blockKey: key, ...value })).sort((a, b) => b.kgco2e - a.kgco2e),
      measurements: measurementsResult.rows,
    })
    const pdf = await renderPdf(html)
    response.setHeader('Content-Type', 'application/pdf')
    response.setHeader('Content-Disposition', 'attachment; filename="informe-huella-carbono.pdf"')
    response.send(pdf)
  } catch (error) { next(error) }
})

// ============================================================================
// Huella de Carbono v2 — motor de 3 fuentes (Combustion estacionaria/movil +
// Electricidad). Ver server/schema.sql (seccion "Huella de Carbono v2") y
// shared/carbonScoring.mjs. Todo lo de arriba en este archivo pertenece al
// modulo viejo de "bloques" y se deja intacto.
// ============================================================================

async function logCarbon(organizationId, entityType, entityId, action, changes, actorUserId) {
  await query(
    `INSERT INTO activity_logs (organization_id, entity_type, entity_id, action, changes, actor_user_id) VALUES ($1,$2,$3,$4,$5,$6)`,
    [organizationId, entityType, entityId, action, JSON.stringify(changes || {}), actorUserId],
  )
}

// ---- Perfil institucional (versionado por vigencia) ----

carbonRouter.get('/profile', carbonModule, view, async (request, response, next) => {
  try {
    const year = Number(request.query.year) || new Date().getUTCFullYear()
    const result = await query(
      `SELECT * FROM carbon_profiles WHERE organization_id = $1 AND vigencia_year <= $2 ORDER BY vigencia_year DESC LIMIT 1`,
      [oid(request), year],
    )
    response.json(result.rows[0] || null)
  } catch (error) { next(error) }
})

carbonRouter.get('/profile/years', carbonModule, view, async (request, response, next) => {
  try {
    const result = await query('SELECT vigencia_year FROM carbon_profiles WHERE organization_id = $1 ORDER BY vigencia_year DESC', [oid(request)])
    response.json(result.rows.map(row => row.vigencia_year))
  } catch (error) { next(error) }
})

carbonRouter.put('/profile', carbonModule, manage, async (request, response, next) => {
  try {
    const body = request.body || {}
    const year = Number(body.vigenciaYear)
    if (!year) fail(400, 'Falta el año de vigencia')
    const inserted = await query(
      `INSERT INTO carbon_profiles (organization_id, vigencia_year, establishment_name, department, city, address, start_year, establishment_type, organizational_boundary, temp_min_c, temp_max_c, humidity_winter_percent, humidity_summer_percent, fulltime_employees, patients_per_year, avg_occupied_beds, built_area_m2, hours_per_day, currency, usd_exchange_rate, updated_by_id, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW())
       ON CONFLICT (organization_id, vigencia_year) DO UPDATE SET
         establishment_name=$3, department=$4, city=$5, address=$6, start_year=$7, establishment_type=$8, organizational_boundary=$9,
         temp_min_c=$10, temp_max_c=$11, humidity_winter_percent=$12, humidity_summer_percent=$13, fulltime_employees=$14,
         patients_per_year=$15, avg_occupied_beds=$16, built_area_m2=$17, hours_per_day=$18, currency=$19, usd_exchange_rate=$20,
         updated_by_id=$21, updated_at=NOW()
       RETURNING *`,
      [oid(request), year, body.establishmentName || '', body.department || '', body.city || '', body.address || '',
        body.startYear || null, body.establishmentType || '', body.organizationalBoundary || '',
        body.tempMinC ?? null, body.tempMaxC ?? null, body.humidityWinterPercent ?? null, body.humiditySummerPercent ?? null,
        body.fulltimeEmployees ?? null, body.patientsPerYear ?? null, body.avgOccupiedBeds ?? null, body.builtAreaM2 ?? null,
        body.hoursPerDay ?? null, body.currency || 'COP', body.usdExchangeRate ?? null, uid(request)],
    )
    await logCarbon(oid(request), 'CARBON_PROFILE', inserted.rows[0].id, 'UPDATED', { vigenciaYear: year }, uid(request))
    response.json(inserted.rows[0])
  } catch (error) { next(error) }
})

// ---- Catalogos de referencia (combustibles, GWP, factor electrico, mezclas) ----

carbonRouter.get('/fuels', carbonModule, view, async (request, response, next) => {
  try { response.json(await loadFuels()) } catch (error) { next(error) }
})

carbonRouter.patch('/fuels/:fuelKey', carbonModule, manage, async (request, response, next) => {
  try {
    const body = request.body || {}
    const before = await loadFuel(request.params.fuelKey)
    if (!before) fail(404, 'Combustible no encontrado')
    const updated = await query(
      `UPDATE carbon_fuel_types SET density_kg_per_unit=$1, heating_value_mj_per_kg=$2,
         fe_stationary_co2_g_mj=$3, fe_stationary_ch4_g_mj=$4, fe_stationary_n2o_g_mj=$5,
         fe_mobile_co2_g_mj=$6, fe_mobile_ch4_g_mj=$7, fe_mobile_n2o_g_mj=$8, factor_source=$9, active=$10
       WHERE fuel_key=$11 RETURNING *`,
      [body.densityKgPerUnit ?? before.density_kg_per_unit, body.heatingValueMjPerKg ?? before.heating_value_mj_per_kg,
        body.feStationaryCo2GMj ?? before.fe_stationary_co2_g_mj, body.feStationaryCh4GMj ?? before.fe_stationary_ch4_g_mj, body.feStationaryN2oGMj ?? before.fe_stationary_n2o_g_mj,
        body.feMobileCo2GMj ?? before.fe_mobile_co2_g_mj, body.feMobileCh4GMj ?? before.fe_mobile_ch4_g_mj, body.feMobileN2oGMj ?? before.fe_mobile_n2o_g_mj,
        body.factorSource ?? before.factor_source, body.active ?? before.active, request.params.fuelKey],
    )
    // Nota de trazabilidad: los registros YA calculados guardan su propio factor_snapshot, asi que
    // editar el catalogo aqui NUNCA altera un calculo historico — solo rige para lo que se capture
    // de ahora en adelante.
    await logCarbon(oid(request), 'CARBON_FUEL_FACTOR', updated.rows[0].id, 'UPDATED', { fuelKey: request.params.fuelKey, before, after: updated.rows[0] }, uid(request))
    response.json(updated.rows[0])
  } catch (error) { next(error) }
})

carbonRouter.get('/gwp', carbonModule, view, async (request, response, next) => {
  try { response.json((await query('SELECT * FROM carbon_gwp ORDER BY gas_key')).rows) } catch (error) { next(error) }
})

carbonRouter.get('/electricity-factors', carbonModule, view, async (request, response, next) => {
  try { response.json((await query('SELECT * FROM carbon_electricity_factors ORDER BY valid_from DESC')).rows) } catch (error) { next(error) }
})

// Versionado: un factor nuevo CIERRA la vigencia del anterior, nunca lo sobrescribe — los registros
// ya calculados guardan su propio factor_snapshot y no se ven afectados de todos modos.
carbonRouter.post('/electricity-factors', carbonModule, manage, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const body = request.body || {}
    if (!body.validFrom || body.valueKgco2ePerKwh == null || !body.source) fail(400, 'Faltan campos obligatorios (vigencia desde, valor, fuente)')
    await client.query('BEGIN')
    await client.query(
      `UPDATE carbon_electricity_factors SET valid_to = $1::date - INTERVAL '1 day' WHERE region = $2 AND valid_to IS NULL AND valid_from < $1::date`,
      [body.validFrom, body.region || 'CO'],
    )
    const inserted = await client.query(
      `INSERT INTO carbon_electricity_factors (region, label, value_kgco2e_per_kwh, valid_from, source) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [body.region || 'CO', body.label || 'Factor de red', Number(body.valueKgco2ePerKwh), body.validFrom, body.source],
    )
    await client.query('COMMIT')
    await logCarbon(oid(request), 'CARBON_ELECTRICITY_FACTOR', inserted.rows[0].id, 'CREATED', body, uid(request))
    response.status(201).json(inserted.rows[0])
  } catch (error) { await client.query('ROLLBACK'); next(error) } finally { client.release() }
})

carbonRouter.get('/biofuel-blends', carbonModule, view, async (request, response, next) => {
  try { response.json((await query('SELECT * FROM carbon_biofuel_blends ORDER BY valid_from DESC')).rows) } catch (error) { next(error) }
})

carbonRouter.post('/biofuel-blends', carbonModule, manage, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const body = request.body || {}
    if (!body.validFrom || body.biodieselPercent == null || body.bioethanolPercent == null || !body.source) fail(400, 'Faltan campos obligatorios')
    await client.query('BEGIN')
    await client.query(
      `UPDATE carbon_biofuel_blends SET valid_to = $1::date - INTERVAL '1 day' WHERE region = $2 AND valid_to IS NULL AND valid_from < $1::date`,
      [body.validFrom, body.region || 'CO'],
    )
    const inserted = await client.query(
      `INSERT INTO carbon_biofuel_blends (region, biodiesel_percent, bioethanol_percent, valid_from, source) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [body.region || 'CO', Number(body.biodieselPercent), Number(body.bioethanolPercent), body.validFrom, body.source],
    )
    await client.query('COMMIT')
    await logCarbon(oid(request), 'CARBON_BIOFUEL_BLEND', inserted.rows[0].id, 'CREATED', body, uid(request))
    response.status(201).json(inserted.rows[0])
  } catch (error) { await client.query('ROLLBACK'); next(error) } finally { client.release() }
})

// ---- Catalogos ligeros por entidad (equipos, vehiculos, medidores) ----

function catalogRoutes(path, table, columns) {
  carbonRouter.get(`/${path}`, carbonModule, view, async (request, response, next) => {
    try { response.json((await query(`SELECT * FROM ${table} WHERE organization_id = $1 ORDER BY active DESC, id DESC`, [oid(request)])).rows) } catch (error) { next(error) }
  })
  carbonRouter.post(`/${path}`, carbonModule, capture, async (request, response, next) => {
    try {
      const body = request.body || {}
      const values = columns.map(column => body[column.field] ?? column.default)
      const placeholders = columns.map((_column, index) => `$${index + 2}`).join(',')
      const inserted = await query(
        `INSERT INTO ${table} (organization_id, ${columns.map(column => column.name).join(',')}) VALUES ($1,${placeholders}) RETURNING *`,
        [oid(request), ...values],
      )
      response.status(201).json(inserted.rows[0])
    } catch (error) { next(error) }
  })
  carbonRouter.patch(`/${path}/:id`, carbonModule, capture, async (request, response, next) => {
    try {
      const body = request.body || {}
      const sets = columns.map((column, index) => `${column.name} = COALESCE($${index + 1}, ${column.name})`).concat('active = COALESCE($' + (columns.length + 1) + ', active)')
      const values = columns.map(column => body[column.field])
      const updated = await query(
        `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${columns.length + 2} AND organization_id = $${columns.length + 3} RETURNING *`,
        [...values, body.active, Number(request.params.id), oid(request)],
      )
      if (!updated.rows[0]) fail(404, 'No encontrado')
      response.json(updated.rows[0])
    } catch (error) { next(error) }
  })
}

catalogRoutes('equipment', 'carbon_equipment', [{ field: 'area', name: 'area', default: '' }, { field: 'name', name: 'name', default: '' }, { field: 'internalCode', name: 'internal_code', default: '' }])
catalogRoutes('vehicles', 'carbon_vehicles', [{ field: 'plate', name: 'plate', default: '' }, { field: 'vehicleType', name: 'vehicle_type', default: '' }, { field: 'ownership', name: 'ownership', default: 'PROPIO' }])
catalogRoutes('meters', 'carbon_electricity_meters', [{ field: 'code', name: 'code', default: '' }, { field: 'label', name: 'label', default: '' }, { field: 'provider', name: 'provider', default: '' }])

// ---- Evidencia (polimorfica: STATIONARY/MOBILE/ELECTRICITY + record_id) ----

function mountEvidenceRoutes(basePath, recordType, table) {
  carbonRouter.post(`${basePath}/:id/evidence`, carbonModule, capture, uploadEvidence.array('files', 5), async (request, response, next) => {
    const files = request.files || []
    const client = await pool.connect()
    try {
      if (!files.length) return response.status(400).json({ error: 'Selecciona al menos un archivo' })
      await client.query('BEGIN')
      const record = await client.query(`SELECT id FROM ${table} WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [Number(request.params.id), oid(request)])
      if (!record.rows[0]) fail(404, 'Registro no encontrado')
      const saved = []
      for (const file of files) {
        const evidence = await client.query(
          `INSERT INTO carbon_activity_evidence (organization_id, record_type, record_id, original_name, mime_type, size_bytes, storage_key, uploaded_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, original_name, mime_type, size_bytes, created_at`,
          [oid(request), recordType, request.params.id, file.originalname, file.mimetype, file.size, file.filename, uid(request)],
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

  carbonRouter.get(`${basePath}/:id/evidence/:evidenceId/download`, carbonModule, view, async (request, response, next) => {
    try {
      const result = await query(
        'SELECT original_name, storage_key FROM carbon_activity_evidence WHERE id = $1 AND record_type = $2 AND record_id = $3 AND organization_id = $4',
        [request.params.evidenceId, recordType, request.params.id, oid(request)],
      )
      if (!result.rows[0]) return response.status(404).json({ error: 'Evidencia no encontrada' })
      response.download(resolve(uploadRoot, result.rows[0].storage_key), result.rows[0].original_name)
    } catch (error) { next(error) }
  })
}

async function loadEvidence(recordType, recordId) {
  const result = await query(
    'SELECT id, original_name, mime_type, size_bytes, created_at FROM carbon_activity_evidence WHERE record_type = $1 AND record_id = $2 ORDER BY created_at',
    [recordType, recordId],
  )
  return result.rows
}

// ---- Registros: Combustion estacionaria ----

carbonRouter.get('/records/stationary', carbonModule, view, async (request, response, next) => {
  try {
    const params = [oid(request)]
    const where = ['r.organization_id = $1', 'r.deleted_at IS NULL']
    if (request.query.dateFrom) { params.push(request.query.dateFrom); where.push(`r.record_date >= $${params.length}`) }
    if (request.query.dateTo) { params.push(request.query.dateTo); where.push(`r.record_date <= $${params.length}`) }
    if (request.query.status) { params.push(request.query.status); where.push(`r.status = $${params.length}`) }
    if (request.query.q) { params.push(`%${request.query.q}%`); where.push(`(r.area ILIKE $${params.length} OR r.equipment_label ILIKE $${params.length} OR r.invoice_number ILIKE $${params.length})`) }
    const limit = Math.min(200, Number(request.query.limit) || 50)
    const offset = Math.max(0, Number(request.query.offset) || 0)
    const [rowsResult, countResult] = await Promise.all([
      query(
        `SELECT r.*, f.label AS fuel_label, u.full_name AS created_by_name,
                (SELECT COUNT(*)::int FROM carbon_activity_evidence e WHERE e.record_type='STATIONARY' AND e.record_id=r.id) AS evidence_count
         FROM carbon_stationary_records r JOIN carbon_fuel_types f ON f.fuel_key = r.fuel_key JOIN users u ON u.id = r.created_by_id
         WHERE ${where.join(' AND ')} ORDER BY r.record_date DESC, r.id DESC LIMIT ${limit} OFFSET ${offset}`,
        params,
      ),
      query(`SELECT COUNT(*)::int AS total FROM carbon_stationary_records r WHERE ${where.join(' AND ')}`, params),
    ])
    response.json({ rows: rowsResult.rows, total: countResult.rows[0].total, limit, offset })
  } catch (error) { next(error) }
})

carbonRouter.post('/records/stationary', carbonModule, capture, async (request, response, next) => {
  try {
    const body = request.body || {}
    if (!body.recordDate || !body.fuelKey || body.quantity == null || !body.quantityUnit) fail(400, 'Faltan campos obligatorios (fecha, combustible, cantidad, unidad)')
    const { fuel, result, factorSnapshot } = await calcStationary({ fuelKey: body.fuelKey, quantity: body.quantity, quantityUnit: body.quantityUnit })
    const period = derivePeriod(body.recordDate)
    const status = body.status === 'BORRADOR' ? 'BORRADOR' : 'PENDIENTE'
    const inserted = await query(
      `INSERT INTO carbon_stationary_records (organization_id, record_date, period_year, period_month, period_quarter, period_semester, area, equipment_id, equipment_label, internal_code, fuel_key, quantity, quantity_unit, invoice_number, provider, invoice_value, responsible_name, information_source, notes, status, energy_mj, co2_kg, ch4_kg, n2o_kg, co2e_kg, factor_snapshot, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) RETURNING *`,
      [oid(request), body.recordDate, period.year, period.month, period.quarter, period.semester, body.area || '', body.equipmentId || null, body.equipmentLabel || '', body.internalCode || '',
        fuel.fuel_key, Number(body.quantity), body.quantityUnit, body.invoiceNumber || '', body.provider || '', body.invoiceValue ?? null, body.responsibleName || '', body.informationSource || '', body.notes || '',
        status, result.energyMj, result.co2Kg, result.ch4Kg, result.n2oKg, result.co2eKg, JSON.stringify(factorSnapshot), uid(request)],
    )
    await logCarbon(oid(request), 'CARBON_STATIONARY_RECORD', inserted.rows[0].id, 'CREATED', { status }, uid(request))
    response.status(201).json(inserted.rows[0])
  } catch (error) { next(error) }
})

carbonRouter.get('/records/stationary/:id', carbonModule, view, async (request, response, next) => {
  try {
    const result = await query(
      `SELECT r.*, f.label AS fuel_label, u.full_name AS created_by_name
       FROM carbon_stationary_records r JOIN carbon_fuel_types f ON f.fuel_key = r.fuel_key JOIN users u ON u.id = r.created_by_id
       WHERE r.id = $1 AND r.organization_id = $2 AND r.deleted_at IS NULL`,
      [Number(request.params.id), oid(request)],
    )
    if (!result.rows[0]) fail(404, 'Registro no encontrado')
    response.json({ ...result.rows[0], evidence: await loadEvidence('STATIONARY', result.rows[0].id) })
  } catch (error) { next(error) }
})

carbonRouter.patch('/records/stationary/:id', carbonModule, capture, async (request, response, next) => {
  try {
    const body = request.body || {}
    const existing = await query('SELECT * FROM carbon_stationary_records WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [Number(request.params.id), oid(request)])
    if (!existing.rows[0]) fail(404, 'Registro no encontrado')
    const before = existing.rows[0]
    const fuelKey = body.fuelKey || before.fuel_key
    const quantity = body.quantity ?? before.quantity
    const quantityUnit = body.quantityUnit || before.quantity_unit
    const { fuel, result, factorSnapshot } = await calcStationary({ fuelKey, quantity, quantityUnit })
    const recordDate = body.recordDate || before.record_date.toISOString().slice(0, 10)
    const period = derivePeriod(recordDate)
    // Editar un registro VALIDADO no pisa en silencio lo revisado: guarda la version anterior y
    // vuelve a pedir revision (§ reglas de trazabilidad del modulo).
    const wasValidated = before.status === 'VALIDADO'
    const nextStatus = wasValidated ? 'PENDIENTE' : before.status
    const previousSnapshot = wasValidated ? before : before.previous_snapshot
    const updated = await query(
      `UPDATE carbon_stationary_records SET record_date=$1, period_year=$2, period_month=$3, period_quarter=$4, period_semester=$5,
         area=$6, equipment_id=$7, equipment_label=$8, internal_code=$9, fuel_key=$10, quantity=$11, quantity_unit=$12,
         invoice_number=$13, provider=$14, invoice_value=$15, responsible_name=$16, information_source=$17, notes=$18,
         status=$19, previous_snapshot=$20, energy_mj=$21, co2_kg=$22, ch4_kg=$23, n2o_kg=$24, co2e_kg=$25, factor_snapshot=$26,
         updated_by_id=$27, updated_at=NOW()
       WHERE id=$28 RETURNING *`,
      [recordDate, period.year, period.month, period.quarter, period.semester,
        body.area ?? before.area, body.equipmentId ?? before.equipment_id, body.equipmentLabel ?? before.equipment_label, body.internalCode ?? before.internal_code,
        fuel.fuel_key, Number(quantity), quantityUnit, body.invoiceNumber ?? before.invoice_number, body.provider ?? before.provider, body.invoiceValue ?? before.invoice_value,
        body.responsibleName ?? before.responsible_name, body.informationSource ?? before.information_source, body.notes ?? before.notes,
        nextStatus, previousSnapshot ? JSON.stringify(previousSnapshot) : null, result.energyMj, result.co2Kg, result.ch4Kg, result.n2oKg, result.co2eKg, JSON.stringify(factorSnapshot),
        uid(request), Number(request.params.id)],
    )
    await logCarbon(oid(request), 'CARBON_STATIONARY_RECORD', updated.rows[0].id, 'UPDATED', { revertedToPendiente: wasValidated }, uid(request))
    response.json(updated.rows[0])
  } catch (error) { next(error) }
})

carbonRouter.post('/records/stationary/:id/duplicate', carbonModule, capture, async (request, response, next) => {
  try {
    const existing = await query('SELECT * FROM carbon_stationary_records WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [Number(request.params.id), oid(request)])
    if (!existing.rows[0]) fail(404, 'Registro no encontrado')
    const r = existing.rows[0]
    const inserted = await query(
      `INSERT INTO carbon_stationary_records (organization_id, record_date, period_year, period_month, period_quarter, period_semester, area, equipment_id, equipment_label, internal_code, fuel_key, quantity, quantity_unit, invoice_number, provider, invoice_value, responsible_name, information_source, notes, status, energy_mj, co2_kg, ch4_kg, n2o_kg, co2e_kg, factor_snapshot, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'BORRADOR',$20,$21,$22,$23,$24,$25,$26) RETURNING *`,
      [oid(request), r.record_date, r.period_year, r.period_month, r.period_quarter, r.period_semester, r.area, r.equipment_id, r.equipment_label, r.internal_code,
        r.fuel_key, r.quantity, r.quantity_unit, '', r.provider, r.invoice_value, r.responsible_name, r.information_source, r.notes,
        r.energy_mj, r.co2_kg, r.ch4_kg, r.n2o_kg, r.co2e_kg, r.factor_snapshot, uid(request)],
    )
    response.status(201).json(inserted.rows[0])
  } catch (error) { next(error) }
})

mountEvidenceRoutes('/records/stationary', 'STATIONARY', 'carbon_stationary_records')

// ---- Registros: Combustion movil ----

carbonRouter.get('/records/mobile', carbonModule, view, async (request, response, next) => {
  try {
    const params = [oid(request)]
    const where = ['r.organization_id = $1', 'r.deleted_at IS NULL']
    if (request.query.dateFrom) { params.push(request.query.dateFrom); where.push(`r.record_date >= $${params.length}`) }
    if (request.query.dateTo) { params.push(request.query.dateTo); where.push(`r.record_date <= $${params.length}`) }
    if (request.query.status) { params.push(request.query.status); where.push(`r.status = $${params.length}`) }
    if (request.query.q) { params.push(`%${request.query.q}%`); where.push(`(r.plate ILIKE $${params.length} OR r.vehicle_type ILIKE $${params.length} OR r.invoice_number ILIKE $${params.length})`) }
    const limit = Math.min(200, Number(request.query.limit) || 50)
    const offset = Math.max(0, Number(request.query.offset) || 0)
    const [rowsResult, countResult] = await Promise.all([
      query(
        `SELECT r.*, f.label AS fuel_label, u.full_name AS created_by_name,
                (SELECT COUNT(*)::int FROM carbon_activity_evidence e WHERE e.record_type='MOBILE' AND e.record_id=r.id) AS evidence_count
         FROM carbon_mobile_records r JOIN carbon_fuel_types f ON f.fuel_key = r.fuel_key JOIN users u ON u.id = r.created_by_id
         WHERE ${where.join(' AND ')} ORDER BY r.record_date DESC, r.id DESC LIMIT ${limit} OFFSET ${offset}`,
        params,
      ),
      query(`SELECT COUNT(*)::int AS total FROM carbon_mobile_records r WHERE ${where.join(' AND ')}`, params),
    ])
    response.json({ rows: rowsResult.rows, total: countResult.rows[0].total, limit, offset })
  } catch (error) { next(error) }
})

carbonRouter.post('/records/mobile', carbonModule, capture, async (request, response, next) => {
  try {
    const body = request.body || {}
    if (!body.recordDate || !body.fuelKey || !body.inputMethod) fail(400, 'Faltan campos obligatorios (fecha, combustible, metodo)')
    let quantity = body.quantity
    let quantityUnit = body.quantityUnit
    if (body.inputMethod === 'RENDIMIENTO') {
      if (body.kmTraveled == null || body.specificConsumption == null) fail(400, 'El metodo por rendimiento requiere km recorridos y consumo especifico')
      quantity = Number(body.kmTraveled) * Number(body.specificConsumption)
      quantityUnit = quantityUnit || 'litro'
    } else if (quantity == null || !quantityUnit) {
      fail(400, 'El metodo por cantidad real requiere cantidad y unidad')
    }
    const { fuel, blendFuel, blendPercent, result, factorSnapshot } = await calcMobile({ fuelKey: body.fuelKey, quantity, quantityUnit, recordDate: body.recordDate })
    const period = derivePeriod(body.recordDate)
    const status = body.status === 'BORRADOR' ? 'BORRADOR' : 'PENDIENTE'
    const inserted = await query(
      `INSERT INTO carbon_mobile_records (organization_id, record_date, period_year, period_month, period_quarter, period_semester, vehicle_id, plate, vehicle_type, ownership, fuel_key, input_method, quantity, quantity_unit, km_traveled, specific_consumption, biodiesel_blend_percent, bioethanol_blend_percent, invoice_number, provider, responsible_name, information_source, notes, status, fossil_quantity_l, biogenic_quantity_l, energy_mj, co2_kg, ch4_kg, n2o_kg, co2e_kg, factor_snapshot, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33) RETURNING *`,
      [oid(request), body.recordDate, period.year, period.month, period.quarter, period.semester, body.vehicleId || null, body.plate || '', body.vehicleType || '', body.ownership || 'PROPIO',
        fuel.fuel_key, body.inputMethod, Number(quantity), quantityUnit, body.kmTraveled ?? null, body.specificConsumption ?? null,
        fuel.fuel_key === 'diesel' ? blendPercent : null, fuel.fuel_key === 'gasolina' ? blendPercent : null,
        body.invoiceNumber || '', body.provider || '', body.responsibleName || '', body.informationSource || '', body.notes || '',
        status, result.fossilQty, result.biogenicQty, result.energyMj, result.co2Kg, result.ch4Kg, result.n2oKg, result.co2eKg, JSON.stringify(factorSnapshot), uid(request)],
    )
    await logCarbon(oid(request), 'CARBON_MOBILE_RECORD', inserted.rows[0].id, 'CREATED', { status }, uid(request))
    response.status(201).json(inserted.rows[0])
  } catch (error) { next(error) }
})

carbonRouter.get('/records/mobile/:id', carbonModule, view, async (request, response, next) => {
  try {
    const result = await query(
      `SELECT r.*, f.label AS fuel_label, u.full_name AS created_by_name
       FROM carbon_mobile_records r JOIN carbon_fuel_types f ON f.fuel_key = r.fuel_key JOIN users u ON u.id = r.created_by_id
       WHERE r.id = $1 AND r.organization_id = $2 AND r.deleted_at IS NULL`,
      [Number(request.params.id), oid(request)],
    )
    if (!result.rows[0]) fail(404, 'Registro no encontrado')
    response.json({ ...result.rows[0], evidence: await loadEvidence('MOBILE', result.rows[0].id) })
  } catch (error) { next(error) }
})

carbonRouter.patch('/records/mobile/:id', carbonModule, capture, async (request, response, next) => {
  try {
    const body = request.body || {}
    const existing = await query('SELECT * FROM carbon_mobile_records WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [Number(request.params.id), oid(request)])
    if (!existing.rows[0]) fail(404, 'Registro no encontrado')
    const before = existing.rows[0]
    const recordDate = body.recordDate || before.record_date.toISOString().slice(0, 10)
    const fuelKey = body.fuelKey || before.fuel_key
    const inputMethod = body.inputMethod || before.input_method
    let quantity = body.quantity ?? before.quantity
    let quantityUnit = body.quantityUnit || before.quantity_unit
    const kmTraveled = body.kmTraveled ?? before.km_traveled
    const specificConsumption = body.specificConsumption ?? before.specific_consumption
    if (inputMethod === 'RENDIMIENTO' && kmTraveled != null && specificConsumption != null) quantity = Number(kmTraveled) * Number(specificConsumption)
    const { fuel, result, factorSnapshot } = await calcMobile({ fuelKey, quantity, quantityUnit, recordDate })
    const period = derivePeriod(recordDate)
    const wasValidated = before.status === 'VALIDADO'
    const nextStatus = wasValidated ? 'PENDIENTE' : before.status
    const previousSnapshot = wasValidated ? before : before.previous_snapshot
    const updated = await query(
      `UPDATE carbon_mobile_records SET record_date=$1, period_year=$2, period_month=$3, period_quarter=$4, period_semester=$5,
         vehicle_id=$6, plate=$7, vehicle_type=$8, ownership=$9, fuel_key=$10, input_method=$11, quantity=$12, quantity_unit=$13,
         km_traveled=$14, specific_consumption=$15, invoice_number=$16, provider=$17, responsible_name=$18, information_source=$19, notes=$20,
         status=$21, previous_snapshot=$22, fossil_quantity_l=$23, biogenic_quantity_l=$24, energy_mj=$25, co2_kg=$26, ch4_kg=$27, n2o_kg=$28, co2e_kg=$29, factor_snapshot=$30,
         updated_by_id=$31, updated_at=NOW()
       WHERE id=$32 RETURNING *`,
      [recordDate, period.year, period.month, period.quarter, period.semester,
        body.vehicleId ?? before.vehicle_id, body.plate ?? before.plate, body.vehicleType ?? before.vehicle_type, body.ownership ?? before.ownership,
        fuel.fuel_key, inputMethod, Number(quantity), quantityUnit, kmTraveled, specificConsumption,
        body.invoiceNumber ?? before.invoice_number, body.provider ?? before.provider, body.responsibleName ?? before.responsible_name, body.informationSource ?? before.information_source, body.notes ?? before.notes,
        nextStatus, previousSnapshot ? JSON.stringify(previousSnapshot) : null, result.fossilQty, result.biogenicQty, result.energyMj, result.co2Kg, result.ch4Kg, result.n2oKg, result.co2eKg, JSON.stringify(factorSnapshot),
        uid(request), Number(request.params.id)],
    )
    await logCarbon(oid(request), 'CARBON_MOBILE_RECORD', updated.rows[0].id, 'UPDATED', { revertedToPendiente: wasValidated }, uid(request))
    response.json(updated.rows[0])
  } catch (error) { next(error) }
})

carbonRouter.post('/records/mobile/:id/duplicate', carbonModule, capture, async (request, response, next) => {
  try {
    const existing = await query('SELECT * FROM carbon_mobile_records WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [Number(request.params.id), oid(request)])
    if (!existing.rows[0]) fail(404, 'Registro no encontrado')
    const r = existing.rows[0]
    const inserted = await query(
      `INSERT INTO carbon_mobile_records (organization_id, record_date, period_year, period_month, period_quarter, period_semester, vehicle_id, plate, vehicle_type, ownership, fuel_key, input_method, quantity, quantity_unit, km_traveled, specific_consumption, biodiesel_blend_percent, bioethanol_blend_percent, invoice_number, provider, responsible_name, information_source, notes, status, fossil_quantity_l, biogenic_quantity_l, energy_mj, co2_kg, ch4_kg, n2o_kg, co2e_kg, factor_snapshot, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'',$19,$20,$21,$22,'BORRADOR',$23,$24,$25,$26,$27,$28,$29,$30,$31) RETURNING *`,
      [oid(request), r.record_date, r.period_year, r.period_month, r.period_quarter, r.period_semester, r.vehicle_id, r.plate, r.vehicle_type, r.ownership,
        r.fuel_key, r.input_method, r.quantity, r.quantity_unit, r.km_traveled, r.specific_consumption, r.biodiesel_blend_percent, r.bioethanol_blend_percent,
        r.provider, r.responsible_name, r.information_source, r.notes, r.fossil_quantity_l, r.biogenic_quantity_l, r.energy_mj, r.co2_kg, r.ch4_kg, r.n2o_kg, r.co2e_kg, r.factor_snapshot, uid(request)],
    )
    response.status(201).json(inserted.rows[0])
  } catch (error) { next(error) }
})

mountEvidenceRoutes('/records/mobile', 'MOBILE', 'carbon_mobile_records')

// ---- Registros: Energia electrica ----

carbonRouter.get('/records/electricity', carbonModule, view, async (request, response, next) => {
  try {
    const params = [oid(request)]
    const where = ['r.organization_id = $1', 'r.deleted_at IS NULL']
    if (request.query.dateFrom) { params.push(request.query.dateFrom); where.push(`r.billing_start >= $${params.length}`) }
    if (request.query.dateTo) { params.push(request.query.dateTo); where.push(`r.billing_end <= $${params.length}`) }
    if (request.query.status) { params.push(request.query.status); where.push(`r.status = $${params.length}`) }
    if (request.query.q) { params.push(`%${request.query.q}%`); where.push(`(r.meter_code ILIKE $${params.length} OR r.invoice_number ILIKE $${params.length} OR r.provider ILIKE $${params.length})`) }
    const limit = Math.min(200, Number(request.query.limit) || 50)
    const offset = Math.max(0, Number(request.query.offset) || 0)
    const [rowsResult, countResult] = await Promise.all([
      query(
        `SELECT r.*, u.full_name AS created_by_name,
                (SELECT COUNT(*)::int FROM carbon_activity_evidence e WHERE e.record_type='ELECTRICITY' AND e.record_id=r.id) AS evidence_count
         FROM carbon_electricity_records r JOIN users u ON u.id = r.created_by_id
         WHERE ${where.join(' AND ')} ORDER BY r.billing_start DESC, r.id DESC LIMIT ${limit} OFFSET ${offset}`,
        params,
      ),
      query(`SELECT COUNT(*)::int AS total FROM carbon_electricity_records r WHERE ${where.join(' AND ')}`, params),
    ])
    response.json({ rows: rowsResult.rows, total: countResult.rows[0].total, limit, offset })
  } catch (error) { next(error) }
})

carbonRouter.post('/records/electricity', carbonModule, capture, async (request, response, next) => {
  try {
    const body = request.body || {}
    if (!body.billingStart || !body.billingEnd || body.kwh == null) fail(400, 'Faltan campos obligatorios (periodo de facturacion, kWh)')

    // Deteccion de traslapes por medidor: dos facturas del mismo medidor no pueden cubrir el mismo
    // rango de dias — sintoma tipico de una factura cargada dos veces o de un periodo mal digitado.
    const overlap = await query(
      `SELECT id FROM carbon_electricity_records WHERE organization_id = $1 AND deleted_at IS NULL AND meter_code = $2
         AND billing_start <= $3::date AND billing_end >= $4::date`,
      [oid(request), body.meterCode || '', body.billingEnd, body.billingStart],
    )
    if (overlap.rows[0]) fail(409, 'Ya existe una factura de este medidor que traslapa este periodo de facturacion')

    if (body.invoiceNumber) {
      const duplicateInvoice = await query('SELECT id FROM carbon_electricity_records WHERE organization_id = $1 AND deleted_at IS NULL AND invoice_number = $2', [oid(request), body.invoiceNumber])
      if (duplicateInvoice.rows[0]) fail(409, `El numero de factura "${body.invoiceNumber}" ya esta registrado`)
    }

    const { factor, result, factorSnapshot } = await calcElectricity({ kwh: body.kwh, recordDate: body.billingEnd })
    const period = derivePeriod(body.billingEnd)
    const status = body.status === 'BORRADOR' ? 'BORRADOR' : 'PENDIENTE'
    const inserted = await query(
      `INSERT INTO carbon_electricity_records (organization_id, meter_id, meter_code, billing_start, billing_end, period_year, period_month, period_quarter, period_semester, invoice_number, provider, account_number, kwh, invoice_value, responsible_name, notes, status, co2e_kg, factor_snapshot, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [oid(request), body.meterId || null, body.meterCode || '', body.billingStart, body.billingEnd, period.year, period.month, period.quarter, period.semester,
        body.invoiceNumber || '', body.provider || '', body.accountNumber || '', Number(body.kwh), body.invoiceValue ?? null, body.responsibleName || '', body.notes || '',
        status, result.co2eKg, JSON.stringify(factorSnapshot), uid(request)],
    )
    await logCarbon(oid(request), 'CARBON_ELECTRICITY_RECORD', inserted.rows[0].id, 'CREATED', { status }, uid(request))
    response.status(201).json(inserted.rows[0])
  } catch (error) { next(error) }
})

carbonRouter.get('/records/electricity/:id', carbonModule, view, async (request, response, next) => {
  try {
    const result = await query(
      `SELECT r.*, u.full_name AS created_by_name FROM carbon_electricity_records r JOIN users u ON u.id = r.created_by_id
       WHERE r.id = $1 AND r.organization_id = $2 AND r.deleted_at IS NULL`,
      [Number(request.params.id), oid(request)],
    )
    if (!result.rows[0]) fail(404, 'Registro no encontrado')
    response.json({ ...result.rows[0], evidence: await loadEvidence('ELECTRICITY', result.rows[0].id) })
  } catch (error) { next(error) }
})

carbonRouter.patch('/records/electricity/:id', carbonModule, capture, async (request, response, next) => {
  try {
    const body = request.body || {}
    const existing = await query('SELECT * FROM carbon_electricity_records WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [Number(request.params.id), oid(request)])
    if (!existing.rows[0]) fail(404, 'Registro no encontrado')
    const before = existing.rows[0]
    const billingEnd = body.billingEnd || before.billing_end.toISOString().slice(0, 10)
    const billingStart = body.billingStart || before.billing_start.toISOString().slice(0, 10)
    const kwh = body.kwh ?? before.kwh
    const { result, factorSnapshot } = await calcElectricity({ kwh, recordDate: billingEnd })
    const period = derivePeriod(billingEnd)
    const wasValidated = before.status === 'VALIDADO'
    const nextStatus = wasValidated ? 'PENDIENTE' : before.status
    const previousSnapshot = wasValidated ? before : before.previous_snapshot
    const updated = await query(
      `UPDATE carbon_electricity_records SET meter_id=$1, meter_code=$2, billing_start=$3, billing_end=$4, period_year=$5, period_month=$6, period_quarter=$7, period_semester=$8,
         invoice_number=$9, provider=$10, account_number=$11, kwh=$12, invoice_value=$13, responsible_name=$14, notes=$15,
         status=$16, previous_snapshot=$17, co2e_kg=$18, factor_snapshot=$19, updated_by_id=$20, updated_at=NOW()
       WHERE id=$21 RETURNING *`,
      [body.meterId ?? before.meter_id, body.meterCode ?? before.meter_code, billingStart, billingEnd, period.year, period.month, period.quarter, period.semester,
        body.invoiceNumber ?? before.invoice_number, body.provider ?? before.provider, body.accountNumber ?? before.account_number, Number(kwh), body.invoiceValue ?? before.invoice_value,
        body.responsibleName ?? before.responsible_name, body.notes ?? before.notes,
        nextStatus, previousSnapshot ? JSON.stringify(previousSnapshot) : null, result.co2eKg, JSON.stringify(factorSnapshot),
        uid(request), Number(request.params.id)],
    )
    await logCarbon(oid(request), 'CARBON_ELECTRICITY_RECORD', updated.rows[0].id, 'UPDATED', { revertedToPendiente: wasValidated }, uid(request))
    response.json(updated.rows[0])
  } catch (error) { next(error) }
})

mountEvidenceRoutes('/records/electricity', 'ELECTRICITY', 'carbon_electricity_records')

// ---- Validar / Rechazar / Eliminar (genericos a los 3 tipos) ----

const RECORD_TABLES = { stationary: { table: 'carbon_stationary_records', entity: 'CARBON_STATIONARY_RECORD', evidenceType: 'STATIONARY' }, mobile: { table: 'carbon_mobile_records', entity: 'CARBON_MOBILE_RECORD', evidenceType: 'MOBILE' }, electricity: { table: 'carbon_electricity_records', entity: 'CARBON_ELECTRICITY_RECORD', evidenceType: 'ELECTRICITY' } }

for (const [kind, config] of Object.entries(RECORD_TABLES)) {
  carbonRouter.post(`/records/${kind}/:id/validate`, carbonModule, manage, async (request, response, next) => {
    try {
      const updated = await query(`UPDATE ${config.table} SET status='VALIDADO', rejection_reason='', updated_by_id=$1, updated_at=NOW() WHERE id=$2 AND organization_id=$3 AND deleted_at IS NULL RETURNING *`, [uid(request), Number(request.params.id), oid(request)])
      if (!updated.rows[0]) fail(404, 'Registro no encontrado')
      await logCarbon(oid(request), config.entity, updated.rows[0].id, 'VALIDATED', {}, uid(request))
      response.json(updated.rows[0])
    } catch (error) { next(error) }
  })

  carbonRouter.post(`/records/${kind}/:id/reject`, carbonModule, manage, async (request, response, next) => {
    try {
      const reason = (request.body || {}).reason
      if (!reason) fail(400, 'Indica el motivo del rechazo')
      const updated = await query(`UPDATE ${config.table} SET status='RECHAZADO', rejection_reason=$1, updated_by_id=$2, updated_at=NOW() WHERE id=$3 AND organization_id=$4 AND deleted_at IS NULL RETURNING *`, [reason, uid(request), Number(request.params.id), oid(request)])
      if (!updated.rows[0]) fail(404, 'Registro no encontrado')
      await logCarbon(oid(request), config.entity, updated.rows[0].id, 'REJECTED', { reason }, uid(request))
      response.json(updated.rows[0])
    } catch (error) { next(error) }
  })

  // Eliminacion exclusiva de superadmin — igual criterio que Matrices de Adherencia: registros de
  // prueba o duplicados no necesitan preservarse, un borrado real es mas honesto que un soft-delete
  // que deje basura visible en filtros para siempre.
  carbonRouter.delete(`/records/${kind}/:id`, carbonModule, view, requireSuperadmin, async (request, response, next) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const evidence = await client.query('SELECT storage_key FROM carbon_activity_evidence WHERE record_type = $1 AND record_id = $2 AND organization_id = $3', [config.evidenceType, Number(request.params.id), oid(request)])
      const deleted = await client.query(`DELETE FROM ${config.table} WHERE id = $1 AND organization_id = $2 RETURNING id`, [Number(request.params.id), oid(request)])
      if (!deleted.rows[0]) fail(404, 'Registro no encontrado')
      await client.query('DELETE FROM carbon_activity_evidence WHERE record_type = $1 AND record_id = $2', [config.evidenceType, Number(request.params.id)])
      await client.query(
        `INSERT INTO activity_logs (organization_id, entity_type, entity_id, action, changes, actor_user_id) VALUES ($1,$2,$3,'DELETED','{}'::jsonb,$4)`,
        [oid(request), config.entity, deleted.rows[0].id, uid(request)],
      )
      await client.query('COMMIT')
      await Promise.allSettled(evidence.rows.map(row => unlink(resolve(uploadRoot, row.storage_key)).catch(() => {})))
      response.json({ ok: true })
    } catch (error) { await client.query('ROLLBACK'); next(error) } finally { client.release() }
  })
}

// ---- Inventario de emisiones (union de los 3 tipos) ----

carbonRouter.get('/inventory', carbonModule, view, async (request, response, next) => {
  try {
    const orgId = oid(request)
    const { dateFrom, dateTo, status, source } = request.query
    const limit = Math.min(500, Number(request.query.limit) || 100)
    const offset = Math.max(0, Number(request.query.offset) || 0)

    const rows = []
    if (!source || source === 'STATIONARY') {
      const params = [orgId]; const where = ['r.organization_id = $1', 'r.deleted_at IS NULL']
      if (dateFrom) { params.push(dateFrom); where.push(`r.record_date >= $${params.length}`) }
      if (dateTo) { params.push(dateTo); where.push(`r.record_date <= $${params.length}`) }
      if (status) { params.push(status); where.push(`r.status = $${params.length}`) }
      const result = await query(`SELECT r.id, 'STATIONARY' AS source, 'Alcance 1' AS scope_label, r.record_date, f.label AS fuel_label, r.quantity, r.quantity_unit, r.co2e_kg, r.status, r.invoice_number, u.full_name AS created_by_name,
        (SELECT COUNT(*)::int FROM carbon_activity_evidence e WHERE e.record_type='STATIONARY' AND e.record_id=r.id) AS evidence_count
        FROM carbon_stationary_records r JOIN carbon_fuel_types f ON f.fuel_key=r.fuel_key JOIN users u ON u.id=r.created_by_id WHERE ${where.join(' AND ')}`, params)
      rows.push(...result.rows)
    }
    if (!source || source === 'MOBILE') {
      const params = [orgId]; const where = ['r.organization_id = $1', 'r.deleted_at IS NULL']
      if (dateFrom) { params.push(dateFrom); where.push(`r.record_date >= $${params.length}`) }
      if (dateTo) { params.push(dateTo); where.push(`r.record_date <= $${params.length}`) }
      if (status) { params.push(status); where.push(`r.status = $${params.length}`) }
      const result = await query(`SELECT r.id, 'MOBILE' AS source, 'Alcance 1' AS scope_label, r.record_date, f.label AS fuel_label, r.quantity, r.quantity_unit, r.co2e_kg, r.status, r.invoice_number, u.full_name AS created_by_name,
        (SELECT COUNT(*)::int FROM carbon_activity_evidence e WHERE e.record_type='MOBILE' AND e.record_id=r.id) AS evidence_count
        FROM carbon_mobile_records r JOIN carbon_fuel_types f ON f.fuel_key=r.fuel_key JOIN users u ON u.id=r.created_by_id WHERE ${where.join(' AND ')}`, params)
      rows.push(...result.rows)
    }
    if (!source || source === 'ELECTRICITY') {
      const params = [orgId]; const where = ['r.organization_id = $1', 'r.deleted_at IS NULL']
      if (dateFrom) { params.push(dateFrom); where.push(`r.billing_end >= $${params.length}`) }
      if (dateTo) { params.push(dateTo); where.push(`r.billing_end <= $${params.length}`) }
      if (status) { params.push(status); where.push(`r.status = $${params.length}`) }
      const result = await query(`SELECT r.id, 'ELECTRICITY' AS source, 'Alcance 2' AS scope_label, r.billing_end AS record_date, 'Energia electrica' AS fuel_label, r.kwh AS quantity, 'kWh' AS quantity_unit, r.co2e_kg, r.status, r.invoice_number, u.full_name AS created_by_name,
        (SELECT COUNT(*)::int FROM carbon_activity_evidence e WHERE e.record_type='ELECTRICITY' AND e.record_id=r.id) AS evidence_count
        FROM carbon_electricity_records r JOIN users u ON u.id=r.created_by_id WHERE ${where.join(' AND ')}`, params)
      rows.push(...result.rows)
    }

    rows.sort((a, b) => new Date(b.record_date) - new Date(a.record_date) || b.id - a.id)
    const total = rows.length
    response.json({ rows: rows.slice(offset, offset + limit), total, limit, offset })
  } catch (error) { next(error) }
})

// ---- Dashboard ----

async function fetchValidatedRows(orgId, dateFrom, dateTo) {
  const params = [orgId]
  const where = ['organization_id = $1', "status = 'VALIDADO'", 'deleted_at IS NULL']
  if (dateFrom) { params.push(dateFrom) }
  if (dateTo) { params.push(dateTo) }
  const dateFilterStationary = dateFrom && dateTo ? `AND record_date BETWEEN $2 AND $3` : ''
  const [stationary, mobile, electricity] = await Promise.all([
    query(`SELECT period_year, period_month, co2e_kg, record_date FROM carbon_stationary_records WHERE ${where.join(' AND ')} ${dateFilterStationary}`, params),
    query(`SELECT period_year, period_month, co2e_kg, record_date FROM carbon_mobile_records WHERE ${where.join(' AND ')} ${dateFilterStationary}`, params),
    query(`SELECT period_year, period_month, co2e_kg, billing_end AS record_date FROM carbon_electricity_records WHERE ${where.join(' AND ').replace('record_date', 'billing_end')} ${dateFrom && dateTo ? 'AND billing_end BETWEEN $2 AND $3' : ''}`, params),
  ])
  return {
    stationary: stationary.rows.map(row => ({ ...row, co2eKg: Number(row.co2e_kg) })),
    mobile: mobile.rows.map(row => ({ ...row, co2eKg: Number(row.co2e_kg) })),
    electricity: electricity.rows.map(row => ({ ...row, co2eKg: Number(row.co2e_kg) })),
  }
}

function buildNarrative({ totalTon, trendPercent, topSourceLabel, topSourceSharePercent }) {
  if (!totalTon) return 'Aun no hay registros validados en este periodo. La lectura automatica aparecera cuando se valide al menos un registro.'
  const parts = [`En el periodo seleccionado la huella institucional fue de ${totalTon.toFixed(2)} tCO2e.`]
  if (topSourceLabel) parts.push(`La fuente con mayor participacion fue ${topSourceLabel}, con ${topSourceSharePercent.toFixed(1)}% del total.`)
  if (trendPercent != null) {
    if (trendPercent > 5) parts.push(`Esto representa un aumento de ${trendPercent.toFixed(1)}% frente al periodo anterior — vale la pena revisar que motivo el incremento.`)
    else if (trendPercent < -5) parts.push(`Esto representa una reduccion de ${Math.abs(trendPercent).toFixed(1)}% frente al periodo anterior.`)
    else parts.push(`La variacion frente al periodo anterior fue de ${trendPercent.toFixed(1)}%, sin cambios significativos.`)
  }
  return parts.join(' ')
}

carbonRouter.get('/dashboard', carbonModule, view, async (request, response, next) => {
  try {
    const orgId = oid(request)
    const year = Number(request.query.year) || new Date().getUTCFullYear()
    const dateFrom = `${year}-01-01`
    const dateTo = `${year}-12-31`
    const prevDateFrom = `${year - 1}-01-01`
    const prevDateTo = `${year - 1}-12-31`

    const [current, previous, targetsResult, profileResult] = await Promise.all([
      fetchValidatedRows(orgId, dateFrom, dateTo),
      fetchValidatedRows(orgId, prevDateFrom, prevDateTo),
      query('SELECT * FROM carbon_reduction_targets WHERE organization_id = $1 ORDER BY target_year DESC LIMIT 1', [orgId]),
      query('SELECT * FROM carbon_profiles WHERE organization_id = $1 AND vigencia_year <= $2 ORDER BY vigencia_year DESC LIMIT 1', [orgId, year]),
    ])

    const sum = rows => rows.reduce((total, row) => total + row.co2eKg, 0)
    const stationaryKg = sum(current.stationary), mobileKg = sum(current.mobile), electricityKg = sum(current.electricity)
    const totalKg = stationaryKg + mobileKg + electricityKg
    const scope1Kg = stationaryKg + mobileKg, scope2Kg = electricityKg
    const prevTotalKg = sum(previous.stationary) + sum(previous.mobile) + sum(previous.electricity)
    const trendPercent = prevTotalKg ? ((totalKg - prevTotalKg) / prevTotalKg) * 100 : null

    const bySource = [
      { source: 'STATIONARY', label: 'Combustion estacionaria', kg: stationaryKg, ton: stationaryKg / 1000, sharePercent: totalKg ? (stationaryKg / totalKg) * 100 : 0 },
      { source: 'MOBILE', label: 'Combustion movil', kg: mobileKg, ton: mobileKg / 1000, sharePercent: totalKg ? (mobileKg / totalKg) * 100 : 0 },
      { source: 'ELECTRICITY', label: 'Energia electrica', kg: electricityKg, ton: electricityKg / 1000, sharePercent: totalKg ? (electricityKg / totalKg) * 100 : 0 },
    ].sort((a, b) => b.kg - a.kg)
    const topSource = bySource[0]?.kg > 0 ? bySource[0] : null

    // Timeline mensual (para el grafico de linea/area) y heatmap (meses x fuentes)
    const monthly = new Map()
    const ensureMonth = month => { if (!monthly.has(month)) monthly.set(month, { month, stationary: 0, mobile: 0, electricity: 0 }); return monthly.get(month) }
    current.stationary.forEach(row => { ensureMonth(row.period_month).stationary += row.co2eKg })
    current.mobile.forEach(row => { ensureMonth(row.period_month).mobile += row.co2eKg })
    current.electricity.forEach(row => { ensureMonth(row.period_month).electricity += row.co2eKg })
    const timeline = Array.from({ length: 12 }, (_unused, index) => {
      const month = index + 1
      const bucket = monthly.get(month) || { stationary: 0, mobile: 0, electricity: 0 }
      const total = bucket.stationary + bucket.mobile + bucket.electricity
      return { month, stationaryTon: bucket.stationary / 1000, mobileTon: bucket.mobile / 1000, electricityTon: bucket.electricity / 1000, totalTon: total / 1000 }
    })
    const monthsWithData = new Set([...current.stationary, ...current.mobile, ...current.electricity].map(row => row.period_month))
    const missingMonths = timeline.filter(point => point.month <= (year === new Date().getUTCFullYear() ? new Date().getUTCMonth() + 1 : 12) && !monthsWithData.has(point.month)).map(point => point.month)

    const target = targetsResult.rows[0] || null
    let targetProgress = null
    if (target) {
      const expectedValueKg = Number(target.base_value_kgco2e) * (1 - Number(target.target_reduction_percent) / 100)
      targetProgress = {
        baseYear: target.base_year, baseValueTon: Number(target.base_value_kgco2e) / 1000, targetYear: target.target_year,
        targetReductionPercent: Number(target.target_reduction_percent), expectedValueTon: expectedValueKg / 1000,
        currentValueTon: totalKg / 1000, progressPercent: expectedValueKg ? Math.min(150, (totalKg / expectedValueKg) * 100) : null,
        onTrack: totalKg <= expectedValueKg,
      }
    }

    const profile = profileResult.rows[0] || null
    const normalized = profile ? {
      perPatientKg: profile.patients_per_year ? totalKg / Number(profile.patients_per_year) : null,
      perEmployeeTon: profile.fulltime_employees ? (totalKg / 1000) / Number(profile.fulltime_employees) : null,
      perBedTon: profile.avg_occupied_beds ? (totalKg / 1000) / Number(profile.avg_occupied_beds) : null,
      perM2Kg: profile.built_area_m2 ? totalKg / Number(profile.built_area_m2) : null,
    } : null

    response.json({
      year, total: { kg: totalKg, ton: totalKg / 1000 },
      byScope: { scope1Ton: scope1Kg / 1000, scope2Ton: scope2Kg / 1000, scope1SharePercent: totalKg ? (scope1Kg / totalKg) * 100 : 0, scope2SharePercent: totalKg ? (scope2Kg / totalKg) * 100 : 0 },
      bySource, trendPercent, timeline, missingMonths,
      counts: { stationary: current.stationary.length, mobile: current.mobile.length, electricity: current.electricity.length },
      target: targetProgress, normalized,
      narrative: buildNarrative({ totalTon: totalKg / 1000, trendPercent, topSourceLabel: topSource?.label, topSourceSharePercent: topSource?.sharePercent || 0 }),
    })
  } catch (error) { next(error) }
})

// ---- Indicador de huella de carbono (auto-alimentado, nunca captura manual) ----

carbonRouter.get('/indicator', carbonModule, view, async (request, response, next) => {
  try {
    const orgId = oid(request)
    const periodicity = PERIODICITIES.includes(request.query.periodicity) ? request.query.periodicity : 'ANUAL'
    const now = new Date()
    const year = Number(request.query.year) || now.getUTCFullYear()
    const month = Number(request.query.month) || now.getUTCMonth() + 1

    let dateFrom, dateTo, key
    if (periodicity === 'MENSUAL') {
      dateFrom = `${year}-${String(month).padStart(2, '0')}-01`
      dateTo = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
      key = periodKey('MENSUAL', year, month)
    } else if (periodicity === 'TRIMESTRAL') {
      const quarter = Number(request.query.quarter) || Math.ceil(month / 3)
      const startMonth = (quarter - 1) * 3
      dateFrom = new Date(Date.UTC(year, startMonth, 1)).toISOString().slice(0, 10)
      dateTo = new Date(Date.UTC(year, startMonth + 3, 0)).toISOString().slice(0, 10)
      key = `${year}-Q${quarter}`
    } else if (periodicity === 'SEMESTRAL') {
      const semester = Number(request.query.semester) || (month <= 6 ? 1 : 2)
      dateFrom = semester === 1 ? `${year}-01-01` : `${year}-07-01`
      dateTo = semester === 1 ? `${year}-06-30` : `${year}-12-31`
      key = `${year}-S${semester}`
    } else {
      dateFrom = `${year}-01-01`; dateTo = `${year}-12-31`; key = String(year)
    }

    const [rows, targetsResult, profileResult] = await Promise.all([
      fetchValidatedRows(orgId, dateFrom, dateTo),
      query('SELECT * FROM carbon_reduction_targets WHERE organization_id = $1 AND target_year = $2', [orgId, year]),
      query('SELECT * FROM carbon_profiles WHERE organization_id = $1 AND vigencia_year <= $2 ORDER BY vigencia_year DESC LIMIT 1', [orgId, year]),
    ])
    const numeratorKg = [...rows.stationary, ...rows.mobile, ...rows.electricity].reduce((total, row) => total + row.co2eKg, 0)
    const resultTon = numeratorKg / 1000

    const target = targetsResult.rows[0] || null
    let targetTon = null, baselineTon = null, variationPercent = null, complianceStatus = null, semaphore = 'sin-dato'
    if (target) {
      baselineTon = Number(target.base_value_kgco2e) / 1000
      targetTon = baselineTon * (1 - Number(target.target_reduction_percent) / 100)
      variationPercent = baselineTon ? ((resultTon - baselineTon) / baselineTon) * 100 : null
      complianceStatus = resultTon <= targetTon ? 'CUMPLE' : 'NO_CUMPLE'
      // Semaforo orientado a "menor es mejor": verde si ya cumple la meta, amarillo si esta cerca
      // (menos de 10% por encima), rojo si se desvia mas de eso — nunca al reves.
      if (resultTon <= targetTon) semaphore = 'verde'
      else if (resultTon <= targetTon * 1.1) semaphore = 'amarillo'
      else semaphore = 'rojo'
    }

    const isProvisional = new Date(dateTo) > now
    const profile = profileResult.rows[0] || null
    const intensity = profile ? {
      kgco2ePerPatient: profile.patients_per_year ? numeratorKg / Number(profile.patients_per_year) : null,
      tco2ePerEmployee: profile.fulltime_employees ? resultTon / Number(profile.fulltime_employees) : null,
      tco2ePerBed: profile.avg_occupied_beds ? resultTon / Number(profile.avg_occupied_beds) : null,
      kgco2ePerM2: profile.built_area_m2 ? numeratorKg / Number(profile.built_area_m2) : null,
      kgco2ePerKwh: rows.electricity.length ? numeratorKg / rows.electricity.reduce((total) => total, 0) || null : null,
    } : null

    response.json({
      name: 'Huella de carbono institucional', periodicity, periodKey: key, dateFrom, dateTo,
      numeratorKg, resultTon, unit: 'tCO2e', targetTon, baselineTon, variationPercent, complianceStatus, semaphore,
      isProvisional, intensity, recordCount: rows.stationary.length + rows.mobile.length + rows.electricity.length,
    })
  } catch (error) { next(error) }
})

// Snapshot del indicador — se guarda al generar un informe, para que el numero firmado quede fijo
// aunque despues se agreguen registros de ese mismo periodo.
async function snapshotIndicator(orgId, indicatorData, actorUserId) {
  const inserted = await query(
    `INSERT INTO carbon_indicator_snapshots (organization_id, periodicity, period_key, numerator_kgco2e, result_value, unit, target_value, baseline_value, variation_percent, compliance_status, is_provisional, analysis_text, generated_by_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (organization_id, periodicity, period_key) DO UPDATE SET numerator_kgco2e=$4, result_value=$5, target_value=$7, baseline_value=$8, variation_percent=$9, compliance_status=$10, is_provisional=$11, analysis_text=$12, generated_by_id=$13, created_at=NOW()
     RETURNING *`,
    [orgId, indicatorData.periodicity, indicatorData.periodKey, indicatorData.numeratorKg, indicatorData.resultTon, indicatorData.unit,
      indicatorData.targetTon, indicatorData.baselineTon, indicatorData.variationPercent, indicatorData.complianceStatus, indicatorData.isProvisional,
      indicatorData.narrative || '', actorUserId],
  )
  return inserted.rows[0]
}

// ---- Historial y trazabilidad ----

carbonRouter.get('/audit-log', carbonModule, view, async (request, response, next) => {
  try {
    const params = [oid(request)]
    const where = ['organization_id = $1', "entity_type LIKE 'CARBON_%'"]
    if (request.query.entityType) { params.push(request.query.entityType); where.push(`entity_type = $${params.length}`) }
    const limit = Math.min(300, Number(request.query.limit) || 100)
    const result = await query(
      `SELECT al.*, u.full_name AS actor_name FROM activity_logs al JOIN users u ON u.id = al.actor_user_id
       WHERE ${where.join(' AND ')} ORDER BY al.created_at DESC LIMIT ${limit}`,
      params,
    )
    response.json(result.rows)
  } catch (error) { next(error) }
})

// ---- Informe PDF institucional v2 (22 secciones) ----

carbonRouter.get('/report-v2.pdf', carbonModule, exportPerm, async (request, response, next) => {
  try {
    const orgId = oid(request)
    const periodicity = PERIODICITIES.includes(request.query.periodicity) ? request.query.periodicity : 'ANUAL'
    const year = Number(request.query.year) || new Date().getUTCFullYear()
    const month = Number(request.query.month) || new Date().getUTCMonth() + 1
    const quarter = Number(request.query.quarter) || Math.ceil(month / 3)
    const semester = Number(request.query.semester) || (month <= 6 ? 1 : 2)

    let dateFrom, dateTo, periodLabel
    if (periodicity === 'MENSUAL') {
      dateFrom = `${year}-${String(month).padStart(2, '0')}-01`
      dateTo = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
      periodLabel = `${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][month - 1]} de ${year}`
    } else if (periodicity === 'TRIMESTRAL') {
      const startMonth = (quarter - 1) * 3
      dateFrom = new Date(Date.UTC(year, startMonth, 1)).toISOString().slice(0, 10)
      dateTo = new Date(Date.UTC(year, startMonth + 3, 0)).toISOString().slice(0, 10)
      periodLabel = `${quarter}º trimestre de ${year}`
    } else if (periodicity === 'SEMESTRAL') {
      dateFrom = semester === 1 ? `${year}-01-01` : `${year}-07-01`
      dateTo = semester === 1 ? `${year}-06-30` : `${year}-12-31`
      periodLabel = `${semester}º semestre de ${year}`
    } else {
      dateFrom = `${year}-01-01`; dateTo = `${year}-12-31`; periodLabel = `año ${year}`
    }

    const [orgResult, profileResult, rows, targetsResult, stationaryRows, mobileRows, electricityRows, fuelsResult, electricityFactorResult, blendResult] = await Promise.all([
      query('SELECT name FROM organizations WHERE id = $1', [orgId]),
      query('SELECT * FROM carbon_profiles WHERE organization_id = $1 AND vigencia_year <= $2 ORDER BY vigencia_year DESC LIMIT 1', [orgId, year]),
      fetchValidatedRows(orgId, dateFrom, dateTo),
      query('SELECT * FROM carbon_reduction_targets WHERE organization_id = $1 AND target_year = $2', [orgId, year]),
      query(`SELECT r.*, f.label AS fuel_label FROM carbon_stationary_records r JOIN carbon_fuel_types f ON f.fuel_key=r.fuel_key WHERE r.organization_id=$1 AND r.status='VALIDADO' AND r.deleted_at IS NULL AND r.record_date BETWEEN $2 AND $3 ORDER BY r.record_date`, [orgId, dateFrom, dateTo]),
      query(`SELECT r.*, f.label AS fuel_label FROM carbon_mobile_records r JOIN carbon_fuel_types f ON f.fuel_key=r.fuel_key WHERE r.organization_id=$1 AND r.status='VALIDADO' AND r.deleted_at IS NULL AND r.record_date BETWEEN $2 AND $3 ORDER BY r.record_date`, [orgId, dateFrom, dateTo]),
      query(`SELECT * FROM carbon_electricity_records WHERE organization_id=$1 AND status='VALIDADO' AND deleted_at IS NULL AND billing_end BETWEEN $2 AND $3 ORDER BY billing_end`, [orgId, dateFrom, dateTo]),
      loadFuels(),
      loadElectricityFactor(dateTo),
      loadBiofuelBlend(dateTo),
    ])

    const sum = list => list.reduce((total, row) => total + row.co2eKg, 0)
    const stationaryKg = sum(rows.stationary), mobileKg = sum(rows.mobile), electricityKg = sum(rows.electricity)
    const totalKg = stationaryKg + mobileKg + electricityKg
    const target = targetsResult.rows[0] || null

    const verificationCode = `HC-${orgId}-${Date.now().toString(36).toUpperCase()}`
    const html = renderCarbonReportHtmlV2({
      organizationName: orgResult.rows[0]?.name || '', profile: profileResult.rows[0] || null,
      periodLabel, dateFrom, dateTo, generatedAt: new Date().toISOString(), verificationCode,
      totals: { stationaryKg, mobileKg, electricityKg, totalKg, scope1Kg: stationaryKg + mobileKg, scope2Kg: electricityKg },
      target, stationaryRecords: stationaryRows.rows, mobileRecords: mobileRows.rows, electricityRecords: electricityRows.rows,
      fuels: fuelsResult, electricityFactor: electricityFactorResult, biofuelBlend: blendResult,
    })
    const pdf = await renderPdf(html, { footerLabel: 'Informe de Huella de Carbono' })

    await snapshotIndicator(orgId, {
      periodicity, periodKey: periodKey(periodicity, year, month), numeratorKg: totalKg, resultTon: totalKg / 1000, unit: 'tCO2e',
      targetTon: target ? Number(target.base_value_kgco2e) / 1000 * (1 - Number(target.target_reduction_percent) / 100) : null,
      baselineTon: target ? Number(target.base_value_kgco2e) / 1000 : null,
      variationPercent: target ? ((totalKg / 1000 - Number(target.base_value_kgco2e) / 1000) / (Number(target.base_value_kgco2e) / 1000)) * 100 : null,
      complianceStatus: target ? (totalKg / 1000 <= Number(target.base_value_kgco2e) / 1000 * (1 - Number(target.target_reduction_percent) / 100) ? 'CUMPLE' : 'NO_CUMPLE') : null,
      isProvisional: new Date(dateTo) > new Date(),
    }, uid(request))
    await logCarbon(orgId, 'CARBON_REPORT', orgId, 'GENERATED', { periodicity, year, month, quarter, semester, verificationCode }, uid(request))

    response.setHeader('Content-Type', 'application/pdf')
    response.setHeader('Content-Disposition', `attachment; filename="informe-huella-carbono-${periodKey(periodicity, year, month)}.pdf"`)
    response.send(pdf)
  } catch (error) { next(error) }
})
