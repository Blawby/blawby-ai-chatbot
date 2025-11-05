import { FunctionComponent } from 'preact';

interface PricingTabsProps {
  selected: 'personal' | 'business';
  onSelect: (tab: 'personal' | 'business') => void;
  personalLabel: string;
  businessLabel: string;
}

const PricingTabs: FunctionComponent<PricingTabsProps> = ({ selected, onSelect, personalLabel, businessLabel }) => {
  return (
    <div className="flex bg-dark-card-bg rounded-lg p-1">
      <button
        onClick={() => onSelect('personal')}
        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          selected === 'personal' ? 'bg-dark-bg text-white' : 'text-gray-400 hover:text-white'
        }`}
      >
        {personalLabel}
      </button>
      <button
        onClick={() => onSelect('business')}
        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          selected === 'business' ? 'bg-dark-bg text-white' : 'text-gray-400 hover:text-white'
        }`}
      >
        {businessLabel}
      </button>
    </div>
  );
};

export default PricingTabs;
