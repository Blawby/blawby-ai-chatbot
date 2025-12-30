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
    description: 'Divorce, custody, adoption, and other family matters.',
    icon: UserGroupIcon
  },
  {
    id: 'business-law',
    title: 'Business Law',
    description: 'Business formation, governance, and general counsel services.',
    icon: BriefcaseIcon
  },
  {
    id: 'contract-review',
    title: 'Contract Review',
    description: 'Drafting, reviewing, and negotiating agreements.',
    icon: DocumentTextIcon
  },
  {
    id: 'intellectual-property',
    title: 'Intellectual Property',
    description: 'Trademarks, copyrights, patents, and IP strategy.',
    icon: SparklesIcon
  },
  {
    id: 'employment-law',
    title: 'Employment Law',
    description: 'Workplace policies, disputes, and compliance.',
    icon: ShieldCheckIcon
  },
  {
    id: 'personal-injury',
    title: 'Personal Injury',
    description: 'Representation for accident and injury claims.',
    icon: ExclamationTriangleIcon
  },
  {
    id: 'criminal-law',
    title: 'Criminal Law',
    description: 'Defense for charges, investigations, and hearings.',
    icon: ScaleIcon
  },
  {
    id: 'civil-law',
    title: 'Civil Law',
    description: 'Disputes, litigation strategy, and settlements.',
    icon: BuildingOfficeIcon
  },
  {
    id: 'general-consultation',
    title: 'General Consultation',
    description: 'General legal guidance and next steps.',
    icon: ChatBubbleLeftRightIcon
  },
  {
    id: 'small-business-nonprofits',
    title: 'Small Business and Nonprofits',
    description: 'Legal support for small businesses and nonprofit leaders.',
    icon: BuildingStorefrontIcon
  },
  {
    id: 'tenant-rights',
    title: 'Tenant Rights',
    description: 'Support for housing disputes and tenant protections.',
    icon: HomeIcon
  },
  {
    id: 'probate-estate-planning',
    title: 'Probate and Estate Planning',
    description: 'Estate planning and administration services.',
    icon: ClipboardDocumentIcon
  },
  {
    id: 'special-education-iep-advocacy',
    title: 'Special Education and IEP Advocacy',
    description: 'Guidance for IEP planning and education rights.',
    icon: AcademicCapIcon
  }
];
