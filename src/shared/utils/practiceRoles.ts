export type PracticeRole = 'owner' | 'admin' | 'attorney' | 'paralegal' | 'member' | 'client';

export const PRACTICE_ROLE_LABELS: Record<PracticeRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  attorney: 'Attorney',
  paralegal: 'Paralegal',
  member: 'Member',
  client: 'Client'
};

/**
 * Role hierarchy levels for permission gating.
 * Higher numbers indicate more privileges.
 */
export const ROLE_LEVEL: Record<PracticeRole, number> = {
  owner: 5,
  admin: 4,
  attorney: 3,
  paralegal: 2,
  member: 1,
  client: 0
};

export const getPracticeRoleLabel = (role: PracticeRole): string => PRACTICE_ROLE_LABELS[role];

/**
 * Check if a role has at least the specified minimum level.
 * @param role The role to check
 * @param minRole The minimum required role
 * @returns true if role >= minRole in the hierarchy
 */
export const hasRoleLevel = (role: PracticeRole | null, minRole: PracticeRole): boolean => {
  if (!role) return false;
  return ROLE_LEVEL[role] >= ROLE_LEVEL[minRole];
};

/**
 * Role options for invitations and role editing.
 * Note: 'client' is excluded from options as it cannot be assigned via UI.
 * The backend may set 'client' role through other flows (intake/link/invite).
 */
export const PRACTICE_ROLE_OPTIONS: Array<{ value: PracticeRole; label: string }> = [
  { value: 'member', label: PRACTICE_ROLE_LABELS.member },
  { value: 'paralegal', label: PRACTICE_ROLE_LABELS.paralegal },
  { value: 'attorney', label: PRACTICE_ROLE_LABELS.attorney },
  { value: 'admin', label: PRACTICE_ROLE_LABELS.admin },
  { value: 'owner', label: PRACTICE_ROLE_LABELS.owner }
];

export const normalizePracticeRole = (value: unknown): PracticeRole | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'owner' ||
    normalized === 'admin' ||
    normalized === 'attorney' ||
    normalized === 'paralegal' ||
    normalized === 'member' ||
    normalized === 'client'
  ) {
    return normalized;
  }
  return null;
};
