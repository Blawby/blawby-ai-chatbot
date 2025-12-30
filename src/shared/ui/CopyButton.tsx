import { useState, useRef, useEffect } from 'preact/hooks';
import { ClipboardIcon } from '@heroicons/react/24/outline';
import { Button } from './Button';
import { useToastContext } from '@/shared/contexts/ToastContext';

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export const CopyButton = ({ text, label, className = '', disabled = false }: CopyButtonProps) => {
  const { showSuccess, showError } = useToastContext();
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);
  
  const handleCopy = async () => {
    if (disabled) return;
    
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      showSuccess('Copied!', label || text);
      
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      // Set timeout to reset copied state
      timeoutRef.current = setTimeout(() => {
        setCopied(false);
        timeoutRef.current = null;
      }, 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      showError('Failed to copy to clipboard', error instanceof Error ? error.message : 'Unknown error');
    }
  };
  
  return (
    <Button 
      variant="icon" 
      size="sm" 
      onClick={handleCopy} 
      disabled={disabled}
      aria-label={copied ? 'Copied!' : 'Copy to clipboard'}
      className={className}
    >
      <ClipboardIcon className="w-4 h-4" />
      {copied ? 'Copied!' : (label || 'Copy')}
    </Button>
  );
};
