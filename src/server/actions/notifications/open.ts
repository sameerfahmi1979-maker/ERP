"use server";
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {getAuthContext,canUseApplication} from '@/lib/rbac/check';
const target=z.string().regex(/^(?:\/dms\/documents\/record\/[1-9]\d*|\/admin\/hr\/(?:employees|recruitment\/candidates)\/record\/[1-9]\d*(?:\?task=(?:leave|attendance|salary|payroll-hold|employee-request|identity|insurance|interview|offer|onboarding)&task_id=[1-9]\d*)?|\/admin\/reports\/templates\/governance\?template_id=[1-9]\d*|\/dms\/review-queue\?item_id=[1-9]\d*)$/);
const receipt=z.object({id:z.number().int().positive(),token:z.uuid(),path:target}).strict();
export async function prepareNotificationOpen(id:number){
 try{
  if(!Number.isSafeInteger(id)||id<1||!canUseApplication(await getAuthContext()))return {success:false as const,error:'Notification access could not be verified.'};
  const {data,error}=await (await createClient()).rpc('f10_prepare_notification_open',{notification_id:id});
  const p=receipt.safeParse(data);
  if(error||!p.success||p.data.id!==id)return {success:false as const,error:'This task may be unavailable, changed or no longer permitted. Refresh notifications; it has not been marked read.'};
  return {success:true as const,data:p.data};
 }catch{return {success:false as const,error:'The destination could not be verified. Retry after refreshing; the alert remains unread.'};}
}
export async function completeNotificationOpen(token:string,path:string){
 try{
  if(!z.uuid().safeParse(token).success||!target.safeParse(path).success||!canUseApplication(await getAuthContext()))return {success:false};
  const {data,error}=await (await createClient()).rpc('f10_complete_notification_open',{open_token:token,target_path:path});
  return {success:!error&&data===true};
 }catch{return {success:false};}
}
