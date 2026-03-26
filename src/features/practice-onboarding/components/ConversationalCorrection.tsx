/**
 * ConversationalCorrection - Handle corrections through chat instead of modals
 *
 * Replaces modal-based corrections with natural conversational flow
 * where the AI asks for corrections directly in the chat interface.
 */

import { FunctionComponent } from 'preact';
import { useMemo } from 'preact/hooks';
import type { ExtractedFields } from '../types/onboardingFields';

export interface CorrectionRequest {
  field: keyof ExtractedFields;
  currentValue?: string;
  question: string;
  examples?: string[];
  validation?: (value: string) => boolean;
}

export interface ConversationalCorrectionProps {
  extractedFields: ExtractedFields;
}

const ConversationalCorrection: FunctionComponent<ConversationalCorrectionProps> = ({
  extractedFields,
}) => {
  // Generate correction requests for fields that need clarification
  const correctionRequests = useMemo((): CorrectionRequest[] => {
    const requests: CorrectionRequest[] = [];

    // Phone number correction
    if (extractedFields.contactPhone && !isValidPhone(extractedFields.contactPhone)) {
      requests.push({
        field: 'contactPhone',
        currentValue: extractedFields.contactPhone,
        question: `I found this phone number: ${extractedFields.contactPhone}. Is this correct, or what's the right number?`,
        examples: [
          '(555) 123-4567',
          '555-123-4567',
          '5551234567',
        ],
        validation: isValidPhone,
      });
    }

    // Email correction
    if (extractedFields.businessEmail && !isValidEmail(extractedFields.businessEmail)) {
      requests.push({
        field: 'businessEmail',
        currentValue: extractedFields.businessEmail,
        question: `I found this email: ${extractedFields.businessEmail}. Is this correct, or what's the right email?`,
        examples: [
          'contact@lawfirm.com',
          'john.smith@lawfirm.com',
        ],
        validation: isValidEmail,
      });
    }

    // Website correction
    if (extractedFields.website && !isValidWebsite(extractedFields.website)) {
      requests.push({
        field: 'website',
        currentValue: extractedFields.website,
        question: `I found this website: ${extractedFields.website}. Is this correct, or what's the right website?`,
        examples: [
          'https://lawfirm.com',
          'https://www.lawfirm.com',
          'lawfirm.com',
        ],
        validation: isValidWebsite,
      });
    }

    // Remote practice confirmation
    if (extractedFields.isRemote === undefined) {
      requests.push({
        field: 'isRemote',
        question: 'Are you fully remote with no physical office, or do you have a physical address?',
        examples: [
          'We\'re fully remote',
          'No physical office',
          'We work from home',
          'We have an office at 123 Main St',
        ],
      });
    }

    return requests;
  }, [extractedFields]);

  return (
    <div className="conversational-corrections space-y-4">
      {correctionRequests.map((request, index) => (
        <div key={request.field} className="glass-card p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-accent-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-accent-600 font-semibold text-sm">{index + 1}</span>
            </div>
            <div className="flex-1">
              <p className="text-sm text-input-text mb-2">{request.question}</p>
              
              {request.examples && request.examples.length > 0 && (
                <div className="text-xs text-input-placeholder mb-3">
                  Examples: {request.examples.join(', ')}
                </div>
              )}
              
              <div className="text-xs text-accent-600">
                Type your response in the chat above
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Helper functions
function isValidPhone(phone: string): boolean {
  const phoneRegex = /^\(?(\d{3})\)?[-. ]?(\d{3})[-. ]?(\d{4})$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidWebsite(website: string): boolean {
  const urlRegex = /^https?:\/\/.+\..+/;
  const domainRegex = /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$/;
  return urlRegex.test(website) || domainRegex.test(website);
}

export default ConversationalCorrection;
