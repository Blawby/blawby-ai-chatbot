import { useTranslation } from '@/i18n/hooks';
import { useNavigation } from '../../../utils/navigation';

export interface HelpPageProps {
  className?: string;
}

export const HelpPage = ({ className = '' }: HelpPageProps) => {
  const { navigate } = useNavigation();
  const { t } = useTranslation('settings');

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
              <button
                onClick={() => handleExternalLink('https://help.blawby.com')}
                className="flex items-center gap-2 px-3 py-1 text-sm text-gray-900 dark:text-gray-100 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-500"
                aria-label={t('help.sections.helpCenter.ariaLabel')}
              >
                <span>{t('help.sections.helpCenter.cta')}</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('help.sections.helpCenter.description')}
            </div>
          </div>
          
          <div className="border-t border-gray-200 dark:border-dark-border" />
          
          {/* Release Notes */}
          <div className="py-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {t('help.sections.releaseNotes.title')}
              </div>
              <button
                onClick={() => handleExternalLink('https://blawby.com/release-notes')}
                className="flex items-center gap-2 px-3 py-1 text-sm text-gray-900 dark:text-gray-100 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-500"
                aria-label={t('help.sections.releaseNotes.ariaLabel')}
              >
                <span>{t('help.sections.releaseNotes.cta')}</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('help.sections.releaseNotes.description')}
            </div>
          </div>
          
          <div className="border-t border-gray-200 dark:border-dark-border" />
          
          {/* Terms & Policies */}
          <div className="py-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {t('help.sections.terms.title')}
              </div>
              <button
                onClick={() => handleExternalLink('https://blawby.com/terms')}
                className="flex items-center gap-2 px-3 py-1 text-sm text-gray-900 dark:text-gray-100 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-500"
                aria-label={t('help.sections.terms.ariaLabel')}
              >
                <span>{t('help.sections.terms.cta')}</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('help.sections.terms.description')}
            </div>
          </div>
          
          <div className="border-t border-gray-200 dark:border-dark-border" />
          
          {/* Report Bug */}
          <div className="py-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {t('help.sections.bug.title')}
              </div>
              <button
                onClick={handleReportBug}
                className="flex items-center gap-2 px-3 py-1 text-sm text-gray-900 dark:text-gray-100 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-500"
              >
                <span>{t('help.sections.bug.cta')}</span>
              </button>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('help.sections.bug.description')}
            </div>
          </div>
          
          <div className="border-t border-gray-200 dark:border-dark-border" />
          
          {/* Download Apps */}
          <div className="py-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {t('help.sections.downloads.title')}
              </div>
              <button
                onClick={() => handleExternalLink('https://blawby.com/download')}
                className="flex items-center gap-2 px-3 py-1 text-sm text-gray-900 dark:text-gray-100 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-500"
                aria-label={t('help.sections.downloads.ariaLabel')}
              >
                <span>{t('help.sections.downloads.cta')}</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('help.sections.downloads.description')}
            </div>
          </div>
          
          <div className="border-t border-gray-200 dark:border-dark-border" />
          
          {/* Keyboard Shortcuts */}
          <div className="py-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {t('help.sections.shortcuts.title')}
              </div>
              <button
                onClick={handleKeyboardShortcuts}
                className="flex items-center gap-2 px-3 py-1 text-sm text-gray-900 dark:text-gray-100 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-500"
              >
                <span>{t('help.sections.shortcuts.cta')}</span>
              </button>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('help.sections.shortcuts.description')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
