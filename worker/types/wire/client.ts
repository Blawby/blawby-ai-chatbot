/**
 * Wire types for client (user-detail) API responses.
 *
 * The backend's `/api/clients/:practiceId` endpoint returns these shapes;
 * the frontend's `apiClient.listUserDetails` / `apiClient.updateUserDetail`
 * adapt them. Snake_case preserved.
 */

import { z } from 'zod';

export const UserDetailStatusSchema = z.enum(['active', 'archived']);
export type UserDetailStatus = z.infer<typeof UserDetailStatusSchema>;

export const BackendUserDetailAddressSchema = z.object({
  street: z.string().nullable().optional(),
  street_2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
}).passthrough();
export type BackendUserDetailAddress = z.infer<typeof BackendUserDetailAddressSchema>;

export const BackendUserDetailSchema = z.object({
  id: z.string(),
  practice_id: z.string().optional(),
  user_id: z.string().nullable().optional(),
  client_id: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  status: UserDetailStatusSchema.optional(),
  currency: z.string().nullable().optional(),
  address: BackendUserDetailAddressSchema.nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
}).passthrough();
export type BackendUserDetail = z.infer<typeof BackendUserDetailSchema>;

export const BackendUserDetailMemoSchema = z.object({
  id: z.string(),
  user_detail_id: z.string().optional(),
  content: z.string().nullable().optional(),
  event_time: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
}).passthrough();
export type BackendUserDetailMemo = z.infer<typeof BackendUserDetailMemoSchema>;
