/**
 * Structured logging utility for Cloudflare Workers
 * Provides consistent, searchable logs with correlation IDs
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'metric';

export interface LogData {
  [key: string]: unknown;
}

export interface LogEntry {
  ts: string;
  level: LogLevel;
  stage: string;
  request_id?: string;
  [key: string]: unknown;
}

/**
 * Structured logging function
 * @param level - Log level (debug, info, warn, error, metric)
 * @param stage - Stage/component name (e.g., 'adobe.extract.start', 'ai.analyze.complete')
 * @param data - Additional data to include in the log
 */
export function log(level: LogLevel, stage: string, data: LogData = {}): void {
  const entry: LogEntry = {
    ...data,
    ts: new Date().toISOString(),
    level,
    stage
  };
  
  console.log(JSON.stringify(entry));
}

/**
 * Generate a correlation ID for request tracing
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Log request start with correlation ID
 */
export function logRequestStart(requestId: string, method: string, path: string, data: LogData = {}): void {
  log('info', 'request.start', {
    request_id: requestId,
    method,
    path,
    ...data
  });
}

/**
 * Log request completion
 */
export function logRequestComplete(requestId: string, status: number, duration: number, data: LogData = {}): void {
  log('info', 'request.complete', {
    request_id: requestId,
    status,
    duration_ms: duration,
    ...data
  });
}

/**
 * Log Adobe extraction steps
 */
export function logAdobeStep(requestId: string, step: string, data: LogData = {}): void {
  log('info', `adobe.${step}`, {
    request_id: requestId,
    ...data
  });
}

/**
 * Log JSON parsing steps
 */
export function logJSONParsing(requestId: string, step: string, data: LogData = {}): void {
  log('info', `json.${step}`, {
    request_id: requestId,
    ...data
  });
}

/**
 * Log errors with context
 */
export function logError(requestId: string, stage: string, error: Error, data: LogData = {}): void {
  log('error', stage, {
    request_id: requestId,
    error: error.message,
    stack: error.stack,
    ...data
  });
}

/**
 * Log metrics for monitoring
 */
export function logMetrics(requestId: string, metrics: LogData): void {
  log('metric', 'analyze.summary', {
    request_id: requestId,
    ...metrics
  });
}

/**
 * Log warnings
 */
export function logWarning(requestId: string, stage: string, message: string, data: LogData = {}): void {
  log('warn', stage, {
    request_id: requestId,
    message,
    ...data
  });
}
