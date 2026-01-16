export const hasLeadReviewPermission = (role?: string | null): boolean => {
  return role === 'owner' || role === 'admin';
};
