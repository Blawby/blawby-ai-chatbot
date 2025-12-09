import { useState, useMemo } from 'preact/hooks';
import { useSessionContext } from '../../../contexts/SessionContext';
import { useInbox, type InboxFilters } from '../../../hooks/useInbox';
import { useToastContext } from '../../../contexts/ToastContext';
import { 
  EnvelopeIcon, 
  UserIcon, 
  TagIcon,
  ClockIcon,
  CheckCircleIcon,
  ArchiveBoxIcon,
  XCircleIcon,
  FunnelIcon
} from '@heroicons/react/24/outline';
import { Button } from '../../ui/Button';
import { cn } from '../../../utils/cn';
// Format relative time (e.g., "2 hours ago", "3 days ago")
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}

interface InboxPageProps {
  className?: string;
}

export const InboxPage = ({ className = '' }: InboxPageProps) => {
  const { activePracticeId } = useSessionContext();
  const { showError } = useToastContext();
  
  const [filters, setFilters] = useState<InboxFilters>({
    status: 'active',
  });
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  const {
    conversations,
    stats,
    total,
    isLoading,
    error,
    refresh,
    assignConversation,
    updateConversation,
  } = useInbox({
    practiceId: activePracticeId || '',
    filters,
    limit: 50,
    autoRefresh: true,
    refreshInterval: 30000,
    onError: (err) => showError(err),
  });

  const selectedConversation = useMemo(() => {
    if (!selectedConversationId) return null;
    return conversations.find(c => c.id === selectedConversationId);
  }, [conversations, selectedConversationId]);

  const handleFilterChange = (key: keyof InboxFilters, value: string | null) => {
    setFilters(prev => ({
      ...prev,
      [key]: value || undefined,
    }));
  };

  const handleAssign = async (conversationId: string, assignedTo: string | null | 'me') => {
    try {
      await assignConversation(conversationId, assignedTo);
    } catch (err) {
      // Error already handled by hook
    }
  };

  const handleUpdatePriority = async (conversationId: string, priority: 'low' | 'normal' | 'high' | 'urgent') => {
    try {
      await updateConversation(conversationId, { priority });
    } catch (err) {
      // Error already handled by hook
    }
  };

  const handleUpdateStatus = async (conversationId: string, status: 'active' | 'archived' | 'closed') => {
    try {
      await updateConversation(conversationId, { status });
    } catch (err) {
      // Error already handled by hook
    }
  };

  if (!activePracticeId) {
    return (
      <div className={cn('p-6', className)}>
        <p className="text-gray-500 dark:text-gray-400">Please select a practice to view inbox.</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Team Inbox</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage client conversations
            </p>
          </div>
          {stats && (
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 dark:text-gray-400">Active:</span>
                <span className="font-semibold text-gray-900 dark:text-white">{stats.active}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 dark:text-gray-400">Unassigned:</span>
                <span className="font-semibold text-orange-600 dark:text-orange-400">{stats.unassigned}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 dark:text-gray-400">My Conversations:</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">{stats.assignedToMe}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <FunnelIcon className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filters:</span>
          </div>
          
          {/* Status Filter */}
          <select
            value={filters.status || 'all'}
            onChange={(e) => handleFilterChange('status', e.currentTarget.value === 'all' ? null : e.currentTarget.value)}
            className="text-sm border border-gray-300 dark:border-gray-700 rounded-md px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-accent-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="closed">Closed</option>
          </select>

          {/* Assignment Filter */}
          <select
            value={filters.assignedTo || 'all'}
            onChange={(e) => handleFilterChange('assignedTo', e.currentTarget.value === 'all' ? null : e.currentTarget.value)}
            className="text-sm border border-gray-300 dark:border-gray-700 rounded-md px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-accent-500"
          >
            <option value="all">All Assignments</option>
            <option value="me">Assigned to Me</option>
            <option value="unassigned">Unassigned</option>
          </select>

          {/* Priority Filter */}
          <select
            value={filters.priority || 'all'}
            onChange={(e) => handleFilterChange('priority', e.currentTarget.value === 'all' ? null : e.currentTarget.value)}
            className="text-sm border border-gray-300 dark:border-gray-700 rounded-md px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-accent-500"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => refresh()}
            disabled={isLoading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Conversation List */}
        <div className="w-1/3 border-r border-gray-200 dark:border-gray-800 overflow-y-auto">
          {isLoading && conversations.length === 0 ? (
            <div className="p-6 text-center text-gray-500 dark:text-gray-400">
              Loading conversations...
            </div>
          ) : error ? (
            <div className="p-6 text-center text-red-500 dark:text-red-400">
              {error}
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center text-gray-500 dark:text-gray-400">
              No conversations found
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => setSelectedConversationId(conversation.id)}
                  className={cn(
                    'w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors',
                    selectedConversationId === conversation.id && 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <EnvelopeIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          Conversation {conversation.id.slice(0, 8)}
                        </span>
                        {conversation.priority && conversation.priority !== 'normal' && (
                          <span className={cn(
                            'text-xs px-2 py-0.5 rounded',
                            conversation.priority === 'urgent' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                            conversation.priority === 'high' && 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
                            conversation.priority === 'low' && 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                          )}>
                            {conversation.priority}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                        {conversation.assigned_to ? (
                          <span className="flex items-center gap-1">
                            <UserIcon className="h-3 w-3" />
                            Assigned
                          </span>
                        ) : (
                          <span className="text-orange-600 dark:text-orange-400">Unassigned</span>
                        )}
                        {conversation.last_message_at && (
                          <span className="flex items-center gap-1">
                            <ClockIcon className="h-3 w-3" />
                            {formatRelativeTime(conversation.last_message_at)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {conversation.status === 'active' && (
                        <CheckCircleIcon className="h-4 w-4 text-green-500" />
                      )}
                      {conversation.status === 'archived' && (
                        <ArchiveBoxIcon className="h-4 w-4 text-gray-400" />
                      )}
                      {conversation.status === 'closed' && (
                        <XCircleIcon className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Conversation Detail */}
        <div className="flex-1 overflow-y-auto">
          {selectedConversation ? (
            <div className="p-6">
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Conversation Details
                  </h3>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleAssign(selectedConversation.id, 'me')}
                      disabled={selectedConversation.assigned_to !== null}
                    >
                      Assign to Me
                    </Button>
                  </div>
                </div>

                {/* Conversation Info */}
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 mb-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Status:</span>
                      <select
                        value={selectedConversation.status}
                        onChange={(e) => handleUpdateStatus(selectedConversation.id, e.currentTarget.value as 'active' | 'archived' | 'closed')}
                        className="ml-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                      >
                        <option value="active">Active</option>
                        <option value="archived">Archived</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Priority:</span>
                      <select
                        value={selectedConversation.priority || 'normal'}
                        onChange={(e) => handleUpdatePriority(selectedConversation.id, e.currentTarget.value as 'low' | 'normal' | 'high' | 'urgent')}
                        className="ml-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                      >
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Assigned To:</span>
                      <span className="ml-2 text-gray-900 dark:text-white">
                        {selectedConversation.assigned_to ? 'Assigned' : 'Unassigned'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Created:</span>
                      <span className="ml-2 text-gray-900 dark:text-white">
                        {formatRelativeTime(selectedConversation.created_at)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Internal Notes */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Internal Notes
                  </label>
                  <textarea
                    value={selectedConversation.internal_notes || ''}
                    onChange={(e) => {
                      updateConversation(selectedConversation.id, {
                        internal_notes: e.currentTarget.value
                      });
                    }}
                    placeholder="Add internal notes (not visible to client)..."
                    className="w-full min-h-[100px] border border-gray-300 dark:border-gray-700 rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-500"
                  />
                </div>

                {/* Tags */}
                {selectedConversation.tags && selectedConversation.tags.length > 0 && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Tags
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {selectedConversation.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded text-xs"
                        >
                          <TagIcon className="h-3 w-3" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
              Select a conversation to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

