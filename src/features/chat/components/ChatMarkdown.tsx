import { memo, useEffect, useMemo, useState } from 'preact/compat';
import type { ComponentChildren, FunctionComponent, VNode } from 'preact';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { MatterChip } from '@/design-system/patterns';

type UrlTransform = (url: string, key: string, node: unknown) => string;

// Custom hook to dynamically import react-markdown + its plugins + the
// shared markdownComponents map. All three live in the same lazy chunk so
// the entire markdown surface stays off the first-load critical path.
function useReactMarkdown() {
  // dynamic import: type is unknown until loaded, must use any
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [ReactMarkdown, setReactMarkdown] = useState<any>(null);
  const [remarkGfm, setRemarkGfm] = useState<any>(null);
  const [components, setComponents] = useState<any>(null);
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const [defaultUrlTransform, setDefaultUrlTransform] = useState<UrlTransform | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadMarkdown = async () => {
      try {
        const [mod, gfm, comps] = await Promise.all([
          import('react-markdown'),
          import('remark-gfm'),
          import('@/shared/ui/markdown/markdownComponents'),
        ]);
        if (mounted) {
          setReactMarkdown(() => mod.default);
          setRemarkGfm(() => gfm.default);
          setComponents(() => comps.markdownComponents);
          setDefaultUrlTransform(() => mod.defaultUrlTransform ?? null);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to load markdown component';
          setError(errorMsg);
          setReactMarkdown(null);
          setRemarkGfm(null);
          setComponents(null);
          setDefaultUrlTransform(null);
        }
      }
    };

    void loadMarkdown();

    return () => {
      mounted = false;
    };
  }, []);

  return { component: ReactMarkdown, remarkGfm, components, defaultUrlTransform, error };
}

interface ChatMarkdownProps {
  text: string;
  className?: string;
  isStreaming?: boolean;
  variant?: 'default' | 'compact' | 'detailed';
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'text-sm',
  md: 'text-[0.9375rem]',
  lg: 'text-base',
} as const;

const variantClasses = {
  default: '',
  compact: 'text-sm',
  detailed: 'text-base',
} as const;

// Extract plain text from react-markdown anchor children for MatterChip label
// fallback (when the href carries a matter id but the link text is empty).
const getNodeText = (node: ComponentChildren): string => {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getNodeText).join('');
  const vnode = node as VNode;
  if (vnode && typeof vnode === 'object' && 'props' in vnode) {
    return getNodeText(vnode.props?.children);
  }
  return '';
};

const ChatMarkdown: FunctionComponent<ChatMarkdownProps> = memo(({
  text,
  className,
  isStreaming,
  variant = 'default',
  size = 'md',
}) => {
  const { component: ReactMarkdown, remarkGfm, components: markdownComponents, defaultUrlTransform, error: markdownError } = useReactMarkdown();
  const sourceText = text ?? '';

  // Wrap the shared markdownComponents with a chat-local anchor that recognizes
  // `matter://` hrefs and renders them as DS MatterChip pills. All other link
  // protocols (mention://, internal routes, external) fall through to the
  // shared anchor handler unchanged.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chatComponents = useMemo<any>(() => {
    if (!markdownComponents) return null;
    const sharedAnchor = markdownComponents.a;
    if (!sharedAnchor) return markdownComponents;
    return {
      ...markdownComponents,
      // react-markdown anchor props (href + children + extras passed through).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      a(props: any) {
        const href = typeof props?.href === 'string' ? props.href : undefined;
        if (href && href.startsWith('matter://')) {
          const rawLabel = getNodeText(props.children).trim();
          const fallback = decodeURIComponent(href.slice('matter://'.length));
          const label = rawLabel || fallback;
          const urgent = href.includes('?urgent=1') || href.includes('&urgent=1');
          return <MatterChip urgent={urgent} title={label}>{label}</MatterChip>;
        }
        return sharedAnchor(props);
      },
    };
  }, [markdownComponents]);

  const classes = [
    'chat-markdown',
    'min-w-0 max-w-full',
    sizeClasses[size],
    variantClasses[variant],
    className,
  ].filter(Boolean).join(' ');

  const hasVisibleText = sourceText.trim().length > 0;
  const streamingCursor = (isStreaming && !hasVisibleText)
    ? <span className="chat-cursor" aria-hidden="true" />
    : null;

  // Pre-process text to wrap @mentions in a specific link format that doesn't split the @
  // Skip formatting inside inline code and code blocks.
  const processedText = useMemo(() => {
    if (!sourceText) return '';
    
    // Split text by markdown code blocks (```...```) or inline code (`...`)
    // The regex captures the code segment, preserving it during split
    const parts = sourceText.split(/(```[\s\S]*?```|`[^`]*`)/g);
    
    return parts.map((part, index) => {
      // Even indices are text outside of code blocks/spans, odd indices are the captured code
      if (index % 2 === 0) {
        // Match @Name-style mentions (allow up to 3 words) and wrap in mention:// links
        return part.replace(
          /(^|\s)(@(?:[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}._'-]*)(?:\s+[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}._'-]*){0,2})(?=(?:\s|$|[.,!?;:]))/gu,
          (_match, p1, p2) => `${p1}[${p2}](mention://${encodeURIComponent(p2)})`
        );
      }
      return part; // Leave code segments unmodified
    }).join('');
  }, [sourceText]);

  if (!sourceText && !isStreaming) return null;

  return (
    <div className={classes}>
      {markdownError ? (
        <div className="text-red-500 text-sm">Failed to load markdown: {markdownError}</div>
      ) : ReactMarkdown && remarkGfm && chatComponents ? (
        <ReactMarkdown
          components={chatComponents}
          remarkPlugins={[remarkGfm]}
          urlTransform={(url: string, key: string, node: unknown) => {
            // mention:// — user @mention pills (rendered by markdownComponents).
            // matter:// — matter entity references (rendered as DS MatterChip).
            // Both must bypass defaultUrlTransform's allow-list, which strips
            // unknown protocols.
            if (url.startsWith('mention://') || url.startsWith('matter://')) return url;
            return defaultUrlTransform ? defaultUrlTransform(url, key, node) : url;
          }}
        >
          {processedText}
        </ReactMarkdown>
      ) : (
        <div className="flex items-center justify-center py-2">
          <LoadingSpinner size="sm" ariaLabel="Loading markdown" />
        </div>
      )}
      {streamingCursor}
    </div>
  );
});

export default ChatMarkdown;
