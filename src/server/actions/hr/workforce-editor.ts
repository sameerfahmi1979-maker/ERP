'use server';
import{z}from'zod';import{getAuthContext}from'@/lib/rbac/check';import{createClient}from'@/lib/supabase/server';import{employeeId}from'@/lib/hr/employee-contract';
export async function readWorkforceEditorChoices(raw:unknown){
 const p=z.object({employee:employeeId,kind:z.enum(['assignment','pro-process']),field:z.enum(['work_site_id','deployment_review_id','assigned_to','f12_source_id','f12_replacement_id']),source:employeeId.nullable(),sourceKind:z.enum(['identity-document','medical-insurance','access-card']).nullable(),search:z.string().max(100),after:z.number().int().nonnegative().safe()}).strict().safeParse(raw);
 if(!p.success)return{success:false as const,error:'Choose a valid workforce source.'};
 try{const a=await getAuthContext();if(!a.profile||!a.isAccountActive||a.profile.must_change_password)return{success:false as const,denied:true,error:'Current account required.'};const q=p.data,r=await(await createClient()).rpc('f12_editor_choices',{p_employee:q.employee,p_kind:q.kind,p_field:q.field,p_source:q.source,p_source_kind:q.sourceKind,p_search:q.search,p_after:q.after}),v=z.array(z.object({id:employeeId,label:z.string().min(1)}).strict()).max(26).safeParse(r.data);
  if(r.error||!v.success)return{success:false as const,denied:r.error?.code==='42501',error:'Current permitted choices unavailable. No source or responsible person was inferred.'};
  return{success:true as const,rows:v.data.slice(0,25),hasMore:v.data.length>25};
 }catch{return{success:false as const,error:'Choices unavailable. Retain the original opening before retrying.'};}
}
