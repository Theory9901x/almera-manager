const ACCENT = '#bb4717'

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

const ESTADO_LABEL = { ACTIVO: 'Activo', ANULADO: 'Anulado' }

export function renderRadicadosReportHtml({ organizationName, generatedAt, generatedBy, filtered, total, radicados }) {
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

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; color: #172033; font-size: 10.5px; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${ACCENT}; padding: 10px 4px; margin-bottom: 14px; background: linear-gradient(135deg, #fdf3ee, #ffffff); }
  .format-meta { text-align: right; font-size: 9px; color: #667085; }
  .summary-box { display: flex; gap: 14px; margin: 0 0 16px; }
  .summary-card { flex: 1; border: 1px solid #e5d5cd; border-radius: 8px; padding: 10px 14px; background: linear-gradient(135deg, #ffffff, #fdf6f2); }
  .summary-card span { display: block; font-size: 9px; color: #667085; text-transform: uppercase; }
  .summary-card strong { display: block; font-size: 18px; margin-top: 4px; color: ${ACCENT}; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #d2d9e3; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #f6f8fa; font-size: 9px; text-transform: uppercase; color: #526074; }
  td.num { font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 700; }
  .muted { color: #667085; font-weight: 400; }
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
    <div class="summary-card"><span>Radicados en este informe</span><strong>${total}</strong></div>
  </div>

  <table>
    <thead><tr><th>Número</th><th>Tipo</th><th>Categoría</th><th>Objeto / asunto</th><th>Remitente</th><th>Destinatario</th><th>Fecha</th><th>Estado</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="8">Sin radicados que mostrar</td></tr>'}</tbody>
  </table>

  <p style="margin-top:16px;font-size:9px;color:#667085;">
    El consecutivo de cada radicado es atómico e irrepetible: un número anulado nunca se reutiliza.
    Este informe refleja el estado de la base al momento de generarse.
  </p>
</body>
</html>`
}
