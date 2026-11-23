"""Rehearse the exact budget migration in a disposable, network-isolated PostgreSQL 17 container."""
import concurrent.futures
import json
import os
import pathlib
import subprocess
import threading
import time
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20261123095158_erp_communication_budget_v1.sql"
OWNER = "10000000-0000-0000-0000-000000000001"
ADMIN = "10000000-0000-0000-0000-000000000002"
APPROVAL = "20000000-0000-0000-0000-000000000001"


def docker(*args, data=None, check=True):
    result = subprocess.run(["docker", *args], input=data, capture_output=True, text=True)
    if check and result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return result


def main():
    image = os.environ.get("BUDGET_TEST_PG_IMAGE", "postgres:17")
    name = f"erp-budget-test-{uuid.uuid4().hex[:12]}"
    docker("run", "--pull=never", "--network", "none", "--name", name, "--detach",
           "--tmpfs", "/var/lib/postgresql/data", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", image)

    # One independent PostgreSQL connection per test thread. Keep the real race while avoiding
    # a new Docker CLI/daemon/psql process for each individual fixture assertion.
    clients = []
    local = threading.local()
    def sql(query, check=True):
        client = getattr(local, "client", None)
        if client is None or client.poll() is not None:
            client = subprocess.Popen(["docker","exec","-i",name,"sh","-c","exec stdbuf -oL -eL psql -U postgres -XqAt -v ON_ERROR_STOP=0 2>&1"],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            local.client = client
            clients.append(client)
        marker = "BUDGET_END_"+uuid.uuid4().hex
        # The migration and some race/fencing cases supply their own transaction.
        own_transaction = query.lstrip().lower().startswith("begin;") or query.lstrip().startswith("-- Communications-only")
        block = query if own_transaction else "begin;\n"+query+"\ncommit;"
        try:
            client.stdin.write("rollback;\ndiscard all;\nset client_min_messages=error;\n\\set LAST_ERROR_SQLSTATE 00000\n"+block+"\n\\echo "+marker+" :LAST_ERROR_SQLSTATE :SQLSTATE\n")
            client.stdin.flush()
        except BrokenPipeError:
            return subprocess.CompletedProcess([],1,"","PostgreSQL process unavailable")
        lines = []
        while True:
            line = client.stdout.readline()
            if not line:
                break
            if line.startswith(marker+" "):
                break
            lines.append(line)
        errors = [line for line in lines if line.startswith(("ERROR:","FATAL:","psql: error:"))]
        output = "".join(line for line in lines if not line.startswith(("WARNING:","NOTICE:","ERROR:","FATAL:","psql: error:")))
        result = subprocess.CompletedProcess([], int(not line or line.strip().split()[1:] != ["00000","00000"]), output, "".join(errors))
        if check and result.returncode:
            raise RuntimeError(result.stderr or output or "PostgreSQL connection closed")
        return result
    def command(cmd, data):
        encoded = json.dumps(data).replace("'", "''")
        return json.loads(sql(f"set role service_role; select public.erp_comm_budget_command('{cmd}','{encoded}');").stdout)

    def reserve(op, feature="ptt_live", actor=ADMIN, floor="0"):
        return command("reserve", {"feature": feature, "actorId": actor, "operationId": op, "scope": "communications",
                                   "upperBoundMicros": floor, "liabilityEndsAt": None})

    def reason(result, expected):
        assert result == {"ok": False, "reason": expected}, (result, expected)

    session = "30000000-0000-0000-0000-000000000001"
    deadline = None

    def operator(actor, op, data, age=0):
        args = json.dumps(data).replace("'", "''")
        return sql(f"""set role authenticated; set test.actor='{actor}'; set test.age='{age}';
            select public.erp_comm_budget_operator('{"1" if actor == OWNER else "2"}','{session}',
            'budget.{op}','{args}'::jsonb);""", check=False)

    def approve(actor, age=0, revoke=False, scope="communications"):
        args = {"scope": scope, "clientMutationId": APPROVAL, "maxMicros": "100", "features": ["ptt_live","chat"],
                "endsAt": deadline, "currency": "USD"}
        if revoke:
            args = {"scope":scope, "clientMutationId":str(uuid.uuid4()), "approvalId":APPROVAL}
        return operator(actor, "revoke" if revoke else "approve", args, age)

    def proof(op, cost=0, feature="ptt_live", authority=False, retention=True):
        funding = f"'{APPROVAL}'" if authority else "null"
        retained = "'proof-of-zero-cost-retention'" if retention else "null"
        statements = []
        dims = ["railway", "database"]
        if feature == "ptt_live":
            dims.append("sfu_turn")
        if feature=="sos":
            discovery = f"""insert into erp_comm_cost.meter select '{op}','database','bounded discovery',true,now(),now()+interval '10 minutes',
                now()+interval '30 minutes',0,id,100000 from erp_comm_cost.capacity where unit='sos_discovery_target_checks';"""
        if feature=="realtime":
            dims.append("realtime")
        if feature in ("media_upload","media_download","export"):
            dims.append("storage")
        if feature in ("sos","push"):
            dims.append("fcm")
        statements.append(f"""insert into erp_comm_cost.proof values ('{op}','communications','{ADMIN}','{feature}',null,
          now()+interval '20 minutes',now()+interval '10 minutes',interval '30 seconds',{retained},'shutdown',0,{funding});""")
        if feature in ("ptt_live","media_upload"):
            endpoint = "close_sfu_tracks" if feature == "ptt_live" else "discard_partial_upload"
            statements.append(f"insert into erp_comm_cost.cleanup_limit values ('{op}','{endpoint}',1,2);")
        for dim in dims:
            statements.append(f"""insert into erp_comm_cost.meter values ('{op}','{dim}','proof',true,now(),
             now()+interval '10 minutes',now()+interval '30 minutes',{cost if dim == 'railway' else 0},
             (select id from erp_comm_cost.capacity where dimension='{dim}' and unit='units'),1);""")

        statements.append(f"""insert into erp_comm_cost.meter select '{op}','database','ledger size and continuing funding',true,now(),
            now()+interval '10 minutes',now()+interval '30 minutes',0,id,10000000 from erp_comm_cost.capacity where unit='permanent_ledger_bytes';""")
        if feature=="sos":
            statements.append(discovery)
        sql("\n".join(statements))

    def fund_pool(label, kind, subject, limit, feature, horizon_hours=1):
        proof(label, feature=feature)
        dimension = "railway"
        unit = "funded_"+kind+"_actions"
        sql(f"""insert into erp_comm_cost.capacity(billing_account,dimension,unit,valid_from,valid_until,available_units,enabled)
          values('test','{dimension}','{unit}',now()-interval '1 hour',now()+interval '3 days',999999,true)
          on conflict do nothing;
          insert into erp_comm_cost.meter select '{label}','{dimension}','funded controls',true,now(),
          now()+interval '10 minutes',now()+interval '30 minutes',0,id,{limit} from erp_comm_cost.capacity where unit='{unit}';
          update erp_comm_cost.meter set upper_units=greatest(upper_units,{65536+limit*32768}) where operation_id='{label}' and
            capacity_id in(select id from erp_comm_cost.capacity where unit='permanent_ledger_bytes');""")
        epoch = int(sql(f"select extract(epoch from now()+interval '{horizon_hours} hours')::bigint;").stdout.strip())
        seal = {"op":"budget.fundControl","kind":kind,"subject":subject,"maxActions":limit,"endEpoch":epoch}
        issued = command("reserve",{"feature":feature,"scope":"communications","operationId":label,"actorId":ADMIN,"upperBoundMicros":"0",
            "liabilityEndsAt":None,"binding":{"actorSessionId":session,"command":seal}})
        assert issued["ok"], issued
        sql(f"""insert into erp_comm_cost.control_pool(permit_id,kind,subject,max_actions,valid_until,continuing_zero_evidence,enabled)
            values('{issued["permitId"]}','{kind}','{subject}',{limit},to_timestamp({epoch}),'bounded post-expiry controls',true);""")
        return issued["permitId"]
    try:
        for _ in range(60):
            status = sql("select current_setting('server_version_num');", check=False)
            if status.returncode == 0:
                assert status.stdout.strip().startswith("17"), status.stdout
                break
            time.sleep(0.25)
        else:
            raise RuntimeError("PostgreSQL did not start")
        sql(f"""
            create role anon; create role authenticated; create role service_role bypassrls;
            create schema auth; create schema erp_private; create table auth.users(id uuid primary key);
            create table public.user_profiles(id bigint generated always as identity,auth_user_id uuid,status text,must_change_password boolean);
            insert into auth.users values ('{OWNER}'),('{ADMIN}');
            insert into public.user_profiles(auth_user_id,status,must_change_password) select id,'active',false from auth.users;
            create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
            create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id','{session}','amr',jsonb_build_array(
              jsonb_build_object('method','password','timestamp',floor(extract(epoch from now())-current_setting('test.age')::integer))))$$;
            create function public.f03_current_session_valid() returns boolean language sql as $$select true$$;
            create function erp_private.business_principal_is_active() returns boolean language sql as $$select true$$;
            create function erp_private.provider_actor_session_valid(bigint,uuid) returns boolean language sql as $$
                select $1=2 and $2='{session}'::uuid $$;
        """)
        sql(MIGRATION.read_text(encoding="utf-8-sig"))
        deadline = sql("select to_char(timezone('UTC',now()+interval '2 hours'),'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"');").stdout.strip()
        sql("""insert into erp_comm_cost.capacity(billing_account,dimension,unit,valid_from,valid_until,available_units,enabled)
            select 'test',d,'units',now()-interval '1 hour',now()+interval '1 day',1000,true
            from unnest(array['railway','database','sfu_turn','fcm','storage','realtime']) d;
            insert into erp_comm_cost.capacity(billing_account,dimension,unit,valid_from,valid_until,available_units,enabled)
            values('test','database','permanent_ledger_bytes',now()-interval '1 hour',now()+interval '1 day',10000000000,true),
             ('test','database','sos_discovery_target_checks',now()-interval '1 hour',now()+interval '1 day',1000000,true);""")
        assert json.loads(operator(ADMIN,"status",{"scope":"communications"}).stdout)["canApprove"] is False
        reason(reserve("missing"), "owner_binding_unverified")
        assert approve(OWNER).returncode != 0
        for role in ("anon", "authenticated"):
            assert sql(f"set role {role}; select public.erp_comm_budget_command('pause','{{}}');", False).returncode != 0
            assert sql(f"set role {role}; select * from erp_comm_cost.authority;", False).returncode != 0

        sql(f"update erp_comm_cost.authority set owner_auth_id='{OWNER}',owner_binding_evidence='verified enrollment';")
        reason(reserve("no-proof"), "billing_evidence_unavailable")
        assert approve(ADMIN).returncode != 0
        old_auth=approve(OWNER, age=3600)
        assert old_auth.returncode != 0, (old_auth.stdout,old_auth.stderr)
        response = approve(OWNER)
        assert response.returncode == 0, response.stderr
        assert approve(OWNER, scope="another scope").returncode != 0
        roster = {"scope":"communications","recipientProfileIds":["2"],"clientMutationId":str(uuid.uuid4())}
        assert operator(ADMIN,"monitor",roster).returncode != 0
        roster_set = operator(OWNER,"monitor",roster)
        assert roster_set.returncode == 0, roster_set.stderr
        assert operator(ADMIN,"monitor",{"scope":"communications"}).returncode == 0
        assert json.loads(operator(ADMIN,"status",{"scope":"communications"}).stdout)["canApprove"] is False
        reason(reserve("no-proof"), "billing_evidence_unavailable")
        assert approve(ADMIN).returncode != 0
        assert operator(OWNER,"monitor",{**roster,"recipientProfileIds":[]}).returncode != 0
        assert operator(OWNER,"status",{"scope":"invented"}).returncode != 0
        proof("unfunded-alerts")
        reason(reserve("unfunded-alerts"),"owner_alert_capacity_unavailable")
        fund_pool("owner-baseline","budget_alert","1",500,"push",72)
        fund_pool("admin-baseline","budget_alert","2",500,"push",72)
        proof("unfunded", 1)
        reason(reserve("unfunded"), "owner_approval_required")
        proof("hold", retention=False, feature="chat")
        reason(reserve("hold", feature="chat"), "continuing_retention_unproven")
        proof("stale")
        sql("update erp_comm_cost.meter set observed_at=now()-interval '1 hour' where operation_id='stale';")
        reason(reserve("stale"), "meter_stale_or_incomplete")
        proof("pulse-no-durable",feature="realtime",retention=False)
        sql("update erp_comm_cost.proof set liability_ends_at='2035-01-01' where operation_id='pulse-no-durable';")
        no_durable=command("reserve",{"feature":"realtime","scope":"communications","operationId":"pulse-no-durable","actorId":ADMIN,
            "upperBoundMicros":"0","liabilityEndsAt":"2035-01-01"})
        reason(no_durable,"continuing_retention_unproven")
        proof("pulse-no-bytes",feature="realtime")
        sql("delete from erp_comm_cost.meter where operation_id='pulse-no-bytes' and capacity_id in (select id from erp_comm_cost.capacity where unit='permanent_ledger_bytes');")
        reason(reserve("pulse-no-bytes",feature="realtime"), "ledger_retention_capacity_unproven")
        proof("missing-dimension")
        sql("delete from erp_comm_cost.meter where operation_id='missing-dimension' and dimension='sfu_turn';")
        reason(reserve("missing-dimension"), "meter_stale_or_incomplete")
        proof("incomplete")
        sql("update erp_comm_cost.meter set complete=false where operation_id='incomplete';")
        reason(reserve("incomplete"), "meter_stale_or_incomplete")
        proof("short")
        sql("update erp_comm_cost.meter set covered_until=now() where operation_id='short';")
        reason(reserve("short"), "meter_stale_or_incomplete")
        proof("zero")
        free = reserve("zero")
        assert free["ok"] and free["newReservation"]
        cleanup = {"permitId":free["permitId"],"endpoint":"close_sfu_tracks","resourceId":"sfu/session-123"}
        assert command("bind_cleanup",cleanup)["ok"]
        reason(command("bind_cleanup",{**cleanup,"resourceId":"sfu/unreserved"}),"cleanup_allocation_unavailable")
        assert reserve("zero")["newReservation"] is False
        reason(reserve("zero", actor=OWNER), "operation_conflict")
        proof("long", 20, authority=True)
        sql("update erp_comm_cost.proof set operational_stop_by=now()+interval '8 hours' where operation_id='long';"
            "update erp_comm_cost.meter set covered_until=now()+interval '9 hours' where operation_id='long';")
        reason(reserve("long"), "liability_exceeds_approval")
        proof("limit-a", 60, authority=True)
        proof("limit-b", 60, authority=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(reserve, ["limit-a", "limit-b"]))
        winner = next(i for i, result in enumerate(results) if result["ok"])
        reason(results[1-winner], "budget_exhausted")
        op = ["limit-a", "limit-b"][winner]
        permit = results[winner]["permitId"]
        assert reserve(op)["permitId"] == permit
        reason(reserve(op, floor="1"), "operation_closed_or_changed")
        settlement = {"feature": "ptt_live", "scope": "communications", "permitId": permit,
                      "operationId": op, "actualMicros": "61", "evidenceId": "final-ledger"}
        reason(command("settle", settlement), "settlement_unconfirmed")
        sql(f"insert into erp_comm_cost.final_evidence values ('final-ledger','{permit}',61,now());")
        reason(command("settle", settlement), "cost_bound_exceeded")
        reason(command("settle", settlement), "cost_bound_exceeded")
        reason(reserve(op), "feature_paused")
        sql("update erp_comm_cost.reservation set expires_at=now()-interval '1 minute' where operation_id='zero';")
        attempt = {**cleanup,"attemptId":"close-1"}
        assert command("authorize_cleanup",attempt)=={"ok":True,"newAttempt":True}
        assert command("authorize_cleanup",attempt)=={"ok":True,"newAttempt":False}
        reason(command("authorize_cleanup",{**attempt,"resourceId":"other/resource"}),"cleanup_unbound")
        assert command("authorize_cleanup",{**attempt,"attemptId":"close-2"})["newAttempt"]
        reason(command("authorize_cleanup",{**attempt,"attemptId":"close-3"}),"cleanup_allocation_exhausted")
        assert command("confirm_cleanup",attempt)["ok"]
        proof("other", feature="chat")
        assert reserve("other", feature="chat")["ok"]
        assert approve(OWNER,revoke=True).returncode == 0
        proof("revoked", feature="chat", authority=True)
        reason(reserve("revoked", feature="chat"), "owner_approval_invalid")
        events=sql("set role service_role; select reason from public.erp_comm_budget_monitor_events(0,100);").stdout
        assert "budget_exhausted" in events and "cost_bound_exceeded" in events and "approval_revoked" in events
        proof("fenced", feature="push")
        sql("update erp_comm_cost.proof set actor_id='2' where operation_id='fenced';")
        wire = {"op":"chat.send","args":{"text":"sample"}}
        bound = command("reserve",{"feature":"push","operationId":"fenced","actorId":"2","scope":"communications",
            "upperBoundMicros":"0","liabilityEndsAt":None,"binding":{"actorSessionId":session,"command":wire}})
        assert bound["ok"], bound
        def take(payload, permit=bound["permitId"], as_actor=ADMIN, as_role="postgres"):
            return sql(f"""set role {as_role}; set test.actor='{as_actor}'; set test.age='0';
              select erp_comm_cost.take_permit('{permit}','push','communications','2','{json.dumps(payload)}');""",False)
        assert take(wire,as_role="authenticated").returncode != 0
        assert take({"op":"chat.send","args":{"text":"changed"}}).returncode != 0
        assert take(wire,as_actor=OWNER).returncode != 0
        validated=take(wire)
        assert validated.returncode == 0,(validated.stdout,validated.stderr)
        assert take(wire).returncode != 0
        proof("sos-model",feature="sos")
        sql("insert into erp_comm_cost.standing_envelope values('communications','sos','sos-model',true);")
        reason(reserve("sos-unbounded",feature="sos"),"sos_cancellation_envelope_unavailable")
        sql("insert into erp_comm_cost.sos_limit values('sos-model',4,8,'bounded fanout','zero future liability');")
        sos_wire={"op":"sos.send","args":{"channel":"synthetic"}}
        sos=command("reserve",{"feature":"sos","operationId":"sos-origin","actorId":"2","scope":"communications",
            "upperBoundMicros":"0","liabilityEndsAt":None,"binding":{"actorSessionId":session,"command":sos_wire}})
        assert sos["ok"], sos
        origin=f"""begin; set test.actor='{ADMIN}'; set test.age='0';
            select erp_comm_cost.take_permit('{sos["permitId"]}','sos','communications','2','{json.dumps(sos_wire)}');"""
        admission=f"select erp_comm_cost.require_sos_envelope('{sos['permitId']}',"
        assert sql(origin+admission+"5,8); commit;",False).returncode != 0
        assert sql(origin+admission+"4,9); commit;",False).returncode != 0
        source=str(uuid.uuid4())
        cancelled=str(uuid.uuid4())
        valid_origin=origin+admission+f"4,8); select erp_comm_cost.bind_sos_notice('{sos['permitId']}','{source}','original',2); commit;"
        assert sql(valid_origin,False).returncode==0
        sql(f"select erp_comm_cost.bind_sos_notice('{sos['permitId']}','{cancelled}','cancelled',2);")
        assert sql(f"select erp_comm_cost.bind_sos_notice('{sos['permitId']}','{cancelled}','cancelled',99);",False).returncode!=0
        sql("create function erp_private.notification_sos_target(uuid,bigint) returns jsonb language sql as $$select jsonb_build_object('pushEligible',true) where $2=2$$;")
        device, job, lease = [str(uuid.uuid4()) for _ in range(3)]
        bound_args=f"'sos','{cancelled}',2,'{device}','{job}','{lease}'"
        sql("insert into erp_comm_cost.pause values('communications','sos','paused',now());")
        assert sql(f"select erp_comm_cost.take_notice_attempt({bound_args});").stdout.strip()=="t"
        assert sql(f"select erp_comm_cost.take_notice_attempt({bound_args});").stdout.strip()=="f"
        assert sql(f"select erp_comm_cost.notice_attempt_valid({bound_args});").stdout.strip()=="t"
        assert sql(f"select erp_comm_cost.take_control_read('sos','{cancelled}',2,'{session}',gen_random_uuid());").stdout.strip()=="t"
        assert sql(admission+"1,1);",False).returncode != 0
        # Twenty newer UUIDs previously hid the eligible cancellation behind LIMIT 16. Simulate both
        # depleted receipts and still-funded sources whose current target access was revoked.
        sql(f"""do $$ declare i integer; op text; ticket uuid; src uuid; begin
          for i in 1..20 loop
            op:='past-notice-'||i; ticket:=gen_random_uuid(); src:=('ffffffff-ffff-4fff-8fff-'||lpad(i::text,12,'0'))::uuid;
            insert into erp_comm_cost.proof select (jsonb_populate_record(null::erp_comm_cost.proof,
              to_jsonb(p)||jsonb_build_object('operation_id',op))).* from erp_comm_cost.proof p where p.operation_id='sos-origin';
            insert into erp_comm_cost.reservation select (jsonb_populate_record(null::erp_comm_cost.reservation,to_jsonb(r)||
              jsonb_build_object('operation_id',op,'permit_id',ticket))).* from erp_comm_cost.reservation r where r.operation_id='sos-origin';
            insert into erp_comm_cost.sos_claim values(ticket,1,1);
            insert into erp_comm_cost.notice_binding(source,profile,origin,phase,remaining_reads,discovery_ceiling,future_cancel)
              values(src,2,ticket,'original',case when i<=10 then 0 else 1 end,64,false);
          end loop;
          update erp_comm_cost.notice_binding set remaining_reads=0 where source='{source}';
        end $$;
        create or replace function erp_private.notification_sos_target(uuid,bigint) returns jsonb language sql as
          $$select jsonb_build_object('pushEligible',true) where $2=2 and $1::text not like 'ffffffff-%'$$;""")
        list_id=str(uuid.uuid4())
        assert sql(f"select erp_comm_cost.take_control_read('sos',null,2,'{session}','{list_id}');").stdout.strip()=="t"
        assert sql(f"select source from erp_comm_cost.notice_read where profile=2 and request='{list_id}';").stdout.strip()==cancelled
        proof("model",feature="push")
        sql("insert into erp_comm_cost.standing_envelope values('communications','push','model',true);"
            "update erp_comm_cost.capacity set available_units=1+(select coalesce(sum(h.units),0) from erp_comm_cost.unit_hold h where h.capacity_id=erp_comm_cost.capacity.id) where dimension='fcm';")
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda op:reserve(op,feature="push"),["unit-a","unit-b"]))
        assert sum(r["ok"] for r in results)==1, results
        reason(next(r for r in results if not r["ok"]),"provider_capacity_exhausted")
        pauseResult=operator(ADMIN,"pause",{"scope":"communications","feature":"push","reason":"maintenance","clientMutationId":str(uuid.uuid4())})
        assert pauseResult.returncode==0, pauseResult.stderr
        reason(reserve("future",feature="push"),"feature_paused")
        # An approved, finite budget alert transport keeps working after the ordinary push gate pauses.
        sql("delete from erp_comm_cost.pause where feature='push'; update erp_comm_cost.capacity set available_units=1000 where dimension='fcm';")
        sql("update erp_comm_cost.control_pool set enabled=false where kind='budget_alert' and subject='2';")
        fund_pool("owner-notices","budget_alert","2",3,"push")
        sql("insert into erp_comm_cost.pause values('communications','push','paused',now());")
        monitor_source=sql(f"select source_uuid from erp_comm_cost.alert where recipient_auth_id='{ADMIN}' limit 1;").stdout.strip()
        notice=[str(uuid.uuid4()) for _ in range(3)]
        args=f"'budget','{monitor_source}',2,'{notice[0]}','{notice[1]}','{notice[2]}'"
        assert sql(f"select erp_comm_cost.take_notice_attempt({args});").stdout.strip()=="t"
        assert sql(f"select erp_comm_cost.notice_attempt_valid({args});").stdout.strip()=="t"
        assert sql(f"select erp_comm_cost.take_notice_attempt({args});").stdout.strip()=="f"
        assert sql(f"select erp_comm_cost.take_control_read('budget',null,2,'{session}',gen_random_uuid());").stdout.strip()=="t"
        assert sql(f"select erp_comm_cost.take_control_read('control',null,2,'{session}',gen_random_uuid());").stdout.strip()=="t"
        assert sql(f"select erp_comm_cost.take_control_read('budget',null,2,'{session}',gen_random_uuid());").stdout.strip()=="f"
        sql("update erp_comm_cost.control_pool set enabled=false where kind='budget_alert' and subject='2';"
            "update erp_comm_cost.control_pool set enabled=true where permit_id=(select permit_id from erp_comm_cost.reservation where operation_id='admin-baseline');")
        fund_pool("safety-block","block","2",1,"chat")
        assert sql("select erp_comm_cost.take_policy_control(3,'block');",False).returncode!=0
        assert sql("select erp_comm_cost.take_policy_control(2,'block');",False).returncode==0
        assert sql("select erp_comm_cost.take_policy_control(2,'block');",False).returncode!=0
        assert sql("select erp_comm_cost.take_policy_control(2,'report');",False).returncode!=0

        worker=str(uuid.uuid4())
        fund_pool("worker-plan","chat_stage_poll",worker,10000,"media_upload",28)
        poll=str(uuid.uuid4())
        assert sql(f"select erp_comm_cost.take_chat_stage_poll('{worker}','{poll}') is not null;").stdout.strip()=="t"
        assert sql(f"select erp_comm_cost.take_chat_stage_poll('{worker}','{poll}') is not null;").stdout.strip()=="f"
        assert sql(f"select erp_comm_cost.chat_stage_worker_covers('{worker}',now()+interval '25 hours');").stdout.strip()=="t"
        proof("chat-object",feature="media_upload")
        sql("""update erp_comm_cost.capacity set valid_until=now()+interval '3 days';
          update erp_comm_cost.proof set actor_id='2',operational_stop_by=now()+interval '26 hours' where operation_id='chat-object';
          update erp_comm_cost.meter set covered_until=now()+interval '26.5 hours' where operation_id='chat-object';
          update erp_comm_cost.cleanup_limit set max_attempts=3 where operation_id='chat-object';""")
        stage_wire={"op":"chat.stageOpen","args":{}}
        stage=command("reserve",{"feature":"media_upload","scope":"communications","operationId":"chat-object","actorId":"2","upperBoundMicros":"0",
                "liabilityEndsAt":None,"binding":{"actorSessionId":session,"command":stage_wire}})
        assert stage["ok"],stage
        stage_permit=stage["permitId"]
        upload=str(uuid.uuid4())
        stage_origin=f"""begin; set test.actor='{ADMIN}'; set test.age='0';
           select erp_comm_cost.take_permit('{stage_permit}','media_upload','communications','2','{json.dumps(stage_wire)}');
           select erp_comm_cost.bind_chat_stage('{stage_permit}','{upload}',now()+interval '25 hours');
           select erp_comm_cost.claim_chat_stage_window('{worker}','{stage_permit}',now()+interval '25 hours'); commit;"""
        sql(stage_origin)
        sql(f"select erp_comm_cost.release_attached_chat_stage('{stage_permit}','{upload}');")
        attempt={"permitId":stage_permit,"endpoint":"discard_partial_upload","resourceId":"erp-chat-media/"+upload,"attemptId":"late-delete"}
        reason(command("authorize_cleanup",attempt),"retained_object_protected")
        sql("update erp_comm_cost.capacity set valid_until=now()+interval '3 days';")
        proof("spool-held",feature="export")
        reason(reserve("spool-held",feature="export"),"export_spool_lifetime_unproven")
        sql("""insert into erp_comm_cost.export_spool_limit values('spool-held',1048576,2,1,60,'independent volume bounds');
           insert into erp_comm_cost.capacity(billing_account,dimension,unit,valid_from,valid_until,available_units,enabled)
           values('test','railway','encrypted_spool_byte_hours',now()-interval '1 hour',now()+interval '2 days',1000000,true);
           insert into erp_comm_cost.meter select 'spool-held','railway','spool timed volume',true,now(),now()+interval '10 minutes',
           now()+interval '30 minutes',0,id,35000 from erp_comm_cost.capacity where unit='encrypted_spool_byte_hours';""")
        assert reserve("spool-held",feature="export")["spool"]=={"bytesPerSlot":"1048576","slotsPerVolume":2,"maxVolumes":1,"cleanupTailSeconds":60}
        # Model one registered replica, one boot and finite poll cadence/byte and monetary holds.
        ptt_worker, boot, pulse=[str(uuid.uuid4()) for _ in range(3)]
        sql("delete from erp_comm_cost.pause where feature='ptt_live'; insert into erp_comm_cost.ptt_worker_fleet values(true,1,2,45,30,now()+interval '2 days',true,'bounded local boot budget');")
        fund_pool("ptt-worker","ptt_worker_poll",ptt_worker,10000,"ptt_live",27)
        start=f"select erp_comm_cost.start_ptt_worker('{ptt_worker}','{boot}',now()+interval '3 hours',1000) is not null;"
        assert sql(start).stdout.strip()=="t"
        assert sql(start).stdout.strip()=="f"
        assert sql(f"select erp_comm_cost.take_ptt_worker_poll('{ptt_worker}','{boot}','{pulse}') is not null;").stdout.strip()=="t"
        assert sql(f"select erp_comm_cost.take_ptt_worker_poll('{ptt_worker}','{boot}','{pulse}') is not null;").stdout.strip()=="f"
        assert sql(f"select erp_comm_cost.ptt_worker_covers('{ptt_worker}',now()+interval '25 minutes');").stdout.strip()=="t"
        proof("drain",feature="ptt_live")
        live=reserve("drain",feature="ptt_live")
        assert live["ok"],live
        sql("update erp_comm_cost.ptt_worker_fleet set max_boots=1;")
        assert sql(f"select erp_comm_cost.claim_ptt_drain('{ptt_worker}','{live['permitId']}',now()+interval '3 minutes');",False).returncode!=0
        sql("update erp_comm_cost.ptt_worker_fleet set max_boots=2;")
        assert sql(f"select erp_comm_cost.claim_ptt_drain('{ptt_worker}','{live['permitId']}',now()+interval '19 minutes');",False).returncode!=0
        assert sql(f"select erp_comm_cost.claim_ptt_drain('{ptt_worker}','{live['permitId']}',now()+interval '3 minutes');",False).returncode==0
        assert sql(f"select erp_comm_cost.claim_ptt_drain('{ptt_worker}','{live['permitId']}',now()+interval '2 days');",False).returncode!=0
        sql("delete from erp_comm_cost.pause where feature='push';")
        fund_pool("scheduled-notifications","notification_tick","mobile-notifications",2,"push")
        first_tick = str(uuid.uuid4())
        assert sql(f"select erp_comm_cost.debit_control('notification_tick','mobile-notifications','{first_tick}')>clock_timestamp();").stdout.strip()=="t"
        assert sql(f"select erp_comm_cost.debit_control('notification_tick','mobile-notifications','{first_tick}') is null;").stdout.strip()=="t"
        sql("update erp_comm_cost.control_pool set last_poll=now()-interval '1 hour' where kind='notification_tick';")
        assert sql("select erp_comm_cost.debit_control('notification_tick','mobile-notifications',gen_random_uuid())<=clock_timestamp();").stdout.strip()=="t"
        assert sql("select erp_comm_cost.debit_control('notification_tick','mobile-notifications',gen_random_uuid()) is null;").stdout.strip()=="t"
        later_approval=str(uuid.uuid4())
        mutation={"scope":"communications","clientMutationId":later_approval,"currency":"USD",
                  "maxMicros":"10","endsAt":deadline,"features":["chat"]}
        assert operator(OWNER,"approve",mutation).returncode==0
        proof("expired",feature="chat",cost=8,authority=True)
        sql(f"update erp_comm_cost.proof set approval_id='{later_approval}' where operation_id='expired';")
        assert reserve("expired",feature="chat")["ok"]
        early=sql("set role service_role; select reason from public.erp_comm_budget_monitor_events(0,100);").stdout
        assert "budget_early_warning" in early and "approval_ending_soon" in early
        sql(f"update erp_comm_cost.approval set approved_at=now()-interval '2 days', ends_at=now()-interval '1 day' where id='{later_approval}';")
        reason(reserve("expired",feature="chat"),"owner_approval_invalid")
        expired_events=sql("set role service_role; select reason from public.erp_comm_budget_monitor_events(0,100);").stdout
        assert "approval_expired" in expired_events
        print("PostgreSQL 17 budget migration, owner checks, evidence gates, atomic cap race, idempotency, scoped pause, reconciliation and alerts passed.")
    finally:
        for client in clients:
            if client.poll() is None:
                client.stdin.close()
                client.wait(timeout=15)
        docker("rm", "--force", name)


if __name__ == "__main__":
    main()
