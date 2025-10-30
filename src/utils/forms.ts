// API endpoints - moved inline since api.ts was removed
const getFormsEndpoint = () => '/api/forms';
const getOrganizationsEndpoint = () => '/api/organizations';
// import { ChatMessageUI } from '../../worker/types'; // Unused

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
      
      // Fetch organization configuration to check payment requirements
      let organizationConfig = null;
      try {
        const organizationsResponse = await fetch(getOrganizationsEndpoint());
        if (organizationsResponse.ok) {
          const organizationsJson = await organizationsResponse.json() as OrganizationsResponse;
          organizationConfig = organizationsJson.data.find((organization) => organization.slug === organizationId || organization.id === organizationId);
        }
      } catch (error) {
        console.warn('Failed to fetch organization config:', error);
      }
      
      // Create confirmation message based on payment requirements and matter creation status
      let confirmationContent = "";
      
      // Check if this came from matter creation flow
      const hasMatter = formData.matterDescription && formData.matterDescription !== '';
      
      if (hasMatter) {
        // Show matter canvas focus message
        confirmationContent = `✅ Perfect! Your complete matter information has been submitted successfully and updated below.`;
      } else {
      // Regular form submission
      if (organizationConfig?.config?.requiresPayment) {
        const fee = organizationConfig.config?.consultationFee ?? 0;
        const paymentLink = organizationConfig.config?.paymentLink ?? '';
        const organizationName = organizationConfig.name ?? 'our firm';
        
        // Validate that we have the required payment information
        if (fee <= 0 || !paymentLink) {
          console.warn('Payment required but missing fee or payment link:', { fee, paymentLink });
          confirmationContent = `✅ Thank you! Your information has been submitted successfully.\n\n` +
            `A lawyer will review your matter and contact you within 24 hours regarding payment details. ` +
            `Thank you for choosing ${organizationName}!`;
        } else {
          confirmationContent = `✅ Thank you! Your information has been submitted successfully.\n\n` +
            `💰 **Consultation Fee**: $${fee}\n\n` +
            `To proceed with your consultation, please complete the payment first. ` +
            `This helps us prioritize your matter and ensures we can provide you with the best legal assistance.\n\n` +
            `🔗 **Payment Link**: ${paymentLink}\n\n` +
            `Once payment is completed, a lawyer will review your matter and contact you within 24 hours. ` +
            `Thank you for choosing ${organizationName}!`;
        }
        } else {
          confirmationContent = `✅ Your information has been submitted successfully! A lawyer will review your matter and contact you within 24 hours. Thank you for choosing our firm.`;
        }
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