import { describe, expect, it } from "vitest";
import { mobileDmsV5Command, completePage, shareToken } from "../contracts";

const operationId = "a742d708-d58f-4a36-8381-f58a81481e5a";
const sourceHash = "a".repeat(64);
const comment = {op:"documentCommentEdit", documentId:23, commentId:44, operationId, sourceHash, text:"New note"};
describe("DMS v5 wire admission", () => {
  it("preserves the database bigint revision without using a JS number", () => {
    expect(mobileDmsV5Command.parse({...comment,commentRevision:"9223372036854775807"})).toMatchObject({commentRevision:"9223372036854775807"});
    for (const commentRevision of [1,"01","+1","0","9223372036854775808"]) {
      expect(mobileDmsV5Command.safeParse({...comment,commentRevision}).success).toBe(false);
    }
  });
  it("requires a true 32-byte canonical base64url token", () => {
    expect(shareToken.safeParse("A".repeat(43)).success).toBe(true);
    expect(shareToken.safeParse("A".repeat(42)+"B").success).toBe(false);
  });
  it("requires the checklist proof from a requestable row and a real calendar date", () => {
    const create = {op:"documentRequestCreate",kind:"missing",parent:{entityType:"site",entityId:5},ruleId:8,assigneeId:null,dueDate:null,notes:"",operationId};
    expect(mobileDmsV5Command.safeParse(create).success).toBe(false);
    expect(mobileDmsV5Command.safeParse({...create,checklistHash:sourceHash}).success).toBe(true);
    expect(mobileDmsV5Command.safeParse({...create,checklistHash:sourceHash,dueDate:"2025-02-29"}).success).toBe(false);
  });
  it("rejects conflicting tag deltas, arbitrary notification targets and stray fields", () => {
    const tag = {op:"documentTagsChange",documentId:1,operationId,sourceHash,add:[3],remove:[3]};
    for(const value of [tag,{op:"documentNotificationAction",notificationId:2,action:"read",url:"/foo"},{...comment,commentRevision:"1",other:true}])
      expect(mobileDmsV5Command.safeParse(value).success).toBe(false);
  });
  it("refuses partial or duplicated pages", () => {
    expect(()=>completePage([{id:1}],1,20,2,r=>r.id)).toThrow();
    expect(()=>completePage([{id:1},{id:1}],1,20,2,r=>r.id)).toThrow();
    expect(completePage([],2,20,19,(r:{id:number})=>r.id)).toMatchObject({page:2,totalCount:19,hasMore:false,rows:[]});
  });
});
