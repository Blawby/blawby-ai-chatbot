# Durable data recovery

Public launch is blocked until the provider rehearsals in this runbook have a
completed evidence record. Repository tests and provider documentation are not
substitutes for a timed restore.

## Objectives

- Recovery point objective (RPO): no more than 15 minutes of durable writes.
- Recovery time objective (RTO): service restored and tenant integrity verified
  within four hours of declaring recovery.
- Rollback model: restore data forward into compatible code. Never reverse a
  destructive migration in place.

## Data classification and ownership

| Data | Classification after launch | Source of truth | Recovery dependency |
| --- | --- | --- | --- |
| Identity, sessions, memberships, roles, OAuth grants, API keys | Durable | Railway PostgreSQL / Better Auth | Railway PostgreSQL PITR |
| Practices, clients, matters, tasks, time, billing, trust, subscriptions | Durable | Railway PostgreSQL | Railway PostgreSQL PITR |
| Intakes, approvals/audit records, engagement records, backend upload metadata | Durable | Railway PostgreSQL | Railway PostgreSQL PITR |
| Conversations, messages, reactions, Worker approvals/actions, intake diagnostics | Durable until #666 completes | Worker D1 | D1 Time Travel |
| Report schedules, saved search pins, and report-delivery metadata | Durable | Worker D1 | D1 Time Travel |
| Worker-uploaded objects and generated report artifacts | Durable | Worker R2 `blawby-ai-files` | R2 durability plus bucket-lock retention |
| Backend-uploaded objects and signed engagement artifacts | Durable | Backend-configured R2 bucket | R2 durability plus bucket-lock retention |
| KV practice-detail cache, status/subscription TTLs, rate/idempotency counters, search-backfill cookies | Rebuildable | `CHAT_SESSIONS` KV | Refill from PostgreSQL/D1 or allow TTL recreation |
| Search documents/vectors | Rebuildable | D1 search projection + Vectorize | Run the existing backfill from PostgreSQL/D1 |
| Presence, WebSocket membership, counters, pending broadcast state, matter progress | Rebuildable coordination | Durable Objects | Reconnect/recompute from durable records |
| Notification, search, and intake-event queue work | Rebuildable/retryable | Queue + DLQ while in flight | Replay idempotent source events after repair |

No customer-authored record may live only in KV, a queue, Vectorize, or a
Durable Object. Report schedules and saved search pins therefore persist in
D1; the migration from the earlier KV implementation happens before launch
while there are no users.

## Provider mechanisms and required configuration

### Railway PostgreSQL

Required mechanism: Railway PostgreSQL Point-in-Time Recovery (PITR), not the
daily volume snapshot alone. Railway's PITR archives WAL continuously, uses a
60-second archive timeout, and restores into a new sibling service without
modifying the source. The ordinary volume backup cadence is only daily/weekly/
monthly and cannot prove a 15-minute RPO.

- Enable PITR on the production PostgreSQL service.
- Retain at least 30 days of WAL/base backups.
- Wait for the first base backup and confirm the displayed restore window.
- Keep daily, weekly, and monthly volume schedules as a second recovery layer.
- Never wipe the source volume; cut over only after the restored sibling passes
  the verification queries below.

Provider references: [Railway PITR](https://docs.railway.com/volumes/point-in-time-recovery),
[Railway volume backups](https://docs.railway.com/volumes/backups).

### Worker D1

Required mechanism: D1 Time Travel on the production storage backend. Time
Travel resolves a stable bookmark for any minute in the retention window and
can restore to that bookmark. Workers Paid retains 30 days; Free retains 7.

- Verify `wrangler d1 info blawby-ai-chatbot` reports `version: production`.
- Verify a bookmark can be resolved for the current time and 15 minutes ago.
- Record the current bookmark immediately before any recovery.
- Export the current database to controlled encrypted storage before an
  in-place Time Travel restore.
- Retain the `previous_bookmark` returned by restore so the operation can be
  undone.

Time Travel currently restores in place; it does not clone a database. The
isolated rehearsal must therefore use a temporary D1 database populated only
with synthetic records. Provider reference: [D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/).

### R2 objects

R2 provides eleven-nines hardware durability, but an ordinary delete is
irreversible. Both production upload buckets must have bucket-lock rules that
prevent deletion and overwrite for 30 days. Application deletes remain metadata
soft-deletes; object erasure happens only after the retention window and the
documented deletion workflow.

- Apply a 30-day bucket-lock rule to `blawby-ai-files`.
- Apply the same rule to the backend-configured production upload bucket.
- Do not configure an expiration lifecycle on durable upload prefixes.
- Record object key, size, ETag, and checksum in the owning PostgreSQL/D1 row.
- Generated/rebuildable exports may use a separate prefix with a shorter
  lifecycle, but original uploads may not.

Provider references: [R2 durability](https://developers.cloudflare.com/r2/reference/durability/),
[R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/),
[R2 delete semantics](https://developers.cloudflare.com/r2/objects/delete-objects/).

### KV, Durable Objects, queues, and search

These systems are not backup authorities. KV is eventually consistent and is
used only for TTL/cache/counter state. Current Durable Object classes use the
legacy key-value storage backend and are treated as disposable coordination;
their state is rebuilt from D1/PostgreSQL. Queue/DLQ contents are retried only
when the source event is idempotent. Vectorize is rebuilt from durable records.

If a future Durable Object stores customer-authored state, create it with the
SQLite storage backend and add its 30-day PITR rehearsal before launch. Provider
references: [Workers KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/),
[SQLite Durable Object PITR](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).

## Migration and compatibility order

1. Apply additive PostgreSQL migrations and the Worker D1 migration set.
2. Deploy code that can read the old and new shape only for the bounded
   migration window.
3. Backfill or regenerate derived projections.
4. Verify counts, foreign keys, tenant ownership, and checksums.
5. Stop writing the old shape.
6. Remove compatibility code in a later release after the recovery window.

During an incident, deploy code compatible with the selected restore point or
roll forward with additive migrations. Do not run `down` migrations, drop newer
columns, wipe volumes, empty buckets, or delete a D1 database as rollback.

## Isolated rehearsal

Use only the marked launch-test practice and synthetic identifiers. Record UTC
timestamps for every step.

1. PostgreSQL: insert a synthetic owner, membership, practice, client, matter,
   invoice, intake, approval, upload metadata row, and cross-tenant negative
   control. Record commit time `T0`.
2. D1: insert a synthetic conversation, two sequenced messages, an approval
   action, report schedule, and cross-tenant negative control. Record bookmark
   and commit time `T0`.
3. R2: upload a synthetic object whose checksum is also recorded in its metadata
   row. Confirm a delete/overwrite attempt is rejected by bucket lock.
4. Wait at least one minute, then mutate/delete the synthetic database records.
5. Railway: restore a sibling PostgreSQL service to `T0`; never replace the
   source during rehearsal.
6. D1: run Time Travel against a temporary rehearsal database to the recorded
   bookmark, preserving the returned previous bookmark.
7. Verify the restored rows and R2 bytes with the checks below. Rebuild search,
   presence, counters, and derived work rather than restoring those systems.
8. Record the newest durable write absent from the restore (RPO) and elapsed
   time from recovery declaration through verification (RTO).

### Required verification

- Every synthetic durable record exists exactly once.
- Membership and role still reference the restored identity and practice.
- Matter, invoice, intake, approval, conversation, and upload metadata retain
  the same practice ID.
- The negative-control tenant cannot read or mutate the restored records.
- Message sequence is contiguous and no approval is silently executed.
- R2 object size, ETag/checksum, and downloaded bytes match the metadata row.
- Search and other derived views rebuild from the restored sources.
- Measured RPO is `<= 15 minutes`; measured RTO is `<= 4 hours`.

## Evidence record

Store a sanitized `durable-recovery-evidence.json` artifact for 90 days with:

- rehearsal start/end and selected restore timestamps;
- exact frontend and backend Git commits;
- Railway source/restored deployment IDs and restore-window bounds;
- D1 database ID, storage version, selected bookmark, previous bookmark, and
  restore completion time;
- R2 bucket names, lock-rule IDs, retention, and synthetic object checksum;
- counts and boolean integrity outcomes only (no names, emails, object bytes,
  tokens, connection strings, or row payloads);
- measured RPO/RTO and pass/fail status.

Until that artifact exists and every result passes, #723 and the public cutover
in #724 remain open.
