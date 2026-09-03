// Informe PDF de Asistencias Tecnicas, en el espiritu del formato institucional GIN-GDO-FO-17:
// banda de KPIs, graficas, gestiones del periodo aparte de las solicitudes, tablas resumen y
// detalle. Las graficas se dibujan con ECharts REAL (la misma libreria de la pantalla) embebido
// desde node_modules en el HTML que Puppeteer imprime: renderer SVG (vectorial, nitido a
// cualquier zoom del PDF) y sin animaciones ni red — el chart queda dibujado en el mismo tick
// del script, antes de que Puppeteer capture.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ECHARTS_SOURCE = readFileSync(require.resolve('echarts/dist/echarts.min.js'), 'utf8')

const ACCENT = '#3478f6'
const INK = '#132038'
const STATE_COLORS = {
  VENCIDA: '#d93835',
  PENDIENTE: '#e0940b',
  EN_CURSO: '#2465e5',
  COMPLETADA: '#129a63',
  CANCELADA: '#8593a8',
}
const STATE_LABELS = {
  VENCIDA: 'Vencidas',
  PENDIENTE: 'Sin iniciar',
  EN_CURSO: 'En curso',
  COMPLETADA: 'Completadas',
  CANCELADA: 'Canceladas',
}
const PRIORITY_LABELS = { BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta', CRITICA: 'Crítica' }
const PRIORITY_COLORS = { BAJA: '#8593a8', MEDIA: '#2465e5', ALTA: '#e0940b', CRITICA: '#d93835' }
const STATE_DESCRIPTIONS = {
  COMPLETADA: 'Asistencias tramitadas y cerradas con solución registrada.',
  EN_CURSO: 'Asistencias con gestión iniciada, en trámite de atención.',
  PENDIENTE: 'Asistencias radicadas a la espera de asignación o arranque.',
  VENCIDA: 'Asistencias con fecha de compromiso superada sin cierre.',
  CANCELADA: 'Asistencias devueltas o desistidas, con el motivo registrado.',
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(value))
}

function formatMonth(value) {
  const [year, month] = String(value).split('-').map(Number)
  return new Intl.DateTimeFormat('es-CO', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)))
}

function clip(value, size) {
  const text = String(value ?? '')
  return text.length > size ? `${text.slice(0, size)}…` : text
}

// Textos por defecto cuando la entidad no ha configurado los suyos: el informe institucional
// nunca sale sin introduccion, objetivo ni conclusiones.
const DEFAULT_INTRO = 'El presente informe da cuenta de la gestión de asistencias técnicas de la plataforma ALMERA, '
  + 'Sistema Integrado de Gestión de la entidad. Comprende la atención de las solicitudes radicadas por los '
  + 'líderes y gestores de los procesos, el acompañamiento en el uso de los módulos de la herramienta y las '
  + 'actividades de administración de la plataforma desarrolladas durante el periodo, como soporte transversal '
  + 'a la calidad, oportunidad y confiabilidad de la información institucional.'
const DEFAULT_OBJECTIVE = 'Reportar las asistencias técnicas atendidas y las gestiones desarrolladas durante el periodo en la '
  + 'administración de la plataforma ALMERA, evidenciando el estado de cada solicitud, los tiempos de atención '
  + 'y el comportamiento de la demanda por proceso, como insumo para el seguimiento del Sistema Integrado de Gestión.'
const DEFAULT_CONCLUSIONS = 'Se recomienda dar continuidad al seguimiento de las solicitudes que permanecen abiertas, mantener el '
  + 'acompañamiento a los procesos en el uso adecuado de la plataforma y conservar el registro oportuno de las '
  + 'gestiones del periodo, de manera que este informe siga reflejando de forma completa la labor de administración del sistema.'

/** Parrafo de analisis generado de los DATOS del corte: la parte del informe que nadie tiene
 *  que redactar a mano porque sale sola de la base. */
function buildAnalysis({ summary, byProcess, dataKpis, timeline, gestiones }) {
  const total = Number(summary.total) || 0
  if (!total) return 'En el corte seleccionado no se registraron asistencias técnicas.'
  const parts = []
  const completedPct = Math.round((Number(summary.completed) / total) * 100)
  parts.push(`Durante el corte se gestionaron ${total} asistencias técnicas radicadas por ${dataKpis.distinct_processes} proceso${dataKpis.distinct_processes === 1 ? '' : 's'} de la entidad, de las cuales ${summary.completed} (${completedPct}%) culminaron su trámite`)
  parts.push(Number(summary.overdue) > 0
    ? `${summary.overdue} se encuentran vencidas y requieren acción inmediata`
    : 'sin asistencias vencidas al cierre del corte')
  if (Number(dataKpis.avg_close_days) > 0) parts.push(`con un tiempo promedio de cierre de ${dataKpis.avg_close_days} días`)
  const sentences = [`${parts.join(', ')}.`]
  if (byProcess.length) {
    const top = byProcess[0]
    sentences.push(`El proceso con mayor volumen fue ${top.name} con ${top.total} solicitud${top.total === 1 ? '' : 'es'} (${Math.round((top.total / total) * 100)}% del total).`)
  }
  if (timeline.length > 1) {
    const last = timeline[timeline.length - 1]
    const previous = timeline[timeline.length - 2]
    const delta = last.received - previous.received
    sentences.push(`En ${formatMonth(last.month)} se radicaron ${last.received} solicitudes, ${delta === 0 ? 'igual que' : delta > 0 ? `${delta} más que` : `${Math.abs(delta)} menos que`} en ${formatMonth(previous.month)}.`)
  }
  if (gestiones.length) sentences.push(`De manera complementaria se desarrollaron ${gestiones.length} gestiones de administración de la plataforma, detalladas en la sección correspondiente.`)
  return sentences.join(' ')
}

export function renderAlmeraReportHtml({
  organizationName, generatedAt, generatedBy, filtered, rows, summary, byModule, byProcess,
  timeline = [], byPriority = [], dataKpis = {}, gestiones = [], settings = {}, dateFrom = null, dateTo = null,
}) {
  const intro = settings.intro || DEFAULT_INTRO
  const objective = settings.objective || DEFAULT_OBJECTIVE
  const conclusions = settings.conclusions || DEFAULT_CONCLUSIONS
  const analysis = buildAnalysis({ summary, byProcess, dataKpis, timeline, gestiones })
  // La numeracion de secciones es dinamica: si no hay gestiones registradas, la seccion no sale
  // y las siguientes no pueden quedar con un numero saltado.
  let sectionNumber = 0
  const section = title => `<h2>${++sectionNumber}. ${title}</h2>`
  const byState = Object.keys(STATE_LABELS)
    .map(key => ({ key, label: STATE_LABELS[key], color: STATE_COLORS[key], value: rows.filter(row => row.effective_status === key).length }))
    .filter(item => item.value > 0)
  const canceled = byState.find(item => item.key === 'CANCELADA')?.value || 0
  const closedShare = summary.total ? Math.round(((Number(summary.completed) + canceled) / summary.total) * 100) : 0

  const periodLabel = dateFrom || dateTo
    ? `${dateFrom ? formatDate(dateFrom) : 'inicio'} — ${dateTo ? formatDate(dateTo) : 'hoy'}`
    : 'Histórico completo'

  // Datos que consumen los charts: se serializan una sola vez para el script embebido.
  const chartData = {
    states: byState.map(item => ({ name: item.label, value: item.value, color: item.color })),
    processes: byProcess.slice(0, 12).map(item => ({ name: item.name, value: item.total })).reverse(),
    modules: byModule.slice(0, 8).map(item => ({ name: item.name, value: item.total })).reverse(),
    timeline: timeline.map(item => ({ month: formatMonth(item.month), received: item.received, closed: item.closed })),
    priorities: Object.keys(PRIORITY_LABELS)
      .map(key => ({ name: PRIORITY_LABELS[key], value: Number(byPriority.find(item => item.priority === key)?.total || 0), color: PRIORITY_COLORS[key] }))
      .filter(item => item.value > 0),
  }

  const gestionBlocks = gestiones.map((gestion, index) => `
    <div class="gestion">
      <div class="gestion-index">${index + 1}</div>
      <div class="gestion-body">
        <div class="gestion-head">
          <strong>${escapeHtml(gestion.title)}</strong>
          <span class="gestion-date">${formatDate(gestion.performed_at)}</span>
        </div>
        ${gestion.detail ? `<p>${escapeHtml(gestion.detail)}</p>` : ''}
      </div>
    </div>`).join('')

  const stateSummaryRows = byState.map(item => `
    <tr>
      <td><span class="state" style="color:${item.color};border-color:${item.color};">${item.label}</span></td>
      <td class="num"><b>${item.value}</b></td>
      <td class="num">${summary.total ? Math.round((item.value / summary.total) * 100) : 0}%</td>
      <td>${STATE_DESCRIPTIONS[item.key] || ''}</td>
    </tr>`).join('')

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
  body { font-family: Arial, Helvetica, sans-serif; color: ${INK}; font-size: 10.5px; margin: 0; }
  h2 { font-size: 12.5px; margin: 0 0 8px; color: #1c4fae; text-transform: uppercase; letter-spacing: .05em; break-after: avoid; }
  .cover { border-radius: 14px; padding: 22px 26px; margin-bottom: 14px; color: #fff;
           background: linear-gradient(120deg, #0d1b34 0%, #16346b 55%, #2465e5 130%); position: relative; overflow: hidden; }
  .cover::after { content: ''; position: absolute; right: -60px; top: -80px; width: 260px; height: 260px; border-radius: 50%;
                  background: radial-gradient(circle, rgba(88,151,255,.35), transparent 70%); }
  .cover-badge { display: inline-block; font-size: 8.5px; letter-spacing: .18em; text-transform: uppercase; font-weight: 800;
                 background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.3); border-radius: 999px; padding: 3px 12px; margin-bottom: 9px; }
  .cover h1 { font-size: 23px; margin: 0 0 4px; letter-spacing: -.01em; }
  .cover .sub { color: #b9ccf3; font-size: 11px; }
  .cover-meta { position: absolute; right: 26px; top: 22px; text-align: right; font-size: 9px; color: #b9ccf3; z-index: 1; }
  .kpi-band { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 10px; }
  .kpi { border: 1px solid #d5e0f2; border-radius: 11px; padding: 11px 14px; background: linear-gradient(160deg, #ffffff, #f3f7ff); position: relative; overflow: hidden; }
  .kpi::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--kpi, ${ACCENT}); }
  .kpi span { display: block; font-size: 8.5px; color: #5b6b86; text-transform: uppercase; letter-spacing: .06em; }
  .kpi strong { display: block; font-size: 23px; margin-top: 3px; color: var(--kpi, ${ACCENT}); letter-spacing: -.02em; }
  .kpi small { display: block; margin-top: 2px; color: #5b6b86; font-size: 8.5px; }
  .kpi-band.data .kpi strong { font-size: 18px; }
  .charts-grid { display: grid; grid-template-columns: 1.05fr 1.5fr 1fr; gap: 10px; margin-bottom: 10px; }
  .charts-grid-2 { display: grid; grid-template-columns: 1.7fr 1fr; gap: 10px; margin-bottom: 12px; }
  .chart-card { border: 1px solid #d5e0f2; border-radius: 11px; padding: 10px 12px 6px; background: #fdfefe; break-inside: avoid; }
  .chart-box { width: 100%; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #d2d9e3; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #eef4fd; font-size: 8.5px; text-transform: uppercase; color: #35507e; }
  td { font-size: 9px; }
  td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .state { display: inline-block; border: 1px solid; border-radius: 999px; padding: 1px 7px; font-size: 8px; font-weight: 800; white-space: nowrap; background: #fff; }
  .muted { color: #667085; font-weight: 400; }
  .section { margin-bottom: 14px; }
  .gestion { display: flex; gap: 10px; border: 1px solid #d5e0f2; border-left: 4px solid ${ACCENT}; border-radius: 9px;
             padding: 9px 12px; margin-bottom: 7px; background: linear-gradient(160deg, #ffffff, #f7faff); break-inside: avoid; }
  .gestion-index { flex: none; width: 24px; height: 24px; border-radius: 50%; background: ${ACCENT}; color: #fff;
                   font-weight: 800; font-size: 11px; display: flex; align-items: center; justify-content: center; }
  .gestion-head { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
  .gestion-head strong { font-size: 10.5px; }
  .gestion-date { flex: none; font-size: 8.5px; color: #5b6b86; font-weight: 700; text-transform: uppercase; }
  .gestion-body p { margin: 4px 0 0; color: #33445f; font-size: 9.5px; line-height: 1.45; }
  .detail-section { page-break-before: always; }
  .prose { margin: 0; text-align: justify; line-height: 1.55; font-size: 10px; color: #26344d; }
  h3 { font-size: 11px; margin: 0 0 8px; color: #1c4fae; text-transform: uppercase; letter-spacing: .04em; }
  .signature { margin: 22px 0 8px; padding-top: 10px; border-top: 1px solid #d2d9e3; width: 280px; font-size: 10px; }
  .signature span { display: block; color: #667085; margin-bottom: 14px; }
  .signature strong { display: block; font-size: 11px; }
  .signature em { display: block; font-style: normal; color: #5b6b86; font-size: 9px; }
</style>
</head>
<body>
  <div class="cover">
    <div class="cover-badge">Gestión ALMERA · Sistema Integrado de Gestión</div>
    <h1>Informe de Asistencias Técnicas</h1>
    <div class="sub">${escapeHtml(organizationName)} · Periodo: ${periodLabel}${filtered ? ' · listado con filtros aplicados' : ''}</div>
    <div class="cover-meta">
      Generado: ${formatDateTime(generatedAt)}<br />
      ${generatedBy ? `Por: ${escapeHtml(generatedBy)}` : ''}
    </div>
  </div>

  <div class="section">
    ${section('Introducción')}
    <p class="prose">${escapeHtml(intro)}</p>
  </div>

  <div class="section">
    ${section('Objetivo')}
    <p class="prose">${escapeHtml(objective)}</p>
  </div>

  ${section('Indicadores clave del periodo')}
  <div class="kpi-band">
    <div class="kpi"><span>Asistencias en este informe</span><strong>${summary.total}</strong><small>solicitudes gestionadas</small></div>
    <div class="kpi" style="--kpi:${STATE_COLORS.COMPLETADA}"><span>Completadas</span><strong>${summary.completed}</strong><small>${summary.total ? Math.round((summary.completed / summary.total) * 100) : 0}% del total</small></div>
    <div class="kpi" style="--kpi:${STATE_COLORS.EN_CURSO}"><span>En curso</span><strong>${summary.in_progress}</strong><small>con gestión iniciada</small></div>
    <div class="kpi" style="--kpi:${STATE_COLORS.VENCIDA}"><span>Vencidas</span><strong>${summary.overdue}</strong><small>requieren acción inmediata</small></div>
  </div>
  <div class="kpi-band data">
    <div class="kpi"><span>Avance promedio</span><strong>${summary.average_completion}%</strong></div>
    <div class="kpi"><span>Tiempo promedio de cierre</span><strong>${dataKpis.avg_close_days ?? 0} días</strong></div>
    <div class="kpi"><span>Procesos atendidos</span><strong>${dataKpis.distinct_processes ?? 0}</strong></div>
    <div class="kpi"><span>Trámite cerrado</span><strong>${closedShare}%</strong><small>completadas + canceladas</small></div>
  </div>

  <div class="section">
    ${section('Desarrollo y análisis del periodo')}
    <p class="prose">${escapeHtml(analysis)}</p>
  </div>

  <div class="charts-grid">
    <div class="chart-card"><h3>Estado de las asistencias</h3><div id="chart-states" class="chart-box" style="height:190px"></div></div>
    <div class="chart-card"><h3>Por proceso solicitante</h3><div id="chart-processes" class="chart-box" style="height:190px"></div></div>
    <div class="chart-card"><h3>Prioridad</h3><div id="chart-priorities" class="chart-box" style="height:190px"></div></div>
  </div>
  <div class="charts-grid-2">
    <div class="chart-card"><h3>Tendencia mensual · radicadas vs cerradas</h3><div id="chart-timeline" class="chart-box" style="height:170px"></div></div>
    <div class="chart-card"><h3>Por módulo ALMERA</h3><div id="chart-modules" class="chart-box" style="height:170px"></div></div>
  </div>

  ${gestiones.length ? `
  <div class="section">
    ${section('Gestiones del periodo')}
    <p class="muted" style="margin:0 0 8px;">Actividades de administración de la plataforma desarrolladas en el periodo, adicionales a la atención de solicitudes.</p>
    ${gestionBlocks}
  </div>` : ''}

  <div class="section">
    ${section('Resumen general de gestión')}
    <table>
      <thead><tr><th>Estado</th><th class="num">Cantidad</th><th class="num">%</th><th>Descripción</th></tr></thead>
      <tbody>${stateSummaryRows || '<tr><td colspan="4">Sin datos</td></tr>'}</tbody>
    </table>
  </div>

  <div class="section">
    ${section('Conclusiones y recomendaciones')}
    <p class="prose">${escapeHtml(conclusions)}</p>
  </div>

  ${settings.prepared_by ? `
  <div class="signature">
    <span>Elaboró:</span>
    <strong>${escapeHtml(settings.prepared_by)}</strong>
    ${settings.prepared_by_role ? `<em>${escapeHtml(settings.prepared_by_role)}</em>` : ''}
  </div>` : ''}

  <div class="detail-section">
    ${section('Anexo · Detalle de asistencias')}
    <table>
      <thead><tr>
        <th>Código</th><th>Asunto / solicitud</th><th>Proceso</th><th>Módulo</th><th>Solicitante</th>
        <th>Responsable</th><th>Prioridad</th><th>Solicitada</th><th>Avance</th>
        <th>Estado</th><th>Cerrada</th><th>Solución / observaciones</th>
      </tr></thead>
      <tbody>${detailRows || '<tr><td colspan="12">Sin asistencias que mostrar</td></tr>'}</tbody>
    </table>
  </div>

  <p style="margin-top:14px;font-size:9px;color:#667085;">
    Este informe refleja el estado de la base de asistencias técnicas al momento de generarse,
    con la búsqueda y los filtros aplicados en pantalla.
  </p>

  <script>${ECHARTS_SOURCE}</script>
  <script>
    const DATA = ${JSON.stringify(chartData)}
    const AXIS = { axisLabel: { color: '#5b6b86', fontSize: 9 }, axisLine: { lineStyle: { color: '#d2d9e3' } } }
    function draw(id, option) {
      const el = document.getElementById(id)
      if (!el) return
      const chart = echarts.init(el, null, { renderer: 'svg' })
      chart.setOption(Object.assign({ animation: false, textStyle: { fontFamily: 'Arial' } }, option))
    }
    draw('chart-states', {
      series: [{
        type: 'pie', radius: ['52%', '78%'], center: ['32%', '50%'],
        label: { show: false },
        data: DATA.states.map(s => ({ name: s.name, value: s.value, itemStyle: { color: s.color } })),
      }],
      legend: { orient: 'vertical', right: 0, top: 'middle', itemWidth: 10, itemHeight: 10,
                formatter: name => { const item = DATA.states.find(s => s.name === name); return name + '  ' + item.value },
                textStyle: { fontSize: 9, color: '#33445f' } },
      graphic: [{ type: 'text', left: '25.5%', top: '44%', style: { text: String(DATA.states.reduce((a, s) => a + s.value, 0)), font: '800 17px Arial', fill: '#16346b', textAlign: 'center' } }],
    })
    draw('chart-processes', {
      grid: { left: 4, right: 26, top: 4, bottom: 4, containLabel: true },
      xAxis: Object.assign({ type: 'value', splitLine: { lineStyle: { color: '#edf1f8' } } }, AXIS),
      yAxis: Object.assign({ type: 'category', data: DATA.processes.map(p => p.name.length > 26 ? p.name.slice(0, 26) + '…' : p.name) }, AXIS),
      series: [{ type: 'bar', data: DATA.processes.map(p => p.value), barWidth: '62%',
                 label: { show: true, position: 'right', fontSize: 9, fontWeight: 700, color: '#16346b' },
                 itemStyle: { borderRadius: [0, 4, 4, 0],
                   color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: '#7aa6f9' }, { offset: 1, color: '${ACCENT}' }]) } }],
    })
    draw('chart-priorities', {
      series: [{ type: 'pie', radius: ['0%', '72%'], center: ['50%', '42%'],
                 label: { fontSize: 9, color: '#33445f', formatter: '{b}\\n{c}' },
                 data: DATA.priorities.map(p => ({ name: p.name, value: p.value, itemStyle: { color: p.color } })) }],
    })
    draw('chart-timeline', {
      grid: { left: 4, right: 10, top: 26, bottom: 4, containLabel: true },
      legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 9, color: '#33445f' } },
      xAxis: Object.assign({ type: 'category', data: DATA.timeline.map(t => t.month) }, AXIS),
      yAxis: Object.assign({ type: 'value', splitLine: { lineStyle: { color: '#edf1f8' } } }, AXIS),
      series: [
        { name: 'Radicadas', type: 'line', smooth: true, symbolSize: 5, data: DATA.timeline.map(t => t.received),
          lineStyle: { width: 2.5, color: '${ACCENT}' }, itemStyle: { color: '${ACCENT}' },
          areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(52,120,246,.28)' }, { offset: 1, color: 'rgba(52,120,246,0)' }]) } },
        { name: 'Cerradas', type: 'line', smooth: true, symbolSize: 5, data: DATA.timeline.map(t => t.closed),
          lineStyle: { width: 2.5, color: '${STATE_COLORS.COMPLETADA}' }, itemStyle: { color: '${STATE_COLORS.COMPLETADA}' } },
      ],
    })
    draw('chart-modules', {
      grid: { left: 4, right: 26, top: 4, bottom: 4, containLabel: true },
      xAxis: Object.assign({ type: 'value', splitLine: { lineStyle: { color: '#edf1f8' } } }, AXIS),
      yAxis: Object.assign({ type: 'category', data: DATA.modules.map(m => m.name.length > 22 ? m.name.slice(0, 22) + '…' : m.name) }, AXIS),
      series: [{ type: 'bar', data: DATA.modules.map(m => m.value), barWidth: '58%',
                 label: { show: true, position: 'right', fontSize: 9, fontWeight: 700, color: '#16346b' },
                 itemStyle: { borderRadius: [0, 4, 4, 0], color: '#16a5a0' } }],
    })
  </script>
</body>
</html>`
}
