// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {FluentProvider,webLightTheme} from "@fluentui/react-components";
import {WorkspaceUiMemoryProvider} from "@/hooks/use-persistent-ui-state";
import {ReadError} from "@/lib/reads/client";
const mocks=vi.hoisted(()=>({read:vi.fn(),cancel:vi.fn(),renewals:vi.fn()}));
vi.mock("@/lib/reads/client",async importOriginal=>({...await importOriginal<typeof import("@/lib/reads/client")>(),readJson:(resource:string,params:unknown,signal:AbortSignal)=>resource==="dms-expiring"?mocks.read(params,signal):mocks.renewals(params,signal)}));
vi.mock("@/server/actions/dms/expiry-reminders",()=>({getDmsExpiringDocuments:mocks.read,generateDmsExpiryRemindersForDocument:vi.fn(),setDmsExpiryTrackingOverride:vi.fn()}));
vi.mock("@/server/actions/dms/renewals",()=>({getDmsRenewalRequests:mocks.renewals,cancelDmsRenewalRequest:mocks.cancel}));
vi.mock("@/features/dms/renewals/dms-complete-renewal-dialog",()=>({DmsCompleteRenewalDialog:function Dialog({open}:{open:boolean}){const [draft,setDraft]=React.useState("");return open?<div>Complete renewal dialog<input aria-label="Synthetic completion draft" value={draft} onChange={event=>setDraft(event.target.value)}/></div>:null;}}));
vi.mock("@/components/erp/erp-child-dialog-form",()=>({ERPChildDialogForm:()=>null}));
import {DmsExpiringDocumentsTable} from "@/features/dms/expiry/dms-expiring-documents-table";
import {DmsRenewalRequestsTable} from "@/features/dms/renewals/dms-renewal-requests-table";
const expiry={id:1,document_no:"SYNTH-1",title:"Synthetic expiry",expiry_date:"2026-01-01",issue_date:null,status:"active",confidentiality:"company",days_remaining:-20,document_type:"Synthetic type",category:"Test",is_renewable:true,owner:null,latest_reminder_status:null,expiry_tracking_override:null,expiry_override_reason:null};
const renewal={id:1,renewal_no:"SYNTH-RENEW",document_id:1,status:"requested",priority:"normal",created_at:"2026-01-01",document:{id:1,document_no:"SYNTH-1",title:"Synthetic expiry",expiry_date:"2026-01-01",document_type_id:1}};
function client(){return new QueryClient({defaultOptions:{queries:{retry:false,retryDelay:0},mutations:{retry:false}}});}
function wrap(cache:QueryClient,children:React.ReactNode){return <FluentProvider theme={webLightTheme}><WorkspaceUiMemoryProvider><QueryClientProvider client={cache}>{children}</QueryClientProvider></WorkspaceUiMemoryProvider></FluentProvider>;}
const renewalPage=(rows=[renewal],page=1,totalCount=rows.length)=>({success:true,data:{rows,page,pageSize:25,totalCount}});
beforeEach(()=>{mocks.read.mockResolvedValue({success:true,data:[]});mocks.renewals.mockResolvedValue(renewalPage());mocks.cancel.mockResolvedValue({success:true});});
afterEach(()=>{cleanup();vi.resetAllMocks();});
it("expiry search and filter tools remain available on initial loading and genuine zero",async()=>{
 let resolve!:(v:unknown)=>void;mocks.read.mockReturnValue(new Promise(r=>{resolve=r;}));render(wrap(client(),<DmsExpiringDocumentsTable view="expired"/>));
 expect(screen.getByPlaceholderText("Search documents…")).toBeTruthy();expect(screen.getByRole("button",{name:/Edit filters/i})).toBeTruthy();
 await act(async()=>resolve({success:true,data:[]}));await screen.findByText("No expired documents");expect(screen.getByRole("button",{name:/Edit filters/i})).toBeTruthy();
});
it("changing criteria to an empty result keeps recovery controls and clears exported rows",async()=>{
 mocks.read.mockResolvedValueOnce({success:true,data:[expiry]}).mockResolvedValue({success:true,data:[]});const rows=vi.fn(),cache=client();
 const view=render(wrap(cache,<DmsExpiringDocumentsTable view="expired" onRowsLoaded={rows}/>));await screen.findByText("Synthetic expiry");
 view.rerender(wrap(cache,<DmsExpiringDocumentsTable view="expired" advancedFilter={{status:"inactive"}} onRowsLoaded={rows}/>));await screen.findByText("No expired documents");
 expect(screen.getByPlaceholderText("Search documents…")).toBeTruthy();expect(rows).toHaveBeenLastCalledWith([]);
});
it("read failure masks previous rows, exports and actions while leaving recovery controls",async()=>{
 mocks.read.mockResolvedValueOnce({success:true,data:[expiry]}).mockResolvedValue({success:false,error:"Permission denied"});const cache=client(),rows=vi.fn();
 render(wrap(cache,<DmsExpiringDocumentsTable view="expired" canManage onRowsLoaded={rows} onStartRenewal={()=>{}}/>));await screen.findByText("Synthetic expiry");
 await act(async()=>{await cache.invalidateQueries();});await screen.findByRole("alert");expect(screen.queryByText("Synthetic expiry")).toBeNull();expect(screen.queryByRole("button",{name:"Renew"})).toBeNull();expect(rows).toHaveBeenLastCalledWith([]);
 expect(screen.getByPlaceholderText("Search documents…")).toBeTruthy();expect(screen.getByRole("button",{name:"Retry documents"})).toBeTruthy();
 expect(screen.getByText("Document count unavailable")).toBeTruthy();expect(screen.queryByText("0 documents")).toBeNull();
});
it("renewal table defaults to read-only",async()=>{
 render(wrap(client(),<DmsRenewalRequestsTable/>));await screen.findByText("SYNTH-RENEW");expect(screen.queryByRole("button",{name:"Complete"})).toBeNull();expect(screen.queryByRole("button",{name:"Cancel renewal"})).toBeNull();expect(mocks.cancel).not.toHaveBeenCalled();
});
it("explicit managers can open completion but lose the dialog when the capability is removed",async()=>{
 const cache=client(),view=render(wrap(cache,<DmsRenewalRequestsTable canManage/>));await screen.findByText("SYNTH-RENEW");fireEvent.click(screen.getByRole("button",{name:"Complete"}));expect(screen.getByText("Complete renewal dialog")).toBeTruthy();
 view.rerender(wrap(cache,<DmsRenewalRequestsTable canManage={false}/>));expect(screen.queryByText("Complete renewal dialog")).toBeNull();expect(screen.queryByRole("button",{name:"Complete"})).toBeNull();
});
it.each(["expiry","renewals"])("missing successful %s payload is an error, not empty",async which=>{
 mocks.read.mockResolvedValue({success:true});mocks.renewals.mockResolvedValue({success:true});render(wrap(client(),which==="expiry"?<DmsExpiringDocumentsTable view="expired"/>:<DmsRenewalRequestsTable/>));
 await screen.findByRole("alert");expect(screen.queryByText("No expired documents")).toBeNull();expect(screen.queryByText("No renewal requests found")).toBeNull();
});

it.each(["expiry","renewals"])("%s consumes the cancellation signal and aborts on unmount",async which=>{
 const read=which==="expiry"?mocks.read:mocks.renewals;read.mockReturnValue(new Promise(()=>{}));
 const view=render(wrap(client(),which==="expiry"?<DmsExpiringDocumentsTable view="expired"/>:<DmsRenewalRequestsTable/>));
 expect(read).toHaveBeenCalledOnce();const signal=read.mock.calls[0][1] as AbortSignal;expect(signal.aborted).toBe(false);view.unmount();expect(signal.aborted).toBe(true);
});

it.each(["expiry","renewals"])("%s does not retry access denial",async which=>{
 const read=which==="expiry"?mocks.read:mocks.renewals;read.mockRejectedValue(new ReadError("Denied",403));
 render(wrap(client(),which==="expiry"?<DmsExpiringDocumentsTable view="expired"/>:<DmsRenewalRequestsTable/>));
 await screen.findByRole("alert");expect(read).toHaveBeenCalledOnce();
});

it("renewal filters stay mounted through loading and failure, without false zero or stale actions",async()=>{
 let resolve!:(v:unknown)=>void;mocks.renewals.mockReturnValue(new Promise(r=>{resolve=r;}));const cache=client();
 render(wrap(cache,<DmsRenewalRequestsTable canManage/>));expect(screen.getByPlaceholderText("Search renewals…")).toBeTruthy();expect(screen.getByRole("button",{name:/Edit filters/i})).toBeTruthy();
 await act(async()=>resolve(renewalPage()));await screen.findByText("SYNTH-RENEW");fireEvent.click(screen.getByRole("button",{name:"Complete"}));
 mocks.renewals.mockRejectedValue(new ReadError("Denied",403));await act(async()=>{await cache.invalidateQueries();});await screen.findByRole("alert");
 expect(screen.queryByText("SYNTH-RENEW")).toBeNull();expect(screen.queryByText("Complete renewal dialog")).toBeNull();expect(screen.getByText("Renewal count unavailable")).toBeTruthy();expect(screen.queryByText("0 renewals")).toBeNull();
 expect(screen.getByPlaceholderText("Search renewals…")).toBeTruthy();expect(screen.getByRole("button",{name:/Edit filters/i})).toBeTruthy();
});

it("renewal search is server-wide, masks old actions immediately and resets a later page",async()=>{
 mocks.renewals.mockImplementation(async(params)=>renewalPage([{...renewal,id:params.page,renewal_no:`PAGE-${params.page}`}],params.page,60));
 const cache=client();render(wrap(cache,<DmsRenewalRequestsTable canManage/>));await screen.findByText("PAGE-1");
 fireEvent.click(screen.getByRole("button",{name:"Next page"}));await screen.findByText("PAGE-2");
 fireEvent.click(screen.getByRole("button",{name:"Complete"}));expect(screen.getByText("Complete renewal dialog")).toBeTruthy();
 fireEvent.change(screen.getByPlaceholderText("Search renewals…"),{target:{value:"outside first page"}});
 expect(screen.queryByText("PAGE-2")).toBeNull();expect(screen.queryByText("Complete renewal dialog")).toBeNull();
 await screen.findByText("PAGE-1");expect(mocks.renewals).toHaveBeenLastCalledWith(expect.objectContaining({page:1,pageSize:25,search:"outside first page"}),expect.any(AbortSignal));
});

it("a confirmed cancellation refreshes the paged renewal family",async()=>{
 const cache=client();render(wrap(cache,<DmsRenewalRequestsTable canManage/>));await screen.findByText("SYNTH-RENEW");
 mocks.renewals.mockResolvedValue(renewalPage([]));fireEvent.click(screen.getByRole("button",{name:"Cancel renewal"}));
 await screen.findByText("No renewal requests found");expect(mocks.cancel).toHaveBeenCalledOnce();expect(mocks.renewals).toHaveBeenCalledTimes(2);
});

it("an old account's late read cannot replace the next account's denied result",async()=>{
 let resolve!:(value:unknown)=>void;mocks.renewals.mockReturnValueOnce(new Promise(r=>{resolve=r;})).mockRejectedValue(new ReadError("Denied",403));
 const first=client(),second=client();const view=render(wrap(first,<DmsRenewalRequestsTable key="first-principal" canManage/>));
 const signal=mocks.renewals.mock.calls[0][1] as AbortSignal;
 view.rerender(wrap(second,<DmsRenewalRequestsTable key="next-principal"/>));await screen.findByRole("alert");expect(signal.aborted).toBe(true);
 await act(async()=>resolve(renewalPage()));expect(screen.queryByText("SYNTH-RENEW")).toBeNull();expect(screen.queryByRole("button",{name:"Complete"})).toBeNull();
});

it("a confirmed shrinking count returns an out-of-range view to the last valid page",async()=>{
 mocks.renewals.mockImplementation(async(params)=>params.page===1?renewalPage():renewalPage([],params.page,1));
 // First observation has three pages; after a concurrent change only one remains.
 mocks.renewals.mockResolvedValueOnce(renewalPage([renewal],1,60));
 render(wrap(client(),<DmsRenewalRequestsTable/>));await screen.findByText("60 renewals");fireEvent.click(screen.getByRole("button",{name:"Last page"}));
 await screen.findByText("1 renewal");expect(mocks.renewals).toHaveBeenLastCalledWith(expect.objectContaining({page:1}),expect.any(AbortSignal));
});

it("same-criteria verification hides actions but retains an unsaved completion draft",async()=>{
 const cache=client();render(wrap(cache,<DmsRenewalRequestsTable canManage/>));await screen.findByText("SYNTH-RENEW");
 fireEvent.click(screen.getByRole("button",{name:"Complete"}));fireEvent.change(screen.getByLabelText("Synthetic completion draft"),{target:{value:"Keep my entered notes"}});
 let resolve!:(value:unknown)=>void;mocks.renewals.mockReturnValue(new Promise(r=>{resolve=r;}));
 await act(async()=>{void cache.invalidateQueries();});await waitFor(()=>expect(screen.queryByText("Complete renewal dialog")).toBeNull());
 await act(async()=>resolve(renewalPage()));await screen.findByText("Complete renewal dialog");expect((screen.getByLabelText("Synthetic completion draft") as HTMLInputElement).value).toBe("Keep my entered notes");
});
