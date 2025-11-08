import { useContext } from 'preact/hooks';
import { ActiveOrganizationContext } from '../contexts/ActiveOrganizationContext';

export function useActiveOrganization() {
  const ctx = useContext(ActiveOrganizationContext);
  if (!ctx) {
    throw new Error('useActiveOrganization must be used within ActiveOrganizationProvider');
  }
  return ctx;
}
