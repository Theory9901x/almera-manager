import { Router } from 'express'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { extname, join, resolve, sep } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { pool, query } from '../db.mjs'
import { requireAnyModuleAccess, requireAnyPermission, requirePermission } from '../auth.mjs'
import { renderPdf } from '../pdf.mjs'
import { renderRadicadosReportHtml } from '../templates/radicadosReport.mjs'

export const radicadosRouter = Router()

const oid = request => request.auth.organization.id
const uid = request => request.auth.user.id
const radicadosModule = requireAnyModuleAccess(['radicados'])
const view = requirePermission('radicados.view')
const create = requirePermission('radicados.create')
const voidPerm = requirePermission('radicados.void')
const manage = requirePermission('radicados.manage')

function fail(status, message) {
  const error = new Error(message)
  error.status = status
  throw error
}

/** Agrupa y cuenta EN MEMORIA sobre filas ya traidas de la base — no dispara una consulta nueva
 *  por cada corte. Valido aqui porque el informe ya trae el listado COMPLETO sin paginar (nunca
 *  una muestra), asi que contar en Node sobre esas mismas filas da el mismo resultado que un
 *  GROUP BY y evita triplicar las idas a Postgres para Medio, Estado, Adjuntos y Generador. */
function countBy(list, keyFn, limit) {
  const counts = new Map()
  for (const item of list) {
    const key = keyFn(item)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const sorted = [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  return limit ? sorted.slice(0, limit) : sorted
}

// Eliminar es EXCLUSIVO de superadmin y distinto de anular (ver el ALTER de schema.sql): anular
// invalida un numero a la vista, con su motivo; eliminar lo saca de las vistas normales para
// datos de prueba o duplicados por error de captura, pero nunca lo borra de la base.
function requireSuperadmin(request, response, next) {
  if (request.auth?.role?.key !== 'SUPERADMIN') return response.status(403).json({ error: 'Solo un superadministrador puede eliminar un radicado' })
  next()
}

/** Filtra un id de la URL: `/:id` se traga cualquier cosa que no case antes, y un id no
 *  numerico manda NaN a una clave bigint (22P02, 500 donde toca 404). Ver CLAUDE.md §10. */
const numericId = value => /^\d+$/.test(String(value ?? ''))

// ---------------------------------------------------------------------------
// Catalogos administrables (tipo, categoria, medio). "manage" es admin-tier,
// igual que carbon.manage / checklists.manage: ningun USUARIO comun los toca
// aunque tenga el modulo, porque cambiar el codigo de un tipo cambiaria el
// prefijo de los numeros ya emitidos con ese tipo.
// ---------------------------------------------------------------------------

const CATALOGS = {
  tipos: { table: 'radicado_tipos', hasCode: true },
  categorias: { table: 'radicado_categorias', hasCode: false },
  medios: { table: 'radicado_medios', hasCode: false },
}

radicadosRouter.get('/catalogos', radicadosModule, view, async (request, response, next) => {
  try {
    const [tipos, categorias, medios, procesos] = await Promise.all([
      query('SELECT id, nombre, codigo, activo FROM radicado_tipos WHERE organization_id = $1 ORDER BY order_index, nombre', [oid(request)]),
      query('SELECT id, nombre, activo FROM radicado_categorias WHERE organization_id = $1 ORDER BY order_index, nombre', [oid(request)]),
      query('SELECT id, nombre, activo FROM radicado_medios WHERE organization_id = $1 ORDER BY order_index, nombre', [oid(request)]),
      query('SELECT id, code, name FROM institutional_processes WHERE organization_id = $1 AND active ORDER BY code', [oid(request)]),
    ])
    response.json({ tipos: tipos.rows, categorias: categorias.rows, medios: medios.rows, procesos: procesos.rows })
  } catch (error) { next(error) }
})

radicadosRouter.post('/catalogos/:catalogo', radicadosModule, manage, async (request, response, next) => {
  try {
    const catalog = CATALOGS[request.params.catalogo]
    if (!catalog) fail(404, 'Catálogo no encontrado')
    const nombre = String(request.body?.nombre || '').trim()
    if (!nombre) fail(400, 'El nombre es obligatorio')
    if (catalog.hasCode) {
      // El codigo aparece LITERAL en el numero de radicado (2026-INT-000001): mayusculas, sin
      // espacios, corto — es lo que un lector reconoce de un vistazo en el consecutivo.
      const codigo = String(request.body?.codigo || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
      if (!codigo || codigo.length > 8) fail(400, 'El código debe tener entre 1 y 8 letras/números (sin espacios)')
      const inserted = await query(
        `INSERT INTO ${catalog.table} (organization_id, nombre, codigo) VALUES ($1,$2,$3) RETURNING *`,
        [oid(request), nombre, codigo],
      )
      return response.status(201).json(inserted.rows[0])
    }
    const inserted = await query(
      `INSERT INTO ${catalog.table} (organization_id, nombre) VALUES ($1,$2) RETURNING *`,
      [oid(request), nombre],
    )
    response.status(201).json(inserted.rows[0])
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'Ya existe un elemento con ese nombre o código' })
    next(error)
  }
})

radicadosRouter.patch('/catalogos/:catalogo/:id', radicadosModule, manage, async (request, response, next) => {
  try {
    const catalog = CATALOGS[request.params.catalogo]
    if (!catalog) fail(404, 'Catálogo no encontrado')
    if (!numericId(request.params.id)) fail(404, 'Elemento no encontrado')
    const sets = []
    const values = []
    if (Object.hasOwn(request.body || {}, 'nombre')) { values.push(String(request.body.nombre).trim()); sets.push(`nombre = $${values.length}`) }
    if (Object.hasOwn(request.body || {}, 'activo')) { values.push(Boolean(request.body.activo)); sets.push(`activo = $${values.length}`) }
    if (!sets.length) fail(400, 'No hay cambios válidos')
    values.push(request.params.id, oid(request))
    const result = await query(
      `UPDATE ${catalog.table} SET ${sets.join(', ')} WHERE id = $${values.length - 1} AND organization_id = $${values.length} RETURNING *`,
      values,
    )
    if (!result.rows[0]) fail(404, 'Elemento no encontrado')
    response.json(result.rows[0])
  } catch (error) { next(error) }
})

// ---------------------------------------------------------------------------
// Generacion del consecutivo: EL endpoint central del modulo.
//
// El numero se arma con un UPSERT ATOMICO sobre radicado_counters — nunca leyendo
// MAX(consecutivo) ni contando filas: bajo concurrencia dos radicaciones del
// mismo tipo/año leerian el mismo "siguiente" numero antes de que ninguna
// confirmara, y ese es exactamente el fallo que rompio el Excel. El INSERT ...
// ON CONFLICT DO UPDATE toma el lock de fila del propio UPSERT: la segunda
// transaccion concurrente espera a que la primera confirme antes de poder
// incrementar, sin necesitar un SELECT ... FOR UPDATE aparte. Probado con 60
// generaciones simultaneas reales (ver historial del commit): 60 numeros
// unicos, 1..60 sin huecos.
// ---------------------------------------------------------------------------

radicadosRouter.post('/', radicadosModule, create, async (request, response, next) => {
  const client = await pool.connect()
  try {
    const body = request.body || {}
    const tipoId = Number(body.tipoId)
    const categoriaId = Number(body.categoriaId)
    const medioId = Number(body.medioId)
    const objeto = String(body.objeto || '').trim()
    if (!tipoId || !categoriaId || !medioId) fail(400, 'Tipo, categoría y medio son obligatorios')
    if (!objeto) fail(400, 'El objeto / asunto es obligatorio')
    const direccion = ['RECIBIDO', 'ENVIADO'].includes(body.direccion) ? body.direccion : null

    await client.query('BEGIN')

    const tipo = await client.query('SELECT id, codigo FROM radicado_tipos WHERE id = $1 AND organization_id = $2 AND activo', [tipoId, oid(request)])
    if (!tipo.rows[0]) fail(400, 'El tipo no pertenece a esta entidad o está inactivo')
    const categoria = await client.query('SELECT id FROM radicado_categorias WHERE id = $1 AND organization_id = $2 AND activo', [categoriaId, oid(request)])
    if (!categoria.rows[0]) fail(400, 'La categoría no pertenece a esta entidad o está inactiva')
    const medio = await client.query('SELECT id FROM radicado_medios WHERE id = $1 AND organization_id = $2 AND activo', [medioId, oid(request)])
    if (!medio.rows[0]) fail(400, 'El medio no pertenece a esta entidad o está inactivo')
    if (body.processId) {
      const proceso = await client.query('SELECT id FROM institutional_processes WHERE id = $1 AND organization_id = $2 AND active', [Number(body.processId), oid(request)])
      if (!proceso.rows[0]) fail(400, 'El proceso no pertenece a esta entidad')
    }

    const anio = new Date().getFullYear()
    // El corazon del modulo: una sola sentencia, atomica, sin lectura previa del maximo.
    const counter = await client.query(
      `INSERT INTO radicado_counters (organization_id, tipo_id, anio, ultimo_consecutivo)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (organization_id, tipo_id, anio)
       DO UPDATE SET ultimo_consecutivo = radicado_counters.ultimo_consecutivo + 1
       RETURNING ultimo_consecutivo`,
      [oid(request), tipoId, anio],
    )
    const consecutivo = counter.rows[0].ultimo_consecutivo
    const numeroRadicado = `${anio}-${tipo.rows[0].codigo}-${String(consecutivo).padStart(6, '0')}`

    const inserted = await client.query(
      `INSERT INTO radicados
         (organization_id, numero_radicado, tipo_id, direccion, categoria_id, medio_id, process_id,
          objeto, subproceso, remitente, destinatario, proceso_detalle, anio, consecutivo, fecha_documento, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        oid(request), numeroRadicado, tipoId, direccion, categoriaId, medioId,
        body.processId ? Number(body.processId) : null,
        objeto, String(body.subproceso || '').trim(), String(body.remitente || '').trim(), String(body.destinatario || '').trim(),
        // proceso_detalle solo tiene sentido cuando NO hay processId ("no aplica" en el
        // formulario) — si viene un proceso institucional, se descarta el texto libre.
        body.processId ? '' : String(body.procesoDetalle || '').trim(),
        anio, consecutivo, body.fechaDocumento || null, uid(request),
      ],
    )
    const radicado = inserted.rows[0]

    await client.query(
      `INSERT INTO radicado_auditoria (radicado_id, accion, detalle, actor_id)
       VALUES ($1, 'CREADO', $2, $3)`,
      [radicado.id, `Radicado generado: ${numeroRadicado}`, uid(request)],
    )

    await client.query('COMMIT')
    response.status(201).json(radicado)
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})

// ---------------------------------------------------------------------------
// Consulta: filtros y paginacion EN SQL (CLAUDE.md §14) — con miles de radicados,
// traer todo y filtrar en Node es lo que hace que la pagina tarde en abrir.
// ---------------------------------------------------------------------------

function buildFilter(request) {
  const params = [oid(request)]
  const clauses = []
  const q = request.query || {}
  if (q.tipoId) { params.push(Number(q.tipoId)); clauses.push(`r.tipo_id = $${params.length}`) }
  if (q.categoriaId) { params.push(Number(q.categoriaId)); clauses.push(`r.categoria_id = $${params.length}`) }
  if (q.medioId) { params.push(Number(q.medioId)); clauses.push(`r.medio_id = $${params.length}`) }
  if (q.processId) { params.push(Number(q.processId)); clauses.push(`r.process_id = $${params.length}`) }
  if (['RECIBIDO', 'ENVIADO'].includes(q.direccion)) { params.push(q.direccion); clauses.push(`r.direccion = $${params.length}`) }
  if (['ACTIVO', 'ANULADO'].includes(q.estado)) { params.push(q.estado); clauses.push(`r.estado = $${params.length}`) }
  if (q.dateFrom) { params.push(q.dateFrom); clauses.push(`r.fecha_radicado >= $${params.length}::date`) }
  if (q.dateTo) { params.push(q.dateTo); clauses.push(`r.fecha_radicado < ($${params.length}::date + INTERVAL '1 day')`) }
  if (q.search) {
    params.push(`%${q.search}%`)
    const idx = params.length
    clauses.push(`(r.numero_radicado ILIKE $${idx} OR r.objeto ILIKE $${idx} OR r.remitente ILIKE $${idx} OR r.destinatario ILIKE $${idx} OR r.subproceso ILIKE $${idx})`)
  }
  // Los eliminados nunca se mezclan con los activos: o se ve una lista o la otra. Y solo un
  // superadmin puede pedir la de eliminados — a cualquier otro rol, aunque lo pida, se le sigue
  // ocultando (ver detalle abajo hace lo mismo).
  const includeDeleted = q.includeDeleted === 'true' && request.auth?.role?.key === 'SUPERADMIN'
  clauses.push(includeDeleted ? 'r.deleted_at IS NOT NULL' : 'r.deleted_at IS NULL')
  return { where: clauses.length ? `AND ${clauses.join(' AND ')}` : '', params }
}

const LIST_SELECT = `
  SELECT r.*, t.nombre AS tipo_nombre, t.codigo AS tipo_codigo,
         c.nombre AS categoria_nombre, m.nombre AS medio_nombre,
         p.name AS process_name, p.code AS process_code,
         u.full_name AS created_by_name,
         du.full_name AS deleted_by_name,
         (SELECT COUNT(*) FROM radicado_adjuntos a WHERE a.radicado_id = r.id)::int AS adjuntos_count
  FROM radicados r
  JOIN radicado_tipos t ON t.id = r.tipo_id
  JOIN radicado_categorias c ON c.id = r.categoria_id
  JOIN radicado_medios m ON m.id = r.medio_id
  LEFT JOIN institutional_processes p ON p.id = r.process_id
  JOIN users u ON u.id = r.created_by_id
  LEFT JOIN users du ON du.id = r.deleted_by_id
  WHERE r.organization_id = $1`

radicadosRouter.get('/', radicadosModule, view, async (request, response, next) => {
  try {
    const { where, params } = buildFilter(request)
    const pageSize = [25, 50, 100].includes(Number(request.query.pageSize)) ? Number(request.query.pageSize) : 25
    const count = await query(`SELECT COUNT(*)::int AS n FROM radicados r WHERE r.organization_id = $1 ${where}`, params)
    const pages = Math.max(1, Math.ceil(count.rows[0].n / pageSize))
    const page = Math.min(Math.max(1, Number(request.query.page) || 1), pages)
    const rows = await query(
      `${LIST_SELECT} ${where} ORDER BY r.fecha_radicado DESC, r.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    )
    response.json({ rows: rows.rows, total: count.rows[0].n, page, pageSize, pages })
  } catch (error) { next(error) }
})

// Informe en PDF: MISMO buildFilter que la consulta, asi que "todo lo que este en Base de
// datos" (sin filtros) o un listado filtrado de Consulta usan el mismo endpoint — depende
// simplemente de que query params llegue. Sin paginacion: el informe es del listado completo.
// Va ANTES de '/:id': si quedara despues, Express lo capturaria como si "report.pdf" fuera un id.
radicadosRouter.get('/report.pdf', radicadosModule, view, async (request, response, next) => {
  try {
    const { where, params } = buildFilter(request)
    // Los mismos agregados que Estadisticas (por direccion, tipo, proceso, categoria y mes),
    // pero acotados al MISMO where que la tabla de detalle: si el informe sale filtrado, sus
    // graficas cuentan lo filtrado, no toda la entidad — lo contrario mentiria sobre "lo que
    // hay en este informe".
    const [rows, orgResult, byDireccion, byTipo, byProceso, byCategoria, monthly] = await Promise.all([
      query(`${LIST_SELECT} ${where} ORDER BY r.fecha_radicado DESC, r.id DESC`, params),
      query('SELECT name FROM organizations WHERE id = $1', [oid(request)]),
      query(
        `SELECT CASE r.direccion WHEN 'RECIBIDO' THEN 'Recibido' WHEN 'ENVIADO' THEN 'Enviado' ELSE 'Interno' END AS label, COUNT(*)::int AS value
         FROM radicados r WHERE r.organization_id = $1 ${where} GROUP BY 1 ORDER BY value DESC`,
        params,
      ),
      query(
        `SELECT t.nombre AS label, COUNT(*)::int AS value
         FROM radicados r JOIN radicado_tipos t ON t.id = r.tipo_id WHERE r.organization_id = $1 ${where} GROUP BY t.nombre ORDER BY value DESC`,
        params,
      ),
      query(
        `SELECT COALESCE(p.name, 'Sin proceso') AS label, COUNT(*)::int AS value
         FROM radicados r LEFT JOIN institutional_processes p ON p.id = r.process_id WHERE r.organization_id = $1 ${where} GROUP BY 1 ORDER BY value DESC LIMIT 10`,
        params,
      ),
      query(
        `SELECT c.nombre AS label, COUNT(*)::int AS value
         FROM radicados r JOIN radicado_categorias c ON c.id = r.categoria_id WHERE r.organization_id = $1 ${where} GROUP BY c.nombre ORDER BY value DESC LIMIT 10`,
        params,
      ),
      query(
        `SELECT to_char(date_trunc('month', r.fecha_radicado), 'Mon YYYY') AS label, COUNT(*)::int AS value
         FROM radicados r WHERE r.organization_id = $1 ${where} GROUP BY date_trunc('month', r.fecha_radicado) ORDER BY date_trunc('month', r.fecha_radicado)`,
        params,
      ),
    ])
    const filtered = ['tipoId', 'categoriaId', 'medioId', 'processId', 'direccion', 'estado', 'dateFrom', 'dateTo', 'search']
      .some(key => Boolean(request.query[key]))
    // Medio, Estado, Adjuntos y Generador se cuentan sobre las mismas filas que ya trajo la
    // consulta principal (ver countBy arriba) — el informe nunca pagina, asi que es el universo
    // completo del corte, igual que los demas agregados.
    const html = renderRadicadosReportHtml({
      organizationName: orgResult.rows[0]?.name || '',
      generatedAt: new Date().toISOString(),
      generatedBy: request.auth.user.fullName,
      filtered,
      total: rows.rows.length,
      radicados: rows.rows,
      byDireccion: byDireccion.rows,
      byTipo: byTipo.rows,
      byProceso: byProceso.rows,
      byCategoria: byCategoria.rows,
      monthly: monthly.rows,
      byMedio: countBy(rows.rows, r => r.medio_nombre, 8),
      byEstado: countBy(rows.rows, r => r.estado === 'ANULADO' ? 'Anulado' : 'Activo'),
      byAdjunto: countBy(rows.rows, r => r.adjuntos_count > 0 ? 'Con adjunto' : 'Sin adjunto'),
      topGeneradores: countBy(rows.rows, r => r.created_by_name, 8),
    })
    const pdf = await renderPdf(html, { landscape: true })
    response.setHeader('Content-Type', 'application/pdf')
    response.setHeader('Content-Disposition', 'attachment; filename="radicados.pdf"')
    response.send(pdf)
  } catch (error) { next(error) }
})

radicadosRouter.get('/:id', radicadosModule, view, async (request, response, next) => {
  try {
    if (!numericId(request.params.id)) fail(404, 'Radicado no encontrado')
    const result = await query(`${LIST_SELECT} AND r.id = $2`, [oid(request), request.params.id])
    if (!result.rows[0]) fail(404, 'Radicado no encontrado')
    // Un eliminado solo lo puede abrir un superadmin (desde "Ver eliminados"); para cualquier
    // otro rol es como si no existiera, aunque conozca la URL exacta.
    if (result.rows[0].deleted_at && request.auth?.role?.key !== 'SUPERADMIN') fail(404, 'Radicado no encontrado')
    const [adjuntos, auditoria, anulacion] = await Promise.all([
      query(
        `SELECT a.id, a.original_name, a.mime_type, a.size_bytes, a.created_at, u.full_name AS uploaded_by_name
         FROM radicado_adjuntos a JOIN users u ON u.id = a.uploaded_by_id
         WHERE a.radicado_id = $1 ORDER BY a.created_at`,
        [request.params.id],
      ),
      query(
        `SELECT ra.id, ra.accion, ra.detalle, ra.created_at, u.full_name AS actor_name
         FROM radicado_auditoria ra JOIN users u ON u.id = ra.actor_id
         WHERE ra.radicado_id = $1 ORDER BY ra.created_at`,
        [request.params.id],
      ),
      query(
        `SELECT an.motivo, an.anulado_at, u.full_name AS anulado_by_name
         FROM radicado_anulaciones an JOIN users u ON u.id = an.anulado_by_id
         WHERE an.radicado_id = $1`,
        [request.params.id],
      ),
    ])
    response.json({ ...result.rows[0], adjuntos: adjuntos.rows, auditoria: auditoria.rows, anulacion: anulacion.rows[0] || null })
  } catch (error) { next(error) }
})

radicadosRouter.post('/:id/anular', radicadosModule, voidPerm, async (request, response, next) => {
  const client = await pool.connect()
  try {
    if (!numericId(request.params.id)) fail(404, 'Radicado no encontrado')
    const motivo = String(request.body?.motivo || '').trim()
    if (!motivo) fail(400, 'El motivo de anulación es obligatorio')

    await client.query('BEGIN')
    // FOR UPDATE: dos anulaciones simultaneas del mismo radicado no deben registrarse dos veces.
    const current = await client.query(
      'SELECT id, estado, numero_radicado, deleted_at FROM radicados WHERE id = $1 AND organization_id = $2 FOR UPDATE',
      [request.params.id, oid(request)],
    )
    if (!current.rows[0] || current.rows[0].deleted_at) fail(404, 'Radicado no encontrado')
    if (current.rows[0].estado === 'ANULADO') fail(409, 'Este radicado ya está anulado')

    // El numero NO se libera: no se toca radicado_counters. Solo cambia el estado.
    const updated = await client.query(
      "UPDATE radicados SET estado = 'ANULADO' WHERE id = $1 RETURNING *",
      [request.params.id],
    )
    await client.query(
      'INSERT INTO radicado_anulaciones (radicado_id, motivo, anulado_by_id) VALUES ($1,$2,$3)',
      [request.params.id, motivo, uid(request)],
    )
    await client.query(
      `INSERT INTO radicado_auditoria (radicado_id, accion, detalle, actor_id) VALUES ($1, 'ANULADO', $2, $3)`,
      [request.params.id, motivo, uid(request)],
    )
    await client.query('COMMIT')
    response.json(updated.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})

// Eliminar (soft-delete): saca el radicado de las vistas normales, pero NO es un DELETE — sigue
// en la base, en la auditoria y su numero sigue sin poder reutilizarse (no se toca el contador).
// Distinto de anular: un radicado activo O anulado se puede eliminar por igual, y al reves un
// eliminado ya no se puede anular ni recibir adjuntos (desaparecio de las vistas donde se hace eso).
radicadosRouter.post('/:id/eliminar', radicadosModule, requireSuperadmin, async (request, response, next) => {
  const client = await pool.connect()
  try {
    if (!numericId(request.params.id)) fail(404, 'Radicado no encontrado')
    const motivo = String(request.body?.motivo || '').trim()
    if (!motivo) fail(400, 'El motivo de la eliminación es obligatorio')

    await client.query('BEGIN')
    const current = await client.query(
      'SELECT id, deleted_at FROM radicados WHERE id = $1 AND organization_id = $2 FOR UPDATE',
      [request.params.id, oid(request)],
    )
    if (!current.rows[0]) fail(404, 'Radicado no encontrado')
    if (current.rows[0].deleted_at) fail(409, 'Este radicado ya está eliminado')

    const updated = await client.query(
      'UPDATE radicados SET deleted_at = NOW(), deleted_by_id = $1, deleted_reason = $2 WHERE id = $3 RETURNING *',
      [uid(request), motivo, request.params.id],
    )
    await client.query(
      `INSERT INTO radicado_auditoria (radicado_id, accion, detalle, actor_id) VALUES ($1, 'ELIMINADO', $2, $3)`,
      [request.params.id, motivo, uid(request)],
    )
    await client.query('COMMIT')
    response.json(updated.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})

// ---------------------------------------------------------------------------
// Adjuntos: solo se agregan (sin endpoint de borrado — misma inmutabilidad del
// radicado). No se sirven como estatico publico: un radicado externo puede
// traer datos personales, igual que las evidencias de Listas de Chequeo.
// ---------------------------------------------------------------------------

const uploadRoot = resolve(process.env.RADICADOS_UPLOAD_DIR || 'uploads/radicados')
await mkdir(uploadRoot, { recursive: true }).catch(() => {})
if (uploadRoot.split(sep).includes('releases')) {
  console.warn(
    `[radicados] AVISO: los adjuntos se estan guardando dentro del release (${uploadRoot}). ` +
    'Se perderan en el proximo despliegue. Define RADICADOS_UPLOAD_DIR apuntando a la carpeta compartida.',
  )
}

const ADJUNTO_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

const adjuntoUpload = multer({
  storage: multer.diskStorage({
    destination: uploadRoot,
    filename: (_request, file, callback) => callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase().slice(0, 8)}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (ADJUNTO_TYPES.has(file.mimetype)) return callback(null, true)
    const error = new Error('Solo se permiten imágenes (JPG, PNG, WEBP), PDF o Word de hasta 15 MB')
    error.status = 415
    callback(error)
  },
})

radicadosRouter.post('/:id/adjuntos', radicadosModule, create, adjuntoUpload.single('file'), async (request, response, next) => {
  try {
    if (!numericId(request.params.id)) fail(404, 'Radicado no encontrado')
    const radicado = await query('SELECT id FROM radicados WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [request.params.id, oid(request)])
    if (!radicado.rows[0]) fail(404, 'Radicado no encontrado')
    if (!request.file) fail(400, 'No llegó ningún archivo')
    const inserted = await query(
      `INSERT INTO radicado_adjuntos (radicado_id, stored_name, original_name, mime_type, size_bytes, uploaded_by_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [request.params.id, request.file.filename, request.file.originalname, request.file.mimetype, request.file.size, uid(request)],
    )
    await query(
      `INSERT INTO radicado_auditoria (radicado_id, accion, detalle, actor_id) VALUES ($1, 'ADJUNTO_SUBIDO', $2, $3)`,
      [request.params.id, `Adjuntó "${request.file.originalname}"`, uid(request)],
    )
    response.status(201).json(inserted.rows[0])
  } catch (error) { next(error) }
})

radicadosRouter.get('/:id/adjuntos/:adjuntoId', radicadosModule, view, async (request, response, next) => {
  try {
    if (!numericId(request.params.id) || !numericId(request.params.adjuntoId)) fail(404, 'Adjunto no encontrado')
    const result = await query(
      `SELECT a.* FROM radicado_adjuntos a JOIN radicados r ON r.id = a.radicado_id
       WHERE a.id = $1 AND a.radicado_id = $2 AND r.organization_id = $3`,
      [request.params.adjuntoId, request.params.id, oid(request)],
    )
    const adjunto = result.rows[0]
    if (!adjunto) fail(404, 'Adjunto no encontrado')
    response.setHeader('Content-Type', adjunto.mime_type || 'application/octet-stream')
    response.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(adjunto.original_name)}"`)
    response.sendFile(join(uploadRoot, adjunto.stored_name))
  } catch (error) { next(error) }
})

// ---------------------------------------------------------------------------
// Dashboard: KPIs del dia/mes, reparto por direccion (donut) y ultimos anulados.
// Todo en SQL — nada de traer filas al cliente para sumarlas en Node.
// ---------------------------------------------------------------------------

radicadosRouter.get('/resumen/dashboard', radicadosModule, view, async (request, response, next) => {
  try {
    const organizationId = oid(request)
    const [kpis, mix, anulados] = await Promise.all([
      query(
        `SELECT
           COUNT(*) FILTER (WHERE fecha_radicado::date = CURRENT_DATE)::int AS hoy,
           COUNT(*) FILTER (WHERE fecha_radicado::date = CURRENT_DATE AND direccion = 'RECIBIDO')::int AS recibidos_hoy,
           COUNT(*) FILTER (WHERE fecha_radicado::date = CURRENT_DATE AND direccion = 'ENVIADO')::int AS enviados_hoy,
           COUNT(*) FILTER (WHERE fecha_radicado::date = (CURRENT_DATE - INTERVAL '1 day')::date)::int AS ayer,
           COUNT(*) FILTER (WHERE date_trunc('month', fecha_radicado) = date_trunc('month', CURRENT_DATE))::int AS mes,
           COUNT(*) FILTER (WHERE date_trunc('month', fecha_radicado) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month'))::int AS mes_anterior,
           COUNT(*) FILTER (WHERE estado = 'ANULADO' AND date_trunc('month', fecha_radicado) = date_trunc('month', CURRENT_DATE))::int AS anulados_mes,
           COUNT(*) FILTER (WHERE estado = 'ANULADO' AND date_trunc('month', fecha_radicado) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month'))::int AS anulados_mes_anterior,
           (SELECT COUNT(*)::int FROM radicados r2 WHERE r2.organization_id = $1 AND r2.estado = 'ACTIVO' AND r2.deleted_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM radicado_adjuntos a WHERE a.radicado_id = r2.id)) AS pendientes_adjunto
         FROM radicados WHERE organization_id = $1 AND deleted_at IS NULL`,
        [organizationId],
      ),
      query(
        `SELECT
           COUNT(*) FILTER (WHERE direccion = 'RECIBIDO')::int AS recibidos,
           COUNT(*) FILTER (WHERE direccion = 'ENVIADO')::int AS enviados,
           COUNT(*) FILTER (WHERE direccion IS NULL)::int AS internos,
           COUNT(*)::int AS total
         FROM radicados
         WHERE organization_id = $1 AND deleted_at IS NULL AND date_trunc('month', fecha_radicado) = date_trunc('month', CURRENT_DATE)`,
        [organizationId],
      ),
      query(
        `SELECT r.id, r.numero_radicado, c.nombre AS categoria_nombre, an.motivo, an.anulado_at
         FROM radicado_anulaciones an
         JOIN radicados r ON r.id = an.radicado_id
         JOIN radicado_categorias c ON c.id = r.categoria_id
         WHERE r.organization_id = $1 AND r.deleted_at IS NULL
         ORDER BY an.anulado_at DESC LIMIT 5`,
        [organizationId],
      ),
    ])
    response.json({ kpis: kpis.rows[0], mix: mix.rows[0], recentVoided: anulados.rows })
  } catch (error) { next(error) }
})

// ---------------------------------------------------------------------------
// Analitica: generacion por mes, tipo, direccion, proceso y categoria. Igual que el
// dashboard, todo se agrega EN SQL — nunca se traen las filas a Node para sumarlas ahi.
// ---------------------------------------------------------------------------

radicadosRouter.get('/resumen/analitica', radicadosModule, view, async (request, response, next) => {
  try {
    const organizationId = oid(request)
    const [monthly, byTipo, byDireccion, byProceso, byCategoria] = await Promise.all([
      // Desde el mes del PRIMER radicado de la entidad hasta el actual — nunca 12 meses fijos
      // hacia atras. Antes arrancaba en "hoy menos 11 meses" e incluia como minimo diez meses
      // vacios para una entidad recien empezada (no tiene sentido medir un 2025 que nunca
      // existio). Si todavia no hay ningun radicado, el rango colapsa al mes actual solo.
      query(
        `SELECT to_char(s.mes, 'Mon YYYY') AS label, COALESCE(c.n, 0)::int AS value
         FROM generate_series(
           COALESCE(
             (SELECT date_trunc('month', MIN(fecha_radicado)) FROM radicados WHERE organization_id = $1 AND deleted_at IS NULL),
             date_trunc('month', CURRENT_DATE)
           ),
           date_trunc('month', CURRENT_DATE),
           INTERVAL '1 month'
         ) AS s(mes)
         LEFT JOIN (
           SELECT date_trunc('month', fecha_radicado) AS mes, COUNT(*) AS n
           FROM radicados WHERE organization_id = $1 AND deleted_at IS NULL
           GROUP BY 1
         ) c ON c.mes = s.mes
         ORDER BY s.mes`,
        [organizationId],
      ),
      query(
        `SELECT t.nombre AS label, COUNT(*)::int AS value
         FROM radicados r JOIN radicado_tipos t ON t.id = r.tipo_id
         WHERE r.organization_id = $1 AND r.deleted_at IS NULL
         GROUP BY t.nombre ORDER BY value DESC`,
        [organizationId],
      ),
      query(
        `SELECT CASE direccion WHEN 'RECIBIDO' THEN 'Recibido' WHEN 'ENVIADO' THEN 'Enviado' ELSE 'Interno' END AS label, COUNT(*)::int AS value
         FROM radicados WHERE organization_id = $1 AND deleted_at IS NULL
         GROUP BY 1 ORDER BY value DESC`,
        [organizationId],
      ),
      query(
        `SELECT COALESCE(p.name, 'Sin proceso') AS label, COUNT(*)::int AS value
         FROM radicados r LEFT JOIN institutional_processes p ON p.id = r.process_id
         WHERE r.organization_id = $1 AND r.deleted_at IS NULL
         GROUP BY 1 ORDER BY value DESC LIMIT 8`,
        [organizationId],
      ),
      query(
        `SELECT c.nombre AS label, COUNT(*)::int AS value
         FROM radicados r JOIN radicado_categorias c ON c.id = r.categoria_id
         WHERE r.organization_id = $1 AND r.deleted_at IS NULL
         GROUP BY c.nombre ORDER BY value DESC LIMIT 8`,
        [organizationId],
      ),
    ])
    response.json({
      monthly: monthly.rows, byTipo: byTipo.rows, byDireccion: byDireccion.rows,
      byProceso: byProceso.rows, byCategoria: byCategoria.rows,
    })
  } catch (error) { next(error) }
})
