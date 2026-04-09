import { FunctionComponent } from 'preact';

type ConversationEventRowProps = {
  content: string;
  className?: string;
};

const ConversationEventRow: FunctionComponent<ConversationEventRowProps> = ({
  content,
  className = '',
}) => (
  <div className={`px-4 py-3 ${className}`.trim()}>
    <div className="flex items-center gap-3 text-input-placeholder">
      <div className="h-px flex-1 bg-line-glass/30" />
      <p className="max-w-full shrink text-center text-xs font-medium tracking-wide text-input-placeholder">
        {content}
      </p>
      <div className="h-px flex-1 bg-line-glass/30" />
    </div>
  </div>
);

export default ConversationEventRow;
