import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Save, ShieldCheck, X } from 'lucide-react'
import { Card, Table, moduleIdentity } from '@/design-system'
import { adherenceService } from '../services/adherenceService'
import type { Area, Auditor } from '../types'

const identity = moduleIdentity('adherence-matrix')

export default function AuditorsPanel({ areas }: { areas: Area[] }) {
  const [auditors, setAuditors] = useState<Auditor[]>([])
  const [draft, setDraft] = useState<Record<string, string[]>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 3500) }
  const fail = (caught: unknown, fallback: string) => setError(caught instanceof Error ? caught.message : fallback)

  const load = () => adherenceService.auditors().then(rows => {
    setAuditors(rows)
    setDraft(Object.fromEntries(rows.map(row => [row.membership_id, row.area_ids])))
  }).catch(caught => fail(caught, 'No fue posible cargar los auditores'))

  useEffect(() => { void load() }, [])

  const toggleArea = (membershipId: string, areaId: string) => {
    setDraft(current => {
      const selected = current[membershipId] || []
      const next = selected.includes(areaId) ? selected.filter(id => id !== areaId) : [...selected, areaId]
      return { ...current, [membershipId]: next }
    })
  }

  const save = async (membershipId: string) => {
    setBusy(true); setError('')
    try {
      await adherenceService.updateAuditorAreas(membershipId, draft[membershipId] || [])
      await load()
      notify('Áreas asignadas correctamente')
    } catch (caught) { fail(caught, 'No fue posible guardar la asignación') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      {error && <div className="almera-alert"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setError('')}><X size={15} /></button></div>}
      {notice && <div className="almera-notice"><CheckCircle2 size={17} />{notice}</div>}

      <Card accent={identity.color} className="p-5">
        <p className="ds-eyebrow">Acceso por área</p>
        <h2 className="mt-1 text-xl font-black">Auditores del módulo</h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Aquí solo aparecen usuarios cuyo rol ya tiene habilitado el módulo "Matrices de Adherencia"
          (eso se controla desde Roles y Permisos). Cada uno solo verá las áreas, profesionales y evaluaciones
          de las áreas que le asignes; sin ninguna asignada, no verá nada. Los usuarios con permiso de
          administrar el módulo ven todas las áreas sin restricción.
        </p>
      </Card>

      <Card accent={identity.color} className="overflow-hidden">
        <div className="table-toolbar">
          <div className="almera-panel-title"><span><ShieldCheck size={19} /></span><div><h2>Asignación de áreas</h2><p>{auditors.length} usuarios con acceso al módulo</p></div></div>
        </div>
        <Table>
          <thead><tr><th>Usuario</th><th>Rol</th><th>Áreas asignadas</th><th></th></tr></thead>
          <tbody>
            {auditors.map(auditor => (
              <tr key={auditor.membership_id}>
                <td><strong>{auditor.full_name}</strong><small>{auditor.email}</small></td>
                <td>{auditor.role_name}</td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    {areas.map(area => {
                      const checked = (draft[auditor.membership_id] || []).includes(area.id)
                      return (
                        <label
                          key={area.id}
                          className="ds-badge"
                          style={{ cursor: 'pointer', ...(checked ? { background: `${identity.color}18`, color: identity.color } : { background: 'var(--color-surface-soft)', color: 'var(--muted)' }) }}
                        >
                          <input type="checkbox" checked={checked} onChange={() => toggleArea(auditor.membership_id, area.id)} style={{ marginRight: 6 }} />
                          {area.name}
                        </label>
                      )
                    })}
                    {!areas.length && <span className="text-xs text-[var(--muted)]">No hay áreas creadas todavía</span>}
                  </div>
                </td>
                <td><button className="row-action" style={{ color: identity.color }} onClick={() => void save(auditor.membership_id)} disabled={busy}><Save size={14} />Guardar</button></td>
              </tr>
            ))}
            {!auditors.length && <tr><td colSpan={4}><div className="almera-empty"><ShieldCheck size={30} /><p>Ningún usuario tiene el módulo habilitado todavía. Asígnalo desde Administración → Roles y permisos.</p></div></td></tr>}
          </tbody>
        </Table>
      </Card>
    </div>
  )
}
