// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import type {ComplianceMutationAdmission} from "@/features/hr/employees/compliance/compliance-read-admission";
const s=vi.hoisted(()=>({catalog:vi.fn(),aggregate:vi.fn(),save:vi.fn()}));
vi.mock("@/lib/reads/hr-record-choice-client",()=>({listHrIdentityDocumentTypes:s.catalog,listHrRelationshipTypes:s.catalog}));
vi.mock("@/server/actions/hr/document-to-record",()=>({aggregateIdentityDocumentFromDms:s.aggregate,aggregateDependentFromDms:s.aggregate,aggregateMedicalInsuranceFromDms:s.aggregate,createIdentityDocumentFromDms:s.save,createDependentFromDms:s.save,createMedicalInsuranceFromDms:s.save}));
vi.mock("@/hooks/use-hr-document-choices",async original=>({...await original<typeof import("@/hooks/use-hr-document-choices")>(),HrDocumentChoicePages:()=>null,useHrDocumentChoices:()=>({ready:true,isCurrent:()=>true,rows:[{id:9,title:"Test source",document_no:"TEST-9",has_extraction:true}],isLoading:false,isError:false})}));
vi.mock("@/components/erp/erp-child-dialog-form",()=>({ERPChildDialogForm:({open,children}:{open:boolean;children:React.ReactNode})=>open?<div>{children}</div>:null}));
vi.mock("@/components/erp/table/record-collection",()=>({RecordCollection:({rows,renderRecord}:{rows:{id:number}[];renderRecord:(row:unknown)=>React.ReactNode})=><>{rows.map(row=><React.Fragment key={row.id}>{renderRecord(row)}</React.Fragment>)}</>}));
vi.mock("@/components/erp/query-read-boundary",()=>({QueryReadBoundary:({children}:{children:React.ReactNode})=><>{children}</>}));
vi.mock("@/components/erp/geography/country-select",()=>({CountrySelect:()=>null}));
vi.mock("@/components/erp/combobox",()=>({ERPCombobox:()=>null}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:vi.fn()}}));
import {HrDocumentToRecordWizard} from "@/features/hr/employees/document-to-record/hr-doc-to-record-wizard";
const draft={documentId:9,documentTitle:"Private source",document_type_id:1,document_type_code:"TEST",document_number:"PRIVATE-NUMBER",issue_date:"",expiry_date:"",issue_country_id:null,issuing_authority:"",profession_on_document:"",uid_number:"",emirates_id_application_no:"",visa_file_number:"",labour_card_number:"",work_permit_number:"",notes:""};
let client:QueryClient;
beforeEach(()=>{client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});s.aggregate.mockReset().mockResolvedValue({success:true,data:draft});s.catalog.mockReset().mockResolvedValue({success:true,data:{data:[{id:1,name_en:"Type"}]}});s.save.mockReset().mockResolvedValue({success:true});});
afterEach(()=>{cleanup();client.clear();});
function admission():ComplianceMutationAdmission{const a={generation:{},ready:true,canDispatch:()=>a.ready,isCurrent:()=>true,retrying:false,retry:async()=>{}};return a;}
function view(a:ComplianceMutationAdmission){return <QueryClientProvider client={client}><HrDocumentToRecordWizard employeeId={7} targetType="identity_document" open onOpenChange={()=>{}} onSaved={()=>{}} admission={a}/></QueryClientProvider>;}
async function review(){fireEvent.click(screen.getByRole("button",{name:/Test source/}));fireEvent.click(screen.getByRole("button",{name:"Review Draft"}));await screen.findByLabelText("Document Number");}
it("pauses submission until selected historical catalog choices finish verification",async()=>{
 let resolve!:(r:unknown)=>void;s.catalog.mockImplementation(()=>new Promise(r=>{resolve=r;}));render(view(admission()));await review();const button=screen.getByRole("button",{name:"Save Identity Document"});expect(button).toHaveProperty("disabled",true);fireEvent.click(button);expect(s.save).not.toHaveBeenCalled();expect(s.catalog.mock.calls[0][0]).toMatchObject({selectedId:1,signal:expect.any(AbortSignal)});
 await act(async()=>resolve({success:true,data:{data:[{id:1,name_en:"Archived selected type"}]}}));await waitFor(()=>expect(button).toHaveProperty("disabled",false));fireEvent.click(button);await waitFor(()=>expect(s.save).toHaveBeenCalledTimes(1));
});
it("retains draft but prevents saving when a required catalog read fails",async()=>{
 s.catalog.mockRejectedValue(new Error("Unavailable"));render(view(admission()));await review();await waitFor(()=>expect(s.catalog).toHaveBeenCalled());expect(screen.getByLabelText("Document Number")).toHaveProperty("value","PRIVATE-NUMBER");expect(screen.getByRole("button",{name:"Save Identity Document"})).toHaveProperty("disabled",true);expect(s.save).not.toHaveBeenCalled();
});
it("remounts private review state and aborts its catalog when the parent owner changes",async()=>{
 let resolve!:(r:unknown)=>void;s.catalog.mockImplementation(()=>new Promise(r=>{resolve=r;}));const a=admission(),r=render(view(a));await review();const signal=s.catalog.mock.calls[0][0].signal as AbortSignal;
 r.rerender(view(admission()));expect(screen.queryByDisplayValue("PRIVATE-NUMBER")).toBeNull();expect(screen.getByRole("button",{name:"Review Draft"})).toHaveProperty("disabled",true);expect(signal.aborted).toBe(true);
 await act(async()=>resolve({success:true,data:{data:[{id:1,name_en:"OLD PRIVATE TYPE"}]}}));expect(screen.queryByText("OLD PRIVATE TYPE")).toBeNull();expect(s.save).not.toHaveBeenCalled();
});
it("does not submit when parent admission is revoked after review",async()=>{
 const a=admission(),r=render(view(a));await review();await waitFor(()=>expect(screen.getByRole("button",{name:"Save Identity Document"})).toHaveProperty("disabled",false));a.ready=false;r.rerender(view(a));expect(screen.getByRole("button",{name:"Save Identity Document"})).toHaveProperty("disabled",true);expect(s.save).not.toHaveBeenCalled();
});
