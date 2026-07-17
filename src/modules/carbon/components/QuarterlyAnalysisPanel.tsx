import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Badge, Button, useToast } from '@/design-system'
import { carbonService } from '../services/carbonService'
import type { CarbonQuarterlyAnalysis } from '../types'

const BLOCK_LABELS: Record<string, string> = {
  stationary_combustion: 'Combustión estacionaria', mobile_combustion: 'Combustión móvil',
  electricity: 'Energía eléctrica comprada', waste: 'Residuos', refrigerants: 'Gases refrigerantes y extintores',
  anesthetic_gases: 'Gases anestésicos y medicinales',
}

export function QuarterlyAnalysisPanel({ canManage, onClose }: { canManage: boolean; onClose(): void }) {
  const toast = useToast()
  const [analyses, setAnalyses] = useState<CarbonQuarterlyAnalysis[] | null>(null)
  const [generating, setGenerating] = useState(false)

  async function load() {
    try { setAnalyses(await carbonService.quarterlyAnalyses()) }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar el análisis') }
  }

  useEffect(() => { void load() }, [])

  async function generate() {
    setGenerating(true)
    try {
      await carbonService.generateQuarterlyAnalysis()
      toast.push('success', 'Análisis trimestral generado')
      void load()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible generar el análisis') }
    finally { setGenerating(false) }
  }

  const latest = analyses?.[0]

  return (
    <div className="carbon-panel-overlay" onClick={onClose}>
      <div className="quarterly-analysis-panel" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between p-5 pb-0">
          <div>
            <p className="ds-eyebrow">Análisis automático</p>
            <h2 className="text-lg font-black">Análisis trimestral</h2>
          </div>
          <button aria-label="Cerrar" className="survey-icon-button" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          {canManage && (
            <Button identity={{ key: 'carbon', color: '#0f5c3f', gradientFrom: '#0f5c3f', gradientTo: '#0ca678' }} disabled={generating} onClick={generate}>
              {generating ? 'Generando...' : 'Generar análisis del trimestre actual'}
            </Button>
          )}

          {!analyses?.length && <p className="mt-4 text-sm text-[var(--muted)]">Aún no se ha generado ningún análisis trimestral.</p>}

          {latest && (
            <div className="mt-4 space-y-4">
              <div className="carbon-kpi-card">
                <p className="carbon-metric-label">{latest.year} — T{latest.quarter}</p>
                <p className="carbon-metric-value" style={{ fontSize: '2rem' }}>{latest.total_kgco2e.toLocaleString('es-CO', { maximumFractionDigits: 1 })}<span className="carbon-metric-unit">kg CO2e</span></p>
                {latest.trend_percent != null && (
                  <span className={`carbon-trend-badge carbon-trend-badge--${latest.trend_percent < 0 ? 'down' : latest.trend_percent > 0 ? 'up' : 'flat'}`}>
                    {Math.abs(latest.trend_percent)}% vs. trimestre anterior
                  </span>
                )}
                {latest.top_block_key && <p className="mt-2 text-sm">Mayor contribución: <strong>{BLOCK_LABELS[latest.top_block_key] || latest.top_block_key}</strong></p>}
              </div>

              {latest.recommendations.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold">Posible plan de mejora</h3>
                  {latest.recommendations.map((rec, index) => (
                    <div key={index} className="recommendation-card">
                      <p className="text-sm">{rec.text}</p>
                      <p className="recommendation-source">{rec.source}</p>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <h3 className="mb-2 text-sm font-bold">Comparación con benchmarks internacionales</h3>
                <p className="mb-2 text-xs text-[var(--muted)]">{latest.benchmark_comparison.caveat}</p>
                <div className="space-y-1">
                  {latest.benchmark_comparison.benchmarks.filter(b => b.value != null).map(benchmark => (
                    <div key={benchmark.metric_key} className="flex items-center justify-between text-sm">
                      <span>{benchmark.label} <Badge tone="neutral">{benchmark.source}</Badge></span>
                      <strong>{benchmark.value} {benchmark.unit}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {analyses && analyses.length > 1 && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-bold">Histórico</h3>
              <div className="space-y-2">
                {analyses.slice(1).map(item => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] p-2 text-sm">
                    <span>{item.year} — T{item.quarter}</span>
                    <strong>{item.total_kgco2e.toLocaleString('es-CO', { maximumFractionDigits: 1 })} kg CO2e</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
