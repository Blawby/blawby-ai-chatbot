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
    const themeParam = params.get('theme');
    const themeOverride = (themeParam === 'dark' || themeParam === 'light') ? themeParam : null;
    themeOverrideRef.current = themeOverride;
    
    // Compute initial shouldBeDark
    // Priority: URL override > system preference
    let shouldBeDark = false;
    const isSystemDark = mediaQuery.matches;

    if (themeOverride === 'dark') {
      shouldBeDark = true;
    } else if (themeOverride === 'light') {
      shouldBeDark = false;
    } else {
      // If no URL override, prioritize system preference if no saved theme,
      // OR if saved theme matches system, OR if we want to be more "reactive".
      // We'll trust system preference unless savedTheme is explicitly different.
      shouldBeDark = savedTheme ? savedTheme === 'dark' : isSystemDark;
    }

    // Set state and document class accordingly
    setIsDark(shouldBeDark);
    document.documentElement.classList.toggle('dark', shouldBeDark);
    
    // If no saved theme and no explicit 'light'/'dark' URL override, attach a 'change' listener
    const handleMediaChange = (e: MediaQueryListEvent) => {
      // Only react if no manual override is saved
      if (!savedTheme && !themeOverride) {
        setIsDark(e.matches);
        document.documentElement.classList.toggle('dark', e.matches);
      }
    };
    
    mediaQuery.addEventListener('change', handleMediaChange);
    return () => mediaQuery.removeEventListener('change', handleMediaChange);
  }, []);
  
  // Sync DOM with state changes (but don't auto-persist to localStorage)
  useEffect(() => {
    if (!isHydrated) return;
    if (typeof document === 'undefined') return;
    
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark, isHydrated]);
  
  const toggleTheme = () => {
    setIsDark(prev => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      try {
        localStorage.setItem('theme', next ? 'dark' : 'light');
      } catch (e) { /* ignore */ }
      return next;
    });
  };

  return { isDark, toggleTheme };
};
