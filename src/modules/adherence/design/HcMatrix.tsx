import { Fragment } from 'react'
import { X } from 'lucide-react'
import type { Criterion, EvaluationRecord, Score, Scope } from '../types'
import { ComplianceRing } from './ComplianceRing'
import { ScoreSelector } from './ScoreSelector'
import { colorForPercent, scopeColor } from './scopeColors'
import type { LiveCompliance, ScoreMap } from './useLiveCompliance'

/**
 * Matriz criterio x historia clinica. UN solo componente para las dos vistas: embebida (tema
 * claro, pocas HC) y ampliada (tema oscuro, hasta 25). El modo ampliado no es otra matriz, es
 * esta con mas espacio — si fueran dos, arreglar el calculo o el sticky en una dejaria la otra
 * rota, que es como se acumulan las diferencias entre pantallas.
 *
 * Sticky en los dos ejes: la columna de criterio se queda al desplazar en horizontal y el
 * encabezado de HC al desplazar en vertical. Sin eso, con 25 columnas se califica a ciegas.
 */
export function HcMatrix({
  variant, scopes, criteria, records, scores, live, disabled,
  activeRecordId, onFocusRecord, onScore, onRemoveRecord, pinnedRecordIds,
}: {
  variant: 'embedded' | 'fullscreen'
  scopes: Scope[]
  criteria: Criterion[]
  records: EvaluationRecord[]
  scores: ScoreMap
  live: LiveCompliance
  disabled?: boolean
  /** HC resaltada: evita calificar la columna equivocada entre 25. */
  activeRecordId?: string | null
  onFocusRecord?(recordId: string | null): void
  onScore(recordId: string, criterionId: string, value: Score): void
  onRemoveRecord?(recordId: string): void
  /** HC fijadas como referencia: se pintan con un borde propio. */
  pinnedRecordIds?: Set<string>
}) {
  const full = variant === 'fullscreen'

  return (
    <table className={`hc-matrix ${full ? 'is-full' : 'is-embedded'}`}>
      <thead>
        <tr>
          <th className="hcm-criterion">{full ? 'Dimensión / Criterio' : 'Criterio'}</th>
          <th className="hcm-weight">Peso</th>
          <th className="hcm-pct">% Cumpl.</th>
          {records.map(record => (
            <th
              key={record.id}
              className={`hcm-hc${activeRecordId === record.id ? ' is-active' : ''}${pinnedRecordIds?.has(record.id) ? ' is-pinned' : ''}`}
              id={`hc-col-${record.id}`}
              onPointerEnter={() => onFocusRecord?.(record.id)}
            >
              <span className="hcm-hc-label">HC {record.record_number}</span>
              {/* % en vivo de esa historia en su propio encabezado: de un vistazo se ve cual va mal. */}
              <ComplianceRing percent={live.byRecord.get(record.id) ?? null} size={full ? 26 : 30} strokeWidth={3} />
              {onRemoveRecord && !disabled && (
                <button className="hcm-hc-remove" title={`Quitar HC ${record.record_number}`} onClick={() => onRemoveRecord(record.id)}>
                  <X size={11} />
                </button>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {scopes.map((scope, scopeIndex) => {
          const color = scopeColor(scopeIndex)
          const scopeCriteria = criteria.filter(criterion => criterion.scope_id === scope.id)
          // Peso de la dimension: la suma de los pesos de sus criterios.
          const scopeWeight = scopeCriteria.reduce((sum, criterion) => sum + Number(criterion.weight), 0)
          const scopePercent = live.byScope.get(scope.id) ?? null
          return (
            <Fragment key={scope.id}>
              <tr className="hcm-scope-row">
                <td className="hcm-criterion">
                  <span className="hcm-scope-name">{scope.name}</span>
                  <span className="hcm-scope-count">{scopeCriteria.length} criterios</span>
                </td>
                <td className="hcm-weight"><span className="hcm-wchip">{scopeWeight.toFixed(1)}</span></td>
                <td className="hcm-pct">
                  {full
                    ? <b style={{ color: colorForPercent(scopePercent) }}>{scopePercent === null ? '—' : `${scopePercent.toFixed(1)}%`}</b>
                    : <ComplianceRing percent={scopePercent} size={30} strokeWidth={3.5} />}
                </td>
                {records.map(record => (
                  <td key={record.id} className={activeRecordId === record.id ? 'is-active' : ''} />
                ))}
              </tr>
              {scopeCriteria.map(criterion => {
                const percent = live.byCriterion.get(criterion.id) ?? null
                return (
                  <tr key={criterion.id} className="hcm-criterion-row" style={{ borderLeftColor: color.from }}>
                    <td className="hcm-criterion is-sub">{criterion.text}</td>
                    <td className="hcm-weight"><span className="hcm-w">{Number(criterion.weight).toFixed(0)}</span></td>
                    <td className="hcm-pct">
                      {full
                        ? <b style={{ color: colorForPercent(percent) }}>{percent === null ? '—' : `${percent.toFixed(1)}%`}</b>
                        : <ComplianceRing percent={percent} size={28} strokeWidth={3.5} />}
                    </td>
                    {records.map(record => (
                      <td key={record.id} className={activeRecordId === record.id ? 'is-active' : ''}>
                        <ScoreSelector
                          compact={full}
                          value={scores[record.id]?.[criterion.id]}
                          disabled={disabled}
                          onFocus={() => onFocusRecord?.(record.id)}
                          onChange={value => onScore(record.id, criterion.id, value)}
                        />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </Fragment>
          )
        })}
        {/* Fila de cierre: el % ponderado de cada historia. En la vista embebida tambien sirve,
            pero es en el modo ampliado donde responde la pregunta de las 25 columnas. */}
        <tr className="hcm-total-row">
          <td className="hcm-criterion">% Cumplimiento total por HC</td>
          <td className="hcm-weight" />
          <td className="hcm-pct">
            <b style={{ color: colorForPercent(live.overall) }}>
              {live.overall === null ? '—' : `${live.overall.toFixed(1)}%`}
            </b>
          </td>
          {records.map(record => {
            const percent = live.byRecord.get(record.id) ?? null
            return (
              <td key={record.id} className={activeRecordId === record.id ? 'is-active' : ''}>
                <b style={{ color: colorForPercent(percent) }}>{percent === null ? '—' : `${percent.toFixed(1)}%`}</b>
              </td>
            )
          })}
        </tr>
      </tbody>
    </table>
  )
}
