// Motor de calculo de huella de carbono — generico y reutilizable, igual principio que el motor de
// puntuacion de evaluaciones (server/surveyScoring.mjs): nada de factores de emision ni formulas
// quemadas en el codigo. Cada medicion consulta el factor VIGENTE para su fecha y tipo desde
// carbon_emission_factors, nunca un valor fijo.

export async function lookupFactor(query, blockKey, subtype, date) {
  const result = await query(
    `SELECT * FROM carbon_emission_factors
     WHERE block_key = $1 AND subtype = $2 AND valid_from <= $3 AND (valid_to IS NULL OR valid_to >= $3)
     ORDER BY valid_from DESC LIMIT 1`,
    [blockKey, subtype, date],
  )
  return result.rows[0] || null
}

// La mayoria de factores ya vienen en kgCO2e/<unidad>; el electrico del SIN colombiano se publica
// en gCO2/kWh (convencion UPME/XM) — se normaliza a kg para que la suma total sea consistente.
export function factorToKgPerUnit(factor) {
  const value = Number(factor.value)
  return factor.unit.startsWith('gCO2') ? value / 1000 : value
}

export function computeEmissions(factor, quantity) {
  return factorToKgPerUnit(factor) * Number(quantity)
}

// 'waste' (residuos) es el unico bloque cuyo alcance depende del registro, no del catalogo fijo: si
// el tratamiento se hace in situ es Alcance 1, si lo hace un gestor externo (lo mas comun) es
// Alcance 3 — el resto de bloques siempre tiene el mismo alcance fijo en carbon_blocks.scope.
export function resolveScope(block, measurement) {
  if (block.scope !== 'VARIABLE') return block.scope
  return measurement.in_situ ? 'SCOPE_1' : 'SCOPE_3'
}
