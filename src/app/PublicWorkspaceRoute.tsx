import { FunctionComponent } from 'preact';
import { useMemo, useState, useEffect } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { useWidgetBootstrap } from '@/shared/hooks/useWidgetBootstrap';
import { resolvePracticeConfigFromBootstrap, type UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';
import { LoadingScreen } from '@/shared/ui/layout/LoadingScreen';
import { App404 } from '@/features/practice/components/404';
import { WidgetApp } from '@/app/WidgetApp';
import { WidgetPreviewApp } from '@/app/WidgetPreviewApp';
import EmbedShell from '@/shared/ui/layout/EmbedShell';
import DirectShell from '@/shared/ui/layout/DirectShell';
import MarketingShell from '@/shared/ui/layout/MarketingShell';
import { SEOHead } from '@/app/SEOHead';
import { normalizePracticeDetailsResponse } from '@/shared/lib/apiClient';
import { setPracticeDetailsEntry } from '@/shared/stores/practiceDetailsStore';
import type { WidgetPreviewConfig, WidgetPreviewMessage, WidgetPreviewScenario } from '@/shared/types/widgetPreview';
import { toMinorUnitsValue } from '@/shared/utils/money';

interface PublicWorkspaceRouteProps {
  practiceSlug?: string;
  templateSlug?: string;
  conversationId?: string;
  shell?: 'marketing';
}

const isEmbedQuery = (search: URLSearchParams): boolean => search.get('v') === 'widget';

const isPreviewQuery = (search: URLSearchParams): boolean => search.get('preview') === '1';

const getSearchParams = (locationUrl: string | undefined): URLSearchParams => {
  if (typeof window !== 'undefined') {
    return new URLSearchParams(window.location.search);
  }
  const queryPart = (locationUrl ?? '').split('?')[1] ?? '';
  return new URLSearchParams(queryPart);
};

export const PublicWorkspaceRoute: FunctionComponent<PublicWorkspaceRouteProps> = ({
  practiceSlug,
  // templateSlug is consumed downstream via bootstrap data, not by this component directly.
  templateSlug: _templateSlug,
  conversationId,
  shell,
}) => {
  const location = useLocation();
  const slug = (practiceSlug ?? '').trim();
  const searchParams = getSearchParams(location.url);

  // Bootstrap always loads for public widget routes — the widget body needs
  // practice config + session regardless of which shell wraps it.
  const isWidget = true;

  const { data, isLoading, error } = useWidgetBootstrap(slug, isWidget);

  const isPreviewRequested = isPreviewQuery(searchParams);
  const isEmbed = isEmbedQuery(searchParams);

  const initialScenario = useMemo<WidgetPreviewScenario>(() => {
    const params = getSearchParams(location.url);
    const raw = params.get('scenario');
    return raw === 'consultation-payment' || raw === 'service-routing' || raw === 'messenger-start' || raw === 'intake-template'
      ? raw
      : 'messenger-start';
  }, [location.url]);

  const [previewScenario, setPreviewScenario] = useState<WidgetPreviewScenario>(initialScenario);
  const [previewConfig, setPreviewConfig] = useState<WidgetPreviewConfig>({});

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
      introMessage: previewConfig.introMessage !== undefined ? (previewConfig.introMessage ?? undefined) : basePracticeConfig.introMessage,
      legalDisclaimer: previewConfig.legalDisclaimer !== undefined ? (previewConfig.legalDisclaimer ?? undefined) : basePracticeConfig.legalDisclaimer,
      consultationFee: (previewConfig.consultationFee !== undefined && previewConfig.consultationFee !== null) ? toMinorUnitsValue(previewConfig.consultationFee) : basePracticeConfig.consultationFee,
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

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!data || error || !practiceConfig || !resolvedPracticeId) {
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
      preSelectedServiceUuid={data.preSelectedServiceUuid ?? null}
    />
  );

  // Preview takes precedence — it owns its own shell internally (EmbedShell).
  if (isPreviewRequested) {
    return (
      <>
        <SEOHead practiceConfig={practiceConfig} currentUrl={currentUrl} />
        <WidgetPreviewApp
          practiceId={resolvedPracticeId}
          practiceConfig={practiceConfig}
          scenario={previewScenario}
          previewConfig={previewConfig}
        />
      </>
    );
  }

  // Shell selection:
  //   shell="marketing"  → MarketingShell (opt-in, /public/:slug/welcome route)
  //   ?v=widget          → EmbedShell (iframe embed, set by widget-loader.js)
  //   default            → DirectShell (full-viewport direct visit)
  // Path-param :templateSlug intentionally does NOT imply EmbedShell — the
  // template is a data choice, not a layout choice. /public/:slug/intake/:tpl
  // gets DirectShell so direct visitors see a full-viewport experience.
  const Shell = shell === 'marketing' ? MarketingShell : isEmbed ? EmbedShell : DirectShell;

  return (
    <>
      <SEOHead practiceConfig={practiceConfig} currentUrl={currentUrl} />
      <Shell>{widgetApp}</Shell>
    </>
  );
};
