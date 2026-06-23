import { ipcMain, dialog, shell } from 'electron'
import { basename } from 'path'
import { getDb } from '../../db/database'

export function registerCapacitacionesHandlers() {
  const db = getDb()

  ipcMain.handle('capacitaciones:listar', (_, periodo_id: number) => {
    return db.prepare('SELECT * FROM capacitaciones WHERE periodo_id = ? ORDER BY fecha DESC').all(periodo_id)
  })

  ipcMain.handle('capacitaciones:crear', (_, data) => {
    const result = db.prepare(`
      INSERT INTO capacitaciones (periodo_id, titulo, descripcion, fecha, acta_ruta, acta_nombre, sesion1, sesion2, sesion3)
      VALUES (@periodo_id, @titulo, @descripcion, @fecha, @acta_ruta, @acta_nombre, 'pendiente', 'pendiente', 'pendiente')
    `).run(data)
    return db.prepare('SELECT * FROM capacitaciones WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('capacitaciones:actualizarSesion', (_, id: number, sesion: string, valor: string) => {
    const cols = ['sesion1', 'sesion2', 'sesion3']
    if (!cols.includes(sesion)) return null
    db.prepare(`UPDATE capacitaciones SET ${sesion} = ? WHERE id = ?`).run(valor, id)
    return db.prepare('SELECT * FROM capacitaciones WHERE id = ?').get(id)
  })

  ipcMain.handle('capacitaciones:eliminar', (_, id: number) => {
    db.prepare('DELETE FROM capacitaciones WHERE id = ?').run(id)
    return { ok: true }
  })

  ipcMain.handle('capacitaciones:seleccionarActa', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Seleccionar acta',
      buttonLabel: 'Seleccionar',
      filters: [{ name: 'Documentos', extensions: ['pdf', 'doc', 'docx'] }]
    })
    if (canceled || filePaths.length === 0) return null
    return { ruta: filePaths[0], nombre: basename(filePaths[0]) }
  })

  ipcMain.handle('capacitaciones:abrirActa', async (_, ruta: string) => {
    await shell.openPath(ruta)
    return { ok: true }
  })
}
