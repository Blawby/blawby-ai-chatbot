import { describe, it, expect, beforeAll } from 'vitest';
import { WORKER_URL } from '../../setup-worker-integration';

// Type definitions for API responses
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface OrganizationData {
  id: string;
  slug: string;
  name: string;
  config: {
    consultationFee: number;
    requiresPayment: boolean;
    ownerEmail: string;
    availableServices: string[];
    jurisdiction: {
      type: string;
      description: string;
      supportedStates: string[];
      supportedCountries: string[];
    };
  };
}

// Helper function to create a test organization
async function createTestOrganization() {
  const newOrganization = {
    slug: `test-organization-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    name: 'Test Legal Organization',
    config: {
      consultationFee: 150,
      requiresPayment: true,
      ownerEmail: 'test@realcompany.com',
      availableServices: ['Family Law', 'Business Law'],
      jurisdiction: {
        type: 'state',
        description: 'North Carolina only',
        supportedStates: ['NC'],
        supportedCountries: ['US']
      }
    }
  };

  const response = await fetch(`${WORKER_URL}/api/organizations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newOrganization)
  });

  if (!response.ok) {
    throw new Error(`Failed to create test organization: ${response.status} ${response.statusText}`);
  }

  const responseData = await response.json() as ApiResponse<OrganizationData>;
  
  // Validate response data structure
  if (!responseData || responseData.data == null) {
    throw new Error(`Invalid API response: expected data property but got ${JSON.stringify(responseData)}`);
  }
  
  return responseData.data;
}

// Helper function to validate organizations data and create test organization if needed
async function getValidOrganizationData() {
  const organizationsResponse = await fetch(`${WORKER_URL}/api/organizations`);
  const organizationsData = await organizationsResponse.json() as ApiResponse<OrganizationData[]>;
  
  // Validate response structure
  if (!organizationsData || typeof organizationsData !== 'object') {
    throw new Error('Invalid organizations response: response is not an object');
  }
  
  if (!organizationsData.success) {
    throw new Error(`Organizations API request failed: ${organizationsData.error || 'Unknown error'}`);
  }
  
  if (!Array.isArray(organizationsData.data)) {
    throw new Error('Invalid organizations response: data is not an array');
  }
  
  if (organizationsData.data.length === 0) {
    console.log('⚠️  No organizations found, creating a test organization...');
    const testOrganization = await createTestOrganization();
    return { data: [testOrganization] };
  }
  
  return organizationsData;
}

// Helper function to wait for organization to exist with deterministic polling
async function waitForOrganizationToExist(organizationId: string, maxWaitTime = 5000, pollInterval = 100): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const verifyResponse = await fetch(`${WORKER_URL}/api/organizations/${organizationId}`, {
        method: 'GET'
      });
      
      if (verifyResponse.status === 200) {
        // Organization exists, we can proceed
        return;
      }
      
      // If not found, wait and try again
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (_error) {
      // On error, wait and try again
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }
  
  // If we get here, the timeout was reached
  const verifyResponse = await fetch(`${WORKER_URL}/api/organizations/${organizationId}`, {
    method: 'GET'
  });
  
  if (verifyResponse.status !== 200) {
    const verifyData = await verifyResponse.json() as ApiResponse<OrganizationData>;
    throw new Error(`Organization not found after creation! Timeout reached after ${maxWaitTime}ms. Verify Status: ${verifyResponse.status}, Data: ${JSON.stringify(verifyData, null, 2)}`);
  }
}

describe('Organizations API Integration Tests - Real Worker', () => {
  beforeAll(async () => {
    console.log('🧪 Testing organizations API against real worker at:', WORKER_URL);
    
    // Verify worker is running
    try {
      const healthResponse = await fetch(`${WORKER_URL}/api/health`);
      if (!healthResponse.ok) {
        throw new Error(`Worker health check failed: ${healthResponse.status}`);
      }
      console.log('✅ Worker is running and healthy');
    } catch (_error) {
      throw new Error(`Worker is not running at ${WORKER_URL}. Please start with: npx wrangler dev`);
    }
  });

  describe('GET /api/organizations', () => {
    it('should return all organizations successfully', async () => {
      const response = await fetch(`${WORKER_URL}/api/organizations`, {
        method: 'GET'
      });
      
      expect(response.status).toBe(200);
      const responseData = await response.json() as ApiResponse<OrganizationData[]>;
      
      expect(responseData.success).toBe(true);
      expect(Array.isArray(responseData.data)).toBe(true);
      expect(responseData.data?.length).toBeGreaterThan(0);
      
      // Verify organization structure
      const organization = responseData.data[0];
      expect(organization).toHaveProperty('id');
      expect(organization).toHaveProperty('slug');
      expect(organization).toHaveProperty('name');
      expect(organization).toHaveProperty('config');
      
      console.log('📋 Found organizations:', responseData.data?.map(t => ({ id: t.id, slug: t.slug, name: t.name })));
    });

    it('should handle CORS preflight requests', async () => {
      const response = await fetch(`${WORKER_URL}/api/organizations`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'Content-Type'
        }
      });
      
      expect(response.status).toBe(204); // OPTIONS requests should return 204 No Content
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    });
  });

  describe('GET /api/organizations/me', () => {
    it('should require authentication', async () => {
      const response = await fetch(`${WORKER_URL}/api/organizations/me`, {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/organizations/{slugOrId}', () => {
    it('should return specific organization by ID', async () => {
      // First get all organizations to find a valid ID
      const organizationsData = await getValidOrganizationData();
      const validOrganizationId = organizationsData.data[0].id;
      
      const response = await fetch(`${WORKER_URL}/api/organizations/${validOrganizationId}`, {
        method: 'GET'
      });
      
      expect(response.status).toBe(200);
      const responseData = await response.json() as ApiResponse<OrganizationData>;
      
      expect(responseData.success).toBe(true);
      expect(responseData.data).toHaveProperty('id', validOrganizationId);
      expect(responseData.data).toHaveProperty('slug');
      expect(responseData.data).toHaveProperty('name');
      expect(responseData.data).toHaveProperty('config');
    });

    it('should return specific organization by slug', async () => {
      // First get all organizations to find a valid slug
      const organizationsData = await getValidOrganizationData();
      const validOrganizationSlug = organizationsData.data[0].slug;
      
      const response = await fetch(`${WORKER_URL}/api/organizations/${validOrganizationSlug}`, {
        method: 'GET'
      });
      
      expect(response.status).toBe(200);
      const responseData = await response.json() as ApiResponse<OrganizationData>;
      
      expect(responseData.success).toBe(true);
      expect(responseData.data).toHaveProperty('slug', validOrganizationSlug);
      expect(responseData.data).toHaveProperty('id');
      expect(responseData.data).toHaveProperty('name');
      expect(responseData.data).toHaveProperty('config');
    });

    it('should return 404 for non-existent organization', async () => {
      const response = await fetch(`${WORKER_URL}/api/organizations/non-existent-organization`, {
        method: 'GET'
      });
      
      expect(response.status).toBe(404);
      const responseData = await response.json() as ApiResponse<OrganizationData>;
      
      expect(responseData.success).toBe(false);
      expect(responseData).toHaveProperty('error');
    });
  });

  describe('POST /api/organizations', () => {
    it('should create new organization successfully', async () => {
      const newOrganization = {
        slug: `test-organization-${Date.now()}`,
        name: 'Test Legal Organization',
        config: {
          aiModel: '@cf/openai/gpt-oss-20b',
          consultationFee: 150,
          requiresPayment: true,
          ownerEmail: 'test@realcompany.com',
          availableServices: ['Family Law', 'Business Law'],
          jurisdiction: {
            type: 'state',
            description: 'North Carolina only',
            supportedStates: ['NC'],
            supportedCountries: ['US']
          }
        }
      };

      const response = await fetch(`${WORKER_URL}/api/organizations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOrganization)
      });
      
      expect(response.status).toBe(201);
      const responseData = await response.json() as ApiResponse<OrganizationData>;
      
      expect(responseData.success).toBe(true);
      expect(responseData.data).toHaveProperty('id');
      expect(responseData.data).toHaveProperty('slug', newOrganization.slug);
      expect(responseData.data).toHaveProperty('name', newOrganization.name);
      expect(responseData.data).toHaveProperty('config');
      
      console.log('✅ Created organization:', responseData.data);
    }, 30000);

    it('should return 400 for missing required fields', async () => {
      const invalidOrganization = {
        name: 'Organization without slug'
        // Missing slug
      };

      const response = await fetch(`${WORKER_URL}/api/organizations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidOrganization)
      });
      
      expect(response.status).toBe(400);
      const responseData = await response.json() as ApiResponse<OrganizationData>;
      
      expect(responseData.success).toBe(false);
      expect(responseData).toHaveProperty('error');
    });
  });

  describe('PUT /api/organizations/{slugOrId}', () => {
    it('should require authentication to update organization', async () => {
      const newOrganization = {
        slug: `update-test-${Date.now()}`,
        name: 'Organization to Update',
        config: {}
      };

      const createResponse = await fetch(`${WORKER_URL}/api/organizations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOrganization)
      });
      
      const createdOrganization = await createResponse.json() as ApiResponse<OrganizationData>;
      expect(createdOrganization.data).toBeDefined();
      const organizationId = createdOrganization.data?.id;
      expect(organizationId).toBeDefined();

      const updateData = {
        name: 'Updated Organization Name'
      };

      const response = await fetch(`${WORKER_URL}/api/organizations/${organizationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });
      
      expect(response.status).toBe(401);
    });

    it('should return 404 for non-existent organization update', async () => {
      const updateData = {
        name: 'Updated Organization Name'
      };

      const response = await fetch(`${WORKER_URL}/api/organizations/non-existent-id`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });
      
      expect(response.status).toBe(404);
      const responseData = await response.json() as ApiResponse<OrganizationData>;
      
      expect(responseData.success).toBe(false);
      expect(responseData).toHaveProperty('error');
    });
  });

  describe('DELETE /api/organizations/{slugOrId}', () => {
    it('should require authentication to delete organization', async () => {
      const createRequest = {
        name: 'Test Organization for Deletion',
        slug: 'test-organization-delete-' + Date.now(),
        config: {
          requiresPayment: false,
          consultationFee: 0
        }
      };

      const createResponse = await fetch(`${WORKER_URL}/api/organizations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(createRequest)
      });
      
      expect(createResponse.status).toBe(201);
      const createResult = await createResponse.json() as ApiResponse<OrganizationData>;
      expect(createResult.data).toBeDefined();
      const organizationId = createResult.data?.id;
      expect(organizationId).toBeDefined();
      
      await waitForOrganizationToExist(organizationId as string);
      
      const response = await fetch(`${WORKER_URL}/api/organizations/${organizationId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      expect(response.status).toBe(401);
    });

    it('should return 404 for non-existent organization deletion', async () => {
      const response = await fetch(`${WORKER_URL}/api/organizations/non-existent-id`, {
        method: 'DELETE'
      });
      
      expect(response.status).toBe(404);
      const responseData = await response.json() as ApiResponse<OrganizationData>;
      
      expect(responseData.success).toBe(false);
      expect(responseData).toHaveProperty('error');
    });
  });

  describe('Method Not Allowed', () => {
    it('should reject unsupported methods', async () => {
      const response = await fetch(`${WORKER_URL}/api/organizations`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: 'Test' })
      });
      
      expect(response.status).toBe(405);
      const responseText = await response.text();
      
      expect(responseText).toContain('Method not allowed');
    });
  });
});
