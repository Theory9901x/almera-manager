import { ipcMain } from 'electron'
import { getDb } from '../../db/database'
import notifier from 'node-notifier'

export function registerNotificacionesHandlers() {
  const db = getDb()

  ipcMain.handle('notificaciones:listar', () => {
    return db.prepare('SELECT * FROM notificaciones ORDER BY creado_en DESC LIMIT 50').all()
  })

  ipcMain.handle('notificaciones:marcarLeida', (_, id: number) => {
    db.prepare('UPDATE notificaciones SET leida = 1 WHERE id = ?').run(id)
    return { ok: true }
  })

  ipcMain.handle('notificaciones:limpiar', () => {
    db.prepare('DELETE FROM notificaciones WHERE leida = 1').run()
    return { ok: true }
  })
}

// Función utilitaria para crear notificaciones desde otros handlers
export function crearNotificacion(titulo: string, cuerpo: string, tipo = 'info') {
  const db = getDb()
  db.prepare('INSERT INTO notificaciones (titulo, cuerpo, tipo) VALUES (?, ?, ?)').run(titulo, cuerpo, tipo)

  notifier.notify({
    title: `Almera Manager — ${titulo}`,
    message: cuerpo,
    sound: false
  })
}

// Revisar tareas vencidas al arrancar (se puede llamar desde main.ts)
export function revisarTareasVencidas() {
  const db = getDb()
  const hoy = new Date().toISOString().split('T')[0]
  const vencidas = db.prepare(`
    SELECT * FROM tareas
    WHERE estado != 'completada' AND fecha_limite < ? AND fecha_limite IS NOT NULL
  `).all(hoy) as any[]

  for (const t of vencidas) {
    crearNotificacion('Tarea vencida', t.titulo, 'alerta')
  }
}
