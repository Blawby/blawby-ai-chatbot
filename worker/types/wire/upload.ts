/**
 * Wire types for Upload resources — backend HTTP contract.
 *
 * snake_case fields, exactly matching the backend at
 * `BACKEND_API_URL` (staging-api.blawby.com / production-api.blawby.com).
 */

import { z } from 'zod';

export const BackendUploadRecordSchema = z.object({
  id: z.string(),
  upload_context: z.string(),
  sub_context: z.string().nullable().optional(),
  entity_id: z.string().nullable().optional(),
  matter_id: z.string().nullable().optional(),
  file_name: z.string(),
  mime_type: z.string(),
  file_size: z.number(),
  storage_key: z.string(),
  public_url: z.string().nullable(),
  status: z.enum(['pending', 'verified', 'rejected']),
  created_at: z.string(),
  updated_at: z.string().nullable().optional(),
}).passthrough();
export type BackendUploadRecord = z.infer<typeof BackendUploadRecordSchema>;
