import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ModuleHero, Tabs, moduleIdentity } from '@/design-system'

export const environmentalIdentity = moduleIdentity('environmental-indicators')

const BASE = '/app/indicadores-ambientales'

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
 * Shell de Indicadores Ambientales — MODULO PROPIO E INDEPENDIENTE, con su propia entrada en el
 * sidebar (icono "droplets"), su propia identidad de color (--m-indicadores, magenta) y sus
 * propios permisos (environmental.*). No comparte navegacion ni cabecera con Huella de Carbono:
 * mide eficiencia de consumo, no emisiones GEI, y el usuario pidio explicitamente separarlo en
 * su propia pestaña en vez de anidarlo.
 */
export function EnvironmentalShell({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const active = NAV_ITEMS.find(item => item.path === location.pathname)?.key
    || (location.pathname === BASE ? 'dashboard' : NAV_ITEMS.slice().reverse().find(item => location.pathname.startsWith(item.path) && item.path !== BASE)?.key)
    || 'dashboard'

  return (
    <div className="hc2-app env-app">
      <ModuleHero badge="Indicadores Ambientales" title={title} subtitle={subtitle} accent={environmentalIdentity.color} actions={actions}>
        <div className="hc2-nav-wrap">
          <Tabs items={NAV_ITEMS.map(item => ({ key: item.key, label: item.label }))} active={active} identity={environmentalIdentity}
            onChange={key => { const target = NAV_ITEMS.find(item => item.key === key); if (target) navigate(target.path) }} />
        </div>
      </ModuleHero>
      <div className="hc2-content">{children}</div>
    </div>
  )
}
