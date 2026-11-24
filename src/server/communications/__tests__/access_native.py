"""Exercise the checked actor/directory RPC in disposable localhost PostgreSQL."""
import importlib.util
import hashlib
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[4]
CHAT_TESTS = ROOT / "tests" / "communications"
SPEC = importlib.util.spec_from_file_location("chat_native", CHAT_TESTS / "chat_native.py")
postgres = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(postgres)


def test(sql):
    sql((CHAT_TESTS / "chat_fixture.sql").read_text(encoding="utf-8-sig"))
    sql("""
        CREATE TABLE auth.users(id uuid PRIMARY KEY, deleted_at timestamptz, banned_until timestamptz);
        CREATE TABLE auth.sessions(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users, not_after timestamptz);
        INSERT INTO auth.users(id) SELECT auth_user_id FROM public.user_profiles;
        INSERT INTO auth.sessions SELECT gen_random_uuid(), id, now()+interval '1 hour' FROM auth.users;
        CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
          $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
          $$ SELECT (auth.jwt()->>'sub')::uuid $$;
        CREATE TABLE IF NOT EXISTS public.role_permissions(role_id bigint, permission_id bigint);
        CREATE TABLE IF NOT EXISTS public.permissions(id bigint PRIMARY KEY,permission_code text,is_active boolean);
        ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS reporting_manager_id bigint;
        CREATE OR REPLACE FUNCTION public.current_user_profile_id() RETURNS bigint LANGUAGE sql STABLE AS
          $$ SELECT id FROM public.user_profiles WHERE auth_user_id=auth.uid() $$;
        CREATE OR REPLACE FUNCTION public.current_user_is_global_admin() RETURNS boolean LANGUAGE sql STABLE AS
          $$ SELECT EXISTS(SELECT FROM public.user_roles a JOIN public.roles r ON r.id=a.role_id
          WHERE a.user_profile_id=public.current_user_profile_id() AND a.is_active AND r.is_active
          AND r.role_code IN ('system_admin','group_admin') AND a.owner_company_id IS NULL AND a.branch_id IS NULL) $$;
        """)
    migrations = ROOT / "supabase" / "migrations"
    sql((migrations / "20260923062254_f03_auth_principal_and_lifecycle.sql").read_text(encoding="utf-8-sig"))
    # Exercise the ERP's actual subject/scope predicate against the synthetic fixture.
    scope_source = (migrations / "20260923073856_f03_identity_transfer_and_issued_file_scope.sql").read_text()
    start = scope_source.index("CREATE OR REPLACE FUNCTION erp_private.employee_permission(")
    sql(scope_source[start:scope_source.index("$$;", start) + 3])
    migration_bytes = postgres.MIGRATION.read_bytes()
    sql(migration_bytes.decode("utf-8-sig"))
    sql("""
        INSERT INTO public.permissions VALUES (700,'hr.employees.view',true);
        INSERT INTO public.role_permissions VALUES (2,700);
        INSERT INTO public.employees(id,owner_company_id,branch_id,full_name_en) VALUES
        (902,10,11,'Official A1'),(903,20,21,'Official B1'),(906,10,12,'Official A2');
        INSERT INTO public.erp_user_employee_links(user_profile_id,employee_id) VALUES (2,902),(3,903),(6,906);
        UPDATE public.user_profiles SET branch_id=12 WHERE id=6;
        """)
    sessions = json.loads(sql("""SELECT jsonb_object_agg(p.id,jsonb_build_object('sub',u.id,'session_id',s.id))
        FROM public.user_profiles p JOIN auth.users u ON u.id=p.auth_user_id JOIN auth.sessions s ON s.user_id=u.id"""))

    def request(who, operation, **args):
        claims = json.dumps(sessions[str(who)]).replace("'", "''")
        command = json.dumps({"op": "chat." + operation, "args": args}).replace("'", "''")
        result = sql(f"SET ROLE authenticated; SET request.jwt.claims='{claims}'; SELECT public.erp_chat_v1('{command}'::jsonb);")
        return json.loads(result) if result else None

    def denied(who):
        try:
            request(who, "actor")
        except subprocess.CalledProcessError as err:
            assert "Active session required" in err.stderr, err.stderr
            return
        raise AssertionError("An invalid session or disabled account resolved a communications actor")

    actor = request(1, "actor")
    assert actor["isGlobalSystemAdmin"] and actor["authSessionId"] == sessions["1"]["session_id"]
    assert not request(4, "actor")["isGlobalSystemAdmin"]  # legacy group_admin
    sql("UPDATE public.user_roles SET owner_company_id=10 WHERE user_profile_id=1")
    assert not request(1, "actor")["isGlobalSystemAdmin"]
    assert request(2, "linkedIdentity", employeeId="902")["profileId"] == "2"
    assert request(2, "linkedIdentity", employeeId="903") is None
    assert request(2, "linkedIdentity", employeeId="906") is None
    assert request(5, "linkedIdentity", employeeId="903")["profileId"] == "3"
    assert request(5, "linkedIdentity", employeeId="906") is None
    directory = request(2, "directory", query="Official B1")
    assert directory["items"] == [{"name": "Official B1", "profileId": "3", "companyName": "B", "branchName": "B1"}]
    assert request(2, "avatarBinding", profileId="3") is None
    sql("UPDATE public.employees SET branch_id=12 WHERE id=902")
    assert request(2, "linkedIdentity", employeeId="902") is None
    assert not request(2, "directory", query="Official A1")["items"]
    assert request(2, "directory", query="User 2")["items"][0]["profileId"] == "2"
    sql("UPDATE public.user_profiles SET must_change_password=true WHERE id=6")
    denied(6)
    sql("UPDATE public.user_profiles SET status='suspended' WHERE id=5")
    denied(5)
    sql(f"UPDATE auth.sessions SET not_after=now() WHERE id='{sessions['3']['session_id']}'")
    denied(3)
    original = sessions["4"]["session_id"]
    sessions["4"]["session_id"] = str(uuid.uuid4())
    denied(4)
    sessions["4"]["session_id"] = original
    sql(f"DELETE FROM auth.sessions WHERE id='{original}'")
    denied(4)
    print("PASS exact reserved administrator, cross-company directory, sibling branch denial, verified link/transfer, forced change, suspension, expired/missing/revoked Auth session")
    print("Chat migration SHA-256:", hashlib.sha256(migration_bytes).hexdigest())


def run():
    scratch = ROOT / "tmp"
    scratch.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="communications-identity-", dir=scratch) as tmp:
        directory = Path(tmp)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        password = secrets.token_urlsafe(32)
        passwd = directory / "pw"
        passwd.write_text(password, encoding="ascii")
        cluster = directory / "data"
        postgres.pg("initdb", "-D", cluster, "-U", "postgres", "-A", "scram-sha-256", "--pwfile", passwd, "-E", "UTF8", "--no-locale")
        passwd.unlink()
        postgres.pg("pg_ctl", "-D", cluster, "-l", directory / "server.log", "-o", f"-h 127.0.0.1 -p {port}", "-w", "start")
        try:
            def sql(statement):
                return postgres.pg("psql", "-XqAt", "-h", "127.0.0.1", "-p", port, "-U", "postgres",
                                   "-v", "ON_ERROR_STOP=1", "-d", "postgres", input=statement,
                                   env={**os.environ, "PGPASSWORD": password}).strip()
            for attempt in range(20):
                try:
                    sql("SELECT 1")
                    break
                except subprocess.CalledProcessError as err:
                    if "starting up" not in err.stderr or attempt == 19:
                        raise
                    time.sleep(0.25)
            test(sql)
        finally:
            postgres.pg("pg_ctl", "-D", cluster, "-m", "fast", "-w", "stop")


if __name__ == "__main__":
    try:
        run()
    except subprocess.CalledProcessError as err:
        raise SystemExit(err.stderr) from err
