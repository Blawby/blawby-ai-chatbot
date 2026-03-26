import { FunctionComponent } from 'preact';
import { useRef } from 'preact/hooks';

interface PricingTabsProps {
  selected: 'personal' | 'business';
  onSelect: (tab: 'personal' | 'business') => void;
  personalLabel: string;
  businessLabel: string;
}

const PricingTabs: FunctionComponent<PricingTabsProps> = ({ selected, onSelect, personalLabel, businessLabel }) => {
  const personalRef = useRef<HTMLButtonElement>(null);
  const businessRef = useRef<HTMLButtonElement>(null);

  const focusTab = (tab: 'personal' | 'business') => {
    (tab === 'personal' ? personalRef.current : businessRef.current)?.focus();
  };

  const onKeyDown = (e: preact.JSX.TargetedKeyboardEvent<HTMLButtonElement>) => {
    const keys = ['ArrowLeft','ArrowRight','Home','End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'Home') { onSelect('personal'); focusTab('personal'); return; }
    if (e.key === 'End') { onSelect('business'); focusTab('business'); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const next = selected === 'personal' ? 'business' : 'personal';
      onSelect(next);
      focusTab(next);
    }
  };

  return (
    <div className="flex bg-dark-card-bg rounded-lg p-1" role="tablist" aria-label="Pricing tabs">
      <button
        ref={personalRef}
        type="button"
        role="tab"
        aria-selected={selected === 'personal'}
        tabIndex={selected === 'personal' ? 0 : -1}
        onKeyDown={onKeyDown}
        onClick={() => onSelect('personal')}
        className={`btn btn-tab px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          selected === 'personal' ? 'active bg-dark-bg text-white' : 'text-gray-400 hover:text-white'
        }`}
      >
        {personalLabel}
      </button>
      <button
        ref={businessRef}
        type="button"
        role="tab"
        aria-selected={selected === 'business'}
        tabIndex={selected === 'business' ? 0 : -1}
        onKeyDown={onKeyDown}
        onClick={() => onSelect('business')}
        className={`btn btn-tab px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          selected === 'business' ? 'active bg-dark-bg text-white' : 'text-gray-400 hover:text-white'
        }`}
      >
        {businessLabel}
      </button>
    </div>
  );
};

export default PricingTabs;
