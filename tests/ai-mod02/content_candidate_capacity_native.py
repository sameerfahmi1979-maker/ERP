"""Real public RPC + current protected reader in isolated synthetic PostgreSQL 17.10.

--without-fix proves selective content search expands all authorized document rows.
Native nested EXPLAIN measures rows, not a mock or a raised timeout threshold.
Owning identity/HR/Fleet permission helpers below are controlled exact-scope fixtures;
this is regression evidence, not live end-user acceptance. No network/provider use.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
SIGNATURE = 'public.ai_mod02_search_documents(text,boolean,text,bigint,bigint[],text,text,jsonb)'
READER = 'erp_private.read_documents_matching(bigint[],text[],text[],bigint[],text,tsquery)'


def text(name):
    return (ROOT / 'supabase/migrations' / name).read_text(encoding='utf-8-sig')


def source_function(source, name, tag='$$'):
    start = source.index('CREATE FUNCTION ' + name + '(')
    end = source.index(tag + ';', source.index('AS ' + tag, start)) + len(tag) + 1
    return source[start:end]


def current_sources():
    original = text('20261030143220_ai_mod02_shared_document_search.sql')
    query = source_function(original, 'public.ai_mod02_text_query')
    rpc = source_function(original, 'public.ai_mod02_search_documents')
    capacity = text('20261113200139_dms_document_search_capacity.sql')
    new_call = "FROM erp_private.read_documents_matching(NULL,NULL,NULL,document_type_ids,\n      CASE WHEN reference_only THEN lower(btrim(text_query)) END,\n      CASE WHEN NOT reference_only AND include_content IS NOT TRUE THEN search_query END) d"
    assert rpc.count('FROM public.f03_read_documents() d') == 1
    rpc = rpc.replace('FROM public.f03_read_documents() d', new_call)
    reader = source_function(capacity, 'erp_private.read_documents_matching', '$reader$')
    # Reconstruct precisely the two already-applied Fleet set-reader changes from
    # their literal migration anchors, rather than substituting a visibility mock.
    fleet = text('20261119115600_fleet_t05_scope_and_identifier_retention.sql')
    match = re.search(r"start_replacement constant text:='((?:[^']|'')*)';", fleet)
    assert match
    fleet_cte = match.group(1).replace("''", "'")
    assert reader.count('WITH ') == 1
    reader = reader.replace('WITH ', fleet_cte, 1)
    anchor = 'WHERE actor.uid IS NOT NULL AND actor.active AND d.deleted_at IS NULL'
    assert reader.count(anchor) == 1
    reader = reader.replace(anchor, anchor + ' AND NOT EXISTS (SELECT 1 FROM fleet_blocked fb WHERE fb.id=d.id)')
    return query, rpc, reader


FIXTURE = r"""
create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create schema erp_private;
create function auth.uid()returns uuid language sql stable as $$select'00000000-0000-0000-0000-000000000001'::uuid$$;
create function public.f03_current_session_valid()returns boolean language sql stable as $$select current_setting('test.session',true)='true'$$;
create function erp_private.business_principal_is_active()returns boolean language sql stable as $$select public.f03_current_session_valid()and current_setting('test.active',true)='true'$$;
create function public.current_user_profile_id()returns bigint language sql stable as $$select 1::bigint$$;
create function public.current_user_is_global_admin()returns boolean language sql stable as $$select current_setting('test.global',true)='true'$$;
create function public.current_user_has_permission_any_scope(code text)returns boolean language sql stable as $$select code=any(string_to_array(current_setting('test.permissions',true),','))$$;
create function erp_private.fixture_scope(company bigint,branch bigint)returns boolean language sql stable as $$select exists(select from jsonb_array_elements(current_setting('test.scopes',true)::jsonb)a where(a->>0)::bigint=company and(a->>1)::bigint=branch)$$;
create view public.user_roles as select 1::bigint user_profile_id,1::bigint role_id,(a->>0)::bigint owner_company_id,(a->>1)::bigint branch_id,true is_active from jsonb_array_elements(current_setting('test.scopes',true)::jsonb)a;
create view public.roles as select 1::bigint id,true is_active;
create view public.permissions as select n::bigint id,code permission_code,true is_active from unnest(string_to_array(current_setting('test.permissions',true),','))with ordinality t(code,n);
create view public.role_permissions as select 1::bigint role_id,id permission_id from public.permissions;
create table public.dms_documents(id bigint primary key,document_no text,title text,description text,legacy_document_code text,document_type_id bigint,owning_company_id bigint,owning_branch_id bigint,party_id bigint,deleted_at timestamptz,status text,is_archived boolean,expiry_date date,content_tsv tsvector,ai_summary text,summary_embedding text,ai_summary_error text,summary_embedding_error text,ai_warnings_json jsonb,ai_risk_reasons_json jsonb);
create table public.dms_document_content(id bigint primary key,document_id bigint unique,content_text text);
create table public.dms_document_links(id bigint primary key,document_id bigint,entity_type text,entity_id bigint,deleted_at timestamptz);
create table public.employees(id bigint primary key,owner_company_id bigint,branch_id bigint,deleted_at timestamptz,photo_dms_document_id bigint);
create table public.employee_dependents(id bigint primary key,employee_id bigint,deleted_at timestamptz,dms_document_id bigint,photo_dms_document_id bigint);
create table public.owner_companies(id bigint primary key);create table public.branches(id bigint primary key);
create table public.parties(id bigint primary key,is_active boolean);create table public.work_sites(id bigint primary key,deleted_at timestamptz);
create table public.dms_metadata_definitions(id bigint primary key,document_type_id bigint,field_code text,field_type text,deleted_at timestamptz,is_active boolean,is_searchable boolean,is_filterable boolean);
create table public.dms_document_metadata_values(document_id bigint,definition_id bigint,deleted_at timestamptz,value_date date,value_text text,value_number numeric,value_boolean boolean,value_datetime timestamptz,value_json jsonb);
create table public.hr_candidate_documents(dms_document_id bigint,candidate_id bigint,deleted_at timestamptz);
create table public.hr_offers(offer_document_id bigint,candidate_id bigint,owner_company_id bigint,branch_id bigint,deleted_at timestamptz);
create table public.hr_onboarding_tasks(dms_document_id bigint,candidate_id bigint,employee_id bigint,deleted_at timestamptz);
create table erp_private.fleet_assets(id bigint primary key,owner_company_id bigint,home_branch_id bigint);
create table erp_private.fleet_document_parents(document_id bigint,asset_id bigint);
create function erp_private.t05_scope(text,bigint,bigint)returns boolean language sql stable as $$select erp_private.fixture_scope($2,$3)$$;
create function public.f03_has_employee_permission(emp bigint,code text)returns boolean language sql stable security definer set search_path=''as $$select erp_private.business_principal_is_active()and public.current_user_has_permission_any_scope(code)and exists(select from public.employees e where e.id=emp and e.deleted_at is null and erp_private.fixture_scope(e.owner_company_id,e.branch_id))$$;
create function public.current_user_can_view_employee(bigint)returns boolean language sql stable as $$select public.f03_has_employee_permission($1,'hr.employees.view')$$;
create function public.current_user_can_view_employee_medical(bigint)returns boolean language sql stable as $$select public.f03_has_employee_permission($1,'hr.medical.view')$$;
create function erp_private.employee_permission(bigint,text)returns boolean language sql stable as $$select public.f03_has_employee_permission($1,$2)$$;
create function erp_private.readable_employee_ids()returns setof bigint language sql stable security definer as $$select id from public.employees where public.current_user_can_view_employee(id)$$;
create function erp_private.read_hr_candidates()returns table(id bigint)language sql stable as $$select null::bigint where false$$;
create function erp_private.candidate_permission(bigint,text)returns boolean language sql stable as $$select false$$;
create function erp_private.recruitment_scope(bigint,bigint,text)returns boolean language sql stable as $$select false$$;
create function erp_private.onboarding_permission(bigint,bigint,text)returns boolean language sql stable as $$select false$$;
create function erp_private.permission_in_scope(text,bigint,bigint)returns boolean language sql stable as $$select public.current_user_has_permission_any_scope($1)and erp_private.fixture_scope($2,$3)$$;
create function erp_private.perf_hr_document_subjects_allowed(bigint)returns boolean language sql stable as $$select not exists(select from public.dms_document_links l where l.document_id=$1 and l.entity_type='employee'and not public.current_user_can_view_employee(l.entity_id))$$;
create function erp_private.document_permission(doc bigint,code text)returns boolean language sql stable security definer set search_path=''as $$select erp_private.business_principal_is_active()and public.current_user_has_permission_any_scope(code)and exists(select from public.dms_documents d where d.id=doc and d.deleted_at is null and erp_private.fixture_scope(d.owning_company_id,d.owning_branch_id)and(d.confidentiality_level in('internal','company')or public.current_user_has_permission_any_scope('dms.documents.view.'||d.confidentiality_level)))$$;
create function public.f03_has_document_permission(bigint,text)returns boolean language sql stable as $$select erp_private.document_permission($1,$2)$$;
create function public.current_user_can_view_dms_document(bigint)returns boolean language sql stable as $$select erp_private.document_permission($1,'dms.documents.view')$$;
"""


def run(shim, without_fix):
    name = 'content-candidates-' + uuid.uuid4().hex[:12]
    checks = []

    def docker(*args, data=None, check=True):
        r = subprocess.run(['docker', *args], input=data, text=True, capture_output=True)
        if check and r.returncode:
            raise RuntimeError(r.stderr or r.stdout)
        return r

    def sql(q, check=True):
        return docker('exec', '-i', name, 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-XqAt', '-v', 'ON_ERROR_STOP=1', data=q, check=check)

    def value(q):
        return sql(q).stdout.strip()

    actor = "set role authenticated;set test.session='true';set test.active='true';set test.global='false';set test.scopes='[[1,11]]';set test.permissions='dms.documents.view,dms.documents.preview,hr.employees.view,hr.compliance.view';"

    def call(q, setup=''):
        return value(actor + setup + q)

    def ids(query='needle', include=True, setup='', suffix=''):
        query = query.replace("'", "''")
        return json.loads(call(f"select coalesce(json_agg(id order by id),'[]')from public.ai_mod02_search_documents('{query}',{str(include).lower()}) {suffix};", setup))

    def deny(label, q, setup=''):
        r = sql(actor + setup + q, False)
        assert r.returncode and 'AI_SEARCH_' in r.stderr, label + ': expected controlled denial'
        checks.append(label)

    docker('run', '--pull=never', '--network', 'none', '--name', name, '--detach', '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '051f7b7b3abd')
    try:
        version = value('show server_version;')
        assert version.startswith('17.10'), version
        # Add the sensitivity column before compiling the actual permission body.
        fixture = FIXTURE.replace('create table public.dms_document_content', 'alter table public.dms_documents add column confidentiality_level text;\ncreate table public.dms_document_content')
        sql(fixture)
        for table in ('employee_access_cards', 'employee_assets', 'employee_disciplinary_records', 'employee_eos_cases', 'employee_hr_actions', 'employee_identity_documents', 'employee_medical_insurances', 'employee_medical_records', 'employee_performance_records', 'employee_ppe_issues', 'employee_training_certificates', 'employee_document_links'):
            sql(f'create table public.{table}(dms_document_id bigint,employee_id bigint,deleted_at timestamptz);')
        sql('create table public.employee_pro_processes(related_document_id bigint,deleted_at timestamptz);')
        query, rpc, reader = current_sources()
        sql(query + '\n' + reader + '\n' + rpc)
        sql(f"revoke all on function {SIGNATURE},{READER}from public,anon,service_role;grant execute on function {SIGNATURE},{READER}to authenticated;grant usage on schema public,erp_private,auth to authenticated;grant select on all tables in schema public to authenticated;")
        sql("""alter table public.dms_document_content enable row level security;
          create policy dms_doc_content_select on public.dms_document_content for select to authenticated using(auth.uid()is not null and erp_private.document_permission(document_id,'dms.documents.view')and public.current_user_can_view_dms_document(document_id));
          create policy f03_document_subject on public.dms_document_content as restrictive for all to authenticated using(erp_private.document_permission(document_id,'dms.documents.preview'));
          create policy f03_principal on public.dms_document_content as restrictive for all to authenticated using((select erp_private.business_principal_is_active()));
          create index idx_dms_doc_content_fts on public.dms_document_content using gin(to_tsvector('simple',coalesce(content_text,'')));
          create index idx_dms_documents_content_tsv on public.dms_documents using gin(content_tsv);
          insert into public.employees values(1,1,11,null,null),(2,2,21,null,null);
          insert into public.dms_documents(id,document_no,title,document_type_id,owning_company_id,owning_branch_id,confidentiality_level,status,is_archived,expiry_date,content_tsv)values
          (1,'SYN-DMS-1','needle metadata',1,1,11,'company','active',false,current_date-1,to_tsvector('simple','needle metadata')),
          (2,'SYN-DMS-2','public title',2,1,11,'company','active',false,current_date+10,to_tsvector('simple','public title')),
          (3,'SYN-DMS-3','public title',1,1,11,'company','active',false,null,to_tsvector('simple','needle hidden vector')),
          (4,'SYN-DMS-4','needle sibling',1,1,12,'company','active',false,null,to_tsvector('simple','needle sibling')),
          (5,'SYN-DMS-5','needle other company',1,2,21,'company','active',false,null,to_tsvector('simple','needle other company')),
          (6,'SYN-DMS-6','needle crossed tuple',1,2,11,'company','active',false,null,to_tsvector('simple','needle crossed tuple')),
          (7,'SYN-DMS-7','needle confidential',1,1,11,'hr','active',false,null,to_tsvector('simple','needle confidential')),
          (8,'SYN-DMS-8','needle bad fleet',1,1,11,'company','active',false,null,to_tsvector('simple','needle bad fleet')),
          (9,'SYN-DMS-9','needle denied HR subject',1,1,11,'company','active',false,null,to_tsvector('simple','needle denied HR subject'));
          insert into erp_private.fleet_assets values(1,2,21);insert into erp_private.fleet_document_parents values(8,1);
          insert into public.dms_document_links values(1,1,'employee',1,null),(2,1,'employee',1,null),(3,2,'employee',1,null),(4,9,'employee',2,null);
          insert into public.dms_document_content select id,id,'needle extraction'from public.dms_documents where id in(1,2,3,4,5,6,7,8,9);
          insert into public.dms_documents(id,document_no,title,document_type_id,owning_company_id,owning_branch_id,confidentiality_level,status,is_archived,content_tsv,ai_summary)
          select 1000+n,'SYN-BG-'||n,'background object',1,1,11,'company','active',false,to_tsvector('simple','background object'),repeat('wide synthetic summary ',100)from generate_series(1,2000)n;
          insert into public.dms_documents(id,document_no,title,document_type_id,owning_company_id,owning_branch_id,confidentiality_level,status,is_archived,content_tsv)
          select 4000+n,'SYN-BATCH-'||n,'batch certificate',2,1,11,'company','active',false,to_tsvector('simple','batch certificate')from generate_series(1,1205)n;
          insert into public.dms_document_content select 10000+n,1000+n,repeat('background extraction ',480)from generate_series(1,600)n;
          insert into public.dms_metadata_definitions values(1,1,'nationality','text',null,true,true,true);
          insert into public.dms_document_metadata_values(document_id,definition_id,value_text)values(1,1,'Synthetic');analyze;
        """)
        metadata_sql = f"select json_build_array(oid,proowner,proacl,prosecdef,provolatile,proconfig,prorettype,proargtypes,proargnames,proparallel,prokind,proisstrict,proleakproof,procost,prorows,proargmodes,proallargtypes,pronargdefaults,proargdefaults::text)::text from pg_proc where oid='{SIGNATURE}'::regprocedure;"
        before_metadata = value(metadata_sql)
        before_reader = value(f"select md5(pg_get_functiondef('{READER}'::regprocedure));")
        assert value(f"select md5(prosrc)from pg_proc where oid='{SIGNATURE}'::regprocedure;") == '1fba4087249c5e9329485d1dead65fd0', 'fixture public source drift'
        assert value(f"select md5(prosrc)from pg_proc where oid='{READER}'::regprocedure;") == '78a58f1b738d6dcd8455c9d9c288595e', 'fixture protected source drift'
        migrations = list((ROOT / 'supabase/migrations').glob('*_ai_mod02_content_candidate_capacity.sql'))
        if not without_fix:
            assert len(migrations) == 1
            sql(migrations[0].read_text(encoding='utf-8-sig'))
        assert value(metadata_sql) == before_metadata
        assert value(f"select md5(pg_get_functiondef('{READER}'::regprocedure));") == before_reader
        checks.append('actual current public/private body prerequisites; OID ACL signature owner invoker search_path and protected reader unchanged')
        assert ids() == [1, 2, 3]
        assert ids(include=False) == [1, 3]
        assert ids(setup="set test.permissions='dms.documents.view,hr.employees.view';") == [1]
        checks.append('metadata and content-only matches deduplicated; preview denial retains metadata while hiding extracted text and protected vector')
        assert ids(setup="set test.scopes='[[1,11],[2,21]]';") == [1, 2, 3, 5, 9]
        assert ids(setup="set test.scopes='[[2,21]]';") == [5]
        assert ids(setup="set test.permissions='';") == []
        assert ids(setup="set test.active='false';") == []
        checks.append('two companies sibling branches and exact assignment union; revocation inactive principal sensitivity Fleet and HR denials')
        deny('expired session rejects content search', "select count(*)from public.ai_mod02_search_documents('needle',true);", "set test.session='false';")
        deny('invalid subject rejects unchanged', "select count(*)from public.ai_mod02_search_documents('needle',true,'invented',1);")
        deny('unknown metadata filter rejects unchanged', "select count(*)from public.ai_mod02_search_documents('needle',true,null,null,'{}',null,null,'[{\"field_code\":\"unknown\",\"value\":\"x\"}]');")
        assert ids('nohits', True) == []
        assert ids('%', True) == []
        assert ids('SYN-DMS-1', True) == [1]
        assert ids('', True) == ids('', False)
        assert call("select count(*)from public.ai_mod02_search_documents('needle',null);") == '2'
        checks.append('no hits keep empty candidate set; punctuation blank reference and include_content false semantics unchanged')
        assert call("select count(*)from public.ai_mod02_search_documents('needle',true,null,null,array[2]::bigint[]);") == '1'
        assert call("select count(*)from public.ai_mod02_search_documents('needle',true,'employee',1);") == '2'
        assert call("select count(*)from public.ai_mod02_search_documents('needle',true,null,null,'{}','employee');") == '2'
        assert call("select count(*)from public.ai_mod02_search_documents('needle',true,null,null,'{}',null,'expired');") == '1'
        assert call("select count(*)from public.ai_mod02_search_documents('needle',true,null,null,'{}',null,null,'[{\"field_code\":\"nationality\",\"value\":\"Synthetic\"}]');") == '1'
        checks.append('type subject duplicate membership linked type Dubai expiry and metadata filters stay conjunctive')
        assert call("select count(*)from public.ai_mod02_search_documents('batch',true);") == '1205'
        assert call("select json_build_array(count(*),min(id),max(id))from(select id from public.ai_mod02_search_documents('batch',true)order by id offset 1000 limit 200)s;") == '[200, 5001, 5200]'
        assert call("select json_build_array(count(*),min(id),max(id))from(select id from public.ai_mod02_search_documents('batch',true)order by id offset 1200 limit 200)s;") == '[5, 5201, 5205]'
        checks.append('full exact count above 1000 and stable later/final 200-row pages; no candidate cap')
        for role in ('anon', 'service_role'):
            r = sql(f"set role {role};select count(*)from {SIGNATURE.split('(')[0]}('needle',true);", False)
            assert r.returncode and 'permission denied for function' in r.stderr
        checks.append('anonymous and service-role execution stays revoked')
        # This plan is under the fixture authenticated role with its real content
        # RLS enabled, unlike the earlier diagnostic postgres-only GIN plan.
        content_plan = json.loads(call("explain(analyze,buffers,format json)select c.document_id from public.dms_document_content c where to_tsvector('simple',coalesce(c.content_text,''))@@to_tsquery('simple','needle');"))[0]

        def nodes(node):
            return [node] + [descendant for child in node.get('Plans', []) for descendant in nodes(child)]

        content_nodes = nodes(content_plan['Plan'])
        content_summary = {'role': 'authenticated synthetic exact-scope fixture', 'rows': content_plan['Plan'].get('Actual Rows'), 'executionMs': content_plan.get('Execution Time'), 'rootNode': content_plan['Plan']['Node Type'], 'indexes': sorted({n['Index Name'] for n in content_nodes if 'Index Name' in n}), 'rowsRemovedByFilter': content_plan['Plan'].get('Rows Removed by Filter', 0)}
        assert content_summary['rows'] == 5  # content RLS admits IDs1,2,3,8,9; final protected reader denies8,9.
        discouraged_seq = json.loads(call("set enable_seqscan=off;explain(format json)select c.document_id from public.dms_document_content c where to_tsvector('simple',coalesce(c.content_text,''))@@to_tsquery('simple','needle');"))[0]
        content_summary['indexesWithSeqScanDiscouraged'] = sorted({n['Index Name'] for n in nodes(discouraged_seq['Plan']) if 'Index Name' in n})
        content_summary['textFunctionLeakproof'] = json.loads(value("select json_object_agg(oid::regprocedure::text,proleakproof)from pg_proc where oid in('pg_catalog.to_tsvector(regconfig,text)'::regprocedure,'pg_catalog.ts_match_vq(tsvector,tsquery)'::regprocedure);"))
        # auto_explain observes the unmodified production SQL at its real SRF boundary.
        # A selective count must not expand thousands of unrelated composite rows.
        def scans(node):
            out = [node] if node.get('Function Name') == 'read_documents_matching' else []
            for child in node.get('Plans', []):
                out.extend(scans(child))
            return out

        def expansion(query, expected):
            log_start = (shim.directory / 'pg.log').stat().st_size
            started = time.perf_counter()
            measured = value("load 'auto_explain';set auto_explain.log_min_duration=0;set auto_explain.log_analyze=on;set auto_explain.log_nested_statements=on;set auto_explain.log_format=json;" + actor + f"select count(*)from public.ai_mod02_search_documents('{query}',true);")
            elapsed_ms = (time.perf_counter() - started) * 1000
            assert measured == str(expected)
            logged = (shim.directory / 'pg.log').read_text(encoding='utf-8', errors='replace')[log_start:]
            decoder = json.JSONDecoder()
            plans = []
            for m in re.finditer(r'\{\s*"Query Text"\s*:', logged):
                plan, _ = decoder.raw_decode(logged[m.start():])
                if 'WHERE d.deleted_at IS NULL' in plan.get('Query Text', ''):
                    plans.append(plan)
            assert plans, 'native nested production RETURN QUERY plan missing'
            final_scans = [s for p in plans for s in scans(p['Plan'])]
            assert len(final_scans) == 1, 'ambiguous final protected-reader plan'
            scan = final_scans[0]
            expanded = (scan.get('Actual Rows', 0) + scan.get('Rows Removed by Filter', 0)) * scan.get('Actual Loops', 1)
            return expanded, round(elapsed_ms, 2)

        expanded, elapsed_ms = expansion('needle', 3)
        no_hits_expanded, no_hits_ms = expansion('nohits', 0)
        result = {'postgres': version, 'checks': checks, 'count': len(checks), 'selectiveProtectedRowsExpanded': expanded, 'selectiveMatches': 3, 'selectiveElapsedMs': elapsed_ms, 'noHitsProtectedRowsExpanded': no_hits_expanded, 'noHitsElapsedMs': no_hits_ms, 'authenticatedContentPlan': content_summary, 'withoutFix': without_fix, 'migrationSha256': hashlib.sha256(migrations[0].read_bytes()).hexdigest() if migrations else None}
        print(json.dumps(result, indent=2))
        assert expanded <= 3, f'RED content search expands {expanded} protected rows for only 3 matches'
        assert no_hits_expanded == 0, f'empty candidate array expanded {no_hits_expanded} protected rows'
    finally:
        docker('rm', '--force', name)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--without-fix', action='store_true')
    args = parser.parse_args()
    sys.path.insert(0, str(ROOT / 'tests/communications'))
    from native_pg_fallback import NativePgDockerShim
    previous = subprocess.run
    try:
        with NativePgDockerShim(label='content-candidates') as shim:
            subprocess.run = shim.run
            run(shim, args.without_fix)
    finally:
        subprocess.run = previous


if __name__ == '__main__':
    main()
