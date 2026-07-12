export interface ValidationFailure {
  field: string;
  reason: string;
}

export interface ProductionConfigInput {
  wrangler: Record<string, unknown>;
  pagesHeaders: string;
  pagesRedirects: string;
  buildEnv?: Record<string, string | undefined>;
  workerSecretNames?: string[];
}

type UnknownRecord = Record<string, unknown>;

const REQUIRED_BINDINGS = {
  kv_namespaces: ['CHAT_SESSIONS'],
  d1_databases: ['DB'],
  r2_buckets: ['FILES_BUCKET'],
  vectorize: ['SEARCH_VECTORS'],
} as const;

const REQUIRED_QUEUE_BINDINGS = [
  'NOTIFICATION_EVENTS',
  'SEARCH_INDEX_EVENTS',
  'INTAKE_CONVERSATION_EVENTS',
] as const;

const REQUIRED_DURABLE_OBJECTS = [
  'CHAT_ROOM',
  'CHAT_COUNTER',
  'MATTER_PROGRESS',
  'PRESENCE_ROOM',
] as const;

export const REQUIRED_WORKER_SECRETS = [
  'ADOBE_CLIENT_ID',
  'ADOBE_CLIENT_SECRET',
  'ADOBE_ORGANIZATION_ID',
  'ADOBE_TECHNICAL_ACCOUNT_EMAIL',
  'ADOBE_TECHNICAL_ACCOUNT_ID',
  'CF_AIG_TOKEN',
  'GEOAPIFY_API_KEY',
  'IDEMPOTENCY_SALT',
  'ONESIGNAL_APP_ID',
  'ONESIGNAL_REST_API_KEY',
  'WIDGET_AUTH_TOKEN_SECRET',
  'WORKER_EVENT_SECRET',
] as const;

const FORBIDDEN_PRODUCTION_REFERENCE = /(?:localhost|127\.0\.0\.1|\[::1\]|staging|local\.blawby\.com|dev\.blawby\.com)/i;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): UnknownRecord => isRecord(value) ? value : {};
const asRecords = (value: unknown): UnknownRecord[] => Array.isArray(value) ? value.filter(isRecord) : [];

const bindingNames = (value: unknown, key: 'binding' | 'name'): Set<string> =>
  new Set(asRecords(value).map((entry) => entry[key]).filter((name): name is string => typeof name === 'string'));

const addMissing = (
  failures: ValidationFailure[],
  field: string,
  actual: Set<string>,
  required: readonly string[],
): void => {
  for (const name of required) {
    if (!actual.has(name)) failures.push({ field: `${field}.${name}`, reason: 'required binding is missing' });
  }
};

const validateHttpsUrl = (
  failures: ValidationFailure[],
  field: string,
  raw: unknown,
  expectedHost?: string,
): void => {
  if (typeof raw !== 'string' || raw.trim() === '') {
    failures.push({ field, reason: 'required URL is missing' });
    return;
  }

  if (FORBIDDEN_PRODUCTION_REFERENCE.test(raw)) {
    failures.push({ field, reason: 'contains a forbidden non-production reference' });
    return;
  }

  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') failures.push({ field, reason: 'must use https' });
    if (expectedHost && url.hostname !== expectedHost) failures.push({ field, reason: 'does not match the production host' });
  } catch {
    failures.push({ field, reason: 'is not a valid absolute URL' });
  }
};

export function validateProductionConfig(input: ProductionConfigInput): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  const environments = asRecord(input.wrangler.env);
  const production = asRecord(environments.production);
  const vars = asRecord(production.vars);

  if (production.name !== 'blawby-ai-chatbot') {
    failures.push({ field: 'worker.env.production.name', reason: 'does not match the production Worker name' });
  }
  if (vars.NODE_ENV !== 'production') {
    failures.push({ field: 'worker.env.production.vars.NODE_ENV', reason: 'must identify the production environment' });
  }

  for (const [section, required] of Object.entries(REQUIRED_BINDINGS)) {
    addMissing(failures, `worker.env.production.${section}`, bindingNames(production[section], 'binding'), required);
  }

  const queueConfig = asRecord(production.queues);
  addMissing(
    failures,
    'worker.env.production.queues.producers',
    bindingNames(queueConfig.producers, 'binding'),
    REQUIRED_QUEUE_BINDINGS,
  );
  const consumerQueues = new Set(
    asRecords(queueConfig.consumers).map((entry) => entry.queue).filter((name): name is string => typeof name === 'string'),
  );
  for (const queue of ['notification-events', 'search-index-events', 'intake-conversation-events']) {
    if (!consumerQueues.has(queue)) {
      failures.push({ field: `worker.env.production.queues.consumers.${queue}`, reason: 'required queue consumer is missing' });
    }
  }

  const durableObjects = asRecord(production.durable_objects);
  addMissing(
    failures,
    'worker.env.production.durable_objects.bindings',
    bindingNames(durableObjects.bindings, 'name'),
    REQUIRED_DURABLE_OBJECTS,
  );

  if (asRecord(production.ai).binding !== 'AI') {
    failures.push({ field: 'worker.env.production.ai.AI', reason: 'required Workers AI binding is missing' });
  }
  if (asRecord(production.version_metadata).binding !== 'CF_VERSION_METADATA') {
    failures.push({ field: 'worker.env.production.version_metadata.CF_VERSION_METADATA', reason: 'release metadata binding is missing' });
  }
  const observability = asRecord(production.observability);
  const observabilityLogs = asRecord(observability.logs);
  if (observability.enabled !== true || observabilityLogs.enabled !== true ||
      observabilityLogs.persist !== true || observabilityLogs.invocation_logs !== true) {
    failures.push({
      field: 'worker.env.production.observability.logs',
      reason: 'persisted production invocation logs must be enabled',
    });
  }

  validateHttpsUrl(failures, 'worker.env.production.vars.CLOUDFLARE_PUBLIC_URL', vars.CLOUDFLARE_PUBLIC_URL, 'ai.blawby.com');
  validateHttpsUrl(failures, 'worker.env.production.vars.BACKEND_API_URL', vars.BACKEND_API_URL, 'api.blawby.com');
  validateHttpsUrl(failures, 'worker.env.production.vars.ADOBE_IMS_BASE_URL', vars.ADOBE_IMS_BASE_URL);
  validateHttpsUrl(failures, 'worker.env.production.vars.ADOBE_PDF_SERVICES_BASE_URL', vars.ADOBE_PDF_SERVICES_BASE_URL);

  const allowedOrigins = typeof vars.ALLOWED_WS_ORIGINS === 'string'
    ? vars.ALLOWED_WS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
    : [];
  if (allowedOrigins.length === 0) {
    failures.push({ field: 'worker.env.production.vars.ALLOWED_WS_ORIGINS', reason: 'required origin allowlist is missing' });
  }
  for (const origin of allowedOrigins) {
    validateHttpsUrl(failures, 'worker.env.production.vars.ALLOWED_WS_ORIGINS', origin);
  }

  const routes = asRecords(production.routes);
  const productionRoute = routes.some((route) =>
    route.pattern === 'ai.blawby.com/api/*' && route.zone_name === 'blawby.com');
  if (!productionRoute) {
    failures.push({ field: 'worker.env.production.routes', reason: 'production API route does not match the production environment' });
  }

  if (FORBIDDEN_PRODUCTION_REFERENCE.test(input.pagesHeaders)) {
    failures.push({ field: 'pages.public/_headers', reason: 'contains a forbidden non-production reference' });
  }
  const requiredCspTargets = [
    "default-src 'self'",
    "object-src 'none'",
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    'https://cdn.onesignal.com',
  ];
  for (const target of requiredCspTargets) {
    if (!input.pagesHeaders.includes(target)) {
      failures.push({ field: 'pages.public/_headers.Content-Security-Policy', reason: 'required production CSP target is missing' });
    }
  }
  if (!/^\/api\/\*\s+\/api\/:splat\s+200$/m.test(input.pagesRedirects)) {
    failures.push({ field: 'pages.public/_redirects./api/*', reason: 'Worker API route is missing' });
  }
  if (!/^\/\*\s+\/index\.html\s+200$/m.test(input.pagesRedirects)) {
    failures.push({ field: 'pages.public/_redirects./*', reason: 'SPA fallback route is missing' });
  }

  if (input.buildEnv) {
    validateHttpsUrl(failures, 'build.VITE_BACKEND_API_URL', input.buildEnv.VITE_BACKEND_API_URL, 'api.blawby.com');
    validateHttpsUrl(failures, 'build.VITE_APP_BASE_URL', input.buildEnv.VITE_APP_BASE_URL, 'ai.blawby.com');
    validateHttpsUrl(failures, 'build.VITE_WORKER_API_URL', input.buildEnv.VITE_WORKER_API_URL, 'ai.blawby.com');
  }

  if (input.workerSecretNames) {
    const names = new Set(input.workerSecretNames);
    for (const name of REQUIRED_WORKER_SECRETS) {
      if (!names.has(name)) failures.push({ field: `worker.secret.${name}`, reason: 'required production secret name is missing' });
    }
  }

  return failures;
}
