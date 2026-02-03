import { useTranslation } from '@/shared/i18n/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import { Button } from '@/shared/ui/Button';

export interface HelpPageProps {
  className?: string;
}

export const HelpPage = ({ className = '' }: HelpPageProps) => {
  const { navigate } = useNavigation();
  const { t } = useTranslation('settings');
  const showReleaseNotes = false;
  const showDownloads = false;
  const showReportBug = false;
  const showShortcuts = false;

  const handleExternalLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleReportBug = () => {
    // Navigate to bug report page
    navigate('/report-bug');
  };

  const handleKeyboardShortcuts = () => {
    // Navigate to keyboard shortcuts page
    navigate('/keyboard-shortcuts');
  };

  return (
    <div className={`h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t('help.title')}
        </h1>
        <div className="border-t border-gray-200 dark:border-dark-border mt-4" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6">
        <div className="space-y-0">
          {/* Help Center */}
          <div className="py-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {t('help.sections.helpCenter.title')}
              </div>
              <Button
                onClick={() => handleExternalLink('https://blawby.com/help')}
                variant="ghost"
                size="sm"
                className="text-gray-900 dark:text-gray-100"
                aria-label={t('help.sections.helpCenter.ariaLabel')}
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                }
                iconPosition="right"
              >
                {t('help.sections.helpCenter.cta')}
              </Button>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('help.sections.helpCenter.description')}
            </div>
          </div>
          
          {showReleaseNotes && (
            <>
              <div className="border-t border-gray-200 dark:border-dark-border" />
              
              {/* Release Notes */}
              <div className="py-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {t('help.sections.releaseNotes.title')}
                  </div>
                  <Button
                    onClick={() => handleExternalLink('https://blawby.com/release-notes')}
                    variant="ghost"
                    size="sm"
                    className="text-gray-900 dark:text-gray-100"
                    aria-label={t('help.sections.releaseNotes.ariaLabel')}
                    icon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    }
                    iconPosition="right"
                  >
                    {t('help.sections.releaseNotes.cta')}
                  </Button>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('help.sections.releaseNotes.description')}
                </div>
              </div>
            </>
          )}
          
          {/* Terms & Policies */}
          <div className="py-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {t('help.sections.terms.title')}
              </div>
              <Button
                onClick={() => handleExternalLink('https://blawby.com/terms')}
                variant="ghost"
                size="sm"
                className="text-gray-900 dark:text-gray-100"
                aria-label={t('help.sections.terms.ariaLabel')}
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                }
                iconPosition="right"
              >
                {t('help.sections.terms.cta')}
              </Button>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('help.sections.terms.description')}
            </div>
          </div>
          
          {showReportBug && (
            <>
              <div className="border-t border-gray-200 dark:border-dark-border" />
              
              {/* Report Bug */}
              <div className="py-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {t('help.sections.bug.title')}
                  </div>
                  <Button
                    onClick={handleReportBug}
                    variant="ghost"
                    size="sm"
                    className="text-gray-900 dark:text-gray-100"
                  >
                    {t('help.sections.bug.cta')}
                  </Button>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('help.sections.bug.description')}
                </div>
              </div>
            </>
          )}
          
          {showDownloads && (
            <>
              <div className="border-t border-gray-200 dark:border-dark-border" />
              
              {/* Download Apps */}
              <div className="py-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {t('help.sections.downloads.title')}
                  </div>
                  <Button
                    onClick={() => handleExternalLink('https://blawby.com/download')}
                    variant="ghost"
                    size="sm"
                    className="text-gray-900 dark:text-gray-100"
                    aria-label={t('help.sections.downloads.ariaLabel')}
                    icon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    }
                    iconPosition="right"
                  >
                    {t('help.sections.downloads.cta')}
                  </Button>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('help.sections.downloads.description')}
                </div>
              </div>
            </>
          )}
          
          {showShortcuts && (
            <>
              <div className="border-t border-gray-200 dark:border-dark-border" />
              
              {/* Keyboard Shortcuts */}
              <div className="py-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {t('help.sections.shortcuts.title')}
                  </div>
                  <Button
                    onClick={handleKeyboardShortcuts}
                    variant="ghost"
                    size="sm"
                    className="text-gray-900 dark:text-gray-100"
                  >
                    {t('help.sections.shortcuts.cta')}
                  </Button>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('help.sections.shortcuts.description')}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
