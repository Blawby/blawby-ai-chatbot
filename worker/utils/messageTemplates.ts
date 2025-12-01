/**
 * Reusable message templates for consistent communication
 * Provides standardized messaging across all legal intake flows
 */

/**
 * Escape markdown special characters
 */
function escapeMD(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&');
}

/**
 * Format USD currency with proper locale formatting
 */
function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
}

export interface MatterSummaryData {
  name: string;
  email: string;
  phone: string;
  location: string;
  opposingParty?: string;
  matterType: string;
  description: string;
  urgency: string;
  pdfFilename?: string;
  missingInfo?: string[];
}

/**
 * Generate a professional matter summary message
 */
export function generateMatterSummaryMessage(data: MatterSummaryData): string {
  const { name, email, phone, location, opposingParty, matterType, description, urgency } = data;
  
  let message = `Here's a summary of your matter:\n\n`;
  
  // Client Information Section
  message += `**Client Information:**\n`;
  message += `• Name: ${name}\n`;
  message += `• Contact: ${phone}, ${email}, ${location}\n`;
  if (opposingParty) {
    message += `• Opposing Party: ${opposingParty}\n`;
  }
  message += `\n`;
  
  // Matter Details Section
  message += `**Matter Details:**\n`;
  message += `• Type: ${matterType}\n`;
  message += `• Description: ${description}\n`;
  message += `• Urgency: ${urgency}\n`;
  message += `\n`;
  
  return message;
}

/**
 * Generate submission confirmation message
 */
export function generateSubmissionMessage(): string {
  return `I'll submit this to our legal organization for review. A lawyer will contact you within 24 hours to discuss your case.`;
}

/**
 * Generate PDF generation message
 */
export function generatePDFMessage(pdfFilename: string): string {
  return `I've generated a case summary PDF (${pdfFilename}) you can download or share when you're ready.`;
}

/**
 * Generate notification confirmation message
 */
export function generateNotificationMessage(): string {
  return `Your full submission has already been sent to our legal organization for review.`;
}

/**
 * Generate missing information message
 */
export function generateMissingInfoMessage(missingInfo: string[]): string {
  if (missingInfo.length === 0) {
    return '';
  }
  
  let message = `**Missing Information**\n`;
  message += `To strengthen your matter, consider providing:\n\n`;
  message += missingInfo.map(info => `• ${info}`).join('\n');
  message += `\n\nYou can provide this information by continuing our conversation. The more details you share, the better we can assist you.`;
  
  return message;
}

/**
 * Generate complete matter summary with all sections
 */
export function generateCompleteMatterMessage(data: MatterSummaryData): string {
  let message = generateMatterSummaryMessage(data);
  
  // Add submission message
  message += generateSubmissionMessage();
  
  // Add PDF message if available
  if (data.pdfFilename) {
    message += `\n\n${generatePDFMessage(data.pdfFilename)}`;
  }
  
  // Add notification message
  message += `\n\n${generateNotificationMessage()}`;
  
  // Add missing information if any
  if (data.missingInfo && data.missingInfo.length > 0) {
    message += `\n\n${generateMissingInfoMessage(data.missingInfo)}`;
  }
  
  return message;
}
