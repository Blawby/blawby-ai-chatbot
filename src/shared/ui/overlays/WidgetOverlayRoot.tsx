import { FunctionComponent } from 'preact';

export const WIDGET_OVERLAY_ROOT_ID = 'widget-overlay-root';

export const resolveOverlayMount = (): Element => {
  if (typeof document === 'undefined') {
    throw new Error('resolveOverlayMount called outside browser');
  }
  return document.getElementById(WIDGET_OVERLAY_ROOT_ID) ?? document.body;
};

export const WidgetOverlayRoot: FunctionComponent = () => (
  <div id={WIDGET_OVERLAY_ROOT_ID} />
);

export default WidgetOverlayRoot;
