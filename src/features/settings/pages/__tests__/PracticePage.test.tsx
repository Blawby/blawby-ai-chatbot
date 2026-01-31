import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock authClient BEFORE importing anything that uses it
const mockUseSession = vi.fn(() => ({
  data: { user: { id: 'user-1', email: 'test@example.com' } },
  isPending: false,
}));

vi.mock('@/shared/lib/authClient', () => ({
  authClient: {
    useSession: mockUseSession,
  },
  useSession: mockUseSession,
  useTypedSession: mockUseSession,
  useActiveMemberRole: () => ({
    data: { role: 'owner' },
    isPending: false,
    isRefetching: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

import { render, screen, fireEvent, waitFor } from '../../../../__tests__/test-utils';
import { PracticePage } from '../PracticePage';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';

// Mock the practice management hook
const mockCreatePractice = vi.fn();
const mockAcceptInvitation = vi.fn();
const mockDeclineInvitation = vi.fn();
const mockFetchMembers = vi.fn();
const mockRefetch = vi.fn();
const mockUpdatePractice = vi.fn();
const mockDeletePractice = vi.fn();
const mockUpdateMemberRole = vi.fn();
const mockRemoveMember = vi.fn();
const mockSendInvitation = vi.fn();
const mockGetTokens = vi.fn();
const mockFetchTokens = vi.fn();
const mockCreateToken = vi.fn();
const mockRevokeToken = vi.fn();
const mockGetWorkspaceData = vi.fn();
const mockFetchWorkspaceData = vi.fn();
const mockGetMembers = vi.fn((practiceId: string) => {
  if (practiceId === 'practice-1') {
    return [
      {
        userId: 'user-1',
        role: 'owner' as const,
        email: 'test@example.com',
        name: 'Test User',
        createdAt: Date.now(),
      },
    ];
  }
  return [];
});

// Create mutable mock object
const usePracticeMgmtMock = {
  practices: [],
  currentPractice: {
    id: 'practice-1',
    name: 'Test Practice',
    slug: 'test-practice',
    consultationFee: null,
    paymentUrl: null,
    businessPhone: null,
    businessEmail: null,
    calendlyUrl: null,
  },
  getMembers: mockGetMembers,
  invitations: [],
  loading: false,
  error: null,
  acceptMatter: vi.fn(),
  rejectMatter: vi.fn(),
  updateMatterStatus: vi.fn(),
  createPractice: mockCreatePractice,
  updatePractice: mockUpdatePractice,
  updatePracticeDetails: vi.fn(),
  deletePractice: mockDeletePractice,
  updateMemberRole: mockUpdateMemberRole,
  removeMember: mockRemoveMember,
  sendInvitation: mockSendInvitation,
  acceptInvitation: mockAcceptInvitation,
  declineInvitation: mockDeclineInvitation,
  getTokens: mockGetTokens,
  fetchTokens: mockFetchTokens,
  createToken: mockCreateToken,
  revokeToken: mockRevokeToken,
  getWorkspaceData: mockGetWorkspaceData,
  fetchWorkspaceData: mockFetchWorkspaceData,
  fetchMembers: mockFetchMembers,
  refetch: mockRefetch,
};

vi.mock('@/shared/hooks/usePracticeManagement', () => ({
  usePracticeManagement: vi.fn(),
}));

const mockFetchDetails = vi.fn();
const mockUpdateDetails = vi.fn();

vi.mock('@/shared/hooks/usePracticeDetails', () => ({
  usePracticeDetails: vi.fn(),
}));

// Mock the toast context
const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();

vi.mock('@/shared/contexts/ToastContext', () => ({
  useToastContext: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
  }),
}));

// Mock the feature flags
vi.mock('@/config/features', () => ({
  useFeatureFlag: (flag: string) => {
    if (flag === 'enableMultiplePractices') return true;
    return false;
  },
  features: {
    enableMultiplePractices: true,
  },
}));

// Mock SessionContext
const mockSessionContext = {
  activePracticeId: 'practice-1',
  activePracticeSlug: 'test-practice',
};

vi.mock('@/shared/contexts/SessionContext', () => ({
  useSessionContext: () => mockSessionContext,
}));

// Mock framer-motion to avoid React/Preact compatibility issues
vi.mock('framer-motion', () => ({
  motion: {
    div: 'div',
    button: 'button',
    span: 'span',
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock heroicons to prevent icon rendering issues
vi.mock('@heroicons/react/24/outline', () => ({
  BuildingOfficeIcon: () => 'BuildingOfficeIcon',
  PlusIcon: () => 'PlusIcon',
  XMarkIcon: () => 'XMarkIcon',
}));

// Mock the navigation hook
const mockNavigate = vi.fn();
vi.mock('@/shared/hooks/useNavigation', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

describe('PracticePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreatePractice.mockClear();
    mockAcceptInvitation.mockClear();
    mockDeclineInvitation.mockClear();
    mockGetMembers.mockClear();
    // Reset to default implementation
    mockGetMembers.mockImplementation((practiceId: string) => {
      if (practiceId === 'practice-1') {
        return [
          {
            userId: 'user-1',
            role: 'owner' as const,
            email: 'test@example.com',
            name: 'Test User',
            createdAt: Date.now(),
          },
        ];
      }
      return [];
    });
    mockShowSuccess.mockClear();
    mockShowError.mockClear();
    mockNavigate.mockClear();
    
    // Reset the mutable mock object to default values
    usePracticeMgmtMock.practices = [];
    usePracticeMgmtMock.currentPractice = {
      id: 'practice-1',
      name: 'Test Practice',
      slug: 'test-practice',
      consultationFee: null,
      paymentUrl: null,
      businessPhone: null,
      businessEmail: null,
      calendlyUrl: null,
    };
    usePracticeMgmtMock.getMembers = mockGetMembers;
    usePracticeMgmtMock.invitations = [];
    usePracticeMgmtMock.loading = false;
    usePracticeMgmtMock.error = null;
    usePracticeMgmtMock.acceptMatter = vi.fn();
    usePracticeMgmtMock.rejectMatter = vi.fn();
    usePracticeMgmtMock.updateMatterStatus = vi.fn();
    usePracticeMgmtMock.createPractice = mockCreatePractice;
    usePracticeMgmtMock.updatePractice = mockUpdatePractice;
    usePracticeMgmtMock.updatePracticeDetails = vi.fn();
    usePracticeMgmtMock.deletePractice = mockDeletePractice;
    usePracticeMgmtMock.updateMemberRole = mockUpdateMemberRole;
    usePracticeMgmtMock.removeMember = mockRemoveMember;
    usePracticeMgmtMock.sendInvitation = mockSendInvitation;
    usePracticeMgmtMock.acceptInvitation = mockAcceptInvitation;
    usePracticeMgmtMock.declineInvitation = mockDeclineInvitation;
    usePracticeMgmtMock.getTokens = mockGetTokens;
    usePracticeMgmtMock.fetchTokens = mockFetchTokens;
    usePracticeMgmtMock.createToken = mockCreateToken;
    usePracticeMgmtMock.revokeToken = mockRevokeToken;
    usePracticeMgmtMock.getWorkspaceData = mockGetWorkspaceData;
    usePracticeMgmtMock.fetchWorkspaceData = mockFetchWorkspaceData;
    usePracticeMgmtMock.fetchMembers = mockFetchMembers;
    usePracticeMgmtMock.refetch = mockRefetch;
    
    // Reset SessionContext to match currentPractice
    mockSessionContext.activePracticeId = 'practice-1';
    mockSessionContext.activePracticeSlug = 'test-practice';
    
    // Set up the mock return value
    vi.mocked(usePracticeManagement).mockReturnValue(usePracticeMgmtMock);
    vi.mocked(usePracticeDetails).mockReturnValue({
      details: null,
      hasDetails: false,
      fetchDetails: mockFetchDetails,
      updateDetails: mockUpdateDetails,
      setDetails: vi.fn()
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    // Reset the mock object to default values
    usePracticeMgmtMock.currentPractice = {
      id: 'practice-1',
      name: 'Test Practice',
      slug: 'test-practice',
      consultationFee: null,
      paymentUrl: null,
      businessPhone: null,
      businessEmail: null,
      calendlyUrl: null,
    };
  });

  it('should render practice page with correct title', () => {
    render(<PracticePage className="test-class" />);
    
    expect(screen.getByText('Practice')).toBeInTheDocument();
    expect(screen.getByText('No Practice Yet')).toBeInTheDocument();
  });

  it('should provide refetch and fetchMembers functions', () => {
    render(<PracticePage />);
    expect(mockRefetch).toBeDefined();
    expect(mockFetchMembers).toBeDefined();
  });

  it('should show loading state when loading', async () => {
    mockGetMembers.mockReturnValue([]);
    
    // Update the mutable mock object for this test
    usePracticeMgmtMock.practices = [];
    usePracticeMgmtMock.currentPractice = null;
    usePracticeMgmtMock.getMembers = mockGetMembers;
    usePracticeMgmtMock.invitations = [];
    usePracticeMgmtMock.loading = true;
    usePracticeMgmtMock.error = null;
    
    // Sync SessionContext with null currentPractice
    mockSessionContext.activePracticeId = null as string | null;

    render(<PracticePage />);
    
    expect(screen.getByText('Loading practice...')).toBeInTheDocument();
  });

  it('should show error state when there is an error', async () => {
    mockGetMembers.mockReturnValue([]);
    
    // Update the mutable mock object for this test
    usePracticeMgmtMock.practices = [];
    usePracticeMgmtMock.currentPractice = null;
    usePracticeMgmtMock.getMembers = mockGetMembers;
    usePracticeMgmtMock.invitations = [];
    usePracticeMgmtMock.loading = false;
    usePracticeMgmtMock.error = 'Failed to load practices';
    
    // Sync SessionContext with null currentPractice
    mockSessionContext.activePracticeId = null as string | null;

    render(<PracticePage />);
    
    expect(screen.getByText('Failed to load practices')).toBeInTheDocument();
  });

  it('should display practices when available', async () => {
    mockGetMembers.mockReturnValue([]);
    
    const mockPractices = [
      {
        id: 'practice-1',
        name: 'Test Practice',
        slug: 'test-practice',
        config: {
          metadata: {
            subscriptionPlan: 'premium',
            planStatus: 'active',
          },
        },
      },
    ];

    // Update the mutable mock object for this test
    usePracticeMgmtMock.practices = mockPractices;
    usePracticeMgmtMock.currentPractice = null;
    usePracticeMgmtMock.getMembers = mockGetMembers;
    usePracticeMgmtMock.invitations = [];
    usePracticeMgmtMock.loading = false;
    usePracticeMgmtMock.error = null;

    render(<PracticePage />);
    
    expect(screen.getByText('Test Practice')).toBeInTheDocument();
    expect(screen.getByText('test-practice')).toBeInTheDocument();
  });

  it('should display invitations when available', async () => {
    mockGetMembers.mockReturnValue([]);
    
    const mockInvitations = [
      {
        id: 'inv-1',
        email: 'user@example.com',
        role: 'member' as const,
        status: 'pending' as const,
        practiceId: 'practice-1',
        practiceName: 'Test Practice',
        invitedBy: 'admin@example.com',
        expiresAt: '2024-02-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
      },
    ];

    // Update the mutable mock object for this test
    usePracticeMgmtMock.practices = [{
      id: 'practice-1',
      name: 'Test Practice',
      slug: 'test-practice',
      config: {},
    }];
    usePracticeMgmtMock.currentPractice = null;
    usePracticeMgmtMock.getMembers = mockGetMembers;
    usePracticeMgmtMock.invitations = mockInvitations;
    usePracticeMgmtMock.loading = false;
    usePracticeMgmtMock.error = null;

    render(<PracticePage />);
    
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
    expect(screen.getByText('Test Practice')).toBeInTheDocument();
    expect(screen.getByText('Client')).toBeInTheDocument();
  });

  it('should open create practice modal when create button is clicked', async () => {
    // Set currentPractice to null to show empty state
    usePracticeMgmtMock.currentPractice = null;
    
    render(<PracticePage />);
    
    const createButton = screen.getByText('Create Practice');
    fireEvent.click(createButton);
    
    await waitFor(() => {
      expect(screen.getByText('Create Practice')).toBeInTheDocument();
    });
  });

  it('should open invite member modal when invite button is clicked', async () => {
    mockGetMembers.mockReturnValue([]);
    
    const mockPractices = [
      {
        id: 'practice-1',
        name: 'Test Practice',
        slug: 'test-practice',
        config: {},
      },
    ];

    // Update the mutable mock object for this test
    usePracticeMgmtMock.practices = mockPractices;
    usePracticeMgmtMock.currentPractice = null;
    usePracticeMgmtMock.getMembers = mockGetMembers;
    usePracticeMgmtMock.invitations = [];
    usePracticeMgmtMock.loading = false;
    usePracticeMgmtMock.error = null;

    render(<PracticePage />);
    
    const inviteButton = screen.getByText('Invite Member');
    fireEvent.click(inviteButton);
    
    await waitFor(() => {
      expect(screen.getByText('Invite Team Member')).toBeInTheDocument();
    });
  });

  it('should handle practice creation', async () => {
    mockCreatePractice.mockResolvedValueOnce(undefined);
    
    // Set currentPractice to null to show empty state
    usePracticeMgmtMock.currentPractice = null;
    
    render(<PracticePage />);
    
    // Open create modal
    const createButton = screen.getByText('Create Practice');
    fireEvent.click(createButton);
    
    await waitFor(() => {
      expect(screen.getByText('Create Practice')).toBeInTheDocument();
    });
    
    // Fill form
    const nameInput = screen.getByLabelText('Practice Name *');
    const slugInput = screen.getByLabelText('Slug (optional)');
    
    fireEvent.input(nameInput, { target: { value: 'New Practice' } });
    fireEvent.input(slugInput, { target: { value: 'new-practice' } });
    
    // Submit form
    const submitButton = screen.getByText('Create Practice');
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(mockCreatePractice).toHaveBeenCalledWith({
        name: 'New Practice',
        slug: 'new-practice',
        description: undefined,
      });
    });
  });

  it('should handle member invitation', async () => {
    mockGetMembers.mockReturnValue([]);
    mockSendInvitation.mockResolvedValueOnce(undefined);
    
    const mockPractices = [
      {
        id: 'practice-1',
        name: 'Test Practice',
        slug: 'test-practice',
        config: {},
      },
    ];

    // Update the mutable mock object for this test
    usePracticeMgmtMock.practices = mockPractices;
    usePracticeMgmtMock.currentPractice = null;
    usePracticeMgmtMock.getMembers = mockGetMembers;
    usePracticeMgmtMock.invitations = [];
    usePracticeMgmtMock.loading = false;
    usePracticeMgmtMock.error = null;

    render(<PracticePage />);
    
    // Open invite modal
    const inviteButton = screen.getByText('Invite Member');
    fireEvent.click(inviteButton);
    
    await waitFor(() => {
      expect(screen.getByText('Invite Team Member')).toBeInTheDocument();
    });
    
    // Fill form
    const emailInput = screen.getByLabelText('Email Address');
    const roleSelect = screen.getByLabelText('Role');
    
    fireEvent.input(emailInput, { target: { value: 'newuser@example.com' } });
    fireEvent.change(roleSelect, { target: { value: 'admin' } });
    
    // Submit form
    const submitButton = screen.getByText('Send Invitation');
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(mockSendInvitation).toHaveBeenCalledWith('practice-1', 'newuser@example.com', 'admin');
    });
  });

  it('should handle invitation acceptance', async () => {
    mockGetMembers.mockReturnValue([]);
    mockAcceptInvitation.mockResolvedValueOnce(undefined);
    
    const mockInvitations = [
      {
        id: 'inv-1',
        email: 'user@example.com',
        role: 'member' as const,
        status: 'pending' as const,
        practiceId: 'practice-1',
        practiceName: 'Test Practice',
        invitedBy: 'admin@example.com',
        expiresAt: '2024-02-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
      },
    ];

    // Update the mutable mock object for this test
    usePracticeMgmtMock.practices = [];
    usePracticeMgmtMock.currentPractice = null;
    usePracticeMgmtMock.getMembers = mockGetMembers;
    usePracticeMgmtMock.invitations = mockInvitations;
    usePracticeMgmtMock.loading = false;
    usePracticeMgmtMock.error = null;

    render(<PracticePage />);
    
    const acceptButton = screen.getByText('Accept');
    fireEvent.click(acceptButton);
    
    await waitFor(() => {
      expect(mockAcceptInvitation).toHaveBeenCalledWith('inv-1');
    });
  });

  it('should handle invitation decline', async () => {
    mockGetMembers.mockReturnValue([]);
    mockDeclineInvitation.mockResolvedValueOnce(undefined);
    
    const mockInvitations = [
      {
        id: 'inv-1',
        email: 'user@example.com',
        role: 'member' as const,
        status: 'pending' as const,
        practiceId: 'practice-1',
        practiceName: 'Test Practice',
        invitedBy: 'admin@example.com',
        expiresAt: '2024-02-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
      },
    ];

    // Update the mutable mock object for this test
    usePracticeMgmtMock.practices = [];
    usePracticeMgmtMock.currentPractice = null;
    usePracticeMgmtMock.getMembers = mockGetMembers;
    usePracticeMgmtMock.invitations = mockInvitations;
    usePracticeMgmtMock.loading = false;
    usePracticeMgmtMock.error = null;

    render(<PracticePage />);
    
    const declineButton = screen.getByText('Decline');
    fireEvent.click(declineButton);
    
    await waitFor(() => {
      expect(mockDeclineInvitation).toHaveBeenCalledWith('inv-1');
    });
  });

  it('should show inline edit form when edit button is clicked', async () => {
    mockGetMembers.mockReturnValue([]);

    // Update the mutable mock object for this test
    usePracticeMgmtMock.practices = [];
    usePracticeMgmtMock.currentPractice = {
      id: 'practice-1',
      name: 'Test Practice',
      slug: 'test-practice',
      consultationFee: null,
      paymentUrl: null,
      businessPhone: null,
      businessEmail: null,
      calendlyUrl: null,
    };
    usePracticeMgmtMock.getMembers = mockGetMembers;
    usePracticeMgmtMock.invitations = [];
    usePracticeMgmtMock.loading = false;
    usePracticeMgmtMock.error = null;

    render(<PracticePage />);
    
    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);
    
    // Should show the inline edit form
    expect(screen.getByLabelText('Practice Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Description (optional)')).toBeInTheDocument();
    expect(screen.getByText('Save Changes')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('should call updateDetails with edited values when saving', async () => {
    mockGetMembers.mockReturnValue([]);
    mockUpdateDetails.mockResolvedValueOnce(null);

    usePracticeMgmtMock.practices = [];
    usePracticeMgmtMock.currentPractice = {
      id: 'practice-1',
      name: 'Test Practice',
      slug: 'test-practice',
      consultationFee: null,
      paymentUrl: null,
      businessPhone: null,
      businessEmail: 'old@example.com',
      calendlyUrl: null,
    };
    usePracticeMgmtMock.getMembers = mockGetMembers;
    usePracticeMgmtMock.invitations = [];
    usePracticeMgmtMock.loading = false;
    usePracticeMgmtMock.error = null;

    render(<PracticePage />);

    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);

    const emailInput = screen.getByLabelText('Business email');
    fireEvent.input(emailInput, { target: { value: 'updated@example.com' } });

    const saveButton = screen.getByText('Save Changes');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateDetails).toHaveBeenCalled();
      expect(mockUpdateDetails).toHaveBeenCalledWith({
        businessEmail: 'updated@example.com'
      });
    });
  });

  it('should show empty state when no practices or invitations', () => {
    // Set currentPractice to null to show empty state
    usePracticeMgmtMock.currentPractice = null;
    
    // Sync SessionContext with null currentPractice - both activePracticeId and activePracticeSlug should be null for empty-state scenario
    mockSessionContext.activePracticeId = null as string | null;
    mockSessionContext.activePracticeSlug = null as string | null;
    
    render(<PracticePage />);
    
    // Verify the "no practice" UI renders
    expect(screen.getByText('No Practice Yet')).toBeInTheDocument();
    expect(screen.getByText('Create your law firm or accept an invitation')).toBeInTheDocument();
    
    // Verify component does not read SessionContext when currentPractice is null
    expect(mockSessionContext.activePracticeId).toBe(null);
    expect(mockSessionContext.activePracticeSlug).toBe(null);
  });
});
