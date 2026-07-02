import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const locationMock = vi.hoisted(() => ({
  path: '/onboarding',
  url: '/onboarding',
  query: {} as Record<string, string>,
  route: vi.fn(),
}));
const createPracticeMock = vi.fn();
const updatePracticeDetailsMock = vi.fn();
const createConnectedAccountMock = vi.fn();
const getCurrentSubscriptionMock = vi.fn();
const setActiveMock = vi.fn();
const listIntakeTemplatesMock = vi.fn();
let organizationsMock: unknown[] = [];

vi.mock('preact-iso', () => ({
  useLocation: () => locationMock,
}));

vi.mock('@/shared/i18n/hooks', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { changeLanguage: () => Promise.resolve(), language: 'en' },
  }),
  Trans: () => <span>Terms and privacy</span>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

vi.mock('@/shared/contexts/SessionContext', () => ({
  useSessionContext: () => ({
    session: {
      user: {
        id: 'user-1',
        name: 'E2E Owner',
        email: 'owner@example.com',
      },
    },
  }),
}));

vi.mock('@/shared/contexts/ToastContext', () => ({
  useToastContext: () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
  }),
}));

vi.mock('@/shared/lib/apiClient', () => ({
  createPractice: (...args: unknown[]) => createPracticeMock(...args),
  updatePracticeDetails: (...args: unknown[]) => updatePracticeDetailsMock(...args),
  createConnectedAccount: (...args: unknown[]) => createConnectedAccountMock(...args),
  getCurrentSubscription: (...args: unknown[]) => getCurrentSubscriptionMock(...args),
}));

vi.mock('@/features/intake/api/intakeTemplatesApi', () => ({
  listIntakeTemplates: (...args: unknown[]) => listIntakeTemplatesMock(...args),
}));

vi.mock('@/shared/lib/preferencesApi', () => ({
  getPreferencesCategory: vi.fn().mockResolvedValue(null),
  updatePreferencesCategory: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/shared/lib/authClient', () => ({
  authClient: {
    organization: {
      setActive: (...args: unknown[]) => setActiveMock(...args),
    },
  },
  getSession: vi.fn().mockResolvedValue(null),
  updateUser: vi.fn().mockResolvedValue(undefined),
  useListOrganizations: () => ({ data: organizationsMock }),
}));

vi.mock('@/config/urls', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/urls')>();
  return {
    ...actual,
    getPublicFormOrigin: () => 'https://dev.blawby.com',
  };
});

vi.mock('@/features/pricing/components/PricingView', () => ({
  default: ({ practiceId }: { practiceId?: string | null }) => (
    <div data-testid="pricing-practice-id">{practiceId ?? 'missing'}</div>
  ),
}));

import { OnboardingFlow } from '@/features/onboarding/components/OnboardingFlow';
import PaymentsStep from '@/features/onboarding/steps/PaymentsStep';
import IntakeFormStep from '@/features/onboarding/steps/IntakeFormStep';
import OnboardingPage from '@/pages/OnboardingPage';

describe('OnboardingFlow subscription ordering', () => {
  beforeEach(() => {
    localStorage.clear();
    createPracticeMock.mockReset();
    updatePracticeDetailsMock.mockReset();
    createConnectedAccountMock.mockReset();
    getCurrentSubscriptionMock.mockReset();
    setActiveMock.mockReset();
    listIntakeTemplatesMock.mockReset();
    locationMock.path = '/onboarding';
    locationMock.url = '/onboarding';
    locationMock.query = {};
    locationMock.route.mockReset();
    organizationsMock = [];
    createPracticeMock.mockResolvedValue({ id: 'practice-123', slug: 'e2e-practice' });
    updatePracticeDetailsMock.mockResolvedValue(null);
    createConnectedAccountMock.mockResolvedValue({
      practiceUuid: 'practice-123',
      stripeAccountId: 'acct_123',
      clientSecret: null,
      onboardingUrl: 'https://connect.stripe.com/setup/s/acct_123',
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
    });
    getCurrentSubscriptionMock.mockResolvedValue(null);
    setActiveMock.mockResolvedValue(undefined);
    listIntakeTemplatesMock.mockResolvedValue([
      {
        id: 'template-1',
        key: 'general',
        name: 'General consultation',
        is_default: true,
        fields: [
          { key: 'summary', label: 'Brief summary', required: true, phase: 'required' },
          { key: 'timeline', label: 'Important dates', required: false, phase: 'enrichment' },
        ],
      },
    ]);
  });

  it('creates a practice before loading subscription state or showing Business checkout', async () => {
    render(<OnboardingFlow onClose={vi.fn()} onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 1 of 6 .* About you/)).toBeInTheDocument();
    });
    expect(getCurrentSubscriptionMock).not.toHaveBeenCalled();

    fireEvent.input(document.querySelector('#onboarding-birthday') as HTMLInputElement, {
      target: { value: '1990-01-15' },
    });
    fireEvent.click(document.querySelector('#onboarding-terms') as HTMLInputElement);
    fireEvent.click(screen.getByRole('button', { name: /Continue → Your practice/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 2 of 6 .* Your practice/)).toBeInTheDocument();
    });
    expect(getCurrentSubscriptionMock).not.toHaveBeenCalled();

    fireEvent.input(document.querySelector('#onboarding-firmName') as HTMLInputElement, {
      target: { value: 'E2E Practice' },
    });
    const jurisdictionSelect = document.getElementById('onboarding-jurisdiction') as unknown as HTMLSelectElement;
    const jurisdictionOptions = Array.from(jurisdictionSelect.options).map((option) => option.value);
    expect(jurisdictionOptions).toContain('DC');
    expect(jurisdictionOptions).toContain('VT');
    expect(screen.queryByText('Civil litigation')).not.toBeInTheDocument();
    expect(screen.getByText('Business formation')).toBeInTheDocument();
    expect(screen.getByText('Compliance counseling')).toBeInTheDocument();
    expect(screen.getByText('Business disputes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Transactional' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regulatory' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Litigation' })).not.toBeInTheDocument();

    jurisdictionSelect.value = 'VT';
    fireEvent.input(jurisdictionSelect);
    fireEvent.change(jurisdictionSelect);
    const customPracticeArea = document.querySelector('#onboarding-practice-area-other') as HTMLInputElement;
    fireEvent.input(customPracticeArea, {
      target: { value: 'Aviation law' },
    });
    fireEvent.keyDown(customPracticeArea, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Business disputes' }));
    fireEvent.click(screen.getByRole('button', { name: /Continue → Get Business/i }));

    await waitFor(() => {
      expect(createPracticeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'E2E Practice',
          slug: 'e2e-practice',
          supportedStates: [{ country: 'US', states: ['VT'] }],
          metadata: expect.objectContaining({
            practiceAreas: expect.arrayContaining(['Aviation law', 'Business disputes']),
            practiceTypes: ['Litigation'],
            jurisdictions: ['VT'],
          }),
        })
      );
    });
    expect(updatePracticeDetailsMock).toHaveBeenCalledWith('practice-123', { isPublic: true });
    expect(setActiveMock).toHaveBeenCalledWith({ organizationId: 'practice-123' });

    await waitFor(() => {
      expect(screen.getByText(/Step 3 of 6 .* Get Business/)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /skip/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('pricing-practice-id')).toHaveTextContent('practice-123');
    await waitFor(() => {
      expect(getCurrentSubscriptionMock).toHaveBeenCalledTimes(1);
    });
  });

  it('continues onboarding when publishing the public practice flag fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    updatePracticeDetailsMock.mockRejectedValue(new Error('visibility update failed'));

    render(<OnboardingFlow onClose={vi.fn()} onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 1 of 6 .* About you/)).toBeInTheDocument();
    });
    fireEvent.input(document.querySelector('#onboarding-birthday') as HTMLInputElement, {
      target: { value: '1990-01-15' },
    });
    fireEvent.click(document.querySelector('#onboarding-terms') as HTMLInputElement);
    fireEvent.click(screen.getByRole('button', { name: /^Continue .* Your practice/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 2 of 6 .* Your practice/)).toBeInTheDocument();
    });
    fireEvent.input(document.querySelector('#onboarding-firmName') as HTMLInputElement, {
      target: { value: 'E2E Practice' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Continue .* Get Business/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 3 of 6 .* Get Business/)).toBeInTheDocument();
    });
    expect(updatePracticeDetailsMock).toHaveBeenCalledWith('practice-123', { isPublic: true });
    consoleError.mockRestore();
  });

  it('activates an existing membership before loading subscription state', async () => {
    organizationsMock = [{ id: 'existing-practice-123', slug: 'existing-practice', name: 'Existing Practice' }];
    const callOrder: string[] = [];
    let resolveActivation: (() => void) | null = null;
    setActiveMock.mockImplementation(() => new Promise<void>((resolve) => {
      callOrder.push('activate:start');
      resolveActivation = () => {
        callOrder.push('activate:done');
        resolve();
      };
    }));
    getCurrentSubscriptionMock.mockImplementation(() => {
      callOrder.push('subscription');
      return Promise.resolve(null);
    });

    render(<OnboardingFlow onClose={vi.fn()} onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(setActiveMock).toHaveBeenCalledWith({ organizationId: 'existing-practice-123' });
    });
    expect(getCurrentSubscriptionMock).not.toHaveBeenCalled();

    await act(async () => {
      resolveActivation?.();
    });

    await waitFor(() => {
      expect(getCurrentSubscriptionMock).toHaveBeenCalledTimes(1);
    });
    expect(callOrder).toEqual(['activate:start', 'activate:done', 'subscription']);
  });

  it('returns from subscription success directly to the payments step', async () => {
    render(
      <OnboardingFlow
        onClose={vi.fn()}
        onComplete={vi.fn()}
        initialStep={4}
        initialHasActiveSubscription
        subscriptionSuccessPracticeId="practice-returned"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Step 4 of 6 .* Payments/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Step 1 of 6 .* About you/)).not.toBeInTheDocument();
    expect(setActiveMock).toHaveBeenCalledWith({ organizationId: 'practice-returned' });
  });

  it('returns from Stripe Connect directly to the intake form step', async () => {
    locationMock.url = '/onboarding?stripe=return';
    locationMock.query = { stripe: 'return' };

    render(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/Step 5 of 6 .* Your intake form/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Step 1 of 6 .* About you/)).not.toBeInTheDocument();
  });

  it('prioritizes explicit Stripe return over subscription success returnTo', async () => {
    locationMock.url = '/onboarding?stripe=return&returnTo=%2F%3Fsubscription%3Dsuccess%26practiceId%3Dpractice-returned';
    locationMock.query = {
      stripe: 'return',
      returnTo: '%2F%3Fsubscription%3Dsuccess%26practiceId%3Dpractice-returned',
    };

    render(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/Step 5 of 6 .* Your intake form/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Step 4 of 6 .* Payments/)).not.toBeInTheDocument();
  });

  it('starts Stripe Connect from the payments step with the active practice', async () => {
    const redirectToStripe = vi.fn();
    render(
      <PaymentsStep
        draft={{ createdOrganizationId: 'practice-123' }}
        practiceEmail="owner@example.com"
        redirectToStripe={redirectToStripe}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Start Stripe setup/i }));

    await waitFor(() => {
      expect(createConnectedAccountMock).toHaveBeenCalledWith({
        practiceEmail: 'owner@example.com',
        practiceUuid: 'practice-123',
        returnUrl: expect.stringMatching(/\/\?stripe=return$|\/onboarding\?stripe=return$/),
        refreshUrl: expect.stringMatching(/\/\?stripe=refresh$|\/onboarding\?stripe=refresh$/),
      });
    });
    expect(redirectToStripe).toHaveBeenCalledWith('https://connect.stripe.com/setup/s/acct_123');
  });

  it('shows standard contact fields and editable-question copy in the intake preview', async () => {
    render(<IntakeFormStep draft={{ createdOrganizationId: 'practice-123' }} />);

    await waitFor(() => {
      expect(screen.getByText('General consultation')).toBeInTheDocument();
    });
    expect(screen.getByText('Collected on every intake')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Phone')).toBeInTheDocument();
    expect(screen.getByText('Brief summary')).toBeInTheDocument();
    expect(screen.getByText(/edit these questions/i)).toBeInTheDocument();
  });

  it('clears the stored intake template slug when template loading fails', async () => {
    const onTemplateReady = vi.fn();
    listIntakeTemplatesMock.mockRejectedValue(new Error('template unavailable'));

    render(<IntakeFormStep draft={{ createdOrganizationId: 'practice-123' }} onTemplateReady={onTemplateReady} />);

    await waitFor(() => {
      expect(screen.getByText('template unavailable')).toBeInTheDocument();
    });
    expect(onTemplateReady).toHaveBeenCalledWith(null);
  });
});
