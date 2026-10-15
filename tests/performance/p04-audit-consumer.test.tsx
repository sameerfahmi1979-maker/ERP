// @vitest-environment jsdom
import React from "react";
import "../remediation/f05/setup";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {act,cleanup,render,screen,fireEvent,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {syntheticAuthContext} from "./fixtures/auth-context";
import {auditCriteriaSchema} from "@/lib/reads/audit-schema";
import type {AuditLog} from "@/types/domain";
import type {ERPTableServerRead} from "@/components/erp/table/erp-table-types";
const table=vi.hoisted(()=>({read:null as ERPTableServerRead<AuditLog>|null}));
vi.mock("@/features/audit/audit-logs-table",()=>({AuditLogsTable:({data,serverRead,renderDetails}:{data:AuditLog[];serverRead:ERPTableServerRead<AuditLog>;renderDetails:(r:AuditLog)=>React.ReactNode})=>{
 table.read=serverRead;return <div><input aria-label="Search" value={serverRead.globalFilter} onChange={e=>serverRead.onGlobalFilterChange(e.target.value)}/><button onClick={()=>serverRead.onSortingChange([{id:"actor",desc:false}])}>Sort actor</button>{data.map(r=><div key={r.id}>{r.entity_reference}{renderDetails(r)}</div>)}</div>;
}}));
import {AuditPageClient} from "@/features/audit/audit-page-client";
const auth=syntheticAuthContext(["audit.view"]),row=(id:number)=>({id,created_at:"2026-10-15T00:00:00Z",action:"TEST",module_code:"PERF",entity_name:"synthetic",entity_id:1,entity_reference:`Synthetic ${id}`,actor_user_profile_id:1});
let client:QueryClient,calls:Record<string,unknown>[],signals:AbortSignal[],total:number;
beforeEach(()=>{client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});calls=[];signals=[];total=1;table.read=null;
 vi.stubGlobal("fetch",vi.fn(async(_url,init)=>{const input=JSON.parse(init.body);calls.push(input);signals.push(init.signal);const criteria=auditCriteriaSchema.parse(input),from=(criteria.page-1)*criteria.pageSize;return Response.json({success:true,data:{criteria,rows:Array.from({length:Math.min(criteria.pageSize,Math.max(0,total-from))},(_,i)=>row(from+i+1)),totalCount:total}});}));
});
afterEach(()=>{cleanup();client.clear();vi.unstubAllGlobals();});
function wrap(context=auth,filters={}){return <QueryClientProvider client={client}><AuditPageClient authContext={context} filters={filters}/></QueryClientProvider>;}
it("loads metadata once, debounces rapid search, retires old output immediately",async()=>{
 render(wrap());await screen.findByText("Synthetic 1");const old=table.read!.loadExportData!;
 fireEvent.change(screen.getByLabelText("Search"),{target:{value:"a"}});fireEvent.change(screen.getByLabelText("Search"),{target:{value:"abc"}});
 expect(screen.queryByText("Synthetic 1")).toBeNull();await expect(old()).rejects.toThrow();expect(calls).toHaveLength(1);
 await waitFor(()=>expect(calls).toHaveLength(2));expect(calls[1].search).toBe("abc");
});
it("exports all 1107 matching records, not the visible 50",async()=>{
 total=1107;render(wrap());await screen.findByText("Synthetic 1");let rows:AuditLog[]=[];await act(async()=>{rows=await table.read!.loadExportData!();});
 expect(rows).toHaveLength(1107);expect(rows.at(-1)?.id).toBe(1107);expect(calls.filter(c=>c.pageSize===200)).toHaveLength(6);expect(JSON.stringify(rows)).not.toContain("old_values\":{");
});
it("rejects count drift rather than publish a partial export",async()=>{
 total=1107;render(wrap());await screen.findByText("Synthetic 1");const original=globalThis.fetch;
 vi.stubGlobal("fetch",vi.fn(async(...args:Parameters<typeof fetch>)=>{if(calls.length>=2)total=1108;return original(...args);}));
 await expect(table.read!.loadExportData!()).rejects.toThrow();
});
it("rejects retained export after unmount or principal replacement",async()=>{
 const view=render(wrap());await screen.findByText("Synthetic 1");const old=table.read!.loadExportData!;view.rerender(wrap(syntheticAuthContext([])));
 await screen.findByRole("alert");await expect(old()).rejects.toThrow();expect(screen.queryByText("Synthetic 1")).toBeNull();expect(calls).toHaveLength(1);view.unmount();await expect(old()).rejects.toThrow();
});
it("cancels an in-flight export after filters change and never returns old rows",async()=>{
 const view=render(wrap());await screen.findByText("Synthetic 1");vi.stubGlobal("fetch",vi.fn((_url,init)=>new Promise((_resolve,reject)=>{signals.push(init.signal);init.signal.addEventListener("abort",()=>reject(new DOMException("Aborted","AbortError")));})));
 const output=table.read!.loadExportData!();const exportSignal=signals.at(-1)!;const result=expect(output).rejects.toThrow();view.rerender(wrap(auth,{module:"HR"}));await result;expect(exportSignal.aborted).toBe(true);
});
it("does not prefetch detail and rejects a mismatching detail identity",async()=>{
 render(wrap());await screen.findByText("Synthetic 1");expect(calls).toHaveLength(1);
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({success:true,data:{...row(999),old_values:null,new_values:{name:"Wrong subject"}}})));
 fireEvent.click(screen.getByRole("button",{name:"Details"}));await screen.findByRole("alert",{},{timeout:5000});expect(document.body.textContent).not.toContain("Wrong subject");
});
it("maps the actor column to an allowlisted native sort",async()=>{
 render(wrap());await screen.findByText("Synthetic 1");fireEvent.click(screen.getByRole("button",{name:"Sort actor"}));await waitFor(()=>expect(calls).toHaveLength(2));expect(calls[1]).toMatchObject({sort:"actor_user_profile_id",direction:"asc"});
});
it("a terminal denied refresh hides metadata and cannot export cached rows",async()=>{
 render(wrap());await screen.findByText("Synthetic 1");const old=table.read!.loadExportData!;vi.stubGlobal("fetch",vi.fn(async()=>Response.json({success:false,error:"Permission denied"},{status:403})));
 await act(async()=>{await client.invalidateQueries();});await screen.findByRole("alert");expect(screen.queryByText("Synthetic 1")).toBeNull();await expect(old()).rejects.toThrow();
});
