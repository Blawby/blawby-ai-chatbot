import { OrganizationService } from '../services/OrganizationService.js';
import { Env } from '../types.js';
import { ValidationError } from '../utils/validationErrors.js';
import { requireAuth, requireOrgOwner, requireOrgMember } from '../middleware/auth.js';
import { handleError, HttpErrors } from '../errorHandler.js';
import type { Organization } from '../services/OrganizationService.js';
import { organizationCreateSchema, organizationUpdateSchema } from '../schemas/validation.js';
import { requireFeature, type FeatureName } from '../middleware/featureGuard.js';

/**
 * Helper function to create standardized error responses
 */
function createErrorResponse(
  error: unknown, 
  operation: string,
  defaultMessage: string = 'An error occurred'
): Response {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
  
  // Handle validation errors specifically
  if (error instanceof ValidationError) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }), 
      { 
        status: 400,
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
  
  // Log full error details for debugging while returning generic message to client
  console.error(`${operation} error:`, {
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : error,
    operation,
    timestamp: new Date().toISOString()
  });
  
  // Handle other errors with generic client message
  return new Response(
    JSON.stringify({ 
      success: false, 
      error: defaultMessage 
    }), 
    { 
      status: 500,
      headers: { 'Content-Type': 'application/json' } 
    }
  );
}

/**
 * Helper function to create standardized success responses
 */
function createSuccessResponse(data: unknown): Response {
  return new Response(
    JSON.stringify({ 
      success: true, 
      data 
    }), 
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' } 
    }
  );
}

const ACTIVE_BUSINESS_STATUSES = new Set(['active', 'trialing']);

async function requireActiveBusinessOrganization(
  request: Request,
  env: Env,
  organizationId: string,
  feature: FeatureName
) {
  const context = await requireFeature(
    request,
    env,
    {
      feature,
      allowAnonymous: false,
      requireNonPersonal: true,
      minTier: ['business', 'enterprise'],
    },
    { organizationId }
  );

  if (!ACTIVE_BUSINESS_STATUSES.has(context.subscriptionStatus)) {
    throw HttpErrors.paymentRequired('An active subscription is required for this action', {
      subscriptionStatus: context.subscriptionStatus,
    });
  }

  return context;
}

function sanitizeOrganizationResponse(organization: Organization): Organization {
  return {
    ...organization,
    config: {
      ...(organization.config ?? {}),
      voice: organization.config?.voice ?? {
        enabled: false,
        provider: 'elevenlabs' as const,
      },
      blawbyApi: organization.config?.blawbyApi
        ? {
            enabled: organization.config.blawbyApi.enabled,
            apiUrl: organization.config.blawbyApi.apiUrl,
          }
        : undefined,
    },
  };
}

function parseLimit(rawLimit: string | null, defaultValue: number = 25): number {
  const parsed = Number(rawLimit);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return Math.min(parsed, 100);
}

function parseJsonField<T = unknown>(value: unknown): T | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
async function recordOrganizationEvent(
  env: Env,
  organizationId: string,
  event: { type: string; actorId?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO organization_events (id, organization_id, event_type, actor_user_id, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      crypto.randomUUID(),
      organizationId,
      event.type,
      event.actorId ?? null,
      event.metadata ? JSON.stringify(event.metadata) : null
    ).run();
  } catch (error) {
    console.error('Failed to record organization event:', error);
  }
}

export async function handleOrganizations(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/organizations', '');
    const pathSegments = path.split('/').filter(segment => segment.length > 0);
    
    const organizationService = new OrganizationService(env);

    // Handle pending invitations
    if ((path === '/me/invitations' || path === '/me/invitations/') && request.method === 'GET') {
      const { user } = await requireAuth(request, env);

      const invitations = await env.DB.prepare(
        `SELECT i.id,
                i.organization_id as organizationId,
                o.name as organizationName,
                i.email,
                i.role,
                i.status,
                i.invited_by as invitedBy,
                i.expires_at as expiresAt,
                i.created_at as createdAt
           FROM invitations i
           LEFT JOIN organizations o ON i.organization_id = o.id
          WHERE i.email = ? AND i.status = 'pending'
          ORDER BY i.created_at DESC`
      ).bind(user.email).all();

      // Preact usage note: call this to populate "pending invites" in the settings dashboard.
      return new Response(
        JSON.stringify({
          success: true,
          data: invitations.results ?? []
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Authenticated user organizations route
    if ((path === '/me' || path === '/me/') && request.method === 'GET') {
      const authContext = await requireAuth(request, env);
      
      const organizations = await organizationService.listOrganizations(authContext.user.id);

      return new Response(
        JSON.stringify({
          success: true,
          data: organizations.map(sanitizeOrganizationResponse),
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if ((path === '/me/ensure-personal' || path === '/me/ensure-personal/') && request.method === 'POST') {
      const authContext = await requireAuth(request, env);
      const organization = await organizationService.ensurePersonalOrganization(
        authContext.user.id,
        authContext.user.name ?? authContext.user.email
      );

      return createSuccessResponse({
        organization: organization ? sanitizeOrganizationResponse(organization) : null,
      });
    }

    if (pathSegments.length === 2 && pathSegments[1] === 'member') {
      const organizationIdentifier = pathSegments[0];
      const organization = await organizationService.getOrganization(organizationIdentifier);

      if (!organization) {
        throw HttpErrors.notFound('Organization not found');
      }

      if (request.method === 'GET') {
          await requireOrgMember(request, env, organization.id, 'admin');

          const members = await env.DB.prepare(
            `SELECT m.user_id as userId,
                    m.role,
                    m.created_at as createdAt,
                    u.email,
                    u.name,
                    u.image
               FROM members m
               LEFT JOIN users u ON u.id = m.user_id
              WHERE m.organization_id = ?
              ORDER BY m.role DESC, m.created_at ASC`
          ).bind(organization.id).all();

        // Preact usage: fetch to populate org settings > member list.
        return createSuccessResponse({
          members: members.results ?? []
        });
      }

      if (request.method === 'PATCH') {
        const { user } = await requireOrgOwner(request, env, organization.id);
        const body = await request.json() as {
          userId: string;
          role: 'owner' | 'admin' | 'attorney' | 'paralegal';
        };

        if (!body.userId || !body.role) {
          throw HttpErrors.badRequest('userId and role are required');
        }

        const validRoles = new Set(['owner', 'admin', 'attorney', 'paralegal']);
        if (!validRoles.has(body.role)) {
          throw HttpErrors.badRequest('Invalid role specified');
        }

        const existingMember = await env.DB.prepare(
          `SELECT role FROM members WHERE organization_id = ? AND user_id = ?`
        ).bind(organization.id, body.userId).first<{ role: string }>();

        if (!existingMember) {
          throw HttpErrors.notFound('Member not found');
        }

        if (existingMember.role === 'owner' && body.role !== 'owner') {
          const ownerCountRow = await env.DB.prepare(
            `SELECT COUNT(*) as ownerCount 
               FROM members 
              WHERE organization_id = ? AND role = 'owner'`
          ).bind(organization.id).first<{ ownerCount: number }>();

          const ownerCount = Number(ownerCountRow?.ownerCount ?? 0);

          if (ownerCount <= 1) {
            throw HttpErrors.forbidden('Cannot change role: organization must have at least one owner');
          }
        }

        if (existingMember.role !== body.role) {
          const updateResult = await env.DB.prepare(
            `UPDATE members
                SET role = ?
              WHERE organization_id = ? AND user_id = ?`
          ).bind(body.role, organization.id, body.userId).run();

          if ((updateResult.meta?.changes ?? 0) === 0) {
            throw HttpErrors.internalServerError('Failed to update member role');
          }

        await recordOrganizationEvent(env, organization.id, {
          type: 'member.role_updated',
          actorId: user.id,
          metadata: {
            targetUserId: body.userId,
            previousRole: existingMember.role,
            newRole: body.role
          }
        });
      }

        return createSuccessResponse({
          userId: body.userId,
          role: body.role
        });
      }

      if (request.method === 'DELETE') {
        const ownerContext = await requireOrgOwner(request, env, organization.id);
        const userId = url.searchParams.get('userId');

        if (!userId) {
          throw HttpErrors.badRequest('userId query parameter is required');
        }

        const memberRecord = await env.DB.prepare(
          `SELECT role FROM members WHERE organization_id = ? AND user_id = ?`
        ).bind(organization.id, userId).first<{ role: string }>();

        if (!memberRecord) {
          throw HttpErrors.notFound('Member not found');
        }

        if (memberRecord.role === 'owner') {
          const ownerCountRow = await env.DB.prepare(
            `SELECT COUNT(*) as ownerCount 
               FROM members 
              WHERE organization_id = ? AND role = 'owner'`
          ).bind(organization.id).first<{ ownerCount: number }>();

          const ownerCount = Number(ownerCountRow?.ownerCount ?? 0);

          if (ownerCount <= 1) {
            throw HttpErrors.forbidden('Cannot remove the last owner from the organization');
          }
        }

        const removal = await env.DB.prepare(
          `DELETE FROM members WHERE organization_id = ? AND user_id = ?`
        ).bind(organization.id, userId).run();

        if ((removal.meta?.changes ?? 0) === 0) {
          throw HttpErrors.notFound('Member not found');
        }

        await recordOrganizationEvent(env, organization.id, {
          type: 'member.removed',
          actorId: ownerContext.user.id,
          metadata: {
            targetUserId: userId,
            previousRole: memberRecord.role
          }
        });

        // Preact usage: call DELETE when admin removes a teammate.
        return createSuccessResponse({ removed: true });
      }
    }

    // Organization workspace analytics + data feeds
    if (path.includes('/workspace')) {
      const pathParts = path.split('/').filter(Boolean);
      if (pathParts.length >= 3 && pathParts[1] === 'workspace') {
        const organizationIdentifier = pathParts[0];
        const resource = pathParts[2];
        const organization = await organizationService.getOrganization(organizationIdentifier);

        if (!organization) {
          throw HttpErrors.notFound('Organization not found');
        }

        // Require at least admin access for dashboard data
        await requireOrgMember(request, env, organization.id, 'admin');

        const limit = parseLimit(url.searchParams.get('limit'));

        if (resource === 'contact-forms') {
          const submissions = await env.DB.prepare(
            `SELECT id,
                    conversation_id as conversationId,
                    phone_number as phoneNumber,
                    email,
                    matter_details as matterDetails,
                    status,
                    assigned_lawyer as assignedLawyer,
                    notes,
                    created_at as createdAt,
                    updated_at as updatedAt
               FROM contact_forms
              WHERE organization_id = ?
              ORDER BY created_at DESC
              LIMIT ?`
          ).bind(organization.id, limit).all();

          // Preact usage: fetch(`/api/organizations/${slug}/workspace/contact-forms`) for the intake dashboard table.
          return createSuccessResponse({
            submissions: submissions.results?.map(record => ({
              ...record,
              notes: parseJsonField(record.notes) ?? record.notes
            })) ?? []
          });
        }

        if (resource === 'sessions') {
          const stateFilter = url.searchParams.get('state');
          const baseQuery = `
            SELECT id,
                   state,
                   status_reason as statusReason,
                   is_hold as isHold,
                   created_at as createdAt,
                   updated_at as updatedAt,
                   last_active as lastActive,
                   closed_at as closedAt,
                   user_id as userId
              FROM chat_sessions
             WHERE organization_id = ?
             ${stateFilter ? 'AND state = ?' : ''}
             ORDER BY last_active DESC
             LIMIT ?`;

          const bindings = stateFilter
            ? [organization.id, stateFilter, limit]
            : [organization.id, limit];

          const sessions = await env.DB.prepare(baseQuery).bind(...bindings).all();

          // Preact usage: feed conversation list or analytics widgets.
          return createSuccessResponse({
            sessions: sessions.results?.map(session => ({
              ...session,
              isHold: Boolean(session.isHold)
            })) ?? []
          });
        }

        if (resource === 'matters') {
          const statusFilter = url.searchParams.get('status');
          const baseQuery = `
            SELECT id,
                   title,
                   matter_type as matterType,
                   status,
                   priority,
                   assigned_lawyer_id as assignedLawyerId,
                   client_name as clientName,
                   lead_source as leadSource,
                   created_at as createdAt,
                   updated_at as updatedAt
              FROM matters
             WHERE organization_id = ?
             ${statusFilter ? 'AND status = ?' : ''}
             ORDER BY created_at DESC
             LIMIT ?`;

          const bindings = statusFilter
            ? [organization.id, statusFilter, limit]
            : [organization.id, limit];

          const matters = await env.DB.prepare(baseQuery).bind(...bindings).all();

          // Preact usage: populate the matter board / Kanban.
          return createSuccessResponse({
            matters: matters.results ?? []
          });
        }

        if (resource === 'payments') {
          const statusFilter = url.searchParams.get('status');
          const baseQuery = `
            SELECT id,
                   payment_id as paymentId,
                   customer_email as customerEmail,
                   customer_name as customerName,
                   amount,
                   currency,
                   status,
                   event_type as eventType,
                   matter_type as matterType,
                   invoice_url as invoiceUrl,
                   created_at as createdAt
              FROM payment_history
             WHERE organization_id = ?
             ${statusFilter ? 'AND status = ?' : ''}
             ORDER BY created_at DESC
             LIMIT ?`;

          const bindings = statusFilter
            ? [organization.id, statusFilter, limit]
            : [organization.id, limit];

          const payments = await env.DB.prepare(baseQuery).bind(...bindings).all();

          // Preact usage: billing history table on the workspace.
          return createSuccessResponse({
            payments: payments.results ?? []
          });
        }

        throw HttpErrors.notFound('Workspace resource not found');
      }
    }

    // Handle API token management routes
    if (path.includes('/tokens')) {
      const pathParts = path.split('/').filter(part => part.length > 0);
      if (pathParts.length >= 2 && pathParts[1] === 'tokens') {
        const organizationId = pathParts[0];
        
        // Validate that the organization exists
        const organization = await organizationService.getOrganization(organizationId);
        if (!organization) {
                      return new Response(
              JSON.stringify({ 
                success: false, 
                error: 'Organization not found' 
              }), 
              { 
                status: 404, 
                headers: { 'Content-Type': 'application/json' } 
              }
            );
        }
        
        // Ensure requester is organization owner
        await requireOrgOwner(request, env, organization.id);
        
        if (pathParts.length === 2) {
          // /{organizationId}/tokens
          switch (request.method) {
            case 'GET':
              return await listOrganizationTokens(organizationService, organizationId);
            case 'POST':
              await requireActiveBusinessOrganization(request, env, organizationId, 'api');
              return await createOrganizationToken(organizationService, organizationId, request);
          }
        } else if (pathParts.length === 3) {
          // /{organizationId}/tokens/{tokenId}
          const tokenId = pathParts[2];
          switch (request.method) {
            case 'DELETE':
              await requireActiveBusinessOrganization(request, env, organizationId, 'api');
              return await revokeOrganizationToken(organizationService, organizationId, tokenId);
          }
        }
      }
    }

    // Helper function to extract organizationId from path and validate method
    const extractOrganizationIdForRoute = (path: string, suffix: string, method: string): string | null => {
      const pathParts = path.split('/').filter(part => part.length > 0);
      if (pathParts.length >= 2 && pathParts[1] === suffix && method === 'POST') {
        return pathParts[0];
      }
      return null;
    };

    // Handle API key validation routes
    const validateTokenOrganizationId = extractOrganizationIdForRoute(path, 'validate-token', request.method);
    if (validateTokenOrganizationId) {
      return await validateOrganizationToken(organizationService, validateTokenOrganizationId, request);
    }

    // Handle API key validation routes
    const validateApiKeyOrganizationId = extractOrganizationIdForRoute(path, 'validate-api-key', request.method);
    if (validateApiKeyOrganizationId) {
      return await validateApiKey(organizationService, validateApiKeyOrganizationId, request);
    }

    // Handle API key hash generation routes
    const generateHashOrganizationId = extractOrganizationIdForRoute(path, 'generate-hash', request.method);
    if (generateHashOrganizationId) {
      return await generateApiKeyHash(organizationService, generateHashOrganizationId);
    }

    // Handle invitation routes
    if (path === '/invitations' && request.method === 'POST') {
      const authContext = await requireAuth(request, env);
      const body = await request.json() as {
        organizationId: string;
        email: string;
        role?: 'owner' | 'admin' | 'attorney' | 'paralegal';
        expiresAt?: string;
      };

      if (!body.organizationId || !body.email) {
        throw HttpErrors.badRequest('organizationId and email are required');
      }

      const organization = await organizationService.getOrganization(body.organizationId);
      if (!organization) {
        throw HttpErrors.notFound('Organization not found');
      }

      await requireOrgOwner(request, env, organization.id);
      await requireActiveBusinessOrganization(request, env, organization.id, 'team');

      const invitationId = crypto.randomUUID();
      const expiresAt = body.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await env.DB.prepare(
        `INSERT INTO invitations (
           id, organization_id, email, role, status, invited_by, expires_at, created_at
         ) VALUES (?, ?, ?, ?, 'pending', ?, ?, datetime('now'))`
      ).bind(
        invitationId,
        organization.id,
        body.email.toLowerCase(),
        body.role ?? 'attorney',
        authContext.user.id,
        expiresAt
      ).run();

      await recordOrganizationEvent(env, organization.id, {
        type: 'invitation.sent',
        actorId: authContext.user.id,
        metadata: {
          invitationId,
          email: body.email.toLowerCase(),
          role: body.role ?? 'attorney',
          expiresAt
        }
      });

      // Comment for Preact: send POST /api/organizations/invitations when an owner invites a teammate.
      return createSuccessResponse({
        id: invitationId,
        organizationId: organization.id,
        email: body.email,
        role: body.role ?? 'attorney',
        status: 'pending',
        expiresAt
      });
    }

    if (path.endsWith('/accept-invitation') && request.method === 'POST') {
      const { user } = await requireAuth(request, env);
      
      // Find the index of 'accept-invitation' in the path segments
      const acceptInvitationIndex = pathSegments.indexOf('accept-invitation');
      
      // Validate path structure: ensure 'accept-invitation' exists and has a preceding segment
      if (acceptInvitationIndex === -1) {
        throw HttpErrors.badRequest('Invalid path: accept-invitation segment not found');
      }
      
      if (acceptInvitationIndex === 0) {
        throw HttpErrors.badRequest('Invalid path: no invitation ID provided before accept-invitation');
      }
      
      const invitationId = pathSegments[acceptInvitationIndex - 1];

      if (!invitationId) {
        throw HttpErrors.badRequest('Invitation ID is required');
      }

      const invitation = await env.DB.prepare(
        `SELECT id, organization_id as organizationId, email, role, status, expires_at as expiresAt
           FROM invitations
          WHERE id = ?`
      ).bind(invitationId).first() as {
        id: string;
        organizationId: string;
        email: string;
        role: string;
        status: string;
        expiresAt: string;
      } | null;

      if (!invitation) {
        throw HttpErrors.notFound('Invitation not found');
      }

      if (invitation.status !== 'pending') {
        throw HttpErrors.badRequest('Invitation is no longer valid');
      }

      if (new Date(invitation.expiresAt).getTime() < Date.now()) {
        throw HttpErrors.badRequest('Invitation has expired');
      }

      if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
        throw HttpErrors.forbidden('Invitation does not belong to this user');
      }

      await env.DB.prepare(
        `UPDATE invitations
            SET status = 'accepted'
          WHERE id = ?`
      ).bind(invitationId).run();

      await env.DB.prepare(
        `INSERT INTO members (id, organization_id, user_id, role, created_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(organization_id, user_id) DO UPDATE SET role = excluded.role`
      ).bind(
        crypto.randomUUID(),
        invitation.organizationId,
        user.id,
        invitation.role,
        Math.floor(Date.now() / 1000)
      ).run();

      await recordOrganizationEvent(env, invitation.organizationId, {
        type: 'member.joined',
        actorId: user.id,
        metadata: {
          invitationId,
          email: invitation.email,
          role: invitation.role
        }
      });

      // Preact note: call this endpoint when user clicks "Accept invitation".
      return createSuccessResponse({
        organizationId: invitation.organizationId,
        role: invitation.role
      });
    }

    if (path.endsWith('/decline-invitation') && request.method === 'POST') {
      const { user } = await requireAuth(request, env);
      
      // Find the index of 'decline-invitation' in the path segments
      const declineInvitationIndex = pathSegments.indexOf('decline-invitation');
      
      // Validate path structure: ensure 'decline-invitation' exists and has a preceding segment
      if (declineInvitationIndex === -1) {
        throw HttpErrors.badRequest('Invalid path: decline-invitation segment not found');
      }
      
      if (declineInvitationIndex === 0) {
        throw HttpErrors.badRequest('Invalid path: no invitation ID provided before decline-invitation');
      }
      
      const invitationId = pathSegments[declineInvitationIndex - 1];

      if (!invitationId) {
        throw HttpErrors.badRequest('Invitation ID is required');
      }

      const invitation = await env.DB.prepare(
        `SELECT id, organization_id as organizationId, email, role, status, expires_at as expiresAt
           FROM invitations
          WHERE id = ?`
      ).bind(invitationId).first() as {
        id: string;
        organizationId: string;
        email: string;
        role: string;
        status: string;
        expiresAt: string;
      } | null;

      if (!invitation) {
        throw HttpErrors.notFound('Invitation not found');
      }

      if (invitation.status !== 'pending') {
        throw HttpErrors.badRequest('Invitation is no longer valid');
      }

      if (new Date(invitation.expiresAt).getTime() < Date.now()) {
        throw HttpErrors.badRequest('Invitation has expired');
      }

      if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
        throw HttpErrors.forbidden('Invitation does not belong to this user');
      }

      await env.DB.prepare(
        `UPDATE invitations
            SET status = 'declined'
          WHERE id = ?`
      ).bind(invitationId).run();

      await recordOrganizationEvent(env, invitation.organizationId, {
        type: 'invitation.declined',
        actorId: user.id,
        metadata: {
          invitationId,
          email: invitation.email,
          role: invitation.role
        }
      });

      // Preact note: call this endpoint when user clicks "Decline invitation".
      return createSuccessResponse({
        message: 'Invitation declined successfully'
      });
    }

    switch (request.method) {
      case 'GET':
        if (path === '' || path === '/') {
          return await listOrganizations(organizationService);
        } else {
          const organizationId = path.substring(1);
          return await getOrganization(organizationService, organizationId);
        }
      
      case 'POST':
        if (path === '' || path === '/') {
          const creatorUserId = await getAuthenticatedUserId(request, env);
          return await createOrganization(organizationService, request, env, creatorUserId);
        }
        break;
      
      case 'PUT':
        if (path.startsWith('/')) {
          const slugOrId = path.substring(1).split('/')[0];
          const targetOrganization = await organizationService.getOrganization(slugOrId);
          if (!targetOrganization) {
            return new Response(
              JSON.stringify({
                success: false,
                error: 'Organization not found'
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
              }
            );
          }
          
          await requireOrgOwner(request, env, targetOrganization.id);
          await requireActiveBusinessOrganization(request, env, targetOrganization.id, 'team');
          return await updateOrganization(organizationService, targetOrganization.id, request);
        }
        break;
      
      case 'DELETE':
        console.log('DELETE case matched, path:', path);
        if (path.startsWith('/')) {
          const slugOrId = path.substring(1).split('/')[0];
          console.log('DELETE organizationId:', slugOrId);
          
          const targetOrganization = await organizationService.getOrganization(slugOrId);
          if (!targetOrganization) {
            return new Response(
              JSON.stringify({
                success: false,
                error: 'Organization not found'
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
              }
            );
          }
          
          await requireOrgOwner(request, env, targetOrganization.id);
          // Guard: prevent deletion if Stripe subscription is active (managed)
          const subStatus = (targetOrganization.subscriptionStatus || 'none').toLowerCase();
          const hasManagedSubscription = Boolean(targetOrganization.stripeCustomerId);
          const isCanceled = subStatus === 'canceled' || subStatus === 'none';

          if (hasManagedSubscription && !isCanceled) {
            // Block deletion until subscription is fully canceled via Stripe webhooks
            return new Response(
              JSON.stringify({
                success: false,
                error: 'Subscription must be canceled before deleting the organization',
                code: 'SUBSCRIPTION_ACTIVE',
                details: {
                  subscriptionStatus: subStatus,
                  subscriptionPeriodEnd: targetOrganization.subscriptionPeriodEnd ?? null
                }
              }),
              {
                status: 409,
                headers: { 'Content-Type': 'application/json' }
              }
            );
          }

          return await deleteOrganization(organizationService, targetOrganization.id);
        }
        console.log('DELETE path does not start with /');
        break;
    }

    // Handle organization events route
    if (pathSegments.length === 2 && pathSegments[1] === 'events' && request.method === 'GET') {
      const organizationIdentifier = pathSegments[0];
      const organization = await organizationService.getOrganization(organizationIdentifier);

      if (!organization) {
        throw HttpErrors.notFound('Organization not found');
      }

      await requireOrgMember(request, env, organization.id, 'admin');

      const limit = parseLimit(url.searchParams.get('limit'), 50);
      const eventTypeFilter = url.searchParams.get('eventType');

      const events = await env.DB.prepare(
        `SELECT id,
                event_type as eventType,
                actor_user_id as actorUserId,
                metadata,
                created_at as createdAt
           FROM organization_events
          WHERE organization_id = ?
          ${eventTypeFilter ? 'AND event_type = ?' : ''}
          ORDER BY created_at DESC
          LIMIT ?`
      ).bind(
        ...(eventTypeFilter
          ? [organization.id, eventTypeFilter, limit]
          : [organization.id, limit])
      ).all();

      // Preact usage: fetch to show an activity feed in the organization workspace.
      return createSuccessResponse({
        events: events.results?.map(event => ({
          ...event,
          metadata: typeof event.metadata === 'string'
            ? (parseJsonField(event.metadata) ?? event.metadata)
            : event.metadata
        })) ?? []
      });
    }

    return new Response('Method not allowed', { 
      status: 405, 
      headers: {} 
    });

  } catch (error) {
    return handleError(error);
  }
}

async function listOrganizations(organizationService: OrganizationService): Promise<Response> {
  const organizations = await organizationService.listOrganizations(); // This will get all organizations when called without userId
  
  return new Response(
    JSON.stringify({ 
      success: true, 
      data: organizations.map(sanitizeOrganizationResponse) 
    }), 
    { 
      headers: { 'Content-Type': 'application/json' } 
    }
  );
}

async function getOrganization(organizationService: OrganizationService, organizationId: string): Promise<Response> {
  const organization = await organizationService.getOrganization(organizationId);
  
  if (!organization) {
          return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Organization not found' 
        }), 
        { 
          status: 404, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
  }

  // Redact sensitive data from the response
  const sanitizedOrganization = sanitizeOrganizationResponse(organization);

  return new Response(
    JSON.stringify({ 
      success: true, 
      data: sanitizedOrganization 
    }), 
    { 
      headers: { 'Content-Type': 'application/json' } 
    }
  );
}

async function createOrganization(
  organizationService: OrganizationService,
  request: Request,
  env: Env,
  userId: string | null
): Promise<Response> {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Validate request body using Zod schema
  try {
    const validatedBody = organizationCreateSchema.parse(body);
    body = validatedBody;
  } catch (error) {
    if (error instanceof Error) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Validation error: ${error.message}` 
        }), 
        { 
          status: 400, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Invalid request data' 
      }), 
      { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }

  // Check if organization with slug already exists
  const existingOrganization = await organizationService.getOrganization(body.slug);
  if (existingOrganization) {
    return new Response(
      JSON.stringify({ 
        success: false, 
          error: 'Organization with this slug already exists'
      }), 
      { 
        status: 409, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }

  try {
    const organization = await organizationService.createOrganization({
      slug: body.slug,
      name: body.name,
      config: body.config,
      stripeCustomerId: body.stripeCustomerId,
      subscriptionTier: body.subscriptionTier,
      seats: body.seats,
    });

    if (userId) {
      const memberId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `member_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      try {
        await env.DB.prepare(`
          INSERT INTO members (id, organization_id, user_id, role, created_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(organization_id, user_id) DO NOTHING
        `).bind(
          memberId,
          organization.id,
          userId,
          'owner',
          Math.floor(Date.now() / 1000)
        ).run();
      } catch (memberhipError) {
        // If memberhip insertion fails, delete the orphaned organization
        try {
          await organizationService.deleteOrganization(organization.id);
        } catch (deleteError) {
          console.error('❌ Failed to clean up orphaned organization:', {
            organizationId: organization.id,
            error: deleteError instanceof Error ? deleteError.message : String(deleteError)
          });
        }
        
        // Re-throw the original memberhip error
        throw new Error(`Failed to add organization owner memberhip: ${memberhipError instanceof Error ? memberhipError.message : String(memberhipError)}`);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: organization 
      }), 
      { 
        status: 201,
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    return createErrorResponse(error, 'createOrganization', 'Failed to create organization');
  }
}

async function updateOrganization(organizationService: OrganizationService, organizationId: string, request: Request): Promise<Response> {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Validate request body using Zod schema
  try {
    const validatedBody = organizationUpdateSchema.parse(body);
    body = validatedBody;
  } catch (error) {
    if (error instanceof Error) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Validation error: ${error.message}` 
        }), 
        { 
          status: 400, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Invalid request data' 
      }), 
      { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
  
  try {
    const updatedOrganization = await organizationService.updateOrganization(organizationId, body);
    
    if (!updatedOrganization) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Organization not found' 
        }), 
        { 
          status: 404, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: updatedOrganization 
      }), 
      { 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    return createErrorResponse(error, 'updateOrganization', 'Failed to update organization');
  }
}

async function deleteOrganization(organizationService: OrganizationService, organizationId: string): Promise<Response> {
  const deleted = await organizationService.deleteOrganization(organizationId);
  
  if (!deleted) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Organization not found' 
      }), 
      { 
        status: 404, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }

  return new Response(
    JSON.stringify({ 
      success: true, 
      message: 'Organization deleted successfully' 
    }), 
    { 
      headers: { 'Content-Type': 'application/json' } 
    }
  );
}

async function listOrganizationTokens(organizationService: OrganizationService, organizationId: string): Promise<Response> {
  const tokens = await organizationService.listApiTokens(organizationId);
  
  return new Response(
    JSON.stringify({ 
      success: true, 
      data: tokens 
    }), 
    { 
      headers: { 'Content-Type': 'application/json' } 
    }
  );
}

async function createOrganizationToken(organizationService: OrganizationService, organizationId: string, request: Request): Promise<Response> {
  let body;
  try {
    body = await request.json() as {
      tokenName: string;
      permissions?: string[];
      createdBy?: string;
    };
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Validate required fields
  if (!body.tokenName || typeof body.tokenName !== 'string') {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Missing or invalid required field: tokenName' 
      }), 
      { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }

  // Validate permissions array if provided
  if (body.permissions !== undefined && (!Array.isArray(body.permissions) || !body.permissions.every(p => typeof p === 'string'))) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Invalid permissions: must be an array of strings' 
      }), 
      { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }

  // Validate createdBy if provided
  if (body.createdBy !== undefined && typeof body.createdBy !== 'string') {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Invalid createdBy: must be a string' 
      }), 
      { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }

  const permissions = body.permissions || [];
  const createdBy = body.createdBy || 'api';

  const result = await organizationService.createApiToken(organizationId, body.tokenName, permissions, createdBy);

  return new Response(
    JSON.stringify({ 
      success: true, 
      data: {
        tokenId: result.tokenId,
        token: result.token, // Only returned once - should be stored securely by client
        tokenName: body.tokenName,
        permissions: permissions,
        message: 'Store this token securely - it will not be shown again'
      }
    }), 
    { 
      status: 201,
      headers: { 'Content-Type': 'application/json' } 
    }
  );
}

async function getAuthenticatedUserId(request: Request, env: Env): Promise<string | null> {
  try {
    const authContext = await requireAuth(request, env);
    return authContext.user.id;
  } catch {
    return null;
  }
}

async function revokeOrganizationToken(
  organizationService: OrganizationService,
  organizationId: string,
  tokenId: string
): Promise<Response> {
  // First verify the token belongs to this organization
  const tokens = await organizationService.listApiTokens(organizationId);
  const tokenBelongsToOrganization = tokens.some(token => token.id === tokenId);

  if (!tokenBelongsToOrganization) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Token not found'
      }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  const result = await organizationService.revokeApiToken(tokenId);

  if (!result.success) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Token not found'
      }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  const message = result.alreadyRevoked
    ? 'Token was already revoked'
    : 'Token revoked successfully';

  return new Response(
    JSON.stringify({
      success: true,
      data: { success: true, message }
    }),
    {
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

async function validateOrganizationToken(
  organizationService: OrganizationService,
  organizationId: string,
  request: Request
): Promise<Response> {
  let body;
  try {
    body = await request.json() as {
      token: string;
    };
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (!body.token || typeof body.token !== 'string') {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Missing or invalid required field: token' 
      }), 
      { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }

  const isValid = await organizationService.validateOrganizationAccess(organizationId, body.token);

  return new Response(
    JSON.stringify({ 
      success: true, 
      data: { valid: isValid } 
    }), 
    { 
      headers: { 'Content-Type': 'application/json' } 
    }
  );
}

async function validateApiKey(
  organizationService: OrganizationService,
  organizationId: string,
  request: Request
): Promise<Response> {
  let body;
  try {
    body = await request.json() as {
      apiKey: string;
    };
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (!body.apiKey || typeof body.apiKey !== 'string') {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Missing or invalid required field: apiKey' 
      }), 
      { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }

  const isValid = await organizationService.validateApiKey(organizationId, body.apiKey);

  return new Response(
    JSON.stringify({ 
      success: true, 
      data: { valid: isValid } 
    }), 
    { 
      headers: { 'Content-Type': 'application/json' } 
    }
  );
}

async function generateApiKeyHash(
  organizationService: OrganizationService,
  organizationId: string
): Promise<Response> {
  const success = await organizationService.generateApiKeyHash(organizationId);

  if (!success) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Failed to generate API key hash' 
      }), 
      { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }

  return new Response(
    JSON.stringify({ 
      success: true, 
      data: { success: true } 
    }), 
    { 
      headers: { 'Content-Type': 'application/json' } 
    }
  );
}
