import { cn } from '@/shared/utils/cn';

export interface SettingsSectionNavItem {
  id: string;
  label: string;
  href: string;
}

export interface SettingsSectionNavProps {
  items: SettingsSectionNavItem[];
  currentId: string;
  className?: string;
}

export const SettingsSectionNav = ({
  items,
  currentId,
  className,
}: SettingsSectionNavProps) => {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="Settings section"
      className={cn(
        '-mx-4 border-b border-line-subtle px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8',
        className,
      )}
    >
      <ul className="flex gap-x-6 overflow-x-auto py-3 text-sm font-medium">
        {items.map((item) => {
          const isActive = item.id === currentId;
          return (
            <li key={item.id} className="shrink-0">
              <a
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'transition-colors',
                  isActive
                    ? 'text-accent-500'
                    : 'text-input-placeholder hover:text-input-text',
                )}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
