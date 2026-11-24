"""Synthetic-only recovery contract in a disposable PG17.11 container with --network none."""
import base64
import concurrent.futures
import hashlib
import json
import os
import pathlib
import contextlib
import sys
import datetime
import subprocess
import tempfile
import time
import uuid
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20261124085100_erp_comm_pilot_worker_recovery.sql"
OWNER = "10000000-0000-4000-8000-000000000001"
SESSION = "30000000-0000-4000-8000-000000000001"
APPROVAL = "20000000-0000-4000-8000-000000000001"

def run():
    name = "erp-pilot-worker-" + uuid.uuid4().hex[:12]
    def docker(*args, data=None, check=True):
        result = subprocess.run(["docker", *args], input=data, text=True, capture_output=True)
        if check and result.returncode:
            raise RuntimeError(result.stderr or result.stdout)
        return result
    def sql(query, check=True):
        return docker("exec", "-i", name, "psql", "-h", "127.0.0.1", "-U", "postgres", "-XqAt", "-v", "ON_ERROR_STOP=1", data=query, check=check)
    def value(query):
        return sql(query).stdout.strip()
    def denied(query):
        assert sql(query, check=False).returncode != 0, query
    def uid(): return str(uuid.uuid4())
    docker("run", "--pull=never", "--network", "none", "--name", name, "--detach", "--tmpfs", "/var/lib/postgresql/data",
           "-e", "POSTGRES_HOST_AUTH_METHOD=trust", os.environ.get("BUDGET_TEST_PG_IMAGE", "051f7b7b3abd"))
    try:
        for _ in range(100):
            if sql("select 1", check=False).returncode == 0: break
            time.sleep(.1)
        assert value("show server_version").startswith("17.10" if "--local-postgres" in sys.argv else "17.11")
        sql(f"""
          create role anon; create role authenticated; create role service_role bypassrls;
          create schema auth; create schema erp_private; create table auth.users(id uuid primary key);
          create table public.user_profiles(id bigint generated always as identity,auth_user_id uuid,status text,must_change_password boolean);
          insert into auth.users values ('{OWNER}'); insert into public.user_profiles(auth_user_id,status,must_change_password) values('{OWNER}','active',false);
          create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
          create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id','{SESSION}','amr',
            jsonb_build_array(jsonb_build_object('method','password','timestamp',floor(extract(epoch from now())))))$$;
          create function public.f03_current_session_valid() returns boolean language sql as $$select true$$;
          create function erp_private.business_principal_is_active() returns boolean language sql as $$select true$$;
          create function erp_private.provider_actor_session_valid(bigint,uuid) returns boolean language sql as $$select true$$;
        """)
        sql((ROOT / "supabase/migrations/20261123095158_erp_communication_budget_v1.sql").read_text(encoding="utf-8-sig"))
        # Extension interfaces are local deterministic fixtures: no network access and no autonomous job.
        sql("""create schema net;create schema cron;
          create table net.requests(id bigint generated always as identity,url text,body jsonb,headers jsonb,timeout_ms integer);
          create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds integer default 5000)
          returns bigint language plpgsql as $$declare rid bigint;begin
            if current_setting('test.net_fail',true)='true' then raise exception 'SYNTHETIC network queue failure';end if;
            insert into net.requests(url,body,headers,timeout_ms) values(url,body,headers,timeout_milliseconds) returning id into rid;return rid;end$$;
          create table cron.job(jobid bigint generated always as identity,jobname text unique,schedule text,command text,active boolean default true);
          create function cron.schedule(text,text,text) returns bigint language plpgsql as $$declare rid bigint;begin insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid into rid;return rid;end$$;
          create function cron.unschedule(bigint) returns boolean language plpgsql as $$begin if current_setting('test.unschedule_fail',true)='true' then raise exception 'SYNTHETIC unschedule failure';end if;delete from cron.job where jobid=$1;return found;end$$;
          create function cron.alter_job(job_id bigint,active boolean) returns void language sql as $$update cron.job set active=$2 where jobid=$1$$;
        """)
        if MIGRATION.exists(): sql(MIGRATION.read_text(encoding="utf-8-sig"))
        assert value("select to_regprocedure('public.erp_comm_worker_boot_delivery(text,uuid,uuid,uuid)') is not null") == "t", "RED: consume-only funded worker delivery hook is missing"
        # The only approval is created through the existing authenticated owner operator, using synthetic auth fixtures.
        sql(f"update erp_comm_cost.authority set owner_auth_id='{OWNER}',owner_binding_evidence='SYNTHETIC isolated owner binding';")
        until = value("select to_char((date_trunc('second',clock_timestamp())+interval '1 hour') at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')")
        before = value("select to_char((clock_timestamp()-interval '10 seconds') at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')")
        approval_end=value("select to_char((clock_timestamp()+interval '2 hours') at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')")
        approval = json.dumps(dict(scope="communications", clientMutationId=APPROVAL, currency="USD", maxMicros="5000000",
                                   endsAt=approval_end, features=["chat", "media_upload", "ptt_live", "push"]))
        sql(f"set role authenticated;set test.actor='{OWNER}';select public.erp_comm_budget_operator('1','{SESSION}','budget.approve','{approval}');")
        key = Ed25519PrivateKey.generate()
        spki = base64.b64encode(key.public_key().public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)).decode()
        scratch_context = contextlib.nullcontext(tempfile.mkdtemp(prefix="pilot-worker-native-", dir=ROOT / "tmp")) if "--local-postgres" in sys.argv else tempfile.TemporaryDirectory(prefix="pilot-worker-native-", dir=ROOT / "tmp")
        with scratch_context as scratch:
            scratch = pathlib.Path(scratch)
            evidence = {}
            for field in ("host", "recovery", "retention", "fleet"):
                path = scratch / (field + ".txt"); path.write_text("SYNTHETIC isolated " + field + "; not operating evidence.")
                evidence[field] = str(path)
            spec = dict(v=1, poolsAlreadyEnrolled=False, approvalId=APPROVAL, deploymentId=uid(), notBefore=before, until=until, publicKeySpkiBase64=spki,
                        evidence=evidence, host=dict(maxReplicas=1,maxRestartsPerDeployment=3,maxDeployments=1,recoverySeconds=60,supervisorLookupRetries=0),
                        workers=[dict(kind=kind, workerId=uid(), poolPermitId=uid(), bootIds=[uid() for _ in range(4)],
                                      maxPolls=130 if kind=="chat_stage" else 400,pollSeconds=30 if kind=="chat_stage" else 10,
                                      busySeconds=70 if kind=="chat_stage" else 30,retrySeconds=180 if kind=="chat_stage" else 60,
                                      restartSeconds=60,**(dict(registrationSeconds=5) if kind=="chat_stage" else {})) for kind in ("chat_stage","ptt")])
            spec_path = scratch / "spec.json"; spec_path.write_text(json.dumps(spec)); out = scratch / "plan"
            node = r"C:\dev\toolchains\node-v22.23.4-win-x64\node.exe"
            subprocess.run([node,str(ROOT/"tooling/local/commission-communication-pilot.mjs"),"prepare","--spec",str(spec_path),"--out",str(out)],check=True,capture_output=True,text=True)
            p = json.loads((out/"plan.json").read_text())
            # Fund only this synthetic isolated hook fixture. No source helper impersonates approval in a real database.
            for w, bounds in zip(spec["workers"],p["workers"]):
                permit=w["poolPermitId"]; feature="media_upload" if w["kind"]=="chat_stage" else "ptt_live"
                command=json.dumps(bounds["command"])
                sql(f"""insert into erp_comm_cost.proof values('{permit}','communications','1','{feature}',null,'{until}',
                  '{until}',interval '30 minutes','SYNTHETIC retained bytes','SYNTHETIC finite shutdown',0,'{APPROVAL}');
                  insert into erp_comm_cost.reservation(operation_id,permit_id,scope,actor_id,feature,approval_id,liability_ends_at,floor_micros,reserved_micros,issued_at,expires_at,actor_session,command_hash)
                  values('{permit}','{permit}','communications','1','{feature}','{APPROVAL}',null,0,100,now(),'{until}','{SESSION}',sha256(convert_to('{command}'::jsonb::text,'UTF8')));""")
                units=[("database","funded_"+bounds["command"]["kind"]+"_actions",bounds["maxActions"]),
                       ("database","permanent_ledger_bytes",bounds["minimumLedgerBytes"]),
                       ("storage" if feature=="media_upload" else "sfu_turn","synthetic_provider_units",1)]
                units += [(d,"funded_worker_registration_probes",4) for d in ("railway","database")]
                units += [(d,"funded_worker_delivery_lookups",bounds["maxLookups"]) for d in ("railway","database")]
                for dimension, unit, quantity in units:
                    cap=value(f"""insert into erp_comm_cost.capacity(billing_account,dimension,unit,valid_from,valid_until,available_units,enabled)
                     values('{permit}','{dimension}','{unit}',now()-interval '1 hour','{until}',1000000000000,true) returning id""")
                    sql(f"""insert into erp_comm_cost.unit_hold values('{permit}',{cap},{quantity});
                      insert into erp_comm_cost.meter values('{permit}','{dimension}','SYNTHETIC native price/unit evidence',true,now(),'{until}','{until}',1,{cap},{quantity});""")
            enrollment=(out/"enroll.sql").read_text()
            first=spec["workers"][0]; first_pool=first["poolPermitId"]
            sql(f"update erp_comm_cost.unit_hold h set units=0 from erp_comm_cost.capacity c where c.id=h.capacity_id and h.permit_id='{first_pool}' and c.unit='funded_worker_delivery_lookups' and c.dimension='database';")
            denied(enrollment)
            assert value("select count(*) from erp_comm_cost.control_pool") == "0"
            sql(f"update erp_comm_cost.unit_hold h set units=16 from erp_comm_cost.capacity c where c.id=h.capacity_id and h.permit_id='{first_pool}' and c.unit='funded_worker_delivery_lookups' and c.dimension='database';")
            sql(enrollment)
            assert value("select count(*) from erp_comm_cost.worker_lookup_plan") == "2"
            assert value("select count(*) from erp_comm_cost.worker_launch_ticket") == "8"
            # A genuine exact pool funds every bounded redelivery wake plus retirement before installation.
            delivery_pool=uid();delivery_id=uid();actions=200;cadence=20
            retire=value(f"select to_char(('{until}'::timestamptz+interval '25 seconds') at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')")
            command=json.dumps(dict(op="budget.fundControl",kind="supervisor_delivery",subject="communication-supervisor",maxActions=actions,endEpoch=int(value(f"select extract(epoch from '{retire}'::timestamptz)::bigint"))))
            sql(f"""insert into erp_comm_cost.proof values('{delivery_pool}','communications','1','chat',null,'{retire}','{retire}',interval '30 minutes','SYNTHETIC retained delivery rows','SYNTHETIC prepaid retirement',0,'{APPROVAL}');
              insert into erp_comm_cost.reservation(operation_id,permit_id,scope,actor_id,feature,approval_id,liability_ends_at,floor_micros,reserved_micros,issued_at,expires_at,actor_session,command_hash)
              values('{delivery_pool}','{delivery_pool}','communications','1','chat','{APPROVAL}',null,0,100,now(),'{retire}','{SESSION}',sha256(convert_to('{command}'::jsonb::text,'UTF8')));
              insert into erp_comm_cost.capacity(billing_account,dimension,unit,valid_from,valid_until,available_units,enabled)
              values('{delivery_pool}','database','funded_supervisor_delivery_actions',now()-interval '1 minute','{retire}',1000000000,true),
                    ('{delivery_pool}','database','permanent_ledger_bytes',now()-interval '1 minute','{retire}',1000000000,true),
                    ('{delivery_pool}','database','funded_supervisor_manifest_probes',now()-interval '1 minute','{retire}',1000000000,true),
                    ('{delivery_pool}','railway','funded_supervisor_manifest_probes',now()-interval '1 minute','{retire}',1000000000,true);
              insert into erp_comm_cost.unit_hold select '{delivery_pool}',id,case unit when 'funded_supervisor_delivery_actions' then {actions} when 'funded_supervisor_manifest_probes' then 12 else 10000000 end from erp_comm_cost.capacity where billing_account='{delivery_pool}';
              insert into erp_comm_cost.control_pool(permit_id,kind,subject,max_actions,valid_until,continuing_zero_evidence,poll_seconds,enabled)
              values('{delivery_pool}','supervisor_delivery','communication-supervisor',{actions},'{retire}','SYNTHETIC retained redelivery rows',{cadence},true);""")
            manifest=dict(v=1,purpose="erp-communication-supervisor",deploymentId=spec["deploymentId"],until=until,planHash=p["planHash"],maxReplicas=1,maxRestartsPerDeployment=3,maxDeployments=1,maxPhysicalStarts=4,
                workers=[dict(kind=w["kind"],worker=w["workerId"],boots=w["bootIds"],retries=0,maxLookups=b["maxLookups"],maxPolls=w["maxPolls"],busySeconds=w["busySeconds"],pollSeconds=w["pollSeconds"],retrySeconds=w["retrySeconds"],restartSeconds=w["restartSeconds"],registrationSeconds=w.get("registrationSeconds",0),recoverySeconds=60,quarantineSeconds=w["busySeconds"]+w["pollSeconds"]+w["restartSeconds"]+w.get("registrationSeconds",0)) for w,b in zip(spec["workers"],p["workers"])])
            mbytes=json.dumps(manifest).encode();mtoken=base64.urlsafe_b64encode(mbytes).rstrip(b'=').decode()+'.'+base64.urlsafe_b64encode(key.sign(mbytes)).rstrip(b'=').decode()
            mh=hashlib.sha256(mtoken.encode()).hexdigest()
            ch=hashlib.sha256(json.dumps(dict(deploymentId=spec['deploymentId'],until=until,workers=[{k:w[k] for k in ('kind','worker','boots','retries','quarantineSeconds')} for w in manifest['workers']]),sort_keys=True,separators=(',',':')).encode()).hexdigest()
            def seed_wakes(identifier):
                start=datetime.datetime.fromisoformat(before.replace('Z','+00:00'));end=datetime.datetime.fromisoformat(until.replace('Z','+00:00'));rows=[];ordinal=0
                while start+datetime.timedelta(seconds=ordinal*cadence)<end:
                    at=start+datetime.timedelta(seconds=ordinal*cadence);expires=min(end,at+datetime.timedelta(seconds=cadence+5));nonce=uid()
                    at_text=at.isoformat(timespec='milliseconds').replace('+00:00','Z');ex_text=expires.isoformat(timespec='milliseconds').replace('+00:00','Z')
                    wake=dict(v=1,purpose='erp-communication-supervisor-wake',planId=identifier,deploymentId=spec['deploymentId'],nonce=nonce,scheduledAt=at_text,expiresAt=ex_text,cutoff=until,configHash=ch,manifestHash=mh,maxClaimsPerProcess=3,maxPhysicalStarts=4)
                    raw=json.dumps(wake).encode();signed=base64.urlsafe_b64encode(raw).rstrip(b'=').decode()+'.'+base64.urlsafe_b64encode(key.sign(raw)).rstrip(b'=').decode()
                    rows.append(f"insert into erp_comm_cost.supervisor_wake_ticket(nonce,plan,ordinal,scheduled_at,expires_at,wake) values('{nonce}','{identifier}',{ordinal},'{at_text}','{ex_text}','{signed}');");ordinal+=1
                sql('\n'.join(rows))
            sql(f"""insert into erp_comm_cost.supervisor_delivery_plan(id,pool,deployment_id,manifest,manifest_sha256,config_hash,max_claims_per_process,max_claims,not_before,deliver_until,retire_by,cadence_seconds,max_deliveries,evidence_id)
              values('{delivery_id}','{delivery_pool}','{spec['deploymentId']}','{mtoken}','{mh}','{ch}',3,12,'{before}','{until}','{retire}',{cadence},{actions-1},'SYNTHETIC finite redelivery');""")
            seed_wakes(delivery_id)
            for role in ('anon','authenticated','service_role'):
                denied(f"set role {role};select erp_comm_cost.start_supervisor_delivery('{delivery_id}')")
                denied(f"set role {role};select * from erp_comm_cost.supervisor_delivery_plan")
            assert value(f"select erp_comm_cost.start_supervisor_delivery('{delivery_id}')")=='t'
            assert value(f"select used from erp_comm_cost.control_pool where permit_id='{delivery_pool}'")=='2'
            assert value("select count(*) from cron.job")=="1"
            assert value("select url from net.requests limit 1")=="https://erp.algt.net/api/internal/communications/supervisor-launch"
            assert value("select position('Bearer' in command)=0 from cron.job limit 1")=="t"
            headers=json.loads(value("select headers from net.requests limit 1"));assert 'Authorization' not in headers
            current=json.loads(base64.urlsafe_b64decode(headers['X-ERP-Signed-Wake'].split('.')[0]+'=='))
            assert current['purpose']=='erp-communication-supervisor-wake' and 'boots' not in current and 'workers' not in current
            assert mtoken not in json.dumps(headers) and spec['workers'][0]['bootIds'][0] not in json.dumps(headers)
            sql("grant usage on schema net to authenticated;grant select on net.requests to authenticated")
            public_queue=value("set role authenticated;select headers from net.requests limit 1");assert mtoken not in public_queue
            denied("set role authenticated;select * from erp_comm_cost.supervisor_wake_ticket")
            claim=f"select public.erp_comm_supervisor_manifest('{delivery_id}','{current['nonce']}','{spec['deploymentId']}','{mh}','{ch}')"
            denied("set role authenticated;"+claim)
            assert value("set role service_role;"+claim)==mtoken
            assert value("set role service_role;"+claim)==''
            sql(f"do $$begin for i in 1..15 loop perform public.erp_comm_supervisor_manifest('{delivery_id}',gen_random_uuid(),'{spec['deploymentId']}','{mh}','{ch}');end loop;end$$")
            assert value(f"select claims from erp_comm_cost.supervisor_delivery_plan where id='{delivery_id}'")=='12'
            assert value(f"select erp_comm_cost.start_supervisor_delivery('{delivery_id}')")=='f'
            # Native-only deterministic clock: no assertion is made about actual scheduling/host delay.
            sql("create or replace function erp_comm_cost.supervisor_delivery_clock() returns timestamptz language sql volatile set search_path='' as $$select coalesce(nullif(current_setting('test.worker_clock',true),'')::timestamptz,clock_timestamp())$$")
            sql(f"set test.worker_clock='{until}';select erp_comm_cost.supervisor_delivery_tick('{delivery_id}')")
            assert value("select count(*) from cron.job")=="0"
            assert value(f"select phase from erp_comm_cost.supervisor_delivery_plan where id='{delivery_id}'")=='stopped'
            assert value(f"select used from erp_comm_cost.control_pool where permit_id='{delivery_pool}'")=='2'
            assert value("select count(*) from net.requests")=="1"
            assert value(f"select erp_comm_cost.supervisor_delivery_tick('{delivery_id}')")=='f'
            denied(f"update erp_comm_cost.supervisor_delivery_plan set phase='prepared' where id='{delivery_id}'")
            # A second independent pool proves failed enqueues and early/duplicate wakes are charged,
            # exact count exhaustion retires the job, and later invocations cannot renew it.
            second_delivery_pool=uid();second_delivery_id=uid()
            sql(f"""insert into erp_comm_cost.proof select '{second_delivery_pool}',scope,actor_id,feature,liability_ends_at,operational_stop_by,valid_until,max_meter_age,retained_at_zero_cost_evidence,shutdown_evidence,headroom_micros,approval_id from erp_comm_cost.proof where operation_id='{delivery_pool}';
              insert into erp_comm_cost.reservation(operation_id,permit_id,scope,actor_id,feature,approval_id,liability_ends_at,floor_micros,reserved_micros,issued_at,expires_at,actor_session,command_hash)
              select '{second_delivery_pool}','{second_delivery_pool}',scope,actor_id,feature,approval_id,liability_ends_at,floor_micros,reserved_micros,now(),expires_at,actor_session,command_hash from erp_comm_cost.reservation where permit_id='{delivery_pool}';
              insert into erp_comm_cost.unit_hold select '{second_delivery_pool}',capacity_id,units from erp_comm_cost.unit_hold where permit_id='{delivery_pool}';
              insert into erp_comm_cost.control_pool(permit_id,kind,subject,max_actions,valid_until,continuing_zero_evidence,poll_seconds,enabled)
              select '{second_delivery_pool}',kind,subject,max_actions,valid_until,continuing_zero_evidence,poll_seconds,true from erp_comm_cost.control_pool where permit_id='{delivery_pool}';
              insert into erp_comm_cost.supervisor_delivery_plan(id,pool,deployment_id,manifest,manifest_sha256,config_hash,max_claims_per_process,max_claims,not_before,deliver_until,retire_by,cadence_seconds,max_deliveries,evidence_id)
              select '{second_delivery_id}','{second_delivery_pool}',deployment_id,manifest,manifest_sha256,config_hash,max_claims_per_process,max_claims,not_before,deliver_until,retire_by,cadence_seconds,max_deliveries,evidence_id from erp_comm_cost.supervisor_delivery_plan where id='{delivery_id}';""")
            seed_wakes(second_delivery_id)
            sql(f"set test.net_fail='true';select erp_comm_cost.start_supervisor_delivery('{second_delivery_id}')")
            assert value(f"select used from erp_comm_cost.control_pool where permit_id='{second_delivery_pool}'")=='2'
            assert value("select count(*) from net.requests")=="1"
            sql(f"set test.unschedule_fail='true';do $$begin for i in 1..250 loop perform erp_comm_cost.supervisor_delivery_tick('{second_delivery_id}');end loop;end$$")
            assert value(f"select used from erp_comm_cost.control_pool where permit_id='{second_delivery_pool}'")==str(actions)
            assert value(f"select deliveries from erp_comm_cost.supervisor_delivery_plan where id='{second_delivery_id}'")==str(actions-1)
            assert value(f"select phase from erp_comm_cost.supervisor_delivery_plan where id='{second_delivery_id}'")=='stopped'
            assert value("select count(*) from cron.job where active")=="0"
            assert value("select count(*) from cron.job")=="1"  # failed unschedule falls back to disabling the exact owned row
            assert value("select count(*) from net.requests")=="1"
            for role in ("anon","authenticated","service_role"):
                denied(f"set role {role};select * from erp_comm_cost.worker_signed_delivery")
                denied(f"set role {role};insert into erp_comm_cost.worker_lookup_plan(pool,max_lookups,valid_until,evidence_id) values('{first_pool}',16,'{until}','bad')")
            for role in ("anon","authenticated"):
                denied(f"set role {role};select public.erp_comm_worker_boot_delivery('chat_stage','{first['workerId']}','{spec['deploymentId']}','{first['bootIds'][0]}')")
            def publish(worker, boot, alter=None, bad_hash=False):
                raw=value(f"select erp_comm_cost.take_supervised_worker_delivery('{boot}',gen_random_uuid())")
                assert raw
                body=json.loads(raw)
                if alter: body.update(alter); raw=json.dumps(body)
                payload=raw.encode(); token=base64.urlsafe_b64encode(payload).rstrip(b"=").decode()+"."+base64.urlsafe_b64encode(key.sign(payload)).rstrip(b"=").decode()
                digest="0"*64 if bad_hash else hashlib.sha256(payload).hexdigest()
                statement=f"insert into erp_comm_cost.worker_signed_delivery(boot,token,receipt_sha256) values('{boot}','{token}','{digest}')"
                return statement,token
            statement,token=publish(first,first["bootIds"][0]); sql(statement)
            assert value(f"select erp_comm_cost.worker_standby_available('{first['bootIds'][0]}','{until}')") == "t"
            denied(statement)
            forged,_=publish(first,first["bootIds"][1],dict(deploymentId=uid())); denied(forged)
            forged,_=publish(first,first["bootIds"][2],bad_hash=True); denied(forged)
            def take(worker,boot,deployment=None):
                return value(f"set role service_role;select public.erp_comm_worker_boot_delivery('{worker['kind']}','{worker['workerId']}','{deployment or spec['deploymentId']}','{boot}')")
            assert take(first,uid()) == ""
            assert take(first,first["bootIds"][0],uid()) == ""
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                answers=list(pool.map(lambda _:take(first,first["bootIds"][0]),range(2)))
            assert sorted(answers)==["",token]
            assert value(f"select erp_comm_cost.worker_standby_available('{first['bootIds'][0]}','{until}')") == "f"
            assert value(f"select used from erp_comm_cost.worker_lookup_plan where pool='{first_pool}'") == "4"
            denied(f"update erp_comm_cost.worker_lookup_plan set used=0 where pool='{first_pool}'")
            last=first["bootIds"][3]; statement,last_token=publish(first,last);sql(statement)
            sql(f"update erp_comm_cost.chat_stage_boot set lease_until=now()+interval '1 minute' where boot='{first['bootIds'][0]}'")
            assert take(first,last).startswith("hold:")
            sql(f"update erp_comm_cost.chat_stage_boot set lease_until=now()-interval '1 minute' where boot='{first['bootIds'][0]}'")
            assert take(first,last)==last_token
            second=spec["workers"][1]; statement,second_token=publish(second,second["bootIds"][0]);sql(statement)
            assert take(second,second["bootIds"][0])==second_token
            assert value(f"select erp_comm_cost.start_ptt_worker('{second['workerId']}','{second['bootIds'][0]}','{until}',400)")
            sql(f"update erp_comm_cost.control_pool set last_poll=clock_timestamp() where permit_id='{second['poolPermitId']}'")
            assert value(f"select erp_comm_cost.ptt_worker_covers('{second['workerId']}',now()+interval '10 minutes')") == "f"
            spare=second["bootIds"][1]; statement,spare_token=publish(second,spare);sql(statement)
            assert value(f"select erp_comm_cost.ptt_worker_covers('{second['workerId']}',now()+interval '10 minutes')") == "t"
            for _ in range(15): assert take(second,uid())==""
            assert take(second,spare)==""
            assert value(f"select used from erp_comm_cost.worker_lookup_plan where pool='{second['poolPermitId']}'")=="16"
            assert value(f"select taken_at is null from erp_comm_cost.worker_signed_delivery where boot='{spare}'")=="t"
            assert value(f"select erp_comm_cost.ptt_worker_covers('{second['workerId']}',now()+interval '10 minutes')") == "f"
            runtime_label="PG17.10 SCRAM loopback fallback" if "--local-postgres" in sys.argv else "PG17.11 network-none"
            print("PASS "+runtime_label+": exact utility SQL parity; synthetic authenticated owner; 2 worker plans/8 tickets; private ACLs; receipt forgery/duplicate/atomic-race/lookup-cap checks; lease quarantine/presigned admission; fixed-URL cron/net stubs; prepaid retirement; deadline and 200-action exhaustion unschedule; failed queue and duplicate wakes charged; no automatic renewal.")
    finally:
        docker("rm","--force",name)

if __name__ == "__main__":
    if "--local-postgres" in sys.argv:
        from native_pg_fallback import NativePgDockerShim
        with NativePgDockerShim(label="worker-recovery") as shim:
            original_runner=subprocess.run
            try:
                subprocess.run=shim.run
                run()
            finally:
                subprocess.run=original_runner
    else:
        run()
