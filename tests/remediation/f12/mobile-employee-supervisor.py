"""Run with Python 3.11+, PostgreSQL 17 --pg-bin DIR and PostgREST 14.1 --postgrest EXE."""

import argparse
from contextlib import ExitStack
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen


def employee_projection(repo):
    # Execute the projection shipped with employeeRecord. A copied join would miss regressions.
    fields = (repo / "src/lib/hr/employee-public-fields.ts").read_text()
    route = (repo / "src/server/mobile/hr-directory.ts").read_text()
    base = re.search(r'EMPLOYEE_PUBLIC_FIELDS\s*=\s*("[^"]+")', fields)
    joins = re.search(r'\.select\(\s*EMPLOYEE_PUBLIC_FIELDS\s*\+\s*("[^"]+")\s*\)', route)
    if not base or not joins:
        raise ValueError("Employee projection construction changed; update the integration fixture.")
    return json.loads(base[1]) + json.loads(joins[1])


def read_json(url):
    try:
        with urlopen(url, timeout=5) as response:
            return json.load(response)
    except HTTPError as error:
        raise AssertionError(f"PostgREST HTTP {error.code}: {error.read().decode()}") from error


def verify_graph(base, projection):
    for employee, supervisor in [(2, {"full_name_en": "Supervisor"}), (1, None), (5, None)]:
        query = urlencode({"select": projection, "id": f"eq.{employee}", "deleted_at": "is.null"})
        rows = read_json(f"{base}/employees?{query}")
        if len(rows) != 1 or rows[0]["id"] != employee or rows[0]["supervisor"] != supervisor:
            raise AssertionError(f"Unexpected supervisor for fixture {employee}: {rows!r}")
        print(f"PASS employee {employee}: supervisor = {supervisor!r}")
    if read_json(f"{base}/employees?select=id&id=eq.4") != []:
        raise AssertionError("The out-of-scope employee was directly readable")
    print("PASS out-of-scope supervisor is invisible to the fixture reader")


def run(pg_bin, postgrest, scratch):
    fixture = Path(__file__).with_name("mobile-employee-supervisor.fixture.sql").resolve()
    projection = employee_projection(fixture.parents[3])
    env = {**os.environ, "PATH": str(pg_bin) + os.pathsep + os.environ["PATH"]}
    for tool, version in [(pg_bin / "pg_ctl", "17."), (postgrest, "14.1")]:
        installed = subprocess.check_output([tool, "--version"], env=env, text=True).strip()
        if not re.search(r"\b" + re.escape(version) + (r"\d+" if version.endswith(".") else r"\b"), installed):
            raise ValueError(f"Unexpected tool version: {installed}")
        print(installed, flush=True)
    with ExitStack() as stack:
        lab = Path(stack.enter_context(tempfile.TemporaryDirectory(dir=scratch)))
        with socket.socket() as db_socket, socket.socket() as api_socket:
            db_socket.bind(("127.0.0.1", 0))
            api_socket.bind(("127.0.0.1", 0))
            db_port, api_port = db_socket.getsockname()[1], api_socket.getsockname()[1]
        pg_data = lab / "pg"
        subprocess.run([pg_bin / "initdb", "-D", pg_data, "-U", "postgres", "-A", "trust",
                        "--no-locale", "--encoding=UTF8"], check=True, stdout=subprocess.DEVNULL)
        control = [pg_bin / "pg_ctl", "-D", pg_data, "-w"]
        subprocess.run([*control, "-l", lab / "postgres.log", "-o", f"-h 127.0.0.1 -p {db_port}", "start"], check=True)
        stack.callback(subprocess.run, [*control, "-m", "fast", "stop"], check=True)
        subprocess.run([pg_bin / "psql", "-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1",
                        "-p", str(db_port), "-U", "postgres", "-d", "postgres", "-f", fixture], check=True)
        # pg_read_all_data is a built-in role that honors RLS. No login, JWT or grants are needed.
        env = {k: v for k, v in env.items() if not k.startswith("PGRST_")}
        env.update(PGRST_DB_URI=f"postgresql://postgres@127.0.0.1:{db_port}/postgres",
                   PGRST_DB_ANON_ROLE="pg_read_all_data", PGRST_SERVER_HOST="127.0.0.1",
                   PGRST_SERVER_PORT=str(api_port), PGRST_DB_SCHEMAS="public")
        server = subprocess.Popen([postgrest], cwd=lab, env=env)
        stack.callback(server.wait, timeout=10)
        stack.callback(server.terminate)
        base = f"http://127.0.0.1:{api_port}"
        for _ in range(100):
            if server.poll() is not None:
                raise RuntimeError("PostgREST exited during startup")
            try:
                with urlopen(base + "/", timeout=1):
                    break
            except (URLError, TimeoutError):
                time.sleep(0.1)
        else:
            raise TimeoutError("PostgREST did not become ready")
        verify_graph(base, projection)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", required=True, type=Path)
    parser.add_argument("--postgrest", required=True, type=Path)
    parser.add_argument("--scratch", type=Path, help="Parent of the disposable test cluster")
    args = parser.parse_args()
    run(args.pg_bin.resolve(), args.postgrest.resolve(), args.scratch)
