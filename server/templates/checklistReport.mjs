import { CONCEPT_COLORS, SEMAPHORE_GREEN, SEMAPHORE_NO_DATA, conceptFromPercent } from '../semaphore.mjs'
// Informes PDF de Listas de Chequeo: individual (una auditoria) y consolidado (varias).
// Misma escala de semaforo fija que el resto del sistema — un mismo porcentaje siempre se ve del
// mismo color, en pantalla y en papel.
const CONCEPT_LABELS = { OPTIMO: 'Óptimo', ACEPTABLE: 'Aceptable', DEFICIENTE: 'Deficiente', MUY_DEFICIENTE: 'Muy deficiente' }
const NO_DATA_COLOR = SEMAPHORE_NO_DATA
// C/NC comparten el vocabulario del semaforo: cumple = verde, no cumple = rojo.
const VALUE_COLORS = { C: SEMAPHORE_GREEN, NC: '#DC2626', NA: '#64748B' }

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

function formatDate(value) {
  if (!value) return 'Sin fecha'
  const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(date)
}

// "Sin dato" y 0% son cosas distintas: null significa que nada aplicaba (todo NA), no que se
// incumpliera todo. Se imprime como texto gris, nunca como 0% en rojo.
function formatPercent(percent) {
  return percent === null || percent === undefined ? 'Sin dato' : `${Number(percent).toFixed(1)}%`
}

function colorFor(percent) {
  const concept = conceptFromPercent(percent)
  return concept ? CONCEPT_COLORS[concept] : NO_DATA_COLOR
}

function baseStyles() {
  return `
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #172033; font-size: 11px; margin: 0; }
    h1 { font-size: 18px; margin: 0 0 2px; letter-spacing: -.01em; }
    h2 { font-size: 13px; margin: 22px 0 8px; padding-bottom: 5px; border-bottom: 1.5px solid #007fbc; color: #003452; }
    .doc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #007fbc; padding-bottom: 10px; }
    .doc-head .code { text-align: right; font-size: 9px; color: #56624f; line-height: 1.6; }
    .subtitle { color: #526074; font-size: 10.5px; margin: 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { border: 1px solid #d6dde5; padding: 5px 7px; text-align: left; vertical-align: top; }
    th { background: #eef7fc; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; color: #003452; }
    td.num, th.num { text-align: center; font-variant-numeric: tabular-nums; }
    .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
    .meta div { border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 9px; background: #f8fbfe; }
    .meta dt { font-size: 8.5px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; margin: 0 0 2px; }
    .meta dd { margin: 0; font-size: 11px; font-weight: 600; }
    .headline { display: flex; align-items: center; gap: 18px; margin-top: 12px; padding: 12px 16px; border: 1px solid #d6dde5; border-radius: 8px; background: #f8fbfe; }
    .headline .big { font-size: 30px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
    .headline .lbl { font-size: 8.5px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; }
    .tallies { display: flex; gap: 18px; margin-left: auto; }
    .tallies b { display: block; font-size: 15px; text-align: center; font-variant-numeric: tabular-nums; }
    .bar { height: 7px; border-radius: 99px; background: #e6edf3; overflow: hidden; min-width: 90px; }
    .bar i { display: block; height: 100%; border-radius: inherit; }
    .sign-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 8px; }
    .sign-box { border: 1px solid #d6dde5; border-radius: 6px; padding: 8px; }
    .sign-box img { width: 100%; height: 70px; object-fit: contain; }
    .sign-box strong { display: block; font-size: 10.5px; margin-top: 4px; }
    .sign-box small { color: #64748b; font-size: 9px; }
    .foot { margin-top: 20px; border-top: 1px solid #d6dde5; padding-top: 6px; color: #64748b; font-size: 8.5px; }
    .note { color: #64748b; font-size: 9.5px; margin: 6px 0 0; }
  `
}

function docHead(organizationName, title, subtitle, code, version) {
  return `
    <div class="doc-head">
      <div>
        <h1>${escapeHtml(title)}</h1>
        <p class="subtitle">${escapeHtml(subtitle)}</p>
      </div>
      <div class="code">
        <strong>${escapeHtml(organizationName)}</strong><br/>
        ${code ? `Código: ${escapeHtml(code)}<br/>Versión: ${escapeHtml(version)}<br/>` : ''}
        Generado: ${formatDate(new Date())}
      </div>
    </div>`
}

/** Informe de UNA auditoria: cabecera, resultado, desglose por dominio, matriz y firmas. */
export function renderChecklistAuditReportHtml({ organizationName, audit, domains, subjects, answers, signatures, adherence }) {
  const answerAt = new Map(answers.map(answer => [`${answer.audit_subject_id}|${answer.criterion_id}`, answer.value]))
  const domainById = new Map(adherence.byDomain.map(row => [String(row.domainId), row]))
  const criterionById = new Map(adherence.byCriterion.map(row => [String(row.criterionId), row]))
  const subjectById = new Map(adherence.bySubject.map(row => [String(row.subjectId), row]))
  const percent = adherence.overall.percent
  const concept = conceptFromPercent(percent)

  const headerRows = (audit.headerFields || [])
    .map(field => `<div><dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml((audit.header_values || {})[field.id] || '—')}</dd></div>`)
    .join('')

  const matrixRows = domains.map(domain => {
    const domainRow = `<tr><td colspan="${subjects.length + 2}" style="background:#eef7fc;font-weight:700;color:#003452;">${escapeHtml(domain.name)} — ${formatPercent(domainById.get(String(domain.id))?.percent ?? null)}</td></tr>`
    const criteriaRows = domain.criteria.map(criterion => {
      const cells = subjects.map(subject => {
        const value = answerAt.get(`${subject.id}|${criterion.id}`) || '—'
        const color = VALUE_COLORS[value] || '#94a3b8'
        return `<td class="num" style="color:${color};font-weight:700;">${escapeHtml(value)}</td>`
      }).join('')
      const criterionPercent = criterionById.get(String(criterion.id))?.percent ?? null
      return `<tr>
        <td>${criterion.item_number ? `<b>${escapeHtml(criterion.item_number)}.</b> ` : ''}${escapeHtml(criterion.text)}</td>
        ${cells}
        <td class="num" style="color:${colorFor(criterionPercent)};font-weight:700;">${formatPercent(criterionPercent)}</td>
      </tr>`
    }).join('')
    return domainRow + criteriaRows
  }).join('')

  const subjectHeaders = subjects.map((subject, index) => `<th class="num">${index + 1}</th>`).join('')
  const subjectLegend = subjects.map((subject, index) => `${index + 1}. ${escapeHtml(subject.display_name)}`).join(' · ')

  return `<!doctype html><html lang="es"><head><meta charset="utf-8" /><style>${baseStyles()}</style></head><body>
    ${docHead(organizationName, audit.template_name, `${audit.area_name || 'Sin área'} · ${formatDate(audit.audit_date)} · Auditor: ${audit.auditor_name}`, audit.code, audit.version)}

    ${headerRows ? `<h2>Datos generales</h2><div class="meta">${headerRows}</div>` : ''}

    <h2>Resultado de adherencia</h2>
    <div class="headline">
      <div>
        <div class="big" style="color:${colorFor(percent)}">${formatPercent(percent)}</div>
        <div class="lbl">Adherencia general</div>
      </div>
      <div>
        <div style="font-size:13px;font-weight:700;color:${concept ? CONCEPT_COLORS[concept] : NO_DATA_COLOR}">${concept ? CONCEPT_LABELS[concept] : 'Sin dato'}</div>
        <div class="lbl">Concepto</div>
      </div>
      <div class="tallies">
        <div><b>${adherence.overall.c}</b><span class="lbl">Cumple</span></div>
        <div><b>${adherence.overall.nc}</b><span class="lbl">No cumple</span></div>
        <div><b>${adherence.overall.na}</b><span class="lbl">No aplica</span></div>
      </div>
    </div>
    ${percent === null ? '<p class="note">Todos los criterios evaluados quedaron como «No aplica»: no hay base aplicable que medir, por eso el resultado es «sin dato» y no 0 %.</p>' : ''}
    <p class="note">Adherencia = criterios en «Cumple» ÷ criterios aplicables × 100. Los marcados «No aplica» se excluyen del denominador.</p>

    <h2>Adherencia por dominio</h2>
    <table>
      <thead><tr><th>Dominio</th><th class="num">Cumple</th><th class="num">No cumple</th><th class="num">No aplica</th><th class="num">Adherencia</th><th>Nivel</th></tr></thead>
      <tbody>
        ${domains.map(domain => {
          const row = domainById.get(String(domain.id))
          const value = row?.percent ?? null
          return `<tr>
            <td>${escapeHtml(domain.name)}</td>
            <td class="num">${row?.c ?? 0}</td>
            <td class="num">${row?.nc ?? 0}</td>
            <td class="num">${row?.na ?? 0}</td>
            <td class="num" style="color:${colorFor(value)};font-weight:700;">${formatPercent(value)}</td>
            <td><div class="bar"><i style="width:${value === null ? 0 : Math.max(2, Number(value))}%;background:${colorFor(value)}"></i></div></td>
          </tr>`
        }).join('')}
      </tbody>
    </table>

    <h2>Adherencia por ${escapeHtml(audit.subject_label.toLowerCase())}</h2>
    <table>
      <thead><tr><th class="num">#</th><th>${escapeHtml(audit.subject_label)}</th><th class="num">Cumple</th><th class="num">No cumple</th><th class="num">No aplica</th><th class="num">Adherencia</th></tr></thead>
      <tbody>
        ${subjects.map((subject, index) => {
          const row = subjectById.get(String(subject.id))
          const value = row?.percent ?? null
          return `<tr>
            <td class="num">${index + 1}</td>
            <td>${escapeHtml(subject.display_name)}</td>
            <td class="num">${row?.c ?? 0}</td>
            <td class="num">${row?.nc ?? 0}</td>
            <td class="num">${row?.na ?? 0}</td>
            <td class="num" style="color:${colorFor(value)};font-weight:700;">${formatPercent(value)}</td>
          </tr>`
        }).join('')}
      </tbody>
    </table>

    <h2>Detalle criterio por criterio</h2>
    <table>
      <thead><tr><th>Criterio</th>${subjectHeaders}<th class="num">Adher.</th></tr></thead>
      <tbody>${matrixRows}</tbody>
    </table>
    <p class="note">${subjectLegend}</p>
    <p class="note">C = Cumple · NC = No cumple · NA = No aplica · — = sin registrar</p>

    <h2>Firmas</h2>
    ${signatures.length
      ? `<div class="sign-grid">${signatures.map(signature => `
          <div class="sign-box">
            <img src="${escapeHtml(signature.signature_image)}" alt="" />
            <strong>${escapeHtml(signature.signer_name)}</strong>
            <small>${escapeHtml(signature.signer_role || 'Sin rol registrado')} · ${formatDate(signature.signed_at)}</small>
          </div>`).join('')}</div>`
      : '<p class="note">Esta auditoría no tiene firmas registradas.</p>'}

    <div class="foot">
      ${escapeHtml(audit.template_name)}${audit.code ? ` · ${escapeHtml(audit.code)} v${escapeHtml(audit.version)}` : ''} ·
      Estado: ${audit.status === 'CERRADA' ? 'Cerrada' : 'Borrador'} · Generado por SGIMR
    </div>
  </body></html>`
}

/** Informe consolidado: varias auditorias filtradas, para lectura directiva. */
export function renderChecklistConsolidatedHtml({ organizationName, filters, audits, byTemplate, byArea, byDomain, worstCriteria, overall }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8" /><style>${baseStyles()}</style></head><body>
    ${docHead(organizationName, 'Consolidado de listas de chequeo', filters, '', '')}

    <div class="headline">
      <div>
        <div class="big" style="color:${colorFor(overall.percent)}">${formatPercent(overall.percent)}</div>
        <div class="lbl">Adherencia consolidada</div>
      </div>
      <div class="tallies">
        <div><b>${audits.length}</b><span class="lbl">Auditorías</span></div>
        <div><b>${overall.c}</b><span class="lbl">Cumple</span></div>
        <div><b>${overall.nc}</b><span class="lbl">No cumple</span></div>
        <div><b>${overall.na}</b><span class="lbl">No aplica</span></div>
      </div>
    </div>
    <p class="note">La adherencia consolidada se calcula sobre el total de criterios de todas las auditorías incluidas, no como promedio de promedios: así una ronda con muchos sujetos pesa lo que realmente aporta.</p>

    <h2>Por lista</h2>
    <table>
      <thead><tr><th>Lista</th><th class="num">Auditorías</th><th class="num">Adherencia</th><th>Nivel</th></tr></thead>
      <tbody>
        ${byTemplate.map(row => `<tr>
          <td>${escapeHtml(row.name)}</td>
          <td class="num">${row.audits}</td>
          <td class="num" style="color:${colorFor(row.percent)};font-weight:700;">${formatPercent(row.percent)}</td>
          <td><div class="bar"><i style="width:${row.percent === null ? 0 : Math.max(2, Number(row.percent))}%;background:${colorFor(row.percent)}"></i></div></td>
        </tr>`).join('') || '<tr><td colspan="4">Sin datos</td></tr>'}
      </tbody>
    </table>

    <h2>Por área / servicio</h2>
    <table>
      <thead><tr><th>Área</th><th class="num">Auditorías</th><th class="num">Adherencia</th><th>Nivel</th></tr></thead>
      <tbody>
        ${byArea.map(row => `<tr>
          <td>${escapeHtml(row.name)}</td>
          <td class="num">${row.audits}</td>
          <td class="num" style="color:${colorFor(row.percent)};font-weight:700;">${formatPercent(row.percent)}</td>
          <td><div class="bar"><i style="width:${row.percent === null ? 0 : Math.max(2, Number(row.percent))}%;background:${colorFor(row.percent)}"></i></div></td>
        </tr>`).join('') || '<tr><td colspan="4">Sin datos</td></tr>'}
      </tbody>
    </table>

    <h2>Adherencia por dominio</h2>
    <table>
      <thead><tr><th>Dominio</th><th class="num">Adherencia</th><th>Nivel</th></tr></thead>
      <tbody>
        ${byDomain.map(row => `<tr>
          <td>${escapeHtml(row.name)}</td>
          <td class="num" style="color:${colorFor(row.percent)};font-weight:700;">${formatPercent(row.percent)}</td>
          <td><div class="bar"><i style="width:${row.percent === null ? 0 : Math.max(2, Number(row.percent))}%;background:${colorFor(row.percent)}"></i></div></td>
        </tr>`).join('') || '<tr><td colspan="3">Sin datos</td></tr>'}
      </tbody>
    </table>

    <h2>Criterios más incumplidos</h2>
    <table>
      <thead><tr><th>Criterio</th><th>Lista</th><th class="num">No cumple</th><th class="num">Evaluado</th><th class="num">Adherencia</th></tr></thead>
      <tbody>
        ${worstCriteria.map(row => `<tr>
          <td>${escapeHtml(row.text)}</td>
          <td>${escapeHtml(row.template_name)}</td>
          <td class="num">${row.nc}</td>
          <td class="num">${row.applicable}</td>
          <td class="num" style="color:${colorFor(row.percent)};font-weight:700;">${formatPercent(row.percent)}</td>
        </tr>`).join('') || '<tr><td colspan="5">Sin datos</td></tr>'}
      </tbody>
    </table>
    <p class="note">Ordenados por menor adherencia; solo se listan criterios con al menos una evaluación aplicable.</p>

    <div class="foot">${escapeHtml(organizationName)} · Consolidado generado por SGIMR</div>
  </body></html>`
}

/**
 * El FORMATO EN BLANCO de una lista: la misma hoja que se imprime y se lleva a la ronda.
 *
 * No es el informe de una auditoria (eso ya existe arriba) sino el formato vacio, con sus
 * dominios, sus criterios numerados y las casillas C / NC / NA por cada sujeto evaluado. Sirve
 * para dos cosas que la pantalla no cubre: revisar de un vistazo que la lista cargada coincide
 * con el papel institucional, y salir a auditar con la hoja impresa cuando no hay tablet.
 */
export function renderChecklistBlankFormatHtml({ organizationName, template, columns = 5 }) {
  const subject = template.subject_label || 'Evaluado'
  const criteriaCount = template.domains.reduce((total, domain) => total + domain.criteria.length, 0)

  const headerBoxes = (template.headerFields || [])
    .map(field => `<div><dt>${escapeHtml(field.label)}</dt><dd>&nbsp;</dd></div>`).join('')

  // Una columna por sujeto, cada una con su triplete C/NC/NA — igual que el formato impreso.
  const subjectHeads = Array.from({ length: columns }, (_, i) =>
    `<th class="num" colspan="3">${i + 1}</th>`).join('')
  const valueHeads = Array.from({ length: columns }, () =>
    '<th class="num tick">C</th><th class="num tick">NC</th><th class="num tick">NA</th>').join('')

  const attributeRows = (template.subjectFields || []).map(field =>
    `<tr class="attr"><td>${escapeHtml(field.label)}</td>${Array.from({ length: columns }, () => '<td colspan="3"></td>').join('')}</tr>`).join('')

  const bodyRows = template.domains.map(domain => {
    const head = `<tr class="dom"><td colspan="${columns * 3 + 1}">${escapeHtml(domain.name)}</td></tr>`
    const rows = domain.criteria.map(criterion => {
      const number = template.numbered_items && criterion.item_number
        ? `<b>${escapeHtml(criterion.item_number)}.</b> ` : ''
      const cells = Array.from({ length: columns }, () => '<td class="box"></td><td class="box"></td><td class="box"></td>').join('')
      return `<tr><td class="crit">${number}${escapeHtml(criterion.text)}</td>${cells}</tr>`
    }).join('')
    return head + rows
  }).join('')

  return `<!doctype html><html lang="es"><head><meta charset="utf-8" /><style>${baseStyles()}
    .meta dd { min-height: 14px; border-bottom: 1px solid #cbd5e1; }
    th.tick { text-align: center; font-size: 8px; padding: 3px 0; width: 22px; }
    td.box { width: 22px; height: 20px; background: #fff; }
    td.crit { font-size: 10px; line-height: 1.35; }
    tr.dom td { background: #eef7fc; font-weight: 700; color: #003452; font-size: 9.5px;
                text-transform: uppercase; letter-spacing: .04em; }
    tr.attr td { background: #f8fbfe; font-size: 9px; color: #526074; height: 18px; }
    .legend { margin-top: 8px; color: #526074; font-size: 9px; }
    .totals td { font-weight: 700; background: #f8fbfe; height: 22px; }
  </style></head><body>
    ${docHead(organizationName, template.name, `Formato para diligenciar · audita ${escapeHtml(subject.toLowerCase())} · ${template.domains.length} dominios · ${criteriaCount} criterios`, template.code, template.version)}

    <h2>Datos generales</h2>
    <div class="meta">${headerBoxes || '<div><dt>Sin campos de cabecera</dt><dd>&nbsp;</dd></div>'}</div>

    <h2>Criterios de verificación</h2>
    <table>
      <thead>
        <tr><th rowspan="2">Criterio</th><th class="num" colspan="${columns * 3}">${escapeHtml(subject)} evaluado</th></tr>
        <tr>${subjectHeads}</tr>
        <tr><th>Nombre</th>${Array.from({ length: columns }, () => '<th colspan="3"></th>').join('')}</tr>
        <tr><th></th>${valueHeads}</tr>
      </thead>
      <tbody>
        ${attributeRows}
        ${bodyRows}
        <tr class="totals"><td>Cumplimiento de adherencia (%)</td>${Array.from({ length: columns }, () => '<td colspan="3"></td>').join('')}</tr>
      </tbody>
    </table>
    <p class="legend">C = Cumple · NC = No cumple · NA = No aplica. Los criterios marcados «No aplica» se excluyen del denominador:
      adherencia = C / (C + NC) × 100.</p>

    <h2>Observaciones y retroalimentación</h2>
    <table><tbody>
      <tr><td style="height:54px"></td></tr>
    </tbody></table>

    <h2>Firmas</h2>
    <div class="sign-grid">
      <div class="sign-box" style="height:70px"><small>Firma del evaluador</small></div>
      <div class="sign-box" style="height:70px"><small>Firma del ${escapeHtml(subject.toLowerCase())} o usuario</small></div>
    </div>

    <p class="foot">${escapeHtml(template.name)}${template.code ? ` · ${escapeHtml(template.code)} v${escapeHtml(template.version)}` : ''} · Formato en blanco · Generado por SGIMR</p>
  </body></html>`
}
