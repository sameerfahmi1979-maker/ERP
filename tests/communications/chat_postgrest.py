"""Exercise raw anonymous/authenticated PostgREST against disposable local SQL fixtures.

Uses only locally cached images and a private Docker network with no published ports.
"""
import base64
import hashlib
import hmac
import json
import os
import pathlib
import secrets
import subprocess
import time

import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
POSTGRES = "public.ecr.aws/supabase/postgres:17.6.1.127"
REST = "public.ecr.aws/supabase/postgrest:v14.10"

def docker(*args, data=None, extra=None):
    return subprocess.run(["docker",*args],input=data,text=True,capture_output=True,check=True,
                          env={**os.environ,**(extra or {})},timeout=90).stdout.strip()

def b64(value):
    return base64.urlsafe_b64encode(value).decode().rstrip("=")

def signed(secret,role,profile):
    header=b64(b'{"alg":"HS256","typ":"JWT"}')
    claims=b64(json.dumps({"role":role,"sub":str(uuid.UUID(int=profile)),"session_id":str(uuid.UUID(int=profile)),
                           "exp":int(time.time())+300}).encode())
    sig=b64(hmac.new(secret.encode(),(header+"."+claims).encode(),hashlib.sha256).digest())
    return header+"."+claims+"."+sig

def run():
    tag="erp-chat-fixture-"+uuid.uuid4().hex[:12]
    network=tag+"-isolated"
    db=tag+"-pg"
    rest=tag+"-rest"
    secret=secrets.token_hex(32)
    credential=secrets.token_hex(24)
    made=[]
    def sql(statement):
        return docker("exec","-i",db,"psql","-h","/tmp","-U","postgres","-d","postgres","-XqAt","-v","ON_ERROR_STOP=1",data=statement)
    try:
        docker("network","create","--internal",network)
        made.append(("network","rm",network))
        docker("run","--detach","--pull","never","--name",db,"--network",network,
               "--user","postgres","--tmpfs","/tmp:rw,exec,mode=1777","--entrypoint","/bin/sh",POSTGRES,"-ec",
               'initdb -D /tmp/db -U postgres --auth-local=trust --auth-host=scram-sha-256 --no-locale >/dev/null; '
               'echo "host all all all scram-sha-256" >>/tmp/db/pg_hba.conf; exec postgres -D /tmp/db -h "*" -k /tmp')
        made.append(("rm","-f",db))
        for _ in range(100):
            try:
                if sql("select 1")=="1":break
            except subprocess.CalledProcessError:
                time.sleep(.2)
        else: raise RuntimeError("Synthetic PostgreSQL did not start")
        sql((ROOT/"tests/communications/chat_fixture.sql").read_text())
        for migration in ["20261123094907_erp_communications_chat_v1.sql","20261123095158_erp_communication_budget_v1.sql"]:
            contents=(ROOT/"supabase/migrations"/migration).read_bytes()
            sql(contents.decode("utf-8-sig"))
            print("Applied synthetic",migration,hashlib.sha256(contents).hexdigest(),flush=True)
        sql(f"""CREATE ROLE fixture_rest LOGIN NOINHERIT PASSWORD '{credential}';
          GRANT authenticated,anon TO fixture_rest; GRANT USAGE ON SCHEMA public TO authenticated,anon;
          CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $x$ SELECT current_setting('request.jwt.claims',true)::jsonb $x$;
          CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $x$ SELECT (auth.jwt()->>'sub')::uuid $x$;
          CREATE OR REPLACE FUNCTION public.f03_current_session_valid() RETURNS boolean LANGUAGE sql STABLE AS $x$ SELECT auth.uid() IS NOT NULL AND auth.jwt()->>'session_id'=auth.uid()::text $x$;
          UPDATE erp_comm_cost.authority SET owner_auth_id=lpad('1',32,'0')::uuid,owner_binding_evidence='synthetic fixture';""")
        # Both services communicate exclusively over the isolated fixture network.
        docker("run","--detach","--pull","never","--name",rest,"--network",network,
               "-e","PGRST_DB_URI","-e","PGRST_JWT_SECRET","-e","PGRST_DB_ANON_ROLE=anon",REST,
               extra={"PGRST_DB_URI":f"postgres://fixture_rest:{credential}@{db}:5432/postgres","PGRST_JWT_SECRET":secret})
        made.append(("rm","-f",rest))
        address=f"http://{rest}:3000"
        def http(path,payload=None,actor=None):
            args=["exec","-i",db,"curl","--noproxy","*","-sS","--max-time","5","-w","\\n%{http_code}","-H","Content-Type: application/json"]
            if actor is not None:
                args+=["-H","Authorization: Bearer "+signed(secret,"authenticated",actor)]
            if payload is not None:args+=["--data-binary","@-"]
            output=docker(*args,address+path,data=json.dumps(payload) if payload is not None else "")
            body,status=output.rsplit("\n",1)
            return int(status),json.loads(body)
        for _ in range(70):
            try:
                code,_=http("/")
                if code==200:break
            except (OSError,ValueError,subprocess.CalledProcessError):pass
            time.sleep(.2)
        else: raise RuntimeError("Synthetic PostgREST did not start")
        def call(actor,op,args,ticket=None):
            cmd={"op":op,"args":args}
            if ticket:cmd["_budgetPermitId"]=ticket
            return http("/rpc/erp_chat_v1",{"p_request":cmd},actor)
        assert call(None,"chat.actor",{})[0] in (401,403,404)
        assert call(2,"communications.profile",{})[0]==200
        assert call(2,"chat.directory",{})[0] in (403,503)
        assert http("/chat_messages?select=*",actor=2)[0] in (401,403,404)
        unknown=str(uuid.uuid4())
        internal={"erp_chat_stage_open":{"p_upload":unknown,"p_actor":2,"p_session":unknown,"p_permit":unknown},
                  "erp_chat_stage_abort":{"p_upload":unknown,"p_actor":2,"p_session":unknown},
                  "erp_chat_stage_claim":{"p_worker":unknown,"p_boot":unknown,"p_attempt":unknown,"p_until":"2099-01-01T00:00:00Z"},
                  "erp_chat_stage_finish":{"p_upload":unknown,"p_attempt":unknown,"p_absent":True},
                  "erp_chat_upload_verified":{"p_upload":unknown,"p_actor":2,"p_session":unknown,"p_size":1,"p_mime":"audio/ogg","p_sha256":"a"*64,"p_permit":unknown}}
        for name,params in internal.items():
            assert http("/rpc/"+name,params,actor=2)[0] in (401,403,404),name
        sql("UPDATE erp_private.comms_chat_gate SET enabled=true")
        assert call(2,"chat.directory",{})[0] in (403,503)
        command={"op":"chat.directory","args":{}}
        ticket=sql("select public.fixture_chat_permit(2,'chat','"+json.dumps(command)+"')")
        assert call(3,"chat.directory",{},ticket)[0] in (403,503)
        assert call(2,"chat.directory",{"query":"different"},ticket)[0] in (403,503)
        code,result=call(2,"chat.directory",{},ticket)
        assert code==200 and len(result["items"])>1,(code,result)
        assert call(2,"chat.directory",{},ticket)[0] in (403,503)
        print("PASS raw PostgREST anonymous, held, capability-only bootstrap, table isolation, request/user binding and one-use permits")
    finally:
        for args in reversed(made):
            docker(*args)

if __name__=="__main__":
    try:run()
    except subprocess.CalledProcessError as failure:
        print(failure.stderr)
        raise SystemExit(failure.returncode)
