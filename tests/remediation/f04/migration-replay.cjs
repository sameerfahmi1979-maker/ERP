'use strict';
// Transactional rehearsal only: restore the pre-F04 shape, apply final SQL, then ROLLBACK.
const fs=require('node:fs'),path=require('node:path'),db=require('../f00/local-db.cjs');
const file=path.resolve('supabase/migrations/20260928045514_f04_atomic_workspace_saves.sql');
const dir=path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F04',process.argv[2]==='--closure'?'closure-20260928':'continuation-20260928');
db.assertDatabase();
const before=db.sql("select json_build_object('receipts',(select count(*) from erp_private.workspace_save_receipts),'departments',(select count(*) from public.departments));",{json:true});
let sql='begin;\n';
for(const t of ['departments','employees','hr_candidates']) sql+=`drop trigger f04_revision on public.${t}; drop trigger f04_receipt on public.${t}; alter table public.${t} drop column workspace_revision;\n`;
sql+='drop function public.save_workspace_record(text,uuid,bigint,bigint,jsonb); drop function erp_private.workspace_revision(); drop function erp_private.workspace_receipt(); drop function erp_private.workspace_receipt_read(uuid); drop table erp_private.workspace_save_receipts;\n';
sql+=fs.readFileSync(file,'utf8');
sql+="\ndo $$ begin if (select count(*) from information_schema.columns where table_schema='public' and column_name='workspace_revision')<>3 then raise exception 'Revision shape mismatch'; end if; if has_table_privilege('authenticated','erp_private.workspace_save_receipts','insert') then raise exception 'Receipt writer exposed'; end if; end $$;\nrollback;";
db.sql(sql);
const after=db.sql("select json_build_object('receipts',(select count(*) from erp_private.workspace_save_receipts),'departments',(select count(*) from public.departments));",{json:true});
if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Rollback changed local fixtures');
const receipt={at:new Date().toISOString(),target:'algt-f00-local',status:'PASS',migration_applied_from_pre_f04_shape:true,rehearsal_rolled_back:true,before,after,production_writes:0};
fs.writeFileSync(path.join(dir,'MIGRATION_REPLAY.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
