"""Real disposable localhost PostgreSQL, including the exact recording and budget migrations."""
import concurrent.futures
import json
from hashlib import sha256
import os
import secrets
import shutil
import socket
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from chat_native import ROOT, pg
from ptt_worker_fixture import Worker

def uid():
    return str(uuid.uuid4())

def run():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    work = ROOT / 'tmp'
    work.mkdir(exist_ok=True)
    here = Path(tempfile.mkdtemp(prefix='ptt-recording-', dir=work))
    password = secrets.token_urlsafe(30)
    secret = here/'pw'
    secret.write_text(password)
    db = here/'db'
    pg('initdb','-D',db,'-U','postgres','-A','scram-sha-256','--pwfile',secret,'-E','UTF8','--no-locale')
    secret.unlink()
    pg('pg_ctl','-D',db,'-l',here/'postgres.log','-o',f'-h 127.0.0.1 -p {port}','-w','start')
    def sql(query):
        return pg('psql','-X','-qAt','-h','127.0.0.1','-p',port,'-U','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',
                  input=query,env={**os.environ,'PGPASSWORD':password}).strip()
    worker=Worker(sql)
    def attempt(p,op,params,permit=None):
        cmd=json.dumps({'op':'pttRecording.'+op,'args':params})
        permit = permit or sql(f"select public.fixture_chat_permit({p},'ptt_replay','{cmd}')")
        if op in ('bind','preflight'):
            sql(f"insert into erp_comm_cost.cleanup_limit values('{permit}','discard_partial_upload',1,3)")
        if op in ('bind','preflight'):
            sql(f"update erp_comm_cost.proof set operational_stop_by=now()+interval '45 minutes',retained_at_zero_cost_evidence='fixture' where operation_id='{permit}'")
        return json.loads(sql(f"set role authenticated; set test.actor='{p}'; select public.erp_ptt_recording_v1('{cmd}','{permit}')"))
    def unavailable(fn):
        try: fn()
        except subprocess.CalledProcessError as error:
            assert 'PT404: Transmission unavailable' in error.stderr,error.stderr
            return
        raise AssertionError('Expected opaque not-found')
    def reject(fn):
        try: fn()
        except subprocess.CalledProcessError: return
        raise AssertionError('Expected denial')
    try:
        sql((ROOT/'tests/communications/chat_fixture.sql').read_text())
        sql((ROOT/'tests/communications/notifications_fixture.sql').read_text())
        sql('drop table if exists erp_private.ptt_phones')  # Use the full PTT table from the exact migration.
        applied={}
        for suffix in ('erp_communications_chat_v1','erp_communication_budget_v1','erp_ptt_control_v1','erp_ptt_recordings_v1',
                       'erp_communications_notifications_v1','erp_ptt_sos_v1','erp_communications_policy_v1'):
            migration=next((ROOT/'supabase/migrations').glob('*_'+suffix+'.sql'))
            content=migration.read_bytes()
            sql(content.decode('utf-8-sig'))
            applied[migration.name]=sha256(content).hexdigest()
        sql("insert into erp_private.comms_policy_versions(version,is_current,terms_text) values('fixture',true,'Synthetic recording terms'); insert into erp_private.comms_policy_acceptances(profile_id,version) select id,'fixture' from public.user_profiles")
        channel=uid(); epoch=uid()
        sql(f"""insert into erp_private.ptt_channels(id,name,creator,kind) values('{channel}','A',2,'group');
        insert into erp_private.ptt_memberships(channel_id,profile_id,joined_at) select '{channel}',p,now()-interval '5 minutes' from generate_series(2,3)p;
        insert into erp_private.ptt_phones(profile_id,device_id,epoch,auth_session,availability,stopped,paused) values (2,gen_random_uuid(),'{epoch}',lpad('2',32,'0')::uuid,'available',false,false),(3,gen_random_uuid(),gen_random_uuid(),lpad('3',32,'0')::uuid,'busy',false,false);""")
        worker.seed_memberships()
        def press(seats=8):
            # Only this suite's simulated endpoints have no worker/provider resource.
            sql("update erp_private.ptt_endpoints e set phase='closed',dirty=true from erp_private.ptt_leases l where e.lease_id=l.id and e.worker_id is null and l.ended_at is not null")
            worker.heartbeat()
            cmd=json.dumps(dict(op='ptt.press',args=dict(channelId=channel,epoch=epoch,pressId=uid())))
            permit=worker.press_permit(2,cmd,seats)
            result=json.loads(sql(f"set role authenticated;set test.actor='2';select public.erp_ptt_v1('{cmd}','{permit}')"))
            return result['leaseId']
        def turn(end='released',publish=True):
            rid=press();ep=uid()
            sql(f"update erp_private.ptt_leases set started_at=now()-interval '1 second',expires_at=now()+interval '59 seconds' where id='{rid}'")
            if publish:
                assert attempt(2,'preflight',dict(recordingId=rid,channelId=channel,epoch=epoch))['state']=='ready'
                sql(f"""insert into erp_private.ptt_endpoints(id,channel_id,profile_id,epoch,lease_id,app_id,phase,deadline,mutation)
                values('{ep}','{channel}',2,'{epoch}','{rid}','fixture','publishing',now()+interval '1 minute',gen_random_uuid());
                update erp_private.ptt_endpoints set phase='published',mid='0',session_id='fixture' where id='{ep}';""")
            if end:
                sql(f"update erp_private.ptt_leases set ended_at=clock_timestamp(),end_reason='{end}' where id='{rid}'")
            return rid,ep
        def src(rid): return dict(recordingId=rid,channelId=channel,epoch=epoch)
        h=dict(channelId=channel,mode='participant')
        reject(lambda:attempt(3,'history',h))
        sql("update erp_comm_cost.authority set owner_auth_id=lpad('1',32,'0')::uuid,owner_binding_evidence='fixture'")
        reject(lambda:attempt(3,'history',h))
        sql('update erp_private.ptt_recording_gate set enabled=true')
        worker.fund()
        assert worker.start()["cadenceSeconds"]==1
        sql("update erp_private.ptt_feature_gate set enabled=true")
        sql(f"insert into erp_private.ptt_admissions(channel_id,profile_id,epoch,live) values('{channel}',2,'{epoch}',true)")
        worker.heartbeat()
        sql(f"insert into erp_private.ptt_memberships(channel_id,profile_id) select '{channel}',p from generate_series(100,199)p")
        sql("insert into public.user_profiles(id,auth_user_id,status,must_change_password,display_name) select n,lpad(n::text,32,'0')::uuid,'active',false,'Fixture' from generate_series(100,199)n")
        worker.seed_memberships()
        reject(lambda:press(100))
        assert sql("select count(*) from erp_private.ptt_leases")=='0'
        assert sql("select count(*) from erp_private.ptt_recording_receipts")=='0'
        large=press(101)
        assert sql(f"select count(*) from erp_private.ptt_recording_receipts where lease_id='{large}'")=='101'
        sql(f"update erp_private.ptt_memberships set left_at=now() where profile_id>=100; update erp_private.ptt_leases set ended_at=now(),end_reason='released' where id='{large}'")
        live,_=turn(None,False)
        assert sql(f"select erp_private.ptt_recording_ready('{live}',2,'{epoch}')")=='f'
        assert attempt(2,'preflight',src(live))['state']=='ready'
        assert sql(f"select erp_private.ptt_recording_ready('{live}',2,'{epoch}')")=='t'
        sql("insert into erp_comm_cost.pause(scope,feature,reason) values('communications','ptt_replay','fixture')")
        assert sql(f"select erp_private.ptt_recording_ready('{live}',2,'{epoch}')")=='f'
        sql("delete from erp_comm_cost.pause")
        sql(f"update erp_private.ptt_leases set ended_at=clock_timestamp(),end_reason='revoked' where id='{live}'")
        rid,_=turn()
        read=dict(recordingId=rid,mode='participant')
        reject(lambda:attempt(3,'read',read))
        reject(lambda:attempt(2,'prepare',{**src(rid),'epoch':uid()}))
        unavailable(lambda:attempt(3,'prepare',src(rid)))
        unavailable(lambda:attempt(3,'prepare',src(uid())))
        unavailable(lambda:attempt(2,'prepare',{**src(rid),'epoch':uid()}))
        unavailable(lambda:attempt(4,'authorize',read))
        unavailable(lambda:attempt(4,'authorize',{**read,'recordingId':uid()}))
        reject(lambda:attempt(2,'prepare',src(rid),uid()))
        assert attempt(2,'prepare',src(rid))['state']=='ready'
        sql("update erp_comm_cost.control_pool set enabled=false where kind='ptt_worker_poll'")
        reject(lambda:attempt(2,'bind',src(rid)))
        sql("update erp_comm_cost.control_pool set enabled=true where kind='ptt_worker_poll'")
        worker.heartbeat()
        def bind():
            try:return attempt(2,'bind',src(rid))
            except subprocess.CalledProcessError:return None
        with concurrent.futures.ThreadPoolExecutor() as pool:
            rows=list(pool.map(lambda _:bind(),range(2)))
        assert len([row for row in rows if row])==1
        key=next(row['objectId'] for row in rows if row)
        final={**src(rid),'objectId':key,'byteSize':16044,'durationMs':1000,'sha256':'a'*64}
        reject(lambda:attempt(2,'finalize',final))
        sql(f"""insert into storage.objects(bucket_id,name,metadata) values('erp-ptt-recordings','{key}.wav','{{"mimetype":"audio/wav","size":16044}}');""")
        reject(lambda:attempt(2,'finalize',{**final,'durationMs':9000}))
        assert attempt(2,'finalize',final)['state']=='sent'
        assert attempt(2,'finalize',final)['state']=='sent'
        assert attempt(3,'read',read)['objectId']==key
        reject(lambda:sql(f"delete from storage.objects where bucket_id='erp-ptt-recordings' and name='{key}.wav'"))
        reject(lambda:sql(f"update storage.objects set name='{uid()}.wav' where name='{key}.wav'"))
        reject(lambda:sql(f"update storage.objects set metadata='{{}}' where name='{key}.wav'"))
        unavailable(lambda:attempt(3,'liveAuthorize',{**src(rid),'mode':'participant','epoch':uid()}))
        assert attempt(3,'cacheCheck',{**h,'ids':[rid,uid()]})['ids']==[rid]
        assert sql(f"select closed_at is not null from erp_comm_cost.cleanup_resource where resource_id='{key}'")=='t'
        attempt(1,'read',{**read,'mode':'review'})
        reject(lambda:attempt(1,'receipt',{**read,'mode':'review','event':'played'}))
        assert attempt(2,'recipients',read)['items'][0]['state']=='sent'
        assert attempt(3,'receipt',{**read,'event':'delivered'})['ok']
        assert attempt(2,'recipients',read)['items'][0]['state']=='delivered'
        assert attempt(3,'receipt',{**read,'event':'played'})['ok']
        assert attempt(2,'recipients',read)['items'][0]['state']=='played'
        assert sql(f"select erp_private.notification_ptt_target('{rid}',3)->>'pushEligible'")=='true'
        assert sql(f"select count(*) from erp_private.notification_inbox where kind='ptt' and source='{rid}' and profile_id=3")=='1'
        partial,_=turn('revoked')
        reject(lambda:attempt(2,'prepare',src(partial)))
        assert any(r['state']=='failed' for r in attempt(3,'history',h)['items'])
        no_source,_=turn(publish=False)
        reject(lambda:attempt(2,'prepare',src(no_source)))
        dropped,ep=turn(None)
        sql(f"update erp_private.ptt_endpoints set dirty=true where id='{ep}';update erp_private.ptt_leases set ended_at=clock_timestamp(),end_reason='expired' where id='{dropped}'")
        reject(lambda:attempt(2,'prepare',src(dropped)))
        lost,_=turn()
        worker.heartbeat()
        stage=attempt(2,'bind',src(lost))['objectId']
        put=f"insert into storage.objects(bucket_id,name,metadata) values('erp-ptt-recordings','{stage}.wav','{{}}')"
        sql(put)
        reject(lambda:sql(f"delete from storage.objects where name='{stage}.wav'"))
        sql(f"update erp_private.ptt_recording_uploads set expires_at=now()-interval '1 minute',cleanup_after=now()-interval '1 minute' where id='{stage}'")
        reject(lambda:sql("set role service_role;select public.erp_ptt_recording_cleanup_v1(null)"))
        cycle=worker.tick()
        pulse=cycle["poll"]
        result=json.loads(sql(f"set role service_role;select public.erp_ptt_recording_cleanup_v1(null,'{pulse}')"))
        reject(lambda:sql(f"set role service_role;select public.erp_ptt_recording_cleanup_v1(null,'{pulse}')"))
        assert worker.finish(pulse)["ok"]
        assert result['objectId']==stage and result['objectId']!=key
        sql(f"set role service_role;select public.erp_ptt_recording_cleanup_v1('{stage}')")
        assert sql(f"select count(*) from erp_private.ptt_recording_uploads where id='{stage}'")=='1'
        def confirm_stage(attempt_id,absent=True):
            return f"select public.erp_ptt_recording_cleanup_v1('{stage}',null,'{attempt_id}',{str(absent).lower()})"
        cleanup=json.dumps(dict(permitId=result['permitId'],endpoint='discard_partial_upload',resourceId=stage,attemptId=result['attemptId']))
        assert json.loads(sql(f"select erp_comm_cost.cleanup('authorize_cleanup','{cleanup}')"))['newAttempt']
        assert not json.loads(sql(confirm_stage(result['attemptId'])))['confirmed'] # catalog object still exists
        sql(f"delete from storage.objects where bucket_id='erp-ptt-recordings' and name='{stage}.wav'")
        assert not json.loads(sql(confirm_stage(result['attemptId'],False)))['confirmed']
        assert sql(f"select closed_at is null from erp_comm_cost.cleanup_resource where resource_id='{stage}'")=='t'
        cooldown=worker.tick()["poll"]
        assert sql(f"set role service_role;select public.erp_ptt_recording_cleanup_v1(null,'{cooldown}')")==""
        assert worker.finish(cooldown)=={"healthy":False,"ok":True}
        sql(f"update erp_private.ptt_recording_uploads set cleanup_after=now()-interval '1 minute' where id='{stage}'")
        pulse=worker.tick()["poll"]
        retried=json.loads(sql(f"set role service_role;select public.erp_ptt_recording_cleanup_v1(null,'{pulse}')"))
        assert retried['attemptId']!=result['attemptId'] and retried['absent']
        assert not json.loads(sql(confirm_stage(result['attemptId'])))['confirmed']
        assert not json.loads(sql(confirm_stage(retried['attemptId'])))['confirmed']
        cleanup=json.dumps(dict(permitId=retried['permitId'],endpoint='discard_partial_upload',resourceId=stage,attemptId=retried['attemptId']))
        assert json.loads(sql(f"select erp_comm_cost.cleanup('authorize_cleanup','{cleanup}')"))['newAttempt']
        # Force a delayed Storage insert to wait for the retiring transaction's stage lock.
        with concurrent.futures.ThreadPoolExecutor() as pool:
            closing=pool.submit(sql,f"set application_name='ptt-retire-fixture';begin;select id from erp_private.ptt_recording_uploads where id='{stage}' for update;select pg_sleep(2);"+confirm_stage(retried['attemptId'])+";commit;")
            for _ in range(25):
                if sql("select exists(select from pg_stat_activity where application_name='ptt-retire-fixture' and wait_event='PgSleep')")=='t': break
                time.sleep(.02)
            else: raise AssertionError('cleanup lock missing')
            late=pool.submit(reject,lambda:sql("set application_name='ptt-late-fixture';"+put))
            for _ in range(25):
                if sql("select exists(select from pg_stat_activity where application_name='ptt-late-fixture' and cardinality(pg_blocking_pids(pid))>0)")=='t': break
                time.sleep(.02)
            else: raise AssertionError('late write did not wait for cleanup')
            assert json.loads(closing.result().splitlines()[-1])['confirmed']
            late.result()
        assert worker.finish(pulse)["ok"]
        reject(lambda:sql(put))
        assert sql(f"select count(*) from erp_private.ptt_recording_uploads where id='{stage}'")=='0'
        assert sql(f"select closed_at is not null from erp_comm_cost.cleanup_resource where resource_id='{stage}'")=='t'
        assert attempt(3,'authorize',read)['sha256']=='a'*64
        sql(f"update erp_private.ptt_memberships set left_at=now() where profile_id=3;")
        reject(lambda:attempt(3,'authorize',read))
        sql(f"insert into erp_private.ptt_memberships(channel_id,profile_id) values('{channel}',3)")
        worker.seed_memberships()
        assert not attempt(3,'history',h)['items']
        assert not attempt(3,'cacheCheck',{**h,'ids':[rid]})['ids']
        reject(lambda:attempt(3,'receipt',{**read,'event':'played'}))
        assert sql(f"select erp_private.notification_ptt_target('{rid}',3) is null")=='t'
        reject(lambda:attempt(4,'history',{**h,'mode':'review'}))
        assert sql("select not public and file_size_limit=52428800 from storage.buckets where id='erp-ptt-recordings'")=='t'
        reject(lambda:sql("set role authenticated;select public.erp_ptt_recording_cleanup_v1(null)"))
        print("PASS exact migrations: default hold, byte/lease/actor/session binding, private stages, concurrent bind, interruption, cleanup, participant/reviewer receipts, 101-episode funded floor, late-write exclusion and rejoin cutoff")
        for filename,digest in applied.items(): print(digest,filename)
    finally:
        pg('pg_ctl','-D',db,'-m','fast','-w','stop')
        if here.resolve().parent!=work.resolve(): raise RuntimeError("Invalid scratch directory")
        shutil.rmtree(here)
if __name__=='__main__':
    try:run()
    except subprocess.CalledProcessError as error:
        print(error.stderr)
        raise
