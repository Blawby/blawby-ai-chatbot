import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { LoadingScreen } from '@/shared/ui/layout/LoadingScreen';
import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';
import { SkeletonLoader } from '@/shared/ui/layout/SkeletonLoader';
import VirtualMessageList from '@/features/chat/components/VirtualMessageList';
import { LinkMatterModal } from '@/features/chat/components/LinkMatterModal';
import { MessageContent } from '@/features/chat/components/MessageContent';

const mockListMatters = vi.fn();
const mockGetMatter = vi.fn();
const mockUpdateConversationMatter = vi.fn();
const mockShowError = vi.fn();
const mockShowSuccess = vi.fn();
const mockShowInfo = vi.fn();
const loadingLabel = 'Loading\u2026';
const loadingMattersText = ['Loading', 'matters...'].join(' ');
const loadingMattersEllipsis = `Loading matters${String.fromCharCode(0x2026)}`;

const createMessages = (count: number) => Array.from({ length: count }, (_, index) => ({
  id: `message-${index}`,
  content: `Message ${index}`,
  role: index % 2 === 0 ? 'user' : 'assistant',
  isUser: index % 2 === 0,
  timestamp: Date.UTC(2024, 0, 1, 0, index)
})) as any[];

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'app.loading' ? loadingLabel : key)
  })
}));

vi.mock('@/shared/components/Modal', () => ({
  default: ({ isOpen, children, title }: { isOpen: boolean; children: unknown; title?: string }) => (
    isOpen ? (
      <div data-testid="modal">
        {title ? <h1>{title}</h1> : null}
        {children}
      </div>
    ) : null
  )
}));

vi.mock('@/shared/ui/input/Combobox', () => ({
  Combobox: ({ placeholder, disabled }: { placeholder?: string; disabled?: boolean }) => (
    <div
      data-testid="combobox"
      data-placeholder={placeholder ?? ''}
      data-disabled={disabled ? 'true' : 'false'}
    />
  )
}));

vi.mock('@/features/chat/components/ChatMarkdown', () => ({
  default: ({ text }: { text: string }) => <div data-testid="chat-markdown">{text}</div>
}));

vi.mock('@/features/matters/services/mattersApi', () => ({
  listMatters: (...args: unknown[]) => mockListMatters(...args),
  getMatter: (...args: unknown[]) => mockGetMatter(...args)
}));

vi.mock('@/shared/lib/apiClient', () => ({
  updateConversationMatter: (...args: unknown[]) => mockUpdateConversationMatter(...args)
}));

vi.mock('@/shared/contexts/SessionContext', () => ({
  useSessionContext: () => ({
    session: null,
    isPending: false,
    error: null,
    isAnonymous: false,
    stripeCustomerId: null,
    activePracticeId: null,
    activeMemberRole: null,
    activeMemberRoleLoading: false,
    routingClaims: null
  })
}));

vi.mock('@/shared/contexts/ToastContext', () => ({
  useToastContext: () => ({
    showError: mockShowError,
    showSuccess: mockShowSuccess,
    showInfo: mockShowInfo,
    showWarning: vi.fn(),
    showSystem: vi.fn()
  })
}));

const createMatterPage = (count: number) => Array.from({ length: count }, (_, index) => ({
  id: `matter-${index}`,
  title: `Matter ${index}`,
  client_id: null,
  matter_type: null,
  status: null
}));

describe('Loading primitives', () => {
  beforeEach(() => {
    mockListMatters.mockReset();
    mockGetMatter.mockReset();
    mockUpdateConversationMatter.mockReset();
    mockShowError.mockReset();
    mockShowSuccess.mockReset();
    mockShowInfo.mockReset();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      writable: true,
      value: vi.fn()
    });
  });

  it('renders LoadingSpinner with an accessible label and circle-only sizing classes', () => {
    const { container } = render(<LoadingSpinner size="lg" className="mr-2 custom-wrapper" />);
    const status = screen.getByRole('status');
    const srLabel = container.querySelector('.sr-only');
    const circle = status.querySelector('div[aria-hidden="true"]') as HTMLDivElement;

    expect(status).toHaveClass('inline-flex', 'items-center', 'justify-center', 'mr-2', 'custom-wrapper');
    expect(status.className).not.toContain('h-6');
    expect(srLabel).toHaveTextContent(loadingLabel);
    expect(circle.className).toContain('h-6');
    expect(circle.className).toContain('w-6');
    expect(circle.className).toContain('border-2');
    expect(circle.className).toContain('border-[rgb(var(--accent-foreground))]');
    expect(circle.className).toContain('border-t-transparent');
  });

  it('can disable live-region announcements when wrapped by another status container', () => {
    const { container } = render(<LoadingSpinner announce={false} ariaLabel="Loading records" />);
    const spinner = container.firstElementChild as HTMLDivElement;

    expect(spinner).not.toHaveAttribute('role');
    expect(spinner).not.toHaveAttribute('aria-live');
    expect(container.querySelector('.sr-only')).toHaveTextContent('Loading records');
  });

  it('hides LoadingScreen and LoadingBlock labels by default and shows them when requested', () => {
    const { container: screenContainer } = render(<LoadingScreen />);
    const screenWrapper = screenContainer.firstElementChild as HTMLElement;
    const screenStatuses = Array.from(screenContainer.querySelectorAll('[role="status"]')) as HTMLDivElement[];

    expect(screenWrapper).toHaveClass('flex', 'h-screen', 'items-center', 'justify-center');
    expect(screenWrapper).toHaveAttribute('role', 'status');
    expect(screenWrapper).toHaveAttribute('aria-live', 'polite');
    expect(screenStatuses).toHaveLength(1);
    expect(screenContainer.querySelector('.text-sm.text-input-placeholder')).toBeNull();
    expect(screenContainer.querySelector('.sr-only')).toHaveTextContent(loadingLabel);

    const { container: blockContainer } = render(<LoadingBlock showLabel label="Loading records" />);
    const blockWrapper = blockContainer.firstElementChild as HTMLElement;
    const blockStatuses = Array.from(blockContainer.querySelectorAll('[role="status"]')) as HTMLDivElement[];

    expect(blockWrapper).toHaveClass('flex', 'h-full', 'min-h-0', 'items-center', 'justify-center');
    expect(blockWrapper).toHaveAttribute('role', 'status');
    expect(blockWrapper).toHaveAttribute('aria-live', 'polite');
    expect(blockStatuses).toHaveLength(1);
    expect(blockContainer.querySelector('.text-sm.text-input-placeholder')).toHaveTextContent('Loading records');
  });

  it('renders SkeletonLoader variant defaults and wide text rows', () => {
    const { container } = render(
      <div>
        <SkeletonLoader variant="text" />
        <SkeletonLoader variant="text" wide />
        <SkeletonLoader variant="title" />
      </div>
    );

    const blocks = Array.from(container.querySelectorAll('.animate-pulse')) as HTMLDivElement[];

    expect(blocks[0]).toHaveClass('h-3', 'w-20', 'rounded');
    expect(blocks[1]).toHaveClass('h-3', 'w-28', 'rounded');
    expect(blocks[2]).toHaveClass('h-4', 'w-32', 'rounded');
    expect(blocks[0].className).toContain('bg-[rgb(var(--accent-foreground)/0.1)]');
  });

  it('keeps the LinkMatterModal load-more label visible while prepending a spinner', async () => {
    let resolveLoadMore: ((value: ReturnType<typeof createMatterPage>) => void) | undefined;
    const loadMorePromise = new Promise<ReturnType<typeof createMatterPage>>((resolve) => {
      resolveLoadMore = resolve;
    });

    mockListMatters
      .mockResolvedValueOnce(createMatterPage(50))
      .mockImplementationOnce(() => loadMorePromise);
    mockGetMatter.mockResolvedValue(null);

    render(
      <LinkMatterModal
        isOpen
        onClose={vi.fn()}
        practiceId="practice-1"
        conversationId="conversation-1"
      />
    );

    const button = await screen.findByRole('button', { name: 'Load more' });
    fireEvent.click(button);

    await waitFor(() => {
      const spinner = within(button).getByRole('status') as HTMLDivElement;

      expect(spinner).toBeInTheDocument();
      expect(spinner.className).not.toContain('text-input-text');
      expect(button).toHaveTextContent('Load more');
    });

    resolveLoadMore?.(createMatterPage(10));
    await waitFor(() => expect(mockListMatters).toHaveBeenCalledTimes(2));
  });

  it('removes visible initial loading copy from LinkMatterModal while keeping the combobox disabled', async () => {
    mockListMatters.mockImplementationOnce(() => new Promise<ReturnType<typeof createMatterPage>>(() => {}));
    mockGetMatter.mockResolvedValue(null);

    render(
      <LinkMatterModal
        isOpen
        onClose={vi.fn()}
        practiceId="practice-1"
        conversationId="conversation-1"
      />
    );

    const combobox = screen.getByTestId('combobox');

    await waitFor(() => {
      expect(combobox).toHaveAttribute('data-placeholder', 'Select matter');
      expect(combobox).toHaveAttribute('data-disabled', 'true');
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    expect(screen.queryByText(loadingMattersText)).toBeNull();
    expect(screen.queryByText(loadingMattersEllipsis)).toBeNull();
  });

  it('keeps the older-messages button label visible while prepending a spinner in VirtualMessageList', () => {
    render(
      <VirtualMessageList
        messages={[]}
        hasMoreMessages
        isLoadingMoreMessages
        onLoadMoreMessages={vi.fn()}
      />
    );

    const button = screen.getByRole('button', { name: /load older messages/i });
    const spinner = within(button).getByRole('status');

    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveTextContent('Loading older messages…');
    expect(button).toHaveTextContent('Load older messages');
  });

  it('renders a hidden spacer row in VirtualMessageList when older messages are already paged out', () => {
    const { container } = render(
      <VirtualMessageList
        messages={createMessages(41)}
        hasMoreMessages
      />
    );

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button', { name: /load older messages/i })).toBeNull();
    expect(screen.queryByText(/loading more messages/i)).toBeNull();

    const spacerRow = container.querySelector('[aria-hidden="true"]') as HTMLDivElement | null;
    const spacerButton = spacerRow?.querySelector('button') as HTMLButtonElement | null;

    expect(spacerRow).not.toBeNull();
    expect(spacerRow).toHaveClass('flex', 'justify-center', 'items-center', 'py-4');
    expect(spacerButton).not.toBeNull();
    expect(spacerButton).toBeDisabled();
    expect(spacerButton).toHaveAttribute('tabindex', '-1');
    expect(spacerButton?.className).toContain('text-xs');
    expect(spacerButton?.className).toContain('text-brand-purple');
    expect(spacerButton?.className).toContain('invisible');
    expect(spacerButton?.className).toContain('pointer-events-none');
  });

  it('uses the visible analysis status text as the spinner announcement', () => {
    render(<MessageContent content="📄 Analyzing document" />);

    expect(screen.getByRole('status')).toHaveTextContent('Analyzing document');
    expect(screen.getByTestId('chat-markdown')).toHaveTextContent('📄 Analyzing document');
  });

  it('announces non-document analysis messages using their visible status text', () => {
    render(<MessageContent content="🔍 Searching case law…" />);

    expect(screen.getByRole('status')).toHaveTextContent('Searching case law…');
    expect(screen.getByTestId('chat-markdown')).toHaveTextContent('🔍 Searching case law…');
  });

  it('falls back to the shared loading label for bare analysis markers', () => {
    render(<MessageContent content="🔍" />);

    expect(screen.getByRole('status')).toHaveTextContent(loadingLabel);
    expect(screen.getByTestId('chat-markdown')).toHaveTextContent('🔍');
  });

  it('falls back to the shared loading label when the analysis status uses emphasis markdown', () => {
    render(<MessageContent content="**🔍 Searching case law…**" />);

    expect(screen.getByRole('status')).toHaveTextContent(loadingLabel);
    expect(screen.getByTestId('chat-markdown')).toHaveTextContent('**🔍 Searching case law…**');
  });

  it('falls back to the shared loading label when the analysis status uses link markdown', () => {
    render(<MessageContent content="[🔍 Searching case law…](https://example.com/search)" />);

    expect(screen.getByRole('status')).toHaveTextContent(loadingLabel);
    expect(screen.getByTestId('chat-markdown')).toHaveTextContent('[🔍 Searching case law…](https://example.com/search)');
  });

  it('renders the shared message-row skeleton preset in VirtualMessageList', () => {
    const { container } = render(
      <VirtualMessageList
        messages={[]}
        showSkeleton
      />
    );

    expect(container.querySelectorAll('.h-9.w-9.rounded-full')).toHaveLength(3);
    expect(container.querySelector('.w-36')).not.toBeNull();
    expect(container.querySelector('.w-60')).not.toBeNull();
    expect(container.querySelector('.w-44')).not.toBeNull();
    expect(container.querySelector('.w-72')).not.toBeNull();
    expect(container.querySelector('.w-32')).not.toBeNull();
    expect(container.innerHTML).toContain('bg-[rgb(var(--accent-foreground)/0.1)]');
  });
});
