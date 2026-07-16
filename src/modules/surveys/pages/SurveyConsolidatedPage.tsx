import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowLeft, ClipboardList, Loader2, Percent, Radio, Users } from 'lucide-react'
import {
  Badge, Card, EmptyState, PageHeader, StatCard, Table, ToastProvider, moduleIdentity, useCountUp, useToast,
} from '@/design-system'
import { Button } from '@/design-system'
import { surveysService } from '../services/surveysService'
import type { Survey, SurveyStatus } from '../types'

const identity = moduleIdentity('surveys')
const STATUS_LABEL: Record<SurveyStatus, string> = { BORRADOR: 'Borrador', PUBLICADA: 'Publicada', CERRADA: 'Cerrada' }
const STATUS_TONE: Record<SurveyStatus, 'neutral' | 'info'> = { BORRADOR: 'neutral', PUBLICADA: 'info', CERRADA: 'neutral' }

function CountUpValue({ value, suffix = '' }: { value: number; suffix?: string }) {
  const animated = useCountUp(value)
  return <>{Math.round(animated)}{suffix}</>
}

// Consolidado (fase 4): vista agregada sobre todas las encuestas de la entidad (no plantillas),
// calculada en el cliente a partir del listado — sin necesidad de un endpoint de agregacion nuevo.
export default function SurveyConsolidatedPage() {
  return <ToastProvider><SurveyConsolidatedContent /></ToastProvider>
}

function SurveyConsolidatedContent() {
  const navigate = useNavigate()
  const toast = useToast()
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    surveysService.list({ template: 'false' })
      .then(setSurveys)
      .catch(cause => toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar el consolidado'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totals = useMemo(() => {
    const totalResponses = surveys.reduce((sum, survey) => sum + survey.completed_count, 0)
    const totalStarted = surveys.reduce((sum, survey) => sum + survey.response_count, 0)
    const published = surveys.filter(survey => survey.status === 'PUBLICADA').length
    return {
      totalSurveys: surveys.length,
      totalResponses,
      published,
      completionRate: totalStarted ? Math.round((totalResponses / totalStarted) * 100) : 0,
    }
  }, [surveys])

  const topSurveys = useMemo(
    () => surveys.slice().sort((a, b) => b.completed_count - a.completed_count).slice(0, 10),
    [surveys],
  )

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin" size={24} /></div>

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Consolidado"
        title="Consolidado de encuestas"
        description="Vista general de todas las encuestas de la entidad: volumen de respuestas y estado de publicación."
        identity={identity}
        actions={<Button variant="secondary" onClick={() => navigate('/app/encuestas')}><ArrowLeft size={15} /> Encuestas</Button>}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ClipboardList} label="Encuestas" value={<CountUpValue value={totals.totalSurveys} />} identity={identity} />
        <StatCard icon={Radio} label="Publicadas" value={<CountUpValue value={totals.published} />} identity={identity} />
        <StatCard icon={Users} label="Respuestas completadas" value={<CountUpValue value={totals.totalResponses} />} identity={identity} />
        <StatCard icon={Percent} label="Tasa de finalización" value={<CountUpValue value={totals.completionRate} suffix="%" />} detail="Promedio de todas las encuestas" identity={identity} />
      </section>

      {!surveys.length ? (
        <Card accent={identity.color}>
          <EmptyState icon={ClipboardList} title="Aún no hay encuestas" description="Crea tu primera encuesta para ver el consolidado aquí." />
        </Card>
      ) : (
        <>
          <Card accent={identity.color} className="p-5">
            <p className="ds-eyebrow mb-3">Respuestas completadas por encuesta</p>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topSurveys.map(survey => ({ name: survey.code, full: survey.title, count: survey.completed_count }))} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <defs>
                    <linearGradient id="survey-consolidated-bar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={identity.gradientFrom} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={identity.gradientTo} stopOpacity={0.65} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line, #e2e7f0)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={50} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip labelFormatter={(label, payload) => payload?.[0]?.payload?.full || label} />
                  <Bar dataKey="count" name="Respuestas" fill="url(#survey-consolidated-bar)" radius={[8, 8, 0, 0]} isAnimationActive animationDuration={600} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card accent={identity.color} className="overflow-hidden">
            <Table>
              <thead><tr><th>Código</th><th>Encuesta</th><th>Estado</th><th>Respuestas</th><th>Completadas</th><th>Tasa</th></tr></thead>
              <tbody>
                {surveys.map(survey => {
                  const rate = survey.response_count ? Math.round((survey.completed_count / survey.response_count) * 100) : 0
                  return (
                    <tr key={survey.id} className="cursor-pointer" onClick={() => navigate(`/app/encuestas/${survey.id}/resultados`)}>
                      <td>{survey.code}</td>
                      <td>{survey.title}</td>
                      <td><Badge tone={STATUS_TONE[survey.status]}>{STATUS_LABEL[survey.status]}</Badge></td>
                      <td>{survey.response_count}</td>
                      <td>{survey.completed_count}</td>
                      <td>{rate}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </Card>
        </>
      )}
    </div>
  )
}
