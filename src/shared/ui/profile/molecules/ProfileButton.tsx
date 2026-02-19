import { Avatar } from '../atoms/Avatar';

interface ProfileButtonProps {
  name: string;
  image?: string | null;
  secondaryText?: string | null;
  isCollapsed: boolean;
  onClick: () => void;
  className?: string;
}

export const ProfileButton = ({
  name,
  image,
  secondaryText,
  isCollapsed,
  onClick,
  className = ''
}: ProfileButtonProps) => {
  if (isCollapsed) {
    return (
      <button
        onClick={onClick}
        className={`w-8 h-8 rounded-full bg-surface-glass/60 backdrop-blur-sm flex items-center justify-center flex-shrink-0 mx-auto ${className}`}
        title={name}
        aria-label={`User profile for ${name}`}
      >
        <Avatar src={image} name={name} size="sm" />
      </button>
    );
  }

  return (
    <div className={`flex items-center gap-2 min-w-0 w-full max-w-full ${className}`}>
      <button
        onClick={onClick}
        className="flex items-center gap-2 flex-1 min-w-0 text-left hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg p-2 transition-colors overflow-hidden"
        aria-label={`User profile for ${name}`}
      >
        <Avatar src={image} name={name} size="md" />
        <div className="flex-1 min-w-0 overflow-hidden text-left">
          <p className="text-sm font-medium leading-none text-input-text truncate" title={name}>
            {name}
          </p>
          {secondaryText && (
            <div className="-mt-0.5">
              <span className="text-xs leading-none text-input-placeholder truncate">
                {secondaryText}
              </span>
            </div>
          )}
        </div>
      </button>
    </div>
  );
};
