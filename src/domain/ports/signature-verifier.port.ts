export interface SignatureVerifierPort {
  /**
   * Generates an HMAC-SHA256 signature for outgoing webhook payload.
   * Format: sha256=<hex_digest>
   */
  signPayload(payload: string, secret: string): string;

  /**
   * Securely verifies an incoming webhook signature using constant-time comparison to prevent timing attacks.
   */
  verify(payload: string, signature: string, secret: string): boolean;
}