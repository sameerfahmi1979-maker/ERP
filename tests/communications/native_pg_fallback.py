"""Explicit PG17.10 lab fallback. No Docker repair/install, existing service, or recursive deletion.

with NativePgDockerShim(label="fixture") as shim:
    original = subprocess.run
    try:
        subprocess.run = shim.run
        existing_docker_fixture()
    finally:
        subprocess.run = original

Only docker run/exec-psql/rm are emulated. Non-Docker commands use the original runner.
The global lock permits ONE protected SCRAM loopback cluster at a time. Stopped data is retained.
"""
import json
import os
import pathlib
import secrets
import shutil
import socket
import subprocess
import time
import uuid
import msvcrt

_REAL_RUN = subprocess.run
ROOT = pathlib.Path(__file__).resolve().parents[2]
PGBIN = pathlib.Path(r"C:\Program Files\PostgreSQL\17\bin")
LOCK = pathlib.Path(r"C:\dev\.cache\erp-communications-native.lock")
MIN_FREE = 512 * 1024 * 1024
MAX_GROWTH = 256 * 1024 * 1024
HIDDEN = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


class NativeFixtureLock:
    """OS byte lock on the SAME retained file. Never replace, truncate, rewrite or unlink its metadata."""
    def __init__(self, timeout=300):
        self.timeout = timeout
        self.stream = None

    def __enter__(self):
        LOCK.parent.mkdir(parents=True, exist_ok=True)
        self.stream = LOCK.open("a+b")
        deadline = time.monotonic() + self.timeout
        while True:
            try:
                self.stream.seek(0)
                msvcrt.locking(self.stream.fileno(), msvcrt.LK_NBLCK, 1)
                return self
            except OSError:
                if time.monotonic() >= deadline:
                    self.stream.close()
                    self.stream = None
                    raise TimeoutError("Another native fixture holds the OS advisory byte lock")
                time.sleep(.1)

    def __exit__(self, exc_type, exc, traceback):
        if self.stream is not None:
            self.stream.seek(0)
            msvcrt.locking(self.stream.fileno(), msvcrt.LK_UNLCK, 1)
            self.stream.close()
            self.stream = None


class NativePgDockerShim:
    def __init__(self, label="fixture"):
        self.label = "".join(c for c in label if c.isalnum() or c in "-_")[:40]
        self.nonce = uuid.uuid4().hex
        self.locked = False
        self.directory = None
        self.data = None
        self.name = None
        self.owned_pid = None
        self.stopped = True
        self.start_requested = False
        self.calls = 0

    def __enter__(self):
        assert os.name == "nt", "This explicit fallback is Windows-only"
        self.mutex = NativeFixtureLock()
        self.mutex.__enter__()
        self.locked = True
        if shutil.disk_usage(ROOT).free < MIN_FREE:
            self._unlock()
            raise RuntimeError("Native fixture requires at least 512 MiB free before cluster creation")
        try:
            version = self._real([str(PGBIN / "postgres.exe"), "--version"], text=True, capture_output=True, check=True).stdout.strip()
        except Exception:
            self._unlock()
            raise
        if not version.startswith("postgres (PostgreSQL) 17.10"):
            self._unlock()
            raise RuntimeError("Fallback requires the existing reviewed PostgreSQL 17.10 binary")
        self.version = version
        return self

    def _real(self, args, **kwargs):
        kwargs.setdefault("creationflags", HIDDEN)
        return _REAL_RUN(args, **kwargs)

    def _bytes(self):
        total = 0
        if self.directory:
            for path in self.directory.rglob("*"):
                try:
                    if path.is_file():
                        total += path.stat().st_size
                except FileNotFoundError:
                    pass
        return total

    def _guard(self):
        if self._bytes() > MAX_GROWTH:
            raise RuntimeError("Owned native fixture exceeded its 256 MiB growth cap; stop and retain it")
        if shutil.disk_usage(ROOT).free < 128 * 1024 * 1024:
            raise RuntimeError("Disk floor reached; stop and retain the owned fixture")

    def _create(self, name):
        if self.directory is not None:
            raise RuntimeError("One native cluster per shim; no second Docker service is emulated")
        if any((ROOT / "tmp").glob("native-pg1710-*/db/postmaster.pid")):
            raise RuntimeError("An owned native lab still has postmaster.pid; no second cluster will be created")
        self.name = name
        self.directory = (ROOT / "tmp" / ("native-pg1710-" + self.label + "-" + self.nonce[:12])).resolve()
        assert str(self.directory).lower().startswith(str((ROOT / "tmp").resolve()).lower() + os.sep)
        self.directory.mkdir(parents=True, exist_ok=False)
        literal = str(self.directory).replace("'", "''")
        acl_script = f"""$ErrorActionPreference='Stop';$p='{literal}';$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
$acl=New-Object Security.AccessControl.DirectorySecurity
if ([IO.FileSystemAclExtensions]::GetAccessControl([IO.DirectoryInfo]::new($p)).GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) {{ throw 'Unexpected fixture owner' }}
$acl.SetAccessRuleProtection($true,$false)
foreach($principal in @($sid.Value,'S-1-5-18')){{
$identity=[Security.Principal.SecurityIdentifier]$principal
$rule=New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule)
}}
[IO.FileSystemAclExtensions]::SetAccessControl([IO.DirectoryInfo]::new($p),$acl)
"""
        import base64
        protected = self._real(["pwsh.exe", "-NoProfile", "-NonInteractive", "-EncodedCommand", base64.b64encode(acl_script.encode("utf-16le")).decode()],
                               text=True, capture_output=True)
        if protected.returncode:
            raise RuntimeError("Owned synthetic folder ACL setup failed: " + protected.stderr)
        self.password = secrets.token_urlsafe(48)
        password_file = self.directory / "password.txt"
        password_file.write_text(self.password, encoding="ascii")
        self.data = self.directory / "db"
        initialized = self._real([str(PGBIN / "initdb.exe"), "-D", str(self.data), "-U", "postgres", "-A", "scram-sha-256",
                                "--pwfile", str(password_file), "-E", "UTF8", "--no-locale"], text=True, capture_output=True)
        password_file.unlink()  # Exact owned synthetic-password file only. No directory deletion.
        if initialized.returncode:
            raise RuntimeError("Synthetic native initdb failed: " + initialized.stderr)
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            self.port = probe.getsockname()[1]
        self.start_requested = True
        self.stopped = False
        started = self._real([str(PGBIN / "pg_ctl.exe"), "-D", str(self.data), "-l", str(self.directory / "pg.log"),
                              "-o", f"-h 127.0.0.1 -p {self.port} -c shared_buffers=16MB -c max_connections=16 -c max_wal_size=32MB -c min_wal_size=32MB",
                              "-w", "start"], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, text=True)
        if started.returncode:
            raise RuntimeError("Owned native PostgreSQL could not start")
        lines = self._pid_lines()
        self.owned_pid = int(lines[0])
        assert pathlib.Path(lines[1]).resolve() == self.data.resolve()
        self._guard()

    def _pid_lines(self):
        deadline = time.monotonic() + 5
        while True:
            try:
                lines = (self.data / "postmaster.pid").read_text().splitlines()
                if len(lines)>=2:
                    return lines
            except FileNotFoundError:
                pass
            if time.monotonic()>=deadline:
                raise RuntimeError("Owned postmaster PID file was not confirmed after bounded startup wait")
            time.sleep(.1)

    def run(self, args, **kwargs):
        args = list(map(str, args))
        if not args or pathlib.Path(args[0]).name.lower() not in ("docker", "docker.exe"):
            return self._real(args, **kwargs)
        operation = args[1] if len(args) > 1 else ""
        if operation == "run":
            if not self.locked:
                raise RuntimeError("Native shim must be entered before use")
            name = args[args.index("--name") + 1]
            self._create(name)
            return subprocess.CompletedProcess(args, 0, "native-pg1710:" + self.nonce + "\n", "")
        if operation == "exec":
            if self.stopped or self.name not in args or "psql" not in args:
                raise RuntimeError("Only the owned running fixture's psql is supported")
            lines = self._pid_lines()
            if int(lines[0]) != self.owned_pid or pathlib.Path(lines[1]).resolve() != self.data.resolve():
                raise RuntimeError("Owned PostgreSQL PID/data identity changed")
            self.calls += 1
            if self.calls % 8 == 0:
                self._guard()
            options = args[args.index("psql") + 1:]
            if any("postgres://" in item or "postgresql://" in item for item in options):
                raise RuntimeError("Connection URLs are not allowed in the synthetic native fixture")
            environment = dict(kwargs.pop("env", os.environ))
            environment.update(PGPASSWORD=self.password, PGCONNECT_TIMEOUT="5", PGHOST="127.0.0.1", PGPORT=str(self.port))
            return self._real([str(PGBIN / "psql.exe"), *options, "-h", "127.0.0.1", "-p", str(self.port)], env=environment, **kwargs)
        if operation == "rm":
            if self.name not in args:
                raise RuntimeError("Refusing cleanup of a different native fixture")
            self.stop()
            return subprocess.CompletedProcess(args, 0, self.name + "\n", "")
        raise RuntimeError("No Docker daemon operation is allowed in local PostgreSQL mode: " + operation)

    def stop(self):
        if self.stopped:
            return
        lines = self._pid_lines()
        if self.owned_pid is None and self.start_requested and pathlib.Path(lines[1]).resolve()==self.data.resolve():
            self.owned_pid=int(lines[0]) # Exact unique protected data directory handed to our one pg_ctl start.
        if int(lines[0]) != self.owned_pid or pathlib.Path(lines[1]).resolve() != self.data.resolve():
            raise RuntimeError("Refusing to stop a different PID or data directory")
        result = self._real([str(PGBIN / "pg_ctl.exe"), "-D", str(self.data), "-m", "fast", "-w", "stop"],
                            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        if result.returncode:
            raise RuntimeError("Owned native PostgreSQL stop was not confirmed")
        self.stopped = True
        self.retained_bytes = self._bytes()
        receipt = {"fixture": self.label, "version": self.version, "directory": str(self.directory), "ownedPid": self.owned_pid,
                   "loopbackPort": self.port, "stopped": True, "retainedBytes": self.retained_bytes,
                   "maximumBytes": MAX_GROWTH, "syntheticOnly": True, "dockerUsed": False, "passwordRetained": False}
        (self.directory / "native-fixture-receipt.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
        print("Retained stopped PG17.10 fixture: " + str(self.directory) + "; bytes=" + str(self.retained_bytes), flush=True)

    def _unlock(self):
        if self.locked:
            self.mutex.__exit__(None, None, None)
            self.locked = False

    def __exit__(self, exc_type, exc, traceback):
        try:
            self.stop()
        finally:
            # An unconfirmed stop retains the lock for owner review; never allow a second cluster.
            if self.stopped:
                self._unlock()
