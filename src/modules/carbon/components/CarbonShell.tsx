import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ModuleHero, Tabs, moduleIdentity } from '@/design-system'
import { useAuth } from '@/platform/auth/AuthContext'

export const carbonIdentity = moduleIdentity('carbon-footprint')

const BASE = '/app/huella-carbono'

// Navegacion interna del modulo — jerarquica y compacta (8 vistas, nunca todas las variables en
// una sola pantalla, ver spec §"navegacion"). Factores/Configuracion quedan fuera del array para
// quien no tenga carbon.manage: ese permiso lo reciben admin-tier siempre y USUARIO solo si se le
// asigna explicitamente (§3 RBAC), igual criterio que el resto de SGIMR.
const NAV_ITEMS: { key: string; label: string; path: string; manageOnly?: boolean }[] = [
  { key: 'dashboard', label: 'Dashboard', path: BASE },
  { key: 'registro', label: 'Registro', path: `${BASE}/registro` },
  { key: 'inventario', label: 'Inventario', path: `${BASE}/inventario` },
  { key: 'indicador', label: 'Indicador', path: `${BASE}/indicador` },
  { key: 'informes', label: 'Informes', path: `${BASE}/informes` },
  { key: 'factores', label: 'Factores', path: `${BASE}/factores`, manageOnly: true },
  { key: 'configuracion', label: 'Configuración', path: `${BASE}/configuracion`, manageOnly: true },
  { key: 'historial', label: 'Historial', path: `${BASE}/historial` },
]

export function CarbonShell({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useAuth()
  const canManage = Boolean(session?.permissions.includes('carbon.manage'))
  const items = NAV_ITEMS.filter(item => !item.manageOnly || canManage)
  const active = items.find(item => item.path === location.pathname)?.key
    || (location.pathname === BASE ? 'dashboard' : items.slice().reverse().find(item => location.pathname.startsWith(item.path) && item.path !== BASE)?.key)
    || 'dashboard'

  return (
    <div className="carbon-module hc2-app">
      <ModuleHero badge="Huella de Carbono" title={title} subtitle={subtitle} accent={carbonIdentity.color} actions={actions}>
        <div className="hc2-nav-wrap">
          <Tabs items={items.map(item => ({ key: item.key, label: item.label }))} active={active} identity={carbonIdentity}
            onChange={key => { const target = items.find(item => item.key === key); if (target) navigate(target.path) }} />
        </div>
      </ModuleHero>
      <div className="hc2-content">{children}</div>
    </div>
  )
}
