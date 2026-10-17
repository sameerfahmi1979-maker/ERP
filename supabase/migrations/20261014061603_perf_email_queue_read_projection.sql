BEGIN;
-- Minimal caller-RLS projection; delivery workers, body payloads and base ACLs
-- are unchanged. Native composition/permission acceptance precedes deployment.
CREATE VIEW public.perf_email_queue_read
WITH (security_invoker = true, security_barrier = true)
AS SELECT
 q.id,q.queue_code,q.notification_id,q.provider_config_id,q.source_module,
 q.source_entity_type,q.source_entity_id,q.priority,q.status,q.from_email,
 q.to_emails,q.subject,q.template_code,q.scheduled_for,q.sent_at,q.cancelled_at,
 q.attempt_count,q.max_attempts,q.next_retry_at,q.external_message_id,q.created_at,
 q.deleted_at,
 CASE WHEN q.last_error IS NOT NULL AND q.last_error<>'' THEN 'Delivery error recorded; inspect the authorized diagnostic record.'::text ELSE NULL::text END AS last_error,
 q.id::text AS id_search,
 pg_catalog.array_to_string(q.to_emails,' ') AS recipients_search
FROM public.erp_email_queue q;
REVOKE ALL ON public.perf_email_queue_read FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.perf_email_queue_read TO authenticated;
COMMENT ON VIEW public.perf_email_queue_read IS 'PERF-P04 bounded queue metadata; excludes message bodies, template variables, CC/BCC and raw provider errors.';
COMMIT;
