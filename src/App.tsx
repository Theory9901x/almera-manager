import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/platform/auth/AuthContext'
import AppLayout from '@/platform/layout/AppLayout'
import LoginPage from '@/platform/pages/LoginPage'
import DashboardPage from '@/platform/pages/DashboardPage'
import AdminPage from '@/platform/pages/AdminPage'
import ModulePage from '@/platform/pages/ModulePage'
import AdherenceConfigPage from '@/platform/pages/AdherenceConfigPage'
import AdherenceOperationPage from '@/platform/pages/AdherenceOperationPage'
import AdherenceMyPlansPage from '@/platform/pages/AdherenceMyPlansPage'
import MyAccountPage from '@/platform/pages/MyAccountPage'
import DesignSystemGalleryPage from '@/platform/pages/DesignSystemGalleryPage'

function ProtectedApp() {
  const { session, ready } = useAuth()
  if (!ready) return <div className="app-loading"><span className="loading-orbit" />Cargando SGIMR...</div>
  if (!session) return <Navigate to="/login" replace />
  return <AppLayout />
}

function AdherenceConfigRoute() {
  const { session } = useAuth()
  if (!session?.permissions.includes('adherence_matrix.manage')) return <Navigate to="/app" replace />
  return <AdherenceConfigPage />
}

function AdherenceOperationRoute() {
  const { session } = useAuth()
  const canOperate = Boolean(session?.permissions.some(item => ['adherence_matrix.evaluate', 'adherence_matrix.manage'].includes(item)))
  if (!canOperate) return <Navigate to="/app" replace />
  return <AdherenceOperationPage />
}

function AdherenceMyPlansRoute() {
  const { session } = useAuth()
  if (!session?.permissions.includes('adherence_matrix.own_plan')) return <Navigate to="/app" replace />
  return <AdherenceMyPlansPage />
}

function AppRoutes() {
  const { session, ready } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={ready && session ? <Navigate to="/app" replace /> : <LoginPage />} />
      <Route path="/app" element={<ProtectedApp />}>
        <Route index element={<DashboardPage />} />
        <Route path="administracion" element={<AdminPage />} />
        <Route path="administracion/:section" element={<AdminPage />} />
        <Route path="mi-cuenta" element={<MyAccountPage />} />
        <Route path="design-system" element={<DesignSystemGalleryPage />} />
        <Route path="adherencia/configuracion" element={<AdherenceConfigRoute />} />
        <Route path="adherencia/operacion" element={<AdherenceOperationRoute />} />
        <Route path="adherencia/mis-planes" element={<AdherenceMyPlansRoute />} />
        <Route path="modulos/:moduleKey" element={<ModulePage />} />
      </Route>
      <Route path="*" element={<Navigate to={session ? '/app' : '/login'} replace />} />
    </Routes>
  )
}

export default function App() {
  return <AuthProvider><AppRoutes /></AuthProvider>
}
