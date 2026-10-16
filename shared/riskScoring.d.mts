// Tipos del motor compartido shared/riskScoring.mjs (lo importan servidor y cliente).
export type ZoneKey = 'BAJO' | 'MODERADO' | 'ALTO' | 'EXTREMO'
export type RiskTypeKey = 'GESTION' | 'CORRUPCION' | 'SEGURIDAD_DIGITAL' | 'FISCAL'
export type ControlTypeKey = 'PREVENTIVO' | 'DETECTIVO' | 'CORRECTIVO'
export type ImplementationKey = 'AUTOMATICO' | 'MANUAL'
export type TreatmentKey = 'ACEPTAR' | 'REDUCIR_MITIGAR' | 'REDUCIR_TRANSFERIR' | 'EVITAR'

export interface ProbabilityLevel { level: number; key: string; name: string; percent: number; maxPerYear: number; description: string }
export interface ImpactLevel { level: number; key: string; name: string; percent: number; economic: string; reputational: string; health: string }
export interface ZoneDef { key: ZoneKey; name: string; color: string; soft: string; ink: string; rank: number }

export const PROBABILITY_LEVELS: ProbabilityLevel[]
export const IMPACT_LEVELS: ImpactLevel[]
export const ZONES: Record<ZoneKey, ZoneDef>
export const ZONE_ORDER: ZoneKey[]
export const RISK_TYPES: Record<RiskTypeKey, { key: RiskTypeKey; name: string; short: string; description: string }>
export const RISK_TYPOLOGIES: string[]
export const CONTROL_TYPES: Record<ControlTypeKey, { key: ControlTypeKey; name: string; weight: number; affects: 'PROBABILIDAD' | 'IMPACTO'; description: string }>
export const CONTROL_IMPLEMENTATIONS: Record<ImplementationKey, { key: ImplementationKey; name: string; weight: number; description: string }>
export const CONTROL_DOCUMENTATION: Record<string, string>
export const CONTROL_FREQUENCY: Record<string, string>
export const CONTROL_EVIDENCE: Record<string, string>
export const TREATMENTS: Record<TreatmentKey, { key: TreatmentKey; name: string; description: string }>
export const CORRUPTION_QUESTIONS: string[]

export interface ControlLike { id?: string | number | null; control_type: string; implementation: string; active?: boolean; last_test_result?: string | null }
export interface AssessmentStep { id: string | number | null; weight: number; affects: 'PROBABILIDAD' | 'IMPACTO' | null; before: number; after: number; excluded: 'INACTIVO' | 'NO_EFECTIVO' | null }
export interface Assessment {
  inherent: { probability: number; impact: number; zone: ZoneKey; score: number } | null
  residual: { probability: number; impact: number; zone: ZoneKey; probabilityPercent: number; impactPercent: number; score: number } | null
  steps: AssessmentStep[]
  reduction: number | null
}

export function probabilityFromFrequency(timesPerYear: number | string | null | undefined): number | null
export function levelFromPercent(percent: number): number
export function probabilityLevel(level: number | string | null | undefined): ProbabilityLevel | null
export function impactLevel(level: number | string | null | undefined): ImpactLevel | null
export function zoneOf(probability: number | null | undefined, impact: number | null | undefined): ZoneKey | null
export function corruptionImpact(answers: boolean[] | null | undefined): number | null
export function controlWeight(control: ControlLike): number
export function controlStrength(weight: number): { key: 'FUERTE' | 'MODERADO' | 'DEBIL'; name: string }
export function assessRisk(risk: { inherent_probability: number | null; inherent_impact: number | null }, controls?: ControlLike[]): Assessment
export function suggestedTreatment(zone: ZoneKey | null, riskType: string): TreatmentKey
export function treatmentIssues(input: { treatment: string | null; riskType: string; residualZone: ZoneKey | null; actionsCount: number }): string[]
export function cuatrimestreOf(date: Date | string): { year: number; index: number; label: string } | null
