import { useState, useEffect, useRef } from 'preact/hooks';

export const useTheme = () => {
  const [isDark, setIsDark] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const themeOverrideRef = useRef<string | null>(null);
  
  useEffect(() => {
    // Guard against non-browser environments
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    
    // Mark as hydrated after first render
    setIsHydrated(true);
    
    // Safely read localStorage to determine if a saved theme exists
    let savedTheme: string | null = null;
    try {
      savedTheme = localStorage.getItem('theme');
    } catch (error) {
      console.warn('Failed to read theme from localStorage:', error);
    }
    
    // Create matchMedia query object for system preference
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    // Check for theme override in URL
    const params = new URLSearchParams(window.location.search);
    const themeOverride = params.get('theme');
    themeOverrideRef.current = themeOverride;
    
    // Compute initial shouldBeDark using override, savedTheme, or media query
    const shouldBeDark = themeOverride === 'dark' || 
                        (themeOverride !== 'light' && (savedTheme === 'dark' || (!savedTheme && mediaQuery.matches)));
    
    // Set state and document class accordingly
    setIsDark(shouldBeDark);
    document.documentElement.classList.toggle('dark', shouldBeDark);
    
    // If no saved theme and no explicit 'light'/'dark' URL override, attach a 'change' listener
    if (!savedTheme && !['light', 'dark'].includes(themeOverride || '')) {
      const handleMediaChange = (e: MediaQueryListEvent) => {
        setIsDark(e.matches);
        document.documentElement.classList.toggle('dark', e.matches);
      };
      
      // Add listener for system theme changes
      mediaQuery.addEventListener('change', handleMediaChange);
      
      // Return cleanup function that removes the listener
      return () => {
        mediaQuery.removeEventListener('change', handleMediaChange);
      };
    }
  }, []);
  
  // Sync DOM and localStorage with state changes
  useEffect(() => {
    if (!isHydrated) return; // Don't sync during SSR
    
    // Guard against non-browser environments
    if (typeof document === 'undefined') return;
    
    document.documentElement.classList.toggle('dark', isDark);
    
    // Skip persistence if a theme override is present in the URL
    if (themeOverrideRef.current) return;

    try {
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    } catch (error) {
      // Best-effort localStorage persistence
      console.warn('Failed to persist theme to localStorage:', error);
    }
  }, [isDark, isHydrated]);
  
  const toggleTheme = () => {
    setIsDark(prev => !prev);
  };

  return { isDark, toggleTheme };
};
