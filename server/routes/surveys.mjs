import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import QRCode from 'qrcode'
import { pool, query } from '../db.mjs'
import { requireAnyModuleAccess, requirePermission } from '../auth.mjs'

export const surveysRouter = Router()

// Imagenes de opciones (seleccion con imagenes, emparejamiento): se sirven publicas y sin auth
// desde /uploads/surveys (montado en server/index.mjs), a diferencia de las evidencias de otros
// modulos que solo se descargan autenticadas. Son contenido pensado para verse en el enlace publico.
const mediaRoot = resolve(process.env.SURVEYS_UPLOAD_DIR || 'uploads/surveys')
await mkdir(mediaRoot, { recursive: true })
const allowedImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: mediaRoot,
    filename: (_request, file, callback) => callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase().slice(0, 6)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (allowedImageTypes.has(file.mimetype)) return callback(null, true)
    const error = new Error('Solo se permiten imágenes PNG, JPEG, WEBP o GIF de hasta 5MB')
    error.status = 415
    callback(error)
  },
})

const oid = request => request.auth.organization.id
const uid = request => request.auth.user.id
const surveysModule = requireAnyModuleAccess(['surveys'])
const view = requirePermission('surveys.view')
const create = requirePermission('surveys.create')
const edit = requirePermission('surveys.edit')
const del = requirePermission('surveys.delete')
const exportPerm = requirePermission('surveys.export')

function fail(status, message) {
  const error = new Error(message)
  error.status = status
  throw error
}

const CHOICE_TYPES = new Set(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'DROPDOWN', 'YES_NO', 'IMAGE_CHOICE'])
const QUESTION_TYPES = new Set([
  'SHORT_TEXT', 'LONG_TEXT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'DROPDOWN', 'YES_NO', 'NUMBER', 'DATE',
  'SCALE', 'LIKERT_MATRIX', 'MATCHING', 'RANKING', 'IMAGE_CHOICE', 'EMOJI_SCALE', 'NPS', 'RATING', 'FILE_UPLOAD',
])

function slugToken() {
  return randomUUID().replace(/-/g, '').slice(0, 10)
}

function csvCell(value) {
  let safe = value == null ? '' : String(value)
  if (/^[=+\-@]/.test(safe)) safe = `'${safe}`
  return `"${safe.replaceAll('"', '""')}"`
}

function publicOrigin(request) {
  return process.env.PUBLIC_ORIGIN || `${request.protocol}://${request.get('host')}`
}

function normalizeOption(option) {
  return {
    id: option.id || `opt_${slugToken()}`,
    label: String(option.label || '').trim(),
    imageUrl: option.imageUrl || undefined,
    emoji: option.emoji || undefined,
    color: option.color || undefined,
  }
}

// cardAccent: activa el estilo de tarjeta de linea (borde, icono, pastilla) sobre una pregunta de
// opciones ya existente — puramente visual, no afecta validacion ni calculo de puntaje.
function normalizeCardAccent(cardAccent) {
  if (!cardAccent || typeof cardAccent !== 'object' || !cardAccent.color) return undefined
  return {
    color: String(cardAccent.color),
    icon: cardAccent.icon ? String(cardAccent.icon) : undefined,
    badge: cardAccent.badge ? String(cardAccent.badge) : undefined,
  }
}

function normalizeConfig(type, config = {}) {
  const base = config && typeof config === 'object' ? config : {}
  if (CHOICE_TYPES.has(type) && type !== 'YES_NO') {
    const options = Array.isArray(base.options) ? base.options : []
    return {
      ...base,
      options: options.map(normalizeOption),
      randomize: Boolean(base.randomize),
      minSelected: base.minSelected != null ? Number(base.minSelected) : null,
      maxSelected: base.maxSelected != null ? Number(base.maxSelected) : null,
      multiple: type === 'IMAGE_CHOICE' ? Boolean(base.multiple) : undefined,
      cardAccent: normalizeCardAccent(base.cardAccent),
    }
  }
  if (type === 'SCALE') {
    return {
      min: Number(base.min) || 1,
      max: Number(base.max) || 5,
      minLabel: String(base.minLabel || ''),
      maxLabel: String(base.maxLabel || ''),
    }
  }
  if (type === 'LIKERT_MATRIX') {
    const rows = Array.isArray(base.rows) ? base.rows : []
    return {
      rows: rows.map(row => ({ id: row.id || `row_${slugToken()}`, label: String(row.label || '').trim() })),
      scaleMin: Number(base.scaleMin) || 1,
      scaleMax: Number(base.scaleMax) || 5,
      scaleLabels: Array.isArray(base.scaleLabels) ? base.scaleLabels.map(String) : [],
    }
  }
  if (type === 'NUMBER') {
    return { min: base.min != null ? Number(base.min) : null, max: base.max != null ? Number(base.max) : null }
  }
  if (type === 'RANKING') {
    const options = Array.isArray(base.options) ? base.options : []
    return { options: options.map(normalizeOption) }
  }
  if (type === 'MATCHING') {
    const items = Array.isArray(base.items) ? base.items : []
    const targets = Array.isArray(base.targets) ? base.targets : []
    const normalizedItems = items.map(normalizeOption)
    const normalizedTargets = targets.map(target => ({
      id: target.id || `tgt_${slugToken()}`,
      label: String(target.label || '').trim(),
      color: target.color || undefined,
      icon: target.icon || undefined,
      badge: target.badge || undefined,
    }))
    const validItemIds = new Set(normalizedItems.map(item => item.id))
    const validTargetIds = new Set(normalizedTargets.map(target => target.id))
    // correctPairs: targetId -> lista de itemIds correctos ahi (un item puede ser correcto en
    // varios grupos a la vez).
    const correctPairs = {}
    if (base.correctPairs && typeof base.correctPairs === 'object') {
      for (const [targetId, itemIds] of Object.entries(base.correctPairs)) {
        if (!validTargetIds.has(targetId)) continue
        const list = Array.isArray(itemIds) ? itemIds.filter(id => validItemIds.has(id)) : []
        if (list.length) correctPairs[targetId] = list
      }
    }
    return {
      items: normalizedItems,
      targets: normalizedTargets,
      correctPairs,
      sceneImage: base.sceneImage || undefined,
      sceneCaption: base.sceneCaption || undefined,
    }
  }
  if (type === 'EMOJI_SCALE') {
    const steps = Array.isArray(base.steps) ? base.steps : []
    return { steps: steps.map(step => ({ emoji: String(step.emoji || '🙂'), label: String(step.label || '') })) }
  }
  if (type === 'RATING') {
    return { max: Math.max(3, Math.min(10, Number(base.max) || 5)) }
  }
  return base
}

// Nunca se expone al publico una respuesta correcta / clave de calificacion embebida en la
// configuracion de una pregunta (por ejemplo, pares correctos de un emparejamiento en fase 2).
function sanitizeConfigForPublic(config = {}) {
  const clean = {}
  for (const [key, value] of Object.entries(config || {})) {
    if (/^correct/i.test(key) || /answerkey/i.test(key)) continue
    clean[key] = value
  }
  return clean
}

async function loadSurveyMeta(surveyId, organizationId) {
  const result = await query(
    `SELECT s.*, u.full_name AS created_by_name,
            (SELECT COUNT(*)::int FROM survey_responses r WHERE r.survey_id = s.id) AS response_count,
            (SELECT COUNT(*)::int FROM survey_responses r WHERE r.survey_id = s.id AND r.completed) AS completed_count
     FROM surveys s JOIN users u ON u.id = s.created_by_id
     WHERE s.id = $1 AND s.organization_id = $2`,
    [surveyId, organizationId],
  )
  return result.rows[0]
}

async function loadStructure(surveyId) {
  const [pagesResult, questionsResult] = await Promise.all([
    query('SELECT * FROM survey_pages WHERE survey_id = $1 ORDER BY order_index, id', [surveyId]),
    query(
      `SELECT q.* FROM survey_questions q JOIN survey_pages p ON p.id = q.page_id
       WHERE p.survey_id = $1 ORDER BY q.order_index, q.id`,
      [surveyId],
    ),
  ])
  return pagesResult.rows.map(page => ({
    ...page,
    questions: questionsResult.rows.filter(question => question.page_id === page.id),
  }))
}

async function assertSurvey(request) {
  const survey = await loadSurveyMeta(Number(request.params.id), oid(request))
  if (!survey) fail(404, 'Encuesta no encontrada')
  return survey
}

surveysRouter.get('/', surveysModule, view, async (request, response, next) => {
  try {
    const params = [oid(request)]
    const where = ['s.organization_id = $1', 's.is_template = $2']
    params.push(request.query.template === 'true')
    if (request.query.status) { params.push(request.query.status); where.push(`s.status = $${params.length}`) }
    if (request.query.audience) { params.push(request.query.audience); where.push(`s.audience = $${params.length}`) }
    if (request.query.q) { params.push(`%${request.query.q}%`); where.push(`(s.title ILIKE $${params.length} OR s.code ILIKE $${params.length})`) }
    const result = await query(
      `SELECT s.id, s.code, s.slug, s.title, s.description, s.audience, s.status, s.theme_color, s.is_template,
              s.opens_at, s.closes_at, s.created_at, s.updated_at, s.published_at, s.closed_at,
              u.full_name AS created_by_name,
              (SELECT COUNT(*)::int FROM survey_responses r WHERE r.survey_id = s.id) AS response_count,
              (SELECT COUNT(*)::int FROM survey_responses r WHERE r.survey_id = s.id AND r.completed) AS completed_count
       FROM surveys s JOIN users u ON u.id = s.created_by_id
       WHERE ${where.join(' AND ')} ORDER BY s.created_at DESC`,
      params,
    )
    response.json(result.rows)
  } catch (error) { next(error) }
})

surveysRouter.post('/', surveysModule, create, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const body = request.body || {}
    if (!body.title || !String(body.title).trim()) fail(400, 'El título es obligatorio')
    const audience = ['CLIENTE_INTERNO', 'CLIENTE_EXTERNO'].includes(body.audience) ? body.audience : 'CLIENTE_EXTERNO'

    await client.query('BEGIN')
    const sequence = await client.query(
      `SELECT COUNT(*)::int + 1 AS n FROM surveys WHERE organization_id = $1 AND code LIKE $2`,
      [oid(request), `ENC-${new Date().getFullYear()}-%`],
    )
    const code = `ENC-${new Date().getFullYear()}-${String(sequence.rows[0].n).padStart(4, '0')}`

    let slug = slugToken()
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const exists = await client.query('SELECT 1 FROM surveys WHERE slug = $1', [slug])
      if (!exists.rows[0]) break
      slug = slugToken()
    }

    const inserted = await client.query(
      `INSERT INTO surveys (organization_id, code, slug, title, description, audience, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [oid(request), code, slug, String(body.title).trim(), String(body.description || '').trim(), audience, uid(request)],
    )
    const surveyId = inserted.rows[0].id
    await client.query(`INSERT INTO survey_pages (survey_id, order_index, title) VALUES ($1, 0, 'Página 1')`, [surveyId])
    await client.query('COMMIT')

    const survey = await loadSurveyMeta(surveyId, oid(request))
    response.status(201).json(survey)
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})

surveysRouter.get('/:id', surveysModule, view, async (request, response, next) => {
  try {
    const survey = await assertSurvey(request)
    const pages = await loadStructure(survey.id)
    response.json({ ...survey, pages })
  } catch (error) { next(error) }
})

surveysRouter.patch('/:id', surveysModule, edit, async (request, response, next) => {
  try {
    const survey = await assertSurvey(request)
    const body = request.body || {}
    const fields = []
    const params = []
    function set(column, value) { params.push(value); fields.push(`${column} = $${params.length}`) }
    if (body.title !== undefined) set('title', String(body.title).trim())
    if (body.description !== undefined) set('description', String(body.description))
    if (body.coverImage !== undefined) set('cover_image', body.coverImage || null)
    if (body.audience !== undefined) {
      if (!['CLIENTE_INTERNO', 'CLIENTE_EXTERNO'].includes(body.audience)) fail(400, 'Audiencia inválida')
      set('audience', body.audience)
    }
    if (body.allowMultipleResponses !== undefined) set('allow_multiple_responses', Boolean(body.allowMultipleResponses))
    if (body.requireLogin !== undefined) set('require_login', Boolean(body.requireLogin))
    if (body.themeColor !== undefined) set('theme_color', String(body.themeColor))
    if (body.thankYouMessage !== undefined) set('thank_you_message', String(body.thankYouMessage))
    if (body.opensAt !== undefined) set('opens_at', body.opensAt || null)
    if (body.closesAt !== undefined) set('closes_at', body.closesAt || null)
    if (body.isTemplate !== undefined) set('is_template', Boolean(body.isTemplate))
    if (!fields.length) return response.json(survey)
    params.push(survey.id, oid(request))
    await query(`UPDATE surveys SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${params.length - 1} AND organization_id = $${params.length}`, params)
    response.json(await loadSurveyMeta(survey.id, oid(request)))
  } catch (error) { next(error) }
})

surveysRouter.post('/:id/duplicate', surveysModule, create, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const survey = await assertSurvey(request)
    const pages = await loadStructure(survey.id)
    const body = request.body || {}
    const asTemplate = Boolean(body.asTemplate)
    const title = body.title ? String(body.title).trim() : `${survey.title} (copia)`

    await client.query('BEGIN')
    const sequence = await client.query(
      `SELECT COUNT(*)::int + 1 AS n FROM surveys WHERE organization_id = $1 AND code LIKE $2`,
      [oid(request), `ENC-${new Date().getFullYear()}-%`],
    )
    const code = `ENC-${new Date().getFullYear()}-${String(sequence.rows[0].n).padStart(4, '0')}`
    let slug = slugToken()
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const exists = await client.query('SELECT 1 FROM surveys WHERE slug = $1', [slug])
      if (!exists.rows[0]) break
      slug = slugToken()
    }
    const inserted = await client.query(
      `INSERT INTO surveys (organization_id, code, slug, title, description, audience, theme_color, thank_you_message,
                             allow_multiple_responses, require_login, is_template, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [oid(request), code, slug, title, survey.description, survey.audience, survey.theme_color,
        survey.thank_you_message, survey.allow_multiple_responses, survey.require_login, asTemplate, uid(request)],
    )
    const newSurveyId = inserted.rows[0].id
    for (const page of pages) {
      const newPage = await client.query(
        `INSERT INTO survey_pages (survey_id, order_index, title, description) VALUES ($1,$2,$3,$4) RETURNING id`,
        [newSurveyId, page.order_index, page.title, page.description],
      )
      for (const question of page.questions) {
        await client.query(
          `INSERT INTO survey_questions (page_id, order_index, type, prompt, description, image_url, required, config, logic)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [newPage.rows[0].id, question.order_index, question.type, question.prompt, question.description,
            question.image_url, question.required, question.config, question.logic],
        )
      }
    }
    await client.query('COMMIT')
    response.status(201).json(await loadSurveyMeta(newSurveyId, oid(request)))
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})

surveysRouter.delete('/:id', surveysModule, del, async (request, response, next) => {
  try {
    const survey = await assertSurvey(request)
    if (survey.response_count > 0) fail(409, 'Cierra y exporta la encuesta antes de eliminarla: ya tiene respuestas registradas')
    await query('DELETE FROM surveys WHERE id = $1 AND organization_id = $2', [survey.id, oid(request)])
    response.json({ ok: true })
  } catch (error) { next(error) }
})

surveysRouter.post('/:id/publish', surveysModule, edit, async (request, response, next) => {
  try {
    const survey = await assertSurvey(request)
    const pages = await loadStructure(survey.id)
    if (!pages.some(page => page.questions.length > 0)) fail(400, 'Agrega al menos una pregunta antes de publicar')
    await query(
      `UPDATE surveys SET status = 'PUBLICADA', published_at = COALESCE(published_at, NOW()), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [survey.id, oid(request)],
    )
    response.json(await loadSurveyMeta(survey.id, oid(request)))
  } catch (error) { next(error) }
})

surveysRouter.post('/:id/close', surveysModule, edit, async (request, response, next) => {
  try {
    const survey = await assertSurvey(request)
    await query(`UPDATE surveys SET status = 'CERRADA', closed_at = NOW(), updated_at = NOW() WHERE id = $1 AND organization_id = $2`, [survey.id, oid(request)])
    response.json(await loadSurveyMeta(survey.id, oid(request)))
  } catch (error) { next(error) }
})

surveysRouter.post('/:id/reopen', surveysModule, edit, async (request, response, next) => {
  try {
    const survey = await assertSurvey(request)
    await query(`UPDATE surveys SET status = 'PUBLICADA', closed_at = NULL, updated_at = NOW() WHERE id = $1 AND organization_id = $2`, [survey.id, oid(request)])
    response.json(await loadSurveyMeta(survey.id, oid(request)))
  } catch (error) { next(error) }
})

surveysRouter.get('/:id/link', surveysModule, view, async (request, response, next) => {
  try {
    const survey = await assertSurvey(request)
    const url = `${publicOrigin(request)}/e/${survey.slug}`
    const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: '#152238', light: '#ffffff' } })
    response.json({ url, qrDataUrl })
  } catch (error) { next(error) }
})

// Imagen para una opcion (seleccion con imagenes / emparejamiento). Devuelve una URL publica y
// estable que luego se guarda dentro del config JSON de la pregunta.
surveysRouter.post('/:id/media', surveysModule, edit, mediaUpload.single('file'), async (request, response, next) => {
  try {
    await assertSurvey(request)
    if (!request.file) fail(400, 'Adjunta una imagen')
    response.status(201).json({ url: `/uploads/surveys/${request.file.filename}` })
  } catch (error) { next(error) }
})

// ---- Páginas ----

surveysRouter.post('/:id/pages', surveysModule, edit, async (request, response, next) => {
  try {
    const survey = await assertSurvey(request)
    const body = request.body || {}
    const orderResult = await query('SELECT COALESCE(MAX(order_index), -1) + 1 AS n FROM survey_pages WHERE survey_id = $1', [survey.id])
    const inserted = await query(
      `INSERT INTO survey_pages (survey_id, order_index, title, description) VALUES ($1,$2,$3,$4) RETURNING *`,
      [survey.id, orderResult.rows[0].n, String(body.title || `Página ${orderResult.rows[0].n + 1}`), String(body.description || '')],
    )
    response.status(201).json({ ...inserted.rows[0], questions: [] })
  } catch (error) { next(error) }
})

surveysRouter.patch('/:id/pages/:pageId', surveysModule, edit, async (request, response, next) => {
  try {
    const survey = await assertSurvey(request)
    const body = request.body || {}
    const result = await query(
      `UPDATE survey_pages SET title = COALESCE($1, title), description = COALESCE($2, description)
       WHERE id = $3 AND survey_id = $4 RETURNING *`,
      [body.title !== undefined ? String(body.title) : null, body.description !== undefined ? String(body.description) : null, Number(request.params.pageId), survey.id],
    )
    if (!result.rows[0]) fail(404, 'Página no encontrada')
    response.json(result.rows[0])
  } catch (error) { next(error) }
})

surveysRouter.delete('/:id/pages/:pageId', surveysModule, edit, async (request, response, next) => {
  try {
    const survey = await assertSurvey(request)
    const countResult = await query('SELECT COUNT(*)::int AS n FROM survey_pages WHERE survey_id = $1', [survey.id])
    if (countResult.rows[0].n <= 1) fail(400, 'La encuesta debe conservar al menos una página')
    await query('DELETE FROM survey_pages WHERE id = $1 AND survey_id = $2', [Number(request.params.pageId), survey.id])
    response.json({ ok: true })
  } catch (error) { next(error) }
})

surveysRouter.put('/:id/pages/reorder', surveysModule, edit, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const survey = await assertSurvey(request)
    const order = Array.isArray(request.body?.order) ? request.body.order.map(Number) : []
    await client.query('BEGIN')
    for (let index = 0; index < order.length; index += 1) {
      await client.query('UPDATE survey_pages SET order_index = $1 WHERE id = $2 AND survey_id = $3', [index, order[index], survey.id])
    }
    await client.query('COMMIT')
    response.json({ ok: true })
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})

// ---- Preguntas ----

surveysRouter.post('/:id/pages/:pageId/questions', surveysModule, edit, async (request, response, next) => {
  try {
    const survey = await assertSurvey(request)
    const page = await query('SELECT id FROM survey_pages WHERE id = $1 AND survey_id = $2', [Number(request.params.pageId), survey.id])
    if (!page.rows[0]) fail(404, 'Página no encontrada')
    const body = request.body || {}
    if (!QUESTION_TYPES.has(body.type)) fail(400, 'Tipo de pregunta inválido')
    if (!body.prompt || !String(body.prompt).trim()) fail(400, 'El enunciado es obligatorio')
    const orderResult = await query('SELECT COALESCE(MAX(order_index), -1) + 1 AS n FROM survey_questions WHERE page_id = $1', [page.rows[0].id])
    const inserted = await query(
      `INSERT INTO survey_questions (page_id, order_index, type, prompt, description, image_url, required, config)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [page.rows[0].id, orderResult.rows[0].n, body.type, String(body.prompt).trim(), String(body.description || ''),
        body.imageUrl || null, Boolean(body.required), JSON.stringify(normalizeConfig(body.type, body.config))],
    )
    response.status(201).json(inserted.rows[0])
  } catch (error) { next(error) }
})

surveysRouter.patch('/:id/questions/:questionId', surveysModule, edit, async (request, response, next) => {
  try {
    const survey = await assertSurvey(request)
    const existing = await query(
      `SELECT q.* FROM survey_questions q JOIN survey_pages p ON p.id = q.page_id
       WHERE q.id = $1 AND p.survey_id = $2`,
      [Number(request.params.questionId), survey.id],
    )
    if (!existing.rows[0]) fail(404, 'Pregunta no encontrada')
    const current = existing.rows[0]
    const body = request.body || {}
    const type = body.type && QUESTION_TYPES.has(body.type) ? body.type : current.type

    if (body.pageId !== undefined && Number(body.pageId) !== current.page_id) {
      const targetPage = await query('SELECT id FROM survey_pages WHERE id = $1 AND survey_id = $2', [Number(body.pageId), survey.id])
      if (!targetPage.rows[0]) fail(400, 'La página destino no pertenece a esta encuesta')
    }

    const result = await query(
      `UPDATE survey_questions SET
         page_id = COALESCE($1, page_id), type = $2, prompt = COALESCE($3, prompt), description = COALESCE($4, description),
         image_url = $5, required = COALESCE($6, required), config = COALESCE($7, config), logic = COALESCE($8, logic),
         updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [
        body.pageId !== undefined ? Number(body.pageId) : null,
        type,
        body.prompt !== undefined ? String(body.prompt).trim() : null,
        body.description !== undefined ? String(body.description) : null,
        body.imageUrl !== undefined ? (body.imageUrl || null) : current.image_url,
        body.required !== undefined ? Boolean(body.required) : null,
        body.config !== undefined ? JSON.stringify(normalizeConfig(type, body.config)) : null,
        body.logic !== undefined ? JSON.stringify(body.logic) : null,
        current.id,
      ],
    )
    response.json(result.rows[0])
  } catch (error) { next(error) }
})

surveysRouter.delete('/:id/questions/:questionId', surveysModule, edit, async (request, response, next) => {
  try {
    const survey = await assertSurvey(request)
    await query(
      `DELETE FROM survey_questions q USING survey_pages p WHERE q.page_id = p.id AND p.survey_id = $1 AND q.id = $2`,
      [survey.id, Number(request.params.questionId)],
    )
    response.json({ ok: true })
  } catch (error) { next(error) }
})

surveysRouter.post('/:id/questions/:questionId/duplicate', surveysModule, edit, async (request, response, next) => {
  try {
    const survey = await assertSurvey(request)
    const existing = await query(
      `SELECT q.* FROM survey_questions q JOIN survey_pages p ON p.id = q.page_id WHERE q.id = $1 AND p.survey_id = $2`,
      [Number(request.params.questionId), survey.id],
    )
    if (!existing.rows[0]) fail(404, 'Pregunta no encontrada')
    const current = existing.rows[0]
    const orderResult = await query('SELECT COALESCE(MAX(order_index), -1) + 1 AS n FROM survey_questions WHERE page_id = $1', [current.page_id])
    const inserted = await query(
      `INSERT INTO survey_questions (page_id, order_index, type, prompt, description, image_url, required, config, logic)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [current.page_id, orderResult.rows[0].n, current.type, `${current.prompt} (copia)`, current.description,
        current.image_url, current.required, current.config, current.logic],
    )
    response.status(201).json(inserted.rows[0])
  } catch (error) { next(error) }
})

surveysRouter.put('/:id/pages/:pageId/questions/reorder', surveysModule, edit, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const survey = await assertSurvey(request)
    const order = Array.isArray(request.body?.order) ? request.body.order.map(Number) : []
    await client.query('BEGIN')
    for (let index = 0; index < order.length; index += 1) {
      await client.query(
        `UPDATE survey_questions q SET order_index = $1, page_id = $2
         FROM survey_pages p WHERE q.page_id = p.id AND p.survey_id = $3 AND q.id = $4`,
        [index, Number(request.params.pageId), survey.id, order[index]],
      )
    }
    await client.query('COMMIT')
    response.json({ ok: true })
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})

// ---- Respuestas y analítica ----

function buildResponseFilters(request, params, where) {
  if (request.query.month) { params.push(request.query.month); where.push(`r.month_reported = $${params.length}`) }
  if (request.query.respondentMembershipId) { params.push(Number(request.query.respondentMembershipId)); where.push(`r.respondent_membership_id = $${params.length}`) }
  // Cruce basico por pregunta de perfil (ej. sexo, area, linea de beneficio): solo cuenta la
  // respuesta si tambien contesto esa otra pregunta con el valor exacto indicado.
  if (request.query.segmentQuestionId && request.query.segmentValue) {
    params.push(Number(request.query.segmentQuestionId))
    const questionParam = params.length
    params.push(String(request.query.segmentValue))
    const valueParam = params.length
    where.push(`EXISTS (
      SELECT 1 FROM survey_response_items si
      WHERE si.response_id = r.id AND si.question_id = $${questionParam}
        AND COALESCE(si.value->>'optionId', '') = $${valueParam}
    )`)
  }
}

function previousMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber - 1, 1))
  date.setUTCMonth(date.getUTCMonth() - 1)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

surveysRouter.get('/:id/responses', surveysModule, view, async (request, response, next) => {
  try {
    const survey = await assertSurvey(request)
    const params = [survey.id]
    const where = ['r.survey_id = $1']
    buildResponseFilters(request, params, where)
    const limit = Math.min(200, Number(request.query.limit) || 50)
    const offset = Math.max(0, Number(request.query.offset) || 0)
    const result = await query(
      `SELECT r.id, r.month_reported, r.channel, r.completed, r.started_at, r.submitted_at,
              m.id AS membership_id, u.full_name AS respondent_name
       FROM survey_responses r
       LEFT JOIN memberships m ON m.id = r.respondent_membership_id
       LEFT JOIN users u ON u.id = m.user_id
       WHERE ${where.join(' AND ')} ORDER BY COALESCE(r.submitted_at, r.started_at) DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params,
    )
    response.json(result.rows)
  } catch (error) { next(error) }
})

surveysRouter.get('/:id/responses/:responseId', surveysModule, view, async (request, response, next) => {
  try {
    const survey = await assertSurvey(request)
    const responseResult = await query(
      `SELECT r.*, u.full_name AS respondent_name FROM survey_responses r
       LEFT JOIN memberships m ON m.id = r.respondent_membership_id
       LEFT JOIN users u ON u.id = m.user_id
       WHERE r.id = $1 AND r.survey_id = $2`,
      [Number(request.params.responseId), survey.id],
    )
    if (!responseResult.rows[0]) fail(404, 'Respuesta no encontrada')
    const items = await query(
      `SELECT i.question_id, i.value, i.text_value, q.prompt, q.type
       FROM survey_response_items i JOIN survey_questions q ON q.id = i.question_id
       WHERE i.response_id = $1 ORDER BY q.order_index`,
      [responseResult.rows[0].id],
    )
    response.json({ ...responseResult.rows[0], items: items.rows })
  } catch (error) { next(error) }
})

surveysRouter.get('/:id/respondents', surveysModule, view, async (request, response, next) => {
  try {
    const survey = await assertSurvey(request)
    const result = await query(
      `SELECT DISTINCT m.id AS membership_id, u.full_name
       FROM survey_responses r JOIN memberships m ON m.id = r.respondent_membership_id JOIN users u ON u.id = m.user_id
       WHERE r.survey_id = $1 ORDER BY u.full_name`,
      [survey.id],
    )
    response.json(result.rows)
  } catch (error) { next(error) }
})

// Contador liviano para el "en vivo" del panel de resultados mientras la encuesta esta abierta:
// evita recalcular toda la tabulacion en cada sondeo periodico del frontend.
surveysRouter.get('/:id/live-count', surveysModule, view, async (request, response, next) => {
  try {
    const survey = await assertSurvey(request)
    const result = await query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE completed)::int AS completed FROM survey_responses WHERE survey_id = $1`,
      [survey.id],
    )
    response.json({ totalResponses: result.rows[0].total, completedResponses: result.rows[0].completed })
  } catch (error) { next(error) }
})

async function countCompleted(surveyId, month) {
  const result = await query(
    `SELECT COUNT(*)::int AS completed FROM survey_responses WHERE survey_id = $1 AND month_reported = $2 AND completed = TRUE`,
    [surveyId, month],
  )
  return result.rows[0].completed
}

surveysRouter.get('/:id/stats', surveysModule, view, async (request, response, next) => {
  try {
    const survey = await assertSurvey(request)
    const pages = await loadStructure(survey.id)
    const questions = pages.flatMap(page => page.questions)

    const params = [survey.id]
    const where = ['r.survey_id = $1']
    buildResponseFilters(request, params, where)

    const totalsResult = await query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE r.completed)::int AS completed
       FROM survey_responses r WHERE ${where.join(' AND ')}`,
      params,
    )
    const monthsResult = await query(
      `SELECT DISTINCT month_reported FROM survey_responses WHERE survey_id = $1 ORDER BY month_reported DESC`,
      [survey.id],
    )

    const itemsResult = await query(
      `SELECT i.question_id, i.value, i.text_value
       FROM survey_response_items i JOIN survey_responses r ON r.id = i.response_id
       WHERE ${where.join(' AND ')} AND r.completed = TRUE`,
      params,
    )
    const itemsByQuestion = new Map()
    for (const row of itemsResult.rows) {
      const list = itemsByQuestion.get(row.question_id) || []
      list.push(row)
      itemsByQuestion.set(row.question_id, list)
    }

    const questionStats = questions.map(question => {
      const items = itemsByQuestion.get(question.id) || []
      return { id: question.id, type: question.type, prompt: question.prompt, pageId: question.page_id, ...computeQuestionStats(question, items) }
    })

    // Comparacion entre periodos: solo tiene sentido cuando se esta mirando un mes puntual.
    let comparison = null
    if (request.query.month) {
      const previous = previousMonth(String(request.query.month))
      const previousCompleted = await countCompleted(survey.id, previous)
      const currentCompleted = totalsResult.rows[0].completed
      comparison = {
        previousMonth: previous,
        previousCompletedResponses: previousCompleted,
        deltaPercent: previousCompleted ? Math.round(((currentCompleted - previousCompleted) / previousCompleted) * 100) : null,
      }
    }

    response.json({
      survey: { id: survey.id, title: survey.title, status: survey.status },
      totals: {
        totalResponses: totalsResult.rows[0].total,
        completedResponses: totalsResult.rows[0].completed,
        partialResponses: totalsResult.rows[0].total - totalsResult.rows[0].completed,
        completionRate: totalsResult.rows[0].total ? Math.round((totalsResult.rows[0].completed / totalsResult.rows[0].total) * 100) : 0,
      },
      months: monthsResult.rows.map(row => row.month_reported),
      comparison,
      questions: questionStats,
    })
  } catch (error) { next(error) }
})

function computeQuestionStats(question, items) {
  const totalAnswered = items.length
  const config = question.config || {}

  if (CHOICE_TYPES.has(question.type)) {
    const options = question.type === 'YES_NO'
      ? [{ id: 'SI', label: 'Sí' }, { id: 'NO', label: 'No' }]
      : (config.options || [])
    const isMultiple = question.type === 'MULTIPLE_CHOICE' || (question.type === 'IMAGE_CHOICE' && config.multiple)
    const counts = new Map(options.map(option => [option.id, 0]))
    for (const item of items) {
      const value = item.value || {}
      const ids = isMultiple ? (value.optionIds || []) : [value.optionId].filter(Boolean)
      for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1)
    }
    const breakdown = options.map(option => {
      const count = counts.get(option.id) || 0
      return { optionId: option.id, label: option.label, count, percent: totalAnswered ? Math.round((count / totalAnswered) * 100) : 0 }
    })
    return { totalAnswered, breakdown }
  }

  if (question.type === 'SCALE' || question.type === 'NPS' || question.type === 'RATING' || question.type === 'EMOJI_SCALE') {
    const min = question.type === 'NPS' ? 0 : 1
    const max = question.type === 'NPS' ? 10 : question.type === 'EMOJI_SCALE' ? ((config.steps || []).length || 5) : (Number(config.max) || 5)
    const counts = new Map()
    for (let value = min; value <= max; value += 1) counts.set(value, 0)
    let sum = 0
    let answered = 0
    for (const item of items) {
      const value = Number((item.value || {}).value)
      if (Number.isFinite(value)) { counts.set(value, (counts.get(value) || 0) + 1); sum += value; answered += 1 }
    }
    const breakdown = [...counts.entries()].map(([value, count]) => ({
      value, count, percent: answered ? Math.round((count / answered) * 100) : 0,
      label: question.type === 'EMOJI_SCALE' ? (config.steps || [])[value - 1]?.emoji : undefined,
    }))
    let npsScore = null
    if (question.type === 'NPS' && answered) {
      const promoters = items.filter(item => Number((item.value || {}).value) >= 9).length
      const detractors = items.filter(item => Number((item.value || {}).value) <= 6).length
      npsScore = Math.round(((promoters - detractors) / answered) * 100)
    }
    return { totalAnswered: answered, average: answered ? Number((sum / answered).toFixed(2)) : null, breakdown, npsScore }
  }

  if (question.type === 'RANKING') {
    const options = config.options || []
    const positions = new Map(options.map(option => [option.id, { sum: 0, count: 0 }]))
    let answered = 0
    for (const item of items) {
      const order = (item.value || {}).order || []
      if (!order.length) continue
      answered += 1
      order.forEach((optionId, index) => {
        const bucket = positions.get(optionId)
        if (bucket) { bucket.sum += index + 1; bucket.count += 1 }
      })
    }
    const ranking = options
      .map(option => {
        const bucket = positions.get(option.id)
        return { optionId: option.id, label: option.label, averagePosition: bucket.count ? Number((bucket.sum / bucket.count).toFixed(2)) : null, totalAnswered: bucket.count }
      })
      .sort((a, b) => (a.averagePosition ?? Infinity) - (b.averagePosition ?? Infinity))
    return { totalAnswered: answered, ranking }
  }

  if (question.type === 'MATCHING') {
    // Cada elemento puede quedar en varias lineas a la vez (pairs[itemId] es una LISTA de
    // targetIds), asi que un solo elemento puede sumar conteo/aciertos en mas de un grupo por
    // respuesta. La clave de calificacion tambien es por grupo: correctPairs[targetId] = [itemIds].
    const items_ = config.items || []
    const targets = config.targets || []
    const correctPairs = config.correctPairs || {}
    const totalExpected = Object.values(correctPairs).reduce((sum, list) => sum + list.length, 0)
    const counts = new Map(items_.map(item => [item.id, new Map(targets.map(target => [target.id, 0]))]))
    let answered = 0
    let correct = 0
    for (const responseItem of items) {
      const pairs = (responseItem.value || {}).pairs || {}
      if (!Object.keys(pairs).length) continue
      answered += 1
      for (const [itemId, targetIds] of Object.entries(pairs)) {
        const perItem = counts.get(itemId)
        for (const targetId of (Array.isArray(targetIds) ? targetIds : [])) {
          if (perItem && perItem.has(targetId)) perItem.set(targetId, perItem.get(targetId) + 1)
          if ((correctPairs[targetId] || []).includes(itemId)) correct += 1
        }
      }
    }
    const matching = items_.map(item => {
      const perItem = counts.get(item.id)
      const best = [...perItem.entries()].sort((a, b) => b[1] - a[1])[0]
      const bestTarget = best && best[1] > 0 ? targets.find(target => target.id === best[0]) : null
      return {
        itemId: item.id, label: item.label,
        topTargetLabel: bestTarget?.label || null, topTargetCount: best ? best[1] : 0,
        breakdown: targets.map(target => ({ targetId: target.id, label: target.label, count: perItem.get(target.id) || 0 })),
      }
    })
    const accuracyPercent = totalExpected && answered ? Math.round((correct / (totalExpected * answered)) * 100) : null
    return { totalAnswered: answered, matching, accuracyPercent }
  }

  if (question.type === 'LIKERT_MATRIX') {
    const rows = config.rows || []
    const rowStats = rows.map(row => {
      let sum = 0
      let answered = 0
      for (const item of items) {
        const value = Number(((item.value || {}).rows || {})[row.id])
        if (Number.isFinite(value)) { sum += value; answered += 1 }
      }
      return { rowId: row.id, label: row.label, average: answered ? Number((sum / answered).toFixed(2)) : null, totalAnswered: answered }
    })
    return { totalAnswered, rows: rowStats }
  }

  if (question.type === 'NUMBER') {
    const values = items.map(item => Number((item.value || {}).number)).filter(Number.isFinite)
    const sum = values.reduce((accumulator, value) => accumulator + value, 0)
    return {
      totalAnswered: values.length,
      average: values.length ? Number((sum / values.length).toFixed(2)) : null,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
    }
  }

  // Texto libre, fecha y tipos avanzados de fase 2: se devuelve una muestra de respuestas recientes.
  return { totalAnswered, sample: items.slice(0, 8).map(item => item.text_value).filter(Boolean) }
}

surveysRouter.get('/:id/export.csv', surveysModule, exportPerm, async (request, response, next) => {
  try {
    const survey = await assertSurvey(request)
    const pages = await loadStructure(survey.id)
    const questions = pages.flatMap(page => page.questions)

    const params = [survey.id]
    const where = ['r.survey_id = $1']
    buildResponseFilters(request, params, where)

    const responsesResult = await query(
      `SELECT r.id, r.month_reported, r.channel, r.completed, r.started_at, r.submitted_at, u.full_name AS respondent_name
       FROM survey_responses r
       LEFT JOIN memberships m ON m.id = r.respondent_membership_id
       LEFT JOIN users u ON u.id = m.user_id
       WHERE ${where.join(' AND ')} ORDER BY r.id`,
      params,
    )
    const itemsResult = await query(
      `SELECT i.response_id, i.question_id, i.text_value
       FROM survey_response_items i JOIN survey_responses r ON r.id = i.response_id
       WHERE ${where.join(' AND ')}`,
      params,
    )
    const itemsByResponse = new Map()
    for (const row of itemsResult.rows) {
      const map = itemsByResponse.get(row.response_id) || new Map()
      map.set(row.question_id, row.text_value)
      itemsByResponse.set(row.response_id, map)
    }

    const headers = ['ID', 'Mes', 'Canal', 'Completada', 'Enviada', 'Respondiente', ...questions.map(question => question.prompt)]
    const rows = responsesResult.rows.map(row => {
      const map = itemsByResponse.get(row.id) || new Map()
      return [
        row.id, row.month_reported, row.channel, row.completed ? 'Sí' : 'No',
        row.submitted_at?.toISOString?.() || row.submitted_at || '', row.respondent_name || 'Anónimo',
        ...questions.map(question => map.get(question.id) || ''),
      ]
    })
    const csv = `﻿${[headers, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n')}`
    response.setHeader('Content-Type', 'text/csv; charset=utf-8')
    response.setHeader('Content-Disposition', `attachment; filename="encuesta-${survey.code}.csv"`)
    response.send(csv)
  } catch (error) { next(error) }
})
