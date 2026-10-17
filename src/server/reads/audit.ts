import "server-only";
import {getAuthContext,hasPermission,type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {sanitizeSecurityAuditPayload} from "@/lib/audit/sanitizers";
import {literalContains} from "@/lib/reads/search";
import {auditRequestSchema,auditPageSchema,auditMetadataSchema} from "@/lib/reads/audit-schema";
const fields="id,created_at,action,module_code,entity_name,entity_id,entity_reference,actor_user_profile_id";
/** Ordinary caller RLS, minimal page metadata and separately requested details. */
export async function readAudit(input:unknown,context?:AuthContext,signal?:AbortSignal){
  const p=auditRequestSchema.safeParse(input);if(!p.success)return{success:false,error:"Invalid audit criteria"};
  try{
    signal?.throwIfAborted();const ctx=context??await getAuthContext();
    if(!ctx.profile||!ctx.isAccountActive||ctx.profile.must_change_password||!hasPermission(ctx,"audit.view"))return{success:false,error:"Permission denied"};
    const db=await createClient(),criteria=p.data;
    if("mode"in criteria){
      let q=db.from("audit_logs").select("id,created_at,action,module_code,entity_name,entity_id,entity_reference,actor_user_profile_id,old_values,new_values").eq("id",criteria.id);if(signal)q=q.abortSignal(signal);
      const r=await q.maybeSingle();signal?.throwIfAborted();if(r.error)throw Error("Audit detail unavailable");if(!r.data)return{success:false,error:"Permission denied"};
      const metadata=auditMetadataSchema.parse(r.data);if(metadata.id!==criteria.id)throw Error("Audit identity mismatch");
      return{success:true,data:{...metadata,old_values:sanitizeSecurityAuditPayload(r.data.old_values),new_values:sanitizeSecurityAuditPayload(r.data.new_values)}};
    }
    const query=(head=false)=>{
      let q=db.from("audit_logs").select(fields,{count:"exact",head});
      for(const [field,value]of [["module_code",criteria.module],["action",criteria.action],["entity_name",criteria.entity_name]]as const)if(value)q=q.eq(field,value);
      if(criteria.actor)q=q.eq("actor_user_profile_id",criteria.actor);if(criteria.entity_id)q=q.eq("entity_id",criteria.entity_id);
      if(criteria.date_from)q=q.gte("created_at",criteria.date_from+"T00:00:00Z");
      if(criteria.date_to){const next=new Date(criteria.date_to+"T00:00:00Z");next.setUTCDate(next.getUTCDate()+1);q=q.lt("created_at",next.toISOString());}
      if(criteria.search)q=q.or(`action.ilike.${literalContains(criteria.search)},entity_reference.ilike.${literalContains(criteria.search)}`);
      if(signal)q=q.abortSignal(signal);return q;
    };
    const offset=(criteria.page-1)*criteria.pageSize;
    const r=await query().order(criteria.sort,{ascending:criteria.direction==="asc"}).order("id",{ascending:true}).range(offset,offset+criteria.pageSize-1);signal?.throwIfAborted();
    let data=r.data,count=r.count;
    if(offset>0&&r.status===416&&r.error?.code==="PGRST103"){
      const h=await query(true);signal?.throwIfAborted();if(h.error||h.count===null||h.count>offset)throw Error("Audit recount unavailable");data=[];count=h.count;
    }else if(r.error)throw Error("Audit read unavailable");
    return{success:true,data:auditPageSchema.parse({criteria,rows:data,totalCount:count})};
  }catch{signal?.throwIfAborted();return{success:false,error:"Audit records could not be verified. Please retry."};}
}
