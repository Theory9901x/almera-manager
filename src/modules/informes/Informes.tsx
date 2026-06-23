import { useState } from 'react'
import { useAppStore } from '@/store/appStore'
import { FileText, FileSpreadsheet, Download, FileEdit } from 'lucide-react'

const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function Informes() {
  const { periodoActivo } = useAppStore()
  const [loadingPDF,   setLoadingPDF]   = useState(false)
  const [loadingExcel, setLoadingExcel] = useState(false)
  const [loadingWord,  setLoadingWord]  = useState(false)
  const [mensaje,      setMensaje]      = useState('')

  async function generarPDF() {
    if (!periodoActivo) return
    setLoadingPDF(true); setMensaje('')
    try {
      const res = await window.api.informes.generarPDF(periodoActivo.id)
      setMensaje(res.ok ? `Informe PDF generado: ${res.ruta ?? 'guardado correctamente.'}` : `Error al generar el PDF.${res.error ? ' ' + res.error : ''}`)
    } catch (e: any) { setMensaje(`Error: ${e?.message ?? e}`) }
    setLoadingPDF(false)
  }

  async function generarWord() {
    if (!periodoActivo) return
    setLoadingWord(true); setMensaje('')
    try {
      const res = await window.api.informes.generarWord(periodoActivo.id)
      setMensaje(res.ok ? `Informe Word generado: ${res.ruta ?? 'guardado correctamente.'}` : `Error al generar el Word.${res.error ? ' ' + res.error : ''}`)
    } catch (e: any) { setMensaje(`Error: ${e?.message ?? e}`) }
    setLoadingWord(false)
  }

  async function generarExcel() {
    if (!periodoActivo) return
    setLoadingExcel(true); setMensaje('')
    try {
      const res = await window.api.informes.generarExcel(periodoActivo.id)
      setMensaje(res.ok ? 'Informe Excel generado correctamente.' : 'Error al generar el Excel.')
    } catch { setMensaje('Error al generar el Excel.') }
    setLoadingExcel(false)
  }

  if (!periodoActivo) return (
    <p className="text-slate-400 text-sm">Selecciona un período primero.</p>
  )

  const titulo = `${MESES[periodoActivo.mes]} ${periodoActivo.anio}`

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="card p-5">
        <h2 className="text-base font-semibold text-slate-800 mb-1">Informe de gestión — {titulo}</h2>
        <p className="text-sm text-slate-400">
          Genera el consolidado del período con indicadores, planes de mejora,
          evidencias y actividades registradas.
        </p>
      </div>

      {mensaje && (
        <div className={`px-4 py-3 rounded-lg text-sm border ${
          mensaje.startsWith('Error')
            ? 'bg-red-50 text-red-700 border-red-200'
            : 'bg-green-50 text-green-700 border-green-200'
        }`}>
          {mensaje}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {/* PDF */}
        <div className="card p-6 flex flex-col items-center gap-4 hover:border-red-200 transition-colors">
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
            <FileText size={28} className="text-red-500" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-700">Informe PDF</p>
            <p className="text-xs text-slate-400 mt-0.5">Consolidado listo para presentar</p>
          </div>
          <button onClick={generarPDF} disabled={loadingPDF}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
            {loadingPDF
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generando...</>
              : <><Download size={16} /> Generar PDF</>
            }
          </button>
        </div>

        {/* Word */}
        <div className="card p-6 flex flex-col items-center gap-4 hover:border-blue-200 transition-colors">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
            <FileEdit size={28} className="text-blue-600" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-700">Informe Word</p>
            <p className="text-xs text-slate-400 mt-0.5">Editable: introducción, conclusiones…</p>
          </div>
          <button onClick={generarWord} disabled={loadingWord}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-all disabled:opacity-50">
            {loadingWord
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generando...</>
              : <><Download size={16} /> Generar Word</>
            }
          </button>
        </div>

        {/* Excel */}
        <div className="card p-6 flex flex-col items-center gap-4 hover:border-green-200 transition-colors">
          <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center">
            <FileSpreadsheet size={28} className="text-green-600" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-700">Informe Excel</p>
            <p className="text-xs text-slate-400 mt-0.5">Datos exportados por hoja</p>
          </div>
          <button onClick={generarExcel} disabled={loadingExcel}
            className="btn-secondary w-full flex items-center justify-center gap-2 disabled:opacity-50">
            {loadingExcel
              ? <><div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" /> Generando...</>
              : <><Download size={16} /> Generar Excel</>
            }
          </button>
        </div>
      </div>

      <div className="card p-4 bg-slate-50">
        <p className="text-xs text-slate-500 font-medium mb-2">Los informes incluyen:</p>
        <ul className="text-xs text-slate-500 space-y-1">
          {[
            'PDF y Word: Sección 1 — Asistencias técnicas (módulo Almera, proceso, persona, qué/cómo se hizo, estado)',
            'PDF y Word: Sección 2 — Tareas (prioridad, fecha límite, nota de cierre, estado)',
            'PDF y Word: Sección 3 — Capacitaciones (detalle por sesiones S1, S2, S3)',
            'PDF y Word: Sección 4 — Cumplimiento con tabla resumen y porcentajes de adherencia',
            'Word: secciones editables de Introducción y Conclusiones (placeholders listos para completar)',
            'PDF: encabezado institucional Salud Yopal (GIN-GDO-FO-17) con paginación automática',
            'Excel: datos en bruto exportados por hoja (asistencias, capacitaciones, indicadores)',
          ].map(item => (
            <li key={item} className="flex items-start gap-2">
              <span className="mt-1 w-1 h-1 rounded-full bg-almera-400 flex-shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
