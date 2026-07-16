import {
  PracticeAssistantSourceSchema,
  type PracticeAssistantSource,
} from '@/shared/types/wire';

export const parsePracticeAssistantSources = (value: unknown): PracticeAssistantSource[] | undefined => {
  const parsed = PracticeAssistantSourceSchema.array().safeParse(value);
  return parsed.success && parsed.data.length > 0 ? parsed.data : undefined;
};
