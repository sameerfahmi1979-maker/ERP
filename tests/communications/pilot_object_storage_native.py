"""Isolated PostgreSQL: actual legacy regressions plus typed own-object allocation.

--without-object reproduces the original rejection of a legitimate object-byte
allocation without inventing physical disk evidence. No live SQL/provider calls.
"""
import argparse
import hashlib
import subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
MIGRATION=ROOT/'supabase/migrations/20261124111336_erp_comm_object_storage_baseline.sql'

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--without-object',action='store_true')
    parser.add_argument('--local-postgres',action='store_true')
    parser.add_argument('--collector-integration',action='store_true')
    parser.add_argument('--typed-collector',action='store_true')
    options=parser.parse_args()
    if options.collector_integration or options.typed_collector:
        import sys
        collector=ROOT/'tests/communications/pilot_baseline_collector_native.py'
        previous_read=Path.read_text;previous_argv=sys.argv[:]
        def with_object_sql(path,*args,**kwargs):
            content=previous_read(path,*args,**kwargs)
            if path.name=='20261124085300_erp_comm_pilot_baseline_collector.sql':
                content+='\n'+previous_read(MIGRATION,encoding='utf-8-sig')
            if path.name=='pilot_host_window_native.py':
                content=content.replace('import {fixture,configureObjectAllocation}', 'import {fixture}')
                if options.typed_collector:
                    content=content.replace('create schema auth;create schema erp_private;',"create schema auth;create schema erp_private;create schema storage;create table storage.objects(bucket_id text,name text,metadata jsonb);create table erp_private.chat_uploads(id uuid,size_bytes bigint,stage_permit uuid,cleanup_phase text);create table erp_private.ptt_recording_uploads(id uuid,permit_id uuid);")
            return content
        try:
            Path.read_text=with_object_sql
            sys.argv=[str(collector)]+(['--local-postgres']if options.local_postgres else[])
            namespace={'__file__':str(collector),'__name__':'object_collector_fixture'}
            content=previous_read(collector,encoding='utf-8-sig')
            if options.typed_collector:
                content=content.replace('s.profiles.push(p);',"""s.profiles.push(p);
const contextStart=fixtureSource.indexOf('export function configureObjectAllocation');
const contextSource=fixtureSource.slice(contextStart,fixtureSource.indexOf('test(',contextStart));
const configureObjectAllocation=new Function('writeFileSync','dirname','join','createHash',contextSource.replace('export function','function')+';return configureObjectAllocation;')(writeFileSync,file=>join(file,'..'),join,createHash);
configureObjectAllocation(s);
""")
                content=content.replace('create schema storage;create table storage.objects(bucket_id text,metadata jsonb);','')
                content=content.replace('insert into storage.objects values(', 'insert into storage.objects(bucket_id,metadata) values(')
                content=content.replace("storage_total_bytes::text||'/'||storage_communications_bytes::text", "coalesce(storage_total_bytes::text,'unknown')||'/'||storage_communications_bytes::text")
                content=content.replace("=='300/200'","=='unknown/200'")
                content=content.replace("checks.append('actual protected database/catalog measurement uses SQL clock and preserves quota')","assert sql(\"select known_object_bytes::text||'/'||unknown_object_count::text from erp_comm_cost.object_storage_observation;\").stdout.strip()=='200/0'\n        assert sql(\"select count(*)from erp_comm_cost.baseline_capacity_evidence;\").stdout.strip()=='1'\n        checks.append('typed own-object collector measures actual own bytes without global or physical storage claim')")
            exec(compile(content,str(collector),'exec'),namespace);namespace['main']()
        finally:Path.read_text=previous_read;sys.argv=previous_argv
        return
    fixture=ROOT/'tests/communications/pilot_baseline_native.py'
    source=fixture.read_text(encoding='utf-8-sig')
    source=source.replace('args = parser.parse_args()','args = parser.parse_args([])')
    if options.local_postgres:
        source=source.replace('result.stdout.startswith("17.11")','result.stdout.startswith("17.10")')
        source=source.replace('"postgres": result.stdout.strip(), "image": IMAGE','"postgres": "17.10 (isolated Windows fallback)", "image": "not used (no Docker)", "count": len(checks)')
    source=source.replace('sql(MIGRATION.read_text(encoding="utf-8-sig"))','sql(MIGRATION.read_text(encoding="utf-8-sig"))\n        if not WITHOUT_OBJECT: sql(OBJECT_MIGRATION.read_text(encoding="utf-8-sig"))')
    # The fixture already runs real physical admission/revocation/concurrency,
    # immutable holds, one-use, prepaid SOS/notice tails and no-reset USD5 tests.
    hook=r'''
        sql('create database object_allocation_case;');database='object_allocation_case'
        sql(f"""create schema auth;create schema erp_private;create schema storage;
          create table auth.users(id uuid primary key);insert into auth.users values('{OWNER}'),('{ADMIN}');
          create table public.user_profiles(id bigint,auth_user_id uuid,status text,must_change_password boolean);
          insert into public.user_profiles values(1,'{OWNER}','active',false),(2,'{ADMIN}','active',false);
          create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
          create function auth.jwt()returns jsonb language sql stable as $$select jsonb_build_object('session_id','{SESSION}','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',floor(extract(epoch from now())))))$$;
          create function public.f03_current_session_valid()returns boolean language sql as $$select true$$;
          create function erp_private.business_principal_is_active()returns boolean language sql as $$select true$$;
          create function erp_private.provider_actor_session_valid(bigint,uuid)returns boolean language sql as $$select $1=2 and $2='{SESSION}'::uuid$$;
          create table storage.objects(bucket_id text,name text,metadata jsonb);
          create table erp_private.chat_uploads(id uuid,size_bytes bigint,stage_permit uuid,cleanup_phase text);
          create table erp_private.ptt_recording_uploads(id uuid,permit_id uuid);
          insert into storage.objects values('unrelated-bucket','unknown-other','{{}}'),('erp-chat-media','accepted','{{"size":100}}');""")
        sql(CORE.read_text(encoding='utf-8-sig'));sql(MIGRATION.read_text(encoding='utf-8-sig'))
        if not WITHOUT_OBJECT: sql(OBJECT_MIGRATION.read_text(encoding='utf-8-sig'))
        sql(f"update erp_comm_cost.authority set owner_auth_id='{OWNER}',owner_binding_evidence='synthetic actual owner';")
        sql(decision(deadline=deadline))
        sql("""insert into erp_comm_cost.capacity(billing_account,dimension,unit,valid_from,valid_until,available_units,enabled)
          select 'synthetic-existing-plan',d,u,now()-interval'1 hour',now()+interval'1 hour',q,true from(values
          ('database','physical_database_bytes',20000000::numeric),('storage','allocated_storage_object_bytes',268435456::numeric),
          ('database','permanent_ledger_bytes',100000000::numeric),('database','units',100000000::numeric),('railway','units',100000000::numeric),('fcm','units',100000000::numeric))x(d,u,q);
          insert into erp_comm_cost.baseline_capacity_evidence(capacity_id,plan_reference,evidence_id,observed_at,valid_until,max_measurement_age,
          physical_limit_bytes,observed_total_bytes,observed_communications_bytes,reserved_other_bytes,safety_headroom_bytes,allocated_bytes,enabled)
          select id,'synthetic actual DB disk','synthetic DB metrics',now(),now()+interval'30 minutes',interval'5 minutes',100000000,10000000,0,10000000,10000000,20000000,true
          from erp_comm_cost.capacity where unit='physical_database_bytes';""")
        basis=f"""insert into erp_comm_cost.object_storage_allocation_basis(allocation_id,storage_capacity_id,approval_id,project_ref,organization_ref,billing_account,
          plan_name,spend_cap_observed,plan_evidence_id,plan_evidence_sha256,plan_observed_at,policy_evidence_id,policy_evidence_sha256,byte_quota,admission_ends_at,enabled)
          select '{ALLOCATION}',id,'{APPROVAL}','mmiefuieduzdiiwnqpie','synthetic-explicit-org','synthetic-existing-plan','Pro',true,
          'sha256:{'a'*64}','{'a'*64}',now()-interval'1 day','sha256:{'b'*64}','{'b'*64}',268435456,now()+interval'20 minutes',true
          from erp_comm_cost.capacity where unit='allocated_storage_object_bytes';"""
        allocation=f"""insert into erp_comm_cost.baseline_allocation(id,approval_id,database_capacity_id,storage_capacity_id,database_quota_bytes,storage_quota_bytes,
          valid_from,valid_until,policy_evidence,enabled)select '{ALLOCATION}','{APPROVAL}',d.id,s.id,10000000,268435456,now()-interval'1 second',
          now()+interval'20 minutes','sha256:{'b'*64}',true from erp_comm_cost.capacity d cross join erp_comm_cost.capacity s
          where d.unit='physical_database_bytes'and s.unit='allocated_storage_object_bytes';"""
        # One transaction pins an exact cutoff rather than drifting timestamps.
        if not WITHOUT_OBJECT:
            reject('unbound legacy pending chat stage blocks enrollment',"insert into erp_private.chat_uploads values(gen_random_uuid(),50,null,'attention');"+basis+allocation)
            reject('unknown OWN object size blocks enrollment',"insert into storage.objects values('erp-ptt-recordings','unknown','{}');"+basis+allocation)
            reject('wrong project cannot enroll',basis.replace('mmiefuieduzdiiwnqpie','another-project')+allocation)
            reject('wrong policy evidence cannot enroll',basis.replace('sha256:'+'b'*64,'sha256:'+'c'*64).replace("'"+'b'*64+"'","'"+'c'*64+"'")+allocation)
            reject('wrong billing account cannot enroll',basis.replace("'synthetic-existing-plan','Pro'","'other-account','Pro'")+allocation)
        result=sql('begin;'+('' if WITHOUT_OBJECT else basis)+allocation+'commit;',check=False)
        assert result.returncode==0,'Legitimate owner object allocation requires no invented physical storage evidence: '+result.stderr
        checks.append('typed object allocation needs no global physical or other-project byte claim')
        assert sql('select count(*)from erp_comm_cost.baseline_capacity_evidence;').stdout.strip()=='1'
        for role in('anon','authenticated','service_role'):
            for table in('object_storage_allocation_basis','object_storage_observation'):
                reject(role+' cannot write '+table,f'set role {role};delete from erp_comm_cost.{table}')
            reject(role+' cannot manufacture catalog observation',f"set role {role};select erp_comm_cost.observe_object_storage_allocation('{ALLOCATION}',null)")
        reject('object quota cannot renew or expand','update erp_comm_cost.object_storage_allocation_basis set byte_quota=byte_quota+1')
        reject('object receipt cannot be moved to another organization',"update erp_comm_cost.object_storage_allocation_basis set organization_ref='other'")
        reject('object basis cannot be deleted','delete from erp_comm_cost.object_storage_allocation_basis')
        def object_proof(op,units=1000000):
            return (proof(op,quota=100000).replace("'physical_storage_bytes'","'allocated_storage_object_bytes'")
                    +f"update erp_comm_cost.meter set upper_units={units} where operation_id='{op}'and capacity_id=(select storage_capacity_id from erp_comm_cost.baseline_allocation);")
        sql("begin;"+object_proof('object-alert',1).replace("'existing-plan:"+ALLOCATION+"'","'legacy prepaid alert evidence'")+"""
          update erp_comm_cost.proof set feature='push'where operation_id='object-alert';
          insert into erp_comm_cost.capacity(billing_account,dimension,unit,valid_from,valid_until,available_units,enabled)
          values('synthetic-existing-plan','railway','funded_budget_alert_actions',now()-interval'1 hour',now()+interval'1 hour',100,true);
          insert into erp_comm_cost.meter select 'object-alert','railway','bounded notice actions',true,now(),now()+interval'4 minutes',now()+interval'10 minutes',0,id,10
          from erp_comm_cost.capacity where unit='funded_budget_alert_actions';commit;""")
        end_epoch=int(sql("select extract(epoch from now()+interval'9 minutes')::bigint;").stdout.strip())
        alert_wire={'op':'budget.fundControl','kind':'budget_alert','subject':'1','maxActions':10,'endEpoch':end_epoch}
        object_alert=command('object-alert',feature='push',wire=alert_wire);assert object_alert['ok'],object_alert
        sql(f"insert into erp_comm_cost.control_pool(permit_id,kind,subject,max_actions,valid_until,continuing_zero_evidence,enabled)values('{object_alert['permitId']}','budget_alert','1',10,to_timestamp({end_epoch}),'legacy prepaid alert coverage',true);")
        sql('begin;'+object_proof('object-valid')+'commit;')
        assert covered('object-valid')=='t'
        original=command('object-valid',wire=bound_wire);assert original['ok'],original
        object_permit=original['permitId']
        sql(f"select erp_comm_cost.take_service_permit('{object_permit}','chat','communications','2','{SESSION}','{json.dumps(bound_wire)}');")
        stage=str(uuid.uuid4())
        sql(f"insert into erp_private.chat_uploads values('{stage}',500000,'{object_permit}','attention');insert into erp_comm_cost.cleanup_resource(permit_id,endpoint,resource_id,max_attempts)values('{object_permit}','discard_partial_upload','erp-chat-media/{stage}',3);")
        assert covered('object-valid')=='t'
        checks.append('actual positive object meter admits and captures immutable bytes')
        for label,change in[
            ('unknown own object',"insert into storage.objects values('erp-chat-media','unknown','{}')"),
            ('uncertain unbound chat stage',"insert into erp_private.chat_uploads values(gen_random_uuid(),268435456,null,'attention')"),
            ('uncertain PTT stage',"insert into erp_private.ptt_recording_uploads values(gen_random_uuid(),gen_random_uuid());insert into storage.objects values('erp-chat-media','large','{\"size\":230000000}')"),
            ('current own objects exhaust allocation',"insert into storage.objects values('erp-chat-media','large','{\"size\":268435456}')"),
            ('stale own measurement',"update erp_comm_cost.object_storage_observation set observed_at=now()-interval'6 minutes'"),
            ('revoked owner',f"update erp_comm_cost.approval set revoked_at=now()where id='{APPROVAL}'"),
            ('expired actual grant',f"update erp_comm_cost.approval set ends_at=now()-interval'1 second'where id='{APPROVAL}'"),
            ('disabled object basis',"update erp_comm_cost.object_storage_allocation_basis set enabled=false")]:
            assert sql('begin;'+change+";select erp_comm_cost.retention_covered(p)from erp_comm_cost.proof p where operation_id='object-valid';rollback;").stdout.strip()=='f',label
            assert sql('begin;'+change+f";select erp_comm_cost.permit_prepaid_current('{object_permit}');rollback;").stdout.strip()=='t',label+' stranded paid snapshot'
            checks.append(label+' holds new admission while original prepaid snapshot survives')
        # Every settled/expired hold remains debited; retained handoff adds catalog
        # bytes conservatively rather than releasing or reconciling the hold.
        held=sql("select sum(h.units)from erp_comm_cost.unit_hold h join erp_comm_cost.capacity c on c.id=h.capacity_id where c.unit='allocated_storage_object_bytes';").stdout.strip()
        sql(f"update erp_comm_cost.reservation set settled_micros=0,settled_at=now(),settlement_evidence='synthetic retained handoff',expires_at=now()-interval'1 second'where permit_id='{object_permit}';")
        assert sql("select sum(h.units)from erp_comm_cost.unit_hold h join erp_comm_cost.capacity c on c.id=h.capacity_id where c.unit='allocated_storage_object_bytes';").stdout.strip()==held
        sql("insert into storage.objects values('erp-chat-media','retained-handoff','{\"size\":1000000}');")
        assert covered('object-valid')=='t'
        checks.append('settlement expiry and retained handoff never refund allocated bytes')
        reject('new proof has no zero-byte object bypass',object_proof('object-zero',0),'baseline')
        sql('begin;'+object_proof('object-template',140000000)+"update erp_comm_cost.proof set actor_id='standing'where operation_id='object-template';insert into erp_comm_cost.standing_envelope values('communications','chat','object-template',true);commit;")
        with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
            races=list(pool.map(lambda op:command(op,wire=bound_wire),('object-race-one','object-race-two')))
        assert sum(bool(r['ok'])for r in races)==1,races
        checks.append('concurrent new reservations cannot exceed shared own-object byte quota')
        reject('a second object allocation cannot reset quota',basis.replace(ALLOCATION,str(uuid.uuid4()))+allocation)
        print(json.dumps({'objectMigrationSha256':hashlib.sha256(OBJECT_MIGRATION.read_bytes()).hexdigest(),'objectChecks':checks[-18:]},indent=2))
'''
    marker='        database = "feature_fixture"'
    assert source.count(marker)==1
    source=source.replace(marker,hook+'\n'+marker)
    namespace={'__file__':str(fixture),'__name__':'object_fixture','WITHOUT_OBJECT':options.without_object,'OBJECT_MIGRATION':MIGRATION}
    if options.local_postgres:
        from native_pg_fallback import NativePgDockerShim
        previous=subprocess.run
        try:
            with NativePgDockerShim(label='object-baseline')as shim:
                subprocess.run=shim.run
                exec(compile(source,str(fixture),'exec'),namespace);namespace['main']()
        finally:subprocess.run=previous
    else:
        exec(compile(source,str(fixture),'exec'),namespace);namespace['main']()

if __name__=='__main__':main()
