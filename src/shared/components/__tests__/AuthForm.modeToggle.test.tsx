/**
 * Regression test for issue #585: switching between signin and signup must
 * preserve already-entered shared fields (email + password). Adjacent fields
 * (name, confirmPassword) only exist in signup mode and must reappear when
 * toggling back into it.
 *
 * If this test fails, `handleToggleMode` in src/shared/components/AuthForm.tsx
 * is most likely clearing formData again — see the convention doc at
 * docs/solutions/conventions/form-reset-pattern-2026-05-18.md.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';

vi.mock('@/shared/lib/authClient', () => ({
  getClient: vi.fn(),
}));

// Bypass react-i18next (it pulls in real React, which conflicts with Preact in
// this test project). The toggle queries below match against returned keys.
vi.mock('@/shared/i18n/hooks', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve(), language: 'en' },
  }),
  Trans: ({ children }: { children: unknown }) => children,
}));

import AuthForm from '@/shared/components/AuthForm';

const typeInto = (el: HTMLElement, value: string) => {
  fireEvent.input(el, { target: { value } });
};

describe('AuthForm — input persistence across mode toggles (issue #585)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves email and password when toggling signin → signup', () => {
    render(
      <AuthForm
        defaultMode="signin"
        showGoogleSignIn={false}
        showHeader={false}
      />
    );

    const signinEmail = screen.getByTestId('signin-email-input') as HTMLInputElement;
    const signinPassword = screen.getByTestId('signin-password-input') as HTMLInputElement;
    typeInto(signinEmail, 'user@example.com');
    typeInto(signinPassword, 'secretpw123');
    expect(signinEmail.value).toBe('user@example.com');
    expect(signinPassword.value).toBe('secretpw123');

    const toggle = screen.getByRole('button', { name: /signin\.noAccount/ });
    fireEvent.click(toggle);

    const signupEmail = screen.getByTestId('signup-email-input') as HTMLInputElement;
    const signupPassword = screen.getByTestId('signup-password-input') as HTMLInputElement;
    expect(signupEmail.value).toBe('user@example.com');
    expect(signupPassword.value).toBe('secretpw123');
  });

  it('preserves email and password when toggling signup → signin', () => {
    render(
      <AuthForm
        defaultMode="signup"
        showGoogleSignIn={false}
        showHeader={false}
      />
    );

    const signupEmail = screen.getByTestId('signup-email-input') as HTMLInputElement;
    const signupPassword = screen.getByTestId('signup-password-input') as HTMLInputElement;
    typeInto(signupEmail, 'jane@example.com');
    typeInto(signupPassword, 'anothersecret');
    expect(signupEmail.value).toBe('jane@example.com');
    expect(signupPassword.value).toBe('anothersecret');

    const toggle = screen.getByRole('button', { name: /signup\.hasAccount/ });
    fireEvent.click(toggle);

    const signinEmail = screen.getByTestId('signin-email-input') as HTMLInputElement;
    const signinPassword = screen.getByTestId('signin-password-input') as HTMLInputElement;
    expect(signinEmail.value).toBe('jane@example.com');
    expect(signinPassword.value).toBe('anothersecret');
  });

  it('preserves signup-only fields (name, confirmPassword) when toggling away and back', () => {
    render(
      <AuthForm
        defaultMode="signup"
        showGoogleSignIn={false}
        showHeader={false}
      />
    );

    typeInto(screen.getByTestId('signup-name-input'), 'Jane Doe');
    typeInto(screen.getByTestId('signup-email-input'), 'jane@example.com');
    typeInto(screen.getByTestId('signup-password-input'), 'secretpw123');
    typeInto(screen.getByTestId('signup-confirm-password-input'), 'secretpw123');

    fireEvent.click(screen.getByRole('button', { name: /signup\.hasAccount/ }));
    expect(screen.queryByTestId('signup-name-input')).toBeNull();
    expect(screen.queryByTestId('signup-confirm-password-input')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /signin\.noAccount/ }));
    expect((screen.getByTestId('signup-name-input') as HTMLInputElement).value).toBe('Jane Doe');
    expect((screen.getByTestId('signup-confirm-password-input') as HTMLInputElement).value).toBe('secretpw123');
    expect((screen.getByTestId('signup-email-input') as HTMLInputElement).value).toBe('jane@example.com');
    expect((screen.getByTestId('signup-password-input') as HTMLInputElement).value).toBe('secretpw123');
  });

  it('preserves input across repeated toggles', () => {
    render(
      <AuthForm
        defaultMode="signin"
        showGoogleSignIn={false}
        showHeader={false}
      />
    );

    typeInto(screen.getByTestId('signin-email-input'), 'flip@example.com');
    typeInto(screen.getByTestId('signin-password-input'), 'flipflip');

    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole('button', { name: /signin\.noAccount/ }));
      fireEvent.click(screen.getByRole('button', { name: /signup\.hasAccount/ }));
    }

    expect((screen.getByTestId('signin-email-input') as HTMLInputElement).value).toBe('flip@example.com');
    expect((screen.getByTestId('signin-password-input') as HTMLInputElement).value).toBe('flipflip');
  });
});
