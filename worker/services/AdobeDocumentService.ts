import type { Env } from '../types.js';
import { Logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { unzipSync, strFromU8 } from 'fflate';

type AdobeEnv = Pick<
  Env,
  'ADOBE_CLIENT_ID' |
  'ADOBE_CLIENT_SECRET' |
  'ADOBE_IMS_BASE_URL' |
  'ADOBE_PDF_SERVICES_BASE_URL' |
  'ADOBE_SCOPE' |
  'ENABLE_ADOBE_EXTRACT'
>;

interface AdobeToken {
  accessToken: string;
  expiresAt: number;
}

interface AdobeConfig {
  clientId: string;
  clientSecret: string;
  imsBase: string;
  pdfBase: string;
  scope: string;
}

export interface AdobeExtractSuccess {
  text?: string;
  elements?: unknown[];
  tables?: unknown[];
  rawResponse?: unknown;
}

export interface AdobeExtractResult {
  success: boolean;
  details?: AdobeExtractSuccess;
  warnings?: string[];
  error?: string;
  status?: number;
}

// Interface for Adobe extraction to support dependency injection
export interface IAdobeExtractor {
  isEnabled(): boolean;
  extractFromBuffer(fileName: string, mimeType: string, buffer: ArrayBuffer): Promise<AdobeExtractResult>;
}

interface AdobeAssetResponse {
  assetID: string;
  uploadUri: string;
}

interface AdobeJobStatus {
  status?: string;
  downloadUri?: string;
  download_url?: string;
  downloadURL?: string;
  download_uri?: string;
  resource?: {
    downloadUri?: string;
  };
  content?: {
    downloadUri?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

type JobResolution =
  | { type: 'buffer'; buffer: ArrayBuffer }
  | { type: 'uri'; downloadUri: string };

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const DEFAULT_IMS_BASE = 'https://ims-na1.adobelogin.com';
const DEFAULT_PDF_BASE = 'https://pdf-services.adobe.io';
const DEFAULT_SCOPE = 'openid,AdobeID,DCAPI';
const MAX_POLL_ATTEMPTS = 60; // Increased from 20 to 60 (worst-case ~5 minutes: 60 attempts × ~5s, typical average ~2-3 minutes)
const POLL_BASE_DELAY_MS = 2000; // Increased from 1000 to 2000ms

// Timeout and retry configuration for external API calls
const IMS_TOKEN_TIMEOUT_MS = 10000; // 10 seconds timeout for IMS token requests
const IMS_TOKEN_RETRY_ATTEMPTS = 3;
const IMS_TOKEN_RETRY_BASE_DELAY = 500; // 500ms base delay

const PDF_API_TIMEOUT_MS = 15000; // 15 seconds timeout for PDF API requests
const _PDF_API_RETRY_ATTEMPTS = 3;
const PDF_API_RETRY_BASE_DELAY = 1000; // 1 second base delay

const _DEFAULT_EXTRACT_PARAMS = {
  elementsToExtract: ['text', 'tables'],
  renditionsToGenerate: [],
  includeStyling: false
} as const;

/**
 * Utility function to add timeout to fetch requests
 */
async function fetchWithTimeout(
  url: string, 
  options: Parameters<typeof fetch>[1] & { signal?: AbortSignal }, 
  timeoutMs: number
): Promise<Response> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
  
  // Handle caller's signal if provided
  let callerAbortListener: (() => void) | undefined;
  
  try {
    // If caller's signal is already aborted, abort timeout controller immediately
    if (options.signal?.aborted) {
      timeoutController.abort();
    } else if (options.signal) {
      // Add listener to abort timeout controller when caller aborts
      callerAbortListener = () => timeoutController.abort();
      options.signal.addEventListener('abort', callerAbortListener, { once: true });
    }
    
    const response = await fetch(url, {
      ...options,
      signal: timeoutController.signal
    });
    
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    // Clean up timeout and listener to prevent leaks
    clearTimeout(timeoutId);
    if (callerAbortListener && options.signal) {
      options.signal.removeEventListener('abort', callerAbortListener);
    }
  }
}

/**
 * Adobe PDF Services client that implements the REST workflow:
 * 1. Obtain IMS access token
 * 2. Create an asset
 * 3. Upload file bytes to the signed S3 URL
 * 4. Start an extract job referencing the asset
 * 5. Poll for completion and download the structured results ZIP
 */
export class AdobeDocumentService implements IAdobeExtractor {
  private static tokenCache: AdobeToken | null = null;
  private static inFlightToken: Promise<AdobeToken> | null = null;

  constructor(
    private readonly env: AdobeEnv
  ) {}

  isEnabled(): boolean {
    const flag = this.env.ENABLE_ADOBE_EXTRACT;
    if (typeof flag === 'boolean') return flag;
    if (typeof flag === 'string') {
      return ['1', 'true', 'yes', 'on'].includes(flag.trim().toLowerCase());
    }
    return false;
  }

  async extractFromBuffer(
    fileName: string,
    mimeType: string,
    buffer: ArrayBuffer
  ): Promise<AdobeExtractResult> {
    if (!this.isEnabled()) {
      return {
        success: false,
        error: 'Adobe extract disabled',
        warnings: ['ENABLE_ADOBE_EXTRACT is not enabled']
      };
    }

    try {
      Logger.debug('Adobe Step 1: Getting config and access token', { fileName, mimeType });
      const config = this.getConfig();
      Logger.debug('Adobe Step 1a: Config obtained', { fileName, mimeType });
      const accessToken = await this.getAccessToken(config);
      Logger.info('Adobe Step 1: Access token obtained', { fileName, mimeType });

      Logger.debug('Adobe Step 2: Creating asset', { fileName, mimeType });
      const { assetID, uploadUri } = await this.createAsset(fileName, mimeType, config, accessToken);
      Logger.info('Adobe Step 2: Asset created', { fileName, mimeType, assetID });

      Logger.debug('Adobe Step 3: Uploading asset', { fileName, mimeType, assetID });
      await this.uploadAsset(uploadUri, buffer, mimeType);
      Logger.info('Adobe Step 3: Asset uploaded', { fileName, mimeType, assetID });

      Logger.debug('Adobe Step 4: Starting extract job', { fileName, mimeType, assetID });
      const jobLocation = await this.startExtractJob(assetID, config, accessToken);
      Logger.info('Adobe Step 4: Extract job started', { fileName, mimeType, assetID, jobLocation });

      Logger.debug('Adobe Step 5: Polling job status', { fileName, mimeType, assetID, jobLocation });
      const resolution = await this.pollJob(jobLocation, config, accessToken);
      Logger.info('Adobe Step 5: Job completed', { fileName, mimeType, assetID, jobLocation, resolutionType: resolution.type });

      Logger.debug('Adobe Step 6: Processing results', { fileName, mimeType, assetID, jobLocation, resolutionType: resolution.type });
      let zipBuffer: ArrayBuffer;
      if (resolution.type === 'buffer') {
        zipBuffer = resolution.buffer;
      } else {
        zipBuffer = await this.downloadResult(resolution.downloadUri, config, accessToken);
      }

      Logger.debug('Adobe Step 7: Processing ZIP payload', { fileName, mimeType, assetID, jobLocation, resolutionType: resolution.type });
      return this.processZipPayload(new Uint8Array(zipBuffer));
    } catch (error) {
      Logger.error('Adobe extract failed', {
        fileName,
        mimeType,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unexpected Adobe extract error'
    };
  }
}

  private getConfig(): AdobeConfig {
    const clientId = this.env.ADOBE_CLIENT_ID?.trim();
    const clientSecret = this.env.ADOBE_CLIENT_SECRET?.trim();

    if (!clientId || !clientSecret) {
      throw new Error('Adobe credentials are not configured');
    }

    const imsBase = (this.env.ADOBE_IMS_BASE_URL || DEFAULT_IMS_BASE).replace(/\/+$/, '');
    const pdfBase = (this.env.ADOBE_PDF_SERVICES_BASE_URL || DEFAULT_PDF_BASE).replace(/\/+$/, '');
    const scope = this.env.ADOBE_SCOPE?.trim() || DEFAULT_SCOPE;

    return {
      clientId,
      clientSecret,
      imsBase,
      pdfBase,
      scope
    };
  }

  private async fetchAccessToken(config: AdobeConfig): Promise<AdobeToken> {
    const url = `${config.imsBase}/ims/token/v3`;
    const body = `client_id=${encodeURIComponent(config.clientId)}&client_secret=${encodeURIComponent(config.clientSecret)}&grant_type=client_credentials&scope=${encodeURIComponent(config.scope)}`;

    Logger.debug('Fetching Adobe IMS access token', { 
      url, 
      clientId: config.clientId,
      scope: config.scope 
    });

    return withRetry(async () => {
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      }, IMS_TOKEN_TIMEOUT_MS);

      if (!response.ok) {
        const payload = await response.text();
        const error = new Error(`Failed to obtain Adobe token (${response.status}): ${payload}`);
        (error as { status?: number }).status = response.status;
        throw error;
      }

      const data = await response.json() as { access_token: string; expires_in?: number };
      if (!data.access_token) {
        throw new Error('Adobe token response missing access_token');
      }

      const expiresIn = typeof data.expires_in === 'number' ? data.expires_in * 1000 : 3600 * 1000;
      const token = {
        accessToken: data.access_token,
        expiresAt: Date.now() + Math.max(expiresIn - FIVE_MINUTES_MS, 60_000)
      };

      Logger.info('Adobe IMS access token obtained successfully', { 
        expiresIn: expiresIn / 1000,
        expiresAt: new Date(token.expiresAt).toISOString()
      });

      return token;
    }, {
      attempts: IMS_TOKEN_RETRY_ATTEMPTS,
      baseDelay: IMS_TOKEN_RETRY_BASE_DELAY,
      operationName: 'Adobe IMS token fetch'
    });
  }

  private async getAccessToken(config: AdobeConfig): Promise<string> {
    if (AdobeDocumentService.tokenCache && Date.now() < AdobeDocumentService.tokenCache.expiresAt) {
      return AdobeDocumentService.tokenCache.accessToken;
    }

    if (!AdobeDocumentService.inFlightToken) {
      AdobeDocumentService.inFlightToken = this.fetchAccessToken(config)
        .finally(() => { AdobeDocumentService.inFlightToken = null; });
    }

    AdobeDocumentService.tokenCache = await AdobeDocumentService.inFlightToken;
    return AdobeDocumentService.tokenCache.accessToken;
  }

  private async createAsset(
    fileName: string,
    mimeType: string,
    config: AdobeConfig,
    accessToken: string
  ): Promise<AdobeAssetResponse> {
    const url = `${config.pdfBase}/assets`;
    const payload = {
      mediaType: mimeType,
      name: fileName
    };

    Logger.debug('Creating Adobe asset', { fileName, mimeType, url });

    return withRetry(async () => {
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': config.clientId,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }, PDF_API_TIMEOUT_MS);

      if (!response.ok) {
        const errorPayload = await response.text();
        const error = new Error(`Failed to create Adobe asset (${response.status}): ${errorPayload}`);
        (error as { status?: number }).status = response.status;
        throw error;
      }

      const data = await response.json() as { id?: string; assetID?: string; uploadUri?: string };
      const assetID = data.assetID ?? data.id;
      if (!assetID || !data.uploadUri) {
        throw new Error('Adobe asset response missing required fields');
      }

      Logger.debug('Adobe asset created successfully', { 
        fileName, 
        mimeType, 
        assetID 
      });

      return { assetID, uploadUri: data.uploadUri };
    }, {
      attempts: 1,
      baseDelay: PDF_API_RETRY_BASE_DELAY,
      operationName: 'Adobe asset creation'
    });
  }

  private async uploadAsset(uploadUri: string, buffer: ArrayBuffer, mimeType: string): Promise<void> {
    const response = await fetch(uploadUri, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: buffer
    });

    if (!response.ok) {
      throw new Error(`Failed to upload asset bytes (${response.status}): ${response.statusText}`);
    }
  }

  private async startExtractJob(
    assetId: string,
    config: AdobeConfig,
    accessToken: string
  ): Promise<string> {
    // Validate assetId
    if (!assetId || typeof assetId !== 'string' || assetId.trim().length === 0) {
      throw new Error(`Invalid assetId provided: ${assetId}`);
    }
    
    // Log the exact assetId being used
    Logger.info('Adobe Step 4: Starting extract job', { assetId });
    
    // Restore the exact working payload from commit 872c3ed
    const payload = {
      assetID: assetId,
      elementsToExtract: ["text", "tables"]
    };

    const url = `${config.pdfBase}/operation/extractpdf`;
    
    // Log the stringified payload to see exactly what's being sent
    const payloadString = JSON.stringify(payload);
    Logger.debug('Adobe Step 4: Extract job payload', { 
      assetId, 
      payload, 
      payloadString,
      payloadLength: payloadString.length,
      url 
    });

    return withRetry(async () => {
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': config.clientId,
          'x-request-id': `extract-${Date.now()}-${crypto.randomUUID()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }, PDF_API_TIMEOUT_MS);

      if (response.status !== 201 && response.status !== 202) {
        const responseText = await response.text();
        const error = new Error(`Failed to start Adobe extract job (${response.status}): ${responseText}`);
        (error as { status?: number }).status = response.status;
        throw error;
      }

      const location = response.headers.get('location');
      if (!location) {
        throw new Error('Adobe extract job did not return a location header');
      }

      Logger.debug('Adobe extract job started successfully', { assetId, location });
      return location;
    }, {
      attempts: 1,
      baseDelay: PDF_API_RETRY_BASE_DELAY,
      operationName: 'Adobe extract job start'
    });
  }

  private async pollJob(
    location: string,
    config: AdobeConfig,
    accessToken: string
  ): Promise<JobResolution> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      Logger.debug('Adobe Step 5: Polling attempt', { attempt: attempt + 1, maxAttempts: MAX_POLL_ATTEMPTS, location });
      
      const response = await fetch(location, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': config.clientId
        }
      });

      if (response.status === 202) {
        const delay = Math.min(POLL_BASE_DELAY_MS * (attempt + 1), 5000);
        Logger.debug('Adobe Step 5: Job still processing, waiting', { attempt: attempt + 1, delay, location });
        await this.wait(delay);
        continue;
      }

      if (!response.ok) {
        const payload = await response.text();
        throw new Error(`Adobe extract job failed (${response.status}): ${payload}`);
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.toLowerCase().includes('application/zip')) {
        const buffer = await response.arrayBuffer();
        return { type: 'buffer', buffer };
      }

      const jobStatus = await response.json() as AdobeJobStatus;
      if (jobStatus.status === 'done') {
        Logger.debug('Job completed, looking for download URI', { location, jobStatus });
        
        const downloadUri =
          jobStatus.downloadUri ||
          jobStatus.download_uri ||
          jobStatus.downloadURL ||
          jobStatus.download_url ||
          jobStatus.resource?.downloadUri ||
          jobStatus.content?.downloadUri;

        Logger.debug('Found download URI', { location, downloadUri });

        if (downloadUri) {
          return { type: 'uri', downloadUri };
        }

        throw new Error('Adobe extract job completed without a download URI');
      }

      if (jobStatus.status === 'failed') {
        const message = jobStatus.error?.message ?? 'Adobe extract job failed';
        throw new Error(message);
      }

      await this.wait(Math.min(POLL_BASE_DELAY_MS * (attempt + 1), 5000));
    }

    throw new Error('Timed out waiting for Adobe extract job to complete');
  }

  private async downloadResult(
    downloadUri: string,
    _config: AdobeConfig,
    _accessToken: string
  ): Promise<ArrayBuffer> {
    const response = await fetch(downloadUri, {
      method: 'GET'
    });

    if (!response.ok) {
      throw new Error(`Failed to download Adobe extract results (${response.status}): ${response.statusText}`);
    }

    return response.arrayBuffer();
  }

  private processZipPayload(zipBuffer: Uint8Array): AdobeExtractResult {
    const files = unzipSync(zipBuffer);
    const structuredEntry =
      files['structuredData.json'] ??
      Object.entries(files).find(([name]) => name.endsWith('structuredData.json'))?.[1];

    if (!structuredEntry) {
      return {
        success: true,
        details: {
          text: '',
          elements: [],
          tables: [],
          rawResponse: zipBuffer
        },
        warnings: ['Adobe extract ZIP did not contain structuredData.json']
      };
    }

    const structured = JSON.parse(strFromU8(structuredEntry)) as {
      elements?: unknown[];
      tables?: unknown[];
    };

    const elements = Array.isArray(structured.elements) ? structured.elements : [];
    const tables = Array.isArray(structured.tables) ? structured.tables : [];

    const textParts: string[] = [];
    for (const element of elements as Array<Record<string, unknown>>) {
      const value = element?.Text ?? element?.text;

      if (typeof value === 'string' && value.trim().length > 0) {
        textParts.push(value.trim());
      } else if (Array.isArray(value)) {
        const joined = value
          .filter((item): item is string => typeof item === 'string')
          .join(' ')
          .trim();
        if (joined.length > 0) {
          textParts.push(joined);
        }
      }
    }

    return {
      success: true,
      details: {
        text: textParts.join('\n').trim(),
        tables,
        elements,
        rawResponse: zipBuffer
      }
    };
  }

  private async wait(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Mock Adobe extractor for testing - returns predictable test data
 * without making network calls to Adobe services
 */
export class MockAdobeExtractor implements IAdobeExtractor {
  isEnabled(): boolean {
    return true; // Always enabled in tests
  }

  async extractFromBuffer(
    fileName: string,
    mimeType: string,
    _buffer: ArrayBuffer
  ): Promise<AdobeExtractResult> {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Return mock extracted content based on file type
    const mockText = this.generateMockText(fileName, mimeType, _buffer);
    const mockTables = this.generateMockTables();
    const mockElements = this.generateMockElements();

    return {
      success: true,
      details: {
        text: mockText,
        tables: mockTables,
        elements: mockElements
      }
    };
  }

  private generateMockText(fileName: string, mimeType: string, buffer: ArrayBuffer): string {
    if (mimeType === 'application/pdf') {
      return `Mock PDF Extraction Results for ${fileName}

This is a mock extracted text from PDF for testing purposes. The document appears to be a legal contract or agreement.

Key Information:
- Document Type: Legal Contract
- Parties: John Smith and Jane Doe
- Date: January 15, 2024
- Amount: $50,000
- Terms: 12 months

This mock extraction simulates what Adobe PDF Services would return for testing the analysis pipeline without requiring actual Adobe credentials.`;
    }

    if (mimeType === 'text/plain') {
      return `Mock Text File Content for ${fileName}

This is mock extracted text from a text file for testing purposes.

Legal Document Analysis:
- Client: Test Client
- Case Type: Contract Review
- Date: January 15, 2024
- Status: Pending Review

This content is used for testing the analysis pipeline.`;
    }

    return `Mock extracted content from ${fileName} (${mimeType})

This is a mock extraction result for testing purposes. The document has been processed and key information extracted.

Document Details:
- File: ${fileName}
- Type: ${mimeType}
- Size: ${buffer.byteLength} bytes
- Extracted: Mock content for testing`;
  }

  private generateMockTables(): unknown[] {
    return [
      {
        rows: [
          ['Item', 'Description', 'Amount'],
          ['Legal Fees', 'Contract Review', '$2,500'],
          ['Filing Fees', 'Court Filing', '$500'],
          ['Total', '', '$3,000']
        ]
      }
    ];
  }

  private generateMockElements(): unknown[] {
    return [
      {
        text: 'CONTRACT AGREEMENT',
        type: 'heading',
        confidence: 0.95
      },
      {
        text: 'This agreement is entered into on January 15, 2024',
        type: 'paragraph',
        confidence: 0.90
      },
      {
        text: 'John Smith',
        type: 'signature',
        confidence: 0.85
      }
    ];
  }
}
