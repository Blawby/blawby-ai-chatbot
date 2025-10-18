# Encryption Key Management

This document outlines the encryption key management strategy for PII data in the Blawby AI Chatbot system.

## Overview

The system uses AES-GCM encryption with 256-bit keys derived from environment variables using HKDF (HMAC-based Key Derivation Function). All PII data is encrypted at rest in the database, with audit trails tracking access and key versions.

## Key Versioning Scheme

### Current Version: v1
- **Format**: `v{N}` where N is the version number
- **Key Derivation**: Uses `BETTER_AUTH_SECRET` or `IDEMPOTENCY_SALT` as base material
- **Algorithm**: HKDF with SHA-256, salt: `pii-encryption-v1`, info: `audit-log-encryption`
- **Encryption**: AES-GCM with 256-bit keys

### Version History
- **v1** (Current): Initial implementation using HKDF derivation
- **v2** (Planned): Future version with improved key rotation capabilities

## Key Storage

### Environment Variables
Keys are derived from the following environment variables (in order of preference):
1. `BETTER_AUTH_SECRET` - Primary secret for authentication and encryption
2. `IDEMPOTENCY_SALT` - Fallback secret for key derivation

### Key Derivation Process
```typescript
// 1. Import base key material
const baseKey = await crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(keyMaterial),
  { name: 'HKDF' },
  false,
  ['deriveKey']
);

// 2. Derive encryption key using HKDF
const encryptionKey = await crypto.subtle.deriveKey(
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
```

## Key Rotation Strategy

### Rotation Schedule
- **Automatic Rotation**: Not currently implemented
- **Manual Rotation**: As needed for security incidents or compliance requirements
- **Planned Rotation**: Every 2 years or as required by compliance

### Rotation Process
1. **Preparation Phase**:
   - Generate new key material
   - Update environment variables in all environments
   - Deploy new key derivation logic

2. **Migration Phase**:
   - Re-encrypt existing data with new keys
   - Update key version in database records
   - Verify data integrity

3. **Cleanup Phase**:
   - Remove old key material from environment
   - Update documentation
   - Monitor for any decryption failures

### Backward Compatibility
- The system maintains backward compatibility by storing key versions with encrypted data
- During decryption, the system checks the key version and uses the appropriate key
- Old keys are retained until all data encrypted with them is migrated or expired

## Database Schema

### Key Version Tracking
The following fields track encryption metadata:

```sql
-- IP Address encryption metadata
ip_address_encrypted TEXT,        -- Encrypted IP address
ip_address_key_version TEXT,      -- Key version used (e.g., 'v1')
ip_address_hash TEXT,             -- SHA-256 hash for lookups

-- User Agent encryption metadata  
user_agent_encrypted TEXT,        -- Encrypted user agent
user_agent_key_version TEXT,      -- Key version used (e.g., 'v1')
user_agent_hash TEXT,             -- SHA-256 hash for lookups
```

### Consistency Constraints
The database enforces consistency between encrypted fields and their metadata:

```sql
CHECK ((ip_address_encrypted IS NULL AND ip_address_hash IS NULL AND ip_address_key_version IS NULL) OR
       (ip_address_encrypted IS NOT NULL AND ip_address_hash IS NOT NULL AND ip_address_key_version IS NOT NULL))
```

## Security Considerations

### Key Protection
- Keys are never stored in plaintext
- Key derivation uses cryptographically secure random salts
- Environment variables containing key material should be:
  - Rotated regularly
  - Stored securely (e.g., in secure key management systems)
  - Not logged or exposed in error messages

### Access Control
- Only authorized services can access encryption keys
- Audit logs track all PII access with encrypted metadata
- Key access is logged and monitored

### Compliance
- Encryption meets GDPR requirements for data protection
- Key management follows industry best practices
- Audit trails provide compliance documentation

## Operational Procedures

### Key Rotation Checklist
- [ ] Generate new key material
- [ ] Update environment variables in all environments
- [ ] Deploy new key derivation logic
- [ ] Re-encrypt existing data
- [ ] Verify data integrity
- [ ] Update key versions in database
- [ ] Test decryption with old and new keys
- [ ] Remove old key material
- [ ] Update documentation
- [ ] Monitor for issues

### Emergency Procedures
- **Key Compromise**: Immediately rotate keys and re-encrypt all data
- **Decryption Failure**: Check key versions and ensure correct key is available
- **Data Corruption**: Restore from backup and verify key integrity

## Monitoring and Alerting

### Key Metrics
- Encryption/decryption success rates
- Key version distribution in database
- Failed decryption attempts
- Key rotation completion status

### Alerts
- Failed decryption attempts
- Missing key versions
- Key rotation failures
- Unusual encryption patterns

## Future Improvements

### Planned Enhancements
1. **Automatic Key Rotation**: Implement scheduled key rotation
2. **Hardware Security Modules**: Use HSM for key storage
3. **Key Escrow**: Implement key recovery mechanisms
4. **Performance Optimization**: Cache derived keys for better performance
5. **Multi-tenant Keys**: Separate keys per organization for enhanced security

### Version 2 Features
- Improved key rotation automation
- Enhanced audit logging
- Better error handling and recovery
- Performance optimizations
