import {
  getPracticeClientIntakeCreateEndpoint,
  getPracticeClientIntakeSettingsEndpoint
} from '@/config/api';

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
  const location = getTrimmedString(formData.location);

  return {
    slug: practiceSlug,
    name,
    email,
    ...(phone ? { phone } : {}),
    ...(description ? { description } : {}),
    ...(opposingParty ? { opposing_party: opposingParty } : {}),
    ...(location ? { location } : {})
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
      prefillAmount?: number;
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
    amount?: number;
    currency?: string;
    status?: string;
    organization?: {
      name?: string;
      logo?: string;
    };
  };
  error?: string;
};

export type IntakeSubmissionResult = IntakeCreateResponse & {
  intake?: {
    uuid?: string;
    clientSecret?: string;
    paymentLinkUrl?: string;
    amount?: number;
    currency?: string;
    paymentLinkEnabled: boolean;
    organizationName?: string;
    organizationLogo?: string;
  };
};

// Amounts are stored as integer cents (minor units).
const clampAmount = (amount: number) => {
  const min = 50;
  const max = 99999999;
  if (Number.isNaN(amount)) return min;
  return Math.min(max, Math.max(min, Math.round(amount)));
};

const formatDescriptionWithLocation = (description?: string, location?: string) => {
  const parts: string[] = [];
  if (description) parts.push(description);
  if (location) parts.push(`Location: ${location}`);
  return parts.length > 0 ? parts.join('\n') : undefined;
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
    const prefillAmount = settings?.data?.settings?.prefillAmount;
    const paymentLinkEnabled = settings?.data?.settings?.paymentLinkEnabled === true;
    const amount = clampAmount(typeof prefillAmount === 'number' ? prefillAmount : 50);

    if (settings && settings.data?.settings?.paymentLinkEnabled === false) {
      console.info('[Intake] Payment link disabled for practice intake');
    }

    const descriptionWithLocation = formatDescriptionWithLocation(
      formPayload.description as string | undefined,
      formPayload.location as string | undefined
    );

    const createPayload = {
      slug: formPayload.slug,
      amount,
      email: formPayload.email,
      name: formPayload.name,
      ...(formPayload.phone ? { phone: formPayload.phone } : {}),
      ...(descriptionWithLocation ? { description: descriptionWithLocation } : {}),
      ...(formPayload.opposing_party ? { opposing_party: formPayload.opposing_party } : {})
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
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
        setTimeout(() => {
          onUpdateMessage(loadingMessageId, confirmationContent, false);
        }, 300);
      }
      
      const paymentLinkUrl = intakeData?.payment_link_url ?? intakeData?.paymentLinkUrl;

      return {
        ...result,
        intake: {
          uuid: intakeData?.uuid,
          clientSecret: intakeData?.client_secret,
          paymentLinkUrl,
          amount: typeof intakeData?.amount === 'number' ? intakeData?.amount : amount,
          currency: intakeData?.currency ?? 'usd',
          paymentLinkEnabled,
          organizationName: intakeData?.organization?.name ?? settings?.data?.organization?.name,
          organizationLogo: intakeData?.organization?.logo ?? settings?.data?.organization?.logo
        }
      };
    } else {
      const errorData = await response.json().catch(() => ({})) as { error?: string; message?: string };
      throw new Error(errorData.error || errorData.message || 'Form submission failed');
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
