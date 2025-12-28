import { http, HttpResponse, type StrictRequest, type DefaultBodyType } from 'msw';
import { mockDb, ensurePracticeCollections, randomId, getAnonymousUserByToken, getOrCreateAnonymousUser, findConversationByPracticeAndUser } from './mockData';
import type { MockPractice, MockInvitation, MockConversation, MockMessage } from './mockData';

const ALLOWED_ROLES = new Set(['owner', 'admin', 'attorney', 'paralegal'] as const);
type Role = 'owner' | 'admin' | 'attorney' | 'paralegal';

function isValidRole(role: unknown): role is Role {
  return typeof role === 'string' && ALLOWED_ROLES.has(role as Role);
}

function findPractice(practiceId: string) {
  const byId = mockDb.practices.find((practice) => practice.id === practiceId);
  if (byId) {
    return byId;
  }
  return mockDb.practices.find((practice) => practice.slug === practiceId);
}

function notFound(message: string) {
  return HttpResponse.json({ success: false, error: message }, { status: 404 });
}

function getOrCreateConversation(request: StrictRequest<DefaultBodyType>): { conversation: MockConversation } | { error: HttpResponse<unknown> } {
  const url = new URL(request.url);
  const practiceId = url.searchParams.get('practiceId');

  if (!practiceId) {
    return { error: HttpResponse.json({ error: 'practiceId is required' }, { status: 400 }) };
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: HttpResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const token = authHeader.replace('Bearer ', '').trim();
  const user = getOrCreateAnonymousUser(token);
  const isAnonymous = !user.email || user.email === '';

  let conversation = findConversationByPracticeAndUser(practiceId, user.id, isAnonymous);

  if (!conversation) {
    const convId = randomId('conv');
    const now = new Date().toISOString();
    conversation = {
      id: convId,
      practice_id: practiceId,
      user_id: isAnonymous ? null : user.id,
      matter_id: null,
      participants: [user.id],
      user_info: null,
      status: 'active',
      assigned_to: null,
      priority: 'normal',
      tags: undefined,
      internal_notes: null,
      last_message_at: null,
      first_response_at: null,
      closed_at: null,
      created_at: now,
      updated_at: now
    };
    mockDb.conversations.set(convId, conversation);
    mockDb.messages.set(convId, []);
  } else if (!mockDb.messages.has(conversation.id)) {
    mockDb.messages.set(conversation.id, []);
  }

  return { conversation };
}

export const handlers = [
  http.get('/api/practice/list', () => {
    return HttpResponse.json({ practices: mockDb.practices });
  }),

  http.post('/api/practice', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = randomId('practice');
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
    ensurePracticeCollections(id);

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
    console.log('[MSW] Intercepted GET /api/practice/:practiceId', params.practiceId);
    const practice = findPractice(String(params.practiceId));
    if (!practice) {
      console.log('[MSW] Practice not found:', params.practiceId, 'Available:', mockDb.practices.map(p => ({ id: p.id, slug: p.slug })));
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
    delete mockDb.onboarding[id];
    mockDb.invitations = mockDb.invitations.filter((inv) => inv.practiceId !== id);
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
    ensurePracticeCollections(id);
    return HttpResponse.json({ members: mockDb.members[id] });
  }),

  http.patch('/api/practice/:practiceId/members', async ({ params, request }) => {
    const id = String(params.practiceId);
    ensurePracticeCollections(id);
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
    const practiceId = String(params.practiceId);
    const userId = String(params.userId);
    ensurePracticeCollections(practiceId);
    mockDb.members[practiceId] = mockDb.members[practiceId].filter((member) => member.userId !== userId);
    return HttpResponse.json({ success: true });
  }),

  http.get('/api/practice/invitations', () => {
    return HttpResponse.json({ invitations: mockDb.invitations });
  }),

  http.post('/api/practice/:practiceId/invitations', async ({ params, request }) => {
    const practiceId = String(params.practiceId);
    const body = (await request.json().catch(() => ({}))) as { email?: string; role?: unknown };
    if (!body.email || !body.role) {
      return HttpResponse.json({ error: 'email and role are required' }, { status: 400 });
    }
    if (!isValidRole(body.role)) {
      return HttpResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    ensurePracticeCollections(practiceId);
    const invitation: MockInvitation = {
      id: randomId('invite'),
      practiceId,
      practiceName: findPractice(practiceId)?.name,
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
      ensurePracticeCollections(invitation.practiceId);
      mockDb.members[invitation.practiceId].push({
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

  http.get('/api/user/preferences', () => {
    return HttpResponse.json({ success: true, data: mockDb.userPreferences });
  }),

  http.put('/api/user/preferences', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as Partial<typeof mockDb.userPreferences>;
    mockDb.userPreferences = { ...mockDb.userPreferences, ...body };
    return HttpResponse.json({ success: true, data: mockDb.userPreferences });
  }),

  http.get('/api/onboarding/practice/:practiceId/status', ({ params }) => {
    const practiceId = String(params.practiceId);
    ensurePracticeCollections(practiceId);
    const state = mockDb.onboarding[practiceId];
    return HttpResponse.json({
      status: state.status,
      completed: state.completed,
      skipped: state.skipped,
      completedAt: state.completedAt,
      lastSavedAt: state.lastSavedAt,
      hasDraft: state.hasDraft,
      data: state.data,
      practice_uuid: practiceId,
      stripe_account_id: state.stripeAccountId,
      charges_enabled: state.chargesEnabled,
      payouts_enabled: state.payoutsEnabled,
      details_submitted: state.detailsSubmitted
    });
  }),

  http.post('/api/onboarding/save', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      practiceId?: string;
      data?: Record<string, unknown>;
    };
    if (!body.practiceId) {
      return HttpResponse.json({ error: 'practiceId required' }, { status: 400 });
    }
    ensurePracticeCollections(body.practiceId);
    mockDb.onboarding[body.practiceId].data = body.data ?? null;
    mockDb.onboarding[body.practiceId].hasDraft = Boolean(body.data);
    mockDb.onboarding[body.practiceId].lastSavedAt = Date.now();
    return HttpResponse.json({ success: true });
  }),

  http.post('/api/onboarding/connected-accounts', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      practice_uuid?: string;
      practice_email?: string;
    };
    const practiceUuid = body.practice_uuid ?? randomId('practice');
    ensurePracticeCollections(practiceUuid);
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
    const body = (await request.json().catch(() => ({}))) as { practiceId?: string };
    if (!body.practiceId) {
      return HttpResponse.json({ error: 'practiceId required' }, { status: 400 });
    }
    ensurePracticeCollections(body.practiceId);
    const state = mockDb.onboarding[body.practiceId];
    state.completed = true;
    state.completedAt = Date.now();
    state.status = 'completed';
    return HttpResponse.json({ success: true });
  }),

  http.post('/api/onboarding/skip', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { practiceId?: string };
    if (!body.practiceId) {
      return HttpResponse.json({ error: 'practiceId required' }, { status: 400 });
    }
    ensurePracticeCollections(body.practiceId);
    const state = mockDb.onboarding[body.practiceId];
    state.skipped = true;
    state.status = 'skipped';
    return HttpResponse.json({ success: true });
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

  http.get('*/api/auth/subscription/list', async () => {
    return HttpResponse.json({
      subscriptions: []
    });
  }),

  http.post('*/api/auth/subscription/cancel', async () => {
    return HttpResponse.json({
      success: true
    });
  }),

  http.post('*/api/subscription/cancel', async () => {
    return HttpResponse.json({
      success: true
    });
  }),

  // ============================================
  // Guest Chat Flow Mocks
  // ============================================
  // Note: These handlers use same-origin paths because getRemoteApiUrl() 
  // returns window.location.origin in development, allowing MSW to intercept

  // Better Auth anonymous sign-in
  // Better Auth returns { data: { user, session } } format
  http.post('/api/auth/sign-in/anonymous', async () => {
    console.log('[MSW] Intercepted POST /api/auth/sign-in/anonymous');
    const token = `mock-anonymous-token-${randomId('token')}`;
    const user = getAnonymousUserByToken(token);
    if (!user) {
      return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Better Auth expects { data: { user, session } } format
    // The client will transform this appropriately
    return HttpResponse.json({
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: false,
          email_verified: false,
          image: null
        },
        session: {
          id: `session-${user.id}`,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          userId: user.id,
          user_id: user.id,
          activeOrganizationId: null,
          active_organization_id: null
        }
      }
    }, {
      headers: {
        'set-auth-token': token,
        'Set-Auth-Token': token, // Some clients use different case
        'Set-Cookie': `better-auth.session_token=${token}; Path=/; HttpOnly; SameSite=Lax` // Also set as cookie for compatibility
      }
    });
  }),

  // Better Auth get-session (for token validation)
  http.get('/api/auth/get-session', async ({ request }) => {
    console.log('[MSW] Intercepted GET /api/auth/get-session', request.url);
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[MSW] No auth header in get-session request');
      return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const token = authHeader.replace('Bearer ', '').trim();
    
    const user = getOrCreateAnonymousUser(token);
    
    return HttpResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        email_verified: false,
        image: null
      },
      session: {
        id: `session-${user.id}`,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        user_id: user.id,
        active_organization_id: null
      }
    });
  }),

  // GET /api/conversations - Get or create conversation for anonymous users
  http.get('/api/conversations', async ({ request }) => {
    console.log('[MSW] Intercepted GET /api/conversations', request.url);
    const result = getOrCreateConversation(request);
    if ('error' in result) {
      return result.error;
    }
    
    // Return single conversation object for anonymous users (matches real API)
    // But wrap it in an array for consistency with useConversations hook
    return HttpResponse.json({
      success: true,
      data: { conversations: [result.conversation] }
    });
  }),

  // GET /api/conversations/active - Same as above
  http.get('/api/conversations/active', async ({ request }) => {
    const result = getOrCreateConversation(request);
    if ('error' in result) {
      return result.error;
    }
    
    return HttpResponse.json({
      success: true,
      data: { conversation: result.conversation }
    });
  }),

  // POST /api/conversations - Create conversation
  http.post('/api/conversations', async ({ request }) => {
    console.log('[MSW] Intercepted POST /api/conversations', request.url);
    const body = (await request.json().catch(() => ({}))) as {
      participantUserIds?: string[];
      matterId?: string;
      metadata?: Record<string, unknown>;
      practiceId?: string;
    };
    
    const url = new URL(request.url);
    // Check both query params and body for practiceId
    const practiceId = url.searchParams.get('practiceId') || body.practiceId;
    
    console.log('[MSW] POST /api/conversations - practiceId:', practiceId, 'from query:', url.searchParams.get('practiceId'), 'from body:', body.practiceId);
    
    if (!practiceId) {
      return HttpResponse.json({ error: 'practiceId is required' }, { status: 400 });
    }

    const authHeader = request.headers.get('Authorization');
    console.log('[MSW] POST /api/conversations - auth header:', authHeader ? 'present' : 'missing');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const token = authHeader.replace('Bearer ', '').trim();
    const user = getOrCreateAnonymousUser(token);
    const isAnonymous = !user.email || user.email === '';
    
    const convId = randomId('conv');
    const now = new Date().toISOString();
    const participants = Array.from(new Set([user.id, ...(body.participantUserIds || [])]));
    
    const conversation: MockConversation = {
      id: convId,
      practice_id: practiceId,
      user_id: isAnonymous ? null : user.id,
      matter_id: body.matterId || null,
      participants,
      user_info: body.metadata || null,
      status: 'active',
      assigned_to: null,
      priority: 'normal',
      tags: undefined,
      internal_notes: null,
      last_message_at: null,
      first_response_at: null,
      closed_at: null,
      created_at: now,
      updated_at: now
    };
    
    mockDb.conversations.set(convId, conversation);
    mockDb.messages.set(convId, []);
    
    return HttpResponse.json({
      success: true,
      data: conversation
    });
  }),

  // GET /api/chat/messages - Fetch messages for a conversation
  http.get('/api/chat/messages', async ({ request }) => {
    const url = new URL(request.url);
    const conversationId = url.searchParams.get('conversationId');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const since = url.searchParams.get('since');
    
    if (!conversationId) {
      return HttpResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const conversation = mockDb.conversations.get(conversationId);
    if (!conversation) {
      return HttpResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    
    let conversationMessages = mockDb.messages.get(conversationId) || [];
    
    // Filter by since timestamp if provided (for polling)
    if (since) {
      const sinceDate = new Date(since);
      conversationMessages = conversationMessages.filter(msg => new Date(msg.created_at) > sinceDate);
    }
    
    // Sort by created_at descending (newest first)
    conversationMessages.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    // Apply limit
    const limitedMessages = conversationMessages.slice(0, limit);
    
    // Reverse to oldest first (for display)
    limitedMessages.reverse();
    
    return HttpResponse.json({
      success: true,
      data: {
        messages: limitedMessages,
        hasMore: conversationMessages.length > limit
      }
    });
  }),

  // POST /api/chat/messages - Send a message
  http.post('/api/chat/messages', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      conversationId?: string;
      content?: string;
      attachments?: string[];
      metadata?: Record<string, unknown>;
    };
    
    if (!body.conversationId || !body.content) {
      return HttpResponse.json({ error: 'conversationId and content are required' }, { status: 400 });
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const token = authHeader.replace('Bearer ', '').trim();
    const user = getOrCreateAnonymousUser(token);
    
    const conversation = mockDb.conversations.get(body.conversationId);
    if (!conversation) {
      return HttpResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    
    // Verify user is a participant
    if (!conversation.participants.includes(user.id)) {
      return HttpResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // Create message
    const messageId = randomId('msg');
    const now = new Date().toISOString();
    const message: MockMessage = {
      id: messageId,
      conversation_id: body.conversationId,
      practice_id: conversation.practice_id,
      user_id: user.id,
      role: 'user',
      content: body.content,
      metadata: body.metadata || (body.attachments ? { attachments: body.attachments } : null),
      token_count: null,
      created_at: now
    };
    
    // Add message to conversation
    const conversationMessages = mockDb.messages.get(body.conversationId) || [];
    conversationMessages.push(message);
    mockDb.messages.set(body.conversationId, conversationMessages);
    
    // Update conversation last_message_at
    conversation.last_message_at = now;
    conversation.updated_at = now;
    
    return HttpResponse.json({
      success: true,
      data: message
    });
  }),

  // ============================================
  // Additional dev-only mocks
  // ============================================

  http.post('/api/chat', async () => {
    return HttpResponse.json({
      success: true,
      data: {
        message: 'ok'
      }
    });
  }),

  http.get('/api/health', async () => {
    return HttpResponse.json({
      status: 'ok'
    });
  }),

  http.post('/api/practice-client-intakes/submit', async ({ request }) => {
    const body = await request.json().catch(() => ({})) as { slug?: string };
    let practiceId = randomId('practice');
    if (body.slug) {
      const practice = findPractice(body.slug);
      if (practice) {
        practiceId = practice.id;
      }
    }
    return HttpResponse.json({
      success: true,
      data: {
        matter_id: randomId('matter'),
        matter_number: `MAT-${randomId('num')}`,
        practice_id: practiceId,
        status: 'lead',
        message: 'Lead submitted successfully. A team member will follow up soon.'
      }
    });
  }),

  http.post('/api/users/welcome', async () => {
    return HttpResponse.json({
      success: true
    });
  }),

  http.post('/api/matter-creation', async () => {
    return HttpResponse.json({
      success: true,
      data: {
        id: randomId('matter')
      }
    });
  }),

  http.get('/api/lawyers', async ({ request }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    return HttpResponse.json({
      success: true,
      data: {
        lawyers: [],
        pagination: {
          page,
          limit,
          total: 0,
          pages: 0
        },
        source: 'mock',
        query: Object.fromEntries(url.searchParams.entries())
      }
    });
  }),

  http.get('/api/activity', async () => {
    return HttpResponse.json({
      success: true,
      data: {
        items: [],
        hasMore: false,
        total: 0
      }
    });
  }),

  http.get('/api/inbox/conversations', async ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const conversations = Array.from(mockDb.conversations.values());
    const paged = conversations.slice(offset, offset + limit);

    return HttpResponse.json({
      success: true,
      data: {
        conversations: paged,
        total: conversations.length,
        limit,
        offset
      }
    });
  }),

  http.get('/api/inbox/stats', async ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const conversations = Array.from(mockDb.conversations.values());
    const total = conversations.length;
    return HttpResponse.json({
      success: true,
      data: {
        total,
        active: total,
        unassigned: total,
        assignedToMe: 0,
        highPriority: 0,
        archived: 0,
        closed: 0
      }
    });
  }),

  http.post('/api/inbox/conversations/:conversationId/assign', async ({ params, request }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { assigned_to?: string | null };
    const conversationId = String(params.conversationId);
    const conversation = mockDb.conversations.get(conversationId);
    if (!conversation) {
      return notFound('Conversation not found');
    }
    conversation.assigned_to = body.assigned_to ?? null;
    conversation.updated_at = new Date().toISOString();
    mockDb.conversations.set(conversationId, conversation);

    return HttpResponse.json({ success: true });
  }),

  http.patch('/api/inbox/conversations/:conversationId', async ({ params, request }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Partial<MockConversation>;
    const conversationId = String(params.conversationId);
    const conversation = mockDb.conversations.get(conversationId);
    if (!conversation) {
      return notFound('Conversation not found');
    }

    const updatedConversation = {
      ...conversation,
      ...body,
      updated_at: new Date().toISOString()
    };
    mockDb.conversations.set(conversationId, updatedConversation);

    return HttpResponse.json({ success: true });
  }),

  http.post('/api/inbox/conversations/:conversationId/messages', async ({ params, request }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { content?: string; metadata?: Record<string, unknown> };
    const conversationId = String(params.conversationId);
    const conversation = mockDb.conversations.get(conversationId);
    if (!conversation) {
      return notFound('Conversation not found');
    }

    const messageId = randomId('msg');
    const now = new Date().toISOString();
    const message: MockMessage = {
      id: messageId,
      conversation_id: conversationId,
      practice_id: conversation.practice_id,
      user_id: 'mock-agent',
      role: 'assistant',
      content: body.content || '',
      metadata: body.metadata || null,
      token_count: null,
      created_at: now
    };

    const conversationMessages = mockDb.messages.get(conversationId) || [];
    conversationMessages.push(message);
    mockDb.messages.set(conversationId, conversationMessages);

    conversation.last_message_at = now;
    conversation.updated_at = now;
    mockDb.conversations.set(conversationId, conversation);

    return HttpResponse.json({ success: true });
  }),

  http.post('/api/files/upload', async ({ request }) => {
    const formData = await request.formData();
    const file = formData.get('file');
    const fileName = file instanceof File ? file.name : 'upload.bin';
    const fileType = file instanceof File ? file.type || 'application/octet-stream' : 'application/octet-stream';
    const fileSize = file instanceof File ? file.size : 0;
    const fileId = randomId('file');
    const storageKey = `uploads/mock/${fileId}/${fileName}`;

    return HttpResponse.json({
      success: true,
      data: {
        fileId,
        fileName,
        fileType,
        fileSize,
        url: `/api/files/${fileId}`,
        storageKey
      }
    });
  }),

  http.get('/api/files/:fileId', async ({ params }) => {
    const fileId = String(params.fileId);
    return new HttpResponse(`Mock file ${fileId}`, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain'
      }
    });
  }),

  http.get('/api/subscriptions/plans', () => {
    return HttpResponse.json({
      plans: [
        {
          id: 'business_seat',
          name: 'business_seat',
          display_name: 'Business',
          description: 'Professional plan for businesses',
          stripe_product_id: 'prod_business',
          stripe_monthly_price_id: 'price_monthly_business',
          stripe_yearly_price_id: 'price_yearly_business',
          monthly_price: '99.00',
          yearly_price: '990.00',
          currency: 'usd',
          features: ['Unlimited conversations', 'Team collaboration', 'Priority support'],
          limits: {
            users: 10,
            invoices_per_month: 100,
            storage_gb: 100
          },
          is_active: true,
          is_public: true
        }
      ]
    });
  })
];
