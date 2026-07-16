import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, BarChart3, Loader2, Search, Trash2, X } from 'lucide-react'
import { Badge, Button, Card, Field, Input, PageHeader, Select, Table, ToastProvider, moduleIdentity, useToast } from '@/design-system'
import { useAuth } from '@/platform/auth/AuthContext'
import { surveysService } from '../services/surveysService'
import { ConfirmDialog } from '../components/ConfirmDialog'
import type { SurveyDetail, SurveyResponseDetail, SurveyResponseSummary } from '../types'

const identity = moduleIdentity('surveys')
const PAGE_SIZE = 25
// Tipos de pregunta que tienen sentido como filtro de "perfil" (proceso, CAPS, area, sexo...): se
// excluyen los de texto largo o los de estructura compleja (matching, ranking, escalas), que no
// sirven como criterio de segmentacion.
const SEGMENT_CANDIDATE_TYPES = new Set(['SHORT_TEXT', 'SINGLE_CHOICE', 'DROPDOWN', 'YES_NO'])

export default function SurveyResponsesPage() {
  return <ToastProvider><SurveyResponsesContent /></ToastProvider>
}

function SurveyResponsesContent() {
  const { surveyId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { session } = useAuth()
  const isSuperadmin = session?.role.key === 'SUPERADMIN'

  const [survey, setSurvey] = useState<SurveyDetail | null>(null)
  const [rows, setRows] = useState<SurveyResponseSummary[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [segmentQuestionId, setSegmentQuestionId] = useState('')
  const [segmentValue, setSegmentValue] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detailId, setDetailId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SurveyResponseSummary | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  async function load(surveyRef: SurveyDetail | null) {
    if (!surveyId) return
    setLoading(true)
    try {
      const [detail, result] = await Promise.all([
        surveyRef ? Promise.resolve(surveyRef) : surveysService.detail(surveyId),
        surveysService.responses(surveyId, {
          dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, search: search || undefined,
          segmentQuestionId: segmentQuestionId || undefined, segmentValue: segmentValue || undefined,
          limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE),
        }),
      ])
      setSurvey(detail)
      setRows(result.rows)
      setTotal(result.total)
      setSelected(new Set())
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar las respuestas') }
    finally { setLoading(false) }
  }

  // Un solo efecto debounced para todos los filtros: evita disparar una consulta por cada tecla
  // escrita en el buscador, sin necesidad de logica separada para el resto de los filtros.
  useEffect(() => {
    const timeout = window.setTimeout(() => { void load(survey) }, 300)
    return () => window.clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId, page, dateFrom, dateTo, search, segmentQuestionId, segmentValue])

  const questions = useMemo(() => survey?.pages.flatMap(page => page.questions) || [], [survey])
  const segmentCandidates = useMemo(() => questions.filter(question => SEGMENT_CANDIDATE_TYPES.has(question.type)), [questions])
  const segmentQuestion = questions.find(question => question.id === segmentQuestionId)

  function toggleSelect(id: string) {
    setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  async function confirmDelete() {
    if (!surveyId || !deleteTarget) return
    try {
      await surveysService.deleteResponse(surveyId, deleteTarget.id)
      toast.push('success', 'Respuesta eliminada')
      setDeleteTarget(null)
      void load(survey)
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible eliminar') }
  }

  async function confirmBulkDelete() {
    if (!surveyId) return
    try {
      const result = await surveysService.bulkDeleteResponses(surveyId, [...selected])
      toast.push('success', `${result.deleted} respuesta${result.deleted === 1 ? '' : 's'} eliminada${result.deleted === 1 ? '' : 's'}`)
      setBulkDeleteOpen(false)
      void load(survey)
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible eliminar') }
  }

  if (loading && !survey) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin" size={24} /></div>
  if (!survey) return null

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Respuestas"
        title={survey.title}
        description={`${survey.code} · ${total} respuesta${total === 1 ? '' : 's'} registrada${total === 1 ? '' : 's'}`}
        identity={identity}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/app/encuestas')}><ArrowLeft size={15} /> Encuestas</Button>
            <Button variant="secondary" onClick={() => navigate(`/app/encuestas/${survey.id}/resultados`)}><BarChart3 size={15} /> Resultados</Button>
          </div>
        }
      />

      <Card accent={identity.color} className="flex flex-wrap items-end gap-3 p-4">
        <Field label="Buscar por nombre"><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nombre del encuestado" /></Field>
        <Field label="Desde"><Input type="date" value={dateFrom} onChange={event => { setDateFrom(event.target.value); setPage(0) }} /></Field>
        <Field label="Hasta"><Input type="date" value={dateTo} onChange={event => { setDateTo(event.target.value); setPage(0) }} /></Field>
        {segmentCandidates.length > 0 && (
          <>
            <Field label="Filtrar por campo">
              <Select
                value={segmentQuestionId}
                onChange={value => { setSegmentQuestionId(value); setSegmentValue(''); setPage(0) }}
                placeholder="Sin filtro"
                options={[{ value: '', label: 'Sin filtro' }, ...segmentCandidates.map(question => ({ value: question.id, label: question.prompt }))]}
              />
            </Field>
            {segmentQuestion && (
              <Field label="Valor">
                {(segmentQuestion.config.options as { id: string; label: string }[] | undefined)?.length || segmentQuestion.type === 'YES_NO' ? (
                  <Select
                    value={segmentValue}
                    onChange={value => { setSegmentValue(value); setPage(0) }}
                    placeholder="Selecciona un valor"
                    options={segmentQuestion.type === 'YES_NO'
                      ? [{ value: 'SI', label: 'Sí' }, { value: 'NO', label: 'No' }]
                      : (segmentQuestion.config.options as { id: string; label: string }[]).map(option => ({ value: option.id, label: option.label }))}
                  />
                ) : (
                  <Input value={segmentValue} onChange={event => { setSegmentValue(event.target.value); setPage(0) }} placeholder="Texto a buscar" />
                )}
              </Field>
            )}
          </>
        )}
        {(dateFrom || dateTo || search || segmentQuestionId) && (
          <Button variant="ghost" onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); setSegmentQuestionId(''); setSegmentValue(''); setPage(0) }}><X size={14} /> Limpiar</Button>
        )}
      </Card>

      {isSuperadmin && selected.size > 0 && (
        <Card className="flex items-center justify-between p-3">
          <span className="text-sm font-semibold">{selected.size} seleccionada{selected.size === 1 ? '' : 's'}</span>
          <Button variant="danger" onClick={() => setBulkDeleteOpen(true)}><Trash2 size={14} /> Eliminar seleccionadas</Button>
        </Card>
      )}

      <Card className="p-0">
        <Table>
          <thead>
            <tr>
              {isSuperadmin && <th style={{ width: 32 }} />}
              <th>Fecha y hora</th>
              <th>Encuestado</th>
              <th>Estado</th>
              <th style={{ width: 100 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                {isSuperadmin && (
                  <td><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} /></td>
                )}
                <td>{new Date(row.submitted_at || row.started_at).toLocaleString()}</td>
                <td>{row.respondent_name || `Respuesta #${row.id}`}</td>
                <td><Badge tone={row.completed ? 'info' : 'neutral'}>{row.completed ? 'Completa' : 'Abandonada'}</Badge></td>
                <td>
                  <div className="flex gap-2">
                    <button className="survey-icon-button" title="Ver detalle" onClick={() => setDetailId(row.id)}><Search size={14} /></button>
                    {isSuperadmin && (
                      <button className="survey-icon-button is-danger" title="Eliminar" onClick={() => setDeleteTarget(row)}><Trash2 size={14} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td colSpan={isSuperadmin ? 5 : 4} className="py-8 text-center text-sm text-[var(--muted)]">Sin respuestas para estos filtros.</td></tr>
            )}
          </tbody>
        </Table>
      </Card>

      <div className="flex items-center justify-between text-sm text-[var(--muted)]">
        <span>Página {page + 1} de {totalPages}</span>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={page === 0} onClick={() => setPage(current => current - 1)}>Anterior</Button>
          <Button variant="secondary" disabled={page >= totalPages - 1} onClick={() => setPage(current => current + 1)}>Siguiente</Button>
        </div>
      </div>

      {detailId && <ResponseDetailModal surveyId={survey.id} responseId={detailId} onClose={() => setDetailId(null)} />}

      {deleteTarget && (
        <ConfirmDialog
          title="¿Eliminar esta respuesta?"
          message="Esta acción no se puede deshacer. La respuesta y todas sus respuestas individuales se eliminarán permanentemente."
          confirmLabel="Eliminar"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}

      {bulkDeleteOpen && (
        <ConfirmDialog
          title={`¿Eliminar ${selected.size} respuestas?`}
          message="Esta acción no se puede deshacer. Todas las respuestas seleccionadas se eliminarán permanentemente."
          confirmLabel="Eliminar todas"
          onCancel={() => setBulkDeleteOpen(false)}
          onConfirm={confirmBulkDelete}
        />
      )}
    </div>
  )
}

function ResponseDetailModal({ surveyId, responseId, onClose }: { surveyId: string; responseId: string; onClose(): void }) {
  const [detail, setDetail] = useState<SurveyResponseDetail | null>(null)
  useEffect(() => { void surveysService.responseDetail(surveyId, responseId).then(setDetail) }, [surveyId, responseId])
  return (
    <div className="almera-modal" onClick={onClose}>
      <div className="ds-card almera-dialog" style={{ width: 'min(560px, 100%)', maxHeight: '80vh', overflowY: 'auto' }} onClick={event => event.stopPropagation()}>
        <div className="dialog-head"><h2>Detalle de respuesta</h2><button aria-label="Cerrar" onClick={onClose}><X /></button></div>
        {!detail ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin" size={20} /></div>
        ) : (
          <div className="mt-3 space-y-3">
            {detail.items.map(item => (
              <div key={item.question_id} className="border-b border-[var(--line)] pb-2">
                <p className="text-xs font-bold text-[var(--muted)]">{item.prompt}</p>
                <p className="text-sm">{item.text_value || <span className="text-[var(--muted)]">Sin respuesta</span>}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
