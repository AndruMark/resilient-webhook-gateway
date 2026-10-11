import { FastifyReply, FastifyRequest } from 'fastify';
import { IngestWebhookEventUseCase } from '../../../application/use-cases/ingest-webhook-event.use-case.js';

export class EventController {
  constructor(private readonly ingestUseCase: IngestWebhookEventUseCase) {}

  public async ingest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const result = await this.ingestUseCase.execute({
      rawPayload: request.body,
    });

    // HTTP 202 Accepted represents standard asynchronous intake for event outbox
    await reply.status(202).send(result);
  }
}