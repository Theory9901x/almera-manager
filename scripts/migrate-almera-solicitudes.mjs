// Migracion del "Reporte de solicitudes" exportado de ALMERA (solicitudes documentales) al
// modulo de Asistencias Tecnicas, para consolidar en un solo sistema la gestion que hoy se
// reporta a mano en el informe mensual GIN-GDO-FO-17.
//
// El Excel se normaliza antes a JSON (openpyxl); este script solo mapea e inserta:
// - Proceso ALMERA -> proceso institucional mas cercano del mapa oficial (ALMERA maneja
//   subprocesos mas granulares que el mapa de 19; el nombre ALMERA original NO se pierde:
//   queda al frente de las observaciones y sale en el export).
// - Estado ALMERA -> estado del modulo: Aprobada=COMPLETADA, Rechazada=CANCELADA (con motivo),
//   Visto bueno=EN_ANALISIS (50%), Pendiente/Borrador=RECIBIDA.
// - Idempotente: cada asistencia queda marcada con [ALMERA-SOL-<id>] en observaciones y el
//   script salta las que ya existen, asi se puede re-correr con un Excel mas nuevo sin duplicar.
//
// Uso: node --env-file=.env scripts/migrate-almera-solicitudes.mjs <ruta-al-json> [--commit]
// Sin --commit corre en DRY-RUN: mapea y valida todo, no escribe nada.

import { readFileSync } from 'node:fs'
import { query, pool } from '../server/db.mjs'

const jsonPath = process.argv[2]
const commit = process.argv.includes('--commit')
if (!jsonPath) {
  console.error('Uso: node scripts/migrate-almera-solicitudes.mjs <ruta-al-json> [--commit]')
  process.exit(1)
}

const ADMIN_EMAIL = 'admin@sgimr.cloud'

// Proceso ALMERA (como viene en el Excel) -> codigo del mapa institucional. Claves normalizadas
// en minusculas y sin espacios extremos para tolerar variaciones de mayusculas del export.
const PROCESS_MAP = {
  'gestión jurídica': 'APO-03',
  'seguridad y salud en el trabajo': 'APO-02',
  'gerencia del talento humano': 'APO-02',
  'gestión de iaas': 'MIS-05',
  'vigilancia epidemiológica': 'MIS-05',
  'gestión de salud publica': 'MIS-05',
  'seguridad del paciente': 'EST-02',
  'gestión de calidad y mejoramiento institucional': 'EST-02',
  'métodos de trabajo': 'EST-02',
  'gestión del sogs': 'EST-02',
  'atención por hospitalización': 'MIS-01',
  'gestión de la información institucional, seguridad informatica y minería de datos': 'APO-06',
  'gerencia de la información': 'APO-06',
  'gestión de auditorías': 'EVC-01',
  'gestión de acceso': 'MIS-07',
  'atención por urgencias': 'MIS-09',
  'laboratorio clínico': 'MIS-02',
  'gestión de la tecnología biomédica y dispositivos médicos': 'APO-05',
  'gestión de la tecnología': 'APO-05',
  'atención humanizada': 'MIS-04',
  'gestión de las comunicaciones': 'APO-07',
  'gestión directiva': 'EST-01',
  'gestión gerencial': 'EST-01',
  'planeación': 'EST-01',
  'gestión del direccionamiento y planeación estratégica': 'EST-01',
  'atención ambulatoria': 'MIS-08',
  'consulta externa y rutas integrales de atención': 'MIS-08',
  'servicio farmacéutico': 'MIS-03',
  'apoyo terapéutico': 'MIS-03',
  'gerencia de ambiente físico': 'APO-04',
}

// Fechas del export: "2026-09-02 05:25 PM" (hora local de la entidad).
function parseAlmeraDate(text) {
  if (!text) return null
  const match = String(text).trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return null
  let hour = Number(match[4]) % 12
  if (/pm/i.test(match[6])) hour += 12
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hour + 5, Number(match[5])))
}

// 'x' o vacio son marcadores de borrador en ALMERA, no informacion: se reemplazan por un
// asunto/descripcion legibles para que el consolidado no muestre celdas basura.
function cleanText(value) {
  const text = String(value ?? '').trim()
  return text && text.toLowerCase() !== 'x' ? text : ''
}

const STATUS_MAP = {
  Aprobada: { status: 'COMPLETADA', percent: 100, solution: 'Documento aprobado y publicado en ALMERA.' },
  Rechazada: { status: 'CANCELADA', percent: 0, reason: 'Rechazada en ALMERA con observaciones para ajuste; a la espera de nueva radicación por el proceso.' },
  'Visto bueno': { status: 'EN_ANALISIS', percent: 50 },
  Pendiente: { status: 'RECIBIDA', percent: 0 },
  Borrador: { status: 'RECIBIDA', percent: 0 },
}

async function main() {
  const rows = JSON.parse(readFileSync(jsonPath, 'utf-8'))
  console.log(`Solicitudes en el JSON: ${rows.length}${commit ? '' : ' (DRY-RUN, no se escribe nada)'}`)

  const org = await query('SELECT id FROM organizations ORDER BY id LIMIT 1')
  if (!org.rows[0]) throw new Error('No hay ninguna organizacion en la base')
  const organizationId = org.rows[0].id
  const admin = await query('SELECT id FROM users WHERE email=$1', [ADMIN_EMAIL])
  if (!admin.rows[0]) throw new Error(`No existe el usuario ${ADMIN_EMAIL}`)
  const createdById = admin.rows[0].id

  const processes = await query('SELECT id, code FROM institutional_processes WHERE organization_id=$1', [organizationId])
  const processByCode = Object.fromEntries(processes.rows.map(p => [p.code, p.id]))
  const moduleResult = await query(`SELECT id FROM almera_catalog_modules WHERE organization_id=$1 AND code='MOD-01'`, [organizationId])
  if (!moduleResult.rows[0]) throw new Error('No existe el modulo MOD-01 (Documentos) en el catalogo ALMERA')
  const documentosModuleId = moduleResult.rows[0].id

  // Ya migradas (marca [ALMERA-SOL-...] en observaciones) para poder re-correr sin duplicar.
  const existing = await query(
    `SELECT general_observations FROM technical_assistances WHERE organization_id=$1 AND general_observations LIKE '%[ALMERA-SOL-%'`,
    [organizationId],
  )
  const migrated = new Set()
  for (const row of existing.rows) {
    for (const match of row.general_observations.matchAll(/\[ALMERA-SOL-(\d+)\]/g)) migrated.add(match[1])
  }

  let skipped = 0
  const pending = []
  const unmappedProcesses = new Map()
  for (const row of rows) {
    if (migrated.has(String(row.id))) { skipped += 1; continue }
    const processCode = PROCESS_MAP[String(row.proceso || '').trim().toLowerCase()]
    const processId = processCode ? processByCode[processCode] : null
    if (!processId) {
      unmappedProcesses.set(row.proceso, (unmappedProcesses.get(row.proceso) || 0) + 1)
      continue
    }
    const mapped = STATUS_MAP[String(row.estado || '').trim()]
    if (!mapped) throw new Error(`Estado ALMERA desconocido: "${row.estado}" (solicitud ${row.id})`)
    const receivedAt = parseAlmeraDate(row.fecha)
    if (!receivedAt) throw new Error(`Fecha inválida "${row.fecha}" (solicitud ${row.id})`)
    const closedAt = parseAlmeraDate(row.fechaCierre)
    const subject = cleanText(row.nombre) || `${cleanText(row.tipoSolicitud) || 'Solicitud documental'} — ${row.proceso}`
    const justification = cleanText(row.justificacion)
    const detail = cleanText(row.descripcion)
    const description = [justification, detail].filter(Boolean).join('\n\n')
      || `Solicitud documental radicada en ALMERA (${cleanText(row.tipoSolicitud) || 'sin tipo'}).`
    const observations = [
      `Proceso ALMERA: ${row.proceso} · Estado ALMERA: ${row.estado} · [ALMERA-SOL-${row.id}]`,
      row.estado === 'Borrador' ? 'Registrada por el proceso, aún sin radicar formalmente.' : '',
    ].filter(Boolean).join('\n')
    pending.push({
      almeraId: String(row.id), subject, description, processId, processCode,
      requesterName: cleanText(row.registradaPor) || 'ALMERA', receivedAt, closedAt,
      status: mapped.status, percent: mapped.percent,
      solution: mapped.solution || null,
      cancellationReason: mapped.reason || null,
      observations,
    })
  }

  if (unmappedProcesses.size) {
    console.error('Procesos ALMERA sin mapeo (NADA se migro):')
    for (const [name, count] of unmappedProcesses) console.error(`  - ${name} (${count})`)
    process.exit(1)
  }

  // Insercion en orden cronologico para que el consecutivo AST siga la fecha de radicacion.
  pending.sort((a, b) => a.receivedAt - b.receivedAt)
  console.log(`Ya migradas (se saltan): ${skipped} · A insertar: ${pending.length}`)
  const byStatus = {}
  for (const item of pending) byStatus[item.status] = (byStatus[item.status] || 0) + 1
  console.log('Por estado:', byStatus)

  if (!commit) {
    for (const item of pending.slice(0, 5)) console.log(` ej: [${item.processCode}] ${item.status} · ${item.subject.slice(0, 70)}`)
    console.log('DRY-RUN terminado. Ejecuta con --commit para escribir.')
    return
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [organizationId])
    // Mismo formato de codigo del endpoint de creacion; el conteo por año usa created_at, que
    // aqui es NOW() para todas, asi que el consecutivo continua el del año en curso sin chocar.
    const sequence = await client.query(
      `SELECT COUNT(*)::int n FROM technical_assistances WHERE organization_id=$1 AND created_at>=date_trunc('year',NOW())`,
      [organizationId],
    )
    let consecutive = sequence.rows[0].n
    const year = new Date().getFullYear()
    for (const item of pending) {
      consecutive += 1
      const code = `AST-${year}-${String(consecutive).padStart(4, '0')}`
      const inserted = await client.query(
        `INSERT INTO technical_assistances(
           organization_id,code,subject,process_id,almera_module_id,requester_name,requester_position,requester_contact,
           request_channel,description,priority,status,completion_percent,received_at,general_observations,
           final_solution,cancellation_reason,closed_at,created_by_id)
         VALUES($1,$2,$3,$4,$5,$6,'','','OTRO',$7,'MEDIA',$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
        [organizationId, code, item.subject, item.processId, documentosModuleId, item.requesterName,
         item.description, item.status, item.percent, item.receivedAt, item.observations,
         item.solution, item.cancellationReason,
         (item.status === 'COMPLETADA' || item.status === 'CANCELADA') ? (item.closedAt || item.receivedAt) : null,
         createdById],
      )
      await client.query(
        `INSERT INTO activity_logs(organization_id,entity_type,entity_id,action,changes,actor_user_id)
         VALUES($1,'ASSISTANCE',$2,'CREATED',$3,$4)`,
        [organizationId, inserted.rows[0].id, JSON.stringify({ code, migratedFrom: `ALMERA-SOL-${item.almeraId}` }), createdById],
      )
    }
    await client.query('COMMIT')
    console.log(`Insertadas ${pending.length} asistencias (${`AST-${year}-...`} hasta ${consecutive}).`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1) })
