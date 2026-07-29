import { CONCEPT_COLORS as conceptColors } from '../semaphore.mjs'
import { computeRecordCompliance } from '../../shared/adherenceScoring.mjs'

const FORMAT_CODE = 'FT-ADH-001'
const FORMAT_VERSION = '1'

const conceptLabels = { OPTIMO: 'Óptimo', ACEPTABLE: 'Aceptable', DEFICIENTE: 'Deficiente', MUY_DEFICIENTE: 'Muy deficiente' }
// Misma escala de semaforo fija que el dashboard en vivo — un mismo porcentaje siempre se ve del mismo color.

const NO_DATA = '#94a3b8'
/** Color del semaforo. Vive en server/semaphore.mjs, del que tambien tira la pantalla. */
function colorFor(percent) {
  if (percent === null || percent === undefined) return NO_DATA
  if (percent >= 90) return conceptColors.OPTIMO
  if (percent >= 80) return conceptColors.ACEPTABLE
  if (percent >= 70) return conceptColors.DEFICIENTE
  return conceptColors.MUY_DEFICIENTE
}
function conceptFor(percent) {
  if (percent === null || percent === undefined) return null
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
  return value === null || value === undefined ? 'Sin dato' : `${Number(value).toFixed(1)}%`
}

const professionalStatusLabels = {
  ACTIVE_INDEFINITE: 'Activo - indefinido',
  ACTIVE_ADAPTATION: 'Activo - periodo de adaptación',
  WITHDRAWN: 'Retirado',
}

/**
 * Etiqueta de una celda de la matriz impresa. Hay que distinguir tres cosas que en la BD se
 * parecen: NA es una fila guardada con score NULL, «sin calificar» es que no hay fila, y 0 es
 * una calificacion real. Pintarlas igual haria ilegible el informe.
 */
function cellLabel(hasRow, score) {
  if (!hasRow) return '—'
  return score === null || score === undefined ? 'NA' : String(score)
}
function cellClass(hasRow, score) {
  if (!hasRow) return 'sc-empty'
  return score === null || score === undefined ? 'sc-na' : `sc-${score}`
}

/* ============================================================================
   Graficas en SVG plano. Puppeteer las renderiza sin librerias ni red, y quedan
   vectoriales en el PDF (se pueden ampliar sin pixelar). Los colores salen del
   MISMO semaforo que la pantalla.
   ============================================================================ */

/** Gauge semicircular del cumplimiento general. */
function gaugeSvg(percent) {
  const radius = 70
  const length = Math.PI * radius
  const value = percent === null ? 0 : Math.max(0, Math.min(100, percent))
  const color = colorFor(percent)
  return `<svg width="190" height="108" viewBox="0 0 190 108" role="img">
    <path d="M 20 92 A ${radius} ${radius} 0 0 1 170 92" fill="none" stroke="#e6eaf2" stroke-width="15" stroke-linecap="round" />
    <path d="M 20 92 A ${radius} ${radius} 0 0 1 170 92" fill="none" stroke="${color}" stroke-width="15" stroke-linecap="round"
          stroke-dasharray="${length}" stroke-dashoffset="${length - (length * value) / 100}" />
    <text x="95" y="80" text-anchor="middle" font-size="27" font-weight="700" fill="${color}">${percent === null ? '—' : `${percent.toFixed(1)}%`}</text>
    <text x="95" y="99" text-anchor="middle" font-size="9" fill="#667085">Adherencia general</text>
  </svg>`
}

/**
 * Barras horizontales con etiqueta y valor. `rows` = [{ label, percent }].
 *
 * Con muchas filas se parte en DOS COLUMNAS. Un SVG es un bloque indivisible para la impresion:
 * las 25 barras por HC median mas que el hueco que quedaba en la hoja, asi que saltaban enteras
 * a la siguiente y dejaban media pagina en blanco. En dos columnas cabe donde este.
 */
function barsSvg(rows, options = {}) {
  if (!rows.length) return '<p class="muted">Sin datos.</p>'
  const { columns = rows.length > 12 ? 2 : 1, width = 1000 } = options
  if (columns > 1) {
    const half = Math.ceil(rows.length / columns)
    const chunks = Array.from({ length: columns }, (_, i) => rows.slice(i * half, (i + 1) * half))
    const columnWidth = Math.floor((width - 24 * (columns - 1)) / columns)
    return `<div class="bars-cols">${chunks
      .map(chunk => barsSvg(chunk, { ...options, columns: 1, width: columnWidth }))
      .join('')}</div>`
  }
  const { labelWidth = 240, barHeight = 18, gap = 9 } = options
  const trackWidth = width - labelWidth - 52
  const height = rows.length * (barHeight + gap) + 6
  const bars = rows.map((row, index) => {
    const y = index * (barHeight + gap) + 3
    const value = row.percent === null ? 0 : Math.max(0, Math.min(100, row.percent))
    const color = colorFor(row.percent)
    // El texto se recorta aqui, no con CSS: en SVG un texto largo se sale del lienzo. El corte se
    // calcula a partir del ancho reservado, a ~5.3 px por caracter en el cuerpo de 9.5.
    const maxChars = Math.max(8, Math.floor(labelWidth / 5.3))
    const label = row.label.length > maxChars ? `${row.label.slice(0, maxChars - 1)}…` : row.label
    return `
      <text x="0" y="${y + barHeight - 5}" font-size="9.5" fill="#344054">${escapeHtml(label)}</text>
      <rect x="${labelWidth}" y="${y}" width="${trackWidth}" height="${barHeight}" rx="4" fill="#eef1f6" />
      <rect x="${labelWidth}" y="${y}" width="${(trackWidth * value) / 100}" height="${barHeight}" rx="4" fill="${color}" />
      <text x="${labelWidth + trackWidth + 8}" y="${y + barHeight - 5}" font-size="9.5" font-weight="700" fill="${color}">${row.percent === null ? 'Sin dato' : `${row.percent.toFixed(1)}%`}</text>`
  }).join('')
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">${bars}</svg>`
}

/** Donut de la distribucion de la escala 2 / 1 / 0 / NA. */
function donutSvg(segments) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  if (!total) return '<p class="muted">Sin calificaciones registradas.</p>'
  const radius = 52
  const circumference = 2 * Math.PI * radius
  let offset = 0
  const arcs = segments.filter(segment => segment.value > 0).map(segment => {
    const portion = (segment.value / total) * circumference
    const arc = `<circle cx="70" cy="70" r="${radius}" fill="none" stroke="${segment.color}" stroke-width="26"
      stroke-dasharray="${portion} ${circumference - portion}" stroke-dashoffset="${-offset}"
      transform="rotate(-90 70 70)" />`
    offset += portion
    return arc
  }).join('')
  const legend = segments.map(segment => `
    <div class="leg"><i style="background:${segment.color}"></i>${escapeHtml(segment.label)}
      <b>${segment.value}</b><span>${((segment.value / total) * 100).toFixed(1)}%</span></div>`).join('')
  return `<div class="donut-wrap">
    <svg width="140" height="140" viewBox="0 0 140 140" role="img">
      ${arcs}
      <text x="70" y="66" text-anchor="middle" font-size="19" font-weight="700" fill="#172033">${total}</text>
      <text x="70" y="82" text-anchor="middle" font-size="8" fill="#667085">calificaciones</text>
    </svg>
    <div class="donut-legend">${legend}</div>
  </div>`
}

/** Bloque de firma: imagen si la hay, mas nombre, cedula, cargo y fecha. */
function signatureBox(title, { name, document: documentId, position, image, at }) {
  return `<div class="signature-box">
    <div class="sig-title">${escapeHtml(title)}</div>
    ${image
      ? `<img class="sig-img" src="${image}" alt="Firma de ${escapeHtml(name || '')}" />`
      : '<div class="sig-empty">Sin firma gráfica registrada</div>'}
    <div class="sig-line"></div>
    <strong>${escapeHtml(name) || 'Pendiente de firma'}</strong>
    ${documentId ? `<small>C.C. ${escapeHtml(documentId)}</small>` : ''}
    ${position ? `<small>${escapeHtml(position)}</small>` : ''}
    <small>${at ? formatDate(at) : 'Sin fecha'}</small>
  </div>`
}

export function renderAdherenceReportHtml({
  evaluation, scopes, criteria, records, scores = [], scopeResults, criterionResults, overallCompliance, thresholds,
}) {
  const scopeResultById = new Map(scopeResults.map(result => [String(result.scopeId), result]))
  const criterionResultById = new Map(criterionResults.map(result => [String(result.criterionId), result]))
  const criteriaByScope = new Map(scopes.map(scope => [String(scope.id), criteria.filter(criterion => String(criterion.scope_id) === String(scope.id))]))

  // Indice de calificaciones por (HC, criterio): la matriz impresa las necesita celda a celda.
  const scoreByCell = new Map(scores.map(row => [`${row.evaluation_record_id}|${row.criterion_id}`, row.score]))

  // Cumplimiento por HC con el MISMO motor que la pantalla y el guardado.
  const recordPercent = new Map(records.map(record => {
    const rows = criteria
      .filter(criterion => scoreByCell.has(`${record.id}|${criterion.id}`))
      .map(criterion => ({ criterion_id: criterion.id, score: scoreByCell.get(`${record.id}|${criterion.id}`) }))
    return [String(record.id), computeRecordCompliance(criteria, rows)]
  }))

  // Reparto de la escala.
  const counts = { two: 0, one: 0, zero: 0, na: 0 }
  for (const row of scores) {
    if (row.score === null || row.score === undefined) counts.na += 1
    else if (Number(row.score) === 2) counts.two += 1
    else if (Number(row.score) === 1) counts.one += 1
    else counts.zero += 1
  }
  const totalCells = criteria.length * records.length
  const graded = scores.length

  const overall = overallCompliance ?? (evaluation.overall_compliance === null ? null : Number(evaluation.overall_compliance))
  const concept = evaluation.concept || conceptFor(overall)

  // --- Tabla de ambitos y criterios, con el detalle de cada calificacion ---
  const scopeRows = scopes.map(scope => {
    const scopeResult = scopeResultById.get(String(scope.id))
    const scopeCriteria = criteriaByScope.get(String(scope.id)) || []
    const scopeWeight = scopeCriteria.reduce((sum, criterion) => sum + Number(criterion.weight), 0)
    const criterionRows = scopeCriteria.map(criterion => {
      const result = criterionResultById.get(String(criterion.id))
      const percent = result ? result.compliancePercent : null
      return `<tr>
        <td class="criterion-text">${escapeHtml(criterion.text)}</td>
        <td class="num">${Number(criterion.weight).toFixed(2)}</td>
        <td class="num" style="color:${colorFor(percent)};font-weight:700">${formatPercent(percent)}</td>
      </tr>`
    }).join('')
    const scopePercent = scopeResult ? scopeResult.compliancePercent : null
    return `
      <tr class="scope-row">
        <td>${escapeHtml(scope.name)}</td>
        <td class="num">${scopeWeight.toFixed(2)}</td>
        <td class="num" style="color:${colorFor(scopePercent)}">${formatPercent(scopePercent)}</td>
      </tr>
      ${criterionRows}`
  }).join('')

  // --- Matriz completa criterio x HC ---
  // «HC» va en su propia linea: con 25 columnas el prefijo repetido en linea rompe el numero.
  const matrixHead = records.map(record => `<th class="hc"><span>HC</span>${escapeHtml(record.record_number)}</th>`).join('')
  const matrixBody = scopes.map(scope => {
    const scopeCriteria = criteriaByScope.get(String(scope.id)) || []
    const scopePercent = scopeResultById.get(String(scope.id))?.compliancePercent ?? null
    const head = `<tr class="scope-row">
      <td>${escapeHtml(scope.name)}</td>
      <td class="num" style="color:${colorFor(scopePercent)}">${formatPercent(scopePercent)}</td>
      ${records.map(() => '<td></td>').join('')}
    </tr>`
    const rows = scopeCriteria.map(criterion => {
      const percent = criterionResultById.get(String(criterion.id))?.compliancePercent ?? null
      const cells = records.map(record => {
        const key = `${record.id}|${criterion.id}`
        const hasRow = scoreByCell.has(key)
        return `<td class="cell ${cellClass(hasRow, scoreByCell.get(key))}">${cellLabel(hasRow, scoreByCell.get(key))}</td>`
      }).join('')
      return `<tr>
        <td class="criterion-text">${escapeHtml(criterion.text)}</td>
        <td class="num" style="color:${colorFor(percent)}">${formatPercent(percent)}</td>
        ${cells}
      </tr>`
    }).join('')
    return head + rows
  }).join('')
  const matrixTotals = `<tr class="total-row">
    <td>% Cumplimiento por HC</td>
    <td class="num" style="color:${colorFor(overall)}">${formatPercent(overall)}</td>
    ${records.map(record => {
      const percent = recordPercent.get(String(record.id)) ?? null
      return `<td class="num" style="color:${colorFor(percent)}">${percent === null ? '—' : `${percent.toFixed(0)}%`}</td>`
    }).join('')}
  </tr>`

  // --- Criterios con menor cumplimiento: lo accionable del informe ---
  const worst = criteria
    .map(criterion => ({ criterion, percent: criterionResultById.get(String(criterion.id))?.compliancePercent ?? null }))
    .filter(row => row.percent !== null)
    .sort((a, b) => a.percent - b.percent)
    .slice(0, 8)

  const recordRows = records.map(record => {
    const percent = recordPercent.get(String(record.id)) ?? null
    return `<tr>
      <td>${escapeHtml(record.record_number)}</td>
      <td class="num" style="color:${colorFor(percent)};font-weight:700">${formatPercent(percent)}</td>
      <td>${escapeHtml(record.observations) || '—'}</td>
    </tr>`
  }).join('')

  const thresholdRows = thresholds.map(threshold => `<tr>
    <td><span class="dot" style="background:${conceptColors[threshold.concept] || NO_DATA}"></span>${conceptLabels[threshold.concept] || threshold.concept}</td>
    <td class="num">≥ ${Number(threshold.min_percent).toFixed(0)}%</td>
  </tr>`).join('')

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #172033; font-size: 11px; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 18px 0 8px; color: #c7192d; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid #e5e9f0; padding-bottom: 4px; }
  h2:first-of-type { margin-top: 10px; }
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
  .muted { color: #667085; }
  .bars-cols { display: flex; gap: 24px; align-items: flex-start; }

  /* Resumen: gauge + cifras */
  .summary { display: flex; gap: 14px; align-items: stretch; margin: 10px 0 4px; }
  .summary-gauge { border: 1px solid #d2d9e3; border-radius: 8px; padding: 6px 10px; text-align: center; }
  .summary-cards { flex: 1; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .summary-card { border: 1px solid #d2d9e3; border-radius: 8px; padding: 8px 10px; }
  .summary-card span { display: block; font-size: 8.5px; color: #667085; text-transform: uppercase; }
  .summary-card strong { display: block; font-size: 17px; margin-top: 3px; }
  .concept-badge { display: inline-block; margin-top: 3px; padding: 3px 10px; border-radius: 999px; font-weight: 700; font-size: 10.5px; }

  /* Donut de la escala */
  .donut-wrap { display: flex; gap: 18px; align-items: center; }
  .donut-legend { display: grid; gap: 5px; font-size: 10px; }
  .leg { display: flex; align-items: center; gap: 7px; }
  .leg i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .leg b { margin-left: auto; font-variant-numeric: tabular-nums; }
  .leg span { color: #667085; width: 44px; text-align: right; }

  /* Matriz impresa. table-layout fixed es obligatorio: con anchos automaticos el navegador reparte segun el
     texto del criterio y la tabla se sale de la hoja apaisada (~1017 px utiles). */
  .matrix { font-size: 9px; table-layout: fixed; }
  .matrix th, .matrix td { padding: 3px 4px; overflow-wrap: anywhere; }
  .matrix .criterion-text { padding-left: 8px; }
  /* El numero de HC NO se parte: cortado en dos lineas se lee como dos numeros distintos. */
  .matrix th.hc { text-align: center; padding: 3px 1px; font-size: 6.2px; letter-spacing: -.1px; white-space: nowrap; }
  .matrix col.c-crit { width: 210px; }
  .matrix col.c-pct { width: 46px; }
  .matrix th.hc span { display: block; font-size: 6.5px; color: #98a2b3; }
  .scale-table { max-width: 300px; }
  .cell { text-align: center; font-weight: 700; }
  .sc-2 { background: #e7f7ee; color: #0f7a46; }
  .sc-1 { background: #fdf3e2; color: #a56200; }
  .sc-0 { background: #fdecec; color: #b42318; }
  .sc-na { background: #f1f4f8; color: #667085; }
  .sc-empty { color: #b6bfcc; }
  .total-row td { background: #f6f8fa; font-weight: 700; }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; }

  .obs-block { white-space: pre-wrap; border: 1px solid #d2d9e3; border-radius: 8px; padding: 10px; min-height: 26px; }

  /* Firmas con imagen */
  .signatures { display: flex; gap: 24px; margin-top: 18px; }
  .signature-box { flex: 1; border: 1px solid #d2d9e3; border-radius: 8px; padding: 10px 12px; }
  .sig-title { font-size: 9px; text-transform: uppercase; color: #667085; letter-spacing: .04em; margin-bottom: 6px; }
  .sig-img { display: block; width: 100%; max-width: 240px; height: 62px; object-fit: contain; object-position: left bottom; }
  .sig-empty { height: 62px; display: flex; align-items: flex-end; color: #b6bfcc; font-size: 9.5px; }
  .sig-line { border-top: 1px solid #172033; margin: 4px 0 5px; }
  .signature-box small { display: block; color: #667085; }

  /* Nada de cortes a mitad de tabla ni de firma. */
  /* La matriz ocupa mas de una hoja: sin esto, la pagina siguiente llega sin cabecera y las
     columnas de HC quedan sin identificar. */
  thead { display: table-header-group; }
  /* Un titulo nunca cierra una hoja: la grafica que lo sigue es un bloque indivisible y saltaba
     de pagina dejando el encabezado solo al pie. */
  h2 { break-after: avoid; }
  h2, .summary, .signatures, .donut-wrap, .bars-cols { break-inside: avoid; }
  tr, .signature-box, .obs-block, .scale-table { break-inside: avoid; }
  .page-break { break-before: page; }
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
      Matriz v${evaluation.matrix_version_id}<br />
      Generado: ${formatDate(new Date())}
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
    <div><b>Estado</b>${evaluation.status === 'CLOSED' ? 'Cerrada' : 'Borrador'}</div>
    <div><b>Evaluador</b>${escapeHtml(evaluation.evaluator_signed_name) || '—'}</div>
  </div>

  <h2>Resumen de cumplimiento</h2>
  <div class="summary">
    <div class="summary-gauge">${gaugeSvg(overall)}</div>
    <div class="summary-cards">
      <div class="summary-card"><span>HC evaluadas</span><strong>${records.length}</strong></div>
      <div class="summary-card"><span>Criterios</span><strong>${criteria.length}</strong></div>
      <div class="summary-card"><span>Celdas calificadas</span><strong>${graded}/${totalCells}</strong></div>
      <div class="summary-card"><span>Concepto</span>
        <span class="concept-badge" style="background:${concept ? `${conceptColors[concept]}18` : '#f1f5f9'};color:${concept ? conceptColors[concept] : NO_DATA}">${concept ? (conceptLabels[concept] || concept) : 'Sin calificar'}</span>
      </div>
    </div>
  </div>

  <h2>Distribución de la escala</h2>
  ${donutSvg([
    { label: 'Cumple (2)', value: counts.two, color: conceptColors.OPTIMO },
    { label: 'Parcial (1)', value: counts.one, color: conceptColors.DEFICIENTE },
    { label: 'No cumple (0)', value: counts.zero, color: conceptColors.MUY_DEFICIENTE },
    { label: 'No aplica (NA)', value: counts.na, color: NO_DATA },
  ])}
  <p class="muted">NA se excluye del cálculo ponderado: un criterio que no aplica no penaliza.</p>

  <h2>Cumplimiento por ámbito</h2>
  ${barsSvg(scopes.map(scope => ({
    label: scope.name,
    percent: scopeResultById.get(String(scope.id))?.compliancePercent ?? null,
  })))}

  <h2>Cumplimiento por historia clínica</h2>
  ${barsSvg(records.map(record => ({
    label: `HC ${record.record_number}`,
    percent: recordPercent.get(String(record.id)) ?? null,
  })), { labelWidth: 120, barHeight: 14, gap: 7 })}

  <div class="page-break"></div>
  <h2>Matriz de calificación por criterio e historia clínica</h2>
  <table class="matrix" style="font-size:${records.length > 22 ? 7 : records.length > 16 ? 8 : 9}px">
    <colgroup><col class="c-crit" /><col class="c-pct" />${records.map(() => '<col />').join('')}</colgroup>
    <thead><tr><th>Ámbito / criterio</th><th>% Cumpl.</th>${matrixHead}</tr></thead>
    <tbody>${matrixBody}${matrixTotals}</tbody>
  </table>
  <p class="muted">Escala: 2 = cumple · 1 = parcial · 0 = no cumple · NA = no aplica · — = sin calificar.</p>

  <h2>Resultados por ámbito y criterio</h2>
  <table><thead><tr><th>Ámbito / criterio</th><th>Peso</th><th>Cumplimiento</th></tr></thead><tbody>${scopeRows}</tbody></table>

  ${worst.length ? `
  <h2>Criterios con menor cumplimiento</h2>
  ${barsSvg(worst.map(row => ({ label: row.criterion.text, percent: row.percent })), { labelWidth: 420 })}` : ''}

  <h2>Historias clínicas evaluadas</h2>
  <table><thead><tr><th>No. HC</th><th>Cumplimiento</th><th>Observaciones</th></tr></thead>
    <tbody>${recordRows || '<tr><td colspan="3">Sin historias clínicas registradas</td></tr>'}</tbody></table>

  <h2>Escala de cumplimiento</h2>
  <table class="scale-table"><thead><tr><th>Concepto</th><th>Umbral</th></tr></thead><tbody>${thresholdRows}</tbody></table>

  <h2>Observaciones generales</h2>
  <div class="obs-block">${escapeHtml(evaluation.general_observations) || 'Sin observaciones registradas.'}</div>

  <h2>Compromisos del profesional</h2>
  <div class="obs-block">${escapeHtml(evaluation.commitments) || 'Sin compromisos registrados.'}</div>

  <h2>Plan de mejora</h2>
  <div class="obs-block">${evaluation.improvement_plan_percent !== null && evaluation.improvement_plan_percent !== undefined ? `Mejoramiento esperado: ${Number(evaluation.improvement_plan_percent).toFixed(1)}%` : 'Sin plan de mejora registrado.'}</div>

  <h2>Firmas</h2>
  <div class="signatures">
    ${signatureBox('Evaluador', {
      name: evaluation.evaluator_signed_name,
      document: evaluation.evaluator_document,
      position: evaluation.evaluator_position,
      image: evaluation.evaluator_signature,
      at: evaluation.evaluator_signed_at,
    })}
    ${signatureBox('Profesional auditado', {
      name: evaluation.professional_signed_name,
      document: evaluation.professional_document,
      position: evaluation.professional_position,
      image: evaluation.professional_signature,
      at: evaluation.professional_signed_at,
    })}
  </div>
</body>
</html>`
}
