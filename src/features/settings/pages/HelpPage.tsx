import { useTranslation } from '@/shared/i18n/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import { Button } from '@/shared/ui/Button';
import { SettingRow } from '@/features/settings/components/SettingRow';
import { SectionDivider } from '@/shared/ui/layout';
import { SettingsPageLayout } from '@/features/settings/components/SettingsPageLayout';

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
    <SettingsPageLayout title={t('help.title')} className={className}>
      <SettingRow
        label={t('help.sections.helpCenter.title')}
        description={t('help.sections.helpCenter.description')}
      >
        <Button
          onClick={() => handleExternalLink('https://blawby.com/help')}
          variant="ghost"
          size="sm"
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
      </SettingRow>
      
      {showReleaseNotes && (
        <>
          <SectionDivider />
          
          <SettingRow
            label={t('help.sections.releaseNotes.title')}
            description={t('help.sections.releaseNotes.description')}
          >
            <Button
              onClick={() => handleExternalLink('https://blawby.com/release-notes')}
              variant="ghost"
              size="sm"
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
          </SettingRow>
        </>
      )}
      
      <SectionDivider />
      {/* Terms & Policies */}
      <SettingRow
        label={t('help.sections.terms.title')}
        description={t('help.sections.terms.description')}
      >
        <Button
          onClick={() => handleExternalLink('https://blawby.com/terms')}
          variant="ghost"
          size="sm"
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
      </SettingRow>
      
      {showReportBug && (
        <>
          <SectionDivider />
          
          <SettingRow
            label={t('help.sections.bug.title')}
            description={t('help.sections.bug.description')}
          >
            <Button
              onClick={handleReportBug}
              variant="ghost"
              size="sm"
            >
              {t('help.sections.bug.cta')}
            </Button>
          </SettingRow>
        </>
      )}
      
      {showDownloads && (
        <>
          <SectionDivider />
          
          <SettingRow
            label={t('help.sections.downloads.title')}
            description={t('help.sections.downloads.description')}
          >
            <Button
              onClick={() => handleExternalLink('https://blawby.com/download')}
              variant="ghost"
              size="sm"
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
          </SettingRow>
        </>
      )}
      
      {showShortcuts && (
        <>
          <SectionDivider />
          
          <SettingRow
            label={t('help.sections.shortcuts.title')}
            description={t('help.sections.shortcuts.description')}
          >
            <Button
              onClick={handleKeyboardShortcuts}
              variant="ghost"
              size="sm"
            >
              {t('help.sections.shortcuts.cta')}
            </Button>
          </SettingRow>
        </>
      )}
    </SettingsPageLayout>
  );
};
