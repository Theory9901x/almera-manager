import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ModuleHero, Tabs } from '@/design-system'
import { carbonIdentity } from '@/modules/carbon/components/CarbonShell'

const BASE = '/app/huella-carbono/indicadores-ambientales'

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', path: BASE },
  { key: 'registro', label: 'Registro', path: `${BASE}/registro` },
  { key: 'energia', label: 'Energía', path: `${BASE}/energia` },
  { key: 'agua', label: 'Agua', path: `${BASE}/agua` },
  { key: 'lineas-base', label: 'Líneas base y metas', path: `${BASE}/lineas-base` },
  { key: 'informes', label: 'Informes', path: `${BASE}/informes` },
  { key: 'historial', label: 'Historial', path: `${BASE}/historial` },
]

/**
 * Shell del submodulo Indicadores Ambientales — vive DENTRO de Huella de Carbono (mismo modulo,
 * mismos permisos) pero mide algo distinto (eficiencia de consumo, no emisiones GEI), por eso
 * lleva su propia cabecera y navegacion interna en vez de reutilizar CarbonShell tal cual: el
 * breadcrumb deja claro donde esta parado dentro del arbol.
 */
export function EnvironmentalShell({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const active = NAV_ITEMS.find(item => item.path === location.pathname)?.key
    || (location.pathname === BASE ? 'dashboard' : NAV_ITEMS.slice().reverse().find(item => location.pathname.startsWith(item.path) && item.path !== BASE)?.key)
    || 'dashboard'

  return (
    <div className="carbon-module hc2-app env-app">
      <nav className="env-breadcrumb">
        <button type="button" onClick={() => navigate('/app/huella-carbono')}><ArrowLeft size={13} /> Huella de Carbono</button>
        <span>/</span>
        <span>Indicadores ambientales</span>
      </nav>
      <ModuleHero badge="Indicadores Ambientales" title={title} subtitle={subtitle} accent={carbonIdentity.color} actions={actions}>
        <div className="hc2-nav-wrap">
          <Tabs items={NAV_ITEMS.map(item => ({ key: item.key, label: item.label }))} active={active} identity={carbonIdentity}
            onChange={key => { const target = NAV_ITEMS.find(item => item.key === key); if (target) navigate(target.path) }} />
        </div>
      </ModuleHero>
      <div className="hc2-content">{children}</div>
    </div>
  )
}
