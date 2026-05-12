import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { MessageReadReceipts } from '@/features/chat/components/MessageReadReceipts';

describe('MessageReadReceipts', () => {
  it('renders nothing when no readers', () => {
    const { container } = render(<MessageReadReceipts readers={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders aria-label naming a single reader', () => {
    render(
      <MessageReadReceipts
        readers={[{ id: 'u1', name: 'Jane', image: null }]}
      />,
    );
    expect(screen.getByLabelText(/Seen by Jane/i)).toBeInTheDocument();
  });

  it('renders count-based aria-label for multiple readers', () => {
    render(
      <MessageReadReceipts
        readers={[
          { id: 'u1', name: 'Jane', image: null },
          { id: 'u2', name: 'Mark', image: null },
          { id: 'u3', name: 'Pat', image: null },
        ]}
      />,
    );
    expect(screen.getByLabelText(/Seen by 3 people/i)).toBeInTheDocument();
  });
});
