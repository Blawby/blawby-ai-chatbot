/**
 * IntakeUrlDisplay - Molecule Component
 * 
 * URL card with copy functionality.
 * Handles intake URL display and interaction.
 */

import { InfoCard } from '../atoms/InfoCard';
import { Button } from '../../ui/Button';
import { cn } from '../../../utils/cn';
import { useEffect, useRef, useState } from 'preact/hooks';

interface IntakeUrlDisplayProps {
  url: string;
  onCopy?: (url: string) => void;
  className?: string;
}

export const IntakeUrlDisplay = ({
  url,
  onCopy,
  className = ''
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
      icon="🔗"
      title="Your intake page URL"
      className={className}
    >
      <div className="space-y-3">
        <p className="font-mono text-sm break-all">
          {url}
        </p>
        
        <Button
          variant="secondary"
          size="sm"
          onClick={handleCopy}
          className="w-full"
        >
          {copied ? 'Copied!' : 'Copy URL'}
        </Button>
        
        <p className="text-xs text-blue-700 dark:text-blue-300">
          After launching, share this link on your website, in emails, or on social media to start collecting client intake.
        </p>
      </div>
    </InfoCard>
  );
};
