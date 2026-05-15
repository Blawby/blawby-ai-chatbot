export type SearchEntityType =
  | 'client'
  | 'matter'
  | 'invoice'
  | 'conversation'
  | 'file'
  | 'file_chunk'
  | 'intake'
  | 'note'
  | 'report';

export type SearchOp = 'upsert' | 'delete' | 'cascade_delete' | 'backfill';

export type SearchIndexPayload = {
  title: string;
  subtitle?: string;
  body?: string;
  metadata?: Record<string, unknown>;
  clientId?: string;
  matterId?: string;
  fileId?: string;
};

export type SearchIndexEvent =
  | {
      op: 'upsert';
      entityType: SearchEntityType;
      entityId: string;
      practiceId: string;
      payload: SearchIndexPayload;
      version: number;
    }
  | {
      op: 'delete';
      entityType: SearchEntityType;
      entityId: string;
      practiceId: string;
      version: number;
    }
  | {
      op: 'cascade_delete';
      entityType: SearchEntityType;
      entityId: string;
      practiceId: string;
      version: number;
    }
  | {
      op: 'backfill';
      practiceId: string;
      cookieKey: string;
      version: number;
    };

export type SearchResultItem = {
  entityType: SearchEntityType;
  entityId: string;
  title: string;
  subtitle?: string;
  snippet?: string;
  score: number;
  metadata?: Record<string, unknown>;
  archived?: boolean;
};

export type SearchGroup = {
  id: string;
  label: string;
  items: SearchResultItem[];
  hasMore: boolean;
  tookMs?: number;
};

export type SearchDidYouMean = {
  title: string | null;
  entityType: SearchEntityType;
  entityId: string;
  score: number;
};

export type SearchEnvelope = {
  groups: SearchGroup[];
  queryLogId?: string;
  didYouMean?: SearchDidYouMean;
  debug?: {
    semanticEnabled: boolean;
    ftsTookMs: number;
    vectorTookMs: number;
  };
};

export const SEARCH_ENTITY_LABELS: Record<SearchEntityType, string> = {
  client: 'Clients',
  matter: 'Matters',
  invoice: 'Invoices',
  conversation: 'Messages',
  file: 'Files',
  file_chunk: 'Files',
  intake: 'Intakes',
  note: 'Notes',
  report: 'Reports',
};
