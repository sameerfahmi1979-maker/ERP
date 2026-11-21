import {expect,it,vi} from "vitest";
import {readHistory} from "../documents";
import {getDmsDocumentHistoryPage} from "@/server/actions/dms/lifecycle-history";
vi.mock("@/server/actions/dms/lifecycle-history",()=>({getDmsDocumentHistoryPage:vi.fn()}));
it("projects only the canonical history receipt and strips free-form metadata",async()=>{
 vi.mocked(getDmsDocumentHistoryPage).mockResolvedValue({success:true,data:{rows:[{id:4,document_id:1,event_type:"file_download_response_prepared",description:"Saved",performed_by:7,performed_at:"2026-11-21T00:00:00Z",performer:{display_name:"Officer"},metadata_json:{file_id:8,version_id:9,bytes:20,delivery:"response_prepared",private:"secret"}}],page:1,pageSize:20,totalCount:1}});
 const result=await readHistory({op:"documentHistory",documentId:1,page:1,filter:"downloads"});
 expect(result.rows[0]).toEqual({id:4,type:"file_download_response_prepared",description:"Saved",actorLabel:"Officer",at:"2026-11-21T00:00:00Z",fileId:8,versionId:9,bytes:20,delivery:"response_prepared"});
});
