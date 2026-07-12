import { z } from 'zod';

import { practiceSkillsPath } from '@/config/urls';
import { apiClient } from '@/shared/lib/apiClient';

export const practiceSkillKeySchema = z.enum(['matter_management', 'billing', 'client_intake']);

const practiceSkillDefinitionSchema = z.object({
  key: practiceSkillKeySchema,
  label: z.string().min(1),
  description: z.string().min(1),
  version: z.number().int().positive(),
  scopes: z.array(z.string().min(1)),
});

const practiceSkillsContractSchema = z.object({
  enabled_skills: z.array(practiceSkillKeySchema),
  available_skills: z.array(practiceSkillDefinitionSchema),
  effective_scopes: z.array(z.string().min(1)),
  prompt_contribution: z.string(),
});

export type PracticeSkillKey = z.infer<typeof practiceSkillKeySchema>;
export type PracticeSkillDefinition = z.infer<typeof practiceSkillDefinitionSchema>;
export type PracticeSkillsContract = z.infer<typeof practiceSkillsContractSchema>;

const parseContract = (payload: unknown): PracticeSkillsContract => {
  const parsed = practiceSkillsContractSchema.safeParse(payload);
  if (!parsed.success) throw new Error('Practice AI skills response was malformed.');
  return parsed.data;
};

export const practiceSkillsApi = {
  async get(practiceId: string, signal?: AbortSignal): Promise<PracticeSkillsContract> {
    const response = await apiClient.get<unknown>(practiceSkillsPath(practiceId), { signal });
    return parseContract(response.data);
  },

  async update(practiceId: string, enabledSkills: PracticeSkillKey[]): Promise<PracticeSkillsContract> {
    const response = await apiClient.put<unknown>(practiceSkillsPath(practiceId), {
      enabled_skills: enabledSkills,
    });
    return parseContract(response.data);
  },
};
