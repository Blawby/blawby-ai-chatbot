export const MATTER_WORKFLOW_STATUSES = [
  'first_contact',
  'intake_pending',
  'conflict_check',
  'conflicted',
  'eligibility',
  'referred',
  'consultation_scheduled',
  'declined',
  'engagement_pending',
  'active',
  'pleadings_filed',
  'discovery',
  'mediation',
  'pre_trial',
  'trial',
  'order_entered',
  'appeal_pending',
  'closed'
] as const;

export type MatterStatus = typeof MATTER_WORKFLOW_STATUSES[number];

export const MATTER_STATUS_LABELS: Record<MatterStatus, string> = {
  first_contact: 'First contact',
  intake_pending: 'Intake pending',
  conflict_check: 'Conflict check',
  conflicted: 'Conflicted',
  eligibility: 'Eligibility',
  referred: 'Referred',
  consultation_scheduled: 'Consultation scheduled',
  declined: 'Declined',
  engagement_pending: 'Engagement pending',
  active: 'Active',
  pleadings_filed: 'Pleadings filed',
  discovery: 'Discovery',
  mediation: 'Mediation',
  pre_trial: 'Pre-trial',
  trial: 'Trial',
  order_entered: 'Order entered',
  appeal_pending: 'Appeal pending',
  closed: 'Closed'
};

export const isMatterStatus = (value: string): value is MatterStatus =>
  (MATTER_WORKFLOW_STATUSES as readonly string[]).includes(value);
