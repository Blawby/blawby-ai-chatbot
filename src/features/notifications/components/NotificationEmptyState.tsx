import {
  ChatBubbleLeftRightIcon,
  ShieldCheckIcon,
  CreditCardIcon,
  ClipboardDocumentCheckIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';
import type { NotificationCategory } from '@/features/notifications/types';

const EMPTY_STATE_CONFIG: Record<NotificationCategory, { title: string; description: string; icon: typeof ChatBubbleLeftRightIcon }> = {
  message: {
    title: 'No new messages',
    description: 'Message alerts will appear here when clients reach out.',
    icon: ChatBubbleLeftRightIcon
  },
  system: {
    title: 'All clear',
    description: 'System updates and Blawby notices will show up here.',
    icon: ShieldCheckIcon
  },
  payment: {
    title: 'Payments look good',
    description: 'Payment updates will land here as they happen.',
    icon: CreditCardIcon
  },
  intake: {
    title: 'No intake updates',
    description: 'Client intake progress will show up in this feed.',
    icon: ClipboardDocumentCheckIcon
  },
  matter: {
    title: 'Nothing new on matters',
    description: 'Matter updates will appear here when statuses change.',
    icon: DocumentTextIcon
  }
};

interface NotificationEmptyStateProps {
  category: NotificationCategory;
}

export const NotificationEmptyState = ({ category }: NotificationEmptyStateProps) => {
  const config = EMPTY_STATE_CONFIG[category];
  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-gray-500 dark:text-gray-400">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{config.title}</p>
      <p className="max-w-xs text-xs">{config.description}</p>
    </div>
  );
};
