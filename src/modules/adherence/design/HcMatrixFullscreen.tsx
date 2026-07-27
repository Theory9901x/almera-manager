import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronsLeft, ChevronsRight, Download, ExternalLink, Eye, EyeOff, FileSpreadsheet, Minimize2,
  Pin, RefreshCw, Save, Search, Table2,
} from 'lucide-react'
import type { Criterion, EvaluationRecord, Score, Scope } from '../types'
import { HcMatrix } from './HcMatrix'
import { colorForPercent } from './scopeColors'
import type { LiveCompliance, ScoreMap } from './useLiveCompliance'

const ZOOMS = [75, 100, 125]

/** Celda de la escala tal como se lee en la hoja: el numero crudo confundiria 0 con "vacio". */
function scoreLabel(value: Score | undefined) {
  if (value === undefined) return ''
  if (value === null) return 'NA'
  return String(value)
}

const csvCell = (value: string | number | null) => {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * Modo ampliado de la matriz: overlay a pantalla completa, tema oscuro, pensado para las hasta
 * 25 historias clinicas de una evaluacion.
 *
 * No mantiene estado propio de calificaciones: recibe el MISMO buffer (`scores`) y el mismo
 * `onScore` que la vista embebida. Por eso abrir y cerrar no pierde nada — no hay dos copias
 * que sincronizar, hay una sola arriba.
 */
export function HcMatrixFullscreen({
  open, onClose, closeLabel, evaluationTitle, evaluationSubtitle, scopes, criteria, records,
  scores, live, disabled, onScore, onSave, saving, onExportPdf, exporting, onOpenWindow, dirty,
  onReload,
}: {
  open: boolean
  onClose(): void
  /** «Salir de pantalla completa» en el overlay; «Cerrar ventana» en la ventana dedicada. */
  closeLabel?: string
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
  /** Solo en el overlay: abre la matriz en una ventana aparte (dos monitores). */
  onOpenWindow?(): void
  /** Hay cambios sin guardar: se dice en el pie, que es donde vive el botón de guardar. */
  dirty?: boolean
  /** Solo en la ventana dedicada: recarga desde el servidor para traer lo que se guardó en la otra. */
  onReload?(): void
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

  /**
   * Exportacion a Excel del recorte QUE SE ESTA VIENDO: las mismas HC visibles y en el mismo
   * orden, con la escala tal cual y los porcentajes ponderados. Se arma en el cliente a
   * proposito — el servidor no sabe que HC oculto el auditor ni cuales fijo, y un export que
   * no coincide con la pantalla es peor que no tenerlo.
   */
  const exportCsv = () => {
    const head = [
      'Dimensión', 'Criterio', 'Peso', '% Cumplimiento criterio',
      ...visibleRecords.map(record => `HC ${record.record_number}`),
    ]
    const lines: string[] = [head.map(csvCell).join(';')]

    for (const scope of scopes) {
      const scopeCriteria = criteria.filter(criterion => criterion.scope_id === scope.id)
      const scopeWeight = scopeCriteria.reduce((sum, criterion) => sum + Number(criterion.weight), 0)
      const scopePercent = live.byScope.get(scope.id) ?? null
      lines.push([
        scope.name, '(dimensión)', scopeWeight.toFixed(1),
        scopePercent === null ? 'Sin dato' : scopePercent.toFixed(1),
        ...visibleRecords.map(() => ''),
      ].map(csvCell).join(';'))

      for (const criterion of scopeCriteria) {
        const percent = live.byCriterion.get(criterion.id) ?? null
        lines.push([
          scope.name, criterion.text, Number(criterion.weight).toFixed(0),
          percent === null ? 'Sin dato' : percent.toFixed(1),
          ...visibleRecords.map(record => scoreLabel(scores[record.id]?.[criterion.id])),
        ].map(csvCell).join(';'))
      }
    }

    lines.push([
      '% Cumplimiento total por HC', '', '',
      live.overall === null ? 'Sin dato' : live.overall.toFixed(1),
      ...visibleRecords.map(record => {
        const percent = live.byRecord.get(record.id) ?? null
        return percent === null ? 'Sin dato' : percent.toFixed(1)
      }),
    ].map(csvCell).join(';'))

    lines.push('')
    lines.push(['Escala', '2 = cumple; 1 = parcial; 0 = no cumple; NA = no aplica (excluido del cálculo ponderado)'].map(csvCell).join(';'))
    lines.push(['Cumple', String(live.counts.two), 'Parcial', String(live.counts.one), 'No cumple', String(live.counts.zero), 'No aplica', String(live.counts.na)].map(csvCell).join(';'))
    lines.push(['Celdas calificadas', `${live.graded} de ${live.totalCells}`].map(csvCell).join(';'))
    lines.push([evaluationTitle, evaluationSubtitle].map(csvCell).join(';'))

    // BOM: sin el, Excel en Windows abre el archivo en la codificacion del sistema y
    // "Diagnóstico" llega hecho un jeroglifico. Separador ';' por la configuracion española.
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `matriz-adherencia-${evaluationTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

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
          <button className="hcfs-btn" onClick={exportCsv} title="Exporta las HC visibles, en el mismo orden que en pantalla">
            <FileSpreadsheet size={14} /> Excel
          </button>
          {onExportPdf && (
            <button className="hcfs-btn" onClick={onExportPdf} disabled={exporting}>
              <Download size={14} /> {exporting ? 'Generando…' : 'Informe PDF'}
            </button>
          )}
          {onReload && (
            <button className="hcfs-btn" onClick={onReload} title="Traer lo que se haya guardado desde la otra pantalla">
              <RefreshCw size={14} /> Recargar
            </button>
          )}
          {onOpenWindow && (
            <button className="hcfs-btn" onClick={onOpenWindow} disabled={saving} title="Guarda y abre la matriz en una ventana aparte, para dos monitores">
              <ExternalLink size={14} /> Ventana nueva
            </button>
          )}
          {!disabled && (
            <button className={`hcfs-btn is-pri${dirty ? ' is-dirty' : ''}`} onClick={onSave} disabled={saving}>
              <Save size={14} /> {saving ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Guardar calificaciones'}
            </button>
          )}
          <button className="hcfs-btn" onClick={onClose}>
            <Minimize2 size={14} /> {closeLabel || 'Salir de pantalla completa'}
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
          {dirty && <span className="hcfs-dirty">· cambios sin guardar</span>}
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
