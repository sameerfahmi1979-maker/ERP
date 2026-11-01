import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, realpathSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
// Source scanner is a local technical tool; no database/provider execution.
import { inventorySource } from "../../tooling/ai/foundation-inventory.mjs";

let fixture: string;
const base = resolve("test-results/ai-mod01");
beforeAll(() => {
  mkdirSync(base,{recursive:true}); fixture=mkdtempSync(join(base,"inventory-"));
  const files: Record<string,string> = {
    "src/app/page.tsx": 'export default function Home(){return <form><Input name="title" placeholder="Search documents"/><input type="file"/></form>}',
    "src/features/dms/documents/dms-documents-table.tsx": 'export function Table(){const x=useForm();return <SearchInput name="query"/>}',
    "src/features/dms/browser/dms-browser-page-client.tsx": 'export function Browser(){lookupDocuments();return <DocumentPicker/>}',
    "src/features/hr/document-browser/hr-doc-browser-page-client.tsx": 'export function Browser(){return <LookupSelect/>}',
    "src/features/hr/employees/subject-photo.tsx": 'export function Photo(){return <UploadDropzone/>}',
    "src/features/dms/upload/dms-upload-inbox-page-client.tsx": 'export function Inbox(){return <IntakeReview/>}',
    "src/registry.ts": 'const ENTITY_TYPE="company" as const; const TARGET_TABLE="owner_companies"; export const fields=[{entityType:ENTITY_TYPE,targetTable:TARGET_TABLE,targetField:"trade_name",isAiEligible:true,safetyClassification:"business_safe"}]; export function query(db:any,name:string){db.from(name).select("id");}',
  };
  for(const [path,text] of Object.entries(files)){mkdirSync(resolve(fixture,path,".."),{recursive:true});writeFileSync(join(fixture,path),text);}
});
afterAll(() => { const target=realpathSync(fixture); if(!target.startsWith(realpathSync(base)+"\\")&&!target.startsWith(realpathSync(base)+"/"))throw new Error("Unsafe test cleanup path");rmSync(target,{recursive:true}); });

describe("reproducible app-wide source inventory", () => {
  it("accounts for inspected files, unique consumers, fields and held computed queries", () => {
    const result = inventorySource(fixture);
    expect(result.sources.length).toBe(7);
    expect(result.sources.every((s: { disposition: string }) => !!s.disposition)).toBe(true);
    expect(new Set(result.consumers.map((c: { id: string }) => c.id)).size).toBe(result.consumers.length);
    expect(result.consumers.every((c: { disposition: string }) => !!c.disposition)).toBe(true);
    expect(result.formBindings.every((b: { aiEligibility: string }) => b.aiEligibility === "not_granted_by_inventory")).toBe(true);
    expect(result.queries.some((q: { computed: boolean }) => q.computed)).toBe(true);
    expect(result.queries.every((q: { id: string; disposition: string; authorityOwner: string }) => !!q.id && !!q.disposition && !!q.authorityOwner)).toBe(true);
    for (const source of result.sources) expect(source.sha256).toBe(createHash("sha256").update(readFileSync(join(fixture,source.path),"utf8")).digest("hex"));
    expect(result.consumers.find((c:{kind:string})=>c.kind==="screen")!.route).toBe("/");
  });
  it("captures all three document search screens and contextual upload/review entry points", () => {
    const result = inventorySource(fixture);
    for (const path of ["src/features/dms/documents/dms-documents-table.tsx", "src/features/dms/browser/dms-browser-page-client.tsx", "src/features/hr/document-browser/hr-doc-browser-page-client.tsx", "src/features/hr/employees/subject-photo.tsx", "src/features/dms/upload/dms-upload-inbox-page-client.tsx"]) expect(result.consumers.some((c: { path: string }) => c.path === path), path).toBe(true);
    expect(result.consumers.some((c: { kind: string }) => c.kind === "review")).toBe(true);
    expect(result.fields.some((f: { entity: string }) => f.entity === "company")).toBe(true);
  });
});
