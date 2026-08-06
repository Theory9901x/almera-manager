// Informe institucional de Huella de Carbono v2 — 22 secciones, generado con Puppeteer (igual
// mecanismo que el resto de informes del sistema, ver server/pdf.mjs). Paleta propia del modulo
// (§ CLAUDE.md Huella de Carbono v2), distinta del verde institucional generico del informe viejo
// (carbonReport.mjs), que se deja intacto para el modulo de "bloques".
const PALETTE = {
  navy: '#0B1830', green: '#16A47A', greenDark: '#08765B', cyan: '#21B6C7',
  scope1: '#2385D9', scope2: '#F3A712', purple: '#7557D3', ink: '#172033', muted: '#657083', error: '#D64545', bg: '#F3F7F8',
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}
function fmtDate(value) { return value ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(new Date(value)) : 'Sin fecha' }
function fmtDateTime(value) { return value ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value)) : '—' }
function fmtNum(value, digits = 2) { return value == null ? '—' : Number(value).toLocaleString('es-CO', { minimumFractionDigits: digits, maximumFractionDigits: digits }) }
function fmtTon(kg) { return `${fmtNum(Number(kg || 0) / 1000, 3)} tCO2e` }
function fmtPercent(value, digits = 1) { return value == null ? '—' : `${fmtNum(value, digits)}%` }

function donutSvg(scope1Percent, scope2Percent) {
  const radius = 46, circumference = 2 * Math.PI * radius
  const scope1Length = (scope1Percent / 100) * circumference
  return `
  <svg width="140" height="140" viewBox="0 0 120 120">
    <circle cx="60" cy="60" r="${radius}" fill="none" stroke="${PALETTE.scope2}" stroke-width="16" />
    <circle cx="60" cy="60" r="${radius}" fill="none" stroke="${PALETTE.scope1}" stroke-width="16"
      stroke-dasharray="${scope1Length} ${circumference}" transform="rotate(-90 60 60)" />
    <text x="60" y="56" text-anchor="middle" font-size="16" font-weight="700" fill="${PALETTE.ink}">${fmtNum(scope1Percent + scope2Percent > 0 ? scope1Percent : 0, 0)}%</text>
    <text x="60" y="72" text-anchor="middle" font-size="8" fill="${PALETTE.muted}">Alcance 1</text>
  </svg>`
}

function barRow(label, valueTon, maxTon, color) {
  const widthPercent = maxTon ? Math.max(2, (valueTon / maxTon) * 100) : 0
  return `<div class="bar-row"><span class="bar-label">${escapeHtml(label)}</span>
    <div class="bar-track"><div class="bar-fill" style="width:${widthPercent}%;background:${color}"></div></div>
    <span class="bar-value">${fmtNum(valueTon, 3)} t</span></div>`
}

function recordRows(records, kind) {
  if (!records.length) return `<tr><td colspan="6" class="empty">Sin registros validados en el periodo</td></tr>`
  return records.map(row => {
    if (kind === 'STATIONARY') return `<tr><td>${fmtDate(row.record_date)}</td><td>${escapeHtml(row.area || '—')}</td><td>${escapeHtml(row.fuel_label)}</td><td class="num">${fmtNum(row.quantity, 2)} ${escapeHtml(row.quantity_unit)}</td><td class="num">${fmtTon(row.co2e_kg)}</td><td>${escapeHtml(row.invoice_number || '—')}</td></tr>`
    if (kind === 'MOBILE') return `<tr><td>${fmtDate(row.record_date)}</td><td>${escapeHtml(row.plate || '—')}</td><td>${escapeHtml(row.fuel_label)}</td><td class="num">${fmtNum(row.quantity, 2)} ${escapeHtml(row.quantity_unit || '')}</td><td class="num">${fmtTon(row.co2e_kg)}</td><td>${escapeHtml(row.invoice_number || '—')}</td></tr>`
    return `<tr><td>${fmtDate(row.billing_end)}</td><td>${escapeHtml(row.meter_code || '—')}</td><td>Energía eléctrica</td><td class="num">${fmtNum(row.kwh, 1)} kWh</td><td class="num">${fmtTon(row.co2e_kg)}</td><td>${escapeHtml(row.invoice_number || '—')}</td></tr>`
  }).join('')
}

export function renderCarbonReportHtmlV2({
  organizationName, profile, periodLabel, dateFrom, dateTo, generatedAt, verificationCode,
  totals, target, stationaryRecords, mobileRecords, electricityRecords, fuels, electricityFactor, biofuelBlend,
}) {
  const { stationaryKg, mobileKg, electricityKg, totalKg, scope1Kg, scope2Kg } = totals
  const scope1Percent = totalKg ? (scope1Kg / totalKg) * 100 : 0
  const scope2Percent = totalKg ? (scope2Kg / totalKg) * 100 : 0
  const maxSourceTon = Math.max(stationaryKg, mobileKg, electricityKg, 1) / 1000

  const targetTon = target ? Number(target.base_value_kgco2e) / 1000 * (1 - Number(target.target_reduction_percent) / 100) : null
  const baselineTon = target ? Number(target.base_value_kgco2e) / 1000 : null
  const totalTon = totalKg / 1000
  const complianceLabel = target ? (totalTon <= targetTon ? 'Cumple la meta' : 'No cumple la meta') : 'Sin meta configurada'

  const monthly = new Map()
  const ensure = key => { if (!monthly.has(key)) monthly.set(key, { stationary: 0, mobile: 0, electricity: 0 }); return monthly.get(key) }
  const monthKey = date => new Date(date).toISOString().slice(0, 7)
  stationaryRecords.forEach(row => { ensure(monthKey(row.record_date)).stationary += Number(row.co2e_kg) })
  mobileRecords.forEach(row => { ensure(monthKey(row.record_date)).mobile += Number(row.co2e_kg) })
  electricityRecords.forEach(row => { ensure(monthKey(row.billing_end)).electricity += Number(row.co2e_kg) })
  const monthKeys = [...monthly.keys()].sort()
  const monthlyRows = monthKeys.map(key => {
    const bucket = monthly.get(key)
    const monthTotal = bucket.stationary + bucket.mobile + bucket.electricity
    return `<tr><td>${key}</td><td class="num">${fmtTon(bucket.stationary)}</td><td class="num">${fmtTon(bucket.mobile)}</td><td class="num">${fmtTon(bucket.electricity)}</td><td class="num"><b>${fmtTon(monthTotal)}</b></td></tr>`
  }).join('') || '<tr><td colspan="5" class="empty">Sin datos mensuales en el periodo</td></tr>'

  const missingMonths = (() => {
    if (!dateFrom || !dateTo) return []
    const start = new Date(dateFrom), end = new Date(dateTo)
    const expected = []
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
    while (cursor <= end) { expected.push(cursor.toISOString().slice(0, 7)); cursor.setUTCMonth(cursor.getUTCMonth() + 1) }
    return expected.filter(key => !monthKeys.includes(key))
  })()

  const activeFuels = fuels.filter(fuel => fuel.applicable_stationary || fuel.applicable_mobile)
  const fuelFactorRows = activeFuels.map(fuel => `
    <tr><td>${escapeHtml(fuel.label)}</td><td>${escapeHtml(fuel.native_unit)}</td>
      <td class="num">${fuel.density_kg_per_unit != null ? fmtNum(fuel.density_kg_per_unit, 3) : '—'}</td>
      <td class="num">${fmtNum(fuel.heating_value_mj_per_kg, 2)}</td>
      <td class="num">${fuel.fe_stationary_co2_g_mj != null ? fmtNum(fuel.fe_stationary_co2_g_mj, 3) : '—'}</td>
      <td class="num">${fuel.fe_mobile_co2_g_mj != null ? fmtNum(fuel.fe_mobile_co2_g_mj, 3) : '—'}</td>
      <td>${escapeHtml(fuel.factor_source)}</td></tr>`).join('')

  const recordCount = stationaryRecords.length + mobileRecords.length + electricityRecords.length
  const evidenceCount = 0 // el conteo de evidencia se muestra en pantalla (Inventario); el informe no adjunta archivos

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Informe de Huella de Carbono</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; color: ${PALETTE.ink}; font-size: 10.5px; margin: 0; }
  h1 { font-size: 22px; margin: 0 0 4px; color: ${PALETTE.navy}; }
  h2 { font-size: 12.5px; margin: 20px 0 8px; color: ${PALETTE.greenDark}; text-transform: uppercase; letter-spacing: .05em; border-bottom: 2px solid ${PALETTE.green}; padding-bottom: 4px; break-after: avoid; }
  h3 { font-size: 11px; margin: 12px 0 6px; color: ${PALETTE.navy}; }
  section { break-inside: avoid-page; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th, td { border: 1px solid #d8dfe8; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: ${PALETTE.bg}; font-size: 9px; text-transform: uppercase; color: ${PALETTE.muted}; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.empty { text-align: center; color: ${PALETTE.muted}; font-style: italic; }
  .cover { text-align: center; padding: 60px 20px 30px; border-bottom: 4px solid ${PALETTE.green}; margin-bottom: 24px; }
  .cover .badge { display: inline-block; padding: 4px 14px; border-radius: 999px; background: ${PALETTE.navy}; color: #fff; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 14px; }
  .cover h1 { font-size: 30px; }
  .cover .sub { color: ${PALETTE.muted}; font-size: 13px; margin-top: 6px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; }
  .grid2 div { padding: 2px 0; }
  .grid2 b { display: inline-block; min-width: 150px; color: ${PALETTE.muted}; font-weight: 700; }
  .kpi-row { display: flex; gap: 12px; margin: 10px 0 18px; }
  .kpi-card { flex: 1; border: 1px solid #d8dfe8; border-radius: 10px; padding: 12px 14px; background: linear-gradient(135deg, #ffffff, ${PALETTE.bg}); }
  .kpi-card span { display: block; font-size: 9px; color: ${PALETTE.muted}; text-transform: uppercase; letter-spacing: .04em; }
  .kpi-card strong { display: block; font-size: 19px; margin-top: 4px; color: ${PALETTE.navy}; }
  .kpi-card.total strong { color: ${PALETTE.green}; }
  .donut-row { display: flex; align-items: center; gap: 20px; margin: 10px 0; }
  .legend-item { display: flex; align-items: center; gap: 8px; font-size: 10.5px; margin-bottom: 4px; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
  .bar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .bar-label { width: 150px; font-size: 10px; color: ${PALETTE.muted}; }
  .bar-track { flex: 1; height: 12px; background: ${PALETTE.bg}; border-radius: 999px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 999px; }
  .bar-value { width: 80px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; }
  .compliance-badge { display: inline-block; padding: 5px 14px; border-radius: 999px; font-weight: 700; font-size: 11px; }
  .compliance-badge.ok { background: #e8f7f1; color: ${PALETTE.greenDark}; }
  .compliance-badge.bad { background: #fdecec; color: ${PALETTE.error}; }
  .compliance-badge.na { background: ${PALETTE.bg}; color: ${PALETTE.muted}; }
  .note { font-size: 9.5px; color: ${PALETTE.muted}; margin-top: 4px; }
  .signature-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 30px; }
  .signature-box { border-top: 1px solid ${PALETTE.ink}; padding-top: 6px; font-size: 9.5px; text-align: center; color: ${PALETTE.muted}; }
  .verification { margin-top: 24px; padding: 12px 14px; border: 1px dashed ${PALETTE.green}; border-radius: 8px; background: #f3fbf8; font-size: 9.5px; }
  .exclusion-list { columns: 2; font-size: 9.5px; color: ${PALETTE.muted}; }
  .exclusion-list li { margin-bottom: 3px; }
</style>
</head>
<body>

<!-- 1. Portada -->
<div class="cover">
  <div class="badge">Huella de Carbono Institucional</div>
  <h1>${escapeHtml(organizationName)}</h1>
  <div class="sub">Informe correspondiente a ${escapeHtml(periodLabel)}</div>
  <div class="sub">${fmtDate(dateFrom)} — ${fmtDate(dateTo)}</div>
</div>

<!-- 2. Establecimiento -->
<section>
<h2>2. Datos del establecimiento</h2>
<div class="grid2">
  <div><b>Establecimiento</b>${escapeHtml(profile?.establishment_name || organizationName)}</div>
  <div><b>Tipo</b>${escapeHtml(profile?.establishment_type || '—')}</div>
  <div><b>Departamento</b>${escapeHtml(profile?.department || '—')}</div>
  <div><b>Ciudad</b>${escapeHtml(profile?.city || '—')}</div>
  <div><b>Dirección</b>${escapeHtml(profile?.address || '—')}</div>
  <div><b>En funcionamiento desde</b>${profile?.start_year || '—'}</div>
  <div><b>Empleados de tiempo completo</b>${profile?.fulltime_employees ?? '—'}</div>
  <div><b>Pacientes atendidos (año)</b>${profile?.patients_per_year ? Number(profile.patients_per_year).toLocaleString('es-CO') : '—'}</div>
  <div><b>Promedio de camas ocupadas</b>${profile?.avg_occupied_beds ?? '—'}</div>
  <div><b>Superficie construida</b>${profile?.built_area_m2 ? `${profile.built_area_m2} m²` : '—'}</div>
</div>
</section>

<!-- 3. Periodo -->
<section>
<h2>3. Periodo del informe</h2>
<div class="grid2">
  <div><b>Periodo</b>${escapeHtml(periodLabel)}</div>
  <div><b>Rango de fechas</b>${fmtDate(dateFrom)} — ${fmtDate(dateTo)}</div>
  <div><b>Registros validados incluidos</b>${recordCount}</div>
  <div><b>Meses sin datos en el periodo</b>${missingMonths.length ? escapeHtml(missingMonths.join(', ')) : 'Ninguno'}</div>
</div>
</section>

<!-- 4. Límites organizacionales -->
<section>
<h2>4. Límites organizacionales</h2>
<p>${escapeHtml(profile?.organizational_boundary || 'No se ha definido un límite organizacional en la Configuración del inventario.')}</p>
</section>

<!-- 5. Metodología -->
<section>
<h2>5. Metodología</h2>
<p>Estimación basada en el método <b>IPCC 2006 Guidelines (Tier 1)</b> — la misma metodología de la
<i>Herramienta de monitoreo del impacto climático para establecimientos de salud</i> (Salud sin Daño / Global Green
and Healthy Hospitals). El potencial de calentamiento global usado es <b>IPCC AR4, horizonte de 100 años</b>
(CH4 = 25, N2O = 298). El factor de la red eléctrica colombiana corresponde al Sistema Interconectado Nacional (UPME/XM).</p>
<p><b>Alcance estricto de esta medición</b> — solo se estiman y suman las siguientes 3 fuentes:</p>
<ul class="exclusion-list">
  <li>Alcance 1 — Combustión estacionaria</li>
  <li>Alcance 1 — Combustión móvil</li>
  <li>Alcance 2 — Energía eléctrica comprada</li>
</ul>
<p class="note">Quedan explícitamente fuera de esta medición (no estimadas / no ocurren, según el criterio institucional
vigente): emisiones fugitivas de refrigerantes, gases medicinales y anestésicos, compra de vapor/calor/refrigeración,
residuos, y la totalidad del Alcance 3 (viajes de trabajo, traslados del personal, desplazamiento de pacientes,
cadena de suministro). Ninguna de estas categorías se incluye en el total de este informe.</p>
</section>

<!-- 6. Resumen ejecutivo -->
<section>
<h2>6. Resumen ejecutivo</h2>
<div class="kpi-row">
  <div class="kpi-card total"><span>Huella total</span><strong>${fmtTon(totalKg)}</strong></div>
  <div class="kpi-card"><span>Alcance 1</span><strong>${fmtTon(scope1Kg)}</strong></div>
  <div class="kpi-card"><span>Alcance 2</span><strong>${fmtTon(scope2Kg)}</strong></div>
  <div class="kpi-card"><span>Cumplimiento de meta</span><strong style="font-size:13px">${escapeHtml(complianceLabel)}</strong></div>
</div>
</section>

<!-- 7. Huella total / 8-9. Alcance 1 y 2 -->
<section>
<h2>7-9. Huella total y desglose por alcance</h2>
<div class="donut-row">
  ${donutSvg(scope1Percent, scope2Percent)}
  <div>
    <div class="legend-item"><span class="legend-dot" style="background:${PALETTE.scope1}"></span> Alcance 1 (estacionaria + móvil) — ${fmtTon(scope1Kg)} · ${fmtPercent(scope1Percent)}</div>
    <div class="legend-item"><span class="legend-dot" style="background:${PALETTE.scope2}"></span> Alcance 2 (electricidad) — ${fmtTon(scope2Kg)} · ${fmtPercent(scope2Percent)}</div>
  </div>
</div>
</section>

<!-- 10. Resultados por fuente -->
<section>
<h2>10. Resultados por fuente</h2>
${barRow('Combustión estacionaria', stationaryKg / 1000, maxSourceTon, PALETTE.scope1)}
${barRow('Combustión móvil', mobileKg / 1000, maxSourceTon, PALETTE.purple)}
${barRow('Energía eléctrica', electricityKg / 1000, maxSourceTon, PALETTE.scope2)}
<table>
  <thead><tr><th>Fuente</th><th>Alcance</th><th class="num">tCO2e</th><th class="num">% del total</th></tr></thead>
  <tbody>
    <tr><td>Combustión estacionaria</td><td>Alcance 1</td><td class="num">${fmtTon(stationaryKg)}</td><td class="num">${fmtPercent(totalKg ? stationaryKg / totalKg * 100 : 0)}</td></tr>
    <tr><td>Combustión móvil</td><td>Alcance 1</td><td class="num">${fmtTon(mobileKg)}</td><td class="num">${fmtPercent(totalKg ? mobileKg / totalKg * 100 : 0)}</td></tr>
    <tr><td>Energía eléctrica</td><td>Alcance 2</td><td class="num">${fmtTon(electricityKg)}</td><td class="num">${fmtPercent(totalKg ? electricityKg / totalKg * 100 : 0)}</td></tr>
    <tr><td><b>Total</b></td><td>—</td><td class="num"><b>${fmtTon(totalKg)}</b></td><td class="num"><b>100%</b></td></tr>
  </tbody>
</table>
</section>

<!-- 11-12. Gráficos y evolución temporal -->
<section>
<h2>11-12. Evolución temporal</h2>
<table>
  <thead><tr><th>Mes</th><th class="num">Estacionaria</th><th class="num">Móvil</th><th class="num">Electricidad</th><th class="num">Total</th></tr></thead>
  <tbody>${monthlyRows}</tbody>
</table>
</section>

<!-- 13. Datos de actividad -->
<section>
<h2>13.1 Datos de actividad — Combustión estacionaria</h2>
<table><thead><tr><th>Fecha</th><th>Área</th><th>Combustible</th><th class="num">Cantidad</th><th class="num">tCO2e</th><th>Factura</th></tr></thead>
<tbody>${recordRows(stationaryRecords, 'STATIONARY')}</tbody></table>
</section>
<section>
<h2>13.2 Datos de actividad — Combustión móvil</h2>
<table><thead><tr><th>Fecha</th><th>Placa</th><th>Combustible</th><th class="num">Cantidad</th><th class="num">tCO2e</th><th>Factura</th></tr></thead>
<tbody>${recordRows(mobileRecords, 'MOBILE')}</tbody></table>
</section>
<section>
<h2>13.3 Datos de actividad — Energía eléctrica</h2>
<table><thead><tr><th>Facturación hasta</th><th>Medidor</th><th>Fuente</th><th class="num">kWh</th><th class="num">tCO2e</th><th>Factura</th></tr></thead>
<tbody>${recordRows(electricityRecords, 'ELECTRICITY')}</tbody></table>
</section>

<!-- 14-15. Factores y versiones -->
<section>
<h2>14-15. Factores de emisión utilizados y su versión</h2>
<table>
  <thead><tr><th>Combustible</th><th>Unidad</th><th class="num">Densidad kg/u</th><th class="num">PC MJ/kg</th><th class="num">FE CO2 estac. g/MJ</th><th class="num">FE CO2 móvil g/MJ</th><th>Fuente</th></tr></thead>
  <tbody>${fuelFactorRows}</tbody>
</table>
<div class="grid2">
  <div><b>Factor eléctrico vigente</b>${electricityFactor ? `${fmtNum(electricityFactor.value_kgco2e_per_kwh, 3)} kgCO2e/kWh (${escapeHtml(electricityFactor.label)})` : 'No configurado'}</div>
  <div><b>Fuente del factor eléctrico</b>${escapeHtml(electricityFactor?.source || '—')}</div>
  <div><b>Corte de biodiésel vigente</b>${biofuelBlend ? fmtPercent(biofuelBlend.biodiesel_percent, 0) : '—'}</div>
  <div><b>Corte de bioetanol vigente</b>${biofuelBlend ? fmtPercent(biofuelBlend.bioethanol_percent, 0) : '—'}</div>
</div>
<p class="note">Potencial de calentamiento global (IPCC AR4, 100 años): CO2 = 1, CH4 = 25, N2O = 298.</p>
</section>

<!-- 16-17. Indicador y meta -->
<section>
<h2>16-17. Indicador institucional y cumplimiento de meta</h2>
<div class="grid2">
  <div><b>Indicador</b>Huella de carbono institucional</div>
  <div><b>Resultado del periodo</b>${fmtTon(totalKg)}</div>
  <div><b>Línea base</b>${baselineTon != null ? `${fmtNum(baselineTon, 3)} t (año ${target.base_year})` : 'Sin meta configurada'}</div>
  <div><b>Meta</b>${targetTon != null ? `${fmtNum(targetTon, 3)} t (${fmtPercent(target.target_reduction_percent, 0)} de reducción, año ${target.target_year})` : '—'}</div>
  <div><b>Variación vs. línea base</b>${baselineTon ? fmtPercent(((totalTon - baselineTon) / baselineTon) * 100) : '—'}</div>
  <div><b>Estado</b><span class="compliance-badge ${target ? (totalTon <= targetTon ? 'ok' : 'bad') : 'na'}">${escapeHtml(complianceLabel)}</span></div>
</div>
</section>

<!-- 18. Calidad y completitud de datos -->
<section>
<h2>18. Calidad y completitud de los datos</h2>
<div class="grid2">
  <div><b>Registros validados</b>${recordCount}</div>
  <div><b>Meses sin ningún registro</b>${missingMonths.length}</div>
</div>
${missingMonths.length ? `<p class="note">Meses sin datos: ${escapeHtml(missingMonths.join(', '))}. El resultado del periodo puede estar subestimado si en esos meses hubo consumo real no registrado.</p>` : '<p class="note">No se detectaron meses sin registros dentro del periodo.</p>'}
</section>

<!-- 19. Observaciones -->
<section>
<h2>19. Observaciones</h2>
<p class="note">Este informe solo incluye registros en estado <b>Validado</b>. Los registros en borrador, pendientes de
revisión o rechazados no se incluyen en el total, para que el número reportado corresponda siempre a datos revisados.</p>
</section>

<!-- 20. Responsables -->
<section>
<h2>20. Responsables</h2>
<div class="signature-row">
  <div class="signature-box">Elaboró</div>
  <div class="signature-box">Revisó</div>
  <div class="signature-box">Aprobó</div>
</div>
</section>

<!-- 21-22. Generación y verificación -->
<div class="verification">
  <b>21. Generado el:</b> ${fmtDateTime(generatedAt)} &nbsp;·&nbsp;
  <b>22. Código único de verificación:</b> ${escapeHtml(verificationCode)}
</div>

</body>
</html>`
}
