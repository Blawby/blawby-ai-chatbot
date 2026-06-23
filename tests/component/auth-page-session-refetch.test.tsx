import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';

vi.mock('@/shared/lib/authClient', () => ({
  getClient: vi.fn(),
  getSession: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/shared/i18n/hooks', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve(), language: 'en' },
  }),
  Trans: ({ children }: { children: unknown }) => children,
}));

vi.mock('@/shared/utils/navigation', () => ({
  useNavigation: () => ({
    navigate: vi.fn(),
  }),
}));

import AuthPage from '@/pages/AuthPage';

describe('AuthPage route-level session refetch behavior', () => {
  it('preserves the selected signup mode across parent rerenders', () => {
    const { rerender } = render(<AuthPage />);

    fireEvent.click(screen.getByRole('button', { name: /signin\.noAccount/ }));
    expect(screen.getByTestId('signup-email-input')).toBeInTheDocument();

    rerender(<AuthPage />);

    expect(screen.getByTestId('signup-email-input')).toBeInTheDocument();
    expect(screen.queryByTestId('signin-email-input')).toBeNull();
  });
});
