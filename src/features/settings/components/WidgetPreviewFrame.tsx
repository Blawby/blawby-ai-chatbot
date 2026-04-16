import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { WidgetPreviewConfig, WidgetPreviewMessage, WidgetPreviewScenario } from '@/shared/types/widgetPreview';

type WidgetPreviewFrameProps = {
  practiceSlug?: string | null;
  scenario: WidgetPreviewScenario;
  config: WidgetPreviewConfig;
  title?: string;
};

export const WidgetPreviewFrame = ({
  practiceSlug,
  scenario,
  config,
  title = 'Widget preview',
}: WidgetPreviewFrameProps) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);


  const src = useMemo(() => {
    if (!practiceSlug) return null;
    const params = new URLSearchParams({
      v: 'widget',
      preview: '1',
      scenario,
    });
    return `/public/${encodeURIComponent(practiceSlug)}?${params.toString()}`;
  }, [practiceSlug, scenario]);

  const message = useMemo<WidgetPreviewMessage>(() => ({
    type: 'blawby:widget-preview-config',
    scenario,
    payload: config,
  }), [config, scenario]);

  useEffect(() => {
    if (loadedSrc !== src) return;
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    const sendMessage = () => target.postMessage(message, window.location.origin);
    sendMessage();
    const retryDelays = [100, 500];
    const timers = retryDelays.map((delay) => window.setTimeout(sendMessage, delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [loadedSrc, message, src]);

  if (!src) {
    return (
      <div className="rounded-xl border border-line-glass/40 bg-surface-card p-4 text-sm text-input-placeholder">
        Select a practice to preview the widget.
      </div>
    );
  }

  return (
    <div className="w-full">
      <h3 className="mb-3 text-sm font-semibold text-input-text">Preview</h3>
      <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-xl border border-line-glass/40 bg-surface-card shadow-xl">
        <iframe
          ref={iframeRef}
          title={title}
          src={src}
          className="h-[640px] w-full bg-surface-ground"
          onLoad={() => setLoadedSrc(src)}
          sandbox="allow-scripts allow-same-origin allow-forms"
        />
      </div>
    </div>
  );
};
