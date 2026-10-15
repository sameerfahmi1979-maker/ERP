"use client";
import {useLayoutEffect,useMemo,useRef,useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import {hasPermission} from "@/lib/rbac/scope";
import {readJson,ReadError,retryAuthorizedRead} from "@/lib/reads/client";
import {canonicalReadParams} from "./use-server-page";
import {dmsDashboardIdentity,dmsDashboardCriteriaSchema,dmsDashboardSchema,type DmsDashboardCriteria} from "@/lib/reads/dms-dashboard-schema";
export const dmsDashboardPrefix=(auth:AuthContext)=>["dms","dashboard-read",dmsDashboardIdentity(auth)] as const;
export function useDmsDashboard(auth:AuthContext,criteria:DmsDashboardCriteria,options:{enabled?:boolean}={}){
  const parsed=dmsDashboardCriteriaSchema.parse(criteria),serialized=canonicalReadParams(parsed),key=[...dmsDashboardPrefix(auth),serialized],owner=canonicalReadParams({key}),qc=useQueryClient();
  const [deniedOwner,setDeniedOwner]=useState<string|null>(null);
  const admitted=hasPermission(auth,"dms.documents.view")||hasPermission(auth,"dms.admin"),enabled=options.enabled!==false&&admitted&&deniedOwner!==owner;
  const generation=useMemo(()=>({owner,enabled}),[owner,enabled]),current=useRef<typeof generation|null>(null);
  const query=useQuery({queryKey:key,enabled,staleTime:30000,retry:retryAuthorizedRead,refetchOnWindowFocus:true,
    queryFn:async({signal})=>{const payload=await readJson<{success:true;data:unknown}>("dms-dashboard",parsed,signal);const data=dmsDashboardSchema.parse(payload.data);if(canonicalReadParams(data.criteria)!==serialized)throw Error("Dashboard response did not match its range");return data;}});
  const denied=!admitted||deniedOwner===owner||(query.error instanceof ReadError&&[401,403].includes(query.error.status));
  // Commit terminal denial before removing the failed query. Otherwise an
  // enabled observer can recreate it and issue an unintended third request.
  if(denied&&deniedOwner!==owner)setDeniedOwner(owner);
  useLayoutEffect(()=>{
    current.current=enabled?generation:null;
    if(!enabled){void qc.cancelQueries({queryKey:key,exact:true});qc.removeQueries({queryKey:key,exact:true});}
    return()=>{current.current=null;void qc.cancelQueries({queryKey:key,exact:true});qc.removeQueries({queryKey:key,exact:true});};
    // Canonical owner includes principal, assignments, operation and range.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[generation,qc]);
  useLayoutEffect(()=>{if(denied){current.current=null;void qc.cancelQueries({queryKey:key,exact:true});qc.removeQueries({queryKey:key,exact:true});}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[denied,owner,qc]);
  return{...query,denied,data:enabled&&!denied&&!query.isError&&!query.isFetching?query.data:undefined,
    retry:()=>{if(enabled&&!denied&&current.current===generation&&qc.getQueryState(key)?.fetchStatus!=="fetching")void query.refetch({cancelRefetch:false});}};
}
