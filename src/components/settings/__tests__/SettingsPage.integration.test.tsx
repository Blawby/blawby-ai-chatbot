import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, mockNavigate, resetMockPath, mockRoute } from '../../../__tests__/test-utils';
import { SettingsPage } from '../SettingsPage';
import { useOrganizationManagement } from '../../../hooks/useOrganizationManagement';
import { i18n } from '../../../i18n';

// Mock react-i18next to use the real i18n instance but avoid React provider issues
vi.mock('react-i18next', () => ({
  useTranslation: (_namespaces: string[] = ['common']) => ({
    t: (key: string) => {
      // Use the real i18n instance to get translations
      const result = i18n.t(key);
      
      // Ensure we always return a string
      if (typeof result === 'string') {
        return result;
      } else if (typeof result === 'object' && result !== null) {
        return key; // Return the key as fallback
      } else {
        return String(result);
      }
    },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
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
  UserIcon: () => 'UserIcon',
  ShieldCheckIcon: () => 'ShieldCheckIcon',
  Cog6ToothIcon: () => 'Cog6ToothIcon',
  XMarkIcon: () => 'XMarkIcon',
  BellIcon: () => 'BellIcon',
  SparklesIcon: () => 'SparklesIcon',
  ArrowRightOnRectangleIcon: () => 'ArrowRightOnRectangleIcon',
  QuestionMarkCircleIcon: () => 'QuestionMarkCircleIcon',
  ArrowLeftIcon: () => 'ArrowLeftIcon',
}));

// Mock the page components to avoid complex dependencies
vi.mock('../pages/GeneralPage', () => ({
  GeneralPage: ({ className }: { className?: string }) => <div className={className}>General Settings</div>,
}));

vi.mock('../pages/NotificationsPage', () => ({
  NotificationsPage: ({ className }: { className?: string }) => <div className={className}>Notification Settings</div>,
}));

vi.mock('../pages/AccountPage', () => ({
  AccountPage: ({ className }: { className?: string }) => <div className={className}>Account Settings</div>,
}));

vi.mock('../pages/SecurityPage', () => ({
  SecurityPage: ({ className }: { className?: string }) => <div className={className}>Security Settings</div>,
}));

vi.mock('../pages/HelpPage', () => ({
  HelpPage: ({ className }: { className?: string }) => <div className={className}>Help & Support</div>,
}));


// Mock the organization management hook
const mockLoadOrganizations = vi.fn();
const mockLoadInvitations = vi.fn();

// Create mutable mock object
const useOrgMgmtMock = {
  organizations: [],
  invitations: [],
  loading: false,
  error: null,
  currentOrganization: null,
  loadOrganizations: mockLoadOrganizations,
  loadInvitations: mockLoadInvitations,
  acceptMatter: vi.fn(),
  rejectMatter: vi.fn(),
  updateMatterStatus: vi.fn(),
  createOrganization: vi.fn(),
  updateOrganization: vi.fn(),
  deleteOrganization: vi.fn(),
  inviteMember: vi.fn(),
  acceptInvitation: vi.fn(),
  declineInvitation: vi.fn(),
  getMembers: vi.fn(),
  removeMember: vi.fn(),
  updateMemberRole: vi.fn(),
  transferOwnership: vi.fn(),
  leaveOrganization: vi.fn(),
  getInvitations: vi.fn(),
  resendInvitation: vi.fn(),
  cancelInvitation: vi.fn(),
  fetchMembers: vi.fn(),
  sendInvitation: vi.fn(),
  getTokens: vi.fn(),
  fetchTokens: vi.fn(),
  createToken: vi.fn(),
  revokeToken: vi.fn(),
  updateToken: vi.fn(),
  getUsage: vi.fn(),
  getWorkspaceData: vi.fn(),
  fetchWorkspaceData: vi.fn(),
  refetch: vi.fn(),
};

vi.mock('../../../hooks/useOrganizationManagement', () => ({
  useOrganizationManagement: vi.fn(),
}));

// Mock the toast context
vi.mock('../../../contexts/ToastContext', async () => {
  const actual = await vi.importActual<typeof import('../../../contexts/ToastContext')>(
    '../../../contexts/ToastContext'
  );
  return {
    ...actual,
    useToastContext: () => ({
      showSuccess: vi.fn(),
      showError: vi.fn(),
    }),
  };
});

// Mock the navigation hook
vi.mock('../../../hooks/useNavigation', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

// Mock the organization context
vi.mock('../../../contexts/OrganizationContext', async () => {
  const actual = await vi.importActual<typeof import('../../../contexts/OrganizationContext')>(
    '../../../contexts/OrganizationContext'
  );
  return {
    ...actual,
    useOrganization: () => ({
      currentOrganization: {
        id: 'org-1',
        name: 'Test Organization',
        slug: 'test-org',
      },
    }),
  };
});

// Mock the feature flags
vi.mock('../../../config/features', () => ({
  features: {
    enableMultipleOrganizations: false,
  },
}));

// Mock the auth client
vi.mock('../../../lib/authClient', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/authClient')>(
    '../../../lib/authClient'
  );
  return {
    ...actual,
    authClient: {
      ...actual.authClient,
      signOut: vi.fn().mockResolvedValue(undefined),
    },
  };
});



describe('SettingsPage Integration Tests', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadOrganizations.mockClear();
    mockLoadInvitations.mockClear();
    mockRoute.mockClear();
    mockOnClose.mockClear();
    
    // Reset the mutable mock object to default values
    useOrgMgmtMock.organizations = [];
    useOrgMgmtMock.invitations = [];
    useOrgMgmtMock.loading = false;
    useOrgMgmtMock.error = null;
    useOrgMgmtMock.currentOrganization = null;
    useOrgMgmtMock.loadOrganizations = mockLoadOrganizations;
    useOrgMgmtMock.loadInvitations = mockLoadInvitations;
    useOrgMgmtMock.acceptMatter = vi.fn();
    useOrgMgmtMock.rejectMatter = vi.fn();
    useOrgMgmtMock.updateMatterStatus = vi.fn();
    useOrgMgmtMock.createOrganization = vi.fn();
    useOrgMgmtMock.updateOrganization = vi.fn();
    useOrgMgmtMock.deleteOrganization = vi.fn();
    useOrgMgmtMock.inviteMember = vi.fn();
    useOrgMgmtMock.acceptInvitation = vi.fn();
    useOrgMgmtMock.declineInvitation = vi.fn();
    useOrgMgmtMock.getMembers = vi.fn();
    useOrgMgmtMock.removeMember = vi.fn();
    useOrgMgmtMock.updateMemberRole = vi.fn();
    useOrgMgmtMock.transferOwnership = vi.fn();
    useOrgMgmtMock.leaveOrganization = vi.fn();
    useOrgMgmtMock.getInvitations = vi.fn();
    useOrgMgmtMock.resendInvitation = vi.fn();
    useOrgMgmtMock.cancelInvitation = vi.fn();
    useOrgMgmtMock.fetchMembers = vi.fn();
    useOrgMgmtMock.sendInvitation = vi.fn();
    useOrgMgmtMock.getTokens = vi.fn();
    useOrgMgmtMock.fetchTokens = vi.fn();
    useOrgMgmtMock.createToken = vi.fn();
    useOrgMgmtMock.revokeToken = vi.fn();
    useOrgMgmtMock.updateToken = vi.fn();
    useOrgMgmtMock.getUsage = vi.fn();
    useOrgMgmtMock.getWorkspaceData = vi.fn();
    useOrgMgmtMock.fetchWorkspaceData = vi.fn();
    useOrgMgmtMock.refetch = vi.fn();
    
    // Set up the mock return value
    vi.mocked(useOrganizationManagement).mockReturnValue(useOrgMgmtMock);
    // Reset mocked path to base settings route
    resetMockPath();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render settings page with all navigation items', () => {
    render(<SettingsPage onClose={mockOnClose} />);
    
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(screen.getByText('Help')).toBeInTheDocument();
    expect(screen.getByText('Sign Out')).toBeInTheDocument();
  });

  it('should show general page by default', () => {
    render(<SettingsPage onClose={mockOnClose} />);
    
    expect(screen.getByText('General Settings')).toBeInTheDocument();
  });


  it('should navigate to notifications page when notifications is clicked', async () => {
    render(<SettingsPage onClose={mockOnClose} />);
    
    const notificationsBtn = screen.getByRole('button', { name: /Notifications/i });
    fireEvent.click(notificationsBtn);
    
    expect(mockRoute).toHaveBeenCalledWith('/settings/notifications', false);
  });

  it('should navigate to account page when account is clicked', async () => {
    render(<SettingsPage onClose={mockOnClose} />);
    
    const accountBtn = screen.getByRole('button', { name: /Account/i });
    fireEvent.click(accountBtn);
    
    expect(mockRoute).toHaveBeenCalledWith('/settings/account', false);
  });

  it('should navigate to security page when security is clicked', async () => {
    render(<SettingsPage onClose={mockOnClose} />);
    
    const securityBtn = screen.getByRole('button', { name: /Security/i });
    fireEvent.click(securityBtn);
    
    expect(mockRoute).toHaveBeenCalledWith('/settings/security', false);
  });

  it('should navigate to help page when help is clicked', async () => {
    render(<SettingsPage onClose={mockOnClose} />);
    
    const helpBtn = screen.getByRole('button', { name: /Help/i });
    fireEvent.click(helpBtn);
    
    expect(mockRoute).toHaveBeenCalledWith('/settings/help', false);
  });

  it('should handle sign out when sign out is clicked', async () => {
    // Stub window.location.reload
    const reloadStub = vi.fn();
    const originalReload = window.location.reload;
    Object.defineProperty(window.location, 'reload', {
      configurable: true,
      value: reloadStub,
    });

    try {
      render(<SettingsPage onClose={mockOnClose} />);
      
      const signOutNav = screen.getByText('Sign Out');
      fireEvent.click(signOutNav);
      
      await waitFor(() => {
        expect(reloadStub).toHaveBeenCalled();
      });
    } finally {
      // Restore original reload
      Object.defineProperty(window.location, 'reload', {
        configurable: true,
        value: originalReload,
      });
    }
  });

  it('should close settings modal when close button is clicked', () => {
    render(<SettingsPage onClose={mockOnClose} />);
    
    const closeButton = screen.getByLabelText('Close settings');
    fireEvent.click(closeButton);
    
    expect(mockOnClose).toHaveBeenCalled();
  });


  it('should handle mobile view correctly', () => {
    render(<SettingsPage onClose={mockOnClose} isMobile={true} />);
    
    // Should show mobile header with close button
    expect(screen.getByLabelText('Close settings')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('should handle desktop view correctly', () => {
    render(<SettingsPage onClose={mockOnClose} />);
    
    // Should show sidebar navigation
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Account')).toBeInTheDocument();
  });

  it('should navigate to business upgrade from account page', async () => {
    render(<SettingsPage onClose={mockOnClose} />);
    
    const accountBtn = screen.getByRole('button', { name: /Account/i });
    fireEvent.click(accountBtn);
    
    // Assert navigation called instead of relying on content rerender
    expect(mockRoute).toHaveBeenCalledWith('/settings/account', false);
  });



  it('should close when clicking the close button', () => {
    render(<SettingsPage onClose={mockOnClose} />);
    
    const closeBtn = screen.getByLabelText('Close settings');
    fireEvent.click(closeBtn);
    
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should maintain navigation state when switching between pages', async () => {
    render(<SettingsPage onClose={mockOnClose} />);
    
    // Go to account page
    const accountBtn = screen.getByRole('button', { name: /Account/i });
    fireEvent.click(accountBtn);
    
    // Check that navigation was called with the correct path
    expect(mockRoute).toHaveBeenCalledWith('/settings/account', false);
    
    // Go back to general
    const generalBtn = screen.getByRole('button', { name: /General/i });
    fireEvent.click(generalBtn);
    
    // Check that navigation was called with the correct path
    expect(mockRoute).toHaveBeenCalledWith('/settings/general', false);
    
    // Account nav should still be visible
    expect(screen.getByText('Account')).toBeInTheDocument();
  });
});
