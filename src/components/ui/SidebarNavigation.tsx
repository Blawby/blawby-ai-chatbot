import { FunctionComponent } from 'preact';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { cn } from '../../utils/cn';

// Type for icon components that works with heroicons
// This type ensures that icons accept standard SVG props while maintaining compatibility
// Uses proper SVG attributes type for type safety
type IconComponent = preact.ComponentType<preact.JSX.SVGAttributes<SVGSVGElement>>;

export interface SidebarNavigationItem {
  id: string;
  label: string;
  icon: IconComponent;
  isAction?: boolean;
  onClick?: () => void;
  variant?: 'default' | 'danger';
}

export interface SidebarNavigationProps {
  items: SidebarNavigationItem[];
  activeItem?: string;
  onItemClick: (itemId: string) => void;
  className?: string;
  mobile?: boolean;
}

export const SidebarNavigation: FunctionComponent<SidebarNavigationProps> = ({
  items,
  activeItem,
  onItemClick,
  className = '',
  mobile = false
}) => {
  // Mobile layout with card-style sections
  if (mobile) {
    // Group items into sections while maintaining desktop order
    const appItems = items.filter(item => 
      ['general'].includes(item.id)
    );
    const accountItems = items.filter(item => 
      ['notifications', 'account', 'security'].includes(item.id)
    );
    const otherItems = items.filter(item => 
      !['general', 'notifications', 'account', 'security'].includes(item.id)
    );

    return (
      <nav className={cn('flex-1', className)} aria-label="Sidebar navigation">
        <div className="space-y-6">
          {/* APP Section */}
          {appItems.length > 0 && (
            <div>
              <h2 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 px-4">
                APP
              </h2>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <ul className="space-y-0">
                  {appItems.map((item, index) => {
                    const IconComponent = item.icon;
                    const isActive = activeItem === item.id;
                    const isAction = item.isAction;
                    const isDanger = item.variant === 'danger';
                    
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          aria-current={!isAction && isActive ? 'page' : undefined}
                          onClick={() => {
                            if (isAction && item.onClick) {
                              item.onClick();
                            } else {
                              onItemClick(item.id);
                            }
                          }}
                          className={cn(
                            'w-full flex items-center justify-between px-4 py-3 text-left transition-colors touch-manipulation',
                            isAction
                              ? isDanger
                                ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 active:bg-red-100 dark:active:bg-red-900/30'
                                : 'text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700'
                              : 'text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <IconComponent className="w-5 h-5 flex-shrink-0" />
                            <span className="text-sm font-medium">{item.label}</span>
                          </div>
                          {!isAction && (
                            <ChevronRightIcon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                          )}
                        </button>
                        {index < appItems.length - 1 && (
                          <div className="border-t border-gray-200 dark:border-gray-700" />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}

          {/* ACCOUNT Section */}
          {accountItems.length > 0 && (
            <div>
              <h2 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 px-4">
                ACCOUNT
              </h2>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <ul className="space-y-0">
                  {accountItems.map((item, index) => {
                    const IconComponent = item.icon;
                    const isActive = activeItem === item.id;
                    const isAction = item.isAction;
                    const isDanger = item.variant === 'danger';
                    
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          aria-current={!isAction && isActive ? 'page' : undefined}
                          onClick={() => {
                            if (isAction && item.onClick) {
                              item.onClick();
                            } else {
                              onItemClick(item.id);
                            }
                          }}
                          className={cn(
                            'w-full flex items-center justify-between px-4 py-3 text-left transition-colors touch-manipulation',
                            isAction
                              ? isDanger
                                ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 active:bg-red-100 dark:active:bg-red-900/30'
                                : 'text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700'
                              : 'text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <IconComponent className="w-5 h-5 flex-shrink-0" />
                            <span className="text-sm font-medium">{item.label}</span>
                          </div>
                          {!isAction && (
                            <ChevronRightIcon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                          )}
                        </button>
                        {index < accountItems.length - 1 && (
                          <div className="border-t border-gray-200 dark:border-gray-700" />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}

          {/* Other items (like Help, Sign Out) */}
          {otherItems.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <ul className="space-y-0">
                {otherItems.map((item, index) => {
                  const IconComponent = item.icon;
                  const isActive = activeItem === item.id;
                  const isAction = item.isAction;
                  const isDanger = item.variant === 'danger';
                  
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        aria-current={!isAction && isActive ? 'page' : undefined}
                        onClick={() => {
                          if (isAction && item.onClick) {
                            item.onClick();
                          } else {
                            onItemClick(item.id);
                          }
                        }}
                        className={cn(
                          'w-full flex items-center justify-between px-4 py-3 text-left transition-colors touch-manipulation',
                          isAction
                            ? isDanger
                              ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 active:bg-red-100 dark:active:bg-red-900/30'
                              : 'text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700'
                            : 'text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <IconComponent className="w-5 h-5 flex-shrink-0" />
                          <span className="text-sm font-medium">{item.label}</span>
                        </div>
                        {!isAction && (
                          <ChevronRightIcon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                        )}
                      </button>
                      {index < otherItems.length - 1 && (
                        <div className="border-t border-gray-200 dark:border-gray-700" />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </nav>
    );
  }

  // Desktop layout - original
  return (
    <nav className={cn('flex-1 py-1 px-2', className)} aria-label="Sidebar navigation">
      <ul className="space-y-1">
        {items.map((item) => {
          const IconComponent = item.icon;
          const isActive = activeItem === item.id;
          const isAction = item.isAction;
          const isDanger = item.variant === 'danger';
          
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-current={!isAction && isActive ? 'page' : undefined}
                onClick={() => {
                  if (isAction && item.onClick) {
                    item.onClick();
                  } else {
                    onItemClick(item.id);
                  }
                }}
                onTouchStart={(e) => {
                  const touch = e.touches[0];
                  e.currentTarget.dataset.touchStartX = String(touch.clientX);
                  e.currentTarget.dataset.touchStartY = String(touch.clientY);
                }}
                onTouchEnd={(e) => {
                  const touch = e.changedTouches[0];
                  const startX = Number(e.currentTarget.dataset.touchStartX || 0);
                  const startY = Number(e.currentTarget.dataset.touchStartY || 0);
                  const deltaX = Math.abs(touch.clientX - startX);
                  const deltaY = Math.abs(touch.clientY - startY);
                  
                  // Only prevent default for taps (not scrolls)
                  if (deltaX < 10 && deltaY < 10) {
                    e.preventDefault();
                  }
                  
                  if (isAction && item.onClick) {
                    item.onClick();
                  } else {
                    onItemClick(item.id);
                  }
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-2 text-left transition-colors rounded-lg touch-manipulation',
                  isAction
                    ? isDanger
                      ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 active:bg-red-100 dark:active:bg-red-900/30'
                      : 'text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700'
                    : isActive
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                      : 'text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700'
                )}
              >
                <IconComponent className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
