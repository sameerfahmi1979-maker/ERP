// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {ReadCacheBoundary} from "@/components/layout/read-cache-boundary";
import {DmsDocumentPreparationPanel} from "@/features/dms/documents/sections/dms-document-preparation-panel";
import {DmsPreparationReviewFields} from "@/features/dms/intake/dms-preparation-review-fields";
import type {PreparationCandidates} from "@/lib/dms/preparation/candidates";
const api=vi.hoisted(()=>({snapshot:vi.fn(),recover:vi.fn(),status:vi.fn(),start:vi.fn(),apply:vi.fn(),cancel:vi.fn()}));
vi.mock("@/server/actions/dms/document-preparation",()=>({getDocumentPreparationSnapshot:api.snapshot,recoverDocumentPreparation:api.recover,getDocumentPreparationStatus:api.status,startDocumentPreparation:api.start,applyDocumentPreparation:api.apply,cancelDocumentPreparation:api.cancel}));
vi.mock("@/components/erp/erp-child-dialog-form",()=>({ERPChildDialogForm:({open,children,onSubmit,submitLabel,submitDisabled}:{open:boolean;children:React.ReactNode;onSubmit?:()=>void;submitLabel?:string;submitDisabled?:boolean})=>open?<div role="dialog">{children}{onSubmit&&<button disabled={submitDisabled} onClick={onSubmit}>{submitLabel}</button>}</div>:null}));
vi.mock("@/features/dms/intake/dms-ai-intake-review-form",()=>({DmsAiIntakeReviewForm:(props:Parameters<typeof DmsPreparationReviewFields>[0])=><DmsPreparationReviewFields {...props}/>}));
const hash="a".repeat(64);
const candidate:PreparationCandidates={version:1,sourceSnapshot:hash,profileHash:hash,values:[{key:"title",label:"Title",current:"Old",proposed:"Proposed",evidence:[],confidence:null}],summary:"SYNTHETIC prepared summary",tagIds:[],linkCandidates:[],warnings:[],bundle:"single",applicability:"document",readiness:{review:"required",links:"verified_context_only",semantic:"pending_accepted_review",reminders:"pending_accepted_expiry",split:"not_requested"}};
const snapshot={documentId:5,documentNo:"SYN-DOC-5",documentTypeId:1,categoryId:2,snapshot:hash,profileHash:hash,profile:null,subject:null,typeName:"Certificate",typeCode:"CERTIFICATE",current:{title:"Old",description:null,issue_date:null,expiry_date:null},fields:[],existingTags:[],files:[{id:2,versionId:3,sha256:hash,name:"SYNTHETIC.pdf",mime:"application/pdf",size:10,text:"Retained text",bucket:null,path:null}]};
const view=(actor="actor-one",scope="scope-one")=><ReadCacheBoundary authUserId={actor} scopeVersion={scope}><DmsDocumentPreparationPanel documentId={5} canRun/></ReadCacheBoundary>;
beforeEach(()=>{vi.clearAllMocks();api.snapshot.mockResolvedValue({success:true,data:snapshot});api.recover.mockResolvedValue({success:true,data:{recovery:null}});api.start.mockResolvedValue({success:true,data:{documentId:5,jobId:9,status:"queued",replayed:false}});api.status.mockResolvedValue({success:true,data:{state:"review_required",queueStatus:"completed",sourceCurrent:true,candidate,resultId:11,snapshot:hash}});});
afterEach(cleanup);
async function open(){fireEvent.click(screen.getByRole("button",{name:"Re-review existing document"}));await screen.findByText("SYNTHETIC.pdf");}
describe("review ownership and retained operations",()=>{
 it("retires a late private snapshot after account switch",async()=>{
  let resolve!:(value:unknown)=>void;api.snapshot.mockReturnValueOnce(new Promise(r=>{resolve=r;}));const ui=render(view());fireEvent.click(screen.getByText("Re-review existing document"));ui.rerender(view("actor-two"));await act(async()=>resolve({success:true,data:{...snapshot,files:[{...snapshot.files[0],name:"PRIVATE old account.pdf"}]}}));expect(screen.queryByText("PRIVATE old account.pdf")).toBeNull();expect(screen.queryByRole("dialog")).toBeNull();
 });
 it("recovers the original server request after reopening without creating paid work",async()=>{
  api.recover.mockResolvedValue({success:true,data:{recovery:{jobId:9,requestId:"00000000-0000-4000-8000-000000000009",snapshot:hash,mode:"reuse_text",fileIds:[2],state:"review_required"}}});render(view());await open();await screen.findByText("SYNTHETIC prepared summary");expect(api.status).toHaveBeenCalledWith(5,9);expect(api.start).not.toHaveBeenCalled();expect((screen.getByLabelText("Title") as HTMLInputElement).checked).toBe(false);
 });
 it("a lost save response retries exactly the original reviewed payload",async()=>{
  api.apply.mockResolvedValueOnce({success:false,uncertain:true,error:"Unconfirmed"}).mockResolvedValueOnce({success:true,data:{state:"applied",derivedReadiness:{state:"not_selected"}}});render(view());await open();fireEvent.click(screen.getByText("Prepare review"));await screen.findByText("SYNTHETIC prepared summary");fireEvent.click(screen.getByLabelText("Title"));fireEvent.click(screen.getByLabelText("I reviewed the selected values and their original sources."));fireEvent.click(screen.getByLabelText("Replace the existing values I selected."));fireEvent.click(screen.getByText("Apply selected changes"));await screen.findByText("Recover the same reviewed save");fireEvent.click(screen.getByText("Recover the same reviewed save"));await waitFor(()=>expect(api.apply).toHaveBeenCalledTimes(2));expect(api.apply.mock.calls[0][0]).toEqual(api.apply.mock.calls[1][0]);expect(api.start).toHaveBeenCalledTimes(1);
 });
 it("source change blocks applying a retained candidate",async()=>{
  api.status.mockResolvedValue({success:true,data:{state:"review_required",queueStatus:"completed",sourceCurrent:false,candidate,resultId:11,snapshot:hash}});render(view());await open();fireEvent.click(screen.getByText("Prepare review"));await screen.findByText("SYNTHETIC prepared summary");expect((screen.getByText("Apply selected changes") as HTMLButtonElement).disabled).toBe(true);expect(api.apply).not.toHaveBeenCalled();
 });
 it("failed source/recovery reads do not create a replacement request",async()=>{
  api.recover.mockResolvedValue({success:false,error:"Denied"});render(view());fireEvent.click(screen.getByText("Re-review existing document"));await screen.findByText("Current source or recovery status is unavailable. No new request was created.");expect(api.start).not.toHaveBeenCalled();expect(api.apply).not.toHaveBeenCalled();expect(screen.queryByText("Prepare review")).toBeNull();
 });
 it("retains approved values when an unsupported suggestion is unknown",()=>{
  const change=vi.fn();render(<DmsPreparationReviewFields mode="existing_document" candidate={{...candidate,values:[{key:"metadata:4",label:"Manual registered field",current:"Accepted",proposed:"",evidence:[],confidence:null}]}} selections={[]} edits={{}} onSelectionChange={change} onEdit={vi.fn()}/>);expect((screen.getByLabelText("Proposed Manual registered field") as HTMLInputElement).disabled).toBe(true);fireEvent.click(screen.getByLabelText("Manual registered field"));expect(change).toHaveBeenCalledWith(["metadata:4"]);expect(screen.getByText("Accepted").textContent).toBe("Accepted");expect(screen.queryByText("Edit filters")).toBeNull();expect(screen.queryByText("Edit columns")).toBeNull();
 });
});
