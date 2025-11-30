import { getPractice, listPractices } from '../lib/apiClient.js';
import type { Practice } from '../lib/apiClient.js';

// API endpoints - moved inline since api.ts was removed
const getFormsEndpoint = () => '/api/forms';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ULID_REGEX = /^[0-9A-Z]{26}$/i;

interface PaymentConfig {
  ownerEmail?: string;
  requiresPayment?: boolean;
  consultationFee?: number;
  paymentLink?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const looksLikePracticeId = (value: string): boolean =>
  UUID_REGEX.test(value) || ULID_REGEX.test(value);

const toPaymentConfig = (source: unknown): PaymentConfig | null => {
  if (!isRecord(source)) {
    return null;
  }
  return {
    ownerEmail: typeof source.ownerEmail === 'string' ? source.ownerEmail : undefined,
    requiresPayment: typeof source.requiresPayment === 'boolean' ? source.requiresPayment : undefined,
    consultationFee: typeof source.consultationFee === 'number' ? source.consultationFee : undefined,
    paymentLink: typeof source.paymentLink === 'string' ? source.paymentLink : undefined
  };
};

const resolvePaymentConfig = (practice?: Practice): PaymentConfig | null => {
  if (!practice) {
    return null;
  }

  const direct = toPaymentConfig(practice.config);
  if (direct) {
    return direct;
  }

  if (isRecord(practice.metadata) && isRecord(practice.metadata.conversationConfig)) {
    return toPaymentConfig(practice.metadata.conversationConfig);
  }

  return null;
};

const fetchPracticeForIdentifier = async (identifier: string): Promise<Practice | undefined> => {
  const trimmed = identifier.trim();
  if (!trimmed) {
    return undefined;
  }

  if (looksLikePracticeId(trimmed)) {
    try {
      return await getPractice(trimmed);
    } catch (error) {
      console.warn('Direct practice lookup failed, falling back to list search', {
        practiceId: trimmed,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  try {
    const practices = await listPractices({ scope: 'all' });
    return practices.find((practice) => practice.id === trimmed || practice.slug === trimmed);
  } catch (error) {
    console.warn('Failed to list practices while resolving payment requirements', error);
    return undefined;
  }
};

// Utility function to format form data for submission
export function formatFormData(formData: Record<string, unknown>, organizationId: string) {
  return {
    ...formData,
    organizationId,
    timestamp: new Date().toISOString()
  };
}

// Submit contact form to API
export async function submitContactForm(
  formData: Record<string, unknown>, 
  organizationId: string, 
  onLoadingMessage: (messageId: string) => void,
  onUpdateMessage: (messageId: string, content: string, isLoading: boolean) => void,
  onError?: (error: string) => void
) {
  const loadingMessageId = crypto.randomUUID();
  
  try {
    onLoadingMessage(loadingMessageId);
    
    const formPayload = formatFormData(formData, organizationId);
    const response = await fetch(getFormsEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formPayload)
    });

    if (response.ok) {
      const result = await response.json();
      console.log('Form submitted successfully:', result);
      
      // Fetch practice configuration to check payment requirements
      let practice: Practice | undefined;
      if (organizationId) {
        practice = await fetchPracticeForIdentifier(organizationId);
      }
      
      // Create confirmation message for matter vs lead first
      const baseMessage = '✅ Your lead has been submitted. The legal team will review and contact you.';
      let confirmationContent = baseMessage;

      // Check if this came from matter creation flow
      const hasMatter = formData.matterDescription && formData.matterDescription !== '';

      if (hasMatter) {
        confirmationContent = '✅ Perfect! Your matter details have been submitted successfully and updated below.';
      }

      // Independently append payment block if required by organization config
      const config = resolvePaymentConfig(practice);
      if (config?.requiresPayment) {
        const fee = config.consultationFee ?? 0;
        const paymentLink = config.paymentLink ?? '';
        const organizationName = practice?.name ?? 'our firm';

        let paymentText = '';
        if (fee <= 0 || !paymentLink) {
          console.warn('Payment required but missing fee or payment link:', { fee, paymentLink });
          paymentText = `A lawyer will reach out with payment details shortly. Thank you for choosing ${organizationName}!`;
        } else {
          paymentText = `💰 **Consultation Fee**: $${fee}\n\nTo continue, please complete the payment.\n\n🔗 **Payment Link**: ${paymentLink}\n\nOnce payment is complete, a lawyer will review your matter and follow up.`;
        }

        confirmationContent = `${confirmationContent}\n\n${paymentText}`;
      }

      // Update the loading message with confirmation
      setTimeout(() => {
        onUpdateMessage(loadingMessageId, confirmationContent, false);
      }, 300);
      
      // Show updated matter canvas with contact information (only if from matter creation)
      if (hasMatter) {
        setTimeout(() => {
          // Find the last message with a matter canvas to get the matter data
          // This would need to be handled by the parent component
          // For now, we'll just show the confirmation message
        }, 1000);
      }
      
    } else {
      throw new Error('Form submission failed');
    }
  } catch (error) {
    console.error('Error submitting form:', error);
    
    // Update loading message with error content
    setTimeout(() => {
      onUpdateMessage(loadingMessageId, "Sorry, there was an error submitting your information. Please try again or contact us directly.", false);
    }, 300);
    
    onError?.('Form submission failed');
  }
} 
