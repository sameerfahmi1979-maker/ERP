"""Run notification fixtures with only synthetic data in a disposable loopback PostgreSQL 17 cluster."""
import os
import pathlib
import secrets
import shutil
import socket
import subprocess
import tempfile
from chat_native import ROOT, pg

def run():
    base=ROOT/"tmp"
    base.mkdir(exist_ok=True)
    scratch=pathlib.Path(tempfile.mkdtemp(prefix="notification-native-",dir=base))
    secret=secrets.token_urlsafe(32)
    pw=scratch/"pw"
    pw.write_text(secret,encoding="ascii")
    with socket.socket() as sock:
        sock.bind(("127.0.0.1",0))
        port=sock.getsockname()[1]
    cluster=scratch/"db"
    started=False
    try:
        pg("initdb","-D",cluster,"-U","postgres","-A","scram-sha-256","--pwfile",pw,"-E","UTF8","--no-locale")
        pw.unlink()
        pg("pg_ctl","-D",cluster,"-l",scratch/"pg.log","-o",f"-h 127.0.0.1 -p {port}","-w","start")
        started=True
        tests=ROOT/"tests/communications"
        migrations=ROOT/"supabase/migrations"
        sources=[tests/"chat_fixture.sql",tests/"notifications_fixture.sql"]
        sources.extend(next(migrations.glob(pattern)) for pattern in ("*_erp_communications_chat_v1.sql","*_erp_communication_budget_v1.sql","*_erp_communications_notifications_v1.sql"))
        sources.append(tests/"notifications_native.sql")
        for source in sources:
            try:
                pg("psql","-X","-qAt","-h","127.0.0.1","-p",port,"-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-f",source,env={**os.environ,"PGPASSWORD":secret})
            except subprocess.CalledProcessError as error:
                raise RuntimeError(error.stderr) from None
        print("Notification migration and synthetic actor, stale source, retry, deduplication, payload, read, reply, funded finite ticks, retained ERP writes and scheduler retirement fixtures passed")
    finally:
        if started: pg("pg_ctl","-D",cluster,"-m","fast","-w","stop")
        if scratch.resolve().parent==base.resolve() and scratch.name.startswith("notification-native-"):
            shutil.rmtree(scratch)

if __name__=="__main__": run()
