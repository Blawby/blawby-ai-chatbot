type JsonRecord = Record<string, unknown>;

const REQUIRED_RECORD_COUNTS = [
  'identities',
  'memberships',
  'practices',
  'clients',
  'matters',
  'invoices',
  'intakes',
  'approvals',
  'uploads',
  'conversations',
  'messages',
  'reportSchedules',
  'crossTenantControls',
] as const;

const REQUIRED_INTEGRITY_CHECKS = [
  'referentialIntegrity',
  'tenantIsolation',
  'financialIntegrity',
  'approvalsSafe',
  'objectBytesMatch',
  'derivedStateRebuilt',
] as const;

const asRecord = (value: unknown, path: string): JsonRecord => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as JsonRecord;
};

const requireExactKeys = (record: JsonRecord, expected: readonly string[], path: string): void => {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  const missing = wanted.filter((key) => !actual.includes(key));
  const unexpected = actual.filter((key) => !wanted.includes(key));
  if (missing.length || unexpected.length) {
    throw new Error(
      `${path} has invalid fields (missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'})`,
    );
  }
};

const requireString = (record: JsonRecord, field: string, path: string, pattern?: RegExp): string => {
  const value = record[field];
  if (typeof value !== 'string' || !value.trim() || /[\r\n]/.test(value)) {
    throw new Error(`${path}.${field} must be a non-empty single-line string`);
  }
  const normalized = value.trim();
  if (pattern && !pattern.test(normalized)) throw new Error(`${path}.${field} has an invalid format`);
  return normalized;
};

const requireBoolean = (record: JsonRecord, field: string, path: string, expected = true): boolean => {
  const value = record[field];
  if (typeof value !== 'boolean') throw new Error(`${path}.${field} must be a boolean`);
  if (value !== expected) throw new Error(`${path}.${field} must be ${expected}`);
  return value;
};

const requireInteger = (record: JsonRecord, field: string, path: string, minimum: number): number => {
  const value = record[field];
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new Error(`${path}.${field} must be an integer greater than or equal to ${minimum}`);
  }
  return value as number;
};

const requireTimestamp = (record: JsonRecord, field: string, path: string): { iso: string; millis: number } => {
  const value = requireString(record, field, path);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error(`${path}.${field} must be an ISO-8601 timestamp with a timezone`);
  }
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) throw new Error(`${path}.${field} is not a valid timestamp`);
  return { iso: new Date(millis).toISOString(), millis };
};

const minutesBetween = (earlier: number, later: number, label: string): number => {
  if (later < earlier) throw new Error(`${label} timestamps are out of order`);
  return Math.round(((later - earlier) / 60_000) * 100) / 100;
};

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const commitPattern = /^[0-9a-f]{40}$/i;
const bucketPattern = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const checksumPattern = /^sha256:[0-9a-f]{64}$/i;

const rejectExampleValue = (value: string, path: string): void => {
  if (value.startsWith('example-')) throw new Error(`${path} still contains an example value`);
};

export const buildDurableRecoveryEvidence = (source: unknown) => {
  const root = asRecord(source, 'evidence');
  requireExactKeys(
    root,
    ['schemaVersion', 'environment', 'rehearsal', 'releases', 'railway', 'd1', 'r2', 'recordCounts', 'integrity'],
    'evidence',
  );
  if (root.schemaVersion !== 1) throw new Error('evidence.schemaVersion must be 1');
  if (root.environment !== 'production') throw new Error('evidence.environment must be production');

  const rehearsal = asRecord(root.rehearsal, 'evidence.rehearsal');
  requireExactKeys(
    rehearsal,
    [
      'startedAt',
      'recoveryDeclaredAt',
      'latestDurableWriteAt',
      'latestRecoveredWriteAt',
      'sourceMarkerWatermark',
      'recoveredMarkerWatermark',
      'restoreBoundaryMarkerPresent',
      'restorePointAt',
      'verificationCompletedAt',
    ],
    'evidence.rehearsal',
  );
  const startedAt = requireTimestamp(rehearsal, 'startedAt', 'evidence.rehearsal');
  const recoveryDeclaredAt = requireTimestamp(rehearsal, 'recoveryDeclaredAt', 'evidence.rehearsal');
  const latestDurableWriteAt = requireTimestamp(rehearsal, 'latestDurableWriteAt', 'evidence.rehearsal');
  const latestRecoveredWriteAt = requireTimestamp(rehearsal, 'latestRecoveredWriteAt', 'evidence.rehearsal');
  const sourceMarkerWatermark = requireString(rehearsal, 'sourceMarkerWatermark', 'evidence.rehearsal', idPattern);
  const recoveredMarkerWatermark = requireString(
    rehearsal,
    'recoveredMarkerWatermark',
    'evidence.rehearsal',
    idPattern,
  );
  const restoreBoundaryMarkerPresent = requireBoolean(
    rehearsal,
    'restoreBoundaryMarkerPresent',
    'evidence.rehearsal',
  );
  rejectExampleValue(sourceMarkerWatermark, 'evidence.rehearsal.sourceMarkerWatermark');
  rejectExampleValue(recoveredMarkerWatermark, 'evidence.rehearsal.recoveredMarkerWatermark');
  const restorePointAt = requireTimestamp(rehearsal, 'restorePointAt', 'evidence.rehearsal');
  const verificationCompletedAt = requireTimestamp(rehearsal, 'verificationCompletedAt', 'evidence.rehearsal');
  minutesBetween(startedAt.millis, recoveryDeclaredAt.millis, 'Rehearsal');
  minutesBetween(startedAt.millis, latestRecoveredWriteAt.millis, 'Recovered-write');
  const rpoMinutes = minutesBetween(latestRecoveredWriteAt.millis, latestDurableWriteAt.millis, 'RPO');
  const rtoMinutes = minutesBetween(recoveryDeclaredAt.millis, verificationCompletedAt.millis, 'RTO');
  if (latestDurableWriteAt.millis > recoveryDeclaredAt.millis) {
    throw new Error('Latest durable write cannot be newer than the recovery declaration');
  }
  if (restorePointAt.millis < latestRecoveredWriteAt.millis) {
    throw new Error('Selected restore point cannot be older than the latest recovered write');
  }
  if (restorePointAt.millis > recoveryDeclaredAt.millis) {
    throw new Error('Selected restore point cannot be newer than the recovery declaration');
  }
  if (rpoMinutes > 15) throw new Error(`Measured RPO ${rpoMinutes} minutes exceeds 15 minutes`);
  if (rtoMinutes > 240) throw new Error(`Measured RTO ${rtoMinutes} minutes exceeds 240 minutes`);

  const releases = asRecord(root.releases, 'evidence.releases');
  requireExactKeys(releases, ['frontendWorkerCommit', 'backendGitCommit'], 'evidence.releases');
  const normalizedReleases = {
    frontendWorkerCommit: requireString(releases, 'frontendWorkerCommit', 'evidence.releases', commitPattern),
    backendGitCommit: requireString(releases, 'backendGitCommit', 'evidence.releases', commitPattern),
  };
  for (const [field, commit] of Object.entries(normalizedReleases)) {
    if (/^([0-9a-f])\1{39}$/i.test(commit)) {
      throw new Error(`evidence.releases.${field} still contains an example value`);
    }
  }

  const railway = asRecord(root.railway, 'evidence.railway');
  requireExactKeys(
    railway,
    [
      'pitrEnabled',
      'restoredPitrEnabled',
      'restoredArchiveHealthy',
      'retentionDays',
      'restoreWindowStart',
      'restoreWindowEnd',
      'sourceServiceId',
      'restoredServiceId',
      'sourceDeploymentId',
      'restoredDeploymentId',
      'writeFenceMode',
      'capturedPostTargetWrites',
      'replayedPostTargetWrites',
      'allTenantReplayVerified',
    ],
    'evidence.railway',
  );
  const restoreWindowStart = requireTimestamp(railway, 'restoreWindowStart', 'evidence.railway');
  const restoreWindowEnd = requireTimestamp(railway, 'restoreWindowEnd', 'evidence.railway');
  if (restoreWindowStart.millis > restorePointAt.millis || restoreWindowEnd.millis < restorePointAt.millis) {
    throw new Error('Selected restore point is outside the recorded Railway restore window');
  }
  const normalizedRailway = {
    pitrEnabled: requireBoolean(railway, 'pitrEnabled', 'evidence.railway'),
    restoredPitrEnabled: requireBoolean(railway, 'restoredPitrEnabled', 'evidence.railway'),
    restoredArchiveHealthy: requireBoolean(railway, 'restoredArchiveHealthy', 'evidence.railway'),
    retentionDays: requireInteger(railway, 'retentionDays', 'evidence.railway', 30),
    restoreWindowStart: restoreWindowStart.iso,
    restoreWindowEnd: restoreWindowEnd.iso,
    sourceServiceId: requireString(railway, 'sourceServiceId', 'evidence.railway', idPattern),
    restoredServiceId: requireString(railway, 'restoredServiceId', 'evidence.railway', idPattern),
    sourceDeploymentId: requireString(railway, 'sourceDeploymentId', 'evidence.railway', idPattern),
    restoredDeploymentId: requireString(railway, 'restoredDeploymentId', 'evidence.railway', idPattern),
    writeFenceMode: railway.writeFenceMode,
    capturedPostTargetWrites: requireInteger(railway, 'capturedPostTargetWrites', 'evidence.railway', 0),
    replayedPostTargetWrites: requireInteger(railway, 'replayedPostTargetWrites', 'evidence.railway', 0),
    allTenantReplayVerified: requireBoolean(railway, 'allTenantReplayVerified', 'evidence.railway'),
  };
  if (normalizedRailway.writeFenceMode !== 'global-block' && normalizedRailway.writeFenceMode !== 'capture-and-replay') {
    throw new Error('evidence.railway.writeFenceMode must be global-block or capture-and-replay');
  }
  if (normalizedRailway.capturedPostTargetWrites !== normalizedRailway.replayedPostTargetWrites) {
    throw new Error('Every captured post-target write must be replayed before cutover');
  }
  if (
    normalizedRailway.writeFenceMode === 'global-block' &&
    (normalizedRailway.capturedPostTargetWrites !== 0 || normalizedRailway.replayedPostTargetWrites !== 0)
  ) {
    throw new Error('Global-block evidence must have zero captured and replayed post-target writes');
  }
  if (normalizedRailway.sourceServiceId === normalizedRailway.restoredServiceId) {
    throw new Error('Railway rehearsal must restore into a sibling service');
  }
  for (const [field, value] of Object.entries(normalizedRailway)) {
    if (typeof value === 'string' && field.endsWith('Id')) rejectExampleValue(value, `evidence.railway.${field}`);
  }

  const d1 = asRecord(root.d1, 'evidence.d1');
  requireExactKeys(
    d1,
    ['databaseId', 'storageVersion', 'selectedBookmark', 'previousBookmark', 'restoreCompletedAt'],
    'evidence.d1',
  );
  if (d1.storageVersion !== 'production') throw new Error('evidence.d1.storageVersion must be production');
  const d1RestoreCompletedAt = requireTimestamp(d1, 'restoreCompletedAt', 'evidence.d1');
  if (d1RestoreCompletedAt.millis < recoveryDeclaredAt.millis) {
    throw new Error('D1 restore completion cannot be earlier than the recovery declaration');
  }
  if (d1RestoreCompletedAt.millis > verificationCompletedAt.millis) {
    throw new Error('D1 restore completion cannot be later than final verification');
  }
  const normalizedD1 = {
    databaseId: requireString(d1, 'databaseId', 'evidence.d1', idPattern),
    storageVersion: 'production' as const,
    selectedBookmark: requireString(d1, 'selectedBookmark', 'evidence.d1', idPattern),
    previousBookmark: requireString(d1, 'previousBookmark', 'evidence.d1', idPattern),
    restoreCompletedAt: d1RestoreCompletedAt.iso,
  };
  rejectExampleValue(normalizedD1.databaseId, 'evidence.d1.databaseId');
  rejectExampleValue(normalizedD1.selectedBookmark, 'evidence.d1.selectedBookmark');
  rejectExampleValue(normalizedD1.previousBookmark, 'evidence.d1.previousBookmark');

  const r2 = asRecord(root.r2, 'evidence.r2');
  requireExactKeys(r2, ['buckets'], 'evidence.r2');
  if (!Array.isArray(r2.buckets) || r2.buckets.length !== 2) {
    throw new Error('evidence.r2.buckets must contain the worker and backend upload buckets');
  }
  const normalizedBuckets = r2.buckets.map((value, index) => {
    const path = `evidence.r2.buckets[${index}]`;
    const bucket = asRecord(value, path);
    requireExactKeys(
      bucket,
      [
        'role',
        'name',
        'lockRuleId',
        'retentionDays',
        'preUploadSha256',
        'overwriteRejected',
        'deleteRejected',
        'runtimeObjectTokenScoped',
        'controlPlaneIdentitySeparate',
        'lockAuditEventId',
        'lockEditAlertVerified',
      ],
      path,
    );
    if (bucket.role !== 'worker-uploads' && bucket.role !== 'backend-uploads') {
      throw new Error(`${path}.role must be worker-uploads or backend-uploads`);
    }
    return {
      role: bucket.role,
      name: requireString(bucket, 'name', path, bucketPattern),
      lockRuleId: requireString(bucket, 'lockRuleId', path, idPattern),
      retentionDays: requireInteger(bucket, 'retentionDays', path, 30),
      preUploadSha256: requireString(bucket, 'preUploadSha256', path, checksumPattern).toLowerCase(),
      overwriteRejected: requireBoolean(bucket, 'overwriteRejected', path),
      deleteRejected: requireBoolean(bucket, 'deleteRejected', path),
      runtimeObjectTokenScoped: requireBoolean(bucket, 'runtimeObjectTokenScoped', path),
      controlPlaneIdentitySeparate: requireBoolean(bucket, 'controlPlaneIdentitySeparate', path),
      lockAuditEventId: requireString(bucket, 'lockAuditEventId', path, idPattern),
      lockEditAlertVerified: requireBoolean(bucket, 'lockEditAlertVerified', path),
    };
  });
  if (new Set(normalizedBuckets.map(({ role }) => role)).size !== 2) {
    throw new Error('Evidence must include one worker-uploads and one backend-uploads bucket result');
  }
  normalizedBuckets.forEach((bucket, index) => {
    const path = `evidence.r2.buckets[${index}]`;
    rejectExampleValue(bucket.name, `${path}.name`);
    rejectExampleValue(bucket.lockRuleId, `${path}.lockRuleId`);
    rejectExampleValue(bucket.lockAuditEventId, `${path}.lockAuditEventId`);
    if (/^sha256:([0-9a-f])\1{63}$/i.test(bucket.preUploadSha256)) {
      throw new Error(`${path}.preUploadSha256 still contains an example value`);
    }
  });

  const recordCounts = asRecord(root.recordCounts, 'evidence.recordCounts');
  requireExactKeys(recordCounts, REQUIRED_RECORD_COUNTS, 'evidence.recordCounts');
  const normalizedRecordCounts = Object.fromEntries(
    REQUIRED_RECORD_COUNTS.map((field) => [field, requireInteger(recordCounts, field, 'evidence.recordCounts', 1)]),
  );

  const integrity = asRecord(root.integrity, 'evidence.integrity');
  requireExactKeys(integrity, REQUIRED_INTEGRITY_CHECKS, 'evidence.integrity');
  const normalizedIntegrity = Object.fromEntries(
    REQUIRED_INTEGRITY_CHECKS.map((field) => [field, requireBoolean(integrity, field, 'evidence.integrity')]),
  );

  return {
    schemaVersion: 1,
    environment: 'production' as const,
    rehearsal: {
      startedAt: startedAt.iso,
      recoveryDeclaredAt: recoveryDeclaredAt.iso,
      latestDurableWriteAt: latestDurableWriteAt.iso,
      latestRecoveredWriteAt: latestRecoveredWriteAt.iso,
      sourceMarkerWatermark,
      recoveredMarkerWatermark,
      restoreBoundaryMarkerPresent,
      restorePointAt: restorePointAt.iso,
      verificationCompletedAt: verificationCompletedAt.iso,
    },
    releases: normalizedReleases,
    railway: normalizedRailway,
    d1: normalizedD1,
    r2: { buckets: normalizedBuckets },
    recordCounts: normalizedRecordCounts,
    integrity: normalizedIntegrity,
    metrics: { rpoMinutes, rtoMinutes, passed: true },
  };
};
