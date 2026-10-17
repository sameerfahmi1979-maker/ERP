// Pure synthetic/source-only tests. No runtime factory or actual helper entry is invoked.
import fs from 'node:fs';
import ts from 'typescript';
import {describe,expect,it} from 'vitest';
import {exact,originalSources,originalEvidence,lifetimeHash,limitations,continuationCommands,normalizedObservation,assertOriginalFailure,decodeChain,assertRawRetained,assertByteAttestations} from './n02-continuation.mjs';
import {sha,sourceBytes,sourceDigest,assertObservation,n02,destinationFor,expectedFileName} from './n02-browser-contract.mjs';

const authId='22222222-2222-4222-8222-222222222222',nonce='33333333-3333-4333-8333-333333333333',time='2026-10-05T01:32:00.000Z',session='44444444-4444-4444-8444-444444444444';
const base={authId,nonce,sourceSha256:'a'.repeat(64),owner:{companyId:901,branchId:902},storageYear:2026};
const resources={rule:{id:701},categoryId:801,typeId:802};
const prepared={profileId:903,uploadId:exact.uploadId};
function observed(){const op=exact.operationId,documentNo=exact.documentNo,fileName=expectedFileName(documentNo),documentId=exact.documentId;return {
 documents:[{id:documentId,document_no:documentNo,title:n02.title,document_type_id:802,category_id:801,status:'active',confidentiality_level:'internal',owner_user_id:903,owning_company_id:901,owning_branch_id:902,created_by:903,updated_by:903,current_version_id:1304,is_archived:false,archived_at:null as string|null,
 description:null,issue_date:null,expiry_date:null,party_id:null,reminder_policy_id:null,legacy_document_code:null,deleted_at:null}],
 references:[{id:1302,numbering_rule_id:701,generation_status:'consumed',target_table_name:'dms_documents',target_record_id:documentId,generated_by:903,generated_reference_number:documentNo,generated_sequence_number:'260',sequence_state_id:1303,manual_override_used:false,reserved_at:time,consumed_at:time,reasonMatches:true}],
 requests:[{actor_id:903,operation_id:op,reference_id:1302,hashMatches:true}],
 versions:[{id:1304,document_id:documentId,version_number:1,version_label:'v1',change_notes:'Initial upload',is_current:true,created_by:903}],
 files:[{id:1305,document_id:documentId,version_id:1304,file_role:'original',storage_bucket:'dms-documents',storage_path:destinationFor(base,documentId),sha256_hash:sourceDigest(),file_size_bytes:sourceBytes().length,mime_type:n02.mime,created_by:903,deleted_at:null,file_name:fileName}],
 verified:[{actor_id:903,operation_id:op,document_id:documentId,hashMatches:true,request_hash:'b'.repeat(64),upload_session_id:exact.uploadId,storage_path:destinationFor(base,documentId),content_sha256:sourceDigest(),file_size_bytes:sourceBytes().length,mime_type:n02.mime,file_name:fileName,verified_session_id:session}],
 completed:[{actor_id:903,operation_id:op,document_id:documentId,hashMatches:true,request_hash:'b'.repeat(64),result:{documentId,documentNo,upload_session_id:exact.uploadId,operation_id:op,completed:true,replayed:false}}],
 events:[['document_created',{operation_id:op,upload_session_id:exact.uploadId,attachment_complete:false}],['file_uploaded',{operation_id:op,file_id:1305,version_id:1304,version_number:1}],['version_uploaded',{operation_id:op,version_id:1304,version_number:1,is_current:true}]].map(([event_type,metadata_json],i)=>({id:1401+i,event_type,metadata_json,document_id:documentId,performed_by:903})),
 audits:[{id:1501,actor_user_profile_id:903,entity_name:'global_numbering_generated_references',entity_id:1302,entity_reference:documentNo,action:'generate',new_values:{status:'reserved',operation_id:op}},
 {id:1502,actor_user_profile_id:903,entity_name:'global_numbering_generated_references',entity_id:1302,entity_reference:documentNo,action:'update',new_values:{status:'consumed',operation_id:op,target_table:'dms_documents',target_record:documentId}},
 {id:1503,actor_user_profile_id:903,entity_name:'dms_documents',entity_id:documentId,entity_reference:documentNo,action:'create',new_values:{event:'document_retained_from_upload',operation_id:op,upload_session_id:exact.uploadId,attachment_complete:false}},
 {id:1504,actor_user_profile_id:903,entity_name:'dms_documents',entity_id:documentId,entity_reference:documentNo,action:'update',new_values:{event:'document_upload_completed',operation_id:op,upload_session_id:exact.uploadId,version_id:1304,file_id:1305}}],
 sequences:[{id:1303,numbering_rule_id:701,reset_period_key:'GLOBAL',last_sequence_number:'260',next_sequence_number:'261',last_generated_reference:documentNo,updated_by:903}]};}
type Event = {event:string;command:string;details:unknown};
function journal(events:Event[]){let previous:string|null=null;return events.map((e,i)=>{const line=JSON.stringify({sequence:i+1,previousEventHash:previous,...e})+'\n';previous=sha(line);return line;}).join('');}
function original(){const events:Event[]=[{event:'reservation-intent',command:'resources-prepare',details:base}];
 for(const command of ['resources-prepare','actor-source-prepare','observe-invalid'])events.push({command,event:'command-start',details:{nonce}},{command,event:'command-success',details:{nonce}});
 events.push({command:'observe-completed',event:'command-start',details:{nonce}},{command:'observe-completed',event:'failure-retained',details:{stage:'preflight',redacted:true,noAutomaticRetry:true}});
 return {events,records:{'reservation-private.json':base,'observe-completed-attempt-private.json':{nonce,command:'observe-completed',sourceSha256:base.sourceSha256},'command-lock-private.json':{command:'observe-completed',nonce,pid:123,sourceSha256:base.sourceSha256}}};}
const read=(name:string)=>fs.readFileSync('tests/remediation/f06/'+name,'utf8');

describe('finite N02 continuation correction',()=>{
 it('reproduces the old observer failure and then passes unchanged assertions with only two validated fields adapted',()=>{
  const raw=observed(),before=structuredClone(raw);expect(()=>assertObservation(raw,base,resources,prepared)).toThrow();
  const copy=normalizedObservation(raw,base,prepared);expect(assertObservation(copy,base,resources,prepared).documentId).toBe(1014);expect(raw).toEqual(before);expect(copy).not.toBe(raw);
  const expected=structuredClone(raw);delete expected.audits[1].new_values.target_table;delete expected.audits[1].new_values.target_record;expect(copy).toEqual(expected);
 });
 it.each(['target_record','target_table','status','operation_id'])('rejects wrong consumed %s without stripping it',key=>{
  const raw=observed();(raw.audits[1].new_values as Record<string,unknown>)[key]='wrong';expect(()=>normalizedObservation(raw,base,prepared)).toThrow();
 });
 it.each(['target_record','target_table'])('rejects a missing %s, including the old synthetic assumption',key=>{const raw=observed();delete (raw.audits[1].new_values as Record<string,unknown>)[key];expect(()=>normalizedObservation(raw,base,prepared)).toThrow();});
 it('rejects extra consumed fields, extra rows and mismatched actor/reference',()=>{
  const extra=observed();Object.assign(extra.audits[1].new_values,{unreviewed:true});expect(()=>normalizedObservation(extra,base,prepared)).toThrow();
  const duplicate=observed();duplicate.audits.push(duplicate.audits[1]);expect(()=>normalizedObservation(duplicate,base,prepared)).toThrow();
  for(const key of ['actor_user_profile_id','entity_id']){const x=observed();(x.audits[1] as unknown as Record<string,unknown>)[key]=999;expect(()=>normalizedObservation(x,base,prepared)).toThrow();}
 });
 it('does not relax the generated audit or target/source/operation identities',()=>{
  const raw=observed();Object.assign(raw.audits[0].new_values,{target_record:1014});expect(()=>normalizedObservation(raw,base,prepared)).toThrow();
  expect(()=>normalizedObservation(observed(),base,{...prepared,uploadId:592})).toThrow();const other=observed();other.documents[0].id=1015;expect(()=>normalizedObservation(other,base,prepared)).toThrow();
  const op=observed();op.requests[0].operation_id=nonce;expect(()=>normalizedObservation(op,base,prepared)).toThrow();
 });
 it('leaves all other original proof failures effective',()=>{const raw=observed();raw.completed[0].hashMatches=false;expect(()=>assertObservation(normalizedObservation(raw,base,prepared),base,resources,prepared)).toThrow();});
 it('pins only the observed destination/source/operation, not guessed resource IDs',()=>{expect(exact).toEqual({documentId:1014,documentNo:'F06DMC-000260',uploadId:591,operationId:'8990f6ab-69b9-4933-976d-d37929c8749f'});expect(Object.keys(exact)).not.toContain('profileId');});
});
describe('failure evidence is not erased or broadly waived',()=>{
 it('accepts only the exact failed observer tail with three preceding successes',()=>{const x=original();expect(assertOriginalFailure(journal(x.events),x.records)).toHaveLength(9);});
 it.each(['stage','noAutomaticRetry','redacted'])('rejects changed failure detail %s',key=>{const x=original();(x.events.at(-1)!.details as Record<string,unknown>)[key]='changed';expect(()=>assertOriginalFailure(journal(x.events),x.records)).toThrow();});
 it('rejects missing, second, displaced failure and appended success',()=>{
  const x=original();expect(()=>assertOriginalFailure(journal(x.events.slice(0,-1)),x.records)).toThrow();
  expect(()=>assertOriginalFailure(journal([...x.events,x.events.at(-1)!]),x.records)).toThrow();
  expect(()=>assertOriginalFailure(journal([...x.events,{event:'command-success',command:'observe-completed',details:{nonce}}]),x.records)).toThrow();
 });
 it('rejects broken chain and incomplete final line',()=>{const x=journal(original().events);expect(()=>decodeChain(x.slice(0,-1))).toThrow('INCOMPLETE_JOURNAL');expect(()=>decodeChain(x.replace('"sequence":2','"sequence":99'))).toThrow();});
 it('binds failed attempt and lock to the old nonce/source/command',()=>{const x=original();x.records['command-lock-private.json'].command='actor-retire';expect(()=>assertOriginalFailure(journal(x.events),x.records)).toThrow();});
 it('pins the frozen originals without reading private evidence',()=>{
  for(const [file,hash] of Object.entries(originalSources))expect(sha(fs.readFileSync('tests/remediation/f06/'+file))).toBe(hash);
  expect(Object.keys(originalEvidence)).toHaveLength(7);for(const hash of [...Object.values(originalEvidence),lifetimeHash])expect(hash).toMatch(/^[a-f0-9]{64}$/);
 });
});
describe('post-retry and retirement claims remain bounded',()=>{
 it('has exactly three continuation commands and no false pre-retry baseline',()=>{expect(continuationCommands).toEqual(['reconcile-after-browser-retry','actor-retire','resources-retire']);expect(limitations).toMatchObject({originalObserverFailureRetained:true,rawPreRetryCompletionSnapshot:false,browserPassClaim:false,replayClaim:false,responseLossTested:false});});
 it('compares RAW audit payload/history and allows only named retirement metadata',()=>{
  const before={identity:{documentId:1014},objects:[],observation:observed(),source:{status:'completed',intake_status:'uploaded',updated_at:time},currentRule:{is_active:true,updated_at:time,workspace_revision:'2',next_sequence_number:'261'}};
  const after=structuredClone(before);expect(()=>assertRawRetained(before,after)).not.toThrow();after.observation.audits[1].new_values.target_record=999;expect(()=>assertRawRetained(before,after)).toThrow('RAW_HISTORY_CHANGED:audits');
  const retired=structuredClone(before);retired.observation.documents[0].is_archived=true;retired.observation.documents[0].archived_at=time;retired.source.status='cancelled';retired.source.intake_status='discarded';retired.currentRule.is_active=false;retired.currentRule.workspace_revision='3';expect(()=>assertRawRetained(before,retired,{resourcesRetired:true})).not.toThrow();retired.currentRule.next_sequence_number='262';expect(()=>assertRawRetained(before,retired,{resourcesRetired:true})).toThrow();
 });
 it('independently ties historical byte attestations to exact current object metadata',()=>{
  const object={id:'object-a',bucket_id:'dms-temp',name:n02.sourcePath,version:'v1',updated_at:time},record={objects:[object],byteProofs:[{bucket:object.bucket_id,path:object.name,objectId:object.id,version:object.version,databaseUpdatedAt:time,apiLastModified:time,contentSha256:sourceDigest(),size:sourceBytes().length}]};
  expect(()=>assertByteAttestations(record,[object])).not.toThrow();expect(()=>assertByteAttestations(record,[{...object,version:'v2'}])).toThrow();expect(()=>assertByteAttestations({...record,byteProofs:[]},[object])).toThrow();
 });
});
describe('source-only execution boundaries',()=>{
 it('both new runtime entry points have parsable syntax and guarded direct execution',()=>{
  for(const file of ['n02-continuation.mjs','n02-continuation-resource-check.mjs']){const text=read(file),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS) as ts.SourceFile & {parseDiagnostics:unknown[]};expect(ast.parseDiagnostics).toEqual([]);expect(text).toContain('pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url');}
 });
 it('does not import frozen fixture/checker entries or call their failure-rejecting journal APIs',()=>{
  const source=read('n02-continuation.mjs');expect(source).toContain("await import('./n02-browser-runtime.mjs')");expect(source).not.toMatch(/(?:from|import\()['"]\.\/n02-browser-(?:fixture|resource-check)/);expect(source).not.toMatch(/rt\.(?:start|validateStored|succeed|append|receipt|exclusive)\(/);
  expect(source).not.toContain('runN02Fixture(');expect(source).not.toContain('freshReservation(');expect(source).not.toContain('createUser(');expect(source).not.toContain('uploadSource(');
 });
 it('never writes original receipts or removes the failed command lock',()=>{
  const source=read('n02-continuation.mjs');expect(source).toContain("'n02-continuation-'+n02.marker");expect(source).toContain("fs.openSync(local(name),'wx'");expect(source).toContain('fs.unlinkSync(lifetime)');expect(source).not.toMatch(/(?:writeFile|appendFile|unlinkSync|openSync)\([^\n]*(?:original,|path.join\(original)/);
  expect(source).toContain("assert.equal(sha(fs.readFileSync(checkedPath(lifetime))),lifetimeHash)");
 });
 it('checker has no writes to database, Auth/Storage requests or browser claims',()=>{
  const source=read('n02-continuation-resource-check.mjs');expect(source).toContain('openContinuation({readOnly:true,checker:true})');expect(source).not.toMatch(/\.sql\(|authAdmin\(|verifyBytes\(|runN02Continuation\(/);expect(source).toContain('currentByteDownload:false');expect(source).toContain('originalFailedCommandLockRetained:true');
 });
 it('matches the actual inherited allocator SQL rather than changing application code',()=>{
  const sql=fs.readFileSync('supabase/migrations/20261004000041_f06_numbering_failed_consumer_recovery.sql','utf8');expect(sql).toContain("jsonb_build_object('status',p_status,'operation_id',p_operation,'target_table',target_table,'target_record',target_record)");
 });
});
