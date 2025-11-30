import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WORKER_URL } from '../../setup-real-api';
import { ApiResponse } from '../../../worker/types.js';
import { Organization } from '../../../worker/services/OrganizationService.js';

describe('OrganizationService Integration - Real API', () => {
  // Test organization data for deterministic testing
  let testOrganization1: Organization | undefined;
  let testOrganization2: Organization | undefined;

  // Helper function to clean up test organizations
  async function cleanupTestOrganizations(): Promise<void> {
    const cleanupPromises = [];
    
    if (testOrganization1?.id) {
      cleanupPromises.push(
        fetch(`${WORKER_URL}/api/organizations/${testOrganization1.id}`, {
          method: 'DELETE'
        }).catch(deleteErr => 
          console.warn('Failed to cleanup test organization 1:', deleteErr)
        )
      );
    }
    
    if (testOrganization2?.id) {
      cleanupPromises.push(
        fetch(`${WORKER_URL}/api/organizations/${testOrganization2.id}`, {
          method: 'DELETE'
        }).catch(deleteErr => 
          console.warn('Failed to cleanup test organization 2:', deleteErr)
        )
      );
    }

    await Promise.all(cleanupPromises);
  }

  beforeAll(async () => {
    console.log('🧪 Testing OrganizationService against real worker at:', WORKER_URL);
    
    // Verify worker is running
    try {
      const healthResponse = await fetch(`${WORKER_URL}/api/health`);
      if (!healthResponse.ok) {
        throw new Error(`Worker health check failed: ${healthResponse.status}`);
      }
      console.log('✅ Worker is running and healthy');
    } catch (_error) {
      throw new Error(`Worker is not running at ${WORKER_URL}. Please ensure wrangler dev is started.`);
    }

    // Create deterministic test organizations
    const timestamp = Date.now();
    
    try {
      // Create first test organization
      const org1Data = {
        slug: `test-org-1-${timestamp}`,
        name: 'Test Organization 1',
        config: {
          consultationFee: 0,
          requiresPayment: false,
          ownerEmail: 'test1@example.com',
          availableServices: ['Legal Consultation'],
          jurisdiction: {
            type: 'national',
            description: 'Test jurisdiction 1',
            supportedStates: ['all'],
            supportedCountries: ['US']
          },
          domain: 'test1.example.com',
          description: 'Test organization 1 description',
          brandColor: '#000000',
          accentColor: '#ffffff',
          introMessage: 'Hello from test organization 1!'
        }
      };

      const org1Response = await fetch(`${WORKER_URL}/api/organizations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(org1Data)
      });

      if (!org1Response.ok) {
        throw new Error(`Failed to create test organization 1: ${org1Response.status}`);
      }

      const org1Result = await org1Response.json() as ApiResponse<Organization>;
      if (!org1Result.success || !org1Result.data) {
        throw new Error(`Test organization 1 creation failed: ${JSON.stringify(org1Result)}`);
      }
      testOrganization1 = org1Result.data;

      // Create second test organization
      const org2Data = {
        slug: `test-org-2-${timestamp}`,
        name: 'Test Organization 2',
        config: {
          consultationFee: 50,
          requiresPayment: true,
          ownerEmail: 'test2@example.com',
          availableServices: ['Legal Consultation', 'Document Review'],
          jurisdiction: {
            type: 'state',
            description: 'Test jurisdiction 2',
            supportedStates: ['CA', 'NY'],
            supportedCountries: ['US']
          },
          domain: 'test2.example.com',
          description: 'Test organization 2 description',
          brandColor: '#0066cc',
          accentColor: '#ffffff',
          introMessage: 'Hello from test organization 2!'
        }
      };

      const org2Response = await fetch(`${WORKER_URL}/api/organizations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(org2Data)
      });

      if (!org2Response.ok) {
        throw new Error(`Failed to create test organization 2: ${org2Response.status}`);
      }

      const org2Result = await org2Response.json() as ApiResponse<Organization>;
      if (!org2Result.success || !org2Result.data) {
        throw new Error(`Test organization 2 creation failed: ${JSON.stringify(org2Result)}`);
      }
      testOrganization2 = org2Result.data;
    } catch (error) {
      // Clean up any successfully created organizations before rethrowing
      await cleanupTestOrganizations();
      
      // Rethrow the original error so the test setup still fails
      throw error;
    }

    console.log('✅ Created test organizations:', {
      org1: { id: testOrganization1!.id, slug: testOrganization1!.slug },
      org2: { id: testOrganization2!.id, slug: testOrganization2!.slug }
    });
  });

  afterAll(async () => {
    // Clean up test organizations
    await cleanupTestOrganizations();
    console.log('✅ Cleaned up test organizations');
  });

  describe('GET /api/organizations', () => {
    it('should return all organizations', async () => {
      const response = await fetch(`${WORKER_URL}/api/organizations`);
      
      expect(response.status).toBe(200);
      const result = await response.json() as ApiResponse<Organization[]>;
      
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data!.length).toBeGreaterThanOrEqual(2); // At least our 2 test organizations
      
      // Verify our test organizations are in the response
      const organizationIds = result.data!.map(org => org.id);
      expect(organizationIds).toContain(testOrganization1!.id);
      expect(organizationIds).toContain(testOrganization2!.id);
      
      // Verify organization structure using our test data
      const testOrg1InResponse = result.data!.find(org => org.id === testOrganization1!.id);
      expect(testOrg1InResponse).toBeDefined();
      expect(testOrg1InResponse).toHaveProperty('id', testOrganization1!.id);
      expect(testOrg1InResponse).toHaveProperty('slug', testOrganization1!.slug);
      expect(testOrg1InResponse).toHaveProperty('name', testOrganization1!.name);
      expect(testOrg1InResponse).toHaveProperty('config');
    });
  });

  describe('GET /api/organizations/{id}', () => {
    it('should return organization by ID', async () => {
      const response = await fetch(`${WORKER_URL}/api/organizations/${testOrganization1!.id}`);
      
      expect(response.status).toBe(200);
      const result = await response.json() as ApiResponse<Organization>;
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', testOrganization1!.id);
      expect(result.data).toHaveProperty('slug', testOrganization1!.slug);
      expect(result.data).toHaveProperty('name', testOrganization1!.name);
      expect(result.data).toHaveProperty('config');
    });

    it('should return organization by slug', async () => {
      const response = await fetch(`${WORKER_URL}/api/organizations/${testOrganization2!.slug}`);
      
      expect(response.status).toBe(200);
      const result = await response.json() as ApiResponse<Organization>;
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('slug', testOrganization2!.slug);
      expect(result.data).toHaveProperty('id', testOrganization2!.id);
      expect(result.data).toHaveProperty('name', testOrganization2!.name);
      expect(result.data).toHaveProperty('config');
    });

    it('should return 404 for non-existent organization', async () => {
      const response = await fetch(`${WORKER_URL}/api/organizations/non-existent-organization`);
      
      expect(response.status).toBe(404);
      const result = await response.json() as ApiResponse;
      expect(result.success).toBe(false);
    });
  });

  describe('POST /api/organizations', () => {
    it('should create a new organization', async () => {
      const newOrganization = {
        slug: `test-organization-${Date.now()}`,
        name: 'Test Organization',
        config: {
                consultationFee: 0,
                requiresPayment: false,
          ownerEmail: 'test@realcompany.com',
          availableServices: ['Test Service'],
                jurisdiction: {
                  type: 'national',
            description: 'Test jurisdiction',
                  supportedStates: ['all'],
                  supportedCountries: ['US']
                },
          domain: 'test.example.com',
          description: 'Test organization description',
          brandColor: '#000000',
          accentColor: '#ffffff',
          introMessage: 'Hello from test organization!'
        }
      };

      const response = await fetch(`${WORKER_URL}/api/organizations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newOrganization)
      });

      expect(response.status).toBe(201);
      const result = await response.json() as ApiResponse<Organization>;
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id');
      expect(result.data).toHaveProperty('slug', newOrganization.slug);
      expect(result.data).toHaveProperty('name', newOrganization.name);
      expect(result.data).toHaveProperty('config');
    });

    it('should validate required fields when creating organization', async () => {
      const invalidOrganization = {
        // Missing required fields
        name: 'Invalid Organization'
      };

      const response = await fetch(`${WORKER_URL}/api/organizations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(invalidOrganization)
      });

      expect(response.status).toBe(400);
      const result = await response.json() as ApiResponse;
      expect(result.success).toBe(false);
    });
  });

  describe('PUT /api/organizations/{id}', () => {
    it('should update an existing organization', async () => {
      // First create a organization
      const newOrganization = {
        slug: `update-test-${Date.now()}`,
        name: 'Update Test Organization',
        config: {
          consultationFee: 0,
          requiresPayment: false,
          ownerEmail: 'update@realcompany.com',
          availableServices: ['Update Service'],
          jurisdiction: {
            type: 'national',
            description: 'Update jurisdiction',
            supportedStates: ['all'],
            supportedCountries: ['US']
          },
          domain: 'update.example.com',
          description: 'Update organization description',
          brandColor: '#000000',
          accentColor: '#ffffff',
          introMessage: 'Hello from update organization!'
        }
      };

      const createResponse = await fetch(`${WORKER_URL}/api/organizations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newOrganization)
      });

      const createdOrganization = await createResponse.json() as ApiResponse<Organization>;
      const organizationId = createdOrganization.data!.id;

      // Update the organization
      const updatedOrganization = {
        ...newOrganization,
        name: 'Updated Organization Name',
        config: {
          ...newOrganization.config,
          description: 'Updated description'
        }
      };

      const updateResponse = await fetch(`${WORKER_URL}/api/organizations/${organizationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatedOrganization)
      });

      expect(updateResponse.status).toBe(200);
      const result = await updateResponse.json() as ApiResponse<Organization>;
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('name', 'Updated Organization Name');
      expect(result.data).toHaveProperty('config');
    });

    it('should return 404 when updating non-existent organization', async () => {
      const updateData = {
        name: 'Non-existent Organization',
        config: {}
      };

      const response = await fetch(`${WORKER_URL}/api/organizations/non-existent-id`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      expect(response.status).toBe(404);
      const result = await response.json() as ApiResponse;
      expect(result.success).toBe(false);
    });
  });

  describe('DELETE /api/organizations/{id}', () => {
    it('should delete an existing organization', async () => {
      // First create a organization to delete
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 8);
      const newOrganization = {
        slug: `delete-test-${timestamp}-${randomId}`,
        name: 'Delete Test Organization',
        config: {
          consultationFee: 0,
          requiresPayment: false,
          ownerEmail: 'delete@realcompany.com',
          availableServices: ['Delete Service'],
          jurisdiction: {
            type: 'national',
            description: 'Delete jurisdiction',
            supportedStates: ['all'],
            supportedCountries: ['US']
          },
          domain: 'delete.example.com',
          description: 'Delete organization description',
          brandColor: '#000000',
          accentColor: '#ffffff',
          introMessage: 'Hello from delete organization!'
        }
      };

      const createResponse = await fetch(`${WORKER_URL}/api/organizations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newOrganization)
      });

      console.log('Create response status:', createResponse.status);
      const createdOrganization = await createResponse.json() as ApiResponse<Organization>;
      console.log('Created organization response:', JSON.stringify(createdOrganization, null, 2));
      
      if (!createdOrganization.success) {
        throw new Error(`Organization creation failed: ${JSON.stringify(createdOrganization)}`);
      }
      
      const organizationId = createdOrganization.data!.id;

      // Delete the organization
      console.log('Attempting to delete organization with ID:', organizationId);
      const deleteResponse = await fetch(`${WORKER_URL}/api/organizations/${organizationId}`, {
        method: 'DELETE'
      });

      console.log('Delete response status:', deleteResponse.status);
      const deleteResult = await deleteResponse.json() as ApiResponse;
      console.log('Delete response:', JSON.stringify(deleteResult, null, 2));

      expect(deleteResponse.status).toBe(200);
      expect(deleteResult.success).toBe(true);

      // Verify organization is deleted
      const getResponse = await fetch(`${WORKER_URL}/api/organizations/${organizationId}`);
      expect(getResponse.status).toBe(404);
    });

    it('should return 404 when deleting non-existent organization', async () => {
      const response = await fetch(`${WORKER_URL}/api/organizations/non-existent-id`, {
        method: 'DELETE'
      });

      expect(response.status).toBe(404);
      const result = await response.json() as ApiResponse;
      expect(result.success).toBe(false);
    });
  });

  describe('Organization configuration validation', () => {
    it('should validate organization configuration structure', async () => {
      // Test with our deterministic test organization
      const response = await fetch(`${WORKER_URL}/api/organizations/${testOrganization1!.id}`);
      const result = await response.json() as ApiResponse<Organization>;
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      
      const organization = result.data!;

      // Verify config has required fields
      expect(organization.config).toHaveProperty('consultationFee');
      expect(organization.config).toHaveProperty('requiresPayment');
      expect(organization.config).toHaveProperty('ownerEmail');
      expect(organization.config).toHaveProperty('availableServices');
      expect(organization.config).toHaveProperty('jurisdiction');
      
      // Verify specific values from our test data
      expect(organization.config.consultationFee).toBe(0);
      expect(organization.config.requiresPayment).toBe(false);
      expect(organization.config.ownerEmail).toBe('test1@example.com');
      expect(Array.isArray(organization.config.availableServices)).toBe(true);
      expect(organization.config.availableServices).toContain('Legal Consultation');
    });

    it('should handle organizations with different configurations', async () => {
      // Test that our two test organizations have different configurations
      const response1 = await fetch(`${WORKER_URL}/api/organizations/${testOrganization1!.id}`);
      const response2 = await fetch(`${WORKER_URL}/api/organizations/${testOrganization2!.id}`);
      
      const result1 = await response1.json() as ApiResponse<Organization>;
      const result2 = await response2.json() as ApiResponse<Organization>;
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      
      const org1 = result1.data!;
      const org2 = result2.data!;

      // Verify they have different configurations
      expect(org1.id).not.toBe(org2.id);
      expect(org1.slug).not.toBe(org2.slug);
      expect(org1.config.consultationFee).not.toBe(org2.config.consultationFee);
      expect(org1.config.requiresPayment).not.toBe(org2.config.requiresPayment);
      expect(org1.config.ownerEmail).not.toBe(org2.config.ownerEmail);
      
      // Verify specific differences
      expect(org1.config.consultationFee).toBe(0);
      expect(org2.config.consultationFee).toBe(50);
      expect(org1.config.requiresPayment).toBe(false);
      expect(org2.config.requiresPayment).toBe(true);
    });
  });

  });
});
