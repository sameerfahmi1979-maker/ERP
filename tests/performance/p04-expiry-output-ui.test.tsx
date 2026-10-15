// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
const m=vi.hoisted(()=>({read:vi.fn(),csv:vi.fn(),excel:vi.fn(),pdf:vi.fn(),print:vi.fn(),send:vi.fn(),allowed:true}));
vi.mock("@/hooks/use-legacy-email-access",()=>({useLegacyEmailAccess:()=>m.allowed}));
vi.mock("@/lib/reads/client",()=>({readJson:m.read}));
vi.mock("@/lib/export",()=>({exportToCSV:m.csv,exportToExcel:m.excel,exportToPDF:m.pdf,exportToPrint:m.print,generateCSVAttachment:vi.fn(),generateExcelAttachment:vi.fn(),generatePDFAttachment:vi.fn()}));
vi.mock("@/server/actions/email",()=>({sendExportEmail:()=>{throw Error("Generic email is forbidden for on-demand output");}}));
vi.mock("@/server/actions/lookups/users-for-email",()=>({getUsersForEmailSelect:async()=>[]}));
vi.mock("@/server/actions/dms/expiry-reminders",()=>({sendExpiryDocumentsEmail:m.send}));
vi.mock("@/components/erp/email/erp-send-email-dialog",()=>({ERPSendEmailDialog:()=>null}));
vi.mock("@/components/erp/combobox",()=>({ERPCombobox:()=>null}));
vi.mock("@/components/ui/dropdown-menu",()=>({
 DropdownMenu:({children}:{children:React.ReactNode})=><div>{children}</div>,DropdownMenuContent:({children}:{children:React.ReactNode})=><div>{children}</div>,
 DropdownMenuGroup:({children}:{children:React.ReactNode})=><div>{children}</div>,DropdownMenuLabel:({children}:{children:React.ReactNode})=><div>{children}</div>,DropdownMenuSeparator:()=>null,
 DropdownMenuTrigger:({children,disabled}:{children:React.ReactNode;disabled?:boolean})=><button disabled={disabled}>{children}</button>,
 DropdownMenuItem:({children,onClick,disabled}:{children:React.ReactNode;onClick?:()=>void;disabled?:boolean})=><button disabled={disabled} onClick={onClick}>{children}</button>,
}));
vi.mock("@/components/erp/erp-child-dialog-form",()=>({ERPChildDialogForm:({children,open,onSubmit,submitLabel,isDirty}:{children:React.ReactNode;open:boolean;onSubmit:()=>void;submitLabel:string;isDirty?:boolean})=>open?<div role="dialog" data-dirty={isDirty}>{children}<button onClick={onSubmit}>{submitLabel}</button></div>:null}));
import {DmsExpiryOutputs} from "@/features/dms/expiry/dms-expiry-outputs";
import {ERPExportMenu} from "@/components/erp/export/erp-export-menu";
const docs=Array.from({length:1107},(_,i)=>({id:i+1,document_no:`DOC-${i+1}`,title:`Synthetic ${i+1}`,document_type:null,category:null,expiry_date:null,days_remaining:null,status:"active"}));
const output=(fingerprint="a".repeat(64))=>({success:true,data:{rows:docs,totalCount:docs.length,fingerprint}});
beforeEach(()=>{vi.spyOn(window,"open").mockReturnValue({document:{title:""},close:vi.fn()} as unknown as Window);m.allowed=true;m.read.mockResolvedValue(output());m.send.mockResolvedValue({success:true});for(const spy of [m.csv,m.excel,m.pdf,m.print])spy.mockResolvedValue({success:true});m.csv.mockReturnValue({success:true});m.print.mockReturnValue({success:true});});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.resetAllMocks();});
const criteria={view:"expired" as const,search:"matching",columnFilters:{status:"active"}};
it.each([["Export to CSV","csv"],["Export to Excel","excel"],["Export to PDF","pdf"],["Print","print"]] as const)("%s receives every matching row, not the visible 25",async(label,format)=>{
 render(<DmsExpiryOutputs criteria={criteria} ready total={1107}/>);expect(m.read).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:label}));
 await waitFor(()=>expect(m[format]).toHaveBeenCalledOnce());expect(m[format].mock.calls[0][0]).toMatchObject({data:docs,rowCount:1107,exportMode:"filtered"});
 expect(m.read).toHaveBeenCalledWith("dms-expiry-output",criteria,expect.any(AbortSignal));expect(m.read.mock.calls[0][1]).not.toHaveProperty("page");
});
it("ordinary export callers retain their supplied data behavior",async()=>{render(<ERPExportMenu title="Existing" filename="existing" data={[{id:7}]} columns={[]}/>);fireEvent.click(screen.getByRole("button",{name:"Export to CSV"}));await waitFor(()=>expect(m.csv).toHaveBeenCalledOnce());expect(m.csv.mock.calls[0][0].data).toEqual([{id:7}]);expect(m.read).not.toHaveBeenCalled();});
it("failed and partial complete results cannot produce a file",async()=>{
 m.read.mockResolvedValueOnce({success:true,data:{rows:docs.slice(0,25),totalCount:1107,fingerprint:"a".repeat(64)}}).mockRejectedValueOnce(Error("Unavailable"));
 render(<DmsExpiryOutputs criteria={criteria} ready total={1107}/>);
 for(let i=0;i<2;i++){fireEvent.click(screen.getByRole("button",{name:"Export to CSV"}));await waitFor(()=>expect((screen.getByRole("button",{name:"Export"}) as HTMLButtonElement).disabled).toBe(false));}
 expect(m.csv).not.toHaveBeenCalled();expect(m.read).toHaveBeenCalledTimes(2);
});
it("two immediate export clicks coalesce into one complete retrieval",async()=>{
 let resolve!:(v:unknown)=>void;m.read.mockReturnValue(new Promise(r=>{resolve=r;}));render(<DmsExpiryOutputs criteria={criteria} ready total={1107}/>);
 const button=screen.getByRole("button",{name:"Export to CSV"});fireEvent.click(button);fireEvent.click(button);expect(m.read).toHaveBeenCalledOnce();await act(async()=>resolve(output()));expect(m.csv).toHaveBeenCalledOnce();
});
it("retired criteria abort a pending export and discard a late result",async()=>{
 let resolve!:(v:unknown)=>void;m.read.mockReturnValueOnce(new Promise(r=>{resolve=r;}));
 const view=render(<DmsExpiryOutputs key="old" criteria={criteria} ready total={1107}/>);fireEvent.click(screen.getByRole("button",{name:"Export to CSV"}));const signal=m.read.mock.calls[0][2] as AbortSignal;
 view.rerender(<DmsExpiryOutputs key="new" criteria={{view:"ignored"}} ready total={0}/>);expect(signal.aborted).toBe(true);await act(async()=>resolve(output()));expect(m.csv).not.toHaveBeenCalled();
});
it("read verification disables outputs and aborts in-flight complete reads",async()=>{
 let resolve!:(v:unknown)=>void;m.read.mockReturnValueOnce(new Promise(r=>{resolve=r;}));const view=render(<DmsExpiryOutputs criteria={criteria} ready total={1107}/>);
 fireEvent.click(screen.getByRole("button",{name:"Export to CSV"}));const signal=m.read.mock.calls[0][2] as AbortSignal;
 view.rerender(<DmsExpiryOutputs criteria={criteria} ready={false} total={undefined}/>);expect(signal.aborted).toBe(true);await act(async()=>resolve(output()));expect(m.csv).not.toHaveBeenCalled();expect((screen.getByRole("button",{name:"Export"}) as HTMLButtonElement).disabled).toBe(true);
});
async function openEmail(){fireEvent.click(screen.getByRole("button",{name:"Send by Email"}));await screen.findByRole("dialog");fireEvent.change(screen.getByPlaceholderText("someone@example.com"),{target:{value:"synthetic@example.invalid"}});}
it("email preparation and final recheck both use the complete set; no delivery occurs on preparation",async()=>{
 render(<DmsExpiryOutputs criteria={criteria} ready total={1107}/>);await openEmail();expect(m.send).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Send Email"}));
 await waitFor(()=>expect(m.send).toHaveBeenCalledOnce());expect(m.read).toHaveBeenCalledTimes(2);expect(m.send.mock.calls[0][0].docs).toHaveLength(1107);expect(m.send.mock.calls[0][0].docs.at(-1).document_no).toBe("DOC-1107");
});
it.each(["changed","failed"])("%s final complete verification prevents email delivery",async mode=>{
 m.read.mockResolvedValueOnce(output());if(mode==="changed")m.read.mockResolvedValueOnce(output("b".repeat(64)));else m.read.mockRejectedValueOnce(Error("Unavailable"));
 render(<DmsExpiryOutputs criteria={criteria} ready total={1107}/>);await openEmail();fireEvent.click(screen.getByRole("button",{name:"Send Email"}));await waitFor(()=>expect(m.read).toHaveBeenCalledTimes(2));expect(m.send).not.toHaveBeenCalled();expect(screen.getByRole("dialog")).toBeTruthy();
});
it("same-criteria verification preserves the unsent email draft while hiding its actions",async()=>{
 const view=render(<DmsExpiryOutputs criteria={criteria} ready total={1107}/>);await openEmail();fireEvent.change(screen.getByPlaceholderText("Email subject"),{target:{value:"Keep this draft"}});
 view.rerender(<DmsExpiryOutputs criteria={criteria} ready={false} total={undefined}/>);expect(screen.queryByRole("dialog")).toBeNull();
 view.rerender(<DmsExpiryOutputs criteria={criteria} ready total={1107}/>);expect((screen.getByPlaceholderText("Email subject") as HTMLInputElement).value).toBe("Keep this draft");expect(m.send).not.toHaveBeenCalled();
 expect(screen.getByRole("dialog").getAttribute("data-dirty")).toBe("true");
});
it("legacy restricted callers can export but cannot prepare or send email",()=>{
 m.allowed=false;render(<DmsExpiryOutputs criteria={criteria} ready total={1107}/>);expect((screen.getByRole("button",{name:"Send by Email"}) as HTMLButtonElement).disabled).toBe(true);expect((screen.getByRole("button",{name:"Export"}) as HTMLButtonElement).disabled).toBe(false);expect(m.read).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();
});
it("removing email authority retires an existing email draft",async()=>{
 const view=render(<DmsExpiryOutputs criteria={criteria} ready total={1107}/>);await openEmail();m.allowed=false;view.rerender(<DmsExpiryOutputs criteria={criteria} ready total={1107}/>);expect(screen.queryByRole("dialog")).toBeNull();m.allowed=true;view.rerender(<DmsExpiryOutputs criteria={criteria} ready total={1107}/>);expect(screen.queryByRole("dialog")).toBeNull();
});
it("double email submission performs one final read and one send",async()=>{
 render(<DmsExpiryOutputs criteria={criteria} ready total={1107}/>);await openEmail();
 let resolve!:(v:unknown)=>void;m.read.mockReturnValueOnce(new Promise(r=>{resolve=r;}));const button=screen.getByRole("button",{name:"Send Email"});fireEvent.click(button);fireEvent.click(button);
 expect(m.read).toHaveBeenCalledTimes(2);await act(async()=>resolve(output()));await waitFor(()=>expect(m.send).toHaveBeenCalledOnce());
});
it("failed email preparation cannot open a partial draft or send",async()=>{
 m.read.mockRejectedValue(Error("Unavailable"));render(<DmsExpiryOutputs criteria={criteria} ready total={1107}/>);fireEvent.click(screen.getByRole("button",{name:"Send by Email"}));
 await screen.findByRole("alert");expect(screen.queryByRole("dialog")).toBeNull();expect(m.send).not.toHaveBeenCalled();
});
it("print reserves its popup synchronously and closes it if complete retrieval fails",async()=>{
 let reject!:(v:unknown)=>void;m.read.mockReturnValue(new Promise((_resolve,r)=>{reject=r;}));
 render(<DmsExpiryOutputs criteria={criteria} ready total={1107}/>);fireEvent.click(screen.getByRole("button",{name:"Print"}));
 expect(window.open).toHaveBeenCalledOnce();const popup=vi.mocked(window.open).mock.results[0].value as Window;
 expect(popup.document.title).toContain("Preparing");expect(m.print).not.toHaveBeenCalled();await act(async()=>reject(Error("Read failed")));expect(popup.close).toHaveBeenCalledOnce();expect(m.print).not.toHaveBeenCalled();
});
it("revoked email capability during final verification prevents dispatch",async()=>{
 const view=render(<DmsExpiryOutputs criteria={criteria} ready total={1107}/>);await openEmail();
 let resolve!:(v:unknown)=>void;m.read.mockReturnValueOnce(new Promise(r=>{resolve=r;}));fireEvent.click(screen.getByRole("button",{name:"Send Email"}));
 m.allowed=false;view.rerender(<DmsExpiryOutputs criteria={criteria} ready total={1107}/>);await act(async()=>resolve(output()));expect(m.send).not.toHaveBeenCalled();
});
