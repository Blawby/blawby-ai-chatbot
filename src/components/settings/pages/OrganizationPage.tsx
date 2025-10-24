import { useState, useEffect } from 'preact/hooks';
import { 
  BuildingOfficeIcon, 
  PlusIcon, 
  TrashIcon,
  PencilIcon
} from '@heroicons/react/24/outline';
import { useOrganizationManagement } from '../../../hooks/useOrganizationManagement';
import { Button } from '../../ui/Button';
import Modal from '../../Modal';
import { Input } from '../../ui/input';
import { FormLabel } from '../../ui/form/FormLabel';
import { useToastContext } from '../../../contexts/ToastContext';

interface OrganizationPageProps {
  className?: string;
}

export const OrganizationPage = ({ className = '' }: OrganizationPageProps) => {
  const { 
    currentOrganization, 
    loading, 
    error,
    updateOrganization,
    createOrganization,
    deleteOrganization,
    refetch 
  } = useOrganizationManagement();
  
  const { showSuccess, showError } = useToastContext();
  
  // Form states
  const [editOrgForm, setEditOrgForm] = useState({
    name: '',
    description: '',
    businessPhone: '',
    businessEmail: '',
    consultationFee: '',
    paymentUrl: '',
    calendlyUrl: ''
  });
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    slug: '',
    description: '',
    businessPhone: '',
    businessEmail: '',
    consultationFee: '',
    paymentUrl: '',
    calendlyUrl: ''
  });
  
  // Inline form states
  const [isEditingOrg, setIsEditingOrg] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const hasOrganization = !!currentOrganization;
  
  // Load organization data into edit form
  useEffect(() => {
    if (currentOrganization) {
      setEditOrgForm({
        name: currentOrganization.name || '',
        description: currentOrganization.description || '',
        businessPhone: currentOrganization.businessPhone || '',
        businessEmail: currentOrganization.businessEmail || '',
        consultationFee: currentOrganization.consultationFee || '',
        paymentUrl: currentOrganization.paymentUrl || '',
        calendlyUrl: currentOrganization.calendlyUrl || ''
      });
    }
  }, [currentOrganization]);

  const handleCreateOrganization = async () => {
    if (!createForm.name.trim()) {
      showError('Organization name is required');
      return;
    }

    // Validate required fields
    if (!createForm.name.trim()) {
      showError('Organization name is required');
      return;
    }

    try {
      await createOrganization({
        name: createForm.name,
        slug: createForm.slug || undefined,
        description: createForm.description || undefined,
        businessPhone: createForm.businessPhone || undefined,
        businessEmail: createForm.businessEmail || undefined,
        consultationFee: createForm.consultationFee || undefined,
        paymentUrl: createForm.paymentUrl || undefined,
        calendlyUrl: createForm.calendlyUrl || undefined,
      });
      
      showSuccess('Organization created successfully!');
      setShowCreateModal(false);
      setCreateForm({ 
        name: '', 
        slug: '', 
        description: '',
        businessPhone: '',
        businessEmail: '',
        consultationFee: '',
        paymentUrl: '',
        calendlyUrl: ''
      });
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create organization');
    }
  };

  const handleUpdateOrganization = async () => {
    if (!currentOrganization) return;
    
    // Validate required fields
    if (!editOrgForm.name.trim()) {
      showError('Organization name is required');
      return;
    }
    
    try {
      await updateOrganization(currentOrganization.id, {
        name: editOrgForm.name,
        description: editOrgForm.description,
        businessPhone: editOrgForm.businessPhone,
        businessEmail: editOrgForm.businessEmail,
        consultationFee: editOrgForm.consultationFee,
        paymentUrl: editOrgForm.paymentUrl,
        calendlyUrl: editOrgForm.calendlyUrl,
      });
      showSuccess('Organization updated successfully!');
      setIsEditingOrg(false);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update organization');
    }
  };

  const handleDeleteOrganization = async () => {
    if (!currentOrganization) return;
    
    if (deleteConfirmText !== currentOrganization.name) {
      showError('Please type the organization name to confirm deletion');
      return;
    }

    try {
      await deleteOrganization(currentOrganization.id);
      showSuccess('Organization deleted successfully!');
      setShowDeleteModal(false);
      setDeleteConfirmText('');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete organization');
    }
  };

  if (loading) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400">{error}</p>
          <Button 
            onClick={refetch} 
            variant="secondary" 
            className="mt-2"
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 ${className}`}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Organization Settings
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage your organization details and settings.
          </p>
        </div>

        {!hasOrganization ? (
          // No organization state
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
            <BuildingOfficeIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No Organization
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Create your first organization to get started.
            </p>
            <Button 
              onClick={() => setShowCreateModal(true)}
              variant="primary"
              className="inline-flex items-center"
            >
              <PlusIcon className="w-4 h-4 mr-2" />
              Create Organization
            </Button>
          </div>
        ) : (
          // Organization details
          <div className="space-y-6">
            {/* Organization Info */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Organization Details
                </h2>
                <Button
                  onClick={() => setIsEditingOrg(true)}
                  variant="secondary"
                  size="sm"
                  className="inline-flex items-center"
                >
                  <PencilIcon className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              </div>

              {!isEditingOrg ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="org-name-display">
                      Organization Name
                    </label>
                    <p id="org-name-display" className="text-gray-900 dark:text-white">{currentOrganization.name}</p>
                  </div>
                  
                  {currentOrganization.description && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="org-description-display">
                        Description
                      </label>
                      <p id="org-description-display" className="text-gray-900 dark:text-white">{currentOrganization.description}</p>
                    </div>
                  )}

                  {currentOrganization.businessPhone && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="org-phone-display">
                        Business Phone
                      </label>
                      <p id="org-phone-display" className="text-gray-900 dark:text-white">{currentOrganization.businessPhone}</p>
                    </div>
                  )}

                  {currentOrganization.businessEmail && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="org-email-display">
                        Business Email
                      </label>
                      <p id="org-email-display" className="text-gray-900 dark:text-white">{currentOrganization.businessEmail}</p>
                    </div>
                  )}

                  {currentOrganization.consultationFee && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="org-fee-display">
                        Consultation Fee
                      </label>
                      <p id="org-fee-display" className="text-gray-900 dark:text-white">{currentOrganization.consultationFee}</p>
                    </div>
                  )}

                  {currentOrganization.paymentUrl && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="org-payment-display">
                        Payment URL
                      </label>
                      <p id="org-payment-display" className="text-gray-900 dark:text-white">
                        <a 
                          href={currentOrganization.paymentUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-accent-600 hover:text-accent-500"
                        >
                          {currentOrganization.paymentUrl}
                        </a>
                      </p>
                    </div>
                  )}

                  {currentOrganization.calendlyUrl && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="org-calendly-display">
                        Calendly URL
                      </label>
                      <p id="org-calendly-display" className="text-gray-900 dark:text-white">
                        <a 
                          href={currentOrganization.calendlyUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-accent-600 hover:text-accent-500"
                        >
                          {currentOrganization.calendlyUrl}
                        </a>
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                // Edit form
                <div className="space-y-4">
                  <div>
                    <FormLabel htmlFor="edit-name">Organization Name *</FormLabel>
                    <Input
                      id="edit-name"
                      value={editOrgForm.name}
                      onChange={(value) => setEditOrgForm(prev => ({ ...prev, name: value }))}
                      placeholder="Enter organization name"
                    />
                  </div>

                  <div>
                    <FormLabel htmlFor="edit-description">Description</FormLabel>
                    <Input
                      id="edit-description"
                      value={editOrgForm.description}
                      onChange={(value) => setEditOrgForm(prev => ({ ...prev, description: value }))}
                      placeholder="Enter organization description"
                    />
                  </div>

                  <div>
                    <FormLabel htmlFor="edit-business-phone">Business Phone</FormLabel>
                    <Input
                      id="edit-business-phone"
                      value={editOrgForm.businessPhone}
                      onChange={(value) => setEditOrgForm(prev => ({ ...prev, businessPhone: value }))}
                      placeholder="Enter business phone"
                    />
                  </div>

                  <div>
                    <FormLabel htmlFor="edit-business-email">Business Email</FormLabel>
                    <Input
                      id="edit-business-email"
                      type="email"
                      value={editOrgForm.businessEmail}
                      onChange={(value) => setEditOrgForm(prev => ({ ...prev, businessEmail: value }))}
                      placeholder="Enter business email"
                    />
                  </div>

                  <div>
                    <FormLabel htmlFor="edit-consultation-fee">Consultation Fee</FormLabel>
                    <Input
                      id="edit-consultation-fee"
                      value={editOrgForm.consultationFee}
                      onChange={(value) => setEditOrgForm(prev => ({ ...prev, consultationFee: value }))}
                      placeholder="e.g., $150.00"
                    />
                  </div>

                  <div>
                    <FormLabel htmlFor="edit-payment-url">Payment URL</FormLabel>
                    <Input
                      id="edit-payment-url"
                      value={editOrgForm.paymentUrl}
                      onChange={(value) => setEditOrgForm(prev => ({ ...prev, paymentUrl: value }))}
                      placeholder="Enter payment URL"
                    />
                  </div>

                  <div>
                    <FormLabel htmlFor="edit-calendly-url">Calendly URL</FormLabel>
                    <Input
                      id="edit-calendly-url"
                      value={editOrgForm.calendlyUrl}
                      onChange={(value) => setEditOrgForm(prev => ({ ...prev, calendlyUrl: value }))}
                      placeholder="Enter Calendly URL"
                    />
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <Button
                      onClick={handleUpdateOrganization}
                      variant="primary"
                      disabled={!editOrgForm.name.trim()}
                    >
                      Save Changes
                    </Button>
                    <Button
                      onClick={() => setIsEditingOrg(false)}
                      variant="secondary"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Danger Zone */}
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-red-900 dark:text-red-400 mb-2">
                Danger Zone
              </h3>
              <p className="text-red-700 dark:text-red-300 mb-4">
                Once you delete an organization, there is no going back. Please be certain.
              </p>
              <Button
                onClick={() => setShowDeleteModal(true)}
                variant="secondary"
                className="inline-flex items-center text-red-600 hover:text-red-700 border-red-300 hover:border-red-400"
              >
                <TrashIcon className="w-4 h-4 mr-2" />
                Delete Organization
              </Button>
            </div>
          </div>
        )}

        {/* Create Organization Modal */}
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="Create Organization"
        >
          <div className="space-y-4">
            <div>
              <FormLabel htmlFor="create-name">Organization Name *</FormLabel>
              <Input
                id="create-name"
                value={createForm.name}
                onChange={(value) => setCreateForm(prev => ({ ...prev, name: value }))}
                placeholder="Enter organization name"
              />
            </div>

            <div>
              <FormLabel htmlFor="create-slug">Slug (optional)</FormLabel>
              <Input
                id="create-slug"
                value={createForm.slug}
                onChange={(value) => setCreateForm(prev => ({ ...prev, slug: value }))}
                placeholder="organization-slug"
              />
            </div>

            <div>
              <FormLabel htmlFor="create-description">Description</FormLabel>
              <Input
                id="create-description"
                value={createForm.description}
                onChange={(value) => setCreateForm(prev => ({ ...prev, description: value }))}
                placeholder="Enter organization description"
              />
            </div>

            <div>
              <FormLabel htmlFor="create-business-phone">Business Phone</FormLabel>
              <Input
                id="create-business-phone"
                value={createForm.businessPhone}
                onChange={(value) => setCreateForm(prev => ({ ...prev, businessPhone: value }))}
                placeholder="Enter business phone"
              />
            </div>

            <div>
              <FormLabel htmlFor="create-business-email">Business Email</FormLabel>
              <Input
                id="create-business-email"
                type="email"
                value={createForm.businessEmail}
                onChange={(value) => setCreateForm(prev => ({ ...prev, businessEmail: value }))}
                placeholder="Enter business email"
              />
            </div>

            <div>
              <FormLabel htmlFor="create-consultation-fee">Consultation Fee</FormLabel>
              <Input
                id="create-consultation-fee"
                value={createForm.consultationFee}
                onChange={(value) => setCreateForm(prev => ({ ...prev, consultationFee: value }))}
                placeholder="e.g., $150.00"
              />
            </div>

            <div>
              <FormLabel htmlFor="create-payment-url">Payment URL</FormLabel>
              <Input
                id="create-payment-url"
                value={createForm.paymentUrl}
                onChange={(value) => setCreateForm(prev => ({ ...prev, paymentUrl: value }))}
                placeholder="Enter payment URL"
              />
            </div>

            <div>
              <FormLabel htmlFor="create-calendly-url">Calendly URL</FormLabel>
              <Input
                id="create-calendly-url"
                value={createForm.calendlyUrl}
                onChange={(value) => setCreateForm(prev => ({ ...prev, calendlyUrl: value }))}
                placeholder="Enter Calendly URL"
              />
            </div>

            <div className="flex space-x-3 pt-4">
              <Button
                onClick={handleCreateOrganization}
                variant="primary"
                disabled={!createForm.name.trim()}
              >
                Create Organization
              </Button>
              <Button
                onClick={() => setShowCreateModal(false)}
                variant="secondary"
              >
                Cancel
              </Button>
            </div>
          </div>
        </Modal>

        {/* Delete Organization Modal */}
        <Modal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          title="Delete Organization"
        >
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              This action cannot be undone. This will permanently delete the organization
              and all associated data.
            </p>
            
            <div>
              <FormLabel htmlFor="delete-confirm">
                Type <strong>{currentOrganization?.name}</strong> to confirm:
              </FormLabel>
              <Input
                id="delete-confirm"
                value={deleteConfirmText}
                onChange={(value) => setDeleteConfirmText(value)}
                placeholder="Enter organization name"
              />
            </div>

            <div className="flex space-x-3 pt-4">
              <Button
                onClick={handleDeleteOrganization}
                variant="secondary"
                disabled={deleteConfirmText !== currentOrganization?.name}
                className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400"
              >
                Delete Organization
              </Button>
              <Button
                onClick={() => setShowDeleteModal(false)}
                variant="secondary"
              >
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
};