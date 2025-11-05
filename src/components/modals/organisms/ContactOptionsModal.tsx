import { FunctionComponent } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import Modal from '../../Modal';
import { Button } from '../../ui/Button';
import { useTheme } from '../../../hooks/useTheme';
import type { LawyerProfile } from '../../../../worker/schemas/lawyer';
import { ModalCloseButton } from '../atoms';
import { ContactOptionsSection } from '../molecules';

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
  const copyTimeoutRef = useRef<number | null>(null);

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handlePhone = () => {
    const raw = (lawyer?.phone || '').trim();
    if (!raw) {
      // optionally surface a toast here
      return;
    }
    const telUrl = `tel:${encodeURIComponent(raw)}`;
    window.location.href = telUrl;
    onClose();
  };
  const handleEmail = () => {
    const raw = (lawyer?.email || '').trim();
    if (!raw) {
      // optionally surface a toast here
      return;
    }
    const mailtoUrl = `mailto:${encodeURIComponent(raw)}`;
    window.location.href = mailtoUrl;
    onClose();
  };
  const handleWebsite = () => {
    if (!lawyer.website) { onClose(); return; }
    try {
      let urlString = lawyer.website;
      if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
        urlString = `https://${urlString}`;
      }
      const url = new URL(urlString);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        window.open(url.href, '_blank', 'noopener,noreferrer');
        onClose();
      } else {
        throw new Error('Invalid protocol');
      }
    } catch (error) {
      console.error('Invalid URL:', error);
      onClose();
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
          <ModalCloseButton onClick={onClose} ariaLabel="Close contact options modal" />
        </div>

        <ContactOptionsSection
          lawyer={lawyer}
          isDark={isDark}
          copiedField={copiedField}
          onCopy={(field) => copyToClipboard(
            field === 'phone' ? (lawyer.phone || '') : field === 'email' ? (lawyer.email || '') : (lawyer.website || ''),
            field
          )}
          onPhone={handlePhone}
          onEmail={handleEmail}
          onWebsite={handleWebsite}
        />

        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-dark-border">
          <Button variant="primary" onClick={handleContactLawyer} className="w-full">
            Contact Through App
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ContactOptionsModal;
