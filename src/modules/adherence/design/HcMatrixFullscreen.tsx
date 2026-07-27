import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronsLeft, ChevronsRight, Download, Eye, EyeOff, Minimize2, Pin, Save, Search, Table2,
} from 'lucide-react'
import type { Criterion, EvaluationRecord, Score, Scope } from '../types'
import { HcMatrix } from './HcMatrix'
import { colorForPercent } from './scopeColors'
import type { LiveCompliance, ScoreMap } from './useLiveCompliance'

const ZOOMS = [75, 100, 125]

/**
 * Modo ampliado de la matriz: overlay a pantalla completa, tema oscuro, pensado para las hasta
 * 25 historias clinicas de una evaluacion.
 *
 * No mantiene estado propio de calificaciones: recibe el MISMO buffer (`scores`) y el mismo
 * `onScore` que la vista embebida. Por eso abrir y cerrar no pierde nada — no hay dos copias
 * que sincronizar, hay una sola arriba.
 */
export function HcMatrixFullscreen({
  open, onClose, evaluationTitle, evaluationSubtitle, scopes, criteria, records, scores, live,
  disabled, onScore, onSave, saving, onExportPdf, exporting,
}: {
  open: boolean
  onClose(): void
  evaluationTitle: string
  evaluationSubtitle: string
  scopes: Scope[]
  criteria: Criterion[]
  records: EvaluationRecord[]
  scores: ScoreMap
  live: LiveCompliance
  disabled?: boolean
  onScore(recordId: string, criterionId: string, value: Score): void
  onSave(): void
  saving?: boolean
  onExportPdf?(): void
  exporting?: boolean
}) {
  const [zoom, setZoom] = useState(100)
  const [stickyColumns, setStickyColumns] = useState(true)
  const [hideCompleted, setHideCompleted] = useState(false)
  const [search, setSearch] = useState('')
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null)
  const [pinned, setPinned] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    // Sin esto, la pagina de debajo sigue desplazandose con la rueda sobre el overlay.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous }
  }, [open, onClose])

  // Las HC fijadas se muestran SIEMPRE, aunque estén completas o filtradas: son la referencia
  // contra la que se recorre el resto.
  const visibleRecords = useMemo(() => records.filter(record => {
    if (pinned.has(record.id)) return true
    if (hideCompleted && live.completedRecordIds.has(record.id)) return false
    if (search.trim() && !record.record_number.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  }), [records, pinned, hideCompleted, search, live.completedRecordIds])

  if (!open) return null

  const scrollTo = (edge: 'start' | 'end') => {
    const node = scrollRef.current
    if (node) node.scrollTo({ left: edge === 'start' ? 0 : node.scrollWidth, behavior: 'smooth' })
  }

  const jumpToRecord = (recordId: string) => {
    setActiveRecordId(recordId)
    document.getElementById(`hc-col-${recordId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }

  const togglePin = (recordId: string) => {
    setPinned(current => {
      const next = new Set(current)
      if (next.has(recordId)) next.delete(recordId)
      else next.add(recordId)
      return next
    })
  }

  const pending = live.totalCells - live.graded
  const progress = live.totalCells ? Math.round((live.graded / live.totalCells) * 100) : 0

  return createPortal(
    <div className="hcfs" role="dialog" aria-modal="true" aria-label="Matriz de adherencia en pantalla completa">
      <header className="hcfs-top">
        <div className="hcfs-top-l">
          <span className="hcfs-logo"><Table2 size={17} /></span>
          <div className="min-w-0">
            <div className="hcfs-crumbs">Matrices de adherencia › Matriz de criterios › <b>Pantalla completa</b></div>
            <h2>{evaluationTitle}</h2>
            <p>{evaluationSubtitle}</p>
          </div>
        </div>
        <div className="hcfs-top-r">
          {onExportPdf && (
            <button className="hcfs-btn" onClick={onExportPdf} disabled={exporting}>
              <Download size={14} /> {exporting ? 'Generando…' : 'Exportar'}
            </button>
          )}
          {!disabled && (
            <button className="hcfs-btn is-pri" onClick={onSave} disabled={saving}>
              <Save size={14} /> {saving ? 'Guardando…' : 'Guardar calificaciones'}
            </button>
          )}
          <button className="hcfs-btn" onClick={onClose}>
            <Minimize2 size={14} /> Salir de pantalla completa
          </button>
        </div>
      </header>

      <div className="hcfs-legend">
        <span className="hcfs-lg"><i className="sc-2">2</i> Cumple</span>
        <span className="hcfs-lg"><i className="sc-1">1</i> Parcial</span>
        <span className="hcfs-lg"><i className="sc-0">0</i> No cumple</span>
        <span className="hcfs-lg"><i className="sc-na">NA</i> No aplica</span>
        <span className="hcfs-lg is-muted">NA se excluye del cálculo ponderado</span>
      </div>

      <div className="hcfs-controls">
        <label className="hcfs-f">
          <span>Buscar / saltar a HC</span>
          <span className="hcfs-search">
            <Search size={13} />
            <input
              value={search}
              placeholder="Nº de historia clínica"
              onChange={event => setSearch(event.target.value)}
              onKeyDown={event => {
                if (event.key !== 'Enter') return
                const match = records.find(record => record.record_number.toLowerCase().includes(search.trim().toLowerCase()))
                if (match) jumpToRecord(match.id)
              }}
            />
          </span>
        </label>
        <label className="hcfs-f">
          <span>Zoom</span>
          <span className="hcfs-segs">
            {ZOOMS.map(value => (
              <button key={value} className={zoom === value ? 'is-on' : ''} onClick={() => setZoom(value)}>{value}%</button>
            ))}
          </span>
        </label>
        <label className="hcfs-f">
          <span>Columnas fijas</span>
          <button className={`hcfs-toggle ${stickyColumns ? 'is-on' : ''}`} onClick={() => setStickyColumns(!stickyColumns)}>
            <i />{stickyColumns ? 'Activadas' : 'Libres'}
          </button>
        </label>
        <label className="hcfs-f">
          <span>HC completadas</span>
          <button className={`hcfs-toggle ${hideCompleted ? 'is-on' : ''}`} onClick={() => setHideCompleted(!hideCompleted)}>
            {hideCompleted ? <EyeOff size={13} /> : <Eye size={13} />}
            {hideCompleted ? 'Ocultas' : 'Visibles'}
          </button>
        </label>
        <div className="hcfs-spacer" />
        <button className="hcfs-btn" onClick={() => scrollTo('start')}><ChevronsLeft size={14} /> Ir al inicio</button>
        <button className="hcfs-btn" onClick={() => scrollTo('end')}>Ir al final <ChevronsRight size={14} /></button>
      </div>

      {/* Fijar HC de referencia: se quedan visibles mientras se recorren las demas. */}
      <div className="hcfs-pins">
        <span>Fijar como referencia:</span>
        {records.map(record => (
          <button
            key={record.id}
            className={`hcfs-pin ${pinned.has(record.id) ? 'is-on' : ''}`}
            onClick={() => togglePin(record.id)}
            title={pinned.has(record.id) ? 'Quitar de referencia' : 'Fijar esta HC como referencia'}
          >
            <Pin size={10} /> {record.record_number}
          </button>
        ))}
      </div>

      <div
        className={`hcfs-tablewrap ${stickyColumns ? 'is-sticky' : ''}`}
        ref={scrollRef}
        style={{ ['--hcfs-zoom' as string]: String(zoom / 100) }}
      >
        {visibleRecords.length ? (
          <HcMatrix
            variant="fullscreen"
            scopes={scopes}
            criteria={criteria}
            records={visibleRecords}
            scores={scores}
            live={live}
            disabled={disabled}
            activeRecordId={activeRecordId}
            onFocusRecord={setActiveRecordId}
            onScore={onScore}
            pinnedRecordIds={pinned}
          />
        ) : (
          <p className="hcfs-empty">
            Ninguna historia clínica coincide con el filtro. Quita la búsqueda o vuelve a mostrar las completadas.
          </p>
        )}
      </div>

      <footer className="hcfs-foot">
        <div className="hcfs-showing">
          Mostrando {visibleRecords.length} de {records.length} historias clínicas
          {pending > 0 ? ` · faltan ${pending} celdas por calificar` : ' · todo calificado'}
        </div>
        <div className="hcfs-progress">
          <span><i style={{ width: `${progress}%` }} /></span>
          <b>{progress}%</b>
        </div>
        <div className="hcfs-counts">
          <span className="hcfs-cnt"><i className="sc-2">2</i> Cumple <b>{live.counts.two}</b></span>
          <span className="hcfs-cnt"><i className="sc-1">1</i> Parcial <b>{live.counts.one}</b></span>
          <span className="hcfs-cnt"><i className="sc-0">0</i> No cumple <b>{live.counts.zero}</b></span>
          <span className="hcfs-cnt"><i className="sc-na">NA</i> No aplica <b>{live.counts.na}</b></span>
        </div>
        <div className="hcfs-overall">
          <span>Cumplimiento general</span>
          <b style={{ color: colorForPercent(live.overall) }}>
            {live.overall === null ? '—' : `${live.overall.toFixed(1)}%`}
          </b>
        </div>
      </footer>
    </div>,
    document.body,
  )
}
