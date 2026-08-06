// Motor de calculo de Indicadores Ambientales — compartido cliente/servidor, igual principio que
// shared/carbonScoring.mjs y shared/adherenceScoring.mjs: una sola formula, nunca dos copias.
//
// A diferencia de Huella de Carbono (que mide emisiones GEI), este motor mide EFICIENCIA/
// PROPORCIONALIDAD de consumo de energia y agua frente al volumen de atenciones. Tres niveles:
//   Nivel 1 — consumo total del periodo (kWh o m3), tal cual se registra.
//   Nivel 2 — intensidad operativa = consumo / atenciones * 1000 (por cada 1000 atenciones).
//   Nivel 3 — indice proporcional = consumo real / consumo esperado * 100, donde
//             consumo esperado = intensidad_base * atenciones / 1000.
// Ahorro normalizado = (esperado - real) / esperado * 100 — positivo es ahorro, negativo es
// sobreconsumo. Menor a 100% en el indice proporcional es favorable.

export const INDICATOR_TYPES = ['ENERGY', 'WATER']
export const INDICATOR_UNIT = { ENERGY: 'kWh', WATER: 'm3' }
export const INDICATOR_LABEL = { ENERGY: 'Energía eléctrica', WATER: 'Agua' }

/** Intensidad operativa: consumo por cada 1000 atenciones. Null si no hay atenciones (no dividir por cero). */
export function intensity(consumption, attentions) {
  const a = Number(attentions)
  if (!a) return null
  return (Number(consumption) / a) * 1000
}

/** Consumo esperado segun la intensidad base vigente (tambien expresada por cada 1000 atenciones). */
export function expectedConsumption(baselineIntensity, attentions) {
  if (baselineIntensity == null) return null
  return (Number(baselineIntensity) * Number(attentions)) / 1000
}

/** Indice proporcional: <100% favorable, =100% proporcional, >100% sobreconsumo frente a la actividad. */
export function proportionalIndex(actualConsumption, expected) {
  if (!expected) return null
  return (Number(actualConsumption) / expected) * 100
}

/** Ahorro normalizado: positivo = ahorro, cero = esperado, negativo = sobreconsumo. */
export function normalizedSaving(expected, actualConsumption) {
  if (!expected) return null
  return ((expected - Number(actualConsumption)) / expected) * 100
}

/** Calcula los 3 niveles de una sola vez a partir de consumo/atenciones/intensidad base. */
export function computeIndicator(consumption, attentions, baselineIntensity) {
  const intensityValue = intensity(consumption, attentions)
  const expected = baselineIntensity != null ? expectedConsumption(baselineIntensity, attentions) : null
  const proportional = expected != null ? proportionalIndex(consumption, expected) : null
  const saving = expected != null ? normalizedSaving(expected, consumption) : null
  return { intensityValue, expectedConsumption: expected, proportionalIndex: proportional, normalizedSaving: saving }
}

// Consolidacion por periodo (trimestre/semestre/año): SUMA consumo y atenciones reales, nunca
// promedia los % de los meses individuales — un mes de bajo volumen no debe pesar igual que uno
// de alto volumen. La intensidad/indice acumulados salen de aplicar la MISMA formula sobre las
// sumatorias, no de promediar resultados ya calculados.
export function accumulatePeriod(records) {
  const consumptionTotal = records.reduce((sum, row) => sum + Number(row.consumption_value ?? row.consumption ?? 0), 0)
  const attentionTotal = records.reduce((sum, row) => sum + Number(row.attention_count ?? row.attentions ?? 0), 0)
  return { consumptionTotal, attentionTotal }
}

// Mediana simple — base de la deteccion de datos atipicos (mas robusta que la media frente a
// valores extremos, que es justo lo que hay que detectar).
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  if (!n) return null
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
}

// Deteccion de dato atipico: compara el consumo del registro contra la MEDIANA de los demas
// registros comparables (mismo indicador, mismo año, sin contar el propio) — nunca contra un
// umbral fijo en unidades absolutas, porque "normal" depende del historico de cada sede. Nunca
// bloquea ni borra: solo devuelve la bandera + el motivo, para que quien capture decida.
const DEFAULT_OUTLIER_THRESHOLD_PERCENT = 50

export function detectOutlier(consumptionValue, comparableValues, thresholdPercent = DEFAULT_OUTLIER_THRESHOLD_PERCENT) {
  const others = comparableValues.filter(value => value != null)
  const reference = median(others)
  if (!reference) return { isOutlier: false, deviationPercent: null, reference: null }
  const deviationPercent = ((Number(consumptionValue) - reference) / reference) * 100
  return { isOutlier: Math.abs(deviationPercent) > thresholdPercent, deviationPercent, reference }
}

// Semaforo del indice proporcional: MENOR es mejor (a diferencia del semaforo institucional de
// adherencia). Rangos configurables via env_targets.tolerance_percent; estos son el valor por
// defecto (95%/105%) cuando no hay meta configurada con otra tolerancia.
export function proportionalSemaphore(proportionalIndexValue, targetPercent = 100, tolerancePercent = 5) {
  if (proportionalIndexValue == null) return 'sin-dato'
  const greenCeiling = targetPercent - tolerancePercent // ej. 100-5=95
  const amberCeiling = targetPercent + tolerancePercent // ej. 100+5=105
  if (proportionalIndexValue <= greenCeiling) return 'verde'
  if (proportionalIndexValue <= amberCeiling) return 'amarillo'
  return 'rojo'
}

export const PERIODICITIES = ['MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL']
export function quarterOfMonth(month) { return Math.floor((Number(month) - 1) / 3) + 1 }
export function semesterOfMonth(month) { return Number(month) <= 6 ? 1 : 2 }
export function periodKey(periodicity, year, month) {
  if (periodicity === 'ANUAL') return String(year)
  if (periodicity === 'SEMESTRAL') return `${year}-S${semesterOfMonth(month)}`
  if (periodicity === 'TRIMESTRAL') return `${year}-Q${quarterOfMonth(month)}`
  return `${year}-${String(month).padStart(2, '0')}`
}
