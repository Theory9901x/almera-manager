// Vista previa de calculo EN EL CLIENTE para el formulario de registro de consumos — usa el MISMO
// motor que el servidor (shared/environmentalScoring.mjs), nunca una segunda formula.
// @ts-expect-error — modulo .mjs compartido con el servidor; los tipos se declaran abajo.
import { computeIndicator } from '../../../../shared/environmentalScoring.mjs'

export interface IndicatorPreview { intensityValue: number | null; expectedConsumption: number | null; proportionalIndex: number | null; normalizedSaving: number | null }

export function previewIndicator(consumption: number, attentions: number, baselineIntensity: number | null): IndicatorPreview | null {
  if (!consumption || consumption < 0 || !attentions || attentions <= 0) return null
  return computeIndicator(consumption, attentions, baselineIntensity)
}
