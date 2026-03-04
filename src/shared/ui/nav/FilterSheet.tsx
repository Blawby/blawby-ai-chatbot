import type { FunctionComponent } from 'preact';
import Modal from '@/shared/components/Modal';
import { Button } from '@/shared/ui/Button';
import type { NavSection } from '@/shared/config/navConfig';
import { cn } from '@/shared/utils/cn';

export interface FilterSheetProps {
  title?: string;
  sections: NavSection[];
  activeItemId?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
}

export const FilterSheet: FunctionComponent<FilterSheetProps> = ({
  title = 'Filters',
  sections,
  activeItemId,
  isOpen,
  onClose,
  onSelect,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} type="drawer">
      <div className="space-y-4 pb-6">
        {sections.map((section, idx) => (
          <div key={`${section.label ?? 'filters'}-${idx}`} className="space-y-2">
            {section.label ? (
              <h3 className="text-xs font-semibold uppercase tracking-wide text-input-placeholder">
                {section.label}
              </h3>
            ) : null}
            <div className="space-y-2">
              {section.items.map((item) => {
                const isActive = item.id === activeItemId;
                return (
                  <Button
                    key={item.id}
                    type="button"
                    variant={isActive ? 'primary' : 'secondary'}
                    className={cn('w-full justify-start', !isActive && 'border-line-glass/30')}
                    onClick={() => {
                      onSelect(item.id);
                      onClose();
                    }}
                  >
                    {item.label}
                  </Button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
};

export default FilterSheet;
