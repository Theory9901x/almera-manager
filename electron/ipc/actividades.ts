import { ipcMain } from 'electron'
import { getDb } from '../../db/database'

export function registerActividadesHandlers() {
  const db = getDb()

  ipcMain.handle('actividades:listar', (_, periodo_id: number) => {
    return db.prepare('SELECT * FROM actividades WHERE periodo_id = ? ORDER BY fecha DESC').all(periodo_id)
  })

  ipcMain.handle('actividades:crear', (_, data) => {
    const stmt = db.prepare(`
      INSERT INTO actividades (periodo_id, tipo, descripcion, duracion_min, fecha)
      VALUES (@periodo_id, @tipo, @descripcion, @duracion_min, @fecha)
    `)
    const result = stmt.run(data)
    return db.prepare('SELECT * FROM actividades WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('actividades:eliminar', (_, id: number) => {
    db.prepare('DELETE FROM actividades WHERE id = ?').run(id)
    return { ok: true }
  })
}
