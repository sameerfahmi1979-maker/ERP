import "server-only";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {getAuthContext,hasPermission} from "@/lib/rbac/check";
import {revalidatePath} from "next/cache";
import type {WorkspaceSaveContract} from "@/lib/workspace/save-contract";
import type {WorkspaceSaveResult} from "@/server/workspace-save";

const inputSchema=z.object({entity:z.enum(['departments','work_calendars','work_shifts']),id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),archived:z.boolean(),
 contract:z.object({operationId:z.uuid(),revision:z.string().regex(/^[1-9]\d*$/)})});
const receiptSchema=z.object({id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),revision:z.string().regex(/^[1-9]\d*$/),replayed:z.boolean(),
 archived:z.boolean(),changed:z.boolean(),calendar_id:z.number().int().positive().nullable()});
export type MasterLifecycleResult=WorkspaceSaveResult & {changed?:boolean;archived?:boolean};
function revalidateConfirmedPath(path:string){
 // Contain only presentation failure after a complete, matching lifecycle receipt.
 try{revalidatePath(path);}catch{/* Continue invalidating the remaining targets. */}
}

/** Uses the caller session. Stored company/branch, revision, dependencies, audit
 * and operation replay are checked atomically by the narrowly scoped database RPC. */
export async function setMasterArchived(entity:string,id:number,archived:boolean,contract:WorkspaceSaveContract):Promise<MasterLifecycleResult>{
 const parsed=inputSchema.safeParse({entity,id,archived,contract});
 if(!parsed.success)return {success:false,error:"Reopen the latest record before changing its archive state."};
 const ctx=await getAuthContext();
 const specific=entity==='departments'?'departments':'work_calendars';
 if(!hasPermission(ctx,'common_md.manage')&&!hasPermission(ctx,`common_md.${specific}.manage`))return {success:false,error:"Permission denied"};
 try{
  const client=await createClient();
  const {data,error}=await client.rpc('set_master_record_archived',{
   p_entity:parsed.data.entity,p_id:id,p_archived:archived,p_revision:parsed.data.contract.revision,p_operation:contract.operationId,
  });
  if(error){
   if(error.code==='P0409'||error.code==='40001')return {success:false,error:"This record changed after you opened it. Reopen the latest record before trying again."};
   if(error.code==='23503')return {success:false,error:archived?"This record is still referenced. Resolve its linked records before archiving it; history will not be deleted.":"Restore and activate the parent record before restoring this record."};
   if(error.code==='42501')return {success:false,error:"This record is unavailable or you no longer have permission to change it."};
   const uncertain=!(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code)));
   return {success:false,uncertain,error:uncertain?"Archive result unconfirmed. Retry the same action to recover its result safely.":"The archive change was rejected. Refresh the record and check its current state."};
  }
  const receipt=receiptSchema.safeParse(data);
  if(!receipt.success||receipt.data.id!==id||receipt.data.archived!==archived||(entity==='work_shifts'?receipt.data.calendar_id===null:receipt.data.calendar_id!==null))return {success:false,uncertain:true,error:"Archive response incomplete. Retry the same action to recover its result safely."};
  if(entity==='departments')revalidateConfirmedPath('/admin/common-master-data/departments');
  else{
   revalidateConfirmedPath('/admin/common-master-data/work-calendars');
   const calendarId=entity==='work_calendars'?id:receipt.data.calendar_id;
   if(calendarId)revalidateConfirmedPath(`/admin/common-master-data/work-calendars/record/${calendarId}`);
   revalidateConfirmedPath('/admin/hr/time/shifts');
  }
  return {success:true,data:receipt.data,changed:receipt.data.changed,archived:receipt.data.archived};
 }catch{return {success:false,uncertain:true,error:"Archive result unconfirmed. Retry the same action to recover its result safely."};}
}
