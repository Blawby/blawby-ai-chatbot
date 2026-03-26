import { render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { AIThinkingIndicator } from '@/features/chat/components/AIThinkingIndicator';

vi.mock('@/features/chat/components/ChatMarkdown', () => ({
  default: ({ text }: { text: string }) => <div data-testid="chat-markdown">{text}</div>
}));

describe('AIThinkingIndicator', () => {
  it('renders a single pulsing thinking dot with accessible status text', () => {
    const { container } = render(
      <AIThinkingIndicator toolMessage="Working through the response" />
    );

    const status = screen.getByRole('status');
    const dot = container.querySelector('.ai-thinking-indicator__dot');

    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toHaveTextContent('Working through the response');
    expect(dot).not.toBeNull();
    expect(container.querySelector('.ai-thinking-indicator__glow')).toBeNull();
    expect(container.querySelector('.ai-thinking-indicator__core')).toBeNull();
    expect(container.querySelector('.animate-ping')).toBeNull();
  });

  it('keeps the streaming content path unchanged and does not render the thinking dot', () => {
    const { container } = render(
      <AIThinkingIndicator content="Streaming draft content" className="custom-class" />
    );

    expect(screen.getByTestId('chat-markdown')).toHaveTextContent('Streaming draft content');
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('.ai-thinking-indicator__dot')).toBeNull();
    expect(container.querySelector('.animate-ping')).toBeNull();
  });
});
