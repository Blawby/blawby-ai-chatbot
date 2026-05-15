import type {
  SearchEntityType,
  SearchIndexPayload,
} from '../types/search.js';

export type NormalizedEvent = {
  entityType: SearchEntityType;
  entityId: string;
  practiceId: string;
  payload: SearchIndexPayload;
};

type AnyRecord = Record<string, unknown>;

const ENTITY_PATH_RULES: Array<{
  match: RegExp;
  entityType: SearchEntityType;
  practiceIdKey?: string;
}> = [
  { match: /^\/api\/clients(?:\/|$)/, entityType: 'client' },
  { match: /^\/api\/matters(?:\/|$)/, entityType: 'matter' },
  { match: /^\/api\/invoices(?:\/|$)/, entityType: 'invoice' },
  { match: /^\/api\/practice-client-intakes(?:\/|$)/, entityType: 'intake' },
];

export function isSearchablePath(pathname: string): boolean {
  return ENTITY_PATH_RULES.some((rule) => rule.match.test(pathname));
}

export function entityTypeForPath(pathname: string): SearchEntityType | null {
  const rule = ENTITY_PATH_RULES.find((r) => r.match.test(pathname));
  return rule ? rule.entityType : null;
}

export type OpKind = 'upsert' | 'delete';

export function deriveOp(method: string): OpKind {
  return method.toUpperCase() === 'DELETE' ? 'delete' : 'upsert';
}

export function normalizeForIndex(
  pathname: string,
  body: unknown,
  fallbackPracticeId: string | null,
): NormalizedEvent | null {
  const entityType = entityTypeForPath(pathname);
  if (!entityType) return null;
  const root = unwrap(body);
  if (!root) return null;

  const entityId = readString(root, 'id') ?? extractIdFromPath(pathname);
  if (!entityId) return null;

  const practiceId =
    readString(root, 'practice_id') ??
    readString(root, 'practiceId') ??
    readString(root, 'organization_id') ??
    readString(root, 'organizationId') ??
    fallbackPracticeId;
  if (!practiceId) return null;

  switch (entityType) {
    case 'client':
      return {
        entityType,
        entityId,
        practiceId,
        payload: normalizeClient(root),
      };
    case 'matter':
      return {
        entityType,
        entityId,
        practiceId,
        payload: normalizeMatter(root),
      };
    case 'invoice':
      return {
        entityType,
        entityId,
        practiceId,
        payload: normalizeInvoice(root),
      };
    case 'intake':
      return {
        entityType,
        entityId,
        practiceId,
        payload: normalizeIntake(root),
      };
    default:
      return null;
  }
}

function normalizeClient(root: AnyRecord): SearchIndexPayload {
  const composed = [readString(root, 'first_name'), readString(root, 'last_name')]
    .filter(Boolean)
    .join(' ');
  const name =
    readString(root, 'full_name') ??
    readString(root, 'name') ??
    (composed.length > 0 ? composed : 'Client');
  const email = readString(root, 'email');
  const phone = readString(root, 'phone');
  const status = readString(root, 'status');
  return {
    title: name,
    subtitle: status ? `Client · ${status}` : 'Client',
    body: [email, phone].filter(Boolean).join(' '),
    clientId: readString(root, 'id') ?? undefined,
    metadata: {
      status,
      archived: status === 'archived',
    },
  };
}

function normalizeMatter(root: AnyRecord): SearchIndexPayload {
  const title =
    readString(root, 'title') ??
    readString(root, 'name') ??
    'Matter';
  const status = readString(root, 'status');
  const description = readString(root, 'description');
  const clientId =
    readString(root, 'client_id') ?? readString(root, 'clientId');
  const matterId = readString(root, 'id');
  return {
    title,
    subtitle: status ? `Matter · ${status}` : 'Matter',
    body: description ?? '',
    clientId: clientId ?? undefined,
    matterId: matterId ?? undefined,
    metadata: {
      status,
      archived: status === 'closed' || status === 'archived',
    },
  };
}

function normalizeInvoice(root: AnyRecord): SearchIndexPayload {
  const number =
    readString(root, 'invoice_number') ??
    readString(root, 'invoiceNumber') ??
    readString(root, 'number') ??
    'Invoice';
  const status = readString(root, 'status') ?? 'draft';
  const totalCents =
    readNumber(root, 'total') ??
    readNumber(root, 'amount_due') ??
    readNumber(root, 'amountDue');
  const totalLabel =
    totalCents !== null ? `$${(totalCents / 100).toFixed(2)}` : '';
  const clientName =
    readString(root, 'client_name') ?? readString(root, 'clientName');
  return {
    title: number,
    subtitle: `Invoice · ${[totalLabel, status, clientName ? `client: ${clientName}` : null]
      .filter(Boolean)
      .join(' · ')}`,
    body: clientName ?? '',
    clientId:
      readString(root, 'client_id') ??
      readString(root, 'clientId') ??
      undefined,
    matterId:
      readString(root, 'matter_id') ??
      readString(root, 'matterId') ??
      undefined,
    metadata: {
      status,
      archived: status === 'void' || status === 'cancelled',
    },
  };
}

function normalizeIntake(root: AnyRecord): SearchIndexPayload {
  const title =
    readString(root, 'title') ??
    readString(root, 'form_title') ??
    readString(root, 'matter_type') ??
    'Intake';
  const status = readString(root, 'status') ?? 'pending';
  const clientName = readString(root, 'client_name');
  return {
    title,
    subtitle: `Intake · ${[status, clientName].filter(Boolean).join(' · ')}`,
    body: clientName ?? '',
    clientId:
      readString(root, 'client_id') ??
      readString(root, 'clientId') ??
      undefined,
    metadata: { status },
  };
}

function unwrap(body: unknown): AnyRecord | null {
  if (!body || typeof body !== 'object') return null;
  const obj = body as AnyRecord;
  if (
    obj.data &&
    typeof obj.data === 'object' &&
    !Array.isArray(obj.data)
  ) {
    return obj.data as AnyRecord;
  }
  return obj;
}

function readString(obj: AnyRecord, key: string): string | null {
  const val = obj[key];
  return typeof val === 'string' && val.length > 0 ? val : null;
}

function readNumber(obj: AnyRecord, key: string): number | null {
  const val = obj[key];
  return typeof val === 'number' && Number.isFinite(val) ? val : null;
}

function extractIdFromPath(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last) return null;
  return /^[a-zA-Z0-9_-]{4,}$/.test(last) ? last : null;
}
