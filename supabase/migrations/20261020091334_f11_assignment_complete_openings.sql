BEGIN;
-- A full-form edit must identify every visible field; absence is not a default or clear instruction.
DO $$DECLARE definition text;needle text:='IF p_action<>''archive''THEN';replacement text;offset_at integer;
BEGIN
 definition:=pg_get_functiondef('public.f11_mutate_assignment(text,bigint,bigint,bigint,uuid,text,jsonb)'::regprocedure);
 offset_at:=position(needle IN definition);
 IF offset_at=0 OR position(needle IN substring(definition FROM offset_at+length(needle)))>0 THEN RAISE EXCEPTION 'Unrecognized assignment field-admission predecessor';END IF;
 replacement:='IF p_action=''update''AND NOT(p_data ?& ARRAY[''assignment_type'',''assignment_status'',''effective_from'',''effective_to'',''notes''])THEN RAISE EXCEPTION ''Every visible assignment field is required on edit'' USING ERRCODE=''23514'';END IF;'||E'\n '||needle;
 EXECUTE replace(definition,needle,replacement);
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
