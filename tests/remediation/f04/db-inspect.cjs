'use strict';
const d=require('../f00/local-db.cjs');
console.log(JSON.stringify(d.sql(`select json_build_object(
 'version',version(),
 'functions',(select json_agg(json_build_object('name',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'acl',p.proacl,'body',pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('generate_next_reference_number','current_profile_id','has_permission')),
 'triggers',(select json_agg(json_build_object('table',c.relname,'definition',pg_get_triggerdef(t.oid),'body',pg_get_functiondef(p.oid))) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid where c.relname in ('employees','departments','hr_candidates') and not t.tgisinternal),
 'policies',(select json_agg(p) from pg_policies p where tablename in ('departments','employees','hr_candidates','employee_status_events','audit_logs')),
 'columns',(select json_agg(c) from (select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name in ('departments','employees','hr_candidates','employee_status_events','audit_logs')) c));`,{json:true}),null,2));
