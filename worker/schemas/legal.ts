// Legal domain type definitions

export interface MatterCanvas {
  matterId?: string;
  matterNumber?: string;
  service: string;
  matterSummary: string;
  answers?: Record<string, string>;
  isExpanded?: boolean;
}

export interface DocumentItem {
  id: string;
  name: string;
  description?: string;
  required: boolean;
  status: 'missing' | 'uploaded' | 'pending';
  file?: File;
}

export interface DocumentChecklist {
  matterType: string;
  documents: DocumentItem[];
}

export interface DocumentRequirement {
  id: string;
  name: string;
  description: string;
  required: boolean;
  category: string;
  matterTypes: string[];
}

export interface MatterDocumentRequirements {
  matterType: string;
  requirements: DocumentRequirement[];
}

export interface ContactInfoMatch {
  type: 'email' | 'phone' | 'address';
  value: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
}

export type MatterType = 
  | 'personal_injury' 
  | 'family_law' 
  | 'criminal_defense'
  | 'employment_law'
  | 'business_law'
  | 'real_estate'
  | 'estate_planning'
  | 'immigration'
  | 'bankruptcy'
  | 'divorce'
  | 'child_custody'
  | 'dui'
  | 'workers_compensation';

export type MessageRole = 'user' | 'assistant' | 'system';
