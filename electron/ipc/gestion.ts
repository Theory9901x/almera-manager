import { ipcMain } from 'electron'
import { getDb } from '../../db/database'

export function registerGestionHandlers() {
  const db = getDb()

  // ── Indicadores ────────────────────────────────────────
  ipcMain.handle('indicadores:listar', (_, periodo_id: number) => {
    return db.prepare('SELECT * FROM indicadores WHERE periodo_id = ? ORDER BY codigo').all(periodo_id)
  })

  ipcMain.handle('indicadores:crear', (_, data) => {
    const stmt = db.prepare(`
      INSERT INTO indicadores (periodo_id, codigo, nombre, categoria, estado, meta, resultado, observaciones)
      VALUES (@periodo_id, @codigo, @nombre, @categoria, @estado, @meta, @resultado, @observaciones)
    `)
    const result = stmt.run(data)
    return db.prepare('SELECT * FROM indicadores WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('indicadores:actualizar', (_, id: number, data) => {
    db.prepare(`
      UPDATE indicadores SET
        codigo = @codigo, nombre = @nombre, categoria = @categoria,
        estado = @estado, meta = @meta, resultado = @resultado,
        observaciones = @observaciones, actualizado_en = datetime('now')
      WHERE id = ${id}
    `).run(data)
    return db.prepare('SELECT * FROM indicadores WHERE id = ?').get(id)
  })

  ipcMain.handle('indicadores:eliminar', (_, id: number) => {
    db.prepare('DELETE FROM indicadores WHERE id = ?').run(id)
    return { ok: true }
  })

  // ── Planes de mejora ───────────────────────────────────
  ipcMain.handle('planes:listar', (_, periodo_id: number) => {
    return db.prepare(`
      SELECT p.*, i.nombre AS indicador_nombre
      FROM planes_mejora p
      LEFT JOIN indicadores i ON i.id = p.indicador_id
      WHERE p.periodo_id = ?
      ORDER BY p.fecha_limite ASC
    `).all(periodo_id)
  })

  ipcMain.handle('planes:crear', (_, data) => {
    const stmt = db.prepare(`
      INSERT INTO planes_mejora (indicador_id, periodo_id, descripcion, responsable, fecha_limite, estado, avance)
      VALUES (@indicador_id, @periodo_id, @descripcion, @responsable, @fecha_limite, @estado, @avance)
    `)
    const result = stmt.run(data)
    return db.prepare('SELECT * FROM planes_mejora WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('planes:actualizar', (_, id: number, data) => {
    db.prepare(`
      UPDATE planes_mejora SET
        descripcion = @descripcion, responsable = @responsable,
        fecha_limite = @fecha_limite, estado = @estado, avance = @avance
      WHERE id = ${id}
    `).run(data)
    return db.prepare('SELECT * FROM planes_mejora WHERE id = ?').get(id)
  })

  ipcMain.handle('planes:eliminar', (_, id: number) => {
    db.prepare('DELETE FROM planes_mejora WHERE id = ?').run(id)
    return { ok: true }
  })
}
