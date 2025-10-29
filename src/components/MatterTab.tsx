import { FunctionComponent } from 'preact';
import { useRef } from 'preact/hooks';
import { analyzeMissingInfo } from '../utils/matterAnalysis';
import {
  DocumentIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  CreditCardIcon
} from "@heroicons/react/24/outline";
import { MatterData, MatterStatus } from '../types/matter';
import { getDefaultDocumentSuggestions } from '../hooks/useMatterState';
import type { DocumentIconAttachment } from '../../worker/types';

interface MatterTabProps {
  matter: MatterData | null;
  status: MatterStatus;
  onStartChat?: () => void;
  onViewInChat?: () => void;
  onPayNow?: () => void;
  onViewPDF?: () => void;
  onShareMatter?: () => void;
  onUploadDocument?: (files: File[], metadata?: { documentType?: string; matterId?: string }) => Promise<DocumentIconAttachment[]>;
}

/**
 * Maps document IDs from getDefaultDocumentSuggestions to semantic documentType values
 * expected by DocumentRequirementService
 */
function mapDocumentIdToType(documentId: string | null): string | undefined {
  if (!documentId) {
    return undefined; // Let backend infer the type
  }

  const mapping: Record<string, string> = {
    // Family law documents
    'marriage-cert': 'marriage_certificate',
    'financial-records': 'financial_statements',
    'child-info': 'birth_certificates',
    
    // Employment law documents
    'employment-contract': 'employment_contract',
    'pay-stubs': 'pay_stubs',
    'termination-docs': 'termination_documents',
    
    // Tenant/landlord documents
    'lease-agreement': 'lease_agreement',
    'payment-receipts': 'payment_receipts',
    'communication': 'communication_records',
    
    // Business documents
    'contracts': 'business_contracts',
    'financial-statements': 'financial_statements',
    
    // If no mapping exists, function returns undefined to let backend infer the type
  };

  return mapping[documentId] || undefined; // Return undefined to let backend infer
}

const MatterTab: FunctionComponent<MatterTabProps> = ({
  matter,
  status,
  onStartChat,
  onViewInChat,
  onPayNow,
  onViewPDF,
  onShareMatter,
  onUploadDocument
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadDocId = useRef<string | null>(null);

  // Handle file upload
  const handleDocumentIconUpload = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const files = target.files;
    if (files && files.length > 0 && onUploadDocument) {
      try {
        const fileArray = Array.from(files);
        const documentType = mapDocumentIdToType(pendingUploadDocId.current);
        const metadata: { documentType?: string; matterId?: string } = {
          matterId: matter?.matterNumber,
        };
        // Only include documentType if we have a valid mapping
        if (documentType) {
          metadata.documentType = documentType;
        }
        await onUploadDocument(fileArray, metadata);
        // Reset the input and clear pending document ID
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        pendingUploadDocId.current = null;
      } catch (error) {
        console.error('DocumentIcon upload failed:', error);
        // Clear pending document ID even on error
        pendingUploadDocId.current = null;
      }
    }
  };

  // Trigger file input
  const triggerDocumentIconUpload = (documentId?: string) => {
    // Set the pending document ID before opening the file picker
    if (documentId) {
      pendingUploadDocId.current = documentId;
    }
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Empty state - no matter exists yet
  if (status === 'empty') {
    return (
      <div>
        <DocumentIcon />
        <h3>No Matter Yet</h3>
        <p>Start a chat to create your matter</p>
        <button onClick={onStartChat}>
          Start Chat
        </button>
      </div>
    );
  }

  if (!matter) {
    return null;
  }

  // Get document suggestions (use existing or default)
  const documentSuggestions = matter.documentChecklist?.documents || 
    getDefaultDocumentSuggestions(matter.service) || [];

  // Analyze missing information
  const missingInfo = analyzeMissingInfo(matter);

  return (
    <div>
      {/* Matter Header */}
      <div>
        <div>
          <h3>{matter.matterNumber || 'Matter'}</h3>
          <div>{status}</div>
        </div>
        <p>{matter.service}</p>
        {matter.matterSummary && (
          <p>{matter.matterSummary.substring(0, 100)}...</p>
        )}
      </div>

      {/* Missing Information Section */}
      {missingInfo.length > 0 && (
        <div>
          <div>
            <ExclamationTriangleIcon />
            <h4>Missing Information</h4>
          </div>
          <ul>
            {missingInfo.slice(0, 3).map((info, index) => (
              <li key={index}>• {info}</li>
            ))}
            {missingInfo.length > 3 && (
              <li>• +{missingInfo.length - 3} more items</li>
            )}
          </ul>
          <button onClick={onViewInChat}>
            Continue in Chat
          </button>
        </div>
      )}

      {/* Document Suggestions */}
      <div>
        <div>
          <DocumentIcon />
          <h4>Suggested Documents</h4>
        </div>
        <div>
          {documentSuggestions.slice(0, 3).map((doc) => (
            <div key={doc.id}>
              <div>
                {doc.status === 'uploaded' ? (
                  <CheckCircleIcon />
                ) : (
                  <DocumentIcon />
                )}
                <div>
                  <p>{doc.name}</p>
                  {doc.required && (
                    <span>Required</span>
                  )}
                </div>
              </div>
              {doc.status === 'missing' && (
                <button onClick={() => triggerDocumentIconUpload(doc.id)}>Upload</button>
              )}
            </div>
          ))}
          {documentSuggestions.length > 3 && (
            <p>+{documentSuggestions.length - 3} more documents</p>
          )}
        </div>
      </div>

      {/* Payment Section */}
      {matter.hasPayment && matter.paymentEmbed && (
        <div>
          <div>
            <CreditCardIcon />
            <h4>Payment Required</h4>
          </div>
          <p>
            {matter.paymentEmbed.description || 'Consultation fee'}
            {matter.paymentEmbed.amount !== null && matter.paymentEmbed.amount !== undefined && (
              <span> - {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(matter.paymentEmbed.amount)}</span>
            )}
          </p>
          <div>
            <button onClick={onPayNow}>
              Pay Now
            </button>
            <button onClick={onViewInChat}>
              View in Chat
            </button>
          </div>
        </div>
      )}

      {/* Ready State Actions */}
      {status === 'ready' && (
        <div>
          <div>
            <CheckCircleIcon />
            <h4>Matter Complete</h4>
          </div>
          <p>All required information has been provided</p>
          <div>
            <button onClick={onViewPDF}>
              View PDF
            </button>
            <button onClick={onShareMatter}>
              Share Matter
            </button>
          </div>
        </div>
      )}

      {/* View in Chat Link */}
      <div>
        <button onClick={onViewInChat}>
          View in Chat
        </button>
      </div>

      {/* Hidden file input for document uploads */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.webp"
        onChange={handleDocumentIconUpload}
        style={{ display: 'none' }}
      />
    </div>
  );
};


export default MatterTab;
