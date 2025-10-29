import { FunctionComponent } from 'preact';
import { useState } from 'preact/hooks';
import { Button } from './ui/Button';
import Modal from './Modal';
import {
  PhoneIcon,
  EnvelopeIcon,
  XMarkIcon,
  GlobeAltIcon,
  ClipboardDocumentIcon,
  CheckIcon
} from "@heroicons/react/24/outline";
import { useTheme } from '../hooks/useTheme';
import type { LawyerProfile } from '../../worker/schemas/lawyer';

interface ContactOptionsModalProps {
  lawyer: LawyerProfile;
  isOpen: boolean;
  onClose: () => void;
  onContactLawyer: (lawyer: LawyerProfile) => void;
}

const ContactOptionsModal: FunctionComponent<ContactOptionsModalProps> = ({
  lawyer,
  isOpen,
  onClose,
  onContactLawyer
}) => {
  const { isDark } = useTheme();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const handlePhoneIconCall = () => {
    window.open(`tel:${lawyer.phone}`, '_self');
    onClose();
  };

  const handleEmail = () => {
    window.open(`mailto:${lawyer.email}`, '_self');
    onClose();
  };

  const handleWebsite = () => {
    if (!lawyer.website) {
      onClose();
      return;
    }

    try {
      // Normalize URL by adding https:// if no protocol is specified
      let urlString = lawyer.website;
      if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
        urlString = `https://${urlString}`;
      }

      const url = new URL(urlString);
      
      // Only allow http and https protocols
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        window.open(url.href, '_blank', 'noopener,noreferrer');
        onClose();
      } else {
        throw new Error('Invalid protocol');
      }
    } catch (error) {
      console.error('Invalid URL:', error);
      onClose();
      // Could optionally show an error message to the user here
    }
  };

  const handleContactLawyer = () => {
    onContactLawyer(lawyer);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className={`p-6 ${isDark ? 'bg-dark-card' : 'bg-white'} rounded-lg max-w-md w-full mx-4`}>
        <div className="flex justify-between items-center mb-4">
          <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Contact {lawyer.name}
          </h3>
          <button
            onClick={onClose}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClose();
              }
            }}
            className={`p-1 rounded-md transition-colors ${isDark ? 'hover:bg-dark-hover' : 'hover:bg-gray-100'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
            aria-label="Close contact options modal"
            type="button"
          >
            <XMarkIcon className="w-5 h-5 text-gray-500" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3">
          {lawyer.phone && (
            <div className={`p-3 rounded-lg border ${isDark ? 'bg-dark-bg border-dark-border' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <PhoneIcon className="w-5 h-5 text-green-500 mr-3" />
                  <div>
                    <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      PhoneIcon
                    </p>
                    <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                      {lawyer.phone}
                    </p>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(lawyer.phone || '', 'phone')}
                    className="p-1"
                  >
                    {copiedField === 'phone' ? (
                      <CheckIcon className="w-4 h-4 text-green-500" />
                    ) : (
                      <ClipboardDocumentIcon className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handlePhoneIconCall}
                  >
                    Call
                  </Button>
                </div>
              </div>
            </div>
          )}

          {lawyer.email && (
            <div className={`p-3 rounded-lg border ${isDark ? 'bg-dark-bg border-dark-border' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <EnvelopeIcon className="w-5 h-5 text-blue-500 mr-3" />
                  <div>
                    <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      Email
                    </p>
                    <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                      {lawyer.email}
                    </p>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(lawyer.email || '', 'email')}
                    className="p-1"
                  >
                    {copiedField === 'email' ? (
                      <CheckIcon className="w-4 h-4 text-green-500" />
                    ) : (
                      <ClipboardDocumentIcon className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleEmail}
                  >
                    Email
                  </Button>
                </div>
              </div>
            </div>
          )}

          {lawyer.website && (
            <div className={`p-3 rounded-lg border ${isDark ? 'bg-dark-bg border-dark-border' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <GlobeAltIcon className="w-5 h-5 text-purple-500 mr-3" />
                  <div>
                    <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      Website
                    </p>
                    <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'} truncate max-w-48`}>
                      {lawyer.website}
                    </p>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(lawyer.website || '', 'website')}
                    className="p-1"
                  >
                    {copiedField === 'website' ? (
                      <CheckIcon className="w-4 h-4 text-green-500" />
                    ) : (
                      <ClipboardDocumentIcon className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleWebsite}
                  >
                    Visit
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-dark-border">
          <Button
            variant="primary"
            onClick={handleContactLawyer}
            className="w-full"
          >
            Contact Through App
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ContactOptionsModal;
