"""Real isolated PostgreSQL collector rehearsal using the existing exact host fixture.

--without-collector proves the missing protected refresh claim assertion is red.
No browser, live database, provider, keys, network, pulls or existing test edits.
"""
import argparse
from contextlib import contextmanager
import os
from pathlib import Path
import subprocess
import tempfile

ROOT=Path(__file__).resolve().parents[2]

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--without-collector',action='store_true')
    parser.add_argument('--local-postgres',action='store_true')
    options=parser.parse_args()
    fixture=ROOT/'tests/communications/pilot_host_window_native.py'
    source=fixture.read_text(encoding='utf-8-sig')
    # The host fixture may already load the collector for generated certificates.
    # Own its ordering here so the red path really omits it and green applies once.
    source=source.replace("        sql((ROOT/'supabase/migrations/20261124085300_erp_comm_pilot_baseline_collector.sql').read_text(encoding='utf-8-sig'))\n","")
    source=source.replace(",'20261124085300_erp_comm_pilot_baseline_collector.sql'","")
    if options.local_postgres:
        source=source.replace('tempfile.TemporaryDirectory(', 'retained_directory(')
        source=source.replace("import {fixture} from './tooling/local/prepare-communication-pilot-profiles.test.mjs';", """
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
const fixtureSource=readFileSync('./tooling/local/prepare-communication-pilot-profiles.test.mjs','utf8');
const fixtureText=fixtureSource.slice(fixtureSource.indexOf('const chatCommands'),fixtureSource.indexOf('async function run('));
const fixture=new Function('mkdtempSync','writeFileSync','rmSync','tmpdir','join','createHash',fixtureText.replace('export function fixture','function fixture')+';return fixture;')(mkdtempSync,writeFileSync,()=>{},tmpdir,join,createHash);
""")
    # Preserve the exact host fixture and compiler assertions. Add the real worker
    # migration that owns baseline_poll, then exercise the new collector in the
    # fixture's independently generated, fully funded shared-host database.
    needle="sql(HOST.read_text(encoding='utf-8-sig'))"
    assert source.count(needle)==1
    source=source.replace(needle,"sql((ROOT/'supabase/migrations/20261124085100_erp_comm_pilot_worker_recovery.sql').read_text(encoding='utf-8-sig'))\n        "+needle+"\n        if SKIP_COLLECTOR:\n            assert sql(\"select to_regprocedure('public.erp_comm_baseline_collector_claim(uuid,uuid,uuid,uuid,uuid,timestamp with time zone,text)')is not null;\").stdout.strip()=='t','Missing protected finite collector claim'\n        else:\n            sql((ROOT/'supabase/migrations/20261124085300_erp_comm_pilot_baseline_collector.sql').read_text(encoding='utf-8-sig'))")
    source=source.replace("'20261124085200_erp_comm_pilot_host_window.sql']:","'20261124085100_erp_comm_pilot_worker_recovery.sql','20261124085200_erp_comm_pilot_host_window.sql','20261124085300_erp_comm_pilot_baseline_collector.sql']:")
    compiler_extra="""
const sourceEgress=s.profiles[0].meters.find(m=>m.dimension==='railway'&&m.unit==='network_egress_bytes');
sourceEgress.refreshBasis={basis:'priced_upper_bound',rateNumeratorMicros:'50000',rateDenominatorUnits:'1000000000'};
const p=structuredClone(s.profiles[0]);p.maxReservations=1;p.commands=['budget.fundControl'];p.effects=[];
delete p.mode;
p.control={kind:'baseline_poll',subject:'communication-baseline',maxActions:4,pollSeconds:60,maxPhysicalStarts:2};
p.ledgerBytes='2097152';p.databaseBytes='4194304';p.storageBytes='1';p.operationSeconds=120;p.headroomMicros='0';
p.meters=p.meters.filter(m=>m.dimension!=='railway');
p.meters.push({dimension:'railway',unit:'network_egress_bytes',billingAccount:sourceEgress.billingAccount,upperUnits:'6291456',availableUnits:sourceEgress.availableUnits,upperMicros:'315',evidenceId:'operating'});
for(const [dimension,unit,quantity]of [['railway','funded_baseline_nonce_claim_attempts','6'],['database','funded_baseline_nonce_claim_attempts','6'],['database','funded_baseline_metrics_reads','3'],['railway','baseline_metrics_response_bytes','6291456']])
p.meters.push({dimension,unit,billingAccount:dimension==='railway'?'existing-railway-account':'existing-supabase-project',upperUnits:quantity,availableUnits:quantity,upperMicros:'0',evidenceId:'operating'});
s.profiles.push(p);
"""
    source=source.replace("combined=script.replace(","extra+="+repr(compiler_extra)+"\n            combined=script.replace(")
    hook=r'''
        sql("""create schema cron;
          create table cron.job(jobid bigint generated always as identity primary key,jobname text,schedule text,command text,active boolean default true);
          create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command)values($1,$2,$3)returning jobid$$;
          create function cron.unschedule(bigint) returns boolean language sql as $$delete from cron.job where jobid=$1 returning true$$;
          create function cron.alter_job(bigint,active boolean) returns void language sql as $$update cron.job set active=$2 where jobid=$1$$;
          create schema net;create table net.queued(id bigint generated always as identity primary key,url text,body jsonb,headers jsonb,timeout_milliseconds integer);
          create function net.http_post(url text,body jsonb,params jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$
          begin if current_setting('test.net_fail',true)='yes' then raise exception 'synthetic failure';end if;
          insert into net.queued(url,body,headers,timeout_milliseconds)values($1,$2,$4,$5)returning id into strict timeout_milliseconds;return timeout_milliseconds;end$$;
          create schema storage;create table storage.objects(bucket_id text,metadata jsonb);
          insert into storage.objects values('unrelated-bucket','{"size":100}'),('erp-chat-media','{"size":200}');""")
        assert sql("select to_regprocedure('public.erp_comm_baseline_collector_claim(uuid,uuid,uuid,uuid,uuid,timestamp with time zone,text)') is not null;").stdout.strip()=='t', 'Missing protected finite collector claim'
        pool=sql("select permit_id from erp_comm_cost.control_pool where kind='baseline_poll';").stdout.strip()
        allocation=sql("select id from erp_comm_cost.baseline_allocation;").stdout.strip()
        plan=str(uuid.uuid4());nonces=[str(uuid.uuid4())for _ in range(3)]
        timing=json.loads(sql("select json_build_object('start',to_char(date_trunc('minute',statement_timestamp())at time zone'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'),'until',to_char((date_trunc('minute',statement_timestamp())+interval'3 minutes')at time zone'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'));").stdout)
        start,until=timing['start'],timing['until']
        manifest={'v':1,'purpose':'erp-communication-baseline-plan','planId':plan,'deploymentId':DEPLOYMENT,'poolId':pool,'allocationId':allocation,
                  'startsAt':start,'until':until,'maxTicks':3,'maxPhysicalStarts':2,'maxStorageObjects':1000,'maxRelations':8192,'planHash':'a'*64,'nonces':nonces}
        import base64,hashlib
        # Signature bytes are intentionally synthetic here: real Ed25519 verification
        # happens OFFLINE in the server tests, never inside privileged fixture SQL.
        token=base64.urlsafe_b64encode(json.dumps(manifest,separators=(',',':')).encode()).decode().rstrip('=')+'.'+base64.urlsafe_b64encode(bytes(64)).decode().rstrip('=')
        tick_tokens=[]
        for index,nonce in enumerate(nonces):
            tick={k:v for k,v in manifest.items()if k!='nonces'}
            scheduled=sql(f"select to_char(('{start}'::timestamptz+make_interval(secs=>{index*60}))at time zone'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"');").stdout.strip()
            tick.update(purpose='erp-communication-baseline-tick',intent='measure-baseline',nonce=nonce,ordinal=index+1,scheduledAt=scheduled)
            tick_tokens.append(base64.urlsafe_b64encode(json.dumps(tick,separators=(',',':')).encode()).decode().rstrip('=')+'.'+base64.urlsafe_b64encode(bytes(64)).decode().rstrip('='))
        quoted_token=token.replace("'","''")
        token_array=','.join("'"+t+"'"for t in tick_tokens)
        nonce_array=','.join("'"+n+"'::uuid"for n in nonces)
        enroll=f"insert into erp_comm_cost.baseline_collector_plan(id,pool,allocation_id,deployment_id,manifest,plan_hash,starts_at,until_at,max_ticks,max_physical_starts,max_storage_objects,max_relations,nonces,tick_tokens) values('{plan}','{pool}','{allocation}','{DEPLOYMENT}','{quoted_token}','{'a'*64}','{start}','{until}',3,2,1000,8192,array[{nonce_array}],array[{token_array}]);"
        deny('collector rejects missing complete prepaid funding',"update erp_comm_cost.unit_hold set units=1 where permit_id='"+pool+"' and capacity_id in(select id from erp_comm_cost.capacity where unit='funded_baseline_nonce_claim_attempts');"+enroll)
        sql(enroll)
        assert int(sql("select count(*)from erp_comm_cost.meter_refresh_basis;").stdout.strip())>0
        deny('reviewed price/counter certificates are immutable',"update erp_comm_cost.meter_refresh_basis set max_upper_units=max_upper_units+1")
        deny('service role cannot replace accounting evidence',"set role service_role;delete from erp_comm_cost.meter_refresh_basis")
        for role in('anon','authenticated','service_role'):
            deny(role+' cannot alter collector plan',f"set role {role};delete from erp_comm_cost.baseline_collector_plan")
            deny(role+' cannot enqueue an unfunded wake',f"set role {role};select erp_comm_cost.baseline_collector_tick('{plan}')")
        sql("create role native_collector_catalog_reader;grant pg_read_all_data to native_collector_catalog_reader;")
        assert sql("set role native_collector_catalog_reader;select count(*)from erp_comm_cost.baseline_collector_plan;").stdout.strip()=='0'
        checks.append('RLS hides future capabilities even from a native read-all-data role')
        for role in('anon','authenticated'):
            deny(role+' cannot claim collector nonce',f"set role {role};select public.erp_comm_baseline_collector_claim('{plan}','{nonces[0]}','{DEPLOYMENT}','{pool}','{allocation}','{until}','{'0'*64}')")
        assert sql("select erp_comm_cost.debit_baseline_control(gen_random_uuid(),gen_random_uuid(),'collect');").stdout.strip()=='f'
        assert sql(f"select used from erp_comm_cost.control_pool where permit_id='{pool}';").stdout.strip()=='0'
        checks.append('a mismatched collector pool cannot consume another pool credit')
        assert sql(f"select erp_comm_cost.start_baseline_collector('{plan}');").stdout.strip()=='t'
        assert sql(f"select used from erp_comm_cost.control_pool where permit_id='{pool}';").stdout.strip()=='1'
        assert sql("select count(*) from cron.job where command like '%baseline_collector_tick%';").stdout.strip()=='1'
        assert sql(f"select erp_comm_cost.baseline_collector_tick('{plan}');").stdout.strip()=='t'
        assert sql("select count(*) from net.queued where url='https://erp.algt.net/api/internal/communications/refresh-baseline' and body='{}'::jsonb and timeout_milliseconds=25000;").stdout.strip()=='1'
        queued=sql("select headers->>'Authorization'from net.queued limit 1;").stdout.strip()
        assert queued=='Bearer '+tick_tokens[0] and token not in queued and tick_tokens[1]not in queued
        queued_body=json.loads(base64.urlsafe_b64decode(queued[7:].split('.')[0]+'='*((4-len(queued[7:].split('.')[0])%4)%4)))
        assert queued_body['nonce']==nonces[0]and'nonces'not in queued_body
        checks.append('readable HTTP queue holds only current one-use capability, never future tokens or private plan')
        assert sql(f"select used from erp_comm_cost.control_pool where permit_id='{pool}';").stdout.strip()=='2'
        claim=lambda nonce:f"set role service_role;select public.erp_comm_baseline_collector_claim('{plan}','{nonce}','{DEPLOYMENT}','{pool}','{allocation}','{until}','{hashlib.sha256(tick_tokens[nonces.index(nonce)].encode()).hexdigest()if nonce in nonces else'0'*64}');"
        assert sql(claim(str(uuid.uuid4()))).stdout.strip()=='f'
        template=sql("select template_id from erp_comm_cost.standing_envelope where feature='chat';").stdout.strip()
        sql(f"insert into erp_comm_cost.capacity(billing_account,dimension,unit,valid_from,valid_until,available_units,enabled)values('synthetic-unknown','realtime','unknown_external_usage',now()-interval'1 hour',now()+interval'2 hours',100,true);"
            f"insert into erp_comm_cost.meter select '{template}','realtime','unobserved synthetic external meter',true,now()-interval'6 minutes',now()+interval'1 hour',now()+interval'2 hours',0,id,1 from erp_comm_cost.capacity where unit='unknown_external_usage';")
        assert sql(claim(nonces[0])).stdout.strip()=='t'
        assert sql(claim(nonces[0])).stdout.strip()=='f'
        assert sql("select bool_or(enabled) from erp_comm_cost.baseline_capacity_evidence;").stdout.strip()=='f'
        payload['operationId']='collector-held-new'
        assert not json.loads(sql("set role service_role;select public.erp_comm_budget_command('reserve','"+json.dumps(payload)+"');").stdout)['ok']
        checks.append('funded nonce claim atomically holds new admissions before provider read; replay denied')
        record=lambda nonce:f"set role service_role;select public.erp_comm_baseline_collector_record('{plan}','{nonce}','8589934592','7516192768','{'b'*64}');"
        refresh=record(nonces[0])
        assert sql(f"begin;update erp_comm_cost.meter set observed_at=now()-interval'6 minutes'where operation_id='{template}'and capacity_id not in(select database_capacity_id from erp_comm_cost.baseline_allocation union all select storage_capacity_id from erp_comm_cost.baseline_allocation);"+refresh+"commit;").stdout.strip()=='t'
        assert sql(record(nonces[0])).stdout.strip()=='f'
        assert sql("select bool_and(enabled) from erp_comm_cost.baseline_capacity_evidence;").stdout.strip()=='t'
        payload['operationId']='collector-unknown-provider-held'
        assert not json.loads(sql("set role service_role;select public.erp_comm_budget_command('reserve','"+json.dumps(payload)+"');").stdout)['ok']
        assert sql(f"select observed_at<clock_timestamp()-interval'5 minutes'from erp_comm_cost.meter where operation_id='{template}'and dimension='realtime';").stdout.strip()=='t'
        sql(f"delete from erp_comm_cost.meter where operation_id='{template}'and dimension='realtime';")
        payload['operationId']='collector-fresh-new'
        assert json.loads(sql("set role service_role;select public.erp_comm_budget_command('reserve','"+json.dumps(payload)+"');").stdout)['ok']
        altered=dict(payload);altered['operationId']='collector-understated-bound'
        mutation=f"update erp_comm_cost.meter set upper_units=0 where operation_id='{template}'and capacity_id=(select b.capacity_id from erp_comm_cost.meter_refresh_basis b join erp_comm_cost.capacity c on c.id=b.capacity_id where b.operation_id='{template}'and c.unit='bounded_database_work'limit 1);"
        verdict=sql("begin;"+mutation+"set role service_role;select public.erp_comm_budget_command('reserve','"+json.dumps(altered)+"');rollback;").stdout
        assert json.loads(verdict)['reason']=='meter_accounting_bound_unavailable'
        assert sql(f"select storage_total_bytes::text||'/'||storage_communications_bytes::text from erp_comm_cost.baseline_collector_nonce where nonce='{nonces[0]}';").stdout.strip()=='300/200'
        assert sql(f"select observed_at=(select claimed_at from erp_comm_cost.baseline_collector_nonce where nonce='{nonces[0]}') from erp_comm_cost.baseline_capacity_evidence limit 1;").stdout.strip()=='t'
        checks.append('actual protected database/catalog measurement uses SQL clock and preserves quota')
        # Finite-clock seam affects only cron scheduling, never measurement freshness.
        sql(f"update erp_comm_cost.baseline_collector_plan set last_at=starts_at where id='{plan}';")
        sql(f"create or replace function erp_comm_cost.baseline_collector_clock()returns timestamptz language sql volatile set search_path=''as $$select last_at+interval'60 seconds'from erp_comm_cost.baseline_collector_plan where id='{plan}'$$;")
        assert sql(f"select erp_comm_cost.baseline_collector_tick('{plan}');").stdout.strip()=='t'
        assert sql(f"select erp_comm_cost.baseline_collector_tick('{plan}');").stdout.strip()=='t'
        assert sql("select count(*) from cron.job where command like '%baseline_collector_tick%';").stdout.strip()=='0'
        assert sql(f"select phase||'/'||ticks from erp_comm_cost.baseline_collector_plan where id='{plan}';").stdout.strip()=='stopped/3'
        assert sql(f"select used from erp_comm_cost.control_pool where permit_id='{pool}';").stdout.strip()=='4'
        assert sql(f"select erp_comm_cost.baseline_collector_tick('{plan}');").stdout.strip()=='f'
        sql(f"update erp_comm_cost.baseline_collector_nonce set queued_at=clock_timestamp()where nonce='{nonces[1]}';")
        assert sql(claim(nonces[1])).stdout.strip()=='t'
        # A failed provider read has no completion RPC: old observations remain held.
        assert sql("select bool_or(enabled)from erp_comm_cost.baseline_capacity_evidence;").stdout.strip()=='f'
        assert sql("select erp_comm_cost.debit_control('budget_alert','1',gen_random_uuid(),'read')is not null;").stdout.strip()=='t'
        sql("create function erp_comm_cost.test_fail_baseline_observation()returns trigger language plpgsql as $$begin raise exception'controlled native audit failure';end$$;"
            "create trigger controlled_native_failure before insert on erp_comm_cost.baseline_meter_observation for each row execute function erp_comm_cost.test_fail_baseline_observation();")
        failed=sql("begin;"+record(nonces[1])+"reset role;select bool_or(enabled)from erp_comm_cost.baseline_capacity_evidence;rollback;").stdout.strip().splitlines()
        assert failed==['f','f'],failed
        sql("drop trigger controlled_native_failure on erp_comm_cost.baseline_meter_observation;drop function erp_comm_cost.test_fail_baseline_observation();")
        sql(f"update erp_comm_cost.baseline_collector_nonce set claimed_at=clock_timestamp()-interval'16 seconds'where nonce='{nonces[1]}';")
        assert sql(record(nonces[1])).stdout.strip()=='f'
        checks.append('finite tick/action/retirement cap; failed or late completion remains held')
'''
    marker="        print(json.dumps({'checks':checks,'count':len(checks)},indent=2))"
    assert source.count(marker)==1
    source=source.replace(marker,hook+'\n'+marker)
    @contextmanager
    def retained_directory(*args,**kwargs):
        directory=Path(tempfile.mkdtemp(*args,**kwargs))
        assert directory.resolve().is_relative_to((ROOT/'tmp').resolve())
        yield str(directory)
    namespace={'__file__':str(fixture),'__name__':'collector_host_fixture','SKIP_COLLECTOR':options.without_collector,'retained_directory':retained_directory}
    if options.local_postgres:
        from native_pg_fallback import NativePgDockerShim
        previous_temp=os.environ.get('TEMP');os.environ['TEMP']=str(ROOT/'tmp')
        previous_run=subprocess.run
        try:
            with NativePgDockerShim(label='collector') as shim:
                subprocess.run=shim.run
                exec(compile(source,str(fixture),'exec'),namespace)
                namespace['main']()
        finally:
            subprocess.run=previous_run
            if previous_temp is None:os.environ.pop('TEMP',None)
            else:os.environ['TEMP']=previous_temp
    else:
        exec(compile(source,str(fixture),'exec'),namespace)
        namespace['main']()

if __name__=='__main__':main()
