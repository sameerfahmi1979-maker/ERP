'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useReadCacheOwner} from '@/components/layout/read-cache-boundary';
import {listHrLetterSources} from '@/server/actions/output/hr-letter-source-choices';
import {Button} from '@/components/ui/button';
/** Small record selector, not a second report/list UI. No automatic first/latest choice. */
export function HrLetterSourceSelector({employeeId,code,value,onChange,disabled}:{employeeId:number;code:string;value:string;onChange:(value:string)=>void;disabled:boolean}){
 const owner=useReadCacheOwner(),[page,setPage]=useState(1),[retry,setRetry]=useState(0);
 const ownerRef=useRef(owner);useLayoutEffect(()=>{ownerRef.current=owner;},[owner]);
 const key=JSON.stringify([employeeId,code,page,retry,value,owner?.identity,owner?.generation]);
 const [state,setState]=useState<{key?:string;rows:{id:number;label:string}[];more:boolean;error:string;ready:boolean}>({rows:[],more:false,error:'',ready:false});
 useEffect(()=>{let current=true;
  Promise.all([listHrLetterSources({employeeId,code,page}),value?listHrLetterSources({employeeId,code,selectedId:Number(value)}):null]).then(([r,selected])=>{
   if(!current||ownerRef.current?.isLive()===false)return;
   if(!r.success||(selected&&!selected.success)||(value&&selected?.success&&!selected.rows.some(row=>row.id===Number(value)))){setState({key,rows:[],more:false,error:'The original source or current access is unavailable. Retry or explicitly choose another record.',ready:false});return;}
   const rows=[...r.rows,...(selected?.success?selected.rows.filter(row=>!r.rows.some(other=>other.id===row.id)):[])];setState({key,rows,more:r.hasMore,error:'',ready:true});
  }).catch(()=>{if(current)setState({key,rows:[],more:false,error:'Source choices unavailable. Retry.',ready:false});});return()=>{current=false;};
 },[employeeId,code,page,retry,value,key]);
 const ready=state.key===key&&state.ready;
 return <div><select aria-label="Original employee transaction" value={value} disabled={disabled||!ready} onChange={e=>onChange(e.target.value)} className="w-full rounded-sm border bg-background p-2 text-foreground"><option value="">Select a source record</option>{(state.key===key?state.rows:[]).map(row=><option value={row.id} key={row.id}>{row.label}</option>)}</select>
 {state.key===key&&state.error?<p role="alert" className="text-sm text-destructive">{state.error}<Button type="button" variant="outline" onClick={()=>setRetry(n=>n+1)}>Retry sources</Button></p>:!ready?<p role="status">Checking sources…</p>:null}
 {(page>1||state.more)&&<div className="flex gap-2"><Button type="button" variant="outline" disabled={disabled||!ready||page===1} onClick={()=>setPage(n=>n-1)}>Previous</Button><Button type="button" variant="outline" disabled={disabled||!ready||!state.more} onClick={()=>setPage(n=>n+1)}>Next</Button></div>}</div>;
}
