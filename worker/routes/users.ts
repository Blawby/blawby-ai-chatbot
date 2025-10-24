import type { Env } from '../types.js';
import { parseJsonBody } from '../utils.js';
import { HttpErrors } from '../errorHandler.js';
import { HttpError } from '../types.js';
import { requireAuth } from '../middleware/auth.js';
import { OnboardingData } from '../../src/types/user.js';

type UseCase = 'personal' | 'business' | 'research' | 'documents' | 'other';

interface OnboardingRequest {
  personalInfo: {
    firstName: string;
    lastName: string;
    birthday?: string;
    agreedToTerms?: boolean;
  };
  useCase: {
    selectedUseCases: UseCase[];
    additionalInfo?: string;
  };
  skippedSteps?: string[];
}

export async function handleUsers(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/users', '');
  
  try {
    // POST /api/users/onboarding - Submit onboarding data
    if (path === '/onboarding' && request.method === 'POST') {
      const { user } = await requireAuth(request, env);
      
      const body = await parseJsonBody(request) as OnboardingRequest;
      
      // Validate the onboarding data structure
      if (!body || typeof body !== 'object') {
        throw HttpErrors.badRequest('Invalid onboarding data');
      }
      
      // Validate required fields
      if (!body.personalInfo || !body.useCase) {
        throw HttpErrors.badRequest('Missing required onboarding fields: personalInfo and useCase');
      }
      
      if (!body.personalInfo.firstName || !body.personalInfo.lastName) {
        throw HttpErrors.badRequest('First name and last name are required');
      }
      
      // Validate that firstName and lastName are strings
      if (typeof body.personalInfo.firstName !== 'string' || typeof body.personalInfo.lastName !== 'string') {
        throw HttpErrors.badRequest('First name and last name must be strings');
      }
      
      if (!body.useCase.selectedUseCases || !Array.isArray(body.useCase.selectedUseCases) || body.useCase.selectedUseCases.length === 0) {
        throw HttpErrors.badRequest('At least one use case must be selected');
      }
      
      // Validate use case values
      const validUseCases = ['personal', 'business', 'research', 'documents', 'other'];
      const invalidUseCases = body.useCase.selectedUseCases.filter((useCase: string) => !validUseCases.includes(useCase));
      if (invalidUseCases.length > 0) {
        throw HttpErrors.badRequest(`Invalid use cases: ${invalidUseCases.join(', ')}`);
      }
      
      // Prepare onboarding data with completion timestamp
      const onboardingData: OnboardingData = {
        personalInfo: {
          firstName: body.personalInfo.firstName.trim(),
          lastName: body.personalInfo.lastName.trim(),
          birthday: body.personalInfo.birthday || undefined,
          agreedToTerms: Boolean(body.personalInfo.agreedToTerms)
        },
        useCase: {
          selectedUseCases: body.useCase.selectedUseCases,
          additionalInfo: body.useCase.additionalInfo?.trim() || undefined
        },
        completedAt: new Date().toISOString(),
        skippedSteps: body.skippedSteps || []
      };
      
      // Update user record with onboarding data
      const onboardingJson = JSON.stringify(onboardingData);
      
      await env.DB.prepare(`
        UPDATE users 
        SET onboarding_data = ?, 
            onboarding_completed = true,
            updated_at = datetime('now')
        WHERE id = ?
      `).bind(onboardingJson, user.id).run();
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Onboarding data saved successfully',
          data: {
            onboardingCompleted: true,
            completedAt: onboardingData.completedAt
          }
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // GET /api/users/onboarding - Get current user's onboarding data
    if (path === '/onboarding' && request.method === 'GET') {
      const { user } = await requireAuth(request, env);
      
      const result = await env.DB.prepare(`
        SELECT onboarding_data, onboarding_completed 
        FROM users 
        WHERE id = ?
      `).bind(user.id).first();
      
      if (!result) {
        throw HttpErrors.notFound('User not found');
      }
      
      let onboardingData = null;
      if (result.onboarding_data) {
        try {
          onboardingData = JSON.parse(result.onboarding_data as string);
        } catch (error) {
          // Log sanitized error details server-side (no PII)
          console.error('Failed to parse onboarding data for user:', {
            userId: user.id,
            error: error instanceof Error ? error.message : 'Unknown error',
            dataSize: result.onboarding_data ? result.onboarding_data.length : 0,
            dataType: typeof result.onboarding_data,
            hasData: !!result.onboarding_data
          });
          
          // Return 500 response to client with generic message
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Onboarding data corrupted'
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            onboardingData,
            onboardingCompleted: Boolean(result.onboarding_completed)
          }
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    throw HttpErrors.notFound('User endpoint not found');
    
  } catch (error) {
    console.error('Users API error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      }),
      {
        status: error instanceof HttpError ? error.status : 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
