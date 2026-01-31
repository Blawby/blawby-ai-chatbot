export type PracticeRole = 'owner' | 'admin' | 'member';

export const PRACTICE_ROLE_LABELS: Record<PracticeRole, string> = {
  owner: 'Owner',
  admin: 'Lawyer',
  member: 'Client'
};

export const getPracticeRoleLabel = (role: PracticeRole): string => PRACTICE_ROLE_LABELS[role];

export const PRACTICE_ROLE_OPTIONS: Array<{ value: PracticeRole; label: string }> = [
  { value: 'member', label: PRACTICE_ROLE_LABELS.member },
  { value: 'admin', label: PRACTICE_ROLE_LABELS.admin },
  { value: 'owner', label: PRACTICE_ROLE_LABELS.owner }
];

export const normalizePracticeRole = (value: unknown): PracticeRole | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'owner' || normalized === 'admin' || normalized === 'member') {
    return normalized;
  }
  return null;
};
