import {createHash} from "node:crypto";
import {z} from "zod";
import type {AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {getSelectedDmsDownloadFiles} from "@/server/actions/dms/selected-download";
import {dmsZipEntryNames,DMS_ZIP_MAX_BYTES,DMS_ZIP_MAX_FILES} from "@/lib/dms/selected-download";
import {admitMobileDmsSource,recheckMobileDmsSource,verifySession,DmsError,conflict,unavailable,type Capability} from "./access";
import {type CommandFor,id,hash,type Source} from "./contracts";
type Doc={id:number;number:string;versionId:number;sourceHash:string};
type File={id:number;documentId:number;versionId:number;name:string;mime:string;size:number;sha256:string|null;sourceHash:string};
const pdfTypes=new Set(["application/pdf","image/jpeg","image/png","image/webp"]);
const download:Capability[]=["dms.documents.download"];
export function buildManifest(format:"zip"|"pdf",documents:Doc[],files:File[]){
 const totalBytes=files.reduce((n,f)=>n+f.size,0);
 if(!documents.length||documents.length>25||!files.length||files.length>DMS_ZIP_MAX_FILES||new Set(files.map(f=>f.id)).size!==files.length||files.some(f=>!Number.isSafeInteger(f.size)||f.size<1||f.size>52428800)||totalBytes>DMS_ZIP_MAX_BYTES)throw new DmsError(413,"pack_limit","Select up to 25 documents, 50 files, 50 MiB per file and 100 MiB total.");
 const names=dmsZipEntryNames(files.map(f=>{const doc=documents.find(d=>d.id===f.documentId&&d.versionId===f.versionId);if(!doc)conflict();return {...f,folder:doc.number};}));
 const unsupportedFileIds=files.filter(f=>!pdfTypes.has(f.mime)).map(f=>f.id);
 const projection={format,documents,files:files.map((f,i)=>({...f,entryName:names[i]})),totalBytes,limits:{documents:25,files:50,bytes:DMS_ZIP_MAX_BYTES},pdf:{supported:!unsupportedFileIds.length,unsupportedFileIds,maxPages:25,maxPagePixels:2000000,maxTotalPixels:16000000}};
 return {...projection,manifestHash:createHash("sha256").update(JSON.stringify(projection)).digest("hex")};
}
export async function packs(input:CommandFor<"documentPackManifest"|"documentPackValidate">,ctx:AuthContext,signal?:AbortSignal){
 signal?.throwIfAborted();
 const selected=await getSelectedDmsDownloadFiles(input.documentIds);
 signal?.throwIfAborted();
 if(!selected.success)throw new DmsError(/limit|50 files|100 MB/.test(selected.error)?413:403,"pack_unavailable","The complete selected pack is unavailable.");
 const db=await createClient();signal?.throwIfAborted();
 const documentQuery=db.from("dms_documents").select("id,document_no").in("id",input.documentIds).is("deleted_at",null);
 const metadata=await (signal?documentQuery.abortSignal(signal):documentQuery);
 signal?.throwIfAborted();
 if(metadata.error||metadata.data?.length!==input.documentIds.length)conflict();
 const fileQuery=db.from("dms_document_files").select("id,document_id,version_id,file_name,file_size_bytes,mime_type,sha256_hash").in("id",selected.files.map(f=>f.id)).is("deleted_at",null).in("file_role",["original","attachment"]).order("id");
 const files=await (signal?fileQuery.abortSignal(signal):fileQuery);
 signal?.throwIfAborted();
 if(files.error||files.data?.length!==selected.files.length)conflict();
 const bindings:Source[]=[],docs:Doc[]=[],entries:File[]=[];
 const rows=z.array(z.object({id,document_id:id,version_id:id,file_name:z.string(),file_size_bytes:id,mime_type:z.string().nullable(),sha256_hash:hash.nullable()})).max(50).parse(files.data);
 for(const documentId of input.documentIds){
  const d=metadata.data.find(v=>v.id===documentId);if(!d)unavailable();
  const src=await admitMobileDmsSource(ctx,{documentId},download,signal);bindings.push(src);
  docs.push({id:documentId,number:d.document_no,versionId:src.documentVersionId,sourceHash:src.sourceHash});
  const chosen=rows.filter(v=>v.document_id===documentId);if(!chosen.length)conflict();
  for(const f of chosen){
   const canonical=selected.files.find(v=>v.id===f.id);
   if(!canonical||canonical.name!==f.file_name||canonical.size!==f.file_size_bytes||canonical.folder!==d.document_no||f.version_id!==src.documentVersionId)conflict();
   const bound=await admitMobileDmsSource(ctx,{documentId,versionId:f.version_id,fileId:f.id},download,signal);if(bound.fileSha256!==f.sha256_hash)conflict();bindings.push(bound);
   entries.push({documentId,versionId:f.version_id,id:f.id,name:f.file_name,mime:f.mime_type??"application/octet-stream",size:f.file_size_bytes,sha256:f.sha256_hash,sourceHash:bound.sourceHash});
  }
 }
 const manifest=buildManifest(input.format,docs,entries);
 signal?.throwIfAborted();
 await verifySession(ctx);
 for(const bound of bindings)await recheckMobileDmsSource(ctx,bound,download,false,signal);
 if(input.op==="documentPackValidate"){
  if(manifest.manifestHash!==input.manifestHash)conflict();
  if(input.format==="pdf"&&!manifest.pdf.supported)throw new DmsError(409,"pack_format_unavailable","Selected files cannot all render as PDF.");
  return {manifestHash:manifest.manifestHash,current:true,validatedAt:new Date().toISOString()};
 }
 return manifest;
}
