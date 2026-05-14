import type { ComponentChildren } from 'preact';
import { Check, Settings } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown';
import { cn } from '@/shared/utils/cn';

export interface ColumnEditorOption {
  key: string;
  label: string;
  fixed?: boolean;
}

export interface ColumnEditorProps {
  options: ColumnEditorOption[];
  visible: string[];
  onChange: (next: string[]) => void;
  triggerLabel?: string;
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export const ColumnEditor = ({
  options,
  visible,
  onChange,
  triggerLabel = 'Edit columns',
  align = 'end',
  className,
}: ColumnEditorProps) => {
  const fixed = options.filter((option) => option.fixed);
  const toggleable = options.filter((option) => !option.fixed);
  const visibleSet = new Set(visible);
  const optionByKey = new Map(options.map((option) => [option.key, option]));

  const active = visible
    .map((key) => optionByKey.get(key))
    .filter((option): option is ColumnEditorOption => Boolean(option) && !option.fixed);
  const available = toggleable.filter((option) => !visibleSet.has(option.key));

  const setVisible = (key: string, next: boolean) => {
    if (next) {
      onChange([...visible.filter((k) => k !== key), key]);
      return;
    }
    onChange(visible.filter((k) => k !== key));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          icon={Settings}
          iconClassName="h-4 w-4"
          className={className}
        >
          {triggerLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="w-72 max-h-[24rem] overflow-y-auto p-1"
      >
        {fixed.length > 0 && (
          <ColumnSection title="Fixed columns">
            {fixed.map((option) => (
              <FixedColumnRow key={option.key} label={option.label} />
            ))}
          </ColumnSection>
        )}
        {toggleable.length > 0 && (
          <ColumnSection title="Active columns">
            {active.length > 0 ? (
              active.map((option) => (
                <ToggleColumnRow
                  key={option.key}
                  label={option.label}
                  checked
                  onToggle={() => setVisible(option.key, false)}
                />
              ))
            ) : (
              <p className="px-2 py-1.5 text-xs text-input-placeholder">
                No additional columns active
              </p>
            )}
          </ColumnSection>
        )}
        {available.length > 0 && (
          <ColumnSection title="Available columns">
            {available.map((option) => (
              <ToggleColumnRow
                key={option.key}
                label={option.label}
                checked={false}
                onToggle={() => setVisible(option.key, true)}
              />
            ))}
          </ColumnSection>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const ColumnSection = ({
  title,
  children,
}: {
  title: string;
  children: ComponentChildren;
}) => (
  <div className="pb-2 last:pb-1">
    <h3 className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-input-placeholder">
      {title}
    </h3>
    <div className="flex flex-col">{children}</div>
  </div>
);

const FixedColumnRow = ({ label }: { label: string }) => (
  <div className="px-2 py-1.5 text-sm text-input-text">{label}</div>
);

const ToggleColumnRow = ({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) => (
  <button
    type="button"
    role="menuitemcheckbox"
    aria-checked={checked}
    onClick={onToggle}
    className={cn(
      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
      'hover:bg-surface-utility/10',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50',
      checked ? 'text-input-text' : 'text-input-placeholder',
    )}
  >
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
        checked
          ? 'border-accent-500 bg-accent-500 text-accent-foreground'
          : 'border-input-border bg-input-bg',
      )}
    >
      {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
    </span>
    <span className="flex-1 truncate">{label}</span>
  </button>
);
