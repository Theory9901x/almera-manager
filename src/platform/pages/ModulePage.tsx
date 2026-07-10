import { BarChart3, Download, FileBarChart2, FilePlus2, Filter, Layers3, Plus } from 'lucide-react'
import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '@/platform/auth/AuthContext'
import { ALMERA_STATUS_LABELS, ALMERA_TYPE_LABELS } from '@/modules/almera/constants'
import { listAlmeraRecords } from '@/modules/almera/services/almeraService'
import type { AlmeraRecord } from '@/modules/almera/types'
import { Badge, Button, Card, Field, PageHeader, SearchBox, StatCard, StatusBadge } from '@/shared/ui'
import { useEffect, useMemo, useState } from 'react'

export default function ModulePage() {
  const { moduleKey } = useParams()
  const { session } = useAuth()
  const module = session?.modules.find(item => item.key === moduleKey)
  if (!module) return <Navigate to="/app" replace />
  if (module.key === 'almera') return <AlmeraPage />
  if (module.key === 'reports') return <ReportsPage />
  return <GenericModule module={module} />
}

function AlmeraPage() {
  const [records, setRecords] = useState<AlmeraRecord[]>([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')

  useEffect(() => { void listAlmeraRecords().then(setRecords) }, [])

  const filtered = useMemo(() => records.filter(record => {
    const text = `${record.id} ${record.request} ${record.process} ${record.document} ${record.responsible}`.toLowerCase()
    return text.includes(query.toLowerCase()) && (status === 'ALL' || record.status === status)
  }), [records, query, status])

  return (
    <div className="module-workspace module-workspace-almera mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Modulo central"
        title="Gestion ALMERA"
        description="Bandeja inicial para solicitudes documentales, documentos gestionados, procesos institucionales, evidencias, responsables, estados y seguimiento."
        actions={<><Button><Plus size={16} /> Nuevo registro</Button><Button variant="secondary"><Download size={16} /> Exportar</Button></>}
      />

      <section className="metric-strip">
        <StatCard label="Solicitudes" value={records.length} detail="Registros temporales listos para API" tone="info" />
        <StatCard label="En revision" value={records.filter(item => item.status === 'IN_REVIEW').length} detail="Requieren validacion" tone="warning" />
        <StatCard label="Cerradas" value={records.filter(item => item.status === 'CLOSED' || item.status === 'APPROVED').length} detail="Con trazabilidad" tone="success" />
        <StatCard label="Devueltas" value={records.filter(item => item.status === 'RETURNED').length} detail="Con observaciones" tone="danger" />
      </section>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Mesa de control</p>
            <h2 className="mt-1 text-xl font-black">Filtrar gestion documental</h2>
          </div>
          <Badge tone="accent">ALMERA operativo</Badge>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_auto]">
          <SearchBox value={query} onChange={setQuery} placeholder="Buscar por solicitud, proceso, documento o responsable" />
          <select className="input" value={status} onChange={event => setStatus(event.target.value)}>
            <option value="ALL">Todos los estados</option>
            {Object.entries(ALMERA_STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <Button variant="secondary"><Filter size={16} /> Filtrar</Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 p-5">
          <div>
            <p className="eyebrow">Bandeja de trabajo</p>
            <h2 className="mt-1 text-xl font-black">Registros de gestion</h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.035] px-3 py-2 font-mono text-[11px] font-black uppercase tracking-wider text-slate-400">
            <Layers3 size={14} /> {filtered.length} visibles
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[980px]">
            <thead>
              <tr>
                <th>Solicitud</th>
                <th>Proceso / documento</th>
                <th>Tipo</th>
                <th>Responsable</th>
                <th>Fechas</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(record => (
                <tr key={record.id}>
                  <td>
                    <strong className="block">{record.id}</strong>
                    <span className="mt-1 block text-sm text-slate-400">{record.request}</span>
                  </td>
                  <td>
                    <strong className="block">{record.process}</strong>
                    <span className="mt-1 block text-sm text-slate-400">{record.document}</span>
                  </td>
                  <td><Badge tone="accent">{ALMERA_TYPE_LABELS[record.managementType]}</Badge></td>
                  <td>{record.responsible}</td>
                  <td><span className="font-mono text-xs text-slate-400">{record.registeredAt}{record.closedAt ? ` / ${record.closedAt}` : ''}</span></td>
                  <td><StatusBadge status={ALMERA_STATUS_LABELS[record.status]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <section className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
        <Card className="p-5">
          <p className="eyebrow">Registro rapido</p>
          <h2 className="mt-1 text-xl font-black">Nueva gestion documental</h2>
          <div className="mt-5 grid gap-4">
            <Field label="Solicitud documental"><input placeholder="Ej. Actualizacion de procedimiento institucional" /></Field>
            <Field label="Tipo de gestion"><select>{Object.entries(ALMERA_TYPE_LABELS).map(([key, label]) => <option key={key}>{label}</option>)}</select></Field>
            <Field label="Observaciones"><textarea placeholder="Resumen de soporte, evidencia o decision administrativa" /></Field>
            <Button><FilePlus2 size={16} /> Registrar gestion</Button>
          </div>
        </Card>
        <Card className="p-5">
          <p className="eyebrow">Estructura preparada</p>
          <h2 className="mt-1 text-xl font-black">Componentes del ciclo ALMERA</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {['Solicitudes documentales', 'Documentos cargados', 'Procesos institucionales', 'Actividades de acompanamiento', 'Evidencias o soportes', 'Informes de seguimiento', 'Estados de gestion', 'Responsables y fechas'].map(item => (
              <div key={item} className="rounded-xl border border-white/10 bg-white/[.035] p-4 text-sm font-bold text-slate-300">{item}</div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  )
}

function GenericModule({ module }: { module: { name: string; description: string } }) {
  return (
    <div className="module-workspace mx-auto max-w-7xl space-y-6">
      <PageHeader eyebrow="Modulo preparado" title={module.name} description={module.description} actions={<Badge tone="info">Fase inicial</Badge>} />
      <Card className="p-8">
        <h2 className="text-xl font-black">Estructura lista para crecimiento gradual</h2>
        <p className="mt-3 max-w-3xl text-slate-400">Este espacio queda conectado a navegacion, permisos y catalogo modular. La siguiente fase puede agregar tablas, formularios y servicios propios sin reescribir la base administrativa.</p>
      </Card>
    </div>
  )
}

function ReportsPage() {
  const reports = [
    ['INF-2026-07', 'Seguimiento mensual ALMERA', 'Julio 2026', 'Borrador', '86%'],
    ['INF-2026-06', 'Solicitudes documentales cerradas', 'Junio 2026', 'Listo', '100%'],
    ['INF-2026-Q2', 'Resumen institucional de evidencias', 'Trimestre II', 'En armado', '61%'],
  ]
  return (
    <div className="module-workspace module-workspace-reports mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Informes basicos"
        title="Seguimiento e informes"
        description="Vista inicial para consolidar actividades ALMERA, estados de gestion, evidencias e indicadores basicos."
        actions={<Button><Download size={16} /> Generar informe</Button>}
      />

      <section className="metric-strip">
        <StatCard label="Borradores" value="2" detail="Pendientes de revision" tone="warning" />
        <StatCard label="Listos" value="5" detail="Disponibles para consulta" tone="success" />
        <StatCard label="Indicador ALMERA" value="86%" detail="Avance mensual" tone="info" />
        <StatCard label="Evidencias" value="38" detail="Registradas este mes" tone="accent" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 p-5">
            <div>
              <p className="eyebrow">Consolidado</p>
              <h2 className="mt-1 text-xl font-black">Bandeja de informes</h2>
            </div>
            <Badge tone="info">{reports.length} registros</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table min-w-[760px]">
              <thead><tr><th>Codigo</th><th>Informe</th><th>Periodo</th><th>Estado</th><th>Avance</th></tr></thead>
              <tbody>{reports.map(row => <tr key={row[0]}>{row.map((cell, index) => <td key={cell}>{index === 3 ? <StatusBadge status={cell} /> : index === 4 ? <span className="font-mono text-sm text-[#56D6C9]">{cell}</span> : cell}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <p className="eyebrow">Lectura ejecutiva</p>
          <div className="mt-5 space-y-3">
            {[
              ['Solicitudes en revision', '4', FileBarChart2],
              ['Pendientes de evidencia', '9', Layers3],
              ['Cierre documental', '75%', BarChart3],
            ].map(([label, value, Icon]) => (
              <article key={label as string} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.035] p-4">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#56D6C9]/10 text-[#56D6C9]"><Icon size={18} /></span>
                <span className="min-w-0 flex-1">
                  <strong className="block">{value as string}</strong>
                  <small className="text-slate-400">{label as string}</small>
                </span>
              </article>
            ))}
          </div>
        </Card>
      </section>
    </div>
  )
}
