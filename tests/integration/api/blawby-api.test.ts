import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { WORKER_URL } from '../../setup-real-api';
import { Currency } from '../../../worker/agents/legal-intake/index.js';

// Real Blawby API configuration for integration testing
const BLAWBY_API_URL = 'https://staging.blawby.com';
const BLAWBY_ORGANIZATION_SLUG = 'blawby-ai';

// Test context for managing test data and state
interface TestContext {
  customerIds: string[];
  apiToken?: string;
  organizationUlid?: string;
  organizationMetadata?: {
    name: string;
    slug: string;
    config: any;
  };
}

describe('Blawby API Integration Tests - Real API Calls', () => {
  let testContext: TestContext;

  // Helper: skip when token/ULID missing or blank (whitespace-only)
  const shouldSkipTest = (): boolean => {
    return !testContext.apiToken?.trim() || !testContext.organizationUlid?.trim();
  };

  beforeAll(async () => {
    console.log('🔍 Setting up Blawby API integration tests...');
    
    // Read sensitive credentials from environment variables (secure approach)
    const apiToken = process.env.BLAWBY_API_TOKEN;
    const organizationUlid = process.env.BLAWBY_ORGANIZATION_ULID;
    
    testContext = {
      customerIds: [],
      apiToken: apiToken,
      organizationUlid: organizationUlid
    };
    
    if (apiToken && organizationUlid) {
      console.log('✅ Retrieved Blawby API credentials from environment variables');
      console.log(`   Organization ULID: ${testContext.organizationUlid}`);
      console.log(`   API Token: ${testContext.apiToken ? '***' + testContext.apiToken.slice(-4) : 'NOT SET'}`);
    } else {
      console.warn('⚠️  Blawby API credentials not available in environment variables');
      console.warn('   Set BLAWBY_API_TOKEN and BLAWBY_ORGANIZATION_ULID for real API testing');
    }
    
    // Fetch non-sensitive organization metadata from API (credentials are redacted server-side)
    try {
      const response = await fetch(`${WORKER_URL}/api/organizations/${BLAWBY_ORGANIZATION_SLUG}`, {
        signal: AbortSignal.timeout(10000), // 10 second timeout
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const result = await response.json() as { data?: { name?: string; slug?: string; config?: { blawbyApi?: { enabled?: boolean } } } };
        const organization = result.data; // API returns { success: true, data: organization }
        
        if (organization) {
          // Store non-sensitive metadata (apiKey and organizationUlid are redacted server-side)
          testContext.organizationMetadata = {
            name: organization.name,
            slug: organization.slug,
            config: organization.config
          };
          
          console.log('✅ Retrieved organization metadata from database');
          console.log(`   Organization Name: ${testContext.organizationMetadata.name}`);
          console.log(`   Blawby API Enabled: ${testContext.organizationMetadata.config?.blawbyApi?.enabled || false}`);
        }
      } else {
        console.warn(`⚠️  Failed to fetch organization metadata: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.warn('⚠️  Failed to retrieve organization metadata:', error);
    }
    
    if (shouldSkipTest()) {
      console.warn('⚠️  Blawby API credentials not available for testing');
      console.warn('   Tests will be skipped. Set BLAWBY_API_TOKEN and BLAWBY_ORGANIZATION_ULID environment variables for real API testing.');
    }
  });

  afterEach(async () => {
    // Skip if no real API token, organization ULID, or no test data
    if (!testContext.apiToken || !testContext.organizationUlid || !testContext.customerIds.length) {
      console.log('⏭️  Skipping cleanup - no valid token, organization ULID, or test data');
      return;
    }
    
    // Use Promise.allSettled for bounded parallelism to speed up cleanup
    const cleanupPromises = testContext.customerIds.map(async (customerId) => {
      try {
        console.log(`🧹 Cleaning up test customer: ${customerId}`);
        
        const deleteResponse = await fetch(
          `${BLAWBY_API_URL}/api/v1/organizations/${testContext.organizationUlid}/customer/${customerId}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${testContext.apiToken}`,
              'Accept': 'application/json'
            },
            signal: AbortSignal.timeout(5000) // 5 second timeout for cleanup
          }
        );
        
        if (deleteResponse.ok) {
          console.log(`✅ Successfully deleted test customer: ${customerId}`);
        } else if (deleteResponse.status === 404) {
          console.log(`ℹ️  Test customer ${customerId} already deleted (404)`);
        } else {
          console.warn(
            `⚠️  Failed to delete test customer ${customerId}: ${deleteResponse.status} ${deleteResponse.statusText}`
          );
        }
      } catch (error) {
        console.warn(`❌ Error cleaning up test customer ${customerId}:`, error);
      }
    });
    
    // Wait for all cleanup operations to complete (with parallelism)
    await Promise.allSettled(cleanupPromises);
  });

  describe('API Authentication', () => {
    it('should successfully authenticate with the Blawby API', async () => {
      // Skip if no real API credentials
      if (shouldSkipTest()) {
        console.log('⏭️  Skipping real API test - no valid credentials');
        return;
      }

      const response = await fetch(`${BLAWBY_API_URL}/api/v1/organizations/${testContext.organizationUlid}/customers`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${testContext.apiToken}`,
          'Accept': 'application/json'
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('ulid');
      expect(data).toHaveProperty('customers');
    });

    it('should reject requests without proper authentication', async () => {
      // Skip if no real API credentials
      if (shouldSkipTest()) {
        console.log('⏭️  Skipping real API test - no valid credentials');
        return;
      }

      const response = await fetch(`${BLAWBY_API_URL}/api/v1/organizations/${testContext.organizationUlid}/customers`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Customer Creation', () => {
    it('should successfully create a customer', async () => {
      // Skip if no real API credentials
      if (shouldSkipTest()) {
        console.log('⏭️  Skipping real API test - no valid credentials');
        return;
      }

      const timestamp = Date.now();
      const email = `test-api-${timestamp}@example.com`;
      
      const customerData = {
        name: 'Test Customer API',
        email: email,
        phone: '+13322097232',
        currency: Currency.USD,
        status: 'Lead',
        organization_id: testContext.organizationUlid,
        address_line_1: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zip: '12345'
      };

      const response = await fetch(`${BLAWBY_API_URL}/api/v1/organizations/${testContext.organizationUlid}/customer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testContext.apiToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(customerData)
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { message?: string; data?: { id?: string; name?: string; email?: string } };
      expect(data).toHaveProperty('message', 'Customer created successfully.');
      expect(data).toHaveProperty('data');
      expect(data.data).toHaveProperty('id');
      expect(data.data?.name).toBe(customerData.name);
      expect(data.data?.email).toBe(customerData.email);

      // Store the customer ID in test context for cleanup
      testContext.customerIds.push(data.data?.id || '');
    });

    it('should reject customer creation with invalid data', async () => {
      // Skip if no real API credentials
      if (shouldSkipTest()) {
        console.log('⏭️  Skipping real API test - no valid credentials');
        return;
      }

      const invalidCustomerData = {
        name: 'Test Customer',
        email: 'invalid-email',
        phone: 'invalid-phone'
      };

      const response = await fetch(`${BLAWBY_API_URL}/api/v1/organizations/${testContext.organizationUlid}/customer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testContext.apiToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(invalidCustomerData)
      });

      expect(response.status).toBe(422);
      const data = await response.json() as { message?: string };
      expect(data).toHaveProperty('message');
    });
  });

  describe('Invoice Creation', () => {
    it('should successfully create an invoice for a customer', async () => {
      // Skip if no real API credentials
      if (shouldSkipTest()) {
        console.log('⏭️  Skipping real API test - no valid credentials');
        return;
      }

      // Create customer first
      const timestamp = Date.now();
      const email = `test-invoice-${timestamp}@example.com`;
      
      const customerData = {
        name: 'Test Customer for Invoice',
        email: email,
        phone: '+13322097232',
        currency: Currency.USD,
        status: 'Lead',
        organization_id: testContext.organizationUlid
      };

      const customerResponse = await fetch(`${BLAWBY_API_URL}/api/v1/organizations/${testContext.organizationUlid}/customer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testContext.apiToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(customerData)
      });

      expect(customerResponse.status).toBe(200);
      const customerResult = await customerResponse.json() as { data?: { id?: string } };
      const customerIdResult = customerResult.data?.id;

      // Store customer ID for cleanup
      testContext.customerIds.push(customerIdResult || '');

      // Create invoice
      const invoiceData = {
        customer_id: customerIdResult,
        amount: 150.00,
        currency: Currency.USD,
        description: 'Legal consultation services',
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'draft', // Required field
        line_items: [ // Required field
          {
            description: 'Legal consultation services',
            quantity: 1,
            unit_price: 150.00,
            amount: 150.00,
            line_total: 150.00 // Required field
          }
        ]
      };

      const invoiceResponse = await fetch(`${BLAWBY_API_URL}/api/v1/organizations/${testContext.organizationUlid}/invoice`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testContext.apiToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(invoiceData)
      });

      console.log('📊 Invoice Response Status:', invoiceResponse.status);
      // Convert headers to plain object for logging (Headers may not be directly iterable)
      const headersObj: Record<string, string> = {};
      invoiceResponse.headers.forEach((value, key) => {
        headersObj[key] = value;
      });
      console.log('📊 Invoice Response Headers:', headersObj);
      
      const invoiceResult = await invoiceResponse.json() as { message?: string; data?: { id?: string; customer_id?: string; amount_due?: number; invoice_line_items?: Array<{ line_total?: number }> } };
      console.log('📊 Invoice Response Body:', JSON.stringify(invoiceResult, null, 2));
      
      if (invoiceResponse.status !== 200) {
        console.log('❌ Invoice creation failed with validation error');
        console.log('📋 Invoice data sent:', JSON.stringify(invoiceData, null, 2));
        console.log('👤 Customer ID used:', customerIdResult);
      }
      
      if (invoiceResponse.status !== 200) {
        console.error('❌ Invoice creation failed!');
        console.error('Status:', invoiceResponse.status);
        console.error('Response:', JSON.stringify(invoiceResult, null, 2));
        console.error('Invoice data sent:', JSON.stringify(invoiceData, null, 2));
        console.error('Customer ID:', customerIdResult);
        throw new Error(`Invoice creation failed with status ${invoiceResponse.status}: ${JSON.stringify(invoiceResult)}`);
      }
      
      expect(invoiceResponse.status).toBe(200);
      expect(invoiceResult).toHaveProperty('message', 'Invoice created successfully.');
      expect(invoiceResult).toHaveProperty('data');
      expect(invoiceResult.data).toHaveProperty('id');
      expect(invoiceResult.data?.customer_id).toBe(customerIdResult);
      
      // Log the actual response structure to understand the API
      console.log('✅ Invoice created successfully!');
      console.log('📊 Invoice response structure:', JSON.stringify(invoiceResult.data, null, 2));
      
      // The API returns amount_due instead of amount, and invoice_line_items instead of line_items
      expect(invoiceResult.data).toHaveProperty('amount_due', 150);
      expect(invoiceResult.data).toHaveProperty('invoice_line_items');
      expect(invoiceResult.data?.invoice_line_items).toHaveLength(1);
      expect(invoiceResult.data?.invoice_line_items?.[0]).toHaveProperty('line_total', 150);
      
      console.log('✅ Invoice created successfully with correct structure!');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // Test network error by hitting a safe local endpoint and aborting immediately
      // This avoids sending sensitive credentials to external domains
      try {
        const controller = new AbortController();
        
        // Start the request to a safe local endpoint (no sensitive data)
        const fetchPromise = fetch(`${WORKER_URL}/api/health`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          },
          signal: controller.signal
        });
        
        // Abort immediately to simulate network failure
        controller.abort();
        
        await fetchPromise;
        // If we get here, the test should fail
        expect.fail('Expected network error but request succeeded');
      } catch (error) {
        // Expected network error (AbortError)
        expect(error).toBeDefined();
        expect(error.name).toBe('AbortError');
      }
    }, 10000); // 10 second test timeout

    it('should handle rate limiting', async () => {
      // Skip if no real API credentials
      if (shouldSkipTest()) {
        console.log('⏭️  Skipping real API test - no valid credentials');
        return;
      }

      // Make multiple rapid requests to test rate limiting
      const promises = Array.from({ length: 5 }, () =>
        fetch(`${BLAWBY_API_URL}/api/v1/organizations/${testContext.organizationUlid}/customers`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${testContext.apiToken}`,
            'Accept': 'application/json'
          }
        })
      );

      const responses = await Promise.all(promises);
      
      // All requests should either succeed or be rate limited (429)
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });
  });
});