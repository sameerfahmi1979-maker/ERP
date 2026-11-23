"""SOS transitions on an isolated localhost PostgreSQL instance, without a dispatch worker."""
import concurrent.futures
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import uuid
from chat_native import ROOT, pg


def uid():
    return str(uuid.uuid4())


def run():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    workspace = ROOT / "tmp"
    workspace.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="sos-native-", dir=workspace) as tmp:
        base = Path(tmp)
        cluster = base / "db"
        password = secrets.token_urlsafe(32)
        secret = base / "initpw"
        secret.write_text(password)
        pg("initdb", "-D", cluster, "-U", "postgres", "-A", "scram-sha-256", "--pwfile", secret,
           "-E", "UTF8", "--no-locale")
        secret.unlink()
        pg("pg_ctl", "-D", cluster, "-l", base / "pg.log", "-o", f"-h 127.0.0.1 -p {port}", "-w", "start")

        def sql(text):
            return pg("psql", "-X", "-qAt", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-v",
                      "ON_ERROR_STOP=1", input=text, env={**os.environ, "PGPASSWORD": password}).strip()

        try:
            exercise(sql)
        finally:
            pg("pg_ctl", "-D", cluster, "-m", "fast", "-w", "stop")


def exercise(sql):
    sql((ROOT / "tests/communications/chat_fixture.sql").read_text())
    migrations = ROOT / "supabase/migrations"
    for pattern in ("*_erp_communications_chat_v1.sql", "*_erp_communication_budget_v1.sql", "*_erp_ptt_control_v1.sql"):
        sql(next(migrations.glob(pattern)).read_text(encoding="utf-8-sig"))
    # Use the sibling's real inbox, push-job tables and both real enqueue overloads.
    notifications = next(migrations.glob("*_erp_communications_notifications_v1.sql")).read_text(encoding="utf-8-sig")
    sql(notifications.split("create function erp_private.notification_source(")[0] + "commit;")
    sql(next(migrations.glob("*_erp_ptt_sos_v1.sql")).read_text(encoding="utf-8-sig"))
    sql("""insert into erp_private.comms_policy_versions values('fixture',true);
        insert into erp_private.comms_policy_acceptances(profile_id,version) select id,'fixture' from public.user_profiles;
        update erp_comm_cost.authority set owner_auth_id=lpad('1',32,'0')::uuid,owner_binding_evidence='synthetic only';""")

    def call(actor, op, args, permit=None):
        data = {"op": "sos." + op, "args": args}
        if permit:
            data["_budgetPermitId"] = permit
        return json.loads(sql(f"set role authenticated;set test.actor='{actor}';select public.erp_sos_v1('{json.dumps(data)}');"))

    def ticket(actor, op, args, max_recipients=20, max_devices=30):
        data = json.dumps({"op": "sos." + op, "args": args})
        permit = sql(f"select public.fixture_chat_permit({actor},'sos','{data}')")
        sql(f"""update erp_comm_cost.proof set retained_at_zero_cost_evidence='isolated fixture' where operation_id='{permit}';
            insert into erp_comm_cost.sos_limit values('{permit}',{max_recipients},{max_devices},'fixture bounds','fixture only')""")
        return permit

    def denied(fn):
        try:
            fn()
        except subprocess.CalledProcessError:
            return
        raise AssertionError("Expected denial")

    channel = uid()
    sql(f"""insert into erp_private.ptt_channels(id,name,kind,creator,owner_id,required) values('{channel}','Crew','group',2,2,true);
        insert into erp_private.ptt_memberships(channel_id,profile_id) select '{channel}',p from unnest(array[2,3,5,6]) p;
        insert into erp_private.comms_blocks values(3,2,now());""")
    epochs = {p: uid() for p in (2,3,5,6,7)}
    for p, epoch in epochs.items():
        availability = {3:"busy",5:"offDuty"}.get(p,"available")
        sql(f"""insert into erp_private.ptt_phones(profile_id,device_id,auth_session,epoch,availability,stopped,paused)
            values({p},gen_random_uuid(),lpad('{p}',32,'0')::uuid,'{epoch}','{availability}',false,false);
            insert into erp_private.notification_devices(installation,profile_id,session_id,token)
            select device_id,{p},lpad('{p}',32,'0')::uuid,'{uid()}' from erp_private.ptt_phones where profile_id={p};""")
    incident = uid()
    base = dict(channelId=channel,incidentId=incident,epoch=epochs[2])
    fix = dict(latitude=24.45,longitude=54.37,accuracyM=125,capturedAt=sql("select to_json(clock_timestamp())#>>'{}'"))
    send = {**base,"location":fix}
    denied(lambda:call(2,"send",send))
    denied(lambda:call(2,"history",dict(channelId=channel,mode="participant")))
    denied(lambda:sql("set role anon;select public.erp_sos_v1('{}')"))
    denied(lambda:sql("set role authenticated;select * from erp_private.ptt_sos_events"))
    denied(lambda:call(2,"send",{**send,"epoch":uid()},ticket(2,"send",send)))
    denied(lambda:call(2,"send",{**send,"location":dict(fix,latitude=12)},ticket(2,"send",send)))
    denied(lambda:call(2,"send",send,ticket(2,"send",send,max_recipients=2)))
    denied(lambda:call(2,"send",send,ticket(2,"send",send,max_devices=2)))
    denied(lambda:call(7,"send",{**send,"epoch":epochs[7]},ticket(7,"send",{**send,"epoch":epochs[7]})))
    sql("delete from erp_private.comms_policy_acceptances where profile_id=2")
    denied(lambda:call(2,"send",send,ticket(2,"send",send)))
    sql("insert into erp_private.comms_policy_acceptances values(2,'fixture',now())")
    assert sql("select count(*) from erp_private.ptt_sos_events") == "0"
    request = {"op":"sos.send","args":send,"_lookupOnly":True}
    def lookup():
        return json.loads(sql(f"set role authenticated; set test.actor='2';select public.erp_sos_v1('{json.dumps(request)}');"))
    assert lookup()["state"]=="unknown"
    assert sql("select count(*) from erp_private.ptt_sos_events")=="0"
    permit=ticket(2,"send",send)
    with concurrent.futures.ThreadPoolExecutor() as pool:
        assert all(r["state"]=="recorded" for r in pool.map(lambda _: call(2,"send",send,permit),range(2)))
    assert lookup()["state"]=="recorded"
    assert call(2,"status",base)["state"]=="recorded"
    assert call(3,"status",{**base,"epoch":epochs[3]})["state"]=="unknown"
    assert sql("select count(*) from erp_private.ptt_sos_events")=="1"
    assert sql("select count(*) from erp_private.ptt_leases")=="0"
    assert sql("select count(*) from erp_private.ptt_admissions")=="0"
    assert sql("select count(*) from erp_private.ptt_endpoints")=="0"
    def push_recipients():
        return sql("select string_agg(i.profile_id::text,',' order by i.profile_id) from erp_private.notification_inbox i join erp_private.notification_push_jobs j on j.event=i.id")
    assert push_recipients()=="3,6"
    def eligible(p,source=incident):
        return json.loads(sql(f"select erp_private.notification_sos_target('{source}',{p})"))
    assert eligible(3)["pushEligible"] and not eligible(5)["pushEligible"] and "location" not in eligible(3)
    sql("update erp_private.ptt_phones set availability='offDuty' where profile_id=3;update erp_private.ptt_phones set availability='available' where profile_id=5")
    assert not eligible(3)["pushEligible"] and not eligible(5)["pushEligible"]
    denied(lambda:call(3,"cancel",{**base,"epoch":epochs[3]}))
    denied(lambda:call(2,"cancel",{**base,"location":fix}))
    sql(f"update erp_private.ptt_channels set archived=true where id='{channel}'")
    denied(lambda:call(2,"cancel",base))
    sql(f"update erp_private.ptt_channels set archived=false where id='{channel}'")
    # A second registration can never duplicate the single funded cancellation phone.
    sql(f"insert into erp_private.notification_devices(installation,profile_id,session_id,token) values(gen_random_uuid(),5,lpad('5',32,'0')::uuid,'{uid()}')")
    # Confirmed phone takeover can reuse the one prepaid slot, but the old phone loses authority.
    replacement=uid()
    replacement_device=uid()
    sql(f"""update erp_private.ptt_phones set device_id='{replacement}',epoch=gen_random_uuid() where profile_id=5;
        insert into erp_private.notification_devices(id,installation,profile_id,session_id,token)
        values('{replacement_device}','{replacement}',5,lpad('5',32,'0')::uuid,'{uid()}');""")
    sql("insert into erp_comm_cost.pause(scope,feature,reason) values('communications','sos','fixture')")
    with concurrent.futures.ThreadPoolExecutor() as pool:
        assert all(r["state"]=="cancelled" for r in pool.map(lambda _:call(2,"cancel",base),range(2)))
    assert call(2,"status",base)["state"]=="cancelled"
    assert push_recipients()=="3,5,6,6"
    assert sql(f"select count(*) from erp_private.notification_push_jobs where device='{replacement_device}'")=="1"
    sql("delete from erp_comm_cost.pause")
    def history(p,mode="participant",**fields):
        args=dict(channelId=channel,mode=mode,**fields)
        return call(p,"history",args,ticket(p,"history",args))["items"]
    rows=history(5)
    assert [r["action"] for r in rows]==["cancelled","original"]
    assert rows[1]["location"]==fix and rows[0]["location"] is None
    assert len(history(5,eventId=rows[0]["id"]))==1
    assert len(history(1,"review"))==2
    denied(lambda:history(4,"review"))
    denied(lambda:history(4))
    sql("insert into erp_private.chat_named_grants(profile_id,kind,enabled,granted_by) values(6,'historyReview',true,1)")
    denied(lambda:history(6,"review"))
    sql(f"update erp_private.ptt_memberships set left_at=now() where channel_id='{channel}' and profile_id=5")
    denied(lambda:history(5))
    sql(f"insert into erp_private.ptt_memberships(channel_id,profile_id) values('{channel}',5)")
    assert history(5)==[]
    assert sql(f"select erp_private.notification_sos_target('{incident}',5) is null")=="t"
    for value in (None,dict(fix,capturedAt="2000-01-01T00:00:00Z")):
        args={**base,"incidentId":uid()}
        if value: args["location"]=value
        assert call(2,"send",args,ticket(2,"send",args))["state"]=="recorded"
        assert history(2,eventId=args["incidentId"])[0]["location"] is None
    sql(f"update erp_private.ptt_phones set epoch=gen_random_uuid() where profile_id=2")
    denied(lambda:call(2,"status",base))
    print("PASS native SOS sender/role/phone/terms, finite cancellation, concurrent idempotency, membership/history/recipient availability, one-use permit, optional location and zero floor/media writes.")


if __name__ == "__main__":
    try:
        run()
    except subprocess.CalledProcessError as err:
        print(err.stderr)
        raise
