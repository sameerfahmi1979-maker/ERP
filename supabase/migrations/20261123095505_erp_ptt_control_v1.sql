-- Android PTT control. No provider, platform credentials, approvals or workers activated.
begin;
create table erp_private.ptt_channels (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('group','direct')),
 name text not null, description text not null default '', discoverable boolean not null default false, required boolean not null default false,
 request_generation bigint not null default 0, creator bigint not null, owner_id bigint, direct_low bigint, direct_high bigint,
 archived boolean not null default false, revision bigint not null default 1,
 unique(direct_low,direct_high),check(kind='group' or direct_low<direct_high)
);
create table erp_private.ptt_memberships (
 id bigint generated always as identity primary key, channel_id uuid not null references erp_private.ptt_channels,
 profile_id bigint not null, joined_at timestamptz not null default clock_timestamp(), left_at timestamptz,
 scope_anchor jsonb, scope_closed_anchor jsonb, required boolean, appointed boolean not null default false
);
create unique index ptt_current_member on erp_private.ptt_memberships(channel_id,profile_id) where left_at is null;
create table erp_private.ptt_requests(channel_id uuid references erp_private.ptt_channels,profile_id bigint,invited boolean not null, request_generation bigint not null default 0, primary key(channel_id,profile_id));
create view erp_private.ptt_current_requests as select r.* from erp_private.ptt_requests r join erp_private.ptt_channels c
 on c.id=r.channel_id and c.request_generation=r.request_generation;
revoke all on erp_private.ptt_current_requests from public,anon,authenticated,service_role;
create table erp_private.ptt_phones (
 profile_id bigint primary key, connection_generation bigint not null default 0, wanted_after uuid, device_id uuid not null, auth_session uuid not null, epoch uuid not null unique,
 availability text not null check(availability in ('available','busy','offDuty')), stopped boolean not null, paused boolean not null,
 seen_at timestamptz not null default clock_timestamp()
);
create table erp_private.ptt_feature_gate(feature text primary key check(feature in('realtime','ptt_live')),enabled boolean not null default false);
insert into erp_private.ptt_feature_gate(feature) values('realtime'),('ptt_live');
create function erp_private.ptt_require_gate(p_feature text) returns void language plpgsql set search_path='' as $$
begin
 if not exists(select from erp_private.ptt_feature_gate where feature=p_feature and enabled for share) then raise sqlstate 'PT503' using message='PTT unavailable';end if;
end $$;
create table erp_private.ptt_optional_connections(channel_id uuid references erp_private.ptt_channels,profile_id bigint,primary key(channel_id,profile_id));
create table erp_private.ptt_disconnected(channel_id uuid references erp_private.ptt_channels,profile_id bigint,primary key(channel_id,profile_id));
create table erp_private.ptt_admissions (
 channel_id uuid references erp_private.ptt_channels, profile_id bigint not null, epoch uuid not null,
 connection_generation bigint not null default 0, checked_at timestamptz, requested_at timestamptz not null default clock_timestamp(), live boolean not null default false, primary key(channel_id,profile_id)
);
create index ptt_waiter_order on erp_private.ptt_admissions(channel_id,requested_at,profile_id) where not live;
create index ptt_waiting_actor_round_robin on erp_private.ptt_admissions(profile_id,checked_at nulls first,requested_at,channel_id) where not live;
create index ptt_actor_admissions on erp_private.ptt_admissions(profile_id,epoch,channel_id);
create view erp_private.ptt_current_admissions as
 select a.* from erp_private.ptt_admissions a join erp_private.ptt_phones f using(profile_id,epoch,connection_generation)
 where not f.stopped and not f.paused and f.availability='available';
revoke all on erp_private.ptt_current_admissions from public,anon,authenticated,service_role;
create table erp_private.ptt_leases (
 id uuid primary key default gen_random_uuid(), channel_id uuid not null references erp_private.ptt_channels,profile_id bigint not null,
 epoch uuid not null, press_id uuid not null, started_at timestamptz not null, expires_at timestamptz not null,
 ended_at timestamptz, end_reason text check(end_reason in('released','expired','revoked')),
 check(expires_at<=started_at+interval '60 seconds'), unique(profile_id,press_id)
);
create unique index ptt_one_speaker on erp_private.ptt_leases(channel_id) where ended_at is null;
create unique index ptt_one_target on erp_private.ptt_leases(profile_id) where ended_at is null;
create table erp_private.ptt_press_denials(profile_id bigint,press_id uuid,channel_id uuid not null,epoch uuid not null,primary key(profile_id,press_id));
create table erp_private.ptt_endpoints(
 id uuid primary key default gen_random_uuid(), channel_id uuid not null, profile_id bigint not null, epoch uuid not null,
 lease_id uuid references erp_private.ptt_leases, worker_id uuid, app_id text not null check(app_id~'^[A-Za-z0-9_-]{1,128}$'), session_id text, mid text,
 phase text not null check(phase in ('opening','idle','publishing','subscribing','published','answering','offer','subscribed','closing','held','closed')),
 cleanup_permit uuid, deadline timestamptz not null, mutation uuid not null, dirty boolean not null default false,
 close_after timestamptz not null default clock_timestamp(), created_at timestamptz not null default clock_timestamp()
);
create index ptt_endpoint_active on erp_private.ptt_endpoints(channel_id,profile_id) where phase<>'closed';
create function erp_private.ptt_lock() returns void language sql set search_path='' as $$
 select pg_advisory_xact_lock(163487665,12)
$$;
create function erp_private.ptt_require_phone(p_epoch uuid) returns bigint language plpgsql set search_path='' as $$
declare actor bigint:=erp_private.comms_actor_id();
begin
 if not exists(select from erp_private.ptt_phones where profile_id=actor and epoch=p_epoch and not stopped and auth_session=(auth.jwt()->>'session_id')::uuid) then raise exception 'Current phone required' using errcode='42501'; end if;
 return actor;
end $$;
create index ptt_actor_current_episodes on erp_private.ptt_memberships(profile_id,((scope_anchor->>'activationGeneration')::bigint),channel_id) where left_at is null;
create view erp_private.ptt_current_memberships as
 select m.* from erp_private.ptt_memberships m where m.left_at is null
 and (m.scope_anchor->>'activationGeneration')::bigint=erp_private.comms_activation_generation(m.profile_id);
revoke all on erp_private.ptt_current_memberships from public,anon,authenticated,service_role;
create function erp_private.ptt_close_scope() returns trigger language plpgsql set search_path='' as $$
begin
 if old.left_at is null and new.left_at is not null then new.scope_closed_anchor:=erp_private.comms_scope_anchor(old.profile_id);end if;
 return new;
end $$;
create trigger ptt_seal_scope before update of left_at on erp_private.ptt_memberships for each row execute function erp_private.ptt_close_scope();
create function erp_private.ptt_history_allowed(p_channel uuid,p_at timestamptz,p_mode text) returns boolean language sql stable set search_path='' as $$
 select case p_mode when 'participant' then exists(select from erp_private.ptt_current_memberships m where m.channel_id=p_channel and m.profile_id=erp_private.comms_actor_id() and m.left_at is null and m.joined_at<=p_at)
 when 'review' then exists(select from erp_private.ptt_channels where id=p_channel) and (erp_private.comms_is_system_admin() or (erp_private.comms_has_named_grant('historyReview') and not exists(
 select from erp_private.ptt_memberships m where m.channel_id=p_channel and erp_private.comms_episode_covers(m.profile_id,m.scope_anchor,
   erp_private.comms_episode_end(m.profile_id,m.scope_anchor,m.scope_closed_anchor,true)) is not true))) else false end
$$;
-- Capture only the joined episodes. The core ERP identity observer advances shared fixed-cost markers.
create function erp_private.ptt_capture_episodes(p_permit uuid,p_command jsonb,p_episodes bigint[]) returns void language plpgsql set search_path='' as $$
declare bound bigint; fact_count bigint; m erp_private.ptt_memberships;
begin
 if coalesce(cardinality(p_episodes),0)=0 then return;end if;
 bound:=erp_comm_cost.effect_scan_limit(p_permit,p_command,'ptt_scope_facts');
 select count(*) into fact_count from (
  select e.id from unnest(p_episodes) e(id)
  union all select x.id from unnest(p_episodes) e(id) join erp_private.ptt_memberships x on x.id=e.id join public.user_roles a on a.user_profile_id=x.profile_id
  limit bound+1) snapshot_rows;
 perform erp_comm_cost.claim_effect(p_permit,p_command,'ptt_scope_facts',fact_count);
 for m in select * from erp_private.ptt_memberships where id=any(p_episodes) loop
  perform erp_private.comms_track_profile(m.profile_id);
  update erp_private.ptt_memberships set scope_anchor=erp_private.comms_seed_episode(m.profile_id,gen_random_uuid()) where id=m.id;
 end loop;
end $$;
create function erp_private.ptt_eligible(c uuid,p bigint,e uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select from erp_private.ptt_channels t join erp_private.ptt_current_memberships m on m.channel_id=t.id and m.profile_id=p and m.left_at is null
 join erp_private.ptt_phones f on f.profile_id=p and f.epoch=e and not f.stopped and not f.paused and f.availability='available'
 where t.id=c and f.seen_at>clock_timestamp()-interval '90 seconds' and erp_private.chat_active(p) and erp_private.provider_actor_session_valid(p,f.auth_session)
 and (t.kind='group' or (erp_private.chat_active(t.direct_low) and erp_private.chat_active(t.direct_high) and not erp_private.comms_pair_blocked(t.direct_low,t.direct_high))))
$$;
-- Replaced by the recording migration with the checked, lease-bound retention preflight.
-- A partial deployment with only the control migration can never publish live audio.
create function erp_private.ptt_recording_ready(p_lease uuid,p_profile bigint,p_epoch uuid) returns boolean language sql stable set search_path='' as $$select false$$;
create function erp_private.ptt_sweep(p_worker uuid default null,p_channel uuid default null,p_actor bigint default null) returns void language plpgsql set search_path='' as $$
begin
 -- Every caller holds ptt_lock for this transaction. A lost microphone press is never queued.
 update erp_private.ptt_leases l set ended_at=least(clock_timestamp(),expires_at),end_reason=case when expires_at<=clock_timestamp() then 'expired' else 'revoked' end
 where ended_at is null and (l.channel_id=p_channel or l.profile_id=p_actor or exists(select from erp_private.ptt_endpoints e where e.worker_id=p_worker and e.phase<>'closed' and e.lease_id=l.id)) and (expires_at<=clock_timestamp() or not erp_private.ptt_eligible(channel_id,profile_id,epoch) or not exists(select from erp_private.ptt_current_admissions a where a.channel_id=l.channel_id and a.epoch=l.epoch and a.live));
 delete from erp_private.ptt_admissions a where a.channel_id=p_channel and a.profile_id=p_actor and (not erp_private.ptt_eligible(channel_id,profile_id,epoch) or exists(select from erp_private.ptt_channels c where c.id=a.channel_id and c.archived and not exists(select from erp_private.ptt_leases l where l.channel_id=c.id and l.ended_at is null)));
 update erp_private.ptt_endpoints e set dirty=true where (e.worker_id=p_worker or e.channel_id=p_channel or e.profile_id=p_actor) and not dirty and phase<>'closed' and
 (deadline<=clock_timestamp() or (phase in('publishing','published') and not erp_private.ptt_recording_ready(lease_id,profile_id,epoch)) or not erp_private.ptt_eligible(channel_id,profile_id,epoch) or not exists(select from erp_private.ptt_current_admissions a where a.channel_id=e.channel_id and a.epoch=e.epoch and a.live)
 or (lease_id is not null and not exists(select from erp_private.ptt_leases l where l.id=e.lease_id and l.ended_at is null)));
 -- Empty sessions have no negotiated SDP or forwarding tracks. New signaling always rechecks authority.
 update erp_private.ptt_endpoints set phase='closed' where (worker_id=p_worker or channel_id=p_channel or profile_id=p_actor) and dirty and phase in('idle','opening');
end $$;
-- The waiter must hold a current live admission permit in the same business transaction.
-- Cleanup, bootstrap, realtime-only monitoring and another caller's request never issue a new admission.
create function erp_private.ptt_promote(p_actor bigint,p_target uuid default null) returns void language plpgsql set search_path='' as $$
declare waiter erp_private.ptt_admissions; free_seats integer;
begin
 select * into waiter from erp_private.ptt_current_admissions a where a.profile_id=p_actor and not a.live
  and (p_target is null or a.channel_id=p_target) and erp_private.ptt_eligible(a.channel_id,p_actor,a.epoch)
  order by a.checked_at nulls first,a.requested_at,a.channel_id limit 1;
 if waiter.channel_id is null then return;end if;
 update erp_private.ptt_admissions set checked_at=clock_timestamp() where channel_id=waiter.channel_id and profile_id=p_actor;
 if exists(select from erp_private.ptt_channels where id=waiter.channel_id and archived) or
   exists(select from erp_private.ptt_endpoints where dirty and phase<>'closed' and (channel_id=waiter.channel_id or profile_id=p_actor)) then return;end if;
 -- At most 100 formerly live rows can expire on this particular channel.
 delete from erp_private.ptt_admissions a where a.channel_id=waiter.channel_id and a.live and
  (not erp_private.ptt_eligible(a.channel_id,a.profile_id,a.epoch) or not exists(select from erp_private.ptt_current_admissions v where v.channel_id=a.channel_id and v.profile_id=a.profile_id));
 select 100-count(*) into free_seats from erp_private.ptt_current_admissions a where a.channel_id=waiter.channel_id and a.live;
 if free_seats<=0 or free_seats<=(select count(*) from (select 1 from erp_private.ptt_current_admissions a where a.channel_id=waiter.channel_id and not a.live
  and (a.requested_at,a.profile_id)<(waiter.requested_at,p_actor) and erp_private.ptt_eligible(a.channel_id,a.profile_id,a.epoch) limit free_seats) earlier) then return;end if;
 update erp_private.ptt_admissions set live=true where channel_id=waiter.channel_id and profile_id=p_actor;
end $$;
create function erp_private.ptt_card(c erp_private.ptt_channels,p bigint) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'name',case when c.kind='direct' then (select coalesce(nullif(display_name,''),full_name,'ERP user') from public.user_profiles where id=case when p=c.direct_low then c.direct_high else c.direct_low end) else c.name end,'description',c.description,'kind',c.kind,
 'membership',case when m.id is null then null when coalesce(m.required,c.required) then 'required' else 'optional' end,
 'role',case when m.id is null then null when c.owner_id=p then 'owner' when m.appointed then 'admin' else 'member' end,
 'canManage',c.kind='group' and (erp_private.comms_is_system_admin() or (m.id is not null and (m.appointed or c.owner_id is not distinct from p))),
 'canAppoint',c.kind='group' and (erp_private.comms_is_system_admin() or (m.id is not null and c.creator=p)),
 'canReplaceOwner',c.kind='group' and (c.owner_id is null or not exists(select from erp_private.ptt_current_memberships m0 where m0.channel_id=c.id and m0.profile_id=c.owner_id)) and (erp_private.comms_is_system_admin() or coalesce(m.appointed,false)),
 'joinedAt',m.joined_at,'archived',c.archived,'revision',c.revision::text)
 from (values(1)) t(n) left join erp_private.ptt_current_memberships m on m.channel_id=c.id and m.profile_id=p and m.left_at is null
$$;
create table erp_private.ptt_reopen_reviews(channel_id uuid,profile_id bigint,revision bigint not null,token uuid not null,roster_hash bytea not null, primary key(channel_id,profile_id));
create function erp_private.ptt_rules(p text,a jsonb) returns void language plpgsql set search_path='' as $$
declare required text[]; optional text[]:='{}'; k text; v jsonb;
begin
 case p
 when 'channels' then required:='{}';optional:='{cursor,limit,mode}';
 when 'state','capabilities' then required:='{}';
 when 'direct' then required:='{peerProfileId}';
 when 'channelCreate' then required:='{name,description,discoverable,clientMutationId}';optional:='{required}';
 when 'creatorStatus' then required:='{profileId}';
 when 'scopeReconcile' then required:='{episodeId}';
 when 'creatorGrant' then required:='{profileId,enabled,expectedRevision}';
 when 'start' then required:='{deviceId,confirmTakeover}'; optional:='{expectedEpoch}';
 when 'availability' then required:='{epoch,availability}';
 when 'stop' then required:='{epoch}';
 when 'monitor','monitorLive' then required:='{epoch}';optional:='{selectedChannelId}';
 when 'pause' then required:='{epoch,paused}';
 when 'press' then required:='{epoch,channelId,pressId}';
 when 'release' then required:='{epoch,channelId,leaseId}';
 when 'signal' then required:='{epoch,channelId,action}';optional:='{endpointId,leaseId,mid,sessionDescription,signalId}';
 when 'join','disconnect','leave','status' then required:='{epoch,channelId}';
 when 'members','request','reopenReview' then required:='{channelId}';
 when 'manage' then required:='{channelId,action,expectedRevision}';optional:='{profileId,required,reviewToken,discoverable,name,description}';
 else raise exception 'Invalid operation' using errcode='22023';
 end case;
 if p='manage' then
  optional:='{}';
  case a->>'action'
  when 'invite','add','approve','reject','remove','promote','demote','replaceOwner' then required:=array_append(required,'profileId');
  when 'setRequired' then required:=array_append(required,'required');
  when 'archive' then null;
  when 'reopen' then required:=array_append(required,'reviewToken');
  when 'settings' then optional:='{name,description,discoverable}';
  else raise exception 'Invalid management action' using errcode='22023';
  end case;
 elsif p='signal' then
  optional:='{signalId}';
  case a->>'action'
  when 'open' then null;
  when 'publish' then required:=required||array['endpointId','leaseId','mid','sessionDescription'];
  when 'subscribe' then required:=required||array['endpointId','leaseId'];
  when 'answer' then required:=required||array['endpointId','leaseId','sessionDescription'];
  else raise exception 'Invalid signal action' using errcode='22023';
  end case;
 end if;
 if not a ?& required or (a-required-optional)<>'{}'::jsonb then raise exception 'Invalid fields' using errcode='22023';end if;
 for k,v in select * from jsonb_each(a) loop
 case
 when k in('deviceId','epoch','selectedChannelId','expectedEpoch','channelId','leaseId','pressId','clientMutationId','endpointId','reviewToken','cursor','signalId') then
  if jsonb_typeof(v)<>'string' or (a->>k)!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'Invalid id' using errcode='22023';end if;
 when k='expectedRevision' and p='creatorGrant' and v=to_jsonb('0'::text) then null;
 when k in('profileId','peerProfileId','episodeId','expectedRevision') then
  if jsonb_typeof(v)<>'string' or (a->>k)!~'^[1-9][0-9]{0,18}$' or (a->>k)::numeric>9223372036854775807 then raise exception 'Invalid number' using errcode='22023';end if;
 when k in('enabled','paused','required','discoverable','confirmTakeover') then
  if jsonb_typeof(v)<>'boolean' then raise exception 'Invalid boolean' using errcode='22023';end if;
 when k='limit' then if jsonb_typeof(v)<>'number' or (a->>k)!~'^([1-9][0-9]?|100)$' then raise exception 'Invalid page' using errcode='22023';end if;
 when k='sessionDescription' then if jsonb_typeof(v)<>'object' or v-array['type','sdp']<>'{}'::jsonb or not v ?& array['type','sdp'] or v->>'type' not in('offer','answer') or jsonb_typeof(v->'sdp')<>'string' or length(v->>'sdp') not between 4 and 65536 then raise exception 'Invalid SDP' using errcode='22023';end if;
 else if jsonb_typeof(v)<>'string' or length(a->>k)>(case when k='description' then 512 else 128 end) then raise exception 'Invalid string' using errcode='22023';end if;
 end case;
 end loop;
end $$;
create function erp_private.ptt_wanted(p bigint,e uuid) returns void language plpgsql set search_path='' as $$
declare picked uuid; last_seen uuid;
begin
 select wanted_after into last_seen from erp_private.ptt_phones where profile_id=p and epoch=e;
 if last_seen is not null then select channel_id into picked from erp_private.ptt_current_memberships where profile_id=p and channel_id>last_seen order by channel_id limit 1;end if;
 if picked is null then select channel_id into picked from erp_private.ptt_current_memberships where profile_id=p order by channel_id limit 1;end if;
 if picked is null then return;end if;
 update erp_private.ptt_phones set wanted_after=picked where profile_id=p and epoch=e;
 insert into erp_private.ptt_admissions as prev(channel_id,profile_id,epoch,connection_generation)
 select c.id,p,e,f.connection_generation from erp_private.ptt_current_memberships m join erp_private.ptt_channels c on c.id=m.channel_id
 join erp_private.ptt_phones f on f.profile_id=p and f.epoch=e
 where m.profile_id=p and c.id=picked and (coalesce(m.required,c.required)
 or exists(select from erp_private.ptt_optional_connections w where w.channel_id=c.id and w.profile_id=p)
 or (c.kind='direct' and not exists(select from erp_private.ptt_disconnected d where d.channel_id=c.id and d.profile_id=p)))
 and not c.archived and erp_private.ptt_eligible(c.id,p,e)
 on conflict(channel_id,profile_id) do update set epoch=excluded.epoch,connection_generation=excluded.connection_generation,live=false,checked_at=null,requested_at=clock_timestamp()
 where (prev.epoch,prev.connection_generation) is distinct from (excluded.epoch,excluded.connection_generation);
end $$;
-- Each funded SQL cycle authorizes a single SFU claim plus one optional recording claim.
create index ptt_worker_open_endpoints on erp_private.ptt_endpoints(worker_id,lease_id) where phase<>'closed';
create table erp_private.ptt_worker_cycles (
 worker uuid primary key, boot uuid not null, poll uuid not null unique, until_at timestamptz not null,
 recording_claimed boolean not null default false, recording_blocked boolean not null default false, completed boolean not null default false,
 healthy_until timestamptz
);
create function erp_private.ptt_take_recording_poll(p_poll uuid) returns uuid language plpgsql set search_path='' as $$
declare claimed uuid;
begin
 update erp_private.ptt_worker_cycles set recording_claimed=true where poll=p_poll and until_at>clock_timestamp()
 and not recording_claimed and not completed returning worker into claimed;
 if claimed is null then raise sqlstate 'PT503' using message='Recording poll unavailable'; end if;
 return claimed;
end $$;
create function erp_private.ptt_ready_worker(p_until timestamptz,p_worker uuid default null) returns uuid language sql stable set search_path='' as $$
 select c.worker from erp_private.ptt_worker_cycles c where c.completed and c.healthy_until>clock_timestamp()
 and (p_worker is null or c.worker=p_worker) and erp_comm_cost.ptt_worker_covers(c.worker,greatest(p_until,(
  select max(h.until_at) from erp_comm_cost.ptt_drain_hold h join erp_comm_cost.cleanup_resource r on r.permit_id=h.permit_id
  where h.worker=c.worker and r.closed_at is null)))
 order by c.healthy_until desc,c.worker limit 1
$$;
-- The complete recording module installs the atomic source and episode writer.
create function erp_private.ptt_record_open(p_lease uuid,p_episodes bigint[]) returns void language plpgsql set search_path='' as $$
begin raise sqlstate 'PT503' using message='Recording source unavailable'; end $$;
create function erp_private.ptt_control(p_request jsonb,p_permit uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p bigint:=erp_private.comms_actor_id(); op text; a jsonb:=p_request->'args'; c erp_private.ptt_channels; m erp_private.ptt_memberships;
 f erp_private.ptt_phones; l erp_private.ptt_leases; cid uuid; e uuid; peer bigint; mgr boolean; ga boolean; act text;
 feature text; tm timestamptz; floor_id uuid; row_cap bigint; affected bigint; episode_limit bigint; episodes bigint[]; page jsonb; lim int; tok uuid; started boolean; req boolean; target erp_private.ptt_memberships;
begin
 if jsonb_typeof(p_request) is distinct from 'object' or not p_request ?& array['args','op'] or p_request-array['op','args']<>'{}'::jsonb or jsonb_typeof(a) is distinct from 'object' or p_request->>'op' not like 'ptt.%' then raise exception 'Invalid request' using errcode='22023';end if;
 op:=substring(p_request->>'op' from 5);perform erp_private.ptt_rules(op,a);
 cid:=(a->>'channelId')::uuid;e:=(a->>'epoch')::uuid;act:=a->>'action';
 if op='capabilities' then
  return jsonb_build_object('profileId',p::text,'canCreatePttChannel',erp_private.comms_is_system_admin() or erp_private.comms_has_named_grant('pttChannelCreate'));
 elsif op='state' then
  select * into f from erp_private.ptt_phones where profile_id=p and auth_session=(auth.jwt()->>'session_id')::uuid;
  return jsonb_build_object('epoch',f.epoch,'availability',coalesce(f.availability,'available'),'stopped',coalesce(f.stopped,true),'paused',coalesce(f.paused,false));
 elsif op='signal' then
  raise sqlstate '42501' using message='Trusted signal bridge required';
 end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('comms-scope-v1',0));
 perform erp_private.ptt_lock();
 -- Validate the phone before resolving any requested channel, including cleanup paths.
 if e is not null then perform erp_private.ptt_require_phone(e);end if;
 if op in('stop','release','disconnect') or (op='pause' and (a->>'paused')::boolean) then
  if op='release' then
   select * into l from erp_private.ptt_leases where id=(a->>'leaseId')::uuid and profile_id=p and epoch=e and channel_id=cid;
   if not found then return jsonb_build_object('released',false,'endReason',null);end if;
   started:=l.ended_at is null and l.expires_at>clock_timestamp() and erp_private.ptt_eligible(cid,p,e) and exists(select from erp_private.ptt_current_admissions where channel_id=cid and profile_id=p and epoch=e and live);
   if l.ended_at is null then
    update erp_private.ptt_leases set ended_at=least(clock_timestamp(),expires_at),end_reason=case when expires_at<=clock_timestamp() then 'expired' when started then 'released' else 'revoked' end where id=l.id returning * into l;
   end if;
   update erp_private.ptt_endpoints set dirty=true where lease_id=l.id and not dirty and phase<>'closed';
   return jsonb_build_object('released',started and l.end_reason='released','endReason',l.end_reason);
  elsif op='disconnect' then
   select * into m from erp_private.ptt_current_memberships where channel_id=cid and profile_id=p and left_at is null;
   if not found then raise sqlstate 'PT404' using message='Unavailable';end if;
   if coalesce(m.required,(select required from erp_private.ptt_channels where id=cid)) then raise sqlstate '42501' using message='Required membership';end if;
   delete from erp_private.ptt_optional_connections where channel_id=cid and profile_id=p;
   insert into erp_private.ptt_disconnected select cid,p from erp_private.ptt_channels where id=cid and kind='direct' and exists(select from erp_private.ptt_current_admissions where channel_id=cid and profile_id=p and epoch=e) on conflict do nothing;
  else
   if op='pause' and exists(select from erp_private.ptt_phones where profile_id=p and epoch=e and paused) then
    select * into f from erp_private.ptt_phones where profile_id=p;
    return jsonb_build_object('epoch',e,'availability',f.availability,'stopped',f.stopped,'paused',true);
   end if;
   update erp_private.ptt_phones set connection_generation=connection_generation+1,stopped=op='stop',paused=case when op='pause' then true else paused end where profile_id=p and epoch=e returning * into f;
  end if;
  if cid is not null then delete from erp_private.ptt_admissions where epoch=e and profile_id=p and channel_id=cid;end if;
  with retired as (
   update erp_private.ptt_leases set ended_at=least(clock_timestamp(),expires_at),end_reason=case when expires_at<=clock_timestamp() then 'expired' else 'revoked' end
   where profile_id=p and epoch=e and ended_at is null and (cid is null or channel_id=cid) returning id
  ) update erp_private.ptt_endpoints x set dirty=true where not dirty and phase<>'closed' and
  ((x.profile_id=p and x.epoch=e and (cid is null or x.channel_id=cid)) or x.lease_id in(select id from retired));
  if op='disconnect' then return jsonb_build_object('channelId',cid,'admission','none','floor',null);end if;
  return jsonb_build_object('epoch',e,'availability',f.availability,'stopped',f.stopped,'paused',f.paused);
 end if;
 feature:=case when op in('join','press','status','monitorLive') then 'ptt_live' else 'realtime' end;
 perform erp_private.ptt_require_gate(feature);
 perform erp_comm_cost.take_permit(p_permit,feature,'communications',p::text,p_request);
 if op in('join','press','monitorLive') and erp_private.ptt_ready_worker(clock_timestamp()+interval '61 seconds') is null then
  raise sqlstate 'PT503' using message='PTT worker unavailable';
 end if;
 if op in('direct','channelCreate','manage','request','creatorGrant','leave','press','start','join','monitorLive','reopenReview','scopeReconcile') and
    not exists(select from erp_comm_cost.reservation where permit_id=p_permit and liability_ends_at is null) then
  raise sqlstate 'PT503' using message='Continuing storage coverage required';
 end if;
 ga:=erp_private.comms_is_system_admin();
 if op='scopeReconcile' then
  if not ga then raise sqlstate '42501';end if;
  select * into strict m from erp_private.ptt_memberships where id=(a->>'episodeId')::bigint;
  perform erp_private.comms_reconcile_episode(m.profile_id,m.scope_anchor,erp_private.comms_episode_end(m.profile_id,m.scope_anchor,m.scope_closed_anchor,true),p_permit,p_request);
  return jsonb_build_object('ok',true);
 end if;
 if cid is not null then
  select * into c from erp_private.ptt_channels visible_channel where visible_channel.id=cid and (
   exists(select from erp_private.ptt_current_memberships current_member where current_member.channel_id=visible_channel.id and current_member.profile_id=p and current_member.left_at is null)
   or (ga and op in('manage','members','reopenReview') and visible_channel.kind='group')
   or (op='request' and visible_channel.kind='group' and not visible_channel.archived and (visible_channel.discoverable or exists(select from erp_private.ptt_current_requests invited where invited.channel_id=visible_channel.id and invited.profile_id=p and invited.invited)))
  );
  if not found then raise exception 'Unavailable' using errcode='PT404';end if;
  if c.kind='direct' then perform erp_private.comms_lock_pair(c.direct_low,c.direct_high);end if;
  select * into m from erp_private.ptt_current_memberships where channel_id=cid and profile_id=p and left_at is null;
  if c.owner_id is not null and not exists(select from erp_private.ptt_current_memberships where channel_id=cid and profile_id=c.owner_id) then c.owner_id:=null;end if;
 end if;
 mgr:=ga or (m.id is not null and (m.appointed or c.owner_id is not distinct from p));
 select * into f from erp_private.ptt_phones where profile_id=p;
 if e is not null and feature='ptt_live' then update erp_private.ptt_phones set seen_at=clock_timestamp() where profile_id=p;end if;
 perform erp_private.ptt_sweep(null,cid,p);
 if op='channels' then
  lim:=coalesce((a->>'limit')::int,40);
  if coalesce(a->>'mode','participant') not in('participant','review') then raise exception 'Invalid mode' using errcode='22023';end if;
  with visible as (select t.*,exists(select from erp_private.ptt_current_memberships x where x.channel_id=t.id and x.profile_id=p and x.left_at is null) member from erp_private.ptt_channels t where (not a?'cursor' or t.id>(a->>'cursor')::uuid)),
  eligible as (select z.id,case when z.member or a->>'mode'='review' then erp_private.ptt_card(t,p) else jsonb_build_object('id',t.id,'name',t.name,'description',t.description) end card from visible z join erp_private.ptt_channels t using(id) where
  case when a->>'mode'='review' then erp_private.ptt_history_allowed(t.id,now(),'review') else z.member or (not z.archived and (z.discoverable or exists(select from erp_private.ptt_current_requests r where r.channel_id=z.id and r.profile_id=p and r.invited))) end order by z.id limit lim+1),
  numbered as(select *,row_number() over(order by id) n from eligible)
  select jsonb_build_object('items',coalesce(jsonb_agg(card order by id) filter(where n<=lim),'[]'::jsonb),'nextCursor',case when count(*)>lim then max(id::text) filter(where n=lim) end) into page from numbered; return page;
 elsif op in('monitor','monitorLive') then
  if op='monitorLive' then
   row_cap:=erp_comm_cost.effect_scan_limit(p_permit,p_request,'ptt_monitor_rows');
   perform erp_private.ptt_wanted(p,e);
   select count(*) into affected from (select 1 from erp_private.ptt_current_admissions where profile_id=p and epoch=e limit row_cap+1) admitted;
   perform erp_comm_cost.claim_effect(p_permit,p_request,'ptt_monitor_rows',affected);
   perform erp_private.ptt_promote(p);
  end if;
  select jsonb_build_object('epoch',f.epoch,'stopped',f.stopped,'paused',f.paused,'availability',f.availability,'items',coalesce(jsonb_agg(
  jsonb_build_object('channelId',t.id,'archived',t.archived,'name',erp_private.ptt_card(t,p)->>'name','admission',case when x.live then 'live' else 'waiting' end,
  'joinedAt',member.joined_at,'floor',case when x.live and z.id is not null then jsonb_build_object('leaseId',z.id,'startedAt',z.started_at,'expiresAt',z.expires_at,'speakerProfileId',z.profile_id::text,'mediaReady',exists(select from erp_private.ptt_endpoints xpub where xpub.lease_id=z.id and xpub.phase='published' and not xpub.dirty and xpub.deadline>clock_timestamp())) end) order by t.id),'[]'::jsonb))
  into page from erp_private.ptt_current_admissions x join erp_private.ptt_channels t on t.id=x.channel_id join erp_private.ptt_current_memberships member on member.channel_id=t.id and member.profile_id=x.profile_id and member.left_at is null left join erp_private.ptt_leases z on z.channel_id=t.id and z.ended_at is null and z.expires_at>clock_timestamp() and erp_private.ptt_eligible(t.id,z.profile_id,z.epoch) where op='monitorLive' and x.profile_id=p and x.epoch=e;
  return page||jsonb_build_object('selected',(select jsonb_build_object('channelId',t.id,'name',erp_private.ptt_card(t,p)->>'name','joinedAt',x.joined_at,'archived',t.archived,'kind',t.kind)
   from erp_private.ptt_channels t join erp_private.ptt_current_memberships x on x.channel_id=t.id and x.profile_id=p and x.left_at is null
   where t.id=(a->>'selectedChannelId')::uuid and (t.kind='group' or (erp_private.chat_active(t.direct_low) and erp_private.chat_active(t.direct_high) and not erp_private.comms_pair_blocked(t.direct_low,t.direct_high)))));
 elsif op='direct' then
  perform erp_private.comms_require_terms();peer:=(a->>'peerProfileId')::bigint;perform erp_private.comms_lock_pair(p,peer);
  if peer=p or not erp_private.chat_active(peer) or erp_private.comms_pair_blocked(p,peer) then raise exception 'Unavailable' using errcode='PT404';end if;
  select * into c from erp_private.ptt_channels where direct_low=least(p,peer) and direct_high=greatest(p,peer);
  if not found then insert into erp_private.ptt_channels(kind,name,creator,direct_low,direct_high) values('direct','',p,least(p,peer),greatest(p,peer)) returning * into c;end if;
  update erp_private.ptt_memberships old_episode set left_at=clock_timestamp() where channel_id=c.id and profile_id in(p,peer) and left_at is null
   and not exists(select from erp_private.ptt_current_memberships live_episode where live_episode.id=old_episode.id);
  with added as (insert into erp_private.ptt_memberships(channel_id,profile_id) select c.id,person from unnest(array[p,peer]) person
   where not exists(select from erp_private.ptt_current_memberships where channel_id=c.id and profile_id=person) returning id)
  select array_agg(id) into episodes from added;
  perform erp_private.ptt_capture_episodes(p_permit,p_request,episodes);
  return erp_private.ptt_card(c,p);
 elsif op in('creatorGrant','creatorStatus') then
  if not ga then raise exception 'Permission denied' using errcode='42501';end if;
  peer:=(a->>'profileId')::bigint;if not erp_private.chat_active(peer) then raise exception 'Unavailable' using errcode='PT404';end if;
  if op='creatorStatus' then return jsonb_build_object('profileId',peer::text,'enabled',coalesce((select enabled from erp_private.chat_named_grants where profile_id=peer and kind='pttChannelCreate'),false),'revision',coalesce((select revision::text from erp_private.chat_named_grants where profile_id=peer and kind='pttChannelCreate'),'0'));end if;
  if coalesce((select revision from erp_private.chat_named_grants where profile_id=peer and kind='pttChannelCreate'),0)<>(a->>'expectedRevision')::bigint then raise exception 'Conflict' using errcode='PT409';end if;
  insert into erp_private.chat_named_grants(profile_id,kind,enabled,granted_by) values(peer,'pttChannelCreate',(a->>'enabled')::boolean,p)
  on conflict(profile_id,kind) do update set enabled=excluded.enabled,granted_by=p,revision=erp_private.chat_named_grants.revision+1;
  return jsonb_build_object('profileId',peer::text,'enabled',(a->>'enabled')::boolean,'revision',((a->>'expectedRevision')::bigint+1)::text);
 elsif op='channelCreate' then
  perform erp_private.comms_require_terms();
  if not(ga or erp_private.comms_has_named_grant('pttChannelCreate')) then raise exception 'Permission denied' using errcode='42501';end if;
  if length(trim(a->>'name'))=0 then raise exception 'Invalid name' using errcode='22023';end if;
  insert into erp_private.ptt_channels(id,kind,name,description,discoverable,required,creator,owner_id) values((a->>'clientMutationId')::uuid,'group',trim(a->>'name'),a->>'description',(a->>'discoverable')::boolean,coalesce((a->>'required')::boolean,false),p,p) on conflict do nothing returning * into c;
  if not found then select * into c from erp_private.ptt_channels where id=(a->>'clientMutationId')::uuid and creator=p and name=trim(a->>'name') and description=a->>'description' and discoverable=(a->>'discoverable')::boolean and kind='group'; if not found then raise exception 'Conflict' using errcode='PT409';end if;
  else insert into erp_private.ptt_memberships(channel_id,profile_id) values(c.id,p) returning * into m;perform erp_private.ptt_capture_episodes(p_permit,p_request,array[m.id]);end if;
  return erp_private.ptt_card(c,p);
 elsif op='start' then
  if f.profile_id is not null and (f.device_id<>(a->>'deviceId')::uuid or f.auth_session<>(auth.jwt()->>'session_id')::uuid) and not f.stopped and erp_private.provider_actor_session_valid(p,f.auth_session) then
   if not (a->>'confirmTakeover')::boolean or (a->>'expectedEpoch')::uuid is distinct from f.epoch then return jsonb_build_object('epoch',f.epoch,'takeoverRequired',true,'availability',f.availability);end if;
  end if;
  if f.profile_id is null or f.stopped or f.device_id<>(a->>'deviceId')::uuid or f.auth_session<>(auth.jwt()->>'session_id')::uuid then
   insert into erp_private.ptt_phones(profile_id,device_id,auth_session,epoch,availability,stopped,paused) values(p,(a->>'deviceId')::uuid,(auth.jwt()->>'session_id')::uuid,gen_random_uuid(),case when f.auth_session=(auth.jwt()->>'session_id')::uuid then f.availability else 'available' end,false,false)
   on conflict(profile_id) do update set(device_id,auth_session,epoch,availability,stopped,paused,seen_at)=(excluded.device_id,excluded.auth_session,excluded.epoch,excluded.availability,false,false,clock_timestamp()) returning * into f;
  else update erp_private.ptt_phones set seen_at=clock_timestamp() where profile_id=p returning * into f;end if;
  perform erp_private.ptt_sweep(null,cid,p);
  return jsonb_build_object('epoch',f.epoch,'availability',f.availability,'takeoverRequired',false,'stopped',false,'paused',f.paused);
 elsif op in('availability','pause') then
  if op='availability' and a->>'availability' not in('available','busy','offDuty') then raise exception 'Invalid availability' using errcode='22023';end if;
  update erp_private.ptt_phones set connection_generation=connection_generation+case when op='availability' and availability='available' and a->>'availability'<>'available' then 1 else 0 end,availability=case when op='availability' then a->>'availability' else availability end,paused=case when op='pause' then (a->>'paused')::boolean else paused end,stopped=(op='stop') where profile_id=p returning * into f;
  perform erp_private.ptt_sweep(null,cid,p);
  return jsonb_build_object('epoch',e,'availability',f.availability,'stopped',f.stopped,'paused',f.paused);
 end if;
 if op='request' then
  perform erp_private.comms_require_terms();
  if c.archived or c.kind<>'group' or (not c.discoverable and not exists(select from erp_private.ptt_current_requests where channel_id=cid and profile_id=p and invited)) then raise exception 'Unavailable' using errcode='PT404';end if;
  if m.id is null then insert into erp_private.ptt_requests values(cid,p,false,c.request_generation) on conflict(channel_id,profile_id) do update set invited=false,request_generation=excluded.request_generation;end if;
  return jsonb_build_object('requested',m.id is null);
 elsif op in('members','manage','reopenReview') then
  if c.kind<>'group' or (not mgr and not (op='members' and m.id is not null) and not (op='manage' and act in('promote','demote') and c.creator=p and m.id is not null)) then raise exception 'Unavailable' using errcode='PT404';end if;
  if op<>'manage' then
   row_cap:=erp_comm_cost.effect_scan_limit(p_permit,p_request,'ptt_roster_rows');
   select count(*) into affected from (select 1 from erp_private.ptt_current_memberships where channel_id=cid and left_at is null limit row_cap+1) roster;
   if mgr and affected<=row_cap then
    select affected+count(*) into affected from (select 1 from erp_private.ptt_current_requests where channel_id=cid limit row_cap-affected+1) requests;
   end if;
   perform erp_comm_cost.claim_effect(p_permit,p_request,'ptt_roster_rows',affected);
   select jsonb_build_object('revision',c.revision::text,'items',coalesce(jsonb_agg(jsonb_build_object('profileId',x.profile_id::text,'name',coalesce(nullif(u.display_name,''),u.full_name,'ERP user'),'membership',case when coalesce(x.required,c.required) then 'required' else 'optional' end,'role',case when x.profile_id=c.owner_id then 'owner' when x.appointed then 'admin' else 'member' end,'joinedAt',x.joined_at) order by x.profile_id),'[]'::jsonb)) into page from erp_private.ptt_current_memberships x join public.user_profiles u on u.id=x.profile_id where x.channel_id=cid and x.left_at is null;
   if mgr then page:=page||jsonb_build_object('requests',(select coalesce(jsonb_agg(jsonb_build_object('profileId',r.profile_id::text,'invited',r.invited) order by r.profile_id),'[]'::jsonb) from erp_private.ptt_current_requests r where r.channel_id=cid));end if;
   if op='reopenReview' then
    if not c.archived then raise exception 'Conflict' using errcode='PT409';end if;
    insert into erp_private.ptt_reopen_reviews values(cid,p,c.revision,gen_random_uuid(),
    (select sha256(convert_to(coalesce(array_agg(id order by id)::text,'{}'),'UTF8')) from erp_private.ptt_current_memberships where channel_id=cid))
    on conflict(channel_id,profile_id) do update set(revision,token,roster_hash)=(excluded.revision,excluded.token,excluded.roster_hash) returning token into tok;
    page:=page||jsonb_build_object('reviewToken',tok);
   end if;return page;
  end if;
  if (a->>'expectedRevision')::bigint<>c.revision then raise exception 'Revision conflict' using errcode='PT409';end if;
  peer:=(a->>'profileId')::bigint;
  if act in('invite','add','approve','reject','remove','promote','demote','replaceOwner') then
   if peer is null or not erp_private.chat_active(peer) then raise exception 'Unavailable' using errcode='PT404';end if;
   select * into target from erp_private.ptt_current_memberships where channel_id=cid and profile_id=peer and left_at is null;
  end if;
  if c.archived and act not in('remove','reject','demote','replaceOwner','reopen','setRequired') then raise exception 'Archived' using errcode='PT409';end if;
  case act
  when 'archive' then update erp_private.ptt_channels set archived=true,request_generation=request_generation+1 where id=cid;
  when 'reopen' then
   row_cap:=erp_comm_cost.effect_scan_limit(p_permit,p_request,'ptt_roster_rows');
   select count(*) into affected from(select 1 from erp_private.ptt_current_memberships where channel_id=cid limit row_cap+1) roster;
   perform erp_comm_cost.claim_effect(p_permit,p_request,'ptt_roster_rows',affected);
   delete from erp_private.ptt_reopen_reviews where channel_id=cid and profile_id=p and revision=c.revision and token=(a->>'reviewToken')::uuid and roster_hash=(select sha256(convert_to(coalesce(array_agg(id order by id)::text,'{}'),'UTF8')) from erp_private.ptt_current_memberships where channel_id=cid);
   if not found or not c.archived then raise exception 'Review required' using errcode='PT409';end if;
   update erp_private.ptt_channels set archived=false where id=cid;
  when 'invite' then
   if target.id is not null then raise exception 'Already joined' using errcode='PT409';end if;
   insert into erp_private.ptt_requests values(cid,peer,true,c.request_generation) on conflict(channel_id,profile_id) do update set invited=true,request_generation=excluded.request_generation;
  when 'reject' then delete from erp_private.ptt_requests where channel_id=cid and profile_id=peer;
  when 'approve','add' then
   if target.id is not null then raise exception 'Already joined' using errcode='PT409';end if;
   if act='approve' and not exists(select from erp_private.ptt_current_requests where channel_id=cid and profile_id=peer and not invited) then raise exception 'Request required' using errcode='PT409';end if;
   update erp_private.ptt_memberships set left_at=clock_timestamp() where channel_id=cid and profile_id=peer and left_at is null;
   insert into erp_private.ptt_memberships(channel_id,profile_id) values(cid,peer) returning * into target;
   perform erp_private.ptt_capture_episodes(p_permit,p_request,array[target.id]);delete from erp_private.ptt_requests where channel_id=cid and profile_id=peer;
  when 'remove' then
   if target.id is null or peer=c.owner_id or (target.appointed and not (ga or (c.creator=p and m.id is not null))) then raise exception 'Permission denied' using errcode='42501';end if;
   update erp_private.ptt_memberships set left_at=clock_timestamp() where id=target.id;
   delete from erp_private.ptt_optional_connections where channel_id=cid and profile_id=peer;
  when 'promote','demote' then
   if target.id is null or not(ga or (c.creator=p and m.id is not null)) then raise exception 'Permission denied' using errcode='42501';end if;
   update erp_private.ptt_memberships set appointed=(act='promote') where id=target.id;
  when 'replaceOwner' then
   if target.id is null or c.owner_id is not null or not(ga or m.appointed is true) then raise exception 'Permission denied' using errcode='42501';end if;
   update erp_private.ptt_channels set owner_id=peer where id=cid;
  when 'setRequired' then
   if not a?'required' then raise exception 'Invalid channel type' using errcode='22023';end if;
   update erp_private.ptt_channels set required=(a->>'required')::boolean where id=cid;
  when 'settings' then
   if not a ?| array['name','description','discoverable'] or (a?'name' and length(trim(a->>'name'))=0) then raise exception 'Invalid settings' using errcode='22023';end if;
   perform erp_private.comms_require_terms();
   update erp_private.ptt_channels set name=coalesce(trim(a->>'name'),name),description=coalesce(a->>'description',description),discoverable=coalesce((a->>'discoverable')::boolean,discoverable) where id=cid;
  else raise exception 'Invalid action' using errcode='22023';
  end case;
  update erp_private.ptt_channels set revision=revision+1 where id=cid returning * into c;

  perform erp_private.ptt_sweep(null,cid,p);return erp_private.ptt_card(c,p);
 end if;
 if m.id is null then raise exception 'Unavailable' using errcode='PT404';end if;
 if op='leave' then
  if coalesce(m.required,c.required) then raise exception 'Required membership' using errcode='42501';end if;
  delete from erp_private.ptt_optional_connections where channel_id=cid and profile_id=p;
  delete from erp_private.ptt_admissions where channel_id=cid and profile_id=p;
  if c.kind='direct' then insert into erp_private.ptt_disconnected values(cid,p) on conflict do nothing;end if;
  if c.kind='group' and op='leave' then update erp_private.ptt_memberships set left_at=clock_timestamp() where id=m.id;
   update erp_private.ptt_channels set owner_id=case when owner_id=p then null else owner_id end,revision=revision+1 where id=cid;
  end if;
 elsif op='join' then
  if c.archived or not erp_private.ptt_eligible(cid,p,e) then raise exception 'Unavailable' using errcode='PT404';end if;
  delete from erp_private.ptt_disconnected where channel_id=cid and profile_id=p;
  if c.kind='group' and not coalesce(m.required,c.required) then insert into erp_private.ptt_optional_connections values(cid,p) on conflict do nothing;end if;
  insert into erp_private.ptt_admissions as old_seat(channel_id,profile_id,epoch,connection_generation) values(cid,p,e,f.connection_generation)
  on conflict(channel_id,profile_id) do update set epoch=excluded.epoch,connection_generation=excluded.connection_generation,live=false,checked_at=null,requested_at=clock_timestamp()
  where (old_seat.epoch,old_seat.connection_generation) is distinct from (excluded.epoch,excluded.connection_generation);
  perform erp_private.ptt_promote(p,cid);
 elsif op='press' then
  if not erp_private.ptt_eligible(cid,p,e) or not exists(select from erp_private.ptt_current_admissions where channel_id=cid and profile_id=p and epoch=e and live) then raise exception 'Live admission required' using errcode='42501';end if;
  if op='press' then
   perform erp_private.comms_require_terms();
   select * into l from erp_private.ptt_leases where profile_id=p and press_id=(a->>'pressId')::uuid;
   if found then
    if l.channel_id<>cid or l.epoch<>e then raise exception 'Conflict' using errcode='PT409';end if;
    if l.ended_at is null then return jsonb_build_object('granted',true,'leaseId',l.id,'expiresAt',l.expires_at); end if;
    return jsonb_build_object('granted',false,'reason','ended');
   end if;
   if c.archived or exists(select from erp_private.ptt_endpoints x where (x.channel_id=cid or x.profile_id=p) and x.phase<>'closed' and x.dirty) or exists(select from erp_private.ptt_leases x where (x.channel_id=cid or x.profile_id=p) and x.ended_at is null) or exists(select from erp_private.ptt_press_denials x where x.profile_id=p and x.press_id=(a->>'pressId')::uuid) then
    insert into erp_private.ptt_press_denials values(p,(a->>'pressId')::uuid,cid,e) on conflict do nothing;
    return jsonb_build_object('granted',false,'reason',case when c.archived then 'archived' else 'busy' end);
   end if;
   tm:=clock_timestamp();
   episode_limit:=erp_comm_cost.ptt_receipt_scan_limit(p_permit,p_request);
   if episode_limit is null or episode_limit<0 then raise sqlstate 'PT503' using message='Receipt allocation unavailable';end if;
   -- Membership management uses this same PTT lock. Freeze the exact episode IDs for this floor.
   episodes:=array(select m0.id from erp_private.ptt_current_memberships m0 where m0.channel_id=cid and m0.left_at is null and m0.profile_id<>p
    limit least(episode_limit,9223372036854775806::bigint)+1);
   floor_id:=gen_random_uuid();
   perform erp_comm_cost.require_ptt_receipt_capacity(p_permit,floor_id,cardinality(episodes),p_request);
   insert into erp_private.ptt_leases(id,channel_id,profile_id,epoch,press_id,started_at,expires_at) values(floor_id,cid,p,e,(a->>'pressId')::uuid,tm,tm+interval '60 seconds') returning * into l;
   perform erp_private.ptt_record_open(l.id,episodes);
   return jsonb_build_object('granted',true,'leaseId',l.id,'expiresAt',l.expires_at);
  end if;
 end if;
 perform erp_private.ptt_sweep(null,cid,p);
 select * into l from erp_private.ptt_leases where channel_id=cid and ended_at is null and erp_private.ptt_eligible(cid,p,e) and exists(select from erp_private.ptt_current_admissions where channel_id=cid and profile_id=p and epoch=e and live);
 return jsonb_build_object('channelId',cid,'admission',coalesce((select case when live then 'live' else 'waiting' end from erp_private.ptt_current_admissions where channel_id=cid and profile_id=p),'none'),'floor',case when l.id is not null then jsonb_build_object('leaseId',l.id,'startedAt',l.started_at,'expiresAt',l.expires_at,'speakerProfileId',l.profile_id::text,'mediaReady',exists(select from erp_private.ptt_endpoints xpub where xpub.lease_id=l.id and xpub.phase='published' and not xpub.dirty and xpub.deadline>clock_timestamp())) end);
end $$;
create function public.erp_ptt_v1(p_request jsonb,p_permit uuid default null) returns jsonb language sql security definer set search_path='' as $$select erp_private.ptt_control(p_request,p_permit)$$;
create table erp_private.ptt_cost_links(
 endpoint_id uuid not null references erp_private.ptt_endpoints, operation_id text not null unique,
 actor text not null, permit_id uuid not null, until_at timestamptz not null, primary key(endpoint_id,operation_id)
);
create function erp_private.ptt_recheck_costs(p_worker uuid default null,p_channel uuid default null,p_actor bigint default null) returns void language plpgsql set search_path='' as $$
begin
 -- Tracking a consumed permit must never re-reserve it. The recorded cutoff bounds all proof/meter deadlines.
 update erp_private.ptt_endpoints e set dirty=true where (e.worker_id=p_worker or e.channel_id=p_channel or e.profile_id=p_actor) and not dirty and phase<>'closed' and
 (not exists(select from erp_private.ptt_feature_gate where feature='ptt_live' and enabled) or exists(
 select from erp_private.ptt_cost_links x where x.endpoint_id=e.id and not exists(
  select from erp_comm_cost.reservation r join erp_comm_cost.authority own on own.singleton
  join public.user_profiles u on u.auth_user_id=own.owner_auth_id and u.status='active' and u.must_change_password is false
  join erp_comm_cost.proof pr on pr.operation_id=r.operation_id
  where r.permit_id=x.permit_id and r.consumed_at is not null and r.settled_at is null and r.actor_id=x.actor
  and r.scope='communications' and r.feature='ptt_live' and least(r.expires_at,pr.valid_until,pr.operational_stop_by,x.until_at)>clock_timestamp()
  and not exists(select from erp_comm_cost.pause q where q.scope=r.scope and q.feature=r.feature)
  and not exists(select from erp_comm_cost.unit_hold h join erp_comm_cost.capacity c on c.id=h.capacity_id where h.permit_id=r.permit_id and (not c.enabled or c.valid_until<=clock_timestamp()))
  and (r.approval_id is null or exists(select from erp_comm_cost.approval aa where aa.id=r.approval_id and aa.owner_auth_id=own.owner_auth_id and aa.revoked_at is null and aa.ends_at>clock_timestamp()))
  and not exists(select from erp_comm_cost.meter mm where mm.operation_id=r.operation_id and
     (not mm.complete or mm.valid_until<=clock_timestamp() or mm.observed_at+pr.max_meter_age<=clock_timestamp()))
 )));
end $$;
create function public.erp_ptt_provider_v1(p_cmd text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p bigint:=(p_data->>'actor')::bigint;e uuid:=(p_data->>'epoch')::uuid;c uuid:=(p_data->>'channelId')::uuid;
 k uuid:=(p_data->>'endpointId')::uuid;lid uuid:=(p_data->>'leaseId')::uuid;token uuid:=(p_data->>'token')::uuid;act text:=p_data->>'action';
 x erp_private.ptt_endpoints; src erp_private.ptt_endpoints; l erp_private.ptt_leases;
 until_at timestamptz:=(p_data->>'until')::timestamptz; guard jsonb; ts timestamptz;
 w uuid:=(p_data->>'worker')::uuid; boot_id uuid:=(p_data->>'boot')::uuid; pulse uuid:=(p_data->>'poll')::uuid;
 covered timestamptz; cadence int; chosen uuid; required_until timestamptz;
begin
 if p_cmd='startWorker' then
  covered:=erp_comm_cost.start_ptt_worker(w,boot_id,until_at,(p_data->>'maxPolls')::int);
  if covered is null then return jsonb_build_object('held',true);end if;
  select cp.poll_seconds into strict cadence from erp_comm_cost.ptt_worker_boot wb join erp_comm_cost.control_pool cp on cp.permit_id=wb.pool where wb.boot=boot_id;
  return jsonb_build_object('coveredUntil',covered,'cadenceSeconds',cadence);
 elsif p_cmd='tick' then
  -- Debit before taking the PTT lock, selecting a target or invoking any global sweep.
  covered:=erp_comm_cost.take_ptt_worker_poll(w,boot_id,pulse);
  if covered is null or covered<=clock_timestamp()+interval '30 seconds' then return jsonb_build_object('held',true);end if;
  insert into erp_private.ptt_worker_cycles(worker,boot,poll,until_at) values(w,boot_id,pulse,least(covered,clock_timestamp()+interval '30 seconds'))
  on conflict(worker) do update set boot=excluded.boot,poll=excluded.poll,until_at=excluded.until_at,
   completed=false,recording_claimed=false,recording_blocked=false,healthy_until=null;
  -- Other transactions may already hold the PTT lock before taking the budget lock.
  if not pg_try_advisory_xact_lock(163487665,12) then
   update erp_private.ptt_worker_cycles set completed=true where worker=w;
   return jsonb_build_object('coveredUntil',covered,'busy',true);end if;
 elsif p_cmd='finishTick' then
  update erp_private.ptt_worker_cycles wc set completed=true,healthy_until=case when (p_data->>'healthy')::boolean and not wc.recording_blocked and not exists(
   select from erp_private.ptt_endpoints ep where ep.worker_id=w and ep.dirty and ep.phase<>'closed') then
   least(b.until_at,clock_timestamp()+interval '8 seconds') end from erp_comm_cost.ptt_worker_boot b where wc.worker=w and wc.boot=boot_id
   and ((p_data->>'healthy')::boolean is not true or wc.recording_claimed) and wc.poll=pulse and not wc.completed and wc.until_at>clock_timestamp() and b.boot=boot_id and b.lease_until>clock_timestamp() returning wc.healthy_until into covered;
  return jsonb_build_object('ok',found,'healthy',covered is not null);
 else
  perform erp_private.ptt_lock();
 end if;
 if p_cmd='begin' then
 perform erp_private.ptt_require_gate('ptt_live');
 guard:=jsonb_build_object('op','ptt.signal','args',p_data-array['actor','authSession','appId','operation','until','permit']);
 perform erp_private.ptt_rules('signal',guard->'args');
 perform erp_comm_cost.take_service_permit((p_data->>'permit')::uuid,'ptt_live','communications',p::text,(p_data->>'authSession')::uuid,guard);
 select r.expires_at into strict ts from erp_comm_cost.reservation r where r.permit_id=(p_data->>'permit')::uuid
 and r.liability_ends_at=until_at and r.operation_id=p_data->>'operation';
 end if;
 if p_cmd='begin' then perform erp_private.ptt_sweep(null,c,p);end if;
 if p_cmd='tick' then
  update erp_private.ptt_endpoints set dirty=true where worker_id=w and not dirty and phase<>'closed' and ((p_data->>'enabled')::boolean is not true or app_id is distinct from p_data->>'appId');
  perform erp_private.ptt_recheck_costs(w);
  -- Recover an acknowledged SFU close if the worker stopped between budget confirmation and endpoint commit.
  update erp_private.ptt_endpoints e set phase='closed' where worker_id=w and dirty and phase='closing' and exists(select from erp_comm_cost.cleanup_resource r where r.permit_id=e.cleanup_permit and r.endpoint='close_sfu_tracks' and r.resource_id=e.id::text and r.closed_at is not null);
  perform erp_private.ptt_sweep(w);
  -- Retain held/uncertain mutations until disposition is evidenced. Never infer success from a timeout.
  update erp_private.ptt_endpoints set phase='held' where worker_id=w and dirty and phase in('publishing','subscribing','answering') and close_after<=clock_timestamp();
  select * into x from erp_private.ptt_endpoints where worker_id=w and dirty and phase in('published','subscribed','offer','closing','held') and close_after<=clock_timestamp() order by close_after,id limit 1;
  if not found then return jsonb_build_object('coveredUntil',covered,'poll',pulse,'job',null);end if;
  update erp_private.ptt_endpoints set phase=case when phase='held' then 'held' else 'closing' end,mutation=gen_random_uuid(),close_after=clock_timestamp()+interval '12 seconds' where id=x.id returning * into x;
  return jsonb_build_object('coveredUntil',covered,'poll',pulse,'job',jsonb_build_object('endpointId',x.id,'sessionId',x.session_id,'mid',x.mid,'token',x.mutation,'permitId',x.cleanup_permit,'appId',x.app_id,'uncertain',x.phase='held'));
 elsif p_cmd='unused' then
  -- Trusted ERP could not bind cleanup funding before starting the remote mutation.
  update erp_private.ptt_endpoints set phase='closed',dirty=true where id=k and mutation=token and phase in('opening','publishing','subscribing');
  return '{}'::jsonb;
 elsif p_cmd='closed' then
  update erp_private.ptt_endpoints set phase='closed' where id=k and phase='closing' and mutation=token and dirty and exists(select from erp_comm_cost.cleanup_resource r where r.permit_id=cleanup_permit and r.endpoint='close_sfu_tracks' and r.resource_id=k::text and r.closed_at is not null);
  return jsonb_build_object('ok',found);
 elsif p_cmd='uncertain' then
  update erp_private.ptt_endpoints set phase=case when phase='opening' then 'closed' else 'held' end,dirty=true where id=k and mutation=token and phase in('opening','publishing','subscribing','answering');
  return '{}'::jsonb;
 elsif p_cmd='finish' then
  select * into x from erp_private.ptt_endpoints where id=k and mutation=token and phase in('opening','publishing','subscribing','answering');
  if not found then raise exception 'Stale signaling' using errcode='PT409';end if;
  update erp_private.ptt_endpoints set close_after=clock_timestamp(),session_id=coalesce(p_data->>'sessionId',session_id),mid=coalesce(p_data->>'mid',mid),
  phase=case x.phase when 'opening' then 'idle' when 'publishing' then 'published' when 'subscribing' then 'offer' else 'subscribed' end where id=k;
  perform erp_private.ptt_recheck_costs(null,x.channel_id,x.profile_id);perform erp_private.ptt_sweep(null,x.channel_id,x.profile_id);
  return jsonb_build_object('ok',(select not dirty and phase<>'closed' from erp_private.ptt_endpoints where id=k));
 elsif p_cmd<>'begin' then raise exception 'Invalid provider operation' using errcode='22023';end if;
 if not erp_private.ptt_eligible(c,p,e) or not exists(select from erp_private.ptt_phones where profile_id=p and epoch=e and auth_session=(p_data->>'authSession')::uuid)
 or not exists(select from erp_private.ptt_current_admissions where channel_id=c and profile_id=p and epoch=e and live)
 then raise exception 'Live admission required' using errcode='42501';end if;
 perform erp_private.ptt_recheck_costs(null,c,p);
 if exists(select from erp_private.ptt_endpoints where (channel_id=c or profile_id=p) and dirty and phase<>'closed') then raise exception 'Cleanup pending' using errcode='PT409';end if;
 select greatest(until_at,pr.operational_stop_by) into strict required_until from erp_comm_cost.proof pr where pr.operation_id=p_data->>'operation';
 if act='open' then
  chosen:=erp_private.ptt_ready_worker(required_until);
  if chosen is null or (select count(*) from erp_private.ptt_endpoints where worker_id=chosen and phase<>'closed')>=256 then raise sqlstate 'PT503' using message='SFU drain window unavailable';end if;
  if exists(select from erp_private.ptt_endpoints where channel_id=c and epoch=e and phase in('opening','idle')) then raise exception 'Unused endpoint exists' using errcode='PT409';end if;
  insert into erp_private.ptt_endpoints(channel_id,profile_id,epoch,worker_id,app_id,phase,deadline,mutation) values(c,p,e,chosen,p_data->>'appId','opening',least(ts,clock_timestamp()+interval '75 seconds'),gen_random_uuid()) returning * into x;
 else
  select * into x from erp_private.ptt_endpoints where id=k and channel_id=c and profile_id=p and epoch=e and app_id=p_data->>'appId' and not dirty and deadline>clock_timestamp();
  select * into l from erp_private.ptt_leases where id=lid and channel_id=c and ended_at is null and expires_at>clock_timestamp();
  if x.id is null or l.id is null or (act='answer' and (x.phase<>'offer' or x.lease_id<>lid)) or (act in('publish','subscribe') and x.phase<>'idle') then raise exception 'Current lease and endpoint required' using errcode='PT409';end if;
  if x.worker_id is null or erp_private.ptt_ready_worker(required_until,x.worker_id) is null then raise sqlstate 'PT503' using message='SFU drain window unavailable';end if;
  if act in('publish','subscribe') then
   if (erp_comm_cost.cleanup('bind_cleanup',jsonb_build_object('permitId',p_data->>'permit','endpoint','close_sfu_tracks','resourceId',k))->>'ok')::boolean is not true then raise sqlstate 'PT503' using message='Track cleanup unavailable';end if;
   perform erp_comm_cost.claim_ptt_drain(x.worker_id,(p_data->>'permit')::uuid,least(x.deadline,l.expires_at,ts));
  end if;
  if act='publish' then
   if erp_private.ptt_recording_ready(lid,p,e) is not true then raise exception 'Recording preflight required' using errcode='PT503';end if;
   if not exists(select from erp_private.comms_policy_acceptances a join erp_private.comms_policy_versions v using(version) where v.is_current and a.profile_id=p) then raise exception 'Terms required' using errcode='42501';end if;
   if l.profile_id<>p or l.epoch<>e or exists(select from erp_private.ptt_endpoints where lease_id=lid and phase in('published','publishing')) then raise exception 'Publication denied' using errcode='42501';end if;
  elsif act='subscribe' then
   if l.profile_id=p or exists(select from erp_private.ptt_endpoints where channel_id=c and epoch=e and lease_id=lid and phase<>'closed') then raise exception 'Subscription unavailable' using errcode='PT409';end if;
   select * into src from erp_private.ptt_endpoints where channel_id=c and lease_id=lid and profile_id=l.profile_id and app_id=p_data->>'appId' and phase='published' and not dirty and deadline>clock_timestamp();
   if not found then raise exception 'Publisher unavailable' using errcode='PT409';end if;
  elsif act<>'answer' then raise exception 'Invalid action' using errcode='22023';end if;
  update erp_private.ptt_endpoints set lease_id=lid,mid=case when act='publish' then p_data->>'mid' else mid end,
  close_after=clock_timestamp()+interval '9 seconds',cleanup_permit=coalesce(cleanup_permit,(p_data->>'permit')::uuid),deadline=least(deadline,ts,l.expires_at),mutation=gen_random_uuid(),phase=case act when 'publish' then 'publishing' when 'subscribe' then 'subscribing' else 'answering' end where id=k returning * into x;
 end if;
 insert into erp_private.ptt_cost_links values(x.id,p_data->>'operation',p::text,(p_data->>'permit')::uuid,until_at);
 return jsonb_build_object('endpointId',x.id,'sessionId',x.session_id,'token',x.mutation,'publisherSessionId',src.session_id,'trackName',case when lid is not null then 'ptt-'||lid end);
end $$;
do $grants$
declare obj record;
begin
 for obj in select c.oid::regclass rel,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='erp_private' and c.relname like 'ptt\_%' escape '\' and c.relkind in('r','S') loop
  execute format('revoke all on %s from public, anon, authenticated, service_role',obj.rel);
  if obj.relkind='r' then execute format('alter table %s enable row level security',obj.rel);end if;
 end loop;
 for obj in select p.oid::regprocedure fn from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='erp_private' and p.proname like 'ptt\_%' escape '\' loop
  execute format('revoke all on function %s from public, anon, authenticated, service_role',obj.fn);
 end loop;
end $grants$;
revoke all on function public.erp_ptt_v1(jsonb,uuid),public.erp_ptt_provider_v1(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.erp_ptt_v1(jsonb,uuid) to authenticated;
grant execute on function public.erp_ptt_provider_v1(text,jsonb) to service_role;
commit;


