import { useMemo, useState } from 'preact/hooks';
import type { FunctionComponent } from 'preact';
import { AlertTriangle } from 'lucide-preact';

import { useToastContext } from '@/shared/contexts/ToastContext';
import type { ReportDefinition } from '@/features/reports/config/reportCollection';
import { useReportData } from '@/features/reports/hooks/useReportData';
import { useReportExport } from '@/features/reports/hooks/useReportExport';
import { BackendUnavailableState } from './BackendUnavailableState';
import { ReportFilters, type ReportFilterValues } from './ReportFilters';
import { ReportToolbar } from './ReportToolbar';
import { ReportListKpiRow } from './ReportListKpiRow';
import { ReportDataTable } from './ReportDataTable';
import { ScheduleModal } from './ScheduleModal';
import { SendNowModal } from './SendNowModal';

interface ReportPageShellProps {
  definition: ReportDefinition;
  practiceId: string;
  practiceSlug: string | null;
}

const defaultFilterValues = (definition: ReportDefinition): ReportFilterValues => {
  const values: ReportFilterValues = {};
  for (const f of definition.filters) {
    if (f.kind === 'period') values.period = f.defaultValue ?? 'month';
  }
  return values;
};

export const ReportPageShell: FunctionComponent<ReportPageShellProps> = ({ definition, practiceId }) => {
  const [filters, setFilters] = useState<ReportFilterValues>(() => defaultFilterValues(definition));
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [sendNowOpen, setSendNowOpen] = useState(false);
  const { showError } = useToastContext();
  const { exportReport, exporting } = useReportExport();

  const queryParams = useMemo(() => ({
    period: filters.period,
    start: filters.start,
    end: filters.end,
    hourlyRate: filters.hourlyRate,
  }), [filters.period, filters.start, filters.end, filters.hourlyRate]);

  const { data, loading, error, refetch } = useReportData(
    practiceId,
    definition.id,
    queryParams,
    { enabled: definition.phase !== 3 }
  );

  if (definition.phase === 3 || error?.code === 'BACKEND_NOT_AVAILABLE') {
    return <BackendUnavailableState definition={definition} />;
  }

  const handleExport = async () => {
    try {
      await exportReport(practiceId, definition.id, queryParams);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Export failed');
    }
  };
  const handleSchedule = () => setScheduleOpen(true);
  const handleSendNow = () => setSendNowOpen(true);
  const stringFilters: Record<string, string> = Object.fromEntries(
    Object.entries(filters)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => [k, String(v)])
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-input-text">{definition.title}</h1>
          <p className="mt-1 text-sm text-input-placeholder">{definition.description}</p>
        </div>
        <ReportToolbar
          definition={definition}
          onExport={handleExport}
          onSchedule={handleSchedule}
          onSendNow={handleSendNow}
          exporting={exporting}
        />
      </header>

      {definition.filters.length > 0 ? (
        <ReportFilters filters={definition.filters} values={filters} onChange={setFilters} />
      ) : null}

      {definition.summaryCards?.length && data?.meta ? (
        <ReportListKpiRow cards={definition.summaryCards} meta={data.meta} />
      ) : null}

      {error ? (
        <div className="flex items-center justify-between rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2">
          <div className="flex items-center gap-2 text-sm text-red-400">
            <AlertTriangle className="h-4 w-4" />
            <span>{error.message}</span>
          </div>
          <button
            type="button"
            className="text-xs font-medium text-red-300 underline"
            onClick={refetch}
          >
            Retry
          </button>
        </div>
      ) : null}

      <ReportDataTable
        columns={definition.columns}
        rows={(data?.items as Record<string, unknown>[]) ?? []}
        loading={loading && !data}
      />

      <ScheduleModal
        isOpen={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        practiceId={practiceId}
        reportType={definition.id}
        filters={stringFilters}
      />
      <SendNowModal
        isOpen={sendNowOpen}
        onClose={() => setSendNowOpen(false)}
        practiceId={practiceId}
        reportType={definition.id}
        filters={stringFilters}
      />
    </div>
  );
};

export default ReportPageShell;
