import { 
  DocumentTextIcon, 
  ClockIcon, 
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArchiveBoxIcon
} from '@heroicons/react/24/outline';
import { Matter, MatterCardProps } from '../types/matter';
import { componentStyles } from '../config/component-styles';

const getStatusIcon = (status: Matter['status']) => {
  switch (status) {
    case 'draft':
      return <DocumentTextIcon className="w-4 h-4 text-gray-500" />;
    case 'submitted':
      return <ClockIcon className="w-4 h-4 text-blue-500" />;
    case 'in_review':
      return <ExclamationTriangleIcon className="w-4 h-4 text-yellow-500" />;
    case 'completed':
      return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
    case 'archived':
      return <ArchiveBoxIcon className="w-4 h-4 text-gray-400" />;
    default:
      return <DocumentTextIcon className="w-4 h-4 text-gray-500" />;
  }
};

const getStatusText = (status: Matter['status']) => {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'submitted':
      return 'Submitted';
    case 'in_review':
      return 'In Review';
    case 'completed':
      return 'Completed';
    case 'archived':
      return 'Archived';
    default:
      return 'Unknown';
  }
};

const getStatusColor = (status: Matter['status']) => {
  switch (status) {
    case 'draft':
      return 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300';
    case 'submitted':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
    case 'in_review':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
    case 'completed':
      return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
    case 'archived':
      return 'bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-400';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300';
  }
};

const MatterCard = ({ matter, onClick }: MatterCardProps) => {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div 
      className={componentStyles.card}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className={componentStyles.cardHeader}>
        <div className={componentStyles.cardTitle}>
          <h3 className="text-lg font-semibold text-text">
            {matter.matterNumber ? `Matter ${matter.matterNumber}` : matter.title}
          </h3>
          <span className={`${componentStyles.statusBadge} ${getStatusColor(matter.status)}`}>
            {getStatusIcon(matter.status)}
            {getStatusText(matter.status)}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm text-muted">
          <span className="font-medium">{matter.service}</span>
          <span>{formatDate(matter.updatedAt)}</span>
        </div>
      </div>
      
      <div className={componentStyles.cardContent}>
        <p className="text-sm text-text line-clamp-3">
          {truncateText(matter.summary, 150)}
        </p>
      </div>
      
      <div className={componentStyles.cardFooter}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-muted">Created:</span>
            <span className="text-xs font-medium">
              {formatDate(matter.createdAt)}
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="text-xs text-muted">Updated:</span>
            <span className="text-xs font-medium">
              {formatDate(matter.updatedAt)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MatterCard; 