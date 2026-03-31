import { useMemo, useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { Combobox, type ComboboxOption } from '@/shared/ui/input/Combobox';
import { Input } from '@/shared/ui/input/Input';
import { CurrencyInput } from '@/shared/ui/input/CurrencyInput';
import { DatePicker } from '@/shared/ui/input/DatePicker';
import { Textarea } from '@/shared/ui/input/Textarea';
import { UserCircleIcon } from '@heroicons/react/24/outline';
import { Icon } from '@/shared/ui/Icon';
import { Avatar, StackedAvatars, UserCard, type SelectableUser } from '@/shared/ui/profile';

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
  const [inputValue, setInputValue] = useState('Vendor Contract Negotiation');
  const [currencyValue, setCurrencyValue] = useState<number | undefined>(325);
  const [dateValue, setDateValue] = useState('2026-02-19');
  const [textareaValue, setTextareaValue] = useState('Draft response and settlement options.');

  const sampleUsers: SelectableUser[] = useMemo(() => [
    { id: 'u1', name: 'Alice Chen', email: 'alice@lawfirm.com', role: 'owner' },
    { id: 'u2', name: 'Bob Ramirez', email: 'bob@lawfirm.com', role: 'admin' },
    { id: 'u3', name: 'Carol Singh', email: 'carol@lawfirm.com', role: 'member' },
    { id: 'u4', name: 'David Kim', email: 'david@lawfirm.com', role: 'member' },
    { id: 'u5', name: 'Eva Torres', email: 'eva@lawfirm.com', role: 'member' },
  ], []);

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
        <h2 className="text-lg font-medium text-input-text">Dynamic Foreground</h2>
        <p className="text-sm text-input-placeholder">
          Accent-colored surfaces should use `text-[rgb(var(--accent-foreground))]` for contrast-safe text/icons.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-accent-500 p-4 text-[rgb(var(--accent-foreground))]">
            <p className="font-medium">Correct: accent foreground token</p>
            <p className="text-sm opacity-90">Remains readable across accent theme changes.</p>
          </div>
          <div className="rounded-xl bg-accent-500 p-4 text-white">
            <p className="font-medium">Avoid: hardcoded `text-white`</p>
            <p className="text-sm opacity-90">Can fail contrast on some accent colors.</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-input-text">Inputs</h2>
        <p className="text-sm text-input-placeholder">
          Height baseline should align with Combobox for `md` controls.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="glass-panel rounded-xl p-4">
            <Input
              label="Input"
              value={inputValue}
              onChange={setInputValue}
              placeholder="Enter matter title"
            />
          </div>
          <div className="glass-panel rounded-xl p-4">
            <Combobox
              label="Combobox"
              value={comboboxValue}
              options={comboboxOptions}
              onChange={setComboboxValue}
              placeholder="Pick a stage"
            />
          </div>
          <div className="glass-panel rounded-xl p-4">
            <CurrencyInput
              label="Currency Input"
              value={currencyValue}
              onChange={setCurrencyValue}
              placeholder="0"
            />
          </div>
          <div className="glass-panel rounded-xl p-4">
            <DatePicker
              label="Date Picker"
              value={dateValue}
              onChange={setDateValue}
            />
          </div>
          <div className="glass-panel rounded-xl p-4 md:col-span-2">
            <Textarea
              label="Textarea"
              rows={3}
              value={textareaValue}
              onChange={setTextareaValue}
              placeholder="Enter notes"
            />
          </div>
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
              leading={<Icon icon={UserCircleIcon} className="h-4 w-4 text-input-placeholder"  />}
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
              leading={<Icon icon={UserCircleIcon} className="h-4 w-4 text-input-placeholder"  />}
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
              leading={<Icon icon={UserCircleIcon} className="h-4 w-4 text-input-placeholder"  />}
            />
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* Avatar & User Components                                            */}
      {/* ================================================================== */}

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-input-text">Avatar Sizes &amp; Status</h2>
        <p className="text-sm text-input-placeholder">
          Five sizes (<code>xs sm md lg xl</code>) with optional <code>status</code> dot (<code>active</code> = emerald, <code>inactive</code> = amber).
          Image falls back to initials extracted from <code>name</code>.
        </p>
        <div className="glass-panel rounded-xl p-4">
          <div className="flex flex-wrap items-end gap-6">
            {(['xs', 'sm', 'md', 'lg'] as const).map((size) => (
              <div key={size} className="flex flex-col items-center gap-2">
                <Avatar name="Alice Chen" size={size} status="active" />
                <code className="text-[10px] text-input-placeholder">{size} / active</code>
              </div>
            ))}
            {(['xs', 'sm', 'md', 'lg'] as const).map((size) => (
              <div key={`${size}-inactive`} className="flex flex-col items-center gap-2">
                <Avatar name="Bob Ramirez" size={size} status="inactive" />
                <code className="text-[10px] text-input-placeholder">{size} / inactive</code>
              </div>
            ))}
            <div className="flex flex-col items-center gap-2">
              <Avatar name="No Status" size="md" />
              <code className="text-[10px] text-input-placeholder">md / none</code>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-input-text">StackedAvatars</h2>
        <p className="text-sm text-input-placeholder">
          Pass a <code>users</code> array and a <code>max</code> cap. Overflow renders a <code>+N</code> badge using the <code>glass-input</code> surface.
        </p>
        <div className="glass-panel rounded-xl p-4 flex flex-wrap items-center gap-8">
          <div className="flex flex-col gap-1">
            <StackedAvatars users={sampleUsers} size="sm" max={3} />
            <code className="text-[10px] text-input-placeholder">size=sm max=3</code>
          </div>
          <div className="flex flex-col gap-1">
            <StackedAvatars users={sampleUsers} size="md" max={4} />
            <code className="text-[10px] text-input-placeholder">size=md max=4</code>
          </div>
          <div className="flex flex-col gap-1">
            <StackedAvatars users={sampleUsers} size="lg" max={2} />
            <code className="text-[10px] text-input-placeholder">size=lg max=2</code>
          </div>
          <div className="flex flex-col gap-1">
            <StackedAvatars users={sampleUsers} size="md" max={10} showOverflow={false} />
            <code className="text-[10px] text-input-placeholder">showOverflow=false</code>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-input-text">UserCard</h2>
        <p className="text-sm text-input-placeholder">
          Combines Avatar + identity lines + optional <code>badge</code> pill + optional <code>trailing</code> action slot.
          Pass <code>onClick</code> to make it a button (adds hover + focus ring).
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="glass-panel rounded-xl p-1">
            <UserCard
              name="Alice Chen"
              secondary="alice@lawfirm.com"
              badge="Owner"
              size="md"
              status="active"
            />
          </div>
          <div className="glass-panel rounded-xl p-1">
            <UserCard
              name="Bob Ramirez"
              secondary="bob@lawfirm.com"
              badge="Admin"
              size="md"
              status="inactive"
              trailing={<Button size="xs" variant="ghost">Manage</Button>}
            />
          </div>
          <div className="glass-panel rounded-xl overflow-hidden">
            <UserCard
              name="Carol Singh"
              secondary="carol@lawfirm.com"
              size="sm"
              onClick={() => alert('UserCard clicked')}
            />
          </div>
          <div className="glass-panel rounded-xl overflow-hidden">
            <UserCard
              name="David Kim"
              secondary="Member"
              size="lg"
              trailing={<Button size="xs" variant="secondary">Remove</Button>}
            />
          </div>
        </div>
      </section>

    </main>
  );
}
