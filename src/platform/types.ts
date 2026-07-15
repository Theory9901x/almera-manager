export interface PlatformModule {
  id: string
  key: string
  name: string
  description: string
  route: string
  icon: string
  position: number
}

export interface SessionContext {
  membershipId: string
  user: { id: string; email: string; fullName: string }
  organization: { id: string; name: string; slug: string }
  role: { id: string; key: string; name: string }
  position: { id: string; name: string } | null
  permissions: string[]
  modules: PlatformModule[]
}

export interface AdminUser {
  id: string
  email: string
  full_name: string
  active: boolean
  last_login_at?: string
  membership_id: string
  membership_active: boolean
  role_id: string
  role_key: string
  role_name: string
  position_id: string | null
  position_name: string | null
}

export interface AdminRole {
  id: string
  key: string
  name: string
  description: string
  system: boolean
  user_count: number
}

export interface UserModuleGrant {
  module_id: string
  module_key: string
  module_name: string
  function_key: 'AUDITOR' | 'PROFESIONAL' | null
  area_id: string | null
  area_name: string | null
  auditor_areas: { id: string; name: string }[]
}

export interface Position { id: string; name: string }

export interface AdminModule extends PlatformModule { enabled: boolean }
export interface Permission { id: string; key: string; name: string; description: string }
export interface AdminOverview {
  users: AdminUser[]
  roles: AdminRole[]
  modules: AdminModule[]
  permissions: Permission[]
}
