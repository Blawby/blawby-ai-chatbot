import { useMemo, useRef, useState, useEffect } from 'preact/hooks';
import {
  Bars3BottomLeftIcon,
  CloudArrowUpIcon,
  CodeBracketIcon,
  EllipsisVerticalIcon,
  DocumentTextIcon,
  LinkIcon,
  ListBulletIcon,
  NumberedListIcon
} from '@heroicons/react/24/outline';
import { Icon } from '@/shared/ui/Icon';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { cn } from '@/shared/utils/cn';
import { useUniqueId } from '@/shared/hooks/useUniqueId';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown';
import remarkGfm from 'remark-gfm';
import { markdownComponents } from '@/shared/ui/markdown/markdownComponents';
import { uploadFileViaBackend } from '@/shared/lib/uploadsApi';

// Custom hook to dynamically import react-markdown on client
function useReactMarkdown() {
  // dynamic import: type is unknown until loaded, must use any
  const [ReactMarkdown, setReactMarkdown] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    const loadMarkdown = async () => {
      try {
        const mod = await import('react-markdown');
        if (mounted) {
          setReactMarkdown(() => mod.default);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to load markdown preview';
          setError(errorMsg);
          setReactMarkdown(null);
        }
      }
    };

    void loadMarkdown();

    return () => {
      mounted = false;
    };
  }, [retryCount]);

  const retry = () => {
    setRetryCount((prev) => prev + 1);
  };

  return { component: ReactMarkdown, error, retry };
}

type UploadState = {
  id: string;
  name: string;
  progress: number;
  status: 'uploading' | 'uploaded' | 'failed';
  error?: string;
};

export interface MarkdownUploadTextareaProps {
  value: string;
  onChange: (value: string) => void;
  practiceId?: string | null;
  conversationId?: string;
  matterId?: string | null;
  label?: string;
  showLabel?: boolean;
  showTabs?: boolean;
  showFooter?: boolean;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
  defaultTab?: 'write' | 'preview';
}

const createMarkdownForUpload = (file: File, url: string): string => {
  const safeName = file.name.replace(/[[]()]/g, '$&');
  const safeUrl = url.replace(/\)/g, '\\)');
  if (file.type.startsWith('image/')) {
    return `![${safeName}](${safeUrl})`;
  }
  return `[${safeName}](${safeUrl})`;
};

export const MarkdownUploadTextarea = ({
  value,
  onChange,
  practiceId: _practiceId,
  conversationId: _conversationId,
  matterId,
  label = 'Description',
  showLabel = true,
  showTabs = true,
  showFooter = true,
  placeholder = 'Describe the matter. You can also drop or paste files to upload and insert links.',
  rows = 8,
  maxLength = 5000,
  disabled = false,
  className = '',
  defaultTab = 'write'
}: MarkdownUploadTextareaProps) => {
  const { component: ReactMarkdown, error: markdownError, retry: retryMarkdown } = useReactMarkdown();

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editorId = useUniqueId('markdown-upload-textarea');
  const valueRef = useRef(value);
  valueRef.current = value;

  const [activeTab, setActiveTab] = useState<'write' | 'preview'>(defaultTab);
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadState[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const resolvedMatterId = (matterId ?? '').trim();
  const uploadsEnabled = resolvedMatterId.length > 0;

  const isUploading = useMemo(
    () => uploadItems.some((item) => item.status === 'uploading'),
    [uploadItems]
  );

  const insertAtCursor = (textToInsert: string) => {
    const textarea = textareaRef.current;
    const currentValue = valueRef.current;
    let selectionStart = currentValue.length;
    let selectionEnd = currentValue.length;
    if (textarea) {
      selectionStart = textarea.selectionStart ?? currentValue.length;
      selectionEnd = textarea.selectionEnd ?? currentValue.length;
    }
    const before = currentValue.slice(0, selectionStart);
    const after = currentValue.slice(selectionEnd);
    const prefix = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    const suffix = after.length > 0 && !after.startsWith('\n') ? '\n' : '';
    const finalString = `${before}${prefix}${textToInsert}${suffix}${after}`;
    onChange(finalString);
  };

  const replaceSelection = (prefix: string, suffix = '', placeholder = '') => {
    const textarea = textareaRef.current;
    const currentValue = valueRef.current;
    let selectionStart = currentValue.length;
    let selectionEnd = currentValue.length;
    if (textarea) {
      selectionStart = textarea.selectionStart ?? currentValue.length;
      selectionEnd = textarea.selectionEnd ?? currentValue.length;
    }
    const selected = currentValue.slice(selectionStart, selectionEnd);
    const insertText = selected || placeholder;
    const before = currentValue.slice(0, selectionStart);
    const after = currentValue.slice(selectionEnd);
    const finalString = `${before}${prefix}${insertText}${suffix}${after}`;
    onChange(finalString);
  };

  const prependToLine = (prefix: string, fallback = '') => {
    const textarea = textareaRef.current;
    const currentValue = valueRef.current;
    let selectionStart = currentValue.length;
    let selectionEnd = currentValue.length;
    if (textarea) {
      selectionStart = textarea.selectionStart ?? currentValue.length;
      selectionEnd = textarea.selectionEnd ?? currentValue.length;
    }
    const selected = currentValue.slice(selectionStart, selectionEnd);
    if (selected) {
      const before = currentValue.slice(0, selectionStart);
      const after = currentValue.slice(selectionEnd);
      const lines = selected.split('\n').map((line) => `${prefix}${line}`).join('\n');
      const finalString = `${before}${lines}${after}`;
      onChange(finalString);
      return;
    }
    const lineStart = currentValue.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
    if (currentValue.length === 0 && fallback) {
      onChange(`${prefix}${fallback}`);
      return;
    }
    const finalString = `${currentValue.slice(0, lineStart)}${prefix}${currentValue.slice(lineStart)}`;
    onChange(finalString);
  };

  const handleFiles = async (incoming: FileList | File[]) => {
    const files = Array.from(incoming);
    if (files.length === 0) return;
    if (disabled) return;
    if (!uploadsEnabled) {
      setUploadError('File uploads are only available after the matter has been created.');
      return;
    }

    setUploadError(null);

    for (const file of files) {
      const uploadId = crypto.randomUUID();
      setUploadItems((prev) => [
        ...prev,
        {
          id: uploadId,
          name: file.name,
          progress: 0,
          status: 'uploading',
        },
      ]);

      try {
        const uploaded = await uploadFileViaBackend({
          file,
          uploadContext: 'matter',
          matterId: resolvedMatterId,
          subContext: 'documents',
          onProgress: (progress) => {
            setUploadItems((prev) =>
              prev.map((item) =>
                item.id === uploadId
                  ? { ...item, progress: progress.percentage }
                  : item
              )
            );
          },
        });

        if (!uploaded.publicUrl) {
          throw new Error('Matter upload completed without a public URL.');
        }

        setUploadItems((prev) =>
          prev.map((item) =>
            item.id === uploadId
              ? { ...item, status: 'uploaded', progress: 100 }
              : item
          )
        );

        insertAtCursor(createMarkdownForUpload(file, uploaded.publicUrl));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        setUploadItems((prev) =>
          prev.map((item) =>
            item.id === uploadId
              ? { ...item, status: 'failed', error: message }
              : item
          )
        );
        setUploadError(message);
      }
    }
  };
  return (
    <div className={cn('@container space-y-2', className)}>
      {showLabel ? (
        <label htmlFor={editorId} className="block text-sm font-medium text-input-text">
          {label}
        </label>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-line-glass/30 bg-surface-panel/80 shadow-glass backdrop-blur-xl dark:bg-surface-overlay/70">
        {showTabs ? (
          <div className="flex items-center justify-between gap-3 border-b border-line-glass/30 bg-surface-panel/70 px-2 py-2 dark:bg-surface-overlay/80">
            <div className="flex min-w-0 items-center gap-2 @xl:flex @xl:flex-none @xl:items-center @xl:gap-1">
              <button
                type="button"
                className={cn(
                  'rounded-xl px-3 py-2 text-sm font-medium transition-colors @xl:px-3 @xl:py-1.5',
                  activeTab === 'write'
                    ? 'bg-surface-workspace/90 text-input-text shadow-sm ring-1 ring-line-glass/25 dark:bg-surface-overlay/90'
                    : 'text-input-placeholder hover:text-input-text'
                )}
                onClick={() => setActiveTab('write')}
              >
                Write
              </button>
              <button
                type="button"
                className={cn(
                  'rounded-xl px-3 py-2 text-sm font-medium transition-colors @xl:px-3 @xl:py-1.5',
                  activeTab === 'preview'
                    ? 'bg-surface-workspace/90 text-input-text shadow-sm ring-1 ring-line-glass/25 dark:bg-surface-overlay/90'
                    : 'text-input-placeholder hover:text-input-text'
                )}
                onClick={() => setActiveTab('preview')}
              >
                Preview
              </button>
            </div>
            <div className="ml-auto flex items-center gap-2 @xl:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line-glass/25 bg-surface-overlay/40 text-input-placeholder transition-colors hover:text-input-text"
                    aria-label="Formatting options"
                  >
                    <Icon icon={EllipsisVerticalIcon} className="h-4 w-4" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 p-1.5">
                  <DropdownMenuItem
                    onSelect={() => prependToLine('# ', 'Heading')}
                    className="flex items-center gap-2 rounded-xl px-3 py-2"
                  >
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-line-glass/20 bg-surface-overlay/50 text-xs font-semibold">H</span>
                    <span>Heading</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => replaceSelection('**', '**', 'bold text')}
                    className="flex items-center gap-2 rounded-xl px-3 py-2"
                  >
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-line-glass/20 bg-surface-overlay/50 text-xs font-semibold">B</span>
                    <span>Bold</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => replaceSelection('*', '*', 'italic text')}
                    className="flex items-center gap-2 rounded-xl px-3 py-2"
                  >
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-line-glass/20 bg-surface-overlay/50 text-xs italic font-semibold">I</span>
                    <span>Italic</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => prependToLine('> ', 'Quoted text')}
                    className="flex items-center gap-2 rounded-xl px-3 py-2"
                  >
                    <Icon icon={Bars3BottomLeftIcon} className="h-4 w-4" aria-hidden="true" />
                    <span>Quote</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => replaceSelection('```\n', '\n```', 'code')}
                    className="flex items-center gap-2 rounded-xl px-3 py-2"
                  >
                    <Icon icon={CodeBracketIcon} className="h-4 w-4" aria-hidden="true" />
                    <span>Code</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => replaceSelection('[', '](https://)', 'link text')}
                    className="flex items-center gap-2 rounded-xl px-3 py-2"
                  >
                    <Icon icon={LinkIcon} className="h-4 w-4" aria-hidden="true" />
                    <span>Link</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => prependToLine('- ', 'List item')}
                    className="flex items-center gap-2 rounded-xl px-3 py-2"
                  >
                    <Icon icon={ListBulletIcon} className="h-4 w-4" aria-hidden="true" />
                    <span>Bulleted list</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => prependToLine('1. ', 'List item')}
                    className="flex items-center gap-2 rounded-xl px-3 py-2"
                  >
                    <Icon icon={NumberedListIcon} className="h-4 w-4" aria-hidden="true" />
                    <span>Numbered list</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => prependToLine('- [ ] ', 'Task')}
                    className="flex items-center gap-2 rounded-xl px-3 py-2"
                  >
                    <Icon icon={DocumentTextIcon} className="h-4 w-4" aria-hidden="true" />
                    <span>Task list</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="hidden items-center gap-2 text-input-placeholder @xl:flex @xl:flex-wrap">
              <div className="flex items-center gap-1">
                <button type="button" className="rounded p-1 transition-colors hover:text-input-text" aria-label="Insert heading" onClick={() => prependToLine('# ', 'Heading')}>
                  <span className="text-xs font-semibold leading-none">H</span>
                </button>
                <button type="button" className="rounded p-1 transition-colors hover:text-input-text" aria-label="Bold" onClick={() => replaceSelection('**', '**', 'bold text')}>
                  <span className="text-xs font-semibold leading-none">B</span>
                </button>
                <button type="button" className="rounded p-1 transition-colors hover:text-input-text" aria-label="Italic" onClick={() => replaceSelection('*', '*', 'italic text')}>
                  <span className="text-xs italic leading-none">I</span>
                </button>
                <button type="button" className="rounded p-1 transition-colors hover:text-input-text" aria-label="Quote" onClick={() => prependToLine('> ', 'Quoted text')}>
                  <Icon icon={Bars3BottomLeftIcon} className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="h-4 w-px bg-line-glass/50" />
              <div className="flex items-center gap-1">
                <button type="button" className="rounded p-1 transition-colors hover:text-input-text" aria-label="Code block" onClick={() => replaceSelection('```\n', '\n```', 'code')}>
                  <Icon icon={CodeBracketIcon} className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" className="rounded p-1 transition-colors hover:text-input-text" aria-label="Insert link" onClick={() => replaceSelection('[', '](https://)', 'link text')}>
                  <Icon icon={LinkIcon} className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="h-4 w-px bg-line-glass/50" />
              <div className="flex items-center gap-1">
                <button type="button" className="rounded p-1 transition-colors hover:text-input-text" aria-label="Bulleted list" onClick={() => prependToLine('- ', 'List item')}>
                  <Icon icon={ListBulletIcon} className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" className="rounded p-1 transition-colors hover:text-input-text" aria-label="Numbered list" onClick={() => prependToLine('1. ', 'List item')}>
                  <Icon icon={NumberedListIcon} className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" className="rounded p-1 transition-colors hover:text-input-text" aria-label="Task list" onClick={() => prependToLine('- [ ] ', 'Task')}>
                  <Icon icon={DocumentTextIcon} className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === 'write' ? (
          <div
            className={cn(
              'relative border border-transparent transition-colors',
              isDragActive ? 'border-accent-500/60 bg-accent-500/5' : ''
            )}
          >
            <textarea
              id={editorId}
              ref={textareaRef}
              value={value}
              disabled={disabled}
              rows={rows}
              maxLength={maxLength}
              placeholder={placeholder}
              className={cn(
                'w-full resize-y bg-transparent px-4 py-3 text-sm text-input-text placeholder:text-input-placeholder focus:outline-none',
                disabled ? 'cursor-not-allowed opacity-60' : ''
              )}
              onInput={(event) => onChange((event.currentTarget as HTMLTextAreaElement).value)}
              onDragOver={(event) => {
                event.preventDefault();
                if (!disabled && uploadsEnabled) setIsDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                if (event.relatedTarget && (event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) {
                  return;
                }
                setIsDragActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragActive(false);
                if (uploadsEnabled) {
                  void handleFiles(event.dataTransfer?.files ?? []);
                }
              }}
              onPaste={(event) => {
                const clipboardFiles = event.clipboardData?.files;
                if (uploadsEnabled && clipboardFiles && clipboardFiles.length > 0) {
                  event.preventDefault();
                  void handleFiles(clipboardFiles);
                }
              }}
            />
            {isDragActive && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface-overlay/70 text-sm font-medium text-input-text">
                Drop files to upload and insert links
              </div>
            )}
          </div>
        ) : (
          <div className="min-h-[220px] px-4 py-3">
            {value.trim().length > 0 ? (
              <div className="chat-markdown">
                {markdownError ? (
                  <div className="mt-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-600 dark:bg-red-900/20 dark:text-red-300">
                    <div className="mb-2">Failed to load markdown preview: {markdownError}</div>
                    <button
                      type="button"
                      onClick={retryMarkdown}
                      className="rounded bg-accent-error px-2 py-1 text-xs font-medium text-[rgb(var(--accent-foreground))] hover:bg-accent-error/80 dark:bg-accent-error/80 dark:hover:bg-accent-error/60"
                    >
                      Retry
                    </button>
                  </div>
                ) : ReactMarkdown ? (
                  <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
                    {value}
                  </ReactMarkdown>
                ) : (
                  <div className="mt-2 flex justify-center rounded border border-line-glass/20 bg-surface-panel p-2 dark:border-line-glass/40 dark:bg-surface-panel/40">
                    <LoadingSpinner size="sm" ariaLabel="Loading preview" />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-input-placeholder">Nothing to preview yet.</p>
            )}
          </div>
        )}

        {showFooter ? (
          <div className="flex flex-col gap-2 border-t border-line-glass/30 px-4 py-2 text-sm @xl:flex-row @xl:items-center @xl:justify-between">
            <div className="flex items-center gap-2 text-input-placeholder">
              {uploadsEnabled ? (
                <>
                  <Icon icon={CloudArrowUpIcon} className="h-4 w-4" aria-hidden="true"  />
                  <button
                    type="button"
                    className="hover:text-input-text"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={disabled}
                  >
                    Paste, drop, or click to add files
                  </button>
                </>
              ) : null}
            </div>
            <div className="text-input-placeholder @xl:text-right">{value.length}/{maxLength}</div>
          </div>
        ) : null}
      </div>

      {uploadsEnabled ? (
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={(event) => {
            const files = event.currentTarget.files;
            if (files) {
              void handleFiles(files);
              event.currentTarget.value = '';
            }
          }}
        />
      ) : null}

      {uploadItems.length > 0 && (
        <div className="space-y-1 rounded-xl border border-line-glass/30 bg-surface-overlay/50 px-3 py-2">
          {uploadItems.map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-xs text-input-placeholder">
              <Icon icon={DocumentTextIcon} className="h-4 w-4" aria-hidden="true"  />
              <span className="truncate">{item.name}</span>
              {item.status === 'uploading' && <span>{item.progress}%</span>}
              {item.status === 'uploaded' && <span className="text-emerald-300">uploaded</span>}
              {item.status === 'failed' && <span className="text-red-300">{item.error ?? 'failed'}</span>}
            </div>
          ))}
        </div>
      )}

      {uploadError && (
        <p className="text-sm text-red-300">{uploadError}</p>
      )}
      {isUploading ? (
        <div className="flex justify-center">
          <LoadingSpinner size="sm" ariaLabel="Uploading files" />
        </div>
      ) : null}
    </div>
  );
};
