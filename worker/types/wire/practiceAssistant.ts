import { z } from 'zod';

export const PracticeAssistantSourceSchema = z.object({
  type: z.enum(['client', 'intake', 'matter', 'engagement', 'invoice', 'report', 'task', 'search', 'practice']),
  id: z.string(),
  label: z.string(),
  href: z.string().optional(),
});
export type PracticeAssistantSource = z.infer<typeof PracticeAssistantSourceSchema>;

export const PracticeAssistantProgressSchema = z.object({
  toolUseId: z.string(),
  toolName: z.string(),
  label: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
});
export type PracticeAssistantProgress = z.infer<typeof PracticeAssistantProgressSchema>;

export const PracticeAssistantActionStatusSchema = z.enum(['pending', 'approved', 'rejected', 'executed', 'failed']);
export type PracticeAssistantActionStatus = z.infer<typeof PracticeAssistantActionStatusSchema>;

export const PracticeAssistantActionSummarySchema = z.object({
  actionId: z.string(),
  toolUseId: z.string(),
  toolName: z.string(),
  title: z.string(),
  description: z.string(),
  status: PracticeAssistantActionStatusSchema,
  payload: z.record(z.string(), z.unknown()),
  sources: z.array(PracticeAssistantSourceSchema).optional(),
});
export type PracticeAssistantActionSummary = z.infer<typeof PracticeAssistantActionSummarySchema>;
