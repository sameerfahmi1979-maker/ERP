import {expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {HR_SEARCH_READ_SOURCES} from "@/server/reads/hr-search";
const generated=readFileSync("src/types/database.ts","utf8").replace(/\r\n/g,"\n");
function fields(table:string){const start=generated.indexOf(`      ${table}: {\n        Row: {`);expect(start,table+" exists").toBeGreaterThan(0);const body=generated.slice(start,generated.indexOf("        Insert:",start));return new Set([...body.matchAll(/^          ([a-z_]+):/gm)].map(m=>m[1]));}
it.each(HR_SEARCH_READ_SOURCES)("$key search criteria and projections use the independently generated schema",source=>{
  const native=fields(source.table);for(const column of [...source.columns,...source.search,...(source.status?[source.status]:[]),...(source.date?[source.date]:[]),...(source.employee?["employee_id"]:[])])expect(native.has(column),`${source.table}.${column}`).toBe(true);
  if(source.related){expect(native.has(source.related.fk)).toBe(true);expect(fields(source.related.table).has(source.related.column)).toBe(true);}
});
