import type { Env } from '../../types.js';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const ESTIMATED_MINUTES_BY_ACTION: Readonly<Record<string, number>> = {
  create_entity: 10,
  update_entity: 5,
  delete_entity: 3,
  run_entity_action: 8,
};

const VALID_STATUSES = new Set(['pending', 'approved', 'rejected', 'executed', 'failed']);

interface ActivityRow {
  id: string;
  conversation_id: string;
  status: string;
  approval_summary_json: string;
  payload_json: string;
  created_at: string;
  executed_at: string | null;
}

export interface AssistantActivityItem {
  id: string;
  conversationId: string;
  title: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
  createdAt: string;
  completedAt: string | null;
  estimatedMinutesSaved: number;
}

export interface AssistantActivityReport {
  items: AssistantActivityItem[];
  total: number;
  generatedAt: string;
  filters: Record<string, string | undefined>;
  meta: {
    estimatedMinutesSaved: number;
    executedCount: number;
    rejectedCount: number;
    failedCount: number;
    pendingCount: number;
  };
}

const parseObject = (raw: string, field: string): Record<string, unknown> => {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid ${field} in assistant activity record`);
  }
  return parsed as Record<string, unknown>;
};

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid ${field} in assistant activity record`);
  }
  return value.trim();
};

export class AssistantActivityReportService {
  constructor(private readonly env: Env) {}

  async get(practiceId: string, requestedLimit = DEFAULT_LIMIT): Promise<AssistantActivityReport> {
    const limit = Math.max(1, Math.min(MAX_LIMIT, Math.trunc(requestedLimit)));
    const rows = await this.env.DB.prepare(`
      SELECT id, conversation_id, status, approval_summary_json, payload_json, created_at, executed_at
      FROM practice_assistant_actions
      WHERE practice_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(practiceId, limit).all<ActivityRow>();

    const items = (rows.results ?? []).map((row): AssistantActivityItem => {
      if (!VALID_STATUSES.has(row.status)) {
        throw new Error('Invalid status in assistant activity record');
      }
      const summary = parseObject(row.approval_summary_json, 'approval summary');
      const payload = parseObject(row.payload_json, 'payload');
      const actionType = requireString(payload.actionType, 'action type');
      const status = row.status as AssistantActivityItem['status'];

      return {
        id: row.id,
        conversationId: row.conversation_id,
        title: requireString(summary.title, 'title'),
        description: typeof summary.description === 'string' ? summary.description.trim() : '',
        status,
        createdAt: row.created_at,
        completedAt: status === 'executed' ? row.executed_at : null,
        estimatedMinutesSaved: status === 'executed'
          ? (ESTIMATED_MINUTES_BY_ACTION[actionType] ?? 5)
          : 0,
      };
    });

    return {
      items,
      total: items.length,
      generatedAt: new Date().toISOString(),
      filters: {},
      meta: {
        estimatedMinutesSaved: items.reduce((total, item) => total + item.estimatedMinutesSaved, 0),
        executedCount: items.filter((item) => item.status === 'executed').length,
        rejectedCount: items.filter((item) => item.status === 'rejected').length,
        failedCount: items.filter((item) => item.status === 'failed').length,
        pendingCount: items.filter((item) => item.status === 'pending' || item.status === 'approved').length,
      },
    };
  }
}
