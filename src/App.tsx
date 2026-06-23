import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAppStore }  from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import Sidebar       from '@/components/Sidebar'
import Dashboard     from '@/modules/dashboard/Dashboard'
import Gestion       from '@/modules/gestion/Gestion'
import Informes      from '@/modules/informes/Informes'
import Consulta      from '@/modules/consulta/Consulta'
import MesSelector   from '@/modules/MesSelector/MesSelector'
import ModeSelector  from '@/modules/modeSelector/ModeSelector'
import Login         from '@/modules/auth/Login'

function AppContent() {
  const { appMode, setPeriodos, setPeriodoActivo, periodoActivo, setNotifCount } = useAppStore()
  const { usuario } = useAuthStore()
  const [listo, setListo] = useState(false)

  useEffect(() => {
    window.api.periodos.listar().then(lista => {
      setPeriodos(lista)
      if (lista.length > 0) setPeriodoActivo(lista[0])
      setListo(true)
    })
  }, [])

  useEffect(() => {
    if (!listo) return
    window.api.tareas.proximas().then(list => setNotifCount(list.length))
  }, [listo])

  if (!listo) return (
    <div className="flex items-center justify-center h-screen bg-slate-900">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-white/40 text-sm">Cargando...</p>
      </div>
    </div>
  )

  // 1. Elegir modo
  if (!appMode) return <ModeSelector />

  // 2. GCI requiere login
  if (appMode === 'gci' && !usuario) return <Login />

  // 3. Elegir período
  if (!periodoActivo) return <MesSelector />

  // 4. App principal
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/"          element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/gestion"   element={<div className="p-6"><Gestion /></div>} />
          <Route path="/tareas"    element={<Navigate to="/gestion" replace />} />
          <Route path="/informes"  element={<div className="p-6"><Informes /></div>} />
          <Route path="/consulta"  element={<div className="p-6"><Consulta /></div>} />
          <Route path="*"          element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  )
}
