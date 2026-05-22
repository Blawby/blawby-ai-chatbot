import { useEffect, useMemo, useState } from 'preact/hooks';
import { Folder, Upload } from 'lucide-preact';

import { Page } from '@/shared/ui/layout/Page';
import { PageHeader } from '@/shared/ui/layout/PageHeader';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { Button } from '@/shared/ui/Button';
import { SegmentedFilter } from '@/shared/ui/tabs/SegmentedFilter';
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

const matchesSearch = (file: OrgFile, query: string): boolean => {
  if (!query) return true;
  const q = query.toLowerCase();
  if (file.fileName.toLowerCase().includes(q)) return true;
  if (file.matterTitle?.toLowerCase().includes(q)) return true;
  if (file.intakeTitle?.toLowerCase().includes(q)) return true;
  return false;
};

export const FilesPageView = ({ practiceId, practiceSlug, scope, userId = null }: FilesPageViewProps) => {
  const isMobile = useMobileDetection();
  const { files, isLoading, error, refetch } = useOrgFiles({ practiceId, scope, userId });

  const [search, setSearch] = useState('');
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
    const trimmed = search.trim();
    return files.filter((file) => matchesAssociation(file, association) && matchesSearch(file, trimmed));
  }, [files, association, search]);

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
        <PageHeader title="Files" actions={headerActions} />
        <div className="status-error mt-6 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm">
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
        <div className="min-w-0 flex-1 space-y-6">
          <PageHeader
            title="Files"
            subtitle="Every file across your matters and intakes. Click one for details."
            actions={headerActions}
          />

          <CollectionToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search files, matters, intakes"
            searchLabel="Search"
            filters={
              <SegmentedFilter
                items={ASSOCIATION_OPTIONS.map((opt) => ({ id: opt.id, label: opt.label }))}
                activeId={association}
                onChange={(id) => setAssociation(id as AssociationFilter)}
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
              description={`No files match ${search ? `"${search}"` : 'the current filter'}.`}
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
