import { query } from './db.mjs'
import { createSessionToken, hashToken, readCookie } from './security.mjs'

export const SESSION_COOKIE = 'sgimr_session'

export async function getSessionContext(request) {
  const token = readCookie(request, SESSION_COOKIE)
  if (!token) return null
  const result = await query(
    `SELECT s.id AS session_id, s.expires_at,
            u.id AS user_id, u.email, u.full_name,
            m.id AS membership_id, o.id AS organization_id, o.name AS organization_name,
            o.slug AS organization_slug, r.id AS role_id, r.key AS role_key, r.name AS role_name
     FROM sessions s
     JOIN memberships m ON m.id = s.membership_id AND m.active = TRUE
     JOIN users u ON u.id = m.user_id AND u.active = TRUE
     JOIN organizations o ON o.id = m.organization_id AND o.active = TRUE
     JOIN roles r ON r.id = m.role_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [hashToken(token)],
  )
  if (!result.rows[0]) return null
  const row = result.rows[0]
  const [permissionsResult, modulesResult] = await Promise.all([
    query(
      `SELECT p.key FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = $1 ORDER BY p.key`,
      [row.role_id],
    ),
    query(
      `SELECT mo.id, mo.key, mo.name, mo.description, mo.route, mo.icon, mo.position
       FROM modules mo
       JOIN organization_modules om ON om.module_id = mo.id
         AND om.organization_id = $1 AND om.enabled = TRUE
       JOIN role_modules rm ON rm.module_id = mo.id AND rm.role_id = $2
       WHERE mo.active = TRUE ORDER BY mo.position, mo.name`,
      [row.organization_id, row.role_id],
    ),
  ])
  return {
    sessionId: row.session_id,
    membershipId: row.membership_id,
    user: { id: row.user_id, email: row.email, fullName: row.full_name },
    organization: { id: row.organization_id, name: row.organization_name, slug: row.organization_slug },
    role: { id: row.role_id, key: row.role_key, name: row.role_name },
    permissions: permissionsResult.rows.map(item => item.key),
    modules: modulesResult.rows,
  }
}

export async function requireAuth(request, response, next) {
  try {
    const context = await getSessionContext(request)
    if (!context) return response.status(401).json({ error: 'Sesión no válida o expirada' })
    request.auth = context
    next()
  } catch (error) {
    next(error)
  }
}

export function requirePermission(permission) {
  return (request, response, next) => {
    if (!request.auth?.permissions.includes(permission)) {
      return response.status(403).json({ error: 'No tienes permiso para realizar esta acción' })
    }
    next()
  }
}

export function requireAnyPermission(permissions) {
  return (request, response, next) => {
    if (!permissions.some(permission => request.auth?.permissions.includes(permission))) {
      return response.status(403).json({ error: 'No tienes permiso para acceder a esta administración' })
    }
    next()
  }
}

export function requireAnyModuleAccess(moduleKeys) {
  return (request, response, next) => {
    const availableModules = request.auth?.modules || []
    if (!moduleKeys.some(key => availableModules.some(module => module.key === key))) {
      return response.status(403).json({ error: 'El modulo no esta habilitado para tu entidad y rol' })
    }
    next()
  }
}

export async function issueSession(response, membershipId, request) {
  const token = createSessionToken()
  const days = Math.max(1, Number(process.env.SESSION_DAYS || 7))
  await query(
    `INSERT INTO sessions (token_hash, membership_id, expires_at, ip_address, user_agent)
     VALUES ($1, $2, NOW() + ($3 || ' days')::interval, $4, $5)`,
    [hashToken(token), membershipId, String(days), request.ip, String(request.headers['user-agent'] || '').slice(0, 500)],
  )
  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: days * 86400000,
  })
}

export function clearSessionCookie(response) {
  response.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', path: '/' })
}
