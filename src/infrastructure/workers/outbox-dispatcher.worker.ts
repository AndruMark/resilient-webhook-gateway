import { DispatchWebhookEventUseCase } from '../../application/use-cases/dispatch-webhook-event.use-case.js';
import { WebhookEventRepositoryPort } from '../../domain/ports/webhook-event-repository.port.js';

export interface OutboxWorkerConfig {
  readonly pollIntervalMs: number;
  readonly batchSize: number;
}

export class OutboxDispatcherWorker {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private isProcessingBatch = false;

  constructor(
    private readonly webhookEventRepo: WebhookEventRepositoryPort,
    private readonly dispatchUseCase: DispatchWebhookEventUseCase,
    private readonly config: OutboxWorkerConfig = { pollIntervalMs: 2000, batchSize: 20 }
  ) {}

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(
      `⚙️  Outbox Dispatcher Worker started (Interval: ${this.config.pollIntervalMs}ms, Batch: ${this.config.batchSize})`
    );

    this.scheduleNextTick();
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    console.log('🛑 Stopping Outbox Dispatcher Worker, waiting for active batch to finish...');

    // Wait until in-flight batch completes
    while (this.isProcessingBatch) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log('✅ Outbox Dispatcher Worker gracefully stopped.');
  }

  private scheduleNextTick(): void {
    if (!this.isRunning) return;

    this.timer = setTimeout(() => {
      void this.processBatch().finally(() => {
        this.scheduleNextTick();
      });
    }, this.config.pollIntervalMs);
  }

  public async processBatch(): Promise<number> {
    if (this.isProcessingBatch) return 0;
    this.isProcessingBatch = true;

    try {
      const now = new Date();
      const pendingEvents = await this.webhookEventRepo.findPendingEventsForDispatch(
        this.config.batchSize,
        now
      );

      if (pendingEvents.length === 0) {
        return 0;
      }

      console.log(`[Worker] Found ${pendingEvents.length} events pending dispatch. Processing...`);

      // Execute dispatches concurrently within the batch
      const results = await Promise.allSettled(
        pendingEvents.map(async (event) => {
          return this.dispatchUseCase.execute({ webhookEventId: event.id });
        })
      );

      let successCount = 0;
      let failureCount = 0;

      for (const res of results) {
        if (res.status === 'fulfilled') {
          if (res.value.status === 'DELIVERED') {
            successCount++;
          } else {
            failureCount++;
          }
        } else {
          failureCount++;
          console.error('[Worker] Unexpected error executing dispatch use case:', res.reason);
        }
      }

      console.log(
        `[Worker] Batch completed. Delivered: ${successCount}, Retrying/Dead-letter: ${failureCount}`
      );

      return pendingEvents.length;
    } catch (error) {
      console.error('[Worker] Error querying pending events from database:', error);
      return 0;
    } finally {
      this.isProcessingBatch = false;
    }
  }
}