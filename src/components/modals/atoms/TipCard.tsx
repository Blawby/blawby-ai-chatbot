import { FunctionComponent } from 'preact';

type ColorToken = 'blue' | 'green' | 'yellow' | 'purple' | 'red' | 'gray';

interface TipCardProps {
  icon: preact.ComponentType<{ className?: string }>;
  iconColor?: ColorToken;
  bgColor?: ColorToken;
  title: preact.ComponentChildren;
  description: preact.ComponentChildren;
}

const ICON_COLOR_MAP: Record<ColorToken, string> = {
  blue: 'text-blue-500',
  green: 'text-green-500',
  yellow: 'text-yellow-500',
  purple: 'text-purple-500',
  red: 'text-red-500',
  gray: 'text-gray-500',
};

const BG_COLOR_MAP: Record<ColorToken, string> = {
  blue: 'bg-blue-50 dark:bg-blue-900/30',
  green: 'bg-green-50 dark:bg-green-900/30',
  yellow: 'bg-yellow-50 dark:bg-yellow-900/30',
  purple: 'bg-purple-50 dark:bg-purple-900/30',
  red: 'bg-red-50 dark:bg-red-900/30',
  gray: 'bg-gray-100 dark:bg-gray-800',
};

const TipCard: FunctionComponent<TipCardProps> = ({ icon: Icon, iconColor = 'blue', bgColor = 'gray', title, description }) => {
  const iconClass = ICON_COLOR_MAP[(iconColor || 'blue').trim() as ColorToken] || ICON_COLOR_MAP.blue;
  const bgClass = BG_COLOR_MAP[(bgColor || 'gray').trim() as ColorToken] || BG_COLOR_MAP.gray;
  return (
    <div className="text-left">
      <div className={`w-12 h-12 rounded-full ${bgClass} flex items-center justify-center mb-4`}>
        <Icon className={`h-6 w-6 ${iconClass}`} />
      </div>
      <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        {title}
      </h4>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {description}
      </p>
    </div>
  );
};

export default TipCard;
