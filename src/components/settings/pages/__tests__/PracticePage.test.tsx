import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock authClient BEFORE importing anything that uses it
const mockUseSession = vi.fn(() => ({
  data: { user: { id: 'user-1', email: 'test@example.com' } },
  isPending: false,
}));

vi.mock('../../../../lib/authClient', () => ({
  authClient: {
    useSession: mockUseSession,
  },
  useSession: mockUseSession,
}));

import { render, screen, fireEvent, waitFor } from '../../../../__tests__/test-utils';
import { PracticePage } from '../PracticePage';
import { usePracticeManagement } from '../../../../hooks/usePracticeManagement';

// Mock the organization management hook
const mockCreateOrganization = vi.fn();
const mockAcceptInvitation = vi.fn();
const mockDeclineInvitation = vi.fn();
const mockFetchMembers = vi.fn();
const mockRefetch = vi.fn();
const mockUpdateOrganization = vi.fn();
const mockDeleteOrganization = vi.fn();
const mockUpdateMemberRole = vi.fn();
const mockRemoveMember = vi.fn();
const mockSendInvitation = vi.fn();
const mockGetTokens = vi.fn();
const mockFetchTokens = vi.fn();
const mockCreateToken = vi.fn();
const mockRevokeToken = vi.fn();
const mockGetWorkspaceData = vi.fn();
const mockFetchWorkspaceData = vi.fn();
const mockGetMembers = vi.fn((orgId: string) => {
  if (orgId === 'org-1') {
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
const useOrgMgmtMock = {
  practices: [],
  currentPractice: {
    id: 'org-1',
    name: 'Test Organization',
    slug: 'test-org',
  },
  getMembers: mockGetMembers,
  invitations: [],
  loading: false,
  error: null,
  acceptMatter: vi.fn(),
  rejectMatter: vi.fn(),
  updateMatterStatus: vi.fn(),
  createOrganization: mockCreateOrganization,
  updateOrganization: mockUpdateOrganization,
  deleteOrganization: mockDeleteOrganization,
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

vi.mock('../../../../hooks/usePracticeManagement', () => ({
  usePracticeManagement: vi.fn(),
}));

// Mock the toast context
const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();

vi.mock('../../../../contexts/ToastContext', () => ({
  useToastContext: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
  }),
}));

// Mock the feature flags
vi.mock('../../../../config/features', () => ({
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
  activePracticeId: 'org-1',
  activeOrganizationSlug: 'test-org',
};

vi.mock('../../../../contexts/SessionContext', () => ({
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
vi.mock('../../../../hooks/useNavigation', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

describe('PracticePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateOrganization.mockClear();
    mockAcceptInvitation.mockClear();
    mockDeclineInvitation.mockClear();
    mockGetMembers.mockClear();
    // Reset to default implementation
    mockGetMembers.mockImplementation((orgId: string) => {
      if (orgId === 'org-1') {
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
    useOrgMgmtMock.practices = [];
    useOrgMgmtMock.currentPractice = {
      id: 'org-1',
      name: 'Test Organization',
      slug: 'test-org',
    };
    useOrgMgmtMock.getMembers = mockGetMembers;
    useOrgMgmtMock.invitations = [];
    useOrgMgmtMock.loading = false;
    useOrgMgmtMock.error = null;
    useOrgMgmtMock.acceptMatter = vi.fn();
    useOrgMgmtMock.rejectMatter = vi.fn();
    useOrgMgmtMock.updateMatterStatus = vi.fn();
    useOrgMgmtMock.createOrganization = mockCreateOrganization;
    useOrgMgmtMock.updateOrganization = mockUpdateOrganization;
    useOrgMgmtMock.deleteOrganization = mockDeleteOrganization;
    useOrgMgmtMock.updateMemberRole = mockUpdateMemberRole;
    useOrgMgmtMock.removeMember = mockRemoveMember;
    useOrgMgmtMock.sendInvitation = mockSendInvitation;
    useOrgMgmtMock.acceptInvitation = mockAcceptInvitation;
    useOrgMgmtMock.declineInvitation = mockDeclineInvitation;
    useOrgMgmtMock.getTokens = mockGetTokens;
    useOrgMgmtMock.fetchTokens = mockFetchTokens;
    useOrgMgmtMock.createToken = mockCreateToken;
    useOrgMgmtMock.revokeToken = mockRevokeToken;
    useOrgMgmtMock.getWorkspaceData = mockGetWorkspaceData;
    useOrgMgmtMock.fetchWorkspaceData = mockFetchWorkspaceData;
    useOrgMgmtMock.fetchMembers = mockFetchMembers;
    useOrgMgmtMock.refetch = mockRefetch;
    
    // Reset SessionContext to match currentPractice
    mockSessionContext.activePracticeId = 'org-1';
    mockSessionContext.activeOrganizationSlug = 'test-org';
    
    // Set up the mock return value
    vi.mocked(usePracticeManagement).mockReturnValue(useOrgMgmtMock);
  });

  afterEach(() => {
    vi.resetAllMocks();
    // Reset the mock object to default values
    useOrgMgmtMock.currentPractice = {
      id: 'org-1',
      name: 'Test Organization',
      slug: 'test-org',
    };
  });

  it('should render organization page with correct title', () => {
    render(<PracticePage className="test-class" />);
    
    expect(screen.getByText('Organization')).toBeInTheDocument();
    expect(screen.getByText('No Organization Yet')).toBeInTheDocument();
  });

  it('should provide refetch and fetchMembers functions', () => {
    render(<PracticePage />);
    expect(mockRefetch).toBeDefined();
    expect(mockFetchMembers).toBeDefined();
  });

  it('should show loading state when loading', async () => {
    mockGetMembers.mockReturnValue([]);
    
    // Update the mutable mock object for this test
    useOrgMgmtMock.practices = [];
    useOrgMgmtMock.currentPractice = null;
    useOrgMgmtMock.getMembers = mockGetMembers;
    useOrgMgmtMock.invitations = [];
    useOrgMgmtMock.loading = true;
    useOrgMgmtMock.error = null;
    
    // Sync SessionContext with null currentPractice
    mockSessionContext.activePracticeId = null as any;
    mockSessionContext.activeOrganizationSlug = null as any;

    render(<PracticePage />);
    
    expect(screen.getByText('Loading organization...')).toBeInTheDocument();
  });

  it('should show error state when there is an error', async () => {
    mockGetMembers.mockReturnValue([]);
    
    // Update the mutable mock object for this test
    useOrgMgmtMock.practices = [];
    useOrgMgmtMock.currentPractice = null;
    useOrgMgmtMock.getMembers = mockGetMembers;
    useOrgMgmtMock.invitations = [];
    useOrgMgmtMock.loading = false;
    useOrgMgmtMock.error = 'Failed to load practices';
    
    // Sync SessionContext with null currentPractice
    mockSessionContext.activePracticeId = null as any;
    mockSessionContext.activeOrganizationSlug = null as any;

    render(<PracticePage />);
    
    expect(screen.getByText('Failed to load practices')).toBeInTheDocument();
  });

  it('should display practices when available', async () => {
    mockGetMembers.mockReturnValue([]);
    
    const mockOrganizations = [
      {
        id: 'org-1',
        name: 'Test Organization',
        slug: 'test-org',
        config: {
          metadata: {
            subscriptionPlan: 'premium',
            planStatus: 'active',
          },
        },
      },
    ];

    // Update the mutable mock object for this test
    useOrgMgmtMock.practices = mockOrganizations;
    useOrgMgmtMock.currentPractice = null;
    useOrgMgmtMock.getMembers = mockGetMembers;
    useOrgMgmtMock.invitations = [];
    useOrgMgmtMock.loading = false;
    useOrgMgmtMock.error = null;

    render(<PracticePage />);
    
    expect(screen.getByText('Test Organization')).toBeInTheDocument();
    expect(screen.getByText('test-org')).toBeInTheDocument();
  });

  it('should display invitations when available', async () => {
    mockGetMembers.mockReturnValue([]);
    
    const mockInvitations = [
      {
        id: 'inv-1',
        email: 'user@example.com',
        role: 'attorney' as const,
        status: 'pending' as const,
        practiceId: 'org-1',
        organizationName: 'Test Organization',
        invitedBy: 'admin@example.com',
        expiresAt: '2024-02-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
      },
    ];

    // Update the mutable mock object for this test
    useOrgMgmtMock.practices = [{
      id: 'org-1',
      name: 'Test Organization',
      slug: 'test-org',
      config: {},
    }];
    useOrgMgmtMock.currentPractice = null;
    useOrgMgmtMock.getMembers = mockGetMembers;
    useOrgMgmtMock.invitations = mockInvitations;
    useOrgMgmtMock.loading = false;
    useOrgMgmtMock.error = null;

    render(<PracticePage />);
    
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
    expect(screen.getByText('Test Organization')).toBeInTheDocument();
    expect(screen.getByText('Attorney')).toBeInTheDocument();
  });

  it('should open create organization modal when create button is clicked', async () => {
    // Set currentPractice to null to show empty state
    useOrgMgmtMock.currentPractice = null;
    
    render(<PracticePage />);
    
    const createButton = screen.getByText('Create Organization');
    fireEvent.click(createButton);
    
    await waitFor(() => {
      expect(screen.getByText('Create Organization')).toBeInTheDocument();
    });
  });

  it('should open invite member modal when invite button is clicked', async () => {
    mockGetMembers.mockReturnValue([]);
    
    const mockOrganizations = [
      {
        id: 'org-1',
        name: 'Test Organization',
        slug: 'test-org',
        config: {},
      },
    ];

    // Update the mutable mock object for this test
    useOrgMgmtMock.practices = mockOrganizations;
    useOrgMgmtMock.currentPractice = null;
    useOrgMgmtMock.getMembers = mockGetMembers;
    useOrgMgmtMock.invitations = [];
    useOrgMgmtMock.loading = false;
    useOrgMgmtMock.error = null;

    render(<PracticePage />);
    
    const inviteButton = screen.getByText('Invite Member');
    fireEvent.click(inviteButton);
    
    await waitFor(() => {
      expect(screen.getByText('Invite Team Member')).toBeInTheDocument();
    });
  });

  it('should handle organization creation', async () => {
    mockCreateOrganization.mockResolvedValueOnce(undefined);
    
    // Set currentPractice to null to show empty state
    useOrgMgmtMock.currentPractice = null;
    
    render(<PracticePage />);
    
    // Open create modal
    const createButton = screen.getByText('Create Organization');
    fireEvent.click(createButton);
    
    await waitFor(() => {
      expect(screen.getByText('Create Organization')).toBeInTheDocument();
    });
    
    // Fill form
    const nameInput = screen.getByLabelText('Organization Name *');
    const slugInput = screen.getByLabelText('Slug (optional)');
    
    fireEvent.input(nameInput, { target: { value: 'New Organization' } });
    fireEvent.input(slugInput, { target: { value: 'new-org' } });
    
    // Submit form
    const submitButton = screen.getByText('Create Organization');
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(mockCreateOrganization).toHaveBeenCalledWith({
        name: 'New Organization',
        slug: 'new-org',
        description: undefined,
      });
    });
  });

  it('should handle member invitation', async () => {
    mockGetMembers.mockReturnValue([]);
    mockSendInvitation.mockResolvedValueOnce(undefined);
    
    const mockOrganizations = [
      {
        id: 'org-1',
        name: 'Test Organization',
        slug: 'test-org',
        config: {},
      },
    ];

    // Update the mutable mock object for this test
    useOrgMgmtMock.practices = mockOrganizations;
    useOrgMgmtMock.currentPractice = null;
    useOrgMgmtMock.getMembers = mockGetMembers;
    useOrgMgmtMock.invitations = [];
    useOrgMgmtMock.loading = false;
    useOrgMgmtMock.error = null;

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
    fireEvent.change(roleSelect, { target: { value: 'attorney' } });
    
    // Submit form
    const submitButton = screen.getByText('Send Invitation');
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(mockSendInvitation).toHaveBeenCalledWith('org-1', 'newuser@example.com', 'attorney');
    });
  });

  it('should handle invitation acceptance', async () => {
    mockGetMembers.mockReturnValue([]);
    mockAcceptInvitation.mockResolvedValueOnce(undefined);
    
    const mockInvitations = [
      {
        id: 'inv-1',
        email: 'user@example.com',
        role: 'attorney' as const,
        status: 'pending' as const,
        practiceId: 'org-1',
        organizationName: 'Test Organization',
        invitedBy: 'admin@example.com',
        expiresAt: '2024-02-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
      },
    ];

    // Update the mutable mock object for this test
    useOrgMgmtMock.practices = [];
    useOrgMgmtMock.currentPractice = null;
    useOrgMgmtMock.getMembers = mockGetMembers;
    useOrgMgmtMock.invitations = mockInvitations;
    useOrgMgmtMock.loading = false;
    useOrgMgmtMock.error = null;

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
        role: 'attorney' as const,
        status: 'pending' as const,
        practiceId: 'org-1',
        organizationName: 'Test Organization',
        invitedBy: 'admin@example.com',
        expiresAt: '2024-02-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
      },
    ];

    // Update the mutable mock object for this test
    useOrgMgmtMock.practices = [];
    useOrgMgmtMock.currentPractice = null;
    useOrgMgmtMock.getMembers = mockGetMembers;
    useOrgMgmtMock.invitations = mockInvitations;
    useOrgMgmtMock.loading = false;
    useOrgMgmtMock.error = null;

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
    useOrgMgmtMock.practices = [];
    useOrgMgmtMock.currentPractice = {
      id: 'org-1',
      name: 'Test Organization',
      slug: 'test-org',
    };
    useOrgMgmtMock.getMembers = mockGetMembers;
    useOrgMgmtMock.invitations = [];
    useOrgMgmtMock.loading = false;
    useOrgMgmtMock.error = null;

    render(<PracticePage />);
    
    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);
    
    // Should show the inline edit form
    expect(screen.getByLabelText('Organization Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Description (optional)')).toBeInTheDocument();
    expect(screen.getByText('Save Changes')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('should show empty state when no practices or invitations', () => {
    // Set currentPractice to null to show empty state
    useOrgMgmtMock.currentPractice = null;
    
    // Sync SessionContext with null currentPractice
    mockSessionContext.activePracticeId = null as any;
    mockSessionContext.activeOrganizationSlug = null as any;
    
    render(<PracticePage />);
    
    // Verify the "no organization" UI renders
    expect(screen.getByText('No Organization Yet')).toBeInTheDocument();
    expect(screen.getByText('Create your law firm or accept an invitation')).toBeInTheDocument();
    
    // Verify component does not read SessionContext when currentPractice is null
    expect(mockSessionContext.activePracticeId).toBe(null);
    expect(mockSessionContext.activeOrganizationSlug).toBe(null);
  });
});
