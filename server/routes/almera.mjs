import { Router } from 'express'
import { pool, query } from '../db.mjs'
import { requireAnyPermission, requirePermission } from '../auth.mjs'

export const almeraRouter = Router()
const view = requireAnyPermission(['almera.view','almera.assistance.view','almera.dashboard.view'])
const oid = r => r.auth.organization.id
const uid = r => r.auth.user.id

almeraRouter.get('/catalogs', view, async (r,s,n) => { try {
  const [processes,modules,responsibles] = await Promise.all([
    query('SELECT id,code,name,classification,responsible,responsible_email FROM institutional_processes WHERE organization_id=$1 AND active ORDER BY code',[oid(r)]),
    query('SELECT id,code,name,description FROM almera_catalog_modules WHERE organization_id=$1 AND active ORDER BY code',[oid(r)]),
    query(`SELECT m.id,u.full_name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.active AND u.active ORDER BY u.full_name`,[oid(r)])])
  s.json({processes:processes.rows,modules:modules.rows,responsibles:responsibles.rows})
} catch(e){n(e)} })

almeraRouter.get('/assistances', view, async (r,s,n) => { try {
  const params=[oid(r)]; const where=['a.organization_id=$1','a.deleted_at IS NULL']
  if(r.query.status){params.push(r.query.status);where.push(`a.status=$${params.length}`)}
  if(r.query.q){params.push(`%${r.query.q}%`);where.push(`(a.subject ILIKE $${params.length} OR a.code ILIKE $${params.length} OR a.requester_name ILIKE $${params.length})`)}
  const result=await query(`SELECT a.*,p.name process_name,am.name module_name,u.full_name responsible_name,
    (a.commitment_at<NOW() AND a.status NOT IN ('COMPLETADA','CANCELADA')) overdue
    FROM technical_assistances a JOIN institutional_processes p ON p.id=a.process_id JOIN almera_catalog_modules am ON am.id=a.almera_module_id
    LEFT JOIN memberships m ON m.id=a.responsible_membership_id LEFT JOIN users u ON u.id=m.user_id
    WHERE ${where.join(' AND ')} ORDER BY a.created_at DESC LIMIT 200`,params)
  s.json(result.rows)
}catch(e){n(e)} })

almeraRouter.get('/metrics', view, async(r,s,n)=>{try{
 const x=await query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status NOT IN('COMPLETADA','CANCELADA'))::int open,
 COUNT(*) FILTER(WHERE status='COMPLETADA')::int completed,COUNT(*) FILTER(WHERE commitment_at<NOW() AND status NOT IN('COMPLETADA','CANCELADA'))::int overdue,
 COALESCE(ROUND(100.0*COUNT(*) FILTER(WHERE status='COMPLETADA' AND closed_at<=commitment_at)/NULLIF(COUNT(*) FILTER(WHERE commitment_at IS NOT NULL AND (commitment_at<=NOW() OR status='COMPLETADA')),0),1),0) compliance
 FROM technical_assistances WHERE organization_id=$1 AND deleted_at IS NULL`,[oid(r)]);s.json(x.rows[0])
}catch(e){n(e)}})

almeraRouter.post('/assistances', requireAnyPermission(['almera.create','almera.assistance.create']), async(r,s,n)=>{try{
 const b=r.body;if(!b.subject||!b.processId||!b.almeraModuleId||!b.requesterName||!b.description) return s.status(400).json({error:'Completa los campos obligatorios'})
 const client=await pool.connect();try{await client.query('BEGIN');const seq=await client.query(`SELECT COUNT(*)+1 n FROM technical_assistances WHERE organization_id=$1 AND created_at>=date_trunc('year',NOW())`,[oid(r)]);const code=`AST-${new Date().getFullYear()}-${String(seq.rows[0].n).padStart(4,'0')}`
 const x=await client.query(`INSERT INTO technical_assistances(organization_id,code,subject,process_id,almera_module_id,requester_name,requester_position,requester_contact,request_channel,description,priority,commitment_at,responsible_membership_id,general_observations,created_by_id)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,[oid(r),code,b.subject,b.processId,b.almeraModuleId,b.requesterName,b.requesterPosition||'',b.requesterContact||'',b.requestChannel||'OTRO',b.description,b.priority||'MEDIA',b.commitmentAt||null,b.responsibleMembershipId||null,b.observations||'',uid(r)])
 await client.query(`INSERT INTO activity_logs(organization_id,entity_type,entity_id,action,changes,actor_user_id) VALUES($1,'ASSISTANCE',$2,'CREATED',$3,$4)`,[oid(r),x.rows[0].id,JSON.stringify({code}),uid(r)]);await client.query('COMMIT');s.status(201).json(x.rows[0])
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}catch(e){n(e)}})

almeraRouter.post('/assistances/:id/actions', requireAnyPermission(['almera.edit','almera.assistance.edit']), async(r,s,n)=>{try{
 const b=r.body;if(!b.description) return s.status(400).json({error:'La actuacion requiere descripcion'});const client=await pool.connect();try{await client.query('BEGIN')
 const a=await client.query('SELECT * FROM technical_assistances WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL FOR UPDATE',[r.params.id,oid(r)]);if(!a.rows[0]) return s.status(404).json({error:'Asistencia no encontrada'})
 const x=await client.query(`INSERT INTO assistance_actions(organization_id,assistance_id,performed_by_id,description,result,observations,new_status,new_commitment_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[oid(r),r.params.id,uid(r),b.description,b.result||'',b.observations||'',b.newStatus||null,b.newCommitmentAt||null])
 await client.query(`UPDATE technical_assistances SET status=COALESCE($1,status),commitment_at=COALESCE($2,commitment_at),updated_by_id=$3,updated_at=NOW() WHERE id=$4`,[b.newStatus||null,b.newCommitmentAt||null,uid(r),r.params.id]);await client.query(`INSERT INTO activity_logs(organization_id,entity_type,entity_id,action,changes,actor_user_id) VALUES($1,'ASSISTANCE',$2,'ACTION_ADDED',$3,$4)`,[oid(r),r.params.id,JSON.stringify(b),uid(r)]);await client.query('COMMIT');s.status(201).json(x.rows[0])
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}catch(e){n(e)}})

almeraRouter.post('/assistances/:id/close', requirePermission('almera.assistance.close'), async(r,s,n)=>{try{const b=r.body;if(!b.solution||!b.finalAction||!b.result||b.confirm!==true)return s.status(400).json({error:'Solucion, actuacion final, resultado y confirmacion son obligatorios'});const client=await pool.connect();try{await client.query('BEGIN');const x=await client.query(`UPDATE technical_assistances SET status='COMPLETADA',final_solution=$1,closed_at=COALESCE($2,NOW()),updated_by_id=$3,updated_at=NOW() WHERE id=$4 AND organization_id=$5 AND status NOT IN('COMPLETADA','CANCELADA') RETURNING *`,[b.solution,b.closedAt||null,uid(r),r.params.id,oid(r)]);if(!x.rows[0])return s.status(409).json({error:'No se puede cerrar la asistencia'});await client.query(`INSERT INTO assistance_actions(organization_id,assistance_id,performed_by_id,description,result,new_status) VALUES($1,$2,$3,$4,$5,'COMPLETADA')`,[oid(r),r.params.id,uid(r),b.finalAction,b.result]);await client.query(`INSERT INTO activity_logs(organization_id,entity_type,entity_id,action,changes,actor_user_id) VALUES($1,'ASSISTANCE',$2,'CLOSED',$3,$4)`,[oid(r),r.params.id,JSON.stringify({solution:b.solution}),uid(r)]);await client.query('COMMIT');s.json(x.rows[0])}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}catch(e){n(e)}})

almeraRouter.post('/assistances/:id/reopen', requirePermission('almera.assistance.reopen'), async(r,s,n)=>{try{if(!r.body.justification)return s.status(400).json({error:'La justificacion es obligatoria'});const x=await query(`UPDATE technical_assistances SET status='EN_ANALISIS',closed_at=NULL,final_solution=NULL,updated_by_id=$1,updated_at=NOW() WHERE id=$2 AND organization_id=$3 AND status='COMPLETADA' RETURNING *`,[uid(r),r.params.id,oid(r)]);if(!x.rows[0])return s.status(409).json({error:'Solo se puede reabrir una asistencia completada'});await query(`INSERT INTO assistance_actions(organization_id,assistance_id,performed_by_id,description,result,new_status) VALUES($1,$2,$3,$4,'Reabierta','EN_ANALISIS')`,[oid(r),r.params.id,uid(r),r.body.justification]);s.json(x.rows[0])}catch(e){n(e)}})

almeraRouter.get('/audits', requireAnyPermission(['almera.view','almera.audit.view']), async(r,s,n)=>{try{const x=await query(`SELECT a.*,p.name process_name,ap.name plan_name FROM audits a JOIN institutional_processes p ON p.id=a.process_id JOIN audit_plans ap ON ap.id=a.plan_id WHERE a.organization_id=$1 ORDER BY a.created_at DESC`,[oid(r)]);s.json(x.rows)}catch(e){n(e)}})
almeraRouter.post('/audit-plans', requirePermission('almera.audit.create'), async(r,s,n)=>{try{const b=r.body;if(!b.name||!b.objective||!b.scope||!b.criteria)return s.status(400).json({error:'Datos obligatorios incompletos'});const code=`PLA-${b.validity||new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;const x=await query(`INSERT INTO audit_plans(organization_id,code,name,validity,objective,scope,criteria,scheduled_start,scheduled_end,lead_auditor_id,observations,created_by_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[oid(r),code,b.name,b.validity||new Date().getFullYear(),b.objective,b.scope,b.criteria,b.scheduledStart||null,b.scheduledEnd||null,b.leadAuditorId||uid(r),b.observations||'',uid(r)]);s.status(201).json(x.rows[0])}catch(e){n(e)}})
