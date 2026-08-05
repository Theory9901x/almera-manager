import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronDown, ChevronUp, Download, ExternalLink, FileSpreadsheet, Lock, Minimize2, RefreshCw,
  Save, Search, Table2,
} from 'lucide-react'
import { ConfirmDialog } from '@/design-system'
// Semaforo del modulo: verde desde 85 % (ver src/modules/checklists/scale.ts).
import { checklistColor as semaphoreColor } from '../scale'
import type { ActionPlan, AuditSubject, ChecklistDomain, ChecklistValue } from '../types'
import { ChecklistFillGrid, type DomainTally } from './ChecklistFillGrid'

const ZOOMS = [75, 100, 125]

const csvCell = (value: string | number | null) => {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * Modo ampliado del diligenciamiento de listas de chequeo: overlay a pantalla completa, tema
 * claro y oscuro, con las mismas piezas que la matriz de adherencia (CLAUDE.md §12) — legend de
 * la escala, KPIs de avance en el pie, zoom, buscar/saltar a dominio y guardado con confirmacion.
 *
 * No mantiene estado propio de MARCAS: recibe el mismo buffer (`marks`) y el mismo `onMark` que
 * la vista embebida. Abrir y cerrar no pierde nada — no hay dos copias que sincronizar, hay una
 * sola arriba. Lo unico local es la UI (dominios colapsados, zoom, busqueda): se reinicia cada
 * vez que se abre, como en la matriz.
 */
export function ChecklistFillFullscreen({
  open, onClose, closeLabel, title, subtitle, domains, subjects, numberedItems, marks,
  notesByAnswer, closed, onMark, onNote, plansByKey, onOpenPlan, onNavigatePlan, domainTally,
  identityColor, overallPercent, counts, totalCells, markedCells, onSave, saving, dirty,
  onExportPdf, exporting, onOpenWindow, onReload,
}: {
  open: boolean
  onClose(): void
  /** «Salir de pantalla completa» en el overlay; «Cerrar ventana» en la ventana dedicada. */
  closeLabel?: string
  title: string
  subtitle: string
  domains: ChecklistDomain[]
  subjects: AuditSubject[]
  numberedItems: boolean
  marks: Record<string, ChecklistValue>
  notesByAnswer: Record<string, string>
  closed: boolean
  onMark(subjectId: string, criterionId: string, value: ChecklistValue): void
  onNote(subjectId: string, criterionId: string, value: string): void
  plansByKey: Map<string, ActionPlan>
  onOpenPlan(subjectId: string, criterionId: string): void
  onNavigatePlan(planId: string): void
  domainTally(domain: ChecklistDomain): DomainTally
  identityColor: string
  overallPercent: number | null
  counts: { c: number; nc: number; na: number }
  totalCells: number
  markedCells: number
  onSave(): void
  saving?: boolean
  dirty?: boolean
  onExportPdf?(): void
  exporting?: boolean
  /** Solo en el overlay: abre la ronda en una ventana aparte (dos monitores). */
  onOpenWindow?(): void
  /** Solo en la ventana dedicada: recarga desde el servidor lo guardado en la otra pantalla. */
  onReload?(): void
}) {
  const [zoom, setZoom] = useState(100)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [activeDomainId, setActiveDomainId] = useState<string | null>(null)
  // Confirmacion antes de guardar: desde la vista ampliada se escribe sobre la auditoria que la
  // pantalla principal tiene abierta, y conviene decirlo antes de hacerlo.
  const [confirmSave, setConfirmSave] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous }
  }, [open, onClose])

  // La UI local se reinicia cada vez que se abre, igual que en la matriz.
  useEffect(() => { if (open) { setCollapsed(new Set()); setSearch(''); setActiveDomainId(null) } }, [open])

  const visibleDomains = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return domains
    return domains.filter(domain => domain.name.toLowerCase().includes(needle)
      || domain.criteria.some(criterion => criterion.text.toLowerCase().includes(needle)))
  }, [domains, search])

  /** Exporta el recorte que se esta viendo, con la escala tal cual. */
  const exportCsv = () => {
    const head = ['Dominio', 'Criterio', ...subjects.map(subject => subject.display_name)]
    const lines: string[] = [head.map(csvCell).join(';')]
    for (const domain of visibleDomains) {
      for (const criterion of domain.criteria) {
        lines.push([
          domain.name, criterion.text,
          ...subjects.map(subject => marks[`${subject.id}|${criterion.id}`] || ''),
        ].map(csvCell).join(';'))
      }
    }
    lines.push('')
    lines.push(['Escala', 'C = cumple; NC = no cumple; NA = no aplica (excluido del cálculo)'].map(csvCell).join(';'))
    lines.push(['Cumple', String(counts.c), 'No cumple', String(counts.nc), 'No aplica', String(counts.na)].map(csvCell).join(';'))
    lines.push(['Marcados', `${markedCells} de ${totalCells}`].map(csvCell).join(';'))
    lines.push([title, subtitle].map(csvCell).join(';'))
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `lista-chequeo-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (!open) return null

  const jumpToDomain = (id: string) => {
    setActiveDomainId(id)
    setCollapsed(current => { const next = new Set(current); next.delete(id); return next })
    document.getElementById(`ckfs-dom-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const progress = totalCells ? Math.round((markedCells / totalCells) * 100) : 0
  const pending = totalCells - markedCells

  return createPortal(
    <div className="hcfs" role="dialog" aria-modal="true" aria-label="Diligenciamiento en pantalla completa">
      <ConfirmDialog
        open={confirmSave}
        title="¿Guardar la auditoría?"
        confirmLabel={saving ? 'Guardando…' : 'Sí, guardar'}
        cancelLabel="Seguir marcando"
        busy={saving}
        onCancel={() => setConfirmSave(false)}
        onConfirm={() => { setConfirmSave(false); onSave() }}
        description={
          <p>
            Se guardan <strong>{markedCells} de {totalCells}</strong> ítems marcados
            {overallPercent !== null ? <> y la adherencia queda en <strong>{overallPercent.toFixed(1)} %</strong></> : null}.
            {' '}El resultado pasa a la pantalla principal de la auditoría.
          </p>
        }
      />

      <header className="hcfs-top">
        <div className="hcfs-top-l">
          <span className="hcfs-logo"><Table2 size={17} /></span>
          <div className="min-w-0">
            <div className="hcfs-crumbs">Listas de Chequeo › Diligenciamiento › <b>Pantalla completa</b></div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
        </div>
        <div className="hcfs-top-r">
          {/* Adherencia EN VIVO en el encabezado. Estaba solo en el pie y en letra pequena: en una
              lista de 40 items el pie queda fuera de vista mientras se marca, asi que el dato que
              justifica toda la ronda no se veia nunca hasta el final. Aqui esta siempre visible y
              se mueve con cada marca — misma cifra que el pie y que el informe. */}
          <div className="hcfs-live" style={{ ['--live-accent' as string]: overallPercent === null ? 'var(--muted)' : semaphoreColor(overallPercent) }}>
            <span className="hcfs-live-l">Adherencia total</span>
            <b className="hcfs-live-v">{overallPercent === null ? '—' : `${overallPercent.toFixed(1)}%`}</b>
            <span className="hcfs-live-sub">
              {markedCells}/{totalCells} marcados
              {pending > 0 ? ` · faltan ${pending}` : ' · completo'}
            </span>
          </div>
          <button className="hcfs-btn" onClick={exportCsv} title="Exporta los dominios visibles, en el mismo orden que en pantalla">
            <FileSpreadsheet size={14} /> Excel
          </button>
          {onExportPdf && (
            <button className="hcfs-btn" onClick={onExportPdf} disabled={exporting}>
              <Download size={14} /> {exporting ? 'Generando…' : 'Descargar PDF'}
            </button>
          )}
          {onReload && (
            <button className="hcfs-btn" onClick={onReload} title="Traer lo que se haya guardado desde la otra pantalla">
              <RefreshCw size={14} /> Recargar
            </button>
          )}
          {onOpenWindow && (
            <button className="hcfs-btn" onClick={onOpenWindow} disabled={saving} title="Guarda y abre la auditoría en una ventana aparte, para dos monitores">
              <ExternalLink size={14} /> Ventana nueva
            </button>
          )}
          {!closed && (
            <button className={`hcfs-btn is-pri${dirty ? ' is-dirty' : ''}`} onClick={() => setConfirmSave(true)} disabled={saving}>
              <Save size={14} /> {saving ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Guardar borrador'}
            </button>
          )}
          <button className="hcfs-btn" onClick={onClose}>
            <Minimize2 size={14} /> {closeLabel || 'Salir de pantalla completa'}
          </button>
        </div>
      </header>

      {closed && (
        <div className="hcfs-readonly">
          <Lock size={14} />
          <span><b>Auditoría cerrada.</b> Se muestra en solo lectura: para volver a marcar hay que reabrirla desde la pantalla principal.</span>
        </div>
      )}

      <div className="hcfs-legend">
        <span className="hcfs-lg"><i className="ck-c">C</i> Cumple</span>
        <span className="hcfs-lg"><i className="ck-nc">NC</i> No cumple</span>
        <span className="hcfs-lg"><i className="ck-na">NA</i> No aplica</span>
        <span className="hcfs-lg is-muted">NA se excluye del cálculo</span>
      </div>

      <div className="hcfs-controls">
        <label className="hcfs-f">
          <span>Buscar / saltar a dominio</span>
          <span className="hcfs-search">
            <Search size={13} />
            <input
              value={search}
              placeholder="Nombre del dominio o del criterio"
              onChange={event => setSearch(event.target.value)}
              onKeyDown={event => {
                if (event.key !== 'Enter') return
                const match = domains.find(domain => domain.name.toLowerCase().includes(search.trim().toLowerCase()))
                if (match) jumpToDomain(String(match.id))
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
        <div className="hcfs-spacer" />
        <button
          className="hcfs-btn"
          onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(domains.map(d => String(d.id))))}
        >
          {collapsed.size ? <><ChevronDown size={14} /> Expandir todo</> : <><ChevronUp size={14} /> Colapsar todo</>}
        </button>
      </div>

      {/* Saltar a un dominio concreto: con 8-10 dominios ayuda a no perderse en el scroll. */}
      <div className="hcfs-pins">
        <span>Ir a:</span>
        {domains.map((domain, index) => (
          <button key={domain.id} className="hcfs-pin" onClick={() => jumpToDomain(String(domain.id))}>
            {index + 1}. {domain.name}
          </button>
        ))}
      </div>

      <div className="hcfs-tablewrap ckfs-tablewrap" style={{ ['--hcfs-zoom' as string]: String(zoom / 100) }}>
        {visibleDomains.length ? (
          <ChecklistFillGrid
            variant="fullscreen"
            domains={visibleDomains}
            subjects={subjects}
            numberedItems={numberedItems}
            marks={marks}
            notesByAnswer={notesByAnswer}
            closed={closed}
            collapsed={collapsed}
            onToggleDomain={id => setCollapsed(current => {
              const next = new Set(current)
              if (next.has(id)) next.delete(id); else next.add(id)
              return next
            })}
            onMark={onMark}
            onNote={onNote}
            plansByKey={plansByKey}
            onOpenPlan={onOpenPlan}
            onNavigatePlan={onNavigatePlan}
            domainTally={domainTally}
            identityColor={identityColor}
            activeDomainId={activeDomainId}
          />
        ) : (
          <p className="hcfs-empty">Ningún dominio coincide con la búsqueda.</p>
        )}
      </div>

      <footer className="hcfs-foot">
        <div className="hcfs-showing">
          Mostrando {visibleDomains.length} de {domains.length} dominios
          {pending > 0 ? ` · faltan ${pending} ítems por marcar` : ' · todo marcado'}
          {dirty && <span className="hcfs-dirty">· cambios sin guardar</span>}
        </div>
        <div className="hcfs-progress">
          <span><i style={{ width: `${progress}%` }} /></span>
          <b>{progress}%</b>
        </div>
        <div className="hcfs-counts">
          <span className="hcfs-cnt"><i className="ck-c">C</i> Cumple <b>{counts.c}</b></span>
          <span className="hcfs-cnt"><i className="ck-nc">NC</i> No cumple <b>{counts.nc}</b></span>
          <span className="hcfs-cnt"><i className="ck-na">NA</i> No aplica <b>{counts.na}</b></span>
        </div>
        <div className="hcfs-overall">
          <span>Cumplimiento general</span>
          <b style={{ color: overallPercent === null ? 'var(--muted)' : semaphoreColor(overallPercent) }}>
            {overallPercent === null ? '—' : `${overallPercent.toFixed(1)}%`}
          </b>
        </div>
      </footer>
    </div>,
    document.body,
  )
}
