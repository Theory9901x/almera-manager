// Anula radicados por numero A TRAVES DE LA API (POST /api/radicados/:id/anular), no con SQL
// directo: asi la anulacion deja su fila en radicado_anulaciones y en radicado_auditoria con
// motivo y actor, igual que si se hiciera desde la pantalla, y el numero sigue sin reutilizarse.
// Se autentica con una sesion temporal del superadministrador que se borra al terminar.
//
// Uso: node --env-file=<.env> scripts/void-radicados.mjs <numero> [<numero>...] --motivo="..." [--commit]
// Sin --commit solo muestra los radicados encontrados y su estado (no escribe nada).

import { pool, query } from '../server/db.mjs'
import { createSessionToken, hashToken } from '../server/security.mjs'

const args = process.argv.slice(2)
const commit = args.includes('--commit')
const motivo = (args.find(arg => arg.startsWith('--motivo=')) || '').slice('--motivo='.length).trim()
const numeros = args.filter(arg => !arg.startsWith('--'))
const BASE = `http://127.0.0.1:${process.env.PORT || 3100}/api`

async function main() {
  if (!numeros.length || !motivo) {
    console.error('Uso: node scripts/void-radicados.mjs <numero> [...] --motivo="..." [--commit]')
    process.exitCode = 1
    return
  }
  const found = await query(
    `SELECT r.id, r.numero_radicado, r.estado, r.objeto, r.destinatario, r.organization_id, r.deleted_at
     FROM radicados r WHERE r.numero_radicado = ANY($1::text[]) ORDER BY r.numero_radicado`, [numeros])
  for (const numero of numeros) {
    const row = found.rows.find(item => item.numero_radicado === numero)
    console.log(row
      ? `${row.numero_radicado} · ${row.estado}${row.deleted_at ? ' · ELIMINADO' : ''} · ${row.objeto.slice(0, 70)} · ${row.destinatario}`
      : `${numero} · NO EXISTE`)
  }
  const pending = found.rows.filter(row => row.estado === 'ACTIVO' && !row.deleted_at)
  if (!commit) { console.log(`\nDRY-RUN: ${pending.length} radicado(s) por anular. Motivo: «${motivo}». Ejecuta con --commit.`); return }
  if (!pending.length) { console.log('Nada que anular.'); return }

  const admin = await query(
    `SELECT m.id, u.full_name FROM memberships m JOIN roles r ON r.id = m.role_id JOIN users u ON u.id = m.user_id
     WHERE r.key = 'SUPERADMIN' AND m.active AND m.organization_id = $1 ORDER BY m.id LIMIT 1`, [pending[0].organization_id])
  if (!admin.rows[0]) throw new Error('No hay superadministrador activo en la entidad')
  const token = createSessionToken()
  await query(`INSERT INTO sessions (token_hash, membership_id, expires_at, user_agent) VALUES ($1,$2,NOW() + INTERVAL '5 minutes','void-radicados')`,
    [hashToken(token), admin.rows[0].id])
  try {
    for (const row of pending) {
      const res = await fetch(`${BASE}/radicados/${row.id}/anular`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `sgimr_session=${token}` }, body: JSON.stringify({ motivo }),
      })
      const data = await res.json().catch(() => ({}))
      console.log(`${row.numero_radicado} → ${res.status === 200 ? `ANULADO (por ${admin.rows[0].full_name})` : `ERROR ${res.status}: ${data.error}`}`)
    }
  } finally {
    await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)])
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => pool.end())
