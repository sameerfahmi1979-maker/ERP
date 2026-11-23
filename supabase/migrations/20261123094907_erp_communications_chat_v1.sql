BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';

CREATE TABLE erp_private.comms_blocks(
 blocker_id bigint NOT NULL, blocked_id bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(blocker_id,blocked_id), CHECK(blocker_id<>blocked_id)
);
CREATE TABLE erp_private.comms_policy_versions(version text PRIMARY KEY,is_current boolean NOT NULL DEFAULT false);
CREATE UNIQUE INDEX comms_one_current_policy ON erp_private.comms_policy_versions(is_current) WHERE is_current;
CREATE TABLE erp_private.comms_policy_acceptances(profile_id bigint NOT NULL,version text NOT NULL REFERENCES erp_private.comms_policy_versions,accepted_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(profile_id,version));
CREATE TABLE erp_private.chat_named_grants(profile_id bigint NOT NULL,kind text NOT NULL CHECK(kind IN ('historyReview','groupCreate','pttChannelCreate')),enabled boolean NOT NULL,revision bigint NOT NULL DEFAULT 1,granted_by bigint NOT NULL,PRIMARY KEY(profile_id,kind));
CREATE TABLE erp_private.chat_conversations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kind text NOT NULL CHECK(kind IN ('direct','group')),
 direct_low bigint,direct_high bigint,creator bigint NOT NULL,owner_id bigint,name text,
 revision bigint NOT NULL DEFAULT 1,change_seq bigint NOT NULL DEFAULT 0,latest_seq bigint NOT NULL DEFAULT 0,
 CHECK((kind='direct' AND direct_low IS NOT NULL AND direct_high>direct_low AND direct_high IS NOT NULL AND owner_id IS NULL AND name IS NULL)
 OR (kind='group' AND direct_low IS NULL AND direct_high IS NULL AND length(btrim(name)) BETWEEN 1 AND 160 AND name IS NOT NULL)), UNIQUE(direct_low,direct_high)
);
CREATE TABLE erp_private.chat_memberships(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,conversation uuid NOT NULL REFERENCES erp_private.chat_conversations,profile_id bigint NOT NULL,joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),left_at timestamptz,appointed boolean NOT NULL DEFAULT false);
CREATE UNIQUE INDEX chat_current_member ON erp_private.chat_memberships(conversation,profile_id) WHERE left_at IS NULL;
CREATE INDEX chat_member_history ON erp_private.chat_memberships(profile_id,conversation,id);
CREATE TABLE erp_private.chat_scope_facts(episode bigint NOT NULL REFERENCES erp_private.chat_memberships,company bigint,branch bigint,UNIQUE NULLS NOT DISTINCT(episode,company,branch));
CREATE TABLE erp_private.chat_messages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),conversation uuid NOT NULL REFERENCES erp_private.chat_conversations,
 seq bigint NOT NULL,sender bigint NOT NULL,kind text NOT NULL DEFAULT 'message',body text,reply_to uuid,forwarded boolean NOT NULL DEFAULT false,
 sent_at timestamptz NOT NULL DEFAULT clock_timestamp(),edited_at timestamptz,deleted_at timestamptz,deleted_by bigint,
 revision bigint NOT NULL DEFAULT 1,dms_ref jsonb, UNIQUE(conversation,seq), UNIQUE(conversation,id),
 FOREIGN KEY(conversation,reply_to) REFERENCES erp_private.chat_messages(conversation,id)
);
CREATE TABLE erp_private.chat_uploads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor bigint NOT NULL,reserving_session uuid NOT NULL,conversation uuid NOT NULL REFERENCES erp_private.chat_conversations,filename text NOT NULL,mime text NOT NULL,size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 52428800),state text NOT NULL DEFAULT 'reserved' CHECK(state IN('reserved','verified','attached','failed')),sha256 text);
ALTER TABLE erp_private.chat_uploads
 ADD COLUMN stage_expires_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '24 hours'),
 ADD COLUMN stage_permit uuid,
 ADD COLUMN cleanup_worker uuid,
 ADD COLUMN write_lease_until timestamptz,
 ADD COLUMN cleanup_phase text CHECK(cleanup_phase IN('queued','leased','attention','cleaned')),
 ADD COLUMN next_cleanup_at timestamptz,
 ADD COLUMN cleanup_attempt uuid,
 ADD COLUMN cleanup_lease_until timestamptz;
CREATE INDEX chat_due_stages ON erp_private.chat_uploads(coalesce(next_cleanup_at,stage_expires_at),id)
 WHERE stage_permit IS NOT NULL AND state<>'attached' AND cleanup_phase IS DISTINCT FROM 'cleaned' AND cleanup_phase IS DISTINCT FROM 'attention';
CREATE INDEX chat_attention_by_worker ON erp_private.chat_uploads(cleanup_worker) WHERE cleanup_phase='attention';
CREATE UNIQUE INDEX chat_stage_attempt ON erp_private.chat_uploads(cleanup_attempt) WHERE cleanup_attempt IS NOT NULL;
CREATE TABLE erp_private.chat_cleanup_worker(worker uuid PRIMARY KEY,seen_at timestamptz NOT NULL,covered_until timestamptz NOT NULL);
CREATE TABLE erp_private.chat_attachments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),message uuid NOT NULL REFERENCES erp_private.chat_messages,upload uuid NOT NULL REFERENCES erp_private.chat_uploads,kind text NOT NULL,UNIQUE(message,upload));
CREATE EXTENSION IF NOT EXISTS pg_trgm;
DO $indexes$
DECLARE ext_schema name;
BEGIN
 SELECT n.nspname INTO STRICT ext_schema FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pg_trgm';
 EXECUTE format('CREATE INDEX chat_message_body_substring ON erp_private.chat_messages USING gin (lower(coalesce(body,''Message'')) %I.gin_trgm_ops)',ext_schema);
 EXECUTE format('CREATE INDEX chat_upload_filename_substring ON erp_private.chat_uploads USING gin (lower(filename) %I.gin_trgm_ops)',ext_schema);
 EXECUTE format('CREATE INDEX chat_group_name_substring ON erp_private.chat_conversations USING gin (lower(name) %I.gin_trgm_ops) WHERE kind=''group''',ext_schema);
END $indexes$;
CREATE INDEX chat_attachments_by_blob ON erp_private.chat_attachments(upload,message);
CREATE TABLE erp_private.chat_mentions(message uuid REFERENCES erp_private.chat_messages,profile_id bigint,PRIMARY KEY(message,profile_id));
CREATE TABLE erp_private.chat_reactions(message uuid REFERENCES erp_private.chat_messages,profile_id bigint,emoji text CHECK(length(emoji) BETWEEN 1 AND 32),PRIMARY KEY(message,profile_id,emoji));
CREATE TABLE erp_private.chat_reads(message uuid REFERENCES erp_private.chat_messages,profile_id bigint,read_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(message,profile_id));
CREATE TABLE erp_private.chat_stars(profile_id bigint,message uuid REFERENCES erp_private.chat_messages,PRIMARY KEY(profile_id,message));
CREATE TABLE erp_private.chat_pins(message uuid PRIMARY KEY REFERENCES erp_private.chat_messages);
CREATE TABLE erp_private.chat_personal(profile_id bigint,conversation uuid REFERENCES erp_private.chat_conversations,muted boolean NOT NULL DEFAULT false,archive_seq bigint,PRIMARY KEY(profile_id,conversation));
CREATE TABLE erp_private.chat_mutations(actor bigint,mutation uuid,request_hash bytea NOT NULL,entity uuid,conversation uuid,result jsonb NOT NULL,PRIMARY KEY(actor,mutation));
CREATE TABLE erp_private.chat_changes(conversation uuid REFERENCES erp_private.chat_conversations,change_seq bigint NOT NULL,kind text NOT NULL,entity uuid,recipient bigint,PRIMARY KEY(conversation,change_seq));

CREATE FUNCTION erp_private.comms_actor_id() RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor bigint;
BEGIN
 IF auth.uid() IS NULL OR public.f03_current_session_valid() IS NOT TRUE OR erp_private.business_principal_is_active() IS NOT TRUE THEN RAISE EXCEPTION 'Active session required' USING ERRCODE='42501'; END IF;
 SELECT id INTO STRICT actor FROM public.user_profiles WHERE auth_user_id=auth.uid() AND status='active' AND must_change_password IS FALSE;
 RETURN actor;
END $$;
CREATE FUNCTION erp_private.comms_is_system_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.user_roles a JOIN public.roles r ON r.id=a.role_id WHERE a.user_profile_id=erp_private.comms_actor_id() AND a.is_active AND r.is_active AND r.is_system_role AND r.role_code='system_admin' AND a.owner_company_id IS NULL AND a.branch_id IS NULL)
$$;
CREATE FUNCTION erp_private.comms_covers_scope(p_company bigint,p_branch bigint) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.user_roles a JOIN public.roles r ON r.id=a.role_id JOIN public.owner_companies c ON c.id=a.owner_company_id AND c.status='active'
 WHERE a.user_profile_id=erp_private.comms_actor_id() AND a.is_active AND r.is_active AND a.owner_company_id=p_company AND (a.branch_id IS NULL OR a.branch_id=p_branch)
 AND (p_branch IS NULL OR EXISTS(SELECT FROM public.branches b WHERE b.id=p_branch AND b.owner_company_id=p_company AND b.status='active')))
$$;
CREATE FUNCTION erp_private.comms_has_named_grant(p_kind text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM erp_private.chat_named_grants WHERE profile_id=erp_private.comms_actor_id() AND kind=p_kind AND enabled)
$$;
CREATE FUNCTION erp_private.comms_require_terms() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT FROM erp_private.comms_policy_versions v JOIN erp_private.comms_policy_acceptances a USING(version) WHERE v.is_current AND a.profile_id=erp_private.comms_actor_id() FOR SHARE OF v,a) THEN RAISE EXCEPTION 'Current terms required' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION erp_private.comms_lock_pair(p_left bigint,p_right bigint) RETURNS void LANGUAGE sql VOLATILE SET search_path='' AS $$
 SELECT pg_advisory_xact_lock(hashtextextended('comms-pair:'||least(p_left,p_right)||':'||greatest(p_left,p_right),0))
$$;
CREATE FUNCTION erp_private.comms_pair_blocked(p_left bigint,p_right bigint) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM erp_private.comms_blocks WHERE (blocker_id,blocked_id) IN ((p_left,p_right),(p_right,p_left)))
$$;
CREATE FUNCTION erp_private.chat_active(p bigint) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.user_profiles WHERE id=p AND status='active' AND must_change_password IS FALSE)
$$;
CREATE FUNCTION erp_private.chat_member(c uuid,p bigint) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM erp_private.chat_memberships WHERE conversation=c AND profile_id=p AND left_at IS NULL)
$$;
CREATE FUNCTION erp_private.chat_review(c uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT erp_private.comms_is_system_admin() OR (erp_private.comms_has_named_grant('historyReview')
 AND EXISTS(SELECT FROM erp_private.chat_memberships WHERE conversation=c)
 AND NOT EXISTS(SELECT FROM erp_private.chat_memberships m LEFT JOIN erp_private.chat_scope_facts f ON f.episode=m.id WHERE m.conversation=c AND (f.company IS NULL OR NOT erp_private.comms_covers_scope(f.company,f.branch))))
$$;
CREATE FUNCTION erp_private.chat_visible(c uuid,mode text) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE mode WHEN 'participant' THEN erp_private.chat_member(c,erp_private.comms_actor_id()) WHEN 'review' THEN erp_private.chat_review(c) ELSE false END
$$;
CREATE FUNCTION erp_private.chat_scope_capture(p bigint) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 INSERT INTO erp_private.chat_scope_facts(episode,company,branch)
 WITH scopes AS (
 SELECT a.owner_company_id company,a.branch_id branch FROM public.user_roles a JOIN public.roles r ON r.id=a.role_id AND r.is_active WHERE a.user_profile_id=p AND a.is_active
 UNION SELECT owner_company_id,branch_id FROM public.user_profiles WHERE id=p AND owner_company_id IS NOT NULL
 ), checked AS (
 SELECT CASE WHEN o.id IS NOT NULL AND (s.branch IS NULL OR b.id IS NOT NULL) THEN s.company END company,s.branch FROM scopes s LEFT JOIN public.owner_companies o ON o.id=s.company LEFT JOIN public.branches b ON b.id=s.branch AND b.owner_company_id=s.company
 UNION ALL SELECT NULL,NULL WHERE NOT EXISTS(SELECT FROM scopes)
 )
 SELECT m.id,c.company,c.branch FROM erp_private.chat_memberships m CROSS JOIN checked c WHERE m.profile_id=p AND m.left_at IS NULL ON CONFLICT DO NOTHING;
END $$;
CREATE FUNCTION erp_private.chat_capture_membership() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN PERFORM erp_private.chat_scope_capture(NEW.profile_id); RETURN NULL; END $$;
CREATE TRIGGER chat_capture_join AFTER INSERT ON erp_private.chat_memberships FOR EACH ROW EXECUTE FUNCTION erp_private.chat_capture_membership();

CREATE FUNCTION erp_private.chat_capture_auth_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target bigint; departed uuid;
BEGIN
 IF TG_TABLE_NAME='user_profiles' THEN
   PERFORM erp_private.chat_scope_capture(NEW.id);
   IF NEW.status<>'active' AND OLD.status='active' THEN
    FOR departed IN UPDATE erp_private.chat_memberships m SET left_at=clock_timestamp(),appointed=false FROM erp_private.chat_conversations c WHERE m.conversation=c.id AND c.kind='group' AND m.profile_id=NEW.id AND m.left_at IS NULL RETURNING m.conversation LOOP
     UPDATE erp_private.chat_conversations SET owner_id=CASE WHEN owner_id=NEW.id THEN NULL ELSE owner_id END,revision=revision+1 WHERE id=departed;
     PERFORM erp_private.chat_post(departed,NEW.id,'notice',coalesce(NEW.full_name,'ERP user')||' left the group');
     PERFORM erp_private.chat_change(departed,'group',departed);
    END LOOP;
   END IF;
 ELSIF TG_TABLE_NAME='roles' THEN
  FOR target IN SELECT DISTINCT user_profile_id FROM public.user_roles WHERE role_id=NEW.id AND is_active LOOP PERFORM erp_private.chat_scope_capture(target); END LOOP;
 ELSE
  IF TG_OP<>'INSERT' THEN PERFORM erp_private.chat_scope_capture(OLD.user_profile_id); END IF;
  IF TG_OP<>'DELETE' THEN PERFORM erp_private.chat_scope_capture(NEW.user_profile_id); END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION erp_private.chat_scope_fence() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN PERFORM pg_advisory_xact_lock(hashtextextended('comms-scope-v1',0)); RETURN NULL; END $$;
CREATE TRIGGER chat_assignment_fence BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH STATEMENT EXECUTE FUNCTION erp_private.chat_scope_fence();
CREATE TRIGGER chat_assignment_facts AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION erp_private.chat_capture_auth_change();
CREATE TRIGGER chat_profile_fence BEFORE UPDATE OF owner_company_id,branch_id,status ON public.user_profiles FOR EACH STATEMENT EXECUTE FUNCTION erp_private.chat_scope_fence();
CREATE TRIGGER chat_profile_facts AFTER UPDATE OF owner_company_id,branch_id,status ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION erp_private.chat_capture_auth_change();
CREATE TRIGGER chat_role_fence BEFORE UPDATE OF is_active ON public.roles FOR EACH STATEMENT EXECUTE FUNCTION erp_private.chat_scope_fence();
CREATE TRIGGER chat_role_facts AFTER UPDATE OF is_active ON public.roles FOR EACH ROW EXECUTE FUNCTION erp_private.chat_capture_auth_change();

CREATE FUNCTION erp_private.chat_change(c uuid,k text,e uuid DEFAULT NULL,p bigint DEFAULT NULL) RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE n bigint;
BEGIN
 UPDATE erp_private.chat_conversations SET change_seq=change_seq+1 WHERE id=c RETURNING change_seq INTO STRICT n;
 INSERT INTO erp_private.chat_changes VALUES(c,n,k,e,p);
 RETURN n;
END $$;
CREATE FUNCTION erp_private.chat_post(c uuid,p bigint,k text,t text,parent uuid DEFAULT NULL,fwd boolean DEFAULT false) RETURNS erp_private.chat_messages LANGUAGE plpgsql SET search_path='' AS $$
DECLARE n bigint; m erp_private.chat_messages;
BEGIN
 UPDATE erp_private.chat_conversations SET latest_seq=latest_seq+1 WHERE id=c RETURNING latest_seq INTO STRICT n;
 INSERT INTO erp_private.chat_messages(conversation,seq,sender,kind,body,reply_to,forwarded) VALUES(c,n,p,k,t,parent,fwd) RETURNING * INTO m;
 PERFORM erp_private.chat_change(c,'message',m.id);
 RETURN m;
END $$;
CREATE FUNCTION erp_private.chat_write_allowed(c erp_private.chat_conversations,p bigint) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT erp_private.chat_member(c.id,p) THEN RAISE EXCEPTION 'Conversation unavailable' USING ERRCODE='PT404'; END IF;
 PERFORM erp_private.comms_require_terms();
 IF c.kind='direct' THEN
  PERFORM erp_private.comms_lock_pair(c.direct_low,c.direct_high);
  IF erp_private.comms_pair_blocked(c.direct_low,c.direct_high) OR NOT erp_private.chat_active(c.direct_low) OR NOT erp_private.chat_active(c.direct_high) THEN RAISE EXCEPTION 'Direct communication unavailable' USING ERRCODE='42501'; END IF;
 END IF;
END $$;
CREATE UNLOGGED TABLE erp_private.chat_presence(conversation uuid REFERENCES erp_private.chat_conversations,profile_id bigint,session_id uuid,online_until timestamptz NOT NULL,typing_until timestamptz,observed_at timestamptz NOT NULL,recent_ids uuid[] NOT NULL,recent_hashes bytea[] NOT NULL,
 CHECK(cardinality(recent_ids) BETWEEN 1 AND 32 AND cardinality(recent_ids)=cardinality(recent_hashes)),PRIMARY KEY(conversation,profile_id,session_id));
CREATE INDEX chat_presence_expiry ON erp_private.chat_presence(online_until);
CREATE FUNCTION erp_private.chat_linked_photo(employee bigint,doc bigint) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
 RETURN doc IS NOT NULL AND (erp_private.employee_permission(employee,'hr.employees.view') OR erp_private.employee_permission(employee,'hr.employee_profile.view'))
 AND public.current_user_can_view_dms_document(doc) AND erp_private.document_permission(doc,'dms.documents.preview');
END $$;
CREATE FUNCTION erp_private.chat_work(p bigint) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 SELECT jsonb_strip_nulls(jsonb_build_object('profileId',u.id::text,'name',coalesce(nullif(e.full_name_en,''),nullif(u.full_name,''),nullif(u.display_name,''),'ERP user'),
 'photoRef',CASE WHEN erp_private.chat_linked_photo(e.id,e.photo_dms_document_id) THEN '/api/mobile/communications/v1/avatars/'||u.id END,
 'jobTitle',coalesce(d.designation_name_en,u.job_title),'companyName',c.legal_name_en,'branchName',b.branch_name_en))
 INTO result FROM public.user_profiles u LEFT JOIN public.erp_user_employee_links l ON l.user_profile_id=u.id
 LEFT JOIN public.employees e ON e.id=l.employee_id AND e.deleted_at IS NULL AND u.owner_company_id=e.owner_company_id AND u.branch_id IS NOT DISTINCT FROM e.branch_id
 LEFT JOIN public.designations d ON d.id=e.designation_id AND (d.owner_company_id IS NULL OR d.owner_company_id=e.owner_company_id)
 LEFT JOIN public.owner_companies c ON c.id=u.owner_company_id LEFT JOIN public.branches b ON b.id=u.branch_id AND b.owner_company_id=c.id WHERE u.id=p;
 RETURN result;
END $$;
CREATE FUNCTION erp_private.chat_dms_ref(ref jsonb,issuing boolean) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE s erp_private.mobile_dms_shares; actor bigint:=erp_private.comms_actor_id(); tok text:=ref->>'token';
BEGIN
 IF ref IS NULL OR jsonb_typeof(ref)<>'object' OR tok IS NULL OR tok!~'^[a-zA-Z0-9_-]{43}$' THEN RETURN NULL; END IF;
 SELECT * INTO s FROM erp_private.mobile_dms_shares WHERE id=(ref->>'shareId')::bigint AND token_hash=encode(sha256(decode(translate(tok,'-_','+/')||'=','base64')),'hex')
 AND revoked_at IS NULL AND expires_at>clock_timestamp() AND (recipient=actor OR issuer=actor);
 IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM erp_private.mobile_dms_share_source(s,CASE WHEN issuing AND s.issuer=actor THEN ARRAY['dms.documents.share_external','dms.documents.preview','dms.documents.download'] ELSE ARRAY['dms.documents.preview','dms.documents.download'] END);
 RETURN jsonb_build_object('shareId',s.id::text,'token',tok);
EXCEPTION WHEN SQLSTATE '42501' OR SQLSTATE 'PT404' OR SQLSTATE 'PT409' THEN RETURN NULL;
END $$;
CREATE FUNCTION erp_private.chat_attachment_json(att erp_private.chat_attachments,u erp_private.chat_uploads,c uuid) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',att.id,'messageId',att.message,'conversationId',c,'kind',att.kind,'filename',u.filename,'mime',u.mime,'byteLength',u.size_bytes)
$$;
CREATE FUNCTION erp_private.chat_message_json(m erp_private.chat_messages,p bigint,mode text) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE visible boolean:=m.deleted_at IS NULL OR mode='review'; src erp_private.chat_messages; reply jsonb;
BEGIN
 IF visible AND m.reply_to IS NOT NULL THEN
  SELECT * INTO src FROM erp_private.chat_messages WHERE id=m.reply_to AND conversation=m.conversation;
  reply:=jsonb_build_object('id',src.id,'deleted',src.deleted_at IS NOT NULL,'body',CASE WHEN src.deleted_at IS NOT NULL THEN 'Message deleted' ELSE left(src.body,200) END);
 END IF;
 RETURN jsonb_strip_nulls(jsonb_build_object('id',m.id,'conversationId',m.conversation,'seq',m.seq::text,'revision',m.revision::text,'senderProfileId',m.sender::text,'senderName',erp_private.chat_work(m.sender)->>'name','sentAt',m.sent_at,'editedAt',m.edited_at,'kind',m.kind,'deleted',m.deleted_at IS NOT NULL,'forwarded',m.forwarded AND visible,
 'body',CASE WHEN visible THEN m.body ELSE 'Message deleted' END,'dmsRef',CASE WHEN visible AND m.dms_ref IS NOT NULL THEN erp_private.chat_dms_ref(m.dms_ref,false) END,'reply',reply,
 'attachments',coalesce((SELECT jsonb_agg(erp_private.chat_attachment_json(a,u,m.conversation) ORDER BY a.id) FROM erp_private.chat_attachments a JOIN erp_private.chat_uploads u ON u.id=a.upload WHERE visible AND a.message=m.id),'[]'),
 'mentions',coalesce((SELECT jsonb_agg(profile_id::text ORDER BY profile_id) FROM erp_private.chat_mentions WHERE visible AND message=m.id),'[]'),
 'reactions',coalesce((SELECT jsonb_agg(jsonb_build_object('emoji',emoji,'profileId',profile_id::text) ORDER BY emoji,profile_id) FROM erp_private.chat_reactions WHERE visible AND message=m.id),'[]'),
 'starred',visible AND EXISTS(SELECT FROM erp_private.chat_stars WHERE message=m.id AND profile_id=p),'pinned',EXISTS(SELECT FROM erp_private.chat_pins WHERE message=m.id)));
END $$;
CREATE FUNCTION erp_private.chat_conversation_json(c erp_private.chat_conversations,p bigint,mode text) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE direct_peer bigint; ps erp_private.chat_personal; admin boolean;
BEGIN
 direct_peer:=CASE WHEN c.direct_low=p THEN c.direct_high ELSE c.direct_low END;
 SELECT * INTO ps FROM erp_private.chat_personal WHERE conversation=c.id AND profile_id=p;
 admin:=mode='participant' AND (c.owner_id=p OR EXISTS(SELECT FROM erp_private.chat_memberships WHERE conversation=c.id AND profile_id=p AND left_at IS NULL AND appointed));
 RETURN jsonb_strip_nulls(jsonb_build_object('id',c.id,'kind',c.kind,'title',CASE WHEN c.kind='group' THEN c.name WHEN mode='review' THEN (erp_private.chat_work(c.direct_low)->>'name')||' / '||(erp_private.chat_work(c.direct_high)->>'name') ELSE erp_private.chat_work(direct_peer)->>'name' END,
 'peerProfileId',CASE WHEN c.kind='direct' AND mode='participant' THEN direct_peer::text END,'ownerProfileId',c.owner_id::text,'revision',c.revision::text,'changeSeq',c.change_seq::text,'latestSeq',c.latest_seq::text,
 'unreadCount',CASE WHEN mode='participant' THEN (SELECT count(*) FROM erp_private.chat_messages m WHERE m.conversation=c.id AND m.sender<>p AND NOT EXISTS(SELECT FROM erp_private.chat_reads r WHERE r.message=m.id AND r.profile_id=p)) ELSE 0 END,
 'muted',coalesce(ps.muted,false),'archived',coalesce(ps.archive_seq>=c.latest_seq,false),'canManageMembers',coalesce(admin,false),'canPin',coalesce(admin,false),
 'canManageAdmins',c.kind='group' AND (c.owner_id=p OR erp_private.comms_is_system_admin())));
END $$;
CREATE FUNCTION erp_private.chat_page(rows jsonb,n int,base_offset int) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(value ORDER BY ord) FROM jsonb_array_elements(coalesce(rows,'[]')) WITH ORDINALITY AS e(value,ord) WHERE ord<=n),'[]'),'nextCursor',CASE WHEN jsonb_array_length(coalesce(rows,'[]'))>n THEN (base_offset+n)::text END)
$$;
-- Internal invoker function called through the checked chat entry point. The SQL
-- body is inlinable so the planner can combine text, date and membership filters.
CREATE FUNCTION erp_private.chat_search_rows(p_actor bigint,p_mode text,p_query text,p_sender bigint,p_from timestamptz,p_until timestamptz,p_limit integer,p_offset integer)
RETURNS SETOF jsonb LANGUAGE sql STABLE AS $search$
 WITH pattern AS NOT MATERIALIZED (
  SELECT '%'||replace(replace(replace(lower(p_query),'!','!!'),'%','!%'),'_','!_')||'%' AS literal
 ), visible AS MATERIALIZED (
  SELECT m.conversation AS id FROM erp_private.chat_memberships m
  WHERE p_mode='participant' AND m.profile_id=p_actor AND m.left_at IS NULL
  UNION ALL
  SELECT c.id FROM erp_private.chat_conversations c WHERE p_mode='review' AND erp_private.chat_review(c.id)
 ), hits AS (
  SELECT 'person' AS kind,u.id::text AS id,NULL::uuid AS conversation,NULL::uuid AS message,
   work.card->>'name' AS label,NULL::text AS snippet,NULL::timestamptz AS sent
  FROM public.user_profiles u CROSS JOIN pattern pat CROSS JOIN LATERAL (SELECT erp_private.chat_work(u.id) AS card) work
  WHERE p_sender IS NULL AND p_from IS NULL AND p_until IS NULL AND u.status='active' AND NOT u.must_change_password
   AND lower(work.card->>'name') LIKE pat.literal ESCAPE '!'
  UNION ALL
  SELECT 'group',c.id::text,c.id,NULL,c.name,NULL,NULL FROM erp_private.chat_conversations c
  JOIN visible v ON v.id=c.id CROSS JOIN pattern pat WHERE p_sender IS NULL AND p_from IS NULL AND p_until IS NULL
   AND c.kind='group' AND lower(c.name) LIKE pat.literal ESCAPE '!'
  UNION ALL
  SELECT 'message',m.id::text,m.conversation,m.id,'Message',left(m.body,240),m.sent_at FROM erp_private.chat_messages m
  JOIN visible v ON v.id=m.conversation CROSS JOIN pattern pat
  WHERE lower(coalesce(m.body,'Message')) LIKE pat.literal ESCAPE '!' AND (m.deleted_at IS NULL OR p_mode='review')
   AND (p_sender IS NULL OR m.sender=p_sender) AND (p_from IS NULL OR m.sent_at>=p_from) AND (p_until IS NULL OR m.sent_at<p_until)
  UNION ALL
  SELECT 'attachment',att.id::text,m.conversation,m.id,u.filename,NULL,m.sent_at FROM erp_private.chat_uploads u
  JOIN erp_private.chat_attachments att ON att.upload=u.id JOIN erp_private.chat_messages m ON m.id=att.message
  JOIN visible v ON v.id=m.conversation CROSS JOIN pattern pat
  WHERE lower(u.filename) LIKE pat.literal ESCAPE '!' AND (m.deleted_at IS NULL OR p_mode='review')
   AND (p_sender IS NULL OR m.sender=p_sender) AND (p_from IS NULL OR m.sent_at>=p_from) AND (p_until IS NULL OR m.sent_at<p_until)
 )
 SELECT jsonb_strip_nulls(jsonb_build_object('kind',h.kind,'id',h.id,'conversationId',h.conversation,'messageId',h.message,'label',h.label,'snippet',h.snippet))
 FROM hits h ORDER BY h.sent DESC NULLS LAST,h.kind,h.id LIMIT p_limit OFFSET p_offset
$search$;
CREATE FUNCTION erp_private.chat_read(op text,a jsonb,p bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
<<chat_read>>
DECLARE c uuid:=(a->>'conversationId')::uuid; id uuid:=(a->>'messageId')::uuid; mode text:=a->>'mode'; q text:=coalesce(a->>'query',''); n integer:=coalesce((a->>'limit')::int,40); offn int:=CASE WHEN op='chat.messages' THEN 0 ELSE coalesce((a->>'cursor')::int,0) END; before_seq bigint; next_seq bigint; has_more boolean; rows jsonb; result jsonb; e bigint; m erp_private.chat_messages; cv erp_private.chat_conversations;
BEGIN
 IF n NOT BETWEEN 1 AND 100 OR offn NOT BETWEEN 0 AND 100000000 OR length(q)>256 THEN RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023'; END IF;
 IF op IN('chat.members','chat.messages','chat.conversations','chat.conversation','chat.search','chat.media') AND (mode IS NULL OR mode NOT IN('participant','review')) THEN RAISE EXCEPTION 'Invalid mode' USING ERRCODE='22023'; END IF;
 IF op IN('chat.members','chat.messages','chat.media','chat.conversation') AND (c IS NULL OR NOT erp_private.chat_visible(c,mode)) THEN RAISE EXCEPTION 'Conversation unavailable' USING ERRCODE='PT404'; END IF;
 IF op='chat.actor' THEN RETURN jsonb_build_object('profileId',p::text,'authUserId',auth.uid(),'authSessionId',auth.jwt()->>'session_id','isGlobalSystemAdmin',erp_private.comms_is_system_admin()); END IF;
 IF op IN('chat.capabilities','communications.profile') THEN RETURN jsonb_build_object('profileId',p::text,'isGlobalSystemAdmin',erp_private.comms_is_system_admin(),'canCreateGroup',erp_private.comms_has_named_grant('groupCreate'),'canReviewHistory',erp_private.comms_is_system_admin() OR erp_private.comms_has_named_grant('historyReview')); END IF;
 IF op IN('chat.linkedIdentity','chat.avatarBinding') THEN
  SELECT emp.id,erp_private.chat_work(u.id) INTO e,result FROM public.erp_user_employee_links l JOIN public.user_profiles u ON u.id=l.user_profile_id AND u.status='active' AND NOT u.must_change_password
  JOIN public.employees emp ON emp.id=l.employee_id AND emp.deleted_at IS NULL AND emp.owner_company_id=u.owner_company_id AND emp.branch_id IS NOT DISTINCT FROM u.branch_id
  WHERE (erp_private.employee_permission(emp.id,'hr.employees.view') OR erp_private.employee_permission(emp.id,'hr.employee_profile.view')) AND ((op='chat.linkedIdentity' AND emp.id=(a->>'employeeId')::bigint) OR (op='chat.avatarBinding' AND u.id=(a->>'profileId')::bigint AND erp_private.chat_linked_photo(emp.id,emp.photo_dms_document_id)));
  RETURN CASE WHEN op='chat.avatarBinding' AND e IS NOT NULL THEN jsonb_build_object('employeeId',e::text) ELSE result END;
 END IF;
 IF op='chat.resolveDmsReference' THEN
  IF coalesce(a->>'token','')!~'^[A-Za-z0-9_-]{43}$' THEN RAISE EXCEPTION 'Share unavailable' USING ERRCODE='PT404'; END IF;
  SELECT erp_private.chat_dms_ref(jsonb_build_object('shareId',s.id::text,'token',a->>'token'),true) INTO result FROM erp_private.mobile_dms_shares s WHERE s.token_hash=encode(sha256(decode(translate(a->>'token','-_','+/')||'=','base64')),'hex') AND (s.issuer=p OR s.recipient=p);
  IF result IS NULL THEN RAISE EXCEPTION 'Share unavailable' USING ERRCODE='PT404'; END IF;
  RETURN result;
 END IF;
 IF op='chat.conversation' THEN
  SELECT * INTO cv FROM erp_private.chat_conversations conv WHERE conv.id=c;
  IF cv.id IS NULL THEN RAISE EXCEPTION 'Conversation unavailable' USING ERRCODE='PT404'; END IF;
  RETURN erp_private.chat_conversation_json(cv,p,mode);
 END IF;
 IF op='chat.directory' THEN
  SELECT jsonb_agg(x) INTO rows FROM (SELECT w.x FROM public.user_profiles u CROSS JOIN LATERAL(SELECT erp_private.chat_work(u.id) x) w WHERE u.status='active' AND NOT u.must_change_password AND strpos(lower(w.x->>'name'),lower(q))>0 ORDER BY u.id LIMIT n+1 OFFSET offn) t;
 ELSIF op='chat.members' THEN
  SELECT jsonb_agg(x) INTO rows FROM (SELECT erp_private.chat_work(s.profile_id)||jsonb_build_object('role',CASE WHEN conv.owner_id=s.profile_id THEN 'owner' WHEN s.appointed THEN 'admin' ELSE 'member' END,'joinedAt',s.joined_at) x FROM erp_private.chat_memberships s JOIN erp_private.chat_conversations conv ON conv.id=s.conversation WHERE s.conversation=c AND s.left_at IS NULL ORDER BY s.id LIMIT n+1 OFFSET offn) t;
 ELSIF op='chat.conversations' THEN
  SELECT jsonb_agg(x) INTO rows FROM (SELECT proj.x FROM erp_private.chat_conversations conv CROSS JOIN LATERAL(SELECT erp_private.chat_conversation_json(conv,p,mode) x) proj WHERE erp_private.chat_visible(conv.id,mode) AND (mode='review' OR (proj.x->>'archived')::boolean=coalesce((a->>'archived')::boolean,false)) AND strpos(lower(proj.x->>'title'),lower(q))>0 ORDER BY (SELECT max(sent_at) FROM erp_private.chat_messages WHERE conversation=conv.id) DESC NULLS LAST,conv.id LIMIT n+1 OFFSET offn) t;
 ELSIF op='chat.messages' THEN
  before_seq:=(a->>'cursor')::bigint;
  IF before_seq<1 THEN RAISE EXCEPTION 'Invalid message cursor' USING ERRCODE='22023'; END IF;
  WITH recent AS (SELECT s.id,s.seq FROM erp_private.chat_messages s WHERE s.conversation=c AND (before_seq IS NULL OR s.seq<before_seq) ORDER BY s.seq DESC LIMIT n+1),
  ranked AS (SELECT r.*,row_number() OVER(ORDER BY r.seq DESC) ord FROM recent r)
  SELECT coalesce(jsonb_agg(erp_private.chat_message_json(s,p,mode) ORDER BY r.seq DESC) FILTER(WHERE r.ord<=n),'[]'),min(r.seq) FILTER(WHERE r.ord<=n),count(*)>n INTO rows,next_seq,has_more FROM ranked r JOIN erp_private.chat_messages s ON s.id=r.id;
  RETURN jsonb_build_object('items',rows,'nextCursor',CASE WHEN has_more THEN next_seq::text END);
 ELSIF op='chat.stars' THEN
  SELECT jsonb_agg(x) INTO rows FROM (SELECT erp_private.chat_message_json(s,p,'participant') x FROM erp_private.chat_stars b JOIN erp_private.chat_messages s ON s.id=b.message WHERE b.profile_id=p AND s.deleted_at IS NULL AND erp_private.chat_member(s.conversation,p) ORDER BY s.sent_at DESC,s.id LIMIT n+1 OFFSET offn) t;
 ELSIF op='chat.media' THEN
  SELECT jsonb_agg(x) INTO rows FROM (SELECT erp_private.chat_attachment_json(att,u,c) x FROM erp_private.chat_messages s JOIN erp_private.chat_attachments att ON att.message=s.id JOIN erp_private.chat_uploads u ON u.id=att.upload WHERE s.conversation=c AND (s.deleted_at IS NULL OR mode='review') AND (a->>'kind' IS NULL OR a->>'kind'=att.kind) ORDER BY s.seq DESC,att.id LIMIT n+1 OFFSET offn) t;
 ELSIF op='chat.readers' THEN
  SELECT * INTO m FROM erp_private.chat_messages WHERE chat_messages.id=chat_read.id;
  IF m.sender IS DISTINCT FROM p OR NOT erp_private.chat_member(m.conversation,p) THEN RAISE EXCEPTION 'Message unavailable' USING ERRCODE='PT404'; END IF;
  SELECT jsonb_agg(x) INTO rows FROM (SELECT jsonb_build_object('profileId',r.profile_id::text,'readAt',r.read_at) x FROM erp_private.chat_reads r WHERE r.message=id ORDER BY r.read_at,r.profile_id LIMIT n+1 OFFSET offn) t;
 ELSIF op='chat.uploadStatus' THEN
  SELECT jsonb_build_object('uploadId',u.id,'conversationId',u.conversation,'byteLength',u.size_bytes,'state',u.state) INTO result FROM erp_private.chat_uploads u WHERE u.id=(a->>'uploadId')::uuid AND u.actor=p AND u.reserving_session=(auth.jwt()->>'session_id')::uuid AND erp_private.chat_member(u.conversation,p);
  IF result IS NULL THEN RAISE EXCEPTION 'Upload unavailable' USING ERRCODE='PT404'; END IF; RETURN result;
 ELSIF op='chat.activity' THEN
  SELECT * INTO cv FROM erp_private.chat_conversations WHERE chat_conversations.id=c;
  IF NOT erp_private.chat_member(c,p) OR (cv.kind='direct' AND erp_private.comms_pair_blocked(cv.direct_low,cv.direct_high)) THEN RAISE EXCEPTION 'Conversation unavailable' USING ERRCODE='PT404'; END IF;
  SELECT jsonb_agg(x) INTO rows FROM (SELECT jsonb_build_object('profileId',s.profile_id::text,'online',true,'typing',coalesce(bool_or(s.typing_until>clock_timestamp()),false)) x FROM erp_private.chat_presence s WHERE s.conversation=c AND s.online_until>clock_timestamp() AND erp_private.chat_active(s.profile_id) AND erp_private.chat_member(c,s.profile_id) AND NOT erp_private.comms_pair_blocked(p,s.profile_id) AND erp_private.provider_actor_session_valid(s.profile_id,s.session_id) GROUP BY s.profile_id ORDER BY s.profile_id) t;
  RETURN jsonb_build_object('items',coalesce(rows,'[]'));
 ELSIF op='chat.search' THEN
  IF btrim(q)='' THEN RAISE EXCEPTION 'Search query required' USING ERRCODE='22023'; END IF;
  SELECT jsonb_agg(hit) INTO rows FROM erp_private.chat_search_rows(p,mode,q,(a->>'senderProfileId')::bigint,(a->>'from')::timestamptz,(a->>'until')::timestamptz,n+1,offn) AS hit;
 ELSE RAISE EXCEPTION 'Unknown chat operation' USING ERRCODE='22023'; END IF;
 RETURN erp_private.chat_page(rows,n,offn);
END $$;
ALTER TABLE erp_private.chat_uploads ADD COLUMN voice boolean NOT NULL DEFAULT false;
CREATE FUNCTION erp_private.chat_mentions_set(msg erp_private.chat_messages,ids jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE target bigint;
BEGIN
 DELETE FROM erp_private.chat_mentions WHERE message=msg.id;
 FOR target IN SELECT DISTINCT value::bigint FROM jsonb_array_elements_text(coalesce(ids,'[]')) LOOP
  IF NOT erp_private.chat_member(msg.conversation,target) THEN RAISE EXCEPTION 'Mention unavailable' USING ERRCODE='PT404'; END IF;
  IF NOT erp_private.comms_pair_blocked(msg.sender,target) THEN INSERT INTO erp_private.chat_mentions VALUES(msg.id,target); END IF;
 END LOOP;
END $$;
CREATE FUNCTION erp_private.chat_group_change(c erp_private.chat_conversations,p bigint,a jsonb) RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE act text:=a->>'action'; target bigint:=(a->>'targetProfileId')::bigint; owner_access boolean:=coalesce(c.owner_id=p,false); member erp_private.chat_memberships; moderator boolean; updated bigint; notice text;
BEGIN
 IF c.kind IS DISTINCT FROM 'group' THEN RAISE EXCEPTION 'Group unavailable' USING ERRCODE='PT404'; END IF;
 IF c.revision IS DISTINCT FROM (a->>'expectedRevision')::bigint THEN RAISE EXCEPTION 'Group revision conflict' USING ERRCODE='PT409'; END IF;
 SELECT owner_access OR EXISTS(SELECT FROM erp_private.chat_memberships WHERE conversation=c.id AND profile_id=p AND left_at IS NULL AND appointed) INTO moderator;
 IF act='leave' THEN target:=p; END IF;
 SELECT * INTO member FROM erp_private.chat_memberships WHERE conversation=c.id AND profile_id=target AND left_at IS NULL;
 IF act IN('promote','demote') THEN
  IF NOT(owner_access OR erp_private.comms_is_system_admin()) OR member.id IS NULL OR target IS NOT DISTINCT FROM c.owner_id THEN RAISE EXCEPTION 'Admin management denied' USING ERRCODE='42501'; END IF;
  UPDATE erp_private.chat_memberships SET appointed=act='promote' WHERE id=member.id;
 ELSIF act='replaceOwner' THEN
  IF NOT erp_private.comms_is_system_admin() OR member.id IS NULL OR NOT erp_private.chat_active(target) OR (c.owner_id IS NOT NULL AND erp_private.chat_active(c.owner_id) AND erp_private.chat_member(c.id,c.owner_id)) THEN RAISE EXCEPTION 'Owner replacement denied' USING ERRCODE='42501'; END IF;
  UPDATE erp_private.chat_conversations SET owner_id=target WHERE id=c.id;
  UPDATE erp_private.chat_memberships SET appointed=false WHERE id=member.id;
 ELSIF act='leave' OR (act='remove' AND moderator) THEN
  IF member.id IS NULL OR (target<>p AND (target IS NOT DISTINCT FROM c.owner_id OR (member.appointed AND NOT owner_access))) THEN RAISE EXCEPTION 'Removal denied' USING ERRCODE='42501'; END IF;
  UPDATE erp_private.chat_memberships SET left_at=clock_timestamp(),appointed=false WHERE id=member.id;
  UPDATE erp_private.chat_conversations SET owner_id=NULL WHERE id=c.id AND owner_id=target;
 ELSIF act='add' AND moderator THEN
  IF member.id IS NOT NULL OR NOT erp_private.chat_active(target) THEN RAISE EXCEPTION 'Member unavailable' USING ERRCODE='PT404'; END IF;
  INSERT INTO erp_private.chat_memberships(conversation,profile_id) VALUES(c.id,target);
 ELSIF act='rename' AND moderator THEN
  IF length(btrim(a->>'name')) NOT BETWEEN 1 AND 160 OR a->>'name' IS NULL THEN RAISE EXCEPTION 'Invalid name' USING ERRCODE='22023'; END IF;
  UPDATE erp_private.chat_conversations SET name=btrim(a->>'name') WHERE id=c.id;
 ELSE RAISE EXCEPTION 'Group action denied' USING ERRCODE='42501'; END IF;
 UPDATE erp_private.chat_conversations SET revision=revision+1 WHERE id=c.id RETURNING revision INTO updated;
 IF act<>'rename' THEN
  notice:=coalesce(erp_private.chat_work(target)->>'name','ERP user')||CASE act WHEN 'promote' THEN ' became a group admin' WHEN 'demote' THEN ' is no longer a group admin' WHEN 'add' THEN ' joined the group' WHEN 'replaceOwner' THEN ' became the group owner' ELSE ' left the group' END;
  PERFORM erp_private.chat_post(c.id,p,'notice',notice);
 END IF;
 PERFORM erp_private.chat_change(c.id,'group',c.id);
 RETURN updated;
END $$;
CREATE FUNCTION erp_private.chat_mutate(op text,a jsonb,p bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
<<chat_mutate>>
DECLARE mutation uuid:=(a->>'clientMutationId')::uuid; fingerprint bytea:=sha256(convert_to((jsonb_build_array(op,a))::text,'UTF8'));
 prior erp_private.chat_mutations; c erp_private.chat_conversations; source_c erp_private.chat_conversations; m erp_private.chat_messages; src erp_private.chat_messages; up erp_private.chat_uploads;
 cid uuid:=(a->>'conversationId')::uuid; mid uuid:=(a->>'messageId')::uuid; expected bigint:=(a->>'expectedRevision')::bigint;
 target bigint:=coalesce((a->>'targetProfileId')::bigint,(a->>'peerProfileId')::bigint); body text:=a->>'body'; change bigint; ent uuid; result jsonb; flag boolean:=(a->>'enabled')::boolean; kind text:=a->>'kind'; item uuid; ref jsonb; seqnum bigint; admin boolean; newrow boolean; dest uuid; peer bigint; basename text; mime text; previous_pulse erp_private.chat_presence; pulse_time timestamptz; replay_slot integer;
BEGIN
 IF mutation IS NULL THEN RAISE EXCEPTION 'Mutation ID required' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('chat-mutation:'||p||':'||mutation,0));
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('comms-scope-v1',0));
 SELECT * INTO prior FROM erp_private.chat_mutations r WHERE r.actor=p AND r.mutation=chat_mutate.mutation;
 IF prior.actor IS NOT NULL AND prior.request_hash<>fingerprint THEN RAISE EXCEPTION 'Mutation conflict' USING ERRCODE='PT409'; END IF;
 IF op='chat.forward' THEN
  mid:=(a->>'sourceMessageId')::uuid; dest:=(a->>'destinationConversationId')::uuid;
 END IF;
 IF mid IS NOT NULL THEN SELECT * INTO src FROM erp_private.chat_messages WHERE id=mid; cid:=src.conversation; END IF;
 IF op='chat.direct' THEN
  IF target IS NULL OR target=p OR NOT erp_private.chat_active(target) THEN RAISE EXCEPTION 'Peer unavailable' USING ERRCODE='PT404'; END IF;
  PERFORM erp_private.comms_lock_pair(p,target);
  SELECT * INTO c FROM erp_private.chat_conversations WHERE direct_low=least(p,target) AND direct_high=greatest(p,target);
  IF c.id IS NULL THEN
   IF erp_private.comms_pair_blocked(p,target) THEN RAISE EXCEPTION 'Direct communication unavailable' USING ERRCODE='42501'; END IF;
   PERFORM erp_private.comms_require_terms();
   INSERT INTO erp_private.chat_conversations(kind,direct_low,direct_high,creator) VALUES('direct',least(p,target),greatest(p,target),p) RETURNING * INTO c;
   INSERT INTO erp_private.chat_memberships(conversation,profile_id) VALUES(c.id,p),(c.id,target);
  END IF;
  IF prior.actor IS NULL THEN INSERT INTO erp_private.chat_mutations VALUES(p,mutation,fingerprint,c.id,c.id,jsonb_build_object('id',c.id)); END IF;
  RETURN erp_private.chat_conversation_json(c,p,'participant');
 END IF;
 IF op NOT IN ('chat.groupCreate','chat.namedGrant') THEN
  PERFORM 1 FROM erp_private.chat_conversations WHERE id IN(cid,dest) ORDER BY id FOR UPDATE;
  SELECT * INTO c FROM erp_private.chat_conversations WHERE id=cid;
  IF c.id IS NULL OR (NOT erp_private.chat_member(cid,p) AND NOT(op='chat.groupChange' AND a->>'action' IN('promote','demote','replaceOwner') AND erp_private.comms_is_system_admin())) THEN RAISE EXCEPTION 'Conversation unavailable' USING ERRCODE='PT404'; END IF;
  IF mid IS NOT NULL THEN SELECT * INTO src FROM erp_private.chat_messages WHERE id=mid FOR UPDATE; END IF;
 END IF;
 IF op='chat.namedGrant' AND NOT erp_private.comms_is_system_admin() THEN RAISE EXCEPTION 'Grant administration denied' USING ERRCODE='42501'; END IF;
 IF op='chat.groupCreate' AND NOT erp_private.comms_has_named_grant('groupCreate') THEN RAISE EXCEPTION 'Group creation denied' USING ERRCODE='42501'; END IF;
 IF op IN('chat.groupCreate','chat.edit') OR (op='chat.groupChange' AND a->>'action' IN('add','rename')) THEN PERFORM erp_private.comms_require_terms(); END IF;
 IF op IN('chat.send','chat.reaction','chat.uploadBegin','chat.pulse') THEN PERFORM erp_private.chat_write_allowed(c,p); END IF;
 IF op='chat.forward' THEN
  source_c:=c;
  SELECT * INTO c FROM erp_private.chat_conversations WHERE id=dest;
  IF c.id IS NULL OR src.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Message unavailable' USING ERRCODE='PT404'; END IF;
  PERFORM erp_private.chat_write_allowed(c,p);
 END IF;
 IF prior.actor IS NOT NULL THEN
  IF prior.conversation IS NOT NULL AND NOT erp_private.chat_member(prior.conversation,p) AND NOT(op='chat.groupChange' AND erp_private.comms_is_system_admin()) THEN RAISE EXCEPTION 'Conversation unavailable' USING ERRCODE='PT404'; END IF;
  IF op='chat.groupCreate' THEN SELECT * INTO c FROM erp_private.chat_conversations WHERE id=prior.conversation; RETURN erp_private.chat_conversation_json(c,p,'participant'); END IF;
  RETURN prior.result;
 END IF;
 IF op='chat.namedGrant' THEN
  IF kind IS NULL OR kind NOT IN('historyReview','groupCreate') OR flag IS NULL OR NOT erp_private.chat_active(target) THEN RAISE EXCEPTION 'Invalid named grant' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('comms-named:'||target||kind,0));
  SELECT revision INTO change FROM erp_private.chat_named_grants WHERE profile_id=target AND chat_named_grants.kind=chat_mutate.kind;
  IF expected IS NOT NULL AND expected<>coalesce(change,0) THEN RAISE EXCEPTION 'Grant conflict' USING ERRCODE='PT409'; END IF;
  INSERT INTO erp_private.chat_named_grants(profile_id,kind,enabled,granted_by) VALUES(target,kind,flag,p) ON CONFLICT ON CONSTRAINT chat_named_grants_pkey DO UPDATE SET enabled=excluded.enabled,revision=chat_named_grants.revision+1,granted_by=excluded.granted_by RETURNING revision INTO change;
  result:=jsonb_build_object('id',target::text,'kind',kind,'enabled',flag,'revision',change::text);
 ELSIF op='chat.groupCreate' THEN
  IF length(btrim(a->>'name')) NOT BETWEEN 1 AND 160 OR a->>'name' IS NULL THEN RAISE EXCEPTION 'Invalid group name' USING ERRCODE='22023'; END IF;
  INSERT INTO erp_private.chat_conversations(kind,creator,owner_id,name) VALUES('group',p,p,btrim(a->>'name')) RETURNING * INTO c;
  FOR target IN SELECT p UNION SELECT value::bigint FROM jsonb_array_elements_text(coalesce(a->'memberProfileIds','[]')) LOOP
   IF NOT erp_private.chat_active(target) THEN RAISE EXCEPTION 'Member unavailable' USING ERRCODE='PT404'; END IF;
   INSERT INTO erp_private.chat_memberships(conversation,profile_id) VALUES(c.id,target);
   PERFORM erp_private.chat_post(c.id,p,'notice',(erp_private.chat_work(target)->>'name')||' joined the group');
  END LOOP;
  SELECT * INTO c FROM erp_private.chat_conversations WHERE id=c.id;
  result:=erp_private.chat_conversation_json(c,p,'participant'); ent:=c.id;
 ELSIF op='chat.groupChange' THEN
  change:=erp_private.chat_group_change(c,p,a); ent:=c.id;
 ELSIF op IN('chat.send','chat.forward') THEN
  IF op='chat.forward' THEN
   IF src.revision IS DISTINCT FROM expected OR src.kind='notice' THEN RAISE EXCEPTION 'Source conflict' USING ERRCODE='PT409'; END IF;
   ref:=erp_private.chat_dms_ref(src.dms_ref,true);
   IF src.dms_ref IS NOT NULL AND ref IS NULL THEN RAISE EXCEPTION 'Document unavailable' USING ERRCODE='PT404'; END IF;
   m:=erp_private.chat_post(c.id,p,'message',src.body,NULL,true);
   INSERT INTO erp_private.chat_attachments(message,upload,kind) SELECT m.id,att.upload,att.kind FROM erp_private.chat_attachments att WHERE att.message=src.id;
  ELSE
   IF length(body)>32000 OR (coalesce(length(btrim(body)),0)=0 AND jsonb_array_length(coalesce(a->'uploadIds','[]'))=0 AND NOT(a?'dmsRef')) THEN RAISE EXCEPTION 'Invalid message' USING ERRCODE='22023'; END IF;
   IF a->>'replyToMessageId' IS NOT NULL AND NOT EXISTS(SELECT FROM erp_private.chat_messages WHERE id=(a->>'replyToMessageId')::uuid AND conversation=c.id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Reply unavailable' USING ERRCODE='PT404'; END IF;
   IF a?'dmsRef' THEN ref:=erp_private.chat_dms_ref(a->'dmsRef',true); IF ref IS NULL THEN RAISE EXCEPTION 'Document unavailable' USING ERRCODE='PT404'; END IF; END IF;
   m:=erp_private.chat_post(c.id,p,'message',body,(a->>'replyToMessageId')::uuid);
   FOR item IN SELECT value::uuid FROM jsonb_array_elements_text(coalesce(a->'uploadIds','[]')) LOOP
    UPDATE erp_private.chat_uploads SET state='attached' WHERE id=item AND actor=p AND reserving_session=(auth.jwt()->>'session_id')::uuid AND conversation=c.id AND state='verified' AND stage_permit IS NOT NULL AND cleanup_phase IS NULL AND stage_expires_at>clock_timestamp() RETURNING * INTO up;
    IF NOT FOUND THEN RAISE EXCEPTION 'Upload unavailable' USING ERRCODE='PT404'; END IF;
    INSERT INTO erp_private.chat_attachments(message,upload,kind) VALUES(m.id,item,CASE WHEN up.voice THEN 'voice' WHEN split_part(up.mime,'/',1) IN('video','image','audio') THEN split_part(up.mime,'/',1) ELSE 'file' END);
    PERFORM erp_comm_cost.release_attached_chat_stage(up.stage_permit,up.id);
   END LOOP;
   PERFORM erp_private.chat_mentions_set(m,a->'mentionProfileIds');
  END IF;
  IF ref IS NOT NULL THEN UPDATE erp_private.chat_messages SET dms_ref=ref WHERE id=m.id; END IF;
 ELSIF op IN('chat.edit','chat.delete') THEN
  IF src.id IS NULL OR src.deleted_at IS NOT NULL OR src.kind='notice' OR src.revision IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Message revision conflict' USING ERRCODE='PT409'; END IF;
  IF src.sender=p THEN
   IF clock_timestamp()>=src.sent_at+interval '15 minutes' THEN RAISE EXCEPTION 'Message window closed' USING ERRCODE='42501'; END IF;
  ELSIF op='chat.edit' OR c.kind<>'group' OR NOT(coalesce(c.owner_id=p,false) OR EXISTS(SELECT FROM erp_private.chat_memberships WHERE conversation=c.id AND profile_id=p AND left_at IS NULL AND appointed)) THEN RAISE EXCEPTION 'Moderation denied' USING ERRCODE='42501'; END IF;
  IF op='chat.edit' THEN
   PERFORM erp_private.chat_write_allowed(c,p);
   IF coalesce(length(btrim(body)),0) NOT BETWEEN 1 AND 32000 THEN RAISE EXCEPTION 'Invalid message' USING ERRCODE='22023'; END IF;
   UPDATE erp_private.chat_messages SET body=chat_mutate.body,edited_at=clock_timestamp(),revision=revision+1 WHERE id=mid RETURNING * INTO m;
   PERFORM erp_private.chat_mentions_set(m,a->'mentionProfileIds');
  ELSE UPDATE erp_private.chat_messages SET deleted_at=clock_timestamp(),deleted_by=p,revision=revision+1 WHERE id=mid RETURNING * INTO m;
  END IF;
  PERFORM erp_private.chat_change(c.id,'message',mid);
 ELSIF op IN('chat.star','chat.pin','chat.reaction') THEN
  IF flag IS NULL OR src.id IS NULL OR (src.deleted_at IS NOT NULL AND NOT(op='chat.pin' AND flag IS FALSE)) THEN RAISE EXCEPTION 'Message unavailable' USING ERRCODE='PT404'; END IF;
  IF op='chat.pin' THEN
   IF c.kind<>'group' OR NOT(coalesce(c.owner_id=p,false) OR EXISTS(SELECT FROM erp_private.chat_memberships WHERE conversation=c.id AND profile_id=p AND left_at IS NULL AND appointed)) THEN RAISE EXCEPTION 'Pin denied' USING ERRCODE='42501'; END IF;
   IF flag THEN INSERT INTO erp_private.chat_pins VALUES(mid) ON CONFLICT DO NOTHING; ELSE DELETE FROM erp_private.chat_pins WHERE message=mid; END IF;
  ELSIF op='chat.star' THEN
   IF flag THEN INSERT INTO erp_private.chat_stars VALUES(p,mid) ON CONFLICT DO NOTHING; ELSE DELETE FROM erp_private.chat_stars WHERE profile_id=p AND message=mid; END IF;
  ELSE
   IF a->>'emoji' IS NULL OR length(a->>'emoji') NOT BETWEEN 1 AND 32 THEN RAISE EXCEPTION 'Invalid emoji' USING ERRCODE='22023'; END IF;
   IF flag THEN INSERT INTO erp_private.chat_reactions VALUES(mid,p,a->>'emoji') ON CONFLICT DO NOTHING; ELSE DELETE FROM erp_private.chat_reactions WHERE message=mid AND profile_id=p AND emoji=a->>'emoji'; END IF;
  END IF;
  ent:=mid; change:=erp_private.chat_change(c.id,op,mid,CASE WHEN op='chat.star' THEN p END);
 ELSIF op='chat.personal' THEN
  INSERT INTO erp_private.chat_personal(profile_id,conversation,muted,archive_seq) VALUES(p,c.id,coalesce((a->>'muted')::boolean,false),CASE WHEN (a->>'archived')::boolean THEN c.latest_seq END)
  ON CONFLICT ON CONSTRAINT chat_personal_pkey DO UPDATE SET muted=coalesce((a->>'muted')::boolean,chat_personal.muted),archive_seq=CASE WHEN a?'archived' THEN excluded.archive_seq ELSE chat_personal.archive_seq END;
  ent:=c.id; change:=erp_private.chat_change(c.id,op,c.id,p);
 ELSIF op='chat.read' THEN
  seqnum:=(a->>'upToSeq')::bigint;
  IF seqnum IS NULL OR seqnum NOT BETWEEN 0 AND c.latest_seq THEN RAISE EXCEPTION 'Invalid read sequence' USING ERRCODE='22023'; END IF;
  INSERT INTO erp_private.chat_reads(message,profile_id) SELECT s.id,p FROM erp_private.chat_messages s WHERE s.conversation=c.id AND s.seq<=seqnum AND s.sender<>p ON CONFLICT DO NOTHING;
  change:=erp_private.chat_change(c.id,'read',c.id);
  result:=jsonb_build_object('id',c.id,'conversationId',c.id,'revision',change::text,'readThroughSeq',seqnum::text);
 ELSIF op='chat.uploadBegin' THEN
  basename:=a->>'filename'; mime:=lower(a->>'mime');
  IF basename IS NULL OR length(basename) NOT BETWEEN 1 AND 240 OR basename IN('.','..') OR btrim(basename)<>basename OR basename~'[[:cntrl:]/\\]' OR mime IS NULL OR NOT(mime=ANY(erp_private.chat_mimes())) OR (a?'kind' AND (kind IS DISTINCT FROM 'voice' OR mime NOT LIKE 'audio/%')) THEN RAISE EXCEPTION 'Invalid media' USING ERRCODE='22023'; END IF;
  IF (a->>'byteLength')::bigint IS NULL OR (a->>'byteLength')::bigint NOT BETWEEN 1 AND 52428800 THEN RAISE EXCEPTION 'Invalid size' USING ERRCODE='54000'; END IF;
  INSERT INTO erp_private.chat_uploads(actor,reserving_session,conversation,filename,mime,size_bytes,voice) VALUES(p,(auth.jwt()->>'session_id')::uuid,c.id,basename,mime,(a->>'byteLength')::bigint,coalesce(kind='voice',false)) RETURNING * INTO up;
  result:=jsonb_build_object('uploadId',up.id,'conversationId',c.id,'byteLength',up.size_bytes,'state',up.state);
 ELSIF op='chat.pulse' THEN
  IF jsonb_typeof(a->'typing') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid pulse' USING ERRCODE='22023'; END IF;
  result:=jsonb_build_object('id',c.id,'conversationId',c.id,'revision',c.revision::text);
  SELECT * INTO previous_pulse FROM erp_private.chat_presence WHERE conversation=c.id AND profile_id=p AND session_id=(auth.jwt()->>'session_id')::uuid;
  replay_slot:=array_position(previous_pulse.recent_ids,mutation);
  IF replay_slot IS NOT NULL THEN
   IF previous_pulse.recent_hashes[replay_slot] IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'Pulse conflict' USING ERRCODE='PT409'; END IF;
   RETURN result;
  END IF;
  pulse_time:=coalesce((a->>'pulseAt')::timestamptz,clock_timestamp());
  IF NOT isfinite(pulse_time) OR pulse_time>clock_timestamp()+interval '10 seconds' THEN RAISE EXCEPTION 'Invalid pulse time' USING ERRCODE='22023'; END IF;
  IF pulse_time<=previous_pulse.observed_at OR pulse_time<clock_timestamp()-interval '45 seconds' THEN RETURN result; END IF;
  DELETE FROM erp_private.chat_presence stale WHERE stale.ctid IN (SELECT x.ctid FROM erp_private.chat_presence x WHERE x.online_until<clock_timestamp()-interval '1 minute' ORDER BY x.online_until LIMIT 4 FOR UPDATE SKIP LOCKED);
  INSERT INTO erp_private.chat_presence VALUES(c.id,p,(auth.jwt()->>'session_id')::uuid,least(clock_timestamp(),pulse_time)+interval '45 seconds',
   CASE WHEN (a->>'typing')::boolean THEN least(clock_timestamp(),pulse_time)+interval '6 seconds' END,pulse_time,array_prepend(mutation,previous_pulse.recent_ids[1:31]),array_prepend(fingerprint,previous_pulse.recent_hashes[1:31]))
  ON CONFLICT ON CONSTRAINT chat_presence_pkey DO UPDATE SET online_until=excluded.online_until,typing_until=excluded.typing_until,observed_at=excluded.observed_at,recent_ids=excluded.recent_ids,recent_hashes=excluded.recent_hashes;
  RETURN result;
 ELSE RAISE EXCEPTION 'Unknown chat operation' USING ERRCODE='22023'; END IF;
 IF m.id IS NOT NULL THEN result:=jsonb_build_object('id',m.id,'conversationId',m.conversation,'revision',m.revision::text,'seq',m.seq::text); ent:=m.id; END IF;
 IF result IS NULL THEN result:=jsonb_build_object('id',ent,'conversationId',c.id,'revision',change::text); END IF;
 INSERT INTO erp_private.chat_mutations VALUES(p,mutation,fingerprint,ent,c.id,CASE WHEN op='chat.groupCreate' THEN jsonb_build_object('id',c.id) ELSE result END);
 RETURN result;
END $$;
CREATE FUNCTION erp_private.chat_mimes() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT ARRAY['application/pdf','application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','image/jpeg','image/png','image/webp','audio/mp4','audio/aac','audio/mpeg','audio/ogg','audio/webm','audio/wav','video/mp4','video/webm']::text[]
$$;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('erp-chat-media','erp-chat-media',false,52428800,erp_private.chat_mimes());
CREATE POLICY erp_chat_objects_private ON storage.objects AS RESTRICTIVE FOR ALL TO PUBLIC USING (bucket_id<>'erp-chat-media') WITH CHECK(bucket_id<>'erp-chat-media');

CREATE TABLE erp_private.comms_chat_gate(singleton boolean PRIMARY KEY CHECK(singleton),enabled boolean NOT NULL DEFAULT false);
INSERT INTO erp_private.comms_chat_gate VALUES(true,false);
CREATE FUNCTION erp_private.chat_take_permit(permit uuid,feature text,actor bigint,command jsonb,service_session uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF permit IS NULL OR NOT EXISTS(SELECT FROM erp_private.comms_chat_gate WHERE singleton AND enabled FOR SHARE) THEN RAISE EXCEPTION 'budget_permit_unavailable' USING ERRCODE='PT503'; END IF;
 BEGIN
  IF service_session IS NULL THEN
   PERFORM erp_comm_cost.take_permit(permit,feature,'communications',actor::text,command);
  ELSE
   PERFORM erp_comm_cost.take_service_permit(permit,feature,'communications',actor::text,service_session,command);
  END IF;
 EXCEPTION WHEN invalid_schema_name OR undefined_function THEN RAISE EXCEPTION 'budget_permit_unavailable' USING ERRCODE='PT503';
 END;
END $$;
-- Only the Storage service handles bytes. These callbacks fence its catalog
-- commit with the same per-upload row used by send, verify and cleanup.
CREATE FUNCTION erp_private.chat_storage_fence() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u erp_private.chat_uploads;
BEGIN
 IF TG_OP='DELETE' THEN
  SELECT * INTO u FROM erp_private.chat_uploads WHERE id=OLD.name::uuid FOR UPDATE;
  IF u.state='attached' OR EXISTS(SELECT FROM erp_private.chat_attachments WHERE upload=u.id) THEN RAISE EXCEPTION 'Retained media' USING ERRCODE='42501'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.bucket_id IS DISTINCT FROM OLD.bucket_id OR NEW.name IS DISTINCT FROM OLD.name) THEN RAISE EXCEPTION 'Immutable upload path' USING ERRCODE='42501'; END IF;
 SELECT * INTO u FROM erp_private.chat_uploads WHERE id=NEW.name::uuid FOR UPDATE;
 IF u.id IS NULL OR NEW.name<>u.id::text OR u.stage_permit IS NULL OR u.state<>'reserved' OR u.cleanup_phase IS NOT NULL
  OR u.stage_expires_at<=clock_timestamp() OR u.write_lease_until IS NULL OR u.write_lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'Upload stage unavailable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER erp_chat_stage_insert BEFORE INSERT ON storage.objects FOR EACH ROW WHEN(NEW.bucket_id='erp-chat-media') EXECUTE FUNCTION erp_private.chat_storage_fence();
CREATE TRIGGER erp_chat_stage_update BEFORE UPDATE OF bucket_id,name,metadata ON storage.objects FOR EACH ROW WHEN(NEW.bucket_id='erp-chat-media' OR OLD.bucket_id='erp-chat-media') EXECUTE FUNCTION erp_private.chat_storage_fence();
CREATE TRIGGER erp_chat_retained_delete BEFORE DELETE ON storage.objects FOR EACH ROW WHEN(OLD.bucket_id='erp-chat-media') EXECUTE FUNCTION erp_private.chat_storage_fence();

CREATE FUNCTION public.erp_chat_stage_open(p_upload uuid,p_actor bigint,p_session uuid,p_permit uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u erp_private.chat_uploads; c erp_private.chat_conversations; worker_id uuid; cutoff timestamptz;
BEGIN
 IF p_session IS NULL OR erp_private.provider_actor_session_valid(p_actor,p_session) IS NOT TRUE THEN RAISE EXCEPTION 'Session required' USING ERRCODE='42501'; END IF;
 PERFORM erp_private.chat_take_permit(p_permit,'media_upload',p_actor,jsonb_build_object('op','chat.stageOpen','args',jsonb_build_object('uploadId',p_upload,'actorId',p_actor::text,'sessionId',p_session)),p_session);
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('comms-scope-v1',0));
 SELECT * INTO c FROM erp_private.chat_conversations WHERE id=(SELECT conversation FROM erp_private.chat_uploads WHERE id=p_upload AND actor=p_actor AND reserving_session=p_session) FOR UPDATE;
 SELECT * INTO u FROM erp_private.chat_uploads WHERE id=p_upload AND actor=p_actor AND reserving_session=p_session FOR UPDATE;
 IF u.id IS NULL OR NOT erp_private.chat_member(c.id,p_actor) OR NOT erp_private.chat_active(p_actor) OR u.state='failed' OR u.cleanup_phase IS NOT NULL
  OR (u.state<>'attached' AND u.stage_expires_at<=clock_timestamp()) OR NOT EXISTS(SELECT FROM erp_private.comms_policy_versions v JOIN erp_private.comms_policy_acceptances aa USING(version) WHERE v.is_current AND aa.profile_id=p_actor FOR SHARE OF v,aa) THEN RAISE EXCEPTION 'Upload unavailable' USING ERRCODE='PT404'; END IF;
 IF c.kind='direct' THEN
  PERFORM erp_private.comms_lock_pair(c.direct_low,c.direct_high);
  IF erp_private.comms_pair_blocked(c.direct_low,c.direct_high) OR NOT erp_private.chat_active(c.direct_low) OR NOT erp_private.chat_active(c.direct_high) THEN RAISE EXCEPTION 'Direct unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 IF u.state='reserved' THEN
  cutoff:=u.stage_expires_at+interval '1 hour';
  SELECT worker INTO worker_id FROM erp_private.chat_cleanup_worker w WHERE (u.cleanup_worker IS NULL OR w.worker=u.cleanup_worker)
   AND NOT EXISTS(SELECT FROM erp_private.chat_uploads held WHERE held.cleanup_worker=w.worker AND held.cleanup_phase='attention')
   AND seen_at>clock_timestamp()-interval '2 minutes' AND covered_until>=cutoff
   AND erp_comm_cost.chat_stage_worker_covers(worker,cutoff) ORDER BY covered_until DESC,worker LIMIT 1;
  IF worker_id IS NULL THEN RAISE EXCEPTION 'cleanup_worker_unavailable' USING ERRCODE='PT503'; END IF;
  IF u.stage_permit IS NULL THEN
   PERFORM erp_comm_cost.bind_chat_stage(p_permit,u.id,cutoff);
   PERFORM erp_comm_cost.claim_chat_stage_window(worker_id,p_permit,cutoff);
  END IF;
  UPDATE erp_private.chat_uploads SET stage_permit=coalesce(stage_permit,p_permit),cleanup_worker=worker_id,write_lease_until=least(stage_expires_at,clock_timestamp()+interval '5 minutes') WHERE id=u.id;
 END IF;
 RETURN jsonb_build_object('uploadId',u.id,'bucket','erp-chat-media','path',u.id::text,'state',u.state,'stageExpiresAt',u.stage_expires_at);
END $$;
CREATE FUNCTION public.erp_chat_stage_abort(p_upload uuid,p_actor bigint,p_session uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed bigint;
BEGIN
 -- Service callback bound to the original upload. It cannot affect attached or
 -- reconciled verified bytes, and does not require an end-user session to survive.
 UPDATE erp_private.chat_uploads SET state='failed',cleanup_phase='queued',next_cleanup_at=greatest(clock_timestamp(),write_lease_until)
 WHERE id=p_upload AND actor=p_actor AND reserving_session=p_session AND stage_permit IS NOT NULL AND state='reserved' AND cleanup_phase IS NULL;
 GET DIAGNOSTICS changed=ROW_COUNT; RETURN jsonb_build_object('queued',changed=1 OR EXISTS(SELECT FROM erp_private.chat_uploads WHERE id=p_upload AND actor=p_actor AND reserving_session=p_session AND cleanup_phase IN('queued','leased')));
END $$;
CREATE FUNCTION public.erp_chat_stage_claim(p_worker uuid,p_attempt uuid,p_until timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE coverage timestamptz; u erp_private.chat_uploads; admission jsonb; now_at timestamptz; deadline timestamptz; result jsonb;
BEGIN
 IF p_worker IS NULL OR p_attempt IS NULL OR p_until IS NULL OR NOT isfinite(p_until) OR p_until<=clock_timestamp() THEN RAISE EXCEPTION 'Invalid cleanup claim' USING ERRCODE='22023'; END IF;
 coverage:=erp_comm_cost.take_chat_stage_poll(p_worker,p_attempt);
 now_at:=clock_timestamp();
 IF coverage IS NULL OR coverage<=now_at THEN RAISE EXCEPTION 'cleanup_poll_unavailable' USING ERRCODE='PT503'; END IF;
 coverage:=least(coverage,p_until);
 INSERT INTO erp_private.chat_cleanup_worker VALUES(p_worker,now_at,coverage) ON CONFLICT(worker) DO UPDATE SET seen_at=excluded.seen_at,covered_until=excluded.covered_until;
 SELECT * INTO u FROM erp_private.chat_uploads z WHERE cleanup_worker=p_worker AND stage_permit IS NOT NULL AND state<>'attached'
  AND cleanup_phase IS DISTINCT FROM 'cleaned' AND cleanup_phase IS DISTINCT FROM 'attention'
  AND coalesce(next_cleanup_at,stage_expires_at)<=now_at AND (write_lease_until IS NULL OR write_lease_until<=now_at)
  AND NOT EXISTS(SELECT FROM erp_private.chat_attachments WHERE upload=z.id)
  ORDER BY coalesce(next_cleanup_at,stage_expires_at),id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF u.id IS NOT NULL THEN
  admission:=erp_comm_cost.cleanup('authorize_cleanup',jsonb_build_object('permitId',u.stage_permit,'endpoint','discard_partial_upload','resourceId','erp-chat-media/'||u.id,'attemptId',p_attempt));
  IF (admission->>'ok')::boolean IS NOT TRUE THEN
   UPDATE erp_private.chat_uploads SET state='failed',cleanup_phase='attention',next_cleanup_at=NULL WHERE id=u.id;
  ELSIF (admission->>'newAttempt')::boolean IS TRUE THEN
   deadline:=least(coverage,now_at+interval '3 minutes');
   UPDATE erp_private.chat_uploads SET state='failed',cleanup_phase='leased',cleanup_attempt=p_attempt,cleanup_lease_until=deadline,next_cleanup_at=deadline WHERE id=u.id;
   result:=jsonb_build_object('uploadId',u.id,'bucket','erp-chat-media','path',u.id::text,'attemptId',p_attempt,'leaseUntil',deadline);
  END IF;
 END IF;
 RETURN jsonb_build_object('coveredUntil',coverage,'job',result);
END $$;
CREATE FUNCTION public.erp_chat_stage_finish(p_upload uuid,p_attempt uuid,p_absent boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u erp_private.chat_uploads; ack jsonb;
BEGIN
 SELECT * INTO u FROM erp_private.chat_uploads WHERE id=p_upload AND cleanup_attempt=p_attempt FOR UPDATE;
 IF u.id IS NULL OR p_absent IS NULL THEN RAISE EXCEPTION 'Cleanup claim unavailable' USING ERRCODE='PT404'; END IF;
 IF u.cleanup_phase='cleaned' THEN RETURN jsonb_build_object('confirmed',true); END IF;
 IF u.cleanup_phase IS DISTINCT FROM 'leased' OR u.state<>'failed' OR EXISTS(SELECT FROM erp_private.chat_attachments WHERE upload=u.id) THEN RAISE EXCEPTION 'Cleanup claim unavailable' USING ERRCODE='PT404'; END IF;
 IF p_absent AND u.cleanup_lease_until>clock_timestamp() AND NOT EXISTS(SELECT FROM storage.objects WHERE bucket_id='erp-chat-media' AND name=u.id::text) THEN
  ack:=erp_comm_cost.cleanup('confirm_cleanup',jsonb_build_object('permitId',u.stage_permit,'endpoint','discard_partial_upload','resourceId','erp-chat-media/'||u.id,'attemptId',p_attempt));
  IF (ack->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Cleanup confirmation unavailable' USING ERRCODE='PT503'; END IF;
  UPDATE erp_private.chat_uploads SET cleanup_phase='cleaned',cleanup_lease_until=NULL,next_cleanup_at=NULL WHERE id=u.id;
  RETURN jsonb_build_object('confirmed',true);
 END IF;
 DELETE FROM erp_private.chat_cleanup_worker WHERE worker=u.cleanup_worker;
 UPDATE erp_private.chat_uploads SET cleanup_phase='queued',cleanup_lease_until=NULL,next_cleanup_at=clock_timestamp()+interval '30 seconds' WHERE id=u.id;
 RETURN jsonb_build_object('confirmed',false);
END $$;
REVOKE ALL ON FUNCTION public.erp_chat_stage_open(uuid,bigint,uuid,uuid),public.erp_chat_stage_abort(uuid,bigint,uuid),public.erp_chat_stage_claim(uuid,uuid,timestamptz),public.erp_chat_stage_finish(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_chat_stage_open(uuid,bigint,uuid,uuid),public.erp_chat_stage_abort(uuid,bigint,uuid),public.erp_chat_stage_claim(uuid,uuid,timestamptz),public.erp_chat_stage_finish(uuid,uuid,boolean) TO service_role;
REVOKE ALL ON FUNCTION erp_private.chat_storage_fence() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.erp_chat_upload_bind(p_upload uuid,p_permit uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<erp_chat_upload_bind>>
DECLARE actor bigint:=erp_private.comms_actor_id(); u erp_private.chat_uploads; c erp_private.chat_conversations;
BEGIN
 PERFORM erp_private.chat_take_permit(p_permit,'media_upload',actor,jsonb_build_object('op','chat.uploadBind','args',jsonb_build_object('uploadId',p_upload)));
 SELECT * INTO u FROM erp_private.chat_uploads WHERE id=p_upload AND chat_uploads.actor=erp_chat_upload_bind.actor AND reserving_session=(auth.jwt()->>'session_id')::uuid;
 SELECT * INTO c FROM erp_private.chat_conversations WHERE id=u.conversation;
 IF u.id IS NULL OR u.state='failed' OR (u.state<>'attached' AND (u.cleanup_phase IS NOT NULL OR u.stage_expires_at<=clock_timestamp())) THEN RAISE EXCEPTION 'Upload unavailable' USING ERRCODE='PT404'; END IF;
 PERFORM erp_private.chat_write_allowed(c,actor);
 RETURN jsonb_build_object('uploadId',u.id,'actorId',actor::text,'sessionId',u.reserving_session,'bucket','erp-chat-media','path',u.id::text,'filename',u.filename,'mime',u.mime,'byteLength',u.size_bytes,'state',u.state);
END $$;
CREATE FUNCTION public.erp_chat_upload_verified(p_upload uuid,p_actor bigint,p_session uuid,p_size bigint,p_mime text,p_sha256 text,p_permit uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u erp_private.chat_uploads; c erp_private.chat_conversations;
BEGIN
 IF p_session IS NULL THEN RAISE EXCEPTION 'Session required' USING ERRCODE='42501'; END IF;
 PERFORM erp_private.chat_take_permit(p_permit,'media_upload',p_actor,jsonb_build_object('op','chat.uploadVerified','args',jsonb_build_object('uploadId',p_upload,'actorId',p_actor::text,'sessionId',p_session,'byteLength',p_size,'mime',p_mime,'sha256',p_sha256)),p_session);
 IF erp_private.provider_actor_session_valid(p_actor,p_session) IS NOT TRUE THEN RAISE EXCEPTION 'Session required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('comms-scope-v1',0));
 SELECT * INTO c FROM erp_private.chat_conversations WHERE id=(SELECT conversation FROM erp_private.chat_uploads WHERE id=p_upload AND actor=p_actor AND reserving_session=p_session) FOR UPDATE;
 SELECT * INTO u FROM erp_private.chat_uploads WHERE id=p_upload AND actor=p_actor AND reserving_session=p_session FOR UPDATE;
 IF u.id IS NULL OR NOT erp_private.chat_member(c.id,p_actor) OR NOT erp_private.chat_active(p_actor) OR NOT EXISTS(SELECT FROM erp_private.comms_policy_versions v JOIN erp_private.comms_policy_acceptances aa USING(version) WHERE v.is_current AND aa.profile_id=p_actor FOR SHARE OF v,aa) THEN RAISE EXCEPTION 'Upload unavailable' USING ERRCODE='PT404'; END IF;
 IF c.kind='direct' THEN PERFORM erp_private.comms_lock_pair(c.direct_low,c.direct_high);
  IF erp_private.comms_pair_blocked(c.direct_low,c.direct_high) OR NOT erp_private.chat_active(c.direct_low) OR NOT erp_private.chat_active(c.direct_high) THEN RAISE EXCEPTION 'Direct unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 IF u.stage_permit IS NULL OR (u.state<>'attached' AND (u.cleanup_phase IS NOT NULL OR u.stage_expires_at<=clock_timestamp())) THEN RAISE EXCEPTION 'Upload stage unavailable' USING ERRCODE='PT404'; END IF;
 IF p_size IS DISTINCT FROM u.size_bytes OR lower(p_mime) IS DISTINCT FROM u.mime OR p_sha256 IS NULL OR p_sha256!~'^[0-9a-f]{64}$' OR u.state='failed' OR (u.sha256 IS NOT NULL AND u.sha256<>p_sha256) THEN RAISE EXCEPTION 'Verified content conflict' USING ERRCODE='PT409'; END IF;
 IF NOT EXISTS(SELECT FROM storage.objects o WHERE o.bucket_id='erp-chat-media' AND o.name=u.id::text AND (o.metadata->>'size')::bigint=p_size AND lower(o.metadata->>'mimetype')=u.mime) THEN RAISE EXCEPTION 'Object unavailable' USING ERRCODE='PT404'; END IF;
 IF u.state='reserved' THEN UPDATE erp_private.chat_uploads SET state='verified',sha256=p_sha256 WHERE id=u.id RETURNING * INTO u; END IF;
 RETURN jsonb_build_object('uploadId',u.id,'state',u.state);
END $$;
CREATE FUNCTION public.erp_chat_attachment_bind(p_attachment uuid,p_mode text,p_permit uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor bigint:=erp_private.comms_actor_id(); result jsonb;
BEGIN
 PERFORM erp_private.chat_take_permit(p_permit,'media_download',actor,jsonb_build_object('op','chat.attachmentBind','args',jsonb_build_object('attachmentId',p_attachment,'mode',p_mode)));
 SELECT jsonb_build_object('id',att.id,'bucket','erp-chat-media','path',u.id::text,'filename',u.filename,'mime',u.mime,'byteLength',u.size_bytes,'sha256',u.sha256,'revision',m.revision::text) INTO result
 FROM erp_private.chat_attachments att JOIN erp_private.chat_uploads u ON u.id=att.upload JOIN erp_private.chat_messages m ON m.id=att.message
 WHERE att.id=p_attachment AND u.state='attached' AND erp_private.chat_visible(m.conversation,p_mode) AND (m.deleted_at IS NULL OR p_mode='review');
 IF result IS NULL THEN RAISE EXCEPTION 'Attachment unavailable' USING ERRCODE='PT404'; END IF; RETURN result;
END $$;
CREATE FUNCTION public.erp_chat_export_page(p_conversation uuid,p_mode text,p_from timestamptz,p_until timestamptz,p_after bigint,p_limit integer,p_expected bigint,p_permit uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor bigint:=erp_private.comms_actor_id(); revision bigint; items jsonb; last_seq bigint; more boolean;
BEGIN
 PERFORM erp_private.chat_take_permit(p_permit,'export',actor,jsonb_build_object('op','chat.exportPage','args',jsonb_build_object('conversationId',p_conversation,'mode',p_mode,'from',(extract(epoch FROM p_from)*1000)::bigint::text,'until',(extract(epoch FROM p_until)*1000)::bigint::text,'after',p_after::text,'limit',p_limit,'expected',p_expected::text)));
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_after<0 OR p_from>=p_until THEN RAISE EXCEPTION 'Invalid export page' USING ERRCODE='22023'; END IF;
 SELECT c.change_seq INTO revision FROM erp_private.chat_conversations c WHERE c.id=p_conversation AND erp_private.chat_visible(c.id,p_mode);
 IF revision IS NULL THEN RAISE EXCEPTION 'Export unavailable' USING ERRCODE='PT404'; END IF;
 IF p_expected IS NOT NULL AND p_expected<>revision THEN RAISE EXCEPTION 'Export conflict' USING ERRCODE='PT409'; END IF;
 WITH page AS (SELECT m.* FROM erp_private.chat_messages m WHERE m.conversation=p_conversation AND m.seq>coalesce(p_after,0) AND (p_from IS NULL OR m.sent_at>=p_from) AND (p_until IS NULL OR m.sent_at<p_until) ORDER BY m.seq LIMIT p_limit+1),
 numbered AS (SELECT q.*,row_number() OVER(ORDER BY q.seq) n FROM page q)
 SELECT coalesce(jsonb_agg(erp_private.chat_message_json(m,actor,p_mode) ORDER BY q.seq) FILTER(WHERE q.n<=p_limit),'[]'),max(q.seq) FILTER(WHERE q.n<=p_limit),count(*)>p_limit INTO items,last_seq,more FROM numbered q JOIN erp_private.chat_messages m ON m.id=q.id;
 RETURN jsonb_build_object('items',items,'nextSeq',CASE WHEN more THEN last_seq::text END,'revision',revision::text);
END $$;
CREATE FUNCTION erp_private.chat_sync(a jsonb,p bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE n int:=coalesce((a->>'limit')::int,40); after_id uuid:=(a->>'manifestCursor')::uuid; manifest jsonb; revoked jsonb; changes jsonb; next_id uuid; more boolean;
BEGIN
 IF n NOT BETWEEN 1 AND 100 OR jsonb_array_length(coalesce(a->'cursors','[]'))>1000 THEN RAISE EXCEPTION 'Invalid sync' USING ERRCODE='22023'; END IF;
 WITH page AS (SELECT c.* FROM erp_private.chat_conversations c WHERE erp_private.chat_member(c.id,p) AND (after_id IS NULL OR c.id>after_id) ORDER BY c.id LIMIT n+1),
 numbered AS (SELECT s.id,row_number() OVER(ORDER BY s.id) i FROM page s)
 SELECT coalesce(jsonb_agg(erp_private.chat_conversation_json(cv,p,'participant') ORDER BY s.id) FILTER(WHERE nn.i<=n),'[]'),(array_agg(s.id ORDER BY s.id DESC) FILTER(WHERE nn.i<=n))[1],count(*)>n INTO manifest,next_id,more FROM page s JOIN numbered nn ON nn.id=s.id JOIN erp_private.chat_conversations cv ON cv.id=s.id;
 WITH requested AS (SELECT DISTINCT (j->>'conversationId')::uuid id,(j->>'changeSeq')::bigint seq FROM jsonb_array_elements(coalesce(a->'cursors','[]')) j)
 SELECT coalesce(jsonb_agg(DISTINCT r.id) FILTER(WHERE NOT erp_private.chat_member(r.id,p)),'[]') INTO revoked FROM requested r;
 WITH requested AS (SELECT (j->>'conversationId')::uuid id,min((j->>'changeSeq')::bigint) seq FROM jsonb_array_elements(coalesce(a->'cursors','[]')) j GROUP BY (j->>'conversationId')::uuid),
 page AS (SELECT x.* FROM erp_private.chat_changes x JOIN requested r ON x.conversation=r.id AND x.change_seq>r.seq WHERE erp_private.chat_member(x.conversation,p) AND (x.recipient IS NULL OR x.recipient=p) ORDER BY x.conversation,x.change_seq LIMIT n+1)
 SELECT coalesce(jsonb_agg(jsonb_build_object('conversationId',conversation,'changeSeq',change_seq::text,'kind',kind,'id',entity) ORDER BY conversation,change_seq),'[]') INTO changes FROM page;
 RETURN jsonb_build_object('conversations',manifest,'revokedConversationIds',revoked,'changes',CASE WHEN jsonb_array_length(changes)>n THEN changes-n ELSE changes END,'nextManifestCursor',CASE WHEN more THEN next_id END,'hasMore',more OR jsonb_array_length(changes)>n,'requiresFullSync',false);
END $$;
CREATE FUNCTION erp_private.chat_validate_args(op text,a jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE fields text; field text; key text; v jsonb; required boolean; allowed text[]:='{}';
BEGIN
 fields:=CASE op
 WHEN 'communications.profile' THEN ''
 WHEN 'chat.actor' THEN ''
 WHEN 'chat.capabilities' THEN ''
 WHEN 'chat.linkedIdentity' THEN 'employeeId'
 WHEN 'chat.avatarBinding' THEN 'profileId'
 WHEN 'chat.directory' THEN 'query? cursor? limit?'
 WHEN 'chat.resolveDmsReference' THEN 'token'
 WHEN 'chat.conversation' THEN 'conversationId mode'
 WHEN 'chat.conversations' THEN 'mode archived? query? cursor? limit?'
 WHEN 'chat.direct' THEN 'clientMutationId peerProfileId'
 WHEN 'chat.groupCreate' THEN 'clientMutationId name memberProfileIds'
 WHEN 'chat.groupChange' THEN 'clientMutationId conversationId expectedRevision action targetProfileId? name?'
 WHEN 'chat.namedGrant' THEN 'clientMutationId targetProfileId kind enabled expectedRevision?'
 WHEN 'chat.members' THEN 'conversationId mode cursor? limit?'
 WHEN 'chat.messages' THEN 'conversationId mode cursor? limit?'
 WHEN 'chat.send' THEN 'clientMutationId conversationId body? replyToMessageId? uploadIds? mentionProfileIds? dmsRef?'
 WHEN 'chat.edit' THEN 'clientMutationId messageId body mentionProfileIds? expectedRevision'
 WHEN 'chat.delete' THEN 'clientMutationId messageId expectedRevision'
 WHEN 'chat.forward' THEN 'clientMutationId sourceMessageId destinationConversationId expectedRevision'
 WHEN 'chat.reaction' THEN 'clientMutationId messageId emoji enabled'
 WHEN 'chat.pin' THEN 'clientMutationId messageId enabled'
 WHEN 'chat.star' THEN 'clientMutationId messageId enabled'
 WHEN 'chat.stars' THEN 'cursor? limit?'
 WHEN 'chat.personal' THEN 'clientMutationId conversationId muted? archived?'
 WHEN 'chat.read' THEN 'clientMutationId conversationId upToSeq'
 WHEN 'chat.readers' THEN 'messageId cursor? limit?'
 WHEN 'chat.search' THEN 'mode query senderProfileId? from? until? cursor? limit?'
 WHEN 'chat.media' THEN 'conversationId mode kind? cursor? limit?'
 WHEN 'chat.uploadBegin' THEN 'clientMutationId conversationId filename mime kind? byteLength'
 WHEN 'chat.uploadStatus' THEN 'uploadId'
 WHEN 'chat.sync' THEN 'manifestCursor? cursors? limit?'
 WHEN 'chat.pulse' THEN 'clientMutationId conversationId typing pulseAt?'
 WHEN 'chat.activity' THEN 'conversationId'
 ELSE NULL END;
 IF fields IS NULL THEN RAISE EXCEPTION 'Unknown chat operation' USING ERRCODE='22023'; END IF;
 FOREACH field IN ARRAY string_to_array(fields,' ') LOOP
  required:=right(field,1)<>'?'; key:=rtrim(field,'?'); allowed:=array_append(allowed,key);
  IF NOT a?key THEN
   IF required THEN RAISE EXCEPTION 'Missing required argument' USING ERRCODE='22023'; END IF; CONTINUE;
  END IF;
  v:=a->key;
  IF jsonb_typeof(v) IS DISTINCT FROM (CASE WHEN key IN('enabled','muted','archived','typing') THEN 'boolean' WHEN key IN('limit','byteLength') THEN 'number' WHEN key IN('memberProfileIds','uploadIds','mentionProfileIds','cursors') THEN 'array' WHEN key='dmsRef' THEN 'object' ELSE 'string' END) THEN RAISE EXCEPTION 'Invalid argument type' USING ERRCODE='22023'; END IF;
  IF key IN('memberProfileIds','mentionProfileIds','uploadIds') AND (jsonb_array_length(v)>4096 OR EXISTS(SELECT FROM jsonb_array_elements(v) e WHERE jsonb_typeof(e)<>'string')) THEN RAISE EXCEPTION 'Invalid selection' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF a-allowed<>'{}' OR (op='chat.personal' AND NOT(a?|ARRAY['muted','archived'])) OR ((a->>'from')::timestamptz>=(a->>'until')::timestamptz) THEN RAISE EXCEPTION 'Invalid chat arguments' USING ERRCODE='22023'; END IF;
 IF a?'dmsRef' AND ((a->'dmsRef')-ARRAY['shareId','token']<>'{}' OR NOT (a->'dmsRef')?&ARRAY['shareId','token']) THEN RAISE EXCEPTION 'Invalid document reference' USING ERRCODE='22023'; END IF;
 IF op='chat.groupChange' AND NOT(CASE a->>'action' WHEN 'rename' THEN a?'name' AND NOT a?'targetProfileId' WHEN 'leave' THEN NOT(a?|ARRAY['name','targetProfileId']) ELSE a?'targetProfileId' AND NOT a?'name' END) THEN RAISE EXCEPTION 'Invalid group change' USING ERRCODE='22023'; END IF;
END $$;
CREATE FUNCTION public.erp_chat_v1(p_request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p bigint:=erp_private.comms_actor_id(); a jsonb:=p_request->'args'; op text:=p_request->>'op';
BEGIN
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR p_request-ARRAY['op','args','_budgetPermitId']<>'{}' OR jsonb_typeof(a) IS DISTINCT FROM 'object' OR length(p_request::text)>160000 THEN RAISE EXCEPTION 'Invalid chat request' USING ERRCODE='22023'; END IF;
 IF op NOT IN('chat.actor','communications.profile') THEN
  PERFORM erp_private.chat_take_permit((p_request->>'_budgetPermitId')::uuid,CASE WHEN op IN('chat.pulse','chat.activity') THEN 'realtime' WHEN op IN('chat.uploadBegin','chat.uploadStatus') THEN 'media_upload' ELSE 'chat' END,p,p_request-'_budgetPermitId');
 END IF;
 PERFORM erp_private.chat_validate_args(op,a);
 IF op='chat.sync' THEN RETURN erp_private.chat_sync(a,p); END IF;
 IF op IN('communications.profile','chat.actor','chat.capabilities','chat.linkedIdentity','chat.avatarBinding','chat.directory','chat.resolveDmsReference','chat.conversation','chat.conversations','chat.members','chat.messages','chat.stars','chat.readers','chat.search','chat.media','chat.uploadStatus','chat.activity') THEN RETURN erp_private.chat_read(op,a,p); END IF;
 IF op IN('chat.direct','chat.groupCreate','chat.groupChange','chat.namedGrant','chat.send','chat.edit','chat.delete','chat.forward','chat.reaction','chat.pin','chat.star','chat.personal','chat.read','chat.uploadBegin','chat.pulse') THEN RETURN erp_private.chat_mutate(op,a,p); END IF;
 RAISE EXCEPTION 'Unknown chat operation' USING ERRCODE='22023';
END $$;

DO $privileges$
DECLARE rel regclass; fn regprocedure;
BEGIN
 FOR rel IN SELECT c.oid::regclass FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='erp_private' AND c.relkind='r' AND c.relname=ANY(ARRAY['comms_blocks','comms_policy_versions','comms_policy_acceptances','chat_named_grants','chat_conversations','chat_memberships','chat_scope_facts','chat_messages','chat_uploads','chat_attachments','chat_mentions','chat_reactions','chat_reads','chat_stars','chat_pins','chat_personal','chat_mutations','chat_changes','chat_presence','chat_cleanup_worker','comms_chat_gate']) LOOP
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',rel);
  EXECUTE format('REVOKE ALL ON %s FROM PUBLIC,anon,authenticated,service_role',rel);
 END LOOP;
 REVOKE ALL ON SEQUENCE erp_private.chat_memberships_id_seq FROM PUBLIC,anon,authenticated,service_role;
 FOR fn IN SELECT proc.oid::regprocedure FROM pg_proc proc JOIN pg_namespace ns ON ns.oid=proc.pronamespace WHERE ns.nspname='erp_private' AND proc.proname=ANY(ARRAY['comms_actor_id','comms_is_system_admin','comms_covers_scope','comms_has_named_grant','comms_require_terms','comms_lock_pair','comms_pair_blocked','chat_active','chat_member','chat_review','chat_visible','chat_scope_capture','chat_capture_membership','chat_capture_auth_change','chat_scope_fence','chat_change','chat_post','chat_write_allowed','chat_linked_photo','chat_work','chat_dms_ref','chat_attachment_json','chat_message_json','chat_conversation_json','chat_page','chat_read','chat_mentions_set','chat_group_change','chat_mutate','chat_search_rows','chat_mimes','chat_sync','chat_validate_args','chat_take_permit']) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',fn);
 END LOOP;
END $privileges$;
REVOKE ALL ON FUNCTION public.erp_chat_v1(jsonb),public.erp_chat_upload_bind(uuid,uuid),public.erp_chat_upload_verified(uuid,bigint,uuid,bigint,text,text,uuid),public.erp_chat_attachment_bind(uuid,text,uuid),public.erp_chat_export_page(uuid,text,timestamptz,timestamptz,bigint,int,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_chat_v1(jsonb),public.erp_chat_upload_bind(uuid,uuid),public.erp_chat_attachment_bind(uuid,text,uuid),public.erp_chat_export_page(uuid,text,timestamptz,timestamptz,bigint,int,bigint,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_chat_upload_verified(uuid,bigint,uuid,bigint,text,text,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
