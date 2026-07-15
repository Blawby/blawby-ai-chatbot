import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDurableRecoveryEvidence } from '../../../scripts/lib/durableRecoveryEvidence.js';

const validEvidence = () => ({
  schemaVersion: 1,
  environment: 'production',
  rehearsal: {
    startedAt: '2026-07-15T00:00:00Z',
    recoveryDeclaredAt: '2026-07-15T00:10:00Z',
    latestDurableWriteAt: '2026-07-15T00:09:00Z',
    latestRecoveredWriteAt: '2026-07-15T00:00:00Z',
    sourceMarkerWatermark: 'marker-source-100',
    recoveredMarkerWatermark: 'marker-recovered-091',
    restoreBoundaryMarkerPresent: true,
    restorePointAt: '2026-07-15T00:05:00Z',
    verificationCompletedAt: '2026-07-15T02:10:00Z',
  },
  releases: {
    frontendWorkerCommit: '0123456789abcdef0123456789abcdef01234567',
    backendGitCommit: '89abcdef0123456789abcdef0123456789abcdef',
  },
  railway: {
    pitrEnabled: true,
    restoredPitrEnabled: true,
    restoredArchiveHealthy: true,
    retentionDays: 30,
    restoreWindowStart: '2026-06-15T00:00:00Z',
    restoreWindowEnd: '2026-07-15T00:10:00Z',
    sourceServiceId: 'railway-source',
    restoredServiceId: 'railway-restored',
    sourceDeploymentId: 'deploy-source',
    restoredDeploymentId: 'deploy-restored',
    writeFenceMode: 'global-block',
    capturedPostTargetWrites: 0,
    replayedPostTargetWrites: 0,
    allTenantReplayVerified: true,
  },
  d1: {
    databaseId: 'd1-rehearsal',
    storageVersion: 'production',
    selectedBookmark: 'bookmark-selected',
    previousBookmark: 'bookmark-previous',
    restoreCompletedAt: '2026-07-15T01:00:00Z',
  },
  r2: {
    buckets: [
      {
        role: 'worker-uploads',
        name: 'blawby-ai-files',
        lockRuleId: 'lock-worker',
        retentionDays: 30,
        preUploadSha256: `sha256:${'ab'.repeat(32)}`,
        overwriteRejected: true,
        deleteRejected: true,
        runtimeObjectTokenScoped: true,
        controlPlaneIdentitySeparate: true,
        lockAuditEventId: 'audit-worker-lock',
        lockEditAlertVerified: true,
      },
      {
        role: 'backend-uploads',
        name: 'blawby-backend-files',
        lockRuleId: 'lock-backend',
        retentionDays: 30,
        preUploadSha256: `sha256:${'cd'.repeat(32)}`,
        overwriteRejected: true,
        deleteRejected: true,
        runtimeObjectTokenScoped: true,
        controlPlaneIdentitySeparate: true,
        lockAuditEventId: 'audit-backend-lock',
        lockEditAlertVerified: true,
      },
    ],
  },
  recordCounts: {
    identities: 1,
    memberships: 1,
    practices: 2,
    clients: 1,
    matters: 1,
    invoices: 1,
    intakes: 1,
    approvals: 1,
    uploads: 2,
    conversations: 1,
    messages: 2,
    reportSchedules: 1,
    crossTenantControls: 1,
  },
  integrity: {
    referentialIntegrity: true,
    tenantIsolation: true,
    financialIntegrity: true,
    approvalsSafe: true,
    objectBytesMatch: true,
    derivedStateRebuilt: true,
  },
});

describe('durable recovery evidence', () => {
  it('refuses to record the unchanged operator example', () => {
    const example = JSON.parse(
      readFileSync(resolve(process.cwd(), 'docs/operations/durable-recovery-evidence.example.json'), 'utf8'),
    );
    expect(() => buildDurableRecoveryEvidence(example)).toThrow('still contains an example value');
  });

  it('normalizes passing production evidence and derives RPO/RTO', () => {
    const result = buildDurableRecoveryEvidence(validEvidence());

    expect(result.metrics).toEqual({ rpoMinutes: 9, rtoMinutes: 120, passed: true });
    expect(result.r2.buckets.map(({ role }) => role)).toEqual(['worker-uploads', 'backend-uploads']);
  });

  it('rejects evidence that exceeds the recovery objectives', () => {
    const rpo = validEvidence();
    rpo.rehearsal.latestDurableWriteAt = '2026-07-15T00:30:00Z';
    rpo.rehearsal.recoveryDeclaredAt = '2026-07-15T00:31:00Z';
    expect(() => buildDurableRecoveryEvidence(rpo)).toThrow('exceeds 15 minutes');

    const rto = validEvidence();
    rto.rehearsal.verificationCompletedAt = '2026-07-15T04:11:00Z';
    expect(() => buildDurableRecoveryEvidence(rto)).toThrow('exceeds 240 minutes');
  });

  it('rejects missing provider and integrity proof', () => {
    const noPitr = validEvidence();
    noPitr.railway.pitrEnabled = false;
    expect(() => buildDurableRecoveryEvidence(noPitr)).toThrow('pitrEnabled must be true');

    const noRestoredPitr = validEvidence();
    noRestoredPitr.railway.restoredArchiveHealthy = false;
    expect(() => buildDurableRecoveryEvidence(noRestoredPitr)).toThrow('restoredArchiveHealthy must be true');

    const shortLock = validEvidence();
    shortLock.r2.buckets[0]!.retentionDays = 29;
    expect(() => buildDurableRecoveryEvidence(shortLock)).toThrow('greater than or equal to 30');

    const failedIsolation = validEvidence();
    failedIsolation.integrity.tenantIsolation = false;
    expect(() => buildDurableRecoveryEvidence(failedIsolation)).toThrow('tenantIsolation must be true');

    const sharedControlPlane = validEvidence();
    sharedControlPlane.r2.buckets[0]!.controlPlaneIdentitySeparate = false;
    expect(() => buildDurableRecoveryEvidence(sharedControlPlane)).toThrow('controlPlaneIdentitySeparate must be true');
  });

  it('rejects incomplete all-tenant write replay and restore markers', () => {
    const replay = validEvidence();
    replay.railway.writeFenceMode = 'capture-and-replay';
    replay.railway.capturedPostTargetWrites = 2;
    replay.railway.replayedPostTargetWrites = 1;
    expect(() => buildDurableRecoveryEvidence(replay)).toThrow('Every captured post-target write must be replayed');

    const marker = validEvidence();
    marker.rehearsal.restoreBoundaryMarkerPresent = false;
    expect(() => buildDurableRecoveryEvidence(marker)).toThrow('restoreBoundaryMarkerPresent must be true');
  });

  it('rejects unexpected fields so the artifact cannot carry arbitrary payloads', () => {
    const source = { ...validEvidence(), connectionString: 'must-not-be-retained' };
    expect(() => buildDurableRecoveryEvidence(source)).toThrow('unexpected: connectionString');
  });

  it('rejects internally inconsistent timestamps', () => {
    const source = validEvidence();
    source.rehearsal.latestDurableWriteAt = '2026-07-15T00:11:00Z';
    expect(() => buildDurableRecoveryEvidence(source)).toThrow('newer than the recovery declaration');
  });
});
