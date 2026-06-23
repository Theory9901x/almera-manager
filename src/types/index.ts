export interface Usuario { id: number; nombre: string; cargo: string }
export interface Auditoria { id: number; periodo_id?: number; usuario_id?: number; subproceso?: string; tipo: string; hallazgo: string; descripcion?: string; como_se_identifico?: string; accion?: string; responsable?: string; fecha: string; fecha_cierre?: string; estado: string; evidencia_ruta?: string; evidencia_nombre?: string; notas?: string; creado_en: string }
export interface AuditoriaAdjunto { id: number; auditoria_id: number; ruta: string; nombre: string; creado_en: string }
export interface TareaAdjunto { id: number; tarea_id: number; ruta: string; nombre: string; creado_en: string }
export interface AsistenciaAdjunto { id: number; asistencia_id: number; ruta: string; nombre: string; creado_en: string }
export interface Periodo { id: number; anio: number; mes: number; estado: string; notas?: string; creado_en: string }
export interface Indicador { id: number; periodo_id: number; codigo?: string; nombre: string; categoria?: string; estado: string; meta?: string; resultado?: string; observaciones?: string }
export interface Asistencia { id: number; periodo_id: number; proceso: string; persona: string; que_se_hizo: string; como_se_hizo?: string; fecha: string; evidencia_ruta?: string; evidencia_nombre?: string; cumplido: number; gestion?: string; creado_en: string }
export interface Capacitacion { id: number; periodo_id: number; titulo: string; descripcion?: string; fecha: string; acta_ruta?: string; acta_nombre?: string; sesion1: string; sesion2: string; sesion3: string }
export interface Tarea { id: number; periodo_id?: number; titulo: string; descripcion?: string; prioridad?: string; fecha_limite?: string; completada: number; completada_en?: string; notas_cierre?: string; adjunto_ruta?: string; adjunto_nombre?: string; creado_en: string }
export interface Notificacion { id: number; titulo: string; cuerpo?: string; tipo: string; leida: number; creado_en: string }
export interface PeriodoStats { asistencias: number; asistencias_cumplidas: number; capacitaciones: number; capacitaciones_completas: number; tareas_total: number; tareas_ok: number; indicadores: number }

declare global {
  interface Window {
    api: {
      periodos: {
        listar(): Promise<Periodo[]>
        crear(d: any): Promise<Periodo>
        obtener(id: number): Promise<Periodo>
        stats(id: number, usuarioId?: number | null): Promise<PeriodoStats>
      }
      indicadores: {
        listar(pid: number): Promise<Indicador[]>
        crear(d: any): Promise<Indicador>
        actualizar(id: number, d: any): Promise<Indicador>
        eliminar(id: number): Promise<any>
      }
      asistencias: {
        listar(pid: number): Promise<Asistencia[]>
        crear(d: any): Promise<Asistencia>
        actualizar(id: number, d: any): Promise<Asistencia>
        eliminar(id: number): Promise<any>
        seleccionarEvidencia(): Promise<Array<{ ruta: string; nombre: string }>>
        abrirEvidencia(ruta: string): Promise<any>
        adjuntos: {
          listar(asistenciaId: number): Promise<AsistenciaAdjunto[]>
          agregar(asistenciaId: number, ruta: string, nombre: string): Promise<AsistenciaAdjunto>
          eliminar(id: number): Promise<any>
        }
      }
      capacitaciones: {
        listar(pid: number): Promise<Capacitacion[]>
        crear(d: any): Promise<Capacitacion>
        actualizarSesion(id: number, sesion: string, valor: string): Promise<Capacitacion>
        eliminar(id: number): Promise<any>
        seleccionarActa(): Promise<{ ruta: string; nombre: string } | null>
        abrirActa(ruta: string): Promise<any>
      }
      tareas: {
        listar(pid?: number): Promise<Tarea[]>
        crear(d: any): Promise<Tarea>
        actualizar(id: number, d: any): Promise<Tarea>
        toggleCompletar(id: number, notas?: string, cierreRuta?: string, cierreNombre?: string): Promise<Tarea>
        proximas(): Promise<Tarea[]>
        eliminar(id: number): Promise<any>
        seleccionarAdjunto(): Promise<Array<{ ruta: string; nombre: string }>>
        abrirAdjunto(ruta: string): Promise<any>
        adjuntos: {
          listar(tareaId: number): Promise<TareaAdjunto[]>
          agregar(tareaId: number, ruta: string, nombre: string): Promise<TareaAdjunto>
          eliminar(id: number): Promise<any>
        }
      }
      notificaciones: {
        listar(): Promise<Notificacion[]>
        marcarLeida(id: number): Promise<any>
        limpiar(): Promise<any>
      }
      informes: {
        generarPDF(pid: number): Promise<{ ok: boolean; ruta?: string; error?: string }>
        generarExcel(pid: number): Promise<{ ok: boolean; ruta?: string }>
        generarWord(pid: number): Promise<{ ok: boolean; ruta?: string; error?: string }>
      }
      consulta: {
        generarPDF(payload: any): Promise<{ ok: boolean; ruta?: string; error?: string }>
      }
      auth: {
        listarUsuarios(): Promise<Usuario[]>
        login(data: { id: number; pin: string }): Promise<Usuario | null>
        cambiarPin(data: { id: number; pinActual: string; pinNuevo: string }): Promise<{ ok: boolean; error?: string }>
      }
      auditorias: {
        listar(pid: number): Promise<Auditoria[]>
        crear(d: any): Promise<Auditoria>
        actualizar(id: number, d: any): Promise<Auditoria>
        eliminar(id: number): Promise<any>
        seleccionarEvidencia(): Promise<{ ruta: string; nombre: string } | null>
        actualizarEvidencia(id: number, ruta: string, nombre: string): Promise<Auditoria>
        abrirEvidencia(ruta: string): Promise<any>
        adjuntos: {
          listar(auditoriaId: number): Promise<AuditoriaAdjunto[]>
          agregar(auditoriaId: number, ruta: string, nombre: string): Promise<AuditoriaAdjunto>
          eliminar(id: number): Promise<any>
        }
        seleccionarAdjunto(): Promise<Array<{ ruta: string; nombre: string }>>
        abrirAdjunto(ruta: string): Promise<any>
      }
    }
  }
}
