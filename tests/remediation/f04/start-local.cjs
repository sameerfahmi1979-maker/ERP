'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),net=require('node:net');
const g=require('../f00/target-guard.cjs'),db=require('../f00/local-db.cjs');
const dir=path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F04');
const output=process.argv[2]==='--closure'?'closure-20260928':process.argv[2]==='--acceptance'?'acceptance-20260928':process.argv[2]==='--complex'?'complex-adapters-20260928':'continuation-20260928';
if(process.argv.slice(2).some(arg=>!['--complex','--acceptance','--closure'].includes(arg)))throw Error('Invalid evidence folder argument');
(async()=>{
 db.assertDatabase();const b=JSON.parse(fs.readFileSync(path.join(dir,'BUILD_RESULT.json')));
 if(b.exit_code!==0||!path.resolve(b.target).startsWith(dir+path.sep))throw Error('Invalid local build');
 const env=JSON.parse(fs.readFileSync(path.join(dir,'private/build-env.json')));
 g.assertLocalUrl(env.NEXT_PUBLIC_SUPABASE_URL,g.PORTS.api);g.assertLocalUrl(env.NEXT_PUBLIC_SITE_URL,16404);
 await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(16404,'127.0.0.1',()=>s.close(resolve));});
 const log=fs.openSync(path.join(dir,'private/browser-runtime.log'),'a');
 const child=cp.spawn(process.execPath,[path.resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','16404'],{cwd:b.target,env,windowsHide:true,detached:true,stdio:['ignore',log,log]});
 const receiptPath=path.join(dir,output,'APP_PROCESS.json');
 if(fs.existsSync(receiptPath)){const previous=JSON.parse(fs.readFileSync(receiptPath));fs.copyFileSync(receiptPath,path.join(dir,output,'APP_PROCESS.'+Number(previous.pid)+'.json'));}
 fs.writeFileSync(receiptPath,JSON.stringify({pid:child.pid,target:b.target,port:16404,at:new Date().toISOString()},null,2));child.unref();fs.closeSync(log);
 console.log(JSON.stringify({pid:child.pid,port:16404,local_only:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
