// Offline only: execute just the exact registration adapters extracted from the
// two drivers. Never import a local suite, DB helper, application or Auth client.
import {beforeAll as rawBeforeAll,describe,expect,it as rawIt} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

for(const file of ['party-service-assignment-atomic.local.test.ts','party-finance-lock-authority.local.test.ts']){
 describe(file+' registration adapter',()=>{
  const source=fs.readFileSync(path.resolve('tests/remediation/f06',file),'utf8');
  const start=source.indexOf('// BEGIN W38 OFFLINE-VERIFIED REGISTRATION');
  const end=source.indexOf('// END W38 OFFLINE-VERIFIED REGISTRATION');
  if(start<0||end<=start)throw Error('Exact registration adapter missing');
  const adapter=source.slice(start,end);
  // This finite extracted region must contain registration only, no driver work.
  if(/\b(?:sql|cleanupSql|fetch|spawn|createClient)\s*\(/.test(adapter))throw Error('Unexpected runtime work inside registration adapter');
  const javascript=ts.transpileModule(adapter+'\nreturn {it,beforeAll};',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  const calls:{signal?:AbortSignal;complete:boolean}[]=[];
  const ownBody=async(run:()=>Promise<unknown>,signal?:AbortSignal)=>{const call={signal,complete:false};calls.push(call);try{return await run();}finally{call.complete=true;}};
  const registration=new Function('rawIt','rawBeforeAll','ownBody',javascript)(rawIt,rawBeforeAll,ownBody) as {
   beforeAll:(run:()=>Promise<unknown>,timeout?:number)=>unknown;
   it:(name:string,run:()=>unknown|Promise<unknown>,timeout?:number)=>unknown;
  };
  let setup=false;
  registration.beforeAll(async()=>{await Promise.resolve();setup=true;});
  registration.it('suite hook passes installed fixture parsing and async setup is awaited',()=>{
   expect(setup).toBe(true);expect(calls[0]).toEqual({signal:undefined,complete:true});
   expect(calls.at(-1)?.signal).toBeInstanceOf(AbortSignal);
   expect(calls.at(-1)?.signal?.aborted).toBe(false);
  });
  registration.it('test callback receives native signal and retains awaited body ownership',async()=>{
   expect(calls.at(-2)?.complete).toBe(true);
   const current=calls.at(-1)!;expect(current.complete).toBe(false);
   await Promise.resolve();expect(current.complete).toBe(false);expect(current.signal).toBeInstanceOf(AbortSignal);
  });
 });
}
