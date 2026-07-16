import { Router } from 'express'
import { pool, query } from '../db.mjs'
import { getSessionContext } from '../auth.mjs'

// Router público: sin requireAuth. Cualquiera con el enlace responde una encuesta CLIENTE_EXTERNO
// sin iniciar sesión. La respuesta siempre queda almacenada en la plataforma.
export const surveysPublicRouter = Router()

const CHOICE_TYPES = new Set(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'DROPDOWN', 'YES_NO', 'IMAGE_CHOICE'])

function fail(status, message) {
  const error = new Error(message)
  error.status = status
  throw error
}

function sanitizeConfigForPublic(config = {}) {
  const clean = {}
  for (const [key, value] of Object.entries(config || {})) {
    if (/^correct/i.test(key) || /answerkey/i.test(key)) continue
    clean[key] = value
  }
  return clean
}

async function loadPublicSurvey(slug) {
  const surveyResult = await query(
    `SELECT id, code, title, description, cover_image, audience, status, theme_color, thank_you_message,
            allow_multiple_responses, require_login, opens_at, closes_at
     FROM surveys WHERE slug = $1`,
    [slug],
  )
  const survey = surveyResult.rows[0]
  if (!survey) return null
  const pagesResult = await query('SELECT id, order_index, title, description FROM survey_pages WHERE survey_id = $1 ORDER BY order_index, id', [survey.id])
  const questionsResult = await query(
    `SELECT q.id, q.page_id, q.order_index, q.type, q.prompt, q.description, q.image_url, q.required, q.config
     FROM survey_questions q JOIN survey_pages p ON p.id = q.page_id
     WHERE p.survey_id = $1 ORDER BY q.order_index, q.id`,
    [survey.id],
  )
  return {
    ...survey,
    pages: pagesResult.rows.map(page => ({
      ...page,
      questions: questionsResult.rows
        .filter(question => question.page_id === page.id)
        .map(question => ({ ...question, config: sanitizeConfigForPublic(question.config) })),
    })),
  }
}

function isWithinWindow(survey) {
  const now = Date.now()
  if (survey.opens_at && now < new Date(survey.opens_at).getTime()) return false
  if (survey.closes_at && now > new Date(survey.closes_at).getTime()) return false
  return true
}

// Control de respuestas duplicadas por dispositivo (fase 4): cuando la encuesta no admite
// multiples respuestas, se busca una respuesta completa previa del mismo dispositivo (localStorage
// persistido en el navegador) o del mismo usuario interno con sesion.
async function findExistingCompletedResponse(surveyId, deviceId, membershipId) {
  if (!deviceId && !membershipId) return null
  const result = await query(
    `SELECT id FROM survey_responses
     WHERE survey_id = $1 AND completed = TRUE
       AND ((device_fingerprint IS NOT NULL AND device_fingerprint = $2) OR (respondent_membership_id IS NOT NULL AND respondent_membership_id = $3))
     LIMIT 1`,
    [surveyId, deviceId || null, membershipId || null],
  )
  return result.rows[0]?.id || null
}

surveysPublicRouter.get('/:slug', async (request, response, next) => {
  try {
    const survey = await loadPublicSurvey(String(request.params.slug))
    if (!survey) return response.status(404).json({ error: 'Encuesta no encontrada' })
    if (survey.status === 'BORRADOR') return response.status(404).json({ error: 'Esta encuesta todavía no ha sido publicada' })
    if (survey.status === 'CERRADA') return response.status(410).json({ error: 'Esta encuesta ya fue cerrada. Gracias por tu interés.' })
    if (!isWithinWindow(survey)) return response.status(410).json({ error: 'Esta encuesta no está disponible en este momento' })

    let requiresSession = false
    let membershipId = null
    if (survey.require_login) {
      const context = await getSessionContext(request)
      requiresSession = !context
      membershipId = context?.membershipId || null
    } else {
      const context = await getSessionContext(request).catch(() => null)
      membershipId = context?.membershipId || null
    }

    let alreadyResponded = false
    if (!survey.allow_multiple_responses) {
      const existing = await findExistingCompletedResponse(survey.id, request.query.deviceId, membershipId)
      alreadyResponded = Boolean(existing)
    }

    response.json({ ...survey, requiresLogin: requiresSession, alreadyResponded })
  } catch (error) { next(error) }
})

function isMultipleChoice(question, config) {
  return question.type === 'MULTIPLE_CHOICE' || (question.type === 'IMAGE_CHOICE' && config.multiple)
}

function deriveTextValue(question, value) {
  const config = question.config || {}
  if (question.type === 'SHORT_TEXT' || question.type === 'LONG_TEXT') return String(value?.text || '')
  if (question.type === 'YES_NO') return value?.optionId === 'SI' ? 'Sí' : value?.optionId === 'NO' ? 'No' : ''
  if (isMultipleChoice(question, config)) {
    const ids = new Set(value?.optionIds || [])
    return (config.options || []).filter(option => ids.has(option.id)).map(option => option.label).join(', ')
  }
  if (question.type === 'SINGLE_CHOICE' || question.type === 'DROPDOWN' || question.type === 'IMAGE_CHOICE') {
    const option = (config.options || []).find(item => item.id === value?.optionId)
    return option?.label || ''
  }
  if (question.type === 'NUMBER') return value?.number != null ? String(value.number) : ''
  if (question.type === 'DATE') return value?.date || ''
  if (question.type === 'SCALE' || question.type === 'NPS' || question.type === 'RATING') return value?.value != null ? String(value.value) : ''
  if (question.type === 'EMOJI_SCALE') {
    const step = (config.steps || [])[(value?.value || 0) - 1]
    return step ? `${step.emoji} ${step.label || ''}`.trim() : ''
  }
  if (question.type === 'LIKERT_MATRIX') {
    const rows = config.rows || []
    const values = value?.rows || {}
    return rows.map(row => `${row.label}: ${values[row.id] ?? '—'}`).join(' | ')
  }
  if (question.type === 'RANKING') {
    const optionsById = new Map((config.options || []).map(option => [option.id, option.label]))
    return (value?.order || []).map((id, index) => `${index + 1}. ${optionsById.get(id) || id}`).join(' | ')
  }
  if (question.type === 'MATCHING') {
    const itemsById = new Map((config.items || []).map(item => [item.id, item.label]))
    const targetsById = new Map((config.targets || []).map(target => [target.id, target.label]))
    return Object.entries(value?.pairs || {}).map(([itemId, targetId]) => `${itemsById.get(itemId) || itemId} → ${targetsById.get(targetId) || targetId}`).join(' | ')
  }
  return value != null ? JSON.stringify(value) : ''
}

function validateAndCoerceValue(question, rawValue, requireAnswer) {
  const config = question.config || {}
  const value = rawValue && typeof rawValue === 'object' ? rawValue : {}

  if (question.type === 'SHORT_TEXT' || question.type === 'LONG_TEXT') {
    const text = String(value.text || '').trim()
    if (requireAnswer && !text) fail(400, `La pregunta "${question.prompt}" es obligatoria`)
    return { text }
  }
  if (question.type === 'YES_NO') {
    if (requireAnswer && !['SI', 'NO'].includes(value.optionId)) fail(400, `La pregunta "${question.prompt}" es obligatoria`)
    return { optionId: ['SI', 'NO'].includes(value.optionId) ? value.optionId : null }
  }
  if (isMultipleChoice(question, config)) {
    const validIds = new Set((config.options || []).map(option => option.id))
    const optionIds = Array.isArray(value.optionIds) ? [...new Set(value.optionIds.filter(id => validIds.has(id)))] : []
    if (requireAnswer && !optionIds.length) fail(400, `La pregunta "${question.prompt}" es obligatoria`)
    if (config.minSelected && optionIds.length && optionIds.length < config.minSelected) fail(400, `Selecciona al menos ${config.minSelected} opciones en "${question.prompt}"`)
    if (config.maxSelected && optionIds.length > config.maxSelected) fail(400, `Selecciona máximo ${config.maxSelected} opciones en "${question.prompt}"`)
    return { optionIds }
  }
  if (question.type === 'SINGLE_CHOICE' || question.type === 'DROPDOWN' || question.type === 'IMAGE_CHOICE') {
    const validIds = new Set((config.options || []).map(option => option.id))
    const optionId = validIds.has(value.optionId) ? value.optionId : null
    if (requireAnswer && !optionId) fail(400, `La pregunta "${question.prompt}" es obligatoria`)
    return { optionId }
  }
  if (question.type === 'NUMBER') {
    const number = value.number === '' || value.number == null ? null : Number(value.number)
    if (requireAnswer && (number === null || Number.isNaN(number))) fail(400, `La pregunta "${question.prompt}" es obligatoria`)
    if (number != null && config.min != null && number < config.min) fail(400, `El valor de "${question.prompt}" debe ser mayor o igual a ${config.min}`)
    if (number != null && config.max != null && number > config.max) fail(400, `El valor de "${question.prompt}" debe ser menor o igual a ${config.max}`)
    return { number: Number.isFinite(number) ? number : null }
  }
  if (question.type === 'DATE') {
    const date = value.date ? String(value.date) : null
    if (requireAnswer && !date) fail(400, `La pregunta "${question.prompt}" es obligatoria`)
    return { date }
  }
  if (question.type === 'SCALE' || question.type === 'RATING') {
    const min = Number(config.min) || 1
    const max = Number(config.max) || 5
    const scaleValue = value.value == null ? null : Number(value.value)
    if (requireAnswer && (scaleValue === null || Number.isNaN(scaleValue))) fail(400, `La pregunta "${question.prompt}" es obligatoria`)
    if (scaleValue != null && (scaleValue < min || scaleValue > max)) fail(400, `El valor de "${question.prompt}" está fuera de rango`)
    return { value: Number.isFinite(scaleValue) ? scaleValue : null }
  }
  if (question.type === 'NPS') {
    const scaleValue = value.value == null ? null : Number(value.value)
    if (requireAnswer && (scaleValue === null || Number.isNaN(scaleValue))) fail(400, `La pregunta "${question.prompt}" es obligatoria`)
    if (scaleValue != null && (scaleValue < 0 || scaleValue > 10)) fail(400, `El valor de "${question.prompt}" está fuera de rango`)
    return { value: Number.isFinite(scaleValue) ? scaleValue : null }
  }
  if (question.type === 'LIKERT_MATRIX') {
    const rowIds = new Set((config.rows || []).map(row => row.id))
    const rows = {}
    for (const [rowId, rowValue] of Object.entries(value.rows || {})) {
      if (rowIds.has(rowId)) rows[rowId] = Number(rowValue)
    }
    if (requireAnswer && rowIds.size && Object.keys(rows).length < rowIds.size) fail(400, `Completa todas las filas de "${question.prompt}"`)
    return { rows }
  }
  if (question.type === 'EMOJI_SCALE') {
    const max = (config.steps || []).length || 5
    const scaleValue = value.value == null ? null : Number(value.value)
    if (requireAnswer && (scaleValue === null || Number.isNaN(scaleValue))) fail(400, `La pregunta "${question.prompt}" es obligatoria`)
    if (scaleValue != null && (scaleValue < 1 || scaleValue > max)) fail(400, `El valor de "${question.prompt}" está fuera de rango`)
    return { value: Number.isFinite(scaleValue) ? scaleValue : null }
  }
  if (question.type === 'RANKING') {
    const validIds = new Set((config.options || []).map(option => option.id))
    const order = Array.isArray(value.order) ? [...new Set(value.order.filter(id => validIds.has(id)))] : []
    if (requireAnswer && order.length < validIds.size) fail(400, `Ordena todas las opciones de "${question.prompt}"`)
    return { order }
  }
  if (question.type === 'MATCHING') {
    const validItemIds = new Set((config.items || []).map(item => item.id))
    const validTargetIds = new Set((config.targets || []).map(target => target.id))
    const pairs = {}
    for (const [itemId, targetId] of Object.entries(value.pairs || {})) {
      if (validItemIds.has(itemId) && validTargetIds.has(targetId)) pairs[itemId] = targetId
    }
    if (requireAnswer && Object.keys(pairs).length < validItemIds.size) fail(400, `Ubica todos los elementos de "${question.prompt}"`)
    return { pairs }
  }
  // Carga de archivo: pendiente de una siguiente fase (requiere endpoint publico de subida con
  // limites de abuso propios); el constructor de fase 1/2 no ofrece este tipo todavia.
  return value
}

surveysPublicRouter.post('/:slug/responses', async (request, response, next) => {
  const client = await pool.connect()
  let inTransaction = false
  try {
    const survey = await loadPublicSurvey(String(request.params.slug))
    if (!survey) return response.status(404).json({ error: 'Encuesta no encontrada' })
    if (survey.status !== 'PUBLICADA') return response.status(410).json({ error: 'Esta encuesta no está disponible para recibir respuestas' })
    if (!isWithinWindow(survey)) return response.status(410).json({ error: 'Esta encuesta no está disponible en este momento' })

    let membershipId = null
    if (survey.require_login) {
      const context = await getSessionContext(request)
      if (!context) return response.status(401).json({ error: 'Debes iniciar sesión para responder esta encuesta' })
      membershipId = context.membershipId
    } else {
      const context = await getSessionContext(request).catch(() => null)
      if (context) membershipId = context.membershipId
    }

    const body = request.body || {}

    // Solo se valida al iniciar una respuesta nueva (sin responseId todavia): continuar un
    // guardado parcial propio nunca se bloquea, solo un segundo intento desde cero.
    if (!body.responseId && !survey.allow_multiple_responses) {
      const existing = await findExistingCompletedResponse(survey.id, body.deviceId, membershipId)
      if (existing) return response.status(409).json({ error: 'Ya enviaste una respuesta para esta encuesta', alreadyResponded: true })
    }

    const completed = Boolean(body.completed)
    const questions = survey.pages.flatMap(page => page.questions)
    const incoming = new Map((Array.isArray(body.items) ? body.items : []).map(item => [Number(item.questionId), item.value]))

    const prepared = questions.map(question => {
      const rawValue = incoming.get(question.id)
      const value = validateAndCoerceValue(question, rawValue, completed && question.required)
      return { question, value }
    })

    await client.query('BEGIN')
    inTransaction = true

    // Si el cliente ya trae un responseId (guardado parcial de un paso anterior), se actualiza el
    // mismo registro en vez de crear uno nuevo — asi se distinguen respuestas completas de parciales
    // sin duplicar filas por cada paso del formulario.
    let responseId = null
    if (body.responseId) {
      const existing = await client.query('SELECT id FROM survey_responses WHERE id = $1 AND survey_id = $2', [Number(body.responseId), survey.id])
      if (existing.rows[0]) responseId = existing.rows[0].id
    }

    if (responseId) {
      await client.query(
        `UPDATE survey_responses SET completed = $1, submitted_at = CASE WHEN $1 THEN NOW() ELSE submitted_at END,
                respondent_membership_id = COALESCE(respondent_membership_id, $2)
         WHERE id = $3`,
        [completed, membershipId, responseId],
      )
    } else {
      const monthReported = new Date().toISOString().slice(0, 7)
      const inserted = await client.query(
        `INSERT INTO survey_responses (survey_id, respondent_membership_id, month_reported, channel, device_fingerprint, completed, submitted_at, ip_address, user_agent)
         VALUES ($1,$2,$3,'PUBLIC_LINK',$4,$5,$6,$7,$8) RETURNING id`,
        [survey.id, membershipId, monthReported, body.deviceId || null, completed, completed ? new Date() : null, request.ip, String(request.headers['user-agent'] || '').slice(0, 500)],
      )
      responseId = inserted.rows[0].id
    }

    for (const { question, value } of prepared) {
      const hasValue = value && Object.values(value).some(entry => entry != null && entry !== '' && !(Array.isArray(entry) && !entry.length) && !(typeof entry === 'object' && !Array.isArray(entry) && !Object.keys(entry).length))
      if (!hasValue) continue
      await client.query(
        `INSERT INTO survey_response_items (response_id, question_id, value, text_value) VALUES ($1,$2,$3,$4)
         ON CONFLICT (response_id, question_id) DO UPDATE SET value = EXCLUDED.value, text_value = EXCLUDED.text_value`,
        [responseId, question.id, JSON.stringify(value), deriveTextValue(question, value)],
      )
    }
    await client.query('COMMIT')
    response.status(201).json({ ok: true, responseId: String(responseId), thankYouMessage: survey.thank_you_message })
  } catch (error) {
    if (inTransaction) await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})
