import { Router } from 'express'
import { requireAnyPermission, requirePermission } from '../auth.mjs'
import { pool, query } from '../db.mjs'
import { hashPassword, normalizeEmail, safeKey } from '../security.mjs'

export const adminRouter = Router()

adminRouter.use(requireAnyPermission(['admin.view', 'users.view', 'users.manage', 'roles.assign', 'roles.manage', 'settings.edit', 'modules.manage', 'organization.manage']))

adminRouter.get('/overview', async (request, response, next) => {
  try {
    const organizationId = request.auth.organization.id
    const [users, roles, modules, permissions] = await Promise.all([
      query(
        `SELECT u.id, u.email, u.full_name, u.active, u.last_login_at,
                m.id AS membership_id, m.active AS membership_active, r.id AS role_id, r.name AS role_name
         FROM memberships m JOIN users u ON u.id=m.user_id JOIN roles r ON r.id=m.role_id
         WHERE m.organization_id=$1 ORDER BY u.full_name`, [organizationId]),
      query(
        `SELECT r.id, r.key, r.name, r.description, r.system,
                COALESCE(json_agg(DISTINCT rm.module_id) FILTER (WHERE rm.module_id IS NOT NULL), '[]') AS module_ids,
                COALESCE(json_agg(DISTINCT rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '[]') AS permission_ids,
                COUNT(DISTINCT m.id)::int AS user_count
         FROM roles r LEFT JOIN role_modules rm ON rm.role_id=r.id
         LEFT JOIN role_permissions rp ON rp.role_id=r.id LEFT JOIN memberships m ON m.role_id=r.id
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
    const result = await query(
      `UPDATE memberships m SET role_id=$1, active=$2
       FROM roles r WHERE m.id=$3 AND m.organization_id=$4 AND r.id=$1 AND r.organization_id=$4
       RETURNING m.id`, [roleId, active, membershipId, organizationId])
    if (!result.rows[0]) return response.status(404).json({ error: 'Usuario o rol no encontrado' })
    response.json({ ok: true })
  } catch (error) { next(error) }
})

adminRouter.post('/roles', requireAnyPermission(['roles.assign', 'roles.manage']), async (request, response, next) => {
  try {
    const organizationId = request.auth.organization.id
    const name = String(request.body?.name || '').trim()
    const description = String(request.body?.description || '').trim()
    const key = safeKey(name)
    if (name.length < 3 || !key) return response.status(400).json({ error: 'El rol necesita un nombre válido' })
    const result = await query(
      `INSERT INTO roles (organization_id,key,name,description) VALUES ($1,$2,$3,$4)
       RETURNING *`, [organizationId, key, name, description])
    response.status(201).json(result.rows[0])
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'Ya existe un rol con ese nombre' })
    next(error)
  }
})

adminRouter.put('/roles/:roleId/access', requireAnyPermission(['roles.assign', 'roles.manage']), async (request, response, next) => {
  const client = await pool.connect()
  try {
    const organizationId = request.auth.organization.id
    const roleId = Number(request.params.roleId)
    const moduleIds = [...new Set((request.body?.moduleIds || []).map(Number).filter(Boolean))]
    const permissionIds = [...new Set((request.body?.permissionIds || []).map(Number).filter(Boolean))]
    const role = await client.query('SELECT system FROM roles WHERE id=$1 AND organization_id=$2', [roleId, organizationId])
    if (!role.rows[0]) return response.status(404).json({ error: 'Rol no encontrado' })
    if (role.rows[0].system) return response.status(400).json({ error: 'El rol principal del sistema no puede limitarse' })
    await client.query('BEGIN')
    await client.query('DELETE FROM role_modules WHERE role_id=$1', [roleId])
    await client.query('DELETE FROM role_permissions WHERE role_id=$1', [roleId])
    if (moduleIds.length) await client.query(
      `INSERT INTO role_modules (role_id,module_id)
       SELECT $1, unnest($2::bigint[])`, [roleId, moduleIds])
    if (permissionIds.length) await client.query(
      `INSERT INTO role_permissions (role_id,permission_id)
       SELECT $1, unnest($2::bigint[])`, [roleId, permissionIds])
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
