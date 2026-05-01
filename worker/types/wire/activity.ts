/**
 * Wire types for the `/api/activity` feed.
 *
 * The endpoint returns a paginated list of activity events spanning
 * matters, conversations, intake, and system actions. Snake_case
 * preserved from the backend.
 */

import { z } from 'zod';

export const BackendActivityEventTypeSchema = z.enum(['matter_event', 'conversation_event']);
export type BackendActivityEventType = z.infer<typeof BackendActivityEventTypeSchema>;

export const BackendActivityActorTypeSchema = z.enum(['user', 'lawyer', 'system']);
export type BackendActivityActorType = z.infer<typeof BackendActivityActorTypeSchema>;

export const BackendActivityEventSchema = z.object({
  id: z.string(),
  uid: z.string(),
  type: BackendActivityEventTypeSchema,
  event_type: z.string(),
  title: z.string(),
  description: z.string(),
  event_date: z.string(),
  actor_type: BackendActivityActorTypeSchema.optional(),
  actor_id: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  created_at: z.string(),
}).passthrough();
export type BackendActivityEvent = z.infer<typeof BackendActivityEventSchema>;

export const BackendActivityListResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    items: z.array(BackendActivityEventSchema),
    hasMore: z.boolean(),
    total: z.number().optional(),
    nextCursor: z.string().optional(),
  }).optional(),
  error: z.string().optional(),
});
export type BackendActivityListResponse = z.infer<typeof BackendActivityListResponseSchema>;
