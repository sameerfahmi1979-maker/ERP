import "server-only";
import {hasPermission,type AuthContext} from "@/lib/rbac/check";
import {getReadAuthContext} from "./read-context";
import {createClient} from "@/lib/supabase/server";
import {collectCompletePages} from "@/lib/reads/complete-pages";
import {dmsListChoiceSchema} from "@/lib/reads/dms-list-choices-schema";
/** Filter taxonomy, including inactive historical values; never document-create defaults. */
export async function readDmsListChoices(context?:AuthContext, signal?:AbortSignal){
 try{
  signal?.throwIfAborted();
  const ctx=context??await getReadAuthContext();
  signal?.throwIfAborted();
  if(!hasPermission(ctx,"dms.documents.view")&&!hasPermission(ctx,"dms.admin"))return{success:false,error:"Permission denied"};
  const db=await createClient();
  const read=(table:"dms_document_categories"|"dms_document_types")=>collectCompletePages(async(from,to)=>{
    const query=db.from(table).select("id,name_en",{count:"exact"}).is("deleted_at",null).order("sort_order").order("id").range(from,to);
    if(signal)query.abortSignal(signal);
    const r=await query;
    signal?.throwIfAborted();
    return {...r,data:r.data===null?null:dmsListChoiceSchema.array().parse(r.data)};
  },{identity:row=>row.id,maxRows:5000,signal});
  const [categories,documentTypes]=await Promise.all([read("dms_document_categories"),read("dms_document_types")]);
  return{success:true,data:{categories,documentTypes}};
 }catch{
  signal?.throwIfAborted();
  return{success:false,error:"Document filter choices could not be completely loaded. Please retry."};
 }
}
