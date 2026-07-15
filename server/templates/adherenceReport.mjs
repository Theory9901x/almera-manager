const FORMAT_CODE = 'FT-ADH-001'
const FORMAT_VERSION = '1'

const conceptLabels = { OPTIMO: 'Óptimo', ACEPTABLE: 'Aceptable', DEFICIENTE: 'Deficiente', MUY_DEFICIENTE: 'Muy deficiente' }
// Misma escala de semaforo fija que el dashboard en vivo — un mismo porcentaje siempre se ve del mismo color.
const conceptColors = { OPTIMO: '#059669', ACEPTABLE: '#65A30D', DEFICIENTE: '#D97706', MUY_DEFICIENTE: '#DC2626' }

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

function formatDate(value) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(new Date(value))
}

function formatPercent(value) {
  return value === null || value === undefined ? 'N/A' : `${Number(value).toFixed(1)}%`
}

const professionalStatusLabels = {
  ACTIVE_INDEFINITE: 'Activo - indefinido',
  ACTIVE_ADAPTATION: 'Activo - periodo de adaptación',
  WITHDRAWN: 'Retirado',
}

export function renderAdherenceReportHtml({ evaluation, scopes, criteria, records, scopeResults, criterionResults, thresholds }) {
  const scopeResultById = new Map(scopeResults.map(result => [String(result.scopeId), result]))
  const criterionResultById = new Map(criterionResults.map(result => [String(result.criterionId), result]))
  const criteriaByScope = new Map(scopes.map(scope => [String(scope.id), criteria.filter(criterion => String(criterion.scope_id) === String(scope.id))]))

  const scopeRows = scopes.map(scope => {
    const scopeResult = scopeResultById.get(String(scope.id))
    const criterionRows = (criteriaByScope.get(String(scope.id)) || []).map(criterion => {
      const result = criterionResultById.get(String(criterion.id))
      return `<tr>
        <td class="criterion-text">${escapeHtml(criterion.text)}</td>
        <td class="num">${Number(criterion.weight).toFixed(2)}%</td>
        <td class="num">${result ? formatPercent(result.compliancePercent) : 'N/A'}</td>
      </tr>`
    }).join('')
    return `
      <tr class="scope-row"><td colspan="2">${escapeHtml(scope.name)}</td><td class="num">${scopeResult ? formatPercent(scopeResult.compliancePercent) : 'N/A'}</td></tr>
      ${criterionRows}
    `
  }).join('')

  const recordRows = records.map(record => `
    <tr>
      <td>${escapeHtml(record.record_number)}</td>
      <td>${escapeHtml(record.observations) || '—'}</td>
    </tr>
  `).join('')

  const thresholdRows = thresholds.map(threshold => `<tr><td>${conceptLabels[threshold.concept] || threshold.concept}</td><td class="num">≥ ${Number(threshold.min_percent).toFixed(0)}%</td></tr>`).join('')

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #172033; font-size: 11px; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 18px 0 8px; color: #c7192d; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid #e5e9f0; padding-bottom: 4px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #c7192d; padding-bottom: 10px; margin-bottom: 14px; }
  .format-meta { text-align: right; font-size: 9px; color: #667085; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; }
  .grid div { padding: 2px 0; }
  .grid b { display: inline-block; min-width: 130px; color: #526074; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  th, td { border: 1px solid #d2d9e3; padding: 5px 8px; text-align: left; }
  th { background: #f6f8fa; font-size: 9.5px; text-transform: uppercase; color: #526074; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .criterion-text { padding-left: 18px; }
  .scope-row td { background: #fdf1f2; font-weight: 700; }
  .summary-box { display: flex; gap: 14px; margin: 10px 0 16px; }
  .summary-card { flex: 1; border: 1px solid #d2d9e3; border-radius: 8px; padding: 10px 14px; }
  .summary-card span { display: block; font-size: 9px; color: #667085; text-transform: uppercase; }
  .summary-card strong { display: block; font-size: 20px; margin-top: 4px; }
  .concept-badge { display: inline-block; margin-top: 4px; padding: 3px 10px; border-radius: 999px; font-weight: 700; font-size: 11px; }
  .signatures { display: flex; gap: 24px; margin-top: 24px; }
  .signature-box { flex: 1; border-top: 1px solid #172033; padding-top: 6px; }
  .signature-box small { display: block; color: #667085; }
  .obs-block { white-space: pre-wrap; border: 1px solid #d2d9e3; border-radius: 8px; padding: 10px; min-height: 30px; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Informe de Adherencia a Historia Clínica</h1>
      <div>${escapeHtml(evaluation.area_name)}</div>
    </div>
    <div class="format-meta">
      Formato: ${FORMAT_CODE} · Versión ${FORMAT_VERSION}<br />
      Matriz v${evaluation.matrix_version_id}
    </div>
  </div>

  <h2>Datos generales</h2>
  <div class="grid">
    <div><b>Profesional evaluado</b>${escapeHtml(evaluation.professional_name)}</div>
    <div><b>No. documento</b>${escapeHtml(evaluation.document_id)}</div>
    <div><b>Área</b>${escapeHtml(evaluation.area_name)}</div>
    <div><b>Servicio</b>${escapeHtml(evaluation.service) || '—'}</div>
    <div><b>Ciudad / sede</b>${escapeHtml(evaluation.city_site) || '—'}</div>
    <div><b>Estado del profesional</b>${professionalStatusLabels[evaluation.professional_status_snapshot] || evaluation.professional_status_snapshot}</div>
    <div><b>Mes reportado</b>${escapeHtml(evaluation.month_reported)}</div>
    <div><b>Fecha de evaluación</b>${formatDate(evaluation.evaluation_date)}</div>
  </div>

  <div class="summary-box">
    <div class="summary-card"><span>Total HC evaluadas</span><strong>${evaluation.total_records}</strong></div>
    <div class="summary-card"><span>Cumplimiento general</span><strong>${formatPercent(evaluation.overall_compliance)}</strong></div>
    <div class="summary-card"><span>Concepto</span><span class="concept-badge" style="background:${evaluation.concept ? `${conceptColors[evaluation.concept]}18` : '#f1f5f9'};color:${evaluation.concept ? conceptColors[evaluation.concept] : '#94a3b8'}">${evaluation.concept ? (conceptLabels[evaluation.concept] || evaluation.concept) : 'Sin calificar'}</span></div>
  </div>

  <h2>Historias clínicas evaluadas</h2>
  <table><thead><tr><th>No. HC</th><th>Observaciones</th></tr></thead><tbody>${recordRows || '<tr><td colspan="2">Sin historias clínicas registradas</td></tr>'}</tbody></table>

  <h2>Resultados por ámbito y criterio</h2>
  <table><thead><tr><th>Ámbito / criterio</th><th>Peso</th><th>Cumplimiento</th></tr></thead><tbody>${scopeRows}</tbody></table>

  <h2>Escala de cumplimiento</h2>
  <table><thead><tr><th>Concepto</th><th>Umbral</th></tr></thead><tbody>${thresholdRows}</tbody></table>

  <h2>Observaciones generales</h2>
  <div class="obs-block">${escapeHtml(evaluation.general_observations) || 'Sin observaciones registradas.'}</div>

  <h2>Compromisos del profesional</h2>
  <div class="obs-block">${escapeHtml(evaluation.commitments) || 'Sin compromisos registrados.'}</div>

  <h2>Plan de mejora</h2>
  <div class="obs-block">${evaluation.improvement_plan_percent !== null && evaluation.improvement_plan_percent !== undefined ? `Mejoramiento esperado: ${Number(evaluation.improvement_plan_percent).toFixed(1)}%` : 'Sin plan de mejora registrado.'}</div>

  <div class="signatures">
    <div class="signature-box">
      <strong>${escapeHtml(evaluation.evaluator_signed_name) || 'Pendiente de firma'}</strong>
      <small>Evaluador · ${evaluation.evaluator_signed_at ? formatDate(evaluation.evaluator_signed_at) : 'sin fecha'}</small>
    </div>
    <div class="signature-box">
      <strong>${escapeHtml(evaluation.professional_signed_name) || 'Pendiente de firma'}</strong>
      <small>Profesional auditado · ${evaluation.professional_signed_at ? formatDate(evaluation.professional_signed_at) : 'sin fecha'}</small>
    </div>
  </div>
</body>
</html>`
}
