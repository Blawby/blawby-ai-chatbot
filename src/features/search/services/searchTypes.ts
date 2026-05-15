export type SearchEntityType =
  | 'client'
  | 'matter'
  | 'invoice'
  | 'conversation'
  | 'file'
  | 'file_chunk'
  | 'intake'
  | 'note';

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

export type SearchEnvelope = {
  groups: SearchGroup[];
  queryLogId?: string;
  debug?: {
    semanticEnabled: boolean;
    ftsTookMs: number;
    vectorTookMs: number;
  };
};

export type SearchPin = {
  id: string;
  entityType: SearchEntityType;
  entityId: string;
  createdAt: string;
};
