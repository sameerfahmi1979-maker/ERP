-- Keep the physical state for older clients. Only the existing authorized status
-- query may disclose whether its exact unattached stage can no longer be used.
DO $migration$
DECLARE
  source text := pg_catalog.pg_get_functiondef('erp_private.chat_read(text,jsonb,bigint)'::regprocedure);
  old_projection constant text := $old$jsonb_build_object('uploadId',u.id,'conversationId',u.conversation,'byteLength',u.size_bytes,'state',u.state)$old$;
  owner_scope constant text := $scope$ INTO result FROM erp_private.chat_uploads u WHERE u.id=(a->>'uploadId')::uuid AND u.actor=p AND u.reserving_session=(auth.jwt()->>'session_id')::uuid AND erp_private.chat_member(u.conversation,p);$scope$;
  old_lookup constant text := 'SELECT ' || old_projection || owner_scope;
  new_projection constant text := $new$jsonb_build_object(
    'uploadId',u.id,'conversationId',u.conversation,'byteLength',u.size_bytes,'state',u.state,
    'terminal',u.state<>'attached' AND (
      u.state='failed' OR u.cleanup_phase IS NOT NULL OR u.stage_expires_at<=clock_timestamp()
    ))$new$;
BEGIN
  IF length(source) - length(replace(source, old_lookup, '')) <> length(old_lookup) THEN
    RAISE EXCEPTION 'Unexpected scoped chat upload status lookup';
  END IF;
  EXECUTE replace(source, old_lookup, 'SELECT ' || new_projection || owner_scope);
END
$migration$;
