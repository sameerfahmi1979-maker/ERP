-- Optional approved pilot shared-host prepayment. Installs no funding, evidence,
-- owner decision, host, provider, worker or feature. No monetary guard is relaxed.
begin;
alter table erp_comm_cost.reservation add column host_deployment_id uuid;
create table erp_comm_cost.host_window (
 funding_permit uuid primary key references erp_comm_cost.reservation(permit_id),
 approval_id uuid not null unique references erp_comm_cost.baseline_approval_receipt(approval_id),
 deployment_id uuid not null,
 starts_at timestamptz not null,admission_ends_at timestamptz not null,ends_at timestamptz not null,
 cpu_count integer not null check(cpu_count=24),memory_bytes bigint not null check(memory_bytes=24000000000),
 max_operations integer not null check(max_operations between 1 and 256),
 host_evidence text not null check(length(trim(host_evidence)) between 1 and 2048),
 enabled boolean not null default false,
 check(isfinite(starts_at) and admission_ends_at=starts_at+interval '1 hour' and ends_at=admission_ends_at+interval '1 hour'
   and ends_at<='2026-11-30T19:59:00Z'::timestamptz)
);
-- Exact server command classes avoid pricing read/status calls as a new 50 MiB
-- object. Once a feature has command profiles, unmatched commands fail closed;
-- the old feature-wide envelope cannot become a cheap wildcard fallback.
create table erp_comm_cost.command_envelope (
 scope text not null references erp_comm_cost.scope(name),feature erp_comm_cost.feature not null,
 command_op text not null check(command_op='@transport' or command_op~'^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*){1,3}$'),
 template_id text not null references erp_comm_cost.proof(operation_id),enabled boolean not null default false,
 primary key(scope,feature,command_op)
);
create index command_envelope_template on erp_comm_cost.command_envelope(template_id);
create function erp_comm_cost.enroll_command_envelope() returns trigger language plpgsql set search_path='' as $$
begin
 perform 1 from erp_comm_cost.authority where singleton for update;
 if not exists(select from erp_comm_cost.proof p where p.operation_id=new.template_id and p.scope=new.scope and p.feature=new.feature
   and p.valid_until>clock_timestamp() and p.operational_stop_by>clock_timestamp() and erp_comm_cost.retention_covered(p))
   or exists(select from erp_comm_cost.reservation r where r.operation_id=new.template_id) then
   raise sqlstate '22023' using message='Exact command envelope requires matching private unconsumed proof';
 end if;
 return new;
end $$;
create trigger command_envelope_enrollment before insert or update on erp_comm_cost.command_envelope for each row execute function erp_comm_cost.enroll_command_envelope();
create function erp_comm_cost.host_window_funded(w erp_comm_cost.host_window,p_admit boolean default true)
returns boolean language sql volatile set search_path='' as $$
 select coalesce((not p_admit or w.enabled) and w.starts_at<=clock_timestamp() and w.ends_at>clock_timestamp()
 and exists(select from erp_comm_cost.reservation r join erp_comm_cost.proof p using(operation_id)
   join erp_comm_cost.approval a on a.id=r.approval_id
   cross join erp_comm_cost.authority o
   join erp_comm_cost.baseline_approval_receipt br on br.approval_id=a.id
   join public.user_profiles u on u.auth_user_id=a.owner_auth_id
   where r.permit_id=w.funding_permit and r.approval_id=w.approval_id and p.approval_id=a.id
   and r.scope='communications' and r.feature='chat' and r.consumed_at is not null and r.settled_at is null
   and r.reserved_micros>=2400000 and (r.host_deployment_id is null or r.host_deployment_id=w.deployment_id)
   and p.operational_stop_by>=w.ends_at and p.valid_until>=w.ends_at
   and a.scope='communications' and a.currency='USD' and a.max_micros=5000000
   and a.approved_at<=clock_timestamp() and a.step_up_at between a.approved_at-interval '5 minutes' and a.approved_at
   and a.ends_at>=w.ends_at and a.ends_at<='2026-11-30T19:59:00Z'::timestamptz
   and br.owner_auth_id=a.owner_auth_id and br.approved_at=a.approved_at and br.confirmed_at between a.approved_at and clock_timestamp()
   and br.fingerprint=erp_comm_cost.baseline_approval_fingerprint(a)
   and (not p_admit or (o.owner_auth_id=a.owner_auth_id and a.revoked_at is null and u.status='active' and not u.must_change_password))
   and not exists(select from erp_comm_cost.meter m where m.operation_id=p.operation_id and lower(ltrim(m.evidence_id)) like 'prepaid-host:%')
   and (select coalesce(sum(m.upper_micros),0) from erp_comm_cost.meter m where m.operation_id=p.operation_id and m.dimension='railway')>=2400000
   and (select count(*)=3 and bool_and((not p_admit or (c.enabled and c.valid_from<=clock_timestamp() and c.valid_until>=w.ends_at))
     and h.units>=case c.unit when 'funded_host_wall_seconds' then 7200::numeric when 'funded_host_cpu_seconds' then 172800::numeric
       when 'funded_host_ram_byte_seconds' then 172800000000000::numeric end)
     from erp_comm_cost.unit_hold h join erp_comm_cost.capacity c on c.id=h.capacity_id
     where h.permit_id=r.permit_id and c.dimension='railway'
       and c.unit in('funded_host_wall_seconds','funded_host_cpu_seconds','funded_host_ram_byte_seconds'))),false)
$$;
create function erp_comm_cost.enroll_host_window() returns trigger language plpgsql set search_path='' as $$
declare r erp_comm_cost.reservation%rowtype;
begin
 perform 1 from erp_comm_cost.authority where singleton for update;
 if tg_op='UPDATE' then
   if (to_jsonb(new)-'enabled') is distinct from (to_jsonb(old)-'enabled') or (new.enabled and not old.enabled) then
     raise sqlstate '22023' using message='Immutable prepaid host window';
   end if;
   return new;
 end if;
 select * into r from erp_comm_cost.reservation where permit_id=new.funding_permit for update;
 if not new.enabled or r.permit_id is null or r.consumed_at is not null or r.settled_at is not null or r.expires_at<=clock_timestamp()
   or r.actor_session is not null or r.command_hash is not null or r.actor_id<>'pilot-commissioner'
   or exists(select from erp_comm_cost.pause where scope=r.scope and feature=r.feature) then
   raise sqlstate '22023' using message='Unfunded or invalid private host commissioning reservation';
 end if;
 -- This is a private service commissioning effect, not an impersonated user command.
 -- The actual owner grant and its authenticated immutable receipt remain mandatory.
 update erp_comm_cost.reservation set consumed_at=clock_timestamp(),consumed_xid=pg_current_xact_id() where permit_id=r.permit_id;
 if not erp_comm_cost.host_window_funded(new) then
   raise sqlstate '22023' using message='Actual owner USD 5 approval and full positive host funding required';
 end if;
 return new;
end $$;
create trigger host_window_enrollment before insert or update on erp_comm_cost.host_window for each row execute function erp_comm_cost.enroll_host_window();
create table erp_comm_cost.host_proof_link (
 operation_id text primary key references erp_comm_cost.proof(operation_id),
 funding_permit uuid not null references erp_comm_cost.host_window(funding_permit)
);
create function erp_comm_cost.immutable_host_link() returns trigger language plpgsql set search_path='' as $$
begin raise sqlstate '22023' using message='Immutable shared host proof funding';end $$;
create trigger host_link_immutable before update or delete on erp_comm_cost.host_proof_link for each row execute function erp_comm_cost.immutable_host_link();

create function erp_comm_cost.host_operation_covered(p_operation text,p_approval uuid,p_deployment uuid,p_admit boolean)
returns boolean language plpgsql volatile set search_path='' as $$
declare m record;w erp_comm_cost.host_window%rowtype;found_reference boolean:=false;linked uuid;
begin
 select funding_permit into linked from erp_comm_cost.host_proof_link where operation_id=p_operation;
 for m in select mm.*,c.unit,c.enabled,c.valid_from as slot_from,c.valid_until as slot_until,c.available_units,c.billing_account
   from erp_comm_cost.meter mm join erp_comm_cost.capacity c on c.id=mm.capacity_id
   where mm.operation_id=p_operation and lower(ltrim(mm.evidence_id)) like 'prepaid-host:%'
 loop
   found_reference:=true;
   if m.evidence_id !~ '^prepaid-host:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or m.dimension<>'railway' or m.unit<>'prepaid_host_operation_slots' or m.upper_micros<>0 or m.upper_units<>1
     or p_deployment is null or p_approval is null or linked is distinct from substring(m.evidence_id from 14)::uuid then return false;end if;
   select * into w from erp_comm_cost.host_window where funding_permit=substring(m.evidence_id from 14)::uuid;
   if w.funding_permit is null or w.approval_id<>p_approval or w.deployment_id<>p_deployment
     or (p_admit and clock_timestamp()>=w.admission_ends_at) or not erp_comm_cost.host_window_funded(w,p_admit)
     or (p_admit and (not m.enabled or m.slot_from>clock_timestamp() or m.slot_until<w.ends_at or m.available_units>w.max_operations
       or (select coalesce(sum(h.units),0) from erp_comm_cost.unit_hold h join erp_comm_cost.reservation r on r.permit_id=h.permit_id
         where h.capacity_id=m.capacity_id and r.operation_id<>p_operation)+m.upper_units>m.available_units))
     -- A consumed control already owns one immutable held slot. Lowering a
     -- current admission ceiling/observation must not revoke its prepaid tail.
     or (not p_admit and not exists(select from erp_comm_cost.reservation r join erp_comm_cost.unit_hold h on h.permit_id=r.permit_id
       where r.operation_id=p_operation and r.approval_id=p_approval and r.host_deployment_id=p_deployment
         and r.settled_at is null and h.capacity_id=m.capacity_id and h.units=1))
     or not exists(select from erp_comm_cost.proof p where p.operation_id=p_operation and p.approval_id=w.approval_id
       and greatest(p.operational_stop_by,p.liability_ends_at)<=w.ends_at)
     or not exists(select from erp_comm_cost.meter e join erp_comm_cost.capacity c on c.id=e.capacity_id
       where e.operation_id=p_operation and e.dimension='railway' and c.dimension='railway' and c.unit='network_egress_bytes'
       and e.upper_units>0 and e.upper_micros>0 and e.evidence_id not like 'prepaid-host:%') then return false;end if;
 end loop;
 -- Legacy genuine included/zero-cost proofs are unchanged. Only the exact typed
 -- reference opts into shared funding. All original money/evidence/unit checks run.
 return linked is null or found_reference;
end $$;
create function erp_comm_cost.host_reservation_covered(r erp_comm_cost.reservation)
returns boolean language sql volatile set search_path='' as $$
 select erp_comm_cost.host_operation_covered(r.operation_id,r.approval_id,r.host_deployment_id,false)
$$;

do $patch_host$
declare source text;needle text;replacement text;
begin
 source:=pg_get_functiondef('erp_comm_cost.command(text,jsonb)'::regprocedure);
 needle:='if exists(select from erp_comm_cost.standing_envelope s where s.template_id=op) then';
 if position(needle in source)=0 then raise exception 'Unexpected template identity source';end if;
 source:=replace(source,needle,'if exists(select from erp_comm_cost.standing_envelope s where s.template_id=op) or exists(select from erp_comm_cost.command_envelope ce where ce.template_id=op) then');
 needle:='select s.template_id into source_op from erp_comm_cost.standing_envelope s
      where s.scope=sc and s.feature=f and s.enabled for share;';
 if position(needle in source)=0 then raise exception 'Unexpected feature envelope source';end if;
 source:=replace(source,needle,'select ce.template_id into source_op from erp_comm_cost.command_envelope ce
      where ce.scope=sc and ce.feature=f and ce.enabled and ce.command_op=coalesce(p_payload#>>''{binding,command,op}'',''@transport'') for share;
    if source_op is null then
      if exists(select from erp_comm_cost.command_envelope ce where ce.scope=sc and ce.feature=f) then
        return jsonb_build_object(''ok'',false,''reason'',''command_profile_unavailable'');
      end if;
      '||needle||'
    end if;');
 needle:='if p.valid_until<=n or p.operational_stop_by<=n then';
 if position(needle in source)=0 then raise exception 'Unexpected reserve source';end if;
 source:=replace(source,needle,'if not erp_comm_cost.host_operation_covered(source_op,p.approval_id,nullif(p_payload->>''hostDeploymentId'','''')::uuid,true) then return jsonb_build_object(''ok'',false,''reason'',''host_window_unavailable'');end if; '||needle);
 needle:='floor_micros,reserved_micros,issued_at,expires_at,actor_session,command_hash)';
 if position(needle in source)=0 then raise exception 'Unexpected reservation columns';end if;
 source:=replace(source,needle,'floor_micros,reserved_micros,issued_at,expires_at,actor_session,command_hash,host_deployment_id)');
 needle:='n,cutoff,bound_session,bound_hash) returning * into r;';
 if position(needle in source)=0 then raise exception 'Unexpected reservation values';end if;
 source:=replace(source,needle,'n,cutoff,bound_session,bound_hash,nullif(p_payload->>''hostDeploymentId'','''')::uuid) returning * into r;');
 needle:='insert into erp_comm_cost.cleanup_limit(operation_id,endpoint,max_resources,max_attempts)';
 if position(needle in source)=0 then raise exception 'Unexpected standing clone source';end if;
 source:=replace(source,needle,'insert into erp_comm_cost.host_proof_link(operation_id,funding_permit) select op,l.funding_permit from erp_comm_cost.host_proof_link l where l.operation_id=source_op; '||needle);
 -- A host prepayment cannot be settled while its prepaid window may still run.
 needle:='if p_command=''settle'' then';
 if position(needle in source)=0 then raise exception 'Unexpected settlement source';end if;
 source:=replace(source,needle,needle||' if exists(select from erp_comm_cost.host_window hw where hw.funding_permit=(p_payload->>''permitId'')::uuid and hw.ends_at>clock_timestamp()) then return jsonb_build_object(''ok'',false,''reason'',''settlement_unconfirmed'');end if;');
 execute source;
 source:=pg_get_functiondef('erp_comm_cost.take_service_permit(uuid,text,text,text,uuid,jsonb)'::regprocedure);
 needle:='if r.permit_id is null or r.consumed_at is not null';
 if position(needle in source)=0 then raise exception 'Unexpected permit consumption source';end if;
 execute replace(source,needle,'if not erp_comm_cost.host_reservation_covered(r) or r.permit_id is null or r.consumed_at is not null');
 source:=pg_get_functiondef('erp_comm_cost.debit_control(text,text,uuid,text)'::regprocedure);
 needle:='if p.permit_id is null or (k in';
 if position(needle in source)=0 then raise exception 'Unexpected prepaid control source';end if;
 execute replace(source,needle,'if not exists(select from erp_comm_cost.reservation rr where rr.permit_id=p.permit_id and erp_comm_cost.host_reservation_covered(rr)) then return null;end if; '||needle);
end $patch_host$;
alter table erp_comm_cost.host_window enable row level security;
alter table erp_comm_cost.command_envelope enable row level security;
alter table erp_comm_cost.host_proof_link enable row level security;
revoke all on erp_comm_cost.host_window,erp_comm_cost.host_proof_link,erp_comm_cost.command_envelope from public,anon,authenticated,service_role;
revoke all on function erp_comm_cost.host_window_funded(erp_comm_cost.host_window,boolean),erp_comm_cost.enroll_host_window(),
 erp_comm_cost.enroll_command_envelope(),erp_comm_cost.immutable_host_link(),erp_comm_cost.host_operation_covered(text,uuid,uuid,boolean),erp_comm_cost.host_reservation_covered(erp_comm_cost.reservation)
 from public,anon,authenticated,service_role;
commit;
