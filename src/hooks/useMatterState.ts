import { useState, useMemo } from 'preact/hooks';
import { ChatMessageUI } from '../../worker/types';
import { analyzeMissingInfo } from '../utils/matterAnalysis';
import { MatterData, MatterStatus } from '../types/matter';
import { SUMMARY_MIN_LENGTH } from '../utils/constants';

export interface MatterState {
  matter: MatterData | null;
  status: MatterStatus;
  isLoading: boolean;
}

/**
 * Hook to extract and track matter data from chat messages
 * Frontend-only solution that parses existing message data
 */
export function useMatterState(messages: ChatMessageUI[]): MatterState {
  const [isLoading, _setIsLoading] = useState(false);

  // Extract matter data from messages
  const matterData = useMemo(() => {
    if (!messages || messages.length === 0) {
      return null;
    }

    // Find the latest matter canvas in messages (by timestamp)
    let latestMatterCanvas = null;
    let latestTimestamp = 0;

    for (const message of messages) {
      if (message.matterCanvas && message.timestamp > latestTimestamp) {
        latestMatterCanvas = message.matterCanvas;
        latestTimestamp = message.timestamp;
      }
    }

    if (!latestMatterCanvas) {
      return null;
    }

    // Find document checklist in the same message or nearby messages
    let documentChecklist = null;
    for (const message of messages) {
      if (message.documentChecklist) {
        documentChecklist = message.documentChecklist;
        break;
      }
    }

    return {
      matterId: latestMatterCanvas.matterId,
      matterNumber: latestMatterCanvas.matterNumber,
      service: latestMatterCanvas.service,
      matterSummary: latestMatterCanvas.matterSummary,
      answers: latestMatterCanvas.answers,
      documentChecklist,
      status: 'incomplete' as MatterStatus // Will be determined below
    };
  }, [messages]);

  // Determine matter status based on completeness
  const status = useMemo((): MatterStatus => {
    if (!matterData) {
      return 'empty';
    }

    // Check if matter has basic required information
    const hasBasicInfo = matterData.matterSummary && 
                        matterData.matterSummary.trim().length >= SUMMARY_MIN_LENGTH &&
                        matterData.service;

    if (!hasBasicInfo) {
      return 'incomplete';
    }

    // Analyze missing information using centralized utility
    const missingInfo = analyzeMissingInfo(matterData);

    // Check if required documents are uploaded
    const documentsComplete = !matterData.documentChecklist ||
                             matterData.documentChecklist.documents
                               .filter(doc => doc.required)
                               .every(doc => doc.status === 'uploaded');

    // Matter is ready if it has basic info, no missing critical info, 
    // and required documents are uploaded
    if (missingInfo.length === 0 && documentsComplete) {
      return 'ready';
    }

    return 'incomplete';
  }, [matterData]);

  // Update matter data with determined status
  const finalMatterData = useMemo(() => {
    if (!matterData) {
      return null;
    }

    return {
      ...matterData,
      status
    };
  }, [matterData, status]);

  return {
    matter: finalMatterData,
    status,
    isLoading
  };
}


/**
 * Get default document suggestions based on matter type
 * Prevents empty state in document section
 */
export function getDefaultDocumentSuggestions(matterType: string): Array<{
  id: string;
  name: string;
  description?: string;
  required: boolean;
  status: 'missing' | 'uploaded' | 'pending';
}> {
  const type = matterType.toLowerCase();
  
  if (type.includes('family')) {
    return [
      {
        id: 'marriage-cert',
        name: 'Marriage Certificate',
        description: 'Official marriage certificate or divorce papers',
        required: true,
        status: 'missing'
      },
      {
        id: 'financial-records',
        name: 'Financial Records',
        description: 'Bank statements, tax returns, pay stubs',
        required: true,
        status: 'missing'
      },
      {
        id: 'child-info',
        name: 'Children Information',
        description: 'Birth certificates, school records, custody agreements',
        required: false,
        status: 'missing'
      }
    ];
  }
  
  if (type.includes('employment')) {
    return [
      {
        id: 'employment-contract',
        name: 'Employment Contract',
        description: 'Original employment agreement or offer letter',
        required: true,
        status: 'missing'
      },
      {
        id: 'pay-stubs',
        name: 'Pay Stubs',
        description: 'Recent pay stubs showing hours and compensation',
        required: true,
        status: 'missing'
      },
      {
        id: 'termination-docs',
        name: 'Termination Documents',
        description: 'Termination letter, performance reviews, warnings',
        required: false,
        status: 'missing'
      }
    ];
  }
  
  if (type.includes('tenant') || type.includes('landlord')) {
    return [
      {
        id: 'lease-agreement',
        name: 'Lease Agreement',
        description: 'Rental agreement or lease contract',
        required: true,
        status: 'missing'
      },
      {
        id: 'payment-receipts',
        name: 'Payment Receipts',
        description: 'Rent payment history and receipts',
        required: true,
        status: 'missing'
      },
      {
        id: 'communication',
        name: 'Communication Records',
        description: 'Emails, texts, or letters with landlord',
        required: false,
        status: 'missing'
      }
    ];
  }
  
  if (type.includes('business')) {
    return [
      {
        id: 'contracts',
        name: 'Business Contracts',
        description: 'Relevant contracts or agreements',
        required: true,
        status: 'missing'
      },
      {
        id: 'financial-records',
        name: 'Financial Records',
        description: 'Business financial statements, invoices, receipts',
        required: true,
        status: 'missing'
      },
      {
        id: 'correspondence',
        name: 'Business Correspondence',
        description: 'Emails, letters, or other business communications',
        required: false,
        status: 'missing'
      }
    ];
  }
  
  // Default suggestions for other matter types
  return [
    {
      id: 'relevant-docs',
      name: 'Relevant Documents',
      description: 'Any documents related to your legal matter',
      required: true,
      status: 'missing'
    },
    {
      id: 'communication',
      name: 'Communication Records',
      description: 'Emails, texts, or letters related to the matter',
      required: false,
      status: 'missing'
    }
  ];
}
