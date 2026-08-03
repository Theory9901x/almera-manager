import type { ReactNode } from 'react'
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
import ImprovementPlansPage from '@/platform/pages/ImprovementPlansPage'
import HcMatrixWindowPage from '@/modules/adherence/pages/HcMatrixWindowPage'
import MyAccountPage from '@/platform/pages/MyAccountPage'
import DesignSystemGalleryPage from '@/platform/pages/DesignSystemGalleryPage'
import SurveysListPage from '@/modules/surveys/pages/SurveysListPage'
import SurveyBuilderPage from '@/modules/surveys/pages/SurveyBuilderPage'
import SurveyResultsPage from '@/modules/surveys/pages/SurveyResultsPage'
import SurveyResponsesPage from '@/modules/surveys/pages/SurveyResponsesPage'
import SurveyConsolidatedPage from '@/modules/surveys/pages/SurveyConsolidatedPage'
import PublicSurveyPage from '@/modules/surveys/pages/PublicSurveyPage'
import CarbonDashboardPage from '@/modules/carbon/pages/CarbonDashboardPage'
import CarbonCapturePage from '@/modules/carbon/pages/CarbonCapturePage'
import CarbonConfigPage from '@/modules/carbon/pages/CarbonConfigPage'
import ChecklistsListPage from '@/modules/checklists/pages/ChecklistsListPage'
import ChecklistBuilderPage from '@/modules/checklists/pages/ChecklistBuilderPage'
import ChecklistAuditPage from '@/modules/checklists/pages/ChecklistAuditPage'
import ChecklistWindowPage from '@/modules/checklists/pages/ChecklistWindowPage'
import ChecklistPreviewPage from '@/modules/checklists/pages/ChecklistPreviewPage'
import ChecklistPlansPage from '@/modules/checklists/pages/ChecklistPlansPage'
import { RadicadosDashboardPage } from '@/modules/radicados/pages/RadicadosDashboardPage'

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

function AdherenceMatrixWindowRoute() {
  const { session } = useAuth()
  // Misma guarda que la pantalla de operacion: quien puede evaluar puede calificar aqui. El
  // servidor revalida en cada escritura, asi que la guarda solo evita entrar a una pantalla vacia.
  const canOperate = Boolean(session?.permissions.some(item => ['adherence_matrix.evaluate', 'adherence_matrix.manage'].includes(item)))
  if (!canOperate) return <Navigate to="/app" replace />
  return <HcMatrixWindowPage />
}

function AdherenceMyPlansRoute() {
  const { session } = useAuth()
  if (!session?.permissions.includes('adherence_matrix.own_plan')) return <Navigate to="/app" replace />
  return <AdherenceMyPlansPage />
}

function SurveysRoute() {
  const { session } = useAuth()
  if (!session?.permissions.includes('surveys.view')) return <Navigate to="/app" replace />
  return <SurveysListPage />
}

function SurveyBuilderRoute() {
  const { session } = useAuth()
  if (!session?.permissions.includes('surveys.edit')) return <Navigate to="/app/encuestas" replace />
  return <SurveyBuilderPage />
}

function SurveyResultsRoute() {
  const { session } = useAuth()
  if (!session?.permissions.includes('surveys.view')) return <Navigate to="/app" replace />
  return <SurveyResultsPage />
}

function SurveyConsolidatedRoute() {
  const { session } = useAuth()
  if (!session?.permissions.includes('surveys.view')) return <Navigate to="/app" replace />
  return <SurveyConsolidatedPage />
}

function SurveyResponsesRoute() {
  const { session } = useAuth()
  if (!session?.permissions.includes('surveys.view')) return <Navigate to="/app" replace />
  return <SurveyResponsesPage />
}

function CarbonRoute({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  if (!session?.permissions.includes('carbon.view')) return <Navigate to="/app" replace />
  return <>{children}</>
}

function CarbonConfigRoute() {
  const { session } = useAuth()
  if (!session?.permissions.includes('carbon.manage')) return <Navigate to="/app/huella-carbono" replace />
  return <CarbonConfigPage />
}

function ChecklistsRoute() {
  const { session } = useAuth()
  if (session?.permissions.includes('checklists.view')) return <ChecklistsListPage />
  // Un colaborador (solo checklists.improve) entra directo a sus planes de mejora: no tiene
  // nada que hacer en el resto del modulo y el servidor tampoco se lo permitiria.
  if (session?.permissions.includes('checklists.improve')) return <Navigate to="/app/listas-chequeo/planes" replace />
  return <Navigate to="/app" replace />
}

function ChecklistPlansRoute() {
  const { session } = useAuth()
  const allowed = Boolean(session?.permissions.some(item => ['checklists.view', 'checklists.improve'].includes(item)))
  if (!allowed) return <Navigate to="/app" replace />
  return <ChecklistPlansPage />
}

function ChecklistBuilderRoute() {
  const { session } = useAuth()
  // Se entra tambien solo con .view: el constructor se muestra en modo lectura para quien no
  // administra (poder consultar los criterios de una lista es parte de auditar bien).
  if (!session?.permissions.includes('checklists.view')) return <Navigate to="/app" replace />
  return <ChecklistBuilderPage />
}

function ChecklistPreviewRoute() {
  const { session } = useAuth()
  // Solo lectura y sin escribir nada, asi que basta .view: consultar como se audita un formato
  // es parte de auditar bien, y no crea ni toca datos.
  if (!session?.permissions.includes('checklists.view')) return <Navigate to="/app" replace />
  return <ChecklistPreviewPage />
}

function ChecklistAuditRoute() {
  const { session } = useAuth()
  // Con .view se puede consultar una auditoria (incluidas las cerradas); marcar y cerrar exige
  // .fill, y eso lo valida el servidor en cada endpoint de escritura.
  if (!session?.permissions.includes('checklists.view')) return <Navigate to="/app" replace />
  return <ChecklistAuditPage />
}

function ChecklistWindowRoute() {
  const { session } = useAuth()
  // Misma guarda que la pantalla principal: el servidor revalida en cada escritura, asi que la
  // guarda solo evita entrar a una ventana vacia.
  if (!session?.permissions.includes('checklists.view')) return <Navigate to="/app" replace />
  return <ChecklistWindowPage />
}

function RadicadosRoute() {
  const { session } = useAuth()
  if (!session?.permissions.includes('radicados.view')) return <Navigate to="/app" replace />
  return (
    <RadicadosDashboardPage
      canCreate={session.permissions.includes('radicados.create')}
      canVoid={session.permissions.includes('radicados.void')}
      isSuperadmin={session.role.key === 'SUPERADMIN'}
    />
  )
}

function AppRoutes() {
  const { session, ready } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={ready && session ? <Navigate to="/app" replace /> : <LoginPage />} />
      {/* Unica superficie sin login: cualquiera con el enlace responde una encuesta externa. */}
      <Route path="/e/:slug" element={<PublicSurveyPage />} />
      <Route path="/app" element={<ProtectedApp />}>
        <Route index element={<DashboardPage />} />
        <Route path="administracion" element={<AdminPage />} />
        <Route path="administracion/:section" element={<AdminPage />} />
        <Route path="mi-cuenta" element={<MyAccountPage />} />
        {/* Directorio transversal: no lleva guarda de permiso propia porque el servidor
            ya devuelve solo los modulos que esta persona tiene. */}
        <Route path="planes-mejora" element={<ImprovementPlansPage />} />
        <Route path="design-system" element={<DesignSystemGalleryPage />} />
        <Route path="adherencia/configuracion" element={<AdherenceConfigRoute />} />
        <Route path="adherencia/operacion" element={<AdherenceOperationRoute />} />
        <Route path="adherencia/mis-planes" element={<AdherenceMyPlansRoute />} />
        {/* La matriz sola, para abrirla en otra ventana/monitor. Dentro de /app para heredar la
            sesion; el overlay se pinta encima del layout y lo tapa por completo. */}
        <Route path="adherencia/matriz/:evaluationId" element={<AdherenceMatrixWindowRoute />} />
        <Route path="encuestas" element={<SurveysRoute />} />
        <Route path="encuestas/consolidado" element={<SurveyConsolidatedRoute />} />
        <Route path="encuestas/:surveyId/constructor" element={<SurveyBuilderRoute />} />
        <Route path="encuestas/:surveyId/resultados" element={<SurveyResultsRoute />} />
        <Route path="encuestas/:surveyId/respuestas" element={<SurveyResponsesRoute />} />
        <Route path="listas-chequeo" element={<ChecklistsRoute />} />
        <Route path="listas-chequeo/planes" element={<ChecklistPlansRoute />} />
        <Route path="listas-chequeo/planes/:planId" element={<ChecklistPlansRoute />} />
        <Route path="listas-chequeo/auditorias/:auditId" element={<ChecklistAuditRoute />} />
        {/* La auditoria sola, para abrirla en otra ventana/monitor. Dentro de /app para heredar
            la sesion; el overlay se pinta encima del layout y lo tapa por completo. */}
        <Route path="listas-chequeo/auditorias/:auditId/ventana" element={<ChecklistWindowRoute />} />
        <Route path="listas-chequeo/:templateId/constructor" element={<ChecklistBuilderRoute />} />
        <Route path="listas-chequeo/:templateId/vista-previa" element={<ChecklistPreviewRoute />} />
        <Route path="huella-carbono" element={<CarbonRoute><CarbonDashboardPage /></CarbonRoute>} />
        <Route path="huella-carbono/captura" element={<CarbonRoute><CarbonCapturePage /></CarbonRoute>} />
        <Route path="huella-carbono/configuracion" element={<CarbonConfigRoute />} />
        <Route path="radicados" element={<RadicadosRoute />} />
        <Route path="modulos/:moduleKey" element={<ModulePage />} />
      </Route>
      <Route path="*" element={<Navigate to={session ? '/app' : '/login'} replace />} />
    </Routes>
  )
}

export default function App() {
  return <AuthProvider><AppRoutes /></AuthProvider>
}
