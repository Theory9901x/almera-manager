import { useMemo } from 'react'
// @ts-expect-error — modulo .mjs compartido con el servidor; los tipos se declaran abajo.
import { computeCompliance, computeRecordCompliance } from '../../../../shared/adherenceScoring.mjs'
import type { Criterion, EvaluationRecord, Score, Scope } from '../types'

export type ScoreMap = Record<string, Record<string, Score>>

interface EngineCriterionResult { criterionId: string; scopeId: string; ab: number; s: number; compliancePercent: number | null }
interface EngineResult {
  criterionResults: EngineCriterionResult[]
  scopeResults: { scopeId: string; compliancePercent: number | null }[]
  overallCompliance: number
}

export interface LiveCompliance {
  /** % ponderado por criterio (null = sin dato: todo NA o sin calificar). */
  byCriterion: Map<string, number | null>
  /** % ponderado por ámbito/dimensión. */
  byScope: Map<string, number | null>
  /** % ponderado por historia clínica — la fila «% total por HC». */
  byRecord: Map<string, number | null>
  overall: number | null
  /** Reparto de la escala, para la semaforización y los contadores del pie. */
  counts: { two: number; one: number; zero: number; na: number }
  /** Celdas calificadas y totales: alimenta el progreso «42 de 47». */
  graded: number
  totalCells: number
  /** HC sin ninguna celda pendiente: sirve para «ocultar completadas». */
  completedRecordIds: Set<string>
}

/**
 * Cumplimiento en vivo mientras se califica.
 *
 * Usa el MISMO motor que el servidor (`shared/adherenceScoring.mjs`), no una reimplementación:
 * el número que ve el auditor al marcar y el que queda guardado al pulsar «Guardar» tienen que
 * ser el mismo, y con dos fórmulas paralelas eso se rompe en la primera diferencia de redondeo.
 */
export function useLiveCompliance(
  criteria: Criterion[],
  scopes: Scope[],
  records: EvaluationRecord[],
  scores: ScoreMap,
): LiveCompliance {
  return useMemo(() => {
    // El motor espera filas planas {criterion_id, score}; el buffer del cliente está indexado
    // por HC para que marcar una celda no recorra toda la matriz.
    const flat: { criterion_id: string; score: Score }[] = []
    const counts = { two: 0, one: 0, zero: 0, na: 0 }
    let graded = 0

    for (const record of records) {
      const byCriterion = scores[record.id] || {}
      for (const criterion of criteria) {
        const value = byCriterion[criterion.id]
        if (value === undefined) continue
        graded += 1
        flat.push({ criterion_id: criterion.id, score: value })
        if (value === null) counts.na += 1
        else if (value === 2) counts.two += 1
        else if (value === 1) counts.one += 1
        else counts.zero += 1
      }
    }

    const result = computeCompliance(criteria, flat) as EngineResult
    const byCriterion = new Map(result.criterionResults.map(row => [row.criterionId, row.compliancePercent]))
    const byScope = new Map(result.scopeResults.map(row => [row.scopeId, row.compliancePercent]))
    // Un ámbito sin ningún criterio respondido no aparece en el resultado del motor: se declara
    // «sin dato» de forma explícita para que la interfaz no lo lea como 0 %.
    for (const scope of scopes) if (!byScope.has(scope.id)) byScope.set(scope.id, null)

    const byRecord = new Map<string, number | null>()
    const completedRecordIds = new Set<string>()
    for (const record of records) {
      const byCrit = scores[record.id] || {}
      const rows = criteria
        .filter(criterion => byCrit[criterion.id] !== undefined)
        .map(criterion => ({ criterion_id: criterion.id, score: byCrit[criterion.id] }))
      byRecord.set(record.id, computeRecordCompliance(criteria, rows) as number | null)
      if (criteria.length > 0 && rows.length === criteria.length) completedRecordIds.add(record.id)
    }

    const totalCells = criteria.length * records.length
    return {
      byCriterion, byScope, byRecord,
      // Sin nada calificado el general es «sin dato», no 0 %.
      overall: graded > 0 ? result.overallCompliance : null,
      counts, graded, totalCells, completedRecordIds,
    }
  }, [criteria, scopes, records, scores])
}
