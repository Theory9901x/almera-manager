import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  periodos: {
    listar:  ()              => ipcRenderer.invoke('periodos:listar'),
    crear:   (data: any)     => ipcRenderer.invoke('periodos:crear', data),
    obtener: (id: number)    => ipcRenderer.invoke('periodos:obtener', id),
    cerrar:  (id: number)    => ipcRenderer.invoke('periodos:cerrar', id),
    stats:   (id: number, usuarioId?: number | null) => ipcRenderer.invoke('periodos:stats', id, usuarioId),
  },

  indicadores: {
    listar:     (pid: number)           => ipcRenderer.invoke('indicadores:listar', pid),
    crear:      (data: any)             => ipcRenderer.invoke('indicadores:crear', data),
    actualizar: (id: number, data: any) => ipcRenderer.invoke('indicadores:actualizar', id, data),
    eliminar:   (id: number)            => ipcRenderer.invoke('indicadores:eliminar', id),
  },

  planes: {
    listar:     (pid: number)           => ipcRenderer.invoke('planes:listar', pid),
    crear:      (data: any)             => ipcRenderer.invoke('planes:crear', data),
    actualizar: (id: number, data: any) => ipcRenderer.invoke('planes:actualizar', id, data),
    eliminar:   (id: number)            => ipcRenderer.invoke('planes:eliminar', id),
  },

  asistencias: {
    listar:              (pid: number)           => ipcRenderer.invoke('asistencias:listar', pid),
    crear:               (data: any)             => ipcRenderer.invoke('asistencias:crear', data),
    actualizar:          (id: number, data: any) => ipcRenderer.invoke('asistencias:actualizar', id, data),
    eliminar:            (id: number)            => ipcRenderer.invoke('asistencias:eliminar', id),
    seleccionarEvidencia:()                      => ipcRenderer.invoke('asistencias:seleccionarEvidencia'),
    abrirEvidencia:      (ruta: string)          => ipcRenderer.invoke('asistencias:abrirEvidencia', ruta),
    adjuntos: {
      listar:   (asistenciaId: number)                       => ipcRenderer.invoke('asistencias:adjuntos:listar', asistenciaId),
      agregar:  (asistenciaId: number, ruta: string, nombre: string) => ipcRenderer.invoke('asistencias:adjuntos:agregar', asistenciaId, ruta, nombre),
      eliminar: (id: number)                                 => ipcRenderer.invoke('asistencias:adjuntos:eliminar', id),
    },
  },

  capacitaciones: {
    listar:          (pid: number)                       => ipcRenderer.invoke('capacitaciones:listar', pid),
    crear:           (data: any)                         => ipcRenderer.invoke('capacitaciones:crear', data),
    actualizarSesion:(id: number, ses: string, val: string) => ipcRenderer.invoke('capacitaciones:actualizarSesion', id, ses, val),
    eliminar:        (id: number)                        => ipcRenderer.invoke('capacitaciones:eliminar', id),
    seleccionarActa: ()                                  => ipcRenderer.invoke('capacitaciones:seleccionarActa'),
    abrirActa:       (ruta: string)                      => ipcRenderer.invoke('capacitaciones:abrirActa', ruta),
  },

  evidencias: {
    listar:      (pid: number)  => ipcRenderer.invoke('evidencias:listar', pid),
    cargar:      (data: any)    => ipcRenderer.invoke('evidencias:cargar', data),
    eliminar:    (id: number)   => ipcRenderer.invoke('evidencias:eliminar', id),
    abrirDialogo:()             => ipcRenderer.invoke('evidencias:abrirDialogo'),
    abrirArchivo:(ruta: string) => ipcRenderer.invoke('evidencias:abrirArchivo', ruta),
  },

  tareas: {
    listar:            (pid: number)               => ipcRenderer.invoke('tareas:listar', pid),
    crear:             (data: any)                 => ipcRenderer.invoke('tareas:crear', data),
    actualizar:        (id: number, data: any)     => ipcRenderer.invoke('tareas:actualizar', id, data),
    toggleCompletar:   (id: number, notas?: string, cierreRuta?: string, cierreNombre?: string)=> ipcRenderer.invoke('tareas:completar', id, notas, cierreRuta, cierreNombre),
    proximas:          ()                          => ipcRenderer.invoke('tareas:proximas'),
    eliminar:          (id: number)                => ipcRenderer.invoke('tareas:eliminar', id),
    seleccionarAdjunto:()                          => ipcRenderer.invoke('tareas:seleccionarAdjunto'),
    abrirAdjunto:      (ruta: string)              => ipcRenderer.invoke('tareas:abrirAdjunto', ruta),
    adjuntos: {
      listar:   (tareaId: number)                       => ipcRenderer.invoke('tareas:adjuntos:listar', tareaId),
      agregar:  (tareaId: number, ruta: string, nombre: string) => ipcRenderer.invoke('tareas:adjuntos:agregar', tareaId, ruta, nombre),
      eliminar: (id: number)                            => ipcRenderer.invoke('tareas:adjuntos:eliminar', id),
    },
  },

  actividades: {
    listar:  (pid: number)  => ipcRenderer.invoke('actividades:listar', pid),
    crear:   (data: any)    => ipcRenderer.invoke('actividades:crear', data),
    eliminar:(id: number)   => ipcRenderer.invoke('actividades:eliminar', id),
  },

  notificaciones: {
    listar:     ()           => ipcRenderer.invoke('notificaciones:listar'),
    marcarLeida:(id: number) => ipcRenderer.invoke('notificaciones:marcarLeida', id),
    limpiar:    ()           => ipcRenderer.invoke('notificaciones:limpiar'),
  },

  informes: {
    generarPDF:  (pid: number) => ipcRenderer.invoke('informes:generarPDF', pid),
    generarExcel:(pid: number) => ipcRenderer.invoke('informes:generarExcel', pid),
    generarWord: (pid: number) => ipcRenderer.invoke('informes:generarWord', pid),
  },

  consulta: {
    generarPDF: (payload: any) => ipcRenderer.invoke('consulta:generarPDF', payload),
  },

  auth: {
    listarUsuarios: ()                                                    => ipcRenderer.invoke('auth:listarUsuarios'),
    login:          (data: { id: number; pin: string })                   => ipcRenderer.invoke('auth:login', data),
    cambiarPin:     (data: { id: number; pinActual: string; pinNuevo: string }) => ipcRenderer.invoke('auth:cambiarPin', data),
  },

  auditorias: {
    listar:              (pid: number)                    => ipcRenderer.invoke('auditorias:listar', pid),
    crear:               (data: any)                      => ipcRenderer.invoke('auditorias:crear', data),
    actualizar:          (id: number, data: any)          => ipcRenderer.invoke('auditorias:actualizar', id, data),
    eliminar:            (id: number)                     => ipcRenderer.invoke('auditorias:eliminar', id),
    seleccionarEvidencia:()                               => ipcRenderer.invoke('auditorias:seleccionarEvidencia'),
    actualizarEvidencia: (id: number, ruta: string, nombre: string) => ipcRenderer.invoke('auditorias:actualizarEvidencia', id, ruta, nombre),
    abrirEvidencia:      (ruta: string)                   => ipcRenderer.invoke('auditorias:abrirEvidencia', ruta),
    adjuntos: {
      listar:   (auditoriaId: number)                       => ipcRenderer.invoke('auditorias:adjuntos:listar', auditoriaId),
      agregar:  (auditoriaId: number, ruta: string, nombre: string) => ipcRenderer.invoke('auditorias:adjuntos:agregar', auditoriaId, ruta, nombre),
      eliminar: (id: number)                                => ipcRenderer.invoke('auditorias:adjuntos:eliminar', id),
    },
    seleccionarAdjunto:  ()                               => ipcRenderer.invoke('auditorias:seleccionarAdjunto'),
    abrirAdjunto:        (ruta: string)                   => ipcRenderer.invoke('auditorias:abrirAdjunto', ruta),
  },
})
