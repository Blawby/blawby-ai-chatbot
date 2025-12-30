import { Input, Textarea } from '@/shared/ui/input';

interface ServiceFormValue {
  title: string;
  description: string;
}

interface ServiceFormProps {
  value: ServiceFormValue;
  onChange: (value: ServiceFormValue) => void;
  titleLabel?: string;
  descriptionLabel?: string;
  titlePlaceholder?: string;
  descriptionPlaceholder?: string;
  disabledTitle?: boolean;
  disabledDescription?: boolean;
  descriptionRows?: number;
}

export function ServiceForm({
  value,
  onChange,
  titleLabel = 'Service Title',
  descriptionLabel = 'Description (optional)',
  titlePlaceholder = 'e.g., Personal Injury',
  descriptionPlaceholder = 'Brief description of this service...',
  disabledTitle = false,
  disabledDescription = false,
  descriptionRows = 2
}: ServiceFormProps) {
  return (
    <div className="space-y-3">
      <Input
        label={titleLabel}
        value={value.title}
        onChange={(next) => onChange({ ...value, title: next })}
        placeholder={titlePlaceholder}
        disabled={disabledTitle}
      />
      <Textarea
        label={descriptionLabel}
        value={value.description}
        onChange={(next) => onChange({ ...value, description: next })}
        placeholder={descriptionPlaceholder}
        rows={descriptionRows}
        disabled={disabledDescription}
      />
    </div>
  );
}
