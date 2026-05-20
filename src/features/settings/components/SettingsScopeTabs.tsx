import { cn } from '@/shared/utils/cn';
import { buildSettingsPath } from '@/shared/utils/workspace';

export type SettingsScope = 'account' | 'practice' | 'help';

export interface SettingsScopeTabsProps {
  scope: SettingsScope;
  basePath: string;
  canAccessPractice: boolean;
  accountLabel: string;
  practiceLabel: string;
  helpLabel: string;
  className?: string;
}

interface ScopeTab {
  id: SettingsScope;
  label: string;
  href: string;
}

export const SettingsScopeTabs = ({
  scope,
  basePath,
  canAccessPractice,
  accountLabel,
  practiceLabel,
  helpLabel,
  className,
}: SettingsScopeTabsProps) => {
  const tabs: ScopeTab[] = [
    { id: 'account', label: accountLabel, href: buildSettingsPath(basePath, 'account') },
  ];
  if (canAccessPractice) {
    tabs.push({ id: 'practice', label: practiceLabel, href: buildSettingsPath(basePath, 'practice') });
  }
  tabs.push({ id: 'help', label: helpLabel, href: buildSettingsPath(basePath, 'help') });

  return (
    <nav
      aria-label="Settings scope"
      className={cn(
        'sticky top-0 z-30 -mx-4 border-b border-line-default bg-surface-card px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8',
        className,
      )}
    >
      <ul className="flex gap-x-6 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === scope;
          return (
            <li key={tab.id} className="shrink-0">
              <a
                href={tab.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center border-b-2 px-1 py-3 text-sm font-semibold transition-colors',
                  isActive
                    ? 'border-accent-500 text-input-text'
                    : 'border-transparent text-input-placeholder hover:text-input-text',
                )}
              >
                {tab.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
