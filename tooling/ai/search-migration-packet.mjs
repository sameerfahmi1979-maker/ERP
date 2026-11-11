// Exact-file packet builder. Requires private operator snapshots; never connects.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export const evidence='CODEX_AUDIT_13_09_2026/IMPLEMENTATION/AI_MOD_02_20261030';
export const migration='supabase/migrations/20261030143220_ai_mod02_shared_document_search.sql';
export const version='20261030143220',name='ai_mod02_shared_document_search';
export const literal=t=>"'"+t.replaceAll("'","''")+"'";
export function splitStatements(sql){
 const out=[];let start=0,quote=false,dollar=null,line=false;
 for(let i=0;i<sql.length;i++){
  if(line){if(sql[i]==='\n')line=false;continue;}
  if(dollar){if(sql.startsWith(dollar,i)){i+=dollar.length-1;dollar=null;}continue;}
  if(quote){if(sql[i]==="'"){if(sql[i+1]==="'")i++;else quote=false;}continue;}
  if(sql.startsWith('--',i)){line=true;i++;continue;}
  if(sql[i]==="'"){quote=true;continue;}
  const marker=sql.slice(i).match(/^\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$/)?.[0];if(marker){dollar=marker;i+=marker.length-1;continue;}
  if(sql[i]===';'){out.push(sql.slice(start,i+1).trim());start=i+1;}
 }
 if(quote||dollar||sql.slice(start).trim())throw Error('Unparsed migration tail');return out;
}
export function functionState(functions){return functions.filter(f=>!f.name.startsWith('ai_mod02_')).map(f=>{const body=f.definition.match(/AS (\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$)([\s\S]*?)\1/);if(!body)throw Error('Missing function body '+f.name);return {schema:f.schema,name:f.name,args:f.args,source_md5:createHash('md5').update(body[2]).digest('hex'),security_definer:f.security_definer,settings:f.settings};});}
export function buildPacket(baseline){
 const sql=readFileSync(migration,'utf8'),parts=splitStatements(sql);
 if(!/\bBEGIN;$/.test(parts[0])||parts.at(-1)!=='COMMIT;'||parts.filter(p=>/^(?:--[^\n]*\n\s*)*CREATE FUNCTION/.test(p)).length!==6)throw Error('Unexpected exact migration structure');
 const functions=functionState(baseline.functions);
 const guard=`DO $ai_mod02_guard$ BEGIN
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}') OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'ai_mod02_%') THEN RAISE EXCEPTION 'AI-MOD-02 already exists; reconcile instead of reapplying';END IF;
 IF (SELECT jsonb_agg(jsonb_build_object('version',version,'name',name,'statements_md5',md5(statements::text)) ORDER BY version) FROM supabase_migrations.schema_migrations WHERE version>='20261030120000') IS DISTINCT FROM ${literal(JSON.stringify(baseline.history_rows))}::jsonb THEN RAISE EXCEPTION 'Migration history drifted';END IF;
 IF (SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'source_md5',md5(p.prosrc),'security_definer',p.prosecdef,'settings',p.proconfig) ORDER BY n.nspname,p.proname,p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='public' AND p.proname IN ('f03_read_documents','f03_current_session_valid','f03_has_employee_permission','f03_has_document_permission','current_user_has_permission','current_user_has_permission_any_scope')) OR (n.nspname='erp_private' AND p.proname IN ('read_documents','read_documents_filtered','read_documents_filtered_v2','document_permission','business_principal_is_active'))) IS DISTINCT FROM ${literal(JSON.stringify(functions))}::jsonb THEN RAISE EXCEPTION 'Existing protected readers drifted';END IF;
 IF (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.tablename,p.policyname) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=ANY(ARRAY[${[...new Set(baseline.columns.map(c=>c.table))].map(literal).join(',')}])) IS DISTINCT FROM ${literal(JSON.stringify(baseline.policies))}::jsonb THEN RAISE EXCEPTION 'Existing read policies drifted';END IF;
 IF (SELECT jsonb_agg(jsonb_build_object('table',c.relname,'field',a.attname,'type',format_type(a.atttypid,a.atttypmod)) ORDER BY c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY(ARRAY[${[...new Set(baseline.columns.map(c=>c.table))].map(literal).join(',')}]) AND a.attnum>0 AND NOT a.attisdropped) IS DISTINCT FROM ${literal(JSON.stringify(baseline.columns))}::jsonb THEN RAISE EXCEPTION 'Required column shapes drifted';END IF;
 END $ai_mod02_guard$;`;
 const fingerprint=createHash('sha256').update(sql).digest('hex');
 const packet=[parts[0],...parts.slice(1,3),"SELECT pg_advisory_xact_lock(hashtext('algt_erp_schema_release'));",guard,...parts.slice(3,-1),`INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${version}','${name}',ARRAY[${parts.map(literal).join(',')}]::text[]);`,`SELECT jsonb_build_object('version','${version}','source_sha256','${fingerprint}','functions',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'ai_mod02_%'));`,'COMMIT;'].join('\n');
 return {packet,parts,fingerprint,guard};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const native=JSON.parse(readFileSync(`${evidence}/NATIVE_SEARCH_RESULT.json`,'utf8'));
 const baseline=JSON.parse(readFileSync(`${evidence}/REFRESH_PREFLIGHT.json`,'utf8').replace(/^\uFEFF/,'' )).rows[0].jsonb_build_object;
 if(baseline.functions.some(f=>f.name.startsWith('ai_mod02_')))throw Error('Existing stage-2 function requires reconciliation');
 const generated=buildPacket(baseline);if(native.result!=='passed'||native.sha256!==generated.fingerprint)throw Error('Current exact migration lacks native acceptance');
 writeFileSync(`${evidence}/CONTROLLED_MIGRATION.sql`,generated.packet+'\n');
 writeFileSync(`${evidence}/EXPECTED_MIGRATION_STATEMENTS.json`,JSON.stringify(generated.parts,null,2)+'\n');
 writeFileSync(`${evidence}/MIGRATION_MANIFEST.json`,JSON.stringify({project:'mmiefuieduzdiiwnqpie',version,name,file:migration,sha256:generated.fingerprint,statementCount:generated.parts.length,newFunctions:6,baselineHistoryHead:baseline.history_head,unrelatedMigrations:false,businessWrites:false,executed:false},null,2)+'\n');
 console.log(JSON.stringify({version,sha256:generated.fingerprint,statements:generated.parts.length,executed:false}));
}
