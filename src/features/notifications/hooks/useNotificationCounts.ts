import { useRef } from 'preact/hooks';
import {
  refreshUnreadCounts,
  refreshConversationCounts,
  useNotificationStoreState
} from '@/features/notifications/hooks/useNotifications';

let countsRequested = false;

export const useNotificationCounts = () => {
  const state = useNotificationStoreState();
  const localRefreshRef = useRef(false);

  if (!countsRequested && !localRefreshRef.current) {
    countsRequested = true;
    localRefreshRef.current = true;
    void refreshUnreadCounts();
    void refreshConversationCounts();
  }

  return {
    unreadByCategory: state.unreadCounts,
    conversationUnreadCounts: state.conversationUnreadCounts,
    streamStatus: state.streamStatus
  };
};
