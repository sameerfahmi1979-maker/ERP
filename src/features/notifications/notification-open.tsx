"use client";
import {useEffect,useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {useQueryClient} from '@tanstack/react-query';
import {prepareNotificationOpen,completeNotificationOpen} from '@/server/actions/notifications/open';
import {invalidateMyNotifications} from '@/lib/query/invalidation';
import {Button} from '@/components/ui/button';
export function NotificationOpenButton({id,label='Open record',onNavigate,disabled=false}:{id:number;label?:string;onNavigate?:()=>void;disabled?:boolean}){
 const router=useRouter(),[pending,start]=useTransition(),[error,setError]=useState(''),alive=useRef(false),flight=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 return <span className="inline-flex flex-col items-start"><Button variant="link" size="sm" disabled={disabled||pending} onClick={()=>{
  if(flight.current)return;flight.current=true;setError('');start(async()=>{try{
   const r=await prepareNotificationOpen(id);if(!alive.current)return;
   if(!r.success||!r.data){setError(r.error??'Destination unavailable; alert remains unread.');return;}
   router.push(r.data.path+(r.data.path.includes('?')?'&':'?')+'f10_open='+encodeURIComponent(r.data.token));onNavigate?.();
  }catch{if(alive.current)setError('The destination could not be confirmed. Refresh before retrying.');}finally{flight.current=false;}});
 }}>{label}</Button>{error&&<span role="alert" className="text-xs text-destructive">{error}</span>}</span>;
}
/** Render only alongside an already-authorized, successfully loaded target. */
export function NotificationArrival({token,path}:{token?:string;path:string}){
 const qc=useQueryClient(),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{if(!token)return;let active=true;
  void completeNotificationOpen(token,path).then(r=>{if(!active)return;if(!r.success){setFailed(true);return;}
   setFailed(false);invalidateMyNotifications(qc);
   // A completed acknowledgement is not part of persistent workspace identity.
   const url=new URL(window.location.href);if(url.searchParams.get('f10_open')===token){url.searchParams.delete('f10_open');window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);}
  }).catch(()=>{if(active)setFailed(true);});return()=>{active=false;};
 },[token,path,qc,attempt]);
 return failed?<p role="status" className="p-2 text-sm">The record opened, but marking the alert read could not be confirmed. <Button variant="link" onClick={()=>setAttempt(n=>n+1)}>Retry read confirmation</Button></p>:null;
}
