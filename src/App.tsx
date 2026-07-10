import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/platform/auth/AuthContext'
import AppLayout from '@/platform/layout/AppLayout'
import LoginPage from '@/platform/pages/LoginPage'
import DashboardPage from '@/platform/pages/DashboardPage'
import AdminPage from '@/platform/pages/AdminPage'
import ModulePage from '@/platform/pages/ModulePage'

function ProtectedApp() {
  const { session, ready } = useAuth()
  if (!ready) return <div className="min-h-screen grid place-items-center bg-slate-950 text-white">Cargando SGI MR...</div>
  if (!session) return <Navigate to="/login" replace />
  return <AppLayout />
}

function AppRoutes() {
  const { session, ready } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={ready && session ? <Navigate to="/app" replace /> : <LoginPage />} />
      <Route path="/app" element={<ProtectedApp />}>
        <Route index element={<DashboardPage />} />
        <Route path="administracion" element={<AdminPage />} />
        <Route path="modulos/:moduleKey" element={<ModulePage />} />
      </Route>
      <Route path="*" element={<Navigate to={session ? '/app' : '/login'} replace />} />
    </Routes>
  )
}

export default function App() {
  return <AuthProvider><AppRoutes /></AuthProvider>
}
