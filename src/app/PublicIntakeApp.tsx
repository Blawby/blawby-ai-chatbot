import { FunctionComponent } from 'preact';
import { useEffect, useMemo } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { SEOHead } from '@/app/SEOHead';
import { LoadingScreen } from '@/shared/ui/layout/LoadingScreen';
import { App404 } from '@/features/practice/components/404';
import { useWidgetBootstrap } from '@/shared/hooks/useWidgetBootstrap';
import { setWidgetRuntimeContext } from '@/shared/utils/widgetAuth';
import PublicIntakeCard from '@/shared/ui/layout/PublicIntakeCard';
import { WidgetApp } from '@/app/WidgetApp';
import type { UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';

export const PublicIntakeApp: FunctionComponent<{ practiceSlug?: string; templateSlug?: string }> = ({ practiceSlug }) => {
  const location = useLocation();

  const slug = (practiceSlug ?? '').trim();

  useEffect(() => {
    setWidgetRuntimeContext(true);
    return () => setWidgetRuntimeContext(false);
  }, []);

  const { data, isLoading, error } = useWidgetBootstrap(slug, true);

  const basePracticeConfig = useMemo<UIPracticeConfig | null>(() => {
    if (!data?.practiceDetails) return null;
    const pd = data.practiceDetails as Record<string, unknown>;
    const dataRecord = (pd.data && typeof pd.data === 'object' ? pd.data as Record<string, unknown> : null);
    const detailsRecord = (pd.details && typeof pd.details === 'object' ? pd.details as Record<string, unknown> : null);
    const nestedDetailsRecord = (dataRecord?.details && typeof dataRecord.details === 'object' ? dataRecord.details as Record<string, unknown> : null);
    const resolveString = (value: unknown): string | null => typeof value === 'string' && value.trim().length > 0 ? value : null;

    const practiceId = resolveString(pd.organizationId)
      ?? resolveString(pd.organization_id)
      ?? resolveString(dataRecord?.organizationId)
      ?? resolveString(dataRecord?.organization_id)
      ?? resolveString(detailsRecord?.organizationId)
      ?? resolveString(detailsRecord?.organization_id)
      ?? resolveString(detailsRecord?.practiceId)
      ?? resolveString(detailsRecord?.id)
      ?? resolveString(nestedDetailsRecord?.organizationId)
      ?? resolveString(nestedDetailsRecord?.organization_id)
      ?? resolveString(nestedDetailsRecord?.practiceId)
      ?? resolveString(nestedDetailsRecord?.id)
      ?? resolveString((pd as Record<string, unknown>).practiceId)
      ?? resolveString((pd as Record<string, unknown>).id)
      ?? resolveString(dataRecord?.practiceId)
      ?? resolveString(dataRecord?.id);
    const accentColor = resolveString(pd.accentColor)
      ?? resolveString(pd.accent_color)
      ?? resolveString(dataRecord?.accentColor)
      ?? resolveString(dataRecord?.accent_color)
      ?? resolveString(detailsRecord?.accentColor)
      ?? resolveString(detailsRecord?.accent_color)
      ?? resolveString(nestedDetailsRecord?.accentColor)
      ?? resolveString(nestedDetailsRecord?.accent_color);
    const description = resolveString(pd.description)
      ?? resolveString(pd.overview)
      ?? resolveString(detailsRecord?.description)
      ?? resolveString(detailsRecord?.overview);

    return {
      id: practiceId ?? '',
      slug: resolveString(pd.slug) ?? practiceSlug,
      name: resolveString(pd.name) ?? '',
      profileImage: resolveString(pd.logo) ?? undefined,
      description: description ?? '',
      availableServices: [],
      serviceQuestions: {},
      domain: '',
      brandColor: '#000000',
      accentColor: accentColor ?? 'gold',
      voice: {
        enabled: false,
        provider: 'cloudflare',
        voiceId: undefined,
        displayName: undefined,
        previewUrl: undefined,
      },
    };
  }, [data, practiceSlug]);

  const practiceConfig = basePracticeConfig; // no preview handling here
  const resolvedPracticeId = practiceConfig?.id || '';

  if (isLoading || !data) return <LoadingScreen />;
  if (error || !practiceConfig || !resolvedPracticeId) return <App404 />;

  const currentUrl = typeof window !== 'undefined' ? `${window.location.origin}${location.url}` : undefined;

  return (
    <>
      <SEOHead practiceConfig={practiceConfig} currentUrl={currentUrl} />
      <PublicIntakeCard>
        <WidgetApp
          practiceId={resolvedPracticeId}
          practiceConfig={practiceConfig}
          bootstrapConversationId={data.conversationId}
          bootstrapSession={data.session}
          intakeTemplate={data.intakeTemplate ?? null}
        />
      </PublicIntakeCard>
    </>
  );
};

export default PublicIntakeApp;
