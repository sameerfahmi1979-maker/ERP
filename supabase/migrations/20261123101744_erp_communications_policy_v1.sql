-- Communications safety control plane. The current terms remain empty until the owner approves the release text.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

ALTER TABLE erp_private.comms_policy_versions ADD COLUMN terms_text text;
ALTER TABLE erp_private.comms_policy_versions ADD CONSTRAINT comms_current_policy_has_text
 CHECK (NOT is_current OR coalesce(length(btrim(terms_text)),0) BETWEEN 1 AND 20000);

CREATE FUNCTION erp_private.comms_policy_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF (NEW.version,NEW.terms_text) IS DISTINCT FROM (OLD.version,OLD.terms_text)
 AND (OLD.is_current OR EXISTS(SELECT FROM erp_private.comms_policy_acceptances WHERE version=OLD.version)) THEN
  RAISE EXCEPTION 'Publish revised terms under a new version' USING ERRCODE='PT409';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER comms_policy_immutable BEFORE UPDATE OF version,terms_text ON erp_private.comms_policy_versions
 FOR EACH ROW EXECUTE FUNCTION erp_private.comms_policy_immutable();

CREATE TABLE erp_private.comms_moderators (
 profile_id bigint PRIMARY KEY REFERENCES public.user_profiles ON DELETE CASCADE,
 enabled boolean NOT NULL,
 assigned_by bigint NOT NULL,
 assigned_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Historical identities remain stable numeric references when ERP removes an authentication account.
CREATE TABLE erp_private.comms_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reporter_id bigint NOT NULL,
 subject_id bigint,
 kind text NOT NULL CHECK(kind IN('user','chat_message','chat_thread','ptt_transmission','ptt_channel','ptt_sos')),
 source_id uuid,
 conversation_id uuid,
 source_revision bigint,
 source_at timestamptz,
 reason text NOT NULL CHECK(reason IN('harassment_threats','hate_discrimination','sexual_exploitation','impersonation_spam','privacy','other')),
 details text CHECK(details IS NULL OR length(details) BETWEEN 1 AND 1000),
 report_fingerprint bytea NOT NULL,
 status text NOT NULL DEFAULT 'new' CHECK(status IN('new','in_review','closed')),
 outcome text CHECK(outcome IN('dismiss','hideContent','restrictCommunication')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((kind='user' AND subject_id IS NOT NULL AND source_id IS NULL AND conversation_id IS NULL)
 OR (kind<>'user' AND source_id IS NOT NULL AND conversation_id IS NOT NULL)),
 CHECK ((status='closed') = (outcome IS NOT NULL))
);
CREATE INDEX comms_reports_page ON erp_private.comms_reports(created_at DESC,id DESC);
CREATE INDEX comms_reports_rate ON erp_private.comms_reports(reporter_id,created_at DESC);
CREATE INDEX comms_reports_recent_duplicate ON erp_private.comms_reports(reporter_id,report_fingerprint,created_at DESC) WHERE status<>'closed';
CREATE TABLE erp_private.comms_report_actions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 report_id uuid NOT NULL REFERENCES erp_private.comms_reports,
 moderator_id bigint NOT NULL,
 action text NOT NULL CHECK(action IN('review','dismiss','hideContent','restrictCommunication')),
 note text CHECK(note IS NULL OR length(note) BETWEEN 1 AND 1000),
 created_at timestamptz NOT NULL
);
CREATE TABLE erp_private.comms_moderated_content (
 kind text NOT NULL CHECK(kind IN('ptt_transmission','ptt_sos')),
 source_id uuid NOT NULL,
 report_id uuid NOT NULL REFERENCES erp_private.comms_reports,
 PRIMARY KEY(kind,source_id)
);
CREATE TABLE erp_private.comms_restrictions (
 report_id uuid PRIMARY KEY REFERENCES erp_private.comms_reports,
 profile_id bigint NOT NULL,
 until_at timestamptz NOT NULL
);
CREATE INDEX comms_restrictions_active_lookup ON erp_private.comms_restrictions(profile_id,until_at DESC);
CREATE TABLE erp_private.comms_policy_mutations (
 actor_id bigint NOT NULL REFERENCES public.user_profiles ON DELETE CASCADE,
 mutation_id uuid NOT NULL,
 request_hash bytea NOT NULL,
 result jsonb NOT NULL,
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(actor_id,mutation_id)
);

CREATE INDEX comms_policy_recent_mutations ON erp_private.comms_policy_mutations(actor_id,expires_at DESC,mutation_id DESC);

CREATE FUNCTION erp_private.comms_can_moderate_profile(p bigint) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT erp_private.chat_active(p)
 AND EXISTS(SELECT FROM erp_private.comms_moderators WHERE profile_id=p AND enabled)
$$;
CREATE OR REPLACE FUNCTION erp_private.comms_moderation_hidden(kind text,id uuid) RETURNS boolean
 LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM erp_private.comms_moderated_content m WHERE m.kind=$1 AND m.source_id=$2)
$$;
CREATE OR REPLACE FUNCTION erp_private.notification_moderation_target(p_case uuid,p_recipient bigint) RETURNS jsonb
 LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('kind','moderation','id',p_case,'label','Moderation report','category','moderation','pushEligible',true)
 FROM erp_private.comms_reports WHERE id=p_case AND status<>'closed'
 AND erp_private.comms_can_moderate_profile(p_recipient)
$$;

CREATE FUNCTION erp_private.comms_require_unrestricted(p bigint) RETURNS void LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT FROM erp_private.comms_restrictions WHERE profile_id=p AND until_at>statement_timestamp()) THEN
  RAISE EXCEPTION 'Communications unavailable' USING ERRCODE='42501';
 END IF;
END $$;

-- Keep cleanup, historic access and protection settings independent of a posting restriction.
CREATE FUNCTION erp_private.comms_check_contribution() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 CASE TG_TABLE_NAME
  WHEN 'chat_messages' THEN
   IF NEW.kind<>'notice' THEN PERFORM erp_private.comms_require_unrestricted(NEW.sender); END IF;
  WHEN 'chat_uploads' THEN
   IF NEW.state IN('reserved','verified','attached') THEN PERFORM erp_private.comms_require_unrestricted(NEW.actor); END IF;
  WHEN 'chat_conversations' THEN
   IF TG_OP='INSERT' THEN PERFORM erp_private.comms_require_unrestricted(NEW.creator);
   ELSIF NEW.name IS DISTINCT FROM OLD.name THEN PERFORM erp_private.comms_require_unrestricted(erp_private.comms_actor_id()); END IF;
  WHEN 'ptt_channels' THEN
   IF TG_OP='INSERT' THEN PERFORM erp_private.comms_require_unrestricted(NEW.creator);
   ELSIF (NEW.name,NEW.description) IS DISTINCT FROM (OLD.name,OLD.description) THEN
    PERFORM erp_private.comms_require_unrestricted(erp_private.comms_actor_id());
   END IF;
  WHEN 'ptt_leases' THEN
   PERFORM erp_private.comms_require_unrestricted(NEW.profile_id);
  WHEN 'chat_reactions' THEN
   PERFORM erp_private.comms_require_unrestricted(NEW.profile_id);
 END CASE;
 RETURN NEW;
END $$;
CREATE TRIGGER comms_chat_message_guard BEFORE INSERT OR UPDATE OF body ON erp_private.chat_messages
 FOR EACH ROW EXECUTE FUNCTION erp_private.comms_check_contribution();
CREATE TRIGGER comms_chat_upload_guard BEFORE INSERT OR UPDATE OF state ON erp_private.chat_uploads
 FOR EACH ROW EXECUTE FUNCTION erp_private.comms_check_contribution();
CREATE TRIGGER comms_chat_conversation_guard BEFORE INSERT OR UPDATE OF name ON erp_private.chat_conversations
 FOR EACH ROW EXECUTE FUNCTION erp_private.comms_check_contribution();
CREATE TRIGGER comms_chat_reaction_guard BEFORE INSERT ON erp_private.chat_reactions
 FOR EACH ROW EXECUTE FUNCTION erp_private.comms_check_contribution();
CREATE TRIGGER comms_ptt_channel_guard BEFORE INSERT OR UPDATE OF name,description ON erp_private.ptt_channels
 FOR EACH ROW EXECUTE FUNCTION erp_private.comms_check_contribution();
CREATE TRIGGER comms_ptt_speech_guard BEFORE INSERT ON erp_private.ptt_leases
 FOR EACH ROW EXECUTE FUNCTION erp_private.comms_check_contribution();

CREATE FUNCTION erp_private.comms_report_source(p_kind text,p_target text,p_actor bigint)
 RETURNS TABLE(source_id uuid,conversation_id uuid,subject_id bigint,source_revision bigint,source_at timestamptz)
 LANGUAGE plpgsql SET search_path='' AS $$
DECLARE target uuid;
BEGIN
 IF p_kind='user' THEN
  subject_id:=p_target::bigint;
  IF subject_id=p_actor OR NOT erp_private.chat_active(subject_id) THEN RETURN; END IF;
  RETURN NEXT; RETURN;
 END IF;
 target:=p_target::uuid;
 IF p_kind IN('chat_message','chat_thread') THEN
  SELECT c.id INTO conversation_id FROM erp_private.chat_conversations c
  WHERE c.id=CASE WHEN p_kind='chat_thread' THEN target ELSE (SELECT conversation FROM erp_private.chat_messages WHERE id=target) END
  FOR SHARE;
  IF conversation_id IS NULL OR NOT erp_private.chat_member(conversation_id,p_actor) THEN RETURN; END IF;
  IF p_kind='chat_message' THEN
   RETURN QUERY SELECT m.id,m.conversation,m.sender,m.revision,m.sent_at FROM erp_private.chat_messages m
    WHERE m.id=target AND m.deleted_at IS NULL AND m.kind<>'notice' FOR SHARE;
  ELSE
   RETURN QUERY SELECT c.id,c.id,NULL::bigint,c.revision,NULL::timestamptz FROM erp_private.chat_conversations c
    WHERE c.id=conversation_id AND c.kind='group';
  END IF;
  RETURN;
 END IF;

 PERFORM erp_private.ptt_lock();
 IF p_kind='ptt_channel' THEN
  RETURN QUERY SELECT c.id,c.id,NULL::bigint,c.revision,NULL::timestamptz FROM erp_private.ptt_channels c
   WHERE c.id=target AND c.kind='group' AND (
    (c.discoverable AND NOT c.archived) OR EXISTS(SELECT FROM erp_private.ptt_current_memberships m WHERE m.channel_id=c.id AND m.profile_id=p_actor AND m.left_at IS NULL)
    OR EXISTS(SELECT FROM erp_private.ptt_requests r WHERE r.channel_id=c.id AND r.profile_id=p_actor AND r.invited));
 ELSIF p_kind='ptt_transmission' THEN
  RETURN QUERY SELECT l.id,l.channel_id,l.profile_id,NULL::bigint,l.started_at FROM erp_private.ptt_leases l
   JOIN erp_private.ptt_recordings r ON r.lease_id=l.id
   WHERE l.id=target AND NOT erp_private.comms_moderation_hidden(p_kind,l.id)
    AND erp_private.ptt_history_allowed(l.channel_id,l.started_at,'participant');
 ELSIF p_kind='ptt_sos' THEN
  RETURN QUERY SELECT e.id,e.channel_id,e.sender_id,NULL::bigint,o.created_at FROM erp_private.ptt_sos_events e
   JOIN erp_private.ptt_sos_events o ON o.id=e.incident_id
   WHERE e.id=target AND NOT erp_private.comms_moderation_hidden(p_kind,e.id)
    AND erp_private.ptt_history_allowed(e.channel_id,o.created_at,'participant');
 END IF;
END $$;

CREATE FUNCTION erp_private.comms_report_evidence(r erp_private.comms_reports) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE
  WHEN r.kind='user' THEN erp_private.chat_active(r.subject_id)
  WHEN r.kind IN('chat_message','chat_thread') THEN erp_private.chat_review(r.conversation_id)
  ELSE erp_private.ptt_history_allowed(r.conversation_id,coalesce(r.source_at,r.created_at),'review')
 END
$$;
CREATE FUNCTION erp_private.comms_report_summary(r erp_private.comms_reports,detail boolean) RETURNS jsonb
 LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE visible boolean:=erp_private.comms_report_evidence(r);
BEGIN
 RETURN jsonb_build_object('caseId',r.id,'kind',r.kind,'reason',r.reason,'status',r.status,
  'createdAt',r.created_at,'updatedAt',r.updated_at,'evidenceAvailable',visible)
  || CASE WHEN detail THEN jsonb_build_object(
      'targetId',CASE WHEN visible THEN CASE WHEN r.kind='user' THEN r.subject_id::text ELSE r.source_id::text END END,
      'conversationId',CASE WHEN visible THEN r.conversation_id END,
      'details',CASE WHEN visible THEN r.details END,
      'outcome',r.outcome,
      'recordingAvailable',CASE WHEN visible AND r.kind='ptt_transmission' THEN
       EXISTS(SELECT FROM erp_private.ptt_recordings WHERE lease_id=r.source_id AND verified_at IS NOT NULL) END,
      'sourceChanged',CASE WHEN visible AND r.source_revision IS NOT NULL THEN CASE r.kind
       WHEN 'chat_message' THEN EXISTS(SELECT FROM erp_private.chat_messages WHERE id=r.source_id AND revision<>r.source_revision)
       WHEN 'chat_thread' THEN EXISTS(SELECT FROM erp_private.chat_conversations WHERE id=r.source_id AND revision<>r.source_revision)
       WHEN 'ptt_channel' THEN EXISTS(SELECT FROM erp_private.ptt_channels WHERE id=r.source_id AND revision<>r.source_revision)
       ELSE false END END
    ) ELSE '{}'::jsonb END;
END $$;

-- PostgREST callers can reach this entry point directly. Bounds and field types apply here as well as in TypeScript.
CREATE FUNCTION erp_private.comms_validate_policy(p_op text,a jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE required_keys text[]; allowed_keys text[]; pair record;
BEGIN
 CASE p_op
  WHEN 'policy.status', 'policy.blocks' THEN required_keys:=ARRAY[]::text[]; allowed_keys:=required_keys;
  WHEN 'policy.accept' THEN required_keys:=ARRAY['version','clientMutationId']; allowed_keys:=required_keys;
  WHEN 'policy.block' THEN required_keys:=ARRAY['targetProfileId','blocked','clientMutationId']; allowed_keys:=required_keys;
  WHEN 'policy.report' THEN required_keys:=ARRAY['kind','targetId','reason','clientMutationId']; allowed_keys:=required_keys||'details'::text;
  WHEN 'policy.cases' THEN required_keys:=ARRAY[]::text[]; allowed_keys:=ARRAY['limit','before'];
  WHEN 'policy.case' THEN required_keys:=ARRAY['caseId']; allowed_keys:=required_keys;
  WHEN 'policy.moderate' THEN required_keys:=ARRAY['caseId','action','clientMutationId']; allowed_keys:=required_keys||ARRAY['note','until'];
  WHEN 'policy.setModerator' THEN required_keys:=ARRAY['targetProfileId','enabled','clientMutationId']; allowed_keys:=required_keys;
  ELSE RAISE EXCEPTION 'Invalid policy command' USING ERRCODE='22023';
 END CASE;
 IF jsonb_typeof(a) IS DISTINCT FROM 'object' OR NOT (a ?& required_keys) OR a-allowed_keys<>'{}' THEN
  RAISE EXCEPTION 'Invalid policy fields' USING ERRCODE='22023';
 END IF;
 FOR pair IN SELECT key,value FROM jsonb_each(a) LOOP
  IF jsonb_typeof(pair.value)<>(CASE WHEN pair.key IN('blocked','enabled') THEN 'boolean' WHEN pair.key='limit' THEN 'number' ELSE 'string' END) THEN
   RAISE EXCEPTION 'Invalid policy field type' USING ERRCODE='22023';
  END IF;
 END LOOP;
 IF a ? 'version' AND a->>'version' !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' THEN RAISE EXCEPTION 'Invalid policy version' USING ERRCODE='22023'; END IF;
 IF a ? 'targetProfileId' AND (a->>'targetProfileId' !~ '^[1-9][0-9]{0,18}$' OR (a->>'targetProfileId')::numeric>9223372036854775807) THEN
  RAISE EXCEPTION 'Invalid ERP profile' USING ERRCODE='22023';
 END IF;
 IF a ? 'limit' AND (a->>'limit' !~ '^[1-9][0-9]{0,2}$' OR (a->>'limit')::integer>100) THEN
  RAISE EXCEPTION 'Invalid page size' USING ERRCODE='22023';
 END IF;
 IF a ? 'clientMutationId' THEN PERFORM (a->>'clientMutationId')::uuid; END IF;
 IF a ? 'caseId' THEN PERFORM (a->>'caseId')::uuid; END IF;
 IF a ? 'before' THEN PERFORM (a->>'before')::uuid; END IF;
 IF a ? 'details' AND length(btrim(a->>'details')) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid details' USING ERRCODE='22023'; END IF;
 IF a ? 'note' AND length(btrim(a->>'note')) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid note' USING ERRCODE='22023'; END IF;
 IF p_op='policy.report' THEN
  IF a->>'kind' NOT IN('user','chat_message','chat_thread','ptt_transmission','ptt_channel','ptt_sos') OR
   a->>'reason' NOT IN('harassment_threats','hate_discrimination','sexual_exploitation','impersonation_spam','privacy','other') THEN
   RAISE EXCEPTION 'Invalid report type' USING ERRCODE='22023';
  END IF;
  IF a->>'kind'='user' THEN
   IF a->>'targetId' !~ '^[1-9][0-9]{0,18}$' OR (a->>'targetId')::numeric>9223372036854775807 THEN
    RAISE EXCEPTION 'Invalid ERP profile' USING ERRCODE='22023';
   END IF;
  ELSE PERFORM (a->>'targetId')::uuid;
  END IF;
 END IF;
 IF a ? 'until' AND a->>'until' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
  RAISE EXCEPTION 'Invalid moderation expiry' USING ERRCODE='22023';
 END IF;
 IF p_op='policy.moderate' AND (a->>'action' NOT IN('review','dismiss','hideContent','restrictCommunication') OR
   ((a->>'action'='restrictCommunication') IS DISTINCT FROM (a ? 'until'))) THEN
  RAISE EXCEPTION 'Invalid moderation action' USING ERRCODE='22023';
 END IF;
END $$;

CREATE FUNCTION public.erp_communications_policy_v1(p_request jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 p bigint; target bigint; direct_ptt uuid; a jsonb:=p_request->'args'; op text:=p_request->>'op';
 policy erp_private.comms_policy_versions; receipt erp_private.comms_policy_mutations;
 r erp_private.comms_reports; page_before erp_private.comms_reports; source record;
 result jsonb; fingerprint bytea; report_digest bytea; mutation uuid; n int; changed timestamptz; deadline timestamptz; action text; flag boolean;
BEGIN
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR jsonb_typeof(p_request->'op') IS DISTINCT FROM 'string'
 OR p_request-ARRAY['op','args']<>'{}' OR octet_length(p_request::text)>16384 THEN
  RAISE EXCEPTION 'Invalid policy command envelope' USING ERRCODE='22023';
 END IF;
 PERFORM erp_private.comms_validate_policy(op,a);
 -- Scope mutations take the same fence as chat, PTT and existing ERP assignment changes.
 IF op='policy.moderate' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('comms-scope-v1',0));
 ELSE
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('comms-scope-v1',0));
 END IF;
 p:=erp_private.comms_actor_id();
 IF op='policy.status' THEN
  SELECT * INTO policy FROM erp_private.comms_policy_versions WHERE is_current;
  RETURN jsonb_build_object('currentVersion',policy.version,'termsText',policy.terms_text,
   'acceptedVersion',(SELECT version FROM erp_private.comms_policy_acceptances WHERE profile_id=p ORDER BY (version=policy.version) DESC,accepted_at DESC,version DESC LIMIT 1),
   'accepted',EXISTS(SELECT FROM erp_private.comms_policy_acceptances WHERE profile_id=p AND version=policy.version),
   'privacyPath','/communications-disclosure.html','canModerate',erp_private.comms_can_moderate_profile(p));
 END IF;
 IF op='policy.blocks' THEN
  RETURN jsonb_build_object('blocks',coalesce((SELECT jsonb_agg(jsonb_build_object('targetProfileId',b.blocked_id::text,
    'displayName',CASE WHEN erp_private.chat_active(b.blocked_id) THEN erp_private.chat_work(b.blocked_id)->>'name' END,
    'createdAt',b.created_at) ORDER BY b.created_at DESC,b.blocked_id) FROM erp_private.comms_blocks b WHERE b.blocker_id=p),'[]'::jsonb));
 END IF;
 IF op IN('policy.case','policy.cases','policy.moderate') THEN
  PERFORM FROM erp_private.comms_moderators WHERE profile_id=p AND enabled FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Current moderator required' USING ERRCODE='42501'; END IF;
 ELSIF op='policy.setModerator' AND NOT erp_private.comms_is_system_admin() THEN
  RAISE EXCEPTION 'Global System administration required' USING ERRCODE='42501';
 END IF;
 IF op='policy.case' THEN
  SELECT * INTO r FROM erp_private.comms_reports WHERE id=(a->>'caseId')::uuid;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Case unavailable' USING ERRCODE='PT404'; END IF;
  RETURN erp_private.comms_report_summary(r,true);
 ELSIF op='policy.cases' THEN
  n:=coalesce((a->>'limit')::int,40);
  IF a ? 'before' THEN
   SELECT * INTO page_before FROM erp_private.comms_reports WHERE id=(a->>'before')::uuid;
   IF page_before.id IS NULL THEN RAISE EXCEPTION 'Page unavailable' USING ERRCODE='PT404'; END IF;
  END IF;
  WITH page AS (SELECT q.id,q.created_at,erp_private.comms_report_summary(q,false) item,
      row_number() OVER(ORDER BY q.created_at DESC,q.id DESC) pos
    FROM erp_private.comms_reports q WHERE page_before.id IS NULL OR (q.created_at,q.id)<(page_before.created_at,page_before.id)
    ORDER BY q.created_at DESC,q.id DESC LIMIT n+1)
  SELECT jsonb_build_object('cases',coalesce(jsonb_agg(item ORDER BY pos) FILTER(WHERE pos<=n),'[]'::jsonb),
    'nextBefore',CASE WHEN count(*)>n THEN max(id::text) FILTER(WHERE pos=n) END) INTO result FROM page;
  RETURN result;
 END IF;

 mutation:=(a->>'clientMutationId')::uuid;
 fingerprint:=sha256(convert_to(jsonb_build_array(op,a)::text,'UTF8'));
 -- Actor serialization fences actual changes, canonical no-ops and the bounded receipt window.
 PERFORM pg_advisory_xact_lock(hashtextextended('comms-policy-actor:'||p,0));
 SELECT * INTO receipt FROM erp_private.comms_policy_mutations WHERE actor_id=p AND mutation_id=mutation AND expires_at>clock_timestamp();
 IF receipt.actor_id IS NOT NULL AND receipt.request_hash<>fingerprint THEN
  RAISE EXCEPTION 'Mutation conflict' USING ERRCODE='PT409';
 END IF;
 IF op='policy.accept' THEN
  SELECT * INTO policy FROM erp_private.comms_policy_versions WHERE is_current FOR SHARE;
  IF policy.version IS DISTINCT FROM a->>'version' THEN RAISE EXCEPTION 'Current terms changed' USING ERRCODE='PT409'; END IF;
  IF receipt.actor_id IS NOT NULL THEN RETURN receipt.result; END IF;
  SELECT accepted_at INTO changed FROM erp_private.comms_policy_acceptances WHERE profile_id=p AND version=policy.version;
  IF FOUND THEN RETURN jsonb_build_object('version',policy.version,'acceptedAt',changed); END IF;
  PERFORM erp_comm_cost.take_policy_control(p,'terms');
  INSERT INTO erp_private.comms_policy_acceptances(profile_id,version) VALUES(p,policy.version) RETURNING accepted_at INTO changed;
  result:=jsonb_build_object('version',policy.version,'acceptedAt',changed);
 ELSIF op='policy.block' THEN
  target:=(a->>'targetProfileId')::bigint; flag:=(a->>'blocked')::boolean;
  IF target=p THEN RAISE EXCEPTION 'Invalid block target' USING ERRCODE='22023'; END IF;
  IF receipt.actor_id IS NOT NULL THEN RETURN receipt.result; END IF;
  -- Apply the same PTT-before-pair lock order as live signaling.
  PERFORM erp_private.ptt_lock();
  PERFORM erp_private.comms_lock_pair(p,target);
  SELECT created_at INTO changed FROM erp_private.comms_blocks WHERE blocker_id=p AND blocked_id=target;
  IF flag=(changed IS NOT NULL) THEN
   RETURN jsonb_build_object('targetProfileId',target::text,'blocked',flag,'updatedAt',coalesce(changed,statement_timestamp()));
  END IF;
  IF flag AND NOT erp_private.chat_active(target) THEN RAISE EXCEPTION 'Contact unavailable' USING ERRCODE='PT404'; END IF;
  PERFORM erp_comm_cost.take_policy_control(p,'block');
  IF flag THEN
   INSERT INTO erp_private.comms_blocks(blocker_id,blocked_id,created_at) VALUES(p,target,clock_timestamp()) RETURNING created_at INTO changed;
   SELECT id INTO direct_ptt FROM erp_private.ptt_channels
    WHERE kind='direct' AND direct_low=least(p,target) AND direct_high=greatest(p,target);
   IF direct_ptt IS NOT NULL THEN
    UPDATE erp_private.ptt_leases SET ended_at=least(changed,expires_at),
     end_reason=CASE WHEN expires_at<=changed THEN 'expired' ELSE 'revoked' END
     WHERE channel_id=direct_ptt AND ended_at IS NULL;
    DELETE FROM erp_private.ptt_admissions WHERE channel_id=direct_ptt;
    UPDATE erp_private.ptt_endpoints SET dirty=true,phase=CASE WHEN phase IN('idle','opening') THEN 'closed' ELSE phase END
     WHERE channel_id=direct_ptt AND phase<>'closed' AND (NOT dirty OR phase IN('idle','opening'));
   END IF;
  ELSE
   DELETE FROM erp_private.comms_blocks WHERE blocker_id=p AND blocked_id=target;
   changed:=clock_timestamp();
  END IF;
  result:=jsonb_build_object('targetProfileId',target::text,'blocked',flag,'updatedAt',changed);
 ELSIF op='policy.report' THEN
  IF receipt.actor_id IS NOT NULL THEN RETURN receipt.result; END IF;
  SELECT * INTO source FROM erp_private.comms_report_source(a->>'kind',a->>'targetId',p);
  IF NOT FOUND THEN RAISE EXCEPTION 'Report target unavailable' USING ERRCODE='PT404'; END IF;
  report_digest:=sha256(convert_to(jsonb_build_array(a->>'kind',coalesce(source.source_id::text,source.subject_id::text),
    source.source_revision,a->>'reason',btrim(a->>'details'))::text,'UTF8'));
  SELECT * INTO r FROM erp_private.comms_reports q WHERE q.reporter_id=p AND q.report_fingerprint=report_digest
   AND q.created_at>clock_timestamp()-interval '15 minutes' AND q.status<>'closed' ORDER BY q.created_at DESC LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('caseId',r.id,'createdAt',r.created_at); END IF;
  IF (SELECT count(*) FROM erp_private.comms_reports WHERE reporter_id=p AND created_at>clock_timestamp()-interval '1 hour')>=30 THEN
   RAISE EXCEPTION 'Report limit reached' USING ERRCODE='PT429';
  END IF;
  PERFORM erp_comm_cost.take_policy_control(p,'report');
  INSERT INTO erp_private.comms_reports(reporter_id,subject_id,kind,source_id,conversation_id,source_revision,source_at,reason,details,report_fingerprint)
   VALUES(p,source.subject_id,a->>'kind',source.source_id,source.conversation_id,source.source_revision,source.source_at,
    a->>'reason',btrim(a->>'details'),report_digest) RETURNING * INTO r;
  -- An authorized shared case queue is authoritative. Each funded report may add one in-app handoff.
  BEGIN
   PERFORM erp_private.notification_enqueue('moderation',r.id,m.profile_id,ARRAY[]::uuid[])
   FROM erp_private.comms_moderators m WHERE m.enabled AND erp_private.comms_can_moderate_profile(m.profile_id)
   ORDER BY m.assigned_at,m.profile_id LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
   RAISE WARNING 'Moderation inbox handoff failed with SQLSTATE %', SQLSTATE;
  END;
  result:=jsonb_build_object('caseId',r.id,'createdAt',r.created_at);
 ELSIF op='policy.setModerator' THEN
  target:=(a->>'targetProfileId')::bigint; flag:=(a->>'enabled')::boolean;
  IF receipt.actor_id IS NOT NULL THEN RETURN receipt.result; END IF;
  IF (flag AND NOT erp_private.chat_active(target)) OR NOT EXISTS(SELECT FROM public.user_profiles WHERE id=target) THEN
   RAISE EXCEPTION 'Moderator unavailable' USING ERRCODE='PT404';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('comms-moderator-grant:'||target,0));
  IF flag=coalesce((SELECT enabled FROM erp_private.comms_moderators WHERE profile_id=target),false) THEN
   RETURN jsonb_build_object('targetProfileId',target::text,'enabled',flag);
  END IF;
  INSERT INTO erp_private.comms_moderators(profile_id,enabled,assigned_by) VALUES(target,flag,p)
  ON CONFLICT(profile_id) DO UPDATE SET enabled=excluded.enabled,assigned_by=excluded.assigned_by,assigned_at=clock_timestamp();
  result:=jsonb_build_object('targetProfileId',target::text,'enabled',flag);
 ELSIF op='policy.moderate' THEN
  action:=a->>'action';
  SELECT * INTO r FROM erp_private.comms_reports WHERE id=(a->>'caseId')::uuid FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Case unavailable' USING ERRCODE='PT404'; END IF;
  IF action IN('hideContent','restrictCommunication') AND NOT erp_private.comms_report_evidence(r) THEN
   RAISE EXCEPTION 'Current evidence authority required' USING ERRCODE='42501';
  END IF;
  IF receipt.actor_id IS NOT NULL THEN RETURN receipt.result; END IF;
  IF r.status='closed' OR (action='review' AND r.status<>'new') THEN RAISE EXCEPTION 'Case state changed' USING ERRCODE='PT409'; END IF;
  IF action IN('hideContent','restrictCommunication') AND r.kind='chat_message' THEN
   -- Keep the reported revision bound to the action. Earlier edit versions are intentionally unavailable.
   PERFORM FROM erp_private.chat_conversations WHERE id=r.conversation_id FOR UPDATE;
   IF NOT EXISTS(SELECT FROM erp_private.chat_messages WHERE id=r.source_id AND revision=r.source_revision) THEN
    RAISE EXCEPTION 'Reported content changed' USING ERRCODE='PT409';
   END IF;
  END IF;
  changed:=clock_timestamp();
  IF action='hideContent' THEN
   IF r.kind='chat_message' THEN
    UPDATE erp_private.chat_messages SET deleted_at=changed,deleted_by=p,revision=revision+1 WHERE id=r.source_id AND deleted_at IS NULL;
    IF FOUND THEN PERFORM erp_private.chat_change(r.conversation_id,'message',r.source_id); END IF;
   ELSIF r.kind IN('ptt_transmission','ptt_sos') THEN
    PERFORM erp_private.ptt_lock();
    INSERT INTO erp_private.comms_moderated_content VALUES(r.kind,r.source_id,r.id) ON CONFLICT DO NOTHING;
   ELSE RAISE EXCEPTION 'This case does not reference removable content' USING ERRCODE='22023';
   END IF;
  ELSIF action='restrictCommunication' THEN
   deadline:=(a->>'until')::timestamptz;
   IF r.subject_id IS NULL OR r.subject_id=p OR deadline<=changed OR deadline>changed+interval '30 days' THEN
    RAISE EXCEPTION 'Invalid restriction target or expiry' USING ERRCODE='22023';
   END IF;
   PERFORM erp_private.ptt_lock();
   INSERT INTO erp_private.comms_restrictions VALUES(r.id,r.subject_id,deadline);
   WITH retired AS (
    UPDATE erp_private.ptt_leases SET ended_at=least(changed,expires_at),
     end_reason=CASE WHEN expires_at<=changed THEN 'expired' ELSE 'revoked' END
     WHERE profile_id=r.subject_id AND ended_at IS NULL RETURNING id
   ) UPDATE erp_private.ptt_endpoints e SET dirty=true
    WHERE e.lease_id IN (SELECT id FROM retired) AND NOT e.dirty AND e.phase<>'closed';
  END IF;
  INSERT INTO erp_private.comms_report_actions(report_id,moderator_id,action,note,created_at)
   VALUES(r.id,p,action,btrim(a->>'note'),changed);
  UPDATE erp_private.comms_reports SET status=CASE WHEN action='review' THEN 'in_review' ELSE 'closed' END,
   outcome=CASE WHEN action<>'review' THEN action END,updated_at=changed WHERE id=r.id RETURNING * INTO r;
  result:=jsonb_build_object('caseId',r.id,'status',r.status,'updatedAt',r.updated_at);
 END IF;
 -- A successful state transition reclaims expired rows and keeps at most 256 receipts for the actor.
 -- No-op, rejected and replayed requests return above before any receipt writes.
 DELETE FROM erp_private.comms_policy_mutations WHERE actor_id=p AND (expires_at<=clock_timestamp() OR mutation_id=mutation);
 DELETE FROM erp_private.comms_policy_mutations x WHERE x.actor_id=p AND x.mutation_id IN (
  SELECT q.mutation_id FROM erp_private.comms_policy_mutations q WHERE q.actor_id=p ORDER BY q.expires_at DESC,q.mutation_id DESC OFFSET 255
 );
 INSERT INTO erp_private.comms_policy_mutations(actor_id,mutation_id,request_hash,result,expires_at)
 VALUES(p,mutation,fingerprint,result,clock_timestamp()+interval '24 hours');
 RETURN result;
END $$;

ALTER TABLE erp_private.comms_moderators ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.comms_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.comms_report_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.comms_moderated_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.comms_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.comms_policy_mutations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.comms_moderators,erp_private.comms_reports,erp_private.comms_report_actions,
 erp_private.comms_moderated_content,erp_private.comms_restrictions,erp_private.comms_policy_mutations FROM public,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.comms_policy_immutable(),erp_private.comms_can_moderate_profile(bigint),
 erp_private.comms_moderation_hidden(text,uuid),erp_private.notification_moderation_target(uuid,bigint),
 erp_private.comms_require_unrestricted(bigint),erp_private.comms_check_contribution(),erp_private.comms_report_source(text,text,bigint),
 erp_private.comms_report_evidence(erp_private.comms_reports),erp_private.comms_report_summary(erp_private.comms_reports,boolean),
 erp_private.comms_validate_policy(text,jsonb) FROM public,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_communications_policy_v1(jsonb) FROM public,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_communications_policy_v1(jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
