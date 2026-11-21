import {readFileSync} from "node:fs";
import {join} from "node:path";
import {describe,expect,it} from "vitest";
import {mobileDmsV5Command} from "@/server/mobile/dms-v5/contracts";
const migrations = [
 "20261121024943_mobile_dms_requests_and_receipts.sql",
 "20261121025434_mobile_dms_authenticated_shares.sql",
 "20261121025537_mobile_dms_personal_collections.sql",
 "20261121030521_dms_question_source_provenance.sql",
].map(name=>readFileSync(join(process.cwd(),"supabase/migrations",name),"utf8"));
const wire:Record<string,object>={
 documentDetails:{documentId:1},documentSources:{documentId:1,kind:"files",page:1},
 documentMetadata:{documentId:1},documentMetadataSave:{snapshot:"0".repeat(64),values:[]},
 documentTags:{documentId:1,page:1},documentTagOptions:{documentId:1,page:1,search:""},
 documentTagsChange:{add:[2],remove:[]},documentComments:{documentId:1,page:1},
 documentCommentAdd:{text:"First note"},documentCommentEdit:{text:"Changed",commentId:1,commentRevision:"2"},
 documentCommentDelete:{commentId:1,commentRevision:"2"},documentHistory:{documentId:1,page:1,filter:"downloads"},
 processingStatus:{documentId:1},processingAction:{action:"prepare_source",snapshot:"0".repeat(64),fileIds:[2]},
 documentCompare:{sources:[{documentId:1,versionId:1},{documentId:2,versionId:2}],recordFindings:false},
 documentQuestion:{documentId:1,sourceHash:"0".repeat(64),question:"Find reference"},
 documentNaturalSearch:{query:"Active certificates",page:1},documentNotifications:{page:1,unreadOnly:true},
 documentNotificationAction:{notificationId:2,action:"read"},requiredChecklist:{parent:{entityType:"site",entityId:1},page:1},
 documentRequestOptions:{parent:{entityType:"site",entityId:1},kind:"missing",search:"",page:1},
 documentRequests:{audience:"mine",page:1},documentRequestCreate:{parent:{entityType:"site",entityId:1},kind:"missing",ruleId:3,assigneeId:null,dueDate:null,notes:"",checklistHash:"0".repeat(64)},
 documentRequestAct:{kind:"missing",requestId:3,action:"start",notes:"",expectedRevision:1},
 documentShareRecipients:{documentId:1,sourceHash:"0".repeat(64),search:"",page:1},documentShares:{documentId:1,page:1},
 documentShareCreate:{fileId:2,versionId:2,token:"A".repeat(43),recipientProfileId:4,lifetimeHours:24},
 documentShareRevoke:{shareId:2},documentShareResolve:{token:"A".repeat(43)},documentPackManifest:{documentIds:[3],format:"zip"},
 documentPackValidate:{documentIds:[3],format:"zip",manifestHash:"0".repeat(64)},documentFavourites:{page:1},
 documentFavouriteSet:{documentId:2,value:false},documentSavedFilters:{page:1},documentSavedFilterSave:{name:"Due",criteria:{version:1,personal:true,search:"",validity:"expiring"}},
 documentSavedFilterDelete:{id:3,revision:"revision"},documentQrLookup:{payload:"ALGT:DMS:1:42"},documentBatchAdmit:{},documentBatchRecover:{},documentBatchMember:{position:0,action:"verify"},
};
const operationId="5ea3d979-e84a-42b1-8aba-ad6db365da26";
const sourceChanges=new Set(["documentMetadataSave","documentTagsChange","documentCommentAdd","documentCommentEdit","documentCommentDelete","processingAction","documentShareCreate"]);
const receiptChanges=new Set(["documentRequestCreate","documentRequestAct","documentShareRevoke","documentSavedFilterSave","documentSavedFilterDelete"]);
const request={contract:{operationId,revision:null},manifest:{version:1,context:null,files:[{position:0,original_filename:"a.pdf",mime_type:"application/pdf",file_size_bytes:7,sha256_hash:"a".repeat(64)}]}};
describe("Mobile DMS canonical surface",()=>{
 it("contains exactly the forty accepted mobile operations",()=>expect(Object.keys(wire)).toHaveLength(40));
 it.each(Object.entries(wire))("admits %s and rejects extra transport authority", (op,fields)=>{
  const data={op,...fields,...(sourceChanges.has(op)?{documentId:1,operationId,sourceHash:"0".repeat(64)}:{}),...(receiptChanges.has(op)?{operationId}:{}),...(op.startsWith("documentBatch")?{request}:{})};
  expect(mobileDmsV5Command.parse(data).op).toBe(op);
  expect(mobileDmsV5Command.safeParse({...data,actor:4}).success).toBe(false);
 });
 it("hardens every definer search path and explicitly revokes default API execution",()=>{
  for(const script of migrations){
   const definers=[...script.matchAll(/CREATE FUNCTION ([^(]+)\([^;]+?SECURITY DEFINER[^;]+?\bAS \$\$/gi)];
   expect(definers.length).toBeGreaterThan(0);
   for(const d of definers)expect(d[0]).toMatch(/SET search_path=''/i);
   expect(script).toMatch(/REVOKE ALL ON FUNCTION/i);
   expect(script).not.toMatch(/GRANT EXECUTE[^;]+ TO (?:PUBLIC|anon)\b/i);
  }
 });
});
