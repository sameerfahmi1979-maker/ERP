-- Isolated PTT retained storage. Only the ERP relay can read/write actual blobs.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('erp-ptt-recordings','erp-ptt-recordings',false,52428800,array['audio/wav']);
create policy ptt_recordings_relay_only on storage.objects as restrictive for all to authenticated,anon
 using(bucket_id <> 'erp-ptt-recordings') with check(bucket_id <> 'erp-ptt-recordings');

create table erp_private.ptt_recording_gate (singleton boolean primary key default true check(singleton),enabled boolean not null default false);
insert into erp_private.ptt_recording_gate default values;
alter table erp_private.ptt_recording_gate enable row level security;
revoke all on erp_private.ptt_recording_gate from public,anon,authenticated,service_role;
create table erp_private.ptt_recordings (
 lease_id uuid primary key references erp_private.ptt_leases, source_session uuid not null,
 preflight_permit uuid references erp_comm_cost.reservation(permit_id), published_at timestamptz, failed boolean not null default false,
 object_id uuid unique, verified_at timestamptz, byte_size integer, sha256 text, duration_ms integer,
 check ((verified_at is null) = (object_id is null)),
 check (verified_at is null or (not failed and byte_size between 45 and 52428800 and
 sha256 ~ '^[a-f0-9]{64}$' and duration_ms between 1 and 60000))
);
create table erp_private.ptt_recording_uploads (
 id uuid primary key default gen_random_uuid(), lease_id uuid not null references erp_private.ptt_recordings,
 permit_id uuid not null, cleanup_attempt uuid, expires_at timestamptz not null, cleanup_after timestamptz not null,
 unique(lease_id)
);
create table erp_private.ptt_recording_receipts (
 lease_id uuid not null references erp_private.ptt_recordings, episode bigint not null references erp_private.ptt_memberships,
 busy_at_send boolean not null default false, delivered_at timestamptz, played_at timestamptz, primary key(lease_id,episode)
);
create index ptt_recording_history_page on erp_private.ptt_leases(channel_id,started_at desc,id desc);
alter table erp_private.ptt_recordings enable row level security;
alter table erp_private.ptt_recording_receipts enable row level security;
alter table erp_private.ptt_recording_uploads enable row level security;
revoke all on erp_private.ptt_recordings,erp_private.ptt_recording_receipts,erp_private.ptt_recording_uploads from public,anon,authenticated,service_role;

create or replace function erp_private.ptt_recording_ready(p_lease uuid,p_profile bigint,p_epoch uuid) returns boolean
 language sql stable set search_path='' as $$
 select exists(select from erp_private.ptt_recordings r join erp_private.ptt_leases l on l.id=r.lease_id
  join erp_private.ptt_phones f on f.profile_id=l.profile_id and f.epoch=l.epoch and f.auth_session=r.source_session
  join erp_comm_cost.reservation v on v.permit_id=r.preflight_permit join erp_comm_cost.proof e on e.operation_id=v.operation_id
  join erp_comm_cost.authority o on o.singleton join public.user_profiles owner_profile on owner_profile.auth_user_id=o.owner_auth_id
  where (select enabled from erp_private.ptt_recording_gate) and l.id=p_lease and l.profile_id=p_profile and l.epoch=p_epoch
  and not r.failed and l.ended_at is null and l.expires_at>clock_timestamp() and erp_private.ptt_eligible(l.channel_id,p_profile,p_epoch)
  and owner_profile.status='active' and not owner_profile.must_change_password and v.actor_id=p_profile::text and v.actor_session=r.source_session
  and v.feature='ptt_replay' and v.scope='communications' and v.liability_ends_at is null and v.consumed_at is not null and v.settled_at is null
  and v.expires_at>clock_timestamp() and e.valid_until>clock_timestamp() and length(trim(e.retained_at_zero_cost_evidence))>0
  and exists(select from erp_comm_cost.cleanup_limit lim where lim.operation_id=v.operation_id and lim.endpoint='discard_partial_upload')
  and not exists(select from erp_comm_cost.pause where scope=v.scope and feature=v.feature)
  and not exists(select from erp_comm_cost.unit_hold h join erp_comm_cost.capacity c on c.id=h.capacity_id where h.permit_id=v.permit_id and (not c.enabled or c.valid_until<=clock_timestamp()))
  and (v.approval_id is null or exists(select from erp_comm_cost.approval ap where ap.id=v.approval_id and ap.owner_auth_id=o.owner_auth_id and ap.revoked_at is null and ap.ends_at>clock_timestamp())))
$$;
revoke all on function erp_private.ptt_recording_ready(uuid,bigint,uuid) from public,anon,authenticated,service_role;
create or replace function erp_private.ptt_record_open(p_lease uuid,p_episodes bigint[]) returns void language plpgsql set search_path='' as $$
declare inserted bigint;
begin
 if not exists(select from erp_comm_cost.ptt_receipt_claim where lease_id=p_lease and episodes=cardinality(p_episodes)) then raise sqlstate 'PT503';end if;
 insert into erp_private.ptt_recordings(lease_id,source_session)
  select l.id,p.auth_session from erp_private.ptt_leases l join erp_private.ptt_phones p on p.profile_id=l.profile_id and p.epoch=l.epoch where l.id=p_lease;
 if not found then raise sqlstate '42501';end if;
 insert into erp_private.ptt_recording_receipts(lease_id,episode,busy_at_send)
  select p_lease,m.id,coalesce(f.availability='busy' and not f.stopped,false)
  from unnest(p_episodes) e(id) join erp_private.ptt_current_memberships m on m.id=e.id left join erp_private.ptt_phones f on f.profile_id=m.profile_id;
 get diagnostics inserted=row_count;
 if inserted<>cardinality(p_episodes) then raise sqlstate 'PT409';end if;
end $$;
create function erp_private.ptt_record_source() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.phase='publishing' and new.phase='published' then
  if new.mid is not null and new.session_id is not null and erp_private.ptt_recording_ready(new.lease_id,new.profile_id,new.epoch) then
   update erp_private.ptt_recordings set published_at=clock_timestamp() where lease_id=new.lease_id and published_at is null;
  else
   update erp_private.ptt_recordings set failed=true where lease_id=new.lease_id and verified_at is null;
  end if;
 elsif old.phase='published' and (new.dirty or new.phase<>'published') then
  update erp_private.ptt_recordings r set failed=true from erp_private.ptt_leases l
   where r.lease_id=new.lease_id and l.id=r.lease_id and l.ended_at is null and r.verified_at is null;
 end if;
 return null;
end $$;
create trigger ptt_record_publisher after update on erp_private.ptt_endpoints for each row execute function erp_private.ptt_record_source();

create function erp_private.ptt_record_state(r erp_private.ptt_recordings,l erp_private.ptt_leases)
returns text language sql stable set search_path='' as $$
 select case when r.verified_at is not null then 'sent' when r.failed or l.end_reason='revoked'
 or l.ended_at < clock_timestamp()-interval '2 minutes' then 'failed' else 'processing' end
$$;

do $install$
begin
 if to_regprocedure('erp_private.comms_moderation_hidden(text,uuid)') is null then
  execute $ddl$create function erp_private.comms_moderation_hidden(kind text,id uuid) returns boolean language sql stable set search_path='' as 'select false'$ddl$;
  revoke all on function erp_private.comms_moderation_hidden(text,uuid) from public,anon,authenticated,service_role;
 end if;
end $install$;
create function public.erp_ptt_recording_v1(p_request jsonb,p_permit uuid) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare
 actor bigint:=erp_private.comms_actor_id(); a jsonb:=p_request->'args'; op text:=p_request->>'op';
 mode text:=a->>'mode'; channel uuid:=(a->>'channelId')::uuid; rid uuid:=(a->>'recordingId')::uuid;
 epoch uuid:=(a->>'epoch')::uuid; cursor_id uuid:=(a->>'cursor')::uuid; cursor_at timestamptz;
 l erp_private.ptt_leases; r erp_private.ptt_recordings; stage erp_private.ptt_recording_uploads;
 rows jsonb; n int; eligible boolean; episode bigint; result jsonb; state text;
begin
 perform erp_private.ptt_lock();
 perform erp_private.comms_require_terms();
 if (select enabled from erp_private.ptt_recording_gate) is not true then raise sqlstate 'PT503' using message='Recording on hold'; end if;
 perform erp_comm_cost.take_permit(p_permit,'ptt_replay','communications',actor::text,p_request);
 if op='pttRecording.cacheCheck' then
  if not erp_private.ptt_history_allowed(channel,clock_timestamp(),mode) then raise sqlstate '42501';end if;
  if jsonb_typeof(a->'ids') is distinct from 'array' or jsonb_array_length(a->'ids')>100 then raise sqlstate '22023';end if;
  select coalesce(jsonb_agg(x.id),'[]') into rows from erp_private.ptt_leases x join erp_private.ptt_recordings y on y.lease_id=x.id
  where x.channel_id=channel and x.id in (select value::uuid from jsonb_array_elements_text(a->'ids')) and y.verified_at is not null
   and erp_private.ptt_history_allowed(channel,x.started_at,mode) and (mode='review' or not erp_private.comms_moderation_hidden('ptt_transmission',x.id));
  return jsonb_build_object('ids',rows);
 end if;
 if op='pttRecording.history' then
  if not erp_private.ptt_history_allowed(channel,clock_timestamp(),mode) then raise sqlstate '42501'; end if;
  if cursor_id is not null then
   select started_at into cursor_at from erp_private.ptt_leases where id=cursor_id and channel_id=channel
   and erp_private.ptt_history_allowed(channel,started_at,mode) and (mode='review' or not erp_private.comms_moderation_hidden('ptt_transmission',cursor_id));
   if not found then raise sqlstate 'PT404'; end if;
  end if;
  select jsonb_agg(item order by started_at desc,id desc) into rows from (
   select x.started_at,x.id,jsonb_build_object('id',x.id,'startedAt',x.started_at,'senderProfileId',x.profile_id::text,
    'sender',coalesce(nullif(p.display_name,''),p.full_name,'ERP user'),'state',erp_private.ptt_record_state(y,x),
    'durationMs',y.duration_ms,'mine',x.profile_id=actor,'played',case when mode='participant' then rr.played_at is not null end) item
   from erp_private.ptt_leases x join erp_private.ptt_recordings y on x.id=y.lease_id join public.user_profiles p on p.id=x.profile_id
   left join erp_private.ptt_current_memberships m on m.channel_id=x.channel_id and m.profile_id=actor and m.left_at is null
   left join erp_private.ptt_recording_receipts rr on rr.lease_id=x.id and rr.episode=m.id
   where x.channel_id=channel and x.ended_at is not null and erp_private.ptt_history_allowed(channel,x.started_at,mode)
   and (mode='review' or not erp_private.comms_moderation_hidden('ptt_transmission',x.id))
   and (cursor_id is null or (x.started_at,x.id)<(cursor_at,cursor_id)) order by x.started_at desc,x.id desc limit 51) h;
  rows:=coalesce(rows,'[]'); n:=jsonb_array_length(rows);
  return jsonb_build_object('items',case when n>50 then rows-50 else rows end,'nextCursor',case when n>50 then rows->49->>'id' end,
   'episode',case when mode='participant' then (select id::text from erp_private.ptt_current_memberships where channel_id=channel and profile_id=actor and left_at is null) end);
 end if;
 select * into l from erp_private.ptt_leases where id=rid;
 select * into r from erp_private.ptt_recordings where lease_id=rid;
 if r.lease_id is null then raise sqlstate 'PT404' using message='Transmission unavailable'; end if;
 state:=erp_private.ptt_record_state(r,l);
 if op in ('pttRecording.preflight','pttRecording.prepare','pttRecording.bind','pttRecording.finalize','pttRecording.fail') then
  begin
   perform erp_private.ptt_require_phone(epoch);
  exception when insufficient_privilege then raise sqlstate 'PT404' using message='Transmission unavailable';
  end;
  if l.profile_id<>actor or l.epoch<>epoch or l.channel_id<>channel
   or r.source_session<>(auth.jwt()->>'session_id')::uuid or not erp_private.ptt_history_allowed(channel,l.started_at,'participant')
   then raise sqlstate 'PT404' using message='Transmission unavailable'; end if;
  if op='pttRecording.preflight' then
   if l.ended_at is not null or l.expires_at<=clock_timestamp() or not erp_private.ptt_eligible(channel,actor,epoch) then raise sqlstate 'PT409';end if;
   update erp_private.ptt_recordings set preflight_permit=p_permit where lease_id=rid;
   if not erp_private.ptt_recording_ready(rid,actor,epoch) then raise sqlstate 'PT503' using message='Recording preflight unavailable'; end if;
   return jsonb_build_object('state','ready');
  end if;
  if op='pttRecording.fail' then
   update erp_private.ptt_recordings set failed=true where lease_id=rid and verified_at is null;
   return jsonb_build_object('state',case when r.verified_at is null then 'failed' else 'sent' end);
  end if;
  if r.verified_at is not null then return jsonb_build_object('state','sent'); end if;
  if state='failed' or l.end_reason is null or l.end_reason not in ('released','expired') or r.published_at is null or
    l.ended_at is null or l.ended_at<r.published_at then raise sqlstate 'PT409'; end if;
  if op='pttRecording.prepare' then return jsonb_build_object('state','ready','id',rid); end if;
  if op='pttRecording.bind' then
   insert into erp_private.ptt_recording_uploads(lease_id,permit_id,expires_at,cleanup_after)
    values(rid,p_permit,least(l.ended_at+interval '2 minutes',clock_timestamp()+interval '1 minute'),clock_timestamp()+interval '4 minutes')
    on conflict(lease_id) do nothing returning * into stage;
   if not found then raise sqlstate 'PT409'; end if;
   if (erp_comm_cost.cleanup('bind_cleanup',jsonb_build_object('permitId',p_permit,'endpoint','discard_partial_upload','resourceId',stage.id))->>'ok')::boolean is not true
    then raise sqlstate 'PT503' using message='Recording cleanup not funded'; end if;
   perform erp_comm_cost.claim_ptt_drain(erp_private.ptt_ready_worker(stage.cleanup_after),p_permit,stage.cleanup_after);
   return jsonb_build_object('objectId',stage.id);
  end if;
  select * into stage from erp_private.ptt_recording_uploads where lease_id=rid and id=(a->>'objectId')::uuid and expires_at>clock_timestamp() for update;
  if not found then raise sqlstate 'PT409'; end if;
  if abs(extract(epoch from l.ended_at-r.published_at)*1000-(a->>'durationMs')::int)>2000
    or (a->>'durationMs')::int > extract(epoch from l.ended_at-l.started_at)*1000+250
    or not exists(select from storage.objects where bucket_id='erp-ptt-recordings' and name=stage.id::text||'.wav'
    and metadata->>'mimetype'='audio/wav' and (metadata->>'size')::bigint=(a->>'byteSize')::int)
    then raise sqlstate 'PT409'; end if;
  update erp_private.ptt_recordings set verified_at=clock_timestamp(),byte_size=(a->>'byteSize')::int,sha256=a->>'sha256',
   duration_ms=(a->>'durationMs')::int,object_id=stage.id where lease_id=rid;
  -- This exact object has become retained content, so the staged-discard obligation
  -- is discharged in the same transaction. Retention liability remains on its own permit.
  perform erp_comm_cost.release_retained_upload(stage.permit_id,stage.id::text);
  delete from erp_private.ptt_recording_uploads where id=stage.id;
  if to_regprocedure('erp_private.notification_enqueue(text,uuid,bigint)') is not null then
   perform erp_private.notification_enqueue('ptt',rid,m.profile_id) from erp_private.ptt_recording_receipts x join erp_private.ptt_current_memberships m on m.id=x.episode where x.lease_id=rid and x.busy_at_send and m.left_at is null;
  end if;
  return jsonb_build_object('state','sent');
 end if;
 if op='pttRecording.liveAuthorize' then
  begin
   perform erp_private.ptt_require_phone(epoch);
  exception when insufficient_privilege then raise sqlstate 'PT404' using message='Transmission unavailable';
  end;
  if mode is distinct from 'participant' or channel is distinct from l.channel_id or not erp_private.ptt_eligible(channel,actor,epoch) then raise sqlstate 'PT404' using message='Transmission unavailable';end if;
 end if;
 if not erp_private.ptt_history_allowed(l.channel_id,l.started_at,mode) then raise sqlstate 'PT404' using message='Transmission unavailable';end if;
 if mode='participant' and erp_private.comms_moderation_hidden('ptt_transmission',rid) then raise sqlstate 'PT404' using message='Transmission unavailable'; end if;
 if op='pttRecording.recipients' then
  if l.profile_id<>actor or mode<>'participant' then raise sqlstate 'PT404' using message='Transmission unavailable'; end if;
  select coalesce(jsonb_agg(item order by profile_id),'[]') into rows from (
   select m.profile_id,jsonb_build_object('profileId',m.profile_id::text,'name',coalesce(p.display_name,p.full_name,'ERP user'),
    'state',case when x.played_at is not null then 'played' when x.delivered_at is not null then 'delivered' else state end) item
   from erp_private.ptt_recording_receipts x join erp_private.ptt_memberships m on m.id=x.episode
   join public.user_profiles p on p.id=m.profile_id where x.lease_id=rid and m.profile_id>coalesce((a->>'afterProfileId')::bigint,0)
   order by m.profile_id limit 51) h;
  n:=jsonb_array_length(rows);
  return jsonb_build_object('items',case when n>50 then rows-50 else rows end,'nextCursor',case when n>50 then rows->49->>'profileId' end);
 end if;
 if op='pttRecording.liveAuthorize' and state='failed' then return jsonb_build_object('state','failed');end if;
 if state<>'sent' then raise sqlstate 'PT409'; end if;
 select id into episode from erp_private.ptt_current_memberships where channel_id=l.channel_id and profile_id=actor and left_at is null;
 if op='pttRecording.receipt' then
  if mode<>'participant' or a->>'event' not in ('delivered','played') then raise sqlstate '42501';end if;
  update erp_private.ptt_recording_receipts set delivered_at=coalesce(delivered_at,clock_timestamp()),
   played_at=case when a->>'event'='played' then coalesce(played_at,clock_timestamp()) else played_at end
   where lease_id=rid and ptt_recording_receipts.episode= (select m.id from erp_private.ptt_current_memberships m where m.channel_id=l.channel_id and m.profile_id=actor and m.left_at is null);
  return jsonb_build_object('ok',found);
 elsif op in ('pttRecording.authorize','pttRecording.read','pttRecording.liveAuthorize') then
  result:=jsonb_build_object('id',rid,'channelId',l.channel_id,'episode',case when mode='participant' then episode::text end,'sha256',r.sha256,'byteSize',r.byte_size,
   'senderProfileId',l.profile_id::text,'sender',(select coalesce(nullif(display_name,''),full_name,'ERP user') from public.user_profiles where id=l.profile_id),'startedAt',l.started_at,'durationMs',r.duration_ms);
  if op='pttRecording.read' then result:=result||jsonb_build_object('objectId',r.object_id);end if;
  return result;
 end if;
 raise sqlstate '22023';
end $$;
-- Serialize the Storage catalog commit with the exact stage row used by finalize and cleanup.
create function erp_private.ptt_recording_storage_fence() returns trigger language plpgsql security definer set search_path='' as $$
declare object_name text; stage erp_private.ptt_recording_uploads;
begin
 if tg_op='UPDATE' then
  -- Permit Storage bookkeeping on an existing object. Its bytes, path and metadata are immutable.
  if (to_jsonb(new)-array['last_accessed_at','updated_at']) is distinct from (to_jsonb(old)-array['last_accessed_at','updated_at']) then
   raise sqlstate '42501' using message='Immutable recording';
  end if;
  return new;
 end if;
 object_name:=case when tg_op='DELETE' then old.name else new.name end;
 if object_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]wav$' then raise sqlstate '42501';end if;
 select * into stage from erp_private.ptt_recording_uploads where id=split_part(object_name,'.',1)::uuid for update;
 if stage.id is null or not exists(select from erp_comm_cost.cleanup_resource cr where cr.permit_id=stage.permit_id
  and cr.endpoint='discard_partial_upload' and cr.resource_id=stage.id::text and cr.closed_at is null) then raise sqlstate '42501';end if;
 if tg_op='DELETE' then
  if stage.expires_at>clock_timestamp() or not exists(select from erp_comm_cost.cleanup_attempt ca where ca.endpoint='discard_partial_upload'
    and ca.resource_id=stage.id::text and ca.attempt_id=stage.cleanup_attempt::text) then raise sqlstate '42501';end if;
  return old;
 end if;
 if stage.cleanup_attempt is not null or stage.expires_at<=clock_timestamp() then raise sqlstate '42501'; end if;
 return new;
end $$;
revoke all on function erp_private.ptt_recording_storage_fence() from public,anon,authenticated,service_role;
create trigger erp_ptt_recording_stage_insert before insert on storage.objects for each row when(new.bucket_id='erp-ptt-recordings') execute function erp_private.ptt_recording_storage_fence();
create trigger erp_ptt_recording_immutable_update before update on storage.objects for each row when(old.bucket_id='erp-ptt-recordings' or new.bucket_id='erp-ptt-recordings') execute function erp_private.ptt_recording_storage_fence();
create trigger erp_ptt_recording_stage_delete before delete on storage.objects for each row when(old.bucket_id='erp-ptt-recordings') execute function erp_private.ptt_recording_storage_fence();
-- The staging tombstone is never shared with a committed recording. An ambiguous
-- finalization can therefore be resolved without deleting confirmed, retained bytes.
create function public.erp_ptt_recording_cleanup_v1(p_done uuid default null,p_poll uuid default null,p_attempt uuid default null,p_absent boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare stage erp_private.ptt_recording_uploads; worker_id uuid;
begin
 if p_done is null then worker_id:=erp_private.ptt_take_recording_poll(p_poll);end if;
 perform erp_private.ptt_lock();
 if p_done is not null then
  select * into stage from erp_private.ptt_recording_uploads where id=p_done for update;
  if p_absent is not true or p_attempt is null or stage.id is null or stage.cleanup_attempt is distinct from p_attempt
   or stage.expires_at>clock_timestamp() or exists(select from storage.objects where bucket_id='erp-ptt-recordings' and name=p_done::text||'.wav')
   or exists(select from erp_private.ptt_recordings where object_id=p_done) then return jsonb_build_object('confirmed',false);end if;
  if (erp_comm_cost.cleanup('confirm_cleanup',jsonb_build_object('permitId',stage.permit_id,'endpoint','discard_partial_upload',
    'resourceId',stage.id,'attemptId',p_attempt))->>'ok')::boolean is not true then return jsonb_build_object('confirmed',false);end if;
  delete from erp_private.ptt_recording_uploads where id=p_done;
  return jsonb_build_object('confirmed',true);
 end if;
 update erp_private.ptt_recording_uploads u set cleanup_after=clock_timestamp()+interval '1 minute',
  cleanup_attempt=gen_random_uuid()
  where id=(select candidate.id from erp_private.ptt_recording_uploads candidate
    join erp_comm_cost.ptt_drain_hold h on h.permit_id=candidate.permit_id and h.worker=worker_id
    where candidate.cleanup_after<=clock_timestamp() and candidate.expires_at<=clock_timestamp() order by candidate.cleanup_after,candidate.id limit 1)
  returning * into stage;
  if stage.id is null then
   -- An earlier storage attempt can still be waiting for its bounded retry.
   update erp_private.ptt_worker_cycles c set recording_blocked=true where c.poll=p_poll and exists(
    select from erp_private.ptt_recording_uploads u join erp_comm_cost.ptt_drain_hold h on h.permit_id=u.permit_id
    where h.worker=worker_id and u.cleanup_attempt is not null and u.expires_at<=clock_timestamp());
   return null;
  end if;
  return jsonb_build_object('objectId',stage.id,'permitId',stage.permit_id,'attemptId',stage.cleanup_attempt,'absent',not exists(select from storage.objects where bucket_id='erp-ptt-recordings' and name=stage.id::text||'.wav'));
end $$;
revoke all on function erp_private.ptt_record_source(),erp_private.ptt_record_state(erp_private.ptt_recordings,erp_private.ptt_leases),
 public.erp_ptt_recording_v1(jsonb,uuid),public.erp_ptt_recording_cleanup_v1(uuid,uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.erp_ptt_recording_v1(jsonb,uuid) to authenticated;
grant execute on function public.erp_ptt_recording_cleanup_v1(uuid,uuid,uuid,boolean) to service_role;
create function erp_private.notification_ptt_target(source uuid,recipient bigint) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('kind','ptt','id',source,'channelId',l.channel_id,'pushEligible',coalesce(f.availability='busy' and not f.stopped,false))
 from erp_private.ptt_recording_receipts x join erp_private.ptt_recordings r on r.lease_id=x.lease_id and r.verified_at is not null
 join erp_private.ptt_leases l on l.id=r.lease_id join erp_private.ptt_channels c on c.id=l.channel_id
 join erp_private.ptt_current_memberships m on m.id=x.episode and m.left_at is null and m.joined_at<=l.started_at
 left join erp_private.ptt_phones f on f.profile_id=m.profile_id where x.lease_id=source and m.profile_id=recipient and x.busy_at_send
 and not erp_private.comms_moderation_hidden('ptt_transmission',source) and erp_private.chat_active(recipient) and (c.kind<>'direct' or not erp_private.comms_pair_blocked(c.direct_low,c.direct_high))
$$;
revoke all on function erp_private.notification_ptt_target(uuid,bigint) from public,anon,authenticated,service_role;
commit;
