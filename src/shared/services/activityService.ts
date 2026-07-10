export interface ActivityItem {
  id: string
  user: string
  action: string
  module: string
  date: string
  status: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'RETURNED' | 'CLOSED'
  description: string
}

export const recentActivities: ActivityItem[] = [
  {
    id: 'act-001',
    user: 'Coordinacion ALMERA',
    action: 'Registro de solicitud documental',
    module: 'Gestion ALMERA',
    date: '2026-07-10T08:20:00-05:00',
    status: 'IN_REVIEW',
    description: 'Revision de soportes para actualizacion documental institucional.',
  },
  {
    id: 'act-002',
    user: 'Administrador SGIMR',
    action: 'Asignacion de rol',
    module: 'Usuarios',
    date: '2026-07-09T16:35:00-05:00',
    status: 'APPROVED',
    description: 'Perfil gestor habilitado para operacion ALMERA.',
  },
  {
    id: 'act-003',
    user: 'Gestor ALMERA',
    action: 'Carga de evidencia',
    module: 'Gestion ALMERA',
    date: '2026-07-09T11:10:00-05:00',
    status: 'PENDING',
    description: 'Soporte pendiente por validacion administrativa.',
  },
]
