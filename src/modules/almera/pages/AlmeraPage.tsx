import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, BarChart3, BellRing, CalendarClock, CheckCircle2, ChevronDown, ChevronRight,
  ClipboardCheck, Download, FileText, Filter, History, ListTodo, Map, Paperclip,
  PencilLine, Plus, RotateCcw, Search, Send, Settings, Timer, Upload, X,
} from 'lucide-react'
import { useAuth } from '@/platform/auth/AuthContext'
import { Badge, Button, Card, Field } from '@/shared/ui'
import { DatePicker, PageHeader, Select, moduleIdentity } from '@/design-system'
import { almeraService } from '../services/almeraService'
import type { AlmeraCatalogs, Assistance, AssistanceDashboard, AssistanceDetail, AssistanceFilters, AssistanceStatus } from '../types'

type Area='pending'|'assistances'|'analytics'|'catalogs'
type Tone='neutral'|'success'|'warning'|'danger'|'info'|'accent'

const areas=[
  ['pending','Pendientes',BellRing],
  ['assistances','Todas',ClipboardCheck],
  ['analytics','Balance',FileText],
  ['catalogs','Catálogos',Settings],
] as const

const statusLabels:Record<AssistanceStatus,string>={PENDIENTE:'Pendiente',EN_CURSO:'En curso',COMPLETADA:'Completada',VENCIDA:'Vencida',CANCELADA:'Cancelada'}
const statusTones:Record<AssistanceStatus,Tone>={PENDIENTE:'warning',EN_CURSO:'info',COMPLETADA:'success',VENCIDA:'danger',CANCELADA:'neutral'}
const emptyCatalogs:AlmeraCatalogs={processes:[],modules:[],responsibles:[]}
const emptyDashboard:AssistanceDashboard={summary:{total:0,pending:0,in_progress:0,completed:0,overdue:0,due_soon:0,average_completion:'0'},byModule:[],byProcess:[]}

function inputDate(value:Date){const shifted=new Date(value.getTime()-value.getTimezoneOffset()*60000);return shifted.toISOString().slice(0,16)}
function newForm(){const now=new Date();const commitment=new Date(now);commitment.setDate(commitment.getDate()+7);return {subject:'',processId:'',almeraModuleId:'',receivedAt:inputDate(now),description:'',priority:'MEDIA',commitmentAt:inputDate(commitment),responsibleMembershipId:'',requesterName:'',requesterContact:''}}
function formatDate(value?:string){return value?new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'Sin fecha'}
function formatBytes(value:number){if(value<1024)return `${value} B`;if(value<1048576)return `${(value/1024).toFixed(1)} KB`;return `${(value/1048576).toFixed(1)} MB`}
function urgencyRank(row:Assistance){if(row.overdue)return 0;if(row.due_soon)return 1;if(row.effective_status==='EN_CURSO')return 2;return 3}
function urgencyClass(row:Assistance){if(row.effective_status==='COMPLETADA')return 'completed';if(row.overdue)return 'overdue';if(row.due_soon)return 'due-soon';if(row.effective_status==='EN_CURSO')return 'in-progress';return 'assigned'}
function timeToCommitment(value?:string){
  if(!value)return 'Sin fecha límite'
  const difference=new Date(value).getTime()-Date.now()
  const totalHours=Math.max(1,Math.round(Math.abs(difference)/3600000))
  const duration=totalHours<24?`${totalHours} h`:`${Math.floor(totalHours/24)} d${totalHours%24?` ${totalHours%24} h`:''}`
  return difference<0?`Venció hace ${duration}`:`Vence en ${duration}`
}

export default function AlmeraPage(){
  const {session}=useAuth()
  const [area,setArea]=useState<Area>('pending')
  const [rows,setRows]=useState<Assistance[]>([])
  const [catalogs,setCatalogs]=useState<AlmeraCatalogs>(emptyCatalogs)
  const [dashboard,setDashboard]=useState<AssistanceDashboard>(emptyDashboard)
  const [filters,setFilters]=useState<AssistanceFilters>({})
  const [search,setSearch]=useState('')
  const [form,setForm]=useState(newForm)
  const [showCreate,setShowCreate]=useState(false)
  const [detail,setDetail]=useState<AssistanceDetail|null>(null)
  const [action,setAction]=useState({description:'',result:'',completionPercent:0})
  const [meta,setMeta]=useState({commitmentAt:'',responsibleMembershipId:'',observations:''})
  const [closeForm,setCloseForm]=useState({solution:'',closedAt:inputDate(new Date())})
  const [evidenceDescription,setEvidenceDescription]=useState('')
  const [files,setFiles]=useState<FileList|null>(null)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [busy,setBusy]=useState(false)

  const permissions=session?.permissions||[]
  const has=(...keys:string[])=>keys.some(key=>permissions.includes(key))
  const canCreate=has('technical_assistance.create')
  const canEdit=has('technical_assistance.edit')
  const canClose=has('technical_assistance.close')
  const canExport=has('technical_assistance.export')

  const load=async()=>{
    try{
      setError('')
      const [items,summary]=await Promise.all([almeraService.assistances(filters),almeraService.dashboard(filters)])
      setRows(items);setDashboard(summary)
    }catch(caught){setError(caught instanceof Error?caught.message:'No fue posible cargar las asistencias')}
  }

  useEffect(()=>{void almeraService.catalogs().then(setCatalogs).catch(caught=>setError(caught instanceof Error?caught.message:'No fue posible cargar los catálogos'))},[])
  useEffect(()=>{void load()},[filters.processId,filters.moduleId,filters.status,filters.dateFrom,filters.dateTo])

  const visibleRows=useMemo(()=>{
    const term=search.trim().toLocaleLowerCase('es')
    if(!term)return rows
    return rows.filter(row=>`${row.code} ${row.subject} ${row.process_name} ${row.module_name} ${row.responsible_name||''}`.toLocaleLowerCase('es').includes(term))
  },[rows,search])
  const pendingRows=useMemo(()=>visibleRows
    .filter(row=>row.effective_status!=='COMPLETADA'&&row.effective_status!=='CANCELADA')
    .sort((left,right)=>urgencyRank(left)-urgencyRank(right)||(new Date(left.commitment_at||'2999-12-31').getTime()-new Date(right.commitment_at||'2999-12-31').getTime())),[visibleRows])
  const urgentRows=pendingRows.filter(row=>row.overdue||row.due_soon)

  const openDetail=async(id:string)=>{
    try{
      setError('')
      const result=await almeraService.detail(id)
      setDetail(result)
      setAction({description:'',result:'',completionPercent:result.assistance.completion_percent})
      setMeta({commitmentAt:result.assistance.commitment_at?inputDate(new Date(result.assistance.commitment_at)):'',responsibleMembershipId:result.assistance.responsible_membership_id||'',observations:result.assistance.general_observations||''})
      setCloseForm({solution:'',closedAt:inputDate(new Date())})
      setFiles(null);setEvidenceDescription('')
    }catch(caught){setError(caught instanceof Error?caught.message:'No fue posible abrir el detalle')}
  }

  const refreshAfterMutation=async(message:string)=>{
    if(detail){const fresh=await almeraService.detail(detail.assistance.id);setDetail(fresh);setAction(current=>({...current,description:'',result:'',completionPercent:fresh.assistance.completion_percent}))}
    await load();setNotice(message);window.setTimeout(()=>setNotice(''),3500)
  }

  const run=async(work:()=>Promise<unknown>,message:string)=>{
    setBusy(true);setError('')
    try{await work();await refreshAfterMutation(message)}catch(caught){setError(caught instanceof Error?caught.message:'No fue posible completar la operación')}finally{setBusy(false)}
  }

  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();setBusy(true);setError('')
    try{
      await almeraService.createAssistance({...form,responsibleMembershipId:form.responsibleMembershipId||null,requesterName:form.requesterName||session?.user.fullName})
      setForm(newForm());setShowCreate(false);await load();setNotice('Asistencia registrada correctamente')
    }catch(caught){setError(caught instanceof Error?caught.message:'No fue posible registrar la asistencia')}finally{setBusy(false)}
  }

  const exportCsv=async()=>{setBusy(true);try{await almeraService.exportCsv({...filters,q:search});setNotice('Archivo CSV generado')}catch(caught){setError(caught instanceof Error?caught.message:'No fue posible exportar')}finally{setBusy(false)}}

  return <div className="almera-shell mission-module mx-auto max-w-[1500px] space-y-5">
    <PageHeader eyebrow="Control operativo" title="Asistencias Técnicas" description="Prioriza compromisos, registra avances y mantén cada solicitud bajo control." identity={moduleIdentity('almera')} actions={<>{canExport&&<Button variant="secondary" onClick={()=>void exportCsv()} disabled={busy}><Download size={16}/>Exportar CSV</Button>}{canCreate&&<Button onClick={()=>setShowCreate(true)}><Plus size={16}/>Nueva asistencia</Button>}</>}/>

    <nav className="almera-nav assistance-nav" aria-label="Vistas de asistencias">{areas.map(([key,label,Icon])=><button key={key} className={`${area===key?'active ':''}${key==='pending'?'nav-primary':''}`} onClick={()=>setArea(key)}><Icon size={17}/><span>{label}</span>{key==='pending'&&urgentRows.length>0&&<b>{urgentRows.length}</b>}</button>)}</nav>
    {error&&<div className="almera-alert"><AlertTriangle size={17}/><span>{error}</span><button onClick={()=>setError('')}><X size={15}/></button></div>}
    {notice&&<div className="almera-notice"><CheckCircle2 size={17}/>{notice}</div>}

    {area==='pending'?<PendingView rows={pendingRows} search={search} setSearch={setSearch} openDetail={openDetail} filters={<FilterPanel catalogs={catalogs} filters={filters} setFilters={setFilters} pendingOnly/>}/>:<>
      {area!=='catalogs'&&<FilterPanel catalogs={catalogs} filters={filters} setFilters={setFilters}/>}
      {area==='assistances'&&<AssistanceTable title="Todas las asistencias" caption={`${visibleRows.length} registros con los filtros actuales`} rows={visibleRows} search={search} setSearch={setSearch} openDetail={openDetail}/>}
      {area==='analytics'&&<AnalyticsView dashboard={dashboard}/>}
      {area==='catalogs'&&<CatalogsView catalogs={catalogs}/>}
    </>}

    {showCreate&&<CreateDialog catalogs={catalogs} form={form} setForm={setForm} submit={submit} close={()=>setShowCreate(false)} busy={busy}/>}
    {detail&&<DetailDialog detail={detail} close={()=>setDetail(null)} canEdit={canEdit} canClose={canClose} busy={busy} action={action} setAction={setAction} meta={meta} setMeta={setMeta} closeForm={closeForm} setCloseForm={setCloseForm} files={files} setFiles={setFiles} evidenceDescription={evidenceDescription} setEvidenceDescription={setEvidenceDescription} catalogs={catalogs}
      addAction={()=>void run(()=>almeraService.addAction(detail.assistance.id,action),'Avance y comentario guardados')}
      saveMeta={()=>void run(()=>almeraService.update(detail.assistance.id,{...meta,responsibleMembershipId:meta.responsibleMembershipId||null}),'Datos de seguimiento actualizados')}
      uploadEvidence={()=>files&&void run(()=>almeraService.uploadEvidence(detail.assistance.id,files,evidenceDescription),'Evidencia adjuntada')}
      closeAssistance={()=>void run(()=>almeraService.close(detail.assistance.id,{solution:closeForm.solution,closedAt:closeForm.closedAt||null}),'Asistencia cerrada al 100%')}
      reopen={()=>{const justification=window.prompt('Justificación para reabrir la asistencia');if(justification)void run(()=>almeraService.reopen(detail.assistance.id,justification),'Asistencia reabierta')}}/>}
  </div>
}

function FilterPanel({catalogs,filters,setFilters,pendingOnly=false}:{catalogs:AlmeraCatalogs;filters:AssistanceFilters;setFilters:React.Dispatch<React.SetStateAction<AssistanceFilters>>;pendingOnly?:boolean}){
  const [showMore,setShowMore]=useState(Boolean(filters.moduleId||filters.dateFrom||filters.dateTo))
  const [filtersOpen,setFiltersOpen]=useState(!pendingOnly)
  const update=(key:keyof AssistanceFilters,value:string)=>setFilters(current=>({...current,[key]:value||undefined}))
  const activeCount=[filters.processId,filters.moduleId,filters.status,filters.dateFrom,filters.dateTo].filter(Boolean).length
  const clear=()=>{setFilters({});setShowMore(false)}
  const statuses:[AssistanceStatus|undefined,string][]=pendingOnly
    ?[[undefined,'Todos'],['VENCIDA','Vencidas'],['EN_CURSO','En curso'],['PENDIENTE','Sin iniciar']]
    :[[undefined,'Todos'],['PENDIENTE','Pendientes'],['EN_CURSO','En curso'],['VENCIDA','Vencidas'],['COMPLETADA','Completadas']]
  return <Card className={`assistance-filter-panel ${!filtersOpen?'is-collapsed':''}`}>
    <header className="filter-panel-head">
      <div className="filter-heading"><span><Filter size={17}/></span><div><strong>{pendingOnly?'Filtros opcionales':'Filtrar resultados'}</strong><small>{pendingOnly?'Ábrelos solo cuando necesites acotar la bandeja.':'Selecciona una vista rápida. Los cambios se aplican automáticamente.'}</small></div></div>
      <div className="filter-panel-actions">
        {activeCount>0&&<button type="button" className="filter-clear" onClick={clear}><RotateCcw size={14}/>Limpiar <b>{activeCount}</b></button>}
        {filtersOpen&&<button type="button" className="filter-more" aria-expanded={showMore} onClick={()=>setShowMore(current=>!current)}>Más filtros <ChevronDown size={15}/></button>}
        {pendingOnly&&<button type="button" className="filter-visibility" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(current=>!current)}><Filter size={14}/>{filtersOpen?'Ocultar filtros':'Filtrar'}</button>}
      </div>
    </header>
    {filtersOpen&&<><div className="filter-primary">
      <div className="filter-field"><span>Proceso</span><Select value={filters.processId||''} onChange={value=>update('processId',value)} placeholder="Todos los procesos" options={catalogs.processes.map(item=>({value:item.id,label:item.name}))}/></div>
      <fieldset className="filter-status"><legend>Estado</legend><div>{statuses.map(([value,label])=><button type="button" key={label} className={(filters.status||undefined)===value?'active':''} onClick={()=>update('status',value||'')}>{label}</button>)}</div></fieldset>
    </div>
    {showMore&&<div className="filter-advanced">
      <div className="filter-field"><span>Módulo ALMERA</span><Select value={filters.moduleId||''} onChange={value=>update('moduleId',value)} placeholder="Todos los módulos" options={catalogs.modules.map(item=>({value:item.id,label:item.name}))}/></div>
      <div className="filter-date-range"><span>Fecha de solicitud</span><div><label>Desde<DatePicker value={filters.dateFrom||''} onChange={value=>update('dateFrom',value)}/></label><label>Hasta<DatePicker value={filters.dateTo||''} onChange={value=>update('dateTo',value)}/></label></div></div>
    </div>}</>}
  </Card>
}

function PendingView({rows,search,setSearch,openDetail,filters}:{rows:Assistance[];search:string;setSearch:(value:string)=>void;openDetail:(id:string)=>Promise<void>;filters:React.ReactNode}){
  const overdue=rows.filter(row=>row.overdue).length
  const dueSoon=rows.filter(row=>row.due_soon&&!row.overdue).length
  const inProgress=rows.filter(row=>row.effective_status==='EN_CURSO'&&!row.overdue&&!row.due_soon).length
  const assigned=rows.filter(row=>row.effective_status==='PENDIENTE'&&!row.overdue&&!row.due_soon).length
  return <div className="mission-workspace">
    <section className="mission-control" aria-labelledby="mission-title">
      <div className="mission-copy"><p>Estado actual</p><h2 id="mission-title">Resumen de prioridad</h2><span>{rows.length} solicitudes requieren seguimiento · {assigned} aún sin iniciar</span></div>
      <div className="mission-counts" aria-label="Resumen urgente">
        <article className={`mission-counts-hero is-overdue ${overdue>0?'has-value':''}`}><AlertTriangle size={24}/><strong>{overdue}</strong><span>vencidas</span></article>
        <div className="mission-counts-secondary">
          <article className={`is-due ${dueSoon>0?'has-value':''}`}><Timer size={16}/><strong>{dueSoon}</strong><span>por vencer en 48 h</span></article>
          <article className={`is-course ${inProgress>0?'has-value':''}`}><ClipboardCheck size={16}/><strong>{inProgress}</strong><span>en curso</span></article>
        </div>
      </div>
    </section>

    {filters}

    <section className="mission-queue" aria-labelledby="queue-title">
      <header className="mission-queue-head"><div><p>Orden automático por riesgo</p><h2 id="queue-title">Bandeja de pendientes</h2><span>Vencidas primero, luego próximas a vencer, en curso y sin iniciar.</span></div><label><Search size={16}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar código, asunto, proceso o responsable"/></label></header>
      <div className="mission-list">
        {rows.map(row=>{
          const urgency=urgencyClass(row)
          const UrgencyIcon=row.overdue?AlertTriangle:row.due_soon?Timer:ClipboardCheck
          const urgencyLabel=row.overdue?'Atención inmediata':row.due_soon?'Próxima al límite':row.effective_status==='EN_CURSO'?'En seguimiento':'Sin iniciar'
          return <button type="button" className={`mission-item is-${urgency}`} key={row.id} onClick={()=>void openDetail(row.id)} aria-label={`Abrir ${row.code}: ${row.subject}`}>
            <span className="mission-signal"><UrgencyIcon size={18}/></span>
            <span className="mission-main"><span className="mission-item-top"><b>{row.code}</b><em>{urgencyLabel}</em>{(row.priority==='ALTA'||row.priority==='CRITICA')&&<small className={`priority-${row.priority.toLowerCase()}`}>{row.priority}</small>}</span><strong>{row.subject}</strong><span className="mission-context">{row.process_name}<i/> {row.module_name}</span></span>
            <span className="mission-deadline"><small>Compromiso</small><strong>{timeToCommitment(row.commitment_at)}</strong><time>{formatDate(row.commitment_at)}</time></span>
            <span className="mission-owner"><small>Responsable</small><strong>{row.responsible_name||'Sin asignar'}</strong></span>
            <span className="mission-progress"><span><small>Avance</small><strong>{row.completion_percent}%</strong></span><i><b style={{width:`${row.completion_percent}%`}}/></i></span>
            <ChevronRight className="mission-open" size={18}/>
          </button>
        })}
        {!rows.length&&<div className="mission-empty"><CheckCircle2 size={32}/><h3>Radar despejado</h3><p>No hay solicitudes pendientes para los filtros seleccionados.</p></div>}
      </div>
    </section>
  </div>
}

function AssistanceTable({title,caption,rows,search,setSearch,openDetail}:{title:string;caption:string;rows:Assistance[];search:string;setSearch:(value:string)=>void;openDetail:(id:string)=>Promise<void>}){
  return <Card className="overflow-hidden almera-panel">
    <div className="table-toolbar"><PanelTitle icon={ListTodo} title={title} caption={caption}/><label><Search size={16}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar código, asunto, proceso o módulo"/></label></div>
    <div className="overflow-x-auto"><table className="data-table assistance-table min-w-[1120px]"><thead><tr><th>Solicitud</th><th>Proceso / módulo</th><th>Compromiso</th><th>Responsable</th><th>Avance</th><th>Estado</th><th></th></tr></thead><tbody>
      {rows.map(row=><tr key={row.id} className={`assistance-state-${urgencyClass(row)}`}><td><strong>{row.code}</strong><small>{row.subject}</small></td><td><strong>{row.process_name}</strong><small>{row.module_name}</small></td><td>{formatDate(row.commitment_at)}{row.overdue&&<small className="danger-text">{timeToCommitment(row.commitment_at)}</small>}{row.due_soon&&!row.overdue&&<small className="warning-text">{timeToCommitment(row.commitment_at)}</small>}</td><td>{row.responsible_name||'Sin asignar'}</td><td><Progress value={row.completion_percent}/></td><td><StatusPill status={row.effective_status}/></td><td><button className="row-action" onClick={()=>void openDetail(row.id)}>Ver detalle <ChevronRight size={14}/></button></td></tr>)}
      {!rows.length&&<tr><td colSpan={7}><div className="almera-empty"><ClipboardCheck size={30}/><p>No hay asistencias para los filtros seleccionados.</p></div></td></tr>}
    </tbody></table></div>
  </Card>
}

function AnalyticsView({dashboard}:{dashboard:AssistanceDashboard}){
  return <div className="analytics-grid"><RankPanel title="Asistencias por módulo ALMERA" caption="Carga y porcentaje promedio" rows={dashboard.byModule}/><RankPanel title="Asistencias por proceso" caption="Procesos con mayor demanda" rows={dashboard.byProcess}/></div>
}

function RankPanel({title,caption,rows}:{title:string;caption:string;rows:{id:string;name:string;total:number;average_completion:string}[]}){
  const max=Math.max(1,...rows.map(row=>row.total))
  return <Card className="almera-panel"><PanelTitle icon={BarChart3} title={title} caption={caption}/><div className="analytics-list">{rows.slice(0,19).map(row=><article key={row.id}><header><span>{row.name}</span><strong>{row.total}</strong></header><div><i style={{width:`${row.total/max*100}%`}}/></div><small>{row.average_completion}% de avance promedio</small></article>)}{!rows.length&&<div className="almera-empty">No hay datos para consolidar.</div>}</div></Card>
}

function CatalogsView({catalogs}:{catalogs:AlmeraCatalogs}){
  return <div className="catalog-grid"><Card className="almera-panel"><PanelTitle icon={Map} title="Procesos institucionales" caption={`${catalogs.processes.length} procesos activos`}/><div className="catalog-list">{catalogs.processes.map(item=><div key={item.id}><span>{item.code}</span><strong>{item.name}</strong><Badge tone="info">{item.classification.replaceAll('_',' ')}</Badge></div>)}</div></Card><Card className="almera-panel"><PanelTitle icon={Settings} title="Módulos ALMERA" caption={`${catalogs.modules.length} opciones de asistencia`}/><div className="catalog-list">{catalogs.modules.map(item=><div key={item.id}><span>{item.code}</span><strong>{item.name}</strong></div>)}</div></Card></div>
}

function CreateDialog({catalogs,form,setForm,submit,close,busy}:{catalogs:AlmeraCatalogs;form:ReturnType<typeof newForm>;setForm:React.Dispatch<React.SetStateAction<ReturnType<typeof newForm>>>;submit:(event:React.FormEvent)=>Promise<void>;close:()=>void;busy:boolean}){
  return <div className="almera-modal"><Card className="almera-dialog"><DialogHead eyebrow="Registro rápido" title="Nueva asistencia técnica" close={close}/><form onSubmit={submit} className="dialog-form">
    <Field label="Asunto"><input required maxLength={180} value={form.subject} onChange={event=>setForm({...form,subject:event.target.value})} placeholder="Resumen breve de la solicitud"/></Field>
    <Field label="Fecha de solicitud"><input required type="datetime-local" value={form.receivedAt} onChange={event=>setForm({...form,receivedAt:event.target.value})}/></Field>
    <Field label="Proceso solicitante"><select required value={form.processId} onChange={event=>setForm({...form,processId:event.target.value})}><option value="">Seleccionar proceso</option>{catalogs.processes.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
    <Field label="Módulo ALMERA relacionado"><select required value={form.almeraModuleId} onChange={event=>setForm({...form,almeraModuleId:event.target.value})}><option value="">Seleccionar módulo</option>{catalogs.modules.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
    <Field label="Fecha compromiso"><input required type="datetime-local" min={form.receivedAt} value={form.commitmentAt} onChange={event=>setForm({...form,commitmentAt:event.target.value})}/></Field>
    <Field label="Responsable"><select value={form.responsibleMembershipId} onChange={event=>setForm({...form,responsibleMembershipId:event.target.value})}><option value="">Sin asignar</option>{catalogs.responsibles.map(item=><option key={item.id} value={item.id}>{item.full_name}</option>)}</select></Field>
    <Field label="Prioridad"><select value={form.priority} onChange={event=>setForm({...form,priority:event.target.value})}>{['BAJA','MEDIA','ALTA','CRITICA'].map(item=><option key={item}>{item}</option>)}</select></Field>
    <Field label="Persona solicitante (opcional)"><input value={form.requesterName} onChange={event=>setForm({...form,requesterName:event.target.value})} placeholder="Por defecto, el usuario actual"/></Field>
    <div className="full"><Field label="Descripción de la solicitud"><textarea required rows={5} value={form.description} onChange={event=>setForm({...form,description:event.target.value})} placeholder="¿Qué necesita el proceso?"/></Field></div>
    <div className="dialog-actions"><Button type="button" variant="secondary" onClick={close}>Cancelar</Button><Button disabled={busy}>{busy?'Registrando...':'Registrar asistencia'}</Button></div>
  </form></Card></div>
}

interface DetailProps {detail:AssistanceDetail;close:()=>void;canEdit:boolean;canClose:boolean;busy:boolean;action:{description:string;result:string;completionPercent:number};setAction:React.Dispatch<React.SetStateAction<{description:string;result:string;completionPercent:number}>>;meta:{commitmentAt:string;responsibleMembershipId:string;observations:string};setMeta:React.Dispatch<React.SetStateAction<{commitmentAt:string;responsibleMembershipId:string;observations:string}>>;closeForm:{solution:string;closedAt:string};setCloseForm:React.Dispatch<React.SetStateAction<{solution:string;closedAt:string}>>;files:FileList|null;setFiles:(files:FileList|null)=>void;evidenceDescription:string;setEvidenceDescription:(value:string)=>void;catalogs:AlmeraCatalogs;addAction:()=>void;saveMeta:()=>void;uploadEvidence:()=>void;closeAssistance:()=>void;reopen:()=>void}
function DetailDialog(props:DetailProps){
  const {detail,close,canEdit,canClose,busy,action,setAction,meta,setMeta,closeForm,setCloseForm,files,setFiles,evidenceDescription,setEvidenceDescription,catalogs,addAction,saveMeta,uploadEvidence,closeAssistance,reopen}=props
  const item=detail.assistance;const completed=item.effective_status==='COMPLETADA'
  return <div className="almera-modal detail-modal"><Card className="almera-dialog assistance-detail"><DialogHead eyebrow={`${item.code} · ${item.process_code||''}`} title={item.subject} close={close}/>
    <div className="detail-summary"><StatusPill status={item.effective_status}/><span><CalendarClock size={14}/> {formatDate(item.commitment_at)}</span><span>{item.module_name}</span><Progress value={item.completion_percent}/></div>
    <div className="detail-grid"><section className="detail-main">
      <article className="detail-block"><h3>Solicitud original</h3><p>{item.description}</p><dl><div><dt>Proceso</dt><dd>{item.process_name}</dd></div><div><dt>Responsable</dt><dd>{item.responsible_name||'Sin asignar'}</dd></div><div><dt>Solicitada</dt><dd>{formatDate(item.received_at)}</dd></div><div><dt>Solicitante</dt><dd>{item.requester_name}</dd></div></dl></article>

      {canEdit&&!completed&&<article className="detail-block"><h3><PencilLine size={17}/> Diligenciar avance</h3><Field label="Descripción de lo realizado / comentario"><textarea rows={4} value={action.description} onChange={event=>setAction({...action,description:event.target.value})} placeholder="Registra la actuación para la bitácora"/></Field><div className="progress-editor"><label>Porcentaje de cumplimiento <strong>{action.completionPercent}%</strong><input type="range" min="0" max="99" value={action.completionPercent} onChange={event=>setAction({...action,completionPercent:Number(event.target.value)})}/></label><input aria-label="Porcentaje" type="number" min="0" max="99" value={action.completionPercent} onChange={event=>setAction({...action,completionPercent:Number(event.target.value)})}/></div><Field label="Resultado (opcional)"><input value={action.result} onChange={event=>setAction({...action,result:event.target.value})}/></Field><Button onClick={addAction} disabled={busy||!action.description.trim()}><Send size={15}/>Guardar en bitácora</Button></article>}

      <article className="detail-block"><h3><History size={17}/> Bitácora de actuaciones</h3><div className="timeline">{detail.actions.map(entry=><div key={entry.id}><i/><span><strong>{entry.performed_by}</strong><time>{formatDate(entry.performed_at)}</time></span><p>{entry.description}</p>{entry.result&&<small>Resultado: {entry.result}</small>}{entry.completion_percent!=null&&<Badge tone="info">Avance {entry.completion_percent}%</Badge>}</div>)}{!detail.actions.length&&<p className="muted-copy">Aún no se han registrado actuaciones.</p>}</div></article>
    </section><aside className="detail-side">
      {canEdit&&!completed&&<article className="detail-block"><h3>Seguimiento</h3><Field label="Fecha compromiso"><input type="datetime-local" value={meta.commitmentAt} onChange={event=>setMeta({...meta,commitmentAt:event.target.value})}/></Field><Field label="Responsable"><select value={meta.responsibleMembershipId} onChange={event=>setMeta({...meta,responsibleMembershipId:event.target.value})}><option value="">Sin asignar</option>{catalogs.responsibles.map(person=><option key={person.id} value={person.id}>{person.full_name}</option>)}</select></Field><Field label="Observaciones generales"><textarea rows={3} value={meta.observations} onChange={event=>setMeta({...meta,observations:event.target.value})}/></Field><Button variant="secondary" onClick={saveMeta} disabled={busy}>Actualizar seguimiento</Button></article>}

      <article className="detail-block"><h3><Paperclip size={17}/> Evidencias ({detail.evidences.length})</h3>{canEdit&&!completed&&<><Field label="Descripción"><input value={evidenceDescription} onChange={event=>setEvidenceDescription(event.target.value)} placeholder="Descripción opcional"/></Field><label className="file-picker"><Upload size={18}/><span>{files?.length?`${files.length} archivo(s) seleccionado(s)`:'PDF, imágenes, Word, Excel, CSV o texto'}</span><input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.csv,.txt" onChange={event=>setFiles(event.target.files)}/></label><Button variant="secondary" disabled={busy||!files?.length} onClick={uploadEvidence}>Adjuntar evidencia</Button></>}
        <div className="evidence-list">{detail.evidences.map(file=><a key={file.id} href={`/api/almera/assistances/${item.id}/evidences/${file.id}/download`}><FileText size={16}/><span><strong>{file.original_name}</strong><small>{formatBytes(file.size_bytes)} · {file.uploaded_by}</small></span><Download size={14}/></a>)}</div>
      </article>

      {canClose&&!completed&&<article className="detail-block close-block"><h3><CheckCircle2 size={17}/> Cierre manual</h3><Field label="Descripción final de lo realizado"><textarea rows={4} value={closeForm.solution} onChange={event=>setCloseForm({...closeForm,solution:event.target.value})}/></Field><Field label="Fecha real de cierre"><input type="datetime-local" value={closeForm.closedAt} onChange={event=>setCloseForm({...closeForm,closedAt:event.target.value})}/></Field><Button disabled={busy||!closeForm.solution.trim()} onClick={closeAssistance}>Marcar completada al 100%</Button></article>}
      {canClose&&completed&&<article className="detail-block"><h3>Asistencia completada</h3><p>{item.final_solution}</p><small>Cerrada: {formatDate(item.closed_at)}</small><Button variant="secondary" onClick={reopen} disabled={busy}><RotateCcw size={15}/>Reabrir con justificación</Button></article>}
    </aside></div>
  </Card></div>
}

function DialogHead({eyebrow,title,close}:{eyebrow:string;title:string;close:()=>void}){return <div className="dialog-head"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><button aria-label="Cerrar" onClick={close}><X/></button></div>}
function PanelTitle({icon:Icon,title,caption}:{icon:typeof BarChart3;title:string;caption:string}){return <div className="almera-panel-title"><span><Icon size={19}/></span><div><h2>{title}</h2><p>{caption}</p></div></div>}
function StatusPill({status}:{status:AssistanceStatus}){return <Badge tone={statusTones[status]}>{statusLabels[status]}</Badge>}
function Progress({value}:{value:number}){return <div className="progress-cell"><span><i style={{width:`${value}%`}}/></span><strong>{value}%</strong></div>}
