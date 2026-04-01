import { fireEvent, render, screen } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicesEditor } from '@/features/services/components/ServicesEditor';

vi.mock('@heroicons/react/24/outline', () => {
  const buildIcon = (name: string) => ({ className }: { className?: string }) => (
    <svg className={className} data-testid={name} />
  );

  return {
    AcademicCapIcon: buildIcon('AcademicCapIcon'),
    BriefcaseIcon: buildIcon('BriefcaseIcon'),
    BuildingOfficeIcon: buildIcon('BuildingOfficeIcon'),
    BuildingStorefrontIcon: buildIcon('BuildingStorefrontIcon'),
    ChatBubbleLeftRightIcon: buildIcon('ChatBubbleLeftRightIcon'),
    CheckIcon: buildIcon('CheckIcon'),
    ChevronDownIcon: buildIcon('ChevronDownIcon'),
    ChevronUpDownIcon: buildIcon('ChevronUpDownIcon'),
    ClipboardDocumentIcon: buildIcon('ClipboardDocumentIcon'),
    DocumentTextIcon: buildIcon('DocumentTextIcon'),
    ExclamationTriangleIcon: buildIcon('ExclamationTriangleIcon'),
    HomeIcon: buildIcon('HomeIcon'),
    PlusIcon: buildIcon('PlusIcon'),
    ScaleIcon: buildIcon('ScaleIcon'),
    ShieldCheckIcon: buildIcon('ShieldCheckIcon'),
    SparklesIcon: buildIcon('SparklesIcon'),
    UserGroupIcon: buildIcon('UserGroupIcon'),
    XMarkIcon: buildIcon('XMarkIcon')
  };
});

vi.mock('@/shared/i18n/hooks', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      switch (key) {
        case 'settings:practice.services':
          return 'Services';
        case 'common:forms.placeholders.select':
          return 'Select an option';
        case 'settings:account.links.addButton':
          return 'Add';
        default:
          return key;
      }
    }
  })
}));

describe('ServicesEditor', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders only the shared combobox and selected services', () => {
    render(
      <ServicesEditor
        services={[
          {
            id: 'family-law',
            title: 'Family Law'
          },
          {
            id: 'custom-123',
            title: 'Mediation'
          }
        ]}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Family Law' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Mediation' })).toBeInTheDocument();
    expect(screen.queryByText('Practice Areas & Services')).not.toBeInTheDocument();
    expect(screen.queryByText('Custom Services')).not.toBeInTheDocument();
    expect(screen.queryByText('Add Custom Service')).not.toBeInTheDocument();
  });

  it('selects a catalog service and emits the normalized catalog-backed service list', () => {
    const onChange = vi.fn();

    render(<ServicesEditor services={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Family Law' }));

    expect(onChange).toHaveBeenLastCalledWith([
      {
        id: 'family-law',
        title: 'Family Law'
      }
    ]);
  });

  it('renders service options without catalog icons so custom and catalog entries stay visually consistent', () => {
    render(<ServicesEditor services={[]} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('combobox'));

    expect(screen.getByRole('option', { name: 'Family Law' })).toBeInTheDocument();
    expect(screen.queryByTestId('UserGroupIcon')).not.toBeInTheDocument();
  });

  it('adds a custom free-text service with a generated id', () => {
    const onChange = vi.fn();

    render(<ServicesEditor services={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Mediation' } });
    fireEvent.click(screen.getByRole('option', { name: /Mediation/i }));

    const nextSelection = onChange.mock.calls.at(-1)?.[0];
    expect(nextSelection).toHaveLength(1);
    expect(nextSelection[0]).toMatchObject({
      title: 'Mediation'
    });
    expect(nextSelection[0].id).toMatch(/^custom-/);
  });

  it('removes a selected chip and emits the remaining services', () => {
    const onChange = vi.fn();

    render(
      <ServicesEditor
        services={[
          {
            id: 'family-law',
            title: 'Family Law'
          },
          {
            id: 'custom-123',
            title: 'Mediation'
          }
        ]}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mediation' }));

    expect(onChange).toHaveBeenLastCalledWith([
      {
        id: 'family-law',
        title: 'Family Law'
      }
    ]);
  });

  it('collapses same-title incoming services to one visible selection', () => {
    render(
      <ServicesEditor
        services={[
          {
            id: 'custom-123',
            title: 'Mediation'
          },
          {
            id: 'custom-456',
            title: 'mediation'
          }
        ]}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByRole('combobox')).toHaveTextContent('Mediation');
  });
});
