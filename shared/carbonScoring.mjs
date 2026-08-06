// Motor de calculo de Huella de Carbono — compartido entre servidor (calculo real,
// persistido) y cliente (vista previa en vivo del formulario de registro), igual
// principio que shared/adherenceScoring.mjs: una sola formula, nunca dos copias que
// puedan desincronizarse entre lo que se ve en pantalla y lo que se guarda.
//
// Metodo: IPCC 2006 Guidelines Tier 1 (el mismo que usa la herramienta de
// referencia de Salud sin Dano/GGHH). Para combustion (estacionaria y movil):
//   Energia[MJ] = cantidad x densidad[kg/unidad] x poder_calorifico[MJ/kg]
//   gas[kg]     = Energia[MJ] x factor_emision[g/MJ] / 1000
//   CO2e[kg]    = CO2[kg] + CH4[kg] x GWP_CH4 + N2O[kg] x GWP_N2O
// Para electricidad: CO2e[kg] = kWh x factor_red[kgCO2e/kWh]
//
// GWP fijo (IPCC AR4, horizonte 100 anios, igual que el Excel de referencia):
export const GWP = { CO2: 1, CH4: 25, N2O: 298 }

// 1 galon estadounidense (el que usa esta metodologia para combustibles liquidos
// en Colombia) en litros. Se usa 3,785 (no el valor fisico exacto 3,785411784):
// es la constante con la que la herramienta de referencia reproduce su propio
// caso de prueba — verificado reproduciendo a mano su columna auxiliar en litros.
export const LITERS_PER_US_GALLON = 3.785

export const UNIT_CONVERSIONS = {
  // [unidadOrigen][unidadDestino] = factor multiplicativo
  litro: { litro: 1, galon: 1 / LITERS_PER_US_GALLON },
  galon: { galon: 1, litro: LITERS_PER_US_GALLON },
  kg: { kg: 1, ton: 1 / 1000 },
  ton: { ton: 1, kg: 1000 },
  m3: { m3: 1 },
}

export function convertUnit(quantity, fromUnit, toUnit) {
  if (fromUnit === toUnit) return Number(quantity)
  const table = UNIT_CONVERSIONS[fromUnit]
  const factor = table && table[toUnit]
  if (factor == null) throw new Error(`No hay conversion definida de "${fromUnit}" a "${toUnit}"`)
  return Number(quantity) * factor
}

// Combustion estacionaria y movil comparten el mismo nucleo de calculo (energia x
// factor por gas); solo cambia cual tripleta de factores del combustible se usa.
//
// El redondeo a 3 decimales (kg) de CADA gas ANTES de aplicar el GWP no es un
// capricho: es como opera la propia herramienta de referencia (verificado
// reproduciendo su caso de prueba a mano celda por celda). Sin este redondeo
// intermedio el total se desvia ~0,1 kg del valor oficial — poco en terminos
// absolutos, pero rompe la reproduccion EXACTA que exige el caso de prueba.
const round3 = value => Math.round(value * 1000) / 1000

function emissionsFromEnergy(energyMj, feCo2GMj, feCh4GMj, feN2oGMj) {
  const co2Kg = round3((energyMj * Number(feCo2GMj || 0)) / 1000)
  const ch4Kg = round3((energyMj * Number(feCh4GMj || 0)) / 1000)
  const n2oKg = round3((energyMj * Number(feN2oGMj || 0)) / 1000)
  const co2eKg = co2Kg + ch4Kg * GWP.CH4 + n2oKg * GWP.N2O
  return { co2Kg, ch4Kg, n2oKg, co2eKg }
}

/**
 * Combustion estacionaria. `fuel` es la fila de carbon_fuel_types (o su
 * equivalente en memoria en el cliente). `quantity` esta en la unidad nativa del
 * combustible (fuel.native_unit) — el formulario nunca deberia enviar litros para
 * un combustible cuya unidad nativa es kg sin convertir antes.
 */
export function computeStationaryEmissions(fuel, quantity) {
  if (!fuel) throw new Error('Combustible no encontrado')
  const qty = Number(quantity) || 0
  const density = fuel.density_kg_per_unit != null ? Number(fuel.density_kg_per_unit) : 1
  const energyMj = qty * density * Number(fuel.heating_value_mj_per_kg)
  const emissions = emissionsFromEnergy(energyMj, fuel.fe_stationary_co2_g_mj, fuel.fe_stationary_ch4_g_mj, fuel.fe_stationary_n2o_g_mj)
  return { energyMj, ...emissions }
}

/**
 * Combustion movil, con correccion por mezcla de biocombustibles: la cantidad
 * ingresada (100% combustible fosil declarado) se separa en su parte fosil y su
 * parte biogenica segun el corte vigente (ej. 10% biodiesel en diesel), y CADA
 * parte se calcula con los factores de SU PROPIO combustible (el biocombustible
 * tiene CO2 = 0 por convencion de neutralidad biogenica). `quantity` esta en la
 * unidad nativa de `fuel` (el combustible fosil declarado, no el biocombustible).
 */
export function computeMobileEmissions({ fuel, quantity, blendFuel, blendPercent }) {
  if (!fuel) throw new Error('Combustible no encontrado')
  const qty = Number(quantity) || 0
  const blendFraction = blendFuel ? Number(blendPercent || 0) / 100 : 0
  const fossilQty = qty * (1 - blendFraction)
  const biogenicQty = blendFuel ? qty * blendFraction : 0

  const density = fuel.density_kg_per_unit != null ? Number(fuel.density_kg_per_unit) : 1
  const fossilEnergyMj = fossilQty * density * Number(fuel.heating_value_mj_per_kg)
  const fossil = emissionsFromEnergy(fossilEnergyMj, fuel.fe_mobile_co2_g_mj, fuel.fe_mobile_ch4_g_mj, fuel.fe_mobile_n2o_g_mj)

  let biogenic = { co2Kg: 0, ch4Kg: 0, n2oKg: 0, co2eKg: 0 }
  let biogenicEnergyMj = 0
  if (blendFuel && biogenicQty > 0) {
    const blendDensity = blendFuel.density_kg_per_unit != null ? Number(blendFuel.density_kg_per_unit) : 1
    biogenicEnergyMj = biogenicQty * blendDensity * Number(blendFuel.heating_value_mj_per_kg)
    biogenic = emissionsFromEnergy(biogenicEnergyMj, blendFuel.fe_mobile_co2_g_mj, blendFuel.fe_mobile_ch4_g_mj, blendFuel.fe_mobile_n2o_g_mj)
  }

  return {
    fossilQty, biogenicQty,
    energyMj: fossilEnergyMj + biogenicEnergyMj,
    co2Kg: fossil.co2Kg + biogenic.co2Kg,
    ch4Kg: fossil.ch4Kg + biogenic.ch4Kg,
    n2oKg: fossil.n2oKg + biogenic.n2oKg,
    co2eKg: fossil.co2eKg + biogenic.co2eKg,
  }
}

/** Electricidad: un solo factor de red ya expresado en CO2e (no se separa por gas). */
export function computeElectricityEmissions(kwh, factorKgco2ePerKwh) {
  const co2eKg = Number(kwh || 0) * Number(factorKgco2ePerKwh || 0)
  return { co2eKg }
}

export const KG_PER_TON = 1000
export const kgToTon = kg => Number(kg || 0) / KG_PER_TON

/** Alcance 1 = estacionaria + movil. Alcance 2 = electricidad. Total = suma de los 3 — nunca incluye nada mas. */
export function summarizeTotals({ stationaryKg = 0, mobileKg = 0, electricityKg = 0 }) {
  const scope1Kg = Number(stationaryKg) + Number(mobileKg)
  const scope2Kg = Number(electricityKg)
  const totalKg = scope1Kg + scope2Kg
  return {
    stationaryTon: kgToTon(stationaryKg), mobileTon: kgToTon(mobileKg), electricityTon: kgToTon(electricityKg),
    scope1Ton: kgToTon(scope1Kg), scope2Ton: kgToTon(scope2Kg), totalTon: kgToTon(totalKg),
    scope1SharePercent: totalKg ? (scope1Kg / totalKg) * 100 : 0,
    scope2SharePercent: totalKg ? (scope2Kg / totalKg) * 100 : 0,
  }
}

// Auto-calculo de trimestre/semestre a partir del mes — el formulario nunca pide
// estos dos datos, se derivan siempre del mismo modo en cliente y servidor.
export function quarterOfMonth(month) { return Math.floor((Number(month) - 1) / 3) + 1 }
export function semesterOfMonth(month) { return Number(month) <= 6 ? 1 : 2 }

export const PERIODICITIES = ['MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL']

/** Clave de periodo estable para agrupar/indexar (ej. '2025-03', '2025-Q1', '2025-S1', '2025'). */
export function periodKey(periodicity, year, month) {
  if (periodicity === 'ANUAL') return String(year)
  if (periodicity === 'SEMESTRAL') return `${year}-S${semesterOfMonth(month)}`
  if (periodicity === 'TRIMESTRAL') return `${year}-Q${quarterOfMonth(month)}`
  return `${year}-${String(month).padStart(2, '0')}`
}
