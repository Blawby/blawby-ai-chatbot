import { FunctionComponent, type ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { setWidgetRuntimeContext } from '@/shared/utils/widgetAuth';
import { WidgetOverlayRoot } from '@/shared/ui/overlays/WidgetOverlayRoot';

interface MarketingShellProps {
  children: ComponentChildren;
}

/**
 * MarketingShell — decorated dark-page-with-centered-card wrapper for
 * branded public landing routes. Overlays portal out via
 * WidgetOverlayRoot, so the card does not clip its children — drawers
 * and dialogs paint across the full viewport.
 */
export const MarketingShell: FunctionComponent<MarketingShellProps> = ({ children }) => {
  useEffect(() => {
    setWidgetRuntimeContext(true);
    return () => {
      setWidgetRuntimeContext(false);
    };
  }, []);

  return (
    <>
      <div className="min-h-screen bg-paper p-4 md:p-8 flex items-center justify-center">
        <div className="relative mx-auto max-w-2xl w-full bg-paper rounded-2xl shadow-glass md:mt-8 min-h-[600px] md:min-h-[700px]">
          {children}
        </div>
      </div>
      <WidgetOverlayRoot />
    </>
  );
};

export default MarketingShell;
