import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, BarChart3, Copy, GripVertical, ImagePlus, Loader2, Monitor, Plus, Rocket, RotateCcw,
  Save, Settings, Smartphone, Square, Trash2, X,
} from 'lucide-react'
import {
  Badge, Button, Card, Field, Input, SaveStatusIndicator, Select, Textarea, ToastProvider, moduleIdentity, useToast,
} from '@/design-system'
import { surveysService } from '../services/surveysService'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PageAttachmentButton } from '../components/PageAttachmentButton'
import { PresentationEmbed } from '../components/PresentationEmbed'
import { QuestionConfigEditor } from '../components/QuestionConfigEditor'
import { QuestionRenderer } from '../components/QuestionRenderer'
import { BUILDER_QUESTION_TYPES, QUESTION_TYPE_INFO } from '../components/questionTypeMeta'
import type { QuestionConfig, QuestionType, SurveyDetail, SurveyPage, SurveyQuestion } from '../types'

const identity = moduleIdentity('surveys')

function newId(prefix: string) { return `${prefix}_${Math.random().toString(36).slice(2, 8)}` }

function defaultConfigFor(type: QuestionType): QuestionConfig {
  if (['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'DROPDOWN', 'IMAGE_CHOICE'].includes(type)) {
    return { options: [{ id: newId('opt'), label: 'Opción 1' }, { id: newId('opt'), label: 'Opción 2' }] }
  }
  if (type === 'SCALE') return { min: 1, max: 5, minLabel: 'Muy insatisfecho', maxLabel: 'Muy satisfecho' }
  if (type === 'LIKERT_MATRIX') return { rows: [{ id: newId('row'), label: 'Fila 1' }], scaleMin: 1, scaleMax: 5 }
  if (type === 'RANKING') return { options: [{ id: newId('opt'), label: 'Opción 1' }, { id: newId('opt'), label: 'Opción 2' }, { id: newId('opt'), label: 'Opción 3' }] }
  if (type === 'MATCHING') {
    return {
      items: [{ id: newId('item'), label: 'Elemento 1' }, { id: newId('item'), label: 'Elemento 2' }],
      targets: [{ id: newId('tgt'), label: 'Grupo 1' }, { id: newId('tgt'), label: 'Grupo 2' }],
    }
  }
  if (type === 'EMOJI_SCALE') {
    return { steps: [{ emoji: '😡', label: 'Muy insatisfecho' }, { emoji: '😕', label: 'Insatisfecho' }, { emoji: '😐', label: 'Neutral' }, { emoji: '🙂', label: 'Satisfecho' }, { emoji: '😄', label: 'Muy satisfecho' }] }
  }
  if (type === 'RATING') return { max: 5 }
  return {}
}

function reorder<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export default function SurveyBuilderPage() {
  return <ToastProvider><SurveyBuilderContent /></ToastProvider>
}

function SurveyBuilderContent() {
  const { surveyId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const [survey, setSurvey] = useState<SurveyDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null)
  const [showTypePicker, setShowTypePicker] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [deletePage, setDeletePage] = useState<SurveyPage | null>(null)
  const [deleteQuestion, setDeleteQuestion] = useState<SurveyQuestion | null>(null)
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('mobile')
  const [coverUploading, setCoverUploading] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [dirty, setDirty] = useState(false)
  // Cambios en espera de un clic en "Guardar" — nunca se envian solos. Se acumulan aqui (no se
  // reemplazan) para que editar el titulo y luego, sin guardar, subir una presentacion, guarden
  // ambos cambios juntos en vez de que el ultimo pise al anterior.
  const pending = useRef<{ meta: Record<string, unknown>; pages: Record<string, Record<string, unknown>>; questions: Record<string, Record<string, unknown>> }>({ meta: {}, pages: {}, questions: {} })

  useEffect(() => {
    if (saveState !== 'saved') return
    const timeout = window.setTimeout(() => setSaveState('idle'), 2500)
    return () => window.clearTimeout(timeout)
  }, [saveState])

  // Aviso al cerrar/recargar la pestaña con cambios sin guardar — el constructor ya no guarda solo,
  // asi que salir sin hacer clic en "Guardar" si perderia esos cambios.
  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  async function load(preserveSelection = true) {
    if (!surveyId) return
    try {
      const detail = await surveysService.detail(surveyId)
      setSurvey(detail)
      if (!preserveSelection || !detail.pages.some(page => page.id === activePageId)) {
        setActivePageId(detail.pages[0]?.id || null)
      }
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar la encuesta') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load(false) }, [surveyId])

  const activePage = survey?.pages.find(page => page.id === activePageId) || null
  const activeQuestion = activePage?.questions.find(question => question.id === activeQuestionId) || null

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin" size={24} /></div>
  if (!survey) return null

  // Las tres funciones de abajo solo actualizan el estado local (optimista, para que se sienta
  // instantaneo) y acumulan el cambio en `pending` — nunca llaman al servidor por si solas. Solo
  // saveAll() (el boton "Guardar") persiste. Esto es intencional: antes el constructor guardaba
  // automatico con debounce y no habia forma clara de saber si algo realmente quedo guardado.
  function saveMeta(patch: Record<string, unknown>) {
    if (!survey) return
    // El patch usa claves camelCase (requireLogin, themeColor...) que NO coinciden con los campos
    // snake_case del tipo SurveyDetail (require_login, theme_color...), asi que este spread por si
    // solo no refleja esos campos en pantalla hasta guardar — aceptable, se confirma al guardar.
    setSurvey({ ...survey, ...patch as Partial<SurveyDetail> })
    pending.current.meta = { ...pending.current.meta, ...patch }
    setDirty(true)
    setSaveState('idle')
  }

  async function uploadCoverImage(file: File | undefined) {
    if (!survey || !file) return
    setCoverUploading(true)
    try {
      const result = await surveysService.uploadMedia(survey.id, file)
      saveMeta({ coverImage: result.url })
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible subir la imagen') }
    finally { setCoverUploading(false) }
  }

  async function saveAll() {
    if (!survey || !dirty) return
    setSaveState('saving')
    const toSend = pending.current
    try {
      const tasks: Promise<unknown>[] = []
      if (Object.keys(toSend.meta).length) tasks.push(surveysService.update(survey.id, toSend.meta))
      for (const [pageId, patch] of Object.entries(toSend.pages)) if (Object.keys(patch).length) tasks.push(surveysService.updatePage(survey.id, pageId, patch))
      for (const [questionId, patch] of Object.entries(toSend.questions)) if (Object.keys(patch).length) tasks.push(surveysService.updateQuestion(survey.id, questionId, patch))
      await Promise.all(tasks)
      pending.current = { meta: {}, pages: {}, questions: {} }
      setDirty(false)
      setSaveState('saved')
      await load()
      toast.push('success', 'Cambios guardados')
    } catch (cause) {
      toast.push('error', cause instanceof Error ? cause.message : 'No fue posible guardar. Tus cambios siguen aquí, intenta de nuevo.')
      setSaveState('error')
    }
  }

  // Varias acciones estructurales (agregar/eliminar pagina o pregunta, duplicar) terminan en
  // load(), que reemplaza el estado local con lo que hay en el servidor — si hubiera cambios sin
  // guardar en ese momento, se perderian en silencio. Por eso primero se guardan.
  async function flushPending() {
    if (dirty) await saveAll()
  }

  async function addPage() {
    if (!survey) return
    try {
      await flushPending()
      await surveysService.createPage(survey.id, { title: `Página ${survey.pages.length + 1}` })
      await load()
      toast.push('success', 'Página agregada')
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible agregar la página') }
  }

  function updatePageField(page: SurveyPage, patch: { title?: string; description?: string; attachmentUrl?: string | null; attachmentName?: string | null }) {
    if (!survey) return
    setSurvey({ ...survey, pages: survey.pages.map(item => item.id === page.id ? { ...item, ...patch } : item) })
    pending.current.pages[page.id] = { ...pending.current.pages[page.id], ...patch }
    setDirty(true)
    setSaveState('idle')
  }

  async function reorderPages(from: number, to: number) {
    if (!survey || from === to) return
    const next = reorder(survey.pages, from, to)
    setSurvey({ ...survey, pages: next })
    try { await surveysService.reorderPages(survey.id, next.map(page => page.id)) }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible reordenar'); await load() }
  }

  async function reorderQuestions(page: SurveyPage, from: number, to: number) {
    if (!survey || from === to) return
    const next = reorder(page.questions, from, to)
    setSurvey({ ...survey, pages: survey.pages.map(item => item.id === page.id ? { ...item, questions: next } : item) })
    try { await surveysService.reorderQuestions(survey.id, page.id, next.map(question => question.id)) }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible reordenar'); await load() }
  }

  async function addQuestion(type: QuestionType) {
    if (!survey || !activePage) return
    setShowTypePicker(false)
    try {
      await flushPending()
      const created = await surveysService.createQuestion(survey.id, activePage.id, {
        type, prompt: `${QUESTION_TYPE_INFO[type].label}`, required: false, config: defaultConfigFor(type),
      }) as SurveyQuestion
      await load()
      setActiveQuestionId(created.id)
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible crear la pregunta') }
  }

  function updateQuestionField(question: SurveyQuestion, patch: Partial<Pick<SurveyQuestion, 'prompt' | 'description' | 'required' | 'config'>>) {
    if (!survey || !activePage) return
    setSurvey({
      ...survey,
      pages: survey.pages.map(page => page.id !== activePage.id ? page : {
        ...page,
        questions: page.questions.map(item => item.id === question.id ? { ...item, ...patch } : item),
      }),
    })
    pending.current.questions[question.id] = { ...pending.current.questions[question.id], ...patch }
    setDirty(true)
    setSaveState('idle')
  }

  async function duplicateQuestion(question: SurveyQuestion) {
    if (!survey) return
    try {
      await flushPending()
      await surveysService.duplicateQuestion(survey.id, question.id)
      await load()
      toast.push('success', 'Pregunta duplicada')
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible duplicar') }
  }

  async function publishToggle() {
    if (!survey) return
    try {
      await flushPending()
      if (survey.status === 'BORRADOR') { await surveysService.publish(survey.id); toast.push('success', 'Encuesta publicada') }
      else if (survey.status === 'PUBLICADA') { await surveysService.close(survey.id); toast.push('success', 'Encuesta cerrada') }
      else { await surveysService.reopen(survey.id); toast.push('success', 'Encuesta reabierta') }
      await load()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible actualizar el estado') }
  }

  return (
    <div className="survey-builder mx-auto max-w-[1500px] space-y-2">
      <header className="survey-builder-header">
        <div className="survey-builder-header-main">
          <div className={`survey-cover-picker ${survey.cover_image ? 'has-image' : ''}`}>
            {survey.cover_image && <img src={survey.cover_image} alt="" />}
            <label className="survey-cover-picker-button">
              <input type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => uploadCoverImage(event.target.files?.[0])} />
              {coverUploading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
              {survey.cover_image ? 'Cambiar' : 'Imagen de portada'}
            </label>
            {survey.cover_image && (
              <button type="button" className="survey-cover-remove" title="Quitar imagen" onClick={() => saveMeta({ coverImage: null })}><X size={12} /></button>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="ds-module-badge" style={{ ['--ds-eyebrow-color' as string]: identity.color }}>Constructor</p>
            <input
              className="survey-title-input"
              value={survey.title}
              placeholder="Título de la encuesta"
              onChange={event => saveMeta({ title: event.target.value })}
            />
            <p className="survey-builder-subtitle">{survey.code} · {survey.pages.reduce((total, page) => total + page.questions.length, 0)} preguntas</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty && <span className="survey-unsaved-dot">Cambios sin guardar</span>}
          <SaveStatusIndicator state={saveState} />
          <Badge tone={survey.status === 'PUBLICADA' ? 'info' : 'neutral'}>{survey.status === 'BORRADOR' ? 'Borrador' : survey.status === 'PUBLICADA' ? 'Publicada' : 'Cerrada'}</Badge>
          <Button variant="secondary" onClick={() => navigate('/app/encuestas')}><ArrowLeft size={15} /> Encuestas</Button>
          <Button variant="secondary" onClick={() => navigate(`/app/encuestas/${survey.id}/resultados`)}><BarChart3 size={15} /> Resultados</Button>
          <Button variant="secondary" onClick={() => setShowSettings(true)}><Settings size={15} /> Configuración</Button>
          <Button identity={identity} onClick={saveAll} disabled={!dirty || saveState === 'saving'}><Save size={15} /> Guardar</Button>
          <Button identity={identity} onClick={publishToggle}>
            {survey.status === 'BORRADOR' && <><Rocket size={15} /> Publicar</>}
            {survey.status === 'PUBLICADA' && <><Square size={15} /> Cerrar</>}
            {survey.status === 'CERRADA' && <><RotateCcw size={15} /> Reabrir</>}
          </Button>
        </div>
      </header>

      <div className="survey-builder-grid">
        <Card accent={identity.color} className="survey-builder-nav">
          <div className="survey-builder-nav-head">
            <p className="ds-eyebrow">Páginas</p>
            <button className="survey-config-add" onClick={addPage}><Plus size={13} /> Página</button>
          </div>
          <div className="survey-builder-pages">
            {survey.pages.map((page, index) => (
              <div
                key={page.id}
                draggable
                onDragStart={event => event.dataTransfer.setData('text/page-index', String(index))}
                onDragOver={event => event.preventDefault()}
                onDrop={event => { const from = Number(event.dataTransfer.getData('text/page-index')); void reorderPages(from, index) }}
                className={`survey-builder-page-item ${page.id === activePageId ? 'is-active' : ''}`}
                onClick={() => { setActivePageId(page.id); setActiveQuestionId(null) }}
              >
                <GripVertical size={13} className="survey-config-drag" />
                <span className="min-w-0 flex-1 truncate">{page.title || `Página ${index + 1}`}</span>
                <span className="survey-builder-page-count">{page.questions.length}</span>
                {survey.pages.length > 1 && (
                  <button className="survey-icon-button is-danger is-tiny" onClick={event => { event.stopPropagation(); setDeletePage(page) }}><Trash2 size={12} /></button>
                )}
              </div>
            ))}
          </div>

          {activePage && (
            <>
              <div className="survey-builder-nav-head" style={{ marginTop: 18 }}>
                <p className="ds-eyebrow">Preguntas</p>
                <button className="survey-config-add" onClick={() => setShowTypePicker(true)}><Plus size={13} /> Pregunta</button>
              </div>
              <div className="survey-builder-questions">
                {activePage.questions.map((question, index) => {
                  const info = QUESTION_TYPE_INFO[question.type]
                  const Icon = info.icon
                  return (
                    <div
                      key={question.id}
                      draggable
                      onDragStart={event => event.dataTransfer.setData('text/question-index', String(index))}
                      onDragOver={event => event.preventDefault()}
                      onDrop={event => { const from = Number(event.dataTransfer.getData('text/question-index')); void reorderQuestions(activePage, from, index) }}
                      className={`survey-builder-question-item ${question.id === activeQuestionId ? 'is-active' : ''}`}
                      onClick={() => setActiveQuestionId(question.id)}
                    >
                      <GripVertical size={13} className="survey-config-drag" />
                      <Icon size={14} />
                      <span className="min-w-0 flex-1 truncate">{question.prompt || info.label}</span>
                      {question.required && <span className="survey-required-dot" title="Obligatoria" />}
                    </div>
                  )
                })}
                {!activePage.questions.length && <p className="survey-config-empty">Sin preguntas todavía.</p>}
              </div>
            </>
          )}
        </Card>

        <Card accent={identity.color} className="survey-builder-canvas">
          {!activeQuestion ? (
            activePage && (
              <div className="survey-builder-page-meta">
                <Field label="Título de la página"><Input value={activePage.title} onChange={event => updatePageField(activePage, { title: event.target.value })} /></Field>
                <Field label="Descripción de la página"><Textarea value={activePage.description} onChange={event => updatePageField(activePage, { description: event.target.value })} /></Field>
                <Field label="Presentación de apoyo (opcional)">
                  <PageAttachmentButton
                    surveyId={survey.id}
                    url={activePage.attachment_url}
                    name={activePage.attachment_name}
                    onChange={attachment => updatePageField(activePage, { attachmentUrl: attachment.url, attachmentName: attachment.name })}
                  />
                </Field>
                <p className="survey-config-hint">Se muestra embebida arriba de las preguntas de esta página, antes de responder — ideal para evaluaciones de guías clínicas.</p>
                <p className="survey-config-empty">Selecciona una pregunta para editarla o crea una nueva.</p>
              </div>
            )
          ) : (
            <div className="survey-builder-editor">
              <div className="survey-builder-editor-head">
                <Badge tone="neutral">{QUESTION_TYPE_INFO[activeQuestion.type].label}</Badge>
                <div className="flex gap-2">
                  <button className="survey-icon-button" title="Duplicar" onClick={() => duplicateQuestion(activeQuestion)}><Copy size={14} /></button>
                  <button className="survey-icon-button is-danger" title="Eliminar" onClick={() => setDeleteQuestion(activeQuestion)}><Trash2 size={14} /></button>
                </div>
              </div>
              <Field label="Enunciado"><Textarea value={activeQuestion.prompt} onChange={event => updateQuestionField(activeQuestion, { prompt: event.target.value })} /></Field>
              <Field label="Texto de ayuda (opcional)"><Input value={activeQuestion.description} onChange={event => updateQuestionField(activeQuestion, { description: event.target.value })} /></Field>
              <label className="survey-toggle-row">
                <input type="checkbox" checked={activeQuestion.required} onChange={event => updateQuestionField(activeQuestion, { required: event.target.checked })} />
                <span>Obligatoria</span>
              </label>
              <div className="survey-builder-divider" />
              <QuestionConfigEditor type={activeQuestion.type} config={activeQuestion.config} surveyId={survey.id} onChange={config => updateQuestionField(activeQuestion, { config })} />
            </div>
          )}
        </Card>

        <Card accent={identity.color} className="survey-builder-preview">
          <div className="survey-builder-preview-head">
            <p className="ds-eyebrow">Vista previa en vivo</p>
            <div className="survey-device-toggle">
              <button className={previewDevice === 'desktop' ? 'is-active' : ''} onClick={() => setPreviewDevice('desktop')} title="Escritorio"><Monitor size={14} /></button>
              <button className={previewDevice === 'mobile' ? 'is-active' : ''} onClick={() => setPreviewDevice('mobile')} title="Móvil"><Smartphone size={14} /></button>
            </div>
          </div>
          <div className={`survey-preview-frame ${previewDevice === 'mobile' ? 'is-mobile' : 'is-desktop'}`}>
            {activeQuestion ? (
              <div className="survey-step-card" style={{ ['--survey-accent' as string]: survey.theme_color }}>
                <p className="survey-question-prompt">{activeQuestion.prompt}{activeQuestion.required && <span className="survey-required-mark">*</span>}</p>
                {activeQuestion.description && <p className="survey-question-hint">{activeQuestion.description}</p>}
                <QuestionRenderer question={activeQuestion} value={undefined} onChange={() => {}} color={survey.theme_color} />
              </div>
            ) : activePage ? (
              <div className="survey-step-card" style={{ ['--survey-accent' as string]: survey.theme_color }}>
                {(activePage.title || activePage.description) && (
                  <div className="survey-step-card-head">
                    {activePage.title && (
                      <p className="survey-section-eyebrow" style={{ color: survey.theme_color }}>
                        <span className="survey-section-eyebrow-dash" style={{ background: survey.theme_color }} />
                        {activePage.title}
                      </p>
                    )}
                    {activePage.title && <h2>{activePage.title}</h2>}
                    {activePage.description && <p>{activePage.description}</p>}
                  </div>
                )}
                {activePage.attachment_url ? (
                  <PresentationEmbed url={activePage.attachment_url} name={activePage.attachment_name} />
                ) : (
                  <p className="survey-config-empty">Agrega un título, descripción o presentación de apoyo para verlos aquí, o selecciona una pregunta.</p>
                )}
              </div>
            ) : (
              <p className="survey-config-empty" style={{ padding: 24 }}>Selecciona una pregunta para verla aquí.</p>
            )}
          </div>
        </Card>
      </div>

      {showTypePicker && (
        <TypePickerModal onSelect={addQuestion} onClose={() => setShowTypePicker(false)} />
      )}
      {showSettings && (
        <SettingsModal survey={survey} onChange={saveMeta} onClose={() => setShowSettings(false)} />
      )}
      {deletePage && (
        <ConfirmDialog
          title="Eliminar página" message={`¿Eliminar "${deletePage.title}" y todas sus preguntas?`} confirmLabel="Eliminar"
          onCancel={() => setDeletePage(null)}
          onConfirm={async () => { await flushPending(); await surveysService.removePage(survey.id, deletePage.id); setDeletePage(null); await load(false) }}
        />
      )}
      {deleteQuestion && (
        <ConfirmDialog
          title="Eliminar pregunta" message={`¿Eliminar "${deleteQuestion.prompt}"?`} confirmLabel="Eliminar"
          onCancel={() => setDeleteQuestion(null)}
          onConfirm={async () => { await flushPending(); await surveysService.removeQuestion(survey.id, deleteQuestion.id); setActiveQuestionId(null); setDeleteQuestion(null); await load() }}
        />
      )}
    </div>
  )
}

function TypePickerModal({ onSelect, onClose }: { onSelect(type: QuestionType): void; onClose(): void }) {
  return (
    <div className="almera-modal" onClick={onClose}>
      <div className="ds-card almera-dialog survey-type-dialog" onClick={event => event.stopPropagation()}>
        <div className="dialog-head"><h2>Elige el tipo de pregunta</h2></div>
        <div className="survey-type-grid">
          {BUILDER_QUESTION_TYPES.map(type => {
            const info = QUESTION_TYPE_INFO[type]
            const Icon = info.icon
            return (
              <button key={type} className="survey-type-card" onClick={() => onSelect(type)}>
                <span className="survey-type-icon"><Icon size={20} /></span>
                <strong>{info.label}</strong>
                <span>{info.description}</span>
              </button>
            )
          })}
        </div>
        <p className="survey-config-empty" style={{ marginTop: 14 }}>La carga de archivos por parte de quien responde llega en una fase siguiente.</p>
      </div>
    </div>
  )
}

function toLocalInputValue(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16)
}

function fromLocalInputValue(value: string): string | null {
  return value ? new Date(value).toISOString() : null
}

function SettingsModal({ survey, onChange, onClose }: { survey: SurveyDetail; onChange(patch: Record<string, unknown>): void; onClose(): void }) {
  return (
    <div className="almera-modal" onClick={onClose}>
      <div className="ds-card almera-dialog" onClick={event => event.stopPropagation()}>
        <div className="dialog-head"><h2>Configuración de la encuesta</h2><button aria-label="Cerrar" onClick={onClose}><X /></button></div>
        <div className="dialog-form">
          <div className="full"><Field label="Descripción"><Textarea value={survey.description} onChange={event => onChange({ description: event.target.value })} /></Field></div>
          <Field label="Audiencia">
            <Select value={survey.audience} onChange={value => onChange({ audience: value })} options={[{ value: 'CLIENTE_EXTERNO', label: 'Cliente externo' }, { value: 'CLIENTE_INTERNO', label: 'Cliente interno' }]} />
          </Field>
          <Field label="Color de tema"><input type="color" className="survey-color-input" value={survey.theme_color} onChange={event => onChange({ themeColor: event.target.value })} /></Field>
          <Field label="Respuestas múltiples por persona">
            <Select value={survey.allow_multiple_responses ? 'yes' : 'no'} onChange={value => onChange({ allowMultipleResponses: value === 'yes' })} options={[{ value: 'no', label: 'Solo una respuesta' }, { value: 'yes', label: 'Permitir varias' }]} />
          </Field>
          <Field label="Exigir sesión interna">
            <Select value={survey.require_login ? 'yes' : 'no'} onChange={value => onChange({ requireLogin: value === 'yes' })} options={[{ value: 'no', label: 'No, acceso anónimo' }, { value: 'yes', label: 'Sí, exigir inicio de sesión' }]} />
          </Field>
          <Field label="Mostrar puntaje al finalizar" hint="Solo aplica si hay preguntas con clave de calificación (evaluaciones de conocimiento)">
            <Select
              value={survey.show_score_to_respondent ? 'yes' : 'no'}
              onChange={value => onChange({ showScoreToRespondent: value === 'yes' })}
              options={[{ value: 'yes', label: 'Sí, mostrar puntaje' }, { value: 'no', label: 'No, mantener oculto' }]}
            />
          </Field>
          <Field label="Apertura programada" hint="Vacío = disponible de inmediato">
            <Input type="datetime-local" value={toLocalInputValue(survey.opens_at)} onChange={event => onChange({ opensAt: fromLocalInputValue(event.target.value) })} />
          </Field>
          <Field label="Cierre programado" hint="Vacío = sin fecha límite">
            <Input type="datetime-local" value={toLocalInputValue(survey.closes_at)} onChange={event => onChange({ closesAt: fromLocalInputValue(event.target.value) })} />
          </Field>
          <div className="full"><Field label="Mensaje de agradecimiento"><Textarea value={survey.thank_you_message} onChange={event => onChange({ thankYouMessage: event.target.value })} /></Field></div>
          <div className="dialog-actions"><Button identity={identity} onClick={onClose}>Listo</Button></div>
        </div>
      </div>
    </div>
  )
}
