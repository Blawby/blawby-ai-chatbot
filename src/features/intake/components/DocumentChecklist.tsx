import { FunctionComponent } from 'preact';
import { useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import {
  DocumentIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  CloudArrowUpIcon,
  XMarkIcon
} from "@heroicons/react/24/outline";

interface DocumentItem {
  id: string;
  name: string;
  description?: string;
  required: boolean;
  status: 'missing' | 'uploaded' | 'pending';
  file?: File;
}

interface DocumentChecklistProps {
  matterType: string;
  documents: DocumentItem[];
  onDocumentUpload: (documentId: string, file: File) => void;
  onDocumentRemove: (documentId: string) => void;
  onComplete: () => void;
  onSkip: () => void;
}

const DocumentChecklist: FunctionComponent<DocumentChecklistProps> = ({
  matterType,
  documents,
  onDocumentUpload,
  onDocumentRemove,
  onComplete,
  onSkip
}) => {
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDocumentIconSelect = (documentId: string, event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      onDocumentUpload(documentId, file);
    }
  };

  const handleDrop = (documentId: string, event: DragEvent) => {
    event.preventDefault();
    setDragOverId(null);
    
    const file = event.dataTransfer?.files[0];
    if (file) {
      onDocumentUpload(documentId, file);
    }
  };

  const handleDragOver = (documentId: string, event: DragEvent) => {
    event.preventDefault();
    setDragOverId(documentId);
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const getStatusIcon = (status: DocumentItem['status'], required: boolean) => {
    switch (status) {
      case 'uploaded':
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case 'pending':
        return <ExclamationTriangleIcon className="w-5 h-5 text-yellow-500" />;
      case 'missing':
        return required ?
          <ExclamationTriangleIcon className="w-5 h-5 text-red-500" /> :
          <DocumentIcon className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusText = (status: DocumentItem['status'], required: boolean) => {
    switch (status) {
      case 'uploaded':
        return 'Uploaded';
      case 'pending':
        return 'Processing...';
      case 'missing':
        return required ? 'Required' : 'Optional';
    }
  };

  const completedCount = documents.filter(doc => doc.status === 'uploaded').length;
  const requiredCount = documents.filter(doc => doc.required).length;
  const requiredCompleted = documents.filter(doc => doc.required && doc.status === 'uploaded').length;
  const canComplete = requiredCompleted === requiredCount;

  return (
    <div className="bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-lg p-6 max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Document Checklist for {matterType}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Please upload the documents listed below. Required documents are marked with a red icon.
        </p>
        <div className="mt-3 flex items-center gap-4 text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            Progress: {completedCount}/{documents.length} documents
          </span>
          <span className="text-gray-600 dark:text-gray-400">
            Required: {requiredCompleted}/{requiredCount} completed
          </span>
        </div>
      </div>

      {/* Document List */}
      <div className="space-y-4 mb-6">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className={`border rounded-lg p-4 transition-colors ${
              dragOverId === doc.id 
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                : 'border-gray-200 dark:border-dark-border'
            }`}
            onDrop={(e) => handleDrop(doc.id, e)}
            onDragOver={(e) => handleDragOver(doc.id, e)}
            onDragLeave={handleDragLeave}
            aria-label={`Document drop zone for ${doc.name}`}
            role="button"
            tabIndex={0}
          >
            <div className="flex items-start gap-3">
              {getStatusIcon(doc.status, doc.required)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    {doc.name}
                  </h4>
                  {doc.required && (
                    <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 px-2 py-1 rounded">
                      Required
                    </span>
                  )}
                  <span className={`text-xs px-2 py-1 rounded ${
                    doc.status === 'uploaded' 
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                      : doc.status === 'pending'
                      ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}>
                    {getStatusText(doc.status, doc.required)}
                  </span>
                </div>
                {doc.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    {doc.description}
                  </p>
                )}
                
                {/* DocumentIcon Upload Area */}
                {doc.status === 'missing' && (
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt"
                        onChange={(e) => handleDocumentIconSelect(doc.id, e)}
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<CloudArrowUpIcon className="w-4 h-4" />}
                      >
                        Choose DocumentIcon
                      </Button>
                    </label>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      or drag and drop
                    </span>
                  </div>
                )}

                {/* Uploaded DocumentIcon Display */}
                {doc.status === 'uploaded' && doc.file && (
                  <div className="flex items-center gap-2 mt-2">
                    <DocumentIcon className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {doc.file.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<XMarkIcon className="w-4 h-4" />}
                      onClick={() => onDocumentRemove(doc.id)}
                      className="text-red-500 hover:text-red-700"
                    />
                  </div>
                )}

                {/* Pending Status */}
                {doc.status === 'pending' && (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-500" />
                    <span className="text-sm text-yellow-600 dark:text-yellow-400">
                      Processing document...
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-dark-border">
        <Button
          variant="ghost"
          onClick={onSkip}
          className="text-gray-600 dark:text-gray-400"
        >
          Skip for now
        </Button>
        <Button
          variant="primary"
          onClick={onComplete}
          disabled={!canComplete}
          className="min-w-[120px]"
        >
          {canComplete ? 'Complete Checklist' : `Complete ${requiredCount - requiredCompleted} more required`}
        </Button>
      </div>
    </div>
  );
};

export default DocumentChecklist;
