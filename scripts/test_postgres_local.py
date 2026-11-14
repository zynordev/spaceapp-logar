"""Run the whole test suite against a throwaway embedded PostgreSQL.

For machines without PostgreSQL or Docker (e.g. Windows laptops). It starts
a temporary PostgreSQL server with the ``pgserver`` package (not a project
dependency), creates an empty test database, runs pytest with
``TEST_DATABASE_URL`` pointing at it, and stops the server.

Usage (from the repository root):

    uv run --with pgserver python scripts/test_postgres_local.py
    uv run --with pgserver python scripts/test_postgres_local.py -q -x

Extra arguments are passed to pytest. The server's data lives in a temporary
directory and is removed afterwards; your development database is untouched.
"""

import os
import subprocess
import sys
import tempfile
from pathlib import Path

import pgserver

REPO_ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    # ignore_cleanup_errors: on Windows the server's log file can stay locked a
    # moment after shutdown; a leftover temp folder must not fail the run.
    with tempfile.TemporaryDirectory(prefix="logar-pg-", ignore_cleanup_errors=True) as data_dir:
        server = pgserver.get_server(data_dir, cleanup_mode="stop")
        try:
            # get_uri() looks like postgresql://postgres:@127.0.0.1:PORT/postgres
            port = server.get_uri().rsplit(":", 1)[1].split("/")[0]
            server.psql("DROP DATABASE IF EXISTS logar_test;")
            server.psql("CREATE DATABASE logar_test;")
            test_url = f"postgresql://postgres@127.0.0.1:{port}/logar_test"
            print(f"TEST_DATABASE_URL={test_url}", flush=True)

            env = dict(os.environ, TEST_DATABASE_URL=test_url)
            command = ["uv", "run", "pytest", *(sys.argv[1:] or ["-q"])]
            return subprocess.run(command, cwd=REPO_ROOT, env=env).returncode
        finally:
            # Stop the server before its data folder is removed.
            server.cleanup()


if __name__ == "__main__":
    sys.exit(main())
