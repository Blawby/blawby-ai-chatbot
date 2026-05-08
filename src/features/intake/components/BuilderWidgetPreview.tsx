import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Check, CheckCheck, RotateCcw, Send, ShieldCheck, Sparkles } from 'lucide-preact';

import { Avatar } from '@/shared/ui/profile';
import { fromMinorUnits } from '@/shared/utils/money';
import { cn } from '@/shared/utils/cn';
import type { IntakeFieldDefinition, IntakeTemplate } from '@/shared/types/intake';

/**
 * Per-bubble timestamp.
 *   < 60s     → "just now"
 *   < 60min   → "X min ago"
 *   < 24h     → "X hr ago"
 *   >= 24h    → "HH:MM AM/PM MM-DD-YYYY" (time + full date)
 *
 * Future / clock-skewed values clamp to "just now" — chat bubbles should
 * never read like they arrive from the future.
 */
function formatChatTimestamp(deliveredAt: number | undefined, now: number): string {
  if (!deliveredAt) return 'just now';
  const diff = now - deliveredAt;
  if (diff < 60_000) return 'just now';
  const min = Math.floor(diff / 60_000);
  if (min < 60) return min === 1 ? '1 min ago' : `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr === 1 ? '1 hr ago' : `${hr} hr ago`;
  return formatTimeAndDate(deliveredAt);
}

function formatTimeAndDate(deliveredAt: number): string {
  const date = new Date(deliveredAt);
  const time = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${time} ${mm}-${dd}-${yyyy}`;
}

function formatChatTimeOnly(deliveredAt: number | undefined): string {
  if (!deliveredAt) return '';
  return new Date(deliveredAt).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

type BuilderWidgetShellProps = {
  practiceName?: string | null;
  practiceLogo?: string | null;
  practiceSubtitle?: string | null;
  className?: string;
  children?: JSX.Element | JSX.Element[] | null;
  docked?: JSX.Element | null;
};

const PHONE_FRAME_BASE = 'mx-auto flex w-full max-w-[320px] flex-col overflow-hidden rounded-[28px] border border-line-utility bg-surface-app';

function BuilderWidgetShell({
  practiceName,
  practiceLogo,
  practiceSubtitle,
  className,
  children,
  docked,
}: BuilderWidgetShellProps) {
  const displayName = practiceName?.trim() || 'Your Law Firm';
  return (
    <div className={cn(PHONE_FRAME_BASE, 'h-[580px]', className)}>
      <div className="flex shrink-0 items-start gap-3 border-b border-line-utility/60 px-4 py-3">
        <Avatar
          src={practiceLogo ?? null}
          name={displayName}
          size="md"
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-input-text">{displayName}</p>
          <p className="truncate text-xs text-input-placeholder">
            {practiceSubtitle ?? 'We typically reply in a few minutes'}
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {docked ? <div className="shrink-0">{docked}</div> : null}
    </div>
  );
}

type ComposerProps = {
  interactive: boolean;
  value: string;
  onInput: (next: string) => void;
  onSend: () => void;
  placeholder?: string;
  disabled?: boolean;
};

function BuilderWidgetComposer({
  interactive,
  value,
  onInput,
  onSend,
  placeholder = 'Type your message...',
  disabled = false,
}: ComposerProps) {
  const isDisabled = !interactive || disabled;
  const canSend = interactive && !disabled && value.trim().length > 0;
  return (
    <div className="border-t border-line-utility/60 px-3 py-2.5">
      <div className="flex items-center gap-2 rounded-full border border-line-utility bg-surface-input px-3 py-1.5">
        <input
          type="text"
          disabled={isDisabled}
          placeholder={placeholder}
          value={value}
          onInput={(event) => onInput((event.currentTarget as HTMLInputElement).value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && canSend) {
              event.preventDefault();
              onSend();
            }
          }}
          className="flex-1 bg-transparent text-sm text-input-text outline-none placeholder:text-input-placeholder disabled:cursor-not-allowed"
        />
        <button
          type="button"
          disabled={!canSend}
          onClick={onSend}
          aria-label="Send"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-500 text-[rgb(var(--accent-foreground))] transition-opacity disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

type BubbleVariant = 'system' | 'assistant' | 'highlight' | 'ai' | 'user';

type ReadState = 'sent' | 'delivered' | 'read';

type FlowBubbleProps = {
  variant?: BubbleVariant;
  icon?: JSX.Element | null;
  text: string;
  /** When provided, the bubble's relative timestamp updates as `now` ticks. */
  deliveredAt?: number;
  now?: number;
  /** Read state — `sent` shows ✓, `read` shows ✓✓. Omit to hide receipt. */
  readState?: ReadState;
  /**
   * When true, the bubble renders only the time component (e.g. "02:23 PM")
   * — for use under a centered date separator that owns the day context.
   */
  compact?: boolean;
  practiceName?: string | null;
  practiceLogo?: string | null;
};

function ReadReceipt({ state }: { state: ReadState | undefined }) {
  if (!state) return null;
  if (state === 'read') {
    return (
      <CheckCheck
        className="h-3 w-3 text-accent-500"
        aria-label="Read"
      />
    );
  }
  if (state === 'delivered') {
    return (
      <CheckCheck
        className="h-3 w-3 text-input-placeholder"
        aria-label="Delivered"
      />
    );
  }
  return (
    <Check
      className="h-3 w-3 text-input-placeholder"
      aria-label="Sent"
    />
  );
}


function FlowBubble({
  variant = 'assistant',
  icon,
  text,
  deliveredAt,
  now = Date.now(),
  readState,
  compact = false,
  practiceName,
  practiceLogo,
}: FlowBubbleProps) {
  const timestamp = compact
    ? formatChatTimeOnly(deliveredAt)
    : formatChatTimestamp(deliveredAt, now);
  const isClient = variant === 'user';
  const isAi = variant === 'ai';

  // Client typed reply — left, generic identity, neutral bubble.
  if (isClient) {
    return (
      <div className="px-3 py-1">
        <div className="flex items-start gap-2">
          <Avatar name="Client" size="sm" className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-input-text">Client</p>
            <div className="mt-1 inline-block w-fit rounded-2xl bg-surface-card px-3 py-1.5 text-sm leading-tight text-input-text whitespace-pre-wrap text-balance">
              {text}
            </div>
            <p className="mt-1 flex w-full items-center justify-start gap-1 text-[11px] text-input-placeholder">
              <span>{timestamp}</span>
              <ReadReceipt state={readState} />
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Org and AI both render right-aligned. Org uses its accent brand colour
  // and avatar/name; AI uses a neutral bubble + sparkles avatar so it's
  // visually distinct as an automated assistant.
  const displayName = isAi ? 'AI Assistant' : (practiceName?.trim() || 'Your Law Firm');
  const rightAvatar = isAi ? (
    <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-accent-500">
      <Sparkles className="h-3.5 w-3.5" />
    </span>
  ) : (
    <Avatar
      src={practiceLogo ?? null}
      name={displayName}
      size="sm"
      className="mt-0.5 shrink-0"
    />
  );
  const rightBubbleClasses = isAi
    ? 'mt-1 inline-flex w-fit items-start gap-1.5 rounded-2xl bg-surface-card px-3 py-1.5 text-sm leading-tight text-input-text whitespace-pre-wrap text-balance'
    : 'mt-1 inline-flex w-fit items-start gap-1.5 rounded-2xl bg-accent-500 px-3 py-1.5 text-sm leading-tight text-[rgb(var(--accent-foreground))] whitespace-pre-wrap text-balance';
  return (
    <div className="flex justify-end px-3 py-1">
      <div className="flex max-w-[85%] flex-row-reverse items-start gap-2">
        {rightAvatar}
        <div className="flex min-w-0 flex-col items-end">
          <p className="text-right text-xs font-semibold text-input-text">{displayName}</p>
          <div className={rightBubbleClasses}>
            {icon ? (
              <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center">
                {icon}
              </span>
            ) : null}
            <span className="min-w-0">{text}</span>
          </div>
          <p className="mt-1 inline-flex w-full items-center justify-end gap-1 text-[11px] text-input-placeholder">
            <span>{timestamp}</span>
            <ReadReceipt state={readState} />
          </p>
        </div>
      </div>
    </div>
  );
}

type TypingIndicatorProps = {
  source: 'org' | 'ai' | 'client';
  practiceName?: string | null;
  practiceLogo?: string | null;
};

function TypingIndicator({ source, practiceName, practiceLogo }: TypingIndicatorProps) {
  const isOrg = source === 'org';
  const displayName = isOrg
    ? practiceName?.trim() || 'Your Law Firm'
    : source === 'ai'
      ? 'AI Assistant'
      : 'Client';
  const avatar = source === 'ai' ? (
    <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-accent-500">
      <Sparkles className="h-3.5 w-3.5" />
    </span>
  ) : isOrg ? (
    <Avatar src={practiceLogo ?? null} name={displayName} size="sm" className="mt-0.5 shrink-0" />
  ) : (
    <Avatar name={displayName} size="sm" className="mt-0.5 shrink-0" />
  );
  // Org typing aligns right (matches org messages). Client / AI aligns left.
  // Dots use input-text colour so they remain readable on the bubble fill in
  // both themes.
  const dots = (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-input-text [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-input-text [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-input-text [animation-delay:300ms]" />
    </span>
  );
  // iMessage-style: just the dots in a bubble next to the avatar. The avatar
  // identifies the speaker (org logo / sparkles for AI / generic for client);
  // the screen-reader text keeps the indicator accessible.
  if (isOrg) {
    return (
      <div className="flex justify-end px-3 py-2" role="status" aria-live="polite">
        <div className="flex flex-row-reverse items-center gap-2">
          {avatar}
          <div className="inline-flex items-center rounded-2xl bg-surface-card px-3 py-2.5">
            {dots}
          </div>
          <span className="sr-only">{displayName} is typing</span>
        </div>
      </div>
    );
  }
  return (
    <div className="px-3 py-2" role="status" aria-live="polite">
      <div className="flex items-center gap-2">
        {avatar}
        <div className="inline-flex items-center rounded-2xl bg-surface-card px-3 py-2.5">
          {dots}
        </div>
        <span className="sr-only">{displayName} is typing</span>
      </div>
    </div>
  );
}

type IntakeFlowPreviewProps = {
  template: IntakeTemplate;
  practiceName?: string | null;
  practiceLogo?: string | null;
  practiceSubtitle?: string | null;
  currencyCode?: string;
  /**
   * When true, the preview steps through the flow: disclaimer/intro deliver
   * immediately, each question waits for the user to type a reply, and the
   * payment card appears at the end. The composer is enabled.
   */
  interactive?: boolean;
  /** Strip the outer phone frame — useful when embedding inside a custom shell. */
  bare?: boolean;
  className?: string;
};

type ScriptItem =
  | { kind: 'static'; id: string; variant: BubbleVariant; icon?: JSX.Element | null; text: string }
  | { kind: 'question'; id: string; isEnrichment: boolean; prompt: string }
  | { kind: 'payment'; id: string; fee: string }
  | { kind: 'client-reply'; id: string; text: string };

function getQuestionPrompt(field: IntakeFieldDefinition): string {
  const preview = field.previewQuestion?.trim();
  if (preview) return preview;
  const label = field.label?.trim();
  if (!label) return 'Untitled question';
  return label.endsWith('?') ? label : `${label}?`;
}

function formatFee(value: number | undefined, currencyCode: string): string {
  if (value === undefined || !Number.isFinite(value)) return '';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode || 'USD',
      maximumFractionDigits: 2,
    }).format(fromMinorUnits(value));
  } catch {
    return `$${(value / 100).toFixed(2)}`;
  }
}

function buildScript(template: IntakeTemplate, currencyCode: string): ScriptItem[] {
  const items: ScriptItem[] = [];

  // Open with a mock inbound from the client so the preview kicks off with
  // a "client reaching out" — the org's intake flow then responds.
  items.push({
    kind: 'client-reply',
    id: 'client-greeting',
    text: 'Hi, I’d like to ask about my case.',
  });

  // Disclaimer + intro speak in the AI's voice ("Jordan is…", "I'm Jordan…")
  // so they render as AI Assistant messages on the left, not as org bubbles.
  const disclaimerText = template.legalDisclaimer?.trim();
  if (disclaimerText) {
    items.push({
      kind: 'static',
      id: 'disclaimer',
      variant: 'ai',
      icon: <ShieldCheck className="h-4 w-4" />,
      text: disclaimerText,
    });
  }

  const introText = template.introMessage?.trim();
  if (introText) {
    items.push({ kind: 'static', id: 'intro', variant: 'ai', text: introText });
  }

  for (const field of template.fields) {
    const phase = field.phase ?? (field.required ? 'required' : 'enrichment');
    if (phase === 'required') {
      items.push({
        kind: 'question',
        id: `req-${field.key}`,
        isEnrichment: false,
        prompt: getQuestionPrompt(field),
      });
    }
  }

  for (const field of template.fields) {
    const phase = field.phase ?? (field.required ? 'required' : 'enrichment');
    if (phase === 'enrichment') {
      items.push({
        kind: 'question',
        id: `enr-${field.key}`,
        isEnrichment: true,
        prompt: getQuestionPrompt(field),
      });
    }
  }

  if (template.paymentLinkEnabled) {
    items.push({
      kind: 'payment',
      id: 'payment',
      fee: formatFee(template.consultationFee, currencyCode),
    });
  }

  return items;
}

function getItemSource(item: ScriptItem | undefined): 'org' | 'ai' | 'client' {
  if (!item) return 'org';
  if (item.kind === 'client-reply') return 'client';
  if (item.kind === 'question' && item.isEnrichment) return 'ai';
  return 'org';
}

const MOCK_CLIENT_REPLIES = [
  'Got it, thanks!',
  'Sure, that makes sense.',
  'OK, sounds good.',
  'Thanks for asking.',
  'Understood.',
];

function pickMockReply(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash + seed.charCodeAt(i)) % MOCK_CLIENT_REPLIES.length;
  return MOCK_CLIENT_REPLIES[hash];
}

export function IntakeFlowPreview({
  template,
  practiceName,
  practiceLogo,
  practiceSubtitle,
  currencyCode = 'USD',
  interactive = false,
  bare = false,
  className,
}: IntakeFlowPreviewProps) {
  const script = useMemo(() => buildScript(template, currencyCode), [template, currencyCode]);

  // delivered = number of script items currently visible. The next item to
  // deliver is script[delivered].
  const [delivered, setDelivered] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [composer, setComposer] = useState('');
  const [deliveryTimes, setDeliveryTimes] = useState<Record<string, number>>({});
  const [answerTimes, setAnswerTimes] = useState<Record<string, number>>({});
  const [readStates, setReadStates] = useState<Record<string, ReadState>>({});
  const [mockReplies, setMockReplies] = useState<Record<string, { text: string; deliveredAt: number }>>({});
  const [pendingTyping, setPendingTyping] = useState<'org' | 'ai' | 'client' | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  // Refresh relative timestamps every 5s so "just now" flips to "1 min ago"
  // shortly after the minute lands without burning cycles for hour-old chats.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  // Reset the conversation whenever the script identity changes (template edits
  // mid-flow) or interactive mode toggles.
  const scriptKey = useMemo(() => script.map((item) => item.id).join('|'), [script]);
  useEffect(() => {
    setDelivered(0);
    setAnswers({});
    setAnswerTimes({});
    setMockReplies({});
    setComposer('');
    setPendingTyping(null);
    setDeliveryTimes({});
    setReadStates({});
  }, [scriptKey, interactive, script]);

  // Schedule the next delivery. Static items deliver quickly; questions and
  // payment cards get a typing-indicator beat so the org / AI feels like
  // it's responding. Runs in both modes — non-interactive auto-runs the
  // entire flow as a demo; interactive pauses at questions for user input.
  useEffect(() => {
    if (delivered >= script.length) {
      setPendingTyping(null);
      return;
    }
    // If the most-recently-delivered item is a question, hold until the
    // mock client reply lands. In interactive mode, also wait for the user
    // (org) to type an answer first; non-interactive auto-fires the mock
    // reply via the effect below.
    if (delivered > 0) {
      const last = script[delivered - 1];
      if (last.kind === 'question') {
        if (interactive && !answers[last.id]) {
          setPendingTyping(null);
          return;
        }
        if (!mockReplies[last.id]) {
          // Mock-reply effect owns the typing indicator while it schedules.
          return;
        }
      }
    }
    const next = script[delivered];
    const source = getItemSource(next);
    const delay = next.kind === 'static'
      ? 250
      : source === 'ai'
        ? 1200
        : source === 'client'
          ? 1100
          : 900;
    setPendingTyping(next.kind === 'static' ? null : source);
    const timeoutId = setTimeout(() => {
      setDeliveryTimes((prev) => ({ ...prev, [next.id]: Date.now() }));
      setReadStates((prev) => ({ ...prev, [next.id]: 'sent' }));
      setDelivered((prev) => prev + 1);
      setPendingTyping(null);
    }, delay);
    return () => clearTimeout(timeoutId);
  }, [interactive, delivered, script, answers, mockReplies]);

  // After a question delivers, schedule a mock client reply (left) before the
  // next scripted item delivers. In interactive mode this fires only after
  // the user (org) sends; in non-interactive it fires automatically so the
  // demo proceeds without input.
  useEffect(() => {
    if (delivered === 0) return;
    const last = script[delivered - 1];
    if (!last || last.kind !== 'question') return;
    if (interactive && !answers[last.id]) return;
    if (mockReplies[last.id]) return;

    setPendingTyping('client');
    const mockId = `${last.id}::mock-client`;
    const timeoutId = setTimeout(() => {
      const t = Date.now();
      setMockReplies((prev) => ({
        ...prev,
        [last.id]: { text: pickMockReply(last.id), deliveredAt: t },
      }));
      setReadStates((prev) => ({ ...prev, [mockId]: 'sent' }));
      setPendingTyping(null);
    }, 1200);
    return () => clearTimeout(timeoutId);
  }, [interactive, delivered, script, answers, mockReplies]);

  // Animate read receipts: ✓ (sent) → ✓✓ grey (delivered) → ✓✓ blue (read).
  // Runs in both modes so the non-interactive demo loop also animates.
  useEffect(() => {
    const sentIds = Object.entries(readStates)
      .filter(([, state]) => state === 'sent')
      .map(([id]) => id);
    const deliveredIds = Object.entries(readStates)
      .filter(([, state]) => state === 'delivered')
      .map(([id]) => id);

    const timeouts: ReturnType<typeof setTimeout>[] = [];
    if (sentIds.length > 0) {
      timeouts.push(setTimeout(() => {
        setReadStates((prev) => {
          const next = { ...prev };
          for (const id of sentIds) {
            if (next[id] === 'sent') next[id] = 'delivered';
          }
          return next;
        });
      }, 400));
    }
    if (deliveredIds.length > 0) {
      timeouts.push(setTimeout(() => {
        setReadStates((prev) => {
          const next = { ...prev };
          for (const id of deliveredIds) {
            if (next[id] === 'delivered') next[id] = 'read';
          }
          return next;
        });
      }, 600));
    }
    return () => timeouts.forEach(clearTimeout);
  }, [interactive, readStates]);

  // Auto-scroll the chat as new bubbles or typing indicators land.
  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [delivered, answers, pendingTyping, composer]);

  // Non-interactive demo loop: when the script finishes playing, pause for
  // 10 seconds then reset and replay so the org sees the conversation on
  // repeat at a glance.
  useEffect(() => {
    if (interactive) return;
    if (delivered < script.length) return;
    const timeoutId = setTimeout(() => {
      setDelivered(0);
      setMockReplies({});
      setDeliveryTimes({});
      setReadStates({});
      setPendingTyping(null);
    }, 10_000);
    return () => clearTimeout(timeoutId);
  }, [interactive, delivered, script.length]);

  const visibleItems = script.slice(0, delivered);
  const lastVisibleItem = visibleItems[visibleItems.length - 1];
  const awaitingQuestion =
    interactive && lastVisibleItem?.kind === 'question' && !answers[lastVisibleItem.id]
      ? lastVisibleItem
      : null;
  const reachedPayment = interactive && lastVisibleItem?.kind === 'payment';
  const flowComplete = interactive && delivered >= script.length && !pendingTyping;
  const showClientTyping = interactive && Boolean(awaitingQuestion) && composer.trim().length > 0;

  const handleSend = () => {
    if (!awaitingQuestion) return;
    const trimmed = composer.trim();
    if (!trimmed) return;
    const t = Date.now();
    const replyId = `${awaitingQuestion.id}::reply`;
    setAnswers((prev) => ({ ...prev, [awaitingQuestion.id]: trimmed }));
    setAnswerTimes((prev) => ({ ...prev, [awaitingQuestion.id]: t }));
    setReadStates((prev) => ({ ...prev, [replyId]: 'sent' }));
    setComposer('');
    // The delivery-scheduling effect picks up the new answer and advances.
  };

  const handleReset = () => {
    setDelivered(0);
    setAnswers({});
    setAnswerTimes({});
    setMockReplies({});
    setComposer('');
    setPendingTyping(null);
    setDeliveryTimes({});
    setReadStates({});
  };

  const renderItem = (item: ScriptItem) => {
    if (item.kind === 'static') {
      return (
        <FlowBubble
          key={item.id}
          variant={item.variant}
          icon={item.icon ?? undefined}
          text={item.text}
          deliveredAt={deliveryTimes[item.id]}
          now={now}
          readState={readStates[item.id]}
          practiceName={practiceName}
          practiceLogo={practiceLogo}
        />
      );
    }
    if (item.kind === 'question') {
      const variant: BubbleVariant = item.isEnrichment ? 'ai' : 'assistant';
      const replyId = `${item.id}::reply`;
      return (
        <div key={item.id}>
          <FlowBubble
            variant={variant}
            text={item.prompt}
            deliveredAt={deliveryTimes[item.id]}
            now={now}
            readState={readStates[item.id]}
            practiceName={practiceName}
            practiceLogo={practiceLogo}
          />
          {answers[item.id] ? (
            <FlowBubble
              variant="assistant"
              text={answers[item.id]}
              deliveredAt={answerTimes[item.id]}
              now={now}
              readState={readStates[replyId]}
              practiceName={practiceName}
              practiceLogo={practiceLogo}
            />
          ) : null}
          {mockReplies[item.id] ? (
            <FlowBubble
              variant="user"
              text={mockReplies[item.id].text}
              deliveredAt={mockReplies[item.id].deliveredAt}
              now={now}
              readState={readStates[`${item.id}::mock-client`]}
            />
          ) : null}
        </div>
      );
    }
    if (item.kind === 'payment') {
      return (
        <div key={item.id} className="px-3 py-2">
          <div className="rounded-2xl border border-line-utility bg-surface-card p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-input-placeholder">Consultation fee</p>
            <p className="mt-1 text-lg font-semibold text-input-text">{item.fee || '—'}</p>
            <button
              type="button"
              disabled
              className="mt-2 w-full rounded-lg bg-accent-500 px-3 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))] opacity-90"
            >
              Pay & submit
            </button>
          </div>
        </div>
      );
    }
    // 'client-reply' — mock inbound from the client (left, neutral).
    return (
      <FlowBubble
        key={item.id}
        variant="user"
        text={item.text}
        deliveredAt={deliveryTimes[item.id]}
        now={now}
        readState={readStates[item.id]}
      />
    );
  };

  const body = (
    <div className="flex flex-col gap-1 py-2">
      {visibleItems.map((item) => renderItem(item))}
      {pendingTyping ? (
        <TypingIndicator
          source={pendingTyping}
          practiceName={practiceName}
          practiceLogo={practiceLogo}
        />
      ) : null}
      {showClientTyping ? (
        <TypingIndicator
          source="org"
          practiceName={practiceName}
          practiceLogo={practiceLogo}
        />
      ) : null}
      {flowComplete ? (
        <FlowBubble
          variant="assistant"
          text="Preview complete — clients would submit here."
          now={now}
          practiceName={practiceName}
          practiceLogo={practiceLogo}
        />
      ) : null}
      <div ref={scrollAnchorRef} aria-hidden="true" />
    </div>
  );

  const composerPlaceholder = !interactive
    ? 'Type your message...'
    : awaitingQuestion
      ? 'Type your answer...'
      : reachedPayment
        ? 'Awaiting payment...'
        : flowComplete
          ? 'Preview complete'
          : 'Loading...';

  const docked = (
    <>
      {interactive && (delivered > 0 || Object.keys(answers).length > 0) ? (
        <div className="flex items-center justify-between border-t border-line-utility/60 px-3 py-1.5 text-[11px] text-input-placeholder">
          <span>Preview mode — answers aren&apos;t saved.</span>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 rounded text-input-placeholder hover:text-input-text"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        </div>
      ) : null}
      <BuilderWidgetComposer
        interactive={interactive}
        value={composer}
        onInput={setComposer}
        onSend={handleSend}
        placeholder={composerPlaceholder}
        disabled={!awaitingQuestion}
      />
    </>
  );

  if (bare) {
    return <div className={cn('flex flex-col', className)}>{body}</div>;
  }

  return (
    <BuilderWidgetShell
      practiceName={practiceName}
      practiceLogo={practiceLogo}
      practiceSubtitle={practiceSubtitle}
      className={className}
      docked={docked}
    >
      {body}
    </BuilderWidgetShell>
  );
}
