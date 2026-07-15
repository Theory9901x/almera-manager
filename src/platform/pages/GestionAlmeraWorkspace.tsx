import { useState } from 'react'
import { Headphones, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/platform/auth/AuthContext'
import { Card, PageHeader, moduleIdentity } from '@/design-system'
import AlmeraWorkspace from '@/modules/almera/pages/AlmeraPage'

type SubTab = 'technical-assistances' | 'audits'

// Cada pestaña acepta una o más claves de modulo equivalentes, porque distintos
// despliegues han seedeado el modulo de auditorías con nombres distintos ('audits' vs 'internal-audits').
const subTabDefs: [SubTab, string, typeof Headphones, string[]][] = [
  ['technical-assistances', 'Asistencias Técnicas', Headphones, ['technical-assistances']],
  ['audits', 'Auditorías', ShieldCheck, ['audits', 'internal-audits']],
]

export default function GestionAlmeraWorkspace() {
  const { session } = useAuth()
  const availableKeys = new Set((session?.modules || []).map(module => module.key))
  const availableTabs = subTabDefs.filter(([, , , keys]) => keys.some(key => availableKeys.has(key)))
  const [tab, setTab] = useState<SubTab | undefined>(availableTabs[0]?.[0])
  const activeTab = availableTabs.some(([key]) => key === tab) ? tab : availableTabs[0]?.[0]
  const identity = moduleIdentity(activeTab)

  if (!availableTabs.length) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader eyebrow="Gestión ALMERA" title="Gestión ALMERA" description="Ningún módulo operativo está habilitado para tu rol todavía. Pídele al administrador que te asigne acceso." />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      {availableTabs.length > 1 && (
        <nav className="ds-tabs" aria-label="Secciones de Gestión ALMERA">
          {availableTabs.map(([key, label, Icon]) => {
            const tabIdentity = moduleIdentity(key)
            return (
              <button
                key={key}
                className={`ds-tabs-item inline-flex items-center gap-2 ${activeTab === key ? 'is-active' : ''}`}
                style={activeTab === key ? { color: tabIdentity.color, borderBottomColor: tabIdentity.color } : undefined}
                onClick={() => setTab(key)}
              >
                <Icon size={16} /><span>{label}</span>
              </button>
            )
          })}
        </nav>
      )}
      {activeTab === 'technical-assistances' && <AlmeraWorkspace />}
      {activeTab === 'audits' && <AuditsPlaceholder />}
    </div>
  )
}

function AuditsPlaceholder() {
  const identity = moduleIdentity('audits')
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Auditorías Internas" title="Auditorías Internas" description="Planeación, ejecución, hallazgos e informes de auditoría interna." identity={identity} />
      <Card accent={identity.color} className="p-8 text-center">
        <ShieldCheck size={32} className="mx-auto text-[var(--muted)]" />
        <h2 className="mt-3 text-lg font-black">En construcción</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Este módulo todavía no tiene un flujo propio construido. Próximamente: planes de auditoría, ejecución de listas de chequeo, hallazgos e informes.</p>
      </Card>
    </div>
  )
}
