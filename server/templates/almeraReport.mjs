// Informe PDF de Asistencias Tecnicas. Mismo enfoque que radicadosReport.mjs: graficas en CSS
// puro (conic-gradient y barras), nitidas a cualquier resolucion y sin canvas. Los colores de
// estado son los MISMOS de la pantalla (.ats-app): color de FLUJO del ciclo de una solicitud,
// no el semaforo de cumplimiento del sistema (§5.1) — aqui no hay porcentaje que medir.
const ACCENT = '#3478f6'
const STATE_COLORS = {
  VENCIDA: '#d93835',
  PENDIENTE: '#b97b0a',
  EN_CURSO: '#2465e5',
  COMPLETADA: '#178f5c',
  CANCELADA: '#5f6d82',
}
const STATE_LABELS = {
  VENCIDA: 'Vencidas',
  PENDIENTE: 'Sin iniciar',
  EN_CURSO: 'En curso',
  COMPLETADA: 'Completadas',
  CANCELADA: 'Canceladas',
}
const PRIORITY_LABELS = { BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta', CRITICA: 'Crítica' }
const PRIORITY_COLORS = { BAJA: '#5f6d82', MEDIA: '#2465e5', ALTA: '#b97b0a', CRITICA: '#d93835' }

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function clip(value, size) {
  const text = String(value ?? '')
  return text.length > size ? `${text.slice(0, size)}…` : text
}

/** Barras horizontales relativas al mayor valor del grupo (mismo criterio que Radicados). */
function barRows(data) {
  const max = Math.max(1, ...data.map(item => item.value))
  return data.map(item => `
    <div class="bar-row">
      <span class="bar-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.round((item.value / max) * 100)}%"></span></span>
      <span class="bar-value">${item.value}</span>
    </div>`).join('')
}

/** Pastel via conic-gradient con leyenda HTML. Cada porcion usa SU color de estado. */
function pieChart(data) {
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1
  let cursor = 0
  const stops = data.map(item => {
    const start = (cursor / total) * 360
    cursor += item.value
    const end = (cursor / total) * 360
    return `${item.color} ${start}deg ${end}deg`
  }).join(', ')
  const legend = data.map(item => `
    <div class="pie-legend-row">
      <span class="pie-swatch" style="background:${item.color}"></span>
      <span>${escapeHtml(item.label)}</span>
      <b>${item.value}</b>
      <span class="muted">(${Math.round((item.value / total) * 100)}%)</span>
    </div>`).join('')
  return `
    <div class="pie-wrap">
      <div class="pie" style="background: conic-gradient(${stops})"><span class="pie-hole">${total}</span></div>
      <div class="pie-legend">${legend}</div>
    </div>`
}

export function renderAlmeraReportHtml({
  organizationName, generatedAt, generatedBy, filtered, rows, summary, byModule, byProcess,
}) {
  const byState = Object.keys(STATE_LABELS)
    .map(key => ({ key, label: STATE_LABELS[key], color: STATE_COLORS[key], value: rows.filter(row => row.effective_status === key).length }))
    .filter(item => item.value > 0)

  const detailRows = rows.map(row => {
    const stateColor = STATE_COLORS[row.effective_status] || '#5f6d82'
    return `
    <tr>
      <td class="num">${escapeHtml(row.code)}</td>
      <td><strong>${escapeHtml(row.subject)}</strong>${row.description ? `<br /><span class="muted">${escapeHtml(clip(row.description, 90))}</span>` : ''}</td>
      <td>${escapeHtml(row.process_name)}</td>
      <td>${escapeHtml(row.module_name)}</td>
      <td>${escapeHtml(row.requester_name || '—')}</td>
      <td>${escapeHtml(row.responsible_name || 'Sin asignar')}</td>
      <td style="color:${PRIORITY_COLORS[row.priority] || '#5f6d82'};font-weight:700;">${PRIORITY_LABELS[row.priority] || escapeHtml(row.priority || '—')}</td>
      <td class="num">${formatDateTime(row.received_at)}</td>
      <td class="num">${formatDateTime(row.commitment_at)}</td>
      <td class="num">${row.completion_percent}%</td>
      <td><span class="state" style="color:${stateColor};border-color:${stateColor};">${STATE_LABELS[row.effective_status] || escapeHtml(row.effective_status)}</span></td>
      <td class="num">${formatDateTime(row.closed_at)}</td>
      <td>${escapeHtml(clip(row.final_solution || row.general_observations || '—', 110))}</td>
    </tr>`
  }).join('')

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; color: #172033; font-size: 10.5px; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 12px; margin: 0 0 8px; color: #1c4fae; text-transform: uppercase; letter-spacing: .04em; break-after: avoid; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${ACCENT}; padding: 10px 4px; margin-bottom: 14px; background: linear-gradient(135deg, #eef4ff, #ffffff); }
  .format-meta { text-align: right; font-size: 9px; color: #667085; }
  .summary-box { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin: 0 0 16px; }
  .summary-card { border: 1px solid #d5e0f2; border-radius: 8px; padding: 9px 12px; background: linear-gradient(135deg, #ffffff, #f4f8ff); }
  .summary-card span { display: block; font-size: 8.5px; color: #667085; text-transform: uppercase; }
  .summary-card strong { display: block; font-size: 17px; margin-top: 3px; color: ${ACCENT}; }
  .summary-card.is-danger strong { color: ${STATE_COLORS.VENCIDA}; }
  .summary-card.is-success strong { color: ${STATE_COLORS.COMPLETADA}; }
  .charts-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  .chart-card { border: 1px solid #d5e0f2; border-radius: 8px; padding: 12px 14px; background: #fdfefe; }
  .bar-row { display: flex; align-items: center; gap: 8px; margin: 5px 0; font-size: 9px; }
  .bar-label { width: 130px; flex: none; color: #344054; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar-track { flex: 1; height: 9px; background: #edf1f8; border-radius: 5px; overflow: hidden; }
  .bar-fill { display: block; height: 100%; border-radius: 5px; background: linear-gradient(90deg, rgba(52,120,246,.6), ${ACCENT}); }
  .bar-value { width: 24px; flex: none; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
  .pie-wrap { display: flex; align-items: center; gap: 18px; }
  .pie { position: relative; width: 92px; height: 92px; border-radius: 50%; flex: none; box-shadow: inset 0 0 0 1px rgba(0,0,0,.06); }
  .pie-hole { position: absolute; inset: 22%; border-radius: 50%; background: #fdfefe; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; color: ${ACCENT}; }
  .pie-legend { font-size: 9px; }
  .pie-legend-row { display: flex; align-items: center; gap: 6px; margin: 4px 0; white-space: nowrap; }
  .pie-swatch { width: 9px; height: 9px; border-radius: 2px; flex: none; }
  .pie-legend-row b { font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #d2d9e3; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #f3f7fd; font-size: 8.5px; text-transform: uppercase; color: #45577a; }
  td { font-size: 9px; }
  td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  td strong { font-weight: 700; }
  .state { display: inline-block; border: 1px solid; border-radius: 999px; padding: 1px 7px; font-size: 8px; font-weight: 800; white-space: nowrap; }
  .muted { color: #667085; font-weight: 400; }
  .detail-section { page-break-before: always; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Informe de Asistencias Técnicas</h1>
      <div>${escapeHtml(organizationName)} · Gestión ALMERA</div>
    </div>
    <div class="format-meta">
      Generado: ${formatDateTime(generatedAt)}<br />
      ${generatedBy ? `Por: ${escapeHtml(generatedBy)}<br />` : ''}
      ${filtered ? 'Listado filtrado' : 'Base de datos completa'}
    </div>
  </div>

  <div class="summary-box">
    <div class="summary-card"><span>Asistencias en este informe</span><strong>${summary.total}</strong></div>
    <div class="summary-card"><span>Sin iniciar</span><strong>${summary.pending}</strong></div>
    <div class="summary-card"><span>En curso</span><strong>${summary.in_progress}</strong></div>
    <div class="summary-card is-danger"><span>Vencidas</span><strong>${summary.overdue}</strong></div>
    <div class="summary-card is-success"><span>Completadas</span><strong>${summary.completed}</strong></div>
    <div class="summary-card"><span>Avance promedio</span><strong>${summary.average_completion}%</strong></div>
  </div>

  <div class="charts-grid">
    <div class="chart-card">
      <h2>Por estado</h2>
      ${byState.length ? pieChart(byState) : '<p class="muted">Sin datos</p>'}
    </div>
    <div class="chart-card">
      <h2>Por módulo ALMERA</h2>
      ${byModule.length ? barRows(byModule.slice(0, 10).map(item => ({ label: item.name, value: item.total }))) : '<p class="muted">Sin datos</p>'}
    </div>
    <div class="chart-card">
      <h2>Por proceso solicitante</h2>
      ${byProcess.length ? barRows(byProcess.slice(0, 10).map(item => ({ label: item.name, value: item.total }))) : '<p class="muted">Sin datos</p>'}
    </div>
  </div>

  <div class="detail-section">
    <h2>Detalle de asistencias</h2>
    <table>
      <thead><tr>
        <th>Código</th><th>Asunto / solicitud</th><th>Proceso</th><th>Módulo</th><th>Solicitante</th>
        <th>Responsable</th><th>Prioridad</th><th>Solicitada</th><th>Compromiso</th><th>Avance</th>
        <th>Estado</th><th>Cerrada</th><th>Solución / observaciones</th>
      </tr></thead>
      <tbody>${detailRows || '<tr><td colspan="13">Sin asistencias que mostrar</td></tr>'}</tbody>
    </table>
  </div>

  <p style="margin-top:16px;font-size:9px;color:#667085;">
    Este informe refleja el estado de la base de asistencias técnicas al momento de generarse,
    con la búsqueda y los filtros aplicados en pantalla.
  </p>
</body>
</html>`
}
