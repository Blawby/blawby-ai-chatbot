import { render, RenderOptions } from '@testing-library/preact';
import { ComponentChildren } from 'preact';
// import { ToastProvider } from '../contexts/ToastContext';
// import { OrganizationProvider } from '../contexts/OrganizationContext';
import { vi } from 'vitest';

// Mock useLocation hook with dynamic path
let mockCurrentPath = '/settings';
const mockRoute = vi.fn((newPath: string) => {
  mockCurrentPath = newPath;
});

// Helper function to reset mock path
export const resetMockPath = () => {
  mockCurrentPath = '/settings';
};

// Helper to read current mocked path
export const getMockPath = () => mockCurrentPath;

// Mock the navigation hook
const mockNavigate = vi.fn((url: string) => {
  mockCurrentPath = url;
});
vi.mock('../hooks/useNavigation', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

// Intentionally do NOT mock '../utils/navigation'
// We rely on the real implementation which calls useLocation().route(),
// allowing us to assert calls through the mocked preact-iso route function.

vi.mock('preact-iso', () => ({
  useLocation: () => ({
    path: mockCurrentPath,
    pathname: mockCurrentPath,
    search: '',
    hash: '',
    query: {},
    route: mockRoute,
  }),
}));

// Mock the feature flags
vi.mock('../config/features', () => ({
  useFeatureFlag: (flag: string) => {
    if (flag === 'enableMultipleOrganizations') return false;
    return false;
  },
}));

// Mock the auth client
vi.mock('../lib/authClient', () => ({
  authClient: {
    getSession: vi.fn().mockResolvedValue({
      user: { id: 'test-user-id', email: 'test@example.com' },
    }),
    signOut: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock Heroicons
vi.mock('@heroicons/react/24/outline', () => ({
  ChevronRightIcon: ({ className }: { className?: string }) => 
    <svg className={className} data-testid="chevron-right-icon" />,
  Cog6ToothIcon: ({ className }: { className?: string }) => 
    <svg className={className} data-testid="cog-icon" />,
  BellIcon: ({ className }: { className?: string }) => 
    <svg className={className} data-testid="bell-icon" />,
  UserIcon: ({ className }: { className?: string }) => 
    <svg className={className} data-testid="user-icon" />,
  ShieldCheckIcon: ({ className }: { className?: string }) => 
    <svg className={className} data-testid="shield-check-icon" />,
  QuestionMarkCircleIcon: ({ className }: { className?: string }) => 
    <svg className={className} data-testid="question-mark-icon" />,
  ClipboardIcon: ({ className }: { className?: string }) => 
    <svg className={className} data-testid="clipboard-icon" />,
  BuildingOfficeIcon: ({ className }: { className?: string }) => 
    <svg className={className} data-testid="building-office-icon" />,
  XMarkIcon: ({ className }: { className?: string }) => 
    <svg className={className} data-testid="x-mark-icon" />,
  ArrowRightOnRectangleIcon: ({ className }: { className?: string }) => 
    <svg className={className} data-testid="arrow-right-on-rectangle-icon" />,
  ArrowLeftIcon: ({ className }: { className?: string }) => 
    <svg className={className} data-testid="arrow-left-icon" />,
  PlusIcon: ({ className }: { className?: string }) => 
    <svg className={className} data-testid="plus-icon" />,
}));

// Mock ToastContext
vi.mock('../contexts/ToastContext', () => ({
  ToastProvider: ({ children }: { children: ComponentChildren }) => children,
  useToast: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showInfo: vi.fn(),
    showWarning: vi.fn(),
    toasts: [],
    removeToast: vi.fn(),
  }),
  useToastContext: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showInfo: vi.fn(),
    showWarning: vi.fn(),
  }),
}));

// Mock OrganizationContext
vi.mock('../contexts/OrganizationContext', () => ({
  OrganizationProvider: ({ children }: { children: ComponentChildren }) => children,
  useOrganization: () => ({
    organization: null,
    loading: false,
    error: null,
  }),
}));

// Mock features config
vi.mock('../config/features', () => ({
  features: {
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
    enableMultipleOrganizations: true,
  }
}));

// Mock settings page components
vi.mock('../components/settings/pages/GeneralPage', () => ({
  GeneralPage: () => <div>General Settings</div>,
}));

vi.mock('../components/settings/pages/NotificationsPage', () => ({
  NotificationsPage: () => <div>Notification Settings</div>,
}));

vi.mock('../components/settings/pages/AccountPage', () => ({
  AccountPage: () => <div>Account Settings</div>,
}));

vi.mock('../components/settings/pages/SecurityPage', () => ({
  SecurityPage: () => <div>Security Settings</div>,
}));

vi.mock('../components/settings/pages/MFAEnrollmentPage', () => ({
  MFAEnrollmentPage: () => <div>MFA Enrollment</div>,
}));

vi.mock('../components/settings/pages/HelpPage', () => ({
  HelpPage: () => <div>Help & Support</div>,
}));

// Note: Individual test files should mock fetch as needed
// Global fetch mocking is removed to avoid interference with specific test mocks

interface AllTheProvidersProps {
  children: ComponentChildren;
}

const AllTheProviders = ({ children }: AllTheProvidersProps) => {
  return children;
};

const customRender = (
  ui: ComponentChildren,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options });

// Re-export everything
export * from '@testing-library/preact';

// Override render method
export { customRender as render };
// Export route spy for navigation assertions
export { mockRoute as mockNavigate, mockRoute };
