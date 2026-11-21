import {expect,it} from "vitest";
import {buildManifest} from "../packs";
const hash="0".repeat(64);
const doc={id:8,number:"DMSD-8",versionId:3,sourceHash:hash};
const f={documentId:8,versionId:3,id:8,name:"a.pdf",mime:"application/pdf",size:20,sha256:hash,sourceHash:hash};
it("binds pack order, deduplicates names, and reports unsupported PDF sources",()=>{
 const files=[f,{...f,id:9,name:"A.pdf"},{...f,id:10,name:"../plan.xlsx",mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}];
 const manifest=buildManifest("pdf",[doc],files);
 expect(manifest.files[1].entryName).toBe("DMSD-8/A (2).pdf");expect(manifest.files[2].entryName).not.toContain("../");
 expect(manifest.pdf).toMatchObject({supported:false,unsupportedFileIds:[10]});
 expect(buildManifest("pdf",[doc],[files[1],files[0],files[2]]).manifestHash).not.toBe(manifest.manifestHash);
 expect(()=>buildManifest("zip",[doc],[{...f,size:52428801}])).toThrow();
});
