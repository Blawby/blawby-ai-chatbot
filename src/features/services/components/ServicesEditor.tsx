import { useMemo } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';
import { Combobox, type ComboboxOption } from '@/shared/ui/input';
import { SERVICE_CATALOG } from '@/features/services/data/serviceCatalog';
import type { Service, ServiceTemplate } from '@/features/services/types';
import {
  getServiceTitles,
  mapSelectedServiceTitlesToServices,
  normalizeServices
} from '@/features/services/utils';

interface ServicesEditorProps {
  services: Service[];
  onChange: (services: Service[]) => void;
  catalog?: ServiceTemplate[];
}

const normalizeTitleKey = (title: string) => title.trim().toLowerCase();

export const ServicesEditor = ({
  services,
  onChange,
  catalog = SERVICE_CATALOG
}: ServicesEditorProps) => {
  const { t } = useTranslation(['settings', 'common']);
  const normalizedServices = useMemo(
    () => normalizeServices(services, catalog),
    [catalog, services]
  );
  const selectedTitles = useMemo(
    () => getServiceTitles(normalizedServices),
    [normalizedServices]
  );

  const options = useMemo<ComboboxOption[]>(() => {
    const selectedTitleKeys = new Set(selectedTitles.map(normalizeTitleKey));
    const selectedOptions = normalizedServices.map((service) => ({
      value: service.title,
      label: service.title
    } satisfies ComboboxOption));

    const catalogOptions = catalog.flatMap((service) => (
      selectedTitleKeys.has(normalizeTitleKey(service.title))
        ? []
        : [{
          value: service.title,
          label: service.title
        } satisfies ComboboxOption]
    ));

    return [...selectedOptions, ...catalogOptions];
  }, [catalog, normalizedServices, selectedTitles]);

  return (
    <div className="glass-panel rounded-xl p-4">
      <Combobox
        label={t('settings:practice.services')}
        placeholder={t('common:forms.placeholders.select')}
        addNewLabel={t('settings:account.links.addButton')}
        options={options}
        value={selectedTitles}
        onChange={(nextTitles) => onChange(
          mapSelectedServiceTitlesToServices(nextTitles, normalizedServices, catalog)
        )}
        multiple
        allowCustomValues
      />
    </div>
  );
};
