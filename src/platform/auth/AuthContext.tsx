import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '@/platform/api'
import type { SessionContext } from '@/platform/types'

interface AuthValue {
  session: SessionContext | null
  ready: boolean
  login(email: string, password: string, organization?: string): Promise<void>
  logout(): Promise<void>
  refresh(): Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionContext | null>(null)
  const [ready, setReady] = useState(false)

  async function refresh() {
    try { setSession(await api.me()) }
    catch { setSession(null) }
    finally { setReady(true) }
  }

  useEffect(() => { void refresh() }, [])

  const value = useMemo<AuthValue>(() => ({
    session,
    ready,
    async login(email, password, organization) {
      await api.login(email, password, organization)
      setSession(await api.me())
    },
    async logout() {
      try { await api.logout() } finally { setSession(null) }
    },
    refresh,
  }), [session, ready])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return value
}
