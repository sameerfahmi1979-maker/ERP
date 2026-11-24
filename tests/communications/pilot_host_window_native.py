"""Disposable PG17 test: the pilot host prepayment is an enforceable dependency.

Synthetic fixture rows are test-only. No network, production SQL, provider or browser.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import uuid

ROOT=Path(__file__).resolve().parents[2]
HOST=ROOT/'supabase/migrations/20261124085200_erp_comm_pilot_host_window.sql'
OWNER='10000000-0000-4000-8000-000000000001'
SESSION='30000000-0000-4000-8000-000000000001'
APPROVAL='20000000-0000-4000-8000-000000000001'
DEPLOYMENT='40000000-0000-4000-8000-000000000001'
FUND='50000000-0000-4000-8000-000000000001'

def main(owner_object=False):
    assert HOST.exists(), 'Missing protected host prepayment migration'
    name='erp-host-window-'+uuid.uuid4().hex[:12]
    database='postgres'
    checks=[]
    def docker(*args,data=None,check=True):
        p=subprocess.run(['docker',*args],input=data,text=True,capture_output=True)
        if check and p.returncode: raise RuntimeError(p.stderr or p.stdout)
        return p
    def sql(q,check=True):
        return docker('exec','-i',name,'psql','-h','127.0.0.1','-U','postgres','-d',database,'-XqAt','-v','ON_ERROR_STOP=1',data=q,check=check)
    def deny(label,q):
        p=sql('begin;'+q+';commit;',False)
        assert p.returncode, label+': forbidden action accepted'
        checks.append(label)
    docker('run','--pull=never','--network','none','--name',name,'--detach','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust',os.environ.get('BUDGET_TEST_PG_IMAGE','051f7b7b3abd'))
    try:
        for _ in range(60):
            if sql('select 1;',False).returncode==0: break
            time.sleep(.25)
        else: raise RuntimeError('PG17 unavailable')
        setup_sql=f"""create role anon;create role authenticated;create role service_role bypassrls;
          create schema auth;create schema erp_private;create table auth.users(id uuid primary key);
          insert into auth.users values('{OWNER}');
          create table public.user_profiles(id bigint primary key,auth_user_id uuid,status text,must_change_password boolean);
          insert into public.user_profiles values(1,'{OWNER}','active',false);
          create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
          create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id','{SESSION}',
            'amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',floor(extract(epoch from now())))))$$;
          create function public.f03_current_session_valid() returns boolean language sql as $$select true$$;
          create function erp_private.business_principal_is_active() returns boolean language sql as $$select true$$;
          create function erp_private.provider_actor_session_valid(bigint,uuid) returns boolean language sql as $$select $1=1 and $2='{SESSION}'::uuid$$;"""
        if owner_object:
            setup_sql+="""create schema storage;create table storage.objects(bucket_id text,name text,metadata jsonb);
              create table erp_private.chat_uploads(id uuid,size_bytes bigint,stage_permit uuid,cleanup_phase text);
              create table erp_private.ptt_recording_uploads(id uuid,permit_id uuid);"""
        sql(setup_sql)
        sql((ROOT/'supabase/migrations/20261123095158_erp_communication_budget_v1.sql').read_text(encoding='utf-8-sig'))
        sql((ROOT/'supabase/migrations/20261124085000_erp_comm_pilot_baseline_retention.sql').read_text(encoding='utf-8-sig'))
        sql(HOST.read_text(encoding='utf-8-sig'))
        sql((ROOT/'supabase/migrations/20261124085300_erp_comm_pilot_baseline_collector.sql').read_text(encoding='utf-8-sig'))
        if owner_object:
            sql((ROOT/'supabase/migrations/20261124111336_erp_comm_object_storage_baseline.sql').read_text(encoding='utf-8-sig'))
        sql(f"update erp_comm_cost.authority set owner_auth_id='{OWNER}',owner_binding_evidence='synthetic owner';")
        args=json.dumps({'scope':'communications','clientMutationId':APPROVAL,'currency':'USD','maxMicros':'5000000','endsAt':'2026-11-30T19:59:00Z','features':['chat','realtime','media_upload','media_download','export','push','ptt_live','ptt_replay','sos']})
        sql(f"set role authenticated;set test.actor='{OWNER}';select public.erp_comm_budget_operator('1','{SESSION}','budget.approve','{args}');")
        sql("""insert into erp_comm_cost.capacity(billing_account,dimension,unit,valid_from,valid_until,available_units,enabled)
          select 'synthetic-railway',d,u,now()-interval '1 hour',now()+interval '3 hours',v,true from(values
          ('railway','funded_host_wall_seconds',7200::numeric),('railway','funded_host_cpu_seconds',172800::numeric),
          ('railway','funded_host_ram_byte_seconds',172800000000000::numeric),('railway','prepaid_host_operation_slots',20::numeric),
          ('railway','network_egress_bytes',10000000::numeric),('database','permanent_ledger_bytes',100000000::numeric),
          ('database','funded_budget_alert_actions',16::numeric),('fcm','attempts',16::numeric)) q(d,u,v);""")
        sql(f"""insert into erp_comm_cost.proof values('host-funding','communications','pilot-commissioner','chat',null,
          now()+interval '2 hours',now()+interval '2 hours',interval '5 minutes','synthetic legacy retention','synthetic frozen host',0,'{APPROVAL}');
          insert into erp_comm_cost.reservation(operation_id,permit_id,scope,actor_id,feature,approval_id,liability_ends_at,floor_micros,reserved_micros,issued_at,expires_at)
          values('host-funding','{FUND}','communications','pilot-commissioner','chat','{APPROVAL}',null,2400000,2400000,now(),now()+interval '4 minutes');
          insert into erp_comm_cost.meter select 'host-funding',dimension,'synthetic bounded host receipt',true,now(),now()+interval '2 hours',now()+interval '2 hours',
            case when unit='funded_host_wall_seconds' then 2400000 else 0 end,id,available_units from erp_comm_cost.capacity where unit like 'funded_host_%';
          insert into erp_comm_cost.unit_hold select '{FUND}',id,available_units from erp_comm_cost.capacity where unit like 'funded_host_%';""")
        enroll=f"""insert into erp_comm_cost.host_window(funding_permit,approval_id,deployment_id,starts_at,admission_ends_at,ends_at,cpu_count,memory_bytes,max_operations,host_evidence,enabled)
          select '{FUND}','{APPROVAL}','{DEPLOYMENT}',p.operational_stop_by-interval '2 hours',p.operational_stop_by-interval '1 hour',p.operational_stop_by,24,24000000000,20,'synthetic actual host limits',true
          from erp_comm_cost.proof p where operation_id='host-funding'"""
        deny('insufficient whole-host money',"update erp_comm_cost.reservation set reserved_micros=2399999 where operation_id='host-funding';"+enroll)
        deny('unfunded CPU units',"delete from erp_comm_cost.unit_hold where capacity_id=(select id from erp_comm_cost.capacity where unit='funded_host_cpu_seconds');"+enroll)
        sql(enroll)
        assert sql(f"select consumed_at is not null from erp_comm_cost.reservation where permit_id='{FUND}';").stdout.strip()=='t'
        checks.append('host enrollment consumes the positive whole-host reservation')
        deny('immutable host deployment',"update erp_comm_cost.host_window set deployment_id=gen_random_uuid()")
        sql(f"""insert into erp_comm_cost.proof values('dependent','communications','1','chat',null,now()+interval '1 hour',now()+interval '1 hour',interval '5 minutes','synthetic legacy retention','bounded op',0,'{APPROVAL}');
          insert into erp_comm_cost.meter select 'dependent',dimension,case when unit='prepaid_host_operation_slots' then 'prepaid-host:{FUND}' else 'synthetic bounded egress/ledger' end,
          true,now(),now()+interval '1 hour',now()+interval '2 hours',case when unit='network_egress_bytes' then 1 else 0 end,id,
          case when unit='permanent_ledger_bytes' then 1000000 else 1 end from erp_comm_cost.capacity where unit in('prepaid_host_operation_slots','network_egress_bytes','permanent_ledger_bytes');""")
        sql(f"insert into erp_comm_cost.host_proof_link values('dependent','{FUND}');")
        good=f"select erp_comm_cost.host_operation_covered('dependent','{APPROVAL}','{DEPLOYMENT}',true);"
        assert sql(good).stdout.strip()=='t';checks.append('active exact deployment and prepaid shared physical slot')
        assert sql("select erp_comm_cost.host_operation_covered('dependent',null,null,true);").stdout.strip()=='f';checks.append('missing deployment or approval held')
        assert sql(good.replace(DEPLOYMENT,str(uuid.uuid4()))).stdout.strip()=='f';checks.append('other deployment held')
        for label,change in [
          ('settled funding held',f"update erp_comm_cost.reservation set settled_micros=2400000,settlement_evidence='synthetic final',settled_at=now() where permit_id='{FUND}'"),
          ('revoked actual owner grant held',f"update erp_comm_cost.approval set revoked_at=now() where id='{APPROVAL}'"),
          ('missing physical operation slot held',"delete from erp_comm_cost.meter where operation_id='dependent' and dimension='railway' and upper_micros=0"),
          ('missing positive egress held',"delete from erp_comm_cost.meter where operation_id='dependent' and upper_micros=1"),
        ]:
            p=sql('begin;'+change+';'+good+'rollback;').stdout.strip()
            assert p=='f',(label,p);checks.append(label)
        revoked=f"update erp_comm_cost.approval set revoked_at=now() where id='{APPROVAL}';"
        p=sql('begin;'+revoked+"select erp_comm_cost.host_window_funded(w,false) from erp_comm_cost.host_window w;rollback;").stdout.strip()
        assert p=='t',p;checks.append('revocation retains already-funded cleanup coverage through original cutoff')
        deny('service role cannot write host authority',"set role service_role;delete from erp_comm_cost.host_window")
        # Execute the real compiler's SQL against this isolated database; text-only
        # assertions cannot catch PostgreSQL/schema/canonical-binding incompatibility.
        fingerprint=sql(f"select encode(erp_comm_cost.baseline_approval_fingerprint(a),'hex') from erp_comm_cost.approval a where id='{APPROVAL}';").stdout.strip()
        with tempfile.TemporaryDirectory(prefix='pilot-profile-native-',dir=ROOT/'tmp') as folder:
            output=Path(folder)/'generated.sql'
            script="""import {fixture,configureObjectAllocation} from './tooling/local/prepare-communication-pilot-profiles.test.mjs';
import {prepareProfiles} from './tooling/local/prepare-communication-pilot-profiles.mjs';
import {writeFileSync} from 'node:fs';
const f=fixture();try{const s=f.spec,now=Date.now(),start=new Date(now-1000).toISOString(),end=new Date(now-1000+7200000).toISOString();
s.window.startsAt=start;for(const e of s.evidence){e.observedAt=start;e.validUntil=end;e.coveredUntil=end;}
s.approval.id=process.argv[1];s.approval.ownerAuthId=process.argv[2];s.approval.ownerProfileId='1';s.approval.fingerprint=process.argv[3];s.commissionerSessionId=process.argv[4];s.maxReservations=24;
const c=structuredClone(s.profiles[0]);c.feature='push';c.maxReservations=1;c.commands=['budget.fundControl'];c.effects=[];c.control={kind:'budget_alert',subject:'1',maxActions:16,pollSeconds:30};c.operationSeconds=1920;c.meters[0].upperUnits='1920';c.meters[0].upperMicros='600000';
c.meters.push({dimension:'fcm',unit:'dispatch_attempts',billingAccount:'existing-fcm-project',upperUnits:'8',availableUnits:'8',upperMicros:'0',evidenceId:'operating'});s.profiles.push(c);
writeFileSync(process.argv[5],prepareProfiles(s,{now}).sql);
}finally{f.cleanup();}
"""
            if owner_object:
                script=script.replace("writeFileSync(process.argv[5],prepareProfiles(s,{now}).sql);","configureObjectAllocation(s);writeFileSync(process.argv[5],prepareProfiles(s,{now}).sql);")
            p=subprocess.run([r'C:\dev\toolchains\node-v22.23.4-win-x64\node.exe','--input-type=module','-e',script,APPROVAL,OWNER,fingerprint,SESSION,str(output)],cwd=ROOT,capture_output=True,text=True)
            assert p.returncode==0,p.stderr or p.stdout
            sql(output.read_text(encoding='utf8'))
        assert sql("select count(*) from erp_comm_cost.control_pool where kind='budget_alert';").stdout.strip()=='1'
        checks.append('real compiler SQL enrolls measured allocation and canonical owner-alert control')
        payload={'feature':'chat','actorId':'1','operationId':'new-dependent','scope':'communications','upperBoundMicros':'0','liabilityEndsAt':None,'hostDeploymentId':DEPLOYMENT,'binding':{'actorSessionId':SESSION,'command':{'op':'chat.messages','args':{}}}}
        # Exact proof actor/binding is deliberately synthetic and does not execute a business command.
        sql("insert into erp_comm_cost.standing_envelope values('communications','chat','dependent',true) on conflict(scope,feature) do update set template_id=excluded.template_id;")
        response=json.loads(sql("set role service_role;select public.erp_comm_budget_command('reserve','"+json.dumps(payload)+"');").stdout)
        assert response.get('ok') is True,response
        assert sql("select host_deployment_id::text from erp_comm_cost.reservation where operation_id='new-dependent';").stdout.strip()==DEPLOYMENT
        assert sql("select count(*) from erp_comm_cost.host_proof_link where operation_id='new-dependent';").stdout.strip()=='1'
        checks.append('real reserve atomically clones protected host link and server deployment')
        deny('permit consumption rejects a settled host prepayment',f"update erp_comm_cost.reservation set settled_micros=2400000,settlement_evidence='synthetic final',settled_at=now() where permit_id='{FUND}';select erp_comm_cost.take_service_permit('{response['permitId']}','chat','communications','1','{SESSION}','{{\"op\":\"chat.messages\",\"args\":{{}}}}');")
        deny('ordinary user permit is not a cleanup continuation after revocation',f"update erp_comm_cost.approval set revoked_at=now() where id='{APPROVAL}';select erp_comm_cost.take_service_permit('{response['permitId']}','chat','communications','1','{SESSION}','{{\"op\":\"chat.messages\",\"args\":{{}}}}');")
        # A fresh independent database rehearses full generated reserve -> positive
        # host enrollment -> linked feature issuance, including the real triggers.
        sql('create database compiled_host_case;');database='compiled_host_case'
        sql(setup_sql.replace('create role anon;create role authenticated;create role service_role bypassrls;',''))
        for filename in ['20261123095158_erp_communication_budget_v1.sql','20261124085000_erp_comm_pilot_baseline_retention.sql','20261124085200_erp_comm_pilot_host_window.sql','20261124085300_erp_comm_pilot_baseline_collector.sql']:
            sql((ROOT/'supabase/migrations'/filename).read_text(encoding='utf-8-sig'))
        if owner_object:
            sql((ROOT/'supabase/migrations/20261124111336_erp_comm_object_storage_baseline.sql').read_text(encoding='utf-8-sig'))
        sql(f"update erp_comm_cost.authority set owner_auth_id='{OWNER}',owner_binding_evidence='synthetic owner';")
        sql(f"set role authenticated;set test.actor='{OWNER}';select public.erp_comm_budget_operator('1','{SESSION}','budget.approve','{args}');")
        fingerprint=sql(f"select encode(erp_comm_cost.baseline_approval_fingerprint(a),'hex') from erp_comm_cost.approval a where id='{APPROVAL}';").stdout.strip()
        with tempfile.TemporaryDirectory(prefix='pilot-host-codegen-',dir=ROOT/'tmp') as folder:
            output=Path(folder)/'generated.sql'
            extra="""
s.hostFunding={deploymentId:'"""+DEPLOYMENT+"""',operationId:'compiled-host-funding',billingAccount:'existing-railway-account',evidenceId:'host',computeMicros:'2400000',ledgerBytes:'1048576',databaseBytes:'1048576',storageBytes:'1',networkEgressBytes:'1000',networkEgressAvailableBytes:'1073741824',networkEgressMicros:'1'};
s.profiles[0].usePrepaidHost=true;s.profiles[0].meters=s.profiles[0].meters.filter(m=>m.unit!=='cpu_and_ram_operation_seconds');
const w=structuredClone(s.profiles[0]);s.profiles[0].mode='command';s.profiles[0].commands=['chat.messages'];s.profiles[0].effects=[];s.profiles[0].maxReservations=16;s.profiles[0].databaseBytes='1048576';
w.mode='command';w.commands=['chat.send'];w.effects=w.effects.filter(e=>e.command==='chat.send');w.maxReservations=4;w.databaseBytes='2097152';s.profiles.push(w);
"""
            combined=script.replace('writeFileSync(process.argv[5],prepareProfiles(s,{now}).sql);',extra+'writeFileSync(process.argv[5],prepareProfiles(s,{now}).sql);')
            p=subprocess.run([r'C:\dev\toolchains\node-v22.23.4-win-x64\node.exe','--input-type=module','-e',combined,APPROVAL,OWNER,fingerprint,SESSION,str(output)],cwd=ROOT,capture_output=True,text=True)
            assert p.returncode==0,p.stderr or p.stdout
            sql(output.read_text(encoding='utf8'))
        assert sql('select count(*) from erp_comm_cost.host_window;').stdout.strip()=='1'
        payload['operationId']='compiled-active'
        response=json.loads(sql("set role service_role;select public.erp_comm_budget_command('reserve','"+json.dumps(payload)+"');").stdout)
        assert response.get('ok') is True,response
        assert sql("select count(*) from erp_comm_cost.host_proof_link where operation_id='compiled-active';").stdout.strip()=='1'
        checks.append('generated shared-host plan books real positive prepay and issues linked physical permit')
        assert sql("select m.upper_units::text from erp_comm_cost.meter m join erp_comm_cost.capacity c on c.id=m.capacity_id where m.operation_id='compiled-active' and c.unit='physical_database_bytes';").stdout.strip()=='1048576'
        write_payload={**payload,'operationId':'compiled-write','binding':{'actorSessionId':SESSION,'command':{'op':'chat.send','args':{}}}}
        write_response=json.loads(sql("set role service_role;select public.erp_comm_budget_command('reserve','"+json.dumps(write_payload)+"');").stdout)
        assert write_response.get('ok') is True,write_response
        assert sql("select m.upper_units::text from erp_comm_cost.meter m join erp_comm_cost.capacity c on c.id=m.capacity_id where m.operation_id='compiled-write' and c.unit='physical_database_bytes';").stdout.strip()=='2097152'
        checks.append('exact read and write profiles independently reserve their genuine byte bounds')
        deny('cheap read permit cannot fund a different command',f"select erp_comm_cost.take_service_permit('{response['permitId']}','chat','communications','1','{SESSION}','{{\"op\":\"chat.send\",\"args\":{{}}}}');")
        sql("insert into erp_comm_cost.standing_envelope select 'communications','chat',template_id,true from erp_comm_cost.command_envelope where command_op='chat.messages';")
        bad={**payload,'operationId':'unmatched-op','binding':{'actorSessionId':SESSION,'command':{'op':'chat.delete','args':{}}}}
        held=json.loads(sql("set role service_role;select public.erp_comm_budget_command('reserve','"+json.dumps(bad)+"');").stdout)
        assert held=={'ok':False,'reason':'command_profile_unavailable'},held
        checks.append('unmatched exact command cannot borrow legacy wildcard profile')
        deny('command enrollment rejects mismatched private feature proof',"insert into erp_comm_cost.command_envelope select 'communications','push','notifications.deliver',template_id,true from erp_comm_cost.command_envelope where command_op='chat.messages';")
        deny('service role cannot change command profiles',"set role service_role;delete from erp_comm_cost.command_envelope")
        # Fund a real original control purpose under the shared host before changing
        # admission capacity. Current observations must not revoke paid cleanup.
        read_template=sql("select template_id from erp_comm_cost.command_envelope where command_op='chat.messages';").stdout.strip()
        sql(f"""begin;insert into erp_comm_cost.proof select 'funded-terms',scope,'1',feature,liability_ends_at,operational_stop_by,valid_until,max_meter_age,
          retained_at_zero_cost_evidence,shutdown_evidence,headroom_micros,approval_id from erp_comm_cost.proof where operation_id='{read_template}';
          insert into erp_comm_cost.meter select 'funded-terms',dimension,evidence_id,complete,observed_at,valid_until,covered_until,upper_micros,capacity_id,upper_units from erp_comm_cost.meter where operation_id='{read_template}';
          insert into erp_comm_cost.host_proof_link select 'funded-terms',funding_permit from erp_comm_cost.host_proof_link where operation_id='{read_template}';
          insert into erp_comm_cost.capacity(billing_account,dimension,unit,valid_from,valid_until,available_units,enabled)
          select 'existing-supabase-project','database','funded_terms_actions',starts_at,ends_at,2,true from erp_comm_cost.host_window;
          insert into erp_comm_cost.meter select 'funded-terms','database','synthetic already-funded terms actions',true,now(),w.ends_at,w.ends_at,0,c.id,2
          from erp_comm_cost.capacity c cross join erp_comm_cost.host_window w where c.unit='funded_terms_actions';commit;""")
        end_epoch=int(sql("select extract(epoch from ends_at)::bigint from erp_comm_cost.host_window;").stdout.strip())
        terms={'op':'budget.fundControl','kind':'terms','subject':'1','maxActions':2,'endEpoch':end_epoch}
        control_payload={**payload,'operationId':'funded-terms','binding':{'actorSessionId':SESSION,'command':terms}}
        funded=json.loads(sql("set role service_role;select public.erp_comm_budget_command('reserve','"+json.dumps(control_payload)+"');").stdout)
        assert funded.get('ok') is True,funded
        sql(f"insert into erp_comm_cost.control_pool(permit_id,kind,subject,max_actions,valid_until,continuing_zero_evidence,poll_seconds,enabled) select '{funded['permitId']}','terms','1',2,w.ends_at,p.retained_at_zero_cost_evidence,30,true from erp_comm_cost.host_window w cross join erp_comm_cost.proof p where p.operation_id='funded-terms';")
        reduction="update erp_comm_cost.capacity set available_units=0 where unit='prepaid_host_operation_slots';"
        paid="select erp_comm_cost.debit_control('terms','1',gen_random_uuid()) is not null;"
        p=sql('begin;'+reduction+paid+'rollback;').stdout.strip()
        assert p=='t',('already-funded control was blocked by changed admission capacity',p)
        checks.append('paid control survives current operation-slot capacity reduction')
        p=sql('begin;'+reduction+f"update erp_comm_cost.approval set revoked_at=now() where id='{APPROVAL}';update erp_comm_cost.baseline_capacity_evidence set observed_at=now()-interval '10 minutes';"+paid+'rollback;').stdout.strip()
        assert p=='t',('original paid control lost its immutable tail',p)
        checks.append('paid control survives capacity reduction plus revoked stale new admission')
        p=sql('begin;'+reduction+f"select erp_comm_cost.host_operation_covered('{read_template}','{APPROVAL}','{DEPLOYMENT}',true);rollback;").stdout.strip()
        assert p=='f',p;checks.append('new admission remains closed when operation slots shrink')
        if owner_object:
            assert sql("select count(*) from erp_comm_cost.baseline_capacity_evidence e join erp_comm_cost.capacity c on c.id=e.capacity_id where c.dimension='storage';").stdout.strip()=='0'
            checks.append('generated object allocation enrolls without any fictitious Storage physical evidence')
            coverage=f"select erp_comm_cost.retention_covered(p) from erp_comm_cost.proof p where operation_id='{read_template}';"
            assert sql("begin;insert into storage.objects values('unrelated-erp-bucket','unknown',null);"+coverage+'rollback;').stdout.strip()=='t'
            checks.append('unrelated unknown object size does not pretend to measure global physical capacity')
            assert sql("begin;insert into storage.objects values('erp-chat-media','unknown',null);"+coverage+'rollback;').stdout.strip()=='f'
            checks.append('unknown own object blocks new retention admission')
            assert sql("begin;insert into storage.objects values('erp-chat-media','large','{\"size\":268435456}');"+coverage+'rollback;').stdout.strip()=='f'
            checks.append('actual own bytes plus permanent held bytes cannot exceed 256 MiB')
            assert sql("begin;update erp_comm_cost.object_storage_observation set observed_at=now()-interval '10 minutes';"+paid+'rollback;').stdout.strip()=='t'
            checks.append('stale own-object observation preserves already-funded cleanup tail')
        print(json.dumps({'checks':checks,'count':len(checks)},indent=2))
    finally: docker('rm','--force',name)

if __name__=='__main__':
    if '--local-postgres' in sys.argv:
        from native_pg_fallback import NativePgDockerShim
        with NativePgDockerShim(label='host-window') as shim:
            original_run=subprocess.run
            subprocess.run=shim.run
            try: main('--owner-object-allocation' in sys.argv)
            finally: subprocess.run=original_run
    else: main('--owner-object-allocation' in sys.argv)
