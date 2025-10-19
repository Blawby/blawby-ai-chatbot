export const TIER_LIMITS = {
  free: {
    messagesPerMonth: 100,
    filesPerMonth: 5,
    maxFileSizeMB: 5,
    apiAccess: false,
    teamMembers: 1,
  },
  plus: {
    messagesPerMonth: 1000,
    filesPerMonth: 20,
    maxFileSizeMB: 25,
    apiAccess: false,
    teamMembers: 5,
  },
  business: {
    messagesPerMonth: -1,
    filesPerMonth: -1,
    maxFileSizeMB: 100,
    apiAccess: true,
    teamMembers: 50,
  },
  enterprise: {
    messagesPerMonth: -1,
    filesPerMonth: -1,
    maxFileSizeMB: 500,
    apiAccess: true,
    teamMembers: -1,
  },
} as const;

export const PUBLIC_ORGANIZATION_LIMITS = {
  messagesPerMonth: 10,
  filesPerMonth: 0,
  maxFileSizeMB: 0,
  apiAccess: false,
  teamMembers: 0,
} as const;

export type TierName = keyof typeof TIER_LIMITS;
export type TierLimits = (typeof TIER_LIMITS)[TierName];
