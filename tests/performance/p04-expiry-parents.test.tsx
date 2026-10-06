// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {act,cleanup,render,screen} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
const state=vi.hoisted(()=>({allowed:new Set<string>(),stats:vi.fn()}));
vi.mock("@/lib/rbac/check",()=>({getAuthContext:async()=>({}),hasPermission:(_ctx:unknown,p:string)=>state.allowed.has(p)}));
vi.mock("next/navigation",()=>({redirect:()=>{throw Error("redirect");}}));
vi.mock("@/components/ui/tabs",()=>({Tabs:({children}:{children:React.ReactNode})=><>{children}</>,TabsList:({children}:{children:React.ReactNode})=><>{children}</>,TabsTrigger:({children}:{children:React.ReactNode})=><>{children}</>,TabsContent:({children}:{children:React.ReactNode})=><>{children}</>}));
vi.mock("@/features/dms/renewals/dms-renewal-requests-table",()=>({DmsRenewalRequestsTable:({canManage=false}:{canManage?:boolean})=><div data-testid="renewal-capability">{canManage?"manage":"read-only"}</div>}));
vi.mock("@/features/dms/renewals/dms-start-renewal-dialog",()=>({DmsStartRenewalDialog:()=>null}));
vi.mock("@/features/dms/expiry/dms-expiring-documents-table",()=>({DmsExpiringDocumentsTable:()=>null}));
vi.mock("@/features/dms/expiry/dms-expiry-email-dialog",()=>({DmsExpiryEmailDialog:()=>null}));
vi.mock("@/features/dms/expiry/dms-expiry-filter-bar",()=>({DmsExpiryFilterBar:()=>null}));
vi.mock("@/components/erp/export/erp-export-menu",()=>({ERPExportMenu:()=>null}));
vi.mock("@/server/actions/dms/dms-email-bridge",()=>({bridgeDueDmsNotificationsToGlobal:vi.fn(),processDmsExpiryEmailQueue:vi.fn()}));
vi.mock("@/server/actions/dms/notifications",()=>({generateDmsExpiryNotifications:vi.fn()}));
vi.mock("@/server/actions/dms/expiry-reminders",()=>({getDmsExpiryDashboardStats:state.stats,generateDmsExpiryRemindersBulk:vi.fn()}));
import ExpiryPage from "@/app/(protected)/dms/expiring/page";
import RenewalPage from "@/app/(protected)/dms/renewals/page";
import {DmsExpirySummaryCards} from "@/features/dms/expiry/dms-expiry-summary-cards";
function cache(){return new QueryClient({defaultOptions:{queries:{retry:false}}});}
beforeEach(()=>{state.allowed.clear();state.stats.mockResolvedValue({success:false,error:"Unavailable"});});
afterEach(()=>{cleanup();vi.clearAllMocks();});
it.each([false,true])("actual expiry page forwards renewal capability independently of expiry administration: %s",async manage=>{
 state.allowed.add("dms.expiry.manage");state.allowed.add("dms.expiry.view");if(manage)state.allowed.add("dms.renewals.manage");
 render(<QueryClientProvider client={cache()}>{await ExpiryPage()}</QueryClientProvider>);
 expect(screen.getByTestId("renewal-capability").textContent).toBe(manage?"manage":"read-only");
});
it.each([false,true])("actual renewal page forwards capability to all three tabs: %s",async manage=>{
 state.allowed.add("dms.renewals.view");if(manage)state.allowed.add("dms.renewals.manage");render(<QueryClientProvider client={cache()}>{await RenewalPage()}</QueryClientProvider>);
 expect(screen.getAllByTestId("renewal-capability").map(e=>e.textContent)).toEqual(Array(3).fill(manage?"manage":"read-only"));
});
it("both real pages retain their denied-route guard",async()=>{await expect(ExpiryPage()).rejects.toThrow("redirect");await expect(RenewalPage()).rejects.toThrow("redirect");});
it("summary refresh failure masks previously cached counts",async()=>{
 state.stats.mockResolvedValueOnce({success:true,data:{expired:87,expiring_7:0,expiring_30:0,expiring_60:0,expiring_90:0,missing_expiry:0,pending_reminders:0,dismissed_reminders:0,open_renewals:0,expiry_ignored:0}}).mockResolvedValue({success:false,error:"Unavailable"});
 const client=cache();render(<QueryClientProvider client={client}><DmsExpirySummaryCards/></QueryClientProvider>);await screen.findByText("87");await act(async()=>{await client.invalidateQueries();});
 await screen.findByRole("alert");expect(screen.queryByText("87")).toBeNull();expect(screen.queryByText("0")).toBeNull();
});
it("missing successful summary payload is not fabricated into ten zeroes",async()=>{
 state.stats.mockResolvedValue({success:true});render(<QueryClientProvider client={cache()}><DmsExpirySummaryCards/></QueryClientProvider>);await screen.findByRole("alert");expect(screen.queryByText("0")).toBeNull();
});
