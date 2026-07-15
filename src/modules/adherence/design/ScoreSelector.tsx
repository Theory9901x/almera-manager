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

const STYLES: Record<string, { bg: string; fg: string; border: string }> = {
  '2': { bg: '#059669', fg: '#ffffff', border: '#059669' },
  '1': { bg: '#D97706', fg: '#ffffff', border: '#D97706' },
  '0': { bg: '#DC2626', fg: '#ffffff', border: '#DC2626' },
  NA: { bg: '#E2E8F0', fg: '#64748B', border: '#CBD5E1' },
}

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
            {OPTIONS.map(option => {
              const optionStyle = STYLES[option.value]
              return (
                <Select.Item key={option.value} value={option.value} className="score-selector-item">
                  <span className="score-selector-swatch" style={{ background: optionStyle.bg }} />
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className="score-selector-check"><Check size={13} /></Select.ItemIndicator>
                </Select.Item>
              )
            })}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}
