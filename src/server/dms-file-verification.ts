import 'server-only';
import {createHash} from 'node:crypto';
import {BATCH_MAX_BYTES,effectiveDmsMime} from '@/lib/dms/batch-admission';
import type {SupabaseClient} from '@supabase/supabase-js';
import {validateDmsDocument} from '@/server/dms-document-parser';

/** Structural admission, not malware scanning or a guarantee of document validity.
 * Does not execute Office content or decompress untrusted ZIP members. */
export function matchesDmsSignature(bytes:Buffer,mime:string):boolean{
 const starts=(hex:string)=>bytes.subarray(0,hex.length/2).equals(Buffer.from(hex,'hex'));
 switch(mime){
  case 'application/pdf':return /%PDF-\d\.\d/.test(bytes.subarray(0,1024).toString('latin1'))&&bytes.subarray(-8192).includes(Buffer.from('%%EOF'));
  case 'image/jpeg':return starts('ffd8ff');
  case 'image/png':return starts('89504e470d0a1a0a');
  case 'image/tiff':return starts('49492a00')||starts('4d4d002a');
  case 'image/webp':return bytes.length>=12&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  case 'application/msword':return starts('d0cf11e0a1b11ae1')&&bytes.includes(Buffer.from('WordDocument','utf16le'));
  case 'application/vnd.ms-excel':return starts('d0cf11e0a1b11ae1')&&(bytes.includes(Buffer.from('Workbook','utf16le'))||bytes.includes(Buffer.from('Book','utf16le')));
  case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':return officeZip(bytes,'word/document.xml');
  case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':return officeZip(bytes,'xl/workbook.xml');
  default:return false;
 }
}
function officeZip(bytes:Buffer,required:string):boolean{
 // Bounded central-directory walk. Never inflate potentially explosive content.
 if(bytes.length<22||bytes.readUInt32LE(0)!==0x04034b50)return false;
 let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break;}
 if(end<0||bytes.readUInt16LE(end+4)!==0||bytes.readUInt16LE(end+6)!==0)return false;
 const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),offset=bytes.readUInt32LE(end+16);
 if(count<2||count>10000||bytes.readUInt16LE(end+8)!==count||offset+size!==end)return false;
 const names=new Set<string>();let cursor=offset;
 for(let n=0;n<count;n++){
  if(cursor+46>end||bytes.readUInt32LE(cursor)!==0x02014b50||bytes.readUInt16LE(cursor+8)&1)return false;
  const nameSize=bytes.readUInt16LE(cursor+28),extra=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32),local=bytes.readUInt32LE(cursor+42);
  if(cursor+46+nameSize+extra+comment>end||local+30>offset||bytes.readUInt32LE(local)!==0x04034b50)return false;
  const name=bytes.subarray(cursor+46,cursor+46+nameSize).toString('utf8');
  if(names.has(name)||name.startsWith('/')||name.includes('\\')||name.split('/').includes('..')||/vbaProject\.bin$/i.test(name))return false;
  names.add(name);cursor+=46+nameSize+extra+comment;
 }
 return cursor===end&&names.has('[Content_Types].xml')&&names.has(required);
}
export async function verifyDmsBlob(blob:Blob,source:{name:string;mime:string;size:number;sha256:string|null}){
 const mime=effectiveDmsMime(source.name,source.mime);
 if(!mime||!Number.isSafeInteger(source.size)||source.size<1||source.size>BATCH_MAX_BYTES||blob.size!==source.size)throw Error('Upload size or file type does not match its metadata.');
 const bytes=Buffer.from(await blob.arrayBuffer());
 if(!matchesDmsSignature(bytes,mime))throw Error('The actual file format does not match the selected file type.');
 const sha256=createHash('sha256').update(bytes).digest('hex');
 if(source.sha256!==null&&source.sha256.toLowerCase()!==sha256)throw Error('The uploaded bytes do not match the original file fingerprint.');
 await validateDmsDocument(bytes,mime);
 return {sha256,size:bytes.length,mime};
}

/** Count the response before accumulating it; never build an unbounded SDK Blob.
 * A single deadline covers transfer and reads. Cancellation is best effort and
 * cannot delay returning the timeout to the caller. */
export async function readBoundedDmsObject(storage:ReturnType<SupabaseClient['storage']['from']>,path:string,size:number){
 if(!Number.isSafeInteger(size)||size<1||size>BATCH_MAX_BYTES)throw Error('Invalid file size.');
 const controller=new AbortController();let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 let timer:ReturnType<typeof setTimeout>|undefined;
 const expired=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('File verification transfer timed out.'));},30000);});
 try{
  const transfer=Promise.resolve(storage.download(path,{}, {signal:controller.signal,cache:'no-store'}).asStream());
  void transfer.then(r=>{if(controller.signal.aborted&&r.data){try{void r.data.cancel().catch(()=>undefined);}catch{/* Already locked. */}}},()=>undefined);
  const result=await Promise.race([transfer,expired]);
  if(result.error||!result.data)throw Error('File transfer unavailable.');
  reader=result.data.getReader();const parts:Uint8Array<ArrayBuffer>[]=[];let count=0;
  for(;;){const item=await Promise.race([reader.read(),expired]);if(item.done)break;
   if(!(item.value instanceof Uint8Array))throw Error('Invalid file stream.');
   count+=item.value.byteLength;if(count>size||count>BATCH_MAX_BYTES)throw Error('File exceeds its admitted size.');parts.push(Uint8Array.from(item.value));
  }
  if(count!==size)throw Error('Incomplete file transfer.');
  return new Blob(parts);
 }finally{
  if(timer)clearTimeout(timer);controller.abort();
  if(reader){try{void reader.cancel().catch(()=>undefined);}catch{/* Do not wait for broken streams. */}try{reader.releaseLock();}catch{/* Pending reader. */}}
 }
}
