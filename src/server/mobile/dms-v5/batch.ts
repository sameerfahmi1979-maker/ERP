import {createDmsUploadBatch,recoverDmsUploadBatch,recoverDmsBatchMemberUpload,verifyDmsBatchUpload,prepareDmsUploadBatchMemberDraft} from "@/server/actions/dms/batch-intake";
import {batchAdmissionResultSchema,batchMemberUploadResultSchema} from "@/lib/dms/batch-admission";
import {type CommandFor} from "./contracts";
export async function batch(input:CommandFor<"documentBatchAdmit"|"documentBatchRecover"|"documentBatchMember">){
 if(input.op==="documentBatchAdmit")return batchAdmissionResultSchema.parse(await createDmsUploadBatch(input.request));
 if(input.op==="documentBatchRecover")return batchAdmissionResultSchema.parse(await recoverDmsUploadBatch(input.request));
 const selected={request:input.request,position:input.position};
 switch(input.action){
  case "recover":return batchMemberUploadResultSchema.parse(await recoverDmsBatchMemberUpload(selected));
  case "verify":return verifyDmsBatchUpload(selected);
  case "prepare_draft":return prepareDmsUploadBatchMemberDraft(selected);
 }
}
