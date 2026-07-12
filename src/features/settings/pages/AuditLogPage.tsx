import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { Download, FileClock, RefreshCw, Search } from 'lucide-preact';

import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingsCard } from '@/features/settings/components/SettingsCard';
import { SettingsNotice } from '@/features/settings/components/SettingsNotice';
import { auditLogApi, type AuditLogEntry } from '@/features/settings/services/auditLogApi';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/input';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { triggerDownload } from '@/shared/utils/fileDownload';

export interface AuditLogPageProps {
  className?: string;
}

const sourceLabel: Record<AuditLogEntry['source']['system'], string> = {
  domain_event: 'Domain event',
  matter_activity: 'Matter activity',
  upload_audit: 'File activity',
};

const formatOccurredAt = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

const actorLabel = (entry: AuditLogEntry): string =>
  entry.actor.name ?? entry.actor.email ?? (entry.actor.type === 'user' ? 'Unknown user' : entry.actor.type);

export const AuditLogPage = ({ className = '' }: AuditLogPageProps) => {
  const { currentPractice } = usePracticeManagement({ fetchPracticeDetails: true });
  const { showError, showSuccess } = useToastContext();
  const practiceId = useMemo(
    () => currentPractice?.betterAuthOrgId ?? currentPractice?.id ?? null,
    [currentPractice?.betterAuthOrgId, currentPractice?.id],
  );
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFirstPage = useCallback(async (signal?: AbortSignal) => {
    if (!practiceId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await auditLogApi.list(practiceId, { limit: 50, search: search || undefined }, signal);
      if (signal?.aborted) return;
      setEntries(result.data);
      setNextCursor(result.page_info.next_cursor);
    } catch (loadError) {
      if (signal?.aborted) return;
      setEntries([]);
      setNextCursor(null);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load the audit log.');
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [practiceId, search]);

  useEffect(() => {
    if (!practiceId) return;
    const controller = new AbortController();
    void loadFirstPage(controller.signal);
    return () => controller.abort();
  }, [loadFirstPage, practiceId]);

  const loadMore = async () => {
    if (!practiceId || !nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const result = await auditLogApi.list(practiceId, {
        cursor: nextCursor,
        limit: 50,
        search: search || undefined,
      });
      setEntries((current) => [...current, ...result.data]);
      setNextCursor(result.page_info.next_cursor);
    } catch (loadError) {
      showError('Audit events not loaded', loadError instanceof Error ? loadError.message : 'Unable to load more events.');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const exportCsv = async () => {
    if (!practiceId || isExporting) return;
    setIsExporting(true);
    try {
      const { blob, filename } = await auditLogApi.exportCsv(practiceId, { search: search || undefined });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, filename);
      setTimeout(() => URL.revokeObjectURL(url), 0);
      showSuccess('Audit log downloaded', filename);
    } catch (exportError) {
      showError('Audit export failed', exportError instanceof Error ? exportError.message : 'Unable to export audit events.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={className}>
      <SettingSection
        first
        title="Audit log"
        description="Immutable practice events with actor, target, timestamp, and source provenance."
      >
        {!practiceId ? (
          <SettingsNotice variant="warning">Select a practice to review its audit history.</SettingsNotice>
        ) : (
          <SettingsCard className="max-w-[860px]">
            <div className="flex flex-col gap-3 border-b border-rule py-4 sm:flex-row sm:items-end sm:justify-between">
              <form
                className="flex min-w-0 flex-1 items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  setSearch(searchDraft.trim());
                }}
              >
                <div className="min-w-0 flex-1">
                  <label className="mb-1 block text-xs font-medium text-ink" htmlFor="audit-search">Search events</label>
                  <Input
                    id="audit-search"
                    value={searchDraft}
                    onChange={setSearchDraft}
                    placeholder="Action, actor, matter, or file"
                    disabled={isLoading}
                  />
                </div>
                <Button type="submit" variant="secondary" size="sm" icon={Search} disabled={isLoading}>Search</Button>
              </form>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={RefreshCw}
                  onClick={() => void loadFirstPage()}
                  disabled={isLoading}
                >
                  Refresh
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Download}
                  onClick={() => void exportCsv()}
                  disabled={isExporting || isLoading}
                >
                  {isExporting ? <LoadingSpinner size="sm" ariaLabel="Exporting audit log" /> : null}
                  Download CSV
                </Button>
              </div>
            </div>

            {error ? (
              <div className="py-5">
                <SettingsNotice variant="warning">{error}</SettingsNotice>
              </div>
            ) : isLoading ? (
              <div className="space-y-3 py-5" aria-label="Loading audit events">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="h-14 rounded-lg bg-paper-2" />
                ))}
              </div>
            ) : entries.length === 0 ? (
              <div className="flex items-start gap-3 py-6">
                <div className="rounded-md border border-line-subtle bg-paper-2 p-2 text-dim-2">
                  <FileClock className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-sm font-medium text-ink">No matching audit events</h2>
                  <p className="mt-1 text-sm text-dim-2">Change the search or check again after workspace activity.</p>
                </div>
              </div>
            ) : (
              <>
                <ol className="divide-y divide-rule" aria-label="Practice audit events">
                  {entries.map((entry) => (
                    <li key={`${entry.source.system}:${entry.id}`} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-sm font-medium text-ink">{entry.summary}</p>
                          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-dim-2">
                            {sourceLabel[entry.source.system]}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-dim-2">
                          {actorLabel(entry)} · {entry.action_type} · {entry.target.type} {entry.target.id}
                        </p>
                        <p className="mt-1 text-[11px] text-dim-2">Source: {entry.source.producer}</p>
                      </div>
                      <time className="text-xs text-dim-2 sm:text-right" dateTime={entry.occurred_at}>
                        {formatOccurredAt(entry.occurred_at)}
                      </time>
                    </li>
                  ))}
                </ol>
                {nextCursor ? (
                  <div className="border-t border-rule py-4 text-center">
                    <Button variant="secondary" size="sm" onClick={() => void loadMore()} disabled={isLoadingMore}>
                      {isLoadingMore ? <LoadingSpinner size="sm" ariaLabel="Loading more audit events" /> : null}
                      Load more
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </SettingsCard>
        )}
      </SettingSection>
    </div>
  );
};
