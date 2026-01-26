import type { MattersSidebarStatus } from '@/shared/hooks/useMattersSidebar';
import type { TimelineItem } from '@/shared/ui/activity/ActivityTimeline';

export type MatterSummary = {
  id: string;
  title: string;
  clientName: string;
  practiceArea?: string | null;
  status: MattersSidebarStatus;
  updatedAt: string;
};

export type MatterMilestone = {
  description: string;
  dueDate: string;
  amount: number;
};

export type MatterTask = {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  status: 'pending' | 'completed';
  timeEstimateHours?: number;
};

export type MatterDetail = MatterSummary & {
  clientId: string;
  practiceAreaId: string;
  assigneeIds: string[];
  description: string;
  billingType: 'hourly' | 'fixed' | 'contingency';
  attorneyHourlyRate?: number;
  adminHourlyRate?: number;
  paymentFrequency?: 'project' | 'milestone';
  totalFixedPrice?: number;
  milestones?: MatterMilestone[];
  tasks?: MatterTask[];
  contingencyPercent?: number;
  timeEntries?: TimeEntry[];
};

export type TimeEntry = {
  id: string;
  startTime: string;
  endTime: string;
  description: string;
};

export type MatterOption = {
  id: string;
  name: string;
  email?: string;
  role?: string;
};

const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

const daysAgo = (days: number, hours = 0) =>
  new Date(Date.now() - (days * 24 + hours) * 60 * 60 * 1000).toISOString();

const daysFromNow = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const buildTimeEntry = (
  id: string,
  daysOffset: number,
  startTime: string,
  endTime: string,
  description: string
): TimeEntry => {
  const base = new Date();
  base.setDate(base.getDate() - daysOffset);

  const buildDateTime = (timeValue: string) => {
    const [hours, minutes] = timeValue.split(':').map(Number);
    const date = new Date(base);
    date.setHours(hours, minutes, 0, 0);
    return date.toISOString();
  };

  return {
    id,
    startTime: buildDateTime(startTime),
    endTime: buildDateTime(endTime),
    description
  };
};

export const mockClients: MatterOption[] = [
  { id: 'client-avery-chen', name: 'Avery Chen', email: 'avery.chen@blawby.com' },
  { id: 'client-luna-martinez', name: 'Luna Martinez', email: 'luna.martinez@blawby.com' },
  { id: 'client-miles-okafor', name: 'Miles Okafor', email: 'miles.okafor@blawby.com' },
  { id: 'client-priya-desai', name: 'Priya Desai', email: 'priya.desai@blawby.com' },
  { id: 'client-sawyer-brooks', name: 'Sawyer Brooks', email: 'sawyer.brooks@blawby.com' },
  { id: 'client-talia-nguyen', name: 'Talia Nguyen', email: 'talia.nguyen@blawby.com' },
  { id: 'client-zane-howard', name: 'Zane Howard', email: 'zane.howard@blawby.com' }
];

export const mockPracticeAreas: MatterOption[] = [
  { id: 'practice-business', name: 'Business Formation' },
  { id: 'practice-employment', name: 'Employment Law' },
  { id: 'practice-ip', name: 'Intellectual Property' },
  { id: 'practice-estate', name: 'Estate Planning' },
  { id: 'practice-real-estate', name: 'Real Estate' },
  { id: 'practice-immigration', name: 'Immigration' },
  { id: 'practice-family', name: 'Family Law' }
];

export const mockAssignees: MatterOption[] = [
  { id: 'assignee-fern', name: 'Fern Patel', role: 'Senior Paralegal' },
  { id: 'assignee-river', name: 'River Chan', role: 'Associate Attorney' },
  { id: 'assignee-jo', name: 'Jo Hammond', role: 'Managing Partner' },
  { id: 'assignee-tess', name: 'Tess Molina', role: 'Case Manager' }
];

export const mockMatters: MatterSummary[] = [
  {
    id: 'matter-redwood-llc',
    title: 'Redwood Labs LLC formation',
    clientName: 'Avery Chen',
    practiceArea: 'Business Formation',
    status: 'open',
    updatedAt: hoursAgo(4)
  },
  {
    id: 'matter-estate',
    title: 'Estate plan refresh',
    clientName: 'Luna Martinez',
    practiceArea: 'Estate Planning',
    status: 'in_progress',
    updatedAt: daysAgo(1, 6)
  },
  {
    id: 'matter-ip-trademark',
    title: 'Trademark filing for Modern Field',
    clientName: 'Miles Okafor',
    practiceArea: 'Intellectual Property',
    status: 'lead',
    updatedAt: daysAgo(2, 3)
  },
  {
    id: 'matter-lease',
    title: 'Commercial lease negotiation',
    clientName: 'Priya Desai',
    practiceArea: 'Real Estate',
    status: 'completed',
    updatedAt: daysAgo(3, 8)
  },
  {
    id: 'matter-policy',
    title: 'Employee handbook update',
    clientName: 'Sawyer Brooks',
    practiceArea: 'Employment Law',
    status: 'open',
    updatedAt: daysAgo(1, 12)
  },
  {
    id: 'matter-incorporation',
    title: 'Nonprofit incorporation',
    clientName: 'Talia Nguyen',
    practiceArea: 'Business Formation',
    status: 'in_progress',
    updatedAt: daysAgo(5)
  },
  {
    id: 'matter-immigration',
    title: 'O-1 petition preparation',
    clientName: 'Zane Howard',
    practiceArea: 'Immigration',
    status: 'open',
    updatedAt: daysAgo(6, 4)
  },
  {
    id: 'matter-family',
    title: 'Postnuptial agreement review',
    clientName: 'Priya Desai',
    practiceArea: 'Family Law',
    status: 'lead',
    updatedAt: daysAgo(4, 2)
  },
  {
    id: 'matter-compliance',
    title: 'Privacy policy compliance audit',
    clientName: 'Avery Chen',
    practiceArea: 'Business Formation',
    status: 'archived',
    updatedAt: daysAgo(12)
  },
  {
    id: 'matter-investor',
    title: 'SAFE review for seed round',
    clientName: 'Luna Martinez',
    practiceArea: 'Business Formation',
    status: 'in_progress',
    updatedAt: daysAgo(7, 10)
  },
  {
    id: 'matter-contract',
    title: 'Vendor contract cleanup',
    clientName: 'Sawyer Brooks',
    practiceArea: 'Employment Law',
    status: 'completed',
    updatedAt: daysAgo(9, 1)
  },
  {
    id: 'matter-property',
    title: 'Residential purchase closing',
    clientName: 'Miles Okafor',
    practiceArea: 'Real Estate',
    status: 'archived',
    updatedAt: daysAgo(18)
  }
];

export const mockMatterDetails: Record<string, MatterDetail> = {
  'matter-redwood-llc': {
    ...mockMatters[0],
    clientId: 'client-avery-chen',
    practiceAreaId: 'practice-business',
    assigneeIds: ['assignee-jo', 'assignee-fern'],
    description: 'Form new entity, draft bylaws, and coordinate filing timeline.',
    billingType: 'fixed',
    paymentFrequency: 'milestone',
    milestones: [
      { description: 'Name availability + formation filing', dueDate: daysFromNow(10), amount: 1200 },
      { description: 'Operating agreement + EIN', dueDate: daysFromNow(24), amount: 1800 }
    ],
    tasks: [
      {
        id: 'task-redwood-1',
        title: 'Finalize entity name',
        description: 'Confirm availability and secure name reservation if needed.',
        dueDate: daysFromNow(4),
        status: 'pending',
        timeEstimateHours: 2
      },
      {
        id: 'task-redwood-2',
        title: 'Draft operating agreement outline',
        description: 'Share initial outline with client stakeholders.',
        dueDate: daysFromNow(12),
        status: 'pending',
        timeEstimateHours: 4
      },
      {
        id: 'task-redwood-3',
        title: 'Submit filing documents',
        description: 'Prepare filing packet for state submission.',
        dueDate: daysFromNow(16),
        status: 'completed',
        timeEstimateHours: 3
      }
    ],
    timeEntries: [
      buildTimeEntry('time-entry-1', 1, '09:00', '11:15', 'Drafted operating agreement provisions.'),
      buildTimeEntry('time-entry-2', 1, '13:00', '14:30', 'Reviewed client intake notes and follow-up.'),
      buildTimeEntry('time-entry-3', 2, '10:00', '12:00', 'Prepared filing checklist and timeline.'),
      buildTimeEntry('time-entry-4', 3, '15:00', '16:15', 'Coordinated with secretary of state office.'),
      buildTimeEntry('time-entry-5', 4, '08:45', '10:00', 'Compiled entity name availability report.'),
      buildTimeEntry('time-entry-6', 6, '11:30', '13:00', 'Drafted engagement letter revisions.')
    ]
  },
  'matter-estate': {
    ...mockMatters[1],
    clientId: 'client-luna-martinez',
    practiceAreaId: 'practice-estate',
    assigneeIds: ['assignee-tess'],
    description: 'Update estate plan and review beneficiary designations.',
    billingType: 'hourly',
    tasks: [
      {
        id: 'task-estate-1',
        title: 'Collect beneficiary updates',
        description: 'Request updated beneficiary designations from client.',
        dueDate: daysFromNow(7),
        status: 'pending',
        timeEstimateHours: 1
      },
      {
        id: 'task-estate-2',
        title: 'Revise trust documents',
        description: 'Update trust provisions based on client feedback.',
        dueDate: daysFromNow(14),
        status: 'pending',
        timeEstimateHours: 6
      }
    ],
    attorneyHourlyRate: 250,
    adminHourlyRate: 95
  },
  'matter-ip-trademark': {
    ...mockMatters[2],
    clientId: 'client-miles-okafor',
    practiceAreaId: 'practice-ip',
    assigneeIds: ['assignee-river'],
    description: 'Prepare trademark search and filing strategy.',
    billingType: 'contingency',
    contingencyPercent: 20
  },
  'matter-lease': {
    ...mockMatters[3],
    clientId: 'client-priya-desai',
    practiceAreaId: 'practice-real-estate',
    assigneeIds: ['assignee-jo'],
    description: 'Negotiate lease terms and draft revisions.',
    billingType: 'hourly',
    attorneyHourlyRate: 300,
    adminHourlyRate: 110
  },
  'matter-policy': {
    ...mockMatters[4],
    clientId: 'client-sawyer-brooks',
    practiceAreaId: 'practice-employment',
    assigneeIds: ['assignee-tess'],
    description: 'Refresh employee handbook and compliance policies.',
    billingType: 'fixed',
    paymentFrequency: 'project',
    totalFixedPrice: 4200
  },
  'matter-incorporation': {
    ...mockMatters[5],
    clientId: 'client-talia-nguyen',
    practiceAreaId: 'practice-business',
    assigneeIds: ['assignee-fern'],
    description: 'Nonprofit incorporation and initial filings.',
    billingType: 'fixed',
    paymentFrequency: 'milestone',
    milestones: [
      { description: 'Draft articles + bylaws', dueDate: daysFromNow(14), amount: 900 },
      { description: 'State filing + EIN', dueDate: daysFromNow(30), amount: 1400 }
    ]
  },
  'matter-immigration': {
    ...mockMatters[6],
    clientId: 'client-zane-howard',
    practiceAreaId: 'practice-immigration',
    assigneeIds: ['assignee-river'],
    description: 'Prepare O-1 petition and evidence packet.',
    billingType: 'hourly',
    attorneyHourlyRate: 275,
    adminHourlyRate: 105
  },
  'matter-family': {
    ...mockMatters[7],
    clientId: 'client-priya-desai',
    practiceAreaId: 'practice-family',
    assigneeIds: ['assignee-fern'],
    description: 'Review and revise postnuptial agreement.',
    billingType: 'fixed',
    paymentFrequency: 'project',
    totalFixedPrice: 1800
  },
  'matter-compliance': {
    ...mockMatters[8],
    clientId: 'client-avery-chen',
    practiceAreaId: 'practice-business',
    assigneeIds: ['assignee-tess'],
    description: 'Audit privacy policy and data handling procedures.',
    billingType: 'contingency',
    contingencyPercent: 15
  },
  'matter-investor': {
    ...mockMatters[9],
    clientId: 'client-luna-martinez',
    practiceAreaId: 'practice-business',
    assigneeIds: ['assignee-jo'],
    description: 'Review SAFE terms and advise on revisions.',
    billingType: 'hourly',
    attorneyHourlyRate: 320,
    adminHourlyRate: 120
  },
  'matter-contract': {
    ...mockMatters[10],
    clientId: 'client-sawyer-brooks',
    practiceAreaId: 'practice-employment',
    assigneeIds: ['assignee-river'],
    description: 'Clean up vendor contracts and redlines.',
    billingType: 'fixed',
    paymentFrequency: 'project',
    totalFixedPrice: 2600
  },
  'matter-property': {
    ...mockMatters[11],
    clientId: 'client-miles-okafor',
    practiceAreaId: 'practice-real-estate',
    assigneeIds: ['assignee-fern'],
    description: 'Handle residential closing documents.',
    billingType: 'hourly',
    attorneyHourlyRate: 240,
    adminHourlyRate: 90
  }
};

export const mockMatterActivity: TimelineItem[] = [
  {
    id: 'matter-activity-created',
    type: 'created',
    person: {
      name: 'Chelsea Hagon',
      imageUrl:
        'https://images.unsplash.com/photo-1550525811-e5869dd03032?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'
    },
    date: '2d ago',
    dateTime: daysAgo(2, 1),
    action: 'created a new matter for Redwood Labs.'
  },
  {
    id: 'matter-activity-edited',
    type: 'edited',
    person: {
      name: 'Chelsea Hagon',
      imageUrl:
        'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'
    },
    date: '1d ago',
    dateTime: daysAgo(1, 6),
    action: 'updated the intake summary.'
  },
  {
    id: 'matter-activity-commented',
    type: 'commented',
    person: {
      name: 'Alex Curren'
    },
    date: '12h ago',
    dateTime: hoursAgo(12),
    comment: 'Client confirmed the entity name and signed engagement letter.'
  },
  {
    id: 'matter-activity-sent',
    type: 'sent',
    person: {
      name: 'Chelsea Hagon'
    },
    date: '5h ago',
    dateTime: hoursAgo(5),
    action: 'sent the first milestone update.'
  }
];
