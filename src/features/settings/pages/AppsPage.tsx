import { App } from './appsData';
import { SettingHeader } from '@/features/settings/components/SettingHeader';
import { SectionDivider } from '@/shared/ui/layout';
import { ChevronRightIcon, PuzzlePieceIcon, CheckBadgeIcon } from '@heroicons/react/24/outline';
import { cn } from '@/shared/utils/cn';
import { useTranslation } from '@/shared/i18n/hooks';

interface AppsPageProps {
  apps: App[];
  onSelect: (appId: string) => void;
  className?: string;
}

export const AppsPage = ({ apps, onSelect, className = '' }: AppsPageProps) => {
  const { t } = useTranslation(['settings']);

  return (
    <div className={cn('h-full flex flex-col', className)}>
      <SettingHeader title={t('settings:apps.title')} />

      <div className="flex-1 overflow-y-auto px-6">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {t('settings:apps.description')}
        </p>

        <div className="space-y-0">
          {apps.map((app, index) => (
            <>
              <button
                key={app.id}
                type="button"
                onClick={() => onSelect(app.id)}
                className="w-full py-4 flex items-center gap-4 text-left"
              >
                <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
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
                    <p className="text-base font-medium text-gray-900 dark:text-gray-100 truncate">{app.name}</p>
                    {app.connected && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-200">
                        <CheckBadgeIcon className="w-4 h-4" aria-hidden="true" />
                        {t('settings:apps.clio.connected')}
                      </span>
                    )}
                  </div>
                </div>

                <ChevronRightIcon className="w-5 h-5 text-gray-400" aria-hidden="true" />
              </button>
              {index < apps.length - 1 && <SectionDivider />}
            </>
          ))}
        </div>
      </div>
    </div>
  );
};
