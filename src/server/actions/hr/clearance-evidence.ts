'use server';
import{z}from'zod';import{getAuthContext}from'@/lib/rbac/check';import{createClient}from'@/lib/supabase/server';import{employeeId}from'@/lib/hr/employee-contract';
async function active(){const c=await getAuthContext();return!!c.profile&&c.isAccountActive&&!c.profile.must_change_password;}
const cursor=z.number().int().nonnegative().safe().default(0);
export async function readClearanceEvidenceChoices(raw:unknown){
 const p=z.object({employee:employeeId,search:z.string().max(100).default(''),after:cursor}).strict().safeParse(raw);
 if(!p.success)return{success:false as const,error:'Choose a valid employee and evidence page.'};
 try{if(!await active())return{success:false as const,denied:true,error:'Current account required.'};const q=p.data,r=await(await createClient()).rpc('f12_clearance_evidence_choices',{p_employee:q.employee,p_search:q.search,p_after:q.after});
 const rows=z.array(z.object({id:employeeId,label:z.string().min(1),version_id:employeeId}).strict()).max(26).safeParse(r.data);
 if(r.error||!rows.success||rows.data.some(x=>x.id<=q.after)||new Set(rows.data.map(x=>x.id)).size!==rows.data.length)return{success:false as const,denied:r.error?.code==='42501',error:'Current permitted clearance evidence is unavailable.'};
 return{success:true as const,rows:rows.data.slice(0,25),hasMore:rows.data.length>25};
 }catch{return{success:false as const,error:'Evidence choices unavailable; no document or version inferred.'};}
}
export async function readClearanceHistory(raw:unknown){
 const p=z.object({employee:employeeId,caseId:employeeId,item:employeeId,after:cursor}).strict().safeParse(raw);
 if(!p.success)return{success:false as const,error:'Original clearance history identity required.'};
 try{if(!await active())return{success:false as const,denied:true,error:'Current account required.'};const q=p.data,r=await(await createClient()).rpc('f12_clearance_history',{p_employee:q.employee,p_case:q.caseId,p_item:q.item,p_after:q.after});
 const rows=z.array(z.object({id:employeeId,revision:z.string().regex(/^[1-9]\d*$/),action:z.enum(['create','update','clear','block','archive']),actor_profile_id:employeeId,created_at:z.iso.datetime({offset:true}),status:z.enum(['pending','cleared','blocked','not_applicable']),document_id:employeeId.nullable(),version_id:employeeId.nullable()}).strict()).max(26).safeParse(r.data);
 if(r.error||!rows.success||rows.data.some(x=>x.id<=q.after)||new Set(rows.data.map(x=>x.id)).size!==rows.data.length)return{success:false as const,denied:r.error?.code==='42501',error:'Current clearance history could not be verified.'};
 return{success:true as const,rows:rows.data.slice(0,25),hasMore:rows.data.length>25};
 }catch{return{success:false as const,error:'Clearance history unavailable; no empty result assumed.'};}
}
