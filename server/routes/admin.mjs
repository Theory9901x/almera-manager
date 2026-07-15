import { Router } from 'express'
import { requireAnyPermission } from '../auth.mjs'
import { pool, query } from '../db.mjs'
import { hashPassword, normalizeEmail } from '../security.mjs'

export const adminRouter = Router()

adminRouter.use(requireAnyPermission(['admin.view', 'users.view', 'users.manage', 'roles.assign', 'roles.manage', 'settings.edit', 'modules.manage', 'organization.manage']))

function fail(status, message) {
  const error = new Error(message)
  error.status = status
  throw error
}

adminRouter.get('/overview', async (request, response, next) => {
  try {
    const organizationId = request.auth.organization.id
    const [users, roles, modules, permissions] = await Promise.all([
      query(
        `SELECT u.id, u.email, u.full_name, u.active, u.last_login_at,
                m.id AS membership_id, m.active AS membership_active, r.id AS role_id, r.key AS role_key, r.name AS role_name,
                m.position_id, ap.name AS position_name
         FROM memberships m JOIN users u ON u.id=m.user_id JOIN roles r ON r.id=m.role_id
         LEFT JOIN adherence_positions ap ON ap.id = m.position_id
         WHERE m.organization_id=$1 ORDER BY u.full_name`, [organizationId]),
      query(
        `SELECT r.id, r.key, r.name, r.description, r.system, COUNT(DISTINCT m.id)::int AS user_count
         FROM roles r LEFT JOIN memberships m ON m.role_id=r.id
         WHERE r.organization_id=$1 GROUP BY r.id ORDER BY r.system DESC, r.name`, [organizationId]),
      query(
        `SELECT mo.*, COALESCE(om.enabled, FALSE) AS enabled
         FROM modules mo LEFT JOIN organization_modules om ON om.module_id=mo.id AND om.organization_id=$1
         WHERE mo.active=TRUE ORDER BY mo.position, mo.name`, [organizationId]),
      query('SELECT * FROM permissions ORDER BY name'),
    ])
    response.json({ users: users.rows, roles: roles.rows, modules: modules.rows, permissions: permissions.rows })
  } catch (error) { next(error) }
})

adminRouter.post('/users', requireAnyPermission(['users.create', 'users.manage']), async (request, response, next) => {
  const client = await pool.connect()
  try {
    const organizationId = request.auth.organization.id
    const email = normalizeEmail(request.body?.email)
    const fullName = String(request.body?.fullName || '').trim()
    const password = String(request.body?.password || '')
    const roleId = Number(request.body?.roleId)
    if (!email || !fullName || password.length < 10 || !roleId) {
      return response.status(400).json({ error: 'Nombre, correo, rol y contraseña de mínimo 10 caracteres son obligatorios' })
    }
    const validRole = await query('SELECT id FROM roles WHERE id=$1 AND organization_id=$2', [roleId, organizationId])
    if (!validRole.rows[0]) return response.status(400).json({ error: 'El rol no pertenece a esta entidad' })
    await client.query('BEGIN')
    const userResult = await client.query(
      `INSERT INTO users (email, full_name, password_hash) VALUES ($1,$2,$3)
       ON CONFLICT (email) DO UPDATE SET full_name=EXCLUDED.full_name, updated_at=NOW()
       RETURNING id`, [email, fullName, hashPassword(password)])
    await client.query(
      `INSERT INTO memberships (organization_id,user_id,role_id) VALUES ($1,$2,$3)
       ON CONFLICT (organization_id,user_id) DO UPDATE SET role_id=EXCLUDED.role_id, active=TRUE`,
      [organizationId, userResult.rows[0].id, roleId])
    await client.query('COMMIT')
    response.status(201).json({ ok: true })
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})

adminRouter.patch('/users/:membershipId', requireAnyPermission(['users.edit', 'users.disable', 'users.manage']), async (request, response, next) => {
  try {
    const organizationId = request.auth.organization.id
    const membershipId = Number(request.params.membershipId)
    const roleId = Number(request.body?.roleId)
    const active = Boolean(request.body?.active)
    if (Object.hasOwn(request.body || {}, 'positionId')) {
      const positionId = request.body.positionId === null || request.body.positionId === '' ? null : Number(request.body.positionId)
      if (positionId !== null) {
        const position = await query('SELECT id FROM adherence_positions WHERE id=$1 AND organization_id=$2', [positionId, organizationId])
        if (!position.rows[0]) return response.status(400).json({ error: 'El cargo no pertenece a esta entidad' })
      }
      await query('UPDATE memberships SET position_id=$1 WHERE id=$2 AND organization_id=$3', [positionId, membershipId, organizationId])
    }
    const result = await query(
      `UPDATE memberships m SET role_id=$1, active=$2
       FROM roles r WHERE m.id=$3 AND m.organization_id=$4 AND r.id=$1 AND r.organization_id=$4
       RETURNING m.id`, [roleId, active, membershipId, organizationId])
    if (!result.rows[0]) return response.status(404).json({ error: 'Usuario o rol no encontrado' })
    response.json({ ok: true })
  } catch (error) { next(error) }
})

adminRouter.get('/users/:membershipId/modules', async (request, response, next) => {
  try {
    const organizationId = request.auth.organization.id
    const membershipId = Number(request.params.membershipId)
    const membership = await query('SELECT id FROM memberships WHERE id=$1 AND organization_id=$2', [membershipId, organizationId])
    if (!membership.rows[0]) return response.status(404).json({ error: 'Usuario no encontrado' })
    const result = await query(
      `SELECT mo.id AS module_id, mo.key AS module_key, mo.name AS module_name, mm.function_key,
              ap.id AS area_id, ap.name AS area_name,
              COALESCE(
                (SELECT json_agg(json_build_object('id', aa.id, 'name', aa.name))
                 FROM adherence_auditor_areas aaa JOIN adherence_areas aa ON aa.id = aaa.area_id
                 WHERE aaa.membership_id = $1 AND mo.key = 'adherence-matrix'),
                '[]'
              ) AS auditor_areas
       FROM membership_modules mm
       JOIN modules mo ON mo.id = mm.module_id
       LEFT JOIN adherence_professionals pr ON pr.membership_id = $1 AND mo.key = 'adherence-matrix'
       LEFT JOIN adherence_areas ap ON ap.id = pr.area_id
       WHERE mm.membership_id = $1
       ORDER BY mo.position, mo.name`,
      [membershipId],
    )
    response.json(result.rows)
  } catch (error) { next(error) }
})

adminRouter.put('/users/:membershipId/modules/:moduleKey', requireAnyPermission(['users.edit', 'users.manage']), async (request, response, next) => {
  const client = await pool.connect()
  try {
    const organizationId = request.auth.organization.id
    const membershipId = Number(request.params.membershipId)
    const moduleKey = String(request.params.moduleKey)
    const membership = await client.query(
      `SELECT m.id, m.position_id, u.full_name, r.key AS role_key
       FROM memberships m JOIN users u ON u.id=m.user_id JOIN roles r ON r.id=m.role_id
       WHERE m.id=$1 AND m.organization_id=$2`,
      [membershipId, organizationId],
    )
    if (!membership.rows[0]) return response.status(404).json({ error: 'Usuario no encontrado' })
    if (membership.rows[0].role_key !== 'USUARIO') return response.status(400).json({ error: 'Solo los usuarios con rol "Usuario" reciben módulos individuales; Admin y Superadmin ya tienen acceso completo' })
    const module = await client.query('SELECT id FROM modules WHERE key=$1', [moduleKey])
    if (!module.rows[0]) return response.status(404).json({ error: 'Módulo no encontrado' })

    await client.query('BEGIN')

    if (moduleKey === 'adherence-matrix') {
      const functionKey = String(request.body?.function || '').trim().toUpperCase()
      if (!['AUDITOR', 'PROFESIONAL'].includes(functionKey)) fail(400, 'Elige la función: Auditor o Profesional')
      await client.query(
        `INSERT INTO membership_modules (membership_id, module_id, function_key) VALUES ($1,$2,$3)
         ON CONFLICT (membership_id, module_id) DO UPDATE SET function_key=EXCLUDED.function_key`,
        [membershipId, module.rows[0].id, functionKey],
      )

      const areaId = Number(request.body?.areaId)
      if (!areaId) fail(400, 'El área es obligatoria para habilitar Matrices de Adherencia')
      const area = await client.query('SELECT id FROM adherence_areas WHERE id=$1 AND organization_id=$2', [areaId, organizationId])
      if (!area.rows[0]) fail(400, 'El área no pertenece a esta entidad')

      if (functionKey === 'AUDITOR') {
        await client.query(
          'INSERT INTO adherence_auditor_areas (membership_id, area_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [membershipId, areaId],
        )
      } else {
        const documentId = String(request.body?.documentId || '').trim()
        const positionId = Number(request.body?.positionId) || membership.rows[0].position_id
        if (!documentId) fail(400, 'El número de documento es obligatorio para habilitar Matrices de Adherencia')
        if (!positionId) fail(400, 'El cargo es obligatorio (el usuario aún no tiene uno en su perfil)')
        const position = await client.query('SELECT id FROM adherence_positions WHERE id=$1 AND organization_id=$2', [positionId, organizationId])
        if (!position.rows[0]) fail(400, 'El cargo no pertenece a esta entidad')
        const existing = await client.query('SELECT id FROM adherence_professionals WHERE membership_id=$1', [membershipId])
        if (existing.rows[0]) {
          await client.query(
            'UPDATE adherence_professionals SET area_id=$1, document_id=$2, position_id=$3, active=TRUE, updated_at=NOW() WHERE id=$4',
            [areaId, documentId, positionId, existing.rows[0].id],
          )
        } else {
          await client.query(
            `INSERT INTO adherence_professionals (organization_id, area_id, position_id, full_name, document_id, status, membership_id)
             VALUES ($1,$2,$3,$4,$5,'ACTIVE_INDEFINITE',$6)`,
            [organizationId, areaId, positionId, membership.rows[0].full_name, documentId, membershipId],
          )
        }
      }
    } else {
      await client.query(
        'INSERT INTO membership_modules (membership_id, module_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [membershipId, module.rows[0].id],
      )
    }

    await client.query('COMMIT')
    response.json({ ok: true })
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505') return response.status(409).json({ error: 'Ya existe un profesional con ese número de documento' })
    next(error)
  } finally { client.release() }
})

adminRouter.delete('/users/:membershipId/modules/:moduleKey', requireAnyPermission(['users.edit', 'users.manage']), async (request, response, next) => {
  const client = await pool.connect()
  try {
    const organizationId = request.auth.organization.id
    const membershipId = Number(request.params.membershipId)
    const moduleKey = String(request.params.moduleKey)
    const membership = await client.query('SELECT id FROM memberships WHERE id=$1 AND organization_id=$2', [membershipId, organizationId])
    if (!membership.rows[0]) return response.status(404).json({ error: 'Usuario no encontrado' })
    const module = await client.query('SELECT id FROM modules WHERE key=$1', [moduleKey])
    if (!module.rows[0]) return response.status(404).json({ error: 'Módulo no encontrado' })
    await client.query('BEGIN')
    await client.query('DELETE FROM membership_modules WHERE membership_id=$1 AND module_id=$2', [membershipId, module.rows[0].id])
    if (moduleKey === 'adherence-matrix') {
      await client.query('UPDATE adherence_professionals SET membership_id=NULL WHERE membership_id=$1', [membershipId])
      await client.query('DELETE FROM adherence_auditor_areas WHERE membership_id=$1', [membershipId])
    }
    await client.query('COMMIT')
    response.json({ ok: true })
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})

adminRouter.patch('/modules/:moduleId', requireAnyPermission(['settings.edit', 'modules.manage', 'organization.manage']), async (request, response, next) => {
  try {
    const organizationId = request.auth.organization.id
    const moduleId = Number(request.params.moduleId)
    const enabled = Boolean(request.body?.enabled)
    const moduleResult = await query('SELECT key FROM modules WHERE id=$1', [moduleId])
    if (!moduleResult.rows[0]) return response.status(404).json({ error: 'Módulo no encontrado' })
    if (moduleResult.rows[0].key === 'admin' && !enabled) return response.status(400).json({ error: 'El módulo administrativo no puede deshabilitarse' })
    await query(
      `INSERT INTO organization_modules (organization_id,module_id,enabled) VALUES ($1,$2,$3)
       ON CONFLICT (organization_id,module_id) DO UPDATE SET enabled=EXCLUDED.enabled, configured_at=NOW()`,
      [organizationId, moduleId, enabled])
    response.json({ ok: true })
  } catch (error) { next(error) }
})
