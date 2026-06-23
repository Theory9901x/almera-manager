import { ipcMain } from 'electron'
import { getDb } from '../../db/database'

export function registerAuthHandlers() {
  ipcMain.handle('auth:listarUsuarios', () => {
    const db = getDb()
    return db.prepare('SELECT id, nombre, cargo FROM usuarios WHERE activo = 1 ORDER BY id').all()
  })

  ipcMain.handle('auth:login', (_, { id, pin }: { id: number; pin: string }) => {
    const db = getDb()
    const user = db.prepare(
      'SELECT id, nombre, cargo FROM usuarios WHERE id = ? AND pin = ? AND activo = 1'
    ).get(id, pin)
    return user ?? null
  })

  ipcMain.handle('auth:cambiarPin', (_, { id, pinActual, pinNuevo }: { id: number; pinActual: string; pinNuevo: string }) => {
    const db = getDb()
    const user = db.prepare('SELECT id FROM usuarios WHERE id = ? AND pin = ?').get(id, pinActual)
    if (!user) return { ok: false, error: 'PIN actual incorrecto' }
    db.prepare('UPDATE usuarios SET pin = ? WHERE id = ?').run(pinNuevo, id)
    return { ok: true }
  })
}
