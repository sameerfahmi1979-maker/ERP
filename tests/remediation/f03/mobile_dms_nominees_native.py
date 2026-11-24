"""Actual shares module + ERP permission helpers in isolated synthetic PG17.10.

--without-fix reproduces both missing ordinary-global nominees and hidden full names.
No live database, actual users/roles, provider, browser or device operations.
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

ROOT=Path(__file__).resolve().parents[3]
MIGRATION=ROOT/'supabase/migrations/20261124121343_mobile_dms_nominee_identity_scope.sql'
SHARES=ROOT/'supabase/migrations/20261121120037_mobile_dms_authenticated_shares.sql'

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--without-fix',action='store_true');args=parser.parse_args()
    sys.path.insert(0,str(ROOT/'tests/communications'))
    from native_pg_fallback import NativePgDockerShim
    previous=subprocess.run
    try:
        with NativePgDockerShim(label='dms-nominees')as shim:
            subprocess.run=shim.run;run(args.without_fix)
    finally:subprocess.run=previous

def run(without_fix):
    name='dms-nominee-'+uuid.uuid4().hex[:12];checks=[]
    def docker(*args,data=None,check=True):
        r=subprocess.run(['docker',*args],input=data,text=True,capture_output=True)
        if check and r.returncode:raise RuntimeError(r.stderr or r.stdout)
        return r
    def sql(q,check=True):return docker('exec','-i',name,'psql','-h','127.0.0.1','-U','postgres','-XqAt','-v','ON_ERROR_STOP=1',data=q,check=check)
    def value(q):return sql(q).stdout.strip()
    def deny(label,q):
        r=sql('begin;'+q+';commit;',False);assert r.returncode,label+': forbidden action accepted';checks.append(label)
    def request_sql(action,data,actor=1):
        wire=json.dumps(data).replace("'","''")
        return f"set role authenticated;set test.actor='{actor}';select public.mobile_dms_shares('{action}','{wire}');"
    def call(action,data,actor=1):return json.loads(value(request_sql(action,data,actor)))
    def recipients(doc=1,search='',page=1):return call('recipients',{'documentId':doc,'sourceHash':'a'*64,'search':search,'page':page})
    def ids(doc=1,search=''):return{r['profileId']for r in recipients(doc,search)['rows']}
    docker('run','--pull=never','--network','none','--name',name,'--detach','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','051f7b7b3abd')
    try:
        for _ in range(100):
            if sql('select 1',False).returncode==0:break
            time.sleep(.1)
        version=value('show server_version');assert version.startswith('17.10'),version
        sql("""create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema erp_private;
          create table public.user_profiles(id bigint primary key,auth_user_id uuid,display_name text,full_name text,email text,status text,must_change_password boolean);
          create table public.roles(id bigint primary key,role_code text,is_active boolean,is_system_role boolean);
          create table public.user_roles(id bigint generated always as identity primary key,user_profile_id bigint,role_id bigint,owner_company_id bigint,branch_id bigint,is_active boolean);
          create table public.permissions(id bigint primary key,permission_code text,is_active boolean);
          create table public.role_permissions(role_id bigint,permission_id bigint);
          create table public.branches(id bigint primary key,owner_company_id bigint,status text);
          insert into public.branches values(11,10,'active'),(12,10,'active'),(21,20,'active');
          create table public.dms_documents(id bigint primary key,owning_company_id bigint,owning_branch_id bigint,current_version_id bigint,is_archived boolean,superseded_by_document_id bigint,deleted_at timestamptz,title text,document_no text);
          create table public.dms_document_versions(id bigint primary key);
          create table public.dms_document_files(id bigint primary key,document_id bigint,version_id bigint,deleted_at timestamptz,file_role text);
          create table public.dms_document_events(id bigint primary key,document_id bigint,performed_by bigint,event_type text,metadata_json jsonb);
          insert into public.dms_documents values(1,10,11,1,false,null,null,'Synthetic A1','A1'),(2,10,12,2,false,null,null,'Synthetic A2','A2'),(3,20,21,3,false,null,null,'Synthetic B1','B1'),(4,10,null,4,false,null,null,'Synthetic company','A'),(5,10,11,5,false,null,null,'Confidential','C');
          insert into public.dms_document_versions select id from public.dms_documents;
          insert into public.dms_document_files select id,id,id,null,'original'from public.dms_documents;
          insert into public.roles values(1,'dms_manager',true,false),(2,'ordinary',true,false),(3,'company_admin',true,true),(4,'branch_admin',true,true),(5,'system_admin',true,true),(6,'group_admin',true,true),(7,'inactive_role',false,false);
          insert into public.permissions values(1,'dms.documents.preview',true),(2,'dms.documents.download',true),(3,'dms.documents.share_external',true),(4,'dms.documents.view',true),(5,'dms.admin',true);
          insert into public.role_permissions select 1,id from public.permissions;
          insert into public.user_profiles select n,lpad(n::text,32,'0')::uuid,'Alias '||n,'Full '||n,'private'||n||'@example.invalid','active',false from generate_series(1,25)n;
          insert into public.user_profiles values(55,lpad('55',32,'0')::uuid,'FAHMI','MUNEER','muneer.private@example.invalid','active',false);
          update public.user_profiles set full_name='SCOPED PERSON',display_name='Work Alias'where id=3;
          update public.user_profiles set status='inactive'where id=12;update public.user_profiles set must_change_password=true where id=13;update public.user_profiles set auth_user_id=null where id=14;
          update public.user_profiles set full_name='Same Name',display_name=' same name 'where id=18;
          update public.user_profiles set display_name=null where id=19;update public.user_profiles set full_name=null where id=20;
          update public.user_profiles set full_name='',display_name='   'where id=21;
          insert into public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)values
          (1,1,10,null,true),(1,1,20,null,true),(3,1,10,null,true),(4,1,10,11,true),(5,1,10,12,true),(6,1,20,null,true),
          (7,1,10,12,true),(7,1,20,21,true),(8,1,null,11,true),(9,3,null,null,true),(10,5,10,null,true),
          (11,2,null,null,true),(12,1,null,null,true),(13,1,null,null,true),(14,1,null,null,true),(15,7,null,null,true),(16,1,null,null,false),
          (18,1,10,null,true),(19,1,10,null,true),(20,1,10,null,true),(21,1,null,null,true),(22,4,10,11,true),(23,3,10,null,true),(24,5,null,null,true),(25,6,null,null,true),(55,1,null,null,true);
          create function auth.uid()returns uuid language sql stable as $$select lpad(nullif(current_setting('test.actor',true),''),32,'0')::uuid$$;
          create function auth.role()returns text language sql stable as $$select'authenticated'::text$$;
          create function public.f03_current_session_valid()returns boolean language sql stable as $$select coalesce(current_setting('test.session_valid',true),'true')<>'false'and exists(select from public.user_profiles where auth_user_id=auth.uid()and status='active'and not must_change_password)$$;""")
        permission_source=(ROOT/'supabase/migrations/20260922061949_f01_security_containment.sql').read_text(encoding='utf-8-sig')
        for function_name in('current_user_profile_id','current_user_is_global_admin','current_user_has_permission','current_user_has_permission_in_company','current_user_has_permission_in_branch'):
            match=re.search(r'CREATE OR REPLACE FUNCTION public\.'+function_name+r'\(.*?\$function\$;',permission_source,re.S);assert match,function_name
            sql(match.group(0))
        scope_source=(ROOT/'supabase/migrations/20261025093000_administrator_scope_policy.sql').read_text(encoding='utf-8-sig')
        match=re.search(r'CREATE FUNCTION erp_private\.administrator_assignment_shape\(.*?\$\$;',scope_source,re.S);assert match;sql(match.group(0))
        sql("""create function erp_private.mobile_dms_actor()returns bigint language plpgsql security definer set search_path=''as $$begin if public.f03_current_session_valid()is not true then raise insufficient_privilege;end if;return public.current_user_profile_id();end$$;
          create function erp_private.mobile_dms_can(doc bigint,cap text)returns boolean language sql security definer set search_path=''as $$select public.f03_current_session_valid()and exists(select from public.dms_documents d where d.id=doc and d.deleted_at is null and (doc<>5 or public.current_user_profile_id()=1)and case when d.owning_branch_id is null then public.current_user_has_permission_in_company(cap,d.owning_company_id)else public.current_user_has_permission_in_branch(cap,d.owning_branch_id)end)$$;
          create function erp_private.mobile_dms_source(data jsonb,caps text[])returns jsonb language plpgsql security definer set search_path=''as $$declare cap text;begin foreach cap in array caps loop if erp_private.mobile_dms_can((data->>'documentId')::bigint,cap)is not true then raise insufficient_privilege;end if;end loop;if data?'sourceHash'and data->>'sourceHash'<>repeat('a',64)then raise sqlstate'PT409';end if;return jsonb_build_object('sourceHash',repeat('a',64));end$$;
          create function erp_private.mobile_dms_keys(jsonb,text[])returns void language sql as $$select null::void$$;
          create function erp_private.mobile_dms_lock(bigint)returns void language sql as $$select null::void$$;
          create function erp_private.mobile_dms_reserve(text,jsonb)returns jsonb language sql as $$select null::jsonb$$;
          create function erp_private.mobile_dms_audit(bigint,text,bigint,text,text)returns void language sql as $$select null::void$$;
          create function erp_private.mobile_dms_settle(uuid,jsonb)returns jsonb language sql as $$select $2$$;""")
        sql(SHARES.read_text(encoding='utf-8-sig'))
        sql('grant usage on schema erp_private to authenticated;')
        metadata_query="select json_build_array(oid,proowner,proacl,prosecdef,provolatile,proconfig,prorettype,proargtypes,proallargtypes,proargmodes,proargnames,proparallel)::text from pg_proc where oid='erp_private.mobile_dms_nominees(bigint,bigint)'::regprocedure;"
        before_metadata=value(metadata_query)
        shares_query="select md5(pg_get_functiondef('erp_private.mobile_dms_shares(text,jsonb)'::regprocedure)||pg_get_functiondef('erp_private.mobile_dms_share_source(erp_private.mobile_dms_shares,text[])'::regprocedure));"
        before_shares=value(shares_query)
        roles_query="select md5((select jsonb_agg(to_jsonb(r)order by r.id)::text from public.user_roles r)||(select jsonb_agg(to_jsonb(r)order by r.id)::text from public.roles r)||(select jsonb_agg(to_jsonb(r)order by r.role_id,r.permission_id)::text from public.role_permissions r));"
        before_roles=value(roles_query)
        assert value("set test.actor='55';select public.current_user_has_permission('dms.documents.preview');")=='t'
        checks.append('actual ERP helper recognizes ordinary null/null role permission')
        if not without_fix:sql(MIGRATION.read_text(encoding='utf-8-sig'))
        missing=[]
        if 55 not in ids(search='MUNEER'):missing.append('ordinary global MUNEER is absent')
        if 3 not in ids(search='SCOPED PERSON'):missing.append('scoped full_name is hidden by display_name')
        assert not missing,'RED selector regression: '+'; '.join(missing)
        checks.append('ordinary global nominee and independent full_name search both succeed')
        assert value(metadata_query)==before_metadata
        assert value(shares_query)==before_shares
        assert value(roles_query)==before_roles
        checks.append('OID ACL signature TABLE shape search_path and execution properties preserved; source/share functions and all role grants unchanged')
        label=next(r['label']for r in recipients(search='MUNEER')['rows']if r['profileId']==55)
        assert'MUNEER'in label and'FAHMI'in label
        assert 55 in ids(search='fahmi')and 3 in ids(search='work alias')
        assert recipients(search='muneer.private@example.invalid')['totalCount']==0
        assert next(r['label']for r in recipients(search='same name')['rows']if r['profileId']==18)=='Same Name'
        checks.append('both distinct names retained without email search or case-only duplicate label')
        blank_names=recipients(search='ERP user #21')['rows']
        assert blank_names==[{'profileId':21,'label':'ERP user #21'}],'blank names need a non-null non-email label'
        checks.append('both blank names retain a valid non-email profile label and search result')
        a1=ids();a2=ids(2);b1=ids(3);company=ids(4)
        assert{3,4,18,19,20,22,23,24,25,55}.issubset(a1)
        assert not({1,5,6,7,8,9,10,12,13,14,15,16}&a1)
        assert{3,5,7,23,24,25,55}.issubset(a2)and not({4,6,8,9,10,22}&a2)
        assert{6,7,24,25,55}.issubset(b1)and not({3,4,5,8,9,10,22,23}&b1)
        assert{3,23,24,25,55}.issubset(company)and not({4,5,6,7,8,9,10,22}&company)
        checks.append('two companies sibling branches exact assignments global grants and malformed-scope denials remain separate')
        assert value('set test.actor=\'1\';select count(*)from erp_private.mobile_dms_nominees(null,11);')=='0','malformed target branch without company must not gain global nominees'
        checks.append('malformed target scope remains empty after adding global nominees')
        for role in('anon','authenticated','service_role'):
            deny(role+' cannot call private nominee directory',f'set role {role};select * from erp_private.mobile_dms_nominees(10,11)')
        deny('anon cannot invoke shares',"set role anon;select public.mobile_dms_shares('recipients','{}')")
        deny('stale session cannot enumerate nominees',"set test.session_valid='false';"+request_sql('recipients',{'documentId':1,'sourceHash':'a'*64,'search':'','page':1}))
        def create_share(recipient,doc=1):
            return call('create',{'documentId':doc,'versionId':doc,'fileId':doc,'sourceHash':'a'*64,'recipientProfileId':recipient,'tokenHash':uuid.uuid4().hex+uuid.uuid4().hex,'lifetimeHours':24,'operationId':str(uuid.uuid4())})
        share=create_share(55);token=value(f"select token_hash from erp_private.mobile_dms_shares where id={share['id']};")
        assert call('resolve',{'tokenHash':token},55)['shareId']==share['id']
        checks.append('ordinary-global nominated recipient resolves only with current actual document authority')
        sql("update public.user_roles set is_active=false where user_profile_id=55;")
        assert 55 not in ids(search='MUNEER')
        deny('issued link does not bypass revoked document permission',request_sql('resolve',{'tokenHash':token},55))
        sql("update public.user_roles set is_active=true where user_profile_id=55;")
        no_access=create_share(11);no_token=value(f"select token_hash from erp_private.mobile_dms_shares where id={no_access['id']};")
        deny('nomination cannot confer document permission',request_sql('resolve',{'tokenHash':no_token},11))
        confidential=create_share(55,5);secret_token=value(f"select token_hash from erp_private.mobile_dms_shares where id={confidential['id']};")
        deny('recipient role scope cannot bypass source sensitivity',request_sql('resolve',{'tokenHash':secret_token},55))
        denied_data={'documentId':1,'versionId':1,'fileId':1,'sourceHash':'a'*64,'recipientProfileId':55,'tokenHash':'c'*64,'lifetimeHours':24,'operationId':str(uuid.uuid4())}
        sql("update public.user_profiles set status='inactive'where id=55;")
        deny('create revalidates nominee after list',request_sql('create',denied_data))
        print(json.dumps({'postgres':version,'checks':checks,'count':len(checks),'migrationSha256':hashlib.sha256(MIGRATION.read_bytes()).hexdigest(),'baseSharesSha256':hashlib.sha256(SHARES.read_bytes()).hexdigest()},indent=2))
    finally:docker('rm','--force',name)

if __name__=='__main__':main()
