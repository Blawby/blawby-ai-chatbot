#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
D1_DIR="$ROOT_DIR/worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject"

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 is required but not installed." >&2
  exit 1
fi

if [[ ! -d "$D1_DIR" ]]; then
  echo "Local D1 directory not found: $D1_DIR" >&2
  exit 1
fi

shopt -s nullglob
db_files=("$D1_DIR"/*.sqlite)
shopt -u nullglob

if [[ ${#db_files[@]} -eq 0 ]]; then
  echo "No local D1 sqlite files found in $D1_DIR" >&2
  exit 1
fi

for db in "${db_files[@]}"; do
  if [[ "$(basename "$db")" == "metadata.sqlite" ]]; then
    continue
  fi

  has_conversations_table="$(sqlite3 "$db" "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'conversations';")"
  if [[ "$has_conversations_table" != "1" ]]; then
    echo "$(basename "$db"): no conversations table, skipping."
    continue
  fi

  before_count="$(sqlite3 "$db" "SELECT COUNT(*) FROM conversations WHERE json_extract(user_info, '\$.mode') IS NULL;")"
  total_before="$(sqlite3 "$db" "SELECT COUNT(*) FROM conversations;")"

  if [[ "$before_count" == "0" ]]; then
    echo "$(basename "$db"): no null-mode conversations to delete."
    continue
  fi

  sqlite3 "$db" "DELETE FROM conversations WHERE json_extract(user_info, '\$.mode') IS NULL;"

  after_count="$(sqlite3 "$db" "SELECT COUNT(*) FROM conversations WHERE json_extract(user_info, '\$.mode') IS NULL;")"
  total_after="$(sqlite3 "$db" "SELECT COUNT(*) FROM conversations;")"

  echo "$(basename "$db"): deleted $before_count null-mode conversations (total $total_before -> $total_after, remaining null-mode: $after_count)"
done
