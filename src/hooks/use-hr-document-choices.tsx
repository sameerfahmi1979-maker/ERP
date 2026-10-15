"use client";
import {useId,useLayoutEffect,useMemo,useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {Button} from "@/components/ui/button";
import {ReadError,readJson,retryAuthorizedRead} from "@/lib/reads/client";
import {hrDocumentPage} from "@/lib/reads/hr-document-choices-schema";
import {useReadLifetime} from "./use-read-lifetime";
import {useRecordReadActive} from "./use-record-read-active";
const generations=new WeakMap<object,number>();let sequence=0;
function generationId(value?:object){if(!value)return 0;let id=generations.get(value);if(!id){id=++sequence;generations.set(value,id);}return id;}
export function useHrDocumentChoiceOwner(employeeId:number,generation?:object){return `${useId()}:${employeeId}:${generationId(generation)}`;}
export function useHrDocumentChoices(employeeId:number,mode:"library"|"wizard",search:string,enabled:boolean,generation?:object,dependentId:number|null=null,target:"employee"|"dependent"="employee"){
 const instance=useId(),owner=`${instance}:${employeeId}:${generationId(generation)}:${dependentId}:${target}`,active=useRecordReadActive()&&enabled,qc=useQueryClient();
 const criteria=JSON.stringify([owner,mode,search]),[view,setView]=useState({criteria,page:1});
 if(view.criteria!==criteria)setView({criteria,page:1});
 const page=view.criteria===criteria?view.page:1;
 const params=useMemo(()=>({employeeId,dependentId,target,mode,search,page,pageSize:50 as const}),[employeeId,dependentId,target,mode,search,page]);
 const [retiredOwner,setRetiredOwner]=useState<string|null>(null);
 const key=["hr","document-choices",owner,JSON.stringify(params)] as const;
 const query=useQuery({queryKey:key,enabled:active&&retiredOwner!==owner,queryFn:async({signal})=>{
  const r=await readJson<{success:true;data:unknown}>("hr-document-choices",params,signal),data=hrDocumentPage.parse(r.data);
  if(data.employeeId!==employeeId||data.dependentId!==dependentId||data.target!==target||data.mode!==mode||data.page!==page)throw Error("Document choice identity mismatch");return data;
 },staleTime:0,gcTime:0,retry:retryAuthorizedRead});
 const rejected=query.error instanceof ReadError&&[401,403].includes(query.error.status);
 if(rejected&&retiredOwner!==owner)setRetiredOwner(owner);
 const denied=rejected||retiredOwner===owner;
 const life=useReadLifetime(JSON.stringify([criteria,active,page,denied]));
 useLayoutEffect(()=>{if(denied){void qc.cancelQueries({queryKey:["hr","document-choices",owner]});qc.removeQueries({queryKey:["hr","document-choices",owner]});}},[denied,owner,qc]);
 const ready=active&&!denied&&query.isSuccess&&!query.isError&&!query.isFetching;
 const data=active&&!denied&&!query.isError?query.data:undefined;
 return {...query,data,ready,denied,owner,isCurrent:()=>life.active&&active&&!denied,rows:data?.rows??[],page,
  refetch:()=>life.active&&active&&!denied?query.refetch():Promise.resolve(undefined),
  setPage:(next:number)=>{if(life.active&&active&&Number.isSafeInteger(next)&&next>0)setView({criteria,page:next});}};
}
export function HrDocumentChoicePages({read}:{read:ReturnType<typeof useHrDocumentChoices>}){
 const count=read.data?.totalCount,pages=count===undefined?null:Math.max(1,Math.ceil(count/50));
 return <div className="flex items-center justify-between gap-2 py-2 text-sm" aria-label="Document choice pages">
  <span>{count===undefined?"Document choices unavailable or loading":`${count} permitted documents — page ${read.page} of ${pages}`}</span>
  <Button type="button" variant="outline" disabled={!read.ready||read.page===1} onClick={()=>read.setPage(read.page-1)}>Previous documents</Button>
  <Button type="button" variant="outline" disabled={!read.ready||pages===null||read.page>=pages} onClick={()=>read.setPage(read.page+1)}>Next documents</Button>
 </div>;
}
