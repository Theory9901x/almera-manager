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

-- Presentacion de apoyo (PPT/PDF) que se ve embebida antes de responder las preguntas de la
-- pagina — pensada para encuestas de evaluacion de guias clinicas. Opcional, una por pagina.
ALTER TABLE survey_pages ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE survey_pages ADD COLUMN IF NOT EXISTS attachment_name TEXT;

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

-- Benchmarks cientificos de referencia (NHS Inglaterra — Lancet Planetary Health, HHS Health Sector
-- Climate Pledge, Global Roadmap Salud sin Dano + Arup 2021) — datos globales, no por entidad,
-- cargados una sola vez para trazabilidad y comparacion. Se usan como referencia de DIRECCION, no
-- como meta exacta esperable en el contexto colombiano (salvedad que se muestra siempre junto al
-- dato en el analisis trimestral).
CREATE TABLE IF NOT EXISTS carbon_benchmarks (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  metric_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  value NUMERIC,
  unit TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  methodology_source TEXT NOT NULL
);
INSERT INTO carbon_benchmarks (source, metric_key, label, value, unit, note, methodology_source) VALUES
  ('NHS', 'nhs_acute_bed_day', 'Atención aguda hospitalaria', 125, 'kg CO2e/día-cama', '', 'NHS England — The Lancet Planetary Health'),
  ('NHS', 'nhs_outpatient_visit', 'Consulta ambulatoria', 76, 'kg CO2e/cita', '', 'NHS England — The Lancet Planetary Health'),
  ('NHS', 'nhs_gp_visit', 'Consulta de medicina general', 66, 'kg CO2e/visita', '', 'NHS England — The Lancet Planetary Health'),
  ('NHS', 'nhs_ambulance_response', 'Respuesta de ambulancia de urgencia', 75, 'kg CO2e/respuesta', '', 'NHS England — The Lancet Planetary Health'),
  ('NHS', 'nhs_elective_stay', 'Estancia hospitalaria electiva completa', 708, 'kg CO2e', '', 'NHS England — The Lancet Planetary Health'),
  ('NHS', 'nhs_per_capita', 'Huella per cápita del sistema', 540, 'kg CO2e/persona/año', 'Referencia de un sistema de salud de altos ingresos — usar como dirección, no como meta exacta esperable en Colombia.', 'NHS England — The Lancet Planetary Health'),
  ('NHS', 'nhs_target', 'Meta oficial NHS', 80, '% reducción vs. 1990 para 2032', 'Net zero (huella directa) para 2045.', 'NHS England Net Zero Plan'),
  ('HHS', 'hhs_target', 'Meta HHS Health Sector Climate Pledge', 50, '% reducción para 2030', 'Cero emisiones netas para 2050, alineado con el Acuerdo de París — meta intermedia más conservadora que la del NHS.', 'HHS Health Sector Climate Pledge'),
  ('GLOBAL_ROADMAP', 'roadmap_no_action', 'Proyección sin acción adicional', 3, 'x (podría triplicarse para 2050)', '7 acciones de mayor impacto: electrificación con energía 100% renovable, infraestructura de cero emisiones, transporte sanitario sostenible, entre otras.', 'Salud sin Daño + Arup, Hoja de Ruta Global para la Descarbonización de la Salud, 2021'),
  ('CASE_STUDY', 'desflurane_equivalence', 'Equivalencia de impacto del desflurano', 886, 'kg CO2e por frasco de 240 ml', 'Equivale a quemar 440 kg de carbón. Un hospital NHS bajó su uso de desflurano de 20% a menos de 2% cambiando de agente anestésico.', 'Salud sin Daño')
ON CONFLICT (metric_key) DO NOTHING;

-- Banco de recomendaciones CURADO por variable/fuente de emision — nunca texto libre generado,
-- siempre con su respaldo citado (clave para que el informe sea creible ante un ente acreditador).
CREATE TABLE IF NOT EXISTS carbon_recommendations (
  id BIGSERIAL PRIMARY KEY,
  block_key TEXT NOT NULL REFERENCES carbon_blocks(key) ON DELETE CASCADE,
  text TEXT NOT NULL,
  source TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
INSERT INTO carbon_recommendations (block_key, text, source, position)
SELECT * FROM (VALUES
  ('electricity', 'Realizar un inventario de equipos de alto consumo eléctrico para priorizar intervenciones.', 'Salud sin Daño — recomendaciones para el sector salud colombiano', 1),
  ('electricity', 'Migrar la iluminación a tecnología LED en las áreas de mayor uso.', 'Salud sin Daño — recomendaciones para el sector salud colombiano', 2),
  ('electricity', 'Instalar sensores de movimiento en zonas de tránsito y baja ocupación.', 'Salud sin Daño — recomendaciones para el sector salud colombiano', 3),
  ('electricity', 'Establecer un programa de mantenimiento preventivo de sistemas HVAC.', 'Salud sin Daño — recomendaciones para el sector salud colombiano', 4),
  ('electricity', 'Evaluar la viabilidad de energía renovable in situ (ej. paneles solares).', 'Salud sin Daño — recomendaciones para el sector salud colombiano', 5),
  ('waste', 'Fortalecer la segregación de residuos en la fuente para reducir el volumen que termina en incineración.', 'Salud sin Daño — recomendaciones para el sector salud colombiano', 1),
  ('waste', 'Explorar alternativas a la incineración para el "mix clínico" (autoclave, microondas, tratamiento físico-químico).', 'Salud sin Daño — recomendaciones para el sector salud colombiano', 2),
  ('waste', 'Implementar o fortalecer programas de compostaje para residuos orgánicos.', 'Salud sin Daño — recomendaciones para el sector salud colombiano', 3),
  ('stationary_combustion', 'Establecer mantenimiento preventivo periódico de calderas y generadores.', 'Salud sin Daño — recomendaciones para el sector salud colombiano', 1),
  ('stationary_combustion', 'Evaluar combustibles alternativos de menor factor de emisión.', 'Salud sin Daño — recomendaciones para el sector salud colombiano', 2),
  ('mobile_combustion', 'Establecer mantenimiento preventivo periódico de la flota vehicular.', 'Salud sin Daño — recomendaciones para el sector salud colombiano', 1),
  ('mobile_combustion', 'Planificar la renovación gradual de la flota hacia vehículos híbridos o eléctricos.', 'Salud sin Daño — recomendaciones para el sector salud colombiano', 2),
  ('anesthetic_gases', 'Evaluar la sustitución de óxido nitroso/desflurano por sevoflurano cuando sea médicamente viable — un solo frasco de 240 ml de desflurano equivale a quemar 440 kg de carbón (886 kg CO2e).', 'Salud sin Daño', 1),
  ('anesthetic_gases', 'Implementar protocolos de anestesia de bajo flujo.', 'Salud sin Daño', 2)
) AS seed(block_key, text, source, position)
WHERE NOT EXISTS (SELECT 1 FROM carbon_recommendations LIMIT 1);

-- Analisis trimestral: se GENERA y queda guardado como registro historico (nunca se regenera y
-- pierde el anterior) — permite ver la evolucion del analisis y si las recomendaciones anteriores
-- se implementaron.
CREATE TABLE IF NOT EXISTS carbon_quarterly_analyses (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  quarter SMALLINT NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  total_kgco2e NUMERIC NOT NULL,
  trend_percent NUMERIC,
  top_block_key TEXT REFERENCES carbon_blocks(key),
  benchmark_comparison JSONB NOT NULL DEFAULT '{}'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_by_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, year, quarter)
);

-- ============================================================================
-- Listas de Chequeo (auditoria por adherencia) — modulo hermano de Encuestas en
-- estructura (constructor + diligenciamiento) y de Matrices de Adherencia en logica
-- (produce un % de adherencia semaforizado). Ver docs/MODULO-LISTAS-DE-CHEQUEO.md.
--
-- El constructor es GENERICO: los formatos institucionales reales no comparten
-- estructura (uno audita pacientes y otro colaboradores, con cabeceras y numeracion
-- distintas), asi que cabecera, atributos del sujeto, dominios y criterios son datos,
-- no codigo. Lo unico fijo es la escala: siempre C / NC / NA.
-- ============================================================================
INSERT INTO modules (key, name, description, route, icon, position, active) VALUES
  ('checklists', 'Listas de Chequeo', 'Auditorias por adherencia: constructor generico de listas, diligenciamiento por servicio e indicador de adherencia semaforizado', '/app/listas-chequeo', 'list-checks', 16, TRUE)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, route = EXCLUDED.route,
  icon = EXCLUDED.icon, position = EXCLUDED.position, active = EXCLUDED.active;

-- Backfill: el auto-enable solo corre al CREAR una organizacion (ver db.mjs bootstrap()),
-- asi que las entidades ya existentes se habilitan aqui una sola vez.
INSERT INTO organization_modules (organization_id, module_id, enabled)
SELECT o.id, m.id, TRUE FROM organizations o, modules m WHERE m.key = 'checklists'
ON CONFLICT DO NOTHING;

INSERT INTO permissions (key, name, description) VALUES
  ('checklists.view', 'Ver listas de chequeo', 'Consultar listas, auditorias y resultados de adherencia'),
  ('checklists.manage', 'Administrar listas de chequeo', 'Crear y editar listas, dominios, criterios y asignaciones'),
  ('checklists.fill', 'Diligenciar listas de chequeo', 'Ejecutar auditorias sobre las listas asignadas'),
  ('checklists.export', 'Exportar listas de chequeo', 'Generar informes PDF individuales y consolidados')
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Catalogo propio de areas/servicios. No se reusa adherence_areas a proposito: alla un
-- "area" posee una matriz versionada y su ciclo de vida es otro; aca es solo el servicio
-- auditado (Urgencias, UCI, Hospitalizacion...).
CREATE TABLE IF NOT EXISTS checklist_areas (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

-- subject_label: que se audita en esta lista ("Paciente", "Colaborador", "Consultorio"...).
-- numbered_items: si los criterios se muestran numerados (FO-26 si, FO-24 no).
CREATE TABLE IF NOT EXISTS checklist_templates (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  area_id BIGINT REFERENCES checklist_areas(id) ON DELETE SET NULL,
  code TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '01',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  subject_label TEXT NOT NULL DEFAULT 'Sujeto auditado',
  numbered_items BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'BORRADOR' CHECK (status IN ('BORRADOR', 'PUBLICADA', 'ARCHIVADA')),
  created_by_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS checklist_templates_org_idx ON checklist_templates(organization_id, status);
-- Evita cargar dos veces la misma lista (en la carpeta de origen GCM-SPA-FO-41 venia
-- duplicado y es el mismo formato). El indice ignora los codigos vacios de un borrador nuevo.
CREATE UNIQUE INDEX IF NOT EXISTS checklist_templates_code_uidx
  ON checklist_templates(organization_id, code, version) WHERE code <> '';

-- Campos de la cabecera (datos generales) y atributos del sujeto auditado: ambos son
-- listas de campos configurables por lista, por eso comparten forma.
CREATE TABLE IF NOT EXISTS checklist_header_fields (
  id BIGSERIAL PRIMARY KEY,
  template_id BIGINT NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'TEXT' CHECK (field_type IN ('TEXT', 'LONG_TEXT', 'DATE', 'NUMBER', 'SELECT')),
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  order_index INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS checklist_header_fields_idx ON checklist_header_fields(template_id, order_index);

CREATE TABLE IF NOT EXISTS checklist_subject_fields (
  id BIGSERIAL PRIMARY KEY,
  template_id BIGINT NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'TEXT' CHECK (field_type IN ('TEXT', 'LONG_TEXT', 'DATE', 'NUMBER', 'SELECT')),
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  order_index INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS checklist_subject_fields_idx ON checklist_subject_fields(template_id, order_index);

CREATE TABLE IF NOT EXISTS checklist_domains (
  id BIGSERIAL PRIMARY KEY,
  template_id BIGINT NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS checklist_domains_idx ON checklist_domains(template_id, order_index);

-- item_number es TEXTO libre, no autogenerado: los formatos reales traen numeraciones con
-- saltos (FO-26 va 11 -> 13) y hay que poder respetarlas tal cual.
-- guidance es el instructivo por criterio ("Marque SI si...; Marque NA si no tiene dispositivos").
CREATE TABLE IF NOT EXISTS checklist_criteria (
  id BIGSERIAL PRIMARY KEY,
  domain_id BIGINT NOT NULL REFERENCES checklist_domains(id) ON DELETE CASCADE,
  item_number TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  guidance TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS checklist_criteria_idx ON checklist_criteria(domain_id, order_index);

-- Que membresia puede diligenciar que lista (fase 2).
CREATE TABLE IF NOT EXISTS checklist_assignments (
  template_id BIGINT NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  membership_id BIGINT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (template_id, membership_id)
);

-- Directorio reutilizable de sujetos auditados: se registran una vez y se traen en auditorias
-- siguientes sin volver a crearlos (requisito explicito). attributes guarda los valores de
-- checklist_subject_fields, que varian por lista.
CREATE TABLE IF NOT EXISTS checklist_subjects (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id BIGINT REFERENCES checklist_templates(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS checklist_subjects_org_idx ON checklist_subjects(organization_id, template_id);

CREATE TABLE IF NOT EXISTS checklist_audits (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id BIGINT NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  area_id BIGINT REFERENCES checklist_areas(id) ON DELETE SET NULL,
  audit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  header_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'BORRADOR' CHECK (status IN ('BORRADOR', 'CERRADA')),
  adherence_percent NUMERIC,
  concept TEXT,
  auditor_id BIGINT NOT NULL REFERENCES users(id),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS checklist_audits_org_idx ON checklist_audits(organization_id, template_id, audit_date DESC);

-- attributes_snapshot: si el sujeto cambia de cargo/cama mas adelante, la auditoria vieja debe
-- seguir mostrando lo que tenia el dia de la ronda.
CREATE TABLE IF NOT EXISTS checklist_audit_subjects (
  id BIGSERIAL PRIMARY KEY,
  audit_id BIGINT NOT NULL REFERENCES checklist_audits(id) ON DELETE CASCADE,
  subject_id BIGINT REFERENCES checklist_subjects(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  attributes_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  order_index INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS checklist_audit_subjects_idx ON checklist_audit_subjects(audit_id, order_index);

-- Escala fija en el CHECK: C / NC / NA, igual para todas las listas. Sin fila = sin responder,
-- que NO es lo mismo que NA (NA es respuesta deliberada; sin responder bloquea el cierre).
CREATE TABLE IF NOT EXISTS checklist_answers (
  id BIGSERIAL PRIMARY KEY,
  audit_id BIGINT NOT NULL REFERENCES checklist_audits(id) ON DELETE CASCADE,
  audit_subject_id BIGINT NOT NULL REFERENCES checklist_audit_subjects(id) ON DELETE CASCADE,
  criterion_id BIGINT NOT NULL REFERENCES checklist_criteria(id) ON DELETE CASCADE,
  value TEXT NOT NULL CHECK (value IN ('C', 'NC', 'NA')),
  observation TEXT NOT NULL DEFAULT '',
  UNIQUE (audit_subject_id, criterion_id)
);
CREATE INDEX IF NOT EXISTS checklist_answers_audit_idx ON checklist_answers(audit_id);

-- Firmas (fase 3): imagen del canvas + persona + fecha, por trazabilidad.
CREATE TABLE IF NOT EXISTS checklist_signatures (
  id BIGSERIAL PRIMARY KEY,
  audit_id BIGINT NOT NULL REFERENCES checklist_audits(id) ON DELETE CASCADE,
  signer_name TEXT NOT NULL,
  signer_role TEXT NOT NULL DEFAULT '',
  signature_image TEXT NOT NULL DEFAULT '',
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS checklist_signatures_idx ON checklist_signatures(audit_id);

-- ---------------------------------------------------------------------------
-- Listas de Chequeo — trazabilidad y resultados persistidos
--
-- El centro de datos filtra por profesional, fecha, servicio, turno, dominio y
-- criterio. Eso exige que la auditoria GUARDE ese contexto, no que se deduzca.
-- Todo idempotente: se aplica en cada arranque.
-- ---------------------------------------------------------------------------

-- Turno: parte del contexto de la ronda y filtro del tablero. Nulo = la lista no lo pide.
ALTER TABLE checklist_audits ADD COLUMN IF NOT EXISTS shift TEXT;

-- Codigo y version CONGELADOS el dia de la ronda. Sin esto, publicar la version 02 de una
-- lista reescribiria la identidad de todas las auditorias hechas con la 01.
ALTER TABLE checklist_audits ADD COLUMN IF NOT EXISTS template_code TEXT NOT NULL DEFAULT '';
ALTER TABLE checklist_audits ADD COLUMN IF NOT EXISTS template_version TEXT NOT NULL DEFAULT '';

-- Quien la toco por ultima vez. `updated_at` sola no sirve para responder "¿quien cambio esto?".
ALTER TABLE checklist_audits ADD COLUMN IF NOT EXISTS updated_by_id BIGINT REFERENCES users(id);

-- Relleno para las auditorias que ya existen.
UPDATE checklist_audits a
   SET template_code = t.code, template_version = t.version
  FROM checklist_templates t
 WHERE t.id = a.template_id AND a.template_code = '';

-- Adherencia por dominio y por sujeto, guardada al cerrar. Se puede recalcular desde las
-- respuestas, pero el tablero agrega sobre miles de filas y recalcular en cada consulta no
-- escala; ademas, un resultado firmado debe quedar tal como se firmo.
CREATE TABLE IF NOT EXISTS checklist_audit_domain_results (
  id BIGSERIAL PRIMARY KEY,
  audit_id BIGINT NOT NULL REFERENCES checklist_audits(id) ON DELETE CASCADE,
  domain_id BIGINT NOT NULL REFERENCES checklist_domains(id) ON DELETE CASCADE,
  c INTEGER NOT NULL DEFAULT 0,
  nc INTEGER NOT NULL DEFAULT 0,
  na INTEGER NOT NULL DEFAULT 0,
  percent NUMERIC,
  UNIQUE (audit_id, domain_id)
);
CREATE INDEX IF NOT EXISTS checklist_audit_domain_results_idx ON checklist_audit_domain_results(audit_id);

CREATE TABLE IF NOT EXISTS checklist_audit_subject_results (
  id BIGSERIAL PRIMARY KEY,
  audit_id BIGINT NOT NULL REFERENCES checklist_audits(id) ON DELETE CASCADE,
  audit_subject_id BIGINT NOT NULL REFERENCES checklist_audit_subjects(id) ON DELETE CASCADE,
  c INTEGER NOT NULL DEFAULT 0,
  nc INTEGER NOT NULL DEFAULT 0,
  na INTEGER NOT NULL DEFAULT 0,
  percent NUMERIC,
  UNIQUE (audit_id, audit_subject_id)
);
CREATE INDEX IF NOT EXISTS checklist_audit_subject_results_idx ON checklist_audit_subject_results(audit_id);

-- Bitacora. Una auditoria firmada que luego se edita o se borra tiene que dejar rastro de
-- quien lo hizo y cuando; es el requisito que convierte esto en un registro de calidad y no
-- en una hoja de calculo compartida.
CREATE TABLE IF NOT EXISTS checklist_audit_log (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  audit_id BIGINT,
  audit_label TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL CHECK (action IN ('CREADA', 'EDITADA', 'CERRADA', 'REABIERTA', 'ELIMINADA')),
  detail TEXT NOT NULL DEFAULT '',
  actor_id BIGINT REFERENCES users(id),
  actor_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- audit_id sin FK a proposito: al BORRAR la auditoria el registro tiene que sobrevivir, que es
-- justo el caso que mas importa auditar.
CREATE INDEX IF NOT EXISTS checklist_audit_log_idx ON checklist_audit_log(organization_id, created_at DESC);

-- Accesos a datos sensibles: consultar el detalle de una auditoria (nombre de paciente,
-- documento, firmas) y descargar su PDF tambien son acciones que hay que poder rastrear, no solo
-- las que modifican. Se amplia el CHECK en vez de recrear la tabla, para no perder el historico.
ALTER TABLE checklist_audit_log DROP CONSTRAINT IF EXISTS checklist_audit_log_action_check;
ALTER TABLE checklist_audit_log ADD CONSTRAINT checklist_audit_log_action_check
  CHECK (action IN ('CREADA', 'EDITADA', 'CERRADA', 'REABIERTA', 'ELIMINADA', 'CONSULTADA', 'DESCARGADA'));

-- El repositorio se ordena y se filtra por fecha: es el eje de la vista.
CREATE INDEX IF NOT EXISTS checklist_audits_repo_idx
  ON checklist_audits(organization_id, audit_date DESC, id DESC);
-- Buscar por nombre de paciente o de colaborador sin recorrer toda la tabla.
CREATE INDEX IF NOT EXISTS checklist_audit_subjects_name_idx
  ON checklist_audit_subjects(lower(display_name));

-- Evidencias de una auditoria: fotos y documentos que respaldan una calificacion.
--
-- El archivo NO se sirve como estatico publico, a diferencia de las presentaciones de encuestas:
-- aqui una foto puede mostrar a un paciente o una historia clinica. Se entrega solo por una ruta
-- autenticada que vuelve a comprobar quien puede ver esa auditoria.
CREATE TABLE IF NOT EXISTS checklist_evidences (
  id BIGSERIAL PRIMARY KEY,
  audit_id BIGINT NOT NULL REFERENCES checklist_audits(id) ON DELETE CASCADE,
  -- Nulos = evidencia general de la ronda; con valor = evidencia de un criterio concreto.
  criterion_id BIGINT REFERENCES checklist_criteria(id) ON DELETE SET NULL,
  audit_subject_id BIGINT REFERENCES checklist_audit_subjects(id) ON DELETE CASCADE,
  stored_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT '',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  uploaded_by_id BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS checklist_evidences_idx ON checklist_evidences(audit_id, created_at);

-- Observaciones generales de la ronda: van en la auditoria, no por criterio (esas ya existen en
-- checklist_answers.observation).
ALTER TABLE checklist_audits ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';

-- ---------------------------------------------------------------------------
-- Programas: a que proceso institucional pertenece cada LISTA.
--
-- No se reutiliza checklist_areas a proposito. Son dos preguntas distintas que se
-- confundirian para siempre si compartieran tabla:
--   programa  -> de que es la lista        (Seguridad del Paciente, ...)
--   area      -> donde se hizo la ronda    (Hospitalizacion, Urgencias, ...)
-- Una misma lista de Seguridad del Paciente se audita en varios servicios; el
-- programa no cambia y el servicio si.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checklist_programs (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS program_id BIGINT
  REFERENCES checklist_programs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS checklist_templates_program_idx ON checklist_templates(organization_id, program_id);

-- Todas las entidades que ya tienen el modulo arrancan con el programa que hoy existe de verdad.
INSERT INTO checklist_programs (organization_id, name, description, order_index)
SELECT o.id, 'Seguridad del Paciente',
       'Formatos GCM-SPA de rondas y practicas seguras', 0
  FROM organizations o
 WHERE EXISTS (SELECT 1 FROM checklist_templates t WHERE t.organization_id = o.id)
ON CONFLICT (organization_id, name) DO NOTHING;

-- Las 13 listas institucionales van a ese programa. Se reconocen por su codigo, que es el que
-- las nombra en el papel; asi el relleno es explicito y no arrastra listas que alguien cree
-- despues para otro proceso.
UPDATE checklist_templates t
   SET program_id = p.id
  FROM checklist_programs p
 WHERE p.organization_id = t.organization_id
   AND p.name = 'Seguridad del Paciente'
   AND t.program_id IS NULL
   AND t.code LIKE 'GCM-SPA-%';

-- Personal de turno de la ronda. Es una LISTA, no un campo de texto: en una ronda puede haber
-- varios turnos o varios profesionales, igual que hay varios pacientes. Guardarlo como texto
-- suelto en la cabecera impedia buscarlo despues.
CREATE TABLE IF NOT EXISTS checklist_audit_staff (
  id BIGSERIAL PRIMARY KEY,
  audit_id BIGINT NOT NULL REFERENCES checklist_audits(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS checklist_audit_staff_idx ON checklist_audit_staff(audit_id, order_index);
CREATE INDEX IF NOT EXISTS checklist_audit_staff_name_idx ON checklist_audit_staff(lower(full_name));

-- ---------------------------------------------------------------------------
-- Servicios por centro de atencion (ESE Salud Yopal).
--
-- El area pasa a tener CENTRO ademas de nombre: "Urgencias" existe en varias sedes y sin el
-- centro el filtro del tablero las mezcla. La clave unica pasa a ser (organizacion, centro,
-- nombre) para que se pueda repetir el mismo servicio en sedes distintas.
-- ---------------------------------------------------------------------------
ALTER TABLE checklist_areas ADD COLUMN IF NOT EXISTS center TEXT NOT NULL DEFAULT '';
ALTER TABLE checklist_areas DROP CONSTRAINT IF EXISTS checklist_areas_organization_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS checklist_areas_unq
  ON checklist_areas(organization_id, center, name);

-- Siembra por defecto, para no tener que parametrizar nada antes de auditar.
-- HOCY lleva la oferta completa; los demas centros, el nucleo ambulatorio.
INSERT INTO checklist_areas (organization_id, center, name)
SELECT o.id, c.center, c.name
  FROM organizations o
  CROSS JOIN (VALUES
    ('Hospital Central de Yopal (HOCY)', 'Urgencias'),
    ('Hospital Central de Yopal (HOCY)', 'Hospitalización'),
    ('Hospital Central de Yopal (HOCY)', 'Consulta externa'),
    ('Hospital Central de Yopal (HOCY)', 'Atención de partos y obstétrica'),
    ('Hospital Central de Yopal (HOCY)', 'Medicina general'),
    ('Hospital Central de Yopal (HOCY)', 'Enfermería'),
    ('Hospital Central de Yopal (HOCY)', 'Odontología general'),
    ('Hospital Central de Yopal (HOCY)', 'Ginecobstetricia'),
    ('Hospital Central de Yopal (HOCY)', 'Laboratorio clínico'),
    ('Hospital Central de Yopal (HOCY)', 'Toma de muestras de laboratorio'),
    ('Hospital Central de Yopal (HOCY)', 'Radiología e imágenes diagnósticas'),
    ('Hospital Central de Yopal (HOCY)', 'Ultrasonido'),
    ('Hospital Central de Yopal (HOCY)', 'Servicio farmacéutico'),
    ('Hospital Central de Yopal (HOCY)', 'Esterilización'),
    ('Hospital Central de Yopal (HOCY)', 'Vacunación'),
    ('Hospital Central de Yopal (HOCY)', 'Tamización de cáncer de cuello uterino'),
    ('Hospital Central de Yopal (HOCY)', 'Planificación familiar'),
    ('Hospital Central de Yopal (HOCY)', 'Atención preventiva en salud bucal'),
    ('Hospital Central de Yopal (HOCY)', 'Detección temprana — crecimiento y desarrollo'),
    ('Hospital Central de Yopal (HOCY)', 'Detección temprana — joven'),
    ('Hospital Central de Yopal (HOCY)', 'Detección temprana — embarazo'),
    ('Hospital Central de Yopal (HOCY)', 'Detección temprana — adulto'),
    ('Hospital Central de Yopal (HOCY)', 'Detección temprana — cáncer de cuello uterino y mama'),
    ('Hospital Central de Yopal (HOCY)', 'Detección temprana — agudeza visual'),
    ('Juan Luis Londoño', 'Consulta externa'),
    ('Juan Luis Londoño', 'Medicina general'),
    ('Juan Luis Londoño', 'Enfermería'),
    ('Juan Luis Londoño', 'Odontología general'),
    ('Juan Luis Londoño', 'Toma de muestras de laboratorio'),
    ('Juan Luis Londoño', 'Vacunación'),
    ('Juan Luis Londoño', 'Planificación familiar'),
    ('Juan Luis Londoño', 'Atención preventiva en salud bucal'),
    ('Comuna VI', 'Consulta externa'),
    ('Comuna VI', 'Medicina general'),
    ('Comuna VI', 'Enfermería'),
    ('Comuna VI', 'Odontología general'),
    ('Comuna VI', 'Toma de muestras de laboratorio'),
    ('Comuna VI', 'Vacunación'),
    ('Comuna VI', 'Planificación familiar'),
    ('Comuna VI', 'Atención preventiva en salud bucal'),
    ('Cre Ser con Amor', 'Consulta externa'),
    ('Cre Ser con Amor', 'Medicina general'),
    ('Cre Ser con Amor', 'Enfermería'),
    ('Cre Ser con Amor', 'Odontología general'),
    ('Cre Ser con Amor', 'Vacunación'),
    ('Cre Ser con Amor', 'Planificación familiar'),
    ('Cre Ser con Amor', 'Atención preventiva en salud bucal')
  ) AS c(center, name)
 WHERE EXISTS (SELECT 1 FROM organization_modules om JOIN modules m ON m.id = om.module_id
                WHERE om.organization_id = o.id AND m.key = 'checklists')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Planes de mejora (Listas de Chequeo).
--
-- Un criterio marcado NC deja de morir en el informe: se convierte en un plan con
-- responsable, evidencia de subsanacion y cierre verificado por calidad. Tres reglas
-- no negociables (docs/MODULO-LISTAS-DE-CHEQUEO.md §15.1):
--   1. El sujeto auditado es TEXTO, no un usuario. Para que el colaborador entre al
--      sistema se enlaza el sujeto del directorio con una membresia (opcional: un
--      paciente nunca sera usuario, un colaborador si).
--   2. Permiso propio (checklists.improve): el colaborador ve SOLO sus planes, sin
--      recibir fill ni acceso a rondas ajenas.
--   3. Quien subsana no puede ser quien cierra: el colaborador sube evidencia y marca
--      SUBSANADO; calidad revisa y cierra. Lo valida el servidor, no la interfaz.
-- ---------------------------------------------------------------------------
INSERT INTO permissions (key, name, description) VALUES
  ('checklists.improve', 'Subsanar planes de mejora', 'Ver los planes de mejora propios, subir evidencia de subsanacion y marcarlos como subsanados')
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Enlace sujeto del directorio -> usuario del sistema. Nulo = sujeto sin cuenta (pacientes).
ALTER TABLE checklist_subjects ADD COLUMN IF NOT EXISTS membership_id BIGINT
  REFERENCES memberships(id) ON DELETE SET NULL;

-- El plan guarda SNAPSHOT del criterio, dominio y sujeto: si la lista cambia de version o el
-- criterio se desactiva, el plan tiene que seguir diciendo que se incumplio y con quien.
CREATE TABLE IF NOT EXISTS checklist_action_plans (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  audit_id BIGINT NOT NULL REFERENCES checklist_audits(id) ON DELETE CASCADE,
  criterion_id BIGINT REFERENCES checklist_criteria(id) ON DELETE SET NULL,
  audit_subject_id BIGINT REFERENCES checklist_audit_subjects(id) ON DELETE SET NULL,
  criterion_text TEXT NOT NULL DEFAULT '',
  domain_name TEXT NOT NULL DEFAULT '',
  item_number TEXT NOT NULL DEFAULT '',
  subject_name TEXT NOT NULL DEFAULT '',
  finding TEXT NOT NULL DEFAULT '',
  assigned_membership_id BIGINT REFERENCES memberships(id) ON DELETE SET NULL,
  assigned_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ABIERTO' CHECK (status IN ('ABIERTO', 'EN_PROCESO', 'SUBSANADO', 'CERRADO')),
  resolution_note TEXT NOT NULL DEFAULT '',
  resolved_by_id BIGINT REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  closing_note TEXT NOT NULL DEFAULT '',
  closed_by_id BIGINT REFERENCES users(id),
  closed_at TIMESTAMPTZ,
  created_by_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS checklist_action_plans_org_idx
  ON checklist_action_plans(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS checklist_action_plans_assigned_idx
  ON checklist_action_plans(assigned_membership_id, status);
CREATE INDEX IF NOT EXISTS checklist_action_plans_audit_idx
  ON checklist_action_plans(audit_id);

-- Evidencias de subsanacion. Igual que las de ronda: NUNCA como estatico publico, solo por la
-- ruta autenticada que revalida quien puede ver ese plan.
CREATE TABLE IF NOT EXISTS checklist_action_evidences (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES checklist_action_plans(id) ON DELETE CASCADE,
  stored_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT '',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  uploaded_by_id BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS checklist_action_evidences_idx
  ON checklist_action_evidences(plan_id, created_at);

-- Bitacora del circuito: quien asigno, quien subio evidencia, quien devolvio y quien cerro.
-- plan_id sin FK a proposito: el rastro sobrevive al borrado del plan.
CREATE TABLE IF NOT EXISTS checklist_action_log (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id BIGINT,
  plan_label TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL CHECK (action IN ('CREADO', 'EDITADO', 'REASIGNADO', 'EVIDENCIA', 'SUBSANADO', 'DEVUELTO', 'CERRADO', 'ELIMINADO')),
  detail TEXT NOT NULL DEFAULT '',
  actor_id BIGINT REFERENCES users(id),
  actor_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS checklist_action_log_idx
  ON checklist_action_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS checklist_action_log_plan_idx
  ON checklist_action_log(plan_id, created_at);

-- ---------------------------------------------------------------------------
-- Planes de mejora v2 (decision del usuario, 27/07/2026):
-- al marcar NC se pregunta "¿Requiere plan de mejora?"; si la respuesta es si,
-- el plan se crea con NOMBRE, FECHA, descripcion y responsable, se notifica al
-- responsable, queda PENDIENTE hasta que suba su evidencia, y el CIERRE lo hace
-- el auditor (o calidad) — nunca quien subsano. Cada plan se identifica por su
-- codigo PM-<id> y el modulo permite buscarlo por fecha, persona auditada,
-- servicio, sede y lista.
-- ---------------------------------------------------------------------------
ALTER TABLE checklist_action_plans ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
ALTER TABLE checklist_action_plans ADD COLUMN IF NOT EXISTS due_date DATE;

-- Notificaciones internas del circuito: al responsable cuando le asignan o le
-- devuelven un plan, y al auditor cuando el responsable lo marca subsanado.
-- Van por USUARIO (no por membresia): es la persona la que debe enterarse.
CREATE TABLE IF NOT EXISTS checklist_notifications (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id BIGINT,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS checklist_notifications_idx
  ON checklist_notifications(user_id, read, created_at DESC);

-- ---------------------------------------------------------------------------
-- Firmas de la evaluacion de adherencia: nombre, CEDULA, CARGO e IMAGEN.
--
-- Antes solo se guardaba el nombre escrito a maquina, que no acredita nada. La firma se captura
-- en lienzo tactil (tablet) o se adjunta como imagen, y va acompanada de los datos con los que
-- se identifica a quien firma — que es lo que pide el formato institucional.
--
-- La imagen se guarda como data URL en la fila, igual que en Listas de Chequeo: pesa ~8 KB y
-- viaja con la evaluacion a su informe PDF sin depender de un archivo suelto en disco que el
-- proximo despliegue podria dejar atras.
-- ---------------------------------------------------------------------------
ALTER TABLE adherence_evaluations ADD COLUMN IF NOT EXISTS evaluator_document TEXT NOT NULL DEFAULT '';
ALTER TABLE adherence_evaluations ADD COLUMN IF NOT EXISTS evaluator_position TEXT NOT NULL DEFAULT '';
ALTER TABLE adherence_evaluations ADD COLUMN IF NOT EXISTS evaluator_signature TEXT NOT NULL DEFAULT '';
ALTER TABLE adherence_evaluations ADD COLUMN IF NOT EXISTS professional_document TEXT NOT NULL DEFAULT '';
ALTER TABLE adherence_evaluations ADD COLUMN IF NOT EXISTS professional_position TEXT NOT NULL DEFAULT '';
ALTER TABLE adherence_evaluations ADD COLUMN IF NOT EXISTS professional_signature TEXT NOT NULL DEFAULT '';

-- ---------------------------------------------------------------------------
-- Compromisos del profesional: UNA FILA POR ACTIVIDAD, no un campo de texto.
--
-- Antes los compromisos eran un TEXT libre en la evaluacion. Con eso no hay seguimiento
-- posible: no se puede decir cual de los tres compromisos se cumplio, ni buscarlo, ni
-- referenciarlo en una visita. Cada actividad es una variable propia, se agrega y se quita
-- por separado, y responde el profesional auditado.
--
-- `code` es columna GENERADA a partir del id: el identificador no puede desincronizarse de la
-- fila ni repetirse, y no hace falta una segunda sentencia para asignarlo.
-- `order_index` es la enumeracion que se ve e imprime (1, 2, 3...); el codigo es para buscar.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS adherence_commitments (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  evaluation_id BIGINT NOT NULL REFERENCES adherence_evaluations(id) ON DELETE CASCADE,
  professional_id BIGINT NOT NULL REFERENCES adherence_professionals(id),
  code TEXT GENERATED ALWAYS AS ('CMP-' || lpad(id::text, 6, '0')) STORED,
  order_index INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'PENDIENTE'
    CHECK (status IN ('PENDIENTE','EN_PROCESO','CUMPLIDO','INCUMPLIDO')),
  status_note TEXT NOT NULL DEFAULT '',
  status_changed_at TIMESTAMPTZ,
  status_changed_by_id BIGINT REFERENCES users(id),
  created_by_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS adherence_commitments_eval_idx
  ON adherence_commitments(evaluation_id, order_index);
CREATE INDEX IF NOT EXISTS adherence_commitments_professional_idx
  ON adherence_commitments(professional_id, status);

-- Backfill del texto libre que ya existe: cada linea no vacia pasa a ser una actividad, para
-- que ninguna evaluacion cerrada pierda lo que su profesional se comprometio a hacer. Corre una
-- sola vez por evaluacion (la condicion NOT EXISTS lo hace idempotente); el TEXT original se
-- conserva y deja de escribirse.
INSERT INTO adherence_commitments (organization_id, evaluation_id, professional_id, order_index, description, created_by_id)
SELECT e.organization_id, e.id, e.professional_id,
       linea.order_index,
       btrim(linea.texto),
       e.created_by_id
FROM adherence_evaluations e
CROSS JOIN LATERAL unnest(string_to_array(e.commitments, E'\n')) WITH ORDINALITY AS linea(texto, order_index)
WHERE btrim(linea.texto) <> ''
  AND NOT EXISTS (SELECT 1 FROM adherence_commitments c WHERE c.evaluation_id = e.id);

-- `status_changed_by_id` dice QUIEN movio el estado por ultima vez: es informativo, no
-- procedencia. Con la referencia por defecto, borrar un usuario fallaba porque una actividad
-- suya lo referenciaba. Se anula en su lugar: la actividad y su estado siguen siendo validos
-- aunque quien lo marco ya no exista.
ALTER TABLE adherence_commitments DROP CONSTRAINT IF EXISTS adherence_commitments_status_changed_by_id_fkey;
ALTER TABLE adherence_commitments ADD CONSTRAINT adherence_commitments_status_changed_by_id_fkey
  FOREIGN KEY (status_changed_by_id) REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================================
-- Radicados: correspondencia y radicacion institucional. Reemplaza el Excel al
-- que la entidad volvio tras perder su sistema anterior — el fallo que no se
-- puede repetir es el consecutivo duplicado o con huecos bajo uso concurrente.
--
-- Dos pilares no negociables:
-- 1) El consecutivo se genera con un UPSERT ATOMICO sobre radicado_counters
--    (ultimo_consecutivo = ultimo_consecutivo + 1 RETURNING, ver
--    server/routes/radicados.mjs), NUNCA leyendo el maximo actual en el codigo
--    de la app: eso es exactamente la condicion de carrera que producia
--    numeros repetidos en el Excel. INSERT ... ON CONFLICT DO UPDATE toma el
--    lock de fila del UPSERT sin necesitar un SELECT ... FOR UPDATE aparte.
-- 2) Un radicado, una vez generado, NO SE EDITA NI SE ELIMINA. Un error se
--    corrige con una ANULACION (motivo + quien + cuando) sin liberar el
--    numero: el consecutivo sigue avanzando y el hueco queda documentado.
--
-- Formato confirmado con el usuario: AAAA-TIPO-NNNNNN (2026-INT-000001), el
-- contador se reinicia cada 1 de enero y es independiente por tipo (Interno
-- vs Externo). "direccion" (Recibido/Enviado) es un dato de Externo que NO
-- participa del numero ni del contador, solo de la consulta.
-- ============================================================================
INSERT INTO modules (key, name, description, route, icon, position, active) VALUES
  ('radicados', 'Radicados', 'Correspondencia y radicacion institucional: consecutivo atomico por tipo y ano, con trazabilidad completa', '/app/radicados', 'inbox', 17, TRUE)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, route = EXCLUDED.route,
  icon = EXCLUDED.icon, position = EXCLUDED.position, active = EXCLUDED.active;

INSERT INTO organization_modules (organization_id, module_id, enabled)
SELECT o.id, m.id, TRUE FROM organizations o, modules m WHERE m.key = 'radicados'
ON CONFLICT DO NOTHING;

INSERT INTO permissions (key, name, description) VALUES
  ('radicados.view', 'Ver radicados', 'Consultar la base de radicados, sus adjuntos y su trazabilidad'),
  ('radicados.create', 'Generar radicados', 'Emitir nuevos numeros de radicado'),
  ('radicados.void', 'Anular radicados', 'Anular un radicado dejando motivo, sin reutilizar su numero'),
  ('radicados.manage', 'Administrar radicados', 'Configurar los catalogos de tipo, categoria y medio')
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Catalogos administrables. "codigo" de radicado_tipos es lo que aparece en el numero
-- (2026-INT-000001); categorias y medios son solo de consulta/filtro.
CREATE TABLE IF NOT EXISTS radicado_tipos (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  codigo TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, codigo)
);
CREATE TABLE IF NOT EXISTS radicado_categorias (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, nombre)
);
CREATE TABLE IF NOT EXISTS radicado_medios (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, nombre)
);

-- Contador atomico: una fila por (entidad, tipo, ano). Dos radicaciones concurrentes del mismo
-- tipo/ano SIEMPRE se serializan sobre esta fila: la segunda transaccion espera a que la
-- primera confirme antes de poder leer/incrementar. Es la UNICA escritura capaz de producir un
-- numero.
CREATE TABLE IF NOT EXISTS radicado_counters (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tipo_id BIGINT NOT NULL REFERENCES radicado_tipos(id),
  anio INTEGER NOT NULL,
  ultimo_consecutivo INTEGER NOT NULL DEFAULT 0,
  UNIQUE (organization_id, tipo_id, anio)
);

-- El radicado: INMUTABLE una vez creado. La app nunca hace UPDATE de negocio sobre esta tabla,
-- salvo el cambio de estado a ANULADO (que no toca ningun otro campo). numero_radicado se arma
-- en el servidor a partir del contador atomico, nunca a partir de MAX(id) ni de un conteo.
CREATE TABLE IF NOT EXISTS radicados (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  numero_radicado TEXT NOT NULL,
  tipo_id BIGINT NOT NULL REFERENCES radicado_tipos(id),
  -- Solo aplica a Externo (Recibido/Enviado); Interno queda NULL. No participa del numero.
  direccion TEXT CHECK (direccion IN ('RECIBIDO', 'ENVIADO')),
  categoria_id BIGINT NOT NULL REFERENCES radicado_categorias(id),
  medio_id BIGINT NOT NULL REFERENCES radicado_medios(id),
  process_id BIGINT REFERENCES institutional_processes(id),
  objeto TEXT NOT NULL,
  remitente TEXT NOT NULL DEFAULT '',
  destinatario TEXT NOT NULL DEFAULT '',
  anio INTEGER NOT NULL,
  consecutivo INTEGER NOT NULL,
  fecha_radicado TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_documento DATE,
  estado TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'ANULADO')),
  created_by_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, numero_radicado),
  UNIQUE (organization_id, tipo_id, anio, consecutivo)
);
CREATE INDEX IF NOT EXISTS radicados_org_fecha_idx ON radicados(organization_id, fecha_radicado DESC);
CREATE INDEX IF NOT EXISTS radicados_org_estado_idx ON radicados(organization_id, estado);
CREATE INDEX IF NOT EXISTS radicados_numero_idx ON radicados(organization_id, numero_radicado);

-- Anulacion: NO libera el numero (el contador no se toca al anular). Un radicado anulado se
-- queda en la base para siempre junto con el motivo — es evidencia de que el numero SI se
-- genero y solo quedo invalidado, no de que nunca existio.
CREATE TABLE IF NOT EXISTS radicado_anulaciones (
  id BIGSERIAL PRIMARY KEY,
  radicado_id BIGINT NOT NULL REFERENCES radicados(id) ON DELETE CASCADE,
  motivo TEXT NOT NULL,
  anulado_by_id BIGINT NOT NULL REFERENCES users(id),
  anulado_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Adjuntos: solo se agregan. Sin endpoint de borrado a proposito — misma inmutabilidad que el
-- radicado, y evita que "se me subio el archivo equivocado" borre evidencia de que se subio.
CREATE TABLE IF NOT EXISTS radicado_adjuntos (
  id BIGSERIAL PRIMARY KEY,
  radicado_id BIGINT NOT NULL REFERENCES radicados(id) ON DELETE CASCADE,
  stored_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  uploaded_by_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS radicado_adjuntos_radicado_idx ON radicado_adjuntos(radicado_id);

-- Log de auditoria INMUTABLE: la app nunca hace UPDATE ni DELETE sobre esta tabla.
CREATE TABLE IF NOT EXISTS radicado_auditoria (
  id BIGSERIAL PRIMARY KEY,
  radicado_id BIGINT NOT NULL REFERENCES radicados(id) ON DELETE CASCADE,
  accion TEXT NOT NULL CHECK (accion IN ('CREADO', 'ANULADO', 'ADJUNTO_SUBIDO')),
  detalle TEXT NOT NULL DEFAULT '',
  actor_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS radicado_auditoria_radicado_idx ON radicado_auditoria(radicado_id, created_at);

-- Backfill de catalogos base para las entidades que ya existen (el auto-enable de arriba solo
-- siembra el modulo/permiso; el catalogo de cada entidad se siembra aqui, idempotente por el
-- UNIQUE de codigo/nombre). Cada entidad puede editar nombres y agregar los suyos despues.
INSERT INTO radicado_tipos (organization_id, nombre, codigo, order_index)
SELECT o.id, v.nombre, v.codigo, v.order_index
FROM organizations o CROSS JOIN (VALUES ('Interno', 'INT', 1), ('Externo', 'EXT', 2)) AS v(nombre, codigo, order_index)
ON CONFLICT (organization_id, codigo) DO NOTHING;

INSERT INTO radicado_categorias (organization_id, nombre, order_index)
SELECT o.id, v.nombre, v.order_index
FROM organizations o
CROSS JOIN (VALUES ('Oficio', 1), ('Memorando', 2), ('Solicitud', 3), ('PQRSF', 4), ('Circular', 5)) AS v(nombre, order_index)
ON CONFLICT (organization_id, nombre) DO NOTHING;

INSERT INTO radicado_medios (organization_id, nombre, order_index)
SELECT o.id, v.nombre, v.order_index
FROM organizations o
CROSS JOIN (VALUES ('Fisico', 1), ('Correo electronico', 2), ('Ventanilla', 3), ('Pagina web', 4)) AS v(nombre, order_index)
ON CONFLICT (organization_id, nombre) DO NOTHING;

-- Eliminacion (soft-delete), EXCLUSIVA de superadmin y DISTINTA de la anulacion: anular invalida
-- un numero ya generado sin ocultarlo (el error queda a la vista, con su motivo); eliminar lo
-- saca de las vistas normales para casos como datos de prueba o duplicados por error de captura,
-- pero sigue en la base y en la auditoria — nunca un DELETE real, porque eso si perderia la
-- trazabilidad. El contador tampoco se toca aqui: eliminar, igual que anular, no libera el numero.
ALTER TABLE radicados ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE radicados ADD COLUMN IF NOT EXISTS deleted_by_id BIGINT REFERENCES users(id);
ALTER TABLE radicados ADD COLUMN IF NOT EXISTS deleted_reason TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS radicados_not_deleted_idx ON radicados(organization_id, fecha_radicado DESC) WHERE deleted_at IS NULL;

ALTER TABLE radicado_auditoria DROP CONSTRAINT IF EXISTS radicado_auditoria_accion_check;
ALTER TABLE radicado_auditoria ADD CONSTRAINT radicado_auditoria_accion_check
  CHECK (accion IN ('CREADO', 'ANULADO', 'ADJUNTO_SUBIDO', 'ELIMINADO'));

-- Migracion del Excel historico ("RADICADOS DE COMUNICACIONES EXTERNAS Y INTERNAS"):
-- - subproceso: "SUBPROCESO (QUIEN ELABORA)" del Excel — el area que redacta, distinto de
--   remitente (que hasta ahora no se usaba en ese archivo) y de destinatario.
-- - proceso_detalle: cuando el proceso institucional "no aplica" (boton en el formulario), aqui
--   se escribe a mano a quien se dirige en su lugar. process_id se queda NULL en ese caso.
ALTER TABLE radicados ADD COLUMN IF NOT EXISTS subproceso TEXT NOT NULL DEFAULT '';
ALTER TABLE radicados ADD COLUMN IF NOT EXISTS proceso_detalle TEXT NOT NULL DEFAULT '';

-- Medio "No registrado": el Excel historico no distinguia medio de recepcion/envio. Es honesto
-- dejarlo explicito en vez de inventar un Fisico/Correo que nadie confirmo.
INSERT INTO radicado_medios (organization_id, nombre, order_index)
SELECT o.id, 'No registrado', 99 FROM organizations o
ON CONFLICT (organization_id, nombre) DO NOTHING;

-- Categorias adicionales encontradas en el Excel historico (mas las de su pestana de
-- desplegable que no llegaron a usarse), sumadas a las 5 que ya existian.
INSERT INTO radicado_categorias (organization_id, nombre, order_index)
SELECT o.id, v.nombre, v.order_index
FROM organizations o
CROSS JOIN (VALUES
  ('Asistencia', 10), ('Capacitación', 11), ('Certificado', 12), ('Cobro Prejurídico', 13),
  ('Comunicación', 14), ('Cotización', 15), ('Información', 16), ('Informe', 17),
  ('Notificación', 18), ('Otro', 19), ('Poder', 20), ('Requerimiento', 21), ('Respuesta', 22),
  ('Socialización', 23), ('Denuncia', 24), ('Solicitud de permiso', 25), ('Factura', 26)
) AS v(nombre, order_index)
ON CONFLICT (organization_id, nombre) DO NOTHING;

-- ============================================================================
-- Huella de Carbono v2 — reconstruccion completa a partir de la herramienta de
-- referencia "Herramienta de monitoreo del impacto climatico para establecimientos
-- de salud" (Salud sin Dano/GGHH, V3.3). Alcance ESTRICTO: solo 3 fuentes se miden
-- y sumian al total — Combustion estacionaria, Combustion movil (Alcance 1) y
-- Energia electrica comprada (Alcance 2). El resto de categorias del Excel de
-- referencia (fugitivas/refrigerantes, gases anestesicos, vapor comprado, residuos,
-- Alcance 3 completo) estan marcadas alli como "No estimada" o "No ocurre" y NUNCA
-- deben aparecer ni calcularse aqui. El modulo viejo (carbon_blocks/
-- carbon_measurements/carbon_emission_factors mas arriba) se deja intacto sin
-- migrar: su modelo de una sola cantidad+factor no puede reconstruir el desglose
-- CO2/CH4/N2O que exige el metodo IPCC Tier 1 usado abajo, migrarlo con perdida de
-- precision seria peor que dejarlo como dato historico inerte.
--
-- Motor de calculo (ver shared/carbonScoring.mjs, que este schema solo alimenta de
-- datos): Energia[MJ] = cantidad x densidad[kg/unidad] x poder_calorifico[MJ/kg];
-- gas[kg] = Energia[MJ] x factor[g/MJ] / 1000; CO2e = CO2 + CH4xGWP_CH4 + N2OxGWP_N2O.
-- Verificado a mano contra el caso de la hoja "Paso 3" del Excel de referencia:
-- gas natural 5561 m3 -> 10511,275 kgCO2e (exacto a 3 decimales).
-- ============================================================================

-- Potencial de calentamiento global (IPCC AR4, horizonte 100 anios) — el MISMO
-- horizonte que usa el Excel de referencia (su hoja "Referencias" #5/#28 lo cita
-- explicitamente). No se toca por el usuario: cambiar de version de IPCC alteraria
-- retroactivamente calculos ya firmados en un informe.
CREATE TABLE IF NOT EXISTS carbon_gwp (
  gas_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  gwp_value NUMERIC NOT NULL,
  ar_version TEXT NOT NULL,
  source TEXT NOT NULL
);
INSERT INTO carbon_gwp (gas_key, label, gwp_value, ar_version, source) VALUES
  ('CO2', 'Dioxido de carbono', 1, 'AR4', 'IPCC Cuarto Informe de Evaluacion, Tabla 2.14 (horizonte 100 anios)'),
  ('CH4', 'Metano', 25, 'AR4', 'IPCC Cuarto Informe de Evaluacion, Tabla 2.14 (horizonte 100 anios)'),
  ('N2O', 'Oxido nitroso', 298, 'AR4', 'IPCC Cuarto Informe de Evaluacion, Tabla 2.14 (horizonte 100 anios)')
ON CONFLICT (gas_key) DO NOTHING;

-- Catalogo de combustibles: densidad, poder calorifico y factores de emision
-- CO2/CH4/N2O separados por tipo de combustion (estacionaria vs movil, distintos
-- porque el motor de un vehiculo quema distinto que una caldera). Valores
-- extraidos literalmente de la hoja "Listas" del Excel de referencia. NULL en un
-- factor movil significa que ese combustible no aplica a combustion movil (ej.
-- fuel oil, kerosene, carbon, lena no se usan en vehiculos en esta metodologia).
-- applicable_stationary/applicable_mobile controlan que aparece en cada
-- desplegable del formulario — replican EXACTAMENTE las listas de las secciones
-- 1.1 y 1.2 del Excel, no una union de "todo lo que tenga factor".
CREATE TABLE IF NOT EXISTS carbon_fuel_types (
  id BIGSERIAL PRIMARY KEY,
  fuel_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  native_unit TEXT NOT NULL,
  applicable_stationary BOOLEAN NOT NULL DEFAULT FALSE,
  applicable_mobile BOOLEAN NOT NULL DEFAULT FALSE,
  is_biofuel BOOLEAN NOT NULL DEFAULT FALSE,
  density_kg_per_unit NUMERIC,
  heating_value_mj_per_kg NUMERIC NOT NULL,
  fe_stationary_co2_g_mj NUMERIC,
  fe_stationary_ch4_g_mj NUMERIC,
  fe_stationary_n2o_g_mj NUMERIC,
  fe_mobile_co2_g_mj NUMERIC,
  fe_mobile_ch4_g_mj NUMERIC,
  fe_mobile_n2o_g_mj NUMERIC,
  factor_source TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  position INTEGER NOT NULL DEFAULT 0
);
INSERT INTO carbon_fuel_types (fuel_key, label, native_unit, applicable_stationary, applicable_mobile, is_biofuel, density_kg_per_unit, heating_value_mj_per_kg, fe_stationary_co2_g_mj, fe_stationary_ch4_g_mj, fe_stationary_n2o_g_mj, fe_mobile_co2_g_mj, fe_mobile_ch4_g_mj, fe_mobile_n2o_g_mj, factor_source, position) VALUES
  ('gas_natural', 'Gas natural', 'm3', TRUE, TRUE, FALSE, 0.7, 48, 56.1, 0.005, 0.0001, 56.1, 0.092, 0.003, 'IPCC 2006 Guidelines Vol.2 — GHG Protocol Emission Factors Compilation', 1),
  ('glp', 'GLP', 'kg', TRUE, FALSE, FALSE, 0.54, 47.3, 63.1, 0.005, 0.0001, 63.1, 0.062, 0.0002, 'IPCC 2006 Guidelines Vol.2 — GHG Protocol Emission Factors Compilation', 2),
  ('gasolina', 'Gasolina/Nafta', 'litro', TRUE, TRUE, FALSE, 0.74, 44.3, 69.3, 0.01, 0.0006, 69.3, 0.033, 0.0032, 'IPCC 2006 Guidelines Vol.2 — GHG Protocol Emission Factors Compilation', 3),
  ('diesel', 'Diesel', 'litro', TRUE, TRUE, FALSE, 0.84, 43, 74.1, 0.01, 0.0006, 74.1, 0.0039, 0.0039, 'IPCC 2006 Guidelines Vol.2 — GHG Protocol Emission Factors Compilation', 4),
  ('fuel_oil', 'Fuel oil/Bunker', 'litro', TRUE, FALSE, FALSE, 0.94, 40.4, 77.4, 0.01, 0.0006, NULL, NULL, NULL, 'IPCC 2006 Guidelines Vol.2', 5),
  ('kerosene', 'Kerosene', 'litro', TRUE, FALSE, FALSE, 0.8, 43.8, 71.9, 0.01, 0.0006, NULL, NULL, NULL, 'IPCC 2006 Guidelines Vol.2', 6),
  ('carbon', 'Carbon', 'kg', TRUE, FALSE, FALSE, NULL, 25.8, 94.6, 0.001, 0.0015, NULL, NULL, NULL, 'IPCC 2006 Guidelines Vol.2', 7),
  ('lena', 'Lena', 'kg', TRUE, FALSE, TRUE, NULL, 15.6, 0, 0.3, 0.004, NULL, NULL, NULL, 'IPCC 2006 Guidelines Vol.2 — CO2 biogenico se contabiliza como neutral (cero)', 8),
  ('biodiesel', 'Biodiesel', 'litro', TRUE, TRUE, TRUE, 0.88, 27, 0, 0.01, 0.0006, 0, 0.0039, 0.0039, 'IPCC 2006 Guidelines Vol.2 — CO2 biogenico se contabiliza como neutral (cero)', 9),
  ('bioetanol', 'Biogasolina/Bioetanol', 'litro', FALSE, TRUE, TRUE, 0.792, 27, 0, 0.01, 0.0006, 0, 0.033, 0.0032, 'IPCC 2006 Guidelines Vol.2 — CO2 biogenico se contabiliza como neutral (cero)', 10)
ON CONFLICT (fuel_key) DO NOTHING;

-- Factor de emision de la red electrica, versionado por region — el factor del SIN
-- colombiano cambia cada tanto (UPME lo recalcula), por eso vigencia con
-- valid_from/valid_to en vez de un valor fijo. 0.130 kgCO2e/kWh reproduce el caso
-- de prueba del Excel de referencia (1.063.999,71 kWh -> 138.319,962 kgCO2e).
CREATE TABLE IF NOT EXISTS carbon_electricity_factors (
  id BIGSERIAL PRIMARY KEY,
  region TEXT NOT NULL DEFAULT 'CO',
  label TEXT NOT NULL,
  value_kgco2e_per_kwh NUMERIC NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS carbon_electricity_factors_region_idx ON carbon_electricity_factors(region, valid_from);
INSERT INTO carbon_electricity_factors (region, label, value_kgco2e_per_kwh, valid_from, source)
SELECT 'CO', 'Colombia — Sistema Interconectado Nacional (SIN)', 0.130, '2018-01-01',
  'UPME/XM — Documento de calculo del FE del SIN 2018 (rev. dic. 2019)'
WHERE NOT EXISTS (SELECT 1 FROM carbon_electricity_factors WHERE region = 'CO');

-- Corte obligatorio de biocombustibles, versionado por region — la herramienta
-- divide automaticamente la cantidad de combustible fosil ingresada segun este
-- porcentaje (no se pide al usuario que calcule la mezcla a mano).
CREATE TABLE IF NOT EXISTS carbon_biofuel_blends (
  id BIGSERIAL PRIMARY KEY,
  region TEXT NOT NULL DEFAULT 'CO',
  biodiesel_percent NUMERIC NOT NULL,
  bioethanol_percent NUMERIC NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS carbon_biofuel_blends_region_idx ON carbon_biofuel_blends(region, valid_from);
INSERT INTO carbon_biofuel_blends (region, biodiesel_percent, bioethanol_percent, valid_from, source)
SELECT 'CO', 10, 10, '2018-01-01', 'IICA — Los biocombustibles liquidos en las Americas (2020)'
WHERE NOT EXISTS (SELECT 1 FROM carbon_biofuel_blends WHERE region = 'CO');

-- Perfil institucional / configuracion del inventario, versionado por vigencia
-- (un mismo establecimiento puede reportar años distintos con datos distintos:
-- empleados, camas, superficie cambian). Los datos climaticos/financieros viven
-- aqui y NUNCA se mezclan visualmente en los formularios de registro — solo se
-- usan donde la formula realmente los necesita (indicadores de intensidad).
CREATE TABLE IF NOT EXISTS carbon_profiles (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vigencia_year INTEGER NOT NULL,
  establishment_name TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  start_year INTEGER,
  establishment_type TEXT NOT NULL DEFAULT '',
  organizational_boundary TEXT NOT NULL DEFAULT '',
  temp_min_c NUMERIC,
  temp_max_c NUMERIC,
  humidity_winter_percent NUMERIC,
  humidity_summer_percent NUMERIC,
  fulltime_employees INTEGER,
  patients_per_year INTEGER,
  avg_occupied_beds INTEGER,
  built_area_m2 NUMERIC,
  hours_per_day NUMERIC,
  currency TEXT NOT NULL DEFAULT 'COP',
  usd_exchange_rate NUMERIC,
  updated_by_id BIGINT REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, vigencia_year)
);
-- Perfil por defecto 2025, con los valores institucionales reales entregados por
-- la entidad (editables desde Configuracion despues) — asi el modulo no arranca
-- con el indicador de intensidad vacio.
INSERT INTO carbon_profiles (organization_id, vigencia_year, establishment_name, department, city, address, start_year, establishment_type, organizational_boundary, temp_min_c, temp_max_c, humidity_winter_percent, humidity_summer_percent, fulltime_employees, patients_per_year, avg_occupied_beds, built_area_m2, hours_per_day, currency, usd_exchange_rate)
SELECT o.id, 2025, 'Hospital Central de Yopal', 'Casanare', 'Yopal', 'Carrera 14a 33-76', 2006, 'Hospital de baja complejidad', 'La estimacion se realiza para la Sede de HCY', 22, 32, 85, 60, 250, 600000, 600, 200, 24, 'COP', 3200
FROM organizations o
WHERE NOT EXISTS (SELECT 1 FROM carbon_profiles cp WHERE cp.organization_id = o.id AND cp.vigencia_year = 2025);

-- Catalogos ligeros por entidad, para reutilizar equipo/vehiculo/medidor entre
-- registros (el registro tambien puede escribir un nombre libre si no esta aun
-- en el catalogo — el catalogo es una ayuda de captura, no una restriccion dura).
CREATE TABLE IF NOT EXISTS carbon_equipment (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  area TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  internal_code TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS carbon_vehicles (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plate TEXT NOT NULL,
  vehicle_type TEXT NOT NULL DEFAULT '',
  ownership TEXT NOT NULL DEFAULT 'PROPIO' CHECK (ownership IN ('PROPIO', 'CONTROL_OPERACIONAL')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, plate)
);
CREATE TABLE IF NOT EXISTS carbon_electricity_meters (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);

-- Registros de actividad por fuente. Tres tablas (no una polimorfica) porque los
-- campos difieren demasiado (mezcla de biocombustibles solo en movil, medidor y
-- facturacion solo en electricidad) — forzarlos a una sola tabla generica
-- terminaria en columnas NULL por todas partes, el mismo problema que tenia el
-- modelo viejo de carbon_measurements y que esta reconstruccion buscaba resolver.
-- previous_snapshot: al editar un registro VALIDADO, ahi queda la fila completa
-- de ANTES del cambio y el estado vuelve a PENDIENTE — nunca se pisa en silencio
-- un dato que ya habia sido revisado.
CREATE TABLE IF NOT EXISTS carbon_stationary_records (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  record_date DATE NOT NULL,
  period_year INTEGER NOT NULL, period_month INTEGER NOT NULL, period_quarter INTEGER NOT NULL, period_semester INTEGER NOT NULL,
  area TEXT NOT NULL DEFAULT '',
  equipment_id BIGINT REFERENCES carbon_equipment(id) ON DELETE SET NULL,
  equipment_label TEXT NOT NULL DEFAULT '',
  internal_code TEXT NOT NULL DEFAULT '',
  fuel_key TEXT NOT NULL REFERENCES carbon_fuel_types(fuel_key),
  quantity NUMERIC NOT NULL CHECK (quantity >= 0),
  quantity_unit TEXT NOT NULL,
  invoice_number TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  invoice_value NUMERIC,
  responsible_name TEXT NOT NULL DEFAULT '',
  information_source TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('BORRADOR', 'PENDIENTE', 'VALIDADO', 'RECHAZADO', 'PERIODO_CERRADO')),
  rejection_reason TEXT NOT NULL DEFAULT '',
  energy_mj NUMERIC NOT NULL DEFAULT 0,
  co2_kg NUMERIC NOT NULL DEFAULT 0, ch4_kg NUMERIC NOT NULL DEFAULT 0, n2o_kg NUMERIC NOT NULL DEFAULT 0, co2e_kg NUMERIC NOT NULL DEFAULT 0,
  factor_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  previous_snapshot JSONB,
  created_by_id BIGINT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_id BIGINT REFERENCES users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS carbon_stationary_org_period_idx ON carbon_stationary_records(organization_id, period_year, period_month) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS carbon_mobile_records (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  record_date DATE NOT NULL,
  period_year INTEGER NOT NULL, period_month INTEGER NOT NULL, period_quarter INTEGER NOT NULL, period_semester INTEGER NOT NULL,
  vehicle_id BIGINT REFERENCES carbon_vehicles(id) ON DELETE SET NULL,
  plate TEXT NOT NULL DEFAULT '',
  vehicle_type TEXT NOT NULL DEFAULT '',
  ownership TEXT NOT NULL DEFAULT 'PROPIO' CHECK (ownership IN ('PROPIO', 'CONTROL_OPERACIONAL')),
  fuel_key TEXT NOT NULL REFERENCES carbon_fuel_types(fuel_key),
  input_method TEXT NOT NULL CHECK (input_method IN ('CANTIDAD', 'RENDIMIENTO')),
  quantity NUMERIC CHECK (quantity IS NULL OR quantity >= 0),
  quantity_unit TEXT,
  km_traveled NUMERIC,
  specific_consumption NUMERIC,
  biodiesel_blend_percent NUMERIC,
  bioethanol_blend_percent NUMERIC,
  invoice_number TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  responsible_name TEXT NOT NULL DEFAULT '',
  information_source TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('BORRADOR', 'PENDIENTE', 'VALIDADO', 'RECHAZADO', 'PERIODO_CERRADO')),
  rejection_reason TEXT NOT NULL DEFAULT '',
  fossil_quantity_l NUMERIC NOT NULL DEFAULT 0,
  biogenic_quantity_l NUMERIC NOT NULL DEFAULT 0,
  energy_mj NUMERIC NOT NULL DEFAULT 0,
  co2_kg NUMERIC NOT NULL DEFAULT 0, ch4_kg NUMERIC NOT NULL DEFAULT 0, n2o_kg NUMERIC NOT NULL DEFAULT 0, co2e_kg NUMERIC NOT NULL DEFAULT 0,
  factor_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  previous_snapshot JSONB,
  created_by_id BIGINT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_id BIGINT REFERENCES users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS carbon_mobile_org_period_idx ON carbon_mobile_records(organization_id, period_year, period_month) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS carbon_electricity_records (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  meter_id BIGINT REFERENCES carbon_electricity_meters(id) ON DELETE SET NULL,
  meter_code TEXT NOT NULL DEFAULT '',
  billing_start DATE NOT NULL,
  billing_end DATE NOT NULL,
  period_year INTEGER NOT NULL, period_month INTEGER NOT NULL, period_quarter INTEGER NOT NULL, period_semester INTEGER NOT NULL,
  invoice_number TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  account_number TEXT NOT NULL DEFAULT '',
  kwh NUMERIC NOT NULL CHECK (kwh >= 0),
  invoice_value NUMERIC,
  responsible_name TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('BORRADOR', 'PENDIENTE', 'VALIDADO', 'RECHAZADO', 'PERIODO_CERRADO')),
  rejection_reason TEXT NOT NULL DEFAULT '',
  co2e_kg NUMERIC NOT NULL DEFAULT 0,
  factor_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  previous_snapshot JSONB,
  created_by_id BIGINT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_id BIGINT REFERENCES users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS carbon_electricity_org_period_idx ON carbon_electricity_records(organization_id, period_year, period_month) WHERE deleted_at IS NULL;

-- Evidencia de los 3 tipos de registro en una sola tabla (record_type + record_id):
-- a diferencia de los registros mismos, la evidencia SI es identica en estructura
-- para las 3 fuentes (archivo + metadatos), no hay campos que dividir.
CREATE TABLE IF NOT EXISTS carbon_activity_evidence (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('STATIONARY', 'MOBILE', 'ELECTRICITY')),
  record_id BIGINT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_key TEXT NOT NULL,
  uploaded_by_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS carbon_activity_evidence_idx ON carbon_activity_evidence(record_type, record_id);

-- Snapshot del indicador institucional, guardado cuando se genera un informe (asi
-- el informe siempre puede mostrar el mismo numero que se firmo, aunque despues
-- se agreguen o corrijan registros de ese periodo). El indicador EN VIVO (para el
-- dashboard/vista Indicador) se calcula al vuelo desde los registros validados —
-- nunca se captura a mano, por eso no hay columna alguna para escribirlo.
CREATE TABLE IF NOT EXISTS carbon_indicator_snapshots (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  periodicity TEXT NOT NULL CHECK (periodicity IN ('MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL')),
  period_key TEXT NOT NULL,
  numerator_kgco2e NUMERIC NOT NULL,
  result_value NUMERIC NOT NULL,
  unit TEXT NOT NULL DEFAULT 'tCO2e',
  target_value NUMERIC,
  baseline_value NUMERIC,
  variation_percent NUMERIC,
  compliance_status TEXT,
  is_provisional BOOLEAN NOT NULL DEFAULT FALSE,
  analysis_text TEXT NOT NULL DEFAULT '',
  generated_by_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, periodicity, period_key)
);

-- ============================================================================
-- Indicadores Ambientales — MODULO PROPIO E INDEPENDIENTE (no es parte de
-- Huella de Carbono: entra corregido tras el pedido explicito del usuario de
-- separarlo en su propia pestaña del sidebar). No mide emisiones GEI, mide
-- EFICIENCIA/PROPORCIONALIDAD de consumo de energia y agua frente al volumen
-- de atenciones. Dos indicadores fijos (ENERGY/WATER), nunca mas — por eso no
-- hay tabla de "definiciones de indicador", es una constante compartida (ver
-- shared/environmentalScoring.mjs).
--
-- Motor (shared/environmentalScoring.mjs): intensidad = consumo/atenciones*1000
-- (por cada 1000 atenciones); consumo esperado = intensidad_base*atenciones/1000;
-- indice proporcional = consumo real/consumo esperado*100; ahorro normalizado =
-- (esperado-real)/esperado*100. Los periodos acumulados (trimestre/semestre/
-- año) SUMAN consumo y atenciones antes de dividir — nunca promedian el % de
-- meses individuales, error clasico que distorsiona el resultado cuando los
-- meses tienen volumenes de atencion distintos.
-- ============================================================================
INSERT INTO modules (key, name, description, route, icon, position, active) VALUES
  ('environmental-indicators', 'Indicadores Ambientales', 'Eficiencia de consumo de energia y agua ajustada por atenciones, con linea base, metas y alertas de datos atipicos', '/app/indicadores-ambientales', 'droplets', 18, TRUE)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, route = EXCLUDED.route,
  icon = EXCLUDED.icon, position = EXCLUDED.position, active = EXCLUDED.active;

-- Backfill: las organizaciones ya existentes no reciben modulos nuevos automaticamente (el auto-
-- enable solo corre al CREAR una organizacion) — se habilita aqui una sola vez.
INSERT INTO organization_modules (organization_id, module_id, enabled)
SELECT o.id, m.id, TRUE FROM organizations o, modules m WHERE m.key = 'environmental-indicators'
ON CONFLICT DO NOTHING;

INSERT INTO permissions (key, name, description) VALUES
  ('environmental.view', 'Ver indicadores ambientales', 'Consultar dashboard, indicadores, lineas base e historial'),
  ('environmental.capture', 'Capturar consumos', 'Registrar consumos de energia y agua'),
  ('environmental.manage', 'Gestionar indicadores ambientales', 'Configurar sedes, lineas base y metas; validar/rechazar registros'),
  ('environmental.export', 'Exportar indicadores ambientales', 'Exportar informes PDF')
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Sedes/centros de atencion — catalogo ligero por entidad (HCY es la primera,
-- pero la estructura ya soporta mas de una sede sin cambios).
CREATE TABLE IF NOT EXISTS env_facilities (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);
INSERT INTO env_facilities (organization_id, code, name)
SELECT o.id, 'HCY', 'Hospital Central de Yopal' FROM organizations o
ON CONFLICT (organization_id, code) DO NOTHING;

-- Lineas base institucionales, versionadas por vigencia — solo cubren las
-- opciones "linea base anual" y "promedio movil" (la opcion "mismo periodo
-- año anterior" NO se guarda aqui: se deriva en caliente de un registro real
-- ya validado de ese mismo mes el año anterior, ver resolveBaseline() en el
-- motor). intensity_base ya viene expresada "por cada 1000 atenciones", para
-- no repetir la conversion en cada calculo.
CREATE TABLE IF NOT EXISTS env_baselines (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  facility_id BIGINT NOT NULL REFERENCES env_facilities(id) ON DELETE CASCADE,
  indicator_type TEXT NOT NULL CHECK (indicator_type IN ('ENERGY', 'WATER')),
  source_type TEXT NOT NULL CHECK (source_type IN ('LINEA_BASE_ANUAL', 'PROMEDIO_MOVIL_12M')),
  base_year INTEGER NOT NULL,
  intensity_base NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE,
  observations TEXT NOT NULL DEFAULT '',
  responsible_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'VALIDADA' CHECK (status IN ('BORRADOR', 'VALIDADA')),
  created_by_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS env_baselines_lookup_idx ON env_baselines(organization_id, facility_id, indicator_type, valid_from);

CREATE TABLE IF NOT EXISTS env_targets (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  facility_id BIGINT NOT NULL REFERENCES env_facilities(id) ON DELETE CASCADE,
  indicator_type TEXT NOT NULL CHECK (indicator_type IN ('ENERGY', 'WATER')),
  target_year INTEGER NOT NULL,
  target_proportional_percent NUMERIC NOT NULL DEFAULT 100,
  tolerance_percent NUMERIC NOT NULL DEFAULT 5,
  valid_from DATE NOT NULL,
  valid_to DATE,
  observations TEXT NOT NULL DEFAULT '',
  responsible_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'VALIDADA' CHECK (status IN ('BORRADOR', 'VALIDADA')),
  created_by_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS env_targets_lookup_idx ON env_targets(organization_id, facility_id, indicator_type, valid_from);

-- Registro de consumo — energia y agua en la MISMA tabla (a diferencia de
-- Huella de Carbono v2, aqui los campos SI son practicamente identicos entre
-- las dos fuentes: lectura de medidor, factura, atenciones — separarla en dos
-- tablas solo duplicaria columnas). indicator_type distingue cual es.
-- is_outlier + outlier_reason: la deteccion de atipicos NUNCA borra ni bloquea
-- el dato, solo lo marca — el registro sigue siendo editable y validable.
CREATE TABLE IF NOT EXISTS env_consumption_records (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  facility_id BIGINT NOT NULL REFERENCES env_facilities(id) ON DELETE CASCADE,
  indicator_type TEXT NOT NULL CHECK (indicator_type IN ('ENERGY', 'WATER')),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  quarter INTEGER NOT NULL,
  semester INTEGER NOT NULL,
  reading_start DATE,
  reading_end DATE NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  invoice_number TEXT NOT NULL DEFAULT '',
  meter_code TEXT NOT NULL DEFAULT '',
  meter_reading_start NUMERIC,
  meter_reading_end NUMERIC,
  consumption_value NUMERIC NOT NULL CHECK (consumption_value >= 0),
  consumption_unit TEXT NOT NULL,
  invoice_value NUMERIC,
  attention_count INTEGER NOT NULL CHECK (attention_count > 0),
  responsible_name TEXT NOT NULL DEFAULT '',
  information_source TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('BORRADOR', 'PENDIENTE', 'VALIDADO', 'RECHAZADO', 'PERIODO_CERRADO')),
  rejection_reason TEXT NOT NULL DEFAULT '',
  is_outlier BOOLEAN NOT NULL DEFAULT FALSE,
  outlier_reason TEXT NOT NULL DEFAULT '',
  -- Calculados y guardados al momento del registro (trazabilidad: con que
  -- linea base se calculo, aunque la linea base cambie despues).
  intensity_value NUMERIC,
  baseline_intensity NUMERIC,
  baseline_source TEXT,
  expected_consumption NUMERIC,
  proportional_index NUMERIC,
  normalized_saving NUMERIC,
  previous_snapshot JSONB,
  created_by_id BIGINT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_id BIGINT REFERENCES users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (organization_id, facility_id, indicator_type, year, month)
);
CREATE INDEX IF NOT EXISTS env_consumption_org_period_idx ON env_consumption_records(organization_id, facility_id, indicator_type, year, month) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS env_evidence (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  record_id BIGINT NOT NULL REFERENCES env_consumption_records(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_key TEXT NOT NULL,
  uploaded_by_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS env_evidence_record_idx ON env_evidence(record_id);

-- Snapshot del indicador (igual patron que carbon_indicator_snapshots): se
-- guarda al generar un informe, para que el PDF firmado no cambie si despues
-- se agregan o corrigen registros de ese mismo periodo.
CREATE TABLE IF NOT EXISTS env_indicator_snapshots (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  facility_id BIGINT NOT NULL REFERENCES env_facilities(id) ON DELETE CASCADE,
  indicator_type TEXT NOT NULL CHECK (indicator_type IN ('ENERGY', 'WATER')),
  periodicity TEXT NOT NULL CHECK (periodicity IN ('MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL')),
  period_key TEXT NOT NULL,
  consumption_total NUMERIC NOT NULL,
  attention_total INTEGER NOT NULL,
  intensity_value NUMERIC,
  expected_consumption NUMERIC,
  proportional_index NUMERIC,
  normalized_saving NUMERIC,
  is_provisional BOOLEAN NOT NULL DEFAULT FALSE,
  analysis_text TEXT NOT NULL DEFAULT '',
  generated_by_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, facility_id, indicator_type, periodicity, period_key)
);

-- ---- Datos de demostracion (HCY, 2025, enero-mayo) — los mismos numeros que
-- entrego la entidad. Se siembran UNA sola vez (guardados por el UNIQUE de
-- periodo) para que el submodulo no arranque vacio; is_outlier/outlier_reason
-- se calculan aqui mismo con la misma regla que usa el motor (desviacion >50%
-- frente a la mediana de los otros meses del lote), para no duplicar logica
-- de deteccion en SQL: los valores ya vienen resueltos a mano porque el lote
-- de siembra es fijo y conocido. ----
DO $$
DECLARE
  org RECORD;
  v_facility_id BIGINT;
  admin_id BIGINT;
BEGIN
  FOR org IN SELECT id FROM organizations LOOP
    SELECT id INTO v_facility_id FROM env_facilities WHERE organization_id = org.id AND code = 'HCY';
    SELECT u.id INTO admin_id FROM users u JOIN memberships m ON m.user_id = u.id WHERE m.organization_id = org.id ORDER BY u.id LIMIT 1;
    IF v_facility_id IS NOT NULL AND admin_id IS NOT NULL THEN
      -- Linea base institucional anual 2025 (promedio de los meses NO atipicos del propio lote de
      -- siembra) — punto de partida editable desde Lineas base y metas.
      INSERT INTO env_baselines (organization_id, facility_id, indicator_type, source_type, base_year, intensity_base, unit, valid_from, observations, responsible_name, created_by_id)
      SELECT org.id, v_facility_id, 'ENERGY', 'LINEA_BASE_ANUAL', 2025, 1188.1, 'kWh/1000 atenciones', '2025-01-01',
        'Linea base inicial estimada a partir del promedio de enero-mayo 2025 (siembra de demostracion).', 'Gestion Ambiental', admin_id
      WHERE NOT EXISTS (SELECT 1 FROM env_baselines WHERE organization_id = org.id AND facility_id = v_facility_id AND indicator_type = 'ENERGY');

      INSERT INTO env_baselines (organization_id, facility_id, indicator_type, source_type, base_year, intensity_base, unit, valid_from, observations, responsible_name, created_by_id)
      SELECT org.id, v_facility_id, 'WATER', 'LINEA_BASE_ANUAL', 2025, 1.98, 'm3/1000 atenciones', '2025-01-01',
        'Linea base inicial estimada a partir de los meses sin dato atipico (ene/mar/abr 2025, siembra de demostracion).', 'Gestion Ambiental', admin_id
      WHERE NOT EXISTS (SELECT 1 FROM env_baselines WHERE organization_id = org.id AND facility_id = v_facility_id AND indicator_type = 'WATER');

      INSERT INTO env_targets (organization_id, facility_id, indicator_type, target_year, target_proportional_percent, tolerance_percent, valid_from, responsible_name, created_by_id)
      SELECT org.id, v_facility_id, 'ENERGY', 2025, 100, 5, '2025-01-01', 'Gestion Ambiental', admin_id
      WHERE NOT EXISTS (SELECT 1 FROM env_targets WHERE organization_id = org.id AND facility_id = v_facility_id AND indicator_type = 'ENERGY');

      INSERT INTO env_targets (organization_id, facility_id, indicator_type, target_year, target_proportional_percent, tolerance_percent, valid_from, responsible_name, created_by_id)
      SELECT org.id, v_facility_id, 'WATER', 2025, 100, 5, '2025-01-01', 'Gestion Ambiental', admin_id
      WHERE NOT EXISTS (SELECT 1 FROM env_targets WHERE organization_id = org.id AND facility_id = v_facility_id AND indicator_type = 'WATER');

      -- Consumos de energia (ninguno atipico en este lote). intensity/expected/proportional/saving
      -- ya resueltos a mano con la linea base 1188,1 kWh/1000 atenciones de arriba — la misma
      -- formula que aplica shared/environmentalScoring.mjs para cualquier registro nuevo.
      INSERT INTO env_consumption_records (organization_id, facility_id, indicator_type, year, month, quarter, semester, reading_end, consumption_value, consumption_unit, attention_count, status, information_source, notes, intensity_value, baseline_intensity, baseline_source, expected_consumption, proportional_index, normalized_saving, created_by_id)
      SELECT org.id, v_facility_id, 'ENERGY', 2025, m.month, ((m.month - 1) / 3) + 1, CASE WHEN m.month <= 6 THEN 1 ELSE 2 END,
        (DATE '2025-01-01' + (m.month || ' months - 1 day')::interval)::date, m.consumption, 'kWh', m.attentions, 'VALIDADO', 'Factura de energia (siembra de demostracion)', '',
        m.intensity, 1188.1, 'LINEA_BASE_ANUAL', m.expected, m.proportional, m.saving, admin_id
      FROM (VALUES
        (1, 72793.34, 76481, 951.783, 90867.076, 80.110, 19.890),
        (2, 80533.24, 82344, 978.010, 97832.906, 82.317, 17.683),
        (3, 99277.38, 60664, 1636.512, 72074.898, 137.742, -37.742),
        (4, 88954.19, 72401, 1228.632, 86019.628, 103.412, -3.412),
        (5, 86254.90, 60111, 1434.927, 71417.879, 120.775, -20.775)
      ) AS m(month, consumption, attentions, intensity, expected, proportional, saving)
      WHERE NOT EXISTS (SELECT 1 FROM env_consumption_records WHERE organization_id = org.id AND facility_id = v_facility_id AND indicator_type = 'ENERGY' AND year = 2025 AND month = m.month);

      -- Consumos de agua (febrero y mayo marcados atipicos: desviacion >50% frente a la mediana de
      -- los otros 4 meses del lote, misma regla que aplica el motor en caliente para datos nuevos)
      INSERT INTO env_consumption_records (organization_id, facility_id, indicator_type, year, month, quarter, semester, reading_end, consumption_value, consumption_unit, attention_count, status, is_outlier, outlier_reason, information_source, notes, intensity_value, baseline_intensity, baseline_source, expected_consumption, proportional_index, normalized_saving, created_by_id)
      SELECT org.id, v_facility_id, 'WATER', 2025, m.month, ((m.month - 1) / 3) + 1, CASE WHEN m.month <= 6 THEN 1 ELSE 2 END,
        (DATE '2025-01-01' + (m.month || ' months - 1 day')::interval)::date, m.consumption, 'm3', m.attentions, 'VALIDADO', m.outlier,
        CASE WHEN m.outlier THEN 'Dato atipico pendiente de validacion: se desvia mas del 50% frente a la mediana de los demas meses del periodo' ELSE '' END,
        'Factura de acueducto (siembra de demostracion)', '',
        m.intensity, 1.98, 'LINEA_BASE_ANUAL', m.expected, m.proportional, m.saving, admin_id
      FROM (VALUES
        (1, 175, 76481, FALSE, 2.288, 151.432, 115.563, -15.563),
        (2, 7, 82344, TRUE, 0.085, 163.041, 4.293, 95.707),
        (3, 112, 60664, FALSE, 1.846, 120.115, 93.244, 6.756),
        (4, 131, 72401, FALSE, 1.809, 143.354, 91.382, 8.618),
        (5, 1014, 60111, TRUE, 16.869, 119.020, 851.959, -751.959)
      ) AS m(month, consumption, attentions, outlier, intensity, expected, proportional, saving)
      WHERE NOT EXISTS (SELECT 1 FROM env_consumption_records WHERE organization_id = org.id AND facility_id = v_facility_id AND indicator_type = 'WATER' AND year = 2025 AND month = m.month);
    END IF;
  END LOOP;
END $$;
