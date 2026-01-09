/**
 * IntakeUrlDisplay - Molecule Component
 * 
 * URL card with copy functionality.
 * Handles intake URL display and interaction.
 */

import { InfoCard } from './InfoCard';
import { Button } from '@/shared/ui/Button';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';

interface IntakeUrlDisplayProps {
  url: string;
  onCopy?: (url: string) => void;
  className?: string;
  title?: string;
  description?: string;
  icon?: string;
}

export const IntakeUrlDisplay = ({
  url,
  onCopy,
  className = '',
  title = 'Your intake page URL',
  description = 'After launching, share this link on your website, in emails, or on social media to start collecting client intake.',
  icon = '🔗'
}: IntakeUrlDisplayProps) => {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      onCopy?.(url);
      
      // Reset copied state after 2 seconds
      if (resetTimerRef.current !== null) {
        clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        resetTimerRef.current = null;
      }, 2000);
    } catch (error) {
      console.error('Failed to copy URL:', error);
    }
  };

  const handleKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      void handleCopy();
    }
  };

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };
  }, []);

  return (
    <InfoCard
      variant="blue"
      size="md"
      icon={icon}
      title={title}
      className={className}
    >
      <div className="space-y-3">
        <div
          className="font-mono text-sm break-all select-text bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-md px-3 py-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400/60"
          role="button"
          tabIndex={0}
          aria-label="Copy intake page URL"
          onClick={handleCopy}
          onKeyDown={handleKeyDown}
        >
          {url}
        </div>
        
        <Button
          variant="secondary"
          size="sm"
          onClick={handleCopy}
          className="w-full"
        >
          {copied ? 'Copied!' : 'Copy URL'}
        </Button>
        
        <p className="text-xs text-blue-700 dark:text-blue-300">
          {description}
        </p>
      </div>
    </InfoCard>
  );
};
