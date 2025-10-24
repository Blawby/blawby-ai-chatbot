import { render as rtlRender, RenderOptions } from '@testing-library/preact';
import { ComponentChild, ComponentChildren, h } from 'preact';
import * as userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

// --- Router test utilities (no routing mocks here) ------------------------

let mockCurrentPath = '/settings';

export const resetMockPath = () => { 
  mockCurrentPath = '/settings'; 
};

export const getMockPath = () => mockCurrentPath;

// Removed unused route/navigate spies - not wired to any mocks

// --- Shared mocks for cross-cutting concerns (global scope) --------------

// Feature flags: single, consistent API
const featureMap = {
  enableAudioRecording: false,
  enableVideoRecording: false,
  enableFileAttachments: true,
  enableLeftSidebar: true,
  enableMessageFeedback: false,
  enableDisclaimerText: false,
  enableLearnServicesButton: false,
  enableConsultationButton: false,
  enableMobileBottomNav: false,
  enablePaymentIframe: false,
  enableLeadQualification: true,
  enableMultipleOrganizations: false,
  enablePDFGeneration: false,
} as const;

vi.mock('../config/features', () => ({
  features: featureMap,
  useFeatureFlag: (flag: keyof typeof featureMap) => !!featureMap[flag],
}));

// Icons: minimal stubs
vi.mock('@heroicons/react/24/outline', () => {
  const Svg = ({ className, 'data-testid': tid }: any) =>
    h('svg', { className, 'data-testid': tid });
  const make = (tid: string) => (p: any) => h(Svg, { ...p, 'data-testid': tid });
  return {
    ChevronRightIcon: make('chevron-right-icon'),
    Cog6ToothIcon: make('cog-icon'),
    BellIcon: make('bell-icon'),
    UserIcon: make('user-icon'),
    ShieldCheckIcon: make('shield-check-icon'),
    QuestionMarkCircleIcon: make('question-mark-icon'),
    ClipboardIcon: make('clipboard-icon'),
    BuildingOfficeIcon: make('building-office-icon'),
    XMarkIcon: make('x-mark-icon'),
    ArrowRightOnRectangleIcon: make('arrow-right-on-rectangle-icon'),
    ArrowLeftIcon: make('arrow-left-icon'),
    PlusIcon: make('plus-icon'),
    PencilIcon: make('pencil-icon'),
    TrashIcon: make('trash-icon'),
    BoltIcon: make('bolt-icon'),
    DocumentIcon: make('document-icon'),
    UserGroupIcon: make('user-group-icon'),
    LockClosedIcon: make('lock-closed-icon'),
    ChatBubbleLeftRightIcon: make('chat-bubble-left-right-icon'),
  };
});

// i18n: return keys with common translations
vi.mock('../i18n/hooks', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'settings:navigation.items.general': 'General',
        'settings:navigation.items.notifications': 'Notifications',
        'settings:navigation.items.account': 'Account',
        'settings:navigation.items.organization': 'Organization',
        'settings:navigation.items.security': 'Security',
        'settings:navigation.items.help': 'Help',
        'settings:navigation.items.signOut': 'Sign Out',
      } as Record<string, string>)[key] ?? key,
    i18n: { changeLanguage: vi.fn() },
  }),
  Trans: ({ children }: { children: any }) => children,
}));

// Settings page stubs
vi.mock('../components/settings/pages/GeneralPage', () => ({ 
  GeneralPage: () => h('div', null, 'General Settings') 
}));
vi.mock('../components/settings/pages/NotificationsPage', () => ({ 
  NotificationsPage: () => h('div', null, 'Notification Settings') 
}));
vi.mock('../components/settings/pages/AccountPage', () => ({ 
  AccountPage: () => h('div', null, 'Account Settings') 
}));
vi.mock('../components/settings/pages/SecurityPage', () => ({ 
  SecurityPage: () => h('div', null, 'Security Settings') 
}));
vi.mock('../components/settings/pages/MFAEnrollmentPage', () => ({ 
  MFAEnrollmentPage: () => h('div', null, 'MFA Enrollment') 
}));
vi.mock('../components/settings/pages/HelpPage', () => ({ 
  HelpPage: () => h('div', null, 'Help & Support') 
}));

// Toast context mock
vi.mock('../contexts/ToastContext', () => ({
  ToastProvider: ({ children }: { children: any }) => children,
  useToast: () => ({
    showToast: vi.fn(),
    hideToast: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showInfo: vi.fn(),
    showWarning: vi.fn(),
    removeToast: vi.fn(),
  }),
  useToastContext: () => ({
    showToast: vi.fn(),
    hideToast: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showInfo: vi.fn(),
    showWarning: vi.fn(),
    removeToast: vi.fn(),
  }),
}));

// Auth context mock
vi.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: any }) => children,
  useAuth: () => ({
    session: { data: null, isPending: false },
    activeOrg: { data: null, isPending: false },
    signin: vi.fn(),
    signup: vi.fn(),
    signout: vi.fn(),
    refreshSession: vi.fn(),
  }),
  useSession: () => ({ data: null, isPending: false }),
  useActiveOrganization: () => ({ data: null, isPending: false }),
}));

// Organization context mock
vi.mock('../contexts/OrganizationContext', () => ({
  OrganizationProvider: ({ children }: { children: any }) => children,
  useOrganization: () => ({
    organizations: [],
    invitations: [],
    isLoading: false,
    error: null,
    createOrganization: vi.fn(),
    inviteMember: vi.fn(),
    acceptInvitation: vi.fn(),
    declineInvitation: vi.fn(),
    fetchOrganizations: vi.fn(),
    fetchInvitations: vi.fn(),
  }),
}));

// Organization management hook mock
vi.mock('../hooks/useOrganizationManagement', () => ({
  useOrganizationManagement: () => ({
    currentOrganization: null,
    organizations: [],
    invitations: [],
    loading: false,
    error: null,
    createOrganization: vi.fn(),
    updateOrganization: vi.fn(),
    deleteOrganization: vi.fn(),
    acceptInvitation: vi.fn(),
    declineInvitation: vi.fn(),
    inviteMember: vi.fn(),
    refetch: vi.fn(),
    getMembers: vi.fn(),
    fetchMembers: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
    sendInvitation: vi.fn(),
    getTokens: vi.fn(),
    fetchTokens: vi.fn(),
    createToken: vi.fn(),
    revokeToken: vi.fn(),
    getWorkspaceData: vi.fn(),
    fetchWorkspaceData: vi.fn(),
  }),
}));

/**
 * PDF generation service mock - opt-in helper
 * 
 * Usage:
 * ```typescript
 * // In your test file:
 * import { mockPDFService } from './test-utils';
 * 
 * test('PDF generation', async () => {
 *   const { PDFGenerationService } = await mockPDFService();
 *   // Use PDFGenerationService here - it will be mocked
 * });
 * ```
 * 
 * Note: This function uses vi.doMock() which requires dynamic imports.
 * You must use the returned module instead of static imports.
 */
export async function mockPDFService() {
  vi.doMock('../../worker/services/PDFGenerationService', () => ({
    PDFGenerationService: {
      convertHTMLToPDF: vi.fn().mockResolvedValue(new Uint8Array()),
      generatePDFFromTemplate: vi.fn().mockResolvedValue(new Uint8Array()),
    },
  }));
  
  // Return the dynamically imported mocked module
  // Callers must use this returned module instead of static imports
  return await import('../../worker/services/PDFGenerationService');
}

// --- Clean render function (no global providers) ------------------------

export const render = (ui: ComponentChild, options?: Omit<RenderOptions, 'wrapper'>) =>
  rtlRender(ui, options);

// --- Re-exports with proper naming --------------------------------------

// Re-export testing library utilities with explicit names to avoid conflicts
export {
  screen,
  waitFor,
  fireEvent,
  act,
  within,
  getByRole,
  getByText,
  getByLabelText,
  getByPlaceholderText,
  getByTestId,
  queryByRole,
  queryByText,
  queryByLabelText,
  queryByPlaceholderText,
  queryByTestId,
  findByRole,
  findByText,
  findByLabelText,
  findByPlaceholderText,
  findByTestId,
  getAllByRole,
  getAllByText,
  getAllByLabelText,
  getAllByPlaceholderText,
  getAllByTestId,
  queryAllByRole,
  queryAllByText,
  queryAllByLabelText,
  queryAllByPlaceholderText,
  queryAllByTestId,
  findAllByRole,
  findAllByText,
  findAllByLabelText,
  findAllByPlaceholderText,
  findAllByTestId,
} from '@testing-library/preact';

// Test cleanup - call this in afterEach hooks
export function resetTestState() {
  vi.clearAllMocks();
  resetMockPath();
}

// Feature flag helper for per-test overrides
export function setFeatureFlags(overrides: Partial<typeof featureMap>) {
  Object.assign(featureMap, overrides);
}