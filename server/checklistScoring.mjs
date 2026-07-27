// Motor de adherencia de las listas de chequeo. Generico: recorre los dominios y criterios que
// traiga CADA lista (varian en cantidad y estructura entre formatos), pero la formula es una sola
// para todo el modulo, porque la escala es fija C / NC / NA (ver docs/MODULO-LISTAS-DE-CHEQUEO.md).
//
//   Adherencia (%) = C / (C + NC) x 100
//
// Dos reglas que parecen detalles y no lo son:
//
// 1. NA se excluye del denominador. Un criterio que no aplica no penaliza — mismo criterio que
//    ya usa Matrices de Adherencia. Si TODO resulta NA, el denominador es 0 y la adherencia es
//    null ("sin dato"), NUNCA 0%: reportar como incumplimiento algo que no aplicaba seria un
//    error de lectura clinica.
// 2. Sin responder (null/undefined) NO es lo mismo que NA. NA es una respuesta deliberada del
//    auditor; sin responder es trabajo pendiente. Por eso se cuenta aparte en `pending`, que es
//    lo que debe bloquear el cierre de una auditoria.

export const CHECKLIST_VALUES = ['C', 'NC', 'NA']

export function isChecklistValue(value) {
  return CHECKLIST_VALUES.includes(value)
}

function emptyTally() {
  return { c: 0, nc: 0, na: 0 }
}

function addToTally(tally, value) {
  if (value === 'C') tally.c += 1
  else if (value === 'NC') tally.nc += 1
  else if (value === 'NA') tally.na += 1
}

/** Denominador = C + NC. Devuelve null (sin dato) si nada aplica, en vez de 0%. */
export function adherenceFromTally(tally) {
  const applicable = tally.c + tally.nc
  return {
    c: tally.c,
    nc: tally.nc,
    na: tally.na,
    applicable,
    percent: applicable > 0 ? (tally.c / applicable) * 100 : null,
  }
}

/**
 * domains:  [{ id, name?, criteria: [{ id, ... }] }]
 * subjects: [{ id, ... }]                         — sujetos auditados de esta auditoria
 * answers:  [{ subject_id, criterion_id, value }] — value en C | NC | NA (otro valor se ignora)
 *
 * Devuelve adherencia en los cuatro niveles que pide el formato: general, por dominio,
 * por criterio (transversal a todos los sujetos) y por sujeto.
 */
export function computeAdherence({ domains = [], subjects = [], answers = [] }) {
  const criterionToDomain = new Map()
  const criterionTally = new Map()
  const domainTally = new Map()
  const subjectTally = new Map()

  for (const domain of domains) {
    domainTally.set(String(domain.id), emptyTally())
    for (const criterion of domain.criteria || []) {
      criterionToDomain.set(String(criterion.id), String(domain.id))
      criterionTally.set(String(criterion.id), emptyTally())
    }
  }
  for (const subject of subjects) subjectTally.set(String(subject.id), emptyTally())

  const overall = emptyTally()
  let answered = 0

  for (const answer of answers) {
    const value = answer.value
    if (!isChecklistValue(value)) continue
    const criterionId = String(answer.criterion_id)
    // Una respuesta a un criterio que ya no existe en la lista (criterio borrado despues de
    // diligenciar) se descarta en vez de contaminar el total.
    const domainId = criterionToDomain.get(criterionId)
    if (domainId === undefined) continue

    answered += 1
    addToTally(overall, value)
    addToTally(criterionTally.get(criterionId), value)
    addToTally(domainTally.get(domainId), value)

    const subjectId = String(answer.subject_id)
    const subjectBucket = subjectTally.get(subjectId)
    if (subjectBucket) addToTally(subjectBucket, value)
  }

  const totalCriteria = criterionTally.size
  const expected = totalCriteria * subjects.length

  return {
    overall: adherenceFromTally(overall),
    byDomain: [...domainTally.entries()].map(([domainId, tally]) => ({ domainId, ...adherenceFromTally(tally) })),
    byCriterion: [...criterionTally.entries()].map(([criterionId, tally]) => ({
      criterionId, domainId: criterionToDomain.get(criterionId), ...adherenceFromTally(tally),
    })),
    bySubject: [...subjectTally.entries()].map(([subjectId, tally]) => ({ subjectId, ...adherenceFromTally(tally) })),
    // Base para bloquear el cierre: mientras `pending > 0` la auditoria esta incompleta.
    expected,
    answered,
    pending: Math.max(0, expected - answered),
    complete: expected > 0 && answered >= expected,
  }
}

// Semaforo del sistema — mismos cortes que src/design-system/tokens.ts, replicados aqui porque el
// server no importa del bundle del cliente. Si cambian alla, cambian aca.
export function conceptFromPercent(percent) {
  if (percent === null || percent === undefined) return null
  if (percent >= 90) return 'OPTIMO'
  if (percent >= 80) return 'ACEPTABLE'
  if (percent >= 70) return 'DEFICIENTE'
  return 'MUY_DEFICIENTE'
}
