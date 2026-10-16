// Prueba de humo del modulo Gestion del Riesgo CONTRA EL SERVIDOR EN MARCHA (local o produccion).
// Recorre el flujo completo por la API real: mapa -> riesgo -> causas -> controles -> prueba de
// efectividad -> plan -> materializacion (con revaluacion y cierre) -> seguimiento -> tablero ->
// PDF y CSV, y comprueba que las reglas de la guia se rechacen donde deben.
//
// Todo queda en un mapa propio, «Mapa de PRUEBA», para no tocar el mapa vigente de la entidad.
// Se autentica con una sesion temporal del superadministrador que se borra al terminar.
//
// Uso: node --env-file=<.env> scripts/risk-smoke-test.mjs [--proceso=MIS-02] [--limpiar]
//      --limpiar borra el «Mapa de PRUEBA» y todo lo que cuelga de el (nada mas).

import { pool, query } from '../server/db.mjs'
import { createSessionToken, hashToken } from '../server/security.mjs'

const MAP_NAME = 'Mapa de PRUEBA'
const BASE = `http://127.0.0.1:${process.env.PORT || 3100}/api`
const processArg = (process.argv.find(arg => arg.startsWith('--proceso=')) || '--proceso=MIS-02').split('=')[1]

async function cleanup() {
  const result = await query('DELETE FROM risk_maps WHERE name = $1 RETURNING id', [MAP_NAME])
  console.log(`Mapa de prueba eliminado (${result.rowCount}). Los mapas reales no se tocan.`)
}

async function main() {
  if (process.argv.includes('--limpiar')) return cleanup()

  const admin = await query(
    `SELECT m.id AS membership_id, m.organization_id FROM memberships m JOIN roles r ON r.id = m.role_id
     WHERE r.key = 'SUPERADMIN' AND m.active ORDER BY m.id LIMIT 1`)
  if (!admin.rows[0]) throw new Error('No hay superadministrador activo')
  const token = createSessionToken()
  await query(`INSERT INTO sessions (token_hash, membership_id, expires_at, user_agent) VALUES ($1,$2,NOW() + INTERVAL '10 minutes','risk-smoke-test')`,
    [hashToken(token), admin.rows[0].membership_id])
  const cookie = `sgimr_session=${token}`
  const results = []
  const check = (label, ok, detail = '') => { results.push({ label, ok }); console.log(`${ok ? 'OK ' : 'FALLO'} ${label}${detail ? ` · ${detail}` : ''}`) }
  async function call(method, path, body) {
    const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined })
    const type = res.headers.get('content-type') || ''
    return { status: res.status, data: type.includes('json') ? await res.json() : await res.arrayBuffer() }
  }

  try {
    const catalogs = (await call('GET', '/risks/catalogs')).data
    const proc = catalogs.processes.find(item => item.code === processArg)
    if (!proc) throw new Error(`No existe el proceso ${processArg}`)
    console.log(`Proceso de prueba: ${proc.code} · ${proc.name}\n`)

    let map = catalogs.maps.find(item => item.name === MAP_NAME)
    if (!map) map = (await call('POST', '/risks/maps', { name: MAP_NAME, year: new Date().getFullYear(), description: 'Datos de prueba del módulo. Se puede borrar.' })).data
    check('Mapa de prueba disponible', Boolean(map?.id), map?.name)

    const created = await call('POST', '/risks/risks', {
      mapId: map.id, processId: proc.id, riskType: 'GESTION', typology: 'Ejecución y administración de procesos',
      impactStatement: 'afectación a la salud del paciente', causeImmediate: '[PRUEBA] la entrega de un resultado de laboratorio a un paciente equivocado',
      causeRoot: 'la rotulación manual de las muestras sin verificación contra la orden médica',
      description: `[PRUEBA] Posibilidad de afectación a la salud del paciente por la entrega de un resultado a un paciente equivocado debido a la rotulación manual de las muestras sin verificación contra la orden médica`,
      consequences: 'Diagnóstico o tratamiento erróneo, repetición de la toma, queja del usuario.',
      exposurePerYear: 18000, inherentImpact: 4, impactCriterion: 'SALUD', treatment: 'REDUCIR_MITIGAR',
    })
    check('Riesgo creado por la API', created.status === 201, created.data.code)
    const riskId = created.data.id

    let detail = (await call('GET', `/risks/risks/${riskId}`)).data
    check('Probabilidad calculada por exposición (18.000/año → Muy alta)', detail.risk.inherent_probability === 5)
    check('Zona inherente Muy alta × Mayor = Alto', detail.risk.assessment.inherent.zone === 'ALTO')
    check('Causas creadas desde la redacción', detail.causes.length === 2)
    const rootCause = detail.causes.find(cause => cause.kind === 'RAIZ')

    const c1 = await call('POST', `/risks/risks/${riskId}/controls`, { description: '[PRUEBA] El auxiliar de laboratorio verifica con lector de código de barras que el rótulo coincida con la orden antes de procesar; si no coincide, rechaza la muestra y lo registra en el software.', responsible: 'Auxiliar de laboratorio', controlType: 'PREVENTIVO', implementation: 'AUTOMATICO', causeId: rootCause.id })
    const c2 = await call('POST', `/risks/risks/${riskId}/controls`, { description: '[PRUEBA] La bacterióloga valida el resultado contra la historia clínica antes de liberarlo.', responsible: 'Bacterióloga', controlType: 'DETECTIVO', implementation: 'MANUAL' })
    check('Dos controles registrados', c1.status === 201 && c2.status === 201)
    detail = (await call('GET', `/risks/risks/${riskId}`)).data
    const a = detail.risk.assessment
    // 100% - 50% = 50%; 50% - 30% = 35% -> Baja. Impacto sin correctivo sigue Mayor -> Alto.
    check('Residual secuencial correcto (100% → 50% → 35%)', a.residual.probabilityPercent === 35, `${a.residual.probabilityPercent}% · zona ${a.residual.zone}`)

    await call('POST', `/risks/controls/${c2.data.id}/tests`, { result: 'NO_EFECTIVO', defenseLine: 'TERCERA', observations: '[PRUEBA] En la muestra revisada no hay evidencia de la validación.' })
    detail = (await call('GET', `/risks/risks/${riskId}`)).data
    check('Control no efectivo deja de reducir (35% → 50%)', detail.risk.assessment.residual.probabilityPercent === 50, detail.risk.assessment.steps.map(step => step.excluded || 'aplica').join(', '))
    await call('POST', `/risks/controls/${c2.data.id}/tests`, { result: 'EFECTIVO', defenseLine: 'TERCERA', observations: '[PRUEBA] Corregido.' })

    const noEvidence = await call('POST', `/risks/risks/${riskId}/actions`, { description: '[PRUEBA] x', status: 'TERMINADA' })
    check('Regla: no se termina una acción sin evidencia', noEvidence.status === 400)
    const due = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10)
    const action = await call('POST', `/risks/risks/${riskId}/actions`, { description: '[PRUEBA] Implementar la rotulación con código de barras en todos los puntos de toma de muestra.', responsibleName: 'Coordinación de laboratorio', dueDate: due, status: 'EN_CURSO', progress: 30 })
    check('Acción de tratamiento registrada', action.status === 201, action.data.code)

    const today = new Date().toISOString().slice(0, 10)
    const mat = await call('POST', `/risks/risks/${riskId}/materializations`, { occurredAt: today, detectedAt: today, description: '[PRUEBA] Se entregó un resultado de glicemia a un paciente distinto por error de rótulo.', actualImpact: 3, affectedPeople: 1, economicLoss: 0, failedControlIds: [c1.data.id], notifiedParties: ['LIDER_PROCESO'] })
    check('Materialización reportada', mat.status === 201, mat.data.code)
    const early = await call('PATCH', `/risks/materializations/${mat.data.id}`, { status: 'CERRADA' })
    check('Regla: no cierra sin causa raíz ni revaluación', early.status === 400, early.data.error)
    const corrective = await call('POST', `/risks/risks/${riskId}/actions`, { materializationId: mat.data.id, description: '[PRUEBA] Reentrenar al personal en la doble verificación del rótulo.', status: 'EN_CURSO' })
    await call('PATCH', `/risks/materializations/${mat.data.id}`, { status: 'EN_TRATAMIENTO', rootCause: '[PRUEBA] El lector estaba fuera de servicio y no había procedimiento de contingencia.', revaluation: { probability: 5, impact: 4, note: '[PRUEBA] Se confirma la valoración; se agrega contingencia ante falla del lector.' } })
    const withOpen = await call('PATCH', `/risks/materializations/${mat.data.id}`, { status: 'CERRADA' })
    check('Regla: no cierra con correctivas abiertas', withOpen.status === 400)
    await call('PATCH', `/risks/actions/${corrective.data.id}`, { status: 'TERMINADA', evidence: '[PRUEBA] Acta de capacitación' })
    const closed = await call('PATCH', `/risks/materializations/${mat.data.id}`, { status: 'CERRADA', closureNotes: '[PRUEBA] Verificado.' })
    check('Materialización cerrada tras cumplir el ciclo', closed.status === 200)

    const review = await call('POST', `/risks/risks/${riskId}/reviews`, { defenseLine: 'TERCERA', conclusion: 'REQUIERE_AJUSTES', observations: '[PRUEBA] Documentar la contingencia ante falla del lector.' })
    check('Seguimiento de tercera línea registrado', review.status === 201, review.data.period_label)

    const dash = (await call('GET', `/risks/dashboard?mapId=${map.id}`)).data
    check('Tablero del mapa de prueba', dash.kpis?.total >= 1, `riesgos ${dash.kpis.total} · materializaciones ${dash.kpis.materializations.total}`)
    const pdf = await call('GET', `/risks/report.pdf?mapId=${map.id}`)
    check('Informe PDF generado en el servidor', pdf.status === 200 && pdf.data.byteLength > 20000, `${Math.round(pdf.data.byteLength / 1024)} KB`)
    const csv = await call('GET', `/risks/export.csv?mapId=${map.id}`)
    check('CSV exportado', csv.status === 200)
    const history = (await call('GET', `/risks/risks/${riskId}`)).data.activity
    check('Bitácora registra el ciclo', history.length >= 8, `${history.length} eventos`)

    const failed = results.filter(item => !item.ok).length
    console.log(`\n${results.length - failed}/${results.length} comprobaciones OK. Riesgo de prueba: ${created.data.code} (mapa «${MAP_NAME}»).`)
    if (failed) process.exitCode = 1
  } finally {
    await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)])
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => pool.end())
