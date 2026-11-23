-- SOS follows a logical PTT phone and an explicitly selected group, independently of media.
begin;
set local lock_timeout='5s';

create table erp_private.ptt_sos_events (
  id uuid primary key,
  seq bigint generated always as identity unique,
  incident_id uuid not null references erp_private.ptt_sos_events(id),
  channel_id uuid not null references erp_private.ptt_channels(id),
  sender_id bigint not null references public.user_profiles(id),
  is_cancellation boolean not null,
  created_at timestamptz not null default clock_timestamp(),
  location jsonb,
  command_hash bytea,
  unique(incident_id,is_cancellation),
  check ((not is_cancellation and id=incident_id and command_hash is not null)
      or (is_cancellation and id<>incident_id and location is null and command_hash is null))
);
create index ptt_sos_history on erp_private.ptt_sos_events(channel_id,seq desc);

-- Each original membership episode reserves at most one current phone for each notice.
-- No recipient response, receipt, GPS stream or phone contact details are recorded.
create table erp_private.ptt_sos_audience (
  incident_id uuid references erp_private.ptt_sos_events,
  episode bigint references erp_private.ptt_memberships,

  push_original boolean not null,
  push_cancellation boolean not null default false,
  primary key(incident_id,episode)
);
alter table erp_private.ptt_sos_events enable row level security;
alter table erp_private.ptt_sos_audience enable row level security;
revoke all on erp_private.ptt_sos_events,erp_private.ptt_sos_audience from public,anon,authenticated,service_role;

-- A16 replaces this hook when its policy migration is installed.
do $stub$ begin
 if to_regprocedure('erp_private.comms_moderation_hidden(text,uuid)') is null then
  execute 'create function erp_private.comms_moderation_hidden(text,uuid) returns boolean language sql stable set search_path='''' as ''select false''';
 end if;
end $stub$;
revoke all on function erp_private.comms_moderation_hidden(text,uuid) from public,anon,authenticated,service_role;

create function erp_private.sos_push_allowed(p bigint) returns boolean language sql stable set search_path='' as $$
 select exists(select from erp_private.ptt_phones f where f.profile_id=p and not f.stopped
   and f.availability in ('available','busy') and erp_private.provider_actor_session_valid(p,f.auth_session));
$$;

-- A confirmed takeover may replace the eligible phone. The unique installation/profile pair
-- and the unique phone/profile ensure the prepaid slot can never expand into multi-device fan-out.
create function erp_private.sos_device(p bigint) returns uuid[] language sql stable set search_path='' as $$
 select array(select d.id from erp_private.ptt_phones f join erp_private.notification_devices d
   on d.profile_id=f.profile_id and d.installation=f.device_id and d.session_id=f.auth_session
   where f.profile_id=p and not f.stopped and f.availability in ('available','busy')
     and erp_private.provider_actor_session_valid(p,f.auth_session))
$$;

create function erp_private.notification_sos_target(source uuid,recipient bigint) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('kind','sos','id',e.id,'channelId',e.channel_id,'createdAt',e.created_at,
   'action',case when e.is_cancellation then 'cancelled' else 'original' end,
   'pushEligible',case when e.is_cancellation then a.push_cancellation else a.push_original end
                  and erp_private.sos_push_allowed(recipient) and not c.archived)
 from erp_private.ptt_sos_events e join erp_private.ptt_sos_audience a on a.incident_id=e.incident_id
 join erp_private.ptt_memberships m on m.id=a.episode and m.profile_id=recipient and m.left_at is null
 join erp_private.ptt_channels c on c.id=e.channel_id
 where e.id=source and erp_private.chat_active(recipient)
   and not erp_private.comms_moderation_hidden('ptt_sos',e.id)
$$;

create function erp_private.sos_history(a jsonb, actor bigint) returns jsonb language plpgsql set search_path='' as $$
declare c uuid:=(a->>'channelId')::uuid; mode text:=a->>'mode'; before_seq bigint:=(a->>'cursor')::bigint;
 target uuid:=(a->>'eventId')::uuid; items jsonb; more text;
begin
 if not (a ?& array['mode','channelId']) or a-array['channelId','mode','cursor','eventId']<>'{}'
    or mode not in ('participant','review') or (a?'eventId' and a?'cursor') then raise sqlstate '22023'; end if;
 if erp_private.ptt_history_allowed(c,clock_timestamp(),mode) is not true then raise insufficient_privilege; end if;
 with page as materialized (
   select e.seq,jsonb_build_object('id',e.id,'incidentId',e.incident_id,'channelId',c,'createdAt',e.created_at,
     'senderProfileId',e.sender_id::text,'sender',coalesce(nullif(u.display_name,''),u.full_name,'ERP user'),
     'mine',actor=e.sender_id,'action',case when e.is_cancellation then 'cancelled' else 'original' end,
     'location',e.location) as row
   from erp_private.ptt_sos_events e join erp_private.ptt_sos_events o on o.id=e.incident_id
   join public.user_profiles u on u.id=e.sender_id
   where e.channel_id=c and (before_seq is null or e.seq<before_seq) and (target is null or e.id=target)
    and erp_private.ptt_history_allowed(c,o.created_at,mode)
    and (mode='review' or not erp_private.comms_moderation_hidden('ptt_sos',e.id))
   order by e.seq desc limit 41
 ), visible as (select * from page order by seq desc limit 40)
 select coalesce(jsonb_agg(row order by seq desc),'[]'),case when (select count(*) from page)>40 then min(seq)::text end
 into items,more from visible;
 return jsonb_build_object('items',items,'nextCursor',more);
end $$;

create function erp_private.sos_location(value jsonb) returns jsonb language plpgsql set search_path='' as $$
declare t timestamptz;
begin
 if value is null then return null; end if;
 if jsonb_typeof(value) is distinct from 'object' or not (value ?& array['latitude','longitude','accuracyM','capturedAt'])
   or value-array['latitude','longitude','accuracyM','capturedAt'] <> '{}' or jsonb_typeof(value->'latitude')<>'number'
   or jsonb_typeof(value->'longitude')<>'number' or jsonb_typeof(value->'accuracyM')<>'number'
   or jsonb_typeof(value->'capturedAt')<>'string' then raise sqlstate '22023'; end if;
 t:=(value->>'capturedAt')::timestamptz;
 if not isfinite(t) or t<clock_timestamp()-interval '60 seconds' or t>clock_timestamp()+interval '2 seconds'
    or (value->>'latitude')::numeric not between -90 and 90 or (value->>'longitude')::numeric not between -180 and 180
    or (value->>'accuracyM')::numeric<0 then return null; end if;
 return value;
end $$;

create function erp_private.sos_dispatch(p_request jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare op text:=p_request->>'op'; a jsonb:=p_request->'args'; actor bigint:=erp_private.comms_actor_id();
 c uuid:=(a->>'channelId')::uuid; incident uuid:=(a->>'incidentId')::uuid; epoch uuid:=(a->>'epoch')::uuid;
 permit uuid:=(p_request->>'_budgetPermitId')::uuid; original erp_private.ptt_sos_events;
 source uuid; snapshot jsonb; audience jsonb; n integer; fingerprint bytea; permitted_keys text[];
begin
 if jsonb_typeof(a) is distinct from 'object' or jsonb_typeof(p_request) is distinct from 'object'
    or p_request-array['op','args','_budgetPermitId','_lookupOnly']<>'{}' or (p_request?'_lookupOnly' and (op<>'sos.send' or p_request->'_lookupOnly'<>'true'::jsonb or permit is not null)) or c is null
    or op is null or op not in ('sos.send','sos.cancel','sos.status','sos.history') then raise sqlstate '22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('comms-scope-v1',0));
 perform erp_private.ptt_lock();
 if op='sos.history' then
   perform erp_comm_cost.take_permit(permit,'sos','communications',actor::text,p_request-'_budgetPermitId');
   return erp_private.sos_history(a,actor);
 end if;
 permitted_keys:=array['epoch','channelId','incidentId'];
 if op='sos.send' then permitted_keys:=permitted_keys||array['location']; end if;
 if epoch is null or incident is null or a-permitted_keys<>'{}' then raise sqlstate '22023'; end if;
 perform erp_private.ptt_require_phone(epoch);
 if not exists(select from erp_private.ptt_channels ch join erp_private.ptt_memberships m on m.channel_id=ch.id
    where ch.id=c and ch.kind='group' and m.profile_id=actor and m.left_at is null
    and (op='sos.status' or not ch.archived)) then raise insufficient_privilege; end if;
 select * into original from erp_private.ptt_sos_events where id=incident and not is_cancellation
    and sender_id=actor and channel_id=c and erp_private.ptt_history_allowed(c,created_at,'participant');
 if op='sos.status' then
   -- Sender-only reconciliation reveals no content or historical list. It never publishes.
   return jsonb_build_object('incidentId',incident,'state',case when original.id is null then 'unknown'
      when exists(select from erp_private.ptt_sos_events where incident_id=incident and is_cancellation) then 'cancelled' else 'recorded' end);
 end if;
 if op='sos.send' then
   perform erp_private.comms_require_terms();
   fingerprint:=sha256(convert_to(a::text,'UTF8'));
   if original.id is not null then
     if original.command_hash<>fingerprint then raise sqlstate 'PT409'; end if;
     return jsonb_build_object('incidentId',incident,'state',case when exists(select from erp_private.ptt_sos_events
        where incident_id=incident and is_cancellation) then 'cancelled' else 'recorded' end);
   end if;
   if p_request?'_lookupOnly' then return jsonb_build_object('incidentId',incident,'state','unknown'); end if;
   perform erp_comm_cost.take_permit(permit,'sos','communications',actor::text,p_request-'_budgetPermitId');
   snapshot:=erp_private.sos_location(a->'location');
   -- Take a single consistent membership/device snapshot and certify it BEFORE any retention/fan-out write.
   select coalesce(jsonb_agg(to_jsonb(member)),'[]'),count(*)::int
    into audience,n
    from (select m.id as episode,
        erp_private.sos_push_allowed(m.profile_id) as push_original
      from erp_private.ptt_memberships m where m.channel_id=c and m.left_at is null and m.profile_id<>actor
        and erp_private.chat_active(m.profile_id)) member;
   perform erp_comm_cost.require_sos_envelope(permit,n,n);
   insert into erp_private.ptt_sos_events(id,incident_id,channel_id,sender_id,is_cancellation,location,command_hash)
    values(incident,incident,c,actor,false,snapshot,fingerprint);
   insert into erp_private.ptt_sos_audience(incident_id,episode,push_original)
    select incident,s.episode,s.push_original from jsonb_to_recordset(audience)
      as s(episode bigint,push_original boolean);
   source:=incident;
 else
   if original.id is null then raise insufficient_privilege; end if;
   -- Every admitted original reserves precisely one append and its bounded notification fan-out.
   select id into source from erp_private.ptt_sos_events where incident_id=incident and is_cancellation;
   if found then return jsonb_build_object('incidentId',incident,'state','cancelled'); end if;
   insert into erp_private.ptt_sos_events(id,incident_id,channel_id,sender_id,is_cancellation)
    values(gen_random_uuid(),incident,c,actor,true) returning id into source;
   update erp_private.ptt_sos_audience aud set push_cancellation=erp_private.sos_push_allowed(m.profile_id)
    from erp_private.ptt_memberships m where aud.incident_id=incident and m.id=aud.episode and m.left_at is null;
 end if;
 perform erp_private.notification_enqueue('sos',source,m.profile_id,
    case when (case when op='sos.send' then aud.push_original else aud.push_cancellation end)
      then erp_private.sos_device(m.profile_id) else '{}'::uuid[] end)
  from erp_private.ptt_sos_audience aud join erp_private.ptt_memberships m on m.id=aud.episode and m.left_at is null
  where aud.incident_id=incident;
 return jsonb_build_object('incidentId',incident,'state',case when op='sos.send' then 'recorded' else 'cancelled' end);
end $$;

create function public.erp_sos_v1(p_request jsonb) returns jsonb language sql security definer set search_path='' as $$
 select erp_private.sos_dispatch(p_request)
$$;
revoke all on function erp_private.sos_push_allowed(bigint),erp_private.sos_device(bigint),erp_private.notification_sos_target(uuid,bigint),
 erp_private.sos_history(jsonb,bigint),erp_private.sos_location(jsonb),erp_private.sos_dispatch(jsonb),public.erp_sos_v1(jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.erp_sos_v1(jsonb) to authenticated;
commit;
