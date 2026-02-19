import { useMemo, useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { Combobox, type ComboboxOption } from '@/shared/ui/input/Combobox';
import { UserCircleIcon } from '@heroicons/react/24/outline';

const buttonVariants = [
  'primary',
  'secondary',
  'ghost',
  'icon',
  'danger',
  'warning',
  'danger-ghost',
  'accent-ghost',
  'outline',
  'link',
  'menu-item',
  'tab'
] as const;

const buttonSizes = ['xs', 'sm', 'md', 'lg'] as const;

export default function DebugStylesPage() {
  const [selectValue, setSelectValue] = useState('active');
  const [comboboxValue, setComboboxValue] = useState('intake_pending');
  const [comboboxMultiOnlyValue, setComboboxMultiOnlyValue] = useState<string[]>(['first_contact', 'active']);
  const [comboboxMultiValue, setComboboxMultiValue] = useState<string[]>(['email', 'phone']);

  const selectOptions: ComboboxOption[] = useMemo(
    () => [
      { value: 'active', label: 'Active' },
      { value: 'pending', label: 'Pending' },
      { value: 'archived', label: 'Archived' }
    ],
    []
  );

  const comboboxOptions: ComboboxOption[] = useMemo(
    () => [
      { value: 'first_contact', label: 'First Contact' },
      { value: 'intake_pending', label: 'Intake Pending' },
      { value: 'conflict_check', label: 'Conflict Check' },
      { value: 'consultation_scheduled', label: 'Consultation Scheduled' },
      { value: 'active', label: 'Active Matter' }
    ],
    []
  );

  const tagOptions: ComboboxOption[] = useMemo(
    () => [
      { value: 'email', label: 'Email' },
      { value: 'phone', label: 'Phone' },
      { value: 'documents', label: 'Documents' },
      { value: 'consultation', label: 'Consultation' }
    ],
    []
  );



  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-input-text">Debug Style Reference</h1>
        <p className="text-sm text-input-placeholder">
          Dev-only style inventory for button variants, glass surfaces, and nav state tokens.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-input-text">Surfaces</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="glass-card p-4">
            <p className="font-medium text-input-text">glass-card</p>
            <p className="text-sm text-input-placeholder">Prominent container</p>
          </div>
          <div className="glass-panel p-4">
            <p className="font-medium text-input-text">glass-panel</p>
            <p className="text-sm text-input-placeholder">Section container</p>
          </div>
          <div className="glass-input rounded-xl p-4">
            <p className="font-medium text-input-text">glass-input</p>
            <p className="text-sm text-input-placeholder">Input-like surface</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-input-text">Buttons</h2>
        <p className="text-sm text-input-placeholder">
          `menu-item` and `tab` are intentionally subtle and can look similar; use them by behavior/context, not for visual emphasis.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {buttonVariants.map((variant) => (
            <div key={variant} className="glass-panel flex items-center gap-3 rounded-xl p-3">
              <Button variant={variant}>{variant}</Button>
              <code className="text-xs text-input-placeholder">variant=&quot;{variant}&quot;</code>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-input-text">Button Sizes</h2>
        <div className="glass-panel flex flex-wrap items-center gap-3 rounded-xl p-3">
          {buttonSizes.map((size) => (
            <Button key={size} size={size} variant="secondary">
              {size}
            </Button>
          ))}
          {(['icon-sm', 'icon-md', 'icon-lg'] as const).map((iconSize) => (
            <div key={iconSize} className="inline-flex items-center gap-2">
              <Button size={iconSize} variant="icon" aria-label={`${iconSize} sample`}>
                +
              </Button>
              <code className="text-xs text-input-placeholder">{iconSize}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-input-text">Nav State Tokens</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <button type="button" className="nav-item-active rounded-xl px-3 py-2 text-left">
            Active nav item (`nav-item-active`)
          </button>
          <button type="button" className="nav-item-inactive rounded-xl px-3 py-2 text-left">
            Inactive nav item (`nav-item-inactive`)
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-input-text">Combobox Modes</h2>
        <p className="text-sm text-input-placeholder">
          One component, four modes. `multiple` and `allowCustomValues` toggle behavior; this is not a separate component.
        </p>
        <div className="grid gap-4 md:grid-cols-2 overflow-visible">
          <div className="glass-panel relative z-40 rounded-xl p-4 overflow-visible">
            <Combobox
              label="Single (dropdown mode)"
              value={selectValue}
              options={selectOptions}
              onChange={setSelectValue}
              searchable={false}
            />
          </div>
          <div className="glass-panel relative z-40 rounded-xl p-4 overflow-visible">
            <Combobox
              label="Single (searchable)"
              placeholder="Pick a stage"
              options={comboboxOptions}
              value={comboboxValue}
              onChange={setComboboxValue}
              leading={<UserCircleIcon className="h-4 w-4 text-input-placeholder" />}
            />
          </div>
          <div className="glass-panel relative z-30 rounded-xl p-4 overflow-visible">
            <Combobox
              label="Multi (chips)"
              placeholder="Pick one or more stages"
              options={comboboxOptions}
              value={comboboxMultiOnlyValue}
              onChange={setComboboxMultiOnlyValue}
              multiple
              searchable={false}
              leading={<UserCircleIcon className="h-4 w-4 text-input-placeholder" />}
            />
          </div>
          <div className="glass-panel relative z-30 rounded-xl p-4 overflow-visible">
            <Combobox
              label="Combobox (multi + custom)"
              placeholder="Type to add tags"
              options={tagOptions}
              value={comboboxMultiValue}
              onChange={setComboboxMultiValue}
              multiple
              allowCustomValues
              leading={<UserCircleIcon className="h-4 w-4 text-input-placeholder" />}
            />
          </div>
        </div>
      </section>

    </main>
  );
}
