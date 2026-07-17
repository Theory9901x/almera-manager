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
  ('users', 'Usuarios', 'Listado, creacion, edicion y activacion de usuarios', '/app/administracion/users', 'users', 20),
  ('roles', 'Roles y permisos', 'Relacion rol, permisos y modulos asignados', '/app/administracion/roles', 'shield-check', 30),
  ('entity', 'Entidad activa', 'Informacion general y modulos habilitados de la entidad', '/app/administracion/entity', 'building', 40),
  ('reports', 'Informes basicos', 'Informes iniciales de seguimiento y trazabilidad', '/app/modulos/reports', 'file-bar-chart', 50),
  ('settings', 'Configuracion', 'Parametros visuales y administrativos preparados para fase siguiente', '/app/administracion/settings', 'settings', 60),
  ('admin', 'Panel administrativo', 'Usuarios, roles, permisos, entidad y modulos', '/app/administracion', 'settings', 100)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, route = EXCLUDED.route,
  icon = EXCLUDED.icon, position = EXCLUDED.position;

INSERT INTO modules (key, name, description, route, icon, position, active) VALUES
  ('technical-assistances', 'Asistencias Tecnicas', 'Registro, seguimiento, evidencias, alertas e indicadores de asistencias tecnicas', '/app/modulos/technical-assistances', 'headphones', 11, TRUE),
  ('internal-audits', 'Auditorias Internas', 'Planeacion, ejecucion, hallazgos e informes de auditoria interna', '/app/modulos/internal-audits', 'shield-check', 12, FALSE)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, route = EXCLUDED.route,
  icon = EXCLUDED.icon, position = EXCLUDED.position, active = EXCLUDED.active;

CREATE TABLE IF NOT EXISTS institutional_processes (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL, name TEXT NOT NULL, classification TEXT NOT NULL, responsible TEXT NOT NULL DEFAULT '',
  responsible_email TEXT NOT NULL DEFAULT '', active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);
CREATE TABLE IF NOT EXISTS almera_catalog_modules (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);
CREATE TABLE IF NOT EXISTS technical_assistances (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL, subject TEXT NOT NULL, process_id BIGINT NOT NULL REFERENCES institutional_processes(id),
  almera_module_id BIGINT NOT NULL REFERENCES almera_catalog_modules(id), requester_name TEXT NOT NULL,
  requester_position TEXT NOT NULL DEFAULT '', requester_contact TEXT NOT NULL DEFAULT '', request_channel TEXT NOT NULL DEFAULT 'OTRO',
  description TEXT NOT NULL, priority TEXT NOT NULL CHECK (priority IN ('BAJA','MEDIA','ALTA','CRITICA')),
  status TEXT NOT NULL DEFAULT 'RECIBIDA' CHECK (status IN ('RECIBIDA','EN_ANALISIS','EN_PROCESO','PENDIENTE_DEL_PROCESO','PENDIENTE_DE_TERCERO','COMPLETADA','CANCELADA')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), commitment_at TIMESTAMPTZ, responsible_membership_id BIGINT REFERENCES memberships(id),
  general_observations TEXT NOT NULL DEFAULT '', final_solution TEXT, closed_at TIMESTAMPTZ, cancellation_reason TEXT,
  created_by_id BIGINT NOT NULL REFERENCES users(id), updated_by_id BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ,
  UNIQUE (organization_id, code)
);
ALTER TABLE technical_assistances
  ADD COLUMN IF NOT EXISTS completion_percent SMALLINT NOT NULL DEFAULT 0 CHECK (completion_percent BETWEEN 0 AND 100);
CREATE INDEX IF NOT EXISTS assistance_scope_idx ON technical_assistances(organization_id,status,commitment_at);
CREATE INDEX IF NOT EXISTS assistance_filters_idx ON technical_assistances(organization_id,process_id,almera_module_id,priority);
CREATE TABLE IF NOT EXISTS assistance_actions (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assistance_id BIGINT NOT NULL REFERENCES technical_assistances(id) ON DELETE CASCADE, performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  performed_by_id BIGINT NOT NULL REFERENCES users(id), description TEXT NOT NULL, result TEXT NOT NULL DEFAULT '', observations TEXT NOT NULL DEFAULT '',
  new_status TEXT, new_commitment_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE assistance_actions
  ADD COLUMN IF NOT EXISTS completion_percent SMALLINT CHECK (completion_percent BETWEEN 0 AND 100);
CREATE TABLE IF NOT EXISTS evidences (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assistance_id BIGINT REFERENCES technical_assistances(id) ON DELETE CASCADE,
  action_id BIGINT REFERENCES assistance_actions(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes BIGINT NOT NULL,
  storage_key TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', uploaded_by_id BIGINT NOT NULL REFERENCES users(id),
  active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (assistance_id IS NOT NULL OR action_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS evidence_assistance_idx ON evidences(organization_id,assistance_id,active);
CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, entity_id BIGINT NOT NULL, action TEXT NOT NULL, changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id BIGINT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS activity_entity_idx ON activity_logs(organization_id,entity_type,entity_id,created_at DESC);
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id), type TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL,
  entity_type TEXT, entity_id BIGINT, read_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_plans (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL, name TEXT NOT NULL, validity INTEGER NOT NULL, objective TEXT NOT NULL, scope TEXT NOT NULL,
  criteria TEXT NOT NULL, scheduled_start DATE, scheduled_end DATE, lead_auditor_id BIGINT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'BORRADOR', observations TEXT NOT NULL DEFAULT '', created_by_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(organization_id,code)
);
CREATE TABLE IF NOT EXISTS audits (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id BIGINT NOT NULL REFERENCES audit_plans(id) ON DELETE CASCADE, code TEXT NOT NULL,
  process_id BIGINT NOT NULL REFERENCES institutional_processes(id), audit_type TEXT NOT NULL, objective TEXT NOT NULL,
  scope TEXT NOT NULL, criteria TEXT NOT NULL, scheduled_at TIMESTAMPTZ, executed_at TIMESTAMPTZ,
  lead_auditor_id BIGINT REFERENCES users(id), status TEXT NOT NULL DEFAULT 'BORRADOR', summary TEXT NOT NULL DEFAULT '',
  conclusions TEXT NOT NULL DEFAULT '', recommendations TEXT NOT NULL DEFAULT '', closed_at TIMESTAMPTZ,
  created_by_id BIGINT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id,code)
);
CREATE TABLE IF NOT EXISTS audit_checklist_items (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  audit_id BIGINT NOT NULL REFERENCES audits(id) ON DELETE CASCADE, criterion TEXT NOT NULL, question TEXT NOT NULL,
  component TEXT NOT NULL, result TEXT CHECK(result IN ('CUMPLE','CUMPLE_PARCIALMENTE','NO_CUMPLE','NO_APLICA')),
  observation TEXT NOT NULL DEFAULT '', responsible TEXT NOT NULL DEFAULT '', evaluated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS audit_findings (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  audit_id BIGINT NOT NULL REFERENCES audits(id) ON DELETE CASCADE, description TEXT NOT NULL, breached_criterion TEXT NOT NULL,
  objective_evidence TEXT NOT NULL, classification TEXT NOT NULL, responsible TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'ABIERTO',
  finding_date DATE NOT NULL DEFAULT CURRENT_DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO permissions(key,name,description) VALUES
 ('almera.dashboard.view','Ver tablero ALMERA','Consultar metricas'),('almera.assistance.view','Ver asistencias','Consultar asistencias'),
 ('almera.assistance.create','Crear asistencias','Registrar asistencias'),('almera.assistance.edit','Editar asistencias','Actualizar asistencias'),
 ('almera.assistance.assign','Asignar asistencias','Asignar responsables'),('almera.assistance.close','Cerrar asistencias','Completar asistencias'),
 ('almera.assistance.reopen','Reabrir asistencias','Reabrir con justificacion'),('almera.assistance.delete','Eliminar asistencias','Eliminacion logica'),
 ('almera.assistance.export','Exportar asistencias','Exportar informes'),('almera.audit.view','Ver auditorias','Consultar auditorias'),
 ('almera.audit.create','Crear auditorias','Crear planes y auditorias'),('almera.audit.edit','Editar auditorias','Actualizar auditorias'),
 ('almera.audit.execute','Ejecutar auditorias','Diligenciar listas'),('almera.audit.close','Cerrar auditorias','Cerrar auditorias'),
 ('almera.audit.approve','Aprobar auditorias','Aprobar informes'),('almera.audit.export','Exportar auditorias','Generar informes'),
 ('almera.catalog.manage','Gestionar catalogos','Administrar catalogos'),('almera.report.generate','Generar informes','Crear informes ALMERA')
ON CONFLICT(key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description;

INSERT INTO permissions(key,name,description) VALUES
 ('technical_assistance.view','Ver asistencias tecnicas','Consultar bandeja, detalle, alertas y tablero'),
 ('technical_assistance.create','Crear asistencias tecnicas','Registrar nuevas solicitudes de asistencia'),
 ('technical_assistance.edit','Diligenciar asistencias tecnicas','Actualizar avance, actuaciones y evidencias'),
 ('technical_assistance.close','Cerrar asistencias tecnicas','Completar o reabrir asistencias'),
 ('technical_assistance.export','Exportar asistencias tecnicas','Descargar consolidados CSV'),
 ('internal_audit.view','Ver auditorias internas','Consultar planes, ejecuciones e informes'),
 ('internal_audit.manage','Gestionar auditorias internas','Crear y ejecutar auditorias'),
 ('internal_audit.export','Generar informes de auditoria','Generar informes institucionales')
ON CONFLICT(key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description;

-- Matrices de Adherencia
INSERT INTO modules (key, name, description, route, icon, position, active) VALUES
  ('adherence-matrix', 'Matrices de Adherencia', 'Evaluacion de adherencia a criterios de historia clinica por area, con dashboard e informes', '/app/modulos/adherence-matrix', 'gauge', 13, TRUE)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, route = EXCLUDED.route,
  icon = EXCLUDED.icon, position = EXCLUDED.position, active = EXCLUDED.active;

INSERT INTO permissions (key, name, description) VALUES
  ('adherence_matrix.view', 'Ver matrices de adherencia', 'Consultar areas, matrices, profesionales y evaluaciones'),
  ('adherence_matrix.manage', 'Administrar matrices de adherencia', 'Crear/editar areas, ambitos, criterios, profesionales y cargos'),
  ('adherence_matrix.evaluate', 'Evaluar adherencia', 'Crear y diligenciar evaluaciones'),
  ('adherence_matrix.close', 'Cerrar evaluaciones de adherencia', 'Registrar cierre, compromisos y firmas'),
  ('adherence_matrix.export', 'Exportar matrices de adherencia', 'Generar informes PDF y exportar dashboard'),
  ('adherence_matrix.own_plan', 'Ver mi plan de mejora', 'El profesional ve sus propias evaluaciones y sube evidencias de su plan de mejora')
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS adherence_areas (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS adherence_positions (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS adherence_professionals (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  area_id BIGINT NOT NULL REFERENCES adherence_areas(id), position_id BIGINT NOT NULL REFERENCES adherence_positions(id),
  full_name TEXT NOT NULL, document_id TEXT NOT NULL, specialty TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE_INDEFINITE' CHECK (status IN ('ACTIVE_INDEFINITE','ACTIVE_ADAPTATION','WITHDRAWN')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  membership_id BIGINT REFERENCES memberships(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, document_id)
);
ALTER TABLE adherence_professionals ADD COLUMN IF NOT EXISTS membership_id BIGINT REFERENCES memberships(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS adherence_matrix_versions (
  id BIGSERIAL PRIMARY KEY, area_id BIGINT NOT NULL REFERENCES adherence_areas(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL, is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_by_id BIGINT NOT NULL REFERENCES users(id),
  UNIQUE (area_id, version_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS adherence_matrix_one_current_idx ON adherence_matrix_versions(area_id) WHERE is_current;

CREATE TABLE IF NOT EXISTS adherence_scopes (
  id BIGSERIAL PRIMARY KEY, matrix_version_id BIGINT NOT NULL REFERENCES adherence_matrix_versions(id) ON DELETE CASCADE,
  name TEXT NOT NULL, order_index INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS adherence_criteria (
  id BIGSERIAL PRIMARY KEY, matrix_version_id BIGINT NOT NULL REFERENCES adherence_matrix_versions(id) ON DELETE CASCADE,
  scope_id BIGINT NOT NULL REFERENCES adherence_scopes(id) ON DELETE CASCADE,
  text TEXT NOT NULL, weight NUMERIC(5,2) NOT NULL CHECK (weight > 0), order_index INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS adherence_thresholds (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  concept TEXT NOT NULL, min_percent NUMERIC(5,2) NOT NULL, order_index INTEGER NOT NULL DEFAULT 0,
  UNIQUE (organization_id, concept)
);
INSERT INTO adherence_thresholds (organization_id, concept, min_percent, order_index)
  SELECT id, unnest(ARRAY['OPTIMO','ACEPTABLE','DEFICIENTE','MUY_DEFICIENTE']), unnest(ARRAY[90,80,70,0]::numeric[]), unnest(ARRAY[0,1,2,3])
  FROM organizations ON CONFLICT (organization_id, concept) DO NOTHING;

CREATE TABLE IF NOT EXISTS adherence_evaluations (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  matrix_version_id BIGINT NOT NULL REFERENCES adherence_matrix_versions(id),
  professional_id BIGINT NOT NULL REFERENCES adherence_professionals(id),
  evaluator_membership_id BIGINT NOT NULL REFERENCES memberships(id),
  service TEXT NOT NULL DEFAULT '', city_site TEXT NOT NULL DEFAULT '',
  professional_status_snapshot TEXT NOT NULL,
  month_reported TEXT NOT NULL, evaluation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_records INTEGER NOT NULL DEFAULT 0, overall_compliance NUMERIC(5,2), concept TEXT,
  general_observations TEXT NOT NULL DEFAULT '', commitments TEXT NOT NULL DEFAULT '',
  improvement_plan_percent NUMERIC(5,2),
  evaluator_signed_name TEXT, evaluator_signed_at TIMESTAMPTZ,
  professional_signed_name TEXT, professional_signed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_id BIGINT NOT NULL REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS adherence_evaluations_scope_idx ON adherence_evaluations(organization_id, professional_id, month_reported);

CREATE TABLE IF NOT EXISTS adherence_evaluation_records (
  id BIGSERIAL PRIMARY KEY, evaluation_id BIGINT NOT NULL REFERENCES adherence_evaluations(id) ON DELETE CASCADE,
  record_number TEXT NOT NULL, observations TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS adherence_evaluation_scores (
  id BIGSERIAL PRIMARY KEY, evaluation_id BIGINT NOT NULL REFERENCES adherence_evaluations(id) ON DELETE CASCADE,
  evaluation_record_id BIGINT NOT NULL REFERENCES adherence_evaluation_records(id) ON DELETE CASCADE,
  criterion_id BIGINT NOT NULL REFERENCES adherence_criteria(id),
  score SMALLINT CHECK (score IN (0,1,2)),
  UNIQUE (evaluation_record_id, criterion_id)
);

CREATE TABLE IF NOT EXISTS adherence_auditor_areas (
  membership_id BIGINT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  area_id BIGINT NOT NULL REFERENCES adherence_areas(id) ON DELETE CASCADE,
  PRIMARY KEY (membership_id, area_id)
);

CREATE TABLE IF NOT EXISTS adherence_plan_evidence (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  evaluation_id BIGINT NOT NULL REFERENCES adherence_evaluations(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes BIGINT NOT NULL,
  storage_key TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', uploaded_by_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS adherence_plan_evidence_eval_idx ON adherence_plan_evidence(evaluation_id);

-- Modulos otorgados a un usuario en concreto (rol USUARIO). Admin/Superadmin no la necesitan.
CREATE TABLE IF NOT EXISTS membership_modules (
  membership_id BIGINT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  module_id BIGINT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (membership_id, module_id)
);

-- Cargo de perfil de cada usuario; mismo catalogo que "Cargo" en Matrices de Adherencia.
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS position_id BIGINT REFERENCES adherence_positions(id) ON DELETE SET NULL;

-- Funcion dentro del modulo para un USUARIO (solo aplica a modulos que la necesitan, ej.
-- adherence-matrix: 'AUDITOR' opera evaluaciones, 'PROFESIONAL' solo ve su propio plan).
ALTER TABLE membership_modules ADD COLUMN IF NOT EXISTS function_key TEXT;

-- Plan de mejora: entidad propia con seguimiento (ya no es solo el texto "commitments" de la evaluacion).
CREATE TABLE IF NOT EXISTS adherence_improvement_plans (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  evaluation_id BIGINT NOT NULL REFERENCES adherence_evaluations(id) ON DELETE CASCADE,
  professional_id BIGINT NOT NULL REFERENCES adherence_professionals(id),
  description TEXT NOT NULL,
  planned_start_date DATE, planned_end_date DATE,
  actual_start_date DATE, actual_end_date DATE,
  status TEXT NOT NULL DEFAULT 'NO_INICIADO' CHECK (status IN ('NO_INICIADO','EN_EJECUCION','TERMINADO')),
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  created_by_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS adherence_improvement_plans_professional_idx ON adherence_improvement_plans(professional_id);

CREATE TABLE IF NOT EXISTS adherence_plan_followups (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id BIGINT NOT NULL REFERENCES adherence_improvement_plans(id) ON DELETE CASCADE,
  author_id BIGINT NOT NULL REFERENCES users(id),
  description TEXT NOT NULL,
  progress_percent INTEGER NOT NULL CHECK (progress_percent BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS adherence_plan_followups_plan_idx ON adherence_plan_followups(plan_id);

CREATE TABLE IF NOT EXISTS adherence_plan_followup_evidence (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  followup_id BIGINT NOT NULL REFERENCES adherence_plan_followups(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes BIGINT NOT NULL,
  storage_key TEXT NOT NULL, uploaded_by_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS adherence_plan_followup_evidence_followup_idx ON adherence_plan_followup_evidence(followup_id);

-- Encuestas: constructor tipo formulario, publicacion con enlace publico estable y analitica.
INSERT INTO modules (key, name, description, route, icon, position, active) VALUES
  ('surveys', 'Encuestas', 'Constructor de encuestas, enlace publico de captacion y analitica de respuestas', '/app/encuestas', 'clipboard-list', 14, TRUE)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, route = EXCLUDED.route,
  icon = EXCLUDED.icon, position = EXCLUDED.position, active = EXCLUDED.active;

INSERT INTO permissions (key, name, description) VALUES
  ('surveys.view', 'Ver encuestas', 'Consultar encuestas, respuestas y resultados'),
  ('surveys.create', 'Crear encuestas', 'Crear nuevas encuestas y duplicar existentes'),
  ('surveys.edit', 'Editar encuestas', 'Construir la estructura, publicar, cerrar y reabrir encuestas'),
  ('surveys.delete', 'Eliminar encuestas', 'Eliminar encuestas y su contenido'),
  ('surveys.export', 'Exportar encuestas', 'Exportar respuestas a Excel/CSV')
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS surveys (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cover_image TEXT,
  audience TEXT NOT NULL DEFAULT 'CLIENTE_EXTERNO' CHECK (audience IN ('CLIENTE_INTERNO', 'CLIENTE_EXTERNO')),
  status TEXT NOT NULL DEFAULT 'BORRADOR' CHECK (status IN ('BORRADOR', 'PUBLICADA', 'CERRADA')),
  allow_multiple_responses BOOLEAN NOT NULL DEFAULT FALSE,
  require_login BOOLEAN NOT NULL DEFAULT FALSE,
  theme_color TEXT NOT NULL DEFAULT '#1F6F4A',
  thank_you_message TEXT NOT NULL DEFAULT 'Gracias por participar. Tu respuesta fue registrada correctamente.',
  opens_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  created_by_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  UNIQUE (organization_id, code)
);
CREATE INDEX IF NOT EXISTS surveys_org_idx ON surveys(organization_id, status);

-- Plantillas reutilizables (fase 4): una encuesta marcada como plantilla no recibe respuestas
-- propias, solo se usa como base para "crear a partir de esta plantilla" (ver /duplicate).
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS surveys_template_idx ON surveys(organization_id, is_template);

-- Evaluaciones de conocimiento (ej. guias clinicas): a diferencia de una encuesta de opinion, aqui
-- si tiene valor formativo mostrarle el puntaje al encuestado al terminar. Default TRUE porque la
-- mayoria de encuestas de opinion no usan preguntas con clave de calificacion (nunca calculan
-- puntaje), asi que el flag no tiene efecto visible para ellas.
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS show_score_to_respondent BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS survey_pages (
  id BIGSERIAL PRIMARY KEY,
  survey_id BIGINT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS survey_pages_survey_idx ON survey_pages(survey_id, order_index);

-- El enum de tipos ya incluye los tipos avanzados de fase 2 (matching, ranking, imagenes, NPS, estrellas,
-- archivo) para no rehacer el modelo de datos; el constructor de la fase 1 solo ofrece los tipos basicos.
CREATE TABLE IF NOT EXISTS survey_questions (
  id BIGSERIAL PRIMARY KEY,
  page_id BIGINT NOT NULL REFERENCES survey_pages(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL CHECK (type IN (
    'SHORT_TEXT', 'LONG_TEXT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'DROPDOWN', 'YES_NO', 'NUMBER', 'DATE',
    'SCALE', 'LIKERT_MATRIX', 'MATCHING', 'RANKING', 'IMAGE_CHOICE', 'EMOJI_SCALE', 'NPS', 'RATING', 'FILE_UPLOAD'
  )),
  prompt TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  logic JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS survey_questions_page_idx ON survey_questions(page_id, order_index);

CREATE TABLE IF NOT EXISTS survey_responses (
  id BIGSERIAL PRIMARY KEY,
  survey_id BIGINT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  respondent_membership_id BIGINT REFERENCES memberships(id) ON DELETE SET NULL,
  month_reported TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'PUBLIC_LINK',
  device_fingerprint TEXT,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS survey_responses_survey_idx ON survey_responses(survey_id, completed, month_reported);

-- El valor tipado vive en "value" (JSON segun el tipo de pregunta); "text_value" es una proyeccion
-- de solo lectura para exportacion/CSV y busqueda, nunca la fuente de verdad.
CREATE TABLE IF NOT EXISTS survey_response_items (
  id BIGSERIAL PRIMARY KEY,
  response_id BIGINT NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  value JSONB NOT NULL,
  text_value TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (response_id, question_id)
);
CREATE INDEX IF NOT EXISTS survey_response_items_question_idx ON survey_response_items(question_id);

-- ============================================================================
-- Huella de Carbono (Ambiental) — Herramienta de Monitoreo del Impacto
-- Climatico (Salud sin Dano + MinSalud, 2023), estandar GHG Protocol (3
-- alcances). Nucleo obligatorio (4 variables) + 8 variables activables por
-- entidad sin necesitar despliegue de codigo nuevo (misma logica de 3
-- condiciones ya usada en el resto de Almera: modulo activo + habilitado por
-- la entidad + asignado — aqui a nivel de BLOQUE, no solo de modulo).
-- ============================================================================
INSERT INTO modules (key, name, description, route, icon, position, active) VALUES
  ('carbon-footprint', 'Huella de Carbono', 'Medicion de emisiones GEI (GHG Protocol), factores de emision configurables y analisis trimestral', '/app/huella-carbono', 'leaf', 15, TRUE)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, route = EXCLUDED.route,
  icon = EXCLUDED.icon, position = EXCLUDED.position, active = EXCLUDED.active;

-- Backfill: las organizaciones ya existentes no reciben modulos nuevos automaticamente (el auto-
-- enable solo corre al CREAR una organizacion, ver db.mjs bootstrap()) — se habilita aqui una sola
-- vez para las que ya existen, igual que se hizo manualmente para modulos anteriores.
INSERT INTO organization_modules (organization_id, module_id, enabled)
SELECT o.id, m.id, TRUE FROM organizations o, modules m WHERE m.key = 'carbon-footprint'
ON CONFLICT DO NOTHING;

INSERT INTO permissions (key, name, description) VALUES
  ('carbon.view', 'Ver huella de carbono', 'Consultar mediciones, dashboard y analisis'),
  ('carbon.capture', 'Capturar mediciones', 'Registrar mediciones de las variables habilitadas'),
  ('carbon.manage', 'Gestionar huella de carbono', 'Configurar variables, factores de emision, responsables y metas'),
  ('carbon.export', 'Exportar huella de carbono', 'Exportar informes PDF')
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Catalogo fijo de variables (4 nucleo + 8 activables) — mismo para todas las entidades, ya que la
-- metodologia GHG Protocol/Salud sin Dano define las mismas categorias para cualquier IPS.
CREATE TABLE IF NOT EXISTS carbon_blocks (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('SCOPE_1', 'SCOPE_2', 'SCOPE_3', 'VARIABLE')),
  is_core BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0
);
INSERT INTO carbon_blocks (key, name, scope, is_core, description, position) VALUES
  ('stationary_combustion', 'Combustión estacionaria', 'SCOPE_1', TRUE, 'Combustible en calderas, plantas eléctricas de respaldo y generadores fijos', 1),
  ('mobile_combustion', 'Combustión móvil', 'SCOPE_1', TRUE, 'Combustible de vehículos propios de la entidad (ambulancias, administrativos)', 2),
  ('electricity', 'Energía eléctrica comprada', 'SCOPE_2', TRUE, 'Consumo de energía eléctrica en kWh', 3),
  ('waste', 'Residuos', 'VARIABLE', TRUE, 'Disposición final, incineración y compostaje, por tipo de tratamiento', 4),
  ('refrigerants', 'Gases refrigerantes y extintores', 'SCOPE_1', FALSE, 'Fugas de gases refrigerantes y agentes extintores', 5),
  ('anesthetic_gases', 'Gases anestésicos y medicinales', 'SCOPE_1', FALSE, 'Óxido nitroso, desflurano y otros gases anestésicos (relevante con quirófanos)', 6),
  ('purchased_heat', 'Calefacción/refrigeración/vapor comprado', 'SCOPE_2', FALSE, 'Poco común en Colombia, baja prioridad', 7),
  ('business_travel', 'Viajes de trabajo del personal', 'SCOPE_3', FALSE, 'Desplazamientos laborales del personal', 8),
  ('commuting', 'Traslados cotidianos del personal', 'SCOPE_3', FALSE, 'Casa-trabajo del personal', 9),
  ('patient_travel', 'Desplazamiento de pacientes/visitantes', 'SCOPE_3', FALSE, 'Transporte de pacientes y visitantes hacia la entidad', 10),
  ('inhalers', 'Inhaladores dispensados', 'SCOPE_3', FALSE, 'Inhaladores de dosis medida dispensados', 11),
  ('supply_chain', 'Cadena de suministro', 'SCOPE_3', FALSE, 'Gasto en compras por categoría', 12)
ON CONFLICT (key) DO NOTHING;

-- Activacion por entidad: cada bloque se habilita/deshabilita independientemente (nucleo viene
-- habilitado por defecto, activables vienen apagados), y opcionalmente se asigna una membresia
-- responsable de capturarlo (ej. mantenimiento captura combustibles, administrativo captura
-- electricidad, gestor ambiental captura residuos).
CREATE TABLE IF NOT EXISTS carbon_organization_blocks (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  block_id BIGINT NOT NULL REFERENCES carbon_blocks(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  responsible_membership_id BIGINT REFERENCES memberships(id) ON DELETE SET NULL,
  UNIQUE (organization_id, block_id)
);
INSERT INTO carbon_organization_blocks (organization_id, block_id, enabled)
SELECT o.id, b.id, b.is_core FROM organizations o, carbon_blocks b
ON CONFLICT DO NOTHING;

-- Factores de emision: dato de referencia GLOBAL (IDEAM/GHG Protocol/UPME-XM), no por entidad — la
-- metodologia es la misma para cualquier IPS colombiana. Editable solo por superadmin. vigente por
-- fecha: un mismo subtipo puede tener varios factores a lo largo del tiempo (ej. el factor electrico
-- del SIN cambia cada año), y el calculo de cada medicion usa el vigente para SU fecha, nunca un
-- valor fijo.
CREATE TABLE IF NOT EXISTS carbon_emission_factors (
  id BIGSERIAL PRIMARY KEY,
  block_key TEXT NOT NULL REFERENCES carbon_blocks(key) ON DELETE CASCADE,
  subtype TEXT NOT NULL,
  subtype_label TEXT NOT NULL,
  value NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE,
  methodology_source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS carbon_emission_factors_lookup_idx ON carbon_emission_factors(block_key, subtype, valid_from);

-- Valores de referencia iniciales (IDEAM/GHG Protocol/UPME-XM) — cargados una sola vez; superadmin
-- puede editar/agregar desde el panel de configuracion sin tocar codigo.
INSERT INTO carbon_emission_factors (block_key, subtype, subtype_label, value, unit, valid_from, methodology_source)
SELECT * FROM (VALUES
  ('stationary_combustion', 'diesel', 'Diésel', 2.68, 'kgCO2e/litro', '2020-01-01'::date, 'GHG Protocol / IDEAM'),
  ('stationary_combustion', 'gas_natural', 'Gas natural', 2.75, 'kgCO2e/m3', '2020-01-01'::date, 'GHG Protocol / IDEAM'),
  ('stationary_combustion', 'glp', 'GLP', 1.55, 'kgCO2e/litro', '2020-01-01'::date, 'GHG Protocol / IDEAM'),
  ('stationary_combustion', 'gasolina', 'Gasolina', 2.31, 'kgCO2e/litro', '2020-01-01'::date, 'GHG Protocol / IDEAM'),
  ('stationary_combustion', 'fuel_oil', 'Fuel oil', 3.15, 'kgCO2e/litro', '2020-01-01'::date, 'GHG Protocol / IDEAM'),
  ('mobile_combustion', 'diesel', 'Diésel', 2.68, 'kgCO2e/litro', '2020-01-01'::date, 'GHG Protocol / IDEAM'),
  ('mobile_combustion', 'gasolina', 'Gasolina', 2.31, 'kgCO2e/litro', '2020-01-01'::date, 'GHG Protocol / IDEAM'),
  ('mobile_combustion', 'gas_natural', 'Gas natural vehicular', 2.75, 'kgCO2e/m3', '2020-01-01'::date, 'GHG Protocol / IDEAM'),
  ('electricity', 'electricidad_sin', 'Electricidad (SIN Colombia)', 164.38, 'gCO2/kWh', '2020-01-01'::date, 'UPME/XM 2020'),
  ('waste', 'relleno_sanitario', 'Disposición final en relleno sanitario', 0.58, 'kgCO2e/kg', '2020-01-01'::date, 'GHG Protocol / IDEAM'),
  ('waste', 'incineracion_ordinaria', 'Incineración — residuos ordinarios', 1.6, 'kgCO2e/kg', '2020-01-01'::date, 'GHG Protocol / IDEAM'),
  ('waste', 'incineracion_mix_clinico', 'Incineración — mix clínico (biosanitarios/cortopunzantes/anatomopatológicos/CRETIR no identificado)', 2.1, 'kgCO2e/kg', '2020-01-01'::date, 'GHG Protocol / IDEAM'),
  ('waste', 'incineracion_peligrosos', 'Incineración — peligrosos (químicos CRETIR conocidos)', 2.8, 'kgCO2e/kg', '2020-01-01'::date, 'GHG Protocol / IDEAM'),
  ('waste', 'compostaje', 'Compostaje', 0.1, 'kgCO2e/kg', '2020-01-01'::date, 'GHG Protocol / IDEAM')
) AS seed(block_key, subtype, subtype_label, value, unit, valid_from, methodology_source)
WHERE NOT EXISTS (SELECT 1 FROM carbon_emission_factors LIMIT 1);

-- Registro historico de mediciones por periodo — nunca se sobrescribe (permite ver evolucion).
-- computed_kgco2e y factor_id quedan fijados al momento de guardar (trazabilidad: con que factor se
-- calculo esa medicion especifica), aunque el factor de referencia cambie despues.
CREATE TABLE IF NOT EXISTS carbon_measurements (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  block_key TEXT NOT NULL REFERENCES carbon_blocks(key),
  period TEXT NOT NULL,
  record_date DATE NOT NULL,
  subtype TEXT,
  quantity NUMERIC NOT NULL,
  quantity_unit TEXT NOT NULL,
  scope_override TEXT CHECK (scope_override IN ('SCOPE_1', 'SCOPE_3')),
  in_situ BOOLEAN NOT NULL DEFAULT FALSE,
  computed_kgco2e NUMERIC,
  factor_id BIGINT REFERENCES carbon_emission_factors(id),
  notes TEXT NOT NULL DEFAULT '',
  recorded_by_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS carbon_measurements_org_idx ON carbon_measurements(organization_id, block_key, period);

CREATE TABLE IF NOT EXISTS carbon_measurement_evidence (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  measurement_id BIGINT NOT NULL REFERENCES carbon_measurements(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_key TEXT NOT NULL,
  uploaded_by_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS carbon_measurement_evidence_measurement_idx ON carbon_measurement_evidence(measurement_id);

-- Metas de reduccion (opcional): año/valor base + año/porcentaje meta, para mostrar avance real vs.
-- meta en el dashboard.
CREATE TABLE IF NOT EXISTS carbon_reduction_targets (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  base_year INTEGER NOT NULL,
  base_value_kgco2e NUMERIC NOT NULL,
  target_year INTEGER NOT NULL,
  target_reduction_percent NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, target_year)
);
