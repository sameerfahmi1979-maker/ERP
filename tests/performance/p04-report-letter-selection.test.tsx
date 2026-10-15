// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {syntheticAuthContext} from "./fixtures/auth-context";
import type {AuthContext} from "@/lib/rbac/check";
const m=vi.hoisted(()=>({run:vi.fn(),read:vi.fn(),brand:vi.fn(),visual:vi.fn(),pdf:vi.fn()}));
vi.mock("@/lib/reads/client",async()=>({...await vi.importActual("@/lib/reads/client"),readJson:m.read}));
vi.mock("@/server/actions/reports/runner",()=>({runReportAction:m.run}));
vi.mock("@/server/actions/reports/templates",()=>({resolveTemplatePreview:m.brand,renderVisualTemplateForLetterPreview:m.visual}));
vi.mock("@/lib/output/letter-document-builder",()=>({buildLetterExecutiveLedgerDocument:()=>({title:"Synthetic"})}));
vi.mock("@/features/executive-ledger/executive-ledger-preview",()=>({ExecutiveLedgerPreview:()=> <div>Verified formal preview</div>}));
vi.mock("@/lib/export/pdf",()=>({exportToPDF:m.pdf}));
vi.mock("@/lib/export/print",()=>({exportToPrint:vi.fn()}));
import {LetterPreviewDialog} from "@/features/report-center/letter-preview-dialog";
import {ReadError} from "@/lib/reads/client";
const auth=syntheticAuthContext(["reports.view","reports.run"]);
const row=(id:number)=>({id,template_name:"Template "+id,template_code:"T"+id,template_type:"letter",is_default:false,governance_status:"approved",visual_editor_engine:null,branding_profile_id:null,branding_profile_name:null,branding_profile_type:null,company_name:null,logo_url:null,owner_company_id:null,selectable:true});
const clients:QueryClient[]=[];
function mount(){const q=new QueryClient({defaultOptions:{queries:{retry:false,retryDelay:0}}});clients.push(q);
 const tree=(context:AuthContext=auth,open=true)=><QueryClientProvider client={q}><LetterPreviewDialog authContext={context} open={open} onOpenChange={vi.fn()} reportCode="TEST" reportLabel="Test letter" employeeId={1}/></QueryClientProvider>;
 const view=render(tree());return {...view,replace:(context:AuthContext=auth,open=true)=>view.rerender(tree(context,open))};}
beforeEach(()=>{m.run.mockResolvedValue({success:true,data:{data:{columns:["name"],rows:[{name:"Synthetic employee"}]},resolvedTemplateId:null}});m.brand.mockResolvedValue({success:true,data:{}});m.visual.mockResolvedValue({ok:true,hasVisualLayout:false});m.read.mockImplementation(async(_name,p)=>({success:true,data:{criteria:p,rows:p.page===1?Array.from({length:p.search?1:25},(_,i)=>row(i+1)):[row(26)],totalCount:p.search?1:26,selected:p.selectedId?row(p.selectedId):null}}));});
afterEach(()=>{cleanup();clients.splice(0).forEach(q=>q.clear());Object.values(m).forEach(f=>f.mockReset());});
async function formal(){await screen.findByText("Synthetic employee");fireEvent.click(screen.getByRole("button",{name:"Formal View"}));await screen.findByRole("combobox",{name:"Letter template"});}
it("does not bulk-load choices until the formal picker is opened",async()=>{mount();await screen.findByText("Synthetic employee");expect(m.read).not.toHaveBeenCalled();await formal();expect(m.read.mock.calls[0][0]).toBe("report-template-selection");expect(m.read.mock.calls[0][1]).toMatchObject({issuableOnly:true,page:1,pageSize:25});});
it("loads a later template page and separately verifies the selected template before formal output",async()=>{mount();await formal();expect((screen.getByRole("button",{name:"Save Draft PDF"}) as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getByRole("button",{name:"Next templates"}));await screen.findByRole("option",{name:"Template 26"});fireEvent.change(screen.getByRole("combobox",{name:"Letter template"}),{target:{value:"26"}});await screen.findByText("Verified formal preview");expect(m.read.mock.calls.at(-1)?.[1]).toMatchObject({page:2,selectedId:26});expect(m.visual).toHaveBeenCalledWith({templateId:26,employeeId:1});});
it.each([401,403,503])("a %s picker failure never enables formal output",async status=>{m.read.mockRejectedValue(new ReadError("Unavailable",status));mount();await screen.findByText("Synthetic employee");fireEvent.click(screen.getByRole("button",{name:"Formal View"}));await screen.findByRole("button",{name:"Retry"});expect((screen.getByRole("button",{name:"Save Draft PDF"}) as HTMLButtonElement).disabled).toBe(true);expect(screen.queryByText("Verified formal preview")).toBeNull();expect(m.visual).not.toHaveBeenCalled();});
it("account replacement aborts the template request and masks late choices",async()=>{let finish!:(v:unknown)=>void;m.read.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const view=mount();await screen.findByText("Synthetic employee");fireEvent.click(screen.getByRole("button",{name:"Formal View"}));await waitFor(()=>expect(m.read).toHaveBeenCalledTimes(1));const signal=m.read.mock.calls[0][2] as AbortSignal;view.replace(syntheticAuthContext(["reports.view","reports.run"],{id:2,auth_user_id:"synthetic-b"}));expect(signal.aborted).toBe(true);await act(async()=>finish({success:true,data:{criteria:m.read.mock.calls[0][1],rows:[row(999)],totalCount:1,selected:null}}));expect(screen.queryByText("Template 999")).toBeNull();});
it("inactive principals cannot run or display a letter",()=>{const view=mount();view.replace({...auth,isAccountActive:false,accountStatus:"suspended"});expect(screen.getByRole("alert")).toBeTruthy();expect(screen.queryByText("Synthetic employee")).toBeNull();});
