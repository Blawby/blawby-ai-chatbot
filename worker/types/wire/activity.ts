/**
 * Wire types for the `/api/activity` feed.
 *
 * The endpoint returns a paginated list of activity events spanning
 * matters, conversations, intake, and system actions. Snake_case
 * preserved from the backend; the frontend's `useActivity` hook
 * converts to its `ActivityEvent` shape.
 */

export type BackendActivityEventType = 'matter_event' | 'conversation_event';
export type BackendActivityActorType = 'user' | 'lawyer' | 'system';

export interface BackendActivityEvent {
  id: string;
  uid: string;
  type: BackendActivityEventType;
  event_type: string;
  title: string;
  description: string;
  event_date: string;
  actor_type?: BackendActivityActorType;
  actor_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface BackendActivityListResponse {
  success: boolean;
  data?: {
    items: BackendActivityEvent[];
    hasMore: boolean;
    total?: number;
    nextCursor?: string;
  };
  error?: string;
}
