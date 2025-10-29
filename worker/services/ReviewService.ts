import type { Env } from '../types';
import type { OrganizationConfig } from './OrganizationService';

export interface ReviewMatter {
  id: string;
  matterNumber: string;
  service: string;
  title: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  clientName?: string;
  contactInfo?: {
    email?: string;
    phone?: string;
  };
  answers?: Record<string, string>;
  aiSummary?: string;
  lawyerNotes?: string;
}

export class ReviewService {
  constructor(private env: Env) {}

  // Get matters that require lawyer review
  async getReviewMatters(organizationId: string): Promise<ReviewMatter[]> {
    try {
      // Get matters that have been flagged for review
      const matters = await this.env.DB.prepare(`
        SELECT 
          m.id,
          m.matter_number,
          m.matter_type as service,
          m.title,
          m.description,
          m.status,
          m.created_at,
          m.custom_fields,
          m.client_name,
          m.contact_info,
          aigs.summary as ai_summary
        FROM matters m
        LEFT JOIN ai_generated_summaries aigs ON m.id = aigs.matter_id
        WHERE m.organization_id = ? 
        AND m.status IN ('pending_review', 'approved', 'rejected')
        ORDER BY m.created_at DESC
      `).bind(organizationId).all();

      return matters.results?.map((matter: { [key: string]: unknown }) => {
        // Parse custom_fields once
        let customFields: Record<string, unknown> | undefined;
        if (matter.custom_fields && typeof matter.custom_fields === 'string') {
          try {
            customFields = JSON.parse(matter.custom_fields);
          } catch {
            // Ignore parse errors, customFields remains undefined
          }
        }

        // Parse contact_info defensively
        let contactInfo: { email?: string; phone?: string } | undefined;
        if (matter.contact_info && typeof matter.contact_info === 'string') {
          try {
            contactInfo = JSON.parse(matter.contact_info);
          } catch {
            // Ignore parse errors, contactInfo remains undefined
          }
        }

        return {
          id: matter.id as string,
          matterNumber: matter.matter_number as string,
          service: matter.service as string,
          title: (matter.title || `${matter.service} Matter`) as string,
          description: matter.description as string,
          status: this.mapStatus(matter.status as string),
          createdAt: matter.created_at as string,
          clientName: matter.client_name as string | undefined,
          contactInfo,
          answers: customFields?.answers as Record<string, string> | undefined,
          aiSummary: matter.ai_summary as string | undefined,
          lawyerNotes: customFields?.lawyerNotes as string | undefined
        };
      }) || [];
    } catch (error) {
      console.error('Failed to get review matters:', error);
      return [];
    }
  }

  // Process lawyer review action (approve/reject)
  async processReview(
    matterId: string, 
    action: 'approve' | 'reject', 
    notes?: string
  ): Promise<boolean> {
    try {
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      
      // Update matter status
      await this.env.DB.prepare(`
        UPDATE matters 
        SET status = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(newStatus, matterId).run();

      // Update custom fields with lawyer notes
      if (notes) {
        const currentFields = await this.env.DB.prepare(`
          SELECT custom_fields FROM matters WHERE id = ?
        `).bind(matterId).first();
        
        const customFields = currentFields ? JSON.parse(currentFields.custom_fields as string) : {};
        customFields.lawyerNotes = notes;
        customFields.reviewedAt = new Date().toISOString();
        customFields.reviewAction = action;

        await this.env.DB.prepare(`
          UPDATE matters 
          SET custom_fields = ?, updated_at = datetime('now')
          WHERE id = ?
        `).bind(JSON.stringify(customFields), matterId).run();
      }

      // Log the review action
      await this.env.DB.prepare(`
        INSERT INTO review_logs (id, matter_id, action, notes, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).bind(
        `${matterId}-${Date.now()}`,
        matterId,
        action,
        notes || null
      ).run();

      return true;
    } catch (error) {
      console.error('Failed to process review:', error);
      return false;
    }
  }

  // Get review statistics for a organization
  async getReviewStats(organizationId: string): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  }> {
    try {
      const stats = await this.env.DB.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
        FROM matters 
        WHERE organization_id = ? 
        AND status IN ('pending_review', 'approved', 'rejected')
      `).bind(organizationId).first();

      return {
        total: (stats as { total?: number })?.total || 0,
        pending: (stats as { pending?: number })?.pending || 0,
        approved: (stats as { approved?: number })?.approved || 0,
        rejected: (stats as { rejected?: number })?.rejected || 0
      };
    } catch (error) {
      console.error('Failed to get review stats:', error);
      return { total: 0, pending: 0, approved: 0, rejected: 0 };
    }
  }


  // Helper: Map database status to review status
  private mapStatus(status: string): 'pending' | 'approved' | 'rejected' {
    switch (status) {
      case 'pending_review':
        return 'pending';
      case 'approved':
        return 'approved';
      case 'rejected':
        return 'rejected';
      default:
        return 'pending';
    }
  }
} 