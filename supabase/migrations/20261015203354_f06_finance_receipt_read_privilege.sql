-- F06 forward-only repair: a receipt read must not require receipt UPDATE rights.
-- Applied migration 84 remains immutable. No receipt ACL or authority is widened.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $finance_receipt_read$
declare
 target oid := pg_catalog.to_regprocedure('erp_private.save_finance_reference_record(text,uuid,bigint,bigint,text,jsonb)');
 before_proc jsonb;
 after_proc jsonb;
 old_source text;
 new_source text;
 definition text;
 old_read constant text := 'select r.* into receipt from erp_private.master_lifecycle_receipts r where r.actor=actor_uid and r.operation_id=p_operation for share;';
 new_read constant text := 'select r.* into receipt from erp_private.master_lifecycle_receipts r where r.actor=actor_uid and r.operation_id=p_operation;';
 old_sha constant text := 'a33734041c2e9dcf8dc34f69589504c5bc37f292d343c5ae80d3a08aa47ab365';
 new_sha constant text := '6ee46b2cb060c5b029644a8d44cde5d7628afc2f30af6cfa35a781c51885d1b7';
begin
 if target is null then raise exception using errcode='55000', message='F06 receipt repair requires the exact migration-84 function'; end if;
 select pg_catalog.to_jsonb(p), p.prosrc into before_proc, old_source from pg_catalog.pg_proc p where p.oid=target;
 -- Pin the accepted function contract without assuming environment-specific OIDs.
 if pg_catalog.pg_get_userbyid((before_proc->>'proowner')::oid) <> 'postgres'
 or (select l.lanname from pg_catalog.pg_language l where l.oid=(before_proc->>'prolang')::oid) <> 'plpgsql'
 or before_proc->>'prokind' <> 'f' or before_proc->>'provolatile' <> 'v'
 or before_proc->>'prosecdef' <> 'true' or before_proc->>'proisstrict' <> 'false'
 or before_proc->>'proparallel' <> 'u' or before_proc->>'proleakproof' <> 'false'
 or before_proc->>'proretset' <> 'false' or before_proc->>'pronargs' <> '6'
 or before_proc->>'pronargdefaults' <> '0'
 or (before_proc->>'prorettype')::oid <> 'jsonb'::pg_catalog.regtype
 or before_proc->'proconfig' is distinct from '["search_path=\"\""]'::jsonb
 or before_proc->'proargnames' is distinct from '["p_entity","p_operation","p_id","p_revision","p_action","p_data"]'::jsonb
 or before_proc->'proacl' is distinct from '["postgres=X/postgres","authenticated=X/postgres"]'::jsonb
 then raise exception using errcode='55000', message='F06 receipt repair function metadata differs from the accepted contract'; end if;
 -- Hash only normalizes CRLF for cross-platform source transport; the installed
 -- raw body is retained verbatim except for the one literal receipt-read delta.
 if pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(old_source,E'\r\n',E'\n'),'UTF8')),'hex') <> old_sha
 or (pg_catalog.length(old_source)-pg_catalog.length(pg_catalog.replace(old_source,old_read,'')))/pg_catalog.length(old_read) <> 1
 then raise exception using errcode='55000', message='F06 receipt repair requires the exact unmodified migration-84 body'; end if;
 new_source := pg_catalog.replace(old_source,old_read,new_read);
 if pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(new_source,E'\r\n',E'\n'),'UTF8')),'hex') <> new_sha
 then raise exception using errcode='55000', message='F06 receipt repair candidate body failed its exact-delta guard'; end if;
 definition := pg_catalog.pg_get_functiondef(target);
 if (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_read,'')))/pg_catalog.length(old_read) <> 1
 then raise exception using errcode='55000', message='F06 receipt repair installed definition is ambiguous'; end if;
 execute pg_catalog.replace(definition,old_read,new_read);
 select pg_catalog.to_jsonb(p) into after_proc from pg_catalog.pg_proc p where p.oid=target;
 if after_proc is null or after_proc-'prosrc' is distinct from before_proc-'prosrc'
 or after_proc->>'prosrc' is distinct from new_source
 or pg_catalog.to_regprocedure('erp_private.save_finance_reference_record(text,uuid,bigint,bigint,text,jsonb)')::oid is distinct from target
 then raise exception using errcode='55000', message='F06 receipt repair changed metadata, identity or unrelated source'; end if;
end;
$finance_receipt_read$;

commit;
