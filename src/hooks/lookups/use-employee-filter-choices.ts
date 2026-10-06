"use client";
import {useQuery} from "@tanstack/react-query";
import {readJson,retryAuthorizedRead} from "@/lib/reads/client";
import type {ERPComboboxOption} from "@/components/erp/combobox";
/** Pilot-only adapter. Existing form lookup contracts remain owned by F06/P04. */
export function useEmployeeFilterChoices(kind:"companies"|"countries",params:{selectedId?:number}) {
  const query=useQuery({queryKey:["read",`employee-filter-${kind}`,params],
    queryFn:async({signal})=>(await readJson<{success:true;data:ERPComboboxOption[]}>(`employee-filter-${kind}`,params,signal)).data,
    staleTime:60000,retry:retryAuthorizedRead});
  return {...query,options:query.data??[]};
}
