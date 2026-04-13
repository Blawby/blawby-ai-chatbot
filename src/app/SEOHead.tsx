import { useEffect } from 'preact/hooks';
import type { UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';

interface SEOHeadProps {
 practiceConfig?: UIPracticeConfig;
 pageTitle?: string;
 pageDescription?: string;
 pageImage?: string;
 currentUrl?: string;
}


/**
 * Generates a safe, SEO-friendly page title with proper fallbacks.
 */
function generatePageTitle(
 pageTitle?: string,
 practiceConfig?: UIPracticeConfig
): string {
 // If explicit page title is provided, use it
 if (pageTitle) {
  return `${pageTitle.trim()} - AI Legal Assistant`;
 }
 
 // Priority 1: Use practice name if available
 if (practiceConfig?.name) {
  const practiceName = practiceConfig.name.trim();
  return `${practiceName} - AI Legal Assistant`;
 }
 
 // Fallback: Default title
 return 'Blawby AI - Intelligent Legal Assistant & Chat Interface';
}

export function SEOHead({ 
 practiceConfig, 
 pageTitle, 
 pageDescription, 
 pageImage, 
 currentUrl 
}: SEOHeadProps) {
 
 useEffect(() => {
  // Update document title
  const title = generatePageTitle(pageTitle, practiceConfig);
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
   (practiceConfig?.description || 'Get instant legal guidance, document analysis, and matter creation with Blawby\'s AI-powered legal assistant. Available nationwide for legal professionals and individuals seeking legal information.'));
  updateMetaTag('og:url', currentUrl || window.location.href);
  updateMetaTag('og:image', pageImage || 
   (practiceConfig?.profileImage || '/team-profile-demo.png'));
  // Use practice name for og:site_name, fallback to default site name
  const siteName = practiceConfig?.name 
   ? practiceConfig.name.trim()
   : 'Blawby AI';
  updateMetaTag('og:site_name', siteName);

  // Update Twitter tags
  updateMetaName('twitter:title', title);
  updateMetaName('twitter:description', pageDescription || 
   (practiceConfig?.description || 'Get instant legal guidance, document analysis, and matter creation with Blawby\'s AI-powered legal assistant. Available nationwide for legal professionals and individuals seeking legal information.'));
  updateMetaName('twitter:image', pageImage || 
   (practiceConfig?.profileImage || 'https://ai.blawby.com/organization-profile-demo.png'));

  // Update standard meta tags
  updateMetaName('description', pageDescription || 
   (practiceConfig?.description || 'Get instant legal guidance, document analysis, and matter creation with Blawby\'s AI-powered legal assistant. Available nationwide for legal professionals and individuals seeking legal information.'));

  // Update canonical URL
  let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
  if (!canonical) {
   canonical = document.createElement('link');
   canonical.setAttribute('rel', 'canonical');
   document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', currentUrl || window.location.href);

 }, [practiceConfig, pageTitle, pageDescription, pageImage, currentUrl]);

 return null; // This component doesn't render anything
}
