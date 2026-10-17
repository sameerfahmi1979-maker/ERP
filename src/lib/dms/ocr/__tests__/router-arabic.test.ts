import { beforeEach, expect, it, vi } from "vitest";
import type { IDmsAiProvider } from "@/lib/dms/ai/types";
const state=vi.hoisted(()=>({extract:vi.fn()}));
vi.mock("@/lib/dms/file-content-extractor",()=>({extractFileContent:state.extract}));
import { routeOcr } from "../ocr-router";
const flags={dmsOcr:true,dmsOcrRouter:true,dmsOcrAzure:false,dmsOcrGptVisionFallback:true};
const analyze=vi.fn(async()=>({extraction:{fullTextTranscription:"اختبار عربي TEST-6101 125.50"}}));
const provider={isConfigured:()=>true,modelId:"gpt-6.1-sol",analyze} as unknown as IDmsAiProvider;
const input={buffer:Buffer.from("synthetic"),mimeType:"application/pdf",fileName:"synthetic.pdf",featureFlags:flags,gptProvider:provider};
beforeEach(()=>{vi.clearAllMocks();state.extract.mockResolvedValue({text:"",images:[{fileName:"page-1.png",mimeType:"image/png",base64:"synthetic"}],hasContent:true,method:"pdf-rendered-images",pdfTextRejected:true,pageCount:1});});
it("uses page images, not the damaged Arabic layer",async()=>{
  const r=await routeOcr(input);expect(r).toMatchObject({providerCode:"vision",model:"gpt-6.1-sol",sourceKind:"digital"});expect(r.text).toContain("اختبار");expect(analyze).toHaveBeenCalledWith(expect.objectContaining({ocrText:"",imageFiles:expect.any(Array)}));
});
it("keeps the clean digital fast path",async()=>{
  state.extract.mockResolvedValueOnce({text:"Clean English text",images:[],method:"pdf-text-layer"});
  expect((await routeOcr(input)).providerCode).toBe("pdf_text");expect(analyze).not.toHaveBeenCalled();
});
it("forwards explicit visual mode and does not silently use Azure",async()=>{
  const azure={isConfigured:()=>true,supports:()=>true,extractText:vi.fn()};
  await routeOcr({...input,forceVision:true,featureFlags:{...flags,dmsOcrAzure:true},azureProvider:azure as never});
  expect(state.extract).toHaveBeenCalledWith(input.buffer,input.mimeType,input.fileName,{skipPdfPageRendering:false,forcePdfVision:true});expect(azure.extractText).not.toHaveBeenCalled();expect(analyze).toHaveBeenCalled();
});
it("does not claim to have read rejected text when vision is unavailable",async()=>{
  const r=await routeOcr({...input,gptProvider:null});expect(r.text).toBe("");expect(r.method).toBe("gpt-vision-not-configured");
});
it("rejects incomplete page coverage before an AI call instead of silently saving partial Arabic text",async()=>{
  state.extract.mockResolvedValueOnce({text:"",images:[{fileName:"page-1.png",mimeType:"image/png",base64:"synthetic"}],pdfTextRejected:true,pageCount:2});
  await expect(routeOcr(input)).rejects.toThrow("1 of 2 PDF pages");
  expect(analyze).not.toHaveBeenCalled();
});
it("does not bill or persist OCR when PDF page coverage cannot be verified",async()=>{
  state.extract.mockResolvedValueOnce({text:"",images:[{fileName:"page-1.png",mimeType:"image/png",base64:"synthetic"}],pdfTextRejected:true});
  await expect(routeOcr(input)).rejects.toThrow("coverage could not be verified");expect(analyze).not.toHaveBeenCalled();
});
