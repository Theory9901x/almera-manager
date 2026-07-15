import * as RadixSelect from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'

export interface SelectOption { value: string; label: string }

// Select estilizado sobre Radix — nunca <select> nativo del navegador en el design system.
export function Select({ value, onChange, options, placeholder = 'Selecciona...', disabled }: {
  value: string
  onChange(value: string): void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <RadixSelect.Root value={value} onValueChange={onChange} disabled={disabled}>
      <RadixSelect.Trigger className="ds-select-trigger" aria-label={placeholder}>
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon><ChevronDown size={14} /></RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content className="ds-select-content" position="popper" sideOffset={4}>
          <RadixSelect.Viewport>
            {options.map(option => (
              <RadixSelect.Item key={option.value} value={option.value} className="ds-select-item">
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className="ds-select-check"><Check size={13} /></RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  )
}
