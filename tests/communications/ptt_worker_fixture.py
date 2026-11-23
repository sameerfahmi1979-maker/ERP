"""Finite funded worker in isolated PostgreSQL integration fixtures."""
import json
import uuid
import threading
WORKER="00000000-0000-4000-8000-0000000000aa"
BOOT="00000000-0000-4000-8000-0000000000bb"

class Worker:
    def __init__(self,sql):
        self.sql=sql
        self.lock=threading.Lock()

    def rpc(self,op,data):
        request=json.dumps(data)
        return json.loads(self.sql(f"set role service_role;select public.erp_ptt_provider_v1('{op}','{request}')"))

    def start(self):
        end=self.sql(f"select coalesce((select until_at from erp_comm_cost.worker_launch_ticket where boot='{BOOT}'),now()+interval '3 hours')::text")
        return self.rpc("startWorker",dict(worker=WORKER,boot=BOOT,until=end,maxPolls=16000))

    def fund(self):
        self.sql(f"""do $$
        declare expiry timestamptz:=date_trunc('second',now())+interval '4 hours'; actions int:=20000;
        ticket uuid; cap bigint; unit_name text;
        begin
        insert into erp_comm_cost.ptt_worker_fleet(singleton,max_instances,max_boots,busy_tick_seconds,restart_seconds,valid_until,enabled,bounded_fleet_evidence)
        values(true,1,2,30,5,expiry,true,'disposable synthetic plan');
        ticket:=public.fixture_chat_permit(1,'ptt_live',jsonb_build_object('op','budget.fundControl','kind','ptt_worker_poll','subject','{WORKER}','maxActions',actions,'endEpoch',extract(epoch from expiry)::bigint));
        update erp_comm_cost.proof set retained_at_zero_cost_evidence='fixture' where operation_id=ticket::text;
        foreach unit_name in array array['funded_ptt_worker_poll_actions','permanent_ledger_bytes'] loop
          insert into erp_comm_cost.capacity(billing_account,dimension,unit,valid_from,valid_until,available_units,enabled)
          values('worker fixture',case when unit_name='permanent_ledger_bytes' then 'database' else 'railway' end,unit_name,now(),expiry,2000000000,true) returning id into cap;
          insert into erp_comm_cost.unit_hold values(ticket,cap,1000000000);
        end loop;
        insert into erp_comm_cost.control_pool(permit_id,kind,subject,max_actions,valid_until,continuing_zero_evidence,poll_seconds,enabled)
        values(ticket,'ptt_worker_poll','{WORKER}',actions,expiry,'synthetic post-pause coverage',1,true);
        foreach unit_name in array array['railway','database'] loop
          insert into erp_comm_cost.capacity(billing_account,dimension,unit,valid_from,valid_until,available_units,enabled)
          values('worker fixture',unit_name,'funded_worker_registration_probes',now(),expiry,128,true) returning id into cap;
          insert into erp_comm_cost.unit_hold values(ticket,cap,64);
        end loop;
        insert into erp_comm_cost.worker_probe_plan values(ticket,1,10,2,expiry,'fixture bounds','plan includes overlap, rejected boots and retries',3,'finite funded standby delivery');
        insert into erp_comm_cost.worker_launch_ticket(boot,pool,deployment_id,not_before,register_by,until_at,poll_limit)
        select token,ticket,gen_random_uuid(),date_trunc('second',now()-interval '1 minute'),expiry-interval '1 hour',expiry-interval '1 hour',16000
        from unnest(array['{BOOT}'::uuid,gen_random_uuid()]) token;
        perform erp_comm_cost.take_worker_delivery('{BOOT}',gen_random_uuid());
        ticket:=public.fixture_chat_permit(1,'push',jsonb_build_object('op','budget.fundControl','kind','budget_alert','subject','1','maxActions',100,'endEpoch',extract(epoch from expiry)::bigint));
        update erp_comm_cost.proof set retained_at_zero_cost_evidence='fixture' where operation_id=ticket::text;
        insert into erp_comm_cost.unit_hold select ticket,id,10000000 from erp_comm_cost.capacity where unit='permanent_ledger_bytes';
        insert into erp_comm_cost.capacity(billing_account,dimension,unit,valid_from,valid_until,available_units,enabled)
        values('worker fixture','railway','funded_budget_alert_actions',now(),expiry,100,true) returning id into cap;
        insert into erp_comm_cost.unit_hold values(ticket,cap,100);
        insert into erp_comm_cost.control_pool(permit_id,kind,subject,max_actions,valid_until,continuing_zero_evidence,enabled)
        values(ticket,'budget_alert','1',100,expiry,'synthetic alerts',true);
        end $$;""")

    def effect_permit(self,actor,feature,command,effect=None,items=256):
        ticket=self.sql(f"select public.fixture_chat_permit({actor},'{feature}','{command}')")
        if effect:
            op=json.loads(command)["op"]
            self.sql(f"""do $$
            declare un text; cap bigint; qty bigint;
            begin
            update erp_comm_cost.proof set retained_at_zero_cost_evidence='synthetic complete work' where operation_id='{ticket}';
            insert into erp_comm_cost.effect_limit values('{ticket}','{op}','{effect}',1,65536,65536,'bounded work and retention');
            foreach un in array array['effect_{effect}_bytes','effect_{effect}_items'] loop
              qty:=case when un='effect_{effect}_bytes' then 65536*(1+{items}) else {items} end;
              select id into cap from erp_comm_cost.capacity where billing_account='effect fixture' and unit=un;
              if cap is null then insert into erp_comm_cost.capacity(billing_account,dimension,unit,valid_from,valid_until,available_units,enabled)
                values('effect fixture','database',un,now()-interval '1 hour',now()+interval '1 day',2000000000,true) returning id into cap;end if;
              insert into erp_comm_cost.unit_hold values('{ticket}',cap,qty);
            end loop;
            end $$;""")
        return ticket

    def seed_memberships(self):
        self.sql("""select erp_private.comms_track_profile(p.id) from public.user_profiles p
        where exists(select from erp_private.ptt_memberships m where m.profile_id=p.id and m.scope_anchor is null);
        update erp_private.ptt_memberships m set scope_anchor=erp_private.comms_scope_anchor(m.profile_id) where scope_anchor is null;""")

    def press_permit(self,actor,command,episodes=20):
        ticket=self.sql(f"select public.fixture_chat_permit({actor},'ptt_live','{command}')")
        self.sql(f"""do $$
        declare u text; cap bigint; qty bigint; price bigint:=131072;
        begin
        insert into erp_comm_cost.ptt_receipt_limit(operation_id,base_bytes,bytes_per_episode,retention_and_fanout_evidence)
        values('{ticket}',price,price,'synthetic source, receipts, inbox, device and lifetime retention');
        update erp_comm_cost.proof set retained_at_zero_cost_evidence='synthetic floor' where operation_id='{ticket}';
        foreach u in array array['funded_ptt_receipt_episodes','funded_ptt_busy_inboxes','funded_ptt_busy_device_jobs','ptt_floor_retained_bytes'] loop
          qty:=case when u='ptt_floor_retained_bytes' then price*(1+{episodes}) else {episodes} end;
          select id into cap from erp_comm_cost.capacity where billing_account='floor fixture' and unit=u;
          if cap is null then insert into erp_comm_cost.capacity(billing_account,dimension,unit,valid_from,valid_until,available_units,enabled)
            values('floor fixture','database',u,now()-interval '1 hour',now()+interval '1 day',2000000000,true) returning id into cap;end if;
          insert into erp_comm_cost.unit_hold values('{ticket}',cap,qty);
          insert into erp_comm_cost.meter select '{ticket}','database',u,true,now(),now()+interval '1 hour',now()+interval '2 hours',0,cap,qty;
        end loop;
        end $$;""")
        return ticket

    def tick(self,enabled=True):
        self.sql("update erp_comm_cost.control_pool set last_poll=clock_timestamp()-interval '2 seconds' where kind='ptt_worker_poll'")
        return self.rpc("tick",dict(worker=WORKER,boot=BOOT,poll=str(uuid.uuid4()),enabled=enabled,appId='fixture-app'))

    def finish(self,poll,healthy=True):
        return self.rpc("finishTick",dict(worker=WORKER,boot=BOOT,poll=poll,healthy=healthy))

    def heartbeat(self):
        with self.lock:
            self.refresh()

    def refresh(self):
        if self.sql("select exists(select from erp_private.ptt_worker_cycles where healthy_until>now()+interval '3 seconds')")=="t":
            return
        cycle=self.tick()
        assert "poll" in cycle and cycle["job"] is None,cycle
        pulse=cycle["poll"]
        assert self.sql(f"select erp_private.ptt_take_recording_poll('{pulse}')::text")==WORKER
        assert self.finish(pulse)["ok"]
