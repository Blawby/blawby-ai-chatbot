import { FunctionComponent } from 'preact';
import {
  PhoneIcon,
  EnvelopeIcon,
  GlobeAltIcon,
  ClipboardDocumentIcon,
  CheckIcon
} from '@heroicons/react/24/outline';
import type { LawyerProfile } from '../../../../worker/schemas/lawyer';
import { Button } from '@/shared/ui/Button';

interface ContactOptionsSectionProps {
  lawyer: LawyerProfile;
  isDark: boolean;
  copiedField: string | null;
  onCopy: (field: 'phone' | 'email' | 'website') => void;
  onPhone: () => void;
  onEmail: () => void;
  onWebsite: () => void;
}

const ContactOptionsSection: FunctionComponent<ContactOptionsSectionProps> = ({
  lawyer,
  isDark,
  copiedField,
  onCopy,
  onPhone,
  onEmail,
  onWebsite,
}) => {
  return (
    <div className="space-y-3">
      {lawyer.phone && (
        <div className={`p-3 rounded-lg border ${isDark ? 'bg-dark-bg border-dark-border' : 'bg-gray-50 border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <PhoneIcon className="w-5 h-5 text-green-500 mr-3" />
              <div>
                <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Phone</p>
                <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{lawyer.phone}</p>
              </div>
            </div>
            <div className="flex space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCopy('phone')}
                className="p-1"
                aria-label="Copy phone number"
              >
                {copiedField === 'phone' ? (
                  <CheckIcon className="w-4 h-4 text-green-500" />
                ) : (
                  <ClipboardDocumentIcon className="w-4 h-4" />
                )}
              </Button>
              <Button variant="primary" size="sm" onClick={onPhone}>
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
                <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Email</p>
                <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{lawyer.email}</p>
              </div>
            </div>
            <div className="flex space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCopy('email')}
                className="p-1"
                aria-label="Copy email address"
              >
                {copiedField === 'email' ? (
                  <CheckIcon className="w-4 h-4 text-green-500" />
                ) : (
                  <ClipboardDocumentIcon className="w-4 h-4" />
                )}
              </Button>
              <Button variant="primary" size="sm" onClick={onEmail}>
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
                <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Website</p>
                <p
                  className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'} truncate max-w-48`}
                  title={lawyer.website || ''}
                  aria-label={lawyer.website || ''}
                >
                  {lawyer.website}
                </p>
              </div>
            </div>
            <div className="flex space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCopy('website')}
                className="p-1"
                aria-label="Copy website URL"
              >
                {copiedField === 'website' ? (
                  <CheckIcon className="w-4 h-4 text-green-500" />
                ) : (
                  <ClipboardDocumentIcon className="w-4 h-4" />
                )}
              </Button>
              <Button variant="primary" size="sm" onClick={onWebsite}>
                Visit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactOptionsSection;
