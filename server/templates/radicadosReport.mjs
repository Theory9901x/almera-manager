const ACCENT = '#bb4717'

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

const ESTADO_LABEL = { ACTIVO: 'Activo', ANULADO: 'Anulado' }

/** Barras horizontales en CSS puro (sin canvas/imagen: Puppeteer las imprime igual de nitidas
 *  a cualquier resolucion). El ancho de cada barra es relativo al MAYOR valor del propio grupo,
 *  no a un 100% fijo — asi el grupo con menos variedad (ej. Direccion, casi siempre 2-3 filas)
 *  no se ve todo lleno al tope como el de Proceso, que puede tener 10. */
function barRows(data) {
  const max = Math.max(1, ...data.map(item => item.value))
  return data.map(item => `
    <div class="bar-row">
      <span class="bar-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.round((item.value / max) * 100)}%"></span></span>
      <span class="bar-value">${item.value}</span>
    </div>`).join('')
}

export function renderRadicadosReportHtml({
  organizationName, generatedAt, generatedBy, filtered, total, radicados,
  byDireccion, byTipo, byProceso, byCategoria, monthly,
}) {
  const rows = radicados.map(row => `
    <tr>
      <td class="num">${escapeHtml(row.numero_radicado)}</td>
      <td>${escapeHtml(row.tipo_nombre)}${row.direccion ? ` <span class="muted">(${row.direccion === 'RECIBIDO' ? 'Recibido' : 'Enviado'})</span>` : ''}</td>
      <td>${escapeHtml(row.categoria_nombre)}</td>
      <td>${escapeHtml(row.objeto)}</td>
      <td>${escapeHtml(row.remitente || '—')}</td>
      <td>${escapeHtml(row.destinatario || '—')}</td>
      <td class="num">${formatDateTime(row.fecha_radicado)}</td>
      <td>${ESTADO_LABEL[row.estado] || row.estado}</td>
    </tr>`).join('')

  const direccionTotal = byDireccion.reduce((sum, item) => sum + item.value, 0)
  const direccionSummary = byDireccion
    .map(item => `<strong>${item.value}</strong> ${escapeHtml(item.label.toLowerCase())}`)
    .join(' · ')

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; color: #172033; font-size: 10.5px; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 12px; margin: 0 0 8px; color: #7a2f13; text-transform: uppercase; letter-spacing: .04em; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${ACCENT}; padding: 10px 4px; margin-bottom: 14px; background: linear-gradient(135deg, #fdf3ee, #ffffff); }
  .format-meta { text-align: right; font-size: 9px; color: #667085; }
  .summary-box { display: flex; gap: 14px; margin: 0 0 16px; }
  .summary-card { flex: 1; border: 1px solid #e5d5cd; border-radius: 8px; padding: 10px 14px; background: linear-gradient(135deg, #ffffff, #fdf6f2); }
  .summary-card span { display: block; font-size: 9px; color: #667085; text-transform: uppercase; }
  .summary-card > strong { display: block; font-size: 18px; margin-top: 4px; color: ${ACCENT}; }
  .summary-card p { margin: 6px 0 0; font-size: 9.5px; color: #344054; }
  .summary-card p strong { color: ${ACCENT}; }
  .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  .chart-card { border: 1px solid #e5d5cd; border-radius: 8px; padding: 12px 14px; background: #fffefd; }
  .chart-card.wide { grid-column: 1 / -1; }
  .bar-row { display: flex; align-items: center; gap: 8px; margin: 5px 0; font-size: 9px; }
  .bar-label { width: 130px; flex: none; color: #344054; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar-track { flex: 1; height: 9px; background: #f1ede9; border-radius: 5px; overflow: hidden; }
  .bar-fill { display: block; height: 100%; border-radius: 5px; background: linear-gradient(90deg, ${ACCENT}, #e07845); }
  .bar-value { width: 24px; flex: none; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #d2d9e3; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #f6f8fa; font-size: 9px; text-transform: uppercase; color: #526074; }
  td.num { font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 700; }
  .muted { color: #667085; font-weight: 400; }
  .detail-section { page-break-before: always; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Informe de Radicados</h1>
      <div>${escapeHtml(organizationName)}</div>
    </div>
    <div class="format-meta">
      Generado: ${formatDateTime(generatedAt)}<br />
      ${generatedBy ? `Por: ${escapeHtml(generatedBy)}<br />` : ''}
      ${filtered ? 'Listado filtrado' : 'Base de datos completa'}
    </div>
  </div>

  <div class="summary-box">
    <div class="summary-card"><span>Radicados en este informe</span><strong>${total}</strong>${direccionTotal ? `<p>${direccionSummary}</p>` : ''}</div>
  </div>

  <div class="charts-grid">
    <div class="chart-card">
      <h2>Interno / recibido / enviado</h2>
      ${byDireccion.length ? barRows(byDireccion) : '<p class="muted">Sin datos</p>'}
    </div>
    <div class="chart-card">
      <h2>Por tipo de radicado</h2>
      ${byTipo.length ? barRows(byTipo) : '<p class="muted">Sin datos</p>'}
    </div>
    <div class="chart-card">
      <h2>Por categoría / tipo documental</h2>
      ${byCategoria.length ? barRows(byCategoria) : '<p class="muted">Sin datos</p>'}
    </div>
    <div class="chart-card">
      <h2>Por proceso institucional</h2>
      ${byProceso.length ? barRows(byProceso) : '<p class="muted">Sin datos</p>'}
    </div>
    <div class="chart-card wide">
      <h2>Generados por mes</h2>
      ${monthly.length ? barRows(monthly) : '<p class="muted">Sin datos</p>'}
    </div>
  </div>

  <div class="detail-section">
    <h2>Detalle de radicados</h2>
    <table>
      <thead><tr><th>Número</th><th>Tipo</th><th>Categoría</th><th>Objeto / asunto</th><th>Remitente</th><th>Destinatario</th><th>Fecha</th><th>Estado</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="8">Sin radicados que mostrar</td></tr>'}</tbody>
    </table>
  </div>

  <p style="margin-top:16px;font-size:9px;color:#667085;">
    El consecutivo de cada radicado es atómico e irrepetible: un número anulado nunca se reutiliza.
    Este informe refleja el estado de la base al momento de generarse.
  </p>
</body>
</html>`
}
