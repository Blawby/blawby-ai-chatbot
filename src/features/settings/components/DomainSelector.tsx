import { Combobox, type ComboboxOption } from '@/shared/ui/input/Combobox';
import { FormLabel } from '@/shared/ui/form';
import { FormItem } from '@/shared/ui/form';

export interface DomainSelectorProps {
  label: string;
  value: string;
  options: ComboboxOption[];
  onChange: (value: string) => void;
  className?: string;
}

export const DomainSelector = ({
  label,
  value,
  options,
  onChange,
  className = ''
}: DomainSelectorProps) => {
  return (
    <FormItem className={className}>
      <div className="flex-1 min-w-0">
        <FormLabel>{label}</FormLabel>
      </div>
      <div className="ml-4">
        <Combobox
          value={value}
          options={options}
          onChange={onChange}
          searchable={false}
        />
      </div>
    </FormItem>
  );
};
