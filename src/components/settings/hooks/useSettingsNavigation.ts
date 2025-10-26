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
  navigateToOrganization: () => void;
  navigateToLegal: () => void;
  navigateToSupport: () => void;
  goBack: () => void;
}

export const useSettingsNavigation = (): UseSettingsNavigationReturn => {
  const location = useLocation();
  const { navigate } = useNavigation();
  
  // Derive currentPath from the actual router state
  const currentPath = location.path;

  const navigateToSettings = useCallback((path: string = '/app/settings') => {
    navigate(path);
  }, [navigate]);

  const navigateToAccount = useCallback(() => {
    navigateToSettings('/app/settings/account');
  }, [navigateToSettings]);


  const navigateToNotifications = useCallback(() => {
    navigateToSettings('/app/settings/notifications');
  }, [navigateToSettings]);

  const navigateToSecurity = useCallback(() => {
    navigateToSettings('/app/settings/security');
  }, [navigateToSettings]);

  const navigateToHelp = useCallback(() => {
    navigateToSettings('/app/settings/help');
  }, [navigateToSettings]);

  const navigateToOrganization = useCallback(() => {
    navigateToSettings('/app/settings/organization');
  }, [navigateToSettings]);

  const navigateToLegal = useCallback(() => {
    navigateToSettings('/app/settings/legal');
  }, [navigateToSettings]);

  const navigateToSupport = useCallback(() => {
    navigateToSettings('/app/settings/support');
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
      navigate('/app/messages');
    }
  }, [location.path, navigate]);

  return {
    currentPath,
    navigateToSettings,
    navigateToAccount,
    navigateToNotifications,
    navigateToSecurity,
    navigateToHelp,
    navigateToOrganization,
    navigateToLegal,
    navigateToSupport,
    goBack
  };
};
