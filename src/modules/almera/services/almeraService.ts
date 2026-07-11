import type { AlmeraCatalogs, Assistance, AssistanceMetrics, AlmeraRecord } from '../types'

async function call<T>(path:string,init?:RequestInit):Promise<T>{const response=await fetch(`/api/almera${path}`,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(init?.headers||{})},...init});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'No fue posible completar la operación');return data}
export const almeraService={
 catalogs:()=>call<AlmeraCatalogs>('/catalogs'),
 assistances:(q='')=>call<Assistance[]>(`/assistances${q?`?q=${encodeURIComponent(q)}`:''}`),
 metrics:()=>call<AssistanceMetrics>('/metrics'),
 createAssistance:(data:Record<string,unknown>)=>call<Assistance>('/assistances',{method:'POST',body:JSON.stringify(data)}),
 addAction:(id:string,data:Record<string,unknown>)=>call(`/assistances/${id}/actions`,{method:'POST',body:JSON.stringify(data)}),
 close:(id:string,data:Record<string,unknown>)=>call(`/assistances/${id}/close`,{method:'POST',body:JSON.stringify(data)}),
 audits:()=>call<unknown[]>('/audits'),
 createAuditPlan:(data:Record<string,unknown>)=>call('/audit-plans',{method:'POST',body:JSON.stringify(data)}),
}

export async function listAlmeraRecords():Promise<AlmeraRecord[]>{
 const rows=await almeraService.assistances()
 return rows.map(x=>({id:x.code,request:x.subject,process:x.process_name,document:x.module_name,activity:'Asistencia tecnica',evidence:'',report:'',status:x.status==='COMPLETADA'?'CLOSED':x.status==='CANCELADA'?'RETURNED':'IN_REVIEW',managementType:'SOPORTE',responsible:x.responsible_name||'Sin asignar',registeredAt:x.received_at,observations:x.overdue?'Asistencia vencida':''}))
}
