import { http, HttpResponse } from 'msw';
import { mockDb, ensureOrgCollections, randomId } from './mockData';
import type { MockPractice, MockInvitation } from './mockData';

const ALLOWED_ROLES = new Set(['owner', 'admin', 'attorney', 'paralegal'] as const);
type Role = 'owner' | 'admin' | 'attorney' | 'paralegal';

function isValidRole(role: unknown): role is Role {
  return typeof role === 'string' && ALLOWED_ROLES.has(role as Role);
}

function findPractice(practiceId: string) {
  return mockDb.practices.find((practice) => practice.id === practiceId || practice.slug === practiceId);
}

function notFound(message: string) {
  return HttpResponse.json({ success: false, error: message }, { status: 404 });
}

export const handlers = [
  http.get('/api/practice/list', () => {
    return HttpResponse.json({ practices: mockDb.practices });
  }),

  http.post('/api/practice', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = randomId('org');
    const slug =
      typeof body.slug === 'string' && body.slug.trim().length > 0
        ? body.slug
        : `${body.name || 'practice'}-${randomId('slug')}`;

    const practice: MockPractice = {
      id,
      slug,
      name: String(body.name ?? 'New Practice'),
      description: typeof body.description === 'string' ? body.description : '',
      kind: 'business',
      subscriptionStatus: 'trialing',
      subscriptionTier: 'business',
      seats: 1,
      config: {
        ownerEmail: body.business_email ?? 'owner@example.com',
        metadata: {
          subscriptionPlan: 'business',
          planStatus: 'trialing'
        }
      },
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata as Record<string, unknown> : undefined
    };

    mockDb.practices.push(practice);
    ensureOrgCollections(id);

    mockDb.members[id].push({
      userId: randomId('user'),
      role: 'owner',
      email: typeof body.business_email === 'string' ? body.business_email : 'owner@example.com',
      name: typeof body.name === 'string' ? body.name : 'Owner',
      image: null,
      createdAt: Date.now()
    });

    return HttpResponse.json({ practice });
  }),

  http.get('/api/practice/:practiceId', ({ params }) => {
    const practice = findPractice(String(params.practiceId));
    if (!practice) {
      return notFound('Practice not found');
    }
    return HttpResponse.json({ practice });
  }),

  http.put('/api/practice/:practiceId', async ({ params, request }) => {
    const practice = findPractice(String(params.practiceId));
    if (!practice) {
      return notFound('Practice not found');
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    if (typeof body.name === 'string' && body.name.trim()) {
      practice.name = body.name;
    }
    if (typeof body.slug === 'string' && body.slug.trim()) {
      practice.slug = body.slug;
    }
    if (typeof body.description === 'string') {
      practice.description = body.description;
    }
    if (body.metadata && typeof body.metadata === 'object') {
      practice.metadata = body.metadata as Record<string, unknown>;
    }

    return HttpResponse.json({ practice });
  }),

  http.delete('/api/practice/:practiceId', ({ params }) => {
    const id = String(params.practiceId);
    const index = mockDb.practices.findIndex((practice) => practice.id === id);
    if (index === -1) {
      return notFound('Practice not found');
    }
    mockDb.practices.splice(index, 1);
    delete mockDb.members[id];
    delete mockDb.tokens[id];
    delete mockDb.onboarding[id];
    mockDb.invitations = mockDb.invitations.filter((inv) => inv.organizationId !== id);
    return HttpResponse.json({ success: true });
  }),

  http.put('/api/practice/:practiceId/active', ({ params }) => {
    const practice = findPractice(String(params.practiceId));
    if (!practice) {
      return notFound('Practice not found');
    }
    return HttpResponse.json({ success: true });
  }),

  http.get('/api/practice/:practiceId/members', ({ params }) => {
    const id = String(params.practiceId);
    ensureOrgCollections(id);
    return HttpResponse.json({ members: mockDb.members[id] });
  }),

  http.patch('/api/practice/:practiceId/members', async ({ params, request }) => {
    const id = String(params.practiceId);
    ensureOrgCollections(id);
    const body = (await request.json().catch(() => ({}))) as { userId?: string; role?: unknown };
    if (!body.userId || !body.role) {
      return HttpResponse.json({ error: 'userId and role are required' }, { status: 400 });
    }
    if (!isValidRole(body.role)) {
      return HttpResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    const target = mockDb.members[id].find((member) => member.userId === body.userId);
    if (!target) {
      return HttpResponse.json({ error: 'Member not found' }, { status: 404 });
    }
    target.role = body.role;
    return HttpResponse.json({ success: true });
  }),

  http.delete('/api/practice/:practiceId/members/:userId', ({ params }) => {
    const orgId = String(params.practiceId);
    const userId = String(params.userId);
    ensureOrgCollections(orgId);
    mockDb.members[orgId] = mockDb.members[orgId].filter((member) => member.userId !== userId);
    return HttpResponse.json({ success: true });
  }),

  http.get('/api/practice/invitations', () => {
    return HttpResponse.json({ invitations: mockDb.invitations });
  }),

  http.post('/api/practice/:practiceId/invitations', async ({ params, request }) => {
    const orgId = String(params.practiceId);
    const body = (await request.json().catch(() => ({}))) as { email?: string; role?: unknown };
    if (!body.email || !body.role) {
      return HttpResponse.json({ error: 'email and role are required' }, { status: 400 });
    }
    if (!isValidRole(body.role)) {
      return HttpResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    ensureOrgCollections(orgId);
    const invitation: MockInvitation = {
      id: randomId('invite'),
      organizationId: orgId,
      organizationName: findPractice(orgId)?.name,
      email: body.email,
      role: body.role,
      status: 'pending' as const,
      invitedBy: 'user-1',
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
      createdAt: Date.now()
    };
    mockDb.invitations.push(invitation);
    return HttpResponse.json({ success: true });
  }),

  http.post('/api/practice/invitations/:invitationId/:action', ({ params }) => {
    const invitation = mockDb.invitations.find((inv) => inv.id === params.invitationId);
    if (!invitation) {
      return notFound('Invitation not found');
    }
    const action = String(params.action);
    if (action === 'accept') {
      invitation.status = 'accepted';
      ensureOrgCollections(invitation.organizationId);
      mockDb.members[invitation.organizationId].push({
        userId: randomId('user'),
        role: invitation.role,
        email: invitation.email,
        name: invitation.email.split('@')[0],
        image: null,
        createdAt: Date.now()
      });
    } else if (action === 'decline') {
      invitation.status = 'declined';
    } else {
      return HttpResponse.json({ error: 'Invalid invitation action' }, { status: 400 });
    }
    return HttpResponse.json({ success: true });
  }),

  http.get('/api/practice/:practiceId/tokens', ({ params }) => {
    const id = String(params.practiceId);
    ensureOrgCollections(id);
    return HttpResponse.json({ tokens: mockDb.tokens[id] ?? [] });
  }),

  http.post('/api/practice/:practiceId/tokens', async ({ params, request }) => {
    const id = String(params.practiceId);
    ensureOrgCollections(id);
    const body = (await request.json().catch(() => ({}))) as { tokenName?: string };
    if (!body.tokenName) {
      return HttpResponse.json({ error: 'tokenName is required' }, { status: 400 });
    }
    const tokenId = randomId('token');
    const tokenValue = `tok_${tokenId}`;
    mockDb.tokens[id].push({
      id: tokenId,
      tokenName: body.tokenName,
      permissions: ['chat:read', 'chat:write'],
      createdAt: Date.now()
    });
    return HttpResponse.json({ token: tokenValue, tokenId });
  }),

  http.delete('/api/practice/:practiceId/tokens/:tokenId', ({ params }) => {
    const orgId = String(params.practiceId);
    const tokenId = String(params.tokenId);
    ensureOrgCollections(orgId);
    mockDb.tokens[orgId] = mockDb.tokens[orgId].filter((token) => token.id !== tokenId);
    return HttpResponse.json({ success: true });
  }),

  http.get('/api/user/preferences', () => {
    return HttpResponse.json({ success: true, data: mockDb.userPreferences });
  }),

  http.put('/api/user/preferences', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as Partial<typeof mockDb.userPreferences>;
    mockDb.userPreferences = { ...mockDb.userPreferences, ...body };
    return HttpResponse.json({ success: true, data: mockDb.userPreferences });
  }),

  http.get('/api/onboarding/organization/:organizationId/status', ({ params }) => {
    const orgId = String(params.organizationId);
    ensureOrgCollections(orgId);
    const state = mockDb.onboarding[orgId];
    return HttpResponse.json({
      status: state.status,
      completed: state.completed,
      skipped: state.skipped,
      completedAt: state.completedAt,
      lastSavedAt: state.lastSavedAt,
      hasDraft: state.hasDraft,
      data: state.data,
      practice_uuid: orgId,
      stripe_account_id: state.stripeAccountId,
      charges_enabled: state.chargesEnabled,
      payouts_enabled: state.payoutsEnabled,
      details_submitted: state.detailsSubmitted
    });
  }),

  http.post('/api/onboarding/save', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      organizationId?: string;
      data?: Record<string, unknown>;
    };
    if (!body.organizationId) {
      return HttpResponse.json({ error: 'organizationId required' }, { status: 400 });
    }
    ensureOrgCollections(body.organizationId);
    mockDb.onboarding[body.organizationId].data = body.data ?? null;
    mockDb.onboarding[body.organizationId].hasDraft = Boolean(body.data);
    mockDb.onboarding[body.organizationId].lastSavedAt = Date.now();
    return HttpResponse.json({ success: true });
  }),

  http.post('/api/onboarding/connected-accounts', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      practice_uuid?: string;
      practice_email?: string;
    };
    const practiceUuid = body.practice_uuid ?? randomId('org');
    ensureOrgCollections(practiceUuid);
    const state = mockDb.onboarding[practiceUuid];
    state.stripeAccountId = randomId('acct');
    return HttpResponse.json({
      practice_uuid: practiceUuid,
      stripe_account_id: state.stripeAccountId,
      client_secret: `acct_${state.stripeAccountId}_secret`,
      charges_enabled: state.chargesEnabled,
      payouts_enabled: state.payoutsEnabled,
      details_submitted: state.detailsSubmitted
    });
  }),

  http.post('/api/onboarding/complete', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { organizationId?: string };
    if (!body.organizationId) {
      return HttpResponse.json({ error: 'organizationId required' }, { status: 400 });
    }
    ensureOrgCollections(body.organizationId);
    const state = mockDb.onboarding[body.organizationId];
    state.completed = true;
    state.completedAt = Date.now();
    state.status = 'completed';
    return HttpResponse.json({ success: true });
  }),

  http.post('/api/onboarding/skip', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { organizationId?: string };
    if (!body.organizationId) {
      return HttpResponse.json({ error: 'organizationId required' }, { status: 400 });
    }
    ensureOrgCollections(body.organizationId);
    const state = mockDb.onboarding[body.organizationId];
    state.skipped = true;
    state.status = 'skipped';
    return HttpResponse.json({ success: true });
  }),

  http.post('/api/subscription/sync', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { organizationId?: string };
    if (!body.organizationId) {
      return HttpResponse.json({ error: 'organizationId required' }, { status: 400 });
    }
    return HttpResponse.json({
      synced: true,
      subscription: {
        status: 'active',
        organizationId: body.organizationId,
        updatedAt: Date.now()
      }
    });
  }),

  http.post('*/api/auth/subscription/upgrade', async () => {
    return HttpResponse.json({
      url: 'https://checkout.mock.local/stripe-session'
    });
  }),

  http.post('*/api/auth/subscription/billing-portal', async () => {
    return HttpResponse.json({
      url: 'https://billing.mock.local/portal'
    });
  }),

  http.post('*/api/subscription/cancel', async () => {
    return HttpResponse.json({
      success: true
    });
  })
];
