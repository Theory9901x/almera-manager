import { useEffect, useState } from 'react'
import { useAppStore } from '@/store/appStore'
import type { Evidencia, Indicador } from '@/types'
import { Upload, Trash2, ExternalLink, FolderOpen } from 'lucide-react'

const TIPO_COLOR: Record<string, string> = {
  pdf:  'bg-red-50 text-red-700',
  xlsx: 'bg-green-50 text-green-700',
  img:  'bg-blue-50 text-blue-700',
  otro: 'bg-slate-100 text-slate-600',
}

export default function Evidencias() {
  const { periodoActivo } = useAppStore()
  const [items,       setItems]       = useState<Evidencia[]>([])
  const [indicadores, setIndicadores] = useState<Indicador[]>([])
  const [selIndicador, setSelIndicador] = useState<number | ''>('')
  const [descripcion,  setDescripcion]  = useState('')
  const [loading,     setLoading]     = useState(false)
  const [dragging,    setDragging]    = useState(false)

  async function cargar() {
    if (!periodoActivo) return
    const [ev, ind] = await Promise.all([
      window.api.evidencias.listar(periodoActivo.id),
      window.api.indicadores.listar(periodoActivo.id),
    ])
    setItems(ev); setIndicadores(ind)
  }

  useEffect(() => { cargar() }, [periodoActivo])

  async function subirArchivos(rutas: string[]) {
    if (!periodoActivo || rutas.length === 0) return
    setLoading(true)
    await window.api.evidencias.cargar({
      rutas,
      periodo_id:   periodoActivo.id,
      indicador_id: selIndicador || undefined,
      descripcion:  descripcion || undefined,
    })
    setDescripcion(''); setLoading(false); cargar()
  }

  async function seleccionarArchivos() {
    const rutas = await window.api.evidencias.abrirDialogo()
    await subirArchivos(rutas)
  }

  async function eliminar(id: number) {
    if (!confirm('¿Eliminar esta evidencia?')) return
    await window.api.evidencias.eliminar(id); cargar()
  }

  // Drag & Drop sobre el área
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const rutas = Array.from(e.dataTransfer.files).map((f: any) => f.path)
    subirArchivos(rutas)
  }

  if (!periodoActivo) return (
    <p className="text-slate-400 text-sm">Selecciona un período primero.</p>
  )

  return (
    <div className="space-y-5">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 transition-colors cursor-pointer ${
          dragging
            ? 'border-almera-400 bg-almera-50'
            : 'border-slate-200 hover:border-almera-300 hover:bg-slate-50'
        }`}
        onClick={seleccionarArchivos}
      >
        <div className="w-12 h-12 rounded-full bg-almera-50 flex items-center justify-center">
          <Upload size={22} className="text-almera-500" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-700">
            {loading ? 'Subiendo archivos...' : 'Arrastra archivos aquí o haz clic para seleccionar'}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">PDF, Excel, Word, imágenes y más</p>
        </div>
      </div>

      {/* Opciones de carga */}
      <div className="card p-4 grid grid-cols-2 gap-3">
        <div>
          <label className="label">Indicador relacionado (opcional)</label>
          <select className="input" value={selIndicador}
            onChange={e => setSelIndicador(Number(e.target.value) || '')}>
            <option value="">— Sin indicador —</option>
            {indicadores.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Descripción (opcional)</label>
          <input className="input" placeholder="Ej: Acta reunión comité" value={descripcion}
            onChange={e => setDescripcion(e.target.value)} />
        </div>
      </div>

      {/* Lista de evidencias */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <FolderOpen size={16} className="text-almera-500" />
            Evidencias del período
          </h3>
          <span className="text-xs text-slate-400">{items.length} archivos</span>
        </div>

        {items.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-8">Sin evidencias. Carga tu primera evidencia arriba.</p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {items.map(item => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                <span className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold uppercase ${TIPO_COLOR[item.tipo] ?? 'bg-slate-100 text-slate-600'}`}>
                  {item.tipo}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{item.nombre_archivo}</p>
                  <p className="text-xs text-slate-400">
                    {item.fecha_carga?.split('T')[0]}
                    {item.indicador_nombre && ` · ${item.indicador_nombre}`}
                    {item.descripcion && ` · ${item.descripcion}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => window.api.evidencias.abrirArchivo(item.ruta)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-almera-600 transition-colors"
                    title="Abrir archivo"
                  >
                    <ExternalLink size={14} />
                  </button>
                  <button
                    onClick={() => eliminar(item.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
