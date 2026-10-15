// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {FluentProvider,webLightTheme} from "@fluentui/react-components";
import {WorkspaceUiMemoryProvider,usePersistentUiState} from "@/hooks/use-persistent-ui-state";
import {ReadError} from "@/lib/reads/client";
const mocks=vi.hoisted(()=>({read:vi.fn(),cancel:vi.fn(),renewals:vi.fn(),override:vi.fn()}));
vi.mock("@/lib/reads/client",async importOriginal=>({...await importOriginal<typeof import("@/lib/reads/client")>(),readJson:(resource:string,params:unknown,signal:AbortSignal)=>resource==="dms-expiry-page"?mocks.read(params,signal):mocks.renewals(params,signal)}));
vi.mock("@/features/dms/expiry/dms-expiry-outputs",()=>({DmsExpiryOutputs:({ready}:{ready:boolean})=><button disabled={!ready}>Complete output</button>}));
vi.mock("@/server/actions/dms/expiry-reminders",()=>({getDmsExpiringDocuments:mocks.read,generateDmsExpiryRemindersForDocument:vi.fn(),setDmsExpiryTrackingOverride:mocks.override}));
vi.mock("@/server/actions/dms/renewals",()=>({getDmsRenewalRequests:mocks.renewals,cancelDmsRenewalRequest:mocks.cancel}));
vi.mock("@/features/dms/renewals/dms-complete-renewal-dialog",()=>({DmsCompleteRenewalDialog:function Dialog({open}:{open:boolean}){const [draft,setDraft]=React.useState("");return open?<div>Complete renewal dialog<input aria-label="Synthetic completion draft" value={draft} onChange={event=>setDraft(event.target.value)}/></div>:null;}}));
vi.mock("@/components/erp/erp-child-dialog-form",()=>({ERPChildDialogForm:({open,children,onSubmit,isDirty}:{open:boolean;children:React.ReactNode;onSubmit:()=>void;isDirty?:boolean})=>open?<div role="dialog" data-dirty={isDirty}>{children}<button onClick={onSubmit}>Confirm synthetic action</button></div>:null}));
import {DmsExpiringDocumentsTable} from "@/features/dms/expiry/dms-expiring-documents-table";
import {DmsRenewalRequestsTable} from "@/features/dms/renewals/dms-renewal-requests-table";
const expiry={id:1,document_no:"SYNTH-1",title:"Synthetic expiry",expiry_date:"2026-01-01",issue_date:null,status:"active",confidentiality:"company",days_remaining:-20,document_type:"Synthetic type",category:"Test",is_renewable:true,owner:null,latest_reminder_status:null,expiry_tracking_override:null,expiry_override_reason:null};
const renewal={id:1,renewal_no:"SYNTH-RENEW",document_id:1,status:"requested",priority:"normal",created_at:"2026-01-01",document:{id:1,document_no:"SYNTH-1",title:"Synthetic expiry",expiry_date:"2026-01-01",document_type_id:1}};
function client(){return new QueryClient({defaultOptions:{queries:{retry:false,retryDelay:0},mutations:{retry:false}}});}
function wrap(cache:QueryClient,children:React.ReactNode){return <FluentProvider theme={webLightTheme}><WorkspaceUiMemoryProvider><QueryClientProvider client={cache}>{children}</QueryClientProvider></WorkspaceUiMemoryProvider></FluentProvider>;}
const renewalPage=(rows=[renewal],page=1,totalCount=rows.length)=>({success:true,data:{rows,page,pageSize:25,totalCount}});
const expiryPage=(rows=[expiry],page=1,totalCount=rows.length)=>({success:true,data:{rows,page,pageSize:25,totalCount}});
beforeEach(()=>{mocks.read.mockResolvedValue(expiryPage([]));mocks.renewals.mockResolvedValue(renewalPage());mocks.cancel.mockResolvedValue({success:true});mocks.override.mockResolvedValue({success:true});});
afterEach(()=>{cleanup();vi.resetAllMocks();});
it("expiry search and filter tools remain available on initial loading and genuine zero",async()=>{
 let resolve!:(v:unknown)=>void;mocks.read.mockReturnValue(new Promise(r=>{resolve=r;}));render(wrap(client(),<DmsExpiringDocumentsTable view="expired"/>));
 expect(screen.getByPlaceholderText("Search documents…")).toBeTruthy();expect(screen.getByRole("button",{name:/Edit filters/i})).toBeTruthy();
 await act(async()=>resolve(expiryPage([])));await screen.findByText("No expired documents");expect(screen.getByRole("button",{name:/Edit filters/i})).toBeTruthy();
});
it("changing criteria to an empty result keeps recovery controls and retires prior rows",async()=>{
 mocks.read.mockResolvedValueOnce(expiryPage()).mockResolvedValue(expiryPage([]));const cache=client();
 const view=render(wrap(cache,<DmsExpiringDocumentsTable view="expired"/>));await screen.findByText("Synthetic expiry");
 view.rerender(wrap(cache,<DmsExpiringDocumentsTable view="expired" advancedFilter={{status:"inactive"}}/>));await screen.findByText("No expired documents");
 expect(screen.getByPlaceholderText("Search documents…")).toBeTruthy();expect(screen.queryByText("Synthetic expiry")).toBeNull();
});
it("read failure masks previous rows, exports and actions while leaving recovery controls",async()=>{
 mocks.read.mockResolvedValueOnce(expiryPage()).mockRejectedValue(new ReadError("Denied",403));const cache=client();
 render(wrap(cache,<DmsExpiringDocumentsTable view="expired" canManage onStartRenewal={()=>{}}/>));await screen.findByText("Synthetic expiry");
 await act(async()=>{await cache.invalidateQueries();});await screen.findByRole("alert");expect(screen.queryByText("Synthetic expiry")).toBeNull();expect(screen.queryByRole("button",{name:"Renew"})).toBeNull();expect((screen.getByRole("button",{name:"Complete output"}) as HTMLButtonElement).disabled).toBe(true);
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

it("expiry search resets a later page and retires a pending renewal draft",async()=>{
 mocks.read.mockImplementation(async p=>expiryPage([{...expiry,id:p.page,title:`EXPIRY-PAGE-${p.page}`}],p.page,60));
 render(wrap(client(),<DmsExpiringDocumentsTable view="expired" canRenew/>));await screen.findByText("EXPIRY-PAGE-1");
 fireEvent.click(screen.getByRole("button",{name:"Next page"}));await screen.findByText("EXPIRY-PAGE-2");fireEvent.click(screen.getByRole("button",{name:"Renew"}));
 fireEvent.change(screen.getByPlaceholderText("Search documents…"),{target:{value:"outside page one"}});
 expect(screen.queryByText("EXPIRY-PAGE-2")).toBeNull();expect(screen.queryByPlaceholderText("Additional context for this renewal request…")).toBeNull();
 await screen.findByText("EXPIRY-PAGE-1");expect(mocks.read).toHaveBeenLastCalledWith(expect.objectContaining({page:1,search:"outside page one"}),expect.any(AbortSignal));
});
it("expiry count shrink clamps to the last valid page",async()=>{
 mocks.read.mockResolvedValueOnce(expiryPage([expiry],1,60)).mockImplementation(async p=>expiryPage(p.page===1?[expiry]:[],p.page,1));
 render(wrap(client(),<DmsExpiringDocumentsTable view="expired"/>));await screen.findByText("60 documents");fireEvent.click(screen.getByRole("button",{name:"Last page"}));
 await screen.findByText("1 document");expect(mocks.read).toHaveBeenLastCalledWith(expect.objectContaining({page:1}),expect.any(AbortSignal));
});
it("expiry ignore preserves draft through verification then refreshes the paged family once",async()=>{
 mocks.read.mockResolvedValue(expiryPage());const cache=client();render(wrap(cache,<DmsExpiringDocumentsTable view="expired" canManage/>));await screen.findByText("Synthetic expiry");
 fireEvent.click(screen.getByRole("button",{name:"Ignore"}));const placeholder="e.g. Document kept for reference only, no renewal required…";
 fireEvent.change(screen.getByPlaceholderText(placeholder),{target:{value:"Keep this reason"}});
 let resolve!:(v:unknown)=>void;mocks.read.mockReturnValueOnce(new Promise(r=>{resolve=r;}));await act(async()=>{void cache.invalidateQueries();});
 await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());await act(async()=>resolve(expiryPage()));
 expect((await screen.findByPlaceholderText(placeholder) as HTMLTextAreaElement).value).toBe("Keep this reason");
 expect(screen.getByRole("dialog").getAttribute("data-dirty")).toBe("true");
 mocks.read.mockResolvedValue(expiryPage([]));fireEvent.click(screen.getByRole("button",{name:"Confirm synthetic action"}));await screen.findByText("No expired documents");
 expect(mocks.override).toHaveBeenCalledExactlyOnceWith({documentId:1,override:"ignored",reason:"Keep this reason"});
});
it("expiry renewed draft survives same-criteria reads but not revoked capability",async()=>{
 mocks.read.mockResolvedValue(expiryPage());const cache=client(),view=render(wrap(cache,<DmsExpiringDocumentsTable view="expired" canRenew/>));await screen.findByText("Synthetic expiry");
 const placeholder="Additional context for this renewal request…";
 fireEvent.click(screen.getByRole("button",{name:"Renew"}));fireEvent.change(screen.getByPlaceholderText(placeholder),{target:{value:"Keep draft"}});
 let resolve!:(v:unknown)=>void;mocks.read.mockReturnValueOnce(new Promise(r=>{resolve=r;}));await act(async()=>{void cache.invalidateQueries();});await waitFor(()=>expect(screen.queryByPlaceholderText(placeholder)).toBeNull());
 await act(async()=>resolve(expiryPage()));expect((await screen.findByPlaceholderText(placeholder) as HTMLInputElement).value).toBe("Keep draft");
 expect(screen.getByRole("dialog").getAttribute("data-dirty")).toBe("true");
 view.rerender(wrap(cache,<DmsExpiringDocumentsTable view="expired" canRenew={false}/>));expect(screen.queryByPlaceholderText(placeholder)).toBeNull();
});
it("expiry account retirement aborts the prior read and ignores its late result",async()=>{
 let resolve!:(v:unknown)=>void;mocks.read.mockReturnValueOnce(new Promise(r=>{resolve=r;})).mockRejectedValue(new ReadError("Denied",403));
 const view=render(wrap(client(),<DmsExpiringDocumentsTable key="old" view="expired" canManage/>)),signal=mocks.read.mock.calls[0][1] as AbortSignal;
 view.rerender(wrap(client(),<DmsExpiringDocumentsTable key="new" view="expired"/>));await screen.findByRole("alert");expect(signal.aborted).toBe(true);
 await act(async()=>resolve(expiryPage()));expect(screen.queryByText("Synthetic expiry")).toBeNull();expect((screen.getByRole("button",{name:"Complete output"}) as HTMLButtonElement).disabled).toBe(true);
});
it("view-specific hidden filters do not silently remove records from another expiry tab",async()=>{
 function Seed(){usePersistentUiState("dms-list:DmsExpiringDocumentsTable:filters",{expiry_date:"2026-01-01",status:"active"});return null;}
 mocks.read.mockResolvedValue(expiryPage([]));render(wrap(client(),<><Seed/><DmsExpiringDocumentsTable view="ignored"/></>));await screen.findByText("No documents with expiry tracking ignored");
 expect(mocks.read).toHaveBeenLastCalledWith(expect.objectContaining({columnFilters:{status:"active"}}),expect.any(AbortSignal));
});
