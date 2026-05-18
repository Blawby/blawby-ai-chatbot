import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPracticeMembersMock: vi.fn(),
}));

vi.mock('../../../worker/services/RemoteApiService.js', () => ({
  RemoteApiService: {
    getPracticeMembers: mocks.getPracticeMembersMock,
  },
}));

describe('ConversationParticipantService', () => {
  beforeEach(() => {
    mocks.getPracticeMembersMock.mockReset();
  });

  it('allows a team member to mention another team member', async () => {
    mocks.getPracticeMembersMock.mockResolvedValue([
      { user_id: 'team-1', role: 'attorney', name: 'Attorney One', image: null },
      { user_id: 'team-2', role: 'paralegal', name: 'Paralegal Two', image: null },
    ]);

    const service = await import('../../../worker/services/ConversationParticipantService.js');
    const participants = await service.listConversationParticipantRecords({
      env: {} as never,
      practiceId: 'practice-1',
      conversation: { user_id: 'client-1', is_anonymous: false, participants: ['client-1'], user_info: { name: 'Client One' } },
    });

    expect(service.validateMentionTargets({
      participants,
      senderType: 'team_member',
      mentionedUserIds: ['team-2'],
    })).toEqual(['team-2']);
  });

  it('allows a team member to mention a client in the conversation', async () => {
    mocks.getPracticeMembersMock.mockResolvedValue([
      { user_id: 'team-1', role: 'attorney', name: 'Attorney One', image: null },
    ]);

    const service = await import('../../../worker/services/ConversationParticipantService.js');
    const participants = await service.listConversationParticipantRecords({
      env: {} as never,
      practiceId: 'practice-1',
      conversation: { user_id: 'client-1', is_anonymous: false, participants: ['client-1'], user_info: { name: 'Client One' } },
    });

    expect(service.validateMentionTargets({
      participants,
      senderType: 'team_member',
      mentionedUserIds: ['client-1'],
    })).toEqual(['client-1']);
  });

  it('allows a client to mention a team member', async () => {
    mocks.getPracticeMembersMock.mockResolvedValue([
      { user_id: 'team-1', role: 'attorney', name: 'Attorney One', image: null },
    ]);

    const service = await import('../../../worker/services/ConversationParticipantService.js');
    const participants = await service.listConversationParticipantRecords({
      env: {} as never,
      practiceId: 'practice-1',
      conversation: { user_id: 'client-1', is_anonymous: false, participants: ['client-1'], user_info: { name: 'Client One' } },
    });

    expect(service.validateMentionTargets({
      participants,
      senderType: 'client',
      mentionedUserIds: ['team-1'],
    })).toEqual(['team-1']);
  });

  it('allows a client to mention another client in the same conversation', async () => {
    mocks.getPracticeMembersMock.mockResolvedValue([]);

    const service = await import('../../../worker/services/ConversationParticipantService.js');
    const participants = await service.listConversationParticipantRecords({
      env: {} as never,
      practiceId: 'practice-1',
      conversation: { user_id: 'client-1', is_anonymous: false, participants: ['client-1', 'client-2'], user_info: { name: 'Client One' } },
    });

    expect(service.validateMentionTargets({
      participants,
      senderType: 'client',
      mentionedUserIds: ['client-2'],
    })).toEqual(['client-2']);
  });

  it('rejects anonymous senders', async () => {
    const service = await import('../../../worker/services/ConversationParticipantService.js');

    expect(() => service.validateMentionTargets({
      participants: [],
      senderType: 'anonymous',
      mentionedUserIds: ['team-1'],
    })).toThrow('Anonymous users cannot mention anyone');
  });

  it('rejects unknown targets', async () => {
    const service = await import('../../../worker/services/ConversationParticipantService.js');

    expect(() => service.validateMentionTargets({
      participants: [],
      senderType: 'client',
      mentionedUserIds: ['unknown-1'],
    })).toThrow('Unknown mention target: unknown-1');
  });

  it('rejects anonymous targets unless explicitly supported', async () => {
    const service = await import('../../../worker/services/ConversationParticipantService.js');

    expect(() => service.validateMentionTargets({
      participants: [
        {
          userId: 'anon-1',
          name: null,
          image: null,
          role: null,
          isTeamMember: false,
          canBeMentionedByTeamMember: false,
          canBeMentionedByClient: false,
        },
      ],
      senderType: 'team_member',
      mentionedUserIds: ['anon-1'],
    })).toThrow('Mention target is not allowed: anon-1');
  });
});
