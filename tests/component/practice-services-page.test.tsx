import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import type { ComponentChildren } from 'preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PracticeServicesPage } from '@/features/settings/pages/PracticeServicesPage';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const {
  mockUpdateDetailsRequest,
  mockShowError,
  mockShowSuccess,
  detailsSeed
} = vi.hoisted(() => ({
  mockUpdateDetailsRequest: vi.fn(),
  mockShowError: vi.fn(),
  mockShowSuccess: vi.fn(),
  detailsSeed: {
    current: {
      services: [
        {
          id: 'custom-existing',
          name: 'Existing Service'
        }
      ]
    } as { services?: Array<Record<string, unknown>> | null } | null
  }
}));

vi.mock('@heroicons/react/24/outline', async () => {
  const actual = await vi.importActual<typeof import('@heroicons/react/24/outline')>('@heroicons/react/24/outline');

  return {
    ...actual,
    ArrowLeftIcon: () => <svg data-testid="arrow-left-icon" />
  };
});

vi.mock('preact-iso', () => ({
  useLocation: () => ({ path: '/practice/test/settings/practice/services' })
}));

vi.mock('@/shared/hooks/usePracticeManagement', () => ({
  usePracticeManagement: () => ({
    currentPractice: {
      id: 'practice-1',
      slug: 'practice',
      name: 'Practice',
      services: null
    }
  })
}));

vi.mock('@/shared/hooks/usePracticeDetails', async () => {
  const hooks = await vi.importActual<typeof import('preact/hooks')>('preact/hooks');

  return {
    usePracticeDetails: () => {
      const [details, setDetailsState] = hooks.useState(detailsSeed.current);

      return {
        details,
        updateDetails: async (...args: unknown[]) => {
          const result = await mockUpdateDetailsRequest(...args);
          if (result !== undefined) {
            setDetailsState(result as typeof details);
          }
          return result;
        },
        setDetails: (next: typeof details) => {
          setDetailsState(next);
        }
      };
    }
  };
});

vi.mock('@/shared/contexts/ToastContext', () => ({
  useToastContext: () => ({
    showError: mockShowError,
    showSuccess: mockShowSuccess,
    showInfo: vi.fn(),
    showWarning: vi.fn(),
    showSystem: vi.fn()
  })
}));

vi.mock('@/shared/utils/navigation', () => ({
  useNavigation: () => ({
    navigate: vi.fn()
  })
}));

vi.mock('@/shared/i18n/hooks', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      switch (key) {
        case 'settings:practice.services':
          return 'Services';
        case 'settings:navigation.backToSettings':
          return 'Back to settings';
        case 'common:notifications.settingsSavedTitle':
          return 'Settings saved';
        case 'common:notifications.settingsSavedBody':
          return 'Your preferences have been updated.';
        case 'common:notifications.settingsSaveErrorTitle':
          return 'Settings save failed';
        case 'common:notifications.settingsSaveErrorBody':
          return 'Unable to save your settings. Please try again.';
        default:
          return key;
      }
    }
  })
}));

vi.mock('@/shared/ui/Button', () => ({
  Button: ({ children, onClick, ariaLabel, 'aria-label': ariaLabelProp }: {
    children?: ComponentChildren;
    onClick?: () => void;
    ariaLabel?: string;
    'aria-label'?: string;
  }) => (
    <button type="button" onClick={onClick} aria-label={ariaLabelProp ?? ariaLabel}>
      {children}
    </button>
  )
}));

vi.mock('@/shared/ui/layout', () => ({
  ContentPageLayout: ({
    title,
    headerLeading,
    children
  }: {
    title: string;
    headerLeading?: ComponentChildren;
    children?: ComponentChildren;
  }) => (
    <div>
      <h1>{title}</h1>
      {headerLeading}
      {children}
    </div>
  )
}));

vi.mock('@/features/services/components/ServicesEditor', () => ({
  ServicesEditor: ({
    services,
    onChange
  }: {
    services: Array<{ title: string }>;
    onChange: (services: Array<{ id: string; title: string }>) => void;
  }) => (
    <div>
      <div data-testid="services-props">
        {services.map((service) => service.title).join(', ')}
      </div>
      <button
        type="button"
        onClick={() => onChange([
          { id: 'custom-a', title: 'Mediation' }
        ])}
      >
        Save A
      </button>
      <button
        type="button"
        onClick={() => onChange([
          { id: 'custom-b', title: 'Arbitration' }
        ])}
      >
        Save B
      </button>
    </div>
  )
}));

describe('PracticeServicesPage', () => {
  beforeEach(() => {
    detailsSeed.current = {
      services: [
        {
          id: 'custom-existing',
          name: 'Existing Service'
        }
      ]
    };
    mockUpdateDetailsRequest.mockReset();
    mockShowError.mockReset();
    mockShowSuccess.mockReset();
  });

  it('ignores a stale failure after a newer save has succeeded', async () => {
    const firstSave = createDeferred<{ services?: Array<Record<string, unknown>> | null } | null>();
    const secondSave = createDeferred<{ services?: Array<Record<string, unknown>> | null } | null>();
    mockUpdateDetailsRequest
      .mockImplementationOnce(() => firstSave.promise)
      .mockImplementationOnce(() => secondSave.promise);

    render(<PracticeServicesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Save A' }));
    await waitFor(() => expect(screen.getByTestId('services-props')).toHaveTextContent('Mediation'));
    expect(mockUpdateDetailsRequest).toHaveBeenNthCalledWith(1, {
      services: [
        {
          id: 'custom-a',
          name: 'Mediation'
        }
      ]
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save B' }));
    await waitFor(() => expect(screen.getByTestId('services-props')).toHaveTextContent('Arbitration'));

    secondSave.resolve({
      services: [
        {
          id: 'custom-b',
          name: 'Arbitration'
        }
      ]
    });

    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('services-props')).toHaveTextContent('Arbitration');

    firstSave.reject(new Error('Older save failed'));

    await waitFor(() => expect(screen.getByTestId('services-props')).toHaveTextContent('Arbitration'));
    expect(screen.queryByText('Older save failed')).toBeNull();
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it('returns to the last confirmed details when overlapping saves both fail', async () => {
    const firstSave = createDeferred<{ services?: Array<Record<string, unknown>> | null } | null>();
    const secondSave = createDeferred<{ services?: Array<Record<string, unknown>> | null } | null>();
    mockUpdateDetailsRequest
      .mockImplementationOnce(() => firstSave.promise)
      .mockImplementationOnce(() => secondSave.promise);

    render(<PracticeServicesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Save A' }));
    await waitFor(() => expect(screen.getByTestId('services-props')).toHaveTextContent('Mediation'));

    fireEvent.click(screen.getByRole('button', { name: 'Save B' }));
    await waitFor(() => expect(screen.getByTestId('services-props')).toHaveTextContent('Arbitration'));

    secondSave.reject(new Error('Newest save failed'));

    await waitFor(() => expect(screen.getByTestId('services-props')).toHaveTextContent('Mediation'));
    expect(mockShowError).toHaveBeenCalledTimes(1);
    expect(mockShowError).toHaveBeenCalledWith('Settings save failed', 'Newest save failed');

    firstSave.reject(new Error('Older save failed'));

    await waitFor(() => expect(screen.getByTestId('services-props')).toHaveTextContent('Existing Service'));
    expect(screen.queryByText('Older save failed')).toBeNull();
    expect(mockShowError).toHaveBeenCalledTimes(1);
  });

  it('reapplies the latest visible details when an older successful save resolves late', async () => {
    const firstSave = createDeferred<{ services?: Array<Record<string, unknown>> | null } | null>();
    const secondSave = createDeferred<{ services?: Array<Record<string, unknown>> | null } | null>();
    mockUpdateDetailsRequest
      .mockImplementationOnce(() => firstSave.promise)
      .mockImplementationOnce(() => secondSave.promise);

    render(<PracticeServicesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Save A' }));
    await waitFor(() => expect(screen.getByTestId('services-props')).toHaveTextContent('Mediation'));

    fireEvent.click(screen.getByRole('button', { name: 'Save B' }));
    await waitFor(() => expect(screen.getByTestId('services-props')).toHaveTextContent('Arbitration'));

    secondSave.resolve({
      services: [
        {
          id: 'custom-b',
          name: 'Arbitration'
        }
      ]
    });

    await waitFor(() => expect(screen.getByTestId('services-props')).toHaveTextContent('Arbitration'));

    firstSave.resolve({
      services: [
        {
          id: 'custom-a',
          name: 'Mediation'
        }
      ]
    });

    await waitFor(() => expect(screen.getByTestId('services-props')).toHaveTextContent('Arbitration'));
    expect(mockShowSuccess).toHaveBeenCalledTimes(1);
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it('restores the latest confirmed save when an older save succeeds before a newer failure', async () => {
    const firstSave = createDeferred<{ services?: Array<Record<string, unknown>> | null } | null>();
    const secondSave = createDeferred<{ services?: Array<Record<string, unknown>> | null } | null>();
    mockUpdateDetailsRequest
      .mockImplementationOnce(() => firstSave.promise)
      .mockImplementationOnce(() => secondSave.promise);

    render(<PracticeServicesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Save A' }));
    await waitFor(() => expect(screen.getByTestId('services-props')).toHaveTextContent('Mediation'));

    fireEvent.click(screen.getByRole('button', { name: 'Save B' }));
    await waitFor(() => expect(screen.getByTestId('services-props')).toHaveTextContent('Arbitration'));

    firstSave.resolve({
      services: [
        {
          id: 'custom-a',
          name: 'Mediation'
        }
      ]
    });

    await waitFor(() => expect(screen.getByTestId('services-props')).toHaveTextContent('Arbitration'));
    expect(mockShowSuccess).not.toHaveBeenCalled();

    secondSave.reject(new Error('Newest save failed'));

    await waitFor(() => expect(screen.getByTestId('services-props')).toHaveTextContent('Mediation'));
    expect(mockShowError).toHaveBeenCalledWith('Settings save failed', 'Newest save failed');
  });

  it('restores the previous details and surfaces the error for the latest failed save', async () => {
    const failingSave = createDeferred<{ services?: Array<Record<string, unknown>> | null } | null>();
    mockUpdateDetailsRequest.mockImplementationOnce(() => failingSave.promise);

    render(<PracticeServicesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Save A' }));
    await waitFor(() => expect(screen.getByTestId('services-props')).toHaveTextContent('Mediation'));

    failingSave.reject(new Error('Latest save failed'));

    await waitFor(() => expect(screen.getByTestId('services-props')).toHaveTextContent('Existing Service'));
    await waitFor(() => expect(screen.getByText('Latest save failed')).toBeInTheDocument());
    expect(mockShowError).toHaveBeenCalledWith('Settings save failed', 'Latest save failed');
  });
});
