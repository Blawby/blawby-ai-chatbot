import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';

import { UploadDropzone } from '@/shared/ui/upload/organisms/UploadDropzone';
import { UploadQueueRow } from '@/shared/ui/upload/molecules/UploadQueueRow';
import { cn } from '@/shared/utils/cn';

import { FilesGrid } from './FilesGrid';
import { FilesList } from './FilesList';
import { FilesViewToggle, type FilesViewMode } from './FilesViewToggle';
import { FileDetailDrawer } from './FileDetailDrawer';
import {
  DROPZONE_INSTRUCTION_TEXT,
  DROPZONE_VALIDATION_TEXT,
} from '@/features/files/constants';
import type { OrgFile } from '@/features/files/utils/fileCategory';

export type FilesCollectionUpload = {
  id: string;
  file: File;
  progress: number;
};

interface FilesCollectionPanelProps {
  files: OrgFile[];
  isLoading?: boolean;
  header?: ComponentChildren;
  className?: string;
  contentClassName?: string;
  emptyState?: ComponentChildren;
  showEmptyState?: boolean;
  canUpload?: boolean;
  uploadDisabled?: boolean;
  uploadingFiles?: FilesCollectionUpload[];
  onFilesSelected?: (files: File[]) => void;
  viewMode?: FilesViewMode;
  onViewModeChange?: (mode: FilesViewMode) => void;
  defaultViewMode?: FilesViewMode;
  showViewToggle?: boolean;
  onFileClick?: (file: OrgFile) => void;
  useDetailDrawer?: boolean;
}

export const FilesCollectionPanel = ({
  files,
  isLoading = false,
  header,
  className,
  contentClassName,
  emptyState,
  showEmptyState = true,
  canUpload = false,
  uploadDisabled = false,
  uploadingFiles = [],
  onFilesSelected,
  viewMode,
  onViewModeChange,
  defaultViewMode = 'grid',
  showViewToggle = true,
  onFileClick,
  useDetailDrawer = true,
}: FilesCollectionPanelProps) => {
  const [internalViewMode, setInternalViewMode] = useState<FilesViewMode>(defaultViewMode);
  const [detailFile, setDetailFile] = useState<OrgFile | null>(null);
  const resolvedViewMode = viewMode ?? internalViewMode;
  const isControlledViewMode = viewMode !== undefined;

  const handleViewModeChange = (mode: FilesViewMode) => {
    if (!isControlledViewMode) setInternalViewMode(mode);
    onViewModeChange?.(mode);
  };

  const handleFileClick = (file: OrgFile) => {
    if (onFileClick) {
      onFileClick(file);
      return;
    }
    if (useDetailDrawer) setDetailFile(file);
  };

  const renderedEmptyState = showEmptyState ? emptyState : null;
  const hasEmptyState = renderedEmptyState !== null && renderedEmptyState !== undefined;
  const shouldRenderFiles = isLoading || files.length > 0 || hasEmptyState;

  return (
    <div className={cn('space-y-4', className)}>
      {header ? (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">{header}</div>
          {showViewToggle ? (
            <FilesViewToggle value={resolvedViewMode} onChange={handleViewModeChange} />
          ) : null}
        </div>
      ) : null}

      {canUpload && onFilesSelected ? (
        <UploadDropzone
          onFilesSelected={onFilesSelected}
          instructionText={DROPZONE_INSTRUCTION_TEXT}
          validationText={DROPZONE_VALIDATION_TEXT}
          disabled={uploadDisabled}
        />
      ) : null}

      {uploadingFiles.length > 0 ? (
        <div className="space-y-2">
          {uploadingFiles.map((entry) => (
            <UploadQueueRow
              key={entry.id}
              fileName={entry.file.name}
              mimeType={entry.file.type || 'application/octet-stream'}
              fileSize={entry.file.size}
              status="uploading"
              progress={entry.progress}
            />
          ))}
        </div>
      ) : null}

      {!header && showViewToggle ? (
        <div className="flex justify-end">
          <FilesViewToggle value={resolvedViewMode} onChange={handleViewModeChange} />
        </div>
      ) : null}

      {shouldRenderFiles ? (
        <div className={contentClassName}>
          {resolvedViewMode === 'list' ? (
            <FilesList
              files={files}
              isLoading={isLoading}
              emptyState={renderedEmptyState}
              onFileClick={handleFileClick}
            />
          ) : (
            <FilesGrid
              files={files}
              isLoading={isLoading}
              emptyState={renderedEmptyState}
              onFileClick={handleFileClick}
            />
          )}
        </div>
      ) : null}

      {useDetailDrawer && !onFileClick ? (
        <FileDetailDrawer
          file={detailFile}
          isOpen={detailFile !== null}
          onClose={() => setDetailFile(null)}
        />
      ) : null}
    </div>
  );
};

export default FilesCollectionPanel;
