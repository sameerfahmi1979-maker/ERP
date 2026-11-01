import "server-only";
import type {AuthContext} from "@/lib/rbac/check";
import {searchGlobal} from "@/server/ai/search/global";
import {bridgeDmsSemanticSearch} from "./dms-bridge";
import {groupResults,mergeAndRankResults} from "./result-merger";
import type {ErpSearchFilters,ErpSearchResponse,ErpSearchResult} from "./types";

/** Existing UI/actions use the shared authority and exact global page. No second matching stack. */
export async function runErpSearch(input:ErpSearchFilters,ctx:AuthContext,flags:{aiSearchEnabled:boolean;semanticEnabled:boolean}):Promise<ErpSearchResponse>{
 const domains=input.entityTypes??["organization","branch","party","site","dms_document"];
 const semantic=input.mode==="semantic_documents"||input.mode==="hybrid";
 if(input.riskLevel)throw Error("Risk filtering is not supported for this mixed global search. Use the document list's risk filter.");
 const base=await searchGlobal({query:input.query,domains:input.mode==="semantic_documents"?["dms_document"]:domains,page:input.page??1,pageSize:input.limit??10},ctx);
 if(!base.success||!base.data)throw Error(base.error??"Global search unavailable");
 const results:ErpSearchResult[]=base.data.rows.map(row=>({key:row.entity_type+":"+row.entity_id,resultType:row.entity_type,entityType:row.entity_type,entityId:row.entity_id,title:row.title,subtitle:row.business_code,route:row.route!,relevanceScore:60,updatedAt:row.source_version}));
 const failedSources:string[]=[];
 if((input.mode==="ai_intent"||input.mode==="hybrid")&&!flags.aiSearchEnabled)failedSources.push("ai_search_disabled; shared literal constraints retained");
 let output=results,count=base.data.totalCount,countScope:"exact_authorized"|"bounded_preview"="exact_authorized";
 if(semantic&&domains.includes("dms_document")){
  if(!flags.semanticEnabled)failedSources.push("semantic_search_disabled");
  else {const suggested=await bridgeDmsSemanticSearch(input,false);if(suggested.failed)failedSources.push("dms_semantic_unavailable");else {output=mergeAndRankResults([input.mode==="semantic_documents"?[]:results,suggested.results]);count=output.length;countScope="bounded_preview";}}
 }
 return {query:input.query,mode:input.mode,results:output,groups:groupResults(output),partialResults:failedSources.length>0||countScope==="bounded_preview",failedSources,totalCount:count,countScope,hasMore:base.data.hasMore};
}
