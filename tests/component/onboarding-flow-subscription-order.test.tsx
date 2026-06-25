import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createPracticeMock = vi.fn();
const getCurrentSubscriptionMock = vi.fn();
const setActiveMock = vi.fn();

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
  getCurrentSubscription: (...args: unknown[]) => getCurrentSubscriptionMock(...args),
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
  useListOrganizations: () => ({ data: [] }),
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

describe('OnboardingFlow subscription ordering', () => {
  beforeEach(() => {
    localStorage.clear();
    createPracticeMock.mockReset();
    getCurrentSubscriptionMock.mockReset();
    setActiveMock.mockReset();
    createPracticeMock.mockResolvedValue({ id: 'practice-123', slug: 'e2e-practice' });
    getCurrentSubscriptionMock.mockResolvedValue(null);
    setActiveMock.mockResolvedValue(undefined);
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
    fireEvent.click(screen.getByRole('button', { name: /Continue → Get Business/i }));

    await waitFor(() => {
      expect(createPracticeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'E2E Practice',
          slug: 'e2e-practice',
        })
      );
    });
    expect(setActiveMock).toHaveBeenCalledWith({ organizationId: 'practice-123' });

    await waitFor(() => {
      expect(screen.getByText(/Step 3 of 6 .* Get Business/)).toBeInTheDocument();
    });
    expect(screen.getByTestId('pricing-practice-id')).toHaveTextContent('practice-123');
    await waitFor(() => {
      expect(getCurrentSubscriptionMock).toHaveBeenCalledTimes(1);
    });
  });
});
