"""Run against a fresh localhost PostgreSQL instance with synthetic ERP rows."""
import concurrent.futures
import hashlib
import json
import os
import pathlib
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20261123094907_erp_communications_chat_v1.sql"
UPLOAD_RETRY_MIGRATION = ROOT / "supabase/migrations/20261124152200_erp_chat_upload_retry_status.sql"
PGBIN = pathlib.Path(os.environ.get("PG_BIN", "C:/Program Files/PostgreSQL/17/bin"))
EXE = ".exe" if os.name == "nt" else ""

def pg(tool, *args, **options):
    if tool == "pg_ctl":
        subprocess.run([str(PGBIN / (tool + EXE)), *map(str,args)], check=True, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return ""
    return subprocess.run([str(PGBIN / (tool + EXE)), *map(str, args)], check=True, text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, **options).stdout

def run(without_upload_retry_status=False):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    workspace = ROOT / "tmp"
    workspace.mkdir(exist_ok=True)
    directory = pathlib.Path(tempfile.mkdtemp(prefix="chat-native-", dir=workspace))
    cluster = directory / "db"
    password = secrets.token_urlsafe(32)
    passwd = directory / "pw"
    passwd.write_text(password, encoding="ascii")
    pg("initdb", "-D", cluster, "-U", "postgres", "-A", "scram-sha-256", "--pwfile", passwd, "-E", "UTF8", "--no-locale")
    passwd.unlink()
    pg("pg_ctl", "-D", cluster, "-l", directory / "pg.log", "-o", f"-h 127.0.0.1 -p {port}", "-w", "start")

    def sql(statement):
        return pg("psql","-X","-qAt","-h","127.0.0.1","-p",port,"-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1",
                  input=statement,env={**os.environ,"PGPASSWORD":password}).strip()

    def permit(actor, feature, command):
        raw=json.dumps(command).replace("'","''")
        return sql(f"SELECT public.fixture_chat_permit({actor},'{feature}','{raw}')")

    def request(actor, op, **args):
        command={"op":"chat."+op,"args":args}
        feature="realtime" if op in ("activity","pulse") else "media_upload" if op in ("uploadBegin","uploadStatus") else "chat"
        if op!="actor":
            command["_budgetPermitId"]=permit(actor,feature,command)
        encoded=json.dumps(command).replace("'","''")
        return json.loads(sql(f"SET ROLE authenticated; SET test.actor='{actor}'; SELECT public.erp_chat_v1('{encoded}'::jsonb);"))

    def mutation(actor, op, **args):
        return request(actor,op,clientMutationId=str(uuid.uuid4()),**args)

    def denied(fn):
        try:
            fn()
        except subprocess.CalledProcessError as error:
            assert any(s in error.stderr for s in ["unavailable","denied","required","permission","conflict","window","Invalid size","unfunded","Retained media","Invalid","Historical source gap","Historical administration","Insufficient history work capacity"]),error.stderr
        else:
            raise AssertionError("Expected denial")

    try:
        sql((ROOT/"tests/communications/chat_fixture.sql").read_text())
        migrations = [MIGRATION, ROOT/"supabase/migrations/20261123095158_erp_communication_budget_v1.sql"]
        if not without_upload_retry_status:
            migrations.append(UPLOAD_RETRY_MIGRATION)
        for migration in migrations:
            contents=migration.read_bytes()
            sql(contents.decode("utf-8-sig"))
            print("Applied synthetic",migration.name,hashlib.sha256(contents).hexdigest(),flush=True)
        denied(lambda:request(2,"directory"))
        sql("UPDATE erp_private.comms_chat_gate SET enabled=true")
        denied(lambda:request(2,"directory"))
        sql("UPDATE erp_comm_cost.authority SET owner_auth_id=lpad('1',32,'0')::uuid,owner_binding_evidence='synthetic'")
        command={"op":"chat.directory","args":{}}
        ticket=permit(2,"chat",command)
        def raw_request(actor,cmd):
            raw=json.dumps(cmd).replace("'","''")
            return sql(f"SET ROLE authenticated; SET test.actor='{actor}'; SELECT public.erp_chat_v1('{raw}')")
        denied(lambda:raw_request(2,command))
        denied(lambda:raw_request(3,{**command,"_budgetPermitId":ticket}))
        denied(lambda:raw_request(2,{**command,"args":{"query":"changed"},"_budgetPermitId":ticket}))
        raw_request(2,{**command,"_budgetPermitId":ticket})
        denied(lambda:raw_request(2,{**command,"_budgetPermitId":ticket}))
        sql("INSERT INTO erp_private.comms_policy_versions VALUES ('test',true); INSERT INTO erp_private.comms_policy_acceptances(profile_id,version) SELECT id,'test' FROM public.user_profiles;")
        assert request(1,"actor")["profileId"]=="1"
        assert request(1,"actor")["isGlobalSystemAdmin"]
        assert not request(4,"actor")["isGlobalSystemAdmin"]
        denied(lambda:request(7,"actor"))
        with concurrent.futures.ThreadPoolExecutor() as pool:
            calls=[pool.submit(mutation,a,"direct",peerProfileId=str(b)) for a,b in ((2,3),(3,2))]
            pair=[future.result()["id"] for future in calls]
        assert pair[0]==pair[1]
        c=pair[0]
        key=str(uuid.uuid4())
        kwargs={"conversationId":c,"body":"first","clientMutationId":key}
        msg=request(2,"send",**kwargs)
        assert request(2,"send",**kwargs)==msg
        denied(lambda:request(2,"send",**{**kwargs,"body":"different"}))
        denied(lambda:request(4,"messages",conversationId=c,mode="review"))
        mutation(1,"namedGrant",targetProfileId="5",kind="historyReview",enabled=True)
        assert request(5,"messages",conversationId=c,mode="review")["items"][0]["body"]=="first"
        denied(lambda:request(6,"messages",conversationId=c,mode="participant"))
        edited=mutation(2,"edit",messageId=msg["id"],expectedRevision="1",body="latest")
        mutation(2,"delete",messageId=msg["id"],expectedRevision=edited["revision"])
        assert request(3,"messages",conversationId=c,mode="participant")["items"][0]["body"]=="Message deleted"
        assert request(5,"messages",conversationId=c,mode="review")["items"][0]["body"]=="latest"
        sql("UPDATE public.user_roles SET is_active=false WHERE user_profile_id=5 AND owner_company_id=20")
        denied(lambda:request(5,"messages",conversationId=c,mode="review"))
        sql("INSERT INTO erp_private.comms_blocks(blocker_id,blocked_id) VALUES(2,3)")
        denied(lambda:mutation(3,"send",conversationId=c,body="blocked"))
        sql("DELETE FROM erp_private.comms_blocks; UPDATE public.user_roles SET is_active=true WHERE user_profile_id=5 AND owner_company_id=20")
        assert request(3,"conversation",conversationId=c,mode="participant")["id"]==c
        denied(lambda:request(6,"conversation",conversationId=c,mode="participant"))
        denied(lambda:mutation(4,"namedGrant",targetProfileId="2",kind="groupCreate",enabled=True))
        denied(lambda:mutation(2,"groupCreate",name="unauthorized",memberProfileIds=[]))
        mutation(1,"namedGrant",targetProfileId="2",kind="groupCreate",enabled=True)
        group=mutation(2,"groupCreate",name="Operations",memberProfileIds=["3"])
        group_id=group["id"]
        def group_change(actor,action,target=None):
            nonlocal group
            args=dict(conversationId=group_id,action=action,expectedRevision=group["revision"])
            if target is not None:
                args["targetProfileId"]=str(target)
            group=mutation(actor,"groupChange",**args)
        group_change(2,"promote",3)
        group_change(3,"add",6)
        denied(lambda:mutation(3,"groupChange",conversationId=group_id,action="promote",targetProfileId="6",expectedRevision=group["revision"]))
        assert request(6,"messages",conversationId=group_id,mode="participant")["items"]
        denied(lambda:request(5,"messages",conversationId=group_id,mode="review"))
        group_stage = mutation(6,"uploadBegin",conversationId=group_id,filename="group.ogg",mime="audio/ogg",byteLength=4)["uploadId"]
        sql(f"UPDATE erp_private.chat_uploads SET stage_expires_at=clock_timestamp()-interval '1 second' WHERE id='{group_stage}'")
        assert request(6,"uploadStatus",uploadId=group_stage)["terminal"] is True
        group_change(2,"remove",6)
        denied(lambda:request(6,"uploadStatus",uploadId=group_stage))
        denied(lambda:request(6,"messages",conversationId=group_id,mode="participant"))
        denied(lambda:request(5,"messages",conversationId=group_id,mode="review"))
        media=mutation(2,"uploadBegin",conversationId=c,filename="note.ogg",mime="audio/ogg",byteLength=4,kind="voice")
        upload=media["uploadId"]
        assert request(2,"uploadStatus",uploadId=upload)=={"uploadId":upload,"conversationId":c,"byteLength":4,"state":"reserved","terminal":False}
        denied(lambda:request(3,"uploadStatus",uploadId=upload))
        sql(f"UPDATE erp_private.chat_uploads SET reserving_session=gen_random_uuid() WHERE id='{upload}'")
        denied(lambda:request(2,"uploadStatus",uploadId=upload))
        sql(f"UPDATE erp_private.chat_uploads SET reserving_session=lpad('2',32,'0')::uuid WHERE id='{upload}'")
        def rpc(role,actor,call,feature,op,args):
            ticket=permit(actor,feature,{"op":op,"args":args})
            call=call[:-1]+f",'{ticket}')"
            return json.loads(sql(f"SET ROLE {role}; SET test.actor='{actor}'; SELECT {call};"))
        binding=rpc("authenticated",2,f"public.erp_chat_upload_bind('{upload}')","media_upload","chat.uploadBind",{"uploadId":upload})
        denied(lambda:rpc("authenticated",3,f"public.erp_chat_upload_bind('{upload}')","media_upload","chat.uploadBind",{"uploadId":upload}))
        worker=str(uuid.uuid4())
        boot=str(uuid.uuid4())
        def stage_open(item, fund=True):
            args={"uploadId":item,"actorId":"2","sessionId":binding["sessionId"]}
            cmd={"op":"chat.stageOpen","args":args}
            token=permit(2,"media_upload",cmd)
            if not fund:
                sql(f"DELETE FROM erp_comm_cost.cleanup_limit WHERE operation_id='{token}'")
            return json.loads(sql(f"SET ROLE service_role; SELECT public.erp_chat_stage_open('{item}',2,'{binding['sessionId']}','{token}')"))
        def cleanup_claim(horizon="2 days"):
            # Move the disposable test clock between polls without sleeping.
            sql("UPDATE erp_comm_cost.control_pool SET last_poll=now()-interval '1 minute'")
            return json.loads(sql(f"SET ROLE service_role; SELECT public.erp_chat_stage_claim('{worker}','{boot}','{uuid.uuid4()}',now()+interval '{horizon}')"))["job"]
        denied(lambda:stage_open(upload))
        denied(lambda:sql(f"SET ROLE service_role; SELECT public.erp_chat_stage_claim('{worker}','{boot}','{uuid.uuid4()}',now()+interval '2 days')"))
        sql(f"SELECT public.fixture_chat_worker('{worker}','{boot}')")
        assert cleanup_claim("1 hour") is None
        denied(lambda:stage_open(upload))  # paid pool outlives the configured worker cutoff
        assert cleanup_claim() is None
        sql("UPDATE erp_comm_cost.control_pool SET enabled=false")
        denied(lambda:stage_open(upload))  # recent heartbeat cannot override a suspended funded worker
        sql("UPDATE erp_comm_cost.control_pool SET enabled=true")
        denied(lambda:stage_open(upload,False))
        assert stage_open(upload)["state"]=="reserved"
        origin=sql(f"SELECT stage_permit FROM erp_private.chat_uploads WHERE id='{upload}'")
        assert stage_open(upload)["state"]=="reserved"
        assert origin==sql(f"SELECT stage_permit FROM erp_private.chat_uploads WHERE id='{upload}'")
        checksum="a"*64
        confirm=f"public.erp_chat_upload_verified('{upload}',2,'{binding['sessionId']}',4,'audio/ogg','{checksum}')"
        verified_args={"uploadId":upload,"actorId":"2","sessionId":binding["sessionId"],"byteLength":4,"mime":"audio/ogg","sha256":checksum}
        denied(lambda:rpc("authenticated",2,confirm,"media_upload","chat.uploadVerified",verified_args))
        sql(f"""INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('erp-chat-media','{upload}','{{"size":4,"mimetype":"audio/ogg"}}')""")
        assert rpc("service_role",2,confirm,"media_upload","chat.uploadVerified",verified_args)["state"]=="verified"
        assert request(2,"uploadStatus",uploadId=upload)["terminal"] is False
        send_args={"conversationId":c,"body":"Voice note","uploadIds":[upload],"clientMutationId":str(uuid.uuid4())}
        original=request(2,"send",**send_args)
        sql(f"UPDATE erp_private.chat_uploads SET stage_expires_at=clock_timestamp()-interval '1 second' WHERE id='{upload}'")
        attached=request(2,"uploadStatus",uploadId=upload)
        assert attached["state"]=="attached" and attached["terminal"] is False
        assert request(2,"send",**send_args)==original
        first=request(2,"messages",conversationId=c,mode="participant")["items"][0]
        att=first["attachments"][0]["id"]
        assert rpc("authenticated",3,f"public.erp_chat_attachment_bind('{att}','participant')","media_download","chat.attachmentBind",{"attachmentId":att,"mode":"participant"})["path"]==upload
        copied=mutation(3,"forward",sourceMessageId=original["id"],destinationConversationId=group_id,expectedRevision="1")
        forward=request(3,"messages",conversationId=group_id,mode="participant")["items"][0]
        assert forward["forwarded"] and forward["attachments"][0]["id"]!=att
        reply=mutation(3,"send",conversationId=c,body="Ack",replyToMessageId=original["id"])
        mutation(2,"delete",messageId=original["id"],expectedRevision="1")
        denied(lambda:rpc("authenticated",3,f"public.erp_chat_attachment_bind('{att}','participant')","media_download","chat.attachmentBind",{"attachmentId":att,"mode":"participant"}))
        assert rpc("authenticated",5,f"public.erp_chat_attachment_bind('{att}','review')","media_download","chat.attachmentBind",{"attachmentId":att,"mode":"review"})["path"]==upload
        assert request(3,"messages",conversationId=c,mode="participant")["items"][0]["reply"]["body"]=="Message deleted"
        assert request(3,"media",conversationId=group_id,mode="participant")["items"][0]["id"]==forward["attachments"][0]["id"]
        person=mutation(3,"personal",conversationId=c,archived=True,muted=True)
        assert any(x["id"]==c for x in request(3,"conversations",mode="participant",archived=True)["items"])
        latest=mutation(2,"send",conversationId=c,body="Quiet update")
        assert any(x["id"]==c for x in request(3,"conversations",mode="participant")["items"])
        mutation(3,"read",conversationId=c,upToSeq=latest["seq"])
        assert request(2,"readers",messageId=latest["id"])["items"][0]["profileId"]=="3"
        mutation(3,"star",messageId=latest["id"],enabled=True)
        assert request(3,"stars")["items"][0]["id"]==latest["id"]
        mutation(2,"pin",messageId=copied["id"],enabled=True)
        mutation(2,"reaction",messageId=copied["id"],emoji="OK",enabled=True)
        denied(lambda:mutation(2,"delete",messageId=latest["id"],expectedRevision="0"))
        sql(f"UPDATE erp_private.chat_messages SET sent_at=now()-interval '15 minutes' WHERE id='{latest['id']}'")
        denied(lambda:mutation(2,"edit",messageId=latest["id"],expectedRevision="1",body="late"))
        denied(lambda:mutation(2,"delete",messageId=latest["id"],expectedRevision="1"))
        assert request(3,"search",mode="participant",query="Quiet")["items"][0]["messageId"]==latest["id"]
        assert all(x["conversationId"]!=c for x in request(3,"search",mode="participant",query="note.ogg")["items"])
        assert any(x["conversationId"]==c for x in request(5,"search",mode="review",query="note.ogg")["items"])
        pages=rpc("authenticated",3,f"public.erp_chat_export_page('{c}','participant',null,null,null,2,null)","export","chat.exportPage",{"conversationId":c,"mode":"participant","from":None,"until":None,"after":None,"limit":2,"expected":None})
        assert pages["nextSeq"] and len(pages["items"])==2
        mutation(3,"pulse",conversationId=c,typing=True)
        assert request(2,"activity",conversationId=c)["items"][0]["typing"]
        sample1=sql("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')")
        pulse_key=str(uuid.uuid4())
        request(3,"pulse",conversationId=c,typing=True,pulseAt=sample1,clientMutationId=pulse_key)
        expiry1=sql(f"SELECT online_until FROM erp_private.chat_presence WHERE conversation='{c}' AND profile_id=3")
        request(3,"pulse",conversationId=c,typing=True,pulseAt=sample1,clientMutationId=pulse_key)
        assert expiry1==sql(f"SELECT online_until FROM erp_private.chat_presence WHERE conversation='{c}' AND profile_id=3")
        mutation(3,"pulse",conversationId=c,typing=False)
        request(3,"pulse",conversationId=c,typing=True,pulseAt=sample1,clientMutationId=pulse_key)
        assert not request(2,"activity",conversationId=c)["items"][0]["typing"]
        for i in range(5):
            mutation(3,"pulse",conversationId=c,typing=bool(i%2))
        sql(f"""SET test.actor='3'; DO $batch$ DECLARE request jsonb; ticket uuid; BEGIN
            FOR n IN 1..40 LOOP
              request:=jsonb_build_object('op','chat.pulse','args',jsonb_build_object('conversationId','{c}','clientMutationId',gen_random_uuid(),'typing',false));
              ticket:=public.fixture_chat_permit(3,'realtime',request);
              PERFORM public.erp_chat_v1(request||jsonb_build_object('_budgetPermitId',ticket));
            END LOOP;
            END $batch$;""")
        assert sql(f"SELECT cardinality(recent_ids) FROM erp_private.chat_presence WHERE conversation='{c}' AND profile_id=3")=="32"
        assert sql(f"SELECT count(*) FROM erp_private.chat_presence WHERE conversation='{c}' AND profile_id=3")=="1"
        assert sql(f"SELECT count(*) FROM erp_private.chat_mutations WHERE actor=3 AND conversation='{c}' AND entity='{c}' AND result=jsonb_build_object('id','{c}'::uuid,'conversationId','{c}'::uuid,'revision','1')")=="0", "heartbeat receipts must be physically bounded"
        sync=request(3,"sync",cursors=[{"conversationId":c,"changeSeq":"0"}],limit=2)
        assert sync["changes"] and sync["conversations"] and sync["hasMore"]
        assert group_id in request(6,"sync",cursors=[{"conversationId":group_id,"changeSeq":"0"}])["revokedConversationIds"]
        mutation(2,"delete",messageId=copied["id"],expectedRevision="1")
        pinned=[x for x in request(3,"messages",conversationId=group_id,mode="participant")["items"] if x["id"]==copied["id"]][0]
        assert pinned["pinned"] and pinned["deleted"] and pinned["body"]=="Message deleted"
        assert not pinned["attachments"] and not pinned["mentions"] and not pinned["reactions"]
        mutation(2,"pin",messageId=copied["id"],enabled=False)
        assert not next(x for x in request(3,"messages",conversationId=group_id,mode="participant")["items"] if x["id"]==copied["id"])["pinned"]
        group_change(2,"leave")
        group_change(1,"replaceOwner",3)
        assert request(3,"conversations",mode="participant")["items"]
        denied(lambda:sql("SET ROLE authenticated; SELECT body FROM erp_private.chat_messages"))
        # An unrelated permissive object policy must not open the private chat bucket.
        sql("GRANT USAGE ON SCHEMA storage TO authenticated; GRANT SELECT ON storage.objects TO authenticated; CREATE POLICY unrelated_fixture ON storage.objects FOR SELECT TO authenticated USING(true); INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('other-app','visible','{}')")
        assert sql("SET ROLE authenticated; SELECT string_agg(name,',') FROM storage.objects")=="visible"
        def new_stage(label, store=False, verify=False):
            item=mutation(2,"uploadBegin",conversationId=c,filename=label+".ogg",mime="audio/ogg",byteLength=4)["uploadId"]
            stage_open(item)
            if store:
                sql(f"""INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('erp-chat-media','{item}','{{"size":4,"mimetype":"audio/ogg"}}')""")
            if verify:
                args={**verified_args,"uploadId":item}
                rpc("service_role",2,f"public.erp_chat_upload_verified('{item}',2,'{binding['sessionId']}',4,'audio/ogg','{checksum}')","media_upload","chat.uploadVerified",args)
            return item

        def abort_stage(item):
            return json.loads(sql(f"SET ROLE service_role; SELECT public.erp_chat_stage_abort('{item}',2,'{binding['sessionId']}')"))["queued"]

        def make_due(item):
            sql(f"UPDATE erp_private.chat_uploads SET stage_expires_at=now()-interval '1 second',write_lease_until=now()-interval '1 second',next_cleanup_at=now() WHERE id='{item}'")

        def finish_job(job,absent):
            return json.loads(sql(f"SET ROLE service_role; SELECT public.erp_chat_stage_finish('{job['uploadId']}','{job['attemptId']}',{str(absent).lower()})"))["confirmed"]

        # No file was written before the request failed; reconciling an absent object closes the obligation.
        missed=new_stage("never-written")
        assert abort_stage(missed)
        failed=request(2,"uploadStatus",uploadId=missed)
        assert failed["state"]=="failed" and failed["terminal"] is True
        assert cleanup_claim() is None  # active write lease fences the potentially delayed upload
        make_due(missed)
        job=cleanup_claim()
        assert job["uploadId"]==missed and finish_job(job,True) and finish_job(job,True)
        denied(lambda:sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES('erp-chat-media','{missed}')"))
        # Revocation after Storage accepted bytes cannot prevent funded service cleanup.
        abandoned=new_stage("unattached",True,True)
        assert not abort_stage(abandoned)  # a delayed failure callback cannot undo successful verification
        make_due(abandoned)
        expired=request(2,"uploadStatus",uploadId=abandoned)
        assert expired["state"]=="verified" and expired["terminal"] is True
        sql("INSERT INTO erp_private.comms_blocks(blocker_id,blocked_id) VALUES(2,3)")
        job=cleanup_claim()
        assert job["uploadId"]==abandoned and not finish_job(job,True)  # catalog still present
        denied(lambda:mutation(2,"send",conversationId=c,uploadIds=[abandoned]))
        make_due(abandoned)
        next_job=cleanup_claim()
        assert next_job["attemptId"]!=job["attemptId"]
        denied(lambda:finish_job(job,True))  # stale lease cannot acknowledge the next worker's attempt
        sql(f"DELETE FROM storage.objects WHERE bucket_id='erp-chat-media' AND name='{abandoned}'")
        assert finish_job(next_job,True)
        sql("DELETE FROM erp_private.comms_blocks")
        # Race a send holding its transaction open across the expiry boundary with a worker claim.
        race_item=new_stage("race",True,True)
        race_cmd={"op":"chat.send","args":{"clientMutationId":str(uuid.uuid4()),"conversationId":c,"uploadIds":[race_item]}}
        race_cmd["_budgetPermitId"]=permit(2,"chat",race_cmd)
        race_json=json.dumps(race_cmd)
        sql(f"UPDATE erp_private.chat_uploads SET stage_expires_at=now()+interval '12 seconds',write_lease_until=now() WHERE id='{race_item}'")
        with concurrent.futures.ThreadPoolExecutor() as pool:
            sending=pool.submit(sql,f"BEGIN;SET ROLE authenticated;SET test.actor='2';SELECT public.erp_chat_v1('{race_json}'); SELECT pg_advisory_xact_lock(77111373);SELECT pg_sleep(18);COMMIT;")
            import time
            wait_until=time.monotonic()+12
            while time.monotonic()<wait_until:
                if sending.done():
                    sending.result()
                    raise AssertionError("Transaction finished before race observation")
                if sql("SELECT EXISTS(SELECT FROM pg_locks WHERE locktype='advisory' AND objid=77111373)")=="t":
                    break
            else:
                raise AssertionError("Send did not acquire fixture barrier")
            seconds=float(sql(f"SELECT greatest(0,extract(epoch FROM stage_expires_at-clock_timestamp())) FROM erp_private.chat_uploads WHERE id='{race_item}'"))
            time.sleep(seconds+0.1)
            assert cleanup_claim() is None
            sending.result()
        assert sql(f"SELECT state FROM erp_private.chat_uploads WHERE id='{race_item}'")=="attached"
        denied(lambda:sql(f"DELETE FROM storage.objects WHERE bucket_id='erp-chat-media' AND name='{race_item}'"))
        denied(lambda:sql(f"DELETE FROM storage.objects WHERE bucket_id='erp-chat-media' AND name='{upload}'"))
        # Bounds are checked in the DB even if HTTP validation is bypassed.
        denied(lambda:mutation(2,"uploadBegin",conversationId=c,filename="x.ogg",mime="audio/ogg",byteLength=52428801))
        exact=mutation(2,"uploadBegin",conversationId=c,filename="x.ogg",mime="audio/ogg",byteLength=52428800)
        assert exact["byteLength"]==52428800
        # A subsequent message cannot push a repeated item onto page two.
        pg1=request(2,"messages",conversationId=c,mode="participant",limit=1)
        mutation(3,"send",conversationId=c,body="Arrived during paging")
        pg2=request(2,"messages",conversationId=c,mode="participant",cursor=pg1["nextCursor"],limit=1)
        assert int(pg2["items"][0]["seq"])<int(pg1["items"][0]["seq"])
        # Exercise the actual inlined, authorized search function at realistic cardinality.
        pattern="Needle_%! Привет مرحبا"
        distinctive=mutation(2,"send",conversationId=c,body=pattern)
        for literal in ["Needle_%!","_","%","!","مرحبا","Привет"]:
            hits=request(3,"search",mode="participant",query=literal)["items"]
            assert any(x["id"]==distinctive["id"] for x in hits),literal
        body_stress=f"INSERT INTO erp_private.chat_messages(conversation,seq,sender,body) SELECT '{c}',n+100000,2,md5(n::text) FROM generate_series(1,15000) n"
        sql(body_stress)
        sql("VACUUM (ANALYZE) erp_private.chat_messages")
        plan=json.loads(sql("SET test.actor='3'; EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT * FROM erp_private.chat_search_rows(3,'participant','Needle_%!',null,null,null,41,0)"))[0]["Plan"]
        def plan_nodes(node):
            yield node
            for child in node.get("Plans",[]):
                yield from plan_nodes(child)
        indexed=[n for n in plan_nodes(plan) if n.get("Index Name")=="chat_message_body_substring"]
        assert indexed, json.dumps(plan)[:6000]
        assert not any(n.get("Relation Name")=="chat_messages" and n["Node Type"]=="Seq Scan" for n in plan_nodes(plan))
        print("PASS actual 15,000-row EXPLAIN uses",indexed[0]["Index Name"],"hits",indexed[0]["Shared Hit Blocks"],"index rows",indexed[0]["Actual Rows"])
        assert all(x["id"]!=distinctive["id"] for x in request(6,"search",mode="participant",query="Needle_%!")["items"])
        quota_item=mutation(2,"uploadBegin",conversationId=c,filename="quota.ogg",mime="audio/ogg",byteLength=4)["uploadId"]
        assert cleanup_claim() is None
        sql("UPDATE erp_comm_cost.control_pool SET used=max_actions-3001 WHERE kind='chat_stage_poll'")
        denied(lambda:stage_open(quota_item))  # fewer than three unpledged cleanup polls remain
        # Bounded read receipt writes preserve the original first-observed time for every prefix.
        sql(f"UPDATE erp_private.chat_conversations SET latest_seq=115000 WHERE id='{c}'")
        before=int(sql(f"SELECT count(*) FROM erp_private.chat_read_ranges WHERE conversation='{c}' AND profile_id=3"))
        initial=sql(f"SELECT erp_private.chat_read_at('{c}',1,3)")
        for marker in ["115000","115000","100001"]:
            assert mutation(3,"read",conversationId=c,upToSeq=marker)["readThroughSeq"]=="115000"
        assert int(sql(f"SELECT count(*) FROM erp_private.chat_read_ranges WHERE conversation='{c}' AND profile_id=3"))==before+1
        assert sql(f"SELECT erp_private.chat_read_at('{c}',1,3)")==initial
        assert sql(f"SELECT erp_private.chat_read_at('{c}',110000,3)")!=initial
        print("PASS 15,000-message read, retries and regression preserve readAt with one new range")

        # Reject an underfunded group admission before a single episode/notice is persisted.
        create={"op":"chat.groupCreate","args":{"clientMutationId":str(uuid.uuid4()),"name":"Unfunded group","memberProfileIds":["3","5","6"]}}
        token=permit(2,"chat",create)
        sql(f"UPDATE erp_comm_cost.unit_hold h SET units=2 FROM erp_comm_cost.capacity x WHERE h.permit_id='{token}' AND h.capacity_id=x.id AND x.unit='effect_chat_group_members_items'")
        denied(lambda:raw_request(2,{**create,"_budgetPermitId":token}))
        assert sql("SELECT count(*) FROM erp_private.chat_conversations WHERE name='Unfunded group'")=="0"
        assert sql(f"SELECT count(*) FROM erp_comm_cost.effect_claim WHERE permit_id='{token}'")=="0"
        assert sql("SELECT EXISTS(SELECT FROM erp_comm_cost.effect_claim WHERE effect='chat_attachments' AND items=1)")=="t"
        create["args"]["clientMutationId"]=str(uuid.uuid4())
        token=permit(2,"chat",create)
        sql(f"UPDATE erp_comm_cost.unit_hold h SET units=4 FROM erp_comm_cost.capacity x WHERE h.permit_id='{token}' AND h.capacity_id=x.id AND x.unit='effect_chat_scope_facts_items'")
        denied(lambda:raw_request(2,{**create,"_budgetPermitId":token}))
        assert sql("SELECT count(*) FROM erp_private.chat_conversations WHERE name='Unfunded group'")=="0"
        sql("INSERT INTO public.user_profiles(id,status,must_change_password,owner_company_id,branch_id,full_name) SELECT i,'active',false,10,11,'Member '||i FROM generate_series(10001,14096) i")
        bulk_args={"name":"Funded maximum batch","clientMutationId":str(uuid.uuid4()),"memberProfileIds":[str(i) for i in range(10001,14097)]}
        bulk={"op":"chat.groupCreate","args":bulk_args}
        token=permit(2,"chat",bulk)
        large=json.loads(raw_request(2,{**bulk,"_budgetPermitId":token}))
        assert sql(f"SELECT count(*) FROM erp_private.chat_memberships WHERE conversation='{large['id']}'")=="4097"
        assert sql(f"SELECT count(*) FROM erp_private.chat_messages WHERE conversation='{large['id']}' AND kind='notice'")=="4097"
        assert sql(f"SELECT items FROM erp_comm_cost.effect_claim WHERE permit_id='{token}' AND effect='chat_group_members'")=="4097"
        assert sql(f"SELECT items FROM erp_comm_cost.effect_claim WHERE permit_id='{token}' AND effect='chat_scope_facts'")=="4098"
        print("PASS 4096 requested group members plus creator physically covered, 4097 notices and 4098 raw sources")
        print("PASS member, source snapshot and attachment physical effects bound before writes")

        # Parallel identity change waits for the funded shared membership snapshot fence.
        def lock_group():
            return sql("BEGIN; SELECT pg_advisory_xact_lock_shared(hashtextextended('comms-scope-v1',0)); SELECT pg_advisory_xact_lock(72300491); SELECT pg_sleep(1.5); COMMIT")
        with concurrent.futures.ThreadPoolExecutor() as pool:
            fence=pool.submit(lock_group)
            for _ in range(20):
                if sql("SELECT EXISTS(SELECT FROM pg_locks WHERE locktype='advisory' AND objid=72300491)")=="t":
                    break
            else:
                raise AssertionError("Missing snapshot fence")
            changing=pool.submit(sql,"UPDATE public.user_profiles SET branch_id=12 WHERE id=14096")
            assert not changing.done()
            fence.result()
            changing.result()
        assert sql("SELECT revision FROM erp_private.comms_scope_watch WHERE profile_id=14096")=="1"

        group=mutation(2,"groupCreate",name="Generation test",memberProfileIds=["3"])
        group_id=group["id"]
        # Reconcile recorded transient assignments and role toggles using a complete funded source journal.
        denied(lambda:request(4,"historyCapacity",slotCount=4))
        for wrong in ["4",4097,0,1.25]:
            denied(lambda:request(1,"historyCapacity",slotCount=wrong))
        budget_command={"op":"chat.historyCapacity","args":{"slotCount":20}}
        token=permit(1,"chat",budget_command)
        denied(lambda:raw_request(1,{"op":"chat.historyCapacity","args":{"slotCount":21},"_budgetPermitId":token}))
        raw_request(1,{**budget_command,"_budgetPermitId":token})
        ep=sql(f"SELECT id FROM erp_private.chat_memberships WHERE conversation='{c}' AND profile_id=2")
        peer_ep=sql(f"SELECT id FROM erp_private.chat_memberships WHERE conversation='{c}' AND profile_id=3")
        assert request(5,"conversation",conversationId=c,mode="review")["id"]==c
        sql("INSERT INTO public.roles VALUES(51,'temporary',false,false); INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active) VALUES(2,51,10,12,true)")
        sql("UPDATE public.roles SET is_active=true WHERE id=51; UPDATE public.roles SET is_active=false WHERE id=51; DELETE FROM public.user_roles WHERE role_id=51")
        denied(lambda:request(5,"conversation",conversationId=c,mode="review"))
        denied(lambda:request(4,"scopeReconcile",episodeId=ep))
        request(1,"scopeReconcile",episodeId=ep)
        request(1,"scopeReconcile",episodeId=peer_ep)
        denied(lambda:request(5,"conversation",conversationId=c,mode="review"))
        sql("INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active) VALUES(5,2,10,12,true)")
        assert request(5,"conversation",conversationId=c,mode="review")["id"]==c
        assert sql("SELECT count(*) FROM erp_private.comms_history_slots WHERE subject IS NOT NULL")=="4"

        # Baseline ERP still commits unmetered when the finite history allotment expires or is paused.
        sql("INSERT INTO erp_comm_cost.pause(scope,feature,reason) VALUES('communications','chat','synthetic pause')")
        sql("UPDATE public.user_profiles SET branch_id=12 WHERE id=2; UPDATE public.user_profiles SET branch_id=11 WHERE id=2")
        dirty=sql("SELECT revision FROM erp_private.comms_scope_watch WHERE profile_id=2")
        sql("UPDATE public.user_profiles SET branch_id=12 WHERE id=2; UPDATE public.user_profiles SET branch_id=11 WHERE id=2")
        assert dirty==sql("SELECT revision FROM erp_private.comms_scope_watch WHERE profile_id=2")
        assert sql("SELECT count(*) FROM erp_private.comms_history_slots WHERE subject IS NOT NULL")=="4"
        sql("DELETE FROM erp_comm_cost.pause WHERE scope='communications' AND feature='chat'")
        assert request(1,"scopeReconcile",episodeId=ep)["history"]=="held"
        denied(lambda:request(5,"conversation",conversationId=c,mode="review"))
        assert request(1,"conversation",conversationId=c,mode="review")["id"]==c
        # Reactivation cannot restore an old group owner or affected group memberships.
        row_count=sql("SELECT count(*) FROM erp_private.chat_messages")
        sql("UPDATE public.user_profiles SET status='inactive' WHERE id=2; UPDATE public.user_profiles SET status='active' WHERE id=2")
        assert row_count==sql("SELECT count(*) FROM erp_private.chat_messages")
        denied(lambda:request(2,"conversation",conversationId=group_id,mode="participant"))
        assert not request(3,"conversation",conversationId=group_id,mode="participant").get("ownerProfileId")
        assert request(2,"conversation",conversationId=c,mode="participant")["id"]==c
        old_group_ep=sql(f"SELECT id FROM erp_private.chat_memberships WHERE conversation='{group_id}' AND profile_id=2")
        maintenance={"op":"chat.scopeReconcile","args":{"episodeId":old_group_ep}}
        ticket=permit(1,"chat",maintenance)
        sql(f"DELETE FROM erp_comm_cost.effect_limit WHERE operation_id='{ticket}' AND effect='scope_reconcile_work'")
        status=json.loads(raw_request(1,{**maintenance,"_budgetPermitId":ticket}))
        assert status["history"]=="held" and status["reason"]=="history_work_unfunded" and status["departureRecorded"]
        assert request(1,"scopeReconcile",episodeId=old_group_ep)["reason"]=="missing_historical_source"
        assert not request(1,"scopeReconcile",episodeId=old_group_ep)["departureRecorded"]
        assert request(3,"messages",conversationId=group_id,mode="participant")["items"][0]["body"].endswith("left the group")
        group=request(3,"conversation",conversationId=group_id,mode="participant")
        group_change(1,"replaceOwner",3)
        group_change(3,"add",2)
        assert not request(2,"conversation",conversationId=group_id,mode="participant")["canManageAdmins"]
        denied(lambda:request(5,"conversation",conversationId=c,mode="review"))
        print("PASS exact historical replay, inactive role transition, fail-closed missing evidence, one dirty invalidation, group generation and rejoin")
        # Terms rotation denies new sends without erasing permitted history.
        sql("UPDATE erp_private.comms_policy_versions SET is_current=false")
        denied(lambda:mutation(2,"send",conversationId=c,body="Requires current terms"))
        assert request(2,"messages",conversationId=c,mode="participant")["items"]
        print("PASS terminal attachment status, actor/session/member denial, compatibility and exact attached send replay")
        print("PASS chat sessions, cross-company reviewer, membership history, moderation, replay, simultaneous sends, independent media, presence, receipts, sync and exports")
    finally:
        pg("pg_ctl","-D",cluster,"-m","fast","-w","stop")
        shutil.rmtree(directory)

if __name__=="__main__":
    try:
        run("--without-upload-retry-status" in sys.argv[1:])
    except subprocess.CalledProcessError as error:
        print(error.stderr)
        raise
