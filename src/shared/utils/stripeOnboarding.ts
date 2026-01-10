const TRUSTED_STRIPE_HOST_SUFFIXES = ['.stripe.com', '.stripe.network'];

const isTrustedStripeHostname = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase();
  if (normalized === 'stripe.com' || normalized === 'stripe.network') {
    return true;
  }
  return TRUSTED_STRIPE_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
};

export const getValidatedStripeOnboardingUrl = (rawUrl?: string | null): string | null => {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return null;
    if (!isTrustedStripeHostname(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
};
