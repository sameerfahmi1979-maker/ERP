
BEGIN;

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope) VALUES
 ('hr.payroll.run.submit','Review, submit and request replacement of scoped monthly payroll','hr','payroll_run_submit','held'),
 ('hr.payroll.run.approve','Independently decide the exact scoped monthly payroll version','hr','payroll_run_approve','held');

CREATE TABLE erp_private.t15_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 run_id uuid NOT NULL REFERENCES erp_private.t14_runs,
 version_id uuid NOT NULL UNIQUE REFERENCES erp_private.t14_versions,
 digest text NOT NULL CHECK(digest~'^[a-f0-9]{64}$'),
 state text NOT NULL DEFAULT 'submitted' CHECK(state IN('submitted','approved','rejected','withdrawn','superseded')),
 submitted_by bigint NOT NULL REFERENCES public.user_profiles,
 submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 acknowledged_count integer NOT NULL CHECK(acknowledged_count>=0),
 decided_by bigint REFERENCES public.user_profiles,
 decided_at timestamptz,
 claim_count integer NOT NULL DEFAULT 0 CHECK(claim_count>=0),
 replacement_requested_by bigint REFERENCES public.user_profiles,
 CHECK((decided_by IS NULL)=(decided_at IS NULL)),
 CHECK((state IN('approved','rejected','superseded'))=(decided_at IS NOT NULL)),
 CHECK(decided_by IS NULL OR submitted_by<>decided_by),
 CHECK(replacement_requested_by IS NULL OR state='approved')
);
CREATE INDEX t15_reviews_run ON erp_private.t15_reviews(run_id,submitted_at DESC,id);
CREATE UNIQUE INDEX t15_open_review ON erp_private.t15_reviews(run_id) WHERE state IN('submitted','approved');

CREATE TABLE erp_private.t15_review_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 review_id uuid NOT NULL REFERENCES erp_private.t15_reviews,
 kind text NOT NULL CHECK(kind IN('submitted','approved','rejected','withdrawn','replacement-requested','replacement-declined','superseded')),
 actor_id bigint NOT NULL REFERENCES public.user_profiles,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),
 facts jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(facts)='object')
);
CREATE INDEX t15_review_history ON erp_private.t15_review_events(review_id,id);

-- Future trusted issuance and reconciliation record events against the exact
-- seal. These receipts record lifecycle only and cannot pay a line.
CREATE TABLE erp_private.t15_bank_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 review_id uuid NOT NULL REFERENCES erp_private.t15_reviews,
 version_id uuid NOT NULL REFERENCES erp_private.t14_versions,
 operation_id uuid NOT NULL UNIQUE,
 kind text NOT NULL CHECK(kind IN('prepared','submitted','unknown','rejected','cancelled','partially-settled','settled','reversed')),
 evidence_id uuid NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX t15_bank_history ON erp_private.t15_bank_events(review_id,id DESC);
ALTER TABLE erp_private.t15_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t15_review_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t15_bank_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.t15_reviews,erp_private.t15_review_events,erp_private.t15_bank_events FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.t15_keep_history() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 RAISE EXCEPTION 'The payroll approval record is retained' USING ERRCODE='55000';
END $$;
CREATE TRIGGER t15_retain_review_events BEFORE UPDATE OR DELETE ON erp_private.t15_review_events
 FOR EACH ROW EXECUTE FUNCTION erp_private.t15_keep_history();
CREATE TRIGGER t15_retain_bank_events BEFORE UPDATE OR DELETE ON erp_private.t15_bank_events
 FOR EACH ROW EXECUTE FUNCTION erp_private.t15_keep_history();

CREATE FUNCTION erp_private.t15_review_permissions(p_company bigint,p_branch bigint,p_mode text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
BEGIN
 IF p_mode NOT IN('submit','approve') THEN RETURN false; END IF;
 RETURN erp_private.t02_has_scope('hr.payroll.run.'||p_mode,p_company,p_branch)
    AND erp_private.t02_has_scope('hr.payroll.view',p_company,p_branch);
END $$;

CREATE FUNCTION erp_private.t15_bank_state(p_review uuid)
RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((SELECT kind FROM erp_private.t15_bank_events WHERE review_id=p_review ORDER BY id DESC LIMIT 1),'not-issued');
$$;

CREATE FUNCTION erp_private.t15_replacement_eligible(p_review uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT erp_private.t15_bank_state(p_review) IN('not-issued','prepared','rejected','cancelled')
    AND NOT EXISTS(SELECT 1 FROM erp_private.t15_bank_events WHERE review_id=p_review AND kind IN('partially-settled','settled','reversed'));
$$;

CREATE FUNCTION erp_private.t15_keep_exact_draft() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- Acquire the same run row as submission/decision before allowing a change.
 PERFORM 1 FROM erp_private.t14_runs WHERE id=NEW.run_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM erp_private.t15_reviews WHERE run_id=NEW.run_id AND state IN('submitted','approved')) THEN
   RAISE EXCEPTION 'Resolve the open payroll submission or approved replacement first' USING ERRCODE='PT409';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER t15_keep_reviewed_version BEFORE INSERT ON erp_private.t14_versions
 FOR EACH ROW EXECUTE FUNCTION erp_private.t15_keep_exact_draft();
CREATE TRIGGER t15_keep_reviewed_adjustments BEFORE INSERT OR UPDATE ON erp_private.t14_adjustments
 FOR EACH ROW EXECUTE FUNCTION erp_private.t15_keep_exact_draft();

CREATE FUNCTION erp_private.t15_exact_recovery_approver() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM erp_private.t14_lines l WHERE l.id=NEW.payroll_line_id) AND NOT EXISTS(
   SELECT 1 FROM erp_private.t15_reviews r WHERE r.id=NEW.gm_approval_id AND r.version_id=NEW.payroll_run_id
      AND r.decided_by=NEW.gm_approver_id AND r.state='approved'
 ) THEN
   RAISE EXCEPTION 'The recovery pin must match the retained GM decision' USING ERRCODE='PT409';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER t15_bind_recovery_approver BEFORE INSERT ON erp_private.t13_payroll_pins
 FOR EACH ROW EXECUTE FUNCTION erp_private.t15_exact_recovery_approver();

CREATE OR REPLACE FUNCTION erp_private.t14_other_draft(p_run uuid,p_employee bigint,p_line jsonb)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(
   SELECT 1 FROM erp_private.t14_draft_usage used
   WHERE used.run_id<>p_run
     AND (used.key=p_line->>'key' OR (used.employee_id=p_employee AND used.span IS NOT NULL
             AND used.span && (p_line->'source'->>'interval')::tstzmultirange))
 ) OR erp_private.t15_other_approval(p_run,p_employee,p_line);
$$;

REVOKE ALL ON FUNCTION erp_private.t15_keep_history(),erp_private.t15_review_permissions(bigint,bigint,text),
 erp_private.t15_bank_state(uuid),erp_private.t15_replacement_eligible(uuid),erp_private.t15_keep_exact_draft(),
 erp_private.t15_exact_recovery_approver()
 FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
