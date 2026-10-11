import { performance } from 'node:perf_hooks';
import {
  WebhookDispatcherPort,
  WebhookDispatchResult,
} from '../../domain/ports/webhook-dispatcher.port.js';

export class FetchWebhookDispatcher implements WebhookDispatcherPort {
  constructor(private readonly timeoutMs: number = 5000) {}

  public async dispatch(
    targetUrl: string,
    payload: string,
    headers: Record<string, string>
  ): Promise<WebhookDispatchResult> {
    const startTime = performance.now();

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: payload,
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      const durationMs = Math.round(performance.now() - startTime);

      let responseBodySnippet: string | undefined;
      try {
        const text = await response.text();
        responseBodySnippet = text.slice(0, 512); // Truncate to first 512 chars
      } catch {
        // Ignored if response body cannot be consumed
      }

      return {
        statusCode: response.status,
        durationMs,
        responseBodySnippet,
      };
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime);
      const errorMessage = err instanceof Error ? err.message : 'Unknown network error';

      return {
        durationMs,
        errorMessage,
      };
    }
  }
}