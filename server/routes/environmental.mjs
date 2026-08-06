import { randomUUID } from 'node:crypto'
import { mkdir, unlink } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { pool, query } from '../db.mjs'
import { requireAnyModuleAccess, requirePermission } from '../auth.mjs'
import { calcConsumption, derivePeriod, resolveBaseline } from '../environmentalEngine.mjs'
import { INDICATOR_LABEL, INDICATOR_UNIT, PERIODICITIES, accumulatePeriod, computeIndicator, periodKey, proportionalSemaphore } from '../../shared/environmentalScoring.mjs'
import { renderPdf } from '../pdf.mjs'
import { renderEnvironmentalReportHtml } from '../templates/environmentalReport.mjs'

// Indicadores Ambientales es un MODULO PROPIO E INDEPENDIENTE — no mide emisiones GEI, mide
// eficiencia de consumo de energia y agua. Modulo, permisos y navegacion propios, separados de
// Huella de Carbono (ver server/schema.sql, seccion "Indicadores Ambientales").
export const environmentalRouter = Router()

const oid = request => request.auth.organization.id
const uid = request => request.auth.user.id

const envModule = requireAnyModuleAccess(['environmental-indicators'])
const view = requirePermission('environmental.view')
const capture = requirePermission('environmental.capture')
const manage = requirePermission('environmental.manage')
const exportPerm = requirePermission('environmental.export')

function fail(status, message) {
  const error = new Error(message)
  error.status = status
  throw error
}

function requireSuperadmin(request, response, next) {
  if (request.auth?.role?.key !== 'SUPERADMIN') return response.status(403).json({ error: 'Solo un superadministrador puede eliminar registros' })
  next()
}

async function logEnv(organizationId, entityType, entityId, action, changes, actorUserId) {
  await query(
    `INSERT INTO activity_logs (organization_id, entity_type, entity_id, action, changes, actor_user_id) VALUES ($1,$2,$3,$4,$5,$6)`,
    [organizationId, entityType, entityId, action, JSON.stringify(changes || {}), actorUserId],
  )
}

const uploadRoot = resolve(process.env.ENV_UPLOAD_DIR || 'uploads/environmental')
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

async function assertFacility(organizationId, facilityId) {
  const result = await query('SELECT * FROM env_facilities WHERE id = $1 AND organization_id = $2', [facilityId, organizationId])
  if (!result.rows[0]) fail(404, 'Sede no encontrada')
  return result.rows[0]
}

async function defaultFacility(organizationId) {
  const result = await query('SELECT * FROM env_facilities WHERE organization_id = $1 AND active = TRUE ORDER BY id LIMIT 1', [organizationId])
  return result.rows[0] || null
}

// ---- Sedes ----

environmentalRouter.get('/facilities', envModule, view, async (request, response, next) => {
  try { response.json((await query('SELECT * FROM env_facilities WHERE organization_id = $1 ORDER BY active DESC, id', [oid(request)])).rows) } catch (error) { next(error) }
})

environmentalRouter.post('/facilities', envModule, manage, async (request, response, next) => {
  try {
    const body = request.body || {}
    if (!body.code || !body.name) fail(400, 'Faltan código y nombre de la sede')
    const inserted = await query(
      'INSERT INTO env_facilities (organization_id, code, name) VALUES ($1,$2,$3) ON CONFLICT (organization_id, code) DO UPDATE SET name = $3 RETURNING *',
      [oid(request), body.code, body.name],
    )
    response.status(201).json(inserted.rows[0])
  } catch (error) { next(error) }
})

// ---- Lineas base ----

environmentalRouter.get('/baselines', envModule, view, async (request, response, next) => {
  try {
    const params = [oid(request)]
    const where = ['organization_id = $1']
    if (request.query.indicatorType) { params.push(request.query.indicatorType); where.push(`indicator_type = $${params.length}`) }
    if (request.query.facilityId) { params.push(request.query.facilityId); where.push(`facility_id = $${params.length}`) }
    const result = await query(`SELECT * FROM env_baselines WHERE ${where.join(' AND ')} ORDER BY indicator_type, valid_from DESC`, params)
    response.json(result.rows)
  } catch (error) { next(error) }
})

environmentalRouter.post('/baselines', envModule, manage, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const body = request.body || {}
    if (!body.facilityId || !body.indicatorType || !body.sourceType || body.intensityBase == null || !body.baseYear || !body.validFrom) fail(400, 'Faltan campos obligatorios')
    await assertFacility(oid(request), body.facilityId)
    await client.query('BEGIN')
    await client.query(
      `UPDATE env_baselines SET valid_to = $1::date - INTERVAL '1 day'
       WHERE organization_id = $2 AND facility_id = $3 AND indicator_type = $4 AND valid_to IS NULL AND valid_from < $1::date`,
      [body.validFrom, oid(request), body.facilityId, body.indicatorType],
    )
    const inserted = await client.query(
      `INSERT INTO env_baselines (organization_id, facility_id, indicator_type, source_type, base_year, intensity_base, unit, valid_from, observations, responsible_name, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [oid(request), body.facilityId, body.indicatorType, body.sourceType, Number(body.baseYear), Number(body.intensityBase),
        body.unit || `${INDICATOR_UNIT[body.indicatorType]}/1000 atenciones`, body.validFrom, body.observations || '', body.responsibleName || '', uid(request)],
    )
    await client.query('COMMIT')
    await logEnv(oid(request), 'ENV_BASELINE', inserted.rows[0].id, 'CREATED', body, uid(request))
    response.status(201).json(inserted.rows[0])
  } catch (error) { await client.query('ROLLBACK'); next(error) } finally { client.release() }
})

// ---- Metas ----

environmentalRouter.get('/targets', envModule, view, async (request, response, next) => {
  try {
    const params = [oid(request)]
    const where = ['organization_id = $1']
    if (request.query.indicatorType) { params.push(request.query.indicatorType); where.push(`indicator_type = $${params.length}`) }
    if (request.query.facilityId) { params.push(request.query.facilityId); where.push(`facility_id = $${params.length}`) }
    const result = await query(`SELECT * FROM env_targets WHERE ${where.join(' AND ')} ORDER BY indicator_type, valid_from DESC`, params)
    response.json(result.rows)
  } catch (error) { next(error) }
})

environmentalRouter.post('/targets', envModule, manage, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const body = request.body || {}
    if (!body.facilityId || !body.indicatorType || !body.targetYear || !body.validFrom) fail(400, 'Faltan campos obligatorios')
    await assertFacility(oid(request), body.facilityId)
    await client.query('BEGIN')
    await client.query(
      `UPDATE env_targets SET valid_to = $1::date - INTERVAL '1 day'
       WHERE organization_id = $2 AND facility_id = $3 AND indicator_type = $4 AND valid_to IS NULL AND valid_from < $1::date`,
      [body.validFrom, oid(request), body.facilityId, body.indicatorType],
    )
    const inserted = await client.query(
      `INSERT INTO env_targets (organization_id, facility_id, indicator_type, target_year, target_proportional_percent, tolerance_percent, valid_from, observations, responsible_name, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [oid(request), body.facilityId, body.indicatorType, Number(body.targetYear), Number(body.targetProportionalPercent ?? 100),
        Number(body.tolerancePercent ?? 5), body.validFrom, body.observations || '', body.responsibleName || '', uid(request)],
    )
    await client.query('COMMIT')
    await logEnv(oid(request), 'ENV_TARGET', inserted.rows[0].id, 'CREATED', body, uid(request))
    response.status(201).json(inserted.rows[0])
  } catch (error) { await client.query('ROLLBACK'); next(error) } finally { client.release() }
})

async function loadTarget(organizationId, facilityId, indicatorType, date) {
  const result = await query(
    `SELECT * FROM env_targets WHERE organization_id = $1 AND facility_id = $2 AND indicator_type = $3
       AND status = 'VALIDADA' AND valid_from <= $4 AND (valid_to IS NULL OR valid_to >= $4) ORDER BY valid_from DESC LIMIT 1`,
    [organizationId, facilityId, indicatorType, date],
  )
  return result.rows[0] || null
}

// ---- Evidencia ----

environmentalRouter.post('/records/:id/evidence', envModule, capture, uploadEvidence.array('files', 5), async (request, response, next) => {
  const files = request.files || []
  const client = await pool.connect()
  try {
    if (!files.length) return response.status(400).json({ error: 'Selecciona al menos un archivo' })
    await client.query('BEGIN')
    const record = await client.query('SELECT id FROM env_consumption_records WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [Number(request.params.id), oid(request)])
    if (!record.rows[0]) fail(404, 'Registro no encontrado')
    const saved = []
    for (const file of files) {
      const evidence = await client.query(
        `INSERT INTO env_evidence (organization_id, record_id, original_name, mime_type, size_bytes, storage_key, uploaded_by_id)
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

environmentalRouter.get('/records/:id/evidence/:evidenceId/download', envModule, view, async (request, response, next) => {
  try {
    const result = await query('SELECT original_name, storage_key FROM env_evidence WHERE id = $1 AND record_id = $2 AND organization_id = $3', [request.params.evidenceId, request.params.id, oid(request)])
    if (!result.rows[0]) return response.status(404).json({ error: 'Evidencia no encontrada' })
    response.download(resolve(uploadRoot, result.rows[0].storage_key), result.rows[0].original_name)
  } catch (error) { next(error) }
})

async function loadEvidence(recordId) {
  const result = await query('SELECT id, original_name, mime_type, size_bytes, created_at FROM env_evidence WHERE record_id = $1 ORDER BY created_at', [recordId])
  return result.rows
}

// ---- Registros de consumo ----

environmentalRouter.get('/records', envModule, view, async (request, response, next) => {
  try {
    const params = [oid(request)]
    const where = ['r.organization_id = $1', 'r.deleted_at IS NULL']
    if (request.query.indicatorType) { params.push(request.query.indicatorType); where.push(`r.indicator_type = $${params.length}`) }
    if (request.query.facilityId) { params.push(request.query.facilityId); where.push(`r.facility_id = $${params.length}`) }
    if (request.query.year) { params.push(Number(request.query.year)); where.push(`r.year = $${params.length}`) }
    if (request.query.status) { params.push(request.query.status); where.push(`r.status = $${params.length}`) }
    if (request.query.onlyOutliers === 'true') where.push('r.is_outlier = TRUE')
    const limit = Math.min(300, Number(request.query.limit) || 100)
    const offset = Math.max(0, Number(request.query.offset) || 0)
    const [rowsResult, countResult] = await Promise.all([
      query(
        `SELECT r.*, f.name AS facility_name, u.full_name AS created_by_name,
                (SELECT COUNT(*)::int FROM env_evidence e WHERE e.record_id = r.id) AS evidence_count
         FROM env_consumption_records r JOIN env_facilities f ON f.id = r.facility_id JOIN users u ON u.id = r.created_by_id
         WHERE ${where.join(' AND ')} ORDER BY r.year DESC, r.month DESC, r.id DESC LIMIT ${limit} OFFSET ${offset}`,
        params,
      ),
      query(`SELECT COUNT(*)::int AS total FROM env_consumption_records r WHERE ${where.join(' AND ')}`, params),
    ])
    response.json({ rows: rowsResult.rows, total: countResult.rows[0].total, limit, offset })
  } catch (error) { next(error) }
})

environmentalRouter.post('/records', envModule, capture, async (request, response, next) => {
  try {
    const body = request.body || {}
    if (!body.facilityId || !body.indicatorType || !body.readingEnd || body.consumptionValue == null || !body.attentionCount) {
      fail(400, 'Faltan campos obligatorios (sede, indicador, fecha, consumo, atenciones)')
    }
    if (Number(body.consumptionValue) < 0) fail(422, 'El consumo no puede ser negativo')
    if (Number(body.attentionCount) <= 0) fail(422, 'Las atenciones deben ser mayores a cero')
    if (new Date(body.readingEnd) > new Date()) fail(422, 'La fecha de lectura no puede ser futura')
    await assertFacility(oid(request), body.facilityId)

    const period = derivePeriod(body.readingEnd)
    const duplicate = await query(
      `SELECT id FROM env_consumption_records WHERE organization_id = $1 AND facility_id = $2 AND indicator_type = $3 AND year = $4 AND month = $5 AND deleted_at IS NULL`,
      [oid(request), body.facilityId, body.indicatorType, period.year, period.month],
    )
    if (duplicate.rows[0]) fail(409, `Ya existe un registro de ${INDICATOR_LABEL[body.indicatorType]} para ${period.month}/${period.year} en esta sede`)
    if (body.invoiceNumber) {
      const duplicateInvoice = await query(
        `SELECT id FROM env_consumption_records WHERE organization_id = $1 AND facility_id = $2 AND indicator_type = $3 AND invoice_number = $4 AND deleted_at IS NULL`,
        [oid(request), body.facilityId, body.indicatorType, body.invoiceNumber],
      )
      if (duplicateInvoice.rows[0]) fail(409, `La factura "${body.invoiceNumber}" ya está registrada`)
    }

    const { baseline, result, outlier } = await calcConsumption({
      organizationId: oid(request), facilityId: body.facilityId, indicatorType: body.indicatorType,
      year: period.year, month: period.month, consumptionValue: body.consumptionValue, attentionCount: body.attentionCount,
    })
    const status = body.status === 'BORRADOR' ? 'BORRADOR' : 'PENDIENTE'

    const inserted = await query(
      `INSERT INTO env_consumption_records (organization_id, facility_id, indicator_type, year, month, quarter, semester, reading_start, reading_end, provider, invoice_number, meter_code, meter_reading_start, meter_reading_end, consumption_value, consumption_unit, invoice_value, attention_count, responsible_name, information_source, notes, status, is_outlier, outlier_reason, intensity_value, baseline_intensity, baseline_source, expected_consumption, proportional_index, normalized_saving, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31) RETURNING *`,
      [oid(request), body.facilityId, body.indicatorType, period.year, period.month, period.quarter, period.semester,
        body.readingStart || null, body.readingEnd, body.provider || '', body.invoiceNumber || '', body.meterCode || '',
        body.meterReadingStart ?? null, body.meterReadingEnd ?? null, Number(body.consumptionValue), INDICATOR_UNIT[body.indicatorType],
        body.invoiceValue ?? null, Number(body.attentionCount), body.responsibleName || '', body.informationSource || '', body.notes || '',
        status, outlier.isOutlier, outlier.isOutlier ? `Dato atípico pendiente de validación: se desvía ${Math.abs(outlier.deviationPercent).toFixed(0)}% frente a la mediana de los demás meses (${outlier.reference.toFixed(2)})` : '',
        result.intensityValue, baseline?.intensity ?? null, baseline?.source ?? null, result.expectedConsumption, result.proportionalIndex, result.normalizedSaving, uid(request)],
    )
    await logEnv(oid(request), 'ENV_CONSUMPTION_RECORD', inserted.rows[0].id, 'CREATED', { status, isOutlier: outlier.isOutlier }, uid(request))
    response.status(201).json(inserted.rows[0])
  } catch (error) { next(error) }
})

environmentalRouter.get('/records/:id', envModule, view, async (request, response, next) => {
  try {
    const result = await query(
      `SELECT r.*, f.name AS facility_name, u.full_name AS created_by_name
       FROM env_consumption_records r JOIN env_facilities f ON f.id = r.facility_id JOIN users u ON u.id = r.created_by_id
       WHERE r.id = $1 AND r.organization_id = $2 AND r.deleted_at IS NULL`,
      [Number(request.params.id), oid(request)],
    )
    if (!result.rows[0]) fail(404, 'Registro no encontrado')
    response.json({ ...result.rows[0], evidence: await loadEvidence(result.rows[0].id) })
  } catch (error) { next(error) }
})

environmentalRouter.patch('/records/:id', envModule, capture, async (request, response, next) => {
  try {
    const body = request.body || {}
    const existing = await query('SELECT * FROM env_consumption_records WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [Number(request.params.id), oid(request)])
    if (!existing.rows[0]) fail(404, 'Registro no encontrado')
    const before = existing.rows[0]
    const readingEnd = body.readingEnd || before.reading_end.toISOString().slice(0, 10)
    const consumptionValue = body.consumptionValue ?? before.consumption_value
    const attentionCount = body.attentionCount ?? before.attention_count
    if (Number(consumptionValue) < 0) fail(422, 'El consumo no puede ser negativo')
    if (Number(attentionCount) <= 0) fail(422, 'Las atenciones deben ser mayores a cero')
    if (new Date(readingEnd) > new Date()) fail(422, 'La fecha de lectura no puede ser futura')

    const period = derivePeriod(readingEnd)
    const { baseline, result, outlier } = await calcConsumption({
      organizationId: oid(request), facilityId: before.facility_id, indicatorType: before.indicator_type,
      year: period.year, month: period.month, consumptionValue, attentionCount, excludeRecordId: before.id,
    })

    const wasValidated = before.status === 'VALIDADO'
    const nextStatus = wasValidated ? 'PENDIENTE' : before.status
    const previousSnapshot = wasValidated ? before : before.previous_snapshot

    const updated = await query(
      `UPDATE env_consumption_records SET year=$1, month=$2, quarter=$3, semester=$4, reading_start=$5, reading_end=$6,
         provider=$7, invoice_number=$8, meter_code=$9, meter_reading_start=$10, meter_reading_end=$11, consumption_value=$12,
         invoice_value=$13, attention_count=$14, responsible_name=$15, information_source=$16, notes=$17,
         status=$18, previous_snapshot=$19, is_outlier=$20, outlier_reason=$21,
         intensity_value=$22, baseline_intensity=$23, baseline_source=$24, expected_consumption=$25, proportional_index=$26, normalized_saving=$27,
         updated_by_id=$28, updated_at=NOW()
       WHERE id=$29 RETURNING *`,
      [period.year, period.month, period.quarter, period.semester, body.readingStart ?? before.reading_start, readingEnd,
        body.provider ?? before.provider, body.invoiceNumber ?? before.invoice_number, body.meterCode ?? before.meter_code,
        body.meterReadingStart ?? before.meter_reading_start, body.meterReadingEnd ?? before.meter_reading_end, Number(consumptionValue),
        body.invoiceValue ?? before.invoice_value, Number(attentionCount), body.responsibleName ?? before.responsible_name,
        body.informationSource ?? before.information_source, body.notes ?? before.notes,
        nextStatus, previousSnapshot ? JSON.stringify(previousSnapshot) : null, outlier.isOutlier,
        outlier.isOutlier ? `Dato atípico pendiente de validación: se desvía ${Math.abs(outlier.deviationPercent).toFixed(0)}% frente a la mediana de los demás meses (${outlier.reference.toFixed(2)})` : '',
        result.intensityValue, baseline?.intensity ?? null, baseline?.source ?? null, result.expectedConsumption, result.proportionalIndex, result.normalizedSaving,
        uid(request), Number(request.params.id)],
    )
    await logEnv(oid(request), 'ENV_CONSUMPTION_RECORD', updated.rows[0].id, 'UPDATED', { revertedToPendiente: wasValidated }, uid(request))
    response.json(updated.rows[0])
  } catch (error) { next(error) }
})

environmentalRouter.post('/records/:id/validate', envModule, manage, async (request, response, next) => {
  try {
    const updated = await query(`UPDATE env_consumption_records SET status='VALIDADO', rejection_reason='', updated_by_id=$1, updated_at=NOW() WHERE id=$2 AND organization_id=$3 AND deleted_at IS NULL RETURNING *`, [uid(request), Number(request.params.id), oid(request)])
    if (!updated.rows[0]) fail(404, 'Registro no encontrado')
    await logEnv(oid(request), 'ENV_CONSUMPTION_RECORD', updated.rows[0].id, 'VALIDATED', {}, uid(request))
    response.json(updated.rows[0])
  } catch (error) { next(error) }
})

environmentalRouter.post('/records/:id/reject', envModule, manage, async (request, response, next) => {
  try {
    const reason = (request.body || {}).reason
    if (!reason) fail(400, 'Indica el motivo del rechazo')
    const updated = await query(`UPDATE env_consumption_records SET status='RECHAZADO', rejection_reason=$1, updated_by_id=$2, updated_at=NOW() WHERE id=$3 AND organization_id=$4 AND deleted_at IS NULL RETURNING *`, [reason, uid(request), Number(request.params.id), oid(request)])
    if (!updated.rows[0]) fail(404, 'Registro no encontrado')
    await logEnv(oid(request), 'ENV_CONSUMPTION_RECORD', updated.rows[0].id, 'REJECTED', { reason }, uid(request))
    response.json(updated.rows[0])
  } catch (error) { next(error) }
})

environmentalRouter.delete('/records/:id', envModule, view, requireSuperadmin, async (request, response, next) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const evidence = await client.query('SELECT storage_key FROM env_evidence WHERE record_id = $1 AND organization_id = $2', [Number(request.params.id), oid(request)])
    const deleted = await client.query('DELETE FROM env_consumption_records WHERE id = $1 AND organization_id = $2 RETURNING id', [Number(request.params.id), oid(request)])
    if (!deleted.rows[0]) fail(404, 'Registro no encontrado')
    await client.query(
      `INSERT INTO activity_logs (organization_id, entity_type, entity_id, action, changes, actor_user_id) VALUES ($1,'ENV_CONSUMPTION_RECORD',$2,'DELETED','{}'::jsonb,$3)`,
      [oid(request), deleted.rows[0].id, uid(request)],
    )
    await client.query('COMMIT')
    await Promise.allSettled(evidence.rows.map(row => unlink(resolve(uploadRoot, row.storage_key)).catch(() => {})))
    response.json({ ok: true })
  } catch (error) { await client.query('ROLLBACK'); next(error) } finally { client.release() }
})

// ---- Dashboard ----

function periodRange(periodicity, year, month, quarter, semester) {
  if (periodicity === 'MENSUAL') return { dateFrom: `${year}-${String(month).padStart(2, '0')}-01`, dateTo: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) }
  if (periodicity === 'TRIMESTRAL') { const start = (quarter - 1) * 3; return { dateFrom: new Date(Date.UTC(year, start, 1)).toISOString().slice(0, 10), dateTo: new Date(Date.UTC(year, start + 3, 0)).toISOString().slice(0, 10) } }
  if (periodicity === 'SEMESTRAL') return semester === 1 ? { dateFrom: `${year}-01-01`, dateTo: `${year}-06-30` } : { dateFrom: `${year}-07-01`, dateTo: `${year}-12-31` }
  return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` }
}

async function fetchValidatedRecords(organizationId, facilityId, indicatorType, dateFrom, dateTo) {
  const result = await query(
    `SELECT * FROM env_consumption_records WHERE organization_id = $1 AND facility_id = $2 AND indicator_type = $3
       AND status = 'VALIDADO' AND deleted_at IS NULL AND reading_end BETWEEN $4 AND $5 ORDER BY month`,
    [organizationId, facilityId, indicatorType, dateFrom, dateTo],
  )
  return result.rows
}

function buildNarrative({ energy, water }) {
  const parts = []
  if (energy.consumptionTotal) {
    parts.push(`En el periodo seleccionado el consumo energético fue de ${energy.consumptionTotal.toLocaleString('es-CO', { maximumFractionDigits: 2 })} kWh para ${energy.attentionTotal.toLocaleString('es-CO')} atenciones, con una intensidad de ${energy.intensityValue?.toFixed(1) ?? '—'} kWh por cada 1.000 atenciones.`)
    if (energy.proportionalIndex != null) {
      const tone = energy.proportionalIndex <= 95 ? 'favorable, por debajo de la línea base' : energy.proportionalIndex <= 105 ? 'proporcional a la línea base' : 'un sobreconsumo frente a la línea base'
      parts.push(`El índice proporcional de energía se ubicó en ${energy.proportionalIndex.toFixed(1)}%, lo que indica un comportamiento ${tone}.`)
    } else parts.push('No hay línea base validada para calcular el índice proporcional de energía.')
  } else parts.push('Aún no hay registros de energía validados en este periodo.')

  if (water.consumptionTotal != null && water.attentionTotal) {
    parts.push(`El consumo de agua fue de ${water.consumptionTotal.toLocaleString('es-CO', { maximumFractionDigits: 2 })} m³ con una intensidad de ${water.intensityValue?.toFixed(3) ?? '—'} m³ por cada 1.000 atenciones.`)
    if (water.hasOutlier) parts.push('El indicador de agua presentó al menos un dato atípico pendiente de validación en el periodo.')
    else if (water.proportionalIndex != null) {
      const tone = water.proportionalIndex <= 95 ? 'favorable' : water.proportionalIndex <= 105 ? 'proporcional a la línea base' : 'un sobreconsumo frente a la línea base'
      parts.push(`El índice proporcional de agua se ubicó en ${water.proportionalIndex.toFixed(1)}%, lo que indica un comportamiento ${tone}.`)
    }
  } else parts.push('Aún no hay registros de agua validados en este periodo.')

  return parts.join(' ')
}

environmentalRouter.get('/dashboard', envModule, view, async (request, response, next) => {
  try {
    const organizationId = oid(request)
    const facility = request.query.facilityId ? await assertFacility(organizationId, request.query.facilityId) : await defaultFacility(organizationId)
    if (!facility) return response.json({ facility: null })
    const periodicity = PERIODICITIES.includes(request.query.periodicity) ? request.query.periodicity : 'ANUAL'
    const now = new Date()
    const year = Number(request.query.year) || now.getUTCFullYear()
    const month = Number(request.query.month) || now.getUTCMonth() + 1
    const quarter = Number(request.query.quarter) || Math.ceil(month / 3)
    const semester = Number(request.query.semester) || (month <= 6 ? 1 : 2)
    const { dateFrom, dateTo } = periodRange(periodicity, year, month, quarter, semester)

    const [energyRecords, waterRecords, energyTarget, waterTarget] = await Promise.all([
      fetchValidatedRecords(organizationId, facility.id, 'ENERGY', dateFrom, dateTo),
      fetchValidatedRecords(organizationId, facility.id, 'WATER', dateFrom, dateTo),
      loadTarget(organizationId, facility.id, 'ENERGY', dateTo),
      loadTarget(organizationId, facility.id, 'WATER', dateTo),
    ])

    async function summarize(records, indicatorType, target) {
      const { consumptionTotal, attentionTotal } = accumulatePeriod(records)
      const baseline = await resolveBaseline({ organizationId, facilityId: facility.id, indicatorType, year, month })
      const calc = computeIndicator(consumptionTotal, attentionTotal, baseline?.intensity ?? null)
      const hasOutlier = records.some(row => row.is_outlier)
      return {
        consumptionTotal, attentionTotal, intensityValue: calc.intensityValue, expectedConsumption: calc.expectedConsumption,
        proportionalIndex: calc.proportionalIndex, normalizedSaving: calc.normalizedSaving, hasOutlier, recordCount: records.length,
        baselineLabel: baseline?.label || null, semaphore: proportionalSemaphore(calc.proportionalIndex, target ? Number(target.target_proportional_percent) : 100, target ? Number(target.tolerance_percent) : 5),
        target: target ? { proportionalPercent: Number(target.target_proportional_percent), tolerancePercent: Number(target.tolerance_percent) } : null,
      }
    }

    const energy = await summarize(energyRecords, 'ENERGY', energyTarget)
    const water = await summarize(waterRecords, 'WATER', waterTarget)

    // Series mensuales para las graficas de tendencia (siempre año completo, independiente del
    // periodo seleccionado, para dar contexto de los 12 meses)
    const [energyYear, waterYear] = await Promise.all([
      fetchValidatedRecords(organizationId, facility.id, 'ENERGY', `${year}-01-01`, `${year}-12-31`),
      fetchValidatedRecords(organizationId, facility.id, 'WATER', `${year}-01-01`, `${year}-12-31`),
    ])
    const monthly = Array.from({ length: 12 }, (_unused, index) => {
      const m = index + 1
      const energyRow = energyYear.find(row => row.month === m)
      const waterRow = waterYear.find(row => row.month === m)
      return {
        month: m,
        energyConsumption: energyRow ? Number(energyRow.consumption_value) : null,
        energyAttentions: energyRow ? Number(energyRow.attention_count) : null,
        energyIntensity: energyRow ? Number(energyRow.intensity_value) : null,
        waterConsumption: waterRow ? Number(waterRow.consumption_value) : null,
        waterAttentions: waterRow ? Number(waterRow.attention_count) : null,
        waterIntensity: waterRow ? Number(waterRow.intensity_value) : null,
        waterIsOutlier: waterRow ? waterRow.is_outlier : false,
        energyIsOutlier: energyRow ? energyRow.is_outlier : false,
      }
    })

    const alertsResult = await query(
      `SELECT COUNT(*)::int AS total FROM env_consumption_records WHERE organization_id = $1 AND facility_id = $2 AND is_outlier = TRUE AND deleted_at IS NULL AND year = $3`,
      [organizationId, facility.id, year],
    )

    response.json({
      facility, year, periodicity, dateFrom, dateTo,
      energy, water, monthly,
      alertCount: alertsResult.rows[0].total,
      narrative: buildNarrative({ energy, water }),
    })
  } catch (error) { next(error) }
})

// ---- Indicador (vista exclusiva por tipo) ----

environmentalRouter.get('/indicator', envModule, view, async (request, response, next) => {
  try {
    const organizationId = oid(request)
    const indicatorType = request.query.indicatorType === 'WATER' ? 'WATER' : 'ENERGY'
    const facility = request.query.facilityId ? await assertFacility(organizationId, request.query.facilityId) : await defaultFacility(organizationId)
    if (!facility) fail(404, 'No hay ninguna sede configurada')
    const periodicity = PERIODICITIES.includes(request.query.periodicity) ? request.query.periodicity : 'ANUAL'
    const now = new Date()
    const year = Number(request.query.year) || now.getUTCFullYear()
    const month = Number(request.query.month) || now.getUTCMonth() + 1
    const quarter = Number(request.query.quarter) || Math.ceil(month / 3)
    const semester = Number(request.query.semester) || (month <= 6 ? 1 : 2)
    const { dateFrom, dateTo } = periodRange(periodicity, year, month, quarter, semester)

    const [records, target, history] = await Promise.all([
      fetchValidatedRecords(organizationId, facility.id, indicatorType, dateFrom, dateTo),
      loadTarget(organizationId, facility.id, indicatorType, dateTo),
      query(
        `SELECT year, month, consumption_value, attention_count, intensity_value, proportional_index, is_outlier
         FROM env_consumption_records WHERE organization_id = $1 AND facility_id = $2 AND indicator_type = $3
           AND status = 'VALIDADO' AND deleted_at IS NULL ORDER BY year DESC, month DESC LIMIT 24`,
        [organizationId, facility.id, indicatorType],
      ),
    ])

    const { consumptionTotal, attentionTotal } = accumulatePeriod(records)
    const baseline = await resolveBaseline({ organizationId, facilityId: facility.id, indicatorType, year, month })
    const calc = computeIndicator(consumptionTotal, attentionTotal, baseline?.intensity ?? null)
    const isProvisional = new Date(dateTo) > now || records.length === 0
    const hasOutlier = records.some(row => row.is_outlier)

    response.json({
      indicatorType, label: INDICATOR_LABEL[indicatorType], unit: INDICATOR_UNIT[indicatorType],
      facility, periodicity, periodKey: periodKey(periodicity, year, month), dateFrom, dateTo,
      consumptionTotal, attentionTotal, intensityValue: calc.intensityValue, expectedConsumption: calc.expectedConsumption,
      proportionalIndex: calc.proportionalIndex, normalizedSaving: calc.normalizedSaving,
      baseline, target: target ? { proportionalPercent: Number(target.target_proportional_percent), tolerancePercent: Number(target.tolerance_percent), year: target.target_year } : null,
      semaphore: proportionalSemaphore(calc.proportionalIndex, target ? Number(target.target_proportional_percent) : 100, target ? Number(target.tolerance_percent) : 5),
      isProvisional, hasOutlier, recordCount: records.length,
      history: history.rows.reverse(),
    })
  } catch (error) { next(error) }
})

// ---- Informe PDF ----

environmentalRouter.get('/report.pdf', envModule, exportPerm, async (request, response, next) => {
  try {
    const organizationId = oid(request)
    const indicatorType = request.query.indicatorType === 'WATER' ? 'WATER' : 'ENERGY'
    const facility = request.query.facilityId ? await assertFacility(organizationId, request.query.facilityId) : await defaultFacility(organizationId)
    if (!facility) fail(404, 'No hay ninguna sede configurada')
    const periodicity = PERIODICITIES.includes(request.query.periodicity) ? request.query.periodicity : 'ANUAL'
    const now = new Date()
    const year = Number(request.query.year) || now.getUTCFullYear()
    const month = Number(request.query.month) || now.getUTCMonth() + 1
    const quarter = Number(request.query.quarter) || Math.ceil(month / 3)
    const semester = Number(request.query.semester) || (month <= 6 ? 1 : 2)
    const { dateFrom, dateTo } = periodRange(periodicity, year, month, quarter, semester)
    const periodLabel = periodicity === 'MENSUAL'
      ? `${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][month - 1]} de ${year}`
      : periodicity === 'TRIMESTRAL' ? `${quarter}º trimestre de ${year}` : periodicity === 'SEMESTRAL' ? `${semester}º semestre de ${year}` : `año ${year}`

    const [orgResult, records, target] = await Promise.all([
      query('SELECT name FROM organizations WHERE id = $1', [organizationId]),
      fetchValidatedRecords(organizationId, facility.id, indicatorType, dateFrom, dateTo),
      loadTarget(organizationId, facility.id, indicatorType, dateTo),
    ])
    const { consumptionTotal, attentionTotal } = accumulatePeriod(records)
    const baseline = await resolveBaseline({ organizationId, facilityId: facility.id, indicatorType, year, month })
    const calc = computeIndicator(consumptionTotal, attentionTotal, baseline?.intensity ?? null)
    const verificationCode = `IA-${organizationId}-${Date.now().toString(36).toUpperCase()}`

    const html = renderEnvironmentalReportHtml({
      organizationName: orgResult.rows[0]?.name || '', facility, indicatorType, periodLabel, dateFrom, dateTo,
      generatedAt: new Date().toISOString(), verificationCode, records, consumptionTotal, attentionTotal,
      baseline, target, calc, hasOutlier: records.some(row => row.is_outlier),
    })
    const pdf = await renderPdf(html, { footerLabel: `Indicador de ${INDICATOR_LABEL[indicatorType]}` })

    await logEnv(organizationId, 'ENV_REPORT', facility.id, 'GENERATED', { indicatorType, periodicity, year, month, verificationCode }, uid(request))
    response.setHeader('Content-Type', 'application/pdf')
    response.setHeader('Content-Disposition', `attachment; filename="indicador-${indicatorType.toLowerCase()}-${periodKey(periodicity, year, month)}.pdf"`)
    response.send(pdf)
  } catch (error) { next(error) }
})

// ---- Historial ----

environmentalRouter.get('/audit-log', envModule, view, async (request, response, next) => {
  try {
    const params = [oid(request)]
    const where = ['organization_id = $1', "entity_type LIKE 'ENV_%'"]
    const limit = Math.min(300, Number(request.query.limit) || 100)
    const result = await query(
      `SELECT al.*, u.full_name AS actor_name FROM activity_logs al JOIN users u ON u.id = al.actor_user_id
       WHERE ${where.join(' AND ')} ORDER BY al.created_at DESC LIMIT ${limit}`,
      params,
    )
    response.json(result.rows)
  } catch (error) { next(error) }
})
