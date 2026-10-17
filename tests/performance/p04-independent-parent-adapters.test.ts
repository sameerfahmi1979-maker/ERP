import {expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {ENTITY_DOCUMENT_PARENTS} from "@/server/reads/dms-entity-documents";
const generated=readFileSync("src/types/database.ts","utf8").replace(/\r\n/g,"\n");
it.each(Object.entries(ENTITY_DOCUMENT_PARENTS))("%s uses only existing parent admission columns",(_type,parent)=>{
 const start=generated.indexOf(`      ${parent.table}: {\n        Row: {`);expect(start).toBeGreaterThan(0);const row=generated.slice(start,generated.indexOf("        Insert:",start));
 expect(row).toMatch(/^          id:/m);if(parent.soft)expect(row).toMatch(/^          deleted_at:/m);
});
it.each([
 "src/features/branches/branch-workspace-form.tsx",
 "src/features/common-master-data/work-sites/work-site-workspace-form.tsx",
 "src/features/organizations/organization-workspace-form.tsx",
 "src/features/hr/employees/employee-workspace-form.tsx",
])("%s forwards its existing caller context to the independent read adapter",file=>{
 const text=readFileSync(file,"utf8");const invocations=[...text.matchAll(/<DmsEntityDocumentsTab\b([^]*?)\/>/g)];
 expect(invocations.length).toBeGreaterThan(0);for(const call of invocations)expect(call[1]).toMatch(/authContext=\{authContext\}/);
});
