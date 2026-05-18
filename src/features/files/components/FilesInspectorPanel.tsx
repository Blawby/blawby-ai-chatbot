import { Download, ExternalLink, X } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { isImageFile, getFileTypeConfig } from '@/shared/utils/fileTypeUtils';
import { triggerDownload, openFile } from '@/shared/utils/fileDownload';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { useNavigation } from '@/shared/utils/navigation';
import { folderForFile, type OrgFile } from '@/features/files/utils/fileCategory';

interface FilesInspectorPanelProps {
  file: OrgFile;
  practiceSlug: string;
  scope: 'practice' | 'client';
  onClose: () => void;
}

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
};

const associationHref = (
  file: OrgFile,
  practiceSlug: string,
  scope: 'practice' | 'client',
): string | null => {
  const slug = encodeURIComponent(practiceSlug);
  if (file.matterId) {
    const base = scope === 'practice' ? '/practice' : '/client';
    return `${base}/${slug}/matters/${encodeURIComponent(file.matterId)}/files`;
  }
  if (file.intakeUuid && scope === 'practice') {
    return `/practice/${slug}/intakes/responses/${encodeURIComponent(file.intakeUuid)}`;
  }
  return null;
};

export const FilesInspectorPanel = ({ file, practiceSlug, scope, onClose }: FilesInspectorPanelProps) => {
  const { navigate } = useNavigation();
  const fileType = getFileTypeConfig(file.fileName, file.mimeType);
  const association = folderForFile(file);
  const showImage = isImageFile(file.mimeType) && file.publicUrl;
  const href = associationHref(file, practiceSlug, scope);
  const publicUrl = file.publicUrl;

  return (
    <aside
      aria-label="File details"
      className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-line-glass/30 bg-surface-card"
    >
      <header className="flex items-center justify-between border-b border-line-glass/30 px-4 py-3">
        <h2 className="text-sm font-semibold text-input-text">Details</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="flex h-7 w-7 items-center justify-center rounded-md text-input-placeholder hover:bg-surface-panel hover:text-input-text"
        >
          <Icon icon={X} className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
        <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl bg-surface-panel">
          {showImage ? (
            <img src={publicUrl ?? undefined} alt={file.fileName} className="h-full w-full object-contain" />
          ) : (
            <div className={`flex h-20 w-20 items-center justify-center rounded-2xl ${fileType.color}`}>
              <Icon icon={fileType.icon} className="h-10 w-10 text-input-text" />
            </div>
          )}
        </div>

        <div>
          <h3 className="break-words text-base font-semibold text-input-text">{file.fileName}</h3>
          <p className="mt-1 text-xs text-input-placeholder">
            {fileType.label} · {formatBytes(file.fileSize)}
          </p>
        </div>

        <dl className="space-y-3 text-sm">
          <div className="flex items-start justify-between gap-4">
            <dt className="text-input-placeholder">Source</dt>
            <dd className="text-right text-input-text">
              {association.kind === 'loose' ? (
                <span>Loose file</span>
              ) : href ? (
                <button
                  type="button"
                  onClick={() => navigate(href)}
                  className="text-accent-500 hover:underline"
                >
                  {association.label}
                </button>
              ) : (
                <span>{association.label}</span>
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-input-placeholder">Added</dt>
            <dd className="text-right text-input-text">
              {file.createdAt ? formatRelativeTime(file.createdAt) : '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-input-placeholder">Type</dt>
            <dd className="text-right text-input-text">{file.mimeType || '—'}</dd>
          </div>
        </dl>
      </div>

      {publicUrl ? (
        <footer className="flex gap-2 border-t border-line-glass/30 px-4 py-3">
          <Button
            variant="secondary"
            size="sm"
            icon={ExternalLink}
            onClick={() => openFile(publicUrl)}
          >
            Open
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Download}
            onClick={() => triggerDownload(publicUrl, file.fileName)}
          >
            Download
          </Button>
        </footer>
      ) : null}
    </aside>
  );
};

export default FilesInspectorPanel;
