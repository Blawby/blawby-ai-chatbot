/**
 * Custom error types for the application
 */

export class SessionNotReadyError extends Error {
  readonly code = 'SESSION_NOT_READY' as const;

  constructor(message: string = 'Session not ready') {
    super(message);
    this.name = 'SessionNotReadyError';
  }
}
