/**
 * Wire types for auth/session resources — backend HTTP contract.
 *
 * snake_case fields, exactly matching the backend at
 * `BACKEND_API_URL` (staging-api.blawby.com / production-api.blawby.com).
 */

import { z } from 'zod';

export const BackendSessionSchema = z.object({
  id: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  expires_at: z.string().nullable().optional(),
}).passthrough();
export type BackendSession = z.infer<typeof BackendSessionSchema>;
