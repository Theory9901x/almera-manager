import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'
import './load-env.mjs'
import { hashPassword, normalizeEmail } from './security.mjs'

const { Pool } = pg
const here = dirname(fileURLToPath(import.meta.url))

export const pool = new Pool({
  ...(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'sgimr',
    user: process.env.PGUSER || 'sgimr',
    password: process.env.PGPASSWORD || 'sgimr_dev',
  }),
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: Number(process.env.DB_POOL_SIZE || 10),
})

export function query(text, params = []) {
  return pool.query(text, params)
}

export async function migrate() {
  const schema = await fs.readFile(join(here, 'schema.sql'), 'utf8')
  await pool.query(schema)
  await pool.query('DELETE FROM sessions WHERE expires_at <= NOW()')
}

export async function bootstrap() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const orgName = process.env.BOOTSTRAP_ORG_NAME || 'ESE Salud Yopal'
    const orgSlug = process.env.BOOTSTRAP_ORG_SLUG || 'sgimr'
    const orgResult = await client.query(
      `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [orgName, orgSlug],
    )
    const organizationId = orgResult.rows[0].id
    const processCatalog = [
      ['EST-01','Gestión del Direccionamiento y Planeación Estratégica','ESTRATEGICO'],['EST-02','Gestión de Calidad y Mejoramiento Institucional','ESTRATEGICO'],
      ['MIS-01','Atención por Hospitalización','MISIONAL'],['MIS-02','Apoyo Diagnóstico','MISIONAL'],['MIS-03','Apoyo Terapéutico','MISIONAL'],['MIS-04','Atención Humanizada','MISIONAL'],['MIS-05','Gestión de Salud Pública','MISIONAL'],['MIS-06','Docencia, Servicio e Investigación','MISIONAL'],['MIS-07','Gestión de Acceso','MISIONAL'],['MIS-08','Atención Ambulatoria','MISIONAL'],['MIS-09','Atención por Urgencias','MISIONAL'],
      ['APO-01','Gestión Financiera','APOYO'],['APO-02','Gerencia del Talento Humano','APOYO'],['APO-03','Gestión Jurídica','APOYO'],['APO-04','Gerencia del Ambiente Físico','APOYO'],['APO-05','Gestión de la Tecnología','APOYO'],['APO-06','Gerencia de la Información','APOYO'],['APO-07','Gestión de las Comunicaciones','APOYO'],['EVC-01','Evaluación, Seguimiento y Control','EVALUACION_CONTROL']]
    for (const [code,name,classification] of processCatalog) await client.query(`INSERT INTO institutional_processes(organization_id,code,name,classification) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id,code) DO UPDATE SET name=EXCLUDED.name,classification=EXCLUDED.classification`,[organizationId,code,name,classification])
    const almeraModules=['Documentos','Calidad','Seguridad del Paciente','Riesgos','Mecanismos de Integración, Actas de Comité y Reuniones','Evaluaciones','Encuestas','PQRSF','Indicadores','Cuadros de Mando','Gestión de Auditorías']
    for (let i=0;i<almeraModules.length;i++) await client.query(`INSERT INTO almera_catalog_modules(organization_id,code,name) VALUES($1,$2,$3) ON CONFLICT(organization_id,code) DO UPDATE SET name=EXCLUDED.name`,[organizationId,`MOD-${String(i+1).padStart(2,'0')}`,almeraModules[i]])

    await client.query(
      `UPDATE roles SET key='SUPERADMIN', name='Superadministrador', description='Control total de usuarios, roles, modulos y entidad'
       WHERE organization_id=$1 AND key='superadmin'
       AND NOT EXISTS (SELECT 1 FROM roles WHERE organization_id=$1 AND key='SUPERADMIN')`,
      [organizationId],
    )

    const roleResult = await client.query(
      `INSERT INTO roles (organization_id, key, name, description, system)
       VALUES ($1, 'SUPERADMIN', 'Superadministrador', 'Control total de usuarios, roles, modulos y entidad', TRUE)
       ON CONFLICT (organization_id, key) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [organizationId],
    )
    const roleId = roleResult.rows[0].id
    await client.query(
      `INSERT INTO organization_modules (organization_id, module_id, enabled)
       SELECT $1, id, TRUE FROM modules ON CONFLICT DO NOTHING`,
      [organizationId],
    )

    await client.query(
      `INSERT INTO roles (organization_id, key, name, description, system)
       VALUES ($1, 'ADMIN', 'Administrador', 'Gestiona usuarios, modulos y areas de la entidad', TRUE)
       ON CONFLICT (organization_id, key) DO UPDATE SET name = EXCLUDED.name`,
      [organizationId],
    )
    await client.query(
      `INSERT INTO roles (organization_id, key, name, description, system)
       VALUES ($1, 'USUARIO', 'Usuario', 'Cuenta operativa: solo ve los modulos y areas que se le habiliten individualmente', TRUE)
       ON CONFLICT (organization_id, key) DO UPDATE SET name = EXCLUDED.name`,
      [organizationId],
    )

    // SUPERADMIN y ADMIN reciben siempre todos los permisos y modulos; USUARIO no recibe nada por rol,
    // su acceso sale exclusivamente de membership_modules (ver auth.mjs getSessionContext).
    await client.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
       WHERE r.organization_id=$1 AND r.key IN ('SUPERADMIN','ADMIN')
       ON CONFLICT DO NOTHING`,
      [organizationId],
    )
    await client.query(
      `INSERT INTO role_modules (role_id, module_id)
       SELECT r.id, mo.id FROM roles r CROSS JOIN modules mo
       WHERE r.organization_id=$1 AND r.key IN ('SUPERADMIN','ADMIN')
       ON CONFLICT DO NOTHING`,
      [organizationId],
    )

    // Roles personalizados de iteraciones anteriores: se migran sus usuarios a USUARIO y se eliminan.
    const legacyRoleKeys = ['ADMIN_ENTIDAD', 'CONSULTA', 'COORDINADOR_ASISTENCIA_TECNICA', 'GESTOR_ALMERA', 'gestor-mr']
    const usuarioRole = await client.query(
      `SELECT id FROM roles WHERE organization_id=$1 AND key='USUARIO'`,
      [organizationId],
    )
    await client.query(
      `UPDATE memberships SET role_id=$1
       WHERE organization_id=$2 AND role_id IN (SELECT id FROM roles WHERE organization_id=$2 AND key = ANY($3))`,
      [usuarioRole.rows[0].id, organizationId, legacyRoleKeys],
    )
    await client.query(
      `DELETE FROM roles WHERE organization_id=$1 AND key = ANY($2)`,
      [organizationId, legacyRoleKeys],
    )

    const membershipCount = await client.query(
      'SELECT COUNT(*)::int AS total FROM memberships WHERE organization_id = $1',
      [organizationId],
    )
    if (membershipCount.rows[0].total === 0) {
      const isProduction = process.env.NODE_ENV === 'production'
      const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || (isProduction ? '' : 'Admin1234!')
      if (!password) throw new Error('BOOTSTRAP_ADMIN_PASSWORD es obligatorio en producción')
      if (password.length < 10) throw new Error('BOOTSTRAP_ADMIN_PASSWORD debe tener al menos 10 caracteres')
      const email = normalizeEmail(process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@sgimr.cloud')
      const name = process.env.BOOTSTRAP_ADMIN_NAME || 'Administrador SGIMR'
      const userResult = await client.query(
        `INSERT INTO users (email, full_name, password_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
         RETURNING id`,
        [email, name, hashPassword(password)],
      )
      await client.query(
        `INSERT INTO memberships (organization_id, user_id, role_id)
         VALUES ($1, $2, $3) ON CONFLICT (organization_id, user_id) DO NOTHING`,
        [organizationId, userResult.rows[0].id, roleId],
      )
      console.info(`[bootstrap] Usuario administrador preparado: ${email}`)
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
