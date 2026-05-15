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
      let url: string | undefined;
      try {
        const { blob, filename } = await reportsApi.exportReport(practiceId, reportType, params);
        url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Export failed');
        throw err;
      } finally {
        if (url) URL.revokeObjectURL(url);
        setExporting(false);
      }
    },
    []
  );

  return { exporting, error, exportReport };
};
