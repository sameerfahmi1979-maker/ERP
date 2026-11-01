import{describe,expect,it}from"vitest";
import{comparePreparedSources,compareRetainedPassages,type ComparableSource}from"@/lib/dms/preparation/comparison";
const source=(text:string|null,patch:Partial<ComparableSource>={}):ComparableSource=>({documentId:1,versionId:2,sourceHash:"a".repeat(64),subjectKey:null,facts:[],complete:true,passages:[{fileId:3,versionId:2,sha256:"a".repeat(64),text}],...patch});
describe("bounded original passage comparison",()=>{
 it("identifies actual exclusion changes and preserves exact file/version provenance",()=>{const a=source("Payment within 30 days.\nExcludes overtime."),b=source("Payment within 30 days.\nIncludes overtime.",{documentId:4});const r=comparePreparedSources(a,b).passageComparison;expect(r.state).toBe("different");expect(r.changes.map(c=>c.excerpt.text)).toEqual(["Excludes overtime.","Includes overtime."]);expect(r.changes[0].excerpt).toMatchObject({fileId:3,versionId:2,sha256:"a".repeat(64)});});
 it("preserves Arabic excerpts without inventing a translation or page coordinate",()=>{const r=compareRetainedPassages(source("النص الأصلي"),source("النص المعدل"));expect(r.changes[0].excerpt.text).toBe("النص الأصلي");expect(r.changes[0].excerpt).not.toHaveProperty("page");});
 it("never calls missing source text a clean match",()=>{expect(compareRetainedPassages(source(null),source("Clause")).state).toBe("unavailable");});
 it("labels incomplete sources even when their retained excerpt is equal",()=>{expect(compareRetainedPassages(source("Clause",{complete:false}),source("Clause"))).toMatchObject({state:"partial",complete:false});});
 it("retains repeated clauses rather than treating the source as a set",()=>{const r=compareRetainedPassages(source("Same\nSame"),source("Same"));expect(r.changes).toHaveLength(1);expect(r.changes[0].source).toBe("first");});
 it("bounds large outputs and reports partial comparison",()=>{const r=compareRetainedPassages(source(Array.from({length:300},(_,i)=>`A${i}`).join("\n")),source("Other"));expect(r.complete).toBe(false);expect(r.changes.length).toBeLessThanOrEqual(40);});
 it("never calls equal truncated previews a complete match",()=>{const text=Array.from({length:220},(_,i)=>`Clause ${i}`).join("\n");expect(compareRetainedPassages(source(text),source(text))).toMatchObject({complete:false,state:"partial"});});
});
