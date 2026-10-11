import { describe, it, expect } from 'vitest';
import { NodeCryptoSignatureVerifier } from '../../src/infrastructure/crypto/node-crypto-signature-verifier.js';

describe('NodeCryptoSignatureVerifier (RFC 2104 HMAC-SHA256)', () => {
  const verifier = new NodeCryptoSignatureVerifier();
  const secret = 'prod_super_secret_webhook_signing_key_456';
  const payload = JSON.stringify({ event: 'order.completed', amount: 1200 });

  it('should generate a signature prefixed with sha256= followed by a 64-character hex string', () => {
    const signature = verifier.signPayload(payload, secret);
    expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('should return true when validating a legitimate signature and payload', () => {
    const signature = verifier.signPayload(payload, secret);
    const isValid = verifier.verify(payload, signature, secret);
    expect(isValid).toBe(true);
  });

  it('should return false if payload was tampered with (data integrity check)', () => {
    const signature = verifier.signPayload(payload, secret);
    const tamperedPayload = JSON.stringify({ event: 'order.completed', amount: 999999 });

    const isValid = verifier.verify(tamperedPayload, signature, secret);
    expect(isValid).toBe(false);
  });

  it('should return false if signature format or secret is incorrect', () => {
    const signature = verifier.signPayload(payload, secret);
    const wrongSecret = 'different_secret';

    expect(verifier.verify(payload, signature, wrongSecret)).toBe(false);
    expect(verifier.verify(payload, 'invalid_format_sig', secret)).toBe(false);
  });
});