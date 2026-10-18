import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {z} from 'zod';
import {scheduleSaveReceiptSchema,type ScheduleSaveReceipt} from '@/lib/report-center/schedule-save-contract';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
export type ScheduleSaveResult={success:boolean;data?:ScheduleSaveReceipt;error?:string;uncertain?:boolean};
const contractSchema=z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/).nullable()}).strict();
export async function saveReportScheduleRecord(id:number|null,payload:Record<string,unknown>,contract:WorkspaceSaveContract):Promise<ScheduleSaveResult>{
 return executeScheduleMutation('f09_save_schedule',id,payload,contract);
}
export async function removeReportScheduleRecord(id:number,contract:WorkspaceSaveContract):Promise<ScheduleSaveResult>{
 return executeScheduleMutation('f09_remove_schedule',id,{},contract);
}
async function executeScheduleMutation(method:'f09_save_schedule'|'f09_remove_schedule',id:number|null,payload:Record<string,unknown>,contract:WorkspaceSaveContract):Promise<ScheduleSaveResult>{
 const parsed=contractSchema.safeParse(contract);
 if(!parsed.success||(id!==null&&(!Number.isSafeInteger(id)||id<1||!parsed.data.revision))||(id===null&&parsed.data.revision!==null))return {success:false,error:'Reopen the schedule before saving; its operation identity or revision is missing.'};
 try{
  const db=await createClient();const result=await db.rpc(method,{p_operation:parsed.data.operationId,p_id:id,p_revision:parsed.data.revision,...(method==='f09_save_schedule'?{p_data:payload}:{})});
  if(result.error){
   const code=result.error.code;
   if(code==='P0409'||code==='40001')return {success:false,error:'This schedule changed after you opened it. Your entries are retained. Reopen the latest schedule and compare before saving.'};
   if(code==='42501')return {success:false,error:'The schedule is unavailable or your delivery authority changed.'};
   const rejected=typeof code==='string'&&(/^(?:22|23|42|P0)[0-9A-Z]{3}$/.test(code)||['40000','40002','40P01'].includes(code));
   return {success:false,uncertain:!rejected,error:rejected?'The save was rejected. Check the entries and current schedule.':'Save unconfirmed. Retry the unchanged entries to recover the original result.'};
  }
  const receipt=scheduleSaveReceiptSchema.safeParse(result.data);
  return receipt.success&&(id===null||receipt.data.id===id)?{success:true,data:receipt.data}:{success:false,uncertain:true,error:'Save response incomplete. Retry the unchanged entries to recover its receipt.'};
 }catch{return {success:false,uncertain:true,error:'Save unconfirmed. Retry the unchanged entries before making different changes.'};}
}
