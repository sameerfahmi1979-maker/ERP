"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getEmployeeIdentityLink,setEmployeeIdentityLink } from "@/server/actions/users/employee-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

/** Explicit confirmation of an identity relationship, separate from descriptive profile text. */
export function EmployeeIdentityLink({profileId,readOnly}:{profileId:number;readOnly:boolean}) {
 const [search,setSearch]=useState(""); const [selected,setSelected]=useState<string>(""); const [review,setReview]=useState(false); const [busy,setBusy]=useState(false);
 const query=useQuery({queryKey:["employee-identity-link",profileId,search],queryFn:()=>getEmployeeIdentityLink(profileId,search),retry:false,refetchOnWindowFocus:false});
 const data=query.data?.success?query.data.data:null;
 if(query.isPending) return <p role="status">Loading employee identity link…</p>;
 if(!data) return <p role="alert">{query.data?.error??"Employee link could not be loaded."}</p>;
 const choice=data.choices.find(e=>String(e.id)===selected);
 return <section className="rounded-md border p-4 space-y-3" aria-label="Trusted employee identity">
  <h3 className="font-semibold">Employee identity link</h3>
  <p className="text-sm">Current link: <strong>{data.current?`${data.current.employee_code} — ${data.current.full_name_en}`:"Not linked"}</strong></p>
  <p className="text-sm text-muted-foreground">This link controls self-service and direct-report access. Employee reference text does not grant access. Company and branch must match.</p>
  {!readOnly && <>
   <label htmlFor="employee-link-search" className="block text-sm">Find an employee in this account’s company and branch</label>
   <Input id="employee-link-search" value={search} maxLength={100} onChange={e=>{setSearch(e.target.value);setReview(false);}} />
   <label htmlFor="employee-link-choice" className="block text-sm">Employee</label>
   <select id="employee-link-choice" className="w-full rounded-md border bg-background p-2 text-sm" value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);setReview(false);}}>
    <option value="">Choose an employee</option><option value="unlink">Remove the current link</option>
    {data.choices.map(e=><option key={e.id} value={e.id}>{e.employee_code} — {e.full_name_en}</option>)}
   </select>
   {review && <p role="status" className="border-l-4 border-warning pl-3 text-sm">Confirm: {selected==="unlink"?"remove self-service and direct-report identification for this account":`identify this account as ${choice?.employee_code} — ${choice?.full_name_en}`}. Existing role scopes do not change.</p>}
   <div className="flex flex-wrap gap-2">
    {review?<Button type="button" disabled={busy||(!choice&&selected!=="unlink")} onClick={async()=>{setBusy(true);try{const r=await setEmployeeIdentityLink(profileId,selected==="unlink"?null:Number(selected));if(r.success){toast.success("Employee identity link updated");setReview(false);setSelected("");await query.refetch();}else toast.error(r.error);}catch{toast.error("Link change could not be confirmed. Reload before retrying.");}finally{setBusy(false);}}}>Confirm identity link</Button>:<Button type="button" disabled={!selected||busy} onClick={()=>setReview(true)}>Review link change</Button>}
    {selected && <Button type="button" variant="outline" disabled={busy} onClick={()=>{setSelected("");setReview(false);}}>Cancel</Button>}
   </div>
  </>}
 </section>;
}
