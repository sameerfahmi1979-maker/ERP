"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {NotificationArrival} from './notification-open';
import type {NotificationTaskContext} from '@/lib/notifications/task-context';
/** The exact authorized leaf, not cached source content from the alert. */
export function NotificationTaskContextCard({task,onSection,blocked=false}:{task:NotificationTaskContext;onSection?:(section:string)=>void;blocked?:boolean}){
 const [message,setMessage]=useState('');
 return <aside aria-label="Notified task" className="mb-3 space-y-1 rounded border p-3 text-sm">
  <strong>{task.label} #{task.id}</strong><p>Current state: {task.status}. Review the current record before taking action; opening this task does not approve or complete it.</p>
  <NotificationArrival token={task.token} path={task.path}/>
  {onSection&&<Button type="button" variant="outline" onClick={()=>{if(blocked){setMessage('Finish the current save or close its child form first. Your unsaved entries are unchanged.');return;}setMessage('');onSection(task.section);}}>Show related section</Button>}
  {message&&<p role="status">{message}</p>}
 </aside>;
}
