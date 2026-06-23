import { ipcMain, dialog, shell } from 'electron'
import { getDb } from '../../db/database'
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { app } from 'electron'
import { join, basename, extname } from 'path'

function getEvidenciasDir(): string {
  const dir = join(app.getPath('userData'), 'evidencias')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function registerEvidenciasHandlers() {
  const db = getDb()

  ipcMain.handle('evidencias:listar', (_, periodo_id: number) => {
    return db.prepare(`
      SELECT e.*, i.nombre AS indicador_nombre
      FROM evidencias e
      LEFT JOIN indicadores i ON i.id = e.indicador_id
      WHERE e.periodo_id = ?
      ORDER BY e.fecha_carga DESC
    `).all(periodo_id)
  })

  ipcMain.handle('evidencias:abrirDialogo', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Seleccionar evidencia',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documentos', extensions: ['pdf', 'xlsx', 'xls', 'docx', 'doc'] },
        { name: 'Imágenes',   extensions: ['png', 'jpg', 'jpeg'] },
        { name: 'Todos',      extensions: ['*'] }
      ]
    })
    if (canceled) return []
    return filePaths
  })

  ipcMain.handle('evidencias:cargar', (_, data: {
    rutas: string[]; periodo_id: number; indicador_id?: number; descripcion?: string
  }) => {
    const dir = getEvidenciasDir()
    const insertados = []

    for (const rutaOrigen of data.rutas) {
      const nombre = basename(rutaOrigen)
      const ext = extname(nombre).replace('.', '').toLowerCase()
      const destino = join(dir, `${Date.now()}_${nombre}`)
      copyFileSync(rutaOrigen, destino)

      const tipo = ['pdf'].includes(ext) ? 'pdf'
        : ['xlsx', 'xls'].includes(ext) ? 'xlsx'
        : ['png', 'jpg', 'jpeg'].includes(ext) ? 'img'
        : 'otro'

      const stmt = db.prepare(`
        INSERT INTO evidencias (periodo_id, indicador_id, nombre_archivo, ruta, tipo, descripcion)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      const result = stmt.run(
        data.periodo_id, data.indicador_id ?? null,
        nombre, destino, tipo, data.descripcion ?? ''
      )
      insertados.push(db.prepare('SELECT * FROM evidencias WHERE id = ?').get(result.lastInsertRowid))
    }
    return insertados
  })

  ipcMain.handle('evidencias:eliminar', (_, id: number) => {
    db.prepare('DELETE FROM evidencias WHERE id = ?').run(id)
    return { ok: true }
  })

  ipcMain.handle('evidencias:abrirArchivo', (_, ruta: string) => {
    shell.openPath(ruta)
    return { ok: true }
  })
}
