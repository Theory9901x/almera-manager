import { Router } from 'express'
import { clearSessionCookie, getSessionContext, issueSession, requireAuth, SESSION_COOKIE } from '../auth.mjs'
import { query } from '../db.mjs'
import { hashToken, normalizeEmail, readCookie, verifyPassword } from '../security.mjs'

export const authRouter = Router()
const attempts = new Map()

function loginAllowed(ip) {
  const now = Date.now()
  const recent = (attempts.get(ip) || []).filter(time => now - time < 15 * 60 * 1000)
  attempts.set(ip, recent)
  return recent.length < 10
}

authRouter.post('/login', async (request, response, next) => {
  try {
    if (!loginAllowed(request.ip)) return response.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' })
    const email = normalizeEmail(request.body?.email)
    const password = String(request.body?.password || '')
    const organization = String(request.body?.organization || 'sgimr').trim().toLowerCase()
    if (!email || !password) return response.status(400).json({ error: 'Correo y contraseña son obligatorios' })

    const result = await query(
      `SELECT u.id AS user_id, u.password_hash, m.id AS membership_id
       FROM users u
       JOIN memberships m ON m.user_id = u.id AND m.active = TRUE
       JOIN organizations o ON o.id = m.organization_id AND o.active = TRUE
       WHERE u.email = $1 AND u.active = TRUE AND o.slug = $2`,
      [email, organization],
    )
    const account = result.rows[0]
    if (!account || !verifyPassword(password, account.password_hash)) {
      attempts.set(request.ip, [...(attempts.get(request.ip) || []), Date.now()])
      return response.status(401).json({ error: 'Credenciales incorrectas' })
    }
    attempts.delete(request.ip)
    await issueSession(response, account.membership_id, request)
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [account.user_id])

    response.json({ ok: true })
  } catch (error) { next(error) }
})

authRouter.get('/me', requireAuth, (request, response) => response.json(request.auth))

authRouter.post('/logout', async (request, response, next) => {
  try {
    const token = readCookie(request, SESSION_COOKIE)
    if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)])
    clearSessionCookie(response)
    response.json({ ok: true })
  } catch (error) { next(error) }
})
