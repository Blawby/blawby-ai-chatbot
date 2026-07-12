import type { Env } from '../types';

type OperationalLevel = 'info' | 'warn' | 'error';

type OperationalEvent = {
  level: OperationalLevel;
  event: string;
  env: Pick<Env, 'NODE_ENV' | 'CF_VERSION_METADATA'>;
  correlationId: string;
  route: string;
  outcome: 'started' | 'succeeded' | 'failed';
  failureClass?: string;
  status?: number;
  durationMs?: number;
};

const emit = (level: OperationalLevel, entry: Record<string, unknown>): void => {
  const serialized = JSON.stringify(entry);
  if (level === 'error') console.error(serialized);
  else if (level === 'warn') console.warn(serialized);
  else console.log(serialized);
};

export const routeFamily = (pathname: string): string => {
  if (pathname === '/') return '/';
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'api') return '/other';
  if (!segments[1]) return '/api';
  if (segments[1] === 'ai') return '/api/ai';
  return `/api/${segments[1]}`;
};

export const failureClass = (error: unknown, status?: number): string => {
  if (status !== undefined) {
    if (status >= 500) return 'server_error';
    if (status >= 400) return 'client_error';
  }
  if (error instanceof SyntaxError) return 'invalid_json';
  if (error instanceof TypeError) return 'type_error';
  return 'unexpected_error';
};

export const logOperationalEvent = ({
  level,
  event,
  env,
  correlationId,
  route,
  outcome,
  failureClass: classifiedFailure,
  status,
  durationMs,
}: OperationalEvent): void => {
  emit(level, {
    ts: new Date().toISOString(),
    level,
    event,
    environment: env.NODE_ENV ?? 'unknown',
    release: env.CF_VERSION_METADATA?.tag ?? 'unknown',
    deployment_id: env.CF_VERSION_METADATA?.id ?? 'unknown',
    correlation_id: correlationId,
    route,
    outcome,
    ...(classifiedFailure ? { failure_class: classifiedFailure } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
  });
};
