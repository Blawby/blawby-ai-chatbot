import type { UserPreferences } from '../lib/apiClient';

type Role = 'owner' | 'admin' | 'attorney' | 'paralegal';

export interface MockPractice {
  id: string;
  slug: string;
  name: string;
  description?: string;
  kind: 'personal' | 'business';
  subscriptionStatus: string;
  subscriptionTier?: string | null;
  seats?: number | null;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface MockMember {
  userId: string;
  role: Role;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  createdAt: number;
}

export interface MockInvitation {
  id: string;
  practiceId: string;
  practiceName?: string;
  email: string;
  role: Role;
  status: 'pending' | 'accepted' | 'declined';
  invitedBy: string;
  expiresAt: number;
  createdAt: number;
}


export interface OnboardingState {
  status: 'completed' | 'skipped' | 'pending' | 'not_required';
  completed: boolean;
  skipped: boolean;
  completedAt: number | null;
  lastSavedAt: number | null;
  hasDraft: boolean;
  data: Record<string, unknown> | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  stripeAccountId: string | null;
}

const personalPracticeId = 'practice-personal';
const businessPracticeId = 'practice-business';
const now = Date.now();

const personalPractice: MockPractice = {
  id: personalPracticeId,
  slug: 'personal-workspace',
  name: 'Personal Workspace',
  description: 'Your default workspace for personal matters.',
  kind: 'personal',
  subscriptionStatus: 'active',
  subscriptionTier: 'business',
  seats: 1,
  config: {
    ownerEmail: 'owner@example.com',
    metadata: {
      subscriptionPlan: 'business',
      planStatus: 'active'
    },
    availableServices: ['Family Law', 'Business Law'],
    serviceQuestions: {}
  }
};

const businessPractice: MockPractice = {
  id: businessPracticeId,
  slug: 'acme-law',
  name: 'Acme Law Group',
  description: 'Boutique firm focused on business law.',
  kind: 'business',
  subscriptionStatus: 'trialing',
  subscriptionTier: 'business',
  seats: 5,
  config: {
    ownerEmail: 'admin@acme-law.test',
    metadata: {
      subscriptionPlan: 'business',
      planStatus: 'trialing'
    },
    availableServices: ['Business Formation', 'Contracts', 'Employment'],
    serviceQuestions: {}
  }
};

const defaultMembers: Record<string, MockMember[]> = {
  [personalPracticeId]: [
    {
      userId: 'user-1',
      role: 'owner',
      email: 'owner@example.com',
      name: 'Jane Founder',
      image: null,
      createdAt: now - 1000 * 60 * 60 * 24
    }
  ],
  [businessPracticeId]: [
    {
      userId: 'user-1',
      role: 'owner',
      email: 'admin@acme-law.test',
      name: 'Alex Managing',
      image: null,
      createdAt: now - 1000 * 60 * 60 * 12
    },
    {
      userId: 'user-2',
      role: 'attorney',
      email: 'associate@acme-law.test',
      name: 'Sam Associate',
      image: null,
      createdAt: now - 1000 * 60 * 30
    }
  ]
};

const defaultInvitation: MockInvitation = {
  id: 'invite-1',
  practiceId: businessPracticeId,
  practiceName: businessPractice.name,
  email: 'new.attorney@example.com',
  role: 'attorney',
  status: 'pending',
  invitedBy: 'user-1',
  expiresAt: now + 1000 * 60 * 60 * 24 * 7,
  createdAt: now - 1000 * 60 * 15
};


const defaultOnboarding: OnboardingState = {
  status: 'pending',
  completed: false,
  skipped: false,
  completedAt: null,
  lastSavedAt: null,
  hasDraft: false,
  data: null,
  chargesEnabled: false,
  payoutsEnabled: false,
  detailsSubmitted: false,
  stripeAccountId: null
};

const defaultPreferences: UserPreferences = {
  theme: 'system',
  accentColor: '#7c3aed',
  fontSize: 'medium',
  language: 'en',
  timezone: 'America/New_York',
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h',
  emailNotifications: true,
  pushNotifications: false,
  smsNotifications: false,
  notificationFrequency: 'daily',
  autoSaveConversations: true,
  typingIndicators: true
};

export const mockDb = {
  practices: [personalPractice, businessPractice],
  members: { ...defaultMembers } as Record<string, MockMember[]>,
  invitations: [defaultInvitation] as MockInvitation[],
  onboarding: {
    [businessPracticeId]: { ...defaultOnboarding },
    [personalPracticeId]: { ...defaultOnboarding }
  } as Record<string, OnboardingState>,
  userPreferences: { ...defaultPreferences }
};

export const MOCK_REMOTE_BASE = 'https://staging-api.blawby.com';

export function randomId(prefix = 'mock'): string {
  const base =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${base.replace(/[^a-zA-Z0-9]/g, '')}`;
}

export function ensurePracticeCollections(practiceId: string): void {
  if (!mockDb.members[practiceId]) {
    mockDb.members[practiceId] = [];
  }
  if (!mockDb.onboarding[practiceId]) {
    mockDb.onboarding[practiceId] = { ...defaultOnboarding };
  }
}
