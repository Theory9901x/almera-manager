import { useEffect, useState } from 'react'
import { BarChart3, Download, Loader2 } from 'lucide-react'
import {
  BarChart, Button, Card, DatePicker, EmptyState, Field, LineChart, Select, Table,
  moduleIdentity, useToast,
} from '@/design-system'
// Semaforo del modulo: verde desde 85 % (ver src/modules/checklists/scale.ts).
import { checklistColor as semaphoreColor } from '../scale'
import { checklistsService } from '../services/checklistsService'
import type { AnalyticsFilters, AnalyticsSummary, ChecklistArea, ChecklistTemplate } from '../types'

const identity = moduleIdentity('checklists')

// "Sin dato" y 0 % son cosas distintas: null significa que nada aplicaba (todo NA), no que se
// incumpliera todo. Se muestra en gris, nunca en rojo.
function formatPercent(percent: number | null) {
  return percent === null ? 'Sin dato' : `${percent.toFixed(1)}%`
}

export function AnalyticsPanel({ templates, areas }: { templates: ChecklistTemplate[]; areas: ChecklistArea[] }) {
  const toast = useToast()
  const [filters, setFilters] = useState<AnalyticsFilters>({})
  const [data, setData] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    setLoading(true)
    checklistsService.analytics(filters)
      .then(setData)
      .catch(cause => toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar la analítica'))
      .finally(() => setLoading(false))
  }, [filters.templateId, filters.areaId, filters.dateFrom, filters.dateTo])

  async function exportConsolidated() {
    setExporting(true)
    try { await checklistsService.downloadConsolidated(filters) }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible generar el consolidado') }
    finally { setExporting(false) }
  }

  return (
    <>
      <Card accent={identity.color} className="p-4">
        <div className="inline-action-bar" style={{ border: 0, boxShadow: 'none', padding: 0, background: 'transparent' }}>
          <div className="min-w-[220px]">
            <Field label="Lista">
              <Select
                value={filters.templateId || 'ALL'}
                onChange={value => setFilters({ ...filters, templateId: value === 'ALL' ? undefined : value })}
                options={[{ value: 'ALL', label: 'Todas' }, ...templates.map(template => ({ value: template.id, label: template.name }))]}
              />
            </Field>
          </div>
          <div className="min-w-[180px]">
            <Field label="Área / servicio">
              <Select
                value={filters.areaId || 'ALL'}
                onChange={value => setFilters({ ...filters, areaId: value === 'ALL' ? undefined : value })}
                options={[{ value: 'ALL', label: 'Todas' }, ...areas.map(area => ({ value: area.id, label: area.center ? `${area.center} · ${area.name}` : area.name }))]}
              />
            </Field>
          </div>
          <div className="w-[170px]"><Field label="Desde"><DatePicker value={filters.dateFrom || ''} onChange={value => setFilters({ ...filters, dateFrom: value || undefined })} /></Field></div>
          <div className="w-[170px]"><Field label="Hasta"><DatePicker value={filters.dateTo || ''} onChange={value => setFilters({ ...filters, dateTo: value || undefined })} /></Field></div>
          <div className="ml-auto">
            <Button identity={identity} onClick={() => void exportConsolidated()} disabled={exporting || !data?.auditCount}>
              <Download size={15} /> {exporting ? 'Generando…' : 'Consolidado PDF'}
            </Button>
          </div>
        </div>
        <p className="survey-config-hint mt-2">
          Solo entran <strong>auditorías cerradas</strong>: una en borrador está a medio diligenciar y
          distorsionaría el indicador.
        </p>
      </Card>

      {loading ? (
        <Card accent={identity.color} className="p-5"><div className="flex justify-center"><Loader2 className="animate-spin" size={20} /></div></Card>
      ) : !data || !data.auditCount ? (
        <Card accent={identity.color} className="p-5">
          <EmptyState
            icon={BarChart3}
            title="Todavía no hay auditorías cerradas"
            description="Cuando se cierre la primera auditoría con estos filtros, aquí aparecerán los indicadores de adherencia y podrás exportar el consolidado."
          />
        </Card>
      ) : (
        <>
          <Card accent={identity.color} className="p-5">
            <p className="ds-eyebrow">Resultado agregado</p>
            <h2 className="mt-1 text-xl font-black">Adherencia consolidada</h2>
            <div className="checklist-result-strip mt-4">
              <div className="checklist-result-main">
                <span className="num" style={{ color: semaphoreColor(data.overall.percent) }}>{formatPercent(data.overall.percent)}</span>
                <span className="lbl">Adherencia consolidada</span>
              </div>
              <div className="checklist-result-tallies">
                <div><strong>{data.auditCount}</strong><span>Auditorías</span></div>
                <div><strong>{data.overall.c}</strong><span>Cumple</span></div>
                <div><strong>{data.overall.nc}</strong><span>No cumple</span></div>
                <div><strong>{data.overall.na}</strong><span>No aplica</span></div>
              </div>
            </div>
            <p className="survey-config-hint mt-2">
              Se calcula sobre el total de criterios de todas las auditorías incluidas, no como promedio de
              promedios: así una ronda con muchos sujetos pesa lo que realmente aporta.
            </p>
          </Card>

          {data.byMonth.length > 1 && (
            <Card accent={identity.color} className="p-5">
              <h3 className="mb-3 text-base font-bold">Evolución de la adherencia</h3>
              <LineChart
                height={240}
                color={identity.color}
                valueSuffix="%"
                data={data.byMonth.map(row => ({ label: row.period || '', value: row.percent }))}
              />
            </Card>
          )}

          {data.byDomain.length > 0 && (
            <Card accent={identity.color} className="p-5">
              <h3 className="mb-3 text-base font-bold">Adherencia por dominio</h3>
              <BarChart
                height={Math.max(200, data.byDomain.length * 38 + 40)}
                orientation="horizontal"
                valueSuffix="%"
                data={data.byDomain.map(row => ({
                  label: row.name || '', value: row.percent,
                  // Color semantico por barra: el semaforo manda sobre la identidad del modulo.
                  color: semaphoreColor(row.percent),
                }))}
              />
            </Card>
          )}

          {data.byArea.length > 0 && (
            <Card accent={identity.color} className="p-5">
              <h3 className="mb-3 text-base font-bold">Adherencia por área / servicio</h3>
              <BarChart
                height={Math.max(200, data.byArea.length * 38 + 40)}
                orientation="horizontal"
                valueSuffix="%"
                data={data.byArea.map(row => ({ label: row.name || '', value: row.percent, color: semaphoreColor(row.percent) }))}
              />
            </Card>
          )}

          {data.worstCriteria.length > 0 && (
            <Card accent={identity.color} className="overflow-hidden">
              <div className="table-toolbar">
                <div className="almera-panel-title" style={{ ['--ds-accent' as string]: identity.color }}>
                  <span><BarChart3 size={19} /></span>
                  <div><h2>Criterios más incumplidos</h2><p>Dónde concentrar la mejora</p></div>
                </div>
              </div>
              <div className="checklists-table">
                <Table>
                  <thead><tr><th>Criterio</th><th>Lista</th><th>No cumple</th><th>Evaluado</th><th>Adherencia</th></tr></thead>
                  <tbody>
                    {data.worstCriteria.map((row, index) => (
                      <tr key={row.id || index}>
                        <td>{row.text}</td>
                        <td>{row.template_name}</td>
                        <td className="tabular-col">{row.nc}</td>
                        <td className="tabular-col">{row.applicable}</td>
                        <td className="tabular-col"><strong style={{ color: semaphoreColor(row.percent) }}>{formatPercent(row.percent)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card>
          )}
        </>
      )}
    </>
  )
}
