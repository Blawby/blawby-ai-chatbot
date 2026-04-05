import type { ChatMessageAction, ChatMessageActionVariant } from '../types/conversation';

const normalizeVariant = (value: unknown): ChatMessageActionVariant =>
  value === 'primary' ? 'primary' : 'secondary';

export const createReplyAction = (
  label: string,
  value?: string,
  variant: ChatMessageActionVariant = 'secondary',
): ChatMessageAction => ({
  type: 'reply',
  label,
  value: typeof value === 'string' && value.trim().length > 0 ? value : label,
  variant,
});

export const createSubmitAction = (
  label = 'Submit request',
  variant: ChatMessageActionVariant = 'primary',
): ChatMessageAction => ({
  type: 'submit',
  label,
  variant,
});

export const createContinuePaymentAction = (
  label = 'Continue',
  variant: ChatMessageActionVariant = 'primary',
): ChatMessageAction => ({
  type: 'continue_payment',
  label,
  variant,
});

export const createOpenUrlAction = (
  label: string,
  url: string,
  variant: ChatMessageActionVariant = 'primary',
): ChatMessageAction | null => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return {
      type: 'open_url',
      label,
      url,
      variant,
    };
  } catch {
    return null;
  }
};

export const createBuildBriefAction = (
  label = 'Build a stronger brief',
  variant: ChatMessageActionVariant = 'secondary',
): ChatMessageAction => ({
  type: 'build_brief',
  label,
  variant,
});

export const normalizeChatActions = (value: unknown): ChatMessageAction[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): ChatMessageAction[] => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const label = typeof record.label === 'string' ? record.label.trim() : '';
    const variant = normalizeVariant(record.variant);

    switch (record.type) {
      case 'reply': {
        const actionValue = typeof record.value === 'string' ? record.value.trim() : '';
        if (!label) return [];
        return [{ type: 'reply', label, value: actionValue || label, variant }];
      }
      case 'submit':
        return label ? [{ type: 'submit', label, variant }] : [];
      case 'continue_payment':
        return label ? [{ type: 'continue_payment', label, variant }] : [];
      case 'build_brief':
        return label ? [{ type: 'build_brief', label, variant }] : [];
      case 'open_url': {
        const url = typeof record.url === 'string' ? record.url.trim() : '';
        if (!label || !url) return [];
        try {
          const parsed = new URL(url);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return [];
        } catch {
          return [];
        }
        return [{ type: 'open_url', label, url, variant }];
      }
      default:
        return [];
    }
  });
};

export const getChatActionKey = (action: ChatMessageAction, index: number): string => {
  switch (action.type) {
    case 'reply':
      return `reply-${action.value}-${index}`;
    case 'submit':
      return `submit-${index}`;
    case 'continue_payment':
      return `continue-payment-${index}`;
    case 'open_url':
      return `open-url-${index}-${encodeURIComponent(action.url)}`;
    case 'build_brief':
      return `build-brief-${index}`;
  }
};

export const hasTerminalChatAction = (actions: ChatMessageAction[]): boolean =>
  actions.some((action) =>
    action.type === 'submit'
    || action.type === 'continue_payment'
    || action.type === 'open_url');

export const hasBuildBriefAction = (actions: ChatMessageAction[]): boolean =>
  actions.some((action) => action.type === 'build_brief');
