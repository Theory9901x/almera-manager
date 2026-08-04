// Migracion unica del Excel historico "RADICADOS DE COMUNICACIONES EXTERNAS Y INTERNAS" a la
// tabla `radicados`. Preparado en dos pasos: el Excel se normalizo antes con un script Python
// (openpyxl) a un JSON plano; este script solo hace el bulk-insert contra Postgres.
//
// Preserva el numero historico tal cual (RAD-020100...), NO lo reescribe con AAAA-TIPO-NNNNNN
// (esa codificacion es solo para lo que se genere de aqui en adelante). Al final siembra
// radicado_counters para que la PROXIMA generacion (Interno o Externo, año actual) continue
// desde el ultimo consecutivo del Excel, ya con nuestra codificacion.
//
// Uso: node scripts/migrate-radicados-excel.mjs <ruta-al-json> [--commit]
// Sin --commit corre en modo DRY-RUN: valida todo y no escribe nada.

import { readFileSync } from 'node:fs'
import { query, pool } from '../server/db.mjs'

const jsonPath = process.argv[2]
const commit = process.argv.includes('--commit')
if (!jsonPath) {
  console.error('Uso: node scripts/migrate-radicados-excel.mjs <ruta-al-json> [--commit]')
  process.exit(1)
}

const rows = JSON.parse(readFileSync(jsonPath, 'utf-8'))
console.log(`Filas a migrar: ${rows.length}${commit ? '' : ' (DRY-RUN, no se escribe nada)'}`)

const ADMIN_EMAIL = 'admin@sgimr.cloud'

async function main() {
  const org = await query('SELECT id FROM organizations ORDER BY id LIMIT 1')
  if (!org.rows[0]) throw new Error('No hay ninguna organizacion en la base')
  const organizationId = org.rows[0].id

  const admin = await query('SELECT id FROM users WHERE email = $1', [ADMIN_EMAIL])
  if (!admin.rows[0]) throw new Error(`No existe el usuario ${ADMIN_EMAIL}`)
  const createdById = admin.rows[0].id

  const tipos = await query('SELECT id, codigo FROM radicado_tipos WHERE organization_id = $1', [organizationId])
  const tipoByCodigo = Object.fromEntries(tipos.rows.map(t => [t.codigo, t.id]))
  if (!tipoByCodigo.INT || !tipoByCodigo.EXT) throw new Error('Faltan los tipos INT/EXT')

  const categorias = await query('SELECT id, nombre FROM radicado_categorias WHERE organization_id = $1', [organizationId])
  const categoriaByNombre = Object.fromEntries(categorias.rows.map(c => [c.nombre, c.id]))

  const medio = await query("SELECT id FROM radicado_medios WHERE organization_id = $1 AND nombre = 'No registrado'", [organizationId])
  if (!medio.rows[0]) throw new Error("Falta el medio 'No registrado' — corre migrate() primero")
  const medioId = medio.rows[0].id

  // Validacion previa completa: si algo no encaja, se aborta ANTES de escribir cualquier fila.
  const prepared = []
  let maxConsecutivo = 0
  for (const row of rows) {
    const tipoId = tipoByCodigo[row.tipo === 'EXTERNO' ? 'EXT' : 'INT']
    const categoriaId = categoriaByNombre[row.categoria]
    if (!categoriaId) throw new Error(`Fila excel ${row.excel_row}: categoria desconocida "${row.categoria}"`)
    if (!row.numero_radicado) throw new Error(`Fila excel ${row.excel_row}: sin numero_radicado`)
    maxConsecutivo = Math.max(maxConsecutivo, row.consecutivo)
    prepared.push({ ...row, tipoId, categoriaId })
  }
  console.log(`Consecutivo maximo detectado: ${maxConsecutivo}`)

  if (!commit) {
    console.log('Validacion OK. Vuelve a correr con --commit para escribir.')
    return
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    let inserted = 0
    for (const row of prepared) {
      const fechaRadicado = row.fecha_radicado || new Date().toISOString()
      const result = await client.query(
        `INSERT INTO radicados
           (organization_id, numero_radicado, tipo_id, direccion, categoria_id, medio_id, process_id,
            objeto, subproceso, remitente, destinatario, proceso_detalle, anio, consecutivo,
            fecha_radicado, fecha_documento, estado, created_by_id, created_at)
         VALUES ($1,$2,$3,NULL,$4,$5,NULL,$6,$7,'',$8,'',$9,$10,$11,NULL,'ACTIVO',$12,$11)
         ON CONFLICT (organization_id, numero_radicado) DO NOTHING
         RETURNING id`,
        [
          organizationId, row.numero_radicado, row.tipoId, row.categoriaId, medioId,
          row.objeto, row.subproceso, row.destinatario, row.anio, row.consecutivo,
          fechaRadicado, createdById,
        ],
      )
      const radicadoId = result.rows[0]?.id
      if (!radicadoId) continue // ya existia (numero_radicado repetido en una corrida anterior)
      inserted += 1
      await client.query(
        `INSERT INTO radicado_auditoria (radicado_id, accion, detalle, actor_id, created_at)
         VALUES ($1, 'CREADO', $2, $3, $4)`,
        [radicadoId, `Migrado del Excel historico (fila ${row.excel_row})`, createdById, fechaRadicado],
      )
    }

    // Continuidad: la proxima generacion (Interno o Externo, año actual) arranca justo despues
    // del ultimo consecutivo del Excel, ya con nuestra codificacion AAAA-TIPO-NNNNNN.
    const anioActual = new Date().getFullYear()
    for (const codigo of ['INT', 'EXT']) {
      await client.query(
        `INSERT INTO radicado_counters (organization_id, tipo_id, anio, ultimo_consecutivo)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (organization_id, tipo_id, anio)
         DO UPDATE SET ultimo_consecutivo = GREATEST(radicado_counters.ultimo_consecutivo, EXCLUDED.ultimo_consecutivo)`,
        [organizationId, tipoByCodigo[codigo], anioActual, maxConsecutivo],
      )
    }

    await client.query('COMMIT')
    console.log(`Migracion completa: ${inserted} radicados insertados. Contadores INT/EXT ${anioActual} sembrados en ${maxConsecutivo}.`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

main()
  .catch(error => { console.error(error); process.exitCode = 1 })
  .finally(() => pool.end())
