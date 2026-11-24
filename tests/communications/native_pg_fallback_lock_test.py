"""Non-destructive two-process lock proof on the exact retained shared file. No PostgreSQL is started."""
import hashlib
import os
import pathlib
import subprocess
import sys
from native_pg_fallback import LOCK

before = LOCK.read_bytes()
module_directory = str(pathlib.Path(__file__).resolve().parent)
environment = {**os.environ, "PYTHONPATH": module_directory}
holder_code = "import os,sys\nfrom native_pg_fallback import NativeFixtureLock\nlock=NativeFixtureLock(timeout=2);lock.__enter__();print('held',flush=True);sys.stdin.readline();os._exit(0)\n"
contender_code = "import sys\nfrom native_pg_fallback import NativeFixtureLock\ntry:\n with NativeFixtureLock(timeout=.2): print('unexpected',flush=True)\nexcept TimeoutError: print('blocked',flush=True)\nsys.stdin.readline()\nwith NativeFixtureLock(timeout=2): print('acquired',flush=True)\n"
def child(code):
    return subprocess.Popen([sys.executable,"-c",code],env=environment,text=True,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                            creationflags=subprocess.CREATE_NO_WINDOW)
holder=child(holder_code);contender=None
try:
    assert holder.stdout.readline().strip()=="held"
    contender=child(contender_code)
    assert contender.stdout.readline().strip()=="blocked", "Second process must not acquire while the first owns byte zero"
    holder.stdin.write("exit\n");holder.stdin.flush();assert holder.wait(timeout=5)==0
    contender.stdin.write("retry\n");contender.stdin.flush()
    assert contender.stdout.readline().strip()=="acquired", "OS must release the first process's lock on exit without an explicit unlock"
    assert contender.wait(timeout=5)==0
finally:
    for process in (holder,contender):
        if process is not None and process.poll() is None:
            process.terminate();process.wait(timeout=5) # Exact child handles created by this test only; no service/process scan.
assert LOCK.read_bytes() == before, "Existing lock metadata must remain byte-for-byte unchanged"
print("PASS same-file OS byte lock: second process blocked then acquired after holder exited without unlock; metadata SHA-256 unchanged=" + hashlib.sha256(before).hexdigest())
