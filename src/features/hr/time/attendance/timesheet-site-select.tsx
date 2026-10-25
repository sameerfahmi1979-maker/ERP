'use client';
import {useLayoutEffect,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {ERPCombobox} from '@/components/erp/combobox';
import {Button} from '@/components/ui/button';
import {useReadLifetime} from '@/hooks/use-read-lifetime';
import {readTimesheetSites} from '@/server/actions/hr/attendance-workbench';

export function TimesheetSiteSelect({company,date,authority,value,label,disabled,ariaLabel,onChange}:{company:number;date:string;authority:string;value:number|null;label?:string|null;disabled:boolean;ariaLabel:string;onChange:(site:number|null)=>void}){
 const [search,setSearch]=useState(''),[after,setAfter]=useState(0),life=useReadLifetime(authority),qc=useQueryClient();
 const scope=JSON.stringify([authority,company,date]);
 const [chosen,setChosen]=useState<{id:number;label:string;scope:string}|null>(null);
 const key=['timesheet-sites',authority,company,date];
 const q=useQuery({queryKey:[...key,search,after],queryFn:()=>readTimesheetSites({company,date,search,after}),enabled:company>0&&life.enabled,retry:false,staleTime:30_000});
 useLayoutEffect(()=>()=>{queueMicrotask(()=>{for(const query of qc.getQueryCache().findAll({queryKey:key})){if(query.getObserversCount()===0){void qc.cancelQueries({queryKey:query.queryKey,exact:true});qc.removeQueries({queryKey:query.queryKey,exact:true});}}});},[qc,authority,company,date]); // eslint-disable-line react-hooks/exhaustive-deps
 const data=q.data?.success?q.data:null;
 const options=data?.rows.map(r=>({value:r.id,label:r.label}))??[];
 const retained=chosen?.scope===scope&&chosen.id===value?chosen.label:label;
 if(value!==null&&!options.some(o=>o.value===value)&&retained)options.unshift({value,label:retained});
 return <div><ERPCombobox ariaLabel={ariaLabel} value={value} options={options} placeholder={value?'Previously selected site — search to review':'Select site / location'} disabled={disabled||!data||q.isFetching} loading={q.isFetching} onValueChange={v=>{const id=v===null?null:Number(v),option=options.find(o=>o.value===id);setChosen(option?{id:option.value,label:option.label,scope}:null);onChange(id);}} filterFn={()=>true} onSearchQueryChange={s=>{setSearch(s);setAfter(0);}} allowClear error={q.isError||q.data&&!q.data.success?'Sites unavailable; retry.':undefined}/>
 <div className="flex flex-wrap gap-1">{after>0&&<Button variant="ghost"disabled={disabled||q.isFetching}onClick={()=>setAfter(0)}>First sites</Button>}{data?.hasMore&&<Button variant="ghost"disabled={disabled||q.isFetching}onClick={()=>{const last=data.rows.at(-1);if(last)setAfter(last.id);}}>More sites</Button>}{(q.isError||q.data&&!q.data.success)&&<Button variant="ghost"onClick={()=>void q.refetch()}>Retry sites</Button>}</div></div>;
}
