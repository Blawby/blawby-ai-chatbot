import { useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import type { Service } from '../types';
import { SERVICE_CATALOG } from '../data/serviceCatalog';
import { findTemplateForService } from '../utils';
import { ServiceCard } from './ServiceCard';
import { ServiceForm } from './ServiceForm';

interface ServicesListProps {
  services: Service[];
  onUpdateService: (id: string, updates: { title: string; description: string }) => void;
  onRemoveService: (id: string) => void;
  onAddService: (service: { title: string; description: string }) => void;
  addLabel?: string;
  emptyMessage?: string;
}

export function ServicesList({
  services,
  onUpdateService,
  onRemoveService,
  onAddService,
  addLabel = 'Add Custom Service',
  emptyMessage = 'No services configured yet.'
}: ServicesListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ title: string; description: string } | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addDraft, setAddDraft] = useState<{ title: string; description: string }>({
    title: '',
    description: ''
  });

  const startEdit = (service: Service) => {
    setEditingId(service.id);
    setEditDraft({ title: service.title, description: service.description });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const saveEdit = () => {
    if (!editingId || !editDraft) return;
    onUpdateService(editingId, editDraft);
    setEditingId(null);
    setEditDraft(null);
  };

  const startAdd = () => {
    setIsAdding(true);
    setAddDraft({ title: '', description: '' });
  };

  const cancelAdd = () => {
    setIsAdding(false);
    setAddDraft({ title: '', description: '' });
  };

  const saveAdd = () => {
    if (!addDraft.title.trim()) return;
    onAddService(addDraft);
    setIsAdding(false);
    setAddDraft({ title: '', description: '' });
  };

  return (
    <div className="space-y-4">
      {services.length === 0 && !isAdding && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{emptyMessage}</p>
      )}

      {services.map((service) => (
        <div key={service.id}>
          {editingId === service.id && editDraft ? (
            <div className="border border-gray-200 dark:border-dark-border rounded-lg p-4 bg-white dark:bg-dark-card-bg space-y-4">
              <ServiceForm
                value={editDraft}
                onChange={setEditDraft}
                titleLabel="Service Title"
                descriptionLabel="Description"
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={cancelEdit}>
                  Cancel
                </Button>
                <Button size="sm" onClick={saveEdit} disabled={!editDraft.title.trim()}>
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <ServiceCard
              title={service.title}
              description={service.description}
              icon={findTemplateForService(service, SERVICE_CATALOG)?.icon}
              actions={(
                <>
                  <Button variant="secondary" size="sm" onClick={() => startEdit(service)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemoveService(service.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    Remove
                  </Button>
                </>
              )}
            />
          )}
        </div>
      ))}

      {isAdding ? (
        <div className="border border-gray-200 dark:border-dark-border rounded-lg p-4 bg-white dark:bg-dark-card-bg space-y-4">
          <ServiceForm
            value={addDraft}
            onChange={setAddDraft}
            titleLabel="Service Title"
            descriptionLabel="Description"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={cancelAdd}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveAdd} disabled={!addDraft.title.trim()}>
              Add Service
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={startAdd}>
          {addLabel}
        </Button>
      )}
    </div>
  );
}
