-- SGIMR - modelo objetivo para Asistencias Tecnicas y Auditorias Internas
-- Convencion del repositorio: nombres fisicos en ingles y organization_id en toda tabla transaccional.
-- Requiere las tablas de Fase 1: organizations, users, memberships, modules, permissions.

BEGIN;

-- Catalogo institucional fijo por entidad (equivale a `procesos`).
CREATE TABLE institutional_processes (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('ESTRATEGICO','MISIONAL','APOYO','EVALUACION_CONTROL')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code),
  UNIQUE (organization_id, id)
);

-- Catalogo de modulos de ALMERA; no confundir con el catalogo de modulos funcionales SGIMR.
CREATE TABLE almera_catalog_modules (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code),
  UNIQUE (organization_id, id)
);

-- Modulo 1: registro principal (equivale a `asistencias_tecnicas`).
CREATE TABLE technical_assistances (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  process_id BIGINT NOT NULL REFERENCES institutional_processes(id),
  almera_module_id BIGINT NOT NULL REFERENCES almera_catalog_modules(id),
  subject TEXT NOT NULL,
  request_description TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  commitment_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  lifecycle_status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (lifecycle_status IN ('PENDIENTE','EN_CURSO','COMPLETADA','CANCELADA')),
  completion_percent SMALLINT NOT NULL DEFAULT 0 CHECK (completion_percent BETWEEN 0 AND 100),
  responsible_membership_id BIGINT REFERENCES memberships(id),
  final_solution TEXT,
  created_by_id BIGINT NOT NULL REFERENCES users(id),
  updated_by_id BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (organization_id, code),
  CHECK ((lifecycle_status='COMPLETADA' AND completion_percent=100 AND closed_at IS NOT NULL) OR lifecycle_status<>'COMPLETADA')
);

-- Bitacora funcional: comentarios, trabajo realizado y cambios de avance.
CREATE TABLE assistance_actions (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assistance_id BIGINT NOT NULL REFERENCES technical_assistances(id) ON DELETE CASCADE,
  performed_by_id BIGINT NOT NULL REFERENCES users(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  description TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT '',
  completion_percent SMALLINT NOT NULL CHECK (completion_percent BETWEEN 0 AND 100),
  new_commitment_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE assistance_evidences (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assistance_id BIGINT NOT NULL REFERENCES technical_assistances(id) ON DELETE CASCADE,
  action_id BIGINT REFERENCES assistance_actions(id) ON DELETE SET NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  storage_key TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  uploaded_by_id BIGINT NOT NULL REFERENCES users(id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auditoria tecnica inmutable de cambios (equivale a `asistencias_historial`).
CREATE TABLE assistance_history (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assistance_id BIGINT NOT NULL REFERENCES technical_assistances(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- VENCIDA es un estado efectivo calculado, no un cierre ni una transicion destructiva.
CREATE VIEW technical_assistances_effective AS
SELECT assistance.*,
  CASE
    WHEN lifecycle_status='COMPLETADA' THEN 'COMPLETADA'
    WHEN lifecycle_status='CANCELADA' THEN 'CANCELADA'
    WHEN commitment_at<NOW() THEN 'VENCIDA'
    ELSE lifecycle_status
  END AS effective_status,
  commitment_at>=NOW() AND commitment_at<=NOW()+INTERVAL '2 days' AND lifecycle_status NOT IN ('COMPLETADA','CANCELADA') AS due_soon
FROM technical_assistances assistance
WHERE deleted_at IS NULL;

CREATE INDEX technical_assistance_due_idx ON technical_assistances (organization_id, lifecycle_status, commitment_at) WHERE deleted_at IS NULL;
CREATE INDEX technical_assistance_balance_idx ON technical_assistances (organization_id, requested_at, process_id, almera_module_id) WHERE deleted_at IS NULL;
CREATE INDEX assistance_actions_timeline_idx ON assistance_actions (organization_id, assistance_id, performed_at DESC);

-- Modulo 2: plan estructurado (equivale a `planes_auditoria`).
CREATE TABLE audit_plans (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  process_id BIGINT NOT NULL REFERENCES institutional_processes(id),
  objective TEXT NOT NULL,
  scope TEXT NOT NULL,
  criteria TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  resources TEXT NOT NULL DEFAULT '',
  methodology TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PLANEADA' CHECK (status IN ('PLANEADA','EN_EJECUCION','EJECUTADA','INFORME_GENERADO','CERRADA','CANCELADA')),
  created_by_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);

CREATE TABLE audit_plan_auditors (
  plan_id BIGINT NOT NULL REFERENCES audit_plans(id) ON DELETE CASCADE,
  membership_id BIGINT NOT NULL REFERENCES memberships(id),
  is_lead BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (plan_id, membership_id)
);

-- Relacion 1:1 plan-ejecucion (equivale a `ejecuciones_auditoria`).
CREATE TABLE audit_executions (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id BIGINT NOT NULL UNIQUE REFERENCES audit_plans(id) ON DELETE CASCADE,
  executed_at TIMESTAMPTZ,
  strengths TEXT NOT NULL DEFAULT '',
  nonconformities TEXT NOT NULL DEFAULT '',
  improvement_opportunities TEXT NOT NULL DEFAULT '',
  general_conclusions TEXT NOT NULL DEFAULT '',
  created_by_id BIGINT NOT NULL REFERENCES users(id),
  updated_by_id BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un solo modelo sirve para documentos e indicadores revisados.
CREATE TABLE audit_review_items (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  execution_id BIGINT NOT NULL REFERENCES audit_executions(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('DOCUMENTO','INDICADOR')),
  reference_name TEXT NOT NULL,
  criterion TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL CHECK (result IN ('CUMPLE','NO_CUMPLE','OBSERVACION','NO_APLICA')),
  observation TEXT NOT NULL DEFAULT '',
  evidence_description TEXT NOT NULL DEFAULT '',
  evidence_storage_key TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_findings (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  execution_id BIGINT NOT NULL REFERENCES audit_executions(id) ON DELETE CASCADE,
  review_item_id BIGINT REFERENCES audit_review_items(id) ON DELETE SET NULL,
  finding_type TEXT NOT NULL CHECK (finding_type IN ('FORTALEZA','NO_CONFORMIDAD','OPORTUNIDAD_MEJORA','OBSERVACION')),
  description TEXT NOT NULL,
  objective_evidence TEXT NOT NULL DEFAULT '',
  breached_criterion TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ABIERTO' CHECK (status IN ('ABIERTO','EN_TRATAMIENTO','CERRADO')),
  responsible_membership_id BIGINT REFERENCES memberships(id),
  due_at DATE,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_reports (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  execution_id BIGINT NOT NULL REFERENCES audit_executions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  template_key TEXT NOT NULL,
  include_assistance_summary BOOLEAN NOT NULL DEFAULT TRUE,
  assistance_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  pdf_storage_key TEXT NOT NULL,
  generated_by_id BIGINT NOT NULL REFERENCES users(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (execution_id, version)
);

CREATE INDEX audit_plan_process_idx ON audit_plans (organization_id, process_id, scheduled_at DESC);
CREATE INDEX audit_review_execution_idx ON audit_review_items (organization_id, execution_id, item_type, position);
CREATE INDEX audit_findings_status_idx ON audit_findings (organization_id, status, due_at);

-- Registro en el catalogo y permisos: el acceso efectivo sigue siendo
-- modules.active + organization_modules.enabled + role_modules, ademas del permiso de accion.
INSERT INTO modules (key,name,description,route,icon,position,active) VALUES
  ('technical-assistances','Asistencias Tecnicas','Registro y seguimiento de asistencias ALMERA','/app/modulos/technical-assistances','headphones',11,TRUE),
  ('internal-audits','Auditorias Internas','Planeacion, ejecucion e informes de auditoria','/app/modulos/internal-audits','shield-check',12,FALSE)
ON CONFLICT (key) DO NOTHING;

INSERT INTO permissions (key,name,description) VALUES
  ('technical_assistance.view','Ver asistencias tecnicas','Consultar bandeja y tablero'),
  ('technical_assistance.create','Crear asistencias tecnicas','Registrar solicitudes'),
  ('technical_assistance.edit','Diligenciar asistencias tecnicas','Actualizar avances y evidencias'),
  ('technical_assistance.close','Cerrar asistencias tecnicas','Completar o reabrir registros'),
  ('technical_assistance.export','Exportar asistencias tecnicas','Descargar consolidados'),
  ('internal_audit.view','Ver auditorias internas','Consultar planes y ejecuciones'),
  ('internal_audit.manage','Gestionar auditorias internas','Planear y ejecutar auditorias'),
  ('internal_audit.export','Generar informes de auditoria','Crear PDF institucional')
ON CONFLICT (key) DO NOTHING;

COMMIT;
