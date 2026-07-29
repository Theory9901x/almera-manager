import { Router } from 'express'
import { query } from '../db.mjs'

/**
 * Directorio TRANSVERSAL de planes de mejora.
 *
 * Cada modulo tiene su propio circuito y su propio modelo, y asi se quedan: esto NO los sustituye
 * ni los modifica, solo los LEE y los presenta en una sola base de datos categorizada por modulo.
 * El objetivo es no mezclarlos — un plan de una matriz de adherencia y una no conformidad de una
 * lista de chequeo se atienden distinto, y verlos revueltos en una lista plana es como se pierde
 * la trazabilidad de quien responde por cada cosa.
 *
 * De Listas de Chequeo solo se lee. Su flujo (NC -> plan -> evidencia -> cierre) vive en su
 * modulo y no se toca desde aqui.
 *
 * El `code` se DERIVA en la consulta (`ADH-000012`, `LCH-000045`): asi hay un identificador
 * citable sin anadir una columna a las tablas de cada modulo.
 *
 * FILTROS Y PAGINACION EN SQL. Los dos modulos tienen columnas distintas, asi que la tentacion es
 * traerlo todo y filtrar en Node; con eso, una entidad con miles de planes se trae miles de filas
 * en cada carga de la pagina. Cada fuente filtra y cuenta en su propia consulta, y Node solo
 * mezcla la pagina.
 */
export const plansRouter = Router()

const SOURCES = {
  'adherence-matrix': { key: 'MATRIZ', label: 'Matriz de adherencia' },
  checklists: { key: 'LISTA', label: 'Lista de chequeo' },
}

/**
 * Estado normalizado, para poder filtrar los dos modulos con un mismo control. Cada modulo
 * conserva su etiqueta propia (`statusLabel`), que es la que su gente reconoce; el color y el
 * filtro salen del estado normalizado.
 *
 * `POR_VERIFICAR` solo existe en Listas: en Matrices no hay un paso de «lo hice, revisalo».
 */
const ADHERENCE_STATUS = {
  NO_INICIADO: { normalized: 'PENDIENTE', label: 'No iniciado' },
  EN_EJECUCION: { normalized: 'EN_PROCESO', label: 'En ejecución' },
  TERMINADO: { normalized: 'CERRADO', label: 'Terminado' },
}
const CHECKLIST_STATUS = {
  ABIERTO: { normalized: 'PENDIENTE', label: 'Abierto' },
  EN_PROCESO: { normalized: 'EN_PROCESO', label: 'En proceso' },
  SUBSANADO: { normalized: 'POR_VERIFICAR', label: 'Subsanado' },
  CERRADO: { normalized: 'CERRADO', label: 'Cerrado' },
}

/** Estados propios de cada modulo que corresponden a un estado normalizado. */
const ownStatuses = (map, normalized) =>
  Object.entries(map).filter(([, value]) => value.normalized === normalized).map(([key]) => key)

const NORMALIZED_STATUSES = ['PENDIENTE', 'EN_PROCESO', 'POR_VERIFICAR', 'CERRADO']
const MODULE_ORDER = ['adherence-matrix', 'checklists']
const PAGE_SIZES = [25, 50, 100]

const has = (request, key) => (request.auth?.modules || []).some(module => module.key === key)
const can = (request, ...permissions) => permissions.some(permission => request.auth.permissions.includes(permission))

/**
 * Fabrica el `WHERE` comun a la consulta de filas y a la de conteos.
 * Devuelve el fragmento y los parametros, para que las dos usen exactamente el mismo criterio: si
 * divergen, el contador dice 40 y la tabla muestra 12.
 */
function buildFilter({ organizationId, ownFilterColumn, ownFilterValue, statusColumn, statuses, searchColumns, search }) {
  const params = [organizationId]
  const clauses = []
  if (ownFilterColumn && ownFilterValue !== undefined) {
    params.push(ownFilterValue)
    clauses.push(`${ownFilterColumn} = $${params.length}`)
  }
  if (statuses) {
    // Lista vacia = ese estado no existe en este modulo. `FALSE` devuelve cero filas, que es lo
    // correcto: filtrar por «Por verificar» no debe traer planes de Matrices.
    if (!statuses.length) clauses.push('FALSE')
    else {
      params.push(statuses)
      clauses.push(`${statusColumn} = ANY($${params.length})`)
    }
  }
  if (search) {
    params.push(`%${search}%`)
    const index = params.length
    clauses.push(`(${searchColumns.map(column => `${column} ILIKE $${index}`).join(' OR ')})`)
  }
  return { where: clauses.length ? `AND ${clauses.join(' AND ')}` : '', params }
}

/** El id del profesional vinculado a esta sesion, o `null` si la cuenta no esta vinculada. */
async function ownProfessionalId(request, organizationId) {
  const own = await query(
    'SELECT id FROM adherence_professionals WHERE membership_id = $1 AND organization_id = $2',
    [request.auth.membershipId, organizationId],
  )
  return own.rows[0]?.id ?? null
}

/* ---------------------------------------------------------------- Matrices de Adherencia */

const ADHERENCE_SEARCH = ["('ADH-' || lpad(pl.id::text, 6, '0'))", 'p.full_name', 'pl.description', 'a.name', 'e.month_reported', 'e.service', 'e.city_site']

async function adherenceFilter(request, organizationId, options) {
  const onlyOwn = !can(request, 'adherence_matrix.view', 'adherence_matrix.manage', 'adherence_matrix.evaluate')
  let ownFilterValue
  if (onlyOwn) {
    ownFilterValue = await ownProfessionalId(request, organizationId)
    if (ownFilterValue === null) return null
  }
  return buildFilter({
    organizationId,
    ownFilterColumn: onlyOwn ? 'pl.professional_id' : null,
    ownFilterValue,
    statusColumn: 'pl.status',
    statuses: options.status ? ownStatuses(ADHERENCE_STATUS, options.status) : null,
    searchColumns: ADHERENCE_SEARCH,
    search: options.search,
  })
}

function mapAdherenceRow(row) {
  const status = ADHERENCE_STATUS[row.status] || { normalized: 'PENDIENTE', label: row.status }
  return {
    id: String(row.id),
    code: row.code,
    moduleKey: 'adherence-matrix',
    moduleLabel: 'Matrices de Adherencia',
    source: SOURCES['adherence-matrix'].key,
    sourceLabel: SOURCES['adherence-matrix'].label,
    instrumentName: row.instrument_name,
    subjectName: row.subject_name,
    subjectDocument: row.subject_document || '',
    description: row.description,
    responsibleName: row.subject_name,
    status: row.status,
    statusLabel: status.label,
    normalizedStatus: status.normalized,
    progressPercent: Number(row.progress_percent),
    plannedStartDate: row.planned_start_date,
    plannedEndDate: row.planned_end_date,
    closedAt: row.actual_end_date,
    createdAt: row.created_at,
    createdByName: row.created_by_name,
    period: row.month_reported,
    referenceDate: row.evaluation_date,
    center: row.city_site || '',
    service: row.service || '',
    // A donde se va a atenderlo: cada modulo sigue siendo el dueno de su flujo.
    href: `/app/adherencia/operacion?evaluacion=${row.evaluation_id}`,
  }
}

const ADHERENCE_FROM = `
  FROM adherence_improvement_plans pl
  JOIN adherence_professionals p ON p.id = pl.professional_id
  JOIN adherence_areas a ON a.id = p.area_id
  JOIN adherence_evaluations e ON e.id = pl.evaluation_id
  JOIN users u ON u.id = pl.created_by_id
  WHERE pl.organization_id = $1`

/* ---------------------------------------------------------------- Listas de Chequeo (solo lectura) */

const CHECKLIST_SEARCH = ["('LCH-' || lpad(p.id::text, 6, '0'))", 'p.finding', 'p.criterion_text', 'p.subject_name', 'p.assigned_name', 't.name', 't.code', 'ar.name', 'ar.center']

async function checklistFilter(request, organizationId, options) {
  const onlyOwn = !can(request, 'checklists.view', 'checklists.manage')
  return buildFilter({
    organizationId,
    ownFilterColumn: onlyOwn ? 'p.assigned_membership_id' : null,
    ownFilterValue: onlyOwn ? request.auth.membershipId : undefined,
    statusColumn: 'p.status',
    statuses: options.status ? ownStatuses(CHECKLIST_STATUS, options.status) : null,
    searchColumns: CHECKLIST_SEARCH,
    search: options.search,
  })
}

function mapChecklistRow(row) {
  const status = CHECKLIST_STATUS[row.status] || { normalized: 'PENDIENTE', label: row.status }
  return {
    id: String(row.id),
    code: row.code,
    moduleKey: 'checklists',
    moduleLabel: 'Listas de Chequeo',
    source: SOURCES.checklists.key,
    sourceLabel: SOURCES.checklists.label,
    instrumentName: row.instrument_code ? `${row.instrument_code} · ${row.instrument_name}` : row.instrument_name,
    subjectName: row.subject_name || '—',
    subjectDocument: '',
    // El hallazgo es lo que hay que arreglar; el criterio es de donde salio.
    description: row.finding || row.criterion_text,
    criterionText: row.criterion_text,
    domainName: row.domain_name,
    itemNumber: row.item_number,
    responsibleName: row.assigned_name || 'Sin responsable',
    status: row.status,
    statusLabel: status.label,
    normalizedStatus: status.normalized,
    progressPercent: null,
    plannedStartDate: null,
    plannedEndDate: null,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    createdByName: row.created_by_name,
    period: null,
    referenceDate: row.audit_date,
    center: row.area_center || '',
    service: row.area_name || '',
    href: '/app/listas-chequeo/planes',
  }
}

const CHECKLIST_FROM = `
  FROM checklist_action_plans p
  JOIN checklist_audits a ON a.id = p.audit_id
  JOIN checklist_templates t ON t.id = a.template_id
  LEFT JOIN checklist_areas ar ON ar.id = a.area_id
  JOIN users u ON u.id = p.created_by_id
  WHERE p.organization_id = $1`

/* ---------------------------------------------------------------- Fuentes */

/**
 * Descriptor de cada fuente: como se filtra, como se cuenta y como se lee una pagina.
 * Tenerlas descritas igual permite que el handler no sepa de que modulo viene cada fila.
 */
const SOURCE_DEFS = {
  'adherence-matrix': {
    label: 'Matrices de Adherencia',
    buildFilter: adherenceFilter,
    statusMap: ADHERENCE_STATUS,
    statusColumn: 'pl.status',
    from: ADHERENCE_FROM,
    orderBy: 'pl.created_at DESC, pl.id DESC',
    select: `SELECT pl.id, 'ADH-' || lpad(pl.id::text, 6, '0') AS code, pl.status, pl.description,
                    pl.progress_percent, pl.planned_start_date, pl.planned_end_date, pl.actual_end_date,
                    pl.created_at, pl.evaluation_id,
                    p.full_name AS subject_name, p.document_id AS subject_document,
                    a.name AS instrument_name,
                    e.month_reported, e.evaluation_date, e.service, e.city_site,
                    u.full_name AS created_by_name`,
    map: mapAdherenceRow,
  },
  checklists: {
    label: 'Listas de Chequeo',
    buildFilter: checklistFilter,
    statusMap: CHECKLIST_STATUS,
    statusColumn: 'p.status',
    from: CHECKLIST_FROM,
    orderBy: 'p.created_at DESC, p.id DESC',
    select: `SELECT p.id, 'LCH-' || lpad(p.id::text, 6, '0') AS code, p.status, p.finding,
                    p.criterion_text, p.domain_name, p.item_number, p.subject_name, p.assigned_name,
                    p.created_at, p.closed_at, p.audit_id,
                    t.name AS instrument_name, t.code AS instrument_code,
                    a.audit_date, ar.name AS area_name, ar.center AS area_center,
                    u.full_name AS created_by_name`,
    map: mapChecklistRow,
  },
}

/** Conteo por estado normalizado de un modulo, SIN los filtros de la vista. */
async function loadSummary(request, organizationId, moduleKey) {
  const def = SOURCE_DEFS[moduleKey]
  const filter = await def.buildFilter(request, organizationId, {})
  const base = { moduleKey, moduleLabel: def.label, total: 0, pendientes: 0, enProceso: 0, porVerificar: 0, cerrados: 0 }
  if (!filter) return base
  const result = await query(
    `SELECT ${def.statusColumn} AS status, COUNT(*)::int AS n ${def.from} ${filter.where} GROUP BY 1`,
    filter.params,
  )
  const bucket = { PENDIENTE: 'pendientes', EN_PROCESO: 'enProceso', POR_VERIFICAR: 'porVerificar', CERRADO: 'cerrados' }
  for (const row of result.rows) {
    const normalized = def.statusMap[row.status]?.normalized || 'PENDIENTE'
    base[bucket[normalized]] += row.n
    base.total += row.n
  }
  return base
}

plansRouter.get('/', async (request, response, next) => {
  try {
    const organizationId = request.auth.organization.id
    // Solo los modulos que esta persona tiene: si no tiene Listas, sus planes ni se consultan.
    const available = MODULE_ORDER.filter(key => has(request, key))

    const moduleFilter = available.includes(String(request.query.module)) ? String(request.query.module) : ''
    const statusFilter = NORMALIZED_STATUSES.includes(String(request.query.status)) ? String(request.query.status) : ''
    const search = String(request.query.search || '').trim().slice(0, 120)
    const pageSize = PAGE_SIZES.includes(Number(request.query.pageSize)) ? Number(request.query.pageSize) : 25

    // El resumen cuenta SIEMPRE sobre el total de cada modulo, sin los filtros de la vista: son
    // las tarjetas con las que se navega, y si cambiaran al filtrar dejarian de ser referencia.
    const summary = await Promise.all(available.map(key => loadSummary(request, organizationId, key)))

    const active = moduleFilter ? [moduleFilter] : available
    const options = { status: statusFilter, search }
    const filters = {}
    const totals = {}
    for (const key of active) {
      const def = SOURCE_DEFS[key]
      const filter = await def.buildFilter(request, organizationId, options)
      filters[key] = filter
      if (!filter) { totals[key] = 0; continue }
      const count = await query(`SELECT COUNT(*)::int AS n ${def.from} ${filter.where}`, filter.params)
      totals[key] = count.rows[0].n
    }

    const total = active.reduce((sum, key) => sum + totals[key], 0)
    const pages = Math.max(1, Math.ceil(total / pageSize))
    // La pagina se acota al rango real: si se filtra estando en la 7 y solo quedan 2, se devuelve
    // la ultima en vez de una lista vacia que parece «no hay nada».
    const page = Math.min(Math.max(1, Number(request.query.page) || 1), pages)

    // Ventana global sobre las fuentes concatenadas EN ORDEN DE MODULO: asi una pagina cae casi
    // siempre dentro de un solo modulo y no se mezclan, que es el punto del apartado. Cada fuente
    // recibe su propio OFFSET/LIMIT segun lo que le toque de la ventana.
    let from = (page - 1) * pageSize
    let remaining = pageSize
    let consumed = 0
    const rows = []
    for (const key of active) {
      const size = totals[key]
      if (remaining <= 0) break
      const startInSource = from - consumed
      consumed += size
      if (startInSource >= size) continue
      const offset = Math.max(0, startInSource)
      const limit = Math.min(remaining, size - offset)
      const def = SOURCE_DEFS[key]
      const filter = filters[key]
      const result = await query(
        `${def.select} ${def.from} ${filter.where} ORDER BY ${def.orderBy} LIMIT ${limit} OFFSET ${offset}`,
        filter.params,
      )
      rows.push(...result.rows.map(def.map))
      remaining -= result.rows.length
      from += result.rows.length
    }

    response.json({ rows, summary, total, page, pageSize, pages })
  } catch (error) { next(error) }
})
