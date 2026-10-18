"use client";
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {inspectNotificationRecovery,retryHeldNotificationEvent,type NotificationRecoveryRow} from '@/server/actions/notifications/recovery';

/** Small related worklist, not another full configurable list inside a page. */
export function NotificationRecoveryPanel({identity}:{identity:string}){
 const [rows,setRows]=useState<NotificationRecoveryRow[]>([]),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const live=useRef(true),flight=useRef(false);
 const [operation,setOperation]=useState<{event:number;revision:number;id:string}|null>(null);
 const [lastCursor,setLastCursor]=useState<number|undefined>(undefined);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 async function load(before?:number){
  if(flight.current)return;flight.current=true;setBusy(true);setFailed(false);
  try{const r=await inspectNotificationRecovery(identity,before);if(!live.current)return;
   if(!r.success){setFailed(true);setRows([]);return;}
   setLastCursor(before);setRows(r.data);
  }catch{if(live.current){setFailed(true);setRows([]);}}finally{flight.current=false;if(live.current)setBusy(false);}
 }
 async function retry(row:Pick<NotificationRecoveryRow,'id'|'recovery_revision'>){
  if(flight.current)return;
  if(operation&&(operation.event!==row.id||operation.revision!==row.recovery_revision)){
   setMessage('Reconcile the unconfirmed retry first. Use the same event and revision; no new recovery request was made.');return;
  }
  const attempt=operation??{event:row.id,revision:row.recovery_revision,id:crypto.randomUUID()};setOperation(attempt);
  flight.current=true;setBusy(true);setMessage('');
  try{const r=await retryHeldNotificationEvent(identity,row.id,row.recovery_revision,attempt.id);if(!live.current)return;
   if(!r.success){setMessage('The recovery request is unconfirmed. Retry the same event; do not create another delivery.');return;}
   setOperation(null);setRows(current=>current.map(x=>x.id===row.id?{...x,state:'pending',recovery_revision:x.recovery_revision+1}:x));
   setMessage('Current-authority recheck requested. This is not proof of delivery; existing email intents are unchanged.');
  }catch{if(live.current)setMessage('The request is unconfirmed. Retry the same event to reconcile it.');}
  finally{flight.current=false;if(live.current)setBusy(false);}
 }
 return <section aria-labelledby="notification-recovery-heading" className="space-y-2 border-t pt-4">
  <h2 id="notification-recovery-heading" className="font-semibold">Delivery recovery</h2>
  <p className="text-sm text-muted-foreground">Review held routing and incomplete fan-out. Rechecking uses current permissions and the original recipients; it does not resend accepted or uncertain emails or approve a business task.</p>
  <Button variant="outline" disabled={busy} onClick={()=>load(lastCursor)}>Load or refresh recovery</Button>
  {busy&&<p role="status">Checking recovery…</p>}{failed&&<p role="alert">Recovery could not be verified. Refresh to retry; unavailable results are not an empty queue.</p>}
  {message&&<p role="status">{message}</p>}
  {operation&&!busy&&<Button variant="outline" onClick={()=>retry({id:operation.event,recovery_revision:operation.revision})}>Reconcile last recovery request</Button>}
  {rows.length>0&&<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Event</th><th>Current state</th><th>Recipient outcomes</th><th>Permitted action</th></tr></thead>
   <tbody>{rows.map(row=><tr key={row.id} className="border-t"><td>{row.id} · {row.event_type}</td><td>{row.state} · {row.last_outcome??'Awaiting resolution'}</td><td>{row.pending_recipients} pending · {row.held_recipients} held · {row.omitted_decisions} omitted decisions</td>
    <td>{row.state==='held'&&<Button variant="outline" disabled={busy} onClick={()=>retry(row)}>Recheck event {row.id}</Button>}</td></tr>)}</tbody></table></div>}
  {rows.length===50&&<Button variant="outline" disabled={busy} onClick={()=>load(rows[rows.length-1].id)}>Older recovery events</Button>}
  {lastCursor!==undefined&&<Button variant="outline" disabled={busy} onClick={()=>load()}>Newest recovery events</Button>}
 </section>;
}
