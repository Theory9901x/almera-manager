// Glue de base de datos para el motor de Huella de Carbono v2 — lee catalogos y
// factores vigentes, delega TODA la aritmetica a shared/carbonScoring.mjs (la
// misma funcion pura que usa el cliente para la vista previa en vivo del
// formulario). Nombrado "2" para no mezclarse con carbonEngine.mjs, que sigue
// sirviendo al modulo viejo de "bloques" (carbon_measurements) sin tocarlo.
import { query } from './db.mjs'
import {
  computeStationaryEmissions, computeMobileEmissions, computeElectricityEmissions,
  convertUnit, quarterOfMonth, semesterOfMonth,
} from '../shared/carbonScoring.mjs'

export async function loadFuel(fuelKey) {
  const result = await query('SELECT * FROM carbon_fuel_types WHERE fuel_key = $1', [fuelKey])
  return result.rows[0] || null
}

export async function loadFuels() {
  const result = await query('SELECT * FROM carbon_fuel_types ORDER BY position')
  return result.rows
}

export async function loadElectricityFactor(date, region = 'CO') {
  const result = await query(
    `SELECT * FROM carbon_electricity_factors WHERE region = $1 AND valid_from <= $2 AND (valid_to IS NULL OR valid_to >= $2)
     ORDER BY valid_from DESC LIMIT 1`,
    [region, date],
  )
  return result.rows[0] || null
}

export async function loadBiofuelBlend(date, region = 'CO') {
  const result = await query(
    `SELECT * FROM carbon_biofuel_blends WHERE region = $1 AND valid_from <= $2 AND (valid_to IS NULL OR valid_to >= $2)
     ORDER BY valid_from DESC LIMIT 1`,
    [region, date],
  )
  return result.rows[0] || null
}

export function derivePeriod(dateStr) {
  const [year, month] = dateStr.split('-').map(Number)
  return { year, month, quarter: quarterOfMonth(month), semester: semesterOfMonth(month) }
}

// Combustion estacionaria: convierte la cantidad a la unidad nativa del
// combustible si el usuario ingreso en otra unidad compatible, calcula y arma el
// snapshot de trazabilidad (que factor exacto se uso, para que un cambio futuro
// del catalogo no altere este calculo ya guardado).
export async function calcStationary({ fuelKey, quantity, quantityUnit }) {
  const fuel = await loadFuel(fuelKey)
  if (!fuel) { const error = new Error(`Combustible "${fuelKey}" no encontrado`); error.status = 422; throw error }
  if (!fuel.applicable_stationary) { const error = new Error(`"${fuel.label}" no aplica a combustion estacionaria`); error.status = 422; throw error }
  const normalizedQty = convertUnit(quantity, quantityUnit, fuel.native_unit)
  const result = computeStationaryEmissions(fuel, normalizedQty)
  return {
    fuel, normalizedQty, result,
    factorSnapshot: {
      fuelKey: fuel.fuel_key, fuelLabel: fuel.label, nativeUnit: fuel.native_unit,
      densityKgPerUnit: fuel.density_kg_per_unit, heatingValueMjPerKg: fuel.heating_value_mj_per_kg,
      feCo2GMj: fuel.fe_stationary_co2_g_mj, feCh4GMj: fuel.fe_stationary_ch4_g_mj, feN2oGMj: fuel.fe_stationary_n2o_g_mj,
      source: fuel.factor_source,
    },
  }
}

// Combustion movil: aplica el corte de biocombustible vigente salvo que el
// combustible YA sea el biocombustible puro (blend no aplica sobre si mismo).
export async function calcMobile({ fuelKey, quantity, quantityUnit, recordDate }) {
  const fuel = await loadFuel(fuelKey)
  if (!fuel) { const error = new Error(`Combustible "${fuelKey}" no encontrado`); error.status = 422; throw error }
  if (!fuel.applicable_mobile) { const error = new Error(`"${fuel.label}" no aplica a combustion movil`); error.status = 422; throw error }
  const normalizedQty = convertUnit(quantity, quantityUnit, fuel.native_unit)

  let blendFuel = null
  let blendPercent = 0
  if (!fuel.is_biofuel) {
    const blend = await loadBiofuelBlend(recordDate)
    if (fuel.fuel_key === 'diesel' && blend) { blendFuel = await loadFuel('biodiesel'); blendPercent = Number(blend.biodiesel_percent) }
    else if (fuel.fuel_key === 'gasolina' && blend) { blendFuel = await loadFuel('bioetanol'); blendPercent = Number(blend.bioethanol_percent) }
  }

  const result = computeMobileEmissions({ fuel, quantity: normalizedQty, blendFuel, blendPercent })
  return {
    fuel, blendFuel, blendPercent, normalizedQty, result,
    factorSnapshot: {
      fuelKey: fuel.fuel_key, fuelLabel: fuel.label, nativeUnit: fuel.native_unit,
      densityKgPerUnit: fuel.density_kg_per_unit, heatingValueMjPerKg: fuel.heating_value_mj_per_kg,
      feCo2GMj: fuel.fe_mobile_co2_g_mj, feCh4GMj: fuel.fe_mobile_ch4_g_mj, feN2oGMj: fuel.fe_mobile_n2o_g_mj,
      blendFuelKey: blendFuel?.fuel_key || null, blendPercent, source: fuel.factor_source,
    },
  }
}

export async function calcElectricity({ kwh, recordDate }) {
  const factor = await loadElectricityFactor(recordDate)
  if (!factor) { const error = new Error('No hay un factor de emision electrico vigente para esta fecha — carga uno desde Factores de emision'); error.status = 422; throw error }
  const result = computeElectricityEmissions(kwh, factor.value_kgco2e_per_kwh)
  return {
    factor, result,
    factorSnapshot: { region: factor.region, label: factor.label, valueKgco2ePerKwh: Number(factor.value_kgco2e_per_kwh), source: factor.source },
  }
}
