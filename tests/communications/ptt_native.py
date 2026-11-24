"""Exercise private PTT transactions in a fresh disposable localhost PostgreSQL cluster."""
import concurrent.futures
import json
from hashlib import sha256
import os
import pathlib
import secrets
import shutil
import socket
import subprocess
import tempfile
import uuid

from chat_native import ROOT, pg
from ptt_worker_fixture import Worker, WORKER, BOOT

def uid():
    return str(uuid.uuid4())

def run():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    work = ROOT / "tmp"
    work.mkdir(exist_ok=True)
    scratch = pathlib.Path(tempfile.mkdtemp(prefix="ptt-native-",dir=work))
    cluster = scratch / "db"
    secret = secrets.token_urlsafe(32)
    pw = scratch / "pw"
    pw.write_text(secret,encoding="ascii")
    pg("initdb","-D",cluster,"-U","postgres","-A","scram-sha-256","--pwfile",pw,"-E","UTF8","--no-locale")
    pw.unlink()
    pg("pg_ctl","-D",cluster,"-l",scratch/"pg.log","-o",f"-h 127.0.0.1 -p {port}","-w","start")
    def sql(query):
        return pg("psql","-X","-qAt","-h","127.0.0.1","-p",port,"-U","postgres","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose",
                  input=query,env={**os.environ,"PGPASSWORD":secret}).strip()
    worker=Worker(sql)
    funded=False
    def request(actor, op, args, permit=None):
        encoded=json.dumps({"op":"ptt."+op,"args":args}).replace("'","''")
        arg="null" if permit is None else f"'{permit}'::uuid"
        return json.loads(sql(f"set role authenticated;set test.actor='{actor}';select public.erp_ptt_v1('{encoded}',{arg});"))
    def ticket(actor,op,args,feature=None):
        encoded=json.dumps({"op":"ptt."+op,"args":args}).replace("'","''")
        if funded and op=="press": return worker.press_permit(actor,encoded)
        feature=feature or ('ptt_live' if op in ('join','press','status','monitorLive') else 'realtime')
        effect=None
        if op=='monitorLive': effect='ptt_monitor_rows'
        if op in ('members','reopenReview') or (op=='manage' and args.get('action')=='reopen'): effect='ptt_roster_rows'
        if op in ('channelCreate','direct') or (op=='manage' and args.get('action') in ('add','approve')): effect='ptt_scope_facts'
        return worker.effect_permit(actor,feature,encoded,effect)
    def call(actor,op,synthetic_permit=True,**args):
        if funded and op in ("join","press","monitorLive"): worker.heartbeat()
        needs=op not in ('capabilities','state','stop','release','disconnect','signal') and not (op=='pause' and args.get('paused') is True)
        return request(actor,op,args,ticket(actor,op,args) if needs and synthetic_permit else None)
    def error_code(fn):
        try: fn()
        except subprocess.CalledProcessError as err:
            return err.stderr.split("ERROR:")[1].strip().split(":")[0]
        raise AssertionError("Expected SQL denial")
    def denied(fn):
        try: fn()
        except subprocess.CalledProcessError: return
        raise AssertionError("Expected denial")
    try:
        sql((ROOT/"tests/communications/chat_fixture.sql").read_text())
        sql("create table if not exists auth.users(id uuid primary key)")
        applied={}
        for pattern in ("*_erp_communications_chat_v1.sql","*_erp_communication_budget_v1.sql","*_erp_ptt_control_v1.sql"):
            migration=next((ROOT/"supabase/migrations").glob(pattern))
            content=migration.read_bytes()
            sql(content.decode("utf-8-sig"))
            applied[migration.name]=sha256(content).hexdigest()
        sql("insert into erp_private.comms_policy_versions values('fixture',true) on conflict do nothing") if sql("select count(*) from erp_private.comms_policy_versions where is_current")=="0" else None
        sql("insert into erp_private.comms_policy_acceptances(profile_id,version) select p.id,v.version from public.user_profiles p cross join erp_private.comms_policy_versions v where v.is_current on conflict do nothing")
        assert sql("select count(*) from erp_private.ptt_feature_gate where enabled")=="0"
        assert call(2,"state")["stopped"] and not call(2,"capabilities")["canCreatePttChannel"]
        sql("update erp_comm_cost.authority set owner_auth_id=lpad('1',32,'0')::uuid,owner_binding_evidence='fixture'")
        args={"deviceId":uid(),"confirmTakeover":False}
        valid=ticket(2,"start",args)
        assert error_code(lambda:request(2,"start",args,valid))=="PT503" # valid permit alone, DB default off
        sql("update erp_private.ptt_feature_gate set enabled=true")
        assert error_code(lambda:request(3,"start",args,valid))=="PT503"
        assert error_code(lambda:request(2,"start",{**args,"deviceId":uid()},valid))=="PT503"
        approval=uid()
        sql(f"""insert into erp_comm_cost.approval(id,owner_auth_id,scope,features,currency,max_micros,approved_at,step_up_at,ends_at)
        values('{approval}',lpad('1',32,'0')::uuid,'communications',array['realtime']::erp_comm_cost.feature[],'USD',100,now(),now(),now()+interval '1 hour');
        update erp_comm_cost.reservation set approval_id='{approval}' where permit_id='{valid}';
        update erp_comm_cost.approval set revoked_at=now() where id='{approval}';""")
        assert error_code(lambda:request(2,"start",args,valid))=="PT503"
        finite=ticket(2,"start",args)
        sql(f"update erp_comm_cost.reservation set liability_ends_at=now()+interval '2 minutes' where permit_id='{finite}'")
        assert error_code(lambda:request(2,"start",args,finite))=="PT503"
        fresh=ticket(2,"start",args)
        ep=request(2,"start",args,fresh)["epoch"]
        assert error_code(lambda:request(2,"start",args,fresh))=="PT503"
        call(2,"stop",epoch=ep)
        denied(lambda:call(4,"channelCreate",name="A",description="",discoverable=True,clientMutationId=uid()))
        denied(lambda:sql("set role authenticated;select public.erp_ptt_provider_v1('tick','{}')"))
        denied(lambda:call(7,"state"))
        channel=call(1,"channelCreate",name="A",description="Private operations",discoverable=False,required=True,clientMutationId=uid())
        c=channel["id"]
        def manage(action,**args):
            rev=call(1,"members",channelId=c)["revision"]
            return call(1,"manage",channelId=c,action=action,expectedRevision=rev,**args)
        assert not call(2,"channels")["items"]
        manage("invite",profileId="2")
        assert set(call(2,"channels")["items"][0])=={"id","name","description"}
        call(2,"request",channelId=c)
        manage("approve",profileId="2")
        manage("add",profileId="3")
        devices={p:uid() for p in (1,2,3)}
        epochs={p:call(p,"start",deviceId=d,confirmTakeover=False)["epoch"] for p,d in devices.items()}
        def cmd(p,op,**args): return call(p,op,epoch=epochs[p],channelId=c,**args)
        assert sql("select count(*) from erp_private.ptt_admissions")=="0"
        assert call(2,"monitor",epoch=epochs[2],selectedChannelId=c)["items"]==[]
        assert sql("select count(*) from erp_private.ptt_admissions")=="0"
        both=[('channels',{}),('channels',{'mode':'review'}),('creatorStatus',{'profileId':'2'}),
            ('creatorGrant',{'profileId':'2','enabled':True,'expectedRevision':'0'}),
            ('channelCreate',{'name':'X','description':'','discoverable':False,'clientMutationId':uid()}),
            ('direct',{'peerProfileId':'3'}),('start',args),('monitor',{'epoch':epochs[2]}),('monitorLive',{'epoch':epochs[2]}),
            ('availability',{'epoch':epochs[2],'availability':'available'}),('pause',{'epoch':epochs[2],'paused':False}),
            ('members',{'channelId':c}),('request',{'channelId':c}),('manage',{'channelId':c,'action':'archive','expectedRevision':'1'}),
            ('reopenReview',{'channelId':c}),('leave',{'epoch':epochs[2],'channelId':c}),
            ('join',{'epoch':epochs[2],'channelId':c}),('press',{'epoch':epochs[2],'channelId':c,'pressId':uid()}),
            ('status',{'epoch':epochs[2],'channelId':c})]
        sql("update erp_private.ptt_feature_gate set enabled=false")
        for op,fields in both:
            assert error_code(lambda:call(2,op,**fields))=="PT503",(op,fields)
        assert call(2,"state")["epoch"]==epochs[2]
        assert call(2,"capabilities")["profileId"]=="2"
        sql("update erp_private.ptt_feature_gate set enabled=true")
        for op,fields in both:
            assert error_code(lambda:request(2,op,fields))=="PT503",(op,fields)
        assert worker.start()=={"held":True}
        assert worker.tick()=={"held":True}
        assert error_code(lambda:call(2,"monitorLive",epoch=epochs[2]))=="PT503"
        worker.fund()
        assert worker.start()["cadenceSeconds"]==1
        assert worker.start()=={"held":True}
        assert worker.rpc("startWorker", dict(worker=WORKER,boot=uid(),until=sql("select (now()+interval '1 hour')::text"),maxPolls=9000))=={"held":True}
        assert worker.rpc("tick",dict(worker=uid(),boot=BOOT,poll=uid()))=={"held":True}
        initial=worker.tick()
        assert not worker.finish(initial["poll"])["ok"]
        sql(f"select erp_private.ptt_take_recording_poll('{initial['poll']}')")
        assert worker.finish(initial["poll"])["ok"]
        assert not worker.finish(initial["poll"])["ok"]
        # This three-migration suite isolates controls. The full recording suite exercises the actual source writer.
        sql("create or replace function erp_private.ptt_record_open(p_lease uuid,p_episodes bigint[]) returns void language plpgsql as $$begin return;end$$")
        funded=True
        for actor in (2,3):
            assert call(actor,"monitorLive",epoch=epochs[actor])["items"]
        for op,extra in (("join",{}),("press",{"pressId":uid()})):
            fields=dict(epoch=epochs[2],channelId=c,**extra)
            old=ticket(2,op,fields)
            later=uid()
            sql(f"""insert into erp_comm_cost.approval(id,owner_auth_id,scope,features,currency,max_micros,approved_at,step_up_at,ends_at)
            values('{later}',lpad('1',32,'0')::uuid,'communications',array['ptt_live']::erp_comm_cost.feature[],'USD',100,now(),now(),now()+interval '1 hour');
            update erp_comm_cost.reservation set approval_id='{later}' where permit_id='{old}';""")
            sql(f"update erp_comm_cost.approval set revoked_at=now() where id='{later}'")
            assert error_code(lambda:request(2,op,fields,old))=="PT503"
        assert cmd(2,"status")["admission"]=="live"
        assert error_code(lambda:request(2,"signal",dict(epoch=epochs[2],channelId=c,action="open")))=="42501"
        outsider=call(5,"start",deviceId=uid(),confirmTakeover=False)["epoch"]
        for epoch,code in ((uid(),"42501"),(outsider,"PT404")):
            for target in (c,uid()):
                assert error_code(lambda:call(5,"status",epoch=epoch,channelId=target))==code
        stale=uid()
        for op in ("status","disconnect","release"):
            def hidden(cid):
                fields=dict(epoch=stale,channelId=cid)
                if op=="release": fields["leaseId"]=uid()
                return call(2,op,**fields)
            assert error_code(lambda:hidden(c))==error_code(lambda:hidden(uid()))=="42501"

        denied(lambda:call(3,"join",synthetic_permit=False,channelId=c,epoch=epochs[3]))
        assert cmd(3,"join")["admission"]=="live"
        denied(lambda:cmd(2,"leave"))
        keys={p:uid() for p in (2,3)}
        with concurrent.futures.ThreadPoolExecutor() as pool:
            turns={p:pool.submit(cmd,p,"press",pressId=key) for p,key in keys.items()}
        won=[p for p,f in turns.items() if f.result()["granted"]]
        assert len(won)==1
        winner=won[0]; loser=5-winner
        lease=turns[winner].result()["leaseId"]
        assert cmd(winner,"press",pressId=keys[winner])["leaseId"]==lease
        assert cmd(loser,"release",leaseId=lease)=={"released":False,"endReason":None}
        manage("archive")
        assert cmd(winner,"status")["floor"]["leaseId"]==lease
        sql("update erp_private.ptt_feature_gate set enabled=false;update erp_comm_cost.authority set owner_auth_id=null,owner_binding_evidence=null")
        assert cmd(winner,"release",leaseId=lease)=={"released":True,"endReason":"released"}
        assert call(loser,"pause",epoch=epochs[loser],paused=True)["paused"]
        sql("update erp_comm_cost.authority set owner_auth_id=lpad('1',32,'0')::uuid,owner_binding_evidence='fixture';update erp_private.ptt_feature_gate set enabled=true")
        call(loser,"pause",epoch=epochs[loser],paused=False)
        review=call(1,"reopenReview",channelId=c)
        manage("setRequired",required=True)
        denied(lambda:manage("reopen",reviewToken=review["reviewToken"]))
        review=call(1,"reopenReview",channelId=c)
        manage("reopen",reviewToken=review["reviewToken"])
        cmd(loser,"join");assert not cmd(loser,"press",pressId=keys[loser])["granted"]
        old=epochs[loser]; new_device=uid()
        assert call(loser,"start",deviceId=new_device,confirmTakeover=False)["takeoverRequired"]
        assert call(loser,"start",deviceId=new_device,confirmTakeover=True,expectedEpoch=uid())["takeoverRequired"]
        epochs[loser]=call(loser,"start",deviceId=new_device,confirmTakeover=True,expectedEpoch=old)["epoch"]
        denied(lambda:call(loser,"status",channelId=c,epoch=old))
        direct=call(2,"direct",peerProfileId="3")["id"]
        assert direct==call(3,"direct",peerProfileId="2")["id"]
        sql("insert into erp_private.comms_blocks(blocker_id,blocked_id) values(2,3)")
        denied(lambda:call(2,"join",channelId=direct,epoch=epochs[2]))
        assert cmd(2,"join")["admission"]=="live"
        # Rehearse service operations with exact budget evidence, no provider, network or owner identity.
        sql("""insert into auth.users values(lpad('1',32,'0')::uuid) on conflict do nothing;
        update erp_comm_cost.authority set owner_auth_id=lpad('1',32,'0')::uuid,owner_binding_evidence='synthetic fixture only';
        insert into erp_comm_cost.capacity(billing_account,dimension,unit,valid_from,valid_until,available_units,enabled)
        select 'fixture',d,'units',now()-interval '1 hour',now()+interval '1 day',10000,true from unnest(array['railway','database','sfu_turn']) d;""")
        def service(op,payload):
            encoded=json.dumps(payload).replace("'","''")
            return json.loads(sql(f"set role service_role;select public.erp_ptt_provider_v1('{op}','{encoded}')"))
        def ledger(op,payload):
            encoded=json.dumps(payload).replace("'","''")
            return json.loads(sql(f"set role service_role;select public.erp_comm_budget_command('{op}','{encoded}')"))
        def signal(actor,action,**args):
            operation=uid()
            until=sql("select (now()+interval '2 minutes')::text")
            sql(f"""insert into erp_comm_cost.proof(operation_id,scope,actor_id,feature,liability_ends_at,operational_stop_by,valid_until,max_meter_age,shutdown_evidence,headroom_micros,retained_at_zero_cost_evidence)
             values('{operation}','communications','{actor}','ptt_live','{until}',now()+interval '45 minutes',now()+interval '1 hour',interval '3 minutes','local fixture',0,'synthetic continuing ledger capacity');
             insert into erp_comm_cost.meter select '{operation}',dimension,'fixture',true,now(),now()+interval '1 hour',now()+interval '2 hours',0,id,case when unit='permanent_ledger_bytes' then 1000000 else 1 end from erp_comm_cost.capacity where billing_account='fixture' or unit='permanent_ledger_bytes';""")
            sql(f"insert into erp_comm_cost.cleanup_limit values('{operation}','close_sfu_tracks',1,5)")
            request={"scope":"communications","actorId":str(actor),"feature":"ptt_live","operationId":operation,"upperBoundMicros":"0","liabilityEndsAt":until}
            if action=="publish": args["sessionDescription"]={"type":"offer","sdp":"v=0 test"}
            if action=="answer": args["sessionDescription"]={"type":"answer","sdp":"v=0 test"}
            request["binding"]={"actorSessionId":str(uuid.UUID(f"{actor:032}")),"command":{"op":"ptt.signal","args":dict(epoch=epochs[actor],channelId=c,action=action,**args)}}
            guard=json.loads(sql("set role service_role;select public.erp_comm_budget_command('reserve','"+json.dumps(request)+"')"))
            assert guard.get("ok"),guard
            provider_args=dict(actor=str(actor),authSession=f"{actor:032}",epoch=epochs[actor],channelId=c,appId="fixture-app",action=action,operation=operation,until=until,permit=guard["permitId"],**args)
            if action=="open":
                assert error_code(lambda:service("begin",{**provider_args,"channelId":uid()}))=="PT503"
            worker.heartbeat()
            if action in ("publish","subscribe"):
                sql(f"update erp_comm_cost.proof set operational_stop_by=now()+interval '65 seconds' where operation_id='{operation}'")
                assert error_code(lambda:service("begin",provider_args))=="PT503"
                assert sql(f"select count(*) from erp_comm_cost.ptt_drain_hold where permit_id='{guard['permitId']}'")=="0"
                sql(f"update erp_comm_cost.proof set operational_stop_by=now()+interval '45 minutes' where operation_id='{operation}'")
            plan=service("begin",provider_args)
            if action=="open":
                assert error_code(lambda:service("begin",provider_args))=="PT503"
            if action in ("publish","subscribe"):
                assert sql(f"select count(*) from erp_comm_cost.ptt_drain_hold h join erp_comm_cost.cleanup_resource r using(permit_id) where h.worker='{WORKER}' and r.resource_id='{plan['endpointId']}'")=="1"
            return plan
        def finished(plan,**args):
            return service("finish",dict(endpointId=plan["endpointId"],token=plan["token"],**args))["ok"]
        lease=cmd(2,"press",pressId=uid())["leaseId"]
        first=signal(2,"open");assert finished(first,sessionId="fixture-publisher")
        denied(lambda:signal(2,"publish",endpointId=first["endpointId"],leaseId=lease,mid="0"))
        # Assignment 14 owns the retained-object preflight. Substitute an exact lease grant only in this disposable test.
        sql(f"""create or replace function erp_private.ptt_recording_ready(p_lease uuid,p_profile bigint,p_epoch uuid) returns boolean
        language sql stable set search_path='' as $$select p_lease='{lease}'::uuid and p_profile=2 and p_epoch='{epochs[2]}'::uuid$$""")
        first=signal(2,"publish",endpointId=first["endpointId"],leaseId=lease,mid="0");assert finished(first,mid="0")
        cmd(3,"join")
        other=signal(3,"open");assert finished(other,sessionId="fixture-subscriber")
        other=signal(3,"subscribe",endpointId=other["endpointId"],leaseId=lease)
        assert other["publisherSessionId"]=="fixture-publisher" and other["trackName"]=="ptt-"+lease
        assert finished(other,mid="1")
        other=signal(3,"answer",endpointId=other["endpointId"],leaseId=lease);assert finished(other)
        assert cmd(2,"release",leaseId=lease)["released"]
        # The normal harness heartbeat would itself claim the first closure. Keep this
        # press independent of cleanup and allow both real denial paths (held or refused).
        blocked_press=dict(epoch=epochs[3],channelId=c,pressId=uid())
        proof=ticket(3,"press",blocked_press)
        try:
            assert not request(3,"press",blocked_press,proof)["granted"]
        except subprocess.CalledProcessError as err:
            assert "PT503: PTT worker unavailable" in err.stderr,err.stderr
        assert sql("select count(*) from erp_private.ptt_endpoints where dirty and phase<>'closed'")=="2"
        for _ in range(2):
            cycle=worker.tick(enabled=False)
            job=cycle["job"]
            assert job["sessionId"] in ("fixture-subscriber","fixture-publisher")
            assert sql("select count(*) from erp_private.ptt_endpoints where dirty and phase<>'closed'")!="0"
            receipt=dict(permitId=job["permitId"],resourceId=job["endpointId"],endpoint="close_sfu_tracks",attemptId=job["token"])
            assert ledger("authorize_cleanup",receipt)["newAttempt"]
            assert ledger("confirm_cleanup",receipt)["ok"]
            service("closed",dict(endpointId=job["endpointId"],token=job["token"]))
            sql(f"select erp_private.ptt_take_recording_poll('{cycle['poll']}')")
            assert worker.finish(cycle["poll"])["ok"]
        assert sql("select count(*) from erp_private.ptt_endpoints where dirty and phase<>'closed'")=="0"
        lease=cmd(3,"press",pressId=uid())["leaseId"]
        sql(f"update erp_private.ptt_leases set started_at=now()-interval '61 seconds',expires_at=now()-interval '1 second' where id='{lease}'")
        call(1,"state");call(1,"capabilities")
        # A bootstrap read and unrelated cleanup must leave another actor's expired lease untouched.
        call(5,"stop",epoch=outsider)
        assert sql(f"select ended_at is null from erp_private.ptt_leases where id='{lease}'")=="t"
        assert cmd(3,"release",leaseId=lease)=={"released":False,"endReason":"expired"}
        assert cmd(3,"status")["floor"] is None
        assert sql(f"select end_reason from erp_private.ptt_leases where id='{lease}'")=="expired"
        # Latest rejoin cuts off previous group history for the same account.
        joined=sql(f"select joined_at::text from erp_private.ptt_memberships where channel_id='{c}' and profile_id=3 and left_at is null")
        manage("remove",profileId="3"); manage("add",profileId="3")
        assert sql(f"set test.actor='3';select erp_private.ptt_history_allowed('{c}','{joined}','participant')")=="f"
        assert sql(f"set test.actor='1';select erp_private.ptt_history_allowed('{c}','{joined}','review')")=="t"
        assert sql(f"set test.actor='4';select erp_private.ptt_history_allowed('{c}','{joined}','review')")=="f"
        assert call(1,"capabilities")["canCreatePttChannel"]
        assert not call(2,"capabilities")["canCreatePttChannel"]
        call(1,"creatorGrant",profileId="2",expectedRevision="0",enabled=True)
        assert call(2,"capabilities")["canCreatePttChannel"]
        optional=call(2,"channelCreate",name="Optional",description="",discoverable=True,clientMutationId=uid())["id"]
        def admin(p,action,**args):
            rev=call(p,"members",channelId=optional)["revision"]
            return call(p,"manage",channelId=optional,expectedRevision=rev,action=action,**args)
        admin(2,"add",profileId="3"); admin(2,"add",profileId="5");admin(2,"promote",profileId="5")
        call(3,"join",channelId=optional,epoch=epochs[3])
        snapshot=call(3,"monitorLive",epoch=epochs[3],selectedChannelId=optional)
        assert snapshot["selected"]["joinedAt"] and any(x["channelId"]==optional for x in snapshot["items"])
        call(3,"disconnect",channelId=optional,epoch=epochs[3])
        assert call(3,"monitor",epoch=epochs[3],selectedChannelId=optional)["selected"]["name"]=="Optional"
        call(2,"leave",channelId=optional,epoch=epochs[2])
        denied(lambda:admin(3,"archive")) # NULL owner must never become a management grant.
        admin(5,"replaceOwner",profileId="5")
        denied(lambda:admin(5,"promote",profileId="3")) # replacement owner did not become creator.
        # Synthesize membership and phone presence; exercise real 100-slot transaction and FIFO promotion.
        sql(f"""delete from erp_private.ptt_admissions where channel_id='{c}';
        insert into public.user_profiles(id,auth_user_id,status,must_change_password,display_name) select n,lpad(n::text,32,'0')::uuid,'active',false,'Fixture' from generate_series(100,200)n;
        insert into erp_private.ptt_memberships(channel_id,profile_id) select '{c}',n from generate_series(100,200)n;
        insert into erp_private.ptt_phones(profile_id,device_id,auth_session,epoch,availability,stopped,paused) select n,gen_random_uuid(),lpad(n::text,32,'0')::uuid,gen_random_uuid(),'available',false,false from generate_series(100,200)n;
        insert into erp_private.ptt_admissions(channel_id,profile_id,epoch,requested_at) select '{c}',profile_id,epoch,now()+profile_id*interval '1 microsecond' from erp_private.ptt_phones where profile_id>=100;
        begin;select erp_private.ptt_lock();select erp_private.comms_track_profile(n) from generate_series(100,200)n; update erp_private.ptt_memberships m set scope_anchor=erp_private.comms_scope_anchor(profile_id) where profile_id>=100; select erp_private.ptt_promote(n) from generate_series(100,200)n;commit;""")
        assert sql(f"select count(*) from erp_private.ptt_admissions where channel_id='{c}' and live")=="100"
        assert sql(f"select profile_id from erp_private.ptt_admissions where channel_id='{c}' and not live")=="200"
        epoch=sql("select epoch from erp_private.ptt_phones where profile_id=200")
        denied(lambda:call(200,"press",channelId=c,epoch=epoch,pressId=uid()))
        call(100,"stop",epoch=sql("select epoch from erp_private.ptt_phones where profile_id=100"))
        assert call(200,"status",channelId=c,epoch=epoch)["admission"]=="waiting"
        assert any(x["channelId"]==c and x["admission"]=="live" for x in call(200,"monitorLive",epoch=epoch)["items"])
        roster_args={"channelId":c}
        roster_cmd=json.dumps({"op":"ptt.members","args":roster_args})
        narrow=worker.effect_permit(1,'realtime',roster_cmd,'ptt_roster_rows',2)
        assert error_code(lambda:request(1,'members',roster_args,narrow))=='PT503'
        assert len(call(1,'members',**roster_args)['items'])>=101
        episode_versions=sql(f"select md5(string_agg(id::text||':'||xmin::text,',' order by id)) from erp_private.ptt_memberships where channel_id='{c}'")
        manage('setRequired',required=False)
        assert sql(f"select md5(string_agg(id::text||':'||xmin::text,',' order by id)) from erp_private.ptt_memberships where channel_id='{c}'")==episode_versions
        # Three Required channels are discovered across separately paid heartbeats.
        additions=[]
        for i in range(3):
            extra=call(1,"channelCreate",name=f"Required {i}",description="",discoverable=False,required=True,clientMutationId=uid())["id"]
            rev=call(1,"members",channelId=extra)["revision"]
            call(1,"manage",channelId=extra,action="add",expectedRevision=rev,profileId="2")
            additions.append(extra)
        # A zero-row allowance is insufficient only when there is a real row to return.
        seat=call(2,"join",channelId=c,epoch=epochs[2])
        assert seat["admission"] in ("live","waiting")
        assert sql(f"select count(*) from erp_private.ptt_current_admissions where channel_id='{c}' and profile_id=2 and epoch='{epochs[2]}'")=="1"
        worker.heartbeat()
        monitor_args={"epoch":epochs[2]}
        monitor_cmd=json.dumps({"op":"ptt.monitorLive","args":monitor_args})
        tiny=worker.effect_permit(2,'ptt_live',monitor_cmd,'ptt_monitor_rows',0)
        assert error_code(lambda:request(2,'monitorLive',monitor_args,tiny))=='PT503'
        previous=set()
        for _ in range(8):
            live_rows=call(2,'monitorLive',**monitor_args)['items']
            current={r['channelId'] for r in live_rows if r['channelId'] in additions}
            assert len(current-previous)<=1
            previous=current
            if len(current)==3: break
        assert len(previous)==3
        sql("insert into erp_private.chat_named_grants(profile_id,kind,enabled,granted_by) values(5,'historyReview',true,1) on conflict(profile_id,kind) do update set enabled=true")
        assert sql(f"set test.actor='5';select erp_private.ptt_history_allowed('{direct}',now(),'review')")=="t"
        # Core identity writes stay available with zero optional-module funding.
        before=sql(f"select count(*) from erp_private.ptt_memberships where profile_id=3 and left_at is null")
        sql("update erp_private.ptt_feature_gate set enabled=false;update public.user_profiles set status='inactive' where id=3;update public.user_profiles set status='active' where id=3")
        assert sql(f"select count(*) from erp_private.ptt_memberships where profile_id=3 and left_at is null")==before
        assert sql("select count(*) from erp_private.ptt_current_memberships where profile_id=3")=="0"
        assert sql(f"set test.actor='5';select erp_private.ptt_history_allowed('{direct}',now(),'review')")=="f"
        assert sql(f"set test.actor='1';select erp_private.ptt_history_allowed('{c}',now(),'review')")=="t"
        sql("update erp_private.ptt_feature_gate set enabled=true")
        assert not any(row['id']==c for row in call(3,"channels")['items'])
        sql("update erp_comm_cost.ptt_worker_boot set poll_limit=polls")
        assert worker.tick()=={"held":True}
        assert error_code(lambda:request(2,"monitorLive",{"epoch":epochs[2]},ticket(2,"monitorLive",{"epoch":epochs[2]})))=="PT503"
        print("PASS native PG17: permissions, optional/required membership, vacancy/replacement, rejoin cutoff, 100/101 FIFO, concurrent/expired floors, takeover, archive, service SFU grants, paused cleanup, raw RPC denial, funded one-shot boot/drain, bounded rosters and incremental admissions, core identity mutation and reactivation denial.")
        for filename,digest in applied.items(): print(digest,filename)
    finally:
        pg("pg_ctl","-D",cluster,"-m","fast","-w","stop")
        if scratch.resolve().parent!=work.resolve(): raise RuntimeError("Invalid scratch directory")
        shutil.rmtree(scratch)
if __name__=="__main__":
    try: run()
    except subprocess.CalledProcessError as error:
        print(error.stderr)
        raise
