import {
  AcademicCapIcon,
  BriefcaseIcon,
  BuildingOfficeIcon,
  BuildingStorefrontIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  HomeIcon,
  ScaleIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline';
import type { ServiceTemplate } from '../types';

export const SERVICE_CATALOG: ServiceTemplate[] = [
  {
    id: 'family-law',
    title: 'Family Law',
    icon: UserGroupIcon
  },
  {
    id: 'business-law',
    title: 'Business Law',
    icon: BriefcaseIcon
  },
  {
    id: 'contract-review',
    title: 'Contract Review',
    icon: DocumentTextIcon
  },
  {
    id: 'intellectual-property',
    title: 'Intellectual Property',
    icon: SparklesIcon
  },
  {
    id: 'employment-law',
    title: 'Employment Law',
    icon: ShieldCheckIcon
  },
  {
    id: 'personal-injury',
    title: 'Personal Injury',
    icon: ExclamationTriangleIcon
  },
  {
    id: 'criminal-law',
    title: 'Criminal Law',
    icon: ScaleIcon
  },
  {
    id: 'civil-law',
    title: 'Civil Law',
    icon: BuildingOfficeIcon
  },
  {
    id: 'general-consultation',
    title: 'General Consultation',
    icon: ChatBubbleLeftRightIcon
  },
  {
    id: 'small-business-nonprofits',
    title: 'Small Business and Nonprofits',
    icon: BuildingStorefrontIcon
  },
  {
    id: 'tenant-rights',
    title: 'Tenant Rights',
    icon: HomeIcon
  },
  {
    id: 'probate-estate-planning',
    title: 'Probate and Estate Planning',
    icon: ClipboardDocumentIcon
  },
  {
    id: 'special-education-iep-advocacy',
    title: 'Special Education and IEP Advocacy',
    icon: AcademicCapIcon
  }
];
