import { create } from 'zustand'
import type { Usuario } from '@/types'

interface AuthState {
  usuario: Usuario | null
  setUsuario: (u: Usuario | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  usuario: null,
  setUsuario: (u) => set({ usuario: u }),
  logout: () => set({ usuario: null }),
}))
