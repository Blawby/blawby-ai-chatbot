import type { Env } from '../types';
import { parseJsonBody } from '../utils.js';
import { ReviewService } from '../services/ReviewService';
import { HttpErrors, handleError, createSuccessResponse } from '../errorHandler';

export async function handleReview(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET') {
    return handleGetReviewMatters(request, env);
  } else if (request.method === 'POST') {
    return handleProcessReview(request, env);
  } else {
    throw HttpErrors.methodNotAllowed('Only GET and POST methods are allowed');
  }
}

async function handleGetReviewMatters(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const practiceId = url.searchParams.get('practiceId');

    if (!practiceId) {
      throw HttpErrors.badRequest('Practice ID is required');
    }

    const reviewService = new ReviewService(env);
    const matters = await reviewService.getReviewMatters(practiceId);
    const stats = await reviewService.getReviewStats(practiceId);

    return createSuccessResponse({
      matters,
      stats
    });
  } catch (error) {
    return handleError(error);
  }
}

async function handleProcessReview(request: Request, env: Env): Promise<Response> {
  try {
    const body = await parseJsonBody(request) as { matterId?: string; action?: string; notes?: string };
    const { matterId, action, notes } = body;

    if (!matterId) {
      throw HttpErrors.badRequest('Matter ID is required');
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      throw HttpErrors.badRequest('Action must be "approve" or "reject"');
    }

    const reviewService = new ReviewService(env);
    const success = await reviewService.processReview(matterId, action as 'approve' | 'reject', notes);

    if (!success) {
      throw HttpErrors.internalServerError('Failed to process review');
    }

    // Map actions to their correct past-tense forms
    const actionPastTenseMap: Record<string, string> = {
      approve: 'approved',
      reject: 'rejected'
    };

    const pastTenseAction = actionPastTenseMap[action] || 'processed';

    return createSuccessResponse({
      success: true,
      message: `Matter ${pastTenseAction} successfully`
    });
  } catch (error) {
    return handleError(error);
  }
} 