import { afterEach,beforeEach,describe,expect,it } from "vitest";
import { mkdir,mkdtemp,readFile,readdir,rm,writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { acquireExportSpool,recoverExportSpool,type SpoolLimits } from "../export-spool";

let root:string, config:SpoolLimits;
beforeEach(async()=>{
  const base=process.platform==="win32"?"C:/dev/.cache":tmpdir();
  await mkdir(base,{recursive:true});
  root=await mkdtemp(join(base,"a08-export-slot-test-"));config={root,slots:2,bytes:4*1024*1024,recoverySeconds:30};
});
afterEach(async()=>{await rm(root,{recursive:true,force:true,maxRetries:4});});
const time=()=>new Date(Date.now()+60000);

describe("encrypted filesystem export staging",()=>{
  it("keeps originals, transcript and ZIP unreadable on disk and respects live OS locks during concurrent recovery",async()=>{
    const active=await acquireExportSpool(time(),config);
    try {
      const secret="sensitive retained conversation "+randomUUID();
      const part=await active.save(Buffer.from(secret));
      const raw=await readFile(join(root,"slot-0",part.file));
      expect(raw.includes(Buffer.from(secret))).toBe(false);
      const second=await acquireExportSpool(time(),config);
      try{await expect(acquireExportSpool(time(),config)).rejects.toMatchObject({status:503});}
      finally{await second.close();}
      // Recreate an inactive slot's crash residue, using real ciphertext from the running writer.
      const stale="sealed-"+randomUUID()+".bin";
      await writeFile(join(root,"slot-1",stale),raw);
      await recoverExportSpool(config);
      expect(await readdir(join(root,"slot-1"))).toEqual(["format-v1"]);
      expect(await readFile(join(root,"slot-0",part.file))).toEqual(raw);
      const plaintext=[];
      for await(const chunk of active.read(part))plaintext.push(chunk);
      expect(Buffer.concat(plaintext).toString()).toBe(secret);
      raw[0]^=1;
      await writeFile(join(root,"slot-0",part.file),raw);
      const leaked:Buffer[]=[];
      await expect((async()=>{for await(const chunk of active.read(part))leaked.push(chunk);})()).rejects.toThrow();
      expect(leaked).toHaveLength(0);
    } finally {await active.close();}
  },30000);
  it("recovers a real abruptly terminated writer using the native lock and the recorded slot",async()=>{
    // The child executes the same spool source. Only the framework server marker and error class are replaced.
    const fixture=`
      const fs=require("node:fs"), path=require("node:path"), Module=require("node:module"), ts=require("typescript");
      const name=path.resolve("src/server/communications/export-spool.ts"), m=new Module(name,module);
      const native=m.require.bind(m);
      m.require=id=>id==="server-only"?{}:id==="./http"?{CommunicationHttpError:Error}:native(id);
      m._compile(ts.transpileModule(fs.readFileSync(name,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,name);
      (async()=>{const spool=await m.exports.acquireExportSpool(new Date(Date.now()+60000),JSON.parse(process.argv[1]));
        const p=await spool.save(Buffer.from("real crash secret"));process.send({part:p.file});
        setInterval(()=>{},60000);
      })().catch(()=>process.exit(3));`;
    const child=spawn(process.execPath,["-e",fixture,JSON.stringify(config)],{stdio:["ignore","ignore","ignore","ipc"],windowsHide:true});
    const exit=once(child,"exit");
    try {
      const [message]=await Promise.race([once(child,"message"),exit.then(()=>{throw Error("Writer stopped early");})]);
      const file=(message as {part:string}).part;
      expect((await readFile(join(root,"slot-0",file))).includes(Buffer.from("real crash secret"))).toBe(false);
      await recoverExportSpool(config);
      expect(await readdir(join(root,"slot-0"))).toContain(file);
      child.kill("SIGKILL");await exit;
      await recoverExportSpool(config);
      expect(await readdir(join(root,"slot-0"))).toEqual(["format-v1"]);
    } finally {if(child.exitCode===null && child.signalCode===null)child.kill("SIGKILL");}
  },30000);
  it("bounds charged allocation before writing and rejects unexpected files or changed deployment layout",async()=>{
    const slot=await acquireExportSpool(time(),config);
    try{await expect(slot.save(Buffer.alloc(3*1024*1024))).rejects.toMatchObject({status:413});}
    finally{await slot.close();}
    await writeFile(join(root,"slot-0","unrelated.txt"),"preserve");
    await expect(recoverExportSpool(config)).rejects.toMatchObject({status:503});
    expect(await readFile(join(root,"slot-0","unrelated.txt"),"utf8")).toBe("preserve");
    await expect(acquireExportSpool(time(),{...config,slots:3})).rejects.toMatchObject({status:503});
  },20000);
});
