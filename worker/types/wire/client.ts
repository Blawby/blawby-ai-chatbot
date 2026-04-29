/**
 * Wire types for client (user-detail) API responses.
 *
 * The backend's `/api/clients/:practiceId` endpoint returns these shapes;
 * the frontend's `apiClient.listUserDetails` / `apiClient.updateUserDetail`
 * adapt them. Snake_case preserved.
 */

export type UserDetailStatus = 'active' | 'archived';

export interface BackendUserDetailAddress {
  street?: string | null;
  street_2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  [key: string]: unknown;
}

export interface BackendUserDetail {
  id: string;
  practice_id?: string;
  user_id?: string | null;
  client_id?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: UserDetailStatus;
  currency?: string | null;
  address?: BackendUserDetailAddress | null;
  created_at?: string | null;
  updated_at?: string | null;
  /** Free-form metadata; specific keys vary by backend version. */
  [key: string]: unknown;
}

export interface BackendUserDetailMemo {
  id: string;
  user_detail_id?: string;
  content?: string | null;
  event_time?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}
