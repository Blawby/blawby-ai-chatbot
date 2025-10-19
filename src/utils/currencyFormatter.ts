// Currency Formatter Utility
// Locale-aware currency formatting for pricing displays

/**
 * Validates and sanitizes a currency code
 * @param currency - The currency code to validate
 * @returns Valid currency code or 'USD' as fallback
 */
function sanitizeCurrency(currency: string | null | undefined): string {
  if (!currency || typeof currency !== 'string') {
    return 'USD';
  }
  
  const sanitized = currency.toUpperCase().trim();
  
  // Must be exactly 3 alphabetic characters (ISO 4217 format)
  if (!/^[A-Z]{3}$/.test(sanitized)) {
    console.warn(`Invalid currency code: ${currency}, defaulting to USD`);
    return 'USD';
  }
  
  return sanitized;
}

/**
 * Format a price amount using Intl.NumberFormat for locale-aware currency display
 * @param amount - The numeric amount to format
 * @param currency - The ISO currency code (e.g., 'USD', 'EUR', 'GBP')
 * @param locale - The locale code (e.g., 'en', 'es', 'fr', 'de')
 * @returns Formatted currency string
 */
export function formatCurrency(
  amount: number,
  currency: string = "USD",
  locale: string = "en"
): string {
  const sanitizedCurrency = sanitizeCurrency(currency);
  
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: sanitizedCurrency,
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    // Fallback to en-US with requested currency preserved
    console.warn(
      `Currency formatting failed for locale ${locale}, falling back to en-US with ${sanitizedCurrency}`,
      error
    );
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: sanitizedCurrency,
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }
}

/**
 * Get the currency symbol for a given currency code in a specific locale
 * @param currency - The ISO currency code (e.g., 'USD', 'EUR', 'GBP')
 * @param locale - The locale code (e.g., 'en', 'es', 'fr', 'de')
 * @returns Currency symbol string
 */
export function getCurrencySymbol(
  currency: string = "USD",
  locale: string = "en"
): string {
  const sanitizedCurrency = sanitizeCurrency(currency);
  
  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: sanitizedCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

    // Extract symbol using formatToParts
    const parts = formatter.formatToParts(0);
    const symbolPart = parts.find((p) => p.type === "currency");
    return symbolPart?.value ?? sanitizedCurrency;
  } catch (error) {
    console.warn(
      `Currency symbol retrieval failed for ${sanitizedCurrency} in locale ${locale}`,
      error
    );
    return sanitizedCurrency;
  }
}
/**
 * Format price for display without currency symbol
 * @param amount - The numeric amount to format
 * @param locale - The locale code (e.g., 'en', 'es', 'fr', 'de')
 * @returns Formatted number string
 */
export function formatPrice(amount: number, locale: string = "en"): string {
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    console.warn(`Price formatting failed for locale ${locale}`, error);
    return amount.toFixed(amount % 1 === 0 ? 0 : 2);
  }
}

/**
 * Build a complete price display string with currency and billing period
 * @param amount - The numeric amount
 * @param currency - The ISO currency code
 * @param billingPeriod - Translation key for billing period (e.g., 'monthly', 'yearly')
 * @param locale - The locale code
 * @param t - Translation function from i18next
 * @returns Formatted price string like "$20 USD / month"
 */
export function buildPriceDisplay(
  amount: number,
  currency: string,
  billingPeriod: "month" | "year",
  locale: string,
  t: (key: string) => string
): string {
  const sanitizedCurrency = sanitizeCurrency(currency);
  const formattedAmount = formatCurrency(amount, sanitizedCurrency, locale);
  const period = t(
    `pricing:billing.${billingPeriod === "month" ? "monthly" : "yearly"}`
  );

  return `${formattedAmount} / ${period}`;
}
