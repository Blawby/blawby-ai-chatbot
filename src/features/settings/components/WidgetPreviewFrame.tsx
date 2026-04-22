import { useMemo } from 'preact/hooks';
import { toMinorUnitsValue } from '@/shared/utils/money';
import { WidgetPreviewApp } from '@/app/WidgetPreviewApp';
import type { UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';
import type { WidgetPreviewConfig, WidgetPreviewScenario } from '@/shared/types/widgetPreview';
import { cn } from '@/shared/utils/cn';

type WidgetPreviewFrameProps = {
  practiceSlug?: string | null;
  scenario: WidgetPreviewScenario;
  config: WidgetPreviewConfig;
  title?: string;
  showTitle?: boolean;
  viewportClassName?: string;
};

const buildPreviewPracticeConfig = (
  practiceSlug: string | null | undefined,
  config: WidgetPreviewConfig,
): UIPracticeConfig => ({
  id: `preview-${practiceSlug?.trim() || 'practice'}`,
  slug: practiceSlug?.trim() || 'preview-practice',
  name: config.name?.trim() || 'Blawby Messenger',
  profileImage: config.profileImage ?? undefined,
  description: '',
  introMessage: config.introMessage ?? undefined,
  legalDisclaimer: config.legalDisclaimer ?? undefined,
  availableServices: [],
  serviceQuestions: {},
  domain: '',
  brandColor: '#000000',
  accentColor: config.accentColor ?? 'gold',
  consultationFee: typeof config.consultationFee === 'number' && Number.isFinite(config.consultationFee)
    ? (toMinorUnitsValue(config.consultationFee) as unknown as UIPracticeConfig['consultationFee'])
    : undefined,
  billingIncrementMinutes: config.billingIncrementMinutes ?? undefined,
  voice: {
    enabled: false,
    provider: 'cloudflare',
    voiceId: null,
    displayName: null,
    previewUrl: null,
  },
});

export const WidgetPreviewFrame = ({
  practiceSlug,
  scenario,
  config,
  title = 'Widget preview',
  showTitle = true,
  viewportClassName = 'h-[min(720px,calc(100svh-12rem))] min-h-[560px] max-h-[720px]',
}: WidgetPreviewFrameProps) => {
  const practiceConfig = useMemo(
    () => buildPreviewPracticeConfig(practiceSlug, config),
    [config, practiceSlug],
  );
  const previewPracticeId = practiceConfig.id || `preview-${practiceConfig.slug || 'practice'}`;
  // Only key on scenario + practice + accentColor to avoid unnecessary remounts
  const previewKey = useMemo(
    () => `${scenario}:${practiceSlug ?? 'preview'}:${config.accentColor ?? ''}`,
    [scenario, practiceSlug, config.accentColor],
  );

  return (
    <div className="w-full">
      {showTitle ? <h3 className="mb-3 text-sm font-semibold text-input-text">{title}</h3> : null}
      <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-xl border border-line-glass/40 bg-surface-card shadow-glass">
        <div className={cn('relative w-full overflow-hidden bg-surface-ground', viewportClassName)}>
          <WidgetPreviewApp
            key={previewKey}
            practiceId={previewPracticeId}
            practiceConfig={practiceConfig}
            scenario={scenario}
            previewConfig={config}
          />
        </div>
      </div>
    </div>
  );
};
