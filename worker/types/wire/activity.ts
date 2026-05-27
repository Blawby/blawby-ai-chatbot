/**
 * Wire types for the matter activity log endpoint.
 * GET /api/matters/:practice_id/:matter_id/activity
 */

import { z } from 'zod';

// Activity event/log IDs are backend-generated opaque string identifiers.
export const BackendActivityLogSchema = z.object({
  id: z.string(),
  matter_id: z.string().uuid(),
  user_id: z.string().uuid().nullable(),
  action: z.string(),
  description: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
});
export type BackendActivityLog = z.infer<typeof BackendActivityLogSchema>;

export const BackendActivityEventSchema = z.object({
  id: z.string(),
  uid: z.string().optional(),
  type: z.string(),
  event_type: z.string(),
  title: z.string(),
  description: z.string().optional().nullable(),
  event_date: z.string(),
  actor_type: z.string().optional().nullable(),
  actor_id: z.string().optional().nullable(),
  created_at: z.string(),
}).passthrough();
export type BackendActivityEvent = z.infer<typeof BackendActivityEventSchema>;

export const BackendActivityListResponseSchema = z.union([
  z.object({
    success: z.boolean().optional(),
    activities: z.array(BackendActivityLogSchema),
    data: z.never().optional(),
  }),
  z.object({
    success: z.boolean().optional(),
    data: z.object({
      items: z.array(BackendActivityEventSchema),
      hasMore: z.boolean(),
      total: z.number().optional(),
    }),
    activities: z.never().optional(),
  }),
]);
export type BackendActivityListResponse = z.infer<typeof BackendActivityListResponseSchema>;
