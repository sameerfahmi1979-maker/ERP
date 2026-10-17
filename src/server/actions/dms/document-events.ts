"use server";
import {readAllPages} from "@/server/reads/all-pages";


export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type DmsDocumentEventRow = {
  id: number;
  document_id: number | null;
  event_type: string;
  description: string | null;
  performed_by: number | null;
  performed_at: string;
  metadata_json: unknown;
  performer?: { display_name: string | null } | null;
};

/** Legacy complete consumer: bounded traversal, never a silently truncated page. */
export async function getDmsDocumentEvents(documentId:number):Promise<ActionResult<DmsDocumentEventRow[]>> {
 try {
  const {getDmsDocumentHistoryPage}=await import("./lifecycle-history");
  const rows=await readAllPages<DmsDocumentEventRow>(async from=>{const r=await getDmsDocumentHistoryPage(documentId,Math.floor(from/20)+1,"all");return r.success?{data:r.data.rows,count:r.data.totalCount,error:null}:{data:null,count:null,error:r.error};},{batchSize:20,maxRows:10000,identity:r=>r.id});
  return {success:true,data:rows};
 }catch{return {success:false,error:"History could not be completely loaded. Please use the paged history section."};}
}
