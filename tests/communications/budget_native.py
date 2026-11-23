"""Rehearse the exact budget migration in a disposable, network-isolated PostgreSQL 17 container."""
import concurrent.futures
import json
import os
import pathlib
import subprocess
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

    def sql(query, check=True):
        return docker("exec", "-i", name, "psql", "-U", "postgres", "-XqAt", "-v", "ON_ERROR_STOP=1",
                      data=query, check=check)

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
        dims = ["railway", "database"]
        if feature == "ptt_live":
            dims.append("sfu_turn")
        if feature == "push":
            dims.append("fcm")
        sql(f"""insert into erp_comm_cost.proof values ('{op}','communications','{ADMIN}','{feature}',null,
          now()+interval '20 minutes',now()+interval '10 minutes',interval '30 seconds',{retained},'shutdown',0,{funding});""")
        if feature in ("ptt_live","media_upload"):
            endpoint = "close_sfu_tracks" if feature == "ptt_live" else "discard_partial_upload"
            sql(f"insert into erp_comm_cost.cleanup_limit values ('{op}','{endpoint}',1,2);")
        for dim in dims:
            sql(f"""insert into erp_comm_cost.meter values ('{op}','{dim}','proof',true,now(),
             now()+interval '10 minutes',now()+interval '30 minutes',{cost if dim == 'railway' else 0},
             (select id from erp_comm_cost.capacity where dimension='{dim}'),1);""")

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
            from unnest(array['railway','database','sfu_turn','fcm']) d;""")
        assert json.loads(operator(ADMIN,"status",{"scope":"communications"}).stdout)["canApprove"] is False
        reason(reserve("missing"), "owner_binding_unverified")
        assert approve(OWNER).returncode != 0
        for role in ("anon", "authenticated"):
            assert sql(f"set role {role}; select public.erp_comm_budget_command('pause','{{}}');", False).returncode != 0
            assert sql(f"set role {role}; select * from erp_comm_cost.authority;", False).returncode != 0

        sql(f"update erp_comm_cost.authority set owner_auth_id='{OWNER}',owner_binding_evidence='verified enrollment';")
        reason(reserve("no-proof"), "billing_evidence_unavailable")
        assert approve(ADMIN).returncode != 0
        assert approve(OWNER, age=3600).returncode != 0
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
        proof("unfunded", 1)
        reason(reserve("unfunded"), "owner_approval_required")
        proof("hold", retention=False, feature="chat")
        reason(reserve("hold", feature="chat"), "continuing_retention_unproven")
        proof("stale")
        sql("update erp_comm_cost.meter set observed_at=now()-interval '1 hour' where operation_id='stale';")
        reason(reserve("stale"), "meter_stale_or_incomplete")
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
        assert take(wire).returncode == 0
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
        assert sql(origin+admission+"4,8); commit;",False).returncode == 0
        assert sql(admission+"1,1);",False).returncode != 0
        proof("model",feature="push")
        sql("insert into erp_comm_cost.standing_envelope values('communications','push','model',true);"
            "update erp_comm_cost.capacity set available_units=2 where dimension='fcm';")
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda op:reserve(op,feature="push"),["unit-a","unit-b"]))
        assert sum(r["ok"] for r in results)==1, results
        reason(next(r for r in results if not r["ok"]),"provider_capacity_exhausted")
        pauseResult=operator(ADMIN,"pause",{"scope":"communications","feature":"push","reason":"maintenance","clientMutationId":str(uuid.uuid4())})
        assert pauseResult.returncode==0, pauseResult.stderr
        reason(reserve("future",feature="push"),"feature_paused")
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
        docker("rm", "--force", name)


if __name__ == "__main__":
    main()
