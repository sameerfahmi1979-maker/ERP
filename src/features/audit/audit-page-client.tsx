"use client";
import {useEffect,useLayoutEffect,useMemo,useRef,useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import type {PaginationState,SortingState,Updater} from "@tanstack/react-table";
import type {AuthContext} from "@/lib/rbac/check";
import {hasPermission} from "@/lib/rbac/scope";
import type {AuditLog} from "@/types/domain";
import {hrReadIdentity} from "@/lib/reads/hr-read-identity";
import {auditCriteriaSchema,auditPageSchema,auditDetailSchema,type AuditCriteria,type AuditPage} from "@/lib/reads/audit-schema";
import {readJson,ReadError,retryAuthorizedRead} from "@/lib/reads/client";
import {collectCompletePages} from "@/lib/reads/complete-pages";
import {AuditLogsTable} from "./audit-logs-table";
const resolve=<T,>(change:Updater<T>,value:T)=>typeof change==="function"?(change as (v:T)=>T)(value):change;
const asLog=(row:AuditPage["rows"][number]):AuditLog=>({...row,branch_id:null,owner_company_id:null,ip_address:null,user_agent:null,old_values:null,new_values:null});
function Detail({id,identity}:{id:number;identity:string}){
  const [open,setOpen]=useState(false);
  const query=useQuery({queryKey:["audit",identity,"detail",id],enabled:open,gcTime:0,staleTime:0,retry:retryAuthorizedRead,
    queryFn:async({signal})=>{const r=await readJson<{success:true;data:unknown}>("audit",{mode:"detail",id},signal);const data=auditDetailSchema.parse(r.data);if(data.id!==id)throw Error("Audit detail mismatch");return data;}});
  return <div><button type="button" className="underline" onClick={()=>setOpen(v=>!v)}>{open?"Hide details":"Details"}</button>{open&&(query.isFetching?<p role="status">Loading details…</p>:query.isError?<p role="alert">Details unavailable.</p>:query.data?<pre className="max-w-sm max-h-48 overflow-auto text-xs whitespace-pre-wrap">{JSON.stringify({before:query.data.old_values,after:query.data.new_values},null,2)}</pre>:null)}</div>;
}
export function AuditPageClient({authContext,filters}:{authContext:AuthContext;filters:Partial<AuditCriteria>}){
  return <AuditSession key={JSON.stringify([hrReadIdentity(authContext),filters])} authContext={authContext} filters={filters}/>;
}
function AuditSession({authContext,filters}:{authContext:AuthContext;filters:Partial<AuditCriteria>}){
  const identity=hrReadIdentity(authContext),qc=useQueryClient();
  const [pagination,setPagination]=useState<PaginationState>({pageIndex:0,pageSize:50}),[sorting,setSorting]=useState<SortingState>([{id:"created_at",desc:true}]);
  const [search,setSearch]=useState(filters.search??""),[settled,setSettled]=useState(search),[terminal,setTerminal]=useState(false);
  useEffect(()=>{const timer=setTimeout(()=>setSettled(search),250);return()=>clearTimeout(timer);},[search]);
  const sort=sorting[0]?.id==="actor"?"actor_user_profile_id":sorting[0]?.id??"created_at";
  const parsed=auditCriteriaSchema.safeParse({...filters,search:settled,page:pagination.pageIndex+1,pageSize:pagination.pageSize,sort,direction:sorting[0]?.desc===false?"asc":"desc"});
  const params=parsed.success?parsed.data:null,serialized=JSON.stringify(params),aligned=search===settled;
  const admitted=!!authContext.profile?.id&&authContext.isAccountActive&&!authContext.profile.must_change_password&&hasPermission(authContext,"audit.view");
  const generation=useMemo(()=>({identity,serialized,search}),[identity,serialized,search]);
  const key=["audit",identity,"page",params];
  const query=useQuery({queryKey:key,enabled:!!params&&admitted&&aligned&&!terminal,gcTime:0,staleTime:15000,retry:retryAuthorizedRead,
    queryFn:async({signal})=>{const r=await readJson<{success:true;data:unknown}>("audit",params!,signal),page=auditPageSchema.parse(r.data);if(JSON.stringify(page.criteria)!==serialized)throw Error("Audit criteria mismatch");return page;}});
  const denied=!admitted||terminal||query.error instanceof ReadError&&[401,403].includes(query.error.status);
  if(denied&&!terminal)setTerminal(true);
  const page=aligned&&!denied&&!query.isFetching&&!query.isError?query.data:undefined;
  const max=page?Math.max(0,Math.ceil(page.totalCount/pagination.pageSize)-1):null;
  if(max!==null&&pagination.pageIndex>max)setPagination({...pagination,pageIndex:max});
  const current=useRef<{generation:object;ready:boolean}|null>(null),exports=useRef(new Set<AbortController>());
  useLayoutEffect(()=>{current.current={generation,ready:!!page&&!denied};const pending=exports.current;return()=>{current.current=null;for(const c of pending)c.abort();};},[generation,page,denied]);
  const currentData=()=>{const state=qc.getQueryState<AuditPage>(key);return current.current?.generation===generation&&current.current.ready&&state?.status==="success"&&state.fetchStatus==="idle"&&!state.isInvalidated&&state.data===page;};
  const loadExportData=async()=>{
    if(!params||!page||denied||!currentData())throw Error("Audit access must be verified before exporting");
    const controller=new AbortController();exports.current.add(controller);
    try{
      const rows=await collectCompletePages(async(from)=>{
        if(!currentData())throw Error("Audit export retired");
        const criteria={...params,page:Math.floor(from/200)+1,pageSize:200};
        const r=await readJson<{success:true;data:unknown}>("audit",criteria,controller.signal),p=auditPageSchema.parse(r.data);
        if(!currentData()||JSON.stringify(p.criteria)!==JSON.stringify(criteria))throw Error("Audit export retired");
        return{data:p.rows,count:p.totalCount,error:null};
      },{batchSize:200,maxRows:50000,identity:r=>r.id,signal:controller.signal});
      if(!currentData())throw Error("Audit export retired");return rows.map(asLog);
    }finally{exports.current.delete(controller);}
  };
  return <div>{denied?<p role="alert">Audit access is unavailable.</p>:!parsed.success?<p role="alert">Check the audit filters.</p>:query.isError?<div role="alert">Audit records could not be loaded. <button className="underline" onClick={()=>{if(current.current?.generation===generation&&!denied)void query.refetch();}}>Retry</button></div>:null}
    <AuditLogsTable data={page?.rows.map(asLog)??[]} userProfileId={authContext.profile?.id} isLoading={admitted&&!denied&&(!aligned||query.isFetching)} renderDetails={row=><Detail key={serialized+row.id} id={row.id} identity={identity}/>}
      serverRead={{pagination,sorting,globalFilter:search,columnFilters:[],totalCount:page?.totalCount??null,filters:[],
        onPaginationChange:change=>setPagination(p=>resolve(change,p)),onSortingChange:change=>{setSorting(s=>resolve(change,s));setPagination(p=>({...p,pageIndex:0}));},
        onGlobalFilterChange:change=>{setSearch(s=>resolve(change,s));setPagination(p=>({...p,pageIndex:0}));},onColumnFiltersChange:()=>{},loadExportData}}
      exportConfig={{title:"Audit Logs",subtitle:"All matching permitted audit metadata",filename:"audit_logs",generatedBy:authContext.profile?.display_name??"ERP user"}}/>
  </div>;
}
