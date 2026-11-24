import "server-only";
import { inflateRawSync } from "node:zlib";
import { SaxesParser } from "saxes";
import { MAX_CHAT_FILE_BYTES } from "./contracts";
import { CommunicationHttpError } from "./http";

const office = {
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "word/document.xml", "wordprocessingml.document.main+xml"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xl/workbook.xml", "spreadsheetml.sheet.main+xml"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "ppt/presentation.xml", "presentationml.presentation.main+xml"],
} as const;

function officePackage(b: Buffer, entry: string, contentType: string): boolean {
  // Read only central metadata and the bounded content-types manifest. Never unpack user files.
  const eocd = b.lastIndexOf(Buffer.from("504b0506","hex"));
  if (eocd < 0 || eocd + 22 > b.length || eocd + 22 + b.readUInt16LE(eocd+20) !== b.length ||
      b.readUInt32LE(eocd+4) !== 0 || b.readUInt16LE(eocd+8) !== b.readUInt16LE(eocd+10)) return false;
  const entries = b.readUInt16LE(eocd + 10);
  let offset = b.readUInt32LE(eocd + 16), manifest = "", total = 0;
  const names = new Set<string>();
  if (!entries || entries > 10000 || offset+b.readUInt32LE(eocd+12) !== eocd) return false;
  for (let i=0; i<entries; i++) {
    if (offset+46 > eocd || b.readUInt32LE(offset) !== 0x02014b50) return false;
    const n = b.readUInt16LE(offset+28), extra = b.readUInt16LE(offset+30), comment = b.readUInt16LE(offset+32);
    const name = b.toString("utf8", offset+46, offset+46+n);
    const compressed = b.readUInt32LE(offset+20), size = b.readUInt32LE(offset+24), local = b.readUInt32LE(offset+42);
    const method = b.readUInt16LE(offset+10);
    total += size;
    if (names.has(name) || /(^\/|\\|(?:^|\/)\.\.(?:\/|$)|\u0000)/.test(name) || /vbaProject\.bin$/i.test(name) ||
        (b.readUInt16LE(offset+8)&1) || ![0,8].includes(method) || total > 512*1024*1024 ||
        local+30 > offset || b.readUInt32LE(local) !== 0x04034b50) return false;
    names.add(name);
    const localNameEnd = local+30+b.readUInt16LE(local+26);
    const start = localNameEnd+b.readUInt16LE(local+28);
    if (b.toString("utf8",local+30,localNameEnd)!==name || start+compressed>offset || b.readUInt16LE(local+8)!==method) return false;
    if (name === "[Content_Types].xml") {
      if (!size || size > 262144 || compressed > 262144) return false;
      const data = b.subarray(start,start+compressed);
      const xml = method===8 ? inflateRawSync(data,{maxOutputLength:262144}) : data;
      if (xml.length !== size) return false;
      manifest = xml.toString("utf8");
    }
    offset += 46+n+extra+comment;
  }
  if (offset!==eocd || !names.has(entry) || !names.has("_rels/.rels") || !manifest || /macroEnabled|vbaProject/i.test(manifest)) return false;
  let correct=false, root=false, depth=0;
  const xml=new SaxesParser({xmlns:true});
  xml.on("doctype",()=>{throw new Error("Unexpected document type");});
  xml.on("opentag",tag=>{
    depth++;
    if (depth===1) root=tag.local==="Types" && tag.uri==="http://schemas.openxmlformats.org/package/2006/content-types";
    if (root && depth===2 && tag.local==="Override" && tag.uri==="http://schemas.openxmlformats.org/package/2006/content-types" &&
        tag.attributes.PartName?.value==="/"+entry && tag.attributes.ContentType?.value==="application/vnd.openxmlformats-officedocument."+contentType)
      correct=true;
  });
  xml.on("closetag",()=>{depth--;});
  xml.write(manifest).close();
  return correct;
}

function oleStreams(b: Buffer): Set<string> {
  const names = new Set<string>();
  if (!b.subarray(0,8).equals(Buffer.from("d0cf11e0a1b11ae1","hex")) || b.length < 512 ||
      b.readUInt16LE(28)!==0xfffe) return names;
  const shift = b.readUInt16LE(30);
  if (shift!==9 && shift!==12) return names;
  const sector = 2**shift, sectors = Math.floor(b.length/sector)-1;
  const fat: number[] = [];
  const extra = b.readUInt32LE(72), fatCount = b.readUInt32LE(44);
  if (fatCount > sectors || extra > sectors) return names;
  const indexTable = (at: number, count: number) => {
    for (let i=0; i<count && fat.length<fatCount; i++) {
      const value = b.readUInt32LE(at+4*i);
      if (value >= sectors) return false;
      fat.push(value);
    }
    return true;
  };
  if (!indexTable(76,109)) return names;
  let difat = b.readUInt32LE(68);
  for (let i=0; i<extra && fat.length<fatCount; i++) {
    if (difat>=sectors || !indexTable((difat+1)*sector, sector/4-1)) return names;
    difat = b.readUInt32LE((difat+2)*sector-4);
  }
  if (fat.length!==fatCount) return names;
  const seen = new Set<number>();
  let directory = b.readUInt32LE(48);
  while (directory!==0xfffffffe) {
    if (directory>=sectors || seen.has(directory) || seen.size>=8192) return new Set();
    seen.add(directory);
    const start = (directory+1)*sector;
    for (let pos=start; pos<start+sector; pos+=128) {
      const len = b.readUInt16LE(pos+64);
      if (b[pos+66]===2 && len>=4 && len<=64 && len%2===0)
        names.add(b.toString("utf16le",pos,pos+len-2));
    }
    const fatSector = fat[Math.floor(directory/(sector/4))];
    if (fatSector===undefined) return new Set();
    directory = b.readUInt32LE((fatSector+1)*sector+(directory%(sector/4))*4);
  }
  return names;
}

function mp4Tracks(bytes: Buffer) {
  const types = new Set<string>();
  let boxes = 0, media = false, brand = false;
  function visit(start: number,end: number,parents: string) {
    for (let p=start;p<end;) {
      if (++boxes>100000 || p+8>end) return false;
      let n=bytes.readUInt32BE(p), header=8;
      if (n===1) {
        if (p+16>end) return false;
        n=Number(bytes.readBigUInt64BE(p+8)); header=16;
      } else if (n===0) n=end-p;
      if (!Number.isSafeInteger(n) || n<header || p+n>end) return false;
      const kind=bytes.toString("ascii",p+4,p+8);
      if (parents==="" && kind==="ftyp" && n>=16) brand=true;
      if (parents==="" && kind==="mdat" && n>header) media=true;
      if (parents==="moov/trak/mdia/" && kind==="hdlr" && n>=header+12)
        types.add(bytes.toString("ascii",p+header+8,p+header+12));
      if ((parents==="" && kind==="moov") || (parents==="moov/" && kind==="trak") || (parents==="moov/trak/" && kind==="mdia"))
        if (!visit(p+header,p+n,parents+kind+"/")) return false;
      p+=n;
    }
    return true;
  }
  return visit(0,bytes.length,"") && brand && media ? types : new Set<string>();
}

function webmType(b: Buffer) {
  let header=false, tracks=false, frames=false, video=false, audio=false, count=0;
  function vint(pos: number, limit: number, identifier=false) {
    if (pos>=limit || b[pos]===0) return null;
    let width=1, marker=128;
    while (!(b[pos]&marker)) { width++; marker>>=1; }
    if (width>(identifier?4:8) || pos+width>limit) return null;
    let value=identifier ? b[pos] : b[pos]&(marker-1);
    let unknown=!identifier && value===marker-1;
    for (let i=1;i<width;i++) { value=value*256+b[pos+i]; unknown=unknown && b[pos+i]===255; }
    return {width,value,unknown};
  }
  function visit(start:number,end:number,parent:number,depth:number):boolean {
    if (depth>8) return false;
    for (let p=start;p<end;) {
      const field=vint(p,end,true);
      if (!field || ++count>100000) return false;
      const size=vint(p+field.width,end);
      if (!size) return false;
      const key=field.value, body=p+field.width+size.width;
      if (size.unknown && key!==0x18538067 && key!==0x1f43b675) return false;
      const next=size.unknown ? end : body+size.value;
      if (!Number.isSafeInteger(next) || next>end || next<body) return false;
      if (parent===0x1a45dfa3 && key===0x4282) header=b.toString("ascii",body,next)==="webm";
      if (parent===0x1654ae6b && key===0xae) tracks=true;
      if (parent===0xae && key===0x86) {
        const codec=b.toString("ascii",body,next);
        if (["V_VP8","V_VP9","V_AV1"].includes(codec)) video=true;
        if (["A_OPUS","A_VORBIS"].includes(codec)) audio=true;
      }
      if ((parent===0x1f43b675 && key===0xa3 || parent===0xa0 && key===0xa1) && next-body>4) frames=true;
      if ([0x1a45dfa3,0x18538067,0x1654ae6b,0xae,0x1f43b675,0xa0].includes(key) && !visit(body,next,key,depth+1)) return false;
      p=next;
    }
    return true;
  }
  if (!visit(0,b.length,0,0) || !header || !tracks || !frames) return;
  if (video) return "video/webm";
  if (audio) return "audio/webm";
}

function wav(b: Buffer) {
  if (b.length<44 || b.readUInt32LE(4)+8!==b.length) return false;
  let format=false,data=false;
  for (let pos=12;pos<b.length;) {
    if (pos+8>b.length) return false;
    const chunk=b.toString("ascii",pos,pos+4),length=b.readUInt32LE(pos+4);
    if (pos+8+length>b.length) return false;
    if (chunk==="fmt " && length>=16 && b.readUInt16LE(pos+10)>0 && b.readUInt32LE(pos+12)>0) format=true;
    if (chunk==="data" && length>0) data=true;
    pos+=8+length+(length%2);
  }
  return format && data;
}

function adts(b: Buffer) {
  if (b.length<=7) return false;
  for (let p=0;p<b.length;) {
    if (p+7>b.length || b[p]!==255 || (b[p+1]&0xf6)!==0xf0 || ((b[p+2]>>2)&15)>12) return false;
    const n=((b[p+3]&3)<<11) | (b[p+4]<<3) | (b[p+5]>>5);
    if (n<=((b[p+1]&1)?7:9) || p+n>b.length) return false;
    p+=n;
  }
  return true;
}

function signedMedia(b: Buffer, ext: string): string | undefined {
  const prefix = (s: string, at=0) => b.subarray(at,at+s.length).equals(Buffer.from(s,"latin1"));
  if (ext==="pdf" && /^%PDF-(?:1\.\d|2\.0)/.test(b.toString("ascii",0,8))) {
    const xref=/startxref\s+(\d+)\s+%%EOF\s*$/.exec(b.toString("latin1",Math.max(0,b.length-4096)));
    if (xref) {
      const at=Number(xref[1]);
      if (at>=8 && at<b.length && /^(?:xref\b|\d+\s+\d+\s+obj\b[\s\S]{0,2048}?\/Type\s*\/XRef\b)/.test(b.toString("latin1",at,at+2400))) return "application/pdf";
    }
  }
  if ((ext==="jpg" || ext==="jpeg") && b.length>12 && b[0]===255 && b[1]===216 && b[2]===255 && b.readUInt16BE(b.length-2)===0xffd9) return "image/jpeg";
  if (ext==="png" && b.length>=45 && b.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a","hex")) && prefix("IHDR",12) && prefix("IEND",b.length-8)) return "image/png";
  if (ext==="webp" && b.length>=30 && prefix("RIFF") && b.readUInt32LE(4)+8===b.length && prefix("WEBP",8) && /^(VP8 |VP8L|VP8X)$/.test(b.toString("ascii",12,16))) return "image/webp";
  if (ext==="wav" && prefix("RIFF") && prefix("WAVE",8) && wav(b)) return "audio/wav";
  if ((ext==="ogg" || ext==="opus") && prefix("OggS") && b[4]===0 && b.length>27 && (prefix("OpusHead",27+b[26]) || prefix("\x01vorbis",27+b[26]))) return "audio/ogg";
  if (ext==="aac" && adts(b)) return "audio/aac";
  if (ext==="mp3") {
    let p=0;
    if (prefix("ID3") && b.length>=10 && b.subarray(6,10).every(n=>n<128)) p=10+b.subarray(6,10).reduce((n,v)=>n*128+v,0)+(b[5]&16?10:0);
    if (p+4<b.length && b[p]===255 && (b[p+1]&0xe6)===0xe2 && (b[p+2]>>4)!==15 && (b[p+2]&12)!==12) return "audio/mpeg";
  }
  if (ext==="m4a" || ext==="mp4" || ext==="m4v") {
    const tracks=mp4Tracks(b);
    if (tracks.has("vide") && ext!=="m4a") return "video/mp4";
    if (tracks.has("soun") && !tracks.has("vide") && ext!=="m4v") return "audio/mp4";
  }
  if (ext==="webm" && b.length>40 && b.readUInt32BE(0)===0x1a45dfa3) return webmType(b);
  if (Object.hasOwn(office,ext)) {
    const [mime,entry,type]=office[ext as keyof typeof office];
    if (officePackage(b,entry,type)) return mime;
  }
  if (["doc","xls","ppt"].includes(ext)) {
    const streams=oleStreams(b);
    if (ext==="doc" && streams.has("WordDocument")) return "application/msword";
    if (ext==="xls" && (streams.has("Workbook") || streams.has("Book"))) return "application/vnd.ms-excel";
    if (ext==="ppt" && streams.has("PowerPoint Document")) return "application/vnd.ms-powerpoint";
  }
  return undefined;
}

export function verifiedMediaType(bytes: Buffer, filename: string, declared: string) {
  if (bytes.length>MAX_CHAT_FILE_BYTES) throw new CommunicationHttpError("size_limit");
  let actual: string | undefined;
  try { actual=signedMedia(bytes, filename.split(".").pop()?.toLowerCase() ?? ""); }
  catch { /* Malformed binary structure. */ }
  if (!bytes.length || !actual || actual!==declared) throw new CommunicationHttpError("invalid_request");
  return actual;
}
