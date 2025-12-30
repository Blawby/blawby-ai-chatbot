import type { LawyerProfile } from '../../../worker/schemas/lawyer';

/**
 * Safely opens a URL in a new window/tab with security attributes
 */
export function safeOpenUrl(url: string, target: '_blank' | '_self' = '_blank'): void {
  try {
    const urlWithProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const parsed = new URL(urlWithProtocol);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      if (target === '_blank') {
        globalThis.open(parsed.toString(), '_blank', 'noopener,noreferrer');
      } else {
        globalThis.open(parsed.toString(), '_self');
      }
    }
  } catch {
    // Invalid URL, ignore
  }
}

/**
 * Options for handling lawyer contact
 */
export interface ContactLawyerOptions {
  /**
   * Callback to show info messages (e.g., toast notifications)
   */
  showInfo?: (title: string, message: string) => void;
  /**
   * Whether to open website URLs in a new tab (default: true)
   */
  openWebsiteInNewTab?: boolean;
}

/**
 * Handles contact action for a lawyer profile.
 * Attempts to contact via phone, email, website, or shows a fallback message.
 * 
 * @param lawyer - The lawyer profile to contact
 * @param options - Optional configuration for contact handling
 */
export function handleContactLawyer(
  lawyer: LawyerProfile,
  options: ContactLawyerOptions = {}
): void {
  const { showInfo, openWebsiteInNewTab = true } = options;

  if (lawyer.phone) {
    globalThis.open(`tel:${lawyer.phone}`, '_self');
  } else if (lawyer.email) {
    globalThis.open(`mailto:${lawyer.email}?subject=Legal Consultation Request`, '_self');
  } else if (lawyer.website) {
    if (openWebsiteInNewTab) {
      safeOpenUrl(lawyer.website, '_blank');
    } else {
      safeOpenUrl(lawyer.website, '_self');
    }
  } else {
    const fallbackMessage = `Contact ${lawyer.name} at ${lawyer.firm || 'their firm'} for a consultation.`;
    if (showInfo) {
      showInfo('Contact Information', fallbackMessage);
    } else {
      // Fallback to console if no showInfo callback provided
      console.info('Contact Information:', fallbackMessage);
    }
  }
}

