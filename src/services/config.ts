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

let configCache: AppConfig | null = null;

export async function getAppConfig(): Promise<AppConfig> {
  if (configCache) {
    return configCache;
  }

  try {
    const response = await fetch(`${getApiConfig().baseUrl}/config`);
    if (!response.ok) {
      throw new Error(`Failed to fetch config: ${response.status}`);
    }
    
    const result = await response.json();
    if (!result.success) {
      throw new Error('Config API returned error');
    }
    
    configCache = result.data;
    return configCache;
  } catch (error) {
    console.error('Failed to fetch app configuration:', error);
    // Fallback to hardcoded values if config endpoint fails
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
