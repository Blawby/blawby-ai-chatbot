// intentionally no hooks imported
import { Combobox } from '@/shared/ui/input/Combobox';
import { STATE_OPTIONS } from '@/shared/ui/address/AddressFields';
import { SERVICE_CATALOG } from '@/features/services/data/serviceCatalog';
import { useTranslation } from '@/shared/i18n/hooks';

type Props = {
  licensedStates: string[]; // array of state codes to render (state codes)
  value?: Record<string, string[]> | null;
  onChange: (next: Record<string, string[]>) => void;
  onRemove?: (stateCode: string) => void;
};

const serviceOptions = SERVICE_CATALOG.map((s) => ({ label: s.title, value: s.id }));

export const ServicesByStateEditor = ({ licensedStates, value, onChange, onRemove }: Props) => {
  const { t } = useTranslation(['settings']);
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
    <div className="space-y-2">
      {licensedStates.length === 0 && (
          <div className="text-sm text-input-placeholder">{t('settings:practice.servicesByState.empty', { defaultValue: 'No states selected. Add a state to assign services.' })}</div>
        )}
      {licensedStates.map((stateCode) => {
        const opt = STATE_OPTIONS.find((s) => s.value === stateCode);
        const label = opt ? opt.label : stateCode;
        return (
          <div key={stateCode} className="flex items-center gap-3 py-2">
            <div className="w-40 text-sm text-input-text">{label}</div>
            <div className="flex-1">
              <Combobox
                multiple
                options={serviceOptions}
                value={map[stateCode] ?? []}
                onChange={handleChangeForState(stateCode)}
                placeholder={t('settings:practice.servicesByState.placeholder', { defaultValue: 'Select services offered' })}
              />
            </div>
            {typeof onRemove === 'function' && (
              <button
                type="button"
                className="text-sm text-accent-error"
                onClick={() => onRemove(stateCode)}
                aria-label={t('settings:practice.servicesByState.remove', { defaultValue: `Remove ${label}`, label })}
              >
                {t('settings:practice.servicesByState.removeShort', { defaultValue: 'Remove' })}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ServicesByStateEditor;
