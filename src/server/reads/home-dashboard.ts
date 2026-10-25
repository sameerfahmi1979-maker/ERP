import "server-only";
import {createClient} from "@/lib/supabase/server";
import {hasPermission,type AuthContext} from "@/lib/rbac/check";
type Metric={status:"ready";value:number}|{status:"restricted"|"failed"};
/** Bounded, ordinary-caller reads. Missing/failed metrics never become sample values. */
export async function readHomeDashboard(ctx:AuthContext){
  if(!ctx.profile||!ctx.isAccountActive||ctx.profile.must_change_password||!hasPermission(ctx,"dashboard.view"))throw Error("Permission denied");
  const db=await createClient();
  const count=async(table:string,allowed:boolean,queued=false):Promise<Metric>=>{
    if(!allowed)return{status:"restricted"};
    try{let q=db.from(table).select("id",{count:"exact",head:true});
      if(queued)q=q.in("job_status",["queued","running"]);else if(table==="employees")q=q.is("deleted_at",null);
      const r=await q;if(r.error||r.count===null||!Number.isSafeInteger(r.count)||r.count<0)throw Error("Count unavailable");return{status:"ready",value:r.count};
    }catch{return{status:"failed"};}
  };
  const [employees,documentsPending,parties,activity]=await Promise.all([
    count("employees",hasPermission(ctx,"hr.employees.view")),
    count("dms_ai_job_queue",hasPermission(ctx,"dms.admin")||hasPermission(ctx,"dms.documents.view"),true),
    count("parties",hasPermission(ctx,"parties.view")),
    (async()=>{if(!hasPermission(ctx,"audit.view"))return{status:"restricted"as const,rows:[]};
      try{const r=await db.from("audit_logs").select("id,action,module_code,created_at").order("created_at",{ascending:false}).order("id",{ascending:false}).range(0,9);
        if(r.error||!Array.isArray(r.data))throw Error("Activity unavailable");return{status:"ready"as const,rows:r.data};
      }catch{return{status:"failed"as const,rows:[]};}})(),
  ]);
  return{asOf:new Date().toISOString(),employees,documentsPending,parties,activity};
}
