import {describe,it,expect} from "vitest";
import {documentMeaning,identityMatches,sharedSearchSchema,assertSearchAdapter,normalizeIdentity} from "@/lib/ai/search/vocabulary";
const types=[{id:1,name_en:"Passport Copy",type_code:"PASSPORT"},{id:2,name_en:"ISO Certificate",type_code:"ISO"},{id:3,name_en:"CICPA Gate Pass",type_code:"CICPA"},{id:4,name_en:"Emirates ID",type_code:"EID"}];
describe("shared business meaning",()=>{
  it.each(["ISO certificates","iso certifications","ISO certificate"])("matches configured ISO type for %s",q=>{const m=documentMeaning(q,types);expect(m.typeIds).toEqual([2]);expect(m.remainder).toBe("");});
  it("keeps ISO standard as a hard constraint",()=>{expect(documentMeaning("ISO 9001 certificates",types)).toMatchObject({typeIds:[2],remainder:"9001"});});
  it("keeps person independent of passport type",()=>{expect(documentMeaning("show Sameer Fahmi passport",types)).toMatchObject({typeIds:[1],subjectHint:"Sameer Fahmi"});});
  it("does not equate a dependent surname to the employee",()=>{expect(identityMatches("Jaslene Sameer Fahmi",null,"Sameer Fahmi")).toBe(false);expect(identityMatches("Sameer Fahmi Abu Elayyan","EMP-000001","sameer fahmi")).toBe(true);});
  it("supports exact codes and normalized Arabic",()=>{expect(identityMatches("Something","EMP-000001","emp-000001")).toBe(true);expect(normalizeIdentity("أحمَد   علي")).toBe("احمد علي");});
  it("does not invent a type when configured lookup is missing",()=>{const m=documentMeaning("ISO certificates",[]);expect(m.typeIds).toEqual([]);expect(m.terms).toContain("iso");});
  it.each(["DMS-2026-000741","sameer@example.test","784-1985-1234567-9","2026-10-30"])("retains identifier punctuation in %s",query=>{expect(documentMeaning(query,[]).terms).toContain(query.toLowerCase());});
  it("retains unknown concepts and expiry",()=>{const m=documentMeaning("expired sameer passport blue",types);expect(m.expiry).toBe("expired");expect(m.remainder).toBe("sameer blue");});
  it("requires narrow registered capability",()=>{expect(()=>assertSearchAdapter("documents")).not.toThrow();expect(()=>assertSearchAdapter("__proto__")).toThrow();expect(()=>assertSearchAdapter("arbitrary_sql")).toThrow();});
  it.each([{query:"x",sql:"select *"},{query:"x",filters:{salary:1}},{query:"x",subject:{type:"employee",id:-1}},{query:"x",pageSize:101},{query:"x",filters:{issueFrom:"2027-01-01",issueTo:"2026-01-01"}}])("rejects unregistered or malformed criteria %j",input=>expect(sharedSearchSchema.safeParse(input).success).toBe(false));
});
