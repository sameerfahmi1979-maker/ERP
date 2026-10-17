// Pure controller guards only: no Docker, network, database or application startup.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import yaml from 'js-yaml';
import {BASE,NATIVE,NATIVE_SHA,IMPACT,LOCK_GRAPH_SHA,TRUST_ROOTS,validateNativeTap,validateImage,validateOwnership,validateBaseLineage,validateTrust,nativeArguments,uncertainDockerOutcome} from '../../../tooling/testing/f06-linux-image-check.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
test('unknown Docker outcomes require retained references, not assumed daemon quiescence',()=>{const known={cliEnded:true,code:0,reason:null,error:null,signal:null};assert.equal(uncertainDockerOutcome(known),false);assert.equal(uncertainDockerOutcome({...known,code:1}),false);for(const delta of [{cliEnded:false},{reason:'CLI_TIMEOUT'},{error:'CLI_END_UNKNOWN'},{signal:'SIGKILL'}])assert.equal(uncertainDockerOutcome({...known,...delta}),true);const s=fs.readFileSync('tooling/testing/f06-linux-image-check.mjs','utf8');assert.ok(s.indexOf("if(exe==='docker'&&uncertainDockerOutcome(r))")<s.indexOf("write(id+'-outcome.json'"));assert.ok(s.includes('for(const ref of [...refs]){if(uncertainDockerCommands.length)break;try{await close(ref);'));assert.ok(s.includes('FAIL_UNRESOLVED_DOCKER_OPERATION_RETAIN_REFERENCES'));});
test('image build pipeline explicitly propagates docker failure, not just tee success',()=>{const s=fs.readFileSync('.github/workflows/engineering.yml','utf8');assert.match(s,/name: Build pinned production image with synthetic public configuration\s+shell: bash\s+run: \|\s+set -euo pipefail\s+docker build/);});
test('CI admits exactly the digest-pinned amd64 base before build and verification without a fallback',()=>{
 const s=fs.readFileSync('.github/workflows/engineering.yml','utf8').replace(/\r\n/g,'\n');
 const name='      - name: Pull exact pinned Linux base for provenance verification';
 const start=s.indexOf(name),next=s.indexOf('      - name:',start+name.length);
 assert.ok(start>s.indexOf('  production-image:')&&next>start);
 assert.equal(s.slice(start,next).trimEnd(),[name,'        shell: bash','        run: |','          set -euo pipefail',`          docker pull --platform linux/amd64 ${BASE}`].join('\n'));
 assert.equal((s.match(/^\s+docker pull\b/gm)||[]).length,1);
 const build=s.indexOf('      - name: Build pinned production image with synthetic public configuration');
 const verify=s.indexOf('      - name: Verify same immutable image native paths, provenance, trust and non-root boot');
 assert.equal(next,build);assert.ok(build<verify);
 assert.ok(fs.readFileSync('Dockerfile','utf8').split(/\r?\n/).includes(`FROM ${BASE} AS base`));
});
const validTap=()=>['TAP version 13',...Array.from({length:11},(_,i)=>'ok '+(i+1)+' - synthetic '+i),'1..11','# tests 11','# suites 0','# pass 11','# fail 0','# cancelled 0','# skipped 0','# todo 0'].join('\n');
test('actual unchanged Linux fixture bytes remain pinned',()=>assert.equal(hash(fs.readFileSync(NATIVE)),NATIVE_SHA));
test('reviewed integrated dependency inputs match exact pinned public bytes',()=>{for(const[p,h]of Object.entries(IMPACT)){const b=fs.readFileSync(p);const canonical=p.endsWith('.tgz')?b:Buffer.from(b.toString('utf8').replace(/\r\n/g,'\n'));assert.equal(hash(canonical),h,p);if(!p.endsWith('.tgz'))assert.doesNotMatch(b.toString('utf8'),/\r(?!\n)/);}assert.equal(hash(JSON.stringify(JSON.parse(fs.readFileSync('package-lock.json')))),LOCK_GRAPH_SHA);});
test('native acceptance admits exactly eleven complete positive cases',()=>assert.deepEqual(validateNativeTap(validTap()),{tests:11,pass:11,fail:0,cancelled:0,skipped:0,todo:0}));
for(const[name,change]of [['failed case',s=>s.replace('ok 1 -','not ok 1 -')],['skip',s=>s.replace('ok 1 - synthetic 0','ok 1 - synthetic 0 # SKIP')],['todo',s=>s.replace('# todo 0','# todo 1')],['cancellation',s=>s.replace('# cancelled 0','# cancelled 1')],['missing summary',s=>s.replace('# fail 0','')],['duplicated summary',s=>s+'\n# pass 11'],['wrong case count',s=>s.replace('ok 11 - synthetic 10','')]])test('native summary rejects '+name,()=>assert.throws(()=>validateNativeTap(change(validTap()))));
const image=()=>({Id:'sha256:'+'a'.repeat(64),Os:'linux',Architecture:'amd64',Config:{User:'node',Cmd:['node','node_modules/next/dist/bin/next','start'],Env:['NODE_ENV=production'],Volumes:null}});
test('fresh production metadata requires pinned runtime form',()=>assert.equal(validateImage(image()),image().Id));
test('pinned base layer prefix must be present in new runtime metadata',()=>{const b={RootFS:{Type:'layers',Layers:['sha256:'+'a'.repeat(64)]}},r={RootFS:{Type:'layers',Layers:[...b.RootFS.Layers,'sha256:'+'b'.repeat(64)]}};validateBaseLineage(b,r);assert.throws(()=>validateBaseLineage(b,{RootFS:{Type:'layers',Layers:['sha256:'+'b'.repeat(64)]}}));assert.throws(()=>validateBaseLineage({RootFS:{Type:'layers',Layers:[]}},r));assert.throws(()=>validateBaseLineage(b,{RootFS:{Type:'layers',Layers:['tag']}}));});
for(const[name,change]of [['root default',v=>v.Config.User=''],['foreign platform',v=>v.Architecture='arm64'],['foreign command',v=>v.Config.Cmd=['sh']],['mutable ID',v=>v.Id='algt-f02-ci'],['persistent mount',v=>v.Config.Volumes={'/app':{}}],['TLS bypass',v=>v.Config.Env.push('NODE_TLS_REJECT_UNAUTHORIZED=0')],['npm TLS bypass',v=>v.Config.Env.push('NPM_CONFIG_STRICT_SSL=false')],['extra CA',v=>v.Config.Env.push('NODE_EXTRA_CA_CERTS=/tmp/cert')]])test('image metadata rejects '+name,()=>{const v=image();change(v);assert.throws(()=>validateImage(v));});
const trust=()=>({node:'v22.23.2',platform:'linux',roots:TRUST_ROOTS,files:Object.fromEntries(TRUST_ROOTS.map(p=>[p,{kind:'absent'}]))});
test('paired explicit-absence trust inventories are valid',()=>validateTrust(trust(),trust()));
test('unchanged explicit directory/file/symlink inventories are valid',()=>{const b=trust();b.files[TRUST_ROOTS[0]]={kind:'directory'};b.files[TRUST_ROOTS[0]+'/ca']={kind:'file',sha256:'a'.repeat(64)};b.files[TRUST_ROOTS[0]+'/link']={kind:'symlink',link:'ca',sha256:'a'.repeat(64)};validateTrust(b,structuredClone(b));});
for(const[name,change]of [['missing root',v=>delete v.files[TRUST_ROOTS[0]]],['introduced store',v=>v.files[TRUST_ROOTS[0]]={kind:'directory'}],['unknown root',v=>v.files['/unrelated']={kind:'absent'}],['contradictory absence',v=>v.files[TRUST_ROOTS[0]+'/ca']={kind:'file',sha256:'a'.repeat(64)}],['unknown fields',v=>v.files[TRUST_ROOTS[0]]={kind:'absent',ignored:true}]])test('trust inventory rejects '+name,()=>{const b=trust(),v=trust();change(v);assert.throws(()=>validateTrust(b,v));});
test('cleanup identity binds exact image, container, name and CI owner',()=>{const ref={id:'b'.repeat(64),image:image().Id,name:'algt-f06-test'};const v={Id:ref.id,Image:ref.image,Name:'/'+ref.name,Config:{Image:ref.image,Labels:{'algt.f06.ci-owner':'1-1'}}};validateOwnership(v,ref,'1-1');for(const change of [v=>v.Image='sha256:'+'c'.repeat(64),v=>v.Id='c'.repeat(64),v=>v.Name='/foreign',v=>v.Config.Labels['algt.f06.ci-owner']='other']){const wrong=structuredClone(v);change(wrong);assert.throws(()=>validateOwnership(wrong,ref,'1-1'));}});
test('native execution uses readonly source/fixture mounts, no network and UID1000',()=>{const a=nativeArguments('/checkout','/evidence/verification');assert.equal(a[a.indexOf('--network')+1],'none');assert.equal(a[a.indexOf('--user')+1],'1000');assert.ok(a.includes('--read-only'));assert.ok(a.includes('type=bind,src=/checkout/src,dst=/app/src,readonly'));assert.ok(a.includes('type=bind,src=/evidence/verification,dst=/app/verification,readonly'));assert.ok(!a.includes('--privileged')&&!a.includes('--publish'));assert.match(BASE,/@sha256:[a-f0-9]{64}$/);});
const requiredJobs=['core-tests','remediation-tests','f06-tests','performance-phases','performance-compatibility','integration-tests','build-types','security','lint','production-image'];
const candidateRef='${{ github.event.pull_request.head.sha || github.sha }}';
const offlineSchemaFiles=['migration-contract.test.cjs','native-fixture.test.cjs','schema-receipt.test.cjs','schema-rejection-witnesses.test.cjs','document-lineage.test.cjs','reconciled-receipt.test.cjs','branding-acl.test.cjs','template-set.test.cjs'].map(file=>'tests/integration/f00-f06/schema/'+file);
const offlineAffordanceFiles=['employee-affordance.test.mjs','dms-affordance.test.mjs','report-permission-regression.test.mjs'].map(file=>'tests/integration/f00-f06/'+file);
function validateEngineeringWorkflow(workflow){
 assert.equal(workflow.env.EXPECTED_CANDIDATE_SHA,candidateRef);
 assert.deepEqual(Object.keys(workflow.jobs).sort(),[...requiredJobs,'verify'].sort());
 for(const name of requiredJobs){
  const job=workflow.jobs[name],steps=job.steps;
  assert.equal(job.if,undefined,name+' must not skip');
  assert.equal(job['continue-on-error'],undefined,name+' must remain blocking');
  assert.equal(job.env?.EXPECTED_CANDIDATE_SHA,undefined,name+' must not override candidate');
  const checkouts=steps.filter(step=>step.uses?.startsWith('actions/checkout@'));
  assert.equal(checkouts.length,1,name+' exact checkout count');
  assert.equal(steps[0],checkouts[0],name+' checkout must precede executable steps');
  assert.equal(checkouts[0].uses,'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803');
  assert.equal(checkouts[0].with.ref,candidateRef,name+' exact candidate pin');
  assert.equal(checkouts[0].with['persist-credentials'],false,name+' credentials');
  assert.equal(checkouts[0].with['fetch-depth'],name==='integration-tests'?0:undefined,name+' only immutable donor checks require full history');
  const identity=steps[1];
  assert.equal(identity.name,'Verify exact candidate checkout',name+' identity must immediately follow checkout');
  assert.equal(identity.run,'test "$(git rev-parse HEAD)" = "$EXPECTED_CANDIDATE_SHA"',name+' executable identity check');
  for(const step of [checkouts[0],identity]){
   assert.equal(step.if,undefined,name+' admission must not skip');
   assert.equal(step['continue-on-error'],undefined,name+' admission must fail closed');
   assert.equal(step.env?.EXPECTED_CANDIDATE_SHA,undefined,name+' admission cannot replace candidate');
  }
 }
 const schemaSteps=workflow.jobs['integration-tests'].steps.filter(step=>step.name==='Composed migration, fixture identity and schema receipt guards (offline only)');
 assert.equal(schemaSteps.length,1,'Exactly one complete offline schema gate');
 assert.equal(schemaSteps[0].if,undefined,'Offline schema gate must not skip');
 assert.equal(schemaSteps[0]['continue-on-error'],undefined,'Offline schema gate must remain blocking');
 assert.deepEqual(schemaSteps[0].run.trim().split(/\s+/),['node','--test',...offlineSchemaFiles],'All required exact offline schema suites must execute without filtering');
 const affordanceSteps=workflow.jobs['integration-tests'].steps.filter(step=>step.name==='Employee, DMS and report display-authority contracts (offline only)');
 assert.equal(affordanceSteps.length,1,'Exactly one complete offline affordance gate');
 assert.equal(affordanceSteps[0].if,undefined,'Offline affordance gate must not skip');
 assert.equal(affordanceSteps[0]['continue-on-error'],undefined,'Offline affordance gate must remain blocking');
 assert.deepEqual(affordanceSteps[0].run.trim().split(/\s+/),['node','--test',...offlineAffordanceFiles],'All three exact affordance suites must execute without filtering');
 const aggregate=workflow.jobs.verify;
 assert.equal(aggregate.if,'always()');
 assert.deepEqual([...aggregate.needs].sort(),[...requiredJobs].sort());
 assert.equal(aggregate.steps.length,1);
 assert.equal(aggregate.steps[0].shell,'bash');
 assert.equal(aggregate.steps[0].if,undefined);
 assert.equal(aggregate.steps[0]['continue-on-error'],undefined);
 assert.deepEqual(aggregate.steps[0].run.trim().split(/\r?\n/).map(line=>line.trim()),[
  'set -euo pipefail',...requiredJobs.map(name=>`test '\${{ needs.${name}.result }}' = success`)
 ]);
}
test('workflow retains every original gate and pins all ten executable jobs to candidate head',()=>{
 const s=fs.readFileSync('.github/workflows/engineering.yml','utf8');
 validateEngineeringWorkflow(yaml.load(s));
 for(const key of ['  verify:','  lint:','  production-image:','npm test','npm run test:remediation','npm run security:dependencies','npm run lint','node tooling/testing/f06-linux-image-check.mjs','include-hidden-files: true'])assert.ok(s.includes(key));
 assert.doesNotMatch(s,/docker rm --force/);assert.ok(fs.readFileSync('.gitattributes','utf8').includes('/'+NATIVE+' text eol=lf'));
});
test('each required workflow job rejects missing, mutable, bypassed or late candidate admission',()=>{
 const baseline=yaml.load(fs.readFileSync('.github/workflows/engineering.yml','utf8'));
 for(const name of requiredJobs)for(const mutate of [
  value=>{delete value.jobs[name];},
  value=>{value.jobs[name].steps[0].with.ref='main';},
  value=>{value.jobs[name].steps[0].with['persist-credentials']=true;},
  value=>{value.jobs[name].steps[0].with['fetch-depth']=name==='integration-tests'?1:0;},
  value=>{value.jobs[name].steps[1].run='true';},
  value=>{value.jobs[name].steps[1].if='false';},
  value=>{value.jobs[name].steps[0].if='false';},
  value=>{value.jobs[name]['continue-on-error']=true;},
  value=>{value.jobs[name].env={EXPECTED_CANDIDATE_SHA:'unreviewed'};},
  value=>{value.jobs[name].steps.splice(1,0,{run:'npm ci'});},
  value=>{value.jobs[name].steps.push(structuredClone(value.jobs[name].steps[0]));}
 ]){const changed=structuredClone(baseline);mutate(changed);assert.throws(()=>validateEngineeringWorkflow(changed),name);}
});
test('workflow aggregate rejects missing gates, skipped admission and non-success predicates',()=>{
 const baseline=yaml.load(fs.readFileSync('.github/workflows/engineering.yml','utf8'));
 for(const mutate of [
  value=>{value.env.EXPECTED_CANDIDATE_SHA='${{ github.sha }}';},
  value=>{delete value.jobs['integration-tests'].steps[0].with['fetch-depth'];},
  value=>{value.jobs.verify.needs.pop();},
  value=>{value.jobs.verify.needs.push('security');},
  value=>{value.jobs.verify.if='success()';},
  value=>{value.jobs.verify.steps[0]['continue-on-error']=true;},
  value=>{value.jobs.verify.steps[0].run=value.jobs.verify.steps[0].run.replace('= success','= skipped');},
  value=>{value.jobs.verify.steps[0].run='true';}
 ]){const changed=structuredClone(baseline);mutate(changed);assert.throws(()=>validateEngineeringWorkflow(changed));}
});
test('offline schema gate rejects omitted, substituted, filtered or bypassed lineage and receipt suites',()=>{
 const baseline=yaml.load(fs.readFileSync('.github/workflows/engineering.yml','utf8'));
 const gate=value=>value.jobs['integration-tests'].steps.find(step=>step.name==='Composed migration, fixture identity and schema receipt guards (offline only)');
 for(const file of offlineSchemaFiles)for(const replacement of ['',offlineSchemaFiles.find(other=>other!==file)]){
  const changed=structuredClone(baseline);gate(changed).run=gate(changed).run.replace(file,replacement);
  assert.throws(()=>validateEngineeringWorkflow(changed),file);
 }
 for(const mutate of [step=>{step.run=step.run.replace('node --test','node --test --test-name-pattern=selected');},step=>{step.if='false';},step=>{step['continue-on-error']=true;}]){
  const changed=structuredClone(baseline);mutate(gate(changed));assert.throws(()=>validateEngineeringWorkflow(changed));
 }
});

test('offline affordance gate rejects omitted, substituted, filtered, duplicated or bypassed suites',()=>{
 const baseline=yaml.load(fs.readFileSync('.github/workflows/engineering.yml','utf8'));
 const gateName='Employee, DMS and report display-authority contracts (offline only)';
 const gate=value=>value.jobs['integration-tests'].steps.find(step=>step.name===gateName);
 for(const file of offlineAffordanceFiles)for(const replacement of ['',offlineAffordanceFiles.find(other=>other!==file)]){
  const changed=structuredClone(baseline);gate(changed).run=gate(changed).run.replace(file,replacement);
  assert.throws(()=>validateEngineeringWorkflow(changed),file);
 }
 for(const mutate of [
  value=>{value.jobs['integration-tests'].steps=value.jobs['integration-tests'].steps.filter(step=>step.name!==gateName);},
  value=>{value.jobs['integration-tests'].steps.push(structuredClone(gate(value)));},
  value=>{gate(value).run=gate(value).run.replace('node --test','node --test --test-name-pattern=selected');},
  value=>{gate(value).run=gate(value).run.replace('node --test','node --test --test-skip-pattern=selected');},
  value=>{gate(value).if='false';},
  value=>{gate(value)['continue-on-error']=true;}
 ]){const changed=structuredClone(baseline);mutate(changed);assert.throws(()=>validateEngineeringWorkflow(changed));}
});

test('controller records both SHAs and immutable image and never retries business mutations',()=>{const s=fs.readFileSync('tooling/testing/f06-linux-image-check.mjs','utf8');for(const key of ['candidateHead:candidate,eventSha:event','actualCheckout=checkout','imageId=validateImage(production)','newImageAllLayerCertificateScan:false','cliEnded:ended','CLI_END_UNKNOWN','CLI_TIMEOUT','OUTPUT_BOUND','Absolute HTTP deadline','/dashboard'])assert.ok(s.includes(key));assert.ok(s.includes("request('/dashboard','HEAD')"));assert.doesNotMatch(s,/docker.*rm.*--force|NODE_TLS_REJECT_UNAUTHORIZED=0/);});

test('integration retains both immutable patches in image source and runtime proof',()=>{const s=fs.readFileSync('tooling/testing/f06-linux-image-check.mjs','utf8');for(const name of ['vendor/braces-3.0.3-algt-integrated-2.tgz','vendor/sprintf-js-1.0.3-algt.1.tgz','vendor/PATCH-MANIFEST.json','tooling/security/verify-vendor-patches.cjs']){assert.ok(Object.hasOwn(IMPACT,name));assert.ok(s.includes(name));}assert.ok(s.includes('assert.equal(runtime.sprintfFiles,3)'));assert.ok(s.includes("require('/app/node_modules/sprintf-js')"));const docker=fs.readFileSync('Dockerfile','utf8');assert.ok(docker.includes('COPY vendor/braces-3.0.3-algt-integrated-2.tgz'));assert.ok(docker.includes('COPY vendor/sprintf-js-1.0.3-algt.1.tgz'));});
