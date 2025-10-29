import { useEffect } from 'preact/hooks';
import type { OrganizationConfig } from '../../worker/types';

interface SEOHeadProps {
  organizationConfig?: OrganizationConfig;
  pageTitle?: string;
  pageDescription?: string;
  pageImage?: string;
  currentUrl?: string;
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
    const title = pageTitle || 
      (organizationConfig?.introMessage ? `${organizationConfig.introMessage.substring(0, 50)} - AI Legal Assistant` : 'Blawby AI - Intelligent Legal Assistant & Chat Interface');
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
    updateMetaTag('og:site_name', organizationConfig?.introMessage?.substring(0, 30) || 'Blawby AI');

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
