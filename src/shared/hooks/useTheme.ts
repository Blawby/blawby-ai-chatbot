import { useState, useEffect, useRef } from 'preact/hooks';

export const useTheme = () => {
 const [isDark, setIsDark] = useState(false);

  const themeOverrideRef = useRef<string | null>(null);
  const savedThemeRef = useRef<string | null>(null);
 
 useEffect(() => {
  // Guard against non-browser environments
  if (typeof window === 'undefined' || typeof document === 'undefined') {
   return;
  }
  

  
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
  savedThemeRef.current = savedTheme;
  
  // Compute initial shouldBeDark
  // Priority: URL override > saved theme > system preference
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
  
  // Helper to get the most up-to-date saved theme
  const getSavedTheme = () => {
   try {
    return localStorage.getItem('theme');
   } catch {
    return null;
   }
  };

  // If no saved theme and no explicit 'light'/'dark' URL override, attach a 'change' listener
  const handleMediaChange = (e: MediaQueryListEvent) => {
   const currentSavedTheme = getSavedTheme();
   // Keep ref in sync
   savedThemeRef.current = currentSavedTheme;
   
   // Only react if no manual override is saved
   if (!currentSavedTheme && !themeOverrideRef.current) {
    setIsDark(e.matches);
    document.documentElement.classList.toggle('dark', e.matches);
   }
  };
  
  mediaQuery.addEventListener('change', handleMediaChange);
  return () => mediaQuery.removeEventListener('change', handleMediaChange);
 }, []);
 
 // Sync DOM with state changes (but don't auto-persist to localStorage)
 useEffect(() => {
  if (typeof document === 'undefined') return;
  
  document.documentElement.classList.toggle('dark', isDark);
 }, [isDark]);
 
 const toggleTheme = () => {
  setIsDark(prev => {
   const next = !prev;
   document.documentElement.classList.toggle('dark', next);
   const themeStr = next ? 'dark' : 'light';
   savedThemeRef.current = themeStr;
   try {
    localStorage.setItem('theme', themeStr);
   } catch (_e) { /* ignore */ }
   return next;
  });
 };

 return { isDark, toggleTheme };
};
