import type { Env } from './types';

export async function parseJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new Error("Invalid JSON");
  }
}

// Agent handles chat logging - no manual logging needed

// Agent handles matter questions - no manual storage needed

export async function createMatterRecord(
  _env: Env,
  _practiceId: string,
  _sessionId: string,
  _service: string,
  _description: string,
  _urgency: string = 'normal',
  _ctx?: ExecutionContext
): Promise<string> {
  throw new Error('Local matter creation has been removed; use backend matter APIs.');
}

// Agent handles AI summaries - no manual storage needed

// Agent handles AI summary updates - no manual updates needed

// Agent handles matter updates - no manual updates needed

// Agent handles matter ID retrieval - no manual retrieval needed
