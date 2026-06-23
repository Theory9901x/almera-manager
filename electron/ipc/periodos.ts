import { ipcMain } from 'electron'
import { getDb } from '../../db/database'

export function registerPeriodosHandlers() {
  const db = getDb()

  ipcMain.handle('periodos:listar', () => {
    return db.prepare('SELECT * FROM periodos ORDER BY anio DESC, mes DESC').all()
  })

  ipcMain.handle('periodos:obtener', (_, id: number) => {
    return db.prepare('SELECT * FROM periodos WHERE id = ?').get(id)
  })

  ipcMain.handle('periodos:crear', (_, data: { anio: number; mes: number; notas?: string }) => {
    const stmt = db.prepare('INSERT OR IGNORE INTO periodos (anio, mes, notas) VALUES (?, ?, ?)')
    const result = stmt.run(data.anio, data.mes, data.notas ?? '')
    return db.prepare('SELECT * FROM periodos WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('periodos:cerrar', (_, id: number) => {
    db.prepare("UPDATE periodos SET estado = 'cerrado' WHERE id = ?").run(id)
    return { ok: true }
  })

  ipcMain.handle('periodos:stats', (_, id: number, usuarioId?: number | null) => {
    const gci = usuarioId != null
    function cnt(table: string, extra = '') {
      const sql = gci
        ? `SELECT COUNT(*) as n FROM ${table} WHERE periodo_id = ? AND usuario_id = ?${extra}`
        : `SELECT COUNT(*) as n FROM ${table} WHERE periodo_id = ? AND usuario_id IS NULL${extra}`
      const row = gci ? db.prepare(sql).get(id, usuarioId!) : db.prepare(sql).get(id)
      return (row as any).n
    }
    const tareaRow = gci
      ? db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN estado='completada' THEN 1 ELSE 0 END) as ok FROM tareas WHERE periodo_id = ? AND usuario_id = ?`).get(id, usuarioId!) as any
      : db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN estado='completada' THEN 1 ELSE 0 END) as ok FROM tareas WHERE periodo_id = ? AND usuario_id IS NULL`).get(id) as any
    return {
      asistencias:              cnt('asistencias'),
      asistencias_cumplidas:    cnt('asistencias', ' AND cumplido = 1'),
      capacitaciones:           cnt('capacitaciones'),
      capacitaciones_completas: cnt('capacitaciones', " AND sesion1='completado' AND sesion2='completado' AND sesion3='completado'"),
      indicadores:              cnt('indicadores'),
      tareas_total: tareaRow.total ?? 0,
      tareas_ok:    tareaRow.ok    ?? 0,
    }
  })
}
