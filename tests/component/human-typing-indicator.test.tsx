import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { HumanTypingIndicator } from '@/features/chat/components/HumanTypingIndicator';

describe('HumanTypingIndicator', () => {
  it('renders nothing when no participants are typing', () => {
    const { container } = render(<HumanTypingIndicator participants={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders single-participant label', () => {
    render(
      <HumanTypingIndicator
        participants={[{ userId: 'u1', name: 'Jane', image: null }]}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/Jane is typing/i);
  });

  it('renders two-participant label', () => {
    render(
      <HumanTypingIndicator
        participants={[
          { userId: 'u1', name: 'Jane', image: null },
          { userId: 'u2', name: 'Mark', image: null },
        ]}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/Jane and Mark are typing/i);
  });

  it('renders n+1 collapsed label for 3+ participants', () => {
    render(
      <HumanTypingIndicator
        participants={[
          { userId: 'u1', name: 'Jane', image: null },
          { userId: 'u2', name: 'Mark', image: null },
          { userId: 'u3', name: 'Pat', image: null },
        ]}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/Jane and 2 others are typing/i);
  });
});
