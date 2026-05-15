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

export type SearchSuggestion = {
  query: string;
  source: 'user' | 'practice';
};

export type SearchPin = {
  id: string;
  entityType: SearchEntityType;
  entityId: string;
  createdAt: string;
};
