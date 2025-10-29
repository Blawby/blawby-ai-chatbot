import type { Env } from '../types';
import { HttpErrors, handleError, createSuccessResponse } from '../errorHandler';
import { parseJsonBody } from '../utils';
import { PaymentService } from '../services/PaymentService';
import { PaymentRequest } from '../schemas';
import { MockPaymentService } from '../services/MockPaymentService';
import { requireAuth, requireOrgOwner } from '../middleware/auth.js';
import { OrganizationService, buildDefaultOrganizationConfig } from '../services/OrganizationService.js';
import type { Organization, OrganizationConfig } from '../services/OrganizationService.js';

interface BusinessUpgradeRequest {
  organizationName: string;
  slug?: string;
  plan: 'business' | 'business-plus' | string;
  billing: {
    name: string;
    email: string;
    phone: string;
    location?: string;
  };
  sessionId?: string;
  existingOrganizationId?: string;
  upgradeNotes?: string;
}

export async function handlePayment(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const subscriptionsEnabled =
    env.ENABLE_STRIPE_SUBSCRIPTIONS === 'true' ||
    env.ENABLE_STRIPE_SUBSCRIPTIONS === true;

  if (subscriptionsEnabled) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Legacy payment endpoints are disabled. Use Stripe subscription APIs.',
        errorCode: 'LEGACY_PAYMENTS_DISABLED'
      }),
      {
        status: 410,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  // POST /api/payment/upgrade - upgrade to business plan (creates invoice + org)
  if (path === '/api/payment/upgrade' && request.method === 'POST') {
    try {
      const { user } = await requireAuth(request, env);
      const {
        organizationName,
        slug,
        plan,
        billing,
        sessionId,
        existingOrganizationId,
        upgradeNotes
      } = await parseJsonBody(request) as BusinessUpgradeRequest;

      if (!organizationName?.trim()) {
        throw HttpErrors.badRequest('organizationName is required');
      }
      if (!billing?.name || !billing.email || !billing.phone) {
        throw HttpErrors.badRequest('billing.name, billing.email, and billing.phone are required');
      }

      const organizationService = new OrganizationService(env);

      let targetOrganization: Organization | null = null;
      const creatingNewOrg = !existingOrganizationId;

      if (existingOrganizationId) {
        const existing = await organizationService.getOrganization(existingOrganizationId);
        if (!existing) {
          throw HttpErrors.notFound('Existing organization not found');
        }
        await requireOrgOwner(request, env, existing.id);
        const updatedConfig: OrganizationConfig = {
          ...existing.config,
          metadata: {
            ...(existing.config.metadata ?? {}),
            subscriptionPlan: plan,
            lastUpgradeAt: new Date().toISOString(),
            upgradeNotes: upgradeNotes ?? existing.config.metadata?.upgradeNotes
          }
        };
        const updated = await organizationService.updateOrganization(existing.id, {
          name: organizationName.trim(),
          config: updatedConfig
        });
        targetOrganization = updated ?? await organizationService.getOrganization(existing.id);
      } else {
        const baseConfig: OrganizationConfig = {
          ...buildDefaultOrganizationConfig(env),
          ownerEmail: billing.email,
          requiresPayment: false,
          metadata: {
            planStatus: 'pending_payment',
            subscriptionPlan: plan,
            upgradedBy: user.email,
            upgradedAt: new Date().toISOString(),
            upgradeNotes: upgradeNotes ?? null
          }
        };

        targetOrganization = await organizationService.createOrganization({
          name: organizationName.trim(),
          slug: slug?.trim(),
          config: baseConfig,
          isPersonal: false,
        });

        // Ensure the upgrading user is the owner.
        await env.DB.prepare(
          `INSERT INTO members (id, organization_id, user_id, role, created_at)
           VALUES (?, ?, ?, 'owner', ?)
           ON CONFLICT(organization_id, user_id) DO NOTHING`
        ).bind(
          crypto.randomUUID(),
          targetOrganization.id,
          user.id,
          Math.floor(Date.now() / 1000)
        ).run();
      }

      if (!targetOrganization) {
        throw HttpErrors.internalServerError('Failed to create or update organization');
      }

      const paymentPayload: PaymentRequest = {
        customerInfo: {
          name: billing.name,
          email: billing.email,
          phone: billing.phone,
          location: billing.location ?? ''
        },
        matterInfo: {
          type: 'Business Plan Upgrade',
          description: `Plan: ${plan} for ${organizationName}`,
          urgency: 'normal'
        },
        organizationId: targetOrganization.id,
        sessionId: sessionId ?? '',
        currency: 'USD'
      };

      const isDevelopment = env.BLAWBY_API_URL?.includes('localhost');
      const paymentService = isDevelopment ? new MockPaymentService(env) : new PaymentService(env);
      const invoice = await paymentService.createInvoice(paymentPayload);

      if (!invoice.success) {
        throw HttpErrors.internalServerError(invoice.error ?? 'Failed to create upgrade invoice');
      }

      // Update metadata to reflect pending payment status
      const pendingMeta = await organizationService.updateOrganization(targetOrganization.id, {
        config: {
          ...targetOrganization.config,
          metadata: {
            ...(targetOrganization.config.metadata ?? {}),
            planStatus: 'awaiting_payment',
            lastInvoiceId: invoice.paymentId,
            lastInvoiceUrl: invoice.invoiceUrl
          }
        }
      });

      const responseOrganization = pendingMeta ?? await organizationService.getOrganization(targetOrganization.id);

      await recordOrganizationEvent(env, targetOrganization.id, {
        type: 'plan.upgrade_requested',
        actorId: user.id,
        metadata: {
          plan,
          paymentId: invoice.paymentId,
          invoiceUrl: invoice.invoiceUrl,
          existingOrganizationId,
          creatingNewOrg
        }
      });

      // Frontend note: direct users to invoiceUrl, then poll payment status.
      return createSuccessResponse({
        organization: {
          id: responseOrganization?.id ?? targetOrganization.id,
          slug: responseOrganization?.slug ?? targetOrganization.slug,
          name: responseOrganization?.name ?? targetOrganization.name
        },
        invoiceUrl: invoice.invoiceUrl,
        paymentId: invoice.paymentId,
        plan
      });
    } catch (error) {
      return handleError(error);
    }
  }

  if (path === '/api/payment/status' && request.method === 'GET') {
    try {
      const paymentId = url.searchParams.get('paymentId');
      if (!paymentId) {
        throw HttpErrors.badRequest('paymentId query parameter is required');
      }

      const authContext = await requireAuth(request, env);

      const paymentRow = await env.DB.prepare(
        `SELECT payment_id as paymentId,
                organization_id as organizationId,
                status,
                invoice_url as invoiceUrl,
                created_at as createdAt,
                updated_at as updatedAt
           FROM payment_history
          WHERE payment_id = ?`
      ).bind(paymentId).first<{
        paymentId: string;
        organizationId: string;
        status: string;
        invoiceUrl?: string;
        createdAt: string;
        updatedAt: string;
      }>();

      if (!paymentRow) {
        throw HttpErrors.notFound('Payment not found');
      }

      await requireOrgOwner(request, env, paymentRow.organizationId);

      const organizationService = new OrganizationService(env);
      const organization = await organizationService.getOrganization(paymentRow.organizationId);

      return createSuccessResponse({
        paymentId: paymentRow.paymentId,
        status: paymentRow.status,
        organizationId: paymentRow.organizationId,
        invoiceUrl: paymentRow.invoiceUrl,
        planStatus: organization?.config?.metadata?.planStatus ?? null,
        lastPaymentStatus: organization?.config?.metadata?.lastPaymentStatus ?? null,
        lastPaymentAt: organization?.config?.metadata?.lastPaymentAt ?? null,
        checkedBy: authContext.user.id
      });
    } catch (error) {
      return handleError(error);
    }
  }

  if (path === '/api/payment/status-update' && request.method === 'POST') {
    try {
      const { user } = await requireAuth(request, env);
      const body = await parseJsonBody(request) as {
        paymentId: string;
        status: string;
        organizationId?: string;
        metadata?: Record<string, unknown>;
      };

      if (!body.paymentId || !body.status) {
        throw HttpErrors.badRequest('paymentId and status are required');
      }

      let organizationId = body.organizationId ?? null;

      const paymentRecord = await env.DB.prepare(
        `SELECT organization_id as organizationId
           FROM payment_history
          WHERE payment_id = ?`
      ).bind(body.paymentId).first<{ organizationId: string }>();

      if (paymentRecord) {
        organizationId = paymentRecord.organizationId;
      }

      if (!organizationId) {
        throw HttpErrors.badRequest('organizationId is required for status updates');
      }

      const organizationService = new OrganizationService(env);
      const organization = await organizationService.getOrganization(organizationId);

      if (!organization) {
        throw HttpErrors.notFound('Organization not found for provided paymentId');
      }

      await requireOrgOwner(request, env, organization.id);

      // Update payment history after verifying organization ownership
      if (paymentRecord) {
        await env.DB.prepare(
          `UPDATE payment_history
              SET status = ?,
                  event_type = ?,
                  updated_at = datetime('now')
            WHERE payment_id = ?`
        ).bind(body.status, `payment.${body.status}`, body.paymentId).run();
      }

      const updatedConfig: OrganizationConfig = {
        ...organization.config,
        metadata: {
          ...(organization.config.metadata ?? {}),
          planStatus: resolvePlanStatus(body.status, (organization.config.metadata?.planStatus as string) ?? 'awaiting_payment'),
          lastPaymentStatus: body.status,
          lastPaymentId: body.paymentId,
          lastPaymentAt: new Date().toISOString()
        }
      };

      await organizationService.updateOrganization(organization.id, {
        config: updatedConfig
      });

      await recordOrganizationEvent(env, organization.id, {
        type: `plan.payment_${body.status}`,
        actorId: user.id,
        metadata: {
          paymentId: body.paymentId,
          status: body.status,
          ...body.metadata
        }
      });

      // Preact usage: call after payment provider confirms completion to refresh plan state.
      return createSuccessResponse({
        paymentId: body.paymentId,
        status: body.status,
        organizationId
      });
    } catch (error) {
      return handleError(error);
    }
  }

  // POST /api/payment/create-invoice - Create payment invoice
  if (path === '/api/payment/create-invoice' && request.method === 'POST') {
    try {
      const body = await parseJsonBody(request) as PaymentRequest;

      // Validate required fields
      if (!body.customerInfo?.name || !body.customerInfo?.email || !body.customerInfo?.phone) {
        throw HttpErrors.badRequest('Missing required customer information');
      }

      if (!body.matterInfo?.type || !body.matterInfo?.description) {
        throw HttpErrors.badRequest('Missing required matter information');
      }

      if (!body.organizationId) {
        throw HttpErrors.badRequest('Missing organization ID');
      }

      // Use real service for staging.blawby.com, mock for localhost
      const isDevelopment = env.BLAWBY_API_URL?.includes('localhost');
      const paymentService = isDevelopment ? new MockPaymentService(env) : new PaymentService(env);
      const result = await paymentService.createInvoice(body);

      if (!result.success) {
        return new Response(JSON.stringify({
          success: false,
          error: result.error
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return createSuccessResponse({
        success: true,
        invoiceUrl: result.invoiceUrl,
        paymentId: result.paymentId
      });

    } catch (error) {
      return handleError(error);
    }
  }

  // GET /api/payment/status/:paymentId - Get payment status
  if (path.startsWith('/api/payment/status/') && request.method === 'GET') {
    try {
      const paymentId = path.split('/').pop();
      
      if (!paymentId) {
        throw HttpErrors.badRequest('Payment ID is required');
      }

      // Use real service for staging.blawby.com, mock for localhost
      const isDevelopment = env.BLAWBY_API_URL?.includes('localhost');
      const paymentService = isDevelopment ? new MockPaymentService(env) : new PaymentService(env);
      const result = await paymentService.getPaymentStatus(paymentId);

      if (!result.success) {
        return new Response(JSON.stringify({
          success: false,
          error: result.error
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return createSuccessResponse({
        success: true,
        invoiceUrl: result.invoiceUrl,
        paymentId: result.paymentId
      });

    } catch (error) {
      return handleError(error);
    }
  }

  // GET /api/payment/history - Get payment history for a user or organization
  if (path === '/api/payment/history' && request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const organizationId = url.searchParams.get('organizationId');
      const customerEmail = url.searchParams.get('customerEmail');
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      if (!organizationId && !customerEmail) {
        throw HttpErrors.badRequest('Either organizationId or customerEmail is required');
      }

      let query = 'SELECT * FROM payment_history';
      let params: unknown[] = [];
      const conditions = [];

      if (organizationId) {
        conditions.push('organization_id = ?');
        params.push(organizationId);
      }

      if (customerEmail) {
        conditions.push('customer_email = ?');
        params.push(customerEmail);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const stmt = env.DB.prepare(query);
      const results = await stmt.bind(...params).all();

      return createSuccessResponse({
        success: true,
        payments: results.results,
        count: results.results.length,
        pagination: {
          limit,
          offset,
          hasMore: results.results.length === limit
        }
      });

    } catch (error) {
      return handleError(error);
    }
  }

  // GET /api/payment/stats - Get payment statistics
  if (path === '/api/payment/stats' && request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const organizationId = url.searchParams.get('organizationId');
      const period = url.searchParams.get('period') || '30'; // days

      let query = `
        SELECT 
          COUNT(*) as total_payments,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_payments,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_payments,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_payments,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_payments,
          SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_revenue
        FROM payment_history
        WHERE created_at >= datetime('now', '-${period} days')
      `;

      let params: unknown[] = [];

      if (organizationId) {
        query += ' AND organization_id = ?';
        params.push(organizationId);
      }

      const stats = await env.DB.prepare(query).bind(...params).first();

      return createSuccessResponse({
        success: true,
        stats: stats,
        period: `${period} days`
      });

    } catch (error) {
      return handleError(error);
    }
  }

  // GET /api/payment/:paymentId - Get specific payment details
  if (path.startsWith('/api/payment/') && path.split('/').length === 4 && request.method === 'GET') {
    try {
      const paymentId = path.split('/')[3];
      
      if (!paymentId) {
        throw HttpErrors.badRequest('Payment ID is required');
      }

      const payment = await env.DB.prepare(`
        SELECT * FROM payment_history WHERE payment_id = ?
      `).bind(paymentId).first();

      if (!payment) {
        throw HttpErrors.notFound('Payment not found');
      }

      return createSuccessResponse({
        success: true,
        payment: payment
      });

    } catch (error) {
      return handleError(error);
    }
  }

  // PUT /api/payment/:paymentId - Update payment status
  if (path.startsWith('/api/payment/') && path.split('/').length === 4 && request.method === 'PUT') {
    try {
      const paymentId = path.split('/')[3];
      const body = await parseJsonBody(request) as { status?: string; notes?: string };
      
      if (!paymentId) {
        throw HttpErrors.badRequest('Payment ID is required');
      }

      const { status, notes } = body;

      if (!status) {
        throw HttpErrors.badRequest('Status is required');
      }

      await env.DB.prepare(`
        UPDATE payment_history 
        SET status = ?, notes = ?, updated_at = datetime('now')
        WHERE payment_id = ?
      `).bind(status, notes || null, paymentId).run();

      return createSuccessResponse({
        success: true,
        message: 'Payment status updated successfully'
      });

    } catch (error) {
      return handleError(error);
    }
  }

  // DELETE /api/payment/:paymentId - Cancel/refund payment
  if (path.startsWith('/api/payment/') && path.split('/').length === 4 && request.method === 'DELETE') {
    try {
      const paymentId = path.split('/')[3];
      
      if (!paymentId) {
        throw HttpErrors.badRequest('Payment ID is required');
      }

      await env.DB.prepare(`
        UPDATE payment_history 
        SET status = 'cancelled', updated_at = datetime('now')
        WHERE payment_id = ?
      `).bind(paymentId).run();

      return createSuccessResponse({
        success: true,
        message: 'Payment cancelled successfully'
      });

    } catch (error) {
      return handleError(error);
    }
  }

  // POST /api/payment/webhook - Handle payment webhooks from payment processor
  if (path === '/api/payment/webhook' && request.method === 'POST') {
    try {
      const body = await parseJsonBody(request);
      
      console.log('💰 Payment webhook received:', body);

      // Validate webhook signature if needed
      // const signature = request.headers.get('x-blawby-signature');
      // if (!signature || !validateWebhookSignature(body, signature, env.WEBHOOK_SECRET)) {
      //   throw HttpErrors.unauthorized('Invalid webhook signature');
      // }

      // Handle different webhook events
      const bodyTyped = body as {
        eventType?: string;
        paymentId?: string;
        status?: string;
        amount?: number;
        customerEmail?: string;
        organizationId?: string;
        [key: string]: unknown;
      };
      const eventType = bodyTyped.eventType;
      const paymentId = bodyTyped.paymentId;
      const status = bodyTyped.status;
      const amount = bodyTyped.amount || 0;
      const customerEmail = bodyTyped.customerEmail || '';

      // Store payment history
      await env.DB.prepare(`
        INSERT INTO payment_history (
          payment_id, organization_id, customer_email, amount, status, 
          event_type, metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(payment_id) DO UPDATE SET
          status = ?, updated_at = datetime('now')
      `).bind(
        paymentId,
        bodyTyped.organizationId || 'unknown',
        customerEmail,
        amount,
        status,
        eventType,
        JSON.stringify(body),
        status
      ).run();

      switch (eventType) {
        case 'payment.completed':
          // Update matter status to paid
          await env.DB.prepare(`
            UPDATE matters 
            SET status = 'active', 
                custom_fields = json_set(custom_fields, '$.paymentStatus', ?, '$.paymentId', ?)
            WHERE custom_fields->>'$.paymentId' = ?
          `).bind(status, paymentId, paymentId).run();
          
          console.log('✅ Payment completed for payment ID:', paymentId);
          break;

        case 'payment.failed':
          // Update matter status to payment failed
          await env.DB.prepare(`
            UPDATE matters 
            SET status = 'lead',
                custom_fields = json_set(custom_fields, '$.paymentStatus', ?, '$.paymentId', ?)
            WHERE custom_fields->>'$.paymentId' = ?
          `).bind(status, paymentId, paymentId).run();
          
          console.log('❌ Payment failed for payment ID:', paymentId);
          break;

        case 'payment.refunded':
          // Update matter status to refunded
          await env.DB.prepare(`
            UPDATE matters 
            SET status = 'lead',
                custom_fields = json_set(custom_fields, '$.paymentStatus', ?, '$.paymentId', ?)
            WHERE custom_fields->>'$.paymentId' = ?
          `).bind(status, paymentId, paymentId).run();
          
          console.log('🔄 Payment refunded for payment ID:', paymentId);
          break;

        default:
          console.log('📝 Unhandled payment webhook event type:', eventType);
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('❌ Payment webhook error:', error);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Payment webhook processing failed' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  if (path.startsWith('/api/payment/')) {
    throw HttpErrors.notFound('Payment endpoint not found');
  }
  
  throw HttpErrors.notFound('Payment endpoint not found');
}

function resolvePlanStatus(status: string, fallback: string): string {
  switch (status) {
    case 'completed':
      return 'active';
    case 'failed':
      return 'payment_failed';
    case 'refunded':
      return 'refunded';
    case 'cancelled':
      return 'cancelled';
    default:
      return fallback;
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
    console.error('Failed to record organization event (payment):', error);
  }
}
