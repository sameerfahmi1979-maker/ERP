BEGIN;
CREATE VIEW public.perf_notification_delivery_read
WITH (security_invoker=true,security_barrier=true)
AS SELECT id,notification_id,email_queue_id,delivery_channel,status,duration_ms,attempt_number,created_at,
 CASE WHEN message IS NOT NULL AND message<>'' THEN 'Delivery diagnostic recorded.'::text ELSE NULL::text END AS message,
 CASE WHEN error_message IS NOT NULL AND error_message<>'' THEN 'Delivery error recorded; inspect the authorized diagnostic record.'::text ELSE NULL::text END AS error_message,
 id::text AS id_search,notification_id::text AS notification_search,email_queue_id::text AS queue_search,
 attempt_number::text AS attempt_search,duration_ms::text AS duration_search
FROM public.erp_notification_delivery_logs;
REVOKE ALL ON public.perf_notification_delivery_read FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.perf_notification_delivery_read TO authenticated;

CREATE VIEW public.perf_dms_notification_read
WITH (security_invoker=true,security_barrier=true)
AS WITH notifications AS MATERIALIZED (
 SELECT id,document_id,recipient_user_id,subject,message,channel,status,scheduled_for,read_at,
  bridge_status,global_notification_id,global_email_queue_id
 FROM public.dms_notification_queue
), documents AS MATERIALIZED (
 -- Point-evaluate the same table RLS once per distinct permitted parent.
 -- No privileged label source, whole document table scan or new authority.
 SELECT d.id,d.document_no
 FROM (SELECT DISTINCT document_id FROM notifications) ids
 CROSS JOIN LATERAL (
  SELECT id,document_no FROM public.dms_documents WHERE id=ids.document_id OFFSET 0
 ) d
)
SELECT n.id,n.document_id,n.recipient_user_id,n.subject,n.message,n.channel,n.status,n.scheduled_for,n.read_at,
 n.bridge_status,n.global_notification_id,n.global_email_queue_id,d.id AS visible_document_id,d.document_no
FROM notifications n
LEFT JOIN documents d ON d.id=n.document_id;
REVOKE ALL ON public.perf_dms_notification_read FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.perf_dms_notification_read TO authenticated;
COMMIT;
