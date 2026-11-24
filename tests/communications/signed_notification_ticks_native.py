"""Synthetic native PG17 contract. Real budget/compiler/host guards; local cron/net/business doubles.

--without-signed demonstrates the old unsafe communications queue remains enabled.
No live SQL, credential, provider, browser, or source fixture edits.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
from contextlib import contextmanager

ROOT=Path(__file__).resolve().parents[2]
MIGRATION=ROOT/'supabase/migrations/20261124152006_erp_comm_signed_notification_ticks.sql'

def business_schema():
    """Exercise exact private projection copies against real notification tables and predicates."""
    from native_pg_fallback import NativePgDockerShim
    import uuid
    name='signed-business-'+uuid.uuid4().hex[:10]
    migrations=ROOT/'supabase/migrations'
    fixture=ROOT/'tests/communications'
    with NativePgDockerShim(label='signed-business') as shim:
        shim.run(['docker','run','--name',name])
        def sql(query):
            result=shim.run(['docker','exec',name,'psql','-qAtX','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],
                input=query,capture_output=True,text=True)
            if result.returncode:
                raise AssertionError(result.stderr[:1600])
            return result.stdout.strip()
        for path in [fixture/'chat_fixture.sql',fixture/'notifications_fixture.sql',
                next(migrations.glob('*_erp_communications_chat_v1.sql')),next(migrations.glob('*_erp_communication_budget_v1.sql')),
                next(migrations.glob('*_erp_communications_notifications_v1.sql')),fixture/'notifications_native.sql',
                next(migrations.glob('*_erp_comm_pilot_baseline_retention.sql')),next(migrations.glob('*_erp_comm_pilot_host_window.sql')),MIGRATION]:
            sql(path.read_text(encoding='utf-8-sig'))
        result=sql("""
            begin;
            create temp table pilot_business_before as
            select sum(pg_total_relation_size(c.oid)) bytes from pg_class c join pg_namespace n on n.oid=c.relnamespace
              where n.nspname in ('erp_private','erp_comm_cost') and c.relkind='r';
            do $$declare c uuid:=gen_random_uuid(); old bigint; d bigint;begin
             insert into erp_private.chat_conversations(id,kind,name,creator,owner_id,latest_seq) values(c,'group','Synthetic signed pilot',3,3,125);
             insert into erp_private.chat_memberships(conversation,profile_id) values(c,2),(c,3);
             insert into erp_private.notification_devices(installation,profile_id,session_id,token)
              select gen_random_uuid(),2,lpad('2',32,'0')::uuid,repeat('fake-token-',4)||n from generate_series(1,80)n;
             insert into erp_private.chat_messages(conversation,seq,sender,body) select c,n,3,'fixture' from generate_series(1,125)n;
             select count(*) into old from erp_private.notification_inbox;
             perform erp_comm_cost.signed_notification_project_chat();
             if (select count(*) from erp_private.notification_inbox)<>old+1 then raise exception 'Bounded chat did not advance once';end if;
             select count(*) into d from erp_private.notification_push_jobs;
             perform erp_comm_cost.signed_notification_project_devices(true,true);
             if (select count(*) from erp_private.notification_push_jobs)>d+1 then raise exception 'Multiple dispatch jobs in one tick';end if;
             perform erp_comm_cost.signed_notification_collect_due();
             perform erp_comm_cost.signed_notification_recover();
            end $$;
            select sum(pg_total_relation_size(c.oid))-(select bytes from pilot_business_before) from pg_class c
             join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('erp_private','erp_comm_cost') and c.relkind='r';
            rollback;
        """)
        measured=int(result)
        assert 0<=measured<=8388608,measured
        print(json.dumps({'realBusinessSchema':True,'projectionCopiesAndPriorBusinessSuite':'passed','syntheticIncludingSetupGrowthBytes':measured,'perTickAdditionalHeldBytes':8388608}))

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--local-postgres',action='store_true')
    parser.add_argument('--without-signed',action='store_true')
    parser.add_argument('--business-schema',action='store_true')
    options=parser.parse_args()
    if options.business_schema:
        assert options.local_postgres
        business_schema()
        return
    fixture=ROOT/'tests/communications/pilot_host_window_native.py'
    source=fixture.read_text(encoding='utf8')
    business=(ROOT/'supabase/migrations/20261123100933_erp_communications_notifications_v1.sql').read_text(encoding='utf-8-sig')
    def original_function(name):
        start=business.index('create function erp_private.'+name+'()')
        end=business.index('$$;',business.index('as $$',start)+5)+3
        return business[start:end].replace('create function','create or replace function',1)
    real_pages='set check_function_bodies=off;'+''.join(original_function(name) for name in ('notification_recover','notification_collect_due','notification_project_chat'))+'set check_function_bodies=on;'
    setup=r'''
        setup_sql+="""create schema cron;
          create table cron.job(jobid bigint generated always as identity primary key,jobname text,schedule text,command text,active boolean default true);
          insert into cron.job(jobname,schedule,command)values('unrelated-erp','0 0 * * *','select 1');
          create function cron.schedule(text,text,text)returns bigint language sql as $$insert into cron.job(jobname,schedule,command)values($1,$2,$3)returning jobid$$;
          create function cron.unschedule(bigint)returns boolean language plpgsql as $$begin if current_setting('test.retire_fail',true)='yes'then raise exception'synthetic retire failure';end if;delete from cron.job where jobid=$1;return found;end$$;
          create function cron.alter_job(bigint,active boolean)returns void language sql as $$update cron.job set active=$2 where jobid=$1$$;
          create schema net;create table net.queued(id bigint generated always as identity primary key,url text,body jsonb,headers jsonb);
          create function net.http_post(url text,body jsonb,params jsonb,headers jsonb,timeout_milliseconds integer)returns bigint language plpgsql as $$declare rid bigint;begin
           if current_setting('test.net_fail',true)='yes'then raise exception'synthetic transport failure';end if;
           if url<>'https://erp.algt.net/api/internal/communications/notification-tick' or body<>'{}'::jsonb or params<>'{}'::jsonb or timeout_milliseconds<>45000 then raise exception'wrong fixed notification request';end if;
           insert into net.queued(url,body,headers)values($1,$2,$4)returning id into rid;return rid;end$$;
          create table erp_private.notification_capture_gate(enabled boolean,controls boolean);insert into erp_private.notification_capture_gate values(true,false);
          create table erp_private.test_notification_business_calls(kind text);create table erp_private.notification_inbox(id uuid primary key default gen_random_uuid(), n bigint generated always as identity,kind text,profile_id bigint,created_at timestamptz default clock_timestamp(),read_at timestamptz);
          create table erp_private.notification_devices(id uuid primary key default gen_random_uuid(),profile_id bigint,registered_at timestamptz default now()-interval '1 hour');
          create table erp_private.notification_push_jobs(event uuid,device uuid,state text default 'pending',next_try timestamptz default now(),unique(event,device));
          create function erp_private.notification_stop_scheduler(uuid)returns boolean language sql as $$select true$$;
          create function erp_private.notification_queue_tick(uuid)returns boolean language sql as $$select true$$;
          create function public.erp_notification_tick(text,uuid,uuid)returns jsonb language sql as $$select '{}'::jsonb$$;
          grant execute on function public.erp_notification_tick(text,uuid,uuid)to service_role;
          create function erp_private.notification_recover()returns void language sql as $$insert into erp_private.test_notification_business_calls values('recover')$$;
          create function erp_private.notification_collect_due()returns void language sql as $$insert into erp_private.test_notification_business_calls values('calendar')$$;
          create function erp_private.notification_project_chat()returns void language plpgsql as $$begin if current_setting('test.business_fail',true)='yes'then raise exception'synthetic projection failure';end if;insert into erp_private.test_notification_business_calls values('chat');end$$;
          create function erp_private.notification_project_devices()returns void language sql as $$insert into erp_private.test_notification_business_calls values('devices')$$;"""
'''
    assert source.count('        sql(setup_sql)')==1
    source=source.replace('        sql(setup_sql)',setup+'\n        sql(setup_sql)')
    compiler=r'''
const n=structuredClone(s.profiles[0]);n.feature='push';n.maxReservations=1;n.commands=['budget.fundControl'];n.effects=[];delete n.mode;
n.control={kind:'notification_tick',subject:'mobile-notifications',maxActions:4,pollSeconds:60,notificationPlan:{physicalStarts:2,planId:'12000000-0000-4000-8000-000000000001',startsAt:new Date((Math.floor(now/60000)+1)*60000).toISOString(),calendarEnabled:true,pushEnabled:true}};
n.ledgerBytes='2097152';n.databaseBytes='31457280';n.storageBytes='1';n.operationSeconds=240;n.headroomMicros='0';
n.meters.push({dimension:'fcm',unit:'dispatch_attempts',billingAccount:'existing-fcm-project',upperUnits:'1',availableUnits:'64',upperMicros:'0',evidenceId:'operating'});
for(const dimension of ['railway','database'])n.meters.push({dimension,unit:'funded_notification_tick_claim_attempts',billingAccount:dimension==='railway'?'existing-railway-account':'existing-supabase-project',upperUnits:'6',availableUnits:'6',upperMicros:'0',evidenceId:'operating'});
s.profiles.push(n);configureNotificationTopology(s,1);
'''
    if not options.without_signed:
        source=source.replace("import {fixture,configureObjectAllocation}", "import {fixture,configureObjectAllocation,configureNotificationTopology}")
        marker="        sql('create database compiled_host_case;');database='compiled_host_case'"
        pre,post=source.split(marker)
        init="        if owner_object:"
        post=post.replace(init,"        sql(real_pages)\n        sql('set check_function_bodies=off;'+SIGNED_MIGRATION.read_text(encoding='utf-8-sig'))\n"+init,1)
        source=pre+marker+post
        source=source.replace("availableUnits:'8'","availableUnits:'64'")
        source=source.replace('            combined=script.replace(', '            extra+='+repr(compiler)+'\n            combined=script.replace(')
    hook=r'''
        assert sql("select erp_private.notification_queue_tick(gen_random_uuid());").stdout.strip()=='f','RED: legacy shared-secret queue path is still enabled'
        assert sql("select to_regprocedure('public.erp_comm_notification_tick_claim(uuid,uuid,uuid,uuid,uuid,timestamp with time zone,text,boolean,boolean)')is not null;").stdout.strip()=='t'
        checks.append('legacy communication scheduler fails closed; current-only claim exists')
        pool=sql("select permit_id from erp_comm_cost.control_pool where kind='notification_tick';").stdout.strip()
        allocation=sql('select id from erp_comm_cost.baseline_allocation;').stdout.strip()
        receipt=json.loads(sql(f"select erp_comm_cost.notification_tick_funding_receipt('{pool}');").stdout)
        spec=receipt['manifest'];timing={'start':spec['startsAt'],'until':spec['until']}
        # Pin only the fixture's scheduling clock while exercising independent DB admission checks.
        sql(f"create or replace function erp_comm_cost.notification_tick_clock()returns timestamptz language sql volatile set search_path=''as $$select coalesce(nullif(current_setting('test.notification_clock',true),''),('{timing['start']}'::timestamptz-interval '10 seconds')::text)::timestamptz$$;")
        sql("create or replace function erp_comm_cost.signed_notification_recover()returns void language sql as $$insert into erp_private.test_notification_business_calls values('recover')$$;create or replace function erp_comm_cost.signed_notification_collect_due()returns void language sql as $$insert into erp_private.test_notification_business_calls values('calendar')$$;create or replace function erp_comm_cost.signed_notification_project_chat()returns void language plpgsql as $$begin if current_setting('test.business_fail',true)='yes'then raise exception'synthetic projection failure';end if;insert into erp_private.test_notification_business_calls values('chat');end$$;")
        script="""import{prepareSignedNotificationTicks}from'./tooling/local/prepare-signed-notification-ticks.mjs';import{generateKeyPairSync}from'node:crypto';const key=generateKeyPairSync('ed25519');const r=JSON.parse(process.argv[1]);process.stdout.write(JSON.stringify(prepareSignedNotificationTicks(r.manifest,r,key.privateKey.export({format:'pem',type:'pkcs8'}),{now:Date.parse(r.manifest.startsAt)-1000})));"""
        prepared=subprocess.run([r'C:\dev\toolchains\node-v22.23.4-win-x64\node.exe','--input-type=module','-e',script,json.dumps(receipt)],cwd=ROOT,text=True,capture_output=True)
        assert prepared.returncode==0,prepared.stderr
        plan=json.loads(prepared.stdout);enroll=plan['enrollmentSql'];plan_id=spec['planId'];nonces=plan['nonces']
        import hashlib
        deny('missing original claim probe units reject enrollment',"update erp_comm_cost.unit_hold set units=1 where permit_id='"+pool+"'and capacity_id in(select id from erp_comm_cost.capacity where unit='funded_notification_tick_claim_attempts');"+enroll)
        deny('claim capacity on different billing account cannot cover the original plan',"update erp_comm_cost.capacity set billing_account='unrelated-project' where dimension='database' and unit='funded_notification_tick_claim_attempts';"+enroll)
        deny('original funding manifest cannot be rewritten',f"update erp_comm_cost.notification_tick_authorization set manifest=manifest where pool='{pool}'")
        deny('signed input cannot change the reviewed authorization',enroll.replace(receipt['planHash'],'b'*64))
        sql(enroll)
        deny('signed plan immutable',f"update erp_comm_cost.notification_tick_plan set max_physical_starts=3 where id='{plan_id}'")
        for role in('anon','authenticated','service_role'):
            deny(role+' cannot alter private future tokens',f"set role {role};delete from erp_comm_cost.notification_tick_plan")
            deny(role+' cannot install cron or enqueue',f"set role {role};select erp_comm_cost.start_notification_tick_plan('{plan_id}')")
        for role in('anon','authenticated'):
            deny(role+' cannot invoke signed work RPC',f"set role {role};select public.erp_comm_notification_tick_finish('{plan_id}','{nonces[0]}',true)")
        deny('service role cannot use legacy tick authority',f"set role service_role;select public.erp_notification_tick('admit','{plan_id}','{nonces[0]}')")
        sql('create role native_notification_catalog_reader;grant pg_read_all_data to native_notification_catalog_reader;')
        assert sql('set role native_notification_catalog_reader;select count(*)from erp_comm_cost.notification_tick_plan;').stdout.strip()=='0'
        checks.append('private future capabilities hidden by ACL/RLS without global role or net changes')
        assert sql("begin;update erp_comm_cost.host_window set enabled=false;"+plan['startSql']+"rollback;").stdout.strip()=='f'
        checks.append('new cron enrollment requires active host admission')
        assert sql(plan['startSql']).stdout.strip()=='t'
        assert sql(plan['startSql']).stdout.strip()=='f'
        assert sql(f"select used from erp_comm_cost.control_pool where permit_id='{pool}';").stdout.strip()=='1'
        assert sql(f"select erp_comm_cost.debit_signed_notification(gen_random_uuid(),gen_random_uuid(),'signed_tick');").stdout.strip()=='f'
        assert sql(f"select used from erp_comm_cost.control_pool where permit_id='{pool}';").stdout.strip()=='1'
        checks.append('retirement prepaid once; wrong-pool debit atomically rolled back')
        clock=lambda seconds:"set test.notification_clock='"+sql(f"select ('{timing['start']}'::timestamptz+make_interval(secs=>{seconds}))::text;").stdout.strip()+"';"
        tick=f"select erp_comm_cost.signed_notification_tick('{plan_id}');"
        assert sql(clock(1)+tick).stdout.strip()=='t'
        queued=sql("select headers->>'Authorization'from net.queued order by id limit 1;").stdout.strip()
        assert queued=='Bearer '+plan['tickTokens'][0] and all(t not in queued for t in plan['tickTokens'][1:])
        assert sql("select bool_and(body='{}'::jsonb)from net.queued;").stdout.strip()=='t'
        checks.append('readable queue contains only current signed one-use tick and fixed empty body')
        claim=lambda index,change='':clock(index*60+1)+f"set role service_role;set statement_timeout='5s';select public.erp_comm_notification_tick_claim('{plan_id}','{nonces[index]}','{DEPLOYMENT}','{pool}','{allocation}','{timing['until']}','{hashlib.sha256(plan['tickTokens'][index].encode()).hexdigest()}',true,true);"+change
        wrong=claim(0).replace("'"+DEPLOYMENT+"'","'"+str(uuid.uuid4())+"'")
        assert sql('begin;'+wrong+'rollback;').stdout.strip()==''
        assert sql("begin;update erp_comm_cost.approval set revoked_at=now();"+claim(0)+"rollback;").stdout.strip()==''
        checks.append('revoked approval cannot claim work even with original prepaid retirement')
        assert sql(claim(0).replace("statement_timeout='5s'","statement_timeout='0'")).stdout.strip()==''
        checks.append('unbounded server statement cannot claim projection work')
        def funded_queue_case(mode,work,seconds,expect):
            seed="insert into erp_private.notification_devices(profile_id)values(1);insert into erp_private.notification_inbox(kind,profile_id)values"+",".join(f"('{kind}',1)" for kind in work+['budget','chat'])+";"
            seed+="insert into erp_private.notification_push_jobs(event,device,next_try) select e.id,d.id,now()+interval '"+str(seconds)+" seconds' from erp_private.notification_inbox e cross join erp_private.notification_devices d order by e.n limit 2;"
            outcome=sql('begin;'+seed+claim(0).replace('true,true);',mode+');')+"reset role;select string_agg(kind,',' order by n)from erp_private.notification_push_jobs j join erp_private.notification_inbox e on e.id=j.event;rollback;").stdout.strip().splitlines()
            assert json.loads(outcome[0])['pushEnabled'] and outcome[1]==expect,outcome
        funded_queue_case('false,true',['chat','chat'],0,'chat,chat,budget')
        funded_queue_case('true,true',['budget','budget'],600,'budget,budget,budget')
        funded_queue_case('true,true',['budget','budget'],0,'budget,budget,chat')
        checks.append('mixed eligible classes, control-only sender and future retry deadlines project at most one new job')
        stale="update erp_comm_cost.baseline_capacity_evidence set observed_at=now()-interval '10 minutes';"
        off="update erp_comm_cost.baseline_allocation set enabled=false;"
        for change in [stale,off]:
            assert sql('begin;'+change+claim(0)+'rollback;').stdout.strip()==''
            outcome=sql('begin;'+change+clock(61)+tick+f"select phase from erp_comm_cost.notification_tick_plan where id='{plan_id}';rollback;").stdout.strip().splitlines()
            assert outcome==['t','stopped']
        checks.append('stale or disabled baseline holds new work while funded retirement succeeds')
        from concurrent.futures import ThreadPoolExecutor
        first_claim=claim(0)
        with ThreadPoolExecutor(max_workers=2) as clients:
            receipts=[r.stdout.strip() for r in clients.map(sql,[first_claim,first_claim])]
        assert len([r for r in receipts if r])==1
        admitted=json.loads(next(r for r in receipts if r))
        checks.append('independent concurrent receiver connections produce exactly one admission')
        assert admitted['pushEnabled']is True
        assert sql('select count(*)from erp_private.test_notification_business_calls;').stdout.strip()=='3'
        assert sql(claim(0)).stdout.strip()==''
        assert sql(claim(0)).stdout.strip()==''
        assert sql(f"select claim_attempts from erp_comm_cost.notification_tick_nonce where nonce='{nonces[0]}';").stdout.strip()=='2'
        finish=clock(5)+f"set role service_role;select public.erp_comm_notification_tick_finish('{plan_id}','{nonces[0]}',true);"
        assert sql(finish).stdout.strip()=='t'and sql(finish).stdout.strip()=='f'
        checks.append('original one-use claim; bounded cross-process probes; existing projection sequence once and finish once')
        assert sql('begin;'+clock(2)+tick+"select count(*)from net.queued;rollback;").stdout.strip().splitlines()==['t','1']
        stopped=sql("begin;update erp_comm_cost.host_window set enabled=false;"+clock(61)+tick+f"select phase from erp_comm_cost.notification_tick_plan where id='{plan_id}';rollback;").stdout.strip().splitlines()
        assert stopped==['t','stopped']
        checks.append('closed host gate retires paid job and cannot enqueue another tick')
        assert sql(clock(61)+"set test.net_fail='yes';"+tick).stdout.strip()=='t'
        assert sql(claim(1)).stdout.strip()==''
        assert sql(f"select used from erp_comm_cost.control_pool where permit_id='{pool}';").stdout.strip()=='3'
        checks.append('early/transport failures burn one paid tick and cannot publish future caps or retry work')
        assert sql(clock(121)+tick).stdout.strip()=='t'
        assert sql("set test.business_fail='yes';"+claim(2)).stdout.strip()==''
        assert sql(f"select claimed_at is not null and finished_at is not null and success=false from erp_comm_cost.notification_tick_nonce where nonce='{nonces[2]}';").stdout.strip()=='t'
        assert sql('select count(*)from erp_private.test_notification_business_calls;').stdout.strip()=='3'
        checks.append('projection failure contained after burned claim; no duplicate work or business-transaction coupling')
        assert sql(clock(181)+"set test.retire_fail='yes';"+tick).stdout.strip()=='t'
        assert sql(f"select phase||'/'||ticks from erp_comm_cost.notification_tick_plan where id='{plan_id}';").stdout.strip()=='stopped/3'
        assert sql("select bool_and(not active)from cron.job where jobname like'erp-comm-notification-%';").stdout.strip()=='t'
        assert sql("select active from cron.job where jobname='unrelated-erp';").stdout.strip()=='t'
        assert sql(f"select used from erp_comm_cost.control_pool where permit_id='{pool}';").stdout.strip()=='4'
        assert sql(clock(182)+tick).stdout.strip()=='f'
        assert sql('select count(*)from net.queued;').stdout.strip()=='2'
        checks.append('finite source counter and prepaid retirement; unschedule fallback disables only owned cron')
'''
    marker="        print(json.dumps({'checks':checks,'count':len(checks)},indent=2))"
    assert source.count(marker)==1
    source=source.replace(marker,hook+'\n'+marker)
    @contextmanager
    def retained_directory(*args,**kwargs):
        directory=Path(tempfile.mkdtemp(*args,**kwargs));assert directory.resolve().is_relative_to((ROOT/'tmp').resolve());yield str(directory)
    source=source.replace('with tempfile.TemporaryDirectory(', 'with retained_directory(')
    namespace={'__file__':str(fixture),'__name__':'notification_host_fixture','WITHOUT_SIGNED':options.without_signed,'SIGNED_MIGRATION':MIGRATION,'retained_directory':retained_directory,'real_pages':real_pages}
    if options.local_postgres:
        from native_pg_fallback import NativePgDockerShim
        previous_temp=os.environ.get('TEMP');os.environ['TEMP']=str(ROOT/'tmp');previous_run=subprocess.run
        try:
            with NativePgDockerShim(label='signed-notification')as shim:
                subprocess.run=shim.run
                exec(compile(source,str(fixture),'exec'),namespace);namespace['main']()
        finally:
            subprocess.run=previous_run
            if previous_temp is None:os.environ.pop('TEMP',None)
            else:os.environ['TEMP']=previous_temp
    else:
        exec(compile(source,str(fixture),'exec'),namespace);namespace['main']()

if __name__=='__main__':main()
