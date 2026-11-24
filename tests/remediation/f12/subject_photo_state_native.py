"""Replay HR photo RPCs in isolated PostgreSQL. Run with --without-fix for RED."""

import argparse
import json
from pathlib import Path
import subprocess
from time import monotonic, sleep
from uuid import uuid4


MIGRATIONS = Path(__file__).resolve().parents[3] / "supabase" / "migrations"
FIX = "20261124150625_hr_subject_photo_state_exact_read.sql"
IMAGE = "postgres@sha256:ff87138949ad9a46f32ff23bd6852b52ce024a13dffe9b4087be98292cdd3b4f"
F12 = "public.f12_subject_photo(bigint,bigint,bigint,text,bigint)"
STATE = "public.hr_subject_photo_state(bigint,bigint)"
ACTOR = """
set role authenticated;
set fixture.active='on';
set fixture.session='on';
set fixture.scopes='[[1,11],[2,21]]';
set fixture.permissions='hr.employees.view,hr.compliance.view,dms.documents.view,dms.documents.preview,dms.documents.download';
"""
# The public RPCs are verbatim historical SQL. The principal and point-permission
# helpers below model exact scopes. Delaying permission checks under load makes
# the extra round of document reads deterministic without relying on host speed.
FIXTURE = """
create role anon;
create role authenticated;
create role service_role;
create schema erp_private;
grant usage on schema erp_private to authenticated;

create table public.employees(id bigint primary key,owner_company_id bigint,branch_id bigint,deleted_at timestamptz,photo_dms_document_id bigint,photo_framing jsonb);
create table public.employee_dependents(id bigint primary key,employee_id bigint,deleted_at timestamptz,photo_dms_document_id bigint,photo_framing jsonb);
create table public.dms_documents(id bigint primary key,document_no text,current_version_id bigint,deleted_at timestamptz,is_archived boolean default false,owning_company_id bigint,owning_branch_id bigint,restricted boolean default false);
create table public.dms_document_versions(id bigint primary key,document_id bigint,unlinked_at timestamptz);
create table public.dms_document_files(id bigint primary key,document_id bigint,version_id bigint,deleted_at timestamptz,file_role text,mime_type text,integrity_status text,file_size_bytes bigint,sha256_hash text);
create table public.dms_document_links(document_id bigint,entity_type text,entity_id bigint,deleted_at timestamptz);
grant select on public.employees,public.employee_dependents,public.dms_documents,public.dms_document_versions,public.dms_document_files,public.dms_document_links to authenticated;

create function erp_private.business_principal_is_active() returns boolean language sql stable
as $$select coalesce(current_setting('fixture.active',true)='on' and current_setting('fixture.session',true)='on',false)$$;
create function erp_private.fixture_has(code text) returns boolean language sql stable
as $$select coalesce(code=any(string_to_array(current_setting('fixture.permissions',true),',')),false)$$;
create function erp_private.fixture_scope(company bigint,branch bigint) returns boolean language sql stable
as $$select exists(select 1 from jsonb_array_elements(current_setting('fixture.scopes',true)::jsonb) s where (s->>0)::bigint=company and ((s->>1)::bigint=branch or branch is null))$$;
create function erp_private.employee_permission(employee bigint,code text) returns boolean language sql stable security definer set search_path=''
as $$select erp_private.business_principal_is_active() and erp_private.fixture_has(code) and exists(select 1 from public.employees e where id=employee and deleted_at is null and erp_private.fixture_scope(e.owner_company_id,e.branch_id))$$;
create function public.current_user_can_view_employee(employee bigint) returns boolean language sql stable
as $$select erp_private.employee_permission(employee,'hr.employees.view')$$;
create function erp_private.document_permission(document bigint,code text) returns boolean language plpgsql stable security definer set search_path=''
as $$begin
  if code in ('dms.documents.view','dms.documents.preview') and current_setting('fixture.slow',true)='on' then perform pg_sleep(0.02); end if;
  return erp_private.business_principal_is_active() and erp_private.fixture_has(code)
    and exists(select 1 from public.dms_documents d where id=document and erp_private.fixture_scope(d.owning_company_id,d.owning_branch_id)
      and (not restricted or erp_private.fixture_has('dms.documents.confidential')));
end$$;

alter table public.employees enable row level security;
create policy employees_scoped on public.employees for select to authenticated using (public.current_user_can_view_employee(id));
alter table public.employee_dependents enable row level security;
create policy dependents_scoped on public.employee_dependents for select to authenticated using (erp_private.employee_permission(employee_id,'hr.compliance.view'));
alter table public.dms_documents enable row level security;
create policy documents_scoped on public.dms_documents for select to authenticated
using (erp_private.fixture_scope(owning_company_id,owning_branch_id) and (not restricted or erp_private.fixture_has('dms.documents.confidential')));

insert into public.employees values
  (1,1,11,null,120,'{"version":1}'), (2,1,11,null,null,null), (3,1,12,null,123,null),
  (4,2,21,null,124,null), (5,2,11,null,null,null), (6,1,11,now(),null,null),
  (7,1,11,null,125,null), (8,1,11,null,126,null), (9,1,11,null,127,null),
  (10,1,11,null,128,null), (11,1,11,null,129,null), (12,1,11,null,130,null);
insert into public.employee_dependents values (21,1,null,121,null),(22,1,null,null,null),(23,2,null,null,null),(24,1,now(),null,null);
insert into public.dms_documents(id,document_no,current_version_id,owning_company_id,owning_branch_id)
  select i,'Photo '||i,i+1000,case when i=124 then 2 else 1 end,
    case i when 123 then 12 when 124 then 21 else 11 end from generate_series(40,130) i;
update public.dms_documents set restricted=true where id=125;
update public.dms_documents set is_archived=true where id=126;
insert into public.dms_document_versions(id,document_id) select current_version_id,id from public.dms_documents;
update public.dms_document_versions set unlinked_at=now() where document_id=130;
insert into public.dms_document_files
  select id+2000,id,current_version_id,null,'original','image/jpeg','verified',42,repeat('a',64) from public.dms_documents;
insert into public.dms_document_files select 99,document_id,version_id,deleted_at,file_role,mime_type,integrity_status,file_size_bytes,sha256_hash from public.dms_document_files where document_id=127;
update public.dms_document_files set integrity_status='pending' where document_id=129;
insert into public.dms_document_links select i,'employee',1,null from generate_series(40,120) i;
insert into public.dms_document_links select i,'employee',2,null from generate_series(40,119) i;
insert into public.dms_document_links values (121,'employee_dependent',21,null),(123,'employee',3,null),(124,'employee',4,null),
  (125,'employee',7,null),(126,'employee',8,null),(127,'employee',9,null),(128,'employee',9,null),(129,'employee',11,null),(130,'employee',12,null);
analyze;
"""


def migrated_function(filename, function):
    migration = (MIGRATIONS / filename).read_text(encoding="utf-8-sig")
    start = migration.index(f"CREATE FUNCTION public.{function}(")
    acl_end = migration.index("TO authenticated;", start) + len("TO authenticated;")
    return migration[start:acl_end]


def run(without_fix):
    name = f"algt-hr-photo-fixture-{uuid4().hex[:10]}"

    def docker(*args, data=None, check=True):
        result = subprocess.run(["docker", *args], input=data.encode() if data is not None else None, capture_output=True)
        result.stdout = result.stdout.decode()
        result.stderr = result.stderr.decode()
        if check and result.returncode:
            raise RuntimeError(result.stderr or result.stdout)
        return result

    def sql(query, check=True):
        return docker("exec", "-i", name, "psql", "-h", "127.0.0.1", "-U", "postgres", "-XqAt",
                      "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", data=query, check=check)

    def value(query):
        return sql(query).stdout.strip()

    def state(employee, dependent="null", setup=""):
        return json.loads(value(ACTOR + setup + f"select public.hr_subject_photo_state({employee},{dependent});"))

    def denied(query, setup="", actor=ACTOR):
        result = sql(actor + setup + query, check=False)
        assert result.returncode and "42501" in result.stderr, result.stderr

    docker("run", "--rm", "-d", "--network", "none", "--name", name, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", IMAGE)
    try:
        deadline = monotonic() + 40
        while docker("exec", name, "pg_isready", "-q", "-h", "127.0.0.1", check=False).returncode:
            assert monotonic() < deadline, "Isolated PostgreSQL startup timed out"
            sleep(0.25)

        sql(FIXTURE)
        sql(migrated_function("20261022125651_f12_workforce_notifications_photos.sql", "f12_subject_photo"))
        sql(migrated_function("20261025110421_hr_subject_photo_framing.sql", "hr_subject_photo_state"))
        assert value(f"select md5(prosrc) from pg_proc where oid='{F12}'::regprocedure;") == "8ce693a76db80ebed295c80220e4bbe4"
        assert value(f"select md5(prosrc) from pg_proc where oid='{STATE}'::regprocedure;") == "a725c3833d9284778193d4a23bb3aaca"
        contract = f"select (to_jsonb(p)-'prosrc')::text from pg_proc p where oid='{STATE}'::regprocedure;"
        f12_definition = f"select pg_get_functiondef('{F12}'::regprocedure);"
        before = (value(contract), value(f12_definition))
        if not without_fix:
            sql((MIGRATIONS / FIX).read_text(encoding="utf-8-sig"))
        assert (value(contract), value(f12_definition)) == before

        assert state(1) == {"documentId": 120, "framing": {"version": 1}, "photo": {
            "document_id": 120, "version_id": 1120, "file_id": 2120, "label": "Photo 120"}, "canDownload": True}
        blank = {"documentId": None, "framing": None, "photo": None, "canDownload": False}
        assert state(2) == state(1, 22) == blank
        assert state(1, 21)["photo"]["document_id"] == 121
        assert state(4)["photo"]["document_id"] == 124
        for employee, document in enumerate(range(125, 131), 7):
            assert state(employee) == {**blank, "documentId": document}
        preview = "set fixture.permissions='hr.employees.view,dms.documents.view,dms.documents.preview';"
        assert state(1, setup=preview)["photo"]["document_id"] == 120
        assert state(1, setup=preview)["canDownload"] is False
        assert state(1, setup=preview.replace("dms.documents.preview", "dms.documents.download"))["photo"] is None
        for employee, dependent in [(3, "null"), (5, "null"), (6, "null"), (1, 23), (1, 24), (1, 999)]:
            denied(f"select public.hr_subject_photo_state({employee},{dependent});")
        denied("select public.hr_subject_photo_state(1,22);", preview)
        for setting in ["set fixture.active='off';", "set fixture.session='off';", "set fixture.scopes='[[2,21]]';"]:
            for employee in [1, 2]:
                denied(f"select public.hr_subject_photo_state({employee});", setting)
        for role in ["anon", "service_role"]:
            denied("select public.hr_subject_photo_state(1);", actor=f"set role {role};")

        chooser = json.loads(value(ACTOR + "select public.f12_subject_photo(1,null,null,'Photo',90);"))
        assert len(chooser) == 26 and chooser[0]["document_id"] == 91 and chooser[-1]["document_id"] == 116
        assert json.loads(value(ACTOR + "select public.f12_subject_photo(1,null,120);")) == [state(1)["photo"]]
        print("PASS RPC definitions, photo states, eligibility, chooser pagination, employee/dependent scope, and session guards", flush=True)

        load = "set fixture.slow='on';set statement_timeout='600ms';"
        for employee in [2, 1, 2, 1, 2, 1]:
            result = sql(ACTOR + load + f"select public.hr_subject_photo_state({employee});", check=False)
            if result.returncode:
                print(result.stderr.strip(), flush=True)
                if "57014" in result.stderr and "f12_subject_photo(p_employee,p_dependent,NULL)" in result.stderr:
                    raise AssertionError(f"Photo state for employee {employee} timed out enumerating unselected documents")
                raise RuntimeError(result.stderr)
            payload = json.loads(result.stdout)
            assert payload == (blank if employee == 2 else state(employee))
        print("PASS all six selected and no-photo reads under the unchanged fixture timeout")
    finally:
        docker("stop", "-t", "2", name, check=False)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--without-fix", action="store_true")
    run(parser.parse_args().without_fix)
