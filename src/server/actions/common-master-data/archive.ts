"use server";
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {getAuthContext,hasPermission,hasGlobalPermission} from '@/lib/rbac/check';
import {setMasterArchived,type MasterLifecycleResult} from '@/server/master-lifecycle';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import {hrSettingsTables,hrLookupSaveReceipt} from '@/lib/hr/settings-save-contract';
import {saveHrLookup} from '@/server/hr-lookup-save';
const entitySchema=z.enum(['departments','work_calendars','work_shifts',...hrSettingsTables]);
export type ArchiveEntity=z.infer<typeof entitySchema>;
const idSchema=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const rowSchema=z.object({id:idSchema,name:z.string(),code:z.string(),revision:z.string().regex(/^[1-9]\d*$/),owner_company_id:idSchema.nullable(),company_name:z.string().nullable(),branch_id:idSchema.nullable(),branch_name:z.string().nullable(),parent_id:idSchema.nullable(),archived_at:z.string().min(1)});
export type ArchivedMasterRow=z.infer<typeof rowSchema>;
type ArchiveReadResult={success:true;data:ArchivedMasterRow[]}|{success:false;error:string};

/** F06 recovery projection, not an alternative shared read/cache framework.
 * Complete keyset pages; any failed or non-progressing page fails the whole read. */
export async function listArchivedMasters(entity:ArchiveEntity,calendarId?:number):Promise<ArchiveReadResult>{
 if(!entitySchema.safeParse(entity).success||(calendarId!==undefined&&(!idSchema.safeParse(calendarId).success||entity!=='work_shifts')))return {success:false,error:'Invalid archive selection.'};
 try{
  const ctx=await getAuthContext(),specific=entity==='departments'?'departments':'work_calendars';
  const hr=entity!=='departments'&&entity!=='work_calendars'&&entity!=='work_shifts';
  if(hr?(!hasGlobalPermission(ctx,'hr.settings.manage')&&!hasGlobalPermission(ctx,'hr.admin')):(!hasPermission(ctx,'common_md.manage')&&!hasPermission(ctx,`common_md.${specific}.manage`)))return {success:false,error:'You do not have permission to manage this archive.'};
  const client=await createClient(),rows:ArchivedMasterRow[]=[];let after=0;
  for(;;){
   const query=hr?client.rpc('list_archived_hr_settings',{p_entity:entity}):client.rpc('list_archived_master_records',{p_entity:entity,p_calendar_id:calendarId??null});
   const {data,error}=await query.gt('id',after).order('id').limit(200);
   const parsed=z.array(rowSchema).safeParse(data);
   if(error||!parsed.success)throw Error('Archive read unavailable');
   if(parsed.data.length===0)return {success:true,data:rows};
   for(const row of parsed.data){
    if(row.id<=after||(entity==='work_shifts'?(row.parent_id===null||(calendarId!==undefined&&row.parent_id!==calendarId)):row.parent_id!==null))throw Error('Invalid archive page');
    rows.push(row);after=row.id;
   }
  }
 }catch{return {success:false,error:'The archive could not be loaded. Try again; no empty result has been assumed.'};}
}
export async function restoreArchivedMaster(entity:ArchiveEntity,id:number,contract:WorkspaceSaveContract):Promise<MasterLifecycleResult>{
 if(!entitySchema.safeParse(entity).success)return {success:false,error:'Invalid archive selection.'};
 if(entity!=='departments'&&entity!=='work_calendars'&&entity!=='work_shifts'){
  const result=await saveHrLookup(entity,id,{},contract,'restore');
  if(!result.success)return result;
  const receipt=hrLookupSaveReceipt.safeParse(result.data);
  if(!receipt.success||receipt.data.id!==id||receipt.data.entity!==entity)return {success:false,uncertain:true,error:'Restore could not be confirmed. Retry the same action.'};
  return {...result,archived:false,changed:receipt.data.changed};
 }
 return setMasterArchived(entity,id,false,contract);
}
