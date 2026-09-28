'use strict';
const fs=require('node:fs'),path=require('node:path');
const d=require('../f00/local-db.cjs');
const migration=path.resolve('supabase/migrations/20260928045514_f04_atomic_workspace_saves.sql');
if(process.argv[2]==='apply') {
 d.sql(fs.readFileSync(migration,'utf8'),{transaction:true});
 console.log('F04 migration applied to guarded local synthetic database only.');
} else if(process.argv[2]==='refresh-function') {
 const s=fs.readFileSync(migration,'utf8');
 const fn=s.slice(s.indexOf('create function public.save_workspace_record'));
 d.sql('grant select(workspace_revision) on public.employees, public.hr_candidates to authenticated;\n'+fn.replace('create function','create or replace function'),{transaction:true});
 console.log('Refreshed F04 local function; no migration history entry created.');
} else {
 console.log(JSON.stringify(d.sql(`select json_build_object('actors',(select json_agg(json_build_object('id',u.id,'auth',u.auth_user_id,'email',a.email,'roles',(select json_agg(r.role_code) from public.user_roles ra join public.roles r on r.id=ra.role_id where ra.user_profile_id=u.id))) from public.user_profiles u join auth.users a on a.id=u.auth_user_id where a.email like 'f00-%@example.invalid'),'companies',(select json_agg(json_build_object('id',id,'code',company_code)) from public.owner_companies),'audit_columns',(select json_agg(column_name) from information_schema.columns where table_schema='public' and table_name='audit_logs'));`,{json:true}),null,2));
}
