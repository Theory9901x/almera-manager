import { FaceRatingCard } from './FaceRatingCard'
import type { SurveyOption } from '../types'

export function FaceRatingControl({ options, value, onChange, disabled }: {
  options: SurveyOption[]
  value: string | null
  onChange(optionId: string): void
  disabled?: boolean
}) {
  return (
    <div className="survey-face-rating">
      {options.map((option, index) => (
        <FaceRatingCard
          key={option.id} option={option} index={index}
          selected={value === option.id} dimmed={Boolean(value) && value !== option.id}
          disabled={disabled} onClick={() => onChange(option.id)}
        />
      ))}
    </div>
  )
}
