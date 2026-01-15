import { useNotificationStoreState } from '@/features/notifications/hooks/useNotifications';

export const useNotificationStream = () => {
  const state = useNotificationStoreState();

  return {
    status: state.streamStatus,
    lastEventAt: state.lastEventAt
  };
};
