// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import type {AuthContext} from "@/lib/rbac/check";
import {useLayoutEffect,type ReactNode} from "react";
import {RecordReadActivity} from "@/hooks/use-record-read-active";
const s=vi.hoisted(()=>({fetch:vi.fn(),link:vi.fn(),unlink:vi.fn(),push:vi.fn(),toast:vi.fn(),legacy:vi.fn(),child:null as null|{onOpenChange:(v:boolean)=>void;onSubmit:()=>void;submitDisabled?:boolean}}));
vi.mock("next/navigation",()=>({useRouter:()=>({push:s.push})}));
vi.mock("sonner",()=>({toast:{success:s.toast,error:s.toast}}));
vi.mock("@/server/actions/dms/entity-documents",()=>({linkDmsDocumentToEntity:(...a:unknown[])=>s.link(...a),unlinkDmsDocumentFromEntity:(...a:unknown[])=>s.unlink(...a),getDmsDocumentsByEntity:s.legacy,getAvailableDmsDocumentsForLink:s.legacy,getDmsEntityDocumentComplianceSummary:s.legacy}));
vi.mock("@/components/erp/erp-child-dialog-form",()=>({ERPChildDialogForm:(p:{open:boolean;onOpenChange:(v:boolean)=>void;onSubmit:()=>void;children:ReactNode;submitDisabled?:boolean;isSubmitting?:boolean;submitLabel:string})=>{s.child=p;return p.open?<section role="dialog" aria-label="Attach Existing Document"><button onClick={()=>p.onOpenChange(false)}>Close attach</button>{p.children}<button disabled={p.submitDisabled||p.isSubmitting} onClick={p.onSubmit}>{p.submitLabel}</button></section>:null;}}));
import {DmsEntityDocumentsTab} from "@/features/dms/entity-documents/dms-entity-documents-tab";
import {DmsEntityDocumentComplianceCards} from "@/features/dms/entity-documents/dms-entity-document-compliance-cards";
import {entityDocumentsCriteriaSchema,type EntityDocumentsCriteria} from "@/lib/reads/dms-entity-documents-schema";
import {entityDocumentsPrefix,useDmsEntityDocuments} from "@/hooks/use-dms-entity-documents";
const auth={profile:{id:1,auth_user_id:"synthetic",must_change_password:false},isAccountActive:true,accountStatus:"active",permissionCodes:["dms.documents.view"],roleCodes:[],roleAssignments:[]} as unknown as AuthContext;
const row=(id:number,title=`Linked ${id}`)=>({link_id:id,link_is_primary:false,link_role:null,linked_at:"2026-01-01",document_id:id,document_no:`DOC-${id}`,legacy_document_code:null,title,description:null,status:"active",confidentiality_level:"internal",issue_date:null,expiry_date:null,migrated_from_table:null,document_type_name:null,document_type_code:null,has_files:false,files_count:0,ai_summary:null,ai_risk_level:null,ai_risk_score:null,completeness_score:null,created_at:"2026-01-01",updated_at:"2026-01-01"});
const option=(id:number,title=`Choice ${id}`)=>({id,document_no:`DOC-${id}`,title,document_type_name:null,document_type_code:null,status:"active",issue_date:null,expiry_date:null,has_extraction:null,has_ocr:null,extracted_person_name:null});
const summary={totalDocuments:1,expiredDocuments:0,expiringSoonDocuments:0,missingRequiredDocuments:null,openComplianceFindings:null,highRiskDocuments:0,criticalRiskDocuments:0,latestExpiryDate:null,scope:"visible_documents"};
function result(input:unknown,extra:Record<string,unknown>={},status=200){
  const criteria=entityDocumentsCriteriaSchema.parse(input),base={criteria,asOf:new Date().toISOString(),availability:"available"};
  const data=criteria.operation==="summary"?{...base,summary,...extra}:criteria.operation==="selected"?{...base,rows:criteria.documentIds.map(n=>option(n)),...extra}:{...base,totalCount:1,rows:criteria.operation==="list"?[row(1)]:[option(9)],...extra};
  return new Response(JSON.stringify({success:true,data}),{status,headers:{"content-type":"application/json"}});
}
function unavailable(p:EntityDocumentsCriteria){return new Response(JSON.stringify({success:true,data:{criteria:p,asOf:new Date().toISOString(),availability:"unavailable"}}),{status:200});}
const clients:QueryClient[]=[];
function mount(ctx=auth,entityId=1,cards=false){
  const client=new QueryClient({defaultOptions:{queries:{retry:false,retryDelay:0}}});clients.push(client);const child=vi.fn();
  const ui=(a:AuthContext,id:number,active=true)=><QueryClientProvider client={client}><RecordReadActivity active={active}><DmsEntityDocumentsTab authContext={a} entityType="employee" entityId={id} canUpload canLinkExisting canUnlink showComplianceCards={cards} onChildOpen={child}/></RecordReadActivity></QueryClientProvider>;
  const view=render(ui(ctx,entityId));return {...view,client,child,replace:(a:AuthContext,id=entityId)=>view.rerender(ui(a,id)),pause:()=>view.rerender(ui(ctx,entityId,false)),resume:()=>view.rerender(ui(ctx,entityId,true))};
}
const calls=(operation:string)=>s.fetch.mock.calls.filter(c=>(c[0] as EntityDocumentsCriteria).operation===operation);
beforeEach(()=>{s.fetch.mockImplementation((p:EntityDocumentsCriteria)=>Promise.resolve(result(p)));s.link.mockResolvedValue({success:true,data:{id:1}});s.unlink.mockResolvedValue({success:true});s.legacy.mockRejectedValue(Error("Legacy reads forbidden"));vi.stubGlobal("fetch",(url:string,options:RequestInit)=>s.fetch(JSON.parse(typeof options.body==="string"?options.body:new URL(url,"http://localhost").searchParams.get("params")!),options,url));vi.stubGlobal("confirm",()=>true);});
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear());vi.unstubAllGlobals();vi.clearAllMocks();s.fetch.mockReset();s.link.mockReset();s.unlink.mockReset();s.child=null;});
async function open(){await screen.findByText("Linked 1");fireEvent.click(screen.getByRole("button",{name:"Attach Existing"}));await screen.findByRole("button",{name:/Choice 9/});}
async function select(){await open();fireEvent.click(screen.getByRole("button",{name:/Choice 9/}));await waitFor(()=>expect((screen.getByRole("button",{name:"Link Document"}) as HTMLButtonElement).disabled).toBe(false));}
it("inactive retained record sections hide attach portals and fence retained submissions",async()=>{
 const view=mount();await select();const old=s.child!.onSubmit;const before=s.fetch.mock.calls.length;
 view.pause();expect(screen.queryByRole("dialog")).toBeNull();await act(async()=>{await old();});expect(s.link).not.toHaveBeenCalled();
 await new Promise(r=>setTimeout(r,30));expect(s.fetch.mock.calls).toHaveLength(before);expect(view.child).toHaveBeenLastCalledWith(false);
 view.resume();await screen.findByRole("dialog");await waitFor(()=>expect(s.fetch.mock.calls.length).toBeGreaterThan(before));
});
it("actual tab loads only its current parent page, lazily reads attach and independently admits selected IDs",async()=>{
  mount();await screen.findByText("Linked 1");expect(calls("list")).toHaveLength(1);expect(calls("attach")).toHaveLength(0);expect(calls("selected")).toHaveLength(0);expect(s.legacy).not.toHaveBeenCalled();await select();expect(calls("selected")[0][0]).toMatchObject({documentIds:[9],entityId:1});
  for(const [,opts,url] of s.fetch.mock.calls){expect(opts).toMatchObject({method:"POST",cache:"no-store",credentials:"same-origin"});expect(opts.signal).toBeInstanceOf(AbortSignal);expect(url).toBe("/api/reads/dms-entity-documents");}
});
it("private attach search and parent criteria stay in POST body, never access-log URLs",async()=>{
  mount();await open();const search="Synthetic Person 42";fireEvent.change(screen.getByRole("textbox"),{target:{value:search}});
  await waitFor(()=>expect(calls("attach").at(-1)?.[0]).toMatchObject({search}));
  const [criteria,options,url]=calls("attach").at(-1)!;
  expect(url).toBe("/api/reads/dms-entity-documents");expect(url).not.toContain(search);expect(url).not.toContain(encodeURIComponent(search));
  expect(options).toMatchObject({method:"POST",credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json","Content-Type":"application/json"}});
  expect(JSON.parse(options.body)).toEqual(criteria);expect(options.signal).toBeInstanceOf(AbortSignal);
});
it("list failure is not a false empty and retries at most once plus an explicit manual retry",async()=>{
  let fail=true;s.fetch.mockImplementation((p:EntityDocumentsCriteria)=>Promise.resolve(fail?new Response("PRIVATE",{status:503}):result(p)));mount();await screen.findByRole("button",{name:"Retry documents"});expect(calls("list")).toHaveLength(2);expect(screen.queryByText(/No visible documents/)).toBeNull();expect(screen.queryByText(/PRIVATE/)).toBeNull();fail=false;fireEvent.click(screen.getByRole("button",{name:"Retry documents"}));await screen.findByText("Linked 1");expect(calls("list")).toHaveLength(3);
});
it("attach failure is explicit without false-empty options",async()=>{
  s.fetch.mockImplementation((p:EntityDocumentsCriteria)=>Promise.resolve(p.operation==="attach"?new Response("private",{status:503}):result(p)));mount();await screen.findByText("Linked 1");fireEvent.click(screen.getByRole("button",{name:"Attach Existing"}));await screen.findByRole("button",{name:"Retry available documents"});expect(screen.queryByText(/All documents may already/)).toBeNull();expect(calls("attach")).toHaveLength(2);
});
it("exact list and attachment counts support late native pages without eager full results",async()=>{
  s.fetch.mockImplementation((p:EntityDocumentsCriteria)=>Promise.resolve(result(p,p.operation==="list"?{totalCount:26,rows:p.offset===0?Array.from({length:25},(_,i)=>row(i+1)):[row(26)]}:p.operation==="attach"?{totalCount:26,rows:p.offset===0?Array.from({length:25},(_,i)=>option(i+100)):[option(125)]}:{})));mount();await screen.findByText("26 visible linked documents");fireEvent.click(screen.getByRole("button",{name:"Next documents"}));await screen.findByText("Linked 26");expect(calls("list").at(-1)?.[0]).toMatchObject({offset:25,limit:25});fireEvent.click(screen.getByRole("button",{name:"Attach Existing"}));await screen.findByText("26 matching documents");fireEvent.click(screen.getByRole("button",{name:"Next choices"}));await screen.findByRole("button",{name:/Choice 125/});expect(calls("attach").at(-1)?.[0]).toMatchObject({offset:25,limit:25});
});
it("latest search owns choices; an aborted late search cannot resurrect private old rows",async()=>{
  let finish!:(v:Response)=>void,signal:AbortSignal|undefined;
  s.fetch.mockImplementation((p:EntityDocumentsCriteria,o:RequestInit)=>p.operation==="attach"&&p.search==="old"?new Promise(resolve=>{signal=o.signal as AbortSignal;finish=resolve;}):Promise.resolve(result(p,p.operation==="attach"&&p.search==="new"?{rows:[option(8,"Latest choice")]}:{})));
  mount();await open();fireEvent.change(screen.getByRole("textbox"),{target:{value:"old"}});await waitFor(()=>expect(finish).toBeTypeOf("function"));const old=calls("attach").at(-1)![0];fireEvent.change(screen.getByRole("textbox"),{target:{value:"new"}});await screen.findByRole("button",{name:/Latest choice/});expect(signal?.aborted).toBe(true);await act(async()=>finish(result(old,{rows:[option(7,"RETIRED_PRIVATE")]})));expect(screen.queryByText("RETIRED_PRIVATE")).toBeNull();
});
it.each([401,403])("same-principal %s retires all parent/child display and blocks mutation without retry",async status=>{
  const view=mount();await select();s.fetch.mockImplementation(()=>Promise.resolve(new Response("private",{status})));await act(async()=>{await view.client.invalidateQueries({queryKey:entityDocumentsPrefix(auth,"employee",1)});});await screen.findByText(/Access to this record/);expect(screen.queryByText("Linked 1")).toBeNull();expect(screen.queryByRole("dialog")).toBeNull();expect(s.link).not.toHaveBeenCalled();expect(view.child).toHaveBeenLastCalledWith(false);
});
it("parent disappearance is not empty and closes its child dialog",async()=>{
  const view=mount();await select();s.fetch.mockImplementation((p:EntityDocumentsCriteria)=>Promise.resolve(unavailable(p)));await act(async()=>{await view.client.invalidateQueries({queryKey:entityDocumentsPrefix(auth,"employee",1)});});await screen.findByText(/Access to this record/);expect(screen.queryByRole("dialog")).toBeNull();expect(screen.queryByText(/No visible documents/)).toBeNull();
});
it("child-only selected disappearance preserves the parent but clears selection permanently",async()=>{
  const view=mount();await select();let missing=true;s.fetch.mockImplementation((p:EntityDocumentsCriteria)=>Promise.resolve(p.operation==="selected"&&missing?unavailable(p):result(p)));await act(async()=>{await view.client.invalidateQueries({queryKey:[...entityDocumentsPrefix(auth,"employee",1),"selected"]});});await screen.findByText(/selected documents are no longer/);expect(screen.getByText("Linked 1")).toBeTruthy();expect(screen.getByRole("dialog")).toBeTruthy();expect((screen.getByRole("button",{name:"Link Document"}) as HTMLButtonElement).disabled).toBe(true);
  missing=false;await act(async()=>{await view.client.invalidateQueries({queryKey:[...entityDocumentsPrefix(auth,"employee",1),"selected"]});});expect(calls("selected")).toHaveLength(2);expect(s.link).not.toHaveBeenCalled();
});
it("parent revalidation immediately hides old child choices/admission and cancels its request",async()=>{
  let finish!:(v:Response)=>void;const view=mount();await select();s.fetch.mockImplementation((p:EntityDocumentsCriteria)=>p.operation==="list"?new Promise(resolve=>{finish=resolve;}):Promise.resolve(result(p)));
  act(()=>{void view.client.invalidateQueries({queryKey:[...entityDocumentsPrefix(auth,"employee",1),"list"]});});await waitFor(()=>expect(finish).toBeTypeOf("function"));
  expect(screen.queryByRole("button",{name:/Choice 9/})).toBeNull();expect((screen.getByRole("button",{name:"Link Document"}) as HTMLButtonElement).disabled).toBe(true);
  const p=calls("list").at(-1)![0];await act(async()=>finish(unavailable(p)));await screen.findByText(/Access to this record/);
});
it("selected detail loading/error blocks mutation and has its own retry",async()=>{
  let fail=true;s.fetch.mockImplementation((p:EntityDocumentsCriteria)=>Promise.resolve(p.operation==="selected"&&fail?new Response("private",{status:503}):result(p)));mount();await open();fireEvent.click(screen.getByRole("button",{name:/Choice 9/}));await screen.findByRole("button",{name:"Retry selection"});expect((screen.getByRole("button",{name:"Link Document"}) as HTMLButtonElement).disabled).toBe(true);fail=false;fireEvent.click(screen.getByRole("button",{name:"Retry selection"}));await waitFor(()=>expect((screen.getByRole("button",{name:"Link Document"}) as HTMLButtonElement).disabled).toBe(false));
});
it("account and parent switch remove cached private rows/dialogs and cancel in-flight reads",async()=>{
  const view=mount();await select();const prefix=entityDocumentsPrefix(auth,"employee",1);view.replace({...auth,profile:{...auth.profile!,id:2,auth_user_id:"new-identity"}},2);await screen.findByText("Linked 1");expect(screen.queryByRole("dialog")).toBeNull();expect(view.client.getQueryCache().findAll({queryKey:prefix})).toHaveLength(0);expect(calls("list").at(-1)?.[0]).toMatchObject({entityId:2});
});
it("assignment-only scope change retires the old read identity",async()=>{
  const view=mount();await select();view.replace({...auth,roleAssignments:[{roleId:7,roleCode:"DMS",ownerCompanyId:1,branchId:2,permissionCodes:["dms.documents.view"]}]});await screen.findByText("Linked 1");expect(screen.queryByRole("dialog")).toBeNull();expect(calls("list")).toHaveLength(2);
});
it("late link response cannot close or toast into another parent's new dialog",async()=>{
  let finish!:(v:unknown)=>void;s.link.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const view=mount();await select();fireEvent.click(screen.getByRole("button",{name:"Link Document"}));await waitFor(()=>expect(finish).toBeTypeOf("function"));view.replace(auth,2);await open();const count=view.child.mock.calls.length;await act(async()=>finish({success:true,data:{id:9}}));expect(screen.getByRole("dialog")).toBeTruthy();expect(view.child.mock.calls).toHaveLength(count);expect(s.toast).not.toHaveBeenCalled();
});
it("stale child close and submit callbacks cannot affect a reopened dialog",async()=>{
  mount();await select();const prior=s.child!;fireEvent.click(screen.getByRole("button",{name:"Close attach"}));fireEvent.click(screen.getByRole("button",{name:"Attach Existing"}));await screen.findByRole("button",{name:/Choice 9/});act(()=>{prior.onOpenChange(false);prior.onSubmit();});expect(screen.getByRole("dialog")).toBeTruthy();expect(s.link).not.toHaveBeenCalled();
});
it("duplicate submission is synchronously blocked and mutation signature remains unchanged",async()=>{
  let finish!:(v:unknown)=>void;s.link.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));mount();await select();const submit=s.child!.onSubmit;act(()=>{submit();submit();});expect(s.link).toHaveBeenCalledExactlyOnceWith(9,"employee",1);await act(async()=>finish({success:true,data:{id:9}}));expect(screen.queryByRole("dialog")).toBeNull();
});
it("response loss clears selection and requires checking links before another explicit attempt",async()=>{
  s.link.mockRejectedValue(Error("PRIVATE_UNCERTAIN_RESPONSE"));mount();await select();fireEvent.click(screen.getByRole("button",{name:"Link Document"}));await screen.findByText(/link result could not be confirmed/);expect(screen.queryByText(/PRIVATE_UNCERTAIN/)).toBeNull();expect(s.link).toHaveBeenCalledTimes(1);expect((screen.getByRole("button",{name:"Link Document"}) as HTMLButtonElement).disabled).toBe(true);
});
it("unlink mutation still receives exact original link/document/parent arguments",async()=>{mount();await screen.findByText("Linked 1");fireEvent.click(screen.getByRole("button",{name:"Unlink document"}));await waitFor(()=>expect(s.unlink).toHaveBeenCalledExactlyOnceWith(1,1,"employee",1));});
it("no-role/disabled principal reads no private sources and cannot open upload",async()=>{mount({...auth,permissionCodes:[]});await screen.findByText(/Access to this record/);expect(s.fetch).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Upload New"}));expect(s.push).not.toHaveBeenCalled();});
it("existing upload and open-in-DMS navigation is retained for admitted parent",async()=>{mount();await screen.findByText("Linked 1");fireEvent.click(screen.getByRole("button",{name:"Upload New"}));expect(s.push).toHaveBeenLastCalledWith("/dms/inbox?entityType=employee&entityId=1");fireEvent.click(screen.getByRole("button",{name:"Open in DMS"}));expect(s.push).toHaveBeenLastCalledWith("/dms/documents/record/1");});
it("malformed/wrong-parent response is failure rather than accepted private content",async()=>{
  s.fetch.mockImplementation((p:EntityDocumentsCriteria)=>Promise.resolve(result({...p,entityId:99})));mount();await screen.findByRole("button",{name:"Retry documents"});expect(screen.queryByText("Linked 1")).toBeNull();
});
it("compliance cards label visible-only values and restricted metrics without fabricated zeros",async()=>{mount(auth,1,true);await screen.findByRole("region",{name:"Linked document compliance"});expect(screen.getAllByText("Restricted")).toHaveLength(2);expect(screen.getByText(/Counts cover documents visible/)).toBeTruthy();});
it("compliance failure is explicit and has independent manual retry",async()=>{
  let fail=true;s.fetch.mockImplementation((p:EntityDocumentsCriteria)=>Promise.resolve(p.operation==="summary"&&fail?new Response("private",{status:503}):result(p)));mount(auth,1,true);await screen.findByRole("button",{name:"Retry document compliance"});expect(screen.queryByText("Total Documents")).toBeNull();expect(screen.getByText("Linked 1")).toBeTruthy();fail=false;fireEvent.click(screen.getByRole("button",{name:"Retry document compliance"}));await screen.findByText("Total Documents");
});
it("standalone compliance component also requires authoritative context and hides on identity loss",async()=>{
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);const ui=(ctx:AuthContext)=><QueryClientProvider client={client}><DmsEntityDocumentComplianceCards authContext={ctx} entityType="employee" entityId={1}/></QueryClientProvider>;const view=render(ui(auth));await screen.findByText("Total Documents");view.rerender(ui({...auth,isAccountActive:false}));await screen.findByText("Document compliance information is unavailable.");expect(screen.queryByText("Total Documents")).toBeNull();
});
it.each(["identity","enabled"])("retained hook retry after %s A→B→A never re-admits the old same-key callback",async mode=>{
  const client=new QueryClient({defaultOptions:{queries:{retry:false,retryDelay:0}}});clients.push(client);let latest!:ReturnType<typeof useDmsEntityDocuments<"list">>;
  function Harness({ctx,enabled}:{ctx:AuthContext;enabled:boolean}){latest=useDmsEntityDocuments(ctx,{operation:"list",entityType:"employee",entityId:1,offset:0,limit:25},{enabled});return <span>{latest.data?.availability==="available"?"Hook ready":"Hook waiting"}</span>;}
  const ui=(ctx:AuthContext,enabled=true)=><QueryClientProvider client={client}><Harness ctx={ctx} enabled={enabled}/></QueryClientProvider>;
  const view=render(ui(auth));await screen.findByText("Hook ready");const first=latest;
  view.rerender(mode==="identity"?ui({...auth,profile:{...auth.profile!,id:2}}):ui(auth,false));await waitFor(()=>expect(first.isCurrent()).toBe(false));
  view.rerender(ui(auth));await screen.findByText("Hook ready");const count=calls("list").length;act(()=>first.retry());await act(async()=>Promise.resolve());expect(calls("list")).toHaveLength(count);expect(first.isCurrent()).toBe(false);
});
it("layout-time unmount retires retained actual-dialog submission before new-owner layout callbacks",async()=>{
  const client=new QueryClient({defaultOptions:{queries:{retry:false,retryDelay:0}}});clients.push(client);
  function CommitProbe({run}:{run:boolean}){useLayoutEffect(()=>{if(run)retained?.();},[run]);return null;}
  const ui=(id:number,probe=false)=><QueryClientProvider client={client}><DmsEntityDocumentsTab authContext={auth} entityType="employee" entityId={id} canLinkExisting showComplianceCards={false}/><CommitProbe run={probe}/></QueryClientProvider>;
  const view=render(ui(1));await select();const retained=s.child!.onSubmit;view.rerender(ui(2,true));await screen.findByText("Linked 1");expect(s.link).not.toHaveBeenCalled();
});
