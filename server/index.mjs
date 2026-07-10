import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import express from 'express'
import { requireAuth } from './auth.mjs'
import { bootstrap, migrate, pool } from './db.mjs'
import { authRouter } from './routes/auth.mjs'
import { adminRouter } from './routes/admin.mjs'

const isDev = process.argv.includes('--dev')
if (isDev) process.env.NODE_ENV = 'development'
const port = Number(process.env.PORT || 3000)
const host = process.env.HOST || (isDev ? '0.0.0.0' : '127.0.0.1')
const app = express()

app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use((request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (!isDev) response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  next()
})
app.use(express.json({ limit: '1mb' }))

app.use((request, response, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next()
  const origin = request.headers.origin
  const publicOrigin = process.env.PUBLIC_ORIGIN
  if (origin && publicOrigin && origin !== publicOrigin && !isDev) {
    return response.status(403).json({ error: 'Origen no permitido' })
  }
  next()
})

app.get('/api/health', async (_request, response, next) => {
  try {
    await pool.query('SELECT 1')
    response.json({ ok: true, service: 'sgimr-api', time: new Date().toISOString() })
  } catch (error) { next(error) }
})
app.use('/api/auth', authRouter)
app.get('/api/platform', requireAuth, (request, response) => response.json(request.auth))
app.use('/api/admin', requireAuth, adminRouter)
app.use('/api', (_request, response) => response.status(404).json({ error: 'Ruta no encontrada' }))

if (isDev) {
  const { createServer } = await import('vite')
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' })
  app.use(vite.middlewares)
} else {
  const dist = resolve('dist')
  if (!existsSync(dist)) throw new Error('No existe /dist. Ejecuta npm run build antes de iniciar producción.')
  app.use(express.static(dist, { index: false, maxAge: '1h' }))
  app.use((_request, response) => response.sendFile(resolve(dist, 'index.html')))
}

app.use((error, _request, response, _next) => {
  console.error(error)
  const status = Number(error.status || 500)
  response.status(status).json({ error: status === 500 ? 'Error interno del servidor' : error.message })
})

await migrate()
await bootstrap()
const server = app.listen(port, host, () => {
  console.info(`SGIMR disponible en http://${host}:${port} (${isDev ? 'desarrollo' : 'produccion'})`)
})

async function shutdown() {
  server.close(async () => {
    await pool.end()
    process.exit(0)
  })
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
