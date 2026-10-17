// MAIN ONLY. Two absent permission fixtures for the isolated schema-only baseline.
// NOT a shipping migration/permission repair. No runtime effects on import.
// No existing definition/role is changed. Ownership marker lives in the private
// journal: permissions has no notes column; canonical seed fields remain exact.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {id,quote,modeFor,stateSql,assertRole,assertActor} from './scoped-browser-contract.mjs';

export const permissionFixtures=Object.freeze([
  Object.freeze({permission_code:'settings.ai.view',permission_name:'View AI Settings',description:'View AI provider configurations and feature flags',module_code:'SETTINGS',action_code:'view',is_active:true}),
  Object.freeze({permission_code:'settings.email.view',permission_name:'View Email Settings',description:'View ERP email provider configurations',module_code:'SETTINGS',action_code:'view',is_active:true}),
]);
const provenance=Object.freeze({
  'supabase/migrations/20260614191500_erp_settings_1_ai_settings_provider_configuration.sql':'64896740174cd6e6081ab245a8f61afc5ae3a0e70679d1f7882590e3c20965e5',
  'supabase/migrations/20260614230415_erp_settings_2_email_provider_microsoft_graph.sql':'ec2bdc528aa61367f3810d09d23164458c9e0974421d2108fc37777ca945bfb7',
});
const actorBundle='92010c4605855370b8dc1aad3fafbf65ca9c2b9f85584316a93cde126e48f5f6';
const sha=value=>createHash('sha256').update(value).digest('hex');
const marker='F06SCOPEDPERMS0513';

export async function runPermissionFixture(command){
  let journal,stage='preflight',sequence=0,previousEventHash=null,append,receipt;
  try{
    assert.ok(['provision','retire','check'].includes(command));
    const root=path.resolve(import.meta.dirname,'../../..');
    const runtime=path.join(root,'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06/local');
    const parent=path.join(runtime,'browser-acceptance-private');
    const directory=path.join(parent,'scoped-browser-permissions-'+marker);
    const lifetimeLock=path.join(parent,'scoped-browser-lifetime-lock-private.json');
    const normalize=p=>p.replaceAll('\\','/').toLowerCase();
    assert.equal(normalize(root),'c:/dev/agt-erp-f06');assert.equal(normalize(path.resolve(process.cwd())),normalize(root));
    assert.equal(process.env.ALGT_F06_LOCAL_TARGET,'main-local');assert.equal(process.env.ALGT_F06_PERMISSION_FIXTURE,marker);
    assert.equal(process.env.ALGT_F06_PRIVATE_ACL_CONFIRMED,'protected-local-parent');
    for(const p of [runtime,parent]){assert.equal(fs.lstatSync(p).isSymbolicLink(),false);assert.equal(normalize(fs.realpathSync(p)),normalize(p));}
    assert.ok(fs.readFileSync(path.join(root,'.gitignore'),'utf8').includes('/CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06/'));
    assert.equal(fs.existsSync(path.join(runtime,'supabase/.temp/project-ref')),false);
    assert.equal(fs.existsSync(lifetimeLock),false,'SCOPED_ACTOR_WINDOW_OPEN');
    const sourceSha256=sha(fs.readFileSync(new URL(import.meta.url)));
    assert.equal(process.env.ALGT_F06_PERMISSION_SOURCE_SHA256,sourceSha256,'REVIEWED_PERMISSION_SOURCE_REQUIRED');
    for(const [file,hash] of Object.entries(provenance))assert.equal(sha(fs.readFileSync(path.join(root,file))),hash,'CANONICAL_SOURCE_CHANGED');
    const actorNames=['scoped-browser-contract.mjs','scoped-browser-runtime.mjs','scoped-browser-acceptance-actor.mjs','scoped-browser-resource-check.mjs'];
    assert.equal(sha(JSON.stringify(Object.fromEntries(actorNames.map(name=>[name,sha(fs.readFileSync(path.join(import.meta.dirname,name)))])))),actorBundle,'FROZEN_ACTOR_SOURCES_CHANGED');
    const container='68ba17ecef10f3f77ae563b68d68bd146331bf844eeb735a3dae0d7831fd1d0c';
    const absentConfig=path.join(runtime,marker+'_ABSENT_DOCKER_CONFIG');
    function docker(args,input,timeout=15000){
      assert.equal(fs.existsSync(absentConfig),false);const env={};
      for(const key of ['SystemRoot','WINDIR','PATH','Path','TEMP','TMP'])if(process.env[key]!==undefined)env[key]=process.env[key];
      const r=spawnSync('C:/Program Files/Docker/Docker/resources/bin/docker.exe',['--config',absentConfig,'--host','npipe:////./pipe/dockerDesktopLinuxEngine',...args],
        {input,encoding:'utf8',env,shell:false,windowsHide:true,timeout,killSignal:'SIGTERM',maxBuffer:8*1024*1024});
      if(r.error||r.signal||r.status!==0)throw Error('BOUNDED_LOCAL_SQL_FAILED');return r.stdout.trim();
    }
    function guard(){
      const r=JSON.parse(docker(['container','inspect',container,'--format',
        '{"id":{{json .Id}},"name":{{json .Name}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"running":{{json .State.Running}},"restarting":{{json .State.Restarting}},"ports":{{json .HostConfig.PortBindings}}}']));
      assert.equal(r.id,container);assert.equal(r.name,'/supabase_db_algt-f06-local');assert.equal(r.project,'algt-f06-local');
      assert.equal(r.running,true);assert.equal(r.restarting,false);assert.deepEqual(r.ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'16622'}]);
    }
    function sql(body,write=false){
      assert.ok(command!=='check'||!write,'CHECK_IS_READ_ONLY');guard();
      return docker(['exec','-i','-e','PGPASSWORD=postgres',container,'psql','-X','-w','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],
        `begin ${write?'read write':'read only'};set local statement_timeout='20s';set local lock_timeout='5s';set local idle_in_transaction_session_timeout='25s';set local transaction_timeout='30s';
        ${body}\n${write?'commit':'rollback'};\n`,35000);
    }
    const query=body=>JSON.parse(sql(body));guard();
    assert.equal(sql(`select count(*)::text from public.user_profiles p join auth.users u on u.id=p.auth_user_id where p.status='active' and (u.raw_app_meta_data->>'f06_marker') ~ '^F06(BROWSER|SCOPED)[0-9]';`),'0','BROWSER_ACTOR_ACTIVE');
    assert.equal(sql(`select ((select count(*) from public.erp_email_provider_configs where is_enabled is distinct from false)+(select count(*) from public.erp_ai_provider_configs where is_enabled is distinct from false))::text;`),'0');
    const readJson=file=>{assert.equal(fs.lstatSync(file).isSymbolicLink(),false);assert.equal(fs.lstatSync(file).isFile(),true);return JSON.parse(fs.readFileSync(file,'utf8'));};
    function closedActor(modeName){
      // Metadata receipts only: no credentials, keys or original fixture ledger.
      const mode=modeFor(modeName),dir=path.join(parent,'scoped-browser-'+mode.marker);
      assert.equal(fs.lstatSync(dir).isSymbolicLink(),false);assert.equal(normalize(fs.realpathSync(dir)),normalize(dir));
      assert.equal(fs.existsSync(path.join(dir,'command-lock-private.json')),false);
      assert.equal(fs.existsSync(path.join(dir,'check-failure-private.json')),false);
      const names=['role-prepare-private.json','prepare-private.json','role-retire-private.json','check-private.json'];
      const [role,prepared,final,check]=names.map(name=>readJson(path.join(dir,name)));
      const journalFile=path.join(dir,'intents-private.jsonl');assert.equal(fs.lstatSync(journalFile).isSymbolicLink(),false);
      const raw=fs.readFileSync(journalFile,'utf8');assert.ok(raw.endsWith('\n'));let seq=0,previous=null;
      const events=raw.trimEnd().split('\n').map(line=>{const e=JSON.parse(line);assert.equal(e.sequence,++seq);assert.equal(e.previousEventHash,previous);previous=sha(line+'\n');return e;});
      assert.equal(events.some(e=>e.event==='failure-retained'),false);assert.equal(events.at(-1).command,'role-retire');assert.equal(events.at(-1).event,'command-success');
      for(const name of names.slice(0,3)){
        const records=events.filter(e=>e.event==='receipt-written'&&e.details.name===name);assert.equal(records.length,1);
        assert.equal(records[0].details.sha256,sha(fs.readFileSync(path.join(dir,name))));
      }
      for(const value of [role,prepared,final,check]){assert.equal(value.mode,modeName);assert.equal(value.sourceSha256,actorBundle);assert.equal(value.nonce,role.nonce);}
      assert.equal(check.state,'PASS_EXACT_SCOPED_RESOURCES_ONLY');assert.equal(check.repairs,0);assert.equal(check.browserPassClaim,false);
      for(const key of ['roleId','profileId','assignmentId']){id(check[key]);assert.equal(check[key],prepared[key]);assert.equal(final[key],prepared[key]);}
      const current=query(stateSql(role));assertRole(current,role,false);assertActor(current,role,prepared,true);
      assert.deepEqual(current.role,final.state.role);assert.deepEqual(current.profiles,final.state.profiles);
      assert.deepEqual(current.assignments,final.state.assignments);assert.deepEqual(current.pairs,role.state.pairs);
      return {mode:modeName,role,prepared,final,check,receiptHashes:Object.fromEntries(names.map(name=>[name,sha(fs.readFileSync(path.join(dir,name)))]))};
    }
    const company=closedActor('company-branding');
    const codes=permissionFixtures.map(p=>quote(p.permission_code)).join(',');
    const rowsSql=`select coalesce(jsonb_agg(to_jsonb(p) order by permission_code),'[]') from public.permissions p where permission_code in (${codes});`;
    const snapshot=excludedIds=>query(`select json_build_object(
      'permissions',(select md5(coalesce(jsonb_agg(to_jsonb(p) order by id),'[]')::text) from public.permissions p where id not in (${excludedIds.map(id).join(',')||'0'})),
      'roles',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by id),'[]')::text) from public.roles r),
      'pairs',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by id),'[]')::text) from public.role_permissions r),
      'assignments',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by id),'[]')::text) from public.user_roles r),
      'profiles',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by id),'[]')::text) from public.user_profiles r));`);
    function durable(fd,value){const bytes=Buffer.from(value);let offset=0;while(offset<bytes.length){const n=fs.writeSync(fd,bytes,offset,bytes.length-offset);assert.ok(n>0);offset+=n;}fs.fsyncSync(fd);}
    const localFile=name=>{assert.match(name,/^[a-z-]+\.jsonl?$/);return path.join(directory,name);};
    function exclusive(name,value){const fd=fs.openSync(localFile(name),'wx',0o600);try{durable(fd,JSON.stringify(value,null,2)+'\n');}finally{fs.closeSync(fd);}}
    const events=[];let reservation;
    if(command==='provision'){
      assert.equal(fs.existsSync(directory),false);assert.deepEqual(query(rowsSql),[],'BOTH_CANONICAL_CODES_MUST_BE_ABSENT');
      for(const modeName of ['branch-restricted','global-reader']){
        assert.equal(fs.existsSync(path.join(parent,'scoped-browser-'+modeFor(modeName).marker)),false,'ACTOR_PREP_ALREADY_STARTED');
        assert.equal(sql(`select count(*)::text from public.roles where role_code=${quote(modeFor(modeName).roleCode)};`),'0');
      }
      fs.mkdirSync(directory,{mode:0o700});journal=fs.openSync(localFile('intents.jsonl'),'ax',0o600);
      reservation={marker,nonce:randomUUID(),sourceSha256,actorBundle,provenance,container,companyReceiptHashes:company.receiptHashes};
    }else{
      assert.equal(fs.lstatSync(directory).isSymbolicLink(),false);assert.equal(normalize(fs.realpathSync(directory)),normalize(directory));
      reservation=readJson(localFile('reservation.json'));assert.equal(reservation.marker,marker);assert.equal(reservation.sourceSha256,sourceSha256);
      assert.equal(reservation.actorBundle,actorBundle);assert.equal(reservation.container,container);assert.deepEqual(reservation.provenance,provenance);
      assert.deepEqual(reservation.companyReceiptHashes,company.receiptHashes);
      assert.equal(fs.lstatSync(localFile('intents.jsonl')).isSymbolicLink(),false);
      const raw=fs.readFileSync(localFile('intents.jsonl'),'utf8');assert.ok(raw.endsWith('\n'));
      for(const line of raw.trimEnd().split('\n')){const e=JSON.parse(line);assert.equal(e.sequence,++sequence);assert.equal(e.previousEventHash,previousEventHash);previousEventHash=sha(line+'\n');events.push(e);}
      assert.equal(events.some(e=>e.event==='failure-retained'),false,'FAILED_OUTCOME_REQUIRES_MAIN_RECONCILIATION');
      assert.deepEqual(events[0].details,reservation);
      for(const e of events.filter(e=>e.event==='receipt-written')){
        assert.ok(['provision.json','retire.json','check.json'].includes(e.details.name));
        assert.equal(fs.lstatSync(localFile(e.details.name)).isSymbolicLink(),false);
        assert.equal(e.details.sha256,sha(fs.readFileSync(localFile(e.details.name))));
      }
      journal=fs.openSync(localFile('intents.jsonl'),'a',0o600);
    }
    append=(event,details={})=>{const line=JSON.stringify({sequence:++sequence,previousEventHash,at:new Date().toISOString(),command,event,details})+'\n';durable(journal,line);previousEventHash=sha(line);events.push(JSON.parse(line));};
    receipt=(name,value)=>{exclusive(name,value);append('receipt-written',{name,sha256:sha(fs.readFileSync(localFile(name)))});};
    if(command==='provision'){append('reservation-intent',reservation);exclusive('reservation.json',reservation);}
    const lockNonce=randomUUID();exclusive('command-lock.json',{lockNonce,command,sourceSha256});
    exclusive(command+'-attempt.json',{nonce:reservation.nonce,sourceSha256,at:new Date().toISOString()});append('command-start');
    // The frozen actor helper uses this same exclusive path. Hold it only for
    // this explicit permission command; failures retain it for reconciliation.
    const lifetime={marker,lockNonce,command,sourceSha256};
    const lifetimeFd=fs.openSync(lifetimeLock,'wx',0o600);
    try{durable(lifetimeFd,JSON.stringify(lifetime)+'\n');}finally{fs.closeSync(lifetimeFd);}
    // Finite isolated-fixture write barrier, before rows. No role/assignment writes.
    const writeLock='lock table public.roles,public.permissions,public.role_permissions,public.user_roles,public.user_profiles in exclusive mode;';
    if(command==='provision'){
      stage='provision-two-absent-definitions';const before=snapshot([]);
      append('provision-intent',{definitions:permissionFixtures,before,canonicalSources:provenance,fixtureOnly:true});
      const values=permissionFixtures.map(p=>`(${quote(p.permission_code)},${quote(p.permission_name)},${quote(p.description)},${quote(p.module_code)},${quote(p.action_code)},true)`).join(',');
      const rows=JSON.parse(sql(`${writeLock} do $guard$ begin if exists(select 1 from public.permissions where permission_code in (${codes})) then raise exception 'CANONICAL_CODE_EXISTS';end if;end $guard$;
        with inserted as (insert into public.permissions(permission_code,permission_name,description,module_code,action_code,is_active) values ${values} returning *)
        select jsonb_agg(to_jsonb(inserted) order by permission_code) from inserted;`,true));
      assert.equal(rows.length,2);for(const row of rows){id(row.id);assert.deepEqual(Object.fromEntries(Object.keys(permissionFixtures[0]).map(k=>[k,row[k]])),permissionFixtures.find(p=>p.permission_code===row.permission_code));}
      append('provision-result',{rows});assert.deepEqual(snapshot(rows.map(p=>p.id)),before);
      receipt('provision.json',{...reservation,rows,before,fixtureOnly:true,shippingSchemaChange:false});
    }else{
      assert.equal(events.filter(e=>e.command==='provision'&&e.event==='command-success').length,1);
      const provision=readJson(localFile('provision.json'));assert.equal(provision.nonce,reservation.nonce);
      const ownedIds=provision.rows.map(p=>id(p.id));assert.equal(new Set(ownedIds).size,2);
      const actors=[closedActor('branch-restricted'),closedActor('global-reader')];
      const expectedLinks=actors.flatMap(a=>a.role.state.pairs.filter(p=>ownedIds.includes(p.permission_id))).sort((a,b)=>a.id-b.id);
      assert.equal(expectedLinks.length,4);for(const a of actors)assert.equal(expectedLinks.filter(p=>p.role_id===a.role.roleId).length,2);
      const linkSql=`select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.role_permissions p where permission_id in (${ownedIds.join(',')});`;
      const links=query(linkSql);assert.deepEqual(links,expectedLinks,'UNEXPECTED_PERMISSION_LINK');
      const before=snapshot(ownedIds);assert.equal(before.permissions,provision.before.permissions,'EXISTING_PERMISSION_DEFINITION_CHANGED');
      if(command==='retire'){
        stage='retire-owned-definitions';assert.deepEqual(query(rowsSql),provision.rows,'OWNED_PERMISSION_PREIMAGE_CHANGED');
        append('retire-intent',{ownedIds,rows:provision.rows,links,actorReceiptHashes:actors.map(a=>a.receiptHashes),before,historyRetained:true});
        const guards=actors.map(a=>`if not exists(select 1 from public.roles where id=${id(a.role.roleId)} and role_code=${quote(modeFor(a.mode).roleCode)} and not is_active and not is_system_role)
          or (select count(*) from public.user_roles where role_id=${a.role.roleId})<>1
          or not exists(select 1 from public.user_roles r join public.user_profiles p on p.id=r.user_profile_id join auth.users u on u.id=p.auth_user_id
            where r.id=${id(a.prepared.assignmentId)} and r.role_id=${a.role.roleId} and not r.is_active and p.id=${id(a.prepared.profileId)} and p.status='inactive' and p.auth_user_id=${quote(a.role.authId)}::uuid and u.banned_until>now())
          or exists(select 1 from auth.sessions where user_id=${quote(a.role.authId)}::uuid)
          or exists(select 1 from auth.refresh_tokens where user_id=${quote(a.role.authId)}) then raise exception 'SCOPED_ACTOR_NOT_CLOSED';end if;`).join('\n');
        const rows=JSON.parse(sql(`${writeLock} do $guard$ begin
          if (${rowsSql.slice(0,-1)}) is distinct from ${quote(JSON.stringify(provision.rows))}::jsonb
            or (${linkSql.slice(0,-1)}) is distinct from ${quote(JSON.stringify(links))}::jsonb then raise exception 'PERMISSION_OWNERSHIP_CHANGED';end if;
          ${guards} end $guard$;
          with retired as (update public.permissions set is_active=false where id in (${ownedIds.join(',')}) and permission_code in (${codes}) returning *)
          select jsonb_agg(to_jsonb(retired) order by permission_code) from retired;`,true));
        assert.equal(rows.length,2);for(let i=0;i<rows.length;i++){
          assert.equal(rows[i].is_active,false);const stable=r=>Object.fromEntries(Object.entries(r).filter(([k])=>!['is_active','updated_at'].includes(k)));
          assert.deepEqual(stable(rows[i]),stable(provision.rows[i]));
        }
        append('retire-result',{rows});assert.deepEqual(snapshot(ownedIds),before);assert.deepEqual(query(linkSql),links);
        receipt('retire.json',{...reservation,rows,links,actorReceiptHashes:actors.map(a=>a.receiptHashes),historyRetained:true});
      }else{
        stage='read-only-exact-check';assert.equal(events.filter(e=>e.command==='retire'&&e.event==='command-success').length,1);
        const retired=readJson(localFile('retire.json'));assert.equal(retired.nonce,reservation.nonce);
        assert.deepEqual(query(rowsSql),retired.rows);assert.equal(retired.rows.length,2);assert.ok(retired.rows.every(p=>p.is_active===false));
        assert.deepEqual(links,retired.links);assert.deepEqual(actors.map(a=>a.receiptHashes),retired.actorReceiptHashes);
        receipt('check.json',{...reservation,state:'PASS_TWO_PERMISSION_FIXTURES_RETIRED_ONLY',ownedIds,linksRetained:4,
          ownedDefinitionsInactive:true,existingDefinitionsUnchanged:true,actorsRetired:true,repairs:0,browserPassClaim:false,shippingSchemaChange:false});
      }
    }
    guard();append('command-success');assert.equal(readJson(localFile('command-lock.json')).lockNonce,lockNonce);
    assert.deepEqual(readJson(lifetimeLock),lifetime);fs.unlinkSync(lifetimeLock);fs.unlinkSync(localFile('command-lock.json'));
    process.stdout.write(JSON.stringify({command,state:'PASS_PERMISSION_FIXTURE_ONLY',fixtureOnly:true,browserPassClaim:false})+'\n');return true;
  }catch{
    if(append){try{append('failure-retained',{stage,redacted:true,noAutomaticRetry:true});}catch{/* original evidence remains */}}
    process.stderr.write(JSON.stringify({command,state:'FAIL_RETAINED',stage,redacted:true,noAutomaticRetry:true})+'\n');return false;
  }finally{if(journal!==undefined)fs.closeSync(journal);}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  if(process.argv.length!==3){process.stderr.write('ONE_EXPLICIT_COMMAND_REQUIRED\n');process.exitCode=1;}
  else if(!await runPermissionFixture(process.argv[2]))process.exitCode=1;
}
