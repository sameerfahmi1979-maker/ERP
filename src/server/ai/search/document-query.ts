import "server-only";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {getAuthContext,hasPermission,type AuthContext} from "@/lib/rbac/check";
import {documentMeaning,identityMatches,normalizeIdentity,semanticHardText,type SearchSubject} from "@/lib/ai/search/vocabulary";
import {readAllPages} from "@/server/reads/all-pages";
import {defaultNullRpcGetArgs} from '@/lib/supabase/default-null-rpc-get-args';
import type {AiSearchLookup} from "@/lib/dms/ai/search-text";

type Db=Awaited<ReturnType<typeof createClient>>;
type NativeRead={data:unknown;count:number|null;error:{code?:string;message?:string}|null;status?:number};
export interface SharedDocumentQuery extends PromiseLike<NativeRead>{
  select(fields:string,options?:{count?:"exact";head?:boolean}):SharedDocumentQuery;
  eq(key:string,value:unknown):SharedDocumentQuery;in(key:string,values:readonly unknown[]):SharedDocumentQuery;
  is(key:string,value:null):SharedDocumentQuery;not(key:string,operator:string,value:string|null):SharedDocumentQuery;
  or(expression:string):SharedDocumentQuery;gte(key:string,value:string|number):SharedDocumentQuery;lte(key:string,value:string|number):SharedDocumentQuery;lt(key:string,value:string):SharedDocumentQuery;gt(key:string,value:string):SharedDocumentQuery;
  order(key:string,options?:{ascending?:boolean;nullsFirst?:boolean}):SharedDocumentQuery;range(from:number,to:number):SharedDocumentQuery;
  limit(limit:number):SharedDocumentQuery;abortSignal(signal:AbortSignal):SharedDocumentQuery;
  textSearch(key:string,value:string,options?:{config?:string;type?:"plain"}):SharedDocumentQuery;
  returns<T>():PromiseLike<{data:T|null;count:number|null;error:{code?:string;message?:string}|null}>;
}
export class SearchClarification extends Error {constructor(){super("Choose the exact person or business record, or enter its full name/code. No broader results were returned.");}}
export function assertSearchPrincipal(ctx:AuthContext){if(!ctx.profile?.id||!ctx.isAccountActive||ctx.profile.must_change_password)throw Error("Permission denied");}
const lookup=z.object({id:z.number().int().positive().safe(),name_en:z.string(),type_code:z.string()}).strip();
/** One request-local read context; never cache authority/results between users. */
export async function prepareDocumentQuery(db:Db,query:string,ctx:AuthContext,options:{subject?:SearchSubject;content?:boolean;semantic?:boolean;signal?:AbortSignal;personHint?:string|null;typeHint?:string|null;linkedType?:string|null;metadataFilters?:Array<{field_code:string;value:string}>;types?:AiSearchLookup[]}={}) {
  assertSearchPrincipal(ctx);options.signal?.throwIfAborted();
  if(!(hasPermission(ctx,"dms.documents.view")||hasPermission(ctx,"dms.admin")))throw Error("Permission denied");
  if(query.length>500)throw Error("Invalid search text");
  const types=options.types??(query.trim()||options.typeHint?await readAllPages(async(from,to)=>{let q=db.from("dms_document_types").select("id,name_en,type_code",{count:"exact"}).is("deleted_at",null).order("id").range(from,to);if(options.signal)q=q.abortSignal(options.signal);const r=await q;return {...r,data:r.error?null:z.array(lookup).parse(r.data)};},{batchSize:500,maxRows:5000,identity:r=>r.id}):[]);
  const meaning=documentMeaning(options.typeHint?`${options.typeHint} ${query}`:query,types);
  let subject=options.subject,remaining=meaning.remainder;
  const hint=options.personHint??meaning.subjectHint;
  if(hint&&hint.length>=2&&!/^[\d\W]+$/.test(hint)){
    const matches=await resolveSearchSubjects(db,hint,ctx,options.signal);
    if(subject){
      const selected=subject;
      if(matches.some(m=>m.type===selected.type&&m.id===selected.id))remaining=remaining.replace(new RegExp(hint.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"iu"),"").trim();
      else if(matches.length||options.personHint)throw new SearchClarification();
    }
    else if(matches.length>1)throw new SearchClarification();
    else if(matches.length===1){subject=matches[0];remaining=remaining.replace(new RegExp(hint.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"iu"),"").trim();}
    else if(options.personHint||(["passport","emirates id","cicpa","residence visa"].includes(meaning.typeHint??"")&&!/[\d@:/]/.test(hint)))throw new SearchClarification();
  }
  options.signal?.throwIfAborted();
  if(options.semantic)remaining=semanticHardText(remaining);
  const args={
    text_query:remaining,include_content:options.content===true,
    subject_type:subject?.type??null,subject_id:subject?.id??null,document_type_ids:meaning.typeIds,linked_type:options.linkedType??null,expiry_state:meaning.expiry,
    // PostgREST GET parameters need JSON text; SDK arrays otherwise become a PG array literal.
    metadata_filters:JSON.stringify(options.metadataFilters??[]),
  };
  const read=db.rpc("ai_mod02_search_documents",defaultNullRpcGetArgs(args),{get:true,count:"exact"}) as unknown as SharedDocumentQuery;
  return {meaning,subject,args,query:read,asOf:new Date().toISOString()};
}
export async function resolveSearchSubjects(db:Db,hint:string,ctx:AuthContext,signal?:AbortSignal):Promise<SearchSubject[]> {
  assertSearchPrincipal(ctx);signal?.throwIfAborted();
  // SQL checks each domain capability and native RLS; no names/roles are authority.
  let q=db.rpc("ai_mod02_resolve_subject",{search_name:normalizeIdentity(hint)});
  if(signal)q=q.abortSignal(signal);
  const r=await q;signal?.throwIfAborted();if(r.error)throw Error("Search subject could not be verified");
  const rows=z.array(z.object({entity_type:z.enum(["employee","employee_dependent","company","party","branch","site"]),entity_id:z.number().int().positive().safe(),label:z.string(),code:z.string().nullable()}).strip()).max(21).parse(r.data);
  if(rows.length>20)throw new SearchClarification();
  return rows.filter(r=>identityMatches(r.label,r.code,hint)).map(r=>({type:r.entity_type,id:r.entity_id}));
}
export async function currentSearchContext(){const ctx=await getAuthContext();assertSearchPrincipal(ctx);return ctx;}
