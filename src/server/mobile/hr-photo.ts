import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { photoStateSchema } from "@/server/hr-photo-source";
import { unavailable } from "./hr-shapes";
import { z } from "zod";

type State=z.infer<typeof photoStateSchema>;
type Db=Awaited<ReturnType<typeof createClient>>;
export function photoBinding(employee:number,dependent:number|null,state:State,checksum:string) {
  if(!state.photo || state.documentId!==state.photo.document_id || !/^[a-f0-9]{64}$/.test(checksum))return null;
  const {document_id:documentId,version_id:versionId,file_id:fileId}=state.photo;
  const fingerprint=createHash("sha256").update(JSON.stringify([employee,dependent,documentId,versionId,fileId,checksum,state.framing])).digest("hex");
  return {documentId,versionId,fileId,fingerprint,canDownload:state.canDownload};
}
export async function currentBinding(db:Db,employee:number,dependent:number|null,state:State,signal?:AbortSignal) {
  if(!state.photo || state.documentId!==state.photo.document_id)return null;
  const query=db.from("dms_document_files").select("sha256_hash").eq("id",state.photo.file_id).eq("document_id",state.documentId)
    .eq("version_id",state.photo.version_id).eq("file_role","original").is("deleted_at",null);
  const f=await (signal ? query.abortSignal(signal) : query).maybeSingle();
  signal?.throwIfAborted();
  if(f.error?.code==="42501")return null;
  if(f.error)throw unavailable();
  return f.data?photoBinding(employee,dependent,state,f.data.sha256_hash):null;
}
export async function subjectPhoto(employee:number,dependent:number|null=null,client?:Db,signal?:AbortSignal) {
  signal?.throwIfAborted();
  const db=client??await createClient();
  const query=db.rpc("hr_subject_photo_state",{p_employee:employee,p_dependent:dependent});
  const {data,error}=await (signal ? query.abortSignal(signal) : query);
  signal?.throwIfAborted();
  if(error?.code==="42501")return null;
  if(error)throw unavailable();
  return currentBinding(db,employee,dependent,photoStateSchema.parse(data),signal);
}
