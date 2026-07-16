import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowLeft, Download, FileDown, ListChecks, Loader2, Pencil, Users } from 'lucide-react'
import {
  Badge, Button, Card, EmptyState, PageHeader, ProgressBar, Select, StatCard, ToastProvider, moduleIdentity,
  semaphoreColor, useCountUp, useToast,
} from '@/design-system'
import { surveysService } from '../services/surveysService'
import { QUESTION_TYPE_INFO } from '../components/questionTypeMeta'
import type { QuestionStat, SurveyDetail, SurveyStats } from '../types'

const identity = moduleIdentity('surveys')

function CountUpValue({ value, suffix = '' }: { value: number; suffix?: string }) {
  const animated = useCountUp(value)
  return <>{Math.round(animated)}{suffix}</>
}

export default function SurveyResultsPage() {
  return <ToastProvider><SurveyResultsContent /></ToastProvider>
}

function SurveyResultsContent() {
  const { surveyId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const [survey, setSurvey] = useState<SurveyDetail | null>(null)
  const [stats, setStats] = useState<SurveyStats | null>(null)
  const [month, setMonth] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!surveyId) return
    setLoading(true)
    try {
      const [detail, statsResult] = await Promise.all([
        survey ? Promise.resolve(survey) : surveysService.detail(surveyId),
        surveysService.stats(surveyId, { month: month || undefined }),
      ])
      setSurvey(detail)
      setStats(statsResult)
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar los resultados') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [surveyId, month])

  if (loading && !stats) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin" size={24} /></div>
  if (!survey || !stats) return null

  const questionMeta = new Map(survey.pages.flatMap(page => page.questions).map(question => [question.id, question]))

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Resultados"
        title={survey.title}
        description={`${survey.code} · Tabulación y estadísticas de respuestas`}
        identity={identity}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/app/encuestas')}><ArrowLeft size={15} /> Encuestas</Button>
            <Button variant="secondary" onClick={() => navigate(`/app/encuestas/${survey.id}/constructor`)}><Pencil size={15} /> Constructor</Button>
            {stats.months.length > 0 && (
              <Select value={month} onChange={setMonth} placeholder="Todos los meses" options={[{ value: '', label: 'Todos los meses' }, ...stats.months.map(item => ({ value: item, label: item }))]} />
            )}
            <Button identity={identity} onClick={() => surveysService.exportCsv(survey.id, survey.code, { month: month || undefined })}><Download size={15} /> Exportar CSV</Button>
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Respuestas totales" value={<CountUpValue value={stats.totals.totalResponses} />} identity={identity} />
        <StatCard icon={ListChecks} label="Completadas" value={<CountUpValue value={stats.totals.completedResponses} />} identity={identity} />
        <StatCard icon={FileDown} label="Parciales" value={<CountUpValue value={stats.totals.partialResponses} />} detail="Formularios abandonados" identity={identity} />
        <StatCard label="Tasa de finalización" value={<CountUpValue value={stats.totals.completionRate} suffix="%" />} identity={identity} />
      </section>

      {!stats.totals.totalResponses ? (
        <Card accent={identity.color}>
          <EmptyState icon={Users} title="Aún no hay respuestas" description="Comparte el enlace público o el código QR de esta encuesta para empezar a recibir respuestas." />
        </Card>
      ) : (
        <div className="space-y-4">
          {stats.questions.map(question => {
            const meta = questionMeta.get(question.id)
            return <QuestionResultCard key={question.id} stat={question} prompt={meta?.prompt || question.prompt} />
          })}
        </div>
      )}
    </div>
  )
}

function QuestionResultCard({ stat, prompt }: { stat: QuestionStat; prompt: string }) {
  const info = QUESTION_TYPE_INFO[stat.type]
  const Icon = info.icon

  return (
    <Card accent={identity.color} className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: `${identity.color}18`, color: identity.color }}><Icon size={15} /></span>
          <h3 className="text-base font-bold">{prompt}</h3>
        </div>
        <Badge tone="neutral">{stat.totalAnswered} respuesta{stat.totalAnswered === 1 ? '' : 's'}</Badge>
      </div>

      {stat.breakdown && stat.breakdown.length > 0 && (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stat.breakdown.map(item => ({ name: item.label ?? String(item.value), count: item.count, percent: item.percent }))} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <defs>
                <linearGradient id={`survey-bar-${stat.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={identity.gradientFrom} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={identity.gradientTo} stopOpacity={0.65} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line, #e2e7f0)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={stat.breakdown.length > 4 ? -18 : 0} textAnchor={stat.breakdown.length > 4 ? 'end' : 'middle'} height={stat.breakdown.length > 4 ? 50 : 30} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip labelStyle={{ fontWeight: 700 }} />
              <Bar dataKey="count" fill={`url(#survey-bar-${stat.id})`} radius={[8, 8, 0, 0]} isAnimationActive animationDuration={600} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {stat.average != null && !stat.rows && (
        <div className="flex items-center gap-4">
          <p className="text-3xl font-black" style={{ color: semaphoreColor((stat.average / 5) * 100) }}>
            <CountUpValue value={stat.average} />
          </p>
          <p className="text-sm text-[var(--muted)]">Promedio</p>
        </div>
      )}

      {stat.rows && stat.rows.length > 0 && (
        <div className="space-y-3">
          {stat.rows.map(row => (
            <div key={row.rowId}>
              <div className="mb-1 flex items-center justify-between text-sm"><span>{row.label}</span><strong>{row.average ?? '—'}</strong></div>
              <ProgressBar percent={row.average != null ? (row.average / 5) * 100 : 0} />
            </div>
          ))}
        </div>
      )}

      {(stat.min != null || stat.max != null) && (
        <div className="mt-2 flex gap-6 text-sm text-[var(--muted)]">
          <span>Mínimo: <strong className="text-[var(--ink)]">{stat.min}</strong></span>
          <span>Máximo: <strong className="text-[var(--ink)]">{stat.max}</strong></span>
        </div>
      )}

      {stat.sample && (
        <ul className="survey-sample-list">
          {stat.sample.length ? stat.sample.map((text, index) => <li key={index}>“{text}”</li>) : <li className="survey-config-empty">Sin respuestas de texto todavía.</li>}
        </ul>
      )}
    </Card>
  )
}
