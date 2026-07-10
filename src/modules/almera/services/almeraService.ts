import type { AlmeraRecord } from '../types'

const records: AlmeraRecord[] = [
  {
    id: 'ALM-2026-014',
    request: 'Solicitud documental de procesos misionales',
    process: 'Gestion documental',
    document: 'Manual de procesos institucionales',
    activity: 'Revision y actualizacion de version vigente',
    evidence: 'Acta tecnica y matriz de cambios',
    report: 'Seguimiento mensual ALMERA',
    status: 'IN_REVIEW',
    managementType: 'ACTUALIZACION',
    responsible: 'Gestor ALMERA',
    registeredAt: '2026-07-08',
    observations: 'Pendiente validacion final por administrador de entidad.',
  },
  {
    id: 'ALM-2026-013',
    request: 'Acompanamiento a cargue de soportes',
    process: 'Calidad',
    document: 'Evidencias PAMEC',
    activity: 'Capacitacion operativa a lideres de proceso',
    evidence: 'Listado de asistencia y capturas',
    report: 'Informe de acompanamiento',
    status: 'APPROVED',
    managementType: 'CAPACITACION',
    responsible: 'Coordinacion ALMERA',
    registeredAt: '2026-07-04',
    closedAt: '2026-07-05',
    observations: 'Actividad cerrada con soportes completos.',
  },
  {
    id: 'ALM-2026-012',
    request: 'Correccion de documento devuelto',
    process: 'Atencion al usuario',
    document: 'Procedimiento SIAU',
    activity: 'Ajuste de observaciones y control de version',
    evidence: 'Documento ajustado',
    report: 'Bitacora de revision',
    status: 'RETURNED',
    managementType: 'MODIFICACION',
    responsible: 'Administrador entidad',
    registeredAt: '2026-06-29',
    observations: 'Requiere ampliar observaciones de aprobacion.',
  },
]

export async function listAlmeraRecords() {
  return records
}
