import { createHmac, timingSafeEqual } from 'node:crypto';
import { SignatureVerifierPort } from '../../domain/ports/signature-verifier.port.js';

export class NodeCryptoSignatureVerifier implements SignatureVerifierPort {
  /**
   * Signs a payload using HMAC-SHA256 according to RFC 2104.
   * Produces the standard format: sha256=<hex_digest>
   */
  public signPayload(payload: string, secret: string): string {
    const hmac = createHmac('sha256', secret);
    hmac.update(payload, 'utf8');
    const digest = hmac.digest('hex');
    return `sha256=${digest}`;
  }

  /**
   * Verifies an incoming signature against expected payload and secret.
   * Protects against timing attacks using constant-time buffer comparison.
   */
  public verify(payload: string, signature: string, secret: string): boolean {
    if (!signature || !signature.startsWith('sha256=')) {
      return false;
    }

    const expectedSignature = this.signPayload(payload, secret);

    const providedBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    // Buffers must have identical lengths for timingSafeEqual; if not, verification fails immediately
    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(providedBuffer, expectedBuffer);
  }
}