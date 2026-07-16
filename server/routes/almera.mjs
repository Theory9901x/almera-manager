import { randomUUID } from 'node:crypto'
import { mkdir, unlink } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { pool, query } from '../db.mjs'
import { requireAnyModuleAccess, requireAnyPermission, requirePermission } from '../auth.mjs'

export const almeraRouter = Router()

const oid = request => request.auth.organization.id
const uid = request => request.auth.user.id
const assistanceModule = requireAnyModuleAccess(['technical-assistances'])
const auditModule = requireAnyModuleAccess(['internal-audits'])
const view = requireAnyPermission(['technical_assistance.view'])
const create = requireAnyPermission(['technical_assistance.create'])
const edit = requireAnyPermission(['technical_assistance.edit'])
const close = requireAnyPermission(['technical_assistance.close'])
const exportData = requireAnyPermission(['technical_assistance.export'])
const openStatuses = ['RECIBIDA', 'EN_ANALISIS', 'EN_PROCESO', 'PENDIENTE_DEL_PROCESO', 'PENDIENTE_DE_TERCERO']

function fail(status, message) {
  const error = new Error(message)
  error.status = status
  throw error
}

// Nombre de variable propio (antes UPLOAD_DIR, compartido por error con adherence.mjs): si se
// configuraba una sola vez, ambos modulos apuntaban a la misma carpeta.
const uploadRoot = resolve(process.env.ALMERA_UPLOAD_DIR || 'uploads/almera')
await mkdir(uploadRoot, { recursive: true })

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
])

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadRoot,
    filename: (_request, file, callback) => callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase().slice(0, 10)}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 5 },
  fileFilter: (_request, file, callback) => {
    if (allowedMimeTypes.has(file.mimetype)) return callback(null, true)
    const error = new Error('Tipo de archivo no permitido')
    error.status = 415
    callback(error)
  },
})

function effectiveStatusSql(alias = 'a') {
  return `CASE
    WHEN ${alias}.status='CANCELADA' THEN 'CANCELADA'
    WHEN ${alias}.status='COMPLETADA' THEN 'COMPLETADA'
    WHEN ${alias}.commitment_at IS NOT NULL AND ${alias}.commitment_at<NOW() THEN 'VENCIDA'
    WHEN ${alias}.completion_percent>0 OR ${alias}.status<>'RECIBIDA' THEN 'EN_CURSO'
    ELSE 'PENDIENTE' END`
}

function addFilters(request, params, where) {
  if (request.query.processId) {
    params.push(request.query.processId)
    where.push(`a.process_id=$${params.length}`)
  }
  if (request.query.moduleId) {
    params.push(request.query.moduleId)
    where.push(`a.almera_module_id=$${params.length}`)
  }
  if (request.query.dateFrom) {
    params.push(request.query.dateFrom)
    where.push(`a.received_at >= $${params.length}::date`)
  }
  if (request.query.dateTo) {
    params.push(request.query.dateTo)
    where.push(`a.received_at < ($${params.length}::date + INTERVAL '1 day')`)
  }
  if (request.query.status) {
    params.push(request.query.status)
    where.push(`${effectiveStatusSql('a')}=$${params.length}`)
  }
  if (request.query.q) {
    params.push(`%${request.query.q}%`)
    where.push(`(a.subject ILIKE $${params.length} OR a.code ILIKE $${params.length} OR a.requester_name ILIKE $${params.length} OR p.name ILIKE $${params.length} OR am.name ILIKE $${params.length})`)
  }
}

function csvCell(value) {
  let safe = value == null ? '' : String(value)
  if (/^[=+\-@]/.test(safe)) safe = `'${safe}`
  return `"${safe.replaceAll('"', '""')}"`
}

async function assertReferences(client, organizationId, body) {
  const checks = [
    client.query('SELECT id FROM institutional_processes WHERE id=$1 AND organization_id=$2 AND active', [body.processId, organizationId]),
    client.query('SELECT id FROM almera_catalog_modules WHERE id=$1 AND organization_id=$2 AND active', [body.almeraModuleId, organizationId]),
  ]
  if (body.responsibleMembershipId) checks.push(client.query('SELECT id FROM memberships WHERE id=$1 AND organization_id=$2 AND active', [body.responsibleMembershipId, organizationId]))
  const results = await Promise.all(checks)
  if (results.some(result => !result.rows[0])) {
    const error = new Error('Proceso, modulo o responsable no pertenece a la entidad activa')
    error.status = 400
    throw error
  }
}

almeraRouter.get('/catalogs', assistanceModule, view, async (request, response, next) => {
  try {
    const [processes, modules, responsibles] = await Promise.all([
      query('SELECT id,code,name,classification,responsible,responsible_email FROM institutional_processes WHERE organization_id=$1 AND active ORDER BY code', [oid(request)]),
      query('SELECT id,code,name,description FROM almera_catalog_modules WHERE organization_id=$1 AND active ORDER BY code', [oid(request)]),
      query(`SELECT m.id,u.full_name FROM memberships m JOIN users u ON u.id=m.user_id
             WHERE m.organization_id=$1 AND m.active AND u.active ORDER BY u.full_name`, [oid(request)]),
    ])
    response.json({ processes: processes.rows, modules: modules.rows, responsibles: responsibles.rows })
  } catch (error) { next(error) }
})

almeraRouter.get('/assistances', assistanceModule, view, async (request, response, next) => {
  try {
    const params = [oid(request)]
    const where = ['a.organization_id=$1', 'a.deleted_at IS NULL']
    addFilters(request, params, where)
    const result = await query(
      `SELECT a.*,p.name process_name,p.code process_code,am.name module_name,u.full_name responsible_name,
              ${effectiveStatusSql()} effective_status,
              (a.commitment_at<NOW() AND a.status=ANY($${params.length + 1})) overdue,
              (a.commitment_at>=NOW() AND a.commitment_at<=NOW()+INTERVAL '2 days' AND a.status=ANY($${params.length + 1})) due_soon,
              CASE WHEN a.commitment_at IS NULL THEN NULL ELSE CEIL(EXTRACT(EPOCH FROM (a.commitment_at-NOW()))/86400.0)::int END days_remaining
       FROM technical_assistances a
       JOIN institutional_processes p ON p.id=a.process_id AND p.organization_id=a.organization_id
       JOIN almera_catalog_modules am ON am.id=a.almera_module_id AND am.organization_id=a.organization_id
       LEFT JOIN memberships m ON m.id=a.responsible_membership_id AND m.organization_id=a.organization_id
       LEFT JOIN users u ON u.id=m.user_id
       WHERE ${where.join(' AND ')}
       ORDER BY CASE WHEN a.status='COMPLETADA' THEN 3 WHEN a.commitment_at<NOW() THEN 0 WHEN a.commitment_at<=NOW()+INTERVAL '2 days' THEN 1 ELSE 2 END,
                a.commitment_at NULLS LAST,a.created_at DESC LIMIT 500`,
      [...params, openStatuses],
    )
    response.json(result.rows)
  } catch (error) { next(error) }
})

almeraRouter.get('/assistances/dashboard', assistanceModule, view, async (request, response, next) => {
  try {
    const params = [oid(request)]
    const where = ['a.organization_id=$1', 'a.deleted_at IS NULL']
    addFilters(request, params, where)
    const filter = where.join(' AND ')
    const [summary, byModule, byProcess] = await Promise.all([
      query(
        `SELECT COUNT(*)::int total,
                COUNT(*) FILTER(WHERE ${effectiveStatusSql()}='PENDIENTE')::int pending,
                COUNT(*) FILTER(WHERE ${effectiveStatusSql()}='EN_CURSO')::int in_progress,
                COUNT(*) FILTER(WHERE ${effectiveStatusSql()}='COMPLETADA')::int completed,
                COUNT(*) FILTER(WHERE ${effectiveStatusSql()}='VENCIDA')::int overdue,
                COUNT(*) FILTER(WHERE a.commitment_at>=NOW() AND a.commitment_at<=NOW()+INTERVAL '2 days' AND a.status=ANY($${params.length + 1}))::int due_soon,
                COALESCE(ROUND(AVG(a.completion_percent),1),0) average_completion
         FROM technical_assistances a
         JOIN institutional_processes p ON p.id=a.process_id AND p.organization_id=a.organization_id
         JOIN almera_catalog_modules am ON am.id=a.almera_module_id AND am.organization_id=a.organization_id
         WHERE ${filter}`,
        [...params, openStatuses],
      ),
      query(
        `SELECT am.id,am.name,COUNT(*)::int total,COALESCE(ROUND(AVG(a.completion_percent),1),0) average_completion
         FROM technical_assistances a
         JOIN institutional_processes p ON p.id=a.process_id AND p.organization_id=a.organization_id
         JOIN almera_catalog_modules am ON am.id=a.almera_module_id AND am.organization_id=a.organization_id
         WHERE ${filter} GROUP BY am.id,am.name ORDER BY total DESC,am.name`, params),
      query(
        `SELECT p.id,p.name,COUNT(*)::int total,COALESCE(ROUND(AVG(a.completion_percent),1),0) average_completion
         FROM technical_assistances a
         JOIN institutional_processes p ON p.id=a.process_id AND p.organization_id=a.organization_id
         JOIN almera_catalog_modules am ON am.id=a.almera_module_id AND am.organization_id=a.organization_id
         WHERE ${filter} GROUP BY p.id,p.name ORDER BY total DESC,p.name`, params),
    ])
    response.json({ summary: summary.rows[0], byModule: byModule.rows, byProcess: byProcess.rows })
  } catch (error) { next(error) }
})

almeraRouter.get('/assistances/export.csv', assistanceModule, exportData, async (request, response, next) => {
  try {
    const params = [oid(request)]
    const where = ['a.organization_id=$1', 'a.deleted_at IS NULL']
    addFilters(request, params, where)
    const result = await query(
      `SELECT a.code,p.name process_name,am.name module_name,a.received_at,a.subject,a.description,a.commitment_at,
              a.closed_at,${effectiveStatusSql()} effective_status,a.completion_percent,u.full_name responsible_name,a.final_solution
       FROM technical_assistances a
       JOIN institutional_processes p ON p.id=a.process_id AND p.organization_id=a.organization_id
       JOIN almera_catalog_modules am ON am.id=a.almera_module_id AND am.organization_id=a.organization_id
       LEFT JOIN memberships m ON m.id=a.responsible_membership_id AND m.organization_id=a.organization_id
       LEFT JOIN users u ON u.id=m.user_id
       WHERE ${where.join(' AND ')} ORDER BY a.received_at DESC`, params)
    const headers = ['Codigo', 'Proceso', 'Modulo ALMERA', 'Fecha solicitud', 'Asunto', 'Solicitud', 'Fecha compromiso', 'Fecha cierre', 'Estado', 'Cumplimiento %', 'Responsable', 'Solucion final']
    const rows = result.rows.map(row => [row.code, row.process_name, row.module_name, row.received_at?.toISOString?.() || row.received_at, row.subject, row.description, row.commitment_at?.toISOString?.() || row.commitment_at, row.closed_at?.toISOString?.() || row.closed_at, row.effective_status, row.completion_percent, row.responsible_name, row.final_solution])
    const csv = `\uFEFF${[headers, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n')}`
    response.setHeader('Content-Type', 'text/csv; charset=utf-8')
    response.setHeader('Content-Disposition', `attachment; filename="asistencias-tecnicas-${new Date().toISOString().slice(0, 10)}.csv"`)
    response.send(csv)
  } catch (error) { next(error) }
})

almeraRouter.get('/assistances/:id', assistanceModule, view, async (request, response, next) => {
  try {
    const assistance = await query(
      `SELECT a.*,p.name process_name,p.code process_code,am.name module_name,u.full_name responsible_name,
              ${effectiveStatusSql()} effective_status,
              (a.commitment_at<NOW() AND a.status=ANY($3)) overdue,
              (a.commitment_at>=NOW() AND a.commitment_at<=NOW()+INTERVAL '2 days' AND a.status=ANY($3)) due_soon
       FROM technical_assistances a
       JOIN institutional_processes p ON p.id=a.process_id AND p.organization_id=a.organization_id
       JOIN almera_catalog_modules am ON am.id=a.almera_module_id AND am.organization_id=a.organization_id
       LEFT JOIN memberships m ON m.id=a.responsible_membership_id AND m.organization_id=a.organization_id
       LEFT JOIN users u ON u.id=m.user_id
       WHERE a.id=$1 AND a.organization_id=$2 AND a.deleted_at IS NULL`, [request.params.id, oid(request), openStatuses])
    if (!assistance.rows[0]) return response.status(404).json({ error: 'Asistencia no encontrada' })
    const [actions, evidences, history] = await Promise.all([
      query(`SELECT aa.*,u.full_name performed_by FROM assistance_actions aa JOIN users u ON u.id=aa.performed_by_id
             WHERE aa.assistance_id=$1 AND aa.organization_id=$2 ORDER BY aa.performed_at DESC`, [request.params.id, oid(request)]),
      query(`SELECT e.id,e.original_name,e.mime_type,e.size_bytes,e.description,e.created_at,u.full_name uploaded_by
             FROM evidences e JOIN users u ON u.id=e.uploaded_by_id
             WHERE e.assistance_id=$1 AND e.organization_id=$2 AND e.active ORDER BY e.created_at DESC`, [request.params.id, oid(request)]),
      query(`SELECT l.id,l.action,l.changes,l.created_at,u.full_name actor_name FROM activity_logs l JOIN users u ON u.id=l.actor_user_id
             WHERE l.entity_type='ASSISTANCE' AND l.entity_id=$1 AND l.organization_id=$2 ORDER BY l.created_at DESC`, [request.params.id, oid(request)]),
    ])
    response.json({ assistance: assistance.rows[0], actions: actions.rows, evidences: evidences.rows, history: history.rows })
  } catch (error) { next(error) }
})

almeraRouter.get('/assistances/:id/evidences/:evidenceId/download', assistanceModule, view, async (request, response, next) => {
  try {
    const result = await query(
      `SELECT e.original_name,e.storage_key FROM evidences e JOIN technical_assistances a ON a.id=e.assistance_id
       WHERE e.id=$1 AND e.assistance_id=$2 AND e.organization_id=$3 AND a.organization_id=$3 AND e.active`,
      [request.params.evidenceId, request.params.id, oid(request)],
    )
    if (!result.rows[0]) return response.status(404).json({ error: 'Evidencia no encontrada' })
    response.download(resolve(uploadRoot, result.rows[0].storage_key), result.rows[0].original_name)
  } catch (error) { next(error) }
})

almeraRouter.post('/assistances', assistanceModule, create, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const body = request.body || {}
    if (!body.subject || !body.processId || !body.almeraModuleId || !body.description || !body.commitmentAt) {
      return response.status(400).json({ error: 'Asunto, proceso, modulo, descripcion y fecha compromiso son obligatorios' })
    }
    await client.query('BEGIN')
    await assertReferences(client, oid(request), body)
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [oid(request)])
    const sequence = await client.query(`SELECT COUNT(*)+1 n FROM technical_assistances WHERE organization_id=$1 AND created_at>=date_trunc('year',NOW())`, [oid(request)])
    const code = `AST-${new Date().getFullYear()}-${String(sequence.rows[0].n).padStart(4, '0')}`
    const result = await client.query(
      `INSERT INTO technical_assistances(
         organization_id,code,subject,process_id,almera_module_id,requester_name,requester_position,requester_contact,
         request_channel,description,priority,received_at,commitment_at,responsible_membership_id,general_observations,created_by_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12,NOW()),$13,$14,$15,$16) RETURNING *`,
      [oid(request), code, String(body.subject).trim(), body.processId, body.almeraModuleId, String(body.requesterName || request.auth.user.fullName).trim(), body.requesterPosition || '', body.requesterContact || '', body.requestChannel || 'APP', String(body.description).trim(), body.priority || 'MEDIA', body.receivedAt || null, body.commitmentAt, body.responsibleMembershipId || null, body.observations || '', uid(request)],
    )
    await client.query(
      `INSERT INTO activity_logs(organization_id,entity_type,entity_id,action,changes,actor_user_id)
       VALUES($1,'ASSISTANCE',$2,'CREATED',$3,$4)`, [oid(request), result.rows[0].id, JSON.stringify({ code, completionPercent: 0 }), uid(request)])
    await client.query('COMMIT')
    response.status(201).json(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})

almeraRouter.patch('/assistances/:id', assistanceModule, edit, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const body = request.body || {}
    const fieldMap = {
      subject: 'subject',
      priority: 'priority',
      commitmentAt: 'commitment_at',
      responsibleMembershipId: 'responsible_membership_id',
      observations: 'general_observations',
    }
    await client.query('BEGIN')
    const current = await client.query('SELECT * FROM technical_assistances WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL FOR UPDATE', [request.params.id, oid(request)])
    if (!current.rows[0]) fail(404, 'Asistencia no encontrada')
    if (current.rows[0].status === 'COMPLETADA') fail(409, 'Una asistencia completada debe reabrirse antes de editarse')
    if (Object.hasOwn(body, 'responsibleMembershipId') && body.responsibleMembershipId) {
      const membership = await client.query('SELECT id FROM memberships WHERE id=$1 AND organization_id=$2 AND active', [body.responsibleMembershipId, oid(request)])
      if (!membership.rows[0]) fail(400, 'El responsable no pertenece a la entidad activa')
    }
    const changes = Object.entries(fieldMap).filter(([key]) => Object.hasOwn(body, key)).map(([key, column]) => ({ key, column, value: body[key] === '' ? null : body[key] }))
    if (!changes.length) fail(400, 'No hay cambios validos')
    const values = changes.map(change => change.value)
    const sets = changes.map((change, index) => `${change.column}=$${index + 1}`)
    values.push(uid(request), request.params.id, oid(request))
    const result = await client.query(
      `UPDATE technical_assistances SET ${sets.join(',')},updated_by_id=$${values.length - 2},updated_at=NOW()
       WHERE id=$${values.length - 1} AND organization_id=$${values.length} RETURNING *`, values)
    await client.query(
      `INSERT INTO activity_logs(organization_id,entity_type,entity_id,action,changes,actor_user_id)
       VALUES($1,'ASSISTANCE',$2,'UPDATED',$3,$4)`, [oid(request), request.params.id, JSON.stringify(Object.fromEntries(changes.map(change => [change.key, change.value]))), uid(request)])
    await client.query('COMMIT')
    response.json(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})

almeraRouter.post('/assistances/:id/actions', assistanceModule, edit, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const body = request.body || {}
    const completionPercent = Number(body.completionPercent)
    if (!String(body.description || '').trim()) return response.status(400).json({ error: 'Describe lo realizado' })
    if (!Number.isInteger(completionPercent) || completionPercent < 0 || completionPercent > 99) return response.status(400).json({ error: 'El avance debe ser un entero entre 0 y 99; usa Cerrar para llegar a 100' })
    await client.query('BEGIN')
    const assistance = await client.query('SELECT * FROM technical_assistances WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL FOR UPDATE', [request.params.id, oid(request)])
    if (!assistance.rows[0]) fail(404, 'Asistencia no encontrada')
    if (assistance.rows[0].status === 'COMPLETADA') fail(409, 'La asistencia ya esta completada')
    const nextStatus = completionPercent > 0 ? 'EN_PROCESO' : assistance.rows[0].status
    const action = await client.query(
      `INSERT INTO assistance_actions(organization_id,assistance_id,performed_by_id,description,result,observations,new_status,new_commitment_at,completion_percent)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [oid(request), request.params.id, uid(request), String(body.description).trim(), body.result || '', body.observations || '', nextStatus, body.newCommitmentAt || null, completionPercent],
    )
    await client.query(
      `UPDATE technical_assistances SET status=$1,completion_percent=$2,commitment_at=COALESCE($3,commitment_at),updated_by_id=$4,updated_at=NOW() WHERE id=$5`,
      [nextStatus, completionPercent, body.newCommitmentAt || null, uid(request), request.params.id])
    await client.query(
      `INSERT INTO activity_logs(organization_id,entity_type,entity_id,action,changes,actor_user_id)
       VALUES($1,'ASSISTANCE',$2,'PROGRESS_UPDATED',$3,$4)`, [oid(request), request.params.id, JSON.stringify({ completionPercent, description: body.description }), uid(request)])
    await client.query('COMMIT')
    response.status(201).json(action.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})

almeraRouter.post('/assistances/:id/evidences', assistanceModule, edit, upload.array('files', 5), async (request, response, next) => {
  const files = request.files || []
  const client = await pool.connect()
  try {
    if (!files.length) return response.status(400).json({ error: 'Selecciona al menos un archivo' })
    await client.query('BEGIN')
    const assistance = await client.query('SELECT id FROM technical_assistances WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL', [request.params.id, oid(request)])
    if (!assistance.rows[0]) fail(404, 'Asistencia no encontrada')
    const saved = []
    for (const file of files) {
      const evidence = await client.query(
        `INSERT INTO evidences(organization_id,assistance_id,original_name,mime_type,size_bytes,storage_key,description,uploaded_by_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,original_name,mime_type,size_bytes,description,created_at`,
        [oid(request), request.params.id, file.originalname, file.mimetype, file.size, file.filename, request.body.description || '', uid(request)])
      saved.push(evidence.rows[0])
    }
    await client.query(
      `INSERT INTO activity_logs(organization_id,entity_type,entity_id,action,changes,actor_user_id)
       VALUES($1,'ASSISTANCE',$2,'EVIDENCE_UPLOADED',$3,$4)`, [oid(request), request.params.id, JSON.stringify({ files: files.map(file => file.originalname) }), uid(request)])
    await client.query('COMMIT')
    response.status(201).json(saved)
  } catch (error) {
    await client.query('ROLLBACK')
    await Promise.allSettled(files.map(file => unlink(file.path)))
    next(error)
  } finally { client.release() }
})

almeraRouter.post('/assistances/:id/close', assistanceModule, close, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const body = request.body || {}
    if (!String(body.solution || '').trim()) return response.status(400).json({ error: 'La descripcion de cierre es obligatoria' })
    await client.query('BEGIN')
    const result = await client.query(
      `UPDATE technical_assistances SET status='COMPLETADA',completion_percent=100,final_solution=$1,
              closed_at=COALESCE($2,NOW()),updated_by_id=$3,updated_at=NOW()
       WHERE id=$4 AND organization_id=$5 AND status<>'COMPLETADA' AND deleted_at IS NULL RETURNING *`,
      [String(body.solution).trim(), body.closedAt || null, uid(request), request.params.id, oid(request)])
    if (!result.rows[0]) fail(409, 'La asistencia no existe o ya fue completada')
    await client.query(
      `INSERT INTO assistance_actions(organization_id,assistance_id,performed_by_id,description,result,new_status,completion_percent)
       VALUES($1,$2,$3,$4,$5,'COMPLETADA',100)`, [oid(request), request.params.id, uid(request), body.finalAction || 'Cierre de la asistencia', body.result || body.solution])
    await client.query(
      `INSERT INTO activity_logs(organization_id,entity_type,entity_id,action,changes,actor_user_id)
       VALUES($1,'ASSISTANCE',$2,'CLOSED',$3,$4)`, [oid(request), request.params.id, JSON.stringify({ solution: body.solution, completionPercent: 100 }), uid(request)])
    await client.query('COMMIT')
    response.json(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})

almeraRouter.post('/assistances/:id/reopen', assistanceModule, close, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const justification = String(request.body?.justification || '').trim()
    if (!justification) return response.status(400).json({ error: 'La justificacion es obligatoria' })
    await client.query('BEGIN')
    const result = await client.query(
      `UPDATE technical_assistances SET status='EN_PROCESO',completion_percent=LEAST(completion_percent,99),closed_at=NULL,
              final_solution=NULL,updated_by_id=$1,updated_at=NOW()
       WHERE id=$2 AND organization_id=$3 AND status='COMPLETADA' RETURNING *`, [uid(request), request.params.id, oid(request)])
    if (!result.rows[0]) fail(409, 'Solo se puede reabrir una asistencia completada')
    await client.query(
      `INSERT INTO assistance_actions(organization_id,assistance_id,performed_by_id,description,result,new_status,completion_percent)
       VALUES($1,$2,$3,$4,'Reabierta','EN_PROCESO',$5)`, [oid(request), request.params.id, uid(request), justification, result.rows[0].completion_percent])
    await client.query(
      `INSERT INTO activity_logs(organization_id,entity_type,entity_id,action,changes,actor_user_id)
       VALUES($1,'ASSISTANCE',$2,'REOPENED',$3,$4)`, [oid(request), request.params.id, JSON.stringify({ justification }), uid(request)])
    await client.query('COMMIT')
    response.json(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})

// Se conservan los endpoints iniciales del modulo 2, protegidos por su propio acceso.
almeraRouter.get('/audits', auditModule, requireAnyPermission(['internal_audit.view']), async (request, response, next) => {
  try {
    const result = await query(`SELECT a.*,p.name process_name,ap.name plan_name FROM audits a JOIN institutional_processes p ON p.id=a.process_id JOIN audit_plans ap ON ap.id=a.plan_id WHERE a.organization_id=$1 ORDER BY a.created_at DESC`, [oid(request)])
    response.json(result.rows)
  } catch (error) { next(error) }
})

almeraRouter.post('/audit-plans', auditModule, requirePermission('internal_audit.manage'), async (request, response, next) => {
  try {
    const body = request.body || {}
    if (!body.name || !body.objective || !body.scope || !body.criteria) return response.status(400).json({ error: 'Datos obligatorios incompletos' })
    const code = `PLA-${body.validity || new Date().getFullYear()}-${Date.now().toString().slice(-5)}`
    const result = await query(
      `INSERT INTO audit_plans(organization_id,code,name,validity,objective,scope,criteria,scheduled_start,scheduled_end,lead_auditor_id,observations,created_by_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [oid(request), code, body.name, body.validity || new Date().getFullYear(), body.objective, body.scope, body.criteria, body.scheduledStart || null, body.scheduledEnd || null, body.leadAuditorId || uid(request), body.observations || '', uid(request)],
    )
    response.status(201).json(result.rows[0])
  } catch (error) { next(error) }
})
