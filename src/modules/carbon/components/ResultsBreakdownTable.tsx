import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

/**
 * Replica la tabla jerarquica "Resultados globales" de la herramienta de referencia (Excel Salud
 * sin Dano/GGHH, hoja "Paso 4. Resultados"): mismos codigos, mismo orden, mismas etiquetas de
 * categorias no medidas ("No estimada / Complejo", "No ocurre"...). La diferencia deliberada con
 * el Excel: el total de ESTE modulo (fila "Emisiones totales") suma solo Alcance 1 + Alcance 2 —
 * el Excel de referencia suma tambien Alcance 3 (en este caso, perdidas de T&D electrica), que es
 * justamente la fuente del 195,69 que no se debe reproducir. Las filas de Alcance 3 se muestran
 * igual, colapsadas por defecto, para que quede clara la diferencia y no parezca un dato faltante.
 */
export interface CategoryValues { stationaryTon: number; mobileTon: number; electricityTon: number }

type Row = { code: string; label: string; indent: number; kind: 'total' | 'scope' | 'measured' | 'bucket' | 'excluded' }

const OUT_OF_SCOPE = 'Fuera del alcance de este módulo'

const ROWS: Row[] = [
  { code: '', label: 'Emisiones totales (tCO2e)', indent: 0, kind: 'total' },
  { code: '', label: 'Alcance 1', indent: 0, kind: 'scope' },
  { code: '1.1', label: 'Combustión Estacionaria', indent: 1, kind: 'measured' },
  { code: '1.2', label: 'Combustión móvil', indent: 1, kind: 'measured' },
  { code: '1.3', label: 'Emisiones fugitivas', indent: 1, kind: 'bucket' },
  { code: '1.3.1', label: 'Gases refrigerantes y extintores de incendio', indent: 2, kind: 'excluded' },
  { code: '1.3.2', label: 'Gases medicinales y anestésicos', indent: 2, kind: 'excluded' },
  { code: '1.4', label: 'Residuos', indent: 1, kind: 'bucket' },
  { code: '1.4.1', label: 'Disposición de residuos sólidos asimilables a domiciliarios', indent: 2, kind: 'excluded' },
  { code: '1.4.2', label: 'Compostaje', indent: 2, kind: 'excluded' },
  { code: '1.4.3', label: 'Incineración', indent: 2, kind: 'bucket' },
  { code: '', label: 'Residuos sólidos asimilables a domiciliarios', indent: 3, kind: 'excluded' },
  { code: '', label: 'Mix clínico (residuos con riesgo biológico y peligrosos)', indent: 3, kind: 'excluded' },
  { code: '', label: 'Peligrosos', indent: 3, kind: 'excluded' },
  { code: '', label: 'Alcance 2', indent: 0, kind: 'scope' },
  { code: '2.1', label: 'Compra de energía eléctrica', indent: 1, kind: 'measured' },
  { code: '2.2', label: 'Compra de vapor, calor o refrigeración', indent: 1, kind: 'excluded' },
]

const SCOPE3_ROWS: Row[] = [
  { code: '', label: 'Alcance 3', indent: 0, kind: 'scope' },
  { code: '3.1', label: 'Viajes de trabajo', indent: 1, kind: 'excluded' },
  { code: '3.2', label: 'Traslados de personal', indent: 1, kind: 'excluded' },
  { code: '3.3', label: 'Desplazamiento de pacientes, visitantes u otros', indent: 1, kind: 'excluded' },
  { code: '3.4', label: 'Inhaladores', indent: 1, kind: 'bucket' },
  { code: '3.4.1', label: 'MDI', indent: 2, kind: 'excluded' },
  { code: '3.4.2', label: 'DPI', indent: 2, kind: 'excluded' },
  { code: '3.5', label: 'Pérdidas de transporte y distribución de electricidad', indent: 1, kind: 'excluded' },
  { code: '3.6', label: 'Residuos', indent: 1, kind: 'bucket' },
  { code: '3.6.1', label: 'Disposición de residuos sólidos asimilables a domiciliarios', indent: 2, kind: 'excluded' },
  { code: '3.6.2', label: 'Compostaje', indent: 2, kind: 'excluded' },
  { code: '3.6.3', label: 'Incineración', indent: 2, kind: 'bucket' },
  { code: '', label: 'Residuos sólidos asimilables a domiciliarios', indent: 3, kind: 'excluded' },
  { code: '', label: 'Mix clínico (residuos con riesgo biológico y peligrosos)', indent: 3, kind: 'excluded' },
  { code: '', label: 'Peligrosos', indent: 3, kind: 'excluded' },
  { code: '3.S', label: 'Cadena de suministro adicional', indent: 1, kind: 'excluded' },
]

function fmtTon(value: number) { return value.toLocaleString('es-CO', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) }

export function ResultsBreakdownTable({ values, totalTon }: { values: CategoryValues; totalTon: number }) {
  const [showScope3, setShowScope3] = useState(false)
  const scope1Ton = values.stationaryTon + values.mobileTon
  const scope2Ton = values.electricityTon

  function valueFor(row: Row): { ton: number | null; percent: number | null; note?: string } {
    if (row.kind === 'total') return { ton: totalTon, percent: 100 }
    if (row.label === 'Alcance 1') return { ton: scope1Ton, percent: totalTon ? (scope1Ton / totalTon) * 100 : 0 }
    if (row.label === 'Alcance 2') return { ton: scope2Ton, percent: totalTon ? (scope2Ton / totalTon) * 100 : 0 }
    if (row.label === 'Alcance 3') return { ton: null, percent: null, note: 'No incluido en el total institucional de este módulo' }
    if (row.code === '1.1') return { ton: values.stationaryTon, percent: totalTon ? (values.stationaryTon / totalTon) * 100 : 0 }
    if (row.code === '1.2') return { ton: values.mobileTon, percent: totalTon ? (values.mobileTon / totalTon) * 100 : 0 }
    if (row.code === '2.1') return { ton: values.electricityTon, percent: totalTon ? (values.electricityTon / totalTon) * 100 : 0 }
    if (row.kind === 'bucket') return { ton: null, percent: null, note: '—' }
    return { ton: null, percent: null, note: OUT_OF_SCOPE }
  }

  function renderRow(row: Row, index: number) {
    const { ton, percent, note } = valueFor(row)
    return (
      <tr key={`${row.code}-${row.label}-${index}`} className={`hc2-results-row hc2-results-row-${row.kind}`}>
        <td style={{ paddingLeft: 12 + row.indent * 18 }}>
          {row.code && <span className="hc2-results-code">{row.code}</span>}
          {row.label}
        </td>
        <td className="text-right">{ton != null ? fmtTon(ton) : <span className="hc2-results-note">{note}</span>}</td>
        <td className="text-right">{percent != null ? `${percent.toFixed(1)}%` : '—'}</td>
      </tr>
    )
  }

  return (
    <div className="hc2-results-wrap">
      <table className="hc2-results-table">
        <thead><tr><th>Categoría (GHG Protocol / Salud sin Daño)</th><th className="text-right">tCO2e</th><th className="text-right">%</th></tr></thead>
        <tbody>
          {ROWS.map(renderRow)}
          <tr className="hc2-results-toggle-row">
            <td colSpan={3}>
              <button type="button" className="hc2-results-toggle" onClick={() => setShowScope3(current => !current)}>
                {showScope3 ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                {showScope3 ? 'Ocultar' : 'Ver'} Alcance 3 — no incluido en el total (14,77 tCO2e en la herramienta de referencia)
              </button>
            </td>
          </tr>
          {showScope3 && SCOPE3_ROWS.map((row, index) => renderRow(row, 1000 + index))}
        </tbody>
      </table>
      <p className="hc2-hint" style={{ marginTop: 10 }}>
        Este módulo mide y suma únicamente Combustión estacionaria, Combustión móvil y Energía eléctrica.
        Las demás categorías se muestran para trazabilidad metodológica (igual que en la herramienta de
        referencia), pero nunca se calculan ni se suman al total institucional.
      </p>
    </div>
  )
}
