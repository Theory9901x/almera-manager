import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

const DB_PATH = join(app.getPath('userData'), 'almera.db')

const SCHEMA_EMBEBIDO = `
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  cargo TEXT,
  pin TEXT NOT NULL,
  activo INTEGER DEFAULT 1,
  creado_en TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS periodos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anio INTEGER NOT NULL, mes INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activo', notas TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(anio, mes)
);
CREATE TABLE IF NOT EXISTS indicadores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id INTEGER NOT NULL, codigo TEXT, nombre TEXT NOT NULL,
  categoria TEXT, estado TEXT NOT NULL DEFAULT 'al_dia',
  meta TEXT, resultado TEXT, observaciones TEXT,
  actualizado_en TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (periodo_id) REFERENCES periodos(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS planes_mejora (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  indicador_id INTEGER NOT NULL, periodo_id INTEGER NOT NULL,
  descripcion TEXT NOT NULL, responsable TEXT, fecha_limite TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente', avance INTEGER DEFAULT 0,
  creado_en TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (indicador_id) REFERENCES indicadores(id) ON DELETE CASCADE,
  FOREIGN KEY (periodo_id) REFERENCES periodos(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS evidencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id INTEGER NOT NULL, indicador_id INTEGER,
  nombre_archivo TEXT NOT NULL, ruta TEXT NOT NULL,
  tipo TEXT, descripcion TEXT, fecha_carga TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (periodo_id) REFERENCES periodos(id) ON DELETE CASCADE,
  FOREIGN KEY (indicador_id) REFERENCES indicadores(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS tareas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id INTEGER, titulo TEXT NOT NULL, descripcion TEXT,
  prioridad TEXT NOT NULL DEFAULT 'media',
  estado TEXT NOT NULL DEFAULT 'pendiente',
  fecha_limite TEXT, completada_en TEXT,
  creado_en TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (periodo_id) REFERENCES periodos(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS actividades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id INTEGER NOT NULL, tipo TEXT NOT NULL,
  descripcion TEXT NOT NULL, duracion_min INTEGER DEFAULT 0,
  fecha TEXT DEFAULT (date('now')),
  FOREIGN KEY (periodo_id) REFERENCES periodos(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS notificaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL, cuerpo TEXT,
  tipo TEXT DEFAULT 'info', leida INTEGER DEFAULT 0,
  creado_en TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS asistencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id INTEGER NOT NULL, proceso TEXT NOT NULL,
  persona TEXT NOT NULL, que_se_hizo TEXT NOT NULL,
  como_se_hizo TEXT, fecha TEXT DEFAULT (date('now')),
  evidencia_ruta TEXT, evidencia_nombre TEXT,
  creado_en TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (periodo_id) REFERENCES periodos(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS capacitaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id INTEGER NOT NULL, titulo TEXT NOT NULL,
  descripcion TEXT, fecha TEXT DEFAULT (date('now')),
  acta_ruta TEXT, acta_nombre TEXT,
  sesion1 TEXT NOT NULL DEFAULT 'pendiente',
  sesion2 TEXT NOT NULL DEFAULT 'pendiente',
  sesion3 TEXT NOT NULL DEFAULT 'pendiente',
  FOREIGN KEY (periodo_id) REFERENCES periodos(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS auditorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id INTEGER,
  usuario_id INTEGER,
  subproceso TEXT,
  tipo TEXT NOT NULL DEFAULT 'interna',
  hallazgo TEXT NOT NULL,
  descripcion TEXT,
  como_se_identifico TEXT,
  accion TEXT,
  responsable TEXT,
  fecha TEXT DEFAULT (date('now')),
  fecha_cierre TEXT,
  estado TEXT NOT NULL DEFAULT 'abierta',
  evidencia_ruta TEXT,
  evidencia_nombre TEXT,
  notas TEXT,
  creado_en TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (periodo_id) REFERENCES periodos(id) ON DELETE SET NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS auditorias_adjuntos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auditoria_id INTEGER NOT NULL,
  ruta TEXT NOT NULL,
  nombre TEXT NOT NULL,
  creado_en TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (auditoria_id) REFERENCES auditorias(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS tareas_adjuntos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tarea_id INTEGER NOT NULL,
  ruta TEXT NOT NULL,
  nombre TEXT NOT NULL,
  creado_en TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (tarea_id) REFERENCES tareas(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS asistencias_adjuntos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asistencia_id INTEGER NOT NULL,
  ruta TEXT NOT NULL,
  nombre TEXT NOT NULL,
  creado_en TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (asistencia_id) REFERENCES asistencias(id) ON DELETE CASCADE
);
`

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH)
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')

    // Always run SCHEMA_EMBEBIDO to ensure all tables exist (uses IF NOT EXISTS)
    _db.exec(SCHEMA_EMBEBIDO)

    // Migrations
    try { _db.exec("ALTER TABLE asistencias ADD COLUMN cumplido INTEGER NOT NULL DEFAULT 0") } catch {}
    try { _db.exec("ALTER TABLE asistencias ADD COLUMN gestion TEXT") } catch {}
    try { _db.exec("ALTER TABLE tareas ADD COLUMN notas_cierre TEXT") } catch {}
    try { _db.exec("ALTER TABLE tareas ADD COLUMN adjunto_ruta TEXT") } catch {}
    try { _db.exec("ALTER TABLE tareas ADD COLUMN adjunto_nombre TEXT") } catch {}
    try { _db.exec("ALTER TABLE tareas ADD COLUMN cierre_adjunto_ruta TEXT") } catch {}
    try { _db.exec("ALTER TABLE tareas ADD COLUMN cierre_adjunto_nombre TEXT") } catch {}
    // Multi-user migrations
    try { _db.exec("ALTER TABLE tareas ADD COLUMN usuario_id INTEGER") } catch {}
    try { _db.exec("ALTER TABLE tareas ADD COLUMN subproceso TEXT") } catch {}
    try { _db.exec("ALTER TABLE asistencias ADD COLUMN usuario_id INTEGER") } catch {}
    try { _db.exec("ALTER TABLE asistencias ADD COLUMN subproceso TEXT") } catch {}
    try { _db.exec("ALTER TABLE capacitaciones ADD COLUMN usuario_id INTEGER") } catch {}
    try { _db.exec("ALTER TABLE capacitaciones ADD COLUMN subproceso TEXT") } catch {}
    try { _db.exec("ALTER TABLE indicadores ADD COLUMN usuario_id INTEGER") } catch {}
    try { _db.exec("ALTER TABLE indicadores ADD COLUMN subproceso TEXT") } catch {}

    // Auto-create current month period if none exists (first launch)
    const noPeriods = (_db.prepare('SELECT COUNT(*) as n FROM periodos').get() as any).n === 0
    if (noPeriods) {
      const hoy = new Date()
      _db.prepare('INSERT OR IGNORE INTO periodos (anio, mes, estado) VALUES (?, ?, ?)').run(
        hoy.getFullYear(), hoy.getMonth() + 1, 'activo'
      )
    }

    // Seed initial users
    _db.exec(`
      INSERT OR IGNORE INTO usuarios (id, nombre, cargo, pin) VALUES
        (1, 'Katalina Rodriguez Pérez', 'Líder de Calidad', '1000'),
        (2, 'Jesika Garcia', 'Profesional de Apoyo Calidad', '1100'),
        (3, 'Rubiela Guevara', 'Profesional de Apoyo Calidad', '1110');
      UPDATE usuarios SET pin = '1000' WHERE id = 1;
      UPDATE usuarios SET pin = '1100' WHERE id = 2;
      UPDATE usuarios SET pin = '1110' WHERE id = 3;
    `)
  }
  return _db
}

export function closeDb(): void {
  if (_db) { _db.close(); _db = null }
}
