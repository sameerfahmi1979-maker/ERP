// Native laboratory only. No ports, network, bind mounts, live keys or hosted DB.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
const root=resolve('.'); if(root.toLowerCase()!=='c:\\dev\\agt-erp')throw Error('Wrong canonical checkout');
const out=join(root,'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/AI_MOD_03_20261031'),container='agt-ai-mod03-20261031';
if(existsSync(join(out,'NATIVE_RESULT.json')))throw Error('Preserve prior native receipt; do not repeat without a new reason/receipt');
const docker=args=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
const resume=process.argv.slice(2).join(' ')==='--resume-after-bootstrap-failure';
if(process.argv.length>2&&!resume)throw Error('Invalid native-test arguments');
const existing=docker(['ps','-a','--filter',`name=^/${container}$`,'--format','{{.Names}}']).trim();
if(existing&&(!resume||!existsSync(join(out,'NATIVE_FAILURE.log'))))throw Error('Existing task container must be reconciled');
const image='public.ecr.aws/supabase/postgres:17.6.1.127';
const imageId=docker(['image','inspect',image,'--format','{{.Id}}']).trim();
const cid=existing?JSON.parse(readFileSync(join(out,'NATIVE_CONTAINER.json'),'utf8')).cid:docker(['run','--detach','--name',container,'--network','none','--label','algt.task=ai-mod03-20261031','--env','POSTGRES_HOST_AUTH_METHOD=trust',imageId]).trim();
if(!existing)writeFileSync(join(out,'NATIVE_CONTAINER.json'),JSON.stringify({container,cid,imageId,network:'none',ports:[],mounts:[],createdUtc:new Date().toISOString()},null,2));
const info=JSON.parse(docker(['inspect',container]))[0];
if(info.Id!==cid||info.Config.Labels['algt.task']!=='ai-mod03-20261031'||info.HostConfig.NetworkMode!=='none'||info.Mounts.length||Object.keys(info.HostConfig.PortBindings??{}).length)throw Error('Isolated resource guard failed');
let ready=false;for(let n=0;n<40;n++){try{docker(['exec',container,'pg_isready','-U','postgres']);ready=true;break;}catch{await setTimeout(250);}}
if(!ready)throw Error('Isolated database not ready; preserve for diagnosis');
const migration=readFileSync('supabase/migrations/20261030143220_ai_mod02_shared_document_search.sql');
if(createHash('sha256').update(migration).digest('hex')!=='f1077872856988b3480fbb25e35b87f825805d6d1eecb80cf771327d3d1054d2')throw Error('Accepted dependency source changed');
const predecessor=readFileSync('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/AI_MOD_02_20261030/NATIVE_SEARCH_PACKET.sql','utf8');
const extra=`
RESET ROLE;
UPDATE public.employees SET updated_at='2026-10-31T00:00:00Z' WHERE id IN(1,2,3);
UPDATE public.employee_dependents SET is_active=true,updated_at='2026-10-31T00:00:00Z' WHERE id=10;
INSERT INTO public.employee_dependents(id,employee_id,dependent_name_en,is_active,updated_at) VALUES(20,2,'SYNTHETIC foreign family',true,now());
SELECT set_config('test.session','true',false),set_config('test.active','true',false),set_config('test.scopes','[[1,11]]',false),set_config('test.permissions','dms.documents.view,hr.employees.view',false);
SET ROLE authenticated;
SELECT pg_temp.ok((SELECT count(*) FROM public.employees WHERE id=1 AND deleted_at IS NULL)=1,'assistant minimal employee read uses permitted parent');
SELECT pg_temp.ok((SELECT count(*) FROM public.employees WHERE id=3)=0,'assistant cannot read sibling branch');
SELECT pg_temp.ok((SELECT count(*) FROM public.employees WHERE id=2)=0,'assistant cannot read foreign company');
SELECT pg_temp.ok((SELECT count(*) FROM public.employee_dependents WHERE employee_id=1 AND is_active AND deleted_at IS NULL)=1,'dependent question uses exact stored parent');
SELECT pg_temp.ok((SELECT count(*) FROM public.employee_dependents WHERE id=20)=0,'foreign child name cannot grant relationship access');
SELECT pg_temp.ok((SELECT count(*) FROM public.ai_mod02_resolve_subject('SYN-EMP-1'))=1,'business identifier resolves within current authority');
SELECT set_config('test.permissions','ai.assistant.use,ai.common.admin',false);
SELECT pg_temp.ok((SELECT count(*) FROM public.employees)=0,'assistant/AI-admin capability does not grant HR rows');
SELECT pg_temp.ok((SELECT count(*) FROM public.employee_dependents)=0,'revoked HR access hides dependent relationships');
SELECT set_config('test.permissions','dms.documents.view,hr.employees.view',false),set_config('test.session','false',false);
SELECT pg_temp.ok((SELECT count(*) FROM public.employees)=0,'expired session cannot retrieve employee sources');
RESET ROLE;
SELECT jsonb_build_object('result','passed','assertions',current_setting('test.assertions')::int,'newAssistantAssertions',9,'qualification','Captured column shapes and F03/PERF document projection; owning HR/session/RLS helpers are controlled fixtures, not hosted or browser acceptance.');
`;
const packet=predecessor+extra;
writeFileSync(join(out,'NATIVE_PACKET.sql'),packet);
const database='ai_mod03_acceptance';
docker(['exec',container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',`CREATE DATABASE ${database}`]);
try{
 const output=execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-At'],{input:packet,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
 writeFileSync(join(out,'NATIVE_ACCEPTANCE.log'),output);
 const result=JSON.parse(output.trim().split('\n').findLast(line=>line.startsWith('{"result"')));
 writeFileSync(join(out,'NATIVE_RESULT.json'),JSON.stringify({...result,cid,database,packetSha256:createHash('sha256').update(packet).digest('hex'),productionChanges:false},null,2));console.log(JSON.stringify(result));
}catch(error){writeFileSync(join(out,'NATIVE_FAILURE.log'),String(error.stdout??'')+'\n'+String(error.stderr??error));throw Error('Native acceptance failed; retained in private evidence');}
