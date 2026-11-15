import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { collectCompletePages } from "@/lib/reads/complete-pages";

export async function readHrFillFacts(db: Awaited<ReturnType<typeof createClient>>, employeeId: number) {
  const employee = await db.from("employees").select("id,employee_code,full_name_en,employee_status,joining_date,date_of_birth,gender,nationality:countries(name_en),department:departments(department_name_en),designation:designations(designation_name_en)").eq("id",employeeId).is("deleted_at",null).maybeSingle();
  if (employee.error || employee.data?.id !== employeeId) throw Error("Authorized employee facts unavailable");
  const [identityDocs,dmsLinks] = await Promise.all([
    collectCompletePages((from,to)=>db.from("employee_identity_documents").select("id,document_type,issue_date,expiry_date,is_primary",{count:"exact"}).eq("employee_id",employeeId).is("deleted_at",null).order("id").range(from,to),{maxRows:200,batchSize:100,identity:r=>r.id}),
    collectCompletePages(async (from,to)=>{
      const result=await db.rpc("read_dms_entity_document_links",
        {target_entity_type:"employee",target_entity_id:employeeId},{get:true,count:"exact"})
        .select("id,document:dms_documents(id,document_no,document_type:dms_document_types(type_code,name_en),completeness_score,ai_risk_level,issue_date,expiry_date)")
        .is("deleted_at",null).order("id").range(from,to);
      if (result.data !== null && !Array.isArray(result.data)) throw Error("Invalid document link facts");
      return {...result,data:result.data};
    },{maxRows:200,batchSize:100,identity:r=>r.id}),
  ]);
  const facts={emp:employee.data,identityDocs,dmsLinks};
  return {...facts,fingerprint:createHash("sha256").update(JSON.stringify(facts)).digest("hex")};
}
