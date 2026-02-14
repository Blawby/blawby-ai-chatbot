import { useMemo, useRef, useState } from 'preact/hooks';
import ReactMarkdown from 'react-markdown';
import {
  Bars3BottomLeftIcon,
  CloudArrowUpIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  LinkIcon,
  ListBulletIcon,
  NumberedListIcon
} from '@heroicons/react/24/outline';
import { cn } from '@/shared/utils/cn';
import { uploadWithProgress, validateFile } from '@/shared/services/upload/UploadTransport';
import { useUniqueId } from '@/shared/hooks/useUniqueId';

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
  label?: string;
  showLabel?: boolean;
  showTabs?: boolean;
  showFooter?: boolean;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
}

const createMarkdownForUpload = (file: File, url: string): string => {
  // Escape [ and ] in the filename, and ) in the url
  const safeName = file.name.replace(/([\[\]])/g, '\\$1');
  const safeUrl = url.replace(/\)/g, '\\)');
  if (file.type.startsWith('image/')) {
    return `![${safeName}](${safeUrl})`;
  }
  return `[${safeName}](${safeUrl})`;
};

export const MarkdownUploadTextarea = ({
  value,
  onChange,
  practiceId,
  conversationId,
  label = 'Description',
  showLabel = true,
  showTabs = true,
  showFooter = true,
  placeholder = 'Describe the matter. You can also drop or paste files to upload and insert links.',
  rows = 8,
  maxLength = 5000,
  disabled = false,
  className
}: MarkdownUploadTextareaProps) => {
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadState[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editorId = useUniqueId('markdown-upload-textarea');

  const isUploading = useMemo(
    () => uploadItems.some((item) => item.status === 'uploading'),
    [uploadItems]
  );

  const insertAtCursor = (textToInsert: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      const withSpacing = value.trim().length > 0 ? `${value}\n\n${textToInsert}` : textToInsert;
      onChange(withSpacing);
      return;
    }

    const selectionStart = textarea.selectionStart ?? value.length;
    const selectionEnd = textarea.selectionEnd ?? value.length;
    const before = value.slice(0, selectionStart);
    const after = value.slice(selectionEnd);
    const prefix = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    const suffix = after.length > 0 && !after.startsWith('\n') ? '\n' : '';
    const nextValue = `${before}${prefix}${textToInsert}${suffix}${after}`;

    onChange(nextValue);
  };

  const replaceSelection = (prefix: string, suffix = '', placeholder = '') => {
    const textarea = textareaRef.current;
    if (!textarea) {
      const fallback = `${prefix}${placeholder}${suffix}`;
      insertAtCursor(fallback);
      return;
    }

    const selectionStart = textarea.selectionStart ?? value.length;
    const selectionEnd = textarea.selectionEnd ?? value.length;
    const selected = value.slice(selectionStart, selectionEnd);
    const insertText = selected || placeholder;
    const before = value.slice(0, selectionStart);
    const after = value.slice(selectionEnd);
    const nextValue = `${before}${prefix}${insertText}${suffix}${after}`;
    onChange(nextValue);
  };

  const prependToLine = (prefix: string, fallback = '') => {
    const textarea = textareaRef.current;
    if (!textarea) {
      insertAtCursor(`${prefix}${fallback}`);
      return;
    }

    const selectionStart = textarea.selectionStart ?? value.length;
    const selectionEnd = textarea.selectionEnd ?? value.length;
    const selected = value.slice(selectionStart, selectionEnd);
    if (selected) {
      const nextValue = `${value.slice(0, selectionStart)}${selected
        .split('\n')
        .map((line) => `${prefix}${line}`)
        .join('\n')}${value.slice(selectionEnd)}`;
      onChange(nextValue);
      return;
    }

    const lineStart = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
    const nextValue = `${value.slice(0, lineStart)}${prefix}${value.slice(lineStart)}`;
    if (value.length === 0 && fallback) {
      onChange(`${prefix}${fallback}`);
      return;
    }
    onChange(nextValue);
  };

  const handleFiles = async (incoming: FileList | File[]) => {
    const files = Array.from(incoming);
    if (files.length === 0) return;
    if (disabled) return;

    const resolvedPracticeId = (practiceId ?? '').trim();
    if (!resolvedPracticeId) {
      setUploadError('Missing practice context. Please refresh and try again.');
      return;
    }

    setUploadError(null);

    for (const file of files) {
      const validation = validateFile(file);
      if (!validation.isValid) {
        setUploadError(validation.error ?? `Unsupported file: ${file.name}`);
        continue;
      }

      const uploadId = crypto.randomUUID();
      setUploadItems((prev) => [
        ...prev,
        {
          id: uploadId,
          name: file.name,
          progress: 0,
          status: 'uploading'
        }
      ]);

      try {
        const uploaded = await uploadWithProgress(file, {
          practiceId: resolvedPracticeId,
          conversationId,
          onProgress: (progress) => {
            setUploadItems((prev) =>
              prev.map((item) =>
                item.id === uploadId
                  ? { ...item, progress: progress.percentage }
                  : item
              )
            );
          }
        });

        setUploadItems((prev) =>
          prev.map((item) =>
            item.id === uploadId
              ? { ...item, status: 'uploaded', progress: 100 }
              : item
          )
        );

        insertAtCursor(createMarkdownForUpload(file, uploaded.url));
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
    <div className={cn('space-y-2', className)}>
      {showLabel ? (
        <label htmlFor={editorId} className="block text-sm font-medium text-input-text">
          {label}
        </label>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-line-glass/30 bg-surface-overlay/60 backdrop-blur-xl">
        {showTabs ? (
          <div className="flex items-center justify-between border-b border-line-glass/30 bg-surface-overlay/70 px-2 py-2">
            <div className="flex items-center">
              <button
                type="button"
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  activeTab === 'write'
                    ? 'text-input-text'
                    : 'text-input-placeholder hover:text-input-text'
                )}
                onClick={() => setActiveTab('write')}
              >
                Write
              </button>
              <button
                type="button"
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  activeTab === 'preview'
                    ? 'text-input-text'
                    : 'text-input-placeholder hover:text-input-text'
                )}
                onClick={() => setActiveTab('preview')}
              >
                Preview
              </button>
            </div>
            <div className="flex items-center gap-2 text-input-placeholder">
              <div className="flex items-center gap-1">
                <button type="button" className="rounded p-1 hover:text-input-text" aria-label="Insert heading" onClick={() => prependToLine('# ', 'Heading')}>
                  <span className="text-xs font-semibold leading-none">H</span>
                </button>
                <button type="button" className="rounded p-1 hover:text-input-text" aria-label="Bold" onClick={() => replaceSelection('**', '**', 'bold text')}>
                  <span className="text-xs font-semibold leading-none">B</span>
                </button>
                <button type="button" className="rounded p-1 hover:text-input-text" aria-label="Italic" onClick={() => replaceSelection('*', '*', 'italic text')}>
                  <span className="text-xs italic leading-none">I</span>
                </button>
                <button type="button" className="rounded p-1 hover:text-input-text" aria-label="Quote" onClick={() => prependToLine('> ', 'Quoted text')}>
                  <Bars3BottomLeftIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="h-4 w-px bg-line-glass/50" />
              <div className="flex items-center gap-1">
                <button type="button" className="rounded p-1 hover:text-input-text" aria-label="Code block" onClick={() => replaceSelection('```\n', '\n```', 'code')}>
                  <CodeBracketIcon className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" className="rounded p-1 hover:text-input-text" aria-label="Insert link" onClick={() => replaceSelection('[', '](https://)', 'link text')}>
                  <LinkIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="h-4 w-px bg-line-glass/50" />
              <div className="flex items-center gap-1">
                <button type="button" className="rounded p-1 hover:text-input-text" aria-label="Bulleted list" onClick={() => prependToLine('- ', 'List item')}>
                  <ListBulletIcon className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" className="rounded p-1 hover:text-input-text" aria-label="Numbered list" onClick={() => prependToLine('1. ', 'List item')}>
                  <NumberedListIcon className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" className="rounded p-1 hover:text-input-text" aria-label="Task list" onClick={() => prependToLine('- [ ] ', 'Task')}>
                  <DocumentTextIcon className="h-4 w-4" aria-hidden="true" />
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
                if (!disabled) setIsDragActive(true);
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
                void handleFiles(event.dataTransfer?.files ?? []);
              }}
              onPaste={(event) => {
                const clipboardFiles = event.clipboardData?.files;
                if (clipboardFiles && clipboardFiles.length > 0) {
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
                <ReactMarkdown>{value}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-input-placeholder">Nothing to preview yet.</p>
            )}
          </div>
        )}

        {showFooter ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-glass/30 px-4 py-2 text-sm">
            <div className="flex items-center gap-2 text-input-placeholder">
              <CloudArrowUpIcon className="h-4 w-4" aria-hidden="true" />
              <button
                type="button"
                className="hover:text-input-text"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
              >
                Paste, drop, or click to add files
              </button>
            </div>
            <div className="text-input-placeholder">{value.length}/{maxLength}</div>
          </div>
        ) : null}
      </div>

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

      {uploadItems.length > 0 && (
        <div className="space-y-1 rounded-xl border border-line-glass/30 bg-surface-overlay/50 px-3 py-2">
          {uploadItems.map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-xs text-input-placeholder">
              <DocumentTextIcon className="h-4 w-4" aria-hidden="true" />
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
      {isUploading && (
        <p className="text-xs text-input-placeholder">Uploading files…</p>
      )}
    </div>
  );
};
