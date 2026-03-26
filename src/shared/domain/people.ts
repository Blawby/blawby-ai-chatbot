import type { UserDetailRecord, UserDetailStatus } from '@/shared/lib/apiClient';

// Canonical model:
// A person may have a relationship status with the practice, such as lead or client.
// A participant is a person or team member in a conversation context.
// A user account is optional and separate from the person record.
export type PersonRecord = UserDetailRecord;
export type PersonRelationshipStatus = UserDetailStatus;

export const PEOPLE_DIRECTORY_LABEL = 'People';

export const PERSON_RELATIONSHIP_STATUS_LABELS: Record<PersonRelationshipStatus, string> = {
  lead: 'Lead',
  active: 'Client',
  inactive: 'Former client',
  archived: 'Archived',
};
