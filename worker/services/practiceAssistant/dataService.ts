import type { Env } from '../../types.js';
import { HttpErrors } from '../../errorHandler.js';
import { SearchIndexService } from '../SearchIndexService.js';
import { RAILWAY_REPORT_PATHS } from '../ReportService.js';
import type { PracticeAssistantSource } from './types.js';
import { ENTITY_REGISTRY } from './EntityRegistry.js';

export type PracticeEntityType =
  | 'practice'
  | 'matter'
  | 'intake'
  | 'invoice'
  | 'task'
  | 'engagement'
  | 'time_entry';

export type PracticeSearchEntityType =
  | Exclude<PracticeEntityType, 'practice'>
  | 'client'
  | 'file'
  | 'note'
  | 'conversation'
  | 'payment';

export type PracticeFilterOperator =
  | 'eq'
  | 'neq'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'before'
  | 'after'
  | 'on_or_before'
  | 'on_or_after'
  | 'exists';

export interface PracticeFilter {
  field: string;
  op: PracticeFilterOperator;
  value?: unknown;
}

export interface PracticeSort {
  field: string;
  direction?: 'asc' | 'desc';
}

export interface PracticeListOptions {
  filters?: PracticeFilter[];
  dateRange?: { field?: string; from?: string; to?: string };
  sort?: PracticeSort[];
  limit?: number;
  offset?: number;
  includeSources?: boolean;
  parent?: { entityType: string; id: string };
}

export interface PracticeSearchOptions {
  entityTypes?: PracticeSearchEntityType[];
  limit?: number;
  includeSources?: boolean;
}

export interface PracticeQueryInput extends PracticeListOptions {
  question: string;
  scope?: string;
  entityTypes?: PracticeEntityType[];
  signals?: string[];
  includeSources?: boolean;
  sources?: Array<'backend' | 'search' | 'reports'>;
}

export interface PracticeSourceError {
  source: string;
  error: string;
}

const getBackendBaseUrl = (env: Env): string => {
  const base = env.BACKEND_API_URL?.trim();
  if (!base) throw HttpErrors.internalServerError('BACKEND_API_URL is required');
  return base.replace(/\/+$/, '');
};

const forwardHeaders = (request: Request): Headers => {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const cookie = request.headers.get('Cookie');
  const authorization = request.headers.get('Authorization');
  if (cookie) headers.set('Cookie', cookie);
  if (authorization) headers.set('Authorization', authorization);
  return headers;
};

const unwrapList = (raw: unknown, keys: string[]): unknown[] => {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  const record = raw as Record<string, unknown>;
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  if (record.data) return unwrapList(record.data, keys);
  return [];
};

const unwrapRecord = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
    return unwrapRecord(record.data);
  }
  return record;
};

const getString = (record: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const ENTITY_CONFIG: Record<PracticeEntityType, {
  path: (practiceId: string, id?: string) => string;
  listKeys: string[];
  sourceType: PracticeAssistantSource['type'];
  label: string;
}> = {
  matter: {
    path: (practiceId, id) => id
      ? `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(id)}`
      : `/api/matters/${encodeURIComponent(practiceId)}`,
    listKeys: ['matters', 'items', 'results'],
    sourceType: 'matter',
    label: 'Matters',
  },
  practice: {
    path: (practiceId) => `/api/practice/${encodeURIComponent(practiceId)}`,
    listKeys: ['practice', 'items', 'results'],
    sourceType: 'practice',
    label: 'Practice',
  },
  intake: {
    path: (practiceId, id) => id
      ? `/api/practice-client-intakes/${encodeURIComponent(practiceId)}/${encodeURIComponent(id)}`
      : `/api/practice-client-intakes/${encodeURIComponent(practiceId)}`,
    listKeys: ['intakes', 'items', 'results'],
    sourceType: 'intake',
    label: 'Intakes',
  },
  invoice: {
    path: (practiceId, id) => id
      ? `/api/invoices/${encodeURIComponent(practiceId)}/${encodeURIComponent(id)}`
      : `/api/invoices/${encodeURIComponent(practiceId)}`,
    listKeys: ['invoices', 'items', 'results'],
    sourceType: 'invoice',
    label: 'Invoices',
  },
  task: {
    path: (practiceId) => RAILWAY_REPORT_PATHS.tasks(practiceId),
    listKeys: ['tasks', 'items', 'results'],
    sourceType: 'task',
    label: 'Tasks',
  },
  engagement: {
    path: (practiceId, id) => id
      ? `/api/engagement-contracts/${encodeURIComponent(practiceId)}/${encodeURIComponent(id)}`
      : `/api/engagement-contracts/${encodeURIComponent(practiceId)}`,
    listKeys: ['engagements', 'contracts', 'items', 'results'],
    sourceType: 'engagement',
    label: 'Engagements',
  },
  time_entry: {
    path: (practiceId) => RAILWAY_REPORT_PATHS.wip(practiceId),
    listKeys: ['time_entries', 'timeEntries', 'entries', 'items', 'results', 'rows'],
    sourceType: 'report',
    label: 'Time entries',
  },
};

const isPracticeEntityType = (value: string): value is PracticeEntityType =>
  Object.prototype.hasOwnProperty.call(ENTITY_CONFIG, value);

const DEFAULT_QUERY_ENTITY_TYPES: PracticeEntityType[] = ['matter', 'task', 'invoice'];

const inferQueryEntityTypes = (input: PracticeQueryInput): PracticeEntityType[] => {
  if (input.entityTypes?.length) return input.entityTypes;
  const text = `${input.question} ${(input.signals ?? []).join(' ')}`.toLowerCase();
  const inferred = new Set<PracticeEntityType>();
  if (/\b(task|todo|deadline|due|overdue|blocked)\b/.test(text)) inferred.add('task');
  if (/\b(invoice|invoices|billing|balance|paid|payment|overdue|receivable)\b/.test(text)) inferred.add('invoice');
  if (/\b(intake|lead|consult|prospect)\b/.test(text)) inferred.add('intake');
  if (/\b(engagement|contract|letter|retainer)\b/.test(text)) inferred.add('engagement');
  if (/\b(wip|work in progress|unbilled|time|revenue|earning)\b/.test(text)) {
    inferred.add('matter');
    inferred.add('invoice');
  }
  if (/\b(practice|firm|setting|settings|area|areas|coverage)\b/.test(text)) inferred.add('practice');
  if (/\b(matter|case|client)\b/.test(text)) inferred.add('matter');
  return inferred.size ? Array.from(inferred) : DEFAULT_QUERY_ENTITY_TYPES;
};

const RELATION_FILTERS: Partial<Record<PracticeEntityType, Partial<Record<PracticeEntityType, (id: string) => PracticeFilter[]>>>> = {
  practice: {
    matter: () => [],
    intake: () => [],
    invoice: () => [],
    task: () => [],
    engagement: () => [],
  },
  matter: {
    task: (id) => [{ field: 'matter_id', op: 'eq', value: id }],
    invoice: (id) => [{ field: 'matter_id', op: 'eq', value: id }],
    engagement: (id) => [{ field: 'matter_id', op: 'eq', value: id }],
  },
  intake: {
    engagement: (id) => [{ field: 'intake_id', op: 'eq', value: id }],
    matter: (id) => [{ field: 'intake_id', op: 'eq', value: id }],
  },
  engagement: {
    matter: (id) => [{ field: 'engagement_id', op: 'eq', value: id }],
    intake: (id) => [{ field: 'engagement_id', op: 'eq', value: id }],
  },
};

const defaultRelations = (entityType: PracticeEntityType): PracticeEntityType[] =>
  Object.keys(RELATION_FILTERS[entityType] ?? {}) as PracticeEntityType[];

const entityConfig = (entityType: PracticeEntityType) => {
  const config = ENTITY_CONFIG[entityType];
  if (!config) throw HttpErrors.badRequest(`Unsupported entity type for this operation: ${String(entityType)}`);
  return config;
};

const normalizeComparable = (value: unknown): string | number | boolean | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  return String(value).toLowerCase();
};

const resolveRelativeDate = (value: unknown): unknown => {
  if (value !== 'today') return value;
  return new Date().toISOString().slice(0, 10);
};

const getField = (record: unknown, field: string): unknown => {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return undefined;
  const object = record as Record<string, unknown>;
  if (field in object) return object[field];
  const camel = field.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  if (camel in object) return object[camel];
  const snake = field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  return object[snake];
};

const matchesFilter = (record: unknown, filter: PracticeFilter): boolean => {
  const actual = getField(record, filter.field);
  const expected = resolveRelativeDate(filter.value);
  const actualComparable = normalizeComparable(actual);
  const expectedComparable = normalizeComparable(expected);
  switch (filter.op) {
    case 'eq':
      return actualComparable === expectedComparable;
    case 'neq':
      return actualComparable !== expectedComparable;
    case 'in':
      return Array.isArray(expected) && expected.map(normalizeComparable).includes(actualComparable);
    case 'not_in':
      return Array.isArray(expected) && !expected.map(normalizeComparable).includes(actualComparable);
    case 'contains':
      return String(actualComparable ?? '').includes(String(expectedComparable ?? ''));
    case 'before':
      return Boolean(actual && expected && Date.parse(String(actual)) < Date.parse(String(expected)));
    case 'after':
      return Boolean(actual && expected && Date.parse(String(actual)) > Date.parse(String(expected)));
    case 'on_or_before':
      return Boolean(actual && expected && Date.parse(String(actual)) <= Date.parse(String(expected)));
    case 'on_or_after':
      return Boolean(actual && expected && Date.parse(String(actual)) >= Date.parse(String(expected)));
    case 'exists':
      return Boolean(filter.value) ? actual !== undefined && actual !== null : actual === undefined || actual === null;
    default:
      return true;
  }
};

const applyListOptions = (records: unknown[], options?: PracticeListOptions): unknown[] => {
  const filters = [...(options?.filters ?? [])];
  if (options?.dateRange?.from) {
    filters.push({ field: options.dateRange.field ?? 'created_at', op: 'on_or_after', value: options.dateRange.from });
  }
  if (options?.dateRange?.to) {
    filters.push({ field: options.dateRange.field ?? 'created_at', op: 'on_or_before', value: options.dateRange.to });
  }
  const filtered = filters.length ? records.filter((record) => filters.every((filter) => matchesFilter(record, filter))) : records;
  const sorted = [...filtered].sort((a, b) => {
    for (const sort of options?.sort ?? []) {
      const direction = sort.direction === 'desc' ? -1 : 1;
      const av = normalizeComparable(getField(a, sort.field));
      const bv = normalizeComparable(getField(b, sort.field));
      if (av === bv) continue;
      if (av === null) return 1;
      if (bv === null) return -1;
      return av > bv ? direction : -direction;
    }
    return 0;
  });
  const offset = Math.max(0, options?.offset ?? 0);
  const limit = Math.max(1, Math.min(options?.limit ?? 50, 100));
  return sorted.slice(offset, offset + limit);
};

export class PracticeAssistantDataService {
  constructor(
    private env: Env,
    private request: Request,
    private practiceId: string,
    private practiceSlug?: string | null,
  ) {}

  async fetchBackend(path: string, init?: { method?: string; body?: unknown; sourceName?: string }): Promise<unknown> {
    const response = await fetch(`${getBackendBaseUrl(this.env)}${path}`, {
      method: init?.method ?? 'GET',
      headers: forwardHeaders(this.request),
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await response.text().catch(() => '');
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = null;
      }
    }
    if (!response.ok) {
      const record = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
      const message = typeof record.error === 'string'
        ? record.error
        : typeof record.message === 'string'
          ? record.message
          : `${init?.sourceName ?? 'Backend source'} failed with HTTP ${response.status}`;
      throw new Error(`${init?.sourceName ?? 'Backend source'} failed: ${message}`);
    }
    return payload;
  }

  async searchPractice(query: string, options?: PracticeSearchOptions): Promise<{ results: unknown[]; sources: PracticeAssistantSource[] }> {
    const service = new SearchIndexService(this.env);
    const items = await service.query({ practiceId: this.practiceId, fts: query, limit: options?.limit ?? 8 });
    const nonPracticeItems = items.filter((item: unknown) => {
      const record = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {};
      const entityType = getString(record, ['entityType', 'entity_type', 'type']);
      return entityType !== 'practice';
    });
    const filtered = options?.entityTypes?.length
      ? nonPracticeItems.filter((item: unknown) => {
        const record = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {};
        const entityType = getString(record, ['entityType', 'entity_type', 'type']);
        return entityType ? options.entityTypes!.some((type) => entityType.includes(type)) : false;
      })
      : nonPracticeItems;
    return {
      results: filtered,
      sources: filtered.slice(0, options?.limit ?? 8).map((item: unknown, index: number) => {
        const record = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {};
        const entityType = getString(record, ['entityType', 'entity_type', 'type']) ?? 'search';
        const id = getString(record, ['id', 'entityId', 'entity_id']) ?? `${index}`;
        const label = getString(record, ['title', 'label', 'name']) ?? `${entityType} ${id}`;
        return {
          type: this.sourceType(entityType),
          id,
          label,
          href: this.hrefFor(entityType, id),
        };
      }),
    };
  }

  async queryPractice(input: PracticeQueryInput): Promise<{
    question: string;
    recordsByEntityType: Partial<Record<PracticeEntityType, unknown[]>>;
    searchResults: unknown[];
    sources: PracticeAssistantSource[];
    sourceErrors: PracticeSourceError[];
  }> {
    const entityTypes = inferQueryEntityTypes(input);
    const searchAllowed = !input.sources || input.sources.includes('search');
    const backendAllowed = !input.sources || input.sources.includes('backend') || input.sources.includes('reports');
    const searchEntityTypes = entityTypes.filter((entityType) => entityType !== 'practice') as PracticeSearchEntityType[];
    const searchResult = searchAllowed
      ? await this.settle('Search', () => this.searchPractice(input.question, { entityTypes: searchEntityTypes, limit: input.limit ?? 12 }))
      : { source: 'Search', ok: true as const, value: { results: [], sources: [] } };
    const listResults = await Promise.all(entityTypes.map((entityType) => backendAllowed
      ? this.settle(ENTITY_CONFIG[entityType].label, () => this.listEntities(entityType, input))
      : Promise.resolve({ source: ENTITY_CONFIG[entityType].label, ok: true as const, value: { records: [], sources: [] } })));
    const settled = [searchResult, ...listResults];
    const sourceErrors = settled
      .filter((result): result is { source: string; ok: false; error: string } => !result.ok)
      .map((result) => ({ source: result.source, error: result.error }));
    const recordsByEntityType: Partial<Record<PracticeEntityType, unknown[]>> = {};
    entityTypes.forEach((entityType, index) => {
      const result = listResults[index];
      recordsByEntityType[entityType] = result.ok ? result.value.records : [];
    });
    const sources = settled.flatMap((result) => result.ok ? result.value.sources : []);
    return {
      question: input.question,
      recordsByEntityType,
      searchResults: searchResult.ok ? searchResult.value.results : [],
      sources,
      sourceErrors,
    };
  }

  async getEntity(entityType: string, id: string, parent?: { entityType: string; id: string }): Promise<{ record: Record<string, unknown>; sources: PracticeAssistantSource[] }> {
    if (entityType === 'practice' && id === 'current') {
      const [practice, details] = await Promise.all([
        this.settle('Practice', () => this.fetchBackend(`/api/practice/${encodeURIComponent(this.practiceId)}`, { sourceName: 'Practice lookup' })),
        this.settle('Practice details', () => this.fetchBackend(`/api/practice/${encodeURIComponent(this.practiceId)}/details`, { sourceName: 'Practice details lookup' })),
      ]);
      const record = {
        id: this.practiceId,
        slug: this.practiceSlug ?? null,
        practice: practice.ok ? practice.value : null,
        details: details.ok ? details.value : null,
        sourceErrors: [practice, details]
          .filter((result): result is { source: string; ok: false; error: string } => !result.ok)
          .map((result) => ({ source: result.source, error: result.error })),
      };
      return { record, sources: [this.source('practice', 'current', this.practiceSlug ?? 'Current practice')] };
    }
    const registryConfig = ENTITY_REGISTRY[entityType];
    if (registryConfig) {
      if (registryConfig.parentEntityType && !parent?.id) {
        throw HttpErrors.badRequest(`get_entity: "${entityType}" requires parent.id (parentEntityType="${registryConfig.parentEntityType}")`);
      }
      if (!registryConfig.readRoute) {
        throw HttpErrors.badRequest(`get_entity: "${entityType}" has no read route`);
      }
      const url = registryConfig.readRoute({ practiceId: this.practiceId, id, parentId: parent?.id, parentType: parent?.entityType });
      const record = unwrapRecord(await this.fetchBackend(url, { sourceName: `${entityType} lookup` }));
      return { record, sources: [this.source(this.sourceType(entityType), id, getString(record, ['name', 'title', 'label', 'client_name', 'matter_number']) ?? entityType.replace(/_/g, ' '))] };
    }
    if (!isPracticeEntityType(entityType)) {
      throw HttpErrors.badRequest(`Unsupported entity type for this operation: ${entityType}`);
    }
    const config = entityConfig(entityType);
    const record = unwrapRecord(await this.fetchBackend(config.path(this.practiceId, id), { sourceName: `${config.label} lookup` }));
    return { record, sources: [this.source(config.sourceType, id, getString(record, ['name', 'title', 'label', 'client_name', 'matter_number']) ?? config.label)] };
  }

  async listEntities(entityType: string, options?: PracticeListOptions): Promise<{ records: unknown[]; sources: PracticeAssistantSource[] }> {
    const registryConfig = ENTITY_REGISTRY[entityType];
    if (registryConfig) {
      if (registryConfig.parentEntityType) {
        if (!options?.parent?.id) {
          throw HttpErrors.badRequest(`list_entities: "${entityType}" requires parent.id (parentEntityType="${registryConfig.parentEntityType}")`);
        }
        if (!registryConfig.listRoute) {
          throw HttpErrors.badRequest(`list_entities: "${entityType}" has no list route`);
        }
        const url = registryConfig.listRoute({ practiceId: this.practiceId, parentId: options.parent.id, parentType: options.parent.entityType });
        const payload = await this.fetchBackend(url, { sourceName: entityType });
        const records = unwrapList(payload, registryConfig.listKeys ?? ['items', 'results']);
        return { records: applyListOptions(records, options), sources: [this.source(this.sourceType(entityType), entityType, entityType.replace(/_/g, ' '))] };
      }
      if (!registryConfig.listRoute) {
        throw HttpErrors.badRequest(`list_entities: "${entityType}" has no list route`);
      }
      const url = registryConfig.listRoute({ practiceId: this.practiceId });
      const payload = await this.fetchBackend(url, { sourceName: entityType });
      const records = unwrapList(payload, registryConfig.listKeys ?? ['items', 'results']);
      return { records: applyListOptions(records, options), sources: [this.source(this.sourceType(entityType), entityType, entityType.replace(/_/g, ' '))] };
    }
    if (!isPracticeEntityType(entityType)) {
      throw HttpErrors.badRequest(`Unsupported entity type for this operation: ${entityType}`);
    }
    const config = entityConfig(entityType);
    const payload = await this.fetchBackend(config.path(this.practiceId), { sourceName: config.label });
    const records = unwrapList(payload, config.listKeys);
    return { records: applyListOptions(records, options), sources: [this.source(config.sourceType, entityType, config.label)] };
  }

  async getRelatedEntities(
    entityType: string,
    id: string,
    relation?: string,
    options?: PracticeListOptions,
  ): Promise<{ records: unknown[]; sources: PracticeAssistantSource[]; sourceErrors: PracticeSourceError[] }> {
    const isParentScoped = (rel: string) => ENTITY_REGISTRY[rel]?.parentEntityType === entityType;
    const isFilterRelation = (rel: string) =>
      isPracticeEntityType(entityType) && Boolean(RELATION_FILTERS[entityType as PracticeEntityType]?.[rel as PracticeEntityType]);

    const relatedTypes: string[] = relation
      ? [relation]
      : defaultRelations(entityType as PracticeEntityType).map(String);

    if (relation && !isParentScoped(relation) && !isFilterRelation(relation)) {
      throw HttpErrors.badRequest(`Unsupported relation: ${entityType} -> ${relation}`);
    }

    const results = await Promise.all(relatedTypes.map((relatedType) => this.settle(relatedType, async () => {
      if (isParentScoped(relatedType)) {
        return this.listEntities(relatedType, { ...options, parent: { entityType, id } });
      }
      const relationFilter = isPracticeEntityType(entityType) ? RELATION_FILTERS[entityType as PracticeEntityType]?.[relatedType as PracticeEntityType] : undefined;
      if (!relationFilter) {
        throw new Error(`Unsupported relation: ${entityType} -> ${relatedType}`);
      }
      return this.listEntities(relatedType, { ...options, filters: [...relationFilter(id), ...(options?.filters ?? [])] });
    })));

    const records = results.flatMap((result) => result.ok ? result.value.records.map((record) => ({
      relation: result.source,
      record,
    })) : []);
    const entitySourceType = isPracticeEntityType(entityType) ? entityConfig(entityType as PracticeEntityType).sourceType : this.sourceType(entityType);
    const entityLabel = isPracticeEntityType(entityType) ? entityConfig(entityType as PracticeEntityType).label : entityType.replace(/_/g, ' ');
    const sources = [
      this.source(entitySourceType, id, `${entityLabel} ${id}`),
      ...results.flatMap((result) => result.ok ? result.value.sources : []),
    ];
    const sourceErrors = results
      .filter((result): result is { source: string; ok: false; error: string } => !result.ok)
      .map((result) => ({ source: result.source, error: result.error }));
    return { records, sources, sourceErrors };
  }

  source(type: PracticeAssistantSource['type'], id: string, label: string): PracticeAssistantSource {
    return { type, id, label, href: this.hrefFor(type, id) };
  }

  private sourceType(value: string): PracticeAssistantSource['type'] {
    const VALID: ReadonlySet<string> = new Set([
      'client', 'intake', 'matter', 'matter_task', 'matter_note', 'matter_milestone',
      'matter_expense', 'time_entry', 'matter_file_link', 'client_memo', 'engagement',
      'invoice', 'report', 'task', 'search', 'practice', 'preference', 'conversation',
    ]);
    if (VALID.has(value)) return value as PracticeAssistantSource['type'];
    if (value.includes('intake')) return 'intake';
    if (value.includes('client')) return 'client';
    if (value.includes('matter')) return 'matter';
    if (value.includes('invoice')) return 'invoice';
    if (value.includes('engagement') || value.includes('contract')) return 'engagement';
    if (value.includes('task')) return 'task';
    return 'search';
  }

  private hrefFor(type: string, id: string): string | undefined {
    const slug = this.practiceSlug?.trim();
    if (!slug) return undefined;
    const base = `/practice/${encodeURIComponent(slug)}`;
    if (type.includes('intake')) return `${base}/intakes/responses/${encodeURIComponent(id)}`;
    if (type.includes('matter')) return `${base}/matters/${encodeURIComponent(id)}`;
    if (type.includes('invoice')) return `${base}/invoices/${encodeURIComponent(id)}`;
    if (type.includes('engagement') || type.includes('contract')) return `${base}/engagements/${encodeURIComponent(id)}`;
    if (type.includes('report')) return `${base}/reports`;
    return undefined;
  }

  private async settle<T>(
    source: string,
    load: () => Promise<T>,
  ): Promise<{ source: string; ok: true; value: T } | { source: string; ok: false; error: string }> {
    try {
      return { source, ok: true, value: await load() };
    } catch (error) {
      return { source, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

}
