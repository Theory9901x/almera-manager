CREATE TABLE IF NOT EXISTS organizations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, key)
);

CREATE TABLE IF NOT EXISTS memberships (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id BIGINT NOT NULL REFERENCES roles(id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS permissions (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS modules (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  route TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'blocks',
  position INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_modules (
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  module_id BIGINT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  configured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, module_id)
);

CREATE TABLE IF NOT EXISTS role_modules (
  role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module_id BIGINT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, module_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  membership_id BIGINT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships(user_id);

INSERT INTO permissions (key, name, description) VALUES
  ('users.view', 'Ver usuarios', 'Consultar usuarios de la entidad'),
  ('users.create', 'Crear usuarios', 'Crear cuentas y membresias'),
  ('users.edit', 'Editar usuarios', 'Actualizar rol y datos administrativos'),
  ('users.disable', 'Activar o inactivar usuarios', 'Controlar el estado de acceso'),
  ('roles.assign', 'Asignar roles', 'Configurar roles, permisos y modulos'),
  ('dashboard.view', 'Ver inicio', 'Acceso al tablero principal'),
  ('almera.view', 'Ver ALMERA', 'Consultar la gestion ALMERA'),
  ('almera.create', 'Crear gestion ALMERA', 'Registrar solicitudes, actividades y evidencias'),
  ('almera.edit', 'Editar gestion ALMERA', 'Actualizar estados y observaciones'),
  ('almera.delete', 'Eliminar gestion ALMERA', 'Retirar registros segun autorizacion'),
  ('almera.export', 'Exportar ALMERA', 'Generar salidas basicas de seguimiento'),
  ('admin.view', 'Ver administracion', 'Acceder al panel administrativo'),
  ('settings.edit', 'Editar configuracion', 'Gestionar modulos e informacion de entidad'),
  ('users.manage', 'Gestionar usuarios', 'Compatibilidad con permisos administrativos previos'),
  ('roles.manage', 'Gestionar roles', 'Compatibilidad con permisos administrativos previos'),
  ('modules.manage', 'Gestionar modulos', 'Compatibilidad con permisos administrativos previos'),
  ('organization.manage', 'Gestionar entidad', 'Compatibilidad con permisos administrativos previos')
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO modules (key, name, description, route, icon, position) VALUES
  ('dashboard', 'Inicio', 'Resumen general y accesos rapidos', '/app', 'layout-dashboard', 0),
  ('almera', 'Gestion ALMERA', 'Solicitudes documentales, documentos, evidencias, estados e informes de seguimiento', '/app/modulos/almera', 'clipboard-check', 10),
  ('users', 'Usuarios', 'Listado, creacion, edicion y activacion de usuarios', '/app/administracion', 'users', 20),
  ('roles', 'Roles y permisos', 'Relacion rol, permisos y modulos asignados', '/app/administracion', 'shield-check', 30),
  ('entity', 'Entidad activa', 'Informacion general y modulos habilitados de la entidad', '/app/administracion', 'building', 40),
  ('reports', 'Informes basicos', 'Informes iniciales de seguimiento y trazabilidad', '/app/modulos/reports', 'file-bar-chart', 50),
  ('settings', 'Configuracion', 'Parametros visuales y administrativos preparados para fase siguiente', '/app/administracion', 'settings', 60),
  ('admin', 'Panel administrativo', 'Usuarios, roles, permisos, entidad y modulos', '/app/administracion', 'settings', 100)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, route = EXCLUDED.route,
  icon = EXCLUDED.icon, position = EXCLUDED.position;
