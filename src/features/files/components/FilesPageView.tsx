import { useEffect, useMemo, useState } from 'preact/hooks';
import { Folder, Upload } from 'lucide-preact';

import { Page } from '@/shared/ui/layout/Page';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { Button } from '@/shared/ui/Button';
import { Seg } from '@/design-system/patterns';
import { CollectionToolbar } from '@/shared/ui/collection/CollectionToolbar';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';

import { FilesCollectionPanel } from './FilesCollectionPanel';
import { FileDetailDrawer } from './FileDetailDrawer';
import { FilesInspectorPanel } from './FilesInspectorPanel';
import { UploadDestinationDialog } from './UploadDestinationDialog';
import { useOrgFiles, type OrgFilesScope } from '@/features/files/hooks/useOrgFiles';
import type { OrgFile } from '@/features/files/utils/fileCategory';

interface FilesPageViewProps {
  practiceId: string;
  practiceSlug: string;
  scope: OrgFilesScope;
  userId?: string | null;
}

type AssociationFilter = 'all' | 'matters' | 'intakes';

const ASSOCIATION_OPTIONS: ReadonlyArray<{ id: AssociationFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'matters', label: 'Matters' },
  { id: 'intakes', label: 'Intakes' },
];

const matchesAssociation = (file: OrgFile, filter: AssociationFilter): boolean => {
  if (filter === 'all') return true;
  if (filter === 'matters') return Boolean(file.matterId);
  return Boolean(file.intakeUuid);
};

export const FilesPageView = ({ practiceId, practiceSlug, scope, userId = null }: FilesPageViewProps) => {
  const isMobile = useMobileDetection();
  const { files, isLoading, error, refetch } = useOrgFiles({ practiceId, scope, userId });

  const [association, setAssociation] = useState<AssociationFilter>('all');
  const [selectedFile, setSelectedFile] = useState<OrgFile | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // Drop selection when the file disappears from the list (e.g. after refetch).
  useEffect(() => {
    if (selectedFile && !files.some((f) => f.id === selectedFile.id)) {
      setSelectedFile(null);
    }
  }, [files, selectedFile]);

  const filteredFiles = useMemo(() => {
    return files.filter((file) => matchesAssociation(file, association));
  }, [files, association]);

  const headerActions = (
    <Button
      variant="primary"
      size="sm"
      icon={Upload}
      iconClassName="h-4 w-4"
      onClick={() => setIsUploadOpen(true)}
      aria-label="Upload"
    >
      {isMobile ? '' : 'Upload'}
    </Button>
  );

  if (error) {
    return (
      <Page className="h-full">
        <div className="flex items-center justify-between gap-3 rounded-r-lg border border-neg/20 bg-neg/10 px-4 py-3 text-sm text-neg">
          <span className="min-w-0 flex-1 truncate">{error}</span>
          <Button variant="ghost" size="sm" onClick={() => { void refetch(); }}>
            Retry
          </Button>
        </div>
      </Page>
    );
  }

  const showInspector = !isMobile && selectedFile !== null;

  return (
    <Page className="h-full">
      <div className="flex h-full gap-6">
        <div className="@container min-w-0 flex-1 space-y-6">
          <CollectionToolbar
            actions={headerActions}
            filters={
              <Seg<AssociationFilter>
                value={association}
                options={ASSOCIATION_OPTIONS.map((opt) => ({ value: opt.id, label: opt.label }))}
                onChange={setAssociation}
                ariaLabel="Filter files by association"
                className="w-full sm:w-auto sm:min-w-[18rem]"
              />
            }
          />

          {!isLoading && files.length === 0 ? (
            <WorkspacePlaceholderState
              icon={Folder}
              title="No files yet"
              description={scope === 'client'
                ? 'Open a conversation with the practice to start an intake — files attach there.'
                : 'Create a matter or accept an intake first — files attach to one.'}
              primaryAction={{
                label: 'Upload',
                onClick: () => setIsUploadOpen(true),
                icon: Upload,
              }}
            />
          ) : !isLoading && filteredFiles.length === 0 ? (
            <WorkspacePlaceholderState
              icon={Folder}
              title="Nothing matches"
              description="No files match the current filter."
            />
          ) : (
            <FilesCollectionPanel
              files={filteredFiles}
              isLoading={isLoading}
              onFileClick={setSelectedFile}
              showEmptyState={false}
              showViewToggle={false}
            />
          )}
        </div>

        {showInspector && selectedFile ? (
          <div className="hidden w-[360px] shrink-0 lg:block">
            <FilesInspectorPanel
              file={selectedFile}
              practiceSlug={practiceSlug}
              scope={scope}
              onClose={() => setSelectedFile(null)}
            />
          </div>
        ) : null}
      </div>

      <FileDetailDrawer
        file={isMobile ? selectedFile : null}
        isOpen={isMobile && selectedFile !== null}
        onClose={() => setSelectedFile(null)}
      />

      <UploadDestinationDialog
        practiceId={practiceId}
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploaded={() => { void refetch(); }}
        clientUserId={scope === 'client' ? userId : null}
      />
    </Page>
  );
};

export default FilesPageView;
