import { memo } from 'preact/compat';

const LoadingIndicator = memo(() => {
  return (
    <div className="message message-ai">
      <div 
        className="loading-indicator"
        role="status"
        aria-live="polite"
        aria-label="Loading"
      >
        <div className="dot" />
        <div className="dot" />
        <div className="dot" />
      </div>
    </div>
  );
});

(LoadingIndicator as { displayName?: string }).displayName = 'LoadingIndicator';

export default LoadingIndicator;
