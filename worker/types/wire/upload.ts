/**
 * Wire types for Upload resources — backend HTTP contract.
 *
 * snake_case fields, exactly matching the backend at
 * `BACKEND_API_URL` (staging-api.blawby.com / production-api.blawby.com).
 */

import { z } from 'zod';

export const BackendUploadRecordSchema = z.object({
  upload_id: z.string(),
  scope_type: z.string().nullable().optional(),
  scope_id: z.string().nullable().optional(),
  sub_context: z.string().nullable().optional(),
  file_name: z.string(),
  file_type: z.string().nullable().optional(),
  mime_type: z.string(),
  file_size: z.number(),
  storage_provider: z.string().nullable().optional(),
  storage_key: z.string(),
  public_url: z.string().nullable(),
  status: z.enum(['pending', 'verified', 'rejected']),
  is_privileged: z.boolean().nullable().optional(),
  retention_until: z.string().nullable().optional(),
  created_at: z.string(),
  verified_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  uploaded_by: z.string().nullable().optional(),
}).passthrough();
export type BackendUploadRecord = z.infer<typeof BackendUploadRecordSchema>;

export const BackendUploadsListResponseSchema = z.object({
  uploads: z.array(BackendUploadRecordSchema),
  total: z.number().optional(),
  page: z.number().optional(),
  limit: z.number().optional(),
}).passthrough();
export type BackendUploadsListResponse = z.infer<typeof BackendUploadsListResponseSchema>;
