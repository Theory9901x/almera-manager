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
 */
export const plansRouter = Router()

/** Origen: de que instrumento nace el plan. Es la segunda categoria que pidio el usuario. */
const SOURCES = {
  'adherence-matrix': { key: 'MATRIZ', label: 'Matriz de adherencia' },
  checklists: { key: 'LISTA', label: 'Lista de chequeo' },
}

/**
 * Estado normalizado, para poder filtrar los dos modulos con un mismo control. Cada modulo
 * conserva su etiqueta propia (`statusLabel`), que es la que su gente reconoce; el color y el
 * filtro salen del estado normalizado.
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

const has = (request, key) => (request.auth?.modules || []).some(module => module.key === key)
const can = (request, ...permissions) => permissions.some(permission => request.auth.permissions.includes(permission))

/** Planes de Matrices de Adherencia, normalizados. */
async function loadAdherencePlans(request, organizationId) {
  // Un profesional (own_plan sin permisos de auditor) solo ve los suyos.
  const onlyOwn = !can(request, 'adherence_matrix.view', 'adherence_matrix.manage', 'adherence_matrix.evaluate')
  const params = [organizationId]
  let ownFilter = ''
  if (onlyOwn) {
    const own = await query(
      'SELECT id FROM adherence_professionals WHERE membership_id = $1 AND organization_id = $2',
      [request.auth.membershipId, organizationId],
    )
    if (!own.rows[0]) return []
    params.push(own.rows[0].id)
    ownFilter = `AND pl.professional_id = $${params.length}`
  }
  const result = await query(
    `SELECT pl.id, pl.status, pl.description, pl.progress_percent,
            pl.planned_start_date, pl.planned_end_date, pl.actual_end_date, pl.created_at,
            pl.evaluation_id,
            p.full_name AS subject_name, p.document_id AS subject_document,
            a.name AS instrument_name,
            e.month_reported, e.evaluation_date, e.service, e.city_site,
            u.full_name AS created_by_name
     FROM adherence_improvement_plans pl
     JOIN adherence_professionals p ON p.id = pl.professional_id
     JOIN adherence_areas a ON a.id = p.area_id
     JOIN adherence_evaluations e ON e.id = pl.evaluation_id
     JOIN users u ON u.id = pl.created_by_id
     WHERE pl.organization_id = $1 ${ownFilter}
     ORDER BY pl.created_at DESC`,
    params,
  )
  return result.rows.map(row => {
    const status = ADHERENCE_STATUS[row.status] || { normalized: 'PENDIENTE', label: row.status }
    return {
      id: String(row.id),
      code: `ADH-${String(row.id).padStart(6, '0')}`,
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
  })
}

/** Planes de Listas de Chequeo. SOLO LECTURA: su circuito vive en su modulo. */
async function loadChecklistPlans(request, organizationId) {
  const onlyOwn = !can(request, 'checklists.view', 'checklists.manage')
  const params = [organizationId]
  let ownFilter = ''
  if (onlyOwn) {
    params.push(request.auth.membershipId)
    ownFilter = `AND p.assigned_membership_id = $${params.length}`
  }
  const result = await query(
    `SELECT p.id, p.status, p.finding, p.criterion_text, p.domain_name, p.item_number,
            p.subject_name, p.assigned_name, p.created_at, p.closed_at, p.audit_id,
            t.name AS instrument_name, t.code AS instrument_code,
            a.audit_date, ar.name AS area_name, ar.center AS area_center,
            u.full_name AS created_by_name
     FROM checklist_action_plans p
     JOIN checklist_audits a ON a.id = p.audit_id
     JOIN checklist_templates t ON t.id = a.template_id
     LEFT JOIN checklist_areas ar ON ar.id = a.area_id
     JOIN users u ON u.id = p.created_by_id
     WHERE p.organization_id = $1 ${ownFilter}
     ORDER BY p.created_at DESC`,
    params,
  )
  return result.rows.map(row => {
    const status = CHECKLIST_STATUS[row.status] || { normalized: 'PENDIENTE', label: row.status }
    return {
      id: String(row.id),
      code: `LCH-${String(row.id).padStart(6, '0')}`,
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
  })
}

plansRouter.get('/', async (request, response, next) => {
  try {
    const organizationId = request.auth.organization.id
    const groups = []
    // Solo los modulos que esta persona tiene: si no tiene Listas, sus planes ni se consultan.
    if (has(request, 'adherence-matrix')) {
      groups.push({ moduleKey: 'adherence-matrix', rows: await loadAdherencePlans(request, organizationId) })
    }
    if (has(request, 'checklists')) {
      groups.push({ moduleKey: 'checklists', rows: await loadChecklistPlans(request, organizationId) })
    }
    const rows = groups.flatMap(group => group.rows)
    const summary = groups.map(group => ({
      moduleKey: group.moduleKey,
      moduleLabel: group.rows[0]?.moduleLabel
        || (group.moduleKey === 'checklists' ? 'Listas de Chequeo' : 'Matrices de Adherencia'),
      total: group.rows.length,
      pendientes: group.rows.filter(row => row.normalizedStatus === 'PENDIENTE').length,
      enProceso: group.rows.filter(row => row.normalizedStatus === 'EN_PROCESO').length,
      porVerificar: group.rows.filter(row => row.normalizedStatus === 'POR_VERIFICAR').length,
      cerrados: group.rows.filter(row => row.normalizedStatus === 'CERRADO').length,
    }))
    response.json({ rows, summary })
  } catch (error) { next(error) }
})
