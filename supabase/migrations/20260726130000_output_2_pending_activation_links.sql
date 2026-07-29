-- ═══════════════════════════════════════════════════════════════════════════
-- OUTPUT.2 — Pending-activation public links (QR activation-last support)
--
-- The coordinator embeds the QR image INSIDE the official PDF, so the link row
-- (and its token/URL) must exist BEFORE rendering. Activation-last is enforced
-- by a new 'pending_activation' status:
--   * created before render  → status = 'pending_activation'
--   * flipped to 'valid' ONLY after the issuance reaches lifecycle 'issued'
--   * the public RPC treats pending_activation tokens as NOT FOUND
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Extend the status check constraint
ALTER TABLE erp_output_public_links DROP CONSTRAINT IF EXISTS chk_output_link_status;
ALTER TABLE erp_output_public_links ADD CONSTRAINT chk_output_link_status
  CHECK (status = ANY (ARRAY['pending_activation'::text, 'valid'::text, 'expired'::text, 'cancelled'::text, 'superseded'::text]));

-- 2. Public verification RPC: a pending_activation token must behave exactly
--    like a nonexistent token (no metadata disclosure, no view counting).
CREATE OR REPLACE FUNCTION public.get_public_verification_by_token(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_link public.erp_output_public_links%ROWTYPE;
  v_superseded_token TEXT;
  v_payload JSONB;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 32 THEN RETURN NULL; END IF;
  SELECT * INTO v_link FROM public.erp_output_public_links
  WHERE public_token = p_token AND deleted_at IS NULL LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- OUTPUT.2: not-yet-activated tokens are invisible to the public.
  IF v_link.status = 'pending_activation' THEN RETURN NULL; END IF;
  IF v_link.status = 'valid' AND v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    UPDATE public.erp_output_public_links SET status = 'expired', updated_at = now() WHERE id = v_link.id;
    v_link.status := 'expired';
  END IF;
  BEGIN
    UPDATE public.erp_output_public_links SET view_count = view_count + 1, last_viewed_at = now() WHERE id = v_link.id;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF v_link.superseded_by_link_id IS NOT NULL THEN
    SELECT sub.public_token INTO v_superseded_token FROM public.erp_output_public_links sub
    WHERE sub.id = v_link.superseded_by_link_id AND sub.deleted_at IS NULL;
  END IF;
  v_payload := CASE
    WHEN v_link.status != 'valid' THEN '{}'::jsonb
    WHEN v_link.access_level IN ('full_view', 'full_view_download_ready') THEN v_link.public_payload_json
    WHEN v_link.access_level = 'summary' THEN v_link.verification_summary_json
    ELSE '{}'::jsonb
  END;
  RETURN jsonb_build_object(
    'status', v_link.status,
    'access_level', v_link.access_level,
    'output_type', v_link.output_type,
    'document_title', v_link.document_title,
    'document_subtitle', v_link.document_subtitle,
    'document_ref', v_link.document_ref,
    'document_date', v_link.document_date,
    'issued_at', v_link.issued_at,
    'expires_at', v_link.expires_at,
    'cancelled_at', v_link.cancelled_at,
    'cancel_reason', CASE WHEN v_link.status = 'cancelled' THEN v_link.cancel_reason ELSE NULL END,
    'verification_summary', v_link.verification_summary_json,
    'public_payload', v_payload,
    'download_enabled', (v_link.download_enabled AND v_link.access_level = 'full_view_download_ready' AND v_link.status = 'valid'),
    'superseded_by_token', v_superseded_token
  );
END;
$function$;
