import type { AdminOverview, Position, SessionContext, UserModuleGrant } from './types'

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(payload.error || 'No fue posible completar la solicitud', response.status)
  return payload as T
}

export const api = {
  login: (email: string, password: string, organization = 'sgimr') =>
    request<{ ok: true }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, organization }) }),
  me: () => request<SessionContext>('/auth/me'),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  adminOverview: () => request<AdminOverview>('/admin/overview'),
  createUser: (data: { fullName: string; email: string; password: string; roleId: string }) =>
    request('/admin/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (membershipId: string, data: { roleId: string; active: boolean; positionId?: string | null }) =>
    request(`/admin/users/${membershipId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  updateModule: (moduleId: string, enabled: boolean) =>
    request(`/admin/modules/${moduleId}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  userModules: (membershipId: string) => request<UserModuleGrant[]>(`/admin/users/${membershipId}/modules`),
  grantUserModule: (membershipId: string, moduleKey: string, data?: { areaId?: string; documentId?: string; positionId?: string; function?: 'AUDITOR' | 'PROFESIONAL' }) =>
    request(`/admin/users/${membershipId}/modules/${moduleKey}`, { method: 'PUT', body: JSON.stringify(data || {}) }),
  revokeUserModule: (membershipId: string, moduleKey: string) =>
    request(`/admin/users/${membershipId}/modules/${moduleKey}`, { method: 'DELETE' }),
  positions: () => request<Position[]>('/auth/positions'),
  createPosition: (name: string) => request<Position>('/auth/positions', { method: 'POST', body: JSON.stringify({ name }) }),
}
