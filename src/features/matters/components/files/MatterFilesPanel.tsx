import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { ArrowDownTrayIcon, DocumentIcon } from '@heroicons/react/24/outline';
import { Icon } from '@/shared/ui/Icon';
import { Button } from '@/shared/ui/Button';
import { FileCard } from '@/shared/ui/upload/molecules/FileCard';
import { getMimeTypeFromFilename } from '@/shared/utils/fileTypeUtils';
import {
  listMatterUploads,
  type BackendUploadRecord,
} from '@/shared/lib/uploadsApi';
import { formatFileSize } from '@/shared/utils/mediaAggregation';
import { Fullscreen } from '@/shared/ui/dialog';

const MAX_FILENAME_DISPLAY_LENGTH = 20;

interface MatterFilesPanelProps {
  matterId: string;
}

type FileCategory = 'image' | 'video' | 'document' | 'audio' | 'other';

const CATEGORY_LABELS: Record<FileCategory, string> = {
  image: 'Photos',
  video: 'Videos',
  document: 'Documents',
  audio: 'Audio',
  other: 'Other Files',
};

const CATEGORY_ORDER: FileCategory[] = ['image', 'video', 'document', 'audio', 'other'];

function getFileCategory(mimeType: string, filename: string): FileCategory {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
  if (mimeType.startsWith('video/') || ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv'].includes(ext)) return 'video';
  if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext)) return 'audio';
  if (
    mimeType.includes('pdf') ||
    mimeType.includes('document') ||
    mimeType.includes('spreadsheet') ||
    ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf'].includes(ext)
  ) return 'document';
  return 'other';
}

interface FileGroup {
  category: FileCategory;
  files: BackendUploadRecord[];
}

function groupByCategory(uploads: BackendUploadRecord[]): FileGroup[] {
  const groups: Record<FileCategory, BackendUploadRecord[]> = {
    image: [], video: [], document: [], audio: [], other: [],
  };
  for (const upload of uploads) {
    const mimeType =
      upload.mime_type && upload.mime_type !== 'application/octet-stream'
        ? upload.mime_type
        : getMimeTypeFromFilename(upload.file_name);
    groups[getFileCategory(mimeType, upload.file_name)].push(upload);
  }
  return CATEGORY_ORDER
    .map((cat) => ({ category: cat, files: groups[cat] }))
    .filter((g) => g.files.length > 0);
}

function triggerDownload(url: string, name: string) {
  const link = document.createElement('a');
  link.href = url;
  // The `download` attribute is ignored by browsers for cross-origin URLs
  // (e.g. public_url pointing to S3/CDN). For cross-origin targets, open in a
  // new tab and let the server's Content-Disposition header drive the behaviour.
  // For reliable forced-download from S3/CDN, the backend should serve a signed
  // redirect through /api/uploads/{id}/download with Content-Disposition: attachment.
  try {
    if (new URL(url).origin !== window.location.origin) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    } else {
      link.download = name;
    }
  } catch {
    link.download = name;
  }
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function MatterFilesPanel({ matterId }: MatterFilesPanelProps) {
  const [uploads, setUploads] = useState<BackendUploadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxName, setLightboxName] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);

  const fetchUploads = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    listMatterUploads({ matterId, signal: controller.signal })
      .then((records) => {
        setUploads(records.filter((r) => r.status === 'verified'));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load files.');
        setLoading(false);
      });
  }, [matterId]);

  useEffect(() => {
    fetchUploads();
    return () => { abortRef.current?.abort(); };
  }, [fetchUploads]);

  const groups = groupByCategory(uploads);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-input-placeholder">
        Loading files…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-input-placeholder">{error}</p>
        <Button variant="secondary" size="sm" onClick={fetchUploads}>
          Retry
        </Button>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <Icon icon={DocumentIcon} className="w-8 h-8 text-input-placeholder/50" />
        <p className="text-sm font-medium text-input-text">No verified files</p>
        <p className="text-xs text-input-placeholder">
          Only verified uploads are displayed — pending or rejected files are hidden.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <div key={group.category} className="flex flex-col gap-2">
            <h5 className="text-[10px] font-bold text-input-placeholder uppercase tracking-[0.2em]">
              {CATEGORY_LABELS[group.category]} ({group.files.length})
            </h5>
            <div className="flex flex-col gap-2">
              {group.files.map((upload) => {
                const mimeType =
                  upload.mime_type && upload.mime_type !== 'application/octet-stream'
                    ? upload.mime_type
                    : getMimeTypeFromFilename(upload.file_name);
                const isImage = group.category === 'image';
                const publicUrl = upload.public_url ?? '';

                return (
                  <div
                    key={upload.id}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer transition-all duration-200 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-accent-500/50 rounded-xl"
                    onClick={() => {
                      if (!publicUrl) return;
                      if (isImage) {
                        setLightboxUrl(publicUrl);
                        setLightboxName(upload.file_name);
                      } else {
                        triggerDownload(publicUrl, upload.file_name);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (!publicUrl) return;
                        if (isImage) {
                          setLightboxUrl(publicUrl);
                          setLightboxName(upload.file_name);
                        } else {
                          triggerDownload(publicUrl, upload.file_name);
                        }
                      }
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <FileCard
                        fileName={upload.file_name}
                        mimeType={mimeType}
                        status="preview"
                        imageUrl={isImage && publicUrl ? publicUrl : undefined}
                        size="sm"
                        className="flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-xs sm:text-sm font-medium text-input-text whitespace-nowrap overflow-hidden text-ellipsis"
                          title={upload.file_name}
                        >
                          {upload.file_name.length > MAX_FILENAME_DISPLAY_LENGTH
                            ? `${upload.file_name.substring(0, MAX_FILENAME_DISPLAY_LENGTH)}…`
                            : upload.file_name}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-accent-500">
                            {formatFileSize(upload.file_size)}
                          </span>
                          {publicUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e: MouseEvent) => {
                                e.stopPropagation();
                                triggerDownload(publicUrl, upload.file_name);
                              }}
                              onKeyDown={(e: KeyboardEvent) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  triggerDownload(publicUrl, upload.file_name);
                                }
                              }}
                              title="Download file"
                              className="p-1.5 surface-hover rounded-lg text-input-placeholder hover:text-input-text"
                            >
                              <Icon icon={ArrowDownTrayIcon} className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {lightboxUrl && (
        <Fullscreen
          isOpen={Boolean(lightboxUrl)}
          onClose={() => { setLightboxUrl(null); setLightboxName(''); }}
          showCloseButton
        >
          <div className="flex flex-col items-center gap-4">
            <img
              src={lightboxUrl}
              alt={lightboxName}
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl cursor-default"
            />
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-1">{lightboxName}</h3>
            </div>
          </div>
        </Fullscreen>
      )}
    </>
  );
}
