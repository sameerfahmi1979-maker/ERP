import {expect,it,vi} from "vitest";
import {batch} from "../batch";
import {verifyDmsBatchUpload,prepareDmsUploadBatchMemberDraft} from "@/server/actions/dms/batch-intake";
vi.mock("@/server/actions/dms/batch-intake",()=>({verifyDmsBatchUpload:vi.fn(),prepareDmsUploadBatchMemberDraft:vi.fn()}));
it("verifies exactly one retained member without starting its draft",async()=>{
 const request={contract:{operationId:"186fc789-f885-46e4-8ca0-491eedb19609",revision:null},manifest:{version:1 as const,context:null,files:[{position:0,original_filename:"page.pdf",mime_type:"application/pdf",file_size_bytes:10,sha256_hash:"b".repeat(64)}]}};
 vi.mocked(verifyDmsBatchUpload).mockResolvedValue({state:"present"});
 expect(await batch({op:"documentBatchMember",request,position:0,action:"verify"})).toEqual({state:"present"});
 expect(verifyDmsBatchUpload).toHaveBeenCalledWith({request,position:0});expect(prepareDmsUploadBatchMemberDraft).not.toHaveBeenCalled();
});
