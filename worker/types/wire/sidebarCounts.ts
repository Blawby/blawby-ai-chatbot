/**
 * Wire types for /api/practice/:id/sidebar/counts — aggregated counts that
 * power the unified Sidebar's badges (Pencil GtRGH).
 *
 * Each section is optional: the worker only emits a section when it can
 * compute it cheaply. Missing sections render no badge. Per-status sub-counts
 * appear when the rail item is expanded for that section.
 */

import { z } from 'zod';

const nonNegativeInt = () => z.number().int().nonnegative();

export const BackendSidebarCountsSchema = z.object({
  intakes: z
    .object({
      total: nonNegativeInt(),
      pending_review: nonNegativeInt(),
      accepted: nonNegativeInt(),
      declined: nonNegativeInt(),
    })
    .optional(),
  conversations: z
    .object({
      total: nonNegativeInt(),
      unread: nonNegativeInt(),
      // Bucket keys correspond to PRACTICE_CONVERSATIONS_ASSIGNED_TO_MAP filter
      // ids (your-inbox, assigned-to-me, all, unassigned). 'mentions' is omitted
      // because there is no mentions table to count against today.
      byFilter: z.record(z.string(), nonNegativeInt()),
    })
    .optional(),
  matters: z
    .object({
      total: nonNegativeInt(),
      // Bucket keys correspond to MATTERS_FILTER_MAP filter ids (active, closing,
      // closed, declined, new). Empty when no matters fall into a bucket.
      byStatus: z.record(z.string(), nonNegativeInt()),
    })
    .optional(),
  invoices: z
    .object({
      total: nonNegativeInt(),
      // Bucket keys correspond to PRACTICE_INVOICES_FILTER_MAP filter ids
      // (draft, sent, open, overdue, paid, void).
      byStatus: z.record(z.string(), nonNegativeInt()),
    })
    .optional(),
  files: z
    .object({
      total: nonNegativeInt(),
    })
    .optional(),
});

export type BackendSidebarCounts = z.infer<typeof BackendSidebarCountsSchema>;
