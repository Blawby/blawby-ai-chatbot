import type { MatterStatus } from '@/shared/types/matterStatus';
import type { TimelineItem } from '@/shared/ui/activity/ActivityTimeline';
import { type MajorAmount } from '@/shared/utils/money';

export type MatterSummary = {
  id: string;
  title: string;
  clientName: string;
  practiceArea?: string | null;
  status: MatterStatus;
  updatedAt: string;
  createdAt: string;
};

export type MatterMilestone = {
  id?: string;
  description: string;
  dueDate: string;
  amount: MajorAmount;
  status?: 'pending' | 'in_progress' | 'completed' | 'overdue';
};

export type MatterMilestoneFormInput = {
  description: string;
  dueDate: string;
  amount?: MajorAmount;
};

export type MatterTask = {
  id: string;
  matterId: string;
  name: string;
  description: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  status: 'pending' | 'in_progress' | 'complete' | 'blocked';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  stage: string;
  createdAt: string;
  updatedAt: string;
};

export type MatterNote = {
  id: string;
  author: {
    name: string;
    role?: string;
    avatarUrl?: string;
  };
  content: string;
  createdAt: string;
  updatedAt?: string;
};

export type MatterDetail = MatterSummary & {
  clientId: string;
  practiceAreaId: string;
  assigneeIds: string[];
  description: string;
  conversationId?: string | null;
  caseNumber?: string;
  matterType?: string;
  urgency?: 'routine' | 'time_sensitive' | 'emergency';
  responsibleAttorneyId?: string;
  originatingAttorneyId?: string;
  court?: string;
  judge?: string;
  opposingParty?: string;
  opposingCounsel?: string;
  openDate?: string;
  closeDate?: string;
  billingType: 'hourly' | 'fixed' | 'contingency' | 'pro_bono';
  attorneyHourlyRate?: MajorAmount;
  adminHourlyRate?: MajorAmount;
  paymentFrequency?: 'project' | 'milestone';
  totalFixedPrice?: MajorAmount;
  settlementAmount?: MajorAmount;
  milestones?: MatterMilestone[];
  tasks?: MatterTask[];
  contingencyPercent?: number;
  timeEntries?: TimeEntry[];
  expenses?: MatterExpense[];
  notes?: MatterNote[];
  activity?: TimelineItem[];
};

export type TimeEntry = {
  id: string;
  startTime: string;
  endTime: string;
  description: string;
};

export type MatterExpense = {
  id: string;
  description: string;
  amount: MajorAmount;
  date: string;
  billable: boolean;
};

export type MatterOption = {
  id: string;
  name: string;
  email?: string;
  image?: string | null;
  role?: string;
  status?: string;
  location?: string;
};
