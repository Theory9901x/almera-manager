import type { EvaluationDetail, Score } from '../types'
import type { ScoreMap } from './useLiveCompliance'

/**
 * Las dos conversiones entre el formato del servidor (filas planas) y el buffer del cliente
 * (indexado por HC). Viven aqui porque las usan LAS DOS superficies que califican: el panel de
 * operacion y la ventana dedicada de la matriz. Con una copia en cada sitio, el dia que cambie
 * la forma de una calificacion habria que acordarse de los dos.
 */

/** Filas del servidor -> buffer por HC. Toda HC aparece, aunque no tenga ninguna respuesta. */
export function buildScoreMap(detail: EvaluationDetail): ScoreMap {
  const map: ScoreMap = {}
  for (const record of detail.records) map[record.id] = {}
  for (const row of detail.scores) {
    map[row.evaluation_record_id] = map[row.evaluation_record_id] || {}
    map[row.evaluation_record_id][row.criterion_id] = row.score
  }
  return map
}

/** Buffer por HC -> payload de `PUT /evaluations/:id/scores`. */
export function scoresToPayload(scores: ScoreMap) {
  return Object.entries(scores).flatMap(([recordId, byCriterion]) =>
    Object.entries(byCriterion).map(([criterionId, score]) => ({ recordId, criterionId, score: score as Score })))
}
