/**
 * useMobileDetection - Shared Hook
 * 
 * Extracts duplicate mobile detection logic from sidebar and profile components.
 * Provides debounced resize handling and single source of truth for mobile state.
 */

import { useState, useLayoutEffect } from 'preact/hooks';
import { debounce } from '@/shared/utils/debounce';

export const useMobileDetection = () => {
  const [isMobile, setIsMobile] = useState(false);

  useLayoutEffect(() => {
    // Function to check if mobile
    const checkIsMobile = () => {
      return window.innerWidth < 1024;
    };

    // Set initial mobile state
    setIsMobile(checkIsMobile());

    // Create debounced resize handler for performance
    const debouncedResizeHandler = debounce(() => {
      setIsMobile(checkIsMobile());
    }, 100);

    // Add resize listener
    window.addEventListener('resize', debouncedResizeHandler);

    // Cleanup function
    return () => {
      window.removeEventListener('resize', debouncedResizeHandler);
      debouncedResizeHandler.cancel();
    };
  }, []);

  return isMobile;
};
