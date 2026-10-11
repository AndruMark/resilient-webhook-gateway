export interface WebhookDispatchResult {
  readonly statusCode?: number;
  readonly durationMs: number;
  readonly responseBodySnippet?: string;
  readonly errorMessage?: string;
}

export interface WebhookDispatcherPort {
  /**
   * Dispatches an HTTP POST request to a target subscriber endpoint.
   * Must handle timeouts, DNS failures, and TLS handshakes gracefully without throwing uncaught exceptions.
   */
  dispatch(
    targetUrl: string,
    payload: string,
    headers: Record<string, string>
  ): Promise<WebhookDispatchResult>;
}