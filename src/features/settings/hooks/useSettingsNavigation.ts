import { useCallback } from 'preact/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import { useLocation } from 'preact-iso';
import { buildSettingsPath, resolveSettingsBasePath } from '@/shared/utils/workspace';

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
  const settingsBasePath = resolveSettingsBasePath(location.path);

  const navigateToSettings = useCallback((path: string = settingsBasePath) => {
    navigate(path);
  }, [navigate, settingsBasePath]);

  const navigateToAccount = useCallback(() => {
    navigateToSettings(buildSettingsPath(settingsBasePath, 'account'));
  }, [navigateToSettings, settingsBasePath]);


  const navigateToNotifications = useCallback(() => {
    navigateToSettings(buildSettingsPath(settingsBasePath, 'notifications'));
  }, [navigateToSettings, settingsBasePath]);

  const navigateToSecurity = useCallback(() => {
    navigateToSettings(buildSettingsPath(settingsBasePath, 'security'));
  }, [navigateToSettings, settingsBasePath]);

  const navigateToHelp = useCallback(() => {
    navigateToSettings(buildSettingsPath(settingsBasePath, 'help'));
  }, [navigateToSettings, settingsBasePath]);

  const navigateToPractice = useCallback(() => {
    navigateToSettings(buildSettingsPath(settingsBasePath, 'practice'));
  }, [navigateToSettings, settingsBasePath]);

  const navigateToLegal = useCallback(() => {
    navigateToSettings(buildSettingsPath(settingsBasePath, 'legal'));
  }, [navigateToSettings, settingsBasePath]);

  const navigateToSupport = useCallback(() => {
    navigateToSettings(buildSettingsPath(settingsBasePath, 'support'));
  }, [navigateToSettings, settingsBasePath]);

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
