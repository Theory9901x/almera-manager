import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDown, ArrowLeft, ArrowUp, Download, FileDown, ListChecks, Loader2, Pencil, Users } from 'lucide-react'
import {
  Badge, Button, Card, EmptyState, Field, PageHeader, ProgressBar, Select, StatCard, ToastProvider, moduleIdentity,
  semaphoreColor, useCountUp, useToast,
} from '@/design-system'
import { surveysService } from '../services/surveysService'
import { QUESTION_TYPE_INFO } from '../components/questionTypeMeta'
import type { QuestionStat, Respondent, SurveyDetail, SurveyOption, SurveyQuestion, SurveyStats } from '../types'

const identity = moduleIdentity('surveys')
const SEGMENT_TYPES = new Set(['SINGLE_CHOICE', 'DROPDOWN', 'YES_NO', 'IMAGE_CHOICE'])

function CountUpValue({ value, suffix = '' }: { value: number; suffix?: string }) {
  const animated = useCountUp(value)
  return <>{Math.round(animated)}{suffix}</>
}

function segmentOptions(question: SurveyQuestion | undefined): SurveyOption[] {
  if (!question) return []
  if (question.type === 'YES_NO') return [{ id: 'SI', label: 'Sí' }, { id: 'NO', label: 'No' }]
  if (question.config.multiple) return []
  return (question.config.options as SurveyOption[]) || []
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
  const [respondents, setRespondents] = useState<Respondent[]>([])
  const [liveTotals, setLiveTotals] = useState<{ totalResponses: number; completedResponses: number } | null>(null)
  const [month, setMonth] = useState('')
  const [respondentId, setRespondentId] = useState('')
  const [segmentQuestionId, setSegmentQuestionId] = useState('')
  const [segmentValue, setSegmentValue] = useState('')
  const [loading, setLoading] = useState(true)

  const questions = useMemo(() => survey?.pages.flatMap(page => page.questions) || [], [survey])
  const segmentCandidates = useMemo(() => questions.filter(question => SEGMENT_TYPES.has(question.type) && segmentOptions(question).length > 0), [questions])
  const segmentQuestion = questions.find(question => question.id === segmentQuestionId)

  async function load() {
    if (!surveyId) return
    setLoading(true)
    try {
      const [detail, statsResult, respondentsResult] = await Promise.all([
        survey ? Promise.resolve(survey) : surveysService.detail(surveyId),
        surveysService.stats(surveyId, {
          month: month || undefined, respondentMembershipId: respondentId || undefined,
          segmentQuestionId: segmentQuestionId || undefined, segmentValue: segmentValue || undefined,
        }),
        respondents.length ? Promise.resolve(respondents) : surveysService.respondents(surveyId),
      ])
      setSurvey(detail)
      setStats(statsResult)
      setRespondents(respondentsResult)
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar los resultados') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [surveyId, month, respondentId, segmentQuestionId, segmentValue])

  // Contador en vivo: sondeo liviano mientras la encuesta esta publicada, independiente de los
  // filtros aplicados a la tabulacion (siempre refleja el total real de la encuesta completa).
  useEffect(() => {
    if (!surveyId || survey?.status !== 'PUBLICADA') return
    let cancelled = false
    async function poll() {
      try { const result = await surveysService.liveCount(surveyId!); if (!cancelled) setLiveTotals(result) } catch { /* silencioso: no interrumpe la vista */ }
    }
    void poll()
    const interval = window.setInterval(poll, 8000)
    return () => { cancelled = true; window.clearInterval(interval) }
  }, [surveyId, survey?.status])

  if (loading && !stats) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin" size={24} /></div>
  if (!survey || !stats) return null

  const questionMeta = new Map(questions.map(question => [question.id, question]))
  const comparison = stats.comparison

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
            <Button identity={identity} onClick={() => surveysService.exportCsv(survey.id, survey.code, { month: month || undefined })}><Download size={15} /> Exportar CSV</Button>
          </div>
        }
      />

      {survey.status === 'PUBLICADA' && liveTotals && (
        <div className="survey-live-badge">
          <span className="survey-live-dot" /> En vivo: <strong>{liveTotals.completedResponses}</strong> respuestas completadas ({liveTotals.totalResponses} en total)
        </div>
      )}

      <Card accent={identity.color} className="flex flex-wrap items-end gap-3 p-4">
        {stats.months.length > 0 && (
          <Field label="Mes"><Select value={month} onChange={setMonth} placeholder="Todos los meses" options={[{ value: '', label: 'Todos los meses' }, ...stats.months.map(item => ({ value: item, label: item }))]} /></Field>
        )}
        {respondents.length > 0 && (
          <Field label="Usuario">
            <Select value={respondentId} onChange={setRespondentId} placeholder="Todos los usuarios" options={[{ value: '', label: 'Todos los usuarios' }, ...respondents.map(item => ({ value: item.membership_id, label: item.full_name }))]} />
          </Field>
        )}
        {segmentCandidates.length > 0 && (
          <>
            <Field label="Cruzar por">
              <Select
                value={segmentQuestionId}
                onChange={value => { setSegmentQuestionId(value); setSegmentValue('') }}
                placeholder="Sin cruce"
                options={[{ value: '', label: 'Sin cruce' }, ...segmentCandidates.map(question => ({ value: question.id, label: question.prompt }))]}
              />
            </Field>
            {segmentQuestion && (
              <Field label="Valor">
                <Select
                  value={segmentValue}
                  onChange={setSegmentValue}
                  placeholder="Selecciona un valor"
                  options={segmentOptions(segmentQuestion).map(option => ({ value: option.id, label: option.label }))}
                />
              </Field>
            )}
          </>
        )}
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Respuestas totales" value={<CountUpValue value={stats.totals.totalResponses} />} identity={identity} />
        <StatCard
          icon={ListChecks} label="Completadas" value={<CountUpValue value={stats.totals.completedResponses} />} identity={identity}
          detail={comparison ? `${comparison.deltaPercent == null ? 'Sin datos' : `${comparison.deltaPercent >= 0 ? '+' : ''}${comparison.deltaPercent}%`} vs ${comparison.previousMonth}` : undefined}
        />
        <StatCard icon={FileDown} label="Parciales" value={<CountUpValue value={stats.totals.partialResponses} />} detail="Formularios abandonados" identity={identity} />
        <StatCard label="Tasa de finalización" value={<CountUpValue value={stats.totals.completionRate} suffix="%" />} identity={identity} />
      </section>

      {comparison && comparison.deltaPercent != null && (
        <p className={`survey-comparison-note ${comparison.deltaPercent >= 0 ? 'is-up' : 'is-down'}`}>
          {comparison.deltaPercent >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
          {Math.abs(comparison.deltaPercent)}% respecto a {comparison.previousMonth} ({comparison.previousCompletedResponses} respuestas completadas)
        </p>
      )}

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
  const npsColor = stat.npsScore == null ? '#94A3B8' : stat.npsScore >= 50 ? '#059669' : stat.npsScore >= 0 ? '#D97706' : '#DC2626'

  return (
    <Card accent={identity.color} className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: `${identity.color}18`, color: identity.color }}><Icon size={15} /></span>
          <h3 className="text-base font-bold">{prompt}</h3>
        </div>
        <Badge tone="neutral">{stat.totalAnswered} respuesta{stat.totalAnswered === 1 ? '' : 's'}</Badge>
      </div>

      {stat.type === 'NPS' && stat.npsScore != null && (
        <div className="mb-4 flex items-center gap-4">
          <p className="text-4xl font-black" style={{ color: npsColor }}><CountUpValue value={stat.npsScore} /></p>
          <div>
            <p className="text-sm font-bold">Puntaje NPS</p>
            <p className="text-xs text-[var(--muted)]">Promotores menos detractores, de -100 a 100</p>
          </div>
        </div>
      )}

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

      {stat.ranking && stat.ranking.length > 0 && (
        <ol className="survey-ranking-results">
          {stat.ranking.map((item, index) => (
            <li key={item.optionId}>
              <span className="survey-ranking-results-position" style={{ background: identity.color }}>{index + 1}</span>
              <span className="survey-ranking-results-label">{item.label}</span>
              <span className="survey-ranking-results-avg">Posición promedio: {item.averagePosition ?? '—'}</span>
            </li>
          ))}
        </ol>
      )}

      {stat.matching && stat.matching.length > 0 && (
        <div className="space-y-3">
          {stat.accuracyPercent != null && <Badge tone="info">Aciertos: {stat.accuracyPercent}%</Badge>}
          <div className="survey-matching-results">
            {stat.matching.map(item => (
              <div key={item.itemId} className="survey-matching-results-row">
                <span className="survey-matching-results-label">{item.label}</span>
                <span className="survey-matching-results-arrow">→</span>
                <span className="survey-matching-results-target">{item.topTargetLabel || 'Sin ubicar'}{item.topTargetCount > 0 && ` (${item.topTargetCount})`}</span>
              </div>
            ))}
          </div>
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
