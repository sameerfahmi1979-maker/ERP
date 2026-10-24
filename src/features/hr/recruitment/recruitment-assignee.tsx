'use client';
import{useState}from'react';
import{useQuery}from'@tanstack/react-query';
import{ERPCombobox}from'@/components/erp/combobox';
import{Button}from'@/components/ui/button';
import{readRecruitmentAssignees}from'@/server/actions/hr/recruitment-lifecycle';
/** Paginated authorized lookup. Never load a whole user directory or silently
 * choose the current HR operator as interviewer/task assignee. */
export function RecruitmentAssignee({candidate,employee=null,value,onChange,identity,label,disabled=false,required=false}:{candidate:number|null;employee?:number|null;value:number|null;onChange:(id:number|null)=>void;identity:string;label:string;disabled?:boolean;required?:boolean}){
 const[search,setSearch]=useState(''),[cursors,setCursors]=useState<number[]>([0]);
 const after=cursors.at(-1)??0,q=useQuery({queryKey:['f12-assignees',identity,candidate,employee,search,after],queryFn:()=>readRecruitmentAssignees(candidate,employee,search,after),enabled:!disabled,staleTime:30000});
 const rows=q.data?.success?q.data.rows:[];
 return <div><ERPCombobox ariaLabel={label}required={required}value={value}onValueChange={id=>onChange(typeof id==='number'?id:null)}disabled={disabled||q.isFetching||!q.data?.success}options={rows.map(r=>({value:r.id,label:r.full_name??`Authorized user ${r.id}`}))}onSearchQueryChange={value=>{setSearch(value);setCursors([0]);}}filterFn={()=>true}placeholder={value?`Recorded assignee #${value}; verify current authorization`:'Choose an authorized person'}/>{q.isError||q.data?.success===false?<p role="alert">Authorized people unavailable. No assignment was inferred.</p>:null}{cursors.length>1&&<Button type="button"variant="ghost"disabled={q.isFetching}onClick={()=>setCursors(v=>v.slice(0,-1))}>Previous people</Button>}{q.data?.success&&q.data.hasMore&&<Button type="button"variant="ghost"disabled={q.isFetching}onClick={()=>setCursors(v=>[...v,rows.at(-1)!.id])}>More people</Button>}</div>;
}
