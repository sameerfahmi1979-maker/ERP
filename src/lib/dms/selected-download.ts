export type DmsZipFile={id:number;name:string;size:number;folder?:string};
export const DMS_ZIP_MAX_FILES=50;
export const DMS_ZIP_MAX_BYTES=100*1024*1024;
const safeName=(name:string)=>{
 const clean=name.replace(/[\u0000-\u001f\u007f/\\<>:"|?*]/g,'_').replace(/^[. ]+|[. ]+$/g,'').slice(0,180)||'file';
 return /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(clean)?`_${clean}`:clean;
};
export function dmsZipEntryNames(files:DmsZipFile[]):string[]{
 const used=new Set<string>();
 return files.map(f=>{const folder=f.folder?`${safeName(f.folder)}/`:'';const name=safeName(f.name);let candidate=folder+name,n=1;
  const dot=name.lastIndexOf('.'),stem=dot>0?name.slice(0,dot):name,ext=dot>0?name.slice(dot):'';
  while(used.has(candidate.toLowerCase()))candidate=`${folder}${stem} (${++n})${ext}`;
  used.add(candidate.toLowerCase());return candidate;
 });
}
export async function buildDmsSelectedZip(files:DmsZipFile[],options:{signal:AbortSignal;isCurrent:()=>boolean;onProgress:(done:number,total:number)=>void;fetcher?:typeof fetch}):Promise<Blob>{
 if(!files.length||files.length>DMS_ZIP_MAX_FILES||new Set(files.map(f=>f.id)).size!==files.length||files.some(f=>!Number.isSafeInteger(f.id)||f.id<1||!Number.isSafeInteger(f.size)||f.size<1||f.size>50*1024*1024)||files.reduce((sum,f)=>sum+f.size,0)>DMS_ZIP_MAX_BYTES)throw Error('Select up to 50 files, at most 50 MB per file and 100 MB in total.');
 const current=()=>{if(options.signal.aborted||!options.isCurrent())throw Error('Download cancelled because the account or access changed.');};
 const {default:JSZip}=await import('jszip');current();const zip=new JSZip(),names=dmsZipEntryNames(files);let total=0;
 for(let i=0;i<files.length;i++){
  current();const file=files[i];
  const response=await (options.fetcher??fetch)(`/api/dms/file?fileId=${file.id}&disposition=attachment`,{credentials:'same-origin',cache:'no-store',signal:options.signal});
  current();if(!response.ok)throw Error(`File ${i+1} could not be downloaded with current access. No ZIP was created.`);
  const disposition=response.headers.get('content-disposition')??'';
  const encoded=disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if(!/^attachment(?:;|$)/i.test(disposition)||!encoded)throw Error('The protected download response was unavailable. No ZIP was created.');
  let servedName:string;try{servedName=decodeURIComponent(encoded);}catch{throw Error('The download filename could not be verified.');}
  if(servedName!==file.name.replace(/[\r\n\u0000-\u001f\u007f]/g,'_'))throw Error(`File ${i+1} was renamed. Refresh the selection before downloading.`);
  const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)!==file.size))throw Error(`File ${i+1} changed. Refresh the selection before downloading.`);
  if(!response.body)throw Error('The file response was unavailable. No ZIP was created.');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){current();const part=await reader.read();current();if(part.done)break;size+=part.value.byteLength;total+=part.value.byteLength;
   if(size>file.size||total>DMS_ZIP_MAX_BYTES)throw Error('Download size changed or exceeded the ZIP limit. No ZIP was created.');chunks.push(part.value);
  }}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
  if(size!==file.size)throw Error(`File ${i+1} was incomplete. No ZIP was created.`);
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  zip.file(names[i],bytes,{date:new Date('2000-01-01T00:00:00Z')});options.onProgress(i+1,files.length);
 }
 current();const bytes=await zip.generateAsync({type:'uint8array',compression:'STORE'},current);current();
 return new Blob([new Uint8Array(bytes)],{type:'application/zip'});
}
