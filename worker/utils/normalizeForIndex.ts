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
  { match: /^\/api\/uploads(?:\/|\?|$)/, entityType: 'file' },
  { match: /^\/api\/files(?:\/|\?|$)/, entityType: 'file' },
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

  const entityId =
    readString(root, 'id') ??
    readString(root, 'uuid') ?? // some endpoints (intakes) expose uuid only
    extractIdFromPath(pathname);
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
    case 'file':
      return {
        entityType,
        entityId,
        practiceId,
        payload: normalizeFile(root),
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
  // Intakes on staging-api look like:
  //   { uuid, organization_id, status, triage_status, triage_reason,
  //     metadata: { name, email, phone, on_behalf_of, opposing_party,
  //                 description }, created_at, ... }
  // No `title` field — we synthesize one from the contact name + a
  // short suffix so users can search by the person they took an intake
  // from. Body packs everything searchable.
  const metadata = isRecord(root.metadata) ? (root.metadata as AnyRecord) : {};

  const intakeName =
    readString(metadata, 'name') ??
    readString(root, 'client_name') ??
    readString(root, 'title') ??
    readString(root, 'form_title') ??
    readString(root, 'matter_type');

  const description =
    readString(metadata, 'description') ??
    readString(root, 'triage_reason') ??
    '';

  const opposingParty = readString(metadata, 'opposing_party');
  const email = readString(metadata, 'email');
  const phone = readString(metadata, 'phone');

  const title = intakeName ?? 'Intake';
  const triageStatus = readString(root, 'triage_status');
  const status = readString(root, 'status') ?? 'pending';
  const subtitleStatus = triageStatus
    ? `${status} · ${triageStatus}`
    : status;

  const bodyParts = [
    description,
    opposingParty ? `opposing: ${opposingParty}` : null,
    email,
    phone,
  ]
    .filter((s): s is string => Boolean(s));

  return {
    title,
    subtitle: `Intake · ${subtitleStatus}`,
    body: bodyParts.join(' '),
    clientId:
      readString(root, 'client_id') ??
      readString(root, 'clientId') ??
      undefined,
    metadata: {
      status,
      triageStatus,
      archived: triageStatus === 'declined' || status === 'archived',
    },
  };
}

function normalizeFile(root: AnyRecord): SearchIndexPayload {
  // Uploads/files on staging-api are typically shaped like:
  //   { id, organization_id, scope_type, scope_id, file_name, mime_type,
  //     size, storage_key, status, created_at, ... }
  // Title is the filename; subtitle conveys type/size/scope; body holds
  // anything else searchable (description if present, scope label).
  const fileName =
    readString(root, 'file_name') ??
    readString(root, 'filename') ??
    readString(root, 'name') ??
    readString(root, 'original_name') ??
    'File';

  const mimeType =
    readString(root, 'mime_type') ?? readString(root, 'mimeType');
  const sizeNumber = readNumber(root, 'size') ?? readNumber(root, 'file_size');
  const sizeLabel = sizeNumber !== null ? `${Math.round(sizeNumber / 1024)} KB` : '';
  const scopeType = readString(root, 'scope_type');
  const scopeLabel = scopeType ? `linked to ${scopeType}` : '';
  const status = readString(root, 'status') ?? 'active';
  const description = readString(root, 'description') ?? '';

  const subtitle = `File · ${[mimeType, sizeLabel, scopeLabel]
    .filter(Boolean)
    .join(' · ')}`;

  return {
    title: fileName,
    subtitle,
    body: description,
    fileId:
      readString(root, 'id') ?? readString(root, 'uuid') ?? undefined,
    clientId:
      scopeType === 'client'
        ? readString(root, 'scope_id') ?? undefined
        : undefined,
    matterId:
      scopeType === 'matter'
        ? readString(root, 'scope_id') ?? undefined
        : undefined,
    metadata: {
      status,
      mimeType,
      scopeType,
      scopeId: readString(root, 'scope_id') ?? null,
      archived: status === 'deleted' || Boolean(readString(root, 'deleted_at')),
    },
  };
}

function isRecord(v: unknown): v is AnyRecord {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
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
