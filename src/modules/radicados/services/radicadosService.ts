import type {
  CreateRadicadoInput, RadicadoCatalogos, RadicadoDetail, RadicadoFilters, RadicadoListPage, RadicadosAnalytics, RadicadosDashboard,
} from '../types'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/radicados${path}`, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, ...init })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'No fue posible completar la operación')
  return data as T
}

function toQueryString(filters: Record<string, string | undefined>) {
  const query = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value) })
  const suffix = query.toString()
  return suffix ? `?${suffix}` : ''
}

export const radicadosService = {
  catalogos: () => call<RadicadoCatalogos>('/catalogos'),
  createCatalogItem: (catalogo: 'tipos' | 'categorias' | 'medios', data: { nombre: string; codigo?: string }) =>
    call(`/catalogos/${catalogo}`, { method: 'POST', body: JSON.stringify(data) }),
  updateCatalogItem: (catalogo: 'tipos' | 'categorias' | 'medios', id: string, data: { nombre?: string; activo?: boolean }) =>
    call(`/catalogos/${catalogo}/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  list: (filters: RadicadoFilters & { page?: string; pageSize?: string } = {}) =>
    call<RadicadoListPage>(`${toQueryString(filters as Record<string, string | undefined>)}`),
  detail: (id: string) => call<RadicadoDetail>(`/${id}`),
  create: (data: CreateRadicadoInput) => call<RadicadoDetail>('/', { method: 'POST', body: JSON.stringify(data) }),
  anular: (id: string, motivo: string) => call(`/${id}/anular`, { method: 'POST', body: JSON.stringify({ motivo }) }),
  eliminar: (id: string, motivo: string) => call(`/${id}/eliminar`, { method: 'POST', body: JSON.stringify({ motivo }) }),

  uploadAdjunto: async (radicadoId: string, file: File) => {
    const body = new FormData()
    body.append('file', file)
    const response = await fetch(`/api/radicados/${radicadoId}/adjuntos`, { method: 'POST', credentials: 'same-origin', body })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'No fue posible subir el adjunto')
    return data
  },
  adjuntoUrl: (radicadoId: string, adjuntoId: string) => `/api/radicados/${radicadoId}/adjuntos/${adjuntoId}`,

  dashboard: () => call<RadicadosDashboard>('/resumen/dashboard'),
  analytics: () => call<RadicadosAnalytics>('/resumen/analitica'),

  exportPdf: async (filters: RadicadoFilters = {}) => {
    const response = await fetch(`/api/radicados/report.pdf${toQueryString(filters as Record<string, string | undefined>)}`, { credentials: 'same-origin' })
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'No fue posible exportar el informe') }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'radicados.pdf'
    anchor.click()
    URL.revokeObjectURL(url)
  },
}
