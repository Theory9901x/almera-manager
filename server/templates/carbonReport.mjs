const FORMAT_CODE = 'FT-AMB-001'
const FORMAT_VERSION = '1'

const SCOPE_COLORS = { SCOPE_1: '#2563eb', SCOPE_2: '#d97706', SCOPE_3: '#7c3aed' }
const SCOPE_LABELS = { SCOPE_1: 'Alcance 1 — Emisiones directas', SCOPE_2: 'Alcance 2 — Energía comprada', SCOPE_3: 'Alcance 3 — Cadena de valor' }

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

function formatDate(value) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(new Date(value))
}

function formatKg(value) {
  return `${Number(value).toLocaleString('es-CO', { maximumFractionDigits: 1 })} kg CO2e`
}

export function renderCarbonReportHtml({ organizationName, dateFrom, dateTo, generatedAt, total, byScope, byBlock, measurements }) {
  const rangeLabel = dateFrom || dateTo
    ? `${dateFrom ? formatDate(dateFrom) : 'inicio'} — ${dateTo ? formatDate(dateTo) : 'hoy'}`
    : 'Todas las mediciones (histórico completo)'

  const scopeRows = ['SCOPE_1', 'SCOPE_2', 'SCOPE_3'].map(scope => `
    <tr>
      <td><span class="scope-dot" style="background:${SCOPE_COLORS[scope]}"></span>${SCOPE_LABELS[scope]}</td>
      <td class="num">${formatKg(byScope[scope] || 0)}</td>
      <td class="num">${total ? Math.round(((byScope[scope] || 0) / total) * 100) : 0}%</td>
    </tr>`).join('')

  const blockRows = byBlock.map(block => `
    <tr>
      <td>${escapeHtml(block.name)}</td>
      <td class="num">${block.count}</td>
      <td class="num">${formatKg(block.kgco2e)}</td>
      <td class="num">${total ? Math.round((block.kgco2e / total) * 100) : 0}%</td>
    </tr>`).join('')

  const measurementRows = measurements.map(row => `
    <tr>
      <td>${formatDate(row.record_date)}</td>
      <td>${escapeHtml(row.block_name)}</td>
      <td>${escapeHtml(row.subtype || '—')}</td>
      <td class="num">${row.quantity} ${escapeHtml(row.quantity_unit)}</td>
      <td class="num">${row.computed_kgco2e != null ? formatKg(row.computed_kgco2e) : 'N/A'}</td>
    </tr>`).join('')

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; color: #172033; font-size: 11px; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 18px 0 8px; color: #0f5c3f; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid #dcebe5; padding-bottom: 4px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0f5c3f; padding-bottom: 10px; margin-bottom: 14px; background: linear-gradient(135deg, #f4f9f7, #ffffff); padding: 10px 4px; }
  .format-meta { text-align: right; font-size: 9px; color: #667085; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; }
  .grid div { padding: 2px 0; }
  .grid b { display: inline-block; min-width: 130px; color: #526074; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  th, td { border: 1px solid #d2d9e3; padding: 5px 8px; text-align: left; }
  th { background: #f6f8fa; font-size: 9.5px; text-transform: uppercase; color: #526074; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .scope-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
  .summary-box { display: flex; gap: 14px; margin: 10px 0 16px; }
  .summary-card { flex: 1; border: 1px solid #d2d9e3; border-radius: 8px; padding: 10px 14px; background: linear-gradient(135deg, #ffffff, #f6fbf9); }
  .summary-card span { display: block; font-size: 9px; color: #667085; text-transform: uppercase; }
  .summary-card strong { display: block; font-size: 18px; margin-top: 4px; color: #0f5c3f; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Informe de Huella de Carbono</h1>
      <div>${escapeHtml(organizationName)}</div>
    </div>
    <div class="format-meta">
      Formato: ${FORMAT_CODE} · Versión ${FORMAT_VERSION}<br />
      Generado: ${formatDate(generatedAt)}
    </div>
  </div>

  <h2>Datos generales</h2>
  <div class="grid">
    <div><b>Entidad</b>${escapeHtml(organizationName)}</div>
    <div><b>Rango del corte</b>${rangeLabel}</div>
    <div><b>Metodología</b>GHG Protocol — Herramienta de Monitoreo del Impacto Climático (Salud sin Daño / MinSalud, 2023)</div>
    <div><b>Mediciones incluidas</b>${measurements.length}</div>
  </div>

  <div class="summary-box">
    <div class="summary-card"><span>Huella total</span><strong>${formatKg(total)}</strong></div>
  </div>

  <h2>Desglose por alcance (GHG Protocol)</h2>
  <table><thead><tr><th>Alcance</th><th class="num">kg CO2e</th><th class="num">% del total</th></tr></thead><tbody>${scopeRows}</tbody></table>

  <h2>Desglose por variable</h2>
  <table><thead><tr><th>Variable</th><th class="num">Mediciones</th><th class="num">kg CO2e</th><th class="num">% del total</th></tr></thead><tbody>${blockRows}</tbody></table>

  <h2>Detalle de mediciones (respaldo auditable)</h2>
  <table><thead><tr><th>Fecha</th><th>Variable</th><th>Tipo</th><th class="num">Cantidad</th><th class="num">kg CO2e</th></tr></thead><tbody>${measurementRows || '<tr><td colspan="5">Sin mediciones en el rango seleccionado</td></tr>'}</tbody></table>

  <p style="margin-top:16px;font-size:9.5px;color:#667085;">Este informe puede alimentar el Plan Integral de Gestión del Cambio Climático Sectorial (PIGCCS) exigido por la Ley 1931 de 2018.</p>
</body>
</html>`
}
