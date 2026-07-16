const FORMAT_CODE = 'FT-ENC-001'
const FORMAT_VERSION = '1'

const complianceLabels = { OPTIMO: 'Óptimo', ACEPTABLE: 'Aceptable', DEFICIENTE: 'Deficiente', MUY_DEFICIENTE: 'Muy deficiente' }
// Misma escala de semaforo fija que el resto de la plataforma (ver src/design-system/tokens.ts).
const complianceColors = { OPTIMO: '#059669', ACEPTABLE: '#65A30D', DEFICIENTE: '#D97706', MUY_DEFICIENTE: '#DC2626' }

function complianceLevel(percent) {
  if (percent == null) return null
  if (percent >= 90) return 'OPTIMO'
  if (percent >= 80) return 'ACEPTABLE'
  if (percent >= 70) return 'DEFICIENTE'
  return 'MUY_DEFICIENTE'
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

function formatDate(value) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(new Date(value))
}

function formatPercent(value) {
  return value === null || value === undefined ? 'N/A' : `${Math.round(Number(value))}%`
}

function barRow(label, count, percent, color) {
  return `
    <div class="bar-row">
      <span class="bar-label">${escapeHtml(label)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(0, Math.min(100, percent))}%;background:${color}"></div></div>
      <span class="bar-value">${percent}% (${count})</span>
    </div>`
}

function questionSection(stat, color) {
  const header = `<h3>${escapeHtml(stat.prompt)} <span class="muted">· ${stat.totalAnswered} respuesta${stat.totalAnswered === 1 ? '' : 's'}</span></h3>`

  if (stat.breakdown && stat.breakdown.length) {
    const bars = stat.breakdown.map(item => barRow(item.label ?? String(item.value), item.count, item.percent, color)).join('')
    const table = `<table><thead><tr><th>Opción</th><th class="num">Respuestas</th><th class="num">%</th></tr></thead><tbody>
      ${stat.breakdown.map(item => `<tr><td>${escapeHtml(item.label ?? String(item.value))}</td><td class="num">${item.count}</td><td class="num">${item.percent}%</td></tr>`).join('')}
    </tbody></table>`
    return `<div class="question-block">${header}${bars}${table}</div>`
  }

  if (stat.matching && stat.matching.length) {
    const perTargetRows = (stat.perTarget || []).map(target => barRow(target.label, '', target.accuracyPercent ?? 0, target.color || color)).join('')
    const table = `<table><thead><tr><th>Línea</th><th class="num">% de acierto</th></tr></thead><tbody>
      ${(stat.perTarget || []).map(target => `<tr><td>${escapeHtml(target.label)}</td><td class="num">${target.accuracyPercent == null ? 'N/A' : `${target.accuracyPercent}%`}</td></tr>`).join('')}
    </tbody></table>`
    return `<div class="question-block">${header}
      ${stat.accuracyPercent != null ? `<p class="muted">Acierto global: <strong>${stat.accuracyPercent}%</strong></p>` : ''}
      <p class="muted">Acierto promedio por línea:</p>
      ${perTargetRows}
      ${table}
    </div>`
  }

  if (stat.average != null && !stat.rows) {
    return `<div class="question-block">${header}<p class="stat-number">${stat.average}<span class="muted"> / promedio</span></p></div>`
  }

  if (stat.rows && stat.rows.length) {
    const table = `<table><thead><tr><th>Fila</th><th class="num">Promedio</th></tr></thead><tbody>
      ${stat.rows.map(row => `<tr><td>${escapeHtml(row.label)}</td><td class="num">${row.average ?? '—'}</td></tr>`).join('')}
    </tbody></table>`
    return `<div class="question-block">${header}${table}</div>`
  }

  if (stat.ranking && stat.ranking.length) {
    const table = `<table><thead><tr><th>Opción</th><th class="num">Posición promedio</th></tr></thead><tbody>
      ${stat.ranking.map(item => `<tr><td>${escapeHtml(item.label)}</td><td class="num">${item.averagePosition ?? '—'}</td></tr>`).join('')}
    </tbody></table>`
    return `<div class="question-block">${header}${table}</div>`
  }

  if (stat.min != null || stat.max != null) {
    return `<div class="question-block">${header}<p class="muted">Promedio: <strong>${stat.average ?? '—'}</strong> · Mínimo: <strong>${stat.min ?? '—'}</strong> · Máximo: <strong>${stat.max ?? '—'}</strong></p></div>`
  }

  if (stat.sample) {
    const list = stat.sample.length
      ? `<ul class="obs-list">${stat.sample.map(text => `<li>“${escapeHtml(text)}”</li>`).join('')}</ul>`
      : `<p class="muted">Sin respuestas de texto todavía.</p>`
    return `<div class="question-block">${header}${list}</div>`
  }

  return `<div class="question-block">${header}<p class="muted">Sin datos suficientes.</p></div>`
}

export function renderSurveyReportHtml({ survey, totals, compliance, timeline, avgCompletionSeconds, demographics, questions, dateFrom, dateTo, generatedAt }) {
  const level = complianceLevel(compliance.percent)
  const rangeLabel = dateFrom || dateTo
    ? `${dateFrom ? formatDate(dateFrom) : 'inicio'} — ${dateTo ? formatDate(dateTo) : 'hoy'}`
    : 'Todas las respuestas (histórico completo)'

  const timelineRows = timeline.map(row => `<tr><td>${row.date}</td><td class="num">${row.count}</td></tr>`).join('')
  const demographicsBlocks = (demographics || []).map(cross => `
    <h3>${escapeHtml(cross.label)}</h3>
    <table><thead><tr><th>Grupo</th><th class="num">Promedio</th><th class="num">Respuestas</th></tr></thead><tbody>
      ${cross.rows.map(row => `<tr><td>${escapeHtml(row.label)}</td><td class="num">${row.average ?? '—'}</td><td class="num">${row.count}</td></tr>`).join('')}
    </tbody></table>`).join('')

  const questionBlocks = questions.map(stat => questionSection(stat, '#0F7A54')).join('')
  const avgMinutes = avgCompletionSeconds != null ? Math.round(avgCompletionSeconds / 60) : null

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #172033; font-size: 11px; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 18px 0 8px; color: #0F7A54; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid #e5e9f0; padding-bottom: 4px; }
  h3 { font-size: 11.5px; margin: 14px 0 6px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0F7A54; padding-bottom: 10px; margin-bottom: 14px; }
  .format-meta { text-align: right; font-size: 9px; color: #667085; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; }
  .grid div { padding: 2px 0; }
  .grid b { display: inline-block; min-width: 130px; color: #526074; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  th, td { border: 1px solid #d2d9e3; padding: 5px 8px; text-align: left; }
  th { background: #f6f8fa; font-size: 9.5px; text-transform: uppercase; color: #526074; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .summary-box { display: flex; gap: 14px; margin: 10px 0 16px; }
  .summary-card { flex: 1; border: 1px solid #d2d9e3; border-radius: 8px; padding: 10px 14px; }
  .summary-card span { display: block; font-size: 9px; color: #667085; text-transform: uppercase; }
  .summary-card strong { display: block; font-size: 20px; margin-top: 4px; }
  .concept-badge { display: inline-block; margin-top: 4px; padding: 3px 10px; border-radius: 999px; font-weight: 700; font-size: 11px; }
  .muted { color: #667085; }
  .stat-number { font-size: 22px; font-weight: 800; margin: 4px 0; }
  .question-block { margin-bottom: 14px; page-break-inside: avoid; }
  .bar-row { display: flex; align-items: center; gap: 8px; margin: 3px 0; }
  .bar-label { width: 140px; flex: none; font-size: 10px; }
  .bar-track { flex: 1; height: 10px; border-radius: 999px; background: #eef1f6; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 999px; }
  .bar-value { width: 90px; flex: none; text-align: right; font-size: 10px; font-variant-numeric: tabular-nums; }
  .obs-list { margin: 0; padding-left: 16px; }
  .obs-list li { margin-bottom: 4px; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Informe de Encuesta: ${escapeHtml(survey.title)}</h1>
      <div>${escapeHtml(survey.code || '')}</div>
    </div>
    <div class="format-meta">
      Formato: ${FORMAT_CODE} · Versión ${FORMAT_VERSION}<br />
      Generado: ${formatDate(generatedAt)}
    </div>
  </div>

  <h2>Datos generales</h2>
  <div class="grid">
    <div><b>Encuesta</b>${escapeHtml(survey.title)}</div>
    <div><b>Estado</b>${escapeHtml(survey.status)}</div>
    <div><b>Rango del corte</b>${rangeLabel}</div>
    <div><b>Respuestas incluidas</b>${totals.totalResponses} (${totals.completedResponses} completas)</div>
  </div>

  <div class="summary-box">
    <div class="summary-card"><span>Respuestas totales</span><strong>${totals.totalResponses}</strong></div>
    <div class="summary-card"><span>Tasa de finalización</span><strong>${totals.completionRate}%</strong></div>
    <div class="summary-card">
      <span>${compliance.basis === 'accuracy' ? 'Cumplimiento (acierto)' : 'Cumplimiento (finalización)'}</span>
      <strong>${formatPercent(compliance.percent)}</strong>
      <span class="concept-badge" style="background:${level ? `${complianceColors[level]}18` : '#f1f5f9'};color:${level ? complianceColors[level] : '#94a3b8'}">${level ? complianceLabels[level] : 'Sin datos'}</span>
    </div>
    ${avgMinutes != null ? `<div class="summary-card"><span>Tiempo promedio</span><strong>${avgMinutes} min</strong></div>` : ''}
  </div>

  <h2>Participación por período</h2>
  <table><thead><tr><th>Fecha</th><th class="num">Respuestas</th></tr></thead><tbody>${timelineRows || '<tr><td colspan="2">Sin respuestas en el rango seleccionado</td></tr>'}</tbody></table>

  ${demographicsBlocks ? `<h2>Cruces demográficos</h2>${demographicsBlocks}` : ''}

  <h2>Desglose por pregunta</h2>
  ${questionBlocks}
</body>
</html>`
}
