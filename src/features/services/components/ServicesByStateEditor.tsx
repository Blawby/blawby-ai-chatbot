// intentionally no hooks imported
import { Combobox } from '@/shared/ui/input/Combobox';
import { STATE_OPTIONS } from '@/shared/ui/address/AddressFields';
import { SERVICE_CATALOG } from '@/features/services/data/serviceCatalog';

type Props = {
  value?: Record<string, string[]> | null;
  onChange: (next: Record<string, string[]>) => void;
};

const serviceOptions = SERVICE_CATALOG.map((s) => ({ label: s.title, value: s.id }));

export const ServicesByStateEditor = ({ value, onChange }: Props) => {
  const map = value ?? {};

  const handleChangeForState = (stateCode: string) => (next: string[]) => {
    const nextMap = { ...map };
    if (next.length === 0) {
      delete nextMap[stateCode];
    } else {
      nextMap[stateCode] = next;
    }
    onChange(nextMap);
  };
  return (
    <div className="space-y-2 max-h-72 overflow-auto">
      {STATE_OPTIONS.map((opt) => (
        <div key={opt.value} className="flex items-center gap-3 py-2">
          <div className="w-40 text-sm text-input-text">{opt.label}</div>
          <div className="flex-1">
            <Combobox
              multiple
              options={serviceOptions}
              value={map[opt.value] ?? []}
              onChange={handleChangeForState(opt.value)}
              placeholder="Select services offered"
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default ServicesByStateEditor;
