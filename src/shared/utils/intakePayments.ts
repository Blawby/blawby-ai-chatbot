import {
  getPracticeClientIntakeCheckoutSessionEndpoint,
  getPracticeClientIntakeStatusEndpoint,
  getPracticeClientPostPayStatusEndpoint,
} from '@/config/api';
import { assertMinorUnits, type MinorAmount } from '@/shared/utils/money';
import { withWidgetAuthHeaders } from '@/shared/utils/widgetAuth';

/** localStorage key used to signal cross-tab payment success from PaymentResultPage. */
export const PAYMENT_CONFIRMED_STORAGE_KEY = 'blawby:payment_confirmed';

export type IntakePaymentRequest = {
  intakeUuid?: string;
  clientSecret?: string;
  paymentLinkUrl?: string;
  checkoutSessionUrl?: string;
  checkoutSessionId?: string;
  amount?: MinorAmount;
  currency?: string;
  practiceName?: string;
  practiceLogo?: string;
  practiceSlug?: string;
  practiceId?: string;
  conversationId?: string;
  returnTo?: string;
};

type IntakeStatusResponse = {
  success?: boolean;
  data?: {
    paid?: boolean;
    status?: string;
    intake_uuid?: string;
  };
};

type PostPayStatusResponse = {
  paid?: boolean;
  intake_uuid?: string;
  organization_id?: string;
};

type IntakeCheckoutSessionResponse = {
  success?: boolean;
  data?: {
    url?: string;
    session_id?: string;
  };
};

const getQueryValue = (value?: string) => (value && value.trim().length > 0 ? value.trim() : undefined);
const sanitizeReturnTo = (value?: string) => {
  const trimmed = getQueryValue(value);
  if (!trimmed) return undefined;
  return trimmed.startsWith('/') && !trimmed.startsWith('//') ? trimmed : undefined;
};

const PAID_STATUSES = new Set(['succeeded', 'completed', 'paid', 'complete', 'captured']);
const STRIPE_PAYMENT_HOSTS = ['checkout.stripe.com', '.stripe.com'];

const normalizeStatus = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
};

export const isPaidIntakeStatus = (status?: unknown, succeededAt?: unknown): boolean => {
  if (typeof succeededAt === 'string' && succeededAt.trim().length > 0) {
    if (Number.isFinite(Date.parse(succeededAt))) {
      return true;
    }
  }
  if (typeof status !== 'string') return false;
  const normalized = normalizeStatus(status);
  return normalized ? PAID_STATUSES.has(normalized) : false;
};

const TERMINAL_UNPAID_STATUSES = new Set(['failed', 'canceled', 'expired', 'declined']);
export const isTerminalUnpaidStatus = (status?: unknown): boolean => {
  if (typeof status !== 'string') return false;
  const normalized = normalizeStatus(status);
  return normalized ? TERMINAL_UNPAID_STATUSES.has(normalized) : false;
};

export const isValidStripePaymentLink = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return STRIPE_PAYMENT_HOSTS.some((host) =>
      host.startsWith('.')
        ? parsed.hostname.endsWith(host)
        : parsed.hostname === host
    );
  } catch {
    return false;
  }
};

export const isValidStripeCheckoutSessionUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return STRIPE_PAYMENT_HOSTS.some((host) =>
      host.startsWith('.')
        ? parsed.hostname.endsWith(host)
        : parsed.hostname === host
    );
  } catch {
    return false;
  }
};

export const buildIntakePaymentUrl = (
  request: IntakePaymentRequest,
  options?: { includeClientSecret?: boolean }
) => {
  const params = new URLSearchParams();

  if (options?.includeClientSecret) {
    const clientSecret = getQueryValue(request.clientSecret);
    if (clientSecret) params.set('client_secret', clientSecret);
  }

  if (typeof request.amount === 'number' && Number.isFinite(request.amount)) {
    assertMinorUnits(request.amount, 'intake.payment.amount');
    params.set('amount', String(request.amount));
  }

  const currency = getQueryValue(request.currency);
  if (currency) params.set('currency', currency);

  const practiceName = getQueryValue(request.practiceName);
  if (practiceName) params.set('practice', practiceName);

  const practiceLogo = getQueryValue(request.practiceLogo);
  if (practiceLogo) params.set('logo', practiceLogo);

  const practiceSlug = getQueryValue(request.practiceSlug);
  if (practiceSlug) params.set('slug', practiceSlug);

  const practiceId = getQueryValue(request.practiceId);
  if (practiceId) params.set('practiceId', practiceId);

  const conversationId = getQueryValue(request.conversationId);
  if (conversationId) params.set('conversationId', conversationId);

  const intakeUuid = getQueryValue(request.intakeUuid);
  if (intakeUuid) params.set('uuid', intakeUuid);

  const paymentLinkUrl = getQueryValue(request.paymentLinkUrl);
  if (paymentLinkUrl && isValidStripePaymentLink(paymentLinkUrl)) {
    params.set('payment_link_url', paymentLinkUrl);
  }

  const checkoutSessionUrl = getQueryValue(request.checkoutSessionUrl);
  if (checkoutSessionUrl && isValidStripeCheckoutSessionUrl(checkoutSessionUrl)) {
    params.set('checkout_session_url', checkoutSessionUrl);
  }

  const checkoutSessionId = getQueryValue(request.checkoutSessionId);
  if (checkoutSessionId) {
    const isValidCheckoutSessionId = /^cs_(test|live)_[A-Za-z0-9]+$/.test(checkoutSessionId);
    if (isValidCheckoutSessionId) {
      params.set('checkout_session_id', checkoutSessionId);
    }
  }

  const returnTo = sanitizeReturnTo(request.returnTo);
  if (returnTo) params.set('return_to', returnTo);

  const query = params.toString();
  return query.length > 0 ? `/pay?${query}` : '/pay';
};

export const fetchIntakePaymentStatus = async (
  intakeUuid?: string,
  options?: { timeoutMs?: number; conversationId?: string }
): Promise<string | null> => {
  const trimmed = getQueryValue(intakeUuid);
  if (!trimmed) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options?.timeoutMs ?? 8000);
  try {
    const response = await fetch(
      getPracticeClientIntakeStatusEndpoint(trimmed),
      {
        method: 'GET',
        signal: controller.signal,
        credentials: 'include',
        headers: withWidgetAuthHeaders({
          'Content-Type': 'application/json',
          ...(options?.conversationId ? { 'x-conversation-id': options.conversationId } : {})
        })
      }
    );
    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const payload = await response.json() as IntakeStatusResponse;
    return normalizeStatus(payload.data?.status);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      return null;
    }
    console.warn('[IntakePayment] Failed to fetch intake status', error);
    return null;
  }
};

export const fetchIntakeCheckoutSession = async (
  intakeUuid?: string,
  options?: { timeoutMs?: number; conversationId?: string }
): Promise<{ url: string | null; sessionId: string | null }> => {
  const trimmed = getQueryValue(intakeUuid);
  if (!trimmed) {
    return { url: null, sessionId: null };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options?.timeoutMs ?? 8000);
  try {
    const response = await fetch(getPracticeClientIntakeCheckoutSessionEndpoint(trimmed), {
      method: 'POST',
      signal: controller.signal,
      credentials: 'include',
      headers: withWidgetAuthHeaders({
        'Content-Type': 'application/json',
        ...(options?.conversationId ? { 'x-conversation-id': options.conversationId } : {})
      }),
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return { url: null, sessionId: null };
    }

    const payload = await response.json() as IntakeCheckoutSessionResponse;
    if (!payload?.success || !payload.data) {
      return { url: null, sessionId: null };
    }

    return {
      url: typeof payload.data.url === 'string' ? payload.data.url : null,
      sessionId: typeof payload.data.session_id === 'string' ? payload.data.session_id : null,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      return { url: null, sessionId: null };
    }
    console.warn('[IntakePayment] Failed to fetch checkout session', error);
    return { url: null, sessionId: null };
  }
};

export const fetchPostPayIntakeStatus = async (
  sessionId?: string,
  options?: { timeoutMs?: number; conversationId?: string }
): Promise<string | null> => {
  const trimmed = getQueryValue(sessionId);
  if (!trimmed) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options?.timeoutMs ?? 8000);
  try {
    const response = await fetch(getPracticeClientPostPayStatusEndpoint(trimmed), {
      method: 'GET',
      signal: controller.signal,
      credentials: 'include',
      headers: withWidgetAuthHeaders({
        'Content-Type': 'application/json',
        ...(options?.conversationId ? { 'x-conversation-id': options.conversationId } : {})
      })
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const payload = await response.json() as PostPayStatusResponse;
    if (payload?.paid !== true || !payload.intake_uuid) {
      return null;
    }

    return payload.intake_uuid;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      return null;
    }
    console.warn('[IntakePayment] Failed to fetch post-pay status', error);
    return null;
  }
};
