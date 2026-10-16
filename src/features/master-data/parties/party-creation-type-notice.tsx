'use client';
import {useQuery} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {hasGlobalPermission} from '@/lib/rbac/scope';
import type {AuthContext} from '@/lib/rbac/check';
import {getPartyTypes} from '@/server/actions/master-data/parties';

/** Reuses the established party-types query; no separate lookup/cache system. */
export function PartyCreationTypeNotice({code,authContext}:{code:string;authContext:AuthContext}){
 const types=useQuery({queryKey:['party_types'],queryFn:async()=>{
  const result=await getPartyTypes();if(!result.success||!result.data)throw Error('Party types unavailable');return result.data;
 },staleTime:5*60*1000});
 if(!hasGlobalPermission(authContext,'master_data.parties.manage_types'))return <p role="alert" className="mb-4 text-sm text-destructive">You cannot create a party in this filtered list without party-type management permission. Use All Parties to create an unclassified record, or ask an administrator for access.</p>;
 if(types.isError)return <div role="alert" className="mb-4 space-y-2 text-sm"><p>The initial party type could not be loaded. Saving will still verify the type before creating any record.</p><Button type="button" variant="outline" onClick={()=>void types.refetch()}>Retry loading type</Button></div>;
 if(types.isPending)return <p role="status" className="mb-4 text-sm text-muted-foreground">Loading initial party type…</p>;
 const type=types.data?.find(t=>t.type_code===code&&t.is_active);
 if(!type)return <p role="alert" className="mb-4 text-sm text-destructive">This list’s party type is unavailable. Reopen an active party list before creating the record.</p>;
 return <p role="status" className="mb-4 rounded-md border bg-muted/30 p-3 text-sm">Initial party type: <strong>{type.type_name}</strong>. Saving creates the party and this primary type assignment together. You can manage additional types after saving.</p>;
}
