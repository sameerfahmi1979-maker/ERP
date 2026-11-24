"""Actual chat SQL plus offline generated pilot profiles in isolated PostgreSQL.

--without-window reproduces the real 24h stage / 2h funded cleanup mismatch.
No provider, live database, browser, device or secret access.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import uuid

ROOT=Path(__file__).resolve().parents[2]
MIGRATION=ROOT/'supabase/migrations/20261124114953_erp_comm_pilot_upload_window.sql'
OWNER='10000000-0000-4000-8000-000000000001'
SESSION='30000000-0000-4000-8000-000000000001'
APPROVAL='20000000-0000-4000-8000-000000000001'
DEPLOYMENT='40000000-0000-4000-8000-000000000001'

def run(without_window):
    name='pilot-upload-'+uuid.uuid4().hex[:12];checks=[]
    def docker(*args,data=None,check=True):
        result=subprocess.run(['docker',*args],input=data,text=True,capture_output=True)
        if check and result.returncode:raise RuntimeError(result.stderr or result.stdout)
        return result
    def sql(query,check=True):return docker('exec','-i',name,'psql','-h','127.0.0.1','-U','postgres','-XqAt','-v','ON_ERROR_STOP=1',data=query,check=check)
    def value(query):return sql(query).stdout.strip()
    def deny(label,query):
        result=sql('begin;'+query+';commit;',False);assert result.returncode,label+': forbidden operation accepted';checks.append(label)
    def q(data):return json.dumps(data).replace("'","''")
    def reserve(command,op=None,actor='1'):
        payload={'feature':'media_upload','scope':'communications','operationId':op or str(uuid.uuid4()),'actorId':actor,
          'upperBoundMicros':'0','liabilityEndsAt':None,'hostDeploymentId':DEPLOYMENT,'binding':{'actorSessionId':SESSION,'command':command}}
        return json.loads(value("set role service_role;select public.erp_comm_budget_command('reserve','"+q(payload)+"');"))
    def begin_upload():
        command={'op':'chat.uploadBegin','args':{'clientMutationId':str(uuid.uuid4()),'conversationId':conversation,'filename':'test.png','mime':'image/png','byteLength':4}}
        permit=reserve(command);assert permit.get('ok'),permit
        outcome=json.loads(value("set role authenticated;set test.actor='1';select public.erp_chat_v1('"+q({**command,'_budgetPermitId':permit['permitId']})+"');"))
        return outcome['uploadId'],permit['permitId'],command
    def stage_open(upload,actor=1):
        command={'op':'chat.stageOpen','args':{'uploadId':upload,'actorId':str(actor),'sessionId':SESSION}}
        permit=reserve(command,actor=str(actor));assert permit.get('ok'),permit
        result=sql(f"set role service_role;select public.erp_chat_stage_open('{upload}',{actor},'{SESSION}','{permit['permitId']}');",False)
        return result,permit['permitId']
    docker('run','--pull=never','--network','none','--name',name,'--detach','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','051f7b7b3abd')
    try:
        for _ in range(100):
            if sql('select 1',False).returncode==0:break
            time.sleep(.1)
        version=value('show server_version');assert version.startswith('17.10'),version
        fixture=(ROOT/'tests/communications/chat_fixture.sql').read_text(encoding='utf-8-sig')
        # This preexisting independently prepaid synthetic worker is finite2h.
        # Its actual heartbeat is capped again to the generated host end below.
        fixture=fixture.replace("interval '2 days'","interval '2 hours'").replace("interval '27 hours'","interval '2 hours'")
        sql(fixture)
        sql((ROOT/'tests/communications/notifications_fixture.sql').read_text(encoding='utf-8-sig'))
        sql('drop table erp_private.ptt_phones;')
        for suffix in('erp_communications_chat_v1','erp_communication_budget_v1','erp_ptt_control_v1','erp_ptt_recordings_v1','erp_communications_notifications_v1','erp_ptt_sos_v1','erp_communications_policy_v1'):
            sql(next((ROOT/'supabase/migrations').glob('*_'+suffix+'.sql')).read_text(encoding='utf-8-sig'))
        sql("update erp_comm_cost.authority set owner_auth_id=lpad('1',32,'0')::uuid,owner_binding_evidence='synthetic legacy fixture owner';")
        worker=str(uuid.uuid4());boot=str(uuid.uuid4())
        sql("update erp_private.comms_chat_gate set enabled=true;insert into erp_private.comms_policy_versions(version,is_current,terms_text) values('pilot-native',true,'Synthetic isolated native policy');insert into erp_private.comms_policy_acceptances(profile_id,version)select id,'pilot-native'from public.user_profiles;")
        direct={'op':'chat.direct','args':{'clientMutationId':str(uuid.uuid4()),'peerProfileId':'2'}}
        legacy_permit=value("select public.fixture_chat_permit(1,'chat','"+q(direct)+"');")
        conversation=json.loads(value("set role authenticated;set test.actor='1';select public.erp_chat_v1('"+q({**direct,'_budgetPermitId':legacy_permit})+"');"))['id']
        sql(f"insert into auth.users values('{OWNER}');update public.user_profiles set auth_user_id='{OWNER}'where id=1;update erp_comm_cost.authority set owner_auth_id='{OWNER}';")
        for filename in('20261124085000_erp_comm_pilot_baseline_retention.sql','20261124085100_erp_comm_pilot_worker_recovery.sql','20261124085200_erp_comm_pilot_host_window.sql','20261124085300_erp_comm_pilot_baseline_collector.sql','20261124111336_erp_comm_object_storage_baseline.sql'):
            sql((ROOT/'supabase/migrations'/filename).read_text(encoding='utf-8-sig'))
        sql(f"create or replace function auth.uid()returns uuid language sql stable as $$select case when current_setting('test.actor',true)='1'then'{OWNER}'::uuid else lpad(nullif(current_setting('test.actor',true),''),32,'0')::uuid end$$;"
            f"create or replace function auth.jwt()returns jsonb language sql stable as $$select jsonb_build_object('session_id',case when auth.uid()='{OWNER}'then'{SESSION}'::uuid else auth.uid()end,'amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',floor(extract(epoch from now())))))$$;"
            f"create or replace function erp_private.provider_actor_session_valid(bigint,uuid)returns boolean language sql as $$select case when $1=1 then $2='{SESSION}'::uuid else $2=lpad($1::text,32,'0')::uuid and $1<>7 end$$;")
        approval={'scope':'communications','clientMutationId':APPROVAL,'currency':'USD','maxMicros':'5000000','endsAt':'2026-11-30T19:59:00Z','features':['chat','realtime','media_upload','media_download','export','push','ptt_live','ptt_replay','sos']}
        sql("set role authenticated;set test.actor='1';select public.erp_comm_budget_operator('1','"+SESSION+"','budget.approve','"+q(approval)+"');")
        fingerprint=value(f"select encode(erp_comm_cost.baseline_approval_fingerprint(a),'hex')from erp_comm_cost.approval a where id='{APPROVAL}';")
        directory=Path(tempfile.mkdtemp(prefix='pilot-upload-profile-',dir=ROOT/'tmp'));output=directory/'generated.sql'
        script=r"""
import {readFileSync,writeFileSync,mkdtempSync}from'node:fs';import{join,dirname}from'node:path';import{tmpdir}from'node:os';import{createHash}from'node:crypto';
import{prepareProfiles}from'./tooling/local/prepare-communication-pilot-profiles.mjs';
const source=readFileSync('./tooling/local/prepare-communication-pilot-profiles.test.mjs','utf8');
const fixtureText=source.slice(source.indexOf('const chatCommands'),source.indexOf('async function run('));
const fixture=new Function('mkdtempSync','writeFileSync','rmSync','tmpdir','join','createHash',fixtureText.replace('export function fixture','function fixture')+';return fixture;')(mkdtempSync,writeFileSync,()=>{},tmpdir,join,createHash);
const contextStart=source.indexOf('export function configureObjectAllocation'),contextText=source.slice(contextStart,source.indexOf('test(',contextStart));
const configureObjectAllocation=new Function('writeFileSync','dirname','join','createHash',contextText.replace('export function','function')+';return configureObjectAllocation;')(writeFileSync,dirname,join,createHash);
const f=fixture(),s=f.spec,now=Date.now(),start=new Date(now-1000).toISOString(),end=new Date(now-1000+7200000).toISOString();
s.window.startsAt=start;for(const e of s.evidence){e.observedAt=start;e.validUntil=end;e.coveredUntil=end;}
s.approval.id=process.argv[1];s.approval.ownerAuthId=process.argv[2];s.approval.ownerProfileId='1';s.approval.fingerprint=process.argv[3];s.commissionerSessionId=process.argv[4];s.maxReservations=24;
s.hostFunding={deploymentId:process.argv[5],operationId:'upload-host-funding',billingAccount:'existing-railway-account',evidenceId:'host',computeMicros:'2400000',ledgerBytes:'1048576',databaseBytes:'1048576',storageBytes:'1',networkEgressBytes:'1000',networkEgressAvailableBytes:'1073741824',networkEgressMicros:'1'};
const base=s.profiles[0];base.usePrepaidHost=true;base.meters=base.meters.filter(m=>m.unit!=='cpu_and_ram_operation_seconds');
const alert=structuredClone(base);alert.feature='push';alert.maxReservations=1;alert.commands=['budget.fundControl'];alert.effects=[];alert.usePrepaidHost=false;alert.operationSeconds=1920;alert.control={kind:'budget_alert',subject:'1',maxActions:16,pollSeconds:30};alert.meters.push({dimension:'railway',unit:'cpu_and_ram_operation_seconds',billingAccount:'existing-railway-account',upperUnits:'1920',availableUnits:'7200',upperMicros:'600000',evidenceId:'operating'},{dimension:'fcm',unit:'dispatch_attempts',billingAccount:'existing-fcm-project',upperUnits:'8',availableUnits:'8',upperMicros:'0',evidenceId:'operating'});
base.feature='media_upload';base.mode='command';base.maxReservations=12;base.commands=['chat.uploadBegin','chat.uploadStatus','chat.uploadBind','chat.uploadVerified'];base.effects=[];base.databaseBytes='1048576';base.cleanup=[{endpoint:'discard_partial_upload',maxResources:1,maxAttempts:3,evidenceId:'operating'}];base.meters.push({dimension:'storage',unit:'bounded_storage_work',billingAccount:'existing-supabase-project',upperUnits:'1',availableUnits:'24',upperMicros:'0',evidenceId:'operating'});
const stage=structuredClone(base);stage.maxReservations=4;stage.commands=['chat.stageOpen'];stage.storageBytes='52428800';stage.cleanup=[{endpoint:'discard_partial_upload',maxResources:1,maxAttempts:3,evidenceId:'operating'}];
s.profiles=[base,stage,alert];configureObjectAllocation(s);writeFileSync(process.argv[6],prepareProfiles(s,{now}).sql);
"""
        result=subprocess.run([r'C:\dev\toolchains\node-v22.23.4-win-x64\node.exe','--input-type=module','-e',script,APPROVAL,OWNER,fingerprint,SESSION,DEPLOYMENT,str(output)],cwd=ROOT,text=True,capture_output=True)
        assert result.returncode==0,result.stderr or result.stdout
        sql(output.read_text(encoding='utf-8-sig'))
        def legacy_upload():
            legacy={'op':'chat.uploadBegin','args':{'clientMutationId':str(uuid.uuid4()),'conversationId':conversation,'filename':'legacy.png','mime':'image/png','byteLength':4}}
            ticket=value("select public.fixture_chat_permit(2,'media_upload','"+q(legacy)+"');")
            return json.loads(value("set role authenticated;set test.actor='2';select public.erp_chat_v1('"+q({**legacy,'_budgetPermitId':ticket})+"');"))['uploadId']
        old_upload=legacy_upload();old_expiry=value(f"select stage_expires_at from erp_private.chat_uploads where id='{old_upload}';")
        metadata_query="select json_build_array(proowner,proacl,prosecdef,provolatile,proconfig,proparallel,proleakproof)::text from pg_proc where oid='erp_private.chat_mutate(text,jsonb,bigint,uuid)'::regprocedure;"
        original_metadata=value(metadata_query)
        if not without_window:sql(MIGRATION.read_text(encoding='utf-8-sig'))
        assert value(metadata_query)==original_metadata
        checks.append('catalog replacement preserves original chat function ACL and execution properties')
        assert value(f"select stage_expires_at from erp_private.chat_uploads where id='{old_upload}';")==old_expiry
        checks.append('existing upload stage expiry is unchanged by amendment')
        new_legacy=legacy_upload()
        assert value(f"select stage_expires_at>clock_timestamp()+interval'23 hours 59 minutes'and stage_expires_at<=clock_timestamp()+interval'24 hours'from erp_private.chat_uploads where id='{new_legacy}';")=='t'
        checks.append('new independently funded legacy upload keeps original24h lifetime')
        sql(f"select public.fixture_chat_worker('{worker}','{boot}');")
        host_end=value('select ends_at from erp_comm_cost.host_window;')
        sql(f"set role service_role;select public.erp_chat_stage_claim('{worker}','{boot}',gen_random_uuid(),'{host_end}');")
        upload,begin_permit,command=begin_upload()
        opened,stage_permit=stage_open(upload)
        assert opened.returncode==0,'Funded two-hour pilot cannot open actual upload: '+opened.stderr+'; '+value(f"select json_build_object('expires',u.stage_expires_at,'hostEnd',w.ends_at,'workerCovered',cw.covered_until,'covers',erp_comm_cost.chat_stage_worker_covers(cw.worker,u.stage_expires_at+interval'1 hour',3))from erp_private.chat_uploads u cross join erp_comm_cost.host_window w cross join erp_private.chat_cleanup_worker cw where u.id='{upload}';")
        checks.append('real generated pilot uploadBegin and stageOpen fit the original funded host')
        assert value(f"select u.stage_expires_at=w.admission_ends_at and u.stage_expires_at+interval'1 hour'=w.ends_at and u.write_lease_until<=u.stage_expires_at from erp_private.chat_uploads u cross join erp_comm_cost.host_window w where u.id='{upload}';")=='t'
        checks.append('new stage expiry is exact admission cutoff; original one-hour cleanup tail fits')
        replay=reserve(command);assert replay['ok'],replay
        replayed=json.loads(value("set role authenticated;set test.actor='1';select public.erp_chat_v1('"+q({**command,'_budgetPermitId':replay['permitId']})+"');"))
        assert replayed['uploadId']==upload
        assert value(f"select u.stage_expires_at=w.admission_ends_at from erp_private.chat_uploads u cross join erp_comm_cost.host_window w where u.id='{upload}';")=='t'
        checks.append('idempotent uploadBegin replay cannot renew the original stage lifetime')
        assert value(f"select h.until_at=w.ends_at from erp_comm_cost.stage_poll_hold h cross join erp_comm_cost.host_window w where h.stage_permit='{stage_permit}';")=='t'
        for role in('anon','authenticated','service_role'):
            deny(role+' cannot manufacture shortened pilot lifetime',f"set role {role};select erp_comm_cost.pilot_upload_stage_expiry('{begin_permit}',1,'{q(command['args'])}')")
        deny('same stage permit remains one-use',f"set role service_role;select public.erp_chat_stage_open('{upload}',1,'{SESSION}','{stage_permit}')")
        bound_stage=value(f"select stage_permit from erp_private.chat_uploads where id='{upload}';")
        assert bound_stage==stage_permit
        for label,statement in[
            ('expired stage rejects opening',f"update erp_private.chat_uploads set stage_expires_at=clock_timestamp()-interval'1 second'where id='{upload}';"),
            ('stale worker cannot cover stage',"update erp_private.chat_cleanup_worker set seen_at=clock_timestamp()-interval'3 minutes';"),
            ('insufficient worker tail cannot cover stage',f"update erp_private.chat_cleanup_worker set covered_until='{host_end}'::timestamptz-interval'1 second';")]:
            fresh_command={'op':'chat.stageOpen','args':{'uploadId':upload,'actorId':'1','sessionId':SESSION}}
            fresh=reserve(fresh_command);assert fresh['ok'],fresh
            deny(label,statement+f"set role service_role;select public.erp_chat_stage_open('{upload}',1,'{SESSION}','{fresh['permitId']}')")
        source_command={'op':'chat.uploadBegin','args':{**command['args'],'clientMutationId':str(uuid.uuid4())}}
        origin=reserve(source_command);assert origin['ok'],origin
        consume=f"set test.actor='1';select erp_comm_cost.take_service_permit('{origin['permitId']}','media_upload','communications','1','{SESSION}','{q(source_command)}');"
        actual_args=q(source_command['args'])
        for label,actor,args_sql,change in[
            ('wrong actor cannot borrow upload cutoff',2,actual_args,''),
            ('different command cannot borrow upload cutoff',1,q({**source_command['args'],'filename':'other.png'}),''),
            ('different session cannot borrow upload cutoff',1,actual_args,"set test.actor='2';"),
            ('revoked owner cannot create upload stage',1,actual_args,f"update erp_comm_cost.approval set revoked_at=clock_timestamp()where id='{APPROVAL}';"),
            ('wrong deployment cannot borrow upload cutoff',1,actual_args,f"update erp_comm_cost.reservation set host_deployment_id=gen_random_uuid()where permit_id='{origin['permitId']}';")]:
            deny(label,consume+change+f"select erp_comm_cost.pilot_upload_stage_expiry('{origin['permitId']}',{actor},'{args_sql}')")
        deny('committed permit cannot create another upload',f"set test.actor='1';select erp_comm_cost.pilot_upload_stage_expiry('{begin_permit}',1,'{q(command['args'])}')")
        # Isolated test-only clock seam: replace this helper's captured local clock,
        # preserving the real source/binding/host checks and restoring exact source.
        original_source=value("select pg_get_functiondef('erp_comm_cost.pilot_upload_stage_expiry(uuid,bigint,jsonb)'::regprocedure);")
        assert original_source.count('n timestamptz:=clock_timestamp();')==1
        sql(original_source.replace('n timestamptz:=clock_timestamp();',"n timestamptz:=clock_timestamp()+interval'2 hours';"))
        deny('new stage admission cannot outlive funded host cutoff',consume+f"select erp_comm_cost.pilot_upload_stage_expiry('{origin['permitId']}',1,'{actual_args}')")
        sql(original_source)
        assert value("select pg_get_functiondef('erp_comm_cost.pilot_upload_stage_expiry(uuid,bigint,jsonb)'::regprocedure);")==original_source
        # The original positive immutable holds survive admission expiry and late
        # provider writes are rejected by the existing storage fence.
        held=value(f"select sum(units)from erp_comm_cost.unit_hold where permit_id='{stage_permit}';")
        deny('late catalog commit after stage expiry is fenced',f"update erp_private.chat_uploads set stage_expires_at=clock_timestamp()-interval'1 second'where id='{upload}';insert into storage.objects(bucket_id,name,metadata)values('erp-chat-media','{upload}','{{\"size\":4,\"mimetype\":\"image/png\"}}')")
        sql(f"update erp_comm_cost.reservation set settled_micros=0,settlement_evidence='synthetic retained allocation',settled_at=clock_timestamp()where permit_id='{stage_permit}';")
        assert value(f"select sum(units)from erp_comm_cost.unit_hold where permit_id='{stage_permit}';")==held
        checks.append('settlement and failed late write never refund original byte holds')
        assert value(f"select stage_expires_at from erp_private.chat_uploads where id='{old_upload}';")==old_expiry
        checks.append('legacy original row remains unchanged after pilot denials')
        print(json.dumps({'postgres':version,'checks':checks,'count':len(checks),'migrationSha256':hashlib.sha256(MIGRATION.read_bytes()).hexdigest(),'generatedSqlSha256':hashlib.sha256(output.read_bytes()).hexdigest()},indent=2))
    finally:docker('rm','--force',name)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--without-window',action='store_true');parser.add_argument('--local-postgres',action='store_true');args=parser.parse_args()
    assert args.local_postgres,'Use the authorized protected single-cluster PostgreSQL17.10 fallback'
    from native_pg_fallback import NativePgDockerShim
    previous=subprocess.run;previous_temp=os.environ.get('TEMP');os.environ['TEMP']=str(ROOT/'tmp')
    try:
        with NativePgDockerShim(label='pilot-upload')as shim:
            subprocess.run=shim.run;run(args.without_window)
    finally:
        subprocess.run=previous
        if previous_temp is None:os.environ.pop('TEMP',None)
        else:os.environ['TEMP']=previous_temp

if __name__=='__main__':main()
