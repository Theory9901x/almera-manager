import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3, BookmarkPlus, Check, Copy, ExternalLink, Layers, Link2, ListChecks, Loader2, Pencil, Plus, QrCode,
  RotateCcw, Send, Sparkles, Square, Trash2, X,
} from 'lucide-react'
import { motion } from 'framer-motion'
import {
  Badge, Button, Card, EmptyState, Field, Input, PageHeader, SearchBox, Select, Tabs, Textarea,
  ToastProvider, fadeSlideUp, moduleIdentity, staggerContainer, useToast,
} from '@/design-system'
import { useAuth } from '@/platform/auth/AuthContext'
import { surveysService } from '../services/surveysService'
import { ConfirmDialog } from '../components/ConfirmDialog'
import type { Survey, SurveyAudience, SurveyLink, SurveyStatus } from '../types'

const identity = moduleIdentity('surveys')

const STATUS_LABEL: Record<SurveyStatus, string> = { BORRADOR: 'Borrador', PUBLICADA: 'Publicada', CERRADA: 'Cerrada' }
const STATUS_TONE: Record<SurveyStatus, 'neutral' | 'info'> = { BORRADOR: 'neutral', PUBLICADA: 'info', CERRADA: 'neutral' }
const AUDIENCE_LABEL: Record<SurveyAudience, string> = { CLIENTE_INTERNO: 'Cliente interno', CLIENTE_EXTERNO: 'Cliente externo' }

export default function SurveysListPage() {
  return <ToastProvider><SurveysListContent /></ToastProvider>
}

function SurveysListContent() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const canCreate = Boolean(session?.permissions.includes('surveys.create'))
  const canEdit = Boolean(session?.permissions.includes('surveys.edit'))
  const canDelete = Boolean(session?.permissions.includes('surveys.delete'))

  const [tab, setTab] = useState<'mine' | 'templates'>('mine')
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [audience, setAudience] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [linkSurvey, setLinkSurvey] = useState<Survey | null>(null)
  const [deleteSurvey, setDeleteSurvey] = useState<Survey | null>(null)
  const [templateSurvey, setTemplateSurvey] = useState<Survey | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      setSurveys(await surveysService.list({
        q: q || undefined, status: tab === 'mine' ? (status || undefined) : undefined,
        audience: audience || undefined, template: tab === 'templates' ? 'true' : 'false',
      }))
    }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar las encuestas') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [tab, status, audience])
  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 300)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  async function runAction(survey: Survey, action: () => Promise<unknown>, message: string) {
    setBusyId(survey.id)
    try { await action(); await load(); toast.push('success', message) }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible completar la acción') }
    finally { setBusyId(null) }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Encuestas"
        title="Encuestas"
        description="Construye encuestas dinámicas, publícalas con un enlace estable y consulta resultados en un solo lugar."
        identity={identity}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/app/encuestas/consolidado')}><Layers size={16} /> Consolidado</Button>
            {canCreate && <Button identity={identity} onClick={() => setShowCreate(true)}><Plus size={16} /> Nueva encuesta</Button>}
          </div>
        }
      />

      <Tabs
        identity={identity}
        active={tab}
        onChange={key => setTab(key as 'mine' | 'templates')}
        items={[{ key: 'mine', label: 'Mis encuestas' }, { key: 'templates', label: 'Plantillas' }]}
      />

      <Card accent={identity.color} className="flex flex-wrap items-center gap-3 p-4">
        <SearchBox value={q} onChange={setQ} placeholder="Buscar por título o código..." />
        {tab === 'mine' && (
          <Select value={status} onChange={setStatus} placeholder="Todos los estados" options={[{ value: '', label: 'Todos los estados' }, { value: 'BORRADOR', label: 'Borrador' }, { value: 'PUBLICADA', label: 'Publicada' }, { value: 'CERRADA', label: 'Cerrada' }]} />
        )}
        <Select value={audience} onChange={setAudience} placeholder="Toda audiencia" options={[{ value: '', label: 'Toda audiencia' }, { value: 'CLIENTE_EXTERNO', label: 'Cliente externo' }, { value: 'CLIENTE_INTERNO', label: 'Cliente interno' }]} />
      </Card>

      {loading ? (
        <Card className="p-10 text-center text-[var(--muted)]"><Loader2 className="mx-auto animate-spin" size={22} /></Card>
      ) : !surveys.length ? (
        <Card accent={identity.color}>
          <EmptyState
            icon={tab === 'templates' ? Layers : Link2}
            title={tab === 'templates' ? 'Aún no hay plantillas' : 'Aún no hay encuestas'}
            description={tab === 'templates' ? 'Guarda cualquier encuesta como plantilla para reutilizar su estructura.' : 'Crea la primera encuesta y compártela con un enlace público estable.'}
          />
        </Card>
      ) : (
        <motion.div variants={staggerContainer(40)} initial="hidden" animate="visible" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {surveys.map(survey => (
            <motion.article key={survey.id} variants={fadeSlideUp} className="ds-card survey-list-card">
              <div className="survey-list-card-head">
                {survey.is_template ? <Badge tone="info"><Sparkles size={11} /> Plantilla</Badge> : <Badge tone={STATUS_TONE[survey.status]}>{STATUS_LABEL[survey.status]}</Badge>}
                <span className="survey-list-card-code">{survey.code}</span>
              </div>
              <h3 className="survey-list-card-title">{survey.title}</h3>
              {survey.description && <p className="survey-list-card-description">{survey.description}</p>}
              <div className="survey-list-card-meta">
                <span>{AUDIENCE_LABEL[survey.audience]}</span>
                {!survey.is_template && <span>{survey.completed_count} respuesta{survey.completed_count === 1 ? '' : 's'}</span>}
                {survey.closes_at && !survey.is_template && <span>Se cierra: {new Date(survey.closes_at).toLocaleDateString()}</span>}
              </div>
              <div className="survey-list-card-actions">
                <button className="survey-icon-button" title="Constructor" onClick={() => navigate(`/app/encuestas/${survey.id}/constructor`)}><Pencil size={15} /></button>
                {survey.is_template ? (
                  <>
                    {canCreate && <button className="survey-icon-button is-accent" title="Usar plantilla" onClick={() => setTemplateSurvey(survey)}><Sparkles size={15} /></button>}
                    {canDelete && <button className="survey-icon-button is-danger" title="Eliminar" onClick={() => setDeleteSurvey(survey)}><Trash2 size={15} /></button>}
                  </>
                ) : (
                  <>
                    <button className="survey-icon-button" title="Resultados" onClick={() => navigate(`/app/encuestas/${survey.id}/resultados`)}><BarChart3 size={15} /></button>
                    <button className="survey-icon-button" title="Respuestas" onClick={() => navigate(`/app/encuestas/${survey.id}/respuestas`)}><ListChecks size={15} /></button>
                    {survey.status !== 'BORRADOR' && <button className="survey-icon-button" title="Enlace y QR" onClick={() => setLinkSurvey(survey)}><QrCode size={15} /></button>}
                    {canCreate && <button className="survey-icon-button" title="Duplicar" disabled={busyId === survey.id} onClick={() => runAction(survey, () => surveysService.duplicate(survey.id), 'Encuesta duplicada')}><Copy size={15} /></button>}
                    {canCreate && <button className="survey-icon-button" title="Guardar como plantilla" disabled={busyId === survey.id} onClick={() => runAction(survey, () => surveysService.duplicate(survey.id, { title: `${survey.title} (plantilla)`, asTemplate: true }), 'Guardada como plantilla')}><BookmarkPlus size={15} /></button>}
                    {canEdit && survey.status === 'BORRADOR' && <button className="survey-icon-button is-accent" title="Publicar" disabled={busyId === survey.id} onClick={() => runAction(survey, () => surveysService.publish(survey.id), 'Encuesta publicada')}><Send size={15} /></button>}
                    {canEdit && survey.status === 'PUBLICADA' && <button className="survey-icon-button" title="Cerrar" disabled={busyId === survey.id} onClick={() => runAction(survey, () => surveysService.close(survey.id), 'Encuesta cerrada')}><Square size={15} /></button>}
                    {canEdit && survey.status === 'CERRADA' && <button className="survey-icon-button" title="Reabrir" disabled={busyId === survey.id} onClick={() => runAction(survey, () => surveysService.reopen(survey.id), 'Encuesta reabierta')}><RotateCcw size={15} /></button>}
                    {canDelete && <button className="survey-icon-button is-danger" title="Eliminar" onClick={() => setDeleteSurvey(survey)}><Trash2 size={15} /></button>}
                  </>
                )}
              </div>
            </motion.article>
          ))}
        </motion.div>
      )}

      {showCreate && <CreateSurveyModal close={() => setShowCreate(false)} onCreated={survey => navigate(`/app/encuestas/${survey.id}/constructor`)} />}
      {linkSurvey && <LinkModal survey={linkSurvey} close={() => setLinkSurvey(null)} />}
      {templateSurvey && (
        <UseTemplateModal
          template={templateSurvey}
          close={() => setTemplateSurvey(null)}
          onCreated={survey => navigate(`/app/encuestas/${survey.id}/constructor`)}
        />
      )}
      {deleteSurvey && (
        <ConfirmDialog
          title="Eliminar encuesta"
          message={`¿Eliminar "${deleteSurvey.title}"? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          onCancel={() => setDeleteSurvey(null)}
          onConfirm={async () => {
            await runAction(deleteSurvey, () => surveysService.remove(deleteSurvey.id), 'Encuesta eliminada')
            setDeleteSurvey(null)
          }}
        />
      )}
    </div>
  )
}

function CreateSurveyModal({ close, onCreated }: { close(): void; onCreated(survey: Survey): void }) {
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [audience, setAudience] = useState<SurveyAudience>('CLIENTE_EXTERNO')
  const [saving, setSaving] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try { onCreated(await surveysService.create({ title: title.trim(), description, audience })) }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible crear la encuesta') }
    finally { setSaving(false) }
  }

  return (
    <div className="almera-modal" onClick={close}>
      <div className="ds-card almera-dialog" style={{ width: 'min(560px, 100%)' }} onClick={event => event.stopPropagation()}>
        <div className="dialog-head">
          <div><p className="ds-eyebrow" style={{ color: identity.color }}>Nueva encuesta</p><h2>Crear encuesta</h2></div>
          <button aria-label="Cerrar" onClick={close}><X /></button>
        </div>
        <form onSubmit={submit} className="dialog-form">
          <div className="full"><Field label="Título"><Input autoFocus required value={title} onChange={event => setTitle(event.target.value)} placeholder="Ej. Encuesta de Responsabilidad Social" /></Field></div>
          <div className="full"><Field label="Descripción (opcional)"><Textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="Contexto breve para quien responde" /></Field></div>
          <div className="full">
            <Field label="Audiencia" hint="Externa: enlace público sin sesión. Interna: puede exigir inicio de sesión.">
              <Select
                value={audience}
                onChange={value => setAudience(value as SurveyAudience)}
                options={[{ value: 'CLIENTE_EXTERNO', label: 'Cliente externo (enlace público)' }, { value: 'CLIENTE_INTERNO', label: 'Cliente interno' }]}
              />
            </Field>
          </div>
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={close}>Cancelar</Button>
            <Button identity={identity} disabled={saving || !title.trim()}>{saving ? 'Creando...' : <><Plus size={16} /> Crear y construir</>}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function UseTemplateModal({ template, close, onCreated }: { template: Survey; close(): void; onCreated(survey: Survey): void }) {
  const toast = useToast()
  const [title, setTitle] = useState(template.title.replace(/ \(plantilla\)$/i, ''))
  const [saving, setSaving] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try { onCreated(await surveysService.duplicate(template.id, { title: title.trim(), asTemplate: false })) }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible crear la encuesta a partir de la plantilla') }
    finally { setSaving(false) }
  }

  return (
    <div className="almera-modal" onClick={close}>
      <div className="ds-card almera-dialog" style={{ width: 'min(480px, 100%)' }} onClick={event => event.stopPropagation()}>
        <div className="dialog-head">
          <div><p className="ds-eyebrow" style={{ color: identity.color }}>Desde plantilla</p><h2>Usar "{template.title}"</h2></div>
          <button aria-label="Cerrar" onClick={close}><X /></button>
        </div>
        <form onSubmit={submit} className="dialog-form">
          <div className="full"><Field label="Título de la nueva encuesta"><Input autoFocus required value={title} onChange={event => setTitle(event.target.value)} /></Field></div>
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={close}>Cancelar</Button>
            <Button identity={identity} disabled={saving || !title.trim()}>{saving ? 'Creando...' : <><Sparkles size={16} /> Crear encuesta</>}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function LinkModal({ survey, close }: { survey: Survey; close(): void }) {
  const toast = useToast()
  const [link, setLink] = useState<SurveyLink | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    surveysService.link(survey.id).then(setLink).catch(cause => toast.push('error', cause instanceof Error ? cause.message : 'No fue posible generar el enlace'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [survey.id])

  async function copy() {
    if (!link) return
    await navigator.clipboard.writeText(link.url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="almera-modal" onClick={close}>
      <div className="ds-card almera-dialog survey-link-dialog" onClick={event => event.stopPropagation()}>
        <div className="dialog-head">
          <div><p className="ds-eyebrow" style={{ color: identity.color }}>Difusión</p><h2>Enlace público</h2></div>
          <button aria-label="Cerrar" onClick={close}><X /></button>
        </div>
        {!link ? (
          <div className="p-8 text-center"><Loader2 className="mx-auto animate-spin" size={22} /></div>
        ) : (
          <div className="survey-link-body">
            <img src={link.qrDataUrl} alt="Código QR del enlace" className="survey-link-qr" />
            <div className="survey-link-url">
              <code>{link.url}</code>
              <Button variant="secondary" onClick={copy}>{copied ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar</>}</Button>
            </div>
            <a href={link.url} target="_blank" rel="noreferrer" className="survey-link-open"><ExternalLink size={14} /> Abrir encuesta</a>
          </div>
        )}
      </div>
    </div>
  )
}
