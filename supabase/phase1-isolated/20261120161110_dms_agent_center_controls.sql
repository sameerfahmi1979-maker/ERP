begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- No worker bindings are seeded. A binding requires a reviewed write path that
-- checks the private gate in the same transaction as its business operation.
create table erp_private.dms_agent_center_controls (
  company_id bigint not null references public.owner_companies(id),
  branch_id bigint references public.branches(id),
  agent_key text not null check (agent_key in ('dms.intake', 'dms.extraction', 'dms.validation', 'dms.erp-linking',
    'dms.catalog-quality', 'dms.document-search', 'dms.expiry-renewal')),
  enabled boolean not null default false,
  paused boolean not null default false,
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  mode text not null default 'observe' check (mode in ('observe', 'recommend', 'execute')),
  worker_bound boolean not null default false,
  unique nulls not distinct (company_id, branch_id, agent_key),
  check (not paused or enabled),
  check (not enabled or worker_bound)
);

create table erp_private.dms_agent_center_control_events (
  actor_auth_id uuid not null,
  request_id uuid not null,
  company_id bigint not null,
  branch_id bigint,
  agent_key text not null,
  action text not null check (action in ('on', 'off', 'pause', 'resume')),
  expected_revision bigint not null,
  reason text not null check (length(reason) <= 500 and btrim(reason) <> ''),
  before_state jsonb not null,
  after_state jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (actor_auth_id, request_id)
);

alter table erp_private.dms_agent_center_controls enable row level security;
alter table erp_private.dms_agent_center_control_events enable row level security;
revoke all on erp_private.dms_agent_center_controls, erp_private.dms_agent_center_control_events
  from public, anon, authenticated, service_role;

create function erp_private.dms_agent_center_control(
  p_company bigint, p_branch bigint, p_agent text, p_action text,
  p_expected_revision bigint, p_request uuid, p_reason text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
  state erp_private.dms_agent_center_controls%rowtype;
  recorded erp_private.dms_agent_center_control_events%rowtype;
  before_state jsonb;
  after_state jsonb;
  new_enabled boolean;
  new_paused boolean;
begin
  if actor is null or erp_private.business_principal_is_active() is not true then
    if p_action = 'inspect' then return null; end if;
    raise exception 'Agent control access denied' using errcode = '42501';
  end if;

  if p_action = 'inspect' then
    if not (erp_private.permission_in_scope('dms.documents.view', p_company, p_branch) is true
        or erp_private.permission_in_scope('dms.admin', p_company, p_branch) is true) then
      return null;
    end if;
    select c.* into state
    from erp_private.dms_agent_center_controls c
    join public.owner_companies o on o.id = c.company_id and o.status = 'active'
    where c.company_id = p_company and c.branch_id is not distinct from p_branch and c.agent_key = p_agent
      and (p_branch is null or exists (select 1 from public.branches b
        where b.id = p_branch and b.owner_company_id = p_company and b.status = 'active'));
    if not found then return null; end if;
    return jsonb_build_object('enabled', state.enabled, 'paused', state.paused,
      'revision', state.revision, 'mode', state.mode, 'workerBound', state.worker_bound);
  end if;

  if erp_private.permission_in_scope('dms.admin', p_company, p_branch) is not true then
    raise exception 'Agent control access denied' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('on', 'off', 'pause', 'resume')
      or p_expected_revision is null or p_expected_revision not between 0 and 9007199254740991
      or p_request is null or p_reason is null or length(p_reason) > 500 or btrim(p_reason) = '' then
    raise exception 'Invalid agent control request' using errcode = '22023';
  end if;

  -- Establish the real, active scope before locking and changing its lane.
  perform 1 from public.owner_companies o where o.id = p_company and o.status = 'active' for share;
  if not found then raise exception 'Agent control scope unavailable' using errcode = '42501'; end if;
  if p_branch is not null then
    perform 1 from public.branches b
    where b.id = p_branch and b.owner_company_id = p_company and b.status = 'active' for share;
    if not found then raise exception 'Agent control scope unavailable' using errcode = '42501'; end if;
  end if;
  select c.* into state from erp_private.dms_agent_center_controls c
  where c.company_id = p_company and c.branch_id is not distinct from p_branch and c.agent_key = p_agent
  for update;
  if not found then raise exception 'Agent control scope unavailable' using errcode = '42501'; end if;
  if erp_private.permission_in_scope('dms.admin', p_company, p_branch) is not true then
    raise exception 'Agent control access denied' using errcode = '42501';
  end if;

  -- First reconcile a repeated request under the current authority. Its
  -- immutable receipt remains valid after a subsequent successful command.
  select e.* into recorded from erp_private.dms_agent_center_control_events e
  where e.actor_auth_id = actor and e.request_id = p_request;
  if found then
    if (recorded.company_id, recorded.branch_id, recorded.agent_key, recorded.action, recorded.expected_revision, recorded.reason)
      is distinct from (p_company, p_branch, p_agent, p_action, p_expected_revision, p_reason) then
      raise exception 'Agent control request already used' using errcode = '23505';
    end if;
    return recorded.after_state;
  end if;
  if not state.worker_bound then
    raise exception 'Agent control unavailable for an unbound worker' using errcode = '55000';
  end if;
  if state.revision <> p_expected_revision then
    raise exception 'Agent control revision changed' using errcode = '40001';
  end if;
  if p_action in ('pause', 'resume') and not state.enabled then
    raise exception 'An enabled agent is required' using errcode = '55000';
  end if;

  before_state := jsonb_build_object('enabled', state.enabled, 'paused', state.paused,
    'revision', state.revision, 'mode', state.mode, 'workerBound', state.worker_bound);
  new_enabled := case p_action when 'on' then true when 'off' then false else state.enabled end;
  new_paused := case p_action when 'pause' then true when 'resume' then false when 'off' then false else state.paused end;
  after_state := before_state || jsonb_build_object('enabled', new_enabled, 'paused', new_paused, 'revision', state.revision + 1);

  -- A competing request for a different scope can share the client UUID. The
  -- audit key serializes that collision and the losing command changes no row.
  begin
    insert into erp_private.dms_agent_center_control_events
      (actor_auth_id, request_id, company_id, branch_id, agent_key, action, expected_revision, reason, before_state, after_state)
    values (actor, p_request, p_company, p_branch, p_agent, p_action, p_expected_revision, p_reason, before_state, after_state);
  exception when unique_violation then
    raise exception 'Agent control request already used' using errcode = '23505';
  end;

  update erp_private.dms_agent_center_controls c
  set enabled = new_enabled, paused = new_paused, revision = state.revision + 1
  where c.company_id = p_company and c.branch_id is not distinct from p_branch and c.agent_key = p_agent;
  return after_state;
end $function$;

create function public.dms_agent_center_control(
  p_company bigint, p_branch bigint, p_agent text, p_action text,
  p_expected_revision bigint, p_request uuid, p_reason text
) returns jsonb
language sql volatile security invoker set search_path = ''
as $function$
  select erp_private.dms_agent_center_control(p_company, p_branch, p_agent, p_action, p_expected_revision, p_request, p_reason)
$function$;

create function erp_private.dms_agent_center_lock_for_write(p_company bigint, p_branch bigint, p_agent text)
returns boolean
language plpgsql volatile security invoker set search_path = ''
as $function$
declare
  allowed boolean;
begin
  perform 1 from public.owner_companies o where o.id = p_company and o.status = 'active' for share;
  if not found then return false; end if;
  if p_branch is not null then
    perform 1 from public.branches b
    where b.id = p_branch and b.owner_company_id = p_company and b.status = 'active' for share;
    if not found then return false; end if;
  end if;
  select c.worker_bound and c.enabled and not c.paused and c.mode = 'execute' into allowed
  from erp_private.dms_agent_center_controls c
  where c.company_id = p_company and c.branch_id is not distinct from p_branch and c.agent_key = p_agent
  for share;
  return coalesce(allowed, false);
end $function$;

comment on function erp_private.dms_agent_center_lock_for_write(bigint,bigint,text) is
  'Call on the exact scope in the same transaction as the business write and write only on true. No existing runtime is bound or granted access.';
revoke all on function public.dms_agent_center_control(bigint,bigint,text,text,bigint,uuid,text) from public, anon, authenticated, service_role;
revoke all on function erp_private.dms_agent_center_control(bigint,bigint,text,text,bigint,uuid,text) from public, anon, authenticated, service_role;
revoke all on function erp_private.dms_agent_center_lock_for_write(bigint,bigint,text) from public, anon, authenticated, service_role;
grant execute on function public.dms_agent_center_control(bigint,bigint,text,text,bigint,uuid,text) to authenticated;
grant execute on function erp_private.dms_agent_center_control(bigint,bigint,text,text,bigint,uuid,text) to authenticated;

notify pgrst, 'reload schema';
commit;
