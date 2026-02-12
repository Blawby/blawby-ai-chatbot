import { App } from './appsData';
import { SettingRow } from '@/features/settings/components/SettingRow';
import { SettingsBadge } from '@/features/settings/components/SettingsBadge';
import { SectionDivider } from '@/shared/ui/layout';
import { SettingsPageLayout } from '@/features/settings/components/SettingsPageLayout';
import { ChevronRightIcon, PuzzlePieceIcon, CheckBadgeIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/shared/i18n/hooks';

interface AppsPageProps {
  apps: App[];
  onSelect: (appId: string) => void;
  className?: string;
}

export const AppsPage = ({ apps, onSelect, className = '' }: AppsPageProps) => {
  const { t } = useTranslation(['settings']);

  return (
    <SettingsPageLayout title={t('settings:apps.title')} className={className}>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        {t('settings:apps.description')}
      </p>

      {apps.map((app, index) => (
        <div key={app.id}>
          <button
            type="button"
            onClick={() => onSelect(app.id)}
            className="w-full text-left"
          >
            <SettingRow
              label={app.name}
              labelNode={(
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-surface-card flex items-center justify-center overflow-hidden">
                    {app.logo ? (
                      <img
                        src={app.logo}
                        alt={`${app.name} logo`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <PuzzlePieceIcon className="w-6 h-6 text-gray-600 dark:text-gray-300" aria-hidden="true" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-base font-medium text-input-text truncate">{app.name}</p>
                      {app.connected && (
                        <SettingsBadge variant="success">
                          <CheckBadgeIcon className="w-4 h-4" aria-hidden="true" />
                          {t('settings:apps.clio.connected')}
                        </SettingsBadge>
                      )}
                      {app.comingSoon && (
                        <SettingsBadge variant="warning">
                          {t('settings:apps.comingSoon')}
                        </SettingsBadge>
                      )}
                    </div>
                  </div>
                </div>
              )}
            >
              <ChevronRightIcon className="w-5 h-5 text-gray-400" aria-hidden="true" />
            </SettingRow>
          </button>
          {index < apps.length - 1 && <SectionDivider />}
        </div>
      ))}
    </SettingsPageLayout>
  );
};
