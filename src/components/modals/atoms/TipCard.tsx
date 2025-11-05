import { FunctionComponent } from 'preact';

interface TipCardProps {
  icon: preact.ComponentType<{ className?: string }>;
  iconColor: string;
  bgColor: string;
  title: preact.ComponentChildren;
  description: preact.ComponentChildren;
}

const TipCard: FunctionComponent<TipCardProps> = ({ icon: Icon, iconColor, bgColor, title, description }) => {
  return (
    <div className="text-left">
      <div className={`w-12 h-12 rounded-full ${bgColor} flex items-center justify-center mb-4`}>
        <Icon className={`h-6 w-6 ${iconColor}`} />
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
