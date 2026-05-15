import { useCallback, useState } from 'preact/hooks';
import { reportsApi, type ReportQueryParams } from '@/features/reports/services/reportsApi';

interface UseReportExportResult {
  exporting: boolean;
  error: string | null;
  exportReport: (practiceId: string, reportType: string, params?: ReportQueryParams) => Promise<void>;
}

export const useReportExport = (): UseReportExportResult => {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportReport = useCallback(
    async (practiceId: string, reportType: string, params: ReportQueryParams = {}) => {
      setExporting(true);
      setError(null);
      try {
        const { blob, filename } = await reportsApi.exportReport(practiceId, reportType, params);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Export failed');
        throw err;
      } finally {
        setExporting(false);
      }
    },
    []
  );

  return { exporting, error, exportReport };
};
