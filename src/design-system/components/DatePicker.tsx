import { useState } from 'react'
import * as RadixPopover from '@radix-ui/react-popover'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'

const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const MONTH_LABELS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function parseIso(value: string): Date | null {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDisplay(date: Date): string {
  return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
}

function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7 // semana empieza en lunes
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < startOffset; i += 1) cells.push(null)
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day))
  return cells
}

// Reemplaza <input type="date"> nativo en todo el sistema: mismo trigger visual que .ds-input,
// calendario desplegable con estilo propio (Radix Popover, sin depender del widget del SO/navegador).
// value/onChange siguen usando el mismo formato ISO 'YYYY-MM-DD' que el input nativo, por lo que es
// un reemplazo directo sin tocar la logica de los formularios que ya lo consumen.
export function DatePicker({ value, onChange, min, max, disabled, placeholder = 'Selecciona una fecha' }: {
  value: string
  onChange(value: string): void
  min?: string
  max?: string
  disabled?: boolean
  placeholder?: string
}) {
  const selected = parseIso(value)
  const today = new Date()
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState((selected || today).getFullYear())
  const [viewMonth, setViewMonth] = useState((selected || today).getMonth())

  const minDate = min ? parseIso(min) : null
  const maxDate = max ? parseIso(max) : null

  function isDisabled(date: Date) {
    if (minDate && date < minDate) return true
    if (maxDate && date > maxDate) return true
    return false
  }

  function pick(date: Date) {
    if (isDisabled(date)) return
    onChange(toIso(date))
    setOpen(false)
  }

  function shiftMonth(delta: number) {
    let nextMonth = viewMonth + delta
    let nextYear = viewYear
    if (nextMonth < 0) { nextMonth = 11; nextYear -= 1 }
    if (nextMonth > 11) { nextMonth = 0; nextYear += 1 }
    setViewMonth(nextMonth)
    setViewYear(nextYear)
  }

  function openChange(next: boolean) {
    if (next) { const base = selected || today; setViewYear(base.getFullYear()); setViewMonth(base.getMonth()) }
    setOpen(next)
  }

  return (
    <RadixPopover.Root open={open} onOpenChange={openChange}>
      <RadixPopover.Trigger asChild>
        <button type="button" disabled={disabled} className="ds-datepicker-trigger">
          <CalendarIcon size={15} />
          <span className={selected ? '' : 'ds-datepicker-placeholder'}>{selected ? formatDisplay(selected) : placeholder}</span>
        </button>
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content className="ds-datepicker-content" sideOffset={6} align="start">
          <div className="ds-datepicker-header">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="Mes anterior"><ChevronLeft size={16} /></button>
            <strong>{MONTH_LABELS[viewMonth]} {viewYear}</strong>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="Mes siguiente"><ChevronRight size={16} /></button>
          </div>
          <div className="ds-datepicker-weekdays">{WEEKDAY_LABELS.map(label => <span key={label}>{label}</span>)}</div>
          <div className="ds-datepicker-grid">
            {buildMonthGrid(viewYear, viewMonth).map((date, index) => {
              if (!date) return <span key={index} />
              const isSelected = Boolean(selected && toIso(selected) === toIso(date))
              const isToday = toIso(today) === toIso(date)
              return (
                <button
                  key={index} type="button" disabled={isDisabled(date)}
                  className={`ds-datepicker-day ${isSelected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''}`}
                  onClick={() => pick(date)}
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  )
}
