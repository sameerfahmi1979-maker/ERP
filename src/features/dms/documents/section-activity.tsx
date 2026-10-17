"use client";
import {createContext,useContext} from "react";
import {useQuery,useQueryClient,type UseQueryOptions,type QueryKey,type QueryClient} from "@tanstack/react-query";
import {retryAuthorizedRead} from "@/lib/reads/client";

export const DmsSectionActivity = createContext(true);
/** Keep visited forms mounted, but do not poll/refetch inactive sections. */
export function useDmsSectionQuery<TQueryFnData=unknown,TError=Error,TData=TQueryFnData,TQueryKey extends QueryKey=QueryKey>(options:UseQueryOptions<TQueryFnData,TError,TData,TQueryKey>,client?:QueryClient) {
 const active=useContext(DmsSectionActivity);
 const defaults=useQueryClient(client).getDefaultOptions().queries;
 return useQuery({...options,enabled:query=>active&&(typeof options.enabled==="function"?options.enabled(query):options.enabled!==false),refetchInterval:active?options.refetchInterval:false,retry:options.retry===false||defaults?.retry===false?false:retryAuthorizedRead},client);
}
