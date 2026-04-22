import { render, screen, waitFor } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMentionCandidates } from '@/shared/hooks/useMentionCandidates';
import { SessionContext, type SessionContextValue } from '@/shared/contexts/SessionContext';

const mocks = vi.hoisted(() => ({
  getParticipantsMock: vi.fn(),
  clearParticipantsMock: vi.fn(),
}));

vi.mock('@/shared/lib/conversationRepository', () => ({
  getParticipants: mocks.getParticipantsMock,
  clearParticipants: mocks.clearParticipantsMock,
}));

function Harness({ practiceId, conversationId }: { practiceId: string | null; conversationId: string | null }) {
  const { mentionCandidates } = useMentionCandidates(practiceId, conversationId);
  return <pre data-testid="output">{JSON.stringify(mentionCandidates)}</pre>;
}

const createSessionContext = (overrides: Partial<SessionContextValue> = {}): SessionContextValue => ({
  session: {
    user: { id: 'user-1', isAnonymous: false } as never,
    session: { id: 'session-1' } as never,
  } as never,
  isPending: false,
  error: null,
  isAnonymous: false,
  stripeCustomerId: null,
  activePracticeId: 'practice-1',
  activeMemberRole: null,
  activeMemberRoleLoading: false,
  ...overrides,
});

const renderHarness = (contextValue: SessionContextValue, props: { practiceId: string | null; conversationId: string | null }) => (
  render(
    <SessionContext.Provider value={contextValue}>
      <Harness {...props} />
    </SessionContext.Provider>
  )
);
describe('useMentionCandidates', () => {
  beforeEach(() => {
    mocks.getParticipantsMock.mockReset();
    mocks.clearParticipantsMock.mockReset();
  });

  it('shows only team-member-allowed targets for a team sender', async () => {
    mocks.getParticipantsMock.mockResolvedValue([
      { userId: 'team-1', name: 'Team Member', image: null, role: 'attorney', isTeamMember: true, canBeMentionedByTeamMember: true, canBeMentionedByClient: true },
      { userId: 'blocked-1', name: 'Blocked Client', image: null, role: null, isTeamMember: false, canBeMentionedByTeamMember: false, canBeMentionedByClient: true },
    ]);

    renderHarness(createSessionContext({ activeMemberRole: 'attorney' }), {
      practiceId: 'practice-1',
      conversationId: 'conversation-1',
    });

    await waitFor(() => {
      expect(screen.getByTestId('output').textContent).toBe(JSON.stringify([
        { userId: 'team-1', name: 'Team Member', image: null },
      ]));
    });
  });

  it('shows only client-allowed targets for a client sender', async () => {
    mocks.getParticipantsMock.mockResolvedValue([
      { userId: 'team-1', name: 'Team Member', image: null, role: 'attorney', isTeamMember: true, canBeMentionedByTeamMember: true, canBeMentionedByClient: true },
      { userId: 'blocked-1', name: 'Blocked Client', image: null, role: null, isTeamMember: false, canBeMentionedByTeamMember: true, canBeMentionedByClient: false },
    ]);

    renderHarness(createSessionContext({ activeMemberRole: null }), {
      practiceId: 'practice-1',
      conversationId: 'conversation-1',
    });

    await waitFor(() => {
      expect(screen.getByTestId('output').textContent).toBe(JSON.stringify([
        { userId: 'team-1', name: 'Team Member', image: null },
      ]));
    });
  });

  it('filters blank names out of suggestions', async () => {
    mocks.getParticipantsMock.mockResolvedValue([
      { userId: 'team-1', name: ' ', image: null, role: 'attorney', isTeamMember: true, canBeMentionedByTeamMember: true, canBeMentionedByClient: true },
      { userId: 'team-2', name: null, image: null, role: 'attorney', isTeamMember: true, canBeMentionedByTeamMember: true, canBeMentionedByClient: true },
      { userId: 'team-3', name: 'Valid Name', image: null, role: 'attorney', isTeamMember: true, canBeMentionedByTeamMember: true, canBeMentionedByClient: true },
    ]);

    renderHarness(createSessionContext({ activeMemberRole: 'attorney' }), {
      practiceId: 'practice-1',
      conversationId: 'conversation-1',
    });

    await waitFor(() => {
      expect(screen.getByTestId('output').textContent).toBe(JSON.stringify([
        { userId: 'team-3', name: 'Valid Name', image: null },
      ]));
    });
  });

  it('does not mutate raw participant records', async () => {
    const participants = [
      { userId: 'team-1', name: 'Team Member', image: null, role: 'attorney', isTeamMember: true, canBeMentionedByTeamMember: true, canBeMentionedByClient: true },
    ];
    mocks.getParticipantsMock.mockResolvedValue(participants);

    renderHarness(createSessionContext({ activeMemberRole: 'attorney' }), {
      practiceId: 'practice-1',
      conversationId: 'conversation-1',
    });

    await waitFor(() => {
      expect(screen.getByTestId('output').textContent).toContain('Team Member');
    });

    expect(participants).toEqual([
      { userId: 'team-1', name: 'Team Member', image: null, role: 'attorney', isTeamMember: true, canBeMentionedByTeamMember: true, canBeMentionedByClient: true },
    ]);
  });

  it('clears participant cache when the practice changes', async () => {
    mocks.getParticipantsMock.mockResolvedValue([]);

    const contextValue = createSessionContext({ activeMemberRole: 'attorney' });
    const view = renderHarness(contextValue, {
      practiceId: 'practice-1',
      conversationId: 'conversation-1',
    });

    await waitFor(() => {
      expect(mocks.getParticipantsMock).toHaveBeenCalledWith('practice-1', 'conversation-1');
    });

    view.rerender(
      <SessionContext.Provider value={contextValue}>
        <Harness practiceId="practice-2" conversationId="conversation-1" />
      </SessionContext.Provider>
    );

    await waitFor(() => {
      expect(mocks.clearParticipantsMock).toHaveBeenCalledTimes(1);
    });
  });
});
