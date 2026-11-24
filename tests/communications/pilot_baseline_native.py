"""Real PostgreSQL pilot baseline gates; disposable cached image, no network or live SQL.

Removing baseline validation must allow a forged marker and make the first test fail.
Run --core-only before authoring the policy migration to demonstrate that regression.
"""
import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
CORE = ROOT / "supabase/migrations/20261123095158_erp_communication_budget_v1.sql"
MIGRATION = ROOT / "supabase/migrations/20261124085000_erp_comm_pilot_baseline_retention.sql"
OWNER = "10000000-0000-0000-0000-000000000001"
ADMIN = "10000000-0000-0000-0000-000000000002"
APPROVAL = "20000000-0000-0000-0000-000000000001"
SESSION = "30000000-0000-0000-0000-000000000001"
ALLOCATION = "40000000-0000-0000-0000-000000000001"
IMAGE = os.environ.get("BUDGET_TEST_PG_IMAGE", "051f7b7b3abd")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--core-only", action="store_true")
    args = parser.parse_args()
    name = "erp-pilot-baseline-" + uuid.uuid4().hex[:12]
    checks = []
    database = "postgres"

    def docker(*arguments, data=None, check=True):
        result = subprocess.run(["docker", *arguments], input=data, text=True, capture_output=True)
        if check and result.returncode:
            raise RuntimeError(result.stderr or result.stdout)
        return result

    def sql(query, check=True):
        result = docker("exec", "-i", name, "psql", "-h", "127.0.0.1", "-U", "postgres", "-d", database, "-XqAt", "-v", "ON_ERROR_STOP=1",
                        data=query, check=False)
        if check and result.returncode:
            raise RuntimeError(result.stderr or result.stdout)
        return result

    def reject(label, query, error=None):
        result = sql("begin;\n" + query + "\ncommit;", check=False)
        assert result.returncode != 0, f"{label}: database accepted forbidden action"
        if error:
            assert error in result.stderr, (label, result.stderr)
        checks.append(label)

    def decision(actor=OWNER, op="approve", approval=APPROVAL, amount="5000000", deadline=None, age=0):
        values = {"scope": "communications", "clientMutationId": approval, "currency": "USD",
                  "maxMicros": amount, "endsAt": deadline,
                  "features": ["chat", "realtime", "media_upload", "media_download", "export", "push", "ptt_live", "ptt_replay", "sos"]}
        if op == "revoke":
            values = {"scope": "communications", "clientMutationId": str(uuid.uuid4()), "approvalId": approval}
        return (f"set role authenticated; set test.actor='{actor}'; set test.age='{age}'; "
                f"select public.erp_comm_budget_operator('{1 if actor == OWNER else 2}','{SESSION}',"
                f"'budget.{op}','{json.dumps(values)}');")

    def proof(op, marker=None, approval=APPROVAL, quota=1000000):
        retained = marker or "existing-plan:" + ALLOCATION
        funding = "null" if approval is None else "'" + approval + "'"
        return f"""insert into erp_comm_cost.proof values('{op}','communications','2','chat',null,
          now()+interval '5 minutes',now()+interval '4 minutes',interval '5 minutes',
          '{retained}','bounded shutdown',0,{funding});
          insert into erp_comm_cost.meter select '{op}',dimension,'conservative physical bytes',true,
          now(),now()+interval '4 minutes',now()+interval '10 minutes',0,id,{quota}
          from erp_comm_cost.capacity where unit in ('physical_database_bytes','physical_storage_bytes');
          insert into erp_comm_cost.meter select '{op}',dimension,'bounded operating/ledger units',true,
          now(),now()+interval '4 minutes',now()+interval '10 minutes',0,id,
          case when unit='permanent_ledger_bytes' then 1000000 else 1 end
          from erp_comm_cost.capacity where unit in ('units','permanent_ledger_bytes');"""

    def command(op, feature="chat", wire=None):
        data = {"feature": feature, "actorId": "2", "operationId": op, "scope": "communications",
                "upperBoundMicros": "0", "liabilityEndsAt": None}
        if wire is not None:
            data["binding"] = {"actorSessionId": SESSION, "command": wire}
        return json.loads(sql("set role service_role; select public.erp_comm_budget_command('reserve',"
                              f"'{json.dumps(data)}');").stdout)

    def covered(op):
        return sql(f"select erp_comm_cost.retention_covered(p) from erp_comm_cost.proof p where operation_id='{op}';").stdout.strip()

    docker("run", "--pull=never", "--network", "none", "--name", name, "--detach", "--tmpfs",
           "/var/lib/postgresql/data", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", IMAGE)
    try:
        for _ in range(60):
            result = sql("select current_setting('server_version');", check=False)
            if result.returncode == 0:
                assert result.stdout.startswith("17.11"), result.stdout
                break
            time.sleep(.25)
        else:
            raise RuntimeError("Disposable PostgreSQL did not start")
        sql(f"""create role anon; create role authenticated; create role service_role bypassrls;
          create schema auth; create schema erp_private; create table auth.users(id uuid primary key);
          create table public.user_profiles(id bigint generated always as identity,auth_user_id uuid,status text,must_change_password boolean);
          insert into auth.users values('{OWNER}'),('{ADMIN}');
          insert into public.user_profiles(auth_user_id,status,must_change_password) select id,'active',false from auth.users;
          create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
          create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id','{SESSION}',
            'amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',floor(extract(epoch from now())-
            coalesce(nullif(current_setting('test.age',true),''),'0')::integer))))$$;
          create function public.f03_current_session_valid() returns boolean language sql as $$select true$$;
          create function erp_private.business_principal_is_active() returns boolean language sql as $$select true$$;
          create function erp_private.provider_actor_session_valid(bigint,uuid) returns boolean language sql as $$select $1=2 and $2='{SESSION}'::uuid$$;""")
        sql(CORE.read_text(encoding="utf-8-sig"))
        deadline = "2026-11-30T19:59:00Z"
        if not args.core_only:
            sql(f"update erp_comm_cost.authority set owner_auth_id='{OWNER}',owner_binding_evidence='synthetic native owner enrollment';")
            sql(decision(deadline=deadline))
            sql(MIGRATION.read_text(encoding="utf-8-sig"))
        # This is a real legacy vulnerability reproduction: no allocation/approval/capacity exists.
        reject("forged existing-plan marker", proof("forged", approval=None, quota=1), "baseline")
        if args.core_only:
            return

        assert sql("select count(*) from erp_comm_cost.baseline_approval_receipt;").stdout.strip() == "0"
        reject("wrong owner cannot approve", decision(actor=ADMIN, deadline=deadline))
        reject("stale owner cannot approve", decision(deadline=deadline, age=3600))
        sql(decision(deadline=deadline))
        assert sql("select count(*) from erp_comm_cost.baseline_approval_receipt;").stdout.strip() == "1"
        checks.append("fresh owner reconfirms pre-migration approval without new amount")
        sql("""insert into erp_comm_cost.capacity(billing_account,dimension,unit,valid_from,valid_until,available_units,enabled)
          select 'synthetic-existing-plan',dimension,unit,now()-interval '1 hour',now()+interval '1 hour',20000000,true
          from(values('database','physical_database_bytes'),('storage','physical_storage_bytes'),
          ('database','permanent_ledger_bytes'),('database','units'),('railway','units'),('fcm','units')) q(dimension,unit);
          insert into erp_comm_cost.baseline_capacity_evidence(capacity_id,plan_reference,evidence_id,observed_at,valid_until,
            max_measurement_age,physical_limit_bytes,observed_total_bytes,observed_communications_bytes,
            reserved_other_bytes,safety_headroom_bytes,allocated_bytes,enabled)
          select id,'synthetic paid-plan receipt','synthetic measurement/'||dimension,now(),now()+interval '30 minutes',
            interval '5 minutes',100000000,10000000,0,10000000,10000000,20000000,true
          from erp_comm_cost.capacity where unit like 'physical_%';""")
        allocation_sql = f"""insert into erp_comm_cost.baseline_allocation(id,approval_id,database_capacity_id,storage_capacity_id,
          database_quota_bytes,storage_quota_bytes,valid_from,valid_until,policy_evidence,enabled)
          select '{ALLOCATION}','{APPROVAL}',d.id,s.id,10000000,10000000,now()-interval '1 second',
            now()+interval '20 minutes','synthetic exact owner-approved policy receipt',true
          from erp_comm_cost.capacity d cross join erp_comm_cost.capacity s
          where d.unit='physical_database_bytes' and s.unit='physical_storage_bytes';"""
        # A financial row inserted by privileged fixture SQL cannot establish authenticated provenance.
        fake = str(uuid.uuid4())
        sql(f"insert into erp_comm_cost.approval select '{fake}',owner_auth_id,scope,features,currency,max_micros,approved_at,step_up_at,ends_at,null,0,null,0,null from erp_comm_cost.approval where id='{APPROVAL}';")
        reject("fabricated approval lacks owner receipt", allocation_sql.replace(APPROVAL, fake), "baseline")
        reject("expired allocation", allocation_sql.replace("now()+interval '20 minutes'", "now()-interval '1 microsecond'"), "baseline")
        reject("allocation cannot exceed pilot expiry", allocation_sql.replace("now()+interval '20 minutes'", "'2026-11-30T20:00:00Z'::timestamptz"), "baseline")
        sql(f"update erp_comm_cost.approval set max_micros=5000001 where id='{APPROVAL}';")
        reject("baseline cannot exceed USD5", allocation_sql, "baseline")
        sql(f"update erp_comm_cost.approval set max_micros=5000000 where id='{APPROVAL}';")
        sql(allocation_sql)
        reject("allocation cannot expand", "update erp_comm_cost.baseline_allocation set database_quota_bytes=11000000;", "Immutable")
        reject("over physical capacity", "update erp_comm_cost.baseline_capacity_evidence set physical_limit_bytes=20000000;", "baseline")
        reject("no perpetual validity", "update erp_comm_cost.baseline_capacity_evidence set valid_until='infinity';")
        for role in ("anon", "authenticated", "service_role"):
            for table in ("baseline_allocation", "baseline_capacity_evidence", "baseline_approval_receipt", "baseline_prepaid_hold", "approval", "proof"):
                reject(f"{role} cannot write {table}", f"set role {role}; delete from erp_comm_cost.{table};", "permission denied")
            reject(f"{role} cannot enroll baseline", f"set role {role}; select erp_comm_cost.retention_covered(p) from erp_comm_cost.proof p;", "permission denied")
            reject(f"{role} cannot fabricate owner receipt", f"set role {role}; select erp_comm_cost.record_baseline_owner_approval('{APPROVAL}');", "permission denied")
            reject(f"{role} cannot extend prepaid tail", f"set role {role}; select erp_comm_cost.enroll_baseline_prepaid_pool(gen_random_uuid(),now()+interval '1 hour');", "permission denied")

        reject("unbound proof approval", proof("unbound", approval=None), "baseline")
        reject("wrong proof approval", proof("wrong-approval", approval=fake), "baseline")
        sql(f"update erp_comm_cost.approval set revoked_at=now() where id='{fake}';")
        reject("malformed marker cannot become legacy evidence", proof("malformed", marker="existing-plan:garbage"), "baseline")
        reject("case/space marker cannot become legacy evidence", proof("disguised", marker=" Existing-Plan:" + ALLOCATION), "baseline")
        reject("unmetered physical retention", proof("unmetered").replace("where unit in ('physical_database_bytes','physical_storage_bytes')", "where false"), "baseline")
        reject("proof exceeds baseline quota", proof("too-large", quota=11000000), "baseline")
        sql("begin;" + proof("valid") + "commit;")
        assert covered("valid") == "t"
        checks.append("valid measured baseline proof")
        # Legacy independently evidenced zero-extra-cost behavior remains available without allocation.
        sql("begin;" + proof("legacy", marker="documented legacy zero-cost retained storage", approval=None) + "commit;")
        assert covered("legacy") == "t"
        checks.append("legacy zero-cost behavior")

        # Provision the unchanged, bound owner-alert path using legacy evidence.
        sql("begin;" + proof("owner-alert", marker="legacy funded owner alerts", approval=None) + """
          update erp_comm_cost.proof set feature='push' where operation_id='owner-alert';
          insert into erp_comm_cost.capacity(billing_account,dimension,unit,valid_from,valid_until,available_units,enabled)
          values('synthetic-existing-plan','railway','funded_budget_alert_actions',now()-interval '1 hour',now()+interval '1 hour',100,true);
          insert into erp_comm_cost.meter select 'owner-alert','railway','funded notice bound',true,now(),now()+interval '4 minutes',
            now()+interval '10 minutes',0,id,10 from erp_comm_cost.capacity where unit='funded_budget_alert_actions';
          commit;""")
        end_epoch = int(sql("select extract(epoch from now()+interval '9 minutes')::bigint;").stdout.strip())
        wire = {"op": "budget.fundControl", "kind": "budget_alert", "subject": "1", "maxActions": 10, "endEpoch": end_epoch}
        alert = command("owner-alert", feature="push", wire=wire)
        assert alert["ok"], alert
        sql(f"insert into erp_comm_cost.control_pool(permit_id,kind,subject,max_actions,valid_until,continuing_zero_evidence,enabled) "
            f"values('{alert['permitId']}','budget_alert','1',10,to_timestamp({end_epoch}),'legacy notice coverage',true);")
        sql("begin;" + proof("baseline-control") + """update erp_comm_cost.proof set feature='push' where operation_id='baseline-control';
          insert into erp_comm_cost.meter select 'baseline-control','railway','funded baseline notice bound',true,now(),
          now()+interval '4 minutes',now()+interval '10 minutes',0,id,10 from erp_comm_cost.capacity where unit='funded_budget_alert_actions';commit;""")
        control_wire = {"op": "budget.fundControl", "kind": "budget_alert", "subject": "2", "maxActions": 10, "endEpoch": end_epoch}
        baseline_control = command("baseline-control", feature="push", wire=control_wire)
        assert baseline_control["ok"], baseline_control
        sql(f"insert into erp_comm_cost.control_pool(permit_id,kind,subject,max_actions,valid_until,continuing_zero_evidence,enabled) "
            f"values('{baseline_control['permitId']}','budget_alert','2',10,to_timestamp({end_epoch}),'baseline notice coverage',true);")
        bound_wire = {"op": "chat.test", "args": {}}
        valid = command("valid", wire=bound_wire)
        assert valid["ok"], valid
        permit = valid["permitId"]
        reject("prepaid tail cannot exceed original allocation", f"select erp_comm_cost.enroll_baseline_prepaid_pool('{permit}',now()+interval '1 hour');", "baseline_prepaid_tail_unfunded")
        reject("prepaid control pool cannot refill or extend", f"select erp_comm_cost.enroll_baseline_prepaid_pool('{baseline_control['permitId']}',now()+interval '10 minutes');", "baseline_prepaid_tail_unfunded")
        sql(f"insert into erp_comm_cost.alert_recipient values('{ADMIN}');")
        budget_source = str(uuid.uuid4())
        budget_device, budget_job, budget_attempt = [str(uuid.uuid4()) for _ in range(3)]
        sql(f"insert into erp_comm_cost.alert(source_uuid,event_key,recipient_auth_id,reason,scope) "
            f"values('{budget_source}','synthetic-baseline-notice','{ADMIN}','synthetic','communications');")
        notice_args = f"'budget','{budget_source}',2,'{budget_device}','{budget_job}','{budget_attempt}'"
        assert sql(f"select erp_comm_cost.take_notice_attempt({notice_args});").stdout.strip() == "t"
        assert sql(f"select erp_comm_cost.notice_attempt_valid({notice_args});").stdout.strip() == "t"
        sql("begin;" + proof("baseline-sos", quota=2000000).replace("then 1000000 else 1", "then 2000000 else 1") + """update erp_comm_cost.proof set feature='sos' where operation_id='baseline-sos';
          insert into erp_comm_cost.sos_limit values('baseline-sos',1,1,'funded cancellation','baseline retained coverage',10,8,64);
          insert into erp_comm_cost.capacity(billing_account,dimension,unit,valid_from,valid_until,available_units,enabled)
          values('synthetic-existing-plan','database','sos_discovery_target_checks',now()-interval '1 hour',now()+interval '1 hour',2000,true);
          insert into erp_comm_cost.meter select 'baseline-sos','database','bounded discovery',true,now(),now()+interval '4 minutes',
            now()+interval '10 minutes',0,id,1024 from erp_comm_cost.capacity where unit='sos_discovery_target_checks';commit;""")
        sos_wire = {"op": "sos.send", "args": {}}
        sos_reservation = command("baseline-sos", feature="sos", wire=sos_wire)
        assert sos_reservation["ok"], sos_reservation
        sos_permit = sos_reservation["permitId"]
        sos_source, sos_device, sos_job, sos_attempt = [str(uuid.uuid4()) for _ in range(4)]
        sql(f"begin; select erp_comm_cost.take_service_permit('{sos_permit}','sos','communications','2','{SESSION}','{json.dumps(sos_wire)}');"
            f"select erp_comm_cost.require_sos_envelope('{sos_permit}',1,1);"
            f"select erp_comm_cost.bind_sos_notice('{sos_permit}','{sos_source}','original',2);commit;")
        sql("create function erp_private.notification_sos_target(uuid,bigint) returns jsonb language sql as $$select '{\"pushEligible\":true}'::jsonb$$;")
        sos_args = f"'sos','{sos_source}',2,'{sos_device}','{sos_job}','{sos_attempt}'"
        assert sql(f"select erp_comm_cost.take_notice_attempt({sos_args});").stdout.strip() == "t"
        assert sql(f"select erp_comm_cost.notice_attempt_valid({sos_args});").stdout.strip() == "t"

        def invalidated(label, change, restore):
            sql(change)
            assert covered("valid") == "f", label
            assert covered("legacy") == "t", label + " changed legacy behavior"
            assert command("valid", wire=bound_wire)["ok"] is False, label + " reserve bypass"
            assert sql("begin; select erp_comm_cost.debit_control('budget_alert','2',gen_random_uuid(),'push') is not null;rollback;").stdout.strip() == "t", label + " stranded prepaid owner alert"
            assert sql(f"select erp_comm_cost.notice_attempt_valid({notice_args});").stdout.strip() == "t", label + " stranded prepaid notification"
            assert sql(f"select erp_comm_cost.notice_attempt_valid({sos_args});").stdout.strip() == "t", label + " stranded prepaid SOS"
            retry = f"'sos','{sos_source}',2,'{sos_device}','{sos_job}','{uuid.uuid4()}'"
            assert sql(f"begin; select erp_comm_cost.take_notice_attempt({retry});rollback;").stdout.strip() == "t", label + " stranded prepaid SOS retry"
            assert sql(f"begin; select erp_comm_cost.take_control_read('sos','{sos_source}',2,'{SESSION}',gen_random_uuid());rollback;").stdout.strip() == "t", label + " stranded prepaid SOS read"
            sql(f"begin; select erp_comm_cost.bind_sos_notice('{sos_permit}',gen_random_uuid(),'cancelled',2);rollback;")
            reject(label + " permit consumption", f"select erp_comm_cost.take_service_permit('{permit}','chat','communications','2','{SESSION}','{json.dumps(bound_wire)}');", "budget_permit_unavailable")
            reject(label + " clone insert", proof("invalid-clone"), "baseline")
            sql(restore)
            assert covered("valid") == "t", label + " did not restore"
            checks.append(label)

        invalidated("stale measurement", "update erp_comm_cost.baseline_capacity_evidence set observed_at=now()-interval '6 minutes';",
                    "update erp_comm_cost.baseline_capacity_evidence set observed_at=now();")
        invalidated("capacity disabled", "update erp_comm_cost.capacity set enabled=false where unit='physical_storage_bytes';",
                    "update erp_comm_cost.capacity set enabled=true where unit='physical_storage_bytes';")
        invalidated("capacity reduced below holds", "update erp_comm_cost.capacity set available_units=1 where unit='physical_storage_bytes';",
                    "update erp_comm_cost.capacity set available_units=20000000 where unit='physical_storage_bytes';")
        invalidated("approval revoked", f"update erp_comm_cost.approval set revoked_at=now() where id='{APPROVAL}';",
                    f"update erp_comm_cost.approval set revoked_at=null where id='{APPROVAL}';")
        original_end = sql(f"select ends_at from erp_comm_cost.approval where id='{APPROVAL}';").stdout.strip()
        invalidated("approval expired", f"update erp_comm_cost.approval set ends_at=now()-interval '1 second',approved_at=now()-interval '1 hour' where id='{APPROVAL}';",
                    f"update erp_comm_cost.approval set ends_at='{original_end}',approved_at=(select approved_at from erp_comm_cost.baseline_approval_receipt where approval_id='{APPROVAL}') where id='{APPROVAL}';")
        invalidated("owner binding changed", f"update erp_comm_cost.authority set owner_auth_id='{ADMIN}';",
                    f"update erp_comm_cost.authority set owner_auth_id='{OWNER}';")

        # Standing envelope clones must receive exact current checks and permanent byte holds.
        sql("begin;" + proof("template", quota=5000000) + "update erp_comm_cost.proof set actor_id='standing' where operation_id='template';"
            "insert into erp_comm_cost.standing_envelope values('communications','chat','template',true);commit;")
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda op: command(op, wire=bound_wire), ("clone-one", "clone-two")))
        assert sum(bool(x["ok"]) for x in results) == 1, results
        assert sql("select count(*) from erp_comm_cost.unit_hold h join erp_comm_cost.capacity c on c.id=h.capacity_id "
                   "where c.unit like 'physical_%' and h.units=5000000;").stdout.strip() == "2"
        checks.append("atomic conservative quota for standing clones")
        sql(f"select erp_comm_cost.take_service_permit('{permit}','chat','communications','2','{SESSION}','{json.dumps(bound_wire)}');")
        reject("one-use command remains enforced", f"select erp_comm_cost.take_service_permit('{permit}','chat','communications','2','{SESSION}','{json.dumps(bound_wire)}');", "budget_permit_unavailable")
        held = sql(f"select sum(units) from erp_comm_cost.unit_hold where permit_id='{permit}';").stdout.strip()
        sql(f"insert into erp_comm_cost.final_evidence values('synthetic-settlement','{permit}',0,clock_timestamp());")
        settlement = {"feature": "chat", "scope": "communications", "operationId": "valid", "permitId": permit,
                      "evidenceId": "synthetic-settlement", "actualMicros": "0"}
        assert json.loads(sql("set role service_role; select public.erp_comm_budget_command('settle',"
                              f"'{json.dumps(settlement)}');").stdout)["ok"]
        assert sql(f"select sum(units) from erp_comm_cost.unit_hold where permit_id='{permit}';").stdout.strip() == held
        assert command("after-settlement", wire=bound_wire)["ok"] is False
        checks.append("settlement preserves physical quota holds")
        sql(f"update erp_comm_cost.baseline_allocation set enabled=false where id='{ALLOCATION}';")
        assert covered("valid") == "f"
        reject("disabled allocation rejects new proof", proof("disabled"), "baseline")
        reject("disabled allocation cannot auto-renew", f"update erp_comm_cost.baseline_allocation set enabled=true where id='{ALLOCATION}';", "Immutable")
        assert sql("select count(*) from erp_comm_cost.proof where operation_id in ('valid','legacy');").stdout.strip() == "2"
        checks.append("revocation preserves retained history/evidence")
        sql(decision(op="revoke"))
        replacement_approval = str(uuid.uuid4())
        reject("revocation cannot reset USD5 total with new approval UUID",
               decision(approval=replacement_approval, deadline=deadline), "cannot reset USD 5")
        assert sql(f"select count(*) from erp_comm_cost.approval where id='{replacement_approval}';").stdout.strip() == "0"
        assert sql("select count(*) from erp_comm_cost.baseline_approval_receipt;").stdout.strip() == "1"
        checks.append("failed replacement rolls back financial row and preserves original holds")
        # A pre-migration tagged approval can have no new provenance receipt. Its
        # original total still cannot be reset by a new authenticated grant.
        prior = str(uuid.uuid4())
        sql(f"update erp_comm_cost.authority set owner_auth_id='{ADMIN}';"
            f"insert into erp_comm_cost.approval select '{prior}','{ADMIN}',scope,features,currency,max_micros,approved_at,"
            f"step_up_at,ends_at,clock_timestamp(),0,null,0,null from erp_comm_cost.approval where id='{APPROVAL}';")
        no_receipt_replacement = str(uuid.uuid4())
        reject("pre-migration tagged grant cannot reset without a receipt",
               decision(actor=ADMIN, approval=no_receipt_replacement, deadline=deadline), "cannot reset USD 5")
        # Rehearse against the actual optional feature schemas, including recording's
        # tenth retention predicate, instead of assuming it has the core-only shape.
        sql("create database feature_fixture;")
        database = "feature_fixture"
        fixture = (ROOT / "tests/communications/chat_fixture.sql").read_text(encoding="utf-8-sig")
        for statement in ("CREATE ROLE authenticated;", "CREATE ROLE anon;", "CREATE ROLE service_role BYPASSRLS;"):
            fixture = fixture.replace(statement, "")  # Roles are cluster-wide and already exist.
        sql(fixture)
        sql((ROOT / "tests/communications/notifications_fixture.sql").read_text(encoding="utf-8-sig"))
        sql("drop table erp_private.ptt_phones;")
        for suffix in ("erp_communications_chat_v1", "erp_communication_budget_v1", "erp_ptt_control_v1",
                       "erp_ptt_recordings_v1", "erp_communications_notifications_v1", "erp_ptt_sos_v1", "erp_communications_policy_v1"):
            sql(next((ROOT / "supabase/migrations").glob("*_" + suffix + ".sql")).read_text(encoding="utf-8-sig"))
        sql(MIGRATION.read_text(encoding="utf-8-sig"))
        assert sql("select erp_private.ptt_recording_ready(gen_random_uuid(),2,gen_random_uuid());").stdout.strip() == "f"
        checks.append("actual chat/PTT/recording/notification/SOS/policy schemas accept candidate")
        print(json.dumps({"postgres": result.stdout.strip(), "image": IMAGE, "checks": checks,
                          "migrationSha256": hashlib.sha256(MIGRATION.read_bytes()).hexdigest()}, indent=2))
    finally:
        docker("rm", "--force", name)


if __name__ == "__main__":
    main()
