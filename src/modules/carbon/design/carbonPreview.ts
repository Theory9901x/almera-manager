// Vista previa de calculo EN EL CLIENTE, para el panel lateral del paso "Revision y calculo" del
// registro de actividad — usa el MISMO motor que el servidor (shared/carbonScoring.mjs), nunca una
// segunda formula que pueda desincronizarse (ver §12 CLAUDE.md, misma leccion que Matrices de HC).
// @ts-expect-error — modulo .mjs compartido con el servidor; los tipos se declaran abajo.
import { computeElectricityEmissions, computeMobileEmissions, computeStationaryEmissions, convertUnit } from '../../../../shared/carbonScoring.mjs'
import type { FuelType } from '../types'

export interface EmissionPreview { energyMj: number; co2Kg: number; ch4Kg: number; n2oKg: number; co2eKg: number; co2eTon: number }

function toPreview(result: { energyMj?: number; co2Kg: number; ch4Kg: number; n2oKg: number; co2eKg: number }): EmissionPreview {
  return { energyMj: result.energyMj || 0, co2Kg: result.co2Kg, ch4Kg: result.ch4Kg, n2oKg: result.n2oKg, co2eKg: result.co2eKg, co2eTon: result.co2eKg / 1000 }
}

export function previewStationary(fuel: FuelType | undefined, quantity: number, quantityUnit: string): EmissionPreview | null {
  if (!fuel || !quantity || quantity <= 0) return null
  try {
    const normalized = convertUnit(quantity, quantityUnit, fuel.native_unit)
    return toPreview(computeStationaryEmissions(fuel, normalized))
  } catch { return null }
}

export function previewMobile(fuel: FuelType | undefined, quantity: number, quantityUnit: string, blendFuel: FuelType | null, blendPercent: number): (EmissionPreview & { fossilQty: number; biogenicQty: number }) | null {
  if (!fuel || !quantity || quantity <= 0) return null
  try {
    const normalized = convertUnit(quantity, quantityUnit, fuel.native_unit)
    const result = computeMobileEmissions({ fuel, quantity: normalized, blendFuel, blendPercent })
    return { ...toPreview(result), fossilQty: result.fossilQty, biogenicQty: result.biogenicQty }
  } catch { return null }
}

export function previewElectricity(kwh: number, factorKgco2ePerKwh: number | undefined): EmissionPreview | null {
  if (!kwh || kwh <= 0 || !factorKgco2ePerKwh) return null
  const result = computeElectricityEmissions(kwh, factorKgco2ePerKwh)
  return { energyMj: 0, co2Kg: 0, ch4Kg: 0, n2oKg: 0, co2eKg: result.co2eKg, co2eTon: result.co2eKg / 1000 }
}
