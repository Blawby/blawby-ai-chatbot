import { FunctionComponent, type ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { setWidgetRuntimeContext } from '@/shared/utils/widgetAuth';
import { WidgetOverlayRoot } from '@/shared/ui/overlays/WidgetOverlayRoot';

interface EmbedShellProps {
  children: ComponentChildren;
}

/**
 * EmbedShell — transparent wrapper for the widget when it renders inside
 * the embed iframe (`?v=widget`). Adds no chrome: the iframe wrapper from
 * widget-loader.js already provides the visible frame (border-radius,
 * shadow, position). The shell exists to set widget runtime context and
 * mount the overlay portal target.
 */
export const EmbedShell: FunctionComponent<EmbedShellProps> = ({ children }) => {
  useEffect(() => {
    setWidgetRuntimeContext(true);
    return () => {
      setWidgetRuntimeContext(false);
    };
  }, []);

  return (
    <>
      <WidgetOverlayRoot />
      {children}
    </>
  );
};

export default EmbedShell;
