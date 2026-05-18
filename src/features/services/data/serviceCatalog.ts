import { Briefcase, MessagesSquare, Clipboard, FileText, AlertTriangle, Home, Scale, ShieldCheck, Sparkles, Users, GraduationCap, Building2, Store } from 'lucide-preact';

import type { ServiceTemplate } from '../types';

export const SERVICE_CATALOG: ServiceTemplate[] = [
  {
    id: 'family-law',
    title: 'Family Law',
    icon: Users
  },
  {
    id: 'business-law',
    title: 'Business Law',
    icon: Briefcase
  },
  {
    id: 'contract-review',
    title: 'Contract Review',
    icon: FileText
  },
  {
    id: 'intellectual-property',
    title: 'Intellectual Property',
    icon: Sparkles
  },
  {
    id: 'employment-law',
    title: 'Employment Law',
    icon: ShieldCheck
  },
  {
    id: 'personal-injury',
    title: 'Personal Injury',
    icon: AlertTriangle
  },
  {
    id: 'criminal-law',
    title: 'Criminal Law',
    icon: Scale
  },
  {
    id: 'civil-law',
    title: 'Civil Law',
    icon: Building2
  },
  {
    id: 'general-consultation',
    title: 'General Consultation',
    icon: MessagesSquare
  },
  {
    id: 'small-business-nonprofits',
    title: 'Small Business and Nonprofits',
    icon: Store
  },
  {
    id: 'tenant-rights',
    title: 'Tenant Rights',
    icon: Home
  },
  {
    id: 'probate-estate-planning',
    title: 'Probate and Estate Planning',
    icon: Clipboard
  },
  {
    id: 'special-education-iep-advocacy',
    title: 'Special Education and IEP Advocacy',
    icon: GraduationCap
  }
];
