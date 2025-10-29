import { z } from 'zod';
import { getApiConfig } from '../config/api';

export interface AppConfig {
  stripe: {
    priceId: string;
    annualPriceId: string;
    subscriptionsEnabled: boolean;
  };
  features: {
    stripeSubscriptions: boolean;
    emailVerification: boolean;
  };
}

// Zod schema for runtime validation
const appConfigSchema = z.object({
  stripe: z.object({
    priceId: z.string().min(1, 'Stripe price ID is required'),
    annualPriceId: z.string().min(1, 'Stripe annual price ID is required'),
    subscriptionsEnabled: z.boolean()
  }),
  features: z.object({
    stripeSubscriptions: z.boolean(),
    emailVerification: z.boolean()
  })
});

// API response schema
const configApiResponseSchema = z.object({
  success: z.boolean(),
  data: appConfigSchema
});

let configCache: AppConfig | null = null;

export async function getAppConfig(): Promise<AppConfig> {
  if (configCache) {
    return configCache;
  }

  try {
    const response = await fetch(`${getApiConfig().baseUrl}/api/config`);
    if (!response.ok) {
      throw new Error(`Failed to fetch config: ${response.status}`);
    }
    
    // Parse JSON and validate basic structure
    let result: unknown;
    try {
      result = await response.json();
    } catch (_parseError) {
      throw new Error('Config API returned invalid JSON');
    }
    
    // Validate that result is an object and not null
    if (typeof result !== 'object' || result === null) {
      throw new Error('Config API returned non-object response');
    }
    
    // Validate the response structure using Zod
    const validationResult = configApiResponseSchema.safeParse(result);
    if (!validationResult.success) {
      const errorDetails = validationResult.error.issues
        .map(err => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
      throw new Error(`Config API response validation failed: ${errorDetails}`);
    }
    
    // Check if the API call was successful
    if (!validationResult.data.success) {
      throw new Error('Config API returned error status');
    }
    
    // Data structure is guaranteed by Zod validation above
    configCache = validationResult.data.data;
    return configCache;
  } catch (error) {
    console.error('Failed to fetch app configuration:', error);
    
    // For validation errors, throw them to maintain type safety
    if (error instanceof Error && (
      error.message.includes('validation failed') ||
      error.message.includes('invalid JSON') ||
      error.message.includes('non-object response') ||
      error.message.includes('error status')
    )) {
      throw error;
    }
    
    // Fallback to hardcoded values only for network/API failures
    return {
      stripe: {
        priceId: 'price_1SHfgbDJLzJ14cfPBGuTvcG3',
        annualPriceId: 'price_1SHfhCDJLzJ14cfPGFGQ77vQ',
        subscriptionsEnabled: true
      },
      features: {
        stripeSubscriptions: true,
        emailVerification: false
      }
    };
  }
}

export function clearConfigCache(): void {
  configCache = null;
}
