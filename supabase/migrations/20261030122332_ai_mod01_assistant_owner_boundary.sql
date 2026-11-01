-- AI-MOD-01: additive owner fences for retained Assistant conversations.
-- No data, roles, existing permissive policies, F03 guards or RPCs are changed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE target regclass;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'public.erp_ai_assistant_sessions'::regclass,
    'public.erp_ai_assistant_messages'::regclass,
    'public.erp_ai_assistant_action_drafts'::regclass
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = target AND relrowsecurity AND relforcerowsecurity)
       OR NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = target AND polname = 'f03_principal' AND NOT polpermissive) THEN
      RAISE EXCEPTION 'AI-MOD-01 expected existing RLS/principal boundary is missing';
    END IF;
  END LOOP;
END $$;

CREATE POLICY ai_mod01_assistant_owner ON public.erp_ai_assistant_sessions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (owner_user_profile_id = (SELECT public.current_user_profile_id()) AND (
    public.current_user_has_permission('ai.assistant.use') OR public.current_user_has_permission('ai.assistant.view')
    OR public.current_user_has_permission('ai.assistant.admin') OR public.current_user_has_role('system_admin')
  ))
  WITH CHECK (owner_user_profile_id = (SELECT public.current_user_profile_id()) AND (
    public.current_user_has_permission('ai.assistant.use') OR public.current_user_has_permission('ai.assistant.view')
    OR public.current_user_has_permission('ai.assistant.admin') OR public.current_user_has_role('system_admin')
  ));

CREATE POLICY ai_mod01_assistant_owner ON public.erp_ai_assistant_messages
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.erp_ai_assistant_sessions s
    WHERE s.id = erp_ai_assistant_messages.session_id
      AND s.owner_user_profile_id = (SELECT public.current_user_profile_id())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.erp_ai_assistant_sessions s
    WHERE s.id = erp_ai_assistant_messages.session_id
      AND s.owner_user_profile_id = (SELECT public.current_user_profile_id())
  ));

CREATE POLICY ai_mod01_assistant_owner ON public.erp_ai_assistant_action_drafts
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.erp_ai_assistant_sessions s
    WHERE s.id = erp_ai_assistant_action_drafts.session_id
      AND s.owner_user_profile_id = (SELECT public.current_user_profile_id())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.erp_ai_assistant_sessions s
    WHERE s.id = erp_ai_assistant_action_drafts.session_id
      AND s.owner_user_profile_id = (SELECT public.current_user_profile_id())
  ));

COMMENT ON POLICY ai_mod01_assistant_owner ON public.erp_ai_assistant_sessions IS
  'AI configuration/admin access never grants another person conversation content; existing F03 and permission policies still apply.';
COMMIT;
