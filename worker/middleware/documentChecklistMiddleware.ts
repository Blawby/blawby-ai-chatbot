import type { ConversationContext, DocumentChecklist } from './conversationContextManager.js';
import type { Env, AgentMessage } from '../types.js';
import type { SimpleMiddleware } from './pipeline.js';
import { ConversationContextManager } from './conversationContextManager.js';

/**
 * Document Checklist Middleware - handles document gathering requests
 * Detects when users want to see document checklists and provides relevant document lists
 */
export const documentChecklistMiddleware: SimpleMiddleware = {
  kind: 'simple',
  name: 'documentChecklistMiddleware',
  
  execute: async (messages: AgentMessage[], context: ConversationContext, env: Env) => {
    // Guard against empty messages array
    if (!messages || messages.length === 0) {
      return { context };
    }

    // Build conversation text for context-aware analysis
    const conversationText = messages.map(msg => msg.content).join(' ');
    const latestMessage = messages[messages.length - 1];
    
    // Check if user is requesting document checklist
    const documentKeywords = [
      'document checklist',
      'what documents do i need',
      'required documents',
      'gather documents',
      'document requirements',
      'what papers do i need',
      'document preparation',
      'required paperwork',
      'document list',
      'what files do i need'
    ];

    const isDocumentRequest = documentKeywords.some(keyword => 
      latestMessage.content.toLowerCase().includes(keyword.toLowerCase())
    );

    if (!isDocumentRequest) {
      return { context };
    }

    // Determine matter type from context or conversation
    const matterType = determineMatterType(conversationText, context);
    
    // Generate document checklist
    const documents = generateDocumentChecklist(matterType);
    
    // Transform documents to match expected format
    const documentList = documents.map(doc => ({
      required: doc.required,
      document_type: doc.name,
      description: doc.description
    }));
    
    // Update context with document checklist
    const updatedContext = ConversationContextManager.updateDocumentChecklist(context, {
      matter_type: matterType,
      required: documents.filter(doc => doc.required).map(doc => doc.name),
      provided: [],
      missing: documents.filter(doc => doc.required).map(doc => doc.name),
      last_updated: new Date().toISOString()
    });

    // Generate response
    const response = generateDocumentResponse(matterType, documentList);

    return {
      context: updatedContext,
      response,
      shouldStop: true
    };
  }
};

/**
 * Determine matter type from message or context
 */
function determineMatterType(message: string, context: ConversationContext): string {
  // First check if we have a case draft with matter type
  if (context.caseDraft?.matter_type) {
    return context.caseDraft.matter_type;
  }

  // Check established matters in context
  if (context.establishedMatters && context.establishedMatters.length > 0) {
    return context.establishedMatters[0];
  }

  // Extract from message
  const matterTypes = [
    'family law', 'employment law', 'business law', 'contract review',
    'intellectual property', 'personal injury', 'criminal law', 'civil law',
    'real estate', 'estate planning', 'immigration', 'bankruptcy'
  ];

  const foundType = matterTypes.find(type => 
    message.toLowerCase().includes(type.toLowerCase())
  );

  return foundType || 'General Consultation';
}

/**
 * Generate document checklist based on matter type
 */
function generateDocumentChecklist(matterType: string): Array<{
  id: string;
  name: string;
  description: string;
  required: boolean;
}> {
  const baseDocuments = [
    {
      id: 'identification',
      name: 'Government ID',
      description: 'Driver\'s license, passport, or state ID',
      required: true
    },
    {
      id: 'contact_info',
      name: 'Contact Information',
      description: 'Current address, phone number, email',
      required: true
    }
  ];

  const matterSpecificDocuments: Record<string, Array<{
    id: string;
    name: string;
    description: string;
    required: boolean;
  }>> = {
    'family law': [
      {
        id: 'marriage_certificate',
        name: 'Marriage Certificate',
        description: 'Copy of marriage certificate',
        required: true
      },
      {
        id: 'children_birth_certificates',
        name: 'Children\'s Birth Certificates',
        description: 'Birth certificates for all children',
        required: true
      },
      {
        id: 'financial_documents',
        name: 'Financial Documents',
        description: 'Bank statements, tax returns, pay stubs',
        required: true
      },
      {
        id: 'property_documents',
        name: 'Property Documents',
        description: 'Deeds, mortgage statements, property appraisals',
        required: false
      }
    ],
    'employment law': [
      {
        id: 'employment_contract',
        name: 'Employment Contract',
        description: 'Original or copy of employment contract',
        required: true
      },
      {
        id: 'pay_stubs',
        name: 'Pay Stubs',
        description: 'Recent pay stubs showing income and deductions',
        required: true
      },
      {
        id: 'termination_letter',
        name: 'Termination Letter',
        description: 'Copy of termination letter or notice',
        required: true
      },
      {
        id: 'performance_reviews',
        name: 'Performance Reviews',
        description: 'Copies of performance reviews or evaluations',
        required: false
      },
      {
        id: 'benefits_info',
        name: 'Benefits Information',
        description: 'Information about health insurance, retirement plans, etc.',
        required: false
      }
    ],
    'personal injury': [
      {
        id: 'medical_records',
        name: 'Medical Records',
        description: 'All medical records related to the injury',
        required: true
      },
      {
        id: 'police_report',
        name: 'Police Report',
        description: 'Copy of police report if applicable',
        required: true
      },
      {
        id: 'insurance_info',
        name: 'Insurance Information',
        description: 'Insurance policy information and correspondence',
        required: true
      },
      {
        id: 'witness_statements',
        name: 'Witness Statements',
        description: 'Statements from any witnesses',
        required: false
      },
      {
        id: 'photos_evidence',
        name: 'Photos and Evidence',
        description: 'Photos of injuries, accident scene, property damage',
        required: false
      }
    ],
    'business law': [
      {
        id: 'business_formation_docs',
        name: 'Business Formation Documents',
        description: 'Articles of incorporation, operating agreements, etc.',
        required: true
      },
      {
        id: 'contracts_agreements',
        name: 'Contracts and Agreements',
        description: 'Relevant business contracts and agreements',
        required: true
      },
      {
        id: 'financial_records',
        name: 'Financial Records',
        description: 'Business financial statements, tax returns',
        required: true
      },
      {
        id: 'correspondence',
        name: 'Correspondence',
        description: 'Relevant emails, letters, and communications',
        required: false
      }
    ]
  };

  const specificDocs = matterSpecificDocuments[matterType.toLowerCase()] || [];
  return [...baseDocuments, ...specificDocs];
}

/**
 * Generate response for document checklist
 */
function generateDocumentResponse(matterType: string, documents: { required: boolean; document_type: string; description: string }[]): string {
  const requiredDocs = documents.filter(doc => doc.required);
  const optionalDocs = documents.filter(doc => !doc.required);

  let response = `I've prepared a document checklist for your ${matterType} case. Here are the documents you'll need:\n\n`;

  if (requiredDocs.length > 0) {
    response += `**Required Documents:**\n`;
    requiredDocs.forEach((doc, index) => {
      response += `${index + 1}. **${doc.document_type}** - ${doc.description}\n`;
    });
  }

  if (optionalDocs.length > 0) {
    response += `\n**Optional Documents (helpful but not required):**\n`;
    optionalDocs.forEach((doc, index) => {
      response += `${index + 1}. **${doc.document_type}** - ${doc.description}\n`;
    });
  }

  response += `\n**Next Steps:**\n`;
  response += `• Gather the required documents first\n`;
  response += `• Organize documents in a logical order\n`;
  response += `• Make copies of important originals\n`;
  response += `• Contact me if you need help obtaining any documents\n\n`;
  response += `Would you like me to help you with any specific document requirements or case preparation?`;

  return response;
}
