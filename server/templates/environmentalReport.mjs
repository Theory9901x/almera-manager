// Informe de Indicadores Ambientales — 23 secciones, generado con Puppeteer (mismo mecanismo que
// el resto de informes, ver server/pdf.mjs). Un informe cubre UN indicador (energía o agua) para
// que cada PDF responda una pregunta concreta, igual criterio que Indicador de huella de carbono.
import { INDICATOR_LABEL, INDICATOR_UNIT } from '../../shared/environmentalScoring.mjs'

const PALETTE = { navy: '#0B1830', green: '#16A47A', greenDark: '#08765B', energy: '#2385D9', water: '#1AA7B8', amber: '#F3A712', ink: '#172033', muted: '#657083', error: '#D64545', bg: '#F3F7F8' }

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]) }
function fmtDate(value) { return value ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(new Date(value)) : 'Sin fecha' }
function fmtDateTime(value) { return value ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value)) : '—' }
function fmtNum(value, digits = 2) { return value == null ? '—' : Number(value).toLocaleString('es-CO', { minimumFractionDigits: digits, maximumFractionDigits: digits }) }
function fmtPercent(value, digits = 1) { return value == null ? '—' : `${fmtNum(value, digits)}%` }

export function renderEnvironmentalReportHtml({
  organizationName, facility, indicatorType, periodLabel, dateFrom, dateTo, generatedAt, verificationCode,
  records, consumptionTotal, attentionTotal, baseline, target, calc, hasOutlier,
}) {
  const accent = indicatorType === 'WATER' ? PALETTE.water : PALETTE.energy
  const label = INDICATOR_LABEL[indicatorType]
  const unit = INDICATOR_UNIT[indicatorType]
  const targetLabel = target ? `${fmtPercent(target.proportionalPercent, 0)} ± ${fmtPercent(target.tolerancePercent, 0)}` : 'Sin meta configurada'
  const complianceLabel = calc.proportionalIndex == null ? 'Sin línea base para evaluar cumplimiento'
    : target ? (calc.proportionalIndex <= target.proportionalPercent + target.tolerancePercent ? 'Dentro de la meta' : 'Fuera de la meta') : 'Sin meta configurada'

  const recordRows = records.map(row => `
    <tr class="${row.is_outlier ? 'is-outlier' : ''}">
      <td>${row.month}/${row.year}</td>
      <td class="num">${fmtNum(row.consumption_value, 2)} ${unit}</td>
      <td class="num">${Number(row.attention_count).toLocaleString('es-CO')}</td>
      <td class="num">${fmtNum(row.intensity_value, 3)}</td>
      <td class="num">${row.proportional_index != null ? fmtPercent(row.proportional_index) : '—'}</td>
      <td>${row.is_outlier ? 'Dato atípico pendiente de validación' : '—'}</td>
    </tr>`).join('') || '<tr><td colspan="6" class="empty">Sin registros validados en el periodo</td></tr>'

  const outlierRows = records.filter(row => row.is_outlier).map(row => `
    <tr><td>${row.month}/${row.year}</td><td class="num">${fmtNum(row.consumption_value, 2)} ${unit}</td><td>${escapeHtml(row.outlier_reason || 'Desviación significativa frente a la mediana histórica')}</td></tr>`).join('')

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Indicador de ${label}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; color: ${PALETTE.ink}; font-size: 10.5px; margin: 0; }
  h1 { font-size: 22px; margin: 0 0 4px; color: ${PALETTE.navy}; }
  h2 { font-size: 12.5px; margin: 20px 0 8px; color: ${PALETTE.greenDark}; text-transform: uppercase; letter-spacing: .05em; border-bottom: 2px solid ${accent}; padding-bottom: 4px; break-after: avoid; }
  section { break-inside: avoid-page; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th, td { border: 1px solid #d8dfe8; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: ${PALETTE.bg}; font-size: 9px; text-transform: uppercase; color: ${PALETTE.muted}; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.empty { text-align: center; color: ${PALETTE.muted}; font-style: italic; }
  tr.is-outlier td { background: #fdf3e6; }
  .cover { text-align: center; padding: 60px 20px 30px; border-bottom: 4px solid ${accent}; margin-bottom: 24px; }
  .cover .badge { display: inline-block; padding: 4px 14px; border-radius: 999px; background: ${PALETTE.navy}; color: #fff; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 14px; }
  .cover h1 { font-size: 28px; }
  .cover .sub { color: ${PALETTE.muted}; font-size: 13px; margin-top: 6px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; }
  .grid2 div { padding: 2px 0; }
  .grid2 b { display: inline-block; min-width: 170px; color: ${PALETTE.muted}; font-weight: 700; }
  .kpi-row { display: flex; gap: 12px; margin: 10px 0 18px; }
  .kpi-card { flex: 1; border: 1px solid #d8dfe8; border-radius: 10px; padding: 12px 14px; background: linear-gradient(135deg, #ffffff, ${PALETTE.bg}); }
  .kpi-card span { display: block; font-size: 9px; color: ${PALETTE.muted}; text-transform: uppercase; letter-spacing: .04em; }
  .kpi-card strong { display: block; font-size: 18px; margin-top: 4px; color: ${PALETTE.navy}; }
  .kpi-card.main strong { color: ${accent}; font-size: 22px; }
  .formula-box { background: ${PALETTE.bg}; border-radius: 10px; padding: 12px 16px; font-family: 'Courier New', monospace; font-size: 11px; margin-bottom: 8px; }
  .compliance-badge { display: inline-block; padding: 5px 14px; border-radius: 999px; font-weight: 700; font-size: 11px; background: color-mix(in srgb, ${accent} 16%, white); color: ${accent}; }
  .note { font-size: 9.5px; color: ${PALETTE.muted}; margin-top: 4px; }
  .signature-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 30px; }
  .signature-box { border-top: 1px solid ${PALETTE.ink}; padding-top: 6px; font-size: 9.5px; text-align: center; color: ${PALETTE.muted}; }
  .verification { margin-top: 24px; padding: 12px 14px; border: 1px dashed ${accent}; border-radius: 8px; background: #f6fbfb; font-size: 9.5px; }
</style>
</head>
<body>

<!-- 1. Portada -->
<div class="cover">
  <div class="badge">Indicadores Ambientales — Huella de Carbono</div>
  <h1>Índice de ${label.toLowerCase()} ajustado por atenciones</h1>
  <div class="sub">${escapeHtml(organizationName)} — ${escapeHtml(facility?.name || '')}</div>
  <div class="sub">Periodo: ${escapeHtml(periodLabel)} (${fmtDate(dateFrom)} — ${fmtDate(dateTo)})</div>
</div>

<!-- 2. Establecimiento / sede -->
<section>
<h2>2. Establecimiento / sede</h2>
<div class="grid2">
  <div><b>Institución</b>${escapeHtml(organizationName)}</div>
  <div><b>Sede</b>${escapeHtml(facility?.name || '—')} (${escapeHtml(facility?.code || '—')})</div>
</div>
</section>

<!-- 3. Periodo -->
<section>
<h2>3. Periodo evaluado</h2>
<div class="grid2">
  <div><b>Periodo</b>${escapeHtml(periodLabel)}</div>
  <div><b>Rango de fechas</b>${fmtDate(dateFrom)} — ${fmtDate(dateTo)}</div>
  <div><b>Registros validados incluidos</b>${records.length}</div>
</div>
</section>

<!-- 4. Objetivo del indicador -->
<section>
<h2>4. Objetivo del indicador</h2>
<p>Evaluar si el consumo de ${label.toLowerCase()} se comporta de manera eficiente y proporcional respecto al
volumen de atenciones prestadas por el hospital — no mide el consumo bruto, sino su proporcionalidad frente
a la línea base institucional.</p>
</section>

<!-- 5. Metodología -->
<section>
<h2>5. Metodología</h2>
<p>Tres niveles de resultado: (1) consumo total del periodo, (2) intensidad operativa (consumo por cada 1.000
atenciones) y (3) índice proporcional (consumo real frente al consumo esperado según la línea base vigente).
Los periodos acumulados (trimestre/semestre/año) suman consumo y atenciones reales — nunca promedian los
porcentajes de los meses individuales.</p>
</section>

<!-- 6. Formula -->
<section>
<h2>6. Fórmula del indicador</h2>
<div class="formula-box">Intensidad = (Consumo total / N° atenciones) × 1.000&nbsp;&nbsp;→&nbsp;&nbsp;${unit} por cada 1.000 atenciones</div>
<div class="formula-box">Consumo esperado = (Intensidad base × N° atenciones) / 1.000</div>
<div class="formula-box">Índice proporcional = (Consumo real / Consumo esperado) × 100</div>
<div class="formula-box">Ahorro / sobreconsumo = ((Consumo esperado − Consumo real) / Consumo esperado) × 100</div>
</section>

<!-- 7. Linea base -->
<section>
<h2>7. Línea base aplicada</h2>
<div class="grid2">
  <div><b>Fuente</b>${baseline ? escapeHtml(baseline.label) : 'Sin línea base validada'}</div>
  <div><b>Intensidad base</b>${baseline ? `${fmtNum(baseline.intensity, 3)} ${unit}/1000 atenciones` : '—'}</div>
</div>
${!baseline ? '<p class="note">No hay línea base validada para este periodo: el índice proporcional no pudo calcularse. Configúrala desde Líneas base y metas.</p>' : ''}
</section>

<!-- 8. Meta -->
<section>
<h2>8. Meta</h2>
<div class="grid2">
  <div><b>Meta del índice proporcional</b>${targetLabel}</div>
  <div><b>Estado</b><span class="compliance-badge">${escapeHtml(complianceLabel)}</span></div>
</div>
</section>

<!-- 9-15. Resultados del periodo -->
<section>
<h2>9-15. Resultados del periodo</h2>
<div class="kpi-row">
  <div class="kpi-card main"><span>Índice proporcional</span><strong>${calc.proportionalIndex != null ? fmtPercent(calc.proportionalIndex) : '—'}</strong></div>
  <div class="kpi-card"><span>Consumo total (10)</span><strong>${fmtNum(consumptionTotal, 2)} ${unit}</strong></div>
  <div class="kpi-card"><span>Atenciones (11)</span><strong>${attentionTotal.toLocaleString('es-CO')}</strong></div>
  <div class="kpi-card"><span>Intensidad (12)</span><strong>${fmtNum(calc.intensityValue, 3)}</strong></div>
</div>
<div class="grid2">
  <div><b>Consumo esperado (13)</b>${calc.expectedConsumption != null ? `${fmtNum(calc.expectedConsumption, 2)} ${unit}` : '—'}</div>
  <div><b>Índice proporcional (14)</b>${calc.proportionalIndex != null ? fmtPercent(calc.proportionalIndex) : '—'}</div>
  <div><b>Ahorro / sobreconsumo (15)</b>${calc.normalizedSaving != null ? `${fmtPercent(calc.normalizedSaving)} ${calc.normalizedSaving >= 0 ? '(ahorro)' : '(sobreconsumo)'}` : '—'}</div>
</div>
</section>

<!-- 16. Analisis automatico -->
<section>
<h2>16. Análisis automático</h2>
<p>${calc.proportionalIndex != null
    ? `En el periodo evaluado, el consumo de ${label.toLowerCase()} fue de ${fmtNum(consumptionTotal, 2)} ${unit} para ${attentionTotal.toLocaleString('es-CO')} atenciones, con una intensidad de ${fmtNum(calc.intensityValue, 3)} ${unit} por cada 1.000 atenciones. El índice proporcional se ubicó en ${fmtPercent(calc.proportionalIndex)} frente a la línea base (${baseline ? escapeHtml(baseline.label) : ''}), lo que representa ${calc.normalizedSaving >= 0 ? 'un ahorro' : 'un sobreconsumo'} de ${fmtPercent(Math.abs(calc.normalizedSaving))}.`
    : 'No fue posible calcular el índice proporcional: no hay línea base validada para este periodo.'}
${hasOutlier ? ' Se detectaron datos atípicos pendientes de validación dentro del periodo — ver sección 19.' : ''}</p>
</section>

<!-- 17-18. Tendencia y tabla de registros -->
<section>
<h2>17-18. Registros del periodo</h2>
<table>
  <thead><tr><th>Periodo</th><th class="num">Consumo</th><th class="num">Atenciones</th><th class="num">Intensidad</th><th class="num">Índice prop.</th><th>Observación</th></tr></thead>
  <tbody>${recordRows}</tbody>
</table>
</section>

<!-- 19. Alertas y datos atipicos -->
<section>
<h2>19. Alertas y datos atípicos</h2>
${outlierRows ? `<table><thead><tr><th>Periodo</th><th class="num">Consumo</th><th>Motivo</th></tr></thead><tbody>${outlierRows}</tbody></table>` : '<p class="note">No se detectaron datos atípicos en este periodo.</p>'}
</section>

<!-- 20. Observaciones -->
<section>
<h2>20. Observaciones</h2>
<p class="note">Este informe solo incluye registros en estado <b>Validado</b>. Los datos marcados como atípicos permanecen
visibles y trazables — nunca se eliminan automáticamente, solo se alertan para revisión.</p>
</section>

<!-- 21. Responsables -->
<section>
<h2>21. Responsables</h2>
<div class="signature-row">
  <div class="signature-box">Elaboró</div>
  <div class="signature-box">Revisó</div>
  <div class="signature-box">Aprobó</div>
</div>
</section>

<!-- 22-23. Generacion y verificacion -->
<div class="verification">
  <b>22. Generado el:</b> ${fmtDateTime(generatedAt)} &nbsp;·&nbsp;
  <b>23. Código único de verificación:</b> ${escapeHtml(verificationCode)}
</div>

</body>
</html>`
}
