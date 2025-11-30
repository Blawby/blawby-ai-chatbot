/**
 * SidebarHeader - Molecule Component
 * 
 * Combines PracticeLogo and CollapsibleToggle to create the sidebar header.
 * Handles collapsed/expanded state display logic.
 */

import { PracticeLogo } from '../atoms/PracticeLogo';
import { CollapsibleToggle } from '../atoms/CollapsibleToggle';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';

interface SidebarHeaderProps {
  practiceConfig?: {
    name: string;
    profileImage: string | null;
    practiceId: string;
  };
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClose?: () => void;
}

export const SidebarHeader = ({ 
  practiceConfig, 
  isCollapsed, 
  onToggleCollapse,
  onClose 
}: SidebarHeaderProps) => {
  if (isCollapsed) {
    return (
      <div className="flex items-center justify-center border-b border-gray-200 dark:border-dark-border px-3 py-2">
        <div className="relative group w-full h-10 flex items-center justify-center">
          {practiceConfig?.profileImage ? (
            <button
              onClick={() => onToggleCollapse()}
              className="w-8 h-8 rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-accent-500"
              title="Click to expand sidebar"
              aria-label="Expand sidebar"
            >
              <PracticeLogo 
                src={practiceConfig.profileImage} 
                alt={practiceConfig.name}
                size="md"
                className="w-full h-full"
              />
            </button>
          ) : (
            // Visible, focusable fallback when no profile image
            <CollapsibleToggle
              icon={<Bars3Icon className="w-4 h-4" />}
              onClick={() => onToggleCollapse()}
              ariaLabel="Expand sidebar"
            />
          )}
          {/* Hover-only overlay preserved for when profile image exists */}
          {practiceConfig?.profileImage && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto">
              <CollapsibleToggle
                icon={<Bars3Icon className="w-4 h-4" />}
                onClick={() => onToggleCollapse()}
                ariaLabel="Expand sidebar"
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between border-b border-gray-200 dark:border-dark-border px-3 py-2">
      {practiceConfig?.profileImage && (
        <PracticeLogo 
          src={practiceConfig.profileImage} 
          alt={practiceConfig.name}
          size="md"
        />
      )}
      {onClose ? (
        <CollapsibleToggle
          icon={<XMarkIcon className="w-5 h-5" />}
          onClick={onClose}
          ariaLabel="Close sidebar"
        />
      ) : (
        <CollapsibleToggle
          icon={<Bars3Icon className="w-5 h-5" />}
          onClick={onToggleCollapse}
          ariaLabel="Collapse sidebar"
        />
      )}
    </div>
  );
};
