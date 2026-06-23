import { ipcMain, dialog, shell } from 'electron'
import { basename } from 'path'
import { getDb } from '../../db/database'

export function registerTareasHandlers() {
  const db = getDb()

  ipcMain.handle('tareas:listar', (_, periodo_id?: number) => {
    const query = periodo_id
      ? 'SELECT * FROM tareas WHERE periodo_id = ? ORDER BY prioridad DESC, fecha_limite ASC'
      : 'SELECT * FROM tareas WHERE estado != \'completada\' ORDER BY prioridad DESC, fecha_limite ASC'
    return db.prepare(query).all(periodo_id ?? [])
  })

  ipcMain.handle('tareas:crear', (_, data) => {
    const stmt = db.prepare(`
      INSERT INTO tareas (periodo_id, titulo, descripcion, prioridad, fecha_limite, adjunto_ruta, adjunto_nombre, usuario_id, subproceso)
      VALUES (@periodo_id, @titulo, @descripcion, @prioridad, @fecha_limite, @adjunto_ruta, @adjunto_nombre, @usuario_id, @subproceso)
    `)
    const result = stmt.run({ usuario_id: null, subproceso: null, ...data })
    return db.prepare('SELECT * FROM tareas WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('tareas:actualizar', (_, id: number, data) => {
    db.prepare(`
      UPDATE tareas SET
        titulo = @titulo, descripcion = @descripcion,
        prioridad = @prioridad, fecha_limite = @fecha_limite,
        adjunto_ruta = @adjunto_ruta, adjunto_nombre = @adjunto_nombre,
        subproceso = @subproceso
      WHERE id = ${id}
    `).run({ subproceso: null, ...data })
    return db.prepare('SELECT * FROM tareas WHERE id = ?').get(id)
  })

  ipcMain.handle('tareas:seleccionarAdjunto', async (event) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
      title: 'Seleccionar adjuntos',
      buttonLabel: 'Adjuntar',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Archivos', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'xlsx', 'docx', 'txt'] }],
    })
    if (canceled || filePaths.length === 0) return []
    return filePaths.map(ruta => ({ ruta, nombre: basename(ruta) }))
  })

  ipcMain.handle('tareas:abrirAdjunto', async (_, ruta: string) => {
    await shell.openPath(ruta)
    return { ok: true }
  })

  ipcMain.handle('tareas:adjuntos:listar', (_, tareaId: number) => {
    return db.prepare('SELECT * FROM tareas_adjuntos WHERE tarea_id = ? ORDER BY creado_en ASC').all(tareaId)
  })

  ipcMain.handle('tareas:adjuntos:agregar', (_, tareaId: number, ruta: string, nombre: string) => {
    const r = db.prepare('INSERT INTO tareas_adjuntos (tarea_id, ruta, nombre) VALUES (?, ?, ?)').run(tareaId, ruta, nombre)
    return db.prepare('SELECT * FROM tareas_adjuntos WHERE id = ?').get(r.lastInsertRowid)
  })

  ipcMain.handle('tareas:adjuntos:eliminar', (_, id: number) => {
    db.prepare('DELETE FROM tareas_adjuntos WHERE id = ?').run(id)
    return { ok: true }
  })

  ipcMain.handle('tareas:completar', (_, id: number, notas_cierre?: string, cierre_adjunto_ruta?: string, cierre_adjunto_nombre?: string) => {
    db.prepare(`UPDATE tareas SET estado = 'completada', completada_en = datetime('now'), notas_cierre = ?, cierre_adjunto_ruta = ?, cierre_adjunto_nombre = ? WHERE id = ?`)
      .run(notas_cierre ?? null, cierre_adjunto_ruta ?? null, cierre_adjunto_nombre ?? null, id)
    return db.prepare('SELECT * FROM tareas WHERE id = ?').get(id)
  })

  ipcMain.handle('tareas:proximas', () => {
    const hoy = new Date().toISOString().split('T')[0]
    const en7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
    return db.prepare(`SELECT * FROM tareas WHERE fecha_limite IS NOT NULL AND fecha_limite >= ? AND fecha_limite <= ? AND estado != 'completada' ORDER BY fecha_limite ASC`).all(hoy, en7)
  })

  ipcMain.handle('tareas:eliminar', (_, id: number) => {
    db.prepare('DELETE FROM tareas WHERE id = ?').run(id)
    return { ok: true }
  })
}
