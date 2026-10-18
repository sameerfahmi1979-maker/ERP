import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {notificationTaskSources,type NotificationTaskContext} from '@/lib/notifications/task-context';
import {z} from 'zod';
export async function readNotificationTaskContext(parentPath:string,task:unknown,taskId:unknown,token?:string):Promise<NotificationTaskContext|null>{
 if(typeof task!=='string'||!Object.hasOwn(notificationTaskSources,task)||typeof taskId!=='string'||!/^[1-9]\d*$/.test(taskId))return null;
 const id=Number(taskId);if(!Number.isSafeInteger(id))return null;
 const spec=notificationTaskSources[task as keyof typeof notificationTaskSources];
 const path=parentPath+'?task='+task+'&task_id='+id;
 try{
  const db=await createClient();const target=await db.rpc('f10_notification_target',{source_type:spec.table,source_id:id});
  if(target.error||target.data!==path)return null;
  const q=db.from(spec.table).select('id'+(spec.status?','+spec.status:'' )).eq('id',id);
  if(spec.deleted)q.is('deleted_at',null);
  const r=await q.maybeSingle();const record=z.record(z.string(),z.unknown()).safeParse(r.data);
  if(r.error||!record.success||record.data.id!==id)return null;
  const status=spec.status?record.data[spec.status]:'recorded';
  if(typeof status!=='string'&&typeof status!=='boolean')return null;
  return {id,label:spec.label,section:task==='onboarding'&&parentPath.includes('/employees/')?'hr-actions':spec.section,status:String(status),path,token};
 }catch{return null;}
}
