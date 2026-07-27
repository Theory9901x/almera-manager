import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { adherenceService } from '../services/adherenceService'
import type { EvaluationDetail, Score } from '../types'
import { HcMatrixFullscreen } from '../design/HcMatrixFullscreen'
import { buildScoreMap, scoresToPayload } from '../design/scoreMap'
import { useLiveCompliance, type ScoreMap } from '../design/useLiveCompliance'

/**
 * La matriz SOLA, en su propia ventana: para trabajar con dos monitores dejando el resto del
 * sistema en la otra pantalla.
 *
 * Es una superficie de CALIFICACION, nada mas: no trae cabecera de evaluacion, ni cierre, ni
 * firmas, ni plan de mejora. Esas acciones siguen viviendo en la pantalla de operacion, que es
 * donde tienen contexto — repetirlas aqui invitaria a cerrar una evaluacion desde una ventana
 * que no muestra ni las observaciones ni las firmas.
 *
 * Comparte con la vista embebida el motor de calculo y las conversiones del buffer; lo unico
 * propio es que carga su copia del detalle desde el servidor, porque una ventana aparte no puede
 * leer el estado de React de la otra. Por eso quien la abre guarda primero (ver
 * `HcMatrixFullscreen`): asi la ventana nueva arranca con TODO lo calificado.
 */
export default function HcMatrixWindowPage() {
  const { evaluationId } = useParams()
  const [detail, setDetail] = useState<EvaluationDetail | null>(null)
  const [scores, setScores] = useState<ScoreMap>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const load = useCallback(async () => {
    if (!evaluationId) return
    try {
      const result = await adherenceService.evaluationDetail(evaluationId)
      setDetail(result)
      setScores(buildScoreMap(result))
      setDirty(false)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No fue posible cargar la evaluación') }
  }, [evaluationId])

  useEffect(() => { void load() }, [load])

  // Aviso al cerrar con cambios sin guardar. En una ventana suelta importa mas que en una
  // pestaña: se cierra con un gesto y no hay nada mas en pantalla que recuerde que falta guardar.
  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const live = useLiveCompliance(detail?.criteria || [], detail?.scopes || [], detail?.records || [], scores)

  const setScore = (recordId: string, criterionId: string, value: Score) => {
    setScores(current => ({ ...current, [recordId]: { ...current[recordId], [criterionId]: value } }))
    setDirty(true)
  }

  const save = async () => {
    if (!evaluationId) return
    setSaving(true); setError('')
    try {
      await adherenceService.saveScores(evaluationId, scoresToPayload(scores))
      setDirty(false)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No fue posible guardar las calificaciones') }
    finally { setSaving(false) }
  }

  if (error) return <div className="hcwin-msg"><p>{error}</p></div>
  if (!detail) return <div className="hcwin-msg"><Loader2 className="animate-spin" size={22} /><p>Cargando la matriz…</p></div>

  return (
    <HcMatrixFullscreen
      open
      // No hay adonde "volver": esta es la ventana. El boton cierra la ventana, y si el
      // navegador no lo permite (no la abrio un script) al menos avisa.
      onClose={() => {
        window.close()
        window.setTimeout(() => {
          if (!window.closed) setError('Cierra esta ventana desde el navegador: la abriste tú, no el sistema.')
        }, 300)
      }}
      closeLabel="Cerrar ventana"
      evaluationTitle={detail.evaluation.professional_name}
      evaluationSubtitle={`${detail.evaluation.area_name} · ${detail.evaluation.month_reported} · ${detail.records.length} historias clínicas`}
      scopes={detail.scopes}
      criteria={detail.criteria}
      records={detail.records}
      scores={scores}
      live={live}
      disabled={detail.evaluation.status === 'CLOSED'}
      onScore={setScore}
      onSave={() => void save()}
      saving={saving}
      dirty={dirty}
      onReload={() => void load()}
    />
  )
}
