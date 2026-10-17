import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { DmsOcrFileStatus } from "@/server/actions/dms/ocr";
import { OcrStatusReadError } from "@/lib/dms/ocr/status-read-error";
const state=vi.hoisted(()=>({queries:[] as Record<string,unknown>[]}));
vi.mock("@tanstack/react-query",()=>({useQuery:()=>state.queries.shift()??{isError:false,data:null},useQueryClient:()=>({})}));
vi.mock("@/components/erp/table/erp-data-table",()=>({ERPDataTable:()=>null}));
vi.mock("@/components/erp/table/loaded-list-view",()=>({loadedListValue:()=>""}));
vi.mock("@/components/ui/button",()=>({Button:({children,disabled}:{children?:ReactNode;disabled?:boolean})=>createElement("button",{disabled},children)}));
vi.mock("@/features/dms/ocr/dms-ocr-status-badge",()=>({DmsOcrStatusBadge:({status}:{status:string})=>createElement("span",null,status)}));
vi.mock("@/components/erp/table/record-collection",()=>({RecordCollection:(props:{rows:DmsOcrFileStatus[];renderRecord:(row:DmsOcrFileStatus)=>ReactNode})=>
  createElement("div",null,props.rows.map(row=>createElement("div",{key:row.file_id},props.renderRecord(row))))}));
vi.mock("@/server/actions/dms/ocr",()=>({getDmsFileOcrText:vi.fn(),getDmsOcrJobs:vi.fn(),getDmsOcrStatus:vi.fn(),retryDmsOcrJob:vi.fn(),triggerDmsOcrForDocument:vi.fn()}));
import { DmsDocumentOcrSection } from "../dms-document-ocr-section";
const file={file_id:11,file_name:"synthetic.pdf",mime_type:"application/pdf",ocr_status:"complete",has_text:true,ocr_provider:"vision",ocr_model:"gpt-6.1-sol"};
beforeEach(()=>{state.queries=[];});
function render(status:Record<string,unknown>,canTrigger=true){state.queries=[status,{data:[],isError:false},{data:null,isError:false}];return renderToStaticMarkup(createElement(DmsDocumentOcrSection,{documentId:7,canTrigger,canViewText:true}));}
it("shows a retryable load error, never no-files or not-started, when status fails",()=>{
  const html=render({isError:true,isLoading:false,data:undefined,refetch:async()=>null});
  expect(html).toContain("Retry loading");expect(html).toContain("could not be loaded");expect(html).not.toContain("No files attached");expect(html).not.toContain("Not Started");expect(html).not.toContain("Run OCR");
});
it("does not expose stale actions after a failed refetch",()=>{
  const html=render({isError:true,data:{files:[file]},refetch:async()=>null});expect(html).not.toContain("Read page images");expect(html).not.toContain("No files attached");
});
it("shows a safe stage and correlation reference without raw error details",()=>{
  const html=render({isError:true,error:new OcrStatusReadError("files","3b7bc68b-6615-41c5-a395-30f20a048f3a"),refetch:async()=>null});
  expect(html).toContain("attached files&#x27; OCR status");expect(html).toContain("3b7bc68b-6615-41c5-a395-30f20a048f3a");
  expect(html).not.toContain("No files attached");
  expect(render({isError:true,error:Error("PRIVATE-DATABASE-DETAIL"),refetch:async()=>null})).not.toContain("PRIVATE-DATABASE-DETAIL");
});
it("shows the empty-file message only for a successfully loaded empty status",()=>{
  const html=render({isError:false,data:{files:[],ocr_status:"not_started"},refetch:async()=>null});expect(html).toContain("No files attached");expect(html).not.toContain("could not be loaded");
});
it("offers text viewing and explicit image re-read for a complete attached PDF",()=>{
  const html=render({isError:false,data:{files:[file],ocr_status:"complete",ocr_text_available:true},refetch:async()=>null});
  expect(html).toContain("View Text");expect(html).toContain("Read page images");expect(html).not.toContain("No files attached");
});
it("does not offer OCR mutations to a read-only user",()=>{
  const html=render({isError:false,data:{files:[file],ocr_status:"complete",ocr_text_available:true},refetch:async()=>null},false);
  expect(html).not.toContain(">Read page images<");expect(html).not.toContain(">Re-run OCR");expect(html).toContain("View Text");
});
