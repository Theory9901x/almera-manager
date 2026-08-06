import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { Button, Card, Field, Input, Select, ToastProvider, useToast } from '@/design-system'
import { CarbonShell, carbonIdentity } from '../components/CarbonShell'
import { carbonService } from '../services/carbonService'
import type { CarbonProfile } from '../types'

type FormState = {
  vigenciaYear: string; establishmentName: string; department: string; city: string; address: string; startYear: string; establishmentType: string; organizationalBoundary: string
  tempMinC: string; tempMaxC: string; humidityWinterPercent: string; humiditySummerPercent: string
  fulltimeEmployees: string; patientsPerYear: string; avgOccupiedBeds: string; builtAreaM2: string; hoursPerDay: string; currency: string; usdExchangeRate: string
}

function toForm(profile: CarbonProfile | null, fallbackYear: number): FormState {
  return {
    vigenciaYear: String(profile?.vigencia_year ?? fallbackYear), establishmentName: profile?.establishment_name ?? '', department: profile?.department ?? '', city: profile?.city ?? '',
    address: profile?.address ?? '', startYear: profile?.start_year != null ? String(profile.start_year) : '', establishmentType: profile?.establishment_type ?? '',
    organizationalBoundary: profile?.organizational_boundary ?? '', tempMinC: profile?.temp_min_c != null ? String(profile.temp_min_c) : '', tempMaxC: profile?.temp_max_c != null ? String(profile.temp_max_c) : '',
    humidityWinterPercent: profile?.humidity_winter_percent != null ? String(profile.humidity_winter_percent) : '', humiditySummerPercent: profile?.humidity_summer_percent != null ? String(profile.humidity_summer_percent) : '',
    fulltimeEmployees: profile?.fulltime_employees != null ? String(profile.fulltime_employees) : '', patientsPerYear: profile?.patients_per_year != null ? String(profile.patients_per_year) : '',
    avgOccupiedBeds: profile?.avg_occupied_beds != null ? String(profile.avg_occupied_beds) : '', builtAreaM2: profile?.built_area_m2 != null ? String(profile.built_area_m2) : '',
    hoursPerDay: profile?.hours_per_day != null ? String(profile.hours_per_day) : '', currency: profile?.currency ?? 'COP', usdExchangeRate: profile?.usd_exchange_rate != null ? String(profile.usd_exchange_rate) : '',
  }
}

export default function CarbonSettingsPage() {
  return <ToastProvider><CarbonSettingsContent /></ToastProvider>
}

function CarbonSettingsContent() {
  const toast = useToast()
  const now = new Date()
  const [years, setYears] = useState<number[]>([])
  const [year, setYear] = useState(String(now.getUTCFullYear()))
  const [form, setForm] = useState<FormState>(toForm(null, now.getUTCFullYear()))
  const [saving, setSaving] = useState(false)

  async function load(selectedYear: number) {
    const [profile, availableYears] = await Promise.all([carbonService.profile(selectedYear), carbonService.profileYears()])
    setForm(toForm(profile, selectedYear))
    setYears(availableYears)
  }

  useEffect(() => { void load(Number(year)) }, [year])

  function set<K extends keyof FormState>(key: K, value: string) { setForm(current => ({ ...current, [key]: value })) }

  async function save() {
    setSaving(true)
    try {
      await carbonService.saveProfile({
        vigenciaYear: Number(form.vigenciaYear), establishmentName: form.establishmentName, department: form.department, city: form.city, address: form.address,
        startYear: form.startYear ? Number(form.startYear) : null, establishmentType: form.establishmentType, organizationalBoundary: form.organizationalBoundary,
        tempMinC: form.tempMinC ? Number(form.tempMinC) : null, tempMaxC: form.tempMaxC ? Number(form.tempMaxC) : null,
        humidityWinterPercent: form.humidityWinterPercent ? Number(form.humidityWinterPercent) : null, humiditySummerPercent: form.humiditySummerPercent ? Number(form.humiditySummerPercent) : null,
        fulltimeEmployees: form.fulltimeEmployees ? Number(form.fulltimeEmployees) : null, patientsPerYear: form.patientsPerYear ? Number(form.patientsPerYear) : null,
        avgOccupiedBeds: form.avgOccupiedBeds ? Number(form.avgOccupiedBeds) : null, builtAreaM2: form.builtAreaM2 ? Number(form.builtAreaM2) : null,
        hoursPerDay: form.hoursPerDay ? Number(form.hoursPerDay) : null, currency: form.currency, usdExchangeRate: form.usdExchangeRate ? Number(form.usdExchangeRate) : null,
      })
      toast.push('success', 'Perfil institucional guardado')
      void load(Number(form.vigenciaYear))
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible guardar') }
    finally { setSaving(false) }
  }

  const yearOptions = Array.from(new Set([...years, now.getUTCFullYear()])).sort((a, b) => b - a).map(value => ({ value: String(value), label: String(value) }))

  return (
    <CarbonShell title="Configuración del inventario" subtitle="Perfil institucional versionado por año — no se mezcla con los formularios de registro de actividad">
      <Card accent={carbonIdentity.color} className="p-6">
        <Field label="Año de vigencia" className="hc2-form-narrow"><Select value={year} onChange={setYear} options={yearOptions} /></Field>

        <h4 className="hc2-section-title">Datos generales</h4>
        <div className="hc2-form-grid">
          <Field label="Establecimiento"><Input value={form.establishmentName} onChange={event => set('establishmentName', event.target.value)} /></Field>
          <Field label="Departamento"><Input value={form.department} onChange={event => set('department', event.target.value)} /></Field>
          <Field label="Ciudad"><Input value={form.city} onChange={event => set('city', event.target.value)} /></Field>
          <Field label="Dirección"><Input value={form.address} onChange={event => set('address', event.target.value)} /></Field>
          <Field label="En funcionamiento desde el año"><Input type="number" value={form.startYear} onChange={event => set('startYear', event.target.value)} /></Field>
          <Field label="Tipo de establecimiento"><Input value={form.establishmentType} onChange={event => set('establishmentType', event.target.value)} /></Field>
          <div className="hc2-form-full"><Field label="Límite organizacional" hint="Descripción breve de qué edificios/sedes cubre esta huella"><Input value={form.organizationalBoundary} onChange={event => set('organizationalBoundary', event.target.value)} /></Field></div>
        </div>

        <h4 className="hc2-section-title">Información climática</h4>
        <div className="hc2-form-grid">
          <Field label="Temperatura mínima anual (°C)"><Input type="number" step="any" value={form.tempMinC} onChange={event => set('tempMinC', event.target.value)} /></Field>
          <Field label="Temperatura máxima anual (°C)"><Input type="number" step="any" value={form.tempMaxC} onChange={event => set('tempMaxC', event.target.value)} /></Field>
          <Field label="Humedad relativa invierno (%)"><Input type="number" step="any" value={form.humidityWinterPercent} onChange={event => set('humidityWinterPercent', event.target.value)} /></Field>
          <Field label="Humedad relativa verano (%)"><Input type="number" step="any" value={form.humiditySummerPercent} onChange={event => set('humiditySummerPercent', event.target.value)} /></Field>
        </div>

        <h4 className="hc2-section-title">Datos del establecimiento</h4>
        <div className="hc2-form-grid">
          <Field label="Empleados de tiempo completo"><Input type="number" value={form.fulltimeEmployees} onChange={event => set('fulltimeEmployees', event.target.value)} /></Field>
          <Field label="Pacientes atendidos (año)"><Input type="number" value={form.patientsPerYear} onChange={event => set('patientsPerYear', event.target.value)} /></Field>
          <Field label="Promedio de camas ocupadas"><Input type="number" value={form.avgOccupiedBeds} onChange={event => set('avgOccupiedBeds', event.target.value)} /></Field>
          <Field label="Superficie cubierta construida (m²)"><Input type="number" step="any" value={form.builtAreaM2} onChange={event => set('builtAreaM2', event.target.value)} /></Field>
          <Field label="Horario de atención (hs/día)"><Input type="number" step="any" value={form.hoursPerDay} onChange={event => set('hoursPerDay', event.target.value)} /></Field>
        </div>

        <h4 className="hc2-section-title">Información financiera</h4>
        <div className="hc2-form-grid">
          <Field label="Moneda local"><Input value={form.currency} onChange={event => set('currency', event.target.value)} /></Field>
          <Field label="Tasa de conversión USD"><Input type="number" step="any" value={form.usdExchangeRate} onChange={event => set('usdExchangeRate', event.target.value)} /></Field>
        </div>
        <p className="hc2-hint">Los datos climáticos y financieros quedan guardados aquí y solo se usan donde la fórmula realmente los necesita (indicadores de intensidad) — nunca se mezclan con los formularios de registro de combustible o electricidad.</p>

        <div style={{ marginTop: 18 }}>
          <Button identity={carbonIdentity} onClick={() => void save()} disabled={saving}><Save size={15} /> Guardar perfil</Button>
        </div>
      </Card>
    </CarbonShell>
  )
}
