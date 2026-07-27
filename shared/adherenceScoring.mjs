/**
 * Motor de cumplimiento PONDERADO de Matrices de Adherencia — funcion pura, sin dependencias.
 *
 * Vive aqui, fuera de server/ y de src/, porque lo importan LOS DOS: el servidor al guardar y
 * cerrar una evaluacion, y el cliente para recalcular en vivo mientras el auditor califica. Una
 * segunda copia en el navegador es exactamente como un porcentaje en pantalla acaba difiriendo
 * del que quedo guardado, y ese fallo nadie lo nota hasta que alguien firma el informe.
 *
 * Escala 2 / 1 / 0 / NA con peso por criterio:
 *   - la puntuacion se normaliza a fraccion del peso: (score / 2) * peso
 *   - se promedia entre las HC RESPONDIDAS de ese criterio
 *   - NA (score null) NO entra: no suma al numerador ni al denominador, asi que no penaliza
 *   - un criterio sin ninguna respuesta aplicable queda en `null` ("sin dato"), nunca en 0 %
 */

/** @typedef {{ id: string|number, scope_id: string|number, weight: number|string }} CriterionLike */
/** @typedef {{ criterion_id: string|number, score: 0|1|2|null|undefined }} ScoreLike */

export function computeCompliance(criteria, scores) {
  const byCriterion = new Map(criteria.map(criterion => [String(criterion.id), {
    weight: Number(criterion.weight),
    scopeId: String(criterion.scope_id),
    pointsSum: 0,
    appliedCount: 0,
  }]))

  for (const scoreRow of scores) {
    // NA llega como null: se ignora por completo (exclusion del denominador ponderado).
    if (scoreRow.score === null || scoreRow.score === undefined) continue
    const entry = byCriterion.get(String(scoreRow.criterion_id))
    if (!entry) continue
    entry.pointsSum += (Number(scoreRow.score) / 2) * entry.weight
    entry.appliedCount += 1
  }

  const criterionResults = [...byCriterion.entries()].map(([criterionId, entry]) => {
    const applicable = entry.appliedCount > 0
    const ab = applicable ? entry.pointsSum / entry.appliedCount : 0
    const s = applicable ? entry.weight : 0
    return { criterionId, scopeId: entry.scopeId, ab, s, compliancePercent: applicable ? (ab / entry.weight) * 100 : null }
  })

  const byScope = new Map()
  for (const result of criterionResults) {
    const bucket = byScope.get(result.scopeId) || { abSum: 0, sSum: 0 }
    bucket.abSum += result.ab
    bucket.sSum += result.s
    byScope.set(result.scopeId, bucket)
  }
  const scopeResults = [...byScope.entries()].map(([scopeId, bucket]) => ({
    scopeId, compliancePercent: bucket.sSum > 0 ? (bucket.abSum / bucket.sSum) * 100 : null,
  }))

  const abTotal = criterionResults.reduce((sum, result) => sum + result.ab, 0)
  const sTotal = criterionResults.reduce((sum, result) => sum + result.s, 0)
  const overallCompliance = sTotal > 0 ? (abTotal / sTotal) * 100 : 0

  return { criterionResults, scopeResults, overallCompliance }
}

/**
 * Cumplimiento ponderado de UNA historia clinica: la misma formula, pero con las respuestas de
 * esa sola HC. Es la fila "% total por HC" del modo ampliado — sin esto, el auditor no sabe
 * cual de las 25 historias arrastra el resultado.
 */
export function computeRecordCompliance(criteria, scoresOfRecord) {
  const { overallCompliance, criterionResults } = computeCompliance(criteria, scoresOfRecord)
  // Si esa HC no tiene ni una respuesta aplicable, es "sin dato" y no 0 %.
  const anyApplicable = criterionResults.some(result => result.s > 0)
  return anyApplicable ? overallCompliance : null
}

/** Cortes del semaforo del sistema. Los umbrales configurables por entidad los resuelve el
 *  servidor contra `adherence_thresholds`; esta es la escala por defecto, igual en ambos lados. */
export function conceptFromPercent(percent) {
  if (percent === null || percent === undefined) return null
  if (percent >= 90) return 'OPTIMO'
  if (percent >= 80) return 'ACEPTABLE'
  if (percent >= 70) return 'DEFICIENTE'
  return 'MUY_DEFICIENTE'
}
