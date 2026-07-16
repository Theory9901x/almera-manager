import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import express from 'express'
import { requireAuth } from './auth.mjs'
import { bootstrap, migrate, pool } from './db.mjs'
import { closePdfBrowser } from './pdf.mjs'
import { authRouter } from './routes/auth.mjs'
import { adminRouter } from './routes/admin.mjs'
import { almeraRouter } from './routes/almera.mjs'
import { adherenceRouter } from './routes/adherence.mjs'
import { surveysRouter } from './routes/surveys.mjs'
import { surveysPublicRouter } from './routes/surveysPublic.mjs'

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
app.use('/api/almera', requireAuth, almeraRouter)
app.use('/api/adherence', requireAuth, adherenceRouter)
app.use('/api/surveys', requireAuth, surveysRouter)
// Sin requireAuth: es la unica superficie publica del sistema, para que cualquiera con el
// enlace pueda responder una encuesta externa sin iniciar sesion.
app.use('/api/public/surveys', surveysPublicRouter)
app.use('/api', (_request, response) => response.status(404).json({ error: 'Ruta no encontrada' }))

// Imagenes de opciones de encuestas (seleccion con imagenes / emparejamiento): a diferencia de las
// evidencias de otros modulos, estas se muestran en el enlace publico y no requieren sesion.
app.use('/uploads/surveys', express.static(resolve(process.env.SURVEYS_UPLOAD_DIR || 'uploads/surveys'), { maxAge: '30d' }))

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

// El HTML que sirve el SPA es siempre el mismo (title/meta genericos): un crawler de enlaces
// (WhatsApp, Telegram, etc.) no ejecuta JS, asi que sin esto toda encuesta compartida muestra
// "SGIMR" generico en la vista previa. Solo aplica en produccion (dist ya construido); en dev el
// SPA de Vite sirve su propio index.html sin esta capa.
if (!isDev) {
  app.get('/e/:slug', async (request, response, next) => {
    try {
      const result = await pool.query('SELECT title, description, cover_image FROM surveys WHERE slug = $1', [request.params.slug])
      const survey = result.rows[0]
      let html = readFileSync(resolve('dist', 'index.html'), 'utf8')
      if (survey) {
        const origin = process.env.PUBLIC_ORIGIN || `${request.protocol}://${request.get('host')}`
        const title = `Encuesta: ${survey.title}`
        const description = (survey.description || 'Responde esta encuesta de SGIMR.').slice(0, 200)
        const imageUrl = survey.cover_image ? `${origin}${survey.cover_image}` : null
        const metaTags = [
          `<meta property="og:title" content="${escapeHtml(title)}" />`,
          `<meta property="og:description" content="${escapeHtml(description)}" />`,
          '<meta property="og:type" content="website" />',
          imageUrl && `<meta property="og:image" content="${escapeHtml(imageUrl)}" />`,
          `<meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}" />`,
          `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
          `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
        ].filter(Boolean).join('\n    ')
        html = html
          .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
          .replace('</head>', `${metaTags}\n  </head>`)
      }
      response.set('Content-Type', 'text/html').send(html)
    } catch (cause) { next(cause) }
  })
}

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
    await closePdfBrowser()
    await pool.end()
    process.exit(0)
  })
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
