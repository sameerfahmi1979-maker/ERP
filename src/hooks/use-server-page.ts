"use client";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { keepPreviousData, notifyManager, useQuery, useQueryClient } from "@tanstack/react-query";
import { readJson, retryAuthorizedRead, ReadError } from "@/lib/reads/client";
import { validReadPage } from "@/lib/reads/page-contract";
export type ReadPage<T>={rows:T[];totalCount:number;page:number;pageSize:number};
export function canonicalReadParams(params:Record<string,unknown>):string {
  const normalize=(value:unknown):unknown=>Array.isArray(value)?value.map(normalize):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,normalize(v)])):value;
  return JSON.stringify(normalize(params));
}
/** Reuse only the matching SSR seed; a restored search/page is a distinct query. */
export function useServerPage<T>({resource,params,seedParams,seed,updatedAt,keyPrefix}:{resource:string;params:Record<string,unknown>;seedParams:Record<string,unknown>;seed:ReadPage<T>;updatedAt:number;keyPrefix?:readonly unknown[]}) {
  const current=canonicalReadParams(params),initial=canonicalReadParams(seedParams),client=useQueryClient();
  const nested=params.filters&&typeof params.filters==="object"?params.filters as Record<string,unknown>:null;
  const text=canonicalReadParams({search:params.search,nestedSearch:nested?.search});
  const [debouncedText,setDebouncedText]=useState(text);
  // Only text search is debounced. A page, dropdown or sort is not delayed.
  useEffect(()=>{const timer=setTimeout(()=>setDebouncedText(text),250);return()=>clearTimeout(timer);},[text]);
  const pendingText=JSON.parse(debouncedText) as {search?:unknown;nestedSearch?:unknown};
  const effective={...params,...("search" in params||"search" in pendingText?{search:pendingText.search}:{}),...(nested?{filters:{...nested,search:pendingText.nestedSearch}}:{})};
  const debounced=canonicalReadParams(effective);
  const prefix=canonicalReadParams({prefix:keyPrefix??["read",resource]});
  const owner=useMemo(()=>({client,resource,prefix,active:false}),[client,resource,prefix]);
  useLayoutEffect(()=>{owner.active=true;return()=>{owner.active=false;};},[owner]);
  const queryKey=[...(JSON.parse(prefix).prefix as unknown[]),debounced];
  const seedUpdatedAt=Number.isFinite(updatedAt)&&updatedAt>0?updatedAt:0;
  const query=useQuery({queryKey,queryFn:async({signal})=>{
    const result=await readJson<{success:true;data:ReadPage<T>}>(resource,JSON.parse(debounced),signal);
    if(!validReadPage(result.data,JSON.parse(debounced)))throw Error("Record count or page could not be verified");
    return result.data;
  // Query.setOptions can also apply initialData to an existing no-data error.
  // Recheck absence lazily: construction evaluates this before cache insertion.
  },initialData:()=>debounced===initial&&client.getQueryState(queryKey)===undefined?seed:undefined,initialDataUpdatedAt:seedUpdatedAt,staleTime:30000,refetchOnWindowFocus:true,placeholderData:keepPreviousData,retry:retryAuthorizedRead});
  useEffect(()=>{
    if(!owner.active||seedUpdatedAt===0)return;
    const key=[...(JSON.parse(prefix).prefix as unknown[]),initial],state=client.getQueryState(key);
    // A no-data manual retry becomes pending/error-null, but retains its failure
    // count. A prop update must not masquerade as that retry's successful result.
    if(state?.status==="error"||(state?.data===undefined&&(state?.errorUpdateCount??0)>0))return;
    if((state?.dataUpdatedAt??0)>=seedUpdatedAt)return;
    const verify=state?.isInvalidated===true||(state!==undefined&&state.fetchStatus!=="idle");
    notifyManager.batch(()=>{
      if(verify)void client.cancelQueries({queryKey:key,exact:true},{revert:true});
      client.setQueryData(key,seed,{updatedAt:seedUpdatedAt});
      // Seed/cache timestamps cannot order a sibling's running read. Preserve
      // verification with one shared replacement, never fetch an inactive key.
      if(verify)void client.invalidateQueries({queryKey:key,exact:true,refetchType:"active"},{cancelRefetch:true});
    });
  },[client,prefix,initial,seed,seedUpdatedAt,owner]);
  const refetch:typeof query.refetch=async options=>{
    // The live observer follows current criteria. A retired resource/client
    // owner must never rebuild a cleared cache, even through a returned result.
    const result=owner.active?await query.refetch(options):query;
    return {...result,refetch};
  };
  const denied=query.error instanceof ReadError && (query.error.status===401||query.error.status===403);
  return {...query,refetch,data:denied?undefined:query.data,isBusy:current!==debounced||query.isFetching||query.isPlaceholderData};
}
