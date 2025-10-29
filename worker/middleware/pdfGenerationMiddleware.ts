import type { ConversationContext } from './conversationContextManager.js';
import type { OrganizationConfig } from '../services/OrganizationService.js';
import type { PipelineMiddleware } from './pipeline.js';
import type { Env, AgentMessage } from '../types.js';
import { PDFGenerationService } from '../services/PDFGenerationService.js';

/**
 * PDF Generation Middleware - handles requests to generate PDF case summaries
 * Detects when users want to generate PDFs from their case drafts
 */
export const pdfGenerationMiddleware: PipelineMiddleware = {
  kind: 'standard',
  name: 'pdfGenerationMiddleware',
  
  execute: async (messages: AgentMessage[], context: ConversationContext, organizationConfig: OrganizationConfig, env: Env) => {
    // Guard against empty messages array
    if (!messages || messages.length === 0) {
      return { context };
    }

    const latestMessage = messages[messages.length - 1];
    // Check if user is requesting PDF generation
    const pdfKeywords = [
      'generate pdf',
      'create pdf',
      'download pdf',
      'export pdf',
      'pdf summary',
      'case summary pdf',
      'print case summary',
      'save as pdf',
      'get pdf',
      'pdf document',
      'case report',
      'generate report',
      'create report',
      'download case summary',
      'export case summary',
      'i want to generate a pdf',
      'can you generate a pdf',
      'please generate a pdf',
      'generate a pdf case summary',
      'create a pdf case summary'
    ];

    const isPDFRequest = pdfKeywords.some(keyword => 
      latestMessage.content.toLowerCase().includes(keyword.toLowerCase())
    );

    if (!isPDFRequest) {
      return { context };
    }

    // Check if we have a case draft to generate PDF from
    if (!context.caseDraft) {
      const response = `I'd be happy to help you generate a PDF case summary! However, I don't see a case draft in our conversation yet. 

**To generate a PDF, please first:**
• Build a case draft with your case information
• Provide details about your legal matter
• Share key facts and timeline

Once we have your case information organized, I can generate a professional PDF summary that you can share with attorneys or keep for your records.

Would you like me to help you build a case draft first?`;

      return {
        context,
        response,
        shouldStop: true
      };
    }

    // Generate PDF from existing case draft
    try {
      const pdfResult = await PDFGenerationService.generateCaseSummaryPDF({
        caseDraft: {
          ...context.caseDraft,
          jurisdiction: context.caseDraft.jurisdiction || 'Unknown',
          urgency: context.caseDraft.urgency || 'normal'
        },
        clientName: context.contactInfo?.name,
        organizationName: organizationConfig?.name || 'Legal Services',
        organizationBrandColor: organizationConfig?.brandColor || '#334e68'
      }, env);

      if (pdfResult.success && pdfResult.pdfBuffer) {
        const filename = PDFGenerationService.generateFilename({
          ...context.caseDraft,
          jurisdiction: context.caseDraft.jurisdiction || 'Unknown',
          urgency: context.caseDraft.urgency || 'normal'
        }, context.contactInfo?.name);
        
        // Update context with PDF information
        const updatedContext = {
          ...context,
          generatedPDF: {
            filename,
            size: pdfResult.pdfBuffer.byteLength,
            generatedAt: new Date().toISOString(),
            matterType: context.caseDraft.matter_type
          },
          lastUpdated: Date.now()
        };

        const response = `PDF Generated Successfully

Your case summary is ready for download. You can view and download your PDF in the Matter tab.`;

        return {
          context: updatedContext,
          response,
          shouldStop: true
        };

      } else {
        const response = `I encountered an issue generating your PDF case summary. ${pdfResult.error || 'Please try again later.'}

**Alternative options:**
• I can help you organize your case information again
• You can request a new case draft
• Contact support if the issue persists

Would you like me to help you rebuild your case draft?`;

        return {
          context,
          response,
          shouldStop: true
        };
      }

    } catch (error) {
      console.error('PDF generation error:', error);
      
      const response = `I'm sorry, but I encountered an error while generating your PDF case summary. 

**What happened:**
• PDF generation service is temporarily unavailable
• This might be due to high demand or maintenance

**What you can do:**
• Try again in a few minutes
• I can help you rebuild your case draft
• Contact support if the issue persists

Would you like me to help you organize your case information again?`;

      return {
        context,
        response,
        shouldStop: true
      };
    }
  }
};
