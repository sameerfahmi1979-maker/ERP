"""Native policy authorization, retention and pair fencing in disposable localhost PostgreSQL."""
import concurrent.futures
from datetime import datetime
from hashlib import sha256
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import tempfile
import time
import uuid

from chat_native import ROOT, pg


def uid():
    return str(uuid.uuid4())


def sql_literal(value):
    return "'" + value.replace("'", "''") + "'"


def exercise(sql):
    migrations = ROOT / 'supabase/migrations'
    sql((ROOT / 'tests/communications/chat_fixture.sql').read_text())
    sql((ROOT / 'tests/communications/notifications_fixture.sql').read_text())
    sql('DROP TABLE IF EXISTS erp_private.ptt_phones')  # Replace the notification-only test stand-in with the exact PTT schema.
    applied = {}
    for suffix in ('erp_communications_chat_v1', 'erp_communication_budget_v1', 'erp_ptt_control_v1',
                   'erp_ptt_recordings_v1', 'erp_communications_notifications_v1', 'erp_ptt_sos_v1',
                   'erp_communications_policy_v1'):
        source = next(migrations.glob('*_' + suffix + '.sql'))
        content = source.read_bytes()
        sql(content.decode('utf-8-sig'))
        applied[source.name] = sha256(content).hexdigest()

    def request(actor, operation, **args):
        command = sql_literal(json.dumps({'op': 'policy.' + operation, 'args': args}))
        return json.loads(sql(f"SET ROLE authenticated; SET test.actor='{actor}'; SELECT public.erp_communications_policy_v1({command}::jsonb);"))

    def mutation(actor, operation, **args):
        args.setdefault('clientMutationId', uid())
        return request(actor, operation, **args)

    def deny(fn, code):
        try:
            fn()
        except subprocess.CalledProcessError as error:
            assert code in error.stderr, error.stderr
        else:
            raise AssertionError('Expected ' + code)

    def fund(profile, kind, actions):
        sql(f"""
        DO $$
        DECLARE ticket uuid:=gen_random_uuid(); end_at timestamptz:=date_trunc('second',clock_timestamp())+interval '1 hour';
        BEGIN
         INSERT INTO erp_comm_cost.capacity(billing_account,dimension,unit,valid_from,valid_until,available_units,enabled)
          SELECT 'fixture','database',u,now()-interval '1 minute',end_at+interval '1 hour',10000000,true
          FROM unnest(ARRAY['funded_{kind}_actions','permanent_ledger_bytes']) u ON CONFLICT DO NOTHING;
         INSERT INTO erp_comm_cost.proof(operation_id,scope,actor_id,feature,operational_stop_by,valid_until,
           max_meter_age,retained_at_zero_cost_evidence,shutdown_evidence,headroom_micros)
          VALUES(ticket::text,'communications','{profile}','chat',end_at,end_at,interval '1 minute','test retention','test stop',0);
         INSERT INTO erp_comm_cost.reservation(operation_id,permit_id,scope,actor_id,feature,floor_micros,reserved_micros,
           issued_at,expires_at,actor_session,command_hash)
          VALUES(ticket::text,ticket,'communications','{profile}','chat',0,0,now(),end_at,lpad('{profile}',32,'0')::uuid,
           sha256(convert_to(jsonb_build_object('op','budget.fundControl','kind','{kind}','subject','{profile}',
             'maxActions',{actions},'endEpoch',extract(epoch from end_at)::bigint)::text,'UTF8')));
         INSERT INTO erp_comm_cost.unit_hold(permit_id,capacity_id,units)
          SELECT ticket,c.id,CASE WHEN c.unit='permanent_ledger_bytes' THEN 65536+{actions}*32768 ELSE {actions} END
          FROM erp_comm_cost.capacity c WHERE c.unit IN('funded_{kind}_actions','permanent_ledger_bytes');
         INSERT INTO erp_comm_cost.control_pool(permit_id,kind,subject,max_actions,valid_until,continuing_zero_evidence,enabled)
          VALUES(ticket,'{kind}','{profile}',{actions},end_at,'synthetic funding only',true);
        END $$;
        """)

    def spent(profile, kind):
        return int(sql(f"SELECT coalesce(sum(used),0) FROM erp_comm_cost.control_pool WHERE subject='{profile}' AND kind='{kind}'"))

    assert not request(2, 'status')['accepted']
    assert request(2, 'status')['termsText'] is None
    # Reproduces A19-10 even while every communications feature remains unactivated.
    for _ in range(5):
        assert not mutation(2, 'block', targetProfileId='3', blocked=False)['blocked']
    assert sql('SELECT count(*) FROM erp_private.comms_policy_mutations') == '0', 'Unchanged safety state allocated a durable receipt'
    deny(lambda: mutation(2, 'block', targetProfileId='3', blocked=True), 'PT503')
    deny(lambda: mutation(2, 'report', kind='user', targetId='3', reason='privacy'), 'PT503')
    deny(lambda: mutation(2, 'accept', version='terms-v1'), 'PT409')
    deny(lambda: request(7, 'status'), '42501')
    deny(lambda: sql("SET ROLE anon; SELECT public.erp_communications_policy_v1('{\"op\":\"policy.status\",\"args\":{}}');"), '42501')
    deny(lambda: request(2, 'status', _budgetPermitId=uid()), '22023')
    sql("INSERT INTO erp_private.comms_policy_versions(version,is_current,terms_text) VALUES ('terms-v1',true,'Synthetic terms v1');")
    deny(lambda: mutation(2, 'accept', version='terms-v1'), 'PT503')
    assert sql('SELECT count(*) FROM erp_private.comms_policy_acceptances') == '0'
    assert sql('SELECT count(*) FROM erp_comm_cost.control_debit') == '0'
    for profile, kind, actions in ((2, 'terms', 2), (3, 'terms', 1), (2, 'block', 3), (3, 'block', 2),
                                   (2, 'report', 1), (3, 'report', 8), (6, 'report', 1)):
        fund(profile, kind, actions)
    acceptance = mutation(2, 'accept', version='terms-v1')
    assert mutation(2, 'accept', version='terms-v1') == acceptance
    assert spent(2, 'terms') == 1
    assert sql("SELECT count(*) FROM erp_private.comms_policy_mutations WHERE actor_id=2") == '1'
    assert request(2, 'status')['accepted']
    assert not request(3, 'status')['accepted']
    sql("UPDATE erp_private.comms_policy_versions SET is_current=false; INSERT INTO erp_private.comms_policy_versions(version,is_current,terms_text) VALUES ('terms-v2',true,'Synthetic terms v2');")
    deny(lambda: mutation(2, 'accept', version='terms-v1'), 'PT409')
    assert request(2, 'status')['acceptedVersion'] == 'terms-v1'
    def fund(profile, kind, actions):
        sql(f"""
        DO $$
        DECLARE ticket uuid:=gen_random_uuid(); end_at timestamptz:=date_trunc('second',clock_timestamp())+interval '1 hour';
        BEGIN
         INSERT INTO erp_comm_cost.capacity(billing_account,dimension,unit,valid_from,valid_until,available_units,enabled)
          SELECT 'fixture','database',u,now()-interval '1 minute',end_at+interval '1 hour',10000000,true
          FROM unnest(ARRAY['funded_{kind}_actions','permanent_ledger_bytes']) u ON CONFLICT DO NOTHING;
         INSERT INTO erp_comm_cost.proof(operation_id,scope,actor_id,feature,operational_stop_by,valid_until,
           max_meter_age,retained_at_zero_cost_evidence,shutdown_evidence,headroom_micros)
          VALUES(ticket::text,'communications','{profile}','chat',end_at,end_at,interval '1 minute','test retention','test stop',0);
         INSERT INTO erp_comm_cost.reservation(operation_id,permit_id,scope,actor_id,feature,floor_micros,reserved_micros,
           issued_at,expires_at,actor_session,command_hash)
          VALUES(ticket::text,ticket,'communications','{profile}','chat',0,0,now(),end_at,lpad('{profile}',32,'0')::uuid,
           sha256(convert_to(jsonb_build_object('op','budget.fundControl','kind','{kind}','subject','{profile}',
             'maxActions',{actions},'endEpoch',extract(epoch from end_at)::bigint)::text,'UTF8')));
         INSERT INTO erp_comm_cost.unit_hold(permit_id,capacity_id,units)
          SELECT ticket,c.id,CASE WHEN c.unit='permanent_ledger_bytes' THEN 65536+{actions}*32768 ELSE {actions} END
          FROM erp_comm_cost.capacity c WHERE c.unit IN('funded_{kind}_actions','permanent_ledger_bytes');
         INSERT INTO erp_comm_cost.control_pool(permit_id,kind,subject,max_actions,valid_until,continuing_zero_evidence,enabled)
          VALUES(ticket,'{kind}','{profile}',{actions},end_at,'synthetic funding only',true);
        END $$;
        """)

    def spent(profile, kind):
        return int(sql(f"SELECT coalesce(sum(used),0) FROM erp_comm_cost.control_pool WHERE subject='{profile}' AND kind='{kind}'"))

    assert not request(2, 'status')['accepted']
    for actor in (2, 3):
        mutation(actor, 'accept', version='terms-v2')
    deny(lambda: mutation(4, 'setModerator', targetProfileId='5', enabled=True), '42501')
    deny(lambda: mutation(6, 'setModerator', targetProfileId='6', enabled=True), '42501')
    mutation(1, 'setModerator', targetProfileId='5', enabled=True)
    mutation(1, 'setModerator', targetProfileId='1', enabled=True)
    sql("INSERT INTO erp_private.notification_devices(installation,profile_id,session_id,token) VALUES(gen_random_uuid(),5,lpad('5',32,'0')::uuid,repeat('s',48))")

    conversation, chat_message, group, channel, group_ptt, old_record, active_record, endpoint, unrelated_endpoint = [uid() for _ in range(9)]
    epoch_2, epoch_3 = uid(), uid()
    sql(f"""
      INSERT INTO erp_private.chat_conversations(id,kind,direct_low,direct_high,creator,latest_seq) VALUES('{conversation}','direct',2,3,2,1);
      INSERT INTO erp_private.chat_conversations(id,kind,creator,owner_id,name) VALUES('{group}','group',2,2,'Ordinary working group');
      INSERT INTO erp_private.chat_memberships(conversation,profile_id) VALUES('{conversation}',2),('{conversation}',3),('{group}',2),('{group}',3);
      INSERT INTO erp_private.chat_messages(id,conversation,seq,sender,body) VALUES('{chat_message}','{conversation}',1,2,'Retained private text');
      INSERT INTO erp_private.ptt_channels(id,kind,name,creator,direct_low,direct_high) VALUES('{channel}','direct','',2,2,3);
      INSERT INTO erp_private.ptt_channels(id,kind,name,creator,required) VALUES('{group_ptt}','group','Required',2,true);
      INSERT INTO erp_private.ptt_memberships(channel_id,profile_id,joined_at,required) VALUES
        ('{channel}',2,now()-interval '1 hour',false),('{channel}',3,now()-interval '1 hour',false),
        ('{group_ptt}',2,now()-interval '45 minutes',true),('{group_ptt}',3,now()-interval '10 minutes',true);
      INSERT INTO erp_private.ptt_phones(profile_id,device_id,epoch,auth_session,availability,stopped,paused) VALUES
        (2,gen_random_uuid(),'{epoch_2}',lpad('2',32,'0')::uuid,'available',false,false),
        (3,gen_random_uuid(),'{epoch_3}',lpad('3',32,'0')::uuid,'available',false,false);
      INSERT INTO erp_private.ptt_admissions(channel_id,profile_id,epoch,live) VALUES
        ('{channel}',2,'{epoch_2}',true),('{channel}',3,'{epoch_3}',true),('{group_ptt}',2,'{epoch_2}',true);
      INSERT INTO erp_private.ptt_leases(id,channel_id,profile_id,epoch,press_id,started_at,expires_at,ended_at,end_reason) VALUES
        ('{old_record}','{group_ptt}',2,'{epoch_2}',gen_random_uuid(),now()-interval '20 minutes',now()-interval '19 minutes',now()-interval '19 minutes','expired');
      INSERT INTO erp_private.ptt_leases(id,channel_id,profile_id,epoch,press_id,started_at,expires_at) VALUES
        ('{active_record}','{channel}',2,'{epoch_2}',gen_random_uuid(),now()-interval '2 seconds',now()+interval '58 seconds');
      SELECT erp_private.comms_track_profile(p) FROM unnest(array[2,3]) p;
      UPDATE erp_private.ptt_memberships SET scope_anchor=erp_private.comms_scope_anchor(profile_id) WHERE scope_anchor IS NULL;
      INSERT INTO erp_private.ptt_recordings(lease_id,source_session) VALUES ('{old_record}',lpad('2',32,'0')::uuid),('{active_record}',lpad('2',32,'0')::uuid);
      INSERT INTO erp_private.ptt_recording_receipts(lease_id,episode,busy_at_send)
       SELECT l.id,m.id,false FROM erp_private.ptt_leases l JOIN erp_private.ptt_memberships m ON m.channel_id=l.channel_id AND m.profile_id<>l.profile_id WHERE l.id IN('{old_record}','{active_record}');
      INSERT INTO erp_private.ptt_endpoints(id,channel_id,profile_id,epoch,lease_id,app_id,phase,deadline,mutation) VALUES
        ('{endpoint}','{channel}',2,'{epoch_2}','{active_record}','fixture','published',now()+interval '50 seconds',gen_random_uuid()),
        ('{unrelated_endpoint}','{group_ptt}',2,'{epoch_2}',NULL,'fixture','idle',now()-interval '1 minute',gen_random_uuid());
    """)
    deny(lambda: mutation(3, 'report', kind='ptt_transmission', targetId=old_record, reason='privacy'), 'PT404')
    deny(lambda: mutation(6, 'report', kind='chat_message', targetId=chat_message, reason='privacy'), 'PT404')
    report = dict(kind='chat_message', targetId=chat_message, reason='privacy', details='Private allegation', clientMutationId=uid())
    case = mutation(3, 'report', **report)['caseId']
    assert mutation(3, 'report', **report)['caseId'] == case
    assert mutation(3, 'report', **{**report, 'clientMutationId': uid()})['caseId'] == case
    assert spent(3, 'report') == 1
    deny(lambda: mutation(3, 'report', **{**report, 'reason': 'other'}), 'PT409')
    deny(lambda: request(2, 'case', caseId=case), '42501')
    card = request(5, 'case', caseId=case)
    assert card['targetId'] is None and card['details'] is None and not card['evidenceAvailable']
    assert sql(f"SELECT count(*) FROM erp_private.notification_inbox WHERE source='{case}' AND profile_id IN (1,5)") == '1'
    assert sql(f"SELECT count(*) FROM erp_private.notification_inbox WHERE source='{case}'") == '1'
    assert sql(f"SELECT count(*) FROM erp_private.notification_push_jobs j JOIN erp_private.notification_inbox i ON i.id=j.event WHERE i.source='{case}'") == '0'
    deny(lambda: mutation(5, 'moderate', caseId=case, action='hideContent'), '42501')
    assert request(1, 'case', caseId=case)['targetId'] == chat_message
    sql("INSERT INTO erp_private.chat_named_grants(profile_id,kind,enabled,granted_by) VALUES(5,'historyReview',true,1);")
    assert request(5, 'case', caseId=case)['targetId'] == chat_message
    sql("UPDATE public.user_roles SET is_active=false WHERE user_profile_id=5 AND owner_company_id=20")
    assert not request(5, 'case', caseId=case)['evidenceAvailable']

    # Enable synthetic SQL-only chat admission after verifying safety works while the default hold is in effect.
    sql("UPDATE erp_private.comms_chat_gate SET enabled=true; UPDATE erp_comm_cost.authority SET owner_auth_id=lpad('1',32,'0')::uuid,owner_binding_evidence='isolated synthetic policy race'")
    outgoing = {'op': 'chat.send', 'args': {'conversationId': conversation, 'body': 'Racing send', 'clientMutationId': uid()}}
    permit = sql(f"SELECT public.fixture_chat_permit(3,'chat',{sql_literal(json.dumps(outgoing))}::jsonb)")
    outgoing['_budgetPermitId'] = permit
    block_cmd = sql_literal(json.dumps({'op': 'policy.block', 'args': {'targetProfileId': '3', 'blocked': True, 'clientMutationId': uid()}}))
    race = f"""
       BEGIN; SET LOCAL application_name='policy-block-race';
       SELECT erp_private.comms_lock_pair(2,3);
       SELECT pg_sleep(0.8);
       SET LOCAL ROLE authenticated; SET LOCAL test.actor='2';
       SELECT public.erp_communications_policy_v1({block_cmd}::jsonb); COMMIT;
    """
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as worker:
        running = worker.submit(sql, race)
        for _ in range(20):
            if sql("SELECT EXISTS(SELECT FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name='policy-block-race' AND l.locktype='advisory' AND l.granted)") == 't':
                break
            time.sleep(0.03)
        else:
            raise AssertionError('Pair race did not acquire its fence')
        deny(lambda: sql(f"SET ROLE authenticated; SET test.actor='3'; SELECT public.erp_chat_v1({sql_literal(json.dumps(outgoing))}::jsonb)"), '42501')
        assert json.loads(running.result())['blocked']
    assert sql(f"SELECT count(*) FROM erp_private.chat_messages WHERE conversation='{conversation}'") == '1'

    with concurrent.futures.ThreadPoolExecutor() as workers:
        pairs = [workers.submit(mutation, left, 'block', targetProfileId=str(right), blocked=True) for left, right in ((2, 3), (3, 2))]
        assert all(future.result()['blocked'] for future in pairs)
    assert sql(f"SELECT end_reason FROM erp_private.ptt_leases WHERE id='{active_record}'") == 'revoked'
    assert sql(f"SELECT dirty FROM erp_private.ptt_endpoints WHERE id='{endpoint}'") == 't'
    assert sql(f"SELECT dirty FROM erp_private.ptt_endpoints WHERE id='{unrelated_endpoint}'") == 'f'
    assert spent(2, 'block') == 1
    assert sql(f"SELECT count(*) FROM erp_private.ptt_admissions WHERE channel_id='{channel}'") == '0'
    assert sql(f"SELECT count(*) FROM erp_private.ptt_admissions WHERE channel_id='{group_ptt}'") == '1'
    assert request(2, 'blocks')['blocks'][0]['targetProfileId'] == '3'
    assert not mutation(2, 'block', targetProfileId='3', blocked=False)['blocked']
    assert sql('SELECT erp_private.comms_pair_blocked(2,3)') == 't'
    assert not mutation(3, 'block', targetProfileId='2', blocked=False)['blocked']
    assert sql('SELECT erp_private.comms_pair_blocked(2,3)') == 'f'
    assert sql(f"SELECT body FROM erp_private.chat_messages WHERE id='{chat_message}'") == 'Retained private text'
    deny(lambda: sql('SET ROLE authenticated; SELECT * FROM erp_private.comms_reports'), '42501')
    deny(lambda: sql("UPDATE erp_private.comms_policy_versions SET terms_text='different' WHERE is_current"), 'PT409')
    personal_case = mutation(3, 'report', kind='user', targetId='2', reason='other')['caseId']
    assert request(1, 'cases', limit=1)['nextBefore'] == personal_case
    assert request(1, 'cases', limit=1, before=personal_case)['cases'][0]['caseId'] == case
    # A renamed or re-edited message must be reviewed as new evidence before a sanction.
    edited_source = uid()
    sql(f"INSERT INTO erp_private.chat_messages(id,conversation,seq,sender,body) VALUES('{edited_source}','{group}',1,2,'Before edit')")
    edited_case = mutation(3, 'report', kind='chat_message', targetId=edited_source, reason='other')['caseId']
    sql(f"UPDATE erp_private.chat_messages SET body='After edit',revision=revision+1 WHERE id='{edited_source}'")
    assert request(1, 'case', caseId=edited_case)['sourceChanged']
    deny(lambda: mutation(1, 'moderate', caseId=edited_case, action='hideContent'), 'PT409')
    assert sql(f"SELECT body,deleted_at IS NULL FROM erp_private.chat_messages WHERE id='{edited_source}'") == 'After edit|t'

    replay_case = mutation(3, 'report', kind='ptt_transmission', targetId=active_record, reason='other')['caseId']
    replay_evidence = request(1, 'case', caseId=replay_case)
    assert replay_evidence['evidenceAvailable'] and not replay_evidence['recordingAvailable']
    assert mutation(1, 'moderate', caseId=replay_case, action='hideContent')['status'] == 'closed'
    assert sql(f"SELECT erp_private.comms_moderation_hidden('ptt_transmission','{active_record}')") == 't'
    assert sql(f"SELECT count(*) FROM erp_private.ptt_recordings WHERE lease_id='{active_record}'") == '1'
    deny(lambda: mutation(3, 'report', kind='ptt_transmission', targetId=active_record, reason='other'), 'PT404')

    deadline = datetime.fromisoformat(sql("SELECT clock_timestamp()+interval '10 minutes'")).isoformat()
    assert mutation(1, 'moderate', caseId=personal_case, action='restrictCommunication', until=deadline)['status'] == 'closed'
    deny(lambda: sql(f"INSERT INTO erp_private.chat_messages(conversation,seq,sender,body) VALUES('{group}',2,2,'Blocked contribution')"), '42501')
    deny(lambda: sql(f"INSERT INTO erp_private.ptt_leases(channel_id,profile_id,epoch,press_id,started_at,expires_at) VALUES('{group_ptt}',2,'{epoch_2}',gen_random_uuid(),now(),now()+interval '60 seconds')"), '42501')
    assert request(2, 'status')['accepted']  # Terms and safety remain independent of a publishing restriction.
    # Pausing regular chat does not remove already funded personal safety actions.
    sql("UPDATE erp_private.comms_chat_gate SET enabled=false; INSERT INTO erp_comm_cost.pause(scope,feature,reason) VALUES('communications','chat','isolated test pause')")
    deny(lambda: sql("SET ROLE authenticated; SELECT erp_comm_cost.take_policy_control(2,'report')"), '42501')
    sql('''CREATE FUNCTION erp_private.fixture_fail_moderation_notice() RETURNS trigger LANGUAGE plpgsql AS
            $$ BEGIN RAISE EXCEPTION 'synthetic moderation notification failure'; END $$;
           CREATE TRIGGER fixture_fail_moderation_notice BEFORE INSERT ON erp_private.notification_inbox FOR EACH ROW
            WHEN (NEW.kind='moderation') EXECUTE FUNCTION erp_private.fixture_fail_moderation_notice();''')
    confirmed = mutation(2, 'report', kind='user', targetId='3', reason='privacy')['caseId']
    assert sql(f"SELECT count(*) FROM erp_private.comms_reports WHERE id='{confirmed}'") == '1'
    assert sql(f"SELECT count(*) FROM erp_private.notification_inbox WHERE source='{confirmed}'") == '0'
    assert spent(2, 'report') == 1
    deny(lambda: mutation(2, 'report', kind='user', targetId='3', reason='other'), 'PT503')
    assert mutation(2, 'report', kind='user', targetId='3', reason='privacy')['caseId'] == confirmed
    assert spent(2, 'report') == 1
    sql('DROP TRIGGER fixture_fail_moderation_notice ON erp_private.notification_inbox')
    block = mutation(2, 'block', targetProfileId='5', blocked=True)
    assert block['blocked'] and spent(2, 'block') == 3  # Report exhaustion leaves the separate block pool intact.
    receipts = sql("SELECT count(*) FROM erp_private.comms_policy_mutations WHERE actor_id=2")
    sql('''SET ROLE authenticated; SET test.actor='2'; DO $$
           BEGIN
            FOR n IN 1..80 LOOP
             PERFORM public.erp_communications_policy_v1(jsonb_build_object('op','policy.block','args',jsonb_build_object(
                'targetProfileId','5','blocked',true,'clientMutationId',gen_random_uuid())));
             PERFORM public.erp_communications_policy_v1(jsonb_build_object('op','policy.accept','args',jsonb_build_object(
                'version','terms-v2','clientMutationId',gen_random_uuid())));
            END LOOP;
           END $$;''')
    assert sql("SELECT count(*) FROM erp_private.comms_policy_mutations WHERE actor_id=2") == receipts
    assert mutation(2, 'block', targetProfileId='5', blocked=True) == block
    assert spent(2, 'block') == 3 and spent(2, 'terms') == 2
    deny(lambda: mutation(2, 'block', targetProfileId='5', blocked=False), 'PT503')
    assert sql('SELECT erp_private.comms_pair_blocked(2,5)') == 't'
    deny(lambda: mutation(6, 'block', targetProfileId='3', blocked=True), 'PT503')

    # Only actual changes create receipts, with 24h validity and at most 256 entries per actor.
    expired = uid()
    sql(f"""INSERT INTO erp_private.comms_policy_mutations(actor_id,mutation_id,request_hash,result,expires_at)
              SELECT 1,gen_random_uuid(),sha256('fixture'::bytea),'{{}}',clock_timestamp()+interval '1 hour' FROM generate_series(1,256);
            INSERT INTO erp_private.comms_policy_mutations(actor_id,mutation_id,request_hash,result,expires_at)
              VALUES(1,'{expired}',sha256('fixture'::bytea),'{{}}',clock_timestamp()-interval '1 hour');""")
    assert mutation(1, 'setModerator', targetProfileId='6', enabled=True)['enabled']
    assert sql("SELECT count(*) FROM erp_private.comms_policy_mutations WHERE actor_id=1") == '256'
    assert sql(f"SELECT count(*) FROM erp_private.comms_policy_mutations WHERE mutation_id='{expired}'") == '0'
    sql("UPDATE erp_private.comms_restrictions SET until_at=clock_timestamp()-interval '1 second'")
    sql(f"INSERT INTO erp_private.chat_messages(conversation,seq,sender,body) VALUES('{group}',2,2,'Restriction expired')")
    assert mutation(1, 'moderate', caseId=case, action='hideContent')['status'] == 'closed'
    assert sql(f"SELECT body,deleted_at IS NOT NULL FROM erp_private.chat_messages WHERE id='{chat_message}'") == 'Retained private text|t'
    mutation(1, 'setModerator', targetProfileId='5', enabled=False)
    deny(lambda: request(5, 'case', caseId=case), '42501')
    assert sql(f"SELECT erp_private.notification_moderation_target('{case}',5) IS NULL") == 't'
    # A policy report must leave the ERP's existing identity deletion path available.
    former = mutation(6, 'report', kind='user', targetId='3', reason='privacy')['caseId']
    sql('DELETE FROM public.user_profiles WHERE id=6')
    assert sql(f"SELECT reporter_id FROM erp_private.comms_reports WHERE id='{former}'") == '6'
    assert sql('SELECT count(*) FROM erp_private.comms_policy_mutations WHERE actor_id=6') == '0'
    deny(lambda: request(6, 'status'), '42501')
    print('PASS native policy holds, paused finite safety pools, no-op deduplication, bounded receipts, isolated notice, terms, report scope, block/send race, and scoped PTT revocation')
    for name, digest in applied.items():
        print(f'{digest} {name}')


def run():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    workspace = ROOT / 'tmp'
    workspace.mkdir(exist_ok=True)
    directory = Path(tempfile.mkdtemp(prefix='communications-policy-', dir=workspace))
    cluster = directory / 'db'
    secret = directory / 'pw'
    password = secrets.token_urlsafe(32)
    secret.write_text(password, encoding='ascii')
    pg('initdb', '-D', cluster, '-U', 'postgres', '-A', 'scram-sha-256', '--pwfile', secret, '-E', 'UTF8', '--no-locale')
    secret.unlink()
    pg('pg_ctl', '-D', cluster, '-l', directory / 'pg.log', '-o', f'-h 127.0.0.1 -p {port}', '-w', 'start')

    def sql(statement):
        return pg('psql', '-X', '-qAt', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres',
                  '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', input=statement,
                  env={**os.environ, 'PGPASSWORD': password}).strip()

    try:
        exercise(sql)
    finally:
        pg('pg_ctl', '-D', cluster, '-m', 'fast', '-w', 'stop')
        if directory.resolve().parent != workspace.resolve():
            raise RuntimeError('Invalid scratch path')
        shutil.rmtree(directory)


if __name__ == '__main__':
    try:
        run()
    except subprocess.CalledProcessError as error:
        print(error.stderr)
        raise
