import type { Components } from 'react-markdown';
import { useState, useRef, useEffect } from 'preact/hooks';
import type { ComponentChildren, VNode } from 'preact';
import { ClipboardDocumentCheckIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';

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
      className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/60 px-2 py-1 text-[11px] font-medium text-input-text opacity-0 transition focus-visible:opacity-100 group-hover:opacity-100"
      aria-label="Copy code snippet"
    >
      {copied ? (
        <>
          <ClipboardDocumentCheckIcon className="h-4 w-4" aria-hidden="true" />
          Copied
        </>
      ) : (
        <>
          <ClipboardDocumentIcon className="h-4 w-4" aria-hidden="true" />
          Copy
        </>
      )}
    </button>
  );
};

export const markdownComponents: Components = {
  a({ href, children, ...props }) {
    const hrefValue = typeof href === 'string' ? href : undefined;
    const isExternal = Boolean(hrefValue && (hrefValue.startsWith('http') || hrefValue.startsWith('//')));
    return (
      <a
        href={hrefValue}
        {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        className="text-accent-500 hover:text-accent-400 underline underline-offset-2 transition-colors duration-150"
        {...props}
      >
        {children}
      </a>
    );
  },

  table({ children, ...props }) {
    return (
      <div className="overflow-x-auto my-4 rounded-lg" style={{ boxShadow: 'var(--glass-rim-subtle)' }}>
        <table className="min-w-full text-sm border-collapse" {...props}>
          {children}
        </table>
      </div>
    );
  },

  thead({ children, ...props }) {
    return (
      <thead className="bg-white/10" {...props}>
        {children}
      </thead>
    );
  },

  th({ children, ...props }) {
    return (
      <th
        className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-input-placeholder border-b border-white/10"
        {...props}
      >
        {children}
      </th>
    );
  },

  td({ children, ...props }) {
    return (
      <td className="px-3 py-2 border-b border-white/[0.06] text-input-text" {...props}>
        {children}
      </td>
    );
  },

  tr({ children, ...props }) {
    return (
      <tr className="transition-colors hover:bg-white/[0.04]" {...props}>
        {children}
      </tr>
    );
  },

  code({ className, children, ...props }) {
    const isBlock = typeof className === 'string' && className.includes('language-');
    if (isBlock) {
      return (
        <code className="block font-mono text-sm leading-relaxed text-gray-100" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="px-1.5 py-0.5 rounded font-mono text-[0.85em] bg-white/10 text-accent-300" {...props}>
        {children}
      </code>
    );
  },

  pre({ children, ...props }) {
    const copyableText = getNodeText(children).replace(/\n$/, '');
    return (
      <div className="group relative my-3">
        {copyableText ? <CopyButton text={copyableText} /> : null}
        <pre
          className="overflow-x-auto rounded-lg p-4 bg-black/40 backdrop-blur-sm text-gray-100 text-sm leading-relaxed"
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
      <blockquote className="pl-4 border-l-2 border-accent-500/40 text-input-placeholder italic my-3" {...props}>
        {children}
      </blockquote>
    );
  },

  hr({ ...props }) {
    return <hr className="border-white/10 my-5" {...props} />;
  },
};
