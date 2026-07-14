const conceptLabels = { OPTIMO: 'Óptimo', ACEPTABLE: 'Aceptable', DEFICIENTE: 'Deficiente', MUY_DEFICIENTE: 'Muy deficiente' }
const conceptColors = { OPTIMO: '#087a54', ACEPTABLE: '#315fae', DEFICIENTE: '#a8640d', MUY_DEFICIENTE: '#c7192d' }

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

function formatPercent(value) {
  return value === null || value === undefined ? 'N/A' : `${Number(value).toFixed(1)}%`
}

function colorForPercent(value, thresholds) {
  if (value === null || value === undefined) return '#94a3b8'
  const sorted = [...thresholds].sort((a, b) => Number(b.min_percent) - Number(a.min_percent))
  const match = sorted.find(threshold => value >= Number(threshold.min_percent))
  return match ? (conceptColors[match.concept] || '#94a3b8') : '#94a3b8'
}

function bar(label, value, thresholds, maxValue = 100) {
  const width = value === null ? 0 : Math.max(2, (Number(value) / maxValue) * 100)
  const color = colorForPercent(value, thresholds)
  return `
    <div class="bar-row">
      <span class="bar-label">${escapeHtml(label)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${width}%;background:${color}"></div></div>
      <span class="bar-value">${formatPercent(value)}</span>
    </div>`
}

export function renderAdherenceDashboardHtml({ dashboard, thresholds, filters }) {
  const filterLines = []
  if (filters.areaId) filterLines.push('Área filtrada')
  if (filters.professionalId) filterLines.push('Profesional filtrado')
  if (filters.positionId) filterLines.push('Cargo filtrado')
  if (filters.monthReported) filterLines.push(`Mes: ${escapeHtml(filters.monthReported)}`)

  const conceptRows = Object.entries(dashboard.byConcept).map(([concept, count]) => `
    <div class="bar-row">
      <span class="bar-label">${conceptLabels[concept] || concept}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${dashboard.totalEvaluations ? (count / dashboard.totalEvaluations) * 100 : 0}%;background:${conceptColors[concept]}"></div></div>
      <span class="bar-value">${count}</span>
    </div>`).join('')

  const scopeRows = dashboard.byScope
    .sort((left, right) => right.averageCompliance - left.averageCompliance)
    .map(item => bar(`${item.areaName} · ${item.scopeName}`, item.averageCompliance, thresholds)).join('')

  const professionalRows = dashboard.byProfessional
    .map(item => bar(`${item.professionalName} (${item.areaName})`, item.averageCompliance, thresholds)).join('')

  const monthRows = dashboard.byMonth
    .map(item => bar(item.month, item.averageCompliance, thresholds)).join('')

  const legend = Object.entries(conceptLabels).map(([key, label]) => `<span class="legend-item"><i style="background:${conceptColors[key]}"></i>${label}</span>`).join('')

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #172033; font-size: 11px; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 18px 0 8px; color: #c7192d; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid #e5e9f0; padding-bottom: 4px; }
  .header { border-bottom: 3px solid #c7192d; padding-bottom: 10px; margin-bottom: 6px; }
  .filters { color: #667085; font-size: 9.5px; }
  .summary-box { display: flex; gap: 14px; margin: 14px 0; }
  .summary-card { flex: 1; border: 1px solid #d2d9e3; border-radius: 8px; padding: 10px 14px; }
  .summary-card span { display: block; font-size: 9px; color: #667085; text-transform: uppercase; }
  .summary-card strong { display: block; font-size: 20px; margin-top: 4px; }
  .legend { display: flex; gap: 14px; margin-bottom: 10px; }
  .legend-item { display: inline-flex; align-items: center; gap: 5px; font-size: 9.5px; color: #526074; }
  .legend-item i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; }
  .bar-row { display: grid; grid-template-columns: 190px 1fr 46px; align-items: center; gap: 8px; margin-bottom: 6px; }
  .bar-label { font-size: 10px; color: #344054; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-track { height: 10px; background: #eef1f5; border-radius: 99px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 99px; }
  .bar-value { text-align: right; font-variant-numeric: tabular-nums; font-size: 10px; }
</style>
</head>
<body>
  <div class="header">
    <h1>Dashboard de Adherencia a Historia Clínica</h1>
    <div class="filters">${filterLines.length ? filterLines.join(' · ') : 'Todos los registros'}</div>
  </div>

  <div class="summary-box">
    <div class="summary-card"><span>Evaluaciones</span><strong>${dashboard.totalEvaluations}</strong></div>
    <div class="summary-card"><span>Cumplimiento promedio</span><strong>${formatPercent(dashboard.averageCompliance)}</strong></div>
  </div>

  <div class="legend">${legend}</div>

  <h2>Distribución por concepto</h2>
  ${conceptRows}

  <h2>Cumplimiento por ámbito</h2>
  ${scopeRows || '<p>Sin datos suficientes.</p>'}

  <h2>Ranking de profesionales</h2>
  ${professionalRows || '<p>Sin datos suficientes.</p>'}

  <h2>Evolución por mes reportado</h2>
  ${monthRows || '<p>Sin datos suficientes.</p>'}
</body>
</html>`
}
