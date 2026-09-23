// Activa/desactiva una opcion de los catalogos de Radicados (tipos, categorias, medios) por
// nombre. Desactivar NO borra nada: los radicados ya registrados con esa opcion se conservan y
// siguen saliendo en consultas y filtros; solo deja de ofrecerse al radicar de ahora en adelante
// (el formulario filtra por activo y el servidor rechaza opciones inactivas al crear).
//
// Es un cambio de DATOS puntual y por eso NO va en schema.sql: alli se re-aplicaria en cada
// arranque y pisaria en silencio lo que se decida despues desde el panel de Catalogos.
//
// Uso: node --env-file=.env scripts/toggle-radicado-catalogo.mjs <categorias|medios|tipos> <nombre> <on|off>

import { query, pool } from '../server/db.mjs'

const TABLES = { categorias: 'radicado_categorias', medios: 'radicado_medios', tipos: 'radicado_tipos' }

const [catalogo, nombre, estado] = process.argv.slice(2)
const table = TABLES[catalogo]
if (!table || !nombre || !['on', 'off'].includes(estado)) {
  console.error('Uso: node scripts/toggle-radicado-catalogo.mjs <categorias|medios|tipos> <nombre> <on|off>')
  process.exit(1)
}

async function main() {
  const result = await query(
    `UPDATE ${table} SET activo = $1 WHERE nombre ILIKE $2 RETURNING id, nombre, activo,
       (SELECT slug FROM organizations o WHERE o.id = organization_id) AS org`,
    [estado === 'on', nombre],
  )
  if (!result.rows.length) {
    console.error(`No existe "${nombre}" en ${catalogo}. Nada cambiado.`)
    process.exit(1)
  }
  for (const row of result.rows) console.log(`${row.org} · ${catalogo} · "${row.nombre}" -> ${row.activo ? 'ACTIVA' : 'INACTIVA'}`)
  await pool.end()
}

main().catch(error => { console.error(error); process.exit(1) })
