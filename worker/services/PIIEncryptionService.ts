/**
 * PII Encryption Service
 * Provides encryption/decryption for sensitive PII fields at rest
 * Uses Web Crypto API with AES-GCM for authenticated encryption
 * 
 * TODO: This service is currently unused - integrate into user data flows
 * TODO: Add to Better Auth user update hooks
 * TODO: Add to user profile update API endpoints
 * TODO: Add to frontend user profile management
 */

import { Env } from '../types.js';
import { createContentHash } from '../utils/piiSanitizer.js';

export interface PIIField {
  field: string;
  value: string | null;
  encrypted?: boolean;
}

export interface PIIAuditLog {
  userId: string;
  accessType: 'read' | 'update' | 'delete' | 'export';
  piiFields: string[];
  accessReason?: string;
  accessedBy?: string;
  ipAddress?: string;
  userAgent?: string;
  organizationId?: string;
  // New fields for enhanced security and compliance
  consentId?: string;
  legalBasis?: string;
  consentVersion?: string;
  retentionPolicyId?: string;
  retentionExpiresAt?: number;
}

export class PIIEncryptionService {
  private env: Env;
  private encryptionKey: CryptoKey | null = null;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Initialize encryption key from environment using HKDF
   * Follows Web Crypto API best practices for key derivation
   */
  private async getEncryptionKey(): Promise<CryptoKey> {
    if (this.encryptionKey) {
      return this.encryptionKey;
    }

    const keyMaterial = this.env.BETTER_AUTH_SECRET || this.env.IDEMPOTENCY_SALT;
    if (!keyMaterial) {
      throw new Error('Encryption key material not found in environment');
    }

    // Import base key material for HKDF
    const baseKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(keyMaterial),
      { name: 'HKDF' },
      false,
      ['deriveKey']
    );
    
    // Derive encryption key using HKDF (Web Crypto standard)
    this.encryptionKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new TextEncoder().encode('pii-encryption-v1'),
        info: new TextEncoder().encode('audit-log-encryption')
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    return this.encryptionKey;
  }

  /**
   * Encrypt a PII value
   */
  async encryptPII(value: string | null): Promise<string | null> {
    if (!value || value.trim() === '') {
      return null;
    }

    try {
      const key = await this.getEncryptionKey();
      const encoder = new TextEncoder();
      const data = encoder.encode(value);
      
      // Generate random IV for each encryption
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      // Encrypt the data
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );
      
      // Combine IV and encrypted data
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);
      
      // Return base64 encoded result using chunk-based encoding to prevent stack overflow
      return this.arrayBufferToBase64(combined);
    } catch (error) {
      console.error('PII encryption failed:', error);
      throw new Error('Failed to encrypt PII data');
    }
  }

  /**
   * Decrypt a PII value
   */
  async decryptPII(encryptedValue: string | null): Promise<string | null> {
    if (!encryptedValue || encryptedValue.trim() === '') {
      return null;
    }

    try {
      const key = await this.getEncryptionKey();
      
      // Decode base64
      const combined = new Uint8Array(
        atob(encryptedValue).split('').map(char => char.charCodeAt(0))
      );
      
      // Extract IV and encrypted data
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);
      
      // Decrypt the data
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted
      );
      
      // Convert back to string
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error('PII decryption failed:', error);
      throw new Error('Failed to decrypt PII data');
    }
  }

  /**
   * Encrypt multiple PII fields
   */
  async encryptPIIFields(fields: PIIField[]): Promise<PIIField[]> {
    const encryptedFields: PIIField[] = [];
    
    for (const field of fields) {
      if (field.value && !field.encrypted) {
        const encrypted = await this.encryptPII(field.value);
        encryptedFields.push({
          ...field,
          value: encrypted,
          encrypted: true
        });
      } else {
        encryptedFields.push(field);
      }
    }
    
    return encryptedFields;
  }

  /**
   * Decrypt multiple PII fields
   */
  async decryptPIIFields(fields: PIIField[]): Promise<PIIField[]> {
    const decryptedFields: PIIField[] = [];
    
    for (const field of fields) {
      if (field.value && field.encrypted) {
        const decrypted = await this.decryptPII(field.value);
        decryptedFields.push({
          ...field,
          value: decrypted,
          encrypted: false
        });
      } else {
        decryptedFields.push(field);
      }
    }
    
    return decryptedFields;
  }

  /**
   * Convert ArrayBuffer to base64 using chunk-based encoding
   * Prevents stack overflow for large data (>100KB)
   */
  private arrayBufferToBase64(buffer: Uint8Array): string {
    let binary = '';
    const chunkSize = 8192; // Process in 8KB chunks
    for (let i = 0; i < buffer.length; i += chunkSize) {
      const chunk = buffer.slice(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  /**
   * Encrypt and hash audit PII (IP address, user agent)
   * Returns encrypted value, hash for lookups, and key version
   */
  async encryptAuditPII(value: string | null): Promise<{
    encrypted: string | null;
    hash: string | null;
    keyVersion: string;
  }> {
    if (!value || value.trim() === '') {
      return { encrypted: null, hash: null, keyVersion: 'v1' };
    }
    
    const encrypted = await this.encryptPII(value);
    const hash = await createContentHash(value); // Reuse existing utility
    
    return {
      encrypted,
      hash,
      keyVersion: 'v1'
    };
  }

  /**
   * Log PII access for audit trail with encryption and compliance metadata
   */
  async logPIIAccess(auditLog: PIIAuditLog): Promise<void> {
    try {
      // Encrypt and hash PII fields
      const ipData = await this.encryptAuditPII(auditLog.ipAddress);
      const uaData = await this.encryptAuditPII(auditLog.userAgent);
      
      // Calculate retention (7 years from now in milliseconds)
      // Using 7 * 365.25 days to account for leap years over 7 years (more accurate than 365 * 7)
      const retentionExpiresAt = auditLog.retentionExpiresAt || 
        Date.now() + (7 * 365.25 * 24 * 60 * 60 * 1000);
      
      // Validate required fields
      if (!auditLog.accessedBy) {
        throw new Error('accessedBy is required for PII audit logging - cannot use default value');
      }
      
      // Default values for optional fields
      const legalBasis = auditLog.legalBasis || 'legitimate_interest';
      const retentionPolicyId = auditLog.retentionPolicyId || 'default_7_year';
      
      await this.env.DB.prepare(`
        INSERT INTO pii_access_audit (
          user_id, access_type, pii_fields, access_reason, accessed_by,
          ip_address_encrypted, ip_address_hash, ip_address_key_version,
          user_agent_encrypted, user_agent_hash, user_agent_key_version,
          retention_expires_at, retention_policy_id, legal_basis,
          consent_id, consent_version, organization_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        auditLog.userId,
        auditLog.accessType,
        JSON.stringify(auditLog.piiFields),
        auditLog.accessReason || null,
        auditLog.accessedBy,
        ipData.encrypted,
        ipData.hash,
        ipData.keyVersion,
        uaData.encrypted,
        uaData.hash,
        uaData.keyVersion,
        retentionExpiresAt,
        retentionPolicyId,
        legalBasis,
        auditLog.consentId || null,
        auditLog.consentVersion || null,
        auditLog.organizationId || null
      ).run();
    } catch (error) {
      console.error('Failed to log PII access:', error);
      // Don't throw - audit logging failure shouldn't break the main operation
    }
  }

  /**
   * Get PII access audit logs for a user with backward compatibility
   */
  async getPIIAccessLogs(
    userId: string, 
    limit: number = 100,
    offset: number = 0
  ): Promise<Array<{
    id: string;
    accessType: string;
    piiFields: string[];
    accessReason?: string;
    accessedBy?: string;
    timestamp: number;
    organizationId?: string;
    retentionExpiresAt?: number;
    legalBasis?: string;
  }>> {
    try {
      const result = await this.env.DB.prepare(`
        SELECT 
          id, access_type, pii_fields, access_reason, accessed_by,
          timestamp, organization_id,
          ip_address_hash, user_agent_hash,
          retention_expires_at, consent_id, legal_basis, deleted_at
        FROM pii_access_audit 
        WHERE user_id = ? 
          AND (deleted_at IS NULL OR deleted_at > ?)
        ORDER BY timestamp DESC 
        LIMIT ? OFFSET ?
      `).bind(userId, Date.now(), limit, offset).all();
      
      return result.results?.map(row => ({
        id: row.id as string,
        accessType: row.access_type as string,
        piiFields: JSON.parse(row.pii_fields as string),
        accessReason: row.access_reason as string | undefined,
        accessedBy: row.accessed_by as string | undefined,
        timestamp: row.timestamp as number,
        organizationId: row.organization_id as string | undefined,
        // New fields (may be null if old records)
        retentionExpiresAt: row.retention_expires_at as number | undefined,
        legalBasis: row.legal_basis as string | undefined
      })) || [];
    } catch (error) {
      console.error('Failed to get PII access logs:', error);
      return [];
    }
  }

  /**
   * Check if user has given PII consent
   */
  async hasPIIConsent(userId: string): Promise<boolean> {
    try {
      const result = await this.env.DB.prepare(`
        SELECT pii_consent_given FROM users WHERE id = ?
      `).bind(userId).first();

      return Boolean(result?.pii_consent_given);
    } catch (error) {
      console.error('Failed to check PII consent:', error);
      return false;
    }
  }

  /**
   * Update PII consent for a user
   * Uses explicit switch statement to prevent SQL injection
   */
  async updatePIIConsent(
    userId: string, 
    consent: boolean,
    consentType: 'pii' | 'data_retention' | 'marketing' | 'data_processing' = 'pii'
  ): Promise<void> {
    try {
      const timestamp = Date.now();
      const value = consent ? 1 : 0;
      
      let query: string;
      switch (consentType) {
        case 'pii':
          query = 'UPDATE users SET pii_consent_given = ?, pii_consent_date = ? WHERE id = ?';
          break;
        case 'data_retention':
          query = 'UPDATE users SET data_retention_consent = ?, pii_consent_date = ? WHERE id = ?';
          break;
        case 'marketing':
          query = 'UPDATE users SET marketing_consent = ?, pii_consent_date = ? WHERE id = ?';
          break;
        case 'data_processing':
          query = 'UPDATE users SET data_processing_consent = ?, pii_consent_date = ? WHERE id = ?';
          break;
        default: {
          const exhaustiveCheck: never = consentType;
          throw new Error(`Unhandled consent type: ${exhaustiveCheck}`);
        }
      }
      
      await this.env.DB.prepare(query).bind(value, timestamp, userId).run();
    } catch (error) {
      console.error('Failed to update PII consent:', error);
      throw error;
    }
  }

  /**
   * Mark data for deletion (GDPR right to be forgotten)
   */
  async requestDataDeletion(userId: string): Promise<void> {
    try {
      const timestamp = Date.now();
      await this.env.DB.prepare(`
        UPDATE users 
        SET data_deletion_requested = 1, data_deletion_date = ?
        WHERE id = ?
      `).bind(timestamp, userId).run();
    } catch (error) {
      console.error('Failed to request data deletion:', error);
      throw error;
    }
  }

  /**
   * Get users with pending data deletion requests
   */
  async getPendingDeletionRequests(): Promise<Array<{
    id: string;
    email: string;
    dataDeletionDate: number;
  }>> {
    try {
      const result = await this.env.DB.prepare(`
        SELECT id, email, data_deletion_date
        FROM users 
        WHERE data_deletion_requested = 1 AND data_deletion_date IS NOT NULL
        ORDER BY data_deletion_date ASC
      `).all();

      return result.results?.map(row => ({
        id: row.id as string,
        email: row.email as string,
        dataDeletionDate: row.data_deletion_date as number
      })) || [];
    } catch (error) {
      console.error('Failed to get pending deletion requests:', error);
      return [];
    }
  }

  /**
   * Soft-delete expired audit logs based on retention policy
   * Should be called periodically (e.g., daily cron job)
   */
  async cleanupExpiredAuditLogs(): Promise<number> {
    try {
      const now = Date.now();
      const result = await this.env.DB.prepare(`
        UPDATE pii_access_audit 
        SET deleted_at = ? 
        WHERE retention_expires_at < ? 
          AND deleted_at IS NULL
      `).bind(now, now).run();
      
      const count = result.meta?.changes ?? 0;
      if (count > 0) {
        console.log(`✅ Soft-deleted ${count} expired PII audit logs`);
      }
      return count;
    } catch (error) {
      console.error('Failed to cleanup expired audit logs:', error);
      return 0;
    }
  }
}
