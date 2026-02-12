import { useMemo, useState } from 'preact/hooks';
import { TrashIcon } from '@heroicons/react/24/outline';
import { Button } from '@/shared/ui/Button';
import Modal from '@/shared/components/Modal';
import type { Service } from '../types';
import { SERVICE_CATALOG } from '../data/serviceCatalog';
import { buildCatalogIndex, findTemplateForService } from '../utils';
import { ServiceCard } from './ServiceCard';
import { ServiceForm } from './ServiceForm';

interface ServicesListProps {
  services: Service[];
  onUpdateService: (id: string, updates: { title: string; description: string }) => void;
  onRemoveService: (id: string) => void;
  emptyMessage?: string;
}

export function ServicesList({
  services,
  onUpdateService,
  onRemoveService,
  emptyMessage = 'No services configured yet.'
}: ServicesListProps) {
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editDraft, setEditDraft] = useState<{ title: string; description: string } | null>(null);
  const catalogIndex = useMemo(() => buildCatalogIndex(SERVICE_CATALOG), []);

  const startEdit = (service: Service) => {
    setEditingService(service);
    setEditDraft({ title: service.title, description: service.description });
  };

  const cancelEdit = () => {
    setEditingService(null);
    setEditDraft(null);
  };

  const saveEdit = () => {
    if (!editingService || !editDraft) return;
    onUpdateService(editingService.id, editDraft);
    setEditingService(null);
    setEditDraft(null);
  };

  return (
    <div className="space-y-4">
      {services.length === 0 && (
        <p className="text-xs text-input-placeholder">{emptyMessage}</p>
      )}

      {services.map((service) => (
        <div key={service.id}>
          <ServiceCard
            title={service.title}
            description={service.description}
            icon={findTemplateForService(service, catalogIndex)?.icon}
            headerActions={(
              <>
                <Button variant="secondary" size="sm" onClick={() => startEdit(service)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveService(service.id)}
                  className="text-red-600 hover:text-red-700"
                  aria-label={`Remove ${service.title}`}
                >
                  <TrashIcon className="w-4 h-4" />
                </Button>
              </>
            )}
          />
        </div>
      ))}

      <Modal
        isOpen={Boolean(editingService && editDraft)}
        onClose={cancelEdit}
        title="Edit Service"
      >
        <div className="space-y-4">
          <ServiceForm
            value={editDraft ?? { title: '', description: '' }}
            onChange={setEditDraft}
            titleLabel="Service Title"
            descriptionLabel="Description"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={cancelEdit}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveEdit} disabled={!editDraft?.title.trim()}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
