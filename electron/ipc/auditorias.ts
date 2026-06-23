import { ipcMain, dialog, shell } from 'electron'
import { getDb } from '../../db/database'

export function registerAuditoriasHandlers() {
  ipcMain.handle('auditorias:listar', (_, pid: number) => {
    const db = getDb()
    return db.prepare('SELECT * FROM auditorias WHERE periodo_id = ? ORDER BY creado_en DESC').all(pid)
  })

  ipcMain.handle('auditorias:crear', (_, data: any) => {
    const db = getDb()
    const stmt = db.prepare(`
      INSERT INTO auditorias
        (periodo_id, usuario_id, subproceso, tipo, hallazgo, descripcion,
         como_se_identifico, accion, responsable, fecha, fecha_cierre, estado, notas)
      VALUES
        (@periodo_id, @usuario_id, @subproceso, @tipo, @hallazgo, @descripcion,
         @como_se_identifico, @accion, @responsable, @fecha, @fecha_cierre, @estado, @notas)
    `)
    const result = stmt.run(data)
    return db.prepare('SELECT * FROM auditorias WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('auditorias:actualizar', (_, id: number, data: any) => {
    const db = getDb()
    db.prepare(`
      UPDATE auditorias SET
        subproceso = @subproceso, tipo = @tipo, hallazgo = @hallazgo,
        descripcion = @descripcion, como_se_identifico = @como_se_identifico,
        accion = @accion, responsable = @responsable, fecha = @fecha,
        fecha_cierre = @fecha_cierre, estado = @estado, notas = @notas
      WHERE id = @id
    `).run({ ...data, id })
    return db.prepare('SELECT * FROM auditorias WHERE id = ?').get(id)
  })

  ipcMain.handle('auditorias:eliminar', (_, id: number) => {
    const db = getDb()
    db.prepare('DELETE FROM auditorias WHERE id = ?').run(id)
    return { ok: true }
  })

  // ─── Adjuntos (múltiples archivos por auditoría) ────────────────────────────

  ipcMain.handle('auditorias:adjuntos:listar', (_, auditoriaId: number) => {
    const db = getDb()
    return db.prepare('SELECT * FROM auditorias_adjuntos WHERE auditoria_id = ? ORDER BY creado_en ASC').all(auditoriaId)
  })

  ipcMain.handle('auditorias:adjuntos:agregar', (_, auditoriaId: number, ruta: string, nombre: string) => {
    const db = getDb()
    const r = db.prepare('INSERT INTO auditorias_adjuntos (auditoria_id, ruta, nombre) VALUES (?, ?, ?)').run(auditoriaId, ruta, nombre)
    return db.prepare('SELECT * FROM auditorias_adjuntos WHERE id = ?').get(r.lastInsertRowid)
  })

  ipcMain.handle('auditorias:adjuntos:eliminar', (_, id: number) => {
    const db = getDb()
    db.prepare('DELETE FROM auditorias_adjuntos WHERE id = ?').run(id)
    return { ok: true }
  })

  ipcMain.handle('auditorias:seleccionarAdjunto', async (event) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      title: 'Seleccionar adjunto',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documentos', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'] },
        { name: 'Imágenes',   extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp'] },
        { name: 'Todos',      extensions: ['*'] },
      ],
    })
    if (result.canceled || !result.filePaths.length) return []
    return result.filePaths.map(ruta => ({ ruta, nombre: ruta.split(/[\\/]/).pop() ?? ruta }))
  })

  ipcMain.handle('auditorias:abrirAdjunto', (_, ruta: string) => {
    shell.openPath(ruta)
    return { ok: true }
  })

  // Keep legacy single-evidence handlers for backwards compat
  ipcMain.handle('auditorias:seleccionarEvidencia', async (event) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      title: 'Seleccionar evidencia de auditoría',
      properties: ['openFile'],
      filters: [
        { name: 'Documentos', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx'] },
        { name: 'Imágenes',   extensions: ['png', 'jpg', 'jpeg'] },
        { name: 'Todos',      extensions: ['*'] },
      ],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const ruta = result.filePaths[0]
    const nombre = ruta.split(/[\\/]/).pop() ?? ruta
    return { ruta, nombre }
  })

  ipcMain.handle('auditorias:actualizarEvidencia', (_, id: number, ruta: string, nombre: string) => {
    const db = getDb()
    db.prepare('UPDATE auditorias SET evidencia_ruta = ?, evidencia_nombre = ? WHERE id = ?').run(ruta, nombre, id)
    return db.prepare('SELECT * FROM auditorias WHERE id = ?').get(id)
  })

  ipcMain.handle('auditorias:abrirEvidencia', (_, ruta: string) => {
    shell.openPath(ruta)
    return { ok: true }
  })
}
