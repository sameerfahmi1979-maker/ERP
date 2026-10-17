// Offline synthetic/source-only proof. Imports ONLY pure contracts, never runtime.
import fs from 'node:fs';
import ts from 'typescript';
import {describe,expect,it} from 'vitest';
import {n01,commands,ownedRule,expectedPayload,resourceCreateSql,assertTaxonomy,assertRole,assertActor,
  actorPrepareSql,actorRetireSql,businessSql,observationSql,assertObservation,assertSequenceHistoryPreserved,assertNumberingProgress,retireResourcesSql,
  validatePermissions,decimal} from './n01-browser-contract.mjs';

const operation='11111111-1111-4111-8111-111111111111',authId='22222222-2222-4222-8222-222222222222';
const rule=()=>({id:701,rule_code:'MASTER_DMS_DOCUMENT',rule_name:'FDMCRSYNTHETIC',module_code:'DMS',module_name:'F06 synthetic DMS',document_type_code:'F06DMC',
  document_type_name:'F06 synthetic DMS',document_prefix:'F06DMC',format_template:'{DOC}-{SEQ6}',sequence_length:6,padding_character:'0',separator:'-',
  starting_sequence_number:1,reset_policy:'never',is_locked:false,is_active:false,effective_from:null,effective_to:null,
  current_sequence_number:'40',next_sequence_number:'41',workspace_revision:'9'});
const ledger=()=>({marker:'F06_LOCAL_20261001',productionRowsCopied:0,rows:[{table:'global_numbering_rules',id:701,marker:'FDMCRSYNTHETIC'}],
  intents:[{marker:'FDMCRSYNTHETIC',table:'global_numbering_rules',operation:'Create exact synthetic DMS numbering resource'}]});
const permissions=()=>n01.permissions.map((code:string,i:number)=>({id:1001+i,code,active:true}));
const resources=()=>({rule:rule(),roleId:801,categoryId:802,typeId:803,permissions:permissions(),pairs:permissions().map((p:{id:number},i:number)=>({id:1101+i,role_id:801,permission_id:p.id}))});
const base=()=>({authId,owner:{companyId:901}});
const prepared=()=>({...resources(),profileId:902,assignmentId:903});
function actor(){return {role:{id:801,role_code:n01.roleCode,role_name:n01.fullName,notes:n01.marker,is_active:true,is_system_role:false,is_assignable:false},pairs:resources().pairs,
  auth:{id:authId,email:n01.email,marker:n01.marker,confirmed:true,role:'authenticated',banned:null as boolean|null},
  profiles:[{id:902,auth_user_id:authId,full_name:n01.fullName,display_name:n01.fullName,notes:n01.marker,owner_company_id:901,branch_id:null,status:'active',must_change_password:false}],
  assignments:[{id:903,role_id:801,user_profile_id:902,owner_company_id:null as number|null,branch_id:null as number|null,is_active:true}],
  sessions:[{id:operation,userId:authId}],refreshIds:['1201']};}
function observed(){const documentNo='F06DMC-000041';return {
  documents:[{...expectedPayload(resources()),id:1301,document_no:documentNo,created_by:902,updated_by:902,is_archived:false,archived_at:null as string|null,owner_user_id:null,
    reminder_policy_id:null,legacy_document_code:null,deleted_at:null,current_version_id:null}],
  references:[{id:1302,numbering_rule_id:701,generation_status:'consumed',target_table_name:'dms_documents',target_record_id:1301,generated_reference_number:documentNo,
    generated_by:902,generated_sequence_number:'41',sequence_state_id:1303,consumed_at:'2026-10-05T00:00:00Z',reserved_at:'2026-10-05T00:00:00Z',manual_override_used:false}],
  requests:[{actor_id:902,operation_id:operation,reference_id:1302,request_hash:'a'.repeat(32),hashMatches:true}],
  events:[{id:1304,document_id:1301,event_type:'document_created',performed_by:902,description:'Document '+documentNo+' created'}],
  audits:[{id:1305,entity_name:'dms_documents',entity_id:1301,action:'create',actor_user_profile_id:902,entity_reference:documentNo,new_values:{title:n01.title,document_no:documentNo}},
    ...[['generate','reserved'],['update','consumed']].map(([action,status],i)=>({id:1306+i,entity_name:'global_numbering_generated_references',entity_id:1302,action,
      actor_user_profile_id:902,entity_reference:documentNo,new_values:{status,operation_id:operation}}))],
  sequences:[{id:1303,numbering_rule_id:701,reset_period_key:'GLOBAL',last_sequence_number:'41',next_sequence_number:'42',last_generated_reference:documentNo,updated_by:902}]};}
const read=(file:string)=>fs.readFileSync('tests/remediation/f06/'+file,'utf8');

describe('finite N01 fixture contracts',()=>{
  it('has one fixed marker and exactly the independently approved three capabilities',()=>{
    expect(n01.marker).toBe('F06N01B0516');expect(n01.permissions).toEqual(['dms.documents.view','dms.documents.upload','numbering.rules.generate']);
    expect(n01.email).toMatch(/@example\.invalid$/);expect(Object.isFrozen(n01)).toBe(true);expect(Object.isFrozen(n01.permissions)).toBe(true);
    expect(commands).toEqual(['resources-prepare','actor-prepare','observe-invalid','observe-created','observe-retained','actor-retire','resources-retire']);
  });
  it('requires existing active canonical definitions without creating or changing them',()=>{
    expect(validatePermissions(n01,permissions())).toEqual(permissions());
    expect(()=>validatePermissions(n01,permissions().slice(1))).toThrow();const inactive=permissions();inactive[0].active=false;expect(()=>validatePermissions(n01,inactive)).toThrow();
  });
  it('requires the exact original synthetic rule row and its creation intent',()=>{
    expect(ownedRule(ledger(),[rule()])).toEqual(rule());expect(()=>ownedRule(ledger(),[])).toThrow('EXISTING_CANONICAL_RULE_REQUIRED');
    const wrong=ledger();wrong.rows[0].id=702;expect(()=>ownedRule(wrong,[rule()])).toThrow('EXACT_ORIGINAL_RULE_OWNERSHIP_REQUIRED');
    const noIntent=ledger();noIntent.intents=[];expect(()=>ownedRule(noIntent,[rule()])).toThrow('ORIGINAL_RULE_INTENT_REQUIRED');
  });
  it.each(['rule_name','document_prefix','module_code','reset_policy','format_template'])('rejects changed rule ownership/definition field %s',key=>{
    expect(()=>ownedRule(ledger(),[{...rule(),[key]:'not the original'}])).toThrow();
  });
  it('rejects copied production data, duplicate ownership and locked or dated rules',()=>{
    expect(()=>ownedRule({...ledger(),productionRowsCopied:1},[rule()])).toThrow();const repeated=ledger();repeated.rows.push({...repeated.rows[0]});expect(()=>ownedRule(repeated,[rule()])).toThrow();
    expect(()=>ownedRule(ledger(),[{...rule(),is_locked:true}])).toThrow();expect(()=>ownedRule(ledger(),[{...rule(),effective_to:'2026-10-05'}])).toThrow();
  });
  it('enables only an inactive owned rule, and never resets or inserts a rule/counter',()=>{
    const sql=resourceCreateSql(rule());expect(sql).toContain('RESOURCE_PREIMAGE_CHANGED');expect(sql).toContain('where id=701 for update');
    expect(sql).toContain('set is_active=true where id=701');expect(sql).not.toMatch(/insert into public\.global_numbering|set (?:next|current)_sequence/);
    expect(resourceCreateSql({...rule(),is_active:true})).not.toContain('set is_active=true');
  });
  it('uses an unscoped internal draft with no dates, links, files or reminders',()=>{
    expect(expectedPayload(resources())).toEqual({title:n01.title,description:null,document_type_id:803,category_id:802,status:'draft',confidentiality_level:'internal',issue_date:null,expiry_date:null,owning_company_id:null,owning_branch_id:null,party_id:null});
    expect(resourceCreateSql(rule())).toContain("false,true,'internal',false,false,false");
  });
  it('matches nullable Auth ban status and one exact global assignment',()=>{
    expect(()=>assertRole(actor(),resources())).not.toThrow();expect(()=>assertActor(actor(),base(),prepared())).not.toThrow();
    const scoped=actor();scoped.assignments[0].owner_company_id=901;expect(()=>assertActor(scoped,base(),prepared())).toThrow();
    const extra=actor();extra.assignments.push({...extra.assignments[0],id:999});expect(()=>assertActor(extra,base(),prepared())).toThrow();
    expect(actorPrepareSql(base(),resources(),902)).toContain('values(902,801,null,null,true)');
  });
  it('retirement requires a ban and affects only captured own sessions/tokens',()=>{
    expect(()=>actorRetireSql(base(),prepared(),actor())).toThrow();const state=actor();state.auth.banned=true;
    const sql=actorRetireSql(base(),prepared(),state);expect(sql).toContain("id in ('1201')");expect(sql).toContain(`id in ('${operation}')`);
    expect(sql).toContain(`user_id='${authId}'`);expect(sql).not.toMatch(/delete from public\.|delete from auth\.(users|identities)/);
    state.sessions[0].userId=operation;expect(()=>actorRetireSql(base(),prepared(),state)).toThrow();
  });
});

describe('independent metadata observations',()=>{
  it('rejects even a single effect in the required-field negative observation',()=>{
    const empty={...observed(),documents:[],references:[],requests:[],events:[],audits:[]};expect(assertObservation(empty,resources(),902,{empty:true})).toBeNull();
    expect(()=>assertObservation(observed(),resources(),902,{empty:true})).toThrow();
  });
  it('binds one exact document, operation, consumed reference, event and three audits',()=>{
    expect(assertObservation(observed(),resources(),902)).toEqual({documentId:1301,documentNo:'F06DMC-000041',referenceId:1302,operationId:operation,eventId:1304,auditIds:[1305,1306,1307],sequenceId:1303});
  });
  it.each(['documents','references','requests','events','audits'])('rejects duplicated %s instead of adopting it by prefix',key=>{
    const value=observed() as unknown as Record<string,unknown[]>;value[key].push({...value[key][0] as object});expect(()=>assertObservation(value,resources(),902)).toThrow();
  });
  it('rejects a different payload hash, actor, reference link, title or permission-context destination',()=>{
    const hash=observed();hash.requests[0].hashMatches=false;expect(()=>assertObservation(hash,resources(),902)).toThrow('REQUEST_PAYLOAD_HASH_MISMATCH');
    const actorMismatch=observed();actorMismatch.references[0].generated_by=999;expect(()=>assertObservation(actorMismatch,resources(),902)).toThrow();
    const link=observed();link.requests[0].reference_id=999;expect(()=>assertObservation(link,resources(),902)).toThrow();
    const title=observed();title.documents[0].title='different';expect(()=>assertObservation(title,resources(),902)).toThrow();
    const destination=observed();Object.assign(destination.documents[0],{owning_company_id:901});expect(()=>assertObservation(destination,resources(),902)).toThrow();
  });
  it('requires archive retention, not deleted history',()=>{
    const value=observed();value.documents[0].is_archived=true;value.documents[0].archived_at='2026-10-05T01:00:00Z';expect(()=>assertObservation(value,resources(),902,{archived:true})).not.toThrow();
    Object.assign(value.documents[0],{deleted_at:'2026-10-05T01:00:00Z'});expect(()=>assertObservation(value,resources(),902,{archived:true})).toThrow();
  });
  it('proves monotonic counters using exact decimal strings rather than JS float coercion',()=>{
    expect(decimal('9007199254740999')).toBe(BigInt('9007199254740999'));expect(()=>decimal(42)).toThrow();expect(()=>decimal('04')).toThrow();
    expect(()=>assertNumberingProgress(rule(),{...rule(),current_sequence_number:'41',next_sequence_number:'42'},observed())).not.toThrow();
    expect(()=>assertNumberingProgress(rule(),{...rule(),current_sequence_number:'41',next_sequence_number:'41'},observed())).toThrow();
  });
  it('preserves the full selected sequence preimage except exact documented allocator writes',()=>{
    const after={...observed().sequences[0],module_code:'DMS',document_type_code:'F06DMC',document_prefix:'F06DMC',created_by:77,created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-05T00:00:00Z',last_generated_at:'2026-10-05T00:00:00Z',future_immutable:'retained'};
    const before={...after,last_sequence_number:'40',next_sequence_number:'41',last_generated_reference:'F06DMC-000040',updated_by:77,updated_at:'2026-10-01T00:00:00Z',last_generated_at:'2026-10-01T00:00:00Z'};
    expect(()=>assertSequenceHistoryPreserved([before],[after],1303)).not.toThrow();
    for(const field of ['created_by','created_at','module_code','document_type_code','document_prefix','future_immutable'])expect(()=>assertSequenceHistoryPreserved([before],[{...after,[field]:'changed'}],1303)).toThrow('CONSUMED_SEQUENCE_IMMUTABLE_CHANGED');
    expect(()=>assertSequenceHistoryPreserved([before],[{...after,last_sequence_number:'42',next_sequence_number:'43'}],1303)).toThrow('EXISTING_SEQUENCE_NEXT_CHANGED');
  });
  it('allows a new selected sequence with legitimate historical catchup, but no unrelated new or lost row',()=>{
    const selected={...observed().sequences[0],last_sequence_number:'80',next_sequence_number:'81'};
    const other={...selected,id:1400,reset_period_key:'HISTORICAL'};
    expect(()=>assertSequenceHistoryPreserved([other],[selected,other],1303)).not.toThrow();
    expect(()=>assertSequenceHistoryPreserved([other],[selected,other,{...other,id:1401}],1303)).toThrow('UNRELATED_SEQUENCE_CREATED');
    expect(()=>assertSequenceHistoryPreserved([other],[selected],1303)).toThrow('UNRELATED_SEQUENCE_CHANGED');
    expect(()=>assertSequenceHistoryPreserved([other],[selected,{...other,next_sequence_number:'82'}],1303)).toThrow('UNRELATED_SEQUENCE_CHANGED');
    expect(()=>assertSequenceHistoryPreserved([],[selected,selected],1303)).toThrow('DUPLICATE_SEQUENCE_ID');
  });
  it('requires the selected mutable reference and updater to match this exact consumed operation',()=>{
    const wrongReference=observed();wrongReference.sequences[0].last_generated_reference='different';expect(()=>assertObservation(wrongReference,resources(),902)).toThrow();
    const wrongActor=observed();wrongActor.sequences[0].updated_by=77;expect(()=>assertObservation(wrongActor,resources(),902)).toThrow();
  });
  it('computes the submitted JSON payload hash in PostgreSQL with exact allocation arguments',()=>{
    const sql=observationSql(resources(),902);expect(sql).toContain("jsonb_build_array(null,'MASTER_DMS_DOCUMENT',null,'reserved','dms_documents',null");
    expect(sql).toContain('hashMatches');expect(sql).toContain('F06 DMS metadata creation ');expect(sql).toContain('where actor_id=902');
    expect(sql).toContain('or title=');expect(sql).toContain('or document_type_id=803 or category_id=802');
  });
  it('retains rule counters, history and permission pairs during exact retirement',()=>{
    const sql=retireResourcesSql(resources(),prepared(),observed());
    expect(sql).toContain('set is_archived=true,archived_at=clock_timestamp() where id=1301');expect(sql).toContain('set is_active=false where id=701');
    expect(sql).not.toMatch(/delete\s+from|truncate\s|cascade\s|set (?:current|next)_sequence|update public\.permissions|role_permissions/);
    const active={...resources(),rule:{...rule(),is_active:true}};expect(retireResourcesSql(active,prepared(),observed())).not.toContain('set is_active=false where id=701');
  });
  it('fingerprints full unrelated rows and all Storage/provider/queue state without exposing values',()=>{
    const sql=businessSql(701,resources(),902);expect(sql).toContain('created_by is distinct from 902');expect(sql).toContain('actor_user_profile_id is distinct from 902');
    for(const table of ['storage.objects','storage.buckets','public.erp_email_queue','public.dms_ai_extraction_jobs','public.dms_ai_extraction_results'])expect(sql).toContain(table);
    expect(sql).toContain('md5(coalesce(jsonb_agg(to_jsonb(r)');expect(sql).not.toMatch(/\blike\b/i);
  });
});

describe('source-only execution and cleanup safety',()=>{
  const runtime=read('n01-browser-runtime.mjs'),fixture=read('n01-browser-fixture.mjs'),checker=read('n01-browser-resource-check.mjs'),contract=read('n01-browser-contract.mjs');
  it('pins the exact main-reported container image/start and rejects linked/remote targets',()=>{
    for(const term of ['c:/dev/agt-erp-f06','68ba17ecef10f3f77ae563b68d68bd146331bf844eeb735a3dae0d7831fd1d0c','sha256:21ab971149317ea9cd12a8126fe4ebb34def08c8972956b0958cba0924409dab',
      '2026-10-04T09:36:19.169643508Z','127.0.0.1','16621','16622','project-ref','REVIEWED_N01_SOURCE_REQUIRED','protected-local-parent'])expect(runtime).toContain(term);
  });
  it('all runtime side effects are behind factories/direct-entry guards, never offline imports',()=>{
    expect(runtime.indexOf('fs.readFileSync')).toBeGreaterThan(runtime.indexOf('export function openN01Runtime'));
    expect(runtime).toContain("await import('@supabase/supabase-js')");expect(runtime).not.toMatch(/^import .*supabase/m);
    for(const source of [fixture,checker])expect(source).toContain('pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url');
    for(const source of [runtime,fixture,checker])expect(source).not.toMatch(/from ['"].*(?:local-db|local\.test|fixtures\.mjs)/);
  });
  it('records resources before actor strict baseline and retains exact failure evidence',()=>{
    expect(fixture.indexOf("rt.append('resources-create-intent'")).toBeLessThan(fixture.indexOf('resourceCreateSql(rt.rule),true)'));
    expect(fixture).toContain("rt.completed('resources-prepare')");expect(fixture).toContain("rt.append('strict-actor-baseline'");
    expect(fixture).toContain("rt.completed('actor-retire')");expect(runtime).toContain("fs.openSync(lifetimeLock,'wx',0o600)");
    expect(runtime).toContain("command+'-attempt-private.json'");expect(runtime).toContain('FAILED_OUTCOME_REQUIRES_MAIN_RECONCILIATION');
    expect(runtime).toContain('previousEventHash');expect(runtime).toContain('noAutomaticRetry:true');
  });
  it('never modifies the original ledger or definitions and has no provider/storage consumer calls',()=>{
    expect(runtime).toContain('ORIGINAL_LEDGER_CHANGED');expect(runtime).toContain('sha(fs.readFileSync(ledgerPath))');
    for(const source of [runtime,fixture,checker,contract]){
      expect(source).not.toMatch(/writeFileSync|insert into public\.permissions|update public\.permissions|\.storage\.|\.rpc\(|sendEmail|resetPasswordForEmail|signInWithPassword/);
    }
    expect(fixture).toContain('email_confirm:true');expect(fixture).toContain('sendsEmail:false');expect(fixture).toContain('MAIN_RANDOM_PASSWORD_REQUIRED');
    expect(fixture).not.toMatch(/rt\.append\([^\n]*password/);
  });
  it('observation and independent checker cannot request a writing database transaction',()=>{
    expect(runtime).toContain("assert.ok(!readOnly||!write,'N01_OBSERVER_CHECKER_IS_READ_ONLY')");
    expect(fixture).toContain("openN01Runtime({readOnly:command.startsWith('observe-')})");expect(checker).toContain('openN01Runtime({readOnly:true})');
    expect(checker).not.toContain('.sql(');expect(checker).not.toContain('.authAdmin(');expect(checker).not.toContain('runN01Fixture');
  });
  it('checks retirement history/session sets independently and does not claim browser or response-loss success',()=>{
    for(const term of ['EXACT_PERMISSION_PAIRS_CHANGED','RETAINED_BUSINESS_HISTORY_CHANGED','result.sessionIds','intent.sessionIds','result.refreshIds','intent.refreshIds',
      'PASS_EXACT_N01_RESOURCES_ONLY','browserPassClaim:false','responseLossTested:false','replayClaim:false','repairs:0'])expect(checker).toContain(term);
    expect(fixture).toContain('UNCHANGED_IDENTITY_AND_HISTORY_ONLY');expect(fixture).toContain('responseLossTested:false');
    expect(fixture).toContain('assertSequenceHistoryPreserved(prepared.initial.sequences,observed.sequences,identity.sequenceId)');
    expect(checker).toContain('assertSequenceHistoryPreserved(prepared.initial.sequences,observed.sequences,identity.sequenceId)');
  });
  it('uses actual generated public table names and fields',()=>{
    const database=fs.readFileSync('src/types/database.ts','utf8');const sql=businessSql(701,resources(),902)+observationSql(resources(),902)+resourceCreateSql(rule())+retireResourcesSql(resources(),prepared(),observed());
    for(const table of new Set([...sql.matchAll(/(?:from|into|update|join) public\.([a-z_]+)/gi)].map(match=>match[1])))expect(database).toContain('      '+table+': {');
    for(const [table,fields] of [['dms_document_types',['type_code','default_confidentiality','requires_expiry_tracking','is_renewable','requires_approval']],['dms_documents',['is_archived','archived_at','deleted_at']],['user_profiles',['status','notes','must_change_password']]] as const){
      const row=database.split('      '+table+': {')[1].split('        Row: {')[1].split('        Insert: {')[0];for(const field of fields)expect(row).toContain('          '+field+':');
    }
  });
  it.each(['n01-browser-contract.mjs','n01-browser-runtime.mjs','n01-browser-fixture.mjs','n01-browser-resource-check.mjs'])('parses %s without importing it',file=>{
    const parsed=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);expect((parsed as unknown as {parseDiagnostics:unknown[]}).parseDiagnostics).toEqual([]);
  });
  it('taxonomy contract rejects active/retired mismatch and protected defaults',()=>{
    const taxonomy={category:{id:802,category_code:n01.categoryCode,name_en:n01.marker+' category',is_active:true,is_system:false,deleted_at:null},
      type:{id:803,type_code:n01.typeCode,name_en:n01.marker+' type',category_id:802,is_active:true,is_system:false,deleted_at:null,default_confidentiality:'internal',requires_expiry_tracking:false,is_renewable:false,requires_approval:false}};
    expect(()=>assertTaxonomy(taxonomy,resources())).not.toThrow();expect(()=>assertTaxonomy(taxonomy,resources(),false)).toThrow();taxonomy.type.is_system=true;expect(()=>assertTaxonomy(taxonomy,resources())).toThrow();
  });
});
