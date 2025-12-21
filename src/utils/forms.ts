import { getRemoteApiUrl } from '../config/api';

// API endpoints - intake submissions now handled by staging-api
const getFormsEndpoint = () => `${getRemoteApiUrl()}/api/practice-client-intakes/submit`;

const getTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

// Utility function to format form data for submission
export function formatFormData(formData: Record<string, unknown>, practiceSlug: string) {
  const name = getTrimmedString(formData.name);
  const email = getTrimmedString(formData.email);
  const phone = getTrimmedString(formData.phoneNumber) ?? getTrimmedString(formData.phone);
  const description =
    getTrimmedString(formData.matterDetails) ??
    getTrimmedString(formData.matterDescription) ??
    getTrimmedString(formData.description);
  const sessionId = getTrimmedString(formData.sessionId);
  const opposingParty = getTrimmedString(formData.opposingParty);
  const location = getTrimmedString(formData.location);

  return {
    slug: practiceSlug,
    name,
    email,
    ...(phone ? { phone } : {}),
    ...(description ? { description } : {}),
    ...(opposingParty ? { opposing_party: opposingParty } : {}),
    ...(location ? { location } : {}),
    ...(sessionId ? { session_id: sessionId } : {})
  };
}

// Submit contact form to API
export async function submitContactForm(
  formData: Record<string, unknown>, 
  practiceSlug: string, 
  onLoadingMessage: (messageId: string) => void,
  onUpdateMessage: (messageId: string, content: string, isLoading: boolean) => void,
  onError?: (error: string) => void
) {
  const loadingMessageId = crypto.randomUUID();
  
  try {
    onLoadingMessage(loadingMessageId);
    
    const formPayload = formatFormData(formData, practiceSlug);
    const response = await fetch(getFormsEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formPayload)
    });

    if (response.ok) {
      const result = await response.json() as { success?: boolean; data?: Record<string, unknown>; error?: string };
      if (result.success === false) {
        throw new Error(result.error || 'Form submission failed');
      }
      console.log('Form submitted successfully:', result);
      
      // Create confirmation message for matter vs lead first
      const baseMessage = '✅ Your lead has been submitted. The legal team will review and contact you.';
      let confirmationContent = baseMessage;

      // Check if this came from matter creation flow
      const hasMatter = typeof formData.matterDescription === 'string' && formData.matterDescription.trim() !== '';

      if (hasMatter) {
        confirmationContent = '✅ Perfect! Your matter details have been submitted successfully and updated below.';
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
      
      return result;
    } else {
      const errorData = await response.json().catch(() => ({})) as { error?: string; message?: string };
      throw new Error(errorData.error || errorData.message || 'Form submission failed');
    }
  } catch (error) {
    console.error('Error submitting form:', error);
    
    // Update loading message with error content
    setTimeout(() => {
      onUpdateMessage(loadingMessageId, "Sorry, there was an error submitting your information. Please try again or contact us directly.", false);
    }, 300);
    
    onError?.('Form submission failed');
    throw error instanceof Error ? error : new Error('Form submission failed');
  }
} 
