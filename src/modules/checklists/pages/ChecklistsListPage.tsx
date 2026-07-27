import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListChecks, Loader2, Pencil, Plus } from 'lucide-react'
import {
  Badge, Button, Card, EmptyState, Field, Input, ModuleHero, Select, Table, ToastProvider,
  moduleIdentity, useToast,
} from '@/design-system'
import { useAuth } from '@/platform/auth/AuthContext'
import { checklistsService } from '../services/checklistsService'
import type { ChecklistArea, ChecklistTemplate } from '../types'

const identity = moduleIdentity('checklists')

const STATUS_TONE: Record<string, 'info' | 'neutral' | 'warning'> = {
  PUBLICADA: 'info', BORRADOR: 'neutral', ARCHIVADA: 'warning',
}
const STATUS_LABEL: Record<string, string> = {
  PUBLICADA: 'Publicada', BORRADOR: 'Borrador', ARCHIVADA: 'Archivada',
}

export default function ChecklistsListPage() {
  return <ToastProvider><ChecklistsListContent /></ToastProvider>
}

function ChecklistsListContent() {
  const navigate = useNavigate()
  const toast = useToast()
  const { session } = useAuth()
  const canManage = Boolean(session?.permissions.includes('checklists.manage'))

  const [templates, setTemplates] = useState<ChecklistTemplate[]>([])
  const [areas, setAreas] = useState<ChecklistArea[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', code: '', version: '01', areaId: '' })

  async function load() {
    try {
      const [list, areaList] = await Promise.all([checklistsService.list(), checklistsService.areas()])
      setTemplates(list)
      setAreas(areaList)
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar las listas') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  async function createTemplate() {
    if (!form.name.trim()) { toast.push('error', 'Escribe el nombre de la lista'); return }
    setBusy(true)
    try {
      const created = await checklistsService.create({
        name: form.name.trim(), code: form.code.trim(), version: form.version.trim() || '01',
        areaId: form.areaId || null,
      })
      toast.push('success', 'Lista creada')
      navigate(`/app/listas-chequeo/${created.id}/constructor`)
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible crear la lista') }
    finally { setBusy(false) }
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin" size={24} /></div>

  const published = templates.filter(template => template.status === 'PUBLICADA').length
  const criteriaTotal = templates.reduce((sum, template) => sum + (template.criteria_count || 0), 0)

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 checklists-page-bg">
      <ModuleHero
        badge="Seguridad del paciente"
        title="Listas de Chequeo"
        subtitle="Auditorías por adherencia: construye la lista una vez y aplícala por servicio. Escala C / NC / NA en todas."
        accent={identity.color}
        className="checklists-hero"
      >
        <div className="hero-stat-inline">
          <div><div className="num">{templates.length}</div><div className="lbl">Listas</div></div>
          <div><div className="num">{published}</div><div className="lbl">Publicadas</div></div>
          <div><div className="num">{criteriaTotal}</div><div className="lbl">Criterios</div></div>
        </div>
      </ModuleHero>

      {canManage && (
        <Card accent={identity.color} className="p-5">
          <p className="ds-eyebrow">Registro</p>
          <h2 className="mt-1 text-xl font-black">Nueva lista</h2>
          <div className="inline-action-bar mt-4" style={{ border: 0, boxShadow: 'none', padding: 0, background: 'transparent' }}>
            <div className="min-w-[280px] flex-1">
              <Field label="Nombre de la lista">
                <Input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Ej. Ronda diaria de seguridad del paciente" />
              </Field>
            </div>
            <div className="w-[170px]">
              <Field label="Código" hint="Ej. GCM-SPA-FO-24">
                <Input value={form.code} onChange={event => setForm({ ...form, code: event.target.value })} placeholder="Opcional" />
              </Field>
            </div>
            <div className="w-[110px]">
              <Field label="Versión"><Input value={form.version} onChange={event => setForm({ ...form, version: event.target.value })} /></Field>
            </div>
            <div className="w-[200px]">
              <Field label="Área / servicio">
                <Select
                  value={form.areaId || 'NONE'}
                  onChange={value => setForm({ ...form, areaId: value === 'NONE' ? '' : value })}
                  options={[{ value: 'NONE', label: 'Sin asignar' }, ...areas.map(area => ({ value: area.id, label: area.name }))]}
                />
              </Field>
            </div>
            <Button identity={identity} onClick={() => void createTemplate()} disabled={busy}><Plus size={16} /> Crear lista</Button>
          </div>
        </Card>
      )}

      <Card accent={identity.color} className="overflow-hidden">
        <div className="table-toolbar">
          <div className="almera-panel-title" style={{ ['--ds-accent' as string]: identity.color }}>
            <span><ListChecks size={19} /></span>
            <div><h2>Listas institucionales</h2><p>{templates.length} registradas</p></div>
          </div>
        </div>
        {templates.length ? (
          <div className="checklists-table">
            <Table>
              <thead>
                <tr><th>Lista</th><th>Código</th><th>Área / servicio</th><th>Audita</th><th>Dominios</th><th>Criterios</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {templates.map(template => (
                  <tr key={template.id}>
                    <td><strong>{template.name}</strong></td>
                    <td className="tabular-col">{template.code || '—'}{template.code ? ` v${template.version}` : ''}</td>
                    <td>{template.area_name || '—'}</td>
                    <td>{template.subject_label}</td>
                    <td className="tabular-col">{template.domain_count ?? 0}</td>
                    <td className="tabular-col">{template.criteria_count ?? 0}</td>
                    <td><Badge tone={STATUS_TONE[template.status] || 'neutral'}>{STATUS_LABEL[template.status] || template.status}</Badge></td>
                    <td>
                      <button className="row-action" style={{ color: identity.color }} onClick={() => navigate(`/app/listas-chequeo/${template.id}/constructor`)}>
                        <Pencil size={13} /> {canManage ? 'Editar' : 'Ver'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        ) : (
          <div className="p-5">
            <EmptyState
              icon={ListChecks}
              title="Aún no hay listas de chequeo"
              description={canManage ? 'Crea la primera lista arriba: defínele sus dominios y criterios, y quedará lista para auditar por servicio.' : 'Todavía no hay listas publicadas para tu perfil.'}
            />
          </div>
        )}
      </Card>
    </div>
  )
}
