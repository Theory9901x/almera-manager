// SOLO LECTURA: lista las encuestas cuyo titulo contiene un texto y, de cada una, sus preguntas
// (tipo, enunciado y opciones) con el numero de respuestas completas. Sirve para saber con que
// estructura real se diligencio una encuesta antes de tocar su tabulacion o su informe.
//
// Uso: node --env-file=.env scripts/describe-survey.mjs <texto-del-titulo>

import { query, pool } from '../server/db.mjs'

const needle = process.argv[2]
if (!needle) { console.error('Uso: node scripts/describe-survey.mjs <texto-del-titulo>'); process.exit(1) }

async function main() {
  const surveys = await query(
    `SELECT s.id, s.code, s.title, s.status,
            (SELECT COUNT(*) FROM survey_responses r WHERE r.survey_id = s.id AND r.completed)::int AS completed
     FROM surveys s WHERE s.title ILIKE $1 ORDER BY s.id`, [`%${needle}%`])
  for (const survey of surveys.rows) {
    console.log(`\n# ${survey.code} · ${survey.title} · ${survey.status} · ${survey.completed} completas`)
    const questions = await query(
      `SELECT q.id, q.type, q.prompt, q.config, p.order_index AS page
       FROM survey_questions q JOIN survey_pages p ON p.id = q.page_id
       WHERE p.survey_id = $1 ORDER BY p.order_index, q.order_index`, [survey.id])
    for (const q of questions.rows) {
      const config = q.config || {}
      const options = (config.options || []).map(o => o.label).join(' | ')
      const flags = [config.multiple ? 'multiple' : '', config.correctOptionId != null ? 'con clave' : ''].filter(Boolean).join(', ')
      console.log(`  p${q.page} [${q.type}${flags ? ` · ${flags}` : ''}] ${String(q.prompt).slice(0, 90)}${options ? `\n      opciones: ${options.slice(0, 300)}` : ''}`)
    }
  }
  if (!surveys.rows.length) console.log('Sin encuestas que coincidan.')
  await pool.end()
}

main().catch(error => { console.error(error); process.exit(1) })
