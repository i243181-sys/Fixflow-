#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
database_dir="$project_dir/.local/postgres"
runtime_bin="$database_dir/runtime/usr/lib/postgresql/18/bin"
if [[ ! -x "$runtime_bin/pg_ctl" ]]; then
  runtime_bin="$(pg_config --bindir)"
fi
if [[ ! -f "$database_dir/data/PG_VERSION" ]]; then
  echo "Local cluster is not initialized. See README.md (PostgreSQL setup)." >&2
  exit 1
fi

case "${1:-status}" in
  start)
    if ! "$runtime_bin/pg_ctl" -D "$database_dir/data" status >/dev/null 2>&1; then
      "$runtime_bin/pg_ctl" -D "$database_dir/data" -l "$database_dir/postgres.log" \
        -o "-p 55432 -k $database_dir -c listen_addresses=''" start
    fi
    ;;
  stop) "$runtime_bin/pg_ctl" -D "$database_dir/data" -m fast stop ;;
  status) "$runtime_bin/pg_ctl" -D "$database_dir/data" status ;;
  *) echo "Usage: bash scripts/local_postgres.sh {start|stop|status}" >&2; exit 2 ;;
esac
