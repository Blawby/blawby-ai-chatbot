import { Select, type SelectOption } from '../../ui/input';
import { FormLabel } from '../../ui/form';
import { FormItem } from '../../ui/form';
import { cn } from '../../../utils/cn';

export interface DomainSelectorProps {
  label: string;
  value: string;
  options: SelectOption[];
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
        <Select
          value={value}
          options={options}
          onChange={onChange}
        />
      </div>
    </FormItem>
  );
};

