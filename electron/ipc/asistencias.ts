import { ipcMain, dialog, shell } from 'electron'
import { basename } from 'path'
import { getDb } from '../../db/database'

export function registerAsistenciasHandlers() {
  const db = getDb()

  ipcMain.handle('asistencias:listar', (_, periodo_id: number) => {
    return db.prepare('SELECT * FROM asistencias WHERE periodo_id = ? ORDER BY fecha DESC').all(periodo_id)
  })

  ipcMain.handle('asistencias:crear', (_, data) => {
    const result = db.prepare(`
      INSERT INTO asistencias (periodo_id, proceso, persona, que_se_hizo, como_se_hizo, fecha, evidencia_ruta, evidencia_nombre, cumplido, gestion)
      VALUES (@periodo_id, @proceso, @persona, @que_se_hizo, @como_se_hizo, @fecha, @evidencia_ruta, @evidencia_nombre, @cumplido, @gestion)
    `).run(data)
    return db.prepare('SELECT * FROM asistencias WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('asistencias:actualizar', (_, id: number, data) => {
    db.prepare(`
      UPDATE asistencias SET
        proceso = @proceso, persona = @persona, que_se_hizo = @que_se_hizo,
        como_se_hizo = @como_se_hizo, fecha = @fecha,
        evidencia_ruta = @evidencia_ruta, evidencia_nombre = @evidencia_nombre,
        cumplido = @cumplido, gestion = @gestion
      WHERE id = ${id}
    `).run(data)
    return db.prepare('SELECT * FROM asistencias WHERE id = ?').get(id)
  })

  ipcMain.handle('asistencias:eliminar', (_, id: number) => {
    db.prepare('DELETE FROM asistencias WHERE id = ?').run(id)
    return { ok: true }
  })

  ipcMain.handle('asistencias:seleccionarEvidencia', async (event) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
      title: 'Seleccionar evidencias',
      buttonLabel: 'Seleccionar',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Archivos', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'xlsx', 'docx'] }]
    })
    if (canceled || filePaths.length === 0) return []
    return filePaths.map(ruta => ({ ruta, nombre: basename(ruta) }))
  })

  ipcMain.handle('asistencias:abrirEvidencia', async (_, ruta: string) => {
    await shell.openPath(ruta)
    return { ok: true }
  })

  ipcMain.handle('asistencias:adjuntos:listar', (_, asistenciaId: number) => {
    return db.prepare('SELECT * FROM asistencias_adjuntos WHERE asistencia_id = ? ORDER BY creado_en ASC').all(asistenciaId)
  })

  ipcMain.handle('asistencias:adjuntos:agregar', (_, asistenciaId: number, ruta: string, nombre: string) => {
    const r = db.prepare('INSERT INTO asistencias_adjuntos (asistencia_id, ruta, nombre) VALUES (?, ?, ?)').run(asistenciaId, ruta, nombre)
    return db.prepare('SELECT * FROM asistencias_adjuntos WHERE id = ?').get(r.lastInsertRowid)
  })

  ipcMain.handle('asistencias:adjuntos:eliminar', (_, id: number) => {
    db.prepare('DELETE FROM asistencias_adjuntos WHERE id = ?').run(id)
    return { ok: true }
  })
}
