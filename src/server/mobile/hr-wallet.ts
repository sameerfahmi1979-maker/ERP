import { deriveIssuanceDisplayStatus } from "@/lib/output/issuance-status";
import { rpc, type Db } from "./hr-reads";
import { pageOf, requireDomain } from "./hr-page";
import { unavailable } from "./hr-shapes";
import type { ExpandedInput } from "./hr-services-contracts";
import { z } from "zod";
export async function issuedDocuments(db:Db,i:ExpandedInput<"issuedDocuments">) {
  await requireDomain(db,i.employeeId,"hr.employees.view","hr.employee_profile.view");
  const start=(i.page-1)*25;
  // Generated-document SELECT policy uses f03_has_generated_pdf_permission('view') before the range.
  const q=await db.from("erp_generated_pdf_documents").select("id,file_name,output_code,serial_no,lifecycle_state,issued_at,expires_at,revoked_at,archived_at,superseded_by_id,checksum,file_size_bytes")
    .eq("source_record_type","employee").eq("source_record_id",i.employeeId).not("output_code","is",null)
    .order("generated_at",{ascending:false}).order("id",{ascending:false}).range(start,start+25);
  if(q.error || !q.data)throw unavailable();
  const rows=await Promise.all(q.data.map(async r=>{
    const status=deriveIssuanceDisplayStatus(r);
    return {id:r.id,fileName:r.file_name,outputCode:r.output_code,title:r.file_name,serialNo:r.serial_no,status,issuedAt:r.issued_at,
      expiresAt:r.expires_at,supersededById:r.superseded_by_id,checksum:r.checksum,bytes:r.file_size_bytes,
      canDownload:status==="issued" && !r.archived_at && z.boolean().parse(await rpc(db,"f03_has_generated_pdf_permission",{document_id:r.id,action_code:"download"}))};
  }));
  return pageOf(i.employeeId,i.page,rows);
}
