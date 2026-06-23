import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { closeDb } from '../db/database'
import { registerPeriodosHandlers }       from './ipc/periodos'
import { registerGestionHandlers }        from './ipc/gestion'
import { registerAsistenciasHandlers }    from './ipc/asistencias'
import { registerCapacitacionesHandlers } from './ipc/capacitaciones'
import { registerEvidenciasHandlers }     from './ipc/evidencias'
import { registerTareasHandlers }         from './ipc/tareas'
import { registerActividadesHandlers }    from './ipc/actividades'
import { registerNotificacionesHandlers } from './ipc/notificaciones'
import { registerInformesHandlers }       from './ipc/informes'
import { registerAuthHandlers }           from './ipc/auth'
import { registerAuditoriasHandlers }     from './ipc/auditorias'

const isDev = !app.isPackaged

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, 'preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  })

  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  registerPeriodosHandlers()
  registerGestionHandlers()
  registerAsistenciasHandlers()
  registerCapacitacionesHandlers()
  registerEvidenciasHandlers()
  registerTareasHandlers()
  registerActividadesHandlers()
  registerNotificacionesHandlers()
  registerInformesHandlers()
  registerAuthHandlers()
  registerAuditoriasHandlers()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})
