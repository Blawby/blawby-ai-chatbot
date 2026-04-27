import { FunctionComponent } from 'preact';
import { useMemo, useState, useEffect } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { useWidgetBootstrap } from '@/shared/hooks/useWidgetBootstrap';
import { resolvePracticeConfigFromBootstrap, type UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';
import { LoadingScreen } from '@/shared/ui/layout/LoadingScreen';
import { App404 } from '@/features/practice/components/404';
import { WidgetApp } from '@/app/WidgetApp';
import { WidgetPreviewApp } from '@/app/WidgetPreviewApp';
import PublicIntakeCard from '@/shared/ui/layout/PublicIntakeCard';
import { SEOHead } from '@/app/SEOHead';
import { setWidgetRuntimeContext } from '@/shared/utils/widgetAuth';
import { normalizePracticeDetailsResponse } from '@/shared/lib/apiClient';
import { setPracticeDetailsEntry } from '@/shared/stores/practiceDetailsStore';
import type { WidgetPreviewConfig, WidgetPreviewMessage, WidgetPreviewScenario } from '@/shared/types/widgetPreview';
import type { MinorAmount } from '../../worker/types';

interface PublicWorkspaceRouteProps {
  practiceSlug?: string;
  templateSlug?: string;
  conversationId?: string;
  variant?: 'widget' | 'card' | 'preview';
}

export const PublicWorkspaceRoute: FunctionComponent<PublicWorkspaceRouteProps> = ({
  practiceSlug,
  templateSlug,
  conversationId,
  variant = 'widget'
}) => {
  const location = useLocation();
  const slug = (practiceSlug ?? '').trim();
  
  // variant="preview" implies we are in widget mode.
  // Otherwise, check if we should be in widget mode based on the URL.
  const isWidget = variant === 'preview' || variant === 'card' || (() => {
    const isWidgetParam = (location.query?.v === 'widget' || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('v') === 'widget'));
    const hasTemplate = !!templateSlug || !!location.query?.template || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('template'));
    return isWidgetParam || hasTemplate;
  })();

  const { data, isLoading, error } = useWidgetBootstrap(slug, isWidget);

  // --- Preview State ---
  // Only used if variant is 'preview' or if the URL explicitly requests preview mode.
  const isPreviewRequested = isWidget && (
    variant === 'preview' ||
    (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1') ||
    location.query?.preview === '1'
  );

  const initialScenario = useMemo<WidgetPreviewScenario>(() => {
    const raw = typeof location.query?.scenario === 'string'
      ? location.query.scenario
      : new URLSearchParams((location.url ?? '').split('?')[1] ?? '').get('scenario');
    return raw === 'consultation-payment' || raw === 'service-routing' || raw === 'messenger-start'
      ? raw
      : 'messenger-start';
  }, [location.query?.scenario, location.url]);

  const [previewScenario, setPreviewScenario] = useState<WidgetPreviewScenario>(initialScenario);
  const [previewConfig, setPreviewConfig] = useState<WidgetPreviewConfig>({});
  const isMinorAmount = (val: unknown): val is MinorAmount => typeof val === 'number' && val >= 0;

  useEffect(() => {
    if (!isWidget) return;
    setWidgetRuntimeContext(true);
    return () => {
      setWidgetRuntimeContext(false);
    };
  }, [isWidget]);

  useEffect(() => {
    if (!isPreviewRequested) return;
    const handleMessage = (event: MessageEvent<WidgetPreviewMessage>) => {
      if (event.origin !== window.location.origin) return;
      if (!event.data || event.data.type !== 'blawby:widget-preview-config') return;
      
      const scenario = event.data.scenario;
      if (scenario !== 'messenger-start' && scenario !== 'consultation-payment' && scenario !== 'service-routing' && scenario !== 'intake-template') {
        return;
      }

      setPreviewScenario(scenario);
      setPreviewConfig(event.data.payload ?? {});
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isPreviewRequested]);

  const basePracticeConfig = useMemo<UIPracticeConfig | null>(() => {
    if (!data?.practiceDetails) return null;
    return resolvePracticeConfigFromBootstrap(data.practiceDetails as Record<string, unknown>, slug);
  }, [data, slug]);

  const practiceConfig = useMemo<UIPracticeConfig | null>(() => {
    if (!basePracticeConfig) return null;
    if (!isPreviewRequested) return basePracticeConfig;
    return {
      ...basePracticeConfig,
      name: previewConfig.name ?? basePracticeConfig.name,
      profileImage: previewConfig.profileImage !== undefined ? (previewConfig.profileImage ?? undefined) : basePracticeConfig.profileImage,
      accentColor: previewConfig.accentColor ?? basePracticeConfig.accentColor,
      introMessage: previewConfig.introMessage !== undefined ? (previewConfig.introMessage ?? undefined) : basePracticeConfig.introMessage,
      legalDisclaimer: previewConfig.legalDisclaimer !== undefined ? (previewConfig.legalDisclaimer ?? undefined) : basePracticeConfig.legalDisclaimer,
      consultationFee: (previewConfig.consultationFee !== undefined && previewConfig.consultationFee !== null && isMinorAmount(previewConfig.consultationFee)) ? previewConfig.consultationFee : basePracticeConfig.consultationFee,
      billingIncrementMinutes: previewConfig.billingIncrementMinutes !== undefined ? (previewConfig.billingIncrementMinutes ?? undefined) : basePracticeConfig.billingIncrementMinutes,
    };
  }, [basePracticeConfig, isPreviewRequested, previewConfig]);

  const resolvedPracticeId = practiceConfig?.id || '';

  useEffect(() => {
    if (data?.practiceDetails && resolvedPracticeId) {
      const details = normalizePracticeDetailsResponse(data.practiceDetails);
      if (details) {
        setPracticeDetailsEntry(resolvedPracticeId, details);
      }
    }
  }, [data, resolvedPracticeId]);

  if (isLoading || !data) {
    return <LoadingScreen />;
  }

  if (error || !practiceConfig || !resolvedPracticeId) {
    return <App404 />;
  }

  const currentUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${location.url}`
    : undefined;

  const widgetApp = (
    <WidgetApp
      practiceId={resolvedPracticeId}
      practiceConfig={practiceConfig}
      routeConversationId={conversationId}
      bootstrapConversationId={data.conversationId}
      bootstrapSession={data.session}
      intakeTemplate={data.intakeTemplate ?? null}
    />
  );

  return (
    <>
      <SEOHead
        practiceConfig={practiceConfig}
        currentUrl={currentUrl}
      />
      {isPreviewRequested ? (
        <WidgetPreviewApp
          practiceId={resolvedPracticeId}
          practiceConfig={practiceConfig}
          scenario={previewScenario}
          previewConfig={previewConfig}
        />
      ) : (variant === 'card' || !!templateSlug || typeof location.query?.template === 'string') ? (
        <PublicIntakeCard>
          {widgetApp}
        </PublicIntakeCard>
      ) : widgetApp}
    </>
  );
};
