#!/usr/bin/env node
/**
 * Pre-migration validation script for removing lawyers table
 * 
 * This script validates that the external lawyer search API is available
 * before allowing the migration to proceed. Run this before applying
 * the 20251201_remove_lawyers_table.sql migration.
 * 
 * Usage:
 *   npm run validate:lawyer-api-migration
 *   # or
 *   tsx scripts/validate-lawyer-api-migration.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), 'worker', '.dev.vars') });

interface ValidationResult {
  success: boolean;
  apiReachable: boolean;
  apiKeyConfigured: boolean;
  testQuerySuccessful: boolean;
  error?: string;
  details?: {
    apiUrl?: string;
    responseTime?: number;
    statusCode?: number;
  };
}

async function validateLawyerApi(): Promise<ValidationResult> {
  const result: ValidationResult = {
    success: false,
    apiReachable: false,
    apiKeyConfigured: false,
    testQuerySuccessful: false,
  };

  // Check if API key is configured
  const apiKey = process.env.LAWYER_SEARCH_API_KEY;
  const apiUrl = process.env.LAWYER_SEARCH_API_URL || 'https://search.blawby.com';

  result.details = { apiUrl };

  if (!apiKey) {
    result.error = 'LAWYER_SEARCH_API_KEY is not configured in environment variables';
    return result;
  }
  result.apiKeyConfigured = true;

  // Test API connectivity with a simple query
  try {
    const testUrl = `${apiUrl}/lawyers?state=ca&city=los+angeles&practice_area=family+law&limit=1`;
    const startTime = Date.now();

    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      // Add timeout
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    const responseTime = Date.now() - startTime;
    result.details.responseTime = responseTime;
    result.details.statusCode = response.status;

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      result.error = `API returned status ${response.status}: ${errorText}`;
      return result;
    }

    const data = await response.json();
    
    // Validate response structure
    if (data && typeof data === 'object') {
      result.apiReachable = true;
      result.testQuerySuccessful = true;
      result.success = true;
    } else {
      result.error = 'API returned invalid response format';
      return result;
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        result.error = `API request timed out after 10 seconds. API may be unreachable.`;
      } else if (error.message.includes('fetch')) {
        result.error = `Failed to reach API: ${error.message}`;
      } else {
        result.error = `API validation error: ${error.message}`;
      }
    } else {
      result.error = 'Unknown error during API validation';
    }
    return result;
  }

  return result;
}

async function main() {
  console.log('🔍 Validating external lawyer search API before migration...\n');

  const result = await validateLawyerApi();

  console.log('Validation Results:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`API Key Configured: ${result.apiKeyConfigured ? '✅' : '❌'}`);
  console.log(`API Reachable: ${result.apiReachable ? '✅' : '❌'}`);
  console.log(`Test Query Successful: ${result.testQuerySuccessful ? '✅' : '❌'}`);
  
  if (result.details) {
    console.log(`API URL: ${result.details.apiUrl}`);
    if (result.details.responseTime) {
      console.log(`Response Time: ${result.details.responseTime}ms`);
    }
    if (result.details.statusCode) {
      console.log(`Status Code: ${result.details.statusCode}`);
    }
  }

  if (result.error) {
    console.log(`\n❌ Error: ${result.error}`);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (result.success) {
    console.log('✅ Validation PASSED - External API is available and working.');
    console.log('   You can proceed with the migration: 20251201_remove_lawyers_table.sql');
    console.log('\n   Next steps:');
    console.log('   1. Apply the migration: wrangler d1 migrations apply blawby-ai-chatbot --local');
    console.log('   2. Monitor the application for any issues');
    console.log('   3. If issues occur, rollback using the rollback script\n');
    process.exit(0);
  } else {
    console.log('❌ Validation FAILED - External API is not available or misconfigured.');
    console.log('   DO NOT proceed with the migration until the API is validated.');
    console.log('\n   Troubleshooting:');
    console.log('   1. Check that LAWYER_SEARCH_API_KEY is set in worker/.dev.vars');
    console.log('   2. Verify the API URL is correct');
    console.log('   3. Test the API manually: curl -H "Authorization: Bearer $LAWYER_SEARCH_API_KEY" https://search.blawby.com/lawyers?state=ca&limit=1');
    console.log('   4. Check network connectivity\n');
    process.exit(1);
  }
}

// Run if called directly (check if this is the main module)
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('validate-lawyer-api-migration.ts')) {
  main().catch((error) => {
    console.error('Fatal error during validation:', error);
    process.exit(1);
  });
}

export { validateLawyerApi, type ValidationResult };
