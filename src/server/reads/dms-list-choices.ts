import "server-only";
import {hasPermission,type AuthContext} from "@/lib/rbac/check";
import {getReadAuthContext} from "./read-context";
import {createClient} from "@/lib/supabase/server";
import {readAllPages} from "./all-pages";
/** Filter taxonomy, including inactive historical values; never document-create defaults. */
export async function readDmsListChoices(context?:AuthContext){
 try{
  const ctx=context??await getReadAuthContext();
  if(!hasPermission(ctx,"dms.documents.view")&&!hasPermission(ctx,"dms.admin"))return{success:false,error:"Permission denied"};
  const db=await createClient();
  const read=(table:"dms_document_categories"|"dms_document_types")=>readAllPages<{id:number;name_en:string}>(async(from,to)=>{
    const r=await db.from(table).select("id,name_en",{count:"exact"}).is("deleted_at",null).order("sort_order").order("id").range(from,to);
    return {...r,data:r.data as {id:number;name_en:string}[]|null};
  },{identity:row=>row.id,maxRows:5000});
  const [categories,documentTypes]=await Promise.all([read("dms_document_categories"),read("dms_document_types")]);
  return{success:true,data:{categories,documentTypes}};
 }catch{return{success:false,error:"Document filter choices could not be completely loaded. Please retry."};}
}
