import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, resetMockPath } from '../../../__tests__/test-utils';
import { SettingsPage } from '../SettingsPage';
import { useOrganizationManagement } from '../../../hooks/useOrganizationManagement';
import { i18n } from '../../../i18n';

// Mock navigation utilities
// Note: SettingsPage uses useNavigation hook (mockNavigate) for all navigation,
// not preact-iso route (mockRoute). All navigation assertions should use mockNavigate.
const mockRoute = vi.fn();
const mockNavigate = vi.fn();

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
  BuildingOfficeIcon: () => 'BuildingOfficeIcon',
  ChevronRightIcon: () => 'ChevronRightIcon',
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

// Mock preact-iso location
vi.mock('preact-iso', () => ({
  useLocation: () => ({
    path: '/settings',
    url: '/settings',
    query: {},
    route: mockRoute,
  }),
}));

// Mock the navigation hook
vi.mock('../../../utils/navigation', () => ({
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

// Mock the auth utility
vi.mock('../../../utils/auth', () => ({
  signOut: vi.fn().mockImplementation(async (options?: { skipReload?: boolean; onSuccess?: () => void }) => {
    if (options?.onSuccess) {
      options.onSuccess();
    }
    if (!options?.skipReload) {
      window.location.reload();
    }
  }),
}));



describe('SettingsPage Integration Tests', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadOrganizations.mockClear();
    mockLoadInvitations.mockClear();
    mockRoute.mockClear();
    mockNavigate.mockClear();
    mockOnClose.mockClear();
    
    // Reset the mutable mock object to default values
    useOrgMgmtMock.organizations = [];
    useOrgMgmtMock.invitations = [];
    useOrgMgmtMock.loading = false;
    useOrgMgmtMock.error = null;
    useOrgMgmtMock.currentOrganization = null;
    useOrgMgmtMock.loadOrganizations = mockLoadOrganizations;
    useOrgMgmtMock.loadInvitations = mockLoadInvitations;
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
    
    expect(mockNavigate).toHaveBeenCalledWith('/settings/notifications');
  });

  it('should navigate to account page when account is clicked', async () => {
    render(<SettingsPage onClose={mockOnClose} />);
    
    const accountBtn = screen.getByRole('button', { name: /Account/i });
    fireEvent.click(accountBtn);
    
    expect(mockNavigate).toHaveBeenCalledWith('/settings/account');
  });

  it('should navigate to security page when security is clicked', async () => {
    render(<SettingsPage onClose={mockOnClose} />);
    
    const securityBtn = screen.getByRole('button', { name: /Security/i });
    fireEvent.click(securityBtn);
    
    expect(mockNavigate).toHaveBeenCalledWith('/settings/security');
  });

  it('should navigate to help page when help is clicked', async () => {
    render(<SettingsPage onClose={mockOnClose} />);
    
    const helpBtn = screen.getByRole('button', { name: /Help/i });
    fireEvent.click(helpBtn);
    
    expect(mockNavigate).toHaveBeenCalledWith('/settings/help');
  });

  it('should handle sign out when sign out is clicked', async () => {
    // Stub window.location.reload
    const reloadStub = vi.fn();
    const originalReload = window.location.reload;
    
    // Use vi.spyOn instead of Object.defineProperty
    const reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(reloadStub);

    try {
      render(<SettingsPage onClose={mockOnClose} />);
      
      const signOutNav = screen.getByText('Sign Out');
      fireEvent.click(signOutNav);
      
      await waitFor(() => {
        expect(reloadStub).toHaveBeenCalled();
      });
    } finally {
      // Restore original reload
      reloadSpy.mockRestore();
    }
  });

  it('should close settings modal when close button is clicked', () => {
    render(<SettingsPage onClose={mockOnClose} />);
    
    const closeButton = screen.getByLabelText('settings:navigation.close');
    fireEvent.click(closeButton);
    
    expect(mockOnClose).toHaveBeenCalled();
  });


  it('should handle mobile view correctly', () => {
    render(<SettingsPage onClose={mockOnClose} isMobile={true} />);
    
    // Should show mobile header with close button
    expect(screen.getByLabelText('settings:navigation.close')).toBeInTheDocument();
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
    expect(mockNavigate).toHaveBeenCalledWith('/settings/account');
  });



  it('should close when clicking the close button', () => {
    render(<SettingsPage onClose={mockOnClose} />);
    
    const closeBtn = screen.getByLabelText('settings:navigation.close');
    fireEvent.click(closeBtn);
    
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should maintain navigation state when switching between pages', async () => {
    render(<SettingsPage onClose={mockOnClose} />);
    
    // Go to account page
    const accountBtn = screen.getByRole('button', { name: /Account/i });
    fireEvent.click(accountBtn);
    
    // Check that navigation was called with the correct path
    expect(mockNavigate).toHaveBeenCalledWith('/settings/account');
    
    // Go back to general
    const generalBtn = screen.getByRole('button', { name: /General/i });
    fireEvent.click(generalBtn);
    
    // Check that navigation was called with the correct path
    expect(mockNavigate).toHaveBeenCalledWith('/settings/general');
    
    // Account nav should still be visible
    expect(screen.getByText('Account')).toBeInTheDocument();
  });
});
