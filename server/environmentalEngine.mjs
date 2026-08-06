// Glue de base de datos para Indicadores Ambientales — resuelve la linea base vigente y delega
// toda la aritmetica a shared/environmentalScoring.mjs (la misma funcion pura que usa el cliente
// para la vista previa en vivo del formulario de registro).
import { query } from './db.mjs'
import { computeIndicator, detectOutlier, quarterOfMonth, semesterOfMonth } from '../shared/environmentalScoring.mjs'

export function derivePeriod(dateStr) {
  const [year, month] = dateStr.split('-').map(Number)
  return { year, month, quarter: quarterOfMonth(month), semester: semesterOfMonth(month) }
}

/**
 * Resuelve la linea base vigente para un periodo, en este orden (ver spec §6):
 *   1. Mismo mes del año anterior, si hay un registro YA VALIDADO de esa fecha — se usa SU
 *      intensidad como referencia (no una fila de linea base separada: es el dato real).
 *   2. Linea base institucional anual vigente (env_baselines, source_type LINEA_BASE_ANUAL).
 *   3. Promedio movil de los ultimos 12 meses de registros validados.
 *   4. Si nada de eso existe, null — el resultado se marca "sin linea base validada".
 */
export async function resolveBaseline({ organizationId, facilityId, indicatorType, year, month }) {
  const samePeriodLastYear = await query(
    `SELECT intensity_value FROM env_consumption_records
     WHERE organization_id = $1 AND facility_id = $2 AND indicator_type = $3 AND year = $4 AND month = $5
       AND status = 'VALIDADO' AND deleted_at IS NULL AND intensity_value IS NOT NULL`,
    [organizationId, facilityId, indicatorType, year - 1, month],
  )
  if (samePeriodLastYear.rows[0]) {
    return { intensity: Number(samePeriodLastYear.rows[0].intensity_value), source: 'PERIODO_ANTERIOR', label: `Mismo mes del año anterior (${year - 1})` }
  }

  const periodDate = `${year}-${String(month).padStart(2, '0')}-01`
  const annual = await query(
    `SELECT * FROM env_baselines WHERE organization_id = $1 AND facility_id = $2 AND indicator_type = $3
       AND source_type = 'LINEA_BASE_ANUAL' AND status = 'VALIDADA' AND valid_from <= $4 AND (valid_to IS NULL OR valid_to >= $4)
     ORDER BY valid_from DESC LIMIT 1`,
    [organizationId, facilityId, indicatorType, periodDate],
  )
  if (annual.rows[0]) {
    return { intensity: Number(annual.rows[0].intensity_base), source: 'LINEA_BASE_ANUAL', label: `Línea base institucional ${annual.rows[0].base_year}`, baselineId: annual.rows[0].id }
  }

  const trailing = await query(
    `SELECT consumption_value, attention_count FROM env_consumption_records
     WHERE organization_id = $1 AND facility_id = $2 AND indicator_type = $3 AND status = 'VALIDADO' AND deleted_at IS NULL
       AND reading_end < $4 AND reading_end >= $4::date - INTERVAL '12 months'
     ORDER BY reading_end DESC`,
    [organizationId, facilityId, indicatorType, periodDate],
  )
  if (trailing.rows.length >= 6) {
    const consumptionTotal = trailing.rows.reduce((sum, row) => sum + Number(row.consumption_value), 0)
    const attentionTotal = trailing.rows.reduce((sum, row) => sum + Number(row.attention_count), 0)
    if (attentionTotal > 0) return { intensity: (consumptionTotal / attentionTotal) * 1000, source: 'PROMEDIO_MOVIL_12M', label: `Promedio móvil de ${trailing.rows.length} meses` }
  }

  return null
}

/** Calcula los 3 niveles + deteccion de atipico para un registro nuevo o editado. */
export async function calcConsumption({ organizationId, facilityId, indicatorType, year, month, consumptionValue, attentionCount, excludeRecordId }) {
  const baseline = await resolveBaseline({ organizationId, facilityId, indicatorType, year, month })
  const result = computeIndicator(consumptionValue, attentionCount, baseline?.intensity ?? null)

  // Comparables para la deteccion de atipico: los demas registros VALIDADOS del mismo año/indicador
  // (no solo los 5 de la siembra — crece con el historico real).
  const comparablesResult = await query(
    `SELECT consumption_value, id FROM env_consumption_records
     WHERE organization_id = $1 AND facility_id = $2 AND indicator_type = $3 AND year = $4
       AND status IN ('VALIDADO', 'PENDIENTE') AND deleted_at IS NULL`,
    [organizationId, facilityId, indicatorType, year],
  )
  const comparables = comparablesResult.rows.filter(row => String(row.id) !== String(excludeRecordId)).map(row => Number(row.consumption_value))
  const outlier = detectOutlier(consumptionValue, comparables)

  return { baseline, result, outlier }
}
