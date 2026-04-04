import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export type CollectionSection<TItem> = {
  id: string;
  label: ComponentChildren;
  description?: ComponentChildren;
  count?: number;
  items: TItem[];
};

export interface CollectionSectionListProps<TItem> {
  sections: Array<CollectionSection<TItem>>;
  renderSectionContent: (section: CollectionSection<TItem>) => ComponentChildren;
  emptyState?: ComponentChildren;
  className?: string;
  sectionClassName?: string;
}

export function CollectionSectionList<TItem>({
  sections,
  renderSectionContent,
  emptyState,
  className,
  sectionClassName,
}: CollectionSectionListProps<TItem>) {
  if (sections.length === 0) {
    return <>{emptyState ?? null}</>;
  }

  return (
    <div className={cn('grid gap-4', className)}>
      {sections.map((section) => (
        <section key={section.id} className={cn('grid gap-3', sectionClassName)}>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-input-text">{section.label}</h2>
              {section.description ? (
                <p className="mt-1 text-sm text-input-placeholder">{section.description}</p>
              ) : null}
            </div>
            {typeof section.count === 'number' ? (
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-input-placeholder">
                {section.count} item{section.count === 1 ? '' : 's'}
              </p>
            ) : null}
          </div>
          {renderSectionContent(section)}
        </section>
      ))}
    </div>
  );
}

export default CollectionSectionList;
