"use client";
import {useLayoutEffect,useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {ReadError,readJson,retryAuthorizedRead} from "@/lib/reads/client";
import {hrLinkedDocuments} from "@/lib/reads/hr-linked-documents-schema";
import {queryKeys} from "@/lib/query/query-keys";
import {useHrDocumentChoiceOwner} from "./use-hr-document-choices";
import {useRecordReadActive} from "./use-record-read-active";
import {useReadLifetime} from "./use-read-lifetime";

export function useHrLinkedDocuments(employeeId:number,dependentId:number|null,enabled:boolean,generation?:object){
 const owner=useHrDocumentChoiceOwner(employeeId,generation),active=useRecordReadActive()&&enabled,qc=useQueryClient();
 const key=dependentId===null?[...queryKeys.dms.entityDocuments("employee",employeeId),owner]:["hr","dependent-doc-links",dependentId,owner];
 const [retired,setRetired]=useState<string|null>(null);
 const query=useQuery({queryKey:key,enabled:active&&retired!==owner,gcTime:0,retry:retryAuthorizedRead,queryFn:async({signal})=>{
  const response=await readJson<{success:true;data:unknown}>("hr-linked-documents",{employeeId,dependentId},signal),data=hrLinkedDocuments.parse(response.data);
  if(data.employeeId!==employeeId||data.dependentId!==dependentId)throw Error("Linked-document subject mismatch");return data.rows;
 }});
 const rejected=query.error instanceof ReadError&&[401,403].includes(query.error.status),denied=rejected||retired===owner;
 const life=useReadLifetime(JSON.stringify([owner,dependentId,active,denied]));
 if(rejected&&retired!==owner)setRetired(owner);
 const serialized=JSON.stringify(key);
 useLayoutEffect(()=>{if(denied){const queryKey=JSON.parse(serialized);void qc.cancelQueries({queryKey,exact:true});qc.removeQueries({queryKey,exact:true});}},[denied,serialized,qc]);
 return {...query,denied,data:active&&!denied&&!query.isError?query.data:undefined,
  ready:active&&!denied&&query.isSuccess&&!query.isFetching&&!query.isError,
  refetch:()=>life.active&&active&&!denied?query.refetch():Promise.resolve(undefined)};
}
