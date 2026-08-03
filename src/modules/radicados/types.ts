export type RadicadoDireccion = 'RECIBIDO' | 'ENVIADO'
export type RadicadoEstado = 'ACTIVO' | 'ANULADO'

export interface RadicadoCatalogItem {
  id: string
  nombre: string
  codigo?: string
  activo: boolean
}

export interface RadicadoProceso { id: string; code: string; name: string }

export interface RadicadoCatalogos {
  tipos: RadicadoCatalogItem[]
  categorias: RadicadoCatalogItem[]
  medios: RadicadoCatalogItem[]
  procesos: RadicadoProceso[]
}

export interface RadicadoRow {
  id: string
  numero_radicado: string
  tipo_id: string
  tipo_nombre: string
  tipo_codigo: string
  direccion: RadicadoDireccion | null
  categoria_id: string
  categoria_nombre: string
  medio_id: string
  medio_nombre: string
  process_id: string | null
  process_name: string | null
  process_code: string | null
  objeto: string
  remitente: string
  destinatario: string
  anio: number
  consecutivo: number
  fecha_radicado: string
  fecha_documento: string | null
  estado: RadicadoEstado
  created_by_id: string
  created_by_name: string
  adjuntos_count: number
}

export interface RadicadoAdjunto {
  id: string
  original_name: string
  mime_type: string
  size_bytes: number
  created_at: string
  uploaded_by_name: string
}

export interface RadicadoAuditoriaEntry {
  id: string
  accion: 'CREADO' | 'ANULADO' | 'ADJUNTO_SUBIDO'
  detalle: string
  created_at: string
  actor_name: string
}

export interface RadicadoDetail extends RadicadoRow {
  adjuntos: RadicadoAdjunto[]
  auditoria: RadicadoAuditoriaEntry[]
  anulacion: { motivo: string; anulado_at: string; anulado_by_name: string } | null
}

export interface RadicadoListPage {
  rows: RadicadoRow[]
  total: number
  page: number
  pageSize: number
  pages: number
}

export interface RadicadoFilters {
  tipoId?: string
  categoriaId?: string
  medioId?: string
  processId?: string
  direccion?: RadicadoDireccion
  estado?: RadicadoEstado
  dateFrom?: string
  dateTo?: string
  search?: string
}

export interface CreateRadicadoInput {
  tipoId: string
  direccion?: RadicadoDireccion
  categoriaId: string
  medioId: string
  processId?: string
  objeto: string
  remitente?: string
  destinatario?: string
  fechaDocumento?: string
}

export interface RadicadosDashboard {
  kpis: {
    hoy: number
    recibidos_hoy: number
    enviados_hoy: number
    ayer: number
    mes: number
    mes_anterior: number
    anulados_mes: number
    anulados_mes_anterior: number
    pendientes_adjunto: number
  }
  mix: { recibidos: number; enviados: number; internos: number; total: number }
  recentVoided: { id: string; numero_radicado: string; categoria_nombre: string; motivo: string; anulado_at: string }[]
}
