import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { motion, AnimatePresence } from 'framer-motion';
import { SettingsPage } from '@/features/settings/pages/SettingsPage';
import { THEME } from '@/shared/utils/constants';
import { getModalStackCount, lockBodyScroll, unlockBodyScroll } from '@/shared/utils/modalStack';

interface SettingsLayoutProps {
  isMobile?: boolean;
  onClose?: () => void;
  className?: string;
}

export const SettingsLayout = ({
  isMobile = false,
  onClose,
  className = ''
}: SettingsLayoutProps) => {
  const [showSettings, setShowSettings] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClose = useCallback(() => {
    setShowSettings(false);
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    // Delay the onClose callback to allow exit animation to complete
    timeoutRef.current = setTimeout(() => {
      if (onClose) {
        onClose();
      }
      timeoutRef.current = null;
    }, 250); // Match the animation duration
  }, [onClose]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Handle Escape key, body scroll, and click outside for overlay
  useEffect(() => {
    const isModalVisible = showSettings;
    if (!isModalVisible) return;

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && getModalStackCount() <= 1) {
        handleClose();
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (getModalStackCount() > 1) return;
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        handleClose();
      }
    };

    lockBodyScroll();

    document.addEventListener('keydown', handleEscapeKey);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      document.removeEventListener('mousedown', handleClickOutside);
      
      unlockBodyScroll();
    };
  }, [showSettings, handleClose]);

  return (
    <AnimatePresence initial>
      {showSettings && (
        <>
          {/* Backdrop */}
          <motion.div
            key="settings-backdrop"
            className={`fixed inset-0 backdrop-blur-sm ${
              isMobile 
                ? 'bg-black/50' // Darker backdrop for mobile
                : 'bg-black/30' // Slightly darker backdrop for desktop to mask flicker
            }`}
            style={{ zIndex: THEME.zIndex.settings }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={handleClose}
          />
          {/* Settings Panel */}
          <motion.div
            key="settings-panel"
            ref={dropdownRef}
            className={`fixed bg-surface-base overflow-hidden rounded-lg shadow-2xl settings-panel ${
              isMobile 
                ? 'inset-x-0 bottom-0 top-0' // Full screen on mobile
                : 'top-8 left-8 right-8 bottom-8 max-w-4xl mx-auto' // Centered modal on desktop
            } ${className}`}
            style={{ zIndex: THEME.zIndex.settingsContent, willChange: 'transform' }}
            initial={{ y: '100vh' }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ 
              duration: 0.25, 
              ease: [0.25, 0.46, 0.45, 0.94] // iOS-like easing for smooth slide
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-dialog-title"
          >
            <div className="h-full min-h-0 flex flex-col">
              <h1 id="settings-dialog-title" className="sr-only">Settings</h1>
              <SettingsPage 
                isMobile={isMobile}
                onClose={handleClose}
                className="h-full"
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
