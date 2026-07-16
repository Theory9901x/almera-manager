// Motor de puntaje generico y reutilizable para preguntas de opcion unica con clave de
// calificacion (evaluaciones de conocimiento, ej. guias clinicas) — NO hardcodeado para una
// evaluacion en particular. Una pregunta entra al calculo solo si su config trae
// `correctOptionId` (definido desde el constructor); sin eso, queda fuera del puntaje por
// completo — nunca se asume una respuesta correcta por defecto (ver anomalias documentadas al
// cargar la evaluacion de guias clinicas: una pregunta sin opcion marcada como correcta en el
// documento fuente se deja asi, sin clave, en vez de adivinar).

export function scoreQuestion(question, value) {
  const config = question.config || {}
  if (config.correctOptionId == null) return null
  const points = Number(config.points) || 0
  const optionId = (value || {}).optionId
  const correct = optionId != null && String(optionId) === String(config.correctOptionId)
  return { correct, points: correct ? points : 0, maxPoints: points }
}

export function hasScoredQuestions(pages) {
  return pages.some(page => page.questions.some(question => (question.config || {}).correctOptionId != null))
}

// answersByQuestionId: Map<string, value> — el valor tipado de esa pregunta para UNA respuesta.
export function computeResponseScore(pages, answersByQuestionId) {
  const byBlock = []
  let totalEarned = 0
  let totalPossible = 0
  for (const page of pages) {
    let earned = 0
    let possible = 0
    for (const question of page.questions) {
      const result = scoreQuestion(question, answersByQuestionId.get(String(question.id)))
      if (!result) continue
      earned += result.points
      possible += result.maxPoints
    }
    if (possible > 0) byBlock.push({ pageId: String(page.id), title: page.title, earned, possible, percent: Math.round((earned / possible) * 100) })
    totalEarned += earned
    totalPossible += possible
  }
  return { total: { earned: totalEarned, possible: totalPossible, percent: totalPossible ? Math.round((totalEarned / totalPossible) * 100) : null }, byBlock }
}

// Agrega el puntaje de VARIAS respuestas ya completas (itemsByResponse: Map<responseId,
// Map<questionId, value>>) — usado por el panel de resultados para el promedio general y por
// bloque, sumando puntos ganados/posibles de todas las respuestas (no promedio de promedios).
export function aggregateScores(pages, itemsByResponse) {
  const blockTotals = new Map(pages.map(page => [String(page.id), { pageId: String(page.id), title: page.title, earned: 0, possible: 0 }]))
  let totalEarned = 0
  let totalPossible = 0
  let scoredResponses = 0
  for (const answers of itemsByResponse.values()) {
    const { total, byBlock } = computeResponseScore(pages, answers)
    if (!total.possible) continue
    scoredResponses += 1
    totalEarned += total.earned
    totalPossible += total.possible
    for (const block of byBlock) {
      const bucket = blockTotals.get(block.pageId)
      if (bucket) { bucket.earned += block.earned; bucket.possible += block.possible }
    }
  }
  const byBlock = [...blockTotals.values()]
    .filter(block => block.possible > 0)
    .map(block => ({ ...block, percent: Math.round((block.earned / block.possible) * 100) }))
  return {
    total: { earned: totalEarned, possible: totalPossible, percent: totalPossible ? Math.round((totalEarned / totalPossible) * 100) : null },
    byBlock,
    scoredResponses,
  }
}
