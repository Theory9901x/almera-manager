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
  user: { id: string; email: string; fullName: string }
  organization: { id: string; name: string; slug: string }
  role: { id: string; key: string; name: string }
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
  role_name: string
}

export interface AdminRole {
  id: string
  key: string
  name: string
  description: string
  system: boolean
  module_ids: string[]
  permission_ids: string[]
  user_count: number
}

export interface AdminModule extends PlatformModule { enabled: boolean }
export interface Permission { id: string; key: string; name: string; description: string }
export interface AdminOverview {
  users: AdminUser[]
  roles: AdminRole[]
  modules: AdminModule[]
  permissions: Permission[]
}
