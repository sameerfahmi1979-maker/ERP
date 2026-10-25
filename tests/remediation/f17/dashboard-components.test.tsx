// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const m=vi.hoisted(()=>({read:vi.fn()}));
vi.mock("@/server/actions/dms/ai-observability",()=>({getDmsAiUsageSnapshot:m.read}));
import { useUsageSnapshot } from "@/features/dms/ai-observability/use-usage-snapshot";
import { DashboardSectionCard } from "@/features/ai/common/dashboard/dashboard-section-card";
import ApplicationError from "@/app/error";
import type { DashboardSection } from "@/lib/ai/common/dashboard/types";
beforeEach(()=>{vi.clearAllMocks();vi.spyOn(console,"error").mockImplementation(()=>{});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it("keeps an unavailable section distinct from empty and hides stale values",()=>{
 const section:DashboardSection={code:"risk",title:"Risk",kpis:[{label:"stale value",value:99}],alerts:[],hasPermission:true,isLoaded:false};
 const view=render(<DashboardSectionCard section={section}/>);
 expect(screen.getByRole("alert").textContent).toContain("unavailable");expect(screen.queryByText("99")).toBeNull();expect(screen.queryByText("No data available.")).toBeNull();
 view.rerender(<DashboardSectionCard section={{...section,isLoaded:true,kpis:[]}}/>);
 expect(screen.queryByRole("alert")).toBeNull();expect(screen.getByText("No data available.")).toBeTruthy();
});
it("shares one usage request across six independently rendered panels and discards old filter data",async()=>{
 m.read.mockResolvedValue({success:true,data:{overview:{totalLogs:7},costs:[],providers:[],features:[],recent:[],errors:[]}});
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 function Panel({part,model}:{part:"overview"|"costs"|"providers"|"features"|"recent"|"errors";model:string}){const q=useUsageSnapshot(part,{modelId:model},0);return <span data-testid={part}>{q.isPending?"pending":JSON.stringify(q.data)}</span>;}
 const tree=(model:string)=><QueryClientProvider client={client}>{(["overview","costs","providers","features","recent","errors"]as const).map(part=><Panel key={part} part={part} model={model}/>)}</QueryClientProvider>;
 const view=render(tree("one"));await waitFor(()=>expect(screen.getByTestId("overview").textContent).toContain("7"));expect(m.read).toHaveBeenCalledTimes(1);
 let release!:(value:unknown)=>void;m.read.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));view.rerender(tree("two"));
 await waitFor(()=>expect(m.read).toHaveBeenCalledTimes(2));expect(screen.getByTestId("overview").textContent).toBe("pending");
 release({success:true,data:{overview:{totalLogs:0},costs:[],providers:[],features:[],recent:[],errors:[]}});await waitFor(()=>expect(screen.getByTestId("overview").textContent).toContain("0"));
 view.unmount();client.clear();expect(client.getQueryCache().getAll()).toHaveLength(0);
});
it("the runtime fallback retries rendering rather than submitting a save",async()=>{
 const retry=vi.fn();render(<ApplicationError error={Error("PRIVATE raw error")} retry={retry}/>);
 expect(screen.getByRole("alert").textContent).not.toContain("PRIVATE");
 expect(screen.getByText(/check its retained status/)).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"Try again"}));expect(retry).toHaveBeenCalledOnce();
});
