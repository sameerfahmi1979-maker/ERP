BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.employee_eos_cases ADD COLUMN employment_end_date date;
ALTER TABLE public.employee_eos_cases ADD CONSTRAINT f12_separation_date_order CHECK (
 employment_end_date IS NULL OR (isfinite(employment_end_date)
 AND (notice_date IS NULL OR employment_end_date>=notice_date)
 AND (last_working_date IS NULL OR employment_end_date>=last_working_date)));
COMMENT ON COLUMN public.employee_eos_cases.employment_end_date IS
 'Recorded employment-end date, distinct from notice and last working dates. Nullable historical unknown; no automatic termination, settlement or access change.';
DO $adopt$
DECLARE signature regprocedure; old_source text; new_source text; definition text; expected text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
 'public.f11_mutate_eos_case(text,bigint,bigint,bigint,uuid,text,jsonb)'::regprocedure,
 'erp_private.f11_capture_eos_case()'::regprocedure] LOOP
  SELECT prosrc,pg_get_functiondef(oid) INTO old_source,definition FROM pg_proc WHERE oid=signature;
  expected:=CASE signature WHEN 'erp_private.f11_capture_eos_case()'::regprocedure
    THEN '2e1c27c39bbaca6ab6b560898920decbab63dfe51427dabe3eac25020269e462'
    ELSE 'e17af89b6e83c29c665be09a1340f26e2a51aab99ad8c2cfe4a2d96c46168d1a' END;
  IF encode(sha256(convert_to(old_source,'UTF8')),'hex')<>expected THEN RAISE EXCEPTION 'Unreviewed EOS predecessor: %',signature;END IF;
  IF signature='erp_private.f11_capture_eos_case()'::regprocedure THEN
   new_source:=replace(old_source,'''last_working_date'',''reason'',''updated_by''','''last_working_date'',''employment_end_date'',''reason'',''updated_by''');
  ELSE
   new_source:=replace(old_source,'last_day date;','last_day date;end_day date;');
   new_source:=replace(new_source,'''last_working_date'',''reason'']','''last_working_date'',''employment_end_date'',''reason'']');
   new_source:=replace(new_source,$old$last_day:=(p_data->>'last_working_date')::date;$old$,
    $new$last_day:=(p_data->>'last_working_date')::date;
  IF p_data?'employment_end_date' AND (jsonb_typeof(p_data->'employment_end_date') NOT IN ('string','null') OR (p_data->>'employment_end_date' IS NOT NULL AND (p_data->>'employment_end_date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$')) THEN RAISE EXCEPTION 'Invalid employment end date' USING ERRCODE='23514';END IF;
  end_day:=(p_data->>'employment_end_date')::date;$new$);
   new_source:=replace(new_source,'notice_date,last_working_date,reason,created_by','notice_date,last_working_date,employment_end_date,reason,created_by');
   new_source:=replace(new_source,'v_type,v_status,notice,last_day,p_data','v_type,v_status,notice,last_day,end_day,p_data');
   new_source:=replace(new_source,$old$last_working_date=last_day,reason=$old$,
    $new$last_working_date=last_day,employment_end_date=CASE WHEN p_data?'employment_end_date' THEN end_day ELSE x.employment_end_date END,reason=$new$);
  END IF;
  IF old_source=new_source OR strpos(new_source,'employment_end_date')=0 THEN RAISE EXCEPTION 'EOS field adoption anchor missing';END IF;
  EXECUTE replace(definition,old_source,new_source);
 END LOOP;
END;
$adopt$;
NOTIFY pgrst,'reload schema';
COMMIT;
