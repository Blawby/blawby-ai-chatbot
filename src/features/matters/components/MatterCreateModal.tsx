import { useMemo, useState } from 'preact/hooks';
import Modal from '@/shared/components/Modal';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/input/Input';
import { Textarea } from '@/shared/ui/input/Textarea';
import type { MatterOption } from '@/features/matters/data/mockMatters';
import type { MattersSidebarStatus } from '@/shared/hooks/useMattersSidebar';
import type { ComponentChildren } from 'preact';
import { CheckIcon, ChevronUpDownIcon, ScaleIcon, UserIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '@/shared/utils/cn';
import { Avatar } from '@/shared/ui/profile';

type MatterFormMode = 'create' | 'edit';

interface MatterFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: MatterOption[];
  practiceAreas: MatterOption[];
  assignees: MatterOption[];
  mode?: MatterFormMode;
  initialValues?: Partial<MatterFormState>;
}

type MatterCreateModalProps = Omit<MatterFormModalProps, 'mode' | 'initialValues'>;

interface MatterEditModalProps extends Omit<MatterFormModalProps, 'mode'> {
  initialValues: Partial<MatterFormState>;
}

type BillingType = 'hourly' | 'fixed';

type MatterFormState = {
  title: string;
  clientId: string;
  practiceAreaId: string;
  assigneeId: string;
  status: MattersSidebarStatus;
  billingType: BillingType;
  hourlyRate?: number;
  fixedFee?: number;
  description: string;
};

const BILLING_OPTIONS = [
  {
    value: 'hourly',
    label: 'Hourly',
    description: 'Bill based on time logged for the matter.'
  },
  {
    value: 'fixed',
    label: 'Fixed Price',
    description: 'Set a fixed price for the entire matter.'
  }
];

const STATUS_EDIT_OPTIONS: Array<{ value: MattersSidebarStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' }
];

const buildInitialState = (mode: MatterFormMode, initialValues?: Partial<MatterFormState>): MatterFormState => ({
  title: initialValues?.title ?? '',
  clientId: initialValues?.clientId ?? '',
  practiceAreaId: initialValues?.practiceAreaId ?? '',
  assigneeId: initialValues?.assigneeId ?? '',
  status: initialValues?.status ?? 'open',
  billingType: initialValues?.billingType ?? 'hourly',
  hourlyRate: initialValues?.hourlyRate,
  fixedFee: initialValues?.fixedFee,
  description: initialValues?.description ?? ''
});

type ComboboxOption = { value: string; label: string; meta?: string };

interface ComboboxFieldProps {
  label: string;
  placeholder: string;
  value: string;
  options: ComboboxOption[];
  leading: ComponentChildren | ((selectedOption?: ComboboxOption) => ComponentChildren);
  onChange: (value: string) => void;
  className?: string;
  displayValue?: (option?: ComboboxOption) => string;
  optionLeading?: (option: ComboboxOption) => ComponentChildren;
  optionMeta?: (option: ComboboxOption) => ComponentChildren;
}

const ComboboxField = ({
  label,
  placeholder,
  value,
  options,
  leading,
  onChange,
  className,
  displayValue,
  optionLeading,
  optionMeta
}: ComboboxFieldProps) => {
  const selectedOption = options.find((option) => option.value === value);
  const resolvedDisplayValue = displayValue?.(selectedOption) ?? selectedOption?.label ?? '';
  const [query, setQuery] = useState(() => resolvedDisplayValue);
  const [isOpen, setIsOpen] = useState(false);

  const filteredOptions = useMemo(() => {
    const normalize = (value: string) =>
      value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return options;

    return options.filter((option) => {
      const normalizedOption = normalize(`${option.label} ${option.meta ?? ''}`);
      return normalizedOption.includes(normalizedQuery);
    });
  }, [options, query]);

  const showOptions = isOpen && filteredOptions.length > 0;
  const resolvedLeading = typeof leading === 'function' ? leading(selectedOption) : leading;

  return (
    <div className={cn('relative', className)}>
      <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
        {label}
      </label>
      <div className="relative mt-1">
        <div className="flex items-center">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {resolvedLeading}
          </div>
          <input
            type="text"
            value={query}
            onInput={(event) => {
              const nextValue = (event.target as HTMLInputElement).value;
              setQuery(nextValue);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onBlur={() => setIsOpen(false)}
            placeholder={placeholder}
            className="w-full rounded-md border border-gray-300 dark:border-white/10 bg-white dark:bg-dark-input-bg py-3 pl-12 pr-10 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 sm:text-sm"
          />
          {value ? (
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-500"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange('');
                setQuery('');
                setIsOpen(false);
              }}
              aria-label={`Clear ${label}`}
            >
              <XMarkIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : (
            <div className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 text-gray-400 pointer-events-none">
              <ChevronUpDownIcon className="h-5 w-5" aria-hidden="true" />
            </div>
          )}
        </div>

        {showOptions && (
          <ul className="absolute z-40 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-dark-card-bg py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm">
            {filteredOptions.map((option) => {
              const isSelected = option.value === value;
              const optionLead = optionLeading?.(option);
              const optionMetaContent = optionMeta?.(option) ?? option.meta;
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onChange(option.value);
                      setQuery(displayValue?.(option) ?? option.label);
                      setIsOpen(false);
                    }}
                    className={cn(
                      'group relative flex w-full items-center justify-between py-2 pl-3 pr-9 text-left transition-colors',
                      isSelected
                        ? 'bg-accent-50 text-gray-900 dark:bg-accent-500/10 dark:text-white'
                        : 'text-gray-900 dark:text-gray-100 hover:bg-accent-50/70 dark:hover:bg-white/5'
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      {optionLead && <span className="flex h-6 w-6 items-center justify-center">{optionLead}</span>}
                      <span className={cn('block truncate', isSelected && 'font-semibold')}>{option.label}</span>
                    </span>
                    {optionMetaContent && (
                      <span className="ml-3 max-w-[45%] truncate text-sm text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200">
                        {optionMetaContent}
                      </span>
                    )}
                    {isSelected && (
                      <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-accent-600 dark:text-accent-300">
                        <CheckIcon className="h-4 w-4" aria-hidden="true" />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

const buildLeadingIcon = (icon: ComponentChildren) => (
  <div className="w-6 h-6 rounded-full border border-dashed border-gray-300 dark:border-white/10 flex items-center justify-center text-gray-400">
    {icon}
  </div>
);

const BillingTypeToggleGroup = ({
  value,
  onChange
}: {
  value: BillingType;
  onChange: (value: BillingType) => void;
}) => (
  <fieldset>
    <legend className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Billing Type</legend>
    <div className="-space-y-px rounded-md bg-white dark:bg-dark-card-bg">
      {BILLING_OPTIONS.map((option, index) => {
        const isSelected = value === option.value;
        const isFirst = index === 0;
        const isLast = index === BILLING_OPTIONS.length - 1;
        const inputId = `billing-${option.value}`;
        return (
          <label
            key={option.value}
            htmlFor={inputId}
            aria-label={option.label}
            className={cn(
              'relative flex cursor-pointer items-start gap-3 border p-4 text-left transition focus-within:outline-none focus-within:ring-2 focus-within:ring-accent-500',
              isFirst && 'rounded-t-md',
              isLast && 'rounded-b-md',
              isSelected
                ? 'z-10 border-accent-200 bg-accent-50 text-gray-900 dark:border-accent-500/50 dark:bg-accent-500/10'
                : 'border-gray-200 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/5'
            )}
          >
            <input
              id={inputId}
              type="radio"
              name="billing_type"
              value={option.value}
              checked={isSelected}
              onChange={() => onChange(option.value as BillingType)}
              className="sr-only"
            />
            <span
              className={cn(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                isSelected ? 'border-transparent bg-accent-500' : 'border-gray-300 bg-white dark:border-white/30 dark:bg-dark-card-bg'
              )}
              aria-hidden="true"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
            </span>
            <span className="flex flex-col">
              <span className={cn('block text-sm font-medium', isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-900 dark:text-gray-100')}>
                {option.label}
              </span>
              <span className={cn('block text-sm', isSelected ? 'text-accent-700 dark:text-accent-300' : 'text-gray-500 dark:text-gray-400')}>
                {option.description}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  </fieldset>
);

export const MatterFormModal = ({
  isOpen,
  onClose,
  clients,
  practiceAreas,
  assignees,
  mode = 'create',
  initialValues
}: MatterFormModalProps) => {
  const [formState, setFormState] = useState<MatterFormState>(() => buildInitialState(mode, initialValues));

  const clientOptions = useMemo(
    () => clients.map((client) => ({ value: client.id, label: client.name })),
    [clients]
  );
  const practiceAreaOptions = useMemo(
    () => practiceAreas.map((area) => ({ value: area.id, label: area.name })),
    [practiceAreas]
  );
  const assigneeOptions = useMemo(
    () =>
      assignees.map((assignee) => ({
        value: assignee.id,
        label: assignee.name,
        meta: assignee.role
      })),
    [assignees]
  );

  const canSubmit = Boolean(formState.title && formState.clientId && formState.practiceAreaId);

  const updateForm = <K extends keyof MatterFormState>(key: K, value: MatterFormState[K]) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const submitLabel = mode === 'edit' ? 'Save changes' : 'Create matter';
  const modalTitle = mode === 'edit' ? 'Edit Matter' : 'Create Matter';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      contentClassName="bg-white dark:bg-dark-card-bg"
      headerClassName="bg-white dark:bg-dark-card-bg"
    >
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          onClose();
        }}
      >
        <div>
          <Input
            label="Title"
            value={formState.title}
            onChange={(value) => updateForm('title', value)}
            required
          />
        </div>

        <Textarea
          label="Description"
          value={formState.description}
          onChange={(value) => updateForm('description', value)}
          placeholder="Add a short summary for the matter..."
          rows={3}
        />

        {mode === 'edit' && (
          <fieldset>
            <legend className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Status</legend>
            <div className="mt-3 flex flex-wrap items-center gap-6">
              {STATUS_EDIT_OPTIONS.map((option) => {
                const inputId = `status-${option.value}`;
                return (
                  <label key={option.value} htmlFor={inputId} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <input
                      id={inputId}
                      type="radio"
                      name="matter_status"
                      value={option.value}
                      checked={formState.status === option.value}
                      onChange={() => updateForm('status', option.value)}
                      className="h-4 w-4 border-gray-300 text-accent-600 focus:ring-accent-500 dark:border-white/20"
                    />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{option.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <ComboboxField
          label="Client"
          placeholder="Select a client"
          value={formState.clientId}
          options={clientOptions}
          leading={buildLeadingIcon(<UserIcon className="h-4 w-4" />)}
          onChange={(value) => updateForm('clientId', value)}
        />

        <ComboboxField
          label="Practice Area"
          placeholder="Select a practice area"
          value={formState.practiceAreaId}
          options={practiceAreaOptions}
          leading={buildLeadingIcon(<ScaleIcon className="h-4 w-4" />)}
          onChange={(value) => updateForm('practiceAreaId', value)}
        />

        <ComboboxField
          label="Assignee"
          placeholder="Assign team member"
          value={formState.assigneeId}
          options={assigneeOptions}
          leading={(selectedOption) =>
            selectedOption ? (
              <Avatar name={selectedOption.label} size="sm" className="ring-0" />
            ) : (
              buildLeadingIcon(<UserIcon className="h-4 w-4" />)
            )
          }
          displayValue={(option) =>
            option ? `${option.label}${option.meta ? ` · ${option.meta}` : ''}` : ''
          }
          optionLeading={(option) => <Avatar name={option.label} size="sm" className="ring-0" />}
          optionMeta={(option) => option.meta}
          onChange={(value) => updateForm('assigneeId', value)}
        />

        <BillingTypeToggleGroup
          value={formState.billingType}
          onChange={(value) => updateForm('billingType', value)}
        />

        {formState.billingType === 'hourly' ? (
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1" htmlFor="hourly_rate">
              Hourly Rate
            </label>
            <div className="relative mt-1">
              <input
                id="hourly_rate"
                type="number"
                value={formState.hourlyRate ?? ''}
                onInput={(event) => {
                  const nextValue = (event.target as HTMLInputElement).value;
                  updateForm('hourlyRate', nextValue ? Number(nextValue) : undefined);
                }}
                className="block w-full rounded-md border border-gray-300 dark:border-white/10 bg-white dark:bg-dark-input-bg py-3 pr-16 pl-3 text-sm shadow-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                placeholder="150"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-500 sm:text-sm">
                {formState.hourlyRate ? `$${formState.hourlyRate.toFixed(2)}` : '$0.00'}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1" htmlFor="fixed_fee">
              Total Fixed Price
            </label>
            <div className="relative mt-1">
              <input
                id="fixed_fee"
                type="number"
                value={formState.fixedFee ?? ''}
                onInput={(event) => {
                  const nextValue = (event.target as HTMLInputElement).value;
                  updateForm('fixedFee', nextValue ? Number(nextValue) : undefined);
                }}
                className="block w-full rounded-md border border-gray-300 dark:border-white/10 bg-white dark:bg-dark-input-bg py-3 pr-16 pl-3 text-sm shadow-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                placeholder="2500"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-500 sm:text-sm">
                {formState.fixedFee ? `$${formState.fixedFee.toFixed(2)}` : '$0.00'}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 dark:bg-white/5 px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
          <p>UI-only preview. Submission is disabled until the backend is ready.</p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitLabel}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};

export const MatterCreateModal = (props: MatterCreateModalProps) => (
  <MatterFormModal {...props} mode="create" />
);

export const MatterEditModal = (props: MatterEditModalProps) => (
  <MatterFormModal {...props} mode="edit" />
);
