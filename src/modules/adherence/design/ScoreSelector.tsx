import * as Select from '@radix-ui/react-select'
import { motion } from 'framer-motion'
import { Check, ChevronDown, Minus } from 'lucide-react'
import type { Score } from '../types'

const OPTIONS: { value: string; score: Score; label: string }[] = [
  { value: '2', score: 2, label: '2' },
  { value: '1', score: 1, label: '1' },
  { value: '0', score: 0, label: '0' },
  { value: 'NA', score: null, label: 'NA' },
]

// Fondo pastel + texto saturado (estilo tag de Linear/Notion) en vez de boton solido con texto
// blanco — se lee mas rapido en una grilla densa de cientos de celdas porque el color queda como
// contexto de fondo, no como una mancha solida que compite por atencion celda a celda.
const STYLES: Record<string, { bg: string; fg: string; border: string }> = {
  '2': { bg: 'color-mix(in oklch, oklch(0.6 0.15 150) 18%, white)', fg: 'oklch(0.45 0.15 150)', border: 'transparent' },
  '1': { bg: 'color-mix(in oklch, oklch(0.7 0.16 60) 20%, white)', fg: 'oklch(0.5 0.16 55)', border: 'transparent' },
  '0': { bg: 'color-mix(in oklch, var(--danger) 15%, white)', fg: 'var(--danger)', border: 'transparent' },
  NA: { bg: '#f1f3f5', fg: 'var(--ink-soft)', border: 'transparent' },
}

// Puntos del menu desplegable: color solido y saturado, no el pastel de la celda — un punto de
// 9px necesita ser reconocible de un vistazo, el pastel de fondo se ve todo igual de palido a ese tamano.
const DOT_COLOR: Record<string, string> = { '2': '#059669', '1': '#D97706', '0': '#DC2626', NA: '#94A3B8' }

function keyFor(score: Score | undefined) {
  if (score === undefined) return ''
  if (score === null) return 'NA'
  return String(score)
}

export function ScoreSelector({ value, onChange, disabled }: { value: Score | undefined; onChange(score: Score): void; disabled?: boolean }) {
  const key = keyFor(value)
  const style = STYLES[key]

  return (
    <Select.Root
      value={key}
      onValueChange={raw => {
        const option = OPTIONS.find(item => item.value === raw)
        if (option) onChange(option.score)
      }}
      disabled={disabled}
    >
      <Select.Trigger
        className="score-selector-trigger"
        style={style ? { background: style.bg, color: style.fg, borderColor: style.border } : undefined}
        aria-label="Calificación"
      >
        <Select.Value placeholder={<Minus size={12} />}>
          <motion.span key={key} initial={{ scale: 0.6, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.22, ease: 'easeOut' }} style={{ display: 'inline-block' }}>
            {key ? (key === 'NA' ? 'NA' : key) : <Minus size={12} />}
          </motion.span>
        </Select.Value>
        <Select.Icon><ChevronDown size={11} /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="score-selector-content" position="popper" sideOffset={4}>
          <Select.Viewport>
            {OPTIONS.map(option => (
              <Select.Item key={option.value} value={option.value} className="score-selector-item">
                <span className="score-selector-swatch" style={{ background: DOT_COLOR[option.value] }} />
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator className="score-selector-check"><Check size={13} /></Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}
