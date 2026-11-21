import {expect,it} from "vitest";
import {groundQuestion} from "../dms-question-context";
const sha="a".repeat(64), digest="b".repeat(64);
const source={documentId:1,documentVersionId:2,documentRevision:"revision",fileId:null,fileSha256:null,sourceHash:sha};
const artifact={kind:"prepared_text" as const,artifactId:"421/21",documentId:1,versionId:2,artifactContentHash:digest,proofHash:sha,fileBindings:[{fileId:21,versionId:2,sha256:digest}],derivationHashes:[],text:"Verified V2 passage.",truncated:false};
it("withholds V1 and unbound passages from a V2 prompt",()=>{
 const old={...artifact,versionId:1,text:"Contains an old fact."};
 expect(()=>groundQuestion(source,{metadata:{title:"V2"},artifacts:[old]},"verified_text")).toThrow(/preparation/i);
 expect(groundQuestion(source,{metadata:{title:"V2"},artifacts:[old]},"metadata_only").prompt).not.toContain("old fact");
});
it("changes the grounding digest when current evidence or accepted metadata changes",()=>{
 const a=groundQuestion(source,{metadata:{title:"V2"},artifacts:[artifact]},"verified_text");
 expect(a.prompt).toContain("Verified V2 passage");expect(a.sourceKinds).toContain("prepared_text");
 expect(groundQuestion(source,{metadata:{title:"Updated"},artifacts:[artifact]},"verified_text").groundingHash).not.toBe(a.groundingHash);
});
