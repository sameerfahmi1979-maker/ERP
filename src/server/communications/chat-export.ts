import "server-only";
import { createHash,randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { acquireExportSpool,exportSpoolLimits,type ExportSpool,type SealedPart } from "./export-spool";
import JSZip from "jszip";
import { z } from "zod";
import { getPdfTransportConfig } from "@/lib/config/server-features";
import { gotenbergConvertHtml } from "@/lib/pdf/gotenberg";
import type { CommunicationActor } from "./access";
import { decimal, exportArgs, filename, id, type HistoryMode } from "./contracts";
import { admitOperation, CommunicationHttpError, privateHeaders, userRpc } from "./http";
import { authorizedAttachment, readAttachment } from "./media";

const metadata = z.object({ id, filename });
const message = z.object({
  id, conversationId: id, seq: decimal, revision: decimal, sentAt: z.string(), senderName: z.string().nullish(),
  body: z.string().nullish(), kind: z.string(), deleted: z.boolean(), forwarded: z.boolean().optional(),
  editedAt: z.string().nullish(), attachments: z.array(metadata), dmsRef: z.object({}).nullish(),
  reply: z.object({ id, body: z.string().nullish(), deleted: z.boolean().optional() }).nullish(),
});
type Message = z.infer<typeof message>;
type ExportArgs = z.infer<typeof exportArgs>;
const exportPage = z.object({ items: z.array(message).max(40), revision: decimal, nextSeq: decimal.nullable() });
const maxZip = 0xf0000000; // ZIP32 with room for central headers and the transcript.
const htmlEscape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[c]!);
function visible(row: Message, mode: HistoryMode): Message {
  if (!row.deleted || mode==="review") return row;
  return { ...row, body:"Message deleted", attachments:[], dmsRef:null, reply:null };
}
export function transcriptEntry(row: Message, mode: HistoryMode) {
  const v = visible(row,mode);
  const lines = [v.senderName ?? "ERP System",v.sentAt,v.editedAt ? "Edited" : "",v.forwarded ? "Forwarded" : "",
    v.deleted && mode==="review" ? "Deleted" : ""].filter(Boolean).map(htmlEscape);
  const parts = [v.reply ? "Reply: "+(v.reply.deleted && mode==="participant" ? "Message deleted" : v.reply.body ?? "") : "",
    v.body ?? "", ...v.attachments.map(a=>a.filename), v.dmsRef ? "Protected ERP document" : ""];
  return "<section><b>"+lines.join(" · ")+"</b><p>"+parts.filter(Boolean).map(htmlEscape).join("<br>")+"</p></section>";
}
const docStart = '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><style>body{font:11pt sans-serif}p{white-space:pre-wrap;overflow-wrap:anywhere}section{border-bottom:1px solid #bbb}b{font-size:9pt}</style></head><body><h1>ERP conversation transcript</h1>';
function zipName(name: string) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu,"_").replace(/[. ]+$/g,"_").slice(0,180) || "attachment";
}

async function page(args: ExportArgs, actor: CommunicationActor, after: string | null, expected: string | null, limit=40) {
  const from=args.from ? new Date(args.from) : null, until=args.until ? new Date(args.until) : null;
  const permit=await admitOperation(actor,"export",undefined,false,{op:"chat.exportPage",args:{
    conversationId:args.conversationId,mode:args.mode,from:from?.getTime().toString() ?? null,until:until?.getTime().toString() ?? null,after,expected,limit,
  }});
  return exportPage.parse(await userRpc("erp_chat_export_page", {
    p_permit:permit.permitId,p_conversation: args.conversationId, p_mode: args.mode, p_from:from?.toISOString() ?? null, p_until:until?.toISOString() ?? null,
    p_after:after, p_expected:expected, p_limit:limit,
  }));
}
export async function walkTranscript(args: ExportArgs, actor: CommunicationActor, initialRevision: string | null, visit: (row: Message)=>Promise<void>) {
  let revision=initialRevision, cursor: string | null=null, last=BigInt(-1);
  const hash = createHash("sha256");
  for (;;) {
    const batch = await page(args,actor,cursor,revision);
    revision ??= batch.revision;
    if (batch.revision!==revision) throw new CommunicationHttpError("conflict");
    for (const raw of batch.items) {
      if (raw.conversationId!==args.conversationId || BigInt(raw.seq)<=last) throw new CommunicationHttpError("conflict");
      last=BigInt(raw.seq);
      const row=visible(raw,args.mode);
      hash.update(JSON.stringify(row)).update("\n");
      await visit(row);
    }
    if (batch.nextSeq===null) break;
    if (!batch.items.length || last!==BigInt(batch.nextSeq)) throw new CommunicationHttpError("conflict");
    cursor=batch.nextSeq;
  }
  return { revision, digest:hash.digest("hex") };
}

async function mergePdf(parts:SealedPart[],spool:ExportSpool,send:typeof fetch) {
  if(parts.length===1)return parts[0];
  const {rendererUrl,timeoutMs}=getPdfTransportConfig(), boundary=randomUUID();
  async function* form() {
    for(let i=0;i<parts.length;i++) {
      yield Buffer.from("--"+boundary+"\r\nContent-Disposition: form-data; name=\"files\"; filename=\""+String(i).padStart(8,"0")+".pdf\"\r\nContent-Type: application/pdf\r\n\r\n");
      yield* spool.read(parts[i]);
      yield Buffer.from("\r\n");
    }
    yield Buffer.from("--"+boundary+"--\r\n");
  }
  const init:RequestInit & {duplex:"half"}={method:"POST",duplex:"half",redirect:"error",
    headers:{"Content-Type":"multipart/form-data; boundary="+boundary},
    body:Readable.toWeb(Readable.from(form())) as ReadableStream<Uint8Array>,
    signal:AbortSignal.any([AbortSignal.timeout(timeoutMs),spool.signal])};
  const response=await send(rendererUrl+"/forms/pdfengines/merge",init);
  if (!response.ok || !response.body || response.headers.get("content-type")?.split(";")[0]!=="application/pdf") {
    void response.body?.cancel().catch(()=>{});
    throw new CommunicationHttpError("temporarily_unavailable");
  }
  const source=Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  async function* verified() {
    let head=Buffer.alloc(0),tail=Buffer.alloc(0),size=0;
    for await(const chunk of source) {
      const b=Buffer.from(chunk);
      size+=b.length;
      if(size>maxZip)throw new CommunicationHttpError("size_limit");
      if(head.length<8)head=Buffer.concat([head,b.subarray(0,8-head.length)]);
      tail=Buffer.concat([tail,b.subarray(-1024)]).subarray(-1024);
      yield b;
    }
    if(!head.toString("ascii").startsWith("%PDF-") || !/%%EOF\s*$/.test(tail.toString("latin1")))
      throw new CommunicationHttpError("temporarily_unavailable");
  }
  return spool.save(Readable.from(verified()));
}

export async function serveChatExport(input: unknown,actor: CommunicationActor, sendToRenderer:typeof fetch=fetch) {
  const parsed=exportArgs.safeParse(input);
  if (!parsed.success) throw new CommunicationHttpError("invalid_request");
  const args=parsed.data;
  const permit=await admitOperation(actor,"export");
  const ensurePermit=()=>{if (Date.now()>=permit.expiresAt.getTime()) throw new CommunicationHttpError("temporarily_unavailable");};
  const limits=exportSpoolLimits(), funded=permit.spool;
  if (!limits || !funded || limits.slots>funded.slotsPerVolume ||
      BigInt(Math.floor(limits.bytes/limits.slots))>BigInt(funded.bytesPerSlot) ||
      120+limits.recoverySeconds>funded.cleanupTailSeconds)
    throw new CommunicationHttpError("temporarily_unavailable","Export spool capacity or recovery coverage is unavailable.");
  const spool=await acquireExportSpool(permit.expiresAt,limits);

  let handedOff=false;
  try {
    const zip=new JSZip(), files=new Map<string,string>(), pdfs:SealedPart[]=[];
    let html="", archiveBytes=0;
    const spoolPdf=async()=>{
      ensurePermit();
      const {buffer}=await gotenbergConvertHtml({html:docStart+html+"</body></html>"});
      pdfs.push(await spool.save(buffer)); html="";
    };
    const addFile=(name:string,part:SealedPart)=>{
      zip.file(name,Readable.from((async function*(){yield* spool.read(part);})()),{createFolders:false});
    };
    const first=await walkTranscript(args,actor,null,async row=>{
      ensurePermit();
      html+=transcriptEntry(row,args.mode);
      if (Buffer.byteLength(html)>192*1024) await spoolPdf();
      for (const a of row.attachments) {
        if (files.has(a.id)) continue;
        if (files.size>=65000) throw new CommunicationHttpError("size_limit");
        const {plan,bytes}=await readAttachment(a.id,args.mode,actor);
        archiveBytes+=bytes.length;
        if (archiveBytes>maxZip) throw new CommunicationHttpError("size_limit");
        if (plan.filename!==a.filename) throw new CommunicationHttpError("conflict");
        const part=await spool.save(bytes);
        files.set(a.id,JSON.stringify(plan));
        addFile("attachments/"+a.id+"-"+zipName(a.filename),part);
      }
    });
    if (html || !pdfs.length) await spoolPdf();
    const pdf=await mergePdf(pdfs,spool,sendToRenderer);
    if (archiveBytes+pdf.size>maxZip) throw new CommunicationHttpError("size_limit");
    addFile("transcript.pdf",pdf);
    const output=await spool.save(zip.generateNodeStream({streamFiles:true,compression:"STORE"}) as Readable);
    const second=await walkTranscript(args,actor,first.revision,async row=>{
      ensurePermit();
      for (const a of row.attachments)
        if (JSON.stringify(await authorizedAttachment(a.id,args.mode,actor))!==files.get(a.id)) throw new CommunicationHttpError("conflict");
    });
    if (first.digest!==second.digest || (await page(args,actor,null,first.revision,1)).revision!==first.revision)
      throw new CommunicationHttpError("conflict");
    ensurePermit();
    const size=output.size;
    const stream=spool.read(output);
    const timer=setTimeout(()=>stream.destroy(new Error("Export transfer expired.")),Math.max(1,permit.expiresAt.getTime()-Date.now()));
    timer.unref();
    stream.once("close",()=>{clearTimeout(timer);void spool.close().catch(()=>{});});
    const response=new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>,{headers:{
      ...privateHeaders,"Content-Type":"application/zip","Content-Length":String(size),"Content-Disposition":'attachment; filename="conversation.zip"',
    }});
    handedOff=true;
    return response;
  } finally { if (!handedOff) await spool.close(); }
}
