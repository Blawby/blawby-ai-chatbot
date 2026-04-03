import { useMemo, useState } from 'preact/hooks';

export type CollectionViewMode = 'split' | 'table';
export type CollectionSortDirection = 'asc' | 'desc';

export type CollectionSortState = {
  key: string;
  direction: CollectionSortDirection;
};

type CollectionFilterRecord = object;

export type UseCollectionViewOptions<TFilters extends CollectionFilterRecord> = {
  initialSearch?: string;
  initialFilters: TFilters;
  initialSort?: CollectionSortState | null;
  initialViewMode?: CollectionViewMode;
  initialSelectedIds?: string[];
};

export type UseCollectionViewResult<TFilters extends CollectionFilterRecord> = {
  search: string;
  setSearch: (value: string) => void;
  filters: TFilters;
  setFilter: <K extends keyof TFilters>(key: K, value: TFilters[K]) => void;
  setFilters: (next: TFilters) => void;
  resetFilters: () => void;
  sort: CollectionSortState | null;
  setSort: (next: CollectionSortState | null) => void;
  viewMode: CollectionViewMode;
  setViewMode: (next: CollectionViewMode) => void;
  selectedIds: string[];
  setSelectedIds: (next: string[]) => void;
  toggleSelectedId: (id: string) => void;
  clearSelection: () => void;
  hasActiveSearch: boolean;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  hasSelection: boolean;
};

const isEmptyFilterValue = (value: unknown) => {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
};

export function useCollectionView<TFilters extends CollectionFilterRecord>({
  initialSearch = '',
  initialFilters,
  initialSort = null,
  initialViewMode = 'split',
  initialSelectedIds = [],
}: UseCollectionViewOptions<TFilters>): UseCollectionViewResult<TFilters> {
  const [search, setSearch] = useState(initialSearch);
  const [filters, setFilters] = useState<TFilters>(initialFilters);
  const [sort, setSort] = useState<CollectionSortState | null>(initialSort);
  const [viewMode, setViewMode] = useState<CollectionViewMode>(initialViewMode);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((value) => !isEmptyFilterValue(value)).length,
    [filters]
  );

  return {
    search,
    setSearch,
    filters,
    setFilter: (key, value) => {
      setFilters((current) => ({ ...current, [key]: value }));
    },
    setFilters,
    resetFilters: () => setFilters(initialFilters),
    sort,
    setSort,
    viewMode,
    setViewMode,
    selectedIds,
    setSelectedIds,
    toggleSelectedId: (id) => {
      setSelectedIds((current) =>
        current.includes(id)
          ? current.filter((candidate) => candidate !== id)
          : [...current, id]
      );
    },
    clearSelection: () => setSelectedIds([]),
    hasActiveSearch: search.trim().length > 0,
    hasActiveFilters: activeFilterCount > 0,
    activeFilterCount,
    hasSelection: selectedIds.length > 0,
  };
}
