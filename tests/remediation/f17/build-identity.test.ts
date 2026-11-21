import {expect,it} from "vitest";
import config from "../../../next.config";
import {readdirSync} from "node:fs";
import {APPLICATION_ROUTE_PATTERNS} from "@/lib/observability/route-patterns";
import {diagnosticRoute} from "@/lib/observability/safe-diagnostic";
it("gives archive builds a stable public source identity and matching diagnostic header",async()=>{
 const id=await config.generateBuildId!();expect(id).toMatch(/^[a-f0-9]{64}$/);expect(await config.generateBuildId!()).toBe(id);
 expect(config.env?.NEXT_PUBLIC_ALGT_BUILD_COMMIT).toBe(id);
 const headers=await config.headers!();expect(headers[0].headers).toContainEqual({key:"X-ALGT-Build",value:id});
});
it("keeps safe diagnostic templates aligned with every actual route, including the root",()=>{
 const files:string[]=[];const walk=(dir:string)=>{for(const e of readdirSync(dir,{withFileTypes:true})){const p=dir+"/"+e.name;if(e.isDirectory())walk(p);else if(/\/(page|route)\.tsx?$/.test(p))files.push(p);}};walk("src/app");
 const actual=files.map(file=>"/"+file.replace(/^src\/app\//,"").replace(/(?:^|\/)(page|route)\.tsx?$/,"").split("/").filter(p=>!p.startsWith("(")&&!p.startsWith("@")).join("/"));
 expect([...APPLICATION_ROUTE_PATTERNS].sort()).toEqual([...new Set(actual)].sort());
});
it("keeps the T13 route names and masks case, asset and issue identifiers",()=>{
 expect(diagnosticRoute("/modules/fleet/fines?branch=920011")).toBe("/modules/fleet/fines");
 expect(diagnosticRoute("/admin/hr/operations/recoveries?case=998539")).toBe("/admin/hr/operations/recoveries");
 expect(diagnosticRoute("/modules/fleet/980101")).toBe("/modules/fleet/[id]");
 expect(diagnosticRoute("/print/fleet-trip-order/980101/997418")).toBe("/print/fleet-trip-order/[id]/[issue]");
});
