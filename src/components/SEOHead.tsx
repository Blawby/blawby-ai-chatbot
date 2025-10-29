import { useEffect } from 'preact/hooks';
import type { UIOrganizationConfig } from '../hooks/useOrganizationConfig';

interface SEOHeadProps {
  organizationConfig?: UIOrganizationConfig;
  pageTitle?: string;
  pageDescription?: string;
  pageImage?: string;
  currentUrl?: string;
}

/**
 * Truncates text to a maximum length while preserving word boundaries.
 * If truncation occurs mid-word, cuts back to the last space.
 */
function truncateToWordBoundary(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) {
    return text;
  }
  
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  
  // Find the last space before maxLength
  const truncated = trimmed.substring(0, maxLength);
  const lastSpaceIndex = truncated.lastIndexOf(' ');
  
  // Minimum allowed length to avoid extremely short truncations
  const MINIMUM_ALLOWED = 10;
  
  // If we found a space and it's not below the minimum threshold, use it
  // This preserves word boundaries whenever possible
  if (lastSpaceIndex !== -1 && lastSpaceIndex >= MINIMUM_ALLOWED) {
    return truncated.substring(0, lastSpaceIndex).trim();
  }
  
  // Fallback: just truncate at maxLength (word might be longer than maxLength)
  return truncated.trim();
}

/**
 * Generates a safe, SEO-friendly page title with proper fallbacks.
 */
function generatePageTitle(
  pageTitle?: string,
  organizationConfig?: UIOrganizationConfig
): string {
  // If explicit page title is provided, use it
  if (pageTitle) {
    return `${pageTitle.trim()} - AI Legal Assistant`;
  }
  
  // Priority 1: Use organization name if available
  if (organizationConfig?.name) {
    const orgName = organizationConfig.name.trim();
    return `${orgName} - AI Legal Assistant`;
  }
  
  // Priority 2: Use introMessage with word-aware truncation
  if (organizationConfig?.introMessage) {
    const truncated = truncateToWordBoundary(organizationConfig.introMessage, 50);
    return `${truncated} - AI Legal Assistant`;
  }
  
  // Fallback: Default title
  return 'Blawby AI - Intelligent Legal Assistant & Chat Interface';
}

export function SEOHead({ 
  organizationConfig, 
  pageTitle, 
  pageDescription, 
  pageImage, 
  currentUrl 
}: SEOHeadProps) {
  
  useEffect(() => {
    // Update document title
    const title = generatePageTitle(pageTitle, organizationConfig);
    document.title = title;

    // Update meta tags dynamically
    const updateMetaTag = (property: string, content: string) => {
      let meta = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement;
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('property', property);
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', content);
    };

    const updateMetaName = (name: string, content: string) => {
      let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement;
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', name);
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', content);
    };

    // Update Open Graph tags
    updateMetaTag('og:title', title);
    updateMetaTag('og:description', pageDescription || 
      (organizationConfig?.description || 'Get instant legal guidance, document analysis, and matter creation with Blawby\'s AI-powered legal assistant. Available nationwide for legal professionals and individuals seeking legal information.'));
    updateMetaTag('og:url', currentUrl || window.location.href);
    updateMetaTag('og:image', pageImage || 
      (organizationConfig?.profileImage || 'https://ai.blawby.com/organization-profile-demo.png'));
    // Use organization name for og:site_name, fallback to default site name
    const siteName = organizationConfig?.name 
      ? organizationConfig.name.trim()
      : 'Blawby AI';
    updateMetaTag('og:site_name', siteName);

    // Update Twitter tags
    updateMetaName('twitter:title', title);
    updateMetaName('twitter:description', pageDescription || 
      (organizationConfig?.description || 'Get instant legal guidance, document analysis, and matter creation with Blawby\'s AI-powered legal assistant. Available nationwide for legal professionals and individuals seeking legal information.'));
    updateMetaName('twitter:image', pageImage || 
      (organizationConfig?.profileImage || 'https://ai.blawby.com/organization-profile-demo.png'));

    // Update standard meta tags
    updateMetaName('description', pageDescription || 
      (organizationConfig?.description || 'Get instant legal guidance, document analysis, and matter creation with Blawby\'s AI-powered legal assistant. Available nationwide for legal professionals and individuals seeking legal information.'));

    // Update canonical URL
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', currentUrl || window.location.href);

  }, [organizationConfig, pageTitle, pageDescription, pageImage, currentUrl]);

  return null; // This component doesn't render anything
}
