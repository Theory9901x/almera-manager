import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, Clock, Lock, Send } from 'lucide-react'
import { ToastProvider, fadeSlideUp, useToast } from '@/design-system'
import { publicSurveyService, PublicSurveyError } from '../services/publicSurveyService'
import { QuestionRenderer } from '../components/QuestionRenderer'
import { useTilt } from '../components/useTilt'
import { resolveLineIcon } from '../components/lineIcons'
import type { CardAccent, PublicSurvey, PublicSurveyQuestion } from '../types'

function deviceId() {
  const key = 'sgimr_survey_device_id'
  let value = window.localStorage.getItem(key)
  if (!value) {
    value = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `dev_${Math.random().toString(36).slice(2)}${Date.now()}`
    window.localStorage.setItem(key, value)
  }
  return value
}

function isAnswered(question: PublicSurveyQuestion, value: unknown): boolean {
  const record = (value || {}) as Record<string, unknown>
  switch (question.type) {
    case 'SHORT_TEXT':
    case 'LONG_TEXT': return Boolean(String(record.text || '').trim())
    case 'YES_NO':
    case 'SINGLE_CHOICE':
    case 'DROPDOWN':
    case 'IMAGE_CHOICE': return Boolean(record.optionId)
    case 'MULTIPLE_CHOICE': return Array.isArray(record.optionIds) && record.optionIds.length > 0
    case 'NUMBER': return record.number != null && record.number !== ''
    case 'DATE': return Boolean(record.date)
    case 'SCALE':
    case 'NPS':
    case 'RATING': return record.value != null
    case 'LIKERT_MATRIX': {
      const rows = (question.config.rows as { id: string }[]) || []
      const rowValues = (record.rows || {}) as Record<string, number>
      return rows.length > 0 && rows.every(row => rowValues[row.id] != null)
    }
    default: return true
  }
}

function validationError(question: PublicSurveyQuestion, value: unknown): string | null {
  if (!question.required) return null
  if (!isAnswered(question, value)) return 'Esta pregunta es obligatoria'
  if (question.type === 'MULTIPLE_CHOICE') {
    const record = (value || {}) as { optionIds?: string[] }
    const count = record.optionIds?.length || 0
    const min = question.config.minSelected as number | undefined
    const max = question.config.maxSelected as number | undefined
    if (min && count < min) return `Selecciona al menos ${min} opciones`
    if (max && count > max) return `Selecciona máximo ${max} opciones`
  }
  return null
}

export default function PublicSurveyPage() {
  return <ToastProvider><PublicSurveyContent /></ToastProvider>
}

function PublicSurveyContent() {
  const { slug } = useParams()
  const toast = useToast()

  const [phase, setPhase] = useState<'loading' | 'error' | 'login' | 'already-responded' | 'form' | 'done'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [survey, setSurvey] = useState<PublicSurvey | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [responseId, setResponseId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [thankYou, setThankYou] = useState('')

  useEffect(() => {
    if (!slug) return
    publicSurveyService.bySlug(slug, deviceId())
      .then(data => {
        setSurvey(data)
        setPhase(data.requiresLogin ? 'login' : data.alreadyResponded ? 'already-responded' : 'form')
      })
      .catch(cause => {
        setErrorMessage(cause instanceof PublicSurveyError ? cause.message : 'No fue posible cargar la encuesta')
        setPhase('error')
      })
  }, [slug])

  useEffect(() => {
    if (!survey) return
    document.title = `Encuesta: ${survey.title}`
    return () => { document.title = 'SGIMR' }
  }, [survey])

  const totalPages = survey?.pages.length || 0
  const totalQuestions = useMemo(() => survey?.pages.reduce((total, page) => total + page.questions.length, 0) || 0, [survey])
  const estimatedMinutes = Math.max(1, Math.round(totalQuestions * 0.25))
  const currentPage = survey?.pages[pageIndex]
  const isLastPage = pageIndex === totalPages - 1

  function setAnswer(questionId: string, value: unknown) {
    setAnswers(current => ({ ...current, [questionId]: value }))
    setFieldErrors(current => { const next = { ...current }; delete next[questionId]; return next })
  }

  function errorsForPage(page: PublicSurvey['pages'][number]): Record<string, string> {
    const errors: Record<string, string> = {}
    for (const question of page.questions) {
      const message = validationError(question, answers[question.id])
      if (message) errors[question.id] = message
    }
    return errors
  }

  function validateCurrentPage(): boolean {
    if (!currentPage) return true
    const errors = errorsForPage(currentPage)
    setFieldErrors(errors)
    return !Object.keys(errors).length
  }

  // Antes de enviar (ultimo paso), se revisan TODAS las paginas: una pregunta obligatoria sin
  // responder en una pagina anterior no debe descubrirse recien en el servidor con un error
  // generico sin poder volver a ese campo — se lleva al usuario directo a la primera pagina
  // con problemas y se marca ahi.
  function findFirstInvalidPage(): { index: number; errors: Record<string, string>; firstPrompt: string } | null {
    if (!survey) return null
    for (let index = 0; index < survey.pages.length; index += 1) {
      const page = survey.pages[index]
      const errors = errorsForPage(page)
      const errorQuestionIds = Object.keys(errors)
      if (errorQuestionIds.length) {
        const firstPrompt = page.questions.find(question => errorQuestionIds.includes(question.id))?.prompt || ''
        return { index, errors, firstPrompt }
      }
    }
    return null
  }

  function buildItems() {
    return Object.entries(answers)
      .filter(([, value]) => value != null)
      .map(([questionId, value]) => ({ questionId, value }))
  }

  async function goNext() {
    if (!survey || !slug) return
    if (!validateCurrentPage()) return

    if (!isLastPage) {
      setPageIndex(index => index + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      publicSurveyService.submit(slug, { completed: false, items: buildItems(), deviceId: deviceId(), responseId: responseId || undefined })
        .then(result => setResponseId(result.responseId))
        .catch(() => {})
      return
    }

    const firstInvalid = findFirstInvalidPage()
    if (firstInvalid) {
      setPageIndex(firstInvalid.index)
      setFieldErrors(firstInvalid.errors)
      toast.push('error', `Falta responder "${firstInvalid.firstPrompt}" en la página "${survey.pages[firstInvalid.index].title || firstInvalid.index + 1}"`)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setSubmitting(true)
    try {
      const result = await publicSurveyService.submit(slug, { completed: true, items: buildItems(), deviceId: deviceId(), responseId: responseId || undefined })
      setThankYou(result.thankYouMessage || survey.thank_you_message)
      setPhase('done')
    } catch (cause) {
      if (cause instanceof PublicSurveyError && cause.alreadyResponded) { setPhase('already-responded'); return }
      toast.push('error', cause instanceof PublicSurveyError ? cause.message : 'No fue posible enviar tu respuesta. Intenta nuevamente.')
    } finally {
      setSubmitting(false)
    }
  }

  function goPrev() {
    if (pageIndex === 0) return
    setPageIndex(index => index - 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (phase === 'loading') {
    return <div className="survey-public-shell survey-public-center"><div className="survey-public-spinner" /></div>
  }

  if (phase === 'error') {
    return (
      <div className="survey-public-shell survey-public-center">
        <div className="survey-status-card">
          <AlertTriangle size={30} />
          <h1>No es posible responder esta encuesta</h1>
          <p>{errorMessage}</p>
        </div>
      </div>
    )
  }

  if (!survey) return null

  if (phase === 'login') {
    return (
      <div className="survey-public-shell survey-public-center">
        <div className="survey-status-card">
          <Lock size={30} />
          <h1>Esta encuesta requiere iniciar sesión</h1>
          <p>Inicia sesión en SGIMR y vuelve a abrir este mismo enlace para responder "{survey.title}".</p>
          <a className="survey-status-link" href="/login">Ir a iniciar sesión</a>
        </div>
      </div>
    )
  }

  if (phase === 'already-responded') {
    return (
      <div className="survey-public-shell survey-public-center">
        <div className="survey-status-card">
          <CheckCircle2 size={30} style={{ color: survey.theme_color || '#0F7A54' }} />
          <h1>Ya respondiste esta encuesta</h1>
          <p>Esta encuesta solo admite una respuesta por persona. ¡Gracias por tu participación!</p>
        </div>
      </div>
    )
  }

  const themeColor = survey.theme_color || '#1F6F4A'
  const progressPercent = phase === 'done' ? 100 : totalPages ? (pageIndex / totalPages) * 100 : 0

  return (
    <div className="survey-public-shell" style={{ ['--survey-accent' as string]: themeColor }}>
      <div className="survey-public-topbar">
        <div className="survey-public-topbar-inner">
          <div className="survey-progress-track"><div className="survey-progress-fill" style={{ width: `${progressPercent}%` }} /></div>
          <div className="survey-progress-label">
            <span>{phase === 'done' ? 'Completada' : currentPage?.title || survey.title}</span>
            <span>{phase === 'done' ? '¡Gracias!' : `Paso ${pageIndex + 1} de ${totalPages}`}</span>
          </div>
        </div>
      </div>

      <div className="survey-public-content">
        {survey.cover_image && <div className="survey-public-banner"><img src={survey.cover_image} alt="" /></div>}
        <header className="survey-public-hero">
          <h1>{survey.title}</h1>
          {survey.description && <p>{survey.description}</p>}
          {phase === 'form' && <span className="survey-public-hero-time"><Clock size={13} /> Aprox. {estimatedMinutes} min</span>}
        </header>

        <AnimatePresence mode="wait">
          {phase === 'form' && currentPage && (
            <motion.div key={currentPage.id} variants={fadeSlideUp} initial="hidden" animate="visible" exit={{ opacity: 0, y: -8 }}>
              <StepCard page={currentPage} answers={answers} fieldErrors={fieldErrors} color={themeColor} onAnswer={setAnswer} />
              <nav className="survey-public-nav">
                <button type="button" className="survey-nav-button is-ghost" onClick={goPrev} disabled={pageIndex === 0 || submitting}>
                  <ArrowLeft size={16} /> Anterior
                </button>
                <button type="button" className="survey-nav-button is-primary" style={{ backgroundImage: `linear-gradient(135deg, ${themeColor}, ${themeColor}cc)` }} onClick={goNext} disabled={submitting}>
                  {submitting ? 'Enviando...' : isLastPage ? <>Enviar <Send size={16} /></> : <>Siguiente <ArrowRight size={16} /></>}
                </button>
              </nav>
            </motion.div>
          )}

          {phase === 'done' && (
            <motion.div key="done" className="survey-done-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <motion.div
                className="survey-done-ring"
                style={{ background: `${themeColor}1a`, color: themeColor }}
                initial={{ rotateY: -180, scale: 0.5, opacity: 0 }}
                animate={{ rotateY: 0, scale: 1, opacity: 1 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              >
                <Check size={40} strokeWidth={3} />
              </motion.div>
              <h2>¡Gracias por participar!</h2>
              <p>{thankYou}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function StepCard({ page, answers, fieldErrors, color, onAnswer }: {
  page: PublicSurvey['pages'][number]
  answers: Record<string, unknown>
  fieldErrors: Record<string, string>
  color: string
  onAnswer(questionId: string, value: unknown): void
}) {
  const tiltRef = useTilt<HTMLDivElement>()
  return (
    <div ref={tiltRef} className="survey-step-card">
      {(page.title || page.description) && (
        <div className="survey-step-card-head">
          {page.title && (
            <p className="survey-section-eyebrow" style={{ color }}>
              <span className="survey-section-eyebrow-dash" style={{ background: color }} />
              {page.title}
            </p>
          )}
          {page.title && <h2>{page.title}</h2>}
          {page.description && <p>{page.description}</p>}
        </div>
      )}
      {page.questions.map((question, index) => {
        const accent = question.config?.cardAccent as CardAccent | undefined
        const body = (
          <>
            <p className="survey-question-prompt">
              <span className="survey-question-index">{index + 1}.</span> {question.prompt}
              {question.required && <span className="survey-required-mark">*</span>}
            </p>
            {question.description && <p className="survey-question-hint">{question.description}</p>}
            <QuestionRenderer
              question={question} value={answers[question.id]} onChange={value => onAnswer(question.id, value)}
              color={accent?.color || color} error={fieldErrors[question.id]}
              optionShape={accent ? 'round' : undefined}
            />
          </>
        )
        if (!accent) return <div key={question.id} className="survey-question">{body}</div>
        const LineIcon = resolveLineIcon(accent.icon)
        return (
          <div key={question.id} className="survey-question survey-line-card" style={{ borderTopColor: accent.color }}>
            <div className="survey-line-card-head">
              <span className="survey-line-card-icon" style={{ background: accent.color }}><LineIcon size={18} /></span>
              {accent.badge && <span className="survey-line-card-badge" style={{ background: `${accent.color}1a`, color: accent.color }}>{accent.badge}</span>}
            </div>
            {body}
          </div>
        )
      })}
    </div>
  )
}
