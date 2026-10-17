import 'server-only';
import {spawn} from 'node:child_process';
import path from 'node:path';

let active=0;
/** Resource boundary, not a security sandbox. Parse in a killable process with
 * no ERP credentials/environment, a bounded heap, finite deadline and concurrency.
 * Only static trusted parsers run; no document content is executed. */
export async function validateDmsDocument(bytes:Buffer,mime:string):Promise<void>{
 if(active>=2)throw Error('Document validation is busy. Retain the upload and retry.');
 active++;
 try{
  await new Promise<void>((resolve,reject)=>{
   const env:NodeJS.ProcessEnv={NODE_ENV:'production'};
   for(const key of ['SystemRoot','SYSTEMROOT','WINDIR','windir','TEMP','TMP'])if(process.env[key])env[key]=process.env[key];
   const child=spawn(process.execPath,['--max-old-space-size=384',path.resolve(process.cwd(),'tooling/dms/validate-intake.cjs'),mime],{env,windowsHide:true,stdio:['pipe','pipe','ignore']});
   let result='',finished=false;
   const finish=(error?:Error)=>{if(finished)return;finished=true;clearTimeout(timer);child.kill();if(error)reject(error);else resolve();};
   const timer=setTimeout(()=>finish(Error('Document parsing timed out. Retain the file for retry.')),10000);
   child.on('error',()=>finish(Error('Document parser is unavailable.')));
   child.stdout.on('data',(part:Buffer)=>{result+=part.toString();if(result.length>128)finish(Error('Invalid parser response.'));});
   child.on('close',code=>finish(code===0&&result==='F07_FORMAT_VALID\n'?undefined:Error('The document is malformed, encrypted or exceeds supported parser limits.')));
   child.stdin.on('error',()=>{/* close/error determines the outcome; no retry or success inference */});
   child.stdin.end(bytes);
  });
 }finally{active--;}
}
