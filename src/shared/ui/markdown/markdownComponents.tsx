import type { Components } from 'react-markdown';
import { useState, useRef, useEffect } from 'preact/hooks';
import type { ComponentChildren, VNode, JSX } from 'preact';
import { useLocation } from 'preact-iso';
import { ClipboardCheck, Clipboard } from 'lucide-preact';

import { Icon } from '@/shared/ui/Icon';

/**
 * Shared react-markdown component overrides used across chat bubbles
 * and markdown previews. Keeps structural fixes and semantic markup
 * consistent wherever markdown is rendered.
 */
const getNodeText = (node: ComponentChildren): string => {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(getNodeText).join('');
  }
  const vnode = node as VNode;
  if (vnode && typeof vnode === 'object' && 'props' in vnode) {
    return getNodeText(vnode.props?.children);
  }
  return '';
};

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const handleCopy = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      timeoutRef.current = window.setTimeout(() => {
        setCopied(false);
        timeoutRef.current = null;
      }, 1800);
    } catch (error) {
      console.warn('[markdown] Failed to copy code block', error);
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md border border-[rgb(var(--surface-utility))]/10 bg-[rgb(var(--surface-app-frame))]/60 px-2 py-1 text-[11px] font-medium text-input-text opacity-0 transition focus-visible:opacity-100 group-hover:opacity-100"
      aria-label="Copy code snippet"
    >
      {copied ? (
        <>
          <Icon icon={ClipboardCheck} className="h-4 w-4" aria-hidden="true"  />
          Copied
        </>
      ) : (
        <>
          <Icon icon={Clipboard} className="h-4 w-4" aria-hidden="true"  />
          Copy
        </>
      )}
    </button>
  );
};

export const markdownComponents: Components = {
  a: MarkdownAnchor,

  table({ children, ...props }) {
    return (
      <div className="overflow-x-auto my-4 rounded-xl" style={{ boxShadow: 'var(--glass-rim-subtle)' }}>
        <table className="min-w-full text-sm border-collapse" {...props}>
          {children}
        </table>
      </div>
    );
  },

  thead({ children, ...props }) {
    return (
      <thead className="bg-[rgb(var(--surface-utility))]/10" {...props}>
        {children}
      </thead>
    );
  },

  th({ children, ...props }) {
    return (
      <th
        className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--input-placeholder))] border-b border-[rgb(var(--surface-utility))]/10"
        {...props}
      >
        {children}
      </th>
    );
  },

  td({ children, ...props }) {
    return (
      <td className="px-3 py-2 border-b border-[rgb(var(--surface-utility))]/6 text-[rgb(var(--input-foreground))]" {...props}>
        {children}
      </td>
    );
  },

  tr({ children, ...props }) {
    return (
      <tr className="transition-colors hover:bg-[rgb(var(--surface-utility))]/4" {...props}>
        {children}
      </tr>
    );
  },

  code({ className, children, ...props }) {
    const isBlock = typeof className === 'string' && className.includes('language-');
    if (isBlock) {
      return (
        <code className="block font-mono text-sm leading-relaxed text-[rgb(var(--accent-100))]" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="px-1.5 py-0.5 rounded font-mono text-[0.85em] bg-[rgb(var(--surface-utility))]/10 text-[rgb(var(--accent-300))]" {...props}>
        {children}
      </code>
    );
  },

  pre({ children, ...props }) {
    const copyableText = getNodeText(children).replace(/\n$/, '');
    return (
      <div className="group relative my-3 max-w-full min-w-0">
        {copyableText ? <CopyButton text={copyableText} /> : null}
        <pre
          className="max-w-full min-w-0 overflow-x-auto rounded-xl p-4 bg-[rgb(var(--surface-app-frame))]/40 backdrop-blur-sm text-[rgb(var(--input-foreground))] text-sm leading-relaxed"
          style={{ boxShadow: 'var(--glass-rim-subtle)' }}
          {...props}
        >
          {children}
        </pre>
      </div>
    );
  },

  blockquote({ children, ...props }) {
    return (
      <blockquote className="pl-4 border-l-2 border-[rgb(var(--accent-500))]/40 text-[rgb(var(--input-placeholder))] italic my-3" {...props}>
        {children}
      </blockquote>
    );
  },

  hr({ ...props }) {
    return <hr className="border-white/10 my-5" {...props} />;
  },
};

type MarkdownAnchorProps = {
  href?: string;
  children?: ComponentChildren;
  onClick?: (event: JSX.TargetedMouseEvent<HTMLAnchorElement>) => void;
  [key: string]: unknown;
};

function MarkdownAnchor({ href, children, ...props }: MarkdownAnchorProps) {
  const location = useLocation();
  const hrefValue = typeof href === 'string' ? href : undefined;
  const linkText = getNodeText(children).trim();
  const isMention = Boolean(hrefValue?.startsWith('mention://'));
  const isExternal = Boolean(hrefValue && (hrefValue.startsWith('http') || hrefValue.startsWith('//')));
  const isInternalRoute = Boolean(hrefValue && hrefValue.startsWith('/') && !hrefValue.startsWith('//'));
  const linkClassName = 'text-accent-500 hover:text-accent-400 underline underline-offset-2 transition-colors duration-150';

  if (isMention) {
    let cleanLabel = linkText.trim();
    if (cleanLabel.startsWith('mention://')) {
      cleanLabel = cleanLabel.replace(/^mention:\/\//, '');
    }
    if (!cleanLabel.startsWith('@')) {
      cleanLabel = `@${cleanLabel}`;
    }

    const pillClass = 'mention-token nav-item-active text-[rgb(var(--accent-foreground))] inline-flex items-center rounded-full px-2 py-0 text-[0.85em] font-semibold leading-relaxed no-underline mx-0.5 ring-1 ring-accent-400/25 whitespace-nowrap align-baseline';

    return (
      <span className={pillClass} title={cleanLabel}>
        <span className="mention-token__label">{cleanLabel}</span>
      </span>
    );
  }
  if (isInternalRoute && hrefValue) {
    return (
      <a
        href={hrefValue}
        className={linkClassName}
        onClick={(event) => {
          props.onClick?.(event);
          if (
            event.defaultPrevented
            || event.button !== 0
            || event.metaKey
            || event.altKey
            || event.ctrlKey
            || event.shiftKey
          ) {
            return;
          }
          event.preventDefault();
          location.route(hrefValue);
        }}
        {...props}
      >
        {children}
      </a>
    );
  }
  return (
    <a
      href={hrefValue}
      {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={linkClassName}
      {...props}
    >
      {children}
    </a>
  );
}
