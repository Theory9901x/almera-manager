// Informe PDF del mapa de riesgos institucional (metodologia DAFP v6). Los mapas de calor son
// tablas HTML, no imagenes: nitidos a cualquier zoom y sin depender de un motor de graficas. Los
// colores de zona son los de shared/riskScoring.mjs, los mismos de la pantalla: un riesgo
// "Alto" se ve igual en el tablero y en el papel que se firma.
import {
  CONTROL_TYPES, IMPACT_LEVELS, PROBABILITY_LEVELS, RISK_TYPES, TREATMENTS, ZONE_ORDER, ZONES, impactLevel, probabilityLevel, zoneOf,
} from '../../shared/riskScoring.mjs'

const ACCENT = '#aa5b00'
const MAT_STATUS = { REPORTADA: 'Reportada', EN_ANALISIS: 'En análisis', EN_TRATAMIENTO: 'En tratamiento', CERRADA: 'Cerrada' }
const ACTION_STATUS = { PENDIENTE: 'Pendiente', EN_CURSO: 'En curso', TERMINADA: 'Terminada', CANCELADA: 'Cancelada' }

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}
function formatDate(value) {
  if (!value) return '—'
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', ...(dateOnly ? { timeZone: 'UTC' } : {}) }).format(new Date(value))
}
function formatDateTime(value) {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value))
}
function money(value) {
  return value == null ? '—' : new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value))
}
function clip(value, size) {
  const text = String(value ?? '')
  return text.length > size ? `${text.slice(0, size)}…` : text
}
function zoneChip(zone) {
  if (!zone) return '<span class="muted">Sin valorar</span>'
  const z = ZONES[zone]
  return `<span class="zone" style="background:${z.color};color:${zone === 'MODERADO' ? '#422006' : '#fff'}">${z.name}</span>`
}

/** Mapa de calor 5x5: probabilidad de arriba (Muy alta) abajo, impacto de izquierda a derecha. */
function heatMap(risks, stage, title) {
  const rows = PROBABILITY_LEVELS.slice().reverse().map(prob => {
    const cells = IMPACT_LEVELS.map(imp => {
      const zone = zoneOf(prob.level, imp.level)
      const inCell = risks.filter(risk => risk.assessment[stage] && risk.assessment[stage].probability === prob.level && risk.assessment[stage].impact === imp.level)
      const chips = inCell.slice(0, 6).map(risk => `<span class="chip">${escapeHtml(risk.code.replace(/^Rd{4}-/, ''))}</span>`).join('')
      const more = inCell.length > 6 ? `<span class="chip more">+${inCell.length - 6}</span>` : ''
      return `<td class="hm-cell" style="background:${ZONES[zone].color}">${inCell.length ? `<b class="hm-count">${inCell.length}</b>${chips}${more}` : ''}</td>`
    }).join('')
    return `<tr><th class="hm-row">${prob.name}<small>${prob.percent}%</small></th>${cells}</tr>`
  }).join('')
  return `
    <div class="hm">
      <h3>${title}</h3>
      <table class="hm-table">
        <tbody>${rows}</tbody>
        <tfoot><tr><th></th>${IMPACT_LEVELS.map(imp => `<th class="hm-col">${imp.name}<small>${imp.percent}%</small></th>`).join('')}</tr></tfoot>
      </table>
      <div class="hm-axis"><span>Probabilidad ↑</span><span>Impacto →</span></div>
    </div>`
}

function zoneBar(risks, stage) {
  const valued = risks.filter(risk => risk.assessment[stage])
  const total = valued.length || 1
  return `<div class="zbar">${ZONE_ORDER.map(key => {
    const count = valued.filter(risk => risk.assessment[stage].zone === key).length
    if (!count) return ''
    return `<span style="width:${(count / total) * 100}%;background:${ZONES[key].color}">${count}</span>`
  }).join('')}</div>`
}

export function renderRiskReportHtml({ organizationName, map, risks, materializations, actions, processName, generatedAt, generatedBy }) {
  const valued = risks.filter(risk => risk.assessment.inherent)
  const highInherent = valued.filter(risk => ['ALTO', 'EXTREMO'].includes(risk.assessment.inherent.zone)).length
  const highResidual = valued.filter(risk => ['ALTO', 'EXTREMO'].includes(risk.assessment.residual.zone)).length
  const controls = risks.reduce((sum, risk) => sum + risk.controls_count, 0)
  const ineffective = risks.reduce((sum, risk) => sum + risk.controls_ineffective, 0)
  const reductions = valued.map(risk => risk.assessment.reduction || 0)
  const avgReduction = reductions.length ? Math.round(reductions.reduce((a, b) => a + b, 0) / reductions.length) : 0
  const openMats = materializations.filter(row => row.status !== 'CERRADA').length
  const overdue = actions.filter(row => row.overdue).length
  const activeActions = actions.filter(row => row.status !== 'CANCELADA')
  const planProgress = activeActions.length ? Math.round(activeActions.reduce((sum, row) => sum + Number(row.progress || 0), 0) / activeActions.length) : 0

  const byProcess = new Map()
  for (const risk of risks) {
    const entry = byProcess.get(risk.process_name) || { name: risk.process_name, total: 0, zones: { BAJO: 0, MODERADO: 0, ALTO: 0, EXTREMO: 0 }, mats: 0 }
    entry.total += 1
    if (risk.assessment.residual) entry.zones[risk.assessment.residual.zone] += 1
    entry.mats += risk.materializations.total
    byProcess.set(risk.process_name, entry)
  }
  const processRows = [...byProcess.values()].sort((a, b) => b.total - a.total).map(row => `
    <tr>
      <td>${escapeHtml(row.name)}</td>
      <td class="num">${row.total}</td>
      ${ZONE_ORDER.map(key => `<td class="num">${row.zones[key] ? `<span class="dot" style="background:${ZONES[key].color}"></span>${row.zones[key]}` : '—'}</td>`).join('')}
      <td class="num">${row.mats || '—'}</td>
    </tr>`).join('')

  const matrixRows = risks.map(risk => {
    const a = risk.assessment
    return `
    <tr>
      <td class="code">${escapeHtml(risk.code)}</td>
      <td>${escapeHtml(risk.process_name)}</td>
      <td>${escapeHtml(RISK_TYPES[risk.risk_type]?.short || '')}${risk.class_name ? `<br><span class="muted">${escapeHtml(risk.class_name)}</span>` : ''}</td>
      <td><strong>${escapeHtml(clip(risk.description, 220))}</strong>${risk.cause_root ? `<br><span class="muted">Causa raíz: ${escapeHtml(clip(risk.cause_root, 120))}</span>` : ''}</td>
      <td class="num">${escapeHtml(probabilityLevel(a.inherent?.probability)?.name || '—')}<br><span class="muted">${escapeHtml(impactLevel(a.inherent?.impact)?.name || '—')}</span></td>
      <td>${zoneChip(a.inherent?.zone)}</td>
      <td class="num">${risk.controls_count}${risk.controls_ineffective ? `<br><span class="bad">${risk.controls_ineffective} no efectivo(s)</span>` : ''}</td>
      <td class="num">${escapeHtml(probabilityLevel(a.residual?.probability)?.name || '—')}<br><span class="muted">${escapeHtml(impactLevel(a.residual?.impact)?.name || '—')}</span></td>
      <td>${zoneChip(a.residual?.zone)}</td>
      <td>${escapeHtml(TREATMENTS[risk.treatment]?.name || 'Sin definir')}</td>
      <td class="num">${risk.actions.total ? `${risk.actions.progress}%${risk.actions.overdue ? `<br><span class="bad">${risk.actions.overdue} vencida(s)</span>` : ''}` : '—'}</td>
      <td class="num">${risk.materializations.total || '—'}</td>
    </tr>`
  }).join('')

  const matRows = materializations.map(row => `
    <tr>
      <td class="code">${escapeHtml(row.code)}</td>
      <td class="code">${escapeHtml(row.risk_code)}</td>
      <td>${escapeHtml(row.process_name)}</td>
      <td>${formatDate(row.occurred_at)}</td>
      <td>${escapeHtml(clip(row.description, 200))}${row.root_cause ? `<br><span class="muted">Causa raíz: ${escapeHtml(clip(row.root_cause, 140))}</span>` : ''}</td>
      <td class="num">${escapeHtml(impactLevel(row.actual_impact)?.name || '—')}</td>
      <td class="num">${money(row.economic_loss)}</td>
      <td>${escapeHtml(MAT_STATUS[row.status])}${row.revalued_at ? '<br><span class="muted">Riesgo revaluado</span>' : ''}</td>
    </tr>`).join('')

  const actionRows = actions.map(row => `
    <tr>
      <td class="code">${escapeHtml(row.code)}</td>
      <td class="code">${escapeHtml(row.risk_code)}</td>
      <td>${row.kind === 'CORRECTIVA' ? 'Correctiva' : 'Tratamiento'}</td>
      <td>${escapeHtml(clip(row.description, 180))}</td>
      <td>${escapeHtml(row.responsible_label || '—')}</td>
      <td>${formatDate(row.due_date)}</td>
      <td>${escapeHtml(ACTION_STATUS[row.status])}${row.overdue ? '<br><span class="bad">Vencida</span>' : ''}</td>
      <td class="num">${row.progress}%</td>
    </tr>`).join('')

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; color: #172033; font-size: 10px; margin: 0; }
  h2 { font-size: 12.5px; margin: 16px 0 8px; color: ${ACCENT}; text-transform: uppercase; letter-spacing: .05em; break-after: avoid; }
  h3 { font-size: 11px; margin: 0 0 6px; color: #1f2937; text-transform: uppercase; letter-spacing: .04em; }
  .cover { border-radius: 14px; padding: 20px 24px; color: #fff; background: linear-gradient(120deg, #1c1206 0%, #4a2a05 50%, ${ACCENT} 140%); position: relative; overflow: hidden; }
  .cover::after { content: ''; position: absolute; right: -60px; top: -90px; width: 260px; height: 260px; border-radius: 50%; background: radial-gradient(circle, rgba(249,115,22,.35), transparent 70%); }
  .cover .badge { display: inline-block; font-size: 8.5px; letter-spacing: .18em; text-transform: uppercase; font-weight: 800; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.3); border-radius: 999px; padding: 3px 12px; margin-bottom: 8px; }
  .cover h1 { font-size: 22px; margin: 0 0 4px; }
  .cover .sub { color: #fde3c4; font-size: 11px; }
  .cover .meta { position: absolute; right: 24px; top: 20px; text-align: right; font-size: 9px; color: #fde3c4; z-index: 1; }
  .kpis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin: 12px 0; }
  .kpi { border: 1px solid #ecdcc8; border-radius: 10px; padding: 9px 12px; background: linear-gradient(160deg, #fff, #fdf8f2); position: relative; overflow: hidden; }
  .kpi::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--k, ${ACCENT}); }
  .kpi span { display: block; font-size: 8px; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; }
  .kpi strong { display: block; font-size: 19px; margin-top: 3px; color: var(--k, ${ACCENT}); }
  .kpi small { display: block; color: #6b7280; font-size: 8px; margin-top: 2px; }
  .maps { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; break-inside: avoid; }
  .hm { border: 1px solid #ecdcc8; border-radius: 10px; padding: 10px 12px; }
  /* Ancho fijo: con layout automatico cada columna tomaba el ancho de sus etiquetas y el mapa salia deforme. */
  .hm-table { width: 100%; border-collapse: separate; border-spacing: 3px; table-layout: fixed; }
  .hm-table th:first-child { width: 62px; }
  .hm-cell { height: 46px; border-radius: 6px; vertical-align: top; padding: 4px; }
  .hm-count { display: inline-block; min-width: 18px; padding: 1px 5px; border-radius: 999px; background: rgba(0,0,0,.28); color: #fff; font-size: 9px; margin: 0 2px 2px 0; }
  .chip { display: inline-block; background: rgba(255,255,255,.92); color: #111827; border-radius: 4px; padding: 0 3px; font-size: 7px; margin: 0 2px 2px 0; }
  .chip.more { background: rgba(0,0,0,.25); color: #fff; }
  .hm-row { font-size: 8.5px; text-align: right; color: #374151; width: 62px; padding-right: 4px; }
  .hm-col { font-size: 8.5px; color: #374151; padding-top: 3px; }
  .hm-row small, .hm-col small { display: block; color: #9ca3af; font-weight: 400; }
  .hm-axis { display: flex; justify-content: space-between; color: #9ca3af; font-size: 8px; margin-top: 2px; }
  .zbar { display: flex; height: 16px; border-radius: 999px; overflow: hidden; margin: 6px 0 2px; }
  .zbar span { color: #fff; font-size: 8.5px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  table.grid { width: 100%; border-collapse: collapse; }
  table.grid th, table.grid td { border: 1px solid #e5d9ca; padding: 4px 6px; text-align: left; vertical-align: top; }
  table.grid th { background: #fbf4ec; font-size: 7.5px; text-transform: uppercase; color: #6b4a1f; }
  table.grid td { font-size: 8.3px; }
  td.num, th.num { text-align: center; white-space: nowrap; }
  td.code { font-weight: 700; white-space: nowrap; font-size: 7.8px; }
  .zone { display: inline-block; padding: 2px 7px; border-radius: 999px; font-weight: 800; font-size: 7.5px; white-space: nowrap; }
  .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 3px; vertical-align: middle; }
  .muted { color: #6b7280; font-weight: 400; }
  .bad { color: #dc2626; font-weight: 700; font-size: 7.5px; }
  .note { font-size: 8.5px; color: #6b7280; line-height: 1.5; margin-top: 8px; }
  .page { page-break-before: always; }
  .legend { display: flex; gap: 12px; font-size: 8.5px; margin-top: 6px; }
  .legend span { display: inline-flex; align-items: center; gap: 4px; }
</style></head>
<body>
  <div class="cover">
    <div class="badge">Gestión del riesgo · Metodología DAFP v6</div>
    <h1>Mapa de riesgos${processName ? ` · ${escapeHtml(processName)}` : ' institucional'}</h1>
    <div class="sub">${escapeHtml(organizationName)} · ${escapeHtml(map?.name || '')} · Vigencia ${escapeHtml(map?.year || '')}</div>
    <div class="meta">Generado: ${formatDateTime(generatedAt)}<br />${generatedBy ? `Por: ${escapeHtml(generatedBy)}` : ''}</div>
  </div>

  <div class="kpis">
    <div class="kpi"><span>Riesgos identificados</span><strong>${risks.length}</strong><small>${valued.length} valorados</small></div>
    <div class="kpi" style="--k:${ZONES.EXTREMO.color}"><span>Alto/Extremo inherente</span><strong>${highInherent}</strong><small>antes de controles</small></div>
    <div class="kpi" style="--k:${ZONES.ALTO.color}"><span>Alto/Extremo residual</span><strong>${highResidual}</strong><small>después de controles</small></div>
    <div class="kpi" style="--k:${ZONES.BAJO.color}"><span>Reducción promedio</span><strong>${avgReduction}%</strong><small>${controls} controles${ineffective ? ` · ${ineffective} no efectivos` : ''}</small></div>
    <div class="kpi" style="--k:#7c3aed"><span>Materializaciones</span><strong>${materializations.length}</strong><small>${openMats} abiertas</small></div>
    <div class="kpi" style="--k:#2563eb"><span>Plan de tratamiento</span><strong>${planProgress}%</strong><small>${actions.length} acciones · ${overdue} vencidas</small></div>
  </div>

  <div class="maps">
    ${heatMap(risks, 'inherent', 'Riesgo inherente')}
    ${heatMap(risks, 'residual', 'Riesgo residual')}
  </div>
  <div class="legend">${ZONE_ORDER.map(key => `<span><i class="dot" style="background:${ZONES[key].color}"></i>${ZONES[key].name}</span>`).join('')}</div>
  <p class="note">El residual se calcula aplicando cada control sobre el valor ya reducido por el anterior: los controles preventivos y detectivos reducen la probabilidad y los correctivos el impacto (atributos de eficiencia: preventivo 25 %, detectivo 15 %, correctivo 10 %; automático 25 %, manual 15 %). Un control cuya última prueba de efectividad fue «no efectivo» no reduce el riesgo.</p>

  <h2>Distribución por zona</h2>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    <div><h3>Inherente</h3>${zoneBar(risks, 'inherent')}</div>
    <div><h3>Residual</h3>${zoneBar(risks, 'residual')}</div>
  </div>

  <h2>Riesgos por proceso (zona residual)</h2>
  <table class="grid">
    <thead><tr><th>Proceso</th><th class="num">Riesgos</th>${ZONE_ORDER.map(key => `<th class="num">${ZONES[key].name}</th>`).join('')}<th class="num">Materializaciones</th></tr></thead>
    <tbody>${processRows || '<tr><td colspan="7">Sin riesgos</td></tr>'}</tbody>
  </table>

  <div class="page">
    <h2>Matriz de riesgos</h2>
    <table class="grid">
      <thead><tr>
        <th>Código</th><th>Proceso</th><th>Tipo / clase</th><th>Riesgo</th><th class="num">Inherente<br>P / I</th><th>Zona</th>
        <th class="num">Controles</th><th class="num">Residual<br>P / I</th><th>Zona</th><th>Tratamiento</th><th class="num">Plan</th><th class="num">Mat.</th>
      </tr></thead>
      <tbody>${matrixRows || '<tr><td colspan="12">Sin riesgos</td></tr>'}</tbody>
    </table>
  </div>

  ${materializations.length ? `
  <div class="page">
    <h2>Riesgos materializados</h2>
    <table class="grid">
      <thead><tr><th>Evento</th><th>Riesgo</th><th>Proceso</th><th>Ocurrió</th><th>Qué pasó</th><th class="num">Impacto real</th><th class="num">Pérdida</th><th>Estado</th></tr></thead>
      <tbody>${matRows}</tbody>
    </table>
  </div>` : ''}

  ${actions.length ? `
  <h2>Plan de acción</h2>
  <table class="grid">
    <thead><tr><th>Acción</th><th>Riesgo</th><th>Tipo</th><th>Descripción</th><th>Responsable</th><th>Fecha límite</th><th>Estado</th><th class="num">Avance</th></tr></thead>
    <tbody>${actionRows}</tbody>
  </table>` : ''}

  <p class="note">Escalas de la guía: probabilidad por exposición anual (Muy baja ≤2, Baja 3–24, Media 25–500, Alta 501–5.000, Muy alta &gt;5.000 veces/año); impacto por afectación económica (SMLMV), reputacional y, en el sector salud, sobre la seguridad del paciente. Tipos de control: ${Object.values(CONTROL_TYPES).map(item => `${item.name} (${item.weight} %)`).join(', ')}.</p>
</body></html>`
}
