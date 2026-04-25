import type { UserDetailRecord, UserDetailStatus } from '@/shared/lib/apiClient';

// Canonical model:
// A contact may have a relationship status with the practice, such as lead or client.
// A participant is a contact or team member in a conversation context.
// A user account is optional and separate from the contact record.
export type ContactRecord = UserDetailRecord;
export type ContactRelationshipStatus = UserDetailStatus;

export const CONTACTS_DIRECTORY_LABEL = 'Contacts';

export const CONTACT_RELATIONSHIP_STATUS_LABELS: Record<ContactRelationshipStatus, string> = {
  lead: 'Lead',
  active: 'Client',
  inactive: 'Former client',
  archived: 'Archived',
};
