"""Run against a fresh localhost PostgreSQL instance with synthetic ERP rows."""
import concurrent.futures
import json
import os
import pathlib
import secrets
import shutil
import socket
import subprocess
import tempfile
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20261123094907_erp_communications_chat_v1.sql"
PGBIN = pathlib.Path(os.environ.get("PG_BIN", "C:/Program Files/PostgreSQL/17/bin"))
EXE = ".exe" if os.name == "nt" else ""

def pg(tool, *args, **options):
    if tool == "pg_ctl":
        subprocess.run([str(PGBIN / (tool + EXE)), *map(str,args)], check=True, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return ""
    return subprocess.run([str(PGBIN / (tool + EXE)), *map(str, args)], check=True, text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, **options).stdout

def run():
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
            assert any(s in error.stderr for s in ["unavailable","denied","required","permission","conflict","window","Invalid size"]),error.stderr
        else:
            raise AssertionError("Expected denial")

    try:
        sql((ROOT/"tests/communications/chat_fixture.sql").read_text())
        sql(MIGRATION.read_text(encoding="utf-8-sig"))
        sql((ROOT/"supabase/migrations/20261123095158_erp_communication_budget_v1.sql").read_text(encoding="utf-8-sig"))
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
        group_change(2,"remove",6)
        denied(lambda:request(6,"messages",conversationId=group_id,mode="participant"))
        denied(lambda:request(5,"messages",conversationId=group_id,mode="review"))
        media=mutation(2,"uploadBegin",conversationId=c,filename="note.ogg",mime="audio/ogg",byteLength=4,kind="voice")
        upload=media["uploadId"]
        def rpc(role,actor,call,feature,op,args):
            ticket=permit(actor,feature,{"op":op,"args":args})
            call=call[:-1]+f",'{ticket}')"
            return json.loads(sql(f"SET ROLE {role}; SET test.actor='{actor}'; SELECT {call};"))
        binding=rpc("authenticated",2,f"public.erp_chat_upload_bind('{upload}')","media_upload","chat.uploadBind",{"uploadId":upload})
        denied(lambda:rpc("authenticated",3,f"public.erp_chat_upload_bind('{upload}')","media_upload","chat.uploadBind",{"uploadId":upload}))
        checksum="a"*64
        confirm=f"public.erp_chat_upload_verified('{upload}',2,'{binding['sessionId']}',4,'audio/ogg','{checksum}')"
        verified_args={"uploadId":upload,"actorId":"2","sessionId":binding["sessionId"],"byteLength":4,"mime":"audio/ogg","sha256":checksum}
        denied(lambda:rpc("authenticated",2,confirm,"media_upload","chat.uploadVerified",verified_args))
        sql(f"""INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('erp-chat-media','{upload}','{{"size":4,"mimetype":"audio/ogg"}}')""")
        assert rpc("service_role",2,confirm,"media_upload","chat.uploadVerified",verified_args)["state"]=="verified"
        original=mutation(2,"send",conversationId=c,body="Voice note",uploadIds=[upload])
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
        sync=request(3,"sync",cursors=[{"conversationId":c,"changeSeq":"0"}],limit=2)
        assert sync["changes"] and sync["conversations"] and sync["hasMore"]
        assert group_id in request(6,"sync",cursors=[{"conversationId":group_id,"changeSeq":"0"}])["revokedConversationIds"]
        mutation(2,"delete",messageId=copied["id"],expectedRevision="1")
        group_change(2,"leave")
        group_change(1,"replaceOwner",3)
        assert request(3,"conversations",mode="participant")["items"]
        denied(lambda:sql("SET ROLE authenticated; SELECT body FROM erp_private.chat_messages"))
        # An unrelated permissive object policy must not open the private chat bucket.
        sql("GRANT USAGE ON SCHEMA storage TO authenticated; GRANT SELECT ON storage.objects TO authenticated; CREATE POLICY unrelated_fixture ON storage.objects FOR SELECT TO authenticated USING(true); INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('other-app','visible','{}')")
        assert sql("SET ROLE authenticated; SELECT string_agg(name,',') FROM storage.objects")=="visible"
        # Bounds are checked in the DB even if HTTP validation is bypassed.
        denied(lambda:mutation(2,"uploadBegin",conversationId=c,filename="x.ogg",mime="audio/ogg",byteLength=52428801))
        exact=mutation(2,"uploadBegin",conversationId=c,filename="x.ogg",mime="audio/ogg",byteLength=52428800)
        assert exact["byteLength"]==52428800
        # A subsequent message cannot push a repeated item onto page two.
        pg1=request(2,"messages",conversationId=c,mode="participant",limit=1)
        mutation(3,"send",conversationId=c,body="Arrived during paging")
        pg2=request(2,"messages",conversationId=c,mode="participant",cursor=pg1["nextCursor"],limit=1)
        assert int(pg2["items"][0]["seq"])<int(pg1["items"][0]["seq"])
        # Terms rotation denies new sends without erasing permitted history.
        sql("UPDATE erp_private.comms_policy_versions SET is_current=false")
        denied(lambda:mutation(2,"send",conversationId=c,body="Requires current terms"))
        assert request(2,"messages",conversationId=c,mode="participant")["items"]
        print("PASS chat sessions, cross-company reviewer, membership history, moderation, replay, simultaneous sends, independent media, presence, receipts, sync and exports")
    finally:
        pg("pg_ctl","-D",cluster,"-m","fast","-w","stop")
        shutil.rmtree(directory)

if __name__=="__main__":
    try:
        run()
    except subprocess.CalledProcessError as error:
        print(error.stderr)
        raise
