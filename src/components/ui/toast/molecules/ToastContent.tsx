/**
 * ToastContent - Molecule Component
 * 
 * Combines ToastIcon, ToastTitle, ToastMessage, and CloseButton.
 * Handles layout and spacing for toast content.
 */

import { ComponentChildren } from 'preact';
import { ToastIcon, ToastType } from '../atoms/ToastIcon';
import { ToastTitle } from '../atoms/ToastTitle';
import { ToastMessage } from '../atoms/ToastMessage';
import { CloseButton } from '../atoms/CloseButton';
import { cn } from '../../../../utils/cn';

interface ToastContentProps {
  type: ToastType;
  title: string;
  message?: string;
  onClose: () => void;
  className?: string;
}

export const ToastContent = ({ 
  type, 
  title, 
  message, 
  onClose,
  className 
}: ToastContentProps) => {
  return (
    <div className={cn('flex items-start', className)}>
      <ToastIcon type={type} />
      
      <div className="ml-3 flex-1">
        <ToastTitle>{title}</ToastTitle>
        {message && <ToastMessage>{message}</ToastMessage>}
      </div>
      
      <div className="ml-4 flex-shrink-0">
        <CloseButton onClick={onClose} />
      </div>
    </div>
  );
};
