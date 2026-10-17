'use strict';
// Trusted parser subprocess. No credential inheritance, provider calls, document
// execution, rendering, macros or external relationships. This is validation,
// not a malware scanner or a complete Office/PDF conformance certification.
const {inflateRawSync}=require('node:zlib');
const MAX=52428800,EXPANDED=134217728,MEMBER=16777216;
function requireValid(ok){if(!ok)throw Error('Invalid or unsupported document structure');}
function crc32(b){let c=0xffffffff;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function decodeXml(b){
 const encoding=b.length>=2&&(b[0]===0xff&&b[1]===0xfe||b[0]===0x3c&&b[1]===0)?'utf-16le':b.length>=2&&(b[0]===0xfe&&b[1]===0xff||b[0]===0&&b[1]===0x3c)?'utf-16be':'utf-8';
 return new TextDecoder(encoding,{fatal:true}).decode(b);
}
function xml(b,expected){
 const {SaxesParser}=require('saxes');
 const p=new SaxesParser({xmlns:true});let root;let nodes=0;
 p.on('error',()=>{throw Error('Malformed XML');});p.on('doctype',()=>{throw Error('DTD not accepted');});
 p.on('opentag',n=>{if(!root)root=n;if(++nodes>1000000)throw Error('XML complexity limit');});
 p.write(decodeXml(b)).close();
 requireValid(root&&(!expected||root.local===expected));
}
function officeZip(b,required){
 requireValid(b.length>=22&&b.readUInt32LE(0)===0x04034b50);let end=-1;
 for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(b.readUInt32LE(i)===0x06054b50&&i+22+b.readUInt16LE(i+20)===b.length){end=i;break;}
 requireValid(end>=0&&b.readUInt16LE(end+4)===0&&b.readUInt16LE(end+6)===0);
 const count=b.readUInt16LE(end+10),offset=b.readUInt32LE(end+16),size=b.readUInt32LE(end+12);
 requireValid(count>=2&&count<=10000&&b.readUInt16LE(end+8)===count&&offset+size===end);
 let cursor=offset,total=0;const files=new Map(),ranges=[];
 for(let n=0;n<count;n++){
  requireValid(cursor+46<=end&&b.readUInt32LE(cursor)===0x02014b50);
  const flags=b.readUInt16LE(cursor+8),method=b.readUInt16LE(cursor+10),crc=b.readUInt32LE(cursor+16),compressed=b.readUInt32LE(cursor+20),expanded=b.readUInt32LE(cursor+24),ns=b.readUInt16LE(cursor+28),extra=b.readUInt16LE(cursor+30),comment=b.readUInt16LE(cursor+32),local=b.readUInt32LE(cursor+42);
  requireValid(!(flags&1)&&[0,8].includes(method)&&cursor+46+ns+extra+comment<=end&&local+30<=offset&&b.readUInt32LE(local)===0x04034b50);
  const raw=b.subarray(cursor+46,cursor+46+ns),name=new TextDecoder('utf-8',{fatal:true}).decode(raw),start=local+30+b.readUInt16LE(local+26)+b.readUInt16LE(local+28);
  requireValid(name.length>0&&!files.has(name)&&!name.startsWith('/')&&!name.includes('\\')&&!name.includes('\0')&&!name.split('/').includes('..')&&!/(?:vbaProject\.bin|ActiveX|embeddings\/)/i.test(name));
  requireValid(start+compressed<=offset&&start>=local+30&&b.readUInt16LE(local+8)===method&&b.readUInt16LE(local+6)===flags&&b.readUInt16LE(local+26)===ns&&b.subarray(local+30,local+30+ns).equals(raw));
  requireValid(expanded<=MEMBER&&(total+=expanded)<=EXPANDED&&expanded<=Math.max(1048576,compressed*200));
  ranges.push([local,start+compressed]);const packed=b.subarray(start,start+compressed);
  const data=method===0?packed:inflateRawSync(packed,{maxOutputLength:MEMBER});
  requireValid(data.length===expanded&&crc32(data)===crc);
  files.set(name,data);
  if(/\.(?:xml|rels)$/i.test(name))xml(data,name==='[Content_Types].xml'?'Types':name===required?(required.startsWith('word/')?'document':'workbook'):null);
  cursor+=46+ns+extra+comment;
 }
 ranges.sort((a,b)=>a[0]-b[0]);requireValid(ranges.every((r,i)=>!i||r[0]>=ranges[i-1][1]));
 requireValid(cursor===end&&files.has('[Content_Types].xml')&&files.has(required));
 return files;
}
function compound(b){
 const {CFB}=require('xlsx');const c=CFB.read(b,{type:'buffer'});
 requireValid(c&&Array.isArray(c.FileIndex)&&c.FileIndex.length<=10000);let total=0;
 for(const f of c.FileIndex){requireValid((total+=f.content?.length??0)<=EXPANDED);requireValid(!/(?:VBA|_VBA_PROJECT|Macros)/i.test(f.name));}
 return c;
}
function wordBinary(b){
 const c=compound(b),find=name=>c.FileIndex.find(f=>f.name===name)?.content;
 const raw=find('WordDocument');requireValid(raw&&raw.length>=154);const w=Buffer.from(raw);
 requireValid(w.readUInt16LE(0)===0xa5ec&&[0xc1,0xd9,0x101,0x10c,0x112].includes(w.readUInt16LE(2)));
 const flags=w.readUInt16LE(10);requireValid(!(flags&0x8100));const rawTable=find(flags&0x200?'1Table':'0Table');requireValid(rawTable);const table=Buffer.from(rawTable);
 let pos=32;const csw=w.readUInt16LE(pos);requireValid(csw===14);pos+=2+csw*2;requireValid(pos+2<=w.length);
 const cslw=w.readUInt16LE(pos);requireValid(cslw===22);pos+=2+cslw*4;requireValid(pos+2<=w.length);
 const count=w.readUInt16LE(pos);pos+=2;requireValid(count>=93&&count<=183&&pos+count*8<=w.length);
 for(let i=0;i<count;i++){const fc=w.readUInt32LE(pos+i*8),lcb=w.readUInt32LE(pos+i*8+4);requireValid(!lcb||fc+lcb<=table.length);}
 // CLX is the document's piece table, not a string merely named WordDocument.
 const fc=w.readUInt32LE(pos+33*8),lcb=w.readUInt32LE(pos+33*8+4);requireValid(lcb>=5&&fc+lcb<=table.length);
 let cp=fc;while(table[cp]===1){requireValid(cp+3<=fc+lcb);cp+=3+table.readUInt16LE(cp+1);}
 requireValid(table[cp]===2&&cp+5<=fc+lcb);const length=table.readUInt32LE(cp+1);
 requireValid(length>=4&&(length-4)%12===0&&cp+5+length<=fc+lcb);
 const pieces=(length-4)/12;requireValid(pieces<=1000000);let previous=-1;
 for(let i=0;i<=pieces;i++){const at=table.readUInt32LE(cp+5+i*4);requireValid(at>=previous);previous=at;}
 const pcd=cp+5+(pieces+1)*4;
 for(let i=0;i<pieces;i++){const a=table.readUInt32LE(cp+5+i*4),z=table.readUInt32LE(cp+5+(i+1)*4),loc=table.readUInt32LE(pcd+i*8+2),compressed=!!(loc&0x40000000),start=(loc&0x3fffffff)/(compressed?2:1);requireValid(Number.isInteger(start)&&start+(z-a)*(compressed?1:2)<=w.length);}
}
async function validate(b,mime){
 requireValid(b.length>0&&b.length<=MAX);
 if(mime==='application/pdf'){
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=pdfjs.getDocument({data:new Uint8Array(b),verbosity:0,isEvalSupported:false,useSystemFonts:false,useWorkerFetch:false,useWasm:false,disableFontFace:true,enableXfa:false,stopAtErrors:true,maxImageSize:40000000});
  try{const d=await task.promise;requireValid(d.numPages>0&&d.numPages<=1000);for(let i=1;i<=d.numPages;i++){const p=await d.getPage(i);await p.getOperatorList();await p.getTextContent();p.cleanup();}}finally{await task.destroy();}
 }else if(mime.startsWith('image/')){
  const sharp=require('sharp');sharp.cache(false);sharp.concurrency(1);
  const image=sharp(b,{animated:true,limitInputPixels:40000000,failOn:'warning'}),m=await image.metadata();
  requireValid(m.width>0&&m.height>0&&(m.pages??1)<=16);await image.stats();
 }else if(mime==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'){
  const files=officeZip(b,'word/document.xml');
  // Reuse the bounded, CRC-checked entries. Mammoth's default ZIP adapter forces
  // XML to UTF-8; this read-only adapter also supports valid UTF-16 Office XML.
  await require('mammoth').extractRawText({file:{exists:name=>files.has(name),read:async(name,encoding)=>{const data=files.get(name);requireValid(data);return encoding?decodeXml(data):data;}}});
 }else if(mime==='application/msword'){wordBinary(b);
 }else if(['application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(mime)){
  if(mime==='application/vnd.ms-excel')compound(b);else officeZip(b,'xl/workbook.xml');
  const x=require('xlsx'),book=x.read(b,{type:'buffer',WTF:true,bookVBA:true});
  requireValid(!book.vbaraw&&book.SheetNames.length>0&&book.SheetNames.length<=1000);
  let cells=0;for(const name of book.SheetNames){const s=book.Sheets[name];requireValid(s);for(const key of Object.keys(s))if(!key.startsWith('!'))requireValid(++cells<=1000000);}
 }else throw Error('Unsupported parser');
}
async function main(){
 const mime=process.argv[2];requireValid(typeof mime==='string'&&mime.length<150);
 const parts=[];let n=0;for await(const part of process.stdin){n+=part.length;requireValid(n<=MAX);parts.push(part);}
 await validate(Buffer.concat(parts),mime);process.stdout.write('F07_FORMAT_VALID\n');
}
if(require.main===module)main().catch(()=>{process.stderr.write('File parsing rejected or exceeded supported limits.\n');process.exitCode=1;});
module.exports={officeZip,wordBinary,validate};
