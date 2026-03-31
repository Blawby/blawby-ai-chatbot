import { render, screen, within } from '@testing-library/preact';
import type { ComponentChildren } from 'preact';
import { describe, expect, it, vi } from 'vitest';
import { PracticePage } from '@/features/settings/pages/PracticePage';

vi.mock('preact-iso', () => ({
  useLocation: () => ({
    path: '/practice/test/settings/practice',
    query: {}
  })
}));

vi.mock('@/shared/hooks/usePracticeManagement', () => ({
  usePracticeManagement: () => ({
    currentPractice: {
      id: 'practice-1',
      slug: 'test-practice',
      name: 'Test Practice',
      services: null,
      website: null,
      description: null,
      accentColor: '#D4AF37',
      isPublic: false,
      businessPhone: null,
      businessEmail: null,
      logo: null,
      subscriptionStatus: 'none',
      subscriptionPeriodEnd: null
    },
    getMembers: () => [],
    loading: false,
    error: null,
    updatePractice: vi.fn(),
    createPractice: vi.fn(),
    deletePractice: vi.fn(),
    fetchMembers: vi.fn(),
    refetch: vi.fn()
  })
}));

vi.mock('@/shared/hooks/usePracticeDetails', () => ({
  usePracticeDetails: () => ({
    details: {
      services: [
        { id: 'family-law', name: 'Family Law' }
      ]
    },
    updateDetails: vi.fn()
  })
}));

vi.mock('@/shared/contexts/ToastContext', () => ({
  useToastContext: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showWarning: vi.fn(),
    showInfo: vi.fn(),
    showSystem: vi.fn()
  })
}));

vi.mock('@/shared/utils/navigation', () => ({
  useNavigation: () => ({
    navigate: vi.fn()
  })
}));

vi.mock('@/shared/contexts/SessionContext', () => ({
  useSessionContext: () => ({
    session: {
      user: {
        id: 'user-1',
        email: 'owner@example.com'
      }
    },
    isPending: false,
    activeMemberRole: 'owner'
  })
}));

vi.mock('@/shared/i18n/hooks', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      switch (key) {
        case 'settings:practice.services':
          return 'Services';
        case 'settings:account.plan.manage':
          return 'Manage';
        case 'settings:practice.team':
          return 'Team Members';
        default:
          return key;
      }
    }
  })
}));

vi.mock('@/shared/ui/Icon', () => ({
  Icon: () => <span aria-hidden="true" />
}));

vi.mock('@/shared/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    className,
    icon,
    ariaLabel,
    'aria-label': ariaLabelProp
  }: {
    children?: ComponentChildren;
    onClick?: () => void;
    className?: string;
    icon?: unknown;
    ariaLabel?: string;
    'aria-label'?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={className}
      aria-label={ariaLabelProp ?? ariaLabel}
      data-icon-button={icon ? 'true' : undefined}
    >
      {children}
    </button>
  )
}));

vi.mock('@/shared/ui/form', () => ({
  FormActions: () => null
}));

vi.mock('@/shared/components/Modal', () => ({
  default: () => null
}));

vi.mock('@/shared/ui/input', () => ({
  Input: () => null,
  LogoUploadInput: () => null,
  Switch: () => null
}));

vi.mock('@/shared/ui/form/FormLabel', () => ({
  FormLabel: ({ children }: { children?: ComponentChildren }) => <label>{children}</label>
}));

vi.mock('@/shared/ui/address/AddressExperienceForm', () => ({
  AddressExperienceForm: () => null
}));

vi.mock('@/shared/ui/profile', () => ({
  StackedAvatars: () => null
}));

vi.mock('@/shared/ui/layout', () => ({
  FormGrid: ({ children }: { children?: ComponentChildren }) => <div>{children}</div>,
  SectionDivider: () => <hr />,
  ContentPageLayout: ({ children }: { children?: ComponentChildren }) => <div>{children}</div>
}));

vi.mock('@/features/settings/components/SettingsNotice', () => ({
  SettingsNotice: ({ children }: { children?: ComponentChildren }) => <div>{children}</div>
}));

vi.mock('@/features/settings/components/SettingsHelperText', () => ({
  SettingsHelperText: ({ children }: { children?: ComponentChildren }) => <div>{children}</div>
}));

vi.mock('@/features/settings/components/PracticeServicesSummary', () => ({
  PracticeServicesSummary: ({ services }: { services: string[] }) => (
    <ul>
      {services.map((service) => (
        <li key={service}>{service}</li>
      ))}
    </ul>
  )
}));

vi.mock('@/features/settings/components/SettingRow', () => ({
  SettingRow: ({
    label,
    labelNode,
    children
  }: {
    label?: string;
    labelNode?: ComponentChildren;
    children?: ComponentChildren;
  }) => (
    <section data-testid={label ? `setting-row-${label}` : undefined}>
      {labelNode}
      {children}
    </section>
  )
}));

vi.mock('@/features/settings/hooks/usePracticePageEffects', () => ({
  usePracticeMembersSync: () => undefined,
  usePracticeSyncParamRefetch: () => undefined
}));

vi.mock('@/shared/utils/practiceLogoUpload', () => ({
  uploadPracticeLogo: vi.fn()
}));

vi.mock('@/shared/utils/practiceProfile', () => ({
  buildPracticeProfilePayloads: () => ({
    practicePayload: {},
    detailsPayload: {}
  })
}));

vi.mock('@/shared/hooks/usePaymentUpgrade', () => ({
  usePaymentUpgrade: () => ({
    openBillingPortal: vi.fn(),
    submitting: false
  })
}));

vi.mock('@/config/urls', () => ({
  getFrontendHost: () => 'example.com'
}));

vi.mock('@/shared/utils/practiceRoles', () => ({
  normalizePracticeRole: (role: string | null) => role
}));

describe('PracticePage', () => {
  it('uses a descriptive accessible name for the mobile services action', () => {
    render(<PracticePage />);

    const servicesRow = screen.getByTestId('setting-row-Services');
    const iconButton = within(servicesRow)
      .getAllByRole('button')
      .find((button) => button.getAttribute('data-icon-button') === 'true');

    expect(iconButton).toBeDefined();
    expect(iconButton).toHaveAttribute('aria-label', 'Services');
    expect(iconButton).not.toHaveAttribute('aria-label', 'Manage');
  });
});
