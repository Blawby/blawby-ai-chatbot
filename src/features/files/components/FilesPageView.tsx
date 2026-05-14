import { useEffect, useMemo, useState } from 'preact/hooks';
import { Folder, LayoutGrid, List, Upload } from 'lucide-preact';

import { Page } from '@/shared/ui/layout/Page';
import { PageHeader } from '@/shared/ui/layout/PageHeader';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { SegmentedFilter } from '@/shared/ui/tabs/SegmentedFilter';
import { CollectionToolbar } from '@/shared/ui/collection/CollectionToolbar';
import { SkeletonLoader } from '@/shared/ui/layout/SkeletonLoader';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import { useNavigation } from '@/shared/utils/navigation';
import { cn } from '@/shared/utils/cn';

import { FolderTile } from './FolderTile';
import { FoldersList } from './FoldersList';
import { UploadDestinationDialog } from './UploadDestinationDialog';
import {
  useOrgFolders,
  type OrgFilesScope,
  type OrgFolder,
} from '@/features/files/hooks/useOrgFiles';
import { FILES_VIEW_MODE_STORAGE_KEY } from '@/features/files/constants';

interface FilesPageViewProps {
  practiceId: string;
  practiceSlug: string;
  scope: OrgFilesScope;
  userId?: string | null;
}

type AssociationFilter = 'all' | 'matters' | 'intakes';
type ViewMode = 'grid' | 'list';

const ASSOCIATION_OPTIONS: ReadonlyArray<{ id: AssociationFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'matters', label: 'Matters' },
  { id: 'intakes', label: 'Intakes' },
];

const readPersistedViewMode = (): ViewMode => {
  if (typeof window === 'undefined') return 'list';
  try {
    const value = window.localStorage.getItem(FILES_VIEW_MODE_STORAGE_KEY);
    return value === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
};

const persistViewMode = (mode: ViewMode) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FILES_VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // localStorage may be disabled (private mode, quota); persistence is best-effort.
  }
};

const folderHref = (
  folder: OrgFolder,
  scope: OrgFilesScope,
  practiceSlug: string,
): string => {
  const slug = encodeURIComponent(practiceSlug);
  const id = encodeURIComponent(folder.resourceId);
  if (folder.kind === 'matter') {
    const base = scope === 'practice' ? '/practice' : '/client';
    return `${base}/${slug}/matters/${id}/files`;
  }
  // Intakes only have a practice-side detail route today.
  return `/practice/${slug}/intakes/responses/${id}`;
};

export const FilesPageView = ({ practiceId, practiceSlug, scope, userId = null }: FilesPageViewProps) => {
  const isMobile = useMobileDetection();
  const { navigate } = useNavigation();
  const { matterFolders, intakeFolders, isLoading, error, refetch } = useOrgFolders({
    practiceId,
    scope,
    userId,
  });

  const [search, setSearch] = useState('');
  const [association, setAssociation] = useState<AssociationFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>(() => readPersistedViewMode());
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  useEffect(() => { persistViewMode(viewMode); }, [viewMode]);

  // Mobile is cramped for tile grids — force list there regardless of saved
  // preference, but don't mutate the persisted value.
  const effectiveViewMode: ViewMode = isMobile ? 'list' : viewMode;

  const filteredMatters = useMemo(() => {
    if (association === 'intakes') return [] as OrgFolder[];
    const q = search.trim().toLowerCase();
    if (!q) return matterFolders;
    return matterFolders.filter((folder) => folder.label.toLowerCase().includes(q));
  }, [matterFolders, association, search]);

  const filteredIntakes = useMemo(() => {
    if (association === 'matters') return [] as OrgFolder[];
    const q = search.trim().toLowerCase();
    if (!q) return intakeFolders;
    return intakeFolders.filter((folder) => folder.label.toLowerCase().includes(q));
  }, [intakeFolders, association, search]);

  const totalFolders = matterFolders.length + intakeFolders.length;
  const totalFiltered = filteredMatters.length + filteredIntakes.length;

  const handleFolderClick = (folder: OrgFolder) => {
    navigate(folderHref(folder, scope, practiceSlug));
  };

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

  const folderGridClass = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

  return (
    <Page className="h-full">
      <div className="space-y-6">
        <PageHeader
          title="Files"
          subtitle="Files live inside a matter or intake. Open one to view or upload."
          actions={headerActions}
        />

        <CollectionToolbar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search matters and intakes"
          searchLabel="Search"
          filters={
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedFilter
                items={ASSOCIATION_OPTIONS.map((opt) => ({ id: opt.id, label: opt.label }))}
                activeId={association}
                onChange={(id) => setAssociation(id as AssociationFilter)}
              />
              {!isMobile ? (
                <div
                  className="inline-flex items-center gap-1 rounded-lg border border-line-glass/30 bg-surface-panel/60 p-1"
                  role="group"
                  aria-label="View mode"
                >
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    aria-label="List view"
                    aria-pressed={viewMode === 'list'}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                      viewMode === 'list'
                        ? 'bg-surface-card text-input-text shadow-sm'
                        : 'text-input-placeholder hover:text-input-text'
                    )}
                  >
                    <Icon icon={List} className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    aria-label="Grid view"
                    aria-pressed={viewMode === 'grid'}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                      viewMode === 'grid'
                        ? 'bg-surface-card text-input-text shadow-sm'
                        : 'text-input-placeholder hover:text-input-text'
                    )}
                  >
                    <Icon icon={LayoutGrid} className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>
          }
        />

        {isLoading ? (
          <div className={folderGridClass}>
            {Array.from({ length: 8 }).map((_, idx) => (
              <SkeletonLoader key={`folder-skel-${idx}`} className="h-16 rounded-2xl" />
            ))}
          </div>
        ) : totalFolders === 0 ? (
          <WorkspacePlaceholderState
            icon={Folder}
            title="No matters or intakes yet"
            description={scope === 'client'
              ? 'Open a conversation with the practice to start an intake — files attach there.'
              : 'Create a matter or accept an intake first — files attach to one.'}
            primaryAction={{
              label: 'Upload',
              onClick: () => setIsUploadOpen(true),
              icon: Upload,
            }}
          />
        ) : totalFiltered === 0 ? (
          <WorkspacePlaceholderState
            icon={Folder}
            title="Nothing matches"
            description={`No ${association === 'all' ? 'matters or intakes' : association} match "${search}".`}
          />
        ) : effectiveViewMode === 'list' ? (
          <FoldersList
            folders={[...filteredMatters, ...filteredIntakes]}
            onFolderClick={handleFolderClick}
          />
        ) : (
          <div className="space-y-8">
            {filteredMatters.length > 0 ? (
              <section>
                <header className="mb-3 text-xs font-semibold uppercase tracking-wide text-input-placeholder">
                  Matters · {filteredMatters.length}
                </header>
                <div className={folderGridClass}>
                  {filteredMatters.map((folder) => (
                    <FolderTile
                      key={folder.id}
                      folder={folder}
                      onClick={() => handleFolderClick(folder)}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {filteredIntakes.length > 0 ? (
              <section>
                <header className="mb-3 text-xs font-semibold uppercase tracking-wide text-input-placeholder">
                  Intakes · {filteredIntakes.length}
                </header>
                <div className={folderGridClass}>
                  {filteredIntakes.map((folder) => (
                    <FolderTile
                      key={folder.id}
                      folder={folder}
                      onClick={() => handleFolderClick(folder)}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </div>

      <UploadDestinationDialog
        practiceId={practiceId}
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploaded={() => { /* folder list doesn't change on upload — no refetch needed */ }}
        clientUserId={scope === 'client' ? userId : null}
      />
    </Page>
  );
};

export default FilesPageView;
