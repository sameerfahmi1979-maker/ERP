import {expect,it} from "vitest";
import config from "../../../next.config";
import {readdirSync} from "node:fs";
import {APPLICATION_ROUTE_PATTERNS} from "@/lib/observability/route-patterns";
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
