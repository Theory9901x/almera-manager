import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("api", {
  // ── Períodos ────────────────────────────────────────────
  periodos: {
    listar: () => ipcRenderer.invoke("periodos:listar"),
    crear: (data) => ipcRenderer.invoke("periodos:crear", data),
    obtener: (id) => ipcRenderer.invoke("periodos:obtener", id),
    cerrar: (id) => ipcRenderer.invoke("periodos:cerrar", id)
  },
  // ── Indicadores ─────────────────────────────────────────
  indicadores: {
    listar: (periodo_id) => ipcRenderer.invoke("indicadores:listar", periodo_id),
    crear: (data) => ipcRenderer.invoke("indicadores:crear", data),
    actualizar: (id, data) => ipcRenderer.invoke("indicadores:actualizar", id, data),
    eliminar: (id) => ipcRenderer.invoke("indicadores:eliminar", id)
  },
  // ── Planes de mejora ────────────────────────────────────
  planes: {
    listar: (periodo_id) => ipcRenderer.invoke("planes:listar", periodo_id),
    crear: (data) => ipcRenderer.invoke("planes:crear", data),
    actualizar: (id, data) => ipcRenderer.invoke("planes:actualizar", id, data),
    eliminar: (id) => ipcRenderer.invoke("planes:eliminar", id)
  },
  // ── Evidencias ──────────────────────────────────────────
  evidencias: {
    listar: (periodo_id) => ipcRenderer.invoke("evidencias:listar", periodo_id),
    cargar: (data) => ipcRenderer.invoke("evidencias:cargar", data),
    eliminar: (id) => ipcRenderer.invoke("evidencias:eliminar", id),
    abrirDialogo: () => ipcRenderer.invoke("evidencias:abrirDialogo"),
    abrirArchivo: (ruta) => ipcRenderer.invoke("evidencias:abrirArchivo", ruta)
  },
  // ── Tareas ──────────────────────────────────────────────
  tareas: {
    listar: (periodo_id) => ipcRenderer.invoke("tareas:listar", periodo_id),
    crear: (data) => ipcRenderer.invoke("tareas:crear", data),
    actualizar: (id, data) => ipcRenderer.invoke("tareas:actualizar", id, data),
    eliminar: (id) => ipcRenderer.invoke("tareas:eliminar", id),
    completar: (id) => ipcRenderer.invoke("tareas:completar", id)
  },
  // ── Actividades ─────────────────────────────────────────
  actividades: {
    listar: (periodo_id) => ipcRenderer.invoke("actividades:listar", periodo_id),
    crear: (data) => ipcRenderer.invoke("actividades:crear", data),
    eliminar: (id) => ipcRenderer.invoke("actividades:eliminar", id)
  },
  // ── Notificaciones ──────────────────────────────────────
  notificaciones: {
    listar: () => ipcRenderer.invoke("notificaciones:listar"),
    marcarLeida: (id) => ipcRenderer.invoke("notificaciones:marcarLeida", id),
    limpiar: () => ipcRenderer.invoke("notificaciones:limpiar")
  },
  // ── Informes ────────────────────────────────────────────
  informes: {
    generarPDF: (periodo_id) => ipcRenderer.invoke("informes:generarPDF", periodo_id),
    generarExcel: (periodo_id) => ipcRenderer.invoke("informes:generarExcel", periodo_id)
  }
});
