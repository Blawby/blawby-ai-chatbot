// API endpoints - moved inline since api.ts was removed
const getFormsEndpoint = () => '/api/forms';

// Utility function to format form data for submission
export function formatFormData(formData: Record<string, unknown>, practiceId: string) {
  return {
    ...formData,
    practiceId,
    timestamp: new Date().toISOString()
  };
}

// Submit contact form to API
export async function submitContactForm(
  formData: Record<string, unknown>, 
  practiceId: string, 
  onLoadingMessage: (messageId: string) => void,
  onUpdateMessage: (messageId: string, content: string, isLoading: boolean) => void,
  onError?: (error: string) => void
) {
  const loadingMessageId = crypto.randomUUID();
  
  try {
    onLoadingMessage(loadingMessageId);
    
    const formPayload = formatFormData(formData, practiceId);
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
      
      // Create confirmation message for matter vs lead first
      const baseMessage = '✅ Your lead has been submitted. The legal team will review and contact you.';
      let confirmationContent = baseMessage;

      // Check if this came from matter creation flow
      const hasMatter = formData.matterDescription && formData.matterDescription !== '';

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
