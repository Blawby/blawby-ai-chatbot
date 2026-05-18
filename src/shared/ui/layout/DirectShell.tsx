import { FunctionComponent, type ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { setWidgetRuntimeContext } from '@/shared/utils/widgetAuth';
import { WidgetOverlayRoot } from '@/shared/ui/overlays/WidgetOverlayRoot';

interface DirectShellProps {
  children: ComponentChildren;
}

/**
 * DirectShell — full-viewport wrapper for the widget when a customer
 * visits the public URL directly (no `?v=widget`, no `/welcome`). Mobile-
 * first: the widget fills the viewport. No clipping, no max-width, no
 * rounded corners — the widget's own @container rules govern internal
 * layout.
 */
export const DirectShell: FunctionComponent<DirectShellProps> = ({ children }) => {
  useEffect(() => {
    setWidgetRuntimeContext(true);
    return () => {
      setWidgetRuntimeContext(false);
    };
  }, []);

  return (
    <>
      <div className="relative flex min-h-[100dvh] w-full flex-col bg-surface-app-frame">
        <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col">
          {children}
        </div>
      </div>
      <WidgetOverlayRoot />
    </>
  );
};

export default DirectShell;
