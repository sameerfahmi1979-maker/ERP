'use client';
import{useState}from'react';import{useQuery}from'@tanstack/react-query';import{Button}from'@/components/ui/button';import{readRequisitionCapacity}from'@/server/actions/hr/recruitment-lifecycle';
export function RequisitionCapacity({id,vacancies,identity}:{id:number;vacancies:number;identity:string}){
 const[opened,setOpened]=useState(false),q=useQuery({queryKey:['f12-capacity',identity,id],queryFn:()=>readRequisitionCapacity(id),enabled:opened,staleTime:0});
 return <div>{vacancies}<Button type="button"variant="ghost"size="sm"onClick={()=>setOpened(v=>!v)}>Check filled</Button>{opened&&(q.isFetching?<p role="status">Checking actual conversions…</p>:!q.isError&&q.data?.success?<p>{q.data.data.filled} filled · {q.data.data.remaining} remaining</p>:<p role="alert">Capacity unavailable; not a verified zero.</p>)}</div>;
}
