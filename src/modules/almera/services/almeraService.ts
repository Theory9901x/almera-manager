import type { AlmeraCatalogs, Assistance, AssistanceDashboard, AssistanceDetail, AssistanceFilters, AlmeraRecord } from '../types'

async function call<T>(path:string,init?:RequestInit):Promise<T>{
  const response=await fetch(`/api/almera${path}`,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(init?.headers||{})},...init})
  const data=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(data.error||'No fue posible completar la operación')
  return data
}

function params(filters:AssistanceFilters={}){
  const query=new URLSearchParams()
  Object.entries(filters).forEach(([key,value])=>{if(value)query.set(key,value)})
  const value=query.toString()
  return value?`?${value}`:''
}

export const almeraService={
  catalogs:()=>call<AlmeraCatalogs>('/catalogs'),
  assistances:(filters:AssistanceFilters={})=>call<Assistance[]>(`/assistances${params(filters)}`),
  dashboard:(filters:AssistanceFilters={})=>call<AssistanceDashboard>(`/assistances/dashboard${params(filters)}`),
  createAssistance:(data:Record<string,unknown>)=>call<Assistance>('/assistances',{method:'POST',body:JSON.stringify(data)}),
  detail:(id:string)=>call<AssistanceDetail>(`/assistances/${id}`),
  update:(id:string,data:Record<string,unknown>)=>call<Assistance>(`/assistances/${id}`,{method:'PATCH',body:JSON.stringify(data)}),
  addAction:(id:string,data:Record<string,unknown>)=>call(`/assistances/${id}/actions`,{method:'POST',body:JSON.stringify(data)}),
  close:(id:string,data:Record<string,unknown>)=>call(`/assistances/${id}/close`,{method:'POST',body:JSON.stringify(data)}),
  reopen:(id:string,justification:string)=>call(`/assistances/${id}/reopen`,{method:'POST',body:JSON.stringify({justification})}),
  uploadEvidence:async(id:string,files:FileList,description:string)=>{
    const body=new FormData()
    Array.from(files).forEach(file=>body.append('files',file))
    body.append('description',description)
    const response=await fetch(`/api/almera/assistances/${id}/evidences`,{method:'POST',credentials:'same-origin',body})
    const data=await response.json().catch(()=>({}))
    if(!response.ok)throw new Error(data.error||'No fue posible cargar la evidencia')
    return data
  },
  exportCsv:async(filters:AssistanceFilters={})=>{
    const response=await fetch(`/api/almera/assistances/export.csv${params(filters)}`,{credentials:'same-origin'})
    if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||'No fue posible exportar')}
    const blob=await response.blob()
    const url=URL.createObjectURL(blob)
    const anchor=document.createElement('a')
    anchor.href=url
    anchor.download=`asistencias-tecnicas-${new Date().toISOString().slice(0,10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  },
  audits:()=>call<unknown[]>('/audits'),
  createAuditPlan:(data:Record<string,unknown>)=>call('/audit-plans',{method:'POST',body:JSON.stringify(data)}),
}

export async function listAlmeraRecords():Promise<AlmeraRecord[]>{
  const rows=await almeraService.assistances()
  return rows.map(x=>({id:x.code,request:x.subject,process:x.process_name,document:x.module_name,activity:'Asistencia técnica',evidence:'',report:'',status:x.effective_status==='COMPLETADA'?'CLOSED':x.effective_status==='CANCELADA'?'RETURNED':'IN_REVIEW',managementType:'SOPORTE',responsible:x.responsible_name||'Sin asignar',registeredAt:x.received_at,observations:x.overdue?'Asistencia vencida':''}))
}
