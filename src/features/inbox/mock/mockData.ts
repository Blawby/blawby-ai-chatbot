import { scenarios } from './scenarios';
import type { MockConversation } from './types';

const defaultParticipants = ['mock-user-1', 'mock-user-2', 'mock-user-3'];
const mockNames = [
  'Alex Mock',
  'Jordan Test',
  'Taylor Example',
  'Casey Sample',
  'Sam Placeholder',
  'Riley Demo',
  'Morgan Preview',
  'Quinn Scenario',
  'Avery Pattern',
  'Jamie Template'
];

const mockTags = ['intake', 'follow-up', 'priority', 'billing', 'consult', 'vip'];

function makeDate(offsetMinutes: number): string {
  return new Date(Date.now() - offsetMinutes * 60 * 1000).toISOString();
}

export function createMockConversation(options: {
  index?: number;
  practiceId: string;
  status?: 'active' | 'archived' | 'closed';
  assignedTo?: string | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  tags?: string[];
}): MockConversation {
  const {
    index = 0,
    practiceId,
    status = 'active',
    assignedTo = null,
    priority = 'normal',
    tags = []
  } = options;
  const name = mockNames[index % mockNames.length];
  const emailSlug = name.toLowerCase().replace(/\s+/g, '.');
  const baseId = `${Date.now()}-${index}`;

  const createdAt = makeDate((index + 1) * 60);
  const lastMessageAt = makeDate((index + 1) * 15);
  const firstResponseAt = status === 'active' ? makeDate((index + 1) * 50) : createdAt;
  const closedAt = status === 'closed' ? makeDate((index + 1) * 5) : null;

  return {
    id: `mock-conversation-${baseId}`,
    practice_id: practiceId,
    user_id: `user-${index + 1}`,
    matter_id: null,
    participants: defaultParticipants,
    user_info: {
      name: `${name}`,
      email: `${emailSlug}@mock-law.test`,
      phone: '+1 (555) 000-0000'
    },
    status,
    assigned_to: assignedTo,
    priority,
    tags,
    internal_notes: status === 'archived' ? 'Archived after resolution' : null,
    last_message_at: lastMessageAt,
    first_response_at: firstResponseAt,
    closed_at: closedAt,
    created_at: createdAt,
    updated_at: lastMessageAt
  };
}

function scenarioConfig(scenarioId: string) {
  const fallback = scenarios.find((scenario) => scenario.id === 'multiple-active') ?? scenarios[0];
  return scenarios.find((scenario) => scenario.id === scenarioId) ?? fallback;
}

export function generateMockConversations(scenario: string, practiceId: string): MockConversation[] {
  const config = scenarioConfig(scenario);

  switch (config.id) {
    case 'empty-inbox':
      return [];
    case 'single-conversation':
      return [
        createMockConversation({
          index: 0,
          practiceId,
          assignedTo: 'mock-user-1',
          priority: 'normal',
          tags: ['welcome', 'single']
        })
      ];
    case 'multiple-active':
      return Array.from({ length: config.conversationCount }, (_, i) =>
        createMockConversation({
          index: i,
          practiceId,
          assignedTo: i % 2 === 0 ? 'mock-user-1' : null,
          priority: i % 3 === 0 ? 'high' : 'normal',
          tags: i % 2 === 0 ? ['intake', 'priority'] : ['follow-up']
        })
      );
    case 'mixed-status':
      return Array.from({ length: config.conversationCount }, (_, i) => {
        const status: MockConversation['status'] = i % 3 === 0 ? 'archived' : i % 4 === 0 ? 'closed' : 'active';
        return createMockConversation({
          index: i,
          practiceId,
          status,
          assignedTo: status === 'active' && i % 2 === 0 ? 'mock-user-2' : null,
          priority: status === 'archived' ? 'low' : i % 2 === 0 ? 'high' : 'normal',
          tags: status === 'closed' ? ['closed'] : ['intake']
        });
      });
    case 'assigned-unassigned':
      return Array.from({ length: config.conversationCount }, (_, i) =>
        createMockConversation({
          index: i,
          practiceId,
          assignedTo: i % 2 === 0 ? null : 'mock-user-1',
          priority: i % 3 === 0 ? 'high' : 'normal',
          tags: []
        })
      );
    case 'high-priority':
      return Array.from({ length: config.conversationCount }, (_, i) =>
        createMockConversation({
          index: i,
          practiceId,
          priority: i % 2 === 0 ? 'urgent' : 'high',
          assignedTo: i % 2 === 0 ? 'mock-user-2' : null,
          tags: ['vip', 'priority']
        })
      );
    case 'with-tags':
      return Array.from({ length: config.conversationCount }, (_, i) =>
        createMockConversation({
          index: i,
          practiceId,
          priority: i % 2 === 0 ? 'high' : 'normal',
          assignedTo: 'mock-user-1',
          tags: mockTags.filter((_, idx) => idx % (i + 2) === 0)
        })
      );
    case 'many-conversations':
      return Array.from({ length: config.conversationCount }, (_, i) => {
        const status: MockConversation['status'] = i % 5 === 0 ? 'archived' : i % 7 === 0 ? 'closed' : 'active';
        const priority: MockConversation['priority'] = i % 6 === 0 ? 'urgent' : i % 4 === 0 ? 'high' : 'normal';
        return createMockConversation({
          index: i,
          practiceId,
          status,
          assignedTo: i % 3 === 0 ? null : 'mock-user-3',
          priority,
          tags: mockTags.filter((_, idx) => idx % 2 === i % 2)
        });
      });
    default:
      return Array.from({ length: config.conversationCount }, (_, i) =>
        createMockConversation({ index: i, practiceId })
      );
  }
}
