import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ModuleHero, moduleIdentity } from '@/design-system'
import { adherenceService } from '@/modules/adherence/services/adherenceService'
import type { Area, Position, Professional } from '@/modules/adherence/types'
import EvaluationsPanel from '@/modules/adherence/pages/EvaluationsPanel'
import DashboardPanel from '@/modules/adherence/pages/DashboardPanel'

type Section = 'evaluations' | 'dashboard'
const identity = moduleIdentity('adherence-matrix')

const sections: [Section, string][] = [
  ['evaluations', 'Nueva evaluación'],
  ['dashboard', 'Dashboard'],
]

export default function AdherenceOperationPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const [section, setSection] = useState<Section>(requestedTab === 'dashboard' ? 'dashboard' : 'evaluations')
  const [areas, setAreas] = useState<Area[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [professionals, setProfessionals] = useState<Professional[]>([])

  useEffect(() => {
    void adherenceService.areas().then(setAreas)
    void adherenceService.positions().then(setPositions)
    void adherenceService.professionals().then(setProfessionals)
  }, [])

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 matrices-page-bg">
      <ModuleHero
        badge="Matrices de adherencia"
        title="Operación"
        subtitle="Registra evaluaciones de historia clínica por profesional y consulta el dashboard de cumplimiento."
        accent={identity.color}
        className="matrices-hero"
      />

      <div className="surface-panel is-header" style={{ ['--ds-accent' as string]: identity.color }}>
        <nav className="ds-tabs" aria-label="Secciones de operación">
          {sections.map(([key, label]) => (
            <button
              key={key}
              className={`ds-tabs-item ${section === key ? 'is-active' : ''}`}
              style={section === key ? { color: identity.color } : undefined}
              onClick={() => { setSection(key); setSearchParams(key === 'dashboard' ? { tab: 'dashboard' } : {}) }}
            >
              {label}
              {section === key && <motion.div layoutId="operation-tab-indicator" className="ds-tabs-indicator" style={{ ['--tab-accent' as string]: identity.color }} />}
            </button>
          ))}
        </nav>

        <div className="mt-5">
          {section === 'evaluations' && <EvaluationsPanel areas={areas} professionals={professionals} />}
          {section === 'dashboard' && <DashboardPanel areas={areas} positions={positions} professionals={professionals} />}
        </div>
      </div>
    </div>
  )
}
