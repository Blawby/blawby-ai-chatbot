import { apiClient, unwrapApiResponse } from '@/shared/lib/apiClient';
import { getWorkerApiUrl } from '@/config/urls';
import type {
  AgingMeta,
  AgingRow,
  ProfitabilityMeta,
  ProfitabilityRow,
  ReportDelivery,
  ReportEnvelope,
  ReportFrequency,
  ReportSchedule,
  RevenueMeta,
  RevenueRow,
  UtilizationMeta,
  UtilizationRow,
} from './reportsTypes';

const reportPath = (practiceId: string, segment: string) =>
  `/api/reports/${encodeURIComponent(practiceId)}/${segment}`;

const queryString = (params: Record<string, string | number | null | undefined>) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') continue;
    search.set(k, String(v));
  }
  const out = search.toString();
  return out ? `?${out}` : '';
};

export interface ReportQueryParams {
  period?: 'month' | 'quarter' | 'year';
  start?: string;
  end?: string;
  hourlyRate?: number;
  signal?: AbortSignal;
}

const fetchReport = async <TRow, TMeta extends Record<string, unknown>>(
  practiceId: string,
  reportType: string,
  params: ReportQueryParams = {}
): Promise<ReportEnvelope<TRow, TMeta>> => {
  const { signal, ...query } = params;
  const url = reportPath(practiceId, reportType) + queryString(query);
  const { data } = await apiClient.get<unknown>(url, { signal });
  return unwrapApiResponse<ReportEnvelope<TRow, TMeta>>(data);
};

export const reportsApi = {
  fetchRevenue: (practiceId: string, params?: ReportQueryParams) =>
    fetchReport<RevenueRow, RevenueMeta>(practiceId, 'revenue', params),
  fetchAging: (practiceId: string, params?: ReportQueryParams) =>
    fetchReport<AgingRow, AgingMeta>(practiceId, 'aging', params),
  fetchProfitability: (practiceId: string, params?: ReportQueryParams) =>
    fetchReport<ProfitabilityRow, ProfitabilityMeta>(practiceId, 'profitability', params),
  fetchUtilization: (practiceId: string, params?: ReportQueryParams) =>
    fetchReport<UtilizationRow, UtilizationMeta>(practiceId, 'utilization', params),

  /** Generic — used by useReportData for any report id. */
  fetchReport: <TRow = unknown, TMeta extends Record<string, unknown> = Record<string, unknown>>(
    practiceId: string,
    reportType: string,
    params?: ReportQueryParams
  ): Promise<ReportEnvelope<TRow, TMeta>> =>
    fetchReport<TRow, TMeta>(practiceId, reportType, params),

  /** Returns the raw CSV blob URL ready for `<a download>` use. */
  async exportReport(
    practiceId: string,
    reportType: string,
    params: ReportQueryParams = {}
  ): Promise<{ blob: Blob; filename: string }> {
    const { signal, ...query } = params;
    const relativeUrl = reportPath(practiceId, `export/${reportType}`) + queryString({ format: 'csv', ...query });
    const fullUrl = /^https?:\/\//.test(relativeUrl) ? relativeUrl : `${getWorkerApiUrl()}${relativeUrl}`;
    const response = await fetch(fullUrl, { credentials: 'include', signal });
    if (!response.ok) {
      throw new Error(`Export failed: ${response.status}`);
    }
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const fnameMatch = /filename="([^"]+)"/i.exec(disposition);
    const filename = fnameMatch?.[1] ?? `${reportType}.csv`;
    const blob = await response.blob();
    return { blob, filename };
  },

  // ─── schedules (Phase 2) ──────────────────────────────────────────────
  async listSchedules(practiceId: string, signal?: AbortSignal): Promise<ReportSchedule[]> {
    const { data } = await apiClient.get<unknown>(reportPath(practiceId, 'schedules'), { signal });
    return unwrapApiResponse<ReportSchedule[]>(data);
  },
  async createSchedule(
    practiceId: string,
    body: {
      reportType: string;
      frequency: ReportFrequency;
      dayOfWeek?: number;
      dayOfMonth?: number;
      hourUtc: number;
      recipients: string[];
      filters: Record<string, string>;
      active?: boolean;
    }
  ): Promise<ReportSchedule> {
    const { data } = await apiClient.post<unknown>(reportPath(practiceId, 'schedules'), body);
    return unwrapApiResponse<ReportSchedule>(data);
  },
  async updateSchedule(
    practiceId: string,
    scheduleId: string,
    body: Partial<ReportSchedule>
  ): Promise<ReportSchedule> {
    const { data } = await apiClient.put<unknown>(reportPath(practiceId, `schedules/${encodeURIComponent(scheduleId)}`), body);
    return unwrapApiResponse<ReportSchedule>(data);
  },
  async deleteSchedule(practiceId: string, scheduleId: string): Promise<void> {
    await apiClient.delete(reportPath(practiceId, `schedules/${encodeURIComponent(scheduleId)}`));
  },

  // ─── send-now + deliveries (Phase 2) ──────────────────────────────────
  async sendNow(
    practiceId: string,
    body: {
      reportType: string;
      recipients: string[];
      filters: Record<string, string>;
    }
  ): Promise<ReportDelivery> {
    const { data } = await apiClient.post<unknown>(reportPath(practiceId, 'send-now'), body);
    return unwrapApiResponse<ReportDelivery>(data);
  },
  async listDeliveries(
    practiceId: string,
    params: { cursor?: string; limit?: number; signal?: AbortSignal } = {}
  ): Promise<{ items: ReportDelivery[]; nextCursor: string | null }> {
    const { signal, ...rest } = params;
    const { data } = await apiClient.get<unknown>(
      reportPath(practiceId, 'deliveries') + queryString(rest),
      { signal }
    );
    return unwrapApiResponse<{ items: ReportDelivery[]; nextCursor: string | null }>(data);
  },
  async getDelivery(practiceId: string, deliveryId: string, signal?: AbortSignal): Promise<ReportDelivery> {
    const { data } = await apiClient.get<unknown>(
      reportPath(practiceId, `deliveries/${encodeURIComponent(deliveryId)}`),
      { signal }
    );
    return unwrapApiResponse<ReportDelivery>(data);
  },
  downloadDeliveryUrl(practiceId: string, deliveryId: string): string {
    return reportPath(practiceId, `deliveries/${encodeURIComponent(deliveryId)}/download`);
  },
};
