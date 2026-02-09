import {
  getPracticeClientIntakeCreateEndpoint,
  getPracticeClientIntakeCheckoutSessionEndpoint,
  getPracticeClientIntakeSettingsEndpoint
} from '@/config/api';
import { asMinor, assertMinorUnits, toMinorUnitsValue, type MinorAmount } from '@/shared/utils/money';
import { getPublicPracticeDetails } from '@/shared/lib/apiClient';

const getTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

// Utility function to format form data for submission
export function formatFormData(formData: Record<string, unknown>, practiceSlug: string) {
  const name = getTrimmedString(formData.name);
  const email = getTrimmedString(formData.email);
  if (!name || !email) {
    throw new Error('Name and email are required fields');
  }
  const phone = getTrimmedString(formData.phoneNumber) ?? getTrimmedString(formData.phone);
  const description =
    getTrimmedString(formData.matterDetails) ??
    getTrimmedString(formData.matterDescription) ??
    getTrimmedString(formData.description);
  const opposingParty = getTrimmedString(formData.opposingParty);

  // Handle address field if present
  const address = formData.address as {
    address?: string;
    apartment?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  } | undefined;
  let addressPayload: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postal_code: string;
    country: string;
  } | undefined = undefined;
  
  if (address) {
    const trimmedAddress = {
      address: address.address?.trim(),
      apartment: address.apartment?.trim(),
      city: address.city?.trim(),
      state: address.state?.trim(),
      postalCode: address.postalCode?.trim(),
      country: address.country?.trim()
    };

    const hasRequiredFields = [
      trimmedAddress.address,
      trimmedAddress.city,
      trimmedAddress.country,
      trimmedAddress.postalCode
    ].every(field => field && field.length > 0);
    
    if (hasRequiredFields) {
      addressPayload = {
        line1: trimmedAddress.address,
        line2: trimmedAddress.apartment,
        city: trimmedAddress.city,
        state: trimmedAddress.state,
        postal_code: trimmedAddress.postalCode,
        country: trimmedAddress.country
      };
    }
  }

  return {
    slug: practiceSlug,
    name,
    email,
    ...(phone ? { phone } : {}),
    ...(description ? { description } : {}),
    ...(opposingParty ? { opposing_party: opposingParty } : {}),
    ...(addressPayload ? { address: addressPayload } : {}),
  };
}

type IntakeSettingsResponse = {
  success?: boolean;
  data?: {
    organization?: {
      name?: string;
      logo?: string;
    };
    settings?: {
      paymentLinkEnabled?: boolean;
      payment_link_enabled?: boolean;
      prefillAmount?: number;
      prefill_amount?: number;
    };
  };
  error?: string;
};

type IntakeCreateResponse = {
  success?: boolean;
  data?: {
    uuid?: string;
    client_secret?: string;
    payment_link_url?: string;
    paymentLinkUrl?: string;
    amount?: MinorAmount;
    currency?: string;
    status?: string;
    organization?: {
      name?: string;
      logo?: string;
    };
  };
  error?: string;
};

type CheckoutSessionResponse = {
  success?: boolean;
  data?: {
    url?: string;
    session_id?: string;
  };
  error?: string;
};

export type IntakeSubmissionResult = IntakeCreateResponse & {
  intake?: {
    uuid?: string;
    clientSecret?: string;
    paymentLinkUrl?: string;
    checkoutSessionUrl?: string;
    checkoutSessionId?: string;
    amount?: MinorAmount;
    currency?: string;
    paymentLinkEnabled: boolean;
    organizationName?: string;
    organizationLogo?: string;
  };
};

// Amounts are stored as integer cents (minor units).
const clampAmount = (amount: number): MinorAmount => {
  const min = 50;
  const max = 99999999;
  if (Number.isNaN(amount)) return asMinor(min);
  return asMinor(Math.min(max, Math.max(min, Math.round(amount))));
};

const formatDescription = (description?: string) => {
  return description?.trim() || undefined;
};

type LoggedError = Error & { _logged?: boolean };

const sanitizeErrorBody = (raw: string): string => {
  if (!raw) return raw;
  const maxLength = 600;
  const redactKey = (key: string) => /token|secret|password|ssn|email|phone|address|name|clientsecret/i.test(key);
  const redactValue = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : 'REDACTED';
    }
    return 'REDACTED';
  };
  const sanitizeObject = (input: unknown, depth: number): unknown => {
    if (depth <= 0) return '[Truncated]';
    if (Array.isArray(input)) {
      return input.slice(0, 10).map((item) => sanitizeObject(item, depth - 1));
    }
    if (input && typeof input === 'object') {
      const record = input as Record<string, unknown>;
      const output: Record<string, unknown> = {};
      Object.keys(record).slice(0, 50).forEach((key) => {
        output[key] = redactKey(key)
          ? redactValue(record[key])
          : sanitizeObject(record[key], depth - 1);
      });
      return output;
    }
    return input;
  };

  try {
    const parsed = JSON.parse(raw) as unknown;
    return JSON.stringify(sanitizeObject(parsed, 3));
  } catch {
    return raw.length > maxLength ? `${raw.slice(0, maxLength)}…[truncated]` : raw;
  }
};

const createCheckoutSession = async (intakeUuid: string): Promise<{ url?: string; sessionId?: string }> => {
  try {
    const response = await fetch(getPracticeClientIntakeCheckoutSessionEndpoint(intakeUuid), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
    if (!response.ok) {
      const errorBody = await response.text();
      const safeErrorBody = import.meta.env.DEV ? errorBody : sanitizeErrorBody(errorBody);
      const errorLog = {
        status: response.status,
        statusText: response.statusText,
        errorBody: safeErrorBody,
        intakeUuid
      };
      if (import.meta.env.DEV) {
        console.warn('[Intake] Checkout session creation failed', errorLog);
      } else {
        // Production logging
        console.error('[Intake] Checkout session creation failed', JSON.stringify(errorLog));
      }
      const error = new Error(`Failed to create checkout session: ${response.status} ${response.statusText}`) as LoggedError;
      error._logged = true;
      throw error;
    }
    let result: CheckoutSessionResponse;
    try {
      result = await response.json() as CheckoutSessionResponse;
    } catch (parseError) {
      const errorLog = {
        status: response.status,
        statusText: response.statusText,
        parseError: parseError instanceof Error ? parseError.message : String(parseError),
        intakeUuid
      };
      if (import.meta.env.DEV) {
        console.warn('[Intake] Failed to parse checkout session JSON', errorLog);
      } else {
        console.error('[Intake] Failed to parse checkout session JSON', JSON.stringify(errorLog));
      }
      const error = new Error(`Invalid server response (invalid JSON): ${response.status}`) as LoggedError;
      error._logged = true;
      throw error;
    }

    if (!result.success || !result.data?.url) {
      if (import.meta.env.DEV) {
        console.warn('[Intake] Checkout session response missing url', result);
      } else {
        console.error('[Intake] Checkout session response missing url', JSON.stringify(result));
      }
      const error = new Error(result.error || 'Checkout session response missing URL') as LoggedError;
      error._logged = true;
      throw error;
    }
    return { url: result.data.url, sessionId: result.data.session_id };
  } catch (error) {
    if ((error as LoggedError)._logged) {
      throw error;
    }
    if (import.meta.env.DEV) {
      console.warn('[Intake] Checkout session request failed', error);
    } else {
      console.error('[Intake] Checkout session request failed', error instanceof Error ? error.message : String(error));
    }
    throw error;
  }
};

async function fetchIntakeSettings(
  practiceSlug: string
): Promise<IntakeSettingsResponse | null> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    const response = await fetch(getPracticeClientIntakeSettingsEndpoint(practiceSlug), {
      method: 'GET',
      headers,
      credentials: 'include'
    });

    if (!response.ok) {
      return null;
    }

    return await response.json() as IntakeSettingsResponse;
  } catch (error) {
    console.warn('[Intake] Failed to fetch intake settings', error);
    return null;
  }
}

const resolveIntakeCreateData = (
  response: IntakeCreateResponse
): IntakeCreateResponse['data'] | undefined => {
  if (!response || typeof response !== 'object') return undefined;
  if (response.data) return response.data;
  const candidate = response as IntakeCreateResponse['data'];
  if (candidate?.uuid || candidate?.payment_link_url || candidate?.paymentLinkUrl) {
    return candidate;
  }
  return undefined;
};

// Submit contact form to API
export async function submitContactForm(
  formData: Record<string, unknown>, 
  practiceSlug: string, 
  onLoadingMessage?: (messageId: string) => void,
  onUpdateMessage?: (messageId: string, content: string, isLoading: boolean) => void,
  onError?: (error: string) => void
): Promise<IntakeSubmissionResult> {
  const loadingMessageId = crypto.randomUUID();
  
  try {
    onLoadingMessage?.(loadingMessageId);
    
    const formPayload = formatFormData(formData, practiceSlug);
    const settings = await fetchIntakeSettings(practiceSlug);
    const settingsRecord = settings?.data?.settings;
    const prefillAmount = typeof settingsRecord?.prefillAmount === 'number'
      ? settingsRecord.prefillAmount
      : typeof settingsRecord?.prefill_amount === 'number'
        ? settingsRecord.prefill_amount
        : undefined;
    const paymentLinkEnabled = typeof settingsRecord?.paymentLinkEnabled === 'boolean'
      ? settingsRecord.paymentLinkEnabled
      : typeof settingsRecord?.payment_link_enabled === 'boolean'
        ? settingsRecord.payment_link_enabled
        : false;
    if (import.meta.env.DEV) {
      console.info('[Intake] Settings resolved', {
        practiceSlug,
        paymentLinkEnabled,
        prefillAmount,
        rawSettings: settingsRecord
      });
    }
    let resolvedPrefillAmount = prefillAmount;
    if ((resolvedPrefillAmount === undefined || resolvedPrefillAmount <= 0) && paymentLinkEnabled) {
      try {
        const practiceDetails = await getPublicPracticeDetails(practiceSlug);
        const consultationFee = practiceDetails?.details?.consultationFee;
        const fallbackMinor = toMinorUnitsValue(consultationFee);
        if (typeof fallbackMinor === 'number' && fallbackMinor > 0) {
          resolvedPrefillAmount = fallbackMinor;
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('[Intake] Failed to load consultation fee from practice details', error);
        }
      }
    }

    if (paymentLinkEnabled) {
      if (typeof resolvedPrefillAmount !== 'number' || !Number.isFinite(resolvedPrefillAmount)) {
        throw new Error('Consultation fee is not configured for this practice.');
      }
      if (resolvedPrefillAmount < 50) {
        throw new Error('Consultation fee must be at least $0.50.');
      }
    }

    const amount = clampAmount(
      typeof resolvedPrefillAmount === 'number' && Number.isFinite(resolvedPrefillAmount)
        ? resolvedPrefillAmount
        : 0
    );
    assertMinorUnits(amount, 'intake.create.amount');

    if (settings && settings.data?.settings?.paymentLinkEnabled === false) {
      console.info('[Intake] Payment link disabled for practice intake');
    }

    const description = formatDescription(formPayload.description as string | undefined);
    const resolvedUserId = typeof formData.userId === 'string' && formData.userId.trim().length > 0
      ? formData.userId.trim()
      : null;

    const createPayload = {
      slug: formPayload.slug,
      amount,
      email: formPayload.email,
      name: formPayload.name,
      ...(typeof formData.sessionId === 'string' && formData.sessionId.trim().length > 0
        ? { conversation_id: formData.sessionId.trim() }
        : {}),
      ...(formPayload.phone ? { phone: formPayload.phone } : {}),
      ...(description ? { description } : { description: '' }), // Always include description
      ...(formPayload.opposing_party ? { opposing_party: formPayload.opposing_party } : { opposing_party: '' }), // Always include opposing_party
      ...(formPayload.address ? { address: formPayload.address } : {}),
      user_id: resolvedUserId,
      on_behalf_of: '' // Always include on_behalf_of
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    if (import.meta.env.DEV) {
      console.log('[Forms] Sending payload to backend:', JSON.stringify(createPayload, null, 2));
    }
    
    const response = await fetch(getPracticeClientIntakeCreateEndpoint(), {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(createPayload)
    });

    if (response.ok) {
      const result = await response.json() as IntakeCreateResponse;
      if (result.success === false) {
        throw new Error(result.error || 'Form submission failed');
      }
      const intakeData = resolveIntakeCreateData(result);
      console.log('Form submitted successfully:', result);
      
      // Create confirmation message for matter vs lead first
      const baseMessage = '✅ Your lead has been submitted. The legal team will review and contact you.';
      let confirmationContent = baseMessage;

      // Check if this came from matter creation flow
      const hasMatter = typeof formData.matterDescription === 'string' && formData.matterDescription.trim() !== '';

      if (hasMatter) {
        confirmationContent = '✅ Perfect! Your matter details have been submitted successfully and updated below.';
      }

      // Update the loading message with confirmation (if callback provided)
      if (onUpdateMessage) {
        onUpdateMessage(loadingMessageId, confirmationContent, false);
      }

      const paymentLinkUrl = intakeData?.payment_link_url ?? intakeData?.paymentLinkUrl;
      let checkoutSessionUrl: string | undefined;
      let checkoutSessionId: string | undefined;
      if (paymentLinkEnabled && intakeData?.uuid) {
        try {
          const checkoutSession = await createCheckoutSession(intakeData.uuid);
          checkoutSessionUrl = checkoutSession?.url;
          checkoutSessionId = checkoutSession?.sessionId;
        } catch (error) {
          if (!(error as LoggedError)._logged) {
            console.warn('[Intake] Optional checkout session creation failed', error);
          }
          // Do not rethrow. Fall back to paymentLinkUrl if available, or just proceed without checkout session.
          // The form submission was successful.
        }
      }

      return {
        ...result,
        intake: {
          uuid: intakeData?.uuid,
          clientSecret: intakeData?.client_secret,
          paymentLinkUrl,
          checkoutSessionUrl,
          checkoutSessionId,
          amount: typeof intakeData?.amount === 'number' ? intakeData?.amount : amount,
          currency: intakeData?.currency ?? 'usd',
          paymentLinkEnabled,
          organizationName: intakeData?.organization?.name ?? settings?.data?.organization?.name,
          organizationLogo: intakeData?.organization?.logo ?? settings?.data?.organization?.logo
        }
      };
    } else {
      const errorText = await response.text();
      console.error('[Forms] Backend error response:', {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText
      });
      
      // Parse error text once to avoid double consumption
      let errorData: { error?: string; message?: string } = {};
      try {
        errorData = JSON.parse(errorText) as { error?: string; message?: string };
      } catch {
        // If parsing fails, errorData remains empty object
      }
      
      throw new Error(errorData.error || errorData.message || `Backend error: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error submitting form:', error);
    const errorMessage = error instanceof Error && error.message ? error.message : 'Form submission failed';
    
    // Update loading message with error content (if callback provided)
    if (onUpdateMessage) {
      setTimeout(() => {
        onUpdateMessage(
          loadingMessageId,
          `Sorry, there was an error submitting your information: ${errorMessage}. Please try again or contact us directly.`,
          false
        );
      }, 300);
    }
    
    onError?.(errorMessage);
    throw error instanceof Error ? error : new Error(errorMessage);
  }
} 
