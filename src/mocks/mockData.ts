import type { PreferencesResponse } from '@/shared/types/preferences';

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
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  introMessage?: string | null;
  overview?: string | null;
  isPublic?: boolean | null;
  services?: Array<Record<string, unknown>> | null;
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

export interface MockConversation {
  id: string;
  practice_id: string;
  user_id: string | null; // null for anonymous users
  matter_id: string | null;
  participants: string[]; // Array of user IDs
  user_info: Record<string, unknown> | null;
  status: 'active' | 'archived' | 'completed' | 'closed';
  assigned_to: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  tags: string[] | undefined;
  internal_notes: string | null;
  last_message_at: string | null;
  first_response_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MockMessage {
  id: string;
  conversation_id: string;
  practice_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: Record<string, unknown> | null;
  token_count: number | null;
  created_at: string;
}

const personalPracticeId = 'practice-personal';
export const businessPracticeId = 'practice-business';
// Using businessPracticeId as the default practice for all mock pages
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

// Mock practice for guest testing
const mockPracticeId = 'mock-practice-guest';
const mockPractice: MockPractice = {
  id: mockPracticeId,
  slug: 'mock-practice-guest',
  name: 'Mock Law Firm',
  description: 'A mock practice for testing guest chat flow.',
  kind: 'business',
  subscriptionStatus: 'active',
  subscriptionTier: 'business',
  seats: 1,
  config: {
    ownerEmail: 'owner@mock-law.test',
    profileImage: null,
    introMessage: 'Hello! Welcome to Mock Law Firm. How can we help you today?',
    description: 'We provide excellent legal services for testing purposes.',
    availableServices: ['Family Law', 'Business Law', 'Employment Law'],
    serviceQuestions: {},
    brandColor: '#000000',
    accentColor: '#000000',
    metadata: {
      subscriptionPlan: 'business',
      planStatus: 'active'
    }
  }
};

// Mock practice for inbox testing
const inboxPracticeId = 'inbox-mock-practice';
const inboxPractice: MockPractice = {
  id: inboxPracticeId,
  slug: 'inbox-mock-practice',
  name: 'Inbox Mock Practice',
  description: 'A mock practice for testing inbox functionality.',
  kind: 'business',
  subscriptionStatus: 'active',
  subscriptionTier: 'business',
  seats: 5,
  config: {
    ownerEmail: 'inbox@mock-law.test',
    profileImage: null,
    introMessage: 'Welcome to the Inbox Mock Practice. How can we assist you today?',
    description: 'Practice for testing inbox and conversation features.',
    availableServices: ['Consultation', 'Document Review', 'Case Evaluation'],
    serviceQuestions: {},
    brandColor: '#4f46e5',
    accentColor: '#7c3aed',
    metadata: {
      subscriptionPlan: 'business',
      planStatus: 'active',
      features: ['inbox', 'analytics', 'team']
    }
  },
  metadata: {
    conversationConfig: {
      autoReply: true,
      businessHours: {
        enabled: true,
        timezone: 'America/New_York',
        hours: {
          monday: [{ start: '09:00', end: '17:00' }],
          tuesday: [{ start: '09:00', end: '17:00' }],
          wednesday: [{ start: '09:00', end: '17:00' }],
          thursday: [{ start: '09:00', end: '17:00' }],
          friday: [{ start: '09:00', end: '17:00' }]
        }
      },
      autoCloseAfter: 7, // days
      maxParticipants: 10,
      allowAttachments: true,
      allowVoiceMessages: true
    }
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
      createdAt: now - 1000 * 60 * 60 * 10
    }
  ],
  [inboxPracticeId]: [
    {
      userId: 'user-inbox-1',
      role: 'owner',
      email: 'inbox-owner@mock-law.test',
      name: 'Taylor Inbox',
      image: 'https://i.pravatar.cc/150?img=32',
      createdAt: now - 1000 * 60 * 60 * 6
    },
    {
      userId: 'user-inbox-2',
      role: 'attorney',
      email: 'attorney@mock-law.test',
      name: 'Jordan Attorney',
      image: 'https://i.pravatar.cc/150?img=45',
      createdAt: now - 1000 * 60 * 60 * 3
    },
    {
      userId: 'user-inbox-3',
      role: 'paralegal',
      email: 'paralegal@mock-law.test',
      name: 'Casey Paralegal',
      image: 'https://i.pravatar.cc/150?img=22',
      createdAt: now - 1000 * 60 * 60 * 2
    },
    {
      userId: 'user-inbox-4',
      role: 'admin',
      email: 'admin@mock-law.test',
      name: 'Morgan Admin',
      image: 'https://i.pravatar.cc/150?img=60',
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

const defaultPreferences: PreferencesResponse['data'] = {
  id: 'pref-1',
  user_id: 'user-1',
  general: {
    theme: 'system',
    accent_color: '#7c3aed',
    language: 'en',
    spoken_language: 'en',
    timezone: 'America/New_York',
    date_format: 'MM/DD/YYYY',
    time_format: '12h'
  },
  notifications: {
    responses_push: true,
    tasks_push: true,
    tasks_email: true,
    messaging_push: true
  },
  security: {
    two_factor_enabled: false,
    email_notifications: true,
    login_alerts: true
  },
  account: {
    selected_domain: null,
    custom_domains: [],
    receive_feedback_emails: false,
    marketing_emails: false,
    security_alerts: true
  },
  onboarding: {
    completed: false,
    primary_use_case: 'personal'
  },
  created_at: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
  updated_at: new Date(now).toISOString()
};

export interface MockUser {
  id: string;
  email: string;
  name: string;
  primaryWorkspace?: 'client' | 'practice' | null;
  preferredPracticeId?: string | null;
  practiceCount?: number | null;
  hasPractice?: boolean | null;
}

// Storage for anonymous users (keyed by session/token)
const anonymousUsers = new Map<string, MockUser>();

// Storage for conversations (keyed by conversation ID)
const conversations = new Map<string, MockConversation>();

// Storage for messages (keyed by conversation ID, array of messages)
const messages = new Map<string, MockMessage[]>();

export const MOCK_PRACTICES = [personalPractice, businessPractice, mockPractice, inboxPractice];

export const mockDb = {
  practices: MOCK_PRACTICES,
  members: { ...defaultMembers } as Record<string, MockMember[]>,
  invitations: [defaultInvitation] as MockInvitation[],
  onboarding: {
    [businessPracticeId]: { ...defaultOnboarding },
    [personalPracticeId]: { ...defaultOnboarding },
    [mockPracticeId]: { ...defaultOnboarding },
    [inboxPracticeId]: { ...defaultOnboarding }
  } as Record<string, OnboardingState>,
  preferences: { ...defaultPreferences },
  // Guest chat mocks
  anonymousUsers,
  conversations,
  messages
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

// Helper to get or create anonymous user
export function getOrCreateAnonymousUser(token: string): MockUser {
  const existingUser = mockDb.anonymousUsers.get(token);
  if (existingUser) {
    return existingUser;
  }
  const userId = `anonymous-${randomId('user')}`;
  const user = {
    id: userId,
    email: '',
    name: 'Anonymous User',
    primaryWorkspace: null,
    preferredPracticeId: null,
    practiceCount: 0,
    hasPractice: false
  };
  mockDb.anonymousUsers.set(token, user);
  return user;
}

// Helper to get anonymous user by token without creating
export function getAnonymousUserByToken(token: string): MockUser | null {
  return mockDb.anonymousUsers.get(token) ?? null;
}

// Helper to find conversation by practice and user (for anonymous users)
export function findConversationByPracticeAndUser(
  practiceId: string,
  userId: string,
  isAnonymous: boolean
): MockConversation | null {
  for (const conv of mockDb.conversations.values()) {
    if (conv.practice_id === practiceId && conv.status === 'active') {
      if (isAnonymous && conv.user_id === null && conv.participants.includes(userId)) {
        return conv;
      }
      if (!isAnonymous && conv.user_id === userId) {
        return conv;
      }
    }
  }
  return null;
}
