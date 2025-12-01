export type MatterStatus = 'empty' | 'incomplete' | 'ready';

export interface MatterData {
  matterId?: string;
  matterNumber?: string;
  service: string;
  matterSummary: string;
  answers?: Record<string, string>;
  status: MatterStatus;
  documentChecklist?: {
    matterType: string;
    documents: Array<{
      id: string;
      name: string;
      description?: string;
      required: boolean;
      status: 'missing' | 'uploaded' | 'pending';
    }>;
  };
}

export interface Matter {
  id: string;
  matterNumber?: string;
  title: string;
  service: string;
  status: MatterStatus;
  createdAt: Date;
  updatedAt: Date;
  summary: string;
  answers?: Record<string, string>;
  contactInfo?: {
    email?: string;
    phone?: string;
  };
} 