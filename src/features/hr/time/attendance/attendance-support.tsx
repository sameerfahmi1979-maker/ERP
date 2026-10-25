'use client';
import {useLayoutEffect,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {ERPCombobox} from '@/components/erp/combobox';
import {Button} from '@/components/ui/button';
import {useReadLifetime} from '@/hooks/use-read-lifetime';
import {readAttendanceChoices,readRecentAttendance} from '@/server/actions/hr/attendance-workbench';
import styles from './attendance-workbench.module.css';

export function AttendanceFilter({kind,company,branch,date,authority,value,disabled,onChange}:{kind:'site'|'team'|'shift';company:number;branch:number|null;date:string;authority:string;value:number|null;disabled:boolean;onChange:(value:number|null)=>void}) {
 const [search,setSearch]=useState(''),[after,setAfter]=useState(0),life=useReadLifetime(authority),qc=useQueryClient();
 const prefix=['f12-attendance-choice',authority,kind,company,branch,date];
 const q=useQuery({queryKey:[...prefix,search,after],queryFn:()=>readAttendanceChoices({kind,company,branch,date,search,after}),enabled:life.enabled,retry:false,staleTime:0});
 useLayoutEffect(()=>()=>{void qc.cancelQueries({queryKey:prefix});qc.removeQueries({queryKey:prefix});},[qc,authority,kind,company,branch,date]); // eslint-disable-line react-hooks/exhaustive-deps
 const data=q.data?.success?q.data:null;
 return <div><span className={styles.fieldLabel}>{kind==='team'?'Direct-manager team':kind==='site'?'Site':'Shift'}</span><ERPCombobox ariaLabel={`Attendance ${kind}`} placeholder={value?`Selected ${kind} #${value}`:`All ${kind==='team'?'direct-manager teams':kind+'s'}`} value={value} onValueChange={v=>onChange(v===null?null:Number(v))} options={data?.rows.map(r=>({value:r.id,label:r.label}))??[]} disabled={disabled||!data||q.isFetching} loading={q.isFetching} allowClear filterFn={()=>true} onSearchQueryChange={s=>{setSearch(s);setAfter(0);}} error={q.isError||q.data&&!q.data.success?'Choices unavailable; retry before changing this filter.':undefined}/><div className={styles.actions}>{after>0&&<Button variant="ghost"disabled={disabled||q.isFetching} onClick={()=>setAfter(0)}>First choices</Button>}{data?.hasMore&&<Button variant="ghost"disabled={disabled||q.isFetching} onClick={()=>{const last=data?.rows.at(-1);if(last)setAfter(last.id);}}>More choices</Button>}{(q.isError||q.data&&!q.data.success)&&<Button variant="ghost" onClick={()=>void q.refetch()}>Retry choices</Button>}</div></div>;
}

export function AttendanceConfirmations({authority}:{authority:string}) {
 const [open,setOpen]=useState(false),[cursor,setCursor]=useState<{before:string;operation:string}|null>(null),life=useReadLifetime(authority),qc=useQueryClient();
 const q=useQuery({queryKey:['f12-attendance-confirmations',authority,cursor],queryFn:()=>readRecentAttendance(cursor),enabled:open&&life.enabled,retry:false,staleTime:0});
 useLayoutEffect(()=>()=>{const queryKey=['f12-attendance-confirmations',authority];void qc.cancelQueries({queryKey});qc.removeQueries({queryKey});},[qc,authority]);
 const data=q.data?.success?q.data:null;
 return <section aria-label="Recent attendance confirmations"><Button variant="outline"onClick={()=>setOpen(v=>!v)}>{open?'Hide':'Show'} my recent save confirmations</Button>{open&&<><p className="text-sm text-muted-foreground">Only your currently permitted committed operations appear here. A missing receipt does not prove failure. Original operation references are preserved across uncertain responses.</p>{q.isFetching?<p role="status">Checking confirmations…</p>:!data?<p role="alert">Confirmations unavailable. <Button onClick={()=>void q.refetch()}>Retry confirmations</Button></p>:<><ul>{data.rows.map(r=><li key={r.receipt.operation_id}>Employee #{r.receipt.employee_id} · attendance #{r.receipt.id} · revision {r.receipt.revision} · {r.created_at} · operation {r.receipt.operation_id}</li>)}</ul>{!data.rows.length&&<p>No visible confirmations on this page.</p>}<Button variant="ghost"disabled={!cursor}onClick={()=>setCursor(null)}>Newest</Button><Button variant="ghost"disabled={!data.hasMore}onClick={()=>{const last=data.rows.at(-1);if(last)setCursor({before:last.created_at,operation:last.receipt.operation_id});}}>Older confirmations</Button></>}</>}</section>;
}
