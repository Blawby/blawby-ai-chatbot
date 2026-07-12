import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReportSummaryService } from '../../../../worker/services/ReportSummaryService';
import { resolveDateRange } from '../../../../worker/services/ReportService';
import type { Env } from '../../../../worker/types';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const env = { BACKEND_API_URL: 'https://backend.example.test' } as Env;
const range = resolveDateRange('2026-05-01T00:00:00Z', '2026-05-31T23:59:59Z', 'month');

const routeResponse = (url: string): Response => {
  if (url.includes('/api/invoices/')) {
    return json({ invoices: [
      {
        id: 'invoice-1',
        organization_id: 'practice-1',
        client_id: 'client-1',
        connected_account_id: 'account-1',
        amount_paid: 50_000,
        amount_due: 0,
        status: 'paid',
        paid_at: '2026-05-15T12:00:00Z',
      },
    ] });
  }
  if (url.includes('/time-entries')) {
    return json({ time_entries: [
      {
        id: 'time-1',
        matter_id: 'matter-1',
        user_id: 'user-1',
        start_time: '2026-05-15T10:00:00Z',
        duration: 7200,
        billable: true,
      },
    ] });
  }
  if (url.includes('/api/practice-client-intakes/')) {
    return json({ data: { intakes: [
      {
        uuid: 'intake-1',
        triage_status: 'accepted',
        case_strength: 4,
        metadata: { intake_title: 'Family law' },
      },
      {
        uuid: 'intake-2',
        triage_status: 'declined',
        case_strength: 2,
        metadata: { intake_title: 'Family law' },
      },
    ] } });
  }
  if (url.includes('/api/matters/')) {
    return json({ matters: [
      {
        id: 'matter-1',
        status: 'closed',
        open_date: '2026-05-01T00:00:00Z',
        close_date: '2026-05-11T00:00:00Z',
        matter_type: 'Family law',
      },
    ] });
  }
  throw new Error(`Unexpected test URL: ${url}`);
};

describe('ReportSummaryService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('composes deterministic revenue, utilization, intake, and matter evidence', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => routeResponse(String(input))));

    const result = await new ReportSummaryService(env).get('practice-1', {}, 'month', range);

    expect(result.narrative).toContain('You billed $500');
    expect(result.narrative).toContain('Intake conversion is 50%');
    expect(result.narrative).toContain('Median time-to-close is 10 days');
    expect(result.groundingLabel).toContain('2 intakes');
    expect(result.conversionPercent).toBe(50);
    expect(result.closedMatterCount).toBe(1);
    expect(result.revenue.items).toHaveLength(1);
    expect(result.revenue.currentPaidCents).toBe(50_000);
    expect(result.utilization.totalBillableHours).toBe(2);
    expect(result.observations.map((item) => item.id)).toEqual([
      'revenue',
      'utilization',
      'conversion',
      'time-to-close',
    ]);
  });

  it('does not present stale historical revenue as the current period', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/api/invoices/')) {
        return json({ invoices: [
          {
            id: 'old-invoice',
            organization_id: 'practice-1',
            client_id: 'client-1',
            connected_account_id: 'account-1',
            amount_paid: 25_000,
            amount_due: 0,
            status: 'paid',
            paid_at: '2026-04-15T12:00:00Z',
          },
        ] });
      }
      return routeResponse(url);
    }));

    const historyRange = resolveDateRange(null, null, 'month', new Date('2026-05-31T23:59:59Z'));
    const result = await new ReportSummaryService(env).get('practice-1', {}, 'month', historyRange);

    expect(result.revenue.totalPaidCents).toBe(25_000);
    expect(result.revenue.currentPaidCents).toBe(0);
    expect(result.revenue.deltaPercent).toBe(-100);
    expect(result.narrative).toContain('No paid invoices are recorded for the current month.');
  });

  it('fast fails when an upstream report source is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/api/invoices/')) return json({ error: 'unavailable' }, 503);
      return routeResponse(url);
    }));

    await expect(
      new ReportSummaryService(env).get('practice-1', {}, 'month', range),
    ).rejects.toThrow('invoices upstream returned 503');
  });

  it('fast fails malformed intake collections instead of reporting zero intakes', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/api/practice-client-intakes/')) return json({ data: { results: [] } });
      return routeResponse(url);
    }));

    await expect(
      new ReportSummaryService(env).get('practice-1', {}, 'month', range),
    ).rejects.toThrow('Invalid reports summary intakes response');
  });
});
