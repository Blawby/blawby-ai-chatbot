import { listPractices } from '../lib/apiClient.js';

// API endpoints - moved inline since api.ts was removed
const getFormsEndpoint = () => '/api/forms';

// Type definitions for organization data
interface Organization {
  slug?: string;
  id?: string;
  name?: string;
  config?: {
    ownerEmail?: string;
    requiresPayment?: boolean;
    consultationFee?: number;
    paymentLink?: string;
  };
}

interface OrganizationsResponse {
  data: Array<Organization>;
}

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
      let practiceConfig: Organization | undefined;
      try {
        const practices = await listPractices({ scope: 'all' });
        practiceConfig = practices.find(
          (practice) => practice.slug === organizationId || practice.id === organizationId
        );
      } catch (error) {
        console.warn('Failed to fetch practice config:', error);
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
      const config = practiceConfig?.config ?? (practiceConfig?.metadata as Record<string, any> | undefined);
      if (config?.requiresPayment) {
        const fee = config.consultationFee ?? 0;
        const paymentLink = config.paymentLink ?? '';
        const organizationName = practiceConfig?.name ?? 'our firm';

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
