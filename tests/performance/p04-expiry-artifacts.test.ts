import {afterEach,expect,it,vi} from "vitest";
import {createRequire} from "node:module";
import ExcelJS from "exceljs";
const m=vi.hoisted(()=>({send:vi.fn<(input:unknown)=>Promise<{success:boolean}>>().mockResolvedValue({success:true})}));
vi.mock("@/lib/supabase/server",()=>({createClient:()=>{throw Error("No database access in artifact test");}}));
vi.mock("@/lib/rbac/check",()=>({getAuthContext:async()=>({profile:{id:1}}),hasPermission:()=>true}));
vi.mock("@/server/actions/email",()=>({sendExportEmail:m.send}));
vi.mock("@/server/actions/audit",()=>({logAudit:()=>{throw Error("No audit mutation in artifact test");}}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
import {sendExpiryDocumentsEmail} from "@/server/actions/dms/expiry-reminders";
import {exportToPrint} from "@/lib/export/print";
const docs=Array.from({length:1107},(_,i)=>({document_no:`DOC_${i+1}_END`,title:`Synthetic document ${i+1}`,document_type:"Test",category:"Synthetic",expiry_date:"2026-11-01",days_remaining:19,status:"active"}));
const input={to:["synthetic@example.invalid"],subject:"Synthetic output",body:"No provider is called",docs,tabTitle:"Synthetic expiry"};
afterEach(()=>{vi.unstubAllGlobals();m.send.mockClear();});
it.each(["csv","excel","pdf"] as const)("actual %s email attachment contains all 1107 identities",async attachmentFormat=>{
 const result=await sendExpiryDocumentsEmail({...input,attachmentFormat});expect(result.success).toBe(true);expect(m.send).toHaveBeenCalledOnce();
 const payload=m.send.mock.calls[0][0] as unknown as {attachment:{base64Content:string;sizeBytes:number};context:{recordCount:number}};
 const bytes=Buffer.from(payload.attachment.base64Content,"base64");expect(bytes.length).toBe(payload.attachment.sizeBytes);expect(payload.context.recordCount).toBe(1107);
 let text="";
 if(attachmentFormat==="csv")text=bytes.toString("utf8");
 if(attachmentFormat==="excel"){
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes as never);const sheet=workbook.worksheets[0];expect(sheet.rowCount).toBe(1108);
  text=sheet.getColumn(1).values.join("\n");
 }
 if(attachmentFormat==="pdf"){
  const parse=createRequire(import.meta.url)("pdf-parse/lib/pdf-parse.js") as (b:Buffer)=>Promise<{text:string;numpages:number}>;
  const parsed=await parse(bytes);expect(parsed.numpages).toBeGreaterThan(1);text=parsed.text;
 }
 const ids=text.match(/DOC_\d+_END/g)??[];expect(ids).toEqual(docs.map(d=>d.document_no));
},30000);
it("actual print markup contains the complete set and escapes document content",()=>{
 const write=vi.fn(),print=vi.fn(),popup={closed:false,opener:null,document:{open:vi.fn(),write,close:vi.fn()},onload:null,print} as unknown as Window;
 const open=vi.fn();vi.stubGlobal("window",{open});
 const result=exportToPrint({title:"Synthetic",filename:"synthetic",columns:[{key:"document_no",header:"<unsafe>"},{key:"title",header:"Title"}],data:[...docs,{...docs[0],document_no:"TAIL",title:'<img src=x onerror="alert(1)">'}]},popup);
 expect(result.success).toBe(true);expect(open).not.toHaveBeenCalled();const html=write.mock.calls[0][0] as string;
 expect(html.match(/DOC_\d+_END/g)).toEqual(docs.map(d=>d.document_no));expect(html).toContain("&lt;unsafe&gt;");expect(html).toContain("&lt;img");expect(html).not.toContain("<img src=x");
 expect(popup.onload).toBeTypeOf("function");
});
it("a closed reserved print window never causes an asynchronous replacement popup",()=>{
 const open=vi.fn();vi.stubGlobal("window",{open});expect(exportToPrint({title:"Synthetic",filename:"test",columns:[],data:docs},{closed:true} as Window).success).toBe(false);expect(open).not.toHaveBeenCalled();
});
