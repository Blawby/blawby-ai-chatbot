import {
  useNotificationStoreState
} from '@/features/notifications/hooks/useNotifications';

export const useNotificationCounts = () => {
  const state = useNotificationStoreState();

  return {
    unreadByCategory: state.unreadCounts,
    conversationUnreadCounts: state.conversationUnreadCounts,
    streamStatus: state.streamStatus
  };
};
