import type { InboxScenario } from './types';

export const scenarios: InboxScenario[] = [
  {
    id: 'empty-inbox',
    name: 'Empty Inbox',
    description: 'No conversations - test empty state',
    conversationCount: 0,
    statuses: [],
    priorities: [],
    hasAssigned: false,
    hasTags: false
  },
  {
    id: 'single-conversation',
    name: 'Single Conversation',
    description: 'One active conversation for focused testing',
    conversationCount: 1,
    statuses: ['active'],
    priorities: ['normal'],
    hasAssigned: true,
    hasTags: true
  },
  {
    id: 'multiple-active',
    name: 'Multiple Active',
    description: '5-10 active conversations to test list layout',
    conversationCount: 8,
    statuses: ['active'],
    priorities: ['normal', 'high'],
    hasAssigned: true,
    hasTags: true
  },
  {
    id: 'mixed-status',
    name: 'Mixed Status',
    description: 'Blend of active, archived, and closed conversations',
    conversationCount: 9,
    statuses: ['active', 'archived', 'closed'],
    priorities: ['low', 'normal', 'high'],
    hasAssigned: true,
    hasTags: true
  },
  {
    id: 'assigned-unassigned',
    name: 'Assigned vs Unassigned',
    description: 'Mix of assigned and unassigned conversations',
    conversationCount: 7,
    statuses: ['active'],
    priorities: ['normal', 'high'],
    hasAssigned: true,
    hasTags: false
  },
  {
    id: 'high-priority',
    name: 'High Priority',
    description: 'High and urgent priority conversations',
    conversationCount: 6,
    statuses: ['active'],
    priorities: ['high', 'urgent'],
    hasAssigned: true,
    hasTags: true
  },
  {
    id: 'with-tags',
    name: 'With Tags',
    description: 'Conversations with various tags applied',
    conversationCount: 6,
    statuses: ['active'],
    priorities: ['normal', 'high'],
    hasAssigned: true,
    hasTags: true
  },
  {
    id: 'many-conversations',
    name: 'Many Conversations',
    description: '20+ conversations for pagination testing',
    conversationCount: 22,
    statuses: ['active', 'archived', 'closed'],
    priorities: ['low', 'normal', 'high', 'urgent'],
    hasAssigned: true,
    hasTags: true
  }
];
