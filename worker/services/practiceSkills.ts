import type { Env } from '../types.js';

const skillKeys = new Set(['matter_management', 'billing', 'client_intake']);

export interface PracticeSkillPromptContract {
  enabledSkills: string[];
  promptContribution: string;
}

const backendBaseUrl = (env: Env): string => {
  const baseUrl = env.BACKEND_API_URL?.trim();
  if (!baseUrl) throw new Error('BACKEND_API_URL is required for practice AI skills');
  return baseUrl.replace(/\/+$/, '');
};

const forwardedAuthHeaders = (request: Request): Headers => {
  const headers = new Headers({ Accept: 'application/json' });
  const cookie = request.headers.get('Cookie');
  const authorization = request.headers.get('Authorization');
  if (cookie) headers.set('Cookie', cookie);
  if (authorization) headers.set('Authorization', authorization);
  return headers;
};

const parsePromptContract = (payload: unknown): PracticeSkillPromptContract => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Practice AI skills response was malformed');
  }
  const record = payload as Record<string, unknown>;
  const enabledSkills = record.enabled_skills;
  const promptContribution = record.prompt_contribution;
  if (
    !Array.isArray(enabledSkills) ||
    !enabledSkills.every((skill) => typeof skill === 'string' && skillKeys.has(skill)) ||
    typeof promptContribution !== 'string'
  ) {
    throw new Error('Practice AI skills response was malformed');
  }
  if (enabledSkills.length > 0 && !promptContribution.trim()) {
    throw new Error('Practice AI skills response omitted prompt context for enabled skills');
  }
  return { enabledSkills, promptContribution };
};

const fetchPrompt = async (env: Env, request: Request, path: string): Promise<PracticeSkillPromptContract> => {
  const response = await fetch(`${backendBaseUrl(env)}${path}`, {
    headers: forwardedAuthHeaders(request),
  });
  if (!response.ok) {
    throw new Error(`Practice AI skills request failed with HTTP ${response.status}`);
  }
  return parsePromptContract(await response.json());
};

export const fetchAuthenticatedPracticeSkillPrompt = (
  env: Env,
  request: Request,
  practiceId: string,
): Promise<PracticeSkillPromptContract> =>
  fetchPrompt(env, request, `/api/practice/${encodeURIComponent(practiceId)}/skills`);

export const fetchPublicPracticeSkillPrompt = (
  env: Env,
  request: Request,
  practiceSlug: string,
): Promise<PracticeSkillPromptContract> => {
  const slug = practiceSlug.trim();
  if (!slug) throw new Error('Practice slug is required for public practice AI skills');
  return fetchPrompt(env, request, `/api/practice/details/${encodeURIComponent(slug)}/skills`);
};

export const appendPracticeSkillPrompt = (basePrompt: string, promptContribution: string): string => {
  const contribution = promptContribution.trim();
  return contribution ? `${basePrompt}\n\nPRACTICE_SKILLS:\n${contribution}` : basePrompt;
};
