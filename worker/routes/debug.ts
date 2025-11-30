import type { Env } from '../types.js';
import { AdobeDocumentService } from '../services/AdobeDocumentService.js';
import { requireAuth, requireOrgMember } from '../middleware/auth.js';
import { parseJsonBody } from '../utils.js';
import { createSuccessResponse, handleError } from '../errorHandler.js';

/**
 * Debug endpoint to test Adobe extraction and capture request details
 */
export async function handleDebug(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  console.log('🧪 DEBUG: handleDebug called with path:', path);

  if (path === '/api/debug/adobe-test') {
    return await testAdobeExtraction(request, env);
  }

  // Test helper endpoint: convert organization to business
  // Updates subscription_tier directly (subscription management is handled by remote API)
  // Only available in test/dev environments
  if (path === '/api/test/convert-org-to-business' && request.method === 'POST') {
    // Only allow in test/dev
    if (env.NODE_ENV !== 'test' && env.NODE_ENV !== 'development') {
      return new Response('Not available in production', { status: 403 });
    }
    return await convertOrgToBusiness(request, env);
  }

  return new Response('Debug endpoint not found', { status: 404 });
}

/**
 * Test helper: Convert organization to business by directly updating is_personal = 0
 * Updates subscription_tier directly in local DB (subscription management is handled by remote API)
 */
async function convertOrgToBusiness(request: Request, env: Env): Promise<Response> {
  try {
    const authContext = await requireAuth(request, env);
    
    const body = await parseJsonBody(request) as { organizationId: string };
    const organizationId = body?.organizationId;

    if (!organizationId || typeof organizationId !== 'string') {
      return new Response(JSON.stringify({ success: false, error: 'organizationId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if organization exists first
    const existing = await env.DB.prepare(
      `SELECT id, is_personal, subscription_tier FROM organizations WHERE id = ?`
    ).bind(organizationId).first<{ id: string; is_personal: number; subscription_tier: string }>();

    if (!existing) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Organization ${organizationId} not found` 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`[TEST] Converting organization ${organizationId} from is_personal=${existing.is_personal} to business`);

    // Ensure user is owner (same as onboarding endpoints do)
    // Note: This test endpoint directly manipulates local DB for testing purposes
    await requireOrgMember(request, env, organizationId, 'owner');

    // Direct SQL update to set organization to business tier
    // This sets is_personal = 0, subscription_tier = 'business', seats = 1
    // Note: subscription_tier is managed by remote API, but this test endpoint updates it locally for testing
    let result;
    try {
      result = await env.DB.prepare(
        `UPDATE organizations 
         SET subscription_tier = 'business',
             seats = 1,
             is_personal = 0,
             updated_at = ?
        WHERE id = ?`
      )
        .bind(
          Math.floor(Date.now() / 1000),
          organizationId
        )
        .run();

      if (!result?.success) {
        throw new Error('Failed to update organization');
      }
    } catch (e) {
      console.error('[TEST] Organization update failed:', e);
      throw e;
    }

    // Note: subscription_tier is managed by remote API
    // This test endpoint updates it locally for testing purposes only

    console.log(`[TEST] Converted organization ${organizationId} to business:`, {
      changes: result.meta?.changes ?? 0,
      success: result.success
    });

    // Note: Cache clearing removed - organizations are now managed by remote API

    // Verify the update
    const updated = await env.DB.prepare(
      `SELECT id, is_personal, subscription_tier FROM organizations WHERE id = ?`
    ).bind(organizationId).first<{ id: string; is_personal: number; subscription_tier: string }>();

    return createSuccessResponse({ 
      success: true, 
      message: `Organization ${organizationId} converted to business`,
      changes: result.meta?.changes ?? 0,
      updated: {
        is_personal: updated?.is_personal ?? null,
        subscription_tier: updated?.subscription_tier ?? null
      }
    });
  } catch (error) {
    console.error('[TEST] Error converting org to business:', error);
    return handleError(error);
  }
}

async function testAdobeExtraction(request: Request, env: Env): Promise<Response> {
  const debugLogs: string[] = [];
  
  const log = (message: string) => {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    debugLogs.push(logEntry);
    console.log(logEntry);
  };

  try {
    log('🧪 DEBUG: Starting Adobe extraction test');
    
    // Create a small test PDF buffer (minimal valid PDF)
    const testPdfBuffer = new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A, 0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A,
      0x31, 0x20, 0x30, 0x20, 0x6F, 0x62, 0x6A, 0x0A, 0x3C, 0x3C, 0x2F, 0x54, 0x79, 0x70, 0x65,
      0x2F, 0x43, 0x61, 0x74, 0x61, 0x6C, 0x6F, 0x67, 0x2F, 0x50, 0x61, 0x67, 0x65, 0x73, 0x20,
      0x32, 0x20, 0x30, 0x20, 0x52, 0x3E, 0x3E, 0x0A, 0x65, 0x6E, 0x64, 0x6F, 0x62, 0x6A, 0x0A,
      0x32, 0x20, 0x30, 0x20, 0x6F, 0x62, 0x6A, 0x0A, 0x3C, 0x3C, 0x2F, 0x54, 0x79, 0x70, 0x65,
      0x2F, 0x50, 0x61, 0x67, 0x65, 0x73, 0x2F, 0x4B, 0x69, 0x64, 0x73, 0x5B, 0x33, 0x20, 0x30,
      0x20, 0x52, 0x5D, 0x2F, 0x43, 0x6F, 0x75, 0x6E, 0x74, 0x20, 0x31, 0x3E, 0x3E, 0x0A, 0x65,
      0x6E, 0x64, 0x6F, 0x62, 0x6A, 0x0A, 0x33, 0x20, 0x30, 0x20, 0x6F, 0x62, 0x6A, 0x0A, 0x3C,
      0x3C, 0x2F, 0x54, 0x79, 0x70, 0x65, 0x2F, 0x50, 0x61, 0x67, 0x65, 0x2F, 0x50, 0x61, 0x72,
      0x65, 0x6E, 0x74, 0x20, 0x32, 0x20, 0x30, 0x20, 0x52, 0x2F, 0x4D, 0x65, 0x64, 0x69, 0x61,
      0x42, 0x6F, 0x78, 0x5B, 0x30, 0x20, 0x30, 0x20, 0x36, 0x31, 0x32, 0x20, 0x37, 0x39, 0x32,
      0x5D, 0x3E, 0x3E, 0x0A, 0x65, 0x6E, 0x64, 0x6F, 0x62, 0x6A, 0x0A, 0x78, 0x72, 0x65, 0x66,
      0x0A, 0x30, 0x20, 0x34, 0x0A, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30,
      0x20, 0x36, 0x35, 0x35, 0x33, 0x35, 0x20, 0x66, 0x20, 0x0A, 0x30, 0x30, 0x30, 0x30, 0x30,
      0x30, 0x30, 0x30, 0x39, 0x20, 0x30, 0x30, 0x30, 0x30, 0x30, 0x20, 0x6E, 0x20, 0x0A, 0x30,
      0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x31, 0x35, 0x20, 0x30, 0x30, 0x30, 0x30, 0x30, 0x20,
      0x6E, 0x20, 0x0A, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x32, 0x34, 0x20, 0x30, 0x30,
      0x30, 0x30, 0x30, 0x20, 0x6E, 0x20, 0x0A, 0x74, 0x72, 0x61, 0x69, 0x6C, 0x65, 0x72, 0x0A,
      0x3C, 0x3C, 0x2F, 0x53, 0x69, 0x7A, 0x65, 0x20, 0x34, 0x2F, 0x52, 0x6F, 0x6F, 0x74, 0x20,
      0x31, 0x20, 0x30, 0x20, 0x52, 0x3E, 0x3E, 0x0A, 0x73, 0x74, 0x61, 0x72, 0x74, 0x78, 0x72,
      0x65, 0x66, 0x0A, 0x30, 0x0A, 0x25, 0x25, 0x45, 0x4F, 0x46, 0x0A
    ]);

    log(`🧪 DEBUG: Created test PDF buffer, size: ${testPdfBuffer.length}`);

    // Create Adobe service
    const adobeService = new AdobeDocumentService(env);
    log(`🧪 DEBUG: Adobe service created, enabled: ${adobeService.isEnabled()}`);

    // Test the extraction
    log('🧪 DEBUG: Starting Adobe extraction...');
    const result = await adobeService.extractFromBuffer(
      'test-document.pdf',
      'application/pdf',
      testPdfBuffer.buffer
    );

    log('🧪 DEBUG: Adobe extraction completed');
    log(`🧪 DEBUG: Result: ${JSON.stringify(result, null, 2)}`);

    return new Response(JSON.stringify({
      success: true,
      test: 'Adobe extraction test completed',
      result: result,
      debug: {
        pdfBufferSize: testPdfBuffer.length,
        adobeEnabled: adobeService.isEnabled(),
        timestamp: new Date().toISOString()
      },
      logs: debugLogs
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    log(`🧪 DEBUG: Adobe test failed: ${error}`);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      debug: {
        timestamp: new Date().toISOString(),
        errorType: typeof error
      },
      logs: debugLogs
    }, null, 2), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}