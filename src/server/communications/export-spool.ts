import "server-only";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createCipheriv,createDecipheriv,createHmac,randomBytes,randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { lstat,mkdir,open,readFile,readdir,realpath,statfs,unlink,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join,resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { CommunicationHttpError } from "./http";

export type SpoolLimits={root:string;slots:number;bytes:number;recoverySeconds:number};
const unavailable=()=>new CommunicationHttpError("temporarily_unavailable","Private export storage is unavailable.");
const layoutTag="algt-erp-export-spool-v1";
const spoolRoot=()=>process.platform==="win32" ? "C:/dev/.cache/erp-export-spool-v1" : join(tmpdir(),"algt-erp-export-spool-v1");
const part=/^sealed-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.bin$/;
export function exportSpoolLimits(env:Readonly<Record<string,string|undefined>>=process.env):SpoolLimits|null {
  const slots=Number(env.ERP_COMM_EXPORT_SPOOL_SLOTS),bytes=Number(env.ERP_COMM_EXPORT_SPOOL_BYTES);
  const recoverySeconds=Number(env.ERP_COMM_EXPORT_SPOOL_RECOVERY_SECONDS);
  if (!Number.isSafeInteger(recoverySeconds) || recoverySeconds<=0) return null;
  if (!Number.isSafeInteger(slots) || slots<1 || slots>16 || !Number.isSafeInteger(bytes) || bytes<1048576*slots || bytes>64*1024**3) return null;
  return {root:spoolRoot(),slots,bytes,recoverySeconds};
}
const enoent=(e:unknown)=>typeof e==="object" && e!==null && "code" in e && e.code==="ENOENT";
const exists=(e:unknown)=>typeof e==="object" && e!==null && "code" in e && e.code==="EEXIST";
const samePath=(a:string,b:string)=>process.platform==="win32" ? a.toLowerCase()===b.toLowerCase():a===b;
async function privatePath(path:string) {
  const st=await lstat(path);
  if (!st.isDirectory() || st.isSymbolicLink() || !samePath(await realpath(path),resolve(path))) throw unavailable();
  if (process.platform!=="win32" && ((st.mode&0o077)!==0 || st.uid!==process.getuid?.())) throw unavailable();
}
async function layout(config:SpoolLimits) {
  await mkdir(config.root,{recursive:true,mode:0o700});
  await privatePath(config.root);
  const name=join(config.root,"layout-v1"), content=[layoutTag,config.slots,config.bytes,config.recoverySeconds].join("\n");
  try { await writeFile(name,content,{flag:"wx",mode:0o600}); } catch(e) { if (!exists(e)) throw e; }
  const info=await lstat(name);
  if (!info.isFile() || info.isSymbolicLink() || info.size>256 || await readFile(name,"utf8")!==content) throw unavailable();
}

// Lock helpers use native OS advisory locks, never a mutable heartbeat or a PID comparison.
// The stdin pipe has only this process as writer. Its close releases the lock even after a crash.
async function takeLock(path:string) {
  try {const s=await lstat(path); if (!s.isFile() || s.isSymbolicLink()) throw unavailable();} catch(e){if(!enoent(e))throw e;}
  const windows=process.platform==="win32";
  const ps="$ErrorActionPreference='Stop'; try { $f=[IO.File]::Open($env:ALGT_EXPORT_SLOT_LOCK,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None) } catch [IO.IOException] { exit 73 }; try { [Console]::WriteLine('held'); [Console]::Out.Flush(); [void][Console]::In.ReadToEnd() } finally { $f.Dispose() }";
  const child:ChildProcessWithoutNullStreams=windows ?
    spawn("powershell.exe",["-NoProfile","-NonInteractive","-Command",ps],{windowsHide:true,env:{NODE_ENV:process.env.NODE_ENV,SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,TEMP:process.env.TEMP,TMP:process.env.TMP,ALGT_EXPORT_SLOT_LOCK:path},stdio:"pipe"}) :
    spawn("flock",["-n","-E","73",path,"/bin/sh","-c","printf 'held\\n'; cat >/dev/null"],{stdio:"pipe",env:{NODE_ENV:process.env.NODE_ENV,PATH:process.env.PATH}});
  child.stdin.on("error",()=>{});
  child.stderr.resume();
  const lost=new AbortController();
  const exited=new Promise<number|null>(resolveExit=>{
    child.once("error",()=>{lost.abort();resolveExit(null);});
    child.once("close",code=>{lost.abort();resolveExit(code);});
  });
  const held=await new Promise<boolean>((done,reject)=>{
    const timer=setTimeout(()=>{child.stdin.end();reject(unavailable());},5000);
    child.stdout.once("data",data=>{
      clearTimeout(timer);
      if (Buffer.from(data).toString("utf8").trim()!=="held") {child.stdin.end();reject(unavailable());return;}
      done(true);
    });
    void exited.then(code=>{clearTimeout(timer);if(code===73)done(false);else reject(unavailable());});
  });
  if (!held) return null;
  return {signal:lost.signal,release:async()=>{child.stdin.end();await exited;}};
}

async function clearSlot(dir:string) {
  // The exclusive OS token precedes every enumeration. Only generated regular files are removed.
  for (const entry of await readdir(dir,{withFileTypes:true})) {
    if (entry.name==="format-v1") continue;
    if (!entry.isFile() || !part.test(entry.name)) throw unavailable();
    await unlink(join(dir,entry.name));
  }
}
async function slotDirectory(config:SpoolLimits,index:number) {
  const dir=join(config.root,"slot-"+index);
  await mkdir(dir,{recursive:true,mode:0o700});
  await privatePath(dir);
  const marker=join(dir,"format-v1");
  try { await lstat(marker); } catch(e) {
    if (!enoent(e) || (await readdir(dir)).length) throw unavailable();
    await writeFile(marker,layoutTag,{flag:"wx",mode:0o600});
  }
  const s=await lstat(marker);
  if (!s.isFile() || s.isSymbolicLink() || s.size!==layoutTag.length || await readFile(marker,"utf8")!==layoutTag) throw unavailable();
  return dir;
}

const frameBytes=65536;
export type SealedPart={file:string;size:number};
function frameNonce(index:number) {
  const nonce=Buffer.alloc(12);nonce.writeUInt32BE(index,8);return nonce;
}
export async function acquireExportSpool(expiresAt:Date,config=exportSpoolLimits()) {
  if (!config || Date.now()>=expiresAt.getTime()) throw unavailable();
  await layout(config);
  for (let i=0;i<config.slots;i++) {
    const lock=await takeLock(join(config.root,"lock-"+i));
    if (!lock) continue;
    try {
      const dir=await slotDirectory(config,i);
      await clearSlot(dir);
      const fs=await statfs(dir);
      const cap=Math.floor(config.bytes/config.slots), block=Math.max(4096,fs.bsize);
      if (fs.bavail*fs.bsize<cap) throw unavailable();
      const key=randomBytes(32), abort=new AbortController();
      const lifetime=Math.min(120000,expiresAt.getTime()-Date.now());
      if(lifetime<=0)throw unavailable();
      const timer=setTimeout(()=>{abort.abort();key.fill(0);},lifetime);timer.unref();
      const signal=AbortSignal.any([lock.signal,abort.signal]);
      let charged=0,closed=false;
      const assertOpen=()=>{if(closed || signal.aborted || Date.now()>=expiresAt.getTime())throw unavailable();};
      const read=(p:SealedPart)=>{
        assertOpen();
        if (!part.test(p.file))throw unavailable();
        // Each frame authenticates before any of its plaintext goes to Gotenberg, ZIP or the recipient.
        return Readable.from((async function*(){
          const file=await open(join(dir,p.file),"r"), subkey=createHmac("sha256",key).update(p.file).digest();
          try {
            const expected=p.size+Math.ceil(p.size/frameBytes)*16;
            if ((await file.stat()).size!==expected) throw unavailable();
            let offset=0;
            for (let frame=0;offset<expected;frame++) {
              assertOpen();
              const n=Math.min(frameBytes+16,expected-offset),sealed=Buffer.allocUnsafe(n);
              for(let have=0;have<n;) {
                const {bytesRead}=await file.read(sealed,have,n-have,offset+have);
                if(!bytesRead)throw unavailable();have+=bytesRead;
              }
              const cipher=createDecipheriv("aes-256-gcm",subkey,frameNonce(frame));
              cipher.setAuthTag(sealed.subarray(-16));
              yield Buffer.concat([cipher.update(sealed.subarray(0,-16)),cipher.final()]);
              offset+=n;
            }
          } finally {subkey.fill(0);await file.close();}
        })(),{signal});
      };
      const save=async(source:Readable|Buffer)=>{
        assertOpen();
        const file="sealed-"+randomUUID()+".bin",subkey=createHmac("sha256",key).update(file).digest();
        let size=0,stored=0,allocated=0,index=0;
        charged+=block*2;
        if(charged>cap)throw new CommunicationHttpError("size_limit");
        const seal=(data:Buffer)=>{
          assertOpen();size+=data.length;stored+=data.length+16;
          const next=Math.ceil(stored/block)*block;charged+=next-allocated;allocated=next;
          if(charged>cap)throw new CommunicationHttpError("size_limit");
          const cipher=createCipheriv("aes-256-gcm",subkey,frameNonce(index++));
          return Buffer.concat([cipher.update(data),cipher.final(),cipher.getAuthTag()]);
        };
        async function* encrypted() {
          const buffer=Buffer.allocUnsafe(frameBytes);
          let used=0;
          try {
            const chunks=Buffer.isBuffer(source) ? [source] :
              typeof source[Symbol.asyncIterator]==="function" ? source : new Readable().wrap(source);
            for await(const chunk of chunks) {
              const data=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
              for(let at=0;at<data.length;) {
                const n=Math.min(frameBytes-used,data.length-at);
                data.copy(buffer,used,at,at+n);used+=n;at+=n;
                if(used===frameBytes){yield seal(buffer);used=0;}
              }
            }
            if(used)yield seal(buffer.subarray(0,used));
          } finally {buffer.fill(0);subkey.fill(0);}
        }
        await pipeline(Readable.from(encrypted()),createWriteStream(join(dir,file),{flags:"wx",mode:0o600}),{signal});
        return {file,size};
      };

      const close=async()=>{
        if(closed)return;
        closed=true;clearTimeout(timer);abort.abort();key.fill(0);
        try {if (!lock.signal.aborted) await clearSlot(dir);} finally {await lock.release();}
      };
      return {save,read,close,signal};
    } catch(e){await lock.release();throw e;}
  }
  throw unavailable();
}

/** Recover only inactive slots. Run once on startup with evidenced volume/restart funding, including when new exports are disabled. */
export async function recoverExportSpool(previous?:SpoolLimits) {
  // A previously funded cleanup survives disabling exports or changing environment limits.
  const root=previous?.root ?? spoolRoot();
  try{await privatePath(root);}catch(e){if(enoent(e))return;throw e;}
  const marker=join(root,"layout-v1");
  let raw:string;
  try {
    const st=await lstat(marker);
    if(!st.isFile() || st.isSymbolicLink() || st.size>256)throw unavailable();
    raw=await readFile(marker,"utf8");
  } catch(e){if(enoent(e))return;throw e;}
  const [version,slots,bytes,recovery,...rest]=raw.split("\n");
  if(version!==layoutTag || rest.length)throw unavailable();
  const recorded=exportSpoolLimits({ERP_COMM_EXPORT_SPOOL_SLOTS:slots,ERP_COMM_EXPORT_SPOOL_BYTES:bytes,ERP_COMM_EXPORT_SPOOL_RECOVERY_SECONDS:recovery});
  if(!recorded)throw unavailable();
  const config={...recorded,root};
  for(let i=0;i<config.slots;i++){
    const lock=await takeLock(join(config.root,"lock-"+i));
    if(!lock)continue;
    try {await clearSlot(await slotDirectory(config,i));} finally {await lock.release();}
  }
}
export type ExportSpool=Awaited<ReturnType<typeof acquireExportSpool>>;
