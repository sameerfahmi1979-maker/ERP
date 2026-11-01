// Local-only native race acceptance. Creates synthetic fixtures in a disposable
// clone; the caller owns clone cleanup. Never accepts a remote connection URL.
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const container='algt_f18_20261026',database='template_amendment_20261030';
const checks=[];
function sql(statement){return new Promise((resolve,reject)=>{
 const child=spawn('docker',['exec','-i',container,'psql','-X','-U','postgres','-d',database,'-At','-v','ON_ERROR_STOP=1'],{windowsHide:true});
 let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);
 child.on('close',code=>resolve({code,out,err}));child.stdin.end('\\set VERBOSITY verbose\n'+statement);
});}
function success(r){assert.equal(r.code,0,r.err);return r.out.trim();}
function result(r){return JSON.parse(success(r).split(/\r?\n/).findLast(line=>line.startsWith('{')));}
function call(n,action,revision,data='NULL',operation='gen_random_uuid()',review='NULL'){
 return `SELECT public.edit_report_template(u.id,('bbbbbbbb-0030-4000-8000-'||lpad(${n}::text,12,'0'))::uuid,990030,'${action}',${operation},${revision},${data},NULL,${review}) FROM public.user_profiles u WHERE u.auth_user_id=('aaaaaaaa-0030-4000-8000-'||lpad(${n}::text,12,'0'))::uuid;`;
}
(async()=>{
 const suite=fs.readFileSync('tests/remediation/f06/template-amendment-native.sql','utf8');
 success(await sql(suite.slice(0,suite.indexOf("SELECT pg_temp.check_it(NOT has_function_privilege"))+'\nCOMMIT;'));
 let races=await Promise.all([sql(call(1,'save',1,`'{"template_name":"First contender"}'`)),sql(call(1,'save',1,`'{"template_name":"Second contender"}'`))]);
 assert.equal(races.filter(r=>r.code===0).length,1);assert.ok(races.some(r=>r.err.includes('PT409')));checks.push('simultaneous stale saves: exactly one commit');
 const same=call(1,'save',2,`'{"template_name":"One durable request"}'`,`'cccccccc-0030-4000-8000-000000000090'`);
 races=await Promise.all([sql(same),sql(same)]);const receipts=races.map(result);
 assert.equal(receipts.filter(r=>r.replayed).length,1);assert.equal(receipts[0].revision,receipts[1].revision);checks.push('simultaneous retries: one save and identical durable receipt');
 result(await sql(call(1,'submit',3,'NULL','gen_random_uuid()',`'{"passed":true,"severity":"none","findings":[]}'`)));
 result(await sql(call(2,'approve',4)));
 races=await Promise.all([sql(call(1,'publish',5)),sql(call(1,'publish',5))]);
 assert.equal(races.filter(r=>r.code===0).length,1);assert.ok(races.some(r=>r.err.includes('PT409')));checks.push('simultaneous publish: one publication');
 assert.equal(success(await sql('SELECT version_no FROM public.erp_report_templates WHERE id=990030;')),'2');checks.push('publication version incremented once');
 assert.equal(success(await sql('SELECT count(*) FROM public.erp_report_templates WHERE template_code LIKE \'QA_SAME_ID%\';')),'1');checks.push('same catalogue identity without copies');
 console.log(JSON.stringify({passed:checks.length,checks,container,database,productionUsed:false},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
