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
