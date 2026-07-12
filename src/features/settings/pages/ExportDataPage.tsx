import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Download, LoaderCircle, RotateCcw } from 'lucide-preact';

import { Pill } from '@/design-system/primitives';
import { Button } from '@/shared/ui/Button';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingsCard } from '@/features/settings/components/SettingsCard';
import { SettingsNotice } from '@/features/settings/components/SettingsNotice';
import {
  practiceExportsApi,
  type PracticeExportJob,
  type PracticeExportType,
} from '@/features/settings/services/practiceExportsApi';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { triggerDownload } from '@/shared/utils/fileDownload';

interface ExportDefinition {
  type: PracticeExportType;
  name: string;
  description: string;
  primary?: boolean;
}

const exportDefinitions: ExportDefinition[] = [
  {
    type: 'full_practice_archive',
    name: 'Full practice archive',
    description: 'Practice, team, intake, matter, billing, trust, audit, conversation, and file-metadata records.',
    primary: true,
  },
  {
    type: 'matters_contacts',
    name: 'Matters & contacts',
    description: 'Matter records, activity history, and contact information.',
  },
  {
    type: 'billing_invoices',
    name: 'Billing & invoices',
    description: 'Invoices and their persisted line items.',
  },
  {
    type: 'trust_ledger',
    name: 'Trust ledger',
    description: 'Trust transactions and reconciliation evidence with source provenance.',
  },
  {
    type: 'audit_events',
    name: 'Audit events',
    description: 'Domain, matter, and file audit records with source provenance.',
  },
];

type JobsByType = Partial<Record<PracticeExportType, PracticeExportJob>>;
type ErrorsByType = Partial<Record<PracticeExportType, string>>;

const activeJob = (job: PracticeExportJob | undefined): job is PracticeExportJob =>
  job?.status === 'queued' || job?.status === 'running';

const formatBytes = (bytes: number | null): string | null => {
  if (bytes === null) return null;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
};

const statusTone = (job: PracticeExportJob): 'live' | 'warn' | 'urgent' | 'dim' => {
  if (job.status === 'completed') return 'live';
  if (job.status === 'failed') return 'urgent';
  if (job.status === 'running') return 'warn';
  return 'dim';
};

interface ExportCardProps {
  definition: ExportDefinition;
  job?: PracticeExportJob;
  error?: string;
  isBusy: boolean;
  onRequest: () => void;
  onDownload: () => void;
}

const ExportCard = ({ definition, job, error, isBusy, onRequest, onDownload }: ExportCardProps) => {
  const isPreparing = job?.status === 'queued' || job?.status === 'running';
  const action = job?.status === 'completed' ? onDownload : onRequest;
  const label = isBusy
    ? job?.status === 'completed' ? 'Opening' : 'Requesting'
    : job?.status === 'completed'
      ? 'Download'
      : job?.status === 'failed'
        ? 'Try again'
        : isPreparing
          ? job.status === 'running' ? 'Preparing' : 'Queued'
          : 'Request export';
  const icon = job?.status === 'completed' ? Download : job?.status === 'failed' ? RotateCcw : isPreparing ? LoaderCircle : undefined;

  return (
    <div className="border-b border-rule py-4 last:border-0">
      <div className="flex items-start justify-between gap-6 max-sm:flex-col">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
            {definition.name}
            <span className="rounded border border-rule px-1.5 py-px font-mono text-[10px] uppercase tracking-wider text-dim">JSON</span>
            {job ? <Pill tone={statusTone(job)}>{job.status}</Pill> : null}
          </div>
          <p className="mt-0.5 max-w-[65ch] text-xs text-dim">{definition.description}</p>
          {job?.status === 'completed' ? (
            <p className="mt-1 text-[11px] text-dim-2">
              Completed {job.completed_at ? new Date(job.completed_at).toLocaleString() : ''}
              {formatBytes(job.byte_size) ? ` · ${formatBytes(job.byte_size)}` : ''}
            </p>
          ) : null}
          {job?.status === 'failed' && job.error ? (
            <p className="mt-1 text-xs text-neg" role="alert">{job.error.message}</p>
          ) : error ? (
            <p className="mt-1 text-xs text-neg" role="alert">{error}</p>
          ) : null}
        </div>
        <Button
          variant={definition.primary ? 'primary' : 'secondary'}
          size="sm"
          className="shrink-0"
          icon={icon}
          onClick={action}
          disabled={isBusy || isPreparing}
        >
          {label}
        </Button>
      </div>
    </div>
  );
};

export interface ExportDataPageProps {
  className?: string;
}

export const ExportDataPage = ({ className = '' }: ExportDataPageProps) => {
  const { currentPractice } = usePracticeManagement({ fetchPracticeDetails: true });
  const { showError, showSuccess } = useToastContext();
  const practiceId = useMemo(
    () => currentPractice?.betterAuthOrgId ?? currentPractice?.id ?? null,
    [currentPractice?.betterAuthOrgId, currentPractice?.id],
  );
  const [jobs, setJobs] = useState<JobsByType>({});
  const [errors, setErrors] = useState<ErrorsByType>({});
  const [busyType, setBusyType] = useState<PracticeExportType | null>(null);
  const pendingKeys = useRef<Partial<Record<PracticeExportType, string>>>({});

  useEffect(() => {
    const active = Object.values(jobs).filter(activeJob);
    if (!practiceId || active.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void Promise.allSettled(active.map((job) => practiceExportsApi.get(practiceId, job.id))).then((results) => {
        if (cancelled) return;
        results.forEach((result, index) => {
          const previous = active[index];
          if (!previous) return;
          if (result.status === 'fulfilled') {
            const next = result.value;
            setJobs((current) => ({ ...current, [next.type]: next }));
            setErrors((current) => ({ ...current, [next.type]: undefined }));
            if (next.status === 'completed' || next.status === 'failed') delete pendingKeys.current[next.type];
          } else {
            setErrors((current) => ({ ...current, [previous.type]: 'Status could not be refreshed.' }));
            setJobs((current) => ({ ...current }));
          }
        });
      });
    }, 3000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobs, practiceId]);

  const requestExport = async (type: PracticeExportType) => {
    if (!practiceId || busyType) return;
    setBusyType(type);
    setErrors((current) => ({ ...current, [type]: undefined }));
    const idempotencyKey = pendingKeys.current[type] ?? crypto.randomUUID();
    pendingKeys.current[type] = idempotencyKey;
    try {
      const job = await practiceExportsApi.request(practiceId, type, idempotencyKey);
      setJobs((current) => ({ ...current, [type]: job }));
      if (job.status === 'completed' || job.status === 'failed') delete pendingKeys.current[type];
      showSuccess('Export requested', `${exportDefinitions.find((item) => item.type === type)?.name ?? 'Export'} is ${job.status}.`);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Unable to request this export.';
      setErrors((current) => ({ ...current, [type]: message }));
      showError('Export request failed', message);
    } finally {
      setBusyType(null);
    }
  };

  const downloadExport = async (type: PracticeExportType) => {
    const current = jobs[type];
    if (!practiceId || !current || busyType) return;
    setBusyType(type);
    try {
      const fresh = await practiceExportsApi.get(practiceId, current.id);
      setJobs((jobsByType) => ({ ...jobsByType, [type]: fresh }));
      if (fresh.status !== 'completed' || !fresh.download) {
        throw new Error('This export is not ready to download.');
      }
      triggerDownload(fresh.download.url, `blawby-${type}-${new Date().toISOString().slice(0, 10)}.json`, true);
    } catch (downloadError) {
      showError('Export download failed', downloadError instanceof Error ? downloadError.message : 'Unable to download this export.');
    } finally {
      setBusyType(null);
    }
  };

  return (
    <div className={className}>
      <SettingSection
        first
        title="Available exports"
        description="Exports run as durable background jobs. Completed files receive a fresh five-minute download link when opened."
      >
        {!practiceId ? (
          <SettingsNotice variant="warning">Select a practice before requesting an export.</SettingsNotice>
        ) : (
          <SettingsCard className="max-w-[820px]">
            {exportDefinitions.map((definition) => (
              <ExportCard
                key={definition.type}
                definition={definition}
                job={jobs[definition.type]}
                error={errors[definition.type]}
                isBusy={busyType === definition.type}
                onRequest={() => void requestExport(definition.type)}
                onDownload={() => void downloadExport(definition.type)}
              />
            ))}
          </SettingsCard>
        )}
      </SettingSection>
    </div>
  );
};
