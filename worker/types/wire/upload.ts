/**
 * Wire types for Upload resources — backend HTTP contract.
 *
 * snake_case fields, exactly matching the backend at
 * `BACKEND_API_URL` (staging-api.blawby.com / production-api.blawby.com).
 *
 * Frontend code imports these via `@/shared/types/wire`.
 */

export interface BackendUploadRecord {
  id: string;
  upload_context: string;
  sub_context?: string | null;
  entity_id?: string | null;
  matter_id?: string | null;
  file_name: string;
  mime_type: string;
  file_size: number;
  storage_key: string;
  public_url: string | null;
  status: 'pending' | 'verified' | 'rejected';
  created_at: string;
  updated_at?: string | null;
}
