import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {authorizeWorker} from '@/lib/email/queue/worker-auth';
import {InvalidWorkerInput,readWorkerInput} from '@/lib/email/queue/runtime-limits';
import {processNotificationEvents} from '@/server/notification-events';
export const runtime='nodejs';
export const maxDuration=30;
const headers={'Cache-Control':'private, no-store'};
/** Independent admission worker: pausing email must not pause in-app notices.
 * No provider dispatch, replay selector, recipient override or F11 role grant. */
export async function GET(request:NextRequest){
 if(!authorizeWorker(request.headers.get('authorization'),process.env.INTERNAL_API_SECRET))return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 return NextResponse.json({module:'notifications',enabled:process.env.F10_NOTIFICATIONS_ENABLED==='true',workExecuted:false,databaseReadinessNotTested:true,deliveryConfirmed:false},{headers});
}
export async function POST(request:NextRequest){
 if(!authorizeWorker(request.headers.get('authorization'),process.env.INTERNAL_API_SECRET))return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 if(process.env.F10_NOTIFICATIONS_ENABLED!=='true')return NextResponse.json({paused:true,processed:0},{headers});
 try{
  if(!z.object({}).strict().safeParse(await readWorkerInput(request)).success)return NextResponse.json({error:'Invalid request'},{status:400,headers});
  const result=await processNotificationEvents(1);
  return NextResponse.json({...result,deliveryConfirmed:false},{headers});
 }catch(error){
  return NextResponse.json({error:error instanceof InvalidWorkerInput?'Invalid request':'Notification outcomes unconfirmed. Original events and receipts are retained for reconciliation.'},{status:error instanceof InvalidWorkerInput?400:503,headers});
 }
}
