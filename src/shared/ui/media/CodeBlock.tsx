import { useCallback, useState } from 'preact/hooks';
import { cn } from '@/shared/utils/cn';
import { Check, Copy } from 'lucide-preact';

export interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
  showCopy?: boolean;
  className?: string;
}

export function CodeBlock({
  code,
  language,
  filename,
  showLineNumbers = false,
  showCopy = true,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const lines = code.split('\n');

  return (
    <div className={cn('rounded-xl overflow-hidden glass-panel', className)}>
      {(filename || showCopy) && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-line-glass/10">
          <div className="flex items-center gap-2">
            {filename && (
              <span className="text-xs font-mono text-input-placeholder">{filename}</span>
            )}
            {language && !filename && (
              <span className="text-[10px] uppercase tracking-wider text-input-placeholder/70 font-medium">
                {language}
              </span>
            )}
          </div>
          {showCopy && (
            <button
              type="button"
              onClick={handleCopy}
              aria-label={copied ? 'Copied' : 'Copy code'}
              className="p-1 rounded-md text-input-placeholder hover:text-input-text transition-colors"
            >
              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            </button>
          )}
        </div>
      )}
      <pre className="overflow-x-auto p-4 text-sm font-mono text-input-text leading-relaxed">
        <code>
          {lines.map((line, i) => (
            <div key={i} className="flex">
              {showLineNumbers && (
                <span className="select-none pr-4 text-right min-w-[2.5rem] text-input-placeholder/40 tabular-nums">
                  {i + 1}
                </span>
              )}
              <span>{line || '\n'}</span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}
