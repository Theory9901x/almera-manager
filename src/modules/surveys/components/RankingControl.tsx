import { useEffect, useState } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { GripVertical } from 'lucide-react'
import type { SurveyOption } from '../types'

// Ordenar por preferencia: usa Reorder de framer-motion (ya es dependencia del proyecto), que anima
// el desplazamiento de los demas elementos en vez de saltos (seccion 10.3).
export function RankingControl({ options, order, onChange, color, disabled }: {
  options: SurveyOption[]
  order: string[]
  onChange(order: string[]): void
  color: string
  disabled?: boolean
}) {
  const [items, setItems] = useState<SurveyOption[]>(() => sortByOrder(options, order))

  useEffect(() => { setItems(sortByOrder(options, order)) }, [options])

  function sortByOrder(list: SurveyOption[], ids: string[]) {
    if (!ids.length) return list
    const byId = new Map(list.map(option => [option.id, option]))
    const ordered = ids.map(id => byId.get(id)).filter(Boolean) as SurveyOption[]
    const missing = list.filter(option => !ids.includes(option.id))
    return [...ordered, ...missing]
  }

  function handleReorder(next: SurveyOption[]) {
    setItems(next)
    onChange(next.map(option => option.id))
  }

  return (
    <Reorder.Group axis="y" values={items} onReorder={handleReorder} className="survey-ranking-list" as="div">
      {items.map((option, index) => (
        <RankingRow key={option.id} option={option} index={index} color={color} disabled={disabled} />
      ))}
    </Reorder.Group>
  )
}

function RankingRow({ option, index, color, disabled }: { option: SurveyOption; index: number; color: string; disabled?: boolean }) {
  const controls = useDragControls()
  return (
    <Reorder.Item value={option} dragListener={false} dragControls={controls} className="survey-ranking-row">
      <span className="survey-ranking-index" style={{ background: color }}>{index + 1}</span>
      <span className="survey-ranking-label">{option.label}</span>
      <span
        className="survey-ranking-handle"
        onPointerDown={event => !disabled && controls.start(event)}
        style={{ touchAction: 'none', cursor: disabled ? 'not-allowed' : 'grab' }}
      >
        <GripVertical size={16} />
      </span>
    </Reorder.Item>
  )
}
