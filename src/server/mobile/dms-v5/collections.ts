import {z} from "zod";
import {rpc} from "./access";
import {type CommandFor,completePage,id,summary,savedCriteria} from "./contracts";

export const pagePayload=<T>(schema:z.ZodType<T>,size:20|25=25)=>z.strictObject({rows:z.array(schema).max(size),totalCount:z.number().int().nonnegative().safe()});
export async function collections(input:CommandFor<"documentFavourites"|"documentFavouriteSet"|"documentSavedFilters"|"documentSavedFilterSave"|"documentSavedFilterDelete">){
 switch(input.op){
  case "documentFavourites":{
   const r=await rpc("mobile_dms_collections",{p_action:"favourites",p_data:{page:input.page}},pagePayload(summary.extend({documentId:id,savedAt:z.iso.datetime({offset:true})})));
   return completePage(r.rows,input.page,25,r.totalCount,v=>v.documentId);
  }
  case "documentSavedFilters":{
   const r=await rpc("mobile_dms_collections",{p_action:"filters",p_data:{page:input.page}},pagePayload(z.strictObject({id,name:z.string().min(1).max(80),criteria:savedCriteria,revision:z.string().max(128),updatedAt:z.iso.datetime({offset:true})})));
   return completePage(r.rows,input.page,25,r.totalCount,v=>v.id);
  }
  case "documentFavouriteSet":return rpc("mobile_dms_collections",{p_action:"favourite_set",p_data:{documentId:input.documentId,value:input.value}},z.strictObject({documentId:z.literal(input.documentId),value:z.literal(input.value)}),true);
  case "documentSavedFilterDelete":return rpc("mobile_dms_collections",{p_action:"delete_filter",p_data:{id:input.id,revision:input.revision,operationId:input.operationId}},z.strictObject({id:z.literal(input.id),operationId:z.literal(input.operationId),replayed:z.boolean(),deleted:z.literal(true)}),true);
  case "documentSavedFilterSave":{
   const {op,...data}=input;void op;
   return rpc("mobile_dms_collections",{p_action:"save_filter",p_data:data},z.strictObject({id:input.id?z.literal(input.id):id,operationId:z.literal(input.operationId),revision:z.string().min(1).max(128),replayed:z.boolean()}),true);
  }
 }
}
