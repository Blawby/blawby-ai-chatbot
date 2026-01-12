export type IntakePaymentRequest = {
  intakeUuid?: string;
  clientSecret?: string;
  amount?: number;
  currency?: string;
  practiceName?: string;
  practiceLogo?: string;
  practiceSlug?: string;
  returnTo?: string;
};

const getQueryValue = (value?: string) => (value && value.trim().length > 0 ? value.trim() : undefined);
const sanitizeReturnTo = (value?: string) => {
  const trimmed = getQueryValue(value);
  if (!trimmed) return undefined;
  return trimmed.startsWith('/') && !trimmed.startsWith('//') ? trimmed : undefined;
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

  const intakeUuid = getQueryValue(request.intakeUuid);
  if (intakeUuid) params.set('uuid', intakeUuid);

  const returnTo = sanitizeReturnTo(request.returnTo);
  if (returnTo) params.set('return_to', returnTo);

  const query = params.toString();
  return query.length > 0 ? `/intake/pay?${query}` : '/intake/pay';
};
