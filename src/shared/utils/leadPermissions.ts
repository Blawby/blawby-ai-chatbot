export type LeadReviewRole = 'owner' | 'admin' | 'attorney' | 'paralegal';

const normalizeRole = (value: unknown): LeadReviewRole | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'owner' || normalized === 'admin' || normalized === 'attorney' || normalized === 'paralegal') {
    return normalized;
  }
  return null;
};

export const resolveLeadReviewRoles = (metadata?: Record<string, unknown> | null): LeadReviewRole[] => {
  const roles = new Set<LeadReviewRole>(['owner', 'admin']);
  const meta = metadata ?? {};
  const leadsConfigRaw = (meta as Record<string, unknown>).leads
    ?? (meta as Record<string, unknown>).leadPermissions;
  if (!leadsConfigRaw || typeof leadsConfigRaw !== 'object') {
    return Array.from(roles);
  }
  const leadsConfig = leadsConfigRaw as Record<string, unknown>;
  const allowedRoles = Array.isArray(leadsConfig.allowedRoles)
    ? leadsConfig.allowedRoles
    : [];
  allowedRoles.forEach((role) => {
    const normalized = normalizeRole(role);
    if (normalized) {
      roles.add(normalized);
    }
  });
  return Array.from(roles);
};

export const hasLeadReviewPermission = (
  memberRole: string | null | undefined,
  metadata?: Record<string, unknown> | null
): boolean => {
  const normalized = normalizeRole(memberRole ?? null);
  if (!normalized) return false;
  const allowed = resolveLeadReviewRoles(metadata);
  return allowed.includes(normalized);
};
