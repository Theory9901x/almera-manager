export const PERMISSIONS = [
  'users.view',
  'users.create',
  'users.edit',
  'users.disable',
  'roles.assign',
  'dashboard.view',
  'almera.view',
  'almera.create',
  'almera.edit',
  'almera.delete',
  'almera.export',
  'admin.view',
  'settings.edit',
] as const

export type PermissionKey = typeof PERMISSIONS[number]

export const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: 'Superadministrador',
  ADMIN_ENTIDAD: 'Administrador de entidad',
  GESTOR_ALMERA: 'Gestor ALMERA',
  CONSULTA: 'Consulta',
}

export const MODULE_GROUPS = {
  operations: 'Operacion institucional',
  governance: 'Administracion',
}
