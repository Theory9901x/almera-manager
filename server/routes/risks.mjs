import { Router } from 'express'
import { pool, query } from '../db.mjs'
import { requireAnyModuleAccess, requirePermission } from '../auth.mjs'
import { renderPdf } from '../pdf.mjs'
import { renderRiskReportHtml } from '../templates/riskReport.mjs'
import {
  CONTROL_IMPLEMENTATIONS, CONTROL_TYPES, RISK_TYPES, TREATMENTS, ZONE_ORDER, ZONES,
  assessRisk, controlStrength, controlWeight, corruptionImpact, cuatrimestreOf, impactLevel,
  probabilityFromFrequency, probabilityLevel,
} from '../../shared/riskScoring.mjs'

// Gestion del Riesgo (metodologia DAFP v6). Las zonas y el residual NUNCA se leen de la base:
// se calculan aqui con el motor compartido, a partir de los niveles inherentes y los controles
// (con su ultima prueba de efectividad). Ver la seccion homonima de schema.sql.

export const risksRouter = Router()

const oid = request => request.auth.organization.id
const uid = request => request.auth.user.id
const risksModule = requireAnyModuleAccess(['risks'])
const view = requirePermission('risks.view')
const edit = requirePermission('risks.edit')
const materialize = requirePermission('risks.materialize')
const review = requirePermission('risks.review')
const exportPerm = requirePermission('risks.export')
const manage = requirePermission('risks.manage')

const CLOSED_ACTION = ['TERMINADA', 'CANCELADA']
const MATERIALIZATION_STATUS = ['REPORTADA', 'EN_ANALISIS', 'EN_TRATAMIENTO', 'CERRADA']
const ACTION_STATUS = ['PENDIENTE', 'EN_CURSO', 'TERMINADA', 'CANCELADA']
const DEFENSE_LINES = ['PRIMERA', 'SEGUNDA', 'TERCERA']
const REVIEW_CONCLUSIONS = ['ADECUADO', 'REQUIERE_AJUSTES', 'CRITICO']
const TEST_RESULTS = ['EFECTIVO', 'PARCIAL', 'NO_EFECTIVO']
// A quien se puede informar una materializacion. Las autoridades externas son obligatorias para
// cerrar una materializacion de CORRUPCION: la guia exige denunciar, no solo corregir.
const NOTIFIABLE_PARTIES = ['LIDER_PROCESO', 'SEGUNDA_LINEA', 'CONTROL_INTERNO', 'GERENCIA', 'COMITE_CONTROL_INTERNO', 'FISCALIA', 'PROCURADURIA', 'CONTRALORIA', 'SUPERSALUD', 'OTRO_ENTE']
const EXTERNAL_AUTHORITIES = ['FISCALIA', 'PROCURADURIA', 'CONTRALORIA', 'SUPERSALUD', 'OTRO_ENTE']

function fail(status, message) {
  const error = new Error(message)
  error.status = status
  throw error
}

/** Filtra un id de la URL: un id no numerico manda NaN a una clave bigint (22P02). CLAUDE.md §10. */
const numericId = value => /^\d+$/.test(String(value ?? ''))
const text = (value, max = 4000) => String(value ?? '').trim().slice(0, max)
const level = value => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : fail(400, 'Los niveles de probabilidad e impacto van de 1 a 5')
}
const optionalNumber = value => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) fail(400, 'Valor numérico inválido')
  return n
}
const optionalDate = value => {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) fail(400, 'Fecha inválida (AAAA-MM-DD)')
  return String(value)
}
const oneOf = (value, list, message) => {
  if (!list.includes(value)) fail(400, message)
  return value
}

async function logActivity(db, riskId, actorId, action, detail = '') {
  await db.query('INSERT INTO risk_activity (risk_id, action, detail, actor_id) VALUES ($1,$2,$3,$4)', [riskId, action, String(detail).slice(0, 1000), actorId])
}

async function assertRisk(db, request, riskId = request.params.id) {
  if (!numericId(riskId)) fail(404, 'Riesgo no encontrado')
  const result = await db.query(
    `SELECT r.*, m.year AS map_year, m.active AS map_active FROM risks r JOIN risk_maps m ON m.id = r.map_id
     WHERE r.id = $1 AND r.organization_id = $2 AND r.deleted_at IS NULL`,
    [riskId, oid(request)],
  )
  if (!result.rows[0]) fail(404, 'Riesgo no encontrado')
  return result.rows[0]
}

async function assertMembership(db, request, membershipId) {
  if (!membershipId) return null
  if (!numericId(membershipId)) fail(400, 'Responsable inválido')
  const result = await db.query(
    `SELECT m.id, u.full_name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.id = $1 AND m.organization_id = $2`,
    [membershipId, oid(request)],
  )
  if (!result.rows[0]) fail(400, 'El responsable no pertenece a la entidad')
  return result.rows[0]
}

/** Mapa a consultar: el pedido, o si no se indica, el activo mas reciente de la entidad. */
async function resolveMapId(request) {
  if (request.query.mapId) {
    if (!numericId(request.query.mapId)) fail(404, 'Mapa no encontrado')
    const found = await query('SELECT id FROM risk_maps WHERE id = $1 AND organization_id = $2', [request.query.mapId, oid(request)])
    if (!found.rows[0]) fail(404, 'Mapa no encontrado')
    return found.rows[0].id
  }
  const latest = await query('SELECT id FROM risk_maps WHERE organization_id = $1 ORDER BY active DESC, year DESC, id DESC LIMIT 1', [oid(request)])
  return latest.rows[0]?.id || null
}

/**
 * Riesgos de un mapa con todo lo necesario para valorarlos: controles (con su ultima prueba),
 * conteos de acciones, materializaciones y ultimo seguimiento. Cuatro consultas para el mapa
 * entero, no una por riesgo; la valoracion se hace en Node con el motor compartido.
 */
async function loadRisks(organizationId, mapId, onlyIds = null) {
  const params = [organizationId, mapId]
  let idFilter = ''
  if (onlyIds) { params.push(onlyIds); idFilter = ` AND r.id = ANY($${params.length}::bigint[])` }
  const [risks, controls, actions, mats, reviews] = await Promise.all([
    query(
      `SELECT r.*, p.code AS process_code, p.name AS process_name, c.name AS class_name, c.color AS class_color,
              m.name AS map_name, m.year AS map_year, COALESCE(NULLIF(r.owner_name, ''), ou.full_name, '') AS owner_label
       FROM risks r
       JOIN institutional_processes p ON p.id = r.process_id
       JOIN risk_maps m ON m.id = r.map_id
       LEFT JOIN risk_classes c ON c.id = r.class_id
       LEFT JOIN memberships om ON om.id = r.owner_membership_id
       LEFT JOIN users ou ON ou.id = om.user_id
       WHERE r.organization_id = $1 AND r.map_id = $2 AND r.deleted_at IS NULL${idFilter}
       ORDER BY p.code, r.sequence`, params),
    query(
      `SELECT c.*, lt.result AS last_test_result, lt.tested_at AS last_tested_at
       FROM risk_controls c
       JOIN risks r ON r.id = c.risk_id
       LEFT JOIN LATERAL (SELECT result, tested_at FROM risk_control_tests t WHERE t.control_id = c.id ORDER BY t.tested_at DESC, t.id DESC LIMIT 1) lt ON TRUE
       WHERE r.organization_id = $1 AND r.map_id = $2 AND r.deleted_at IS NULL${idFilter}
       ORDER BY c.risk_id, c.order_index, c.id`, params),
    query(
      `SELECT a.risk_id, COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE a.status NOT IN ('TERMINADA','CANCELADA'))::int AS open,
              COUNT(*) FILTER (WHERE a.status NOT IN ('TERMINADA','CANCELADA') AND a.due_date < CURRENT_DATE)::int AS overdue,
              COALESCE(ROUND(AVG(a.progress) FILTER (WHERE a.status <> 'CANCELADA')), 0)::int AS progress
       FROM risk_actions a JOIN risks r ON r.id = a.risk_id
       WHERE r.organization_id = $1 AND r.map_id = $2 AND r.deleted_at IS NULL${idFilter}
       GROUP BY a.risk_id`, params),
    query(
      `SELECT mt.risk_id, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE mt.status <> 'CERRADA')::int AS open, MAX(mt.occurred_at) AS last_at
       FROM risk_materializations mt JOIN risks r ON r.id = mt.risk_id
       WHERE r.organization_id = $1 AND r.map_id = $2 AND r.deleted_at IS NULL${idFilter}
       GROUP BY mt.risk_id`, params),
    query(
      `SELECT DISTINCT ON (rv.risk_id) rv.risk_id, rv.created_at, rv.defense_line, rv.conclusion, rv.period_label
       FROM risk_reviews rv JOIN risks r ON r.id = rv.risk_id
       WHERE r.organization_id = $1 AND r.map_id = $2 AND r.deleted_at IS NULL${idFilter}
       ORDER BY rv.risk_id, rv.created_at DESC`, params),
  ])
  const controlsByRisk = groupBy(controls.rows, row => row.risk_id)
  const actionsByRisk = new Map(actions.rows.map(row => [row.risk_id, row]))
  const matsByRisk = new Map(mats.rows.map(row => [row.risk_id, row]))
  const reviewsByRisk = new Map(reviews.rows.map(row => [row.risk_id, row]))
  return risks.rows.map(risk => {
    const riskControls = controlsByRisk.get(risk.id) || []
    return {
      ...risk,
      controls_count: riskControls.length,
      controls_ineffective: riskControls.filter(c => c.last_test_result === 'NO_EFECTIVO').length,
      assessment: assessRisk(risk, riskControls),
      actions: actionsByRisk.get(risk.id) || { total: 0, open: 0, overdue: 0, progress: 0 },
      materializations: matsByRisk.get(risk.id) || { total: 0, open: 0, last_at: null },
      last_review: reviewsByRisk.get(risk.id) || null,
      _controls: riskControls,
    }
  })
}

function groupBy(list, keyFn) {
  const map = new Map()
  for (const item of list) {
    const key = keyFn(item)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(item)
  }
  return map
}

function stripInternal(risk) {
  const { _controls, ...rest } = risk
  return rest
}

function emptyHeat() {
  return [1, 2, 3, 4, 5].reduce((rows, p) => ({ ...rows, [p]: [1, 2, 3, 4, 5].reduce((cols, i) => ({ ...cols, [i]: [] }), {}) }), {})
}

// ---------------------------------------------------------------------------
// Catalogos
// ---------------------------------------------------------------------------

risksRouter.get('/catalogs', risksModule, view, async (request, response, next) => {
  try {
    const [maps, processes, classes, responsibles] = await Promise.all([
      query(
        `SELECT m.id, m.name, m.year, m.description, m.active,
                (SELECT COUNT(*)::int FROM risks r WHERE r.map_id = m.id AND r.deleted_at IS NULL) AS risks_count
         FROM risk_maps m WHERE m.organization_id = $1 ORDER BY m.active DESC, m.year DESC, m.id DESC`, [oid(request)]),
      query('SELECT id, code, name, classification FROM institutional_processes WHERE organization_id = $1 AND active ORDER BY code', [oid(request)]),
      query('SELECT id, name, color, active, order_index FROM risk_classes WHERE organization_id = $1 ORDER BY order_index, name', [oid(request)]),
      query(
        `SELECT m.id, u.full_name FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.organization_id = $1 AND m.active AND u.active ORDER BY u.full_name`, [oid(request)]),
    ])
    response.json({ maps: maps.rows, processes: processes.rows, classes: classes.rows, responsibles: responsibles.rows })
  } catch (error) { next(error) }
})

// ---------------------------------------------------------------------------
// Tablero
// ---------------------------------------------------------------------------

risksRouter.get('/dashboard', risksModule, view, async (request, response, next) => {
  try {
    const mapId = await resolveMapId(request)
    if (!mapId) return response.json({ mapId: null, empty: true })
    const risks = (await loadRisks(oid(request), mapId)).filter(risk => risk.status === 'ACTIVO')
    const valued = risks.filter(risk => risk.assessment.inherent)

    const zoneCount = (stage) => ZONE_ORDER.map(key => ({ zone: key, value: valued.filter(risk => risk.assessment[stage].zone === key).length }))
    const high = (stage) => valued.filter(risk => ['ALTO', 'EXTREMO'].includes(risk.assessment[stage].zone)).length
    const heat = { inherent: emptyHeat(), residual: emptyHeat() }
    for (const risk of valued) {
      const chip = { id: risk.id, code: risk.code, type: risk.risk_type }
      heat.inherent[risk.assessment.inherent.probability][risk.assessment.inherent.impact].push(chip)
      heat.residual[risk.assessment.residual.probability][risk.assessment.residual.impact].push(chip)
    }

    const allControls = risks.flatMap(risk => risk._controls)
    const strength = { FUERTE: 0, MODERADO: 0, DEBIL: 0 }
    for (const control of allControls) strength[controlStrength(controlWeight(control)).key] += 1

    const byProcessMap = new Map()
    for (const risk of risks) {
      const entry = byProcessMap.get(risk.process_id) || { processId: risk.process_id, code: risk.process_code, name: risk.process_name, total: 0, high: 0, worst: null, materialized: 0, zones: { BAJO: 0, MODERADO: 0, ALTO: 0, EXTREMO: 0 } }
      entry.total += 1
      const zone = risk.assessment.residual?.zone
      if (zone) entry.zones[zone] += 1
      if (zone && ['ALTO', 'EXTREMO'].includes(zone)) entry.high += 1
      if (zone && (!entry.worst || ZONES[zone].rank > ZONES[entry.worst].rank)) entry.worst = zone
      entry.materialized += risk.materializations.total
      byProcessMap.set(risk.process_id, entry)
    }

    const [matTimeline, matStatus, actionsAgg, matTotals] = await Promise.all([
      query(
        `SELECT to_char(date_trunc('month', mt.occurred_at), 'YYYY-MM') AS month, COUNT(*)::int AS total
         FROM risk_materializations mt JOIN risks r ON r.id = mt.risk_id
         WHERE r.organization_id = $1 AND r.map_id = $2 AND r.deleted_at IS NULL AND mt.occurred_at >= (date_trunc('month', CURRENT_DATE) - INTERVAL '11 months')
         GROUP BY 1 ORDER BY 1`, [oid(request), mapId]),
      query(
        `SELECT mt.status, COUNT(*)::int AS total FROM risk_materializations mt JOIN risks r ON r.id = mt.risk_id
         WHERE r.organization_id = $1 AND r.map_id = $2 AND r.deleted_at IS NULL GROUP BY mt.status`, [oid(request), mapId]),
      query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE a.status = 'TERMINADA')::int AS done,
                COUNT(*) FILTER (WHERE a.status NOT IN ('TERMINADA','CANCELADA'))::int AS open,
                COUNT(*) FILTER (WHERE a.status NOT IN ('TERMINADA','CANCELADA') AND a.due_date < CURRENT_DATE)::int AS overdue,
                COALESCE(ROUND(AVG(a.progress) FILTER (WHERE a.status <> 'CANCELADA')), 0)::int AS progress
         FROM risk_actions a JOIN risks r ON r.id = a.risk_id
         WHERE r.organization_id = $1 AND r.map_id = $2 AND r.deleted_at IS NULL`, [oid(request), mapId]),
      query(
        `SELECT COUNT(*)::int AS total, COUNT(DISTINCT mt.risk_id)::int AS risks,
                COALESCE(SUM(mt.economic_loss), 0)::numeric AS loss
         FROM risk_materializations mt JOIN risks r ON r.id = mt.risk_id
         WHERE r.organization_id = $1 AND r.map_id = $2 AND r.deleted_at IS NULL`, [oid(request), mapId]),
    ])

    // Serie de 12 meses completa (los meses sin eventos salen en 0, no desaparecen del eje).
    const months = []
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
      months.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`)
    }
    const matByMonth = new Map(matTimeline.rows.map(row => [row.month, row.total]))
    const currentPeriod = cuatrimestreOf(new Date()).label
    const movement = { lowered: 0, same: 0 }
    for (const risk of valued) {
      if (ZONES[risk.assessment.residual.zone].rank < ZONES[risk.assessment.inherent.zone].rank) movement.lowered += 1
      else movement.same += 1
    }
    const reductions = valued.map(risk => risk.assessment.reduction || 0)

    response.json({
      mapId,
      kpis: {
        total: risks.length,
        valued: valued.length,
        byType: Object.keys(RISK_TYPES).map(key => ({ type: key, value: risks.filter(risk => risk.risk_type === key).length })),
        highInherent: high('inherent'),
        highResidual: high('residual'),
        extremeResidual: valued.filter(risk => risk.assessment.residual.zone === 'EXTREMO').length,
        avgReduction: reductions.length ? Math.round(reductions.reduce((sum, value) => sum + value, 0) / reductions.length) : 0,
        controls: allControls.length,
        controlsByStrength: strength,
        controlsTested: allControls.filter(control => control.last_test_result).length,
        controlsIneffective: allControls.filter(control => control.last_test_result === 'NO_EFECTIVO').length,
        withoutControls: risks.filter(risk => risk.controls_count === 0).length,
        withoutPlan: risks.filter(risk => risk.treatment && risk.treatment !== 'ACEPTAR' && risk.actions.total === 0).length,
        withoutTreatment: risks.filter(risk => !risk.treatment).length,
        reviewedThisPeriod: risks.filter(risk => risk.last_review?.period_label === currentPeriod).length,
        currentPeriod,
        movement,
        materializations: { ...matTotals.rows[0], loss: Number(matTotals.rows[0].loss), open: matStatus.rows.filter(row => row.status !== 'CERRADA').reduce((sum, row) => sum + row.total, 0) },
        actions: actionsAgg.rows[0],
      },
      zones: { inherent: zoneCount('inherent'), residual: zoneCount('residual') },
      heat,
      byProcess: [...byProcessMap.values()].sort((a, b) => b.total - a.total),
      materializationTimeline: months.map(month => ({ month, total: matByMonth.get(month) || 0 })),
      materializationStatus: MATERIALIZATION_STATUS.map(status => ({ status, total: matStatus.rows.find(row => row.status === status)?.total || 0 })),
      topRisks: valued
        .slice()
        .sort((a, b) => b.assessment.residual.score - a.assessment.residual.score || b.assessment.inherent.score - a.assessment.inherent.score)
        .slice(0, 6)
        .map(risk => ({ id: risk.id, code: risk.code, description: risk.description, process_name: risk.process_name, risk_type: risk.risk_type, assessment: risk.assessment, materializations: risk.materializations })),
    })
  } catch (error) { next(error) }
})

// ---------------------------------------------------------------------------
// Riesgos
// ---------------------------------------------------------------------------

risksRouter.get('/risks', risksModule, view, async (request, response, next) => {
  try {
    const mapId = await resolveMapId(request)
    if (!mapId) return response.json({ mapId: null, rows: [] })
    let rows = await loadRisks(oid(request), mapId)
    const q = String(request.query.q || '').trim().toLowerCase()
    const { processId, riskType, classId, zone, inherentZone, treatment, status } = request.query
    rows = rows.filter(risk =>
      (!processId || String(risk.process_id) === String(processId))
      && (!riskType || risk.risk_type === riskType)
      && (!classId || String(risk.class_id) === String(classId))
      && (!zone || risk.assessment.residual?.zone === zone)
      && (!inherentZone || risk.assessment.inherent?.zone === inherentZone)
      && (!treatment || (treatment === 'SIN' ? !risk.treatment : risk.treatment === treatment))
      && (!status || risk.status === status)
      && (!q || `${risk.code} ${risk.description} ${risk.process_name} ${risk.owner_label}`.toLowerCase().includes(q)))
    response.json({ mapId, rows: rows.map(stripInternal) })
  } catch (error) { next(error) }
})

/** Normaliza el cuerpo de identificacion/valoracion de un riesgo (alta y edicion). */
function riskPayload(body, existing = {}) {
  const riskType = body.riskType ?? existing.risk_type ?? 'GESTION'
  oneOf(riskType, Object.keys(RISK_TYPES), 'Tipo de riesgo inválido')
  const answers = Array.isArray(body.corruptionAnswers) ? body.corruptionAnswers.slice(0, 19).map(Boolean)
    : (existing.corruption_answers || [])
  const exposure = body.exposurePerYear !== undefined ? optionalNumber(body.exposurePerYear) : (existing.exposure_per_year ?? null)
  // La probabilidad sale de la exposicion cuando se conoce (es lo que pide la guia); el nivel
  // manual queda para los casos sin un conteo de ejecuciones (ej. seguridad digital).
  const probability = exposure !== null ? probabilityFromFrequency(exposure)
    : (body.inherentProbability !== undefined ? level(body.inherentProbability) : existing.inherent_probability ?? null)
  // Corrupcion: el impacto lo fija el cuestionario, nunca la eleccion manual (y nunca baja de Moderado).
  const impact = riskType === 'CORRUPCION' ? corruptionImpact(answers)
    : (body.inherentImpact !== undefined ? level(body.inherentImpact) : existing.inherent_impact ?? null)
  const treatment = body.treatment !== undefined ? (body.treatment || null) : (existing.treatment ?? null)
  if (treatment) oneOf(treatment, Object.keys(TREATMENTS), 'Tratamiento inválido')
  if (riskType === 'CORRUPCION' && treatment === 'ACEPTAR') fail(400, 'Un riesgo de corrupción no puede aceptarse: la guía exige tratarlo siempre')
  const cia = Array.isArray(body.cia) ? body.cia.filter(item => ['C', 'I', 'D'].includes(item)) : (existing.cia || [])
  const criterion = body.impactCriterion !== undefined ? String(body.impactCriterion || '') : (existing.impact_criterion || '')
  oneOf(criterion, ['', 'ECONOMICO', 'REPUTACIONAL', 'SALUD'], 'Criterio de impacto inválido')
  const pick = (key, column, max) => body[key] !== undefined ? text(body[key], max) : (existing[column] ?? '')
  return {
    risk_type: riskType,
    typology: pick('typology', 'typology', 200),
    impact_statement: pick('impactStatement', 'impact_statement', 500),
    cause_immediate: pick('causeImmediate', 'cause_immediate', 1000),
    cause_root: pick('causeRoot', 'cause_root', 1000),
    description: pick('description', 'description', 3000),
    consequences: pick('consequences', 'consequences', 3000),
    process_objective: pick('processObjective', 'process_objective', 2000),
    asset: pick('asset', 'asset', 500),
    threat: pick('threat', 'threat', 500),
    vulnerability: pick('vulnerability', 'vulnerability', 500),
    cia,
    exposure_per_year: exposure,
    inherent_probability: probability,
    inherent_impact: impact,
    impact_criterion: criterion,
    corruption_answers: JSON.stringify(answers),
    treatment,
    treatment_justification: pick('treatmentJustification', 'treatment_justification', 2000),
    owner_name: pick('ownerName', 'owner_name', 200),
  }
}

risksRouter.post('/risks', risksModule, edit, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const body = request.body || {}
    if (!numericId(body.mapId) || !numericId(body.processId)) fail(400, 'Elige el mapa y el proceso del riesgo')
    const payload = riskPayload(body)
    if (!payload.description) fail(400, 'La descripción del riesgo es obligatoria')
    await client.query('BEGIN')
    const map = await client.query('SELECT id, year, active FROM risk_maps WHERE id = $1 AND organization_id = $2', [body.mapId, oid(request)])
    if (!map.rows[0]) fail(404, 'Mapa no encontrado')
    if (!map.rows[0].active) fail(409, 'El mapa está cerrado: no admite riesgos nuevos')
    const process = await client.query('SELECT id, code FROM institutional_processes WHERE id = $1 AND organization_id = $2', [body.processId, oid(request)])
    if (!process.rows[0]) fail(400, 'El proceso no pertenece a la entidad')
    let classId = null
    if (body.classId) {
      if (!numericId(body.classId)) fail(400, 'Clase inválida')
      const found = await client.query('SELECT id FROM risk_classes WHERE id = $1 AND organization_id = $2', [body.classId, oid(request)])
      if (!found.rows[0]) fail(400, 'La clase de riesgo no pertenece a la entidad')
      classId = found.rows[0].id
    }
    const owner = await assertMembership(client, request, body.ownerMembershipId)
    // Consecutivo por mapa y proceso, serializado: dos altas simultaneas del mismo proceso no
    // pueden leer el mismo maximo.
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [Number(map.rows[0].id) * 100000 + Number(process.rows[0].id)])
    const seq = await client.query('SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM risks WHERE map_id = $1 AND process_id = $2', [map.rows[0].id, process.rows[0].id])
    const sequence = seq.rows[0].next
    const code = `R${map.rows[0].year}-${process.rows[0].code}-${String(sequence).padStart(3, '0')}`
    const inserted = await client.query(
      `INSERT INTO risks (organization_id, map_id, process_id, code, sequence, risk_type, class_id, typology, impact_statement,
         cause_immediate, cause_root, description, consequences, process_objective, asset, threat, vulnerability, cia,
         exposure_per_year, inherent_probability, inherent_impact, impact_criterion, corruption_answers, treatment,
         treatment_justification, owner_membership_id, owner_name, created_by_id, updated_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$28)
       RETURNING id`,
      [oid(request), map.rows[0].id, process.rows[0].id, code, sequence, payload.risk_type, classId, payload.typology, payload.impact_statement,
        payload.cause_immediate, payload.cause_root, payload.description, payload.consequences, payload.process_objective, payload.asset,
        payload.threat, payload.vulnerability, payload.cia, payload.exposure_per_year, payload.inherent_probability, payload.inherent_impact,
        payload.impact_criterion, payload.corruption_answers, payload.treatment, payload.treatment_justification, owner?.id || null,
        payload.owner_name || owner?.full_name || '', uid(request)],
    )
    const riskId = inserted.rows[0].id
    // Las causas de la redaccion quedan registradas como causas del riesgo, para que la matriz
    // control-causa nazca con algo a que asociar los controles.
    let order = 0
    if (payload.cause_root) await client.query('INSERT INTO risk_causes (risk_id, kind, description, order_index) VALUES ($1,$2,$3,$4)', [riskId, 'RAIZ', payload.cause_root, order++])
    if (payload.cause_immediate) await client.query('INSERT INTO risk_causes (risk_id, kind, description, order_index) VALUES ($1,$2,$3,$4)', [riskId, 'INMEDIATA', payload.cause_immediate, order++])
    await logActivity(client, riskId, uid(request), 'CREADO', `Riesgo ${code} identificado`)
    await client.query('COMMIT')
    response.status(201).json({ id: riskId, code })
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})

risksRouter.get('/risks/:id', risksModule, view, async (request, response, next) => {
  try {
    const base = await assertRisk({ query }, request)
    const [loaded] = await loadRisks(oid(request), base.map_id, [base.id])
    const [causes, tests, actions, materializations, reviews, activity] = await Promise.all([
      query('SELECT * FROM risk_causes WHERE risk_id = $1 ORDER BY order_index, id', [base.id]),
      query(
        `SELECT t.*, u.full_name AS tester_name FROM risk_control_tests t JOIN risk_controls c ON c.id = t.control_id
         LEFT JOIN users u ON u.id = t.tester_id WHERE c.risk_id = $1 ORDER BY t.tested_at DESC, t.id DESC`, [base.id]),
      query(
        `SELECT a.*, COALESCE(NULLIF(a.responsible_name, ''), u.full_name, '') AS responsible_label,
                (a.status NOT IN ('TERMINADA','CANCELADA') AND a.due_date < CURRENT_DATE) AS overdue
         FROM risk_actions a LEFT JOIN memberships m ON m.id = a.responsible_membership_id LEFT JOIN users u ON u.id = m.user_id
         WHERE a.risk_id = $1 ORDER BY a.kind, a.due_date NULLS LAST, a.id`, [base.id]),
      query(
        `SELECT mt.*, ru.full_name AS reported_by_name, cu.full_name AS closed_by_name
         FROM risk_materializations mt LEFT JOIN users ru ON ru.id = mt.reported_by_id LEFT JOIN users cu ON cu.id = mt.closed_by_id
         WHERE mt.risk_id = $1 ORDER BY mt.occurred_at DESC, mt.id DESC`, [base.id]),
      query('SELECT rv.*, u.full_name AS author_name FROM risk_reviews rv LEFT JOIN users u ON u.id = rv.author_id WHERE rv.risk_id = $1 ORDER BY rv.created_at DESC', [base.id]),
      query('SELECT a.*, u.full_name AS actor_name FROM risk_activity a LEFT JOIN users u ON u.id = a.actor_id WHERE a.risk_id = $1 ORDER BY a.created_at DESC LIMIT 200', [base.id]),
    ])
    const testsByControl = groupBy(tests.rows, row => row.control_id)
    response.json({
      risk: stripInternal(loaded),
      causes: causes.rows,
      controls: loaded._controls.map(control => ({ ...control, weight: controlWeight(control), strength: controlStrength(controlWeight(control)), tests: testsByControl.get(control.id) || [] })),
      actions: actions.rows,
      materializations: materializations.rows,
      reviews: reviews.rows,
      activity: activity.rows,
    })
  } catch (error) { next(error) }
})

risksRouter.patch('/risks/:id', risksModule, edit, async (request, response, next) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existing = await assertRisk(client, request)
    const body = request.body || {}
    const payload = riskPayload(body, existing)
    if (!payload.description) fail(400, 'La descripción del riesgo es obligatoria')
    const sets = []
    const params = []
    const changed = []
    const push = (column, value, label) => {
      params.push(value); sets.push(`${column} = $${params.length}`)
      if (label) changed.push(label)
    }
    for (const [column, value] of Object.entries(payload)) {
      const before = column === 'corruption_answers' ? JSON.stringify(existing.corruption_answers || []) : existing[column]
      const same = Array.isArray(value) ? JSON.stringify(value) === JSON.stringify(before || []) : String(value ?? '') === String(before ?? '')
      if (!same) push(column, value, column)
    }
    if (body.processId !== undefined && String(body.processId) !== String(existing.process_id)) {
      if (!numericId(body.processId)) fail(400, 'Proceso inválido')
      const process = await client.query('SELECT id FROM institutional_processes WHERE id = $1 AND organization_id = $2', [body.processId, oid(request)])
      if (!process.rows[0]) fail(400, 'El proceso no pertenece a la entidad')
      push('process_id', process.rows[0].id, 'proceso')
    }
    if (body.classId !== undefined && String(body.classId || '') !== String(existing.class_id || '')) {
      let classId = null
      if (body.classId) {
        if (!numericId(body.classId)) fail(400, 'Clase inválida')
        const found = await client.query('SELECT id FROM risk_classes WHERE id = $1 AND organization_id = $2', [body.classId, oid(request)])
        if (!found.rows[0]) fail(400, 'La clase de riesgo no pertenece a la entidad')
        classId = found.rows[0].id
      }
      push('class_id', classId, 'clase')
    }
    if (body.ownerMembershipId !== undefined && String(body.ownerMembershipId || '') !== String(existing.owner_membership_id || '')) {
      const owner = await assertMembership(client, request, body.ownerMembershipId)
      push('owner_membership_id', owner?.id || null, 'responsable')
    }
    if (body.status !== undefined && body.status !== existing.status) push('status', oneOf(body.status, ['ACTIVO', 'RETIRADO'], 'Estado inválido'), 'estado')
    if (!sets.length) { await client.query('ROLLBACK'); return response.json({ ok: true, unchanged: true }) }
    push('updated_by_id', uid(request))
    params.push(existing.id)
    await client.query(`UPDATE risks SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params)
    const valuation = ['inherent_probability', 'inherent_impact'].filter(key => changed.includes(key))
    await logActivity(client, existing.id, uid(request), valuation.length ? 'REVALORADO' : 'ACTUALIZADO',
      valuation.length
        ? `Inherente: ${probabilityLevel(existing.inherent_probability)?.name || '—'} / ${impactLevel(existing.inherent_impact)?.name || '—'} → ${probabilityLevel(payload.inherent_probability)?.name || '—'} / ${impactLevel(payload.inherent_impact)?.name || '—'}`
        : `Campos: ${changed.join(', ')}`)
    await client.query('COMMIT')
    response.json({ ok: true })
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})

// Eliminar es borrado logico y exclusivo de la administracion (segunda linea): un riesgo con
// historia (controles probados, materializaciones) no debe desaparecer por un clic de captura.
risksRouter.delete('/risks/:id', risksModule, manage, async (request, response, next) => {
  try {
    const risk = await assertRisk({ query }, request)
    await query('UPDATE risks SET deleted_at = NOW(), deleted_by_id = $2 WHERE id = $1', [risk.id, uid(request)])
    await logActivity({ query }, risk.id, uid(request), 'ELIMINADO', `Riesgo ${risk.code} eliminado`)
    response.json({ ok: true })
  } catch (error) { next(error) }
})

// ---------------------------------------------------------------------------
// Causas
// ---------------------------------------------------------------------------

async function assertChild(db, request, table, id, label) {
  if (!numericId(id)) fail(404, `${label} no encontrado`)
  const result = await db.query(
    `SELECT x.*, r.organization_id FROM ${table} x JOIN risks r ON r.id = x.risk_id WHERE x.id = $1 AND r.organization_id = $2 AND r.deleted_at IS NULL`,
    [id, oid(request)],
  )
  if (!result.rows[0]) fail(404, `${label} no encontrado`)
  return result.rows[0]
}

risksRouter.post('/risks/:id/causes', risksModule, edit, async (request, response, next) => {
  try {
    const risk = await assertRisk({ query }, request)
    const description = text(request.body?.description, 1000)
    if (!description) fail(400, 'Describe la causa')
    const kind = oneOf(request.body?.kind || 'RAIZ', ['RAIZ', 'INMEDIATA'], 'Tipo de causa inválido')
    const result = await query(
      `INSERT INTO risk_causes (risk_id, kind, description, order_index)
       VALUES ($1,$2,$3,(SELECT COALESCE(MAX(order_index), -1) + 1 FROM risk_causes WHERE risk_id = $1)) RETURNING *`,
      [risk.id, kind, description])
    await logActivity({ query }, risk.id, uid(request), 'CAUSA_AGREGADA', description)
    response.status(201).json(result.rows[0])
  } catch (error) { next(error) }
})

risksRouter.patch('/causes/:id', risksModule, edit, async (request, response, next) => {
  try {
    const cause = await assertChild({ query }, request, 'risk_causes', request.params.id, 'Causa')
    const description = request.body?.description !== undefined ? text(request.body.description, 1000) : cause.description
    if (!description) fail(400, 'Describe la causa')
    const kind = request.body?.kind ? oneOf(request.body.kind, ['RAIZ', 'INMEDIATA'], 'Tipo de causa inválido') : cause.kind
    const result = await query('UPDATE risk_causes SET description = $2, kind = $3 WHERE id = $1 RETURNING *', [cause.id, description, kind])
    response.json(result.rows[0])
  } catch (error) { next(error) }
})

risksRouter.delete('/causes/:id', risksModule, edit, async (request, response, next) => {
  try {
    const cause = await assertChild({ query }, request, 'risk_causes', request.params.id, 'Causa')
    await query('DELETE FROM risk_causes WHERE id = $1', [cause.id])
    await logActivity({ query }, cause.risk_id, uid(request), 'CAUSA_ELIMINADA', cause.description)
    response.json({ ok: true })
  } catch (error) { next(error) }
})

// ---------------------------------------------------------------------------
// Controles y pruebas de efectividad
// ---------------------------------------------------------------------------

function controlPayload(body, existing = {}) {
  const value = (key, column, fallback) => body[key] !== undefined ? body[key] : (existing[column] ?? fallback)
  const description = text(value('description', 'description', ''), 2000)
  if (!description) fail(400, 'Redacta el control: responsable, acción y complemento')
  return {
    description,
    responsible: text(value('responsible', 'responsible', ''), 200),
    control_type: oneOf(value('controlType', 'control_type', ''), Object.keys(CONTROL_TYPES), 'Elige el tipo de control: preventivo, detectivo o correctivo'),
    implementation: oneOf(value('implementation', 'implementation', ''), Object.keys(CONTROL_IMPLEMENTATIONS), 'Elige la implementación: automática o manual'),
    documentation: oneOf(value('documentation', 'documentation', 'DOCUMENTADO'), ['DOCUMENTADO', 'SIN_DOCUMENTAR'], 'Documentación inválida'),
    frequency: oneOf(value('frequency', 'frequency', 'CONTINUA'), ['CONTINUA', 'ALEATORIA'], 'Frecuencia inválida'),
    evidence: oneOf(value('evidence', 'evidence', 'CON_REGISTRO'), ['CON_REGISTRO', 'SIN_REGISTRO'], 'Evidencia inválida'),
    active: body.active !== undefined ? Boolean(body.active) : (existing.active ?? true),
  }
}

async function resolveCause(db, riskId, causeId) {
  if (!causeId) return null
  if (!numericId(causeId)) fail(400, 'Causa inválida')
  const found = await db.query('SELECT id FROM risk_causes WHERE id = $1 AND risk_id = $2', [causeId, riskId])
  if (!found.rows[0]) fail(400, 'La causa no pertenece a este riesgo')
  return found.rows[0].id
}

risksRouter.post('/risks/:id/controls', risksModule, edit, async (request, response, next) => {
  try {
    const risk = await assertRisk({ query }, request)
    const payload = controlPayload(request.body || {})
    const causeId = await resolveCause({ query }, risk.id, request.body?.causeId)
    const result = await query(
      `INSERT INTO risk_controls (risk_id, cause_id, description, responsible, control_type, implementation, documentation, frequency, evidence, active, order_index, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,(SELECT COALESCE(MAX(order_index), -1) + 1 FROM risk_controls WHERE risk_id = $1),$11) RETURNING *`,
      [risk.id, causeId, payload.description, payload.responsible, payload.control_type, payload.implementation, payload.documentation, payload.frequency, payload.evidence, payload.active, uid(request)])
    await logActivity({ query }, risk.id, uid(request), 'CONTROL_AGREGADO', `${CONTROL_TYPES[payload.control_type].name} ${CONTROL_IMPLEMENTATIONS[payload.implementation].name.toLowerCase()} (${controlWeight(payload)}%): ${payload.description.slice(0, 160)}`)
    response.status(201).json(result.rows[0])
  } catch (error) { next(error) }
})

risksRouter.patch('/controls/:id', risksModule, edit, async (request, response, next) => {
  try {
    const control = await assertChild({ query }, request, 'risk_controls', request.params.id, 'Control')
    const payload = controlPayload(request.body || {}, control)
    const causeId = request.body?.causeId !== undefined ? await resolveCause({ query }, control.risk_id, request.body.causeId) : control.cause_id
    const result = await query(
      `UPDATE risk_controls SET cause_id = $2, description = $3, responsible = $4, control_type = $5, implementation = $6,
         documentation = $7, frequency = $8, evidence = $9, active = $10, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [control.id, causeId, payload.description, payload.responsible, payload.control_type, payload.implementation, payload.documentation, payload.frequency, payload.evidence, payload.active])
    await logActivity({ query }, control.risk_id, uid(request), 'CONTROL_EDITADO', payload.description.slice(0, 200))
    response.json(result.rows[0])
  } catch (error) { next(error) }
})

risksRouter.delete('/controls/:id', risksModule, edit, async (request, response, next) => {
  try {
    const control = await assertChild({ query }, request, 'risk_controls', request.params.id, 'Control')
    await query('DELETE FROM risk_controls WHERE id = $1', [control.id])
    await logActivity({ query }, control.risk_id, uid(request), 'CONTROL_ELIMINADO', control.description.slice(0, 200))
    response.json({ ok: true })
  } catch (error) { next(error) }
})

risksRouter.post('/controls/:id/tests', risksModule, review, async (request, response, next) => {
  try {
    const control = await assertChild({ query }, request, 'risk_controls', request.params.id, 'Control')
    const body = request.body || {}
    const result = oneOf(body.result, TEST_RESULTS, 'Resultado inválido: efectivo, parcial o no efectivo')
    const line = oneOf(body.defenseLine || 'TERCERA', DEFENSE_LINES, 'Línea de defensa inválida')
    const observations = text(body.observations, 3000)
    if (result !== 'EFECTIVO' && !observations) fail(400, 'Explica qué falló en el control: es lo que el líder del proceso debe corregir')
    const inserted = await query(
      `INSERT INTO risk_control_tests (control_id, tested_at, result, defense_line, observations, tester_id) VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, $4, $5, $6) RETURNING *`,
      [control.id, optionalDate(body.testedAt), result, line, observations, uid(request)])
    await logActivity({ query }, control.risk_id, uid(request), 'CONTROL_PROBADO', `${result.replace('_', ' ')}: ${control.description.slice(0, 140)}`)
    response.status(201).json(inserted.rows[0])
  } catch (error) { next(error) }
})

// ---------------------------------------------------------------------------
// Plan de accion (tratamiento y correctivas)
// ---------------------------------------------------------------------------

risksRouter.get('/actions', risksModule, view, async (request, response, next) => {
  try {
    const mapId = await resolveMapId(request)
    if (!mapId) return response.json({ rows: [] })
    const params = [oid(request), mapId]
    const where = ['r.organization_id = $1', 'r.map_id = $2', 'r.deleted_at IS NULL']
    if (request.query.status === 'VENCIDA') where.push(`a.status NOT IN ('TERMINADA','CANCELADA') AND a.due_date < CURRENT_DATE`)
    else if (request.query.status) { params.push(request.query.status); where.push(`a.status = $${params.length}`) }
    if (request.query.kind) { params.push(request.query.kind); where.push(`a.kind = $${params.length}`) }
    if (request.query.processId && numericId(request.query.processId)) { params.push(request.query.processId); where.push(`r.process_id = $${params.length}`) }
    const result = await query(
      `SELECT a.*, r.code AS risk_code, r.description AS risk_description, r.risk_type, p.name AS process_name,
              COALESCE(NULLIF(a.responsible_name, ''), u.full_name, '') AS responsible_label,
              mt.code AS materialization_code,
              (a.status NOT IN ('TERMINADA','CANCELADA') AND a.due_date < CURRENT_DATE) AS overdue
       FROM risk_actions a JOIN risks r ON r.id = a.risk_id JOIN institutional_processes p ON p.id = r.process_id
       LEFT JOIN memberships m ON m.id = a.responsible_membership_id LEFT JOIN users u ON u.id = m.user_id
       LEFT JOIN risk_materializations mt ON mt.id = a.materialization_id
       WHERE ${where.join(' AND ')}
       ORDER BY (a.status IN ('TERMINADA','CANCELADA')), a.due_date NULLS LAST, a.id`, params)
    response.json({ rows: result.rows })
  } catch (error) { next(error) }
})

async function actionPayload(db, request, body, existing = {}) {
  const description = body.description !== undefined ? text(body.description, 2000) : existing.description
  if (!description) fail(400, 'Describe la acción')
  const status = body.status !== undefined ? oneOf(body.status, ACTION_STATUS, 'Estado inválido') : (existing.status || 'PENDIENTE')
  let progress = body.progress !== undefined ? Math.round(Number(body.progress)) : (existing.progress ?? 0)
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) fail(400, 'El avance va de 0 a 100')
  if (status === 'TERMINADA') progress = 100
  const startDate = body.startDate !== undefined ? optionalDate(body.startDate) : (existing.start_date || null)
  const dueDate = body.dueDate !== undefined ? optionalDate(body.dueDate) : (existing.due_date || null)
  if (startDate && dueDate && String(dueDate) < String(startDate)) fail(400, 'La fecha final no puede ser anterior a la inicial')
  const evidence = body.evidence !== undefined ? text(body.evidence, 3000) : (existing.evidence || '')
  if (status === 'TERMINADA' && !evidence) fail(400, 'Para terminar la acción registra la evidencia de su cumplimiento')
  let responsibleId = existing.responsible_membership_id ?? null
  if (body.responsibleMembershipId !== undefined) responsibleId = (await assertMembership(db, request, body.responsibleMembershipId))?.id || null
  return {
    description, status, progress, start_date: startDate, due_date: dueDate, evidence,
    responsible_membership_id: responsibleId,
    responsible_name: body.responsibleName !== undefined ? text(body.responsibleName, 200) : (existing.responsible_name || ''),
  }
}

risksRouter.post('/risks/:id/actions', risksModule, edit, async (request, response, next) => {
  try {
    const risk = await assertRisk({ query }, request)
    const body = request.body || {}
    const payload = await actionPayload({ query }, request, body)
    let materializationId = null
    let kind = 'TRATAMIENTO'
    if (body.materializationId) {
      if (!numericId(body.materializationId)) fail(400, 'Materialización inválida')
      const found = await query('SELECT id FROM risk_materializations WHERE id = $1 AND risk_id = $2', [body.materializationId, risk.id])
      if (!found.rows[0]) fail(400, 'La materialización no pertenece a este riesgo')
      materializationId = found.rows[0].id
      kind = 'CORRECTIVA'
    }
    const result = await query(
      `INSERT INTO risk_actions (organization_id, risk_id, materialization_id, kind, description, responsible_membership_id, responsible_name,
         start_date, due_date, status, progress, evidence, completed_at, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, CASE WHEN $10 = 'TERMINADA' THEN NOW() END, $13) RETURNING *`,
      [oid(request), risk.id, materializationId, kind, payload.description, payload.responsible_membership_id, payload.responsible_name,
        payload.start_date, payload.due_date, payload.status, payload.progress, payload.evidence, uid(request)])
    await logActivity({ query }, risk.id, uid(request), kind === 'CORRECTIVA' ? 'ACCION_CORRECTIVA' : 'ACCION_AGREGADA', payload.description.slice(0, 200))
    response.status(201).json(result.rows[0])
  } catch (error) { next(error) }
})

risksRouter.patch('/actions/:id', risksModule, edit, async (request, response, next) => {
  try {
    const action = await assertChild({ query }, request, 'risk_actions', request.params.id, 'Acción')
    const payload = await actionPayload({ query }, request, request.body || {}, action)
    const result = await query(
      `UPDATE risk_actions SET description = $2, status = $3, progress = $4, start_date = $5, due_date = $6, evidence = $7,
         responsible_membership_id = $8, responsible_name = $9,
         completed_at = CASE WHEN $3 = 'TERMINADA' THEN COALESCE(completed_at, NOW()) ELSE NULL END, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [action.id, payload.description, payload.status, payload.progress, payload.start_date, payload.due_date, payload.evidence, payload.responsible_membership_id, payload.responsible_name])
    if (payload.status !== action.status) await logActivity({ query }, action.risk_id, uid(request), 'ACCION_ESTADO', `${action.code}: ${action.status} → ${payload.status}`)
    response.json(result.rows[0])
  } catch (error) { next(error) }
})

risksRouter.delete('/actions/:id', risksModule, edit, async (request, response, next) => {
  try {
    const action = await assertChild({ query }, request, 'risk_actions', request.params.id, 'Acción')
    await query('DELETE FROM risk_actions WHERE id = $1', [action.id])
    await logActivity({ query }, action.risk_id, uid(request), 'ACCION_ELIMINADA', action.description.slice(0, 200))
    response.json({ ok: true })
  } catch (error) { next(error) }
})

// ---------------------------------------------------------------------------
// Materializacion
// ---------------------------------------------------------------------------

risksRouter.get('/materializations', risksModule, view, async (request, response, next) => {
  try {
    const mapId = await resolveMapId(request)
    if (!mapId) return response.json({ rows: [] })
    const params = [oid(request), mapId]
    const where = ['r.organization_id = $1', 'r.map_id = $2', 'r.deleted_at IS NULL']
    if (request.query.status === 'ABIERTA') where.push(`mt.status <> 'CERRADA'`)
    else if (request.query.status) { params.push(request.query.status); where.push(`mt.status = $${params.length}`) }
    const result = await query(
      `SELECT mt.*, r.code AS risk_code, r.description AS risk_description, r.risk_type, p.name AS process_name,
              ru.full_name AS reported_by_name,
              (SELECT COUNT(*)::int FROM risk_actions a WHERE a.materialization_id = mt.id) AS actions_total,
              (SELECT COUNT(*)::int FROM risk_actions a WHERE a.materialization_id = mt.id AND a.status = 'TERMINADA') AS actions_done
       FROM risk_materializations mt JOIN risks r ON r.id = mt.risk_id JOIN institutional_processes p ON p.id = r.process_id
       LEFT JOIN users ru ON ru.id = mt.reported_by_id
       WHERE ${where.join(' AND ')}
       ORDER BY (mt.status = 'CERRADA'), mt.occurred_at DESC, mt.id DESC`, params)
    response.json({ rows: result.rows })
  } catch (error) { next(error) }
})

function materializationFields(body, existing = {}) {
  const pickText = (key, column, max) => body[key] !== undefined ? text(body[key], max) : (existing[column] || '')
  const failed = body.failedControlIds !== undefined
    ? (Array.isArray(body.failedControlIds) ? body.failedControlIds.filter(numericId).map(Number) : [])
    : (existing.failed_control_ids || [])
  const parties = body.notifiedParties !== undefined
    ? (Array.isArray(body.notifiedParties) ? body.notifiedParties.filter(item => NOTIFIABLE_PARTIES.includes(item)) : [])
    : (existing.notified_parties || [])
  return {
    occurred_at: body.occurredAt !== undefined ? optionalDate(body.occurredAt) : existing.occurred_at,
    detected_at: body.detectedAt !== undefined ? optionalDate(body.detectedAt) : (existing.detected_at || null),
    description: pickText('description', 'description', 4000),
    consequences: pickText('consequences', 'consequences', 4000),
    economic_loss: body.economicLoss !== undefined ? optionalNumber(body.economicLoss) : (existing.economic_loss ?? null),
    affected_people: body.affectedPeople !== undefined ? (optionalNumber(body.affectedPeople) === null ? null : Math.round(Number(body.affectedPeople))) : (existing.affected_people ?? null),
    actual_impact: body.actualImpact !== undefined ? level(body.actualImpact) : (existing.actual_impact ?? null),
    root_cause: pickText('rootCause', 'root_cause', 4000),
    failed_control_ids: failed,
    immediate_correction: pickText('immediateCorrection', 'immediate_correction', 4000),
    notified_parties: parties,
  }
}

risksRouter.post('/risks/:id/materializations', risksModule, materialize, async (request, response, next) => {
  try {
    const risk = await assertRisk({ query }, request)
    const fields = materializationFields(request.body || {})
    if (!fields.occurred_at) fail(400, 'Indica la fecha en que ocurrió el evento')
    if (!fields.description) fail(400, 'Describe qué ocurrió')
    if (fields.detected_at && fields.detected_at < fields.occurred_at) fail(400, 'La detección no puede ser anterior a la ocurrencia')
    const result = await query(
      `INSERT INTO risk_materializations (organization_id, risk_id, occurred_at, detected_at, description, consequences, economic_loss,
         affected_people, actual_impact, root_cause, failed_control_ids, immediate_correction, notified_parties, prev_probability, prev_impact, reported_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [oid(request), risk.id, fields.occurred_at, fields.detected_at, fields.description, fields.consequences, fields.economic_loss,
        fields.affected_people, fields.actual_impact, fields.root_cause, fields.failed_control_ids, fields.immediate_correction,
        fields.notified_parties, risk.inherent_probability, risk.inherent_impact, uid(request)])
    await logActivity({ query }, risk.id, uid(request), 'MATERIALIZADO', `${result.rows[0].code}: ${fields.description.slice(0, 180)}`)
    response.status(201).json(result.rows[0])
  } catch (error) { next(error) }
})

risksRouter.patch('/materializations/:id', risksModule, materialize, async (request, response, next) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existing = await assertChild(client, request, 'risk_materializations', request.params.id, 'Materialización')
    if (existing.status === 'CERRADA' && request.body?.status !== 'EN_TRATAMIENTO') fail(409, 'La materialización está cerrada. Reábrela para editarla')
    const body = request.body || {}
    const fields = materializationFields(body, existing)
    if (!fields.description) fail(400, 'Describe qué ocurrió')
    const risk = await client.query('SELECT id, risk_type, inherent_probability, inherent_impact FROM risks WHERE id = $1', [existing.risk_id])

    // Revaluacion: el riesgo se materializo, asi que la valoracion previa se revisa y el mapa se
    // actualiza con los nuevos niveles (que pueden ser los mismos, si el analisis lo justifica).
    let revaluation = null
    if (body.revaluation) {
      const newProbability = level(body.revaluation.probability)
      const newImpact = risk.rows[0].risk_type === 'CORRUPCION' ? risk.rows[0].inherent_impact : level(body.revaluation.impact)
      const note = text(body.revaluation.note, 2000)
      if (!newProbability || !newImpact) fail(400, 'Indica la nueva probabilidad e impacto del riesgo')
      if (!note) fail(400, 'Justifica la revaluación: qué cambió en el análisis después del evento')
      revaluation = { newProbability, newImpact, note }
      // Si la nueva probabilidad sale de la exposicion, se descarta el conteo anterior: el mapa
      // queda con el nivel revaluado de forma explicita.
      await client.query('UPDATE risks SET inherent_probability = $2, inherent_impact = $3, exposure_per_year = NULL, updated_by_id = $4, updated_at = NOW() WHERE id = $1',
        [existing.risk_id, newProbability, newImpact, uid(request)])
      await logActivity(client, existing.risk_id, uid(request), 'REVALORADO',
        `Por ${existing.code}: ${probabilityLevel(risk.rows[0].inherent_probability)?.name || '—'} / ${impactLevel(risk.rows[0].inherent_impact)?.name || '—'} → ${probabilityLevel(newProbability).name} / ${impactLevel(newImpact).name}. ${note}`)
    }

    const status = body.status !== undefined ? oneOf(body.status, MATERIALIZATION_STATUS, 'Estado inválido') : existing.status
    const revaluedAt = revaluation ? new Date() : existing.revalued_at
    if (status === 'CERRADA' && existing.status !== 'CERRADA') {
      if (!fields.root_cause) fail(400, 'Para cerrar registra el análisis de causa raíz')
      if (!revaluedAt) fail(400, 'Para cerrar revalúa el riesgo: si se materializó, la valoración anterior se revisa (guía DAFP)')
      const openActions = await client.query(`SELECT COUNT(*)::int AS open FROM risk_actions WHERE materialization_id = $1 AND status NOT IN ('TERMINADA','CANCELADA')`, [existing.id])
      if (openActions.rows[0].open) fail(400, `Hay ${openActions.rows[0].open} acción(es) correctiva(s) abierta(s). Ciérralas antes de cerrar el evento`)
      if (risk.rows[0].risk_type === 'CORRUPCION' && !fields.notified_parties.some(party => EXTERNAL_AUTHORITIES.includes(party))) {
        fail(400, 'Un hecho de corrupción materializado debe informarse a la autoridad competente (Fiscalía, Procuraduría, Contraloría u otro ente) antes de cerrarse')
      }
    }
    const closureNotes = body.closureNotes !== undefined ? text(body.closureNotes, 3000) : existing.closure_notes
    await client.query(
      `UPDATE risk_materializations SET occurred_at = $2, detected_at = $3, description = $4, consequences = $5, economic_loss = $6,
         affected_people = $7, actual_impact = $8, root_cause = $9, failed_control_ids = $10, immediate_correction = $11,
         notified_parties = $12, status = $13, closure_notes = $14,
         new_probability = COALESCE($15, new_probability), new_impact = COALESCE($16, new_impact),
         revaluation_note = COALESCE($17, revaluation_note), revalued_at = $18,
         closed_at = CASE WHEN $13 = 'CERRADA' THEN COALESCE(closed_at, NOW()) ELSE NULL END,
         closed_by_id = CASE WHEN $13 = 'CERRADA' THEN COALESCE(closed_by_id, $19) ELSE NULL END,
         updated_at = NOW()
       WHERE id = $1`,
      [existing.id, fields.occurred_at, fields.detected_at, fields.description, fields.consequences, fields.economic_loss,
        fields.affected_people, fields.actual_impact, fields.root_cause, fields.failed_control_ids, fields.immediate_correction,
        fields.notified_parties, status, closureNotes, revaluation?.newProbability ?? null, revaluation?.newImpact ?? null,
        revaluation?.note ?? null, revaluedAt, uid(request)])
    if (status !== existing.status) await logActivity(client, existing.risk_id, uid(request), 'MATERIALIZACION_ESTADO', `${existing.code}: ${existing.status} → ${status}`)
    await client.query('COMMIT')
    response.json({ ok: true })
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})

// ---------------------------------------------------------------------------
// Seguimiento por lineas de defensa
// ---------------------------------------------------------------------------

risksRouter.post('/risks/:id/reviews', risksModule, view, async (request, response, next) => {
  try {
    const risk = await assertRisk({ query }, request)
    const line = oneOf(request.body?.defenseLine, DEFENSE_LINES, 'Línea de defensa inválida')
    // La primera linea (quien gestiona el riesgo) deja su autoevaluacion; la segunda y tercera
    // requieren el permiso de seguimiento: Control Interno no se autoevalua a si mismo.
    const permissions = request.auth.permissions || []
    if (line === 'PRIMERA' && !permissions.includes('risks.edit')) fail(403, 'La autoevaluación de primera línea la registra el líder del proceso')
    if (line !== 'PRIMERA' && !permissions.includes('risks.review') && !permissions.includes('risks.manage')) fail(403, 'No tienes permiso para registrar seguimiento de segunda o tercera línea')
    const conclusion = oneOf(request.body?.conclusion, REVIEW_CONCLUSIONS, 'Conclusión inválida')
    const observations = text(request.body?.observations, 5000)
    if (!observations) fail(400, 'Registra las observaciones del seguimiento')
    const period = cuatrimestreOf(new Date()).label
    const result = await query(
      'INSERT INTO risk_reviews (risk_id, defense_line, period_label, conclusion, observations, author_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [risk.id, line, period, conclusion, observations, uid(request)])
    await logActivity({ query }, risk.id, uid(request), 'SEGUIMIENTO', `${line} línea · ${period} · ${conclusion.replace('_', ' ')}`)
    response.status(201).json(result.rows[0])
  } catch (error) { next(error) }
})

// ---------------------------------------------------------------------------
// Mapas y clases (administracion)
// ---------------------------------------------------------------------------

risksRouter.post('/maps', risksModule, manage, async (request, response, next) => {
  try {
    const name = text(request.body?.name, 200)
    const year = Number(request.body?.year)
    if (!name) fail(400, 'Ponle nombre al mapa')
    if (!Number.isInteger(year) || year < 2000 || year > 2100) fail(400, 'Vigencia inválida')
    const result = await query(
      'INSERT INTO risk_maps (organization_id, name, year, description, created_by_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [oid(request), name, year, text(request.body?.description, 2000), uid(request)])
    response.status(201).json(result.rows[0])
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'Ya existe un mapa con ese nombre' })
    next(error)
  }
})

risksRouter.patch('/maps/:id', risksModule, manage, async (request, response, next) => {
  try {
    if (!numericId(request.params.id)) fail(404, 'Mapa no encontrado')
    const existing = await query('SELECT * FROM risk_maps WHERE id = $1 AND organization_id = $2', [request.params.id, oid(request)])
    if (!existing.rows[0]) fail(404, 'Mapa no encontrado')
    const map = existing.rows[0]
    const name = request.body?.name !== undefined ? text(request.body.name, 200) : map.name
    if (!name) fail(400, 'Ponle nombre al mapa')
    const result = await query(
      'UPDATE risk_maps SET name = $2, description = $3, active = $4, updated_at = NOW() WHERE id = $1 RETURNING *',
      [map.id, name, request.body?.description !== undefined ? text(request.body.description, 2000) : map.description,
        request.body?.active !== undefined ? Boolean(request.body.active) : map.active])
    response.json(result.rows[0])
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'Ya existe un mapa con ese nombre' })
    next(error)
  }
})

// Duplicar un mapa a la siguiente vigencia: copia riesgos, causas y controles (la identificacion
// y el diseno de controles se heredan), con codigos nuevos de la nueva vigencia. NO copia pruebas,
// acciones, materializaciones ni seguimientos: eso es historia de la vigencia anterior.
risksRouter.post('/maps/:id/duplicate', risksModule, manage, async (request, response, next) => {
  const client = await pool.connect()
  try {
    if (!numericId(request.params.id)) fail(404, 'Mapa no encontrado')
    const name = text(request.body?.name, 200)
    const year = Number(request.body?.year)
    if (!name) fail(400, 'Ponle nombre al nuevo mapa')
    if (!Number.isInteger(year) || year < 2000 || year > 2100) fail(400, 'Vigencia inválida')
    await client.query('BEGIN')
    const source = await client.query('SELECT * FROM risk_maps WHERE id = $1 AND organization_id = $2', [request.params.id, oid(request)])
    if (!source.rows[0]) fail(404, 'Mapa no encontrado')
    const created = await client.query(
      'INSERT INTO risk_maps (organization_id, name, year, description, created_by_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [oid(request), name, year, `Duplicado de «${source.rows[0].name}».`, uid(request)])
    const newMapId = created.rows[0].id
    const risks = await client.query(
      `SELECT r.*, p.code AS process_code FROM risks r JOIN institutional_processes p ON p.id = r.process_id
       WHERE r.map_id = $1 AND r.deleted_at IS NULL AND r.status = 'ACTIVO' ORDER BY p.code, r.sequence`, [source.rows[0].id])
    for (const risk of risks.rows) {
      const code = `R${year}-${risk.process_code}-${String(risk.sequence).padStart(3, '0')}`
      const inserted = await client.query(
        `INSERT INTO risks (organization_id, map_id, process_id, code, sequence, risk_type, class_id, typology, impact_statement,
           cause_immediate, cause_root, description, consequences, process_objective, asset, threat, vulnerability, cia,
           exposure_per_year, inherent_probability, inherent_impact, impact_criterion, corruption_answers, treatment,
           treatment_justification, owner_membership_id, owner_name, created_by_id, updated_by_id)
         SELECT organization_id, $2, process_id, $3, sequence, risk_type, class_id, typology, impact_statement,
           cause_immediate, cause_root, description, consequences, process_objective, asset, threat, vulnerability, cia,
           exposure_per_year, inherent_probability, inherent_impact, impact_criterion, corruption_answers, treatment,
           treatment_justification, owner_membership_id, owner_name, $4, $4
         FROM risks WHERE id = $1 RETURNING id`, [risk.id, newMapId, code, uid(request)])
      const newRiskId = inserted.rows[0].id
      const causes = await client.query('SELECT * FROM risk_causes WHERE risk_id = $1 ORDER BY order_index, id', [risk.id])
      const causeMap = new Map()
      for (const cause of causes.rows) {
        const newCause = await client.query('INSERT INTO risk_causes (risk_id, kind, description, order_index) VALUES ($1,$2,$3,$4) RETURNING id', [newRiskId, cause.kind, cause.description, cause.order_index])
        causeMap.set(String(cause.id), newCause.rows[0].id)
      }
      await client.query(
        `INSERT INTO risk_controls (risk_id, cause_id, description, responsible, control_type, implementation, documentation, frequency, evidence, active, order_index, created_by_id)
         SELECT $2, NULL, description, responsible, control_type, implementation, documentation, frequency, evidence, active, order_index, $3
         FROM risk_controls WHERE risk_id = $1 ORDER BY order_index, id`, [risk.id, newRiskId, uid(request)])
      // Reasocia cada control copiado a la causa copiada equivalente (mismo orden de insercion).
      const oldControls = await client.query('SELECT cause_id FROM risk_controls WHERE risk_id = $1 ORDER BY order_index, id', [risk.id])
      const newControls = await client.query('SELECT id FROM risk_controls WHERE risk_id = $1 ORDER BY order_index, id', [newRiskId])
      for (let i = 0; i < newControls.rows.length; i++) {
        const mapped = oldControls.rows[i]?.cause_id ? causeMap.get(String(oldControls.rows[i].cause_id)) : null
        if (mapped) await client.query('UPDATE risk_controls SET cause_id = $2 WHERE id = $1', [newControls.rows[i].id, mapped])
      }
      await logActivity(client, newRiskId, uid(request), 'CREADO', `Heredado de ${risk.code} (mapa «${source.rows[0].name}»)`)
    }
    await client.query('COMMIT')
    response.status(201).json({ ...created.rows[0], copied: risks.rows.length })
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505') return response.status(409).json({ error: 'Ya existe un mapa con ese nombre' })
    next(error)
  } finally { client.release() }
})

risksRouter.post('/classes', risksModule, manage, async (request, response, next) => {
  try {
    const name = text(request.body?.name, 120)
    if (!name) fail(400, 'Ponle nombre a la clase')
    const color = /^#[0-9a-fA-F]{6}$/.test(String(request.body?.color || '')) ? request.body.color : '#64748b'
    const result = await query(
      `INSERT INTO risk_classes (organization_id, name, color, order_index)
       VALUES ($1,$2,$3,(SELECT COALESCE(MAX(order_index), 0) + 1 FROM risk_classes WHERE organization_id = $1)) RETURNING *`,
      [oid(request), name, color])
    response.status(201).json(result.rows[0])
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'Ya existe una clase con ese nombre' })
    next(error)
  }
})

risksRouter.patch('/classes/:id', risksModule, manage, async (request, response, next) => {
  try {
    if (!numericId(request.params.id)) fail(404, 'Clase no encontrada')
    const existing = await query('SELECT * FROM risk_classes WHERE id = $1 AND organization_id = $2', [request.params.id, oid(request)])
    if (!existing.rows[0]) fail(404, 'Clase no encontrada')
    const current = existing.rows[0]
    const name = request.body?.name !== undefined ? text(request.body.name, 120) : current.name
    if (!name) fail(400, 'Ponle nombre a la clase')
    const color = request.body?.color !== undefined && /^#[0-9a-fA-F]{6}$/.test(String(request.body.color)) ? request.body.color : current.color
    const result = await query('UPDATE risk_classes SET name = $2, color = $3, active = $4 WHERE id = $1 RETURNING *',
      [current.id, name, color, request.body?.active !== undefined ? Boolean(request.body.active) : current.active])
    response.json(result.rows[0])
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'Ya existe una clase con ese nombre' })
    next(error)
  }
})

// ---------------------------------------------------------------------------
// Exportacion
// ---------------------------------------------------------------------------

function csvCell(value) {
  let safe = value == null ? '' : String(value)
  if (/^[=+\-@]/.test(safe)) safe = `'${safe}`
  return `"${safe.replaceAll('"', '""')}"`
}

risksRouter.get('/export.csv', risksModule, exportPerm, async (request, response, next) => {
  try {
    const mapId = await resolveMapId(request)
    if (!mapId) fail(404, 'No hay mapas de riesgo')
    const risks = await loadRisks(oid(request), mapId)
    const header = ['Código', 'Proceso', 'Tipo', 'Clase', 'Tipología', 'Descripción del riesgo', 'Causa raíz', 'Causa inmediata', 'Consecuencias',
      'Exposición (veces/año)', 'Probabilidad inherente', 'Impacto inherente', 'Zona inherente', 'Controles', 'Controles no efectivos',
      'Probabilidad residual', 'Impacto residual', 'Zona residual', 'Reducción por controles (%)', 'Tratamiento', 'Responsable',
      'Acciones', 'Acciones abiertas', 'Acciones vencidas', 'Avance plan (%)', 'Materializaciones', 'Estado']
    const lines = risks.map(risk => {
      const a = risk.assessment
      return [risk.code, risk.process_name, RISK_TYPES[risk.risk_type]?.name, risk.class_name || '', risk.typology, risk.description,
        risk.cause_root, risk.cause_immediate, risk.consequences, risk.exposure_per_year ?? '',
        probabilityLevel(a.inherent?.probability)?.name || '', impactLevel(a.inherent?.impact)?.name || '', ZONES[a.inherent?.zone]?.name || '',
        risk.controls_count, risk.controls_ineffective,
        probabilityLevel(a.residual?.probability)?.name || '', impactLevel(a.residual?.impact)?.name || '', ZONES[a.residual?.zone]?.name || '',
        a.reduction ?? '', TREATMENTS[risk.treatment]?.name || '', risk.owner_label,
        risk.actions.total, risk.actions.open, risk.actions.overdue, risk.actions.progress, risk.materializations.total, risk.status]
    })
    const csv = `﻿${[header, ...lines].map(row => row.map(csvCell).join(';')).join('\r\n')}`
    response.setHeader('Content-Type', 'text/csv; charset=utf-8')
    response.setHeader('Content-Disposition', `attachment; filename="matriz-riesgos-${mapId}.csv"`)
    response.send(csv)
  } catch (error) { next(error) }
})

risksRouter.get('/report.pdf', risksModule, exportPerm, async (request, response, next) => {
  try {
    const mapId = await resolveMapId(request)
    if (!mapId) fail(404, 'No hay mapas de riesgo')
    const [risks, mapResult, orgResult, mats, actions] = await Promise.all([
      loadRisks(oid(request), mapId),
      query('SELECT * FROM risk_maps WHERE id = $1', [mapId]),
      query('SELECT name FROM organizations WHERE id = $1', [oid(request)]),
      query(
        `SELECT mt.*, r.code AS risk_code, p.name AS process_name FROM risk_materializations mt JOIN risks r ON r.id = mt.risk_id
         JOIN institutional_processes p ON p.id = r.process_id WHERE r.map_id = $1 AND r.deleted_at IS NULL ORDER BY mt.occurred_at DESC`, [mapId]),
      query(
        `SELECT a.*, r.code AS risk_code, COALESCE(NULLIF(a.responsible_name, ''), u.full_name, '') AS responsible_label,
                (a.status NOT IN ('TERMINADA','CANCELADA') AND a.due_date < CURRENT_DATE) AS overdue
         FROM risk_actions a JOIN risks r ON r.id = a.risk_id LEFT JOIN memberships m ON m.id = a.responsible_membership_id
         LEFT JOIN users u ON u.id = m.user_id WHERE r.map_id = $1 AND r.deleted_at IS NULL ORDER BY r.code, a.due_date NULLS LAST`, [mapId]),
    ])
    const processFilter = request.query.processId && numericId(request.query.processId) ? String(request.query.processId) : null
    const scoped = processFilter ? risks.filter(risk => String(risk.process_id) === processFilter) : risks
    const html = renderRiskReportHtml({
      organizationName: orgResult.rows[0]?.name || '',
      map: mapResult.rows[0],
      risks: scoped.filter(risk => risk.status === 'ACTIVO'),
      materializations: mats.rows.filter(row => scoped.some(risk => risk.id === row.risk_id)),
      actions: actions.rows.filter(row => scoped.some(risk => risk.id === row.risk_id)),
      processName: processFilter ? scoped[0]?.process_name || '' : '',
      generatedAt: new Date().toISOString(),
      generatedBy: request.auth.user.fullName,
    })
    const pdf = await renderPdf(html, { landscape: true, footerLabel: `Mapa de riesgos · ${mapResult.rows[0]?.name || ''}` })
    response.setHeader('Content-Type', 'application/pdf')
    response.setHeader('Content-Disposition', `attachment; filename="mapa-riesgos-${mapResult.rows[0]?.year || ''}.pdf"`)
    response.send(pdf)
  } catch (error) { next(error) }
})
