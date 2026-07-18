import * as echarts from 'echarts/core'
import type { ComposeOption } from 'echarts/core'
import { BarChart as EChartsBarChart, GaugeChart, LineChart as EChartsLineChart } from 'echarts/charts'
import type { BarSeriesOption, GaugeSeriesOption, LineSeriesOption } from 'echarts/charts'
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import type { GridComponentOption, TooltipComponentOption } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import ReactEChartsCore from 'echarts-for-react/esm/core'
import { FONT_FAMILY } from '../tokens'

type ECOption = ComposeOption<BarSeriesOption | LineSeriesOption | GaugeSeriesOption | GridComponentOption | TooltipComponentOption>

// Motor unico de graficos para todo el sistema (reemplaza Recharts y Nivo, que convivian sin
// necesidad). Estos wrappers cargan el tema SGIMR una sola vez — ningun modulo arma su propio
// option de ECharts desde cero, todos consumen estos componentes con props simples.
// Import modular (echarts/core + solo los charts/componentes usados) en vez de 'echarts' completo
// — evita empaquetar mapas, sankey, treemap, etc. que este sistema nunca renderiza.
echarts.use([EChartsBarChart, EChartsLineChart, GaugeChart, GridComponent, TooltipComponent, MarkLineComponent, SVGRenderer])

// ECharts pinta estos colores directo en canvas/SVG via su propio parser interno de color, que
// no entiende custom properties de CSS (var(--x)) — a diferencia del tooltip (un div real, ahi
// si vale CSS). Por eso aqui van valores literales que reflejan los tokens de src/index.css.
const AXIS_LABEL = { color: '#344054', fontFamily: FONT_FAMILY, fontSize: 11 }
const SPLIT_LINE = { lineStyle: { color: '#d6dccd', type: 'dashed' as const } }
const AXIS_LINE_COLOR = '#d6dccd'
const TRACK_COLOR = '#f7f8f4'
const REFERENCE_LINE_COLOR = '#86917e'
const REFERENCE_LABEL_COLOR = '#56624f'

function tooltipStyle() {
  return {
    backgroundColor: 'var(--surface-1, #fff)',
    borderWidth: 0,
    borderRadius: 12,
    padding: [10, 14],
    textStyle: { color: 'var(--ink)', fontFamily: FONT_FAMILY, fontSize: 12.5 },
    extraCssText: 'box-shadow: var(--shadow-card-md, 0 10px 26px rgba(16,24,40,.12)); backdrop-filter: blur(4px);',
  }
}

function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace('#', '')
  const bigint = parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16)
  const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function verticalGradient(color: string, from = 0.95, to = 0.55) {
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: hexToRgba(color, from) },
    { offset: 1, color: hexToRgba(color, to) },
  ])
}

function horizontalGradient(color: string, from = 0.95, to = 0.55) {
  return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
    { offset: 0, color: hexToRgba(color, to) },
    { offset: 1, color: hexToRgba(color, from) },
  ])
}

export interface BarDatum { label: string; value: number | null; color?: string; tooltipLabel?: string }

/** Barras (columnas u horizontales) con degradado por barra — reemplaza Nivo ResponsiveBar y
 * Recharts BarChart. Si un dato no trae color propio, usa `color`/`identity` como degradado base. */
export function BarChart({
  data, orientation = 'vertical', color = '#4F46E5', height = 260, valueFormatter, valueSuffix = '',
}: {
  data: BarDatum[]
  orientation?: 'vertical' | 'horizontal'
  color?: string
  height?: number
  valueFormatter?: (value: number) => string
  valueSuffix?: string
}) {
  const format = valueFormatter || (value => `${value.toLocaleString('es-CO')}${valueSuffix}`)
  const isHorizontal = orientation === 'horizontal'
  const categoryAxis = { type: 'category' as const, data: data.map(item => item.label), axisTick: { show: false }, axisLine: { lineStyle: { color: AXIS_LINE_COLOR } }, axisLabel: { ...AXIS_LABEL, interval: 0, rotate: !isHorizontal && data.length > 5 ? -20 : 0 } }
  const valueAxis = { type: 'value' as const, axisLabel: { ...AXIS_LABEL, formatter: (value: number) => format(value) }, axisLine: { show: false }, axisTick: { show: false }, splitLine: SPLIT_LINE }

  const option: ECOption = {
    textStyle: { fontFamily: FONT_FAMILY },
    grid: { left: isHorizontal ? 110 : 48, right: 16, top: 16, bottom: isHorizontal ? 8 : (data.length > 5 ? 56 : 32), containLabel: true },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' }, ...tooltipStyle(),
      formatter: (params: unknown) => {
        const item = (params as { name: string; value: number; dataIndex: number }[])[0]
        const label = data[item.dataIndex]?.tooltipLabel || item.name
        return `<strong>${label}</strong><br/>${format(item.value)}`
      },
    },
    xAxis: isHorizontal ? valueAxis : categoryAxis,
    yAxis: isHorizontal ? categoryAxis : valueAxis,
    series: [{
      type: 'bar',
      data: data.map(item => ({ value: item.value ?? 0, itemStyle: { color: (isHorizontal ? horizontalGradient : verticalGradient)(item.color || color) } })),
      barMaxWidth: 34,
      itemStyle: { borderRadius: isHorizontal ? [0, 8, 8, 0] : [8, 8, 0, 0] },
      animationDuration: 600,
      animationEasing: 'cubicOut',
    }],
  }

  return <ReactEChartsCore echarts={echarts} option={option} style={{ height, width: '100%' }} opts={{ renderer: 'svg' }} />
}

export interface LinePoint { label: string; value: number | null }

/** Linea con area de relleno opcional y linea de referencia — reemplaza Recharts/Nivo LineChart. */
export function LineChart({
  data, color = '#4F46E5', area = true, height = 260, valueFormatter, valueSuffix = '', referenceLine,
}: {
  data: LinePoint[]
  color?: string
  area?: boolean
  height?: number
  valueFormatter?: (value: number) => string
  valueSuffix?: string
  referenceLine?: { value: number; label: string }
}) {
  const format = valueFormatter || (value => `${value.toLocaleString('es-CO')}${valueSuffix}`)

  const option: ECOption = {
    textStyle: { fontFamily: FONT_FAMILY },
    grid: { left: 48, right: 16, top: referenceLine ? 28 : 16, bottom: 32, containLabel: true },
    tooltip: {
      trigger: 'axis', ...tooltipStyle(),
      formatter: (params: unknown) => {
        const item = (params as { name: string; value: number }[])[0]
        return `<strong>${item.name}</strong><br/>${format(item.value)}`
      },
    },
    xAxis: { type: 'category', data: data.map(point => point.label), boundaryGap: false, axisTick: { show: false }, axisLine: { lineStyle: { color: AXIS_LINE_COLOR } }, axisLabel: AXIS_LABEL },
    yAxis: { type: 'value', axisLabel: { ...AXIS_LABEL, formatter: (value: number) => format(value) }, axisLine: { show: false }, axisTick: { show: false }, splitLine: SPLIT_LINE },
    series: [{
      type: 'line',
      data: data.map(point => point.value),
      smooth: 0.3,
      symbol: 'circle',
      symbolSize: 7,
      lineStyle: { width: 2.5, color },
      itemStyle: { color, borderWidth: 2, borderColor: '#fff' },
      areaStyle: area ? { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: hexToRgba(color, 0.28) }, { offset: 1, color: hexToRgba(color, 0) }]) } : undefined,
      connectNulls: true,
      markLine: referenceLine ? {
        symbol: 'none',
        lineStyle: { color: REFERENCE_LINE_COLOR, type: 'dashed' },
        label: { formatter: referenceLine.label, color: REFERENCE_LABEL_COLOR, fontFamily: FONT_FAMILY, fontSize: 10, position: 'insideEndTop' },
        data: [{ yAxis: referenceLine.value }],
      } : undefined,
      animationDuration: 600,
      animationEasing: 'cubicOut',
    }],
  }

  return <ReactEChartsCore echarts={echarts} option={option} style={{ height, width: '100%' }} opts={{ renderer: 'svg' }} />
}

/** Gauge radial compacto de un solo valor (0-100%) con etiqueta al centro — reemplaza Nivo
 * ResponsiveRadialBar en las tarjetas de alcance/porcentaje individuales. Trazo con degradado
 * (color -> gradientTo) si se da un segundo tono, en vez de un color plano sin vida. */
export function RadialGauge({ percent, color = '#4F46E5', gradientTo, size = 96 }: { percent: number; color?: string; gradientTo?: string; size?: number }) {
  const strokeColor = gradientTo ? new echarts.graphic.LinearGradient(0, 0, 1, 1, [{ offset: 0, color }, { offset: 1, color: gradientTo }]) : color
  const option: ECOption = {
    series: [{
      type: 'gauge',
      startAngle: 90,
      endAngle: -270,
      min: 0,
      max: 100,
      progress: { show: true, width: 10, itemStyle: { color: strokeColor, borderRadius: 10 } },
      axisLine: { lineStyle: { width: 10, color: [[1, TRACK_COLOR]] } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      pointer: { show: false },
      detail: { show: false },
      data: [{ value: percent }],
      animationDuration: 700,
      animationEasing: 'cubicOut',
    }],
  }

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <ReactEChartsCore echarts={echarts} option={option} style={{ height: size, width: size }} opts={{ renderer: 'svg' }} />
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
        <span style={{ fontWeight: 800, fontSize: size * 0.22, color }}>{percent}%</span>
      </div>
    </div>
  )
}
