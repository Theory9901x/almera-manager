import { useState } from 'react'
import { motion } from 'framer-motion'
import { Activity, ClipboardList, Download, Plus, Search, Users } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/platform/auth/AuthContext'
import {
  Badge, Button, Card, EmptyState, Field, Input, MODULE_IDENTITIES, PageHeader, ProgressBar, ProgressRing,
  Select, SemaphoreBadge, StatCard, Table, Tabs, Textarea, ToastProvider, fadeSlideUp, staggerContainer, useToast,
} from '@/design-system'
import type { SemaphoreLevel } from '@/design-system'

const identityEntries = Object.entries(MODULE_IDENTITIES)
const semaphoreLevels: SemaphoreLevel[] = ['OPTIMO', 'ACEPTABLE', 'DEFICIENTE', 'MUY_DEFICIENTE']

function GalleryContent() {
  const [tab, setTab] = useState('overview')
  const [selectValue, setSelectValue] = useState('')
  const toast = useToast()

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 pb-16">
      <PageHeader
        eyebrow="Design system"
        title="Galería de componentes"
        description="Fase 1 — fuente única de verdad para color, tipografía, componentes y motion. Página interna de revisión, no es parte de la navegación de producción."
        identity={MODULE_IDENTITIES['adherence-matrix']}
      />

      <Tabs
        items={[{ key: 'overview', label: 'Resumen' }, { key: 'identity', label: 'Identidad por módulo' }, { key: 'components', label: 'Componentes' }]}
        active={tab}
        onChange={setTab}
        identity={MODULE_IDENTITIES['adherence-matrix']}
      />

      {tab === 'overview' && (
        <motion.div variants={staggerContainer()} initial="hidden" animate="visible" className="grid gap-4 md:grid-cols-3">
          <motion.div variants={fadeSlideUp}><StatCard icon={Activity} label="Evaluaciones" value="128" detail="+12% este mes" identity={MODULE_IDENTITIES['adherence-matrix']} /></motion.div>
          <motion.div variants={fadeSlideUp}><StatCard icon={Users} label="Usuarios activos" value="34" identity={MODULE_IDENTITIES.admin} /></motion.div>
          <motion.div variants={fadeSlideUp}><StatCard icon={ClipboardList} label="Solicitudes" value="9" detail="Gestión ALMERA" identity={MODULE_IDENTITIES.almera} /></motion.div>
        </motion.div>
      )}

      {tab === 'identity' && (
        <Card>
          <p className="ds-eyebrow">Sección 3</p>
          <h2 className="mt-1 text-lg font-black">Identidad de color por módulo</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">Franja de PageHeader, ícono de sidebar, subrayado de tabs, borde de acento — nunca fondo sólido de pantalla ni botón genérico.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {identityEntries.map(([key, identity]) => (
              <div key={key} className="ds-card" style={{ padding: '14px 16px' }}>
                <div className="flex items-center gap-3">
                  <span className="h-8 w-8 flex-none rounded-full" style={{ backgroundImage: `linear-gradient(135deg, ${identity.gradientFrom}, ${identity.gradientTo})` }} />
                  <div>
                    <strong className="block text-sm">{key}</strong>
                    <span className="font-mono text-[10px] text-[var(--muted)]">{identity.color}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-[var(--border-hairline)] pt-5">
            <p className="ds-eyebrow">Sección 4</p>
            <h2 className="mt-1 text-lg font-black">Semáforo de cumplimiento (transversal, no confundir con identidad)</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {semaphoreLevels.map(level => <SemaphoreBadge key={level} level={level} />)}
              <SemaphoreBadge level={null} />
            </div>
          </div>
        </Card>
      )}

      {tab === 'components' && (
        <div className="space-y-5">
          <Card accent={MODULE_IDENTITIES['adherence-matrix'].color}>
            <p className="ds-eyebrow">Button</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button identity={MODULE_IDENTITIES['adherence-matrix']}><Plus size={16} />Primary</Button>
              <Button identity={MODULE_IDENTITIES.admin}><Plus size={16} />Primary (Admin)</Button>
              <Button variant="secondary"><Download size={16} />Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button disabled>Disabled</Button>
            </div>
          </Card>

          <Card>
            <p className="ds-eyebrow">Badge / SemaphoreBadge</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone="neutral">Neutral</Badge>
              <Badge tone="info">Info</Badge>
              {semaphoreLevels.map(level => <SemaphoreBadge key={level} level={level} size="sm" />)}
            </div>
          </Card>

          <Card>
            <p className="ds-eyebrow">Input / Select / Textarea</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Field label="Nombre completo"><Input placeholder="Ej. Ana Martínez" /></Field>
              <Field label="Área" hint="Select estilizado sobre Radix, nunca nativo">
                <Select
                  value={selectValue}
                  onChange={setSelectValue}
                  placeholder="Selecciona un área"
                  options={[{ value: 'urgencias', label: 'Urgencias' }, { value: 'odontologia', label: 'Odontología' }, { value: 'enfermeria', label: 'Enfermería' }]}
                />
              </Field>
              <div className="md:col-span-2"><Field label="Observaciones"><Textarea rows={3} placeholder="Texto libre..." /></Field></div>
            </div>
          </Card>

          <Card>
            <p className="ds-eyebrow">ProgressRing / ProgressBar</p>
            <div className="mt-3 flex flex-wrap items-center gap-6">
              <ProgressRing percent={92} />
              <ProgressRing percent={84} />
              <ProgressRing percent={73} />
              <ProgressRing percent={45} />
              <ProgressRing percent={null} />
              <div className="min-w-[200px] flex-1"><ProgressBar percent={68} /></div>
            </div>
          </Card>

          <Card>
            <p className="ds-eyebrow">Table</p>
            <Table>
              <thead><tr><th>Profesional</th><th>Área</th><th>Cumplimiento</th></tr></thead>
              <tbody>
                <tr><td>Ana Martínez</td><td>Urgencias</td><td><SemaphoreBadge level="OPTIMO" size="sm" /></td></tr>
                <tr><td>Carlos Pérez</td><td>Odontología</td><td><SemaphoreBadge level="DEFICIENTE" size="sm" /></td></tr>
              </tbody>
            </Table>
          </Card>

          <Card>
            <p className="ds-eyebrow">EmptyState</p>
            <EmptyState icon={Search} title="Sin resultados" description="Ajusta los filtros para ver más registros." />
          </Card>

          <Card>
            <p className="ds-eyebrow">Toast</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => toast.push('success', 'Guardado correctamente')}>Disparar éxito</Button>
              <Button variant="secondary" onClick={() => toast.push('error', 'No fue posible completar la acción')}>Disparar error</Button>
              <Button variant="secondary" onClick={() => toast.push('info', 'Este es un mensaje informativo')}>Disparar info</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

export default function DesignSystemGalleryPage() {
  const { session } = useAuth()
  if (!session || !['SUPERADMIN', 'ADMIN'].includes(session.role.key)) return <Navigate to="/app" replace />
  return <ToastProvider><GalleryContent /></ToastProvider>
}
