/**
 * SidebarHeader - Molecule Component
 * 
 * Combines OrgLogo and CollapsibleToggle to create the sidebar header.
 * Handles collapsed/expanded state display logic.
 */

import { OrgLogo } from '../atoms/OrgLogo';
import { CollapsibleToggle } from '../atoms/CollapsibleToggle';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';

interface SidebarHeaderProps {
  organizationConfig?: {
    name: string;
    profileImage: string | null;
    organizationId: string;
  };
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClose?: () => void;
}

export const SidebarHeader = ({ 
  organizationConfig, 
  isCollapsed, 
  onToggleCollapse,
  onClose 
}: SidebarHeaderProps) => {
  if (isCollapsed) {
    return (
      <div className="flex items-center justify-center border-b border-gray-200 dark:border-dark-border px-3 py-2">
        <div className="relative group w-full h-10 flex items-center justify-center">
          {organizationConfig?.profileImage && (
            <button
              onClick={() => onToggleCollapse()}
              className="w-8 h-8 rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-accent-500"
              title="Click to expand sidebar"
              aria-label="Expand sidebar"
            >
              <OrgLogo 
                src={organizationConfig.profileImage} 
                alt={organizationConfig.name}
                size="md"
                className="w-full h-full"
              />
            </button>
          )}
          {/* Hamburger menu appears on hover */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto">
            <CollapsibleToggle
              icon={<Bars3Icon className="w-4 h-4" />}
              onClick={() => onToggleCollapse()}
              ariaLabel="Expand sidebar"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between border-b border-gray-200 dark:border-dark-border px-3 py-2">
      {organizationConfig?.profileImage && (
        <OrgLogo 
          src={organizationConfig.profileImage} 
          alt={organizationConfig.name}
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
