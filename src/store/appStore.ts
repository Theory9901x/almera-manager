import { create } from 'zustand'
import type { Periodo } from '@/types'

export type AppMode = 'almera' | 'gci' | null

interface AppState {
  appMode: AppMode
  setAppMode: (m: AppMode) => void
  periodoActivo: Periodo | null
  setPeriodoActivo: (p: Periodo | null) => void
  periodos: Periodo[]
  setPeriodos: (list: Periodo[]) => void
  agregarPeriodo: (p: Periodo) => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  notifCount: number
  setNotifCount: (n: number) => void
}

export const useAppStore = create<AppState>((set) => ({
  appMode: null,
  setAppMode: (m) => set({ appMode: m }),
  periodoActivo: null,
  setPeriodoActivo: (p) => set({ periodoActivo: p }),
  periodos: [],
  setPeriodos: (list) => set({ periodos: list }),
  agregarPeriodo: (p) => set((s) => ({ periodos: [p, ...s.periodos] })),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  notifCount: 0,
  setNotifCount: (n) => set({ notifCount: n }),
}))