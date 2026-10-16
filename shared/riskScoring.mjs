/**
 * Motor de valoracion del riesgo — funcion pura, sin dependencias.
 *
 * Metodologia: "Guia para la administracion del riesgo y el diseno de controles en entidades
 * publicas", Departamento Administrativo de la Funcion Publica (DAFP), version 6 (2022), que es
 * la que adopta MIPG (Decreto 1499 de 2017) para las entidades publicas colombianas — una ESE
 * incluida. Lo importan LOS DOS lados: el servidor (listados, tablero, informe PDF) y el cliente
 * (valoracion en vivo mientras se registran controles). Una segunda copia en el navegador es
 * como el residual en pantalla acaba difiriendo del que sale en el informe.
 *
 * Reglas implementadas:
 *  - Probabilidad por EXPOSICION: numero de veces al ano que se ejecuta la actividad que
 *    conlleva el riesgo (no por "corazonada").
 *  - Impacto por afectacion economica (SMLMV) o reputacional; para el sector salud se agrega el
 *    criterio de seguridad del paciente. Se toma el MAYOR de los criterios que apliquen.
 *  - Riesgos de corrupcion: impacto por el cuestionario de 19 preguntas; nunca Leve ni Menor.
 *  - Mapa de calor 5x5 con cuatro zonas (Bajo, Moderado, Alto, Extremo).
 *  - Controles: atributos de eficiencia con peso (tipo + implementacion) e informativos sin
 *    peso (documentacion, frecuencia, evidencia). Preventivo y detectivo reducen probabilidad;
 *    correctivo reduce impacto. Cada control se aplica SOBRE EL VALOR YA REDUCIDO por el
 *    anterior (no se suman porcentajes), en el orden en que estan registrados.
 */

export const PROBABILITY_LEVELS = [
  { level: 1, key: 'MUY_BAJA', name: 'Muy baja', percent: 20, maxPerYear: 2, description: 'La actividad que conlleva el riesgo se ejecuta como máximo 2 veces por año.' },
  { level: 2, key: 'BAJA', name: 'Baja', percent: 40, maxPerYear: 24, description: 'La actividad que conlleva el riesgo se ejecuta de 3 a 24 veces por año.' },
  { level: 3, key: 'MEDIA', name: 'Media', percent: 60, maxPerYear: 500, description: 'La actividad que conlleva el riesgo se ejecuta de 25 a 500 veces por año.' },
  { level: 4, key: 'ALTA', name: 'Alta', percent: 80, maxPerYear: 5000, description: 'La actividad que conlleva el riesgo se ejecuta de 501 a 5.000 veces por año.' },
  { level: 5, key: 'MUY_ALTA', name: 'Muy alta', percent: 100, maxPerYear: Infinity, description: 'La actividad que conlleva el riesgo se ejecuta más de 5.000 veces por año.' },
]

export const IMPACT_LEVELS = [
  { level: 1, key: 'LEVE', name: 'Leve', percent: 20, economic: 'Afectación menor a 10 SMLMV.', reputational: 'El riesgo afecta la imagen de algún área de la organización.', health: 'Sin daño al paciente.' },
  { level: 2, key: 'MENOR', name: 'Menor', percent: 40, economic: 'Entre 10 y 50 SMLMV.', reputational: 'El riesgo afecta la imagen de la entidad internamente, de conocimiento general a nivel interno, de junta directiva y/o de proveedores.', health: 'Daño leve al paciente, sin secuelas.' },
  { level: 3, key: 'MODERADO', name: 'Moderado', percent: 60, economic: 'Entre 50 y 100 SMLMV.', reputational: 'El riesgo afecta la imagen de la entidad con algunos usuarios de relevancia frente al logro de los objetivos.', health: 'Daño temporal que requiere tratamiento no permanente.' },
  { level: 4, key: 'MAYOR', name: 'Mayor', percent: 80, economic: 'Entre 100 y 500 SMLMV.', reputational: 'El riesgo afecta la imagen de la entidad con efecto publicitario sostenido a nivel de sector administrativo, departamental o municipal.', health: 'Daño que requiere tratamiento y/o seguimiento permanente, con posibles secuelas.' },
  { level: 5, key: 'CATASTROFICO', name: 'Catastrófico', percent: 100, economic: 'Mayor a 500 SMLMV.', reputational: 'El riesgo afecta la imagen de la entidad a nivel nacional, con efecto publicitario sostenido a nivel país.', health: 'Daño permanente, compromiso vital o muerte.' },
]

export const ZONES = {
  BAJO: { key: 'BAJO', name: 'Bajo', color: '#16a34a', soft: '#dcfce7', ink: '#14532d', rank: 1 },
  MODERADO: { key: 'MODERADO', name: 'Moderado', color: '#eab308', soft: '#fef9c3', ink: '#713f12', rank: 2 },
  ALTO: { key: 'ALTO', name: 'Alto', color: '#f97316', soft: '#ffedd5', ink: '#7c2d12', rank: 3 },
  EXTREMO: { key: 'EXTREMO', name: 'Extremo', color: '#dc2626', soft: '#fee2e2', ink: '#7f1d1d', rank: 4 },
}
export const ZONE_ORDER = ['BAJO', 'MODERADO', 'ALTO', 'EXTREMO']

// Mapa de calor de la guia: fila = probabilidad (1 Muy baja ... 5 Muy alta), columna = impacto
// (1 Leve ... 5 Catastrofico). Un impacto Catastrofico es Extremo con cualquier probabilidad, y
// uno Mayor es al menos Alto: el dano posible manda sobre lo poco frecuente que sea.
const HEAT_MAP = {
  5: ['ALTO', 'ALTO', 'ALTO', 'ALTO', 'EXTREMO'],
  4: ['MODERADO', 'MODERADO', 'ALTO', 'ALTO', 'EXTREMO'],
  3: ['MODERADO', 'MODERADO', 'MODERADO', 'ALTO', 'EXTREMO'],
  2: ['BAJO', 'MODERADO', 'MODERADO', 'ALTO', 'EXTREMO'],
  1: ['BAJO', 'BAJO', 'MODERADO', 'ALTO', 'EXTREMO'],
}

export const RISK_TYPES = {
  GESTION: { key: 'GESTION', name: 'Gestión', short: 'Gestión', description: 'Riesgos de los procesos: eventos que pueden afectar el logro de sus objetivos.' },
  CORRUPCION: { key: 'CORRUPCION', name: 'Corrupción', short: 'Corrupción', description: 'Uso del poder para desviar la gestión de lo público hacia un beneficio privado (Ley 1474 de 2011).' },
  SEGURIDAD_DIGITAL: { key: 'SEGURIDAD_DIGITAL', name: 'Seguridad digital', short: 'Seg. digital', description: 'Pérdida de confidencialidad, integridad o disponibilidad de los activos de información.' },
  FISCAL: { key: 'FISCAL', name: 'Fiscal', short: 'Fiscal', description: 'Efecto dañoso sobre recursos públicos o bienes del Estado por acción u omisión en la gestión.' },
}

// Tipologia de eventos de riesgo de la guia (clasificacion del "que puede pasar").
export const RISK_TYPOLOGIES = [
  'Ejecución y administración de procesos',
  'Fraude externo',
  'Fraude interno',
  'Fallas tecnológicas',
  'Relaciones laborales',
  'Usuarios, productos y prácticas',
  'Daños a activos fijos / eventos externos',
]

export const CONTROL_TYPES = {
  PREVENTIVO: { key: 'PREVENTIVO', name: 'Preventivo', weight: 25, affects: 'PROBABILIDAD', description: 'Actúa sobre la causa, antes de que el riesgo se materialice.' },
  DETECTIVO: { key: 'DETECTIVO', name: 'Detectivo', weight: 15, affects: 'PROBABILIDAD', description: 'Detecta el riesgo durante la ejecución del proceso, a tiempo de corregir.' },
  CORRECTIVO: { key: 'CORRECTIVO', name: 'Correctivo', weight: 10, affects: 'IMPACTO', description: 'Actúa cuando el riesgo ya se materializó, para reducir sus efectos.' },
}
export const CONTROL_IMPLEMENTATIONS = {
  AUTOMATICO: { key: 'AUTOMATICO', name: 'Automático', weight: 25, description: 'Lo ejecuta un sistema sin intervención humana.' },
  MANUAL: { key: 'MANUAL', name: 'Manual', weight: 15, description: 'Lo ejecuta una persona.' },
}
// Atributos informativos: no pesan en el calculo, pero la guia exige registrarlos.
export const CONTROL_DOCUMENTATION = { DOCUMENTADO: 'Documentado', SIN_DOCUMENTAR: 'Sin documentar' }
export const CONTROL_FREQUENCY = { CONTINUA: 'Continua', ALEATORIA: 'Aleatoria' }
export const CONTROL_EVIDENCE = { CON_REGISTRO: 'Con registro', SIN_REGISTRO: 'Sin registro' }

export const TREATMENTS = {
  ACEPTAR: { key: 'ACEPTAR', name: 'Aceptar', description: 'Se asume el riesgo conociendo sus efectos; no se adopta ninguna medida adicional.' },
  REDUCIR_MITIGAR: { key: 'REDUCIR_MITIGAR', name: 'Reducir — mitigar', description: 'Se implementan acciones para disminuir la probabilidad o el impacto.' },
  REDUCIR_TRANSFERIR: { key: 'REDUCIR_TRANSFERIR', name: 'Reducir — transferir', description: 'Se traslada a un tercero (pólizas, tercerización). La responsabilidad reputacional no se transfiere.' },
  EVITAR: { key: 'EVITAR', name: 'Evitar', description: 'Se decide no realizar la actividad que genera el riesgo.' },
}

// Cuestionario de impacto para riesgos de corrupcion. "Si el riesgo de corrupcion se
// materializa podria..."
export const CORRUPTION_QUESTIONS = [
  '¿Afectar al grupo de funcionarios del proceso?',
  '¿Afectar el cumplimiento de metas y objetivos de la dependencia?',
  '¿Afectar el cumplimiento de la misión de la entidad?',
  '¿Afectar el cumplimiento de la misión del sector al que pertenece la entidad?',
  '¿Generar pérdida de confianza de la entidad, afectando su reputación?',
  '¿Generar pérdida de recursos económicos?',
  '¿Afectar la generación de los productos o la prestación de servicios?',
  '¿Dar lugar al detrimento de la calidad de vida de la comunidad por la pérdida del bien, servicio o recursos públicos?',
  '¿Generar pérdida de información de la entidad?',
  '¿Generar intervención de los órganos de control, de la Fiscalía u otro ente?',
  '¿Dar lugar a procesos sancionatorios?',
  '¿Dar lugar a procesos disciplinarios?',
  '¿Dar lugar a procesos fiscales?',
  '¿Dar lugar a procesos penales?',
  '¿Generar pérdida de credibilidad del sector?',
  '¿Ocasionar lesiones físicas o pérdida de vidas humanas?',
  '¿Afectar la imagen regional?',
  '¿Afectar la imagen nacional?',
  '¿Generar daño ambiental?',
]

/** Nivel de probabilidad (1-5) a partir de las veces al ano que se ejecuta la actividad. */
export function probabilityFromFrequency(timesPerYear) {
  if (timesPerYear === null || timesPerYear === undefined || timesPerYear === '') return null
  const value = Number(timesPerYear)
  if (!Number.isFinite(value) || value < 0) return null
  return PROBABILITY_LEVELS.find(item => value <= item.maxPerYear).level
}

/** Nivel 1-5 que corresponde a un porcentaje ya reducido por controles (0-20 = 1, ... >80 = 5). */
export function levelFromPercent(percent) {
  const value = Number(percent)
  if (!Number.isFinite(value) || value <= 20) return 1
  if (value <= 40) return 2
  if (value <= 60) return 3
  if (value <= 80) return 4
  return 5
}

export function probabilityLevel(level) { return PROBABILITY_LEVELS.find(item => item.level === Number(level)) || null }
export function impactLevel(level) { return IMPACT_LEVELS.find(item => item.level === Number(level)) || null }

/** Zona del mapa de calor para un par (probabilidad, impacto). Null si falta alguno. */
export function zoneOf(probability, impact) {
  const row = HEAT_MAP[Number(probability)]
  if (!row) return null
  return row[Number(impact) - 1] || null
}

/** Impacto (3, 4 o 5) de un riesgo de corrupcion: 1-5 respuestas "si" = Moderado, 6-11 = Mayor,
 *  12-19 = Catastrofico. Sin ninguna respuesta afirmativa el cuestionario esta incompleto. */
export function corruptionImpact(answers) {
  const yes = (Array.isArray(answers) ? answers : []).filter(Boolean).length
  if (yes === 0) return null
  if (yes <= 5) return 3
  if (yes <= 11) return 4
  return 5
}

/** Peso de un control (atributos de eficiencia): tipo + implementacion. */
export function controlWeight(control) {
  const type = CONTROL_TYPES[control?.control_type]
  const implementation = CONTROL_IMPLEMENTATIONS[control?.implementation]
  if (!type || !implementation) return 0
  return type.weight + implementation.weight
}

/** Calificacion cualitativa del diseno del control por su peso. */
export function controlStrength(weight) {
  if (weight >= 40) return { key: 'FUERTE', name: 'Fuerte' }
  if (weight >= 30) return { key: 'MODERADO', name: 'Moderado' }
  return { key: 'DEBIL', name: 'Débil' }
}

/**
 * Valoracion completa de un riesgo: inherente -> controles -> residual.
 * @param {{ inherent_probability: number, inherent_impact: number }} risk
 * @param {Array<{ id?: any, control_type: string, implementation: string, active?: boolean, last_test_result?: string|null }>} controls
 *   en el orden en que deben aplicarse (order_index). Un control inactivo, o cuya ultima prueba
 *   de efectividad fue NO_EFECTIVO, NO reduce: un control que no opera no mitiga nada, y contarlo
 *   mostraria un residual mas bajo que el real.
 */
export function assessRisk(risk, controls = []) {
  const inherentProbability = Number(risk?.inherent_probability) || null
  const inherentImpact = Number(risk?.inherent_impact) || null
  if (!inherentProbability || !inherentImpact) return { inherent: null, residual: null, steps: [], reduction: null }
  const inherentZone = zoneOf(inherentProbability, inherentImpact)
  let probabilityPercent = probabilityLevel(inherentProbability).percent
  let impactPercent = impactLevel(inherentImpact).percent
  const steps = []
  for (const control of controls) {
    const weight = controlWeight(control)
    const excluded = control.active === false ? 'INACTIVO' : control.last_test_result === 'NO_EFECTIVO' ? 'NO_EFECTIVO' : null
    const affects = CONTROL_TYPES[control.control_type]?.affects || null
    const before = affects === 'IMPACTO' ? impactPercent : probabilityPercent
    let after = before
    if (!excluded && weight > 0 && affects) {
      after = before - before * (weight / 100)
      if (affects === 'IMPACTO') impactPercent = after
      else probabilityPercent = after
    }
    steps.push({ id: control.id ?? null, weight, affects, before: round(before), after: round(after), excluded })
  }
  const residualProbability = levelFromPercent(probabilityPercent)
  const residualImpact = levelFromPercent(impactPercent)
  const inherentScore = probabilityLevel(inherentProbability).percent * impactLevel(inherentImpact).percent / 100
  const residualScore = probabilityPercent * impactPercent / 100
  return {
    inherent: { probability: inherentProbability, impact: inherentImpact, zone: inherentZone, score: round(inherentScore) },
    residual: {
      probability: residualProbability, impact: residualImpact, zone: zoneOf(residualProbability, residualImpact),
      probabilityPercent: round(probabilityPercent), impactPercent: round(impactPercent), score: round(residualScore),
    },
    steps,
    // Cuanto bajo la severidad (probabilidad x impacto) gracias a los controles, en %.
    reduction: inherentScore > 0 ? round(((inherentScore - residualScore) / inherentScore) * 100) : 0,
  }
}

/** Tratamiento sugerido segun la zona residual. Un riesgo de corrupcion nunca se acepta. */
export function suggestedTreatment(zone, riskType) {
  if (zone === 'BAJO' && riskType !== 'CORRUPCION') return 'ACEPTAR'
  if (zone === 'EXTREMO') return 'EVITAR'
  return 'REDUCIR_MITIGAR'
}

/** Reglas de la guia que el tratamiento elegido incumple (mensajes para mostrar). */
export function treatmentIssues({ treatment, riskType, residualZone, actionsCount }) {
  const issues = []
  if (riskType === 'CORRUPCION' && treatment === 'ACEPTAR') issues.push('Un riesgo de corrupción no puede aceptarse: la guía exige tratarlo siempre.')
  if (treatment === 'ACEPTAR' && (residualZone === 'ALTO' || residualZone === 'EXTREMO')) issues.push('Aceptar un riesgo en zona alta o extrema requiere la justificación de la línea estratégica.')
  if (treatment && treatment !== 'ACEPTAR' && !actionsCount) issues.push('El tratamiento elegido exige un plan de acción y el riesgo no tiene ninguna acción registrada.')
  return issues
}

/** Periodo de seguimiento cuatrimestral (cortes de abril, agosto y diciembre). */
export function cuatrimestreOf(date) {
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) return null
  const month = value.getUTCMonth()
  const index = month < 4 ? 1 : month < 8 ? 2 : 3
  return { year: value.getUTCFullYear(), index, label: `Cuatrimestre ${index} · ${value.getUTCFullYear()}` }
}

function round(value) { return Math.round(Number(value) * 100) / 100 }
