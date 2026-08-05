import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, AlertTriangle, ClipboardCheck, ClipboardList, Clock, FileWarning, Info, Loader2,
  TrendingDown, TrendingUp, UserX,
} from 'lucide-react'
import {
  BarChart, DatePicker, EmptyState, LineChart, Select, moduleIdentity, useCountUp, useToast,
} from '@/design-system'
// Semaforo del modulo: verde desde 85 % (ver src/modules/checklists/scale.ts).
import { checklistColor as semaphoreColor } from '../scale'
import { checklistsService } from '../services/checklistsService'
import type { ChecklistDashboard, DataCenterFilters, DataCenterOptions } from '../types'

const identity = moduleIdentity('checklists')

const PERIODS = [
  { value: 'dia', label: 'Diaria' },
  { value: 'semana', label: 'Semanal' },
  { value: 'mes', label: 'Mensual' },
  { value: 'trimestre', label: 'Trimestral' },
]

const CONCEPT_LABEL: Record<string, string> = {
  OPTIMO: 'Óptimo', ACEPTABLE: 'Aceptable', DEFICIENTE: 'Deficiente', MUY_DEFICIENTE: 'Muy deficiente',
}

const short = (text: string, max = 24) => text.length > max ? `${text.slice(0, max - 1)}…` : text

/** Gauge SEMICIRCULAR del molde. El color sale del semáforo, no de la identidad del módulo. */
function Gauge({ percent }: { percent: number | null }) {
  const animated = useCountUp(percent ?? 0)
  const value = percent === null ? 0 : Math.max(0, Math.min(100, animated))
  // Semicírculo: la longitud del arco es π·r, y el trazo se recorta con dasharray.
  const radius = 78
  const length = Math.PI * radius
  const color = semaphoreColor(percent)
  return (
    <div className="ckd-gauge">
      <svg width="200" height="116" viewBox="0 0 200 116">
        <path d={`M 22 100 A ${radius} ${radius} 0 0 1 178 100`} fill="none" stroke="var(--ckd-track)" strokeWidth="16" strokeLinecap="round" />
        <path
          d={`M 22 100 A ${radius} ${radius} 0 0 1 178 100`}
          fill="none" stroke={color} strokeWidth="16" strokeLinecap="round"
          strokeDasharray={length} strokeDashoffset={length - (length * value) / 100}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <div className="ckd-gauge-center">
        <strong style={{ color }}>{percent === null ? '—' : `${value.toFixed(1)}%`}</strong>
        <span>Adherencia general</span>
      </div>
    </div>
  )
}

/** Sparkline de una serie corta. SVG suelto: 40×18 px no justifica instanciar ECharts por fila. */
function Sparkline({ points }: { points: (number | null)[] }) {
  const valid = points.filter((value): value is number => value !== null)
  if (valid.length < 2) return <span className="ckd-spark-empty">—</span>
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  const span = max - min || 1
  const step = 60 / (points.length - 1)
  const path = points
    .map((value, index) => value === null ? null : `${index * step},${20 - ((value - min) / span) * 18}`)
    .filter(Boolean)
    .join(' ')
  return (
    <svg width="60" height="22" viewBox="0 0 60 22" className="ckd-spark">
      {/* Identidad del módulo, no semáforo: esto dice CÓMO se movió, no qué tan bien va — el
          nivel ya lo dice el % de la fila, y con dos colores se contradecían. */}
      <polyline points={path} fill="none" stroke={identity.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="ckd-kd-none">Filtra por fechas para comparar</span>
  return (
    <span className={value >= 0 ? 'ckd-kd-up' : 'ckd-kd-down'}>
      {value >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {value >= 0 ? '+' : ''}{value.toFixed(1)} pts vs. período anterior
    </span>
  )
}

/**
 * Dashboard del módulo (§15.2-15.4). Consume el MISMO cálculo que el centro de datos
 * (`dataCenterData` en el servidor): si tuviera su propia agregación, el dashboard y el tablero
 * acabarían diciendo cifras distintas del mismo período y nadie sabría a cuál creerle.
 *
 * Lo que el molde pedía y NO está, por decisión tomada: «parcialmente cumplidas» (la escala es
 * C/NC/NA, no hay estado intermedio) y «vencidas» (las auditorías no llevan plazo).
 */
export function DashboardPanel() {
  const navigate = useNavigate()
  const toast = useToast()
  const [options, setOptions] = useState<DataCenterOptions | null>(null)
  const [filters, setFilters] = useState<DataCenterFilters>({ period: 'mes' })
  const [data, setData] = useState<ChecklistDashboard | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { checklistsService.dataCenterOptions().then(setOptions).catch(() => {}) }, [])
  useEffect(() => {
    setLoading(true)
    checklistsService.dashboard(filters)
      .then(setData)
      .catch(cause => toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar el dashboard'))
      .finally(() => setLoading(false))
  }, [filters])

  const set = (patch: Partial<DataCenterFilters>) => setFilters(current => ({ ...current, ...patch }))

  const deltaPercent = useMemo(() => {
    if (!data?.previous || data.previous.percent === null || data.overall.percent === null) return null
    return data.overall.percent - data.previous.percent
  }, [data])

  if (loading && !data) return <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin" size={22} /></div>
  if (!data) return null

  const info = data.systemInfo
  const señales = info.openAudits.length + info.unusedTemplates.length + info.idleAuditors.length
    + (info.findingsWithoutPlan > 0 ? 1 : 0)
  const hasData = data.kpis.audits > 0

  return (
    <div className="ckd">
      <div className="ckd-filters">
        <div className="ckd-f">
          <span>Lista</span>
          <Select
            value={filters.templateId || 'ALL'}
            onChange={value => set({ templateId: value === 'ALL' ? undefined : value })}
            options={[{ value: 'ALL', label: 'Todas' }, ...(options?.templates || []).map(t => ({ value: t.id, label: t.name }))]}
          />
        </div>
        <div className="ckd-f">
          <span>Sede</span>
          <Select
            value={filters.center || 'ALL'}
            onChange={value => setFilters(current => ({ ...current, center: value === 'ALL' ? undefined : value, areaId: undefined }))}
            options={[{ value: 'ALL', label: 'Todas' }, ...(options?.centers || []).map(c => ({ value: c || 'SIN', label: c || 'Sin centro' }))]}
          />
        </div>
        <div className="ckd-f"><span>Desde</span><DatePicker value={filters.dateFrom || ''} onChange={value => set({ dateFrom: value || undefined })} /></div>
        <div className="ckd-f"><span>Hasta</span><DatePicker value={filters.dateTo || ''} onChange={value => set({ dateTo: value || undefined })} /></div>
        <div className="ckd-f">
          <span>Agrupar</span>
          <Select value={filters.period || 'mes'} onChange={value => set({ period: value })} options={PERIODS} />
        </div>
      </div>

      {!hasData ? (
        <div className="ckd-card">
          <EmptyState
            icon={ClipboardCheck}
            title="Todavía no hay auditorías cerradas"
            description="El dashboard mide sobre rondas cerradas. En cuanto se cierre la primera, aquí aparecen la adherencia, la tendencia y el resumen por programa."
          />
        </div>
      ) : (
        <>
          <div className="ckd-top">
            <div className="ckd-card ckd-gaugecard">
              <p className="ckd-eyebrow">Resultado del período</p>
              <Gauge percent={data.overall.percent} />
              <div className="ckd-gauge-foot">
                <span className="ckd-concept" style={{
                  background: `color-mix(in srgb, ${semaphoreColor(data.overall.percent)} 14%, transparent)`,
                  color: semaphoreColor(data.overall.percent),
                }}>
                  {data.overall.concept ? CONCEPT_LABEL[data.overall.concept] || data.overall.concept : 'Sin dato'}
                </span>
                <Delta value={deltaPercent} />
              </div>
            </div>

            <div className="ckd-kpis">
              <div className="ckd-kpi"><span className="ic"><ClipboardCheck size={17} /></span>
                <div><div className="l">Auditorías cerradas</div><div className="v">{data.kpis.audits}</div>
                  <div className="d">{data.previous ? `${data.previous.audits} en el período anterior` : 'del recorte actual'}</div></div>
              </div>
              <div className="ckd-kpi"><span className="ic"><AlertTriangle size={17} /></span>
                <div><div className="l">No conformidades</div><div className="v">{data.overall.nc}</div>
                  <div className="d">{data.kpis.criticalCriteria} criterios críticos</div></div>
              </div>
              <div className="ckd-kpi"><span className="ic"><ClipboardList size={17} /></span>
                <div><div className="l">Planes abiertos</div><div className="v">{data.kpis.plansOpen}</div>
                  <div className="d">{data.kpis.plansClosed} cerrados</div></div>
              </div>
              <div className="ckd-kpi"><span className="ic"><Clock size={17} /></span>
                <div><div className="l">Servicios auditados</div><div className="v">{data.kpis.areas}</div>
                  <div className="d">{data.kpis.subjects} evaluados</div></div>
              </div>
            </div>
          </div>

          <div className="ckd-row">
            <div className="ckd-card">
              <p className="ckd-title">Tendencia de adherencia</p>
              <LineChart
                data={data.byDate.map(row => ({ label: row.period || '', value: row.percent }))}
                color={identity.color} area height={220}
                valueFormatter={value => `${Math.round(value)}`}
                referenceLine={{ value: 70, label: 'Mínimo aceptable' }}
              />
            </div>
            <div className="ckd-card">
              <p className="ckd-title">Adherencia por servicio</p>
              <BarChart
                orientation="horizontal" height={220} hideValueAxis
                data={data.byArea.slice(0, 7).map(row => ({
                  label: short(row.name || '', 20), value: row.percent,
                  color: row.percent === null ? '#94A3B8' : semaphoreColor(row.percent),
                }))}
                valueFormatter={value => `${value.toFixed(1)} %`}
              />
            </div>
          </div>

          <div className="ckd-card">
            <p className="ckd-title">Resumen por programa</p>
            <div className="ckd-table-wrap">
              <table className="ckd-table">
                <thead><tr><th>Programa</th><th>Rondas</th><th>C</th><th>NC</th><th>NA</th><th>Tendencia</th><th>Adherencia</th></tr></thead>
                <tbody>
                  {data.byProgram.map(row => (
                    <tr key={row.name}>
                      <td><strong>{row.name}</strong></td>
                      <td className="tabular-col">{row.audits}</td>
                      <td className="tabular-col">{row.c}</td>
                      <td className="tabular-col">{row.nc}</td>
                      <td className="tabular-col">{row.na}</td>
                      <td><Sparkline points={row.series.map(point => point.percent)} /></td>
                      <td className="tabular-col">
                        <strong style={{ color: semaphoreColor(row.percent) }}>
                          {row.percent === null ? 'Sin dato' : `${row.percent.toFixed(1)} %`}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="ckd-row">
        {/* §15.3: el panel se conecta a datos que mueven trabajo, no a adornos (version, respaldo). */}
        <div className="ckd-card">
          <p className="ckd-title"><Info size={14} /> Información del sistema</p>
          {señales === 0 ? (
            <p className="ckd-ok">Nada pendiente: no hay rondas estancadas, listas sin usar ni hallazgos sin plan.</p>
          ) : (
            <div className="ckd-signals">
              {info.findingsWithoutPlan > 0 && (
                <button className="ckd-signal is-strong" onClick={() => navigate('/app/listas-chequeo/planes')}>
                  <span className="ic"><FileWarning size={16} /></span>
                  <span className="tx">
                    <b>{info.findingsWithoutPlan} hallazgo{info.findingsWithoutPlan === 1 ? '' : 's'} sin plan de mejora</b>
                    <small>Un NC sin responsable es un hallazgo perdido.</small>
                  </span>
                </button>
              )}
              {info.openAudits.length > 0 && (
                <div className="ckd-signal">
                  <span className="ic"><Clock size={16} /></span>
                  <span className="tx">
                    <b>{info.openAudits.length} auditoría{info.openAudits.length === 1 ? '' : 's'} sin cerrar hace más de 7 días</b>
                    <small>{info.openAudits.slice(0, 3).map(a => `${a.template_name} (${a.days_open} d)`).join(' · ')}</small>
                  </span>
                </div>
              )}
              {info.unusedTemplates.length > 0 && (
                <div className="ckd-signal">
                  <span className="ic"><ClipboardList size={16} /></span>
                  <span className="tx">
                    <b>{info.unusedTemplates.length} lista{info.unusedTemplates.length === 1 ? '' : 's'} publicada{info.unusedTemplates.length === 1 ? '' : 's'} sin ninguna ronda</b>
                    <small>{info.unusedTemplates.slice(0, 3).map(t => t.code || t.name).join(' · ')}</small>
                  </span>
                </div>
              )}
              {info.idleAuditors.length > 0 && (
                <div className="ckd-signal">
                  <span className="ic"><UserX size={16} /></span>
                  <span className="tx">
                    <b>{info.idleAuditors.length} auditor{info.idleAuditors.length === 1 ? '' : 'es'} asignado{info.idleAuditors.length === 1 ? '' : 's'} sin rondas</b>
                    <small>{info.idleAuditors.slice(0, 3).map(a => a.name).join(' · ')}</small>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="ckd-card">
          <p className="ckd-title"><Activity size={14} /> Actividad reciente</p>
          {data.activity.length ? (
            <ul className="ckd-activity">
              {data.activity.map(entry => (
                <li key={entry.id}>
                  <span className="dot" />
                  <div>
                    <b>{entry.action.charAt(0) + entry.action.slice(1).toLowerCase()}</b> · {entry.audit_label}
                    {entry.detail ? <span> — {entry.detail}</span> : null}
                    <small>{entry.actor_name} · {new Date(entry.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="ckd-ok">Sin movimientos registrados todavía.</p>}
        </div>
      </div>
    </div>
  )
}
