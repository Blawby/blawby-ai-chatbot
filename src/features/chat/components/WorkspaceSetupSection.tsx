import type { ComponentChildren, FunctionComponent } from 'preact';
import { Page } from '@/shared/ui/layout/Page';
import { SegmentedToggle } from '@/shared/ui/input';
import { cn } from '@/shared/utils/cn';
import { CompletionRing } from '@/shared/ui/CompletionRing';
import { ContactForm } from '@/features/intake/components/ContactForm';
import {
  PracticeSetup,
  type BasicsFormValues,
  type ContactFormValues,
  type OnboardingProgressSnapshot,
  type OnboardingSaveActionsSnapshot,
} from '@/features/practice-setup/components/PracticeSetup';
import SetupInfoPanel from '@/features/practice-setup/components/SetupInfoPanel';

type PreviewTab = 'home' | 'messages' | 'intake';

type WorkspaceSetupSectionProps = {
  workspace: 'public' | 'practice' | 'client';
  showSidebarPreview: boolean;
  completionScore: number;
  previewTab: PreviewTab;
  previewTabOptions: Array<{ id: PreviewTab; label: string }>;
  onPreviewTabChange: (tab: PreviewTab) => void;
  previewSrcs: { home: string; messages: string };
  previewReloadKey: number;
  onPreviewSubmit: () => void;
  setupInfoPanelProps: Parameters<typeof SetupInfoPanel>[0];
  setupStatus: Parameters<typeof PracticeSetup>[0]['status'];
  payoutsCompleteOverride: boolean;
  practice: Parameters<typeof PracticeSetup>[0]['practice'];
  details: Parameters<typeof PracticeSetup>[0]['details'];
  onSaveBasics: (values: BasicsFormValues, options?: { suppressSuccessToast?: boolean }) => Promise<void>;
  onSaveContact: (values: ContactFormValues, options?: { suppressSuccessToast?: boolean }) => Promise<void>;
  onSaveServices: (services: Array<{ name: string; description?: string; key?: string }>) => Promise<void>;
  logoUploading: boolean;
  logoUploadProgress: number | null;
  onLogoChange: (files: FileList | File[]) => void;
  onBasicsDraftChange: (values: BasicsFormValues | null) => void;
  onProgressChange: (snapshot: OnboardingProgressSnapshot | null) => void;
  onSaveActionsChange: (snapshot: OnboardingSaveActionsSnapshot) => void;
  chatAdapter: Parameters<typeof PracticeSetup>[0]['chatAdapter'];
  fallbackContent: ComponentChildren;
};

export const WorkspaceSetupSection: FunctionComponent<WorkspaceSetupSectionProps> = ({
  workspace,
  showSidebarPreview,
  completionScore,
  previewTab,
  previewTabOptions,
  onPreviewTabChange,
  previewSrcs,
  previewReloadKey,
  onPreviewSubmit,
  setupInfoPanelProps,
  setupStatus,
  payoutsCompleteOverride,
  practice,
  details,
  onSaveBasics,
  onSaveContact,
  onSaveServices,
  logoUploading,
  logoUploadProgress,
  onLogoChange,
  onBasicsDraftChange,
  onProgressChange,
  onSaveActionsChange,
  chatAdapter,
  fallbackContent,
}) => {
  if (workspace !== 'practice') return <>{fallbackContent}</>;

  const previewContent = previewTab === 'intake'
    ? (
      <div className="flex h-full w-full flex-col overflow-y-auto bg-transparent p-4">
        <ContactForm
          onSubmit={onPreviewSubmit}
          message="Tell us about your matter and we will follow up shortly."
        />
      </div>
    )
    : (
      <iframe
        key={`${previewTab}-${previewReloadKey}`}
        title="Public workspace preview"
        src={previewTab === 'messages' ? previewSrcs.messages : previewSrcs.home}
        className="h-full w-full border-0"
        loading="lazy"
      />
    );

  return (
    <div className="flex min-h-0 w-full flex-col lg:h-full lg:flex-row lg:overflow-hidden">
      <div className="relative flex w-full flex-col bg-transparent lg:min-h-0 lg:flex-1 lg:basis-1/2 lg:overflow-hidden">
        <div className="relative z-10 flex min-h-0 flex-1 flex-col lg:overflow-y-auto">
          <Page className="w-full flex-1">
            <PracticeSetup
              status={setupStatus}
              payoutsCompleteOverride={payoutsCompleteOverride}
              practice={practice}
              details={details}
              onSaveBasics={onSaveBasics}
              onSaveContact={onSaveContact}
              onSaveServices={onSaveServices}
              logoUploading={logoUploading}
              logoUploadProgress={logoUploadProgress}
              onLogoChange={onLogoChange}
              onBasicsDraftChange={onBasicsDraftChange}
              onProgressChange={onProgressChange}
              onSaveActionsChange={onSaveActionsChange}
              chatAdapter={chatAdapter}
            />
          </Page>
        </div>
      </div>
      <div className="relative flex w-full flex-col items-center gap-5 border-t border-line-glass/30 bg-transparent px-4 py-6 lg:min-h-0 lg:flex-1 lg:basis-1/2 lg:border-t-0 lg:border-l lg:border-l-line-glass/30">
        <div className="relative flex w-full flex-col items-center gap-5">
          <div className="flex flex-col items-center gap-2">
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-input-placeholder">
              {showSidebarPreview ? 'Public preview' : 'Setup progress'}
            </div>
            {!showSidebarPreview && (
              <CompletionRing score={completionScore} size={46} strokeWidth={3} />
            )}
          </div>
          {showSidebarPreview ? (
            <SegmentedToggle<PreviewTab>
              className="w-full max-w-[360px]"
              value={previewTab}
              options={previewTabOptions.map((option) => ({
                value: option.id,
                label: option.label
              }))}
              onChange={onPreviewTabChange}
              ariaLabel="Public preview tabs"
            />
          ) : null}
          <div
            className={cn(
              'relative aspect-[9/19.5] w-full max-w-[360px] overflow-hidden',
              showSidebarPreview ? 'glass-card shadow-glass' : 'glass-panel'
            )}
          >
            {showSidebarPreview ? previewContent : <SetupInfoPanel {...setupInfoPanelProps} embedded className="h-full overflow-y-auto p-4" />}
            {showSidebarPreview ? (
              <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-white/10" aria-hidden="true" />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
