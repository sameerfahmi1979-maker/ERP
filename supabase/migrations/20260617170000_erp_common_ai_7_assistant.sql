-- ERP COMMON AI.7 — AI Assistant for Actions
-- Adds ai.assistant.use/view/admin permissions
-- Creates erp_ai_assistant_sessions, erp_ai_assistant_messages, erp_ai_assistant_action_drafts
-- Feature flag ERP_AI_ASSISTANT already exists (is_enabled=true) — do NOT recreate

-- ── Permissions ────────────────────────────────────────────────────────────────

INSERT INTO permissions (permission_code, permission_name, description, module_code, action_code, is_active)
VALUES
  ('ai.assistant.use',   'Use AI Assistant',          'Send messages and use the ERP AI assistant',     'AI', 'use',   true),
  ('ai.assistant.view',  'View AI Assistant Sessions', 'View AI assistant sessions and action drafts',   'AI', 'view',  true),
  ('ai.assistant.admin', 'Administer AI Assistant',    'View all sessions and manage assistant settings', 'AI', 'admin', true)
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code IN ('system_admin', 'group_admin', 'company_admin')
  AND p.permission_code IN ('ai.assistant.use', 'ai.assistant.view', 'ai.assistant.admin')
ON CONFLICT DO NOTHING;

-- ── erp_ai_assistant_sessions ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_ai_assistant_sessions (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_code          TEXT NOT NULL,
  title                 TEXT,
  owner_user_profile_id BIGINT NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  context_entity_type   TEXT,
  context_entity_id     BIGINT,
  status                TEXT NOT NULL DEFAULT 'active',
  message_count         INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ,

  CONSTRAINT erp_ai_assistant_sessions_code_key UNIQUE (session_code),
  CONSTRAINT erp_ai_assistant_sessions_status_chk CHECK (
    status IN ('active', 'completed', 'failed', 'archived')
  )
);

COMMENT ON TABLE public.erp_ai_assistant_sessions IS
  'COMMON AI.7 — AI Assistant session per user. Never stores raw prompts, '
  'raw AI responses, OCR text, content_text, or sensitive values.';

CREATE INDEX IF NOT EXISTS idx_erp_ai_assistant_sessions_owner
  ON public.erp_ai_assistant_sessions (owner_user_profile_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE TRIGGER set_erp_ai_assistant_sessions_updated_at
  BEFORE UPDATE ON public.erp_ai_assistant_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.erp_ai_assistant_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_ai_assistant_sessions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_ai_assistant_sessions_select ON public.erp_ai_assistant_sessions;
CREATE POLICY erp_ai_assistant_sessions_select
  ON public.erp_ai_assistant_sessions FOR SELECT
  USING (
    (owner_user_profile_id = current_user_profile_id() AND deleted_at IS NULL)
    OR current_user_has_permission('ai.assistant.admin')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS erp_ai_assistant_sessions_insert ON public.erp_ai_assistant_sessions;
CREATE POLICY erp_ai_assistant_sessions_insert
  ON public.erp_ai_assistant_sessions FOR INSERT
  WITH CHECK (
    owner_user_profile_id = current_user_profile_id()
    AND (
      current_user_has_permission('ai.assistant.use')
      OR current_user_has_role('system_admin')
    )
  );

DROP POLICY IF EXISTS erp_ai_assistant_sessions_update ON public.erp_ai_assistant_sessions;
CREATE POLICY erp_ai_assistant_sessions_update
  ON public.erp_ai_assistant_sessions FOR UPDATE
  USING (
    owner_user_profile_id = current_user_profile_id()
    OR current_user_has_permission('ai.assistant.admin')
    OR current_user_has_role('system_admin')
  )
  WITH CHECK (
    owner_user_profile_id = current_user_profile_id()
    OR current_user_has_permission('ai.assistant.admin')
    OR current_user_has_role('system_admin')
  );

-- ── erp_ai_assistant_messages ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_ai_assistant_messages (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id         BIGINT NOT NULL REFERENCES public.erp_ai_assistant_sessions(id) ON DELETE CASCADE,
  role               TEXT NOT NULL,
  message_text       TEXT NOT NULL,
  output_type        TEXT,
  safe_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT erp_ai_assistant_messages_role_chk CHECK (role IN ('user', 'assistant', 'system_notice')),
  CONSTRAINT erp_ai_assistant_messages_text_len_chk CHECK (char_length(message_text) BETWEEN 1 AND 4000)
);

COMMENT ON TABLE public.erp_ai_assistant_messages IS
  'COMMON AI.7 — Sanitized assistant conversation messages. Append-only (no UPDATE/DELETE). '
  'message_text is human-readable only, capped at 4000 chars. '
  'Never stores raw prompts, raw AI responses, OCR text, or API keys.';

CREATE INDEX IF NOT EXISTS idx_erp_ai_assistant_messages_session
  ON public.erp_ai_assistant_messages (session_id, created_at);

ALTER TABLE public.erp_ai_assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_ai_assistant_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_ai_assistant_messages_select ON public.erp_ai_assistant_messages;
CREATE POLICY erp_ai_assistant_messages_select
  ON public.erp_ai_assistant_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.erp_ai_assistant_sessions s
      WHERE s.id = session_id
        AND (
          s.owner_user_profile_id = current_user_profile_id()
          OR current_user_has_permission('ai.assistant.admin')
          OR current_user_has_role('system_admin')
        )
    )
  );

DROP POLICY IF EXISTS erp_ai_assistant_messages_insert ON public.erp_ai_assistant_messages;
CREATE POLICY erp_ai_assistant_messages_insert
  ON public.erp_ai_assistant_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.erp_ai_assistant_sessions s
      WHERE s.id = session_id
        AND s.owner_user_profile_id = current_user_profile_id()
    )
    AND (
      current_user_has_permission('ai.assistant.use')
      OR current_user_has_role('system_admin')
    )
  );
-- No UPDATE, no DELETE on messages — append-only

-- ── erp_ai_assistant_action_drafts ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_ai_assistant_action_drafts (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id          BIGINT NOT NULL REFERENCES public.erp_ai_assistant_sessions(id) ON DELETE CASCADE,
  action_code         TEXT NOT NULL,
  safety_class        TEXT NOT NULL,
  target_entity_type  TEXT,
  target_entity_id    BIGINT,
  draft_payload_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  status              TEXT NOT NULL DEFAULT 'draft',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at         TIMESTAMPTZ,
  reviewed_by         BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  deleted_at          TIMESTAMPTZ,

  CONSTRAINT erp_ai_assistant_drafts_status_chk CHECK (
    status IN ('draft', 'reviewed', 'accepted_for_manual_action', 'dismissed', 'superseded', 'failed')
  ),
  CONSTRAINT erp_ai_assistant_drafts_safety_chk CHECK (
    safety_class IN ('read_only', 'navigation', 'draft_only', 'requires_confirmation', 'blocked_dangerous')
  )
);

COMMENT ON TABLE public.erp_ai_assistant_action_drafts IS
  'COMMON AI.7 — AI-prepared action drafts awaiting human review. '
  'draft_payload_json must never contain raw AI responses, prompts, OCR text, '
  'content_text, or sensitive values. Status-only updates allowed after creation.';

CREATE INDEX IF NOT EXISTS idx_erp_ai_assistant_drafts_session
  ON public.erp_ai_assistant_action_drafts (session_id, status)
  WHERE deleted_at IS NULL;

ALTER TABLE public.erp_ai_assistant_action_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_ai_assistant_action_drafts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_ai_assistant_drafts_select ON public.erp_ai_assistant_action_drafts;
CREATE POLICY erp_ai_assistant_drafts_select
  ON public.erp_ai_assistant_action_drafts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.erp_ai_assistant_sessions s
      WHERE s.id = session_id
        AND (
          s.owner_user_profile_id = current_user_profile_id()
          OR current_user_has_permission('ai.assistant.admin')
          OR current_user_has_role('system_admin')
        )
    )
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS erp_ai_assistant_drafts_insert ON public.erp_ai_assistant_action_drafts;
CREATE POLICY erp_ai_assistant_drafts_insert
  ON public.erp_ai_assistant_action_drafts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.erp_ai_assistant_sessions s
      WHERE s.id = session_id
        AND s.owner_user_profile_id = current_user_profile_id()
    )
    AND (
      current_user_has_permission('ai.actions.prepare')
      OR current_user_has_role('system_admin')
    )
  );

DROP POLICY IF EXISTS erp_ai_assistant_drafts_update ON public.erp_ai_assistant_action_drafts;
CREATE POLICY erp_ai_assistant_drafts_update
  ON public.erp_ai_assistant_action_drafts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.erp_ai_assistant_sessions s
      WHERE s.id = session_id
        AND (
          s.owner_user_profile_id = current_user_profile_id()
          OR current_user_has_permission('ai.assistant.admin')
          OR current_user_has_role('system_admin')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.erp_ai_assistant_sessions s
      WHERE s.id = session_id
        AND (
          s.owner_user_profile_id = current_user_profile_id()
          OR current_user_has_permission('ai.assistant.admin')
          OR current_user_has_role('system_admin')
        )
    )
  );
