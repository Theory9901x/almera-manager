-- ============================================================
--  ALMERA MANAGER — Schema SQLite
-- ============================================================

CREATE TABLE IF NOT EXISTS periodos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  anio      INTEGER NOT NULL,
  mes       INTEGER NOT NULL,  -- 1-12
  estado    TEXT    NOT NULL DEFAULT 'activo',  -- 'activo' | 'cerrado'
  notas     TEXT,
  creado_en TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(anio, mes)
);

CREATE TABLE IF NOT EXISTS indicadores (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id  INTEGER NOT NULL,
  codigo      TEXT,
  nombre      TEXT    NOT NULL,
  categoria   TEXT,   -- 'calidad' | 'proceso' | 'resultado'
  estado      TEXT    NOT NULL DEFAULT 'al_dia',  -- 'al_dia' | 'en_riesgo' | 'critico'
  meta        TEXT,
  resultado   TEXT,
  observaciones TEXT,
  actualizado_en TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (periodo_id) REFERENCES periodos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS planes_mejora (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  indicador_id  INTEGER NOT NULL,
  periodo_id    INTEGER NOT NULL,
  descripcion   TEXT    NOT NULL,
  responsable   TEXT,
  fecha_limite  TEXT,
  estado        TEXT    NOT NULL DEFAULT 'pendiente',  -- 'pendiente' | 'en_curso' | 'completado'
  avance        INTEGER DEFAULT 0,  -- 0-100 %
  creado_en     TEXT    DEFAULT (datetime('now')),
  FOREIGN KEY (indicador_id) REFERENCES indicadores(id) ON DELETE CASCADE,
  FOREIGN KEY (periodo_id)   REFERENCES periodos(id)    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evidencias (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id     INTEGER NOT NULL,
  indicador_id   INTEGER,
  nombre_archivo TEXT    NOT NULL,
  ruta           TEXT    NOT NULL,
  tipo           TEXT,   -- 'pdf' | 'xlsx' | 'img' | 'otro'
  descripcion    TEXT,
  fecha_carga    TEXT    DEFAULT (datetime('now')),
  FOREIGN KEY (periodo_id)   REFERENCES periodos(id)    ON DELETE CASCADE,
  FOREIGN KEY (indicador_id) REFERENCES indicadores(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tareas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id  INTEGER,
  titulo      TEXT    NOT NULL,
  descripcion TEXT,
  prioridad   TEXT    NOT NULL DEFAULT 'media',  -- 'alta' | 'media' | 'baja'
  estado      TEXT    NOT NULL DEFAULT 'pendiente',  -- 'pendiente' | 'en_curso' | 'completada'
  fecha_limite TEXT,
  completada_en TEXT,
  creado_en   TEXT    DEFAULT (datetime('now')),
  FOREIGN KEY (periodo_id) REFERENCES periodos(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS actividades (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id   INTEGER NOT NULL,
  tipo         TEXT    NOT NULL,  -- 'soporte' | 'capacitacion' | 'revision' | 'reunion' | 'otro'
  descripcion  TEXT    NOT NULL,
  duracion_min INTEGER DEFAULT 0,
  fecha        TEXT    DEFAULT (date('now')),
  FOREIGN KEY (periodo_id) REFERENCES periodos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notificaciones (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo    TEXT    NOT NULL,
  cuerpo    TEXT,
  tipo      TEXT    DEFAULT 'info',  -- 'info' | 'alerta' | 'urgente'
  leida     INTEGER DEFAULT 0,
  creado_en TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS asistencias (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id       INTEGER NOT NULL,
  proceso          TEXT    NOT NULL,
  persona          TEXT    NOT NULL,
  que_se_hizo      TEXT    NOT NULL,
  como_se_hizo     TEXT,
  fecha            TEXT    DEFAULT (date('now')),
  evidencia_ruta   TEXT,
  evidencia_nombre TEXT,
  creado_en        TEXT    DEFAULT (datetime('now')),
  FOREIGN KEY (periodo_id) REFERENCES periodos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS capacitaciones (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id   INTEGER NOT NULL,
  titulo       TEXT    NOT NULL,
  descripcion  TEXT,
  fecha        TEXT    DEFAULT (date('now')),
  acta_ruta    TEXT,
  acta_nombre  TEXT,
  sesion1      TEXT    NOT NULL DEFAULT 'pendiente',
  sesion2      TEXT    NOT NULL DEFAULT 'pendiente',
  sesion3      TEXT    NOT NULL DEFAULT 'pendiente',
  FOREIGN KEY (periodo_id) REFERENCES periodos(id) ON DELETE CASCADE
);
