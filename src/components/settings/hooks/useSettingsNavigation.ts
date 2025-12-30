import { useCallback } from 'preact/hooks';
import { useNavigation } from '../../../utils/navigation';
import { useLocation } from 'preact-iso';

export interface UseSettingsNavigationReturn {
  currentPath: string;
  navigateToSettings: (path?: string) => void;
  navigateToAccount: () => void;
  navigateToNotifications: () => void;
  navigateToSecurity: () => void;
  navigateToHelp: () => void;
  navigateToPractice: () => void;
  navigateToLegal: () => void;
  navigateToSupport: () => void;
  goBack: () => void;
}

export const useSettingsNavigation = (): UseSettingsNavigationReturn => {
  const location = useLocation();
  const { navigate } = useNavigation();
  
  // Derive currentPath from the actual router state
  const currentPath = location.path;

  const navigateToSettings = useCallback((path: string = '/settings') => {
    navigate(path);
  }, [navigate]);

  const navigateToAccount = useCallback(() => {
    navigateToSettings('/settings/account');
  }, [navigateToSettings]);


  const navigateToNotifications = useCallback(() => {
    navigateToSettings('/settings/notifications');
  }, [navigateToSettings]);

  const navigateToSecurity = useCallback(() => {
    navigateToSettings('/settings/security');
  }, [navigateToSettings]);

  const navigateToHelp = useCallback(() => {
    navigateToSettings('/settings/help');
  }, [navigateToSettings]);

  const navigateToPractice = useCallback(() => {
    navigateToSettings('/settings/practice');
  }, [navigateToSettings]);

  const navigateToLegal = useCallback(() => {
    navigateToSettings('/settings/legal');
  }, [navigateToSettings]);

  const navigateToSupport = useCallback(() => {
    navigateToSettings('/settings/support');
  }, [navigateToSettings]);

  const goBack = useCallback(() => {
    // Try to use browser history back navigation first
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    
    // Fallback: compute parent path when history is insufficient
    const currentPath = location.path;
    const pathSegments = currentPath.split('/').filter(Boolean);
    
    // Remove the last path segment to get parent path
    if (pathSegments.length > 1) {
      const parentPath = `/${pathSegments.slice(0, -1).join('/')}`;
      navigate(parentPath);
    } else {
      // If we're at root level, navigate to home
      navigate('/');
    }
  }, [location.path, navigate]);

  return {
    currentPath,
    navigateToSettings,
    navigateToAccount,
    navigateToNotifications,
    navigateToSecurity,
    navigateToHelp,
    navigateToPractice,
    navigateToLegal,
    navigateToSupport,
    goBack
  };
};
