BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $guard$
DECLARE
  expected record;
  actual record;
  definition text;
  gate constant text := '  if p_archive then';
  catalogue_declaration constant text := '  before_row jsonb;';
  no_op text;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Reviewed catalogue save routines require postgres ownership'; END IF;
  FOR expected IN SELECT * FROM (VALUES
    ('public.phase3_save_catalogue(text,bigint,bigint,uuid,jsonb,boolean)', '0f3cd82903046510ccab7155e43e3f90'),
    ('public.phase3_save_work_site(bigint,bigint,uuid,jsonb,boolean)', 'e750021c3c66f4e56fc16e929bd9b108')
  ) AS v(signature, body_hash)
  LOOP
    SELECT oid, proowner, prosecdef, provolatile, prorettype, proconfig, prosrc, proacl
      INTO STRICT actual FROM pg_proc WHERE oid = to_regprocedure(expected.signature);
    IF actual.proowner <> 'postgres'::regrole OR NOT actual.prosecdef OR actual.provolatile <> 'v'
      OR actual.prorettype <> 'jsonb'::regtype OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=""']
      OR md5(replace(actual.prosrc, E'\r', '')) IS DISTINCT FROM expected.body_hash
      OR ARRAY(SELECT acl::text FROM unnest(actual.proacl) AS acl ORDER BY acl::text)
        IS DISTINCT FROM ARRAY['authenticated=X/postgres', 'postgres=X/postgres']
    THEN RAISE EXCEPTION 'Reviewed catalogue save routine drift: %', expected.signature; END IF;

    definition := replace(pg_get_functiondef(actual.oid), E'\r', '');
    IF length(definition) - length(replace(definition, gate, '')) <> length(gate)
    THEN RAISE EXCEPTION 'Missing reviewed catalogue update gate: %', expected.signature; END IF;

    IF expected.signature LIKE 'public.phase3_save_catalogue(%' THEN
      IF length(definition) - length(replace(definition, catalogue_declaration, '')) <> length(catalogue_declaration)
      THEN RAISE EXCEPTION 'Missing reviewed catalogue declarations'; END IF;
      definition := replace(definition, catalogue_declaration, catalogue_declaration || E'\n  normalized jsonb;');
      no_op := $catalogue$
  -- The authorization, replay, revision and scope checks above always run.
  -- Compare only submitted columns after the same typed conversion as UPDATE.
  if p_id is not null and not p_archive and columns is not null then
    execute format('select to_jsonb(jsonb_populate_record(null::public.%I,$1))',p_relation)
      into normalized using p_data;
    if not exists (
      select from jsonb_object_keys(p_data) as field(name)
      where before_row -> field.name is distinct from normalized -> field.name
    ) then
      saved := jsonb_build_object('id',before_row->'id','revision',before_row->>'workspace_revision',
        'replayed',false,'changed',false);
      insert into erp_private.phase3_work_site_receipts values(actor,p_operation,stamp,saved);
      return saved;
    end if;
  end if;
$catalogue$;
    ELSE
      no_op := $site$
  if p_id is not null and not p_archive and columns is not null then
    updated := jsonb_populate_record(before_row,p_data);
    -- Old invalid coordinates or dates must still reach UPDATE and fail the
    -- original NOT VALID constraints. Authorization and sharing are unchanged.
    if updated is not distinct from before_row
      and (updated.latitude is null or updated.latitude between -90 and 90)
      and (updated.longitude is null or updated.longitude between -180 and 180)
      and (updated.opening_date is null or isfinite(updated.opening_date))
      and (updated.closing_date is null or isfinite(updated.closing_date))
      and (updated.opening_date is null or updated.closing_date is null or updated.opening_date <= updated.closing_date)
    then
      result := jsonb_build_object('id',before_row.id,'revision',before_row.workspace_revision::text,
        'replayed',false,'changed',false,'owner_company_id',before_row.owner_company_id,
        'branch_id',before_row.branch_id,'available_to_all_organizations',before_row.available_to_all_organizations);
      insert into erp_private.phase3_work_site_receipts values(actor,p_operation,stamp,result);
      return result;
    end if;
  end if;
$site$;
    END IF;

    EXECUTE replace(definition, gate, no_op || gate);
    IF (SELECT proacl FROM pg_proc WHERE oid = actual.oid) IS DISTINCT FROM actual.proacl
    THEN RAISE EXCEPTION 'Catalogue save routine grants changed: %', expected.signature; END IF;
  END LOOP;
END $guard$;

COMMIT;
