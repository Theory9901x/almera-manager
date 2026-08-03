const ACCENT = '#bb4717'
// MISMOS colores que ya usa la pestana Estadisticas en pantalla para estos mismos donuts
// (RadicadosDashboardPage.tsx) — nunca una paleta inventada aparte para el PDF. Antes esto
// tenia cinco tonos de naranja/marron propios que ni estaban en ningun otro lugar del sistema
// ni se distinguian bien entre si; el informe tiene que verse como una continuacion de la
// pantalla, no como otro sistema de color.
const PALETTE = [ACCENT, '#0EA5E9', '#94A3B8', '#F59E0B']

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
 *  no se ve todo lleno al tope como el de Proceso, que puede tener 10. Se usa para los grupos
 *  con etiquetas largas o muchas filas (Categoria, Proceso), donde una columna vertical
 *  amontonaria las etiquetas. */
function barRows(data) {
  const max = Math.max(1, ...data.map(item => item.value))
  return data.map(item => `
    <div class="bar-row">
      <span class="bar-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.round((item.value / max) * 100)}%"></span></span>
      <span class="bar-value">${item.value}</span>
    </div>`).join('')
}

/** Barras VERTICALES — para series con pocas categorias y etiquetas cortas (Generados por mes):
 *  ahi la lectura natural es "de izquierda a derecha en el tiempo", que una barra horizontal no
 *  transmite. La altura es relativa al mayor valor de la propia serie, igual que barRows. */
function verticalBars(data, trackHeight = 80) {
  const max = Math.max(1, ...data.map(item => item.value))
  const cols = data.map(item => `
    <div class="vbar-col">
      <span class="vbar-value">${item.value}</span>
      <div class="vbar-track" style="height:${trackHeight}px">
        <span class="vbar-fill" style="height:${Math.max(3, Math.round((item.value / max) * 100))}%"></span>
      </div>
      <span class="vbar-label">${escapeHtml(item.label)}</span>
    </div>`).join('')
  return `<div class="vbar-chart">${cols}</div>`
}

/** Pastel via conic-gradient — un solo elemento, sin SVG ni canvas, y se imprime nitido a
 *  cualquier resolucion porque es CSS. Para grupos de POCAS categorias (Direccion, Tipo): con
 *  muchas, las porciones pequenas se vuelven ilegibles y ahi es mejor la barra horizontal. */
function pieChart(data) {
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1
  let cursor = 0
  const stops = data.map((item, index) => {
    const start = (cursor / total) * 360
    cursor += item.value
    const end = (cursor / total) * 360
    return `${PALETTE[index % PALETTE.length]} ${start}deg ${end}deg`
  }).join(', ')
  const legend = data.map((item, index) => `
    <div class="pie-legend-row">
      <span class="pie-swatch" style="background:${PALETTE[index % PALETTE.length]}"></span>
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
  .bar-fill { display: block; height: 100%; border-radius: 5px; background: linear-gradient(90deg, rgba(187,71,23,.65), ${ACCENT}); }
  .bar-value { width: 24px; flex: none; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
  .vbar-chart { display: flex; align-items: flex-end; gap: 14px; padding-top: 6px; }
  .vbar-col { display: flex; flex-direction: column; align-items: center; width: 40px; }
  .vbar-value { font-size: 8.5px; font-weight: 700; margin-bottom: 3px; color: #172033; }
  .vbar-track { width: 22px; background: #f1ede9; border-radius: 4px 4px 0 0; display: flex; align-items: flex-end; overflow: hidden; }
  .vbar-fill { display: block; width: 100%; background: linear-gradient(180deg, rgba(187,71,23,.65), ${ACCENT}); border-radius: 4px 4px 0 0; }
  .vbar-label { font-size: 7.5px; color: #667085; margin-top: 4px; text-align: center; max-width: 48px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pie-wrap { display: flex; align-items: center; gap: 18px; }
  .pie { position: relative; width: 92px; height: 92px; border-radius: 50%; flex: none; box-shadow: inset 0 0 0 1px rgba(0,0,0,.06); }
  .pie-hole { position: absolute; inset: 22%; border-radius: 50%; background: #fffefd; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; color: ${ACCENT}; }
  .pie-legend { font-size: 9px; }
  .pie-legend-row { display: flex; align-items: center; gap: 6px; margin: 4px 0; white-space: nowrap; }
  .pie-swatch { width: 9px; height: 9px; border-radius: 2px; flex: none; }
  .pie-legend-row b { font-variant-numeric: tabular-nums; }
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
      ${byDireccion.length ? pieChart(byDireccion) : '<p class="muted">Sin datos</p>'}
    </div>
    <div class="chart-card">
      <h2>Por tipo de radicado</h2>
      ${byTipo.length ? pieChart(byTipo) : '<p class="muted">Sin datos</p>'}
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
      ${monthly.length ? verticalBars(monthly) : '<p class="muted">Sin datos</p>'}
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
