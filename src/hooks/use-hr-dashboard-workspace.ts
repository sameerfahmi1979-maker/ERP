"use client";
import {useLayoutEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import type {AuthContext} from '@/lib/rbac/check';
import {hasPermission} from '@/lib/rbac/scope';
import {hrReadIdentity} from '@/lib/reads/hr-read-identity';
import {readJson,ReadError,retryAuthorizedRead} from '@/lib/reads/client';
import {dashboardRequestSchema,dashboardResponseSchema,type DashboardRequest} from '@/lib/hr/dashboard-workspace';

export function useHrDashboardWorkspace(auth:AuthContext,input:DashboardRequest,active=true) {
 const params=dashboardRequestSchema.parse(input),identity=hrReadIdentity(auth),owner=JSON.stringify([identity,params]);
 const key=['hr','dashboard','workspace',identity,JSON.stringify(params)] as const;
 const client=useQueryClient(),current=useRef(''),[deniedOwner,setDeniedOwner]=useState<string|null>(null);
 const admitted=hasPermission(auth,'hr.dashboard.view')||hasPermission(auth,'hr.employees.view');
 const enabled=active&&admitted&&owner!==deniedOwner;
 const query=useQuery({queryKey:key,enabled,staleTime:30000,refetchOnWindowFocus:true,retry:retryAuthorizedRead,
  refetchInterval:active&&params.mode!=='options'?60000:false,refetchIntervalInBackground:false,
  queryFn:async({signal})=>{
   const response=await readJson<{success:true;data:unknown}>('hr-dashboard',params,signal);
   const data=dashboardResponseSchema.parse(response.data);
   if(JSON.stringify(data.scope)!==JSON.stringify(params.scope)||data.mode!==params.mode||data.page!==params.page||data.metric!==params.metric)throw Error('Dashboard response mismatch');
   return data;
  }});
 const denied=!admitted||deniedOwner===owner||query.error instanceof ReadError&&[401,403].includes(query.error.status);
 if(denied&&deniedOwner!==owner)setDeniedOwner(owner);
 useLayoutEffect(()=>{
  current.current=enabled&&!denied?owner:'';
  if(!enabled||denied){void client.cancelQueries({queryKey:key,exact:true});client.removeQueries({queryKey:key,exact:true});}
  return()=>{current.current='';void client.cancelQueries({queryKey:key,exact:true});client.removeQueries({queryKey:key,exact:true});};
  // Identity includes current grants, scope and request; never reuse another owner's rows.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[owner,enabled,denied,client]);
 return {...query,denied,data:enabled&&!denied&&!query.isError&&!query.isFetching?query.data:undefined,
  retry:()=>{if(enabled&&!denied&&current.current===owner&&client.getQueryState(key)?.fetchStatus!=='fetching')void query.refetch({cancelRefetch:false});}};
}
