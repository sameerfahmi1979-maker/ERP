"use client";
import {useLayoutEffect,useMemo,useRef} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {z} from "zod";
import type {AuthContext} from "@/lib/rbac/check";
import {hasPermission} from "@/lib/rbac/scope";
import {readJson,ReadError,retryAuthorizedRead} from "@/lib/reads/client";
import {canonicalReadParams} from "./use-server-page";
import {useRecordReadActive} from "./use-record-read-active";
import {dmsEntityDocumentsIdentity,entityDocumentsCriteriaSchema,entityDocumentsListPage,entityDocumentsAttachPage,entityDocumentsSelectedPage,entityDocumentsSummaryPage,entityDocumentsUnavailable,type EntityDocumentsCriteria} from "@/lib/reads/dms-entity-documents-schema";
const schemas={list:z.union([entityDocumentsListPage,entityDocumentsUnavailable]),attach:z.union([entityDocumentsAttachPage,entityDocumentsUnavailable]),selected:z.union([entityDocumentsSelectedPage,entityDocumentsUnavailable]),summary:z.union([entityDocumentsSummaryPage,entityDocumentsUnavailable])};
export const entityDocumentsPrefix=(auth:AuthContext,entityType:string,entityId:number)=>["dms","entity-documents-read",dmsEntityDocumentsIdentity(auth),entityType,entityId] as const;
export function useDmsEntityDocuments<K extends EntityDocumentsCriteria["operation"]>(auth:AuthContext,criteria:EntityDocumentsCriteria & {operation:K},options:{enabled?:boolean;onDenied?:()=>void}={}) {
  const parsed=entityDocumentsCriteriaSchema.parse(criteria),serialized=canonicalReadParams(parsed),qc=useQueryClient();
  const key=[...entityDocumentsPrefix(auth,criteria.entityType,criteria.entityId),criteria.operation,serialized],owner=canonicalReadParams({key});
  const active=useRecordReadActive();
  const admitted=hasPermission(auth,"dms.documents.view")||hasPermission(auth,"dms.admin"),enabled=active&&options.enabled!==false&&admitted;
  // Unique lifetime, not just string equality: A→B→A and disabled→enabled
  // cannot resurrect a retained retry/admission callback from the old owner.
  const generation=useMemo(()=>({owner,enabled}),[owner,enabled]),current=useRef<typeof generation|null>(null);
  const query=useQuery<z.infer<(typeof schemas)[K]>,Error>({queryKey:key,enabled,staleTime:30000,retry:retryAuthorizedRead,refetchOnWindowFocus:true,
    queryFn:async({signal})=>{
      const payload=await readJson<{success:true;data:unknown}>("dms-entity-documents",parsed,signal);
      const data=schemas[criteria.operation].parse(payload.data);
      if(canonicalReadParams(data.criteria)!==serialized)throw Error("Document response did not match its request");
      return data as z.infer<(typeof schemas)[K]>;
    }});
  const denied=!admitted||(query.error instanceof ReadError&&[401,403].includes(query.error.status));
  useLayoutEffect(()=>{current.current=enabled?generation:null;if(!enabled){void qc.cancelQueries({queryKey:key,exact:true});qc.removeQueries({queryKey:key,exact:true});}return()=>{current.current=null;void qc.cancelQueries({queryKey:key,exact:true});qc.removeQueries({queryKey:key,exact:true});};
    // The canonical key owns the complete principal/parent/operation criteria.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[generation,enabled,qc]);
  useLayoutEffect(()=>{if(denied){current.current=null;void qc.cancelQueries({queryKey:key,exact:true});qc.removeQueries({queryKey:key,exact:true});options.onDenied?.();}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[denied,owner,qc,options.onDenied]);
  return {...query,denied,data:enabled&&!denied&&!query.isError&&!query.isFetching?query.data:undefined,
    isCurrent:()=>{const state=qc.getQueryState(key);return enabled&&!denied&&current.current===generation&&state?.status==="success"&&state.fetchStatus==="idle"&&state.data===query.data;},
    retry:()=>{if(enabled&&!denied&&current.current===generation&&qc.getQueryState(key)?.fetchStatus!=="fetching")void query.refetch({cancelRefetch:false});}};
}
